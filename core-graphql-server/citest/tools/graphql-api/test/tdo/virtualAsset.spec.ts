/// <reference lib="ES2017" />

/**
 * Virtual Asset CI Test
 *
 * Both cases require the `virtualAssetEnabled` feature flag to be enabled
 * on the server. When the flag is off, all tests in this file are skipped
 * (via `describeif`). The flag is set in `graphql.json` / `local_ci_server.json`
 * and read at startup by the server into `featureFlags.virtualAssetEnabled`.
 *
 * Case 1: Create TDO with asset → query signedUri → follow the virtual-asset
 *   redirect → download content.
 *
 * Case 2: Verify the signedUri is a virtual-asset JWT URL (not a raw
 *   presigned URL) when the feature flag is on.
 *
 * Cleanup: all TDOs created during the test are deleted in afterAll.
 */

declare const process: { env: { [key: string]: string | undefined } };

import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import supertest from 'supertest';
import type { ServerFeatureFlags } from '../helpers/featureFlags';
import {
  rewriteToLocalServer,
  rewriteDockerHostname,
  fetchFollowRedirects,
  headRequest
} from '../../src/testing/httpUtils';
import { CREATE_ASSET } from '../../src/queries/extracted/tdo';
import { deleteTdos } from '../helpers/tdoCleanup';

/**
 * Feature-flag globals: read synchronously at module load time.
 */
interface CitestGlobals extends ServerFeatureFlags {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';
const virtualAssetEnabled = citestGlobals.virtualAssetEnabled || false;

/** Conditionally run describe blocks based on a condition. */
const describeif = (condition: boolean, name: string, fn: () => void) =>
  condition ? describe(name, fn) : describe.skip(name, fn);

/** Collect TDO IDs for cleanup. */
const tdoIdsToCleanup: string[] = [];

describe('citest_tdo: virtual asset resolution', () => {
  let gqlClient: GraphqlClient;
  let gqlUrl: string;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    gqlUrl = gqlClient.url;
  });

  afterAll(async () => {
    try {
      await deleteTdos(gqlClient, tdoIdsToCleanup);
    } catch (err) {
      console.error(
        `Cleanup failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  /** ====================================================================
   * Case 1: Basic virtual asset → download content
   * Requires virtualAssetEnabled feature flag on the server.
   * ==================================================================== */
  describeif(
    virtualAssetEnabled,
    'Case 1: create TDO + asset, resolve signedUri, download content',
    () => {
      let tdoId: string;
      let assetId: string;
      let signedUri: string;

      it('should create a TDO', async () => {
        const result = await gqlClient.sdk.createTDO({
          input: {
            name: `${citestMarker}-virtual-asset-test-${Date.now()}`,
            status: 'uploaded',
            startDateTime: 1476726655,
            stopDateTime: 1476726655
          }
        });
        tdoId = result.data?.createTDO?.id as string;
        expect(tdoId).toBeDefined();
        tdoIdsToCleanup.push(tdoId);
      });

      it('should create an asset with multipart upload', async () => {
        const assetVariables = {
          input: {
            containerId: tdoId,
            contentType: 'text/plain',
            assetType: 'text',
            description: 'virtual asset citest file'
          }
        };

        const headers: Record<string, string> = {
          Authorization: `Bearer ${gqlClient.sessionToken}`
        };

        const res = await supertest(gqlUrl)
          .post('')
          .set(headers)
          .field('query', CREATE_ASSET)
          .field('variables', JSON.stringify(assetVariables))
          .attach('file', Buffer.from('Hello, virtual asset!'), {
            filename: 'hello.txt',
            contentType: 'text/plain'
          });

        expect(res.status).toBe(200);

        const data = res.body?.data;
        expect(data).toBeDefined();
        assetId = data?.createAsset?.id as string;
        expect(assetId).toBeDefined();
        expect(data?.createAsset?.uri).toBeDefined();
      });

      it('should resolve signedUri on the asset', async () => {
        const result = await gqlClient.sdk.temporalDataObject({
          id: tdoId,
          assetType: ['text']
        });

        const records = result.data?.temporalDataObject?.assets?.records || [];
        expect(records.length).toBeGreaterThan(0);

        const asset = records.find((r) => r?.id === assetId) || records[0];
        signedUri = asset?.signedUri as string;
        expect(signedUri).toBeDefined();
        expect(signedUri).toBeTruthy();
      });

      it('should download content from the signedUri', async () => {
        expect(signedUri).toBeDefined();

        // The virtual-asset URL may point to apiRoot (external host).
        // Rewrite it to the local server so we can actually reach the
        // /asset/:virtualAssetId route.
        const localUri = rewriteToLocalServer(signedUri, gqlUrl);
        const response = await fetchFollowRedirects(localUri);
        expect(response.statusCode).toBe(200);
        const body = response.body.toString('utf8');
        expect(body).toContain('Hello, virtual asset!');
      });

      /**
       * VE-26428: HEAD on a virtual-asset URL must be answered server-side with
       * the storage object's metadata — as if the caller HEAD'd the object
       * directly. No 302 (a redirect would hand out a URL the follow-up HEAD
       * can't use — the method is part of the presigned signature), and the
       * content-length must match the stored object.
       */
      it('should answer HEAD with the storage object metadata (no redirect)', async () => {
        expect(signedUri).toBeDefined();

        const localUri = rewriteToLocalServer(signedUri, gqlUrl);
        const response = await headRequest(localUri);

        expect(response.statusCode).toBe(200);
        const contentLength = Number(response.headers['content-length']);
        expect(contentLength).toBe(Buffer.byteLength('Hello, virtual asset!'));
        // The stateful endpoint stamps its responses (VE-26428).
        expect(response.headers['veritone-virtual-asset']).toBe('true');
      });

      /**
       * The GET above populates the cached GET-signed URL in redis; HEAD must
       * still succeed afterwards (it is served from that same cached URL via a
       * 1-byte ranged GET — the range probe must not break on a cache hit).
       */
      it('should answer HEAD correctly after the GET populated the signed-URL cache', async () => {
        expect(signedUri).toBeDefined();

        const localUri = rewriteToLocalServer(signedUri, gqlUrl);
        const response = await headRequest(localUri);

        expect(response.statusCode).toBe(200);
      });
    }
  );

  /** ====================================================================
   * Case 2: Verify virtual-asset URI shape
   *
   * When virtualAssetEnabled is true, signedUri should be a JWT-based
   * virtual asset URL (containing /asset/) rather than a raw presigned
   * S3/MinIO URL. This validates the feature flag is wired correctly
   * end-to-end.
   * ==================================================================== */
  describeif(
    virtualAssetEnabled,
    'Case 2: signedUri is a virtual-asset JWT URL',
    () => {
      let tdoId: string;
      let assetId: string;

      it('should create a TDO', async () => {
        const result = await gqlClient.sdk.createTDO({
          input: {
            name: `${citestMarker}-virtual-shape-test-${Date.now()}`,
            status: 'uploaded',
            startDateTime: 1476726655,
            stopDateTime: 1476726655
          }
        });
        tdoId = result.data?.createTDO?.id as string;
        expect(tdoId).toBeDefined();
        tdoIdsToCleanup.push(tdoId);
      });

      it('should upload an asset', async () => {
        const assetVariables = {
          input: {
            containerId: tdoId,
            contentType: 'text/plain',
            assetType: 'text',
            description: 'shape test file'
          }
        };

        const headers: Record<string, string> = {
          Authorization: `Bearer ${gqlClient.sessionToken}`
        };

        const res = await supertest(gqlUrl)
          .post('')
          .set(headers)
          .field('query', CREATE_ASSET)
          .field('variables', JSON.stringify(assetVariables))
          .attach('file', Buffer.from('Shape test content'), {
            filename: 'shape.txt',
            contentType: 'text/plain'
          });

        expect(res.status).toBe(200);

        const data = res.body?.data;
        expect(data).toBeDefined();
        assetId = data?.createAsset?.id as string;
        expect(assetId).toBeDefined();
      });

      it('should return a virtual-asset URL (contains /asset/ path), not a raw presigned URL', async () => {
        const result = await gqlClient.sdk.temporalDataObject({
          id: tdoId,
          assetType: ['text']
        });

        const records = result.data?.temporalDataObject?.assets?.records || [];
        expect(records.length).toBeGreaterThan(0);

        const asset = records.find((r) => r?.id === assetId) || records[0];
        const signedUri = asset?.signedUri as string;
        expect(signedUri).toBeDefined();

        // Virtual asset URLs contain "/asset/" followed by a JWT token.
        // Raw presigned URLs would contain bucket/key and X-Amz-Signature params.
        const parsedUri = new URL(signedUri);
        expect(parsedUri.pathname).toMatch(/\/asset\//);
        // Should NOT have S3 presign query params
        expect(parsedUri.searchParams.has('X-Amz-Signature')).toBe(false);
      });

      it('should be downloadable via the virtual-asset redirect', async () => {
        const result = await gqlClient.sdk.temporalDataObject({
          id: tdoId,
          assetType: ['text']
        });

        const records = result.data?.temporalDataObject?.assets?.records || [];
        const asset = records.find((r) => r?.id === assetId) || records[0];
        const signedUri = asset?.signedUri as string;

        const localUri = rewriteToLocalServer(signedUri, gqlUrl);
        const response = await fetchFollowRedirects(localUri);
        expect(response.statusCode).toBe(200);
        const body = response.body.toString('utf8');
        expect(body).toContain('Shape test content');
      });
    }
  );
});
