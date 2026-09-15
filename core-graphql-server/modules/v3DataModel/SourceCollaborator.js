module.exports = function createFunction(serviceContext) {
  const cache = require('../../resolvers/cache.js')(serviceContext);

  return {
    organization: (object, args, context) =>
      cache.get(context, { id: object.organizationId }, 'Organization', () =>
        serviceContext.dal.organization.getOrganization(context, {
          id: object.organizationId
        })
      )
  };
};
