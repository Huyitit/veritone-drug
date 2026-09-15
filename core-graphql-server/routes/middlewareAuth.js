'use strict';

const async = require('async');
const _ = require('lodash');

module.exports = function initialize(config) {
  const UnauthorizedError = require('@veritone/core-server-base/errors/unauthorizedError.js');

  return {
    splitAuthentication: splitAuthentication
  };

  /**
   * splitAuthentication is middleware that calls a different
   * set of middleware depending on the authentication type.
   * TODO: move into core-server-base if other servers need it
   * @middleware
   * @param {object} req - express request object
   * @param {object} res - express response object
   * @param {callback} next - express next callback
   */
  function splitAuthentication(tokenMiddlewares, userMiddlewares) {
    if (!_.isArray(tokenMiddlewares) || !_.isArray(userMiddlewares)) {
      throw new Error(
        'token middlewares and user middlewares need to be arrays'
      );
    }

    return function splitAuth(req, res, next) {
      const authToken = _.get(req, 'context.authToken');
      if (!authToken) {
        next(new UnauthorizedError('missing header'));
        return;
      }

      const authType = authToken.length > 36 ? 'token' : 'user';
      req.context = _.assign(req.context, {
        isAuthenticated: true,
        authToken: authToken,
        authType: authType
      });

      const middlewares =
        authType === 'token' ? tokenMiddlewares : userMiddlewares;
      async.eachSeries(
        middlewares,
        function eachMiddleware(middleware, callback) {
          middleware(req, res, callback);
        },
        function finalCallback(err) {
          next(err);
        }
      );
    };
  }
};
