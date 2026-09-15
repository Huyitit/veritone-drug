/**
 * Sets up the service context that is passed to schema modules.
 */

module.exports = function createModule(serviceContext) {
  serviceContext.localCache = require('../localCache.js')(serviceContext);
  serviceContext.metrics = require('../metrics.js')({
    metricsCounters: serviceContext.metricsCounters,
    logger: serviceContext.logger
  });

  const util = require('../util.js')(serviceContext);

  // TODO factor dal stuff into modules
  serviceContext.util = util;

  return serviceContext;
};
