/**
 * Implements per-field internal computation cost limits.
 */
const _ = require('lodash');

module.exports = function create(directiveContext) {
  const errors = require('../../error/index.js')(directiveContext.appConfig);

  return {
    name: 'length',
    before: true,
    validator(directiveArgs, field, schema) {
      // nothing to validate at this point.
    },
    resolver(directiveArgs, fieldArgs, context, info) {
      if (directiveArgs && directiveArgs.max) {
        if (fieldArgs && _.isString(fieldArgs.__directiveArgName)) {
          const arg = fieldArgs[fieldArgs.__directiveArgName];
          if (Array.isArray(arg) && arg.length > directiveArgs.max) {
            throw new errors.ObjectLimitExceeded({
              data: {
                arg: fieldArgs.__directiveArgName,
                type: _.get(info, 'fieldName'),
                max: directiveArgs.max,
                current: arg.length
              }
            });
          }
        }
      }
    }
  };
};
