'use strict';

const _ = require('lodash');

module.exports = function createEdgeRuntime(app) {
  const taskExecutor = 'edge';
  const runtimeConfig = _.get(app, ['config', 'engineRuntime', taskExecutor]);

  if (!_.isObject(app)) {
    throw new Error('missing app!');
  }
  if (!_.isObject(app.config)) {
    throw new Error('missing app.config!');
  }
  if (!_.isObject(app.logger)) {
    throw new Error('missing app.logger!');
  }
  if (!_.isObject(runtimeConfig)) {
    throw new Error('missing runtimeConfig!');
  }

  function queueTask(task, runtimeOptions, taskPayload, callback) {
    if (typeof task !== 'object') {
      throw new Error('missing task!');
    }
    if (typeof callback !== 'function') {
      throw new Error('missing callback!');
    }
    callback(null, {
      isDone: false,
      skipTaskUpdate: true,
      queueResponse: {
        taskEngine: taskExecutor
      }
    });
  }

  function cancelTask(task, runtimeOptions, callback) {
    if (typeof task !== 'object') {
      throw new Error('missing task!');
    }
    if (typeof callback !== 'function') {
      throw new Error('missing callback!');
    }
    callback();
  }

  return {
    queueTask: queueTask,
    cancelTask: cancelTask
  };
};
