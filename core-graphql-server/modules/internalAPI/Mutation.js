const fs = require('fs'),
  validator = require('validator'),
  _lodash = require('lodash');

module.exports = function createFunction(serviceContext, config) {
  const util = require('../../resolvers/util')(serviceContext);
  const errors = require('../../error')(config);
  return {
    requestInternalToken(root, args, context) {
      return serviceContext.dal.internalToken.requestInternalToken(
        context,
        args
      );
    },
    approveInternalToken(root, args, context) {
      return serviceContext.dal.internalToken.approveInternalToken(
        context,
        args
      );
    },
    updateInternalToken(root, args, context) {
      return serviceContext.dal.internalToken.updateInternalToken(
        context,
        args
      );
    },
    revokeInternalToken(root, args, context) {
      return serviceContext.dal.internalToken.revokeInternalToken(
        context,
        args
      );
    },
    databaseQueryMonitor: (root, args, context) =>
      serviceContext.dal.queryMonitor.queryMonitor(context, args),
    createScheduledEvent: (root, args, context) =>
      serviceContext.dal.scheduledEvent.createScheduledEvent(context, args),
    updateScheduledEvent: (root, args, context) =>
      serviceContext.dal.scheduledEvent.updateScheduledEvent(context, args),
    deleteScheduledEvent: (root, args, context) =>
      serviceContext.dal.scheduledEvent.deleteScheduledEvent(context, args),
    setAssetStorageTags(_, args, context) {
      const uri = _lodash.get(args, 'input.uri');
      const tags = _lodash.get(args, 'input.tags');
      const isInternalToken = util.getTokenType(context) === 'internal';

      if (!isInternalToken) {
        throw new errors.NotAllowed({
          message: 'An internal token is required.'
        });
      }

      return serviceContext.dal.asset.setAssetStorageTags(uri, tags);
    }
  };
};
