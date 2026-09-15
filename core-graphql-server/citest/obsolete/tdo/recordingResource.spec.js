const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const { safe } = require('../helpers/cleanup/utils');
const config = helpers.config;
const _ = require('lodash');

let tdoId = null;
let tdoIdwithAsset = null;
let tdoIdNoContentType = null;
const env = config.env;
const gqlClient = new GraphqlClient(env);
const citestMarker = global.citestMarker || 'citest-should-delete';

(gqlClient.isEnableResourceTest() ? describe : describe.skip)(
  'citest_tdo: TDO resource test using internal orgless token and ai data token',
  () => {
    it('create TDO by ai data org token', async () => {
      const query = `
    mutation {
      createTDO(input: {
          status: "uploaded",
          startDateTime: 1476726655,
          stopDateTime: 1476726655

      }) {
          id
          applicationId
      }
    }`;

      // use ai data org token
      const result = await gqlClient.queryByAIDataOrgToken(query);
      tdoId = _.get(result, 'createTDO.id');
      expect(tdoId).toBeDefined();
    });

    it('create TDO with asset by ai data org token', async () => {
      const name = `${citestMarker}_automateNode_${Date.now()}`;
      const query = `
    mutation createTDOwithAsset {
      createTDOWithAsset(input:{
        startDateTime: "2023-08-17T23:31:23.478Z",
        contentType: "application/gzip"
        assetType: "media"
        name: "${name}"
        addToIndex: true
        details: {
          tags: [
            {
              value: "automateNode"
            }
          ],
          addToIndex: true,
          automateNode: {
              module: "AutomateNode",
              type: "AutomateType",
              version: "1.1.1",
              author: "citest",
              desc: "desc",
              keywords: "test"
          }
        }
      }){
        id
        primaryAsset(assetType: "media"){
          id
          contentType
          assetType
        }
      }
    }`;
      const result = await gqlClient.uploadFileByAIDataOrgToken(
        query,
        'AutomateNode-1.1.1.gz',
        './citest/data/AutomateNode-1.1.1.gz'
      );

      tdoIdwithAsset = _.get(result, 'createTDOWithAsset.id');
      expect(tdoIdwithAsset).toBeTruthy();
      const primaryAsset = _.get(result, 'createTDOWithAsset.primaryAsset');
      expect(primaryAsset.id).toBeDefined();
      expect(primaryAsset.contentType).toEqual('application/gzip');
      expect(primaryAsset.assetType).toEqual('media');
    });

    it('create TDO with asset without contentType - should detect from file', async () => {
      const name = `${citestMarker}_noContentType_${Date.now()}`;
      const query = `
    mutation createTDOwithAsset {
      createTDOWithAsset(input:{
        startDateTime: "2023-08-17T23:31:23.478Z",
        assetType: "media"
        name: "${name}"
        addToIndex: false
      }){
        id
        primaryAsset(assetType: "media"){
          id
          contentType
          assetType
        }
      }
    }`;
      const result = await gqlClient.uploadFileByAIDataOrgToken(
        query,
        'movie_clip.mov',
        './citest/data/movie_clip.mov'
      );

      tdoIdNoContentType = _.get(result, 'createTDOWithAsset.id');
      expect(tdoIdNoContentType).toBeTruthy();
      const primaryAsset = _.get(result, 'createTDOWithAsset.primaryAsset');
      expect(primaryAsset.id).toBeDefined();
      // contentType should be multer-detected from the uploaded .mov file,
      // not the old schema default "video/mp4"
      expect(primaryAsset.contentType).toEqual('video/quicktime');
      expect(primaryAsset.assetType).toEqual('media');
    });

    it('update TDO by ai data org token', async () => {
      const query = `mutation {
      updateTDO(input: {
        id: ${tdoId}
        name: "${citestMarker}-testTDO"
        details:{
          veritoneFile:{
            fileName:"testTDOFileName"
          }
        }
      }) {
        id
        name
      }
    }`;
      const result = await gqlClient.queryByAIDataOrgToken(query);

      expect(result.updateTDO).toBeDefined();
      expect(result.updateTDO.name).toEqual(citestMarker + '-testTDO');
    });

    it('Get recording by internal orgless token', async () => {
      const query = `query {
      temporalDataObjects(id: "${tdoId}"){
        count
        records{
          id
          name
        }
      }
    }`;
      const result = await gqlClient.queryByInternalOrglessToken(query);

      expect(result.temporalDataObjects.count).toEqual(1);
      expect(result.temporalDataObjects.records[0]).toHaveProperty('id', tdoId);
    });

    it('delete the tdoId', async () => {
      const query = `
    mutation {
      deleteTDO(id: "${tdoId}") {
        id
        message
      }
    }`;
      const result = await gqlClient.queryByAIDataOrgToken(query);
      expect(_.get(result, 'deleteTDO.id')).toEqual(tdoId);
    });

    it('delete the tdoIdwithAsset', async () => {
      const query = `
    mutation {
      deleteTDO(id: "${tdoIdwithAsset}") {
        id
        message
      }
    }`;
      const result = await gqlClient.queryByAIDataOrgToken(query);
      expect(_.get(result, 'deleteTDO.id')).toEqual(tdoIdwithAsset);
    });

    it('delete the tdoIdNoContentType', async () => {
      if (!tdoIdNoContentType) return;
      const query = `
    mutation {
      deleteTDO(id: "${tdoIdNoContentType}") {
        id
        message
      }
    }`;
      const result = await gqlClient.queryByAIDataOrgToken(query);
      expect(_.get(result, 'deleteTDO.id')).toEqual(tdoIdNoContentType);
    });

    afterAll(async () => {
      // Clean up TDOs
      const tdoIds = [tdoId, tdoIdwithAsset, tdoIdNoContentType].filter(Boolean);
      for (const id of tdoIds) {
        await safe(`delete TDO ${id}`, async () => {
          const query = `mutation { deleteTDO(id: "${id}") { id message } }`;
          await gqlClient.queryByAIDataOrgToken(query);
        });
      }
    });
  }
);
