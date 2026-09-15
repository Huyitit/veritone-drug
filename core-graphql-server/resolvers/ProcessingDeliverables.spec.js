const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
let resolver = require('./ProcessingDeliverables.js')(serviceContext);

describe('ProcessingDeliverables.js', function () {
  describe('#require', function () {
    it('should load module', async function () {
      expect(typeof resolver).toEqual('object');
      expect(typeof resolver.tdo).toEqual('function');
      expect(typeof resolver.engine).toEqual('function');
      expect(typeof resolver.schema).toEqual('function');
    });
  });

  describe('#tdo', function () {
    it('should return null when tdoId is missing', async function () {
      const obj = {
        id: 'del-1',
        tdoId: null
      };

      const res = await resolver.tdo(obj, {}, mockUtil.makeContext());
      expect(res).toBeNull();
    });

    it('should get TDO by id', async function () {
      const obj = {
        id: 'del-1',
        tdoId: 'tdo-123'
      };

      serviceContext.dal.tdo.getTDO = jest.fn().mockResolvedValue({
        id: 'tdo-123',
        name: 'Test TDO'
      });

      const res = await resolver.tdo(obj, {}, mockUtil.makeContext());
      expect(res).toBeDefined();
      expect(res.id).toEqual('tdo-123');
      expect(
        serviceContext.dal.tdo.getTDO
      ).toHaveBeenCalledWith(expect.anything(), { id: 'tdo-123' });
    });
  });

  describe('#engine', function () {
    it('should return null when engineId is missing', async function () {
      const obj = {
        id: 'del-1',
        engineId: null
      };

      const res = await resolver.engine(obj, {}, mockUtil.makeContext());
      expect(res).toBeNull();
    });

    it('should get engine by id', async function () {
      const obj = {
        id: 'del-1',
        engineId: 'engine-123'
      };

      serviceContext.dal.engine.getEngine = jest.fn().mockResolvedValue({
        id: 'engine-123',
        name: 'Test Engine'
      });

      const res = await resolver.engine(obj, {}, mockUtil.makeContext());
      expect(res).toBeDefined();
      expect(res.id).toEqual('engine-123');
      expect(serviceContext.dal.engine.getEngine).toHaveBeenCalledWith(
        expect.anything(),
        {
          id: 'engine-123',
          includeDeleted: true,
          adminView: true
        }
      );
    });
  });

  describe('#schema', function () {
    it('should return null when schemaId is missing', async function () {
      const obj = {
        id: 'del-1',
        schemaId: null
      };

      const res = await resolver.schema(obj, {}, mockUtil.makeContext());
      expect(res).toBeNull();
    });

    it('should get schema by id', async function () {
      const obj = {
        id: 'del-1',
        schemaId: 'schema-123'
      };

      const context = mockUtil.makeContext();
      context._authInfo = {
        organization: {
          organizationId: 'org-123'
        }
      };

      serviceContext.dal.structuredData.getSchema = jest
        .fn()
        .mockResolvedValue({
          id: 'schema-123',
          name: 'Test Schema'
        });

      const res = await resolver.schema(obj, {}, context);
      expect(res).toBeDefined();
      expect(res.id).toEqual('schema-123');
      expect(serviceContext.dal.structuredData.getSchema).toHaveBeenCalledWith(
        expect.anything(),
        {
          id: 'schema-123',
          organizationId: 'org-123'
        }
      );
    });
  });
});
