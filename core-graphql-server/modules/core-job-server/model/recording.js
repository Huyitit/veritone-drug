'use strict';

const util = require('./util')();

module.exports = function init() {
  const recordingModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      recordingId: { type: 'number' },
      json: { type: 'json' },
      startDateTime: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      stopDateTime: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      applicationId: { type: 'string' },
      programId: { type: 'number', dbKey: 'scheduled_job_id' }
    }
  );

  return recordingModel;
};
