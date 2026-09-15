const helpers = require('../helpers/index.js');
const tdoHelpers = require('../helpers/tdo.js');
const GraphqlClient = require('../helpers/gql.js');
const licensePlate = require('../mocks/license-plate.json');
const motorVehicle = require('../mocks/motor-vehicle.json');
const _ = require('lodash');

const config = helpers.config;

async function waitAndRetry(fn, retries = 5, delay = 2000) {
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
}

let AUTH_TOKEN = null;
let gqlClient = null;
let tdoID = null;
// this is a shim for the time being
describe.skip('citest_licensePlate: investigate-v2-critical-path', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(config.env);
    const result = await helpers.signin(config.core_admin_url);
    AUTH_TOKEN = result.token;
  });

  beforeEach(async () => {
    // create TDO container
    const { createTDO } = await tdoHelpers.createTDO(
      gqlClient,
      AUTH_TOKEN,
      'license-plate-motor-vehicle-CITEST-tdo'
    );
    tdoID = _.get(createTDO, 'id', null);
  });

  afterEach(async () => {
    // delete TDO container
    if (tdoID) {
      await tdoHelpers.processTDODeletion(gqlClient, tdoID, null, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
      });
    }
  });
  it('should index a license plate looking it up by the license plate number', async () => {
    // create asset with license plate
    await tdoHelpers.createAssetWithMultipartUpload(
      config.graphql_url,
      tdoID,
      'license-plate.json',
      AUTH_TOKEN
    );
    // emit system event to index license plate
    await tdoHelpers.emitRecordingCognitionCompleted(
      gqlClient,
      tdoID,
      AUTH_TOKEN
    );
    // search for the license plate
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
    const licensePlateFromAsset = _.get(
      licensePlate,
      'series[0].object.licensePlate.number'
    );
    const validateSearchResult = async () => {
      const licensePlateSearchResult = await gqlClient.query(
        licensePlateSearchQuery,
        {
          value: licensePlateFromAsset
        },
        {
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`
          }
        }
      );

      const licensePlateSearchData = _.get(
        licensePlateSearchResult,
        'searchMedia.jsondata.results',
        []
      );
      // uncomment this when ticket VE-13719 is done
      expect(licensePlateSearchData.length).toBeGreaterThan(0);
      const licensePlateFromSearch = _.get(
        licensePlateSearchData[0],
        'hits[0]["licensePlate"].series[0].licensePlate.number'
      );
      expect(licensePlateFromSearch).toEqual(licensePlateFromAsset);
    }
    await waitAndRetry(validateSearchResult, 5, 2000);
  });
  it('should index a motor vehicle looking it up by the license plate number or vehicle property such as make', async () => {
    // create asset with license plate
    await tdoHelpers.createAssetWithMultipartUpload(
      config.graphql_url,
      tdoID,
      'motor-vehicle.json',
      AUTH_TOKEN
    );
    // emit system event to index license plate
    await tdoHelpers.emitRecordingCognitionCompleted(
      gqlClient,
      tdoID,
      AUTH_TOKEN
    );
    // search for the license plate
    const licensePlateSearchQuery = `
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
    const makeFromAsset = _.get(
      motorVehicle,
      'series[0].object.motorVehicle.make'
    );
    const licensePlateFromAsset = _.get(
      motorVehicle,
      'series[0].object.motorVehicle.licensePlate.number'
    );
    const validateSearchResult = async () => {
    const licensePlateSearchResult = await gqlClient.query(
      licensePlateSearchQuery,
      {
        make: makeFromAsset,
        licensePlate: licensePlateFromAsset
      },
      {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    const searchData = _.get(
      licensePlateSearchResult,
      'searchMedia.jsondata.results',
      []
    );
    expect(searchData.length).toBeGreaterThan(0);
    const licensePlateFromSearch = _.get(
      searchData[0],
      'hits[0]["motorVehicle"].series[0].motorVehicle.licensePlate.number'
    );
    const makeFromSearch = _.get(
      searchData[0],
      'hits[0]["motorVehicle"].series[0].motorVehicle.make'
    );
    expect(makeFromSearch).toEqual(makeFromAsset);
    expect(licensePlateFromSearch).toEqual(licensePlateFromAsset);
  }
  await waitAndRetry(validateSearchResult, 5, 2000);
  });
});
