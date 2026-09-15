module.exports = function createFunction(serviceContext) {
  return {
    featureFlags: (obj) => serviceContext.config.featureFlags,
    heartbeatStats: (obj, args, context) =>
      serviceContext.monitoring.getHeartbeatStats()
  };
};
