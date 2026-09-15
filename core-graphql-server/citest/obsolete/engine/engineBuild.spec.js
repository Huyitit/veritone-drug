const helpers = require('../../helpers/index.js');
const userHelpers = require('../../helpers/user.js');
const engineHelpers = require('../../helpers/engine.js');
const packagesHelpers = require('../../helpers/package.js');
const GraphqlClient = require('../../helpers/gql.js');
const _ = require('lodash');
const cluster = require('../../../modules/core-job-server/model/cluster.js');
const mockUtil = require('../../../test/mockUtil.js')();
const uuid = require('uuid');
const config = helpers.config;

const citestMarker = global.citestMarker || 'citest-should-delete';
const testName = citestMarker + '_engine_' + Date.now();
const testNameDescriptor = citestMarker + ' Transcription-Veritone Inc-Chunk-Test-V3';
const testTemplateTextUploadChunk = mockUtil.getMockEngineTemplate('citest-upload', 'upload');
const predefinedEngineBuildId = citestMarker + '_build_id_' + Date.now();

let categoryId, engineId, engineBuildId, engineBuildNodeRedId, engineIdGQLTest, draftengineBuildNodeRedId, clusterId;
let engineId1, engineBuildId1, enginePackage1, engineBuildId2, engineBuildId3;
let engineIdHub, engineBuildIdHub, engineBuildIdHub1, enginePackageHub;
let userTokenAuthorization;
let automaticPackageCreation;

const env = config.env;
const gqlClient = new GraphqlClient(env);

// docker image to be reused and avoiding uploading one image for each test
const dockerImageUploaded =
  'registry.central.aiware.com/c308896d-3ba4-4b96-a95b-ad8fa4754888:838d1aa4-6a28-4a59-acf1-6ff346944299';

let engineApprovalWhiteListed = false;

const local = 'local';
const nodeRed = `
  taskRuntime: {
    nodeRed: true
  }
  manifest: {
    runtime: "NodeRed"
  }`;

describe('citest_engine: Engine Build new process testing', () => {
  let superAdminOptions;

  beforeAll(async () => {
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superAdminOptions = helpers.requestOptions(result.token);

    result = await userHelpers.getMyInfo({
      gqlClient,
      options: superAdminOptions
    });
    // check engineApprovalWhiteListed status for org
    const engineApprovalWhiteListedValue = _.get(result, 'me.organization.jsondata.engineApprovalWhiteListed', false);
    engineApprovalWhiteListed = engineApprovalWhiteListedValue === 'enabled';
    // this feature is undefined in ai13s but the following code checks for "disabled" value
    automaticPackageCreation = _.get(result, 'me.organization.jsondata.features.automaticPackageCreation');
  });

  afterAll(async () => {
    // Delete engine builds and verify they are deleted
    let deleteResult;

    deleteResult = await engineHelpers.helpDeleteEngineBuild(
      { gqlClient, options: superAdminOptions },
      { id: engineBuildId1, engineId: engineId1 }
    );
    expect(deleteResult).toBeDefined();
    expect(deleteResult.deleteEngineBuild).toBeDefined();
    expect(deleteResult.deleteEngineBuild.id).toEqual(engineBuildId1);

    deleteResult = await engineHelpers.helpDeleteEngineBuild(
      { gqlClient, options: superAdminOptions },
      { id: engineBuildId2, engineId: engineId1 }
    );
    expect(deleteResult).toBeDefined();
    expect(deleteResult.deleteEngineBuild).toBeDefined();
    expect(deleteResult.deleteEngineBuild.id).toEqual(engineBuildId2);

    deleteResult = await engineHelpers.helpDeleteEngineBuild(
      { gqlClient, options: superAdminOptions },
      { id: engineBuildId3, engineId: engineId1 }
    );
    expect(deleteResult).toBeDefined();
    expect(deleteResult.deleteEngineBuild).toBeDefined();
    expect(deleteResult.deleteEngineBuild.id).toEqual(engineBuildId3);

    deleteResult = await engineHelpers.helpDeleteEngineBuild(
      { gqlClient, options: superAdminOptions },
      { id: predefinedEngineBuildId, engineId: engineId1 }
    );
    expect(deleteResult).toBeDefined();
    expect(deleteResult.deleteEngineBuild).toBeDefined();
    expect(deleteResult.deleteEngineBuild.id).toEqual(predefinedEngineBuildId);

    // Delete engine and verify it is deleted
    deleteResult = await engineHelpers.helpDeleteEngine({ gqlClient, options: superAdminOptions }, { id: engineId1 });
    expect(deleteResult).toBeDefined();
    expect(deleteResult.deleteEngine).toBeDefined();
    expect(deleteResult.deleteEngine.id).toEqual(engineId1);
  });

  it('get transcription category id', async () => {
    const result = await engineHelpers.helpGetEngineCategories(
      { gqlClient, options: superAdminOptions },
      { type: 'Cognition', name: 'Transcription', limit: 1 }
    );

    const engineCategories = _.get(result, 'engineCategories');
    expect(engineCategories).toBeDefined();
    expect(engineCategories.count).toEqual(1);
    expect(engineCategories.records).toHaveLength(1);
    expect(_.get(engineCategories, 'records[0].id')).toBeDefined();

    categoryId = _.get(engineCategories, 'records[0].id');
  });

  it('create new engine - for testing build with new process', async () => {
    const result = await engineHelpers.helpCreateEngine(
      { gqlClient, options: superAdminOptions },
      { name: testName, categoryId: categoryId, deploymentModel: 'FullyNetworkIsolated' }
    );

    expect(result.createEngine).toBeDefined();
    expect(result.createEngine.id).toBeDefined();
    expect(result.createEngine.name).toEqual(testName);
    expect(result.createEngine.categoryId).toEqual(categoryId);
    expect(result.createEngine.deploymentModel).toEqual('FullyNetworkIsolated');
    expect(result.createEngine.state).toEqual('pending');

    engineId1 = result.createEngine.id;
  });

  it('creates engine build - has dockerImage with private engine', async () => {
    const input = {
      engineId: engineId1,
      dockerImage: dockerImageUploaded
    };

    if (env.includes(local)) {
      input.taskRuntime = { nodeRed: true };
      input.manifest = { runtime: 'NodeRed' };
    }

    const result = await engineHelpers.helpCreateEngineBuild({ gqlClient, options: superAdminOptions }, input);

    const engine = await checkEngineBuildApprovedFromGetEngineBuildQuery(
      result.createEngineBuild.id,
      userTokenAuthorization
    );
    expect(engine.engineBuild.engine.state).toEqual('ready');
    engineBuildId1 = result.createEngineBuild.id;
  });

  it('deploy engine build - new engine build process', async () => {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: superAdminOptions },
      { id: engineBuildId1, engineId: engineId1, action: 'deploy' }
    );
    expect(result.updateEngineBuild).toBeDefined();
    expect(result.updateEngineBuild.status).toEqual('deployed');
  });

  it('creates engine build with taskRuntime null and verifies default runtime { edge: {} }', async () => {
    const result = await engineHelpers.helpCreateEngineBuild(
      { gqlClient, options: superAdminOptions },
      { engineId: engineId1, dockerImage: dockerImageUploaded, taskRuntime: null }
    );

    engineBuildId2 = result.createEngineBuild.id;
    // Validate runtime default value
    expect(result.createEngineBuild.runtime).toEqual({ edge: {} });
  });

  it('creates engine build with default runtime { edge: {} }, updates taskRuntime to null and verifies default runtime { edge: {} }', async () => {
    const result = await engineHelpers.helpCreateEngineBuild(
      { gqlClient, options: superAdminOptions },
      { engineId: engineId1, dockerImage: dockerImageUploaded }
    );

    // Validate runtime default value
    expect(result.createEngineBuild.runtime).toEqual({ edge: {} });
    engineBuildId3 = result.createEngineBuild.id;

    const updateResult = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: superAdminOptions },
      { id: engineBuildId3, engineId: engineId1, action: 'upload', taskRuntime: null, dockerImage: dockerImageUploaded }
    );

    expect(updateResult.updateEngineBuild.runtime).toEqual({ edge: {} });
  });

  it('engine state should be in `active` state and package should be created when applicable', async () => {
    const result = await engineHelpers.helpGetEngine({ gqlClient, options: superAdminOptions }, { id: engineId1 });

    const engine = _.get(result, 'engine');
    expect(engine).toBeDefined();
    expect(engine.id).toEqual(engineId1);
    expect(engine.state).toEqual('active');

    if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
      return;
    }

    result = await packagesHelpers.helpGetPackages(
      { gqlClient, options: superAdminOptions },
      { primaryResourceId: engineId1 }
    );

    expect(result.packages).toBeDefined();
    expect(result.packages.records).toBeDefined();
    expect(result.packages.records.length).toBeGreaterThan(0);
    expect(result.packages.records[0].id).toBeDefined();
    expect(result.packages.records[0].primaryResource).toBeDefined();
    expect(result.packages.records[0].primaryResource.resourceId).toEqual(engineId1);
    expect(result.packages.records[0].primaryResource.resourceType).toEqual('engine');
    enginePackage1 = result.packages.records[0].id;
  });

  it('creates engine build - predefined build id', async () => {
    const result = await engineHelpers.helpCreateEngineBuild(
      { gqlClient, options: superAdminOptions },
      {
        id: predefinedEngineBuildId,
        engineId: engineId1,
        dockerImage: `registry.central.aiware.com/${engineId1}/${predefinedEngineBuildId}`
      }
    );

    expect(result.createEngineBuild).toBeDefined();
    expect(result.createEngineBuild.id).toEqual(predefinedEngineBuildId);
    expect(result.createEngineBuild.status).toEqual('approved');
    expect(result.createEngineBuild.engine.state).toEqual('active');
  });
});

async function checkEngineBuildApprovedFromGetEngineBuildQuery(engineBuildId, authorizaton) {
  let result;
  for (let i = 0; i < 5; i++) {
    await helpers.sleep(4000);
    result = await engineHelpers.helpGetEngineBuild({ gqlClient, options: authorizaton }, { id: engineBuildId });
    if (result.engineBuild.status !== 'fetching') break;
  }

  expect(result.engineBuild).toBeDefined();
  expect(result.engineBuild.id).toBeDefined();
  if (env.includes(local) && result.engineBuild.status !== 'fetching') {
    await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: authorizaton },
      { id: engineBuildId, engineId: result.engineBuild.engine.id, action: 'submit' }
    );
    result = await engineHelpers.helpGetEngineBuild({ gqlClient, options: authorizaton }, { id: engineBuildId });
  }
  expect(result.engineBuild.status).toEqual('approved');
  return result;
}
