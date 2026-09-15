module.exports = function createFunction(serviceContext) {
  const cache = require('./cache.js')(serviceContext);

  return {
    entity: (obj, args, context, info) =>
      cache.get(context, { id: obj.entityId }, 'Entity', () =>
        serviceContext.dal.library.getEntity({
          id: obj.entityId
        })
      ),
    jsonstring: (obj) => (obj.jsondata ? JSON.stringify(obj.jsondata) : '')
  };
};
