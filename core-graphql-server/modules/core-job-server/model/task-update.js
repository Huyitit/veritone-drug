'use strict';

const _ = require('lodash');

module.exports = function init() {
  const taskUpdateModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      taskStatus: { type: 'string' },
      taskOutput: { type: '*' },
      taskPayload: { type: 'json' },
      notificationUris: { type: '*', validate: validateStringArray }
    }
  );

  function validateStringArray(value, attributes, key) {
    var error = {};

    if (value) {
      if (!_.isArray(value)) {
        error[key] = { message: 'should be an Array' };
        return error;
      }

      _.forEach(value, function checkStrings(item) {
        if (!_.isString(item)) {
          error[key] = { message: 'should contain strings' };
          return false;
        }
      });
    }

    return _.size(error) ? error : null;
  }

  return taskUpdateModel;
};
