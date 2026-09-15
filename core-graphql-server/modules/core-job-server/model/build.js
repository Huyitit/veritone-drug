'use strict';

const util = require('./util')();

module.exports = function init() {
  var buildModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      engineId: { type: 'string', required: true },
      buildId: { type: 'string', required: true },
      price: { type: 'number', required: true },
      version: { type: 'number' },
      dockerImage: { type: 'string' },
      taskRuntime: { type: 'json' },
      isLegacy: { type: 'boolean' },
      validateUri: { type: 'string', required: true },
      executeUri: { type: 'string', required: true },
      buildState: { type: 'string' },
      deploymentModel: { type: 'number' }, // https://steel-ventures.atlassian.net/wiki/display/VDH/Engine+Deployment+Models
      validStateActions: { type: 'json' },
      buildSize: { type: 'number' },
      vulLowCount: { type: 'number' },
      vulMediumCount: { type: 'number' },
      vulHighCount: { type: 'number' },
      vulCriticalCount: { type: 'number' },
      deployDate: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
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
      manifest: { type: 'json' },
      dataCertified: { type: 'json' },
      releaseNotes: { type: 'string' }
    }
  );

  return buildModel;
};
