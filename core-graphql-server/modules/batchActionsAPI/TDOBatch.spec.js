'use strict';

const serviceContextBase = require('../../test/serviceContext.mock.js')();

describe('batchActionsAPI TDOBatch', function() {
  const execFn = jest.fn().mockResolvedValue({ jobId: 'j1' });
  const getTdosForBatch = jest.fn().mockResolvedValue([]);
  const getBatchItemsId = jest.fn().mockResolvedValue({ ids: [] });

  const serviceContext = Object.assign({}, serviceContextBase, {
    bll: Object.assign({}, serviceContextBase.bll, {
      executeJobTemplate: { exec: execFn },
      tdoBatch: Object.assign({}, (serviceContextBase.bll.tdoBatch || {}), {
        getTdosForBatch,
        getBatchItemsId
      })
    })
  });
  const resolvers = require('./TDOBatch.js')(serviceContext);
  const root = { id: 'b1' };
  const gqlContext = {};

  it('executeJobTemplate delegates to bll.executeJobTemplate.exec', async function() {
    const args = { processDefinition: { dagTemplateId: 'd1', clusterId: 'c1' } };
    await resolvers.executeJobTemplate(root, args, gqlContext);
    expect(execFn).toHaveBeenCalledWith(gqlContext, root, args);
  });

  it('temporalDataObjects calls bll.tdoBatch.getTdosForBatch after checking TDO limit', async function() {
    const args = { limit: 10 };
    await resolvers.temporalDataObjects(root, args, gqlContext);
    expect(getTdosForBatch).toHaveBeenCalledWith(gqlContext, root, args);
  });

  it('temporalDataObjectsIds delegates to bll.tdoBatch.getBatchItemsId', async function() {
    const args = {};
    await resolvers.temporalDataObjectsIds(root, args, gqlContext);
    expect(getBatchItemsId).toHaveBeenCalledWith(gqlContext, root, args);
  });
});
