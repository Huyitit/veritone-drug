const _ = require('lodash');

module.exports = function createFunction() {
  return {
    description: (obj) => (!_.isEmpty(obj.description) ? obj.description : '')
  };
};
