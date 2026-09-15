import * as path from 'path';
import helpers from '@citest/helpers/index';
import tdoHelper from '@citest/helpers/tdo';
import { safe } from '@citest/helpers/cleanup/utils';
import {
  generateEngineActivated,
  deleteEngineInfoGenerated
} from '@citest/helpers/engine';
import _ from 'lodash';
import moment from 'moment';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '@api/src/graphqlUtil';
import { CREATE_ASSET } from '@api/src/queries/extracted/tdo';
import {
  EngineState,
  SourcePermission,
  TaskStatus,
  TdoCleanupOption,
  TemporalDataObjectDateTimeField
} from '@api/src/gql/gql';
import type { ServerFeatureFlags } from '@api/test/helpers/featureFlags';

const config = helpers.config;
const env = config.env;

/**
 * Fixture paths resolve from __dirname, not the process cwd: cwd-relative paths
 * work under Jest but not under `bun test`, which runs from graphql-api/.
 */
const dataDir = path.join(__dirname, '..', '..', '..', '..', 'data');

interface EngineInfo {
  engine: { id: string; name: string };
  engineBuild: { id: string };
}
let engineInfo: EngineInfo | null = null;

/**
 * Populated before test collection by jest.global.setup.js (jest) and
 * test/setup.ts (bun), so it is safe to gate `itif` on at collection time.
 */
interface CitestGlobals extends ServerFeatureFlags {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';
const virtualAssetEnabled = citestGlobals.virtualAssetEnabled || false;

/** Run a case only when `condition` holds; otherwise register it as skipped. */
const itif = (condition: boolean, name: string, fn: () => Promise<void>) =>
  condition ? it(name, fn) : it.skip(name, fn);
const isLocal = env.includes('local');

describe('citest_tdo: TDO delete test', () => {
  const authUrl = `https://api.${env}.veritone.com/v1`;
  const url = config.graphql_url || authUrl;
  let tdoId: string | null;
  let assetId: string | null;
  let jobId: string | null;
  let taskId: string | null;
  let assetUri: string | null;
  let engineId: string | null;
  let uploadUrl1: string | null;
  let uploadUrl2: string | null;
  let getUrl1: string | null;
  let getUrl2: string | null;
  let sourceId: string | null;
  let organizationId: string | null;
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();

    const me = await gqlClient.sdk.me({});
    organizationId = _.get(me, 'data.me.organization.id', null);
    expect(organizationId).toBeDefined();
    const engineName = `${citestMarker}-citest-engine-${Date.now()}-${organizationId}`;

    engineInfo = await generateEngineActivated(gqlClient, {
      engineName
    });
  });

  afterAll(async () => {
    await safe('delete engine build and engine', async () => {
      await deleteEngineInfoGenerated(gqlClient, {
        engineBuildId: engineInfo!.engineBuild.id,
        engineId: engineInfo!.engine.id
      });
    });
  });

  it(' get URL and an engine', async () => {
    /** Update to ignore sourceTypeId = 5
     *  since recDelTest.spec.ts and source.spec.ts may run in parallel
     *  so the Source in source.spec.ts might be get here
     *  when it was deleted in source.spec.ts
     *  So it will cause the citest failure (The requested object was not found)
     */
    const result = await gqlClient.sdk.writableUrlsEngineAndSource({
      number: 2,
      path: 'tdo_apitest',
      type: 'asset',
      engineId: engineInfo!.engine.id,
      engineState: [EngineState.Active],
      sourcePermission: SourcePermission.Owner
    });

    uploadUrl1 = _.get(result, 'data.getSignedWritableUrls[0].url', null);
    uploadUrl2 = _.get(result, 'data.getSignedWritableUrls[1].url', null);
    getUrl1 = _.get(result, 'data.getSignedWritableUrls[0].unsignedUrl', null);
    getUrl2 = _.get(result, 'data.getSignedWritableUrls[1].unsignedUrl', null);
    engineId = _.get(result, 'data.engines.records[0].id', null);
    expect(engineId).toBeDefined();
    sourceId = _.get(result, 'data.sources.records[0].id', null);
    expect(sourceId).toBeDefined();
  });

  const runOnlyInMinioLocalCompose = (signedUrl: string | null): boolean => {
    return signedUrl !== null && signedUrl.includes('//minio:9000');
  };

  it('upload first file', async () => {
    if (runOnlyInMinioLocalCompose(uploadUrl1)) {
      if (isLocal) return;
      await helpers
        .supertest(uploadUrl1 as string)
        .put('')
        .attach('file', path.join(dataDir, 'movie_clip.mov'))
        .expect(200);
    }
  });

  it('upload next file', async () => {
    if (runOnlyInMinioLocalCompose(uploadUrl1)) {
      if (isLocal) return;

      await helpers
        .supertest(uploadUrl2 as string)
        .put('')
        .attach('file', path.join(dataDir, 'movie_clip.mov'))
        .expect(200);
    }
  });

  it('create a TDO', async () => {
    const startDateTime = moment().subtract(60, 'minute');
    const stopDateTime = moment().subtract(30, 'minute');
    const result = await gqlClient.sdk.createTDOWithAssets({
      input: {
        status: 'uploaded',
        name: `${citestMarker}-${startDateTime.unix()}`,
        startDateTime: startDateTime.unix(),
        stopDateTime: stopDateTime.valueOf(),
        assets: [
          {
            assetType: 'media',
            contentType: 'video/quicktime',
            uri: getUrl1
          },
          {
            assetType: 'media',
            contentType: 'video/quicktime',
            uri: getUrl2,
            setAsPrimary: true
          }
        ],
        sourceData: {
          sourceId
        }
      }
    });

    tdoId = _.get(result, 'data.createTDO.id', null);
    expect(tdoId).toBeDefined();
    expect(_.get(result, 'data.createTDO.isPublic', null)).toEqual(false);
    expect(_.get(result, 'data.createTDO.organizationId', null)).toBeDefined();
    expect(_.get(result, 'data.createTDO.organization.id', null)).toBeDefined();
    expect(_.get(result, 'data.createTDO.assets.records[0].id', null)).toBeDefined();
    expect(_.get(result, 'data.createTDO.assets.records[1].id', null)).toBeDefined();
    expect(_.get(result, 'data.createTDO.primaryAsset.id', null)).toBeDefined();
    /** Below checks that we converted a couple of different integer date formats correctly --
     *  ms and also the legacy epoch/seconds format.
     */
    expect(_.get(result, 'data.createTDO.startDateTime', null)).toEqual(
      moment(startDateTime.unix() * 1000).toISOString()
    );
    expect(_.get(result, 'data.createTDO.stopDateTime', null)).toEqual(
      stopDateTime.toISOString()
    );
  });

  it('upload an asset', async () => {
    const res = await gqlClient.uploadFile(
      CREATE_ASSET,
      'movie.mp4',
      path.join(dataDir, 'movie.mp4'),
      undefined,
      {
        input: {
          containerId: tdoId,
          contentType: 'video/mp4',
          description: 'my test asset',
          jsondata: {
            size: 3372034,
            fileName: 'sw8-short.mov'
          },
          type: 'media'
        }
      }
    );
    const body = JSON.parse(res.text);
    assetId = _.get(body, 'data.createAsset.id', null);
    expect(assetId).toBeDefined();
    assetUri = _.get(body, 'data.createAsset.signedUri', null);
    expect(assetUri).toBeTruthy();
  });

  /**
   * signedUri only carries the raw storage path while the virtual-asset feature
   * is OFF. With `virtualAssetEnabled` on, Asset.signedUri returns a JWT
   * indirection URL (`<apiRoot>/<version>/asset/<JWT>`) instead, so this shape
   * assertion cannot hold — the case is skipped rather than rewritten, because
   * the virtual-asset URL shape is already asserted by
   * virtualAsset.spec.ts ("Case 2: signedUri is a virtual-asset JWT URL").
   *
   * The upload itself stays unconditional above: assetId/assetUri feed the
   * deletion cases further down.
   */
  itif(
    !virtualAssetEnabled,
    'asset signedUri points at the raw storage path',
    async () => {
      const now = moment.utc();
      expect(assetUri).toEqual(
        expect.stringContaining(
          `/${organizationId}/asset/${now.year()}/${now.month()}/${now.day()}/${tdoId}`
        )
      );
    }
  );

  it('fail to create asset with overlarge metadata', async () => {
    await expect(
      gqlClient.sdk.createAsset({
        input: {
          containerId: tdoId,
          assetType: 'media',
          uri: 'http://localhost/',
          details: {
            // make details too big
            str: _.pad('test', 1200000)
          }
        }
      })
    ).rejects.toThrow('invalid_input');
  });

  it('fail to create TDO with overlarge metadata', async () => {
    await expect(
      gqlClient.sdk.createTDO({
        input: {
          name: `${citestMarker}-${moment().toISOString()}`,
          startDateTime: moment().subtract(1, 'hour').toISOString(),
          stopDateTime: moment().toISOString(),
          details: {
            // make details too big
            str: _.pad('test', 1200000)
          }
        }
      })
    ).rejects.toThrow('invalid_input');
  });

  it('create a job', async () => {
    const result = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        tasks: [{ engineId }]
      }
    });
    jobId = _.get(result, 'data.createJob.id', null);
    expect(jobId).toBeDefined();
    taskId = _.get(result, 'data.createJob.tasks.records[0].id', null);
  });

  it('update the task', async () => {
    const result = await gqlClient.sdk.updateTask({
      input: {
        id: taskId as string,
        status: TaskStatus.Complete,
        jobId: jobId as string,
        output: { foo: 'bar' }
      }
    });
    expect(_.get(result, 'data.updateTask.id', null)).toEqual(taskId);
  });

  it('delete task data', async () => {
    const result = await gqlClient.sdk.cleanupTDO({
      id: tdoId as string,
      options: [TdoCleanupOption.EngineResults]
    });

    expect(_.get(result, 'data.cleanupTDO.id', null)).toEqual(tdoId);
  });

  it('delete search index data', async () => {
    const result = await gqlClient.sdk.cleanupTDO({
      id: tdoId as string,
      options: [TdoCleanupOption.SearchIndex]
    });

    expect(_.get(result, 'data.cleanupTDO.id', null)).toEqual(tdoId);
  });

  it('find task output deleted', async () => {
    const result = await gqlClient.sdk.taskOutputAndAssetTransform({
      taskId: taskId as string,
      assetId: assetId as string
    });

    /** TODO when we turn errorOnInvalidTransformContentType on by default,
     *  switch this error condition. for now it's in warn-only mode.
     *  expect(_.get(response, 'body.errors.length')).toEqual(1);
     *  expect(_.get(response, 'body.errors[0].name')).toEqual('invalid_input');
     */
    expect(_.get(result, 'data.task.id', null)).toEqual(taskId);
    expect(_.get(result, 'data.task.output.foo', null)).toBeNull();
    expect(_.get(result, 'data.asset.id', null)).toEqual(assetId);
    expect(_.get(result, 'data.asset.transform', null)).toEqual('');
  });

  it('delete asset data', async () => {
    const result = await gqlClient.sdk.cleanupTDO({
      id: tdoId as string,
      options: [TdoCleanupOption.Storage]
    });

    expect(_.get(result, 'data.cleanupTDO.id', null)).toEqual(tdoId);
  });

  it('find S3 object deleted', async () => {
    if (isLocal) return;
    await helpers.supertest(assetUri as string).get('').expect(404);
  });

  it('find asset content deleted but not asset', async () => {
    const result = await gqlClient.sdk.assetAndTemporalDataObject({
      assetId: assetId as string,
      tdoId: tdoId as string
    });

    expect(_.get(result, 'data.temporalDataObject.id', null)).toEqual(tdoId);
    expect(_.get(result, 'data.asset.id', null)).toEqual(assetId);
    expect(_.get(result, 'data.asset.uri', null)).toEqual(null);
    expect(_.get(result, 'data.asset.signedUri', null)).toEqual(null);
  });

  it('delete the TDO', async () => {
    // updates job status and delete TDO
    const result = await tdoHelper.processTDODeletion(gqlClient, tdoId);

    expect(_.get(result, 'deleteTDO.id', null)).toEqual(tdoId);
  });

  it('find TDO and asset to be deleted', async () => {
    await expect(
      gqlClient.sdk.assetAndTemporalDataObject({
        assetId: assetId as string,
        tdoId: tdoId as string
      })
    ).rejects.toThrow('not_found');
  });

  it(' enforce max offset and also filter by date/time correctly', async () => {
    const toDateTimeMom = moment().subtract(7, 'days');
    const toDateTime = toDateTimeMom.toISOString();
    const fromDateTime = moment().subtract(10, 'days').toISOString();
    await expect(
      gqlClient.sdk.tdosMaxOffsetAndDateFilter({
        offset: 10000,
        sourceId,
        dateTimeFilter: [
          {
            fromDateTime,
            toDateTime,
            field: TemporalDataObjectDateTimeField.StartDateTime
          }
        ]
      })
    ).rejects.toThrow('max_tdo_offset');
  });
});
