'use strict';

module.exports = function init() {
  const jobBundleResultModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      found: { type: 'number', required: true },
      completed: { type: 'number', required: true },
      errors: { type: 'json', required: true }
    }
  );

  return jobBundleResultModel;
};
