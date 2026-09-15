'use strict';

describe('batchActionsAPI TDOBatchProcess', function() {
  const getTdoBatch = jest.fn().mockResolvedValue({ id: 'b1' });
  const GetActionsForABatchProcess = jest.fn().mockResolvedValue([]);
  const serviceContext = {
    bll: { tdoBatch: { getTdoBatch, GetActionsForABatchProcess } }
  };
  const resolvers = require('./TDOBatchProcess.js')(serviceContext);
  const gqlContext = {};

  describe('TDOBatch field resolver', function() {
    it('sets args.id from root.batchId and delegates to bll.tdoBatch.getTdoBatch', async function() {
      const root = { batchId: 'batch-xyz' };
      const args = {};
      await resolvers.TDOBatch(root, args, gqlContext);
      expect(args.id).toBe('batch-xyz');
      expect(getTdoBatch).toHaveBeenCalledWith(gqlContext, args);
    });
  });

  describe('actions field resolver', function() {
    it('delegates to bll.tdoBatch.GetActionsForABatchProcess with root and args', async function() {
      const root = { batchProcessId: 'bp1', organizationId: 'org1' };
      const args = { limit: 10 };
      await resolvers.actions(root, args, gqlContext);
      expect(GetActionsForABatchProcess).toHaveBeenCalledWith(gqlContext, root, args);
    });
  });
});
