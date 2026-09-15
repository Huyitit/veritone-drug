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

describe('batchActionsAPI Mutation', function() {
  describe('feature flag disabled', function() {
    const mutations = require('./Mutation.js')(makeCtx(false));

    it('createTDOBatch throws NotImplemented when feature flag is off', function() {
      expect(() => mutations.createTDOBatch({}, {}, {})).toThrow();
    });

    it('cancelTDOBatchProcess throws NotImplemented when feature flag is off', function() {
      expect(() => mutations.cancelTDOBatchProcess({}, {}, {})).toThrow();
    });
  });

  describe('feature flag enabled', function() {
    const createBatch = jest.fn().mockResolvedValue({ id: 'b1' });
    const cancelTdoBatchProcess = jest.fn().mockResolvedValue({ status: 'canceled' });
    const ctx = makeCtx(true, { tdoBatch: { createBatch, cancelTdoBatchProcess } });
    const mutations = require('./Mutation.js')(ctx);
    const gqlContext = { userId: 'u1' };

    it('createTDOBatch delegates to bll.tdoBatch.createBatch with correct args', async function() {
      const args = { input: { tdoIds: ['t1'] } };
      await mutations.createTDOBatch({}, args, gqlContext);
      expect(createBatch).toHaveBeenCalledWith(gqlContext, args);
    });

    it('cancelTDOBatchProcess delegates to bll.tdoBatch.cancelTdoBatchProcess with correct args', async function() {
      const args = { id: 'bp1' };
      await mutations.cancelTDOBatchProcess({}, args, gqlContext);
      expect(cancelTdoBatchProcess).toHaveBeenCalledWith(gqlContext, args);
    });
  });
});
