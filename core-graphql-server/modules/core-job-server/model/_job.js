'use strict';

const embeddedModelArray = require('@veritone/core-server-base/model/util/embedded-model-array');
const util = require('./util')();

module.exports = function init(taskModel) {
  const jobModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      jobId: { type: 'string' },
      applicationId: { type: 'string' },
      recordingId: { type: 'string' },
      sourceAssetId: { type: 'string' },
      bundleId: { type: 'string' },
      clusterId: { type: 'string' },
      organizationId: { type: 'number' },
      jobStatus: { type: 'string' },
      createdDateTime: { type: 'number' },
      modifiedDateTime: { type: 'number' },
      retries: { type: 'number' },
      deletedDateTime: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },

      // generated fields
      tasks: embeddedModelArray({
        model: taskModel,
        modelName: 'Task'
      }),
      jobTemplateId: { type: 'string' },
      scheduledJobId: { type: 'string' },
      jobConfig: { type: 'json' }
    }
  );

  return jobModel;
};
