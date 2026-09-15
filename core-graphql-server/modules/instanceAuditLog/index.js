const fs = require('fs');

module.exports = function createModule(serviceContext) {
  const resolvers = {
    Query: require('./../../resolvers/Query.js')(serviceContext),
    Mutation: require('./../../resolvers/Mutation.js')(serviceContext)
  };
  const typeDefs = [
    fs.readFileSync(
      './modules/instanceAuditLog/instanceAuditLog.graphql',
      'utf8'
    )
  ];
  return {
    resolvers,
    typeDefs
  };
};
