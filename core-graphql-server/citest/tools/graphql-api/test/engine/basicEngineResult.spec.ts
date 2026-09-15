import path from 'path';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { helpers } from '../../src/helpers/index';
import _ from 'lodash';

const engineId2 = 'c3497af0-ac1c-421d-8b2e-618797093621';
const taskId = '19052122_ltTBRXQOMaSxSvZ';

describe('citest_engine: engineResults smoke test', () => {
  let gqlClient: GraphqlClient;
  let mediaStreamerHeader: any;
  let tdoId: string;
  let assetUrl: string;
  let assetId: string;
  let userEditedAssetId: string;
  let engineId: string;
  let engineCategoryId: string;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();
    mediaStreamerHeader = helpers.mediaStreamerHeader(
      gqlClient.sessionToken as string
    );
  });

  it('create a TDO', async () => {
    const result = await gqlClient.sdk.createTDO({
      input: {
        status: 'uploaded',
        startDateTime: 1476726655,
        stopDateTime: 1476726755
      }
    });

    tdoId = result?.data?.createTDO?.id as string;
    expect(tdoId).toBeDefined();
  });

  it('get dedicated engine for citest', async () => {
    const result = await gqlClient.sdk.engines({
      filter: { name: 'CITest Engine 20221219' }
    });

    const engineGQLTest = result?.data?.engines?.records?.[0];
    expect(engineGQLTest).toBeDefined();
    expect(engineGQLTest?.id).toBeDefined();
    expect(engineGQLTest?.categoryId).toBeDefined();

    engineId = engineGQLTest?.id as string;
    engineCategoryId = engineGQLTest?.categoryId as string;
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

    const filePath = path.join(
      __dirname,
      './../../../../data/engineAsset.json'
    );
    const result = await gqlClient.uploadFile(
      query,
      'engineAsset.json',
      filePath
    );
    const body = JSON.parse(result.text);
    expect(_.get(body, 'data.createAsset.id')).toBeDefined();
    assetUrl = _.get(body, 'data.createAsset.uri');
    expect(assetUrl).toBeDefined();
    assetId = _.get(body, 'data.createAsset.id');
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

    const filePath = path.join(
      __dirname,
      './../../../../data/engineAsset.json'
    );
    const result = await gqlClient.uploadFile(
      query,
      'engineAsset.json',
      filePath
    );
    const body = JSON.parse(result.text);
    userEditedAssetId = _.get(body, 'data.userEditedAsset.id');
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

    const filePath = path.join(
      __dirname,
      './../../../../data/brokenEngineAsset.json'
    );
    const result = await gqlClient.uploadFile(
      query,
      'brokenEngineAsset.json',
      filePath
    );
    const body = JSON.parse(result.text);
    expect(_.get(body, 'data.createAsset.id')).toBeDefined();
  });

  it.skip('get engine results', async () => {
    const result: any = await gqlClient.sdk.engineResults({
      tdoId: tdoId,
      engineCategoryIds: [engineCategoryId, ''],
      ignoreUserEdited: true
    });

    const engineResultRecords = _.get(result, 'data.engineResults.records');
    expect(engineResultRecords).toHaveLength(1);
    expect(engineResultRecords[0].tdoId).toEqual(tdoId);
    expect(engineResultRecords[0].engineId).toEqual(engineId);
    expect(engineResultRecords[0].jsondata).toBeDefined();
    expect(engineResultRecords[0].assetId).toEqual(assetId);

    const editedResult: any = await gqlClient.sdk.engineResults({
      tdoId: tdoId,
      engineCategoryIds: [engineCategoryId, ''],
      ignoreUserEdited: false
    });

    const userEditedResults = _.get(editedResult, 'data.engineResults.records');
    // When ignoreUserEdited is false, it retrieves both 'user edited' and not 'user edited' records.
    expect([assetId, userEditedAssetId]).toContain(
      userEditedResults[0].assetId
    );
  });

  it('fail get broken engine results', async () => {
    // error if an engine result asset has a non-array in its series property
    await expect(
      gqlClient.sdk.engineResults({
        tdoId: tdoId,
        engineIds: [engineId2, '']
      })
    ).rejects.toThrow('not_found');
  });

  it('hit media-streamer download endpoint', async () => {
    await expect(
      helpers.testMediaStreamerDownload(
        helpers.mediaStreamerUrl,
        tdoId,
        mediaStreamerHeader,
        {}
      )
    ).rejects.toThrow('404');
  });

  it('hit media-streamer streams endpoint', async () => {
    await expect(
      helpers.testMediaStreamerStreams(
        helpers.mediaStreamerUrl,
        mediaStreamerHeader,
        tdoId,
        'dash.mpd',
        {}
      )
    ).rejects.toThrow('422');
  });

  it('delete the TDO', async () => {
    const result = await gqlClient.sdk.deleteTDO({ id: tdoId });
    expect(result?.data?.deleteTDO?.id).toEqual(tdoId);
  });
});
