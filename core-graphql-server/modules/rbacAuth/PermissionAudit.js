const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../../util.js')(serviceContext);
  const bllRbac = serviceContext.bll.rbacAuth;

  return {
    resource: (obj, args, context) => {
      // Return the resource identifier from the audit object
      return {
        resourceType: obj.resourceType,
        resourceId: obj.resourceId
      };
    },

    userId: (obj, args, context) => {
      // Return the user ID from the audit object
      return obj.userId;
    },

    effectivePermissions: (obj, args, context) => {
      // Return the flattened list of effective permissions
      return obj.effectivePermissions || [];
    },

    permissionDetails: (obj, args, context) => {
      // Return detailed breakdown of permission grants
      return obj.permissionDetails || [];
    }
  };
};
