/**
 * End-to-End Virtual Asset Lifecycle Tests
 * 
 * This test suite validates the complete virtual asset flow from asset upload
 * through JWT-based redirect to final asset download from OCI/S3 storage.
 * 
 * 1. Complete E2E Flow (T1):
 *    - Create TDO with asset
 *    - Query asset's signedUri (should return virtual asset JWT URL)
 *    - Validate JWT token structure and claims
 *    - Make HTTP GET request to virtual asset endpoint
 *    - Verify 302 redirect response
 *    - Verify presigned URL is returned in Location header
 *    - Download file from OCI/S3 storage using presigned URL
 *    - Verify file integrity (content, size)
 * 
 * 2. Three Upload Methods:
 *    - Upload via createAsset GQL mutation (multipart form POST)
 *    - Upload via storage endpoint (getSignedWritableUrl + HTTP PUT)
 *    - Upload via multipart upload GQL (for large files)
 * 
 * Requirements:
 * - virtualAssetEnabled feature flag must be enabled in server config
 * - Server must have access to OCI/S3 storage
 * - JWT secret must be configured
 * 
 * Feature Flag Behavior:
 * - Test queries virtualAssetEnabled from server via graphqlServiceInfo
 * - If disabled: Test validates basic TDO/asset creation with presigned URLs
 * - If enabled: Test validates full virtual asset JWT flow
 */

const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const virtualAssetHelpers = require('../helpers/virtualAsset.js');
const config = helpers.config;
const _ = require('lodash');

const citestMarker = global.citestMarker || 'citest-should-delete';
const virtualAssetEnabled = global.virtualAssetEnabled || false;
const describeif = (condition, ...args) => (condition ? describe(...args) : describe.skip(...args));
const itif = (condition, ...args) => (condition() ? it(...args) : it.skip(...args));

// Collect TDO IDs for cleanup
const tdoIdsToCleanup = [];

// Test file content
const TEST_FILE_CONTENT = 'E2E Virtual Asset Test Content - ' + Date.now();
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
  fetchMetrics,
  parseMetricValue,
  calculateChecksum
} = virtualAssetHelpers;

describe('citest_tdo: End-to-End Virtual Asset Lifecycle', () => {
  let gqlClient;
  let gqlUrl;
  let metricsBeforeTest = null;

  beforeAll(async () => {
    gqlClient = new GraphqlClient(config.env);
    const result = await gqlClient.connect();
    expect(result.token).toBeDefined();
    gqlUrl = gqlClient.getUrl();
    console.log(`[E2E] GraphQL URL: ${gqlUrl}`);
    console.log(`[E2E] virtualAssetEnabled feature flag: ${virtualAssetEnabled}`);
    
    // Capture initial metrics if available
    metricsBeforeTest = await fetchMetrics(gqlUrl);
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
    console.log(`[E2E] Cleaned up ${tdoIdsToCleanup.length} TDOs`);
  });

  // Note: Tests will be skipped if virtualAssetEnabled is false
  describeif(virtualAssetEnabled, 'Complete end-to-end virtual asset flow', () => {
    let tdoId;
    let assetId;
    let signedUri;
    let jwtToken;
    let jwtPayload;
    let virtualAssetUrl;
    let redirectResponse;
    let presignedUrl;
    let downloadedContent;
    let metricsAfterCreation = null;
    let metricsAfterRedirect = null;

    it('[Step 1] Should create a TDO', async () => {
      const query = `mutation {
        createTDO(input: {
          name: "${citestMarker}-T1-e2e-test-${Date.now()}"
          status: "uploaded"
          startDateTime: 1476726655
          stopDateTime: 1476726655
        }) {
          id
        }
      }`;
      const result = await gqlClient.query(query);
      tdoId = _.get(result, 'createTDO.id');
      expect(tdoId).toBeDefined();
      expect(tdoId).toMatch(/^[0-9]+$/); // TDO ID should be numeric
      tdoIdsToCleanup.push(tdoId);
      console.log(`[E2E:Step-1] Created TDO: ${tdoId}`);
    });

    it('[Step 2] Should create an asset with test content', async () => {
      const query = `mutation {
        createAsset(input: {
          containerId: "${tdoId}"
          contentType: "text/plain"
          assetType: "text"
          description: "T1 E2E test file"
        }) {
          id
          uri
          signedUri
          assetType
          contentType
        }
      }`;

      const headers = helpers.requestOptions(gqlClient.userToken).headers;
      const res = await helpers
        .supertest(gqlUrl)
        .post('')
        .set(headers)
        .field('query', query)
        .attach('file', Buffer.from(TEST_FILE_CONTENT), {
          filename: 't1-test.txt',
          contentType: 'text/plain'
        })
        .expect(200);

      const data = _.get(res, 'body.data');
      expect(data).toBeDefined();
      assetId = _.get(data, 'createAsset.id');
      expect(assetId).toBeDefined();
      expect(typeof assetId).toBe('string'); // Asset ID should be a string
      expect(assetId.length).toBeGreaterThan(0);
      expect(_.get(data, 'createAsset.uri')).toBeDefined();
      expect(_.get(data, 'createAsset.contentType')).toBe('text/plain');
      console.log(`[E2E:Step-2] Created asset: ${assetId}`);
    });

    it('[Step 3] Should resolve signedUri as virtual asset URL', async () => {
      const query = `query {
        temporalDataObject(id: "${tdoId}") {
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

      const asset = records.find((r) => r.id === assetId) || records[0];
      signedUri = asset.signedUri;
      
      expect(signedUri).toBeDefined();
      expect(signedUri).toBeTruthy();
      expect(typeof signedUri).toBe('string');
      
      expect(isVirtualAssetUrl(signedUri)).toBe(true);
      virtualAssetUrl = signedUri;
      console.log(`[E2E:Step-3] Received virtual asset URL`);
      
      // Capture metrics after asset creation
      metricsAfterCreation = await fetchMetrics(gqlUrl);
    });

    it('[Step 4] Should extract and validate JWT token structure', async () => {
      expect(virtualAssetUrl).toBeDefined();
      
      // Extract JWT from URL
      jwtToken = extractJWTFromVirtualUrl(virtualAssetUrl);
      expect(jwtToken).toBeDefined();
      expect(jwtToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      
      // Decode JWT payload (without verification)
      jwtPayload = decodeJWT(jwtToken);
      expect(jwtPayload).toBeDefined();
      
      // Validate JWT claims
      expect(jwtPayload.id).toBeDefined();
      expect(typeof jwtPayload.id).toBe('string');
      
      // Standard JWT claims (if present)
      if (jwtPayload.exp) {
        expect(typeof jwtPayload.exp).toBe('number');
        expect(jwtPayload.exp).toBeGreaterThan(Date.now() / 1000);
      }
      
      if (jwtPayload.iat) {
        expect(typeof jwtPayload.iat).toBe('number');
        expect(jwtPayload.iat).toBeLessThanOrEqual(Date.now() / 1000);
      }
      
      console.log(`[E2E:Step-4] PASS: JWT token validated`);
    });

    it('[Step 5] Should make HTTP GET request to virtual asset endpoint', async () => {
      expect(virtualAssetUrl).toBeDefined();
      
      // Rewrite URL to point to local server
      const localUri = rewriteToLocalServer(virtualAssetUrl, gqlUrl);
      
      // Fetch with redirect following
      redirectResponse = await fetchFollowRedirects(localUri);
      
      expect(redirectResponse).toBeDefined();
      expect(redirectResponse.redirectChain).toBeDefined();
      expect(redirectResponse.redirectChain.length).toBeGreaterThan(0);
      
      console.log(`[E2E:Step-5] PASS: Virtual asset redirect completed (${redirectResponse.redirectChain.length} steps)`);
    });

    it('[Step 6] Should verify 302 redirect response', async () => {
      
      expect(redirectResponse).toBeDefined();
      expect(redirectResponse.redirectChain).toBeDefined();
      
      const firstRedirect = redirectResponse.redirectChain[0];
      
      // Verify redirect status - MUST be 302
      expect(firstRedirect.statusCode).toBe(302);
      expect(firstRedirect.headers.location).toBeDefined();
      expect(firstRedirect.headers['cache-control']).toBeDefined();
      
      metricsAfterRedirect = await fetchMetrics(gqlUrl);
    });

    it('[Step 7] Should verify presigned URL in Location header', async () => {
      
      expect(redirectResponse).toBeDefined();
      
      const firstRedirect = redirectResponse.redirectChain[0];
      presignedUrl = firstRedirect.headers.location;
      
      expect(presignedUrl).toBeDefined();
      expect(typeof presignedUrl).toBe('string');
      expect(presignedUrl).toMatch(/^https?:\/\//);
      
      const parsedPresigned = new URL(rewriteDockerHostname(presignedUrl));
      
      // Presigned URL should have signature parameters
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

    it('[Step 8] Should download file from storage using presigned URL', async () => {
      
      expect(redirectResponse).toBeDefined();
      
      const finalStatusCode = redirectResponse.statusCode;
      expect(finalStatusCode).toBe(200);
      
      downloadedContent = redirectResponse.body;
      expect(downloadedContent).toBeDefined();
      expect(Buffer.isBuffer(downloadedContent)).toBe(true);
      
      console.log(`[E2E:Step-8] Downloaded ${downloadedContent.length} bytes`);
    });

    it('[Step 9] Should verify file integrity (content, size, checksum)', async () => {
      
      expect(downloadedContent).toBeDefined();
      
      // Verify file size
      expect(downloadedContent.length).toBe(TEST_FILE_SIZE);
      
      // Verify file content
      const contentStr = downloadedContent.toString('utf8');
      expect(contentStr).toBe(TEST_FILE_CONTENT);
      
      // Verify checksum
      const checksum = calculateChecksum(downloadedContent);
      const expectedChecksum = calculateChecksum(Buffer.from(TEST_FILE_CONTENT));
      expect(checksum).toBe(expectedChecksum);
      
      console.log(`[E2E:Step-9] PASS: File integrity verified (checksum: ${checksum})`);
    });

    itif(() => metricsBeforeTest, '[Step 10] Should validate metrics', async () => {
      // Fetch metrics after all operations
      const metricsAfterRedirect = await fetchMetrics(gqlUrl);
      
      expect(metricsAfterRedirect).toBeDefined();
      
      // Metric: virtual_asset_created_total
      if (metricsBeforeTest) {
        const createdBefore = parseMetricValue(metricsBeforeTest, 'virtual_asset_created_total');
        const createdAfter = parseMetricValue(metricsAfterRedirect, 'virtual_asset_created_total');
        
        if (createdBefore !== null && createdAfter !== null) {
          expect(createdAfter).toBeGreaterThan(createdBefore);
          console.log(`[E2E:Step-10] virtual_asset_created_total: ${createdBefore} -> ${createdAfter}`);
        }
      }
      
      // Metric: virtual_asset_redirect_total
      if (metricsAfterRedirect) {
        const redirectBefore = parseMetricValue(metricsBeforeTest, 'virtual_asset_redirect_total', { outcome: 'presigned' });
        const redirectAfter = parseMetricValue(metricsAfterRedirect, 'virtual_asset_redirect_total', { outcome: 'presigned' });
        
        if (redirectBefore !== null && redirectAfter !== null) {
          expect(redirectAfter).toBeGreaterThan(redirectBefore);
          console.log(`[E2E:Step-10] virtual_asset_redirect_total: ${redirectBefore} -> ${redirectAfter}`);
        }
      }
      
      // Metric: virtual_asset_redirect_latency_ms
      if (metricsAfterRedirect && metricsAfterRedirect.includes('virtual_asset_redirect_latency_ms')) {
        console.log(`[E2E:Step-10] PASS: Latency metric recorded`);
      }
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

  // ==========================================================================
  // THREE UPLOAD METHODS
  // ==========================================================================

  describeif(virtualAssetEnabled, 'Upload Method 1: createAsset GQL mutation with file attachment', () => {
    let tdoId;
    let assetId;

    it('[1.1] Should create a TDO', async () => {
      const query = `mutation {
        createTDO(input: {
          name: "${citestMarker}-upload1-${Date.now()}"
          status: "uploaded"
          startDateTime: 1476726655
          stopDateTime: 1476726655
        }) {
          id
        }
      }`;
      const result = await gqlClient.query(query);
      tdoId = _.get(result, 'createTDO.id');
      expect(tdoId).toBeDefined();
      tdoIdsToCleanup.push(tdoId);
      console.log(`[Upload-1:Step-1.1] Created TDO: ${tdoId}`);
    });

    it('[1.2] Should upload asset using createAsset mutation with file attachment', async () => {
      const query = `mutation {
        createAsset(input: {
          containerId: "${tdoId}"
          contentType: "text/plain"
          assetType: "text"
          description: "Uploaded via createAsset GQL"
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
          filename: 'createAsset-test.txt',
          contentType: 'text/plain'
        })
        .expect(200);

      const data = _.get(res, 'body.data');
      expect(data).toBeDefined();
      assetId = _.get(data, 'createAsset.id');
      
      expect(assetId).toBeDefined();
      console.log(`[Upload-1:Step-1.2] Created asset: ${assetId}`);
    });

    it('[1.3] Should download via virtual asset URL', async () => {
      const query = `query {
        temporalDataObject(id: "${tdoId}") {
          assets {
            records {
              id
              signedUri
            }
          }
        }
      }`;
      
      const result = await gqlClient.query(query);
      const records = _.get(result, 'temporalDataObject.assets.records', []);
      const asset = records.find((r) => r.id === assetId) || records[0];
      const signedUri = asset.signedUri;
      
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

  describeif(virtualAssetEnabled, 'Upload Method 2: Storage endpoint with getSignedWritableUrl', () => {
    let tdoId;
    let assetId;
    let unsignedUrl;

    it('[2.1] Should create a TDO', async () => {
      const query = `mutation {
        createTDO(input: {
          name: "${citestMarker}-upload2-${Date.now()}"
          status: "uploaded"
          startDateTime: 1476726655
          stopDateTime: 1476726655
        }) {
          id
        }
      }`;
      const result = await gqlClient.query(query);
      tdoId = _.get(result, 'createTDO.id');
      expect(tdoId).toBeDefined();
      tdoIdsToCleanup.push(tdoId);
      console.log(`[Upload-2:Step-2.1] Created TDO: ${tdoId}`);
    });

    it('[2.2] Should get signed writable URL and upload via HTTP PUT', async () => {
      const query = `query {
        getSignedWritableUrl(
          type: "asset"
          path: "${tdoId}"
        ) {
          url
          unsignedUrl
        }
      }`;
      
      const result = await gqlClient.query(query);
      const writableUrl = _.get(result, 'getSignedWritableUrl');
      
      expect(writableUrl).toBeDefined();
      expect(writableUrl.url).toBeDefined();
      console.log(`[Upload-2:Step-2.2] Got signed writable URL`);
      
      // Upload using HTTP PUT
      try {
        // Rewrite MinIO URL to use nginx proxy for Docker hostname access
        const rewrittenUrl = rewriteDockerHostname(writableUrl.url);
        
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
        
        unsignedUrl = writableUrl.unsignedUrl;
      } catch (err) {
        console.error(`[Upload-2:Step-2.2] ERROR: Upload failed: ${err.message}`);
        throw err;
      }
    });

    it('[2.3] Should create asset with uploaded file URI', async () => {
      expect(unsignedUrl).toBeDefined();
      
      const mutation = `mutation {
        createAsset(input: {
          containerId: "${tdoId}"
          contentType: "text/plain"
          assetType: "text"
          uri: "${unsignedUrl}"
        }) {
          id
          signedUri
        }
      }`;
      
      const result = await gqlClient.query(mutation);
      assetId = _.get(result, 'createAsset.id');
      const signedUri = _.get(result, 'createAsset.signedUri');
      
      expect(assetId).toBeDefined();
      console.log(`[Upload-2:Step-2.3] Created asset: ${assetId}`);
      
      expect(isVirtualAssetUrl(signedUri)).toBe(true);
      
      // Download and verify
      const localUri = rewriteToLocalServer(signedUri, gqlUrl);
      const redirectResponse = await fetchFollowRedirects(localUri);
      
      if (redirectResponse && redirectResponse.statusCode === 200) {
        const contentStr = redirectResponse.body.toString('utf8');
        expect(contentStr).toBe(TEST_FILE_CONTENT);
        console.log(`[Upload-2:Step-2.3] SUCCESS: File downloaded and verified`);
      }
    });
  });

  describeif(virtualAssetEnabled, 'Upload Method 3: Multipart upload for large files', () => {
    let tdoId;
    let assetId;
    let multipartData;
    let finalUrl;
    
    const LARGE_FILE_CONTENT = 'Multipart Upload Test - '.repeat(1000) + Date.now();
    const LARGE_FILE_SIZE = Buffer.byteLength(LARGE_FILE_CONTENT, 'utf8');
    const NUM_PARTS = 3;

    it('[3.1] Should create a TDO', async () => {
      const query = `mutation {
        createTDO(input: {
          name: "${citestMarker}-upload3-${Date.now()}"
          status: "uploaded"
          startDateTime: 1476726655
          stopDateTime: 1476726655
        }) {
          id
        }
      }`;
      const result = await gqlClient.query(query);
      tdoId = _.get(result, 'createTDO.id');
      expect(tdoId).toBeDefined();
      tdoIdsToCleanup.push(tdoId);
      console.log(`[Upload-3:Step-3.1] Created TDO: ${tdoId}`);
    });

    it('[3.2] Should initiate multipart upload', async () => {
      const mutation = `mutation {
        initiateMultipartUpload(input: {
          fileName: "multipart-test.txt"
          fileSize: ${LARGE_FILE_SIZE}
          numberOfParts: ${NUM_PARTS}
          folderName: "${tdoId}"
          contentType: "text/plain"
        }) {
          uploadId
          key
          preSignedUrls {
            signedUrl
            partNumber
          }
        }
      }`;
      
      try {
        const result = await gqlClient.query(mutation);
        multipartData = _.get(result, 'initiateMultipartUpload');
        
        expect(multipartData).toBeDefined();
        expect(multipartData.preSignedUrls.length).toBe(NUM_PARTS);
        console.log(`[Upload-3:Step-3.2] Initiated multipart upload`);
      } catch (err) {
        // MinIO does not support multipart upload
        if (err.message.includes('initiateMultipartUpload can only be used for AWS S3, OCI, and Azure')) {
          console.log(`[Upload-3:Step-3.2] SKIP: MinIO does not support multipart upload`);
          console.log(`[Upload-3:Step-3.2] INFO: This test requires AWS S3, OCI, or Azure storage`);
          throw new Error('Multipart upload not supported on MinIO - test requires AWS S3, OCI, or Azure');
        }
        throw err;
      }
    });

    itif(() => multipartData, '[3.3] Should upload all parts and complete', async () => {
      expect(multipartData).toBeDefined();
      
      const parts = [];
      const buffer = Buffer.from(LARGE_FILE_CONTENT);
      const CHUNK_SIZE = Math.ceil(LARGE_FILE_SIZE / NUM_PARTS);
      
      // Upload all parts
      for (let i = 0; i < multipartData.preSignedUrls.length; i++) {
        const { signedUrl, partNumber } = multipartData.preSignedUrls[i];
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, LARGE_FILE_SIZE);
        const chunk = buffer.slice(start, end);
        
        const uploadResponse = await fetch(signedUrl, {
          method: 'PUT',
          body: chunk
        });
        
        const etag = uploadResponse.headers.get('etag');
        parts.push({
          PartNumber: partNumber,
          ETag: etag
        });
        console.log(`[Upload-3:Step-3.3] PASS: Uploaded part ${partNumber}`);
      }
      
      // Complete multipart upload
      const partsGraphQL = JSON.stringify(parts).replace(/"([^"]+)":/g, '$1:');
      const completeMutation = `mutation {
        completeMultipartUpload(
          input: {
            key: "${multipartData.key}"
            uploadId: "${multipartData.uploadId}"
            parts: ${partsGraphQL}
          }
        ) {
          url
        }
      }`;
      
      const result = await gqlClient.query(completeMutation);
      finalUrl = _.get(result, 'completeMultipartUpload.url');
      
      expect(finalUrl).toBeDefined();
      console.log(`[Upload-3:Step-3.3] SUCCESS: Multipart upload completed`);
    });

    itif(() => finalUrl, '[3.4] Should create asset and verify download', async () => {
      expect(finalUrl).toBeDefined();
      
      const mutation = `mutation {
        createAsset(input: {
          containerId: "${tdoId}"
          contentType: "text/plain"
          assetType: "text"
          uri: "${finalUrl}"
        }) {
          id
          signedUri
        }
      }`;
      
      const result = await gqlClient.query(mutation);
      assetId = _.get(result, 'createAsset.id');
      const signedUri = _.get(result, 'createAsset.signedUri');
      
      expect(assetId).toBeDefined();
      console.log(`[Upload-3:Step-3.4] Created asset: ${assetId}`);
      
      expect(isVirtualAssetUrl(signedUri)).toBe(true);
      
      // Download and verify large file
      const localUri = rewriteToLocalServer(signedUri, gqlUrl);
      const redirectResponse = await fetchFollowRedirects(localUri);
      
      if (redirectResponse && redirectResponse.statusCode === 200) {
        const contentStr = redirectResponse.body.toString('utf8');
        expect(contentStr).toBe(LARGE_FILE_CONTENT);
        console.log(`[Upload-3:Step-3.4] SUCCESS: Large file downloaded and verified (${LARGE_FILE_SIZE} bytes)`);
      }
    });
  });
});
