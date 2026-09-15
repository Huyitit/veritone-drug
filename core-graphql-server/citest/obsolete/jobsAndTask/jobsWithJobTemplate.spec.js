const helpers = require('../../helpers/index');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const tdoHelper = require('../../helpers/tdo');
const folderHelper = require('../../helpers/folder');
const jobHelper = require('../../helpers/job');
const engineHelper = require('../../helpers/engine');
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

describe('citest_jobs: Job Test With job template, engine build, ioFolder', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    superOptions = helpers.requestOptions(superToken);
    // T70: Redis write for the session token may lag the HTTP response by several seconds
    // under CI load. Poll until the token is confirmed active before running tests.
    // Bumped 30→60→120 (T70 extended): 60 retries exhausted (60.764s) on run 28387718567.
    // Bumped 120→240 (T70 extended): 120 retries exhausted (121.789s) on run 28398144418.
    let myInfo;
    for (let i = 0; i < 240; i++) {
      try {
        const res = await userHelper.getMyInfo({
          gqlClient,
          options: superOptions
        });
        if (_.get(res, 'me')) {
          myInfo = res;
          break;
        }
      } catch (e) {
        if (i === 239) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    result = myInfo;
    expect(result.me).toBeDefined();
    superOrgGuid = _.get(result, 'me.organization.guid');
    superOrgId = _.get(result, 'me.organization.id');
    superUserId = _.get(result, 'me.id');
  });

  describe.each([false, true])('jobs ', (isEnabledOlp) => {
    let testSetup, testSetup2;
    let testOrg,
      testOrg2,
      adminUser,
      adminUser2,
      regularUser,
      testUsers,
      testUsers2;
    let adminOptions, adminOptions2, regularOptions;
    let createOrgAndUserInput, createSecondOrgAndUserInput;
    let testTdo;
    let testEngine, engineBuildId, jobTemplateId;
    let testEngine2, engineBuildId2;
    let testEngineOrg2, jobTemplateId2;
    const jobIdListsOrg1 = [];
    const engineIdsOrg1 = [];
    const engineIdsOrg2 = [];

    const testData = {
      jobFromTemplateId: null,
      rootFolderData: null,
      folder: null,
      rootFolderData2: null,
      folder2: null,
      jobWithIoFolder: null,
      jobWithBuild: null
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

        // Login for Regular user
        regularUser = _.find(testSetup.listOptions, (user) => {
          return user.key === 'regularUser';
        });
        regularOptions = regularUser.requestOptions;

        createSecondOrgAndUserInput = getOrgAndUserInput(isEnabledOlp);

        // set up org 2
        testSetup2 = await orgHelper.setupTestOrgAndUser(
          { gqlClient, superAdminToken: superToken },
          createSecondOrgAndUserInput
        );

        testOrg2 = testSetup2.org;
        expect(testOrg2).toBeDefined();
        expect(testOrg2.name).toContain(`${citestMarker}-org`);
        expect(testOrg2.users).toBeDefined();
        testUsers2 = _.get(testOrg2, 'users.records');

        // Login for Admin user org 2
        adminUser2 = _.find(testSetup2.listOptions, (user) => {
          return user.key === 'adminUser';
        });
        adminOptions2 = adminUser2.requestOptions;
      });

      describe('create job with engine build', () => {
        beforeAll(async () => {
          // Create another engine for org 1
          const engineCreate = await engineHelper.helpCreateEngine(
            { gqlClient, options: adminOptions },
            {
              name: citestMarker + '-engine-' + uuid.v4(),
              categoryId: engineCategoryId,
              deploymentModel: 'FullyNetworkIsolated'
            }
          );
          testEngine2 = engineCreate.createEngine;
          engineIdsOrg1.push(testEngine2.id);

          const build = await buildAndDeployEngine(
            testEngine2.id,
            adminOptions
          );
          engineBuildId2 = _.get(build, 'updateEngineBuild.id');
        });

        it('Create engine build', async () => {
          const engineBuildRes = await engineHelper.helpCreateEngineBuild(
            { gqlClient, options: adminOptions },
            {
              engineId: testEngine.id,
              taskRuntime: { nodeRed: true },
              manifest: { runtime: 'NodeRed' }
            }
          );
          engineBuildId = _.get(engineBuildRes, 'createEngineBuild.id');
        });

        it('Admin Create Job using not existed engine build should fail', async () => {
          const job = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [{ buildId: uuid.v4(), engineId: testEngine.id }]
            }
          );

          await expect(job).rejects.toThrow(/not_found/);
        });

        it('Admin create Job using not active engineId should fail', async () => {
          const job = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [{ buildId: engineBuildId, engineId: testEngine.id }]
            }
          );

          await expect(job).rejects.toThrow(/must be in .*deployed/);
        });

        it('Admin create Job using not active deployed engine build should fail', async () => {
          // submit engine build
          const submitEngineBuild = await engineHelper.helpUpdateEngineBuild(
            { gqlClient, options: adminOptions },
            {
              id: engineBuildId,
              engineId: testEngine.id,
              action: 'submit'
            }
          );
          expect(submitEngineBuild).toBeDefined();

          const job = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [{ buildId: engineBuildId, engineId: testEngine.id }]
            }
          );

          await expect(job).rejects.toThrow(/must be in .*deployed/);
        });

        xit('Admin create Job using not match engineId and buildId should fail', async () => {
          const job = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [{ buildId: engineBuildId2, engineId: testEngine.id }]
            }
          );

          await expect(job).rejects.toThrow();
        });

        it('Admin create Job using match active engineId and buildId should success', async () => {
          const job = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [{ buildId: engineBuildId2, engineId: testEngine2.id }]
            }
          );

          expect(job).toBeDefined();
          expect(job.id).toBeDefined();
          testData.jobWithBuild = job;
          jobIdListsOrg1.push(job.id);
        });

        it('User cannot create Job', async () => {
          const job = jobHelper.helpCreateJob(
            { gqlClient, options: regularOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [{ buildId: engineBuildId2, engineId: testEngine2.id }]
            }
          );

          await expect(job).rejects.toThrow(/not_allowed/);
        });

        it('Get job success', async () => {
          const jobData = await jobHelper.helpGetJobById(
            { gqlClient, options: adminOptions },
            { jobId: testData.jobWithBuild.id }
          );
          expect(jobData).toBeDefined();
          expect(jobData.id).toEqual(testData.jobWithBuild.id);
        });
      });

      describe('create job with ioFolder', () => {
        beforeAll(async () => {
          await buildAndDeployEngine(testEngine.id, adminOptions);
        });

        it('Admin create folder', async () => {
          const rootFolder = await folderHelper.helpCreateRootFolder(
            { gqlClient, options: adminOptions },
            { rootFolderType: 'cms' }
          );
          expect(rootFolder).toBeDefined();
          testData.rootFolderData = _.get(rootFolder, '[0]');

          const newFolderData = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-folder-${uuid.v4()}`,
              description: '',
              parentId: testData.rootFolderData.id
            }
          );
          expect(newFolderData).toBeDefined();
          testData.folder = newFolderData;

          const rootFolderOrg2 = await folderHelper.helpCreateRootFolder(
            { gqlClient, options: adminOptions2 },
            { rootFolderType: 'cms' }
          );
          expect(rootFolderOrg2).toBeDefined();
          testData.rootFolderData2 = _.get(rootFolderOrg2, '[0]');

          const newFolderData2 = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions2 },
            {
              name: `${citestMarker}-folder-${uuid.v4()}`,
              description: '',
              parentId: testData.rootFolderData2.id
            }
          );
          expect(newFolderData2).toBeDefined();
          testData.folder2 = newFolderData2;
        });

        xit('Admin create Job using not existed folderId should fail', async () => {
          const job = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [
                {
                  engineId: testEngine.id,
                  ioFolders: [
                    {
                      referenceId: uuid.v4(),
                      mode: 'chunk',
                      type: 'input'
                    }
                  ]
                }
              ]
            }
          );

          await expect(job).rejects.toThrow(/aaaa/);
        });

        xit('Admin create Job using not shared folderId should fail', async () => {
          const job = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [
                {
                  engineId: testEngine.id,
                  ioFolders: [
                    {
                      referenceId: testData.folder2.id,
                      mode: 'chunk',
                      type: 'input'
                    }
                  ]
                }
              ]
            }
          );

          await expect(job).rejects.toThrow(/not_found/);
        });

        it('Shared folder setup for org', async () => {
          const sharedFolderSetup = await folderHelper.helpShareFolder(
            { gqlClient },
            {
              folderId: testData.folder2.id,
              readOrganizationIds: [+testOrg.id]
            }
          );

          expect(sharedFolderSetup).toBeDefined();
        });

        it('Admin create Job using shared folder should success', async () => {
          const job = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [
                {
                  engineId: testEngine.id,
                  ioFolders: [
                    {
                      referenceId: testData.folder2.id,
                      mode: 'chunk',
                      type: 'input'
                    }
                  ]
                }
              ]
            }
          );

          expect(job).toBeDefined();
          expect(job.id).toBeDefined();
          jobIdListsOrg1.push(job.id);
        });

        it('Admin create Job using org own folder should success', async () => {
          const jobCreate = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [
                {
                  engineId: testEngine.id,
                  ioFolders: [
                    {
                      referenceId: testData.folder.id,
                      mode: 'chunk',
                      type: 'input'
                    }
                  ]
                }
              ]
            }
          );
          expect(jobCreate).toBeDefined();
          expect(jobCreate.id).toBeDefined();
          testData.jobWithIoFolder = jobCreate;
          jobIdListsOrg1.push(jobCreate.id);
        });

        it('User is not allow to create job', async () => {
          const jobCreate = jobHelper.helpCreateJob(
            { gqlClient, options: regularOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [
                {
                  engineId: testEngine.id,
                  ioFolders: [
                    {
                      referenceId: testData.folder.id,
                      mode: 'chunk',
                      type: 'input'
                    }
                  ]
                }
              ]
            }
          );
          await expect(jobCreate).rejects.toThrow(/not_allowed/);
        });

        it('Get job success', async () => {
          const jobData = await jobHelper.helpGetJobById(
            { gqlClient, options: adminOptions },
            { jobId: testData.jobWithIoFolder.id }
          );
          expect(jobData).toBeDefined();
          expect(jobData.id).toEqual(testData.jobWithIoFolder.id);
        });
      });

      describe('create job with job template', () => {
        beforeAll(async () => {
          // Create engine for org 2
          const engineCreate = await engineHelper.helpCreateEngine(
            { gqlClient, options: adminOptions2 },
            {
              name: citestMarker + '-engine-' + uuid.v4(),
              categoryId: engineCategoryId,
              deploymentModel: 'FullyNetworkIsolated'
            }
          );
          testEngineOrg2 = engineCreate.createEngine;
          engineIdsOrg2.push(testEngineOrg2.id);

          await buildAndDeployEngine(testEngineOrg2.id, adminOptions2);
        });

        it('Create job template', async () => {
          // org1
          const newJobTemplate = await jobHelper.helpCreateJobTemplate(
            { gqlClient, options: adminOptions },
            { taskTemplates: [{ engineId: testEngine.id }] }
          );

          expect(newJobTemplate).toBeDefined();
          jobTemplateId = _.get(newJobTemplate, 'id');
          expect(jobTemplateId).toBeDefined();

          // org2
          const newJobTemplate2 = await jobHelper.helpCreateJobTemplate(
            { gqlClient, options: adminOptions2 },
            { taskTemplates: [{ engineId: testEngineOrg2.id }] }
          );

          expect(newJobTemplate2).toBeDefined();
          jobTemplateId2 = _.get(newJobTemplate2, 'id');
          expect(jobTemplateId2).toBeDefined();
        });

        it('create Job using not existed Job template should fail', async () => {
          const jobFromTemplate = await jobHelper.helpLaunchJobTemplates(
            { gqlClient, options: adminOptions },
            {
              ids: [uuid.v4()],
              targetInfo: { targetId: testTdo.id }
            }
          );

          expect(jobFromTemplate.length).toBe(0);
        });

        it('cannot access jobTemplate from other org', async () => {
          const jobTemplate = jobHelper.helpGetJobTemplateById(
            { gqlClient, options: adminOptions },
            { jobTemplateId: jobTemplateId2 }
          );
          await expect(jobTemplate).rejects.toThrow(/not_found/);
        });

        xit('create Job using invalid Job template (not have access) should fail', async () => {
          const jobFromTemplate = await jobHelper.helpLaunchJobTemplates(
            { gqlClient, options: adminOptions },
            {
              ids: [jobTemplateId2],
              targetInfo: { targetId: testTdo.id }
            }
          );

          expect(jobFromTemplate.length).toBe(0);
        });

        it('create Job using valid Job template should success', async () => {
          const jobCreate = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              tasks: [{ engineId: testEngine.id }],
              jobTemplateId: jobTemplateId
            }
          );
          expect(jobCreate).toBeDefined();
          expect(jobCreate.id).toBeDefined();
          jobIdListsOrg1.push(jobCreate.id);
        });

        it('create Job from template should success', async () => {
          const jobFromTemplate = await jobHelper.helpLaunchJobTemplates(
            { gqlClient, options: adminOptions },
            {
              ids: [jobTemplateId],
              targetInfo: { targetId: testTdo.id }
            }
          );
          expect(jobFromTemplate.length).toBeGreaterThan(0);
          const jobId = _.get(jobFromTemplate[0], 'id');
          jobIdListsOrg1.push(jobId);
          testData.jobFromTemplateId = jobId;
        });

        it('Get job success', async () => {
          const jobData = await jobHelper.helpGetJobById(
            { gqlClient, options: adminOptions },
            { jobId: testData.jobFromTemplateId }
          );
          expect(jobData).toBeDefined();
          expect(jobData.id).toEqual(testData.jobFromTemplateId);
          expect(jobData.templateId).toEqual(jobTemplateId);
        });
      });

      describe('update job', () => {
        it('update Job status', async () => {
          const updateJobStatus = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            { ids: [testData.jobFromTemplateId], status: 'queued' }
          );

          expect(updateJobStatus).toBeDefined();
          expect(updateJobStatus.length).toBe(1);
          expect(updateJobStatus[0].id).toBe(testData.jobFromTemplateId);
          const jobStatus = updateJobStatus[0].status;
          expect(['queued', 'running']).toContain(jobStatus);
        });

        it('update Job taskOutput', async () => {
          const updateTaskOutput = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            {
              ids: [testData.jobWithIoFolder.id],
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
          expect(updateTaskOutput[0].id).toBe(testData.jobWithIoFolder.id);
          expect(['queued', 'running']).toContain(jobStatus);
        });

        it('update Job notification Uri', async () => {
          const notificationUri = 'http://localhost:3000/notify-job';
          const updateJobNotification = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            {
              ids: [testData.jobWithBuild.id],
              status: 'queued',
              notificationUris: [notificationUri]
            }
          );

          expect(updateJobNotification).toBeDefined();
          expect(updateJobNotification.length).toBe(1);
          expect(updateJobNotification[0].id).toBe(testData.jobWithBuild.id);
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
              ids: [testData.jobFromTemplateId],
              status: 'queued',
              requiredCurrentStatus: 'failed'
            }
          );

          expect(updateJob.length).toBe(0);
        });

        it('cancel job', async () => {
          const cancelledJob = await jobHelper.helpCancelJob(
            { gqlClient, options: adminOptions },
            { jobId: testData.jobFromTemplateId }
          );
          expect(cancelledJob).toBeDefined();
          expect(cancelledJob.id).toEqual(testData.jobFromTemplateId);
        });

        it('retry job', async () => {
          const retriedJob = await jobHelper.helpRetryJob(
            { gqlClient, options: adminOptions },
            { jobId: testData.jobFromTemplateId }
          );
          expect(retriedJob).toBeDefined();
          expect(retriedJob.status).toEqual('pending');
        });

        it('cancel all jobs', async () => {
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
        });
      });

      afterAll(async () => {
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

        if (engineIdsOrg2.length > 0) {
          for (let engineId of engineIdsOrg2) {
            await safe(`delete engine ${engineId}`, async () =>
              engineHelper.helpDeleteEngine(
                { gqlClient, options: adminOptions2 },
                { id: engineId }
              )
            );
          }
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

        // delete users and orgs
        const listOptions = [
          ...(testSetup?.listOptions ?? []),
          ...(testSetup2?.listOptions ?? [])
        ];

        if (!_.isEmpty(listOptions)) {
          const listUserIds = listOptions.map((user) => user.userId);

          await safe(`delete users ${listUserIds.join(', ')}`, async () =>
            userHelper.deleteMultiUser({ gqlClient }, listUserIds)
          );
        }

        if (testOrg?.id) {
          await safe(`delete org ${testOrg.id}`, async () =>
            orgHelper.deleteOrganization(
              { gqlClient, options: superOptions },
              testOrg.id
            )
          );
        }

        if (testOrg2?.id) {
          await safe(`delete org ${testOrg2.id}`, async () =>
            orgHelper.deleteOrganization(
              { gqlClient, options: superOptions },
              testOrg2.id
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

  return build;
}
