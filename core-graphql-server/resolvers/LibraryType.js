const mapper = require('../dal/mapper.js');

module.exports = function createFunction(serviceContext) {
  const dalLibrary = serviceContext.dal.library;
  return {
    entityIdentifierTypes(obj, args, context, info) {
      const typeIds = (obj.entityIdentifierTypes || []).map(
        (obj) => obj.entityIdentifierTypeId
      );

      return typeIds
        ? dalLibrary
            .getEntityIdentifierTypes({
              ids: typeIds,
              libraryTypeId: obj.libraryTypeId
            })
            .then((data) => data.records)
        : [];
    }
  };
};
