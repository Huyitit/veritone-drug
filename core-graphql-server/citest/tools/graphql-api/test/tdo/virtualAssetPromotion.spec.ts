/**
 * Asset Promotion Test: Fallback → Primary Bucket Promotion
 *
 * This test validates the asset promotion flow where an asset stored in a
 * fallback bucket (e.g., AWS S3 or MinIO) is detected in the primary bucket
 * (e.g., OCI) and the database record (recording_asset.uri) is automatically
 * updated.
 *
 * Cloud Migration Scenario (QA Test Case 8):
 * 1. An asset exists in both fallback (AWS S3/MinIO) and primary (OCI) buckets
 * 2. The database record (recording_asset.uri) references the fallback bucket
 * 3. A client requests the asset via virtual asset URL
 * 4. The system performs a HEAD check on the primary bucket
 * 5. Finding it exists in primary, the system:
 *    a) Returns a presigned URL for the primary bucket
 *    b) Updates recording_asset.uri to reference the primary bucket (promotion)
 *
 * Requirements:
 * - virtualAssetEnabled feature flag must be enabled
 * - Fallback bucket configuration must be set up
 * - Primary and fallback storage backends must be accessible
 * - Database write access for updateAssetUri
 */

import supertest from 'supertest';
import helpers from '@citest/helpers/index.js';
import * as virtualAssetHelpers from '@citest/helpers/virtualAsset.js';
import { requestNoRedirect } from '@api/src/testing/httpUtils';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '@api/src/graphqlUtil';
import { CREATE_ASSET } from '@api/src/queries/extracted/tdo';
import { deleteTdos } from '@api/test/helpers/tdoCleanup';
import type { ServerFeatureFlags } from '@api/test/helpers/featureFlags';
import _ from 'lodash';

/**
 * Feature-flag and marker globals, read synchronously at module load so
 * `describeif` sees real values at collection time and the file stays free of
 * top-level await (which ts-jest cannot compile to CommonJS).
 */
interface CitestGlobals extends ServerFeatureFlags {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';
const virtualAssetEnabled = citestGlobals.virtualAssetEnabled || false;
const describeif = (condition: boolean, ...args: Parameters<typeof describe>) =>
  condition ? describe(...args) : describe.skip(...args);

// Collect TDO IDs for cleanup
const tdoIdsToCleanup: string[] = [];

// Test file content
const TEST_FILE_CONTENT = 'Asset Promotion Test Content - ' + Date.now();
const TEST_FILE_SIZE = Buffer.byteLength(TEST_FILE_CONTENT, 'utf8');

// Destructure helper functions for convenience
const {
  decodeJWT,
  extractJWTFromVirtualUrl,
  serverBaseUrl,
  rewriteToLocalServer,
  rewriteDockerHostname,
  isVirtualAssetUrl,
  hasPresignedParams,
  fetchFollowRedirects,
  calculateChecksum
} = virtualAssetHelpers;

describe('citest_tdo: Asset Promotion: Fallback → Primary Bucket', () => {
  let gqlClient: GraphqlClient;
  let gqlUrl: string;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();
    gqlUrl = gqlClient.url;
    console.log(`Before - [Promotion] GraphQL URL: ${gqlUrl}`);
    console.log(`Before - [Promotion] virtualAssetEnabled feature flag: ${virtualAssetEnabled}`);

    if (!virtualAssetEnabled) {
      console.log('Before - [Promotion] WARNING: virtualAssetEnabled is DISABLED');
      console.log('Before - [Promotion] WARNING: This test requires virtual assets to be enabled');
      console.log('Before - [Promotion] WARNING: All promotion tests will be skipped');
    }
  });

  afterAll(async () => {
    // Clean up all TDOs
    if (tdoIdsToCleanup.length === 0) return;

    await deleteTdos(gqlClient, tdoIdsToCleanup, 'Promotion TDO');
  });

  describeif(virtualAssetEnabled, 'Promotion flow: Asset in fallback bucket exists in primary', () => {
    let tdo1Id: string;  // TDO with asset in primary bucket (created normally)
    let tdo2Id: string;  // TDO with asset URI pointing to fallback bucket (for promotion test)
    let asset1Id: string;
    let asset2Id: string;
    let primaryBucketUri: string;
    let fallbackBucketUri: string;
    let signedUri: string;
    let virtualAssetUrl: string;
    let redirectResponse: Record<string, any>;
    let presignedUrl: string;
    let updatedAssetUri: string;

    it('[Step 1] Should create TDO 1 with asset in primary bucket', async () => {
      const result = await gqlClient.sdk.createTDO({
        input: {
          name: `${citestMarker}-promotion-tdo1-${Date.now()}`,
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726655
        }
      });
      tdo1Id = _.get(result, 'data.createTDO.id', null);
      expect(tdo1Id).toBeDefined();
      expect(tdo1Id).toMatch(/^[0-9]+$/);
      tdoIdsToCleanup.push(tdo1Id);
      console.log(`[Promotion:Step-1] Created TDO 1: ${tdo1Id}`);
    });

    it('[Step 2] Should create asset in TDO 1 (primary bucket)', async () => {
      const assetVariables = {
        input: {
          containerId: tdo1Id,
          contentType: 'text/plain',
          assetType: 'text',
          description: 'Primary bucket asset for key extraction'
        }
      };

      const headers = helpers.requestOptions(gqlClient.sessionToken).headers;
      const res = await supertest(gqlUrl)
        .post('')
        .set(headers)
        .field('query', CREATE_ASSET)
        .field('variables', JSON.stringify(assetVariables))
        .attach('file', Buffer.from(TEST_FILE_CONTENT), {
          filename: 'promotion-test.txt',
          contentType: 'text/plain'
        })
        .expect(200);

      const data = _.get(res, 'body.data');
      expect(data).toBeDefined();
      asset1Id = _.get(data, 'createAsset.id');
      primaryBucketUri = _.get(data, 'createAsset.uri');

      expect(asset1Id).toBeDefined();
      expect(primaryBucketUri).toBeDefined();

      console.log(`[Promotion:Step-2] Created asset 1: ${asset1Id}`);
      console.log(`[Promotion:Step-2] Primary bucket URI: ${primaryBucketUri}`);
    });

    it('[Step 3] Should parse primary URI and construct fallback URI', async () => {
      expect(primaryBucketUri).toBeDefined();

      const parsedUri = new URL(primaryBucketUri);
      const pathParts = parsedUri.pathname.split('/').filter(Boolean);

      let bucketName: string;
      let objectKey: string;

      if (parsedUri.hostname.includes('s3') || parsedUri.hostname.includes('amazonaws')) {
        // AWS S3 - bucket may be in hostname or path
        const s3pos = parsedUri.hostname.indexOf('.s3.');
        if (s3pos > 0) {
          // Virtual-hosted style: https://bucket.s3.region.amazonaws.com/key
          bucketName = parsedUri.hostname.substring(0, s3pos);
          objectKey = pathParts.join('/');
        } else {
          // Path style: https://s3.region.amazonaws.com/bucket/key
          bucketName = pathParts[0];
          objectKey = pathParts.slice(1).join('/');
        }
      } else if (parsedUri.hostname.includes('objectstorage') || parsedUri.hostname.includes('oraclecloud')) {
        // OCI S3-compatible format: https://ns.compat.objectstorage.region.oraclecloud.com/bucket/key
        // Bucket is first path component, key is the rest
        bucketName = pathParts[0];
        objectKey = pathParts.slice(1).join('/');
      } else {
        // Generic fallback
        bucketName = pathParts[0];
        objectKey = pathParts.slice(1).join('/');
      }

      expect(bucketName).toBeDefined();
      expect(objectKey).toBeDefined();

      // MinIO fallback bucket for local testing, AWS S3 for remote environments
      // Case 8
      //
      // Locally this MUST differ from the primary bucket (`aiware`, per
      // Step 2's URI). It previously read 'aiware', making the "fallback" URI
      // byte-identical to the primary one — so there was nothing to promote and
      // presignUrl matched it as a primary bucket, skipping the fallback branch
      // entirely. `aiware-fallback` is created by scripts/init-buckets.sh and is
      // intentionally absent from s3.buckets, so it only resolves via
      // fallbackMap (declared on the `aiware` bucket in runall/config/graphql.json).
      const isLocalEnv = gqlUrl.includes('localhost') || gqlUrl.includes('127.0.0.1');
      const fallbackBucketName = isLocalEnv
        ? 'aiware-fallback'
        : 'veritone-aiware-430-fallback-us-east-1';

      // Construct fallback URI based on environment
      if (isLocalEnv) {
        // MinIO local endpoint (proxied through nginx on port 8080)
        fallbackBucketUri = `http://minio:9000/${fallbackBucketName}/${objectKey}`;
      } else {
        // AWS S3 fallback bucket for remote environments
        fallbackBucketUri = `https://s3.amazonaws.com/${fallbackBucketName}/${objectKey}`;
      }

      console.log(`[Promotion:Step-3] Environment: ${isLocalEnv ? 'local' : 'remote'}`);
      console.log(`[Promotion:Step-3] Extracted bucket: ${bucketName}`);
      console.log(`[Promotion:Step-3] Extracted key: ${objectKey}`);
      console.log(`[Promotion:Step-3] Fallback bucket: ${fallbackBucketName}`);
      console.log(`[Promotion:Step-3] Fallback URI: ${fallbackBucketUri}`);
    });

    it('[Step 4] Should create TDO 2 with asset using fallback bucket URI', async () => {
      expect(fallbackBucketUri).toBeDefined();

      const result = await gqlClient.sdk.createTDOWithAsset({
        input: {
          name: `${citestMarker}-promotion-tdo2-${Date.now()}`,
          contentType: 'text/plain',
          assetType: 'text',
          startDateTime: 1476726655,
          stopDateTime: 1476726655,
          uri: fallbackBucketUri
        }
      });
      tdo2Id = _.get(result, 'data.createTDOWithAsset.id', null);
      const assets = _.get(
        result,
        'data.createTDOWithAsset.assets.records',
        []
      );

      expect(tdo2Id).toBeDefined();
      expect(tdo2Id).toMatch(/^[0-9]+$/);
      expect(assets.length).toBeGreaterThan(0);

      const asset = assets[0];
      asset2Id = asset.id;
      const assetUri = asset.uri;

      expect(asset2Id).toBeDefined();
      expect(assetUri).toBe(fallbackBucketUri);

      tdoIdsToCleanup.push(tdo2Id);

      console.log(`[Promotion:Step-4] Created TDO 2: ${tdo2Id}`);
      console.log(`[Promotion:Step-4] Created asset 2: ${asset2Id}`);
    });

    it('[Step 5] Should query TDO 2 asset and receive virtual asset URL', async () => {
      const result = await gqlClient.sdk.temporalDataObject({
        id: tdo2Id,
        assetType: ['text']
      });
      const records = _.get(
        result,
        'data.temporalDataObject.assets.records',
        []
      );
      expect(records.length).toBeGreaterThan(0);

      const asset = records.find((r: Record<string, any>) => r.id === asset2Id) || records[0];
      signedUri = asset.signedUri;

      expect(signedUri).toBeDefined();
      expect(signedUri).toBeTruthy();
      expect(typeof signedUri).toBe('string');

      expect(isVirtualAssetUrl(signedUri)).toBe(true);
      virtualAssetUrl = signedUri;
      console.log(`[Promotion:Step-5] Received virtual asset URL for TDO 2`);
    });

    it('[Step 6] Should extract and validate JWT token structure', async () => {
      expect(virtualAssetUrl).toBeDefined();

      const jwtToken = extractJWTFromVirtualUrl(virtualAssetUrl);
      expect(jwtToken).toBeDefined();
      expect(jwtToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

      const jwtPayload = decodeJWT(jwtToken);
      expect(jwtPayload).toBeDefined();
      expect(jwtPayload.id).toBeDefined();

      console.log(`[Promotion:Step-6] PASS: JWT token validated (ID: ${jwtPayload.id})`);
    });

    it('[Step 7] Should follow virtual asset URL and trigger promotion', async () => {

      expect(virtualAssetUrl).toBeDefined();

      const localUri = rewriteToLocalServer(virtualAssetUrl, gqlUrl);

      // Follow the URL as a browser would. Without the Fetch-Metadata header the
      // route classifies this Node client as non-browser and proxies the object
      // back as 200 instead of 302-ing to a presigned URL (VE-23156/VE-20263), so
      // the redirect assertion below could never hold. Contract: PR #4026 QA 1.4.
      // Either path triggers the promotion HEAD-check; the redirect is used here
      // because Step 8 needs the presigned URL itself.
      redirectResponse = await requestNoRedirect(localUri, {
        headers: { 'Sec-Fetch-Mode': 'navigate' }
      });

      expect(redirectResponse).toBeDefined();
      expect(redirectResponse.statusCode).toBe(302);
      expect(redirectResponse.headers.location).toBeDefined();

      presignedUrl = redirectResponse.headers.location;

      expect(presignedUrl).toBeDefined();
      expect(typeof presignedUrl).toBe('string');

      console.log(`[Promotion:Step-7] Received 302 to presigned storage URL`);
      console.log(`[Promotion:Step-7] Location: ${presignedUrl.substring(0, 100)}...`);
    });

    it('[Step 8] Should verify database recording_asset.uri was promoted to primary', async () => {
      expect(presignedUrl).toBeDefined();
      const result = await gqlClient.sdk.temporalDataObject({
        id: tdo2Id,
        assetType: ['text']
      });
      const records = _.get(
        result,
        'data.temporalDataObject.assets.records',
        []
      );
      expect(records.length).toBeGreaterThan(0);

      const asset = records.find((r: Record<string, any>) => r.id === asset2Id) || records[0];
      updatedAssetUri = asset.uri;

      expect(updatedAssetUri).toBeDefined();

      const wasPromoted = updatedAssetUri !== fallbackBucketUri;

      if (wasPromoted) {
        console.log(`[Promotion:Step-8] SUCCESS: URI promoted from fallback to primary now points to: ${updatedAssetUri}`);
      } else {
        console.log(`[Promotion:Step-8] WARNING: URI still points to fallback (promotion did not occur)`);
        throw new Error('Promotion did not occur');
      }

    });

    it('[Step 9] Should verify file integrity from promoted location', async () => {
      expect(presignedUrl).toBeDefined();

      // Step 7 stops at the 302, so fetch the storage object itself here. The
      // presigned URL names the docker-internal MinIO host, which the test runner
      // reaches through the nginx /minio proxy (signature-preserving).
      const storageResponse = await fetchFollowRedirects(
        rewriteDockerHostname(presignedUrl)
      );
      expect(storageResponse.statusCode).toBe(200);

      const downloadedContent = storageResponse.body;
      expect(downloadedContent).toBeDefined();
      expect(Buffer.isBuffer(downloadedContent)).toBe(true);

      expect(downloadedContent.length).toBe(TEST_FILE_SIZE);

      const contentStr = downloadedContent.toString('utf8');
      expect(contentStr).toBe(TEST_FILE_CONTENT);

      const checksum = calculateChecksum(downloadedContent);
      const expectedChecksum = calculateChecksum(Buffer.from(TEST_FILE_CONTENT));
      expect(checksum).toBe(expectedChecksum);

      console.log(`[Promotion:Step-9] PASS: File integrity verified (${downloadedContent.length} bytes, checksum: ${checksum})`);
      console.log(`[Promotion:Step-9] INFO: File downloaded from primary bucket after promotion`);
    });

    it('[Summary] Promotion flow completed successfully', () => {
      expect(tdo1Id).toBeDefined();
      expect(tdo2Id).toBeDefined();
      expect(asset1Id).toBeDefined();
      expect(asset2Id).toBeDefined();
      expect(primaryBucketUri).toBeDefined();
      expect(fallbackBucketUri).toBeDefined();
      expect(virtualAssetUrl).toBeDefined();
      expect(presignedUrl).toBeDefined();
      expect(updatedAssetUri).toBeDefined();

      const wasPromoted = updatedAssetUri !== fallbackBucketUri;

      if (wasPromoted) {
        console.log(`[Promotion:Summary] SUCCESS: Asset promotion completed`);
      } else {
        console.log(`[Promotion:Summary] WARNING: Promotion did not occur (feature may not be implemented)`);
        throw new Error('Promotion did not occur');
      }
    });
  });
});
