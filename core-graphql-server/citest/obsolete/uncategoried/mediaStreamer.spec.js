const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const mediaUtil = require('../../helpers/mediaStreamer.js');
const _ = require('lodash');
const config = helpers.config;

describe('media-streamer smoke test', () => {
  let mediaStreamerHeader;
  let mediaStreamerUrl;
  let tdoId;
  let assetUrl, assetId, tdoStartDateTime;

  let gqlClient;

  async function createTDOWithAsset() {
    let query = `
    mutation {
      createTDO(input: {
          status: "uploaded",
          startDateTime: 1476726655,
          stopDateTime: 1476726755
      }) {
          id
          applicationId
          startDateTime
          stopDateTime
      }
    }`;
    let result = await gqlClient.query(query);
    const tdo = _.get(result, 'createTDO', null);
    if (!tdo) {
      return null;
    }
    query = `
      mutation {
      createAsset(input: {
        containerId: "${tdo.id}"
        contentType: "video/mp4"
        assetType: "media"
      }) {
        id
        uri
      }
      }`;
    result = await gqlClient.uploadFile(
      query,
      'movie.mp4',
      './citest/data/movie.mp4'
    );
    return {
      tdo,
      asset: _.get(result, 'createAsset', null)
    };
  }

  async function createTDOWithStreamAsset() {
    const testMediaFolder = `${process.cwd()}/citest/data`;
    const videoChunks = [
      {
        file: `${testMediaFolder}/segmented_video_init.m4s`,
        start: 0,
        stop: 5000,
        segDurationMs: 5000
      },
      {
        file: `${testMediaFolder}/segmented_video_5s_0.mp4`,
        start: 0,
        stop: 5000,
        segDurationMs: 5000
      },
      {
        file: `${testMediaFolder}/segmented_video_5s_1.mp4`,
        start: 5000,
        stop: 10000
      },
      {
        file: `${testMediaFolder}/segmented_video_5s_2.mp4`,
        start: 10000,
        stop: 15000
      },
      {
        file: `${testMediaFolder}/segmented_video_5s_3.mp4`,
        start: 15000,
        stop: 20000
      }
    ];
    const now = new Date();
    const start = now.getTime();
    now.setSeconds(now.getSeconds() + 20);
    const stop = now.getTime();

    const tdo = await mediaUtil.createStreamManifestTdo(gqlClient, {
      type: 'video',
      mimeType: 'video/mp4',
      startTimestamp: start,
      stopTimestamp: stop
    });
    await mediaUtil.addMediaChunks(
      gqlClient,
      helpers.supertest,
      tdo.id,
      'video',
      'video/mp4', // 'application/vnd.apple.mpegurl
      videoChunks
    );
    return {
      tdo
    };
  }

  let mediaTdo;
  let streamTdo;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    mediaStreamerHeader = helpers.mediaStreamerHeader(result.token);
    mediaStreamerUrl = helpers.mediaStreamerUrl;

    mediaTdo = await createTDOWithAsset();
    expect(mediaTdo).toBeDefined();
    expect(mediaTdo.tdo).toBeDefined();
    expect(mediaTdo.tdo.id).toBeDefined();
    expect(mediaTdo.asset).toBeDefined();
    expect(mediaTdo.asset.id).toBeDefined();
    expect(mediaTdo.asset.uri).toBeDefined();

    streamTdo = await createTDOWithStreamAsset();
    expect(streamTdo).toBeDefined();
    expect(streamTdo.tdo).toBeDefined();
    expect(streamTdo.tdo.id).toBeDefined();
  });

  afterAll(async () => {
    if (!mediaTdo.id) return;
    const query = `mutation($id: ID!) {
        deleteTDO(id: $id) {
            id
        }
      }`;
    await gqlClient.query(query, { id: mediaTdo.tdo.id });
    await gqlClient.query(query, { id: streamTdo.tdo.id });
  });

  describe('image tests', () => {
    it('should return 422 if dateTime is not valid', async () => {
      const requestUrl = `${mediaStreamerUrl}/image/${mediaTdo.tdo.id}/datetime`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .expect(422);
    });

    it('should return 404 if media is not found', async () => {
      const requestUrl = `${mediaStreamerUrl}/image/0987654321/2018-06-27%2010:01:04.000Z`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .expect(404);
    });

    it('should be able to GET from url without x, y', async () => {
      const requestUrl = `${mediaStreamerUrl}/image/${mediaTdo.tdo.id}/${mediaTdo.tdo.startDateTime}`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .expect(200)
        .expect('Content-Type', 'image/jpeg');
    });

    it('should be able to GET from url with x, y', async () => {
      const requestUrl = `${mediaStreamerUrl}/image/${mediaTdo.tdo.id}/${mediaTdo.tdo.startDateTime}?x[0]=0.482&y[0]=0.168&x[1]=0.482&y[1]=0.626&x[2]=0.740&y[2]=0.626&x[3]=0.740&y[3]=0.168`;
      const result = await helpers
        .supertest(requestUrl)
        .get('')
        .buffer()
        .set(mediaStreamerHeader.headers)
        .expect(200)
        .expect('Content-Type', 'image/png');
    });

    it.skip('should set last-modified header', async () => {
      const requestUrl = `${mediaStreamerUrl}/image/${mediaTdo.tdo.id}/${mediaTdo.tdo.startDateTime}?x[0]=0.482&y[0]=0.168&x[1]=0.482&y[1]=0.626&x[2]=0.740&y[2]=0.626&x[3]=0.740&y[3]=0.168`;
      const result = await helpers
        .supertest(requestUrl)
        .get('')
        .buffer()
        .set(mediaStreamerHeader.headers)
        .expect(200)
        .expect('Content-Type', 'image/png')
        .expect(function (res) {
          let hdr = res.headers['last-modified'];
          if (!hdr) {
            throw new Error('Expected Last-Modified header to be present');
          }
          let lastModified = new Date(hdr);
          if (isNaN(lastModified.getTime())) {
            throw new Error('Expected Last-Modified header to be a valid date');
          }
        });
    });

    it.skip('should handle if-modified-since', async () => {
      const requestUrl = `${mediaStreamerUrl}/image/${mediaTdo.tdo.id}/${mediaTdo.tdo.startDateTime}?x[0]=0.482&y[0]=0.168&x[1]=0.482&y[1]=0.626&x[2]=0.740&y[2]=0.626&x[3]=0.740&y[3]=0.168`;
      const headers = _.merge({}, mediaStreamerHeader.headers, {
        'if-modified-since': new Date().toUTCString()
      });

      const result = await helpers
        .supertest(requestUrl)
        .get('')
        .buffer()
        .set(headers)
        .expect(304);
    });

    it('should return 400 if x - y lengths are different', async () => {
      const requestUrl = `${mediaStreamerUrl}/image/${mediaTdo.tdo.id}/${mediaTdo.tdo.startDateTime}?x[0]=0.482&x[1]=0.168&y[0]=0.168`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .expect(400);
    });

    it('Should crop to correct dimensions with 2 to N number of points', async () => {
      const requestUrl = `${mediaStreamerUrl}/image/${mediaTdo.tdo.id}?offsetMs=0&x0=0.02&y0=0.05&x1=0.30&y1=0.5&x2=0.5&y2=0.7`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .expect(200);
    });
  });

  describe('stream tests', () => {
    it('should return 200 for stream', async () => {
      const requestUrl = `${mediaStreamerUrl}/stream/${streamTdo.tdo.id}/master.m3u8`;
      const result = await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .parse((res, callback) => {
          res.setEncoding('utf8');
          res.data = '';
          res.on('data', (chunk) => {
            res.data += chunk;
          });
          res.on('end', () => {
            callback(null, Buffer.from(res.data, 'binary'));
          });
        })
        .expect(200)
        .expect('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      const manifest = result.body.toString();
      expect(manifest).toContain('#EXTM3U');
      expect(manifest).toContain(
        '#EXT-X-STREAM-INF:BANDWIDTH=100000,CODECS="avc1.64001e,mp4a.40.2"'
      );
      expect(manifest).toContain('playlist.m3u8');
    });

    it('should work with date filter', async () => {
      const startDateTime = new Date().toISOString();
      const requestUrl = `${mediaStreamerUrl}/stream/${streamTdo.tdo.id}/master.m3u8?startDate=${startDateTime}&endDate=${startDateTime}`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .expect(200)
        .expect('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    });
  });

  describe('download tests', () => {
    it('should return 422 for invalid start time', async () => {
      const requestUrl = `${mediaStreamerUrl}/download/tdo/${mediaTdo.tdo.id}?startDate=1`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .expect(422);
    });
    it('should download media', async () => {
      const requestUrl = `${mediaStreamerUrl}/download/tdo/${mediaTdo.tdo.id}?startDate=${mediaTdo.tdo.startDateTime}`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .expect(200)
        .expect('Content-Type', 'video/mp4');
    });
    it('should work with offsets', async () => {
      const requestUrl = `${mediaStreamerUrl}/download/tdo/${mediaTdo.tdo.id}?startOffsetMs=5000&endOffsetMs=10000`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .expect(200)
        .expect('Content-Type', 'video/mp4');
    });
    it('should work with source+program', async () => {
      const requestUrl = `${mediaStreamerUrl}/mediasource/-1/programId/-1?startDate=${mediaTdo.tdo.startDateTime}&endDate=${mediaTdo.tdo.stopDateTime}&mediaId=${mediaTdo.tdo.id}`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .expect(200)
        .expect('Content-Type', 'video/mp4');
    });
    it('should work with source+program metadata', async () => {
      const requestUrl = `${mediaStreamerUrl}/mediasource/-1/programId/-1/metadata?startDate=${mediaTdo.tdo.startDateTime}&endDate=${mediaTdo.tdo.stopDateTime}&mediaId=${mediaTdo.tdo.id}`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .set(mediaStreamerHeader.headers)
        .expect(200)
        .expect('Content-Type', 'application/json; charset=utf-8');
    });
  });
});
