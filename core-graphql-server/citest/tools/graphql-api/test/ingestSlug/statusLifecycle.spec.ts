import {
  IngestSlugEntryInput,
  IngestSlugStatus,
  IngestSlugUpdateInput
} from '../../src/gql';
import { helpers } from '../../src/helpers';
import {
  IngestSlugFixture,
  IngestSlugPayload,
  createIngestSlugFixture,
  requirePayload,
  testFileUri
} from '../helpers/ingestSlug.helper';

const env = helpers.config.env.toLowerCase();

describe(`citest_ingestSlug: Complete Status Lifecycle in the ${env} environment`, () => {
  let fixture: IngestSlugFixture;

  beforeAll(async () => {
    fixture = await createIngestSlugFixture({ label: 'lifecycle' });
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  const createSlug = async (
    fileUri: string,
    overrides: Partial<IngestSlugEntryInput> = {}
  ) => {
    const result = await fixture.client.sdk.ingestSlugsCreate({
      input: {
        sourceId: fixture.sourceId,
        engineId: fixture.engineId,
        appId: fixture.appId,
        files: [{ fileUri, mimeType: 'video/mp4', ...overrides }]
      }
    });
    fixture.trackSlug(fileUri);
    return requirePayload(result?.data?.ingestSlugsCreate, 'ingestSlugsCreate');
  };

  const updateSlug = async (
    fileUri: string,
    input: IngestSlugUpdateInput
  ): Promise<void> => {
    const result = await fixture.client.sdk.ingestSlugUpdate({
      sourceId: fixture.sourceId,
      fileUri,
      input
    });
    requirePayload(result?.data?.ingestSlugUpdate, 'ingestSlugUpdate');
  };

  const getSlug = async (fileUri: string): Promise<IngestSlugPayload> => {
    const result = await fixture.client.sdk.ingestSlug({
      sourceId: fixture.sourceId,
      fileUri
    });
    return requirePayload(result?.data?.ingestSlug, 'ingestSlug');
  };

  describe('Complete Status Lifecycle', () => {
    it('should create slug with ineligible status', async () => {
      const fileUri = testFileUri('ineligible', 'file.unsupported');

      const created = await createSlug(fileUri, {
        mimeType: 'application/octet-stream',
        status: IngestSlugStatus.Ineligible
      });

      expect(created.created ?? []).toHaveLength(1);
      expect(created.created?.[0].status).toBe(IngestSlugStatus.Ineligible);

      // Verify it was created with ineligible status
      const slug = await getSlug(fileUri);
      expect(slug.status).toBe(IngestSlugStatus.Ineligible);
    });

    it('should transition through complete ingesting workflow (happy path)', async () => {
      const fileUri = testFileUri('workflow', 'file.mp4');
      await createSlug(fileUri);

      // Verify initial pending status
      expect((await getSlug(fileUri)).status).toBe(IngestSlugStatus.Pending);

      // Transition: pending -> ingesting
      await updateSlug(fileUri, {
        status: IngestSlugStatus.Ingesting,
        statusMessage: 'Processing started'
      });

      let slug = await getSlug(fileUri);
      expect(slug.status).toBe(IngestSlugStatus.Ingesting);
      expect(slug.statusMessage).toBe('Processing started');

      // Transition: ingesting -> ingested
      await updateSlug(fileUri, {
        status: IngestSlugStatus.Ingested,
        statusMessage: 'Processing completed successfully'
      });

      slug = await getSlug(fileUri);
      expect(slug.status).toBe(IngestSlugStatus.Ingested);
      expect(slug.statusMessage).toBe('Processing completed successfully');
    });

    it('should transition through ingesting workflow (error path)', async () => {
      const fileUri = testFileUri('error-path', 'file.mp4');
      await createSlug(fileUri);

      // Transition: pending -> ingesting
      await updateSlug(fileUri, {
        status: IngestSlugStatus.Ingesting,
        statusMessage: 'Processing started'
      });

      // Transition: ingesting -> failed
      await updateSlug(fileUri, {
        status: IngestSlugStatus.Failed,
        statusMessage: 'Processing error: file corrupted'
      });

      const slug = await getSlug(fileUri);
      expect(slug.status).toBe(IngestSlugStatus.Failed);
      expect(slug.statusMessage).toContain('file corrupted');
    });

    it('should handle deferred status for retry scenarios', async () => {
      const fileUri = testFileUri('deferred', 'file.mp4');
      await createSlug(fileUri);

      // Transition to deferred (e.g. rate limited, temporary failure)
      await updateSlug(fileUri, {
        status: IngestSlugStatus.Deferred,
        statusMessage: 'Rate limited - will retry in 5 minutes'
      });

      const slug = await getSlug(fileUri);
      expect(slug.status).toBe(IngestSlugStatus.Deferred);
      expect(slug.statusMessage).toContain('retry');

      // Later, retry: deferred -> pending
      await updateSlug(fileUri, {
        status: IngestSlugStatus.Pending,
        statusMessage: 'Retry scheduled'
      });

      expect((await getSlug(fileUri)).status).toBe(IngestSlugStatus.Pending);
    });

    it('should handle absent status for missing files', async () => {
      const fileUri = testFileUri('absent', 'missing-file.mp4');
      await createSlug(fileUri);

      // Mark as absent (file was deleted from S3)
      await updateSlug(fileUri, {
        status: IngestSlugStatus.Absent,
        statusMessage: 'File not found in S3 bucket'
      });

      const slug = await getSlug(fileUri);
      expect(slug.status).toBe(IngestSlugStatus.Absent);
      expect(slug.statusMessage).toContain('not found');
    });

    it('should handle uploaded status workflow', async () => {
      const fileUri = testFileUri('uploaded', 'file.mp4');
      await createSlug(fileUri);

      // pending -> ingesting -> uploaded (file uploaded, ready for processing)
      await updateSlug(fileUri, { status: IngestSlugStatus.Ingesting });
      await updateSlug(fileUri, {
        status: IngestSlugStatus.Uploaded,
        statusMessage: 'File uploaded to processing location'
      });

      expect((await getSlug(fileUri)).status).toBe(IngestSlugStatus.Uploaded);

      // uploaded -> ingested (after processing completes)
      await updateSlug(fileUri, {
        status: IngestSlugStatus.Ingested,
        statusMessage: 'Processing complete'
      });

      expect((await getSlug(fileUri)).status).toBe(IngestSlugStatus.Ingested);
    });

    it('should support all 8 status enum values', async () => {
      /** Driven off the generated enum rather than a hand-copied list, so a
       * new IngestSlugStatus member cannot silently go untested. */
      const statuses = Object.values(IngestSlugStatus);
      expect(statuses).toHaveLength(8);

      for (const status of statuses) {
        const fileUri = testFileUri('status-test', `${status}.mp4`);

        const created = await createSlug(fileUri, { status });

        expect(created.created ?? []).toHaveLength(1);
        expect(created.created?.[0].status).toBe(status);

        // Verify the status persisted correctly
        expect((await getSlug(fileUri)).status).toBe(status);
      }
    });

    it('should track status transitions with statusMessage', async () => {
      const fileUri = testFileUri('transition-tracking', 'file.mp4');
      await createSlug(fileUri);

      const transitions = [
        {
          status: IngestSlugStatus.Ingesting,
          message: 'Step 1: Starting ingestion'
        },
        {
          status: IngestSlugStatus.Uploaded,
          message: 'Step 2: File uploaded to processing'
        },
        {
          status: IngestSlugStatus.Ingested,
          message: 'Step 3: Processing complete'
        }
      ];

      for (const transition of transitions) {
        await updateSlug(fileUri, {
          status: transition.status,
          statusMessage: transition.message
        });

        const slug = await getSlug(fileUri);
        expect(slug.status).toBe(transition.status);
        expect(slug.statusMessage).toBe(transition.message);
      }
    });
  });
});
