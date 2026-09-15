module.exports = function createFunction(serviceContext) {
  return {
    source: async (ingestSlug, args, context) => {
      return serviceContext.dal.ingestSlug.getSource(context, ingestSlug);
    },
    tdo: async (ingestSlug, args, context) => {
      return serviceContext.dal.ingestSlug.getTDO(context, ingestSlug);
    },
    asset: async (ingestSlug, args, context) => {
      return serviceContext.dal.ingestSlug.getAsset(context, ingestSlug);
    },
    tdoId: async (ingestSlug, args, context) => {
      return serviceContext.dal.ingestSlug.getTDOId(context, ingestSlug);
    },
    assetId: async (ingestSlug, args, context) => {
      return serviceContext.dal.ingestSlug.getAssetId(context, ingestSlug);
    }
  };
};