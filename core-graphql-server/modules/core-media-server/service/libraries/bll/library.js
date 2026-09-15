'use strict';

const path = require('path');
const util = require('util');
const _ = require('lodash');
const mime = require('mime-types');
const moment = require('moment');
const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');
const {
  Library,
  Entity,
  LibrarySummary,
  LibraryEngineModel,
  LibraryCollaborator
} = require('../model');

module.exports = function init(
  dal,
  entityBll,
  libraryEngineModelBll,
  libraryCollaboratorBll,
  uploader,
  logger
) {
  if (!dal || !dal.library) {
    throw new Error('bll is required');
  }

  if (!dal.entity) {
    throw new Error('dal.entity is required');
  }

  if (!entityBll) {
    throw new Error('entityBll is required');
  }

  if (!libraryEngineModelBll) {
    throw new Error('libraryEngineModelBll is required');
  }

  if (!libraryCollaboratorBll) {
    throw new Error('libraryCollaboratorBll is required');
  }

  if (!uploader) {
    throw new Error('uploader is required');
  }

  if (!logger) {
    throw new Error('logger is required');
  }

  return {
    getLibraries,
    getLibrary,
    createLibrary,
    updateLibrary,
    deleteLibrary,
    publishLibraryVersion,
    saveLibraryWithEntities,
    uploadLibraryCoverImage
  };

  /**
   * Fetches a list of libraries
   * @param {Object} [params={}] - optional query params
   * @param {Object} [includes={}] - a map specifying subdocs to include with each result
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getLibraries(params = {}, includes = {}) {
    if (includes.permissions) {
      includes.collaborator = includes.permissions;
    }

    return dal.library
      .getLibraries(params, includes)
      .then(function resolveLibraries(result) {
        const libraries = result.results;
        const promises = [];

        // fetch associated library summary data if enabled
        if (includes.summary) {
          promises.push(appendSummaries(libraries));
        }

        if (includes.owner) {
          promises.push(appendOwnerOrganizations(libraries));
        }

        return Promise.all(promises).then(function resolveAll() {
          if (includes.permissions) {
            appendPermissions(libraries);
          }

          return result;
        });
      });
  }

  /**
   * Fetches a library
   * @param {String} libraryId - id of the library to fetch
   * @param {Object} [additionalParams={}] - an object containing additional query params
   * @param {Object} [includes={}] - a map specifying subdocs to include with each result
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getLibrary(libraryId, additionalParams = {}, includes = {}) {
    if (!libraryId) {
      return Promise.reject(new Error('libraryId is required'));
    }

    const params = Object.assign({}, additionalParams, { libraryId });

    return getLibraries(params, includes).then(function resolve(result) {
      return (result.results && result.results[0]) || null;
    });
  }

  /**
   * Updates a library
   * @param {Object} library - an object representing the library to update
   * @param {Object} updateData - an object containing the updated library fields
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function updateLibrary(library, updateData) {
    const currentCoverImageUrl = library.coverImageUrl;
    const { coverImageUrl } = (library = Library.normalize(updateData));

    // validate fields
    const validationErrs = library.validate();

    if (validationErrs) {
      return Promise.reject(
        new BadRequestError('Validation failed', validationErrs)
      );
    }

    if (coverImageUrl && currentCoverImageUrl != coverImageUrl.toString()) {
      return uploader
        .readFromURL(coverImageUrl.href)
        .then(
          function resolveURL(file) {
            return uploadLibraryCoverImage(library, file);
          },
          function rejectURL(err) {
            throw new BadRequestError(null, { coverImageUrl: err.message });
          }
        )
        .then(dal.library.updateLibrary);
    }

    return dal.library.updateLibrary(library);
  }

  /**
   * Creates a new library
   * @param {Object} library - an object containing the library fields
   * @return {Promise} a promise that resolves with the created resource or rejects with
   * 						an error message
   */
  function createLibrary(library) {
    library = Library.normalize(library);
    library.generateId();

    // validate library model
    const validationErrs = library.validate();

    if (validationErrs) {
      return Promise.reject(
        new BadRequestError('Validation failed', validationErrs)
      );
    }

    if (library.coverImageUrl) {
      const url = library.coverImageUrl.href;

      return uploader
        .readFromURL(url)
        .then(
          function resolveURL(file) {
            return uploadLibraryCoverImage(library, file);
          },
          function rejectURL(err) {
            throw new BadRequestError(null, { coverImageUrl: err.message });
          }
        )
        .then(dal.library.createLibrary);
    }

    // NOTE disabling support for this until we need it
    // if entities are included, create those entities with the library
    // if (Array.isArray(data.entities) && data.entities.length) {
    // 	return saveLibraryWithEntities(library, data.entities, false);
    // }

    return dal.library.createLibrary(library);
  }

  /**
   * Deletes a library
   * @param {String} libraryId - the id of the library to delete
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteLibrary(libraryId) {
    if (!libraryId) {
      return Promise.reject(new BadRequestError('libraryId is required'));
    }

    const library = new Library({ libraryId });

    return dal.library.connectionPools.write.tx(t => {
      // delete dependent resources
      const promises = Promise.all([
        entityBll.deleteEntities(library, t),
        libraryEngineModelBll.deleteLibraryEngineModels(library, t),
        libraryCollaboratorBll.deleteLibraryCollaborators(library, t)
      ]);

      return promises.then(function deleteLibrary() {
        return dal.library.deleteLibrary(library, t);
      });
    });
  }

  /**
   * Increments a libraries version number
   * @param {String} libraryId - an object containing the library fields to match
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function publishLibraryVersion(libraryId) {
    if (!libraryId) {
      return Promise.reject('libraryId is required');
    }

    const library = new Library({ libraryId });

    return dal.library
      .incrementVersion(library)
      .then(function resolve(library) {
        const entity = new Entity({ libraryId });

        // this task can run asynchronously, we don't need to wait for it
        resyncLibraryIndex(library).catch(function reject(err) {
          logger.error(
            `An error occurred while resyncing entity documents from library ${
              library.libraryId
            } in elastic search: ` + err
          );
        });

        return dal.entity.setIsPublishedFlag(entity).then(() => library);
      });
  }

  /**
   * Uploads a new cover image for the library
   * @param {Object} library - an object containing the library data
   * @param {Object} file - an object containing the image file contents and content type
   * @param {Buffer|Uint8Array|String} file.content - the image file contents
   * @param {String} file.contentType - the image file content type
   * @return {Promise} a promise that resolves with the updated library or rejects with
   * 						an error message
   */
  function uploadLibraryCoverImage(library, file) {
    const { libraryId } = Library.normalize(library);
    const { content, contentType } = file;

    if (!libraryId) {
      return Promise.reject(new Error('library.libraryId is required'));
    }

    const extension = mime.extension(contentType);

    if (!extension || !contentType.match(/^image\//i)) {
      return Promise.reject(new BadRequestError('Unsupported Content-Type'));
    }

    // TODO verify file contents are actually an image
    const filename = util.format(
      'cover-%s.%s',
      new Date().getTime(),
      extension
    );
    const now = moment();
    const destPath = `${library.organizationId ||
      library.ownerOrgId}/library/${now.year()}/${now.month()}/${now.day()}/${libraryId}/${filename}`;

    return uploader
      .uploadContent(content, contentType, destPath)
      .then(function resolveUpload(location) {
        library.coverImageUrl = location;
        return library;
      });
  }

  /**
   * Creates or updates a library and adds new entities to it in a single transaction
   * @param {Library} library - an instance of a library model
   * @param {Object[]} entitiesData - an array of objects each containing the entity fields
   * @return {Promise} a promise that resolves with the created resource or rejects with
   * 						an error message
   */
  function saveLibraryWithEntities(library, entitiesData, isUpdate) {
    const entities = [];

    for (let i in entitiesData) {
      entitiesData[i].libraryId = library.libraryId;

      const entity = new Entity(entitiesData[i]);
      entity.generateId();

      // validate entity model
      const validationErrs = entity.validate();

      if (validationErrs) {
        // TODO validate all entities before rejecting?
        return Promise.reject(
          new BadRequestError('Validation failed', validationErrs)
        );
      }

      entities.push(entity);
    }

    return dal.library.connectionPools.write.tx(t => {
      let promise = isUpdate
        ? dal.library.updateLibrary(library, t)
        : dal.library.createLibrary(library, t);

      return promise.then(function resolveLibrary(insertedLibrary) {
        if (!insertedLibrary) {
          throw new Error('insert/update did not return a library');
        }

        return entityBll
          .createEntities(insertedLibrary, entities, t)
          .then(function resolveEntities(insertedEntities) {
            insertedLibrary.entities = insertedEntities;
            return insertedLibrary;
          });
      });
    });
  }

  /**
   * Generates and appends a library summary model to each Library model
   * @param {Library[]} libraries - an array of Library model instances
   * @return {Promise} a promise that resolves on success or rejects with
   * 						an error message
   * @private
   */
  function appendSummaries(libraries) {
    if (!Array.isArray(libraries)) {
      return Promise.reject(new Error('Expected an array'));
    }

    const promises = [];

    if (libraries.length) {
      const libraryIds = [];
      libraries.forEach(function eachLibrary(library) {
        libraryIds.push(library.libraryId);
        library.summary = new LibrarySummary({
          entityCount: 0,
          unpublishedEntityCount: 0,
          lastTrainedVersion: null,
          lastTrainedDateTime: null
        });
      });

      // get entity count for each library
      let params = {
        libraryId: libraryIds,
        limit: libraryIds.length
      };

      promises.push(
        dal.entity
          .getEntityCountByLibrary(params)
          .then(function appendCounts(result) {
            const summaryMap = _.keyBy(result.results, 'libraryId');

            libraries.forEach(function eachLibrary(library) {
              if (summaryMap[library.libraryId]) {
                library.summary.entityCount =
                  summaryMap[library.libraryId].entityCount;
                library.summary.unpublishedEntityCount =
                  summaryMap[library.libraryId].unpublishedEntityCount;
              }
            });
          })
      );

      // get last trained date and version for each library
      params = {
        libraryId: libraryIds,
        trainStatus: [LibraryEngineModel.statusEnum.complete],
        lastModified: true,
        limit: libraryIds.length
      };

      promises.push(
        libraryEngineModelBll
          .getLibraryEngineModels(params)
          .then(function appendDates(result) {
            const engineModelMap = _.keyBy(result.results, 'library.libraryId');

            libraries.forEach(function eachLibrary(library) {
              if (engineModelMap[library.libraryId]) {
                library.summary.lastTrainedVersion =
                  engineModelMap[library.libraryId].libraryVersion;
                library.summary.lastTrainedDateTime =
                  engineModelMap[library.libraryId].modifiedDateTime;
              }
            });
          })
      );
    }

    return Promise.all(promises);
  }

  /**
   * Appends permissions and ownership type for each provided library
   * @param {Library[]} libraries - an array of Library model instances
   * @private
   */
  function appendPermissions(libraries) {
    libraries.forEach(function each(library) {
      let permissions, ownershipType;

      if (library.collaborator) {
        permissions = library.collaborator.permissions;
        ownershipType = LibrarySummary.ownershipTypeEnum.collaborator;
        _.unset(library, 'collaborator');
      } else {
        permissions = _.values(LibraryCollaborator.permissionTypeEnum);
        ownershipType = LibrarySummary.ownershipTypeEnum.owner;
      }

      const summary = new LibrarySummary({
        ownershipType,
        permissions
      });

      if (library.summary) {
        Object.assign(
          library.summary,
          _.pick(summary, ['ownershipType', 'permissions'])
        );
      } else {
        library.summary = summary;
      }
    });
  }

  /**
   * Appends owner organization info to each provided library
   * @param {Library[]} libraries - an array of Library model instances
   * @return {Promise} a promise that resolves on success or rejects with
   * 						an error message
   * @private
   */
  function appendOwnerOrganizations(libraries) {
    if (!Array.isArray(libraries)) {
      return Promise.reject(new Error('Expected an array'));
    }

    if (!libraries.length) {
      return Promise.resolve();
    }

    const ownerOrgIds = libraries.map(library => library.ownerOrgId);
    const params = { organizationId: ownerOrgIds };

    return dal.organization
      .getOrganizations(params)
      .then(function appendOrgs(result) {
        const orgMap = _.keyBy(result.results, 'organizationId');

        libraries.forEach(function eachLibrary(library) {
          if (orgMap[library.ownerOrgId]) {
            library.owner = orgMap[library.ownerOrgId];
            _.unset(library, 'ownerOrgId');
          }
        });
      });
  }

  function resyncLibraryIndex(library) {
    const params = {
      libraryId: library.libraryId,
      isDeleted: true,
      limit: 50
    };

    let totalDeleted = 0;
    let totalUpdated = 0;

    // get deleted library entities and sync with elastic index
    return dal.entity
      .getEntities(params)
      .then(processDeletes)
      .then(function resolve() {
        logger.debug(
          totalDeleted +
            ' deleted entities resynced from library ' +
            library.libraryId
        );

        // get the rest of the library entities and resync
        params.isDeleted = false;
        params.offset = 0;

        return dal.entity
          .getEntities(params)
          .then(processUpdates)
          .then(function resolve() {
            logger.debug(
              totalUpdated +
                ' active entities resynced from library ' +
                library.libraryId
            );
          });
      });

    function processDeletes(result) {
      const entities = result.results;

      if (entities && entities.length) {
        totalDeleted += entities.length;

        return new Promise(function resolver(resolve, reject) {
          dal.searchIndex.sync._bulkDeleteEntities(entities, function cb(err) {
            if (err) {
              return reject('Failed to bulk delete entity documents: ' + err);
            }

            if (totalDeleted < result.totalResults) {
              params.offset = result.to + 1;
              return resolve(
                dal.entity.getEntities(params).then(processDeletes)
              );
            }

            resolve();
          });
        });
      }
    }

    function processUpdates(result) {
      const entities = result.results;

      if (entities && entities.length) {
        totalUpdated += entities.length;

        return new Promise(function resolver(resolve, reject) {
          dal.searchIndex.sync._bulkUpdateEntities(entities, function cb(err) {
            if (err) {
              return reject('Failed to bulk update entity documents: ' + err);
            }

            if (totalUpdated < result.totalResults) {
              params.offset = result.to + 1;
              return resolve(
                dal.entity.getEntities(params).then(processUpdates)
              );
            }

            resolve();
          });
        });
      }
    }
  }
};
