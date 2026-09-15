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

const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const { safe } = require('../helpers/cleanup/utils');
const config = helpers.config;
const _ = require('lodash');
const http = require('http');
const https = require('https');

const citestMarker = global.citestMarker || 'citest-should-delete';
const virtualAssetEnabled = global.virtualAssetEnabled || false;
const describeif = (condition, ...args) => (condition ? describe(...args) : describe.skip(...args));

// Collect TDO IDs for cleanup
const tdoIdsToCleanup = [];

/**
 * Derive the local server base URL from the GraphQL endpoint.
 * e.g. "http://localhost:9000/v3/graphql" → "http://localhost:9000"
 */
function serverBaseUrl(gqlUrl) {
  const u = new URL(gqlUrl);
  return `${u.protocol}//${u.host}`;
}

/**
 * When the virtual-asset feature is enabled, signedUri is a JWT URL that
 * may point to apiRoot (e.g. https://api.aws-dev.veritone.com/asset/<jwt>).
 * In CI/local-docker the server is actually at localhost, so we rewrite
 * the host portion to the real server.
 *
 * If the virtualUrl hostname already matches the gqlUrl hostname (both are
 * local-docker), we keep the original port because the /asset/ route is
 * served by the GraphQL server directly (port 3000), not via nginx (port 8080).
 */
function rewriteToLocalServer(virtualUrl, gqlUrl) {
  const parsed = new URL(virtualUrl);
  const localParsed = new URL(gqlUrl);

  // Already pointing at the same local host — keep the port as-is
  if (parsed.hostname === localParsed.hostname) {
    return parsed.toString();
  }

  // External host — rewrite to local
  parsed.protocol = localParsed.protocol;
  parsed.host = localParsed.host;
  return parsed.toString();
}

/**
 * Rewrite Docker-internal hostnames so the test runner can reach them.
 *
 * MinIO presigned URLs include the hostname in the signature, so we cannot
 * simply change the host to localhost.  Instead we route through the nginx
 * proxy at port 8080 which sets `Host: minio:9000` preserving the signature.
 *
 * Nginx location block:
 *   /minio → proxy_pass http://minio:9000 (strips /minio prefix)
 */
function rewriteDockerHostname(url) {
  const parsed = new URL(url);

  if (parsed.hostname === 'minio') {
    // Route through nginx /minio proxy to preserve presigned signature
    const minioPath = parsed.pathname + parsed.search;
    return `http://localhost:8080/minio${minioPath}`;
  }

  const dockerHosts = ['graphql', 'redis', 'azurite'];
  if (dockerHosts.includes(parsed.hostname)) {
    parsed.hostname = 'localhost';
  }
  return parsed.toString();
}

/**
 * Follow redirects (e.g., virtual asset 302 → signed URL) and return the
 * final response body as a Buffer.  Works for both http and https.
 */
function fetchFollowRedirects(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.get(targetUrl, { timeout: 15000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) {
          return reject(new Error('Too many redirects'));
        }
        // Follow relative or absolute redirect, rewriting Docker hostnames
        const rawLocation = res.headers.location;
        const next = rewriteDockerHostname(
          new URL(rawLocation, targetUrl).toString()
        );
        res.resume();
        return resolve(fetchFollowRedirects(next, maxRedirects - 1));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

/**
 * Issue a single HEAD request without following redirects. VE-26428 requires
 * the server to answer HEAD directly (server-side HEAD check against the
 * storage object) — a 302 here would be a regression.
 */
function headRequest(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.request(
      targetUrl,
      { method: 'HEAD', timeout: 15000 },
      (res) => {
        res.resume();
        res.on('end', () =>
          resolve({ statusCode: res.statusCode, headers: res.headers })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

describe('citest_tdo: virtual asset resolution', () => {
  let gqlClient;
  let gqlUrl;

  beforeAll(async () => {
    gqlClient = new GraphqlClient(config.env);
    const result = await gqlClient.connect();
    expect(result.token).toBeDefined();
    gqlUrl = gqlClient.getUrl();
  });

  afterAll(async () => {
    await safe('cleanup TDOs', async () => {
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
      console.log(`Cleaned up ${tdoIdsToCleanup.length} TDOs`);
    });
  });

  // =====================================================================
  // Case 1: Basic virtual asset → download content
  // Requires virtualAssetEnabled feature flag on the server.
  // =====================================================================
  describeif(virtualAssetEnabled, 'Case 1: create TDO + asset, resolve signedUri, download content', () => {
    let tdoId;
    let assetId;
    let signedUri;

    it('should create a TDO', async () => {
      const query = `mutation {
        createTDO(input: {
          name: "${citestMarker}-virtual-asset-test-${Date.now()}"
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
    });

    it('should create an asset with multipart upload', async () => {
      const query = `mutation {
        createAsset(input: {
          containerId: "${tdoId}"
          contentType: "text/plain"
          assetType: "text"
          description: "virtual asset citest file"
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
        .attach('file', Buffer.from('Hello, virtual asset!'), {
          filename: 'hello.txt',
          contentType: 'text/plain'
        })
        .expect(200);

      const data = _.get(res, 'body.data');
      expect(data).toBeDefined();
      assetId = _.get(data, 'createAsset.id');
      expect(assetId).toBeDefined();
      expect(_.get(data, 'createAsset.uri')).toBeDefined();
    });

    it('should resolve signedUri on the asset', async () => {
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

    // VE-26428: HEAD on a virtual-asset URL must be answered server-side with
    // the storage object's metadata — as if the caller HEAD'd the object
    // directly. No 302 (a redirect would hand out a URL the follow-up HEAD
    // can't use — the method is part of the presigned signature), and the
    // content-length must match the stored object.
    it('should answer HEAD with the storage object metadata (no redirect)', async () => {
      expect(signedUri).toBeDefined();

      const localUri = rewriteToLocalServer(signedUri, gqlUrl);
      const response = await headRequest(localUri);

      expect(response.statusCode).toBe(200);
      expect(Number(response.headers['content-length'])).toBe(
        Buffer.byteLength('Hello, virtual asset!')
      );
      // The stateful endpoint stamps its responses (VE-26428).
      expect(response.headers['veritone-virtual-asset']).toBe('true');
    });

    // The GET above populates the cached GET-signed URL in redis; HEAD must
    // still succeed afterwards (it is served from that same cached URL via a
    // 1-byte ranged GET — the range probe must not break on a cache hit).
    it('should answer HEAD correctly after the GET populated the signed-URL cache', async () => {
      expect(signedUri).toBeDefined();

      const localUri = rewriteToLocalServer(signedUri, gqlUrl);
      const response = await headRequest(localUri);

      expect(response.statusCode).toBe(200);
    });
  });

  // =====================================================================
  // Case 2: Verify virtual-asset URI shape
  //
  // When virtualAssetEnabled is true, signedUri should be a JWT-based
  // virtual asset URL (containing /asset/) rather than a raw presigned
  // S3/MinIO URL. This validates the feature flag is wired correctly
  // end-to-end.
  // =====================================================================
  describeif(virtualAssetEnabled, 'Case 2: signedUri is a virtual-asset JWT URL', () => {
    let tdoId;
    let assetId;

    it('should create a TDO', async () => {
      const query = `mutation {
        createTDO(input: {
          name: "${citestMarker}-virtual-shape-test-${Date.now()}"
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
    });

    it('should upload an asset', async () => {
      const query = `mutation {
        createAsset(input: {
          containerId: "${tdoId}"
          contentType: "text/plain"
          assetType: "text"
          description: "shape test file"
        }) {
          id
          uri
        }
      }`;

      const headers = helpers.requestOptions(gqlClient.userToken).headers;
      const res = await helpers
        .supertest(gqlUrl)
        .post('')
        .set(headers)
        .field('query', query)
        .attach('file', Buffer.from('Shape test content'), {
          filename: 'shape.txt',
          contentType: 'text/plain'
        })
        .expect(200);

      const data = _.get(res, 'body.data');
      expect(data).toBeDefined();
      assetId = _.get(data, 'createAsset.id');
      expect(assetId).toBeDefined();
    });

    it('should return a virtual-asset URL (contains /asset/ path), not a raw presigned URL', async () => {
      const query = `query {
        temporalDataObject(id: "${tdoId}") {
          assets(assetType: "text") {
            records {
              id
              signedUri
              uri
            }
          }
        }
      }`;
      const result = await gqlClient.query(query);
      const records = _.get(result, 'temporalDataObject.assets.records', []);
      expect(records.length).toBeGreaterThan(0);

      const asset = records.find((r) => r.id === assetId) || records[0];
      const signedUri = asset.signedUri;
      expect(signedUri).toBeDefined();

      // Virtual asset URLs contain "/asset/" followed by a JWT token.
      // Raw presigned URLs would contain bucket/key and X-Amz-Signature params.
      const parsedUri = new URL(signedUri);
      expect(parsedUri.pathname).toMatch(/\/asset\//);
      // Should NOT have S3 presign query params
      expect(parsedUri.searchParams.has('X-Amz-Signature')).toBe(false);
    });

    it('should be downloadable via the virtual-asset redirect', async () => {
      const query = `query {
        temporalDataObject(id: "${tdoId}") {
          assets(assetType: "text") {
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

      const localUri = rewriteToLocalServer(signedUri, gqlUrl);
      const response = await fetchFollowRedirects(localUri);
      expect(response.statusCode).toBe(200);
      const body = response.body.toString('utf8');
      expect(body).toContain('Shape test content');
    });
  });
});
