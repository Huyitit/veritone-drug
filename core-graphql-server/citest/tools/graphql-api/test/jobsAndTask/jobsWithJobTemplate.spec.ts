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
  IoFolderMode,
  IoFolderType,
  JobStatus,
  OrganizationStatus,
  OrganizationType,
  RootFolderType,
  TaskFailureReason,
  UpdateJobsStatus
} from '../../src/gql';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import _ from 'lodash';

const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;
const citestMarker = (globalThis as any).citestMarker || 'citest-should-delete';
const env = config.env;
const version = 'v1';

let gqlClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;

const engineCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

describe('citest_jobs: Job Test With job template, engine build, ioFolder', () => {
  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );

    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;

    const me = await gqlClient.sdk.me();
    expect(me?.data?.me).toBeDefined();
  });

  afterAll(async () => {
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  describe.each([false, true])('jobs', (isEnabledOlp) => {
    let adminHeadersOrg1: Record<string, string>;
    let regularHeadersOrg1: Record<string, string>;
    let adminHeadersOrg2: Record<string, string>;

    let testOrg1: any;
    let testOrg2: any;

    let adminUser1: any;
    let regularUser1: any;
    let adminUser2: any;

    let testTdo: any;
    let testEngine1: any;
    let testEngine2: any;
    let testEngineOrg2: any;

    let engineBuildId1: string;
    let engineBuildId2: string;
    let jobTemplateId: any;
    let jobTemplateId2: any;
    const engineIdsOrg1: string[] = [];
    const engineIdsOrg2: string[] = [];
    const jobIds: string[] = [];
    const testData: any = {
      jobWithBuild: null,
      jobWithIoFolder: null,
      jobFromTemplateId: null,
      folder: null,
      folder2: null
    };

    describe(`jobs test with isEnabledOlp = ${isEnabledOlp}`, () => {
      beforeAll(async () => {
        const orgInput = getOrgAndUserInput(isEnabledOlp);

        //Create Org1
        const org1Res = await gqlClient.sdk.createOrganization({
          input: orgInput.orgInput
        });

        testOrg1 = org1Res?.data?.createOrganization;

        const adminUserInput = {
          ...orgInput.userInputs[0],
          organizationId: testOrg1.id
        };

        //Create and login Admin user for Org1
        const adminRes = await gqlClient.sdk.createUser({
          input: adminUserInput
        });

        adminUser1 = adminRes?.data?.createUser;

        adminHeadersOrg1 = await buildRequestHeaders(gqlClient, {
          userName: adminUserInput.name,
          password: adminUserInput.password
        });

        //Create Test TDO for Org1
        const createTdoOrg1 = await gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              ...tdoAssetInput
            }
          },
          adminHeadersOrg1
        );

        testTdo = createTdoOrg1?.data?.createTDOWithAsset;

        //Create engine for Org1
        const engineResOrg1 = await gqlClient.sdk.createEngine(
          {
            input: {
              name: `${citestMarker}-engine-${uuidv4()}`,
              categoryId: engineCategoryId,
              deploymentModel: DeploymentModel.FullyNetworkIsolated
            }
          },
          adminHeadersOrg1
        );

        testEngine1 = engineResOrg1?.data?.createEngine;
        engineIdsOrg1.push(testEngine1.id);

        //login regular user for Org1
        const regularUserInput = {
          ...orgInput.userInputs[1],
          organizationId: testOrg1.id
        };

        const regularRes = await gqlClient.sdk.createUser({
          input: regularUserInput
        });

        regularUser1 = regularRes?.data?.createUser;

        regularHeadersOrg1 = await buildRequestHeaders(gqlClient, {
          userName: regularUserInput.name,
          password: regularUserInput.password
        });

        //Create Org2 for cross org test
        const orgRes2 = await gqlClient.sdk.createOrganization({
          input: {
            ...getOrgAndUserInput(false).orgInput,
            name: `${citestMarker}-org2-${version}-${uuidv4()}`
          }
        });

        testOrg2 = orgRes2?.data?.createOrganization;

        //Create admin user for Org2
        const adminUserInput2 = {
          ...getOrgAndUserInput(false).userInputs[0],
          organizationId: testOrg2.id,
          name: `${citestMarker}-admin-user-org2-${version}-${uuidv4()}@localhost`
        };

        const adminRes2 = await gqlClient.sdk.createUser({
          input: adminUserInput2
        });

        adminUser2 = adminRes2?.data?.createUser;

        adminHeadersOrg2 = await buildRequestHeaders(gqlClient, {
          userName: adminUserInput2.name,
          password: adminUserInput2.password
        });
      });

      describe('create job with engine build', () => {
        beforeAll(async () => {
          const engineRes = await gqlClient.sdk.createEngine(
            {
              input: {
                name: `${citestMarker}-engine-${uuidv4()}`,
                categoryId: engineCategoryId,
                deploymentModel: DeploymentModel.FullyNetworkIsolated
              }
            },
            adminHeadersOrg1
          );

          testEngine2 = engineRes?.data?.createEngine;
          engineIdsOrg1.push(testEngine2.id);

          const build = await buildAndDeployEngine(
            testEngine2.id,
            adminHeadersOrg1
          );
          engineBuildId2 = build?.data?.updateEngineBuild?.id!;
        });

        it('Create engine build', async () => {
          const engineBuildRes = await gqlClient.sdk.createEngineBuild(
            {
              input: {
                engineId: testEngine1.id,
                taskRuntime: { nodeRed: true },
                manifest: { runtime: 'NodeRed' }
              }
            },
            adminHeadersOrg1
          );
          engineBuildId1 = engineBuildRes?.data?.createEngineBuild?.id!;
        });

        it('Admin Create Job using not existed engine build should fail', async () => {
          const createJob = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                tasks: [
                  {
                    buildId: uuidv4(),
                    engineId: testEngine1.id
                  }
                ]
              }
            },
            adminHeadersOrg1
          );
          await expect(createJob).rejects.toThrow('not_found');
        });

        it('Admin create Job using not active engineId should fail', async () => {
          const job = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                tasks: [
                  {
                    buildId: engineBuildId1,
                    engineId: testEngine1.id
                  }
                ]
              }
            },
            adminHeadersOrg1
          );
          await expect(job).rejects.toThrow('must be in "deployed" status.');
        });

        it('Admin create Job using not active deployed engine build should fail', async () => {
          const submitEngineBuildRes = await gqlClient.sdk.updateEngineBuild(
            {
              input: {
                id: engineBuildId1,
                engineId: testEngine1.id,
                action: BuildUpdateAction.Submit
              }
            },
            adminHeadersOrg1
          );
          expect(submitEngineBuildRes?.data?.updateEngineBuild).toBeDefined();

          const job = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                tasks: [
                  {
                    buildId: engineBuildId1,
                    engineId: testEngine1.id
                  }
                ]
              }
            },
            adminHeadersOrg1
          );
          await expect(job).rejects.toThrow('must be in "deployed" status.');
        });

        xit('Admin create Job using not match engineId and buildId should fail', async () => {
          try {
            await gqlClient.sdk.createJob(
              {
                input: {
                  name: `${citestMarker}-job-${uuidv4()}`,
                  targetId: testTdo.id,
                  tasks: [
                    {
                      buildId: engineBuildId2,
                      engineId: testEngine1.id
                    }
                  ]
                }
              },
              adminHeadersOrg1
            );
          } catch (error: any) {
            const msg = error?.response?.errors?.[0]?.message;
            expect(msg).toContain('not_found');
          }
        });

        it('Admin create Job using match active engineId and buildId should success', async () => {
          const jobRes = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                tasks: [
                  {
                    buildId: engineBuildId2,
                    engineId: testEngine2.id
                  }
                ]
              }
            },
            adminHeadersOrg1
          );

          const job = jobRes?.data?.createJob;
          expect(job).toBeDefined();
          expect(job?.id).toBeDefined();
          testData.jobWithBuild = job;
          jobIds.push(job?.id!);
        });

        it('User cannot create Job', async () => {
          const job = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                tasks: [
                  {
                    buildId: engineBuildId2,
                    engineId: testEngine2.id
                  }
                ]
              }
            },
            regularHeadersOrg1
          );

          await expect(job).rejects.toThrow('not_allowed');
        });

        it('Get job success', async () => {
          const jobData = await gqlClient.sdk.job(
            {
              id: testData.jobWithBuild.id
            },
            adminHeadersOrg1
          );
          expect(jobData?.data?.job).toBeDefined();
          expect(jobData?.data?.job?.id).toEqual(testData.jobWithBuild.id);
        });
      });

      describe('create job with ioFolder', () => {
        beforeAll(async () => {
          await buildAndDeployEngine(testEngine1.id, adminHeadersOrg1);
        });

        it('Admin create folder', async () => {
          const rootFolderRes = await gqlClient.sdk.createRootFolders(
            {
              rootFolderType: RootFolderType.Cms
            },
            adminHeadersOrg1
          );
          testData.rootFolder = rootFolderRes?.data?.createRootFolders?.[0];

          const folderRes = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-folder-${uuidv4()}`,
                description: '',
                parentId: testData.rootFolder.id
              }
            },
            adminHeadersOrg1
          );
          expect(folderRes?.data?.createFolder).toBeDefined();
          testData.folder = folderRes?.data?.createFolder;

          //Root folder Org2
          const rootFolderRes2 = await gqlClient.sdk.createRootFolders(
            {
              rootFolderType: RootFolderType.Cms
            },
            adminHeadersOrg2
          );
          const rootFolderOrg2 = rootFolderRes2?.data?.createRootFolders?.[0];
          testData.rootFolderOrg2 = rootFolderOrg2;

          const newFolderRes2 = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-folder2-${uuidv4()}`,
                description: '',
                parentId: testData.rootFolderOrg2.id
              }
            },
            adminHeadersOrg2
          );
          expect(newFolderRes2?.data?.createFolder).toBeDefined();
          testData.folder2 = newFolderRes2?.data?.createFolder;
        });

        xit('Admin create Job using not existed folderId should fail', async () => {
          try {
            await gqlClient.sdk.createJob(
              {
                input: {
                  name: `${citestMarker}-job-${uuidv4()}`,
                  targetId: testTdo.id,
                  tasks: [
                    {
                      engineId: testEngine1.id,
                      ioFolders: [
                        {
                          referenceId: uuidv4(),
                          mode: IoFolderMode.Chunk,
                          type: IoFolderType.Input
                        }
                      ]
                    }
                  ]
                }
              },
              adminHeadersOrg1
            );
          } catch (error: any) {
            const msg = error?.response?.errors?.[0]?.message;
            expect(msg).toContain('aaaa');
          }
        });

        xit('Admin create Job using not shared folderId should fail', async () => {
          try {
            await gqlClient.sdk.createJob(
              {
                input: {
                  name: `${citestMarker}-job-${uuidv4()}`,
                  targetId: testTdo.id,
                  tasks: [
                    {
                      engineId: testEngine1.id,
                      ioFolders: [
                        {
                          referenceId: testData.folder2.id,
                          mode: IoFolderMode.Chunk,
                          type: IoFolderType.Input
                        }
                      ]
                    }
                  ]
                }
              },
              adminHeadersOrg1
            );
          } catch (error: any) {
            const msg = error?.response?.errors?.[0]?.name;
            expect(msg).toContain('not_found');
          }
        });

        it('Shared folder setup for org', async () => {
          const shareFolderRes = await gqlClient.sdk.shareFolder({
            input: {
              folderId: testData.folder2.id,
              readOrganizationIds: [+testOrg1.id]
            }
          });
          expect(shareFolderRes?.data?.shareFolder).toBeDefined();
        });

        it('Admin create Job using shared folderId should success', async () => {
          const jobRes = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                tasks: [
                  {
                    engineId: testEngine1.id,
                    ioFolders: [
                      {
                        referenceId: testData.folder2.id,
                        mode: IoFolderMode.Chunk,
                        type: IoFolderType.Input
                      }
                    ]
                  }
                ]
              }
            },
            adminHeadersOrg1
          );

          const job = jobRes?.data?.createJob;
          expect(job).toBeDefined();
          expect(job?.id).toBeDefined();
          testData.jobWithIoFolder = job;
          jobIds.push(job?.id!);
        });

        it('Admin create Job using org own folder should success', async () => {
          const jobRes = await gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                tasks: [
                  {
                    engineId: testEngine1.id,
                    ioFolders: [
                      {
                        referenceId: testData.folder.id,
                        mode: IoFolderMode.Chunk,
                        type: IoFolderType.Input
                      }
                    ]
                  }
                ]
              }
            },
            adminHeadersOrg1
          );
          const job = jobRes?.data?.createJob;
          expect(job).toBeDefined();
          expect(job?.id).toBeDefined();
          testData.jobWithIoFolder = job;
          jobIds.push(job?.id!);
        });

        it('User is not allow to create job', async () => {
          const job = gqlClient.sdk.createJob(
            {
              input: {
                name: `${citestMarker}-job-${uuidv4()}`,
                targetId: testTdo.id,
                tasks: [
                  {
                    engineId: testEngine1.id,
                    ioFolders: [
                      {
                        referenceId: testData.folder.id,
                        mode: IoFolderMode.Chunk,
                        type: IoFolderType.Input
                      }
                    ]
                  }
                ]
              }
            },
            regularHeadersOrg1
          );
          await expect(job).rejects.toThrow('not_allowed');
        });

        it('Get job success', async () => {
          const jobData = await gqlClient.sdk.job(
            {
              id: testData.jobWithIoFolder.id
            },
            adminHeadersOrg1
          );
          expect(jobData?.data?.job).toBeDefined();
          expect(jobData?.data?.job?.id).toEqual(testData.jobWithIoFolder.id);
        });
      });

      describe('create job with job template', () => {
        beforeAll(async () => {
          // Create engine for org 2
          const engineCreate = await gqlClient.sdk.createEngine(
            {
              input: {
                name: `${citestMarker}-engine-${uuidv4()}`,
                categoryId: engineCategoryId,
                deploymentModel: DeploymentModel.FullyNetworkIsolated
              }
            },
            adminHeadersOrg2
          );
          testEngineOrg2 = engineCreate?.data?.createEngine;
          engineIdsOrg2.push(testEngineOrg2.id);

          await buildAndDeployEngine(testEngineOrg2.id, adminHeadersOrg2);
        });

        it('Create Job template', async () => {
          // org1
          const newJobTemplate = await gqlClient.sdk.createJobTemplate(
            {
              input: {
                taskTemplates: [{ engineId: testEngine1.id }]
              }
            },
            adminHeadersOrg1
          );

          expect(newJobTemplate?.data?.createJobTemplate).toBeDefined();
          jobTemplateId = newJobTemplate?.data?.createJobTemplate?.id!;

          // org2
          const newJobTemplate2 = await gqlClient.sdk.createJobTemplate(
            {
              input: {
                taskTemplates: [{ engineId: testEngineOrg2.id }]
              }
            },
            adminHeadersOrg2
          );

          expect(newJobTemplate2?.data?.createJobTemplate).toBeDefined();
          jobTemplateId2 = newJobTemplate2?.data?.createJobTemplate?.id!;
          expect(jobTemplateId2).toBeDefined();
        });

        it('create Job using not existed Job template should fail', async () => {
          const jobFromTemplate = await gqlClient.sdk.launchJobTemplates(
            {
              input: {
                ids: [uuidv4()],
                targetInfo: { targetId: testTdo.id }
              }
            },
            adminHeadersOrg1
          );

          expect(jobFromTemplate?.data?.launchJobTemplates?.length).toBe(0);
        });

        it('cannot access jobTemplate from other org', async () => {
          const job = gqlClient.sdk.jobTemplate(
            { id: jobTemplateId2 },
            adminHeadersOrg1
          );

          await expect(job).rejects.toThrow('not_found');
        });

        xit('create Job using invalid Job template (not have access) should fail', async () => {
          const jobFromTemplate = await gqlClient.sdk.launchJobTemplates(
            {
              input: {
                ids: [jobTemplateId2],
                targetInfo: { targetId: testTdo.id }
              }
            },
            adminHeadersOrg1
          );

          expect(jobFromTemplate?.data?.launchJobTemplates?.length).toBe(0);
        });

        it('create Job using valid Job template should success', async () => {
          const jobFromTemplate = await gqlClient.sdk.launchJobTemplates(
            {
              input: {
                ids: [jobTemplateId],
                targetInfo: { targetId: testTdo.id }
              }
            },
            adminHeadersOrg1
          );

          expect(
            jobFromTemplate?.data?.launchJobTemplates?.length
          ).toBeGreaterThan(0);
          const jobId = jobFromTemplate?.data?.launchJobTemplates?.[0]?.id;
          jobIds.push(jobId!);
        });

        it('create Job from template should success', async () => {
          const jobFromTemplate = await gqlClient.sdk.launchJobTemplates(
            {
              input: {
                ids: [jobTemplateId],
                targetInfo: { targetId: testTdo.id }
              }
            },
            adminHeadersOrg1
          );

          expect(
            jobFromTemplate?.data?.launchJobTemplates?.length
          ).toBeGreaterThan(0);
          const jobId = jobFromTemplate?.data?.launchJobTemplates?.[0]?.id;
          expect(jobId).toBeDefined();
          testData.jobFromTemplateId = jobId;
          jobIds.push(jobId!);
        });

        it('Get job success', async () => {
          const jobData = await gqlClient.sdk.job(
            {
              id: testData.jobFromTemplateId
            },
            adminHeadersOrg1
          );
          expect(jobData?.data?.job).toBeDefined();
          expect(jobData?.data?.job?.id).toEqual(testData.jobFromTemplateId);
          expect(jobData?.data?.job?.templateId).toEqual(jobTemplateId);
        });
      });

      describe('update job', () => {
        it('update Job status', async () => {
          const updateJobStatus = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [testData.jobFromTemplateId],
                status: UpdateJobsStatus.Queued
              }
            },
            adminHeadersOrg1
          );

          expect(updateJobStatus).toBeDefined();
          expect(updateJobStatus?.data?.updateJobs?.records?.length).toBe(1);
          expect(updateJobStatus?.data?.updateJobs?.records?.[0]?.id).toBe(
            testData.jobFromTemplateId
          );
          const jobStatus =
            updateJobStatus?.data?.updateJobs?.records?.[0]?.status;
          expect(['queued', 'running']).toContain(jobStatus);
        });

        it('update Job taskOutput', async () => {
          const updateTaskOutput = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [testData.jobWithIoFolder.id],
                status: UpdateJobsStatus.Queued,
                taskOutput: {
                  failureType: TaskFailureReason.InternalError,
                  failureMessage: ' testing'
                }
              }
            },
            adminHeadersOrg1
          );

          expect(updateTaskOutput).toBeDefined();
          expect(updateTaskOutput?.data?.updateJobs?.records?.length).toBe(1);
          const jobStatus =
            updateTaskOutput?.data?.updateJobs?.records?.[0]?.status;
          expect(updateTaskOutput?.data?.updateJobs?.records?.[0]?.id).toBe(
            testData.jobWithIoFolder.id
          );
          expect(['queued', 'running']).toContain(jobStatus);
        });

        it('update Job notificationUris', async () => {
          const notificationUri = `https://test.com/notify/${uuidv4()}`;

          const updateJobNotification = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [testData.jobWithBuild.id],
                status: UpdateJobsStatus.Queued,
                notificationUris: [notificationUri]
              }
            },
            adminHeadersOrg1
          );

          expect(updateJobNotification).toBeDefined();
          expect(updateJobNotification?.data?.updateJobs?.records?.length).toBe(
            1
          );
          expect(
            updateJobNotification?.data?.updateJobs?.records?.[0]?.id
          ).toBe(testData.jobWithBuild.id);
          const notificationUris =
            updateJobNotification?.data?.updateJobs?.records?.[0]
              ?.notificationUris;
          expect(notificationUris).toContain(notificationUri);
        });

        it('update Job with incorrect requiredCurrentStatus should fail', async () => {
          const updateJob = await gqlClient.sdk.updateJobs(
            {
              input: {
                ids: [testData.jobFromTemplateId],
                status: UpdateJobsStatus.Queued,
                requiredCurrentStatus: JobStatus.Failed
              }
            },
            adminHeadersOrg1
          );

          expect(updateJob?.data?.updateJobs?.records?.length).toBe(0);
        });

        it('cancel job', async () => {
          const cancelJob = await gqlClient.sdk.cancelJob(
            {
              id: testData.jobFromTemplateId
            },
            adminHeadersOrg1
          );

          expect(cancelJob).toBeDefined();
          expect(cancelJob?.data?.cancelJob?.id).toEqual(
            testData.jobFromTemplateId
          );
        });

        it('retry job', async () => {
          const retryJob = await gqlClient.sdk.retryJob(
            {
              id: testData.jobFromTemplateId
            },
            adminHeadersOrg1
          );

          expect(retryJob).toBeDefined();
          expect(retryJob?.data?.retryJob?.status).toEqual('pending');

          const jobId = _.get(retryJob, 'data.retryJob.id');
          expect(jobId).toBeTruthy();
          jobIds.push(jobId!);
        });

        it('cancel all jobs', async () => {
          if (jobIds.length > 0) {
            const listPromise = jobIds.map(async (jobId) =>
              safe(`cancel job ${jobId}`, async () => {
                const cancelJob = await gqlClient.sdk.cancelJob(
                  { id: jobId },
                  adminHeadersOrg1
                );

                expect(cancelJob).toBeDefined();
                expect(cancelJob?.data?.cancelJob?.id).toEqual(jobId);
              })
            );

            await Promise.all(listPromise);
          }
        });
      });

      afterAll(async () => {
        // delete jobs template
        if (jobTemplateId) {
          await safe(`delete job template ${jobTemplateId}`, async () =>
            gqlClient.sdk.deleteJobTemplate(
              { id: jobTemplateId },
              adminHeadersOrg1
            )
          );
        }

        if (jobTemplateId2) {
          await safe(`delete job template ${jobTemplateId2}`, async () =>
            gqlClient.sdk.deleteJobTemplate(
              { id: jobTemplateId2 },
              adminHeadersOrg2
            )
          );
        }

        // delete engines
        if (engineIdsOrg1.length > 0) {
          const deletePromises = engineIdsOrg1.map(async (engineId) =>
            safe(`delete engine ${engineId}`, async () =>
              gqlClient.sdk.deleteEngine({ id: engineId }, adminHeadersOrg1)
            )
          );
          await Promise.all(deletePromises);
        }

        if (engineIdsOrg2.length > 0) {
          const deletePromisesOrg2 = engineIdsOrg2.map(async (engineId) =>
            safe(`delete engine ${engineId}`, async () =>
              gqlClient.sdk.deleteEngine(
                {
                  id: engineId
                },
                adminHeadersOrg2
              )
            )
          );
          await Promise.all(deletePromisesOrg2);
        }

        //delete Tdo
        if (testTdo?.id) {
          await safe(`delete TDO ${testTdo.id}`, async () =>
            gqlClient.sdk.deleteTDO(
              {
                id: testTdo.id
              },
              adminHeadersOrg1
            )
          );
        }

        if (testData.folder?.id) {
          await safe(`delete folder ${testData.folder.id}`, async () =>
            gqlClient.sdk.deleteFolder(
              { input: { id: testData.folder.id, orderIndex: 0 } },
              adminHeadersOrg1
            )
          );
        }

        if (testData.folder2?.id) {
          await safe(`delete folder ${testData.folder2.id}`, async () =>
            gqlClient.sdk.deleteFolder(
              { input: { id: testData.folder2.id, orderIndex: 0 } },
              adminHeadersOrg2
            )
          );
        }

        //delete Users and Orgs
        if (adminUser1?.id) {
          await safe(`delete user ${adminUser1.id}`, async () =>
            gqlClient.sdk.deleteUser({
              id: adminUser1.id
            })
          );
        }

        if (regularUser1?.id) {
          await safe(`delete user ${regularUser1.id}`, async () =>
            gqlClient.sdk.deleteUser({
              id: regularUser1.id
            })
          );
        }

        if (adminUser2?.id) {
          await safe(`delete user ${adminUser2.id}`, async () =>
            gqlClient.sdk.deleteUser({
              id: adminUser2.id
            })
          );
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

        if (testOrg2?.id) {
          await safe(`delete org ${testOrg2.id}`, async () =>
            gqlClient.sdk.updateOrganization({
              input: {
                id: testOrg2.id,
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
      name: `${citestMarker}-org-${version}-${uuidv4()}`,
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
        name: `${citestMarker}-admin-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652',
          '032218c3-d47e-4287-9d16-7bb867c01266',
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
        ].filter((id): id is string => id !== null)
      },
      {
        name: `${citestMarker}-user-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828']
      }
    ]
  };
}

async function buildAndDeployEngine(
  engineId: string,
  headers: Record<string, string>
) {
  const buildRes = await gqlClient.sdk.createEngineBuild(
    {
      input: {
        engineId,
        taskRuntime: { nodeRed: true },
        manifest: { runtime: 'NodeRed' }
      }
    },
    headers
  );

  const buildId = buildRes?.data?.createEngineBuild?.id;
  expect(buildId).toBeTruthy();
  let build;

  for (const action of ['submit', 'deploy']) {
    build = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: buildId!,
          engineId,
          action: action as BuildUpdateAction
        }
      },
      headers
    );
  }

  return build;
}
