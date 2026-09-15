/**
 * Implements per-field internal computation cost limits.
 */
const _ = require('lodash');

module.exports = function create(directiveContext) {
  const config = directiveContext.appConfig;
  const util = require('../../resolvers/util.js')(directiveContext);
  const errors = require('../../error')(directiveContext.appConfig);

  return {
    name: 'limit',
    before: true,
    validator(directiveArgs, field, schema) {
      // nothing to validate at this point.
    },
    resolver(directiveArgs, fieldArgs, context, info) {
      const fieldName = info.parentType + '.' + info.fieldName;

      // get cost, if any
      const cost = directiveArgs.cost || 0;
      // the limit on a paged field/query is always added to total cost
      const costLimit = fieldArgs.limit || 0;

      const incr = cost + costLimit;

      // set 0 at request start if needed
      if (_.isNil(context.requestInfo.totalCost)) {
        context.requestInfo.totalCost = 0;
      }

      // increment the value by the cost computed here
      context.requestInfo.totalCost += incr;

      // set field stats for this field. we do so now so that
      // it shows up in the error details below.
      if (!context.fieldStats) context.fieldStats = {};
      if (!context.fieldStats[fieldName]) context.fieldStats[fieldName] = {};

      const thisFieldStats = context.fieldStats[fieldName];
      // increment count on field
      thisFieldStats.totalCost = (thisFieldStats.totalCost || 0) + incr;

      // the actual check is in resolvers/index.js
    }
  };
};
