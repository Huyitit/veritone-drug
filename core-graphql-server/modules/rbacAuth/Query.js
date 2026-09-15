const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const bllRbac = serviceContext.bll.rbacAuth;
  const errors = require('../../error')(serviceContext.config);
  const mainUtil = require('../../util.js')(serviceContext);

  return {
    authGroup(root, args, context) {
      // the User Default Private AG can’t be listed.
      args.unsupportedAuthClasses = ['User'];
      return bllRbac.getAuthGroup(context, args);
    },
    authGroups: async function (root, args, context) {
      // the User Default Private AG can’t be listed.
      args.unsupportedAuthClasses = ['User'];
      return bllRbac.getAuthGroups(context, args);
    },
    authPermissionSet(root, args, context) {
      return bllRbac.getAuthPermissionSet(context, args);
    },
    authPermissionSets(root, args, context) {
      return bllRbac.getAuthPermissionSets(context, args);
    },
    getACLForResources(root, args, context) {
      return bllRbac.getACLForResources(context, args);
    },
    hasPermissions(_, args, context) {
      // Flag the caller-facing OLP access check so it emits ACEQuery audit
      // events; internal hasPermissions callers leave this unset (no fan-out).
      // Passed as an argument so it never enters the DAL
      // permission cache key, which is a whole-args hash.
      return bllRbac.hasPermissions(context, args, true, {
        auditAccessQuery: true
      });
    },
    applicationRoles(root, args, context) {
      throw new errors.NotImplemented();
    },
    applicationRole(root, args, context) {
      throw new errors.NotImplemented();
    },
    resourcePermissionsAudit(root, args, context) {
      return bllRbac.resourcePermissionsAudit(context, args);
    }
  };
};
