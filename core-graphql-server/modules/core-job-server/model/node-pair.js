'use strict';

module.exports = function init() {
  const nodePairModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      clusterId: { type: 'string', required: true },
      displayName: { type: 'string', required: true },
      role: { type: 'string', required: true },
      offlineBrowsing: { type: 'boolean', required: true }
    }
  );

  return nodePairModel;
};
