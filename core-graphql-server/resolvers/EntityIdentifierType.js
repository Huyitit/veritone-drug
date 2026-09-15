module.exports = function createFunction(serviceContext) {
  const dalLibrary = serviceContext.dal.library;
  return {
    // TODO add bounds checking for this as db can have a value
    // that isn't in our enum
    dataType: (obj) => obj.dataType,
    entityIdentifierItems: (obj, args) => {
      const itemRecords = dalLibrary
        .getEntityIdentifierItems({
          entityIdentifierTypeId: obj.id,
          libraryTypeId: args.libraryTypeId
        })
        .then((data) => data.records);

      return itemRecords;
    }
  };
};
