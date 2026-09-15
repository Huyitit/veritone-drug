const validator = require('validator');
const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const cache = require('../../resolvers/cache.js')(serviceContext);

  // !!! note that most resolver functions on this type are defined
  // in the core module resolver file. These are defined here because
  // they depend on the source and scheduled job DALs.
  return {
    source: (object, args, context) => {
      const requestorOrgId = _.get(
        context,
        '_authInfo.organization.organizationId',
        _.get(context, '_authInfo.data.organization.organizationId')
      );
      const _args = {
        id: object.sourceId,
        // getSource REQUIRES org ID so pass it in here
        organizationId: object.orgId || requestorOrgId,
        includePublic: true
      };
      return object.sourceId
        ? cache.get(context, _args, 'Source', () =>
            serviceContext.dal.source.getSource(context, _args)
          )
        : null;
    },
    scheduledJob: (object, args, context) => {
      const _args = {
        id: object.scheduledJobId
      };
      return object.scheduledJobId
        ? cache.get(context, _args, 'ScheduledJob', () =>
            serviceContext.dal.scheduledJob.getScheduledJob(context, _args)
          )
        : null;
    }
  };
};
