const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;

  function getStaticAppConfig(context, args) {
    const apiRoot = _.get(config, 'apiRoot', 'https://api.veritone.com');
    const switchAppUrl = _.get(
      config,
      'switchAppRoute',
      'https://api.us-1.veritone.com/api/admin/switch-app'
    );
    const graphEndpoint = `${apiRoot}/${_.get(
      config,
      'graphQLEndpoint',
      'v3/graphql'
    )}`;
    const graphEndpointWS = graphEndpoint.replace('https', 'wss');
    const loginUrl = _.get(config, 'loginRoute', 'https://login.veritone.com');
    const desktopAppUrl = _.get(config, 'appUris.desktopAppUrl', null);
    const adminAppUrl = _.get(
      config,
      'appUris.adminAppUrl',
      'https://admin.us-1.veritone.com'
    );
    const automateUrl = _.get(
      config,
      'appUris.automateAppUrl',
      'https://automate.us-1.veritone.com'
    );
    const cmsAppUrl = _.get(
      config,
      'appUris.cmsAppUrl',
      'https://cms.us-1.veritone.com'
    );
    const automateControllerUrl = _.get(
      config,
      'automateServices.automateControllerUrl',
      'https://automate-controller-v3f.aws-prod-rt.veritone.com'
    );
    const controllerNodeRedImage = _.get(
      config,
      'automateServices.controllerNodeRedImage',
      'registry.central.aiware.com/node-red-runner-v3:stable'
    );
    const networkIsolated = _.get(
      config,
      'featureFlags.networkIsolated',
      false
    );

    const SDK_DEFAULT_TIMEOUT = 60;
    let sessionTimeout = _.get(config, 'redis.ttl', SDK_DEFAULT_TIMEOUT);
    // if redis.ttl was configured as string, convert to number
    if (_.isString(sessionTimeout)) {
      sessionTimeout = _.toNumber(sessionTimeout);
    }

    return {
      apiRoot,
      switchAppUrl,
      graphEndpoint,
      graphEndpointWS,
      loginUrl,
      desktopAppUrl,
      adminAppUrl,
      automateUrl,
      cmsAppUrl,
      automateControllerUrl,
      controllerNodeRedImage,
      sessionTimeout,
      networkIsolated
    };
  }

  return {
    getStaticAppConfig
  };
};
