const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalLibrary = serviceContext.dal.library;

  return {
    lastTrainedDateTime: (obj) =>
      _.isNil(obj.lastTrainedDateTime) ? null : obj.lastTrainedDateTime * 1000
  };
};
