const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../../util.js')(serviceContext);
  const bllRbac = serviceContext.bll.rbacAuth;
  const cache = require('../../resolvers/cache.js')(serviceContext);

  return {
    type: (obj, args, context) => {
      // Return the mechanism by which permission was granted
      return obj.type;
    },

    permissionSet: async (obj, args, context) => {
      // Return the permission set that contains the permission
      if (obj.permissionSetId) {
        return cache.get(
          context,
          { id: obj.permissionSetId },
          'AuthPermissionSet',
          () =>
            bllRbac.getAuthPermissionSet(context, {
              id: obj.permissionSetId,
              ownerOrganization: obj.organizationId
            })
        );
      }
      return obj.permissionSet || null;
    },

    owner: async (obj, args, context) => {
      // Return the user or group that has the permission set assigned
      if (obj.ownerId) {
        // Determine if owner is a user or group and fetch accordingly
        if (obj.ownerType === 'User') {
          const users = await serviceContext.dal.admin.getUsers(
            { ids: [obj.ownerId], limit: 1 },
            context
          );
          return _.get(users, 'records[0]');
        } else {
          return bllRbac.getAuthGroup(context, {
            id: obj.ownerId,
            ownerOrganization: obj.organizationId
          });
        }
      }
      return obj.owner || null;
    },

    resource: (obj, args, context) => {
      // Return the resource context for inherited permissions
      if (obj.resourceType && obj.resourceId) {
        return {
          resourceType: obj.resourceType,
          resourceId: obj.resourceId
        };
      }
      return obj.resource || null;
    }
  };
};
