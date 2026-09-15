'use strict';

const serviceContextBase = require('../../test/serviceContext.mock.js')();

function makeCtx(flagEnabled, overrideBll) {
  return Object.assign({}, serviceContextBase, {
    config: Object.assign({}, serviceContextBase.config, {
      featureFlags: { enableBatchActionsAPI: flagEnabled }
    }),
    bll: Object.assign({}, serviceContextBase.bll, overrideBll || {})
  });
}

describe('batchActionsAPI Query', function() {
  describe('feature flag disabled', function() {
    const queries = require('./Query.js')(makeCtx(false));

    it('TDOBatch throws NotImplemented when feature flag is off', function() {
      expect(() => queries.TDOBatch({}, {}, {})).toThrow();
    });

    it('TDOBatchProcesses throws NotImplemented when feature flag is off', function() {
      expect(() => queries.TDOBatchProcesses({}, {}, {})).toThrow();
    });
  });

  describe('feature flag enabled', function() {
    const getTdoBatch = jest.fn().mockResolvedValue({ id: 'b1' });
    const getBatchProcesses = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx(true, { tdoBatch: { getTdoBatch, getBatchProcesses } });
    const queries = require('./Query.js')(ctx);
    const gqlContext = { userId: 'u1' };

    it('TDOBatch delegates to bll.tdoBatch.getTdoBatch with correct args', async function() {
      const args = { id: 'b1' };
      await queries.TDOBatch({}, args, gqlContext);
      expect(getTdoBatch).toHaveBeenCalledWith(gqlContext, args);
    });

    it('TDOBatchProcesses delegates to bll.tdoBatch.getBatchProcesses with correct args', async function() {
      const args = { id: 'b1', status: 'running' };
      await queries.TDOBatchProcesses({}, args, gqlContext);
      expect(getBatchProcesses).toHaveBeenCalledWith(gqlContext, args);
    });
  });
});
