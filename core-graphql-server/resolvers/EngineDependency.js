const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  return {
    category: (obj, args, context) => {
      const opt = {
        categoryKey: obj.dependencyType
      };
      return serviceContext.dal.engineCategory
        .getEngineCategories(opt)
        .then((res) => (res.count ? res.records[0] : null));
    }
  };
};
