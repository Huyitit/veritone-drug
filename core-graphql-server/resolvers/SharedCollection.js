module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);

  return {
    async mentions(obj, args, context, info) {
      const sharedMentionIds = obj.shareInfo.sharedMentions.map(
        (sm) => sm.shareId
      );
      const _args = Object.assign(
        { shareId: sharedMentionIds, folderId: obj.shareInfo.objectId },
        args
      );
      return serviceContext.dal.share.getSharedMentions(context, _args);
    },
    signedImageUrl: (obj) => util.getSignedUrlOrVirtual(obj.image)
  };
};
