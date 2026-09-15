import { v4 as uuidv4 } from 'uuid';

import {
  BuildUpdateAction,
  DeploymentModel,
  IngestSlugEntryInput,
  IngestSlugFilter,
  IngestSlugStatus,
  IngestSlugsCreateInput,
  IngestSlugsDeleteMutationVariables,
  Sdk
} from '../../src/gql';
import { helpers } from '../../src/helpers';
import { safe } from '../../src/helpers/commonHelper';
import {
  AuthType,
  createClientWithUser,
  createGraphqlClient
} from '../../src/graphqlUtil';
import {
  IsolatedSuperadmin,
  createIsolatedSuperadmin
} from '../helpers/superadminSession';
import {
  IngestSlugFixture,
  IngestSlugsCreatePayload,
  IngestSlugsPagePayload,
  citestMarker,
  createIngestSlugFixture,
  createUnauthenticatedSdk,
  requirePayload,
  testFileUri
} from '../helpers/ingestSlug.helper';

const env = helpers.config.env.toLowerCase();
const config = helpers.config;

const ENGINE_CATEGORY_ID = '4be1a1b2-653d-4eaa-ba18-747a265305d8';

/** "Redact Editor" — an ordinary functional role (36 effective operations) that
 * grants no `aiware.slug.*` right, so it is denied by
 * `ingestSlugsDelete`'s `@scopes(["superadmin", "aiware.slug.delete"])`.
 *
 * Deliberately NOT "CMS Editor" (`cf2ed945-...`), which other citests call the
 * "non admin" role: its effective rights (verified via `myRights`, which
 * expands the permission hierarchy rather than reading `role.permissions`
 * directly) DO include aiware.slug.create/read/update/delete, so a CMS Editor
 * legitimately passes this authorization check. */
const NO_SLUG_RIGHTS_ROLE_ID = 'd0136963-c244-452d-9539-d27447a60f47';

/** DateTime scalars arrive as ISO strings over the wire, but codegen maps the
 * DateTime scalar to `any`; narrow it in one place instead of at each call. */
const toMillis = (dateTime: unknown): number =>
  new Date(String(dateTime)).getTime();

/** Reads a JWT's payload without pulling in a jsonwebtoken dependency — these
 * tests only inspect claims, they never verify the signature. */
const decodeJwtPayload = (token: string): Record<string, unknown> => {
  const segment = token.split('.')[1];
  if (!segment) {
    throw new Error('token has no payload segment to decode');
  }
  const decoded: unknown = JSON.parse(
    Buffer.from(segment, 'base64url').toString('utf8')
  );
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('token payload did not decode to an object');
  }
  return decoded as Record<string, unknown>;
};

/** What the legacy spec tracked in its shared `ingestSlugs` array, plus the
 * creation metadata it dropped. The legacy version stored only
 * sourceId/fileUri/status, which made its bundleKey, mimeType, tdoId and
 * assetId filter tests early-return before asserting anything. */
interface TrackedSlug {
  sourceId: string;
  fileUri: string;
  status: IngestSlugStatus;
  mimeType: string;
  bundleKey?: string;
  tdoId?: string;
  assetId?: string;
}

describe(`citest_ingestSlug: ingestSlug system testing in the ${env} environment`, () => {
  let fixture: IngestSlugFixture;
  let sourceId: string;
  let sourceId2: string;
  let tdoId: string;
  let assetId: string;

  /** Ordered slug ledger shared across the tests below, mirroring the legacy
   * spec: later tests address slugs created by earlier ones by index. */
  const createdSlugs: TrackedSlug[] = [];

  beforeAll(async () => {
    fixture = await createIngestSlugFixture({
      label: 'ingestslug',
      sourceCount: 2
    });
    [sourceId, sourceId2] = fixture.sourceIds;

    const tdoResult = await fixture.client.sdk.createTDOWithAsset({
      input: {
        name: `${citestMarker}-ingestslug-tdo-${uuidv4()}`,
        contentType: 'application/json',
        assetType: 'vtn-standard',
        uri: testFileUri('tdo', 'metadata.json'),
        startDateTime: new Date().toISOString(),
        stopDateTime: new Date().toISOString()
      }
    });
    const tdo = requirePayload(
      tdoResult?.data?.createTDOWithAsset,
      'createTDOWithAsset'
    );
    tdoId = tdo.id;
    const firstAssetId = tdo.assets?.records?.[0]?.id;
    if (!firstAssetId) {
      throw new Error('createTDOWithAsset returned a TDO with no assets');
    }
    assetId = firstAssetId;
  });

  afterAll(async () => {
    if (tdoId) {
      await safe(`delete TDO ${tdoId}`, () =>
        fixture.client.sdk.deleteTDO({ id: tdoId })
      );
    }
    await fixture.cleanup();
  });

  const createSlugs = async (
    input: Omit<IngestSlugsCreateInput, 'sourceId'> & { sourceId?: string }
  ): Promise<IngestSlugsCreatePayload> => {
    const result = await fixture.client.sdk.ingestSlugsCreate({
      input: { sourceId, ...input }
    });
    return requirePayload(result?.data?.ingestSlugsCreate, 'ingestSlugsCreate');
  };

  const listSlugs = async (
    filter?: IngestSlugFilter,
    paging: { offset?: number; limit?: number } = { offset: 0, limit: 100 }
  ): Promise<IngestSlugsPagePayload> => {
    const result = await fixture.client.sdk.ingestSlugs({ filter, ...paging });
    return requirePayload(result?.data?.ingestSlugs, 'ingestSlugs');
  };

  const track = (slug: TrackedSlug): void => {
    createdSlugs.push(slug);
    fixture.trackSlug(slug.fileUri, slug.sourceId);
  };

  it('#ingestSlugsCreate - should create single ingest slug', async () => {
    expect(sourceId).toBeDefined();
    expect(fixture.engineId).toBeDefined();
    expect(fixture.appId).toBeDefined();

    const bundleKey = `bundle-${uuidv4()}`;
    const fileUri = testFileUri('files', 'test-file-001.mp4');

    const created = await createSlugs({
      engineId: fixture.engineId,
      appId: fixture.appId,
      files: [
        {
          fileUri,
          bundleKey,
          mimeType: 'video/mp4',
          fileSizeBytes: 1073741824,
          fileCreatedAt: new Date().toISOString()
        }
      ]
    });

    expect(created.sourceId).toEqual(sourceId);
    expect(created.created ?? []).toHaveLength(1);
    expect(created.created?.[0].fileUri).toEqual(fileUri);
    expect(created.created?.[0].status).toEqual(IngestSlugStatus.Pending);
    expect(created.failed ?? []).toEqual([]);

    track({
      sourceId,
      fileUri,
      status: IngestSlugStatus.Pending,
      mimeType: 'video/mp4',
      bundleKey
    });
  });

  it('#ingestSlugsCreate - should batch create multiple ingest slugs', async () => {
    const bundleKey = `bundle-batch-${uuidv4()}`;
    const files: IngestSlugEntryInput[] = [];

    for (let i = 0; i < 5; i++) {
      files.push({
        fileUri: testFileUri('batch', `file-${i}.mp4`),
        bundleKey,
        mimeType: 'video/mp4',
        fileSizeBytes: Math.floor(Math.random() * 2147483648),
        fileCreatedAt: new Date().toISOString()
      });
    }
    const expectedFileUris = files.map((file) => file.fileUri);

    const created = await createSlugs({
      engineId: fixture.engineId,
      appId: fixture.appId,
      files
    });

    expect(created.created ?? []).toHaveLength(5);
    expect(created.failed ?? []).toHaveLength(0);

    (created.created ?? []).forEach((record) => {
      expect(expectedFileUris).toContain(record.fileUri);
      expect(record.status).toEqual(IngestSlugStatus.Pending);
      track({
        sourceId: record.sourceId,
        fileUri: record.fileUri,
        status: record.status,
        mimeType: 'video/mp4',
        bundleKey
      });
    });
  });

  it('should fail to create ingest slug with assetId but no tdoId', async () => {
    const fileUri = testFileUri('asset-without-tdo', 'test.mp4');

    const created = await createSlugs({
      files: [
        {
          fileUri,
          assetId,
          bundleKey: 'bundle-001',
          mimeType: 'video/mp4',
          fileSizeBytes: 2147483648,
          fileCreatedAt: '2024-01-15T10:00:00Z',
          fileModifiedAt: '2024-01-15T10:30:00Z',
          status: IngestSlugStatus.Pending
        }
      ]
    });

    expect(created.created ?? []).toHaveLength(0);
    expect(created.failed ?? []).toHaveLength(1);
    expect(created.failed?.[0].fileUri).toBe(fileUri);
    expect(created.failed?.[0].errorMessage).toContain('tdoId');
  });

  it('#ingestSlugsCreate - duplicates should have both sourceId and fileUri', async () => {
    const bundleKey = `bundle-duplicate-test-${uuidv4()}`;
    const fileUri = testFileUri('duplicate-test', 'test-file.mp4');
    const files: IngestSlugEntryInput[] = [
      {
        fileUri,
        bundleKey,
        mimeType: 'video/mp4',
        fileSizeBytes: 1073741824,
        fileCreatedAt: new Date().toISOString()
      }
    ];

    const created = await createSlugs({
      engineId: fixture.engineId,
      appId: fixture.appId,
      files
    });
    expect(created.created ?? []).toHaveLength(1);
    track({
      sourceId,
      fileUri,
      status: IngestSlugStatus.Pending,
      mimeType: 'video/mp4',
      bundleKey
    });

    // Re-creating the same (sourceId, fileUri) reports it as a duplicate
    const duplicated = await createSlugs({
      engineId: fixture.engineId,
      appId: fixture.appId,
      files
    });

    expect((duplicated.duplicates ?? []).length).toBeGreaterThan(0);
    (duplicated.duplicates ?? []).forEach((duplicate) => {
      expect(duplicate.sourceId).toEqual(sourceId);
      expect(duplicate.fileUri).toEqual(fileUri);
    });
  });

  it('#ingestSlugsCreate - should handle validation errors', async () => {
    /** sourceId (and the entry's mimeType) are non-null in the schema, so a
     * well-typed caller cannot omit them — build the invalid shape explicitly
     * to exercise the server's own variable validation. */
    const invalidInput: Omit<IngestSlugsCreateInput, 'sourceId' | 'files'> & {
      files: Omit<IngestSlugEntryInput, 'mimeType'>[];
    } = {
      files: [{ fileUri: 's3://test-bucket/file.mp4', bundleKey: 'bundle-001' }]
    };

    const promise = fixture.client.sdk.ingestSlugsCreate({
      input: invalidInput as IngestSlugsCreateInput
    });

    await expect(promise).rejects.toThrow(/sourceid/i);
  });

  it('#ingestSlugsCreate - should handle transaction rollback when recording insert fails', async () => {
    const fileUri = testFileUri('rollback', 'test-file.mp4');

    const created = await createSlugs({
      engineId: fixture.engineId,
      appId: fixture.appId,
      files: [
        {
          fileUri,
          bundleKey: `bundle-rollback-${uuidv4()}`,
          mimeType: 'video/mp4',
          fileSizeBytes: 1073741824,
          fileCreatedAt: new Date().toISOString(),
          tdoId: uuidv4() // a TDO that does not exist
        }
      ]
    });

    expect((created.failed ?? []).length).toBeGreaterThan(0);
    expect(created.failed?.[0].fileUri).toEqual(fileUri);

    // The failed entry must not have left a row behind
    const promise = fixture.client.sdk.ingestSlug({ sourceId, fileUri });
    await expect(promise).rejects.toThrow(/not found/i);
  });

  it('#ingestSlug - should retrieve single ingest slug', async () => {
    expect(createdSlugs.length).toBeGreaterThan(0);
    const testSlug = createdSlugs[0];

    const result = await fixture.client.sdk.ingestSlug({
      sourceId: testSlug.sourceId,
      fileUri: testSlug.fileUri
    });
    const slug = requirePayload(result?.data?.ingestSlug, 'ingestSlug');

    expect(slug.sourceId).toEqual(testSlug.sourceId);
    expect(slug.fileUri).toEqual(testSlug.fileUri);
    expect(slug.status).toEqual(testSlug.status);
    expect(slug.createdAt).toBeDefined();
  });

  it('#ingestSlug - should return error for nonexistent slug', async () => {
    const promise = fixture.client.sdk.ingestSlug({
      sourceId,
      fileUri: `s3://test-bucket/nonexistent-${uuidv4()}.mp4`
    });

    await expect(promise).rejects.toThrow(/not found/i);
  });

  it('#ingestSlugs - should query ingest slugs with default pagination', async () => {
    expect(createdSlugs.length).toBeGreaterThan(0);

    const page = await listSlugs(undefined, { offset: 0, limit: 10 });

    expect(page.records).toBeDefined();
    expect(page.offset).toEqual(0);
    expect(page.limit).toEqual(10);
    expect(page.count ?? 0).toBeGreaterThanOrEqual(createdSlugs.length);
  });

  describe('Filter Testing - ingestSlugs', () => {
    describe('Source filtering', () => {
      it('should filter by sourceId array', async () => {
        const page = await listSlugs({ sourceId: [sourceId] });

        expect((page.records ?? []).length).toBeGreaterThan(0);
        (page.records ?? []).forEach((slug) => {
          expect(slug.sourceId).toEqual(sourceId);
        });
      });

      it('should filter by multiple sourceIds', async () => {
        const page = await listSlugs({ sourceId: [sourceId, sourceId2] });

        expect((page.records ?? []).length).toBeGreaterThan(0);
        (page.records ?? []).forEach((slug) => {
          expect([sourceId, sourceId2]).toContain(slug.sourceId);
        });
      });

      it('should return empty result when sourceId does not exist', async () => {
        const page = await listSlugs({ sourceId: ['00000'] });

        expect(page.records ?? []).toHaveLength(0);
      });
    });

    describe('Status filtering', () => {
      it('should filter by single status', async () => {
        const page = await listSlugs({ status: [IngestSlugStatus.Pending] });

        expect((page.records ?? []).length).toBeGreaterThan(0);
        (page.records ?? []).forEach((slug) => {
          expect(slug.status).toEqual(IngestSlugStatus.Pending);
        });
      });

      it('should filter by multiple statuses', async () => {
        const statuses = [IngestSlugStatus.Pending, IngestSlugStatus.Failed];
        const page = await listSlugs({ status: statuses });

        expect((page.records ?? []).length).toBeGreaterThan(0);
        (page.records ?? []).forEach((slug) => {
          expect(statuses).toContain(slug.status);
        });
      });

      it('should return error for unknown status', async () => {
        /** Deliberately outside IngestSlugStatus: the point of the test is
         * that the server rejects an unknown enum value, which a well-typed
         * caller cannot express. */
        const unknownStatus =
          'non-existent-status' as unknown as IngestSlugStatus;

        const promise = fixture.client.sdk.ingestSlugs({
          filter: { status: [unknownStatus] },
          offset: 0,
          limit: 100
        });

        await expect(promise).rejects.toThrow(/invalid value/i);
      });
    });

    describe('FileUri filtering', () => {
      it('should filter by fileUriExact', async () => {
        const { fileUri } = createdSlugs[0];
        const page = await listSlugs({ fileUriExact: [fileUri] });

        expect((page.records ?? []).length).toBeGreaterThan(0);
        (page.records ?? []).forEach((slug) => {
          expect(slug.fileUri).toEqual(fileUri);
        });
      });

      it('should filter by multiple fileUriExact', async () => {
        expect(createdSlugs.length).toBeGreaterThan(1);
        const fileUri1 = createdSlugs[0].fileUri;
        const fileUri2 = createdSlugs[1].fileUri;

        const page = await listSlugs({ fileUriExact: [fileUri1, fileUri2] });

        expect((page.records ?? []).length).toBeGreaterThan(0);
        (page.records ?? []).forEach((slug) => {
          expect([fileUri1, fileUri2]).toContain(slug.fileUri);
        });
      });

      it('should filter by fileUriPrefix', async () => {
        const { fileUri } = createdSlugs[0];
        const prefix = fileUri.substring(0, fileUri.lastIndexOf('/'));

        const page = await listSlugs({ fileUriPrefix: [prefix] });

        expect((page.records ?? []).length).toBeGreaterThan(0);
        (page.records ?? []).forEach((slug) => {
          expect(slug.fileUri.startsWith(prefix)).toBe(true);
        });
      });

      it('should return empty result for non-existing fileUriExact', async () => {
        const page = await listSlugs({
          fileUriExact: ['s3://bucket/non-existent-file']
        });

        expect(page.records ?? []).toHaveLength(0);
      });
    });

    describe('updatedAt time range filtering', () => {
      it('should filter by updatedFromTime', async () => {
        const seed = await listSlugs(undefined, { offset: 0, limit: 1 });
        const updatedFromTime = seed.records?.[0]?.updatedAt;
        if (updatedFromTime === undefined || updatedFromTime === null) {
          throw new Error(
            'no ingest slug available to seed the updatedFromTime filter'
          );
        }

        const page = await listSlugs({ updatedFromTime });

        (page.records ?? []).forEach((slug) => {
          expect(toMillis(slug.updatedAt)).toBeGreaterThanOrEqual(
            toMillis(updatedFromTime)
          );
        });
      });

      it('should filter by updatedToTime', async () => {
        const updatedToTime = '2100-01-01T00:00:00Z';
        const page = await listSlugs({ updatedToTime });

        (page.records ?? []).forEach((slug) => {
          expect(toMillis(slug.updatedAt)).toBeLessThanOrEqual(
            toMillis(updatedToTime)
          );
        });
      });

      it('should filter by updated time range', async () => {
        const updatedFromTime = '2000-01-01T00:00:00Z';
        const updatedToTime = '2100-01-01T00:00:00Z';

        const page = await listSlugs({ updatedFromTime, updatedToTime });

        (page.records ?? []).forEach((slug) => {
          const updated = toMillis(slug.updatedAt);
          expect(updated).toBeGreaterThanOrEqual(toMillis(updatedFromTime));
          expect(updated).toBeLessThanOrEqual(toMillis(updatedToTime));
        });
      });

      it('should filter using updatedFromTimeExclusive', async () => {
        const updatedFromTime = '2000-01-01T00:00:00Z';

        const page = await listSlugs({
          updatedFromTime,
          updatedFromTimeExclusive: true
        });

        (page.records ?? []).forEach((slug) => {
          expect(toMillis(slug.updatedAt)).toBeGreaterThan(
            toMillis(updatedFromTime)
          );
        });
      });
    });

    it('should filter by tdoId', async () => {
      /** Creates its own slug carrying a tdoId. The legacy version looked for
       * a tracked slug with a tdoId, but nothing ever recorded one, so the
       * test returned before asserting anything. */
      const fileUri = testFileUri('filter-tdo', 'file.mp4');
      const created = await createSlugs({
        engineId: fixture.engineId,
        appId: fixture.appId,
        files: [{ fileUri, mimeType: 'video/mp4', tdoId }]
      });
      expect(created.created ?? []).toHaveLength(1);
      track({
        sourceId,
        fileUri,
        status: IngestSlugStatus.Pending,
        mimeType: 'video/mp4',
        tdoId
      });

      const page = await listSlugs({ tdoId: [tdoId] });

      expect((page.records ?? []).length).toBeGreaterThan(0);
      (page.records ?? []).forEach((slug) => {
        expect(slug.tdoId).toEqual(tdoId);
      });
    });

    it('should filter by assetId', async () => {
      /** assetId is only accepted alongside its tdoId (see the "assetId but
       * no tdoId" test above), so create the pair here. */
      const fileUri = testFileUri('filter-asset', 'file.mp4');
      const created = await createSlugs({
        engineId: fixture.engineId,
        appId: fixture.appId,
        files: [{ fileUri, mimeType: 'video/mp4', tdoId, assetId }]
      });
      expect(created.created ?? []).toHaveLength(1);
      track({
        sourceId,
        fileUri,
        status: IngestSlugStatus.Pending,
        mimeType: 'video/mp4',
        tdoId,
        assetId
      });

      const page = await listSlugs({ assetId: [assetId] });

      expect((page.records ?? []).length).toBeGreaterThan(0);
      (page.records ?? []).forEach((slug) => {
        expect(slug.assetId).toEqual(assetId);
      });
    });

    it('should filter by mimeType', async () => {
      const { mimeType } = createdSlugs[0];
      const page = await listSlugs({ mimeType: [mimeType] });

      expect((page.records ?? []).length).toBeGreaterThan(0);
      (page.records ?? []).forEach((slug) => {
        expect(slug.mimeType).toEqual(mimeType);
      });
    });

    it('should filter by bundleKey', async () => {
      const bundleKey = createdSlugs.find((slug) => slug.bundleKey)?.bundleKey;
      if (!bundleKey) {
        throw new Error('no tracked slug carries a bundleKey to filter on');
      }

      const page = await listSlugs({ bundleKey: [bundleKey] });

      expect((page.records ?? []).length).toBeGreaterThan(0);
      (page.records ?? []).forEach((slug) => {
        expect(slug.bundleKey).toEqual(bundleKey);
      });
    });
  });

  it('#ingestSlugUpdate - should update partial fields', async () => {
    expect(createdSlugs.length).toBeGreaterThanOrEqual(2);
    const testSlug = createdSlugs[1];

    const result = await fixture.client.sdk.ingestSlugUpdate({
      sourceId: testSlug.sourceId,
      fileUri: testSlug.fileUri,
      input: { status: IngestSlugStatus.Ingested, tdoId }
    });
    const updated = requirePayload(
      result?.data?.ingestSlugUpdate,
      'ingestSlugUpdate'
    );

    expect(updated.status).toEqual(IngestSlugStatus.Ingested);
    expect(updated.tdoId).toEqual(tdoId);

    testSlug.status = IngestSlugStatus.Ingested;
    testSlug.tdoId = tdoId;
  });

  it('#ingestSlugUpdateStatus - should bulk update slug status', async () => {
    expect(createdSlugs.length).toBeGreaterThanOrEqual(3);
    const targets = createdSlugs.slice(2, 4);
    const fileUris = targets.map((slug) => slug.fileUri);

    const result = await fixture.client.sdk.ingestSlugUpdateStatus({
      sourceId,
      fileUris,
      input: {
        status: IngestSlugStatus.Uploaded,
        statusMessage: 'Processing batch update'
      }
    });
    const bulk = requirePayload(
      result?.data?.ingestSlugUpdateStatus,
      'ingestSlugUpdateStatus'
    );

    expect(bulk.sourceId).toEqual(sourceId);
    expect(bulk.updated ?? []).toHaveLength(fileUris.length);
    expect(bulk.failed ?? []).toHaveLength(0);

    (bulk.updated ?? []).forEach((updated) => {
      expect(updated.status).toEqual(IngestSlugStatus.Uploaded);
      expect(fileUris).toContain(updated.fileUri);
    });
    targets.forEach((slug) => {
      slug.status = IngestSlugStatus.Uploaded;
    });
  });

  describe('ingestSlugsDelete', () => {
    it('should delete multiple ingest slugs successfully', async () => {
      const fileUris = createdSlugs.slice(0, 2).map((slug) => slug.fileUri);

      const result = await fixture.client.sdk.ingestSlugsDelete({
        sourceId,
        fileUris
      });
      const deleted = requirePayload(
        result?.data?.ingestSlugsDelete,
        'ingestSlugsDelete'
      );

      expect(deleted.sourceId).toEqual(sourceId);
      expect(deleted.deleted ?? []).toHaveLength(fileUris.length);
      expect(deleted.failed ?? []).toHaveLength(0);
    });

    it('should ignore non-existent slug', async () => {
      const result = await fixture.client.sdk.ingestSlugsDelete({
        sourceId,
        fileUris: [`s3://fake-bucket/non-existent-${uuidv4()}.mp4`]
      });
      const deleted = requirePayload(
        result?.data?.ingestSlugsDelete,
        'ingestSlugsDelete'
      );

      expect(deleted.deleted ?? []).toHaveLength(0);
      expect(deleted.failed ?? []).toHaveLength(0);
    });

    it('should return validation error when fileUris is empty', async () => {
      const promise = fixture.client.sdk.ingestSlugsDelete({
        sourceId,
        fileUris: []
      });

      await expect(promise).rejects.toThrow();
    });

    it('should not delete slugs with wrong sourceId', async () => {
      const result = await fixture.client.sdk.ingestSlugsDelete({
        sourceId: sourceId2,
        fileUris: [createdSlugs[2].fileUri]
      });
      const deleted = requirePayload(
        result?.data?.ingestSlugsDelete,
        'ingestSlugsDelete'
      );

      expect(deleted.deleted ?? []).toHaveLength(0);
      expect(deleted.failed ?? []).toHaveLength(0);
    });

    it('deleted count should match expected amount', async () => {
      const fileUris = createdSlugs.slice(3, 5).map((slug) => slug.fileUri);

      const result = await fixture.client.sdk.ingestSlugsDelete({
        sourceId,
        fileUris
      });
      const deleted = requirePayload(
        result?.data?.ingestSlugsDelete,
        'ingestSlugsDelete'
      );

      expect(deleted.deleted ?? []).toHaveLength(fileUris.length);
    });
  });

  it('#ingestSlugsDelete - should delete specific ingest slugs', async () => {
    const slugToDelete = createdSlugs[createdSlugs.length - 1];

    const result = await fixture.client.sdk.ingestSlugsDelete({
      sourceId: slugToDelete.sourceId,
      fileUris: [slugToDelete.fileUri]
    });
    const deleted = requirePayload(
      result?.data?.ingestSlugsDelete,
      'ingestSlugsDelete'
    );

    expect(deleted.sourceId).toEqual(slugToDelete.sourceId);
    expect(deleted.deleted ?? []).toHaveLength(1);
    expect(deleted.deleted?.[0].sourceId).toEqual(slugToDelete.sourceId);
    expect(deleted.deleted?.[0].fileUri).toEqual(slugToDelete.fileUri);
    expect(deleted.failed ?? []).toHaveLength(0);

    const promise = fixture.client.sdk.ingestSlug({
      sourceId: slugToDelete.sourceId,
      fileUri: slugToDelete.fileUri
    });
    await expect(promise).rejects.toThrow(/not found/i);
  });

  it('#ingestSlugsDelete - should handle deletion validation errors', async () => {
    const invalidVariables: Omit<
      IngestSlugsDeleteMutationVariables,
      'sourceId'
    > = { fileUris: ['s3://bucket/file.mp4'] };

    const promise = fixture.client.sdk.ingestSlugsDelete(
      invalidVariables as IngestSlugsDeleteMutationVariables
    );

    await expect(promise).rejects.toThrow(/sourceid/i);
  });

  describe('Cross-Organization Access Prevention', () => {
    /**
     * The legacy version created a second org plus an admin user plus a
     * 37-right API token to act inside it. `createIsolatedSuperadmin` already
     * yields a superadmin identity that owns its own throwaway org, which is
     * exactly "an org that is not the caller's org" — so use that and let the
     * helper own the teardown. This also keeps the shared CI superadmin from
     * being enrolled into (or logged out by) the extra org.
     */
    let otherOrg: IsolatedSuperadmin;
    let otherSourceId: string;
    let otherOrgSlugFileUri: string;

    beforeAll(async () => {
      /** A freshly logged-in shared-superadmin client: createGraphqlClient
       * caches its SDK by AuthType and leaves `sessionToken` undefined on a
       * cache hit, and createIsolatedSuperadmin needs a real token. */
      const bootstrapClient = await createClientWithUser(
        config.userName,
        config.password,
        config.env
      );
      otherOrg = await createIsolatedSuperadmin(bootstrapClient);

      const sourceResult = await otherOrg.client.sdk.createSource({
        input: {
          sourceTypeId: '1',
          name: `${citestMarker}-crossorg-source-${uuidv4()}`,
          isPublic: false
        }
      });
      const source = requirePayload(
        sourceResult?.data?.createSource,
        'createSource'
      );
      otherSourceId = source.id;

      otherOrgSlugFileUri = testFileUri('cross-org', 'test-file.mp4');
      const created = await otherOrg.client.sdk.ingestSlugsCreate({
        input: {
          sourceId: otherSourceId,
          files: [
            {
              fileUri: otherOrgSlugFileUri,
              bundleKey: `cross-org-test-${uuidv4()}`,
              mimeType: 'video/mp4',
              fileSizeBytes: 1073741824,
              fileCreatedAt: new Date().toISOString()
            }
          ]
        }
      });
      const payload = requirePayload(
        created?.data?.ingestSlugsCreate,
        'ingestSlugsCreate'
      );
      expect(payload.created ?? []).toHaveLength(1);
    });

    afterAll(async () => {
      await safe(`delete cross-org ingest slug`, () =>
        otherOrg.client.sdk.ingestSlugsDelete({
          sourceId: otherSourceId,
          fileUris: [otherOrgSlugFileUri]
        })
      );
      await safe(`delete cross-org source ${otherSourceId}`, () =>
        otherOrg.client.sdk.deleteSource({ id: otherSourceId })
      );
      await otherOrg.cleanup();
    });

    it('should demonstrate that the other org can query its own ingest slugs', async () => {
      const result = await otherOrg.client.sdk.ingestSlug({
        sourceId: otherSourceId,
        fileUri: otherOrgSlugFileUri
      });
      const slug = requirePayload(result?.data?.ingestSlug, 'ingestSlug');

      expect(slug.sourceId).toBe(otherSourceId);
      expect(slug.fileUri).toBe(otherOrgSlugFileUri);
    });

    it('should demonstrate that the other org can update its own ingest slugs', async () => {
      const result = await otherOrg.client.sdk.ingestSlugUpdate({
        sourceId: otherSourceId,
        fileUri: otherOrgSlugFileUri,
        input: { status: IngestSlugStatus.Uploaded }
      });
      const updated = requirePayload(
        result?.data?.ingestSlugUpdate,
        'ingestSlugUpdate'
      );

      expect(updated.sourceId).toBe(otherSourceId);
      expect(updated.status).toBe(IngestSlugStatus.Uploaded);
    });

    it('should demonstrate that the first org is restricted from querying another org ingest slugs', async () => {
      const promise = fixture.client.sdk.ingestSlug({
        sourceId: otherSourceId,
        fileUri: otherOrgSlugFileUri
      });

      await expect(promise).rejects.toThrow(/not found/i);
    });
  });

  describe('Engine JWT Context', () => {
    it('should create ingest slug with engine JWT and return engineId in createdBy', async () => {
      const engineRights = {
        roles: [
          {
            roleName: 'adapter',
            taskRights: [
              'job:create',
              'job.read',
              'cms.access',
              'cms.sources.read',
              'cms.sources.update',
              'aiware.slug.create',
              'aiware.slug.update',
              'aiware.slug.read',
              'aiware.slug.delete',
              'superadmin',
              'aiware.superadmin'
            ],
            assetRights: ['recording:create', 'recording:update']
          }
        ]
      };

      const engineResult = await fixture.client.sdk.createEngine({
        input: {
          name: `${citestMarker}-engine-jwt-${uuidv4()}`,
          categoryId: ENGINE_CATEGORY_ID,
          deploymentModel: DeploymentModel.FullyNetworkIsolated,
          isPublic: false,
          jwtRights: engineRights
        }
      });
      const engine = requirePayload(
        engineResult?.data?.createEngine,
        'createEngine'
      );
      expect(engine.isPublic).toBe(false);
      const testEngineId = engine.id;

      let fileUri = '';
      try {
        const buildResult = await fixture.client.sdk.createEngineBuild({
          input: {
            engineId: testEngineId,
            taskRuntime: { nodeRed: true },
            manifest: { runtime: 'NodeRed' }
          }
        });
        const build = requirePayload(
          buildResult?.data?.createEngineBuild,
          'createEngineBuild'
        );
        expect(['available', 'approved', 'pending']).toContain(build.status);
        const buildId = build.id;

        const submitted = await fixture.client.sdk.updateEngineBuild({
          input: {
            id: buildId,
            engineId: testEngineId,
            action: BuildUpdateAction.Submit
          }
        });
        expect(['approved', 'pending']).toContain(
          requirePayload(
            submitted?.data?.updateEngineBuild,
            'updateEngineBuild(submit)'
          ).status
        );

        const deployed = await fixture.client.sdk.updateEngineBuild({
          input: {
            id: buildId,
            engineId: testEngineId,
            action: BuildUpdateAction.Deploy
          }
        });
        expect(
          requirePayload(
            deployed?.data?.updateEngineBuild,
            'updateEngineBuild(deploy)'
          ).status
        ).toEqual('deployed');

        const jobResult = await fixture.client.sdk.createJob({
          input: {
            name: `${citestMarker}-engine-jwt-test-job`,
            tasks: [{ engineId: testEngineId }]
          }
        });
        const job = requirePayload(jobResult?.data?.createJob, 'createJob');

        const jwtResult = await fixture.client.sdk.getEngineJWT({
          input: { engineId: testEngineId, resource: { jobId: job.id } }
        });
        const engineJwt = requirePayload(
          jwtResult?.data?.getEngineJWT,
          'getEngineJWT'
        );
        expect(engineJwt.token).toBeDefined();
        const engineJwtHeaders = helpers.requestOptions(engineJwt.token)
          .headers as Record<string, string>;

        fileUri = testFileUri('files', 'engine-jwt-test.mp4');
        const created = await fixture.client.sdk.ingestSlugsCreate(
          {
            input: {
              sourceId,
              engineId: fixture.engineId,
              appId: fixture.appId,
              files: [
                {
                  fileUri,
                  bundleKey: `bundle-${uuidv4()}`,
                  mimeType: 'video/mp4',
                  fileSizeBytes: 1073741824,
                  fileCreatedAt: new Date().toISOString()
                }
              ]
            }
          },
          engineJwtHeaders
        );
        expect(
          requirePayload(created?.data?.ingestSlugsCreate, 'ingestSlugsCreate')
            .created ?? []
        ).toHaveLength(1);

        // createdBy must attribute the slug to the engine identity in the JWT
        const slugResult = await fixture.client.sdk.ingestSlug({
          sourceId,
          fileUri
        });
        const slug = requirePayload(slugResult?.data?.ingestSlug, 'ingestSlug');
        expect(slug.createdBy).toContain('engineId:');
        expect(slug.createdBy).toContain(testEngineId);
      } finally {
        if (fileUri) {
          await safe('delete engine-jwt ingest slug', () =>
            fixture.client.sdk.ingestSlugsDelete({
              sourceId,
              fileUris: [fileUri]
            })
          );
        }
        await safe(`delete engine ${testEngineId}`, () =>
          fixture.client.sdk.deleteEngine({ id: testEngineId })
        );
      }
    });

    describe('orgless internal token reads', () => {
      let orglessSdk: Sdk;

      beforeAll(async () => {
        /** createGraphqlClient silently falls back to a session token when
         * the orgless token is absent, which would make these tests pass
         * without exercising the orgless path at all. */
        if (!config.apiInternalOrgLessToken) {
          throw new Error(
            'apiInternalOrgLessToken is not configured; the orgless ingestSlug reads cannot be verified'
          );
        }
        const orglessClient = await createGraphqlClient(
          AuthType.ORGLESS_API_KEY,
          config.env
        );
        orglessSdk = orglessClient.sdk;
      });

      it('should read ingest slugs with orgless internal token', async () => {
        const fileUri = testFileUri('files', 'orgless-read-test.mp4');

        const created = await createSlugs({
          engineId: fixture.engineId,
          appId: fixture.appId,
          files: [
            {
              fileUri,
              bundleKey: `bundle-${uuidv4()}`,
              mimeType: 'video/mp4',
              fileSizeBytes: 1048576,
              fileCreatedAt: new Date().toISOString()
            }
          ]
        });
        expect(created.created ?? []).toHaveLength(1);
        const createdSlug = created.created?.[0];

        try {
          const result = await orglessSdk.ingestSlug({ sourceId, fileUri });
          const slug = requirePayload(result?.data?.ingestSlug, 'ingestSlug');

          expect(slug.sourceId).toEqual(sourceId);
          expect(slug.fileUri).toEqual(fileUri);
          expect(slug.organizationId).toEqual(createdSlug?.organizationId);
          expect(slug.mimeType).toEqual('video/mp4');
        } finally {
          await safe('delete orgless-read ingest slug', () =>
            fixture.client.sdk.ingestSlugsDelete({
              sourceId,
              fileUris: [fileUri]
            })
          );
        }
      });

      it('should read multiple ingest slugs with orgless internal token (ingestSlugs query)', async () => {
        const fileUri1 = testFileUri('files', 'orgless-list-test-1.mp4');
        const fileUri2 = testFileUri('files', 'orgless-list-test-2.mp4');
        const bundleKey = `bundle-${uuidv4()}`;

        const created = await createSlugs({
          engineId: fixture.engineId,
          appId: fixture.appId,
          files: [
            {
              fileUri: fileUri1,
              bundleKey,
              mimeType: 'video/mp4',
              fileSizeBytes: 1048576,
              fileCreatedAt: new Date().toISOString()
            },
            {
              fileUri: fileUri2,
              bundleKey,
              mimeType: 'video/mp4',
              fileSizeBytes: 2097152,
              fileCreatedAt: new Date().toISOString()
            }
          ]
        });
        expect(created.created ?? []).toHaveLength(2);

        try {
          const result = await orglessSdk.ingestSlugs({
            filter: {
              sourceId: [sourceId],
              fileUriExact: [fileUri1, fileUri2]
            },
            limit: 10,
            offset: 0
          });
          const page = requirePayload(result?.data?.ingestSlugs, 'ingestSlugs');

          expect(page.records ?? []).toHaveLength(2);
          const fileUris = (page.records ?? []).map((slug) => slug.fileUri);
          expect(fileUris).toContain(fileUri1);
          expect(fileUris).toContain(fileUri2);
        } finally {
          await safe('delete orgless-list ingest slugs', () =>
            fixture.client.sdk.ingestSlugsDelete({
              sourceId,
              fileUris: [fileUri1, fileUri2]
            })
          );
        }
      });
    });
  });

  describe('Source JWT sourceId precedence', () => {
    /** Verifies that the sourceId carried by a source JWT wins over whatever
     * sourceId the caller passes in. */
    let sourceJwtHeaders: Record<string, string>;
    let sourceJwtSourceId: string;
    /** A sourceId that differs from the JWT's sourceId. */
    const DIFFERENT_SOURCE_ID = '999999999';

    beforeAll(async () => {
      const result = await fixture.client.sdk.getSourceJWT({ sourceId });
      const sourceJwt = requirePayload(
        result?.data?.getSourceJWT,
        'getSourceJWT'
      );

      expect(sourceJwt.token).toBeDefined();
      expect(sourceJwt.ownerId).toBeDefined();
      expect(decodeJwtPayload(sourceJwt.token).userId).toEqual(
        sourceJwt.ownerId
      );

      sourceJwtSourceId = sourceJwt.sourceId;
      sourceJwtHeaders = helpers.requestOptions(sourceJwt.token)
        .headers as Record<string, string>;
    });

    /** Creates a slug through the source JWT and returns its fileUri. */
    const createSlugWithJwt = async (name: string): Promise<string> => {
      const fileUri = testFileUri('files', name);
      await fixture.client.sdk.ingestSlugsCreate(
        {
          input: {
            sourceId: sourceJwtSourceId,
            files: [{ fileUri, mimeType: 'video/mp4' }]
          }
        },
        sourceJwtHeaders
      );
      return fileUri;
    };

    const deleteSlugWithSuperadmin = (fileUri: string): Promise<void> =>
      safe('delete source-JWT ingest slug', () =>
        fixture.client.sdk.ingestSlugsDelete({
          sourceId: sourceJwtSourceId,
          fileUris: [fileUri]
        })
      );

    it('#ingestSlugsCreate - should use sourceId from JWT instead of input sourceId', async () => {
      const fileUri = testFileUri('files', 'jwt-precedence-create.mp4');

      try {
        const result = await fixture.client.sdk.ingestSlugsCreate(
          {
            input: {
              sourceId: DIFFERENT_SOURCE_ID, // ignored in favour of the JWT
              files: [{ fileUri, mimeType: 'video/mp4' }]
            }
          },
          sourceJwtHeaders
        );
        const created = requirePayload(
          result?.data?.ingestSlugsCreate,
          'ingestSlugsCreate'
        );

        expect(created.sourceId).toEqual(sourceJwtSourceId);
        expect(created.sourceId).not.toEqual(DIFFERENT_SOURCE_ID);
        expect((created.created ?? []).length).toBeGreaterThan(0);
        expect(created.created?.[0].sourceId).toEqual(sourceJwtSourceId);
      } finally {
        await deleteSlugWithSuperadmin(fileUri);
      }
    });

    it('#ingestSlug - should use sourceId from JWT instead of input sourceId', async () => {
      const fileUri = await createSlugWithJwt('jwt-precedence-get.mp4');

      try {
        const result = await fixture.client.sdk.ingestSlug(
          {
            sourceId: DIFFERENT_SOURCE_ID, // ignored in favour of the JWT
            fileUri
          },
          sourceJwtHeaders
        );
        const slug = requirePayload(result?.data?.ingestSlug, 'ingestSlug');

        expect(slug.sourceId).toEqual(sourceJwtSourceId);
        expect(slug.sourceId).not.toEqual(DIFFERENT_SOURCE_ID);
      } finally {
        await deleteSlugWithSuperadmin(fileUri);
      }
    });

    it('#ingestSlugs - should use filter sourceId (JWT does not override filter for list queries)', async () => {
      const fileUri = await createSlugWithJwt('jwt-precedence-list.mp4');

      try {
        const result = await fixture.client.sdk.ingestSlugs(
          {
            filter: {
              sourceId: [sourceJwtSourceId],
              fileUriExact: [fileUri]
            },
            limit: 10,
            offset: 0
          },
          sourceJwtHeaders
        );
        const page = requirePayload(result?.data?.ingestSlugs, 'ingestSlugs');

        expect((page.records ?? []).length).toBeGreaterThan(0);
        expect(page.records?.[0].sourceId).toEqual(sourceJwtSourceId);
      } finally {
        await deleteSlugWithSuperadmin(fileUri);
      }
    });

    it('#ingestSlugs - JWT sourceId should override provided filter array of sourceIds', async () => {
      const fileUri = await createSlugWithJwt('jwt-precedence-list-array.mp4');

      try {
        const result = await fixture.client.sdk.ingestSlugs(
          {
            filter: {
              sourceId: [DIFFERENT_SOURCE_ID, '12345'],
              fileUriExact: [fileUri]
            },
            limit: 10,
            offset: 0
          },
          sourceJwtHeaders
        );
        const page = requirePayload(result?.data?.ingestSlugs, 'ingestSlugs');

        expect((page.records ?? []).length).toBeGreaterThan(0);
        expect(page.records?.[0].sourceId).toEqual(sourceJwtSourceId);
      } finally {
        await deleteSlugWithSuperadmin(fileUri);
      }
    });

    it('#ingestSlugUpdate - should use sourceId from JWT instead of input sourceId', async () => {
      const fileUri = await createSlugWithJwt('jwt-precedence-update.mp4');

      try {
        const result = await fixture.client.sdk.ingestSlugUpdate(
          {
            sourceId: DIFFERENT_SOURCE_ID, // ignored in favour of the JWT
            fileUri,
            input: { statusMessage: 'Updated via JWT test' }
          },
          sourceJwtHeaders
        );
        const updated = requirePayload(
          result?.data?.ingestSlugUpdate,
          'ingestSlugUpdate'
        );

        expect(updated.sourceId).toEqual(sourceJwtSourceId);
        expect(updated.sourceId).not.toEqual(DIFFERENT_SOURCE_ID);
        expect(updated.statusMessage).toEqual('Updated via JWT test');
      } finally {
        await deleteSlugWithSuperadmin(fileUri);
      }
    });

    it('#ingestSlugUpdateStatus - should use sourceId from JWT instead of input sourceId', async () => {
      const fileUri = await createSlugWithJwt('jwt-precedence-status.mp4');

      try {
        const result = await fixture.client.sdk.ingestSlugUpdateStatus(
          {
            sourceId: DIFFERENT_SOURCE_ID, // ignored in favour of the JWT
            fileUris: [fileUri],
            input: { status: IngestSlugStatus.Ingesting }
          },
          sourceJwtHeaders
        );
        const bulk = requirePayload(
          result?.data?.ingestSlugUpdateStatus,
          'ingestSlugUpdateStatus'
        );

        expect(bulk.sourceId).toEqual(sourceJwtSourceId);
        expect(bulk.sourceId).not.toEqual(DIFFERENT_SOURCE_ID);
        expect((bulk.updated ?? []).length).toBeGreaterThan(0);
      } finally {
        await deleteSlugWithSuperadmin(fileUri);
      }
    });

    it('#ingestSlugsDelete - should use sourceId from JWT instead of input sourceId', async () => {
      const fileUri = await createSlugWithJwt('jwt-precedence-delete.mp4');

      const result = await fixture.client.sdk.ingestSlugsDelete(
        {
          sourceId: DIFFERENT_SOURCE_ID, // ignored in favour of the JWT
          fileUris: [fileUri]
        },
        sourceJwtHeaders
      );
      const deleted = requirePayload(
        result?.data?.ingestSlugsDelete,
        'ingestSlugsDelete'
      );

      expect(deleted.sourceId).toEqual(sourceJwtSourceId);
      expect(deleted.sourceId).not.toEqual(DIFFERENT_SOURCE_ID);
      expect((deleted.deleted ?? []).length).toBeGreaterThan(0);
      expect(deleted.deleted?.[0].sourceId).toEqual(sourceJwtSourceId);
    });
  });

  describe('#ingestSlugsDelete security', () => {
    /**
     * The legacy "user lacks permission" test drove a client whose userAuth
     * was never assigned, so it sent an unauthenticated request and merely
     * repeated the anonymous test below. It now uses a real member of the
     * same organization holding a role without slug rights, which is what the
     * assertion claims to cover.
     */
    let unprivilegedSdk: Sdk;
    let unprivilegedUserId: string;
    let organizationId: string;

    beforeAll(async () => {
      const meResult = await fixture.client.sdk.me();
      const me = requirePayload(meResult?.data?.me, 'me');
      if (!me.organizationId) {
        throw new Error('me() returned no organizationId');
      }
      organizationId = me.organizationId;

      const userName = `citest-ingestslug-noslug-${uuidv4()}@localhost`;
      const password = uuidv4();
      const userResult = await fixture.client.sdk.createUser({
        input: {
          name: userName,
          password,
          organizationId,
          roleIds: [NO_SLUG_RIGHTS_ROLE_ID]
        }
      });
      const user = requirePayload(userResult?.data?.createUser, 'createUser');
      unprivilegedUserId = user.id;

      const unprivilegedClient = await createClientWithUser(
        userName,
        password,
        config.env
      );
      unprivilegedSdk = unprivilegedClient.sdk;
    });

    afterAll(async () => {
      if (unprivilegedUserId) {
        await safe(`delete unprivileged user ${unprivilegedUserId}`, () =>
          fixture.client.sdk.deleteUser({ id: unprivilegedUserId })
        );
      }
    });

    const createSecuritySlug = async (): Promise<string> => {
      const fileUri = testFileUri('security', 'file.mp4');
      const created = await createSlugs({
        files: [
          {
            fileUri,
            bundleKey: 'bundle-security',
            mimeType: 'video/mp4',
            fileSizeBytes: 1000,
            fileCreatedAt: '2024-01-01T00:00:00Z',
            fileModifiedAt: '2024-01-01T00:00:00Z',
            status: IngestSlugStatus.Pending
          }
        ]
      });
      expect(created.created ?? []).toHaveLength(1);
      return fileUri;
    };

    it('should deny delete when user lacks permission', async () => {
      const fileUri = await createSecuritySlug();
      fixture.trackSlug(fileUri);

      const promise = unprivilegedSdk.ingestSlugsDelete({
        sourceId,
        fileUris: [fileUri]
      });

      await expect(promise).rejects.toThrow();

      // The slug must survive the denied delete
      const stillThere = await fixture.client.sdk.ingestSlug({
        sourceId,
        fileUri
      });
      expect(
        requirePayload(stillThere?.data?.ingestSlug, 'ingestSlug').fileUri
      ).toEqual(fileUri);
    });

    it('should allow superadmin to delete ingest slug', async () => {
      const fileUri = await createSecuritySlug();

      const result = await fixture.client.sdk.ingestSlugsDelete({
        sourceId,
        fileUris: [fileUri]
      });
      const deleted = requirePayload(
        result?.data?.ingestSlugsDelete,
        'ingestSlugsDelete'
      );

      expect(deleted.deleted ?? []).toHaveLength(1);
      expect(deleted.deleted?.[0].fileUri).toBe(fileUri);
    });

    it('should reject unauthenticated request', async () => {
      const anonymousSdk = createUnauthenticatedSdk(fixture.client.url);

      const promise = anonymousSdk.ingestSlugsDelete({
        sourceId,
        fileUris: ['s3://bucket/test.mp4']
      });

      await expect(promise).rejects.toThrow();
    });
  });
});
