/*eslint no-undef: "error"*/
const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalFolder = serviceContext.dal.folder;
  const dalOrganization = serviceContext.dal.organization;
  const util = require('./util.js')(serviceContext);
  const mainUtil = require('../util.js')(serviceContext);
  const dalUtil = require('../dal/util')(serviceContext.config, serviceContext);
  const PENDING_COST_REDIS_KEY = _.get(
    serviceContext,
    'config.engineUsage.pendingCostRedisKey',
    'PendingCostForOrganization'
  );

  function allowRestrictedContent(context) {
    return (
      mainUtil.hasPerm('admin.org.read', context._authInfo) ||
      util.isSuperAdmin(context._authInfo)
    );
  }

  return {
    async guid(obj, args, context, info) {
      const organizationGuid = await serviceContext.dal.application.getAppIdFromOrgId(
        obj.organizationId
      );
      return _.get(obj, 'organizationGuid');
    },
    users(obj, args, context, info) {
      if (!allowRestrictedContent(context)) {
        return { records: [], count: 0 };
      }
      // inject this org ID into field parameters
      const _args = JSON.parse(JSON.stringify(args));
      // note that requireAuthInfo and authorizeOrgIds have already been
      // called at this point, from within the query resolver function
      // that returned this Organization instance.
      _args.organizationIds = [obj.id];
      // now run the usual query, which will include the filter by org ID
      return serviceContext.dal.admin.getUsers(_args, context);
    },
    roles(obj, args, context, info) {
      if (!allowRestrictedContent(context)) {
        return [];
      }
      const options = Object.assign(args, { organizationId: obj.id });
      return dalOrganization.getRolesForOrg(options, context);
    },
    applications(obj, args, context, info) {
      const _args = JSON.parse(JSON.stringify(args));
      _args.organizationId = obj.id;
      return serviceContext.dal.application.getApplications(_args);
    },
    blacklist(obj, args, context, info) {
      // superadmin-only constraint is now enforced with a directive.
      const _args = JSON.parse(JSON.stringify(args));
      _args.organizationId = obj.id;
      return dalOrganization.getBlacklistForOrg(context, {
        organizationId: obj.id
      });
    },
    whitelist(obj, args, context, info) {
      if (!allowRestrictedContent(context)) {
        return {};
      }
      return dalOrganization.getEngineWhitelist(context, { id: obj.id });
    },
    collections(obj, args, context, info) {
      return serviceContext.dal.collection.getCollections(
        context,
        Object.assign({ organizationId: obj.id }, args)
      );
    },
    jsondata: async (obj) => {
      const jsonData = obj.jsondata;
      const discoveryPrimaryLogoUrl = _.get(
        jsonData,
        'features.discoveryReports.primaryLogo'
      );
      if (!_.isEmpty(discoveryPrimaryLogoUrl)) {
        _.set(
          jsonData,
          'features.discoveryReports.primaryLogoSignedUrl',
          await util.getSignedUrlOrVirtual(discoveryPrimaryLogoUrl)
        );
      }
      const discoverySecondaryLogoUrl = _.get(
        jsonData,
        'features.discoveryReports.secondaryLogo'
      );
      if (!_.isEmpty(discoverySecondaryLogoUrl)) {
        _.set(
          jsonData,
          'features.discoveryReports.secondaryLogoSignedUrl',
          await util.getSignedUrlOrVirtual(discoverySecondaryLogoUrl)
        );
      }
      return jsonData;
    },
    watchlists(obj, args, context, info) {
      const _args = JSON.parse(JSON.stringify(args));
      _args.organizationId = obj.id;
      return serviceContext.dal.watchlist.getWatchlists(_args);
    },
    internalApplicationId(obj, args, context, info) {
      return serviceContext.dal.application.getAppIdFromOrgId(obj.id);
    },
    rootFolder(obj, args, context, info) {
      const _args = Object.assign(
        {
          organizationId: obj.id,
          rootFolderType: args.type
        },
        args
      );
      return dalFolder.getOrCreateOrgRootFolder(context, _args);
    },

    imageUrl: (obj) => util.getSignedUrlOrVirtual(_.get(obj, 'kvp.image')),

    dashboards: (obj) => {
      const dashboards = _.get(obj, 'kvp.dashboards');
      if (_.isArray(dashboards) && !_.isEmpty(dashboards)) {
        dashboards.forEach((dashboard) => {
          if (dashboard.thumbnail) {
            dashboard.thumbnail = util.getSignedUrlOrVirtual(dashboard.thumbnail);
          }
        });
      }

      return dashboards;
    },
    seats(obj, args, context) {
      if (!allowRestrictedContent(context)) {
        return 0;
      }
      return dalOrganization.getUserCountForOrg(obj.id);
    },
    mediaUsageMs(obj, args, context) {
      if (!allowRestrictedContent(context)) {
        return 0;
      }
      return dalOrganization.getMediaUsageMs(obj.id);
    },
    integrationConfig: async (obj, args, context) => {
      const orgIntegrationConfig = await dalOrganization.getOrganizationIntegrationConfig(
        context,
        Object.assign({ organizationId: obj.id, integrationId: args.id }, args)
      );

      // Allow regular users with userVisible is true
      if (
        !orgIntegrationConfig.userVisible &&
        !allowRestrictedContent(context)
      ) {
        return {};
      }

      return orgIntegrationConfig;
    },
    oktaConfiguration: (obj, args, context) => {
      if (!allowRestrictedContent(context)) {
        return {};
      }
      return dalOrganization.getOrgOktaConfiguration(context, obj);
    },
    defaultCluster: async (obj, args, context) => {
      const defaultClusterId = await serviceContext.dal.cluster.getClusterByPreference(
        context,
        {
          organization: obj.id.toString()
        }
      );

      if (defaultClusterId) {
        return serviceContext.dal.cluster.getCluster(context, {
          id: defaultClusterId
        });
      }

      return null;
    },
    pendingCost: async (obj, args, context) => {
      const pendingCost = await serviceContext.redisCache.get(
        PENDING_COST_REDIS_KEY,
        obj.id
      );

      return mainUtil.round(pendingCost, 2) || 0;
    },
    remainingBudget: (obj) => mainUtil.round(obj.remainingBudget, 2) || 0,
    notifications: async (obj, args, context, info) => {
      return serviceContext.bll.notification.getNotificationsByUserOrOrgId(
        context,
        args,
        obj.id
      );
    },
    organizationInvites: (obj, args, context) => {
      return serviceContext.dal.organizationInvite.getOrganizationInvites(
        obj,
        args,
        context
      );
    },
    isUserPendingMember: (obj, args, context) => {
      if (!args.email || args.email === '') {
        return false;
      }
      const organizationId = obj.id;
      const statuses = ['submitted', 'approved', 'completed'];
      return serviceContext.dal.organizationInvite
        .getOrganizationInvites(
          { organizationId },
          { email: args.email, statuses },
          context
        )
        .then(function (result) {
          return !_.isEmpty(result);
        });
    },
    isRootOrganization: (obj, args, context) => {
      const organizationId = obj.id;
      const rootOrg = context.config.flyway.rootOrgId;
      return organizationId === rootOrg;
    },
    loginConfiguration: (obj, args, context) => {
      const organizationId = obj.id;
      return dalOrganization.getLoginConfiguration({}, { organizationId });
    },
    registrationConfigurations: (obj, args, context) => {
      const _args = _.cloneDeep(args);
      _args.organizationGuid = _.get(obj, 'organizationGuid');
      return serviceContext.dal.organizationRegistration.getRegistrationConfigurations(
        _args
      );
    }
  };
};
