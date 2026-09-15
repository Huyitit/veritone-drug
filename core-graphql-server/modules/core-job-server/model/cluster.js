'use strict';

const util = require('./util')();
const embeddedModel = require('@veritone/core-server-base/model/util/embedded-model');

module.exports = function init() {
  const queueCredentials = require('@veritone/core-server-base/model/util/create-model')(
    {
      clusterId: { type: 'string' },
      clusterName: { type: 'string' },
      clusterToken: { type: 'string' }
    }
  );

  const clusterModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      clusterId: { type: 'string' },
      organizationId: { type: 'number' },
      displayName: { type: 'string' },
      allowedEngines: { type: 'json' },
      clusterType: { type: 'string' },
      bypassAllowedEngines: { type: 'boolean' },
      secretKey: { type: 'string' },
      accessKey: { type: 'string' },
      defaultCluster: { type: 'boolean' },
      containerTag: { type: 'string' },
      queueCredentials: embeddedModel({
        model: queueCredentials,
        modelName: 'QueueCredentials'
      }),
      dockerCredentials: { type: 'json' },
      paused: { type: 'boolean' },
      memorySize: { type: 'number' },
      storageSize: { type: 'number' },
      cachedVeritoneApiKey: { type: 'string' },
      cachedDate: {
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
      },
      isPublic: { type: 'boolean' },

      // generated fields
      nodes: { type: 'json' }
    }
  );

  return clusterModel;
};
