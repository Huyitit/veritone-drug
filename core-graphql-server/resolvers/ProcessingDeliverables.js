const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const cache = require('./cache.js')(serviceContext);

  return {
    tdo: (obj, args, context) => {
      if (!obj.tdoId) {
        return null;
      }
      return cache.get(context, { id: obj.tdoId }, 'TemporalDataObject', () =>
        serviceContext.dal.tdo.getTDO(context, { id: obj.tdoId })
      );
    },

    engine: (obj, args, context) => {
      if (!obj.engineId) {
        return null;
      }
      return cache.get(context, { id: obj.engineId }, 'Engine', () =>
        serviceContext.dal.engine.getEngine(context, {
          id: obj.engineId,
          includeDeleted: true,
          adminView: true
        })
      );
    },

    schema: (obj, args, context) => {
      if (!obj.schemaId) {
        return null;
      }
      const organizationId = _.get(
        context,
        '_authInfo.organization.organizationId'
      );
      return cache.get(
        context,
        { id: obj.schemaId, organizationId },
        'Schema',
        () =>
          serviceContext.dal.structuredData.getSchema(context, {
            id: obj.schemaId,
            organizationId
          })
      );
    }
  };
};
