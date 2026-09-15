'use strict';

const _ = require('lodash');
const validatejs = require('validate.js');
const modeLibraryTrain = 'library-train';
const modeLibraryRun = 'library-run';

function Task(data) {
  if (data) {
    var keys = Object.keys(data),
      self = this;
    keys.forEach(function forEachKey(key) {
      self[key] = data[key];
    });
  }
}

Task._validation = {
  taskType: {
    presence: true
  }
};

Task.prototype.validate = function validate(dalTaskType, callback) {
  if (typeof dalTaskType !== 'object') {
    throw new Error('Missing dalTaskType!');
  }
  if (typeof callback !== 'function') {
    throw new Error('Missing callback!');
  }

  var validationErrors = validatejs(this, Task._validation) || [];
  if (dalTaskType && this.taskType) {
    dalTaskType.get(this.taskType, function getTaskTypeCallback(err, taskType) {
      if (err) {
        return callback(err);
      }
      if (taskType) {
        // ~~~ implement validation
        if (taskType.validation) {
          var ttValidationErrors = validatejs(this, taskType.validation);
          if (ttValidationErrors) {
            validationErrors = validationErrors.concat(ttValidationErrors);
          }
        }
      } else {
        validationErrors.push('Invalid task type: ' + this.taskType);
      }
      callback(null, validationErrors);
    });
  } else {
    callback(null, validationErrors);
  }
};

Task.prototype.getPayloadMode = function getPayloadMode() {
  return _.get(this, 'taskPayload.mode');
};

Task.prototype.isTrainingTask = function isTrainingTask() {
  return this.getPayloadMode() === modeLibraryTrain;
};

Task.prototype.setToLibraryRunMode = function setToLibraryRunMode() {
  _.set(this, 'taskPayload.mode', modeLibraryRun);
  return this;
};

module.exports = Task;
