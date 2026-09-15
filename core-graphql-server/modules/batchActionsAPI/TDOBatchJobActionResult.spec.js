'use strict';

describe('batchActionsAPI TDOBatchJobActionResult', function() {
  const getJob = jest.fn().mockResolvedValue({ id: 'j1' });
  const getTDO = jest.fn().mockResolvedValue({ id: 't1' });
  const serviceContext = {
    dal: {
      job: { getJob },
      tdo: { getTDO }
    }
  };
  const resolvers = require('./TDOBatchJobActionResult.js')(serviceContext);
  const gqlContext = {};

  it('job resolver uses root.actionId to call dal.job.getJob', async function() {
    const root = { actionId: 'action-123', targetId: 'tdo-abc' };
    await resolvers.job(root, {}, gqlContext);
    expect(getJob).toHaveBeenCalledWith(gqlContext, { id: 'action-123' });
  });

  it('temporalDataObject resolver uses root.targetId to call dal.tdo.getTDO', async function() {
    const root = { actionId: 'action-123', targetId: 'tdo-abc' };
    await resolvers.temporalDataObject(root, {}, gqlContext);
    expect(getTDO).toHaveBeenCalledWith(gqlContext, { id: 'tdo-abc' });
  });
});
