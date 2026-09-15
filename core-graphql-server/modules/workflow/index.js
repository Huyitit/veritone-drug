/**
 * Contains the extended Workflow including flow templates, flow revisions, etc.
 */
const fs = require('fs');
const _ = require('lodash');

module.exports = function createModule(serviceContext) {
  const config = serviceContext.config;
  const typeDefs = [
    fs.readFileSync('./modules/workflow/workflow.graphql', 'utf8')
  ];
  const resolvers = {
    Query: require('./Query.js')(serviceContext, config),
    Mutation: require('./Mutation.js')(serviceContext, config)
  };

  return {
    resolvers,
    typeDefs
  };
};
