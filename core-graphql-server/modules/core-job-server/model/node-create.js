'use strict';

const embeddedModel = require('@veritone/core-server-base/model/util/embedded-model');

module.exports = function init(nodeMetricsModel) {
  const nodeCreateModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      nodeId: { type: 'string', required: true },
      displayName: { type: 'string' },
      metrics: embeddedModel({
        model: nodeMetricsModel,
        modelName: 'NodeMetrics',
        required: true
      }),
      containerTag: { type: 'string' },
      offlineBrowsing: { type: 'boolean' },
      storagePresent: { type: 'boolean' }
    }
  );

  return nodeCreateModel;
};
