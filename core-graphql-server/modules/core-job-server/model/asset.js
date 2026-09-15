'use strict';

module.exports = function init() {
  const assetModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      assetId: { type: 'number' },
      metadata: { type: 'json' },
      type: { type: 'string' }
    }
  );

  return assetModel;
};
