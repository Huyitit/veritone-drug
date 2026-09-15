const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  return {
    source: (object, args, context) =>
      serviceContext.dal.source.getSource(context, {
        id: object.sourceId,
        organizationId: _.get(context, '_authInfo.organization.organizationId')
      }),
    scheduledJob: (object, args, context) =>
      serviceContext.dal.scheduledJob.getScheduledJob(context, {
        id: object.scheduledJobId
      })
  };
};
