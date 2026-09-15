const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const structuredDataDal = serviceContext.dal.structuredData;
  const mainUtil = require('../util.js')();

  return {
    organization: (obj, args, context) =>
      serviceContext.dal.organization
        .getOrganization(context, {
          id: obj.organizationId
        })
        .then((organization) => {
          return {
            id: organization.id,
            name: organization.name
          };
        }),
    schemas: (obj, args, context) => {
      args = Object.assign(
        {
          dataRegistryMetadataId: obj.id,
          organizationId: obj.organizationId
        },
        args
      );
      return structuredDataDal.getSchemas(context, args);
    },
    publishedSchema: (obj, args, context) => {
      const _args = {
        status: ['published'],
        dataRegistryMetadataId: obj.id,
        organizationId: obj.organizationId
      };
      return structuredDataDal
        .getSchemas(context, _args)
        .then((data) => (data.count ? data.records[0] : null));
    },
    createdBy: async (obj, args, context) => {
      if (obj.createdBy) {
        return context.loaders.usersById.load(obj.createdBy);
      }
      return null;
    },
    modifiedBy: async (obj, args, context) => {
      if (obj.modifiedBy) {
        return context.loaders.usersById.load(obj.modifiedBy);
      }
      return null;
    },
    ingestionToken: (obj, args, context) => {
      const _args = {
        dataRegistryMetadataId: obj.id,
        organizationId: _.get(context, '_authInfo.organization.organizationId'),
        applicationId: _.get(context, '_authInfo.applicationId')
      };

      if (mainUtil.isInternalAPIKey(context._authInfo)) {
        _args.organizationId = obj.organizationId;
      }

      return structuredDataDal.getDataRegistryToken(context, _args);
    }
  };
};
