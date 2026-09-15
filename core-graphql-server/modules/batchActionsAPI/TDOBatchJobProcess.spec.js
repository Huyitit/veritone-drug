'use strict';

describe('batchActionsAPI TDOBatchJobProcess', function() {
  const getTdoBatch = jest.fn().mockResolvedValue({ id: 'b1' });
  const serviceContext = {
    bll: { tdoBatch: { getTdoBatch } }
  };
  const resolvers = require('./TDOBatchJobProcess.js')(serviceContext);
  const gqlContext = {};

  it('TDOBatch sets args.id from root.batchId before delegating to bll.tdoBatch.getTdoBatch', async function() {
    const root = { batchId: 'batch-abc' };
    const args = {};
    await resolvers.TDOBatch(root, args, gqlContext);
    expect(args.id).toBe('batch-abc');
    expect(getTdoBatch).toHaveBeenCalledWith(gqlContext, args);
  });
});
