import { helpers } from '../../src/helpers/index';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  BuildUpdateAction,
  DeploymentModel,
  OrganizationStatus,
  TaskFailureReason,
  TaskStatus,
  UpdateJobsStatus
} from '../../src/gql';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';

const config = helpers.config;
import * as _ from 'lodash';
import * as uuid from 'uuid';
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

let superToken: string, superOptions: any;

const engineCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

const buildEngineActionList = [
  BuildUpdateAction.Submit,
  BuildUpdateAction.Deploy
];
const publicBuildEngineActionList = [
  BuildUpdateAction.Submit,
  BuildUpdateAction.Approve,
  BuildUpdateAction.Deploy
];

describe('citest_task: basic test for task', () => {
  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );

    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    sdkClient = isolatedSuperadmin.client;

    expect(sdkClient.sessionToken).toBeDefined();
    superToken = sdkClient.sessionToken as string;
    superOptions = helpers.requestOptions(superToken);

    const result = await sdkClient.sdk.me();
    expect(result.data.me).toBeDefined();
  });

  afterAll(async () => {
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  describe.each([false, true])('tasks ', (isEnabledOlp) => {
    let testSetup: any;
    let testOrg: any, adminUser: any;
    let adminOptions: any;
    let testTdo: any;
    let testEngine: any, engineBuild: any;

    const engineIdsOrg1: string[] = [];

    const testData: any = {
      engineId: null,
      jobId: null,
      taskId: null,
      SAEngine: null,
      SATdo: null,
      SAJob: null,
      SATask: null,
      SABuild: null,
      tempJobId: null,
      tempTaskId: null,
      jobId2: null
    };
    describe(`tasks test with isEnabledOlp = ${isEnabledOlp}`, () => {
      beforeAll(async () => {
        const createOrgAndUserInput = getOrgAndUserInput(isEnabledOlp);

        // set up org 1
        testSetup = await setupTestOrgAndUser(sdkClient, createOrgAndUserInput);

        testOrg = testSetup.org;
        expect(testOrg).toBeDefined();
        expect(testOrg.name).toContain(`${citestMarker}-org`);
        expect(testOrg.users).toBeDefined();

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
        const engineCreateRes = await sdkClient.sdk.createEngine(
          {
            input: {
              name: `${citestMarker}-engine-${uuid.v4()}`,
              categoryId: engineCategoryId,
              deploymentModel: DeploymentModel.FullyNetworkIsolated
            }
          },
          getRequestHeaders(adminOptions)
        );
        testEngine = _.get(engineCreateRes, 'data.createEngine');
        engineIdsOrg1.push(testEngine.id);
        engineBuild = await buildAndDeployEngine(testEngine.id, adminOptions);

        // create an engine in super admin org
        const superAdminEngineCreate = await sdkClient.sdk.createEngine({
          input: {
            name: `${citestMarker}-engine-${uuid.v4()}`,
            categoryId: engineCategoryId,
            deploymentModel: DeploymentModel.FullyNetworkIsolated
          }
        });
        testData.SAEngine = _.get(superAdminEngineCreate, 'data.createEngine');
        testData.SABuild = await buildAndDeployEngine(
          testData.SAEngine.id,
          null
        );
      });

      it('Create Job should success', async () => {
        const createJobRes = await sdkClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [{ engineId: testEngine.id }]
            }
          },
          getRequestHeaders(adminOptions)
        );

        const job = _.get(createJobRes, 'data.createJob', {
          id: null,
          tasks: { records: [] }
        });
        expect(job).toBeDefined();
        testData.jobId = job.id;
        const tasks = _.get(job, 'tasks.records', []);
        expect(tasks.length).toBe(1);
        testData.taskId = _.get(tasks, '[0].id', null);
      });

      it('Get tasks of Job should success', async () => {
        const taskByIdRes = await sdkClient.sdk.task(
          { id: testData.taskId },
          getRequestHeaders(adminOptions)
        );
        const taskById = _.get(taskByIdRes, 'data.task', { id: null });

        expect(taskById).toBeDefined();
        expect(taskById.id).toBe(testData.taskId);
      });

      const failStatusMap = new Set([
        'pending-paused',
        'pending-resuming',
        'queued-paused',
        'queued-resuming',
        'running-resuming',
        'complete-running',
        'complete-paused',
        'complete-resuming',
        'failed-paused',
        'failed-resuming',
        'waiting-paused',
        'waiting-resuming',
        'aborted-pending',
        'aborted-queued',
        'aborted-complete',
        'aborted-waiting',
        'aborted-paused',
        'aborted-resuming',
        'paused-running',
        'resuming-paused'
      ]);

      const allStatuses = [
        TaskStatus.Pending,
        TaskStatus.Queued,
        TaskStatus.Running,
        TaskStatus.Complete,
        TaskStatus.Failed,
        TaskStatus.Waiting,
        TaskStatus.Paused,
        TaskStatus.Resuming,
        TaskStatus.Aborted
      ];

      describe.each(allStatuses)('Update and manage %s task', (status) => {
        beforeEach(async () => {
          const createJobRes = await sdkClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuid.v4()}`,
                targetId: testTdo.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const job = _.get(createJobRes, 'data.createJob', {
            id: null,
            tasks: { records: [] }
          });
          expect(job).toBeDefined();
          testData.tempJobId = job.id;
          testData.tempTaskId = _.get(job, 'tasks.records[0].id');

          if (status === TaskStatus.Paused || status === TaskStatus.Resuming) {
            // run the task first
            await sdkClient.sdk.updateTask(
              {
                input: { id: testData.tempTaskId, status: TaskStatus.Running }
              },
              getRequestHeaders(adminOptions)
            );
          }

          if (status === TaskStatus.Resuming) {
            // pause the task before resuming
            await sdkClient.sdk.updateTask(
              {
                input: { id: testData.tempTaskId, status: TaskStatus.Paused }
              },
              getRequestHeaders(adminOptions)
            );
          }

          const updateRes = await sdkClient.sdk.updateTask(
            { input: { id: testData.tempTaskId, status } },
            getRequestHeaders(adminOptions)
          );
          const result = _.get(updateRes, 'data.updateTask', {
            id: null,
            status: null
          });

          expect(result).toBeDefined();
          expect(result.id).toBe(testData.tempTaskId);
          expect(result.status).toBe(status);
        });

        afterEach(async () => {
          const tempTaskId = testData.tempTaskId;
          const tempJobId = testData.tempJobId;
          testData.tempTaskId = null;
          testData.tempJobId = null;

          if (tempTaskId) {
            await safe(`update tempTaskId to aborted`, () =>
              sdkClient.sdk.updateTask(
                { input: { id: tempTaskId, status: TaskStatus.Aborted } },
                getRequestHeaders(adminOptions)
              )
            );
          }

          if (tempJobId) {
            await safe(`update job tempJobId to queued`, () =>
              sdkClient.sdk.updateJobs(
                {
                  input: {
                    ids: [tempJobId],
                    status: UpdateJobsStatus.Queued
                  }
                },
                getRequestHeaders(adminOptions)
              )
            );

            await safe(`cancel job tempJobId`, () =>
              sdkClient.sdk.cancelJob(
                { id: tempJobId },
                getRequestHeaders(adminOptions)
              )
            );
          }
        });

        it.each(allStatuses)(
          `Update a task from ${status} to %s`,
          async (newStatus) => {
            const shouldSuccess = !failStatusMap.has(`${status}-${newStatus}`);

            const updateTaskPromise = sdkClient.sdk.updateTask(
              {
                input: {
                  id: testData.tempTaskId,
                  status: newStatus
                }
              },
              getRequestHeaders(adminOptions)
            );

            if (shouldSuccess) {
              const updateTaskRes = await updateTaskPromise;
              const updateTaskOutput = _.get(updateTaskRes, 'data.updateTask', {
                id: null,
                status: null
              });
              expect(updateTaskOutput).toBeDefined();
              expect(updateTaskOutput.id).toBe(testData.tempTaskId);
              expect(updateTaskOutput.status).toBe(newStatus);
            } else {
              await expect(updateTaskPromise).rejects.toThrow(/not_allowed/);
            }
          }
        );
      });

      xit('Update Task jobId using random id should failed', async () => {
        const updateTaskOutput = sdkClient.sdk.updateTask(
          {
            input: {
              id: testData.taskId,
              jobId: uuid.v4(),
              status: TaskStatus.Queued
            }
          },
          getRequestHeaders(adminOptions)
        );

        await expect(updateTaskOutput).rejects.toThrow(/not found/);
      });

      it('Update Task using valid jobId should success', async () => {
        const createJobRes = await sdkClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [{ engineId: testEngine.id }]
            }
          },
          getRequestHeaders(adminOptions)
        );

        const job = _.get(createJobRes, 'data.createJob', {
          id: null,
          tasks: { records: [] }
        });
        expect(job).toBeDefined();
        testData.jobId2 = job.id;

        const updateTaskOutputRes = await sdkClient.sdk.updateTask(
          {
            input: {
              id: testData.taskId,
              jobId: testData.jobId2,
              status: TaskStatus.Queued
            }
          },
          getRequestHeaders(adminOptions)
        );
        const updateTaskOutput = _.get(updateTaskOutputRes, 'data.updateTask', {
          id: null,
          status: null
        });

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
      });

      it('Update Task output should success', async () => {
        const outputData = { key1: 'value1' };

        const updateTaskOutputRes = await sdkClient.sdk.updateTask(
          {
            input: {
              id: testData.taskId,
              status: TaskStatus.Queued,
              output: outputData
            }
          },
          getRequestHeaders(adminOptions)
        );
        const updateTaskOutput = _.get(updateTaskOutputRes, 'data.updateTask', {
          id: null,
          status: null
        });

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
        const output = _.get(updateTaskOutput, 'taskOutput');
        expect(output.key1).toEqual('value1');
      });

      it('Update Task outputString should success', async () => {
        const outputData = { key2: 'value2' };

        const updateTaskOutputRes = await sdkClient.sdk.updateTask(
          {
            input: {
              id: testData.taskId,
              status: TaskStatus.Queued,
              outputString: JSON.stringify(outputData)
            }
          },
          getRequestHeaders(adminOptions)
        );
        const updateTaskOutput = _.get(updateTaskOutputRes, 'data.updateTask', {
          id: null,
          status: null
        });

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
        const output = _.get(updateTaskOutput, 'taskOutput');
        expect(output.key2).toEqual('value2');
      });

      it('Update Task taskOutput should success', async () => {
        const outputData = { key3: 'value3' };

        const updateTaskOutputRes = await sdkClient.sdk.updateTask(
          {
            input: {
              id: testData.taskId,
              status: TaskStatus.Queued,
              taskOutput: outputData
            }
          },
          getRequestHeaders(adminOptions)
        );
        const updateTaskOutput = _.get(updateTaskOutputRes, 'data.updateTask', {
          id: null,
          status: null
        });

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
        const output = _.get(updateTaskOutput, 'taskOutput');
        expect(output.key3).toEqual('value3');
      });

      it('Update Task failureReason, failureMessage should success', async () => {
        const message = 'This is a failure message for testing.';

        const updateTaskOutputRes = await sdkClient.sdk.updateTask(
          {
            input: {
              id: testData.taskId,
              status: TaskStatus.Failed,
              failureReason: TaskFailureReason.Unknown,
              failureMessage: message
            }
          },
          getRequestHeaders(adminOptions)
        );
        const updateTaskOutput = _.get(updateTaskOutputRes, 'data.updateTask', {
          id: null,
          status: null,
          failureReason: null,
          failureMessage: null
        });

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
        expect(updateTaskOutput.failureReason).toBe('unknown');
        expect(updateTaskOutput.failureMessage).toBe(message);
      });

      it('Update Task notificationUris should success', async () => {
        const uri = 'http://localhost:3000/notify-task';

        const updateTaskOutputRes = await sdkClient.sdk.updateTask(
          {
            input: {
              id: testData.taskId,
              status: TaskStatus.Failed,
              notificationUris: [uri]
            }
          },
          getRequestHeaders(adminOptions)
        );
        const updateTaskOutput = _.get(updateTaskOutputRes, 'data.updateTask', {
          id: null,
          status: null,
          notificationUris: []
        });

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
        expect(updateTaskOutput.notificationUris).toContain(uri);
      });

      // unskip these tests after the issue with addTasksToJobs is fixed (VE-20202)
      xdescribe('addTasksToJobs tests', () => {
        it('addTasksToJobs using invalid jobId should fail', async () => {
          const addTasksPromise = sdkClient.sdk.addTasksToJobs(
            {
              input: {
                tasks: [
                  {
                    id: testData.taskId,
                    jobId: uuid.v4(),
                    engineId: testEngine.id,
                    buildId: engineBuild.id,
                    status: TaskStatus.Failed,
                    createdDateTime: new Date().toISOString()
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(addTasksPromise).rejects.toThrow(/not found/);
        });

        it('addTasksToJobs using not existed engineId should fail', async () => {
          const addTasksPromise = sdkClient.sdk.addTasksToJobs(
            {
              input: {
                tasks: [
                  {
                    id: testData.taskId,
                    jobId: testData.jobId,
                    engineId: uuid.v4(),
                    buildId: engineBuild.id,
                    status: TaskStatus.Pending,
                    createdDateTime: new Date().toISOString()
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(addTasksPromise).rejects.toThrow(/not found/);
        });

        it('addTasksToJobs using an engineId the user cannot access should fail', async () => {
          const addTasksPromise = sdkClient.sdk.addTasksToJobs(
            {
              input: {
                tasks: [
                  {
                    id: testData.taskId,
                    jobId: testData.jobId,
                    engineId: testData.SAEngine.id,
                    buildId: testData.SABuild.id,
                    status: TaskStatus.Pending,
                    createdDateTime: new Date().toISOString()
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(addTasksPromise).rejects.toThrow(/not found/);
        });

        it('addTasksToJobs using invalid buildId should fail', async () => {
          const addTasksPromise = sdkClient.sdk.addTasksToJobs(
            {
              input: {
                tasks: [
                  {
                    id: testData.taskId,
                    jobId: testData.jobId,
                    engineId: testEngine.id,
                    buildId: uuid.v4(),
                    status: TaskStatus.Pending,
                    createdDateTime: new Date().toISOString()
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(addTasksPromise).rejects.toThrow(/not found/);
        });

        it('addTasksToJobs using invalid status should fail', async () => {
          const addTasksPromise = sdkClient.sdk.addTasksToJobs(
            {
              input: {
                tasks: [
                  {
                    id: testData.taskId,
                    jobId: testData.jobId,
                    engineId: testEngine.id,
                    buildId: engineBuild.id,
                    status: TaskStatus.Aborted,
                    createdDateTime: 'invalid-date-time'
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(addTasksPromise).rejects.toThrow(/not allowed/);
        });

        it('addTasksToJobs using invalid createdDateTime should fail', async () => {
          const addTasksPromise = sdkClient.sdk.addTasksToJobs(
            {
              input: {
                tasks: [
                  {
                    id: testData.taskId,
                    jobId: testData.jobId,
                    engineId: testEngine.id,
                    buildId: engineBuild.id,
                    status: TaskStatus.Pending,
                    createdDateTime: 'invalid-date-time'
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          await expect(addTasksPromise).rejects.toThrow(/invalid/);
        });

        it('addTasksToJobs using valid input should success', async () => {
          const addTaskOutputRes = await sdkClient.sdk.addTasksToJobs(
            {
              input: {
                tasks: [
                  {
                    id: testData.taskId,
                    jobId: testData.jobId,
                    engineId: testEngine.id,
                    buildId: engineBuild.id,
                    status: TaskStatus.Pending,
                    createdDateTime: new Date().toISOString()
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

          const addTaskOutput = _.get(
            addTaskOutputRes,
            'data.addTasksToJobs.createdTasks[0]',
            { id: null }
          );
          expect(addTaskOutput).toBeDefined();
          expect(addTaskOutput.id).toBe(testData.taskId);
        });
      });

      xit('appendWarningToTask using invalid referenceId should fail', async () => {
        const appendWarningPromise = sdkClient.sdk.appendWarningToTask(
          {
            taskId: testData.taskId,
            referenceId: uuid.v4(),
            reason: 'This is a test warning message.'
          },
          getRequestHeaders(adminOptions)
        );

        await expect(appendWarningPromise).rejects.toThrow(/not found/);
      });

      it('appendWarningToTask using valid referenceId should success', async () => {
        const appendWarningOutput = await sdkClient.sdk.appendWarningToTask(
          {
            taskId: testData.taskId,
            referenceId: testData.jobId,
            reason: 'This is a test warning message.'
          },
          getRequestHeaders(adminOptions)
        );

        expect(appendWarningOutput).toBeDefined();
        expect(appendWarningOutput?.data?.appendWarningToTask).toBe(
          testData.taskId
        );
      });

      it('Get task should success', async () => {
        const taskByIdRes = await sdkClient.sdk.task(
          { id: testData.taskId },
          getRequestHeaders(adminOptions)
        );
        const taskById = _.get(taskByIdRes, 'data.task', { id: null });

        expect(taskById).toBeDefined();
        expect(taskById.id).toBe(testData.taskId);
      });

      it('Cancel not existed task should fail', async () => {
        const cancelTaskPromise = sdkClient.sdk.updateTask(
          {
            input: {
              id: uuid.v4(),
              status: TaskStatus.Aborted
            }
          },
          getRequestHeaders(adminOptions)
        );

        await expect(cancelTaskPromise).rejects.toThrow(/invalid_input/);
      });

      it('Cancel inaccessible task should fail', async () => {
        // create a task in super admin org
        const saTdoRes = await sdkClient.sdk.createTDOWithAsset({
          input: {
            name: `${citestMarker}-test-tdo-${uuid.v4()}`,
            ...tdoAssetInput
          }
        });
        testData.SATdo = _.get(saTdoRes, 'data.createTDOWithAsset');

        const superAdminJobRes = await sdkClient.sdk.createJob({
          input: {
            name: `${citestMarker}-job-${uuid.v4()}`,
            targetId: testData.SATdo.id,
            tasks: [{ engineId: testData.SAEngine.id }]
          }
        });

        testData.SAJob = _.get(superAdminJobRes, 'data.createJob');
        testData.SATask = _.get(testData.SAJob, 'tasks.records[0].id');

        const cancelTaskPromise = sdkClient.sdk.updateTask(
          {
            input: {
              id: testData.SATask,
              status: TaskStatus.Aborted
            }
          },
          getRequestHeaders(adminOptions)
        );

        await expect(cancelTaskPromise).rejects.toThrow(/not found/);
      });

      it('Cancel task success', async () => {
        const cancelTaskOutputRes = await sdkClient.sdk.updateTask(
          {
            input: {
              id: testData.taskId,
              status: TaskStatus.Aborted
            }
          },
          getRequestHeaders(adminOptions)
        );
        const cancelTaskOutput = _.get(cancelTaskOutputRes, 'data.updateTask', {
          id: null,
          status: null
        });

        expect(cancelTaskOutput).toBeDefined();
        expect(cancelTaskOutput.id).toBe(testData.taskId);
        expect(cancelTaskOutput.status).toBe(TaskStatus.Aborted);

        await safe(`abort SATask`, () =>
          sdkClient.sdk.updateTask({
            input: {
              id: testData.SATask,
              status: TaskStatus.Aborted
            }
          })
        );

        testData.SATask = null;
      });

      afterAll(async () => {
        // delete task
        if (testData.SATask) {
          await safe(`abort SATask`, () =>
            sdkClient.sdk.updateTask({
              input: {
                id: testData.SATask,
                status: TaskStatus.Aborted
              }
            })
          );
        }

        // delete created jobs
        if (testData.jobId) {
          await safe(`update job jobId to queued`, () =>
            sdkClient.sdk.updateJobs(
              {
                input: {
                  ids: [testData.jobId],
                  status: UpdateJobsStatus.Queued
                }
              },
              getRequestHeaders(adminOptions)
            )
          );

          await safe(`cancel job jobId`, () =>
            sdkClient.sdk.cancelJob(
              { id: testData.jobId },
              getRequestHeaders(adminOptions)
            )
          );
        }

        if (testData.SAJob) {
          await safe(`update job SAJob to queued`, () =>
            sdkClient.sdk.updateJobs({
              input: {
                ids: [testData.SAJob.id],
                status: UpdateJobsStatus.Queued
              }
            })
          );

          await safe(`cancel job SAJob`, () =>
            sdkClient.sdk.cancelJob({ id: testData.SAJob.id })
          );
        }

        if (testData.jobId2) {
          await safe(`update job jobId2 to queued`, () =>
            sdkClient.sdk.updateJobs(
              {
                input: {
                  ids: [testData.jobId2],
                  status: UpdateJobsStatus.Queued
                }
              },
              getRequestHeaders(adminOptions)
            )
          );

          await safe(`cancel job jobId2`, () =>
            sdkClient.sdk.cancelJob(
              { id: testData.jobId2 },
              getRequestHeaders(adminOptions)
            )
          );
        }

        // delete tdo
        if (testTdo) {
          await safe(`delete testTdo`, () =>
            sdkClient.sdk.deleteTDO(
              { id: testTdo.id },
              getRequestHeaders(adminOptions)
            )
          );
        }
        if (testData.SATdo) {
          await safe(`delete SATdo`, () =>
            sdkClient.sdk.deleteTDO({ id: testData.SATdo.id })
          );
        }

        // delete all created engines
        if (testData.SAEngine) {
          await safe(`delete SAEngine`, () =>
            sdkClient.sdk.deleteEngine({ id: testData.SAEngine.id })
          );
        }

        if (engineIdsOrg1.length > 0) {
          for (const engineId of engineIdsOrg1) {
            await safe(`delete engine`, () =>
              sdkClient.sdk.deleteEngine(
                { id: engineId },
                getRequestHeaders(adminOptions)
              )
            );
          }
          engineIdsOrg1.length = 0;
        }

        // delete users and orgs
        if (!_.isEmpty(testSetup?.listOptions)) {
          await Promise.all(
            testSetup.listOptions.map((user: any) =>
              safe(`delete user ${user.userId}`, () =>
                sdkClient.sdk.deleteUser(
                  { id: user.userId },
                  getRequestHeaders(superOptions)
                )
              )
            )
          );
        }

        if (testOrg?.id) {
          await safe(`delete organization`, () =>
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
      name: `${citestMarker}-org-${uuid.v4()}`,
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
        engineId,
        taskRuntime: { nodeRed: true },
        manifest: { runtime: 'NodeRed' }
      }
    },
    getRequestHeaders(options)
  );
  const engineBuildId = _.get(engineBuildRes, 'data.createEngineBuild.id', '');

  const buildEngineActionListToUse = isPublic
    ? publicBuildEngineActionList
    : buildEngineActionList;

  let build;
  for (const action of buildEngineActionListToUse) {
    build = await sdkClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildId,
          engineId,
          action
        }
      },
      getRequestHeaders(options)
    );
  }

  return _.get(build, 'data.updateEngineBuild');
}
