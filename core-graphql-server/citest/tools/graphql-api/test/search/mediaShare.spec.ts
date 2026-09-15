import { get } from 'lodash';
import moment from 'moment';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '@api/src/graphqlUtil';

interface CitestGlobals {
  citestMarker?: string;
}
const citestMarker =
  (globalThis as CitestGlobals).citestMarker || 'citest-should-delete';
const testName = `${citestMarker}_mediaShare_${Date.now()}`;

describe('citest_media: mediaShare', () => {
  let tdoId: string;
  let startDateTime: string;
  let stopDateTime: string;
  let sourceId: string;
  let shareId: string;
  let imageShareId: string;
  let gqlClient: GraphqlClient;

  async function createSource(): Promise<string> {
    const result = await gqlClient.sdk.createSource({
      input: {
        sourceTypeId: '5',
        name: `source-${testName}`
      }
    });
    return result.data.createSource!.id;
  }

  async function createTdo(): Promise<{
    id: string;
    startDateTime: string;
    stopDateTime: string;
  }> {
    const now = moment.utc();
    const start = Math.floor(now.valueOf() / 1000);
    const stop = Math.floor(now.add(5, 'minutes').valueOf() / 1000);
    const result = await gqlClient.sdk.createTDO({
      input: {
        startDateTime: start,
        stopDateTime: stop,
        sourceData: {
          sourceId
        }
      }
    });
    const tdo = result.data.createTDO!;
    return {
      id: tdo.id,
      startDateTime: tdo.startDateTime,
      stopDateTime: tdo.stopDateTime
    };
  }

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    sourceId = await createSource();
    const tdo = await createTdo();

    tdoId = tdo.id;
    startDateTime = tdo.startDateTime;
    stopDateTime = tdo.stopDateTime;
    expect(sourceId).toBeDefined();
    expect(tdoId).toBeDefined();
  });

  afterAll(async () => {
    await gqlClient.sdk.deleteTDO({ id: tdoId });
    await gqlClient.sdk.deleteSource({ id: sourceId });
  });

  describe('createMediaShare', () => {
    it('throw error gracefully', async () => {
      expect(async () =>
        gqlClient.sdk.createMediaShare({
          input: {
            mediaType: 'mediastream'
          }
        })
      ).rejects.toThrow();
    });

    it('return share object for source and scheduledJobId', async () => {
      const result = await gqlClient.sdk.createMediaShare({
        input: {
          mediaType: 'mediastream',
          sourceId: sourceId,
          scheduledJobId: '-1',
          startDateTime: startDateTime,
          stopDateTime: stopDateTime
        }
      });
      shareId = get(result, 'data.createMediaShare.id');
      expect(shareId).toBeDefined();
      expect(get(result, 'data.createMediaShare.url')).toBeDefined();
    });

    it('return share object for an image type', async () => {
      const result = await gqlClient.sdk.createMediaShare({
        input: {
          mediaType: 'image',
          tdoId: tdoId,
          startOffsetMs: 5000
        }
      });

      imageShareId = get(result, 'data.createMediaShare.id');

      expect(get(result, 'data.createMediaShare.id')).toBeDefined();
      expect(get(result, 'data.createMediaShare.url')).toBeDefined();
    });
  });

  describe('getMediaShare', () => {
    it('get share object', async () => {
      const result = await gqlClient.sdk.mediaShare({ id: shareId });
      const data = get(result, 'data.mediaShare');
      expect(data).toBeDefined();
      expect(data.sourceId).toEqual(sourceId);
      expect(data.serviceName).toEqual('media-streamer');
    });

    it('throw error if not found', async () => {
      expect(async () =>
        gqlClient.sdk.mediaShare({ id: 'ABCDEFG' })
      ).rejects.toThrow('not_found');
    });

    it('throw not found for expired media share', async () => {
      // add expiration date to existing
      const result = await gqlClient.sdk.createMediaShare({
        input: {
          mediaType: 'image',
          tdoId: tdoId,
          startOffsetMs: 5000,
          expireDateTime: moment.utc().subtract(2, 'day').format('YYYY-MM-DD')
        }
      });
      const newShareId = get(result, 'data.createMediaShare.id');
      expect(newShareId).toEqual(imageShareId);

      // try to get expired media share
      expect(async () =>
        gqlClient.sdk.mediaShare({ id: newShareId })
      ).rejects.toThrow('not_found');
    });
  });
});
