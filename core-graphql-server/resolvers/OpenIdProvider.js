const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const mainUtil = require('../util.js')(serviceContext);

  return {
    loginUrl(obj) {
      const pubDnsRoot = mainUtil.getDnsZoneName();
      const adminApiEndpoint = _.get(
        config,
        'services.coreAdminUri',
        `https://api.${pubDnsRoot}/api/admin`
      );

      const oidcRedirectBaseUrl = obj.redirectBaseUrl || adminApiEndpoint;

      return `${_.trimEnd(oidcRedirectBaseUrl, '/')}/openid/${obj.id}/login`;
    }
  };
};
