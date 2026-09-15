const helpers = require('../../helpers/index');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const tdoHelper = require('../../helpers/tdo');
const jobHelper = require('../../helpers/job');
const taskHelper = require('../../helpers/task');
const engineHelper = require('../../helpers/engine');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const { safe } = require('../../helpers/cleanup/utils');
const citestMarker = globalThis.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

let gqlClient;
const env = config.env;

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

let superToken, superOptions;

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

describe('citest_task: basic test for task', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    superOptions = helpers.requestOptions(superToken);

    result = await userHelper.getMyInfo({
      gqlClient,
      options: superOptions
    });

    expect(result.me).toBeDefined();
  });

  describe.each([false, true])('tasks ', (isEnabledOlp) => {
    let testSetup;
    let testOrg, adminUser;
    let adminOptions;
    let testTdo;
    let testEngine, engineBuild;

    const engineIdsOrg1 = [];

    const testData = {
      engineId: null,
      jobId: null,
      taskId: null,
      SAEngine: null,
      SATdo: null,
      SAJob: null,
      SATask: null,
      SABuild: null
    };
    describe(`tasks test with isEnabledOlp = ${isEnabledOlp}`, () => {
      beforeAll(async () => {
        const createOrgAndUserInput = getOrgAndUserInput(isEnabledOlp);

        // set up org 1
        testSetup = await orgHelper.setupTestOrgAndUser(
          { gqlClient, superAdminToken: superToken },
          createOrgAndUserInput
        );

        testOrg = testSetup.org;
        expect(testOrg).toBeDefined();
        expect(testOrg.name).toContain(`${citestMarker}-org`);
        expect(testOrg.users).toBeDefined();

        // Login for Admin user
        adminUser = _.find(testSetup.listOptions, (user) => {
          return user.key === 'adminUser';
        });
        adminOptions = adminUser.requestOptions;

        // Create test TDO for org 1
        testTdo = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-test-tdo-${uuid.v4()}`,
            ...tdoAssetInput
          }
        );

        // Create engine for org 1
        const engineCreate = await engineHelper.helpCreateEngine(
          { gqlClient, options: adminOptions },
          {
            name: citestMarker + '-engine-' + uuid.v4(),
            categoryId: engineCategoryId,
            deploymentModel: 'FullyNetworkIsolated'
          }
        );
        testEngine = engineCreate.createEngine;
        engineIdsOrg1.push(testEngine.id);
        engineBuild = await buildAndDeployEngine(testEngine.id, adminOptions);

        // create an engine in super admin org
        const superAdminEngineCreate = await engineHelper.helpCreateEngine(
          { gqlClient, options: superOptions },
          {
            name: citestMarker + '-engine-' + uuid.v4(),
            categoryId: engineCategoryId,
            deploymentModel: 'FullyNetworkIsolated'
          }
        );
        testData.SAEngine = superAdminEngineCreate.createEngine;
        testData.SABuild = await buildAndDeployEngine(
          testData.SAEngine.id,
          superOptions
        );
      });

      it('Create Job should success', async () => {
        const job = await jobHelper.helpCreateJob(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-job-${uuid.v4()}`,
            targetId: testTdo.id,
            tasks: [{ engineId: testEngine.id }]
          }
        );
        expect(job).toBeDefined();
        testData.jobId = job.id;
        const tasks = _.get(job, 'tasks.records');
        expect(tasks.length).toBe(1);
        testData.taskId = _.get(tasks, '[0].id');
      });

      it('Get tasks of Job should success', async () => {
        const taskById = await taskHelper.helpGetTaskById(
          { gqlClient, options: adminOptions },
          { taskId: testData.taskId }
        );

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

      describe.each([
        'pending',
        'queued',
        'running',
        'complete',
        'failed',
        'waiting',
        'paused',
        'resuming',
        'aborted'
      ])('Update and manage %s task', (status) => {
        beforeEach(async () => {
          const job = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );
          expect(job).toBeDefined();
          testData.tempJobId = job.id;
          testData.tempTaskId = _.get(job, 'tasks.records[0].id');

          if (status === 'paused' || status === 'resuming') {
            // run the task first
            await taskHelper.helpUpdateTask(
              { gqlClient, options: adminOptions },
              { id: testData.tempTaskId, status: 'running' }
            );
          }

          if (status === 'resuming') {
            // paused the task before resuming
            await taskHelper.helpUpdateTask(
              { gqlClient, options: adminOptions },
              { id: testData.tempTaskId, status: 'paused' }
            );
          }

          const result = await taskHelper.helpUpdateTask(
            { gqlClient, options: adminOptions },
            { id: testData.tempTaskId, status: status }
          );
          expect(result).toBeDefined();
          expect(result.id).toBe(testData.tempTaskId);
          expect(result.status).toBe(status);
        });

        afterEach(async () => {
          const tempJobId = testData.tempJobId;
          const tempTaskId = testData.tempTaskId;

          testData.tempJobId = null;
          testData.tempTaskId = null;

          // delete task's job
          if (tempTaskId) {
            await safe(`update tempTaskId to aborted`, () =>
              taskHelper.helpUpdateTask(
                { gqlClient, options: adminOptions },
                { id: tempTaskId, status: 'aborted' }
              )
            );
          }

          // delete created jobs
          if (tempJobId) {
            await safe(`cancel job tempJobId`, () =>
              jobHelper.helpCancelJob(
                { gqlClient, options: adminOptions },
                { jobId: tempJobId }
              )
            );
          }
        });

        it.each([
          'pending',
          'queued',
          'running',
          'complete',
          'failed',
          'waiting',
          'paused',
          'resuming',
          'aborted'
        ])(`Update a task from ${status} to %s`, async (newStatus) => {
          let shouldSuccess = true;
          if (failStatusMap.has(`${status}-${newStatus}`)) {
            shouldSuccess = false;
          }

          const updateTaskPromise = taskHelper.helpUpdateTask(
            { gqlClient, options: adminOptions },
            { id: testData.tempTaskId, status: newStatus }
          );

          if (shouldSuccess) {
            const updateTaskOutput = await updateTaskPromise;
            expect(updateTaskOutput).toBeDefined();
            expect(updateTaskOutput.id).toBe(testData.tempTaskId);
            expect(updateTaskOutput.status).toBe(newStatus);
          } else {
            await expect(updateTaskPromise).rejects.toThrow(/not_allowed/);
          }
        });
      });

      xit('Update Task jobId using random id should failed', async () => {
        const updateTaskOutput = taskHelper.helpUpdateTask(
          { gqlClient, options: adminOptions },
          { id: testData.taskId, jobId: uuid.v4(), status: 'queued' }
        );

        expect(updateTaskOutput).rejects.toThrow(/not found/);
      });

      it('Update Task using valid jobId should success', async () => {
        const job = await jobHelper.helpCreateJob(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-job-${uuid.v4()}`,
            targetId: testTdo.id,
            tasks: [{ engineId: testEngine.id }]
          }
        );
        expect(job).toBeDefined();
        testData.jobId2 = job.id;

        const updateTaskOutput = await taskHelper.helpUpdateTask(
          { gqlClient, options: adminOptions },
          { id: testData.taskId, jobId: testData.jobId2, status: 'queued' }
        );

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
      });

      it('Update Task output should success', async () => {
        const outputData = {
          key1: 'value1'
        };
        const updateTaskOutput = await taskHelper.helpUpdateTask(
          { gqlClient, options: adminOptions },
          { id: testData.taskId, status: 'queued', output: outputData }
        );

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
        const output = _.get(updateTaskOutput, 'taskOutput');
        expect(output.key1).toEqual('value1');
      });

      it('Update Task outputString should success', async () => {
        const outputData = {
          key2: 'value2'
        };
        const updateTaskOutput = await taskHelper.helpUpdateTask(
          { gqlClient, options: adminOptions },
          {
            id: testData.taskId,
            status: 'queued',
            outputString: JSON.stringify(outputData)
          }
        );

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
        const output = _.get(updateTaskOutput, 'taskOutput');
        expect(output.key2).toEqual('value2');
      });

      it('Update Task taskOutput should success', async () => {
        const outputData = {
          key3: 'value3'
        };
        const updateTaskOutput = await taskHelper.helpUpdateTask(
          { gqlClient, options: adminOptions },
          {
            id: testData.taskId,
            status: 'queued',
            taskOutput: outputData
          }
        );

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
        const output = _.get(updateTaskOutput, 'taskOutput');
        expect(output.key3).toEqual('value3');
      });

      it('Update Task failureReason, failureMessage should success', async () => {
        const message = 'This is a failure message for testing.';
        const updateTaskOutput = await taskHelper.helpUpdateTask(
          { gqlClient, options: adminOptions },
          {
            id: testData.taskId,
            status: 'failed',
            failureReason: 'unknown',
            failureMessage: message
          }
        );

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
        expect(updateTaskOutput.failureReason).toBe('unknown');
        expect(updateTaskOutput.failureMessage).toBe(message);
      });

      it('Update Task notificationUris should success', async () => {
        const uri = 'http://localhost:3000/notify-task';
        const updateTaskOutput = await taskHelper.helpUpdateTask(
          { gqlClient, options: adminOptions },
          {
            id: testData.taskId,
            status: 'failed',
            notificationUris: [uri]
          }
        );

        expect(updateTaskOutput).toBeDefined();
        expect(updateTaskOutput.id).toBe(testData.taskId);
        expect(updateTaskOutput.notificationUris).toContain(uri);
      });

      // unskip it after VE-20202 is Done
      xdescribe('addTasksToJobs tests', () => {
        it('addTasksToJobs using invalid jobId should fail', async () => {
          const addTasksPromise = taskHelper.helpAddTasksToJobs(
            { gqlClient, options: adminOptions },
            {
              tasks: [
                {
                  id: testData.taskId,
                  jobId: uuid.v4(),
                  engineId: testEngine.id,
                  buildId: engineBuild.id,
                  status: 'failed',
                  createdDateTime: new Date().toISOString()
                }
              ]
            }
          );

          await expect(addTasksPromise).rejects.toThrow(/not found/);
        });

        it('addTasksToJobs using not existed engineId should fail', async () => {
          const addTasksPromise = taskHelper.helpAddTasksToJobs(
            { gqlClient, options: adminOptions },
            {
              tasks: [
                {
                  id: testData.taskId,
                  jobId: testData.jobId,
                  engineId: uuid.v4(),
                  buildId: engineBuild.id,
                  status: 'pending',
                  createdDateTime: new Date().toISOString()
                }
              ]
            }
          );

          await expect(addTasksPromise).rejects.toThrow(/not found/);
        });

        it('addTasksToJobs using an engineId the user cannot access should fail', async () => {
          const addTasksPromise = taskHelper.helpAddTasksToJobs(
            { gqlClient, options: adminOptions },
            {
              tasks: [
                {
                  id: testData.taskId,
                  jobId: testData.jobId,
                  engineId: testData.SAEngine.id,
                  buildId: testData.SABuild.id,
                  status: 'pending',
                  createdDateTime: new Date().toISOString()
                }
              ]
            }
          );

          await expect(addTasksPromise).rejects.toThrow(/not found/);
        });

        it('addTasksToJobs using invalid buildId should fail', async () => {
          const addTasksPromise = taskHelper.helpAddTasksToJobs(
            { gqlClient, options: adminOptions },
            {
              tasks: [
                {
                  id: testData.taskId,
                  jobId: testData.jobId,
                  engineId: testEngine.id,
                  buildId: uuid.v4(),
                  status: 'pending',
                  createdDateTime: new Date().toISOString()
                }
              ]
            }
          );

          await expect(addTasksPromise).rejects.toThrow(/not found/);
        });

        it('addTasksToJobs using invalid status  should fail', async () => {
          const addTasksPromise = taskHelper.helpAddTasksToJobs(
            { gqlClient, options: adminOptions },
            {
              tasks: [
                {
                  id: testData.taskId,
                  jobId: testData.jobId,
                  engineId: testEngine.id,
                  buildId: engineBuild.id,
                  status: 'aborted',
                  createdDateTime: 'invalid-date-time'
                }
              ]
            }
          );

          await expect(addTasksPromise).rejects.toThrow(/not allowed/);
        });

        it('addTasksToJobs using invalid createdDateTime should fail', async () => {
          const addTasksPromise = taskHelper.helpAddTasksToJobs(
            { gqlClient, options: adminOptions },
            {
              tasks: [
                {
                  id: testData.taskId,
                  jobId: testData.jobId,
                  engineId: testEngine.id,
                  buildId: engineBuild.id,
                  status: 'pending',
                  createdDateTime: 'invalid-date-time'
                }
              ]
            }
          );

          await expect(addTasksPromise).rejects.toThrow(/invalid/);
        });

        it('addTasksToJobs using valid input should success', async () => {
          const addTaskOutput = await taskHelper.helpAddTasksToJobs(
            { gqlClient, options: adminOptions },
            {
              tasks: [
                {
                  id: testData.taskId,
                  jobId: testData.jobId,
                  engineId: testEngine.id,
                  buildId: engineBuild.id,
                  status: 'pending',
                  createdDateTime: new Date().toISOString()
                }
              ]
            }
          );

          expect(addTaskOutput).toBeDefined();
          expect(addTaskOutput.id).toBe(testData.taskId);
        });
      });

      xit('appendWarningToTask using invalid referenceId should fail', async () => {
        const appendWarningPromise = taskHelper.helpAppendWarningToTask(
          { gqlClient, options: adminOptions },
          {
            taskId: testData.taskId,
            referenceId: uuid.v4(),
            reason: 'This is a test warning message.'
          }
        );

        await expect(appendWarningPromise).rejects.toThrow(/not found/);
      });

      it('appendWarningToTask using valid referenceId should success', async () => {
        const appendWarningOutput = await taskHelper.helpAppendWarningToTask(
          { gqlClient, options: adminOptions },
          {
            taskId: testData.taskId,
            referenceId: testData.jobId,
            reason: 'This is a test warning message.'
          }
        );
        expect(appendWarningOutput).toBeDefined();
        expect(appendWarningOutput).toBe(testData.taskId);
      });

      it('Get task should success', async () => {
        const taskById = await taskHelper.helpGetTaskById(
          { gqlClient, options: adminOptions },
          { taskId: testData.taskId }
        );

        expect(taskById).toBeDefined();
        expect(taskById.id).toBe(testData.taskId);
      });

      it('Cancel not existed task should fail', async () => {
        const cancelTaskPromise = taskHelper.helpUpdateTask(
          { gqlClient, options: adminOptions },
          { id: uuid.v4(), status: 'aborted' }
        );

        await expect(cancelTaskPromise).rejects.toThrow(/invalid_input/);
      });

      it('Cancel inaccessible task should fail', async () => {
        // create a task in super admin org
        testData.SATdo = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: superOptions },
          {
            name: `${citestMarker}-test-tdo-${uuid.v4()}`,
            ...tdoAssetInput
          }
        );

        const superAdminJob = await jobHelper.helpCreateJob(
          { gqlClient, options: superOptions },
          {
            name: `${citestMarker}-job-${uuid.v4()}`,
            targetId: testData.SATdo.id,
            tasks: [{ engineId: testData.SAEngine.id }]
          }
        );

        testData.SAJob = superAdminJob;

        testData.SATask = _.get(superAdminJob, 'tasks.records[0].id');

        const cancelTaskPromise = taskHelper.helpUpdateTask(
          { gqlClient, options: adminOptions },
          { id: testData.SATask, status: 'aborted' }
        );

        await expect(cancelTaskPromise).rejects.toThrow(/not found/);
      });

      it('Cancel task success', async () => {
        const cancelTaskOutput = await taskHelper.helpUpdateTask(
          { gqlClient, options: adminOptions },
          { id: testData.taskId, status: 'aborted' }
        );

        expect(cancelTaskOutput).toBeDefined();
        expect(cancelTaskOutput.id).toBe(testData.taskId);
        expect(cancelTaskOutput.status).toBe('aborted');

        await taskHelper.helpUpdateTask(
          { gqlClient, options: superOptions },
          { id: testData.SATask, status: 'aborted' }
        );

        testData.SATask = null;
      });

      afterAll(async () => {
        // delete task
        if (testData.SATask) {
          await safe(`abort task SATask`, () =>
            taskHelper.helpUpdateTask(
              { gqlClient, options: superOptions },
              { id: testData.SATask, status: 'aborted' }
            )
          );
        }

        // delete created jobs
        if (testData.jobId2) {
          await safe(`update job jobId2 to queued`, () =>
            jobHelper.helpUpdateJobs(
              { gqlClient, options: adminOptions },
              { ids: [testData.jobId2], status: 'queued' }
            )
          );

          await safe(`cancel job jobId2`, () =>
            jobHelper.helpCancelJob(
              { gqlClient, options: adminOptions },
              { jobId: testData.jobId2 }
            )
          );
        }

        if (testData.jobId) {
          await safe(`delete job jobId`, () =>
            jobHelper.helpUpdateJobs(
              { gqlClient, options: adminOptions },
              { ids: [testData.jobId], status: 'queued' }
            )
          );

          await safe(`cancel job jobId`, () =>
            jobHelper.helpCancelJob(
              { gqlClient, options: adminOptions },
              { jobId: testData.jobId }
            )
          );
        }
        if (testData.SAJob) {
          // update job to queued first
          await safe(`update job SAJob to queued`, () =>
            jobHelper.helpUpdateJobs(
              { gqlClient, options: superOptions },
              { ids: [testData.SAJob.id], status: 'queued' }
            )
          );

          // cancel job
          await safe(`cancel job SAJob`, () =>
            jobHelper.helpCancelJob(
              { gqlClient, options: superOptions },
              { jobId: testData.SAJob.id }
            )
          );
        }

        // delete tdo
        if (testTdo) {
          await safe(`delete tdo testTdo`, () =>
            tdoHelper.helpDeleteTDO(
              { gqlClient, options: adminOptions },
              { id: testTdo.id }
            )
          );
        }
        if (testData.SATdo) {
          await safe(`delete tdo SATdo`, () =>
            tdoHelper.helpDeleteTDO(
              { gqlClient, options: superOptions },
              { id: testData.SATdo.id }
            )
          );
        }

        // delete all created engines
        if (testData.SAEngine) {
          await safe(`delete engine SAEngine`, () =>
            engineHelper.helpDeleteEngine(
              { gqlClient, options: superOptions },
              { id: testData.SAEngine.id }
            )
          );
        }

        if (engineIdsOrg1.length > 0) {
          for (let engineId of engineIdsOrg1) {
            await safe(`delete engine`, () =>
              engineHelper.helpDeleteEngine(
                { gqlClient, options: adminOptions },
                { id: engineId }
              )
            );
          }
          engineIdsOrg1.length = 0;
        }

        // delete users and orgs
        if (!_.isEmpty(testSetup?.listOptions)) {
          const listUserIds = testSetup.listOptions.map((user) => user.userId);
          await safe(`delete users`, () =>
            userHelper.deleteMultiUser({ gqlClient }, listUserIds)
          );
        }

        if (testOrg?.id) {
          await safe(`delete organization `, () =>
            orgHelper.deleteOrganization(
              { gqlClient, options: superOptions },
              testOrg.id
            )
          );
        }
      });
    });
  });
});

function getOrgAndUserInput(isEnabledOlp = false) {
  const createOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      remainingBudget: 1000000,
      kvp: {
        billing: { pausedProcessing: false },
        features: {
          enableOLPFeature: isEnabledOlp ? 'enabled' : 'disabled'
        }
      },
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
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'regularUser',
        name: `${citestMarker}-regular-user-${uuid.v4()}@localhost`,
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };

  return createOrgAndUserInput;
}

async function buildAndDeployEngine(engineId, options, isPublic = false) {
  // Create engine build and deploy it
  const engineBuildRes = await engineHelper.helpCreateEngineBuild(
    { gqlClient, options: options },
    {
      engineId: engineId,
      taskRuntime: { nodeRed: true },
      manifest: { runtime: 'NodeRed' }
    }
  );
  const engineBuildId = _.get(engineBuildRes, 'createEngineBuild.id');

  const buildEngineActionListToUse = isPublic
    ? publicBuildEngineActionList
    : buildEngineActionList;
  // Submit and deploy the build

  let build;
  for (let action of buildEngineActionListToUse) {
    build = await engineHelper.helpUpdateEngineBuild(
      { gqlClient, options: options },
      {
        id: engineBuildId,
        engineId: engineId,
        action: action[0]
      }
    );
  }

  return build.updateEngineBuild;
}
