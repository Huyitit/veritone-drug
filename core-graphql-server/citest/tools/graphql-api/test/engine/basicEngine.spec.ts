// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  BuildStatus,
  BuildUpdateAction,
  DeploymentModel,
  EngineDistributionType,
  EngineFieldType,
  EngineSchemaIoType,
  EngineState,
  EngineWorkflowAction,
  GpuSupported,
  JobTemplateEnumType,
  PriceDimension,
  SchemaStatus
} from '../../src/gql';
import config from '../../src/config';
import { helpers } from '../../src/helpers/index';
import _ from 'lodash';
// @ts-ignore
import mockUtilFactory from '../../../../../test/mockUtil';

const mockUtil = mockUtilFactory();

const citestMarker = 'citest-should-delete';
const testName = `${citestMarker}_engine_${Date.now()}`;
const testNameDescriptor = `${citestMarker} Transcription-Veritone Inc-Chunk-Test-V3`;
const testTemplateTextUploadChunk = mockUtil.getMockEngineTemplate(
  'citest-upload',
  'upload'
);

const env = config.env;
const local = 'local';
const isEnableResourceTest = Boolean(
  config.apiInternalOrgLessToken && config.apiAIDataOrgToken
);

// docker image to be reused and avoiding uploading one image for each test
const dockerImageUploaded =
  'registry.central.aiware.com/c308896d-3ba4-4b96-a95b-ad8fa4754888:838d1aa4-6a28-4a59-acf1-6ff346944299';

const nodeRedFragment = `
  taskRuntime: {
    nodeRed: true
  }
  manifest: {
    runtime: "NodeRed"
  }`;

// state shared across the describe blocks below (build -> deploy -> hub -> cleanup)
let categoryId: string;
let engineId: string;
let engineBuildId: string;
let engineBuildNodeRedId: string;
let engineIdGQLTest: string;
let draftEngineBuildNodeRedId: string;
let clusterId: string;
let schemaId: string;
let engineWithValidSchema: string;
let engineApprovalWhiteListed = false;
let automaticPackageCreation: any;
let engineIdHub: string;
let engineBuildIdHub: string;
let engineBuildIdHub1: string;
let enginePackageHub: string;

async function checkEngineState(client: GraphqlClient, id: string) {
  let result: any;
  for (let i = 0; i < 5; i++) {
    await helpers.sleep(4000);
    result = await client.sdk.engine({ id });
    if (result?.data?.engine?.state === 'active') {
      break;
    }
  }
  expect(result?.data?.engine?.state).toEqual('active');
  return result.data.engine;
}

async function checkEngineBuildApproved(client: GraphqlClient, id: string) {
  let result: any;
  for (let i = 0; i < 5; i++) {
    await helpers.sleep(4000);
    result = await client.sdk.engineBuild({ id });
    if (result?.data?.engineBuild?.status !== 'fetching') break;
  }

  expect(result?.data?.engineBuild).toBeDefined();
  expect(result?.data?.engineBuild?.id).toBeDefined();
  if (env.includes(local) && result?.engineBuild?.status !== 'fetching') {
    await client.sdk.updateEngineBuild({
      input: {
        id,
        engineId: result.data.engineBuild.engine.id,
        action: BuildUpdateAction.Submit
      }
    });
    result = await client.sdk.engineBuild({ id });
  }
  expect(result?.data?.engineBuild?.status).toEqual('approved');
  return result?.data?.engineBuild;
}

describe('citest_engine: basic engine tests', () => {
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();

    const meQuery = `
      query {
        me {
          organization {
            jsondata
          }
        }
      }
    `;
    const meResult: any = await gqlClient.query(meQuery);
    // this feature is undefined in ai13s but the following code checks for "disabled" value
    const engineApprovalWhiteListedValue = _.get(
      meResult,
      'me.organization.jsondata.engineApprovalWhiteListed',
      false
    );
    engineApprovalWhiteListed = engineApprovalWhiteListedValue === 'enabled';
    automaticPackageCreation = _.get(
      meResult,
      'me.organization.jsondata.features.automaticPackageCreation'
    );
  });

  it('get transcription category id', async () => {
    const result = await gqlClient.sdk.engineCategories({
      type: 'Cognition',
      name: 'Transcription',
      limit: 1
    });

    const engineCategories = result?.data?.engineCategories;
    expect(engineCategories).toBeDefined();
    expect(engineCategories?.count).toEqual(1);
    expect(engineCategories?.records).toHaveLength(1);
    expect(engineCategories?.records?.[0]?.id).toBeDefined();

    categoryId = engineCategories?.records?.[0]?.id as string;
  });

  it('get engine and draft build for citest', async () => {
    const result = await gqlClient.sdk.engines({
      createsTDO: false,
      state: [EngineState.Active],
      limit: 1,
      filter: { name: 'CITest Engine 20221219' },
      buildId: 'adf4e54a-36f1-4421-bb44-73ac8d375e91',
      buildStatus: [
        BuildStatus.Available,
        BuildStatus.Paused,
        BuildStatus.Approved,
        BuildStatus.Invalid
      ]
    });

    const engineGQLTest = result?.data?.engines?.records?.[0];
    expect(engineGQLTest).toBeDefined();
    expect(engineGQLTest?.id).toBeDefined();
    engineIdGQLTest = engineGQLTest?.id as string;
    const draftEngineBuild = engineGQLTest?.builds?.records?.[0];
    expect(draftEngineBuild).toBeDefined();
    expect(draftEngineBuild?.id).toBeDefined();
    draftEngineBuildNodeRedId = draftEngineBuild?.id as string;
  });

  it('upload engine build - citest engine', async () => {
    const result = await gqlClient.sdk.updateEngineBuild({
      input: {
        id: draftEngineBuildNodeRedId,
        engineId: engineIdGQLTest,
        action: BuildUpdateAction.Upload,
        dockerImage: `docker.aws-prod.veritone.com/validated/${engineIdGQLTest}:${draftEngineBuildNodeRedId}`
      }
    });

    const build = _.get(result, 'data.updateEngineBuild');
    expect(build).toBeDefined();
    expect(build?.id).toEqual(draftEngineBuildNodeRedId);
  });

  it('throw create engine failed - invalid category id', async () => {
    await expect(
      gqlClient.sdk.createEngine({
        input: {
          deploymentModel: DeploymentModel.FullyNetworkIsolated,
          name: testName,
          fields: [
            {
              max: 1000,
              min: 100,
              type: EngineFieldType.Number,
              name: 'Test field',
              label: 'test field'
            }
          ],
          categoryId: `${categoryId}_invalid`
        }
      })
    ).rejects.toThrow('invalid_input');
  });

  it('create engine failed - invalid name', async () => {
    const invalidName = 'x'.repeat(201);
    await expect(
      gqlClient.sdk.createEngine({
        input: {
          deploymentModel: DeploymentModel.FullyNetworkIsolated,
          name: invalidName,
          fields: [
            {
              max: 1000,
              min: 100,
              type: EngineFieldType.Number,
              name: 'Test field',
              label: 'test field'
            }
          ],
          categoryId: categoryId,
          manifest: { engineMode: 'chunk' }
        }
      })
    ).rejects.toThrow('Invalid name provided');
  });

  // TODO: we would have to add the jwtRights tests
  // after AIW-2161 deployed.
  it('create engine - transcription', async () => {
    const result = await gqlClient.sdk.createEngine({
      input: {
        deploymentModel: DeploymentModel.FullyNetworkIsolated,
        fields: [
          {
            max: 2,
            min: 1,
            type: EngineFieldType.Number,
            name: 'Test name',
            label: 'test label'
          }
        ],
        categoryId: categoryId,
        price: 100,
        priceDimension: PriceDimension.PricePerTask,
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
        gpuSupported: GpuSupported.AwsP2,
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
        distributionType: EngineDistributionType.Private
      }
    });

    const me = await gqlClient.sdk.me();
    const orgName = me?.data?.me?.organization?.name;
    const createdEngine = result?.data?.createEngine;
    expect(createdEngine).toBeDefined();
    expect(createdEngine?.id).toBeDefined();
    expect(createdEngine?.name).toEqual(
      `Transcription-${_.replace(orgName || '', /[.,]/g, '')}-Chunk-V1`
    );
    expect(createdEngine?.state).toEqual('pending');
    expect(createdEngine?.categoryId).toEqual(categoryId);
    expect(createdEngine?.deploymentModel).toEqual('FullyNetworkIsolated');
    expect(createdEngine?.fields).toHaveLength(1);
    expect(
      _.isEqual(createdEngine?.fields?.[0], {
        max: 2,
        min: 1,
        type: 'Number',
        name: 'Test name',
        label: 'test label',
        info: null,
        options: null,
        defaultValue: null,
        defaultValues: null
      })
    ).toEqual(true);
    expect(createdEngine?.createsTDO).toEqual(false);
    expect(createdEngine?.price).toEqual(100);
    expect(createdEngine?.priceDimension).toEqual('PRICE_PER_TASK');
    expect(createdEngine?.logoPath).toEqual('http://localhost/logo');
    expect(createdEngine?.iconPath).toEqual('http://localhost/icon');
    expect(createdEngine?.libraryRequired).toEqual(true);
    expect(createdEngine?.useCases).toHaveLength(2);
    expect(createdEngine?.industries).toHaveLength(2);
    expect(createdEngine?.edgeVersion).toEqual(1);
    expect(createdEngine?.cpuResourceMcpu).toEqual(2048);
    expect(createdEngine?.gpuSupported).toEqual('aws_p2');
    expect(createdEngine?.website).toEqual('https://veritone.com');
    expect(_.isEqual(createdEngine?.manifest, { engineMode: 'chunk' })).toEqual(
      true
    );
    expect(
      _.isEqual(createdEngine?.testingDetails, {
        email: 'dev@veritone.com',
        mediaFileUri: 'http://localhost/testingDetails/mediaFileUri',
        customFields: { foo: 'bar' }
      })
    ).toEqual(true);
    expect(createdEngine?.isPublic).toEqual(false);
    expect(createdEngine?.distributionType).toEqual('private');
    expect(createdEngine?.jwtRights).toBeDefined();
    expect(_.get(createdEngine, 'jwtRights.roles')).toHaveLength(1);
    expect(_.get(createdEngine, 'jwtRights.roles[0]', createdEngine)).toEqual({
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

    engineId = createdEngine?.id as string;
  });

  // Temporarity ignore this test because currently this field is not exists on DEV
  // The Post Test step before deploy will be failed
  it('update the test engine - jwtRights - not allow', async () => {
    await expect(
      gqlClient.sdk.updateEngine({
        input: {
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
      })
    ).rejects.toThrow('not allow to update jwtRights for public engines');
  });

  it('update the test engine', async () => {
    const result = await gqlClient.sdk.updateEngine({
      input: {
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
        priceDimension: PriceDimension.PricePerTask,
        edgeVersion: 3,
        fields: [
          {
            max: 1000,
            min: 100,
            type: EngineFieldType.Number,
            info: 'test',
            name: 'test field',
            label: 'test field',
            options: [{ key: 'foo', value: 'bar' }],
            defaultValue: 'test default',
            defaultValues: ['test1', 'test']
          }
        ],
        iconPath: 'http://localhost/icon_test',
        logoPath: 'http://localhost/logo_test',
        libraryRequired: false,
        useCases: ['test', 'help'],
        industries: ['foo', 'bar'],
        manifest: { engineMode: 'chunk', foo: 'bar' },
        cpuResourceMcpu: 256,
        gpuSupported: GpuSupported.AwsP3,
        website: 'https://veritoneone.com/',
        distributionType: EngineDistributionType.OrgLocked
      }
    });

    const updatedEngine = _.get(result, 'data.updateEngine');
    expect(updatedEngine).toBeDefined();
    expect(updatedEngine?.id).toEqual(engineId);
    expect(updatedEngine?.name).toEqual(testNameDescriptor);
    expect(updatedEngine?.jwtRights).toBeDefined();
    expect(_.get(updatedEngine, 'jwtRights.roles')).toHaveLength(1);
    expect(_.get(updatedEngine, 'jwtRights.roles[0]')).toEqual({
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
    expect(updatedEngine?.isPublic).toEqual(false);
    expect(updatedEngine?.categoryId).toEqual(categoryId);
    expect(updatedEngine?.price).toEqual(100);
    expect(updatedEngine?.priceDimension).toEqual('PRICE_PER_TASK');
    expect(updatedEngine?.edgeVersion).toEqual(3);
    expect(updatedEngine?.fields).toHaveLength(1);
    expect(
      _.isEqual(updatedEngine?.fields?.[0], {
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
    expect(updatedEngine?.iconPath).toEqual('http://localhost/icon_test');
    expect(updatedEngine?.logoPath).toEqual('http://localhost/logo_test');
    expect(updatedEngine?.libraryRequired).toEqual(false);
    expect(updatedEngine?.useCases).toHaveLength(2);
    expect(updatedEngine?.useCases?.[0]).toEqual('test');
    expect(updatedEngine?.useCases?.[1]).toEqual('help');
    expect(updatedEngine?.industries).toHaveLength(2);
    expect(updatedEngine?.industries?.[0]).toEqual('foo');
    expect(updatedEngine?.industries?.[1]).toEqual('bar');
    expect(
      _.isEqual(updatedEngine?.manifest, { engineMode: 'chunk', foo: 'bar' })
    ).toEqual(true);
    expect(updatedEngine?.cpuResourceMcpu).toEqual(256);
    expect(updatedEngine?.gpuSupported).toEqual('aws_p3');
    expect(updatedEngine?.website).toEqual('https://veritoneone.com/');
    expect(updatedEngine?.state).toEqual('pending');
    expect(updatedEngine?.distributionType).toEqual('org_locked');
  });

  // set isPublic to true to disable automatic approval of engine builds when submitting them for non-public engines.
  it('update the test engine with isPublic=true before creating engine build', async () => {
    const result = await gqlClient.sdk.updateEngine({
      input: {
        id: engineId,
        isPublic: true
      }
    });

    const updatedEngine = _.get(result, 'data.updateEngine');
    expect(updatedEngine).toBeDefined();
    expect(updatedEngine?.id).toEqual(engineId);
    expect(updatedEngine?.isPublic).toEqual(true);
  });

  it('creates engine build', async () => {
    const result = await gqlClient.sdk.createEngineBuild({
      input: { engineId }
    });

    const createdEngineBuild = _.get(result, 'data.createEngineBuild');
    expect(createdEngineBuild).toBeDefined();
    expect(createdEngineBuild?.id).toBeDefined();
    expect(createdEngineBuild?.status).toEqual('fetching');
    engineBuildId = createdEngineBuild?.id!;
  });

  it('invalidate engine build', async () => {
    const result = await gqlClient.sdk.updateEngineBuild({
      input: {
        id: engineBuildId,
        engineId,
        action: BuildUpdateAction.Invalidate
      }
    });

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.id).toEqual(engineBuildId);
    expect(updatedEngineBuild?.status).toEqual('invalid');
  });

  it('create engine build - nodeRed runtime', async () => {
    const result = await gqlClient.sdk.createEngineBuild({
      input: {
        engineId,
        taskRuntime: { nodeRed: true },
        manifest: { runtime: 'NodeRed' }
      }
    });

    const createdEngineBuild = _.get(result, 'data.createEngineBuild');
    expect(createdEngineBuild).toBeDefined();
    expect(createdEngineBuild?.id).toBeDefined();
    expect(createdEngineBuild?.status).toEqual('available');
    // for SA
    expect(createdEngineBuild?.validStateActions).toHaveLength(3);
    expect(createdEngineBuild?.validStateActions).toEqual(
      expect.arrayContaining(['submit', 'delete', 'invalidate'])
    );
    engineBuildNodeRedId = createdEngineBuild?.id!;
  });

  it('submit engine build - nodeRed runtime', async () => {
    const result = await gqlClient.sdk.updateEngineBuild({
      input: {
        id: engineBuildNodeRedId,
        engineId,
        action: BuildUpdateAction.Submit
      }
    });

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.id).toEqual(engineBuildNodeRedId);
    expect(updatedEngineBuild?.engineId).toEqual(engineId);

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
    expect(updatedEngineBuild?.status).toEqual(assertCheckStatus);
    // for SA
    expect(updatedEngineBuild?.validStateActions).toHaveLength(
      assertCheckAction.length
    );
    expect(updatedEngineBuild?.validStateActions).toEqual(
      expect.arrayContaining(assertCheckAction)
    );
  });

  // set isPublic to false for the old flow
  it('update the test engine with isPublic=false', async () => {
    const result = await gqlClient.sdk.updateEngine({
      input: {
        id: engineId,
        isPublic: false
      }
    });

    const updatedEngine = _.get(result, 'data.updateEngine');
    expect(updatedEngine).toBeDefined();
    expect(updatedEngine?.id).toEqual(engineId);
    expect(updatedEngine?.isPublic).toEqual(false);
  });

  it('update engine build taskRuntime - nodeRed runtime', async () => {
    const result = await gqlClient.sdk.updateEngineBuild({
      input: {
        id: engineBuildNodeRedId,
        engineId,
        action: BuildUpdateAction.Update,
        taskRuntime: { edge: 'bar' }
      }
    });

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.id).toEqual(engineBuildNodeRedId);
  });

  it('disapprove engine build - nodeRed runtime', async () => {
    const resultPromise = gqlClient.sdk.updateEngineBuild({
      input: {
        id: engineBuildNodeRedId,
        engineId,
        action: BuildUpdateAction.Disapprove
      }
    });

    /*
      If the user has engineApprovalWhiteListed = enabled, the build status will be 'approved' automatically when run build engine
      and cannot be change back status to 'disapproved'
      Otherwise if the user has engineApprovalWhiteListed = false the build status will be 'pending'
    */
    if (engineApprovalWhiteListed) {
      await expect(resultPromise).rejects.toThrow(/not a valid build action/);
    } else {
      const result = await resultPromise;
      const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
      expect(updatedEngineBuild).toBeDefined();
      expect(updatedEngineBuild?.id).toEqual(engineBuildNodeRedId);
      expect(updatedEngineBuild?.engineId).toEqual(engineId);
      expect(updatedEngineBuild?.status).toEqual('disapproved');
      // for SA
      expect(updatedEngineBuild?.validStateActions).toHaveLength(2);
      expect(updatedEngineBuild?.validStateActions).toEqual(
        expect.arrayContaining(['approve', 'delete'])
      );
    }
  });

  it('approve engine build - nodeRed runtime', async () => {
    const resultPromise = gqlClient.sdk.updateEngineBuild({
      input: {
        id: engineBuildNodeRedId,
        engineId,
        action: BuildUpdateAction.Approve
      }
    });

    /*
      If the user has engineApprovalWhiteListed = enabled, the build status will be 'approved' automatically automatically when run build engine
      and cannot be change back status to 'disapproved' or re-try 'approved'
      Otherwise if the user has engineApprovalWhiteListed = false the build status will be 'pending'
    */
    if (engineApprovalWhiteListed) {
      await expect(resultPromise).rejects.toThrow(/not a valid build action/);
    } else {
      const result = await resultPromise;
      const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
      expect(updatedEngineBuild).toBeDefined();
      expect(updatedEngineBuild?.id).toEqual(engineBuildNodeRedId);
      expect(updatedEngineBuild?.engineId).toEqual(engineId);
      expect(updatedEngineBuild?.status).toEqual('approved');
      // for SA
      expect(updatedEngineBuild?.validStateActions).toHaveLength(3);
      expect(updatedEngineBuild?.validStateActions).toEqual(
        expect.arrayContaining(['deploy', 'delete', 'invalidate'])
      );
    }
  });

  it('disable engine - transcription', async () => {
    const result = await gqlClient.sdk.engineWorkflow({
      input: {
        id: engineId,
        action: EngineWorkflowAction.Disable
      }
    });

    const workflowResult = _.get(result, 'data.engineWorkflow');
    expect(workflowResult).toBeDefined();
    expect(workflowResult?.id).toEqual(engineId);
    expect(workflowResult?.state).toEqual('disabled');
  });

  it('enable engine - transcription', async () => {
    const result = await gqlClient.sdk.engineWorkflow({
      input: {
        id: engineId,
        action: EngineWorkflowAction.Enable
      }
    });

    const workflowResult = _.get(result, 'data.engineWorkflow');
    expect(workflowResult).toBeDefined();
    expect(workflowResult?.id).toEqual(engineId);
    expect(workflowResult?.state).toEqual('ready');
  });

  it('update engine - transcription', async () => {
    const result = await gqlClient.sdk.updateEngine({
      input: {
        id: engineId,
        name: testName,
        description: `${testName}_edited`,
        deploymentModel: DeploymentModel.MostlyNetworkIsolated,
        testingDetails: {
          email: 'dev_edited@veritone.com',
          mediaFileUri: 'http://localhost/testingDetails/mediaFileUri',
          customFields: { foo: 'bar' }
        }
      }
    });

    const updatedEngine = _.get(result, 'data.updateEngine');
    expect(updatedEngine).toBeDefined();
    expect(updatedEngine?.id).toEqual(engineId);
    expect(updatedEngine?.deploymentModel).toEqual('MostlyNetworkIsolated');
    expect(updatedEngine?.fields).toHaveLength(1);
    expect(updatedEngine?.name).toEqual(testName);
    expect(_.get(updatedEngine, 'testingDetails.email')).toEqual(
      'dev_edited@veritone.com'
    );
    // expect is "ready" since previously deployed engine builds were paused when engine was disabled
    expect(updatedEngine?.state).toEqual('ready');
  });

  it('update engine template - to launch single engine job', async () => {
    const result = await gqlClient.sdk.updateEngine({
      input: {
        id: engineId,
        standaloneJobTemplates: [
          {
            type: JobTemplateEnumType.Upload,
            template: testTemplateTextUploadChunk
          }
        ]
      }
    });

    const updatedEngine = _.get(result, 'data.updateEngine');
    expect(updatedEngine).toBeDefined();
    expect(updatedEngine?.id).toEqual(engineId);
    expect(updatedEngine?.standaloneJobTemplates).toHaveLength(1);
    expect(updatedEngine?.standaloneJobTemplates?.[0]?.type).toEqual('Upload');
  });

  // with runtime engine build -> will bypass VDA services and change status directly to "deployed"
  it('deploy engine build - nodeRed runtime', async () => {
    const result = await gqlClient.sdk.updateEngineBuild({
      input: {
        id: engineBuildNodeRedId,
        engineId,
        action: BuildUpdateAction.Deploy
      }
    });

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.id).toEqual(engineBuildNodeRedId);
    expect(updatedEngineBuild?.engineId).toEqual(engineId);
    expect(updatedEngineBuild?.status).toEqual('deployed');
  });

  it('engine state should be in `active` state', async () => {
    const engine = await checkEngineState(gqlClient, engineId);
    expect(engine).toBeDefined();
    expect(engine.id).toEqual(engineId);
    expect(engine.state).toEqual('active');
  });

  it('should create cluster - to test launching single engine job', async () => {
    const result = await gqlClient.sdk.createCluster({
      input: {
        name: `${testName}_cluster`,
        allowedEngines: [],
        dockerCredentials: {}
      }
    });

    const createdCluster = result?.data?.createCluster;
    expect(createdCluster).toBeDefined();
    expect(createdCluster?.id).toBeDefined();
    expect(createdCluster?.edgeVersion).toEqual(3);
    clusterId = createdCluster?.id as string;
  });

  it('should launch single engine job', async () => {
    const result = await gqlClient.sdk.launchSingleEngineJob({
      input: {
        engineId,
        uploadUrl: 'http://localhost',
        clusterId,
        priority: 1
      }
    });

    const launchSingleEngineJobResult = _.get(
      result,
      'data.launchSingleEngineJob'
    );
    expect(launchSingleEngineJobResult).toBeDefined();
    expect(launchSingleEngineJobResult?.id).toBeDefined();
    expect(launchSingleEngineJobResult?.clusterId).toEqual(clusterId);

    const tasks = launchSingleEngineJobResult?.tasks?.records;
    const wsaTask = _.filter(tasks, {
      engineId: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255'
    });

    expect(wsaTask[0]?.executionPreferences?.priority).toEqual(1);
  });

  it('should launch single engine job - use the "fields.clusterId" instead of "clusterId"', async () => {
    const result = await gqlClient.sdk.launchSingleEngineJob({
      input: {
        engineId,
        uploadUrl: 'http://localhost',
        priority: 1,
        fields: [{ fieldName: 'clusterId', fieldValue: clusterId }]
      }
    });

    const launchSingleEngineJobResult = _.get(
      result,
      'data.launchSingleEngineJob'
    );
    expect(launchSingleEngineJobResult).toBeDefined();
    expect(launchSingleEngineJobResult?.id).toBeDefined();
    expect(launchSingleEngineJobResult?.clusterId).toEqual(clusterId);

    const tasks = launchSingleEngineJobResult?.tasks?.records;
    const wsaTask = _.filter(tasks, {
      engineId: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255'
    });

    expect(wsaTask[0]?.executionPreferences?.priority).toEqual(1);
  });

  describe('should throw an error when launching single engine job - engine with edgeVersion less than 3', () => {
    let clusterIdWithV1Edge: string;

    it("should update engine's edge_version from 3 to 1", async () => {
      const result = await gqlClient.sdk.updateEngine({
        input: {
          id: engineId,
          edgeVersion: 1
        }
      });

      const updatedEngine = _.get(result, 'data.updateEngine');
      expect(updatedEngine).toBeDefined();
      expect(updatedEngine?.id).toEqual(engineId);
      expect(updatedEngine?.edgeVersion).toEqual(1);
    });

    it('should create cluster with edge_version=1', async () => {
      const result = await gqlClient.sdk.createCluster({
        input: {
          name: `${testName}_cluster`,
          allowedEngines: [],
          dockerCredentials: {},
          edgeVersion: 1
        }
      });
      const createdCluster = result?.data?.createCluster;
      expect(createdCluster).toBeDefined();
      expect(createdCluster?.id).toBeDefined();
      expect(createdCluster?.edgeVersion).toEqual(1);
      clusterIdWithV1Edge = createdCluster?.id as string;
    });

    it('should throw an error when launching single engine job with cluster (edgeVersion=1) and engine (edgeVersion=1)', async () => {
      await expect(
        gqlClient.sdk.launchSingleEngineJob({
          input: {
            engineId,
            uploadUrl: 'http://localhost',
            fields: [
              { fieldName: 'clusterId', fieldValue: clusterIdWithV1Edge }
            ],
            priority: 1
          }
        })
      ).rejects.toThrow('invalid_input');
    });

    it("rollback the engine's edge_version from 1 to 3 for other tests", async () => {
      const result = await gqlClient.sdk.updateEngine({
        input: {
          id: engineId,
          edgeVersion: 3
        }
      });

      const updatedEngine = _.get(result, 'data.updateEngine');
      expect(updatedEngine).toBeDefined();
      expect(updatedEngine?.id).toEqual(engineId);
      expect(updatedEngine?.edgeVersion).toEqual(3);
    });

    it('should delete the cluster', async () => {
      const result = await gqlClient.sdk.deleteCluster({
        id: clusterIdWithV1Edge
      });
      const deletedCluster = result?.data?.deleteCluster;
      expect(deletedCluster).toBeDefined();
      expect(deletedCluster?.id).toEqual(clusterIdWithV1Edge);
    });
  });

  it('pause engine build - nodeRed runtime', async () => {
    const result = await gqlClient.sdk.updateEngineBuild({
      input: {
        id: engineBuildNodeRedId,
        engineId,
        action: BuildUpdateAction.Pause
      }
    });

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.id).toEqual(engineBuildNodeRedId);
    expect(updatedEngineBuild?.status).toEqual('paused');

    // for SA
    expect(updatedEngineBuild?.validStateActions).toHaveLength(3);
    expect(updatedEngineBuild?.validStateActions).toEqual(
      expect.arrayContaining(['unpause', 'delete', 'invalidate'])
    );
  });

  it('unpause engine build - nodeRed runtime - not valid buildState', async () => {
    const result = await gqlClient.sdk.updateEngineBuild({
      input: {
        id: engineBuildNodeRedId,
        engineId,
        action: BuildUpdateAction.Unpause
      }
    });

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.id).toEqual(engineBuildNodeRedId);
    expect(updatedEngineBuild?.status).toEqual('approved');
  });

  it('should create schema for engine', async () => {
    const createDataRegistryResult = await gqlClient.sdk.createDataRegistry({
      input: {
        name: 'Olporg-dataRegistry',
        description: 'Test DataRegistry.',
        source: 'OLP-SDO-source'
      }
    });
    const dataRegistryId =
      createDataRegistryResult?.data?.createDataRegistry?.id;
    expect(dataRegistryId).toBeDefined();

    const createSchemaResult = await gqlClient.sdk.createSchema({
      input: {
        id: uuidv4(),
        dataRegistryId: dataRegistryId as string,
        majorVersion: 1,
        minorVersion: 0,
        status: SchemaStatus.Published,
        definition: {
          type: 'object',
          title: 'Vehicle (Publisher-TEST)',
          required: ['caseId', 'vehicleId'],
          properties: {
            caseId: { type: 'string' },
            vehicleId: { type: 'string' },
            licensePlateNumber: { type: 'string' }
          },
          description:
            'RMS metadata pertaining to a Vehicle record type. (OLP-SDO)'
        }
      }
    });
    const createdSchema = createSchemaResult?.data?.createSchema;
    expect(createdSchema).toBeDefined();
    expect(createdSchema?.id).toBeDefined();
    schemaId = createdSchema?.id as string;
  });

  it('should throw NotFound when creating engine with non-existent schemaId', async () => {
    const invalidSchemaId = 'ca133d51-585c-415e-8a5f-017fb1662ac3';

    try {
      await gqlClient.sdk.createEngine({
        input: {
          deploymentModel: DeploymentModel.FullyNetworkIsolated,
          name: `${citestMarker}_engine_invalid_schema_${Date.now()}`,
          categoryId: categoryId,
          manifest: { engineMode: 'chunk' },
          schemas: [
            { schemaId: invalidSchemaId, ioType: EngineSchemaIoType.Input }
          ]
        }
      });
    } catch (error) {
      const errorObj = (error as any)?.response?.errors?.[0];
      expect(errorObj).toBeDefined();
      expect(errorObj.name).toBe('not_found');
      expect(errorObj.message).toContain('The requested object was not found');
    }
  });

  it('should throw NotFound with invalid UUID format (URL string)', async () => {
    const invalidSchemaId = 'https://example.com/schema';

    try {
      await gqlClient.sdk.createEngine({
        input: {
          deploymentModel: DeploymentModel.FullyNetworkIsolated,
          name: `${citestMarker}_engine_invalid_uuid_${Date.now()}`,
          categoryId: categoryId,
          manifest: { engineMode: 'chunk' },
          schemas: [
            { schemaId: invalidSchemaId, ioType: EngineSchemaIoType.Input }
          ]
        }
      });
    } catch (error) {
      const errorObj = (error as any)?.response?.errors?.[0];
      expect(errorObj).toBeDefined();
      expect(errorObj.name).toBe('not_found');
      expect(errorObj.message).toContain('Invalid ID format');
    }
  });

  it('should create engine successfully with valid schemaId', async () => {
    const result = await gqlClient.sdk.createEngine({
      input: {
        deploymentModel: DeploymentModel.FullyNetworkIsolated,
        name: `${citestMarker}_engine_valid_schema_${Date.now()}`,
        categoryId: categoryId,
        manifest: { engineMode: 'chunk' },
        schemas: [{ schemaId: schemaId, ioType: EngineSchemaIoType.Input }]
      }
    });

    const createdEngine = result?.data?.createEngine;
    expect(createdEngine).toBeDefined();
    expect(createdEngine?.id).toBeDefined();
    expect(createdEngine?.state).toEqual('pending');
    expect(createdEngine?.categoryId).toEqual(categoryId);
    engineWithValidSchema = createdEngine?.id as string;
  });

  it('should throw NotFound when updating engine with non-existent schemaId', async () => {
    const invalidSchemaId = 'ba244951-696c-526d-bcf1-7ff457055410';
    try {
      await gqlClient.sdk.updateEngine({
        input: {
          id: engineWithValidSchema,
          schemas: [
            { schemaId: invalidSchemaId, ioType: EngineSchemaIoType.Output }
          ]
        }
      });
    } catch (error) {
      const errorObj = (error as any)?.response?.errors?.[0];
      expect(errorObj).toBeDefined();
      expect(errorObj.name).toBe('not_found');
      expect(errorObj.message).toContain('The requested object was not found');
    }
  });

  it('should throw NotFound with invalid UUID format when updating engine (URL string)', async () => {
    const invalidSchemaId = 'https://example.com/schema';

    try {
      await gqlClient.sdk.updateEngine({
        input: {
          id: engineWithValidSchema,
          schemas: [
            { schemaId: invalidSchemaId, ioType: EngineSchemaIoType.Output }
          ]
        }
      });
    } catch (error) {
      const errorObj = (error as any)?.response?.errors?.[0];
      expect(errorObj).toBeDefined();
      expect(errorObj.name).toBe('not_found');
      expect(errorObj.message).toContain('Invalid ID format');
    }
  });

  it('should update engine successfully with valid schemaId', async () => {
    const result = await gqlClient.sdk.updateEngine({
      input: {
        id: engineWithValidSchema,
        schemas: [{ schemaId: schemaId, ioType: EngineSchemaIoType.Input }]
      }
    });

    const updatedEngine = _.get(result, 'data.updateEngine');
    expect(updatedEngine).toBeDefined();
    expect(updatedEngine?.id).toEqual(engineWithValidSchema);
  });

  it('should filter out superadmin permissions when getting engine JWT', async () => {
    function decodeJwt(token: string) {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(Buffer.from(parts[1], 'base64').toString());
    }

    const tdoResult = await gqlClient.sdk.createTDO({
      input: { startDateTime: 1478160000, stopDateTime: 1478200000 }
    });
    const testTdoId = tdoResult?.data?.createTDO?.id as string;

    const engineName = `${citestMarker}-security-engine-${uuidv4()}`;
    const createEngineResult = await gqlClient.sdk.createEngine({
      input: {
        name: engineName,
        categoryId: categoryId,
        deploymentModel: DeploymentModel.FullyNetworkIsolated,
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
    });
    const testEngineId = createEngineResult?.data?.createEngine?.id as string;

    const jwtResult = await gqlClient.sdk.getEngineJWT({
      input: { engineId: testEngineId, resource: { tdoId: testTdoId } }
    });
    const token = jwtResult?.data?.getEngineJWT?.token;
    expect(token).toBeDefined();

    const decoded = decodeJwt(token as string);
    expect(decoded).toBeDefined();

    // The permissions are in the 'scope' array
    const allActions = _.flatMap(decoded.scope, 'actions');

    expect(allActions).not.toContain('superadmin');
    expect(allActions).not.toContain('SUPERADMIN');
    expect(allActions).not.toContain('VERITONE_SUPERADMIN');
    expect(allActions).toContain('task:update');
    expect(allActions).toContain('recording:read');

    await gqlClient.sdk.deleteEngine({ id: testEngineId });
    await gqlClient.sdk.deleteTDO({ id: testTdoId });
  });
});

(isEnableResourceTest ? describe : describe.skip)(
  'citest_engine: Test creating and deploying engines using Hub token',
  () => {
    let hubClient: GraphqlClient;

    beforeAll(async () => {
      hubClient = await createGraphqlClient(AuthType.API_KEY);
    });

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
      const result: any = await hubClient.query(query, null);

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
      createEngineBuild (input: {
        engineId: "${engineIdHub}"
        dockerImage: "${dockerImageUploaded}"
        ${env.includes(local) ? nodeRedFragment : ''}
      }) {
        id
        status
        engine {
          state
        }
      }
    }`;

      const result: any = await hubClient.query(query, null);
      const approved = await checkEngineBuildApproved(
        hubClient,
        result.createEngineBuild.id
      );
      expect(approved.engine.state).toEqual('ready');
      engineBuildIdHub = approved.id;
    });

    it('should deploy engine build using Hub token and not create a package with disableAutoPackageCreation set to true', async () => {
      if (
        !automaticPackageCreation ||
        automaticPackageCreation === 'disabled'
      ) {
        return;
      }

      const query = `
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
      const result: any = await hubClient.query(query, null);
      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('deployed');
      expect(result.updateEngineBuild.engine.state).toEqual('active');

      const packagesResult = await hubClient.sdk.queryPackages({
        primaryResourceId: engineIdHub
      });
      const packages = packagesResult?.data?.packages;
      expect(packages).toBeDefined();
      expect(packages?.records).toBeDefined();
      expect(packages?.records?.length).toEqual(0);
    });

    it('should create package when deploying another build with autopackages enabled using Hub token', async () => {
      let query = `mutation {
      createEngineBuild (input: {
        engineId: "${engineIdHub}"
        dockerImage: "${dockerImageUploaded}"
        ${env.includes(local) ? nodeRedFragment : ''}
      }) {
        id
        status
        engine {
          state
        }
      }
    }`;

      let result: any = await hubClient.query(query, null);
      const approved = await checkEngineBuildApproved(
        hubClient,
        result.createEngineBuild.id
      );

      engineBuildIdHub1 = approved.id;
      if (
        !automaticPackageCreation ||
        automaticPackageCreation === 'disabled'
      ) {
        expect(approved.engine.state).toEqual('ready');
        return;
      }
      expect(approved.engine.state).toEqual('active');

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
      result = await hubClient.query(query, null);

      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('deployed');
      expect(result.updateEngineBuild.engine.state).toEqual('active');

      const packagesResult = await hubClient.sdk.queryPackages({
        primaryResourceId: engineIdHub
      });
      const packages = packagesResult?.data?.packages;

      expect(packages).toBeDefined();
      expect(packages?.records).toBeDefined();
      expect(packages?.records?.length as number).toBeGreaterThan(0);
      expect(packages?.records?.[0]?.id).toBeDefined();
      expect(packages?.records?.[0]?.primaryResource).toBeDefined();
      expect(packages?.records?.[0]?.primaryResource?.resourceId).toEqual(
        engineIdHub
      );
      expect(packages?.records?.[0]?.primaryResource?.resourceType).toEqual(
        'engine'
      );
      enginePackageHub = packages?.records?.[0]?.id as string;
    });
  }
);

describe('citest_engine: delete artifacts created during the test', () => {
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();
  });

  it('delete engine builds', async () => {
    const deleteEngineBuildResult = await gqlClient.sdk.deleteEngineBuild({
      input: { id: engineBuildId, engineId }
    });
    expect(deleteEngineBuildResult?.data?.deleteEngineBuild).toBeDefined();
    expect(deleteEngineBuildResult?.data?.deleteEngineBuild?.id).toEqual(
      engineBuildId
    );

    if (isEnableResourceTest) {
      const deleteEngineBuildHubResult = await gqlClient.sdk.deleteEngineBuild({
        input: { id: engineBuildIdHub, engineId: engineIdHub }
      });
      expect(deleteEngineBuildHubResult?.data?.deleteEngineBuild).toBeDefined();
      expect(deleteEngineBuildHubResult?.data?.deleteEngineBuild?.id).toEqual(
        engineBuildIdHub
      );

      const deleteEngineBuildHub1Result = await gqlClient.sdk.deleteEngineBuild(
        {
          input: { id: engineBuildIdHub1, engineId: engineIdHub }
        }
      );
      expect(
        deleteEngineBuildHub1Result?.data?.deleteEngineBuild
      ).toBeDefined();
      expect(deleteEngineBuildHub1Result?.data?.deleteEngineBuild?.id).toEqual(
        engineBuildIdHub1
      );
    }
  });

  it('disable engine', async () => {
    const result = await gqlClient.sdk.engineWorkflow({
      input: {
        id: engineId,
        action: EngineWorkflowAction.Disable
      }
    });
    const workflowResult = _.get(result, 'data.engineWorkflow');
    expect(workflowResult).toBeDefined();
    expect(workflowResult?.id).toEqual(engineId);
    expect(workflowResult?.state).toEqual('disabled');

    if (isEnableResourceTest) {
      const hubResult = await gqlClient.sdk.engineWorkflow({
        input: {
          id: engineIdHub,
          action: EngineWorkflowAction.Disable
        }
      });
      const hubWorkflowResult = _.get(hubResult, 'data.engineWorkflow');
      expect(hubWorkflowResult).toBeDefined();
      expect(hubWorkflowResult?.id).toEqual(engineIdHub);
      expect(hubWorkflowResult?.state).toEqual('disabled');
    }
  });

  it('delete engines', async () => {
    const deleteEngineResult = await gqlClient.sdk.deleteEngine({
      id: engineId
    });
    expect(deleteEngineResult?.data?.deleteEngine).toBeDefined();
    expect(deleteEngineResult?.data?.deleteEngine?.id).toEqual(engineId);

    if (isEnableResourceTest) {
      const deleteEngineHubResult = await gqlClient.sdk.deleteEngine({
        id: engineIdHub
      });
      expect(deleteEngineHubResult?.data?.deleteEngine).toBeDefined();
      expect(deleteEngineHubResult?.data?.deleteEngine?.id).toEqual(
        engineIdHub
      );
    }
  });

  it('delete cluster', async () => {
    const result = await gqlClient.sdk.deleteCluster({ id: clusterId });
    expect(result?.data?.deleteCluster).toBeDefined();
    expect(result?.data?.deleteCluster?.id).toEqual(clusterId);
  });

  it('delete package', async () => {
    if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
      return;
    }

    const result = await gqlClient.sdk.packageDelete({ id: enginePackageHub });
    expect(result?.data?.packageDelete).toBeDefined();
    expect(result?.data?.packageDelete?.success).toEqual(true);
  });
});
