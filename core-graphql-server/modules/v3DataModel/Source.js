const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalSourceType = serviceContext.dal.sourceType;
  const dalSource = serviceContext.dal.source;
  const defaultOrg = _.get(
    serviceContext.config,
    'db.constants.customerSuccessOrgId',
    7682
  );
  const util = require('../../resolvers/util.js')(serviceContext);

  function getOrgId(source) {
    return source.organizationId || defaultOrg;
  }

  return {
    sourceType: (object, args, context) =>
      dalSourceType.getSourceType(context, { id: object.sourceTypeId }),
    details: (object, args, context) => dalSource.getDetails(context, object),
    organization: (object, args, context) =>
      serviceContext.dal.organization.getOrganization(context, {
        id: getOrgId(object)
      }),

    thumbnailUrl: (obj, args, context) =>
      util.getSignedUrl(obj.thumbnailUrl || _.get(obj, 'kvp.image')),
    contentTemplates: (object, args, context) =>
      dalSource.getSourceContentTemplates(context, object),
    organizationId: (object) => getOrgId(object),
    correlationSDOId: (obj) => obj.correlationSdoId,
    permission: (obj, args, context) =>
      dalSource.getSourcePermission(context, args, obj),
    collaborators: (obj, args, context) =>
      dalSource.getCollaborators(context, args, obj),
    sdo: (obj, args, context) => {
      if (obj.correlationSdoId && obj.correlationSchemaId) {
        return serviceContext.dal.structuredData.getStructuredDataObject(
          context,
          {
            id: obj.correlationSdoId,
            schemaId: obj.correlationSchemaId
          }
        );
      }
      return null;
    },
    getStorageSignedUrl: (obj, args, context) => {
      return dalSource.getStorageSignedUrl(context, obj, args);
    }
  };
};
