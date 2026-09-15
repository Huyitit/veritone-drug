const helpers = require('../../helpers/index');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const tdoHelper = require('../../helpers/tdo');
const jobHelper = require('../../helpers/job');
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

describe('citest_jobs: Job Test With auto created TDO', () => {
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
    let adminOptions, regularOptions;

    let createOrgAndUserInput;
    let testTdo, autoCreatedTdo;
    let testEngine, engineBuildId;

    const jobIdListsOrg1 = [];
    const engineIdsOrg1 = [];

    const testData = {
      jobId: null
    };
    const tdoName = `${citestMarker}-tdo-${uuid.v4()}`;

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
        await buildAndDeployEngine(testEngine.id, adminOptions);

        // Login for Regular user
        regularUser = _.find(testSetup.listOptions, (user) => {
          return user.key === 'regularUser';
        });
        regularOptions = regularUser.requestOptions;
      });

      it('Create Job with invalid TDO input should fail', async () => {
        const newJob = jobHelper.helpCreateJob(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-job-${uuid.v4()}`,
            tasks: [{ engineId: testEngine.id }],
            target: { name: tdoName, isPublic: 'yes' }
          }
        );

        await expect(newJob).rejects.toThrow(/invalid value/);
      });

      it('No Job and TDO created (from previous step)', async () => {
        const tdoSearch = await tdoHelper.helpGetTDOs(
          { gqlClient, options: adminOptions },
          {
            orderBy: 'createdDateTime',
            orderDirection: 'desc',
            includePublic: false
          }
        );

        const tdos = _.get(tdoSearch, 'records', []);
        const createdTdo = tdos.find((tdo) => tdo.name === tdoName);

        expect(createdTdo).toBeUndefined();
      });

      it('Create Job with valid TDO input should success', async () => {
        const newJob = await jobHelper.helpCreateJob(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-job-${uuid.v4()}`,
            tasks: [{ engineId: testEngine.id }],
            target: { name: tdoName }
          }
        );

        expect(newJob).toBeDefined();
        expect(newJob.id).toBeDefined();
        expect(newJob.name).toContain(`${citestMarker}-job-`);
        testData.jobId = newJob.id;
        jobIdListsOrg1.push(newJob.id);
      });

      it('Job target must be an auto created TDO', async () => {
        const tdoSearch = await tdoHelper.helpGetTDOs(
          { gqlClient, options: adminOptions },
          {
            orderBy: 'createdDateTime',
            orderDirection: 'desc',
            includePublic: false
          }
        );

        const tdos = _.get(tdoSearch, 'records', []);
        autoCreatedTdo = tdos.find((tdo) => tdo.name === tdoName);
        expect(autoCreatedTdo).toBeDefined();

        await safe(`cancel job ${testData.jobId}`, async () =>
          jobHelper.helpCancelJob(
            { gqlClient, options: adminOptions },
            { jobId: testData.jobId }
          )
        );

        testData.jobId = null;
      });

      describe('Update and manage job', () => {
        beforeEach(async () => {
          const job = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              tasks: [{ engineId: testEngine.id }],
              target: { name: tdoName }
            }
          );

          expect(job).toBeDefined();
          expect(job.name).toContain(`${citestMarker}-job-`);
          expect(job.tasks.records.length).toBe(1);
          jobIdListsOrg1.push(job.id);
          testData.jobId = job.id;
        });

        afterEach(async () => {
          // cancel created jobs
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

        it('update Jobs status', async () => {
          const updateJob = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            { ids: [testData.jobId], status: 'queued' }
          );

          expect(updateJob).toBeDefined();
          expect(updateJob.length).toBe(1);
          expect(updateJob[0].id).toBe(testData.jobId);
          expect(updateJob[0].status).toMatch(/queued|running/);
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

        it('cancel job', async () => {
          const cancelledJob = await jobHelper.helpCancelJob(
            { gqlClient, options: adminOptions },
            { jobId: testData.jobId }
          );
          expect(cancelledJob).toBeDefined();
          expect(cancelledJob.id).toEqual(testData.jobId);
          _.pull(jobIdListsOrg1, testData.jobId);
          testData.jobId = null;
        });

        it('retry job', async () => {
          const retriedJob = await jobHelper.helpRetryJob(
            { gqlClient, options: adminOptions },
            { jobId: testData.jobId }
          );
          expect(retriedJob).toBeDefined();
          expect(retriedJob.status).toEqual('pending');
        });
      });

      afterAll(async () => {
        // delete all created jobs
        if (jobIdListsOrg1.length > 0) {
          for (let jobId of jobIdListsOrg1) {
            await safe(`update job to queued`, () =>
              jobHelper.helpUpdateJobs(
                { gqlClient, options: adminOptions },
                { ids: [jobId], status: 'queued' }
              )
            );

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

        // delete tdo
        if (testTdo) {
          await safe(`delete testTdo ${testTdo.id}`, async () =>
            tdoHelper.helpDeleteTDO(
              { gqlClient, options: adminOptions },
              { id: testTdo.id }
            )
          );
        }
        if (autoCreatedTdo) {
          await safe(`delete autoCreatedTdo ${autoCreatedTdo.id}`, async () =>
            tdoHelper.helpDeleteTDO(
              { gqlClient, options: adminOptions },
              { id: autoCreatedTdo.id }
            )
          );
        }

        // delete users and orgs
        const listOptions = testSetup?.listOptions ?? [];
        if (!_.isEmpty(listOptions)) {
          const listUserIds = listOptions.map((user) => user.userId);
          await safe(`delete users`, async () =>
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
