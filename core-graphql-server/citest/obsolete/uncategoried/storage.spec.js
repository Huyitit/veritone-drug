const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const fs = require('fs');

async function putChunk(url, buffer, options = {}) {
  const response = await fetch(url, {
    method: 'PUT',
    body: buffer,
    headers: options.headers,
  });
  const data = await response.json();
  return { data, status: response.status };
}

const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

console.log(
  `the feature flag signedWritableUrlOverride = ${global.signedWritableUrlOverride}`
);

describeif(global.signedWritableUrlOverride, 'citest_storage: storage-chunk-upload', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('should chatty chunk upload a file (32k)', async () => {
    const chunkSize = 1024 * 32;
    const batchSize = 25;

    await chunkUploadFile(chunkSize, batchSize);
  });

  it('should chunky chunk upload a file (1MB)', async () => {
    const chunkSize = 1024 * 1024;
    const batchSize = 25;

    await chunkUploadFile(chunkSize, batchSize);
  });

  xit('should chunky chunk upload a file (5Mb)', async () => {
    const chunkSize = 1024 * 1024 * 5;
    const batchSize = 25;

    await chunkUploadFile(chunkSize, batchSize);
  });

  it('should upload file and return full state', async () => {
    const chunkSize = 1024 * 1024 * 5;
    const batchSize = 25;

    await chunkUploadFile(chunkSize, batchSize, false, undefined, true);
  });

  it('should chunk upload a file with MD5 checksums on blocks', async () => {
    const chunkSize = 1024 * 1024;
    const batchSize = 25;

    await chunkUploadFile(chunkSize, batchSize, true);
  });

  it('should chunk upload a file and retry failed chunks', async () => {
    const chunkSize = 1024 * 64;
    const batchSize = 25;

    const mockFailChunkIds = [3, 5, 11, 12, 23];
    await chunkUploadFile(chunkSize, batchSize, false, mockFailChunkIds);
  });

  const chunkUploadFile = async (
    chunkSize,
    batchSize,
    useMD5,
    mockFailChunkIds,
    returnFullState
  ) => {
    let batch = [];
    let responses = [];
    let retryChunks = {};

    // Create storage endpoint for the current upload
    let gql = `query {
      getSignedWritableUrl (
        expiresInSeconds: 10000) {
          bucket
          key
          url
          unsignedUrl
      }
    }`;

    let response = await gqlClient.query(gql);
    const url = _.get(response, 'getSignedWritableUrl.url');
    const tdoUrl = _.get(response, 'getSignedWritableUrl.unsignedUrl');

    expect(url).toBeDefined();
    expect(tdoUrl).toBeDefined();

    const filePath = './citest/data/movie.mp4';

    const fileHandle = await fs.promises.open(filePath, 'r');
    const stats = fs.statSync(filePath);

    const totalChunks = Math.ceil(stats.size / chunkSize);

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const start = chunkIdx * chunkSize;
      const end = Math.min(start + chunkSize, stats.size);
      const chunkBuffer = Buffer.alloc(end - start);
      await fileHandle.read(chunkBuffer, 0, chunkBuffer.length, start);

      let checksumChunkSize = chunkBuffer.length;

      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Veritone-Chunk-Size': `${checksumChunkSize}`, // optional for checksum
        'X-Veritone-Total-Size': `${stats.size}` // required for completion check
      };

      if (useMD5) {
        headers['X-Veritone-MD5-Checksum'] = true;
      }

      if (returnFullState) {
        headers['X-Veritone-Return-Full-State'] = true;
      }

      if (mockFailChunkIds) {
        const shouldFail = mockFailChunkIds.find(
          (mockChunkIdx) => mockChunkIdx === chunkIdx
        );
        if (shouldFail) {
          // Populate the retry info for later
          retryChunks[chunkIdx] = {
            chunkBuffer,
            headers: { ...headers }
          };

          // create a checksum error
          headers['X-Veritone-Chunk-Size'] = '1';
        }
      }

      // Send the file chunk to the storage endpoint
      const response = putChunk(`${url}/${chunkIdx}`, chunkBuffer, {
        headers
      });

      batch.push(response);

      if (batch.length > batchSize) {
        // Don't overwhelm the client http connections
        const currentResponses = await Promise.all(batch);
        responses.push(...currentResponses);
        batch = [];
      }
    }

    for (const retryChunkIdx in retryChunks) {
      const retryChunk = retryChunks[retryChunkIdx];
      const headers = retryChunk.headers;
      response = putChunk(`${url}/${retryChunkIdx}`, retryChunk.chunkBuffer, {
        headers
      });
      batch.push(response);
    }

    // Clean up any pending batches
    if (batch.length > 0) {
      const finalResponses = await Promise.all(batch);
      responses.push(...finalResponses);
    }

    let isCompleted = false;
    for (const response of responses) {
      expect(response.data).toBeDefined();
      expect(response.status).toEqual(200);
      expect(response.data.status).toBeDefined();
      expect(response.data.chunk).toBeDefined();
      expect(response.data.chunk.status).toBeDefined();

      if (returnFullState) {
        expect(response.data.chunks).toBeDefined();
      } else {
        expect(response.data.chunks).toEqual(undefined);
      }

      if (response.data.status === 'complete') {
        isCompleted = true;
        break;
      }
    }

    expect(isCompleted).toEqual(true);

    // Add to tdo, so we can remove the asset
    gql = `mutation {
      createTDOWithAsset(
        input: {
          name: "Chunk Test Container"
          contentType: "application/json"
          assetType: "vtn-standard"
          uri: "${tdoUrl}"
          startDateTime: "01/22/2025"
          stopDateTime: "01/22/2025"
        }
      ) {
        id
      }
    }`;

    response = await gqlClient.query(gql);
    let tdoId = _.get(response, 'createTDOWithAsset.id');

    expect(tdoId).toBeDefined();

    // Delete tdo and the associated asset
    gql = `mutation {
      deleteTDO(id: "${tdoId}") {
        id
      }
    }`;

    response = await gqlClient.query(gql);

    tdoId = _.get(response, 'deleteTDO.id');

    expect(tdoId).toBeDefined();

    fileHandle.close();
  };
});
