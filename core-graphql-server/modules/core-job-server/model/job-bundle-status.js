'use strict';

const util = require('./util')();

module.exports = function init() {
  const jobBundleStatusModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      bundleStarted: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      bundleCompleted: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      bundleResults: { type: 'json', required: true },
      markAsCompleted: { type: 'boolean' }
    }
  );

  return jobBundleStatusModel;
};
