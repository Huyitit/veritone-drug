const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const cache = require('./cache.js')(serviceContext);
  const platform = require('../dal/dalPlatform.js')(serviceContext);
  const util = require('./util.js')(serviceContext);

  return {
    properties: async (obj, args, context) => {
      const response = await platform.getPlatformProperties(context, args);
      return response.properties;
    },
    aiWAREVersion: async (obj, args, context) => {
      const response = await platform.getAIWAREVersion(context, args);
      return response.aiWAREVersion;
    },
    aiWAREVersionHistory: async (obj, args, context) => {
      return await platform.getAIWAREVersionHistory(context, args);
    },
    aiWAREVersionList: async (obj, args, context) => {
      const response = await platform.getAIWAREVersionList(context, args);
      return response.aiWAREVersionList;
    },
    /**
     * signedPropertyUrls Sign any URLs in the properties with paths in the input
     * @param {*} obj
     * @param {*} args { propertyPaths: [String] }
     * @param {*} context
     * @returns [{ propertyPath, signedUrl }]
     */
    signedPropertyUrls: async (obj, args, context) => {
      const results = [];
      const { propertyPaths } = args || {};
      if (_.isNil(propertyPaths) || _.isEmpty(propertyPaths)) {
        return results;
      }
      const data = await platform.getPlatformProperties(context, args);
      for (let path of propertyPaths) {
        const result = {
          propertyPath: path,
          signedUrl: ''
        };

        const propertyValue = _.get(data.properties, path);
        if (_.isNil(propertyValue)) {
          results.push(result);
          continue;
        }

        const signedUrl = await util.getSignedUrl(propertyValue);
        result.signedUrl = signedUrl || '';
        results.push(result);
      }

      return results;
    },
    seatLimitDomainIgnoreList: async (obj, args, context) => {
      const config = serviceContext.config;
      return _.get(config, 'seatLimitDomainIgnoreList', []);
    },
  };
};
