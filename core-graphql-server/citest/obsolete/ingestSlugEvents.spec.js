const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const uuid = require('uuid');
const config = helpers.config;
const env = config.env.toLowerCase();
const _ = require('lodash');
const nsqjs = require('nsqjs');

describe(`ingestSlug event testing in the ${env} environment`, () => {
  let organizationId;
  let sourceId;
  let engineId;
  let appId;
  const ingestSlugs = [];
  let gqlClient;
  let nsqQueue;
  const capturedMessages = {
    ingestSlugsCreated: [],
    ingestSlugsUpdated: [],
    ingestSlugsDeleteBySource: []
  };
  let messageConsumerActive = false;

  beforeAll(async () => {
    // Setup gql client
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    // Initialize NSQ consumer for message verification
    try {
      const nsqdAddress = _.get(config, 'nsqd', 'localhost:4150');

      // Create NSQ reader for IngestionTopic
      const reader = new nsqjs.Reader('IngestionTopic', 'citest-ingest-slug-messages#ephemeral', {
        nsqdTCPAddresses: [nsqdAddress],
        maxInFlight: 100,
        messageTimeout: 60000
      });

      reader.on('message', (msg) => {
        try {
          const body = msg.body.toString();
          const event = JSON.parse(body);

          if (event.event === 'ingest_slug_created') {
            capturedMessages.ingestSlugsCreated.push(event);
          } else if (event.event === 'ingest_slug_updated') {
            capturedMessages.ingestSlugsUpdated.push(event);
          } else if (event.event === 'ingest_slugs_delete_by_source') {
            capturedMessages.ingestSlugsDeleteBySource.push(event);
          }

          msg.finish();
        } catch (parseErr) {
          console.debug('Failed to parse NSQ message:', parseErr.message);
          msg.finish();
        }
      });

      // Wait for reader to be ready or fail
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.debug('NSQ reader connection timed out - nsqd may not be available');
          resolve();
        }, 5000);

        reader.on('error', (err) => {
          console.debug('NSQ reader error:', err.message);
          messageConsumerActive = false;
          clearTimeout(timeout);
          resolve();
        });

        reader.on('ready', () => {
          messageConsumerActive = true;
          clearTimeout(timeout);
          resolve();
        });

        reader.connect();
        nsqQueue = reader;
      });

      reader.on('nsq_error', (err) => {
        console.debug('NSQ protocol error:', err.message);
        messageConsumerActive = false;
      });

      reader.on('ready', () => {
        messageConsumerActive = true;
        console.debug('NSQ message consumer ready for IngestionTopic');
      });

      reader.connect();
      nsqQueue = reader;

      // Create NSQ reader for IngestSlugsTopic (our custom topic for background deletion)
      const deleteReader = new nsqjs.Reader('events', 'citest-delete-slug-messages#ephemeral', {
        nsqdTCPAddresses: [nsqdAddress],
        maxInFlight: 100,
        messageTimeout: 60000
      });

      deleteReader.on('message', (msg) => {
        try {
          const body = msg.body.toString();
          const event = JSON.parse(body);

          if (event.event === 'ingest_slugs_delete_by_source') {
            capturedMessages.ingestSlugsDeleteBySource.push(event);
            console.debug('Captured IngestSlugsDeleteBySource event for sourceId:', event.sourceId);
          }

          msg.finish();
        } catch (parseErr) {
          msg.finish();
        }
      });
      deleteReader.connect();

      // Give reader time to establish connection
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (initErr) {
      console.debug('NSQ message verification disabled:', initErr.message);
    }

    // Create test organization
    const createOrgMutation = `mutation {
      createOrganization(input: {
        name: "ingest-slug-event-test-org-${Date.now()}"
        businessUnit: "TestBU"
        types: [agency]
        metadata: { createdBy: "ingestSlugEvents.spec.js" }
      }) {
        id
        name
      }
    }`;

    try {
      result = await gqlClient.query(createOrgMutation, {});
      expect(result.createOrganization).toBeDefined();
      organizationId = result.createOrganization.id;
    } catch (err) {
      console.error('Failed to create organization:', err.message);
      throw err;
    }

    // Get or create a source
    const getSourceQuery = `query {
      sources(
        permission: viewer
        limit: 1
        offset: 0
        orderBy: {field: id, direction: desc}
      ) {
        records {
          id
        }
        count
      }
    }`;

    result = await gqlClient.query(getSourceQuery, {});
    if (result.sources && result.sources.records && result.sources.records.length > 0) {
      sourceId = result.sources.records[0].id;
    }

    // Create test engine
    const createEngineMutation = `mutation {
      createEngine(input: {
        name: "ingest-slug-event-test-engine-${Date.now()}"
        categoryId: "4be1a1b2-653d-4eaa-ba18-747a265305d8"
        deploymentModel: FullyNetworkIsolated
      }) {
        id
        name
      }
    }`;

    result = await gqlClient.query(createEngineMutation, {});
    expect(result.createEngine).toBeDefined();
    engineId = result.createEngine.id;

    // Create test application
    const createAppMutation = `mutation {
      createApplication(input: {
        name: "ingest-slug-event-test-app-${Date.now()}"
        checkPermissions: false
      }) {
        id
        name
      }
    }`;

    result = await gqlClient.query(createAppMutation, {});
    expect(result.createApplication).toBeDefined();
    appId = result.createApplication.id;
  });

  afterAll(async () => {
    // Close NSQ consumer
    if (nsqQueue) {
      try {
        nsqQueue.close();
      } catch (err) {
        console.debug('Error closing NSQ reader:', err.message);
      }
    }

    const cleanupErrors = [];

    // Delete application
    if (appId) {
      const deleteAppMutation = `mutation($id: ID!) {
        deleteApplication(id: $id) {
          id
          message
        }
      }`;

      try {
        await gqlClient.query(deleteAppMutation, { id: appId });
      } catch (err) {
        console.warn(`Failed to delete test application ${appId}:`, err.message);
        cleanupErrors.push(`Application deletion: ${err.message}`);
      }
    }

    // Delete engine
    if (engineId) {
      const deleteEngineMutation = `mutation($id: ID!) {
        deleteEngine(id: $id) {
          id
          message
        }
      }`;

      try {
        await gqlClient.query(deleteEngineMutation, { id: engineId });
      } catch (err) {
        console.warn(`Failed to delete test engine ${engineId}:`, err.message);
        cleanupErrors.push(`Engine deletion: ${err.message}`);
      }
    }

    // Delete ingest slugs
    if (ingestSlugs.length > 0 && sourceId) {
      const fileUrisToDelete = ingestSlugs.map(slug => slug.fileUri);
      const deleteIngestSlugsMutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
        ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
          deleted {
            sourceId
            fileUri
          }
          failed {
            fileUri
            errorMessage
          }
        }
      }`;

      try {
        await gqlClient.query(deleteIngestSlugsMutation, {
          sourceId: sourceId,
          fileUris: fileUrisToDelete
        });
      } catch (err) {
        console.warn(`Failed to delete ingest slugs:`, err.message);
        cleanupErrors.push(`Ingest slugs deletion: ${err.message}`);
      }
    }

    // Delete organization by setting status to deleted
    if (organizationId) {
      const deleteOrgMutation = `mutation {
        updateOrganization(input: {
          id: "${organizationId}"
          status: "deleted"
        }) {
          id
          status
        }
      }`;

      try {
        await gqlClient.query(deleteOrgMutation, {});
      } catch (err) {
        console.debug(`Organization cleanup note - ${organizationId}: ${err.message}`);
      }
    }

    if (cleanupErrors.length > 0) {
      console.warn(`Cleanup completed with ${cleanupErrors.length} error(s):`, cleanupErrors);
    }
  });

  describe('IngestSlugCreated Event', () => {
    it('should capture IngestSlugCreated event when creating a single ingest slug', async function() {
      if (!messageConsumerActive) {
        console.log('Skipping test: NSQ message consumer is not active');
        return;
      }
      const bundleKey = `bundle-created-${uuid.v4()}`;
      const fileUri = `s3://test-bucket/files/${uuid.v4()}/test-file-created.mp4`;

      const mutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          created { fileUri status }
          failed { fileUri errorMessage }
        }
      }`;

      const variables = {
        input: {
          sourceId: sourceId,
          engineId: engineId,
          appId: appId,
          files: [
            {
              fileUri: fileUri,
              bundleKey: bundleKey,
              mimeType: 'video/mp4',
              fileSizeBytes: 1073741824,
              fileCreatedAt: new Date().toISOString()
            }
          ]
        }
      };

      await gqlClient.query(mutation, variables);
      ingestSlugs.push({ sourceId, fileUri });

      // Verify ingest_slug_created event was captured from NSQ
      await new Promise(resolve => setTimeout(resolve, 500));
      const createEvents = capturedMessages.ingestSlugsCreated.filter(
        e => e.fileUri === fileUri
      );
      expect(createEvents.length).toEqual(1);
      expect(createEvents[0].event).toEqual('ingest_slug_created');
      expect(createEvents[0].fileUri).toEqual(fileUri);
    });

    it('should capture IngestSlugCreated event for each file in batch creation', async function() {
      if (!messageConsumerActive) {
        console.log('Skipping test: NSQ message consumer is not active');
        return;
      }
      const bundleKey = `bundle-batch-created-${uuid.v4()}`;
      const files = [];
      const expectedFileUris = [];

      for (let i = 0; i < 3; i++) {
        const fileUri = `s3://test-bucket/batch-created/${uuid.v4()}/file-${i}.mp4`;
        expectedFileUris.push(fileUri);
        files.push({
          fileUri: fileUri,
          bundleKey: bundleKey,
          mimeType: 'video/mp4',
          fileSizeBytes: Math.random() * 2147483648,
          fileCreatedAt: new Date().toISOString()
        });
      }

      const mutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          created { fileUri status }
          failed { fileUri errorMessage }
        }
      }`;

      const result = await gqlClient.query(mutation, {
        input: { sourceId, engineId, appId, files }
      });

      // Store for cleanup
      result.ingestSlugsCreate.created.forEach((created) => {
        ingestSlugs.push({ sourceId, fileUri: created.fileUri });
      });

      // Verify ingest_slug_created events were captured from NSQ (one per file)
      await new Promise(resolve => setTimeout(resolve, 1000));
      const batchCreateEvents = capturedMessages.ingestSlugsCreated.filter(
        e => expectedFileUris.includes(e.fileUri)
      );
      expect(batchCreateEvents.length).toEqual(expectedFileUris.length);
      batchCreateEvents.forEach(event => {
        expect(event.event).toEqual('ingest_slug_created');
      });
    });
  });

  describe('IngestSlugUpdated Event', () => {
    let slugForUpdate;

    beforeAll(async () => {
      if (!messageConsumerActive) {
        return;
      }
      // Create a slug that will be updated
      const fileUri = `s3://test-bucket/files/${uuid.v4()}/test-file-for-update.mp4`;
      const result = await gqlClient.query(
        `mutation($input: IngestSlugsCreateInput!) {
          ingestSlugsCreate(input: $input) {
            created { sourceId fileUri }
          }
        }`,
        {
          input: {
            sourceId, engineId, appId,
            files: [{
              fileUri,
              bundleKey: `bundle-for-update-${uuid.v4()}`,
              mimeType: 'video/mp4',
              fileSizeBytes: 1073741824,
              fileCreatedAt: new Date().toISOString()
            }]
          }
        }
      );
      slugForUpdate = result.ingestSlugsCreate.created[0];
      ingestSlugs.push(slugForUpdate);
    });

    it('should capture IngestSlugUpdated event when updating ingest slug status', async function() {
      if (!messageConsumerActive) {
        console.log('Skipping test: NSQ message consumer is not active');
        return;
      }
      const newStatus = 'ingesting';
      const statusMessage = 'File is being ingested';

      await gqlClient.query(
        `mutation($sourceId: ID!, $fileUri: String!, $input: IngestSlugUpdateInput!) {
          ingestSlugUpdate(sourceId: $sourceId, fileUri: $fileUri, input: $input) {
            fileUri status statusMessage
          }
        }`,
        {
          sourceId: slugForUpdate.sourceId,
          fileUri: slugForUpdate.fileUri,
          input: { status: newStatus, statusMessage }
        }
      );

      // Verify ingest_slug_updated event was captured from NSQ
      await new Promise(resolve => setTimeout(resolve, 500));
      const updateEvents = capturedMessages.ingestSlugsUpdated.filter(
        e => e.fileUri === slugForUpdate.fileUri
      );
      expect(updateEvents.length).toBeGreaterThanOrEqual(1);
      expect(updateEvents[0].event).toEqual('ingest_slug_updated');
      expect(updateEvents[0].fileUri).toEqual(slugForUpdate.fileUri);
    });

    it('should capture IngestSlugUpdated event when updating multiple ingest slug statuses', async function() {
      if (!messageConsumerActive) {
        console.log('Skipping test: NSQ message consumer is not active');
        return;
      }
      const fileUrisToUpdate = [];
      const createFiles = [];

      for (let i = 0; i < 2; i++) {
        const fileUri = `s3://test-bucket/batch-update/${uuid.v4()}/file-${i}.mp4`;
        fileUrisToUpdate.push(fileUri);
        createFiles.push({
          fileUri,
          bundleKey: `bundle-batch-update-${uuid.v4()}`,
          mimeType: 'video/mp4',
          fileSizeBytes: 1073741824,
          fileCreatedAt: new Date().toISOString()
        });
      }

      const createResult = await gqlClient.query(
        `mutation($input: IngestSlugsCreateInput!) {
          ingestSlugsCreate(input: $input) { created { fileUri } }
        }`,
        { input: { sourceId, engineId, appId, files: createFiles } }
      );

      createResult.ingestSlugsCreate.created.forEach(created => {
        ingestSlugs.push({ sourceId, fileUri: created.fileUri });
      });

      const newStatus = 'uploaded';
      await gqlClient.query(
        `mutation($sourceId: ID!, $fileUris: [String!]!, $input: IngestSlugsStatusUpdateInput!) {
          ingestSlugUpdateStatus(sourceId: $sourceId, fileUris: $fileUris, input: $input) {
            updated { fileUri status }
          }
        }`,
        {
          sourceId,
          fileUris: fileUrisToUpdate,
          input: { status: newStatus, statusMessage: 'Processing complete' }
        }
      );

      // Verify ingest_slug_updated events were captured from NSQ (one per file)
      await new Promise(resolve => setTimeout(resolve, 1000));
      const batchUpdateEvents = capturedMessages.ingestSlugsUpdated.filter(
        e => fileUrisToUpdate.includes(e.fileUri)
      );
      expect(batchUpdateEvents.length).toEqual(fileUrisToUpdate.length);
      batchUpdateEvents.forEach(event => {
        expect(event.event).toEqual('ingest_slug_updated');
      });
    });

    it('should capture IngestSlugUpdated for multiple status transitions', async function() {
      if (!messageConsumerActive) {
        console.log('Skipping test: NSQ message consumer is not active');
        return;
      }
      const fileUri = `s3://test-bucket/files/${uuid.v4()}/test-file-transition.mp4`;

      const result = await gqlClient.query(
        `mutation($input: IngestSlugsCreateInput!) {
          ingestSlugsCreate(input: $input) { created { sourceId fileUri } }
        }`,
        {
          input: {
            sourceId, engineId, appId,
            files: [{
              fileUri,
              bundleKey: `bundle-transition-${uuid.v4()}`,
              mimeType: 'video/mp4',
              fileSizeBytes: 1073741824,
              fileCreatedAt: new Date().toISOString()
            }]
          }
        }
      );

      const createdSlug = result.ingestSlugsCreate.created[0];
      ingestSlugs.push(createdSlug);
      const initialEventCount = capturedMessages.ingestSlugsUpdated.length;

      // Perform multiple status transitions
      const statuses = ['ingesting', 'uploaded', 'ingested'];
      for (const status of statuses) {
        await gqlClient.query(
          `mutation($sourceId: ID!, $fileUri: String!, $input: IngestSlugUpdateInput!) {
            ingestSlugUpdate(sourceId: $sourceId, fileUri: $fileUri, input: $input) { status }
          }`,
          {
            sourceId: createdSlug.sourceId,
            fileUri: createdSlug.fileUri,
            input: { status, statusMessage: `Transitioned to ${status}` }
          }
        );
      }

      // Verify multiple ingest_slug_updated events were captured
      await new Promise(resolve => setTimeout(resolve, 1000));
      const transitionEvents = capturedMessages.ingestSlugsUpdated.filter(
        e => e.fileUri === createdSlug.fileUri
      );
      expect(transitionEvents.length).toEqual(statuses.length);
      transitionEvents.forEach(event => {
        expect(event.event).toEqual('ingest_slug_updated');
      });
    });
  });

  describe('IngestSlugsDeleteBySource Event', () => {
    it('should capture IngestSlugsDeleteBySource event when deleting ingest slugs by source', async () => {
      // First create a slug we can delete
      const fileUri = `s3://test-bucket/files/${uuid.v4()}/delete-by-source.mp4`;

      const createMutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          created { sourceId fileUri }
        }
      }`;

      await gqlClient.query(createMutation, {
        input: {
          sourceId, engineId, appId,
          files: [{
            fileUri,
            bundleKey: `bundle-delete-${uuid.v4()}`,
            mimeType: 'video/mp4',
            fileSizeBytes: 1073741824,
            fileCreatedAt: new Date().toISOString(),
          }]
        }
      });

      const deleteMutation = `mutation($sourceId: ID!) {
        ingestSlugsDeleteForSource(sourceId: $sourceId) { message }
      }`;

      // Trigger the deletion mutation
      const result = await gqlClient.query(deleteMutation, { sourceId });

      // The mutation should return our expected success message immediately
      expect(result.ingestSlugsDeleteForSource.message).toContain('Ingest slugs deletion request for sourceId');

      // Verify the background event was captured from NSQ on the IngestSlugsTopic
      if (messageConsumerActive) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // wait for NSQ delivery
        const deleteEvents = capturedMessages.ingestSlugsDeleteBySource.filter(
          e => e.sourceId == sourceId
        );
        expect(deleteEvents.length).toBeGreaterThan(0);
        expect(deleteEvents[0].event).toEqual('ingest_slugs_delete_by_source');
        expect(deleteEvents[0].sourceId).toEqual(sourceId);
      }
    });
  });
});

