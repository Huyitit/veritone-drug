/**
 * Used to indicate that a given field access does not need to be logged.
 */

module.exports = function create(directiveContext) {
  return {
    name: 'noLog',
    before: true,
    resolver(source, directiveArgs, fieldArgs, context, info, result, err) {
      if (err) throw err; // rethrow the error to let graphql error handling take it
      return result;
    }
  };
};
