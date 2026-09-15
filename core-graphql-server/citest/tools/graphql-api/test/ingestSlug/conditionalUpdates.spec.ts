import {
  IngestSlugEntryInput,
  IngestSlugStatus,
  IngestSlugUpdateInput
} from '../../src/gql';
import { helpers } from '../../src/helpers';
import {
  IngestSlugFixture,
  IngestSlugUpdatePayload,
  createIngestSlugFixture,
  requirePayload,
  testFileUri
} from '../helpers/ingestSlug.helper';

const env = helpers.config.env.toLowerCase();

describe(`citest_ingestSlug: Conditional Updates with Status Filter in the ${env} environment`, () => {
  let fixture: IngestSlugFixture;

  beforeAll(async () => {
    fixture = await createIngestSlugFixture({ label: 'statusfilter' });
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  /** Creates one tracked slug and returns its fileUri. */
  const createSlug = async (
    area: string,
    overrides: Partial<IngestSlugEntryInput> = {}
  ): Promise<string> => {
    const fileUri = testFileUri(area, 'file.mp4');
    await fixture.client.sdk.ingestSlugsCreate({
      input: {
        sourceId: fixture.sourceId,
        engineId: fixture.engineId,
        appId: fixture.appId,
        files: [{ fileUri, mimeType: 'video/mp4', ...overrides }]
      }
    });
    fixture.trackSlug(fileUri);
    return fileUri;
  };

  const updateSlug = async (
    fileUri: string,
    input: IngestSlugUpdateInput
  ): Promise<IngestSlugUpdatePayload> => {
    const result = await fixture.client.sdk.ingestSlugUpdate({
      sourceId: fixture.sourceId,
      fileUri,
      input
    });
    return requirePayload(result?.data?.ingestSlugUpdate, 'ingestSlugUpdate');
  };

  describe('Conditional Updates with Status Filter', () => {
    it('should update only if current status matches filter', async () => {
      const fileUri = await createSlug('filter-test');

      // Update with filter matching current status - should succeed
      const updated = await updateSlug(fileUri, {
        status: IngestSlugStatus.Ingesting,
        statusMessage: 'Starting processing',
        filter: { status: IngestSlugStatus.Pending }
      });

      expect(updated.status).toBe(IngestSlugStatus.Ingesting);
      expect(updated.statusMessage).toBe('Starting processing');
    });

    it('should fail update if status has changed (optimistic lock violation)', async () => {
      const fileUri = await createSlug('filter-conflict');

      // Move the slug out of `pending` first
      await updateSlug(fileUri, { status: IngestSlugStatus.Ingested });

      // Try to update with filter expecting 'pending' - should fail
      const promise = fixture.client.sdk.ingestSlugUpdate({
        sourceId: fixture.sourceId,
        fileUri,
        input: {
          statusMessage: 'This should not update',
          filter: { status: IngestSlugStatus.Pending }
        }
      });

      await expect(promise).rejects.toThrow(/not found/i);
      await expect(promise).rejects.toThrow(/status filter/i);
    });

    it('should include status filter info in error message', async () => {
      const fileUri = await createSlug('filter-error', {
        status: IngestSlugStatus.Ingested
      });

      // Try to update with wrong filter
      const promise = fixture.client.sdk.ingestSlugUpdate({
        sourceId: fixture.sourceId,
        fileUri,
        input: {
          statusMessage: 'Update attempt',
          filter: { status: IngestSlugStatus.Failed }
        }
      });

      await expect(promise).rejects.toThrow(/not found/i);
      await expect(promise).rejects.toThrow(/status filter/i);
    });

    it('should prevent concurrent modification race conditions', async () => {
      const fileUri = await createSlug('race-condition');

      /** Simulate a race condition: two processes trying to transition from
       * pending. The first one succeeds. */
      const update1 = await updateSlug(fileUri, {
        status: IngestSlugStatus.Ingesting,
        statusMessage: 'Process 1',
        filter: { status: IngestSlugStatus.Pending }
      });

      expect(update1.status).toBe(IngestSlugStatus.Ingesting);

      // Second process should fail (status no longer pending)
      const promise = fixture.client.sdk.ingestSlugUpdate({
        sourceId: fixture.sourceId,
        fileUri,
        input: {
          status: IngestSlugStatus.Ingesting,
          statusMessage: 'Process 2',
          filter: { status: IngestSlugStatus.Pending }
        }
      });

      await expect(promise).rejects.toThrow(/not found/i);
    });

    it('should allow update without filter (backward compatibility)', async () => {
      const fileUri = await createSlug('no-filter');

      // Update without filter - should work regardless of current status
      const updated = await updateSlug(fileUri, {
        status: IngestSlugStatus.Ingested,
        statusMessage: 'Updated without filter'
      });

      expect(updated.status).toBe(IngestSlugStatus.Ingested);
      expect(updated.statusMessage).toBe('Updated without filter');
    });
  });
});
