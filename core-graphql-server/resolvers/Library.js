const mapper = require('../dal/mapper.js');

module.exports = function createFunction(serviceContext) {
  const dalLibrary = serviceContext.dal.library;
  const librariesService = serviceContext.dal.libraryService;

  return {
    entities(obj, args, context, info) {
      const _args = JSON.parse(JSON.stringify(args));
      _args.libraryId = obj.id;
      return dalLibrary.getEntities(_args);
    },
    summary(obj, args, context, info) {
      const _args = Object.assign({ includeSummary: true, id: obj.id }, args);
      return dalLibrary.getLibrary(_args).then((lib) => lib.summary);
    },
    libraryType(obj, args, context, info) {
      const lt = obj.libraryType;
      return mapper.mapLibraryType(lt);
    },

    collaborators(obj, args, context, info) {
      const _args = JSON.parse(JSON.stringify(args));

      _args.libraryId = obj.id;
      _args.ownerOrgId = obj.organizationId;

      return librariesService
        .getLibraryCollaborators(_args)
        .then(function (data) {
          return {
            records: data.results.map(mapper.mapLibraryCollaborator),
            count: data.results.length, // not totalResults
            offset: args.offset,
            limit: args.limit
          };
        });
    },
    engineModels(obj, args, context, info) {
      const _args = JSON.parse(JSON.stringify(args));
      _args.ownerOrgId = obj.organizationId;
      _args.libraryId = obj.id;
      _args.libraryEngineModelId = args.id;
      return dalLibrary.getLibraryEngineModels(_args);
    },
    configurations(obj, args, context, info) {
      const _args = JSON.parse(JSON.stringify(args));
      _args.libraryId = obj.id;
      _args.organizationId = obj.organizationId;
      return dalLibrary.getLibraryConfigurations(_args);
    },
    dataset(obj, args, context, info) {
      const _args = JSON.parse(JSON.stringify(args));
      _args.libraryId = obj.id;
      _args.organizationId = obj.organizationId;
      return dalLibrary.getDataset(_args);
    }
  };
};
