module.exports = function createFunction(serviceContext) {
  const util = require('../../resolvers/util.js')(serviceContext);

  // each mutator attached to TDOBatch type should have its own file implementation
  const executeJobTemplate = serviceContext.bll.executeJobTemplate;
  const tdoBatch = serviceContext.bll.tdoBatch;

  return {
    executeJobTemplate(root, args, context) {
      return executeJobTemplate.exec(context, root, args);
    },
    temporalDataObjects(root, args, context) {
      util.checkMaxTDOLimit(context, {
        limit: args.limit
      });

      return tdoBatch.getTdosForBatch(context, root, args);
    },
    temporalDataObjectsIds(root, args, context) {
      return tdoBatch.getBatchItemsId(context, root, args);
    }
  };
};
