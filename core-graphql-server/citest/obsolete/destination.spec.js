// VP-2581 (BE-18) — Distribution Center integration tests.
//
// Exercises the destination GraphQL surface end-to-end against a live core-graphql-server: the seeded
// DestinationType catalog, the Destination CRUD + OAuth lifecycle (createDestination -> PENDING_OAUTH,
// completeDestinationConnection -> CONNECTED, update, delete), and distributeAsset -> Job.
//
// AYRSHARE: createDestination / completeDestinationConnection / update-title-sync / delete-detach call the
// Ayrshare adapter, which hits an HTTP API. Since citest runs against a server in a SEPARATE process, we cannot
// jest.mock() those calls; instead the run boots the server-under-test with AYRSHARE_BASE_URL pointed at the
// in-process mock started in jest.global.setup.js (see citest/helpers/ayrshareMock.js). The mock-dependent tests
// self-skip (describeif/itif) when AYRSHARE_BASE_URL is not a localhost URL, so this file is safe to run in any
// environment: the seeded-catalog reads and the pre-vendor guard/not-found negatives always run.
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
//   2) run citest with AYRSHARE_MOCK=1 (optional AYRSHARE_MOCK_PORT, default 8790) so the mock binds 0.0.0.0:8790.

const _ = require('lodash');
const uuid = require('uuid');
const GraphqlClient = require('../helpers/gql.js');
const { config, requestOptions, getErrorsFromGraphqlResponse } = require('../helpers/index');
const { safe } = require('../helpers/cleanup/utils.js');
const { MOCK_CONNECTED_LABEL } = require('../helpers/ayrshareMock.js');

const env = process.env.TESTS_ENV || config.env;

// Mock-backed paths run only when the Ayrshare mock is enabled (AYRSHARE_MOCK=1) AND the server-under-test was
// booted with a matching AYRSHARE_BASE_URL (localhost:8790 for a host server, host.docker.internal:8790 for a
// dockerized one). The toggle is decoupled from AYRSHARE_BASE_URL because the citest side and the server side use
// different hostnames for the same mock in docker.
const mockEnabled = process.env.AYRSHARE_MOCK === '1' || process.env.AYRSHARE_MOCK === 'true';

const itif = (condition, ...args) => (condition ? it(...args) : it.skip(...args));
const describeif = (condition, ...args) => (condition ? describe(...args) : describe.skip(...args));

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

const citestMarker = global.citestMarker || 'citest-should-delete';

describe('citest_destination: VP-2581 Distribution Center — destinations (BE-18)', () => {
  const gqlClient = new GraphqlClient(env);
  const createdDestinationIds = [];
  const createdTdoIds = [];

  const createDestination = (input) =>
    gqlClient.query(
      `mutation($input: CreateDestinationInput!) {
        createDestination(input: $input) { id status label destinationTypeId oauthUrl }
      }`,
      { input }
    );

  const getDestination = (id) =>
    gqlClient.query(`query($id: ID!) { destination(id: $id) { id status label platformAccountLabel } }`, { id });

  // Authenticate. Prefer the standard REST signin (works in CI); fall back to the @noAuth `userLogin` GraphQL
  // mutation, which runs on the published graphql server and reaches core-admin over the internal docker network —
  // the path that works locally when core-admin is NOT host-published (e.g. :9000 unexposed in docker-compose).
  async function login() {
    try {
      const r = await gqlClient.connect();
      if (r && r.token) return 'rest';
    } catch (err) {
      /* fall through to GraphQL userLogin */
    }
    const noAuth = {
      headers: {
        'Content-Type': 'application/json',
        Accept: '*/*',
        'User-Agent': 'core-graphql citest VP-2581',
        'Veritone-Correlation-ID': uuid.v4(),
        'X-Veritone-Application': 'GraphQL-CI-Test'
      }
    };
    const res = await gqlClient.query(
      `mutation($input: UserLogin) { userLogin(input: $input) { token apiToken } }`,
      { input: { userName: config.userName, password: config.password } },
      noAuth
    );
    const info = _.get(res, 'userLogin');
    if (!info || !info.token) {
      throw new Error('userLogin returned no token; cannot authenticate citest');
    }
    gqlClient.userToken = info.token;
    gqlClient.userAuth = requestOptions(info.token);
    gqlClient.tokenAuth = requestOptions(info.apiToken || info.token);
    return 'graphql';
  }

  beforeAll(async () => {
    await login();
  });

  afterAll(async () => {
    // Best-effort cleanup: soft-delete destinations (also detaches the mock profile) and delete TDOs.
    for (const id of createdDestinationIds) {
      await safe(`delete destination ${id}`, async () => {
        await gqlClient.query(`mutation($id: ID!) { deleteDestination(id: $id) { id } }`, { id });
      });
    }
    for (const id of createdTdoIds) {
      await safe(`delete TDO ${id}`, async () => {
        await gqlClient.query(`mutation($id: ID!) { deleteTDO(id: $id) { id } }`, { id });
      });
    }
  });

  // ----- Seeded DestinationType catalog (no vendor needed) -----

  describe('destinationTypes catalog', () => {
    it('exposes the seeded "YouTube" DestinationType with its schemas + engine ref', async () => {
      const result = await gqlClient.query(`query {
        destinationTypes {
          id name platform vendorCapability iconClass engineId isPublic
          configSchema { id } publishSchema { id } engine { id }
        }
      }`);
      const types = _.get(result, 'destinationTypes');
      expect(Array.isArray(types)).toBe(true);

      const youtube = _.find(types, (t) => t.id === SEEDED.destinationTypeId);
      expect(youtube).toBeDefined();
      expect(youtube.name).toEqual('YouTube');
      expect(youtube.platform).toEqual(SEEDED.platform);
      expect(youtube.vendorCapability).toEqual(SEEDED.vendorCapability);
      expect(youtube.engineId).toEqual(SEEDED.engineId);
      expect(youtube.isPublic).toBe(true);
      // Schemas are resolved by the field resolver from a different DB connection (structured_data).
      expect(_.get(youtube, 'configSchema.id')).toEqual(SEEDED.configSchemaId);
      expect(_.get(youtube, 'publishSchema.id')).toEqual(SEEDED.publishSchemaId);
    });

    it('returns the seeded type by id via destinationType(id)', async () => {
      const result = await gqlClient.query(
        `query($id: ID!) { destinationType(id: $id) { id name platform engineId } }`,
        { id: SEEDED.destinationTypeId }
      );
      expect(_.get(result, 'destinationType.id')).toEqual(SEEDED.destinationTypeId);
      expect(_.get(result, 'destinationType.platform')).toEqual(SEEDED.platform);
    });

    it('filters the catalog by platform + vendorCapability', async () => {
      const result = await gqlClient.query(
        `query($p: String, $c: String) { destinationTypes(platform: $p, vendorCapability: $c) { id platform vendorCapability } }`,
        { p: SEEDED.platform, c: SEEDED.vendorCapability }
      );
      const types = _.get(result, 'destinationTypes');
      expect(types.length).toBeGreaterThan(0);
      types.forEach((t) => {
        expect(t.platform).toEqual(SEEDED.platform);
        expect(t.vendorCapability).toEqual(SEEDED.vendorCapability);
      });
    });

    it('exposes the seeded Facebook / Instagram / TikTok types — all sharing the one engine + with resolvable schemas', async () => {
      // Validates the append-only seeds (V3_295 destination_type + V1_14 schemas) and the shared-engine design:
      // every social type reuses the SAME engine_id (the engine_id unique index was dropped in V3_294), and each
      // type's config/publish schema resolves from the structured_data DB via the field resolver.
      const result = await gqlClient.query(`query {
        destinationTypes {
          id name platform vendorCapability engineId isPublic
          configSchema { id } publishSchema { id }
        }
      }`);
      const types = _.get(result, 'destinationTypes');
      expect(Array.isArray(types)).toBe(true);

      SEEDED_SOCIAL.forEach((s) => {
        const t = _.find(types, (x) => x.id === s.destinationTypeId);
        expect(t, `seeded ${s.platform} destinationType not found in catalog`).toBeDefined();
        expect(t.name).toEqual(s.name);
        expect(t.platform).toEqual(s.platform);
        expect(t.vendorCapability).toEqual('social-publish');
        expect(t.isPublic).toBe(true);
        // Shared generic Ayrshare distribute engine — same UUID as YouTube (VE-24797; engine_id not unique).
        expect(t.engineId).toEqual(SEEDED.engineId);
        // Schemas resolve from a different DB connection (structured_data), seeded in V1_14.
        expect(_.get(t, 'configSchema.id')).toEqual(s.configSchemaId);
        expect(_.get(t, 'publishSchema.id')).toEqual(s.publishSchemaId);
      });
    });
  });

  // ----- Guard + not-found paths that throw BEFORE any Ayrshare call (no vendor needed) -----

  describe('validation + org-scoping (no vendor call reached)', () => {
    it('destination(id) returns null for a non-existent id', async () => {
      const result = await getDestination(uuid.v4());
      expect(_.get(result, 'destination')).toBeNull();
    });

    it('distributeAsset rejects more than one TDO id before touching the destination', async () => {
      // The single-asset guard runs first, so a throwaway destinationId is fine.
      const promise = gqlClient.query(
        `mutation($input: DistributeAssetInput!) { distributeAsset(input: $input) { id } }`,
        { input: { tdoIds: [uuid.v4(), uuid.v4()], destinationId: uuid.v4(), platformPayload: { title: 'x' } } }
      );
      await expect(promise).rejects.toThrow(/exactly one TDO id|length must be 1/);
    });

    it('updateDestination on a non-existent destination errors (loadOwnedDestination NotFound)', async () => {
      const promise = gqlClient.query(
        `mutation($input: UpdateDestinationInput!) { updateDestination(input: $input) { id } }`,
        { input: { id: uuid.v4(), label: 'nope' } }
      );
      await expect(promise).rejects.toThrow();
    });

    it('deleteDestination on a non-existent destination errors', async () => {
      const promise = gqlClient.query(`mutation($id: ID!) { deleteDestination(id: $id) { id } }`, {
        id: uuid.v4()
      });
      await expect(promise).rejects.toThrow();
    });

    it('completeDestinationConnection on a non-existent destination errors', async () => {
      const promise = gqlClient.query(
        `mutation($input: CompleteDestinationConnectionInput!) { completeDestinationConnection(input: $input) { id } }`,
        { input: { id: uuid.v4() } }
      );
      await expect(promise).rejects.toThrow();
    });
  });

  // ----- Full CRUD + OAuth + distribute lifecycle (needs the Ayrshare mock) -----

  describeif(mockEnabled, 'destination lifecycle (Ayrshare mock)', () => {
    let destinationId;

    it('createDestination mints a profile + connect URL and persists PENDING_OAUTH', async () => {
      const result = await createDestination({
        destinationTypeId: SEEDED.destinationTypeId,
        label: `${citestMarker}-yt-${Date.now()}`,
        details: {} // configSchema is additionalProperties:false — must be empty
      });
      const dest = _.get(result, 'createDestination');
      expect(dest).toBeDefined();
      expect(dest.id).toBeDefined();
      expect(dest.status).toEqual('PENDING_OAUTH');
      expect(dest.destinationTypeId).toEqual(SEEDED.destinationTypeId);
      // getConnectUrl (mock) returns a hosted OAuth URL while pending.
      expect(dest.oauthUrl).toEqual('https://profile.ayrshare.com/citest-mock-connect');

      destinationId = dest.id;
      createdDestinationIds.push(destinationId);
    });

    it('lists the new destination and reads it back by id', async () => {
      const list = await gqlClient.query(`query { destinations { id status } }`);
      expect(_.some(_.get(list, 'destinations'), (d) => d.id === destinationId)).toBe(true);

      const single = await getDestination(destinationId);
      expect(_.get(single, 'destination.status')).toEqual('PENDING_OAUTH');
    });

    it('completeDestinationConnection flips PENDING_OAUTH -> CONNECTED and clears the connect URL', async () => {
      const result = await gqlClient.query(
        `mutation($input: CompleteDestinationConnectionInput!) {
          completeDestinationConnection(input: $input) { id status platformAccountLabel oauthUrl }
        }`,
        { input: { id: destinationId } }
      );
      const dest = _.get(result, 'completeDestinationConnection');
      expect(dest.status).toEqual('CONNECTED');
      expect(dest.platformAccountLabel).toEqual(MOCK_CONNECTED_LABEL);
      expect(dest.oauthUrl).toBeNull();
    });

    it('updateDestination changes the label', async () => {
      const newLabel = `${citestMarker}-yt-renamed-${Date.now()}`;
      const result = await gqlClient.query(
        `mutation($input: UpdateDestinationInput!) { updateDestination(input: $input) { id label } }`,
        { input: { id: destinationId, label: newLabel } }
      );
      expect(_.get(result, 'updateDestination.label')).toEqual(newLabel);
    });

    it('distributeAsset validates + routes to a Job on the distribute engine (Job returned when the engine is deployed)', async () => {
      const tdo = await gqlClient.query(
        `mutation { createTDO(input: { status: "uploaded", startDateTime: 1476726655, stopDateTime: 1476726655 }) { id } }`
      );
      const tdoId = _.get(tdo, 'createTDO.id');
      expect(tdoId).toBeDefined();
      createdTdoIds.push(tdoId);

      // distributeAsset runs its own validation (single-asset, CONNECTED, publishSchema, org-owned TDO) and then
      // calls createJob targeting destinationType.engineId. Whether a Job is actually created depends on the
      // distribute engine having an ACTIVE DEPLOYED BUILD in this environment — true on stage (ENG-04), not on a
      // bare local stack. So accept BOTH outcomes: a returned Job (engine deployed) OR the specific "no deployed
      // build for engine <seeded UUID>" error, which still proves the resolver passed all its checks and routed to
      // the correct engine. Any OTHER error is a real failure. (The live post path is INT-01.)
      try {
        const result = await gqlClient.query(
          `mutation($input: DistributeAssetInput!) { distributeAsset(input: $input) { id status } }`,
          {
            input: {
              tdoIds: [tdoId],
              destinationId,
              platformPayload: { title: `${citestMarker} distribute` }
            }
          }
        );
        const job = _.get(result, 'distributeAsset');
        expect(job).toBeDefined();
        expect(job.id).toBeDefined();
      } catch (err) {
        const errs = getErrorsFromGraphqlResponse(err) || [];
        const msg = _.get(errs, '[0].message', String(err));
        // Must be the engine-not-deployed case for the SEEDED engine UUID — not a resolver-validation failure.
        expect(msg).toMatch(/deployed build for engine 16568b5f-2aaa-48e6-975b-2dec5f098a29/i);
      }
    });

    it('deleteDestination soft-deletes the row; the destination then reads back as null', async () => {
      const del = await gqlClient.query(`mutation($id: ID!) { deleteDestination(id: $id) { id message } }`, {
        id: destinationId
      });
      expect(_.get(del, 'deleteDestination.id')).toEqual(destinationId);

      const after = await getDestination(destinationId);
      expect(_.get(after, 'destination')).toBeNull();

      _.pull(createdDestinationIds, destinationId); // already gone — skip afterAll re-delete
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
      const id = _.get(created, 'createDestination.id');
      createdDestinationIds.push(id);
      await gqlClient.query(
        `mutation($input: CompleteDestinationConnectionInput!) { completeDestinationConnection(input: $input) { id status } }`,
        { input: { id } }
      );

      const tdo = await gqlClient.query(
        `mutation { createTDO(input: { status: "uploaded", startDateTime: 1476726655, stopDateTime: 1476726655 }) { id } }`
      );
      const tdoId = _.get(tdo, 'createTDO.id');
      createdTdoIds.push(tdoId);

      const promise = gqlClient.query(
        `mutation($input: DistributeAssetInput!) { distributeAsset(input: $input) { id } }`,
        { input: { tdoIds: [tdoId], destinationId: id, platformPayload: { description: 'no title' } } }
      );
      await expect(promise).rejects.toThrow();
    });

    it('distributeAsset rejects a destination that is not CONNECTED', async () => {
      const created = await createDestination({
        destinationTypeId: SEEDED.destinationTypeId,
        label: `${citestMarker}-pending-${Date.now()}`,
        details: {}
      });
      const id = _.get(created, 'createDestination.id'); // left PENDING_OAUTH
      createdDestinationIds.push(id);

      const tdo = await gqlClient.query(
        `mutation { createTDO(input: { status: "uploaded", startDateTime: 1476726655, stopDateTime: 1476726655 }) { id } }`
      );
      const tdoId = _.get(tdo, 'createTDO.id');
      createdTdoIds.push(tdoId);

      const promise = gqlClient.query(
        `mutation($input: DistributeAssetInput!) { distributeAsset(input: $input) { id } }`,
        { input: { tdoIds: [tdoId], destinationId: id, platformPayload: { title: 'x' } } }
      );
      await expect(promise).rejects.toThrow(/not connected|PENDING/);
    });
  });

  // Surface a clear note when the vendor-backed paths were skipped, so a green run isn't mistaken for full coverage.
  itif(!mockEnabled, 'NOTE: Ayrshare-backed lifecycle skipped (run with AYRSHARE_MOCK=1 + server on AYRSHARE_BASE_URL to enable)', () => {
    expect(mockEnabled).toBe(false);
  });
});
