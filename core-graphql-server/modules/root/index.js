/**
 * Contains our root schema, that includes custom directives, reusable enum in other modules
 */
const fs = require('fs');

module.exports = function createModule(serviceContext) {
  const typeDefs = [fs.readFileSync('./modules/root/root.graphql', 'utf8')];

  return {
    resolvers: {},
    typeDefs
  };
};
