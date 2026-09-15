const _ = require('lodash');
const moment = require('moment');
const supertest = require('supertest');

const uuid = require('uuid');
const helpers = require('../../helpers/index.js');
const engineHelper = require('../../helpers/engine.js');
const GraphqlClient = require('../../helpers/gql.js');
const util = require('../../../util.js')();
const tdoHelper = require('../../helpers/tdo.js');
const schemaHelper = require('../../helpers/schema.js');
const jobHelper = require('../../helpers/job.js');
const taskHelper = require('../../helpers/task.js');
const clusterHelper = require('../../helpers/cluster.js');
const dagTemplateHelper = require('../../helpers/dagTemplate.js');
const sourceHelper = require('../../helpers/sourceHelper.js');
const dataRegHelper = require('../../helpers/dataRegistry.js');
const { safe } = require('../../helpers/cleanup/utils.js');
const config = helpers.config;

let mediaStreamerHeader;
let engineId,
  jobId,
  tdoId,
  taskId,
  nullTaskId,
  existingTaskId,
  jwt,
  cancelJobId;
let schemaId;
let signedUrl, unsignedUrl, assetId;

const citestMarker = global.citestMarker || 'citest-should-delete';
const startDateTime = moment().subtract(2, 'hour').unix();
const stopDateTime = moment().subtract(1, 'hour').unix();
const testName = `${citestMarker}_schedule_job_` + Date.now();
const testKey = citestMarker + _.toString(Date.now());
const internalEngineId = 'insert-into-index';
let programFormat,
  dataRegistryId,
  sourceId,
  scheduledJobId,
  jobIdWithScheduleJob,
  sourceVideoId,
  programVideoFormat,
  scheduledJobVideoId;
let tdoIdWithScheduleJob,
  taskIdWithScheduleJob,
  clusterId,
  clusterId1,
  taskIdNotificationUrls,
  jobIdNotificationUrls,
  tdoIdLaunchProgram;
let engineIdRequiredLibrary, applicationId;

let tdoIdFromScheduledJob1, tdoIdFromScheduledJob2;
let tdoIdFromLaunchScheduledJob1;

let dagTemplateId, jobIdWithDagTemplate;
let tmpScheduledJobId;
let deleteJobIds = [];
let deleteTaskIds = [];

const dagTemplateName = 'test dag template';
const sampleDagTemplate =
  '{\\"tasks\\": [\\n  {\\n    \\"engineId\\": \\"{{{firstEngineId}}}\\",\\n    \\"payload\\": {\\n      \\"url\\": \\"{{{UPLOAD_URL}}}\\"\\n    },\\n    \\"executionPreferences\\": {\\n      {{#if priorityOfFirst}} \\"priority\\":{{minus priorityOfFirst 5}} {{/if}}\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"wsa-output\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"output\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"{{{secondEngineId}}}\\",\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"pb-input\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"input\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440\\",\\n    \\"payload\\": {\\n      \\"ffmpegTemplate\\": \\"video\\",\\n      \\"customFFMPEGProperties\\": {\\n        \\"chunkSizeInSeconds\\": {{#if chunkSizeInSeconds}} \\"{{{chunkSizeInSeconds}}}\\" {{else}} \\"300\\" {{/if}}\\n      }\\n    },\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"si-input\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"input\\"\\n      },\\n      {\\n        \\"referenceId\\": \\"si-output\\",\\n        \\"mode\\": \\"chunk\\",\\n        \\"type\\": \\"output\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3\\",\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"ow-input\\",\\n        \\"mode\\": \\"chunk\\",\\n        \\"type\\": \\"input\\"\\n      }\\n    ]\\n  }\\n],\\n\\"routes\\": [\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"wsa-output\\",\\n    \\"childIoFolderReferenceId\\": \\"pb-input\\"\\n  },\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"wsa-output\\",\\n    \\"childIoFolderReferenceId\\": \\"si-input\\"\\n  },\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"si-output\\",\\n    \\"childIoFolderReferenceId\\": \\"ow-input\\"\\n  }\\n]}';
/*
 Very basic job creation test that should pass 100%
 on every environment.
 Does not wait for job completion or even state change
 as these are time-sensitive and tend to throw off tests.
*/
describe('citest_jobs: basic jobs test', () => {
  let gqlClient;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(
      result.token,
      `result=${JSON.stringify(result, null, 2)}`
    ).toBeDefined();

    mediaStreamerHeader = helpers.mediaStreamerHeader(result.token);
  });

  afterAll(async () => {
    if (tmpScheduledJobId) {
      await safe('delete tmpScheduledJobId', async () =>
        jobHelper.helpDeleteScheduledJob(
          { gqlClient },
          { scheduledJobId: tmpScheduledJobId }
        )
      );
    }

    if (sourceId) {
      await safe('delete sourceId', async () =>
        sourceHelper.helpDeleteSource({ gqlClient }, sourceId)
      );
    }

    // delete created tasks
    if (deleteTaskIds.length > 0) {
      for (const taskId of _.uniq(_.compact(deleteTaskIds))) {
        await safe(`abort task`, () =>
          taskHelper.helpUpdateTask(
            { gqlClient },
            { id: taskId, status: 'aborted' }
          )
        );
      }
    }

    // delete created jobs
    if (deleteJobIds.length > 0) {
      for (const jobId of _.uniq(_.compact(deleteJobIds))) {
        await safe(`update job to queued`, () =>
          jobHelper.helpUpdateJobs(
            { gqlClient },
            { ids: [jobId], status: 'queued' }
          )
        );

        await safe(`cancel job`, () =>
          jobHelper.helpCancelJob({ gqlClient }, { jobId: jobId })
        );
      }
    }
  });

  it('Finds engine that does not create TDO', async () => {
    const [enginesData, engineLibraryRequiredData, urlRes] = await Promise.all([
      engineHelper.helpGetEngines(
        { gqlClient },
        { id: internalEngineId, buildStatus: ['deployed'] }
      ),
      engineHelper.helpGetEngines(
        { gqlClient },
        {
          libraryRequired: true,
          state: ['active'],
          limit: 1,
          buildStatus: ['deployed']
        }
      ),
      gqlClient.query(`query {
        url: getSignedWritableUrl (type:"asset" path: "citest"){
          url
          unsignedUrl
        }
      }`)
    ]);

    const engines = _.get(enginesData, 'engines.records');
    expect(engines).toBeDefined();

    // use dedicated test engine if it's present
    engineId = _.get(enginesData, 'engines.records[0].id');
    expect(engineId).toBeDefined();
    const createsTDO = _.get(enginesData, 'engines.records[0].createTDO');
    expect(createsTDO).toBeFalsy();
    const state = _.get(enginesData, 'engines.records[0].state');
    expect(state).toBe('active');

    signedUrl = _.get(urlRes, 'url.url');
    expect(signedUrl).toBeDefined();
    unsignedUrl = _.get(urlRes, 'url.unsignedUrl');
    expect(unsignedUrl).toBeDefined();

    const engineLibraryRequired = _.get(engineLibraryRequiredData, 'engines');

    expect(engineLibraryRequired).toBeDefined();
    expect(engineLibraryRequired.records[0]).toBeDefined();
    expect(_.get(engineLibraryRequired, 'records[0].id')).toBeDefined();

    engineIdRequiredLibrary = _.get(engineLibraryRequired, 'records[0].id');
  });

  it('get or create a dataRegistry and its schema', async () => {
    let dataRegResult = await dataRegHelper.helpCreateDataRegistry(
      { gqlClient },
      {
        source: `${citestMarker}_scheduledJob source`,
        name: `${citestMarker} Youtube Source Schema ${Date.now().valueOf()}`,
        description: `${citestMarker}_scheduledJob-youtube-schema`
      }
    );
    const createDataRegistry = _.get(dataRegResult, 'createDataRegistry');
    dataRegistryId = createDataRegistry.id;
    expect(dataRegistryId).toBeDefined();
    await createAndUpdateSchema(dataRegistryId);
  });

  it('create a source for scheduled job test', async () => {
    let createSourceResult = await sourceHelper.helpCreateSource(
      { gqlClient },
      { sourceTypeId: 1, name: `${citestMarker}_jobTest`, isPublic: false }
    );
    let sourceCreate = createSourceResult;
    sourceId = sourceCreate.id;
    expect(sourceId).toBeDefined();
  });

  // Temporary skip this and will enable after VTN-35322 release on prod
  xit('find test source - Youtube channel or Podcast', async function () {
    const query = `{
      sources (sourceTypeIds: [3, 4] limit:1 permission: owner) {
        records {
          id
          sourceType {
            id
            name
            programFormats
          }
        }
      }
    }`;

    const result = await gqlClient.query(query);
    const sources = _.get(result, 'sources.records');
    expect(sources.length).toEqual(1);
    expect(sources[0].id).toBeDefined;
    sourceVideoId = sources[0].id;
    programVideoFormat = _.get(sources[0], 'sourceType.programFormats[0]');
  });

  it('create a test cluster for another org as superadmin', async () => {
    const result = await clusterHelper.helpCreateCluster(
      { gqlClient },
      {
        name: testKey,
        type: 'ami',
        organizationId: '17560',
        dockerCredentials: {},
        containerTag: 'test',
        paused: true,
        memorySize: '1gb',
        storageSize: '8gb',
        tags: [],
        allowedEngines: [],
        collaborators: [{ organizationId: 7862, permission: 'viewer' }],
        clusterConfig: {
          restartTimeUTC: '03:00',
          mediaStoragePath: '../mnnt/',
          mediaStorage: 'edge',
          managementNodeId: ''
        },
        edgeVersion: 3
      }
    );
    const createCluster = result;
    clusterId = _.get(createCluster, 'id');
    expect(clusterId).toBeDefined();
    expect(_.get(createCluster, 'collaborators.count')).toEqual(1);
    expect(_.get(createCluster, 'organizationId')).toEqual('17560');
    expect(_.get(createCluster, 'collaborators.records[0].permission')).toEqual(
      'viewer'
    );
  });

  it('create cluster for testing - current orgnizationId', async () => {
    const result = await clusterHelper.helpCreateCluster(
      { gqlClient },
      {
        name: testKey,
        type: 'RT',
        dockerCredentials: {},
        allowedEngines: [],
        status: 'active',
        edgeVersion: 3
      }
    );

    const createCluster = result;

    expect(createCluster).toBeDefined();
    expect(createCluster.id).toBeTruthy();
    expect(createCluster.edgeVersion).toEqual(3);

    clusterId1 = createCluster.id;
  });

  it('create a scheduled job', async () => {
    const createScheduledJobResult = await jobHelper.helpCreateScheduledJob(
      { gqlClient },
      {
        name: `${testName}-job`,
        runMode: 'Now',
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
            scheduledDay: 'Monday',
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
    );
    scheduledJobId = _.get(createScheduledJobResult, 'id');
    expect(scheduledJobId).toBeDefined();

    jobIdWithScheduleJob = _.get(
      createScheduledJobResult,
      'jobs.records[0].id'
    );
    tdoIdWithScheduleJob = _.get(
      createScheduledJobResult,
      'jobs.records[0].targetId'
    );
    taskIdWithScheduleJob = _.get(
      createScheduledJobResult,
      'jobs.records[0].tasks.records[0].id'
    );
    expect(jobIdWithScheduleJob).toBeDefined();
    expect(tdoIdWithScheduleJob).toBeDefined();
    expect(taskIdWithScheduleJob).toBeDefined();
    tdoIdFromScheduledJob1 = getTdoIdFromScheduledJob(createScheduledJobResult);
  });

  // Temporary skip this and will enable after VTN-35322 release on prod
  xit('create a scheduled job - for video source', async function () {
    const query = `mutation {
      createScheduledJob(
        input: {
          name: "${testName}-schedule-job-test"
          runMode: Recurring
          details: {
            programFormat: "${programVideoFormat}"
            foo: "bar"
            isNational: true
          }
          isPublic: false
          contentTemplates: [
            {
              schemaId: "${dataRegistryId}"
              data: {
                url: "https://youtube.com/channel/123"
                youtubeChannelUrl: "https://youtube.com/channel/123"
                liveTimezone: "PST"
              }
            }
          ]
          jobTemplates: [
            {
              skipDecider: true
              clusterId: "${clusterId1}"
              jobConfig: { createTDOInput: { details: { tags: ["foo", "bar"] } } }
              taskTemplates: [
                {
                  engineId: "${engineId}"
                  payload: { foo: "bar", sourceId: "${sourceVideoId}" }
                }
              ]
            }
          ]
        }
      ) {
        id
        primarySourceId
        jobs {
          count
        }
      }
    }`;
    const result = await gqlClient.query(query);
    const createScheduledJob = _.get(result, 'createScheduledJob');

    expect(createScheduledJob).toBeDefined();
    expect(createScheduledJob.id).toBeTruthy();
    expect(createScheduledJob.primarySourceId).toEqual(sourceVideoId);
    expect(_.get(createScheduledJob, 'jobs.count')).toEqual(0);

    scheduledJobVideoId = createScheduledJob.id;
  });

  // Temporary skip this and will enable after VTN-35322 release on prod
  xit('create tdo with launchProgram is true', async function () {
    const query = `mutation {
      createTDO(input: {
        startDateTime: ${startDateTime},
        stopDateTime: ${stopDateTime},
        sourceData: {
          sourceId: ${sourceVideoId}
        }
        launchProgram: true
      }) {
        id
        startDateTime
        stopDateTime
        sourceData {
          scheduledJobId
          sourceId
        }
        jobs {
          count
        }
      }
    }`;

    const result = await gqlClient.query(query);

    const createTDO = _.get(result, 'createTDO');
    expect(createTDO).toBeDefined();
    expect(createTDO.id).toBeTruthy();
    expect(_.get(createTDO, 'jobs.count')).above(0);
    tdoIdLaunchProgram = createTDO.id;
  });

  it('retry a job', async () => {
    const result = await jobHelper.helpRetryJob(
      { gqlClient },
      { jobId: jobIdWithScheduleJob }
    );
    const retryJob = result;
    expect(retryJob).toBeDefined();
    expect(retryJob.id).not.toEqual(jobIdWithScheduleJob);
    expect(retryJob.tasks).toBeTruthy();
    expect(retryJob.routes).toBeTruthy();
    for (const task of _.get(retryJob, 'tasks.records')) {
      expect(task.status).not.toEqual('failed');
    }
  });

  it('update task in schedule job to complete', async () => {
    const result = await taskHelper.helpUpdateTask(
      { gqlClient, options: true },
      { id: taskIdWithScheduleJob, status: 'complete' }
    );
    expect(_.get(result, 'status')).toEqual('complete');
    // The completedDateTime will not be updated if task status was moved from "pending" to "completed"
    // See: https://github.com/veritone/core-job-server/blob/master/src/route/task.js#L297-L311
    expect(_.get(result, 'modifiedDateTime')).toBeTruthy();
    expect(_.get(result, 'completedDateTime')).toBeDefined();
    expect(_.get(result, 'startedDateTime')).toBeDefined();
  });

  it('cancelJob should fail if tasks are not all in pending or queued', async () => {
    let result;
    try {
      result = await jobHelper.helpCancelJob(
        { gqlClient, options: true },
        { jobId: jobIdWithScheduleJob }
      );
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  it('launch a schedule job one more time - for creating job with scheduleJobId', async () => {
    const result = await jobHelper.helpLaunchScheduledJobs(
      { gqlClient },
      { scheduledJobId: scheduledJobId, payload: { maxIngestionJobs: 1 } }
    );

    const launchScheduledJobs = result;
    tdoIdFromLaunchScheduledJob1 = result[0].target.id;
    expect(launchScheduledJobs).toBeDefined();
    expect(launchScheduledJobs[0].id).toBeTruthy();

    const jobResult = await jobHelper.helpGetJobById(
      { gqlClient },
      { jobId: launchScheduledJobs[0].id },
      { showTask: true }
    );
    deleteJobIds.push(jobResult.id);
    const taskPayload = _.get(jobResult, 'tasks.records[0].payload', {});
    deleteTaskIds.push(_.get(jobResult, 'tasks.records[0].id'));
    expect(taskPayload).toMatchObject({ maxIngestionJobs: 1 });
  });

  it('create a job with tdo in schedule job - for testing process limit for org', async () => {
    const result = await jobHelper.helpCreateJob(
      { gqlClient },
      {
        targetId: tdoIdWithScheduleJob,
        skipDecider: true,
        tasks: [{ engineId: engineId, payload: { engineReturnValue: true } }]
      }
    );
    expect(_.get(result, 'id')).toBeDefined();
    deleteJobIds.push(_.get(result, 'id'));
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
    const result = await gqlClient.uploadFile(
      query,
      'movie.mp4',
      './citest/data/movie.mp4'
    );
    tdoId = _.get(result, 'createTDOWithAsset.id');
    expect(tdoId).toBeTruthy();
  });

  it('creates media segments', async () => {
    const query = `
    mutation {
      seg1: addMediaSegment(input: {containerId: "${tdoId}", details: {
        segmentStartTimeMs: 0
        segmentStopTimeMs: 2000
        segmentGroupId: "0adfa9f1-2d32-4194-99e7-fa3bc93a5bff"
      }
      url: "https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2"
    }) {
        id
        primaryAsset(assetType: "media-mdp") {
          id
          contentType
          assetType
          signedUri
          uri
        }
      }
      seg2: addMediaSegment(input: {containerId: "${tdoId}", details: {
        segmentStartTimeMs: 2000
        segmentStopTimeMs: 4000
        segmentGroupId: "0adfa9f1-2d32-4194-99e7-fa3bc93a5bff"
      }
      url: "https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2"
    }) {
        id
      }
      initSegment: addMediaSegment(input: { containerId: "${tdoId}", details: {
        codecs: "avc1.64001e,mp4a.40.2",
        segmentGroupId: "0adfa9f1-2d32-4194-99e7-fa3bc93a5bff",
        targetSegmentDurationMs: 2000
        }
        url: "https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2"
      }) {
        id
      }
    }
    `;

    const result = await gqlClient.query(query);
    expect(_.get(result, 'seg1.primaryAsset.id')).toBeTruthy();
    expect(_.get(result, 'seg1.primaryAsset.contentType')).toEqual(
      'application/json'
    );
    expect(_.get(result, 'seg1.primaryAsset.assetType')).toEqual('media-mdp');
    expect(tdoId).toBeTruthy();
  });

  it('creates media segments in parallel', async () => {
    const requests = [];
    for (let start = 0; start < 300; start += 5) {
      const query = `
        mutation {
          seg1: addMediaSegment(input: {containerId: "${tdoId}", details: {
            segmentStartTimeMs: ${start * 1000}
            segmentStopTimeMs: ${start * 1000 + 5000}
            segmentGroupId: "0adfa9f1-2d32-4194-99e7-fa3bc93a5bff"
          }
          url: "https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2"
        }) {
            id
          }
        }
        `;
      requests.push(gqlClient.query(query));
    }
    function shuffleArray(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
    }
    shuffleArray(requests);
    await Promise.all(requests);

    const query1 = `
        query {
          temporalDataObject(id: "${tdoId}") { id startDateTime stopDateTime }
        }`;
    const result = await gqlClient.query(query1);
    expect(_.get(result, 'temporalDataObject.id')).toEqual(tdoId);
    const start = moment(_.get(result, 'temporalDataObject.startDateTime'));
    const stop = moment(_.get(result, 'temporalDataObject.stopDateTime'));
    expect(stop.diff(start, 'seconds')).toEqual(900);
  });

  it('creates media segments - in bulk - another segmentGroupId', async () => {
    const exSegmentGroupId = '281fb119-2e13-485b-8333-baaeda19a48d';
    const result = await sourceHelper.helpAddMediaSegments(
      { gqlClient },
      {
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
      },
      { primaryAssetType: 'media-mdp' }
    );
    expect(_.get(result, 'id')).toEqual(tdoId);
    expect(_.get(result, 'primaryAsset.id')).toBeDefined();
  });

  it('validates URL field on media segments', async () => {
    const segmentRes = sourceHelper.helpAddMediaSegment(
      { gqlClient },
      {
        containerId: tdoId,
        details: { segmentStartTimeMs: 2000, segmentStopTimeMs: 4000 },
        url: ''
      }
    );
    await expect(segmentRes).rejects.toThrow('invalid_input');
  });

  it('validates URL string on media segments', async () => {
    const segmentRes = sourceHelper.helpAddMediaSegment(
      { gqlClient },
      {
        containerId: tdoId,
        details: { segmentStartTimeMs: 0, segmentStopTimeMs: 2000 },
        url: 'not a url'
      }
    );

    await expect(segmentRes).rejects.toThrow('invalid_input');
  });

  it('updates the TDO to recorded', async () => {
    const result = await tdoHelper.helpUpdateTDO(
      { gqlClient },
      { id: tdoId, status: 'recorded' }
    );

    expect(_.get(result, 'streamManifest.segments.length')).toEqual(62);
    expect(_.get(result, 'streamManifest.initSegment')).toBeTruthy();
  });

  it('create a job and should throw error - No access to engine', async () => {
    const createJob = jobHelper.helpCreateJob(
      { gqlClient },
      {
        targetId: tdoId,
        skipDecider: true,
        tasks: [
          { engineId: engineId, payload: { engineReturnValue: true } },
          { engineId: 'noaccessengine', payload: { engineReturnValue: true } }
        ]
      }
    );
    await expect(createJob).rejects.toThrow('not_allowed');
  });

  it('create a job and should throw error - Invalid libraryTypes', async () => {
    const createJob = jobHelper.helpCreateJob(
      { gqlClient },
      {
        targetId: tdoId,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: { engineReturnValue: true, libraryTypes: {} }
          }
        ]
      }
    );
    await expect(createJob).rejects.toThrow('invalid libraryTypes');
  });

  it('throw error if create a job in cluster of other org', async () => {
    const createJob = jobHelper.helpCreateJob(
      { gqlClient },
      {
        targetId: tdoId,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: { engineReturnValue: true }
          }
        ],
        clusterId: clusterId
      }
    );
    await expect(createJob).rejects.toThrow('no access');
  });

  it('create a job', async () => {
    const result = await jobHelper.helpCreateJob(
      { gqlClient },
      {
        targetId: tdoId,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: { engineReturnValue: true }
          }
        ]
      }
    );
    jobId = _.get(result, 'id');
    deleteJobIds.push(jobId);
    expect(jobId).toBeDefined();
    taskId = _.get(result, 'tasks.records[0].id');
    deleteTaskIds.push(taskId);
    expect(taskId).toBeDefined();
  });

  it('create a job - with name and description', async () => {
    const result = await jobHelper.helpCreateJob(
      { gqlClient },
      {
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
    );
    jobId = _.get(result, 'id');
    deleteJobIds.push(jobId);
    expect(jobId).toBeDefined();
    taskId = _.get(result, 'tasks.records[0].id');
    deleteTaskIds.push(taskId);
    expect(taskId).toBeDefined();
    expect(_.get(result, 'name')).toEqual('test name');
    expect(_.get(result, 'description')).toEqual('test description');
    expect(_.get(result, 'jobConfig.name')).toEqual('test name');
    expect(_.get(result, 'jobConfig.description')).toEqual('test description');
  });

  it('creates a job with no task output', async () => {
    const result = await jobHelper.helpCreateJob(
      { gqlClient },
      {
        targetId: tdoId,
        skipDecider: true,
        tasks: [
          {
            engineId: engineId,
            payload: { engineReturnValue: true }
          }
        ]
      }
    );
    nullTaskId = _.get(result, 'tasks.records[0].id');
    deleteTaskIds.push(nullTaskId);
    deleteJobIds.push(_.get(result, 'id'));
    expect(nullTaskId).toBeDefined();
  });

  it('create a DAG template', async () => {
    const query = `mutation {
      createDagTemplate(input: {
        name: "${dagTemplateName}"
        dag: "${sampleDagTemplate}"
        dagTemplateLanguage: "Handlebars"
        tags: ["foo", "bar"]
      }) {
        id
        name
        description
        cognitiveCategoryId
        mimeType
        dag
        dagTemplateLanguage
        targetOrganizationId
        tags
      }
    }`;

    const result = await gqlClient.query(query);

    const createDagTemplate = _.get(result, 'createDagTemplate');
    expect(createDagTemplate).toBeDefined();
    expect(createDagTemplate.id).toBeDefined();
    expect(createDagTemplate.tags).toEqual(['foo', 'bar']);
    dagTemplateId = _.get(createDagTemplate, 'id');
  });
  it('create a job with DAG template', async () => {
    const result = await dagTemplateHelper.helpLaunchDagTemplate(
      { gqlClient },
      {
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
    );
    const createJob = result;
    jobIdWithDagTemplate = createJob.id;
    deleteJobIds.push(jobIdWithDagTemplate);
    expect(createJob).toBeDefined();
    expect(jobIdWithDagTemplate).toBeDefined();
    expect(createJob.targetId).toBeDefined();
    expect(_.get(createJob, 'tasks.count')).toEqual(4);
    expect(createJob.routes.length).toEqual(3);
  });
  it('get a job with DAG template', async () => {
    const result = await jobHelper.helpGetJobById(
      { gqlClient },
      { jobId: jobIdWithDagTemplate }
    );
    const job = result;
    const dagTemplateIdByJobId = _.get(job, 'dagTemplate.id');
    const dagTemplateNameByJobId = _.get(job, 'dagTemplate.name');

    expect(job).toBeDefined();
    expect(dagTemplateIdByJobId).toEqual(dagTemplateId);
    expect(dagTemplateNameByJobId).toEqual(dagTemplateName);
  });
  it('get jobs by DAG template', async () => {
    const result = await jobHelper.helpGetJobs(
      { gqlClient },
      { dagTemplateIds: [dagTemplateId] }
    );
    const jobs = result;
    expect(_.get(jobs, 'records[0].dagTemplate.id')).toEqual(dagTemplateId);
    expect(_.get(jobs, 'records[0].dagTemplate.name')).toEqual(dagTemplateName);
  });
  it('cancel job with DAG template', async () => {
    const cancelResult = await jobHelper.helpCancelJob(
      { gqlClient },
      { jobId: jobIdWithDagTemplate }
    );
    expect(_.get(cancelResult, 'id')).toEqual(jobIdWithDagTemplate);
  });

  it('should delete DAG template', async () => {
    const result = await dagTemplateHelper.helpDeleteDagTemplate(
      { gqlClient },
      { id: dagTemplateId }
    );
    const deleteDagTemplate = result;
    expect(deleteDagTemplate).toBeDefined();
    expect(deleteDagTemplate.id).toEqual(dagTemplateId);
  });

  // FIXME: Need to get the libraryId and libraryEngineModelId correlate to engineId
  it('create a job with library', async () => {
    const result = await jobHelper.helpCreateJob(
      { gqlClient },
      {
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
    );

    const createJob = result;
    expect(createJob).toBeDefined();
    expect(createJob.id).toBeTruthy();
    deleteJobIds.push(createJob.id);
    expect(_.get(createJob, 'tasks.records[0].id')).toBeTruthy();
    deleteTaskIds.push(_.get(createJob, 'tasks.records[0].id'));
  });

  it('can fetch the created task with null taskOutput', async () => {
    const result = await taskHelper.helpGetTaskById(
      { gqlClient },
      { taskId: nullTaskId }
    );
    const taskOutput = _.get(result, 'taskOutput');
    expect(taskOutput).toEqual(null);
  });

  xit('upload result to signed URL', async () => {
    const data = require('../../data/engineAsset.json');
    // FIXME: we need find a way to run this test case when running the test with local-compose.
    // the signedURL is generated from core-graphql with a internal host minio
    if (signedUrl.includes('//minio:9000')) {
      return;
    }
    supertest(signedUrl);
    const test = await supertest(signedUrl).put('').send(data).expect(200);
  });

  it('uploads engine result - first time', async () => {
    const result = await engineHelper.helpUploadEngineResult(
      { gqlClient, options: true },
      {
        taskId: taskId,
        uri: `${unsignedUrl}?v=1`,
        clientTimestamp: moment().toISOString(),
        isAccumulatedResult: true,
        setTaskOutput: false
      }
    );
    assetId = _.get(result, 'id');
    expect(assetId).toBeDefined();
    expect(_.get(result, 'uri')).toEqual(unsignedUrl + '?v=1');
    expect(_.get(result, 'assetType')).toEqual('vtn-standard');
    expect(_.get(result, 'contentType')).toEqual('application/json');
  });

  it('uploads engine result - second time', async () => {
    const result = await engineHelper.helpUploadEngineResult(
      { gqlClient, options: true },
      {
        taskId: taskId,
        assetType: 'vtn-standard',
        contentType: 'application/json',
        uri: `${unsignedUrl}?v=2`,
        clientTimestamp: moment().toISOString(),
        isAccumulatedResult: true,
        setTaskOutput: false
      }
    );
    expect(_.get(result, 'id')).toEqual(assetId);
    expect(_.get(result, 'uri')).toEqual(unsignedUrl + '?v=2');
  });

  it('uploads engine result - third time, stale timestamp', async () => {
    const result = await engineHelper.helpUploadEngineResult(
      { gqlClient, options: true },
      {
        taskId: taskId,
        assetType: 'vtn-standard',
        contentType: 'application/json',
        uri: `${unsignedUrl}?v=3`,
        clientTimestamp: moment().subtract(2, 'minutes').toISOString(),
        isAccumulatedResult: true,
        setTaskOutput: false
      }
    );
    expect(_.get(result, 'id')).toEqual(assetId);
    expect(_.get(result, 'uri')).toEqual(unsignedUrl + '?v=2');
  });

  it('get engine JWTs', async () => {
    const query = `
    mutation {
      jwt: getEngineJWT(input: {
        engineId: "${engineId}"
        resource: {
          tdoId: "${tdoId}"
          jobId: "${jobId}"
          taskId: "${taskId}"
        }
      }) {
        token
      }
    }
          `;

    const result = await gqlClient.query(query);
    jwt = _.get(result, 'jwt.token');
    expect(jwt).toBeDefined();
  });

  it('have correct rights on JWT', async () => {
    const query = `
    query {
      me {
        id
        organizationId
      }
      myRights {
        operations
        resources
      }
      temporalDataObject(id: "${tdoId}") { id }
      url: getSignedWritableUrl {
        url
      }
    }`;
    const jwtOptions = {
      headers: {
        Authorization: 'Bearer ' + jwt,
        'Content-Type': 'application/json'
      }
    };
    const result = await gqlClient.query(query, null, jwtOptions);
    expect(_.get(result, 'myRights.resources.Job[0]')).toEqual(jobId);
    expect(_.get(result, 'myRights.resources.TemporalDataObject[0]')).toEqual(
      tdoId
    );
    expect(_.get(result, 'myRights.resources.Task[0]')).toEqual(taskId);

    expect(_.get(result, 'temporalDataObject.id')).toEqual(tdoId);
    expect(_.get(result, 'url.url')).toBeDefined();
  });
  it('creates a job and a task with existing output', async () => {
    const result = await jobHelper.helpCreateJob(
      { gqlClient },
      {
        targetId: tdoId,
        skipDecider: true,
        tasks: [{ engineId: engineId, payload: { engineReturnValue: true } }]
      }
    );
    existingTaskId = _.get(result, 'tasks.records[0].id');
    expect(existingTaskId).toBeDefined();
    deleteTaskIds.push(existingTaskId);
    deleteJobIds.push(_.get(result, 'id'));

    let sleep = await util.sleep(1000);
    let sampleTaskOutput = {
      hello: 'world'
    };

    await taskHelper.helpUpdateTask(
      { gqlClient, options: true },
      {
        id: existingTaskId,
        status: 'queued',
        taskOutput: { hello: 'world' }
      }
    );

    sleep = await util.sleep(1000);

    let responseAfterUpdateTask = await taskHelper.helpGetTaskById(
      { gqlClient },
      { taskId: existingTaskId }
    );
    expect(responseAfterUpdateTask.taskOutput).toEqual(sampleTaskOutput);
  });

  it('creates a job and a task with existing output, then adds a warning to it, then updates the status', async () => {
    let jobCurTestId;

    let result = await jobHelper.helpCreateJob(
      { gqlClient },
      {
        targetId: tdoId,
        skipDecider: true,
        tasks: [{ engineId: engineId, payload: { engineReturnValue: true } }]
      }
    );
    const createJob = result;

    expect(createJob).toBeDefined();
    expect(createJob.id).toBeDefined();
    jobCurTestId = createJob.id;
    existingTaskId = _.get(result, 'tasks.records[0].id');
    deleteTaskIds.push(existingTaskId);
    deleteJobIds.push(jobCurTestId);
    expect(existingTaskId).toBeDefined();

    let sleep = await util.sleep(1000);

    let sampleTaskOutput = {
      hello: 'world'
    };

    // FIXME: this doesn't work with user token
    result = await taskHelper.helpUpdateTask(
      { gqlClient, options: true },
      {
        id: existingTaskId,
        status: 'queued',
        taskOutput: { hello: 'world' }
      }
    );

    await util.sleep(1000);

    result = await taskHelper.helpGetTaskById(
      { gqlClient },
      { taskId: existingTaskId }
    );
    expect(result.taskOutput).toEqual(sampleTaskOutput);

    const testReason = 'test reason';
    const testMessage = 'test message';
    const testReferenceId = '10101010';

    result = await taskHelper.helpAppendWarningToTask(
      { gqlClient },
      {
        taskId: existingTaskId,
        reason: testReason,
        message: testMessage,
        referenceId: testReferenceId
      }
    );
    const appendedTaskId = result;
    expect(appendedTaskId).toEqual(existingTaskId);

    await util.sleep(1000);

    result = await taskHelper.helpGetTaskById(
      { gqlClient },
      { taskId: existingTaskId }
    );

    const taskOutputWarnings = _.get(result, 'warnings');
    expect(taskOutputWarnings).toBeTruthy();
    expect(taskOutputWarnings.length).toEqual(1);
    expect(taskOutputWarnings[0].reason).toEqual(testReason);
    expect(taskOutputWarnings[0].message).toEqual(testMessage);
    expect(taskOutputWarnings[0].referenceId).toEqual(testReferenceId);

    const expectedTaskOutput = {
      ...sampleTaskOutput,
      warnings: taskOutputWarnings
    };

    expect(result.taskOutput).toEqual(expectedTaskOutput);

    result = await taskHelper.helpUpdateTask(
      { gqlClient, options: true },
      {
        id: existingTaskId,
        status: 'complete',
        taskOutput: { goodbye: 'world' }
      }
    );
    const warningsAfterUpdateTaskStatus = _.get(result, 'warnings');
    expect(warningsAfterUpdateTaskStatus).toBeDefined();
    expect(warningsAfterUpdateTaskStatus.length).toBeGreaterThan(0);
    expect(_.get(result, 'completedDateTime')).toBeDefined();
  });

  it('get jobs', async () => {
    const engineCreate = await engineHelper.helpCreateEngine(
      { gqlClient },
      {
        name: citestMarker + '-engine-' + uuid.v4(),
        categoryId: '4b150c85-82d0-4a18-b7fb-63e4a58dfcce',
        deploymentModel: 'FullyNetworkIsolated'
      }
    );

    const newEngineId = _.get(engineCreate, 'createEngine.id');

    const result = await jobHelper.helpGetJobs(
      { gqlClient },
      {
        dateTimeFilter: [
          {
            fromDateTime: moment().subtract(1, 'week').toISOString(),
            field: 'createdDateTime'
          }
        ],
        engineIds: [engineId, newEngineId],
        engineCategoryIds: [
          '4b150c85-82d0-4a18-b7fb-63e4a58dfcce',
          '088a31be-9bd6-4628-a6f0-e4004e362ea0'
        ]
      }
    );
    expect(result).toBeDefined();

    await engineHelper.helpDeleteEngine({ gqlClient }, { id: newEngineId });
  });

  it('get tasks - by jobId and engineId', async () => {
    const result = await taskHelper.helpGetTasks(
      { gqlClient },
      {
        jobId: jobId,
        engineId: internalEngineId,
        limit: 1
      }
    );
    const tasks = result;

    expect(tasks.length).toEqual(1);
    expect(tasks[0].id).toEqual(taskId);
    // engineId can be an alias ID or internal engine ID
    const validateEngineId =
      tasks[0].engineId == engineId || tasks[0].engineId == internalEngineId;
    expect(validateEngineId).toEqual(true);
    expect(tasks[0].applicationId).toBeTruthy();

    applicationId = tasks[0].applicationId;
  });

  it('get tasks - applicationId and dateTimeFilter', async () => {
    const result = await taskHelper.helpGetTasks(
      { gqlClient },
      {
        applicationIds: applicationId,
        dateTimeFilter: [
          {
            field: 'createdDateTime',
            fromDateTime: moment().subtract(5, 'minute').toISOString(),
            toDateTime: moment().add(5, 'minute').toISOString()
          },
          {
            field: 'modifiedDateTime',
            fromDateTime: moment().subtract(5, 'minute').toISOString(),
            toDateTime: moment().add(5, 'minute').toISOString()
          }
        ],
        limit: 1
      }
    );

    const tasks = result;

    expect(tasks.length).toEqual(1);
    expect(tasks[0].applicationId).toEqual(applicationId);
    expect(tasks[0].createdDateTime).toBeTruthy();
    expect(tasks[0].modifiedDateTime).toBeTruthy();
  });

  // skip these 2 cases since schema did not exixts on dev/stage/prod,
  // so these will fail in Jenkins pre-deploy post tests
  let updateJobId1, updateJobId2, updateJobId3;
  it('create 3 jobs', async () => {
    const [createJobData1, createJobData2, createJobData3] = await Promise.all([
      jobHelper.helpCreateJob(
        { gqlClient },
        {
          targetId: tdoId,
          clusterId: clusterId1,
          tasks: [
            {
              engineId: engineId,
              payload: { engineReturnValue: true }
            }
          ]
        }
      ),
      jobHelper.helpCreateJob(
        { gqlClient },
        {
          targetId: tdoId,
          clusterId: clusterId1,
          tasks: [
            {
              engineId: engineId,
              payload: { engineReturnValue: true }
            }
          ]
        }
      ),
      jobHelper.helpCreateJob(
        { gqlClient },
        {
          targetId: tdoId,
          clusterId: clusterId1,
          tasks: [
            {
              engineId: engineId,
              payload: { engineReturnValue: true }
            }
          ]
        }
      )
    ]);

    const createJob1 = createJobData1;
    const createJob2 = createJobData2;
    const createJob3 = createJobData3;

    expect(createJob1).toBeDefined();
    expect(createJob1.id).toBeTruthy();
    expect(createJob1.clusterId).toEqual(clusterId1);
    expect(createJob2).toBeDefined();
    expect(createJob2.id).toBeTruthy();
    expect(createJob2.clusterId).toEqual(clusterId1);
    expect(createJob3).toBeDefined();
    expect(createJob3.id).toBeTruthy();
    expect(createJob3.clusterId).toEqual(clusterId1);

    updateJobId1 = createJob1.id;
    updateJobId2 = createJob2.id;
    updateJobId3 = createJob3.id;
    deleteJobIds.push(updateJobId1, updateJobId2, updateJobId3);
  });

  it('update 2 jobs - to aborted', async () => {
    const result = await jobHelper.helpUpdateJobs(
      { gqlClient },
      {
        ids: [updateJobId1, updateJobId2],
        status: 'aborted',
        taskOutput: {
          failureType: 'internal_error',
          failureReason: 'edge_validation',
          failureMessage: 'the message'
        }
      }
    );
    const updateJobs = result;

    expect(updateJobs).toBeDefined();
    expect(updateJobs.length).toEqual(2);
    // the job status is "failed" not "aborted"
    // because we re-mapped the job status in the Job resolver
    // See: https://github.com/veritone/core-graphql-server/blob/master/resolvers/Job.js#L51
    expect(updateJobs[0].status).toEqual('failed');
    expect(updateJobs[1].status).toEqual('failed');

    for (const job of updateJobs) {
      for (const task of job.tasks.records) {
        expect(task.taskOutput).toBeTruthy();
        expect(task.status).toEqual('aborted');
        expect(_.get(task, 'taskOutput.failureReason')).toEqual(
          'internal_error'
        );
        expect(_.get(task, 'taskOutput.failureMessage')).toEqual('the message');
        expect(_.get(task, 'taskOutput.isUnknownFailureType')).toEqual(false);
      }
    }
  });

  it('update 2 jobs - to aborted with license_error', async () => {
    const query = `mutation updateJobs {
      updateJobs(input:{
        ids: ["${updateJobId1}", "${updateJobId2}"]
        status: aborted
        taskOutput: {
          failureType: license_error
          failureMessage: "the message"
        }
      }) {
        count
        records {
          id
          status
          tasks {
            count
            records {
              id
              status
              engine {
                id
                name
              }
              taskOutput
            }
          }
        }
      }
    }`;

    const result = await gqlClient.query(query);
    const updateJobs = _.get(result, 'updateJobs');

    expect(updateJobs).toBeDefined();
    expect(updateJobs.count).toEqual(2);
    // the job status is "failed" not "aborted"
    // because we re-mapped the job status in the Job resolver
    // See: https://github.com/veritone/core-graphql-server/blob/master/resolvers/Job.js#L51
    expect(updateJobs.records[0].status).toEqual('failed');
    expect(updateJobs.records[1].status).toEqual('failed');

    for (const job of updateJobs.records) {
      for (const task of job.tasks.records) {
        expect(task.taskOutput).toBeTruthy();
        expect(task.status).toEqual('aborted');
        expect(_.get(task, 'taskOutput.failureReason')).toEqual(
          'license_error'
        );
        expect(_.get(task, 'taskOutput.failureMessage')).toEqual('the message');
        expect(_.get(task, 'taskOutput.isUnknownFailureType')).toEqual(false);
      }
    }
  });

  it('update 1 job with invalid taskOutputReason- to aborted', async () => {
    const result = await jobHelper.helpUpdateJobs(
      { gqlClient },
      {
        ids: [updateJobId3],
        status: 'aborted',
        taskOutput: {
          failureReason: 'invalid_error_type',
          failureMessage: 'the message'
        }
      }
    );
    const updateJobs = result;

    expect(updateJobs).toBeDefined();
    expect(updateJobs.length).toEqual(1);
    // the job status is "failed" not "aborted"
    // because we re-mapped the job status in the Job resolver
    // See: https://github.com/veritone/core-graphql-server/blob/master/resolvers/Job.js#L51
    expect(updateJobs[0].status).toEqual('failed');

    for (const job of updateJobs) {
      for (const task of job.tasks.records) {
        expect(task.taskOutput).toBeTruthy();
        expect(task.status).toEqual('aborted');
        expect(_.get(task, 'taskOutput.failureReason')).toEqual(
          'task_validation'
        );
        expect(_.get(task, 'taskOutput.failureMessage')).toEqual('the message');
        expect(_.get(task, 'taskOutput.isUnknownFailureType')).toEqual(true);
      }
    }
  });

  xit('hit media-streamer download endpoint', async () => {
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
    const result = await jobHelper.helpCreateJob(
      { gqlClient },
      {
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
    );
    const createJob = result;

    expect(createJob).toBeDefined();
    expect(createJob.id).toBeTruthy();
    expect(createJob.targetId).toEqual(tdoId);
    expect(createJob.tasks.records.length).toBeGreaterThan(0);

    cancelJobId = createJob.id;
    deleteJobIds.push(cancelJobId);
    modifiedDateTime = createJob.modifiedDateTime;
  });

  it('cancel job', async () => {
    const result = await jobHelper.helpCancelJob(
      { gqlClient },
      { jobId: cancelJobId }
    );
    expect(_.get(result, 'id')).toEqual(cancelJobId);
  });

  it('get job after canceled', async () => {
    const result = await jobHelper.helpGetJobById(
      { gqlClient },
      { jobId: cancelJobId },
      { showTask: true }
    );
    const job = result;

    expect(job).toBeDefined();
    expect(job.id).toEqual(cancelJobId);
    expect(job.status).toEqual('cancelled');

    const tasks = _.get(job, 'tasks.records');

    for (const task of tasks) {
      expect(task.status).toEqual('cancelled');
    }
  });

  it('create a job - to test notificationUrls', async () => {
    const result = await jobHelper.helpCreateJob(
      { gqlClient },
      {
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
    );
    const createJob = result;

    expect(createJob).toBeDefined();
    expect(createJob.id).toBeTruthy();
    expect(createJob.notificationUris.length).toEqual(2);
    expect(createJob.notificationUris[0]).toEqual('http://localhost/link1');
    expect(createJob.notificationUris[1]).toEqual('http://localhost/link2');

    const tasks = _.get(createJob, 'tasks.records');

    expect(tasks.length).toEqual(1);
    expect(tasks[0].notificationUris.length).toEqual(1);
    expect(tasks[0].notificationUris[0]).toEqual('http://localhost/link3');

    jobIdNotificationUrls = createJob.id;
    deleteJobIds.push(jobIdNotificationUrls);
  });

  it('create a job with task - to test the tasks notificationUris', async () => {
    const result = await jobHelper.helpCreateJob(
      { gqlClient },
      {
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
    );

    const createJob = result;

    expect(createJob).toBeDefined();
    expect(createJob.notificationUris.length).toEqual(0);
    expect(createJob.tasks).toBeTruthy();

    const tasks = _.get(createJob, 'tasks.records');

    expect(tasks.length).toEqual(1);
    expect(tasks[0].id).toBeTruthy();
    expect(tasks[0].notificationUris.length).toEqual(2);
    expect(tasks[0].notificationUris[0]).toEqual('http://localhost/link1');
    expect(tasks[0].notificationUris[1]).toEqual('http://localhost/link2');

    taskIdNotificationUrls = tasks[0].id;
    deleteTaskIds.push(taskIdNotificationUrls);
    deleteJobIds.push(createJob.id);
  });

  // Nobody reported a reason, so neither field is set. This used to return task_validation and
  // the "doesn't match any of taskFailureEnum values" boilerplate — a reason Core invented. VE-7494
  it('does not invent a failureReason when status is failed and failureReason value is not passed', async function () {
    const result = await taskHelper.helpUpdateTask(
      { gqlClient },
      { id: taskIdNotificationUrls, status: 'failed' }
    );
    const updateTask = result;

    expect(updateTask).toBeDefined();
    expect(updateTask.failureReason).toBeFalsy();
    expect(updateTask.failureMessage).toBeFalsy();
  });

  it('update taskOutput when status is failed, failureReason is a valid enum value and failureMessage is personalized', async function () {
    const result = await taskHelper.helpUpdateTask(
      { gqlClient },
      {
        id: taskIdNotificationUrls,
        status: 'failed',
        failureReason: 'system_error',
        failureMessage:
          'Streaming error from edge, something were wrong at a system-level'
      }
    );
    const updateTask = result;

    expect(updateTask).toBeDefined();
    expect(updateTask.failureReason).toEqual('system_error');
    expect(updateTask.failureMessage).toEqual(
      'Streaming error from edge, something were wrong at a system-level'
    );
  });

  it('update taskOutput when status is failed, failureReason is a valid enum license_error value and failureMessage is personalized', async function () {
    const query = `mutation {
      updateTask(input: {
        id: "${taskIdNotificationUrls}"
        status: failed
        failureReason: license_error
        failureMessage: "The engine failed due to an expired or invalid license."
      }) {
        id
        failureReason
        failureMessage
      }
    }`;

    const result = await gqlClient.query(query);
    const updateTask = _.get(result, 'updateTask');

    expect(updateTask).toBeDefined();
    expect(updateTask.failureReason).toEqual('license_error');
    expect(updateTask.failureMessage).toEqual(
      'The engine failed due to an expired or invalid license.'
    );
  });

  it('update task notificationUrls', async function () {
    const result = await taskHelper.helpUpdateTask(
      { gqlClient },
      {
        id: taskIdNotificationUrls,
        status: 'complete',
        notificationUris: ['http://localhost']
      }
    );
    const updateTask = result;

    expect(updateTask).toBeDefined();
    expect(updateTask.notificationUris).toEqual(['http://localhost']);
  });

  it('update job notificationUrls', async () => {
    const result = await jobHelper.helpUpdateJobs(
      { gqlClient },
      {
        ids: [jobIdNotificationUrls],
        status: 'failed',
        notificationUris: ['http://localhost/link3', 'http://localhost/link4']
      }
    );

    const updateJob = _.get(result, '[0]');

    expect(updateJob).toBeDefined();
    expect(updateJob.id).toEqual(jobIdNotificationUrls);
    expect(updateJob.notificationUris).toEqual([
      'http://localhost/link3',
      'http://localhost/link4'
    ]);

    const tasks = _.get(updateJob, 'tasks.records[0]');
    expect(tasks).toBeTruthy();
    expect(tasks.notificationUris).toEqual([
      'http://localhost/link3',
      'http://localhost/link4'
    ]);
  });

  it('create a scheduled job - with notificationUris in JobTemplate', async () => {
    const result = await jobHelper.helpCreateScheduledJob(
      { gqlClient },
      {
        name: `${testName}-job`,
        runMode: 'Now',
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
    );

    const createScheduledJob = result;
    expect(createScheduledJob).toBeDefined();
    expect(createScheduledJob.id).toBeTruthy();
    tmpScheduledJobId = createScheduledJob.id;
    const jobs = _.get(createScheduledJob, 'jobs.records');
    expect(jobs[0].notificationUris).toEqual(['http://localhost1']);

    const tasks = _.get(jobs[0], 'tasks.records');
    expect(tasks[0].notificationUris).toEqual(['http://localhost2']);
    tdoIdFromScheduledJob2 = getTdoIdFromScheduledJob(result);
  });

  it('delete the TDO', async () => {
    await deleteTdos(
      gqlClient,
      _.compact([
        tdoIdFromScheduledJob1,
        tdoIdFromScheduledJob2,
        tdoIdFromLaunchScheduledJob1,
        tdoId
      ])
    );
  });

  xit('delete the TDO - launch program', async function () {
    // wait a little before deleting TDO.
    // note that the engine doesn't actually read the TDO, though.
    await util.sleep(0);
    const result = await tdoHelper.helpDeleteTDO(
      { gqlClient },
      { id: tdoIdLaunchProgram }
    );
    expect(_.get(result, 'deleteTDO.id')).toEqual(tdoIdLaunchProgram);
  });

  it('add media segments - throw not_found if TDO has been deleted', async () => {
    const query = `
    mutation {
      addMediaSegment(input: {containerId: "${tdoIdFromScheduledJob1}", details: {
        segmentStartTimeMs: 0
        segmentStopTimeMs: 2000
      }
      url: "https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2"
    }) {
        id
      }
    }
    `;
    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'not_found'
    );
  });

  it('delete cluster test', async () => {
    const result = await clusterHelper.helpDeleteCluster(
      { gqlClient },
      { clusterId: clusterId }
    );

    expect(_.get(result, 'id')).toEqual(clusterId);
  });

  it('delete cluster test - current org', async () => {
    const result = await clusterHelper.helpDeleteCluster(
      { gqlClient },
      { clusterId: clusterId1 }
    );

    expect(_.get(result, 'id')).toEqual(clusterId1);
  });

  it('delete the scheduleJob test', async () => {
    const result = await jobHelper.helpDeleteScheduledJob(
      { gqlClient },
      { scheduledJobId: scheduledJobId }
    );
    expect(_.get(result, 'id')).toEqual(scheduledJobId);
  });

  it('delete scheduledJob schema data', async () => {
    const deleteSchemaResult = await schemaHelper.helpDeleteSchema(
      { gqlClient },
      { schemaId: schemaId }
    );
    expect(deleteSchemaResult).toBeDefined();
    const deletedSchema = deleteSchemaResult.updateSchemaState;
    expect(deletedSchema).toBeDefined();
    expect(deletedSchema.status).toEqual('deleted');
  });

  // Temporary skip this and will enable after VTN-35322 release on prod
  xit('delete the scheduleJob Youtube/podcast test', async () => {
    const result = await jobHelper.helpDeleteScheduledJob(
      { gqlClient },
      { scheduledJobId: scheduledJobVideoId }
    );
    expect(result.deleteScheduledJob.id).toEqual(scheduledJobVideoId);
  });

  async function createAndUpdateSchema(dataRegistryId) {
    let schemaCreateResult = await schemaHelper.helpCreateSchemaDraft(
      { gqlClient },
      {
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
    );

    let schemaResult = schemaCreateResult;
    schemaId = schemaResult.id;
    expect(schemaId).toBeDefined();

    let schemaUpdateResult = await schemaHelper.helpPublishSchema(
      { gqlClient },
      { id: schemaId, breakingChanges: false }
    );

    let schemaUpdate = _.get(schemaUpdateResult, 'updateSchemaState');
    expect(schemaUpdate.id).toEqual(schemaId);
    expect(schemaUpdate.status).toEqual('published');
  }
});
function getTdoIdFromScheduledJob(scheduledJobResult) {
  return _.get(scheduledJobResult, 'jobs.records[0].targetId');
}

async function deleteTdos(gqlClient, tdoList, options) {
  for (let i = 0; i < tdoList.length; i++) {
    await safe(`delete tdo ${tdoList[i]}`, async () => {
      const resultScheduleJob = await tdoHelper.processTDODeletion(
        gqlClient,
        tdoList[i],
        null,
        options
      );
      if (resultScheduleJob) {
        expect(_.get(resultScheduleJob, 'deleteTDO.id')).toEqual(tdoList[i]);
      }
    });
  }
}
