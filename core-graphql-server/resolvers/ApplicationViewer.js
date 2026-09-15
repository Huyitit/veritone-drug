const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const networkIsolated = _.get(config, 'featureFlags.networkIsolated', false);
  const viewers = require('../dal/applicationViewer')(serviceContext);
  const util = require('./util.js')(serviceContext);
  const mainUtil = require('../util.js')();

  const getIconUrl = (url) => {
    const staticReplacer = 'get.aiware.com/static';
    if (networkIsolated && url && url.includes(staticReplacer)) {
      return url.replace(staticReplacer, 'static.' + mainUtil.getDnsZoneName());
    }

    return util.getSignedUrlOrVirtual(url);
  };

  return {
    signedIconUrl: (obj) => getIconUrl(obj.icon),
    createdBy: async (object, _args, context) => {
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: object.createdBy },
        context
      );
      return {
        ...user,
        id: user.userId,
        name: `${user.firstName} ${user.lastName}`
      };
    },
    modifiedBy: async (object, _args, context) => {
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: object.modifiedBy },
        context
      );
      return {
        ...user,
        id: user.userId,
        name: `${user.firstName} ${user.lastName}`
      };
    },
    applicationViewerBuilds: (object, args, context) => {
      return viewers.getApplicationViewerBuilds(context, {
        viewerIds: [object.viewerId],
        status: args.status,
        orderBy: args.orderBy,
        limit: args.limit,
        offset: args.offset
      });
    }
  };
};
