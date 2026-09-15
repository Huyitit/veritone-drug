'use strict';

const _ = require('lodash');
const validatejs = require('validate.js');
const util = require('./util')();

module.exports = function init() {
  var engineModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      engineId: { type: 'string', required: true },
      engineName: { type: 'string', convert: util.stripHtmlTags },
      engineCategoryId: { type: 'string' },
      engineDescription: { type: 'string' },
      engineState: { type: 'string' },
      engineCurrency: { type: 'string' },
      deploymentModel: { type: 'number' }, // https://steel-ventures.atlassian.net/wiki/display/VDH/Engine+Deployment+Models
      ownerOrganizationId: { type: 'number' },
      validStateActions: { type: 'json' },
      deleted: { type: 'boolean' },
      isPublic: { type: 'boolean' },
      price: { type: 'number' },
      priceDimension: { type: 'string' },
      createdDate: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      updatedDate: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      asset: { type: 'string' },
      dependency: { type: 'json' },
      logoPath: { type: 'string', convert: util.stripHtmlTags },
      iconPath: { type: 'string', convert: util.stripHtmlTags },
      website: { type: 'string' },
      rating: { type: 'number' },
      coreJobData: { type: 'json' },
      fields: { type: 'json' },
      applicationId: { type: 'json' },
      validation: { type: 'json' },
      createsRecording: { type: 'boolean' },
      libraryRequired: { type: 'boolean' },
      jwtRights: { type: 'json' },
      // permissions
      blacklistOrgIds: { type: 'json' },
      whitelistOrgIds: { type: 'json' },
      // sql aggregations
      buildCount: { type: 'number' },
      // alias fields
      engineAliasId: { type: 'string' },
      engineAliasName: { type: 'string', convert: util.stripHtmlTags },
      engineAliasDescription: { type: 'string' },
      engineAliasLogoPath: { type: 'string', convert: util.stripHtmlTags },
      manifest: { type: 'json' },
      buildCapability: {
        type: 'json',
        convert: (value, data, self, key) => {
          let capabilityKey = data['capabilityKey'],
            capabilityValue = data['capabilityValue'];
          if (capabilityKey && capabilityValue) {
            self[key] = {
              [capabilityKey]: capabilityValue
            };
          }
        }
      },
      useCases: { type: 'json' },
      industries: { type: 'json' },
      engineManifest: { type: 'json' },
      edgeVersion: { type: 'number' },
      singleEngineTdoJobJson: { type: 'json' },
      singleEngineUploadJobJson: { type: 'json' },
      cpuResourceMcpu: { type: 'number' },
      gpuSupported: { type: 'string' },
      gpuTier: { type: 'string' },
      metadataVersion: { type: 'number' },
      distributionType: { type: 'string' },
      inputTypes: { type: 'json' }
    }
  );

  const internalFields = ['coreJobData'];

  engineModel.prototype.generateFilteredTaskType = function generateFilteredTaskType() {
    return _.omit(this, internalFields);
  };

  engineModel.prototype.validateTask = function validateTask(task, callback) {
    if (typeof task !== 'object') {
      throw new Error('Missing task!');
    }
    if (typeof callback !== 'function') {
      throw new Error('Missing callback!');
    }

    let validationErrors;
    if (this.validation) {
      validationErrors = validatejs(task.taskPayload, this.validation);
    }

    if (this.libraryRequired) {
      const libraryId = _.get(task, 'taskPayload.libraryId');

      if (!libraryId) {
        validationErrors = Object.assign(validationErrors || {}, {
          'taskPayload.libraryId': 'libraryId is required'
        });
      }
    }

    callback(null, validationErrors);
  };

  return engineModel;
};
