'use strict';

const _ = require('lodash');

module.exports = function createAiwareRuntime(app, request) {
  const taskExecutor = 'aiware';
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
  if (!_.isObject(request)) {
    throw new Error('missing request!');
  }
  if (!_.isObject(runtimeConfig)) {
    throw new Error('missing runtimeConfig!');
  }
  if (!_.isObject(runtimeConfig.defaultRuntime)) {
    throw new Error('missing runtimeConfig.defaultRuntime!');
  }
  if (!_.isString(runtimeConfig.defaultRuntime.cluster)) {
    throw new Error('missing runtimeConfig.defaultRuntime.cluster!');
  }
  if (!_.isFinite(runtimeConfig.defaultRuntime.priority)) {
    throw new Error('missing runtimeConfig.defaultRuntime.priority!');
  }

  const aiwareBaseUri = `${runtimeConfig.baseUri}/${runtimeConfig.version}/aiware`;
  const aiwareTaskUri = `${aiwareBaseUri}/task`;

  function queueTask(task, runtimeOptions, taskPayload, callback) {
    if (!_.isObject(task)) {
      throw new Error('missing task!');
    }
    if (!_.isObject(taskPayload)) {
      throw new Error('missing taskPayload!');
    }
    if (!_.isFunction(callback)) {
      throw new Error('missing callback!');
    }
    if (!runtimeOptions) {
      runtimeOptions = runtimeConfig.defaultRuntime;
    }

    let cluster = runtimeOptions.cluster;
    const applicationId = task.applicationId;
    if (_.isObject(cluster)) {
      const clusterDefault = _.get(cluster, 'default');
      if (!clusterDefault) {
        callback(new Error('missing cluster default for engine'));
        return;
      }
      cluster = _.get(cluster, applicationId, clusterDefault);
    }

    const taskCreateBody = {
      clusterId: cluster,
      engineId: task.engineId,
      buildId: task.buildId,
      dockerImage: task.dockerImage,
      taskId: task.taskId,
      taskPayload: taskPayload,
      priority: runtimeOptions.priority,
      timeout: runtimeOptions.timeout || 0,
      delay: runtimeOptions.delay || 0
    };

    const bodyAsString = JSON.stringify(taskCreateBody);
    app.logger.debug('POST ' + aiwareTaskUri + ', body=' + bodyAsString);
    request.post(
      {
        uri: aiwareTaskUri,
        headers: {},
        body: bodyAsString
      },
      function createTaskCallback(err, resp, body) {
        if (err) {
          return callback(err);
        }
        app.logger.debug(
          'aiware returns ' + resp.statusCode + ', body=' + body
        );
        if (resp.statusCode === 200) {
          let bodyParsed;
          try {
            bodyParsed = JSON.parse(body);
          } catch (err) {
            app.logger.error(err);
            bodyParsed = {};
          }
          const taskResp = {
            taskEngine: taskExecutor,
            taskEngineId: bodyParsed.taskExecutorId
          };

          callback(null, {
            isDone: false,
            queueResponse: taskResp
          });
          return;
        }
        callback(
          new Error(
            'Received status code ' +
              resp.statusCode +
              ': ' +
              JSON.stringify(body)
          )
        );
      }
    );
  }

  function cancelTask(task, runtimeOptions, callback) {
    if (!_.isObject(task)) {
      throw new Error('missing task!');
    }
    if (!_.isFunction(callback)) {
      throw new Error('missing callback!');
    }
    if (!runtimeOptions) {
      runtimeOptions = runtimeConfig.defaultRuntime;
    }
    const taskExecutorId = task.taskExecutorId;
    if (!taskExecutorId) {
      callback();
      return;
    }
    const aiwareCancelTaskUrl = `${aiwareTaskUri}/${taskExecutorId}`;
    request.delete(
      {
        uri: aiwareCancelTaskUrl,
        headers: {}
      },
      function cancelTaskCallback(err, resp, body) {
        if (err) {
          return callback(err);
        }
        if (resp.statusCode === 202) {
          return callback();
        }
        callback(
          new Error(
            'Received status code ' +
              resp.statusCode +
              ': ' +
              JSON.stringify(body)
          )
        );
      }
    );
  }

  return {
    queueTask: queueTask,
    cancelTask: cancelTask
  };
};
