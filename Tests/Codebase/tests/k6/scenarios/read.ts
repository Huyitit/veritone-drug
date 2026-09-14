import { sleep, check } from "k6";
import { executeGraphQL } from "../helpers/client";
import { SetupData } from "../helpers/auth";
import { CHECK_ROOT_FOLDERS, GET_ROOT_FOLDERS, GET_FOLDER } from "../../graphql/folder/queries";

export function runReadScenario(data: SetupData): void {
  // Step 1: Query CMS root folders
  const cmsRootRes = executeGraphQL(
    data.endpointUrl,
    CHECK_ROOT_FOLDERS,
    { type: "cms" },
    data.token,
    "TC_LT_03_CheckCmsRootFolders"
  );

  check(cmsRootRes, {
    "CMS root folder found": (r) =>
      Array.isArray(r.data?.rootFolders) && r.data.rootFolders.length > 0,
  });

  // Step 2: Query Watchlist root folders
  const wlRootRes = executeGraphQL(
    data.endpointUrl,
    CHECK_ROOT_FOLDERS,
    { type: "watchlist" },
    data.token,
    "TC_LT_03_CheckWatchlistRootFolders"
  );

  check(wlRootRes, {
    "Watchlist root folder found": (r) =>
      Array.isArray(r.data?.rootFolders) && r.data.rootFolders.length > 0,
  });

  // Step 3: Get all root folders across the organization
  const allRootsRes = executeGraphQL(
    data.endpointUrl,
    GET_ROOT_FOLDERS,
    {},
    data.token,
    "TC_LT_03_GetAllRootFolders"
  );

  check(allRootsRes, {
    "All root folders queried": (r) =>
      Array.isArray(r.data?.rootFolders) && r.data.rootFolders.length > 0,
  });

  // Step 4: Fetch folder hierarchy of primary root anchor
  const rootId = data.rootFolderId || data.rootWatchlistId || data.rootCmsId;
  const folderRes = executeGraphQL(
    data.endpointUrl,
    GET_FOLDER,
    { id: rootId },
    data.token,
    "TC_LT_03_GetFolderHierarchy"
  );

  check(folderRes, {
    "Folder query returned valid payload": (r) => !!r.data?.folder?.id,
  });

  sleep(0.1);
}
