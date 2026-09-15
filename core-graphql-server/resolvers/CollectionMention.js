const _ = require('lodash');
module.exports = function createFunction(serviceContext) {
  return {
    collection(obj, args, context, info) {
      const _args = {
        id: obj.folderId,
        organizationId: obj.organizationId
      };
      return serviceContext.dal.collection.getCollection(context, _args);
    },
    mention: (obj, args, context) => {
      const _args = {
        id: obj.mentionId,
        organizationId: obj.organizationId
      };
      return serviceContext.dal.mention.getMention(context, _args);
    }
  };
};
