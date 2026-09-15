const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const uuid = require('uuid');
const config = helpers.config;

const env = config.env.toLowerCase();

describe(`citest_ingestSlug: Conditional Updates with Status Filter in the ${env} environment`, () => {
  let superClient;
  let sourceId;
  let engineId;
  let appId;
  const ingestSlugs = [];

  beforeAll(async () => {
    const initialClient = new GraphqlClient(env);
    let result = await initialClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    superClient = initialClient;

    const createOrgMutation = `mutation {
      createOrganization(input: {
        name: "ingest-slug-status-filter-test-org-${Date.now()}"
        businessUnit: "TestBU"
        types: [agency]
        metadata: { createdBy: "conditionalUpdates.spec.js" }
        applications: [{
          applicationId: "8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5"
          applicationKey: "cms"
        }]
      }) {
        id
        name
      }
    }`;

    result = await superClient.connect();

    try {
      result = await superClient.query(createOrgMutation, {});
      expect(result.createOrganization).toBeDefined();
    } catch (err) {
      console.error('Failed to create organization:', err.message);
      throw err;
    }

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

    result = await superClient.query(getSourceQuery, {});
    if (
      result.sources &&
      result.sources.records &&
      result.sources.records.length > 0
    ) {
      sourceId = result.sources.records[0].id;
    } else {
      throw new Error('No source available for testing');
    }

    const createEngineMutation = `mutation {
      createEngine(input: {
        name: "status-filter-test-engine-${Date.now()}"
        categoryId: "4be1a1b2-653d-4eaa-ba18-747a265305d8"
        deploymentModel: FullyNetworkIsolated
      }) {
        id
        name
      }
    }`;

    result = await superClient.query(createEngineMutation, {});
    expect(result.createEngine).toBeDefined();
    engineId = result.createEngine.id;

    const createAppMutation = `mutation {
      createApplication(input: {
        name: "status-filter-test-app-${Date.now()}"
        checkPermissions: false
      }) {
        id
        name
      }
    }`;

    result = await superClient.query(createAppMutation, {});
    expect(result.createApplication).toBeDefined();
    appId = result.createApplication.id;
  });

  afterAll(async () => {
    const cleanupErrors = [];

    if (appId) {
      const deleteAppMutation = `mutation($id: ID!) {
        updateApplication(input: {
          id: $id
          status: deleted
        }) {
          id
          status
        }
      }`;

      try {
        await superClient.query(deleteAppMutation, { id: appId });
      } catch (err) {
        console.warn(
          `Failed to delete test application ${appId}:`,
          err.message
        );
        cleanupErrors.push(`Application deletion: ${err.message}`);
      }
    }

    if (engineId) {
      const deleteEngineQuery = `mutation($id: ID!) {
          deleteEngine(id: $id) {
            id
            message
          }
        }`;

      try {
        await superClient.query(deleteEngineQuery, { id: engineId });
      } catch (err) {
        console.warn(`Failed to delete test engine ${engineId}:`, err.message);
        cleanupErrors.push(`Engine deletion: ${err.message}`);
      }
    }

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

      const variables = {
        sourceId: sourceId,
        fileUris: fileUrisToDelete
      };

      try {
        await superClient.query(deleteIngestSlugsMutation, variables);
      } catch (err) {
        console.warn(`Failed to delete ingest slugs:`, err.message);
        cleanupErrors.push(`Ingest slugs deletion: ${err.message}`);
      }
    }

    if (cleanupErrors.length > 0) {
      console.warn(
        `Cleanup completed with ${cleanupErrors.length} error(s):`,
        cleanupErrors
      );
    }
  });

  describe('Conditional Updates with Status Filter', () => {
    const CREATE_SLUG_MUTATION = `mutation($input: IngestSlugsCreateInput!) {
      ingestSlugsCreate(input: $input) {
        created { sourceId fileUri status }
      }
    }`;

    const UPDATE_SLUG_WITH_FILTER = `mutation($sourceId: ID!, $fileUri: String!, $input: IngestSlugUpdateInput!) {
      ingestSlugUpdate(sourceId: $sourceId, fileUri: $fileUri, input: $input) {
        sourceId
        fileUri
        status
        statusMessage
      }
    }`;

    it('should update only if current status matches filter', async () => {
      const fileUri = `s3://test-bucket/filter-test/${uuid.v4()}/file.mp4`;

      // Create slug with status='pending'
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [{ fileUri, mimeType: 'video/mp4' }]
        }
      });

      ingestSlugs.push({ sourceId, fileUri });

      // Update with filter matching current status - should succeed
      const result = await superClient.query(UPDATE_SLUG_WITH_FILTER, {
        sourceId,
        fileUri,
        input: {
          status: 'ingesting',
          statusMessage: 'Starting processing',
          filter: { status: 'pending' }
        }
      });

      expect(result.ingestSlugUpdate).toBeDefined();
      expect(result.ingestSlugUpdate.status).toBe('ingesting');
      expect(result.ingestSlugUpdate.statusMessage).toBe('Starting processing');
    });

    it('should fail update if status has changed (optimistic lock violation)', async () => {
      const fileUri = `s3://test-bucket/filter-conflict/${uuid.v4()}/file.mp4`;

      // Create slug and immediately update to 'ingested'
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [{ fileUri, mimeType: 'video/mp4' }]
        }
      });

      ingestSlugs.push({ sourceId, fileUri });

      await superClient.query(UPDATE_SLUG_WITH_FILTER, {
        sourceId,
        fileUri,
        input: { status: 'ingested' }
      });

      // Try to update with filter expecting 'pending' - should fail
      try {
        await superClient.query(UPDATE_SLUG_WITH_FILTER, {
          sourceId,
          fileUri,
          input: {
            statusMessage: 'This should not update',
            filter: { status: 'pending' }
          }
        });
        fail('Expected update to fail with status filter mismatch');
      } catch (error) {
        expect(error.message).toBeDefined();
        expect(error.message.toLowerCase()).toContain('not found');
        expect(error.message.toLowerCase()).toContain('status filter');
      }
    });

    it('should include status filter info in error message', async () => {
      const fileUri = `s3://test-bucket/filter-error/${uuid.v4()}/file.mp4`;

      // Create slug
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [{ fileUri, mimeType: 'video/mp4', status: 'ingested' }]
        }
      });

      ingestSlugs.push({ sourceId, fileUri });

      // Try to update with wrong filter
      try {
        await superClient.query(UPDATE_SLUG_WITH_FILTER, {
          sourceId,
          fileUri,
          input: {
            statusMessage: 'Update attempt',
            filter: { status: 'failed' }
          }
        });
        fail('Expected update to fail');
      } catch (error) {
        const errorMsg = error.message.toLowerCase();
        expect(errorMsg).toContain('not found');
        expect(errorMsg).toContain('status filter');
      }
    });

    it('should prevent concurrent modification race conditions', async () => {
      const fileUri = `s3://test-bucket/race-condition/${uuid.v4()}/file.mp4`;

      // Create slug
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [{ fileUri, mimeType: 'video/mp4' }]
        }
      });

      ingestSlugs.push({ sourceId, fileUri });

      // Simulate race condition: two processes trying to transition from pending
      // First process succeeds
      const update1 = await superClient.query(UPDATE_SLUG_WITH_FILTER, {
        sourceId,
        fileUri,
        input: {
          status: 'ingesting',
          statusMessage: 'Process 1',
          filter: { status: 'pending' }
        }
      });

      expect(update1.ingestSlugUpdate.status).toBe('ingesting');

      // Second process should fail (status no longer pending)
      try {
        await superClient.query(UPDATE_SLUG_WITH_FILTER, {
          sourceId,
          fileUri,
          input: {
            status: 'ingesting',
            statusMessage: 'Process 2',
            filter: { status: 'pending' }
          }
        });
        fail('Second update should have failed due to status change');
      } catch (error) {
        expect(error.message.toLowerCase()).toContain('not found');
      }
    });

    it('should allow update without filter (backward compatibility)', async () => {
      const fileUri = `s3://test-bucket/no-filter/${uuid.v4()}/file.mp4`;

      // Create slug
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [{ fileUri, mimeType: 'video/mp4' }]
        }
      });

      ingestSlugs.push({ sourceId, fileUri });

      // Update without filter - should work regardless of current status
      const result = await superClient.query(UPDATE_SLUG_WITH_FILTER, {
        sourceId,
        fileUri,
        input: {
          status: 'ingested',
          statusMessage: 'Updated without filter'
        }
      });

      expect(result.ingestSlugUpdate.status).toBe('ingested');
      expect(result.ingestSlugUpdate.statusMessage).toBe('Updated without filter');
    });
  });
});
