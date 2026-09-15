const helpers = require('../../helpers/index');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const tdoHelper = require('../../helpers/tdo');
const schemaHelper = require('../../helpers/schema');
const jobHelper = require('../../helpers/job');
const engineHelper = require('../../helpers/engine');
const dataRegistryHelper = require('../../helpers/dataRegistry');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const { safe } = require('../../helpers/cleanup/utils');
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

let gqlClient;
const env = config.env;
const version = 'v1'; // Added version variable

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

let superToken, superOptions, superUserId, superOrgGuid, superOrgId;

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

describe('citest_jobs: Job Test With ScheduleJob option', () => {
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
    superOrgGuid = _.get(result, 'me.organization.guid');
    superOrgId = _.get(result, 'me.organization.id');
    superUserId = _.get(result, 'me.id');
  });

  describe.each([false, true])('jobs ', (isEnabledOlp) => {
    let testSetup;

    let testOrg, adminUser, regularUser, testUsers;
    let adminOptions, adminOptions2, regularOptions;
    let createOrgAndUserInput;
    let testTdo;
    let testEngine;
    let testCluster;
    const jobIdListsOrg1 = [];
    const engineIdsOrg1 = [];

    const testData = {
      dataRegId: null,
      schemaId: null,
      scheduledJobId: null,
      jobId: null
    };

    describe(`jobs test with isEnabledOlp = ${isEnabledOlp}`, () => {
      beforeAll(async () => {
        createOrgAndUserInput = getOrgAndUserInput(isEnabledOlp);

        // set up org 1
        testSetup = await orgHelper.setupTestOrgAndUser(
          { gqlClient, superAdminToken: superToken },
          createOrgAndUserInput
        );

        testOrg = testSetup.org;
        expect(testOrg).toBeDefined();
        expect(testOrg.name).toContain(`${citestMarker}-org`);
        expect(testOrg.users).toBeDefined();
        testUsers = _.get(testOrg, 'users.records');

        // Login for Admin user
        adminUser = _.find(testSetup.listOptions, (user) => {
          return user.key === 'adminUser';
        });
        adminOptions = adminUser.requestOptions;

        // create data registry for org 1
        const dataRegistry = await dataRegistryHelper.helpCreateDataRegistry(
          { gqlClient, options: adminOptions },
          {
            source: `${citestMarker}_${uuid.v4()} source`,
            name: `${citestMarker} ${uuid.v4()}`,
            description: `${citestMarker} test`
          }
        );

        testData.dataRegId = _.get(dataRegistry, 'createDataRegistry.id');
        expect(testData.dataRegId).toBeDefined();

        // create schema for org 1
        const schemaCreateResult = await schemaHelper.helpUpsertSchemaDraft(
          { gqlClient, options: adminOptions },
          {
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
        );
        const schemaResult = _.get(schemaCreateResult, 'upsertSchemaDraft');
        testData.schemaId = schemaResult.id;
        expect(testData.schemaId).toBeDefined();

        const schemaUpdateResult = await schemaHelper.helpPublishSchema(
          { gqlClient, options: adminOptions },
          { id: testData.schemaId }
        );

        const schemaUpdate = _.get(schemaUpdateResult, 'updateSchemaState');
        expect(schemaUpdate.id).toEqual(testData.schemaId);
        expect(schemaUpdate.status).toEqual('published');

        // Login for Regular user
        regularUser = _.find(testSetup.listOptions, (user) => {
          return user.key === 'regularUser';
        });
        regularOptions = regularUser.requestOptions;
      });

      describe('Test Job With Scheduled Job', () => {
        beforeAll(async () => {
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

          await buildAndDeployEngine(testEngine.id, adminOptions);

          // Create test Cluster for org 1
          const clusters = await engineHelper.helpCreateCluster(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-test-cluster-${uuid.v4()}`,
              dockerCredentials: {},
              allowedEngines: [],
              status: 'active'
            }
          );
          testCluster = clusters.createCluster;
        });

        it('Admin Create scheduled Job', async () => {
          // create Scheduled Job for org 1
          const createScheduledJobResult =
            await jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-job-${uuid.v4()}`,
                runMode: 'Now',
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
                    scheduledDay: 'Monday',
                    startTime: '09:00:00-08:00',
                    stopTime: '10:30-08:00'
                  }
                ],
                jobTemplates: [
                  {
                    skipDecider: true,
                    clusterId: testCluster.id,
                    jobConfig: {
                      createTDOInput: {
                        details: {
                          tags: ['foo', 'bar']
                        }
                      }
                    },
                    taskTemplates: [
                      {
                        engineId: testEngine.id,
                        payload: {
                          foo: 'bar'
                        }
                      }
                    ]
                  }
                ]
              }
            );
          testData.scheduledJobId = _.get(createScheduledJobResult, 'id');
          expect(testData.scheduledJobId).toBeDefined();
        });

        it('Create Job using owned scheduled job should success', async () => {
          const job = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              scheduledJobId: testData.scheduledJobId,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          expect(job).toBeDefined();
          expect(job.id).toBeDefined();
          testData.jobId = job.id;
          jobIdListsOrg1.push(job.id);

          await safe(`cancel job ${job.id}`, async () =>
            jobHelper.helpCancelJob(
              { gqlClient, options: adminOptions },
              { jobId: job.id }
            )
          );

          _.pull(jobIdListsOrg1, job.id);
          testData.jobId = null;
        });

        describe('Job Update Tests', () => {
          beforeEach(async () => {
            const newJob = await jobHelper.helpCreateJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-job-${uuid.v4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                scheduledJobId: testData.scheduledJobId,
                tasks: [{ engineId: testEngine.id }]
              }
            );

            expect(newJob).toBeDefined();
            expect(newJob.id).toBeDefined();
            testData.jobId = newJob.id;
            jobIdListsOrg1.push(newJob.id);
          });

          afterEach(async () => {
            if (testData.jobId) {
              await safe(`cancel job ${testData.jobId}`, async () =>
                jobHelper.helpCancelJob(
                  { gqlClient, options: adminOptions },
                  { jobId: testData.jobId }
                )
              );

              _.pull(jobIdListsOrg1, testData.jobId);
              testData.jobId = null;
            }
          });

          it('update Job status', async () => {
            const updateJobStatus = await jobHelper.helpUpdateJobs(
              { gqlClient, options: adminOptions },
              { ids: [testData.jobId], status: 'queued' }
            );

            expect(updateJobStatus).toBeDefined();
            expect(updateJobStatus.length).toBe(1);
            expect(updateJobStatus[0].id).toBe(testData.jobId);
            const jobStatus = updateJobStatus[0].status;
            expect(['queued', 'running']).toContain(jobStatus);
          });

          it('update Job taskOutput', async () => {
            const updateTaskOutput = await jobHelper.helpUpdateJobs(
              { gqlClient, options: adminOptions },
              {
                ids: [testData.jobId],
                status: 'queued',
                taskOutput: {
                  failureType: 'internal_error',
                  failureMessage: 'testing'
                }
              }
            );

            expect(updateTaskOutput).toBeDefined();
            expect(updateTaskOutput.length).toBe(1);
            const jobStatus = updateTaskOutput[0].status;
            expect(updateTaskOutput[0].id).toBe(testData.jobId);
            expect(['queued', 'running']).toContain(jobStatus);
          });

          it('update Job notification Uri', async () => {
            const notificationUri = 'http://localhost:3000/notify-job';
            const updateJobNotification = await jobHelper.helpUpdateJobs(
              { gqlClient, options: adminOptions },
              {
                ids: [testData.jobId],
                status: 'queued',
                notificationUris: [notificationUri]
              }
            );

            expect(updateJobNotification).toBeDefined();
            expect(updateJobNotification.length).toBe(1);
            expect(updateJobNotification[0].id).toBe(testData.jobId);
            const notificationUris = _.get(
              updateJobNotification,
              '[0].notificationUris'
            );
            expect(notificationUris.includes(notificationUri)).toBe(true);
          });

          it('update Job with incorrect requiredCurrentStatus should fail', async () => {
            const updateJob = await jobHelper.helpUpdateJobs(
              { gqlClient, options: adminOptions },
              {
                ids: [testData.jobId],
                status: 'queued',
                requiredCurrentStatus: 'failed'
              }
            );

            expect(updateJob.length).toBe(0);
          });

          it('update Job with valid requiredCurrentStatus should success', async () => {
            const updateJobRequiredCurrentStatus =
              await jobHelper.helpUpdateJobs(
                { gqlClient, options: adminOptions },
                {
                  ids: [testData.jobId],
                  status: 'queued',
                  requiredCurrentStatus: 'pending'
                }
              );

            expect(updateJobRequiredCurrentStatus).toBeDefined();
            expect(updateJobRequiredCurrentStatus.length).toBe(1);
            expect(updateJobRequiredCurrentStatus[0].id).toBe(testData.jobId);
            const jobStatus = updateJobRequiredCurrentStatus[0].status;
            expect(['queued', 'running']).toContain(jobStatus);
          });

          it('retry Job success', async () => {
            const retryJob = await jobHelper.helpRetryJob(
              { gqlClient, options: adminOptions },
              { jobId: testData.jobId }
            );

            expect(retryJob).toBeDefined();
            expect(retryJob.id).toBeDefined();
            jobIdListsOrg1.push(retryJob.id);
          });

          it('cancel Job success', async () => {
            const cancelJob = await jobHelper.helpCancelJob(
              { gqlClient, options: adminOptions },
              { jobId: testData.jobId }
            );

            expect(cancelJob).toBeDefined();
            expect(cancelJob.id).toBe(testData.jobId);

            _.pull(jobIdListsOrg1, testData.jobId);
            testData.jobId = null;
          });
        });
      });

      afterAll(async () => {
        // delete scheduled job
        if (testData.scheduledJobId) {
          await safe(
            `delete scheduled job ${testData.scheduledJobId}`,
            async () =>
              jobHelper.helpDeleteScheduledJob(
                { gqlClient, options: adminOptions },
                { scheduledJobId: testData.scheduledJobId }
              )
          );
        }

        // delete schema
        if (testData.schemaId) {
          await safe(`delete schema ${testData.schemaId}`, async () =>
            schemaHelper.helpDeleteSchema(
              { gqlClient, options: adminOptions },
              { schemaId: testData.schemaId }
            )
          );
        }

        // cancel all created jobs
        if (jobIdListsOrg1.length > 0) {
          for (let jobId of jobIdListsOrg1) {
            await safe(`cancel job ${jobId}`, async () =>
              jobHelper.helpCancelJob(
                { gqlClient, options: adminOptions },
                { jobId: jobId }
              )
            );
          }
        }

        // delete all created engines
        if (engineIdsOrg1.length > 0) {
          for (let engineId of engineIdsOrg1) {
            await safe(`delete engine ${engineId}`, async () =>
              engineHelper.helpDeleteEngine(
                { gqlClient, options: adminOptions },
                { id: engineId }
              )
            );
          }
        }

        // delete helpDeleteCluster
        if (testCluster?.id) {
          await safe(`delete cluster ${testCluster.id}`, async () =>
            engineHelper.helpDeleteCluster(
              { gqlClient, options: adminOptions },
              { id: testCluster.id }
            )
          );
        }

        // delete tdo
        if (testTdo) {
          await safe(`delete tdo ${testTdo.id}`, async () =>
            tdoHelper.helpDeleteTDO(
              { gqlClient, options: adminOptions },
              { id: testTdo.id }
            )
          );
        }

        const listOptions = testSetup?.listOptions ?? [];

        if (!_.isEmpty(listOptions)) {
          const listUserIds = listOptions.map((user) => user.userId);
          await safe(`delete users ${listUserIds.join(', ')}`, async () =>
            userHelper.deleteMultiUser({ gqlClient }, listUserIds)
          );
        }

        if (testOrg?.id) {
          await safe(`delete organization ${testOrg.id}`, async () =>
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
      name: `${citestMarker}-org-folder-rbac-${version}-${uuid.v4()}`,
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
        name: `${citestMarker}-admin-user-${version}-${uuid.v4()}@localhost`,
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'regularUser',
        name: `${citestMarker}-regular-user-${version}-${uuid.v4()}@localhost`,
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
  for (let action of buildEngineActionListToUse) {
    const test = await engineHelper.helpUpdateEngineBuild(
      { gqlClient, options: options },
      {
        id: engineBuildId,
        engineId: engineId,
        action: action[0]
      }
    );
  }
}
