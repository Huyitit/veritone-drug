const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../../util.js')(serviceContext);

  return {
    resourceType: (obj, args, context) => {
      // Return the type of resource (TDO, SDO, Folder, Library, etc.)
      return obj.resourceType;
    },

    resourceId: (obj, args, context) => {
      // Return the unique identifier of the resource
      return obj.resourceId;
    }
  };
};
