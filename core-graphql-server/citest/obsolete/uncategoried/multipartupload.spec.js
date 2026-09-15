const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const fs = require('fs');
const env = config.env;

const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);
const citestMarker = global.citestMarker || 'citest-should-delete';

describeif(!env.includes('local'), 'multipart-upload', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('should upload a file (5Mb chunks)', async () => {
    const chunkSize = 1024 * 1024 * 5;
    const batchSize = 25;

    await multipartUploadFile(chunkSize, batchSize);
  });

  it('should cancel the upload of a file (5Mb chunks)', async () => {
    const chunkSize = 1024 * 1024 * 5;
    const batchSize = 25;

    await multipartUploadFile(chunkSize, batchSize, true);
  });

  const multipartUploadFile = async (
    chunkSize,
    batchSize,
    shouldCancel = false
  ) => {
    const filePath = './citest/data/videoplayback.mp4';

    const fileHandle = await fs.promises.open(filePath, 'r');
    const stats = fs.statSync(filePath);

    const contentType = 'video/mp4';

    const totalChunks = Math.ceil(stats.size / chunkSize);
    const fileName = citestMarker + '-movie.mp4';
    const folderName = 'citest';
    // Create storage endpoint for the current upload
    let gql = `mutation {
        initiateMultipartUpload(input: {
            fileName: "${fileName}"
            fileSize: ${stats.size}
            numberOfParts: ${totalChunks}
            folderName: "${folderName}"
            contentType: "${contentType}"
        }) {
            uploadId
            key
            preSignedUrls {
                signedUrl
                partNumber
            }
        }
    }`;

    let response = await gqlClient.query(gql);

    const preSignedUrls = _.get(
      response,
      'initiateMultipartUpload.preSignedUrls'
    );
    const uploadId = _.get(response, 'initiateMultipartUpload.uploadId');
    const uploadKey = _.get(response, 'initiateMultipartUpload.key');

    expect(preSignedUrls).toBeDefined();
    expect(uploadId).toBeDefined();

    const startTime = performance.now();

    let chunkRequests = 0;
    let totalByteLength = 0;
    const parts = [];
    let requests = [];
    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const { signedUrl, partNumber } = preSignedUrls[chunkIdx];
      parts.push({
        PartNumber: partNumber,
        ETag: chunkIdx.toString()
      });

      const start = chunkIdx * chunkSize;
      const end = Math.min(start + chunkSize, stats.size);
      let chunkBuffer = Buffer.alloc(end - start);
      await fileHandle.read(chunkBuffer, 0, chunkBuffer.length, start);

      const request = fetch(signedUrl, { method: 'PUT', body: chunkBuffer });
      chunkRequests++;
      let currentElapsed = performance.now() - startTime;
      currentElapsed /= 1000.0;
      totalByteLength += chunkBuffer.length;
      const throughput = (
        totalByteLength /
        (1024 * 1024) /
        currentElapsed
      ).toFixed(2);
      const progress = ((chunkRequests / totalChunks) * 100).toFixed(2);

      expect(throughput).toBeDefined();
      expect(progress).toBeDefined();

      /*
      console.log(
        `${currentElapsed.toFixed(2)} seconds. Completed chunk ${chunkIdx} request. ${(totalByteLength / (1024.0 * 1024.0)).toFixed(2)}Mb. Throughput: ${throughput}Mb/s. Progress ${progress}%`
      );
      */

      requests.push(request);

      // Avoid overloading memory from high amount of in-flight chunk buffers
      if (requests.length >= batchSize) {
        const responses = await Promise.all(requests);

        responses.forEach((res, index) => {
          parts[index].ETag = res.headers.get('etag') || '';
        });

        requests = [];
      }
    }

    if (requests.length > 0) {
      // clean-up any unprocessed requests
      const responses = await Promise.all(requests);

      // get Etag for uploadPart
      responses.forEach((res, index) => {
        parts[index].ETag = res.headers.get('etag') || '';
      });
    }

    if (shouldCancel) {
      gql = `mutation  {
        cancelMultipartUpload (
            input: {
                key: "${uploadKey}"
                uploadId: "${uploadId}"
            }
        ) {
            id
            message
        }
      }`;

      response = await gqlClient.query(gql);
      const id = _.get(response, 'cancelMultipartUpload.id');
      const message = _.get(response, 'cancelMultipartUpload.message');
      expect(id).toBeDefined();
      expect(message).toBeDefined();
    }

    const partsClean = JSON.stringify(parts);
    const graphQLParts = partsClean.replace(/"([^(")"]+)":/g, '$1:');

    gql = `mutation  {
        completeMultipartUpload (
            input: {
                key: "${uploadKey}"
                uploadId: "${uploadId}"
                parts: ${graphQLParts}
            }
        ) {
            signedUrl
            url
        }
    }`;

    let url;
    try {
      response = await gqlClient.query(gql);

      const signedUrl = _.get(response, 'completeMultipartUpload.signedUrl');
      url = _.get(response, 'completeMultipartUpload.url');
      expect(signedUrl).toBeDefined();
      expect(url).toBeDefined();
    } catch (error) {
      expect(shouldCancel).toEqual(true);
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
    }

    let elapsed = performance.now() - startTime;
    elapsed /= 1000.0;

    /*
    console.log(
      `Total Chunks: ${totalChunks}.`
    );
    console.log(
      `Total Time: ${elapsed} seconds.`
    );
    console.log(
      `Validate: ${signedUrl}`
    );
    */

    fileHandle.close();

    if (!shouldCancel) {
      // Add to tdo, so we can remove the asset
      gql = `mutation {
        createTDOWithAsset(
          input: {
            name: "Multipart Upload Container"
            contentType: "${contentType}"
            assetType: "vtn-standard"
            uri: "${url}"
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
    }
  };
});
