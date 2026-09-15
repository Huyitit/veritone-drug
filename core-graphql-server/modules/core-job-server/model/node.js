'use strict';

const util = require('./util')();
const embeddedModel = require('@veritone/core-server-base/model/util/embedded-model');

module.exports = function init(nodeMetricsModel) {
  const nodeModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      nodeId: { type: 'string' },
      organizationId: { type: 'number' },
      clusterId: { type: 'string' },
      displayName: { type: 'string' },
      role: { type: 'string' },
      metrics: embeddedModel({
        model: nodeMetricsModel,
        modelName: 'NodeMetrics'
      }),
      lastPing: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      containerTag: { type: 'string' },
      paused: { type: 'boolean' },
      offlineBrowsing: { type: 'boolean' },
      storagePresent: { type: 'boolean' },
      directoryOid: { type: 'number' },
      directoryPatchOid: { type: 'number' },
      directoryCacheDate: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      directoryPatchCacheDate: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      registeredDate: {
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
      updatedDate: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      }
    }
  );

  return nodeModel;
};
