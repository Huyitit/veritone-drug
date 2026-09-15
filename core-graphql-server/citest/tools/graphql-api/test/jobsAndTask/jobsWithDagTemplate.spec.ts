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
  OrganizationStatus,
  OrganizationType,
  UpdateJobsStatus,
  TaskFailureReason
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

const sampleDagTemplate = `
{
 "tasks": [
   {
     "engineId": "YOUR_ENGINE_ID",
     "executionPreferences": {
       "parentCompleteBeforeStarting": true
     },
     "ioFolders": [
       {
         "referenceId": "ow-input",
         "mode": "chunk",
         "type": "input"
       }
     ]
   }
 ]
}
`;

describe('citest_jobs: Job Test With dagTemplate', () => {
  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );

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
    let jobIdsOrg1: string[] = [];
    let adminHeadersOrg1: Record<string, string>;
    let regularHeadersOrg1: Record<string, string>;

    let testOrg1: any;
    let orgId1: any;

    let testTdo: any;
    let testEngine: any;

    let adminUser: any;
    let regularUser: any;
    const engineIdsOrg1: string[] = [];
    const userIds: string[] = [];

    const testData: any = {
      dagTemplateId: null,
      superAdminDagTemplateId: null,
      jobId: null
    };

    describe(`jobs test with isEnabledOlp = ${isEnabledOlp}`, () => {
      beforeAll(async () => {
        const orgInput = getOrgAndUserInput(isEnabledOlp);

        const createOrgRes = await gqlClient.sdk.createOrganization({
          input: orgInput.orgInput
        });

        testOrg1 = createOrgRes?.data?.createOrganization;
        orgId1 = testOrg1?.id;

        //create admin user
        const adminUserInput = {
          ...orgInput.userInputs[0],
          organizationId: orgId1
        };

        const adminUserRes = await gqlClient.sdk.createUser({
          input: adminUserInput
        });

        adminUser = adminUserRes?.data?.createUser;
        userIds.push(adminUser?.id);

        adminHeadersOrg1 = await buildRequestHeaders(gqlClient, {
          userName: adminUserInput.name,
          password: adminUserInput.password
        });

        //create TDO
        const createTdo = await gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-test-tdo-${uuidv4()}`,
              ...tdoAssetInput
            }
          },
          adminHeadersOrg1
        );

        testTdo = createTdo?.data?.createTDOWithAsset;

        //create engine
        const createEngine = await gqlClient.sdk.createEngine(
          {
            input: {
              name: `${citestMarker}-engine-${uuidv4()}`,
              categoryId: engineCategoryId,
              deploymentModel: DeploymentModel.FullyNetworkIsolated
            }
          },
          adminHeadersOrg1
        );

        testEngine = createEngine?.data?.createEngine;
        engineIdsOrg1.push(testEngine.id);

        await buildAndDeployEngine(testEngine.id, adminHeadersOrg1);

        //create regular user
        const regularUserInput = {
          ...orgInput.userInputs[1],
          organizationId: orgId1
        };

        const regularUserRes = await gqlClient.sdk.createUser({
          input: regularUserInput
        });

        regularUser = regularUserRes?.data?.createUser;
        userIds.push(regularUser?.id);

        regularHeadersOrg1 = await buildRequestHeaders(gqlClient, {
          userName: regularUserInput.name,
          password: regularUserInput.password
        });
      });

      it('Create dagTemplate', async () => {
        const dag = sampleDagTemplate.replace('YOUR_ENGINE_ID', testEngine.id);

        const dagTemplateRes = await gqlClient.sdk.createDagTemplate(
          {
            input: {
              name: `${citestMarker}-dag-${uuidv4()}`,
              dag,
              dagTemplateLanguage: 'Handlebars',
              tags: ['foo', 'bar']
            }
          },
          adminHeadersOrg1
        );

        const dagTemplate = dagTemplateRes?.data?.createDagTemplate;

        expect(dagTemplate).toBeDefined();
        expect(dagTemplate?.name).toContain(`${citestMarker}-dag-`);
        expect(dagTemplate?.tags).toEqual(['foo', 'bar']);

        testData.dagTemplateId = dagTemplate?.id;
      });

      it('Create Job with not existed dagTemplate should fail', async () => {
        const job = gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              dagTemplateId: uuidv4(),
              targetId: testTdo.id,
              tasks: [{ engineId: testEngine.id }]
            }
          },
          adminHeadersOrg1
        );
        await expect(job).rejects.toThrow(/DAG template was not found/);
      });

      it('Create Job with inaccessible dagTemplate should fail', async () => {
        const superDagRes = await gqlClient.sdk.createDagTemplate({
          input: {
            name: `${citestMarker}-dag-${uuidv4()}`,
            dag: sampleDagTemplate,
            dagTemplateLanguage: 'Handlebars',
            tags: ['foo', 'bar']
          }
        });

        const superDag = superDagRes?.data?.createDagTemplate;
        testData.superAdminDagTemplateId = superDag?.id;

        const job = gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              dagTemplateId: superDag?.id,
              targetId: testTdo.id,
              tasks: [{ engineId: testEngine.id }]
            }
          },
          adminHeadersOrg1
        );
        await expect(job).rejects.toThrow(/DAG template was not found/);
      });

      it('Create Job with owned dagTemplate should success', async () => {
        const jobRes = await gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              dagTemplateId: testData.dagTemplateId,
              targetId: testTdo.id,
              tasks: [{ engineId: testEngine.id }]
            }
          },
          adminHeadersOrg1
        );

        const job = jobRes?.data?.createJob;

        expect(job).toBeDefined();
        const jobId = job?.id;
        expect(jobId).toBeTruthy();
        jobIdsOrg1.push(jobId!);
        expect(job?.name).toContain(`${citestMarker}-job-`);
        expect(job?.tasks?.records?.length).toBe(1);

        await safe(`cancel job ${jobId}`, async () => {
          await gqlClient.sdk.cancelJob({ id: jobId! }, adminHeadersOrg1);
          _.pull(jobIdsOrg1, jobId!);
        });
      });

      describe('Update and manage job', () => {
        beforeEach(async () => {
          const jobRes = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                dagTemplateId: testData.dagTemplateId,
                targetId: testTdo.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminHeadersOrg1
          );

          const job = jobRes?.data?.createJob;

          expect(job).toBeDefined();
          expect(job?.tasks?.records?.length).toBe(1);

          testData.jobId = job?.id;
          jobIdsOrg1.push(job?.id!);
        });

        afterEach(async () => {
          if (testData.jobId) {
            const jobId = testData.jobId;

            await safe(`cancel job ${jobId}`, async () => {
              await gqlClient.sdk.cancelJob({ id: jobId }, adminHeadersOrg1);
              _.pull(jobIdsOrg1, jobId);
            });

            testData.jobId = null;
          }
        });

        it('update Jobs status', async () => {
          const res = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [testData.jobId],
                status: UpdateJobsStatus.Queued
              }
            },
            adminHeadersOrg1
          );

          const jobs = res?.data?.updateJobs?.records;

          expect(jobs?.length).toBe(1);
          expect(jobs?.[0]?.status).toMatch(/queued|running/);
        });

        it('update Job taskOutput', async () => {
          const res = await gqlClient.sdk.updateJobs(
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
            adminHeadersOrg1
          );

          const jobs = res?.data?.updateJobs?.records;

          expect(jobs?.length).toBe(1);
          expect(['queued', 'running']).toContain(jobs?.[0]?.status);
        });

        it('update Job notification Uri', async () => {
          const uri = 'http://localhost:3000/notify-job';

          const res = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [testData.jobId],
                status: UpdateJobsStatus.Queued,
                notificationUris: [uri]
              }
            },
            adminHeadersOrg1
          );

          const jobs = res?.data?.updateJobs?.records;

          expect(jobs?.[0]?.notificationUris!.includes(uri)).toBe(true);
        });

        it('update Job with incorrect requiredCurrentStatus should fail', async () => {
          const res = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [testData.jobId],
                status: UpdateJobsStatus.Queued,
                requiredCurrentStatus: JobStatus.Failed
              }
            },
            adminHeadersOrg1
          );

          const jobs = res?.data?.updateJobs?.records;

          expect(jobs?.length).toBe(0);
        });

        it('cancel job', async () => {
          const res = await gqlClient.sdk.cancelJob(
            {
              id: testData.jobId
            },
            adminHeadersOrg1
          );

          const job = res?.data?.cancelJob;

          expect(job?.id).toEqual(testData.jobId);
          _.pull(jobIdsOrg1, testData.jobId);
          testData.jobId = null;
        });

        it('retry job', async () => {
          const res = await gqlClient.sdk.retryJob(
            {
              id: testData.jobId
            },
            adminHeadersOrg1
          );

          const job = _.get(res, 'data.retryJob') ?? res;

          expect(job.status).toEqual('pending');
          const retryJobId = _.get(job, 'id')!;
          expect(retryJobId).toBeTruthy();
          jobIdsOrg1.push(retryJobId);
        });
      });

      afterAll(async () => {
        if (jobIdsOrg1.length > 0) {
          for (let jobId of jobIdsOrg1) {
            await safe(`cancel job ${jobId}`, async () =>
              gqlClient.sdk.cancelJob({ id: jobId }, adminHeadersOrg1)
            );
          }
        }

        if (testData.dagTemplateId) {
          await safe(`delete dagTemplate ${testData.dagTemplateId}`, async () =>
            gqlClient.sdk.deleteDagTemplate(
              { id: testData.dagTemplateId },
              adminHeadersOrg1
            )
          );
        }

        if (testData.superAdminDagTemplateId) {
          await safe(`delete superAdminDagTemplate`, async () =>
            gqlClient.sdk.deleteDagTemplate({
              id: testData.superAdminDagTemplateId
            })
          );
        }

        for (const engineId of engineIdsOrg1) {
          await safe(`delete engine ${engineId}`, async () =>
            gqlClient.sdk.deleteEngine({ id: engineId }, adminHeadersOrg1)
          );
        }

        if (testTdo) {
          await safe(`delete tdo ${testTdo.id}`, async () =>
            gqlClient.sdk.deleteTDO({ id: testTdo.id }, adminHeadersOrg1)
          );
        }

        if (userIds.length > 0) {
          for (const userId of _.uniq(_.compact(userIds))) {
            await safe(`delete user ${userId}`, async () =>
              gqlClient.sdk.deleteUser({ id: userId })
            );
          }
        }

        if (testOrg1?.id) {
          await safe(`delete org ${testOrg1.id}`, async () =>
            gqlClient.sdk.updateOrganization({
              input: {
                id: testOrg1.id,
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
          '032218c3-d47e-4287-9d16-7bb867c01266',
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
        ].filter(Boolean)
      },
      {
        name: `${citestMarker}-regular-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828']
      }
    ]
  };
}

async function buildAndDeployEngine(
  engineId: string,
  headers: Record<string, string>,
  isPublic = false
) {
  //create engine build
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

  const buildActions = isPublic
    ? publicBuildEngineActionList
    : buildEngineActionList;

  let build: any;

  for (const action of buildActions) {
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
