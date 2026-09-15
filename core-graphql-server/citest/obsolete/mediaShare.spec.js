const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const config = helpers.config;

const _ = require('lodash');
const moment = require('moment');
const citestMarker = global.citestMarker || 'citest-should-delete';
const testName = citestMarker + '_mediaShare_' + Date.now();

describe('citest_media: mediaShare', () => {
  let tdoId;
  let startDateTime;
  let stopDateTime;
  let sourceId;
  let shareId;
  let imageShareId;
  let gqlClient;

  async function createSource() {
    let query = `mutation {
      createSource(input: {
        sourceTypeId: 5
        name: "source-${testName}"
      }) {
        id
      }
    }`;
    const result = await gqlClient.query(query);
    return result.createSource.id;
  }

  async function createTdo() {
    let now = moment.utc();
    const query = `mutation {
      createTDO(input: {
        startDateTime: ${Math.floor(now.valueOf() / 1000)}
        stopDateTime: ${Math.floor(now.add(5, 'minutes').valueOf() / 1000)}
        sourceData: {
          sourceId: "${sourceId}"
        }
      }) {
        id
        startDateTime
        stopDateTime
      }
    }`;
    const result = await gqlClient.query(query);
    return result.createTDO;
  }

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    sourceId = await createSource();
    const tdo = await createTdo();

    tdoId = tdo.id;
    startDateTime = tdo.startDateTime;
    stopDateTime = tdo.stopDateTime;
    expect(sourceId).toBeDefined();
    expect(tdoId).toBeDefined();
  });

  afterAll(async () => {
    const query = `mutation {
      deleteTDO(id: "${tdoId}") { id }
      deleteSource(id: "${sourceId}") { id }
    }`;
    await gqlClient.query(query);
  });

  describe('createMediaShare', () => {
    it('throw error gracefully', async () => {
      const query = `mutation {
        createMediaShare(input: {
          mediaType: "mediastream"
        }) {
          id
          url
        }
      }`;
      expect(async () => gqlClient.query(query)).rejects.toThrow();
    });

    it('return share object for source and scheduledJobId', async () => {
      const query = `mutation {
        createMediaShare(input: {
          mediaType: "mediastream"
          sourceId: "${sourceId}"
          scheduledJobId: "-1"
          startDateTime: "${startDateTime}"
          stopDateTime: "${stopDateTime}"
        }) {
          id
          url
        }
      }`;
      const result = await gqlClient.query(query);
      shareId = _.get(result, 'createMediaShare.id');
      expect(shareId).toBeDefined();
      expect(_.get(result, 'createMediaShare.url')).toBeDefined();
    });

    it('return share object for an image type', async () => {
      const query = `mutation {
        createMediaShare(input: {
          mediaType: "image"
          tdoId: ${tdoId}
          startOffsetMs: 5000
        }) {
          id
          url
        }
      }`;
      const result = await gqlClient.query(query);

      imageShareId = _.get(result, 'createMediaShare.id');

      expect(_.get(result, 'createMediaShare.id')).toBeDefined();
      expect(_.get(result, 'createMediaShare.url')).toBeDefined();
    });
  });

  describe('getMediaShare', () => {
    it('get share object', async () => {
      const query = `query {
        mediaShare (id: "${shareId}") {
          mediaType
          serviceName
          sourceId
          scheduledJobId
        }
      }`;
      const result = await gqlClient.query(query);
      const data = _.get(result, 'mediaShare');
      expect(data).toBeDefined();
      expect(data.sourceId).toEqual(sourceId);
      expect(data.serviceName).toEqual('media-streamer');
    });

    it('throw error if not found', async () => {
      const query = `query {
        mediaShare (id: "ABCDEFG") {
          sourceId
        }
      }`;
      expect(async () => gqlClient.query(query)).rejects.toThrow('not_found');
    });

    it('throw not found for expired media share', async () => {
      // add expiration date to existing
      let query = `mutation {
        createMediaShare(input: {
          mediaType: "image"
          tdoId: ${tdoId}
          startOffsetMs: 5000
          expireDateTime: "${moment
            .utc()
            .subtract(2, 'day')
            .format('YYYY-MM-DD')}"
        }) {
          id
          url
        }
      }`;

      let result = await gqlClient.query(query);
      const newShareId = _.get(result, 'createMediaShare.id');
      expect(newShareId).toEqual(imageShareId);

      // try to get expired media share
      query = `query {
          mediaShare (id: "${newShareId}") {
            sourceId
          }
        }`;
      expect(async () => gqlClient.query(query)).rejects.toThrow('not_found');
    });
  });
});
