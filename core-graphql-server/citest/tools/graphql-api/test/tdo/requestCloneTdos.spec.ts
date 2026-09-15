/// <reference lib="ES2017" />

// The project tsconfig under `citest/tools/graphql-api` does not pin
// `lib`/`target` and does not bundle `@types/node`. Pull in the ES2017 lib
// (Promise constructor, Array#find, Object.values, ...) and declare just the
// shape of `process.env` that this file reads. Jest + ts-jest run with the
// correct lib at runtime; these directives only keep the IDE LSP quiet.
declare const process: { env: { [key: string]: string | undefined } };

// Integration test for `requestClone` with the `tdoIds` filter (TDO-scoped
// clones) and the follow-up `refreshClone` flow.
//
//   1. Login as the configured superadmin (this is the destination "Veritone" org).
//   2. Create a brand-new supplier organization and a user inside it.
//   3. Authenticated as the supplier user, create two TDOs (A and B), each with
//      a primary media asset, a thumbnail asset, and a vtn-standard engine asset
//      that carries `sourceData.engineId`.
//   4. Call `requestClone` from the supplier org to the destination (Veritone)
//      org, passing `tdoIds: [TDO_A]` and `cloneAssets: [media, vtn-standard]`.
//   5. Poll the clone request until it reaches `complete`, then query
//      `temporalDataObjects` in the destination org and assert:
//        - exactly one TDO has `details.veritoneClone.original == TDO_A`.
//        - no destination TDO references TDO_B (it was excluded by `tdoIds`).
//        - `details.veritoneClone.newAssetIdsToOldAssetIds` maps cloned ->
//          source asset ids, contains the engine asset, omits the thumbnail
//          (filtered out by `cloneAssets`), and the new asset ids match the
//          cloned TDO's `assets.records[].id`.
//        - the cloned vtn-standard asset preserves `sourceData.engineId` from
//          the source.
//   6. Refresh phase: add a brand-new vtn-standard engine asset *and* a new
//      thumbnail asset to TDO A *after* the initial clone has completed, then
//      call `refreshClone(cloneId)`. Poll the clone request back to `complete`
//      and assert that the destination clone now:
//        - contains the *newly added* engine asset id in
//          `newAssetIdsToOldAssetIds`'s values, and
//        - still excludes the newly added thumbnail id (the `cloneAssets`
//          filter from the original request continues to gate refresh too), and
//        - the cloned new engine asset preserves `sourceData.engineId`.

import { v4 as uuidv4 } from 'uuid';

import {
  AuthType,
  buildRequestHeaders,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  OrderDirection,
  OrganizationStatus,
  OrganizationType,
  RefreshCloneMode,
  TemporalDataObjectOrderBy
} from '../../src/gql/gql';

const CITEST_MARKER = 'citest-should-delete-clone-tdos';

// CMS application id used to provision the supplier org. Matches the bash
// script default; the resolver requires the source org to have at least one
// app so that `requestClone` can attribute the job to it.
const CMS_APPLICATION_ID = '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5';

// Engine category id for the vtn-standard engine asset's `cloneAssets` filter.
// Matches the bash script; in `aws-dev` this is the "Transcription" cognition
// category, which is the only category guaranteed to exist across environments.
const ENGINE_CATEGORY_ID = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

// Engine id stamped into each vtn-standard asset's `sourceData.engineId`. The
// clone must preserve this value verbatim in the destination org.
const SOURCE_ENGINE_ID = 'c0e55cde-340b-44d7-bb42-2e0d65e98255';

// Default role id assigned to the supplier-org user (any non-superadmin role is
// fine; this user only needs to create TDOs/assets and call `requestClone`).
const DEFAULT_APP_ROLE_ID =
  process.env.DEFAULT_APP_ROLE_ID || 'cb18eb9c-3264-434a-8a8d-e6b2d680f66e';

// Maximum wall-clock budget for waiting on a single clone or refresh-clone
// job to reach a terminal status (`complete` or `failed`). Override with
// CLONE_TIMEOUT_MS for a slow box; the default comfortably covers a small TDO
// with two assets on a local stack. Polling cadence is fixed at
// CLONE_POLL_INTERVAL_MS so each call to `waitForCloneStatus` is bounded.
const CLONE_TIMEOUT_MS = Number(process.env.CLONE_TIMEOUT_MS || 30000);
const CLONE_POLL_INTERVAL_MS = Number(
  process.env.CLONE_POLL_INTERVAL_MS || 500
);

// Short post-write settle so the asset rows are visible to the next read.
// The clone status poll above absorbs the bulk of the wait; this just hides
// the read-your-write window on the asset table.
const ASSET_SETTLE_MS = Number(process.env.ASSET_SETTLE_MS || 1000);

// Test fixtures only — `vtn-standard` JSON is downloaded by the asset service.
const MEDIA_URI =
  'https://videos.ctfassets.net/9f7tranrpc7k/5rqY4yPO1Xu8seLDIvs3NI/3fd926bfa395d7aaf6bdd04b8bebf380/BigBuckBunny_TC_burnin.mp4';
const THUMBNAIL_URI =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Big.Buck.Bunny.-.Opening.Screen.png/1280px-Big.Buck.Bunny.-.Opening.Screen.png';
const VTN_STANDARD_URI =
  'https://vtn-dev-test-files.s3.amazonaws.com/vtn-standard/v3/object.d66f553d-3cef-4c5a-9b66-3e551cc48b4b.1230683094.json';

interface TdoFixture {
  tdoId: string;
  mediaAssetId: string;
  thumbnailAssetId: string;
  engineAssetId: string;
  engineSourceEngineId: string;
}

// `details(path: "veritoneClone")` returns the raw clone metadata stored by the
// clone job. It is `null` for non-cloned TDOs, so records without it are
// filtered out when locating the clone of TDO A.
type CloneDetails = {
  original?: string;
  newAssetIdsToOldAssetIds?: Record<string, string>;
};

type ClonedAsset = {
  id: string;
  name?: string | null;
  assetType?: string | null;
  contentType?: string | null;
  sourceData?: {
    engineId?: string | null;
    name?: string | null;
    taskId?: string | null;
  } | null;
};

type ClonedTdo = {
  id: string;
  name?: string | null;
  organizationId?: string | null;
  details?: CloneDetails | null;
  assets?: { records?: Array<ClonedAsset | null> | null } | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('citest_tdo: requestClone with tdoIds filter clones only the listed TDO', () => {
  let gqlClient: GraphqlClient;

  // Created in beforeAll for cleanup in afterAll.
  let supplierOrgId: string;
  let supplierUserId: string;
  let veritoneOrgId: string;
  let veritoneOrgGuid: string;
  let supplierHeaders: Record<string, string>;

  let tdoA: TdoFixture;
  let tdoB: TdoFixture;
  let cloneId: string;
  // Captured during validation so afterAll can best-effort delete the clone in
  // the destination org.
  let clonedTdoIdInDest: string | undefined;

  // Assets added to TDO A *after* the initial clone completes, used to verify
  // refreshClone picks up new vtn-standard assets and continues to filter
  // thumbnails per the original `cloneAssets` filter.
  let refreshEngineAssetId: string;
  let refreshEngineSourceEngineId: string;
  let refreshThumbnailAssetId: string;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    // Discover the destination (Veritone) org id from the superadmin's session
    // instead of hardcoding it. The bash script hardcoded
    // `ed075985-bc94-406b-8639-44d1da42c3fb`, which only matches the local dev
    // seed data; deriving it from `me` makes the test portable across envs.
    const meResult = await gqlClient.sdk.me();
    veritoneOrgId = meResult?.data?.me?.organizationId as string;
    veritoneOrgGuid = meResult?.data?.me?.organization?.guid as string;
    expect(veritoneOrgId).toBeDefined();
    expect(veritoneOrgGuid).toBeDefined();

    const stamp = uuidv4();

    const createOrgResult = await gqlClient.sdk.createOrganization({
      input: {
        name: `${CITEST_MARKER}-supplier-${stamp}`,
        businessUnit: 'Media',
        types: [OrganizationType.Agency],
        metadata: {},
        // `applications` is JSONData; the bash script passes a plain id array
        // and the resolver normalizes it to `{ applicationId, applicationKey }`
        // for the supplier org.
        applications: [CMS_APPLICATION_ID]
      }
    });
    supplierOrgId = createOrgResult?.data?.createOrganization?.id as string;
    expect(supplierOrgId).toBeDefined();

    const supplierEmail = `${CITEST_MARKER}-user-${stamp}@example.com`;
    const supplierPassword = uuidv4();

    const createUserResult = await gqlClient.sdk.createUser({
      input: {
        name: supplierEmail,
        email: supplierEmail,
        firstName: 'Jon',
        lastName: 'Doe',
        organizationId: supplierOrgId,
        password: supplierPassword,
        sendNewUserEmail: false,
        roleIds: [DEFAULT_APP_ROLE_ID]
      }
    });
    supplierUserId = createUserResult?.data?.createUser?.id as string;
    expect(supplierUserId).toBeDefined();

    // All TDO/asset/clone operations run as the supplier user so they are
    // attributed to the supplier org (source application id).
    supplierHeaders = await buildRequestHeaders(gqlClient, {
      userName: supplierEmail,
      password: supplierPassword
    });

    tdoA = await createTdoWithAssets(gqlClient, supplierHeaders, 'A', stamp);
    tdoB = await createTdoWithAssets(gqlClient, supplierHeaders, 'B', stamp);

    // Allow the asset writes to propagate before the clone job picks them up.
    // The clone job snapshots assets at submit time, so this guards against a
    // read-your-write race on the vtn-standard sourceData.
    await sleep(ASSET_SETTLE_MS);
  });

  afterAll(async () => {
    // Best-effort cleanup. Each step is independently guarded so a failure in
    // one cleanup step does not skip the rest.
    if (clonedTdoIdInDest) {
      try {
        await gqlClient.sdk.deleteTDO({ id: clonedTdoIdInDest });
      } catch {
        // ignore — the clone may not have completed or may already be gone
      }
    }
    for (const tdo of [tdoA, tdoB].filter(Boolean) as TdoFixture[]) {
      try {
        await gqlClient.sdk.deleteTDO({ id: tdo.tdoId }, supplierHeaders);
      } catch {
        // ignore
      }
    }
    if (supplierUserId) {
      try {
        await gqlClient.sdk.deleteUser({ id: supplierUserId });
      } catch {
        // ignore
      }
    }
    if (supplierOrgId) {
      try {
        await gqlClient.sdk.updateOrganization({
          input: { id: supplierOrgId, status: OrganizationStatus.Deleted }
        });
      } catch {
        // ignore
      }
    }
  });

  it('submits requestClone restricted to TDO A', async () => {
    // `cloneAssets` is intentionally `media` + `vtn-standard` only. The
    // thumbnail asset on TDO A must therefore be excluded from the clone, and
    // the per-asset assertion in the validation test below depends on it.
    const result = await gqlClient.sdk.requestClone(
      {
        input: {
          sourceApplicationId: supplierOrgId,
          destinationApplicationId: veritoneOrgId,
          cloneBlobs: false,
          includeAssets: true,
          tdoIds: [tdoA.tdoId],
          cloneAssets: [
            { assetType: 'media' },
            {
              assetType: 'vtn-standard',
              engineCategoryId: ENGINE_CATEGORY_ID
            }
          ]
        }
      },
      supplierHeaders
    );

    cloneId = result?.data?.requestClone?.id;
    expect(cloneId).toBeDefined();
    expect(result?.data?.requestClone?.sourceApplicationId).toBeDefined();
    expect(result?.data?.requestClone?.destinationApplicationId).toBe(veritoneOrgGuid);

    // Poll until the clone job reaches a terminal state. `refreshClone` later
    // requires status === 'complete', so failing the test now (rather than
    // silently sleeping past a still-running clone) keeps later assertions
    // truthful. `failed` is treated as a hard test failure here on purpose:
    // the bash script's `sleep $SLEEP_SECONDS` would have masked it.
    const finalStatus = await waitForCloneStatus(
      gqlClient,
      cloneId,
      ['complete', 'failed'],
      supplierHeaders
    );
    expect(finalStatus).toBe('complete');
  });

  it('clones only TDO A into the destination org (TDO B is excluded by tdoIds)', async () => {
    // Queried as the superadmin so we see the destination (Veritone) org's
    // TDOs. The supplier user does not have access to read clones in another
    // org, which is why the bash script also uses the superadmin token here.
    const destTdos = await listDestinationCloneTdos(gqlClient, veritoneOrgId);

    const clonesOfA = destTdos.filter(
      (tdo) => tdo.details?.original === tdoA.tdoId
    );
    const clonesOfB = destTdos.filter(
      (tdo) => tdo.details?.original === tdoB.tdoId
    );

    expect(clonesOfA.length).toBeGreaterThanOrEqual(1);
    expect(clonesOfB.length).toBe(0);

    // Remember the cloned TDO id for afterAll cleanup. Use the first match —
    // there should only be one for a freshly-created supplier org.
    clonedTdoIdInDest = clonesOfA[0]?.id;
  });

  it('preserves engine-asset sourceData and excludes the thumbnail from the clone mapping', async () => {
    const destTdos = await listDestinationCloneTdos(gqlClient, veritoneOrgId);
    const cloned = destTdos.find(
      (tdo) => tdo.details?.original === tdoA.tdoId
    );
    expect(cloned).toBeDefined();

    const mapping = cloned!.details?.newAssetIdsToOldAssetIds || {};
    const mappingKeys = Object.keys(mapping).sort();
    const mappingValues = Object.values(mapping);
    const assetRecords = (cloned!.assets?.records || []).filter(
      (r): r is ClonedAsset => r != null
    );
    const assetIds = assetRecords.map((a) => a.id).sort();

    // Sanity check that the clone job populated the asset map and that the
    // destination TDO actually has the cloned assets attached.
    expect(mappingKeys.length).toBeGreaterThan(0);
    expect(assetIds.length).toBeGreaterThan(0);
    // Key set in `newAssetIdsToOldAssetIds` must exactly match the cloned
    // TDO's asset ids; any drift means the clone job left orphaned entries.
    expect(mappingKeys).toEqual(assetIds);

    // The vtn-standard engine asset from TDO A must appear as a source
    // (mapping value). Its absence would mean the engine asset was not cloned.
    expect(mappingValues).toContain(tdoA.engineAssetId);

    // The thumbnail on TDO A must NOT be in the mapping because the
    // `cloneAssets` filter passed to `requestClone` only included `media` and
    // `vtn-standard`.
    expect(mappingValues).not.toContain(tdoA.thumbnailAssetId);

    // Locate the cloned engine asset by reversing the mapping (newId -> oldId)
    // and verify sourceData.engineId survives the clone unchanged.
    const clonedEngineNewId = Object.keys(mapping).find(
      (newId) => mapping[newId] === tdoA.engineAssetId
    );
    expect(clonedEngineNewId).toBeDefined();
    const clonedEngineAsset = assetRecords.find(
      (a) => a.id === clonedEngineNewId
    );
    expect(clonedEngineAsset).toBeDefined();
    expect(clonedEngineAsset!.assetType).toBe('vtn-standard');
    expect(clonedEngineAsset!.sourceData).toBeDefined();
    expect(clonedEngineAsset!.sourceData?.engineId).toBe(
      tdoA.engineSourceEngineId
    );
  });

  // -- refresh phase ------------------------------------------------------
  //
  // Mirrors `test_refresh_clone` from `test-request-clone.sh`: after the
  // initial clone is complete, add a *new* engine asset (and a new thumbnail
  // negative control) to the source TDO A and call `refreshClone`. The
  // refresh must pick up the new engine asset on the existing destination
  // clone without re-cloning B and without ever cloning the new thumbnail
  // (the original `cloneAssets` filter on the clone request continues to
  // apply on refresh).
  it('refreshClone after adding a new vtn-standard asset and thumbnail to TDO A', async () => {
    const newThumb = await gqlClient.sdk.createAsset(
      {
        input: {
          containerId: tdoA.tdoId,
          assetType: 'thumbnail',
          contentType: 'image/png',
          uri: THUMBNAIL_URI
        }
      },
      supplierHeaders
    );
    refreshThumbnailAssetId = newThumb?.data?.createAsset?.id as string;
    expect(refreshThumbnailAssetId).toBeDefined();
    // Distinct from the pre-clone thumbnail so the negative assertion below
    // is meaningful (an unchanged id would be ambiguous).
    expect(refreshThumbnailAssetId).not.toBe(tdoA.thumbnailAssetId);

    const added = await addEngineAssetToTdo(
      gqlClient,
      supplierHeaders,
      tdoA.tdoId
    );
    refreshEngineAssetId = added.engineAssetId;
    refreshEngineSourceEngineId = added.engineSourceEngineId;
    // Distinct from the pre-clone engine asset so we can prove refresh added
    // *this* asset rather than picking up the original mapping entry.
    expect(refreshEngineAssetId).not.toBe(tdoA.engineAssetId);

    await sleep(ASSET_SETTLE_MS);

    const result = await gqlClient.sdk.refreshClone(
      {
        /**
         * FULL (the default) re-evaluates already-cloned TDOs and clones any
         * newly added assets that match the original `cloneAssets` filter.
         * EXISTING_ONLY would also work for this test; NEW_ONLY would skip
         * the existing destination TDO and is therefore incorrect here.
         */
        input: { cloneId, mode: RefreshCloneMode.Full }
      },
      supplierHeaders
    );
    expect(result?.data?.refreshClone?.id).toBe(cloneId);

    const finalStatus = await waitForCloneStatus(
      gqlClient,
      cloneId,
      ['complete', 'failed'],
      supplierHeaders
    );
    expect(finalStatus).toBe('complete');
  });

  it('refresh propagates the new engine asset (and still excludes the new thumbnail) into the destination clone', async () => {
    const destTdos = await listDestinationCloneTdos(gqlClient, veritoneOrgId);
    const cloned = destTdos.find(
      (tdo) => tdo.details?.original === tdoA.tdoId
    );
    expect(cloned).toBeDefined();

    const mapping = cloned!.details?.newAssetIdsToOldAssetIds || {};
    const mappingValues = Object.values(mapping);

    // The newly added vtn-standard asset must now be in the mapping. If the
    // refresh failed silently this is what would catch it.
    expect(mappingValues).toContain(refreshEngineAssetId);

    // The original engine asset id is still expected to be present — refresh
    // is additive, not destructive.
    expect(mappingValues).toContain(tdoA.engineAssetId);

    // Refresh must continue to honour the original `cloneAssets` filter;
    // neither thumbnail (pre- nor post-clone) should ever appear.
    expect(mappingValues).not.toContain(tdoA.thumbnailAssetId);
    expect(mappingValues).not.toContain(refreshThumbnailAssetId);

    // Find the cloned copy of the *refresh-added* engine asset by reversing
    // the mapping and verify sourceData.engineId survived the refresh.
    const refreshedClonedEngineNewId = Object.keys(mapping).find(
      (newId) => mapping[newId] === refreshEngineAssetId
    );
    expect(refreshedClonedEngineNewId).toBeDefined();
    const assetRecords = (cloned!.assets?.records || []).filter(
      (r): r is ClonedAsset => r != null
    );
    const refreshedClonedEngineAsset = assetRecords.find(
      (a) => a.id === refreshedClonedEngineNewId
    );
    expect(refreshedClonedEngineAsset).toBeDefined();
    expect(refreshedClonedEngineAsset!.assetType).toBe('vtn-standard');
    expect(refreshedClonedEngineAsset!.sourceData?.engineId).toBe(
      refreshEngineSourceEngineId
    );

    // Mapping keys must continue to match the destination TDO's asset ids
    // after the refresh — a key without a matching asset record would mean
    // the refresh recorded a mapping for an asset that was never actually
    // attached to the cloned TDO.
    const mappingKeys = Object.keys(mapping).sort();
    const assetIds = assetRecords.map((a) => a.id).sort();
    expect(mappingKeys).toEqual(assetIds);

    // The clone of TDO B must still not exist; refresh in FULL mode must not
    // start cloning previously excluded TDOs.
    const clonesOfB = destTdos.filter(
      (tdo) => tdo.details?.original === tdoB.tdoId
    );
    expect(clonesOfB.length).toBe(0);
  });
});

// --- helpers --------------------------------------------------------------

// Mirrors the per-TDO setup in `test-request-clone-tdos.sh`:
//   - createTDOWithAsset (media)
//   - createAsset (thumbnail)
//   - createAsset (vtn-standard with sourceData.engineId)
// Returns ids needed by the validation assertions.
async function createTdoWithAssets(
  client: GraphqlClient,
  headers: Record<string, string>,
  label: 'A' | 'B',
  stamp: string
): Promise<TdoFixture> {
  const createTdo = await client.sdk.createTDOWithAsset(
    {
      input: {
        startDateTime: 1577836800000,
        name: `${CITEST_MARKER} clone test ${label} ${stamp}`,
        contentType: 'video/mp4',
        assetType: 'media',
        uri: MEDIA_URI,
        addToIndex: true
      }
    },
    headers
  );
  const tdoId = createTdo?.data?.createTDOWithAsset?.id as string;
  expect(tdoId).toBeDefined();
  const mediaAssetId =
    (createTdo?.data?.createTDOWithAsset?.assets?.records?.[0]?.id as string) ||
    '';

  const thumbResult = await client.sdk.createAsset(
    {
      input: {
        containerId: tdoId,
        assetType: 'thumbnail',
        contentType: 'image/png',
        uri: THUMBNAIL_URI
      }
    },
    headers
  );
  const thumbnailAssetId = thumbResult?.data?.createAsset?.id as string;
  expect(thumbnailAssetId).toBeDefined();

  /**
   * Uses CREATE_ASSET_WITH_SOURCE_DATA rather than the default CREATE_ASSET:
   * only the former returns `sourceData`, and the cloned asset in the
   * destination org must report the same `sourceData.engineId`.
   */
  const engineCreateResponse = await client.sdk.createAssetWithSourceData(
    {
      input: {
        containerId: tdoId,
        assetType: 'vtn-standard',
        contentType: 'application/json',
        uri: VTN_STANDARD_URI,
        sourceData: {
          engineId: SOURCE_ENGINE_ID
        }
      }
    },
    headers
  );
  const engineAssetId = engineCreateResponse?.data?.createAsset?.id as string;
  const engineSourceEngineId = engineCreateResponse?.data?.createAsset
    ?.sourceData?.engineId as string;
  expect(engineAssetId).toBeDefined();
  // The resolver must echo back a non-empty engineId; otherwise the clone
  // validation that compares engine ids would silently pass.
  expect(engineSourceEngineId).toBeTruthy();

  return {
    tdoId,
    mediaAssetId,
    thumbnailAssetId,
    engineAssetId,
    engineSourceEngineId
  };
}

// Adds a single vtn-standard engine asset to an existing TDO. Used in the
// refresh phase to introduce a *new* asset after the initial clone has
// completed, so refreshClone has something to pick up. Returns the new asset
// id and its server-resolved `sourceData.engineId` for later assertions.
async function addEngineAssetToTdo(
  client: GraphqlClient,
  headers: Record<string, string>,
  tdoId: string
): Promise<{ engineAssetId: string; engineSourceEngineId: string }> {
  const response = await client.sdk.createAssetWithSourceData(
    {
      input: {
        containerId: tdoId,
        assetType: 'vtn-standard',
        contentType: 'application/json',
        uri: VTN_STANDARD_URI,
        sourceData: { engineId: SOURCE_ENGINE_ID }
      }
    },
    headers
  );
  const engineAssetId = response?.data?.createAsset?.id as string;
  const engineSourceEngineId = response?.data?.createAsset?.sourceData
    ?.engineId as string;
  expect(engineAssetId).toBeDefined();
  expect(engineSourceEngineId).toBeTruthy();
  return { engineAssetId, engineSourceEngineId };
}

// Polls `cloneRequests(id: $cloneId)` until status matches one of
// `terminalStatuses` or until CLONE_TIMEOUT_MS elapses. Returns the final
// observed status (which lets the caller distinguish `complete` from
// `failed`). Polling runs as the supplier user because non-superadmin clones
// are only visible from the source org context.
async function waitForCloneStatus(
  client: GraphqlClient,
  cloneId: string,
  terminalStatuses: string[],
  headers: Record<string, string>
): Promise<string> {
  const deadline = Date.now() + CLONE_TIMEOUT_MS;
  let lastStatus = 'unknown';
  while (Date.now() < deadline) {
    const response = await client.sdk.cloneRequests({ id: cloneId }, headers);
    lastStatus =
      response?.data?.cloneRequests?.records?.[0]?.status ?? 'unknown';
    if (terminalStatuses.indexOf(lastStatus) !== -1) {
      return lastStatus;
    }
    await sleep(CLONE_POLL_INTERVAL_MS);
  }
  throw new Error(
    `Clone ${cloneId} did not reach one of [${terminalStatuses.join(
      ', '
    )}] within ${CLONE_TIMEOUT_MS}ms (last status: ${lastStatus})`
  );
}

// Fetches all TDOs in the destination org along with their `veritoneClone`
// details and assets. Uses a raw query because the codegen'd SDK's GET_TDOS
// projection does not include `details(path:)` or `assets.sourceData`.
async function listDestinationCloneTdos(
  client: GraphqlClient,
  organizationId: string
): Promise<ClonedTdo[]> {
  const response = await client.sdk.temporalDataObjectsWithCloneDetails({
    organizationId,
    limit: 100,
    orderBy: TemporalDataObjectOrderBy.CreatedDateTime,
    orderDirection: OrderDirection.Desc
  });
  const records: ClonedTdo[] =
    response?.data?.temporalDataObjects?.records?.filter(
      (r: ClonedTdo | null): r is ClonedTdo => r != null
    ) || [];
  return records;
}
