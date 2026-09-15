const util = require('./util.js'),
  mapper = require('../dal/mapper.js');

module.exports = function createFunction(serviceContext) {
  const dalLibrary = serviceContext.dal.library;
  const librariesService = serviceContext.dal.libraryService;
  const dalEngine = serviceContext.dal.engine;
  const util = require('./util.js')(serviceContext);

  return {
    dataUrl: (obj) => util.getSignedUrl(obj.dataUrl),
    library(obj, args, context, info) {
      return mapper.mapLibrary(obj.library);
    },
    engineId(obj, args, context, info) {
      return dalEngine.getIdById(context, obj.engineId);
    },
    engine(obj, args, context, info) {
      return dalEngine.getEngine(context, {
        id: obj.engineId,
        organizationId: obj.organizationId
      });
    },
    contentType(obj, args, context, info) {
      return obj.jsondata ? obj.jsondata.contentType : null;
    }
  };
};
