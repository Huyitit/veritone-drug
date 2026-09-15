const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const uuid = require('uuid');
const config = helpers.config;

const env = config.env.toLowerCase();
const _ = require('lodash');
const jwt = require("jsonwebtoken");

describe(`citest_ingestSlug: ingestSlug system testing in the ${env} environment`, () => {
  let superClient;
  let normalClient;
  let testUser;
  let organizationId;
  let sourceId;
  let sourceId2;
  let sourceOwnedBy;
  let engineId;
  let appId;
  let tdoId;
  let assetId;
  const ingestSlugs = [];

  const ADMIN_ROLES = [
    '032218c3-d47e-4287-9d16-7bb867c01266',
    'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
    '3459c3de-493f-443a-8ad0-ddb9f3f6c76d',
    'cb18eb9c-3264-434a-8a8d-e6b2d680f66e'
  ];

  beforeAll(async () => {
    const initialClient = new GraphqlClient(env);
    let result = await initialClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    superClient = initialClient;

    normalClient = new GraphqlClient(env);
    normalClient.testAuth = superClient.userAuth;

    const createOrgMutation = `mutation {
      createOrganization(input: {
        name: "ingest-slug-test-org-${Date.now()}"
        businessUnit: "TestBU"
        types: [agency]
        metadata: { createdBy: "ingestSlug.spec.js" }
        applications: [{
          applicationId: "8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5"
          applicationKey: "cms"
        }]
      }) {
        id
        name
      }
    }`;

    // Re-login immediately before use so the session token is committed to Redis
    // before graphql validates it. The Docker Compose citest stack has a startup
    // race where the initial connect() token may not yet be visible in Redis.
    result = await superClient.connect();

    try {
      result = await superClient.query(createOrgMutation, {});
      expect(result.createOrganization).toBeDefined();
      organizationId = result.createOrganization.id;
    } catch (err) {
      console.error('Failed to create organization:', err.message);
      throw err;
    }

    const username = `ingest-slug-test-${Date.now()}`;
    const password = 'TempPassword123!';

    const createUserMutation = `mutation {
      createUser(input: {
        name: "${username}"
        password: "${password}"
        organizationId: "${organizationId}"
        roleIds: ${JSON.stringify(ADMIN_ROLES)}
        firstName: "IngestSlug"
        lastName: "Test"
      }) {
        id
        name
      }
    }`;

    try {
      result = await superClient.query(createUserMutation, {});
      expect(result.createUser).toBeDefined();
      testUser = {
        id: result.createUser.id,
        username: username,
        password: password
      };
    } catch (err) {
      console.error('Failed to create user:', err.message);
      throw err;
    }

    const getSourceQuery = `query {
      sources(
        permission: viewer
        limit: 2
        offset: 0
        orderBy: {field: id, direction: desc}
      ) {
        records {
          id
          ownedBy
        }
        count
      }
    }`;

    result = await superClient.query(getSourceQuery, {});
    if (
      result.sources &&
      result.sources.records &&
      result.sources.records.length > 1
    ) {
      sourceId = result.sources.records[0].id;
      sourceId2 = result.sources.records[1].id;
      sourceOwnedBy = result.sources.records[0].ownedBy;
    } else {
      throw new Error('No source available for testing');
    }

    const createEngineMutation = `mutation {
      createEngine(input: {
        name: "ingest-slug-test-engine-${Date.now()}"
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
        name: "ingest-slug-test-app-${Date.now()}"
        checkPermissions: false
      }) {
        id
        name
      }
    }`;

    result = await superClient.query(createAppMutation, {});
    expect(result.createApplication).toBeDefined();
    appId = result.createApplication.id;

    const createTDOMutation = `mutation($input: CreateTDOWithAsset) {
      createTDOWithAsset(input: $input) {
        id
        assets {
          records {
            id
          }
        }
      }
    }`;

    const createTDOVariables = {
      input: {
        name: `ingest-slug-test-tdo-${uuid.v4()}`,
        contentType: 'application/json',
        assetType: 'vtn-standard',
        uri: `s3://test-bucket/tdo/${uuid.v4()}/metadata.json`,
        startDateTime: new Date(),
        stopDateTime: new Date()
      }
    };

    result = await superClient.query(createTDOMutation, createTDOVariables);
    expect(result.createTDOWithAsset).toBeDefined();
    tdoId = _.get(result, 'createTDOWithAsset.id');
    assetId = _.get(result, 'createTDOWithAsset.assets.records[0].id');
    expect(tdoId).toBeDefined();
    expect(assetId).toBeDefined();
  });

  afterAll(async () => {
    const cleanupErrors = [];
    if (tdoId) {
      const deleteTDOMutation = `mutation($id: ID!) {
        deleteTDO(id: $id) {
          id
        }
      }`;

      try {
        await superClient.query(deleteTDOMutation, { id: tdoId });
      } catch (err) {
        console.warn(`Failed to delete test TDO ${tdoId}:`, err.message);
        cleanupErrors.push(`TDO deletion: ${err.message}`);
      }
    }

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

    if (organizationId) {
      const deleteOrgMutation = `mutation($id: ID!) {
        updateOrganization(input: {
          id: $id
          status: "deleted"
        }) {
          id
          status
        }
      }`;

      try {
        await superClient.query(deleteOrgMutation, { id: organizationId });
      } catch (err) {
        console.warn(
          `Failed to delete test organization ${organizationId}:`,
          err.message
        );
        cleanupErrors.push(`Organization deletion: ${err.message}`);
      }
    }

    if (cleanupErrors.length > 0) {
      console.warn(
        `Cleanup completed with ${cleanupErrors.length} error(s):`,
        cleanupErrors
      );
    }
  });

  it('#ingestSlugsCreate - should create single ingest slug', async () => {
    expect(sourceId).toBeDefined();
    expect(engineId).toBeDefined();
    expect(appId).toBeDefined();
    const bundleKey = `bundle-${uuid.v4()}`;
    const fileUri = `s3://test-bucket/files/${uuid.v4()}/test-file-001.mp4`;

    const mutation = `mutation($input: IngestSlugsCreateInput!) {
      ingestSlugsCreate(input: $input) {
        sourceId
        created {
          sourceId
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

    let result = await superClient.query(mutation, variables);
    expect(result.ingestSlugsCreate).toBeDefined();
    expect(result.ingestSlugsCreate.sourceId).toEqual(sourceId);
    expect(result.ingestSlugsCreate.created).toBeDefined();
    expect(result.ingestSlugsCreate.created.length).toEqual(1);
    expect(result.ingestSlugsCreate.created[0].fileUri).toEqual(fileUri);
    expect(result.ingestSlugsCreate.created[0].status).toEqual('pending');
    expect(result.ingestSlugsCreate.failed).toEqual([]);

    ingestSlugs.push({
      sourceId: sourceId,
      fileUri: fileUri,
      status: 'pending'
    });
  });

  it('#ingestSlugsCreate - should batch create multiple ingest slugs', async () => {
    const bundleKey = `bundle-batch-${uuid.v4()}`;
    const files = [];
    const expectedFileUris = [];

    for (let i = 0; i < 5; i++) {
      const fileUri = `s3://test-bucket/batch/${uuid.v4()}/file-${i}.mp4`;
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
        sourceId
        created {
          sourceId
          fileUri
          status
          bundleKey
        }
        failed {
          fileUri
          errorMessage
          errorCode
        }
      }
    }`;

    const variables = {
      input: {
        sourceId: sourceId,
        engineId: engineId,
        appId: appId,
        files: files
      }
    };

    let result = await superClient.query(mutation, variables);
    expect(result.ingestSlugsCreate).toBeDefined();
    expect(result.ingestSlugsCreate.created.length).toEqual(5);
    expect(result.ingestSlugsCreate.failed.length).toEqual(0);

    result.ingestSlugsCreate.created.forEach(created => {
      expect(expectedFileUris).toContain(created.fileUri);
      expect(created.status).toEqual('pending');
      ingestSlugs.push({
        sourceId: created.sourceId,
        fileUri: created.fileUri,
        status: created.status
      });
    });
  });

  it('should fail to create ingest slug with assetId but no tdoId', async () => {
    const mutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          sourceId
          created {
            assetId
            sourceId
            fileUri
          }
          failed {
            fileUri
            errorCode
            errorMessage
          }
        }
      }`;

    const fileUri = `s3://test-bucket/test-${Date.now()}.mp4`;

    const variables = {
      input: {
        sourceId,
        files: [
          {
            fileUri,
            assetId: assetId,
            bundleKey: 'bundle-001',
            mimeType: 'video/mp4',
            fileSizeBytes: 2147483648,
            fileCreatedAt: '2024-01-15T10:00:00Z',
            fileModifiedAt: '2024-01-15T10:30:00Z',
            status: 'pending'
          }
        ]
      }
    };

    const result = await superClient.query(mutation, variables);

    expect(result.ingestSlugsCreate.created.length).toBe(0);
    expect(result.ingestSlugsCreate.failed.length).toBe(1);
    expect(result.ingestSlugsCreate.failed[0].fileUri).toBe(fileUri);
    expect(result.ingestSlugsCreate.failed[0].errorMessage).toContain('tdoId');
  });

  it('#ingestSlugsCreate - duplicates should have both sourceId and fileUri', async () => {
    const bundleKey = `bundle-duplicate-test-${uuid.v4()}`;
    const fileUri = `s3://test-bucket/duplicate-test/${uuid.v4()}/test-file.mp4`;

    const createMutation = `mutation($input: IngestSlugsCreateInput!) {
      ingestSlugsCreate(input: $input) {
        sourceId
        created {
          sourceId
          fileUri
          status
        }
      }
    }`;

    const createVariables = {
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

    let result = await superClient.query(createMutation, createVariables);
    expect(result.ingestSlugsCreate.created.length).toEqual(1);

    const duplicateMutation = `mutation($input: IngestSlugsCreateInput!) {
      ingestSlugsCreate(input: $input) {
        sourceId
        created {
          fileUri
        }
        duplicates {
          sourceId
          fileUri
        }
      }
    }`;

    const duplicateVariables = {
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

    result = await superClient.query(duplicateMutation, duplicateVariables);
    expect(result.ingestSlugsCreate).toBeDefined();
    expect(result.ingestSlugsCreate.duplicates).toBeDefined();
    expect(result.ingestSlugsCreate.duplicates.length).toBeGreaterThan(0);

    result.ingestSlugsCreate.duplicates.forEach(duplicate => {
      expect(duplicate.sourceId).toBeDefined();
      expect(duplicate.sourceId).toBeTruthy();
      expect(duplicate.sourceId).toEqual(sourceId);
      expect(duplicate.fileUri).toBeDefined();
      expect(duplicate.fileUri).toBeTruthy();
      expect(duplicate.fileUri).toEqual(fileUri);
    });
  });

  it('#ingestSlugsCreate - should handle validation errors', async () => {
    const mutation = `mutation($input: IngestSlugsCreateInput!) {
      ingestSlugsCreate(input: $input) {
        sourceId
        created {
          fileUri
        }
      }
    }`;

    let variables = {
      input: {
        files: [
          {
            fileUri: 's3://test-bucket/file.mp4',
            bundleKey: 'bundle-001'
          }
        ]
      }
    };

    try {
      await superClient.query(mutation, variables);
      fail('Expected error for missing sourceId');
    } catch (e) {
      expect(e.message).toBeDefined();
      expect(e.message.toLowerCase()).toContain('sourceid');
    }
  });

  it('#ingestSlugsCreate - should handle transaction rollback when recording insert fails', async () => {
    const bundleKey = `bundle-rollback-${uuid.v4()}`;
    const fileUri = `s3://test-bucket/rollback/${uuid.v4()}/test-file.mp4`;

    const mutation = `mutation($input: IngestSlugsCreateInput!) {
      ingestSlugsCreate(input: $input) {
        sourceId
        created {
          sourceId
          fileUri
          status
        }
        failed {
          fileUri
          errorMessage
          errorCode
        }
      }
    }`;

    const invalidTdoId = uuid.v4();

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
            fileCreatedAt: new Date().toISOString(),
            tdoId: invalidTdoId
          }
        ]
      }
    };

    try {
      const result = await superClient.query(mutation, variables);
      expect(result.ingestSlugsCreate).toBeDefined();
      expect(result.ingestSlugsCreate.failed.length).toBeGreaterThan(0);
      expect(result.ingestSlugsCreate.failed[0].fileUri).toEqual(fileUri);
    } catch (e) {
      expect(e.message).toBeDefined();
    }

    const querySlug = `query($sourceId: ID!, $fileUri: String!) {
      ingestSlug(sourceId: $sourceId, fileUri: $fileUri) {
        sourceId
        fileUri
      }
    }`;

    try {
      await superClient.query(querySlug, {
        sourceId: sourceId,
        fileUri: fileUri
      });
      fail(
        'Expected ingestSlug query to throw error since row should not exist'
      );
    } catch (e) {
      expect(e.message).toBeDefined();
    }
  });

  it('#ingestSlug - should retrieve single ingest slug', async () => {
    expect(ingestSlugs.length).toBeGreaterThan(0);

    const testSlug = ingestSlugs[0];
    const query = `query($sourceId: ID!, $fileUri: String!) {
      ingestSlug(sourceId: $sourceId, fileUri: $fileUri) {
        sourceId
        fileUri
        status
        organizationId
        mimeType
        fileSizeBytes
        bundleKey
        createdAt
        updatedAt
      }
    }`;

    const variables = {
      sourceId: testSlug.sourceId,
      fileUri: testSlug.fileUri
    };

    let result = await superClient.query(query, variables);
    expect(result.ingestSlug).toBeDefined();
    expect(result.ingestSlug.sourceId).toEqual(testSlug.sourceId);
    expect(result.ingestSlug.fileUri).toEqual(testSlug.fileUri);
    expect(result.ingestSlug.status).toEqual(testSlug.status);
    expect(result.ingestSlug.createdAt).toBeDefined();
  });

  it('#ingestSlug - should return error for nonexistent slug', async () => {
    const query = `query($sourceId: ID!, $fileUri: String!) {
      ingestSlug(sourceId: $sourceId, fileUri: $fileUri) {
        sourceId
        fileUri
      }
    }`;

    const variables = {
      sourceId: sourceId,
      fileUri: `s3://test-bucket/nonexistent-${uuid.v4()}.mp4`
    };

    try {
      await superClient.query(query, variables);
      fail('Expected error for nonexistent slug');
    } catch (e) {
      expect(e.message).toBeDefined();
      expect(e.message.toLowerCase()).toContain('not found');
    }
  });

  it('#ingestSlugs - should query ingest slugs with default pagination', async () => {
    expect(ingestSlugs.length).toBeGreaterThan(0);

    const query = `query {
      ingestSlugs(offset: 0, limit: 10) {
        records {
          sourceId
          fileUri
          status
          organizationId
        }
        offset
        limit
        count
      }
    }`;

    let result = await superClient.query(query, {});
    expect(result.ingestSlugs).toBeDefined();
    expect(result.ingestSlugs.records).toBeDefined();
    expect(result.ingestSlugs.offset).toEqual(0);
    expect(result.ingestSlugs.limit).toEqual(10);
    expect(result.ingestSlugs.count).toBeDefined();
    expect(result.ingestSlugs.count >= ingestSlugs.length).toBe(true);
  });

  describe('Filter Testing - ingestSlugs', () => {
    describe('Source filtering', () => {
      it('should filter by sourceId array', async () => {
        expect(ingestSlugs.length).toBeGreaterThan(0);

        const query = `query($filter: IngestSlugFilter) {
      ingestSlugs(filter: $filter, offset: 0, limit: 100) {
        records {
          sourceId
          fileUri
          status
        }
        count
      }
    }`;

        const variables = {
          filter: {
            sourceId: [sourceId]
          }
        };

        let result = await superClient.query(query, variables);
        expect(result.ingestSlugs).toBeDefined();
        expect(result.ingestSlugs.records).toBeDefined();
        expect(result.ingestSlugs.records.length > 0).toBe(true);

        result.ingestSlugs.records.forEach(slug => {
          expect(slug.sourceId).toEqual(sourceId);
        });
      });

      it('should filter by multiple sourceIds', async () => {
        expect(ingestSlugs.length).toBeGreaterThan(0);

        const query = `query($filter: IngestSlugFilter) {
    ingestSlugs(filter: $filter, offset: 0, limit: 100) {
      records {
        sourceId
        fileUri
        status
      }
      count
    }
  }`;

        const variables = {
          filter: {
            sourceId: [sourceId, sourceId2]
          }
        };

        const result = await superClient.query(query, variables);

        expect(result.ingestSlugs).toBeDefined();
        expect(result.ingestSlugs.records.length).toBeGreaterThan(0);

        result.ingestSlugs.records.forEach(slug => {
          expect([sourceId, sourceId2]).toContain(slug.sourceId);
        });
      });

      it('should return empty result when sourceId does not exist', async () => {
        const query = `query($filter: IngestSlugFilter) {
    ingestSlugs(filter: $filter, offset: 0, limit: 100) {
      records {
        sourceId
        fileUri
        status
      }
      count
    }
  }`;

        const variables = {
          filter: {
            sourceId: ['00000']
          }
        };

        const result = await superClient.query(query, variables);
        expect(result.ingestSlugs).toBeDefined();

        expect(result.ingestSlugs.records).toBeDefined();
        expect(result.ingestSlugs.records.length).toEqual(0);
      });
    });

    describe('Status filtering', () => {
      it('should filter by single status', async () => {
        expect(ingestSlugs.length).toBeGreaterThan(0);

        const query = `query($filter: IngestSlugFilter) {
    ingestSlugs(filter: $filter, offset: 0, limit: 100) {
      records {
        sourceId
        fileUri
        status
      }
      count
    }
  }`;

        const variables = {
          filter: {
            status: ['pending']
          }
        };

        const result = await superClient.query(query, variables);

        expect(result.ingestSlugs).toBeDefined();
        expect(result.ingestSlugs.records.length).toBeGreaterThan(0);

        result.ingestSlugs.records.forEach(slug => {
          expect(slug.status).toEqual('pending');
        });
      });

      it('should filter by multiple statuses', async () => {
        expect(ingestSlugs.length).toBeGreaterThan(0);

        const query = `query($filter: IngestSlugFilter) {
    ingestSlugs(filter: $filter, offset: 0, limit: 100) {
      records {
        sourceId
        fileUri
        status
      }
      count
    }
  }`;

        const variables = {
          filter: {
            status: ['pending', 'failed']
          }
        };

        const result = await superClient.query(query, variables);

        expect(result.ingestSlugs).toBeDefined();
        expect(result.ingestSlugs.records.length).toBeGreaterThan(0);

        result.ingestSlugs.records.forEach(slug => {
          expect(['pending', 'failed']).toContain(slug.status);
        });
      });

      it('should return error for unknown status', async () => {
        const query = `query($filter: IngestSlugFilter) {
    ingestSlugs(filter: $filter, offset: 0, limit: 100) {
      records {
        sourceId
        fileUri
        status
      }
      count
    }
  }`;

        const variables = {
          filter: {
            status: ['non-existent-status']
          }
        };

        try {
          await superClient.query(query, variables);
        } catch (error) {
          const errorMessage = error.message;
          expect(errorMessage).toMatch(/invalid value/i);
        }
      });
    });

    describe('FileUri filtering', () => {
      it('should filter by fileUriExact', async () => {
        expect(ingestSlugs.length).toBeGreaterThan(0);

        const fileUri = ingestSlugs[0].fileUri;

        const query = `query($filter: IngestSlugFilter) {
          ingestSlugs(filter: $filter, offset: 0, limit: 100) {
            records {
              sourceId
              fileUri
              status
            }
            count
          }
        }`;

        const variables = {
          filter: {
            fileUriExact: [fileUri]
          }
        };

        const result = await superClient.query(query, variables);

        expect(result.ingestSlugs).toBeDefined();
        expect(result.ingestSlugs.records.length).toBeGreaterThan(0);

        result.ingestSlugs.records.forEach(slug => {
          expect(slug.fileUri).toEqual(fileUri);
        });
      });

      it('should filter by multiple fileUriExact', async () => {
        expect(ingestSlugs.length).toBeGreaterThan(1);

        const fileUri1 = ingestSlugs[0].fileUri;
        const fileUri2 = ingestSlugs[1].fileUri;

        const query = `query($filter: IngestSlugFilter) {
          ingestSlugs(filter: $filter, offset: 0, limit: 100) {
            records {
              sourceId
              fileUri
              status
            }
            count
          }
        }`;

        const variables = {
          filter: {
            fileUriExact: [fileUri1, fileUri2]
          }
        };

        const result = await superClient.query(query, variables);

        expect(result.ingestSlugs).toBeDefined();
        expect(result.ingestSlugs.records.length).toBeGreaterThan(0);

        result.ingestSlugs.records.forEach(slug => {
          expect([fileUri1, fileUri2]).toContain(slug.fileUri);
        });
      });

      it('should filter by fileUriPrefix', async () => {
        expect(ingestSlugs.length).toBeGreaterThan(0);

        const fileUri = ingestSlugs[0].fileUri;
        const prefix = fileUri.substring(0, fileUri.lastIndexOf('/'));

        const query = `query($filter: IngestSlugFilter) {
          ingestSlugs(filter: $filter, offset: 0, limit: 100) {
            records {
              sourceId
              fileUri
              status
            }
            count
          }
        }`;

        const variables = {
          filter: {
            fileUriPrefix: [prefix]
          }
        };

        const result = await superClient.query(query, variables);

        expect(result.ingestSlugs).toBeDefined();
        expect(result.ingestSlugs.records.length).toBeGreaterThan(0);

        result.ingestSlugs.records.forEach(slug => {
          expect(slug.fileUri.startsWith(prefix)).toBe(true);
        });
      });

      it('should return empty result for non-existing fileUriExact', async () => {
        const query = `query($filter: IngestSlugFilter) {
          ingestSlugs(filter: $filter, offset: 0, limit: 100) {
            records {
              sourceId
              fileUri
              status
            }
            count
          }
        }`;

        const variables = {
          filter: {
            fileUriExact: ['s3://bucket/non-existent-file']
          }
        };

        const result = await superClient.query(query, variables);

        expect(result.ingestSlugs).toBeDefined();
        expect(result.ingestSlugs.records).toBeDefined();
        expect(result.ingestSlugs.records.length).toBe(0);
      });
    });

    describe('updatedAt time range filtering', () => {
      it('should filter by updatedFromTime', async () => {
        const initialQuery = `query {
          ingestSlugs(offset: 0, limit: 1) {
            records {
              updatedAt
            }
          }
        }`;

        const initialResult = await superClient.query(initialQuery);

        const updatedFromTime = initialResult.ingestSlugs.records[0].updatedAt;

        const query = `query($filter: IngestSlugFilter) {
          ingestSlugs(filter: $filter, offset: 0, limit: 100) {
            records {
              fileUri
              updatedAt
            }
            count
          }
        }`;

        const variables = {
          filter: {
            updatedFromTime
          }
        };

        const result = await superClient.query(query, variables);

        result.ingestSlugs.records.forEach(slug => {
          expect(new Date(slug.updatedAt).getTime()).toBeGreaterThanOrEqual(
            new Date(updatedFromTime).getTime()
          );
        });
      });

      it('should filter by updatedToTime', async () => {
        const updatedToTime = '2100-01-01T00:00:00Z';

        const query = `query($filter: IngestSlugFilter) {
          ingestSlugs(filter: $filter, offset: 0, limit: 100) {
            records {
              fileUri
              updatedAt
            }
            count
          }
        }`;

        const variables = {
          filter: {
            updatedToTime
          }
        };

        const result = await superClient.query(query, variables);

        expect(result.ingestSlugs).toBeDefined();

        result.ingestSlugs.records.forEach(slug => {
          expect(new Date(slug.updatedAt).getTime()).toBeLessThanOrEqual(
            new Date(updatedToTime).getTime()
          );
        });
      });

      it('should filter by updated time range', async () => {
        const updatedFromTime = '2000-01-01T00:00:00Z';
        const updatedToTime = '2100-01-01T00:00:00Z';

        const query = `query($filter: IngestSlugFilter) {
          ingestSlugs(filter: $filter, offset: 0, limit: 100) {
            records {
              fileUri
              updatedAt
            }
            count
          }
        }`;

        const variables = {
          filter: {
            updatedFromTime,
            updatedToTime
          }
        };

        const result = await superClient.query(query, variables);

        expect(result.ingestSlugs).toBeDefined();

        result.ingestSlugs.records.forEach(slug => {
          const updated = new Date(slug.updatedAt).getTime();

          expect(updated).toBeGreaterThanOrEqual(
            new Date(updatedFromTime).getTime()
          );

          expect(updated).toBeLessThanOrEqual(
            new Date(updatedToTime).getTime()
          );
        });
      });

      it('should filter using updatedFromTimeExclusive', async () => {
        const updatedFromTime = '2000-01-01T00:00:00Z';

        const query = `query($filter: IngestSlugFilter) {
          ingestSlugs(filter: $filter, offset: 0, limit: 100) {
            records {
              fileUri
              updatedAt
            }
            count
          }
        }`;

        const variables = {
          filter: {
            updatedFromTime,
            updatedFromTimeExclusive: true
          }
        };

        const result = await superClient.query(query, variables);

        expect(result.ingestSlugs).toBeDefined();

        result.ingestSlugs.records.forEach(slug => {
          expect(new Date(slug.updatedAt).getTime()).toBeGreaterThan(
            new Date(updatedFromTime).getTime()
          );
        });
      });
    });

    it('should filter by tdoId', async () => {
      expect(ingestSlugs.length).toBeGreaterThan(0);

      const tdoId = ingestSlugs.find(s => s.tdoId)?.tdoId;

      if (!tdoId) return;

      const query = `query($filter: IngestSlugFilter) {
        ingestSlugs(filter: $filter, offset: 0, limit: 100) {
          records {
            fileUri
            tdoId
          }
          count
        }
      }`;

      const variables = {
        filter: {
          tdoId: [tdoId]
        }
      };

      const result = await superClient.query(query, variables);

      expect(result.ingestSlugs).toBeDefined();

      result.ingestSlugs.records.forEach(slug => {
        expect(slug.tdoId).toEqual(tdoId);
      });
    });

    it('should filter by assetId', async () => {
      expect(ingestSlugs.length).toBeGreaterThan(0);

      const assetId = ingestSlugs.find(s => s.assetId)?.assetId;

      if (!assetId) return;

      const query = `query($filter: IngestSlugFilter) {
        ingestSlugs(filter: $filter, offset: 0, limit: 100) {
          records {
            fileUri
            assetId
          }
          count
        }
      }`;

      const variables = {
        filter: {
          assetId: [assetId]
        }
      };

      const result = await superClient.query(query, variables);

      expect(result.ingestSlugs).toBeDefined();

      result.ingestSlugs.records.forEach(slug => {
        expect(slug.assetId).toEqual(assetId);
      });
    });

    it('should filter by mimeType', async () => {
      expect(ingestSlugs.length).toBeGreaterThan(0);

      const slugWithMime = ingestSlugs.find(s => s.mimeType);

      if (!slugWithMime) return;

      const mimeType = slugWithMime.mimeType;

      const query = `query($filter: IngestSlugFilter) {
        ingestSlugs(filter: $filter, offset: 0, limit: 100) {
          records {
            fileUri
            mimeType
          }
          count
        }
      }`;

      const variables = {
        filter: {
          mimeType: [mimeType]
        }
      };

      const result = await superClient.query(query, variables);

      expect(result.ingestSlugs).toBeDefined();
      expect(result.ingestSlugs.records.length).toBeGreaterThan(0);

      result.ingestSlugs.records.forEach(slug => {
        expect(slug.mimeType).toEqual(mimeType);
      });
    });

    it('should filter by bundleKey', async () => {
      const bundleKey = ingestSlugs.find(s => s.bundleKey)?.bundleKey;

      if (!bundleKey) return;

      const query = `query($filter: IngestSlugFilter) {
        ingestSlugs(filter: $filter, offset: 0, limit: 100) {
          records {
            fileUri
            bundleKey
          }
          count
        }
      }`;

      const variables = {
        filter: {
          bundleKey: [bundleKey]
        }
      };

      const result = await superClient.query(query, variables);

      result.ingestSlugs.records.forEach(slug => {
        expect(slug.bundleKey).toEqual(bundleKey);
      });
    });
  });

  it('#ingestSlugUpdate - should update partial fields', async () => {
    expect(ingestSlugs.length).toBeGreaterThanOrEqual(2);

    const testSlug = ingestSlugs[1];
    const mutation = `mutation($sourceId: ID!, $fileUri: String!, $input: IngestSlugUpdateInput!) {
      ingestSlugUpdate(sourceId: $sourceId, fileUri: $fileUri, input: $input) {
        sourceId
        fileUri
        status
        tdoId
      }
    }`;

    const variables = {
      sourceId: testSlug.sourceId,
      fileUri: testSlug.fileUri,
      input: {
        status: 'ingested',
        tdoId: tdoId
      }
    };

    let result = await superClient.query(mutation, variables);
    expect(result.ingestSlugUpdate).toBeDefined();
    expect(result.ingestSlugUpdate.status).toEqual('ingested');
    expect(result.ingestSlugUpdate.tdoId).toEqual(tdoId);
  });

  it('#ingestSlugUpdateStatus - should bulk update slug status', async () => {
    expect(ingestSlugs.length).toBeGreaterThanOrEqual(3);
    const fileUris = ingestSlugs.slice(2, 4).map(s => s.fileUri);
    const mutation = `mutation($sourceId: ID!, $fileUris: [String!]!, $input: IngestSlugsStatusUpdateInput!) {
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

    const variables = {
      sourceId: sourceId,
      fileUris: fileUris,
      input: {
        status: 'uploaded',
        statusMessage: 'Processing batch update'
      }
    };

    let result = await superClient.query(mutation, variables);
    expect(result.ingestSlugUpdateStatus).toBeDefined();
    expect(result.ingestSlugUpdateStatus.sourceId).toEqual(sourceId);
    expect(result.ingestSlugUpdateStatus.updated.length).toEqual(
      fileUris.length
    );
    expect(result.ingestSlugUpdateStatus.failed.length).toEqual(0);

    result.ingestSlugUpdateStatus.updated.forEach(updated => {
      expect(updated.status).toEqual('uploaded');
      expect(fileUris).toContain(updated.fileUri);
    });
  });

  describe('ingestSlugsDelete', () => {
    it('should delete multiple ingest slugs successfully', async () => {
      const fileUris = ingestSlugs.slice(0, 2).map(s => s.fileUri);

      const mutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
        ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
          sourceId
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

      const result = await superClient.query(mutation, {
        sourceId,
        fileUris
      });

      expect(result.ingestSlugsDelete.sourceId).toEqual(sourceId);
      expect(result.ingestSlugsDelete.deleted.length).toBe(fileUris.length);
      expect(result.ingestSlugsDelete.failed.length).toBe(0);
    });

    it('should ignore non-existent slug', async () => {
      const mutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
        ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
          sourceId
          deleted {
            sourceId
            fileUri
          }
          failed {
            fileUri
          }
        }
      }`;

      const fakeFileUri = `s3://fake-bucket/non-existent-${Date.now()}.mp4`;

      const result = await superClient.query(mutation, {
        sourceId,
        fileUris: [fakeFileUri]
      });

      expect(result.ingestSlugsDelete.deleted.length).toBe(0);
      expect(result.ingestSlugsDelete.failed.length).toBe(0);
    });

    it('should return validation error when fileUris is empty', async () => {
      const mutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
        ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
          sourceId
          deleted {
            sourceId
            fileUri
          }
        }
      }`;

      try {
        await superClient.query(mutation, {
          sourceId,
          fileUris: []
        });

        fail('Expected validation error for empty fileUris');
      } catch (e) {
        expect(e.message).toBeDefined();
      }
    });

    it('should not delete slugs with wrong sourceId', async () => {
      const slug = ingestSlugs[2];

      const mutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
        ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
          sourceId
          deleted {
            sourceId
            fileUri
          }
          failed {
            fileUri
          }
        }
      }`;

      const wrongSourceId = sourceId2;

      const result = await superClient.query(mutation, {
        sourceId: wrongSourceId,
        fileUris: [slug.fileUri]
      });

      expect(result.ingestSlugsDelete.deleted.length).toBe(0);
      expect(result.ingestSlugsDelete.failed.length).toBe(0);
    });

    it('deleted count should match expected amount', async () => {
      const fileUris = ingestSlugs.slice(3, 5).map(s => s.fileUri);

      const mutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
        ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
          sourceId
          deleted {
            fileUri
          }
        }
      }`;

      const result = await superClient.query(mutation, {
        sourceId,
        fileUris
      });

      expect(result.ingestSlugsDelete.deleted.length).toBe(fileUris.length);
    });
  });

  it('#ingestSlugsDelete - should delete specific ingest slugs', async () => {
    expect(ingestSlugs.length).toBeGreaterThan(0);

    const slugToDelete = ingestSlugs[ingestSlugs.length - 1];
    const mutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
      ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
        sourceId
        deleted {
          sourceId
          fileUri
        }
        failed {
          errorMessage
          errorCode
          fileUri
        }
      }
    }`;

    const variables = {
      sourceId: slugToDelete.sourceId,
      fileUris: [slugToDelete.fileUri]
    };

    let result = await superClient.query(mutation, variables);
    expect(result.ingestSlugsDelete).toBeDefined();
    expect(result.ingestSlugsDelete.sourceId).toEqual(slugToDelete.sourceId);
    expect(result.ingestSlugsDelete.deleted).toHaveLength(1);
    expect(result.ingestSlugsDelete.deleted[0]).toEqual({
      sourceId: slugToDelete.sourceId,
      fileUri: slugToDelete.fileUri
    });
    expect(result.ingestSlugsDelete.failed.length).toEqual(0);

    const query = `query($sourceId: ID!, $fileUri: String!) {
      ingestSlug(sourceId: $sourceId, fileUri: $fileUri) {
        sourceId
        fileUri
      }
    }`;

    const queryVariables = {
      sourceId: slugToDelete.sourceId,
      fileUri: slugToDelete.fileUri
    };

    try {
      await superClient.query(query, queryVariables);
      fail('Expected error for deleted ingest slug');
    } catch (e) {
      expect(e.message).toBeDefined();
      expect(e.message.toLowerCase()).toContain('not found');
    }
  });

  it('#ingestSlugsDelete - should handle deletion validation errors', async () => {
    const mutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
      ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
        sourceId
        deleted {
          sourceId
          fileUri
        }
      }
    }`;

    let variables = {
      fileUris: ['s3://bucket/file.mp4']
    };

    try {
      await superClient.query(mutation, variables);
      fail('Expected error for missing sourceId');
    } catch (e) {
      expect(e.message).toBeDefined();
      expect(e.message.toLowerCase()).toContain('sourceid');
    }
  });

  describe('Cross-Organization Access Prevention', () => {
    let secondOrgId;
    let secondOrgUserId;
    let secondOrgUserToken;
    let secondSourceId;
    let createdIngestSlug;
    let secondOrgClient;

    beforeAll(async () => {
      const createOrgMutation = `mutation {
        createOrganization(input: {
          name: "ingest-slug-cross-org-test-${Date.now()}"
          businessUnit: "CrossOrgTest"
          types: [agency]
          metadata: { createdBy: "ingestSlug.spec.js" }
          applications: [{
            applicationId: "8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5"
            applicationKey: "cms"
          }]
        }) {
          id
          name
        }
      }`;

      try {
        const result = await superClient.query(createOrgMutation, {});
        expect(result.createOrganization).toBeDefined();
        secondOrgId = result.createOrganization.id;
      } catch (err) {
        console.error('Failed to create second organization:', err.message);
        throw err;
      }

      const secondOrgUsername = `cross-org-user-${Date.now()}`;
      const secondOrgPassword = 'TempPassword123!';

      const createSecondOrgUserMutation = `mutation {
        createUser(input: {
          name: "${secondOrgUsername}"
          password: "${secondOrgPassword}"
          organizationId: "${secondOrgId}"
          roleIds: ${JSON.stringify(ADMIN_ROLES)}
          firstName: "CrossOrg"
          lastName: "User"
        }) {
          id
          name
        }
      }`;

      try {
        const result = await superClient.query(createSecondOrgUserMutation, {});
        expect(result.createUser).toBeDefined();
        secondOrgUserId = result.createUser.id;
      } catch (err) {
        console.error(
          'Failed to create user in second organization:',
          err.message
        );
        throw err;
      }

      const loginMutation = `mutation($input: UserLogin!) {
        userLogin(input: $input) {
          token
        }
      }`;

      try {
        const result = await superClient.query(loginMutation, {
          input: {
            userName: secondOrgUsername,
            password: secondOrgPassword
          }
        });
        expect(result.userLogin).toBeDefined();
        expect(result.userLogin.token).toBeDefined();
        secondOrgUserToken = result.userLogin.token;

        secondOrgClient = new GraphqlClient(env);
        const { requestOptions } = helpers;
        secondOrgClient.userAuth = requestOptions(secondOrgUserToken);
        secondOrgClient.userToken = secondOrgUserToken;

        const createTokenMutation = `mutation($name: String!, $rights: [AuthPermissionType]!) {
          apiTokenCreate(name: $name, rights: $rights) {
            id
          }
        }`;

        const tokenInput = {
          name: `cross-org-test-token-${Date.now()}`,
          rights: [
            'SUPERADMIN',
            'AIWARE_SLUG_CREATE',
            'AIWARE_SLUG_READ',
            'AIWARE_SLUG_UPDATE',
            'AIWARE_SLUG_DELETE',
            'ASSET_URI',
            'AIWARE_JOB_CREATE',
            'JOB_CREATE',
            'AIWARE_JOB_READ',
            'AIWARE_JOB_UPDATE',
            'AIWARE_JOB_DELETE',
            'AIWARE_TASK_READ',
            'AIWARE_TASK_UPDATE',
            'AIWARE_TASK_CREATE',
            'RECORDING_CREATE',
            'RECORDING_READ',
            'RECORDING_UPDATE',
            'RECORDING_DELETE',
            'CMS_ACCESS',
            'DISCOVERY_ACCESS',
            'DEVELOPER_ACCESS',
            'ADMIN_ORG_READ',
            'AIWARE_USER_CREATE',
            'AIWARE_USER_UPDATE',
            'AIWARE_USER_READ',
            'DEVELOPER_ENGINE_CREATE',
            'DEVELOPER_ENGINE_UPDATE',
            'DEVELOPER_ENGINE_READ',
            'DEVELOPER_ENGINE_DELETE',
            'DEVELOPER_BUILD_CREATE',
            'DEVELOPER_BUILD_UPDATE',
            'DEVELOPER_BUILD_READ',
            'DEVELOPER_BUILD_DELETE',
            'ADMIN_USER_CREATE',
            'ADMIN_USER_UPDATE',
            'ADMIN_USER_READ',
            'ADMIN_USER_DELETE'
          ]
        };

        const tokenResult = await secondOrgClient.query(
          createTokenMutation,
          tokenInput
        );
        expect(tokenResult.apiTokenCreate).toBeDefined();
        expect(tokenResult.apiTokenCreate.id).toBeDefined();

        // Create a new gqlClient with this token for second org operations
        secondOrgClient = new GraphqlClient(env);
        secondOrgClient.userAuth = requestOptions(
          tokenResult.apiTokenCreate.id
        );
        secondOrgClient.userToken = tokenResult.apiTokenCreate.id;
      } catch (err) {
        console.error('Failed to login second org user:', err.message);
        throw err;
      }

      const createSourceMutation = `mutation($input: CreateSource!) {
        createSource(input: $input) {
          id
          name
        }
      }`;

      const sourceVariables = {
        input: {
          sourceTypeId: 1,
          name: `cross-org-test-source-${Date.now()}`,
          isPublic: false
        }
      };

      try {
        const result = await secondOrgClient.query(
          createSourceMutation,
          sourceVariables
        );
        if (result.createSource && result.createSource.id) {
          secondSourceId = result.createSource.id;
        }
      } catch (err) {
        console.error(
          'Failed to create source in second organization:',
          err.message
        );
        throw err;
      }

      if (secondSourceId && engineId && appId) {
        const bundleKey = `cross-org-test-${uuid.v4()}`;
        const fileUri = `s3://test-bucket/cross-org/${uuid.v4()}/test-file.mp4`;

        const createMutation = `mutation($input: IngestSlugsCreateInput!) {
          ingestSlugsCreate(input: $input) {
            sourceId
            created {
              sourceId
              fileUri
              status
            }
            failed {
              fileUri
              errorMessage
              errorCode
            }
          }
        }`;

        const variables = {
          input: {
            sourceId: secondSourceId,
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

        try {
          const result = await secondOrgClient.query(createMutation, variables);
          if (
            result.ingestSlugsCreate &&
            result.ingestSlugsCreate.created.length > 0
          ) {
            createdIngestSlug = {
              sourceId: result.ingestSlugsCreate.created[0].sourceId,
              fileUri: result.ingestSlugsCreate.created[0].fileUri
            };
          }
        } catch (err) {
          console.error(
            'Failed to create ingest slug in second organization:',
            err.message
          );
          throw err;
        }
      }
    });

    it('should demonstrate that second org can query ingest slugs', async () => {
      const query = `query($sourceId: ID!, $fileUri: String!) {
        ingestSlug(sourceId: $sourceId, fileUri: $fileUri) {
          sourceId
          fileUri
          status
        }
      }`;

      const variables = {
        sourceId: createdIngestSlug.sourceId,
        fileUri: createdIngestSlug.fileUri
      };

      const result = await secondOrgClient.query(query, variables);
      expect(result.ingestSlug).toBeDefined();
      expect(result.ingestSlug.sourceId).toBe(createdIngestSlug.sourceId);
      expect(result.ingestSlug.fileUri).toBe(createdIngestSlug.fileUri);
    });

    it('should demonstrate that second org can update ingest slugs', async () => {
      const mutation = `mutation($sourceId: ID!, $fileUri: String!, $input: IngestSlugUpdateInput!) {
        ingestSlugUpdate(sourceId: $sourceId, fileUri: $fileUri, input: $input) {
          sourceId
          fileUri
          status
        }
      }`;

      const variables = {
        sourceId: createdIngestSlug.sourceId,
        fileUri: createdIngestSlug.fileUri,
        input: {
          status: 'uploaded'
        }
      };

      const result = await secondOrgClient.query(mutation, variables);
      expect(result.ingestSlugUpdate).toBeDefined();
      expect(result.ingestSlugUpdate.sourceId).toBe(createdIngestSlug.sourceId);
    });

    it('should demonstrate that first org is restricted from querying second org ingest slugs', async () => {
      const query = `query($sourceId: ID!, $fileUri: String!) {
        ingestSlug(sourceId: $sourceId, fileUri: $fileUri) {
          sourceId
          fileUri
          status
        }
      }`;

      const variables = {
        sourceId: createdIngestSlug.sourceId,
        fileUri: createdIngestSlug.fileUri
      };

      try {
        const result = await superClient.query(query, variables);
        fail(
          'Expected error when querying ingest slug from another organization'
        );
      } catch (err) {
        expect(err.message).toMatch(/not found/i);
      }
    });

    afterAll(async () => {
      if (secondOrgId) {
        const deleteOrgMutation = `mutation($id: ID!) {
          updateOrganization(input: {
            id: $id
            status: "deleted"
          }) {
            id
            status
          }
        }`;

        try {
          await superClient.query(deleteOrgMutation, { id: secondOrgId });
        } catch (err) {
          console.warn('Failed to delete second organization:', err.message);
        }
      }
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

      const createEngineMutation = `mutation($input: CreateEngine!) {
        createEngine(input: $input) {
          id
          name
          isPublic
        }
      }`;

      const createEngineVariables = {
        input: {
          name: `engine-jwt-test-${uuid.v4()}`,
          categoryId: '4be1a1b2-653d-4eaa-ba18-747a265305d8',
          deploymentModel: 'FullyNetworkIsolated',
          isPublic: false,
          jwtRights: engineRights
        }
      };

      let result = await superClient.query(
        createEngineMutation,
        createEngineVariables
      );
      expect(result.createEngine).toBeDefined();
      expect(result.createEngine.isPublic).toBe(false);
      const testEngineId = result.createEngine.id;

      const createBuildMutation = `mutation($input: CreateBuild!) {
        createEngineBuild(input: $input) {
          id
          engineId
          status
        }
      }`;

      const createBuildVariables = {
        input: {
          engineId: testEngineId,
          taskRuntime: {
            nodeRed: true
          },
          manifest: {
            runtime: 'NodeRed'
          }
        }
      };

      result = await superClient.query(
        createBuildMutation,
        createBuildVariables
      );
      expect(result.createEngineBuild).toBeDefined();
      const buildId = result.createEngineBuild.id;
      expect(['available', 'approved', 'pending']).toContain(
        result.createEngineBuild.status
      );

      const submitBuildMutation = `mutation($input: UpdateBuild!) {
        updateEngineBuild(input: $input) {
          id
          status
        }
      }`;

      const submitBuildVariables = {
        input: {
          id: buildId,
          engineId: testEngineId,
          action: 'submit'
        }
      };

      result = await superClient.query(
        submitBuildMutation,
        submitBuildVariables
      );
      expect(result.updateEngineBuild).toBeDefined();
      expect(['approved', 'pending']).toContain(
        result.updateEngineBuild.status
      );

      const deployBuildVariables = {
        input: {
          id: buildId,
          engineId: testEngineId,
          action: 'deploy'
        }
      };

      result = await superClient.query(
        submitBuildMutation,
        deployBuildVariables
      );
      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('deployed');

      const createJobMutation = `mutation($input: CreateJob!) {
        createJob(input: $input) {
          id
        }
      }`;

      const createJobVariables = {
        input: {
          name: 'engine-jwt-test-job',
          tasks: [
            {
              engineId: testEngineId
            }
          ]
        }
      };

      result = await superClient.query(createJobMutation, createJobVariables);
      expect(result.createJob).toBeDefined();
      const jobId = result.createJob.id;

      const getEngineJWTMutation = `mutation($input: getEngineJWT!) {
        getEngineJWT(input: $input) {
          engineId
          token
        }
      }`;

      const getEngineJWTVariables = {
        input: {
          engineId: testEngineId,
          resource: {
            jobId: jobId
          }
        }
      };

      result = await superClient.query(
        getEngineJWTMutation,
        getEngineJWTVariables
      );
      expect(result.getEngineJWT).toBeDefined();
      expect(result.getEngineJWT.token).toBeDefined();
      const engineJWT = result.getEngineJWT.token;

      const engineGqlClient = new GraphqlClient(env);
      engineGqlClient.userAuth = helpers.requestOptions(engineJWT);

      const createSlugMutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          sourceId
          created {
            sourceId
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

      const fileUri = `s3://test-bucket/files/${uuid.v4()}/engine-jwt-test.mp4`;
      const createSlugVariables = {
        input: {
          sourceId: sourceId,
          engineId: engineId,
          appId: appId,
          files: [
            {
              fileUri: fileUri,
              bundleKey: `bundle-${uuid.v4()}`,
              mimeType: 'video/mp4',
              fileSizeBytes: 1073741824,
              fileCreatedAt: new Date().toISOString()
            }
          ]
        }
      };

      result = await engineGqlClient.query(
        createSlugMutation,
        createSlugVariables
      );
      expect(result.ingestSlugsCreate).toBeDefined();
      expect(result.ingestSlugsCreate.created).toBeDefined();
      expect(result.ingestSlugsCreate.created.length).toEqual(1);

      const getSlugQuery = `query($sourceId: ID!, $fileUri: String!) {
        ingestSlug(sourceId: $sourceId, fileUri: $fileUri) {
          sourceId
          fileUri
          status
          createdBy
        }
      }`;

      result = await superClient.query(getSlugQuery, {
        sourceId: sourceId,
        fileUri: fileUri
      });

      expect(result.ingestSlug).toBeDefined();
      expect(result.ingestSlug.createdBy).toBeDefined();
      expect(result.ingestSlug.createdBy).toContain('engineId:');
      expect(result.ingestSlug.createdBy).toContain(testEngineId);

      try {
        const deleteSlugMutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
          ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
            sourceId
            deleted {
              sourceId
              fileUri
            }
            failed {
              fileUri
              errorCode
              errorMessage
            }
          }
        }`;

        await superClient.query(deleteSlugMutation, {
          sourceId: sourceId,
          fileUris: [fileUri]
        });
      } catch (err) {
        console.error('Failed to delete ingest slug:', err.message);
      }

      try {
        const deleteEngineQuery = `mutation($id: ID!) {
          deleteEngine(id: $id) {
            id
            message
          }
        }`;

        await superClient.query(deleteEngineQuery, {
          id: testEngineId
        });
      } catch (err) {
        console.error('Failed to delete test engine:', err.message);
      }
    });

    it('should read ingest slugs with orgless internal token', async () => {
      // First, create an ingest slug with the regular authenticated user
      const createSlugMutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          sourceId
          created {
            sourceId
            fileUri
            status
            organizationId
          }
          failed {
            fileUri
            errorCode
            errorMessage
          }
        }
      }`;

      const fileUri = `s3://test-bucket/files/${uuid.v4()}/orgless-read-test.mp4`;
      const createSlugVariables = {
        input: {
          sourceId: sourceId,
          engineId: engineId,
          appId: appId,
          files: [
            {
              fileUri: fileUri,
              bundleKey: `bundle-${uuid.v4()}`,
              mimeType: 'video/mp4',
              fileSizeBytes: 1048576,
              fileCreatedAt: new Date().toISOString()
            }
          ]
        }
      };

      let result = await superClient.query(
        createSlugMutation,
        createSlugVariables
      );
      expect(result.ingestSlugsCreate).toBeDefined();
      expect(result.ingestSlugsCreate.created).toBeDefined();
      expect(result.ingestSlugsCreate.created.length).toEqual(1);
      const createdSlug = result.ingestSlugsCreate.created[0];

      // Now use the orgless internal token to read the ingest slug
      const getSlugQuery = `query($sourceId: ID!, $fileUri: String!) {
        ingestSlug(sourceId: $sourceId, fileUri: $fileUri) {
          sourceId
          fileUri
          status
          organizationId
          mimeType
          createdBy
        }
      }`;

      result = await superClient.queryByInternalOrglessToken(getSlugQuery, {
        sourceId: sourceId,
        fileUri: fileUri
      });

      expect(result.ingestSlug).toBeDefined();
      expect(result.ingestSlug.sourceId).toEqual(sourceId);
      expect(result.ingestSlug.fileUri).toEqual(fileUri);
      expect(result.ingestSlug.organizationId).toEqual(
        createdSlug.organizationId
      );
      expect(result.ingestSlug.mimeType).toEqual('video/mp4');

      // Cleanup
      try {
        const deleteSlugMutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
          ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
            sourceId
            deleted {
              sourceId
              fileUri
            }
          }
        }`;

        await superClient.query(deleteSlugMutation, {
          sourceId: sourceId,
          fileUris: [fileUri]
        });
      } catch (err) {
        console.error('Failed to delete ingest slug:', err.message);
      }
    });

    it('should read multiple ingest slugs with orgless internal token (ingestSlugs query)', async () => {
      // Create multiple ingest slugs with the regular authenticated user
      const createSlugMutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          sourceId
          created {
            sourceId
            fileUri
            status
            organizationId
          }
          failed {
            fileUri
            errorCode
            errorMessage
          }
        }
      }`;

      const fileUri1 = `s3://test-bucket/files/${uuid.v4()}/orgless-list-test-1.mp4`;
      const fileUri2 = `s3://test-bucket/files/${uuid.v4()}/orgless-list-test-2.mp4`;
      const bundleKey = `bundle-${uuid.v4()}`;

      const createSlugVariables = {
        input: {
          sourceId: sourceId,
          engineId: engineId,
          appId: appId,
          files: [
            {
              fileUri: fileUri1,
              bundleKey: bundleKey,
              mimeType: 'video/mp4',
              fileSizeBytes: 1048576,
              fileCreatedAt: new Date().toISOString()
            },
            {
              fileUri: fileUri2,
              bundleKey: bundleKey,
              mimeType: 'video/mp4',
              fileSizeBytes: 2097152,
              fileCreatedAt: new Date().toISOString()
            }
          ]
        }
      };

      let result = await superClient.query(
        createSlugMutation,
        createSlugVariables
      );
      expect(result.ingestSlugsCreate).toBeDefined();
      expect(result.ingestSlugsCreate.created).toBeDefined();
      expect(result.ingestSlugsCreate.created.length).toEqual(2);

      // Now use the orgless internal token to list the ingest slugs
      const getSlugsQuery = `query($filter: IngestSlugFilter, $limit: Int, $offset: Int) {
        ingestSlugs(filter: $filter, limit: $limit, offset: $offset) {
          records {
            sourceId
            fileUri
            status
            organizationId
            mimeType
          }
          count
          offset
          limit
        }
      }`;

      result = await superClient.queryByInternalOrglessToken(getSlugsQuery, {
        filter: {
          sourceId: sourceId,
          fileUriExact: [fileUri1, fileUri2]
        },
        limit: 10,
        offset: 0
      });

      expect(result.ingestSlugs).toBeDefined();
      expect(result.ingestSlugs.records).toBeDefined();
      expect(result.ingestSlugs.records.length).toEqual(2);

      const fileUris = result.ingestSlugs.records.map(r => r.fileUri);
      expect(fileUris).toContain(fileUri1);
      expect(fileUris).toContain(fileUri2);

      // Cleanup
      try {
        const deleteSlugMutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
          ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
            sourceId
            deleted {
              sourceId
              fileUri
            }
          }
        }`;

        await superClient.query(deleteSlugMutation, {
          sourceId: sourceId,
          fileUris: [fileUri1, fileUri2]
        });
      } catch (err) {
        console.error('Failed to delete ingest slugs:', err.message);
      }
    });
  });

  describe('Source JWT sourceId precedence', () => {
    // Tests to verify that sourceId from JWT (_authInfo.sourceId) takes precedence over input sourceId
    let sourceJwtToken;
    let sourceJwtSourceId;
    const DIFFERENT_SOURCE_ID = '999999999'; // A sourceId that differs from the JWT's sourceId

    beforeAll(async () => {
      // Get a source JWT for the test source
      const getSourceJWTMutation = `mutation($sourceId: ID!) {
        getSourceJWT(sourceId: $sourceId) {
          token
          sourceId
          organizationId
          ownerId
        }
      }`;

      const result = await superClient.query(getSourceJWTMutation, {
        sourceId: sourceId
      });
      expect(result.getSourceJWT).toBeDefined();
      expect(result.getSourceJWT.token).toBeDefined();
      sourceJwtToken = result.getSourceJWT.token;
      sourceJwtSourceId = result.getSourceJWT.sourceId;
      const resolvedOwnerId = result.getSourceJWT.ownerId;
      expect(resolvedOwnerId).toBeDefined();
      let decodeToken = jwt.decode(sourceJwtToken);
      expect(_.get(decodeToken, 'userId')).toEqual(resolvedOwnerId);
    });

    function getSourceJwtRequestOptions() {
      return {
        headers: {
          Authorization: 'Bearer ' + sourceJwtToken,
          'Content-Type': 'application/json',
          'User-Agent': 'GraphQL-CI-Test',
          Accept: '*/*',
          'X-Veritone-Application': 'GraphQL-CI-Test'
        }
      };
    }

    it('#ingestSlugsCreate - should use sourceId from JWT instead of input sourceId', async () => {
      const fileUri = `s3://test-bucket/files/${uuid.v4()}/jwt-precedence-create.mp4`;

      const createSlugMutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          sourceId
          created {
            sourceId
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

      const variables = {
        input: {
          sourceId: DIFFERENT_SOURCE_ID, // This should be ignored in favor of JWT sourceId
          files: [{ fileUri: fileUri, mimeType: 'video/mp4' }]
        }
      };

      const result = await superClient.query(
        createSlugMutation,
        variables,
        getSourceJwtRequestOptions()
      );

      expect(result.ingestSlugsCreate).toBeDefined();
      expect(result.ingestSlugsCreate.sourceId).toEqual(sourceJwtSourceId);
      expect(result.ingestSlugsCreate.sourceId).not.toEqual(
        DIFFERENT_SOURCE_ID
      );
      expect(result.ingestSlugsCreate.created.length).toBeGreaterThan(0);
      expect(result.ingestSlugsCreate.created[0].sourceId).toEqual(
        sourceJwtSourceId
      );

      // Cleanup using regular auth
      try {
        const deleteSlugMutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
          ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
            sourceId
            deleted { sourceId fileUri }
          }
        }`;
        await superClient.query(deleteSlugMutation, {
          sourceId: sourceJwtSourceId,
          fileUris: [fileUri]
        });
      } catch (err) {
        console.warn('Cleanup failed:', err.message);
      }
    });

    it('#ingestSlug - should use sourceId from JWT instead of input sourceId', async () => {
      // First create a slug using the JWT
      const fileUri = `s3://test-bucket/files/${uuid.v4()}/jwt-precedence-get.mp4`;

      const createSlugMutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          sourceId
          created { sourceId fileUri status }
        }
      }`;

      await superClient.query(
        createSlugMutation,
        {
          input: {
            sourceId: sourceJwtSourceId,
            files: [{ fileUri: fileUri, mimeType: 'video/mp4' }]
          }
        },
        getSourceJwtRequestOptions()
      );

      // Now query using the JWT with a different sourceId in the input
      const getSlugQuery = `query($sourceId: ID!, $fileUri: String!) {
        ingestSlug(sourceId: $sourceId, fileUri: $fileUri) {
          sourceId
          fileUri
          status
        }
      }`;

      const result = await superClient.query(
        getSlugQuery,
        {
          sourceId: DIFFERENT_SOURCE_ID, // This should be ignored
          fileUri: fileUri
        },
        getSourceJwtRequestOptions()
      );

      expect(result.ingestSlug).toBeDefined();
      expect(result.ingestSlug.sourceId).toEqual(sourceJwtSourceId);
      expect(result.ingestSlug.sourceId).not.toEqual(DIFFERENT_SOURCE_ID);

      // Cleanup
      try {
        const deleteSlugMutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
          ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
            sourceId
            deleted { sourceId fileUri }
          }
        }`;
        await superClient.query(deleteSlugMutation, {
          sourceId: sourceJwtSourceId,
          fileUris: [fileUri]
        });
      } catch (err) {
        console.warn('Cleanup failed:', err.message);
      }
    });

    it('#ingestSlugs - should use filter sourceId (JWT does not override filter for list queries)', async () => {
      // Create a slug first using JWT
      const fileUri = `s3://test-bucket/files/${uuid.v4()}/jwt-precedence-list.mp4`;

      const createSlugMutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          sourceId
          created { sourceId fileUri status }
        }
      }`;

      await superClient.query(
        createSlugMutation,
        {
          input: {
            sourceId: sourceJwtSourceId,
            files: [{ fileUri: fileUri, mimeType: 'video/mp4' }]
          }
        },
        getSourceJwtRequestOptions()
      );

      // List slugs using the JWT's sourceId in filter - should find the slug
      const listSlugsQuery = `query($filter: IngestSlugFilter, $limit: Int, $offset: Int) {
        ingestSlugs(filter: $filter, limit: $limit, offset: $offset) {
          records {
            sourceId
            fileUri
            status
          }
          count
        }
      }`;

      const result = await superClient.query(
        listSlugsQuery,
        {
          filter: { sourceId: sourceJwtSourceId, fileUriExact: [fileUri] }, // Use the actual sourceId from JWT
          limit: 10,
          offset: 0
        },
        getSourceJwtRequestOptions()
      );

      expect(result.ingestSlugs).toBeDefined();
      expect(result.ingestSlugs.records.length).toBeGreaterThan(0);
      expect(result.ingestSlugs.records[0].sourceId).toEqual(sourceJwtSourceId);

      // Cleanup
      try {
        const deleteSlugMutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
          ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
            sourceId
            deleted { sourceId fileUri }
          }
        }`;
        await superClient.query(deleteSlugMutation, {
          sourceId: sourceJwtSourceId,
          fileUris: [fileUri]
        });
      } catch (err) {
        console.warn('Cleanup failed:', err.message);
      }
    });

    it('#ingestSlugs - JWT sourceId should override provided filter array of sourceIds', async () => {
      // Create a slug using JWT
      const fileUri = `s3://test-bucket/files/${uuid.v4()}/jwt-precedence-list-array.mp4`;

      const createSlugMutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          sourceId
          created { sourceId fileUri status }
        }
      }`;

      await superClient.query(
        createSlugMutation,
        {
          input: {
            sourceId: sourceJwtSourceId,
            files: [{ fileUri: fileUri, mimeType: 'video/mp4' }]
          }
        },
        getSourceJwtRequestOptions()
      );

      // List slugs using a filter array that contains different sourceIds; JWT should take precedence
      const listSlugsQuery = `query($filter: IngestSlugFilter, $limit: Int, $offset: Int) {
        ingestSlugs(filter: $filter, limit: $limit, offset: $offset) {
          records { sourceId fileUri status }
          count
        }
      }`;

      const result = await superClient.query(
        listSlugsQuery,
        {
          filter: {
            sourceId: [DIFFERENT_SOURCE_ID, '12345'],
            fileUriExact: [fileUri]
          },
          limit: 10,
          offset: 0
        },
        getSourceJwtRequestOptions()
      );

      expect(result.ingestSlugs).toBeDefined();
      expect(result.ingestSlugs.records.length).toBeGreaterThan(0);
      expect(result.ingestSlugs.records[0].sourceId).toEqual(sourceJwtSourceId);

      // Cleanup
      try {
        const deleteSlugMutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
          ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
            sourceId
            deleted { sourceId fileUri }
          }
        }`;
        await superClient.query(deleteSlugMutation, {
          sourceId: sourceJwtSourceId,
          fileUris: [fileUri]
        });
      } catch (err) {
        console.warn('Cleanup failed:', err.message);
      }
    });

    it('#ingestSlugUpdate - should use sourceId from JWT instead of input sourceId', async () => {
      // Create a slug first
      const fileUri = `s3://test-bucket/files/${uuid.v4()}/jwt-precedence-update.mp4`;

      const createSlugMutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          sourceId
          created { sourceId fileUri status }
        }
      }`;

      await superClient.query(
        createSlugMutation,
        {
          input: {
            sourceId: sourceJwtSourceId,
            files: [{ fileUri: fileUri, mimeType: 'video/mp4' }]
          }
        },
        getSourceJwtRequestOptions()
      );

      // Update the slug using JWT with different sourceId in input
      const updateSlugMutation = `mutation($sourceId: ID!, $fileUri: String!, $input: IngestSlugUpdateInput!) {
        ingestSlugUpdate(sourceId: $sourceId, fileUri: $fileUri, input: $input) {
          sourceId
          fileUri
          status
          statusMessage
        }
      }`;

      const result = await superClient.query(
        updateSlugMutation,
        {
          sourceId: DIFFERENT_SOURCE_ID, // This should be ignored
          fileUri: fileUri,
          input: { statusMessage: 'Updated via JWT test' }
        },
        getSourceJwtRequestOptions()
      );

      expect(result.ingestSlugUpdate).toBeDefined();
      expect(result.ingestSlugUpdate.sourceId).toEqual(sourceJwtSourceId);
      expect(result.ingestSlugUpdate.sourceId).not.toEqual(DIFFERENT_SOURCE_ID);
      expect(result.ingestSlugUpdate.statusMessage).toEqual(
        'Updated via JWT test'
      );

      // Cleanup
      try {
        const deleteSlugMutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
          ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
            sourceId
            deleted { sourceId fileUri }
          }
        }`;
        await superClient.query(deleteSlugMutation, {
          sourceId: sourceJwtSourceId,
          fileUris: [fileUri]
        });
      } catch (err) {
        console.warn('Cleanup failed:', err.message);
      }
    });

    it('#ingestSlugUpdateStatus - should use sourceId from JWT instead of input sourceId', async () => {
      // Create a slug first
      const fileUri = `s3://test-bucket/files/${uuid.v4()}/jwt-precedence-status.mp4`;

      const createSlugMutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          sourceId
          created { sourceId fileUri status }
        }
      }`;

      await superClient.query(
        createSlugMutation,
        {
          input: {
            sourceId: sourceJwtSourceId,
            files: [{ fileUri: fileUri, mimeType: 'video/mp4' }]
          }
        },
        getSourceJwtRequestOptions()
      );

      // Update status using JWT with different sourceId in input
      const updateStatusMutation = `mutation($sourceId: ID!, $fileUris: [String!]!, $input: IngestSlugsStatusUpdateInput!) {
        ingestSlugUpdateStatus(sourceId: $sourceId, fileUris: $fileUris, input: $input) {
          sourceId
          updated {
            fileUri
          }
          failed {
            fileUri
            errorMessage
          }
        }
      }`;

      const result = await superClient.query(
        updateStatusMutation,
        {
          sourceId: DIFFERENT_SOURCE_ID, // This should be ignored
          fileUris: [fileUri],
          input: { status: 'ingesting' }
        },
        getSourceJwtRequestOptions()
      );

      expect(result.ingestSlugUpdateStatus).toBeDefined();
      expect(result.ingestSlugUpdateStatus.sourceId).toEqual(sourceJwtSourceId);
      expect(result.ingestSlugUpdateStatus.sourceId).not.toEqual(
        DIFFERENT_SOURCE_ID
      );
      expect(result.ingestSlugUpdateStatus.updated.length).toBeGreaterThan(0);

      // Cleanup
      try {
        const deleteSlugMutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
          ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
            sourceId
            deleted { sourceId fileUri }
          }
        }`;
        await superClient.query(deleteSlugMutation, {
          sourceId: sourceJwtSourceId,
          fileUris: [fileUri]
        });
      } catch (err) {
        console.warn('Cleanup failed:', err.message);
      }
    });

    it('#ingestSlugsDelete - should use sourceId from JWT instead of input sourceId', async () => {
      // Create a slug first
      const fileUri = `s3://test-bucket/files/${uuid.v4()}/jwt-precedence-delete.mp4`;

      const createSlugMutation = `mutation($input: IngestSlugsCreateInput!) {
        ingestSlugsCreate(input: $input) {
          sourceId
          created { sourceId fileUri status }
        }
      }`;

      await superClient.query(
        createSlugMutation,
        {
          input: {
            sourceId: sourceJwtSourceId,
            files: [{ fileUri: fileUri, mimeType: 'video/mp4' }]
          }
        },
        getSourceJwtRequestOptions()
      );

      // Delete using JWT with different sourceId in input
      const deleteSlugMutation = `mutation($sourceId: ID!, $fileUris: [String!]!) {
        ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
          sourceId
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

      const result = await superClient.query(
        deleteSlugMutation,
        {
          sourceId: DIFFERENT_SOURCE_ID, // This should be ignored
          fileUris: [fileUri]
        },
        getSourceJwtRequestOptions()
      );

      expect(result.ingestSlugsDelete).toBeDefined();
      expect(result.ingestSlugsDelete.sourceId).toEqual(sourceJwtSourceId);
      expect(result.ingestSlugsDelete.sourceId).not.toEqual(
        DIFFERENT_SOURCE_ID
      );
      expect(result.ingestSlugsDelete.deleted.length).toBeGreaterThan(0);
      expect(result.ingestSlugsDelete.deleted[0].sourceId).toEqual(
        sourceJwtSourceId
      );
    });
  });

  describe('#ingestSlugsDelete security', () => {
    const DELETE_INGEST_SLUGS = `
    mutation($sourceId: ID!, $fileUris: [String!]!) {
      ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
        sourceId
        deleted {
          sourceId
          fileUri
        }
        failed {
          fileUri
          errorCode
          errorMessage
        }
      }
    }
  `;

    const CREATE_SLUG = `
    mutation($input: IngestSlugsCreateInput!) {
      ingestSlugsCreate(input: $input) {
        sourceId
        created {
          sourceId
          fileUri
          status
        }
        failed {
          fileUri
          errorCode
          errorMessage
        }
      }
    }
  `;

    it('should deny delete when user lacks permission', async () => {
      const fileUri = `s3://test-bucket/security-${Date.now()}.mp4`;

      await superClient.query(CREATE_SLUG, {
        input: {
          sourceId,
          files: [
            {
              fileUri,
              bundleKey: 'bundle-security',
              mimeType: 'video/mp4',
              fileSizeBytes: 1000,
              fileCreatedAt: '2024-01-01T00:00:00Z',
              fileModifiedAt: '2024-01-01T00:00:00Z',
              status: 'pending'
            }
          ]
        }
      });

      await expect(
        normalClient.query(DELETE_INGEST_SLUGS, {
          sourceId,
          fileUris: [fileUri]
        })
      ).rejects.toThrow();
    });

    it('should allow superadmin to delete ingest slug', async () => {
      const fileUri = `s3://test-bucket/security-${Date.now()}.mp4`;

      await superClient.query(CREATE_SLUG, {
        input: {
          sourceId,
          files: [
            {
              fileUri,
              bundleKey: 'bundle-security',
              mimeType: 'video/mp4',
              fileSizeBytes: 1000,
              fileCreatedAt: '2024-01-01T00:00:00Z',
              fileModifiedAt: '2024-01-01T00:00:00Z',
              status: 'pending'
            }
          ]
        }
      });

      const result = await superClient.query(DELETE_INGEST_SLUGS, {
        sourceId,
        fileUris: [fileUri]
      });

      expect(result.ingestSlugsDelete.deleted.length).toBe(1);
      expect(result.ingestSlugsDelete.deleted[0].fileUri).toBe(fileUri);
    });

    it('should reject unauthenticated request', async () => {
      const anonymousClient = new GraphqlClient({
        endpoint: env.endpoint
      });

      await expect(
        anonymousClient.query(DELETE_INGEST_SLUGS, {
          sourceId,
          fileUris: ['s3://bucket/test.mp4']
        })
      ).rejects.toThrow();
    });
  });
});
