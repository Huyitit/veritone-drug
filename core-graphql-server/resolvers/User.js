const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalFolder = serviceContext.dal.folder,
    dalAdmin = serviceContext.dal.admin;
  const util = require('./util.js')(serviceContext);
  const cache = require('./cache.js')(serviceContext);
  const dalUtil = require('./../dal/util')(
    serviceContext.config,
    serviceContext
  );
  const mainUtil = require('../util.js')();
  const rbacAuthDal = _.get(
    serviceContext,
    'dal.rbacAuth',
    require('../modules/rbacAuth/dal/authGroup.dal.js')
  )(serviceContext);

  return {
    organization: (object, args, context) => {
      // Fix error for internal token
      if (!object.organizationId || object.organizationId === 'internal') {
        return null;
      }

      if (context.skipCache === true) {
        return serviceContext.dal.organization.getOrganization(
          context,
          {
            id: object.organizationId
          },
          true
        );
      }

      return cache.get(
        context,
        { id: object.organizationId },
        'Organization',
        () =>
          serviceContext.dal.organization.getOrganization(context, {
            id: object.organizationId
          })
      );
    },

    organizationGuids: (object, args, context) => {
      return dalAdmin.getOrganizationGuidsForUser({ id: object.id }, context);
    },

    rootFolder(obj, args, context, info) {
      const _args = Object.assign(
        {
          userId: obj.id,
          rootFolderType: args.type
        },
        args
      );
      return dalFolder.getOrCreateUserRootFolder(context, _args);
    },

    mfaInfo(object, args, context, info) {
      // object.id will contain the user ID
      // this function should retrieve mfa info for the
      // specified user using a function added to dalAdmin in
      // dal/admin.js
      return dalAdmin.getMfaInfo(context, object.id);
    },

    userSettings(object, args, context, info) {
      return dalAdmin.getUserSettings(context, { userId: object.id });
    },

    roles(object, args, context) {
      return dalAdmin.getRolesForUser(
        { id: object.id, organizationGuid: object.organizationGuid },
        context
      );
    },

    imageUrl: (obj) =>
      util.getSignedUrlOrVirtual(_.get(obj, 'kvp.image', obj.imageUrl)),
    firstName: (object) =>
      dalUtil.sanitizeField(_.get(object, 'kvp.firstName', object.firstName)),
    lastName: (object) =>
      dalUtil.sanitizeField(_.get(object, 'kvp.lastName', object.lastName)),
    title: (object) => dalUtil.sanitizeField(_.get(object, 'kvp.title')),
    developerType: (object) =>
      dalUtil.sanitizeField(_.get(object, 'kvp.developerType')),

    acls: (obj) => serviceContext.dal.user.getACLs({ id: obj.id }),
    email: (obj) => obj.email || obj.userName,
    notifications: async (obj, args, context, info) => {
      return serviceContext.bll.notification.getNotificationsByUserOrOrgId(
        context,
        args,
        obj.id
      );
    },
    appsAllowedToRunAsUser: async (obj) => {
      if (obj.systemUser !== true) {
        return [];
      }
      const applicationsAllowedToRunAsUser = await serviceContext.dal.application.getApplicationsForSystemUser(
        obj.id
      );
      return applicationsAllowedToRunAsUser.map(
        (application) => application.applicationKey
      );
    },
    organizationInvites: async (obj, args, context, info) => {
      return serviceContext.dal.organizationInvite.getOrganizationInvites(
        _.omit(obj, 'organizationId'), // omit current orgId else the returned invites will be only for the current org
        args,
        context
      );
    },
    scim: async (obj, args, context, info) => {
      return serviceContext.dal.openidConnect.getSCIMUserList(
        obj.id,
        obj.organizationGuid,
        args.connectors,
        args.limit,
        args.offset
      );
    }
  };
};
