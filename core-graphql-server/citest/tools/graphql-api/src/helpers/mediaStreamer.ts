import * as fs from 'node:fs';
import * as path from 'node:path';
import _ from 'lodash';

import { helpers } from './index';
import { loadConfig } from '../config';
import type { GraphqlClient } from '../graphqlUtil';

/**
 * TS port of the legacy `citest/helpers/mediaStreamer.js`. Only the pieces
 * `test/mediaSteamer/mediaStreamer.spec.ts` actually exercises are ported
 * (`createStreamManifestTdo`, `addMediaChunks`, and their internals) - the
 * legacy file's unused `getAssetsWithRetry` is dropped.
 */

const DATA_DIR = path.join(__dirname, '../../../../data');

/**
 * `getSignedWritableUrl` builds its presigned URL from the graphql server's
 * own minio config, whose `endPoint` is the Docker-internal hostname `minio`
 * (see runall/config/graphql.json) - unreachable from the Jest process
 * running on the host. MinIO presigned URLs bake the host into the
 * signature, so the host can't just be swapped for `localhost`; instead
 * route through the nginx `/minio` proxy (see `citest/helpers/virtualAsset.js`
 * `rewriteDockerHostname`), which forwards with `Host: minio:9000` and keeps
 * the signature valid.
 */
function rewriteMinioUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname !== 'minio') {
    return url;
  }
  const nginxBase = new URL(loadConfig().graphql_url).origin;
  return `${nginxBase}/minio${parsed.pathname}${parsed.search}`;
}

async function uploadToS3(
  gqlClient: GraphqlClient,
  filePath: string,
  contentType: string
): Promise<{ signed: string; unsigned: string }> {
  const filename = path.basename(filePath);
  const resolvedPath = path.resolve(DATA_DIR, filename);
  if (!resolvedPath.startsWith(DATA_DIR + path.sep)) {
    throw new Error(`File path is outside the citest data directory: ${filePath}`);
  }

  // `getSignedWritableUrl`'s generated SDK document takes zero variables -
  // it can't express the `key:` argument used here - raw query.
  const query = `
  query {
    getSignedWritableUrl (key: "${_.split(filename, '.')[0]}") {
      url
      getUrl
      unsignedUrl
    }
  }
  `;
  const response = await gqlClient.query(query);
  const writable = response.getSignedWritableUrl;
  const putUrl = rewriteMinioUrl(writable.url);

  const file = fs.createReadStream(resolvedPath);
  const size = fs.statSync(resolvedPath).size;

  await helpers
    .supertest(putUrl)
    .put('')
    .set({
      'Content-Type': contentType,
      'Content-Length': size.toString()
    })
    .attach('file', file);

  return {
    signed: writable.getUrl,
    unsigned: writable.unsignedUrl
  };
}

export async function createStreamManifestTdo(
  gqlClient: GraphqlClient,
  opts: { type: string; mimeType: string; startTimestamp: number; stopTimestamp: number }
): Promise<{ id: string }> {
  // Only `.id` is consumed by callers - createTDO's generated selection
  // ({id, name, startDateTime, stopDateTime, details, sourceData, jobs})
  // covers that, so the SDK is used here (the legacy hand-written query also
  // selected `streamManifest`, but nothing downstream ever read it).
  const result = await gqlClient.sdk.createTDO({
    input: {
      status: 'uploaded',
      isPublic: true,
      startDateTime: opts.startTimestamp,
      stopDateTime: opts.stopTimestamp,
      details: {
        veritoneFile: {
          mimetype: opts.mimeType
        }
      }
    }
  });
  return { id: result?.data?.createTDO?.id ?? '' };
}

async function updateTdo(gqlClient: GraphqlClient, tdoId: string) {
  // updateTDO's generated selection ({id, name, details,
  // streamManifest{segments, initSegment}}) covers what this needs - use
  // the SDK. (Finalizes the init segment.)
  return gqlClient.sdk.updateTDO({
    input: {
      id: tdoId,
      status: 'recorded'
    }
  });
}

interface MediaChunk {
  file: string;
  start: number;
  stop: number;
  segDurationMs?: number;
}

export async function addMediaChunks(
  gqlClient: GraphqlClient,
  tdoId: string,
  type: string,
  contentType: string,
  chunks: MediaChunk[]
): Promise<string> {
  const files = chunks.map((ch) => ch.file);

  // upload chunks
  const urls = await Promise.all(
    files.map((file) => uploadToS3(gqlClient, file, contentType))
  );

  const groupId = '0adfa9f1-2d32-4194-99e7-fa3bc93a5bff';
  const duration = chunks[0].segDurationMs;

  await addInitSegment(gqlClient, {
    type: type || 'video',
    tdoId,
    groupId,
    duration,
    url: urls[0].unsigned
  });

  for (let i = 0; i < chunks.length; i++) {
    await addMediaSegment(gqlClient, {
      index: i,
      type: type || 'video',
      tdoId,
      groupId,
      duration,
      start: chunks[i].start,
      stop: chunks[i].stop,
      url: urls[i].unsigned
    });
  }

  await updateTdo(gqlClient, tdoId); // this will finalize the init segment
  return tdoId;
}

async function addInitSegment(
  gqlClient: GraphqlClient,
  opts: { type: string; tdoId: string; groupId: string; duration?: number; url: string }
) {
  const codecs = opts.type === 'audio' ? 'mp3' : 'avc1.64001e,mp4a.40.2';
  // addMediaSegment's generated selection ({id}) matches exactly what's
  // needed - use the SDK.
  return gqlClient.sdk.addMediaSegment({
    input: {
      containerId: opts.tdoId,
      details: {
        codecs,
        segmentGroupId: opts.groupId,
        targetSegmentDurationMs: opts.duration
      },
      url: opts.url
    }
  });
}

async function addMediaSegment(
  gqlClient: GraphqlClient,
  opts: {
    index: number;
    type: string;
    tdoId: string;
    groupId: string;
    duration?: number;
    start: number;
    stop: number;
    url: string;
  }
) {
  return gqlClient.sdk.addMediaSegment({
    input: {
      containerId: opts.tdoId,
      details: {
        segmentDurationMs: opts.duration,
        segmentGroupId: opts.groupId,
        segmentIndex: opts.index,
        segmentStartTimeMs: opts.start,
        segmentStopTimeMs: opts.stop
      },
      url: opts.url
    }
  });
}
