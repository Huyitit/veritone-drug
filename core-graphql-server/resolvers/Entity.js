module.exports = function createFunction(serviceContext) {
  const cache = require('./cache.js')(serviceContext);

  return {
    identifiers(obj, args, context, info) {
      const _args = JSON.parse(JSON.stringify(args));
      _args.entityIdentifierId = _args.id;
      _args.entityId = obj.id;
      _args.libraryId = obj.libraryId;
      _args.identifierType = args.identifierTypeId;
      return cache.get(context, _args, 'EntityIdentifiers', () =>
        serviceContext.dal.library.getEntityIdentifiers(_args)
      );
    },
    library: (obj, args, context) =>
      cache.get(context, { id: obj.libraryId }, 'Library', () =>
        serviceContext.dal.library.getLibrary({ id: obj.libraryId })
      ),
    summary: (obj, args, context) => {
      const params = { includeSummary: true, id: obj.id };
      const res = cache.get(context, params, 'Entity', () =>
        serviceContext.dal.library.getEntity(params)
      );
      return res.then((ent) => ent.summary);
    },
    jsonstring: (obj) => (obj.jsondata ? JSON.stringify(obj.jsondata) : '')
  };
};
