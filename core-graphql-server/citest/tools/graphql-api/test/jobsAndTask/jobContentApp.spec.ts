import { v4 as uuidv4 } from 'uuid';
import { helpers } from '../../src/helpers';
import { safe } from '../../src/helpers/commonHelper';
import { getJobContentApplicationId } from '../../src/helpers/dbHelper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import * as mockUtil from '../helpers/mockUtil';
import {
  BuildUpdateAction,
  ClusterStatus,
  DayOfWeek,
  DeploymentModel,
  IoFolderMode,
  IoFolderType,
  JobTemplateEnumType,
  RootFolderType,
  RunMode,
  UpdateJobsStatus
} from '../../src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';

const sampleDagTemplate =
  '{"tasks": [  {    "engineId": "{{{firstEngineId}}}",    "payload": {      "url": "{{{UPLOAD_URL}}}"    },    "executionPreferences": {      {{#if priorityOfFirst}} "priority":{{minus priorityOfFirst 5}} {{/if}}    },    "ioFolders": [      {        "referenceId": "wsa-output",        "mode": "stream",        "type": "output"      }    ]  },  {    "engineId": "{{{secondEngineId}}}",    "executionPreferences": {      {{#if priority}} "priority":{{{priority}}}, {{/if}}      "parentCompleteBeforeStarting": true    },    "ioFolders": [      {        "referenceId": "pb-input",        "mode": "stream",        "type": "input"      }    ]  },  {    "engineId": "8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440",    "payload": {      "ffmpegTemplate": "video",      "customFFMPEGProperties": {        "chunkSizeInSeconds": {{#if chunkSizeInSeconds}} "{{{chunkSizeInSeconds}}}" {{else}} "300" {{/if}}      }    },    "executionPreferences": {      {{#if priority}} "priority":{{{priority}}}, {{/if}}      "parentCompleteBeforeStarting": true    },    "ioFolders": [      {        "referenceId": "si-input",        "mode": "stream",        "type": "input"      },      {        "referenceId": "si-output",        "mode": "chunk",        "type": "output"      }    ]  },  {    "engineId": "8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3",    "executionPreferences": {      {{#if priority}} "priority":{{{priority}}}, {{/if}}      "parentCompleteBeforeStarting": true    },    "ioFolders": [      {        "referenceId": "ow-input",        "mode": "chunk",        "type": "input"      }    ]  }],"routes": [  {    "parentIoFolderReferenceId": "wsa-output",    "childIoFolderReferenceId": "pb-input"  },  {    "parentIoFolderReferenceId": "wsa-output",    "childIoFolderReferenceId": "si-input"  },  {    "parentIoFolderReferenceId": "si-output",    "childIoFolderReferenceId": "ow-input"  }]}';

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};
const testTemplateTextUploadChunk = mockUtil.getMockEngineTemplate(
  'citest-upload',
  'upload'
) as string;

const buildEngineActionList = [BuildUpdateAction.Submit, BuildUpdateAction.Deploy];
const publicBuildEngineActionList = [
  BuildUpdateAction.Submit,
  BuildUpdateAction.Approve,
  BuildUpdateAction.Deploy
];

const engineCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

let gqlClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;

describe('citest_job: createJobContentApp', () => {
  let superAdminOptions: Record<string, string>;
  let noHeaderOptions: Record<string, string>;
  let tdoId: any, engineId: any, clusterId: any, superAdminFolderId: any;

  function optionsWithAppHeader(appId: string): Record<string, string> {
    return {
      ...(helpers.requestOptions(isolatedSuperadmin.token)
        .headers as Record<string, string>),
      'X-Veritone-Application': appId
    };
  }

  beforeAll(async () => {
    const env = config.env;
    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );

    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;

    superAdminOptions = isolatedSuperadmin.options;

    noHeaderOptions = {
      ...(helpers.requestOptions(isolatedSuperadmin.token)
        .headers as Record<string, string>)
    };
    delete noHeaderOptions['X-Veritone-Application'];

    // create TDO
    const createTDOResult = await gqlClient.sdk.createTDOWithAsset(
      {
        input: {
          name: `${citestMarker}-tdo-${uuidv4()}`,
          ...tdoAssetInput
        }
      },
      superAdminOptions
    );
    expect(createTDOResult).toBeDefined();
    tdoId = createTDOResult?.data?.createTDOWithAsset?.id;

    // create cluster
    const clusterCreateRes = await gqlClient.sdk.createCluster(
      {
        input: {
          name: `${citestMarker}-test-cluster-${uuidv4()}`,
          dockerCredentials: {},
          allowedEngines: [],
          status: ClusterStatus.Active
        }
      },
      superAdminOptions
    );
    expect(clusterCreateRes).toBeDefined();
    clusterId = clusterCreateRes?.data?.createCluster?.id;
    expect(clusterId).toBeDefined();

    // create engine
    const engineCreate = await gqlClient.sdk.createEngine(
      {
        input: {
          name: `${citestMarker}-engine-${uuidv4()}`,
          categoryId: engineCategoryId,
          deploymentModel: DeploymentModel.FullyNetworkIsolated
        }
      },
      superAdminOptions
    );
    const engineData = engineCreate?.data?.createEngine;
    expect(engineCreate).toBeDefined();
    engineId = engineData?.id;

    // deploy engine
    await buildAndDeployEngine(engineId, superAdminOptions);

    // get root folder => no need to delete
    let superAdminFolder = await gqlClient.sdk.rootFolders(
      { rootFolderType: RootFolderType.Cms },
      superAdminOptions
    );
    let folders = superAdminFolder?.data?.rootFolders ?? [];

    if (folders.length === 0) {
      // admin create root folder
      const createdRootFolder = await gqlClient.sdk.createRootFolders(
        { rootFolderType: RootFolderType.Cms },
        superAdminOptions
      );
      folders = createdRootFolder?.data?.createRootFolders ?? [];
      expect(folders).toBeDefined();
    }
    superAdminFolderId = folders?.[0]?.id;
  });

  afterAll(async () => {
    // delete engine
    if (engineId) {
      await safe('delete engine', async () =>
        gqlClient.sdk.deleteEngine({ id: engineId }, superAdminOptions)
      );
    }

    // delete cluster
    if (clusterId) {
      await safe('delete cluster', async () =>
        gqlClient.sdk.deleteCluster({ id: clusterId }, superAdminOptions)
      );
    }

    // delete tdo
    if (tdoId) {
      await safe('delete tdo', async () =>
        gqlClient.sdk.deleteTDO({ id: tdoId }, superAdminOptions)
      );
    }

    // T25: tear down the isolated throwaway superadmin org/user LAST. See
    // test/helpers/superadminSession.ts.
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  describe('job v1', () => {
    describe('create job v1 directly', () => {
      let jobIdV1: any, jobIdV1WithHeader: any;
      it('create job v1 empty X-Veritone-Application header', async () => {
        const newJob = await gqlClient.sdk.createJob(
          {
            input: {
              targetId: tdoId,
              skipDecider: true,
              tasks: [
                { engineId: engineId, payload: { engineReturnValue: true } }
              ]
            }
          },
          noHeaderOptions
        );

        expect(newJob).toBeDefined();
        jobIdV1 = newJob?.data?.createJob?.id;

        const dbValue = await getJobContentApplicationId(jobIdV1);
        expect(dbValue).toEqual('');
      });

      it('update job does not change content_application_id', async () => {
        const headerAppId = uuidv4();
        const reqOptions = optionsWithAppHeader(headerAppId);

        await gqlClient.sdk.updateJobs(
          {
            input: {
              ids: [jobIdV1],
              status: UpdateJobsStatus.Queued
            }
          },
          reqOptions
        );
        const dbValue = await getJobContentApplicationId(jobIdV1);
        expect(dbValue).not.toEqual(headerAppId);
      });

      it('create job v1 with X-Veritone-Application header', async () => {
        const launchAppId = 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0'; // Developer app fixture
        const reqOptions = optionsWithAppHeader(launchAppId);
        const newJob = await gqlClient.sdk.createJob(
          {
            input: {
              targetId: tdoId,
              skipDecider: true,
              tasks: [
                { engineId: engineId, payload: { engineReturnValue: true } }
              ]
            }
          },
          reqOptions
        );
        expect(newJob).toBeDefined();
        jobIdV1WithHeader = newJob?.data?.createJob?.id;

        const dbValue = await getJobContentApplicationId(jobIdV1WithHeader);
        expect(dbValue).toEqual(launchAppId);
      });

      afterAll(async () => {
        if (jobIdV1) {
          await safe('cancel job v1', async () =>
            gqlClient.sdk.cancelJob({ id: jobIdV1 }, superAdminOptions)
          );
        }

        if (jobIdV1WithHeader) {
          await safe('cancel job v1 with header', async () =>
            gqlClient.sdk.cancelJob(
              { id: jobIdV1WithHeader },
              superAdminOptions
            )
          );
        }
      });
    });

    describe('job v1 from job template', () => {
      let jobTemplateId: any, jobTemplateIdWithHeader: any;
      let randomHeader: any;

      afterAll(async () => {
        if (jobTemplateId) {
          await safe('delete job template without header', async () =>
            gqlClient.sdk.deleteJobTemplate(
              { id: jobTemplateId },
              superAdminOptions
            )
          );
        }

        if (jobTemplateIdWithHeader) {
          await safe('delete job template with header', async () =>
            gqlClient.sdk.deleteJobTemplate(
              { id: jobTemplateIdWithHeader },
              superAdminOptions
            )
          );
        }
      });

      it('create job template empty X-Veritone-Application header', async () => {
        const createJobTemplateRes = await gqlClient.sdk.createJobTemplate(
          { input: { taskTemplates: [{ engineId: engineId }] } },
          noHeaderOptions
        );

        jobTemplateId = createJobTemplateRes?.data?.createJobTemplate?.id;
        expect(jobTemplateId).toBeDefined();
      });

      it('launch job template empty X-Veritone-Application header', async () => {
        const launchRes = await gqlClient.sdk.launchJobTemplates(
          {
            input: {
              ids: [jobTemplateId],
              targetInfo: { targetId: tdoId }
            }
          },
          noHeaderOptions
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = launchRes?.data?.launchJobTemplates?.[0]?.id;
        expect(launchedJobId).toBeDefined();

        const dbValue = await getJobContentApplicationId(launchedJobId!);
        expect(dbValue).toEqual('');

        await safe('cancel job v1 template', async () =>
          gqlClient.sdk.cancelJob({ id: launchedJobId! }, noHeaderOptions)
        );
      });

      it('launch job template with X-Veritone-Application header', async () => {
        const launchAppId = uuidv4();
        const reqOptions = optionsWithAppHeader(launchAppId);
        const launchRes = await gqlClient.sdk.launchJobTemplates(
          {
            input: {
              ids: [jobTemplateId],
              targetInfo: { targetId: tdoId }
            }
          },
          reqOptions
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = launchRes?.data?.launchJobTemplates?.[0]?.id;
        expect(launchedJobId).toBeDefined();

        const dbValue = await getJobContentApplicationId(launchedJobId!);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel job v1 template', async () =>
          gqlClient.sdk.cancelJob({ id: launchedJobId! }, reqOptions)
        );
      });

      it('create job template with X-Veritone-Application header', async () => {
        randomHeader = uuidv4();
        const reqOptions = optionsWithAppHeader(randomHeader);

        const createJobTemplateRes = await gqlClient.sdk.createJobTemplate(
          { input: { taskTemplates: [{ engineId: engineId }] } },
          reqOptions
        );

        jobTemplateIdWithHeader =
          createJobTemplateRes?.data?.createJobTemplate?.id;
        expect(jobTemplateIdWithHeader).toBeDefined();
      });

      it('launch job template empty X-Veritone-Application header should inherit content_application_id from template', async () => {
        const launchRes = await gqlClient.sdk.launchJobTemplates(
          {
            input: {
              ids: [jobTemplateIdWithHeader],
              targetInfo: { targetId: tdoId }
            }
          },
          noHeaderOptions
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = launchRes?.data?.launchJobTemplates?.[0]?.id;
        expect(launchedJobId).toBeDefined();

        const dbValue = await getJobContentApplicationId(launchedJobId!);
        expect(dbValue).toEqual(randomHeader);

        await safe('cancel job v1 template', async () =>
          gqlClient.sdk.cancelJob({ id: launchedJobId! }, superAdminOptions)
        );
      });
    });

    describe('job v1 from scheduled jobs', () => {
      let scheduledJobIdWithoutHeader: any, scheduledJobIdWithHeader: any;
      let randomHeader: any;

      afterAll(async () => {
        if (scheduledJobIdWithoutHeader) {
          await safe('delete scheduled job', async () =>
            gqlClient.sdk.deleteScheduledJob(
              { id: scheduledJobIdWithoutHeader },
              superAdminOptions
            )
          );
        }

        if (scheduledJobIdWithHeader) {
          await safe('delete scheduled job with header', async () =>
            gqlClient.sdk.deleteScheduledJob(
              { id: scheduledJobIdWithHeader },
              superAdminOptions
            )
          );
        }
      });

      it('create scheduled job empty X-Veritone-Application header', async () => {
        const createScheduledJobResult = await gqlClient.sdk.createScheduledJob(
          {
            input: {
              name: `${citestMarker}-scheduled-job-${uuidv4()}`,
              runMode: RunMode.Now,
              details: {
                programFormat: 'Adult Contemporary',
                foo: 'bar',
                isNational: true
              },
              weeklyScheduleParts: [
                {
                  scheduledDay: DayOfWeek.Monday,
                  startTime: '09:00:00-08:00',
                  stopTime: '10:30-08:00'
                }
              ],
              jobTemplates: [
                {
                  skipDecider: true,
                  clusterId: clusterId,
                  jobConfig: {
                    createTDOInput: { details: { tags: ['foo', 'bar'] } }
                  },
                  taskTemplates: [
                    {
                      engineId: engineId
                    }
                  ]
                }
              ]
            }
          },
          noHeaderOptions
        );

        expect(createScheduledJobResult).toBeDefined();
        scheduledJobIdWithoutHeader =
          createScheduledJobResult?.data?.createScheduledJob?.id;
        expect(scheduledJobIdWithoutHeader).toBeDefined();
      });

      it('launch job from scheduled job with X-Veritone-Application header', async () => {
        const launchAppId = uuidv4();
        const reqOptions = optionsWithAppHeader(launchAppId);

        const launchRes = await gqlClient.sdk.launchScheduledJobs(
          {
            input: {
              scheduledJobId: scheduledJobIdWithoutHeader,
              payload: { maxIngestionJobs: 1 }
            }
          },
          reqOptions
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = launchRes?.data?.launchScheduledJobs?.[0]?.id;
        expect(launchedJobId).toBeDefined();
        const dbValue = await getJobContentApplicationId(launchedJobId!);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel job from scheduled job', async () =>
          gqlClient.sdk.cancelJob({ id: launchedJobId! }, superAdminOptions)
        );
      });

      it('create scheduled job with X-Veritone-Application header', async () => {
        randomHeader = uuidv4();
        const reqOptions = optionsWithAppHeader(randomHeader);
        const createScheduledJobResult = await gqlClient.sdk.createScheduledJob(
          {
            input: {
              name: `${citestMarker}-scheduled-job-${uuidv4()}`,
              runMode: RunMode.Now,
              details: {
                programFormat: 'Adult Contemporary',
                foo: 'bar',
                isNational: true
              },
              weeklyScheduleParts: [
                {
                  scheduledDay: DayOfWeek.Monday,
                  startTime: '09:00:00-08:00',
                  stopTime: '10:30-08:00'
                }
              ],
              jobTemplates: [
                {
                  skipDecider: true,
                  clusterId: clusterId,
                  jobConfig: {
                    createTDOInput: { details: { tags: ['foo', 'bar'] } }
                  },
                  taskTemplates: [
                    {
                      engineId: engineId
                    }
                  ]
                }
              ]
            }
          },
          reqOptions
        );

        expect(createScheduledJobResult).toBeDefined();
        scheduledJobIdWithHeader =
          createScheduledJobResult?.data?.createScheduledJob?.id;
        expect(scheduledJobIdWithHeader).toBeDefined();
      });

      it('launch job from scheduled job should inherit content_application_id from scheduled job', async () => {
        const launchRes = await gqlClient.sdk.launchScheduledJobs(
          {
            input: {
              scheduledJobId: scheduledJobIdWithHeader,
              payload: { maxIngestionJobs: 1 }
            }
          },
          noHeaderOptions
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = launchRes?.data?.launchScheduledJobs?.[0]?.id;
        expect(launchedJobId).toBeDefined();
        const dbValue = await getJobContentApplicationId(launchedJobId!);
        expect(dbValue).toEqual(randomHeader);

        await safe('cancel job from scheduled job with header', async () =>
          gqlClient.sdk.cancelJob({ id: launchedJobId! }, superAdminOptions)
        );
      });
    });
  });

  describe('job v3', () => {
    describe('create job v3 directly', () => {
      let jobIdV3: any, jobIdV3WithHeader: any;
      it('create job v3 empty X-Veritone-Application header', async () => {
        const newJob = await gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              targetId: tdoId,
              tasks: [
                {
                  engineId: engineId,
                  ioFolders: [
                    {
                      referenceId: superAdminFolderId,
                      mode: IoFolderMode.Chunk,
                      type: IoFolderType.Output
                    }
                  ]
                }
              ],
              routes: [
                {
                  parentIoFolderReferenceId: superAdminFolderId
                }
              ]
            }
          },
          noHeaderOptions
        );

        expect(newJob).toBeDefined();
        jobIdV3 = newJob?.data?.createJob?.id;
        const dbValue = await getJobContentApplicationId(jobIdV3);
        expect(dbValue).toEqual('');
      });

      it('update job v3 with X-Veritone-Application header should not update content_application_id', async () => {
        const headerAppId = uuidv4();
        const reqOptions = optionsWithAppHeader(headerAppId);

        await gqlClient.sdk.updateJobs(
          {
            input: {
              ids: [jobIdV3],
              status: UpdateJobsStatus.Queued
            }
          },
          reqOptions
        );
        const dbValue = await getJobContentApplicationId(jobIdV3);
        expect(dbValue).not.toEqual(headerAppId);
      });

      it('create job v3 with X-Veritone-Application header', async () => {
        const launchAppId = 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0'; // Developer app fixture
        const reqOptions = optionsWithAppHeader(launchAppId);
        const newJob = await gqlClient.sdk.createJob(
          {
            input: {
              name: `${citestMarker}-job-${uuidv4()}`,
              targetId: tdoId,
              tasks: [
                {
                  engineId: engineId,
                  ioFolders: [
                    {
                      referenceId: superAdminFolderId,
                      mode: IoFolderMode.Chunk,
                      type: IoFolderType.Output
                    }
                  ]
                }
              ],
              routes: [
                {
                  parentIoFolderReferenceId: superAdminFolderId
                }
              ]
            }
          },
          reqOptions
        );

        expect(newJob).toBeDefined();
        jobIdV3WithHeader = newJob?.data?.createJob?.id;
        const dbValue = await getJobContentApplicationId(jobIdV3WithHeader);
        expect(dbValue).toEqual(launchAppId);
      });

      afterAll(async () => {
        if (jobIdV3) {
          await safe('cancel job v3', async () =>
            gqlClient.sdk.cancelJob({ id: jobIdV3 }, superAdminOptions)
          );
        }

        if (jobIdV3WithHeader) {
          await safe('cancel job v3 with header', async () =>
            gqlClient.sdk.cancelJob(
              { id: jobIdV3WithHeader },
              superAdminOptions
            )
          );
        }
      });
    });

    describe('job v3 from DAG template', () => {
      let dagTemplateIdWithoutHeader: any, dagTemplateIdWithHeader: any;
      let randomHeader: any;
      beforeAll(async () => {
        // create dag template dagTemplateIdWithoutHeader
        const createDagTemplateRes = await gqlClient.sdk.createDagTemplate(
          {
            input: {
              name: `${citestMarker}-dag-template-${uuidv4()}`,
              dag: sampleDagTemplate,
              dagTemplateLanguage: 'Handlebars',
              tags: ['foo', 'bar']
            }
          },
          noHeaderOptions
        );
        dagTemplateIdWithoutHeader =
          createDagTemplateRes?.data?.createDagTemplate?.id;
        expect(dagTemplateIdWithoutHeader).toBeDefined();

        // create dag template dagTemplateIdWithHeader
        randomHeader = uuidv4();
        const reqOptions = optionsWithAppHeader(randomHeader);
        const createDagTemplateWithHeaderRes =
          await gqlClient.sdk.createDagTemplate(
            {
              input: {
                name: `${citestMarker}-dag-template-${uuidv4()}`,
                dag: sampleDagTemplate,
                dagTemplateLanguage: 'Handlebars',
                tags: ['foo', 'bar']
              }
            },
            reqOptions
          );
        dagTemplateIdWithHeader =
          createDagTemplateWithHeaderRes?.data?.createDagTemplate?.id;
        expect(dagTemplateIdWithHeader).toBeDefined();
      });

      afterAll(async () => {
        if (dagTemplateIdWithoutHeader) {
          await safe('delete dag template without header', async () =>
            gqlClient.sdk.deleteDagTemplate(
              { id: dagTemplateIdWithoutHeader },
              superAdminOptions
            )
          );
        }

        if (dagTemplateIdWithHeader) {
          await safe('delete dag template with header', async () =>
            gqlClient.sdk.deleteDagTemplate(
              { id: dagTemplateIdWithHeader },
              superAdminOptions
            )
          );
        }
      });

      it('launch v3 DAG template empty X-Veritone-Application header', async () => {
        const result = await gqlClient.sdk.launchDAGTemplate(
          {
            input: {
              uploadUrl: 'http://localhost',
              clusterId: clusterId,
              dagTemplateId: dagTemplateIdWithoutHeader,
              dagTemplateFields: [
                {
                  fieldName: 'firstEngineId',
                  fieldValue: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255'
                },
                {
                  fieldName: 'secondEngineId',
                  fieldValue: '352556c7-de07-4d55-b33f-74b1cf237f25'
                },
                { fieldName: 'priorityOfFirst', fieldValue: '5' }
              ]
            }
          },
          noHeaderOptions
        );
        const createJob = result?.data?.launchDAGTemplate;
        const jobId = createJob?.id;
        expect(createJob).toBeDefined();
        expect(jobId).toBeDefined();
        const dbValue = await getJobContentApplicationId(jobId!);
        expect(dbValue).toEqual('');

        await safe('cancel job from dag template without header', async () =>
          gqlClient.sdk.cancelJob({ id: jobId! }, superAdminOptions)
        );
      });

      it('launch v3 DAG template with X-Veritone-Application header', async () => {
        const launchAppId = uuidv4();
        const reqOptions = optionsWithAppHeader(launchAppId);

        const result = await gqlClient.sdk.launchDAGTemplate(
          {
            input: {
              uploadUrl: 'http://localhost',
              clusterId: clusterId,
              dagTemplateId: dagTemplateIdWithoutHeader,
              dagTemplateFields: [
                {
                  fieldName: 'firstEngineId',
                  fieldValue: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255'
                },
                {
                  fieldName: 'secondEngineId',
                  fieldValue: '352556c7-de07-4d55-b33f-74b1cf237f25'
                },
                { fieldName: 'priorityOfFirst', fieldValue: '5' }
              ]
            }
          },
          reqOptions
        );

        expect(result).toBeDefined();
        const jobId = result?.data?.launchDAGTemplate?.id;
        expect(jobId).toBeDefined();
        const dbValue = await getJobContentApplicationId(jobId!);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel job from dag template with header', async () =>
          gqlClient.sdk.cancelJob({ id: jobId! }, reqOptions)
        );
      });

      // unskip when supporting store application id in dag template and child job inherit it is released,
      // currently the content_application_id is only set from header when launching job template
      it.skip('launch job from v3 dagTemplate should inherit X-Veritone-Application header', async () => {
        const result = await gqlClient.sdk.launchDAGTemplate(
          {
            input: {
              uploadUrl: 'http://localhost',
              clusterId: clusterId,
              dagTemplateId: dagTemplateIdWithHeader,
              dagTemplateFields: [
                {
                  fieldName: 'firstEngineId',
                  fieldValue: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255'
                },
                {
                  fieldName: 'secondEngineId',
                  fieldValue: '352556c7-de07-4d55-b33f-74b1cf237f25'
                },
                { fieldName: 'priorityOfFirst', fieldValue: '5' }
              ]
            }
          },
          noHeaderOptions
        );
        const createJob = result?.data?.launchDAGTemplate;
        const jobId = createJob?.id;
        expect(createJob).toBeDefined();
        expect(jobId).toBeDefined();
        const dbValue = await getJobContentApplicationId(jobId!);
        expect(dbValue).toEqual(randomHeader);

        await safe('cancel job from dag template without header', async () =>
          gqlClient.sdk.cancelJob({ id: jobId! }, superAdminOptions)
        );
      });
    });

    describe('job v3 from job template', () => {
      let jobTemplateV3Id: any, jobTemplateIdV3WithHeader: any;
      let randomHeader: any;

      afterAll(async () => {
        if (jobTemplateV3Id) {
          await safe('delete job template v3', async () =>
            gqlClient.sdk.deleteJobTemplate(
              { id: jobTemplateV3Id },
              superAdminOptions
            )
          );
        }

        if (jobTemplateIdV3WithHeader) {
          await safe('delete job template v3 with header', async () =>
            gqlClient.sdk.deleteJobTemplate(
              { id: jobTemplateIdV3WithHeader },
              superAdminOptions
            )
          );
        }
      });

      it('create job v3 template empty X-Veritone-Application header', async () => {
        const createJobTemplateRes = await gqlClient.sdk.createJobTemplate(
          {
            input: {
              taskTemplates: [
                {
                  engineId: engineId,
                  ioFolders: [
                    {
                      referenceId: superAdminFolderId,
                      mode: IoFolderMode.Chunk,
                      type: IoFolderType.Output
                    }
                  ]
                }
              ],
              routes: [{ parentIoFolderReferenceId: superAdminFolderId }]
            }
          },
          noHeaderOptions
        );

        jobTemplateV3Id = createJobTemplateRes?.data?.createJobTemplate?.id;
        expect(jobTemplateV3Id).toBeDefined();
      });

      it('launch job V3 from template empty X-Veritone-Application header', async () => {
        const launchRes = await gqlClient.sdk.launchJobTemplates(
          {
            input: {
              ids: [jobTemplateV3Id],
              targetInfo: { targetId: tdoId }
            }
          },
          noHeaderOptions
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = launchRes?.data?.launchJobTemplates?.[0]?.id;
        expect(launchedJobId).toBeDefined();
        const dbValue = await getJobContentApplicationId(launchedJobId!);
        expect(dbValue).toEqual('');

        await safe('cancel job v3 template', async () =>
          gqlClient.sdk.cancelJob({ id: launchedJobId! }, noHeaderOptions)
        );
      });

      it('launch job V3 from template with X-Veritone-Application header', async () => {
        const launchAppId = uuidv4();
        const reqOptions = optionsWithAppHeader(launchAppId);
        const launchRes = await gqlClient.sdk.launchJobTemplates(
          {
            input: {
              ids: [jobTemplateV3Id],
              targetInfo: { targetId: tdoId }
            }
          },
          reqOptions
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = launchRes?.data?.launchJobTemplates?.[0]?.id;
        expect(launchedJobId).toBeDefined();
        const dbValue = await getJobContentApplicationId(launchedJobId!);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel job v3 template', async () =>
          gqlClient.sdk.cancelJob({ id: launchedJobId! }, reqOptions)
        );
      });

      it('create job template v3 with X-Veritone-Application header', async () => {
        randomHeader = uuidv4();
        const reqOptions = optionsWithAppHeader(randomHeader);

        const createJobTemplateRes = await gqlClient.sdk.createJobTemplate(
          {
            input: {
              taskTemplates: [
                {
                  engineId: engineId,
                  ioFolders: [
                    {
                      referenceId: superAdminFolderId,
                      mode: IoFolderMode.Chunk,
                      type: IoFolderType.Output
                    }
                  ]
                }
              ],
              routes: [{ parentIoFolderReferenceId: superAdminFolderId }]
            }
          },
          reqOptions
        );

        jobTemplateIdV3WithHeader =
          createJobTemplateRes?.data?.createJobTemplate?.id;
        expect(jobTemplateIdV3WithHeader).toBeDefined();
      });

      it('launch job V3 from template empty X-Veritone-Application header should inherit content_application_id from template', async () => {
        const launchRes = await gqlClient.sdk.launchJobTemplates(
          {
            input: {
              ids: [jobTemplateIdV3WithHeader],
              targetInfo: { targetId: tdoId }
            }
          },
          noHeaderOptions
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = launchRes?.data?.launchJobTemplates?.[0]?.id;
        expect(launchedJobId).toBeDefined();
        const dbValue = await getJobContentApplicationId(launchedJobId!);
        expect(dbValue).toEqual(randomHeader);

        await safe('cancel job v3 template', async () =>
          gqlClient.sdk.cancelJob({ id: launchedJobId! }, superAdminOptions)
        );
      });
    });

    describe('job v3 from scheduled jobs', () => {
      let scheduledJobIdWithoutHeader: any, scheduledJobIdWithHeader: any;
      let randomHeader: any;

      afterAll(async () => {
        if (scheduledJobIdWithoutHeader) {
          await safe('delete scheduled job', async () =>
            gqlClient.sdk.deleteScheduledJob(
              { id: scheduledJobIdWithoutHeader },
              superAdminOptions
            )
          );
        }
        if (scheduledJobIdWithHeader) {
          await safe('delete scheduled job with header', async () =>
            gqlClient.sdk.deleteScheduledJob(
              { id: scheduledJobIdWithHeader },
              superAdminOptions
            )
          );
        }
      });

      it('create scheduled job v3 empty X-Veritone-Application header', async () => {
        const createScheduledJobResult = await gqlClient.sdk.createScheduledJob(
          {
            input: {
              name: `${citestMarker}-scheduled-job-${uuidv4()}`,
              runMode: RunMode.Now,
              details: {
                programFormat: 'Adult Contemporary',
                foo: 'bar',
                isNational: true
              },
              weeklyScheduleParts: [
                {
                  scheduledDay: DayOfWeek.Monday,
                  startTime: '09:00:00-08:00',
                  stopTime: '10:30-08:00'
                }
              ],
              jobTemplates: [
                {
                  skipDecider: true,
                  clusterId: clusterId,
                  jobConfig: {
                    createTDOInput: { details: { tags: ['foo', 'bar'] } }
                  },
                  routes: [{ parentIoFolderReferenceId: superAdminFolderId }],
                  taskTemplates: [
                    {
                      engineId: engineId,
                      ioFolders: [
                        {
                          referenceId: superAdminFolderId,
                          mode: IoFolderMode.Chunk,
                          type: IoFolderType.Output
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          },
          noHeaderOptions
        );

        expect(createScheduledJobResult).toBeDefined();
        scheduledJobIdWithoutHeader =
          createScheduledJobResult?.data?.createScheduledJob?.id;
        expect(scheduledJobIdWithoutHeader).toBeDefined();
      });

      it('launch job v3 from scheduled job with X-Veritone-Application header', async () => {
        const launchAppId = uuidv4();
        const reqOptions = optionsWithAppHeader(launchAppId);

        const launchRes = await gqlClient.sdk.launchScheduledJobs(
          {
            input: {
              scheduledJobId: scheduledJobIdWithoutHeader,
              payload: { maxIngestionJobs: 1 }
            }
          },
          reqOptions
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = launchRes?.data?.launchScheduledJobs?.[0]?.id;
        expect(launchedJobId).toBeDefined();
        const dbValue = await getJobContentApplicationId(launchedJobId!);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel job from scheduled job', async () =>
          gqlClient.sdk.cancelJob({ id: launchedJobId! }, superAdminOptions)
        );
      });

      it('create scheduled job v3 with X-Veritone-Application header', async () => {
        randomHeader = uuidv4();
        const reqOptions = optionsWithAppHeader(randomHeader);
        const createScheduledJobResult = await gqlClient.sdk.createScheduledJob(
          {
            input: {
              name: `${citestMarker}-scheduled-job-${uuidv4()}`,
              runMode: RunMode.Now,
              details: {
                programFormat: 'Adult Contemporary',
                foo: 'bar',
                isNational: true
              },
              weeklyScheduleParts: [
                {
                  scheduledDay: DayOfWeek.Monday,
                  startTime: '09:00:00-08:00',
                  stopTime: '10:30-08:00'
                }
              ],
              jobTemplates: [
                {
                  skipDecider: true,
                  clusterId: clusterId,
                  jobConfig: {
                    createTDOInput: { details: { tags: ['foo', 'bar'] } }
                  },
                  routes: [{ parentIoFolderReferenceId: superAdminFolderId }],
                  taskTemplates: [
                    {
                      engineId: engineId,
                      ioFolders: [
                        {
                          referenceId: superAdminFolderId,
                          mode: IoFolderMode.Chunk,
                          type: IoFolderType.Output
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          },
          reqOptions
        );

        expect(createScheduledJobResult).toBeDefined();
        scheduledJobIdWithHeader =
          createScheduledJobResult?.data?.createScheduledJob?.id;
        expect(scheduledJobIdWithHeader).toBeDefined();
      });

      it('launch job v3 from scheduled job empty X-Veritone-Application header should inherit content_application_id from scheduled job', async () => {
        const launchRes = await gqlClient.sdk.launchScheduledJobs(
          {
            input: {
              scheduledJobId: scheduledJobIdWithHeader,
              payload: { maxIngestionJobs: 1 }
            }
          },
          noHeaderOptions
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = launchRes?.data?.launchScheduledJobs?.[0]?.id;
        expect(launchedJobId).toBeDefined();
        const dbValue = await getJobContentApplicationId(launchedJobId!);
        expect(dbValue).toEqual(randomHeader);

        await safe('cancel job from scheduled job with header', async () =>
          gqlClient.sdk.cancelJob({ id: launchedJobId! }, superAdminOptions)
        );
      });
    });

    describe('launch single engine job v3', () => {
      let uploadEngineDataNoHeader: any, uploadEngineDataWithHeader: any;
      beforeAll(async () => {
        // create engine with out header
        const uploadEngine = await gqlClient.sdk.createEngine(
          {
            input: {
              name: citestMarker + '-upload-engine-' + uuidv4(),
              categoryId: engineCategoryId,
              deploymentModel: DeploymentModel.FullyNetworkIsolated
            }
          },
          noHeaderOptions
        );
        uploadEngineDataNoHeader = uploadEngine?.data?.createEngine;

        await buildAndDeployEngine(
          uploadEngineDataNoHeader.id,
          superAdminOptions
        );

        await gqlClient.sdk.updateEngine(
          {
            input: {
              id: uploadEngineDataNoHeader.id,
              standaloneJobTemplates: [
                {
                  type: JobTemplateEnumType.Upload,
                  template: testTemplateTextUploadChunk
                }
              ]
            }
          },
          superAdminOptions
        );

        // create engine with header
        const headerAppId = uuidv4();
        const reqOptions = optionsWithAppHeader(headerAppId);
        const uploadEngineWithHeader = await gqlClient.sdk.createEngine(
          {
            input: {
              name: citestMarker + '-upload-engine-' + uuidv4(),
              categoryId: engineCategoryId,
              deploymentModel: DeploymentModel.FullyNetworkIsolated
            }
          },
          reqOptions
        );
        uploadEngineDataWithHeader = uploadEngineWithHeader?.data?.createEngine;

        await buildAndDeployEngine(
          uploadEngineDataWithHeader.id,
          superAdminOptions
        );

        await gqlClient.sdk.updateEngine(
          {
            input: {
              id: uploadEngineDataWithHeader.id,
              standaloneJobTemplates: [
                {
                  type: JobTemplateEnumType.Upload,
                  template: testTemplateTextUploadChunk
                }
              ]
            }
          },
          superAdminOptions
        );
      });

      afterAll(async () => {
        if (uploadEngineDataNoHeader) {
          await safe('delete upload engine without header', async () =>
            gqlClient.sdk.deleteEngine(
              { id: uploadEngineDataNoHeader.id },
              superAdminOptions
            )
          );
        }

        if (uploadEngineDataWithHeader) {
          await safe('delete upload engine with header', async () =>
            gqlClient.sdk.deleteEngine(
              { id: uploadEngineDataWithHeader.id },
              superAdminOptions
            )
          );
        }
      });

      it('launch engine job v3 empty X-Veritone-Application header', async () => {
        const result = await gqlClient.sdk.launchSingleEngineJob(
          {
            input: {
              engineId: uploadEngineDataNoHeader.id,
              clusterId: clusterId,
              uploadUrl: 'http://localhost',
              priority: 1
            }
          },
          noHeaderOptions
        );

        expect(result).toBeDefined();
        expect(result?.data?.launchSingleEngineJob?.clusterId).toEqual(
          clusterId
        );
        const jobId = result?.data?.launchSingleEngineJob?.id;
        expect(jobId).toBeDefined();

        const dbValue = await getJobContentApplicationId(jobId!);
        expect(dbValue).toEqual('');

        await safe('cancel engine job without header', async () =>
          gqlClient.sdk.cancelJob({ id: jobId! }, superAdminOptions)
        );
      });

      it('launch engine job v3 with X-Veritone-Application header', async () => {
        const launchAppId = uuidv4();
        const reqOptions = optionsWithAppHeader(launchAppId);

        const launchJob = await gqlClient.sdk.launchSingleEngineJob(
          {
            input: {
              engineId: uploadEngineDataNoHeader.id,
              clusterId: clusterId,
              uploadUrl: 'http://localhost',
              priority: 1
            }
          },
          reqOptions
        );

        const jobId = launchJob?.data?.launchSingleEngineJob?.id;
        expect(jobId).toBeDefined();

        const dbValue = await getJobContentApplicationId(jobId!);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel engine job with header', async () =>
          gqlClient.sdk.cancelJob({ id: jobId! }, reqOptions)
        );
      });

      // unskip when supporting store application id in engine and child job inherit it is released
      it.skip('launch engine job v3 should inherit header as content_application_id', async () => {
        const result = await gqlClient.sdk.launchSingleEngineJob(
          {
            input: {
              engineId: uploadEngineDataWithHeader.id,
              clusterId: clusterId,
              uploadUrl: 'http://localhost',
              priority: 1
            }
          },
          noHeaderOptions
        );

        expect(result).toBeDefined();
        expect(result?.data?.launchSingleEngineJob?.clusterId).toEqual(
          clusterId
        );
        const jobId = result?.data?.launchSingleEngineJob?.id;
        expect(jobId).toBeDefined();

        const dbValue = await getJobContentApplicationId(jobId!);
        expect(dbValue).toEqual('');

        await safe('cancel engine job without header', async () =>
          gqlClient.sdk.cancelJob({ id: jobId! }, superAdminOptions)
        );
      });
    });
  });
});

async function buildAndDeployEngine(
  engineId: string,
  options: Record<string, string>,
  isPublic = false
): Promise<void> {
  // Create engine build and deploy it
  const engineBuildRes = await gqlClient.sdk.createEngineBuild(
    {
      input: {
        engineId: engineId,
        taskRuntime: { nodeRed: true },
        manifest: { runtime: 'NodeRed' }
      }
    },
    options
  );
  const engineBuildId = engineBuildRes?.data?.createEngineBuild?.id;

  const buildEngineActionListToUse = isPublic
    ? publicBuildEngineActionList
    : buildEngineActionList;
  // Submit and deploy the build
  for (const action of buildEngineActionListToUse) {
    await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildId!,
          engineId: engineId,
          action: action
        }
      },
      options
    );
  }
}
