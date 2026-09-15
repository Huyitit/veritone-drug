const _ = require('lodash');
const customPlayground = require('../customPlayground')();

module.exports = async function setUpRoutes(serviceContext) {
  const { app, config } = serviceContext;
  const graphqlConfig = require('../graphqlConfig.js')(config);
  const { templateFilePath, fileAPIPath, fileAPIPathInternal } =
    graphqlConfig.graphiqlSettings || {};

  await customPlayground.applyMiddleware({
    app,
    path: graphqlConfig.graphiqlApiPath,
    playground: {
      filePath: fileAPIPath,
      templateFilePath: templateFilePath,
      endpoint: graphqlConfig.playgroundEndpoint,
      settings: {
        'editor.theme': 'light'
      }
    }
  });

  if (graphqlConfig.enableInternalSchema) {
    await customPlayground.applyMiddleware({
      app,
      path: graphqlConfig.graphiqlApiPathInternal,
      playground: {
        filePath: fileAPIPathInternal,
        templateFilePath: templateFilePath,
        endpoint: graphqlConfig.playgroundEndpointInternal,
        settings: {
          'editor.theme': 'dark'
        }
      }
    });
  }
};
