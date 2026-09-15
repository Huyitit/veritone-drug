const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalSourceType = serviceContext.dal.sourceType;
  const dalSource = serviceContext.dal.source;
  const dalStructuredData = serviceContext.dal.structuredData;
  const cache = require('../../resolvers/cache.js')(serviceContext);

  return {
    data: (obj, args, context) => {
      const _args = {
        id: obj.sdoId,
        schemaId: obj.schemaId
      };
      const prom = cache.get(context, _args, 'StructuredData', () =>
        dalStructuredData.getStructuredDataObject(context, _args)
      );
      return prom.then((sdo) => sdo.data);
    },

    sdo: (obj, args, context) => {
      const _args = {
        id: obj.sdoId,
        schemaId: obj.schemaId
      };
      return cache.get(context, _args, 'StructuredData', () =>
        dalStructuredData.getStructuredDataObject(context, _args)
      );
    }
  };
};
