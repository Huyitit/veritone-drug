// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import {
  AuthType,
  buildRequestHeaders,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import config from '../../src/config';
import {
  BuildUpdateAction,
  DeploymentModel,
  JobStatus,
  OrderDirection,
  OrganizationStatus,
  OrganizationType,
  TaskFailureReason,
  TemporalDataObjectOrderBy,
  UpdateJobsStatus
} from '../../src/gql';
import _ from 'lodash';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';

const citestMarker = (globalThis as any).citestMarker || 'citest-should-delete';
const env = config.env;
const version = 'v1';

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

let gqlClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;

const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

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
    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );

    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;

    // ensure we have a session token and can query current user
    const myInfo = await gqlClient.sdk.me();
    expect(myInfo?.data?.me).toBeDefined();
  });

  afterAll(async () => {
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  describe.each([false, true])('jobs ', (isEnabledOlp) => {
    const tdoName = `${citestMarker}-tdo-${uuidv4()}`;
    let adminRequestHeadersOrg1: Record<string, string>;
    let regularRequestHeadersOrg1: Record<string, string>;
    const jobIdListsOrg1: string[] = [];
    const engineIdsOrg1: string[] = [];
    const userIds: any = [];

    const testData: any = { dagTemplateId: null };
    let orgId1: any;
    let testOrg1: any;
    let testTdo: any;
    let autoCreatedTdo: any;
    let testEngine: any;
    let regularUser: any;
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

        // create admin user
        const createAdminUserOrg1Result = await gqlClient.sdk.createUser({
          // @ts-ignore
          input: adminUserOrg1
        });
        expect(createAdminUserOrg1Result?.data?.createUser?.id).toBeDefined();
        userIds.push(createAdminUserOrg1Result?.data?.createUser?.id);

        //Login for Admin User Org1
        adminRequestHeadersOrg1 = await buildRequestHeaders(gqlClient, {
          userName: adminUserOrg1.name,
          password: adminUserOrg1.password
        });

        const createTdo = await gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-test-tdo-${uuidv4()}`,
              ...tdoAssetInput
            }
          },
          adminRequestHeadersOrg1
        );
        testTdo = createTdo?.data?.createTDOWithAsset;

        const createEngine = await gqlClient.sdk.createEngine(
          {
            input: {
              name: citestMarker + '-engine-' + uuidv4(),
              categoryId: engineCategoryId,
              deploymentModel: DeploymentModel.FullyNetworkIsolated
            }
          },
          adminRequestHeadersOrg1
        );

        testEngine = createEngine?.data?.createEngine;
        engineIdsOrg1.push(testEngine.id);
        await buildAndDeployEngine(testEngine?.id, adminRequestHeadersOrg1);

        const regularUserOrg1 = {
          ...getOrgAndUserInput(isEnabledOlp).userInputs[1],
          organizationId: orgId1!
        };

        // create regular user Org1
        const createRegularUserOrg1Result = await gqlClient.sdk.createUser({
          // @ts-ignore
          input: regularUserOrg1
        });

        regularUser = createRegularUserOrg1Result?.data?.createUser;
        userIds.push(regularUser?.id);

        //Login for Regular User Org1
        regularRequestHeadersOrg1 = await buildRequestHeaders(gqlClient, {
          userName: regularUserOrg1.name,
          password: regularUserOrg1.password
        });
      });

      it('Create Job with invalid TDO input should fail', async () => {
        const res = gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              tasks: [{ engineId: testEngine.id }],
              // @ts-ignore
              target: { name: tdoName, isPublic: 'yes' }
            }
          },
          adminRequestHeadersOrg1
        );

        await expect(res).rejects.toThrow('invalid value');
      });

      it('No Job and TDO created (from previous step)', async () => {
        const tdoSearch = await gqlClient.sdk.temporalDataObjects(
          {
            orderBy: TemporalDataObjectOrderBy.CreatedDateTime,
            orderDirection: OrderDirection.Desc,
            includePublic: false
          },
          adminRequestHeadersOrg1
        );
        const tdos = tdoSearch?.data?.temporalDataObjects?.records ?? [];
        expect(tdos.length).toBe(1);
        expect(tdos[0]?.id).toBe(testTdo.id);
      });

      it('Create Job with valid TDO input should success', async () => {
        const newJobRes = await gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              tasks: [{ engineId: testEngine?.id }],
              target: { name: tdoName }
            }
          },
          adminRequestHeadersOrg1
        );
        const newJob = newJobRes?.data?.createJob;
        expect(newJob).toBeDefined();
        expect(newJob?.id).toBeDefined();
        expect(newJob?.name).toContain(`${citestMarker}-job-`);
        testData.jobId = newJob?.id;
        jobIdListsOrg1.push(newJob?.id!);
      });

      it('Job target must be an auto created TDO', async () => {
        const tdoSearch = await gqlClient.sdk.temporalDataObjects(
          {
            orderBy: TemporalDataObjectOrderBy.CreatedDateTime,
            orderDirection: OrderDirection.Desc,
            includePublic: false
          },
          adminRequestHeadersOrg1
        );
        const tdos = tdoSearch?.data?.temporalDataObjects?.records ?? [];
        autoCreatedTdo = tdos.find((tdo: any) => tdo.name?.includes(tdoName));
        expect(autoCreatedTdo).toBeDefined();

        await safe('cancel job', async () =>
          gqlClient.sdk.cancelJob?.(
            { id: testData.jobId },
            adminRequestHeadersOrg1
          )
        );

        _.pull(jobIdListsOrg1, testData.jobId);
        testData.jobId = null;
      });

      describe('Update and manage job', () => {
        beforeEach(async () => {
          const jobRes = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                tasks: [{ engineId: testEngine?.id }],
                target: { name: tdoName }
              }
            },
            adminRequestHeadersOrg1
          );
          const job = jobRes?.data?.createJob;

          expect(job).toBeDefined();
          expect(job?.id).toBeDefined();
          expect(job?.name).toContain(`${citestMarker}-job-`);
          expect(job?.tasks?.records?.length).toBe(1);
          jobIdListsOrg1.push(job?.id!);
          testData.jobId = job?.id;
        });

        afterEach(async () => {
          if (testData.jobId) {
            await safe('cancel job', async () => {
              await gqlClient.sdk.cancelJob?.(
                { id: testData.jobId },
                adminRequestHeadersOrg1
              );

              _.pull(jobIdListsOrg1, testData.jobId);
            });

            testData.jobId = null;
          }
        });

        it('update Jobs status', async () => {
          const updateJobRes = await gqlClient.sdk.updateJobs?.(
            {
              input: { ids: [testData.jobId], status: UpdateJobsStatus.Queued }
            },
            adminRequestHeadersOrg1
          );
          const updateJob = updateJobRes?.data?.updateJobs?.records;

          expect(updateJob).toBeDefined();
          expect(updateJob?.length).toBe(1);
          expect(updateJob?.[0]?.id).toBe(testData.jobId);
          expect(updateJob?.[0]?.status).toMatch(/queued|running/);
        });

        it('update Job taskOutput', async () => {
          const updateTaskOutputRes = await gqlClient.sdk.updateJobs?.(
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
            adminRequestHeadersOrg1
          );
          const updateTaskOutput =
            updateTaskOutputRes?.data?.updateJobs?.records;

          expect(updateTaskOutput).toBeDefined();
          expect(updateTaskOutput?.length).toBe(1);
          const jobStatus = updateTaskOutput?.[0]?.status;
          expect(updateTaskOutput?.[0]?.id).toBe(testData.jobId);
          expect(['queued', 'running']).toContain(jobStatus);
        });

        it('update Job notification Uri', async () => {
          const notificationUri = 'http://localhost:3000/notify-job';
          const updateJobNotificationRes = await gqlClient.sdk.updateJobs?.(
            {
              input: {
                ids: [testData.jobId],
                status: UpdateJobsStatus.Queued,
                notificationUris: [notificationUri]
              }
            },
            adminRequestHeadersOrg1
          );
          const updateJobNotification =
            updateJobNotificationRes?.data?.updateJobs?.records;

          expect(updateJobNotification).toBeDefined();
          expect(updateJobNotification?.length).toBe(1);
          expect(updateJobNotification?.[0]?.id).toBe(testData.jobId);
          const notificationUris =
            updateJobNotification?.[0]?.notificationUris ?? [];
          expect(notificationUris.includes(notificationUri)).toBe(true);
        });

        it('update Job with incorrect requiredCurrentStatus should fail', async () => {
          const updateJobRes2 = await gqlClient.sdk.updateJobs?.(
            {
              input: {
                ids: [testData.jobId],
                status: UpdateJobsStatus.Queued,
                requiredCurrentStatus: JobStatus.Failed
              }
            },
            adminRequestHeadersOrg1
          );
          const updateJob = updateJobRes2?.data?.updateJobs?.records;

          expect(updateJob?.length).toBe(0);
        });

        it('cancel job', async () => {
          const cancelledJobRes = await gqlClient.sdk.cancelJob?.(
            { id: testData.jobId },
            adminRequestHeadersOrg1
          );
          const cancelledJob = cancelledJobRes?.data?.cancelJob;
          expect(cancelledJob).toBeDefined();
          expect(cancelledJob?.id).toEqual(testData.jobId);
          _.pull(jobIdListsOrg1, testData.jobId);
          testData.jobId = null;
        });

        it('retry job', async () => {
          const retriedJobRes = await gqlClient.sdk.retryJob?.(
            { id: testData.jobId },
            adminRequestHeadersOrg1
          );
          const retriedJob = retriedJobRes?.data?.retryJob ?? retriedJobRes;
          expect(retriedJob).toBeDefined();
          expect(retriedJob.status).toEqual('pending');
          const jobId = _.get(retriedJobRes, 'data.retryJob.id', '');
          expect(jobId).toBeDefined();
          jobIdListsOrg1.push(jobId);
        });
      });

      afterAll(async () => {
        if (jobIdListsOrg1.length > 0) {
          for (const jobId of jobIdListsOrg1) {
            await safe('cancel job', async () =>
              gqlClient.sdk.cancelJob?.({ id: jobId }, adminRequestHeadersOrg1)
            );
          }
        }

        if (engineIdsOrg1.length > 0) {
          for (const engineId of engineIdsOrg1) {
            await safe('delete engine', async () =>
              gqlClient.sdk.deleteEngine(
                { id: engineId },
                adminRequestHeadersOrg1
              )
            );
          }
        }

        if (testTdo) {
          await safe('delete tdo', async () =>
            gqlClient.sdk.deleteTDO({ id: testTdo.id }, adminRequestHeadersOrg1)
          );
        }

        if (autoCreatedTdo) {
          await safe('delete auto created tdo', async () =>
            gqlClient.sdk.deleteTDO(
              { id: autoCreatedTdo.id },
              adminRequestHeadersOrg1
            )
          );
        }

        // delete users
        if (userIds.length > 0) {
          for (let userId of userIds) {
            await safe(`delete user ${userId}`, async () =>
              gqlClient.sdk.deleteUser({ id: userId })
            );
          }
        }

        if (testOrg1?.id)
          await safe('delete org', async () =>
            gqlClient.sdk.updateOrganization({
              input: {
                id: testOrg1.id,
                status: OrganizationStatus.Deleted
              }
            })
          );
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
        features: { enableOLPFeature: isEnabledOlp ? 'enabled' : 'disabled' }
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
        name: `${citestMarker}-admin-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266',
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
        ].filter((r) => r)
      },
      {
        name: `${citestMarker}-regular-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828']
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

  let build: any;
  for (let action of buildEngineActionListToUse) {
    build = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildId!,
          engineId: engineId,
          action: action[0] as BuildUpdateAction
        }
      },
      options
    );
  }
  return build;
}
