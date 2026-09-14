import { sleep, check } from "k6";
import { executeGraphQL } from "../helpers/client";
import { SetupData } from "../helpers/auth";
import {
  CREATE_FOLDER,
  MOVE_FOLDER,
  DELETE_FOLDER,
} from "../../graphql/folder/mutations";

export function runMoveScenario(data: SetupData): void {
  const vuId = __VU;
  const iterId = __ITER;
  const prefix = `k6-move-${data.runId}-vu${vuId}-it${iterId}`;
  const rootId = data.rootFolderId || data.rootWatchlistId || data.rootCmsId;
  const rootType = data.rootFolderType || (data.rootWatchlistId ? "watchlist" : "cms");

  // 1. Create two parent buckets (Alpha and Beta)
  const bucketAlphaRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Alpha`,
        description: "k6 move scenario Alpha bucket",
        parentId: rootId,
        rootFolderType: rootType,
      },
    },
    data.token,
    "TC_LT_04_CreateBucketAlpha"
  );
  const alphaId = bucketAlphaRes.data?.createFolder?.id;

  const bucketBetaRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Beta`,
        description: "k6 move scenario Beta bucket",
        parentId: rootId,
        rootFolderType: rootType,
      },
    },
    data.token,
    "TC_LT_04_CreateBucketBeta"
  );
  const betaId = bucketBetaRes.data?.createFolder?.id;

  if (!alphaId || !betaId) return;

  // 2. Create mobile folder inside Alpha
  const mobileRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-MobileItem`,
        description: "k6 move scenario mobile child folder",
        parentId: alphaId,
        rootFolderType: rootType,
      },
    },
    data.token,
    "TC_LT_04_CreateMobileItem"
  );
  const mobileId = mobileRes.data?.createFolder?.id;
  if (!mobileId) return;

  // 3. Relocate mobile folder from Alpha to Beta
  const moveRes = executeGraphQL(
    data.endpointUrl,
    MOVE_FOLDER,
    {
      input: {
        folderId: mobileId,
        fromFolderId: alphaId,
        toFolderId: betaId,
      },
    },
    data.token,
    "TC_LT_04_MoveFolderAlphaToBeta"
  );

  check(moveRes, {
    "Mobile folder relocated to Beta": (r) => !!r.data?.moveFolder?.id,
  });

  // 4. Validation / Cycle Prevention Test: Self-Relocation Rejection (folderId == toFolderId)
  executeGraphQL(
    data.endpointUrl,
    MOVE_FOLDER,
    {
      input: {
        folderId: mobileId,
        fromFolderId: betaId,
        toFolderId: mobileId, // Invalid: moving folder into itself!
      },
    },
    data.token,
    "TC_LT_04_MoveFolderInvalidSelfMove",
    true // expectError = true
  );

  // 5. Cleanup: Delete mobile leaf first, then empty Alpha and Beta
  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    { input: { id: mobileId, orderIndex: 0 } },
    data.token,
    "TC_LT_04_DeleteMobileItem"
  );
  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    { input: { id: alphaId, orderIndex: 0 } },
    data.token,
    "TC_LT_04_DeleteAlpha"
  );
  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    { input: { id: betaId, orderIndex: 0 } },
    data.token,
    "TC_LT_04_DeleteBeta"
  );

  sleep(0.2);
}
