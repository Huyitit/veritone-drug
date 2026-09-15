// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  ClusterStatus,
  ClusterType,
  DayOfWeek,
  DeploymentModel,
  EngineState,
  JobDateTimeField,
  RunMode,
  SchemaStatus,
  SetClusterPermission,
  SourcePermission,
  TaskDateTimeField,
  TaskFailureReason,
  TaskStatus,
  UpdateJobsStatus
} from '../../src/gql';
import path from 'path';
import supertest from 'supertest';
import { helpers } from '../../src/helpers';
import { processTDODeletion } from '../../src/helpers/tdoHelper';
import _ from 'lodash';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';

const citestMarker = 'citest-should-delete';
const testKey = citestMarker + Date.now().toString();
const testName = `${citestMarker}_schedule_job_` + Date.now();
const startDateTime = moment().subtract(2, 'hour').unix();
const stopDateTime = moment().subtract(1, 'hour').unix();

let mediaStreamerHeader: any;
let engineId: any,
  jobId: any,
  tdoId: any,
  taskId: any,
  nullTaskId: any,
  existingTaskId: any,
  jwt: any,
  cancelJobId: any;
let schemaId: any;
let signedUrl: any, unsignedUrl: any, assetId: any;
let dataRegistryId: any,
  sourceId: any,
  scheduledJobId: any,
  jobIdWithScheduleJob: any,
  sourceVideoId: any,
  programVideoFormat: any,
  scheduledJobVideoId: any;
let tdoIdWithScheduleJob: any,
  taskIdWithScheduleJob: any,
  clusterId: any,
  clusterId1: any,
  taskIdNotificationUrls: any,
  jobIdNotificationUrls: any,
  tdoIdLaunchProgram: any;
let engineIdRequiredLibrary: any, applicationId: any;
let tdoIdFromScheduledJob1: any,
  tdoIdFromScheduledJob2: any,
  tdoIdFromLaunchScheduledJob1: any;
let dagTemplateId: any, jobIdWithDagTemplate: any;
const dagTemplateName = 'test dag template';
const internalEngineId = 'insert-into-index';
const sampleDagTemplate = `
{
  "tasks": [
    {
      "engineId": "{{{firstEngineId}}}",
      "payload": {
        "url": "{{{UPLOAD_URL}}}"
      },
      "executionPreferences": {
        {{#if priorityOfFirst}} "priority": {{minus priorityOfFirst 5}} {{/if}}
      },
      "ioFolders": [
        {
          "referenceId": "wsa-output",
          "mode": "stream",
          "type": "output"
        }
      ]
    },
    {
      "engineId": "{{{secondEngineId}}}",
      "executionPreferences": {
        {{#if priority}} "priority": {{{priority}}}, {{/if}}
        "parentCompleteBeforeStarting": true
      },
      "ioFolders": [
        {
          "referenceId": "pb-input",
          "mode": "stream",
          "type": "input"
        }
      ]
    },
    {
      "engineId": "8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440",
      "payload": {
        "ffmpegTemplate": "video",
        "customFFMPEGProperties": {
          "chunkSizeInSeconds": {{#if chunkSizeInSeconds}} "{{{chunkSizeInSeconds}}}" {{else}} "300" {{/if}}
        }
      },
      "executionPreferences": {
        {{#if priority}} "priority": {{{priority}}}, {{/if}}
        "parentCompleteBeforeStarting": true
      },
      "ioFolders": [
        {
          "referenceId": "si-input",
          "mode": "stream",
          "type": "input"
        },
        {
          "referenceId": "si-output",
          "mode": "chunk",
          "type": "output"
        }
      ]
    },
    {
      "engineId": "8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3",
      "executionPreferences": {
        {{#if priority}} "priority": {{{priority}}}, {{/if}}
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
  ],
  "routes": [
    {
      "parentIoFolderReferenceId": "wsa-output",
      "childIoFolderReferenceId": "pb-input"
    },
    {
      "parentIoFolderReferenceId": "wsa-output",
      "childIoFolderReferenceId": "si-input"
    },
    {
      "parentIoFolderReferenceId": "si-output",
      "childIoFolderReferenceId": "ow-input"
    }
  ]
}
`;

let tmpScheduledJobId: string;
let deleteJobIds: string[] = [];
let deleteTaskIds: string[] = [];

describe('citest_jobs: basic jobs test', () => {
  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;

    mediaStreamerHeader = helpers.mediaStreamerHeader(
      gqlClient.sessionToken as string
    );
  });

  afterAll(async () => {
    if (tmpScheduledJobId) {
      await safe('delete tmpScheduledJobId', async () =>
        gqlClient.sdk.deleteScheduledJob({ id: tmpScheduledJobId })
      );
    }

    if (sourceId) {
      await safe('delete sourceId', async () =>
        gqlClient.sdk.deleteSource({ id: sourceId })
      );
    }

    // delete created tasks
    if (deleteTaskIds.length > 0) {
      for (const taskId of _.uniq(_.compact(deleteTaskIds))) {
        await safe(`abort task`, () =>
          gqlClient.sdk.updateTask({
            input: { id: taskId, status: TaskStatus.Aborted }
          })
        );
      }
    }

    // delete created jobs
    if (deleteJobIds.length > 0) {
      for (const jobId of _.uniq(_.compact(deleteJobIds))) {
        await safe(`update job to queued`, () =>
          gqlClient.sdk.updateJobs({
            input: { ids: [jobId], status: UpdateJobsStatus.Queued }
          })
        );

        await safe(`cancel job`, () => gqlClient.sdk.cancelJob({ id: jobId }));
      }
    }

    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  it('Finds engine that does not create TDO', async () => {
    const [enginesData, engineLibraryRequiredData, urlRes] = await Promise.all([
      gqlClient.sdk.engines({
        id: internalEngineId
      }),

      gqlClient.sdk.engines({
        libraryRequired: true,
        state: [EngineState.Active],
        limit: 1
      }),

      gqlClient.sdk.getSignedWritableUrl()
    ]);

    const engines = enginesData?.data?.engines;
    const records = engines?.records;
    expect(records && records[0] && records[0].id).toBeDefined();
    expect(records && records[0] && records[0].createsTDO).toBeDefined();
    expect(records && records[0] && records[0].createsTDO).toBe(false);
    expect(records && records[0] && records[0].state).toBeDefined();
    expect(records && records[0] && records[0].state).toBe(EngineState.Active);
    engineId = records?.[0]?.id;

    const enginesWithLibraryRequired = engineLibraryRequiredData?.data?.engines;
    const recordsWithLibraryRequired = enginesWithLibraryRequired?.records;
    expect(
      recordsWithLibraryRequired &&
        recordsWithLibraryRequired[0] &&
        recordsWithLibraryRequired[0].id
    ).toBeDefined();
    engineIdRequiredLibrary = recordsWithLibraryRequired?.[0]?.id;

    const signedUrlData = urlRes?.data?.getSignedWritableUrl;
    expect(signedUrlData).toBeDefined();
    expect(signedUrlData?.url).toBeDefined();
    signedUrl = signedUrlData?.url;

    unsignedUrl = signedUrlData?.unsignedUrl;
    expect(unsignedUrl).toBeDefined();
  });

  it('get or create a dataRegistry and its schema', async () => {
    const createDataRegistryRes = await gqlClient.sdk.createDataRegistry({
      input: {
        name: `${citestMarker} Youtube Source Schema`,
        description: 'A data registry for Youtube source schema',
        source: 'Youtube'
      }
    });
    dataRegistryId = createDataRegistryRes?.data?.createDataRegistry?.id;
    expect(dataRegistryId).toBeDefined();
    await createAndUpdateSchema(gqlClient, dataRegistryId);
  });

  it('get or create a source for scheduled job test', async () => {
    const sourceRes = await gqlClient.sdk.createSource({
      input: {
        sourceTypeId: '1',
        name: `${citestMarker}_jobTest`,
        isPublic: false
      }
    });
    sourceId = sourceRes?.data?.createSource?.id;
    expect(sourceId).toBeDefined();
  });

  it.skip('find test source - Youtube channel or Podcast', async function () {
    const sourceRes = await gqlClient.sdk.sources({
      sourceTypeIds: ['3', '4'],
      limit: 1,
      permission: SourcePermission.Owner
    });
    const sourceRecords = sourceRes?.data?.sources?.records;
    expect(
      sourceRecords && sourceRecords[0] && sourceRecords[0].id
    ).toBeDefined();
    expect(sourceRecords.length).toEqual(1);
    sourceVideoId = sourceRecords[0].id;
    programVideoFormat = sourceRecords[0]?.sourceType?.programFormats?.[0];
    expect(programVideoFormat).toBeDefined();
  });

  it('create a test cluster for another org as superadmin', async () => {
    const clusterRes = await gqlClient.sdk.createCluster({
      input: {
        name: testKey,
        type: ClusterType.Ami,
        organizationId: '17560',
        dockerCredentials: {},
        containerTag: 'test',
        paused: true,
        memorySize: '1gb',
        storageSize: '8gb',
        tags: [],
        allowedEngines: [],
        collaborators: [
          { organizationId: '7862', permission: SetClusterPermission.Viewer }
        ],
        clusterConfig: {
          restartTimeUTC: '03:00',
          mediaStoragePath: '../mnnt/',
          mediaStorage: 'edge',
          managementNodeId: ''
        },
        edgeVersion: 3
      }
    });
    clusterId = clusterRes?.data?.createCluster?.id;
    expect(clusterId).toBeDefined();
    expect(clusterRes?.data?.createCluster?.collaborators?.count).toEqual(1);
    expect(clusterRes?.data?.createCluster?.organizationId).toEqual('17560');
    expect(
      clusterRes?.data?.createCluster?.collaborators?.records[0].permission
    ).toEqual('viewer');
  });

  it('create cluster for testing - current orgnizationId', async () => {
    const clusterRes = await gqlClient.sdk.createCluster({
      input: {
        name: testKey,
        type: ClusterType.Rt,
        dockerCredentials: {},
        allowedEngines: [],
        status: ClusterStatus.Active,
        edgeVersion: 3
      }
    });
    expect(clusterRes?.data?.createCluster?.id).toBeDefined();
    expect(clusterRes?.data?.createCluster?.edgeVersion).toEqual(3);

    clusterId1 = clusterRes?.data?.createCluster?.id;
    expect(clusterId1).toBeDefined();
  });

  it('create a scheduled job', async () => {
    const createScheduledJobResult = await gqlClient.sdk.createScheduledJob({
      input: {
        name: `${testName}-job`,
        runMode: RunMode.Now,
        details: {
          programFormat: 'Adult Contemporary',
          foo: 'bar',
          isNational: true
        },
        contentTemplates: [
          {
            schemaId: schemaId,
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
            scheduledDay: DayOfWeek.Monday,
            startTime: '09:00:00-08:00',
            stopTime: '10:30-08:00'
          }
        ],
        jobTemplates: [
          {
            skipDecider: true,
            clusterId: clusterId1,
            jobConfig: {
              createTDOInput: { details: { tags: ['foo', 'bar'] } }
            },
            taskTemplates: [
              {
                engineId: engineId,
                payload: { foo: 'bar', sourceId: sourceId }
              }
            ]
          }
        ]
      }
    });

    scheduledJobId = createScheduledJobResult?.data?.createScheduledJob?.id;
    expect(scheduledJobId).toBeDefined();

    jobIdWithScheduleJob =
      createScheduledJobResult?.data?.createScheduledJob?.jobs?.records?.[0]
        ?.id;
    expect(jobIdWithScheduleJob).toBeDefined();

    tdoIdWithScheduleJob =
      createScheduledJobResult?.data?.createScheduledJob?.jobs?.records?.[0]
        ?.targetId;
    expect(tdoIdWithScheduleJob).toBeDefined();

    taskIdWithScheduleJob =
      createScheduledJobResult?.data?.createScheduledJob?.jobs?.records?.[0]
        ?.tasks?.records?.[0]?.id;
    expect(taskIdWithScheduleJob).toBeDefined();

    tdoIdFromScheduledJob1 = getTdoIdFromScheduledJob(createScheduledJobResult);
  });

  it.skip('create a scheduled job - for video source', async function () {
    const createScheduledJobResult = await gqlClient.sdk.createScheduledJob({
      input: {
        name: '${testName}-schedule-job-test',
        runMode: RunMode.Recurring,
        details: {
          programFormat: programVideoFormat,
          foo: 'bar',
          isNational: true
        },
        isPublic: false,
        contentTemplates: [
          {
            schemaId: '${dataRegistryId}',
            data: {
              url: 'https://youtube.com/channel/123',
              youtubeChannelUrl: 'https://youtube.com/channel/123',
              liveTimezone: 'PST'
            }
          }
        ],
        jobTemplates: [
          {
            skipDecider: true,
            clusterId: clusterId1,
            jobConfig: {
              createTDOInput: { details: { tags: ['foo', 'bar'] } }
            },
            taskTemplates: [
              {
                engineId: engineId,
                payload: { foo: 'bar', sourceId: sourceVideoId }
              }
            ]
          }
        ]
      }
    });

    expect(
      createScheduledJobResult?.data?.createScheduledJob?.id
    ).toBeDefined();
    expect(
      createScheduledJobResult?.data?.createScheduledJob.primarySourceId
    ).toEqual(sourceVideoId);
    expect(
      createScheduledJobResult?.data?.createScheduledJob?.jobs?.count
    ).toEqual(0);

    scheduledJobVideoId =
      createScheduledJobResult?.data?.createScheduledJob?.id;
    expect(scheduledJobVideoId).toBeDefined();
  });

  it.skip('create tdo with launchProgram is true', async function () {
    const createTdo = await gqlClient.sdk.createTDO({
      input: {
        startDateTime: startDateTime,
        stopDateTime: stopDateTime,
        sourceData: {
          sourceId: sourceVideoId
        },
        launchProgram: true
      }
    });

    expect(createTdo?.data?.createTDO).toBeDefined();
    expect(createTdo?.data?.createTDO?.id).toBeTruthy();
    expect(createTdo?.data?.createTDO?.jobs?.count).toBeGreaterThan(0);

    tdoIdLaunchProgram = createTdo?.data?.createTDO?.id;
  });

  it('retry a job', async () => {
    const retryJobResult = await gqlClient.sdk.retryJob({
      id: jobIdWithScheduleJob
    });

    expect(retryJobResult?.data?.retryJob).toBeDefined();
    expect(retryJobResult?.data?.retryJob?.id).not.toEqual(
      jobIdWithScheduleJob
    );

    const jobId = _.get(retryJobResult, 'data.retryJob.id', '');
    deleteJobIds.push(jobId);

    expect(retryJobResult?.data?.retryJob?.tasks).toBeTruthy();
    expect(retryJobResult?.data?.retryJob?.routes).toBeTruthy();
    for (const task of retryJobResult?.data?.retryJob?.tasks?.records || []) {
      expect(task?.status).not.toEqual('failed');
    }
  });

  it('update task in schedule job to complete', async () => {
    const updateTaskResult = await gqlClient.sdk.updateTask({
      input: {
        id: taskIdWithScheduleJob,
        status: TaskStatus.Complete
      }
    });

    expect(updateTaskResult?.data?.updateTask?.status).toEqual(
      TaskStatus.Complete
    );
    // The completedDateTime will not be updated if task status was moved from "pending" to "completed"
    // See: https://github.com/veritone/core-job-server/blob/master/src/route/task.js#L297-L311
    expect(updateTaskResult?.data?.updateTask?.modifiedDateTime).toBeTruthy();
    expect(updateTaskResult?.data?.updateTask?.completedDateTime).toBeDefined();
    expect(updateTaskResult?.data?.updateTask?.startedDateTime).toBeDefined();
  });

  it('cancelJob should fail if tasks are not all in pending or queued', async () => {
    try {
      await gqlClient.sdk.cancelJob({
        id: jobIdWithScheduleJob
      });
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('launch a schedule job one more time - for creating job with scheduleJobId', async () => {
    const launchScheduledJobResult = await gqlClient.sdk.launchScheduledJobs({
      input: {
        scheduledJobId: scheduledJobId,
        payload: {
          maxIngestionJobs: 1
        }
      }
    });

    const launchedJobs = launchScheduledJobResult?.data?.launchScheduledJobs;
    expect(launchedJobs).toBeDefined();

    expect(launchedJobs?.[0]?.id).toBeTruthy();
    tdoIdFromLaunchScheduledJob1 = _.get(launchedJobs, '[0].targetId', '');
    const getJobByIdResult = await gqlClient.sdk.job({
      id: launchedJobs?.[0]?.id!
    });
    deleteJobIds.push(_.get(getJobByIdResult, 'data.job.id', ''));

    expect(getJobByIdResult?.data?.job).toBeDefined();
    expect(
      getJobByIdResult?.data?.job?.tasks?.records?.[0]?.payload
    ).toMatchObject({ maxIngestionJobs: 1 });
    deleteTaskIds.push(
      _.get(getJobByIdResult, 'data.job.tasks.records[0].id', '')
    );
  });

  it('create a job with tdo in schedule job - for testing process limit for org', async () => {
    const createJob = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoIdWithScheduleJob,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: {
              engineReturnValue: true
            }
          }
        ]
      }
    });

    expect(createJob?.data?.createJob?.id).toBeDefined();
    deleteJobIds.push(_.get(createJob, 'data.createJob.id', ''));
  });

  it('creates a TDO with asset - deprecated mediaId', async () => {
    const query = `
mutation {
  createTDOWithAsset(input: {
    startDateTime:${startDateTime},
    assetType: "media"
    contentType: "video/mp4"
  }) {
    id
    mediaId
    assets {
      records {
        id
        uri
        signedUri
      }
    }
  }
}
    `;

    const filePath = path.join(__dirname, './../../../../data/movie.mp4');
    const result = await gqlClient.uploadFile(query, 'movie.mp4', filePath);
    const text = JSON.parse(result.text);

    tdoId = text.data.createTDOWithAsset.id;
    expect(text.data.createTDOWithAsset.id).toBeTruthy();
  });

  it('creates media segments', async () => {
    const addSegmentsResult = await gqlClient.sdk.AddSegments({
      containerId: tdoId,
      segmentGroupId: '0adfa9f1-2d32-4194-99e7-fa3bc93a5bff',
      url: 'https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2'
    });

    expect(addSegmentsResult?.data?.seg1?.id).toBeTruthy();
    expect(addSegmentsResult?.data?.seg1?.primaryAsset?.contentType).toEqual(
      'application/json'
    );
    expect(addSegmentsResult?.data?.seg1?.primaryAsset?.assetType).toEqual(
      'media-mdp'
    );
    expect(tdoId).toBeTruthy();
  });

  it('creates media segments in parallel', async () => {
    const requests = [];
    for (let start = 0; start < 300; start += 5) {
      const addSegmentPromise = gqlClient.sdk.AddSegment({
        containerId: tdoId,
        segmentGroupId: '0adfa9f1-2d32-4194-99e7-fa3bc93a5bff',
        url: 'https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2',
        startMs: start * 1000,
        stopMs: start * 1000 + 5000
      });
      requests.push(addSegmentPromise);
    }

    function shuffleArray(array: Array<any>) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
    }
    shuffleArray(requests);
    await Promise.all(requests);

    const tempotalDataObjResult = await gqlClient.sdk.temporalDataObject({
      id: tdoId
    });

    expect(tempotalDataObjResult?.data?.temporalDataObject?.id).toEqual(tdoId);
    const start = moment(
      tempotalDataObjResult?.data?.temporalDataObject?.startDateTime
    );
    const stop = moment(
      tempotalDataObjResult?.data?.temporalDataObject?.stopDateTime
    );
    expect(stop.diff(start, 'seconds')).toEqual(900);
  });

  it('creates media segments - in bulk - another segmentGroupId', async () => {
    const exSegmentGroupId = '281fb119-2e13-485b-8333-baaeda19a48d';
    const addMediaSegmentsResult = await gqlClient.sdk.AddMediaSegments({
      containerId: tdoId,
      segments: [
        {
          url: 'https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2',
          details: {
            codecs: 'avc1.64001e,mp4a.40.2',
            segmentGroupId: exSegmentGroupId,
            targetSegmentDurationMs: 2000
          }
        },
        {
          url: 'https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2',
          details: {
            segmentStartTimeMs: 0,
            segmentStopTimeMs: 2000,
            segmentGroupId: exSegmentGroupId,
            segmentIndex: 0
          }
        },
        {
          url: 'https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2',
          details: {
            segmentStartTimeMs: 2000,
            segmentStopTimeMs: 4000,
            segmentGroupId: exSegmentGroupId,
            segmentIndex: 1
          }
        }
      ]
    });

    expect(addMediaSegmentsResult?.data?.addMediaSegments?.id).toBeDefined();
    expect(
      addMediaSegmentsResult?.data?.addMediaSegments?.primaryAsset?.id
    ).toBeDefined();
  });

  it('validates URL field on media segments', async () => {
    const addMediaSegmentsResult = gqlClient.sdk.AddMediaSegments({
      containerId: tdoId,
      segments: [
        {
          url: '',
          details: {
            segmentStartTimeMs: 2000,
            segmentStopTimeMs: 4000
          }
        }
      ]
    });

    await expect(addMediaSegmentsResult).rejects.toThrow('invalid_input');
  });

  it('validates URL string on media segments', async () => {
    const res = gqlClient.sdk.addMediaSegment({
      input: {
        containerId: tdoId,
        url: 'invalid_url',
        details: {
          segmentStartTimeMs: 0,
          segmentStopTimeMs: 2000
        }
      }
    });

    await expect(res).rejects.toThrow('invalid_input');
  });

  it('updates the TDO to recorded', async () => {
    const updateTdoResult = await gqlClient.sdk.updateTDO({
      input: {
        id: tdoId,
        status: 'recorded'
      }
    });

    expect(
      updateTdoResult?.data?.updateTDO?.streamManifest?.segments?.length
    ).toEqual(62);
    expect(
      updateTdoResult?.data?.updateTDO?.streamManifest?.initSegment
    ).toBeTruthy();
  });

  it('create a job and should throw error - No access to engine', async () => {
    const res = gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: {
              engineReturnValue: true
            }
          },
          {
            engineId: 'noaccessengine',
            payload: { engineReturnValue: true }
          }
        ]
      }
    });

    await expect(res).rejects.toThrow('not_allowed');
  });

  it('create a job and should throw error - Invalid libraryTypes', async () => {
    const res = gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: {
              engineReturnValue: true,
              libraryTypes: {}
            }
          }
        ]
      }
    });

    await expect(res).rejects.toThrow('invalid libraryTypes');
  });

  it('throw error if create a job in cluster of other org', async () => {
    const res = gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: {
              engineReturnValue: true
            }
          }
        ],
        clusterId: clusterId
      }
    });

    await expect(res).rejects.toThrow('no access');
  });

  it('create a job', async () => {
    const createJobResult = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: { engineReturnValue: true }
          }
        ]
      }
    });

    expect(createJobResult?.data?.createJob?.id).toBeDefined();
    jobId = _.get(createJobResult, 'data.createJob.id', '');
    taskId = _.get(createJobResult, 'data.createJob.tasks.records[0].id', '');
    deleteJobIds.push(jobId);
    deleteTaskIds.push(taskId);
    expect(
      createJobResult?.data?.createJob?.tasks?.records?.[0]?.id
    ).toBeDefined();
  });

  it('create a job - with name and description', async () => {
    const createJobResult = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        skipDecider: true,
        name: 'test name',
        description: 'test description',
        tasks: [
          {
            engineId: engineId,
            payload: { engineReturnValue: true }
          }
        ]
      }
    });
    expect(createJobResult?.data?.createJob?.id).toBeDefined();
    jobId = _.get(createJobResult, 'data.createJob.id', '');
    taskId = _.get(createJobResult, 'data.createJob.tasks.records[0].id', '');
    deleteJobIds.push(jobId);
    deleteTaskIds.push(taskId);
    expect(createJobResult?.data?.createJob?.name).toEqual('test name');
    expect(createJobResult?.data?.createJob?.description).toEqual(
      'test description'
    );
    expect(createJobResult?.data?.createJob?.jobConfig.name).toEqual(
      'test name'
    );
    expect(createJobResult?.data?.createJob?.jobConfig.description).toEqual(
      'test description'
    );
  });

  it('creates a job with no task output', async () => {
    const createJobResult = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: { engineReturnValue: true }
          }
        ]
      }
    });

    expect(
      createJobResult?.data?.createJob?.tasks?.records?.[0]?.id
    ).toBeDefined();
    nullTaskId = _.get(
      createJobResult,
      'data.createJob.tasks.records[0].id',
      ''
    );
    deleteJobIds.push(_.get(createJobResult, 'data.createJob.id', ''));
    deleteTaskIds.push(nullTaskId);
  });

  it('create a DAG template', async () => {
    const createDagTemplateResult = await gqlClient.sdk.createDagTemplate({
      input: {
        name: dagTemplateName,
        dag: sampleDagTemplate,
        dagTemplateLanguage: 'Handlebars',
        tags: ['foo', 'bar']
      }
    });

    dagTemplateId = createDagTemplateResult?.data?.createDagTemplate?.id;
    expect(dagTemplateId).toBeDefined();
    expect(createDagTemplateResult?.data?.createDagTemplate?.tags).toEqual([
      'foo',
      'bar'
    ]);
  });

  it('create a job with DAG template', async () => {
    const createJobWithDagTemplateResult =
      await gqlClient.sdk.launchDAGTemplate({
        input: {
          uploadUrl: 'http://localhost',
          clusterId: clusterId1,
          dagTemplateId: dagTemplateId,
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
      });
    jobIdWithDagTemplate =
      createJobWithDagTemplateResult?.data?.launchDAGTemplate?.id;
    deleteJobIds.push(jobIdWithDagTemplate);

    expect(jobIdWithDagTemplate).toBeDefined();
    expect(
      createJobWithDagTemplateResult?.data?.launchDAGTemplate?.targetId
    ).toBeDefined();
    expect(
      createJobWithDagTemplateResult?.data?.launchDAGTemplate?.tasks?.count
    ).toEqual(4);
    expect(
      createJobWithDagTemplateResult?.data?.launchDAGTemplate?.routes?.length
    ).toEqual(3);
  });

  it('get a job with DAG template', async () => {
    const getJobWithDagTemplateResult = await gqlClient.sdk.job({
      id: jobIdWithDagTemplate
    });

    expect(getJobWithDagTemplateResult?.data?.job?.dagTemplate?.id).toEqual(
      dagTemplateId
    );
    expect(getJobWithDagTemplateResult?.data?.job?.dagTemplate?.name).toEqual(
      dagTemplateName
    );
  });

  it('get jobs by DAG template', async () => {
    const getJobsByDagTemplateResult = await gqlClient.sdk.jobs({
      dagTemplateIds: [dagTemplateId]
    });

    expect(
      getJobsByDagTemplateResult?.data?.jobs?.records?.[0]?.dagTemplate?.id
    ).toEqual(dagTemplateId);
    expect(
      getJobsByDagTemplateResult?.data?.jobs?.records?.[0]?.dagTemplate?.name
    ).toEqual(dagTemplateName);
  });

  it('cancel job with DAG template', async () => {
    const cancelJobResult = await gqlClient.sdk.cancelJob({
      id: jobIdWithDagTemplate
    });

    expect(cancelJobResult?.data?.cancelJob?.id).toEqual(jobIdWithDagTemplate);
  });

  it('should delete DAG template', async () => {
    const deleteDagTemplateResult = await gqlClient.sdk.deleteDagTemplate({
      id: dagTemplateId
    });

    expect(deleteDagTemplateResult?.data?.deleteDagTemplate?.id).toEqual(
      dagTemplateId
    );
  });

  it('create a job with library', async () => {
    const createJobResult = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        skipDecider: true,
        tasks: [
          {
            engineId: engineIdRequiredLibrary,
            payload: {
              libraryId: 'ecde841d-37cc-405a-b2a0-20e3f9372faf',
              libraryEngineModelId: 'd789bc86-9a4a-4c22-80c3-5dbdef91980d'
            }
          }
        ]
      }
    });

    expect(createJobResult?.data?.createJob?.id).toBeTruthy();
    expect(
      createJobResult?.data?.createJob?.tasks?.records?.[0]?.id
    ).toBeTruthy();
    deleteJobIds.push(_.get(createJobResult, 'data.createJob.id', ''));
    deleteTaskIds.push(
      _.get(createJobResult, 'data.createJob.tasks.records[0].id', '')
    );
  });

  it('can fetch the created task with null taskOutput', async () => {
    const getTaskByIdResult = await gqlClient.sdk.task({
      id: nullTaskId
    });

    expect(getTaskByIdResult?.data?.task?.taskOutput).toEqual(null);
  });

  it.skip('upload result to signed URL', async () => {
    const data = require('../../../../data/engineAsset.json');
    // FIXME: we need find a way to run this test case when running the test with local-compose.
    // the signedURL is generated from core-graphql with a internal host minio
    if (signedUrl.includes('//minio:9000')) {
      return;
    }
    supertest(signedUrl);
    const test = await supertest(signedUrl).put('').send(data).expect(200);
  });

  it('uploads engine result - first time', async () => {
    const uploadengineResult = await gqlClient.sdk.uploadEngineResult({
      input: {
        taskId: taskId,
        uri: `${unsignedUrl}?v=1`,
        clientTimestamp: moment().toISOString(),
        isAccumulatedResult: true,
        setTaskOutput: false
      }
    });

    assetId = uploadengineResult?.data?.uploadEngineResult?.id;
    expect(assetId).toBeDefined();
    expect(uploadengineResult?.data?.uploadEngineResult?.uri).toEqual(
      unsignedUrl + '?v=1'
    );
    expect(uploadengineResult?.data?.uploadEngineResult?.assetType).toEqual(
      'vtn-standard'
    );
    expect(uploadengineResult?.data?.uploadEngineResult?.contentType).toEqual(
      'application/json'
    );
  });

  it('uploads engine result - second time', async () => {
    const uploadEngineResult = await gqlClient.sdk.uploadEngineResult({
      input: {
        taskId: taskId,
        assetType: 'vtn-standard',
        contentType: 'application/json',
        uri: `${unsignedUrl}?v=2`,
        clientTimestamp: moment().toISOString(),
        isAccumulatedResult: true,
        setTaskOutput: false
      }
    });

    expect(uploadEngineResult?.data?.uploadEngineResult?.id).toEqual(assetId);
    expect(uploadEngineResult?.data?.uploadEngineResult?.uri).toEqual(
      unsignedUrl + '?v=2'
    );
  });

  it('uploads engine result - third time, stale timestamp', async () => {
    const uploadEngineResult = await gqlClient.sdk.uploadEngineResult({
      input: {
        taskId: taskId,
        assetType: 'vtn-standard',
        contentType: 'application/json',
        uri: `${unsignedUrl}?v=3`,
        clientTimestamp: moment().subtract(2, 'minutes').toISOString(),
        isAccumulatedResult: true,
        setTaskOutput: false
      }
    });

    expect(uploadEngineResult?.data?.uploadEngineResult?.id).toEqual(assetId);
    expect(uploadEngineResult?.data?.uploadEngineResult?.uri).toEqual(
      unsignedUrl + '?v=2'
    );
  });

  it('get engine JWTs', async () => {
    const getEngineJWTResult = await gqlClient.sdk.getEngineJWT({
      input: {
        engineId: engineId,
        resource: {
          tdoId: tdoId,
          jobId: jobId,
          taskId: taskId
        }
      }
    });

    jwt = getEngineJWTResult?.data?.getEngineJWT?.token;
    expect(jwt).toBeDefined();
  });

  it('have correct rights on JWT', async () => {
    const myRight = await gqlClient.sdk.MyRights(
      {},
      {
        Authorization: 'Bearer ' + jwt,
        'Content-Type': 'application/json'
      }
    );
    const temporalDataObjectResult = await gqlClient.sdk.temporalDataObject(
      {
        id: tdoId
      },
      {
        Authorization: 'Bearer ' + jwt,
        'Content-Type': 'application/json'
      }
    );
    const getSignedUrlResult = await gqlClient.sdk.getSignedWritableUrl(
      {},
      {
        Authorization: 'Bearer ' + jwt,
        'Content-Type': 'application/json'
      }
    );

    expect(myRight?.data?.myRights?.resources?.Job?.[0]).toEqual(jobId);
    expect(myRight?.data?.myRights?.resources?.Task?.[0]).toEqual(taskId);
    expect(temporalDataObjectResult?.data?.temporalDataObject?.id).toEqual(
      tdoId
    );
    expect(getSignedUrlResult?.data?.getSignedWritableUrl?.url).toBeDefined();
  });

  it('creates a job and a task with existing output', async () => {
    const createJobResult = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        skipDecider: true,
        tasks: [{ engineId: engineId, payload: { engineReturnValue: true } }]
      }
    });
    existingTaskId = _.get(
      createJobResult,
      'data.createJob.tasks.records[0].id',
      ''
    );
    expect(existingTaskId).toBeDefined();

    deleteJobIds.push(_.get(createJobResult, 'data.createJob.id', ''));
    deleteTaskIds.push(existingTaskId);

    let sampleTaskOutput = {
      hello: 'world'
    };

    await gqlClient.sdk.updateTask({
      input: {
        id: existingTaskId,
        status: TaskStatus.Queued,
        taskOutput: { hello: 'world' }
      }
    });

    const responseAfterUpdateTask = await gqlClient.sdk.task({
      id: existingTaskId
    });

    expect(responseAfterUpdateTask?.data?.task?.taskOutput).toEqual(
      sampleTaskOutput
    );
  });

  it('creates a job and a task with existing output, then adds a warning to it, then updates the status', async () => {
    let jobCurTestId;
    let createJobResult: any = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        skipDecider: true,
        tasks: [{ engineId: engineId, payload: { engineReturnValue: true } }]
      }
    });

    expect(createJobResult?.data?.createJob?.id).toBeDefined();
    jobCurTestId = createJobResult?.data?.createJob?.id;
    existingTaskId = createJobResult?.data?.createJob?.tasks?.records?.[0]?.id;
    expect(existingTaskId).toBeDefined();

    deleteTaskIds.push(existingTaskId);
    deleteJobIds.push(jobCurTestId);

    let sampleTaskOutput = {
      hello: 'world'
    };

    createJobResult = await gqlClient.sdk.updateTask({
      input: {
        id: existingTaskId,
        status: TaskStatus.Queued,
        taskOutput: { hello: 'world' }
      }
    });

    createJobResult = await gqlClient.sdk.task({
      id: existingTaskId
    });

    expect(createJobResult?.data?.task?.taskOutput).toEqual(sampleTaskOutput);

    const testReason = 'test reason';
    const testMessage = 'test message';
    const testReferenceId = '10101010';

    createJobResult = await gqlClient.sdk.appendWarningToTask({
      taskId: existingTaskId,
      reason: testReason,
      message: testMessage,
      referenceId: testReferenceId
    });

    expect(createJobResult?.data?.appendWarningToTask).toEqual(existingTaskId);

    createJobResult = await gqlClient.sdk.task({
      id: existingTaskId
    });

    const taskOutputWarnings = createJobResult?.data?.task?.warnings;

    expect(taskOutputWarnings).toBeTruthy();
    expect(taskOutputWarnings.length).toEqual(1);
    expect(taskOutputWarnings[0].reason).toEqual(testReason);
    expect(taskOutputWarnings[0].message).toEqual(testMessage);
    expect(taskOutputWarnings[0].referenceId).toEqual(testReferenceId);

    const expectedTaskOutput = {
      ...sampleTaskOutput,
      warnings: taskOutputWarnings
    };

    expect(createJobResult?.data?.task?.taskOutput).toEqual(expectedTaskOutput);

    createJobResult = await gqlClient.sdk.updateTask({
      input: {
        id: existingTaskId,
        status: TaskStatus.Complete,
        taskOutput: { goodbye: 'world' }
      }
    });

    const warningsAfterUpdateTaskStatus =
      createJobResult?.data?.updateTask?.warnings;
    expect(warningsAfterUpdateTaskStatus).toBeDefined();
    expect(warningsAfterUpdateTaskStatus.length).toBeGreaterThan(0);
    expect(createJobResult?.data?.updateTask?.completedDateTime).toBeDefined();
  });

  it('get jobs', async () => {
    const createEngineResult = await gqlClient.sdk.createEngine({
      input: {
        name: citestMarker + '-engine-' + uuidv4(),
        categoryId: '4b150c85-82d0-4a18-b7fb-63e4a58dfcce',
        deploymentModel: DeploymentModel.FullyNetworkIsolated
      }
    });

    const newEngineId = createEngineResult?.data?.createEngine?.id;

    const result = await gqlClient.sdk.jobs({
      dateTimeFilter: [
        {
          fromDateTime: moment().subtract(1, 'week').toISOString(),
          field: JobDateTimeField.CreatedDateTime
        }
      ],
      engineIds: [engineId, newEngineId],
      engineCategoryIds: [
        '4b150c85-82d0-4a18-b7fb-63e4a58dfcce',
        '088a31be-9bd6-4628-a6f0-e4004e362ea0'
      ]
    });

    expect(result?.data?.jobs).toBeDefined();

    const deleteEngineRsult = await gqlClient.sdk.deleteEngine({
      id: newEngineId!
    });
    expect(deleteEngineRsult?.data?.deleteEngine?.id).toEqual(newEngineId);
  });

  it('get tasks - by jobId and engineId', async () => {
    const result = await gqlClient.sdk.tasks({
      jobId: jobId,
      engineId: internalEngineId,
      limit: 1
    });

    const tasks = result?.data?.tasks?.records;
    expect(result?.data?.tasks?.records?.length).toEqual(1);
    expect(result?.data?.tasks?.records?.[0]?.id).toEqual(taskId);
    const validateEngineId =
      tasks?.[0]?.engineId == engineId ||
      tasks?.[0]?.engineId == internalEngineId;
    expect(validateEngineId).toEqual(true);
    expect(tasks?.[0]?.applicationId).toBeTruthy();
    applicationId = tasks?.[0]?.applicationId;
  });

  it('get tasks - applicationId and dateTimeFilter', async () => {
    const result = await gqlClient.sdk.tasks({
      applicationIds: applicationId,
      dateTimeFilter: [
        {
          field: TaskDateTimeField.CreatedDateTime,
          fromDateTime: moment().subtract(5, 'minute').toISOString(),
          toDateTime: moment().add(5, 'minute').toISOString()
        },
        {
          field: TaskDateTimeField.ModifiedDateTime,
          fromDateTime: moment().subtract(5, 'minute').toISOString(),
          toDateTime: moment().add(5, 'minute').toISOString()
        }
      ],
      limit: 1
    });

    expect(result?.data?.tasks?.records?.length).toEqual(1);
    expect(result?.data?.tasks?.records?.[0]?.applicationId).toEqual(
      applicationId
    );
    expect(result?.data?.tasks?.records?.[0]?.createdDateTime).toBeTruthy();
    expect(result?.data?.tasks?.records?.[0]?.modifiedDateTime).toBeTruthy();
  });

  // skip these 2 cases since schema did not exixts on dev/stage/prod,
  // so these will fail in Jenkins pre-deploy post tests
  let updateJobId1: any, updateJobId2: any, updateJobId3: any;
  it('create 3 jobs', async () => {
    const [createJobData1, createJobData2, createJobData3] = await Promise.all([
      gqlClient.sdk.createJob({
        input: {
          targetId: tdoId,
          clusterId: clusterId1,
          tasks: [
            {
              engineId: engineId,
              payload: { engineReturnValue: true }
            }
          ]
        }
      }),

      gqlClient.sdk.createJob({
        input: {
          targetId: tdoId,
          clusterId: clusterId1,
          tasks: [
            {
              engineId: engineId,
              payload: { engineReturnValue: true }
            }
          ]
        }
      }),

      gqlClient.sdk.createJob({
        input: {
          targetId: tdoId,
          clusterId: clusterId1,
          tasks: [
            {
              engineId: engineId,
              payload: { engineReturnValue: true }
            }
          ]
        }
      })
    ]);

    const createJob1 = createJobData1;
    const createJob2 = createJobData2;
    const createJob3 = createJobData3;

    expect(createJob1).toBeDefined();
    expect(createJob1?.data?.createJob?.id).toBeTruthy();
    expect(createJob1?.data?.createJob?.clusterId).toEqual(clusterId1);
    expect(createJob2).toBeDefined();
    expect(createJob2?.data?.createJob?.id).toBeTruthy();
    expect(createJob2?.data?.createJob?.clusterId).toEqual(clusterId1);
    expect(createJob3).toBeDefined();
    expect(createJob3?.data?.createJob?.id).toBeTruthy();
    expect(createJob3?.data?.createJob?.clusterId).toEqual(clusterId1);

    updateJobId1 = createJob1?.data?.createJob?.id;
    updateJobId2 = createJob2?.data?.createJob?.id;
    updateJobId3 = createJob3?.data?.createJob?.id;
    deleteJobIds.push(updateJobId1, updateJobId2, updateJobId3);
  });

  it('update 2 jobs - to aborted', async () => {
    const result = await gqlClient.sdk.updateJobs({
      input: {
        ids: [updateJobId1, updateJobId2],
        status: UpdateJobsStatus.Aborted,
        taskOutput: {
          failureType: TaskFailureReason.InternalError,
          //   failureReason: "edge_validation",
          failureMessage: 'the message'
        }
      }
    });

    const updateJobs: any = result?.data?.updateJobs?.records;
    expect(updateJobs).toBeDefined();
    expect(updateJobs?.length).toEqual(2);
    // the job status is "failed" not "aborted"
    // because we re-mapped the job status in the Job resolver
    // See: https://github.com/veritone/core-graphql-server/blob/master/resolvers/Job.js#L51
    expect(updateJobs?.[0]?.status).toEqual('failed');
    expect(updateJobs?.[1]?.status).toEqual('failed');

    for (const job of updateJobs) {
      for (const task of job.tasks.records) {
        expect(task?.taskOutput).toBeTruthy();
        expect(task?.status).toEqual('aborted');
        expect(task?.taskOutput?.failureReason).toEqual('internal_error');
        expect(task?.taskOutput?.failureMessage).toEqual('the message');
        expect(task?.taskOutput?.isUnknownFailureType).toEqual(false);
      }
    }
  });

  it('update 2 jobs - to aborted with license_error', async () => {
    const result = await gqlClient.sdk.updateJobs({
      input: {
        ids: [updateJobId1, updateJobId2],
        status: UpdateJobsStatus.Aborted,
        taskOutput: {
          failureType: TaskFailureReason.LicenseError,
          failureMessage: 'the message'
        }
      }
    });

    const updateJobs: any = result?.data?.updateJobs?.records;
    expect(updateJobs).toBeDefined();
    expect(result?.data?.updateJobs?.count).toEqual(2);
    // the job status is "failed" not "aborted"
    // because we re-mapped the job status in the Job resolver
    // See: https://github.com/veritone/core-graphql-server/blob/master/resolvers/Job.js#L51
    expect(updateJobs?.[0]?.status).toEqual('failed');
    expect(updateJobs?.[1]?.status).toEqual('failed');

    for (const job of updateJobs) {
      for (const task of job.tasks.records) {
        expect(task?.taskOutput).toBeTruthy();
        expect(task?.status).toEqual('aborted');
        expect(task?.taskOutput?.failureReason).toEqual('license_error');
        expect(task?.taskOutput?.failureMessage).toEqual('the message');
        expect(task?.taskOutput?.isUnknownFailureType).toEqual(false);
      }
    }
  });

  it('update 1 job with invalid taskOutputReason- to aborted', async () => {
    const result = await gqlClient.sdk.updateJobs({
      input: {
        ids: [updateJobId3],
        status: UpdateJobsStatus.Aborted,
        taskOutput: {
          // @ts-ignore
          failureReason: 'invalid_error_type',
          failureMessage: 'the message'
        }
      }
    });

    const updateJobs: any = result?.data?.updateJobs?.records;
    expect(updateJobs).toBeDefined();
    expect(updateJobs?.length).toEqual(1);
    // the job status is "failed" not "aborted"
    // because we re-mapped the job status in the Job resolver
    // See: https://github.com/veritone/core-graphql-server/blob/master/resolvers/Job.js#L51
    expect(updateJobs?.[0]?.status).toEqual('failed');

    for (const job of updateJobs) {
      for (const task of job.tasks.records) {
        expect(task?.taskOutput).toBeTruthy();
        expect(task?.status).toEqual('aborted');
        expect(task?.taskOutput?.failureReason).toEqual('task_validation');        expect(task?.taskOutput?.failureMessage).toEqual('the message');
        expect(task?.taskOutput?.isUnknownFailureType).toEqual(true);
      }
    }
  });

  it.skip('hit media-streamer download endpoint', async () => {
    await helpers.testMediaStreamerDownload(
      helpers.mediaStreamerUrl,
      tdoId,
      mediaStreamerHeader
    );
  });

  it('hit media-streamer streams endpoint', async () => {
    await helpers.testMediaStreamerStreams(
      helpers.mediaStreamerUrl,
      mediaStreamerHeader,
      tdoId,
      'dash.mpd'
    );
  });

  let modifiedDateTime;
  it('create a job - to test cancelJob', async () => {
    const createJobResult = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        clusterId: clusterId1,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: { engineReturnValue: true }
          }
        ]
      }
    });

    expect(createJobResult?.data?.createJob).toBeDefined();
    expect(createJobResult?.data?.createJob?.id).toBeTruthy();
    expect(createJobResult?.data?.createJob?.targetId).toEqual(tdoId);
    expect(
      createJobResult?.data?.createJob?.tasks?.records?.length
    ).toBeGreaterThan(0);

    cancelJobId = createJobResult?.data?.createJob?.id;
    deleteJobIds.push(cancelJobId);
    modifiedDateTime = createJobResult?.data?.createJob?.modifiedDateTime;
  });

  it('cancel job', async () => {
    const cancelJobResult = await gqlClient.sdk.cancelJob({
      id: cancelJobId
    });

    expect(cancelJobResult?.data?.cancelJob?.id).toEqual(cancelJobId);
  });

  it('get job after canceled', async () => {
    const getJobByIdResult = await gqlClient.sdk.job({
      id: cancelJobId
    });

    expect(getJobByIdResult?.data?.job?.id).toEqual(cancelJobId);
    expect(getJobByIdResult?.data?.job?.status).toEqual('cancelled');

    const tasks = getJobByIdResult?.data?.job?.tasks?.records;
    for (const task of tasks!) {
      expect(task?.status).toEqual('cancelled');
    }
  });

  it('create a job - to test notificationUrls', async () => {
    const createJobResult = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        clusterId: clusterId1,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: { engineReturnValue: true },
            notificationUris: ['http://localhost/link3']
          }
        ],
        notificationUris: ['http://localhost/link1', 'http://localhost/link2']
      }
    });

    expect(createJobResult?.data?.createJob?.id).toBeTruthy();
    expect(createJobResult?.data?.createJob?.notificationUris?.length).toEqual(
      2
    );
    expect(createJobResult?.data?.createJob?.notificationUris?.[0]).toEqual(
      'http://localhost/link1'
    );
    expect(createJobResult?.data?.createJob?.notificationUris?.[1]).toEqual(
      'http://localhost/link2'
    );

    const tasks: any = createJobResult?.data?.createJob?.tasks?.records;
    expect(tasks.length).toEqual(1);
    expect(tasks?.[0]?.notificationUris?.length).toEqual(1);
    expect(tasks?.[0]?.notificationUris?.[0]).toEqual('http://localhost/link3');

    jobIdNotificationUrls = createJobResult?.data?.createJob?.id;
    deleteJobIds.push(jobIdNotificationUrls);
  });

  it('create a job with task - to test the tasks notificationUris', async () => {
    const createJobResult = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        clusterId: clusterId1,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: { engineReturnValue: true },
            notificationUris: [
              'http://localhost/link1',
              'http://localhost/link2'
            ]
          }
        ]
      }
    });

    expect(createJobResult?.data?.createJob?.notificationUris?.length).toEqual(
      0
    );
    expect(createJobResult?.data?.createJob?.tasks).toBeTruthy();

    const tasks: any = createJobResult?.data?.createJob?.tasks?.records;
    expect(tasks.length).toEqual(1);
    expect(tasks?.[0]?.id).toBeTruthy();
    expect(tasks?.[0]?.notificationUris.length).toEqual(2);
    expect(tasks?.[0]?.notificationUris[0]).toEqual('http://localhost/link1');
    expect(tasks?.[0]?.notificationUris[1]).toEqual('http://localhost/link2');

    taskIdNotificationUrls = tasks?.[0]?.id;
    deleteTaskIds.push(taskIdNotificationUrls);
    deleteJobIds.push(_.get(createJobResult, 'data.createJob.id', ''));
  });

  // Nobody reported a reason, so neither field is set. This used to return task_validation and
  // the "doesn't match any of taskFailureEnum values" boilerplate — a reason Core invented. VE-7494
  it('does not invent a failureReason when status is failed and failureReason value is not passed', async function () {
    const updateTaskResult = await gqlClient.sdk.updateTask({
      input: {
        id: taskIdNotificationUrls,
        status: TaskStatus.Failed
      }
    });

    expect(updateTaskResult?.data?.updateTask).toBeDefined();
    expect(updateTaskResult?.data?.updateTask?.failureReason).toBeFalsy();
    expect(updateTaskResult?.data?.updateTask?.failureMessage).toBeFalsy();
  });

  it('update taskOutput when status is failed, failureReason is a valid enum value and failureMessage is personalized', async function () {
    const updateTaskResult = await gqlClient.sdk.updateTask({
      input: {
        id: taskIdNotificationUrls,
        status: TaskStatus.Failed,
        failureReason: TaskFailureReason.SystemError,
        failureMessage:
          'Streaming error from edge, something were wrong at a system-level'
      }
    });

    expect(updateTaskResult?.data?.updateTask).toBeDefined();
    expect(updateTaskResult?.data?.updateTask?.failureReason).toEqual(
      'system_error'
    );
    expect(updateTaskResult?.data?.updateTask?.failureMessage).toEqual(
      'Streaming error from edge, something were wrong at a system-level'
    );
  });

  it('update taskOutput when status is failed, failureReason is a valid enum license_error value and failureMessage is personalized', async function () {
    const updateTaskResult = await gqlClient.sdk.updateTask({
      input: {
        id: taskIdNotificationUrls,
        status: TaskStatus.Failed,
        failureReason: TaskFailureReason.LicenseError,
        failureMessage:
          'The engine failed due to an expired or invalid license.'
      }
    });

    expect(updateTaskResult?.data?.updateTask).toBeDefined();
    expect(updateTaskResult?.data?.updateTask?.failureReason).toEqual(
      'license_error'
    );
    expect(updateTaskResult?.data?.updateTask?.failureMessage).toEqual(
      'The engine failed due to an expired or invalid license.'
    );
  });

  it('update task notificationUrls', async function () {
    const updateTaskResult = await gqlClient.sdk.updateTask({
      input: {
        id: taskIdNotificationUrls,
        status: TaskStatus.Complete,
        notificationUris: ['http://localhost']
      }
    });

    expect(updateTaskResult?.data?.updateTask).toBeDefined();
    expect(updateTaskResult?.data?.updateTask?.notificationUris).toEqual([
      'http://localhost'
    ]);
  });

  it('update job notificationUrls', async () => {
    const updateJobsResult = await gqlClient.sdk.updateJobs({
      input: {
        ids: jobIdNotificationUrls,
        status: UpdateJobsStatus.Failed,
        notificationUris: ['http://localhost/link3', 'http://localhost/link4']
      }
    });

    expect(updateJobsResult?.data?.updateJobs).toBeDefined();
    expect(updateJobsResult?.data?.updateJobs?.records?.[0]?.id).toEqual(
      jobIdNotificationUrls
    );
    expect(
      updateJobsResult?.data?.updateJobs?.records?.[0]?.notificationUris
    ).toEqual(['http://localhost/link3', 'http://localhost/link4']);

    expect(
      updateJobsResult?.data?.updateJobs?.records?.[0]?.tasks?.records?.[0]
    ).toBeTruthy();
    expect(
      updateJobsResult?.data?.updateJobs?.records?.[0]?.tasks?.records?.[0]
        ?.notificationUris
    ).toEqual(['http://localhost/link3', 'http://localhost/link4']);
  });

  it('create a scheduled job - with notificationUris in JobTemplate', async () => {
    const createScheduleJobResult = await gqlClient.sdk.createScheduledJob({
      input: {
        name: `${testName}-job`,
        runMode: RunMode.Now,
        details: {
          programFormat: 'Adult Contemporary',
          foo: 'bar',
          isNational: true
        },
        isPublic: false,
        jobTemplates: [
          {
            skipDecider: true,
            clusterId: clusterId1,
            jobConfig: {
              createTDOInput: { details: { tags: ['foo', 'bar'] } }
            },
            taskTemplates: [
              {
                engineId: engineId,
                payload: { foo: 'bar', sourceId: sourceId },
                notificationUris: ['http://localhost2']
              }
            ],
            notificationUris: ['http://localhost1']
          }
        ]
      }
    });

    expect(createScheduleJobResult?.data?.createScheduledJob).toBeDefined();
    expect(createScheduleJobResult?.data?.createScheduledJob.id).toBeTruthy();
    tmpScheduledJobId = _.get(
      createScheduleJobResult,
      'data.createScheduledJob.id'
    );

    expect(
      createScheduleJobResult?.data?.createScheduledJob?.jobs?.records?.[0]
        ?.notificationUris
    ).toEqual(['http://localhost1']);
    expect(
      createScheduleJobResult?.data?.createScheduledJob?.jobs?.records?.[0]
        ?.tasks?.records?.[0]?.notificationUris
    ).toEqual(['http://localhost2']);

    tdoIdFromScheduledJob2 = getTdoIdFromScheduledJob(createScheduleJobResult);
  });

  it('delete the TDO', async () => {
    await deleteTdos(
      gqlClient,
      [
        tdoIdFromScheduledJob1,
        tdoIdFromScheduledJob2,
        tdoIdFromLaunchScheduledJob1,
        tdoId
      ].filter((id) => id)
    );
  });

  it.skip('delete the TDO - launch program', async function () {
    // wait a little before deleting TDO.
    // note that the engine doesn't actually read the TDO, though.
    const deleteTdoResult = await gqlClient.sdk.deleteTDO({
      id: tdoIdLaunchProgram
    });

    expect(deleteTdoResult?.data?.deleteTDO?.id).toEqual(tdoIdLaunchProgram);
  });

  it('add media segments - throw not_found if TDO has been deleted', async () => {
    const res = gqlClient.sdk.addMediaSegment({
      input: {
        containerId: tdoIdFromScheduledJob1,
        details: {
          segmentStartTimeMs: 0,
          segmentStopTimeMs: 2000
        },
        url: 'https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2'
      }
    });
    await expect(res).rejects.toThrow('not_found');
  });

  it('delete cluster test', async () => {
    const deleteClusterResult = await gqlClient.sdk.deleteCluster({
      id: clusterId
    });

    expect(deleteClusterResult?.data?.deleteCluster?.id).toEqual(clusterId);
  });

  it('delete cluster test - current org', async () => {
    const deleteClusterResult = await gqlClient.sdk.deleteCluster({
      id: clusterId1
    });

    expect(deleteClusterResult?.data?.deleteCluster?.id).toEqual(clusterId1);
  });

  it('delete the scheduleJob test', async () => {
    const deleteScheduleJobResult = await gqlClient.sdk.deleteScheduledJob({
      id: scheduledJobId
    });

    expect(deleteScheduleJobResult?.data?.deleteScheduledJob?.id).toEqual(
      scheduledJobId
    );
  });

  it('delete scheduledJob schema data', async () => {
    const deleteSchemaResult = await gqlClient.sdk.updateSchemaState({
      input: {
        id: schemaId,
        status: SchemaStatus.Deleted
      }
    });

    expect(deleteSchemaResult?.data?.updateSchemaState).toBeDefined();
    expect(deleteSchemaResult?.data?.updateSchemaState?.status).toEqual(
      'deleted'
    );
  });

  // Temporary skip this and will enable after VTN-35322 release on prod
  it.skip('delete the scheduleJob Youtube/podcast test', async () => {
    const deleteScheduleJobResult = await gqlClient.sdk.deleteScheduledJob({
      id: scheduledJobVideoId
    });

    expect(deleteScheduleJobResult?.data?.deleteScheduledJob?.id).toEqual(
      scheduledJobVideoId
    );
  });
});

// Utility functions
function getTdoIdFromScheduledJob(scheduledJobResult: any) {
  const result = JSON.stringify(
    scheduledJobResult?.data?.createScheduledJob?.jobs?.records?.[0]?.targetId
  );

  return result;
}

async function createAndUpdateSchema(
  gqlClient: GraphqlClient,
  dataRegistryId: string
) {
  const schemaCreateResult = await gqlClient.sdk.upsertSchemaDraft({
    input: {
      dataRegistryId: dataRegistryId,
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
        description: `for createScheduleJob ${citestMarker}`
      }
    }
  });

  schemaId = schemaCreateResult?.data?.upsertSchemaDraft?.id;

  let schemaUpdateResult = await gqlClient.sdk.updateSchemaState({
    input: {
      id: schemaId,
      breakingChanges: false,
      status: SchemaStatus.Published
    }
  });

  expect(schemaUpdateResult?.data?.updateSchemaState?.id).toEqual(schemaId);
  expect(schemaUpdateResult?.data?.updateSchemaState?.status).toEqual(
    SchemaStatus.Published
  );
}

async function deleteTdos(gqlClient: GraphqlClient, tdoList: any[]) {
  for (let i = 0; i < tdoList.length; i++) {
    await safe('delete TDO', async () => {
      const resultScheduleJob = await processTDODeletion(gqlClient, tdoList[i]);
      if (resultScheduleJob) {
        expect(resultScheduleJob.data?.deleteTDO?.id).toEqual(tdoList[i]);
      }
    });
  }
}
