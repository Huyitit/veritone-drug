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

const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const virtualAssetHelpers = require('../helpers/virtualAsset.js');
const config = helpers.config;
const _ = require('lodash');

const citestMarker = global.citestMarker || 'citest-should-delete';
const virtualAssetEnabled = global.virtualAssetEnabled || false;
const describeif = (condition, ...args) => (condition ? describe(...args) : describe.skip(...args));

// Collect TDO IDs for cleanup
const tdoIdsToCleanup = [];

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
  let gqlClient;
  let gqlUrl;

  beforeAll(async () => {
    gqlClient = new GraphqlClient(config.env);
    const result = await gqlClient.connect();
    expect(result.token).toBeDefined();
    gqlUrl = gqlClient.getUrl();
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

    const BATCH = 20;
    for (let i = 0; i < tdoIdsToCleanup.length; i += BATCH) {
      const batch = tdoIdsToCleanup.slice(i, i + BATCH);
      const mutations = batch
        .map((id, idx) => `d${idx}: deleteTDO(id: "${id}") { id message }`)
        .join('\n');
      try {
        await gqlClient.query(`mutation { ${mutations} }`);
      } catch (err) {
        console.warn(`Cleanup error deleting TDOs: ${err.message}`);
      }
    }
    console.log(`After - [Promotion] Cleaned up ${tdoIdsToCleanup.length} TDOs`);
  });

  describeif(virtualAssetEnabled, 'Promotion flow: Asset in fallback bucket exists in primary', () => {
    let tdo1Id;  // TDO with asset in primary bucket (created normally)
    let tdo2Id;  // TDO with asset URI pointing to fallback bucket (for promotion test)
    let asset1Id;
    let asset2Id;
    let primaryBucketUri;
    let fallbackBucketUri;
    let signedUri;
    let virtualAssetUrl;
    let redirectResponse;
    let presignedUrl;
    let updatedAssetUri;

    it('[Step 1] Should create TDO 1 with asset in primary bucket', async () => {
      const query = `mutation {
        createTDO(input: {
          name: "${citestMarker}-promotion-tdo1-${Date.now()}"
          status: "uploaded"
          startDateTime: 1476726655
          stopDateTime: 1476726655
        }) {
          id
        }
      }`;
      const result = await gqlClient.query(query);
      tdo1Id = _.get(result, 'createTDO.id');
      expect(tdo1Id).toBeDefined();
      expect(tdo1Id).toMatch(/^[0-9]+$/);
      tdoIdsToCleanup.push(tdo1Id);
      console.log(`[Promotion:Step-1] Created TDO 1: ${tdo1Id}`);
    });

    it('[Step 2] Should create asset in TDO 1 (primary bucket)', async () => {
      const query = `mutation {
        createAsset(input: {
          containerId: "${tdo1Id}"
          contentType: "text/plain"
          assetType: "text"
          description: "Primary bucket asset for key extraction"
        }) {
          id
          uri
          signedUri
        }
      }`;

      const headers = helpers.requestOptions(gqlClient.userToken).headers;
      const res = await helpers
        .supertest(gqlUrl)
        .post('')
        .set(headers)
        .field('query', query)
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
      
      let bucketName;
      let objectKey;
      
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
      const isLocalEnv = gqlUrl.includes('localhost') || gqlUrl.includes('127.0.0.1');
      const fallbackBucketName = isLocalEnv ? 'aiware' : 'veritone-aiware-430-fallback-us-east-1';
      
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
      
      const query = `mutation {
        createTDOWithAsset(
          input: {
            name: "${citestMarker}-promotion-tdo2-${Date.now()}"
            contentType: "text/plain"
            assetType: "text"
            startDateTime: 1476726655
            stopDateTime: 1476726655
            uri: "${fallbackBucketUri}"
          }
        ) {
          id
          assets {
            records {
              id
              uri
              signedUri
            }
          }
        }
      }`;
      
      const result = await gqlClient.query(query);
      tdo2Id = _.get(result, 'createTDOWithAsset.id');
      const assets = _.get(result, 'createTDOWithAsset.assets.records', []);
      
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
      const query = `query {
        temporalDataObject(id: "${tdo2Id}") {
          id
          assets(assetType: "text") {
            records {
              id
              signedUri
              contentType
              uri
            }
          }
        }
      }`;
      const result = await gqlClient.query(query);
      const records = _.get(result, 'temporalDataObject.assets.records', []);
      expect(records.length).toBeGreaterThan(0);

      const asset = records.find((r) => r.id === asset2Id) || records[0];
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
      
      redirectResponse = await fetchFollowRedirects(localUri);
      
      expect(redirectResponse).toBeDefined();
      expect(redirectResponse.redirectChain).toBeDefined();
      expect(redirectResponse.redirectChain.length).toBeGreaterThan(0);
      
      const firstRedirect = redirectResponse.redirectChain[0];
      
      expect(firstRedirect.statusCode).toBe(302);
      expect(firstRedirect.headers.location).toBeDefined();
      
      presignedUrl = firstRedirect.headers.location;
      
      expect(presignedUrl).toBeDefined();
      expect(typeof presignedUrl).toBe('string');
      
      console.log(`[Promotion:Step-7] Received redirect (${redirectResponse.redirectChain.length} redirect(s))`);
      console.log(`[Promotion:Step-7] Location: ${presignedUrl.substring(0, 100)}...`);
    });

    it('[Step 8] Should verify database recording_asset.uri was promoted to primary', async () => {
      expect(presignedUrl).toBeDefined();
      const query = `query {
        temporalDataObject(id: "${tdo2Id}") {
          id
          assets(assetType: "text") {
            records {
              id
              uri
            }
          }
        }
      }`;
      
      const result = await gqlClient.query(query);
      const records = _.get(result, 'temporalDataObject.assets.records', []);
      expect(records.length).toBeGreaterThan(0);
      
      const asset = records.find((r) => r.id === asset2Id) || records[0];
      updatedAssetUri = asset.uri;
      
      expect(updatedAssetUri).toBeDefined();
      
      const wasPromoted = updatedAssetUri !== fallbackBucketUri;
      
      if (wasPromoted) {
        console.log(`[Promotion:Step-8] SUCCESS: URI promoted from fallback to primary now points to: ${updatedAssetUri}`);
      } else {
        console.log(`[Promotion:Step-8] WARNING: URI still points to fallback (promotion did not occur)`);
        throw err;
      }

    });

    it('[Step 9] Should verify file integrity from promoted location', async () => {
      expect(redirectResponse).toBeDefined();
      expect(redirectResponse.statusCode).toBe(200);
      
      const downloadedContent = redirectResponse.body;
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
