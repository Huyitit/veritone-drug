import { sleep, check } from "k6";
import { executeGraphQL } from "../helpers/client";
import { SetupData } from "../helpers/auth";
import { CREATE_FOLDER, DELETE_FOLDER } from "../../graphql/folder/mutations";
import { GET_FOLDER } from "../../graphql/folder/queries";



export function runDeleteScenario(data: SetupData): void {

  const vuId = __VU;
  const iterId = __ITER;
  const prefix = `k6-delete-${data.runId}-vu${vuId}-it${iterId}`;
  const rootId = data.rootFolderId || data.rootWatchlistId || data.rootCmsId;
  const rootType = data.rootFolderType || (data.rootWatchlistId ? "watchlist" : "cms");

  // 1. Create temporary target folder
  const createRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Target`,
        description: "k6 delete scenario target folder",
        parentId: rootId,
        rootFolderType: rootType,
      },
    },
    data.token,
    "TC_LT_05_CreatePurgeTarget"
  );

  const targetId = createRes.data?.createFolder?.id;
  check(createRes, {
    "Target created for deletion test": () => !!targetId,
  });

  if (!targetId) return;

  // 2. Issue deleteFolder
  const deleteRes = executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    {
      input: {
        id: targetId,
        orderIndex: 0,
      },
    },
    data.token,
    "TC_LT_05_DeleteTarget"
  );

  check(deleteRes, {
    "Target deleted successfully": (r) =>
      r.status === 200 && (!r.errors || r.errors.length === 0),
  });

  // 3. Verify tombstone via GET_FOLDER (expects error/not_found)
  executeGraphQL(
    data.endpointUrl,
    GET_FOLDER,
    { id: targetId },
    data.token,
    "TC_LT_05_VerifyTombstone",
    true // expectError = true
  );

  sleep(0.1);
}
