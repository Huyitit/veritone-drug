const helpers = require('../../../helpers/index');
const userHelpers = require('../../../helpers/user');
const engineHelpers = require('../../../helpers/engine');
const orgHelper = require('../../../helpers/organization');
const GraphqlClient = require('../../../helpers/gql.js');
const { createIsolatedSuperadmin } = require('../../../helpers/superadminSession');
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

describe('citest_engine: org admin basic engine tests', () => {
  let superAdminOptions, superToken;
  let orgAdminOptions;
  let testSetup, testOrg, testUsers;
  let isolatedSuperadmin;

  beforeAll(async () => {
    // T20/T14: This suite previously bootstrapped its test org via the SHARED superadmin session
    // (sys_graphql_citest_superadmin) through gqlClient.connect(). That account is auto-enrolled as
    // an admin MEMBER of every org it creates (createOrganization enrolls the caller via
    // addAdminToOrganization). Under MAX_WORKERS>1, any other spec's org-delete / user-delete /
    // OLP-toggle enumerates the members of its own org and calls the GLOBAL removeAllUserSessions on
    // each — which deletes EVERY one of the shared superadmin's session tokens, including this
    // suite's, at any point during the run. Bearer validation is per-token-key existence, so a
    // killed token never recovers by re-querying it. The fix (same guardrail as T10/T12/T14) is a
    // throwaway superadmin that is a member of no org except its own, so no other spec can enumerate
    // or kill its session. See helpers/superadminSession.js.
    //
    // Both superadmin channels this suite uses map onto the isolated session:
    //   1) the implicit gqlClient.userAuth that setupTestOrgAndUser relies on to create the test org
    //      and its users (createTestOrganization / createMultiUser pass no explicit options), and
    //   2) the explicit superToken passed to setupTestOrgAndUser (for impersonation) and to the
    //      real, session-killing helpers.deleteOrganization REST call in afterAll.
    isolatedSuperadmin = await createIsolatedSuperadmin({ gqlClient });
    expect(isolatedSuperadmin.token).toBeDefined();
    superToken = isolatedSuperadmin.token;
    superAdminOptions = isolatedSuperadmin.options;
    // createIsolatedSuperadmin leaves gqlClient.userAuth pointed at the bootstrap (shared) SA;
    // userLogin does not update it. Point implicit-auth call sites at the isolated SA before setup.
    gqlClient.userAuth = isolatedSuperadmin.options;

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

  it('throw create engine failed - invalid category id', async () => {
    await expect(
      engineHelpers.helpCreateEngine(
        { gqlClient, options: orgAdminOptions },
        {
          deploymentModel: 'FullyNetworkIsolated',
          name: testName,
          fields: [
            {
              max: 1000,
              min: 100,
              type: 'Number',
              name: 'Test field',
              label: 'test field'
            }
          ],
          categoryId: `${categoryId}_invalid`
        }
      )
    ).rejects.toThrow('invalid_input');
  });

  it('create engine failed - invalid name', async () => {
    const invalidName = 'x'.repeat(201);
    await expect(
      engineHelpers.helpCreateEngine(
        { gqlClient, options: orgAdminOptions },
        {
          deploymentModel: 'FullyNetworkIsolated',
          name: invalidName,
          fields: [
            {
              max: 1000,
              min: 100,
              type: 'Number',
              name: 'Test field',
              label: 'test field'
            }
          ],
          categoryId: categoryId,
          manifest: { engineMode: 'chunk' }
        }
      )
    ).rejects.toThrow('Invalid name provided');
  });

  it('create engine - transcription', async () => {
    const result = await engineHelpers.helpCreateEngine(
      { gqlClient, options: orgAdminOptions },
      {
        deploymentModel: 'FullyNetworkIsolated',
        fields: [
          {
            max: 2,
            min: 1,
            type: 'Number',
            name: 'Test name',
            label: 'test label'
          }
        ],
        categoryId: categoryId,
        price: 100,
        priceDimension: 'PRICE_PER_TASK',
        logoPath: 'http://localhost/logo',
        iconPath: 'http://localhost/icon',
        useCases: ['case 1', 'case 2'],
        industries: ['industry 1', 'industry 2'],
        manifest: { engineMode: 'chunk' },
        testingDetails: {
          email: 'dev@veritone.com',
          mediaFileUri: 'http://localhost/testingDetails/mediaFileUri',
          customFields: { foo: 'bar' }
        },
        isPublic: false,
        libraryRequired: true,
        edgeVersion: 1,
        cpuResourceMcpu: 2048,
        gpuSupported: 'aws_p2',
        website: 'https://veritone.com',
        jwtRights: {
          roles: [
            {
              roleName: 'adapter',
              taskRights: [
                'developer.engine.read',
                'job:create',
                'job.read',
                'cms.access',
                'cms.sources.read',
                'cms.sources.update',
                'task:read'
              ],
              assetRights: ['recording:create', 'recording:update']
            }
          ]
        },
        distributionType: 'private'
      }
    );

    const meQuery = `query {
      me {
        organization {
          name
        }
      }
    }`;
    const me = await gqlClient.query(meQuery, null, orgAdminOptions);
    const orgName = _.get(me, 'me.organization.name');
    const createEngine = _.get(result, 'createEngine');
    expect(createEngine).toBeDefined();
    expect(createEngine.id).toBeDefined();
    expect(createEngine.name).toEqual(
      `Transcription-${_.replace(orgName, /[.,]/g, '')}-Chunk-V1`
    );
    expect(createEngine.state).toEqual('pending');
    expect(createEngine.categoryId).toEqual(categoryId);
    expect(createEngine.deploymentModel).toEqual('FullyNetworkIsolated');
    expect(createEngine.fields).toHaveLength(1);
    expect(
      _.isEqual(createEngine.fields[0], {
        max: 2,
        min: 1,
        type: 'Number',
        name: 'Test name',
        label: 'test label'
      })
    ).toEqual(true);
    expect(createEngine.createsTDO).toEqual(false);
    expect(createEngine.price).toEqual(100);
    expect(createEngine.priceDimension).toEqual('PRICE_PER_TASK');
    expect(createEngine.logoPath).toEqual('http://localhost/logo');
    expect(createEngine.iconPath).toEqual('http://localhost/icon');
    expect(createEngine.libraryRequired).toEqual(true);
    expect(createEngine.useCases).toHaveLength(2);
    expect(createEngine.industries).toHaveLength(2);
    expect(createEngine.edgeVersion).toEqual(1);
    expect(createEngine.cpuResourceMcpu).toEqual(2048);
    expect(createEngine.gpuSupported).toEqual('aws_p2');
    expect(createEngine.website).toEqual('https://veritone.com');
    expect(_.isEqual(createEngine.manifest, { engineMode: 'chunk' })).toEqual(
      true
    );
    expect(
      _.isEqual(createEngine.testingDetails, {
        email: 'dev@veritone.com',
        mediaFileUri: 'http://localhost/testingDetails/mediaFileUri',
        customFields: { foo: 'bar' }
      })
    ).toEqual(true);
    expect(createEngine.isPublic).toEqual(false);
    expect(createEngine.distributionType).toEqual('private');
    expect(createEngine.jwtRights).toBeDefined();
    expect(_.get(createEngine, 'jwtRights.roles')).toHaveLength(1);
    expect(_.get(createEngine, 'jwtRights.roles[0]', createEngine)).toEqual({
      roleName: 'adapter',
      taskRights: [
        'developer.engine.read',
        'job:create',
        'job.read',
        'cms.access',
        'cms.sources.read',
        'cms.sources.update',
        'task:read'
      ],
      assetRights: ['recording:create', 'recording:update']
    });

    engineId = createEngine.id;
  });

  it('update the test engine - jwtRights - not allow', async function () {
    await expect(
      engineHelpers.helpUpdateEngine(
        { gqlClient, options: orgAdminOptions },
        {
          id: engineId,
          isPublic: true,
          jwtRights: {
            roles: [
              {
                roleName: 'adapter',
                taskRights: [
                  'job:create',
                  'job.read',
                  'cms.access',
                  'cms.sources.read',
                  'cms.sources.update',
                  'task:read'
                ],
                assetRights: ['recording:update']
              }
            ]
          }
        }
      )
    ).rejects.toThrow('not allow to update jwtRights for public engines');
  });

  it('update the test engine', async () => {
    const result = await engineHelpers.helpUpdateEngine(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineId,
        name: testNameDescriptor,
        jwtRights: {
          roles: [
            {
              roleName: 'adapter',
              taskRights: [
                'job:create',
                'job.read',
                'cms.access',
                'cms.sources.read',
                'cms.sources.update',
                'task:read'
              ],
              assetRights: ['recording:update']
            }
          ]
        },
        isPublic: false,
        categoryId: categoryId,
        price: 100,
        priceDimension: 'PRICE_PER_TASK',
        edgeVersion: 3,
        fields: {
          max: 1000,
          min: 100,
          type: 'Number',
          info: 'test',
          name: 'test field',
          label: 'test field',
          options: [{ key: 'foo', value: 'bar' }],
          defaultValue: 'test default',
          defaultValues: ['test1', 'test']
        },
        iconPath: 'http://localhost/icon_test',
        logoPath: 'http://localhost/logo_test',
        libraryRequired: false,
        useCases: ['test', 'help'],
        industries: ['foo', 'bar'],
        manifest: { engineMode: 'chunk', foo: 'bar' },
        cpuResourceMcpu: 256,
        gpuSupported: 'aws_p3',
        website: 'https://veritoneone.com/',
        distributionType: 'org_locked'
      }
    );

    const updateEngine = _.get(result, 'updateEngine');
    expect(updateEngine).toBeDefined();
    expect(updateEngine.id).toEqual(engineId);
    expect(updateEngine.name).toEqual(testNameDescriptor);
    expect(updateEngine.jwtRights).toBeDefined();
    expect(_.get(updateEngine, 'jwtRights.roles')).toHaveLength(1);
    expect(_.get(updateEngine, 'jwtRights.roles[0]')).toEqual({
      roleName: 'adapter',
      taskRights: [
        'job:create',
        'job.read',
        'cms.access',
        'cms.sources.read',
        'cms.sources.update',
        'task:read'
      ],
      assetRights: ['recording:update']
    });
    expect(updateEngine.isPublic).toEqual(false);
    expect(updateEngine.categoryId).toEqual(categoryId);
    expect(updateEngine.price).toEqual(100);
    expect(updateEngine.priceDimension).toEqual('PRICE_PER_TASK');
    expect(updateEngine.edgeVersion).toEqual(3);
    expect(updateEngine.fields).toHaveLength(1);
    expect(
      _.isEqual(updateEngine.fields[0], {
        max: 1000,
        min: 100,
        type: 'Number',
        info: 'test',
        name: 'test field',
        label: 'test field',
        options: [{ key: 'foo', value: 'bar' }],
        defaultValue: 'test default',
        defaultValues: ['test1', 'test']
      })
    ).toEqual(true);
    expect(updateEngine.iconPath).toEqual('http://localhost/icon_test');
    expect(updateEngine.logoPath).toEqual('http://localhost/logo_test');
    expect(updateEngine.libraryRequired).toEqual(false);
    expect(updateEngine.useCases).toHaveLength(2);
    expect(updateEngine.useCases[0]).toEqual('test');
    expect(updateEngine.useCases[1]).toEqual('help');
    expect(updateEngine.industries).toHaveLength(2);
    expect(updateEngine.industries[0]).toEqual('foo');
    expect(updateEngine.industries[1]).toEqual('bar');
    expect(
      _.isEqual(updateEngine.manifest, { engineMode: 'chunk', foo: 'bar' })
    ).toEqual(true);
    expect(updateEngine.cpuResourceMcpu).toEqual(256);
    expect(updateEngine.gpuSupported).toEqual('aws_p3');
    expect(updateEngine.website).toEqual('https://veritoneone.com/');
    expect(updateEngine.state).toEqual('pending');
    expect(updateEngine.distributionType).toEqual('org_locked');
  });

  it('update the test engine with isPublic=true before creating engine build', async () => {
    const result = await engineHelpers.helpUpdateEngine(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineId,
        isPublic: true
      }
    );

    const updateEngine = _.get(result, 'updateEngine');
    expect(updateEngine).toBeDefined();
    expect(updateEngine.id).toEqual(engineId);
    expect(updateEngine.isPublic).toEqual(true);
  });

  it('creates engine build', async () => {
    const result = await engineHelpers.helpCreateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      {
        engineId: engineId
      }
    );

    const createdEngineBuild = _.get(result, 'createEngineBuild');
    expect(createdEngineBuild).toBeDefined();
    expect(createdEngineBuild.id).toBeDefined();
    expect(createdEngineBuild.status).toEqual('fetching');
    engineBuildId = createdEngineBuild.id;
  });

  it('invalidate engine build', async () => {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineBuildId,
        engineId: engineId,
        action: 'invalidate'
      }
    );

    const updateEngineBuild = _.get(result, 'updateEngineBuild');
    expect(updateEngineBuild).toBeDefined();
    expect(updateEngineBuild.id).toEqual(engineBuildId);
    expect(updateEngineBuild.status).toEqual('invalid');
  });

  it('create engine build - nodeRed runtime', async () => {
    const result = await engineHelpers.helpCreateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      {
        engineId: engineId,
        taskRuntime: { nodeRed: true },
        manifest: { runtime: 'NodeRed' }
      }
    );

    const createEngineBuild = _.get(result, 'createEngineBuild');
    expect(createEngineBuild).toBeDefined();
    expect(createEngineBuild.id).toBeDefined();
    expect(createEngineBuild.status).toEqual('available');
    // for SA
    expect(createEngineBuild.validStateActions).toHaveLength(3);
    expect(createEngineBuild.validStateActions).toEqual(
      expect.arrayContaining(['submit', 'delete', 'invalidate'])
    );
    engineBuildNodeRedId = createEngineBuild.id;
  });

  it('submit engine build - nodeRed runtime', async () => {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineBuildNodeRedId,
        engineId: engineId,
        action: 'submit'
      }
    );

    const updateEngineBuild = _.get(result, 'updateEngineBuild');
    expect(updateEngineBuild).toBeDefined();
    expect(updateEngineBuild.id).toEqual(engineBuildNodeRedId);
    expect(updateEngineBuild.engineId).toEqual(engineId);

    /*
      If the user has engineApprovalWhiteListed = enabled, the build status will be 'approved' automatically when run build engine
      and cannot be change back status to 'disapproved'
      Otherwise if the user has engineApprovalWhiteListed = false the build status will be 'pending'
    */
    let assertCheckStatus = 'pending';
    let assertCheckAction = ['approve', 'disapprove', 'delete', 'invalidate'];
    if (engineApprovalWhiteListed) {
      assertCheckStatus = 'approved';
      assertCheckAction = ['deploy', 'delete', 'invalidate'];
    }
    expect(updateEngineBuild.status).toEqual(assertCheckStatus);
    // for SA
    expect(updateEngineBuild.validStateActions).toHaveLength(
      assertCheckAction.length
    );
    expect(updateEngineBuild.validStateActions).toEqual(
      expect.arrayContaining(assertCheckAction)
    );
  });

  it('update the test engine with isPublic=false', async () => {
    const result = await engineHelpers.helpUpdateEngine(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineId,
        isPublic: false
      }
    );

    const updateEngine = _.get(result, 'updateEngine');
    expect(updateEngine).toBeDefined();
    expect(updateEngine.id).toEqual(engineId);
    expect(updateEngine.isPublic).toEqual(false);
  });

  it('update engine build taskRuntime - nodeRed runtime', async () => {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineBuildNodeRedId,
        engineId: engineId,
        action: 'update',
        taskRuntime: { edge: 'bar' }
      }
    );

    const updateEngineBuild = _.get(result, 'updateEngineBuild');
    expect(updateEngineBuild).toBeDefined();
    expect(updateEngineBuild.id).toEqual(engineBuildNodeRedId);
  });

  it('disapprove engine build - nodeRed runtime', async function () {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineBuildNodeRedId,
        engineId: engineId,
        action: 'disapprove'
      }
    );

    /*
      If the user has engineApprovalWhiteListed = enabled, the build status will be 'approved' automatically when run build engine
      and cannot be change back status to 'disapproved'
      Otherwise if the user has engineApprovalWhiteListed = false the build status will be 'pending'
    */
    if (engineApprovalWhiteListed) {
      expect(result).rejects.toThrow(/not a valid build action/);
    } else {
      const updateEngineBuild = _.get(result, 'updateEngineBuild');
      expect(updateEngineBuild).toBeDefined();
      expect(updateEngineBuild.id).toEqual(engineBuildNodeRedId);
      expect(updateEngineBuild.engineId).toEqual(engineId);
      expect(updateEngineBuild.status).toEqual('disapproved');
      // for SA
      expect(updateEngineBuild.validStateActions).toHaveLength(2);
      expect(updateEngineBuild.validStateActions).toEqual(
        expect.arrayContaining(['approve', 'delete'])
      );
    }
  });

  it('approve engine build - nodeRed runtime', async function () {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineBuildNodeRedId,
        engineId: engineId,
        action: 'approve'
      }
    );

    /*
      If the user has engineApprovalWhiteListed = enabled, the build status will be 'approved' automatically automatically when run build engine
      and cannot be change back status to 'disapproved' or re-try 'approved'
      Otherwise if the user has engineApprovalWhiteListed = false the build status will be 'pending'
    */
    if (engineApprovalWhiteListed) {
      expect(result).rejects.toThrow(/not a valid build action/);
    } else {
      const updateEngineBuild = _.get(result, 'updateEngineBuild');
      expect(updateEngineBuild).toBeDefined();
      expect(updateEngineBuild.id).toEqual(engineBuildNodeRedId);
      expect(updateEngineBuild.engineId).toEqual(engineId);
      expect(updateEngineBuild.status).toEqual('approved');
      // for SA
      expect(updateEngineBuild.validStateActions).toHaveLength(3);
      expect(updateEngineBuild.validStateActions).toEqual(
        expect.arrayContaining(['deploy', 'delete', 'invalidate'])
      );
    }
  });

  it('disable engine - transcription', async () => {
    const result = await engineHelpers.helpEngineWorkflow(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineId,
        action: 'disable'
      }
    );

    const engineWorkflow = _.get(result, 'engineWorkflow');
    expect(engineWorkflow).toBeDefined();
    expect(engineWorkflow.id).toEqual(engineId);
    expect(engineWorkflow.state).toEqual('disabled');
  });

  it('enable engine - transcription', async () => {
    const result = await engineHelpers.helpEngineWorkflow(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineId,
        action: 'enable'
      }
    );

    const engineWorkflow = _.get(result, 'engineWorkflow');
    expect(engineWorkflow).toBeDefined();
    expect(engineWorkflow.id).toEqual(engineId);
    expect(engineWorkflow.state).toEqual('ready');
  });

  it('update engine - transcription', async () => {
    const result = await engineHelpers.helpUpdateEngine(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineId,
        name: testName,
        description: `${testName}_edited`,
        deploymentModel: 'MostlyNetworkIsolated',
        testingDetails: {
          email: 'dev_edited@veritone.com',
          mediaFileUri: 'http://localhost/testingDetails/mediaFileUri',
          customFields: { foo: 'bar' }
        }
      }
    );

    const updateEngine = _.get(result, 'updateEngine');
    expect(updateEngine).toBeDefined();
    expect(updateEngine.id).toEqual(engineId);
    expect(updateEngine.deploymentModel).toEqual('MostlyNetworkIsolated');
    expect(updateEngine.fields).toHaveLength(1);
    expect(updateEngine.name).toEqual(testName);
    expect(_.get(updateEngine, 'testingDetails.email')).toEqual(
      'dev_edited@veritone.com'
    );
    // expect is "ready" since previously deployed engine builds were paused when engine was disabled
    expect(updateEngine.state).toEqual('ready');
  });

  it('update engine template - to launch single engine job', async () => {
    const query = `mutation {
      updateEngine(input: {
        id: "${engineId}"
        standaloneJobTemplates: {
          type: Upload
          template: ${JSON.stringify(testTemplateTextUploadChunk)}
        }
      }) {
        id
        standaloneJobTemplates {
          type
          template
        }
        state
      }
    }`;
    const result = await gqlClient.query(query, null, orgAdminOptions);

    const updateEngine = _.get(result, 'updateEngine');
    expect(updateEngine).toBeDefined();
    expect(updateEngine.id).toEqual(engineId);
    expect(updateEngine.standaloneJobTemplates).toHaveLength(1);
    expect(updateEngine.standaloneJobTemplates[0].type).toEqual('Upload');
  });

  it('deploy engine build - nodeRed runtime', async () => {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      {
        id: engineBuildNodeRedId,
        engineId: engineId,
        action: 'deploy'
      }
    );

    const updateEngineBuild = _.get(result, 'updateEngineBuild');
    expect(updateEngineBuild).toBeDefined();
    expect(updateEngineBuild.id).toEqual(engineBuildNodeRedId);
    expect(updateEngineBuild.engineId).toEqual(engineId);
    expect(updateEngineBuild.status).toEqual('deployed');
  });

  it('engine state should be in `active` state', async () => {
    const result = await checkEngineState(engineId, orgAdminOptions);
    const engine = _.get(result, 'engine');
    expect(engine).toBeDefined();
    expect(engine.id).toEqual(engineId);
    expect(engine.state).toEqual('active');
  });

  it('should create cluster - to test launching single engine job', async () => {
    const result = await engineHelpers.helpCreateCluster(
      { gqlClient, options: orgAdminOptions },
      {
        name: `${testName}_cluster`,
        allowedEngines: [],
        dockerCredentials: {}
      }
    );

    const createCluster = _.get(result, 'createCluster');
    expect(createCluster).toBeDefined();
    expect(createCluster.id).toBeDefined();
    expect(createCluster.edgeVersion).toEqual(3);
    clusterId = createCluster.id;
  });

  it('should launch single engine job', async () => {
    const result = await engineHelpers.helpLaunchSingleEngineJob(
      { gqlClient, options: orgAdminOptions },
      {
        engineId: engineId,
        uploadUrl: 'http://localhost',
        clusterId: clusterId,
        priority: 1
      }
    );

    const launchSingleEngineJob = _.get(result, 'launchSingleEngineJob');

    expect(launchSingleEngineJob).toBeDefined();
    expect(launchSingleEngineJob.id).toBeDefined();
    expect(launchSingleEngineJob.clusterId).toEqual(clusterId);

    const tasks = launchSingleEngineJob.tasks.records;
    const wsaTask = _.filter(tasks, {
      engineId: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255'
    });

    expect(wsaTask[0].executionPreferences.priority).toEqual(1);
  });

  it('should launch single engine job - use the "fields.clusterId" instead of "clusterId"', async () => {
    const result = await engineHelpers.helpLaunchSingleEngineJob(
      { gqlClient, options: orgAdminOptions },
      {
        engineId: engineId,
        uploadUrl: 'http://localhost',
        priority: 1,
        fields: [{ fieldName: 'clusterId', fieldValue: clusterId }]
      }
    );

    const launchSingleEngineJob = _.get(result, 'launchSingleEngineJob');
    expect(launchSingleEngineJob).toBeDefined();
    expect(launchSingleEngineJob.id).toBeDefined();
    expect(launchSingleEngineJob.clusterId).toEqual(clusterId);

    const tasks = launchSingleEngineJob.tasks.records;
    const wsaTask = _.filter(tasks, {
      engineId: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255'
    });

    expect(wsaTask[0].executionPreferences.priority).toEqual(1);
  });

  describe('should throw an error when launching single engine job - engine with edgeVersion less than 3', () => {
    let clusterIdWithV1Edge;
    it("should update engine's edge_version from 3 to 1", async () => {
      const result = await engineHelpers.helpUpdateEngine(
        { gqlClient, options: orgAdminOptions },
        { id: engineId, edgeVersion: 1 }
      );

      const updateEngine = _.get(result, 'updateEngine');
      expect(updateEngine).toBeDefined();
      expect(updateEngine.id).toEqual(engineId);
      expect(updateEngine.edgeVersion).toEqual(1);
    });

    it('should create cluster with edge_version=1', async () => {
      const result = await engineHelpers.helpCreateCluster(
        { gqlClient, options: orgAdminOptions },
        {
          name: `${testName}_cluster`,
          allowedEngines: [],
          dockerCredentials: {},
          edgeVersion: 1
        }
      );
      const createCluster = _.get(result, 'createCluster');
      expect(createCluster).toBeDefined();
      expect(createCluster.id).toBeDefined();
      expect(createCluster.edgeVersion).toEqual(1);
      clusterIdWithV1Edge = createCluster.id;
    });

    it('should throw an error when launching single engine job with cluster (edgeVersion=1) and engine (edgeVersion=1)', async () => {
      await expect(
        engineHelpers.helpLaunchSingleEngineJob(
          { gqlClient, options: orgAdminOptions },
          {
            engineId: engineId,
            uploadUrl: 'http://localhost',
            fields: [
              { fieldName: 'clusterId', fieldValue: clusterIdWithV1Edge }
            ],
            priority: 1
          }
        )
      ).rejects.toThrow('invalid_input');
    });

    it("rollback the engine's edge_version from 1 to 3 for other tests", async () => {
      const result = await engineHelpers.helpUpdateEngine(
        { gqlClient, options: orgAdminOptions },
        { id: engineId, edgeVersion: 3 }
      );

      const updateEngine = _.get(result, 'updateEngine');

      expect(updateEngine).toBeDefined();
      expect(updateEngine.id).toEqual(engineId);
      expect(updateEngine.edgeVersion).toEqual(3);
    });

    it('should delete the cluster', async () => {
      const result = await engineHelpers.helpDeleteCluster(
        { gqlClient, options: orgAdminOptions },
        { id: clusterIdWithV1Edge }
      );
      const deleteCluster = _.get(result, 'deleteCluster');
      expect(deleteCluster).toBeDefined();
      expect(deleteCluster.id).toEqual(clusterIdWithV1Edge);
    });
  });

  it('pause engine build - nodeRed runtime', async () => {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      { id: engineBuildNodeRedId, engineId: engineId, action: 'pause' }
    );

    const updateEngineBuild = _.get(result, 'updateEngineBuild');

    expect(updateEngineBuild).toBeDefined();
    expect(updateEngineBuild.id).toEqual(engineBuildNodeRedId);
    expect(updateEngineBuild.status).toEqual('paused');

    // for SA
    expect(updateEngineBuild.validStateActions).toHaveLength(3);
    expect(updateEngineBuild.validStateActions).toEqual(
      expect.arrayContaining(['unpause', 'delete', 'invalidate'])
    );
  });

  it('unpause engine build - nodeRed runtime - not valid buildState', async () => {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: orgAdminOptions },
      { id: engineBuildNodeRedId, engineId: engineId, action: 'unpause' }
    );

    const updateEngineBuild = _.get(result, 'updateEngineBuild');

    expect(updateEngineBuild).toBeDefined();
    expect(updateEngineBuild.id).toEqual(engineBuildNodeRedId);
    expect(updateEngineBuild.status).toEqual('approved');
  });

  afterAll(async () => {
    if (engineBuildId && engineId) {
      const deleteResult = await engineHelpers.helpDeleteEngineBuild(
        { gqlClient, options: orgAdminOptions },
        { id: engineBuildId, engineId: engineId }
      );

      expect(deleteResult).toBeDefined();
      expect(deleteResult.deleteEngineBuild).toBeDefined();
      expect(deleteResult.deleteEngineBuild.id).toEqual(engineBuildId);
    }

    if (engineId) {
      const deleteResult = await engineHelpers.helpEngineWorkflow(
        { gqlClient, options: orgAdminOptions },
        { id: engineId, action: 'disable' }
      );

      expect(deleteResult).toBeDefined();
      expect(deleteResult.engineWorkflow).toBeDefined();
      expect(deleteResult.engineWorkflow.id).toEqual(engineId);
      expect(deleteResult.engineWorkflow.state).toEqual('disabled');

      const deleteResultEngine = await engineHelpers.helpDeleteEngine(
        { gqlClient, options: orgAdminOptions },
        { id: engineId }
      );

      expect(deleteResultEngine).toBeDefined();
      expect(deleteResultEngine.deleteEngine).toBeDefined();
      expect(deleteResultEngine.deleteEngine.id).toEqual(engineId);
    }

    if (clusterId) {
      const deleteResult = await engineHelpers.helpDeleteCluster(
        { gqlClient, options: orgAdminOptions },
        { id: clusterId }
      );
      expect(deleteResult).toBeDefined();
      expect(deleteResult.deleteCluster).toBeDefined();
      expect(deleteResult.deleteCluster.id).toEqual(clusterId);
    }

    if (!_.isEmpty(testSetup.listOptions)) {
      const listUserIds = testSetup.listOptions.map((user) => user.userId);
      await userHelpers.deleteMultiUser({ gqlClient }, listUserIds);
    }

    if (testOrg.id) {
      // Uses superToken (now the isolated SA's token) for the real, session-killing REST delete.
      // Must run BEFORE cleanup() so the isolated SA's token is still valid here.
      await helpers.deleteOrganization(
        gqlClient.authUrl,
        testOrg.id,
        superToken
      );
    }

    // Tear down the throwaway isolated superadmin org+user last (its cleanup deletes issue via a
    // fresh bootstrap connect and are .catch()-wrapped, so this is non-fatal and order-safe).
    await isolatedSuperadmin?.cleanup();
  });
});

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

async function checkEngineState(engineId, authorizaton) {
  let result;
  for (let i = 0; i < 5; i++) {
    await helpers.sleep(4000);
    result = await engineHelpers.helpGetEngine(
      { gqlClient, options: authorizaton },
      { id: engineId }
    );
    const engineState = _.get(result, 'engine.state');
    if (engineState === 'active') {
      break;
    }
  }
  expect(result.engine.state).toEqual('active');
  return result;
}
