// VP-2581 (BE-18) — Distribution Center integration tests.
//
// Exercises the destination GraphQL surface end-to-end against a live core-graphql-server: the seeded
// DestinationType catalog, the Destination CRUD + OAuth lifecycle (createDestination -> PENDING_OAUTH,
// completeDestinationConnection -> CONNECTED, update, delete), and distributeAsset -> Job.
//
// AYRSHARE: createDestination / completeDestinationConnection / update-title-sync / delete-detach call the
// Ayrshare adapter, which hits an HTTP API. Since citest runs against a server in a SEPARATE process, we cannot
// mock those calls in-process; instead the run boots the server-under-test with AYRSHARE_BASE_URL pointed at an
// out-of-process mock (see citest/helpers/ayrshareMock.js — the legacy Jest harness auto-starts it from
// jest.global.setup.js when AYRSHARE_MOCK is set; this bun harness has no equivalent auto-start yet, so the mock
// must be started separately for the mock-gated blocks below to actually pass). The mock-dependent tests
// self-skip (describeif/itif) when AYRSHARE_MOCK is not set, so this file is safe to run in any environment: the
// seeded-catalog reads and the pre-vendor guard/not-found negatives always run.
//
// distributeAsset itself makes NO Ayrshare call (the Go engine does), but reaching its happy path needs a
// CONNECTED destination — which requires the mock — so the full distribute happy path is mock-gated too. Its
// single-asset guard and the not-found paths run everywhere.
//
// PREREQ to run the mock-backed paths (mirrors the Mailpit pattern used by the orgInvite suite):
//   1) boot the server-under-test pointed at the mock + dummy creds:
//        - host server:       AYRSHARE_BASE_URL=http://localhost:8790
//        - dockerized server: AYRSHARE_BASE_URL=http://host.docker.internal:8790
//        (+ AYRSHARE_API_KEY=dummy AYRSHARE_PRIVATE_KEY=dummy AYRSHARE_DOMAIN=dummy)
//   2) separately start citest/helpers/ayrshareMock.js's startAyrshareMock() (AYRSHARE_MOCK_PORT, default 8790)
//      and run this spec with AYRSHARE_MOCK=1 so the mock-gated blocks below execute instead of self-skipping.
//
// HOW TO RUN against a dockerized server-under-test (e.g. `local.yml`): plain `host.docker.internal` does NOT
// resolve inside the container on Linux Docker without an `extra_hosts` entry, so step 1 above needs a compose
// override rather than a bare env var. From the repo root:
//   docker compose -f local.yml -f local-ayrshare-override.yml up -d            # full stack
//   docker compose -f local.yml -f local-ayrshare-override.yml up -d graphql    # or just recreate graphql
//   cd services/api/core-graphql-server && AYRSHARE_MOCK=1 npm run citest ./citest/tools/graphql-api/test/destination/
// See local-ayrshare-override.yml (repo root) and citest/README.md for details.

import { v4 as uuidv4 } from 'uuid';

import {
  AuthType,
  GraphqlClient,
  createGraphqlClient
} from '../../src/graphqlUtil';
import { helpers } from '../../src/helpers';
import { safe } from '../../src/helpers/commonHelper';

const env = helpers.config.env.toLowerCase();
const citestMarker = (globalThis as any).citestMarker ?? 'citest-should-delete';

// Mirrors MOCK_CONNECTED_LABEL in citest/helpers/ayrshareMock.js (the mock reports this as the
// connected-account displayName for a completed OAuth handshake).
const MOCK_CONNECTED_LABEL = '@citest-mock-channel';

// Mock-backed paths run only when the Ayrshare mock is enabled (AYRSHARE_MOCK=1) AND something has separately
// started citest/helpers/ayrshareMock.js pointed at the server-under-test's AYRSHARE_BASE_URL. The toggle is
// decoupled from AYRSHARE_BASE_URL because the citest side and the server side use different hostnames for the
// same mock in docker.
const mockEnabled =
  process.env.AYRSHARE_MOCK === '1' || process.env.AYRSHARE_MOCK === 'true';
console.log('run test with AYRSHARE_MOCK enabled =', mockEnabled);
const itif = (condition: boolean, ...args: any[]) =>
  condition ? it(...args) : it.skip(...args);
const describeif = (condition: boolean, ...args: any[]) =>
  condition ? describe(...args) : describe.skip(...args);

// Seeded catalog ids (Flyway V3_291/V3_292 + structured_data V1_13). Hardcoded identically across dev/stage/prod.
const SEEDED = {
  destinationTypeId: 'c42be8c9-a848-4bc7-b461-5001dc342232',
  engineId: '16568b5f-2aaa-48e6-975b-2dec5f098a29',
  configSchemaId: 'd78e9ed7-597e-41ae-b5e9-665b18c71f15',
  publishSchemaId: '34fb89b9-cf59-4ca2-bc9c-bf19f8af5216',
  platform: 'youtube',
  vendorCapability: 'social-publish'
};

// Social platforms seeded append-only in V3_295 (destination_type) + V1_14 (schemas). All reuse the SAME shared
// generic Ayrshare engine UUID as YouTube — engine_id is intentionally NOT unique across types (VE-24797).
// Names carry no vendor suffix: V3_303 dropped the "(Ayrshare)" suffix these rows were originally seeded with,
// because the DMH UI surfaces destination_type.name directly and the vendor is an implementation detail.
const SEEDED_SOCIAL = [
  {
    name: 'Facebook',
    platform: 'facebook',
    destinationTypeId: 'dcadf81c-9127-4db8-978d-2cf3b0109187',
    configSchemaId: 'bc6be380-c667-40c1-a554-514a84c3f5bd',
    publishSchemaId: '207b39ef-acc8-4cb0-ab91-bd447853c5aa'
  },
  {
    name: 'Instagram',
    platform: 'instagram',
    destinationTypeId: 'b0cc0c8e-409b-44d5-9d0f-389144aa53e0',
    configSchemaId: '2ce68a43-cde7-4dec-8ef1-1df0282e213f',
    publishSchemaId: 'd9766799-427d-4930-afac-f3dc9b744909'
  },
  {
    name: 'TikTok',
    platform: 'tiktok',
    destinationTypeId: '255f1b92-1ce6-494d-b601-1fa6cae36cec',
    configSchemaId: 'fb1ac425-d872-4aee-9270-7c759c7a4bf1',
    publishSchemaId: 'a1fa8bce-40b8-4020-b851-02b22ef8d4f9'
  }
];

describe('citest_destination: VP-2581 Distribution Center — destinations (BE-18)', () => {
  let client: GraphqlClient;
  const createdDestinationIds: string[] = [];
  const createdTdoIds: string[] = [];

  const createDestination = (input: Record<string, unknown>) =>
    client.sdk.createDestination({ input } as any);

  const getDestination = (id: string) => client.sdk.destination({ id });

  beforeAll(async () => {
    client = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
  });

  afterAll(async () => {
    // Best-effort cleanup: soft-delete destinations (also detaches the mock profile) and delete TDOs.
    for (const id of createdDestinationIds) {
      await safe(`delete destination ${id}`, () =>
        client.sdk.deleteDestination({ id })
      );
    }
    for (const id of createdTdoIds) {
      await safe(`delete TDO ${id}`, () => client.sdk.deleteTDO({ id }));
    }
  });

  // ----- Seeded DestinationType catalog (no vendor needed) -----

  describe('destinationTypes catalog', () => {
    it('exposes the seeded "YouTube" DestinationType with its schemas + engine ref', async () => {
      const result = await client.sdk.destinationTypes();
      const types = result?.data?.destinationTypes;
      expect(Array.isArray(types)).toBe(true);

      const youtube = types.find((t: any) => t.id === SEEDED.destinationTypeId);
      expect(youtube).toBeDefined();
      expect(youtube?.name).toEqual('YouTube');
      expect(youtube?.platform).toEqual(SEEDED.platform);
      expect(youtube?.vendorCapability).toEqual(SEEDED.vendorCapability);
      expect(youtube?.engineId).toEqual(SEEDED.engineId);
      expect(youtube?.isPublic).toBe(true);
      // Schemas are resolved by the field resolver from a different DB connection (structured_data).
      expect(youtube?.configSchema?.id).toEqual(SEEDED.configSchemaId);
      expect(youtube?.publishSchema?.id).toEqual(SEEDED.publishSchemaId);
    });

    it('returns the seeded type by id via destinationType(id)', async () => {
      const result = await client.sdk.destinationType({
        id: SEEDED.destinationTypeId
      });
      expect(result?.data?.destinationType?.id).toEqual(
        SEEDED.destinationTypeId
      );
      expect(result?.data?.destinationType?.platform).toEqual(SEEDED.platform);
    });

    it('filters the catalog by platform + vendorCapability', async () => {
      const result = await client.sdk.destinationTypes({
        platform: SEEDED.platform,
        vendorCapability: SEEDED.vendorCapability
      });
      const types = result?.data?.destinationTypes;
      expect(types.length).toBeGreaterThan(0);
      types.forEach((t: any) => {
        expect(t.platform).toEqual(SEEDED.platform);
        expect(t.vendorCapability).toEqual(SEEDED.vendorCapability);
      });
    });

    it('exposes the seeded Facebook / Instagram / TikTok types — all sharing the one engine + with resolvable schemas', async () => {
      // Validates the append-only seeds (V3_295 destination_type + V1_14 schemas) and the shared-engine design:
      // every social type reuses the SAME engine_id (the engine_id unique index was dropped in V3_294), and each
      // type's config/publish schema resolves from the structured_data DB via the field resolver.
      const result = await client.sdk.destinationTypes();
      const types = result?.data?.destinationTypes;
      expect(Array.isArray(types)).toBe(true);

      SEEDED_SOCIAL.forEach((s) => {
        const t = types.find((x: any) => x.id === s.destinationTypeId);
        expect(t).toBeDefined();
        expect(t?.name).toEqual(s.name);
        expect(t?.platform).toEqual(s.platform);
        expect(t?.vendorCapability).toEqual('social-publish');
        expect(t?.isPublic).toBe(true);
        // Shared generic Ayrshare distribute engine — same UUID as YouTube (VE-24797; engine_id not unique).
        expect(t?.engineId).toEqual(SEEDED.engineId);
        // Schemas resolve from a different DB connection (structured_data), seeded in V1_14.
        expect(t?.configSchema?.id).toEqual(s.configSchemaId);
        expect(t?.publishSchema?.id).toEqual(s.publishSchemaId);
      });
    });
  });

  // ----- Guard + not-found paths that throw BEFORE any Ayrshare call (no vendor needed) -----

  describe('validation + org-scoping (no vendor call reached)', () => {
    it('destination(id) returns null for a non-existent id', async () => {
      const result = await getDestination(uuidv4());
      expect(result?.data?.destination).toBeNull();
    });

    it('distributeAsset rejects more than one TDO id before touching the destination', async () => {
      // The single-asset guard runs first, so a throwaway destinationId is fine.
      const promise = client.sdk.distributeAsset({
        input: {
          tdoIds: [uuidv4(), uuidv4()],
          destinationId: uuidv4(),
          platformPayload: { title: 'x' }
        }
      });
      await expect(promise).rejects.toThrow(
        /exactly one TDO id|length must be 1/
      );
    });

    it('updateDestination on a non-existent destination errors (loadOwnedDestination NotFound)', async () => {
      const promise = client.sdk.updateDestination({
        input: { id: uuidv4(), label: 'nope' }
      });
      await expect(promise).rejects.toThrow();
    });

    it('deleteDestination on a non-existent destination errors', async () => {
      const promise = client.sdk.deleteDestination({ id: uuidv4() });
      await expect(promise).rejects.toThrow();
    });

    it('completeDestinationConnection on a non-existent destination errors', async () => {
      const promise = client.sdk.completeDestinationConnection({
        input: { id: uuidv4() }
      });
      await expect(promise).rejects.toThrow();
    });
  });

  // ----- Full CRUD + OAuth + distribute lifecycle (needs the Ayrshare mock) -----

  describeif(mockEnabled, 'destination lifecycle (Ayrshare mock)', () => {
    let destinationId: string;

    it('createDestination mints a profile + connect URL and persists PENDING_OAUTH', async () => {
      const result = await createDestination({
        destinationTypeId: SEEDED.destinationTypeId,
        label: `${citestMarker}-yt-${Date.now()}`,
        details: {} // configSchema is additionalProperties:false — must be empty
      });
      const dest = result?.data?.createDestination;
      expect(dest).toBeDefined();
      expect(dest.id).toBeDefined();
      expect(dest.status).toEqual('PENDING_OAUTH');
      expect(dest.destinationTypeId).toEqual(SEEDED.destinationTypeId);
      // getConnectUrl (mock) returns a hosted OAuth URL while pending.
      expect(dest.oauthUrl).toEqual(
        'https://profile.ayrshare.com/citest-mock-connect'
      );

      destinationId = dest.id;
      createdDestinationIds.push(destinationId);
    });

    it('lists the new destination and reads it back by id', async () => {
      const list = await client.sdk.destinations();
      expect(
        (list?.data?.destinations ?? []).some(
          (d: any) => d.id === destinationId
        )
      ).toBe(true);

      const single = await getDestination(destinationId);
      expect(single?.data?.destination?.status).toEqual('PENDING_OAUTH');
    });

    it('completeDestinationConnection flips PENDING_OAUTH -> CONNECTED and clears the connect URL', async () => {
      const result = await client.sdk.completeDestinationConnection({
        input: { id: destinationId }
      });
      const dest = result?.data?.completeDestinationConnection;
      expect(dest.status).toEqual('CONNECTED');
      expect(dest.platformAccountLabel).toEqual(MOCK_CONNECTED_LABEL);
      expect(dest.oauthUrl).toBeNull();
    });

    it('updateDestination changes the label', async () => {
      const newLabel = `${citestMarker}-yt-renamed-${Date.now()}`;
      const result = await client.sdk.updateDestination({
        input: { id: destinationId, label: newLabel }
      });
      expect(result?.data?.updateDestination?.label).toEqual(newLabel);
    });

    it('distributeAsset validates + routes to a Job on the distribute engine (Job returned when the engine is deployed)', async () => {
      const tdoResult = await client.sdk.createTDO({
        input: {
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726655
        }
      });
      const tdoId = tdoResult?.data?.createTDO?.id;
      expect(tdoId).toBeDefined();
      createdTdoIds.push(tdoId!);

      // distributeAsset runs its own validation (single-asset, CONNECTED, publishSchema, org-owned TDO) and then
      // calls createJob targeting destinationType.engineId. Whether a Job is actually created depends on the
      // distribute engine having an ACTIVE DEPLOYED BUILD in this environment — true on stage (ENG-04), not on a
      // bare local stack. So accept BOTH outcomes: a returned Job (engine deployed) OR the specific "no deployed
      // build for engine <seeded UUID>" error, which still proves the resolver passed all its checks and routed to
      // the correct engine. Any OTHER error is a real failure. (The live post path is INT-01.)
      try {
        const result = await client.sdk.distributeAsset({
          input: {
            tdoIds: [tdoId!],
            destinationId,
            platformPayload: { title: `${citestMarker} distribute` }
          }
        });
        const job = result?.data?.distributeAsset;
        expect(job).toBeDefined();
        expect(job.id).toBeDefined();
      } catch (err) {
        const errs = helpers.getErrorsFromGraphqlResponse(err) as Array<{
          message: string;
        }>;
        const msg = errs?.[0]?.message ?? String(err);
        // Must be the engine-not-deployed case for the SEEDED engine UUID — not a resolver-validation failure.
        expect(msg).toMatch(
          /deployed build for engine 16568b5f-2aaa-48e6-975b-2dec5f098a29/i
        );
      }
    });

    it('deleteDestination soft-deletes the row; the destination then reads back as null', async () => {
      const del = await client.sdk.deleteDestination({
        id: destinationId
      });
      expect(del?.data?.deleteDestination?.id).toEqual(destinationId);

      const after = await getDestination(destinationId);
      expect(after?.data?.destination).toBeNull();

      // already gone — skip afterAll re-delete
      const idx = createdDestinationIds.indexOf(destinationId);
      if (idx >= 0) {
        createdDestinationIds.splice(idx, 1);
      }
    });
  });

  // ----- Validation negatives that require a created/CONNECTED destination (mock-gated) -----

  describeif(mockEnabled, 'server-side validation (Ayrshare mock)', () => {
    it('createDestination rejects details that violate the configSchema (additionalProperties:false)', async () => {
      const promise = createDestination({
        destinationTypeId: SEEDED.destinationTypeId,
        label: `${citestMarker}-bad-details-${Date.now()}`,
        details: { unexpectedField: 'bar' }
      });
      await expect(promise).rejects.toThrow();
    });

    it('distributeAsset rejects a platformPayload missing the required title', async () => {
      // Stand up a CONNECTED destination to get past the earlier guards, then send an invalid payload.
      const created = await createDestination({
        destinationTypeId: SEEDED.destinationTypeId,
        label: `${citestMarker}-badpayload-${Date.now()}`,
        details: {}
      });
      const id = created?.data?.createDestination?.id;
      createdDestinationIds.push(id);
      await client.sdk.completeDestinationConnection({
        input: { id }
      });

      const tdoResult = await client.sdk.createTDO({
        input: {
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726655
        }
      });
      const tdoId = tdoResult?.data?.createTDO?.id;
      createdTdoIds.push(tdoId!);

      const promise = client.sdk.distributeAsset({
        input: {
          tdoIds: [tdoId!],
          destinationId: id,
          platformPayload: { description: 'no title' }
        }
      });
      await expect(promise).rejects.toThrow();
    });

    it('distributeAsset rejects a destination that is not CONNECTED', async () => {
      const created = await createDestination({
        destinationTypeId: SEEDED.destinationTypeId,
        label: `${citestMarker}-pending-${Date.now()}`,
        details: {}
      });
      const id = created?.data?.createDestination?.id; // left PENDING_OAUTH
      createdDestinationIds.push(id);

      const tdoResult = await client.sdk.createTDO({
        input: {
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726655
        }
      });
      const tdoId = tdoResult?.data?.createTDO?.id;
      createdTdoIds.push(tdoId!);

      const promise = client.sdk.distributeAsset({
        input: {
          tdoIds: [tdoId!],
          destinationId: id,
          platformPayload: { title: 'x' }
        }
      });
      await expect(promise).rejects.toThrow(/not connected|PENDING/);
    });
  });

  // Surface a clear note when the vendor-backed paths were skipped, so a green run isn't mistaken for full coverage.
  itif(
    !mockEnabled,
    'NOTE: Ayrshare-backed lifecycle skipped (run with AYRSHARE_MOCK=1 + server on AYRSHARE_BASE_URL to enable)',
    () => {
      expect(mockEnabled).toBe(false);
    }
  );
});
