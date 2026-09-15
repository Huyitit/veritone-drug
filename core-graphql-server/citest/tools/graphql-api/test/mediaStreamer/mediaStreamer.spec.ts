import _ from 'lodash';

import { helpers } from '../../src/helpers';
import { safe } from '../../src/helpers/commonHelper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { OrganizationStatus } from '../../src/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';
import {
  createStreamManifestTdo,
  addMediaChunks
} from '../../src/helpers/mediaStreamer';

interface TdoWithAsset {
  tdo: {
    id: string;
    applicationId?: string;
    startDateTime: string;
    stopDateTime: string;
  };
  asset: { id: string; uri: string } | null;
}

interface TdoWithStream {
  tdo: { id: string };
}

describe('citest_media: media-streamer smoke test', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;
  let mediaStreamerHeader: { headers: Record<string, string> };
  let mediaStreamerUrl: string;
  let mediaTdo: TdoWithAsset;
  let streamTdo: TdoWithStream;

  async function createTDOWithAsset(): Promise<TdoWithAsset | null> {
    const tdoResult = await gqlClient.sdk.createTDO({
      input: {
        status: 'uploaded',
        startDateTime: 1476726655,
        stopDateTime: 1476726755
      }
    });
    const tdo = tdoResult?.data?.createTDO;
    if (!tdo) {
      return null;
    }

    const query = `
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
    const result = await gqlClient.uploadFile(
      query,
      'movie.mp4',
      './citest/data/movie.mp4'
    );
    return {
      tdo: tdo as TdoWithAsset['tdo'],
      asset: _.get(result, 'body.data.createAsset', null)
    };
  }

  async function createTDOWithStreamAsset(): Promise<TdoWithStream> {
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

    const tdo = await createStreamManifestTdo(gqlClient, {
      type: 'video',
      mimeType: 'video/mp4',
      startTimestamp: start,
      stopTimestamp: stop
    });
    await addMediaChunks(
      gqlClient,
      tdo.id,
      'video',
      'video/mp4', // 'application/vnd.apple.mpegurl
      videoChunks
    );
    return {
      tdo
    };
  }

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
    mediaStreamerHeader = helpers.mediaStreamerHeader(isolatedSuperadmin.token);
    mediaStreamerUrl = helpers.mediaStreamerUrl;

    const createdMediaTdo = await createTDOWithAsset();
    expect(createdMediaTdo).toBeDefined();
    expect(createdMediaTdo?.tdo).toBeDefined();
    expect(createdMediaTdo?.tdo.id).toBeDefined();
    expect(createdMediaTdo?.asset).toBeDefined();
    expect(createdMediaTdo?.asset?.id).toBeDefined();
    expect(createdMediaTdo?.asset?.uri).toBeDefined();
    mediaTdo = createdMediaTdo!;

    streamTdo = await createTDOWithStreamAsset();
    expect(streamTdo).toBeDefined();
    expect(streamTdo.tdo).toBeDefined();
    expect(streamTdo.tdo.id).toBeDefined();

    await helpers.sleep(10000);
  });

  afterAll(async () => {
    await safe('delete media tdo', () =>
      gqlClient.sdk.deleteTDO({ id: mediaTdo.tdo.id })
    );
    await safe('delete stream tdo', () =>
      gqlClient.sdk.deleteTDO({ id: streamTdo.tdo.id })
    );
    await safe('delete isolated superadmin org', () =>
      isolatedSuperadmin.client.sdk.updateOrganization({
        input: {
          id: isolatedSuperadmin.orgId,
          status: OrganizationStatus.Deleted
        }
      })
    );
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
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
      await helpers
        .supertest(requestUrl)
        .get('')
        .buffer()
        .set(mediaStreamerHeader.headers)
        .expect(200)
        .expect('Content-Type', 'image/png');
    });

    it('should set last-modified header', async () => {
      const requestUrl = `${mediaStreamerUrl}/image/${mediaTdo.tdo.id}/${mediaTdo.tdo.startDateTime}?x[0]=0.482&y[0]=0.168&x[1]=0.482&y[1]=0.626&x[2]=0.740&y[2]=0.626&x[3]=0.740&y[3]=0.168`;
      await helpers
        .supertest(requestUrl)
        .get('')
        .buffer()
        .set(mediaStreamerHeader.headers)
        .expect(200)
        .expect('Content-Type', 'image/png')
        .expect((res: any) => {
          const hdr = res.headers['last-modified'];
          if (!hdr) {
            throw new Error('Expected Last-Modified header to be present');
          }
          const lastModified = new Date(hdr);
          if (isNaN(lastModified.getTime())) {
            throw new Error('Expected Last-Modified header to be a valid date');
          }
        });
    });

    it('should handle if-modified-since', async () => {
      const requestUrl = `${mediaStreamerUrl}/image/${mediaTdo.tdo.id}/${mediaTdo.tdo.startDateTime}?x[0]=0.482&y[0]=0.168&x[1]=0.482&y[1]=0.626&x[2]=0.740&y[2]=0.626&x[3]=0.740&y[3]=0.168`;
      const headers = _.merge({}, mediaStreamerHeader.headers, {
        'if-modified-since': new Date().toUTCString()
      });

      await helpers
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
        .parse((res: any, callback: any) => {
          res.setEncoding('utf8');
          res.data = '';
          res.on('data', (chunk: string) => {
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
      const startDate = new Date(
        new Date(mediaTdo.tdo.startDateTime).getTime() - 1000
      ).toISOString();
      const endDate = new Date(
        new Date(mediaTdo.tdo.stopDateTime).getTime() + 1000
      ).toISOString();
      const requestUrl = `${mediaStreamerUrl}/mediasource/-1/programId/-1?startDate=${startDate}&endDate=${endDate}&mediaId=${mediaTdo.tdo.id}`;
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
