const _ = require('lodash');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

const dal = require('./dalAlwaysUpFlow.js')(serviceContext);
const coreDbWrite = serviceContext.dbConnections['core'].write;
const coreDbRead = serviceContext.dbConnections['core'].read;

function makeContext(options) {
  return mockUtil.makeContext(options);
}

describe('dalAlwaysUpFlow.js', function () {
  describe('#require', function () {
    it('should load module', async function () {
      const test = dal;
      expect(typeof test).toEqual('object');
      expect(Object.keys(test).length).toEqual(5);
      expect(typeof test.alwaysUpFlows).toEqual('function');
      expect(typeof test.alwaysUpFlow).toEqual('function');
      expect(typeof test.alwaysUpFlowCreate).toEqual('function');
      expect(typeof test.alwaysUpFlowDelete).toEqual('function');
    });
  });

  describe('#alwaysUpFlows()', function () {
    it('should get all alwaysUpFlows for organization', async function () {
      coreDbRead._push([]);

      const res = await dal.alwaysUpFlows(makeContext(), {
        limit: 1,
        offset: 0
      });
      expect(res).toBeDefined();
      expect(res.count).toBeDefined();
    });

    it('should get 0 record with offset 1000', async function () {
      coreDbRead._push([]);

      const res = await dal.alwaysUpFlows(makeContext(), {
        limit: 1,
        offset: 1000
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(0);
    });
  });

  describe('#alwaysUpFlow', function () {
    it('should get alwaysUpFlow by engineId', async function () {
      coreDbRead._push([
        {
          engineId: '00000000-0000-0000-0000-000000000001',
          schedule: '* * * * *'
        }
      ]);

      const res = await dal.alwaysUpFlow(makeContext(), {
        engineId: '00000000-0000-0000-0000-000000000001'
      });

      expect(res.engineId).toEqual('00000000-0000-0000-0000-000000000001');
    });

    it('should not return any results', async function () {
      coreDbRead._push([]);
      const res = await dal.alwaysUpFlow(makeContext(), {
        id: '00000000-0000-0000-0000-000000000001'
      });
      expect(res).toEqual(null);
    });
  });

  describe('#alwaysUpFlowCreate', function () {
    it('should create an alwaysUpFlow', async function () {
      serviceContext.dal.organization.getOrganization = jest.fn(() => {
        return {
          organizationId: 11111,
          organizationGuid: '1232d624-5875-48b5-9fee-9c5f57a3d8b3'
        };
      });
      coreDbRead._push([
        {
          id: 'engine123'
        }
      ]);
      coreDbRead._push([], false);
      coreDbRead._push(
        [
          {
            alwaysUpFlowId: '9a22d624-5875-48b5-9fee-9c5f57a3d8b3',
            organizationId: 17465,
            engineId: '13c17069-9c4e-45e6-bc73-156d1d155569',
            buildId: null,
            schedule: '* * * * *',
            updateSchedule: '0 0 * * *'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([], false);
      const res = await dal.alwaysUpFlowCreate(makeContext(), {
        input: {
          engineId: '13c17069-9c4e-45e6-bc73-156d1d155569',
          schedule: '* * * * *',
          updateSchedule: '0 0 * * *',
          organizationId: 17465
        }
      });

      expect(res.alwaysUpFlowId).toEqual(
        '9a22d624-5875-48b5-9fee-9c5f57a3d8b3'
      );
    });
  });

  describe('#alwaysUpFlowUpdate', function () {
    it('should update an alwaysUpFlow', async function () {
      serviceContext.dal.organization.getOrganization = jest.fn(() => {
        return {
          organizationId: 11111,
          organizationGuid: '1232d624-5875-48b5-9fee-9c5f57a3d8b3'
        };
      });
      coreDbRead._push(
        [
          {
            alwaysUpFlowId: '9a22d624-5875-48b5-9fee-9c5f57a3d8b3',
            organizationId: 17465,
            engineId: '13c17069-9c4e-45e6-bc73-156d1d155569',
            buildId: null,
            schedule: '* * * * *',
            updateSchedule: '0 0 * * *',
            status: 'inactive'
          }
        ],
        false
      );
      coreDbRead._push(
        [
          {
            alwaysUpFlowId: '9a22d624-5875-48b5-9fee-9c5f57a3d8b3',
            organizationId: 17465,
            engineId: '13c17069-9c4e-45e6-bc73-156d1d155569',
            buildId: null,
            schedule: '* * * * *',
            updateSchedule: '0 0 * * *',
            status: 'active'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([], false);
      const res = await dal.alwaysUpFlowUpdate(makeContext(), {
        input: {
          alwaysUpFlowId: '9a22d624-5875-48b5-9fee-9c5f57a3d8b3',
          schedule: '* * * * *',
          updateSchedule: '0 0 * * *',
          status: 'active',
          organizationId: 17465,
          engineId: '13c17069-9c4e-45e6-bc73-156d1d155569'
        }
      });

      expect(res.status).toEqual('active');
    });
  });

  describe('#alwaysUpFlowDelete', function () {
    it('should delete an alwaysUpFlow', async function () {
      coreDbRead._push(
        [
          {
            alwaysUpFlowId: '9a22d624-5875-48b5-9fee-9c5f57a3d8b3',
            organizationId: 17465,
            engineId: '13c17069-9c4e-45e6-bc73-156d1d155569',
            status: 'active'
          }
        ],
        false
      );
      coreDbRead._push(
        [
          {
            alwaysUpFlowId: '9a22d624-5875-48b5-9fee-9c5f57a3d8b3',
            organizationId: 17465,
            engineId: '13c17069-9c4e-45e6-bc73-156d1d155569',
            status: 'deleted'
          }
        ],
        false
      );
      const res = await dal.alwaysUpFlowDelete(
        {
          id: '13c17069-9c4e-45e6-bc73-156d1d155569'
        },
        makeContext()
      );

      expect(res.status).toEqual('deleted');
    });
  });
});
