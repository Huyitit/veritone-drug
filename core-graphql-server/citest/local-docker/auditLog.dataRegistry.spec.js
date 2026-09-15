const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  configurableEvents: [
    'StructuredDataRegistryCreate',
    'StructuredDataRegistryUpdate',
    'StructuredDataRegistryDelete'
  ]
};

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

let dataRegistryId;

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
  });

  it('should index audit log when creating a data registry', async () => {
    const query = `mutation {
        createDataRegistry(input: {
            name: "foo"
            description: "bar"
            source: "baz"
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
    dataRegistryId = result.createDataRegistry.id;
    const expectedAuditLogItems = [
      {
        eventType: 'structuredData',
        eventName: 'StructuredDataRegistryCreate',
        actionResult: 'success',
        actionDetails: `Created data registry ${dataRegistryId}`
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

  it('should index audit log when failing to create a data registry', async () => {
    const incorrectId = 1; // number is not allowed by default
    const query = `mutation {
        createDataRegistry(input: {
            id: ${incorrectId}
            name: "foo"
            description: "bar"
            source: "baz"
        }) {
          id
        }
      }`;

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
    expect(error).toBeDefined();

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      error
    );

    const expectedAuditLogItems = [
      {
        eventType: 'structuredData',
        eventName: 'StructuredDataRegistryCreate',
        actionResult: 'failure',
        actionDetails: 'Failed to create new data registry'
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

  it('should index audit log when updating a data registry', async () => {
    const newName = 'foo 2';
    // job creation should fail due to missing targetId
    const query = `mutation update {
      updateDataRegistry(input: {   
        id: "${dataRegistryId}"
        name: "${newName}"
        description: "bar 2"
        source: "test 2"
      }) {
        name
      }
    }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );

    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    expect(result).toBeDefined();
    expect(result.updateDataRegistry.name).toEqual(newName);
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        eventType: 'structuredData',
        eventName: 'StructuredDataRegistryUpdate',
        actionResult: 'success',
        actionDetails: `Updated data registry ${dataRegistryId}`
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

  it('should index audit log when failing to update a data registry', async () => {
    const newName = 'foo 2';
    // job creation should fail due to missing targetId
    const query = `mutation update {
      updateDataRegistry(input: {   
        id: 1
        name: "${newName}"
        description: "bar 2"
        source: "test 2"
      }) {
        name
      }
    }`;

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
        eventType: 'structuredData',
        eventName: 'StructuredDataRegistryUpdate',
        actionResult: 'failure',
        actionDetails: 'Failed to update data registry undefined'
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

  it('should index audit log when failing to delete data registry', async () => {
    const query = `mutation {
          updateSchemaState(input:{id: 1, status: deleted}) {
            id
            status
          }
        }`;

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
        eventType: 'structuredData',
        eventName: 'StructuredDataRegistryDelete',
        actionResult: 'failure',
        actionDetails: 'Failed to delete data registry undefined'
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
  // the path to successful deletion is not working at the moment due the way updateSchemaState mutation is implemented
  xit('should index audit log when deleting a data registry', async () => {
    if (!dataRegistryId) {
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN
      );
      const query = `mutation {
        createDataRegistry(input: {
            name: "foo"
            description: "bar"
            source: "baz"
        }) {
          id
        }
      }`;
      const createDR = await helpersAuditLog._gqlClient.query(query, null, headers);
      dataRegistryId = createDR.createDataRegistry.id;
    }
    const query = `mutation updateSchemaState {
          updateSchemaState(input:{id: "${dataRegistryId}", status: deleted}) {
            id
            status
          }
        }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );

    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    expect(result).toBeDefined();
    expect(result.updateDataRegistry.name).toEqual(newName);
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        eventType: 'structuredData',
        eventName: 'StructuredDataRegistryDelete',
        actionResult: 'success',
        actionDetails: `Deleted data registry ${dataRegistry}`
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
