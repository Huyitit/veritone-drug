module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);

  return {
    organization: (obj, args, context) => {
      return serviceContext.dal.organization.getOrganization(context, {
        id: obj.organizationId
      });
    }
  };
};
