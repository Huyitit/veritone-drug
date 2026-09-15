import { helpers } from '../../src/helpers/index';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  AccessScope,
  BuildUpdateAction,
  ClusterStatus,
  DayOfWeek,
  DeploymentModel,
  FolderOrderByField,
  IntervalUnit,
  IoFolderMode,
  IoFolderType,
  OrderDirection,
  OrganizationStatus,
  RootFolderType,
  RunMode,
  SchemaStatus
} from '../../src/gql';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';

const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

let sdkClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
const env = config.env;

const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

let superToken: string,
  superOptions: any,
  superUserId: string,
  superOrgGuid: string,
  superOrgId: string;

const engineCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

const buildEngineActionList = [
  ['Submit', 'pending'],
  ['Deploy', 'deployed']
];
const publicBuildEngineActionList = [
  ['Submit', 'pending'],
  ['Approve', 'approved'],
  ['Deploy', 'deployed']
];

const sampleDagTemplate = `{"tasks": [  {    "engineId": "{{{firstEngineId}}}",    "payload": {      "url": "{{{UPLOAD_URL}}}"    },    "executionPreferences": {      {{#if priorityOfFirst}} "priority":{{minus priorityOfFirst 5}} {{/if}}    },    "ioFolders": [      {        "referenceId": "wsa-output",        "mode": "stream",        "type": "output"      }    ]  },  {    "engineId": "{{{secondEngineId}}}",    "executionPreferences": {      {{#if priority}} "priority":{{{priority}}}, {{/if}}      "parentCompleteBeforeStarting": true    },    "ioFolders": [      {        "referenceId": "pb-input",        "mode": "stream",        "type": "input"      }    ]  },  {    "engineId": "8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440",    "payload": {      "ffmpegTemplate": "video",      "customFFMPEGProperties": {        "chunkSizeInSeconds": {{#if chunkSizeInSeconds}} "{{{chunkSizeInSeconds}}}" {{else}} "300" {{/if}}      }    },    "executionPreferences": {      {{#if priority}} "priority":{{{priority}}}, {{/if}}      "parentCompleteBeforeStarting": true    },    "ioFolders": [      {        "referenceId": "si-input",        "mode": "stream",        "type": "input"      },      {        "referenceId": "si-output",        "mode": "chunk",        "type": "output"      }    ]  },  {    "engineId": "8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3",    "executionPreferences": {      {{#if priority}} "priority":{{{priority}}}, {{/if}}      "parentCompleteBeforeStarting": true    },    "ioFolders": [      {        "referenceId": "ow-input",        "mode": "chunk",        "type": "input"      }    ]  }],"routes": [  {    "parentIoFolderReferenceId": "wsa-output",    "childIoFolderReferenceId": "pb-input"  },  {    "parentIoFolderReferenceId": "wsa-output",    "childIoFolderReferenceId": "si-input"  },  {    "parentIoFolderReferenceId": "si-output",    "childIoFolderReferenceId": "ow-input"  }]}`;

const trackId = (idSet: Set<string>, id?: string | null) => {
  if (id) {
    idSet.add(id);
  }
};

describe('citest_jobs: Schedule job test flow', () => {
  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );

    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    sdkClient = isolatedSuperadmin.client;

    expect(sdkClient.sessionToken).toBeDefined();
    superToken = isolatedSuperadmin.token;
    superOptions = { headers: isolatedSuperadmin.options };

    const result = await sdkClient.sdk.me();

    expect(result.data.me).toBeDefined();
    superOrgGuid = _.get(result, 'data.me.organization.guid');
    superOrgId = _.get(result, 'data.me.organization.id');
    superUserId = _.get(result, 'data.me.id');
  });

  afterAll(async () => {
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  describe.each([false, true])('Scheduled job', (isEnabledOlp) => {
    let testSetup: any;

    let testOrg: any,
      adminUser: any,
      regularUser: any,
      testUsers: any,
      testUsers2: any;
    let adminOptions: any, regularOptions: any;
    let createOrgAndUserInput: any;
    let testTdo: any;
    let testEngine: any, jobTemplate: any, engineBuildId: string;

    let testCluster: any,
      otherCluster: any,
      newCluster: any,
      otherOrgDagTemplateId: string,
      createDagTemplate: any;
    const clusterIdsOrg1 = new Set<string>();
    const dagTemplateIdsOrg1 = new Set<string>();
    const engineIdsOrg1: string[] = [];

    const testData: any = {
      clusterId: null,
      engineId: null,
      scheduledJobId: null,
      applicationId: null,
      jobId: null,
      jobFromTemplateId: null,
      rootFolderData: null,
      folder: null,
      rootFolderData2: null,
      folder2: null,
      jobWithIoFolder: null,
      jobWithBuild: null
    };
    const scheduledJobIdsOrg1 = new Set<string>();

    const trackScheduledJob = (scheduledJob: any) => {
      trackId(scheduledJobIdsOrg1, scheduledJob?.id);
    };

    describe(`Scheduled job test with isEnabledOlp = ${isEnabledOlp}`, () => {
      beforeAll(async () => {
        createOrgAndUserInput = getOrgAndUserInput(isEnabledOlp);

        // set up org 1
        testSetup = await setupTestOrgAndUser(sdkClient, createOrgAndUserInput);

        testOrg = testSetup.org;
        expect(testOrg).toBeDefined();
        expect(testOrg.name).toContain(`${citestMarker}-org`);
        expect(testOrg.users).toBeDefined();
        testUsers = _.get(testOrg, 'users.records');

        // Login for Admin user
        adminUser = _.find(testSetup.listOptions, (user: any) => {
          return user.userName?.includes('-admin-user-');
        });
        adminOptions = { headers: adminUser.requestOptions };

        // Create test TDO for org 1
        const testTdoRes = await sdkClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-test-tdo-${uuid.v4()}`,
              ...tdoAssetInput
            }
          },
          getRequestHeaders(adminOptions)
        );

        testTdo = _.get(testTdoRes, 'data.createTDOWithAsset');

        // Create engine for org 1
        const engineCreate = await sdkClient.sdk.createEngine(
          {
            input: {
              name: citestMarker + '-engine-' + uuid.v4(),
              categoryId: engineCategoryId,
              deploymentModel: DeploymentModel.FullyNetworkIsolated
            }
          },
          getRequestHeaders(adminOptions)
        );

        testEngine = _.get(engineCreate, 'data.createEngine');
        engineIdsOrg1.push(testEngine.id);

        // Create test Cluster for org 1
        const clusters = await sdkClient.sdk.createCluster(
          {
            input: {
              name: `${citestMarker}-test-cluster-${uuid.v4()}`,
              dockerCredentials: {},
              allowedEngines: [],
              status: ClusterStatus.Active
            }
          },
          getRequestHeaders(adminOptions)
        );

        testCluster = _.get(clusters, 'data.createCluster');
        trackId(clusterIdsOrg1, testCluster?.id);

        // create dag template
        const createTemplateResult = await sdkClient.sdk.createDagTemplate(
          {
            input: {
              name: `${citestMarker} Webstream Speechmatics Reprocess Template`,
              description: 'English Transcription',
              tags: ['transcription'],
              dagTemplateLanguage: 'Handlebars',
              dag: sampleDagTemplate
            }
          },
          getRequestHeaders(adminOptions)
        );
        createDagTemplate = _.get(
          createTemplateResult,
          'data.createDagTemplate'
        );
        expect(createDagTemplate).toBeDefined();
        expect(createDagTemplate.id).toBeDefined();
        trackId(dagTemplateIdsOrg1, createDagTemplate.id);

        // Login for Regular user
        regularUser = _.find(testSetup.listOptions, (user: any) => {
          return user.userName?.includes('-regular-user-');
        });
        regularOptions = { headers: regularUser.requestOptions };

        // get dag template from other org
        const otherOrgDagTemplateResult = await sdkClient.sdk.dagTemplates({
          limit: 1,
          offset: 0
        });

        otherOrgDagTemplateId = _.get(
          otherOrgDagTemplateResult,
          'data.dagTemplates.records[0].id'
        );
      });

      it('Create ScheduledJob without name should fail', async () => {
        let scheduledJob = sdkClient.sdk.scheduledJobCreate(
          {
            // @ts-ignore
            input: {
              jobTemplates: [
                {
                  clusterId: testCluster.id,
                  taskTemplates: [{ engineId: testEngine.id }]
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );

        await expect(scheduledJob).rejects.toThrow(/name.* was not provided/);
      });
      describe('Create Schedule Job', () => {
        describe('Scheduled job with job template', () => {
          beforeAll(async () => {
            // create job template
            const jobTemplateRes = await sdkClient.sdk.createJobTemplate(
              {
                input: { taskTemplates: [{ engineId: testEngine.id }] }
              },
              getRequestHeaders(adminOptions)
            );

            jobTemplate = _.get(jobTemplateRes, 'data.createJobTemplate');
          });

          it('Create schedule Job using not existed jobTemplateIds should fail', async () => {
            let scheduledJob = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplateIds: ['999999999']
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJob).rejects.toThrow(/not_found/);
          });

          it('Create schedule Job using not active jobTemplateIds should fail', async () => {
            const scheduledJobRes = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplateIds: [jobTemplate.id]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJobRes).rejects.toThrow(
              /engines are not active/
            );
          });

          it('Create schedule Job using valid jobTemplateIds should success', async () => {
            // build and deploy engine
            const build = await buildAndDeployEngine(
              testEngine.id,
              adminOptions
            );

            const scheduledJobRes = await sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplateIds: [jobTemplate.id]
                }
              },
              getRequestHeaders(adminOptions)
            );

            const scheduledJob = _.get(
              scheduledJobRes,
              'data.createScheduledJob'
            );
            expect(scheduledJob).toBeDefined();
            expect(scheduledJob.id).toBeDefined();
            trackScheduledJob(scheduledJob);
            testData.scheduledJobId = scheduledJob.id;
          });

          it('Get schedule job', async () => {
            const scheduledJobRes = await sdkClient.sdk.scheduledJob(
              { id: testData.scheduledJobId },
              getRequestHeaders(adminOptions)
            );

            const scheduledJob = _.get(scheduledJobRes, 'data.scheduledJob');

            expect(scheduledJob).toBeDefined();
            expect(scheduledJob.id).toEqual(testData.scheduledJobId);
          });

          it('deleteScheduledJob success', async () => {
            let deleteScheduledJobRes = await sdkClient.sdk.deleteScheduledJob(
              { id: testData.scheduledJobId },
              getRequestHeaders(adminOptions)
            );

            const deleteScheduledJob = _.get(
              deleteScheduledJobRes,
              'data.deleteScheduledJob'
            );
            expect(deleteScheduledJob).toBeDefined();
            expect(deleteScheduledJob.id).toEqual(testData.scheduledJobId);
            scheduledJobIdsOrg1.delete(testData.scheduledJobId);
          });
        });

        describe('Schedule job with CreateJobTemplate option', () => {
          beforeAll(async () => {});

          // applicationId:
          /* Application ID. Used only by Veritone platform components.
            Other clients should not attempt to send this field. Any value sent will be ignored. */
          // it('Create schedule Job using not existed appId should fail', async () => {});
          // it('Create schedule Job using not have access appId should fail', async () => {});
          // it('Create schedule Job using org own appId success', async () => {});
          // it('Create schedule Job using public appId success', async () => {});

          // clusterId:
          it('Create schedule Job using not existed clusterId should fail', async () => {
            const scheduledJob = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [{ clusterId: uuid.v4() }]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJob).rejects.toThrow(/not_found/);
          });

          it('Create schedule Job using inaccessible clusterId should fail', async () => {
            // create cluster by super admin
            const clusterCreateRes = await sdkClient.sdk.createCluster({
              input: {
                name: `${citestMarker}-test-cluster-${uuid.v4()}`,
                dockerCredentials: {},
                allowedEngines: [],
                status: ClusterStatus.Active
              }
            });

            otherCluster = _.get(clusterCreateRes, 'data.createCluster');
            const scheduledJob = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [{ clusterId: otherCluster.id }]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJob).rejects.toThrow(/not_found/);
          });

          it('Create schedule Job using valid clusterId success', async () => {
            const scheduledJobRes = await sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            const scheduledJob = _.get(
              scheduledJobRes,
              'data.createScheduledJob'
            );
            expect(scheduledJob).toBeDefined();
            expect(scheduledJob.id).toBeDefined();
            trackScheduledJob(scheduledJob);
          });

          // invalid routes:
          xit('Create schedule Job using not existed parentIoFolderReferenceId should fail', async () => {
            const randomId = uuid.v4();
            const scheduledJob = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [
                    {
                      routes: [{ parentIoFolderReferenceId: randomId }],
                      taskTemplates: [
                        {
                          engineId: testEngine.id,
                          ioFolders: [
                            {
                              referenceId: randomId,
                              mode: IoFolderMode.Chunk,
                              type: IoFolderType.Input
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJob).rejects.toThrow(/not found/);
          });
          xit('Create schedule Job using not existed childIoFolderReferenceId should fail', async () => {
            const randomId = uuid.v4();
            const scheduledJob = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [
                    {
                      routes: [{ childIoFolderReferenceId: randomId }],
                      taskTemplates: [
                        {
                          engineId: testEngine.id,
                          ioFolders: [
                            {
                              referenceId: randomId,
                              mode: IoFolderMode.Chunk,
                              type: IoFolderType.Input
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJob).rejects.toThrow(/not found/);
          });
          xit('Create schedule Job using inaccessible folderId should fail', async () => {
            const otherOrgFolder =
              await sdkClient.sdk.rootFolderWithChildFolders({
                rootFolderType: RootFolderType.Cms,
                limit: 1,
                offset: 0,
                orderBy: [
                  {
                    field: FolderOrderByField.CreatedDateTime,
                    direction: OrderDirection.Desc
                  },
                  {
                    field: FolderOrderByField.Name,
                    direction: OrderDirection.Asc
                  }
                ]
              });

            const folderId = _.get(
              otherOrgFolder,
              'data.rootFolders.records[0].childFolders.records[0].id'
            );

            const scheduledJob = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [
                    {
                      routes: [{ parentIoFolderReferenceId: folderId }],
                      taskTemplates: [
                        {
                          engineId: testEngine.id,
                          ioFolders: [
                            {
                              referenceId: folderId,
                              mode: IoFolderMode.Chunk,
                              type: IoFolderType.Input
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJob).rejects.toThrow(/not found/);
          });

          it('Create schedule Job using valid folderId should success', async () => {
            const createRootFolders = await sdkClient.sdk.createRootFolders(
              { rootFolderType: RootFolderType.Cms },
              getRequestHeaders(adminOptions)
            );

            const rootFolderId = _.get(
              createRootFolders,
              'data.createRootFolders[1].id'
            );

            const newFolderRes = await sdkClient.sdk.createFolder(
              {
                input: {
                  name: `${citestMarker}-child-folder-${uuid.v4()}`,
                  description: 'test',
                  parentId: rootFolderId,
                  rootFolderType: RootFolderType.Cms
                }
              },
              getRequestHeaders(adminOptions)
            );

            const newFolder = _.get(newFolderRes, 'data.createFolder');
            const folderId = newFolder.id;
            testData.folder = newFolder;

            const scheduledJobRes = await sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [
                    {
                      routes: [{ parentIoFolderReferenceId: folderId }],
                      taskTemplates: [
                        {
                          engineId: testEngine.id,
                          ioFolders: [
                            {
                              referenceId: folderId,
                              mode: IoFolderMode.Chunk,
                              type: IoFolderType.Input
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            const scheduledJob = _.get(
              scheduledJobRes,
              'data.createScheduledJob'
            );
            expect(scheduledJob).toBeDefined();
            expect(scheduledJob.id).toBeDefined();
            trackScheduledJob(scheduledJob);
          });

          // taskTemplates:
          it('Create schedule Job using invalid taskTemplates input should fail', async () => {
            // create scheduled job with random engine id
            const scheduledJob = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: uuid.v4() }]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJob).rejects.toThrow(/not found/);
          });

          it('Create schedule Job using valid taskTemplates should success', async () => {
            const scheduledJobRes = await sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            const scheduledJob = _.get(
              scheduledJobRes,
              'data.createScheduledJob'
            );
            expect(scheduledJob).toBeDefined();
            expect(scheduledJob.id).toBeDefined();
            trackScheduledJob(scheduledJob);
            testData.scheduledJobId = scheduledJob.id;
            testData.jobTemplateId = scheduledJob.jobTemplateIds[0];
          });

          //         new job template is created
          it('new job template is created and associate with created job', async () => {
            const jobTemplateRes = await sdkClient.sdk.jobTemplate(
              { id: testData.jobTemplateId },
              getRequestHeaders(adminOptions)
            );

            const jobTemplate = _.get(jobTemplateRes, 'data.jobTemplate');
            expect(jobTemplate).toBeDefined();
            expect(jobTemplate.id).toEqual(testData.jobTemplateId);
          });

          // new job template is associate with created job
          it('new job template is associate with created job', async () => {
            const scheduleJobRes = await sdkClient.sdk.scheduledJobGetById(
              { id: testData.scheduledJobId },
              getRequestHeaders(adminOptions)
            );
            const scheduleJob = _.get(scheduleJobRes, 'data.scheduledJob');
            expect(scheduleJob).toBeDefined();
            expect(scheduleJob.id).toEqual(testData.scheduledJobId);
            const listJobTemplateIds = _.get(
              scheduleJob,
              'allJobTemplates.records',
              []
            ).map((r: any) => r.id);
            expect(listJobTemplateIds).toContain(testData.jobTemplateId);
          });

          // revert ScheduledJob success
          it('revert ScheduledJob success', async () => {
            try {
              let revertScheduledJobRes =
                await sdkClient.sdk.scheduledJobRevert(
                  { input: { id: testData.scheduledJobId } },
                  getRequestHeaders(adminOptions)
                );

              const revertScheduledJob = _.get(
                revertScheduledJobRes,
                'data.scheduledJobRevert'
              );
              expect(revertScheduledJob).toBeDefined();
              expect(revertScheduledJob.id).toEqual(testData.scheduledJobId);
            } catch (error: any) {
              expect(error.message).toContain(
                'This scheduled job is already a legacy schedule job'
              );
            }
          });

          // deleteScheduledJob success
          it('deleteScheduledJob success', async () => {
            let deleteScheduledJobRes = await sdkClient.sdk.deleteScheduledJob(
              { id: testData.scheduledJobId },
              getRequestHeaders(adminOptions)
            );

            const deleteScheduledJob = _.get(
              deleteScheduledJobRes,
              'data.deleteScheduledJob'
            );
            expect(deleteScheduledJob).toBeDefined();
            expect(deleteScheduledJob.id).toEqual(testData.scheduledJobId);
            scheduledJobIdsOrg1.delete(testData.scheduledJobId);
          });
        });

        describe('Schedule job with ScheduledJobDagTemplateConfig', () => {
          it('Create schedule Job using not existed dagTemplateIds should fail', async () => {
            const createResult = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-job-${uuid.v4()}`,
                  dagTemplates: {
                    dagTemplateIds: [uuid.v4()],
                    params: { foo: 'bar' },
                    jobConfig: { foo: 'bar' }
                  }
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(createResult).rejects.toThrow(/not_found/);
          });

          xit('Create schedule Job using inaccessible dagTemplateIds should fail', async () => {
            const createResult = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-job-${uuid.v4()}`,
                  dagTemplates: {
                    dagTemplateIds: [otherOrgDagTemplateId],
                    params: { foo: 'bar' },
                    jobConfig: { foo: 'bar' }
                  }
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(createResult).rejects.toThrow(/not_found/);
          });

          it('Create schedule Job using valid dag template should success', async () => {
            const createResult = await sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-job-${uuid.v4()}`,
                  dagTemplates: {
                    dagTemplateIds: [createDagTemplate.id],
                    params: { foo: 'bar' },
                    jobConfig: { foo: 'bar' }
                  }
                }
              },
              getRequestHeaders(adminOptions)
            );

            const createScheduledJob = _.get(
              createResult,
              'data.createScheduledJob'
            );
            expect(createScheduledJob).toBeDefined();
            expect(createScheduledJob.id).toBeDefined();
            trackScheduledJob(createScheduledJob);
            expect(createScheduledJob.jobTemplateIds).toBeDefined();
            expect(_.isArray(createScheduledJob.jobTemplateIds)).toBe(true);
            expect(createScheduledJob.jobTemplateIds.length).toBe(1);
            expect(createScheduledJob.jobTemplateIds[0]).toBeDefined();

            testData.scheduledJobId = createScheduledJob.id;
            testData.dagTemplateId = createDagTemplate.id;
          });

          it('deleteScheduledJob success', async () => {
            const deleteResult = await sdkClient.sdk.deleteScheduledJob(
              { id: testData.scheduledJobId },
              getRequestHeaders(adminOptions)
            );

            const deleteScheduledJob = _.get(
              deleteResult,
              'data.deleteScheduledJob'
            );

            expect(deleteScheduledJob).toBeDefined();
            expect(deleteScheduledJob.id).toBeDefined();
            expect(deleteScheduledJob.id).toEqual(testData.scheduledJobId);
            scheduledJobIdsOrg1.delete(testData.scheduledJobId);

            const deleteDagTemplateResult =
              await sdkClient.sdk.deleteDagTemplate(
                { id: testData.dagTemplateId },
                getRequestHeaders(adminOptions)
              );

            const deleteDagTemplate = _.get(
              deleteDagTemplateResult,
              'data.deleteDagTemplate'
            );

            expect(deleteDagTemplate).toBeDefined();
            expect(deleteDagTemplate.id).toBeDefined();
            expect(deleteDagTemplate.id).toEqual(testData.dagTemplateId);
            dagTemplateIdsOrg1.delete(testData.dagTemplateId);
          });
        });

        describe('Schedule job with detailsSchemaId', () => {
          beforeAll(async () => {
            // create data registry
            const dataRegistryRes = await sdkClient.sdk.createDataRegistry(
              {
                input: {
                  source: `${citestMarker}-data-registry-${uuid.v4()}`,
                  name: `${citestMarker} Youtube Source Schema ${Date.now().valueOf()}`,
                  description: `${citestMarker}_scheduledJob-youtube-schema`
                }
              },
              getRequestHeaders(adminOptions)
            );

            const dataRegistryResData = _.get(
              dataRegistryRes,
              'data.createDataRegistry'
            );
            expect(dataRegistryResData).toBeDefined();
            expect(dataRegistryResData.id).toBeDefined();
            testData.dataRegistryId = dataRegistryResData.id;

            // create schema
            const testSchemaInput = {
              $id: 'http://example.com/example.json',
              type: 'object',
              definitions: {},
              $schema: 'http://json-schema.org/draft-07/schema#',
              properties: {
                name: {
                  type: 'string',
                  title: 'Name'
                },
                phone: {
                  type: 'string',
                  title: 'Phone'
                }
              }
            };

            const schemaCreateRes = await sdkClient.sdk.upsertSchemaDraft(
              {
                input: {
                  dataRegistryId: testData.dataRegistryId,
                  schema: testSchemaInput
                }
              },
              getRequestHeaders(adminOptions)
            );

            const schemaData = _.get(schemaCreateRes, 'data.upsertSchemaDraft');
            expect(schemaData).toBeDefined();
            expect(schemaData.id).toBeDefined();
            testData.schemaId = schemaData.id;

            await sdkClient.sdk.updateSchemaState(
              {
                input: {
                  id: testData.schemaId,
                  status: SchemaStatus.Published
                }
              },
              getRequestHeaders(adminOptions)
            );
          });

          xit('Create schedule job using not existed schema should fail', async () => {
            const scheduledJobRes = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  detailsSchemaId: uuid.v4(),
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJobRes).rejects.toThrow(/not_found/);
          });

          xit('Create schedule job using inaccessible schema should fail', async () => {
            const privateSchemaRes = sdkClient.sdk.getSchemas(
              {
                limit: 1,
                status: [SchemaStatus.Published],
                accessScope: [AccessScope.Owned]
              },
              getRequestHeaders(adminOptions)
            );

            const privateSchemaId = _.get(
              privateSchemaRes,
              'data.schema.records[0].id',
              null
            );
            expect(privateSchemaId).toBeDefined();

            const scheduledJobRes = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  detailsSchemaId: privateSchemaId,
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJobRes).rejects.toThrow(/not_found/);
          });

          it('Create schedule job using public schema should success', async () => {
            const publicSchemaRes = await sdkClient.sdk.getSchemas(
              {
                limit: 1,
                status: [SchemaStatus.Published],
                accessScope: [AccessScope.Public]
              },
              getRequestHeaders(adminOptions)
            );

            const publicSchemaId = _.get(
              publicSchemaRes,
              'data.schema.records[0].id',
              null
            );
            expect(publicSchemaId).toBeDefined();

            const scheduledJobRes = await sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  detailsSchemaId: publicSchemaId,
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            const scheduledJob = _.get(
              scheduledJobRes,
              'data.createScheduledJob'
            );
            expect(scheduledJob).toBeDefined();
            expect(scheduledJob.id).toBeDefined();
            trackScheduledJob(scheduledJob);
          });

          it('Create schedule job using owned schema should success', async () => {
            const scheduledJobRes = await sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  detailsSchemaId: testData.schemaId,
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            const scheduledJob = _.get(
              scheduledJobRes,
              'data.createScheduledJob'
            );
            expect(scheduledJob).toBeDefined();
            expect(scheduledJob.id).toBeDefined();
            trackScheduledJob(scheduledJob);
            testData.scheduledJobId = scheduledJob.id;
          });

          it('deleteScheduledJob success', async () => {
            let deleteScheduledJob = await sdkClient.sdk.deleteScheduledJob(
              { id: testData.scheduledJobId },
              getRequestHeaders(adminOptions)
            );

            const deleteScheduledJobData = _.get(
              deleteScheduledJob,
              'data.deleteScheduledJob'
            );
            expect(deleteScheduledJobData).toBeDefined();
            expect(deleteScheduledJobData.id).toEqual(testData.scheduledJobId);
            scheduledJobIdsOrg1.delete(testData.scheduledJobId);
          });
        });

        describe('Schedule job with contentTemplates', () => {
          it('Create schedule job using contentTemplates with invalid schemaId should fail', async () => {
            const scheduledJobRes = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ],
                  contentTemplates: [
                    {
                      schemaId: uuid.v4(),
                      data: {
                        url: 'https://youtube.com/channel/123',
                        youtubeChannelUrl: 'https://youtube.com/channel/123',
                        liveTimezone: 'PST'
                      }
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJobRes).rejects.toThrow(/not_found/);
          });
          it('Create schedule job using contentTemplates with valid schema ID success', async () => {
            const scheduledJobRes = await sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ],
                  contentTemplates: [
                    {
                      schemaId: testData.schemaId,
                      data: {
                        url: 'https://youtube.com/channel/123',
                        youtubeChannelUrl: 'https://youtube.com/channel/123',
                        liveTimezone: 'PST'
                      }
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            const scheduledJob = _.get(
              scheduledJobRes,
              'data.createScheduledJob'
            );
            expect(scheduledJob).toBeDefined();
            expect(scheduledJob.id).toBeDefined();
            trackScheduledJob(scheduledJob);
          });

          it('Create schedule job using contentTemplates with invalid sdo ID should fail', async () => {
            const scheduledJobRes = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ],
                  contentTemplates: [
                    {
                      schemaId: testData.schemaId,
                      sdoId: uuid.v4()
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJobRes).rejects.toThrow(/not_found/);
          });

          it('Create schedule job using contentTemplates with valid sdo and schema should success', async () => {
            // create sdo
            const sdoCreateRes = await sdkClient.sdk.createStructuredData(
              {
                input: {
                  schemaId: testData.schemaId,
                  data: { foo: 'bar' }
                }
              },
              getRequestHeaders(adminOptions)
            );

            const sdoData = _.get(sdoCreateRes, 'data.createStructuredData');
            testData.sdoId = sdoData.id;

            const scheduledJobRes = await sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ],
                  contentTemplates: [
                    {
                      schemaId: testData.schemaId,
                      sdoId: sdoData.id
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            const scheduledJob = _.get(
              scheduledJobRes,
              'data.createScheduledJob'
            );
            expect(scheduledJob).toBeDefined();
            expect(scheduledJob.id).toBeDefined();
            trackScheduledJob(scheduledJob);
            testData.scheduledJobId = scheduledJob.id;
          });

          it('new content template is auto created', async () => {
            // const scheduledJob = await jobHelper.helpGetScheduledJobById(
          });

          it('deleteScheduledJob success', async () => {
            let deleteScheduledJob = await sdkClient.sdk.deleteScheduledJob(
              { id: testData.scheduledJobId },
              getRequestHeaders(adminOptions)
            );

            expect(deleteScheduledJob.data).toBeDefined();
            scheduledJobIdsOrg1.delete(testData.scheduledJobId);
          });
        });

        describe('Schedule job with CreateProgramAffiliate', () => {
          it('Create source should success', async () => {
            let createSourceResult = await sdkClient.sdk.createSource(
              {
                input: {
                  sourceTypeId: '1',
                  name: `${citestMarker}_source_${uuid.v4()}`,
                  isPublic: false
                }
              },
              getRequestHeaders(adminOptions)
            );

            const createSourceData = _.get(
              createSourceResult,
              'data.createSource'
            );
            expect(createSourceData).toBeDefined();
            expect(createSourceData.id).toBeDefined();
            testData.sourceId = createSourceData.id;
          });

          it('Create schedule job using not valid source should fail', async () => {
            const scheduledJobRes = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  affiliates: [
                    {
                      sourceId: uuid.v4(),
                      scheduledDay: DayOfWeek.Monday,
                      startDateTime: '2025-02-04T10:30:00.123456Z',
                      stopDateTime: '2025-02-04T10:30:00.123456Z',
                      startTime: '10:30:00',
                      stopTime: '11:30:00'
                    }
                  ],
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJobRes).rejects.toThrow(/not_found/);
          });

          it('Create schedule job using invalid CreateProgramAffiliate should fail', async () => {
            const scheduledJobRes = sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  affiliates: [
                    {
                      sourceId: testData.sourceId,
                      scheduledDay: DayOfWeek.Monday,
                      startDateTime: '2025-02-04T10:30:00.123456Z',
                      stopDateTime: '2025-02-04T10:30:00.123456Z',
                      startTime: '10:30:00',
                      stopTime: '11:30:00xxxx'
                    }
                  ],
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            await expect(scheduledJobRes).rejects.toThrow(
              /Invalid format for Time field/
            );
          });

          it('Create schedule job using valid CreateProgramAffiliate should success', async () => {
            const scheduledJobRes = await sdkClient.sdk.scheduledJobCreate(
              {
                input: {
                  name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                  affiliates: [
                    {
                      sourceId: testData.sourceId,
                      scheduledDay: DayOfWeek.Monday,
                      startDateTime: '2025-02-04T10:30:00.123456Z',
                      stopDateTime: '2025-02-04T10:30:00.123456Z',
                      startTime: '10:30:00',
                      stopTime: '11:30:00'
                    }
                  ],
                  jobTemplates: [
                    {
                      clusterId: testCluster.id,
                      taskTemplates: [{ engineId: testEngine.id }]
                    }
                  ]
                }
              },
              getRequestHeaders(adminOptions)
            );

            const scheduledJob = _.get(
              scheduledJobRes,
              'data.createScheduledJob'
            );
            expect(scheduledJob).toBeDefined();
            expect(scheduledJob.id).toBeDefined();
            trackScheduledJob(scheduledJob);
            testData.scheduledJobId = scheduledJob.id;
          });

          // deleteScheduledJob success
          it('deleteScheduledJob success', async () => {
            let deleteScheduledJob = await sdkClient.sdk.deleteScheduledJob(
              { id: testData.scheduledJobId },
              getRequestHeaders(adminOptions)
            );

            const deleteScheduledJobData = _.get(
              deleteScheduledJob,
              'data.deleteScheduledJob'
            );
            expect(deleteScheduledJobData).toBeDefined();
            expect(deleteScheduledJobData.id).toEqual(testData.scheduledJobId);
            scheduledJobIdsOrg1.delete(testData.scheduledJobId);
          });
        });
      });

      describe('Update Schedule Job', () => {
        beforeAll(async () => {
          // create scheduled job
          const scheduledJobRes = await sdkClient.sdk.scheduledJobCreate(
            {
              input: {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: [
                  {
                    clusterId: testCluster.id,
                    taskTemplates: [{ engineId: testEngine.id }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const scheduledJobResData = _.get(
            scheduledJobRes,
            'data.createScheduledJob'
          );
          expect(scheduledJobResData).toBeDefined();
          expect(scheduledJobResData.id).toBeDefined();
          trackScheduledJob(scheduledJobResData);
          testData.scheduledJobId = scheduledJobResData.id;
        });

        it('update scheduledJob weeklyScheduleParts should success', async () => {
          const updatedScheduledJob = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                weeklyScheduleParts: [
                  {
                    scheduledDay: DayOfWeek.Monday,
                    startTime: '09:00:00-08:00',
                    stopTime: '10:30-08:00'
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJobData = _.get(
            updatedScheduledJob,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJobData).toBeDefined();
          expect(updatedScheduledJobData.id).toEqual(testData.scheduledJobId);
        });

        it('update scheduledJob recurringScheduleParts should success', async () => {
          const updatedScheduledJob = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                recurringScheduleParts: [
                  {
                    repeatIntervalUnit: IntervalUnit.Days,
                    repeatInterval: 1,
                    durationSeconds: 10,
                    startTime: '09:00:00-08:00'
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJobData = _.get(
            updatedScheduledJob,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJobData).toBeDefined();
          expect(updatedScheduledJobData.id).toEqual(testData.scheduledJobId);
        });

        it('update scheduledJob name, description, runMode should success', async () => {
          const updatedScheduledJob = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                name: `${citestMarker}-updated-scheduled-job-${uuid.v4()}`,
                description: 'updated description',
                runMode: RunMode.Recurring
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJobData = _.get(
            updatedScheduledJob,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJobData).toBeDefined();
          expect(updatedScheduledJobData.id).toEqual(testData.scheduledJobId);
          expect(updatedScheduledJobData.name).toContain(
            `${citestMarker}-updated-scheduled-job-`
          );
          expect(updatedScheduledJobData.description).toEqual(
            'updated description'
          );
        });

        it('update scheduledJob isActive, isPublic  should success', async () => {
          const updatedScheduledJob = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                isActive: true,
                isPublic: false
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJobData = _.get(
            updatedScheduledJob,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJobData).toBeDefined();
          expect(updatedScheduledJobData.id).toEqual(testData.scheduledJobId);
          expect(updatedScheduledJobData.isActive).toEqual(true);
          expect(updatedScheduledJobData.isPublic).toEqual(false);
        });

        it('Other org query public scheduledJob should success', async () => {
          const scheduledJobRes = await sdkClient.sdk.scheduledJobs(
            {
              isActive: true,
              limit: 1
            },
            getRequestHeaders(adminOptions)
          );

          const scheduledJob = _.get(scheduledJobRes, 'data.scheduledJobs', []);
          expect(scheduledJob).toBeDefined();
          const records = _.get(scheduledJob, 'records', []);
          expect(records.length).toEqual(1);
        });

        xit('update scheduledJob using invalid startDateTime, stopDateTime should fail', async () => {
          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                startDateTime: 'A2020-12-31T21:07:14-05:00ZZZ0Z',
                stopDateTime: '2019-12-31T21:07:14-05:00ZZZ0'
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(/aaa/);
        });

        it('update scheduledJob using valid startDateTime, stopDateTime should success', async () => {
          const updatedScheduledJobRes = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                startDateTime: '2020-12-31T21:07:14-05:00',
                stopDateTime: '2021-12-31T21:07:14-05:00'
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJob = _.get(
            updatedScheduledJobRes,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        it('update schedule Job jobTemplateIds using invalid jobtemplateId should fail', async () => {
          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplateIds: [uuid.v4()]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(
            /No engine IDs were found/
          );
        });

        it('update schedule Job jobTemplateIds using valid jobtemplateId should success', async () => {
          const updatedScheduledJob = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplateIds: [jobTemplate.id]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJobData = _.get(
            updatedScheduledJob,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJobData).toBeDefined();
          expect(updatedScheduledJobData.id).toEqual(testData.scheduledJobId);
          expect(updatedScheduledJobData.jobTemplateIds).toContain(
            jobTemplate.id
          );
        });

        // update scheduleJob jobTemplates using applicationId:
        // it('update scheduleJob jobTemplates using not exited appId should fail', async () => {});
        // it('update scheduleJob jobTemplates using inaccessible appId should fail', async () => {});
        // it('update scheduleJob jobTemplates using public appID should success', async () => {});
        // it('update scheduleJob jobTemplates using owned appID should success', async () => {});

        // update scheduleJob jobTemplates using clusterId:
        it('update scheduleJob jobTemplates using not exited clusterId should fail', async () => {
          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplates: [
                  {
                    clusterId: uuid.v4(),
                    taskTemplates: [{ engineId: testEngine.id }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        it('update scheduleJob jobTemplates using inaccessible clusterId should fail', async () => {
          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplates: [
                  {
                    clusterId: otherCluster.id,
                    taskTemplates: [{ engineId: testEngine.id }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        it('update scheduleJob jobTemplates using accessible clusterId should success', async () => {
          const clusters = await sdkClient.sdk.createCluster(
            {
              input: {
                name: `${citestMarker}-test-cluster-${uuid.v4()}`,
                dockerCredentials: {},
                allowedEngines: [],
                status: ClusterStatus.Active
              }
            },
            getRequestHeaders(adminOptions)
          );

          newCluster = _.get(clusters, 'data.createCluster');
          trackId(clusterIdsOrg1, newCluster?.id);

          const updatedScheduledJob = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplates: [
                  {
                    clusterId: newCluster.id,
                    taskTemplates: [{ engineId: testEngine.id }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJobData = _.get(
            updatedScheduledJob,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJobData).toBeDefined();
          expect(updatedScheduledJobData.id).toEqual(testData.scheduledJobId);
        });

        // update scheduleJob jobTemplates using routes:
        it('update scheduleJob jobTemplates using not match parentIoFolderReferenceId should fail', async () => {
          const randomId = uuid.v4();
          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplates: [
                  {
                    clusterId: testCluster.id,
                    taskTemplates: [
                      {
                        engineId: testEngine.id,
                        ioFolders: [
                          {
                            referenceId: randomId,
                            mode: IoFolderMode.Chunk,
                            type: IoFolderType.Input
                          }
                        ]
                      }
                    ],
                    routes: [{ parentIoFolderReferenceId: testData.folder.id }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        xit('update scheduleJob jobTemplates using not existed parentIoFolderReferenceId should fail', async () => {
          const randomId = uuid.v4();
          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplates: [
                  {
                    clusterId: testCluster.id,
                    taskTemplates: [
                      {
                        engineId: testEngine.id,
                        ioFolders: [
                          {
                            referenceId: randomId,
                            mode: IoFolderMode.Chunk,
                            type: IoFolderType.Input
                          }
                        ]
                      }
                    ],
                    routes: [{ parentIoFolderReferenceId: randomId }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        xit('update scheduleJob jobTemplates using not existed childIoFolderReferenceId should fail', async () => {
          const randomId = uuid.v4();
          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplates: [
                  {
                    clusterId: testCluster.id,
                    taskTemplates: [
                      {
                        engineId: testEngine.id,
                        ioFolders: [
                          {
                            referenceId: randomId,
                            mode: IoFolderMode.Chunk,
                            type: IoFolderType.Input
                          }
                        ]
                      }
                    ],
                    routes: [{ childIoFolderReferenceId: randomId }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        xit('update scheduleJob jobTemplates using inaccessible FolderReferenceId should fail', async () => {
          const otherOrgFolder = await sdkClient.sdk.rootFolderWithChildFolders(
            {
              limit: 1,
              offset: 0,
              orderBy: [
                {
                  field: FolderOrderByField.CreatedDateTime,
                  direction: OrderDirection.Desc
                },
                {
                  field: FolderOrderByField.Name,
                  direction: OrderDirection.Asc
                }
              ]
            }
          );

          const folderId = _.get(
            otherOrgFolder,
            'data.rootFolders.[0].childFolders.records[0].id'
          );

          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplates: [
                  {
                    clusterId: testCluster.id,
                    taskTemplates: [
                      {
                        engineId: testEngine.id,
                        ioFolders: [
                          {
                            referenceId: folderId,
                            mode: IoFolderMode.Chunk,
                            type: IoFolderType.Input
                          }
                        ]
                      }
                    ],
                    routes: [{ parentIoFolderReferenceId: folderId }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        it('update scheduleJob jobTemplates using valid parentIoFolderReferenceId, childIoFolderReferenceId should success', async () => {
          const updatedScheduledJob = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplates: [
                  {
                    clusterId: testCluster.id,
                    taskTemplates: [
                      {
                        engineId: testEngine.id,
                        ioFolders: [
                          {
                            referenceId: testData.folder.id,
                            mode: IoFolderMode.Chunk,
                            type: IoFolderType.Input
                          }
                        ]
                      }
                    ],
                    routes: [{ parentIoFolderReferenceId: testData.folder.id }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJobData = _.get(
            updatedScheduledJob,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJobData).toBeDefined();
          expect(updatedScheduledJobData.id).toEqual(testData.scheduledJobId);
        });

        it('update scheduleJob jobTemplates using invalid taskTemplates should fail', async () => {
          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplates: [
                  {
                    clusterId: testCluster.id,
                    taskTemplates: [{ engineId: uuid.v4() }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(
            /engines were not found/
          );
        });

        it('new jobTemplates is created after update success', async () => {
          const scheduledJobRes = await sdkClient.sdk.scheduledJob(
            { id: testData.scheduledJobId },
            getRequestHeaders(adminOptions)
          );

          const scheduledJob = _.get(scheduledJobRes, 'data.scheduledJob');
          expect(scheduledJob).toBeDefined();
          expect(scheduledJob.id).toEqual(testData.scheduledJobId);
          const jobTemplateId = _.get(
            scheduledJob,
            'allJobTemplates.records[0].id'
          );

          const updateScheduledJobRes = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                jobTemplates: [
                  {
                    clusterId: testCluster.id,
                    taskTemplates: [{ engineId: testEngine.id }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updateScheduledJob = _.get(
            updateScheduledJobRes,
            'data.updateScheduledJob'
          );

          const newJobTemplateIds = _.get(
            updateScheduledJob,
            'allJobTemplates.records[0].id'
          );
          expect(newJobTemplateIds).not.toEqual(jobTemplateId);
        });

        it('update scheduledJob dagTemplates using not existed dagTemplateIds should fail', async () => {
          const createResult = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                dagTemplates: {
                  dagTemplateIds: [uuid.v4()],
                  params: { foo: 'bar' },
                  jobConfig: { foo: 'bar' }
                }
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(createResult).rejects.toThrow(/not_found/);
        });

        it('update scheduledJob dagTemplates using inaccessible dagTemplateIds should fail', async () => {
          const createResult = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                dagTemplates: {
                  dagTemplateIds: [otherOrgDagTemplateId],
                  params: { foo: 'bar' },
                  jobConfig: { foo: 'bar' }
                }
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(createResult).rejects.toThrow(/not_found/);
        });

        it('update scheduledJob dagTemplates using valid dagTemplateIds should success', async () => {
          // create dag template
          const createTemplateResult = await sdkClient.sdk.createDagTemplate(
            {
              input: {
                name: `${citestMarker} Webstream Speechmatics Reprocess Template`,
                description: 'English Transcription',
                tags: ['transcription'],
                dagTemplateLanguage: 'Handlebars',
                dag: sampleDagTemplate
              }
            },
            getRequestHeaders(adminOptions)
          );
          const dagTemplate = _.get(
            createTemplateResult,
            'data.createDagTemplate'
          );
          trackId(dagTemplateIdsOrg1, dagTemplate?.id);

          const updatedScheduledJobRes = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                dagTemplates: {
                  dagTemplateIds: [dagTemplate.id],
                  params: { foo: 'bar' },
                  jobConfig: { foo: 'bar' }
                }
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJob = _.get(
            updatedScheduledJobRes,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        xit('update scheduledJob detailsSchemaId using not existed schema should fail', async () => {
          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                detailsSchemaId: uuid.v4()
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not_found/);
        });

        xit('update scheduledJob detailsSchemaId using inaccessible schema should fail', async () => {
          const privateSchemaRes = await sdkClient.sdk.getSchemas({
            limit: 1,
            accessScope: [AccessScope.Owned]
          });

          const privateSchemaId = _.get(
            privateSchemaRes,
            'data.getSchemas.records[0].id',
            null
          );
          expect(privateSchemaId).toBeDefined();

          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                detailsSchemaId: privateSchemaId
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not_found/);
        });

        it('update scheduledJob detailsSchemaId using valid schema should success', async () => {
          const updatedScheduledJobRes = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                detailsSchemaId: testData.schemaId
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJob = _.get(
            updatedScheduledJobRes,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        it('update scheduledJob contentTemplates using invalid schemaId should fail', async () => {
          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                contentTemplates: [
                  {
                    schemaId: uuid.v4(),
                    data: {
                      url: 'https://youtube.com/channel/123',
                      youtubeChannelUrl: 'https://youtube.com/channel/123',
                      liveTimezone: 'PST'
                    }
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not_found/);
        });

        it('update scheduledJob contentTemplates using valid schemaId should success', async () => {
          const updatedScheduledJobRes = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                contentTemplates: [
                  {
                    schemaId: testData.schemaId,
                    data: {
                      url: 'https://youtube.com/channel/456',
                      youtubeChannelUrl: 'https://youtube.com/channel/456',
                      liveTimezone: 'PST'
                    }
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJob = _.get(
            updatedScheduledJobRes,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        it('update scheduledJob contentTemplates using invalid sdoId should fail', async () => {
          const updatedScheduledJob = sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                contentTemplates: [
                  {
                    schemaId: testData.schemaId,
                    sdoId: uuid.v4()
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not_found/);
        });

        it('update scheduledJob contentTemplates using valid schemaId, sdo should success', async () => {
          const updatedScheduledJobRes = await sdkClient.sdk.scheduledJobUpdate(
            {
              input: {
                id: testData.scheduledJobId,
                contentTemplates: [
                  {
                    schemaId: testData.schemaId,
                    sdoId: testData.sdoId
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const updatedScheduledJob = _.get(
            updatedScheduledJobRes,
            'data.updateScheduledJob'
          );
          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });
      });

      describe('Clone, revert, delete schedule job', () => {
        let clonedScheduledJobId: string, newScheduledJobId: string;
        beforeAll(async () => {
          // create scheduled job
          const scheduledJobRes = await sdkClient.sdk.scheduledJobCreate(
            {
              input: {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: [
                  {
                    clusterId: testCluster.id,
                    taskTemplates: [{ engineId: testEngine.id }]
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const scheduledJobResData = _.get(
            scheduledJobRes,
            'data.createScheduledJob'
          );
          expect(scheduledJobResData).toBeDefined();
          expect(scheduledJobResData.id).toBeDefined();
          trackScheduledJob(scheduledJobResData);
          testData.scheduledJobId = scheduledJobResData.id;
          newScheduledJobId = scheduledJobResData.id;
        });

        it('Clone not existed ScheduledJob should fail', async () => {
          let cloneScheduledJob = sdkClient.sdk.scheduledJobClone(
            { input: { id: '999999999' } },
            getRequestHeaders(adminOptions)
          );

          await expect(cloneScheduledJob).rejects.toThrow(/not found/);
        });

        it('Delete not existed ScheduledJob should fail', async () => {
          let deleteScheduledJob = sdkClient.sdk.scheduledJobDelete(
            { id: '999999999' },
            getRequestHeaders(adminOptions)
          );

          await expect(deleteScheduledJob).rejects.toThrow(/not found/);
        });

        it('Revert not existed ScheduledJob should fail', async () => {
          let revertScheduledJob = sdkClient.sdk.scheduledJobRevert(
            { input: { id: '999999999' } },
            getRequestHeaders(adminOptions)
          );

          await expect(revertScheduledJob).rejects.toThrow(/not found/);
        });

        // Clone schedule job with orgId Used only by Veritone platform components.
        // Other clients should not attempt to send this field. Any value sent will be ignored.
        //it('Clone ScheduledJob for non existed org should fail', async () => {});
        //it('Clone ScheduledJob for existed org, current org should success', async () => {});

        // unskip after clone scheduled job fixed (VE-20064)
        xit('Clone ScheduledJob success', async () => {
          const cloneScheduledJobRes = await sdkClient.sdk.scheduledJobClone(
            { input: { id: newScheduledJobId } },
            getRequestHeaders(adminOptions)
          );

          const clonedScheduledJob = _.get(
            cloneScheduledJobRes,
            'data.scheduledJobClone'
          );
          expect(clonedScheduledJob).toBeDefined();
          expect(clonedScheduledJob.id).toBeDefined();
          clonedScheduledJobId = clonedScheduledJob.id;
        });

        it('revert ScheduledJob success', async () => {
          try {
            const revertScheduledJobRes =
              await sdkClient.sdk.scheduledJobRevert(
                { input: { id: newScheduledJobId } },
                getRequestHeaders(adminOptions)
              );

            const revertedScheduledJob = _.get(
              revertScheduledJobRes,
              'data.scheduledJobRevert'
            );
            expect(revertedScheduledJob).toBeDefined();
            expect(revertedScheduledJob.id).toEqual(testData.scheduledJobId);
          } catch (error: any) {
            expect(error.message).toContain(
              'This scheduled job is already a legacy schedule job'
            );
          }
        });

        it('Get ScheduledJob success', async () => {
          const scheduledJobRes = await sdkClient.sdk.scheduledJob(
            { id: testData.scheduledJobId },
            getRequestHeaders(adminOptions)
          );

          const scheduledJob = _.get(scheduledJobRes, 'data.scheduledJob');
          expect(scheduledJob).toBeDefined();
        });

        it('deleteScheduledJob success', async () => {
          let deleteScheduledJob = await sdkClient.sdk.scheduledJobDelete(
            { id: newScheduledJobId },
            getRequestHeaders(adminOptions)
          );

          const deleteScheduledJobData = _.get(
            deleteScheduledJob,
            'data.deleteScheduledJob'
          );
          expect(deleteScheduledJobData).toBeDefined();
          expect(deleteScheduledJobData.id).toEqual(newScheduledJobId);
          scheduledJobIdsOrg1.delete(newScheduledJobId);
        });
      });

      afterAll(async () => {
        if (scheduledJobIdsOrg1.size > 0) {
          await Promise.all(
            [...scheduledJobIdsOrg1].map((scheduledJobId) =>
              safe(`delete scheduled job ${scheduledJobId}`, async () =>
                sdkClient.sdk.deleteScheduledJob(
                  { id: scheduledJobId },
                  getRequestHeaders(adminOptions)
                )
              )
            )
          );
        }

        if (dagTemplateIdsOrg1.size > 0) {
          await Promise.all(
            [...dagTemplateIdsOrg1].map((dagTemplateId) =>
              safe(`delete dag template ${dagTemplateId}`, async () =>
                sdkClient.sdk.deleteDagTemplate(
                  { id: dagTemplateId },
                  getRequestHeaders(adminOptions)
                )
              )
            )
          );
        }

        if (testData.folder?.id) {
          await safe(`delete folder ${testData.folder.id}`, async () =>
            sdkClient.sdk.deleteFolder(
              { input: { id: testData.folder.id, orderIndex: 0 } },
              getRequestHeaders(adminOptions)
            )
          );
        }

        // delete all created engines
        if (engineIdsOrg1.length > 0) {
          const promises = engineIdsOrg1.map((engineId) =>
            safe(`delete engine ${engineId}`, async () =>
              sdkClient.sdk.deleteEngine(
                { id: engineId },
                getRequestHeaders(adminOptions)
              )
            )
          );
          await Promise.all(promises);
        }

        // delete tdo
        if (testTdo?.id) {
          await safe(`delete tdo ${testTdo.id}`, async () =>
            sdkClient.sdk.deleteTDO(
              { id: testTdo.id },
              getRequestHeaders(adminOptions)
            )
          );
        }

        if (clusterIdsOrg1.size > 0) {
          await Promise.all(
            [...clusterIdsOrg1].map((clusterId) =>
              safe(`delete cluster ${clusterId}`, async () =>
                sdkClient.sdk.deleteCluster(
                  { id: clusterId },
                  getRequestHeaders(adminOptions)
                )
              )
            )
          );
        }

        if (otherCluster) {
          await safe(`delete cluster ${otherCluster.id}`, async () =>
            sdkClient.sdk.deleteCluster({ id: otherCluster.id })
          );
        }

        // delete users and orgs
        if (!_.isEmpty(testSetup.listOptions)) {
          await Promise.all(
            testSetup.listOptions.map((user: any) =>
              safe(`delete user ${user.userId}`, async () =>
                sdkClient.sdk.deleteUser(
                  { id: user.userId },
                  helpers.requestOptions(superToken).headers
                )
              )
            )
          );
        }

        if (testOrg.id) {
          await safe(`delete org ${testOrg.id}`, async () =>
            sdkClient.sdk.updateOrganization(
              {
                input: {
                  id: testOrg.id,
                  status: OrganizationStatus.Deleted
                }
              },
              getRequestHeaders(superOptions)
            )
          );
        }
      });
    });
  });
});

function getOrgAndUserInput(isEnabledOlp = false): any {
  const createOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      remainingBudget: 1000000,
      metadata: {
        billing: { pausedProcessing: false },
        features: {
          enableOLPFeature: isEnabledOlp ? 'enabled' : 'disabled'
        }
      },
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
        name: `${citestMarker}-admin-user-${uuid.v4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        name: `${citestMarker}-regular-user-${uuid.v4()}@localhost`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };

  return createOrgAndUserInput;
}

async function buildAndDeployEngine(
  engineId: string,
  options: any,
  isPublic = false
): Promise<any> {
  // Create engine build and deploy it
  const engineBuildRes = await sdkClient.sdk.createEngineBuild(
    {
      input: {
        engineId: engineId,
        taskRuntime: { nodeRed: true },
        manifest: { runtime: 'NodeRed' }
      }
    },
    getRequestHeaders(options)
  );

  const engineBuildId = _.get(engineBuildRes, 'data.createEngineBuild.id');

  const buildEngineActionListToUse = isPublic
    ? publicBuildEngineActionList
    : buildEngineActionList;
  // Submit and deploy the build

  let build;
  for (let action of buildEngineActionListToUse) {
    build = await sdkClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildId,
          engineId: engineId,
          action: BuildUpdateAction[action[0] as keyof typeof BuildUpdateAction]
        }
      },
      getRequestHeaders(options)
    );
  }

  return _.get(build, 'data.updateEngineBuild');
}
