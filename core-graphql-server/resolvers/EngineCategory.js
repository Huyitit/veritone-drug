const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);
  const dalEngine = serviceContext.dal.engine;
  const cache = require('./cache.js')(serviceContext);

  function mapSearchConfig(engineCategory) {
    const search = engineCategory.search || {};

    // here we have some logic to reconcile the different formats found in the
    // database JSON for autocomplete and search fields.
    // searchFields/autocompleteFields are maps/objects.
    // searchField/autocompleteField are strings.
    // we synthesize them by assigning the key "custom" to searchField and
    // autocompleteField if they are present.
    let autocompleteFields = search.autocompleteField
      ? { custom: search.autocompleteField }
      : {};
    if (search.autocompleteFields)
      autocompleteFields = Object.assign(
        autocompleteFields,
        search.autocompleteFields
      );
    let searchFields = search.searchField ? { custom: search.searchField } : {};
    if (search.searchFields)
      searchFields = Object.assign(searchFields, search.searchFields);

    // now we need to change them into the typed GraphQL format.
    const sf = [];
    Object.keys(searchFields).forEach((key) => {
      sf.push({
        searchField: key,
        indexField: searchFields[key]
      });
    });
    const af = [];
    Object.keys(autocompleteFields).forEach((key) => {
      af.push({
        autocompleteField: key,
        indexField: autocompleteFields[key]
      });
    });

    return {
      searchFields: sf,
      autocompleteFields: af,
      // note that these fields are not always present in the JSON
      // so we must be able to return null. they are boolean;
      // a null value is not the same as false.
      isSearchEnabled: _.get(engineCategory, 'search.enabled'),
      isElasticEnabled: _.get(engineCategory, 'elastic.enabled'),
      searchMetadataKey: _.get(engineCategory, 'search.metadataKey'),
      elasticType: _.get(engineCategory, 'elastic.type')
    };
  }

  return {
    engines(obj, args, context, info) {
      const _args = Object.assign({ engineCategoryId: obj.id }, args);
      util.authorizeOrgIds(context._authInfo, _args);
      return cache.get(context, _args, 'Engines', () =>
        serviceContext.dal.engine.getEngines(context, _args)
      );
    },
    engineIds(obj, args, context, info) {
      const _args = Object.assign({ engineCategoryId: obj.id }, args);
      util.authorizeOrgIds(context._authInfo, _args);
      const engines = cache.get(context, _args, 'Engines', () =>
        serviceContext.dal.engine.getEngines(context, _args)
      );
      return engines.then((res) => {
        return res.records.map((eng) => dalEngine.getId(context, eng));
      });
    },
    libraryEntityIdentifierTypes(obj, args, context, info) {
      const _args = Object.assign(
        {
          ids: obj.libraryIdentifierTypes,
          offset: args.offset,
          limit: args.limit
        },
        args
      );
      // if the engine category doesn't have any
      // library identifier types, just return an
      // empty page instead of querying
      if (!_args.ids) {
        return {
          records: [],
          offset: args.offset,
          limit: args.limit,
          count: 0
        };
      }
      util.authorizeOrgIds(context._authInfo, _args);
      return obj.libraryIdentifierTypes
        ? serviceContext.dal.library.getEntityIdentifierTypes(_args)
        : null;
    },
    libraryEntityIdentifierTypeIds(obj, args, context, info) {
      return obj.libraryIdentifierTypes;
    },
    totalEngines(obj, args, context, info) {
      return obj.engineIds ? obj.engineIds.length : 0;
    },
    categoryType: (obj) => obj.dataField,
    categoryMetadataKey: (obj) =>
      obj.dependencies ? obj.dependencies.category : null,
    dependencies: (obj) =>
      obj.dependencies && obj.dependencies.dependencies
        ? obj.dependencies.dependencies.map((dep) => {
            return { dependencyType: dep };
          })
        : [],
    createdDateTime: (obj) =>
      _.isNumber(obj.createdDateTime)
        ? obj.createdDateTime * 1000
        : obj.createdDateTime,
    modifiedDateTime: (obj) =>
      _.isNumber(obj.modifiedDateTime)
        ? obj.modifiedDateTime * 1000
        : obj.modifiedDateTime,
    searchConfiguration: (obj) => mapSearchConfig(obj),
    exportFormats: (obj) => obj.exportFormats || []
  };
};
