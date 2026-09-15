const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
let dal = require('./processingDeliverables.js')(
  serviceContext,
  serviceContext.config
);

describe('processingDeliverables.js', function () {
  describe('#require', function () {
    it('should load module', async function () {
      expect(typeof dal).toEqual('object');
      expect(typeof dal.getProject).toEqual('function');
      expect(typeof dal.getProjects).toEqual('function');
      expect(typeof dal.getDeliverable).toEqual('function');
      expect(typeof dal.getDeliverables).toEqual('function');
      expect(typeof dal.getProjectSummary).toEqual('function');
      expect(typeof dal.createProject).toEqual('function');
      expect(typeof dal.deleteProject).toEqual('function');
      expect(typeof dal.createDeliverable).toEqual('function');
      expect(typeof dal.cancelDeliverable).toEqual('function');
    });
  });

  describe('#getProject', function () {
    it('should get processing project', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_project_id: projectId,
            organization_id: '7682',
            application_id: 'app-123',
            name: 'Test Project 1',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            total_incomplete: 5,
            total_failed: 2,
            total_complete: 10,
            total_canceled: 1,
            total: 18
          }
        ],
        false
      );

      const res = await dal.getProject(
        {
          ...mockUtil.makeContext()
        },
        { id: projectId }
      );
      expect(res.id).toEqual(projectId);
      expect(res.name).toEqual('Test Project 1');
    });

    it('should throw NotFound when project not found', async function () {
      serviceContext.dbConnections['core'].read._push([], false);

      let err;
      try {
        await dal.getProject(
          {
            ...mockUtil.makeContext()
          },
          { id: 'non-existent-id' }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain('Processing project not found');
    });
  });

  describe('#getProjects', function () {
    it('should get processing projects', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_project_id: '83709857-ed1b-44c6-a5ad-001223fa1e1f',
            organization_id: '7682',
            application_id: 'app-123',
            name: 'Test Project 1',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          },
          {
            processing_project_id: '93709857-ed1b-44c6-a5ad-001223fa1e1f',
            organization_id: '7682',
            application_id: 'app-456',
            name: 'Test Project 2',
            created_at: '2023-01-02T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z'
          }
        ],
        false
      );

      const res = await dal.getProjects(
        {
          ...mockUtil.makeContext()
        },
        {}
      );
      expect(res.records.length).toEqual(2);
      expect(res.records[0].name).toEqual('Test Project 1');
    });
  });

  describe('#getDeliverable', function () {
    it('should get processing deliverable by id', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const deliverableId = 'del-1';
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_deliverable_id: deliverableId,
            processing_project_id: projectId,
            recording_id: 'rec-1',
            asset_type: 'transcript',
            engine_id: 'engine-1',
            schema_id: 'schema-1',
            engine_category_id: 'cat-1',
            status: 'complete',
            status_message: 'Success',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          }
        ],
        false
      );

      const res = await dal.getDeliverable(
        {
          ...mockUtil.makeContext()
        },
        { id: deliverableId, processingProjectId: projectId }
      );
      expect(res.id).toEqual(deliverableId);
      expect(res.projectId).toEqual(projectId);
      expect(res.status).toEqual('complete');
      expect(res.assetType).toEqual('transcript');
      expect(res.engineId).toEqual('engine-1');
      expect(res.schemaId).toEqual('schema-1');
      expect(res.statusMessage).toEqual('Success');
    });

    it('should throw NotFound when deliverable not found', async function () {
      serviceContext.dbConnections['core'].read._push([], false);

      let err;
      try {
        await dal.getDeliverable(
          {
            ...mockUtil.makeContext()
          },
          {
            id: 'non-existent-id',
            processingProjectId: 'project-id'
          }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain('Processing deliverable not found');
    });

    it('should throw InvalidInput when id is missing', async function () {
      let err;
      try {
        await dal.getDeliverable(
          {
            ...mockUtil.makeContext()
          },
          { processingProjectId: 'project-id' }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain('id is required');
    });

    it('should throw InvalidInput when processingProjectId is missing', async function () {
      let err;
      try {
        await dal.getDeliverable(
          {
            ...mockUtil.makeContext()
          },
          { id: 'deliverable-id' }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain('processingProjectId is required');
    });
  });

  describe('#getDeliverables', function () {
    it('should get processing deliverables', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_deliverable_id: 'del-1',
            processing_project_id: projectId,
            recording_id: 'rec-1',
            asset_type: 'transcript',
            engine_id: 'engine-1',
            schema_id: 'schema-1',
            engine_category_id: 'cat-1',
            status: 'complete',
            status_message: 'Success',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          }
        ],
        false
      );

      const res = await dal.getDeliverables(
        {
          ...mockUtil.makeContext()
        },
        { processingProjectId: projectId }
      );
      expect(res.records.length).toEqual(1);
      expect(res.records[0].status).toEqual('complete');
    });

    it('should filter deliverables by tdoIds', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_deliverable_id: 'del-1',
            processing_project_id: projectId,
            recording_id: 'rec-1',
            asset_type: 'transcript',
            engine_id: 'engine-1',
            schema_id: 'schema-1',
            engine_category_id: 'cat-1',
            status: 'complete',
            status_message: 'Success',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          }
        ],
        false
      );

      const res = await dal.getDeliverables(
        {
          ...mockUtil.makeContext()
        },
        {
          processingProjectId: projectId,
          filter: { tdoIds: ['rec-1'] }
        }
      );
      expect(res.records.length).toEqual(1);
      expect(res.records[0].tdoId).toEqual('rec-1');
    });

    it('should filter deliverables by status', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_deliverable_id: 'del-1',
            processing_project_id: projectId,
            recording_id: 'rec-1',
            asset_type: 'transcript',
            engine_id: 'engine-1',
            schema_id: 'schema-1',
            engine_category_id: 'cat-1',
            status: 'complete',
            status_message: 'Success',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          }
        ],
        false
      );

      const res = await dal.getDeliverables(
        {
          ...mockUtil.makeContext()
        },
        {
          processingProjectId: projectId,
          filter: { status: 'complete' }
        }
      );
      expect(res.records.length).toEqual(1);
      expect(res.records[0].status).toEqual('complete');
    });

    it('should filter deliverables by both tdoIds and status', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_deliverable_id: 'del-1',
            processing_project_id: projectId,
            recording_id: 'rec-1',
            asset_type: 'transcript',
            engine_id: 'engine-1',
            schema_id: 'schema-1',
            engine_category_id: 'cat-1',
            status: 'complete',
            status_message: 'Success',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          }
        ],
        false
      );

      const res = await dal.getDeliverables(
        {
          ...mockUtil.makeContext()
        },
        {
          processingProjectId: projectId,
          filter: { tdoIds: ['rec-1'], status: 'complete' }
        }
      );
      expect(res.records.length).toEqual(1);
      expect(res.records[0].tdoId).toEqual('rec-1');
      expect(res.records[0].status).toEqual('complete');
    });
  });

  describe('#getProjectSummary', function () {
    it('should get project summary', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      serviceContext.dbConnections['core'].read._push(
        [
          {
            total: 20,
            total_incomplete: 5,
            total_complete: 10,
            total_canceled: 5
          }
        ],
        false
      );

      const res = await dal.getProjectSummary(
        {
          ...mockUtil.makeContext()
        },
        projectId
      );
      expect(res.total).toEqual(20);
      expect(res.totalIncomplete).toEqual(5);
      expect(res.totalComplete).toEqual(10);
      expect(res.totalCanceled).toEqual(5);
    });

    it('should return default values when no summary found', async function () {
      const projectId = 'non-existent-id';
      serviceContext.dbConnections['core'].read._push([], false);

      const res = await dal.getProjectSummary(
        {
          ...mockUtil.makeContext()
        },
        projectId
      );
      expect(res.total).toEqual(0);
      expect(res.totalIncomplete).toEqual(0);
      expect(res.totalComplete).toEqual(0);
      expect(res.totalCanceled).toEqual(0);
    });
  });

  describe('#createProject', function () {
    it('should create processing project', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const project = {
        name: 'New Test Project',
        applicationId: 'app-123'
      };

      serviceContext.dbConnections['core'].write._push(
        [
          {
            processing_project_id: projectId,
            organization_id: '7682',
            application_id: 'app-123',
            name: 'New Test Project',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          }
        ],
        false
      );

      let res, err;

      try {
        const context = mockUtil.makeContext();
        context._authInfo.userId = 'user-123';
        res = await dal.createProject(context, { input: project });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res.id).toEqual(projectId);
      expect(res.name).toEqual('New Test Project');
    });

    it('should create processing project without applicationId', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const project = {
        name: 'New Test Project'
      };

      serviceContext.dbConnections['core'].write._push(
        [
          {
            processing_project_id: projectId,
            organization_id: '7682',
            application_id: null,
            name: 'New Test Project',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          }
        ],
        false
      );

      let res, err;

      try {
        const context = mockUtil.makeContext();
        context._authInfo.userId = 'user-123';
        res = await dal.createProject(context, { input: project });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res.id).toEqual(projectId);
      expect(res.name).toEqual('New Test Project');
    });

    it('should throw error when name is missing', async function () {
      const project = {
        applicationId: 'app-123'
      };

      let res, err;

      try {
        res = await dal.createProject(
          {
            ...mockUtil.makeContext()
          },
          { input: project }
        );
      } catch (e) {
        err = e;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain('Name is required');
    });

    it('should throw error when name is empty', async function () {
      const project = {
        name: '   ',
        applicationId: 'app-123'
      };

      let res, err;

      try {
        res = await dal.createProject(
          {
            ...mockUtil.makeContext()
          },
          { input: project }
        );
      } catch (e) {
        err = e;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain('Name is required');
    });

    it('should handle unique constraint violation', async function () {
      const project = {
        name: 'Duplicate Project',
        applicationId: 'app-123'
      };

      const uniqueError = new Error('duplicate key value');
      uniqueError.code = '23505';

      serviceContext.dbConnections['core'].write._push(uniqueError, false);

      let res, err;

      try {
        res = await dal.createProject(
          {
            ...mockUtil.makeContext()
          },
          { input: project }
        );
      } catch (e) {
        err = e;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain('already exists');
    });
  });

  describe('#deleteProject', function () {
    it('should delete processing project', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';

      // getProject query
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_project_id: projectId,
            organization_id: '7682',
            application_id: 'app-123',
            name: 'Test Project',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            total_incomplete: 0,
            total_failed: 0,
            total_complete: 0,
            total_canceled: 0,
            total: 0
          }
        ],
        false
      );

      // Count query
      serviceContext.dbConnections['core'].read._push(
        [{ deliverable_count: '0' }],
        false
      );

      // Delete query
      serviceContext.dbConnections['core'].write._push(
        [{ processing_project_id: projectId }],
        false
      );

      const res = await dal.deleteProject(
        {
          ...mockUtil.makeContext()
        },
        { id: projectId }
      );
      expect(res.id).toEqual(projectId);
      expect(res.message).toContain('deleted');
    });

    it('should throw error when project not found', async function () {
      const projectId = 'non-existent-id';

      // getProject query - returns empty
      serviceContext.dbConnections['core'].read._push([], false);

      let res, err;

      try {
        res = await dal.deleteProject(
          {
            ...mockUtil.makeContext()
          },
          { id: projectId }
        );
      } catch (e) {
        err = e;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain('Processing project not found');
    });

    it('should throw error when deliverable count exceeds limit', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';

      // getProject query
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_project_id: projectId,
            organization_id: '7682',
            application_id: 'app-123',
            name: 'Test Project',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            total_incomplete: 0,
            total_failed: 0,
            total_complete: 0,
            total_canceled: 0,
            total: 0
          }
        ],
        false
      );

      // Count query - returns count > 1000
      serviceContext.dbConnections['core'].read._push(
        [{ deliverable_count: '1500' }],
        false
      );

      let res, err;

      try {
        res = await dal.deleteProject(
          {
            ...mockUtil.makeContext()
          },
          { id: projectId }
        );
      } catch (e) {
        err = e;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain('Cannot delete processing project');
      expect(err.message).toContain('1500');
    });

    it('should allow deletion when deliverable count is exactly 1000', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';

      // getProject query
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_project_id: projectId,
            organization_id: '7682',
            application_id: 'app-123',
            name: 'Test Project',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            total_incomplete: 0,
            total_failed: 0,
            total_complete: 0,
            total_canceled: 0,
            total: 0
          }
        ],
        false
      );

      // Count query - returns count = 1000
      serviceContext.dbConnections['core'].read._push(
        [{ deliverable_count: '1000' }],
        false
      );

      // Delete query
      serviceContext.dbConnections['core'].write._push(
        [{ processing_project_id: projectId }],
        false
      );

      let res, err;

      try {
        res = await dal.deleteProject(
          {
            ...mockUtil.makeContext()
          },
          { id: projectId }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res.id).toEqual(projectId);
    });
  });

  describe('#createDeliverable', function () {
    it('should create processing deliverable', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const deliverableId = 'del-1';
      const tdoId = 'tdo-123';
      const engineId = 'engine-123';
      const schemaId = 'schema-123';
      const engineCategoryId = 'cat-123';

      // Mock getProject
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_project_id: projectId,
            organization_id: '7682',
            name: 'Test Project',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          }
        ],
        false
      );

      // Mock getTDO
      serviceContext.dal.tdo.getTDO = jest.fn().mockResolvedValue({
        id: tdoId,
        name: 'Test TDO'
      });

      // Mock getEngine
      serviceContext.dal.engine.getEngine = jest.fn().mockResolvedValue({
        id: engineId,
        name: 'Test Engine'
      });

      // Mock getSchema
      serviceContext.dal.structuredData.getSchema = jest
        .fn()
        .mockResolvedValue({
          id: schemaId,
          name: 'Test Schema'
        });

      // Mock getEngineCategory
      serviceContext.dal.engineCategory.getEngineCategory = jest
        .fn()
        .mockResolvedValue({
          id: engineCategoryId,
          name: 'Test Category'
        });

      // Mock insert
      serviceContext.dbConnections['core'].write._push(
        [
          {
            processing_deliverable_id: deliverableId,
            processing_project_id: projectId,
            recording_id: tdoId,
            asset_type: 'transcript',
            engine_id: engineId,
            schema_id: schemaId,
            engine_category_id: engineCategoryId,
            status: 'incomplete',
            status_message: null,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          }
        ],
        false
      );

      const context = mockUtil.makeContext();
      context._authInfo.userId = 'user-123';

      const res = await dal.createDeliverable(context, {
        input: {
          projectId: projectId,
          tdoId: tdoId,
          requirements: [
            { deliverableType: 'AssetType', value: 'transcript' },
            { deliverableType: 'Engine', value: engineId },
            { deliverableType: 'Schema', value: schemaId },
            { deliverableType: 'EngineCategory', value: engineCategoryId }
          ]
        }
      });

      expect(res.id).toEqual(deliverableId);
      expect(res.projectId).toEqual(projectId);
      expect(res.tdoId).toEqual(tdoId);
    });

    it('should throw error when project not found', async function () {
      serviceContext.dbConnections['core'].read._push([], false);

      let err;
      try {
        await dal.createDeliverable(
          {
            ...mockUtil.makeContext()
          },
          {
            input: {
              projectId: 'non-existent',
              tdoId: 'tdo-123',
              requirements: []
            }
          }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain('Processing project not found');
    });

    it('should throw error when tdoId is missing', async function () {
      let err;
      try {
        await dal.createDeliverable(
          {
            ...mockUtil.makeContext()
          },
          {
            input: {
              projectId: 'project-123',
              requirements: []
            }
          }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain('tdoId is required');
    });

    it('should throw error when requirements is missing', async function () {
      const projectId = 'project-123';

      // Mock getProject
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_project_id: projectId,
            organization_id: '7682',
            name: 'Test Project',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          }
        ],
        false
      );

      // Mock getTDO
      serviceContext.dal.tdo.getTDO = jest.fn().mockResolvedValue({
        id: 'tdo-123',
        name: 'Test TDO'
      });

      let err;
      try {
        await dal.createDeliverable(
          {
            ...mockUtil.makeContext()
          },
          {
            input: {
              projectId: projectId,
              tdoId: 'tdo-123'
            }
          }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain('requirements array is required');
    });

    it('should throw error for unknown deliverable type', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';

      // Mock getProject
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_project_id: projectId,
            organization_id: '7682',
            name: 'Test Project',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
          }
        ],
        false
      );

      // Mock getTDO
      serviceContext.dal.tdo.getTDO = jest.fn().mockResolvedValue({
        id: 'tdo-123',
        name: 'Test TDO'
      });

      let err;
      try {
        await dal.createDeliverable(
          {
            ...mockUtil.makeContext()
          },
          {
            input: {
              projectId: projectId,
              tdoId: 'tdo-123',
              requirements: [{ deliverableType: 'UnknownType', value: 'value' }]
            }
          }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain('Unknown deliverable type');
    });
  });

  describe('#cancelDeliverable', function () {
    it('should cancel processing deliverable', async function () {
      const deliverableId = 'del-1';
      const projectId = 'project-123';
      const tdoId = 'tdo-123';

      // Mock verify query
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_deliverable_id: deliverableId,
            processing_project_id: projectId,
            recording_id: tdoId,
            status: 'incomplete'
          }
        ],
        false
      );

      // Mock update
      serviceContext.dbConnections['core'].write._push(
        [
          {
            processing_deliverable_id: deliverableId,
            processing_project_id: projectId,
            recording_id: tdoId,
            asset_type: 'transcript',
            engine_id: 'engine-123',
            schema_id: 'schema-123',
            engine_category_id: 'cat-123',
            status: 'canceled',
            status_message: null,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z'
          }
        ],
        false
      );

      const context = mockUtil.makeContext();
      context._authInfo.userId = 'user-123';

      const res = await dal.cancelDeliverable(context, {
        id: deliverableId,
        projectId: projectId
      });

      expect(res.id).toEqual(deliverableId);
      expect(res.status).toEqual('canceled');
    });

    it('should throw error when deliverable not found', async function () {
      serviceContext.dbConnections['core'].read._push([], false);

      let err;
      try {
        await dal.cancelDeliverable(
          {
            ...mockUtil.makeContext()
          },
          { id: 'non-existent', projectId: 'project-123' }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain('Processing deliverable not found');
    });

    it('should throw error when id is missing', async function () {
      let err;
      try {
        await dal.cancelDeliverable(
          {
            ...mockUtil.makeContext()
          },
          {}
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain('id is required');
    });

    it('should throw error when projectId is missing', async function () {
      let err;
      try {
        await dal.cancelDeliverable(
          {
            ...mockUtil.makeContext()
          },
          { id: 'del-1' }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain('projectId is required');
    });

    it('should store message in status_message when provided', async function () {
      const deliverableId = 'del-1';
      const projectId = 'project-123';
      const tdoId = 'tdo-123';
      const cancelMessage = 'Cancelled by user request';

      // Mock verify query
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_deliverable_id: deliverableId,
            processing_project_id: projectId,
            recording_id: tdoId,
            status: 'incomplete'
          }
        ],
        false
      );

      // Mock update with message
      serviceContext.dbConnections['core'].write._push(
        [
          {
            processing_deliverable_id: deliverableId,
            processing_project_id: projectId,
            recording_id: tdoId,
            asset_type: 'transcript',
            engine_id: 'engine-123',
            schema_id: 'schema-123',
            engine_category_id: 'cat-123',
            status: 'canceled',
            status_message: cancelMessage,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z'
          }
        ],
        false
      );

      // Mock emitPublicEvent
      serviceContext.messageUtil.emitPublicEvent = jest
        .fn()
        .mockResolvedValue({});

      const context = mockUtil.makeContext();
      context._authInfo.userId = 'user-123';

      const res = await dal.cancelDeliverable(context, {
        id: deliverableId,
        projectId: projectId,
        message: cancelMessage
      });

      expect(res.id).toEqual(deliverableId);
      expect(res.status).toEqual('canceled');
      expect(res.statusMessage).toEqual(cancelMessage);
      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalled();
    });

    it('should throw error when deliverable is already complete', async function () {
      const deliverableId = 'del-1';
      const projectId = 'project-123';
      const tdoId = 'tdo-123';

      // Mock verify query
      serviceContext.dbConnections['core'].read._push(
        [
          {
            processing_deliverable_id: deliverableId,
            processing_project_id: projectId,
            recording_id: tdoId,
            status: 'complete'
          }
        ],
        false
      );

      let err;
      try {
        await dal.cancelDeliverable(
          {
            ...mockUtil.makeContext()
          },
          { id: deliverableId, projectId: projectId }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toContain(
        'Cancel processing deliverable is available for incomplete only'
      );
      expect(err.message).toContain('complete');
    });
  });
});
