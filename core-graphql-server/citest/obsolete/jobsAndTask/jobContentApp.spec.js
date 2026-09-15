const _ = require('lodash');
const uuid = require('uuid');
const helpers = require('../../helpers/index.js');
const GraphqlClient = require('../../helpers/gql.js');
const jobDb = require('../../helpers/jobDb.js');

const jobHelper = require('../../helpers/job.js');
const tdoHelper = require('../../helpers/tdo.js');
const engineHelper = require('../../helpers/engine.js');
const clusterHelper = require('../../helpers/cluster.js');
const dagTemplateHelper = require('../../helpers/dagTemplate.js');
const folderHelper = require('../../helpers/folder.js');
const { safe } = require('../../helpers/cleanup/utils.js');
const mockUtil = require('../../../test/mockUtil.js')();

const config = helpers.config;
const citestMarker = global.citestMarker || 'citest-should-delete';
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
);

const buildEngineActionList = [
  ['submit', 'pending'],
  ['deploy', 'deployed']
];
const publicBuildEngineActionList = [
  ['submit', 'pending'],
  ['approve', 'approved'],
  ['deploy', 'deployed']
];

const engineCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
let gqlClient;

describe('citest_job: createJobContentApp', () => {
  let superToken, apiToken, superAdminOptions, noHeaderOptions;
  let tdoId, engineId, clusterId, superAdminFolderId;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient({ env });
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    apiToken = result.apiToken;
    superAdminOptions = helpers.requestOptions(superToken);

    noHeaderOptions = helpers.requestOptions(
      config.env === 'ai13s' ? superToken : apiToken
    );
    delete noHeaderOptions.headers['X-Veritone-Application'];

    // create TDO
    const createTDOResult = await tdoHelper.helpCreateTDOWithAsset(
      { gqlClient, options: superAdminOptions },
      {
        name: `${citestMarker}-tdo-${uuid.v4()}`,
        ...tdoAssetInput
      }
    );
    expect(createTDOResult).toBeDefined();
    tdoId = _.get(createTDOResult, 'id');

    // create cluster
    const clusterCreateRes = await clusterHelper.helpCreateCluster(
      { gqlClient, options: superAdminOptions },
      {
        name: `${citestMarker}-test-cluster-${uuid.v4()}`,
        dockerCredentials: {},
        allowedEngines: [],
        status: 'active'
      }
    );
    expect(clusterCreateRes).toBeDefined();
    clusterId = _.get(clusterCreateRes, 'id');
    expect(clusterId).toBeDefined();

    // create engine
    const engineCreate = await engineHelper.helpCreateEngine(
      { gqlClient, options: superAdminOptions },
      {
        name: `${citestMarker}-engine-${uuid.v4()}`,
        categoryId: engineCategoryId,
        deploymentModel: 'FullyNetworkIsolated'
      }
    );
    const engineData = _.get(engineCreate, 'createEngine');
    expect(engineCreate).toBeDefined();
    engineId = _.get(engineData, 'id');

    // deploy engine
    await buildAndDeployEngine(engineId, superAdminOptions);

    // get root folder => no need to delete
    let superAdminFolder = await folderHelper.helpGetRootFolders(
      { gqlClient, options: superAdminOptions },
      'cms',
      {
        limit: 1,
        offset: 0,
        orderBy: [
          { field: 'createdDateTime', direction: 'desc' },
          { field: 'name', direction: 'asc' }
        ]
      }
    );

    if (superAdminFolder.length === 0) {
      // admin create root folder
      superAdminFolder = await folderHelper.helpCreateRootFolder(
        { gqlClient, options: superAdminOptions },
        { rootFolderType: 'cms' }
      );
      expect(superAdminFolder).toBeDefined();
    }
    const folderId = _.get(superAdminFolder, '[0].id');
    superAdminFolderId = folderId;
  });

  afterAll(async () => {
    // delete engine
    if (engineId) {
      await safe('delete engine', async () =>
        engineHelper.helpDeleteEngine(
          { gqlClient, options: superAdminOptions },
          { id: engineId }
        )
      );
    }

    // delete cluster
    if (clusterId) {
      await safe('delete cluster', async () =>
        clusterHelper.helpDeleteCluster(
          { gqlClient, options: superAdminOptions },
          { clusterId: clusterId }
        )
      );
    }

    //delete tdo
    if (tdoId) {
      await safe('delete tdo', async () =>
        tdoHelper.helpDeleteTDO(
          { gqlClient, options: superAdminOptions },
          { id: tdoId }
        )
      );
    }
  });

  describe('job v1', () => {
    describe('create job v1 directly', () => {
      let jobIdV1, jobIdV1WithHeader;
      it('create job v1 empty X-Veritone-Application header', async () => {
        const newJob = await jobHelper.helpCreateJob(
          { gqlClient: gqlClient, options: noHeaderOptions },
          {
            targetId: tdoId,
            skipDecider: true,
            tasks: [
              { engineId: engineId, payload: { engineReturnValue: true } }
            ]
          }
        );

        expect(newJob).toBeDefined();
        jobIdV1 = _.get(newJob, 'id');

        const dbValue = await jobDb.getJobContentApplicationId(jobIdV1);
        expect(dbValue).toEqual('');
      });

      it('update job does not change content_application_id', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );

        const headerAppId = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = headerAppId;

        await jobHelper.helpUpdateJobs(
          { gqlClient: gqlClient, options: reqOptions },
          {
            ids: [jobIdV1],
            status: 'queued'
          }
        );
        const dbValue = await jobDb.getJobContentApplicationId(jobIdV1);
        expect(dbValue).not.toEqual(headerAppId);
      });

      it('create job v1 with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );

        const launchAppId = 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0'; // Developer app fixture
        reqOptions.headers['X-Veritone-Application'] = launchAppId;
        const newJob = await jobHelper.helpCreateJob(
          { gqlClient: gqlClient, options: reqOptions },
          {
            targetId: tdoId,
            skipDecider: true,
            tasks: [
              { engineId: engineId, payload: { engineReturnValue: true } }
            ]
          }
        );
        expect(newJob).toBeDefined();
        jobIdV1WithHeader = _.get(newJob, 'id');

        const dbValue =
          await jobDb.getJobContentApplicationId(jobIdV1WithHeader);
        expect(dbValue).toEqual(launchAppId);
      });

      afterAll(async () => {
        if (jobIdV1) {
          await safe('cancel job v1', async () =>
            jobHelper.helpCancelJob(
              { gqlClient: gqlClient, options: superAdminOptions },
              { jobId: jobIdV1 }
            )
          );
        }

        if (jobIdV1WithHeader) {
          await safe('cancel job v1 with header', async () =>
            jobHelper.helpCancelJob(
              { gqlClient: gqlClient, options: superAdminOptions },
              { jobId: jobIdV1WithHeader }
            )
          );
        }
      });
    });

    describe('job v1 from job template', () => {
      let jobTemplateId, jobTemplateIdWithHeader;
      let randomHeader;

      afterAll(async () => {
        if (jobTemplateId) {
          await safe('delete job template without header', async () =>
            jobHelper.helpDeleteJobTemplate(
              { gqlClient, options: superAdminOptions },
              { jobTemplateId: jobTemplateId }
            )
          );
        }

        if (jobTemplateIdWithHeader) {
          await safe('delete job template with header', async () =>
            jobHelper.helpDeleteJobTemplate(
              { gqlClient, options: superAdminOptions },
              { jobTemplateId: jobTemplateIdWithHeader }
            )
          );
        }
      });

      it('create job template empty X-Veritone-Application header', async () => {
        const createJobTemplateRes = await jobHelper.helpCreateJobTemplate(
          { gqlClient, options: noHeaderOptions },
          { taskTemplates: [{ engineId: engineId }] }
        );

        jobTemplateId = _.get(createJobTemplateRes, 'id');
        expect(jobTemplateId).toBeDefined();
      });

      it('launch job template empty X-Veritone-Application header', async () => {
        const launchRes = await jobHelper.helpLaunchJobTemplates(
          { gqlClient, options: noHeaderOptions },
          {
            ids: [jobTemplateId],
            targetInfo: { targetId: tdoId }
          }
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = _.get(launchRes, '[0].id');
        expect(launchedJobId).toBeDefined();

        const dbValue = await jobDb.getJobContentApplicationId(launchedJobId);
        expect(dbValue).toEqual('');

        await safe('cancel job v1 template', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: noHeaderOptions },
            { jobId: launchedJobId }
          )
        );
      });

      it('launch job template with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );

        const launchAppId = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = launchAppId;
        const launchRes = await jobHelper.helpLaunchJobTemplates(
          { gqlClient, options: reqOptions },
          {
            ids: [jobTemplateId],
            targetInfo: { targetId: tdoId }
          }
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = _.get(launchRes, '[0].id');
        expect(launchedJobId).toBeDefined();

        const dbValue = await jobDb.getJobContentApplicationId(launchedJobId);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel job v1 template', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: reqOptions },
            { jobId: launchedJobId }
          )
        );
      });

      it('create job template with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );

        randomHeader = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = randomHeader;

        const createJobTemplateRes = await jobHelper.helpCreateJobTemplate(
          { gqlClient, options: reqOptions },
          { taskTemplates: [{ engineId: engineId }] }
        );

        jobTemplateIdWithHeader = _.get(createJobTemplateRes, 'id');
        expect(jobTemplateIdWithHeader).toBeDefined();
      });

      it('launch job template empty X-Veritone-Application header should inherit content_application_id from template', async () => {
        const launchRes = await jobHelper.helpLaunchJobTemplates(
          { gqlClient, options: noHeaderOptions },
          {
            ids: [jobTemplateIdWithHeader],
            targetInfo: { targetId: tdoId }
          }
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = _.get(launchRes, '[0].id');
        expect(launchedJobId).toBeDefined();

        const dbValue = await jobDb.getJobContentApplicationId(launchedJobId);
        expect(dbValue).toEqual(randomHeader);

        await safe('cancel job v1 template', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: superAdminOptions },
            { jobId: launchedJobId }
          )
        );
      });
    });

    describe('job v1 from scheduled jobs', () => {
      let scheduledJobIdWithoutHeader, scheduledJobIdWithHeader;
      let randomHeader;

      afterAll(async () => {
        if (scheduledJobIdWithoutHeader) {
          await safe('delete scheduled job', async () =>
            jobHelper.helpDeleteScheduledJob(
              { gqlClient: gqlClient, options: superAdminOptions },
              { scheduledJobId: scheduledJobIdWithoutHeader }
            )
          );
        }

        if (scheduledJobIdWithHeader) {
          await safe('delete scheduled job with header', async () =>
            jobHelper.helpDeleteScheduledJob(
              { gqlClient, options: superAdminOptions },
              { scheduledJobId: scheduledJobIdWithHeader }
            )
          );
        }
      });
      it('create scheduled job empty X-Veritone-Application header', async () => {
        const createScheduledJobResult = await jobHelper.helpCreateScheduledJob(
          { gqlClient, options: noHeaderOptions },
          {
            name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
            runMode: 'Now',
            details: {
              programFormat: 'Adult Contemporary',
              foo: 'bar',
              isNational: true
            },
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
        );

        expect(createScheduledJobResult).toBeDefined();
        scheduledJobIdWithoutHeader = _.get(createScheduledJobResult, 'id');
        expect(scheduledJobIdWithoutHeader).toBeDefined();
      });

      it('launch job from scheduled job with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );
        const launchAppId = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = launchAppId;

        const launchRes = await jobHelper.helpLaunchScheduledJobs(
          { gqlClient, options: reqOptions },
          {
            scheduledJobId: scheduledJobIdWithoutHeader,
            payload: { maxIngestionJobs: 1 }
          }
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = _.get(launchRes, '[0].id');
        expect(launchedJobId).toBeDefined();
        const dbValue = await jobDb.getJobContentApplicationId(launchedJobId);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel job from scheduled job', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: superAdminOptions },
            { jobId: launchedJobId }
          )
        );
      });

      it('create scheduled job with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );
        randomHeader = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = randomHeader;
        const createScheduledJobResult = await jobHelper.helpCreateScheduledJob(
          { gqlClient, options: reqOptions },
          {
            name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
            runMode: 'Now',
            details: {
              programFormat: 'Adult Contemporary',
              foo: 'bar',
              isNational: true
            },
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
        );

        expect(createScheduledJobResult).toBeDefined();
        scheduledJobIdWithHeader = _.get(createScheduledJobResult, 'id');
        expect(scheduledJobIdWithHeader).toBeDefined();
      });

      it('launch job from scheduled job should inherit content_application_id from scheduled job', async () => {
        const launchRes = await jobHelper.helpLaunchScheduledJobs(
          { gqlClient, options: noHeaderOptions },
          {
            scheduledJobId: scheduledJobIdWithHeader,
            payload: { maxIngestionJobs: 1 }
          }
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = _.get(launchRes, '[0].id');
        expect(launchedJobId).toBeDefined();
        const dbValue = await jobDb.getJobContentApplicationId(launchedJobId);
        expect(dbValue).toEqual(randomHeader);

        await safe('cancel job from scheduled job with header', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: superAdminOptions },
            { jobId: launchedJobId }
          )
        );
      });
    });
  });

  describe('job v3', () => {
    describe('create job v3 directly', () => {
      let jobIdV3, jobIdV3WithHeader;
      it('create job v3 empty X-Veritone-Application header', async () => {
        const newJob = await jobHelper.helpCreateJob(
          { gqlClient: gqlClient, options: noHeaderOptions },
          {
            name: `${citestMarker}-job-${uuid.v4()}`,
            targetId: tdoId,
            tasks: [
              {
                engineId: engineId,
                ioFolders: [
                  {
                    referenceId: superAdminFolderId,
                    mode: 'chunk',
                    type: 'output'
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
        );

        expect(newJob).toBeDefined();
        jobIdV3 = _.get(newJob, 'id');
        const dbValue = await jobDb.getJobContentApplicationId(jobIdV3);
        expect(dbValue).toEqual('');
      });

      it('update job v3 with X-Veritone-Application header should not update content_application_id', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );

        const headerAppId = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = headerAppId;

        await jobHelper.helpUpdateJobs(
          { gqlClient: gqlClient, options: reqOptions },
          {
            ids: [jobIdV3],
            status: 'queued'
          }
        );
        const dbValue = await jobDb.getJobContentApplicationId(jobIdV3);
        expect(dbValue).not.toEqual(headerAppId);
      });

      it('create job v3 with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );

        const launchAppId = 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0'; // Developer app fixture
        reqOptions.headers['X-Veritone-Application'] = launchAppId;
        const newJob = await jobHelper.helpCreateJob(
          { gqlClient: gqlClient, options: reqOptions },
          {
            name: `${citestMarker}-job-${uuid.v4()}`,
            targetId: tdoId,
            tasks: [
              {
                engineId: engineId,
                ioFolders: [
                  {
                    referenceId: superAdminFolderId,
                    mode: 'chunk',
                    type: 'output'
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
        );

        expect(newJob).toBeDefined();
        jobIdV3WithHeader = _.get(newJob, 'id');
        const dbValue =
          await jobDb.getJobContentApplicationId(jobIdV3WithHeader);
        expect(dbValue).toEqual(launchAppId);
      });

      afterAll(async () => {
        if (jobIdV3) {
          await safe('cancel job v3', async () =>
            jobHelper.helpCancelJob(
              { gqlClient: gqlClient, options: superAdminOptions },
              { jobId: jobIdV3 }
            )
          );
        }

        if (jobIdV3WithHeader) {
          await safe('cancel job v3 with header', async () =>
            jobHelper.helpCancelJob(
              { gqlClient: gqlClient, options: superAdminOptions },
              { jobId: jobIdV3WithHeader }
            )
          );
        }
      });
    });

    describe('job v3 from DAG template', () => {
      let dagTemplateIdWithoutHeader, dagTemplateIdWithHeader;
      let randomHeader;
      beforeAll(async () => {
        // create dag template dagTemplateIdWithoutHeader
        const createDagTemplateRes =
          await dagTemplateHelper.helpCreateDagTemplate(
            { gqlClient, options: noHeaderOptions },
            {
              name: `${citestMarker}-dag-template-${uuid.v4()}`,
              dag: sampleDagTemplate,
              dagTemplateLanguage: 'Handlebars',
              tags: ['foo', 'bar']
            }
          );
        dagTemplateIdWithoutHeader = _.get(createDagTemplateRes, 'id');
        expect(dagTemplateIdWithoutHeader).toBeDefined();

        // create dag template dagTemplateIdWithHeader
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );

        randomHeader = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = randomHeader;
        const createDagTemplateWithHeaderRes =
          await dagTemplateHelper.helpCreateDagTemplate(
            { gqlClient, options: reqOptions },
            {
              name: `${citestMarker}-dag-template-${uuid.v4()}`,
              dag: sampleDagTemplate,
              dagTemplateLanguage: 'Handlebars',
              tags: ['foo', 'bar']
            }
          );
        dagTemplateIdWithHeader = _.get(createDagTemplateWithHeaderRes, 'id');
        expect(dagTemplateIdWithHeader).toBeDefined();
      });

      afterAll(async () => {
        if (dagTemplateIdWithoutHeader) {
          await safe('delete dag template without header', async () =>
            dagTemplateHelper.helpDeleteDagTemplate(
              { gqlClient, options: superAdminOptions },
              { id: dagTemplateIdWithoutHeader }
            )
          );
        }

        if (dagTemplateIdWithHeader) {
          await safe('delete dag template with header', async () =>
            dagTemplateHelper.helpDeleteDagTemplate(
              { gqlClient, options: superAdminOptions },
              { id: dagTemplateIdWithHeader }
            )
          );
        }
      });

      it('launch v3 DAG template empty X-Veritone-Application header', async () => {
        const result = await dagTemplateHelper.helpLaunchDagTemplate(
          { gqlClient, options: noHeaderOptions },
          {
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
        );
        const createJob = result;
        const jobId = createJob.id;
        expect(createJob).toBeDefined();
        expect(jobId).toBeDefined();
        const dbValue = await jobDb.getJobContentApplicationId(jobId);
        expect(dbValue).toEqual('');

        await safe('cancel job from dag template without header', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: superAdminOptions },
            { jobId: jobId }
          )
        );
      });

      it('launch v3 DAG template with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );
        const launchAppId = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = launchAppId;

        const result = await dagTemplateHelper.helpLaunchDagTemplate(
          { gqlClient, options: reqOptions },
          {
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
        );

        expect(result).toBeDefined();
        const jobId = result.id;
        expect(jobId).toBeDefined();
        const dbValue = await jobDb.getJobContentApplicationId(jobId);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel job from dag template with header', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: reqOptions },
            { jobId: jobId }
          )
        );
      });

      // unskip when supporting store application id in dag template and child job inherit it is released,
      // currently the content_application_id is only set from header when launching job template
      xit('launch job from v3 dagTemplate should inherit X-Veritone-Application header', async () => {
        const result = await dagTemplateHelper.helpLaunchDagTemplate(
          { gqlClient, options: noHeaderOptions },
          {
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
        );
        const createJob = result;
        const jobId = createJob.id;
        expect(createJob).toBeDefined();
        expect(jobId).toBeDefined();
        const dbValue = await jobDb.getJobContentApplicationId(jobId);
        expect(dbValue).toEqual(randomHeader);

        await safe('cancel job from dag template without header', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: superAdminOptions },
            { jobId: jobId }
          )
        );
      });
    });

    describe('job v3 from job template', () => {
      let jobTemplateV3Id, jobTemplateIdV3WithHeader;
      let randomHeader;

      afterAll(async () => {
        if (jobTemplateV3Id) {
          await safe('delete job template v3', async () =>
            jobHelper.helpDeleteJobTemplate(
              { gqlClient, options: superAdminOptions },
              { jobTemplateId: jobTemplateV3Id }
            )
          );
        }

        if (jobTemplateIdV3WithHeader) {
          await safe('delete job template v3 with header', async () =>
            jobHelper.helpDeleteJobTemplate(
              { gqlClient, options: superAdminOptions },
              { jobTemplateId: jobTemplateIdV3WithHeader }
            )
          );
        }
      });
      it('create job v3 template empty X-Veritone-Application header', async () => {
        const createJobTemplateRes = await jobHelper.helpCreateJobTemplate(
          { gqlClient, options: noHeaderOptions },
          {
            taskTemplates: [
              {
                engineId: engineId,
                ioFolders: [
                  {
                    referenceId: superAdminFolderId,
                    mode: 'chunk',
                    type: 'output'
                  }
                ]
              }
            ],
            routes: [{ parentIoFolderReferenceId: superAdminFolderId }]
          }
        );

        jobTemplateV3Id = _.get(createJobTemplateRes, 'id');
        expect(jobTemplateV3Id).toBeDefined();
      });

      it('launch job V3 from template empty X-Veritone-Application header', async () => {
        const launchRes = await jobHelper.helpLaunchJobTemplates(
          { gqlClient, options: noHeaderOptions },
          {
            ids: [jobTemplateV3Id],
            targetInfo: { targetId: tdoId }
          }
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = _.get(launchRes, '[0].id');
        expect(launchedJobId).toBeDefined();
        const dbValue = await jobDb.getJobContentApplicationId(launchedJobId);
        expect(dbValue).toEqual('');

        await safe('cancel job v3 template', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: noHeaderOptions },
            { jobId: launchedJobId }
          )
        );
      });

      it('launch job V3 from template with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );

        const launchAppId = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = launchAppId;
        const launchRes = await jobHelper.helpLaunchJobTemplates(
          { gqlClient, options: reqOptions },
          {
            ids: [jobTemplateV3Id],
            targetInfo: { targetId: tdoId }
          }
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = _.get(launchRes, '[0].id');
        expect(launchedJobId).toBeDefined();
        const dbValue = await jobDb.getJobContentApplicationId(launchedJobId);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel job v3 template', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: reqOptions },
            { jobId: launchedJobId }
          )
        );
      });

      it('create job template v3 with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );

        randomHeader = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = randomHeader;

        const createJobTemplateRes = await jobHelper.helpCreateJobTemplate(
          { gqlClient, options: reqOptions },
          {
            taskTemplates: [
              {
                engineId: engineId,
                ioFolders: [
                  {
                    referenceId: superAdminFolderId,
                    mode: 'chunk',
                    type: 'output'
                  }
                ]
              }
            ],
            routes: [{ parentIoFolderReferenceId: superAdminFolderId }]
          }
        );

        jobTemplateIdV3WithHeader = _.get(createJobTemplateRes, 'id');
        expect(jobTemplateIdV3WithHeader).toBeDefined();
      });

      it('launch job V3 from template empty X-Veritone-Application header should inherit content_application_id from template', async () => {
        const launchRes = await jobHelper.helpLaunchJobTemplates(
          { gqlClient, options: noHeaderOptions },
          {
            ids: [jobTemplateIdV3WithHeader],
            targetInfo: { targetId: tdoId }
          }
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = _.get(launchRes, '[0].id');
        expect(launchedJobId).toBeDefined();
        const dbValue = await jobDb.getJobContentApplicationId(launchedJobId);
        expect(dbValue).toEqual(randomHeader);

        await safe('cancel job v3 template', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: superAdminOptions },
            { jobId: launchedJobId }
          )
        );
      });
    });

    describe('job v3 from scheduled jobs', () => {
      let scheduledJobIdWithoutHeader, scheduledJobIdWithHeader;
      let randomHeader;

      afterAll(async () => {
        if (scheduledJobIdWithoutHeader) {
          await safe('delete scheduled job', async () =>
            jobHelper.helpDeleteScheduledJob(
              { gqlClient: gqlClient, options: superAdminOptions },
              { scheduledJobId: scheduledJobIdWithoutHeader }
            )
          );
        }
        if (scheduledJobIdWithHeader) {
          await safe('delete scheduled job with header', async () =>
            jobHelper.helpDeleteScheduledJob(
              { gqlClient: gqlClient, options: superAdminOptions },
              { scheduledJobId: scheduledJobIdWithHeader }
            )
          );
        }
      });
      it('create scheduled job v3 empty X-Veritone-Application header', async () => {
        const createScheduledJobResult = await jobHelper.helpCreateScheduledJob(
          { gqlClient, options: noHeaderOptions },
          {
            name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
            runMode: 'Now',
            details: {
              programFormat: 'Adult Contemporary',
              foo: 'bar',
              isNational: true
            },
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
                        mode: 'chunk',
                        type: 'output'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        );

        expect(createScheduledJobResult).toBeDefined();
        scheduledJobIdWithoutHeader = _.get(createScheduledJobResult, 'id');
        expect(scheduledJobIdWithoutHeader).toBeDefined();
      });

      it('launch job v3 from scheduled job with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );
        const launchAppId = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = launchAppId;

        const launchRes = await jobHelper.helpLaunchScheduledJobs(
          { gqlClient, options: reqOptions },
          {
            scheduledJobId: scheduledJobIdWithoutHeader,
            payload: { maxIngestionJobs: 1 }
          }
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = _.get(launchRes, '[0].id');
        expect(launchedJobId).toBeDefined();
        const dbValue = await jobDb.getJobContentApplicationId(launchedJobId);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel job from scheduled job', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: superAdminOptions },
            { jobId: launchedJobId }
          )
        );
      });

      it('create scheduled job v3 with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );
        randomHeader = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = randomHeader;
        const createScheduledJobResult = await jobHelper.helpCreateScheduledJob(
          { gqlClient, options: reqOptions },
          {
            name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
            runMode: 'Now',
            details: {
              programFormat: 'Adult Contemporary',
              foo: 'bar',
              isNational: true
            },
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
                        mode: 'chunk',
                        type: 'output'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        );

        expect(createScheduledJobResult).toBeDefined();
        scheduledJobIdWithHeader = _.get(createScheduledJobResult, 'id');
        expect(scheduledJobIdWithHeader).toBeDefined();
      });

      it('launch job v3 from scheduled job empty X-Veritone-Application header should inherit content_application_id from scheduled job', async () => {
        const launchRes = await jobHelper.helpLaunchScheduledJobs(
          { gqlClient, options: noHeaderOptions },
          {
            scheduledJobId: scheduledJobIdWithHeader,
            payload: { maxIngestionJobs: 1 }
          }
        );

        expect(launchRes).toBeDefined();
        const launchedJobId = _.get(launchRes, '[0].id');
        expect(launchedJobId).toBeDefined();
        const dbValue = await jobDb.getJobContentApplicationId(launchedJobId);
        expect(dbValue).toEqual(randomHeader);

        await safe('cancel job from scheduled job with header', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: superAdminOptions },
            { jobId: launchedJobId }
          )
        );
      });
    });

    describe('launch single engine job v3', () => {
      let uploadEngineDataNoHeader, uploadEngineDataWithHeader;
      beforeAll(async () => {
        // create engine with out header
        const uploadEngine = await engineHelper.helpCreateEngine(
          { gqlClient, options: noHeaderOptions },
          {
            name: citestMarker + '-upload-engine-' + uuid.v4(),
            categoryId: engineCategoryId,
            deploymentModel: 'FullyNetworkIsolated'
          }
        );
        uploadEngineDataNoHeader = uploadEngine.createEngine;

        await buildAndDeployEngine(
          uploadEngineDataNoHeader.id,
          superAdminOptions
        );

        await engineHelper.helpUpdateEngine(
          { gqlClient, options: superAdminOptions },
          {
            id: uploadEngineDataNoHeader.id,
            standaloneJobTemplates: [
              {
                type: 'Upload',
                template: testTemplateTextUploadChunk
              }
            ]
          }
        );

        // create engine with header
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );
        const headerAppId = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = headerAppId;
        const uploadEngineWithHeader = await engineHelper.helpCreateEngine(
          { gqlClient, options: reqOptions },
          {
            name: citestMarker + '-upload-engine-' + uuid.v4(),
            categoryId: engineCategoryId,
            deploymentModel: 'FullyNetworkIsolated'
          }
        );
        uploadEngineDataWithHeader = uploadEngineWithHeader.createEngine;

        await buildAndDeployEngine(
          uploadEngineDataWithHeader.id,
          superAdminOptions
        );

        await engineHelper.helpUpdateEngine(
          { gqlClient, options: superAdminOptions },
          {
            id: uploadEngineDataWithHeader.id,
            standaloneJobTemplates: [
              {
                type: 'Upload',
                template: testTemplateTextUploadChunk
              }
            ]
          }
        );
      });

      afterAll(async () => {
        if (uploadEngineDataNoHeader) {
          await safe('delete upload engine without header', async () =>
            engineHelper.helpDeleteEngine(
              { gqlClient, options: superAdminOptions },
              { id: uploadEngineDataNoHeader.id }
            )
          );
        }

        if (uploadEngineDataWithHeader) {
          await safe('delete upload engine with header', async () =>
            engineHelper.helpDeleteEngine(
              { gqlClient, options: superAdminOptions },
              { id: uploadEngineDataWithHeader.id }
            )
          );
        }
      });
      it('launch engine job v3 empty X-Veritone-Application header', async () => {
        const result = await jobHelper.helpLaunchSingleEngineJob(
          { gqlClient, options: noHeaderOptions },
          {
            engineId: uploadEngineDataNoHeader.id,
            clusterId: clusterId,
            uploadUrl: 'http://localhost',
            priority: 1
          }
        );

        expect(result).toBeDefined();
        expect(result.clusterId).toEqual(clusterId);
        const jobId = _.get(result, 'id');
        expect(jobId).toBeDefined();

        const dbValue = await jobDb.getJobContentApplicationId(jobId);
        expect(dbValue).toEqual('');

        await safe('cancel engine job without header', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: superAdminOptions },
            { jobId: jobId }
          )
        );
      });

      it('launch engine job v3 with X-Veritone-Application header', async () => {
        const reqOptions = helpers.requestOptions(
          config.env === 'ai13s' ? superToken : apiToken
        );

        const launchAppId = uuid.v4();
        reqOptions.headers['X-Veritone-Application'] = launchAppId;

        const launchJob = await jobHelper.helpLaunchSingleEngineJob(
          { gqlClient, options: reqOptions },
          {
            engineId: uploadEngineDataNoHeader.id,
            clusterId: clusterId,
            uploadUrl: 'http://localhost',
            priority: 1
          }
        );

        const jobId = _.get(launchJob, 'id');
        expect(jobId).toBeDefined();

        const dbValue = await jobDb.getJobContentApplicationId(jobId);
        expect(dbValue).toEqual(launchAppId);

        await safe('cancel engine job with header', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: reqOptions },
            { jobId: jobId }
          )
        );
      });

      // unskip when supporting store application id in engine and child job inherit it is released
      xit('launch engine job v3 should inherit header as content_application_id', async () => {
        const result = await jobHelper.helpLaunchSingleEngineJob(
          { gqlClient, options: noHeaderOptions },
          {
            engineId: uploadEngineDataWithHeader.id,
            clusterId: clusterId,
            uploadUrl: 'http://localhost',
            priority: 1
          }
        );

        expect(result).toBeDefined();
        expect(result.clusterId).toEqual(clusterId);
        const jobId = _.get(result, 'id');
        expect(jobId).toBeDefined();

        const dbValue = await jobDb.getJobContentApplicationId(jobId);
        expect(dbValue).toEqual('');

        await safe('cancel engine job without header', async () =>
          jobHelper.helpCancelJob(
            { gqlClient: gqlClient, options: superAdminOptions },
            { jobId: jobId }
          )
        );
      });
    });
  });
});

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
    await engineHelper.helpUpdateEngineBuild(
      { gqlClient, options: options },
      {
        id: engineBuildId,
        engineId: engineId,
        action: action[0]
      }
    );
  }
}
