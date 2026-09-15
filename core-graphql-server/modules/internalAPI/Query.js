const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalInternalToken = serviceContext.dal.internalToken;
  const dalScheduledEvent = serviceContext.dal.scheduledEvent;

  return {
    internalTokens: (root, args, context) =>
      dalInternalToken.getInternalTokens(context, args),
    internalToken: (root, args, context) =>
      dalInternalToken.getInternalToken(context, args),
    availableRights: (root, args, context) =>
      dalInternalToken.listAllRights(context, args),
    scheduledEvent: (root, args, context) =>
      dalScheduledEvent.getScheduledEvent(context, args),
    scheduledEvents: (root, args, context) =>
      dalScheduledEvent.getScheduledEvents(context, args)
  };
};
