'use strict';

let mockApplyMiddleware;

jest.mock('../customPlayground', () => {
  return () => ({
    applyMiddleware: (...args) => mockApplyMiddleware(...args)
  });
});

jest.mock('../graphqlConfig.js', () => {
  return (config) => config._graphqlConfig || {};
});

describe('graphiql route', () => {
  let mockApp;
  let serviceContext;

  beforeEach(() => {
    mockApplyMiddleware = jest.fn().mockResolvedValue(undefined);
    mockApp = { use: jest.fn() };
  });

  it('registers one playground when enableInternalSchema is false', async () => {
    serviceContext = {
      app: mockApp,
      config: {
        _graphqlConfig: {
          graphiqlApiPath: '/graphiql',
          graphiqlSettings: {
            fileAPIPath: '/app/graphiql.html',
            templateFilePath: '/app/template.html',
            fileAPIPathInternal: '/app/graphiql-internal.html'
          },
          playgroundEndpoint: '/graphql',
          enableInternalSchema: false
        }
      }
    };
    const setUpRoutes = require('./graphiql.js');
    await setUpRoutes(serviceContext);
    expect(mockApplyMiddleware).toHaveBeenCalledTimes(1);
    expect(mockApplyMiddleware.mock.calls[0][0]).toMatchObject({
      app: mockApp,
      path: '/graphiql'
    });
  });

  it('registers two playgrounds when enableInternalSchema is true', async () => {
    serviceContext = {
      app: mockApp,
      config: {
        _graphqlConfig: {
          graphiqlApiPath: '/graphiql',
          graphiqlApiPathInternal: '/graphiql-internal',
          graphiqlSettings: {
            fileAPIPath: '/app/graphiql.html',
            templateFilePath: '/app/template.html',
            fileAPIPathInternal: '/app/graphiql-internal.html'
          },
          playgroundEndpoint: '/graphql',
          playgroundEndpointInternal: '/graphql-internal',
          enableInternalSchema: true
        }
      }
    };
    const setUpRoutes = require('./graphiql.js');
    await setUpRoutes(serviceContext);
    expect(mockApplyMiddleware).toHaveBeenCalledTimes(2);
    expect(mockApplyMiddleware.mock.calls[1][0]).toMatchObject({
      app: mockApp,
      path: '/graphiql-internal'
    });
  });
});
