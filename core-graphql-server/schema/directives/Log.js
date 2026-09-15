/**
 * Logs the field reference.
 * TODO not in use yet.
 */
module.exports = function create(directiveContext) {
  const logger = directiveContext.logger;
  return {
    name: 'log',

    resolver(source, directiveArgs, fieldArgs, context, info, result, err) {
      // TODO logger.log...
      if (err) throw err; // rethrow the error to let graphql error handling take it
      return result;
    },

    before: false
  };
};
