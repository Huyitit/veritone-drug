const _ = require('lodash');
const GraphqlClient = require('../../helpers/gql.js');
const helpers = require('../../helpers/index.js');

const config = helpers.config;
const moment = require('moment');

let tdoId, asset1Id, asset2Id, newestMediaAsPrimary;
describe('citest_media: TDO tests related to media-streamer', () => {
  let mediaStreamerHeader;

  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('create a TDO', async () => {
    const query = `
    mutation {
      createTDO(input: {
        startDateTime: "${moment().subtract(15, 'minutes').toISOString()}"
        stopDateTime: "${moment().toISOString()}"
      }) {
        id
        startDateTime
        stopDateTime
      }
    }
    `;
    const result = await gqlClient.query(query);

    tdoId = _.get(result, 'createTDO.id');
    expect(tdoId).toBeDefined();
  });

  it('now create a first media asset', async () => {
    let result;
    const query = `
    mutation {
      createAsset(input: {
        containerId: "${tdoId}"
        assetType: "media"
        contentType: "video/mp4"
      }) {
        id
        uri
        signedUri
      }
    }
    `;
    result = await gqlClient.uploadFile(
      query,
      'test.mp4',
      './citest/data/movie.mp4'
    );
    asset1Id = _.get(result, 'createAsset.id');
    expect(asset1Id).toBeDefined();
  });

  it('now create a second media asset', async () => {
    let result;
    const query = `
    mutation {
      createAsset(input: {
        containerId: "${tdoId}"
        assetType: "media"
        contentType: "video/mp4"
      }) {
        id
        uri
        signedUri
      }
    }
    `;
    result = await gqlClient.uploadFile(
      query,
      'test.mp4',
      './citest/data/movie.mp4'
    );

    asset2Id = _.get(result, 'createAsset.id');
    expect(asset2Id).toBeDefined();
  });

  it('check primary asset order feature flag', async () => {
    const query = `
query {
  me {
    id
  }
  graphqlServiceInfo {
    featureFlags
  }
}
    `;
    const result = await gqlClient.query(query);

    newestMediaAsPrimary = _.get(
      result,
      'graphqlServiceInfo.featureFlags.newestMediaAsPrimary',
      false
    );
  });

  it('get primary media asset - should be the second', async () => {
    const query = `
query {
  temporalDataObject(id: "${tdoId}") {
    primaryAsset(assetType: "media") {
      id
    }
  }
  asset(id: "${asset1Id}") {
    id
  }
}
    `;
    const result = await gqlClient.query(query);
    if (newestMediaAsPrimary === true) {
      expect(_.get(result, 'temporalDataObject.primaryAsset.id')).toEqual(
        asset2Id
      );
    } else {
      expect(
        _.get(result, 'temporalDataObject.primaryAsset.id')
      ).toBeUndefined();
    }
    expect(_.get(result, 'asset.id')).toEqual(asset1Id);
  });

  //FIXME: the next 2 test just test media-streamer
  xit('hit media-streamer download endpoint', async () => {
    return helpers
      .testMediaStreamerDownload(
        helpers.mediaStreamerUrl,
        tdoId,
        mediaStreamerHeader
      )
      .then((response) => {})
      .catch((err) => {
        helpers.expect(err, 'err').to.be.undefined;
      });
  });

  xit('hit media-streamer streams endpoint', () => {
    return helpers
      .testMediaStreamerStreams(
        helpers.mediaStreamerUrl,
        mediaStreamerHeader,
        tdoId,
        'dash.mpd'
      )
      .then((response) => {
        expect(response).to.have.status(422);
        expect(response.body.error).to.include(
          'TDO does not support requested stream protocol'
        );
      })
      .catch((err) => {
        helpers.expect(err, 'err').to.be.undefined;
      });
  });

  it('delete the TDO', async () => {
    var query = `
    mutation {
      deleteTDO(id: "${tdoId}") {
        id
      }
    }
    `;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'deleteTDO.id')).toEqual(tdoId);
  });
});
