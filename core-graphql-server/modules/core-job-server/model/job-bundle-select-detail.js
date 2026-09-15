'use strict';

module.exports = function init() {
  const jobBundleSelectDetail = require('@veritone/core-server-base/model/util/create-model')(
    {
      category: { type: 'string' }, // required once we drop 'selectCategory' column
      select: { type: 'json', required: true },
      paths: { type: 'json', required: true },
      files: { type: 'json', required: true },
      tasks: { type: 'json', required: true },
      afterTime: { type: 'string' },
      beforeTime: { type: 'string' },
      recursiveDescent: { type: 'boolean' },
      service: { type: 'json' }
    }
  );

  return jobBundleSelectDetail;
};
