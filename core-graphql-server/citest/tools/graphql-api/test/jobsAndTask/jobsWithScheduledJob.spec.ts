// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import {
  AuthType,
  buildRequestHeaders,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';

import {
  DeploymentModel,
  UpdateJobsStatus,
  TaskFailureReason,
  BuildUpdateAction,
  DayOfWeek,
  RunMode,
  ClusterStatus,
  OrganizationType,
  SchemaStatus,
  JobStatus,
  OrganizationStatus
} from '../../src/gql';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import _ from 'lodash';

const citestMarker = (globalThis as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled =
  (globalThis as any).enableDefaultDesktopApp || false;

let gqlClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;

const engineCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

const buildEngineActionList = [
  ['submit', 'pending'],
  ['deploy', 'deployed']
];

const publicBuildEngineActionList = [
  ['submit', 'pending'],
  ['approve', 'approved'],
  ['deploy', 'deployed']
];

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

describe('citest_jobs: Job Test With ScheduleJob option', () => {
  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;

    const myInfo = await gqlClient.sdk.me();

    expect(myInfo?.data?.me).toBeDefined();
  });

  afterAll(async () => {
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  describe.each([false, true])('jobs', (isEnabledOlp) => {
    let adminRequestHeaders: Record<string, string>;

    let testOrg: any;
    let adminUser: any;
    let testTdo: any;
    let testEngine: any;
    let testCluster: any;

    const engineIdsOrg1: string[] = [];
    const jobIdListsOrg1: string[] = [];

    const testData: any = {
      dataRegId: null,
      schemaId: null,
      clusterId: null,
      engineId: null,
      scheduledJobId: null,
      jobId: null
    };
    describe(`jobs test with isEnabledOlp = ${isEnabledOlp}`, () => {
      beforeAll(async () => {
        const orgInput = getOrgAndUserInput(isEnabledOlp);

        //Create Org 1 and users
        const createOrgRes = await gqlClient.sdk.createOrganization({
          input: orgInput.orgInput
        });

        testOrg = createOrgRes?.data?.createOrganization;

        expect(testOrg).toBeDefined();

        const adminUserInput = {
          ...orgInput.userInputs[0],
          organizationId: testOrg.id
        };

        const adminUserRes = await gqlClient.sdk.createUser({
          input: adminUserInput
        });

        adminUser = adminUserRes?.data?.createUser;
        expect(adminUser).toBeDefined();

        adminRequestHeaders = await buildRequestHeaders(gqlClient, {
          userName: adminUserInput.name,
          password: adminUserInput.password
        });

        // create data registry for org 1
        const createDataReg = await gqlClient.sdk.createDataRegistry(
          {
            input: {
              source: `${citestMarker}_${uuidv4()} source`,
              name: `${citestMarker} ${uuidv4()}`,
              description: `${citestMarker} test`
            }
          },
          adminRequestHeaders
        );

        const dataRegistry = createDataReg?.data?.createDataRegistry;
        testData.dataRegId = dataRegistry?.id;
        expect(testData.dataRegId).toBeDefined();

        // create schema for org 1
        const createSchema = await gqlClient.sdk.upsertSchemaDraft(
          {
            input: {
              dataRegistryId: testData.dataRegId,
              schema: {
                type: 'object',
                title: `${citestMarker} Scheduled_job_tests`,
                required: ['url'],
                properties: {
                  url: {
                    id: '/properties/url',
                    type: 'string',
                    title: 'YouTube Channel URL',
                    pattern:
                      '^((http|https)://)?(www.)?youtube.com/(channel/|user/)[a-zA-Z0-9-]{1,}'
                  }
                },
                description: citestMarker
              }
            }
          },
          adminRequestHeaders
        );

        const schema = createSchema?.data?.upsertSchemaDraft;
        testData.schemaId = schema?.id;
        expect(testData.schemaId).toBeDefined();

        //publish schema
        const publishSchema = await gqlClient.sdk.updateSchemaState(
          {
            input: {
              id: testData.schemaId,
              status: SchemaStatus.Published
            }
          },
          adminRequestHeaders
        );

        const publishedSchema = publishSchema?.data?.updateSchemaState;
        expect(publishedSchema?.id).toEqual(testData.schemaId);
        expect(publishedSchema?.status).toEqual(SchemaStatus.Published);
      });

      describe('Job with scheduled job', () => {
        beforeAll(async () => {
          // create TDO for Org 1
          const createTdo = await gqlClient.sdk.createTDOWithAsset(
            {
              input: {
                name: `${citestMarker}-test-tdo-${uuidv4()}`,
                ...tdoAssetInput
              }
            },
            adminRequestHeaders
          );

          testTdo = createTdo?.data?.createTDOWithAsset;

          // create engine for Org 1
          const createEngine = await gqlClient.sdk.createEngine(
            {
              input: {
                name: `${citestMarker}-engine-${uuidv4()}`,
                categoryId: engineCategoryId,
                deploymentModel: DeploymentModel.FullyNetworkIsolated
              }
            },
            adminRequestHeaders
          );

          testEngine = createEngine?.data?.createEngine;

          engineIdsOrg1.push(testEngine.id);

          await buildAndDeployEngine(testEngine.id, adminRequestHeaders);

          // create cluster test for Org 1
          const clusters = await gqlClient.sdk.createCluster(
            {
              input: {
                name: `${citestMarker}-test-cluster-${uuidv4()}`,
                dockerCredentials: {},
                allowedEngines: [],
                status: ClusterStatus.Active
              }
            },
            adminRequestHeaders
          );

          testCluster = clusters?.data?.createCluster;
        });

        it('Admin Create scheduled Job', async () => {
          const createScheduledJob = await gqlClient.sdk.createScheduledJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                runMode: RunMode.Now,
                details: {
                  programFormat: 'Adult Contemporary',
                  foo: 'bar',
                  isNational: true
                },
                contentTemplates: [
                  {
                    schemaId: testData.schemaId,
                    data: {
                      url: 'https://youtube.com/channel/123',
                      youtubeChannelUrl: 'https://youtube.com/channel/123',
                      liveTimezone: 'PST'
                    }
                  }
                ],
                isPublic: false,
                weeklyScheduleParts: [
                  {
                    scheduledDay: DayOfWeek.Monday,
                    startTime: '09:00:00-08:00',
                    stopTime: '10:30-08:00'
                  }
                ],
                jobTemplates: [
                  {
                    skipDecider: true,
                    clusterId: testCluster.id,
                    taskTemplates: [
                      {
                        engineId: testEngine.id,
                        payload: { foo: 'bar' }
                      }
                    ]
                  }
                ]
              }
            },
            adminRequestHeaders
          );

          testData.scheduledJobId =
            createScheduledJob?.data?.createScheduledJob?.id;

          expect(testData.scheduledJobId).toBeDefined();
        });

        it('Create Job using owned scheduled job should success', async () => {
          const jobRes = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                scheduledJobId: testData.scheduledJobId,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeaders
          );

          const job = jobRes?.data?.createJob;

          expect(job).toBeDefined();

          testData.jobId = job?.id;
          jobIdListsOrg1.push(job?.id!);
        });

        describe('Job Update Tests', () => {
          beforeEach(async () => {
            const newJob = await gqlClient.sdk.createJob(
              {
                input: {
                  name: `${citestMarker}-job-${uuidv4()}`,
                  targetId: testTdo.id,
                  clusterId: testCluster.id,
                  scheduledJobId: testData.scheduledJobId,
                  tasks: [{ engineId: testEngine.id }]
                }
              },
              adminRequestHeaders
            );
            expect(newJob?.data?.createJob).toBeDefined();
            expect(newJob?.data?.createJob?.id).toBeDefined();
            testData.jobId = newJob?.data?.createJob?.id;
            jobIdListsOrg1.push(testData.jobId);
          });

          afterEach(async () => {
            if (testData.jobId) {
              await safe(`cancel job ${testData.jobId}`, async () => {
                await gqlClient.sdk.cancelJob(
                  { id: testData.jobId },
                  adminRequestHeaders
                );

                _.pull(jobIdListsOrg1, testData.jobId);
              });

              testData.jobId = null;
            }
          });

          it('update Job status', async () => {
            const updateJobRes = await gqlClient.sdk.updateJobs(
              {
                input: {
                  ids: [testData.jobId],
                  status: UpdateJobsStatus.Queued
                }
              },
              adminRequestHeaders
            );

            expect(updateJobRes?.data?.updateJobs).toBeDefined();
            expect(updateJobRes?.data?.updateJobs?.records?.length).toBe(1);
            expect(updateJobRes?.data?.updateJobs?.records?.[0]?.id).toBe(
              testData.jobId
            );
            const jobStatus =
              updateJobRes?.data?.updateJobs?.records?.[0]?.status;
            expect([JobStatus.Queued, JobStatus.Running]).toContain(jobStatus);
          });

          it('update Job taskOutput', async () => {
            const updateJobRes = await gqlClient.sdk.updateJobs(
              {
                input: {
                  ids: [testData.jobId],
                  status: UpdateJobsStatus.Queued,
                  taskOutput: {
                    failureType: TaskFailureReason.InternalError,
                    failureMessage: 'testing'
                  }
                }
              },
              adminRequestHeaders
            );

            expect(updateJobRes?.data?.updateJobs).toBeDefined();
            expect(updateJobRes?.data?.updateJobs?.records?.length).toBe(1);
            expect(updateJobRes?.data?.updateJobs?.records?.[0]?.id).toBe(
              testData.jobId
            );
            const jobStatus =
              updateJobRes?.data?.updateJobs?.records?.[0]?.status;
            expect([JobStatus.Queued, JobStatus.Running]).toContain(jobStatus);
          });

          it('update Job notification Uri', async () => {
            const notificationUri = 'http://localhost:3000/notify-job';
            const updateJobRes = await gqlClient.sdk.updateJobs(
              {
                input: {
                  ids: [testData.jobId],
                  status: UpdateJobsStatus.Queued,
                  notificationUris: [notificationUri]
                }
              },
              adminRequestHeaders
            );

            expect(updateJobRes?.data?.updateJobs).toBeDefined();
            expect(updateJobRes?.data?.updateJobs?.records?.length).toBe(1);
            expect(updateJobRes?.data?.updateJobs?.records?.[0]?.id).toBe(
              testData.jobId
            );
            const notificationUris =
              updateJobRes?.data?.updateJobs?.records?.[0]?.notificationUris;
            expect(notificationUris?.includes(notificationUri)).toBe(true);
          });

          it('update Job with incorrect requiredCurrentStatus should fail', async () => {
            const test = await gqlClient.sdk.updateJobs(
              {
                input: {
                  ids: [testData.jobId],
                  status: UpdateJobsStatus.Queued,
                  requiredCurrentStatus: JobStatus.Failed
                }
              },
              adminRequestHeaders
            );

            const updateJobs = _.get(test, 'data.updateJobs.records', []);
            expect(updateJobs.length).toBe(0);
          });

          it('update Job with valid requiredCurrentStatus should success', async () => {
            const updateJobRes = await gqlClient.sdk.updateJobs(
              {
                input: {
                  ids: [testData.jobId],
                  status: UpdateJobsStatus.Queued,
                  requiredCurrentStatus: JobStatus.Pending
                }
              },
              adminRequestHeaders
            );

            expect(updateJobRes?.data?.updateJobs).toBeDefined();
            expect(updateJobRes?.data?.updateJobs?.records?.length).toBe(1);
            expect(updateJobRes?.data?.updateJobs?.records?.[0]?.id).toBe(
              testData.jobId
            );
            const jobStatus =
              updateJobRes?.data?.updateJobs?.records?.[0]?.status;
            expect([JobStatus.Queued, JobStatus.Running]).toContain(jobStatus);
          });

          it('retry Job success', async () => {
            const retryJobRes = await gqlClient.sdk.retryJob(
              {
                id: testData.jobId
              },
              adminRequestHeaders
            );

            const retriedJob = retryJobRes?.data?.retryJob;
            expect(retriedJob).toBeDefined();
            expect(retriedJob?.id).toBeDefined();
            jobIdListsOrg1.push(retriedJob?.id!);
          });

          it('cancel Job success', async () => {
            const cancelJobRes = await gqlClient.sdk.cancelJob(
              {
                id: testData.jobId
              },
              adminRequestHeaders
            );
            const cancelledJob = cancelJobRes?.data?.cancelJob;
            expect(cancelledJob).toBeDefined();
            expect(cancelledJob?.id).toBe(testData.jobId);
            _.pull(jobIdListsOrg1, testData.jobId);
            testData.jobId = null;
          });
        });
      });

      afterAll(async () => {
        // cancel all created jobs
        if (jobIdListsOrg1.length > 0) {
          const promises = jobIdListsOrg1.map((jobId) =>
            safe(`cancel job ${jobId}`, async () =>
              gqlClient.sdk.cancelJob({ id: jobId }, adminRequestHeaders)
            )
          );
          await Promise.all(promises);
        }

        //Delete Scheduled Job
        if (testData.scheduledJobId) {
          await safe(
            `delete scheduled job ${testData.scheduledJobId}`,
            async () =>
              gqlClient.sdk.deleteScheduledJob(
                {
                  id: testData.scheduledJobId
                },
                adminRequestHeaders
              )
          );
        }

        // delete schema
        if (testData.schemaId) {
          await safe(`delete schema ${testData.schemaId}`, async () =>
            gqlClient.sdk.updateSchemaState(
              {
                input: {
                  id: testData.schemaId,
                  status: SchemaStatus.Deleted
                }
              },
              adminRequestHeaders
            )
          );
        }

        // delete all created engines
        if (engineIdsOrg1.length > 0) {
          const promises = engineIdsOrg1.map((engineId) =>
            safe(`delete engine ${engineId}`, async () =>
              gqlClient.sdk.deleteEngine(
                {
                  id: engineId
                },
                adminRequestHeaders
              )
            )
          );
          await Promise.all(promises);
        }

        // delete Cluster
        if (testCluster?.id) {
          await safe(`delete cluster ${testCluster.id}`, async () =>
            gqlClient.sdk.deleteCluster(
              {
                id: testCluster.id
              },
              adminRequestHeaders
            )
          );
        }

        // delete tdo
        if (testTdo?.id) {
          await safe(`delete tdo ${testTdo.id}`, async () =>
            gqlClient.sdk.deleteTDO(
              {
                id: testTdo.id
              },
              adminRequestHeaders
            )
          );
        }

        // delete users
        if (adminUser?.id) {
          await safe(`delete user ${adminUser.id}`, async () =>
            gqlClient.sdk.deleteUser({
              id: adminUser.id
            })
          );
        }

        // delete org
        if (testOrg?.id) {
          await safe(`delete organization ${testOrg.id}`, async () =>
            gqlClient.sdk.updateOrganization({
              input: {
                id: testOrg.id,
                status: OrganizationStatus.Deleted
              }
            })
          );
        }
      });
    });
  });
});

function getOrgAndUserInput(isEnabledOlp = false) {
  return {
    orgInput: {
      name: `${citestMarker}-org-${uuidv4()}`,
      businessUnit: 'Legal',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
      remainingBudget: 1000000,
      metadata: {
        billing: {
          pausedProcessing: false
        },
        features: {
          enableOLPFeature: isEnabledOlp ? 'enabled' : 'disabled'
        }
      }
    },
    userInputs: [
      {
        name: `${citestMarker}-admin-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652',
          '032218c3-d47e-4287-9d16-7bb867c01266',
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
        ].filter((roleId): roleId is string => roleId !== null)
      }
    ]
  };
}

async function buildAndDeployEngine(
  engineId: string,
  headers: Record<string, string>,
  isPublic = false
) {
  const engineBuildRes = await gqlClient.sdk.createEngineBuild(
    {
      input: {
        engineId,
        taskRuntime: { nodeRed: true },
        manifest: { runtime: 'NodeRed' }
      }
    },
    headers
  );

  const engineBuildId = engineBuildRes?.data?.createEngineBuild?.id;
  expect(engineBuildId).toBeDefined();

  const actions = isPublic
    ? publicBuildEngineActionList
    : buildEngineActionList;

  let build;

  for (const action of actions) {
    build = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildId!,
          engineId,
          action: action[0] as BuildUpdateAction
        }
      },
      headers
    );
  }

  return build;
}
