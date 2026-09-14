import { sleep, check } from "k6";
import { executeGraphQL } from "../helpers/client";
import { SetupData } from "../helpers/auth";
import {
  CREATE_FOLDER,
  UPDATE_FOLDER,
  MOVE_FOLDER,
  MOVE_FOLDERS,
  DELETE_FOLDER,
} from "../../graphql/folder/mutations";
import { GET_FOLDER_OVERVIEW } from "../../graphql/folder/queries";

export function runLifecycleScenario(data: SetupData): void {
  const vuId = __VU;
  const iterId = __ITER;
  const prefix = `k6-run-${data.runId}-vu${vuId}-it${iterId}`;
  const rootId = data.rootFolderId || data.rootWatchlistId || data.rootCmsId;
  const rootType = data.rootFolderType || (data.rootWatchlistId ? "watchlist" : "cms");

  // =========================================================================
  // PHASE 2: TREE CONSTRUCTION & HIERARCHY EXPANSION
  // =========================================================================

  // Step 2.1: Create Primary Top-Level Folders (Folder A and Folder B)
  const folderARes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-FolderA`,
        description: "Primary ingest root A for k6 lifecycle load test",
        parentId: rootId,
        rootFolderType: rootType,
      },
    },
    data.token,
    "TC_LT_01_CreateFolderA"
  );

  const folderAId = folderARes.data?.createFolder?.id;
  check(folderARes, {
    "Folder A created successfully": () => !!folderAId,
  });

  const folderBRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-FolderB`,
        description: "Primary staging root B for k6 lifecycle load test",
        parentId: rootId,
        rootFolderType: rootType,
      },
    },
    data.token,
    "TC_LT_01_CreateFolderB"
  );

  const folderBId = folderBRes.data?.createFolder?.id;
  check(folderBRes, {
    "Folder B created successfully": () => !!folderBId,
  });

  if (!folderAId || !folderBId) {
    console.error(`[VU ${vuId}] Failed to create top-level test folders`);
    return;
  }

  // Step 2.2: Create Sub-Folders under Folder A
  const sub1Res = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Sub1`,
        description: "Child subfolder 1 for relocation",
        parentId: folderAId,
        rootFolderType: rootType,
      },
    },
    data.token,
    "TC_LT_01_CreateSub1"
  );
  const sub1Id = sub1Res.data?.createFolder?.id;

  const sub2Res = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Sub2`,
        description: "Child subfolder 2 for bulk migration",
        parentId: folderAId,
        rootFolderType: rootType,
      },
    },
    data.token,
    "TC_LT_01_CreateSub2"
  );
  const sub2Id = sub2Res.data?.createFolder?.id;

  // =========================================================================
  // PHASE 3: IN-PLACE MAINTENANCE & METADATA EVOLUTION
  // =========================================================================
  if (sub2Id) {
    const updateRes = executeGraphQL(
      data.endpointUrl,
      UPDATE_FOLDER,
      {
        input: {
          id: sub2Id,
          name: `${prefix}-Sub2-Archived`,
        },
      },
      data.token,
      "TC_LT_01_UpdateFolder"
    );

    check(updateRes, {
      "Sub2 name updated successfully": (r) =>
        r.data?.updateFolder?.name === `${prefix}-Sub2-Archived`,
    });
  }

  // =========================================================================
  // PHASE 4: CONCURRENCY-SAFE SINGLE RELOCATION (OCC)
  // =========================================================================
  if (sub1Id) {
    const moveRes = executeGraphQL(
      data.endpointUrl,
      MOVE_FOLDER,
      {
        input: {
          folderId: sub1Id,
          fromFolderId: folderAId,
          toFolderId: folderBId,
        },
      },
      data.token,
      "TC_LT_01_MoveFolderSingle"
    );

    check(moveRes, {
      "Sub1 moved to Folder B": (r) => !!r.data?.moveFolder?.id,
    });
  }

  // =========================================================================
  // PHASE 5: BULK MIGRATION & REBALANCING
  // =========================================================================
  if (sub2Id) {
    const bulkMoveRes = executeGraphQL(
      data.endpointUrl,
      MOVE_FOLDERS,
      {
        input: {
          folderIds: [sub2Id],
          newParentFolderId: folderBId,
          rootFolderType: rootType,
        },
      },
      data.token,
      "TC_LT_01_MoveFoldersBulk"
    );

    check(bulkMoveRes, {
      "Sub2 bulk moved to Folder B": (r) =>
        Array.isArray(r.data?.moveFolders?.validFolderIds) &&
        r.data.moveFolders.validFolderIds.includes(sub2Id),
    });
  }

  // =========================================================================
  // PHASE 6: OVERVIEW QUERY & HIERARCHY PRUNING / DESTRUCTION
  // =========================================================================
  const overviewRes = executeGraphQL(
    data.endpointUrl,
    GET_FOLDER_OVERVIEW,
    {
      ids: [folderAId, folderBId],
    },
    data.token,
    "TC_LT_01_GetFolderOverview"
  );

  check(overviewRes, {
    "Overview query executed successfully": (r) =>
      !!r.data?.folderOverview &&
      typeof r.data.folderOverview.childFoldersCount !== "undefined",
  });

  // Prune created leaf nodes first to satisfy aiWARE's non-empty folder validation
  if (sub1Id) {
    executeGraphQL(
      data.endpointUrl,
      DELETE_FOLDER,
      {
        input: {
          id: sub1Id,
          orderIndex: 0,
        },
      },
      data.token,
      "TC_LT_01_DeleteSub1"
    );
  }

  if (sub2Id) {
    executeGraphQL(
      data.endpointUrl,
      DELETE_FOLDER,
      {
        input: {
          id: sub2Id,
          orderIndex: 0,
        },
      },
      data.token,
      "TC_LT_01_DeleteSub2"
    );
  }

  // Delete parent folders (now empty)
  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    {
      input: {
        id: folderAId,
        orderIndex: 0,
      },
    },
    data.token,
    "TC_LT_01_DeleteFolderA"
  );

  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    {
      input: {
        id: folderBId,
        orderIndex: 0,
      },
    },
    data.token,
    "TC_LT_01_DeleteFolderB"
  );

  sleep(0.5);
}
