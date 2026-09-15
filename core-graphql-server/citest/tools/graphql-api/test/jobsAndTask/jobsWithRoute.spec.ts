// @ts-ignore
import { v4 as uuidv4 } from 'uuid';

import {
  AuthType,
  buildRequestHeaders,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';

import _ from 'lodash';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import {
  BuildUpdateAction,
  DeploymentModel,
  JobStatus,
  UpdateJobsStatus,
  TaskFailureReason,
  OrganizationStatus,
  OrganizationType,
  RootFolderType,
  IoFolderMode,
  IoFolderType
} from '../../src/gql';

const citestMarker = (globalThis as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

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

describe('citest_jobs: Job Test With Route input', () => {
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
    const jobIds: string[] = [];
    let testOrg: any;
    let testTdo: any;
    let testEngine: any;
    let adminUser: any;
    const engineIdsOrg1: string[] = [];

    const testData: any = {
      superAdminFolderId: null,
      rootFolderData: null,
      folder: null,
      jobId: null
    };

    describe(`jobs test with isEnabledOlp = ${isEnabledOlp}`, () => {
      beforeAll(async () => {
        const orgInput = getOrgAndUserInput(isEnabledOlp);

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

        adminRequestHeaders = await buildRequestHeaders(gqlClient, {
          userName: adminUserInput.name,
          password: adminUserInput.password
        });

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
      });

      it('Create job with not existed route folderReferenceId should fail', async () => {
        const job = gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              targetId: testTdo.id,
              tasks: [{ engineId: testEngine.id }],
              routes: [
                {
                  parentIoFolderReferenceId: uuidv4()
                }
              ]
            }
          },
          adminRequestHeaders
        );
        await expect(job).rejects.toThrow(/ioFolder.*was not found/);
      });

      it('Create job with inaccessible route folderReferenceId should fail', async () => {
        let createRootResponse;
        let superAdminRootFolders = await gqlClient.sdk.rootFolders({
          rootFolderType: RootFolderType.Cms
        });

        let folderId =
          superAdminRootFolders?.data?.rootFolders?.[0]?.childFolders
            ?.records?.[0]?.id;

        if (!folderId) {
          createRootResponse = await gqlClient.sdk.createRootFolders({
            rootFolderType: RootFolderType.Cms
          });

          folderId = createRootResponse?.data?.createRootFolders?.[0]?.id;
        }

        testData.superAdminFolderId = folderId;

        let treeObjectId =
          createRootResponse?.data?.createRootFolders?.[0]?.treeObjectId;
        testData.superAdminFolderTreeObjectId = treeObjectId;

        const job = gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              targetId: testTdo.id,
              tasks: [{ engineId: testEngine.id }],
              routes: [
                {
                  parentIoFolderReferenceId: folderId
                }
              ]
            }
          },
          adminRequestHeaders
        );

        await expect(job).rejects.toThrow(/ioFolder.*was not found/);
      });

      it('Create job with invalid routes should fail', async () => {
        const job = gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              targetId: testTdo.id,
              tasks: [{ engineId: testEngine.id }],
              routes: [
                {
                  childIoFolderReferenceId: 'invalid-id'
                }
              ]
            }
          },
          adminRequestHeaders
        );

        await expect(job).rejects.toThrow(/ioFolder.*was not found/);
      });

      it('Create job with shared folderReferenceId should success', async () => {
        // Share folder from super admin to test org
        const shareRes = await gqlClient.sdk.shareFolder({
          input: {
            folderId: testData.superAdminFolderId,
            writeOrganizationIds: [+testOrg.id]
          }
        });

        expect(shareRes?.data?.shareFolder?.id).toBe(
          testData.superAdminFolderId
        );

        // Create job with route
        const jobRes = await gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              targetId: testTdo.id,
              tasks: [
                {
                  engineId: testEngine.id,
                  ioFolders: [
                    {
                      referenceId: testData.superAdminFolderId,
                      mode: IoFolderMode.Chunk,
                      type: IoFolderType.Output
                    }
                  ]
                }
              ],
              routes: [
                {
                  parentIoFolderReferenceId: testData.superAdminFolderId
                }
              ]
            }
          },
          adminRequestHeaders
        );

        const job = jobRes?.data?.createJob;

        expect(job).toBeDefined();
        jobIds.push(job?.id!);
        expect(job?.name).toContain(`${citestMarker}-job-`);
        expect(job?.tasks?.records?.length).toBe(1);
        expect(job?.routes?.length).toBe(1);
        expect(job?.routes?.[0]?.parentIoFolderReferenceId).toBe(
          testData.superAdminFolderId
        );

        await safe(`cancel job ${job?.id}`, async () => {
          await gqlClient.sdk.cancelJob({ id: job?.id! }, adminRequestHeaders);
          _.pull(jobIds, job?.id!);
        });
      });

      it('Create job with owned folderReferenceId should success', async () => {
        const rootFolder = await gqlClient.sdk.createRootFolders(
          {
            rootFolderType: RootFolderType.Cms
          },
          adminRequestHeaders
        );

        const rootId = rootFolder?.data?.createRootFolders?.[0]?.id;
        expect(rootId).toBeDefined();
        testData.rootFolderData = rootFolder?.data?.createRootFolders?.[0];

        const folderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'folder for route testing',
              parentId: testData.rootFolderData.id,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminRequestHeaders
        );

        const folder = folderRes?.data?.createFolder;
        expect(folder).toBeDefined();

        testData.folder = folder;

        const jobRes = await gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              targetId: testTdo.id,
              tasks: [
                {
                  engineId: testEngine.id,
                  ioFolders: [
                    {
                      referenceId: testData.folder.id,
                      mode: IoFolderMode.Chunk,
                      type: IoFolderType.Output
                    }
                  ]
                }
              ],
              routes: [
                {
                  parentIoFolderReferenceId: folder?.id
                }
              ]
            }
          },
          adminRequestHeaders
        );

        const job = jobRes?.data?.createJob;

        expect(job).toBeDefined();
        jobIds.push(job?.id!);
        expect(job?.routes?.length).toBe(1);

        await safe(`cancel job ${job?.id}`, async () => {
          await gqlClient.sdk.cancelJob({ id: job?.id! }, adminRequestHeaders);
          _.pull(jobIds, job?.id!);
        });
      });

      describe('Update and manage job', () => {
        beforeEach(async () => {
          const jobRes = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                tasks: [{ engineId: testEngine.id }]
              }
            },
            adminRequestHeaders
          );

          const job = jobRes?.data?.createJob;
          jobIds.push(job?.id!);
          testData.jobId = job?.id;
        });

        afterEach(async () => {
          if (testData.jobId) {
            await safe(`cancel job ${testData.jobId}`, async () => {
              await gqlClient.sdk.cancelJob(
                { id: testData.jobId },
                adminRequestHeaders
              );
              _.pull(jobIds, testData.jobId);
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
            adminRequestHeaders
          );

          const jobs = res?.data?.updateJobs?.records;

          expect(jobs?.length).toBe(1);
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
            adminRequestHeaders
          );

          const jobs = res?.data?.updateJobs?.records;

          expect(jobs?.length).toBe(1);
        });

        it('update Job notification Uri', async () => {
          const notificationUri = 'http://localhost:3000/notify-job';

          const updateJobNotification = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [testData.jobId],
                status: UpdateJobsStatus.Queued,
                notificationUris: [notificationUri]
              }
            },
            adminRequestHeaders
          );

          const jobs = updateJobNotification?.data?.updateJobs?.records;
          expect(jobs?.length).toBe(1);
          expect(jobs?.[0]?.id).toBe(testData.jobId);
          expect(jobs?.[0]?.notificationUris?.includes(notificationUri)).toBe(
            true
          );
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
            adminRequestHeaders
          );

          const jobs = res?.data?.updateJobs?.records;

          expect(jobs?.length).toBe(0);
        });

        it('cancel job', async () => {
          const res = await gqlClient.sdk.cancelJob(
            {
              id: testData.jobId
            },
            adminRequestHeaders
          );

          const job = res?.data?.cancelJob;

          expect(job?.id).toEqual(testData.jobId);
          _.pull(jobIds, testData.jobId);
          testData.jobId = null;
        });

        xit('retry job', async () => {
          const res = await gqlClient.sdk.retryJob(
            {
              id: testData.jobId
            },
            adminRequestHeaders
          );

          const job = res?.data?.retryJob;
          expect(job).toBeDefined();
          expect(job?.status).toEqual('pending');
        });
      });

      afterAll(async () => {
        // cancel all created jobs
        if (jobIds.length > 0) {
          const cancelPromises = jobIds.map((jobId) =>
            safe(`cancel job ${jobId}`, async () =>
              gqlClient.sdk.cancelJob({ id: jobId }, adminRequestHeaders)
            )
          );
          await Promise.all(cancelPromises);
        }

        // delete folder
        if (testData.folder) {
          await safe(`delete folder ${testData.folder.id}`, async () =>
            gqlClient.sdk.deleteFolder(
              {
                input: {
                  id: testData.folder.id,
                  orderIndex: 0
                }
              },
              adminRequestHeaders
            )
          );
        }

        // delete all created engines
        if (engineIdsOrg1.length > 0) {
          const listPromises = engineIdsOrg1.map((engineId) =>
            safe(`delete engine ${engineId}`, async () =>
              gqlClient.sdk.deleteEngine({ id: engineId }, adminRequestHeaders)
            )
          );
          await Promise.all(listPromises);
        }

        // delete tdo
        if (testTdo) {
          await safe(`delete tdo ${testTdo.id}`, async () =>
            gqlClient.sdk.deleteTDO({ id: testTdo.id }, adminRequestHeaders)
          );
        }

        if (adminUser?.id) {
          await safe(`delete user ${adminUser.id}`, async () =>
            gqlClient.sdk.deleteUser({
              id: adminUser.id
            })
          );
        }

        if (testOrg.id) {
          await safe(`delete org ${testOrg.id}`, async () =>
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
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
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

  if (!engineBuildId) {
    throw new Error('Failed to create engine build');
  }

  const actions = isPublic
    ? publicBuildEngineActionList
    : buildEngineActionList;

  let build;

  for (const action of actions) {
    build = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildId,
          engineId,
          action: action[0] as BuildUpdateAction
        }
      },
      headers
    );
  }

  return build;
}
