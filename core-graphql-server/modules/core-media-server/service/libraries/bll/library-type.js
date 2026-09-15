'use strict';

const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');
const model = require('../model');

module.exports = function init(dal) {
  if (!dal || !dal.libraryType) {
    throw new Error('dal.libraryType is required');
  }

  return {
    getLibraryTypes,
    getLibraryType,
    createLibraryType,
    updateLibraryType
  };

  /**
   * Fetches a list of library types
   * @param {Object} [params={}] - optional query params
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getLibraryTypes(params = {}) {
    return dal.libraryType
      .getLibraryTypes(params)
      .then(function resolve(result) {
        if (result.results) {
          result.results.forEach(function each(libraryType) {
            if (libraryType.entityType) {
              libraryType.entityType.enableStringifySchema();
            }
          });
        }

        return result;
      });
  }

  /**
   * Fetches a library type
   * @param {String} libraryTypeId - id of the library type to fetch
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getLibraryType(libraryTypeId) {
    if (!libraryTypeId) {
      return Promise.reject(new Error('libraryTypeId is required'));
    }

    return getLibraryTypes({ libraryType: libraryTypeId }).then(
      function resolve(result) {
        return (result.results && result.results[0]) || null;
      }
    );
  }

  /**
   * Updates a library type
   * @param {Object} libraryType - an object containing the library type fields to update
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function updateLibraryType(libraryType) {
    if (!(libraryType instanceof model.LibraryType)) {
      libraryType = new model.LibraryType(libraryType);
    }

    // validate fields
    const validationErrs = libraryType.validate();

    if (validationErrs) {
      throw new BadRequestError('Validation failed', validationErrs);
    }

    return dal.libraryType.connectionPools.write.tx(t => {
      return dal.libraryType
        .updateLibraryType(libraryType, t)
        .then(function deleteExistingLinks() {
          return dal.libraryType.deleteEntityIdentifierLinks(libraryType, t);
        })
        .then(function saveLinks() {
          return dal.libraryType.saveEntityIdentifierLinks(libraryType, t);
        });
    });
  }

  /**
   * Creates a new library type
   * @param {Object} libraryType - an object containing the library type data
   * @return {Promise} a promise that resolves with the created resource or rejects with
   * 						an error message
   */
  function createLibraryType(libraryType) {
    if (!(libraryType instanceof model.LibraryType)) {
      libraryType = new model.LibraryType(libraryType);
    }

    // validate fields
    const validationErrs = libraryType.validate();

    if (validationErrs) {
      return Promise.reject(
        new BadRequestError('Validation failed', validationErrs)
      );
    }

    const { entityIdentifierTypes } = libraryType;
    if (Array.isArray(entityIdentifierTypes) && entityIdentifierTypes.length) {
      return dal.libraryType.connectionPools.write.tx(t => {
        return dal.libraryType
          .createLibraryType(libraryType, t)
          .then(function saveLinks() {
            return dal.libraryType.saveEntityIdentifierLinks(libraryType, t);
          });
      });
    }

    return dal.libraryType.createLibraryType(libraryType);
  }
};
