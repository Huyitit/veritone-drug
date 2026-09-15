const helpers = require('../../helpers/index.js');
const userHelpers = require('../../helpers/user.js');
const engineHelpers = require('../../helpers/engine.js');
const GraphqlClient = require('../../helpers/gql.js');
const _ = require('lodash');
const cluster = require('../../../modules/core-job-server/model/cluster.js');
const mockUtil = require('../../../test/mockUtil.js')();
const uuid = require('uuid');

const config = helpers.config;

const citestMarker = global.citestMarker || 'citest-should-delete';
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
let superAdminOptions;
let automaticPackageCreation;
let schemaId;
let engineWithValidSchema;
/*
 Very basic job creation test that pass 100%
 on every environment.
*/
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

describe('citest_engine: basic engine tests', () => {
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
    const engineApprovalWhiteListedValue = _.get(
      result,
      'me.organization.jsondata.engineApprovalWhiteListed',
      false
    );
    engineApprovalWhiteListed = engineApprovalWhiteListedValue === 'enabled';
    // this feature is undefined in ai13s but the following code checks for "disabled" value
    automaticPackageCreation = _.get(
      result,
      'me.organization.jsondata.features.automaticPackageCreation'
    );
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

  it('get engine and draft build for citest', async () => {
    const result = await engineHelpers.helpGetEngines(
      { gqlClient, options: superAdminOptions },
      {
        createsTDO: false,
        state: ['active'],
        limit: 1,
        name: 'CITest Engine 20221219',
        buildId: 'adf4e54a-36f1-4421-bb44-73ac8d375e91',
        buildStatus: ['available', 'paused', 'approved', 'invalid']
      }
    );

    const engineGQLTest = _.get(result, 'engines.records[0]');
    expect(engineGQLTest).toBeDefined();
    expect(engineGQLTest.id).toBeDefined();
    engineIdGQLTest = engineGQLTest.id;

    const draftEngineBuild = _.get(
      result,
      'engines.records[0].builds.records[0]'
    );

    expect(draftEngineBuild).toBeDefined();
    expect(draftEngineBuild.id).toBeDefined();
    draftengineBuildNodeRedId = draftEngineBuild.id;
  });

  it('upload engine build - citest engine', async () => {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: superAdminOptions },
      {
        id: draftengineBuildNodeRedId,
        engineId: engineIdGQLTest,
        action: 'upload',
        dockerImage: `docker.aws-prod.veritone.com/validated/${engineIdGQLTest}:${draftengineBuildNodeRedId}`
      }
    );

    const updateEngineBuild = _.get(result, 'updateEngineBuild');
    expect(updateEngineBuild).toBeDefined();
    expect(updateEngineBuild.id).toEqual(draftengineBuildNodeRedId);
  });

  it('throw create engine failed - invalid category id', async () => {
    await expect(
      engineHelpers.helpCreateEngine(
        { gqlClient, options: 'testToken' },
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
        { gqlClient, options: 'testToken' },
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

  // TODO: we would have to add the jwtRights tests
  // after AIW-2161 deployed.
  it('create engine - transcription', async () => {
    const result = await engineHelpers.helpCreateEngine(
      { gqlClient, options: superAdminOptions },
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
    const me = await gqlClient.query(meQuery, null, superAdminOptions);
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

  // Temporarity ignore this test because currently this field is not exists on DEV
  // The Post Test step before deploy will be failed
  it('update the test engine - jwtRights - not allow', async function () {
    await expect(
      engineHelpers.helpUpdateEngine(
        { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: superAdminOptions },
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

  // set isPublic to true to disable automatic approval of engine builds when submitting them for non-public engines.
  it('update the test engine with isPublic=true before creating engine build', async () => {
    const result = await engineHelpers.helpUpdateEngine(
      { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: superAdminOptions },
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

  // set isPublic to false for the old flow
  it('update the test engine with isPublic=false', async () => {
    const result = await engineHelpers.helpUpdateEngine(
      { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: 'testToken' },
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
      { gqlClient, options: 'testToken' },
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
      { gqlClient, options: 'testToken' },
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
    const result = await gqlClient.query(query, null);

    const updateEngine = _.get(result, 'updateEngine');
    expect(updateEngine).toBeDefined();
    expect(updateEngine.id).toEqual(engineId);
    expect(updateEngine.standaloneJobTemplates).toHaveLength(1);
    expect(updateEngine.standaloneJobTemplates[0].type).toEqual('Upload');
  });

  // with runtime engine build -> will bypass VDA services and change status directly to "deployed"
  it('deploy engine build - nodeRed runtime', async () => {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: superAdminOptions },
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
    const result = await checkEngineState(engineId, superAdminOptions);
    const engine = _.get(result, 'engine');
    expect(engine).toBeDefined();
    expect(engine.id).toEqual(engineId);
    expect(engine.state).toEqual('active');
  });

  it('should create cluster - to test launching single engine job', async () => {
    const result = await engineHelpers.helpCreateCluster(
      { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: superAdminOptions },
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
        { gqlClient, options: superAdminOptions },
        { id: engineId, edgeVersion: 1 }
      );

      const updateEngine = _.get(result, 'updateEngine');
      expect(updateEngine).toBeDefined();
      expect(updateEngine.id).toEqual(engineId);
      expect(updateEngine.edgeVersion).toEqual(1);
    });

    it('should create cluster with edge_version=1', async () => {
      const result = await engineHelpers.helpCreateCluster(
        { gqlClient, options: superAdminOptions },
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
          { gqlClient, options: superAdminOptions },
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
        { gqlClient, options: superAdminOptions },
        { id: engineId, edgeVersion: 3 }
      );

      const updateEngine = _.get(result, 'updateEngine');

      expect(updateEngine).toBeDefined();
      expect(updateEngine.id).toEqual(engineId);
      expect(updateEngine.edgeVersion).toEqual(3);
    });

    it('should delete the cluster', async () => {
      const result = await engineHelpers.helpDeleteCluster(
        { gqlClient, options: superAdminOptions },
        { id: clusterIdWithV1Edge }
      );
      const deleteCluster = _.get(result, 'deleteCluster');
      expect(deleteCluster).toBeDefined();
      expect(deleteCluster.id).toEqual(clusterIdWithV1Edge);
    });
  });

  it('pause engine build - nodeRed runtime', async () => {
    const result = await engineHelpers.helpUpdateEngineBuild(
      { gqlClient, options: superAdminOptions },
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
      { gqlClient, options: superAdminOptions },
      { id: engineBuildNodeRedId, engineId: engineId, action: 'unpause' }
    );

    const updateEngineBuild = _.get(result, 'updateEngineBuild');

    expect(updateEngineBuild).toBeDefined();
    expect(updateEngineBuild.id).toEqual(engineBuildNodeRedId);
    expect(updateEngineBuild.status).toEqual('approved');
  });

  it('should create schema for engine', async () => {
    const dataRegistryQuery = `
      mutation createDataRegistry {
        createDataRegistry(
          input: {name: "Olporg-dataRegistry",
            description: "Test DataRegistry.",
            source: "OLP-SDO-source"}
        ) {
          id
        }
      }
    `;
    const result = await gqlClient.query(dataRegistryQuery);
    const createDataRegistry = _.get(result, 'createDataRegistry');
    expect(createDataRegistry).toBeDefined();
    expect(createDataRegistry.id).toBeDefined();
    const dataRegistryId = createDataRegistry.id;

    const createSchemaQuery = `
      mutation createSchema {
        createSchema (
          input: { 
            id: "${uuid.v4()}",
            dataRegistryId: "${dataRegistryId}",
            majorVersion: 1,
            minorVersion: 0,
            status: published
            definition: {
            type: "object",
            title: "Vehicle (Publisher-TEST)",
            required: ["caseId", "vehicleId"],
            properties: {caseId: {type: "string"},
            vehicleId: {type: "string"},
            licensePlateNumber: {type: "string"}},
            description: "RMS metadata pertaining to a Vehicle record type. (OLP-SDO)"}}
        ) {
          id
          majorVersion
          minorVersion
          status
          definition
        }
      }
    `;
    const schemaResult = await gqlClient.query(createSchemaQuery);
    const createSchema = _.get(schemaResult, 'createSchema');
    expect(createSchema).toBeDefined();
    expect(createSchema.id).toBeDefined();
    schemaId = createSchema.id;
  });

  it('should throw NotFound when creating engine with non-existent schemaId', async () => {
    const invalidSchemaId = 'ca133d51-585c-415e-8a5f-017fb1662ac3';

    try {
      await engineHelpers.helpCreateEngine(
        { gqlClient, options: 'testToken' },
        {
          deploymentModel: 'FullyNetworkIsolated',
          name: `${citestMarker}_engine_invalid_schema_${Date.now()}`,
          categoryId: categoryId,
          manifest: { engineMode: 'chunk' },
          schemas: [
            {
              schemaId: invalidSchemaId,
              ioType: 'input'
            }
          ]
        }
      );
    } catch (error) {
      const parsed = JSON.parse(error.message);
      const errorObj = parsed[0];
      expect(errorObj).toBeDefined();
      expect(errorObj.name).toBe('not_found');
      expect(errorObj.message).toContain('The requested object was not found');
    }
  });
  it('should throw NotFound with invalid UUID format (URL string)', async () => {
    const invalidSchemaId = 'https://example.com/schema';

    try {
      await engineHelpers.helpCreateEngine(
        { gqlClient, options: superAdminOptions },
        {
          deploymentModel: 'FullyNetworkIsolated',
          name: `${citestMarker}_engine_invalid_uuid_${Date.now()}`,
          categoryId: categoryId,
          manifest: { engineMode: 'chunk' },
          schemas: [
            {
              schemaId: invalidSchemaId,
              ioType: 'input'
            }
          ]
        }
      );
    } catch (error) {
      const parsed = JSON.parse(error.message);
      const errorObj = parsed[0];
      expect(errorObj).toBeDefined();
      expect(errorObj.name).toBe('not_found');
      expect(errorObj.message).toContain('Invalid ID format');
    }
  });
  it('should create engine successfully with valid schemaId', async () => {
    const result = await engineHelpers.helpCreateEngine(
      { gqlClient, options: superAdminOptions },
      {
        deploymentModel: 'FullyNetworkIsolated',
        name: `${citestMarker}_engine_valid_schema_${Date.now()}`,
        categoryId: categoryId,
        manifest: { engineMode: 'chunk' },
        schemas: [
          {
            schemaId: schemaId,
            ioType: 'input'
          }
        ]
      }
    );

    const createEngine = _.get(result, 'createEngine');
    expect(createEngine).toBeDefined();
    expect(createEngine.id).toBeDefined();
    expect(createEngine.state).toEqual('pending');
    expect(createEngine.categoryId).toEqual(categoryId);
    engineWithValidSchema = createEngine.id;
  });

  it('should throw NotFound when updating engine with non-existent schemaId', async () => {
    const invalidSchemaId = 'ba244951-696c-526d-bcf1-7ff457055410';
    try {
      await engineHelpers.helpUpdateEngine(
        { gqlClient, options: superAdminOptions },
        {
          id: engineWithValidSchema,
          schemas: [
            {
              schemaId: invalidSchemaId,
              ioType: 'output'
            }
          ]
        }
      );
    } catch (error) {
      const parsed = JSON.parse(error.message);
      const errorObj = parsed[0];
      expect(errorObj).toBeDefined();
      expect(errorObj.name).toBe('not_found');
      expect(errorObj.message).toContain('The requested object was not found');
    }
  });

  it('should throw NotFound with invalid UUID format when updating engine (URL string)', async () => {
    const invalidSchemaId = 'https://example.com/schema';

    try {
      await engineHelpers.helpUpdateEngine(
        { gqlClient, options: superAdminOptions },
        {
          id: engineWithValidSchema,
          schemas: [
            {
              schemaId: invalidSchemaId,
              ioType: 'output'
            }
          ]
        }
      );
    } catch (error) {
      const parsed = JSON.parse(error.message);
      const errorObj = parsed[0];
      expect(errorObj).toBeDefined();
      expect(errorObj.name).toBe('not_found');
      expect(errorObj.message).toContain('Invalid ID format');
    }
  });

  it('should update engine successfully with valid schemaId', async () => {
    const result = await engineHelpers.helpUpdateEngine(
      { gqlClient, options: superAdminOptions },
      {
        id: engineWithValidSchema,
        schemas: [
          {
            schemaId: schemaId,
            ioType: 'input'
          }
        ]
      }
    );

    const updateEngine = _.get(result, 'updateEngine');
    expect(updateEngine).toBeDefined();
    expect(updateEngine.id).toEqual(engineWithValidSchema);
  });
});

(gqlClient.isEnableResourceTest() ? describe : describe.skip)(
  'citest_engine: Test creating and deploying engines using Hub token',
  () => {
    it('should create new engine using Hub token', async () => {
      const query = `
      mutation {
        createEngine(input: {
          name: "${testName}"
          categoryId: "${categoryId}"
          deploymentModel: FullyNetworkIsolated
        }) {
          id
          name
          categoryId
          deploymentModel
          state
        }
      }
    `;
      const result = await gqlClient.queryByAIDataOrgToken(query, null);

      expect(result.createEngine).toBeDefined();
      expect(result.createEngine.id).toBeDefined();
      expect(result.createEngine.name).toEqual(testName);
      expect(result.createEngine.categoryId).toEqual(categoryId);
      expect(result.createEngine.deploymentModel).toEqual(
        'FullyNetworkIsolated'
      );
      expect(result.createEngine.state).toEqual('pending');

      engineIdHub = result.createEngine.id;
    });

    it('should create engine build using Hub token', async () => {
      const query = `mutation {
      createEngineBuild(input: {
        engineId: "${engineIdHub}"
        dockerImage: "${dockerImageUploaded}"
        ${env.includes(local) ? nodeRed : ''}
      }) {
        id
        status
        engine {
          state
        }
      }
    }`;

      const result = await gqlClient.queryByAIDataOrgToken(query, null);
      const engine = await checkEngineBuildApprovedFromGetEngineBuildQuery(
        result.createEngineBuild.id,
        userTokenAuthorization
      );
      expect(engine.engineBuild.engine.state).toEqual('ready');
      engineBuildIdHub = engine.engineBuild.id;
    });

    it('should deploy engine build using Hub token and not create a package with disableAutoPackageCreation set to true', async () => {
      if (
        !automaticPackageCreation ||
        automaticPackageCreation === 'disabled'
      ) {
        return;
      }

      let query = `
        mutation {
          updateEngineBuild(input: {
            id: "${engineBuildIdHub}"
            engineId: "${engineIdHub}"
            action: deploy
            disableAutoPackageCreation: true
          }) {
            id
            status
            engine {
              state
            }
          }
        }
    `;
      let result = await gqlClient.queryByAIDataOrgToken(query, null);
      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('deployed');
      expect(result.updateEngineBuild.engine.state).toEqual('active');

      query = `
        query {
          packages(primaryResourceId: "${engineIdHub}") {
            records {
              id
              primaryResource {
                resourceId
                resourceType
              }
            }
          }
        }
    `;
      result = await gqlClient.queryByAIDataOrgToken(query, null);
      expect(result.packages).toBeDefined();
      expect(result.packages.records).toBeDefined();
      expect(result.packages.records.length).toEqual(0);
    });

    it('should create package when deploying another build with autopackages enabled using Hub token', async () => {
      let query = `mutation {
    createEngineBuild(input: {
      engineId: "${engineIdHub}"
      dockerImage: "${dockerImageUploaded}"
      ${env.includes(local) ? nodeRed : ''}
      }) {
        id
        status
        engine {
          state
        }
      }
    }`;

      let result = await gqlClient.queryByAIDataOrgToken(query, null);
      const engine = await checkEngineBuildApprovedFromGetEngineBuildQuery(
        result.createEngineBuild.id,
        userTokenAuthorization
      );

      engineBuildIdHub1 = engine.engineBuild.id;
      if (
        !automaticPackageCreation ||
        automaticPackageCreation === 'disabled'
      ) {
        expect(engine.engineBuild.engine.state).toEqual('ready');
        return;
      }
      expect(engine.engineBuild.engine.state).toEqual('active');

      query = `
        mutation {
          updateEngineBuild(input: {
            id: "${engineBuildIdHub1}"
            engineId: "${engineIdHub}"
            action: deploy
          }) {
            id
            status
            engine {
              state
            }
          }
        }
    `;
      result = await gqlClient.queryByAIDataOrgToken(query, null);

      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('deployed');
      expect(result.updateEngineBuild.engine.state).toEqual('active');

      query = `
        query {
          packages(primaryResourceId: "${engineIdHub}") {
            records {
              id
              primaryResource {
                resourceId
                resourceType
              }
            }
          }
        }
      `;

      result = await gqlClient.queryByAIDataOrgToken(query, null);

      expect(result.packages).toBeDefined();
      expect(result.packages.records).toBeDefined();
      expect(result.packages.records.length).toBeGreaterThan(0);
      expect(result.packages.records[0].id).toBeDefined();
      expect(result.packages.records[0].primaryResource).toBeDefined();
      expect(result.packages.records[0].primaryResource.resourceId).toEqual(
        engineIdHub
      );
      expect(result.packages.records[0].primaryResource.resourceType).toEqual(
        'engine'
      );
      enginePackageHub = result.packages.records[0].id;
    });
  }
);

describe('citest_engine: delete artifacts created during the test', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });
  it('delete engine builds', async () => {
    const query = `mutation {
      deleteEngineBuild: deleteEngineBuild(input: {
        id: "${engineBuildId}"
        engineId: "${engineId}"
      }) {
        id
        message
      }
      ${
        gqlClient.isEnableResourceTest()
          ? `deleteEngineBuildHub: deleteEngineBuild(input: {
        id: "${engineBuildIdHub}"
        engineId: "${engineIdHub}"
      }) {
        id
        message
      }
      deleteEngineBuildHub1: deleteEngineBuild(input: {
        id: "${engineBuildIdHub1}"
        engineId: "${engineIdHub}"
      }) {
        id
        message
      }`
          : ''
      }
      }`;

    const result = await gqlClient.query(query, null, userTokenAuthorization);
    const deleteEngineBuild = _.get(result, 'deleteEngineBuild');
    expect(deleteEngineBuild).toBeDefined();
    expect(deleteEngineBuild.id).toEqual(engineBuildId);

    if (gqlClient.isEnableResourceTest()) {
      expect(result.deleteEngineBuildHub).toBeDefined();
      expect(result.deleteEngineBuildHub.id).toEqual(engineBuildIdHub);
      expect(result.deleteEngineBuildHub1).toBeDefined();
      expect(result.deleteEngineBuildHub1.id).toEqual(engineBuildIdHub1);
    }
  });

  it('disable engine', async () => {
    const query = `mutation {
      engineWorkflow: engineWorkflow(input: {
        id: "${engineId}"
        action: disable
      }) {
        id
        state
      }
      ${
        gqlClient.isEnableResourceTest()
          ? `engineWorkflowHub: engineWorkflow(input: {
        id: "${engineIdHub}"
        action: disable
      }) {
        id
        state
      }`
          : ''
      }
    }`;

    const result = await gqlClient.query(query, null, userTokenAuthorization);
    const engineWorkflow = _.get(result, 'engineWorkflow');
    expect(engineWorkflow).toBeDefined();
    expect(engineWorkflow.id).toEqual(engineId);
    expect(engineWorkflow.state).toEqual('disabled');

    if (gqlClient.isEnableResourceTest()) {
      expect(result.engineWorkflowHub).toBeDefined();
      expect(result.engineWorkflowHub.id).toEqual(engineIdHub);
      expect(result.engineWorkflowHub.state).toEqual('disabled');
    }
  });

  it('delete engines', async () => {
    const query = `mutation {
      deleteEngine: deleteEngine(id: "${engineId}") {
        id
        message
      }
      ${
        gqlClient.isEnableResourceTest()
          ? `
    deleteEngineHub: deleteEngine(id
  :
    "${engineIdHub}"
  )
    {
      id
      message
    }
    `
          : ''
      }
    }`;

    const result = await gqlClient.query(query, null, userTokenAuthorization);
    const deleteEngine = _.get(result, 'deleteEngine');
    expect(deleteEngine).toBeDefined();
    expect(deleteEngine.id).toEqual(engineId);

    if (gqlClient.isEnableResourceTest()) {
      expect(result.deleteEngineHub).toBeDefined();
      expect(result.deleteEngineHub.id).toEqual(engineIdHub);
    }
  });

  it('delete cluster', async () => {
    const query = `mutation {
      deleteCluster(id: "${clusterId}") {
        id
        message
      }
    }`;

    const result = await gqlClient.query(query, null, userTokenAuthorization);
    const deleteCluster = _.get(result, 'deleteCluster');

    expect(deleteCluster).toBeDefined();
    expect(deleteCluster.id).toEqual(clusterId);
  });

  it('delete package', async () => {
    if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
      return;
    }

    const query = `mutation {
      deleteEnginePackageHub: packageDelete(id: "${enginePackageHub}") {
        success
      }
    }`;
    const result = await gqlClient.query(query, null, userTokenAuthorization);
    expect(result.deleteEnginePackageHub).toBeDefined();
    expect(result.deleteEnginePackageHub.success).toEqual(true);
  });
  it('should filter out superadmin permissions when getting engine JWT', async () => {
    function decodeJwt(token) {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(Buffer.from(parts[1], 'base64').toString());
    }

    // 1. Create a TDO to use as scope
    const createTdoGql = `
      mutation { 
        createTDO(input: { 
          startDateTime: 1478160000,
          stopDateTime: 1478200000 
        }) { 
          id 
        } 
      }`;
    const tdoResult = await gqlClient.query(
      createTdoGql,
      null,
      superAdminOptions
    );
    const testTdoId = tdoResult.createTDO.id;

    // 2. Create an engine with superadmin permissions in jwtRights
    const engineName = `${citestMarker}-security-engine-${uuid.v4()}`;
    const createEngineResult = await engineHelpers.helpCreateEngine(
      { gqlClient, options: superAdminOptions },
      {
        name: engineName,
        categoryId: categoryId,
        deploymentModel: 'FullyNetworkIsolated',
        jwtRights: {
          roles: [
            {
              roleName: 'adapter',
              taskRights: [
                'superadmin',
                'SUPERADMIN',
                'VERITONE_SUPERADMIN',
                'CMS_CUSTOMERSERVICE',
                'task:update'
              ],
              assetRights: ['recording:read']
            }
          ]
        }
      }
    );
    const testEngineId = createEngineResult.createEngine.id;

    // 3. Get Engine JWT
    const getJwtGql = `
      mutation GetEngineJWT($engineId: ID!, $tdoId: ID!) {
        getEngineJWT(input: {
          engineId: $engineId,
          resource: {
            tdoId: $tdoId
          }
        }) {
          token
        }
      }
    `;
    const jwtResult = await gqlClient.query(
      getJwtGql,
      { engineId: testEngineId, tdoId: testTdoId },
      superAdminOptions
    );
    const token = jwtResult.getEngineJWT.token;
    expect(token).toBeDefined();

    // 4. Decode Token and Verify Permissions
    const decoded = decodeJwt(token);
    expect(decoded).toBeDefined();

    // The permissions are in the 'scope' array
    const allActions = _.flatMap(decoded.scope, 'actions');

    expect(allActions).not.toContain('superadmin');
    expect(allActions).not.toContain('SUPERADMIN');
    expect(allActions).not.toContain('VERITONE_SUPERADMIN');
    expect(allActions).toContain('task:update');
    expect(allActions).toContain('recording:read');

    // 5. Cleanup
    await gqlClient.query(
      `mutation { deleteEngine(id: "${testEngineId}") { id } }`,
      null,
      superAdminOptions
    );
    await gqlClient.query(
      `mutation { deleteTDO(id: "${testTdoId}") { id } }`,
      null,
      superAdminOptions
    );
  });
});

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
