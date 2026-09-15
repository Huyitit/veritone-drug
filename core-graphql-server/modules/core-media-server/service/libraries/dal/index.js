'use strict';

const _ = require('lodash');
const searchIndex = require('./search-elastic');
const schemaName = 'libraries';

module.exports = function initLibrariesDals(config, logger, dbConnections) {
  if (!config) {
    throw new Error('config is required');
  }

  if (!logger) {
    throw new Error('logger is required');
  }

  if (!dbConnections) throw new Error('dbConnections is required');

  const conn = Object.assign(initConnections('core'), { schemaName });
  const paging = require('../../../util/pagination')(config.paging);
  const library = require('./library')(conn, paging, searchIndex.init(config));
  const searchIndexEventEmitter = searchIndex.init(config, library);

  return {
    library,
    libraryType: require('./library-type')(conn, paging),
    libraryEngineModel: require('./library-engine-model')(conn, paging),
    libraryCollaborator: require('./library-collaborator')(conn, paging),
    entity: require('./entity')(conn, paging, searchIndexEventEmitter),
    entityIdentifier: require('./entity-identifier')(conn, paging),
    entityIdentifierType: require('./entity-identifier-type')(conn, paging),
    organization: require('./organization')(initConnections('sso'), paging),
    searchIndex: searchIndexEventEmitter
  };

  function initConnections(name) {
    return {
      read: dbConnections[name].read,
      write: dbConnections[name].write
    };
  }
};
