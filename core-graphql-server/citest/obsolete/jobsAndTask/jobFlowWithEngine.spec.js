const helpers = require('../../helpers/index');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const tdoHelper = require('../../helpers/tdo');
const rbacHelper = require('../../helpers/rbacHelper');
const jobHelper = require('../../helpers/job');
const engineHelper = require('../../helpers/engine');
const GraphqlClient = require('../../helpers/gql.js');
const mockUtil = require('../../../test/mockUtil')();
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const { safe } = require('../../helpers/cleanup/utils');
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const testTemplateTextUploadChunk = mockUtil.getMockEngineTemplate(
  'citest-upload',
  'upload'
);
const testTemplateTextReprocessChunk = mockUtil.getMockEngineTemplate(
  'citest-upload',
  'reproc'
);
let gqlClient;
let testSetup, testSetup2;
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

let failedJobId, completeJobId, cancelledJobId;
let createOrgAndUserInput, createSecondOrgAndUserInput;
let testJobId, userCreatedJobId;

describe('citest_jobs: Job Test Flow', () => {
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
    const rbac = { authGroupId: null, authPermissionSetId: null };
    const jobIdListsOrg1 = [];
    const jobIdListsRegularOrg1 = [];

    const engineIdsOrg1 = [];
    const engineIdsOrg2 = [];
    let testOrg, testOrg2, adminUser, adminUser2, regularUser, testUsers;
    let adminOptions, adminOptions2, regularOptions;
    let testTdo, testTdoOrg2, publicTdo, nonExistentTdoId;
    let testEngine,
      engineOrg2,
      publicEngineOrg2,
      inactiveEngineId,
      uploadEngineData;
    let testCluster, testClusterOrg2;
    describe(`jobs test with isEnabledOlp = ${isEnabledOlp}`, () => {
      beforeAll(async () => {
        createOrgAndUserInput = getOrgAndUserInput(isEnabledOlp);
        createSecondOrgAndUserInput = getOrg2AndUserInput(isEnabledOlp);

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

        // Login for Regular user
        regularUser = _.find(testSetup.listOptions, (user) => {
          return user.key === 'regularUser';
        });
        regularOptions = regularUser.requestOptions;

        // set up org 2
        testSetup2 = await orgHelper.setupTestOrgAndUser(
          { gqlClient, superAdminToken: superToken },
          createSecondOrgAndUserInput
        );

        testOrg2 = testSetup2.org;
        expect(testOrg2).toBeDefined();
        expect(testOrg2.name).toContain(`${citestMarker}-org`);
        expect(testOrg2.users).toBeDefined();

        testUsers = _.get(testOrg2, 'users.records');
        // Login for Admin user
        adminUser2 = _.find(testSetup2.listOptions, (user) => {
          return user.key === 'adminUser';
        });
        adminOptions2 = adminUser2.requestOptions;
      });

      describe('Job Tests Implementation', () => {
        beforeAll(async () => {
          // Create test TDO for org 1
          testTdo = await tdoHelper.helpCreateTDOWithAsset(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-test-tdo-${uuid.v4()}`,
              ...tdoAssetInput
            }
          );
          // Create TDO for org 2 (for cross-org testing)
          testTdoOrg2 = await tdoHelper.helpCreateTDOWithAsset(
            { gqlClient, options: adminOptions2 },
            {
              name: `${citestMarker}-test-tdo-org2-${uuid.v4()}`,
              ...tdoAssetInput
            }
          );

          // Create public TDO
          publicTdo = await tdoHelper.helpCreateTDOWithAsset(
            { gqlClient, options: superOptions },
            {
              name: `${citestMarker}-public-tdo-${uuid.v4()}`,
              isPublic: true,
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

          // Create engine for org 2
          const engineCreateOrg2 = await engineHelper.helpCreateEngine(
            { gqlClient, options: adminOptions2 },
            {
              name: citestMarker + '-engine-org2-' + uuid.v4(),
              categoryId: engineCategoryId,
              deploymentModel: 'FullyNetworkIsolated'
            }
          );
          engineOrg2 = engineCreateOrg2.createEngine;
          engineIdsOrg2.push(engineOrg2.id);
          await buildAndDeployEngine(engineOrg2.id, adminOptions2);

          // Create public engine for org 2
          const publicEngineCreateOrg2 = await engineHelper.helpCreateEngine(
            { gqlClient, options: adminOptions2 },
            {
              name: citestMarker + '-public-engine-org2-' + uuid.v4(),
              categoryId: engineCategoryId,
              deploymentModel: 'FullyNetworkIsolated',
              isPublic: true
            }
          );
          publicEngineOrg2 = publicEngineCreateOrg2.createEngine;
          engineIdsOrg2.push(publicEngineOrg2.id);
          await buildAndDeployEngine(publicEngineOrg2.id, adminOptions2, true);

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

          // Create test Cluster for org 2
          const clustersOrg2 = await engineHelper.helpCreateCluster(
            { gqlClient, options: adminOptions2 },
            {
              name: `${citestMarker}-test-cluster-${uuid.v4()}`,
              dockerCredentials: {},
              allowedEngines: [],
              status: 'active'
            }
          );
          testClusterOrg2 = clustersOrg2.createCluster;
        });

        it('Admin create job without task should fail', async () => {
          const result = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-org-tdo-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster?.id
            }
          );

          await expect(result).rejects.toThrow(
            /must have at least one task definition/
          );
        });

        it('Admin create job without TDO should fail', async () => {
          const result = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-no-tdo-${uuid.v4()}`,
              clusterId: testCluster?.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          await expect(result).rejects.toThrow(/Missing recordingId!/);
        });

        it('Admin Create Job using not existed TDO should fail', async () => {
          const result = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-nonexistent-tdo-${uuid.v4()}`,
              targetId: testTdo?.id + 9999999,
              clusterId: testCluster?.id,
              tasks: [{ engineId: engineOrg2.id }]
            }
          );

          await expect(result).rejects.toThrow(/not found/);
        });

        it('Admin Create Job using TDO of other org should fail', async () => {
          const result = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-other-org-tdo-${uuid.v4()}`,
              targetId: testTdoOrg2.id,
              clusterId: testCluster?.id,
              tasks: [
                {
                  engineId: testEngine.id
                }
              ]
            }
          );

          await expect(result).rejects.toThrow(
            /object does not exist or access not granted/
          );
        });

        it('Admin Create Job using org owned TDO should success', async () => {
          const result = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-org-tdo-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          expect(result).toBeDefined();
          expect(result.id).toBeDefined();
          expect(result.status).toBe('pending');
          testJobId = result.id;
          jobIdListsOrg1.push(testJobId);
        });

        it('Admin Create Job using public TDO should success', async () => {
          const result = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-public-tdo-${uuid.v4()}`,
              targetId: publicTdo.id,
              clusterId: testCluster?.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          expect(result).toBeDefined();
          expect(result.id).toBeDefined();
          expect(result.status).toBe('pending');

          jobIdListsOrg1.push(result.id);
        });

        it('Regular user Create Job should fail without permissions', async () => {
          const result = jobHelper.helpCreateJob(
            { gqlClient, options: regularOptions },
            {
              name: `${citestMarker}-job-public-tdo-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );
          await expect(result).rejects.toThrow(/not_allowed/);
        });

        it('add user permission AIWARE_JOB_CREATE', async () => {
          if (!isEnabledOlp) return;

          const newAuthGroup = await rbacHelper.helpCreateAuthGroup(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-group-${uuid.v4()}`,
              description: 'citest job create group',
              members: [{ id: regularUser.userId, memberType: 'User' }],
              ownerOrganization: testOrg.guid
            }
          );
          expect(newAuthGroup).toBeDefined();
          rbac.authGroupId = _.get(newAuthGroup, 'id');

          const permissionSetResult =
            await rbacHelper.helpCreateAuthPermissionSet(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-job-permission-${uuid.v4()}`,
                description: 'citest job create permission',
                organizationID: testOrg.id,
                permissions: [
                  'AIWARE_JOB_CREATE',
                  'AIWARE_JOB_DELETE',
                  'AIWARE_JOB_READ',
                  'AIWARE_JOB_UPDATE'
                ]
              }
            );
          const authPermissionSetData = _.get(
            permissionSetResult,
            'authPermissionSetCreate'
          );
          expect(authPermissionSetData).toBeDefined();
          rbac.authPermissionSetId = _.get(authPermissionSetData, 'id');

          await rbacHelper.helpAddACEsToResources(
            { gqlClient, options: adminOptions },
            {
              resourceType: 'Organization',
              ownerOrganization: testOrg.guid,
              ids: [testOrg.id],
              entries: [
                {
                  member: { id: rbac.authGroupId, memberType: 'Group' },
                  permissionSetID: rbac.authPermissionSetId
                }
              ]
            }
          );

          // relogin user
          const impersonated = await userHelper.impersonateUser(
            { superAdminToken: superToken },
            { id: regularUser.userId, organizationGuid: testOrg.guid }
          );
          regularOptions = impersonated.requestOptions;
        });

        xit('Regular user Create Job using org owned TDO should success with permissions', async () => {
          if (!isEnabledOlp) return;

          const result = await jobHelper.helpCreateJob(
            { gqlClient, options: regularOptions },
            {
              name: `${citestMarker}-job-public-tdo-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          expect(result).toBeDefined();
          expect(result.id).toBeDefined();
          expect(result.status).toBe('pending');

          userCreatedJobId = result.id;
          jobIdListsRegularOrg1.push(userCreatedJobId);
        });

        it('Admin Create Job using not active engine should fail', async () => {
          // Create an inactive engine
          const inactiveEngineCreate = await engineHelper.helpCreateEngine(
            { gqlClient, options: adminOptions },
            {
              name: citestMarker + '-inactive-engine-' + uuid.v4(),
              categoryId: engineCategoryId,
              deploymentModel: 'FullyNetworkIsolated'
            }
          );
          inactiveEngineId = inactiveEngineCreate.createEngine.id;
          engineIdsOrg1.push(inactiveEngineId);

          const result = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-inactive-engine-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: inactiveEngineId }]
            }
          );

          await expect(result).rejects.toThrow(
            /"could not find active deployed build for engine/
          );
        });

        it('Admin Create Job using not exist engine should fail', async () => {
          const result = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-nonexistent-engine-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster?.id,
              tasks: [{ engineId: uuid.v4() }]
            }
          );

          await expect(result).rejects.toThrow(/No access to engine/);
        });

        xit('Admin Create Job using engine of other org should fail', async () => {
          const result = jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-other-org-engine-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster?.id,
              tasks: [{ engineId: engineOrg2.id }]
            }
          );
          await expect(result).rejects.toThrow(/No access to engine/);
        });

        it('Admin Create Job using org own engine should success', async () => {
          const result = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-org-engine-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          expect(result).toBeDefined();
          expect(result.id).toBeDefined();
          expect(result.status).toBe('pending');

          jobIdListsOrg1.push(result.id);
        });

        xit('User Create Job using org owned engine should success', async () => {
          const result = await jobHelper.helpCreateJob(
            { gqlClient, options: regularOptions },
            {
              name: `${citestMarker}-job-org-engine-user-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          expect(result).toBeDefined();
          expect(result.id).toBeDefined();
          expect(result.status).toBe('pending');
          userCreatedJobId = result.id;
          jobIdListsRegularOrg1.push(userCreatedJobId);
        });

        it('Create Job using public engine should success', async () => {
          const result = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-org-engine-user-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: publicEngineOrg2.id }]
            }
          );
          expect(result).toBeDefined();
          expect(result.id).toBeDefined();
          expect(result.status).toBe('pending');
          jobIdListsOrg1.push(result.id);
        });

        it('pending job can update to queued', async () => {
          // First create a job in pending status
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-status-pending-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [
                {
                  engineId: testEngine.id
                }
              ]
            }
          );

          expect(createResult.status).toBe('pending');
          jobIdListsOrg1.push(createResult.id);

          // update pending to queued (should work)
          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            {
              ids: [createResult.id],
              status: 'queued'
            }
          );

          expect(['queued', 'running'].includes(updateResult[0].status)).toBe(
            true
          );
        });

        it('pending job can update to failed', async () => {
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-status-pending-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          expect(createResult.status).toBe('pending');
          jobIdListsOrg1.push(createResult.id);

          // update pending to failed (should fail)
          const failResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            {
              ids: [createResult.id],
              status: 'failed'
            }
          );

          failedJobId = createResult.id;
          expect(failResult).toBeDefined();
          expect(failResult[0].status).toBe('failed');
        });

        it('pending job update to aborted', async () => {
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-status-pending-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          expect(createResult.status).toBe('pending');
          jobIdListsOrg1.push(createResult.id);

          // update pending to aborted (should work)
          const abortResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            {
              ids: [createResult.id],
              status: 'aborted'
            }
          );

          expect(abortResult).toBeDefined();
          expect(['aborted', 'failed'].includes(abortResult[0].status)).toBe(
            true
          );
        });

        it('failed job can not update to queued', async () => {
          const failResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: superOptions },
            { ids: [failedJobId], status: 'queued' }
          );

          expect(failResult.length).toBe(0);
        });

        it('failed job can only update to aborted', async () => {
          const failResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: superOptions },
            { ids: [failedJobId], status: 'aborted' }
          );

          expect(failResult).toBeDefined();
          expect(failResult[0].status).toBe('failed');
        });

        it('queued job update to failed', async () => {
          const queuedJobId = await createQueuedJob(gqlClient, adminOptions);
          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            { ids: [queuedJobId], status: 'failed' }
          );
          expect(['failed'].includes(updateResult[0].status)).toBe(true);
        });

        it('queued job update to aborted', async () => {
          const queuedJobId = await createQueuedJob(gqlClient, adminOptions);
          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            { ids: [queuedJobId], status: 'aborted' }
          );
          expect(['failed'].includes(updateResult[0].status)).toBe(true);
        });

        it('completed job cannot update to failed', async () => {
          const getJob = await jobHelper.helpGetJobs(
            { gqlClient, options: superOptions },
            { limit: 1, status: 'complete' }
          );

          const jobs = _.get(getJob, 'records', []);
          if (jobs.length === 0) {
            console.log('No completed job found for testing');
            return;
          }
          completeJobId = _.get(jobs, '[0].id');

          try {
            const updateResult = await jobHelper.helpUpdateJobs(
              { gqlClient, options: superOptions },
              { ids: [completeJobId], status: 'failed' }
            );
            expect(updateResult.length).toBe(1);
          } catch (error) {
            expect(error.message).toContain(
              'disallow update v1/v2 job status to failed'
            );
          }
        });

        it('completed job cannot update to queued', async () => {
          if (!completeJobId) {
            console.log('No completed job found for testing');
            return;
          }

          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: superOptions },
            { ids: [completeJobId], status: 'queued' }
          );
          expect(updateResult.length).toBe(0);
        });

        it('completed job cannot update to aborted', async () => {
          if (!completeJobId) {
            console.log('No completed job found for testing');
            return;
          }

          try {
            const updateResult = await jobHelper.helpUpdateJobs(
              { gqlClient, options: superOptions },
              { ids: [completeJobId], status: 'aborted' }
            );
            expect(updateResult.length).toBe(1);
          } catch (error) {
            expect(error.message).toContain(
              'disallow update v1/v2 job status to aborted'
            );
          }
        });

        it('Admin cancel Job success', async () => {
          // First create a job
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-cancel-test-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          jobIdListsOrg1.push(createResult.id);

          // cancel job
          const cancelResult = await jobHelper.helpCancelJob(
            { gqlClient, options: adminOptions },
            { jobId: createResult.id }
          );

          expect(cancelResult).toBeDefined();
          expect(cancelResult.id).toBe(createResult.id);
          _.pull(jobIdListsOrg1, createResult.id);
        });

        it('cancelled job can not update to queued', async () => {
          const cancelledJobId = await createCancelledJob(
            gqlClient,
            adminOptions
          );

          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            { ids: [cancelledJobId], status: 'queued' }
          );
          expect(updateResult.length).toBe(0);
        });

        it('cancelled job can not update to aborted', async () => {
          const cancelledJobId = await createCancelledJob(
            gqlClient,
            adminOptions
          );
          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            { ids: [cancelledJobId], status: 'aborted' }
          );
          expect(updateResult).toBeDefined();
          expect(updateResult[0].status).toBe('failed');
        });

        it('cancelled job update to failed', async () => {
          const cancelledJobId = await createCancelledJob(
            gqlClient,
            adminOptions
          );
          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            { ids: [cancelledJobId], status: 'failed' }
          );
          expect(updateResult).toBeDefined();
          expect(updateResult[0].status).toBe('failed');
        });

        it('Admin update job status with correct requiredCurrentStatus should success', async () => {
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          jobIdListsOrg1.push(createResult.id);
          expect(createResult.status).toBe('pending');

          // update status from pending to queued
          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            {
              ids: [createResult.id],
              status: 'queued',
              requiredCurrentStatus: 'pending'
            }
          );

          expect(updateResult).toBeDefined();
          expect(updateResult[0].status).toMatch(/^(queued|running)$/);
        });

        it('Admin update job status with incorrect requiredCurrentStatus should fail', async () => {
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          jobIdListsOrg1.push(createResult.id);
          expect(createResult.status).toBe('pending');

          // try update using wrong requiredCurrentStatus
          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            {
              ids: [createResult.id],
              status: 'queued',
              requiredCurrentStatus: 'cancelled'
            }
          );

          expect(_.isEmpty(updateResult)).toBe(true);
        });

        it('Admin update Job taskOutput success', async () => {
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-update-task-output-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );
          jobIdListsOrg1.push(createResult.id);

          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            {
              ids: [createResult.id],
              status: 'queued',
              taskOutput: {
                failureType: 'unknown',
                failureMessage: 'Test failure message'
              }
            }
          );

          const updatedJob = updateResult[0];
          expect(updateResult).toBeDefined();
          expect(updatedJob.id).toBe(createResult.id);
        });

        it('Admin update Job notification Uri success', async () => {
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-update-notification-uri-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );
          jobIdListsOrg1.push(createResult.id);

          const newNotificationUri = 'http://localhost:3000/';
          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            {
              ids: [createResult.id],
              status: 'queued',
              notificationUris: [newNotificationUri]
            }
          );

          const updatedJob = updateResult[0];
          expect(updateResult).toBeDefined();
          expect(updatedJob.id).toBe(createResult.id);
          expect(updatedJob.notificationUris.includes(newNotificationUri)).toBe(
            true
          );
        });

        xit('Admin update user created Job should success', async () => {
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: regularOptions },
            {
              name: `${citestMarker}-job-user-created-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );
          userCreatedJobId = createResult.id;
          jobIdListsRegularOrg1.push(userCreatedJobId);

          const updateResult = await jobHelper.helpUpdateJobs(
            { gqlClient, options: adminOptions },
            {
              ids: [userCreatedJobId],
              status: 'queued'
            }
          );

          expect(updateResult).toBeDefined();
          expect(updateResult[0].id).toBe(userCreatedJobId);
          expect(updateResult[0].status).toMatch(/^(queued|running)$/);
        });

        xit('User update admin created Job should fail', async () => {
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-admin-created-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );
          const adminCreatedJobId = createResult.id;
          jobIdListsOrg1.push(adminCreatedJobId);

          const updateResult = jobHelper.helpUpdateJobs(
            { gqlClient, options: regularOptions },
            {
              ids: [adminCreatedJobId],
              status: 'queued'
            }
          );

          await expect(updateResult).rejects.toThrow(/not_allowed/);
        });

        it('Admin retry Job success', async () => {
          // First create a job
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-retry-test-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );

          jobIdListsOrg1.push(createResult.id);
          // retry it
          const retryResult = await jobHelper.helpRetryJob(
            { gqlClient, options: adminOptions },
            { jobId: createResult.id, clusterId: testCluster.id }
          );

          expect(retryResult).toBeDefined();
          expect(retryResult.id).toBeDefined();
          jobIdListsOrg1.push(retryResult.id);
        });

        it('Admin cancel Job success', async () => {
          // First create a job
          const createResult = await jobHelper.helpCreateJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-job-cancel-test-${uuid.v4()}`,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              tasks: [{ engineId: testEngine.id }]
            }
          );
          jobIdListsOrg1.push(createResult.id);

          // cancel job
          const cancelResult = await jobHelper.helpCancelJob(
            { gqlClient, options: adminOptions },
            { jobId: createResult.id }
          );

          expect(cancelResult).toBeDefined();
          expect(cancelResult.id).toBe(createResult.id);
          _.pull(jobIdListsOrg1, createResult.id);
        });

        it('Get multiple jobs success', async () => {
          const result = await jobHelper.helpGetJobs(
            { gqlClient, options: adminOptions },
            { limit: 5 }
          );

          const jobs = _.get(result, 'records');
          expect(jobs).toBeDefined();
          expect(Array.isArray(jobs)).toBe(true);
        });

        it('Query Job success', async () => {
          const job = await jobHelper.helpGetJobById(
            { gqlClient, options: adminOptions },
            { jobId: testJobId }
          );

          expect(job).toBeDefined();
          expect(job.id).toBe(testJobId);
        });

        it('Admin launch job using not existed engineId should fail', async () => {
          const result = jobHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            {
              targetId: testTdo.id,
              engineId: uuid.v4(),
              clusterId: testCluster.id
            }
          );

          await expect(result).rejects.toThrow(/Engine not found/);
        });

        it('Admin launch job using engineId of other org should fail', async () => {
          const result = jobHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            {
              targetId: testTdo.id,
              engineId: engineOrg2.id,
              clusterId: testCluster.id
            }
          );

          await expect(result).rejects.toThrow(/Engine not found/);
        });

        it('Admin launch job without standaloneJobTemplates should fail', async () => {
          const result = engineHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            {
              engineId: testEngine.id,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              priority: 1
            }
          );

          await expect(result).rejects.toThrow(
            /This engine does not specify a default single job template/
          );
        });

        it('Configure engine with standalone job template for launchSingleEngineJob', async () => {
          const query = `mutation {
            updateEngine(input: {
              id: "${testEngine.id}"
              standaloneJobTemplates: [{
                type: Reprocess
                template: ${JSON.stringify(testTemplateTextReprocessChunk)}
              }]
            }) {
              id
              standaloneJobTemplates {
                type
                template
              }
            }
          }`;

          await gqlClient.query(query, {}, adminOptions);
        });

        it('Admin launch job with not existed targetId should fail', async () => {
          const result = jobHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            {
              targetId: testTdo.id + 100,
              engineId: testEngine.id,
              clusterId: testCluster.id
            }
          );

          await expect(result).rejects.toThrow(/TDO was not found/);
        });

        it('admin launch job without targetId, uploadUrl should fail', async () => {
          const result = jobHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            {
              engineId: testEngine.id,
              clusterId: testCluster.id
            }
          );

          await expect(result).rejects.toThrow(
            /targetId or uploadUrl are required/
          );
        });

        it('admin launch job with uploadUrl should success', async () => {
          const uploadEngine = await engineHelper.helpCreateEngine(
            { gqlClient, options: adminOptions },
            {
              name: citestMarker + '-upload-engine-' + uuid.v4(),
              categoryId: engineCategoryId,
              deploymentModel: 'FullyNetworkIsolated'
            }
          );
          uploadEngineData = uploadEngine.createEngine;
          engineIdsOrg1.push(uploadEngineData.id);

          await buildAndDeployEngine(uploadEngineData.id, adminOptions);

          const query = `mutation {
            updateEngine(input: {
              id: "${uploadEngineData.id}"
              standaloneJobTemplates: [{
                type: Upload
                template: ${JSON.stringify(testTemplateTextUploadChunk)}
              }]
            }) {
              id
              standaloneJobTemplates {
                type
                template
              }
            }
          }`;

          await gqlClient.query(query, {}, adminOptions);

          const result = await jobHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            {
              engineId: uploadEngineData.id,
              clusterId: testCluster.id,
              uploadUrl: 'http://localhost',
              priority: 1
            }
          );

          expect(result).toBeDefined();
          expect(result.clusterId).toEqual(testCluster.id);
          const launchSingleEngineJob = _.get(result, 'id');
          jobIdListsOrg1.push(launchSingleEngineJob);
        });

        it('Admin launch job with inaccessible targetId should fail', async () => {
          const result = jobHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            {
              targetId: testTdoOrg2.id,
              engineId: testEngine.id,
              clusterId: testCluster.id
            }
          );

          await expect(result).rejects.toThrow(
            /object does not exist or access not granted/
          );
        });

        it('Admin launch job using not existed clusterId should fail', async () => {
          const result = jobHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            {
              targetId: testTdo.id,
              engineId: testEngine.id,
              clusterId: uuid.v4()
            }
          );

          await expect(result).rejects.toThrow(/The cluster was not found/);
        });

        xit('admin launch job using inaccessible clusterId should fail', async () => {
          const result = jobHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            {
              targetId: testTdo.id,
              engineId: testEngine.id,
              clusterId: testClusterOrg2.id
            }
          );

          await expect(result).rejects.toThrow(/The cluster was not found/);
        });

        it('Admin launch job without clusterId should success', async () => {
          const result = await engineHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            { engineId: testEngine.id, targetId: testTdo.id, priority: 1 }
          );
          const launchSingleEngineJob = _.get(result, 'launchSingleEngineJob');
          expect(launchSingleEngineJob).toBeDefined();
          expect(launchSingleEngineJob.id).toBeDefined();
          jobIdListsOrg1.push(launchSingleEngineJob.id);
        });

        it('admin launch job using valid clusterId should success', async () => {
          const result = await engineHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            {
              engineId: testEngine.id,
              targetId: testTdo.id,
              clusterId: testCluster.id,
              priority: 1
            }
          );

          const launchSingleEngineJob = _.get(result, 'launchSingleEngineJob');
          expect(launchSingleEngineJob).toBeDefined();
          expect(launchSingleEngineJob.id).toBeDefined();
          jobIdListsOrg1.push(launchSingleEngineJob.id);
          if (testCluster) {
            expect(launchSingleEngineJob.clusterId).toEqual(testCluster.id);
          }
        });

        it('admin launch job with both targetId, uploadUrl should success', async () => {
          const result = await jobHelper.helpLaunchSingleEngineJob(
            { gqlClient, options: adminOptions },
            {
              targetId: testTdo.id,
              engineId: testEngine.id,
              clusterId: testCluster.id,
              uploadUrl: 'http://localhost',
              priority: 1
            }
          );

          expect(result).toBeDefined();
          expect(result.id).toBeDefined();
          jobIdListsOrg1.push(result.id);
        });
      });

      afterAll(async () => {
        // cancel all created jobs
        if (jobIdListsRegularOrg1.length > 0) {
          for (let jobId of jobIdListsRegularOrg1) {
            await safe(`update job to queued`, () =>
              jobHelper.helpUpdateJobs(
                { gqlClient, options: regularOptions },
                { ids: [jobId], status: 'queued' }
              )
            );

            await safe(`cancel job`, () =>
              jobHelper.helpCancelJob(
                { gqlClient, options: regularOptions },
                { jobId: jobId }
              )
            );
          }
        }

        if (jobIdListsOrg1.length > 0) {
          for (let jobId of jobIdListsOrg1) {
            await safe(`update job to queued`, () =>
              jobHelper.helpUpdateJobs(
                { gqlClient, options: adminOptions },
                { ids: [jobId], status: 'queued' }
              )
            );

            await safe(`cancel job`, () =>
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
            await safe(`delete engine engineIdsOrg1`, () =>
              engineHelper.helpDeleteEngine(
                { gqlClient, options: adminOptions },
                { id: engineId }
              )
            );
          }
        }
        if (engineIdsOrg2.length > 0) {
          for (let engineId of engineIdsOrg2) {
            await safe(`delete engine engineIdsOrg2`, () =>
              engineHelper.helpDeleteEngine(
                { gqlClient, options: adminOptions2 },
                { id: engineId }
              )
            );
          }
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
        if (testTdoOrg2) {
          await safe(`delete tdo testTdoOrg2`, () =>
            tdoHelper.helpDeleteTDO(
              { gqlClient, options: adminOptions2 },
              { id: testTdoOrg2.id }
            )
          );
        }
        if (publicTdo) {
          await safe(`delete tdo publicTdo`, () =>
            tdoHelper.helpDeleteTDO(
              { gqlClient, options: superOptions },
              { id: publicTdo.id }
            )
          );
        }

        if (testCluster?.id) {
          await safe(`delete cluster testCluster`, () =>
            engineHelper.helpDeleteCluster(
              { gqlClient, options: adminOptions },
              { id: testCluster.id }
            )
          );
        }

        if (testClusterOrg2?.id) {
          await safe(`delete cluster testClusterOrg2`, () =>
            engineHelper.helpDeleteCluster(
              { gqlClient, options: adminOptions2 },
              { id: testClusterOrg2.id }
            )
          );
        }

        if (rbac?.authGroupId) {
          await safe('delete auth group', async () =>
            rbacHelper.helpDeleteAuthGroup(
              { gqlClient, options: adminOptions },
              { id: rbac.authGroupId }
            )
          );
        }

        if (rbac?.authPermissionSetId) {
          await safe('delete auth permission set', async () =>
            rbacHelper.helpDeleteAuthPermissionSet(
              { gqlClient, options: adminOptions },
              { id: rbac.authPermissionSetId }
            )
          );
        }

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
          await safe(`delete organization testOrg`, () =>
            orgHelper.deleteOrganization(
              { gqlClient, options: superOptions },
              testOrg.id
            )
          );
        }

        if (testOrg2?.id) {
          await safe(`delete organization testOrg2`, () =>
            orgHelper.deleteOrganization(
              { gqlClient, options: superOptions },
              testOrg2.id
            )
          );
        }
      });
    });

    async function createQueuedJob(gqlClient, options) {
      const createJob = await jobHelper.helpCreateJob(
        { gqlClient, options },
        {
          name: `${citestMarker}-job-cancel-test-${uuid.v4()}`,
          targetId: testTdo.id,
          clusterId: testCluster.id,
          tasks: [{ engineId: testEngine.id }]
        }
      );
      jobIdListsOrg1.push(createJob.id);

      await jobHelper.helpUpdateJobs(
        { gqlClient, options },
        { ids: [createJob.id], status: 'queued' }
      );

      return createJob.id;
    }

    async function createCancelledJob(gqlClient, options) {
      const createJob = await jobHelper.helpCreateJob(
        { gqlClient, options },
        {
          name: `${citestMarker}-job-cancel-test-${uuid.v4()}`,
          targetId: testTdo.id,
          clusterId: testCluster.id,
          tasks: [{ engineId: testEngine.id }]
        }
      );
      jobIdListsOrg1.push(createJob.id);

      await jobHelper.helpCancelJob(
        { gqlClient, options },
        { jobId: createJob.id }
      );
      _.pull(jobIdListsOrg1, createJob.id);

      return createJob.id;
    }
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

function getOrg2AndUserInput(isEnabledOlp = false) {
  const createOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org2-folder-rbac-${version}-${uuid.v4()}`,
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
        name: `${citestMarker}-admin2-user-${version}-${uuid.v4()}@localhost`,
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
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
