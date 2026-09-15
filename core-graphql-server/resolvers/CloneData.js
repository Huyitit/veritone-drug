module.exports = function createFunction(serviceContext) {
  return {
    // resolver for VeritoneClone that allows us to filter
    // the asset ID mappings.

    assetIdMap(obj, args, context, info) {
      let result = obj.assetIdMap || [];
      // both are server-tutorial-solution
      if (
        args.oldAssetId &&
        args.oldAssetId.length > 0 &&
        args.newAssetId &&
        args.newAssetId.length > 0
      ) {
        result = result.filter(function (elem, index, array) {
          return (
            elem.oldAssetId === args.oldAssetId &&
            elem.newAssetId === args.newAssetId
          );
        });
      } else if (args.oldAssetId) {
        // only old asset ID set
        result = result.filter(function (elem, index, array) {
          return elem.oldAssetId === args.oldAssetId;
        });
      } else if (args.newAssetId) {
        // only new asset ID select
        result = result.filter(function (elem, index, array) {
          return elem.newAssetId === args.newAssetId;
        });
      }
      return result;
    }
  };
};
