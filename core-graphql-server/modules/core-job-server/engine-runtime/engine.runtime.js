/*
 * engine.runtime decides which platform an engine runs on, and kicks the task
 * off. Each runtime conforms to the following interface:
 *
 *     function queueTask(task, runtimeOptions, taskPayload, callback)
 *
 * Currently, iron-io and webhooks are the only engine runtimes.
 */
'use strict';

const _ = require('lodash');
const async = require('async');
const { promisify } = require('util');

module.exports = function createEngineRuntime(
  app,
  dal,
  buildCache,
  aiwareRuntime,
  edgeRuntime
) {
  if (!_.isObject(app)) {
    throw new Error('missing app');
  }
  if (!_.isObject(app.config)) {
    throw new Error('missing app.config');
  }
  if (!_.isObject(app.logger)) {
    throw new Error('missing app.logger');
  }
  if (!_.isObject(dal) || !_.every([dal.cluster, dal.build], _.isObject)) {
    throw new Error('missing dal');
  }
  if (
    !_.isObject(buildCache) ||
    !_.isFunction(buildCache.getActiveBuildForEngine)
  ) {
    throw new Error('missing build cache');
  }
  if (!_.isObject(aiwareRuntime) || !_.isFunction(aiwareRuntime.queueTask)) {
    throw new Error('missing aiware runtime');
  }

  function cancelTask(task, callback) {
    if (typeof task !== 'object') {
      throw new Error('Missing task!');
    }
    if (typeof callback !== 'function') {
      throw new Error('Missing callback!');
    }

    async
      .auto({
        getTaskBuildRuntime: function getTaskBuild(next) {
          getBuildForRuntime(task.buildId, task.engineId, next);
        }
      })
      .then((results) => {
        const runtimeData = results.getTaskBuildRuntime.runtimeData;
        if (!runtimeData.runtime || !runtimeData.runtime.cancelTask) {
          callback(
            new Error(
              'Could not find engine runtime cancel task for ' + task.engineId
            )
          );
          return;
        }
        runtimeData.runtime.cancelTask(task, runtimeData.options, callback);
      })
      .catch((err) => {
        app.logger.error(err);
        callback(err);
        return;
      });
  }

  function getBuildForRuntime(buildId, engineId, callback) {
    async function _getBuildForRuntime() {
      if (buildId) {
        const getEngineBuildPromise = promisify(dal.build.getEngineBuild);
        const build = await getEngineBuildPromise(buildId, engineId, null);
        return build;
      } else {
        // default to active build
        const cachedBuild = await buildCache.getActiveBuildForEngine(engineId);
        if (!cachedBuild) {
          throw new Error(
            'Could not find cached deployed build for ' + engineId
          );
        }
        return cachedBuild;
      }
    }

    _getBuildForRuntime()
      .then((build) => {
        if (!build) {
          return callback(new Error('Could not find build for ' + engineId));
        }
        if (!build.taskRuntime) {
          return callback(
            new Error(
              'Could not find build runtime for build: ' + buildId,
              ' engine: ' + engineId
            )
          );
        }
        if (!build.isLegacy && _.get(build, 'taskRuntime.iron')) {
          build.taskRuntime.iron.name = `${engineId}-${build.buildId}`;
        }
        const runtimeData = selectRuntime(build.taskRuntime);
        if (!runtimeData) {
          return callback(
            new Error(
              'Could not select build runtime for build ' + buildId,
              ' engine: ' + engineId
            )
          );
        }
        callback(null, { build, runtimeData });
      })
      .catch((err) => {
        app.logger.error(err);
        callback(err);
      });
  }

  function selectRuntime(taskRuntime) {
    if (!taskRuntime) {
      return null;
    } else if (taskRuntime.aiware) {
      return {
        runtime: aiwareRuntime,
        options: taskRuntime.aiware
      };
    } else if (taskRuntime.edge) {
      return {
        runtime: edgeRuntime,
        options: taskRuntime.edge
      };
    } else {
      // default edge runtime
      return {
        runtime: edgeRuntime,
        options: taskRuntime.edge
      };
    }
  }

  return {
    _selectRuntime: selectRuntime,
    cancelTask: cancelTask
  };
};
