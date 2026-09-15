const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);

  return {
    assetUri: (obj, args, context, info) =>
      !_.isEmpty(obj.assetUri)
        ? util.getSignedUrl(obj.assetUri, null, args.fileName)
        : null
  };
};
