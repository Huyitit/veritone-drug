'use strict';

module.exports = function init() {
  var buildUploadModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      dockerImage: { type: 'string', required: true }
    }
  );

  return buildUploadModel;
};
