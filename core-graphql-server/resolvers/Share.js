const _ = require('lodash');
module.exports = function createFunction(serviceContext) {
  return {
    id: (object) => object.shareId || '',
    folderId: (object) =>
      // Shared mentions can also be in a collection
      object.objectType === 'collection'
        ? object.objectId
        : _.get(object, 'shareInfo.objectMetadata.collectionId'),
    type: (object) => object.objectType,
    mentionId: (object) =>
      object.objectType === 'mention' ? object.objectId : object.mentionId,
    shareOptionsJson: (object) => object.shareOptions
  };
};
