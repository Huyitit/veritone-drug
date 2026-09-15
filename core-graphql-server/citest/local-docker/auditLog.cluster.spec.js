const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  configurableEvents: ['ClusterCreate', 'ClusterUpdate', 'ClusterDelete']
};

let clusterId;

const testName = 'citest_cluster_' + Date.now();

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
  'audit-log-cluster', () => {
  let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
    const result = await helpersAuditLog.loginWithConfiguredUser();
    CONFIG_ADMIN_TOKEN = result.userLogin.token;
    CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
    expect(CONFIG_ADMIN_TOKEN).toBeDefined();
    expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
  });

  it('should index audit log when creating a cluster', async () => {
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
    expect(result.createCluster.id).toBeDefined();
    clusterId = result.createCluster.id;
    expect(result.createCluster.name).toEqual(testName);

    const expectedAuditLogItems = [
      {
        eventType: 'cluster',
        eventName: 'ClusterCreate',
        actionResult: 'success',
        actionDetails: `Created cluster ${clusterId}`
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

  it('should index audit log when failing to create a cluster', async () => {
    const query = `mutation {
        createCluster(input: {
          name: "123"
          allowedEngines: ["all"]
          dockerCredentials: xyz
        }) {
          id
          name
        }
      }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    await helpersAuditLog._gqlClient
      .query(query, null, headers)
      .catch(async (err) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          err
        );

        const expectedAuditLogItems = [
          {
            eventType: 'cluster',
            eventName: 'ClusterCreate',
            actionResult: 'failure',
            actionDetails: `Failed to create cluster`
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

  it('should index audit log when updating a cluster', async () => {
    const query = `
      mutation {
        updateCluster(
          input: {
            id: "${clusterId}"
            name: "${testName}-updated"
          }) {
            id
            name
          }
        }
      `;
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
    expect(result.updateCluster.id).toBeDefined();
    expect(result.updateCluster.name).toEqual(`${testName}-updated`);

    const expectedAuditLogItems = [
      {
        eventType: 'cluster',
        eventName: 'ClusterUpdate',
        actionResult: 'success',
        actionDetails: `Updated cluster ${clusterId}`
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

  it('should index audit log when failing to update a cluster', async () => {
    const clusterId = 'XYZ';
    const query = `
      mutation {
        updateCluster(
          input: {
            id: "${clusterId}"
            name: "${testName}-updated"
          }) {
            id
            name
          }
        }
      `;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    await helpersAuditLog._gqlClient
      .query(query, null, headers)
      .catch(async (err) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          err
        );

        const expectedAuditLogItems = [
          {
            eventType: 'cluster',
            eventName: 'ClusterUpdate',
            actionResult: 'failure',
            actionDetails: `Failed to update cluster ${clusterId}`
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

  it('should index audit log when deleting a cluster', async () => {
    const query = `
      mutation {
        deleteCluster(
          id: "${clusterId}"
        ) {
            id
            message
          }
        }
      `;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        eventType: 'cluster',
        eventName: 'ClusterDelete',
        actionResult: 'success',
        actionDetails: `Deleted cluster ${clusterId}`
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

  it('should index audit log when failing to delete a cluster', async () => {
    const clusterId = 'XYZ';
    const query = `
      mutation {
        deleteCluster(
          id: "${clusterId}"
        ) {
            id
            message
          }
        }
      `;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    let error;
    try {
      await helpersAuditLog._gqlClient.query(query, null, headers);
    } catch (err) {
      error = err;
    }
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      error
    );    

    const expectedAuditLogItems = [
      {
        eventType: 'cluster',
        eventName: 'ClusterDelete',
        actionResult: 'failure',
        actionDetails: `Failed to delete cluster ${clusterId}`
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
