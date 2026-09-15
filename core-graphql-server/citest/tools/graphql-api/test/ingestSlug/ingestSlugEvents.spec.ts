import { Message, Reader } from 'nsqjs';
import { v4 as uuidv4 } from 'uuid';

import { helpers } from '../../src/helpers';
import { IngestSlugStatus } from '../../src/gql';
import {
  IngestSlugFixture,
  createIngestSlugFixture,
  testFileUri
} from '../helpers/ingestSlug.helper';

const config = helpers.config;
const env = config.env.toLowerCase();

interface CapturedEvent {
  event: string;
  fileUri?: string;
  sourceId?: string;
  [key: string]: unknown;
}

describe(`citest_ingestSlug: ingestSlug event testing in the ${env} environment`, () => {
  let fixture: IngestSlugFixture;
  let sourceId: string;
  const readers: Reader[] = [];
  let messageConsumerActive = false;
  const capturedMessages = {
    ingestSlugsCreated: [] as CapturedEvent[],
    ingestSlugsUpdated: [] as CapturedEvent[],
    ingestSlugsDeleteBySource: [] as CapturedEvent[]
  };

  // The `events` topic carries the raw created/updated/delete messages emitted
  // directly by the resolver, while `IngestionTopic` carries a second, relayed
  // copy of ONLY the created/updated events (routed via core-eventing-service
  // per flyway/db/platform/sql/V3_271__create_ingest_slug_events.sql). A single
  // handler shared across both readers therefore double-counts created/updated
  // events. Split the handlers so each topic is only responsible for the event
  // types it uniquely carries, mirroring the legacy JS spec.
  const handleIngestionMessage = (msg: Message): void => {
    try {
      const event = JSON.parse(msg.body.toString()) as CapturedEvent;
      if (event.event === 'ingest_slug_created') {
        capturedMessages.ingestSlugsCreated.push(event);
      } else if (event.event === 'ingest_slug_updated') {
        capturedMessages.ingestSlugsUpdated.push(event);
      }
    } catch (parseErr) {
      console.debug(
        'Failed to parse NSQ message:',
        (parseErr as Error).message
      );
    } finally {
      msg.finish();
    }
  };

  const handleDeleteMessage = (msg: Message): void => {
    try {
      const event = JSON.parse(msg.body.toString()) as CapturedEvent;
      if (event.event === 'ingest_slugs_delete_by_source') {
        capturedMessages.ingestSlugsDeleteBySource.push(event);
      }
    } catch (parseErr) {
      console.debug(
        'Failed to parse NSQ message:',
        (parseErr as Error).message
      );
    } finally {
      msg.finish();
    }
  };

  beforeAll(async () => {
    fixture = await createIngestSlugFixture({
      label: 'events',
      sourceCount: 1
    });
    sourceId = fixture.sourceId;

    // Initialize NSQ consumers for message verification. Best-effort: if nsqd
    // is unreachable, `messageConsumerActive` stays false and every test below
    // skips its NSQ assertions (mirroring the legacy JS spec's behavior).
    try {
      const nsqdAddress: string = config.nsqd ?? 'localhost:4150';

      // Reader for IngestionTopic (created/updated events)
      const ingestionReader = new Reader(
        'IngestionTopic',
        'citest-ingest-slug-messages#ephemeral',
        {
          nsqdTCPAddresses: [nsqdAddress],
          maxInFlight: 100,
          messageTimeout: 60000
        }
      );
      ingestionReader.on('message', handleIngestionMessage);
      readers.push(ingestionReader);

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.debug(
            'NSQ reader connection timed out - nsqd may not be available'
          );
          resolve();
        }, 5000);

        ingestionReader.on('error', (err) => {
          console.debug('NSQ reader error:', err.message);
          messageConsumerActive = false;
          clearTimeout(timeout);
          resolve();
        });

        ingestionReader.on('ready', () => {
          messageConsumerActive = true;
          console.debug('NSQ message consumer ready for IngestionTopic');
          clearTimeout(timeout);
          resolve();
        });

        ingestionReader.connect();
      });

      // Reader for IngestSlugsTopic (our custom topic for background deletion)
      const deleteReader = new Reader(
        'events',
        'citest-delete-slug-messages#ephemeral',
        {
          nsqdTCPAddresses: [nsqdAddress],
          maxInFlight: 100,
          messageTimeout: 60000
        }
      );
      deleteReader.on('message', handleDeleteMessage);
      deleteReader.on('error', (err) => {
        console.debug('NSQ delete reader error:', err.message);
      });
      deleteReader.connect();
      readers.push(deleteReader);

      // Give the delete reader time to establish its connection
      await helpers.sleep(500);
    } catch (initErr) {
      console.debug(
        'NSQ message verification disabled:',
        (initErr as Error).message
      );
    }
  });

  afterAll(async () => {
    for (const reader of readers) {
      try {
        reader.close();
      } catch (err) {
        console.debug('Error closing NSQ reader:', (err as Error).message);
      }
    }

    await fixture.cleanup();
  });

  describe('IngestSlugCreated Event', () => {
    it('should capture IngestSlugCreated event when creating a single ingest slug', async () => {
      if (!messageConsumerActive) {
        console.log('Skipping test: NSQ message consumer is not active');
        return;
      }
      const bundleKey = `bundle-created-${uuidv4()}`;
      const fileUri = testFileUri('files', 'test-file-created.mp4');

      await fixture.client.sdk.ingestSlugsCreate({
        input: {
          sourceId,
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
        }
      });
      fixture.trackSlug(fileUri, sourceId);

      // Verify ingest_slug_created event was captured from NSQ
      await helpers.sleep(500);
      const createEvents = capturedMessages.ingestSlugsCreated.filter(
        (e) => e.fileUri === fileUri
      );
      expect(createEvents.length).toEqual(1);
      expect(createEvents[0].event).toEqual('ingest_slug_created');
      expect(createEvents[0].fileUri).toEqual(fileUri);
    });

    it('should capture IngestSlugCreated event for each file in batch creation', async () => {
      if (!messageConsumerActive) {
        console.log('Skipping test: NSQ message consumer is not active');
        return;
      }
      const bundleKey = `bundle-batch-created-${uuidv4()}`;
      const expectedFileUris: string[] = [];
      const files = Array.from({ length: 3 }, (_, i) => {
        const fileUri = testFileUri('batch-created', `file-${i}.mp4`);
        expectedFileUris.push(fileUri);
        return {
          fileUri,
          bundleKey,
          mimeType: 'video/mp4',
          fileSizeBytes: Math.floor(Math.random() * 2147483648),
          fileCreatedAt: new Date().toISOString()
        };
      });

      const result = await fixture.client.sdk.ingestSlugsCreate({
        input: {
          sourceId,
          engineId: fixture.engineId,
          appId: fixture.appId,
          files
        }
      });

      (result.data?.ingestSlugsCreate?.created ?? []).forEach((created) => {
        fixture.trackSlug(created.fileUri, sourceId);
      });

      // Verify ingest_slug_created events were captured from NSQ (one per file)
      await helpers.sleep(1000);
      const batchCreateEvents = capturedMessages.ingestSlugsCreated.filter(
        (e) => expectedFileUris.includes(e.fileUri as string)
      );
      expect(batchCreateEvents.length).toEqual(expectedFileUris.length);
      batchCreateEvents.forEach((event) => {
        expect(event.event).toEqual('ingest_slug_created');
      });
    });
  });

  describe('IngestSlugUpdated Event', () => {
    let slugForUpdate: { sourceId: string; fileUri: string };

    beforeAll(async () => {
      if (!messageConsumerActive) {
        return;
      }
      // Create a slug that will be updated
      const fileUri = testFileUri('files', 'test-file-for-update.mp4');
      const result = await fixture.client.sdk.ingestSlugsCreate({
        input: {
          sourceId,
          engineId: fixture.engineId,
          appId: fixture.appId,
          files: [
            {
              fileUri,
              bundleKey: `bundle-for-update-${uuidv4()}`,
              mimeType: 'video/mp4',
              fileSizeBytes: 1073741824,
              fileCreatedAt: new Date().toISOString()
            }
          ]
        }
      });
      const created = result.data?.ingestSlugsCreate?.created?.[0];
      if (!created) {
        throw new Error('ingestSlugsCreate returned no created slug');
      }
      slugForUpdate = { sourceId: created.sourceId, fileUri: created.fileUri };
      fixture.trackSlug(slugForUpdate.fileUri, slugForUpdate.sourceId);
    });

    it('should capture IngestSlugUpdated event when updating ingest slug status', async () => {
      if (!messageConsumerActive) {
        console.log('Skipping test: NSQ message consumer is not active');
        return;
      }

      await fixture.client.sdk.ingestSlugUpdate({
        sourceId: slugForUpdate.sourceId,
        fileUri: slugForUpdate.fileUri,
        input: {
          status: IngestSlugStatus.Ingesting,
          statusMessage: 'File is being ingested'
        }
      });

      // Verify ingest_slug_updated event was captured from NSQ
      await helpers.sleep(500);
      const updateEvents = capturedMessages.ingestSlugsUpdated.filter(
        (e) => e.fileUri === slugForUpdate.fileUri
      );
      expect(updateEvents.length).toBeGreaterThanOrEqual(1);
      expect(updateEvents[0].event).toEqual('ingest_slug_updated');
      expect(updateEvents[0].fileUri).toEqual(slugForUpdate.fileUri);
    });

    it('should capture IngestSlugUpdated event when updating multiple ingest slug statuses', async () => {
      if (!messageConsumerActive) {
        console.log('Skipping test: NSQ message consumer is not active');
        return;
      }
      const bundleKey = `bundle-batch-update-${uuidv4()}`;
      const fileUrisToUpdate: string[] = [];
      const createFiles = Array.from({ length: 2 }, (_, i) => {
        const fileUri = testFileUri('batch-update', `file-${i}.mp4`);
        fileUrisToUpdate.push(fileUri);
        return {
          fileUri,
          bundleKey,
          mimeType: 'video/mp4',
          fileSizeBytes: 1073741824,
          fileCreatedAt: new Date().toISOString()
        };
      });

      const createResult = await fixture.client.sdk.ingestSlugsCreate({
        input: {
          sourceId,
          engineId: fixture.engineId,
          appId: fixture.appId,
          files: createFiles
        }
      });
      (createResult.data?.ingestSlugsCreate?.created ?? []).forEach(
        (created) => {
          fixture.trackSlug(created.fileUri, sourceId);
        }
      );

      await fixture.client.sdk.ingestSlugUpdateStatus({
        sourceId,
        fileUris: fileUrisToUpdate,
        input: {
          status: IngestSlugStatus.Uploaded,
          statusMessage: 'Processing complete'
        }
      });

      // Verify ingest_slug_updated events were captured from NSQ (one per file)
      await helpers.sleep(1000);
      const batchUpdateEvents = capturedMessages.ingestSlugsUpdated.filter(
        (e) => fileUrisToUpdate.includes(e.fileUri as string)
      );
      expect(batchUpdateEvents.length).toEqual(fileUrisToUpdate.length);
      batchUpdateEvents.forEach((event) => {
        expect(event.event).toEqual('ingest_slug_updated');
      });
    });

    it('should capture IngestSlugUpdated for multiple status transitions', async () => {
      if (!messageConsumerActive) {
        console.log('Skipping test: NSQ message consumer is not active');
        return;
      }
      const fileUri = testFileUri('files', 'test-file-transition.mp4');

      const result = await fixture.client.sdk.ingestSlugsCreate({
        input: {
          sourceId,
          engineId: fixture.engineId,
          appId: fixture.appId,
          files: [
            {
              fileUri,
              bundleKey: `bundle-transition-${uuidv4()}`,
              mimeType: 'video/mp4',
              fileSizeBytes: 1073741824,
              fileCreatedAt: new Date().toISOString()
            }
          ]
        }
      });
      const createdSlug = result.data?.ingestSlugsCreate?.created?.[0];
      if (!createdSlug) {
        throw new Error('ingestSlugsCreate returned no created slug');
      }
      fixture.trackSlug(createdSlug.fileUri, createdSlug.sourceId);

      // Perform multiple status transitions
      const statuses = [
        IngestSlugStatus.Ingesting,
        IngestSlugStatus.Uploaded,
        IngestSlugStatus.Ingested
      ];
      for (const status of statuses) {
        await fixture.client.sdk.ingestSlugUpdate({
          sourceId: createdSlug.sourceId,
          fileUri: createdSlug.fileUri,
          input: { status, statusMessage: `Transitioned to ${status}` }
        });
      }

      // Verify multiple ingest_slug_updated events were captured
      await helpers.sleep(1000);
      const transitionEvents = capturedMessages.ingestSlugsUpdated.filter(
        (e) => e.fileUri === createdSlug.fileUri
      );
      expect(transitionEvents.length).toEqual(statuses.length);
      transitionEvents.forEach((event) => {
        expect(event.event).toEqual('ingest_slug_updated');
      });
    });
  });

  describe('IngestSlugsDeleteBySource Event', () => {
    it('should capture IngestSlugsDeleteBySource event when deleting ingest slugs by source', async () => {
      // First create a slug we can delete
      const fileUri = testFileUri('files', 'delete-by-source.mp4');

      await fixture.client.sdk.ingestSlugsCreate({
        input: {
          sourceId,
          engineId: fixture.engineId,
          appId: fixture.appId,
          files: [
            {
              fileUri,
              bundleKey: `bundle-delete-${uuidv4()}`,
              mimeType: 'video/mp4',
              fileSizeBytes: 1073741824,
              fileCreatedAt: new Date().toISOString()
            }
          ]
        }
      });

      // Trigger the deletion mutation
      const result = await fixture.client.sdk.ingestSlugsDeleteForSource({
        sourceId
      });

      // The mutation should return our expected success message immediately
      expect(result.data.ingestSlugsDeleteForSource.message).toContain(
        'Ingest slugs deletion request for sourceId'
      );

      // Verify the background event was captured from NSQ on the IngestSlugsTopic
      if (messageConsumerActive) {
        await helpers.sleep(1000); // wait for NSQ delivery
        const deleteEvents = capturedMessages.ingestSlugsDeleteBySource.filter(
          (e) => e.sourceId == sourceId
        );
        expect(deleteEvents.length).toBeGreaterThan(0);
        expect(deleteEvents[0].event).toEqual('ingest_slugs_delete_by_source');
        expect(deleteEvents[0].sourceId).toEqual(sourceId);
      }
    });
  });
});
