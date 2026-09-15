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
      const newArgs = {
        ids: [obj.id],
        resourceType: 'TDO',
        entries: args.entries || [],
        organizationGuid: obj.applicationId
      };

      return bllRbac.addACEsToResourceFromNestedMutation(
        context,
        newArgs,
        info
      );
    }
  };
};
