const helpers = require('../helpers/index.js');
const tdoHelper = require('../helpers/tdo.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  configurableEvents: ['JobCreate']
};

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

const testName = 'citest_cluster_' + Date.now();
let clusterId, engineIdGQLTest, testTDOId;

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
   'audit-log-job @nightly', () => {
  let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
    const result = await helpersAuditLog.loginWithConfiguredUser();
    CONFIG_ADMIN_TOKEN = result.userLogin.token;
    CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
    expect(CONFIG_ADMIN_TOKEN).toBeDefined();
    expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const query = `mutation {
      createCluster(input: {
        name: "${testName}"
        allowedEngines: ["all"]
        dockerCredentials: {}
      }) {
        id
        name
      }
    }`;
    const cluster = await helpersAuditLog._gqlClient.query(
      query,
      null,
      headers
    );
    clusterId = cluster.createCluster.id;

    const enginesQuery = `query {
      engines(createsTDO:false, state: [active], limit:1, name: "CITest Engine 20221219") {
        records {
          id          
        }
      }
    }`;
    const engines = await helpersAuditLog._gqlClient.query(
      enginesQuery,
      null,
      headers
    );
    const engineGQLTest = _.get(engines, 'engines.records[0]');
    engineIdGQLTest = engineGQLTest.id;

    const createTDO = `
      mutation {
        createTDO(input: {
          	status: "uploaded",
          	startDateTime: 1476726655,
          	stopDateTime: 1476726755

        }) {
          	id
        }
      }`;

    const testTDO = await await helpersAuditLog._gqlClient.query(
      createTDO,
      null,
      headers
    );

    testTDOId = _.get(testTDO, 'createTDO.id', null);
  });

  afterAll(async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    if (clusterId) {
      const deleteCluster = `
        mutation {
          deleteCluster(
            id: "${clusterId}"
          ) {
              id
            }
          }
        `;

      await helpersAuditLog._gqlClient.query(deleteCluster, null, headers);
    }

    if (testTDOId) {
      // updates job status and delete TDO
      await tdoHelper.processTDODeletion(
        helpersAuditLog._gqlClient,
        testTDOId,
        null,
        headers
      );
    }
  });

  it('should index audit log when creating a job', async () => {
    const query = `mutation {
        createJob(input: {
            targetId: "${testTDOId}"
            clusterId: "${clusterId}"
            name: "${'test_0001' + Date.now()}"
            description: "testing audit events"
            jobConfig: {}
            tasks: [{
              engineId: "${engineIdGQLTest}"
            }]
        }) {
          id
        }
      }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    expect(result).toBeDefined();

    const expectedAuditLogItems = [
      { eventType: 'job', eventName: 'JobCreate', actionResult: 'success', actionDetails: `Created job ${_.get(result, 'createJob.id')}` }
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

  it('should index audit log when creating a job fails', async () => {
    // job creation should fail due to missing targetId
    const query = `mutation {
        createJob(input: {
            clusterId: "${clusterId}"
            name: "${'test_0001' + Date.now()}"
            description: "testing audit events"
            jobConfig: {}
            tasks: [{
              engineId: "${engineIdGQLTest}"
            }]
        }) {
          id
        }
      }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    let result;
    try {
      result = await helpersAuditLog._gqlClient.query(query, null, headers);
    } catch (err) {
      //
    }
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      { eventType: 'job', eventName: 'JobCreate', actionResult: 'failure', actionDetails: 'Failed to create a new job' }
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
