import * as fs from 'node:fs';
import * as path from 'node:path';
import _ from 'lodash';

import { helpers } from '../../src/helpers';
import { safe } from '../../src/helpers/commonHelper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

const config = helpers.config;
const env = config.env as string;

const describeif = (
  condition: boolean | undefined,
  ...args: Parameters<typeof describe>
) => (condition ? describe(...args) : describe.skip(...args));

interface Part {
  PartNumber: string;
  ETag: string;
}

describeif(!env.includes('local'), 'multipart-upload', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
  });

  afterAll(async () => {
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
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
    chunkSize: number,
    batchSize: number,
    shouldCancel = false
  ) => {
    const filePath = path.join(__dirname, '../../../../data/videoplayback.mp4');

    const fileHandle = await fs.promises.open(filePath, 'r');
    const stats = fs.statSync(filePath);

    const contentType = 'video/mp4';

    const totalChunks = Math.ceil(stats.size / chunkSize);
    const fileName = `${(globalThis as any).citestMarker ?? 'citest-should-delete'}-movie.mp4`;
    const folderName = 'citest';
    // Create storage endpoint for the current upload
    let response = await gqlClient.sdk.initiateMultipartUpload({
      input: {
        fileName,
        fileSize: stats.size,
        numberOfParts: totalChunks,
        folderName,
        contentType
      }
    });

    const preSignedUrls = _.get(
      response,
      'data.initiateMultipartUpload.preSignedUrls'
    );
    const uploadId = _.get(response, 'data.initiateMultipartUpload.uploadId');
    const uploadKey = _.get(response, 'data.initiateMultipartUpload.key');

    expect(preSignedUrls).toBeDefined();
    expect(uploadId).toBeDefined();

    const startTime = performance.now();

    let chunkRequests = 0;
    let totalByteLength = 0;
    const parts: Part[] = [];
    let requests: Promise<Response>[] = [];
    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const { signedUrl, partNumber } = preSignedUrls?.[chunkIdx]!;
      parts.push({
        PartNumber: partNumber,
        ETag: chunkIdx.toString()
      });

      const start = chunkIdx * chunkSize;
      const end = Math.min(start + chunkSize, stats.size);
      const chunkBuffer = Buffer.alloc(end - start);
      await fileHandle.read(chunkBuffer, 0, chunkBuffer.length, start);

      const request = fetch(signedUrl, {
        method: 'PUT',
        body: chunkBuffer as unknown as BodyInit
      });
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
      const cancelResponse = await gqlClient.sdk.cancelMultipartUpload({
        input: {
          key: uploadKey!,
          uploadId: uploadId!
        }
      });
      const id = _.get(cancelResponse, 'data.cancelMultipartUpload.id');
      const message = _.get(
        cancelResponse,
        'data.cancelMultipartUpload.message'
      );
      expect(id).toBeDefined();
      expect(message).toBeDefined();
    }

    let url: string | undefined;
    try {
      const completeResponse = await gqlClient.sdk.completeMultipartUpload({
        input: {
          key: uploadKey!,
          uploadId: uploadId!,
          parts
        }
      });

      const signedUrl = _.get(
        completeResponse,
        'data.completeMultipartUpload.signedUrl'
      );
      url = _.get(completeResponse, 'data.completeMultipartUpload.url');
      expect(signedUrl).toBeDefined();
      expect(url).toBeDefined();
    } catch (error: any) {
      expect(shouldCancel).toEqual(true);
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
    }

    await fileHandle.close();

    if (!shouldCancel) {
      // Add to tdo, so we can remove the asset
      const createTdoResult = await gqlClient.sdk.createTDOWithAsset({
        input: {
          name: 'Multipart Upload Container',
          contentType,
          assetType: 'vtn-standard',
          uri: url!,
          startDateTime: '01/22/2025',
          stopDateTime: '01/22/2025'
        }
      });
      const tdoId = createTdoResult?.data?.createTDOWithAsset?.id;

      expect(tdoId).toBeDefined();

      // Delete tdo and the associated asset
      const deleteTdoResult = await gqlClient.sdk.deleteTDO({ id: tdoId! });

      expect(deleteTdoResult?.data?.deleteTDO?.id).toBeDefined();
    }
  };
});
