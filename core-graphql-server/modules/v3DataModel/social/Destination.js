/**
 * VP-2581 — Destination field resolvers (BE-11 support).
 */
const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalDestinationType = serviceContext.dal.destinationType;

  return {
    destinationType: (obj, args, context) =>
      obj.destinationTypeId
        ? dalDestinationType.getDestinationType(context, {
            id: obj.destinationTypeId
          })
        : null,
    // details is a JSONB column — usually parsed by the driver, but guard for text.
    details: (obj) =>
      _.isString(obj.details) ? JSON.parse(obj.details) : obj.details,
    createdBy: (obj, args, context) =>
      obj.createdByUserId
        ? context.loaders.usersById.load(obj.createdByUserId)
        : null
  };
};
