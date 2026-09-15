const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const uuid = require('uuid');
const config = helpers.config;

const env = config.env.toLowerCase();

describe(`citest_ingestSlug: Complete Status Lifecycle in the ${env} environment`, () => {
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
        name: "ingest-slug-lifecycle-test-org-${Date.now()}"
        businessUnit: "TestBU"
        types: [agency]
        metadata: { createdBy: "statusLifecycle.spec.js" }
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
        name: "lifecycle-test-engine-${Date.now()}"
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
        name: "lifecycle-test-app-${Date.now()}"
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

  describe('Complete Status Lifecycle', () => {
    const CREATE_SLUG_MUTATION = `mutation($input: IngestSlugsCreateInput!) {
      ingestSlugsCreate(input: $input) {
        created { sourceId fileUri status }
      }
    }`;

    const UPDATE_SLUG_MUTATION = `mutation($sourceId: ID!, $fileUri: String!, $input: IngestSlugUpdateInput!) {
      ingestSlugUpdate(sourceId: $sourceId, fileUri: $fileUri, input: $input) {
        sourceId
        fileUri
        status
        statusMessage
      }
    }`;

    const GET_SLUG_QUERY = `query($sourceId: ID!, $fileUri: String!) {
      ingestSlug(sourceId: $sourceId, fileUri: $fileUri) {
        sourceId
        fileUri
        status
        statusMessage
      }
    }`;

    it('should create slug with ineligible status', async () => {
      const fileUri = `s3://test-bucket/ineligible/${uuid.v4()}/file.unsupported`;

      const result = await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [
            {
              fileUri,
              mimeType: 'application/octet-stream',
              status: 'ineligible'
            }
          ]
        }
      });

      expect(result.ingestSlugsCreate.created.length).toBe(1);
      expect(result.ingestSlugsCreate.created[0].status).toBe('ineligible');

      ingestSlugs.push({ sourceId, fileUri });

      // Verify it was created with ineligible status
      const getResult = await superClient.query(GET_SLUG_QUERY, {
        sourceId,
        fileUri
      });

      expect(getResult.ingestSlug.status).toBe('ineligible');
    });

    it('should transition through complete ingesting workflow (happy path)', async () => {
      const fileUri = `s3://test-bucket/workflow/${uuid.v4()}/file.mp4`;

      // Create with pending status
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [{ fileUri, mimeType: 'video/mp4' }]
        }
      });

      ingestSlugs.push({ sourceId, fileUri });

      // Verify initial pending status
      let slug = await superClient.query(GET_SLUG_QUERY, { sourceId, fileUri });
      expect(slug.ingestSlug.status).toBe('pending');

      // Transition: pending → ingesting
      await superClient.query(UPDATE_SLUG_MUTATION, {
        sourceId,
        fileUri,
        input: {
          status: 'ingesting',
          statusMessage: 'Processing started'
        }
      });

      slug = await superClient.query(GET_SLUG_QUERY, { sourceId, fileUri });
      expect(slug.ingestSlug.status).toBe('ingesting');
      expect(slug.ingestSlug.statusMessage).toBe('Processing started');

      // Transition: ingesting → ingested
      await superClient.query(UPDATE_SLUG_MUTATION, {
        sourceId,
        fileUri,
        input: {
          status: 'ingested',
          statusMessage: 'Processing completed successfully'
        }
      });

      slug = await superClient.query(GET_SLUG_QUERY, { sourceId, fileUri });
      expect(slug.ingestSlug.status).toBe('ingested');
      expect(slug.ingestSlug.statusMessage).toBe('Processing completed successfully');
    });

    it('should transition through ingesting workflow (error path)', async () => {
      const fileUri = `s3://test-bucket/error-path/${uuid.v4()}/file.mp4`;

      // Create with pending status
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [{ fileUri, mimeType: 'video/mp4' }]
        }
      });

      ingestSlugs.push({ sourceId, fileUri });

      // Transition: pending → ingesting
      await superClient.query(UPDATE_SLUG_MUTATION, {
        sourceId,
        fileUri,
        input: {
          status: 'ingesting',
          statusMessage: 'Processing started'
        }
      });

      // Transition: ingesting → failed
      await superClient.query(UPDATE_SLUG_MUTATION, {
        sourceId,
        fileUri,
        input: {
          status: 'failed',
          statusMessage: 'Processing error: file corrupted'
        }
      });

      const slug = await superClient.query(GET_SLUG_QUERY, { sourceId, fileUri });
      expect(slug.ingestSlug.status).toBe('failed');
      expect(slug.ingestSlug.statusMessage).toContain('file corrupted');
    });

    it('should handle deferred status for retry scenarios', async () => {
      const fileUri = `s3://test-bucket/deferred/${uuid.v4()}/file.mp4`;

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

      // Transition to deferred (e.g., rate limited, temporary failure)
      await superClient.query(UPDATE_SLUG_MUTATION, {
        sourceId,
        fileUri,
        input: {
          status: 'deferred',
          statusMessage: 'Rate limited - will retry in 5 minutes'
        }
      });

      const slug = await superClient.query(GET_SLUG_QUERY, { sourceId, fileUri });
      expect(slug.ingestSlug.status).toBe('deferred');
      expect(slug.ingestSlug.statusMessage).toContain('retry');

      // Later, retry: deferred → pending
      await superClient.query(UPDATE_SLUG_MUTATION, {
        sourceId,
        fileUri,
        input: {
          status: 'pending',
          statusMessage: 'Retry scheduled'
        }
      });

      const retriedSlug = await superClient.query(GET_SLUG_QUERY, { sourceId, fileUri });
      expect(retriedSlug.ingestSlug.status).toBe('pending');
    });

    it('should handle absent status for missing files', async () => {
      const fileUri = `s3://test-bucket/absent/${uuid.v4()}/missing-file.mp4`;

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

      // Mark as absent (file was deleted from S3)
      await superClient.query(UPDATE_SLUG_MUTATION, {
        sourceId,
        fileUri,
        input: {
          status: 'absent',
          statusMessage: 'File not found in S3 bucket'
        }
      });

      const slug = await superClient.query(GET_SLUG_QUERY, { sourceId, fileUri });
      expect(slug.ingestSlug.status).toBe('absent');
      expect(slug.ingestSlug.statusMessage).toContain('not found');
    });

    it('should handle uploaded status workflow', async () => {
      const fileUri = `s3://test-bucket/uploaded/${uuid.v4()}/file.mp4`;

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

      // Transition: pending → ingesting → uploaded (file uploaded, ready for processing)
      await superClient.query(UPDATE_SLUG_MUTATION, {
        sourceId,
        fileUri,
        input: { status: 'ingesting' }
      });

      await superClient.query(UPDATE_SLUG_MUTATION, {
        sourceId,
        fileUri,
        input: {
          status: 'uploaded',
          statusMessage: 'File uploaded to processing location'
        }
      });

      const slug = await superClient.query(GET_SLUG_QUERY, { sourceId, fileUri });
      expect(slug.ingestSlug.status).toBe('uploaded');

      // uploaded → ingested (after processing completes)
      await superClient.query(UPDATE_SLUG_MUTATION, {
        sourceId,
        fileUri,
        input: {
          status: 'ingested',
          statusMessage: 'Processing complete'
        }
      });

      const finalSlug = await superClient.query(GET_SLUG_QUERY, { sourceId, fileUri });
      expect(finalSlug.ingestSlug.status).toBe('ingested');
    });

    it('should support all 8 status enum values', async () => {
      const statuses = [
        'ineligible',
        'pending',
        'ingesting',
        'ingested',
        'uploaded',
        'deferred',
        'absent',
        'failed'
      ];

      for (const status of statuses) {
        const fileUri = `s3://test-bucket/status-test/${uuid.v4()}/${status}.mp4`;

        // Create slug with the specific status
        const result = await superClient.query(CREATE_SLUG_MUTATION, {
          input: {
            sourceId,
            engineId,
            appId,
            files: [
              {
                fileUri,
                mimeType: 'video/mp4',
                status: status
              }
            ]
          }
        });

        expect(result.ingestSlugsCreate.created.length).toBe(1);
        expect(result.ingestSlugsCreate.created[0].status).toBe(status);

        ingestSlugs.push({ sourceId, fileUri });

        // Verify the status persisted correctly
        const slug = await superClient.query(GET_SLUG_QUERY, {
          sourceId,
          fileUri
        });

        expect(slug.ingestSlug.status).toBe(status);
      }
    });

    it('should track status transitions with statusMessage', async () => {
      const fileUri = `s3://test-bucket/transition-tracking/${uuid.v4()}/file.mp4`;

      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [{ fileUri, mimeType: 'video/mp4' }]
        }
      });

      ingestSlugs.push({ sourceId, fileUri });

      const transitions = [
        { status: 'ingesting', message: 'Step 1: Starting ingestion' },
        { status: 'uploaded', message: 'Step 2: File uploaded to processing' },
        { status: 'ingested', message: 'Step 3: Processing complete' }
      ];

      for (const transition of transitions) {
        await superClient.query(UPDATE_SLUG_MUTATION, {
          sourceId,
          fileUri,
          input: {
            status: transition.status,
            statusMessage: transition.message
          }
        });

        const slug = await superClient.query(GET_SLUG_QUERY, {
          sourceId,
          fileUri
        });

        expect(slug.ingestSlug.status).toBe(transition.status);
        expect(slug.ingestSlug.statusMessage).toBe(transition.message);
      }
    });
  });
});
