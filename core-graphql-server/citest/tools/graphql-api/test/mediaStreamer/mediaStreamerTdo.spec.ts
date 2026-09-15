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

describe('citest_media: TDO tests related to media-streamer', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;
  let mediaStreamerHeader: { headers: Record<string, string> };
  let tdoId: string;
  let asset1Id: string;
  let asset2Id: string;
  let newestMediaAsPrimary: boolean;

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
    mediaStreamerHeader = helpers.mediaStreamerHeader(isolatedSuperadmin.token);
  });

  afterAll(async () => {
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

  it('create a TDO', async () => {
    const result = await gqlClient.sdk.createTDO({
      input: {
        startDateTime: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        stopDateTime: new Date().toISOString()
      }
    });

    tdoId = result?.data?.createTDO?.id ?? '';
    expect(tdoId).toBeDefined();
  });

  it('now create a first media asset', async () => {
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
    const result = await gqlClient.uploadFile(
      query,
      'test.mp4',
      './citest/data/movie.mp4'
    );

    asset1Id = _.get(result, 'body.data.createAsset.id');
    expect(asset1Id).toBeDefined();
  });

  it('now create a second media asset', async () => {
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
    const result = await gqlClient.uploadFile(
      query,
      'test.mp4',
      './citest/data/movie.mp4'
    );

    asset2Id = _.get(result, 'body.data.createAsset.id');
    expect(asset2Id).toBeDefined();
  });

  it('check primary asset order feature flag', async () => {
    const result = await gqlClient.sdk.graphqlServiceInfo();

    newestMediaAsPrimary = _.get(
      result,
      'data.graphqlServiceInfo.featureFlags.newestMediaAsPrimary',
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

  it('hit media-streamer download endpoint', async () => {
    await helpers.testMediaStreamerDownload(
      helpers.mediaStreamerUrl,
      tdoId,
      mediaStreamerHeader
    );
  });

  it('hit media-streamer streams endpoint - unsupported protocol', async () => {
    const streamUrl = `${helpers.mediaStreamerUrl}/stream/${tdoId}/dash.mpd`;
    const response = await helpers
      .supertest(streamUrl)
      .get('')
      .set(mediaStreamerHeader.headers)
      .expect(422);

    expect(response.body.error).toContain(
      'TDO does not support requested stream protocol'
    );
  });

  it('create a media segment so the TDO supports streaming', async () => {
    const addSegmentsResult = await gqlClient.sdk.AddSegments({
      containerId: tdoId,
      segmentGroupId: '0adfa9f1-2d32-4194-99e7-fa3bc93a5bff',
      url: 'https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2'
    });

    expect(addSegmentsResult?.data?.seg1?.id).toBeTruthy();
  });

  it('hit media-streamer streams endpoint - now supported after adding a segment', async () => {
    await helpers.testMediaStreamerStreams(
      helpers.mediaStreamerUrl,
      mediaStreamerHeader,
      tdoId,
      'dash.mpd'
    );
  });

  it('delete the TDO', async () => {
    const result = await gqlClient.sdk.deleteTDO({ id: tdoId });
    expect(result?.data?.deleteTDO?.id).toEqual(tdoId);
  });
});
