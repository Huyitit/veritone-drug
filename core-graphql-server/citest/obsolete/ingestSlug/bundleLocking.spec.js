const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const uuid = require('uuid');
const config = helpers.config;

const env = config.env.toLowerCase();

describe(`citest_ingestSlug: Bundle Locking Mechanism in the ${env} environment`, () => {
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
        name: "ingest-slug-bundle-lock-test-org-${Date.now()}"
        businessUnit: "TestBU"
        types: [agency]
        metadata: { createdBy: "bundleLocking.spec.js" }
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
        name: "bundle-lock-test-engine-${Date.now()}"
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
        name: "bundle-lock-test-app-${Date.now()}"
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

  describe('Bundle Locking Mechanism', () => {
    const CREATE_SLUG_MUTATION = `mutation($input: IngestSlugsCreateInput!) {
      ingestSlugsCreate(input: $input) {
        sourceId
        created {
          sourceId
          fileUri
          status
          bundleKey
        }
        failed {
          fileUri
          errorCode
          errorMessage
        }
      }
    }`;

    const UPDATE_STATUS_MUTATION = `mutation($sourceId: ID!, $fileUris: [String!]!, $input: IngestSlugsStatusUpdateInput!) {
      ingestSlugUpdateStatus(sourceId: $sourceId, fileUris: $fileUris, input: $input) {
        sourceId
        updated {
          fileUri
          status
        }
        failed {
          fileUri
          errorCode
          errorMessage
        }
      }
    }`;

    afterEach(async () => {
      // Clean up any test slugs to avoid interfering with other tests
      // This is best-effort cleanup
    });

    it('should prevent two files in same bundle from being ingesting simultaneously', async () => {
      const bundleKey = `bundle-lock-test-${uuid.v4()}`;
      const file1Uri = `s3://test-bucket/lock-test/${uuid.v4()}/file1.mp4`;
      const file2Uri = `s3://test-bucket/lock-test/${uuid.v4()}/file2.mp4`;

      // Create two files with same bundle
      const createResult = await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [
            { fileUri: file1Uri, bundleKey, mimeType: 'video/mp4', fileSizeBytes: 1000 },
            { fileUri: file2Uri, bundleKey, mimeType: 'video/mp4', fileSizeBytes: 2000 }
          ]
        }
      });

      expect(createResult.ingestSlugsCreate.created.length).toBe(2);
      ingestSlugs.push({ sourceId, fileUri: file1Uri });
      ingestSlugs.push({ sourceId, fileUri: file2Uri });

      // Set first file to ingesting - should succeed
      const updateFile1Result = await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file1Uri],
        input: { status: 'ingesting' }
      });

      expect(updateFile1Result.ingestSlugUpdateStatus.updated.length).toBe(1);
      expect(updateFile1Result.ingestSlugUpdateStatus.updated[0].status).toBe('ingesting');

      // Try to set second file to ingesting - should fail with resource_conflict
      const updateFile2Result = await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file2Uri],
        input: { status: 'ingesting' }
      });

      expect(updateFile2Result.ingestSlugUpdateStatus.updated.length).toBe(0);
      expect(updateFile2Result.ingestSlugUpdateStatus.failed.length).toBe(1);
      expect(updateFile2Result.ingestSlugUpdateStatus.failed[0].fileUri).toBe(file2Uri);
      expect(updateFile2Result.ingestSlugUpdateStatus.failed[0].errorCode).toBe('resource_conflict');
      expect(updateFile2Result.ingestSlugUpdateStatus.failed[0].errorMessage).toContain('bundle_key');
      expect(updateFile2Result.ingestSlugUpdateStatus.failed[0].errorMessage).toContain(bundleKey);
    });

    it('should allow second file to ingest after first completes', async () => {
      const bundleKey = `bundle-sequential-${uuid.v4()}`;
      const file1Uri = `s3://test-bucket/sequential/${uuid.v4()}/file1.mp4`;
      const file2Uri = `s3://test-bucket/sequential/${uuid.v4()}/file2.mp4`;

      // Create two files with same bundle
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [
            { fileUri: file1Uri, bundleKey, mimeType: 'video/mp4' },
            { fileUri: file2Uri, bundleKey, mimeType: 'video/mp4' }
          ]
        }
      });

      ingestSlugs.push({ sourceId, fileUri: file1Uri });
      ingestSlugs.push({ sourceId, fileUri: file2Uri });

      // File 1: pending → ingesting
      await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file1Uri],
        input: { status: 'ingesting' }
      });

      // File 1: ingesting → ingested (release lock)
      const completeFile1 = await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file1Uri],
        input: { status: 'ingested' }
      });

      expect(completeFile1.ingestSlugUpdateStatus.updated.length).toBe(1);
      expect(completeFile1.ingestSlugUpdateStatus.updated[0].status).toBe('ingested');

      // File 2: pending → ingesting (should now succeed)
      const updateFile2 = await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file2Uri],
        input: { status: 'ingesting' }
      });

      expect(updateFile2.ingestSlugUpdateStatus.updated.length).toBe(1);
      expect(updateFile2.ingestSlugUpdateStatus.updated[0].status).toBe('ingesting');
      expect(updateFile2.ingestSlugUpdateStatus.failed.length).toBe(0);
    });

    it('should allow concurrent ingesting for different bundles', async () => {
      const bundle1Key = `bundle-concurrent-1-${uuid.v4()}`;
      const bundle2Key = `bundle-concurrent-2-${uuid.v4()}`;
      const file1Uri = `s3://test-bucket/concurrent/${uuid.v4()}/file1.mp4`;
      const file2Uri = `s3://test-bucket/concurrent/${uuid.v4()}/file2.mp4`;

      // Create two files with different bundles
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [
            { fileUri: file1Uri, bundleKey: bundle1Key, mimeType: 'video/mp4' },
            { fileUri: file2Uri, bundleKey: bundle2Key, mimeType: 'video/mp4' }
          ]
        }
      });

      ingestSlugs.push({ sourceId, fileUri: file1Uri });
      ingestSlugs.push({ sourceId, fileUri: file2Uri });

      // Set first file to ingesting
      const update1 = await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file1Uri],
        input: { status: 'ingesting' }
      });

      expect(update1.ingestSlugUpdateStatus.updated.length).toBe(1);

      // Set second file to ingesting - should succeed (different bundle)
      const update2 = await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file2Uri],
        input: { status: 'ingesting' }
      });

      expect(update2.ingestSlugUpdateStatus.updated.length).toBe(1);
      expect(update2.ingestSlugUpdateStatus.updated[0].status).toBe('ingesting');
      expect(update2.ingestSlugUpdateStatus.failed.length).toBe(0);
    });

    it('should not lock files with null bundleKey', async () => {
      const file1Uri = `s3://test-bucket/null-bundle/${uuid.v4()}/file1.mp4`;
      const file2Uri = `s3://test-bucket/null-bundle/${uuid.v4()}/file2.mp4`;

      // Create two files without bundleKey (null)
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [
            { fileUri: file1Uri, mimeType: 'video/mp4' },
            { fileUri: file2Uri, mimeType: 'video/mp4' }
          ]
        }
      });

      ingestSlugs.push({ sourceId, fileUri: file1Uri });
      ingestSlugs.push({ sourceId, fileUri: file2Uri });

      // Set first file to ingesting
      const update1 = await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file1Uri],
        input: { status: 'ingesting' }
      });

      expect(update1.ingestSlugUpdateStatus.updated.length).toBe(1);

      // Set second file to ingesting - should succeed (null bundleKey)
      const update2 = await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file2Uri],
        input: { status: 'ingesting' }
      });

      expect(update2.ingestSlugUpdateStatus.updated.length).toBe(1);
      expect(update2.ingestSlugUpdateStatus.updated[0].status).toBe('ingesting');
      expect(update2.ingestSlugUpdateStatus.failed.length).toBe(0);
    });

    it('should handle lock release on transition to failed status', async () => {
      const bundleKey = `bundle-failed-${uuid.v4()}`;
      const file1Uri = `s3://test-bucket/failed/${uuid.v4()}/file1.mp4`;
      const file2Uri = `s3://test-bucket/failed/${uuid.v4()}/file2.mp4`;

      // Create two files with same bundle
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [
            { fileUri: file1Uri, bundleKey, mimeType: 'video/mp4' },
            { fileUri: file2Uri, bundleKey, mimeType: 'video/mp4' }
          ]
        }
      });

      ingestSlugs.push({ sourceId, fileUri: file1Uri });
      ingestSlugs.push({ sourceId, fileUri: file2Uri });

      // File 1: pending → ingesting
      await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file1Uri],
        input: { status: 'ingesting' }
      });

      // File 1: ingesting → failed (release lock)
      await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file1Uri],
        input: { status: 'failed', statusMessage: 'Processing error' }
      });

      // File 2: pending → ingesting (should succeed after lock released)
      const update2 = await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file2Uri],
        input: { status: 'ingesting' }
      });

      expect(update2.ingestSlugUpdateStatus.updated.length).toBe(1);
      expect(update2.ingestSlugUpdateStatus.updated[0].status).toBe('ingesting');
    });

    it('should handle batch update with mixed bundle lock scenarios', async () => {
      const lockedBundle = `bundle-locked-${uuid.v4()}`;
      const unlockedBundle = `bundle-unlocked-${uuid.v4()}`;
      
      const file1Uri = `s3://test-bucket/batch-lock/${uuid.v4()}/file1.mp4`; // will be locked
      const file2Uri = `s3://test-bucket/batch-lock/${uuid.v4()}/file2.mp4`; // same bundle as file1
      const file3Uri = `s3://test-bucket/batch-lock/${uuid.v4()}/file3.mp4`; // different bundle

      // Create three files
      await superClient.query(CREATE_SLUG_MUTATION, {
        input: {
          sourceId,
          engineId,
          appId,
          files: [
            { fileUri: file1Uri, bundleKey: lockedBundle, mimeType: 'video/mp4' },
            { fileUri: file2Uri, bundleKey: lockedBundle, mimeType: 'video/mp4' },
            { fileUri: file3Uri, bundleKey: unlockedBundle, mimeType: 'video/mp4' }
          ]
        }
      });

      ingestSlugs.push({ sourceId, fileUri: file1Uri });
      ingestSlugs.push({ sourceId, fileUri: file2Uri });
      ingestSlugs.push({ sourceId, fileUri: file3Uri });

      // Lock first bundle by setting file1 to ingesting
      await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file1Uri],
        input: { status: 'ingesting' }
      });

      // Try to update both file2 and file3 in one batch call
      const batchUpdate = await superClient.query(UPDATE_STATUS_MUTATION, {
        sourceId,
        fileUris: [file2Uri, file3Uri],
        input: { status: 'ingesting' }
      });

      // file2 should fail (locked bundle), file3 should succeed
      expect(batchUpdate.ingestSlugUpdateStatus.updated.length).toBe(1);
      expect(batchUpdate.ingestSlugUpdateStatus.updated[0].fileUri).toBe(file3Uri);
      
      expect(batchUpdate.ingestSlugUpdateStatus.failed.length).toBe(1);
      expect(batchUpdate.ingestSlugUpdateStatus.failed[0].fileUri).toBe(file2Uri);
      expect(batchUpdate.ingestSlugUpdateStatus.failed[0].errorCode).toBe('resource_conflict');
    });
  });
});
