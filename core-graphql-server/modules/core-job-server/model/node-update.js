'use strict';

module.exports = function init() {
  const nodeUpdateModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      displayName: { type: 'string', required: true }
    }
  );

  return nodeUpdateModel;
};
