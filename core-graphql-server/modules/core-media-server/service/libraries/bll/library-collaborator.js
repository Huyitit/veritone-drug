'use strict';

const _ = require('lodash');
const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');
const { LibraryCollaborator } = require('../model');

module.exports = function init(dal) {
  if (!dal || !dal.libraryCollaborator) {
    throw new Error('dal.libraryCollaborator is required');
  }

  return {
    getLibraryCollaborators,
    getLibraryCollaborator,
    createLibraryCollaborator,
    updateLibraryCollaborator,
    deleteLibraryCollaborators
  };

  /**
   * Fetches a list of library collaborator resources
   * @param {Object} [params={}] - optional params to limit the query with
   * @return {Promise} a promise that resolves with the result or rejects with an error message
   */
  function getLibraryCollaborators(params = {}) {
    return dal.libraryCollaborator.getLibraryCollaborators(params);
  }

  /**
   * Fetches the library-collaborator resource for a specific library and org id
   * @param {String} libraryId - id of the library
   * @param {String} collaboratorOrgId - org id of the collaborator
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getLibraryCollaborator(
    libraryId,
    collaboratorOrgId,
    additionalParams = {}
  ) {
    if (!libraryId) {
      return Promise.reject(new Error('libraryId is required'));
    }

    if (!collaboratorOrgId) {
      return Promise.reject(new Error('collaboratorOrgId is required'));
    }

    const params = Object.assign({}, additionalParams, {
      libraryId,
      collaboratorOrgId
    });

    return getLibraryCollaborators(params).then(function resolve(result) {
      return (result.results && result.results[0]) || null;
    });
  }

  /**
   * Updates a library collaborator resource
   * @param {Object} libraryCollaborator - an object containing the library collaborator fields to update
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function updateLibraryCollaborator(libraryCollaborator) {
    libraryCollaborator = LibraryCollaborator.normalize(libraryCollaborator);

    // validate fields
    const validationErrs = libraryCollaborator.validate();

    if (validationErrs) {
      throw new BadRequestError('Validation failed', validationErrs);
    }

    return dal.libraryCollaborator.updateLibraryCollaborator(
      libraryCollaborator
    );
  }

  /**
   * Creates a new library collaborator resource
   * @param {Object} entity - an object containing the library collaborator data
   * @return {Promise} a promise that resolves with the inserted resource or rejects with
   * 						an error message
   */
  function createLibraryCollaborator(libraryCollaborator) {
    libraryCollaborator = LibraryCollaborator.normalize(
      _.defaults(libraryCollaborator, {
        status: LibraryCollaborator.statusEnum.active
      })
    );

    // validate fields
    const validationErrs = libraryCollaborator.validate();

    if (validationErrs) {
      return Promise.reject(
        new BadRequestError('Validation failed', validationErrs)
      );
    }

    return dal.libraryCollaborator.createLibraryCollaborator(
      libraryCollaborator
    );
  }

  /**
   * Deletes the library collaborator resources matching the given params
   * @param {Object} matchParams - an object containing the library collaborator fields to match
   * @param {Object} [transaction] - optional DAL transaction
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteLibraryCollaborators(matchParams, transaction) {
    const client = transaction ? transaction.client : null;
    matchParams = new LibraryCollaborator(matchParams);

    return dal.libraryCollaborator.deleteLibraryCollaborators(
      matchParams,
      client
    );
  }
};
