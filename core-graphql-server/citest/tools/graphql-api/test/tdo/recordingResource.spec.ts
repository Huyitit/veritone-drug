import * as path from 'path';
import { get } from 'lodash';
import { loadConfig } from '@api/src/config';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '@api/src/graphqlUtil';
import { safe } from '@api/src/helpers/commonHelper';
import { CREATE_TDO_WITH_PRIMARY_ASSET } from '@api/src/queries/extracted/tdo';

const config = loadConfig();

interface CitestGlobals {
  citestMarker?: string;
}
const citestMarker =
  (globalThis as CitestGlobals).citestMarker || 'citest-should-delete';

/**
 * Mirrors the legacy client's `isEnableResourceTest()`: both the internal
 * orgless token and the AI-data org token must be configured, otherwise this
 * suite has no identity to run as.
 */
const isEnableResourceTest = Boolean(
  config.apiInternalOrgLessToken && config.apiAIDataOrgToken
);

/**
 * Two identities, matching the legacy client's `queryByAIDataOrgToken` /
 * `queryByInternalOrglessToken` helpers: `API_KEY` binds the AI-data org token
 * and `ORGLESS_API_KEY` binds the internal orgless token.
 */
let aiDataClient: GraphqlClient;
let orglessClient: GraphqlClient;

let tdoId: string | null = null;
let tdoIdwithAsset: string | null = null;
let tdoIdNoContentType: string | null = null;

/**
 * Resolved from __dirname, not the process cwd. The pre-conversion paths were
 * cwd-relative (`./citest/data/…`), which resolves under Jest (cwd =
 * services/api/core-graphql-server) but not under `bun test` (cwd =
 * citest/tools/graphql-api) — the sole cause of this spec's 4 Bun-only failures.
 */
const dataDir = path.join(__dirname, '..', '..', '..', '..', 'data');

interface UploadResponseBody {
  data?: {
    createTDOWithAsset?: {
      id: string;
      primaryAsset?: {
        id: string;
        contentType: string;
        assetType: string;
      } | null;
    } | null;
  };
}

(isEnableResourceTest ? describe : describe.skip)(
  'citest_tdo: TDO resource test using internal orgless token and ai data token',
  () => {
    beforeAll(async () => {
      aiDataClient = await createGraphqlClient(AuthType.API_KEY);
      orglessClient = await createGraphqlClient(AuthType.ORGLESS_API_KEY);
    });

    it('create TDO by ai data org token', async () => {
      const result = await aiDataClient.sdk.createTDO({
        input: {
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726655
        }
      });
      tdoId = get(result, 'data.createTDO.id', null);
      expect(tdoId).toBeDefined();
    });

    it('create TDO with asset by ai data org token', async () => {
      const name = `${citestMarker}_automateNode_${Date.now()}`;
      const res = await aiDataClient.uploadFile(
        CREATE_TDO_WITH_PRIMARY_ASSET,
        'AutomateNode-1.1.1.gz',
        path.join(dataDir, 'AutomateNode-1.1.1.gz'),
        undefined,
        {
          input: {
            startDateTime: '2023-08-17T23:31:23.478Z',
            contentType: 'application/gzip',
            assetType: 'media',
            name,
            addToIndex: true,
            details: {
              tags: [{ value: 'automateNode' }],
              addToIndex: true,
              automateNode: {
                module: 'AutomateNode',
                type: 'AutomateType',
                version: '1.1.1',
                author: 'citest',
                desc: 'desc',
                keywords: 'test'
              }
            }
          }
        }
      );

      const body = JSON.parse(res.text) as UploadResponseBody;
      tdoIdwithAsset = get(body, 'data.createTDOWithAsset.id', null);
      expect(tdoIdwithAsset).toBeTruthy();
      const primaryAsset = get(
        body,
        'data.createTDOWithAsset.primaryAsset',
        null
      );
      expect(primaryAsset?.id).toBeDefined();
      expect(primaryAsset?.contentType).toEqual('application/gzip');
      expect(primaryAsset?.assetType).toEqual('media');
    });

    it('create TDO with asset without contentType - should detect from file', async () => {
      const name = `${citestMarker}_noContentType_${Date.now()}`;
      const res = await aiDataClient.uploadFile(
        CREATE_TDO_WITH_PRIMARY_ASSET,
        'movie_clip.mov',
        path.join(dataDir, 'movie_clip.mov'),
        undefined,
        {
          input: {
            startDateTime: '2023-08-17T23:31:23.478Z',
            assetType: 'media',
            name,
            addToIndex: false
          }
        }
      );

      const body = JSON.parse(res.text) as UploadResponseBody;
      tdoIdNoContentType = get(body, 'data.createTDOWithAsset.id', null);
      expect(tdoIdNoContentType).toBeTruthy();
      const primaryAsset = get(
        body,
        'data.createTDOWithAsset.primaryAsset',
        null
      );
      expect(primaryAsset?.id).toBeDefined();
      // contentType should be multer-detected from the uploaded .mov file,
      // not the old schema default "video/mp4"
      expect(primaryAsset?.contentType).toEqual('video/quicktime');
      expect(primaryAsset?.assetType).toEqual('media');
    });

    it('update TDO by ai data org token', async () => {
      const result = await aiDataClient.sdk.updateTDO({
        input: {
          id: tdoId as string,
          name: `${citestMarker}-testTDO`,
          details: {
            veritoneFile: {
              fileName: 'testTDOFileName'
            }
          }
        }
      });

      expect(get(result, 'data.updateTDO', null)).toBeDefined();
      expect(get(result, 'data.updateTDO.name', null)).toEqual(
        citestMarker + '-testTDO'
      );
    });

    it('Get recording by internal orgless token', async () => {
      const result = await orglessClient.sdk.temporalDataObjects({
        id: tdoId as string
      });

      expect(get(result, 'data.temporalDataObjects.count', null)).toEqual(1);
      expect(
        get(result, 'data.temporalDataObjects.records[0]', null)
      ).toHaveProperty('id', tdoId);
    });

    it('delete the tdoId', async () => {
      const result = await aiDataClient.sdk.deleteTDO({ id: tdoId as string });
      expect(get(result, 'data.deleteTDO.id', null)).toEqual(tdoId);
    });

    it('delete the tdoIdwithAsset', async () => {
      const result = await aiDataClient.sdk.deleteTDO({
        id: tdoIdwithAsset as string
      });
      expect(get(result, 'data.deleteTDO.id', null)).toEqual(tdoIdwithAsset);
    });

    it('delete the tdoIdNoContentType', async () => {
      if (!tdoIdNoContentType) return;
      const result = await aiDataClient.sdk.deleteTDO({
        id: tdoIdNoContentType
      });
      expect(get(result, 'data.deleteTDO.id', null)).toEqual(
        tdoIdNoContentType
      );
    });

    afterAll(async () => {
      const tdoIds = [tdoId, tdoIdwithAsset, tdoIdNoContentType].filter(
        (id): id is string => Boolean(id)
      );
      for (const id of tdoIds) {
        await safe(`delete TDO ${id}`, async () => {
          await aiDataClient.sdk.deleteTDO({ id });
        });
      }
    });
  }
);
