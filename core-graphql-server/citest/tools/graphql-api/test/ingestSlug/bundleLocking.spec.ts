import { v4 as uuidv4 } from 'uuid';

import {
  IngestSlugEntryInput,
  IngestSlugStatus,
  IngestSlugsStatusUpdateInput
} from '../../src/gql';
import { helpers } from '../../src/helpers';
import {
  IngestSlugFixture,
  IngestSlugsCreatePayload,
  IngestSlugUpdateStatusPayload,
  createIngestSlugFixture,
  requirePayload,
  testFileUri
} from '../helpers/ingestSlug.helper';

const env = helpers.config.env.toLowerCase();

describe(`citest_ingestSlug: Bundle Locking Mechanism in the ${env} environment`, () => {
  let fixture: IngestSlugFixture;

  beforeAll(async () => {
    fixture = await createIngestSlugFixture({ label: 'bundlelock' });
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  const createSlugs = async (
    files: IngestSlugEntryInput[]
  ): Promise<IngestSlugsCreatePayload> => {
    const result = await fixture.client.sdk.ingestSlugsCreate({
      input: {
        sourceId: fixture.sourceId,
        engineId: fixture.engineId,
        appId: fixture.appId,
        files
      }
    });
    files.forEach((file) => fixture.trackSlug(file.fileUri));
    return requirePayload(result?.data?.ingestSlugsCreate, 'ingestSlugsCreate');
  };

  const updateStatus = async (
    fileUris: string[],
    input: IngestSlugsStatusUpdateInput
  ): Promise<IngestSlugUpdateStatusPayload> => {
    const result = await fixture.client.sdk.ingestSlugUpdateStatus({
      sourceId: fixture.sourceId,
      fileUris,
      input
    });
    return requirePayload(
      result?.data?.ingestSlugUpdateStatus,
      'ingestSlugUpdateStatus'
    );
  };

  const videoFile = (
    fileUri: string,
    bundleKey?: string,
    fileSizeBytes?: number
  ): IngestSlugEntryInput => ({
    fileUri,
    mimeType: 'video/mp4',
    ...(bundleKey === undefined ? {} : { bundleKey }),
    ...(fileSizeBytes === undefined ? {} : { fileSizeBytes })
  });

  describe('Bundle Locking Mechanism', () => {
    it('should prevent two files in same bundle from being ingesting simultaneously', async () => {
      const bundleKey = `bundle-lock-test-${uuidv4()}`;
      const file1Uri = testFileUri('lock-test', 'file1.mp4');
      const file2Uri = testFileUri('lock-test', 'file2.mp4');

      // Create two files with same bundle
      const createResult = await createSlugs([
        videoFile(file1Uri, bundleKey, 1000),
        videoFile(file2Uri, bundleKey, 2000)
      ]);
      expect(createResult.created ?? []).toHaveLength(2);

      // Set first file to ingesting - should succeed
      const updateFile1Result = await updateStatus([file1Uri], {
        status: IngestSlugStatus.Ingesting
      });

      expect(updateFile1Result.updated ?? []).toHaveLength(1);
      expect(updateFile1Result.updated?.[0].status).toBe(
        IngestSlugStatus.Ingesting
      );

      // Try to set second file to ingesting - should fail with resource_conflict
      const updateFile2Result = await updateStatus([file2Uri], {
        status: IngestSlugStatus.Ingesting
      });

      expect(updateFile2Result.updated ?? []).toHaveLength(0);
      expect(updateFile2Result.failed ?? []).toHaveLength(1);
      expect(updateFile2Result.failed?.[0].fileUri).toBe(file2Uri);
      expect(updateFile2Result.failed?.[0].errorCode).toBe('resource_conflict');
      expect(updateFile2Result.failed?.[0].errorMessage).toContain(
        'bundle_key'
      );
      expect(updateFile2Result.failed?.[0].errorMessage).toContain(bundleKey);
    });

    it('should allow second file to ingest after first completes', async () => {
      const bundleKey = `bundle-sequential-${uuidv4()}`;
      const file1Uri = testFileUri('sequential', 'file1.mp4');
      const file2Uri = testFileUri('sequential', 'file2.mp4');

      await createSlugs([
        videoFile(file1Uri, bundleKey),
        videoFile(file2Uri, bundleKey)
      ]);

      // File 1: pending -> ingesting
      await updateStatus([file1Uri], { status: IngestSlugStatus.Ingesting });

      // File 1: ingesting -> ingested (release lock)
      const completeFile1 = await updateStatus([file1Uri], {
        status: IngestSlugStatus.Ingested
      });

      expect(completeFile1.updated ?? []).toHaveLength(1);
      expect(completeFile1.updated?.[0].status).toBe(IngestSlugStatus.Ingested);

      // File 2: pending -> ingesting (should now succeed)
      const updateFile2 = await updateStatus([file2Uri], {
        status: IngestSlugStatus.Ingesting
      });

      expect(updateFile2.updated ?? []).toHaveLength(1);
      expect(updateFile2.updated?.[0].status).toBe(IngestSlugStatus.Ingesting);
      expect(updateFile2.failed ?? []).toHaveLength(0);
    });

    it('should allow concurrent ingesting for different bundles', async () => {
      const bundle1Key = `bundle-concurrent-1-${uuidv4()}`;
      const bundle2Key = `bundle-concurrent-2-${uuidv4()}`;
      const file1Uri = testFileUri('concurrent', 'file1.mp4');
      const file2Uri = testFileUri('concurrent', 'file2.mp4');

      await createSlugs([
        videoFile(file1Uri, bundle1Key),
        videoFile(file2Uri, bundle2Key)
      ]);

      const update1 = await updateStatus([file1Uri], {
        status: IngestSlugStatus.Ingesting
      });
      expect(update1.updated ?? []).toHaveLength(1);

      // Set second file to ingesting - should succeed (different bundle)
      const update2 = await updateStatus([file2Uri], {
        status: IngestSlugStatus.Ingesting
      });

      expect(update2.updated ?? []).toHaveLength(1);
      expect(update2.updated?.[0].status).toBe(IngestSlugStatus.Ingesting);
      expect(update2.failed ?? []).toHaveLength(0);
    });

    it('should not lock files with null bundleKey', async () => {
      const file1Uri = testFileUri('null-bundle', 'file1.mp4');
      const file2Uri = testFileUri('null-bundle', 'file2.mp4');

      // Create two files without bundleKey (null)
      await createSlugs([videoFile(file1Uri), videoFile(file2Uri)]);

      const update1 = await updateStatus([file1Uri], {
        status: IngestSlugStatus.Ingesting
      });
      expect(update1.updated ?? []).toHaveLength(1);

      // Set second file to ingesting - should succeed (null bundleKey)
      const update2 = await updateStatus([file2Uri], {
        status: IngestSlugStatus.Ingesting
      });

      expect(update2.updated ?? []).toHaveLength(1);
      expect(update2.updated?.[0].status).toBe(IngestSlugStatus.Ingesting);
      expect(update2.failed ?? []).toHaveLength(0);
    });

    it('should handle lock release on transition to failed status', async () => {
      const bundleKey = `bundle-failed-${uuidv4()}`;
      const file1Uri = testFileUri('failed', 'file1.mp4');
      const file2Uri = testFileUri('failed', 'file2.mp4');

      await createSlugs([
        videoFile(file1Uri, bundleKey),
        videoFile(file2Uri, bundleKey)
      ]);

      // File 1: pending -> ingesting
      await updateStatus([file1Uri], { status: IngestSlugStatus.Ingesting });

      // File 1: ingesting -> failed (release lock)
      await updateStatus([file1Uri], {
        status: IngestSlugStatus.Failed,
        statusMessage: 'Processing error'
      });

      // File 2: pending -> ingesting (should succeed after lock released)
      const update2 = await updateStatus([file2Uri], {
        status: IngestSlugStatus.Ingesting
      });

      expect(update2.updated ?? []).toHaveLength(1);
      expect(update2.updated?.[0].status).toBe(IngestSlugStatus.Ingesting);
    });

    it('should handle batch update with mixed bundle lock scenarios', async () => {
      const lockedBundle = `bundle-locked-${uuidv4()}`;
      const unlockedBundle = `bundle-unlocked-${uuidv4()}`;

      const file1Uri = testFileUri('batch-lock', 'file1.mp4'); // will be locked
      const file2Uri = testFileUri('batch-lock', 'file2.mp4'); // same bundle as file1
      const file3Uri = testFileUri('batch-lock', 'file3.mp4'); // different bundle

      await createSlugs([
        videoFile(file1Uri, lockedBundle),
        videoFile(file2Uri, lockedBundle),
        videoFile(file3Uri, unlockedBundle)
      ]);

      // Lock first bundle by setting file1 to ingesting
      await updateStatus([file1Uri], { status: IngestSlugStatus.Ingesting });

      // Try to update both file2 and file3 in one batch call
      const batchUpdate = await updateStatus([file2Uri, file3Uri], {
        status: IngestSlugStatus.Ingesting
      });

      // file2 should fail (locked bundle), file3 should succeed
      expect(batchUpdate.updated ?? []).toHaveLength(1);
      expect(batchUpdate.updated?.[0].fileUri).toBe(file3Uri);

      expect(batchUpdate.failed ?? []).toHaveLength(1);
      expect(batchUpdate.failed?.[0].fileUri).toBe(file2Uri);
      expect(batchUpdate.failed?.[0].errorCode).toBe('resource_conflict');
    });
  });
});
