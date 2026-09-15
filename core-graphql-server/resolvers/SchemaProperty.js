const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const structuredDataDal = serviceContext.dal.structuredData;
  const cache = require('./cache.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);

  return {
    schema: async (obj, args, context) => {
      const _args = {
        limit: 1,
        status: ['published'],
        // Intentional because dataRegistryId from api is dataRegistryMetadataId internally
        dataRegistryMetadataId: obj.dataRegistryId,
        majorVersion: obj.majorVersion
      };

      const res = await cache.get(context, _args, 'Schema', () =>
        structuredDataDal
          .getSchemas(context, _args)
          .then((rows) => rows.records[0])
      );
      if (_.isNil(res)) {
        throw new errors.NotFound({
          message:
            'No published schema associated with the property ' +
            obj.path +
            ' could be found.',
          data: {
            schemaProperty: obj
          }
        });
      }
      return res;
    },
    searchPath: (obj) => `${obj.storageName}.series.${obj.path}`
  };
};
