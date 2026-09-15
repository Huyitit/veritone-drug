'use strict';

const util = require('./util')();
const embeddedModel = require('@veritone/core-server-base/model/util/embedded-model');

module.exports = function init(
  jobBundleSelectDetail,
  jobBundleScheduleDefinition
) {
  const jobBundleModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      bundleId: { type: 'string' },
      organizationId: { type: 'number' },
      clusterId: { type: 'string' },
      nodeId: { type: 'string' },
      displayName: { type: 'string' },
      externalCredentialId: { type: 'string' },
      testRun: { type: 'boolean' },
      selectDetail: embeddedModel({
        model: jobBundleSelectDetail,
        modelName: 'SelectDetail'
      }),
      scheduleDefinition: embeddedModel({
        model: jobBundleScheduleDefinition,
        modelName: 'ScheduleDefinition'
      }),
      selectCategory: { type: 'string' },
      bundleResults: { type: 'json' },
      bundleStarted: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      previousBundleStarted: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      bundleCompleted: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      deletedDate: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      createdDate: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      nextScheduledTime: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      updatedDate: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      }
    }
  );

  return jobBundleModel;
};
