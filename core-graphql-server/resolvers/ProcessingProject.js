const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalProcessingDeliverables = serviceContext.dal.processingDeliverables;

  return {
    async summary(obj, args, context) {
      return dalProcessingDeliverables.getProjectSummary(context, obj.id);
    },

    async deliverables(obj, args, context) {
      return dalProcessingDeliverables.getDeliverables(context, {
        processingProjectId: obj.id,
        ...args
      });
    }
  };
};
