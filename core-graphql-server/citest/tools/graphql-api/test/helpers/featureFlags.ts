import { AuthType, createGraphqlClient } from '../../src/graphqlUtil';

// The legacy jest harness populated feature-flag globals from a live
// `graphqlServiceInfo { featureFlags }` query in jest.global.setup.js. The Bun
// harness has no global setup, so specs that gate tests on server feature
// flags must fetch them here at module load (top-level await runs before test
// collection, so `itif(...)`-style gates see real values instead of
// `undefined`). Requires superadmin — call it with the shared CI session.
export interface ServerFeatureFlags {
  enableDefaultDesktopApp?: boolean;
  enableAppEventFeature?: boolean;
  enableRBACFeature?: boolean;
  enablePackageGrantLogic?: boolean;
  v2FoldersAvailable?: boolean;
  enableBatchActionsAPI?: boolean;
  virtualAssetEnabled?: boolean;
  enableStrictRoleValidation?: boolean;
  signedWritableUrlOverride?: boolean;
}

export async function fetchServerFeatureFlags(
  env?: string
): Promise<ServerFeatureFlags> {
  const client = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
  const res = await client.sdk.graphqlServiceInfo();
  return res?.data?.graphqlServiceInfo?.featureFlags ?? {};
}
