const _ = require('lodash');
module.exports = function createFunction(serviceContext) {
  return {
    engines: async (obj, args, context) => {
      return serviceContext.dal.engine.getEngines(context, {
        appPackageId: obj.id,
        skipCache: true
      });
    },

    dataRegistries: async (obj, args, context) => {
      try {
        return await serviceContext.dal.structuredData.getDataRegistries(
          context,
          {
            appPackageId: obj.id
          }
        );
      } catch (err) {
        console.error(
          `Failed to get dataRegistries for appID: ${obj.id}`,
          err.message
        );
        return {
          records: [],
          count: 0,
          offset: args.offset || 0,
          limit: args.limit || 0
        };
      }
    },
    contextMenuExtensions: async (obj, args) =>
      serviceContext.dal.application.getContextMenuExtensions({
        applicationId: obj.id
      })
  };
};
