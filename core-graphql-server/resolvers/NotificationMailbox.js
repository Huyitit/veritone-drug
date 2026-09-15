const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../util.js')();

  return {
    paused: (obj) => obj.isPaused,
    lastReceiptDateTime: (obj) => mainUtil.fixDateTime(obj.latestReceiptDate),
    latestUpdateDate: (obj) => mainUtil.fixDateTime(obj.dateModified),
    details: (obj) => obj.metadata,
    eventFilter: (obj) => obj.conditions,
    notifications: async (obj, args, context) => {
      const defaultLimit = _.get(
        serviceContext,
        'config.paging.defaultLimit',
        30
      );
      const params = JSON.parse(JSON.stringify(args));

      params.mailboxIds = [obj.id];

      const res = await serviceContext.dal.notification.queryNotifications(
        context,
        params,
        _.get(args, 'offset', 0),
        _.get(args, 'limit', defaultLimit)
      );

      return mainUtil.toPage(args, res);
    },
    limit: (obj) => obj.limitCount || obj.limit,
    unseenCount: (obj, args, context) => {
      return serviceContext.dal.notification.getNotificationCount(context, {
        mailboxLimit: obj.limitCount || obj.limit,
        mailboxIds: [obj.id],
        flags: ['unseen']
      });
    },
    totalCount: (obj, args, context) => {
      return serviceContext.dal.notification.getNotificationCount(context, {
        mailboxLimit: obj.limitCount || obj.limit,
        mailboxIds: [obj.id]
      });
    },
    unreadCount: async (obj, args, context) => {
      return serviceContext.dal.notification.getNotificationCount(context, {
        mailboxLimit: obj.limitCount || obj.limit,
        mailboxIds: [obj.id],
        flags: ['unread']
      });
    }
  };
};
