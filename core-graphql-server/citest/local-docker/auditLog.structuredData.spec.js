const uuid = require('uuid');
const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  configurableEvents: ['StructuredDataCreate', 'StructuredDataUpdate', 'StructuredDataDelete']
};

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

const testName = 'citest_cluster_' + Date.now();
let schemaId, properties, testSDOId;

function assembleSdoInputData() {
  const data = {};
  _.forEach(properties, (property, key) => {
    if (property.type === 'string') {
      if (key === 'url') {
        data[key] = 'https://youtube.com/channel/veritone';
      } else {
        data[key] = 'test';
      }
    }
    if (property.type === 'number') {
      data[key] = 1;
    }
    if (property.type === 'boolean') {
      data[key] = true;
    }
    if (property.type === 'array') {
      data[key] = ['test'];
    }
    if (property.type === 'object') {
      data[key] = { test: 'test' };
    }
  });
  let dataString = '';
  _.forEach(data, (property, key) => {
    dataString += `${key}: ${JSON.stringify(property)},`;
  });
  dataString = dataString.slice(0, -1);
  return dataString;
}

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
    const query = `{
      schemas (status: published, limit: 1){
        records {
          id
          definition
        }
      }
    }`;
    const schemasResult = await helpersAuditLog._gqlClient.query(
      query,
      null,
      headers
    );
    schemaId = (schemasResult.schemas.records[0] || {}).id;
    properties = (schemasResult.schemas.records[0] || {}).definition.properties;
  });

  it('should index audit log when creating a structured data - success', async () => {
    const query = `mutation createSDO {
      createStructuredData(
        input: { 
          schemaId: "${schemaId}", 
          data: {${assembleSdoInputData()}}
        }
      ) { id, data }
    }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    testSDOId = result.createStructuredData.id;
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    expect(result).toBeDefined();

    const expectedAuditLogItems = [
      {
        eventType: 'structuredData',
        eventName: 'StructuredDataCreate',
        actionResult: 'success',
        actionDetails: `Created SDO ${testSDOId} using schema ${schemaId}`
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

  it('should index audit log when creating a structured data with non-existing ID - success', async () => {
    const newSDOId = uuid.v4();
    const query = `mutation createSDO {
      createStructuredData(
        input: { 
          id: "${newSDOId}",
          schemaId: "${schemaId}", 
          data: {${assembleSdoInputData()}}
        }
      ) { id, data }
    }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    expect(result).toBeDefined();
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        eventType: 'structuredData',
        eventName: 'StructuredDataCreate',
        actionResult: 'success',
        actionDetails: `Created SDO ${newSDOId} using schema ${schemaId}`
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

  it('should index audit log when creating a structured data - failure', async () => {
    // missing data will cause the mutation to fail
    const query = `mutation createSDO {
      createStructuredData(
        input: { 
          schemaId: "${schemaId}"
        }
      ) { id, data }
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
      // 400 is expected
    }
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        eventType: 'structuredData',
        eventName: 'StructuredDataCreate',
        actionResult: 'failure',
        actionDetails: `Failed to create new SDO using schema ${schemaId}`
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

  it('should index audit log when updating a structured data with createStructuredData and existing ID input - success', async () => {
    const query = `mutation createSDO {
      createStructuredData(
        input: { 
          id: "${testSDOId}",
          schemaId: "${schemaId}", 
          data: {${assembleSdoInputData()}}
        }
      ) { id, data }
    }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    expect(result).toBeDefined();
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        eventType: 'structuredData',
        eventName: 'StructuredDataUpdate',
        actionResult: 'success',
        actionDetails: `Updated SDO ${testSDOId} using schema ${schemaId}`
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

  it('should index audit log when updating a structured data - success', async () => {
    const query = `mutation updateSDO {
      updateStructuredData(
        input: { 
          id: "${testSDOId}",
          schemaId: "${schemaId}", 
          data: {${assembleSdoInputData()}}
        }
      ) { id, data }
    }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    expect(result).toBeDefined();
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        eventType: 'structuredData',
        eventName: 'StructuredDataUpdate',
        actionResult: 'success',
        actionDetails: `Updated SDO ${testSDOId} using schema ${schemaId}`
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

  it('should index audit log when updating a structured data - failure', async () => {
    const invalidSchemaId = `${schemaId}_invalid`;
    const query = `mutation updateSDO {
      updateStructuredData(
        input: { 
          id: "${testSDOId}",
          schemaId: "${invalidSchemaId}", 
          data: {${assembleSdoInputData()}}
        }
      ) { id, data }
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
      // 400 is expected
    }
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        eventType: 'structuredData',
        eventName: 'StructuredDataUpdate',
        actionResult: 'failure',
        actionDetails: `Failed to update SDO ${testSDOId} using schema ${invalidSchemaId}`
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

  it('should index audit log when deleting a structured data - failure', async () => {
    const invalidSchemaId = `${schemaId}_invalid`;
    const query = `mutation deleteSDO {
      deleteStructuredData(
        input: { 
          schemaId: "${invalidSchemaId}", 
          id: "${testSDOId}",
        }
      ) { id }
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
      // 400 is expected
    }
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        eventType: 'structured_data',
        eventName: 'StructuredDataDelete',
        actionResult: 'failure',
        actionDetails: `Failed to delete SDO ${testSDOId} using schema ${invalidSchemaId}`
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

  it('should index audit log when deleting a structured data - success', async () => {
    const query = `mutation deleteSDO {
      deleteStructuredData(
        input: { 
          schemaId: "${schemaId}", 
          id: "${testSDOId}",
        }
      ) { id }
    }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );

    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    expect(result).toBeDefined();
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        eventType: 'structured_data',
        eventName: 'StructuredDataDelete',
        actionResult: 'success',
        actionDetails: `Deleted SDO ${testSDOId} using schema ${schemaId}`
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

  describe('dataSet', () => {
    let dataSetId;
    let sdoId1 = uuid.v4();
    let sdoId2 = uuid.v4();
    let schemaId;
    it('should create a DataSetSchema', async () => {
      const query = `mutation {
        createDatasetSchema(
          input: {
            name: "${testName}"
            description: "${testName} description"
            schema: { properties: { name: { type: "string", required: true } } }
            tags: []
          }
        ) {
          datasetId
          name
          description
          tags {
            name
            value
          }
          schema {
            id
            dataRegistryId
            definition
          }
        }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );

      const createDatasetSchema = _.get(result, 'createDatasetSchema');

      expect(createDatasetSchema).toBeDefined();
      expect(createDatasetSchema.datasetId).toBeDefined();
      expect(createDatasetSchema.name).toEqual(testName);
      expect(createDatasetSchema.description).toEqual(
        `${testName} description`
      );
      expect(createDatasetSchema.schema).toBeDefined();
      schemaId = createDatasetSchema.schema.id;
      dataSetId = createDatasetSchema.datasetId;
    });

    it('should index audit log when adding multiple dataset - success', async () => {
      const query = `mutation {
      datasetDataOperation(
        id: "${dataSetId}"
        actions: [
          {
            action: ADD
            data: [
              {
                id: "${sdoId1}"
                data: { name: "${sdoId1} name" }
              },
              {
                id: "${sdoId2}"
                data: { name: "${sdoId2} name" }
              }
            ]
          }
        ]
      ) {
        datasetId
        structuredDataObjects {
          id
          data
          schemaId
        }
      }
    }`;
      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      expect(result.datasetDataOperation.structuredDataObjects.length).toEqual(
        2
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      expect(result).toBeDefined();

      const datasetDataOperation = _.get(result, 'datasetDataOperation');
      const expectedAuditLogItems = datasetDataOperation.structuredDataObjects.map(
        (sdo) => ({
          eventType: 'structuredData',
          eventName: 'StructuredDataCreate',
          actionResult: 'success',
          actionDetails: `Created SDO ${sdo.id} using schema ${sdo.schemaId}`
        })
      );

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

      expect(datasetDataOperation).toBeDefined();
      expect(datasetDataOperation.datasetId).toEqual(dataSetId);
      expect(datasetDataOperation.structuredDataObjects).toBeDefined();
      expect(datasetDataOperation.structuredDataObjects.length).toEqual(2);
    });

    it('should index audit log when adding multiple dataset - failure', async () => {
      // missing actions.data will cause the mutation to fail
      const query = `mutation {
      datasetDataOperation(
        id: "${dataSetId}"
        actions: [
          {
            action: ADD
            data: []
          }
        ]
      ) {
        datasetId
        structuredDataObjects {
          id
          data
          schemaId
        }
      }
    }`;
      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      await helpersAuditLog._gqlClient
        .query(query, null, headers)
        .catch(async (e) => {
          const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
            e
          );
          expect(e).toBeDefined();
          const expectedAuditLogItems = [
            {
              eventType: 'structuredData',
              eventName: 'StructuredDataCreate',
              actionResult: 'failure',
              actionDetails: `Failed to create new SDO using schema ${schemaId}`
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

    it('should delete a dataset', async () => {
      const query = `mutation {
      deleteDataset(id: "${dataSetId}") {
        datasetId
        message
      }
    }`;
      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      expect(result).toBeDefined();

      const deleteDataset = _.get(result, 'deleteDataset');
      expect(deleteDataset).toBeDefined();
      expect(deleteDataset.datasetId).toEqual(dataSetId);
    });
  });
});
