import fs from 'fs';
import path from 'path';
import supertest from 'supertest';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { CREATE_ASSET } from '../../src/queries/extracted/tdo';
import { deleteTdos } from '../helpers/tdoCleanup';

const mocksPath = path.resolve(__dirname, '../../../../mocks');
const licensePlate = JSON.parse(
  fs.readFileSync(path.resolve(mocksPath, 'license-plate.json'), 'utf-8')
);
const motorVehicle = JSON.parse(
  fs.readFileSync(path.resolve(mocksPath, 'motor-vehicle.json'), 'utf-8')
);

/**
 * Ported as-is from the old JS shim: the whole suite was already
 * `describe.skip` there (see citest/licensePlateMotorVehicleSearch.spec.js),
 * pending VE-13719. Kept skipped here for parity.
 */

async function waitAndRetry<T>(
  fn: () => Promise<T>,
  retries = 5,
  delay = 2000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('waitAndRetry: unreachable');
}

async function uploadJsonAsset(
  gqlUrl: string,
  headers: Record<string, string>,
  tdoId: string,
  fileName: string,
  fileContents: unknown
): Promise<void> {
  const assetVariables = {
    input: {
      containerId: tdoId,
      contentType: 'application/json',
      description: '',
      type: 'vtn-standard'
    }
  };

  const res = await supertest(gqlUrl)
    .post('')
    .set(headers)
    .field('query', CREATE_ASSET)
    .field('variables', JSON.stringify(assetVariables))
    .attach('file', Buffer.from(JSON.stringify(fileContents)), {
      filename: fileName,
      contentType: 'application/json'
    });

  expect(res.status).toBe(200);
  expect(res.body?.data?.createAsset?.id).toBeDefined();
}

describe.skip('citest_licensePlate: investigate-v2-critical-path', () => {
  let gqlClient: GraphqlClient;
  let headers: Record<string, string>;
  let tdoId: string;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    headers = { Authorization: `Bearer ${gqlClient.sessionToken}` };
  });

  beforeEach(async () => {
    const result = await gqlClient.sdk.createTDO({
      input: {
        name: 'license-plate-motor-vehicle-CITEST-tdo',
        status: 'uploaded',
        startDateTime: Math.floor(Date.now() / 1000) - 60,
        stopDateTime: Math.floor(Date.now() / 1000)
      }
    });
    tdoId = result.data?.createTDO?.id as string;
  });

  afterEach(async () => {
    if (tdoId) {
      await deleteTdos(gqlClient, [tdoId]);
    }
  });

  it('should index a license plate looking it up by the license plate number', async () => {
    await uploadJsonAsset(
      gqlClient.url,
      headers,
      tdoId,
      'license-plate.json',
      licensePlate
    );

    await gqlClient.sdk.emitSystemEvent(
      {
        input: {
          topic: 'RecordingsTopic',
          payload: {
            event: 'recording_cognition_completed',
            recordingId: tdoId,
            payload: {
              recordingId: tdoId,
              skipMentionGeneration: true
            }
          }
        }
      },
      headers
    );

    const licensePlateSearchQuery = `
    query searchMedia ($value: String!) {
      searchMedia(search: {
        index: ["mine"]
        query: {
          operator: "and",
          conditions: [
            {
              operator: "term",
              field: "licensePlate.series.licensePlate.number",
              value: $value
            }
          ]
        }
      }) {
        jsondata
      }
    }`;

    const licensePlateFromAsset = (licensePlate as any).series[0].object
      .licensePlate.number;

    const validateSearchResult = async () => {
      const licensePlateSearchResult = await gqlClient.query(
        licensePlateSearchQuery,
        { value: licensePlateFromAsset },
        headers
      );

      const licensePlateSearchData =
        licensePlateSearchResult?.searchMedia?.jsondata?.results ?? [];
      expect(licensePlateSearchData.length).toBeGreaterThan(0);
      const licensePlateFromSearch =
        licensePlateSearchData[0]?.hits?.[0]?.licensePlate?.series?.[0]
          ?.licensePlate?.number;
      expect(licensePlateFromSearch).toEqual(licensePlateFromAsset);
    };
    await waitAndRetry(validateSearchResult, 5, 2000);
  });

  it('should index a motor vehicle looking it up by the license plate number or vehicle property such as make', async () => {
    await uploadJsonAsset(
      gqlClient.url,
      headers,
      tdoId,
      'motor-vehicle.json',
      motorVehicle
    );

    await gqlClient.sdk.emitSystemEvent(
      {
        input: {
          topic: 'RecordingsTopic',
          payload: {
            event: 'recording_cognition_completed',
            recordingId: tdoId,
            payload: {
              recordingId: tdoId,
              skipMentionGeneration: true
            }
          }
        }
      },
      headers
    );

    const motorVehicleSearchQuery = `
    query searchMedia ($make: String! $licensePlate: String!) {
      searchMedia(search: {
        index: ["mine"]
        query: {
          operator: "and",
          conditions: [
            {
              operator: "term",
              field: "motorVehicle.series.motorVehicle.make",
              value: $make
            },
            {
              operator: "term",
              field: "motorVehicle.series.motorVehicle.licensePlate.number",
              value: $licensePlate
            }
          ]
        }
      }) {
        jsondata
      }
    }`;

    const makeFromAsset = (motorVehicle as any).series[0].object.motorVehicle
      .make;
    const licensePlateFromAsset = (motorVehicle as any).series[0].object
      .motorVehicle.licensePlate.number;

    const validateSearchResult = async () => {
      const searchResult = await gqlClient.query(
        motorVehicleSearchQuery,
        { make: makeFromAsset, licensePlate: licensePlateFromAsset },
        headers
      );

      const searchData = searchResult?.searchMedia?.jsondata?.results ?? [];
      expect(searchData.length).toBeGreaterThan(0);
      const licensePlateFromSearch =
        searchData[0]?.hits?.[0]?.motorVehicle?.series?.[0]?.motorVehicle
          ?.licensePlate?.number;
      const makeFromSearch =
        searchData[0]?.hits?.[0]?.motorVehicle?.series?.[0]?.motorVehicle?.make;
      expect(makeFromSearch).toEqual(makeFromAsset);
      expect(licensePlateFromSearch).toEqual(licensePlateFromAsset);
    };
    await waitAndRetry(validateSearchResult, 5, 2000);
  });
});
