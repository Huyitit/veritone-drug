const { withFilter } = require('graphql-subscriptions');
const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const topic = {
    NOTIFICATION_POSTED_TOPIC: 'notification_posted'
  };
  const errors = require('../error')(serviceContext.config);
  const dalUtil = require('../dal/util')(serviceContext.config, serviceContext);

  return {
    notificationPosted: {
      resolve: (payload, variables) => {
        // Manipulate and return the new value
        return _.get(payload, 'notification');
      },
      subscribe: withFilter(
        (_parent, args, _context, _info) => {
          const { notificationMailboxId, notificationMailboxIds } = args;

          if (!notificationMailboxId && _.isEmpty(notificationMailboxIds)) {
            throw new errors.InvalidInput({
              message:
                'One of params notificationMailboxId, notificationMailboxIds must be defined'
            });
          }
          return serviceContext.pubsub.asyncIterator(
            topic.NOTIFICATION_POSTED_TOPIC
          );
        },
        (payload, variables) => {
          const { notificationMailboxId, notificationMailboxIds } = variables;
          // Get default mailboxes for userId/orgId
          // that have been passed into the notificationMailboxId/notificationMailboxIds parameter
          const defaultMailboxIds = _.map(
            notificationMailboxIds,
            dalUtil.getDefaultMailboxIdByOrgIdOrUserId
          );
          const defaultMailboxId = notificationMailboxId
            ? dalUtil.getDefaultMailboxIdByOrgIdOrUserId(notificationMailboxId)
            : null;

          if (
            notificationMailboxId ||
            notificationMailboxIds ||
            defaultMailboxId ||
            defaultMailboxIds
          ) {
            return (
              payload.mailboxId === notificationMailboxId ||
              payload.mailboxId === defaultMailboxId ||
              _.includes(notificationMailboxIds, payload.mailboxId) ||
              _.includes(defaultMailboxIds, payload.mailboxId)
            );
          }

          return false;
        }
      )
    }
  };
};
