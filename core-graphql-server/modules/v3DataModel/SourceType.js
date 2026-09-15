const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalSchema = serviceContext.dal.structuredData;
  const cache = require('../../resolvers/cache.js')(serviceContext);

  function getSourceTypeCategory(sourceType) {
    let res = sourceType.categoryId;
    if (!res) {
      if (sourceType.id <= 5) res = sourceType.id;
      else res = 5;
    }
    return res;
  }

  return {
    sourceSchema: (obj, args, context) => {
      const _args = {
        id: obj.sourceSchemaId,
        organizationId: 7682
      };
      return obj.sourceSchemaId
        ? cache.get(context, _args, 'Schema', () =>
            dalSchema.getSchema(context, _args)
          )
        : null;
    },
    isLive: (obj) => (_.isNil(obj.isLive) ? false : obj.isLive),
    requiresScanPipeline: (obj) =>
      _.isNil(obj.requiresScanPipeline) ? false : obj.requiresScanPipeline,
    supportedRunModes: (obj) =>
      serviceContext.dal.sourceType.getSupportedRunModes(obj),
    categoryId: (object) => getSourceTypeCategory(object),
    category: (object, args, context) => {
      const id = getSourceTypeCategory(object);
      return serviceContext.dal.sourceType.getSourceTypeCategory(context, {
        id
      });
    },
    sourceFormats: (object, args, context) =>
      serviceContext.dal.sourceType.getSourceTypeFormats(context, object),
    programFormats: (object, args, context) =>
      serviceContext.dal.sourceType.getSourceTypeProgramFormats(
        context,
        object
      ),
    sources: (object, args, context) =>
      serviceContext.dal.source.getSources(
        context,
        Object.assign(
          {
            sourceTypeId: object.id
          },
          args
        )
      )
  };
};
