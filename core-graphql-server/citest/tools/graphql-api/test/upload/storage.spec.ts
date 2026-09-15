import * as fs from 'node:fs';
import * as path from 'node:path';
import _ from 'lodash';

import { safe } from '../../src/helpers/commonHelper';
import { createGraphqlClient, AuthType } from '../../src/graphqlUtil';
import type { ServerFeatureFlags } from '../helpers/featureFlags';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';

/**
 * Feature-flag global: under jest (how the cirunner CI job runs these specs)
 * this is published by citest/jest.global.setup.js before any spec loads;
 * under local `bun test` the preload in test/setup.ts (wired via
 * bunfig.toml) fetches the same live `graphqlServiceInfo.featureFlags` and
 * publishes the identical global — without it this suite silently skips
 * under bun. Mirrors the pattern in test/application/applicationRoles.spec.ts.
 */
const citestGlobals = globalThis as unknown as ServerFeatureFlags;

const describeif = (
  condition: boolean | undefined,
  ...args: Parameters<typeof describe>
) => (condition ? describe(...args) : describe.skip(...args));

console.log(
  `the feature flag signedWritableUrlOverride = ${citestGlobals.signedWritableUrlOverride}`
);

interface PutChunkOptions {
  headers?: Record<string, string | boolean>;
}

interface PutChunkResult {
  data: any;
  status: number;
}

async function putChunk(
  url: string,
  buffer: Buffer,
  options: PutChunkOptions = {}
): Promise<PutChunkResult> {
  const response = await fetch(url, {
    method: 'PUT',
    body: buffer as unknown as BodyInit,
    headers: options.headers as any
  });
  const data = await response.json();
  return { data, status: response.status };
}

describeif(
  citestGlobals.signedWritableUrlOverride,
  'citest_storage: storage-chunk-upload',
  () => {
    let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;

    beforeAll(async () => {
      const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
      isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
      expect(isolatedSuperadmin.client.sessionToken).toBeDefined();
      expect(isolatedSuperadmin.token).toBeDefined();
    });

    afterAll(async () => {
      await safe('cleanup isolated superadmin', () =>
        isolatedSuperadmin.cleanup()
      );
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
      chunkSize: number,
      batchSize: number,
      useMD5?: boolean,
      mockFailChunkIds?: number[],
      returnFullState?: boolean
    ) => {
      let batch: Promise<PutChunkResult>[] = [];
      let responses: PutChunkResult[] = [];
      const retryChunks: Record<
        number,
        { chunkBuffer: Buffer; headers: Record<string, string | boolean> }
      > = {};

      // Create storage endpoint for the current upload.
      const response = await isolatedSuperadmin.client.sdk.getSignedWritableUrl(
        { expiresInSeconds: 10000 }
      );
      const url = _.get(response, 'data.getSignedWritableUrl.url');
      const tdoUrl = _.get(response, 'data.getSignedWritableUrl.unsignedUrl');

      expect(url).toBeDefined();
      expect(tdoUrl).toBeDefined();

      const filePath = path.join(__dirname, '../../../../data/movie.mp4');

      const fileHandle = await fs.promises.open(filePath, 'r');
      const stats = fs.statSync(filePath);

      const totalChunks = Math.ceil(stats.size / chunkSize);

      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        const start = chunkIdx * chunkSize;
        const end = Math.min(start + chunkSize, stats.size);
        const chunkBuffer = Buffer.alloc(end - start);
        await fileHandle.read(chunkBuffer, 0, chunkBuffer.length, start);

        const checksumChunkSize = chunkBuffer.length;

        const headers: Record<string, string | boolean> = {
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
        const chunkResponse = putChunk(`${url}/${chunkIdx}`, chunkBuffer, {
          headers
        });

        batch.push(chunkResponse);

        if (batch.length > batchSize) {
          // Don't overwhelm the client http connections
          const currentResponses = await Promise.all(batch);
          responses.push(...currentResponses);
          batch = [];
        }
      }

      for (const retryChunkIdxStr of Object.keys(retryChunks)) {
        const retryChunkIdx = Number(retryChunkIdxStr);
        const retryChunk = retryChunks[retryChunkIdx];
        const headers = retryChunk.headers;
        const retryResponse = putChunk(
          `${url}/${retryChunkIdx}`,
          retryChunk.chunkBuffer,
          { headers }
        );
        batch.push(retryResponse);
      }

      // Clean up any pending batches
      if (batch.length > 0) {
        const finalResponses = await Promise.all(batch);
        responses.push(...finalResponses);
      }

      let isCompleted = false;
      for (const chunkResponse of responses) {
        expect(chunkResponse.data).toBeDefined();
        expect(chunkResponse.status).toEqual(200);
        expect(chunkResponse.data.status).toBeDefined();
        expect(chunkResponse.data.chunk).toBeDefined();
        expect(chunkResponse.data.chunk.status).toBeDefined();

        if (returnFullState) {
          expect(chunkResponse.data.chunks).toBeDefined();
        } else {
          expect(chunkResponse.data.chunks).toEqual(undefined);
        }

        if (chunkResponse.data.status === 'complete') {
          isCompleted = true;
          break;
        }
      }

      expect(isCompleted).toEqual(true);

      // Add to tdo, so we can remove the asset
      const createTdoResult = await isolatedSuperadmin.client.sdk.createTDOWithAsset(
        {
          input: {
            name: 'Chunk Test Container',
            contentType: 'application/json',
            assetType: 'vtn-standard',
            uri: tdoUrl,
            startDateTime: '01/22/2025',
            stopDateTime: '01/22/2025'
          }
        }
      );
      const tdoId = createTdoResult?.data?.createTDOWithAsset?.id;

      expect(tdoId).toBeDefined();

      // Delete tdo and the associated asset
      const deleteTdoResult = await isolatedSuperadmin.client.sdk.deleteTDO({
        id: tdoId!
      });

      expect(deleteTdoResult?.data?.deleteTDO?.id).toBeDefined();

      await fileHandle.close();
    };
  }
);

// VE-26306: the `key`, `type` and `path` arguments are deprecated.
//
// Deliberately OUTSIDE the describeif(signedWritableUrlOverride) suite above:
// this behavior is independent of the chunk-upload feature flag.
describe('citest_storage: getSignedWritableUrl deprecated arguments (VE-26306)', () => {
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    expect(isolatedSuperadmin.client.sessionToken).toBeDefined();
    expect(isolatedSuperadmin.token).toBeDefined();
  });

  afterAll(async () => {
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  const QUERY_WITHOUT_KEY = `query {
    getSignedWritableUrl {
      bucket
      key
      url
      unsignedUrl
    }
  }`;

  const QUERY_WITH_ALL_THREE = `query {
    getSignedWritableUrl(
      key: "reports/2026/Q3 Financial Summary.pdf"
      type: "PrE#view"
      path: "../../evil"
    ) {
      bucket
      key
      url
      unsignedUrl
    }
  }`;

  const PLURAL_QUERY_WITH_TYPE_AND_PATH = `query {
    getSignedWritableUrls(number: 2, type: "preview", path: "tdo#123") {
      bucket
      key
      url
      unsignedUrl
    }
  }`;

  // The whole server-generated shape: {orgId}/{type}/{y}/{m}/{d}/{generated}.
  const generatedKeyShape = () =>
    new RegExp(
      `^${isolatedSuperadmin.orgId}/other/\\d{4}/\\d{1,2}/\\d{1,2}/[0-9a-f-]{36}_\\d+-\\d+-\\d+$`
    );

  const deprecationWarningFor = (response: any, parameter: string) =>
    _.get(response, 'warnings', []).find(
      (w: any) =>
        w.errorName === 'api_deprecated_field' &&
        _.get(w, 'data.parameter') === parameter
    );

  it('ignores the supplied key, type and path in key, url and unsignedUrl', async () => {
    const response = await isolatedSuperadmin.client.query(
      QUERY_WITH_ALL_THREE
    );
    const res = _.get(response, 'getSignedWritableUrl');

    expect(res).toBeDefined();
    expect(res.key).toBeDefined();

    for (const field of ['key', 'url', 'unsignedUrl'] as const) {
      const value = res[field];
      expect(value).toBeDefined();
      for (const sent of ['Financial', 'Summary', 'reports', 'preview',
        'PrE', 'evil']) {
        expect(value).not.toContain(sent);
      }
    }
    expect(res.key).not.toContain('..');
    expect(res.key).not.toContain('#');
  });

  it.each(['key', 'type', 'path'])(
    'returns a deprecation warning for %s when all three are supplied',
    async (parameter) => {
      const response = await isolatedSuperadmin.client.query(
        QUERY_WITH_ALL_THREE
      );
      const deprecation = deprecationWarningFor(response, parameter);

      expect(deprecation).toBeDefined();
      expect(_.get(deprecation, 'data.field')).toEqual('getSignedWritableUrl');
      expect(_.get(deprecation, 'data.expirationDate')).toBeDefined();
      expect(_.get(deprecation, 'data.expired')).toEqual(false);
    }
  );

  it('returns NO deprecation warning when the key is omitted', async () => {
    // the direction that regresses silently: a warning on every keyless call
    // would be noise for every well-behaved client.
    const response = await isolatedSuperadmin.client.query(QUERY_WITHOUT_KEY);

    expect(deprecationWarningFor(response, 'key')).toBeUndefined();
    expect(_.get(response, 'getSignedWritableUrl.key')).toBeDefined();
  });

  it('returns exactly three warnings, one per supplied parameter', async () => {
    const response = await isolatedSuperadmin.client.query(
      QUERY_WITH_ALL_THREE
    );
    const parameters = _.get(response, 'warnings', [])
      .filter((w: any) => w.errorName === 'api_deprecated_field')
      .map((w: any) => _.get(w, 'data.parameter'));

    expect(_.sortBy(parameters)).toEqual(['key', 'path', 'type']);
  });

  it('generates the whole key server-side in six segments', async () => {
    // The shape is the point: asserting only the ABSENCE of the caller's input
    // would also pass on an empty or truncated key. Six segments —
    // {orgId}/{type}/{y}/{m}/{d}/{generated} — with the org still honored, the
    // former `type` a fixed literal, and the former `path` segment removed.
    const response = await isolatedSuperadmin.client.query(
      QUERY_WITH_ALL_THREE
    );
    const key = _.get(response, 'getSignedWritableUrl.key') as string;

    expect(key).toMatch(generatedKeyShape());
  });

  it('produces the same key shape with and without the deprecated arguments', async () => {
    const shape = (k: string) =>
      k.replace(/[0-9a-f-]{36}_\d+-\d+-\d+$/, '<generated>');

    const withArgs = await isolatedSuperadmin.client.query(
      QUERY_WITH_ALL_THREE
    );
    const withoutArgs = await isolatedSuperadmin.client.query(
      QUERY_WITHOUT_KEY
    );

    expect(shape(_.get(withArgs, 'getSignedWritableUrl.key') as string)).toEqual(
      shape(_.get(withoutArgs, 'getSignedWritableUrl.key') as string)
    );
  });

  // getSignedWritableUrls shares internalGetSignedWritableUrl with the singular
  // query, so its type/path are discarded by the same code and it is annotated
  // on the same schedule. Without these legs the plural is untested even though
  // its behavior changes identically.
  it.each(['type', 'path'])(
    'returns a deprecation warning for %s on the plural getSignedWritableUrls',
    async (parameter) => {
      const response = await isolatedSuperadmin.client.query(
        PLURAL_QUERY_WITH_TYPE_AND_PATH
      );
      const deprecation = deprecationWarningFor(response, parameter);

      expect(deprecation).toBeDefined();
      expect(_.get(deprecation, 'data.field')).toEqual('getSignedWritableUrls');
      expect(_.get(response, 'getSignedWritableUrls')).toHaveLength(2);
    }
  );

  it('ignores type and path on the plural getSignedWritableUrls', async () => {
    const response = await isolatedSuperadmin.client.query(
      PLURAL_QUERY_WITH_TYPE_AND_PATH
    );
    const results = _.get(response, 'getSignedWritableUrls', []);

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.key).toMatch(generatedKeyShape());
      expect(r.key).not.toContain('preview');
      expect(r.key).not.toContain('tdo');
      expect(r.key).not.toContain('#');
    }
    // a bulk request must still mint a distinct object per URL
    expect(results[0].key).not.toEqual(results[1].key);
  });
});
