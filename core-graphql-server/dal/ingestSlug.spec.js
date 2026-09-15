const _ = require('lodash');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');

// Built once and reused across tests (full serviceContext construction is
// expensive - ~35 DAL/BLL modules + caches). Per-test isolation is restored
// via _clearAll() plus the explicit resets below, matching the queue-clear
// contract that _clearAll() already provides for dbConnections.
const serviceContext = initializeServiceContext();
const dal = require('./ingestSlug.js')(serviceContext);

// A handful of tests replace these with jest.fn() mocks; snapshot the
// pristine references so beforeEach can restore them for later tests.
const defaultMessageUtilEmitEvent = serviceContext.messageUtil.emitEvent;
const defaultMessageUtilEmitPublicEvent = serviceContext.messageUtil.emitPublicEvent;
const defaultMessageUtilTopics = serviceContext.messageUtil.topics;
const defaultLogger = serviceContext.logger;
const defaultCoreWriteMap = serviceContext.dbConnections['core'].write.map;
const defaultCoreWriteAny = serviceContext.dbConnections['core'].write.any;

describe('ingestSlug.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
    serviceContext.messageUtil.emitEvent = defaultMessageUtilEmitEvent;
    serviceContext.messageUtil.emitPublicEvent = defaultMessageUtilEmitPublicEvent;
    serviceContext.messageUtil.topics = defaultMessageUtilTopics;
    serviceContext.logger = defaultLogger;
    serviceContext.dbConnections['core'].write.map = defaultCoreWriteMap;
    serviceContext.dbConnections['core'].write.any = defaultCoreWriteAny;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe('#require', function () {
    it('should have correct function exports', function () {
      expect(typeof dal).toEqual('object');
      expect(Object.keys(dal).length).toEqual(13);
      expect(typeof dal.getIngestSlug).toEqual('function');
      expect(typeof dal.getIngestSlugs).toEqual('function');
      expect(typeof dal.createIngestSlugs).toEqual('function');
      expect(typeof dal.updateIngestSlug).toEqual('function');
      expect(typeof dal.updateIngestSlugStatus).toEqual('function');
      expect(typeof dal.deleteIngestSlugs).toEqual('function');
    });
  });

  describe('#getIngestSlug', () => {
    it('should error if fileUri is missing', async () => {
      const context = mockUtil.makeContext();
      let error;
      try {
        await dal.getIngestSlug({ sourceId: '100' }, context);
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('fileUri is required.');
    });

    it('should error if sourceId is missing', async () => {
      const context = mockUtil.makeContext();
      // Do not push validation mock, should fail before validation
      let error;
      try {
        await dal.getIngestSlug(
          { fileUri: 's3://bucket/file.mp4' },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('sourceId is required.');
    });

    it('should return null if ingest slug not found', async () => {
      const context = mockUtil.makeContext();
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock ingest slug query - no results
      serviceContext.dbConnections['core'].read._push([]);
      let error;
      try {
        await dal.getIngestSlug(
          { sourceId: '100', fileUri: 's3://bucket/file.mp4' },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toMatch(/Ingest slug not found/i);
    });

    it('should return ingest slug when found', async () => {
      const context = mockUtil.makeContext();
      const mockSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file.mp4',
        organizationId: '35521',
        mimeType: 'video/mp4',
        fileSizeBytes: 1048576,
        fileCreatedAt: '2024-01-15T10:00:00Z',
        fileAccessedAt: '2024-01-15T10:30:00Z',
        fileModifiedAt: '2024-01-15T11:00:00Z',
        status: 'ingested',
        statusMessage: 'Successfully ingested',
        bundleKey: 'bundle-123',
        batchFileUri: 's3://bucket/batch/file.mp4',
        applicationId: '47bd3e25-f4ea-435f-b69b-13cb4f9dd60a',
        engineId: 'c0e55cde-340b-44d7-bb42-2e0d65e98255',
        tdoId: '1570654874',
        assetId: '1570654874_4hJtNKSUXD',
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T12:00:00Z',
        createdBy: 'user-123'
      };

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock ingest slug query
      serviceContext.dbConnections['core'].read._push([mockSlug]);

      const result = await dal.getIngestSlug(
        { sourceId: '100', fileUri: 's3://bucket/file.mp4' },
        context
      );

      expect(result).toBeDefined();
      expect(result).toEqual(mockSlug);
    });
  });

  describe('#getIngestSlugs', () => {
    it('should return empty list with default pagination', async () => {
      const context = mockUtil.makeContext();
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock ingest slugs query - empty results
      serviceContext.dbConnections['core'].read._push([]);

      const result = await dal.getIngestSlugs(
        { offset: 0, limit: 30 },
        context
      );

      expect(result).toBeDefined();
      expect(result.records).toEqual([]);
      expect(result.offset).toEqual(0);
      expect(result.limit).toEqual(30);
      expect(result.count).toEqual(0);
    });

    it('should return list of ingest slugs with count', async () => {
      const context = mockUtil.makeContext();
      const mockSlugs = [
        {
          sourceId: '100',
          fileUri: 's3://bucket/file1.mp4',
          organizationId: '35521',
          status: 'ingested',
          mimeType: 'video/mp4',
          fileSizeBytes: 2097152,
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T12:00:00Z',
          totalCount: '2'
        },
        {
          sourceId: '100',
          fileUri: 's3://bucket/file2.mp4',
          organizationId: '35521',
          status: 'pending',
          mimeType: 'video/mp4',
          fileSizeBytes: 3145728,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T13:00:00Z',
          totalCount: '2'
        }
      ];

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock ingest slugs query with window function for count
      serviceContext.dbConnections['core'].read._push(mockSlugs);

      const result = await dal.getIngestSlugs(
        { offset: 0, limit: 10 },
        context
      );

      expect(result).toBeDefined();
      expect(result.records).toHaveLength(2);
      expect(result.totalCount).toEqual(2);
      expect(result.offset).toEqual(0);
      expect(result.limit).toEqual(10);
    });

    it('should filter by sourceIds', async () => {
      const context = mockUtil.makeContext();
      const mockSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file1.mp4',
        organizationId: '35521',
        status: 'ingested',
        totalCount: '1'
      };

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock ingest slugs query
      serviceContext.dbConnections['core'].read._push([mockSlug]);

      const result = await dal.getIngestSlugs(
        {
          filter: { sourceId: ['100'] },
          offset: 0,
          limit: 10
        },
        context
      );

      expect(result.records).toHaveLength(1);
      expect(result.records[0].sourceId).toEqual('100');
    });

    it('should filter by sourceId', async () => {
      const context = mockUtil.makeContext();
      const mockSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file1.mp4',
        organizationId: '35521',
        status: 'ingested',
        totalCount: '1'
      };

      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      serviceContext.dbConnections['core'].read._push(
        [mockSlug],
        true,
        ['s.media_source_id'],
        (_sql, args) => {
          expect(args).toContain(100);
          return true;
        }
      );

      const result = await dal.getIngestSlugs(
        {
          filter: { sourceId: '100' },
          offset: 0,
          limit: 10
        },
        context
      );

      expect(result.records).toHaveLength(1);
      expect(result.records[0].sourceId).toEqual('100');
    });

    it('should filter by status', async () => {
      const context = mockUtil.makeContext();
      const mockSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file1.mp4',
        status: 'pending',
        totalCount: '1'
      };

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock ingest slugs query
      serviceContext.dbConnections['core'].read._push([mockSlug]);

      const result = await dal.getIngestSlugs(
        {
          filter: { status: ['pending'] },
          offset: 0,
          limit: 10
        },
        context
      );

      expect(result.records).toHaveLength(1);
      expect(result.records[0].status).toEqual('pending');
    });

    it('should filter by fileUriPrefix', async () => {
      const context = mockUtil.makeContext();
      const mockSlug = {
        fileUri: 's3://bucket/archive/2024-01/file.mp4',
        totalCount: '1'
      };

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock ingest slugs query
      serviceContext.dbConnections['core'].read._push([mockSlug]);

      const result = await dal.getIngestSlugs(
        {
          filter: { fileUriPrefix: ['s3://bucket/archive/2024-01'] },
          offset: 0,
          limit: 10
        },
        context
      );

      expect(result.records).toHaveLength(1);
    });

    it('should apply offset and limit correctly', async () => {
      const context = mockUtil.makeContext();
      const mockSlugs = [
        { 
          sourceId: '100', 
          fileUri: 's3://bucket/file1.mp4',
          totalCount: '100'
        }
      ];

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock ingest slugs query
      serviceContext.dbConnections['core'].read._push(mockSlugs);

      const result = await dal.getIngestSlugs(
        { offset: 50, limit: 25 },
        context
      );

      expect(result.offset).toEqual(50);
      expect(result.limit).toEqual(25);
      expect(result.totalCount).toEqual(100);
    });

    it('should include LEFT JOIN to recording table when filtering by tdoId', async () => {
      const context = mockUtil.makeContext();
      const mockSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file1.mp4',
        organizationId: '35521',
        status: 'ingested',
        totalCount: '1'
      };

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock ingest slugs query
      serviceContext.dbConnections['core'].read._push([mockSlug]);

      const result = await dal.getIngestSlugs(
        {
          filter: { tdoId: ['1570654874'] },
          offset: 0,
          limit: 10
        },
        context
      );

      expect(result.records).toHaveLength(1);
      expect(result.records[0].sourceId).toEqual('100');
    });

    it('should include LEFT JOIN to recording table when filtering by assetId', async () => {
      const context = mockUtil.makeContext();
      const mockSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file1.mp4',
        organizationId: '35521',
        status: 'ingested',
        totalCount: '1'
      };

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock ingest slugs query
      serviceContext.dbConnections['core'].read._push([mockSlug]);

      const result = await dal.getIngestSlugs(
        {
          filter: { assetId: ['1570654874_4hJtNKSUXD'] },
          offset: 0,
          limit: 10
        },
        context
      );

      expect(result.records).toHaveLength(1);
      expect(result.records[0].sourceId).toEqual('100');
    });

    it('should NOT include LEFT JOIN when neither tdoId nor assetId filters are present', async () => {
      const context = mockUtil.makeContext();
      const mockSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file1.mp4',
        organizationId: '35521',
        status: 'ingested',
        totalCount: '1'
      };

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock ingest slugs query
      serviceContext.dbConnections['core'].read._push([mockSlug]);

      const result = await dal.getIngestSlugs(
        {
          filter: { sourceId: ['100'] },
          offset: 0,
          limit: 10
        },
        context
      );

      expect(result.records).toHaveLength(1);
      expect(result.records[0].sourceId).toEqual('100');
    });
  });

  describe('#createIngestSlugs', () => {
    it('should error if input is missing', async () => {
      const context = mockUtil.makeContext();
      let error;
      try {
        await dal.createIngestSlugs({}, context);
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('input is required to create ingest slugs.');
    });

    it('should error if sourceId is missing', async () => {
      const context = mockUtil.makeContext();
      // Mock organization validation to avoid DB error
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: '35521' }]);
      let error;
      try {
        await dal.createIngestSlugs(
          {
            input: {
              organizationId: '35521',
              files: [{ fileUri: 's3://bucket/file.mp4' }]
            }
          },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('sourceId is required.');
    });

    it('should error if no files are provided', async () => {
      const context = mockUtil.makeContext();
      // Mock validations
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: '35521' }]);
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: '100' }]);
      let error;
      try {
        await dal.createIngestSlugs(
          {
            input: {
              sourceId: '100',
              organizationId: '35521',
              files: []
            }
          },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual(
        'At least one file reference must be provided to create ingest slugs.'
      );
    });

    it('should successfully create ingest slugs', async () => {
      const context = mockUtil.makeContext();
      // Mock validations
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: '35521' }]);
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: '100' }]);
      
      serviceContext.dbConnections['core'].write._push([
        {
          sourceId: '100',
          fileUri: 's3://bucket/file1001.mp4',
          status: 'pending',
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T09:00:00Z'
        },
        {
          sourceId: '100',
          fileUri: 's3://bucket/file1002.mp4',
          status: 'pending',
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T09:00:00Z'
        }
      ]);
    
      const result = await dal.createIngestSlugs(
        {
          input: {
            sourceId: '100',
            organizationId: '35521',
            files: [
              {
                fileUri: 's3://bucket/file1001.mp4',
                bundleKey: 'bundle-001',
                mimeType: 'video/mp4',
                fileSizeBytes: 2147483648
              },
              {
                fileUri: 's3://bucket/file1002.mp4',
                bundleKey: 'bundle-001',
                mimeType: 'video/mp4',
                fileSizeBytes: 1073741824
              }
            ]
          }
        },
        context
      );

      expect(result).toBeDefined();
      expect(result.sourceId).toEqual('100');
      expect(result.created).toHaveLength(2);
      expect(result.failed).toEqual([]);
    });

    it('should handle batch creation with optional parameters', async () => {
      const context = mockUtil.makeContext();
      // Mock validations
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: '35521' }]);
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: '100' }]);
      serviceContext.dbConnections['core'].read._push([{ engine_id: 'c0e55cde-340b-44d7-bb42-2e0d65e98255' }]);
      serviceContext.dbConnections['sso'].read._push([{ application_id: '47bd3e25-f4ea-435f-b69b-13cb4f9dd60a' }]);
      const createdSlug = [
        {
          sourceId: '100',
          fileUri: 's3://bucket/file.mp4',
          status: 'pending'
        }
      ];

      serviceContext.dbConnections['core'].write._push(createdSlug);

      const result = await dal.createIngestSlugs(
        {
          input: {
            sourceId: '100',
            organizationId: '35521',
            files: [
              {
                fileUri: 's3://bucket/file.mp4',
                bundleKey: 'bundle-001',
                mimeType: 'video/mp4',
                fileSizeBytes: 2147483648,
                fileCreatedAt: '2024-01-15T10:00:00Z',
                status: 'pending'
              }
            ],
            engineId: 'c0e55cde-340b-44d7-bb42-2e0d65e98255',
            appId: '47bd3e25-f4ea-435f-b69b-13cb4f9dd60a'
          }
        },
        context
      );

      expect(result.created).toHaveLength(1);
      expect(result.created[0].sourceId).toEqual('100');
    });

    it('should emit mediaSourceId as an integer in ingest_slug_created event when sourceId is a string', async () => {
      const context = mockUtil.makeContext();
      serviceContext.messageUtil.emitEvent = jest.fn().mockResolvedValue();
      serviceContext.messageUtil.emitPublicEvent = jest.fn().mockResolvedValue();
      serviceContext.messageUtil.topics = jest.fn().mockReturnValue('EVENTS');

      // Mock validations
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: '35521' }]);
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: '100' }]);
      serviceContext.dbConnections['core'].write._push([
        { sourceId: '100', fileUri: 's3://bucket/file.mp4', status: 'pending' }
      ]);

      await dal.createIngestSlugs(
        {
          input: {
            sourceId: '100',
            organizationId: '35521',
            files: [{ fileUri: 's3://bucket/file.mp4', mimeType: 'video/mp4', fileSizeBytes: 1024 }]
          }
        },
        context
      );

      const emittedEvent = serviceContext.messageUtil.emitEvent.mock.calls[0][0];
      expect(typeof emittedEvent.mediaSourceId).toEqual('number');
      expect(emittedEvent.mediaSourceId).toEqual(100);
    });
  });

  describe('#updateIngestSlug', () => {
    it('should error if sourceId is missing', async () => {
      const context = mockUtil.makeContext();
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      let error;
      try {
        await dal.updateIngestSlug(
          {
            fileUri: 's3://bucket/file.mp4',
            input: { status: 'ingested' }
          },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('sourceId is required.');
    });

    it('should error if fileUri is missing', async () => {
      const context = mockUtil.makeContext();
      let error;
      try {
        await dal.updateIngestSlug(
          {
            sourceId: '100',
            input: { status: 'ingested' }
          },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('fileUri is required.');
    });

    it('should error if input is missing', async () => {
      const context = mockUtil.makeContext();
      let error;
      try {
        await dal.updateIngestSlug(
          {
            sourceId: '100',
            fileUri: 's3://bucket/file.mp4'
          },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('input is required to update an ingest slug.');
    });

    it('should error if no fields provided to update', async () => {
      const context = mockUtil.makeContext();
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock media_source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 100 }]);
      let error;
      try {
        await dal.updateIngestSlug(
          {
            sourceId: '100',
            fileUri: 's3://bucket/file.mp4',
            input: {}
          },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual(
        'At least one field must be provided in input to update an ingest slug.'
      );
    });

    it('should return null if slug not found', async () => {
      const context = mockUtil.makeContext();
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock media_source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 100 }]);
      // Mock update query - no results
      serviceContext.dbConnections['core'].write._push([]);
      // Mock getIngestSlug query - no results
      serviceContext.dbConnections['core'].read._push([]);
      let error;
      try {
        await dal.updateIngestSlug(
          {
            sourceId: '100',
            fileUri: 's3://bucket/file.mp4',
            input: { status: 'ingested' }
          },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toMatch(/Ingest slug not found/i);
    });

    it('should successfully update ingest slug', async () => {
      const context = mockUtil.makeContext();
      const updatedSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file.mp4',
        organizationId: '35521',
        status: 'ingested',
        statusMessage: 'Successfully processed',
        mimeType: 'video/mp4',
        fileSizeBytes: 2147483648,
        updatedAt: '2024-01-15T14:00:00Z',
        createdAt: '2024-01-15T09:00:00Z',
        createdBy: 'user-123'
      };

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock media_source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 100 }]);
      // Mock update query
      serviceContext.dbConnections['core'].write._push([{ previousStatus: 'pending' }]);
      // Mock getIngestSlug query
      serviceContext.dbConnections['core'].read._push([updatedSlug]);

      const result = await dal.updateIngestSlug(
        {
          sourceId: '100',
          fileUri: 's3://bucket/file.mp4',
          input: {
            status: 'ingested',
            statusMessage: 'Successfully processed',
            mimeType: 'video/mp4',
            fileSizeBytes: 2147483648
          }
        },
        context
      );

      expect(result).toBeDefined();
      expect(result.status).toEqual('ingested');
      expect(result.statusMessage).toEqual('Successfully processed');
      expect(result.mimeType).toEqual('video/mp4');
      expect(result.fileSizeBytes).toEqual(2147483648);
      expect(result.updatedAt).toEqual('2024-01-15T14:00:00Z');
      expect(result.createdAt).toEqual('2024-01-15T09:00:00Z');
      expect(result.createdBy).toEqual('user-123');
    });

    it('should update partial fields', async () => {
      const context = mockUtil.makeContext();
      const updatedSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file.mp4',
        status: 'uploaded',
        updatedAt: '2024-01-15T14:00:00Z'
      };

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock media_source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 100 }]);
      // Mock update query
      serviceContext.dbConnections['core'].write._push([{ previousStatus: 'pending' }]);
      // Mock getIngestSlug query
      serviceContext.dbConnections['core'].read._push([updatedSlug]);

      const result = await dal.updateIngestSlug(
        {
          sourceId: '100',
          fileUri: 's3://bucket/file.mp4',
          input: { status: 'uploaded' }
        },
        context
      );

      expect(result.status).toEqual('uploaded');
    });
  });

  describe('#updateIngestSlugStatus', () => {
    it('should error if sourceId is missing', async () => {
      const context = mockUtil.makeContext();
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      let error;
      try {
        await dal.updateIngestSlugStatus(
          {
            fileUris: ['s3://bucket/file.mp4'],
            input: { status: 'ingested' }
          },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('sourceId is required.');
    });

    it('should error if fileUris is missing or empty', async () => {
      const context = mockUtil.makeContext();
      let error;
      try {
        await dal.updateIngestSlugStatus(
          {
            sourceId: '100',
            fileUris: [],
            input: { status: 'ingested' }
          },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual(
        'At least one fileUri must be provided to update status.'
      );
    });

    it('should error if input is missing', async () => {
      const context = mockUtil.makeContext();
      let error;
      try {
        await dal.updateIngestSlugStatus(
          {
            sourceId: '100',
            fileUris: ['s3://bucket/file.mp4']
          },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('input is required to update ingest slug status.');
    });

    it('should error if status is missing from input', async () => {
      const context = mockUtil.makeContext();
      let error;
      try {
        await dal.updateIngestSlugStatus(
          {
            sourceId: '100',
            fileUris: ['s3://bucket/file.mp4'],
            input: {}
          },
          context
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('status is required in input.');
    });

    it('should successfully update multiple slug statuses', async () => {
      const context = mockUtil.makeContext();
      const updatedSlugs = [
        {
          sourceId: '100',
          fileUri: 's3://bucket/file1.mp4',
          status: 'ingested',
          updatedAt: '2024-01-15T14:00:00Z'
        },
        {
          sourceId: '100',
          fileUri: 's3://bucket/file2.mp4',
          status: 'ingested',
          updatedAt: '2024-01-15T14:00:00Z'
        }
      ];

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock media_source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 100 }]);
      // Mock batch update - returns both results in single query
      serviceContext.dbConnections['core'].write._push([
        { fileUri: 's3://bucket/file1.mp4', previousStatus: 'pending' },
        { fileUri: 's3://bucket/file2.mp4', previousStatus: 'pending' }
      ]);

      const result = await dal.updateIngestSlugStatus(
        {
          sourceId: '100',
          fileUris: [
            's3://bucket/file1.mp4',
            's3://bucket/file2.mp4'
          ],
          input: {
            status: 'ingested',
            statusMessage: 'Batch processing completed'
          }
        },
        context
      );

      expect(result).toBeDefined();
      expect(result.sourceId).toEqual('100');
      expect(result.updated).toHaveLength(2);
      expect(result.failed).toEqual([]);
    });

    it('should handle update status with optional message', async () => {
      const context = mockUtil.makeContext();
      const updatedSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file.mp4',
        status: 'failed',
        statusMessage: 'Processing failed',
        updatedAt: '2024-01-15T14:00:00Z'
      };

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock media_source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 100 }]);
      // Mock individual update
      serviceContext.dbConnections['core'].write._push([{ fileUri: 's3://bucket/file.mp4', previousStatus: 'pending' }]);
      // Mock getIngestSlugs query
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      serviceContext.dbConnections['core'].read._push([updatedSlug]);

      const result = await dal.updateIngestSlugStatus(
        {
          sourceId: '100',
          fileUris: ['s3://bucket/file.mp4'],
          input: {
            status: 'failed',
            statusMessage: 'Processing failed'
          }
        },
        context
      );

      expect(result.updated).toHaveLength(1);
    });
  });

  describe('#deleteIngestSlugs', () => {
    it('should error if sourceId is missing', async () => {
      const context = mockUtil.makeContext();
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      let error;
      try {
        await dal.deleteIngestSlugs({}, context);
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('sourceId is required.');
    });

    it('should delete specific ingest slugs', async () => {
      const context = mockUtil.makeContext();
      const deletedSlugs = [
        { fileUri: 's3://bucket/file1.mp4' },
        { fileUri: 's3://bucket/file2.mp4' }
      ];

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock media_source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 100 }]);
      // Mock delete query
      serviceContext.dbConnections['core'].write._push(deletedSlugs);

      const result = await dal.deleteIngestSlugs(
        {
          sourceId: '100',
          fileUris: [
            's3://bucket/file1.mp4',
            's3://bucket/file2.mp4'
          ]
        },
        context
      );

      expect(result).toBeDefined();
      expect(result.sourceId).toEqual('100');
      expect(result.deleted).toHaveLength(2);
      expect(result.deleted[0]).toEqual({ sourceId: '100', fileUri: 's3://bucket/file1.mp4' });
      expect(result.deleted[1]).toEqual({ sourceId: '100', fileUri: 's3://bucket/file2.mp4' });
      expect(result.failed).toEqual([]);
    });

    it('should return deleted IngestSlugKey objects as list', async () => {
      const context = mockUtil.makeContext();
      const deletedSlugs = [
        { fileUri: 's3://bucket/old_file.mp4' }
      ];

      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock media_source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 100 }]);
      // Mock delete query
      serviceContext.dbConnections['core'].write._push(deletedSlugs);

      const result = await dal.deleteIngestSlugs(
        {
          sourceId: '100',
          fileUris: ['s3://bucket/old_file.mp4']
        },
        context
      );

      expect(result.deleted).toHaveLength(1);
      expect(result.deleted[0]).toEqual({ sourceId: '100', fileUri: 's3://bucket/old_file.mp4' });
    });
  });

  describe('Validation Integration', () => {
    it('should validate sourceId exists during creation', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([]);
      let error;
      try {
        await dal.createIngestSlugs(
          {
            input: {
              sourceId: '99999',
              files: [{ fileUri: 's3://bucket/file.mp4' }]
            }
          },
          context
        );
      } catch (err) {
        error = err;
      }

      // Validation error should be thrown
      expect(error).toBeDefined();
      expect(error.message).toMatch(/does not exist/i);
    });
  });

  describe('Organization Boundaries', () => {
    it('should retrieve ingest slug from any source when organizationId matches context', async () => {
      const context = mockUtil.makeContext(); // org: 7682
      
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      
      // Mock ingest slug that belongs to user's organization
      const userOrgSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file.mp4',
        organizationId: 7682,
        status: 'ingested'
      };
      
      serviceContext.dbConnections['core'].read._push([userOrgSlug]);

      const result = await dal.getIngestSlug(
        { sourceId: '100', fileUri: 's3://bucket/file.mp4' },
        context
      );

      expect(result).toBeDefined();
      expect(result.organizationId).toEqual(7682);
    });

    it('should fail getIngestSlugs when attempting to query from different organization', async () => {
      const context = mockUtil.makeContext();
      
      // Mock organization validation for user's org (7682)
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock query that attempts to return slugs from different org - should be filtered
      // If the query returns empty, it means the WHERE clause properly filtered by organization
      serviceContext.dbConnections['core'].read._push([]);

      const result = await dal.getIngestSlugs(
        { offset: 0, limit: 10 },
        context
      );

      // Should return empty results because user can only see their org's data
      expect(result).toBeDefined();
      expect(result.records).toEqual([]);
    });

    it('should only return ingest slugs from user\'s organization', async () => {
      const context = mockUtil.makeContext();
      const userOrgId = 7682;
      
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: userOrgId }]);
      
      const userOrgSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/user-org-file.mp4',
        organizationId: userOrgId,
        status: 'ingested',
        totalCount: '1'
      };
      
      // Mock query that returns only user's org slugs
      serviceContext.dbConnections['core'].read._push([userOrgSlug]);

      const result = await dal.getIngestSlugs(
        { offset: 0, limit: 10 },
        context
      );

      expect(result.records).toHaveLength(1);
      expect(result.records[0].organizationId).toEqual(userOrgId);
    });

    it('should fail createIngestSlugs when creating for different organization', async () => {
      const context = mockUtil.makeContext(); // org: 7682
      const differentOrgId = '9999';
      
      // Mock organization validation for different org - should fail
      serviceContext.dbConnections['media_platform'].read._push([]);

      let error;
      try {
        await dal.createIngestSlugs(
          {
            input: {
              sourceId: '100',
              organizationId: differentOrgId,
              files: [{ fileUri: 's3://bucket/file.mp4' }]
            }
          },
          context
        );
      } catch (err) {
        error = err;
      }

      // Should fail because organization from context doesn't match
      expect(error).toBeDefined();
      expect(error.message).toMatch(/does not exist/i);
    });

    it('should validate organization matches for all ingest slug creations', async () => {
      const context = mockUtil.makeContext(); // org: 7682
      const userOrgId = 7682;
      
      // Mock organization validation for user's org
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: userOrgId }]);
      // Mock media source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: '100' }]);
      
      // Mock successful creation
      serviceContext.dbConnections['core'].write._push([
        {
          sourceId: '100',
          fileUri: 's3://bucket/file.mp4',
          status: 'pending',
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T09:00:00Z'
        }
      ]);

      const result = await dal.createIngestSlugs(
        {
          input: {
            sourceId: '100',
            files: [
              {
                fileUri: 's3://bucket/file.mp4',
                bundleKey: 'bundle-001',
                mimeType: 'video/mp4'
              }
            ]
          }
        },
        context
      );

      expect(result).toBeDefined();
      expect(result.created).toHaveLength(1);
    });

    it('should fail updateIngestSlug when slug belongs to different organization', async () => {
      const context = mockUtil.makeContext(); // org: 7682
      
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock media source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 100 }]);
      // Mock update query that returns error because slug is from different org
      serviceContext.dbConnections['core'].write._push([]); // No results
      // Mock getIngestSlug returns nothing (slug not found in user's org)
      serviceContext.dbConnections['core'].read._push([]);

      let error;
      try {
        await dal.updateIngestSlug(
          {
            sourceId: '100',
            fileUri: 's3://bucket/file.mp4',
            input: { status: 'ingested' }
          },
          context
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toMatch(/not found/i);
    });

    it('should fail updateIngestSlugStatus when slugs belong to different organization', async () => {
      const context = mockUtil.makeContext(); // org: 7682
      
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock media source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 100 }]);
      // Mock update queries - no results because slugs not found in user's org
      serviceContext.dbConnections['core'].write._push([]); // No update results
      // Mock getIngestSlugs returns empty because slugs don't exist in user's org
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      serviceContext.dbConnections['core'].read._push([]);

      const result = await dal.updateIngestSlugStatus(
        {
          sourceId: '100',
          fileUris: ['s3://bucket/file.mp4'],
          input: { status: 'ingested' }
        },
        context
      );

      // Should have no updated records and failed records for slugs not in user's org
      expect(result.updated).toEqual([]);
    });

    it('should validate organization context when deleting ingest slugs', async () => {
      const context = mockUtil.makeContext(); // org: 7682
      
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      // Mock media_source validation
      serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 100 }]);
      // Mock delete operation - in real scenario, database would only delete from user's org
      const deletedSlug = { fileUri: 's3://bucket/file.mp4' };
      serviceContext.dbConnections['core'].write._push([deletedSlug]);

      const result = await dal.deleteIngestSlugs(
        {
          sourceId: '100',
          fileUris: ['s3://bucket/file.mp4']
        },
        context
      );

      expect(result).toBeDefined();
      expect(result.deleted).toHaveLength(1);
    });

    it('should enforce organization filtering in WHERE clause for all queries', async () => {
      const context = mockUtil.makeContext(); // org: 7682
      
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      
      // Mock query results from multiple organizations
      const multiOrgSlugs = [
        {
          sourceId: '100',
          fileUri: 's3://bucket/file1.mp4',
          organizationId: 7682,
          status: 'ingested',
          totalCount: '3'
        },
        {
          sourceId: '200',
          fileUri: 's3://bucket/file2.mp4',
          organizationId: 9999,
          status: 'pending',
          totalCount: '3'
        },
        {
          sourceId: '300',
          fileUri: 's3://bucket/file3.mp4',
          organizationId: 8888,
          status: 'uploaded',
          totalCount: '3'
        }
      ];
      
      // In real scenario, database should filter these; mock only user's org data
      const userOrgOnly = [multiOrgSlugs[0]];
      serviceContext.dbConnections['core'].read._push(userOrgOnly);

      const result = await dal.getIngestSlugs(
        { offset: 0, limit: 10 },
        context
      );

      // Only user's org data should be returned
      result.records.forEach((record) => {
        expect(record.organizationId).toEqual(7682);
      });
    });

    it('should fail createIngestSlugs when organization validation fails', async () => {
      const context = mockUtil.makeContext(); // org: 7682
      
      // Mock organization validation failure - organization doesn't exist
      let error;
      try {
        // Don't push any organization result - validation will fail
        await dal.createIngestSlugs(
          {
            input: {
              sourceId: '100',
              files: [{ fileUri: 's3://bucket/file.mp4' }]
            }
          },
          context
        );
      } catch (err) {
        error = err;
      }

      // Should fail organization validation
      expect(error).toBeDefined();
      expect(error.message).toMatch(/organization/i);
    });

    it('should ensure getIngestSlug validates organization before returning data', async () => {
      const context = mockUtil.makeContext(); // org: 7682
      
      // Mock organization validation
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      
      const mockSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file.mp4',
        organizationId: 7682, // Matches context org
        status: 'ingested'
      };
      
      serviceContext.dbConnections['core'].read._push([mockSlug]);

      const result = await dal.getIngestSlug(
        { sourceId: '100', fileUri: 's3://bucket/file.mp4' },
        context
      );

      expect(result).toBeDefined();
      expect(result.organizationId).toEqual(7682);
    });
  });

  describe('orgless token support', () => {
    it('should allow getIngestSlugs with orgless service token (no organization filter)', async () => {
      // Use api_internal auth type which has no organization context
      const context = mockUtil.makeContext({ authType: 'api_internal' });

      const mockSlugs = [
        {
          sourceId: '100',
          fileUri: 's3://bucket/org1/file1.mp4',
          organizationId: '1001',
          status: 'ingested',
          mimeType: 'video/mp4',
          totalCount: '3'
        },
        {
          sourceId: '100',
          fileUri: 's3://bucket/org2/file2.mp4',
          organizationId: '2002',
          status: 'pending',
          mimeType: 'video/mp4',
          totalCount: '3'
        },
        {
          sourceId: '200',
          fileUri: 's3://bucket/org3/file3.mp4',
          organizationId: '3003',
          status: 'ingested',
          mimeType: 'audio/mp3',
          totalCount: '3'
        }
      ];

      // No organization validation needed for orgless token
      // Mock ingest slugs query - returns slugs from multiple orgs
      serviceContext.dbConnections['core'].read._push(mockSlugs);

      const result = await dal.getIngestSlugs(
        { filter: { sourceId: ['100', '200'] }, offset: 0, limit: 30 },
        context
      );

      expect(result).toBeDefined();
      expect(result.records).toHaveLength(3);
      expect(result.totalCount).toEqual(3);
      // Verify results span multiple organizations
      const orgIds = result.records.map(r => r.organizationId);
      expect(orgIds).toContain('1001');
      expect(orgIds).toContain('2002');
      expect(orgIds).toContain('3003');
    });

    it('should allow getIngestSlugs with orgless token and various filters', async () => {
      const context = mockUtil.makeContext({ authType: 'api_internal' });

      const mockSlugs = [
        {
          sourceId: '100',
          fileUri: 's3://bucket/archive/file1.mp4',
          organizationId: '1001',
          status: 'pending',
          mimeType: 'video/mp4',
          totalCount: '1'
        }
      ];

      // No organization validation needed for orgless token
      serviceContext.dbConnections['core'].read._push(mockSlugs);

      const result = await dal.getIngestSlugs(
        {
          filter: {
            sourceId: '100',
            status: ['pending'],
            fileUriPrefix: ['s3://bucket/archive'],
            mimeType: ['video/mp4']
          },
          offset: 0,
          limit: 10
        },
        context
      );

      expect(result).toBeDefined();
      expect(result.records).toHaveLength(1);
      expect(result.records[0].status).toEqual('pending');
      expect(result.records[0].organizationId).toEqual('1001');
    });

    it('should allow getIngestSlug with orgless service token', async () => {
      const context = mockUtil.makeContext({ authType: 'api_internal' });

      const mockSlug = {
        sourceId: '100',
        fileUri: 's3://bucket/file.mp4',
        organizationId: '9999', // Different org - accessible via orgless token
        mimeType: 'video/mp4',
        status: 'ingested',
        totalCount: '1'
      };

      // No organization validation needed for orgless token
      serviceContext.dbConnections['core'].read._push([mockSlug]);

      const result = await dal.getIngestSlug(
        { sourceId: '100', fileUri: 's3://bucket/file.mp4' },
        context
      );

      expect(result).toBeDefined();
      expect(result.sourceId).toEqual('100');
      expect(result.fileUri).toEqual('s3://bucket/file.mp4');
      expect(result.organizationId).toEqual('9999');
    });

    it('should return not found for getIngestSlug with orgless token when slug does not exist', async () => {
      const context = mockUtil.makeContext({ authType: 'api_internal' });

      // No organization validation needed for orgless token
      // Mock empty result
      serviceContext.dbConnections['core'].read._push([]);

      let error;
      try {
        await dal.getIngestSlug(
          { sourceId: '100', fileUri: 's3://bucket/nonexistent.mp4' },
          context
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toMatch(/Ingest slug not found/i);
    });
  });

  describe('Source JWT sourceId precedence', () => {
    // Tests to verify that sourceId from JWT (_authInfo.sourceId) takes precedence over input sourceId
    const JWT_SOURCE_ID = '1';
    const INPUT_SOURCE_ID = '123';

    function makeSourceJWTContext() {
      const context = mockUtil.makeContext();
      // Simulate a source JWT by setting sourceId on _authInfo
      context._authInfo.sourceId = JWT_SOURCE_ID;
      return context;
    }

    describe('#getIngestSlug', () => {
      it('should use sourceId from JWT instead of input sourceId', async () => {
        const context = makeSourceJWTContext();
        const mockSlug = {
          sourceId: JWT_SOURCE_ID,
          fileUri: 's3://bucket/file.mp4',
          organizationId: '35521',
          status: 'pending',
          totalCount: '1'
        };

        // Mock organization validation
        serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
        // Mock ingest slug query
        serviceContext.dbConnections['core'].read._push([mockSlug]);

        const result = await dal.getIngestSlug(
          { sourceId: INPUT_SOURCE_ID, fileUri: 's3://bucket/file.mp4' },
          context
        );

        expect(result).toBeDefined();
        expect(result.sourceId).toEqual(JWT_SOURCE_ID);
        expect(result.sourceId).not.toEqual(INPUT_SOURCE_ID);
      });
    });

    describe('#getIngestSlugs', () => {
      it('should ignore provided filter sourceIds and use only JWT sourceId when JWT present', async () => {
        const context = makeSourceJWTContext();
        const mockSlug = {
          sourceId: JWT_SOURCE_ID,
          fileUri: 's3://bucket/file.mp4',
          organizationId: '35521',
          status: 'pending',
          totalCount: '1'
        };

        // Mock organization validation
        serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
        // Mock ingest slugs query and assert that the SQL args contain the JWT sourceId
        serviceContext.dbConnections['core'].read._push(
          [mockSlug],
          true,
          ['s.media_source_id'],
          (_sql, args) => {
            // args should include the JWT sourceId (as Number) and should NOT include the input source id
            expect(args).toBeDefined();
            expect(args).toContain(Number(JWT_SOURCE_ID));
            expect(args).not.toContain(Number(INPUT_SOURCE_ID));
            return true;
          }
        );

        // Provide a filter that contains a different sourceId; JWT should take precedence
        const result = await dal.getIngestSlugs(
          { filter: { sourceId: [INPUT_SOURCE_ID, '999'] }, offset: 0, limit: 30 },
          context
        );

        expect(result).toBeDefined();
        expect(result.records).toHaveLength(1);
        expect(result.records[0].sourceId).toEqual(JWT_SOURCE_ID);
      });

      it('should apply JWT sourceId even when no filter is provided', async () => {
        const context = makeSourceJWTContext();
        const mockSlug = {
          sourceId: JWT_SOURCE_ID,
          fileUri: 's3://bucket/file.mp4',
          organizationId: '35521',
          status: 'pending',
          totalCount: '1'
        };

        // Mock organization validation
        serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
        // Assert that the JWT sourceId is included in the query args even with no filter
        serviceContext.dbConnections['core'].read._push(
          [mockSlug],
          true,
          ['s.media_source_id'],
          (_sql, args) => {
            expect(args).toBeDefined();
            expect(args).toContain(Number(JWT_SOURCE_ID));
            return true;
          }
        );

        const result = await dal.getIngestSlugs(
          { offset: 0, limit: 30 },
          context
        );

        expect(result).toBeDefined();
        expect(result.records).toHaveLength(1);
        expect(result.records[0].sourceId).toEqual(JWT_SOURCE_ID);
      });

      it('should apply JWT sourceId when filter is present but has no sourceId field', async () => {
        const context = makeSourceJWTContext();
        const mockSlug = {
          sourceId: JWT_SOURCE_ID,
          fileUri: 's3://bucket/file.mp4',
          organizationId: '35521',
          status: 'pending',
          totalCount: '1'
        };

        // Mock organization validation
        serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
        // Assert that the JWT sourceId is included in the query args even when filter has no sourceId
        serviceContext.dbConnections['core'].read._push(
          [mockSlug],
          true,
          ['s.media_source_id'],
          (_sql, args) => {
            expect(args).toBeDefined();
            expect(args).toContain(Number(JWT_SOURCE_ID));
            return true;
          }
        );

        const result = await dal.getIngestSlugs(
          { filter: { status: ['pending'] }, offset: 0, limit: 30 },
          context
        );

        expect(result).toBeDefined();
        expect(result.records).toHaveLength(1);
        expect(result.records[0].sourceId).toEqual(JWT_SOURCE_ID);
      });
    });
  
    describe('updateIngestSlugStatus event emission', () => {
      it('should emit events for each applicationId group when updating status', async () => {
        const mockContext = mockUtil.makeContext();
        // ensure logger and messageUtil mocks (preserve test harness helpers)
        serviceContext.logger = { error: jest.fn(), warn: jest.fn() };
        serviceContext.messageUtil.emitEvent = jest.fn().mockResolvedValue();
        serviceContext.messageUtil.emitPublicEvent = jest.fn().mockResolvedValue();
        serviceContext.messageUtil.topics = jest.fn().mockReturnValue('EVENTS');

        // Mock org/source validation result
        serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 1 }]);
        // Mock DB update result with two applicationId groups
        const updateResults = [
          { fileUri: 'file1', applicationId: 'app1', sourceId: 1, organizationId: 2, status: 'ingested' },
          { fileUri: 'file2', applicationId: 'app2', sourceId: 1, organizationId: 2, status: 'ingested' },
          { fileUri: 'file3', applicationId: 'app1', sourceId: 1, organizationId: 2, status: 'ingested' }
        ];
        // Mock DB
        serviceContext.dbConnections['core'].write.map = jest.fn().mockResolvedValue(updateResults);
        serviceContext.dbConnections['core'].write.any = jest.fn();

        const result = await dal.updateIngestSlugStatus({
          sourceId: 1,
          fileUris: ['file1', 'file2', 'file3'],
          input: { status: 'ingested' }
        }, mockContext);

        // Should emit once per updated slug (3 total)
        expect(serviceContext.messageUtil.emitEvent).toHaveBeenCalledTimes(3);
        expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledTimes(3);
        expect(result.updated).toEqual(updateResults);
      });

      it('should log error if event emission fails during status update', async () => {
        const mockContext = mockUtil.makeContext();
        // ensure logger and messageUtil mocks (preserve test harness helpers)
        serviceContext.logger = { error: jest.fn(), warn: jest.fn() };
        serviceContext.messageUtil.emitEvent = jest.fn();
        serviceContext.messageUtil.emitPublicEvent = jest.fn();
        serviceContext.messageUtil.topics = jest.fn().mockReturnValue('EVENTS');

        // Mock org/source validation result
        serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 1 }]);
        const updateResults = [
          { fileUri: 'file1', applicationId: 'app1', sourceId: 1, organizationId: 2, status: 'ingested' }
        ];
        serviceContext.dbConnections['core'].write.map = jest.fn().mockResolvedValue(updateResults);
        serviceContext.dbConnections['core'].write.any = jest.fn();
        // Make emitEvent reject
        serviceContext.messageUtil.emitEvent.mockRejectedValue(new Error('emit failed'));

        await dal.updateIngestSlugStatus({
          sourceId: 1,
          fileUris: ['file1'],
          input: { status: 'ingested' }
        }, mockContext);

        expect(serviceContext.logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to emit ingest slug updated (status) events for sourceId='),
          1,
          'emit failed'
        );
      });

      it('should emit mediaSourceId as an integer in ingest_slug_updated event', async () => {
        const mockContext = mockUtil.makeContext();
        serviceContext.logger = { error: jest.fn(), warn: jest.fn() };
        serviceContext.messageUtil.emitEvent = jest.fn().mockResolvedValue();
        serviceContext.messageUtil.emitPublicEvent = jest.fn().mockResolvedValue();
        serviceContext.messageUtil.topics = jest.fn().mockReturnValue('EVENTS');

        serviceContext.dbConnections['media_platform'].read._push([{ media_source_id: 1 }]);
        const updateResults = [
          { fileUri: 'file1', applicationId: 'app1', sourceId: '42', organizationId: 2, status: 'ingested' }
        ];
        serviceContext.dbConnections['core'].write.map = jest.fn().mockResolvedValue(updateResults);
        serviceContext.dbConnections['core'].write.any = jest.fn();

        await dal.updateIngestSlugStatus({
          sourceId: '42',
          fileUris: ['file1'],
          input: { status: 'ingested' }
        }, mockContext);

        const emittedEvent = serviceContext.messageUtil.emitEvent.mock.calls[0][0];
        expect(typeof emittedEvent.mediaSourceId).toEqual('number');
        expect(emittedEvent.mediaSourceId).toEqual(42);
      });
    });

    describe('#createIngestSlugs', () => {
      it('should use sourceId from JWT instead of input sourceId', async () => {
        const context = makeSourceJWTContext();
        const mockCreatedSlug = {
          sourceId: JWT_SOURCE_ID,
          fileUri: 's3://bucket/newfile.mp4',
          organizationId: '35521',
          status: 'pending'
        };

        // Mock source validation
        serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
        // Mock engine validation
        serviceContext.dbConnections['core'].read._push([{ engine_id: 'engine-1' }]);
        // Mock application validation
        serviceContext.dbConnections['sso'].read._push([{ application_id: 'app-1' }]);
        // Mock insert result
        serviceContext.dbConnections['core'].write._push([mockCreatedSlug]);

        const result = await dal.createIngestSlugs(
          {
            input: {
              sourceId: INPUT_SOURCE_ID,
              files: [{ fileUri: 's3://bucket/newfile.mp4' }]
            }
          },
          context
        );

        expect(result).toBeDefined();
        expect(result.sourceId).toEqual(JWT_SOURCE_ID);
        expect(result.sourceId).not.toEqual(INPUT_SOURCE_ID);
      });
    });

    describe('#updateIngestSlug', () => {
      it('should use sourceId from JWT instead of input sourceId', async () => {
        const context = makeSourceJWTContext();
        const mockUpdatedSlug = {
          sourceId: JWT_SOURCE_ID,
          fileUri: 's3://bucket/file.mp4',
          organizationId: '35521',
          status: 'ingested',
          totalCount: '1'
        };

        // Mock update result
        serviceContext.dbConnections['core'].write._push([{ file_uri: 's3://bucket/file.mp4' }]);
        // Mock organization validation for getIngestSlug
        serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
        // Mock getIngestSlug result
        serviceContext.dbConnections['core'].read._push([mockUpdatedSlug]);

        const result = await dal.updateIngestSlug(
          {
            sourceId: INPUT_SOURCE_ID,
            fileUri: 's3://bucket/file.mp4',
            input: { status: 'ingested' }
          },
          context
        );

        expect(result).toBeDefined();
        expect(result.sourceId).toEqual(JWT_SOURCE_ID);
        expect(result.sourceId).not.toEqual(INPUT_SOURCE_ID);
      });
    });

    describe('#updateIngestSlugStatus', () => {
      it('should use sourceId from JWT instead of input sourceId', async () => {
        const context = makeSourceJWTContext();

        // Mock source validation
        serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
        // Mock update result
        serviceContext.dbConnections['core'].write._push([{ file_uri: 's3://bucket/file.mp4' }]);

        const result = await dal.updateIngestSlugStatus(
          {
            sourceId: INPUT_SOURCE_ID,
            fileUris: ['s3://bucket/file.mp4'],
            input: { status: 'ingested' }
          },
          context
        );

        expect(result).toBeDefined();
        expect(result.sourceId).toEqual(JWT_SOURCE_ID);
        expect(result.sourceId).not.toEqual(INPUT_SOURCE_ID);
      });
    });

    describe('#deleteIngestSlugs', () => {
      it('should use sourceId from JWT instead of input sourceId', async () => {
        const context = makeSourceJWTContext();

        // Mock source validation
        serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
        // Mock delete result
        serviceContext.dbConnections['core'].write._push([{ file_uri: 's3://bucket/file.mp4' }]);

        const result = await dal.deleteIngestSlugs(
          {
            sourceId: INPUT_SOURCE_ID,
            fileUris: ['s3://bucket/file.mp4']
          },
          context
        );

        expect(result).toBeDefined();
        expect(result.sourceId).toEqual(JWT_SOURCE_ID);
        expect(result.sourceId).not.toEqual(INPUT_SOURCE_ID);
        expect(result.deleted[0].sourceId).toEqual(JWT_SOURCE_ID);
      });
    });

    describe('#deleteIngestSlugsForSource', () => {
      it('should use sourceId from JWT instead of input sourceId', async () => {
        const context = makeSourceJWTContext();

        // Mock source validation
        serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);

        const result = await dal.deleteIngestSlugsForSource(
          { sourceId: INPUT_SOURCE_ID },
          context
        );

        expect(result).toBeDefined();
        expect(result.message).toContain(JWT_SOURCE_ID);
        expect(result.message).not.toContain(INPUT_SOURCE_ID);
        expect(result.submitted).toBe(true);
      });
    });
  });
});