const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const moment = require('moment');
const supertest = require('supertest');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');
const util = require('../../util.js')();

const config = helpers.config;

const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif(
  (config.env === DEFAULT_ENV_TO_RUN_IN),
  'audit-log-basicJob use NOT_INTERNAL_ENGINE_ID @nightly',
  () => {
    describe('basic jobs test use NOT_INTERNAL_ENGINE_ID', () => {
      let gqlClient;
      let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;

      const OPTIONS = {
        baselineEvents: ['task_updated'],
        configurableEvents: ['AssetMetadataUpdate', 'AssetUpload']
      };

      let mediaStreamerHeader;
      let engineId,
        jobId,
        tdoId,
        taskId,
        nullTaskId,
        existingTaskId,
        jwt,
        cancelJobId;
      let signedUrl, unsignedUrl, assetId;

      const startDateTime = moment().subtract(2, 'hour').unix();
      const stopDateTime = moment().subtract(1, 'hour').unix();
      const testName = 'test_schedule_job_' + Date.now();
      const testKey = 'test' + _.toString(Date.now());

      // THIS IS NOT AN INTERNAL ENGINE ID BUT IT'S THE ONLY WAY TO GET PAST GQL SHORT CIRCUIT
      // ./services/api/core-graphql-server/dal/task.js
      /*
...
async function updateAssetSizeOnTaskComplete(context, task) {
    ...
      if (engineId !== '352556c7-de07-4d55-b33f-74b1cf237f25') {
        return updatedAssets;
      }
  ...
*/
      const NOT_INTERNAL_ENGINE_ID = '352556c7-de07-4d55-b33f-74b1cf237f25';

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
      let tdoIdFromLaunchScheduledJob1;

      beforeAll(async () => {
        helpersAuditLog = await buildAndInitializeAuditLogHelpers(
          config,
          OPTIONS
        );
        let result = await helpersAuditLog.loginWithConfiguredUser();
        CONFIG_ADMIN_TOKEN = result.userLogin.token;
        CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
        expect(CONFIG_ADMIN_TOKEN).toBeDefined();
        expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
        const env = config.env;
        gqlClient = new GraphqlClient(env);
        result = await gqlClient.connect();
        expect(result.apiToken).toBeDefined();
        expect(
          result.token,
          `result=${JSON.stringify(result, null, 2)}`
        ).toBeDefined();

        mediaStreamerHeader = helpers.mediaStreamerHeader(result.token);
      });

      it('Finds engine that does not create TDO', async () => {
        const query = `
query {
  engines(id: "${NOT_INTERNAL_ENGINE_ID}") {
    records {
      id
      name
      createsTDO
      libraryRequired
      categoryId
      state
      category {
        name
      }
      builds(status: "deployed") {
        records {
          id
          status
        }
      }
    }
  }
  engineLibraryRequired: engines(libraryRequired: true, state: [active], limit:1) {
    records {
      id
      name
      createsTDO
      libraryRequired
      categoryId
      state
      category {
        name
      }
      builds(status: "deployed") {
        records {
          id
          status
        }
      }
    }
  }
  url: getSignedWritableUrl (type:"asset" path: "citest"){
    url
    unsignedUrl
  }
}`;
        const result = await gqlClient.query(query);

        const engines = _.get(result, 'engines.records');
        expect(engines).toBeDefined();

        // use dedicated test engine if it's present
        engineId = _.get(result, 'engines.records[0].id');
        expect(engineId).toBeDefined();
        const createsTDO = _.get(result, 'engines.records[0].createsTDO');
        expect(createsTDO).toBeTruthy();
        const state = _.get(result, 'engines.records[0].state');
        expect(state).toBe('active');
        signedUrl = _.get(result, 'url.url');
        expect(signedUrl).toBeDefined();
        unsignedUrl = _.get(result, 'url.unsignedUrl');
        expect(unsignedUrl).toBeDefined();

        const engineLibraryRequired = _.get(result, 'engineLibraryRequired');

        expect(engineLibraryRequired).toBeDefined();
        expect(engineLibraryRequired.records[0]).toBeDefined();
        expect(_.get(engineLibraryRequired, 'records[0].id')).toBeDefined();

        engineIdRequiredLibrary = _.get(engineLibraryRequired, 'records[0].id');
      });

      it('find a test source, dataRegistry', async () => {
        const query = `
      query {
        sources (sourceTypeId: 1 limit:4 permission: owner) {
          records {
            id
            sourceType {
              programFormats
            }
          }
        }
        dataRegistries(orderBy: name, orderDirection: desc, limit: 1, name: "YouTube Source Schema", nameMatch: exact) {
          records {
            id
            name
            schemas(status: published) {
              records {
                id
                status
              }
            }
          }
        }
      }
    `;

        let result = await gqlClient.query(query);
        sourceId = _.get(result, 'sources.records[0].id');
        if (!sourceId) {
          // ai13s clusters are created without any sources, thus some seeding is required
          const createSource = `mutation {
        createSource(input: {
          sourceTypeId: 1
          name: "citest source type"
          isPublic: false
        }) {
          id
          sourceTypeId          
        }
      }`;
          await gqlClient.query(createSource);
          result = await gqlClient.query(query);
          sourceId = _.get(result, 'createSource.id');
        }
        programFormat = _.get(
          result,
          'sources.records[0].sourceType.programFormats[0]'
        );
        dataRegistryId = _.get(
          result,
          'dataRegistries.records[0].schemas.records[0].id'
        );
        expect(programFormat).toBeDefined();
        expect(dataRegistryId).toBeDefined();
      });

      it('create a test cluster for another org as superadmin', async () => {
        const query = `mutation {
      createCluster(input: {
        name: "${testKey}"
        type: ami
        organizationId: "17560"
        dockerCredentials: {}
        containerTag: "test"
        paused: true
        memorySize: "1gb"
        storageSize: "8gb"
        tags: []
        allowedEngines: []
        collaborators: [
          {
            organizationId: 7862
            permission: viewer
          }
        ]
        clusterConfig: {
          restartTimeUTC: "03:00",
          mediaStoragePath: "../mnnt/",
          mediaStorage: "edge",
          managementNodeId: ""
        }
      }) {
        id
        name
        type
        memorySizeBytes
        storageSizeBytes
        paused
        containerTag
        allowedEngines
        createdDateTime
        modifiedDateTime
        organizationId
        collaborators {
          count
          records {
            organizationId
            permission
          }
        }
        clusterConfig
      }
    }`;

        const result = await gqlClient.query(query);
        const createCluster = _.get(result, 'createCluster');
        clusterId = _.get(createCluster, 'id');
        expect(clusterId).toBeDefined();
        expect(_.get(createCluster, 'collaborators.count')).toEqual(1);
        expect(_.get(createCluster, 'organizationId')).toEqual('17560');
        expect(
          _.get(createCluster, 'collaborators.records[0].permission')
        ).toEqual('viewer');
      });

      it('create cluster for testing - current orgnizationId', async () => {
        const query = `mutation {
        createCluster(input: {
          name: "${testKey}"
          type: RT
          dockerCredentials: {}
          allowedEngines: []
          status: active
        }) {
          id
          name
          edgeVersion
        }
      }`;

        const result = await gqlClient.query(query);

        const createCluster = _.get(result, 'createCluster');

        expect(createCluster).toBeDefined();
        expect(createCluster.id).toBeTruthy();
        expect(createCluster.edgeVersion).toEqual(3);

        clusterId1 = createCluster.id;
      });

      it('create a scheduled job', async () => {
        const query = `
      mutation {
        createScheduledJob(input: {
          name: "${testName}-job"
          runMode: Now
          details: {
            programFormat: "${programFormat}"
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
          weeklyScheduleParts: [
            {
              scheduledDay: Monday
              startTime: "09:00:00-08:00"
              stopTime: "10:30-08:00"
            }
          ]
          jobTemplates: [
            {
              skipDecider: true
              clusterId: "${clusterId1}"
              jobConfig: {
                createTDOInput: {
                  details: {
                    tags: ["foo", "bar"]
                  }
                }
              }
              taskTemplates: [
                {
                  engineId: "${engineId}"
                  payload: {
                    foo: "bar"
                    sourceId: "${sourceId}"
                  }
                }
              ]
            }
          ]
        }) {
          id
          primarySourceId
          jobTemplates {
            records {
              id
            }
          }
          details
          isPublic
          contentTemplates {
            data
            schemaId
          }
          collaborators {
            count
            records {
              organizationId
              permission
            }
          }
          affiliates {
            count
            records {
              sourceId
              scheduledJobId
              scheduledDay
              startTime
              stopTime
              status
              startDateTime
              stopDateTime
            }
          }
          jobs {
            records {
              id
              targetId
              status
              tasks {
                records {
                  id
                  status
                }
              }
            }
          }
        }
      }
      `;

        const result = await gqlClient.query(query);
        scheduledJobId = _.get(result, 'createScheduledJob.id');
        expect(scheduledJobId).toBeDefined();

        jobIdWithScheduleJob = _.get(
          result,
          'createScheduledJob.jobs.records[0].id'
        );
        tdoIdWithScheduleJob = _.get(
          result,
          'createScheduledJob.jobs.records[0].targetId'
        );
        taskIdWithScheduleJob = _.get(
          result,
          'createScheduledJob.jobs.records[0].tasks.records[0].id'
        );
        expect(jobIdWithScheduleJob).toBeDefined();
        expect(tdoIdWithScheduleJob).toBeDefined();
        expect(taskIdWithScheduleJob).toBeDefined();
      });

      it('launch a schedule job one more time - for creating job with scheduleJobId', async () => {
        const query = `
              mutation {
                launchScheduledJobs(input: {scheduledJobId: "${scheduledJobId}", payload: { maxIngestionJobs: 1 }}) {
                  id
                  tasks {
                    records {
                      id
                      status
                      engine {
                        id
                        name
                      }
                    }
                  }
                  templateId
                  scheduledJobId
                  scheduledJob {
                    id
                  }
                  target {
                    id
                    assets(assetType: "content-template") {
                      count
                    }
                    sourceData {
                      scheduledJobId
                      sourceId
                    }
                    thumbnailUrl
                    sourceImageUrl
                  }
                }
              }
            `;

        const result = await gqlClient.query(query);

        const launchScheduledJobs = _.get(result, 'launchScheduledJobs');
        tdoIdFromLaunchScheduledJob1 = result.launchScheduledJobs[0].target.id;
        expect(launchScheduledJobs).toBeDefined();
        expect(launchScheduledJobs[0].id).toBeTruthy();

        const jobQuery = `
            query jobStatus {
              job(id:"${launchScheduledJobs[0].id}"){
              status
              tasks {
                count
                records {
                  id
                  engineId
                  payload
                  runtimePayload
                  status
                }
              }
            }
          }`;
        const jobResult = await gqlClient.query(jobQuery);
        const taskPayload = _.get(
          jobResult,
          'job.tasks.records[0].payload',
          {}
        );
        expect(taskPayload).toMatchObject({ maxIngestionJobs: 1 });
      });

      it('should index audit log event AssetUpload WHEN updating target tdo with template content - success', async () => {
        const query = `
          mutation {
            updateTDO(
              input: {
                id: "${tdoIdFromLaunchScheduledJob1}",
                contentTemplates: [
                  {
                    schemaId: "${dataRegistryId}",
                    data: {
                      url: "https://youtube.com/channel/123",
                      youtubeChannelUrl: "https://youtube.com/channel/123",
                      liveTimezone: "PST"
                    }
                  }
                ]
              }
            ) {
              id
              status
            }
          }
        `;
        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID
        );
        const result = await gqlClient.query(query, null, headers);
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        expect(result.updateTDO).toBeDefined();
        const expectedAuditLogItems = [
          {
            actionName: 'create',
            actionResult: 'success',
            targetType: 'tt_Asset',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: _.toString(helpersAuditLog._organizationID),
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'asset',
            eventName: 'AssetUpload',
            organizationName: 'Veritone, Inc.'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /Uploaded file .*\.json successfully/
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });

      it('should index audit log event AssetUpload WHEN creating a TDO with an asset - success', async () => {
        const query = `
          mutation {
            createTDOWithAsset(input: {
              startDateTime:${startDateTime},
              assetType: "media"
              contentType: "video/mp4"
            }) {
              id
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
        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID
        );
        const result = await gqlClient.uploadFile(
          query,
          'movie.mp4',
          './citest/data/movie.mp4',
          headers.headers
        );
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        tdoId = _.get(result, 'createTDOWithAsset.id');
        expect(tdoId).toBeTruthy();
        const expectedAuditLogItems = [
          {
            actionName: 'create',
            actionResult: 'success',
            targetType: 'tt_Asset',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: _.toString(helpersAuditLog._organizationID),
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'asset',
            eventName: 'AssetUpload',
            organizationName: 'Veritone, Inc.'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /Uploaded file .*\.mp4 successfully/
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });

      it('should index audit log event AssetUpload WHEN creating media segments - success', async () => {
        const query = `
    mutation {
      seg1: addMediaSegment(input: {containerId: "${tdoIdWithScheduleJob}", details: {
        segmentStartTimeMs: 0
        segmentStopTimeMs: 2000
        segmentGroupId: "0adfa9f1-2d32-4194-99e7-fa3bc93a5bff"
      }
      url: "http://minio:9000/aiware/64712779-b6ea-4d5f-95c9-10c1f6f271f2"
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
      seg2: addMediaSegment(input: {containerId: "${tdoIdWithScheduleJob}", details: {
        segmentStartTimeMs: 2000
        segmentStopTimeMs: 4000
        segmentGroupId: "0adfa9f1-2d32-4194-99e7-fa3bc93a5bff"
      }
      url: "http://minio:9000/aiware/64712779-b6ea-4d5f-95c9-10c1f6f271f2"
    }) {
        id
      }
      initSegment: addMediaSegment(input: { containerId: "${tdoIdWithScheduleJob}", details: {
        codecs: "avc1.64001e,mp4a.40.2",
        segmentGroupId: "0adfa9f1-2d32-4194-99e7-fa3bc93a5bff",
        targetSegmentDurationMs: 2000
        }
        url: "http://minio:9000/aiware/64712779-b6ea-4d5f-95c9-10c1f6f271f2"
      }) {
        id
      }
    }
    `;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID
        );
        const result = await gqlClient.query(query, null, headers);
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        expect(_.get(result, 'seg1.primaryAsset.id')).toBeTruthy();
        expect(_.get(result, 'seg1.primaryAsset.contentType')).toEqual(
          'application/json'
        );
        expect(_.get(result, 'seg1.primaryAsset.assetType')).toEqual(
          'media-mdp'
        );
        expect(tdoIdWithScheduleJob).toBeTruthy();
        const expectedAuditLogItems = [
          {
            actionName: 'create',
            actionResult: 'success',
            targetType: 'tt_Asset',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: _.toString(helpersAuditLog._organizationID),
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'asset',
            eventName: 'AssetUpload',
            organizationName: 'Veritone, Inc.'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /Uploaded file .*\.json successfully/
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });

      it('should index audit log events AssetMetadataUpdate and TaskUpdated WHEN updating task in schedule job - success', async () => {
        const query = `
      mutation {
        updateTask(input: {
          id: "${taskIdWithScheduleJob}"
          status: complete
          taskOutput: {
            processedStats: {
              processedBytes: 1
            }
          }
        }) {
          id
          status
          modifiedDateTime
          completedDateTime
          startedDateTime
        }
      }
    `;
        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID
        );
        const result = await gqlClient.query(query, null, headers);
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );

        expect(correlationIDResponse).toBe(correlationID);
        expect(_.get(result, 'updateTask.status')).toEqual('complete');
        // The completedDateTime will not be updated if task status was moved from "pending" to "completed"
        // See: https://github.com/veritone/core-job-server/blob/master/src/route/task.js#L297-L311
        expect(_.get(result, 'updateTask.modifiedDateTime')).toBeTruthy();
        expect(_.get(result, 'updateTask.completedDateTime')).toBeDefined();
        expect(_.get(result, 'updateTask.startedDateTime')).toBeDefined();

        const expectedAuditLogItems = [
          {
            actionName: 'update',
            actionResult: 'success',
            targetType: 'tt_Asset',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: _.toString(helpersAuditLog._organizationID),
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'asset',
            eventName: 'AssetMetadataUpdate',
            organizationName: 'Veritone, Inc.'
          },
          {
            actionName: 'update',
            actionResult: 'success',
            actionDetails: 'Task updated successfully',
            targetType: 'tt_Job',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: _.toString(helpersAuditLog._organizationID),
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'task',
            eventName: 'TaskUpdated',
            organizationName: 'Veritone, Inc.'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });

      it('create a job', async () => {
        const query = `
          mutation {
            createJob(input: {
              targetId: "${tdoId}",
              skipDecider:true
              tasks: [{
                engineId: "${engineId}"
                payload: {
                  engineReturnValue: true
                }
              }]
            }) {
              id,
              targetId,
              tasks {
                records {
                  id
                  engineId
                  order
                  payload
                  status
                }
              }
            }
          }
        `;
        const result = await gqlClient.query(query);
        jobId = _.get(result, 'createJob.id');
        expect(jobId).toBeDefined();
        taskId = _.get(result, 'createJob.tasks.records[0].id');
        expect(taskId).toBeDefined();
      });

      it('should index audit log event AssetUpload WHEN uploading engine result - success', async () => {
        const query = `
          mutation {
            uploadEngineResult(input: {
              taskId: "${taskId}"
              uri: "${unsignedUrl}?v=1"
              clientTimestamp: "${moment().toISOString()}"
              isAccumulatedResult: true
              setTaskOutput: false
            }) {
              id
              uri
              assetType
              contentType
            }
          }
        `;
        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID
        );
        const result = await gqlClient.query(query, null, headers);
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        assetId = _.get(result, 'uploadEngineResult.id');
        expect(assetId).toBeDefined();
        expect(_.get(result, 'uploadEngineResult.uri')).toEqual(
          unsignedUrl + '?v=1'
        );
        expect(_.get(result, 'uploadEngineResult.assetType')).toEqual(
          'vtn-standard'
        );
        expect(_.get(result, 'uploadEngineResult.contentType')).toEqual(
          'application/json'
        );
        const expectedAuditLogItems = [
          {
            actionName: 'create',
            actionResult: 'success',
            targetType: 'tt_Asset',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: _.toString(helpersAuditLog._organizationID),
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'asset',
            eventName: 'AssetUpload',
            organizationName: 'Veritone, Inc.'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /Uploaded file .*\.json successfully/
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });
    });
  }
);
