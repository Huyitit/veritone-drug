const { isNil, isEmpty } = require('lodash');

module.exports = function createFunction(serviceContext) {
  const errors = require('../error')(serviceContext.config);
  function parsePaginationArgs(args) {
    let invalidOptions = {
      message: '',
      data: {}
    };
    if (args) {
      if (!isNil(args.limit) && args.limit <= 0) {
        invalidOptions = {
          message: 'Limit must be greater than 0',
          data: { limit: args.limit }
        };
      }
      if (!isNil(args.offset) && args.offset < 0) {
        invalidOptions = {
          message: invalidOptions.message
            ? `${invalidOptions.message}. `
            : '' + 'offset must be greater than or equal to 0',
          data: { ...invalidOptions.data, offset: args.offset }
        };
      }
      if (invalidOptions.message) {
        throw new errors.InvalidInput(invalidOptions);
      }
    }
  }

  return { parsePaginationArgs };
};
