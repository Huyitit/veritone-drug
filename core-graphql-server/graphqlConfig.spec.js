// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')();

describe('#graphqlConfig.js', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      let graphqlConfig = require('./graphqlConfig.js')(serviceContext.config);
      expect(Object.keys(graphqlConfig).length).toEqual(18);
    });
  });
});

describe('#check graphql endpoint values', function () {
  describe('#check playgroundEndpoint value', function () {
    it('check value for playgroundEndpoint when run env is local, apiVersionPath is not set on it', function () {
      process.env.RUN_ENVIRONMENT = 'LOCAL';
      serviceContext.config.apiRoot = 'api.local.veritone.com';
      serviceContext.config.apiVersionPath = '/v1';
      let graphqlConfig = require('./graphqlConfig.js')(serviceContext.config);
      expect(graphqlConfig.playgroundEndpoint).toEqual(
        'http://localhost:3000/graphql'
      );
    });

    it('check value for playgroundEndpoint when run env is not local', function () {
      process.env.RUN_ENVIRONMENT = 'dev';
      serviceContext.config.apiRoot = 'api.dev.veritone.com';
      serviceContext.config.apiVersionPath = '/v1';
      let graphqlConfig = require('./graphqlConfig.js')(serviceContext.config);
      expect(graphqlConfig.playgroundEndpoint).toEqual(
        'api.dev.veritone.com/v1/graphql'
      );
    });

    // when graphql server is running in a cluster env, the value of apiVersionPath is ''
    // in that case the value for apiVersionPath by default is '/v3'
    it('check value for playgroundEndpoint when run env is not local and apiVersionPath is not defined', function () {
      process.env.RUN_ENVIRONMENT = 'dev';
      serviceContext.config.apiRoot = 'api.dev.veritone.com';
      serviceContext.config.apiVersionPath = '';
      let graphqlConfig = require('./graphqlConfig.js')(serviceContext.config);
      expect(graphqlConfig.playgroundEndpoint).toEqual(
        'api.dev.veritone.com/v3/graphql'
      );
    });
  });
});
