import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';
import { helpers } from '../../../src/helpers';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../../src/graphqlUtil';
import { setupTestOrgAndUser } from '../../helpers/organization.helper';
import { createIsolatedSuperadmin } from '../../helpers/superadminSession';
import {
  BuildUpdateAction,
  DeploymentModel,
  EngineDistributionType,
  EngineFieldType,
  EngineWorkflowAction,
  GpuSupported,
  JobTemplateEnumType,
  OrganizationType,
  PriceDimension
} from '../../../src/gql';
import { getMockEngineTemplate } from '../../helpers/mockUtil';
import { safe } from '../../../src/helpers/commonHelper';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const testName = `${citestMarker}_engine_${Date.now()}`;
const testNameDescriptor = `${citestMarker} Transcription-Veritone Inc-Chunk-Test-V3`;
const testTemplateTextUploadChunk = getMockEngineTemplate(
  'citest-upload',
  'upload'
);

async function checkEngineState(
  client: GraphqlClient,
  id: string,
  headers?: any
) {
  let result: any;
  for (let i = 0; i < 5; i++) {
    await helpers.sleep(4000);
    result = await client.sdk.engine({ id }, headers);
    if (result?.data?.engine?.state === 'active') {
      break;
    }
  }
  expect(result?.data?.engine?.state).toEqual('active');
  return result.data.engine;
}

const createOrgAndUserInput = {
  orgInput: {
    name: `${citestMarker}-org-engine-${uuidv4()}`,
    businessUnit: 'Legal',
    types: [OrganizationType.Agency, OrganizationType.Broadcaster],
    metadata: {
      features: {
        enableRBACFeature: 'disabled'
      },
      billing: {
        pausedProcessing: false
      }
    },
    isLimitEnforced: true,
    remainingBudget: 10000,
    applications: [
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
      name: `${citestMarker}-admin-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266' // Desktop
      ].filter((roleId) => roleId)
    }
  ]
};

describe('citest_engine: org admin basic engine tests', () => {
  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let superToken: string;
  let orgAdminOptions: any;
  let testSetup: any;
  let testOrg: any;

  let categoryId: string;
  let engineId: string;
  let engineBuildId: string;
  let engineBuildNodeRedId: string;
  let clusterId: string;
  let engineApprovalWhiteListed = false;
  let automaticPackageCreation: any;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    // T20/T14: This suite previously bootstrapped its test org via the SHARED superadmin session.
    // That account is auto-enrolled as an admin MEMBER of every org it creates, so under
    // MAX_WORKERS>1, any other spec's org-delete / user-delete / OLP-toggle enumerates the members
    // of its own org and calls the GLOBAL removeAllUserSessions on each — which deletes EVERY one of
    // the shared superadmin's session tokens, including this suite's, at any point during the run.
    // The fix (same guardrail as the folder RBAC specs) is a throwaway superadmin that is a member of
    // no org except its own, so no other spec can enumerate or kill its session. See
    // test/helpers/superadminSession.ts.
    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
    superToken = isolatedSuperadmin.token;

    testSetup = await setupTestOrgAndUser(
      isolatedSuperadmin.client,
      createOrgAndUserInput
    );

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    expect(testOrg.users?.records?.length).toEqual(2);

    const adminUser = (testSetup.listOptions ?? []).find((user: any) =>
      user.userName?.includes('-admin-user-')
    );
    orgAdminOptions = adminUser?.requestOptions;

    const engineApprovalWhiteListedValue = _.get(
      testOrg,
      'jsondata.engineApprovalWhiteListed',
      false
    );
    engineApprovalWhiteListed = engineApprovalWhiteListedValue === 'enabled';
    // this feature is undefined in ai13s but the following code checks for "disabled" value
    automaticPackageCreation = _.get(
      testOrg,
      'jsondata.features.automaticPackageCreation'
    );
  });

  it('get transcription category id', async () => {
    const result = await gqlClient.sdk.engineCategories(
      { type: 'Cognition', name: 'Transcription', limit: 1 },
      orgAdminOptions
    );

    const engineCategories = result?.data?.engineCategories;
    expect(engineCategories).toBeDefined();
    expect(engineCategories?.count).toEqual(1);
    expect(engineCategories?.records).toHaveLength(1);
    expect(engineCategories?.records?.[0]?.id).toBeDefined();

    categoryId = engineCategories?.records?.[0]?.id as string;
  });

  it('throw create engine failed - invalid category id', async () => {
    await expect(
      gqlClient.sdk.createEngine(
        {
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
        },
        orgAdminOptions
      )
    ).rejects.toThrow('invalid_input');
  });

  it('create engine failed - invalid name', async () => {
    const invalidName = 'x'.repeat(201);
    await expect(
      gqlClient.sdk.createEngine(
        {
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
        },
        orgAdminOptions
      )
    ).rejects.toThrow('Invalid name provided');
  });

  it('create engine - transcription', async () => {
    const result = await gqlClient.sdk.createEngine(
      {
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
      },
      orgAdminOptions
    );

    const me = await gqlClient.sdk.me({}, orgAdminOptions);
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

  it('update the test engine - jwtRights - not allow', async () => {
    await expect(
      gqlClient.sdk.updateEngine(
        {
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
        },
        orgAdminOptions
      )
    ).rejects.toThrow('not allow to update jwtRights for public engines');
  });

  it('update the test engine', async () => {
    const result = await gqlClient.sdk.updateEngine(
      {
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
      },
      orgAdminOptions
    );

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

  it('update the test engine with isPublic=true before creating engine build', async () => {
    const result = await gqlClient.sdk.updateEngine(
      { input: { id: engineId, isPublic: true } },
      orgAdminOptions
    );

    const updatedEngine = _.get(result, 'data.updateEngine');
    expect(updatedEngine).toBeDefined();
    expect(updatedEngine?.id).toEqual(engineId);
    expect(updatedEngine?.isPublic).toEqual(true);
  });

  it('creates engine build', async () => {
    const result = await gqlClient.sdk.createEngineBuild(
      { input: { engineId } },
      orgAdminOptions
    );

    const createdEngineBuild = _.get(result, 'data.createEngineBuild');
    expect(createdEngineBuild).toBeDefined();
    expect(createdEngineBuild?.id).toBeDefined();
    expect(createdEngineBuild?.status).toEqual('fetching');
    engineBuildId = createdEngineBuild?.id!;
  });

  it('invalidate engine build', async () => {
    const result = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildId,
          engineId,
          action: BuildUpdateAction.Invalidate
        }
      },
      orgAdminOptions
    );

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.id).toEqual(engineBuildId);
    expect(updatedEngineBuild?.status).toEqual('invalid');
  });

  it('create engine build - nodeRed runtime', async () => {
    const result = await gqlClient.sdk.createEngineBuild(
      {
        input: {
          engineId,
          taskRuntime: { nodeRed: true },
          manifest: { runtime: 'NodeRed' }
        }
      },
      orgAdminOptions
    );

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
    const result = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildNodeRedId,
          engineId,
          action: BuildUpdateAction.Submit
        }
      },
      orgAdminOptions
    );

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

  it('update the test engine with isPublic=false', async () => {
    const result = await gqlClient.sdk.updateEngine(
      { input: { id: engineId, isPublic: false } },
      orgAdminOptions
    );

    const updatedEngine = _.get(result, 'data.updateEngine');
    expect(updatedEngine).toBeDefined();
    expect(updatedEngine?.id).toEqual(engineId);
    expect(updatedEngine?.isPublic).toEqual(false);
  });

  it('update engine build taskRuntime - nodeRed runtime', async () => {
    const result = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildNodeRedId,
          engineId,
          action: BuildUpdateAction.Update,
          taskRuntime: { edge: 'bar' }
        }
      },
      orgAdminOptions
    );

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.id).toEqual(engineBuildNodeRedId);
  });

  it('disapprove engine build - nodeRed runtime', async () => {
    const resultPromise = gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildNodeRedId,
          engineId,
          action: BuildUpdateAction.Disapprove
        }
      },
      orgAdminOptions
    );

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
    const resultPromise = gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildNodeRedId,
          engineId,
          action: BuildUpdateAction.Approve
        }
      },
      orgAdminOptions
    );

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
    const result = await gqlClient.sdk.engineWorkflow(
      { input: { id: engineId, action: EngineWorkflowAction.Disable } },
      orgAdminOptions
    );

    const workflowResult = _.get(result, 'data.engineWorkflow');
    expect(workflowResult).toBeDefined();
    expect(workflowResult?.id).toEqual(engineId);
    expect(workflowResult?.state).toEqual('disabled');
  });

  it('enable engine - transcription', async () => {
    const result = await gqlClient.sdk.engineWorkflow(
      { input: { id: engineId, action: EngineWorkflowAction.Enable } },
      orgAdminOptions
    );

    const workflowResult = _.get(result, 'data.engineWorkflow');
    expect(workflowResult).toBeDefined();
    expect(workflowResult?.id).toEqual(engineId);
    expect(workflowResult?.state).toEqual('ready');
  });

  it('update engine - transcription', async () => {
    const result = await gqlClient.sdk.updateEngine(
      {
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
      },
      orgAdminOptions
    );

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
    const result = await gqlClient.sdk.updateEngine(
      {
        input: {
          id: engineId,
          standaloneJobTemplates: [
            {
              type: JobTemplateEnumType.Upload,
              template: testTemplateTextUploadChunk!
            }
          ]
        }
      },
      orgAdminOptions
    );

    const updatedEngine = _.get(result, 'data.updateEngine');
    expect(updatedEngine).toBeDefined();
    expect(updatedEngine?.id).toEqual(engineId);
    expect(updatedEngine?.standaloneJobTemplates).toHaveLength(1);
    expect(updatedEngine?.standaloneJobTemplates?.[0]?.type).toEqual('Upload');
  });

  it('deploy engine build - nodeRed runtime', async () => {
    const result = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildNodeRedId,
          engineId,
          action: BuildUpdateAction.Deploy
        }
      },
      orgAdminOptions
    );

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.id).toEqual(engineBuildNodeRedId);
    expect(updatedEngineBuild?.engineId).toEqual(engineId);
    expect(updatedEngineBuild?.status).toEqual('deployed');
  });

  it('engine state should be in `active` state', async () => {
    const engine = await checkEngineState(gqlClient, engineId, orgAdminOptions);
    expect(engine).toBeDefined();
    expect(engine.id).toEqual(engineId);
    expect(engine.state).toEqual('active');
  });

  it('should create cluster - to test launching single engine job', async () => {
    const result = await gqlClient.sdk.createCluster(
      {
        input: {
          name: `${testName}_cluster`,
          allowedEngines: [],
          dockerCredentials: {}
        }
      },
      orgAdminOptions
    );

    const createdCluster = result?.data?.createCluster;
    expect(createdCluster).toBeDefined();
    expect(createdCluster?.id).toBeDefined();
    expect(createdCluster?.edgeVersion).toEqual(3);
    clusterId = createdCluster?.id as string;
  });

  it('should launch single engine job', async () => {
    const result = await gqlClient.sdk.launchSingleEngineJob(
      {
        input: {
          engineId,
          uploadUrl: 'http://localhost',
          clusterId,
          priority: 1
        }
      },
      orgAdminOptions
    );

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
    const result = await gqlClient.sdk.launchSingleEngineJob(
      {
        input: {
          engineId,
          uploadUrl: 'http://localhost',
          priority: 1,
          fields: [{ fieldName: 'clusterId', fieldValue: clusterId }]
        }
      },
      orgAdminOptions
    );

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
      const result = await gqlClient.sdk.updateEngine(
        { input: { id: engineId, edgeVersion: 1 } },
        orgAdminOptions
      );

      const updatedEngine = _.get(result, 'data.updateEngine');
      expect(updatedEngine).toBeDefined();
      expect(updatedEngine?.id).toEqual(engineId);
      expect(updatedEngine?.edgeVersion).toEqual(1);
    });

    it('should create cluster with edge_version=1', async () => {
      const result = await gqlClient.sdk.createCluster(
        {
          input: {
            name: `${testName}_cluster`,
            allowedEngines: [],
            dockerCredentials: {},
            edgeVersion: 1
          }
        },
        orgAdminOptions
      );
      const createdCluster = result?.data?.createCluster;
      expect(createdCluster).toBeDefined();
      expect(createdCluster?.id).toBeDefined();
      expect(createdCluster?.edgeVersion).toEqual(1);
      clusterIdWithV1Edge = createdCluster?.id as string;
    });

    it('should throw an error when launching single engine job with cluster (edgeVersion=1) and engine (edgeVersion=1)', async () => {
      await expect(
        gqlClient.sdk.launchSingleEngineJob(
          {
            input: {
              engineId,
              uploadUrl: 'http://localhost',
              fields: [
                { fieldName: 'clusterId', fieldValue: clusterIdWithV1Edge }
              ],
              priority: 1
            }
          },
          orgAdminOptions
        )
      ).rejects.toThrow('invalid_input');
    });

    it("rollback the engine's edge_version from 1 to 3 for other tests", async () => {
      const result = await gqlClient.sdk.updateEngine(
        { input: { id: engineId, edgeVersion: 3 } },
        orgAdminOptions
      );

      const updatedEngine = _.get(result, 'data.updateEngine');
      expect(updatedEngine).toBeDefined();
      expect(updatedEngine?.id).toEqual(engineId);
      expect(updatedEngine?.edgeVersion).toEqual(3);
    });

    it('should delete the cluster', async () => {
      const result = await gqlClient.sdk.deleteCluster(
        { id: clusterIdWithV1Edge },
        orgAdminOptions
      );
      const deletedCluster = result?.data?.deleteCluster;
      expect(deletedCluster).toBeDefined();
      expect(deletedCluster?.id).toEqual(clusterIdWithV1Edge);
    });
  });

  it('pause engine build - nodeRed runtime', async () => {
    const result = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildNodeRedId,
          engineId,
          action: BuildUpdateAction.Pause
        }
      },
      orgAdminOptions
    );

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
    const result = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildNodeRedId,
          engineId,
          action: BuildUpdateAction.Unpause
        }
      },
      orgAdminOptions
    );

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.id).toEqual(engineBuildNodeRedId);
    expect(updatedEngineBuild?.status).toEqual('approved');
  });

  afterAll(async () => {
    if (engineBuildId && engineId) {
      await safe(`delete engine build ${engineBuildId}`, () =>
        gqlClient.sdk.deleteEngineBuild(
          { input: { id: engineBuildId, engineId } },
          orgAdminOptions
        )
      );
    }

    if (engineId) {
      await safe(`disable engine ${engineId}`, () =>
        gqlClient.sdk.engineWorkflow(
          { input: { id: engineId, action: EngineWorkflowAction.Disable } },
          orgAdminOptions
        )
      );

      await safe(`delete engine ${engineId}`, () =>
        gqlClient.sdk.deleteEngine({ id: engineId }, orgAdminOptions)
      );
    }

    if (clusterId) {
      await safe(`delete cluster ${clusterId}`, () =>
        gqlClient.sdk.deleteCluster({ id: clusterId }, orgAdminOptions)
      );
    }

    if (testSetup?.listOptions?.length > 0) {
      for (const user of testSetup.listOptions) {
        await safe('deleteUser', async () =>
          gqlClient.sdk.deleteUser(
            { id: user.userId },
            helpers.requestOptions(superToken).headers
          )
        );
      }
    }

    if (testOrg?.id) {
      // Uses superToken (now the isolated SA's token) for the real, session-killing REST delete.
      // Must run BEFORE cleanup() so the isolated SA's token is still valid here.
      await safe(`delete organization ${testOrg.id}`, () =>
        helpers.deleteOrganization(gqlClient.authUrl, testOrg.id, superToken)
      );
    }

    // Tear down the throwaway isolated superadmin org+user last (its cleanup deletes issue via a
    // fresh bootstrap connect and are swallowed internally, so this is non-fatal and order-safe).
    if (isolatedSuperadmin) {
      await safe('cleanup isolated superadmin', () =>
        isolatedSuperadmin.cleanup()
      );
    }
  });
});
