const _ = require('lodash');
const mapper = require('../dal/mapper');
module.exports = function createFunction(serviceContext) {
  const { logger } = serviceContext.app;
  const config = serviceContext.config;
  const networkIsolated = _.get(config, 'featureFlags.networkIsolated', false);
  const util = require('./util.js')(serviceContext);
  const mainUtil = require('../util.js')();
  const mapper = require('../dal/mapper.js');
  const errors = require('../error/index.js')(serviceContext.config);
  const entityTags = require('../dal/entityTags.js')(serviceContext);

  const forwardParentOperationArgs = async (
    obj = {},
    args = {},
    additionalArgs = {},
    context,
    cb
  ) => {
    const __queryArgs = _.get(obj, '__queryArgs', {});
    return cb(
      {
        ...args,
        ...__queryArgs,
        ...additionalArgs
      },
      context
    );
  };

  const getIconUrl = (url) => {
    const staticReplacer = 'get.aiware.com/static';
    if (networkIsolated && url && url.includes(staticReplacer)) {
      return url.replace(staticReplacer, 'static.' + mainUtil.getDnsZoneName());
    }

    return util.getSignedUrlOrVirtual(url);
  };

  return {
    iconUrl: (obj) => getIconUrl(obj.iconUrl),
    iconSvg: (obj) => getIconUrl(obj.iconSvg),
    signedIconUrl: (obj) => getIconUrl(obj.iconUrl),
    signedIconSvg: (obj) => getIconUrl(obj.iconSvg),
    clientSecret: (object, args, context, info) => {
      // Skip processing if password is not passed
      if (args.password == null || !object.oauth2ClientSecret) {
        return null;
      }

      const input = {
        userName: _.get(context, '_authInfo.userName'),
        password: args.password
      };

      // getPasswordToken is faster than login
      return serviceContext.dal.admin
        .getPasswordToken(context, input)
        .then(() => object.oauth2ClientSecret)
        .catch((err) => {
          logger.error(err);
          throw new errors.AuthenticationError({
            message:
              'Invalid password or other authentication error for client secret',
            data: {
              internalData: { error: err },
              userName: input.userName,
              objectId: object.id,
              objectType: 'Application'
            }
          });
        });
    },
    dailyTaskMetrics: (obj, _, context) => {
      const { organizationId, applicationId } = obj;
      const args = { organizationId, applicationId };
      return serviceContext.dal.workflow.dailyTaskMetrics(context, args);
    },
    createdDateTime: (obj) => mainUtil.fixDateTime(obj.createdDateTime),
    modifiedDateTime: (obj) => mainUtil.fixDateTime(obj.modifiedDateTime),
    contextMenuExtensions: async (object, args, context, info) => {
      const data = await serviceContext.dal.application.getContextMenuExtensions(
        {
          applicationId: object.applicationId
        }
      );

      const mentions = data.filter((item) => item.type === 'mention');
      const tdos = data.filter((item) => item.type === 'tdo');
      const watchlists = data.filter((item) => item.type === 'watchlist');
      const collections = data.filter((item) => item.type === 'collection');

      return {
        mentions,
        tdos,
        watchlists,
        collections
      };
    },
    validStateActions: (obj, args, context, info) =>
      util.getValidStateActionsApplications(obj.status, context._authInfo),
    components: (obj) => obj, // pass to child resolver 'ApplicationComponent'
    entityTags: async (obj, args, context) => {
      if (_.has(obj, 'entityTags')) {
        return obj.entityTags.map(mapper.mapEntityTags);
      }
      return await entityTags.getEntityTags(obj.id, 'app', obj.organizationId);
    },
    applicationConfig: async (obj, args, context) => {
      if (_.has(obj, 'applicationConfig')) {
        return obj.applicationConfig.map(mapper.mapApplicationConfig);
      }
      return await forwardParentOperationArgs(
        obj,
        args,
        { appId: _.get(obj, 'id') },
        context,
        serviceContext.dal.application.getApplicationConfig
      );
    },
    details: async (obj, args, context) => {
      if (_.has(obj, 'details')) {
        return obj.applicationDetails.map(mapper.mapApplicationDetails);
      }
      return await serviceContext.dal.application.getApplicationDetails(
        {
          ...args,
          appId: _.get(obj, 'id')
        },
        context
      );
    },
    applicationConfigDefinition: async (obj, args, context) => {
      if (_.has(obj, 'applicationConfigDefinition')) {
        return obj.applicationConfigDefinition;
      }
      return await serviceContext.dal.application.getApplicationConfigDefinition(
        {
          ...args,
          appId: _.get(obj, 'id')
        },
        context
      );
    },
    applicationHeaderbar: async (obj, args, context) => {
      if (_.has(obj, 'applicationHeaderbar')) {
        return obj.applicationHeaderbar.map(mapper.mapApplicationHeaderbar);
      }
      return await serviceContext.dal.application.getApplicationHeaderbar(
        {
          ...args,
          appId: _.get(obj, 'id'),
          orgId: _.get(obj, 'organizationId')
        },
        context
      );
    },
    headerbarEnabled: (obj) => obj.headerbarEnabled,
    nodeModules: async (obj, args) => {
      const includeDeleted = _.get(args, 'includeDeleted', false);
      const appId = _.get(obj, 'id');
      return await serviceContext.dal.application.getNodeRedPalettesByApplication(
        appId,
        includeDeleted
      );
    },
    applicationRoles: async (obj, args, context) => {
      const ownedOnly = _.get(args, 'ownedOnly', true);
      const appId = _.get(obj, 'id');

      return await serviceContext.bll.application.getApplicationRolesByAppId(
        context,
        appId,
        { ownedOnly }
      );
    },
    events: async (obj, context) => {
      if (_.has(obj, 'events')) {
        return obj.events.map(mapper.camelizeRootKeys);
      }

      const applicationId = _.get(obj, 'id');
      const organizationId = _.get(obj, 'organizationId');
      const application = applicationId;
      const params = { applicationId, organizationId, application };

      const result = await serviceContext.dal.event.events(context, params);

      return _.get(result, 'records', []);
    },
    eventSubscriptions: async (obj, context) => {
      if (_.has(obj, 'eventSubscriptions')) {
        return obj.eventSubscriptions.map(mapper.mapEventSubscription);
      }

      const appId = _.get(obj, 'id');
      const orgId = _.get(obj, 'organizationId');
      const params = { appId, orgId };

      const result = await serviceContext.dal.event.eventSubscriptions(
        context,
        params
      );

      return _.get(result, 'records', []);
    }
  };
};
