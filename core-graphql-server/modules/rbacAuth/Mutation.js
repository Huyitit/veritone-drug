const fs = require('fs');
const _lodash = require('lodash');
const moment = require('moment');

module.exports = function createFunction(serviceContext) {
  const bllRbac = serviceContext.bll.rbacAuth;
  const errors = require('../../error')(serviceContext.config);
  return {
    authGroupCreate(_, args, context) {
      return bllRbac.createAuthGroup(context, args);
    },
    authEnforcementEnable(_, args, context) {
      if (_lodash.get(args, 'input.enable')) {
        return bllRbac.authEnforcementEnable(context, args);
      }
      return [];
    },
    authGroupUpdate(_, args, context) {
      // the User Default Private AG can’t be updated.
      args.unsupportedAuthClasses = ['User'];
      return bllRbac.updateAuthGroup(context, args);
    },
    authGroupDelete(_, args, context) {
      return bllRbac.deleteAuthGroup(context, args);
    },
    authGroupAddMembers(_, args, context) {
      return bllRbac.authGroupAddMembers(context, args);
    },
    authGroupRemoveMembers(_, args, context) {
      return bllRbac.authGroupRemoveMembers(context, args);
    },
    authPermissionSetCreate(_, args, context) {
      return bllRbac.createAuthPermissionSet(context, args);
    },
    authPermissionSetUpdate(_, args, context) {
      return bllRbac.updateAuthPermissionSet(context, args);
    },
    authPermissionSetDelete(_, args, context) {
      return bllRbac.deleteAuthPermissionSet(context, args);
    },
    addACEsToResources(_, args, context) {
      return bllRbac.addACEsToResources(context, args);
    },
    removeACEsFromResource(_, args, context) {
      return bllRbac.removeACEsFromResources(context, args);
    },
    createApplicationRole(_, args, context) {
      throw new errors.NotImplemented();
    },
    updateApplicationRole(_, args, context) {
      throw new errors.NotImplemented();
    },
    deleteApplicationRole(_, args, context) {
      throw new errors.NotImplemented();
    }
  };
};
