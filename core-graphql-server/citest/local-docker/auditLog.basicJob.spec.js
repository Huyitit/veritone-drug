const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const moment = require('moment');
const supertest = require('supertest');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_CI_TEST_SERVICE_TOKEN,
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
  'audit-log-basicJob use internalEngineId @nightly',
  () => {
    describe('basic jobs test use internalEngineId', () => {
      let gqlClient;
      let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;

      const OPTIONS = {
        baselineEvents: ['task_queued', 'task_completed'],
        configurableEvents: [
          'LoginSucceeded' // NEEDED TO FLUSH CACHE IN eventing service
        ]
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
  engines(id: "${internalEngineId}") {
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
        expect(createsTDO).toBeFalsy();
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

      let updateJobId1, updateJobId2, updateJobId3;
      it('create 3 jobs', async () => {
        const query = `mutation createJob {
      createJob1: createJob(input: {
        targetId: "${tdoId}",
        clusterId: "${clusterId1}",
        tasks: [{
          engineId: "${engineId}"
          payload: {
            engineReturnValue: true
          }
        }]
      }) {
        id
        targetId
        clusterId
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
      createJob2: createJob(input: {
        targetId: "${tdoId}",
        clusterId: "${clusterId1}",
        tasks: [{
          engineId: "${engineId}"
          payload: {
            engineReturnValue: true
          }
        }]
      }) {
        id
        targetId
        clusterId
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
      createJob3: createJob(input: {
        targetId: "${tdoId}",
        clusterId: "${clusterId1}",
        tasks: [{
          engineId: "${engineId}"
          payload: {
            engineReturnValue: true
          }
        }]
      }) {
        id
        targetId
        clusterId
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
    }`;

        const result = await gqlClient.query(query);

        const createJob1 = _.get(result, 'createJob1');
        const createJob2 = _.get(result, 'createJob2');
        const createJob3 = _.get(result, 'createJob3');

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
      });

      it('update 2 jobs - to queued and index event to Audit Log for eventName TaskQueued and TaskQueued', async () => {
        const query = `mutation updateJobs {
      updateJobs(input:{
        ids: ["${updateJobId1}", "${updateJobId2}"]
        status: queued
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
        const updateJobs = _.get(result, 'updateJobs');

        expect(updateJobs).toBeDefined();
        expect(updateJobs.count).toEqual(2);
        expect(updateJobs.records[0].status).toEqual('running');
        expect(updateJobs.records[1].status).toEqual('running');

        const expectedAuditLogItems = [
          {
            actionName: 'update',
            actionResult: 'success',
            targetId: 'N/A',
            targetType: 'tt_Job',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: _.toString(helpersAuditLog._organizationID),
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'task',
            eventName: 'TaskQueued',
            organizationName: 'Veritone, Inc.'
          },
          {
            actionName: 'update',
            actionResult: 'success',
            targetId: 'N/A',
            targetType: 'tt_Job',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: _.toString(helpersAuditLog._organizationID),
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'task',
            eventName: 'TaskQueued',
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
    });
  }
);
