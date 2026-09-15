'use strict';

const embeddedModel = require('@veritone/core-server-base/model/util/embedded-model');

module.exports = function init(jobBundleScheduleDefinition) {
  const jobBundleCreateModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      clusterId: { type: 'string', required: true },
      nodeId: { type: 'string' },
      displayName: { type: 'string', required: true },
      externalCredentialId: { type: 'string' },
      testRun: { type: 'boolean' },
      selectDetail: { type: 'json', required: true },
      scheduleDefinition: embeddedModel({
        model: jobBundleScheduleDefinition,
        modelName: 'ScheduleDefinition'
      }),
      selectCategory: { type: 'string', required: true }
    }
  );

  return jobBundleCreateModel;
};
