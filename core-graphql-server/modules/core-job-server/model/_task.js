'use strict';

const util = require('./util')();

module.exports = function init() {
  const taskModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      taskId: { type: 'string' },
      jobId: { type: 'string' },
      engineId: { type: 'string' },
      buildId: { type: 'string' },
      applicationId: { type: 'string' },
      recordingId: { type: 'string' },
      taskExecutor: { type: 'string' },
      taskExecutorId: { type: 'string' },
      taskStatus: { type: 'string' },
      taskPayload: { type: 'json' },
      payload: { type: 'json' },
      parentTaskId: { type: 'string' },
      taskLog: { type: 'string' },
      taskOutput: { type: 'json' },
      testTask: { type: 'boolean' },
      taskOrder: { type: 'number' },
      enginePrice: { type: 'number' },
      customerPrice: { type: 'number' },
      rateCardPrice: { type: 'number' },
      failureType: { type: 'string' },
      isClone: { type: 'boolean' },
      sourceAssetId: { type: 'string' },
      mediaLengthSecs: { type: 'number' },
      mediaStorageBytes: { type: 'number' },
      standbyForTaskId: { type: 'string' },
      createdDateTime: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      queuedDateTime: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      modifiedDateTime: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      completedDateTime: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      startedDateTime: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      cancelledDateTime: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      engineName: { type: 'string' },
      engineCategoryName: { type: 'string' },
      runTime: { type: 'number' },
      assetSelector: { type: 'json' }
    }
  );

  return taskModel;
};
