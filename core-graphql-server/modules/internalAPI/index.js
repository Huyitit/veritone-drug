/**
 * Contains the extended v3 data model including schedules, job pipelines, etc.
 */

const fs = require('fs');
const _ = require('lodash');

module.exports = function createModule(serviceContext) {
  const storage = serviceContext.storage,
    logger = serviceContext.logger,
    pg = serviceContext.pg,
    blls3 = serviceContext.blls3,
    dalCore = serviceContext.dalCore,
    config = serviceContext.config,
    app = serviceContext.app;

  // set up this module's DAL layer
  serviceContext.dal.internalToken = require('./dal/internalToken.js')(
    serviceContext
  );
  serviceContext.dal.queryMonitor = require('./dal/queryMonitor.js')(
    serviceContext
  );
  serviceContext.dal.scheduledEvent = require('./dal/scheduledEvent.js')(
    serviceContext
  );

  const typeDefs = [
    fs.readFileSync('./modules/internalAPI/internalAPI.graphql', 'utf8')
  ];

  const resolvers = {
    Query: require('./Query.js')(serviceContext, config),
    Mutation: require('./Mutation.js')(serviceContext, config),
    InternalToken: require('./InternalToken.js')(serviceContext, config),
    DatabaseQueryMonitorResult: require('./DatabaseQueryMonitorResult.js')(
      serviceContext
    )
  };

  return {
    resolvers,
    typeDefs
  };
};
