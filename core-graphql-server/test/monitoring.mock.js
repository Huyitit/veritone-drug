const moment = require('moment');

module.exports = function createModule(serviceContext) {
  let isUnhealthy = 0;
  const real = require('../monitoring.js')(serviceContext);

  function healthCheck(req, res, serverStartTime) {
    real.healthCheck(req, res, serverStartTime || Date.now());
  }

  function getHeartbeatStats() {
    return {
      intervalSeconds: 10,
      lastRefresh: moment().toISOString(),
      graphqlRequests: 10
    };
  }

  function _reset() {
    isUnhealthy = 0;
    real.setShutdownInProgress(false);
  }

  return {
    setup: () => {},
    isUnhealthy: () => isUnhealthy,
    getHeartbeatStats,
    healthCheck,
    getStatsSummary: () => {},
    setShutdownInProgress: real.setShutdownInProgress,
    isShutdownInProgress: real.isShutdownInProgress,
    recordRequest: real.recordRequest,
    _reset,
    _setIsUnhealthy: (arg) => (isUnhealthy = arg)
  };
};
