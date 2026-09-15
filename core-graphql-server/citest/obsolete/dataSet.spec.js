const uuid = require('uuid');
const helpers = require('./helpers/index');
const GraphqlClient = require('./helpers/gql.js');
const { safe } = require('./helpers/cleanup/utils');
const config = helpers.config;

const _ = require('lodash');
const citestMarker = global.citestMarker || 'citest-should-delete';
const testName = citestMarker + '-test_data_set_' + Date.now();

let dataSetId;
let sdoId1 = uuid.v4(),
  sdoId2 = uuid.v4();

describe('citest_dataset: dataSet ci-tests', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  afterAll(async () => {
    if (dataSetId) {
      await safe('delete dataset', async () => {
        const query = `mutation { deleteDataset(id: "${dataSetId}") { datasetId message } }`;
        await gqlClient.query(query);
      });
    }
  });

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
    const result = await gqlClient.query(query);
    const createDatasetSchema = _.get(result, 'createDatasetSchema');

    expect(createDatasetSchema).toBeDefined();
    expect(createDatasetSchema.datasetId).toBeDefined();
    expect(createDatasetSchema.name).toEqual(testName);
    expect(createDatasetSchema.description).toEqual(`${testName} description`);
    expect(createDatasetSchema.schema).toBeDefined();

    dataSetId = createDatasetSchema.datasetId;
  });

  it('should add multiple dataset', async () => {
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
        }
      }
    }`;
    const result = await gqlClient.query(query);
    const datasetDataOperation = _.get(result, 'datasetDataOperation');

    expect(datasetDataOperation).toBeDefined();
    expect(datasetDataOperation.datasetId).toEqual(dataSetId);
    expect(datasetDataOperation.structuredDataObjects).toBeDefined();
    expect(datasetDataOperation.structuredDataObjects.length).toEqual(2);
  });
});
