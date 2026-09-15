import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import extract from 'extract-zip';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import rimraf from 'rimraf';
import { snakeCase } from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import { helpers } from '../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { TestUtils } from '../../src/testUtils';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import { processTDODeletion } from '../../src/helpers/tdoHelper';
import {
  DeploymentModel,
  ExportRequestStatus,
  TaskStatus
} from '../../src/gql';

interface CitestGlobals {
  citestMarker?: string;
}
const citestMarker =
  (globalThis as CitestGlobals).citestMarker || 'citest-should-delete';

// Any category works here — the job created against this engine uses
// testTask: true, which bypasses engine approval/verification, so this
// doesn't need to be a "real", fully-configured engine.
const ENGINE_CATEGORY_ID = '4be1a1b2-653d-4eaa-ba18-747a265305d8';

const config = helpers.config;
const eventingEnabled = helpers.canTestEventing();

const now = Date.now();
const nowMinus15 = now - 15 * 60 * 1000;
const nowMinus30 = now - 30 * 60 * 1000;

const sourceId = '-1'; // private source
const videoUploadName = 'movie.mp4';
const videoUploadPath = path.join(__dirname, '../../../../data/movie.mp4');
const formats = ['srt', 'ttml', 'txt', 'vtt'];

// The engine result payload uploaded via `uploadEngineResult` below. `output`
// gets `sourceEngineId`/`sourceEngineName` filled in once the dedicated citest
// engine is resolved, and `taskId` is filled in once the job's task is created.
const engineResultJson: any = {
  output: {
    generatedDateUTC: '0001-01-01T00:00:00Z',
    series: [
      {
        startTimeMs: 80,
        stopTimeMs: 330,
        words: [
          {
            word: 'Language',
            confidence: 0.36,
            bestPath: true,
            utteranceLength: 1
          }
        ],
        language: 'en'
      },
      {
        startTimeMs: 370,
        stopTimeMs: 540,
        words: [
          {
            word: 'is',
            confidence: 0.64,
            bestPath: true,
            utteranceLength: 1
          }
        ],
        language: 'en'
      }
    ]
  }
};

// Export request IDs come from our own GraphQL server response, but the SAST
// scanner can't verify that, so strip path separators/traversal before using
// any of them to build a filesystem path.
function sanitizeForPath(value: string): string {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, '');
}

const tempFolder = path.join('/tmp', sanitizeForPath(`citest-${Date.now()}`));

// extract-zip@1.7.0 is callback-only.
// Wrapping it in a promise and awaiting it keeps the assertions inside the test that owns them.
function extractZip(zipPath: string, dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    extract(zipPath, { dir }, (err: any) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function downloadFile(
  uri: string,
  exportRequestId: string
): Promise<string> {
  // Build the destination path here from `tempFolder` (already sanitized)
  // plus a freshly sanitized id, rather than accepting a pre-built path —
  // that keeps this fs sink from ever touching unsanitized input directly.
  const fileName = path.join(
    tempFolder,
    `${sanitizeForPath(exportRequestId)}.zip`
  );
  // The assetUri is a signed S3/MinIO URL. In local/citest environments MinIO
  // is served over plain http, while real S3 always uses https. Only allow
  // the http fallback for the local/citest MinIO host itself — anything else
  // over http would be a cleartext-transmission risk (CWE-319; see the
  // guard-not-suppress pattern used for the same class of finding in
  // VE-21961's graphql-client.js) — and refuse to proceed otherwise.
  const { protocol, hostname } = new URL(uri);
  const isLocalMinio = hostname === 'minio' || hostname === 'localhost' || hostname === '127.0.0.1';
  if (protocol === 'http:' && !isLocalMinio) {
    throw new Error(
      `Refusing to download over cleartext http from untrusted host '${hostname}'`
    );
  }
  const httpClient = protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const request = httpClient.get(uri, (response) => {
      const file = fs.createWriteStream(fileName);
      response.pipe(file);
      file.on('error', (err) => {
        reject(err);
      });
      file.on('finish', () => {
        resolve(fileName);
      });
    });
    // A connection-level failure (e.g. DNS resolution, like `minio` being
    // unresolvable outside the docker-compose network this citest suite
    // normally runs in) fires 'error' on the request itself, not through the
    // response/file handlers above — without this, an unresolvable host
    // hangs the test for its full timeout instead of failing with the real
    // error.
    request.on('error', (err) => {
      reject(err);
    });
  });
}

describe('citest_export: Export request tests', () => {
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let client: GraphqlClient;

  let tdoId: string;
  let jobId: string;
  let taskId: string;
  let assetId: string;
  let engineId: string;
  let engineDisplayName: string;
  let engineSnackName: string;
  let exportRequestId: string;
  let assetUri: string | undefined;
  let exportRequestId2: string;
  let assetUri2: string | undefined;

  // T46: This suite previously ran on the SHARED superadmin session
  // (sys_graphql_citest_superadmin), which is an admin MEMBER of every test org it creates
  // (createOrganization enrolls the caller via addAdminToOrganization). Many concurrent specs
  // delete their test org in teardown; org-delete enumerates all active members of that org and
  // calls removeAllUserSessions(userId) on each — which is GLOBAL, not org-scoped, and deletes
  // every one of the superadmin's session tokens, including this suite's, at any point during the
  // run. Fix: use a throwaway superadmin that is a member of no org except its own, so no other
  // spec's org-delete/user-delete can ever enumerate or kill its session.
  beforeAll(async () => {
    const env = config.env;
    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    client = isolatedSuperadmin.client;

    // This suite used to rely on a pre-existing "citest"-named engine, which
    // isn't seeded in every environment. Create a dedicated throwaway engine
    // instead, mirroring the pattern in test/helpers/ingestSlug.helper.ts.
    const engineResult = await client.sdk.createEngine({
      input: {
        name: `${citestMarker}-export-request-engine-${uuidv4()}`,
        categoryId: ENGINE_CATEGORY_ID,
        deploymentModel: DeploymentModel.FullyNetworkIsolated
      }
    });
    const engine = engineResult?.data?.createEngine;
    if (!engine?.id || !engine?.name) {
      throw new Error('createEngine returned no engine id/name');
    }
    engineId = engine.id;
    engineDisplayName = engine.name;
    engineSnackName = snakeCase(engineDisplayName);
    engineResultJson.output.sourceEngineId = engineId;
    engineResultJson.output.sourceEngineName = engineDisplayName;
  });

  afterAll(async () => {
    if (engineId) {
      await safe(`delete engine ${engineId}`, () =>
        client.sdk.deleteEngine({ id: engineId })
      );
    }
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  it('create TDOs', async () => {
    const res = await client.sdk.createTDO({
      input: {
        startDateTime: nowMinus30,
        stopDateTime: nowMinus15,
        sourceData: { sourceId }
      }
    });
    tdoId = res?.data?.createTDO?.id as string;
    expect(tdoId).toBeDefined();
  });

  it('create a job', async () => {
    const res = await client.sdk.createJob({
      input: {
        retries: 1,
        targetId: tdoId,
        tasks: [
          {
            testTask: true,
            engineId,
            payload: { target: 'it' }
          }
        ]
      }
    });

    jobId = res?.data?.createJob?.id as string;
    taskId = res?.data?.createJob?.tasks?.records?.[0]?.id as string;
    expect(jobId).toBeDefined();
  });

  // if getting 413 "Payload Too Large" in ai13s update nginx config in the cluster:
  // https://github.com/veritone/aiware-charts/pull/847/files#diff-e697c20399d8f7b93b8875c7c19c174c5aab5b223c8ccffbc2fe6f72c56bb4a5R38
  it('create asset with media', async () => {
    // Multipart file upload — no generated SDK operation can attach a binary
    // file, so this stays a raw query through `uploadFile`.
    const queryWithVideo = `mutation {
      createAsset(input: {
        containerId: "${tdoId}"
        contentType: "video/mp4"
        description: "a video file"
        assetType: "media"
        setAsPrimary: true
      }) {
        id
        uri
        assetType
      }
    }`;

    const result = await client.uploadFile(
      queryWithVideo,
      videoUploadName,
      videoUploadPath
    );
    const body = JSON.parse(result.text);
    assetId = body?.data?.createAsset?.id;
    expect(assetId).toBeDefined();
  });

  it('upload engine result', async () => {
    engineResultJson.taskId = taskId;
    engineResultJson.output.taskId = taskId;

    const res = await client.sdk.uploadEngineResult({
      input: engineResultJson
    });
    expect(res?.data?.uploadEngineResult).toBeDefined();
  });

  it('return engine results', async () => {
    const res = await client.sdk.engineResults({
      tdoId,
      engineIds: [engineId]
    });

    const engineResults = res?.data?.engineResults;
    expect(engineResults).toBeDefined();
    expect(engineResults?.records?.[0]?.jsondata).toBeDefined();
  });

  it('create an export request', async () => {
    const result = await client.sdk.createExportRequest({
      input: {
        includeMedia: false,
        outputConfigurations: [
          {
            engineId,
            formats: [
              { extension: 'srt' },
              { extension: 'ttml' },
              { extension: 'txt' },
              { extension: 'vtt' }
            ]
          }
        ],
        tdoData: [{ tdoId }]
      }
    });

    exportRequestId = result?.data?.createExportRequest?.id;
    expect(exportRequestId).toBeDefined();
    expect(result?.data?.createExportRequest?.status).toEqual(
      ExportRequestStatus.Incomplete
    );
  });

  it('create an export request include media', async () => {
    const result = await client.sdk.createExportRequest({
      input: {
        includeMedia: true,
        outputConfigurations: [
          {
            engineId,
            formats: [
              { extension: 'srt' },
              { extension: 'ttml' },
              { extension: 'txt' },
              { extension: 'vtt' }
            ]
          }
        ],
        tdoData: [{ tdoId }]
      }
    });

    exportRequestId2 = result?.data?.createExportRequest?.id;
    expect(exportRequestId2).toBeDefined();
    expect(result?.data?.createExportRequest?.status).toEqual(
      ExportRequestStatus.Incomplete
    );
  });

  // NOTE: the downloadFile step below fetches the signed S3/MinIO assetUri
  // directly (`minio:9000` in local/citest), which only resolves from inside
  // the docker-compose network. Running this file via the containerized
  // citest-runner (real CI, and `make compose-citest-up` locally) works;
  // running `npm run citest` directly on a host shell will fail this specific
  // assertion with `getaddrinfo EAI_AGAIN minio` even though the export
  // pipeline itself completed successfully (verify via the exportRequest
  // status/assetUri fields, or the DB row, if debugging from a host shell).
  it('get an export request and download result', async () => {
    let result: any = await client.sdk.exportRequest({
      id: exportRequestId
    });
    expect(result?.data?.exportRequest?.id).toEqual(exportRequestId);
    if (eventingEnabled) {
      console.log('Testing core eventing occurred with Export Request...');
      // core-eventing processes the export request asynchronously (query
      // mentions -> build zip -> upload to S3 -> mark complete), so poll
      // for completion instead of racing a fixed sleep against it.
      await TestUtils.waitFor(
        async () => {
          result = await client.sdk.exportRequest({ id: exportRequestId });
          return (
            result?.data?.exportRequest?.status === ExportRequestStatus.Complete
          );
        },
        120000,
        20000
      );
      expect(result?.data?.exportRequest?.status).toEqual(
        ExportRequestStatus.Complete
      );
      assetUri = result?.data?.exportRequest?.assetUri;
      expect(assetUri).toBeDefined();

      const safeExportRequestId = sanitizeForPath(exportRequestId);
      const fileName = path.join(tempFolder, `${safeExportRequestId}.zip`);
      const extractDir = path.join(tempFolder, safeExportRequestId);

      if (!fs.existsSync(tempFolder)) {
        fs.mkdirSync(tempFolder);
      }
      // download export request and verify result
      await downloadFile(assetUri as string, exportRequestId);

      try {
        await extractZip(fileName, extractDir);
      } catch (err) {
        throw new Error(`Cannot extract: ${fileName}`);
      }
      // check extract file with right format
      for (const extension of formats) {
        const filePath = path.join(
          extractDir,
          engineSnackName,
          extension,
          `${tdoId}.${extension}`
        );
        expect(fs.existsSync(filePath)).toEqual(true);
      }
    } else {
      console.log('Skip testing core eventing occurred with Export Request...');
    }
  });

  // NOTE: same minio-hostname-resolution as 'get an export request and download result' above.
  it('get an export request for media includes the media', async () => {
    let result: any = await client.sdk.exportRequest({
      id: exportRequestId2
    });
    expect(result?.data?.exportRequest?.id).toEqual(exportRequestId2);
    if (eventingEnabled) {
      console.log('Testing core eventing occurred with Export Request...');

      // core-eventing processes the export request asynchronously (query
      // mentions -> build zip -> upload to S3 -> mark complete), so poll
      // for completion instead of racing a fixed sleep against it.
      await TestUtils.waitFor(
        async () => {
          result = await client.sdk.exportRequest({ id: exportRequestId2 });
          return (
            result?.data?.exportRequest?.status === ExportRequestStatus.Complete
          );
        },
        120000,
        20000
      );
      expect(result?.data?.exportRequest?.status).toEqual(
        ExportRequestStatus.Complete
      );
      assetUri2 = result?.data?.exportRequest?.assetUri;
      expect(assetUri2).toBeDefined();

      const safeExportRequestId2 = sanitizeForPath(exportRequestId2);
      const fileName2 = path.join(tempFolder, `${safeExportRequestId2}.zip`);
      const extractDir2 = path.join(tempFolder, safeExportRequestId2);

      if (!fs.existsSync(tempFolder)) {
        fs.mkdirSync(tempFolder);
      }
      await downloadFile(assetUri2 as string, exportRequestId2);

      try {
        await extractZip(fileName2, extractDir2);
      } catch (err) {
        throw new Error(`Cannot extract: ${fileName2}`);
      }
      // check extract file with right format
      for (const extension of formats) {
        const filePath = path.join(
          extractDir2,
          engineSnackName,
          extension,
          `${tdoId}.${extension}`
        );
        expect(fs.existsSync(filePath)).toEqual(true);
      }
      // check download media file
      const mediaFilePath = path.join(extractDir2, 'Media', `${tdoId}.mp4`);
      expect(fs.existsSync(mediaFilePath)).toEqual(true);
    }
  });

  it('update an export request to downloaded', async () => {
    // The generated updateExportRequest SDK method is single-root, so the two
    // updates that used to be aliased into one batched document are now two
    // separate round trips.
    const result1 = await client.sdk.updateExportRequest({
      id: exportRequestId,
      status: ExportRequestStatus.Downloaded,
      assetUri
    });
    const result2 = await client.sdk.updateExportRequest({
      id: exportRequestId2,
      status: ExportRequestStatus.Downloaded,
      assetUri: assetUri2
    });
    expect(result1?.data?.updateExportRequest?.id).toEqual(exportRequestId);
    expect(result1?.data?.updateExportRequest?.status).toEqual(
      ExportRequestStatus.Downloaded
    );
    expect(result2?.data?.updateExportRequest?.id).toEqual(exportRequestId2);
    expect(result2?.data?.updateExportRequest?.status).toEqual(
      ExportRequestStatus.Downloaded
    );
  });

  // cancel jobs
  it('cancel jobs if still running', async () => {
    const res = await client.sdk.job({ id: jobId });
    // if the job is completed it can't be cancelled
    if (res?.data?.job?.status === TaskStatus.Complete) {
      return;
    }

    await client.sdk.cancelJob({ id: jobId });
  });

  // delete TDOs
  it('delete TDOs', async () => {
    // updates job status and delete TDO
    const result: any = await processTDODeletion(client, tdoId);
    expect(result?.data?.deleteTDO?.id).toEqual(tdoId);
  });

  it('delete temp folder download export request', () => {
    if (fs.existsSync(tempFolder)) {
      rimraf(tempFolder, (err: Error | null) => {
        expect(err).toEqual(null);
      });
    }
  });
});
