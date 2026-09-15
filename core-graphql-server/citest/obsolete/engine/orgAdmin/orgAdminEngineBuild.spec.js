const helpers = require('../../../helpers/index');
const userHelpers = require('../../../helpers/user');
const engineHelpers = require('../../../helpers/engine');
const orgHelper = require('../../../helpers/organization');
const GraphqlClient = require('../../../helpers/gql.js');
const {
  createIsolatedSuperadmin
} = require('../../../helpers/superadminSession');
const _ = require('lodash');
const uuid = require('uuid');
const mockUtil = require('../../../../test/mockUtil')();
const cluster = require('../../../../modules/core-job-server/model/cluster.js');

const config = helpers.config;

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const testName = citestMarker + '_engine_' + Date.now();
const testNameDescriptor =
  citestMarker + ' Transcription-Veritone Inc-Chunk-Test-V3';
const testTemplateTextUploadChunk = mockUtil.getMockEngineTemplate(
  'citest-upload',
  'upload'
);
const predefinedEngineBuildId = citestMarker + '_build_id_' + Date.now();

let categoryId,
  engineId,
  engineBuildId,
  engineBuildNodeRedId,
  engineIdGQLTest,
  draftengineBuildNodeRedId,
  clusterId;
let engineId1, engineBuildId1, enginePackage1, engineBuildId2, engineBuildId3;
let engineIdHub, engineBuildIdHub, engineBuildIdHub1, enginePackageHub;
let userTokenAuthorization;
let automaticPackageCreation;
let engineApprovalWhiteListed = false;

const env = config.env;
const gqlClient = new GraphqlClient(env);

const dockerImageUploaded =
  'registry.central.aiware.com/c308896d-3ba4-4b96-a95b-ad8fa4754888:838d1aa4-6a28-4a59-acf1-6ff346944299';

const local = 'local';
const nodeRed = `
  taskRuntime: {
    nodeRed: true
  }
  manifest: {
    runtime: "NodeRed"
  }`;

describe('citest_engine: org admin engine build new process testing', () => {
  let superAdminOptions, superToken;
  let orgAdminOptions;
  let testSetup, testOrg, testUsers;
  let session;

  beforeAll(async () => {
    // T21: This suite previously ran org/user setup AND several engine/engineBuild
    // operations on the SHARED superadmin session (sys_graphql_citest_superadmin),
    // which is an admin MEMBER of every test org that org creates (createOrganization
    // enrolls the caller via addAdminToOrganization). This suite's own afterAll then
    // calls the real, session-killing delete via helpers.deleteOrganization(...), which
    // enumerates all active members of testOrg and calls removeAllUserSessions(userId)
    // on each — GLOBAL, not org-scoped — deleting every one of the shared superadmin's
    // session tokens, including tokens other concurrent specs (MAX_WORKERS=2) depend on.
    // Same mechanism as T14/T15/T16/T10/T12. Fix: bootstrap via a throwaway superadmin
    // that is a member of no org except its own (createIsolatedSuperadmin), so this
    // spec's own org-delete can never collaterally kill a session anything else needs.
    // See helpers/superadminSession.js and T14's savedSearch.spec.js fix for the
    // established pattern.
    session = await createIsolatedSuperadmin({ gqlClient });
    superToken = session.token;
    superAdminOptions = session.options;
    gqlClient.userAuth = session.options; // preserve implicit-auth call sites (setupTestOrgAndUser below)

    testSetup = await orgHelper.setupTestOrgAndUser(
      { gqlClient, superAdminToken: superToken },
      createOrgAndUserInput
    );

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    testUsers = _.get(testOrg, 'users.records');
    expect(testUsers.length).toEqual(2);

    const adminUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'adminUser';
    });
    orgAdminOptions = adminUser.requestOptions;

    const result = await userHelpers.getMyInfo({
      gqlClient,
      options: orgAdminOptions
    });
    const engineApprovalWhiteListedValue = _.get(
      result,
      'me.organization.jsondata.engineApprovalWhiteListed',
      false
    );
    engineApprovalWhiteListed = engineApprovalWhiteListedValue === 'enabled';
    automaticPackageCreation = _.get(
      result,
      'me.organization.jsondata.features.automaticPackageCreation'
    );
  });

  it('get transcription category id', async () => {
    const result = await engineHelpers.helpGetEngineCategories(
      { gqlClient, options: orgAdminOptions },
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
      {
        name: testName,
        categoryId: categoryId,
        deploymentModel: 'FullyNetworkIsolated'
      }
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

    const result = await engineHelpers.helpCreateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      input
    );

    const engine = await checkEngineBuildApprovedFromGetEngineBuildQuery(
      result.createEngineBuild.id,
      userTokenAuthorization
    );
    expect(engine.engineBuild.engine.state).toEqual('ready');
    engineBuildId1 = result.createEngineBuild.id;
  });

  it('deploy engine build - new engine build process', async () => {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      { id: engineBuildId1, engineId: engineId1, action: 'deploy' }
    );
    expect(result.updateEngineBuild).toBeDefined();
    expect(result.updateEngineBuild.status).toEqual('deployed');
  });

  it('creates engine build with taskRuntime null and verifies default runtime { edge: {} }', async () => {
    const result = await engineHelpers.helpCreateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      {
        engineId: engineId1,
        dockerImage: dockerImageUploaded,
        taskRuntime: null
      }
    );

    engineBuildId2 = result.createEngineBuild.id;
    // Validate runtime default value
    expect(result.createEngineBuild.runtime).toEqual({ edge: {} });
  });

  it('creates engine build with default runtime { edge: {} }, updates taskRuntime to null and verifies default runtime { edge: {} }', async () => {
    const result = await engineHelpers.helpCreateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      { engineId: engineId1, dockerImage: dockerImageUploaded }
    );

    // Validate runtime default value
    expect(result.createEngineBuild.runtime).toEqual({ edge: {} });
    engineBuildId3 = result.createEngineBuild.id;

    const updateResult = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineBuildId3,
        engineId: engineId1,
        action: 'upload',
        taskRuntime: null,
        dockerImage: dockerImageUploaded
      }
    );

    expect(updateResult.updateEngineBuild.runtime).toEqual({ edge: {} });
  });

  it('engine state should be in `active` state and package should be created when applicable', async () => {
    let result = await engineHelpers.helpGetEngine(
      { gqlClient, options: superAdminOptions },
      { id: engineId1 }
    );

    const engine = _.get(result, 'engine');
    expect(engine).toBeDefined();
    expect(engine.id).toEqual(engineId1);
    expect(engine.state).toEqual('active');

    if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
      return;
    }

    result = await packagesHelpers.helpGetPackages(
      { gqlClient, options: orgAdminOptions },
      { primaryResourceId: engineId1 }
    );

    expect(result.packages).toBeDefined();
    expect(result.packages.records).toBeDefined();
    expect(result.packages.records.length).toBeGreaterThan(0);
    expect(result.packages.records[0].id).toBeDefined();
    expect(result.packages.records[0].primaryResource).toBeDefined();
    expect(result.packages.records[0].primaryResource.resourceId).toEqual(
      engineId1
    );
    expect(result.packages.records[0].primaryResource.resourceType).toEqual(
      'engine'
    );
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

  afterAll(async () => {
    if (engineBuildId1 && engineId1) {
      const deleteResult = await engineHelpers.helpDeleteEngineBuild(
        { gqlClient, options: orgAdminOptions },
        { id: engineBuildId1, engineId: engineId1 }
      );

      expect(deleteResult).toBeDefined();
      expect(deleteResult.deleteEngineBuild).toBeDefined();
      expect(deleteResult.deleteEngineBuild.id).toEqual(engineBuildId1);
    }

    if (engineBuildId2 && engineId1) {
      const deleteResult = await engineHelpers.helpDeleteEngineBuild(
        { gqlClient, options: orgAdminOptions },
        { id: engineBuildId2, engineId: engineId1 }
      );

      expect(deleteResult).toBeDefined();
      expect(deleteResult.deleteEngineBuild).toBeDefined();
      expect(deleteResult.deleteEngineBuild.id).toEqual(engineBuildId2);
    }

    if (engineBuildId3 && engineId1) {
      const deleteResult = await engineHelpers.helpDeleteEngineBuild(
        { gqlClient, options: orgAdminOptions },
        { id: engineBuildId3, engineId: engineId1 }
      );

      expect(deleteResult).toBeDefined();
      expect(deleteResult.deleteEngineBuild).toBeDefined();
      expect(deleteResult.deleteEngineBuild.id).toEqual(engineBuildId3);
    }

    if (predefinedEngineBuildId && engineId1) {
      const deleteResult = await engineHelpers.helpDeleteEngineBuild(
        { gqlClient, options: orgAdminOptions },
        { id: predefinedEngineBuildId, engineId: engineId1 }
      );

      expect(deleteResult).toBeDefined();
      expect(deleteResult.deleteEngineBuild).toBeDefined();
      expect(deleteResult.deleteEngineBuild.id).toEqual(
        predefinedEngineBuildId
      );
    }

    if (engineId1) {
      const deleteResult = await engineHelpers.helpDeleteEngine(
        { gqlClient, options: orgAdminOptions },
        { id: engineId1 }
      );

      expect(deleteResult).toBeDefined();
      expect(deleteResult.deleteEngine).toBeDefined();
      expect(deleteResult.deleteEngine.id).toEqual(engineId1);
    }

    if (!_.isEmpty(testSetup.listOptions)) {
      const listUserIds = testSetup.listOptions.map((user) => user.userId);
      await userHelpers.deleteMultiUser({ gqlClient }, listUserIds);
    }

    if (testOrg.id) {
      await helpers.deleteOrganization(
        gqlClient.authUrl,
        testOrg.id,
        superToken
      );
    }

    await session?.cleanup();
  });
});

async function checkEngineBuildApprovedFromGetEngineBuildQuery(
  engineBuildId,
  authorizaton
) {
  let result;
  for (let i = 0; i < 5; i++) {
    await helpers.sleep(4000);
    result = await engineHelpers.helpGetEngineBuild(
      { gqlClient, options: authorizaton },
      { id: engineBuildId }
    );
    if (result.engineBuild.status !== 'fetching') break;
  }

  expect(result.engineBuild).toBeDefined();
  expect(result.engineBuild.id).toBeDefined();

  if (env.includes(local) && result.engineBuild.status !== 'fetching') {
    await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: authorizaton },
      {
        id: engineBuildId,
        engineId: result.engineBuild.engine.id,
        action: 'submit'
      }
    );
    result = await engineHelpers.helpGetEngineBuild(
      { gqlClient, options: authorizaton },
      { id: engineBuildId }
    );
  }
  expect(result.engineBuild.status).toEqual('approved');
  return result;
}

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-engine-' + uuid.v4(),
    businessUnit: 'Legal',
    types: ['agency', 'broadcaster'],
    kvp: {
      features: {
        enableRBACFeature: 'disabled'
      },
      billing: {
        pausedProcessing: false
      }
    },
    isLimitEnforced: true,
    remainingBudget: 10000,
    apps: [
      {
        applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
        applicationKey: 'cms'
      },
      isDesktopAppEnabled
        ? null
        : {
            applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
            applicationKey: 'admin'
          },
      {
        applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
        applicationKey: 'developer'
      },
      {
        applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
        applicationKey: 'discovery'
      }
    ].filter((app) => app)
  },
  userInputs: [
    {
      key: 'adminUser',
      name: `${citestMarker}-admin-user-${uuid.v4()}@localhost`,
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266' // Desktop
      ].filter((roleId) => roleId)
    }
  ]
};
