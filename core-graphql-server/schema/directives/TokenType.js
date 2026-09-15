/**
 * Used to indicate that a given field requires a certain token type:
 * User or API.
 * Validator unnecessary as the definition uses an enum.
 */
module.exports = function create(directiveContext) {
  const util = require('../../resolvers/util.js')(directiveContext);

  return {
    name: 'tokenType',

    resolver(directiveArgs, fieldArgs, context, info) {
      const typeRequired = directiveArgs.type;
      if (typeRequired === 'User') {
        util.requireUserToken(context);
      } else if (typeRequired === 'API') {
        util.requireAPIToken(context);
      }
    },

    before: true
  };
};
