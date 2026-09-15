const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const cache = require('./cache.js')(serviceContext);
  const packages = require('../dal/package.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);

  return {
    package: async (object, args, context) => {
      const result = await packages.getPackages(context, {
        id: object.packageId,
        includeDeleted: object.includeDeleted
      });
      if (_.isNil(result) || _.isEmpty(result.records)) {
        throw new errors.NotFound({
          message: 'Package was not found.',
          data: {
            packageId: object.packageId
          }
        });
      }
      return result.records[0];
    },
    createdBy: async (object, args, context) => {
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: object.createdBy },
        context
      );
      return {
        ...user,
        id: user.userId,
        name: `${user.firstName} ${user.lastName}`
      };
    },
    modifiedBy: async (object, args, context) => {
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: object.modifiedBy },
        context
      );
      return {
        ...user,
        id: user.userId,
        name: `${user.firstName} ${user.lastName}`
      };
    },
    organization: (object, args, context) => {
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
    }
  };
};
