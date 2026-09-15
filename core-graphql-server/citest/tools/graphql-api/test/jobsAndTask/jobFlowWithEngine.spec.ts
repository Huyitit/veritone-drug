import { getMockEngineTemplate } from '../helpers/mockUtil';
import { impersonateUser } from '../../src/helpers/commonHelper';
import {
  AuthGroupMemberType,
  AuthPermissionType,
  AuthResourceType,
  BuildUpdateAction,
  ClusterStatus,
  DeploymentModel,
  JobStatus,
  JobStatusFilter,
  JobTemplateEnumType,
  OrganizationStatus,
  OrganizationType,
  TaskFailureReason,
  UpdateJobsStatus
} from '../../src/gql/gql';
import {
  AuthType,
  buildRequestHeaders,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import _ from 'lodash';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';

// @ts-ignore
import { v4 as uuidv4 } from 'uuid';

const testTemplateTextUploadChunk = getMockEngineTemplate(
  'citest-upload',
  'upload'
);

const testTemplateTextReprocessChunk = getMockEngineTemplate(
  'citest-upload',
  'reproc'
);

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const version = 'v1'; // Added version variable

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

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

let gqlClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

describe('citest_jobs: Job Test Flow', () => {
  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;

    const getMe = await gqlClient.sdk.me();
    expect(getMe?.data?.me).toBeDefined();
  });

  afterAll(async () => {
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  describe.each([false, true])('jobs ', (isEnabledOlp) => {
    let adminRequestHeadersOrg1: Record<string, string>;
    let adminRequestHeadersOrg2: Record<string, string>;
    let regularRequestHeadersOrg1: Record<string, string>;
    const rbac = { authGroupId: '', authPermissionSetId: '' };

    let orgId1,
      orgId2,
      userCreatedJobId,
      inactiveEngineId,
      uploadEngineData,
      failedJobId: any,
      completeJobId: any,
      testTdo: any,
      testTdoOrg2: any,
      publicTdo: any,
      testCluster: any,
      testClusterOrg2: any,
      testJobId: any,
      testOrg1: any,
      testOrg2: any,
      regularUser: any,
      testEngine: any,
      engineOrg2: any,
      publicEngineOrg2: any;

    const jobIdListsOrg1: any = [];
    const engineIdsOrg1: any = [];
    const engineIdsOrg2: any = [];
    const userIds: any = [];

    describe(`jobs test with isEnabledOlp = ${isEnabledOlp}`, () => {
      beforeAll(async () => {
        // create Org1
        const createOrg1Result = await gqlClient.sdk.createOrganization({
          input: getOrgAndUserInput(isEnabledOlp).orgInput
        });
        orgId1 = createOrg1Result?.data?.createOrganization?.id;
        testOrg1 = createOrg1Result?.data?.createOrganization;

        const adminUserOrg1 = {
          ...getOrgAndUserInput(isEnabledOlp).userInputs[0],
          organizationId: orgId1!
        };

        const regularUserOrg1 = {
          ...getOrgAndUserInput(isEnabledOlp).userInputs[1],
          organizationId: orgId1!
        };

        // create admin user
        const createAdminUserOrg1Result = await gqlClient.sdk.createUser({
          input: adminUserOrg1
        });
        expect(createAdminUserOrg1Result?.data?.createUser?.id).toBeDefined();
        userIds.push(createAdminUserOrg1Result?.data?.createUser?.id);

        //Login for Admin User Org1
        adminRequestHeadersOrg1 = await buildRequestHeaders(gqlClient, {
          userName: adminUserOrg1.name,
          password: adminUserOrg1.password
        });

        // create regular user Org1
        const createRegularUserOrg1Result = await gqlClient.sdk.createUser({
          input: regularUserOrg1
        });

        regularUser = createRegularUserOrg1Result?.data?.createUser;
        userIds.push(regularUser?.id);

        //Login for Regular User Org1
        regularRequestHeadersOrg1 = await buildRequestHeaders(gqlClient, {
          userName: regularUserOrg1.name,
          password: regularUserOrg1.password
        });

        // create Org2
        const createOrg2Result = await gqlClient.sdk.createOrganization({
          input: getOrg2AndUserInput(isEnabledOlp).orgInput
        });
        orgId2 = createOrg2Result?.data?.createOrganization?.id;

        const adminUserOrg2 = {
          ...getOrg2AndUserInput(isEnabledOlp).userInputs[0],
          organizationId: orgId2!
        };

        // create admin user Org 2
        const createAdminUserOrg2Result = await gqlClient.sdk.createUser({
          input: adminUserOrg2
        });
        expect(createAdminUserOrg2Result?.data?.createUser?.id).toBeDefined();
        userIds.push(createAdminUserOrg2Result?.data?.createUser?.id);

        //Login for Admin User Org2
        adminRequestHeadersOrg2 = await buildRequestHeaders(gqlClient, {
          userName: adminUserOrg2.name,
          password: adminUserOrg2.password
        });
      });

      describe('Job Tests Implementation', () => {
        beforeAll(async () => {
          // Create test TDO for org 1
          const createTdoForOrg1 = await gqlClient.sdk.createTDOWithAsset(
            {
              input: {
                name: `${citestMarker}-test-tdo-${uuidv4()}`,
                ...tdoAssetInput
              }
            },
            adminRequestHeadersOrg1
          );

          testTdo = createTdoForOrg1?.data?.createTDOWithAsset;

          // Create TDO for org 2 (for cross-org testing)
          const createTdoForOrg2 = await gqlClient.sdk.createTDOWithAsset(
            {
              input: {
                name: `${citestMarker}-test-tdo-org2-${uuidv4()}`,
                ...tdoAssetInput
              }
            },
            adminRequestHeadersOrg2
          );
          testTdoOrg2 = createTdoForOrg2?.data?.createTDOWithAsset;

          // Create public TDO
          const createPublicTdo = await gqlClient.sdk.createTDOWithAsset({
            input: {
              name: `${citestMarker}-public-tdo-${uuidv4()}`,
              isPublic: true,
              ...tdoAssetInput
            }
          });
          publicTdo = createPublicTdo?.data?.createTDOWithAsset;

          // Create engine for org 1
          const engineCreate = await gqlClient.sdk.createEngine(
            {
              input: {
                name: citestMarker + '-engine-' + uuidv4(),
                categoryId: engineCategoryId,
                deploymentModel: DeploymentModel.FullyNetworkIsolated
              }
            },
            adminRequestHeadersOrg1
          );
          testEngine = engineCreate.data.createEngine;
          engineIdsOrg1.push(testEngine?.id);

          await buildAndDeployEngine(testEngine?.id, adminRequestHeadersOrg1);

          // Create engine for org 2
          const engineCreateOrg2 = await gqlClient.sdk.createEngine(
            {
              input: {
                name: citestMarker + '-engine-org2-' + uuidv4(),
                categoryId: engineCategoryId,
                deploymentModel: DeploymentModel.FullyNetworkIsolated
              }
            },
            adminRequestHeadersOrg2
          );
          engineOrg2 = engineCreateOrg2.data.createEngine;
          engineIdsOrg2.push(engineOrg2?.id);

          await buildAndDeployEngine(engineOrg2?.id, adminRequestHeadersOrg2);

          // Create public engine for org 2
          const publicEngineCreateOrg2 = await gqlClient.sdk.createEngine(
            {
              input: {
                name: citestMarker + '-public-engine-org2-' + uuidv4(),
                categoryId: engineCategoryId,
                deploymentModel: DeploymentModel.FullyNetworkIsolated,
                isPublic: true
              }
            },
            adminRequestHeadersOrg2
          );
          publicEngineOrg2 = publicEngineCreateOrg2.data.createEngine;
          engineIdsOrg2.push(publicEngineOrg2?.id);

          await buildAndDeployEngine(
            publicEngineOrg2?.id,
            adminRequestHeadersOrg2,
            true
          );

          // Create test Cluster for org 1
          const clusters = await gqlClient.sdk.createCluster(
            {
              input: {
                name: `${citestMarker}-test-cluster-${uuidv4()}`,
                dockerCredentials: {},
                allowedEngines: [],
                status: ClusterStatus.Active
              }
            },
            adminRequestHeadersOrg1
          );
          testCluster = clusters.data.createCluster;

          // Create test Cluster for org 2
          const clustersOrg2 = await gqlClient.sdk.createCluster(
            {
              input: {
                name: `${citestMarker}-test-cluste-org2-${uuidv4()}`,
                dockerCredentials: {},
                allowedEngines: [],
                status: ClusterStatus.Active
              }
            },
            adminRequestHeadersOrg2
          );
          testClusterOrg2 = clustersOrg2.data.createCluster;
        });

        it('Admin create job without task should fail', async () => {
          const createjob = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-org-tdo-${uuidv4()}`,
                targetId: testTdo?.id,
                clusterId: testCluster?.id
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(createjob).rejects.toThrow(
            'must have at least one task definition'
          );
        });

        it('Admin create job without TDO should fail', async () => {
          const createjob = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-no-tdo-${uuidv4()}`,
                clusterId: testCluster?.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(createjob).rejects.toThrow('Missing recordingId!');
        });

        it('Admin Create Job using not existed TDO should fail', async () => {
          const createJob = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-nonexistent-tdo-${uuidv4()}`,
                targetId: testTdo?.id + 9999999,
                clusterId: testCluster?.id,
                tasks: [{ engineId: engineOrg2.id }]
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(createJob).rejects.toThrow(/not found/);
        });

        it('Admin Create Job using TDO of other org should fail', async () => {
          const createJob = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-other-org-tdo-${uuidv4()}`,
                targetId: testTdoOrg2.id,
                clusterId: testCluster?.id,
                tasks: [
                  {
                    engineId: testEngine.id
                  }
                ]
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(createJob).rejects.toThrow(
            'The specified object does not exist or access not granted.'
          );
        });

        it('Admin Create Job using org owned TDO should success', async () => {
          const result = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-org-tdo-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );

          expect(result?.data?.createJob).toBeDefined();
          expect(result?.data?.createJob?.id).toBeDefined();
          expect(result?.data?.createJob?.status).toBe('pending');

          testJobId = result?.data?.createJob?.id;
          jobIdListsOrg1.push(testJobId);
        });

        it('Admin Create Job using public TDO should success', async () => {
          const result = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-public-tdo-${uuidv4()}`,
                targetId: publicTdo.id,
                clusterId: testCluster?.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );

          expect(result?.data?.createJob).toBeDefined();
          expect(result?.data?.createJob?.id).toBeDefined();
          expect(result?.data?.createJob?.status).toBe('pending');

          jobIdListsOrg1.push(result?.data?.createJob?.id);
        });

        it('Regular user Create Job should fail without permissions', async () => {
          const createJob = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-public-tdo-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            regularRequestHeadersOrg1
          );

          await expect(createJob).rejects.toThrow('not_allowed');
        });

        it('add user permission AIWARE_JOB_CREATE', async () => {
          if (!isEnabledOlp) return;

          const newAuthGroup = await gqlClient.sdk.CreateAuthGroup(
            {
              input: {
                name: `${citestMarker}-job-group-${uuidv4()}`,
                description: 'citest job create group',
                members: [
                  {
                    id: regularUser.id,
                    memberType: AuthGroupMemberType.User
                  }
                ],
                ownerOrganization: testOrg1.guid
              }
            },
            adminRequestHeadersOrg1
          );
          expect(_.get(newAuthGroup, 'data.authGroupCreate')).toBeDefined();
          rbac.authGroupId = _.get(newAuthGroup, 'data.authGroupCreate.id', '');

          const permissionSetResult =
            await gqlClient.sdk.authPermissionSetCreate(
              {
                input: {
                  name: `${citestMarker}-job-permission-${uuidv4()}`,
                  description: 'citest job create permission',
                  organizationID: testOrg1.id,
                  permissions: [
                    AuthPermissionType.AiwareJobCreate,
                    AuthPermissionType.AiwareJobDelete,
                    AuthPermissionType.AiwareJobRead,
                    AuthPermissionType.AiwareJobUpdate
                  ]
                }
              },
              adminRequestHeadersOrg1
            );

          const authPermissionSetData = _.get(
            permissionSetResult,
            'data.authPermissionSetCreate'
          );
          expect(authPermissionSetData).toBeDefined();
          rbac.authPermissionSetId = authPermissionSetData.id as string;

          await gqlClient.sdk.addACEsToResources(
            {
              resourceType: AuthResourceType.Organization,
              ownerOrganization: testOrg1.guid,
              ids: [testOrg1.id],
              entries: [
                {
                  member: {
                    id: rbac.authGroupId!,
                    memberType: AuthGroupMemberType.Group
                  },
                  permissionSetID: rbac.authPermissionSetId!
                }
              ]
            },
            adminRequestHeadersOrg1
          );

          // relogin user
          const impersonated = await impersonateUser(
            gqlClient.sessionToken as string,
            regularUser.id,
            testOrg1.guid
          );
          regularRequestHeadersOrg1 = impersonated.requestOptions;
        });

        xit('Regular user Create Job using org owned TDO should success with permissions', async () => {
          if (!isEnabledOlp) return;

          const result = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-public-tdo-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            regularRequestHeadersOrg1
          );

          expect(result?.data?.createJob).toBeDefined();
          expect(result?.data?.createJob?.id).toBeDefined();
          expect(result?.data?.createJob?.status).toBe('pending');

          userCreatedJobId = result?.data?.createJob?.id;
          jobIdListsOrg1.push(userCreatedJobId);
        });

        it('Admin Create Job using not active engine should fail', async () => {
          const inactiveEngineCreate = await gqlClient.sdk.createEngine(
            {
              input: {
                name: citestMarker + '-inactive-engine-' + uuidv4(),
                categoryId: engineCategoryId,
                deploymentModel: DeploymentModel.FullyNetworkIsolated
              }
            },
            adminRequestHeadersOrg1
          );

          inactiveEngineId = inactiveEngineCreate?.data?.createEngine?.id;
          engineIdsOrg1.push(inactiveEngineId);

          const createJob = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-inactive-engine-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: inactiveEngineId }]
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(createJob).rejects.toThrow(
            'could not find active deployed build for engine'
          );
        });

        it('Admin Create Job using not exist engine should fail', async () => {
          const createJob = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-nonexistent-engine-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster?.id,
                tasks: [{ engineId: uuidv4() }]
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(createJob).rejects.toThrow('No access to engine');
        });

        xit('Admin Create Job using engine of other org should fail', async () => {
          const createJob = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-other-org-engine-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster?.id,
                tasks: [{ engineId: engineOrg2.id }]
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(createJob).rejects.toThrow('No access to engine');
        });

        it('Admin Create Job using org own engine should success', async () => {
          const result = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-org-engine-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );

          expect(result?.data?.createJob).toBeDefined();
          expect(result?.data?.createJob?.id).toBeDefined();
          expect(result?.data?.createJob?.status).toBe('pending');

          jobIdListsOrg1.push(result?.data?.createJob?.id);
        });

        xit('User Create Job using org owned engine should success', async () => {
          const result = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-org-engine-user-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );

          expect(result?.data?.createJob).toBeDefined();
          expect(result?.data?.createJob?.id).toBeDefined();
          expect(result?.data?.createJob?.status).toBe('pending');

          userCreatedJobId = result?.data?.createJob?.id;
          jobIdListsOrg1.push(userCreatedJobId);
        });

        it('Create Job using public engine should success', async () => {
          const result = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-org-engine-user-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: publicEngineOrg2.id }]
              }
            },
            adminRequestHeadersOrg1
          );

          expect(result?.data?.createJob).toBeDefined();
          expect(result?.data?.createJob?.id).toBeDefined();
          expect(result?.data?.createJob?.status).toBe('pending');

          jobIdListsOrg1.push(result?.data?.createJob?.id);
        });

        it('pending job can update to queued', async () => {
          // First create a job in pending status
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-status-pending-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [
                  {
                    engineId: testEngine.id
                  }
                ]
              }
            },
            adminRequestHeadersOrg1
          );

          expect(createResult?.data?.createJob?.status).toBe('pending');
          jobIdListsOrg1.push(createResult?.data?.createJob?.id);

          // update pending to queued (should work)
          const updateResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createResult?.data?.createJob?.id!],
                status: UpdateJobsStatus.Queued
              }
            },
            adminRequestHeadersOrg1
          );

          expect(
            ['queued', 'running'].includes(
              updateResult?.data?.updateJobs?.records?.[0]?.status!
            )
          ).toBe(true);
        });

        it('pending job can update to failed', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-status-pending-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );

          expect(createResult?.data?.createJob?.status).toBe('pending');
          jobIdListsOrg1.push(createResult?.data?.createJob?.id);

          // update pending to failed (should fail)
          const failResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createResult?.data?.createJob?.id!],
                status: UpdateJobsStatus.Failed
              }
            },
            adminRequestHeadersOrg1
          );

          failedJobId = createResult?.data?.createJob?.id;
          expect(failResult?.data?.updateJobs).toBeDefined();
          expect(failResult?.data?.updateJobs?.records?.[0]?.status).toBe(
            'failed'
          );
        });

        it('pending job update to aborted', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-status-pending-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );

          expect(createResult?.data?.createJob?.status).toBe('pending');
          jobIdListsOrg1.push(createResult?.data?.createJob?.id);

          const abortResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createResult?.data?.createJob?.id!],
                status: UpdateJobsStatus.Aborted
              }
            },
            adminRequestHeadersOrg1
          );

          failedJobId = createResult?.data?.createJob?.id;
          expect(abortResult?.data?.updateJobs).toBeDefined();
          expect(
            ['aborted', 'failed'].includes(
              abortResult?.data?.updateJobs?.records?.[0]?.status!
            )
          ).toBe(true);
        });

        it('failed job can not update to queued', async () => {
          const failResult = await gqlClient.sdk.updateJobs({
            input: {
              ids: [failedJobId],
              status: UpdateJobsStatus.Queued
            }
          });

          expect(failResult?.data?.updateJobs?.count).toBe(0);
        });

        it('failed job can only update to aborted', async () => {
          const failResult = await gqlClient.sdk.updateJobs({
            input: {
              ids: [failedJobId],
              status: UpdateJobsStatus.Aborted
            }
          });

          expect(failResult?.data?.updateJobs?.records?.[0]?.status).toBe(
            'failed'
          );
        });

        it('queued job update to failed', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-cancel-test-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          jobIdListsOrg1.push(createResult?.data?.createJob?.id);

          await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createResult?.data?.createJob?.id!],
                status: UpdateJobsStatus.Queued
              }
            },
            adminRequestHeadersOrg1
          );

          const updateFailResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createResult?.data?.createJob?.id!],
                status: UpdateJobsStatus.Failed
              }
            },
            adminRequestHeadersOrg1
          );

          expect(
            ['failed'].includes(
              updateFailResult?.data?.updateJobs?.records?.[0]?.status!
            )
          ).toBe(true);
        });

        it('queued job update to aborted', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-cancel-test-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          jobIdListsOrg1.push(createResult?.data?.createJob?.id);

          await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createResult?.data?.createJob?.id!],
                status: UpdateJobsStatus.Queued
              }
            },
            adminRequestHeadersOrg1
          );

          const updateFailResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createResult?.data?.createJob?.id!],
                status: UpdateJobsStatus.Aborted
              }
            },
            adminRequestHeadersOrg1
          );

          expect(
            ['failed'].includes(
              updateFailResult?.data?.updateJobs?.records?.[0]?.status!
            )
          ).toBe(true);
        });

        xit('completed job cannot update to failed', async () => {
          const getJob = await gqlClient.sdk.jobs({
            limit: 1,
            status: JobStatusFilter.Complete
          });

          const jobs = getJob?.data?.jobs?.records;
          if (jobs?.length === 0) {
            return;
          }
          completeJobId = jobs?.[0]?.id;

          try {
            const updateResult = await gqlClient.sdk.updateJobs({
              input: {
                ids: [completeJobId!],
                status: UpdateJobsStatus.Failed
              }
            });
            expect(updateResult?.data?.updateJobs?.records?.length).toBe(1);
          } catch (error: any) {
            expect(error.message).toContain(
              'disallow update v1/v2 job status to failed'
            );
          }
        });

        it('completed job cannot update to queued', async () => {
          if (!completeJobId) {
            return;
          }

          const updateResult = await gqlClient.sdk.updateJobs({
            input: {
              ids: [completeJobId],
              status: UpdateJobsStatus.Queued
            }
          });

          expect(updateResult?.data?.updateJobs?.records?.length).toBe(0);
        });

        it('completed job cannot update to aborted', async () => {
          if (!completeJobId) {
            return;
          }

          try {
            const updateResult = await gqlClient.sdk.updateJobs({
              input: {
                ids: [completeJobId],
                status: UpdateJobsStatus.Aborted
              }
            });

            expect(updateResult?.data?.updateJobs?.records?.length).toBe(1);
          } catch (error: any) {
            expect(error.message).toContain(
              'disallow update v1/v2 job status to aborted'
            );
          }
        });

        it('Admin cancel Job success', async () => {
          //First create a job
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-cancel-test-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );

          const createdJobId = createResult?.data?.createJob?.id;
          jobIdListsOrg1.push(createdJobId);
          expect(createdJobId).toBeDefined();

          //Cancel Job
          const cancelResult = await gqlClient.sdk.cancelJob(
            {
              id: createdJobId!
            },
            adminRequestHeadersOrg1
          );

          expect(cancelResult?.data?.cancelJob).toBeDefined();
          expect(cancelResult?.data?.cancelJob?.id).toBe(createdJobId);

          _.pull(jobIdListsOrg1, createdJobId);
        });

        it('cancelled job can not update to queued', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-cancel-test-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          const createdJobId = createResult?.data?.createJob?.id;
          expect(createdJobId).toBeDefined();
          jobIdListsOrg1.push(createdJobId);

          //Cancel job just created
          await safe(`cancel job ${createdJobId}`, async () =>
            gqlClient.sdk.cancelJob(
              {
                id: createdJobId!
              },
              adminRequestHeadersOrg1
            )
          );

          const updateResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createdJobId!],
                status: UpdateJobsStatus.Queued
              }
            },
            adminRequestHeadersOrg1
          );

          expect(updateResult?.data?.updateJobs?.records?.length).toBe(0);
        });

        it('cancelled job can not update to aborted', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-cancel-test-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          const createdJobId = createResult?.data?.createJob?.id;
          expect(createdJobId).toBeDefined();
          jobIdListsOrg1.push(createdJobId);

          //Cancel job just created
          await safe(`cancel job ${createdJobId}`, async () =>
            gqlClient.sdk.cancelJob(
              {
                id: createdJobId!
              },
              adminRequestHeadersOrg1
            )
          );

          const updateResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createdJobId!],
                status: UpdateJobsStatus.Aborted
              }
            },
            adminRequestHeadersOrg1
          );

          expect(updateResult?.data?.updateJobs?.records?.[0]?.status).toBe(
            'failed'
          );
        });

        it('cancelled job update to failed', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-cancel-test-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          const createdJobId = createResult?.data?.createJob?.id;
          expect(createdJobId).toBeDefined();
          jobIdListsOrg1.push(createdJobId);

          //Cancel job just created
          await safe(`cancel job ${createdJobId}`, async () =>
            gqlClient.sdk.cancelJob(
              {
                id: createdJobId!
              },
              adminRequestHeadersOrg1
            )
          );

          const updateResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createdJobId!],
                status: UpdateJobsStatus.Failed
              }
            },
            adminRequestHeadersOrg1
          );

          expect(updateResult?.data?.updateJobs?.records?.[0]?.status).toBe(
            'failed'
          );
        });

        it('Admin update job status with correct requiredCurrentStatus should success', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          jobIdListsOrg1.push(createResult?.data?.createJob?.id);
          expect(createResult?.data?.createJob?.status).toBe('pending');

          // update status from pending to queued
          const updateResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createResult?.data?.createJob?.id!],
                status: UpdateJobsStatus.Queued,
                requiredCurrentStatus: JobStatus.Pending
              }
            },
            adminRequestHeadersOrg1
          );

          expect(updateResult?.data?.updateJobs).toBeDefined();
          expect(updateResult?.data?.updateJobs?.records?.[0]?.status).toMatch(
            /^(queued|running)$/
          );
        });

        it('Admin update job status with incorrect requiredCurrentStatus should fail', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          jobIdListsOrg1.push(createResult?.data?.createJob?.id);
          expect(createResult?.data?.createJob?.status).toBe('pending');

          // try update using wrong requiredCurrentStatus
          const updateResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createResult?.data?.createJob?.id!],
                status: UpdateJobsStatus.Queued,
                requiredCurrentStatus: JobStatus.Cancelled
              }
            },
            adminRequestHeadersOrg1
          );

          expect(updateResult?.data?.updateJobs?.records).toHaveLength(0);
        });

        it('Admin update Job taskOutput success', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-update-task-output-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          const createdJobId = createResult?.data?.createJob?.id;
          expect(createdJobId).toBeDefined();

          jobIdListsOrg1.push(createdJobId);

          const updateResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createdJobId!],
                status: UpdateJobsStatus.Queued,
                taskOutput: {
                  failureType: TaskFailureReason.Unknown,
                  failureMessage: 'Test failure message'
                }
              }
            },
            adminRequestHeadersOrg1
          );

          expect(updateResult?.data?.updateJobs?.records?.[0]?.id).toBe(
            createdJobId
          );
        });

        it('Admin update Job notification Uri success', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-update-notification-uri-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          const createdJobId = createResult?.data?.createJob?.id;
          expect(createdJobId).toBeDefined();

          jobIdListsOrg1.push(createdJobId);

          const newNotificationUri = 'http://localhost:3000/';
          const updateResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [createdJobId!],
                status: UpdateJobsStatus.Queued,
                notificationUris: [newNotificationUri]
              }
            },
            adminRequestHeadersOrg1
          );

          expect(updateResult?.data?.updateJobs?.records?.[0]?.id).toBe(
            createdJobId
          );
          expect(
            updateResult?.data?.updateJobs?.records?.[0]?.notificationUris?.includes(
              newNotificationUri
            )
          ).toBe(true);
        });

        xit('Admin update user created Job should success', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-user-created-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            regularRequestHeadersOrg1
          );
          userCreatedJobId = createResult?.data?.createJob?.id;
          expect(userCreatedJobId).toBeDefined();

          jobIdListsOrg1.push(userCreatedJobId);

          const updateResult = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [userCreatedJobId!],
                status: UpdateJobsStatus.Queued
              }
            },
            adminRequestHeadersOrg1
          );

          expect(updateResult?.data?.updateJobs?.records?.[0]?.id).toBe(
            userCreatedJobId
          );
          expect(updateResult?.data?.updateJobs?.records?.[0]?.status).toMatch(
            /^(queued|running)$/
          );
        });

        xit('User update admin created Job should fail', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-admin-created-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          const adminCreatedJobId = createResult?.data?.createJob?.id;
          expect(adminCreatedJobId).toBeDefined();

          jobIdListsOrg1.push(adminCreatedJobId);

          try {
            await gqlClient.sdk.updateJobs(
              {
                input: {
                  ids: [adminCreatedJobId!],
                  status: UpdateJobsStatus.Queued
                }
              },
              regularRequestHeadersOrg1
            );
          } catch (error: any) {
            const msg = error?.response?.errors[0].name;
            expect(msg).toBe('not_allowed');
          }
        });

        it('Admin retry Job success', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-retry-test-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          const createdJobId = createResult?.data?.createJob?.id;
          expect(createdJobId).toBeDefined();

          jobIdListsOrg1.push(createdJobId);

          //Retry it
          const retryResult = await gqlClient.sdk.retryJob(
            {
              id: createdJobId!,
              clusterId: testCluster.id
            },
            adminRequestHeadersOrg1
          );

          expect(retryResult?.data?.retryJob?.id).toBeDefined();
          const retriedJobId = _.get(retryResult, 'data.retryJob.id');
          jobIdListsOrg1.push(retriedJobId);
        });

        it('Admin cancel Job success', async () => {
          const createResult = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-cancel-test-${uuidv4()}`,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeadersOrg1
          );
          const createdJobId = createResult?.data?.createJob?.id;
          expect(createdJobId).toBeDefined();
          jobIdListsOrg1.push(createdJobId);

          //Cancel job
          const cancelJob = await gqlClient.sdk.cancelJob(
            {
              id: createdJobId!
            },
            adminRequestHeadersOrg1
          );

          expect(cancelJob?.data?.cancelJob?.id).toBe(createdJobId);
          _.pull(jobIdListsOrg1, createdJobId);
        });

        it('Get multiple jobs success', async () => {
          const getJobs = await gqlClient.sdk.jobs(
            {
              limit: 5
            },
            adminRequestHeadersOrg1
          );

          const jobs = getJobs?.data?.jobs?.records;
          expect(jobs).toBeDefined();
          expect(Array.isArray(jobs)).toBe(true);
        });

        it('Query Job success', async () => {
          const job = await gqlClient.sdk.job(
            {
              id: testJobId
            },
            adminRequestHeadersOrg1
          );

          expect(job?.data?.job?.id).toBe(testJobId);
        });

        it('Admin launch job using not existed engineId should fail', async () => {
          const result = gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                targetId: testTdo.id,
                engineId: uuidv4(),
                clusterId: testCluster.id
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(result).rejects.toThrow('Engine not found');
        });

        it('Admin launch job using engineId of other org should fail', async () => {
          const result = gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                targetId: testTdo.id,
                engineId: engineOrg2.id,
                clusterId: testCluster.id
              }
            },
            adminRequestHeadersOrg1
          );
          await expect(result).rejects.toThrow('Engine not found');
        });

        it('Admin launch job without standaloneJobTemplates should fail', async () => {
          const result = gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                engineId: testEngine.id,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                priority: 1
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(result).rejects.toThrow(
            'This engine does not specify a default single job template'
          );
        });

        it('Configure engine with standalone job template for launchSingleEngineJob', async () => {
          await gqlClient.sdk.updateEngine({
            input: {
              id: testEngine.id,
              standaloneJobTemplates: [
                {
                  type: JobTemplateEnumType.Reprocess,
                  template: testTemplateTextReprocessChunk!
                }
              ]
            }
          });
        });

        it('Admin launch job with not existed targetId should fail', async () => {
          const res = gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                targetId: testTdo.id + 100,
                engineId: testEngine.id,
                clusterId: testCluster.id
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(res).rejects.toThrow('TDO was not found');
        });

        it('admin launch job without targetId, uploadUrl should fail', async () => {
          const res = gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                engineId: testEngine.id,
                clusterId: testCluster.id
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(res).rejects.toThrow(
            'targetId or uploadUrl are required'
          );
        });

        it('admin launch job with uploadUrl should success', async () => {
          const uploadEngine = await gqlClient.sdk.createEngine(
            {
              input: {
                name: citestMarker + '-upload-engine-' + uuidv4(),
                categoryId: engineCategoryId,
                deploymentModel: DeploymentModel.FullyNetworkIsolated
              }
            },
            adminRequestHeadersOrg1
          );

          uploadEngineData = uploadEngine?.data?.createEngine;
          expect(uploadEngineData?.id).toBeDefined();
          engineIdsOrg1.push(uploadEngineData?.id);

          await buildAndDeployEngine(
            uploadEngineData?.id,
            adminRequestHeadersOrg1
          );

          await gqlClient.sdk.updateEngine(
            {
              input: {
                id: uploadEngineData?.id!,
                standaloneJobTemplates: [
                  {
                    type: JobTemplateEnumType.Upload,
                    template: testTemplateTextUploadChunk!
                  }
                ]
              }
            },
            adminRequestHeadersOrg1
          );

          const result = await gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                engineId: uploadEngineData?.id!,
                clusterId: testCluster.id,
                uploadUrl: 'http://localhost',
                priority: 1
              }
            },
            adminRequestHeadersOrg1
          );

          expect(result?.data?.launchSingleEngineJob?.clusterId).toBe(
            testCluster.id
          );

          const jobId = _.get(result, 'data.launchSingleEngineJob.id');
          expect(jobId).toBeDefined();

          jobIdListsOrg1.push(jobId);
        });

        it('Admin launch job with inaccessible targetId should fail', async () => {
          const res = gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                targetId: testTdoOrg2.id,
                engineId: testEngine.id,
                clusterId: testCluster.id
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(res).rejects.toThrow(
            'object does not exist or access not granted'
          );
        });

        it('Admin launch job using not existed clusterId should fail', async () => {
          const res = gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                targetId: testTdo.id,
                engineId: testEngine.id,
                clusterId: uuidv4()
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(res).rejects.toThrow('The cluster was not found');
        });

        xit('admin launch job using inaccessible clusterId should fail', async () => {
          const res = gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                targetId: testTdoOrg2.id,
                engineId: testEngine.id,
                clusterId: testClusterOrg2.id
              }
            },
            adminRequestHeadersOrg1
          );

          await expect(res).rejects.toThrow('The cluster was not found');
        });

        it('Admin launch job without clusterId should success', async () => {
          const result = await gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                engineId: testEngine.id,
                targetId: testTdo.id,
                priority: 1
              }
            },
            adminRequestHeadersOrg1
          );

          expect(result?.data?.launchSingleEngineJob?.id).toBeDefined();
          const jobId = _.get(result, 'data.launchSingleEngineJob.id', '');
          jobIdListsOrg1.push(jobId);
        });

        it('admin launch job using valid clusterId should success', async () => {
          const result = await gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                engineId: testEngine.id,
                targetId: testTdo.id,
                clusterId: testCluster.id,
                priority: 1
              }
            },
            adminRequestHeadersOrg1
          );

          expect(result?.data?.launchSingleEngineJob?.id).toBeDefined();
          if (testCluster) {
            expect(result?.data?.launchSingleEngineJob?.clusterId).toEqual(
              testCluster.id
            );
          }

          const jobId = _.get(result, 'data.launchSingleEngineJob.id', '');
          jobIdListsOrg1.push(jobId);
        });

        it('admin launch job with both targetId, uploadUrl should success', async () => {
          const result = await gqlClient.sdk.launchSingleEngineJob(
            {
              input: {
                targetId: testTdo.id,
                engineId: testEngine.id,
                clusterId: testCluster.id,
                uploadUrl: 'http://localhost',
                priority: 1
              }
            },
            adminRequestHeadersOrg1
          );

          expect(result?.data?.launchSingleEngineJob?.id).toBeDefined();

          const jobId = _.get(result, 'data.launchSingleEngineJob.id', '');
          jobIdListsOrg1.push(jobId);
        });
      });

      afterAll(async () => {
        let deleteResult: any;
        // cancel all created jobs
        if (jobIdListsOrg1.length > 0) {
          for (let jobId of jobIdListsOrg1) {
            await safe(`cancel job ${jobId}`, async () =>
              gqlClient.sdk.cancelJob({ id: jobId }, adminRequestHeadersOrg1)
            );
          }
        }

        // delete all created engines
        if (engineIdsOrg1.length > 0) {
          for (let engineId of engineIdsOrg1) {
            await safe(`delete engine ${engineId}`, async () =>
              gqlClient.sdk.deleteEngine(
                {
                  id: engineId
                },
                adminRequestHeadersOrg1
              )
            );
          }
        }

        if (engineIdsOrg2.length > 0) {
          for (let engineId of engineIdsOrg2) {
            await safe(`delete engine ${engineId}`, async () =>
              gqlClient.sdk.deleteEngine(
                {
                  id: engineId
                },
                adminRequestHeadersOrg2
              )
            );
          }
        }

        // delete tdo
        if (testTdo) {
          await safe(`delete tdo ${testTdo.id}`, async () =>
            gqlClient.sdk.deleteTDO(
              {
                id: testTdo.id
              },
              adminRequestHeadersOrg1
            )
          );
        }

        if (testTdoOrg2) {
          await safe(`delete tdo ${testTdoOrg2.id}`, async () =>
            gqlClient.sdk.deleteTDO(
              {
                id: testTdoOrg2.id
              },
              adminRequestHeadersOrg2
            )
          );
        }

        if (publicTdo) {
          await safe(`delete tdo ${publicTdo.id}`, async () =>
            gqlClient.sdk.deleteTDO({
              id: publicTdo.id
            })
          );
        }

        if (testCluster?.id) {
          await safe(`delete cluster ${testCluster.id}`, async () =>
            gqlClient.sdk.deleteCluster(
              { id: testCluster.id },
              adminRequestHeadersOrg1
            )
          );
        }

        if (testClusterOrg2?.id) {
          await safe(`delete cluster ${testClusterOrg2.id}`, async () =>
            gqlClient.sdk.deleteCluster(
              { id: testClusterOrg2.id },
              adminRequestHeadersOrg2
            )
          );
        }

        if (rbac?.authGroupId) {
          await safe('delete auth group', async () =>
            gqlClient.sdk.authGroupDelete(
              { id: rbac.authGroupId! },
              adminRequestHeadersOrg1
            )
          );
        }

        if (rbac?.authPermissionSetId) {
          await safe('delete auth permission set', async () =>
            gqlClient.sdk.authPermissionSetDelete(
              { id: rbac.authPermissionSetId! },
              adminRequestHeadersOrg1
            )
          );
        }

        if (userIds.length > 0) {
          for (const userId of userIds) {
            await safe(`delete user ${userId}`, async () => {
              deleteResult = await gqlClient.sdk.deleteUser({
                id: userId
              });
              expect(deleteResult?.data?.deleteUser?.id).toBe(userId);
            });
          }
        }

        if (orgId1!) {
          await safe(`delete org ${orgId1}`, async () =>
            gqlClient.sdk.updateOrganization({
              input: {
                id: orgId1!,
                status: OrganizationStatus.Deleted
              }
            })
          );
        }

        if (orgId2!) {
          await safe(`delete org ${orgId2}`, async () =>
            gqlClient.sdk.updateOrganization({
              input: {
                id: orgId2!,
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
  const createOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuidv4()}`,
      businessUnit: 'Legal',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
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
        name: `${citestMarker}-admin-user-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        name: `${citestMarker}-regular-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };

  return createOrgAndUserInput;
}

function getOrg2AndUserInput(isEnabledOlp = false) {
  const createOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org2-folder-rbac-${version}-${uuidv4()}`,
      businessUnit: 'Legal',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
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
        name: `${citestMarker}-admin2-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? '' : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      }
    ]
  };

  return createOrgAndUserInput;
}

async function buildAndDeployEngine(
  engineId: any,
  options: any,
  isPublic = false
) {
  // Create engine build and deploy it
  const engineBuildRes = await gqlClient.sdk.createEngineBuild(
    {
      input: {
        engineId: engineId,
        taskRuntime: { nodeRed: true },
        manifest: { runtime: 'NodeRed' }
      }
    },
    { options }
  );
  const engineBuildId = engineBuildRes?.data?.createEngineBuild?.id;
  expect(engineBuildId).toBeDefined();

  const buildEngineActionListToUse = isPublic
    ? publicBuildEngineActionList
    : buildEngineActionList;

  for (let action of buildEngineActionListToUse) {
    await gqlClient.sdk.updateEngineBuild({
      input: {
        id: engineBuildId!,
        engineId: engineId,
        action: action[0] as BuildUpdateAction
      }
    });
  }
}
