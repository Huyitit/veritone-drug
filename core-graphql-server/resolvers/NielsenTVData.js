module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);
  return {
    decoratorsString(obj, args, context, info) {
      return JSON.stringify(obj.decorators || {}, null, args.indent);
    },
    demographicsString(obj, args, context, info) {
      return JSON.stringify(obj.demographics || {}, null, args.indent);
    },
    createdBy(obj, args, context, info) {
      return util.hash(obj.createdBy);
    },
    modifiedBy(obj, args, context, info) {
      return util.hash(obj.modifiedBy);
    }
  };
};
