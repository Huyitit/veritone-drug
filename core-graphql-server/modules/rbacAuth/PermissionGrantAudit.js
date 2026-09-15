const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../../util.js')(serviceContext);
  const bllRbac = serviceContext.bll.rbacAuth;

  return {
    permission: (obj, args, context) => {
      // Return the specific permission that was granted
      return obj.permission;
    },

    reason: (obj, args, context) => {
      // Return human-readable explanation of why permission was granted
      return obj.reason || 'Permission granted';
    },

    grants: (obj, args, context) => {
      // Return all specific grants that contribute to this permission
      return obj.grants || [];
    }
  };
};
