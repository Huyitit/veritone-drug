const fs = require('fs');
const _ = require('lodash');

module.exports = function createModule(serviceContext) {
  serviceContext.dal.batchProcessRedis = require('./dal/batchProcessRedis.js')(
    serviceContext
  );
  serviceContext.dal.tdoBatch = require('./dal/tdoBatch.js')(serviceContext);

  // each mutator attached to TDOBatch type should have its own file implementation
  serviceContext.bll.executeJobTemplate = require('./bll/executeJobTemplate.js')(
    serviceContext
  );

  serviceContext.bll.tdoBatch = require('./bll/tdoBatch.js')(serviceContext);

  const typeDefs = [
    fs.readFileSync('./modules/batchActionsAPI/batchActions.graphql', 'utf8')
  ];

  const resolvers = {
    Query: require('./Query.js')(serviceContext),
    Mutation: require('./Mutation.js')(serviceContext),
    TDOBatch: require('./TDOBatch.js')(serviceContext),
    TDOBatchProcess: require('./TDOBatchProcess.js')(serviceContext),
    TDOBatchJobProcess: require('./TDOBatchJobProcess.js')(serviceContext),
    TDOBatchJobActionResult: require('./TDOBatchJobActionResult.js')(
      serviceContext
    )
  };
  return {
    resolvers,
    typeDefs
  };
};
