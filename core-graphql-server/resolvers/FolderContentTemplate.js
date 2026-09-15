module.exports = function createFunction(serviceContext) {
  const { getStructuredDataObject } = serviceContext.dal.structuredData;

  return {
    id: (obj) => {
      return obj.id;
    },
    folderId: (obj) => {
      return obj.folderId;
    },
    sdoId: (obj) => obj.sdoId,
    sdo: (obj, args, context) => {
      const _args = {
        id: obj.sdoId,
        schemaId: obj.schemaId
      };
      if (getStructuredDataObject) {
        return getStructuredDataObject(context, _args);
      } else {
        return null;
      }
    },
    schemaId: (obj) => obj.schemaId
  };
};
