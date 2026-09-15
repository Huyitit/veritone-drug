const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../util.js')();

  return {
    assets: async (obj, args, context, info) => {
      // check if the return request is covered just by the data
      // we already have, so we can avoid costly db calls
      const assetReturnFields = _.get(
        info,
        'fieldNodes[0].selectionSet.selections[0].selectionSet.selections',
        []
      ).map((f) => _.get(f, 'name.value'));

      if (assetReturnFields && assetReturnFields.length) {
        if (
          _.difference(assetReturnFields, ['id', 'containerId']).length === 0
        ) {
          return mainUtil.toPage(args, obj.assets);
        }
      }

      const getAssetPromises = obj.assets.map((a) => {
        return serviceContext.dal.asset.getAsset(context, { id: a.id });
      });
      const res = await Promise.all(getAssetPromises);
      return mainUtil.toPage(args, res);
    },
    scrollId: (obj) => obj.scrollId
  };
};
