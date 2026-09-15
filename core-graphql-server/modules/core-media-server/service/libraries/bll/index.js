'use strict';

const EventEmitter = require('events');
const _ = require('lodash');
const model = require('../model');

module.exports = function initLibrariesBlls(serviceContext) {
  const { config, logger, dbConnections } = serviceContext;

  if (!config) {
    throw new Error('config is required');
  }

  if (!logger) {
    throw new Error('logger is required');
  }

  if (!dbConnections) throw new Error('dbConnections is required');

  const storage = _.get(serviceContext, 's3Buckets.library.storage');
  if (!storage) {
    throw new Error('library storage is required');
  }

  const resolversUtil = require('../../../../../resolvers/util.js')(
    serviceContext
  );

  const dal = require('../dal')(config, logger, dbConnections);
  const uploader = require('../../../util/file-upload')(
    serviceContext,
    storage
  );
  const eventEmitter = new EventEmitter();

  const entityIdentifierType = require('./entity-identifier-type')(dal);
  const libraryType = require('./library-type')(dal);
  const libraryEngineModel = require('./library-engine-model')(
    dal,
    uploader,
    serviceContext
  );
  const libraryCollaborator = require('./library-collaborator')(dal);
  const entityIdentifier = require('./entity-identifier')(
    dal,
    entityIdentifierType,
    uploader,
    eventEmitter
  );
  const entity = require('./entity')(
    dal,
    entityIdentifier,
    uploader,
    eventEmitter,
    logger
  );
  const library = require('./library')(
    dal,
    entity,
    libraryEngineModel,
    libraryCollaborator,
    uploader,
    logger
  );

  const subServices = {
    entityIdentifierType,
    libraryType,
    libraryEngineModel,
    libraryCollaborator,
    entityIdentifier,
    entity,
    library
  };

  // inject s3 url signer into models
  // use appropriate signer based on bucket [inspirent, library, api]
  for (const key in model) {
    model[key].signURL = resolversUtil.getSignedUrl;
  }

  return Object.assign({ flatten }, subServices);

  /**
   * Flattens the methods from each subservice into a single object
   * @return {Object} an object containing the methods of the subservices
   */
  function flatten() {
    return _.values(subServices).reduce(Object.assign, {});
  }
};
