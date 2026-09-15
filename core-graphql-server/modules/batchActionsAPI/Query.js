const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const errors = require('../../error')(serviceContext.config);
  const batchActionsEnabled = _.get(
    serviceContext,
    'config.featureFlags.enableBatchActionsAPI',
    false
  );

  const tdoBatch = serviceContext.bll.tdoBatch;
  return {
    TDOBatch: (root, args, context) => {
      if (!batchActionsEnabled) {
        throw new errors.NotImplemented({
          data: {
            batchActionsEnabled: batchActionsEnabled
          }
        });
      }
      return tdoBatch.getTdoBatch(context, args);
    },
    TDOBatchProcesses: (root, args, context) => {
      if (!batchActionsEnabled) {
        throw new errors.NotImplemented({
          data: {
            batchActionsEnabled: batchActionsEnabled
          }
        });
      }
      return tdoBatch.getBatchProcesses(context, args);
    }
  };
};
