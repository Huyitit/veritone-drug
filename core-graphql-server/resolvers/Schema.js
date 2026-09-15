const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const structuredDataDal = serviceContext.dal.structuredData;
  return {
    dataRegistryId: (obj) => obj.dataRegistryMetadataId,
    // sometimes obj.schema returns from db as a string.
    // the graphql field type is JSONData so here we'll parse it if necessary.
    definition: (obj) =>
      _.isString(obj.schema) ? JSON.parse(obj.schema) : obj.schema,
    status: (obj) => obj.status,
    createdBy: async (obj, args, context) => {
      if (obj.createdBy) {
        return context.loaders.usersById.load(obj.createdBy);
      }
      return null;
    },
    modifiedBy: (obj, args, context) => {
      if (obj.modifiedBy) {
        return context.loaders.usersById.load(obj.modifiedBy);
      }
      return null;
    },
    validActions: (obj, args, context, t) => {
      // Only validAction on public schemas is view
      const organizationId = _.get(
        context,
        'requestContext.userInfo.organization.organizationId'
      );
      if (obj.organizationId !== organizationId) {
        return ['view'];
      }
      return structuredDataDal.schemaNextActions[obj.status];
    },
    dataRegistry: (obj, args, context) =>
      structuredDataDal.getDataRegistry(context, {
        id: obj.dataRegistryMetadataId,
        organizationId: obj.organizationId,
        _skipAccessCheck: true
      }),
    structuredDataObjects: (obj, args, context) => {
      args.schemaId = obj.id;
      args.organizationId = _.get(
        context,
        '_authInfo.organization.organizationId'
      );
      return structuredDataDal.getStructuredDataObjects(context, args);
    },
    organization: (obj, args, context) =>
      serviceContext.dal.organization.getOrganization(context, {
        id: obj.organizationId
      })
  };
};
