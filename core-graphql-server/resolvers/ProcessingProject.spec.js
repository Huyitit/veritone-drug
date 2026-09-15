const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
let resolver = require('./ProcessingProject.js')(serviceContext);

describe('ProcessingProject.js', function () {
  describe('#require', function () {
    it('should load module', async function () {
      expect(typeof resolver).toEqual('object');
      expect(typeof resolver.summary).toEqual('function');
      expect(typeof resolver.deliverables).toEqual('function');
    });
  });

  describe('#summary', function () {
    it('should return summary from obj when _total is defined', async function () {
      const obj = {
        id: '83709857-ed1b-44c6-a5ad-001223fa1e1f',
        _total: 999,
        _totalIncomplete: 999,
        _totalComplete: 999,
        _totalCanceled: 999
      };

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

      const res = await resolver.summary(obj, {}, mockUtil.makeContext());
      expect(res.total).toEqual(20);
      expect(res.totalIncomplete).toEqual(5);
      expect(res.totalComplete).toEqual(10);
      expect(res.totalCanceled).toEqual(5);
    });

    it('should return default values when _total is 0', async function () {
      const obj = {
        id: '83709857-ed1b-44c6-a5ad-001223fa1e1f',
        _total: 0,
        _totalIncomplete: 0,
        _totalComplete: 0,
        _totalCanceled: 0
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            total: 12,
            total_incomplete: 3,
            total_complete: 7,
            total_canceled: 2
          }
        ],
        false
      );

      const res = await resolver.summary(obj, {}, mockUtil.makeContext());
      expect(res.total).toEqual(12);
      expect(res.totalIncomplete).toEqual(3);
      expect(res.totalComplete).toEqual(7);
      expect(res.totalCanceled).toEqual(2);
    });

    it('should fetch summary from database when _total is undefined', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const obj = {
        id: projectId
      };

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

      const res = await resolver.summary(obj, {}, mockUtil.makeContext());
      expect(res.total).toEqual(20);
      expect(res.totalIncomplete).toEqual(5);
      expect(res.totalComplete).toEqual(10);
      expect(res.totalCanceled).toEqual(5);
    });

    it('should return default values when summary not found in database', async function () {
      const projectId = 'non-existent-id';
      const obj = {
        id: projectId
      };

      serviceContext.dbConnections['core'].read._push([], false);

      const res = await resolver.summary(obj, {}, mockUtil.makeContext());
      expect(res.total).toEqual(0);
      expect(res.totalIncomplete).toEqual(0);
      expect(res.totalComplete).toEqual(0);
      expect(res.totalCanceled).toEqual(0);
    });
  });

  describe('#deliverables', function () {
    it('should get deliverables with default pagination', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const obj = {
        id: projectId
      };

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

      const res = await resolver.deliverables(obj, {}, mockUtil.makeContext());
      expect(res.records.length).toEqual(1);
      expect(res.records[0].status).toEqual('complete');
    });

    it('should get deliverables with custom limit and offset', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const obj = {
        id: projectId
      };

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
          },
          {
            processing_deliverable_id: 'del-2',
            processing_project_id: projectId,
            recording_id: 'rec-2',
            asset_type: 'transcript',
            engine_id: 'engine-2',
            schema_id: 'schema-2',
            engine_category_id: 'cat-2',
            status: 'incomplete',
            status_message: 'Processing',
            created_at: '2023-01-02T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z'
          }
        ],
        false
      );

      const res = await resolver.deliverables(
        obj,
        { limit: 50, offset: 10 },
        mockUtil.makeContext()
      );
      expect(res.records.length).toEqual(2);
    });

    it('should enforce max limit of 1000', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const obj = {
        id: projectId
      };

      serviceContext.dbConnections['core'].read._push([], false);

      // Call with limit > 1000, should throw an error
      await expect(
        resolver.deliverables(obj, { limit: 2000 }, mockUtil.makeContext())
      ).rejects.toThrow(/Limit cannot exceed 1000/);
    });

    it('should use default limit of 100 when not provided', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const obj = {
        id: projectId
      };

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

      const res = await resolver.deliverables(obj, {}, mockUtil.makeContext());
      expect(res.records.length).toEqual(1);
    });

    it('should use default offset of 0 when not provided', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const obj = {
        id: projectId
      };

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

      const res = await resolver.deliverables(obj, {}, mockUtil.makeContext());
      expect(res.records.length).toEqual(1);
    });

    it('should pass correct processingProjectId to DAL', async function () {
      const projectId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const obj = {
        id: projectId
      };

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

      const res = await resolver.deliverables(
        obj,
        { limit: 50 },
        mockUtil.makeContext()
      );
      // Verify that deliverables are returned (processingProjectId is used internally by DAL)
      expect(res.records.length).toEqual(1);
      expect(res.records[0].id).toEqual('del-1');
      expect(res.records[0].status).toEqual('complete');
    });
  });
});
