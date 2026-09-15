'use strict';

const _ = require('lodash');
const util = require('./util')();

module.exports = function init() {
  var engineUpdateModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      engineName: {
        type: 'string',
        required: true,
        convert: util.stripHtmlTags
      },
      engineCategoryId: { type: 'string', required: true },
      engineDescription: { type: 'string', required: true },
      engineCurrency: { type: 'string' },
      deploymentModel: { type: 'number', required: true },
      isPublic: { type: 'boolean', required: true },
      libraryRequired: { type: 'boolean' },
      logoPath: { type: 'string', convert: util.stripHtmlTags },
      iconPath: { type: 'string', convert: util.stripHtmlTags },
      executeUri: { type: 'string' },
      fields: { type: 'json' },
      coreJobData: { type: 'json' },
      useCases: { type: 'json' },
      industries: { type: 'json' },
      engineManifest: { type: 'json' },
      price: { type: 'number' },
      priceDimension: { type: 'string' },
      jwtRights: { type: 'json', validate: validateJWTRights },
      edgeVersion: { type: 'number' },
      cpuResourceMcpu: { type: 'number' },
      gpuSupported: { type: 'string' },
      gpuTier: { type: 'string' },
      website: { type: 'string' },
      metadataVersion: { type: 'number' },
      distributionType: { type: 'string' }
    }
  );

  function validateJWTRights(value, attributes, key) {
    const error = {};

    // not required
    if (!value) {
      return;
    }

    // engineUpdate.isPublic is required from the coreJob model
    if (value && attributes.isPublic) {
      error[key] = { message: 'cannot update jwtRights for public engines' };
      return error;
    }

    if (!_.has(value, 'roles')) {
      error[key] = { message: 'should have roles array' };
      return error;
    }

    _.forEach(value.roles, function checkRolesItems(item, index) {
      Object.keys(item).forEach(function checkRolesKey(key) {
        if (!['roleName', 'taskRights', 'assetRights'].includes(key)) {
          error[key] = { message: `invalid key "${key}" for roles[${index}]` };
          return error;
        }
      });

      if (!_.has(item, 'roleName')) {
        error[key] = { message: `roles[${index}] should have roleName` };
        return error;
      }
      if (!_.isString(item.roleName)) {
        error[key] = { message: `roles[${index}].roleName should be a string` };
        return error;
      }
      if (_.has(item, 'taskRights')) {
        _.forEach(item.taskRights, function checkStrings(right) {
          if (!_.isString(right)) {
            error[key] = {
              message: `roles[${index}].taskRights should contain strings`
            };
            return error;
          }
        });
      }
      if (_.has(item, 'assetRights')) {
        _.forEach(item.assetRights, function checkStrings(right) {
          if (!_.isString(right)) {
            error[key] = {
              message: `roles[${index}].assetRights should contain strings`
            };
            return error;
          }
        });
      }
    });

    return _.size(error) ? error : null;
  }

  return engineUpdateModel;
};
