'use strict';

const _ = require('lodash');

module.exports = function init(app, dal, model) {
  if (!_.isObject(app) || !_.isObject(app.config)) {
    throw new Error('missing app');
  }
  if (!_.isObject(dal) || !_.every([dal.build, dal.engine], _.isObject)) {
    throw new Error('missing dal');
  }
  if (!_.isObject(model)) {
    throw new Error('missing model');
  }

  return {
    autoTransitionEngineState
  };

  /*
   * Automatically transitions an engine into the proper state
   * based on the state of its builds.
   */
  function autoTransitionEngineState(engine, dbClient, isEnabling, callback) {
    const { engineId, engineState: currentEngineState } = engine || {};
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }
    if (!_.isObject(engine)) {
      return callback({ statusCode: 400, message: 'missing engine' });
    }

    dal.build.getEngineBuilds(
      { engineId: engineId },
      dbClient,
      function getEngineBuildsCallback(err, results) {
        if (err) {
          app.logger.error(err);
          return callback(err);
        }
        // keep a disabled engine disabled unless we are explicitly enabling
        if (currentEngineState === 'disabled' && !isEnabling) {
          return dal.engine.updateEngineState(
            engineId,
            'disabled',
            dbClient,
            callback
          );
        }
        const builds = results.results;

        /*
         * Engine state logic below is based on this design doc...
         * https://steel-ventures.atlassian.net/wiki/spaces/APT/pages/2643460125/Expand+the+Engine+State+Code+to+Understand+More+Engine+States+fka+Manually+Set+Engine+State#Design
         */

        let newEngineState = 'pending';

        const readyStates = [
          'fetching',
          'available',
          'pending',
          'approved',
          'paused',
          'deploying'
        ];

        if (builds.length > 0) {
          _.forEach(builds, function calculateBuildStateCount({ buildState }) {
            // if any build is deployed, then engine is active
            if (buildState === 'deployed') {
              newEngineState = 'active';
              return false;
            } else if (_.includes(readyStates, buildState)) {
              // if no build is deployed but any build's status is in the readyStates array
              // then engine is ready
              newEngineState = 'ready';
            }
          });
        }

        app.logger.debug(
          `triggered engine ${engineId} auto transition to ${newEngineState}`
        );

        dal.engine.updateEngineState(
          engineId,
          newEngineState,
          dbClient,
          callback
        );
      }
    );
  }
};
