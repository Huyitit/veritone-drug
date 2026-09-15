const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const { logger, config } = serviceContext;
  const mainUtil = require('../util.js')(serviceContext);

  const getCollection = (obj, context) =>
    serviceContext.dal.collection.getCollection(context, {
      id: obj.collectionId
    });

  return {
    id: (obj) => obj.id || obj.widgetId,
    collection: getCollection,
    // This is used from a no_auth client so we want to prevent resolving
    // nested properties like mentions and scheduledJobs
    collectionJSON: getCollection,
    mentions: async (obj, args, context) => {
      const shareDal = serviceContext.dal.share;

      // We can grab any share for the collection because we keep all shares
      // updated with sharedMentions/mediaShares.
      const shares = await shareDal.getShares({
        objectId: obj.collectionId.toString(),
        objectType: 'collection',
        limit: 1
      });
      if (_.isEmpty(shares)) {
        logger.warn(`Missing share for widget: ${obj.id || obj.widgetId}`);
        return mainUtil.emptyPage(args);
      }

      const share = shares[0];
      const sharedMentionIds = _.get(share, 'shareInfo.sharedMentions', []).map(
        (sm) => sm.shareId
      );
      const _args = Object.assign(
        {
          shareId: sharedMentionIds,
          folderId: _.get(share, 'shareInfo.objectId')
        },
        args
      );
      return serviceContext.dal.share.getSharedMentions(context, _args);
    }
  };
};
