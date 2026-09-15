const GraphqlClient = require('./helpers/gql.js');
const helpers = require('./helpers/index');
const config = helpers.config;
const _ = require('lodash');
const { startAyrshareMock } = require('./helpers/ayrshareMock.js');

// VP-2581 (BE-18): when AYRSHARE_MOCK is set, stand up the in-process mock so destination create/OAuth flows
// resolve without touching real Ayrshare. The mock binds 0.0.0.0:AYRSHARE_MOCK_PORT (default 8790) on the host so
// BOTH a host-run server (localhost:8790) and a dockerized server (host.docker.internal:8790) can reach it — the
// server-under-test is pointed at the matching URL via its own AYRSHARE_BASE_URL. The enable toggle is decoupled
// from AYRSHARE_BASE_URL on purpose: in docker the citest side and the server side use different hostnames for the
// same mock. Unset -> skip (the mock-dependent tests in destination.spec.js self-skip via the same toggle).
// Stored on `global` so jest.global.teardown.js (same process) can close it.
async function maybeStartAyrshareMock() {
  const enabled = process.env.AYRSHARE_MOCK === '1' || process.env.AYRSHARE_MOCK === 'true';
  if (!enabled) return;
  const port = Number(process.env.AYRSHARE_MOCK_PORT) || 8790;
  try {
    global.__ayrshareMock__ = await startAyrshareMock(port, '0.0.0.0');
    console.log(`VP-2581 citest: Ayrshare mock listening on 0.0.0.0:${global.__ayrshareMock__.port}`);
  } catch (err) {
    console.log(`VP-2581 citest: failed to start Ayrshare mock on port ${port}: ${err && err.message}`);
  }
}

//  Initialize global variables in the async function below. Note the jest 'global' variable and use
//  that to make your variable available to all tests.
module.exports = async () => {
  await maybeStartAyrshareMock();

  const env = config.env;
  if (env === 'ai13s-no-global-init') return;

  const gqlClient = new GraphqlClient(env);
  let result = await gqlClient.connect();
  if (result.token) {
    result = await gqlClient.query(`query {graphqlServiceInfo {featureFlags}}`);
    const featureFlags = _.get(result, 'graphqlServiceInfo.featureFlags');
    global.enablePackageGrantLogic = _.get(
      featureFlags,
      'enablePackageGrantLogic',
      false
    );
    global.enableAppEventFeature = _.get(
      featureFlags,
      'enableAppEventFeature',
      false
    );
    global.v2FoldersAvailable = _.get(
      featureFlags,
      'v2FoldersAvailable',
      false
    );
    global.enableRBACFeature = _.get(featureFlags, 'enableRBACFeature', false);
    global.enableBatchActionsAPI = _.get(
      featureFlags,
      'enableBatchActionsAPI',
      false
    );
    global.citestMarker = 'citest-should-delete';
    global.signedWritableUrlOverride = _.get(
      featureFlags,
      'signedWritableUrlOverride',
      false
    );
    global.orgMarker = {
      package: global.citestMarker + '-package-org'
    };
    global.enableDefaultDesktopApp = _.get(featureFlags, 'enableDefaultDesktopApp', true);
    global.virtualAssetEnabled = _.get(featureFlags, 'virtualAssetEnabled', false);
    global.enableStrictRoleValidation = _.get(featureFlags, 'enableStrictRoleValidation', false);
  }
};
