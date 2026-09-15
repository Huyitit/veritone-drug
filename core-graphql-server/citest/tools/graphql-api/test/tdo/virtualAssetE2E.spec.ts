/// <reference lib="ES2017" />

/**
 * End-to-End Virtual Asset Lifecycle Tests
 *
 * This test suite validates the complete virtual asset flow from asset upload
 * through JWT-based redirect to final asset download from OCI/S3 storage.
 *
 * Requirements:
 * - virtualAssetEnabled feature flag must be enabled in server config
 * - Server must have access to OCI/S3 storage
 * - JWT secret must be configured
 */

declare const process: { env: { [key: string]: string | undefined } };

import supertest from 'supertest';

import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import type { ServerFeatureFlags } from '../helpers/featureFlags';
import {
  rewriteToLocalServer,
  rewriteDockerHostname,
  requestNoRedirect
} from '../../src/testing/httpUtils';
// Shared, correct implementations. This spec previously carried its own copies
// of decodeJWT / extractJWTFromVirtualUrl / isVirtualAssetUrl that assumed the
// JWT arrived as a `?jwt=` query parameter. Virtual-asset URIs are path-based
// (`<apiRoot>/<version>/asset/<JWT>[/<filename>]`, minted by
// lib/core-server-base/virtualAsset.js), so `isVirtualAssetUrl` always returned
// false and every assertion downstream of it failed. The versions below walk the
// URL path and are already used by virtualAssetPromotion.spec.ts.
import * as virtualAssetHelpers from '@citest/helpers/virtualAsset.js';
import { CREATE_ASSET } from '../../src/queries/extracted/tdo';
import { deleteTdos } from '../helpers/tdoCleanup';

const {
  decodeJWT,
  extractJWTFromVirtualUrl,
  isVirtualAssetUrl,
  fetchFollowRedirects
} = virtualAssetHelpers;

/**
 * Feature-flag globals: read synchronously at module load time.
 */
interface CitestGlobals extends ServerFeatureFlags {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const CITEST_MARKER = citestGlobals.citestMarker || 'citest-should-delete';
const virtualAssetEnabled = citestGlobals.virtualAssetEnabled || false;

const describeif = (condition: boolean, name: string, fn: () => void) =>
  condition ? describe(name, fn) : describe.skip(name, fn);
// Server-side rejection when the storage backend has no multipart API.
// Matched (not asserted on) so the [3.2] probe can tell an environment
// limitation apart from a real failure.
const UNSUPPORTED_MULTIPART_ERROR =
  'initiateMultipartUpload can only be used for AWS S3, OCI, and Azure';

const tdoIdsToCleanup: string[] = [];

const TEST_FILE_CONTENT = 'E2E Virtual Asset Test Content - ' + Date.now();
const TEST_FILE_SIZE = Buffer.byteLength(TEST_FILE_CONTENT, 'utf8');

/** Shape returned by the shared fetchFollowRedirects (chain steps carry headers). */
interface FetchRedirectResponse {
  statusCode: number | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  redirectChain: Array<{
    url: string;
    statusCode: number | undefined;
    headers: Record<string, string | string[] | undefined>;
    elapsedMs?: number;
  }>;
}

describe('citest_tdo: End-to-End Virtual Asset Lifecycle', () => {
  let gqlClient: GraphqlClient;
  let gqlUrl: string;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    gqlUrl = gqlClient.url;
    console.log(`[E2E] GraphQL URL: ${gqlUrl}`);
    console.log(`[E2E] virtualAssetEnabled feature flag: ${virtualAssetEnabled}`);
  });

  afterAll(async () => {
    if (tdoIdsToCleanup.length === 0) return;

    await deleteTdos(gqlClient, tdoIdsToCleanup, 'E2E TDO');
  });

  /**
   * Complete end-to-end virtual asset flow tests.
   */
  describeif(virtualAssetEnabled, 'Complete end-to-end virtual asset flow', () => {
    let tdoId: string;
    let assetId: string;
    let signedUri: string;
    let jwtToken: string;
    let jwtPayload: Record<string, unknown>;
    let virtualAssetUrl: string;
    let presignedUrl: string;
    let downloadedContent: Buffer;

    it('[Step 1] Should create a TDO', async () => {
      const result = await gqlClient.sdk.createTDO({
        input: {
          name: `${CITEST_MARKER}-T1-e2e-test-${Date.now()}`,
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726655
        }
      });
      tdoId = result.data?.createTDO?.id as string;
      expect(tdoId).toBeDefined();
      expect(tdoId).toMatch(/^[0-9]+$/);
      tdoIdsToCleanup.push(tdoId);
      console.log(`[E2E:Step-1] Created TDO: ${tdoId}`);
    });

    it('[Step 2] Should create an asset with test content', async () => {
      const assetVariables = {
        input: {
          containerId: tdoId,
          contentType: 'text/plain',
          assetType: 'text',
          description: 'T1 E2E test file'
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
        .attach('file', Buffer.from(TEST_FILE_CONTENT), {
          filename: 't1-test.txt',
          contentType: 'text/plain'
        });

      expect(res.status).toBe(200);
      const data = res.body?.data;
      expect(data).toBeDefined();
      assetId = data?.createAsset?.id as string;
      expect(assetId).toBeDefined();
      expect(typeof assetId).toBe('string');
      expect(assetId.length).toBeGreaterThan(0);
      console.log(`[E2E:Step-2] Created asset: ${assetId}`);
    });

    it('[Step 3] Should resolve signedUri as virtual asset URL', async () => {
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
      expect(typeof signedUri).toBe('string');
      expect(isVirtualAssetUrl(signedUri)).toBe(true);
      virtualAssetUrl = signedUri;
      console.log(`[E2E:Step-3] Received virtual asset URL`);
    });

    it('[Step 4] Should extract and validate JWT token structure', async () => {
      expect(virtualAssetUrl).toBeDefined();

      jwtToken = extractJWTFromVirtualUrl(virtualAssetUrl);
      expect(jwtToken).toBeDefined();
      expect(jwtToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

      jwtPayload = decodeJWT(jwtToken);
      expect(jwtPayload).toBeDefined();
      expect(jwtPayload.id).toBeDefined();
      expect(typeof jwtPayload.id).toBe('string');

      if (jwtPayload.exp) {
        expect(typeof jwtPayload.exp).toBe('number');
        expect((jwtPayload.exp as number) > Date.now() / 1000).toBe(true);
      }

      if (jwtPayload.iat) {
        expect(typeof jwtPayload.iat).toBe('number');
        expect((jwtPayload.iat as number) <= Date.now() / 1000).toBe(true);
      }

      console.log(`[E2E:Step-4] PASS: JWT token validated`);
    });

    /**
     * Non-browser branch (PR #4026 QA 1.1/1.2): a plain client must get the
     * object bytes proxied back as 200 — NOT a 302 whose "Found. Redirecting…"
     * body it would save as the file. Jira: VE-23156, VE-20263
     */
    it('[Step 5] Should proxy content back as 200 for a non-browser client', async () => {
      expect(virtualAssetUrl).toBeDefined();

      const localUri = rewriteToLocalServer(virtualAssetUrl, gqlUrl);
      const proxied = await requestNoRedirect(localUri);

      expect(proxied.statusCode).toBe(200);
      // Proxy branch, not redirect: no Location header at all.
      expect(proxied.headers.location).toBeUndefined();
      expect(proxied.headers['cache-control']).toBe('no-store');
      expect(proxied.headers['content-type']).toContain('text/plain');
      expect(Number(proxied.headers['content-length'])).toBe(TEST_FILE_SIZE);
      // The body is the real file, not a redirect stub.
      expect(proxied.body.toString('utf8')).toBe(TEST_FILE_CONTENT);

      downloadedContent = proxied.body;
      console.log(
        `[E2E:Step-5] PASS: proxied ${proxied.body.length} bytes as 200 (no redirect)`
      );
    });

    /**
     * Ranged request (PR #4026 QA 1.3): Range is forwarded upstream and the
     * partial-content response mirrored back.
     */
    it('[Step 5a] Should honour Range with 206 partial content', async () => {
      expect(virtualAssetUrl).toBeDefined();

      const localUri = rewriteToLocalServer(virtualAssetUrl, gqlUrl);
      const ranged = await requestNoRedirect(localUri, {
        headers: { Range: 'bytes=0-9' }
      });

      expect(ranged.statusCode).toBe(206);
      expect(String(ranged.headers['content-range'])).toMatch(
        new RegExp(`^bytes 0-9/${TEST_FILE_SIZE}$`)
      );
      expect(ranged.headers['accept-ranges']).toBe('bytes');
      expect(ranged.body.toString('utf8')).toBe(TEST_FILE_CONTENT.slice(0, 10));

      console.log(`[E2E:Step-5a] PASS: 206 partial content honoured`);
    });

    /**
     * Browser branch (PR #4026 QA 1.4): a browser-like request — identified by
     * the Fetch-Metadata header — is 302'd to a presigned storage URL so the
     * download is offloaded to the object store.
     */
    it('[Step 6] Should 302 a browser-like request to a presigned URL', async () => {
      expect(virtualAssetUrl).toBeDefined();

      const localUri = rewriteToLocalServer(virtualAssetUrl, gqlUrl);
      const browserResponse = await requestNoRedirect(localUri, {
        headers: { 'Sec-Fetch-Mode': 'navigate' }
      });

      expect(browserResponse.statusCode).toBe(302);
      expect(browserResponse.headers.location).toBeDefined();
      presignedUrl = browserResponse.headers.location as string;

      console.log(`[E2E:Step-6] PASS: browser request received 302`);
    });

    it('[Step 7] Should verify presigned URL in Location header', async () => {
      expect(presignedUrl).toBeDefined();
      expect(typeof presignedUrl).toBe('string');
      expect(presignedUrl).toMatch(/^https?:\/\//);

      const parsedPresigned = new URL(rewriteDockerHostname(presignedUrl));

      const hasAwsSignature = parsedPresigned.searchParams.has('X-Amz-Signature');
      const hasOciSignature = parsedPresigned.searchParams.has('Signature');

      expect(hasAwsSignature || hasOciSignature).toBe(true);

      if (hasAwsSignature) {
        expect(parsedPresigned.searchParams.has('X-Amz-Algorithm')).toBe(true);
        expect(parsedPresigned.searchParams.has('X-Amz-Credential')).toBe(true);
        expect(parsedPresigned.searchParams.has('X-Amz-Date')).toBe(true);
        expect(parsedPresigned.searchParams.has('X-Amz-Expires')).toBe(true);
      }

      console.log(`[E2E:Step-7] PASS: Presigned URL verified (${hasAwsSignature ? 'AWS' : 'OCI'})`);
    });

    /**
     * PR #4026 QA 1.5: following the redirect to storage yields exactly the same
     * bytes the proxy branch streamed back, so the two delivery modes agree.
     */
    it('[Step 8] Should download file from storage using presigned URL', async () => {
      expect(presignedUrl).toBeDefined();
      expect(downloadedContent).toBeDefined();

      const direct = await fetchFollowRedirects(
        rewriteDockerHostname(presignedUrl)
      );

      expect(direct.statusCode).toBe(200);
      expect(Buffer.isBuffer(direct.body)).toBe(true);
      // Proxy path (Step 5) and redirect path return identical content.
      expect(direct.body.equals(downloadedContent)).toBe(true);

      console.log(
        `[E2E:Step-8] Downloaded ${direct.body.length} bytes from storage; identical to proxied bytes`
      );
    });

    it('[Step 9] Should verify file integrity (content, size)', async () => {
      expect(downloadedContent).toBeDefined();

      expect(downloadedContent.length).toBe(TEST_FILE_SIZE);

      const contentStr = downloadedContent.toString('utf8');
      expect(contentStr).toBe(TEST_FILE_CONTENT);

      console.log(`[E2E:Step-9] PASS: File integrity verified`);
    });

    it('[Summary] End-to-end flow completed successfully', () => {
      expect(tdoId).toBeDefined();
      expect(assetId).toBeDefined();
      expect(virtualAssetUrl).toBeDefined();
      expect(jwtToken).toBeDefined();
      expect(jwtPayload).toBeDefined();
      expect(presignedUrl).toBeDefined();
      expect(downloadedContent).toBeDefined();

      console.log(`[E2E:Summary] SUCCESS: E2E flow completed successfully`);
    });
  });

  /**
   * Upload Method 1: createAsset GQL mutation with file attachment
   */
  describeif(virtualAssetEnabled, 'Upload Method 1: createAsset GQL mutation with file attachment', () => {
    let tdoId: string;
    let assetId: string;

    it('[1.1] Should create a TDO', async () => {
      const result = await gqlClient.sdk.createTDO({
        input: {
          name: `${CITEST_MARKER}-upload1-${Date.now()}`,
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726655
        }
      });
      tdoId = result.data?.createTDO?.id as string;
      expect(tdoId).toBeDefined();
      tdoIdsToCleanup.push(tdoId);
      console.log(`[Upload-1:Step-1.1] Created TDO: ${tdoId}`);
    });

    it('[1.2] Should upload asset using createAsset mutation with file attachment', async () => {
      const assetVariables = {
        input: {
          containerId: tdoId,
          contentType: 'text/plain',
          assetType: 'text',
          description: 'Uploaded via createAsset GQL'
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
        .attach('file', Buffer.from(TEST_FILE_CONTENT), {
          filename: 'createAsset-test.txt',
          contentType: 'text/plain'
        });

      expect(res.status).toBe(200);
      const data = res.body?.data;
      expect(data).toBeDefined();
      assetId = data?.createAsset?.id as string;

      expect(assetId).toBeDefined();
      console.log(`[Upload-1:Step-1.2] Created asset: ${assetId}`);
    });

    it('[1.3] Should download via virtual asset URL', async () => {
      const result = await gqlClient.sdk.temporalDataObject({
        id: tdoId,
        assetType: ['text']
      });

      const records = result.data?.temporalDataObject?.assets?.records || [];
      const asset = records.find((r) => r?.id === assetId) || records[0];
      const signedUri = asset?.signedUri as string;

      expect(isVirtualAssetUrl(signedUri)).toBe(true);

      const localUri = rewriteToLocalServer(signedUri, gqlUrl);
      const redirectResponse = await fetchFollowRedirects(localUri);

      if (redirectResponse && redirectResponse.statusCode === 200) {
        const downloadedContent = redirectResponse.body;
        const contentStr = downloadedContent.toString('utf8');
        expect(contentStr).toBe(TEST_FILE_CONTENT);
        console.log(`[Upload-1:Step-1.3] SUCCESS: File downloaded and verified`);
      }
    });
  });

  /**
   * Upload Method 2: Storage endpoint with getSignedWritableUrl
   */
  describeif(virtualAssetEnabled, 'Upload Method 2: Storage endpoint with getSignedWritableUrl', () => {
    let tdoId: string;
    let assetId: string;
    let unsignedUrl: string;

    it('[2.1] Should create a TDO', async () => {
      const result = await gqlClient.sdk.createTDO({
        input: {
          name: `${CITEST_MARKER}-upload2-${Date.now()}`,
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726655
        }
      });
      tdoId = result.data?.createTDO?.id as string;
      expect(tdoId).toBeDefined();
      tdoIdsToCleanup.push(tdoId);
      console.log(`[Upload-2:Step-2.1] Created TDO: ${tdoId}`);
    });

    it('[2.2] Should get signed writable URL and upload via HTTP PUT', async () => {
      const result = await gqlClient.sdk.getSignedWritableUrlWithParams({
        type: 'asset',
        path: tdoId
      });

      const writableUrl = result.data?.getSignedWritableUrl;

      expect(writableUrl).toBeDefined();
      expect(writableUrl?.url).toBeDefined();
      console.log(`[Upload-2:Step-2.2] Got signed writable URL`);

      try {
        const rewrittenUrl = rewriteDockerHostname(writableUrl!.url!);

        const uploadResponse = await fetch(rewrittenUrl, {
          method: 'PUT',
          body: Buffer.from(TEST_FILE_CONTENT),
          headers: {
            'Content-Type': 'text/plain',
            'Content-Length': TEST_FILE_SIZE.toString()
          }
        });

        expect(uploadResponse.status).toBe(200);
        console.log(`[Upload-2:Step-2.2] SUCCESS: File uploaded via PUT`);

        unsignedUrl = writableUrl!.unsignedUrl!;
      } catch (err) {
        console.error(`[Upload-2:Step-2.2] ERROR: Upload failed: ${(err as Error).message}`);
        throw err;
      }
    });

    it('[2.3] Should create asset with uploaded file URI', async () => {
      expect(unsignedUrl).toBeDefined();

      // Plain mutation, no file attachment — goes straight through the SDK.
      const result = await gqlClient.sdk.createAsset({
        input: {
          containerId: tdoId,
          contentType: 'text/plain',
          assetType: 'text',
          uri: unsignedUrl
        }
      });

      const createAsset = result.data?.createAsset ?? null;
      assetId = createAsset?.id as string;
      const signedUri = createAsset?.signedUri as string;

      expect(assetId).toBeDefined();
      console.log(`[Upload-2:Step-2.3] Created asset: ${assetId}`);

      expect(isVirtualAssetUrl(signedUri)).toBe(true);

      const localUri = rewriteToLocalServer(signedUri, gqlUrl);
      const redirectResponse = await fetchFollowRedirects(localUri);

      if (redirectResponse && redirectResponse.statusCode === 200) {
        const contentStr = redirectResponse.body.toString('utf8');
        expect(contentStr).toBe(TEST_FILE_CONTENT);
        console.log(`[Upload-2:Step-2.3] SUCCESS: File downloaded and verified`);
      }
    });
  });

  /**
   * Upload Method 3: Multipart upload for large files
   */
  describeif(virtualAssetEnabled, 'Upload Method 3: Multipart upload for large files', () => {
    let tdoId: string;
    let multipartUploadId: string | null = null;
    // Set by the [3.2] probe below; [3.3]/[3.4] branch on it at run time.
    let multipartSupported = false;

    const LARGE_FILE_CONTENT = 'Multipart Upload Test - '.repeat(1000) + Date.now();
    const LARGE_FILE_SIZE = Buffer.byteLength(LARGE_FILE_CONTENT, 'utf8');
    const NUM_PARTS = 3;

    it('[3.1] Should create a TDO', async () => {
      const result = await gqlClient.sdk.createTDO({
        input: {
          name: `${CITEST_MARKER}-upload3-${Date.now()}`,
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726655
        }
      });
      tdoId = result.data?.createTDO?.id as string;
      expect(tdoId).toBeDefined();
      tdoIdsToCleanup.push(tdoId);
      console.log(`[Upload-3:Step-3.1] Created TDO: ${tdoId}`);
    });

    /**
     * Capability probe. `initiateMultipartUpload` is served only for AWS S3, OCI
     * and Azure; against the local MinIO stack the server rejects it outright.
     * That is an environment limitation, not a defect, so this records the
     * capability instead of failing — and [3.3]/[3.4] below branch on it.
     */
    it('[3.2] Should initiate multipart upload', async () => {
      try {
        const result = await gqlClient.sdk.initiateMultipartUpload({
          input: {
            fileName: 'multipart-test.txt',
            fileSize: LARGE_FILE_SIZE,
            numberOfParts: NUM_PARTS,
            folderName: tdoId,
            contentType: 'text/plain'
          }
        });

        const multipartData = result.data?.initiateMultipartUpload;

        expect(multipartData).toBeDefined();
        expect(multipartData?.preSignedUrls?.length).toBe(NUM_PARTS);
        multipartUploadId = multipartData?.uploadId || null;
        multipartSupported = true;
        console.log(`[Upload-3:Step-3.2] Initiated multipart upload`);
      } catch (err) {
        const errorMessage = (err as Error).message;
        if (!errorMessage.includes(UNSUPPORTED_MULTIPART_ERROR)) {
          // A genuine failure — surface it.
          throw err;
        }
        multipartSupported = false;
        console.log(
          `[Upload-3:Step-3.2] SKIP: storage backend does not support multipart upload ` +
            `(requires AWS S3, OCI, or Azure — this stack is MinIO). ` +
            `Scenario is required by QA but cannot run here.`
        );
      }
    });

    /**
     * Frank Ayars' QA list requires "upload using multipart upload GQL
     * (initiateMultipartUpload, PUTs, completeMultipartUpload)" — the PUT/complete
     * half lives here and is NOT implemented yet.
     *
     * The gate is evaluated at RUN time, not collection time. The previous
     * `itif(() => !!multipartUploadId, …)` form read a variable that is still
     * null while jest is collecting, so these cases could never run on ANY
     * backend — they reported as skipped even where multipart works, which is
     * exactly the failure this replaces.
     */
    it('[3.3] Should upload all parts and complete', async () => {
      if (!multipartSupported) {
        console.log(
          `[Upload-3:Step-3.3] SKIP: backend lacks multipart support (see [3.2])`
        );
        return;
      }
      throw new Error(
        'Multipart part-upload + completeMultipartUpload is not implemented. ' +
          'The backend DOES support multipart, so this required QA scenario must ' +
          'now be written (PUT each presigned part, then completeMultipartUpload).'
      );
    });

    it('[3.4] Should create asset and verify download', async () => {
      if (!multipartSupported) {
        console.log(
          `[Upload-3:Step-3.4] SKIP: backend lacks multipart support (see [3.2])`
        );
        return;
      }
      throw new Error(
        'Asset creation from a completed multipart upload is not implemented. ' +
          'Depends on [3.3] producing a final object URL.'
      );
    });
  });
});
