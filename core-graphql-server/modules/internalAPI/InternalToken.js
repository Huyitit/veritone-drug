const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  return {
    createdDateTime: (object) => _.get(object, 'json.createdDateTime'),
    approvedDateTime: (object) => _.get(object, 'json.approvedDateTime'),
    modifiedDateTime: (object) => _.get(object, 'json.modifiedDateTime'),
    revokedDateTime: (object) => _.get(object, 'json.revokedDateTime'),
    requestorId: (object) => _.get(object, 'json.requestorId'),
    approverId: (object) => _.get(object, 'json.approverId')
  };
};
