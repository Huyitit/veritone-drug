const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  return {
    organizationId: (obj) => _.get(obj, 'audit.organizationId'),
    userId: (obj) => _.get(obj, 'audit.userId'),
    application: (obj) => _.get(obj, 'audit.application')
  };
};
