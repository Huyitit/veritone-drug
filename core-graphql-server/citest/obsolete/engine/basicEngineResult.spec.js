const helpers = require('../../helpers/index.js');
const engineHelpers = require('../../helpers/engine.js');
const config = helpers.config;
const _ = require('lodash');
const GraphqlClient = require('../../helpers/gql.js');
const { mediaStreamerUrl } = require('../../helpers/index');

let engineId, engineCategoryId;

const engineId2 = 'c3497af0-ac1c-421d-8b2e-618797093621';
const taskId = '19052122_ltTBRXQOMaSxSvZ';

const env = config.env;
const gqlClient = new GraphqlClient(env);

describe('citest_engine: engineResults smoke test', () => {
  let mediaStreamerHeader;
  let tdoId;
  let assetUrl, assetId, userEditedAssetId;
  let superAdminOptions;

  beforeAll(async () => {
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superAdminOptions = helpers.requestOptions(result.token);
    mediaStreamerHeader = helpers.mediaStreamerHeader(result.token);
  });

  it('create a TDO', async () => {
    const query = `
      mutation {
        createTDO(input: {
          status: "uploaded"
          startDateTime: 1476726655
          stopDateTime: 1476726755
        }) {
          id
          applicationId
        }
      }`;

    const result = await gqlClient.query(query, null, superAdminOptions);

    tdoId = _.get(result, 'createTDO.id', null);
    expect(tdoId).toBeDefined();
  });

  it('get dedicated engine for citest', async () => {
    const result = await engineHelpers.helpGetEngines(
      { gqlClient, options: superAdminOptions },
      { name: 'CITest Engine 20221219' }
    );

    const engineGQLTest = _.get(result, 'engines.records[0]');
    expect(engineGQLTest).toBeDefined();
    expect(engineGQLTest.id).toBeDefined();
    expect(engineGQLTest.categoryId).toBeDefined();

    engineId = engineGQLTest.id;
    engineCategoryId = engineGQLTest.categoryId;
  });

  it('create an engine result asset', async () => {
    const query = `
      mutation {
        createAsset(input: {
          containerId: "${tdoId}"
          contentType: "application/json"
          assetType: "vtn-standard"
          sourceData: {
            engineId: "${engineId}"
            taskId: "${taskId}"
          }
        }) {
          id
          uri
          transform(transformFunction: JSON)
        }
      }`;

    const result = await gqlClient.uploadFile(query, 'engineAsset.json', './citest/data/engineAsset.json');
    expect(_.get(result, 'createAsset.id')).toBeDefined();
    assetUrl = _.get(result, 'createAsset.uri');
    expect(assetUrl).toBeDefined();
    assetId = _.get(result, 'createAsset.id');
    expect(assetId).toBeDefined();
  });

  it('create user-edited engine result asset', async () => {
    expect(tdoId).toBeDefined();
    expect(engineId).toBeDefined();

    const query = `
      mutation {
        userEditedAsset: createAsset(input: {
          containerId: "${tdoId}"
          contentType: "application/json"
          assetType: "vtn-standard"
          sourceData: {
            engineId: "${engineId}"
          }
          isUserEdited: true
        }) {
          id
        }
      }`;
    const result = await gqlClient.uploadFile(query, 'engineAsset.json', './citest/data/engineAsset.json');
    userEditedAssetId = _.get(result, 'userEditedAsset.id');
    expect(userEditedAssetId).toBeDefined();
  });

  it('create a broken engine result asset', async () => {
    const query = `
      mutation {
        createAsset(input: {
          containerId: "${tdoId}"
          contentType: "application/json"
          assetType: "vtn-standard"
          sourceData: {
            engineId: "${engineId2}"
          }
        }) {
          id
          uri
        }
      }`;
    const result = await gqlClient.uploadFile(query, 'engineAsset.json', './citest/data/brokenEngineAsset.json');
    expect(_.get(result, 'createAsset.id')).toBeDefined();
  });

  xit('get engine results', async () => {
    const result = await engineHelpers.helpGetEngineResults(
      { gqlClient, options: superAdminOptions },
      {
        tdoId: tdoId,
        engineCategoryIds: [engineCategoryId, ''],
        ignoreUserEdited: true
      }
    );

    const engineResults = _.get(result, 'engineResults.records');
    expect(engineResults).toHaveLength(1);
    expect(engineResults[0].tdoId).toEqual(tdoId);
    expect(engineResults[0].engineId).toEqual(engineId);
    expect(engineResults[0].jsondata).toBeDefined();
    expect(engineResults[0].assetId).toEqual(assetId);

    const editedResult = await engineHelpers.helpGetEngineResults(
      { gqlClient, options: superAdminOptions },
      {
        tdoId: tdoId,
        engineCategoryIds: [engineCategoryId, ''],
        ignoreUserEdited: false
      }
    );

    const userEditedResults = _.get(editedResult, 'engineResults.records');
    // When ignoreUserEdited is false, it retrieves both 'user edited' and not 'user edited' records.
    expect([assetId, userEditedAssetId]).toContain(userEditedResults[0].assetId);
  });

  it('fail get broken engine results', async () => {
    // error if an engine result asset has a non-array in its series property
    await expect(async () =>
      engineHelpers.helpGetEngineResults(
        { gqlClient, options: superAdminOptions },
        {
          tdoId: tdoId,
          engineIds: [engineId2, '']
        }
      )
    ).rejects.toThrow('not_found');
  });

  it('hit media-streamer download endpoint', async () => {
    await expect(async () =>
      helpers.testMediaStreamerDownload(helpers.mediaStreamerUrl, tdoId, mediaStreamerHeader)
    ).rejects.toThrow('404');
  });

  it('hit media-streamer streams endpoint', async () => {
    await expect(async () =>
      helpers.testMediaStreamerStreams(helpers.mediaStreamerUrl, mediaStreamerHeader, tdoId, 'dash.mpd')
    ).rejects.toThrow('422');
  });

  it('delete the TDO', async () => {
    const query = `
      mutation {
        deleteTDO(id: "${tdoId}") {
          id
          message
        }
      }
      `;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'deleteTDO.id')).toEqual(tdoId);
  });
});
