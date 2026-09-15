const _ = require('lodash');
const pathLib = require('path');
const fs = require('fs');

module.exports = function createFunction(config) {
  const apiRoot = _.get(config, 'apiRoot', '');
  const apiVersionPath = _.get(config, 'apiVersionPath', '') || '/v3';
  const apiRootVersionPath = apiRoot ? `${apiRoot}${apiVersionPath}` : '';
  const adminApiVersionPath = _.get(config, 'adminApiVersionPath', '/api');
  const adminApiRootVersionPath = apiRoot
    ? `${apiRoot}${adminApiVersionPath}`
    : '';

  const apiPath = _.get(config, 'graphqlApiPath', '/graphql');
  const apiEndpoint = `${apiRootVersionPath}${apiPath}`;
  const playgroundPath = _.get(config, 'graphqlPlaygroundPath', '/graphql');
  let playgroundEndpoint = `${apiRootVersionPath}${playgroundPath}`;
  const adminApiPath = _.get(config, 'adminApiPath', '/admin');
  const adminApiEndpoint = `${adminApiRootVersionPath}${adminApiPath}`;

  const graphiqlApiPath = _.get(config, 'graphiqlApiPath', '/graphiql');
  let graphiqlApiEndpoint = `${apiRootVersionPath}${graphiqlApiPath}`;

  const enableInternalSchema = _.get(config, 'enableInternalSchema', true);

  const enableSubscription = _.get(config, 'enableSubscription', true);

  let subscriptionPath = _.get(
    config,
    'subscriptionPath',
    `${apiVersionPath}/graphql`
  );

  // TODO (hji): remove apiPathInternal in datacenter config if it is not used anywhere else.
  // const apiPathInternal = config.apiPathInternal || '/vgraphql';

  const apiPathInternal = _.get(config, 'graphqlApiPathInternal', '/vgraphql');
  const playgroundPathInternal = _.get(
    config,
    'graphqlPlaygroundPathInternal',
    '/vgraphql'
  );
  let playgroundEndpointInternal = `${apiRootVersionPath}${playgroundPathInternal}`;

  const graphiqlApiPathInternal = _.get(
    config,
    'graphiqlApiPathInternal',
    '/vgraphiql'
  );
  let graphiqlApiInternalEndpoint = `${apiRootVersionPath}${graphiqlApiPathInternal}`;

  let playgroundSubscriptionEndpoint = undefined;
  if (process.env.RUN_ENVIRONMENT === 'LOCAL') {
    const _replaceWithLocalEndpoint = (endpoint) =>
      `http://localhost:${_.get(config, 'port', 3000)}${endpoint}`;

    playgroundEndpoint = _replaceWithLocalEndpoint(apiPath);
    playgroundSubscriptionEndpoint = playgroundEndpoint.replace('http', 'ws');
    subscriptionPath = apiPath;

    playgroundEndpointInternal = _replaceWithLocalEndpoint(apiPathInternal);
    graphiqlApiEndpoint = _replaceWithLocalEndpoint(graphiqlApiPath);
    graphiqlApiInternalEndpoint = _replaceWithLocalEndpoint(
      graphiqlApiPathInternal
    );
  }

  const DEV_ENVS = ['local', 'aws-dev', 'aws-stage', 'zsfc01-usgoveast1'];

  function isDevEnv() {
    const nodeEnv = _.get(config, 'nodeEnv', null);
    return nodeEnv && DEV_ENVS.includes(nodeEnv);
  }

  // only establish '/graphiql' URL when the build folder exist
  const buildFolderPath = pathLib.join(__dirname, 'graphiql/build');
  const templateFilePath = buildFolderPath + '/index.html';
  const filePaths = [
    `${buildFolderPath}/static_${_.trim(graphiqlApiPath, '/')}_index.html`,
    `${buildFolderPath}/static_${_.trim(
      graphiqlApiPathInternal,
      '/'
    )}_index.html`
  ];
  const graphiqlSettings = {
    available: fs.existsSync(templateFilePath),
    buildFolderPath: buildFolderPath,
    templateFilePath: templateFilePath,
    fileAPIPath: filePaths[0],
    fileAPIPathInternal: filePaths[1]
  };

  return {
    apiPath,
    apiEndpoint,
    playgroundPath,
    playgroundEndpoint,
    enableInternalSchema,
    apiPathInternal,
    playgroundPathInternal,
    playgroundEndpointInternal,
    playgroundSubscriptionEndpoint,
    isDevEnv,
    subscriptionPath,
    enableSubscription,
    adminApiEndpoint,
    graphiqlSettings,
    graphiqlApiPath,
    graphiqlApiEndpoint,
    graphiqlApiPathInternal,
    graphiqlApiInternalEndpoint
  };
};
