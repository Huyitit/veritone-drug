const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  // const cache = require('./cache.js')(serviceContext);

  return {
    id: (obj) => obj.objectId,
    createdDateTime: (obj) => obj.creationDate || obj.dateCreated,
    modifiedDateTime: (obj) => obj.lastUpdatedDate || obj.dateModified,
    typeId: (obj) => {
      return obj.typeId || obj.treeObjectTypeId || obj.folderTypeId;
    },
    treeObjectId: (obj) => {
      return obj.treeObjectId || obj.folderId || obj.objectId;
    },
    createdBy: async (obj, args, context) => {
      const userId = _.get(obj, 'createdBy.0');
      if (userId) {
        return context.loaders.usersById.load(userId);
      }
      return null;
    }
  };
};
