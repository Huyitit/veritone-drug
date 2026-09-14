import { sleep, check } from "k6";
import { executeGraphQL } from "../helpers/client";
import { SetupData } from "../helpers/auth";
import { CREATE_FOLDER, DELETE_FOLDER } from "../../graphql/folder/mutations";
import { GET_FOLDER } from "../../graphql/folder/queries";

export function runBurstScenario(data: SetupData): void {
  const vuId = __VU;
  const iterId = __ITER;
  const prefix = `k6-burst-${data.runId}-vu${vuId}-it${iterId}`;
  const rootId = data.rootFolderId || data.rootWatchlistId || data.rootCmsId;
  const rootType = data.rootFolderType || (data.rootWatchlistId ? "watchlist" : "cms");

  // Step 1: Create top-level folder under root
  const createRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Node`,
        description: "k6 burst scenario root node",
        parentId: rootId,
        rootFolderType: rootType,
      },
    },
    data.token,
    "TC_LT_02_BurstCreateRootNode"
  );

  const newId = createRes.data?.createFolder?.id;
  check(createRes, {
    "Burst top node created": () => !!newId,
  });

  if (!newId) return;

  // Step 2: Immediately attach child node
  const childRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Child`,
        description: "k6 burst scenario child node",
        parentId: newId,
        rootFolderType: rootType,
      },
    },
    data.token,
    "TC_LT_02_BurstCreateChildNode"
  );

  const childId = childRes.data?.createFolder?.id;
  check(childRes, {
    "Burst child node attached": () => !!childId,
  });

  // Step 3: Verify parent has child
  const getRes = executeGraphQL(
    data.endpointUrl,
    GET_FOLDER,
    { id: newId },
    data.token,
    "TC_LT_02_BurstVerifyHierarchy"
  );

  check(getRes, {
    "Parent hierarchy includes child": (r) =>
      Array.isArray(r.data?.folder?.childFolders?.records) &&
      r.data.folder.childFolders.records.length > 0,
  });

  // Step 4: Clean up child first, then top node
  if (childId) {
    executeGraphQL(
      data.endpointUrl,
      DELETE_FOLDER,
      { input: { id: childId, orderIndex: 0 } },
      data.token,
      "TC_LT_02_DeleteChildNode"
    );
  }

  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    { input: { id: newId, orderIndex: 0 } },
    data.token,
    "TC_LT_02_DeleteTopNode"
  );

  sleep(0.2);
}
