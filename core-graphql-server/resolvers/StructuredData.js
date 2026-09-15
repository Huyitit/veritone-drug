const _ = require('lodash');
const errors = require('../error');

module.exports = function createFunction(serviceContext) {
  const structuredDataDal = serviceContext.dal.structuredData;
  const cache = require('./cache.js')(serviceContext);

  return {
    data(obj, args) {
      let data = obj.data;
      if (args.path) data = _.get(data, args.path);
      return data;
    },
    dataString(obj, args, context, info) {
      return JSON.stringify(obj.data || {}, null, args.indent);
    },
    schemaId: (obj) => obj.dataRegistryId,
    schema(obj, args, context) {
      const _args = {
        id: obj.dataRegistryId,
        organizationId: obj.organizationId
      };
      try {
        return cache.get(context, _args, 'Schema', () =>
          structuredDataDal.getSchema(context, _args)
        );
      } catch (err) {
        if (err.name === 'not_found') {
          throw new errors.NotFound({
            message:
              'The structured data object ' +
              obj.id +
              ' references ' +
              'schema ID ' +
              obj.dataRegistryId +
              '. The schema could not be found. ' +
              'The object is corrupted and cannot be used.',
            data: {
              objectType: 'Schema',
              objectId: obj.dataRegistryId,
              sdo: obj
            }
          });
        } else throw err;
      }
    }
  };
};
