import { executeGraphQL } from "./client";
import { USER_LOGIN, CREATE_ROOT_FOLDERS } from "../../graphql/folder/mutations";
import { CHECK_ROOT_FOLDERS } from "../../graphql/folder/queries";

export interface SetupData {
  endpointUrl: string;
  token: string;
  organizationId: string;
  rootCmsId: string;
  rootWatchlistId: string;
  rootFolderId: string;
  rootFolderType: string;
  runId: string;
}

export function setupAuthAndEnvironment(): SetupData {
  const endpointUrl =
    __ENV.GRAPHQL_API_URL ||
    process.env.GRAPHQL_API_URL ||
    "https://api.stage.us-1.veritone.com/v3/graphql";

  const userName =
    __ENV.AUTH_USER_NAME ||
    process.env.AUTH_USER_NAME ||
    "";

  const password =
    __ENV.AUTH_PASSWORD ||
    process.env.AUTH_PASSWORD ||
    "";

  if (!userName || !password) {
    throw new Error("Missing AUTH_USER_NAME or AUTH_PASSWORD credentials for k6 load test");
  }

  // 1. Authenticate against aiWARE GraphQL API
  const loginRes = executeGraphQL(
    endpointUrl,
    USER_LOGIN,
    {
      input: { userName, password },
    },
    undefined,
    "Setup_UserLogin"
  );

  if (loginRes.errors && loginRes.errors.length > 0) {
    throw new Error(`k6 setup login failed: ${loginRes.errors.map((e) => e.message).join(", ")}`);
  }

  const token = loginRes.data?.userLogin?.token;
  const organizationId =
    loginRes.data?.userLogin?.user?.organizationId ||
    loginRes.data?.userLogin?.organization?.id ||
    "";

  if (!token) {
    throw new Error("k6 setup login failed: No bearer token returned");
  }

  // 2. Discover or bootstrap CMS root folder anchor
  let rootCmsId = "";
  const cmsRootRes = executeGraphQL(
    endpointUrl,
    CHECK_ROOT_FOLDERS,
    { type: "cms" },
    token,
    "Setup_CheckCmsRoot"
  );

  if (cmsRootRes.data?.rootFolders && cmsRootRes.data.rootFolders.length > 0) {
    rootCmsId = cmsRootRes.data.rootFolders[0].id;
  } else {
    const cmsCreateRes = executeGraphQL(
      endpointUrl,
      CREATE_ROOT_FOLDERS,
      { rootFolderType: "cms" },
      token,
      "Setup_CreateCmsRoot"
    );
    rootCmsId = cmsCreateRes.data?.createRootFolders?.[0]?.id || "";
  }

  // 3. Discover or bootstrap Watchlist root folder anchor
  let rootWatchlistId = "";
  const wlRootRes = executeGraphQL(
    endpointUrl,
    CHECK_ROOT_FOLDERS,
    { type: "watchlist" },
    token,
    "Setup_CheckWatchlistRoot"
  );

  if (wlRootRes.data?.rootFolders && wlRootRes.data.rootFolders.length > 0) {
    rootWatchlistId = wlRootRes.data.rootFolders[0].id;
  } else {
    const wlCreateRes = executeGraphQL(
      endpointUrl,
      CREATE_ROOT_FOLDERS,
      { rootFolderType: "watchlist" },
      token,
      "Setup_CreateWatchlistRoot"
    );
    rootWatchlistId = wlCreateRes.data?.createRootFolders?.[0]?.id || "";
  }

  const rootFolderId = rootWatchlistId || rootCmsId;
  const rootFolderType = rootWatchlistId ? "watchlist" : "cms";

  if (!rootFolderId) {
    throw new Error("k6 setup failed: Could not resolve or initialize any root folder anchor");
  }

  // 4. Generate unique run session tag
  const runId = Math.random().toString(36).substring(2, 9);

  return {
    endpointUrl,
    token,
    organizationId,
    rootCmsId,
    rootWatchlistId,
    rootFolderId,
    rootFolderType,
    runId,
  };
}
