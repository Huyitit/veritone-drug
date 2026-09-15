const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const bllRbac = _.get(
    serviceContext,
    'bll.rbacAuth',
    require('./bll/rbacAuth.bll.js')(serviceContext)
  );

  return {
    // nested mutation
    addACEs: (obj, args, context, info) => {
      const organizationId =
        obj.organizationId ||
        _.get(context, '_authInfo.organization.organizationId');

      const newArgs = {
        ids: [obj.id],
        resourceType: 'Folder',
        entries: args.entries || [],
        organizationId
      };

      return bllRbac.addACEsToResourceFromNestedMutation(
        context,
        newArgs,
        info
      );
    }
  };
};
