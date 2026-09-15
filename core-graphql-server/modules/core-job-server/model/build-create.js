'use strict';

module.exports = function init() {
  var buildCreateModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      id: { type: 'string' },
      price: { type: 'number' },
      deploymentModel: { type: 'number', required: true },
      validateUri: { type: 'string' },
      executeUri: { type: 'string' },
      taskRuntime: { type: 'json' },
      dockerImage: { type: 'string' },
      manifest: { type: 'json' },
      buildState: { type: 'string' },
      releaseNotes: { type: 'string' }
    }
  );

  return buildCreateModel;
};
