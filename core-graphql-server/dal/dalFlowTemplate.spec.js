const _ = require('lodash');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

let dal = require('./dalFlowTemplate.js')(serviceContext);
const ssoDbRead = serviceContext.dbConnections['sso'].read;
const coreDbWrite = serviceContext.dbConnections['core'].write;
const coreDbRead = serviceContext.dbConnections['core'].read;

function makeContext(options) {
  return mockUtil.makeContext(options);
}

describe('dalFlowTemplate.js', function () {
  describe('#require', function () {
    it('should load module', async function () {
      const test = dal;
      expect(typeof test).toEqual('object');
      expect(Object.keys(test).length).toEqual(4);
      expect(typeof test.getFlowTemplates).toEqual('function');
      expect(typeof test.createFlowTemplate).toEqual('function');
      expect(typeof test.updateFlowTemplate).toEqual('function');
      expect(typeof test.deleteFlowTemplate).toEqual('function');
    });
  });

  describe('#getFlowTemplates()', function () {
    it('check permissions options', async function () {
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      serviceContext.config.featureFlags.useEngineGrant = true;
      const context = makeContext();
      context._authInfo.organization.kvp.features.useEngineGrant = 'enabled';
      coreDbWrite._push([], false, [
        'aiware.package__resource',
        'aiware.package__organization',
        'aiware.package',
        'public',
        'organization_id'
      ]);
      const res = await dal.getFlowTemplates(context, {
        showPublic: true
      });
      expect(res).toBeDefined();
      expect(res.count).toBeDefined();
    });
    it('get by id', async function () {
      coreDbWrite._push([], false, [], (sql, args) => {
        expect(args).toEqual(expect.arrayContaining(['template_id_1']));
        return true;
      });
      const res = await dal.getFlowTemplates(makeContext(), {
        id: 'template_id_1'
      });
      expect(res).toBeDefined();
      expect(res.count).toBeDefined();
    });
    it('user filters', async function () {
      coreDbWrite._push([], false, [], (sql, args) => {
        expect(args).toEqual(
          expect.arrayContaining([
            10,
            20,
            '%titleText%',
            ['t1', 't2'],
            ['cat1', 'cat2']
          ])
        );
        return true;
      });
      const res = await dal.getFlowTemplates(makeContext(), {
        offset: 10,
        limit: 20,
        title: 'titleText',
        tags: ['t1', 't2'],
        categories: ['cat1', 'cat2']
      });
      expect(res).toBeDefined();
      expect(res.count).toBeDefined();
    });
    it('get via an orgless token', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      coreDbWrite._push([], false, [], (sql) => {
        expect(sql).not.toMatch(/organization_id\s=/);
        expect(sql).not.toMatch(/public\s=/);
        return true;
      });
      const res = await dal.getFlowTemplates(context, {
        offset: 10,
        limit: 20
      });
      expect(res).toBeDefined();
      expect(res.count).toBeDefined();
    });
  });

  describe('createFlowTemplate()', function () {
    it('throw organizationId required', async () => {
      await expect(async () =>
        dal.createFlowTemplate(makeContext(), { input: {} })
      ).rejects.toThrow(
        'organizationId field required when the flow is private'
      );
    });
    it('create flow', async () => {
      coreDbRead._push([
        {
          id: 'test_flow'
        }
      ]);
      const res = await dal.createFlowTemplate(makeContext(), {
        input: { organizationId: 123, flow: 'dGVzdA==' }
      });
      expect(res.id).toEqual('test_flow');
    });
  });

  describe('updateFlowTemplate()', function () {
    it('throw organizationId required', async () => {
      await expect(async () =>
        dal.updateFlowTemplate(makeContext(), { input: {} })
      ).rejects.toThrow(
        'organizationId field required when the flow is private'
      );
    });
    it('update flow', async () => {
      coreDbRead._push([
        {
          id: 'test_flow'
        }
      ]);
      const res = await dal.updateFlowTemplate(makeContext(), {
        input: { organizationId: 123, id: 'test_flow' }
      });
      expect(res.id).toEqual('test_flow');
    });
  });

  describe('deleteFlowTemplate()', function () {
    it('should return err on missing template', async () => {
      // get db flow
      coreDbRead._push([], false);
      await expect(async () =>
        dal.deleteFlowTemplate(makeContext(), {
          input: { organizationId: 123, id: 'test_flow' }
        })
      ).rejects.toThrow('flowTemplate not found or access denied');
    });
    it('should return err if failed to delete', async () => {
      // get db flow
      coreDbRead._push([{ id: 123 }], false);
      // delete db flow
      coreDbWrite._push([]);
      await expect(async () =>
        dal.deleteFlowTemplate(makeContext(), {
          input: { organizationId: 123, id: 'test_flow' }
        })
      ).rejects.toThrow('flowTemplate not found or access denied');
    });
    it('delete template', async () => {
      // get db flow
      coreDbRead._push([{ id: 123 }], false);
      // delete db flow
      coreDbWrite._push([{ id: 123 }]);

      const res = await dal.deleteFlowTemplate(makeContext(), {
        input: { organizationId: 123, id: 'test_flow' }
      });
      expect(res.id).toEqual(123);
    });
  });
});
