const _ = require('lodash');
module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);

  return {
    widgets(obj, args, context, info) {
      const _args = JSON.parse(JSON.stringify(args));
      _args.folderId = obj.id;
      _args.organizationId = obj.organizationId;

      return serviceContext.dal.collection.getWidgets(context, _args);
    },
    organization: (obj, args, context, info) =>
      serviceContext.dal.organization.getOrganization(context, {
        id: obj.organizationId
      }),
    signedImageUrl: (obj) => util.getSignedUrlOrVirtual(obj.image),
    mentions: (obj, args, context) => {
      const _args = {
        folderId: Object.prototype.hasOwnProperty.call(obj, 'obj')
          ? obj.id
          : '',
        mentionId: args.id
      };
      return serviceContext.dal.collection.getCollectionMentions(
        context,
        _args
      );
    },
    folder: (obj, args, context) => {
      const orgId =
        args.organizationId ||
        _.get(context, '_authInfo.organization.organizationId');
      const folder = serviceContext.dal.folder.getParentFolder(
        context,
        obj.id,
        orgId,
        true,
        'collection'
      );
      return folder.then((result) => (result ? [result] : []));
    }
  };
};
