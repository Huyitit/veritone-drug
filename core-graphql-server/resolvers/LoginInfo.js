const mapper = require('../dal/mapper');

module.exports = function (serviceContext) {
  return {
    user: (object) => mapper.mapUser(Object.assign({}, object)),

    organization: (object) =>
      mapper.mapOrganization(Object.assign({}, object.organization)),

    applicationPlatforms: (object) => {
      return object.applications.length
        ? object.applications.map((id) => {
            const platform = object.applicationPlatforms[id];
            return {
              id: id,
              platformType: platform.platformType,
              platformUrl: platform.platformUrl
            };
          })
        : [];
    },

    groups: (object) => object.groups.map((group) => mapper.mapGroup(group))
  };
};
