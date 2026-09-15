import { v4 as uuidv4 } from 'uuid';

import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { DatasetActionType } from '../../src/gql';
import { safe } from '../../src/helpers/commonHelper';
import { getCitestMarker } from '../helpers/citestGlobals';

/**
 * Dataset schema + row operations, converted from the legacy
 * citest/dataSet.spec.js. Covers createDatasetSchema and the ADD branch of
 * datasetDataOperation.
 */
const citestMarker = getCitestMarker();
const testName = `${citestMarker}-test_data_set_${Date.now()}`;

const sdoId1 = uuidv4();
const sdoId2 = uuidv4();

let dataSetId: string | null = null;

describe('citest_dataset: dataSet ci-tests', () => {
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();
  });

  afterAll(async () => {
    if (dataSetId) {
      await safe('delete dataset', () =>
        gqlClient.sdk.deleteDataset({ id: dataSetId as string })
      );
    }
  });

  it('should create a DataSetSchema', async () => {
    const result = await gqlClient.sdk.createDatasetSchema({
      input: {
        name: testName,
        description: `${testName} description`,
        schema: { properties: { name: { type: 'string', required: true } } },
        tags: []
      }
    });
    const createDatasetSchema = result?.data?.createDatasetSchema ?? null;

    expect(createDatasetSchema).toBeDefined();
    expect(createDatasetSchema?.datasetId).toBeDefined();
    expect(createDatasetSchema?.name).toEqual(testName);
    expect(createDatasetSchema?.description).toEqual(`${testName} description`);
    expect(createDatasetSchema?.schema).toBeDefined();

    dataSetId = createDatasetSchema?.datasetId ?? null;
    expect(dataSetId).not.toBeNull();
  });

  it('should add multiple dataset', async () => {
    if (!dataSetId) {
      throw new Error('dataSetId was not set by the createDatasetSchema test');
    }

    const result = await gqlClient.sdk.datasetDataOperation({
      id: dataSetId,
      actions: [
        {
          action: DatasetActionType.Add,
          data: [
            { id: sdoId1, data: { name: `${sdoId1} name` } },
            { id: sdoId2, data: { name: `${sdoId2} name` } }
          ]
        }
      ]
    });
    const datasetDataOperation = result?.data?.datasetDataOperation ?? null;

    expect(datasetDataOperation).toBeDefined();
    expect(datasetDataOperation?.datasetId).toEqual(dataSetId);
    expect(datasetDataOperation?.structuredDataObjects).toBeDefined();
    expect(datasetDataOperation?.structuredDataObjects?.length).toEqual(2);
  });
});
