'use strict';

const _ = require('lodash');

/**
 * Generates a validate function that checks for a completed training model for a task's
 * engine and library (if one specified in the task payload)
 * @param {String} token - an api token
 * @param {Object} config - an object containing config values
 * @return {Function} a validate function taking the task object as its first argument
 *     and a callback as its second. The callback will be called with an
 *     error on failure, validation error object on validaton failure, or
 *     undefined if validation passed
 */
module.exports = function generateValidator(dalLibrary) {
  return validate;

  function validate(task, callback) {
    if (!task) {
      return callback(new Error('a task is required'));
    }

    if (!callback) {
      return callback(new Error('callback is required'));
    }

    const engineId = task.engineId;
    const libraryId = _.get(task, 'taskPayload.libraryId');
    const libraryEngineModelId = _.get(
      task,
      'taskPayload.libraryEngineModelId'
    );

    if (!libraryId) {
      return callback();
    }

    let validationPromise;

    if (libraryEngineModelId) {
      validationPromise = verifyLibraryEngineModel(
        libraryId,
        libraryEngineModelId
      )
        .then(function resolve(libraryEngineModel) {
          if (!libraryEngineModel || !libraryEngineModel.id) {
            return {
              'taskPayload.libraryEngineModelId': `The library engine model ${libraryEngineModelId} does not exist.`
            };
          }

          if (libraryEngineModel.libraryId !== libraryId) {
            return {
              'taskPayload.libraryEngineModelId': `The library engine model ${libraryEngineModelId} does not belong to ${libraryId}.`
            };
          }

          if (libraryEngineModel.engineId !== engineId) {
            return {
              'taskPayload.libraryEngineModelId': `The library engine model ${libraryEngineModelId} does not belong to engine ${engineId}.`
            };
          }
        })
        .catch((err) => {
          return {
            'taskPayload.libraryEngineModelId': `The library engine model ${libraryEngineModelId} does not exist.`
          };
        });
    } else if (task.isTrainingTask()) {
      validationPromise = Promise.resolve({
        'taskPayload.libraryEngineModelId':
          'libraryEngineModelId is required for train mode.'
      });
    } else {
      validationPromise = getMostRecentLibraryEngineModel(libraryId, engineId)
        .then(function resolve(libraryEngineModel) {
          if (!libraryEngineModel || !libraryEngineModel.id) {
            return {
              'taskPayload.libraryId':
                'The engine has not been trained using the provided library: ' +
                libraryId
            };
          }

          // add the id of the library's most recent engine model to the task payload
          task.taskPayload.libraryEngineModelId = libraryEngineModel.id;
        })
        .catch((err) => {
          return {
            'taskPayload.libraryId': _.get(err, 'message', JSON.stringify(err))
          };
        });
    }
    if (task.isTrainingTask()) {
      // if engine is not library-enabled
      if (task.engine && !task.engine.libraryRequired) {
        validationPromise = Promise.resolve({
          'taskPayload.runMode': `The engine ${engineId} does not use libraries and cannot accept library-train run mode.`
        });
      }
    }
    validationPromise.then(function resolve(validationErrors) {
      // if the payload has a libraryId, but no mode param, default to "library-run" mode
      if (!validationErrors && !task.getPayloadMode()) {
        task.setToLibraryRunMode();
      }

      callback(null, validationErrors);
    }, callback);
  }

  async function getMostRecentLibraryEngineModel(libraryId, engineId) {
    const library = await dalLibrary.getLibrary({ id: libraryId });
    const res = await dalLibrary.getLibraryEngineModels({
      ownerOrgId: library.ownerOrgId,
      libraryId,
      engineId,
      trainStatus: 'complete',
      limit: 1
    });

    return _.get(res, 'records[0]');
  }

  async function verifyLibraryEngineModel(libraryId, libraryEngineModelId) {
    return dalLibrary.getLibraryEngineModel({
      id: libraryEngineModelId
    });
  }
};
