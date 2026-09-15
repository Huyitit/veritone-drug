const _ = require('lodash');
module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);
  return {
    imageUrl: (obj) =>
      util.getSignedUrlOrVirtual(
        _.get(obj, 'kvp.image') || _.get(obj, 'imageUrl')
      ),
    firstName: (obj) => _.get(obj, 'kvp.firstName') || _.get(obj, 'firstName'),
    lastName: (obj) => _.get(obj, 'kvp.lastName') || _.get(obj, 'lastName')
  };
};
