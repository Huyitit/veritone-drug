import { executeGraphQL } from "./client";
import { SetupData } from "./auth";
import { GET_FOLDER } from "../../graphql/folder/queries";
import { DELETE_FOLDER } from "../../graphql/folder/mutations";

export function teardownSweep(data: SetupData): void {
  if (!data || !data.token) {
    console.log("[k6 teardown] Skipping sweep: Missing session data");
    return;
  }

  const rootIds = Array.from(
    new Set([data.rootFolderId, data.rootCmsId, data.rootWatchlistId].filter(Boolean))
  );

  console.log(`[k6 teardown] Starting bulk sweep for runId: ${data.runId}...`);
  let totalDeleted = 0;

  for (const rootId of rootIds) {
    try {
      const rootFolderRes = executeGraphQL(
        data.endpointUrl,
        GET_FOLDER,
        { id: rootId },
        data.token,
        "Teardown_GetRootChildren"
      );

      const records: Array<{ id: string; name: string }> =
        rootFolderRes.data?.folder?.childFolders?.records || [];

      const runPrefix = `k6-`;
      const matchingFolders = records.filter(
        (f) => f.name && f.name.startsWith(runPrefix) && f.name.includes(data.runId)
      );

      if (matchingFolders.length > 0) {
        console.log(
          `[k6 teardown] Found ${matchingFolders.length} test folder(s) under root ${rootId}`
        );

        for (const folder of matchingFolders) {
          try {
            // Check if folder has subchildren to prune first
            const childRes = executeGraphQL(
              data.endpointUrl,
              GET_FOLDER,
              { id: folder.id },
              data.token,
              "Teardown_GetSubChildren"
            );
            const subRecords: Array<{ id: string }> =
              childRes.data?.folder?.childFolders?.records || [];

            for (const sub of subRecords) {
              executeGraphQL(
                data.endpointUrl,
                DELETE_FOLDER,
                { input: { id: sub.id, orderIndex: 0 } },
                data.token,
                "Teardown_DeleteSubChild"
              );
            }

            const deleteRes = executeGraphQL(
              data.endpointUrl,
              DELETE_FOLDER,
              { input: { id: folder.id, orderIndex: 0 } },
              data.token,
              "Teardown_DeleteFolder"
            );

            if (!deleteRes.errors || deleteRes.errors.length === 0) {
              totalDeleted++;
            }
          } catch {
            // Ignore errors for already deleted folders
          }
        }
      }
    } catch {
      // Ignore root query errors
    }
  }

  console.log(`[k6 teardown] Sweep complete: Cleanly deleted ${totalDeleted} test folder(s).`);
}
