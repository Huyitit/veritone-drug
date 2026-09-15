'use strict';

jest.mock('./schema', () => () => ({ createSchema: () => ({}) }));
jest.mock('./customPlayground', () => () => ({}));
jest.mock('./graphqlConfig.js', () =>
  jest.fn(() => ({ enableSubscription: false, subscriptionPath: '/graphql' }))
);
jest.mock('subscriptions-transport-ws', () => ({
  SubscriptionServer: jest.fn()
}));

const { GraphqlServer } = require('./graphqlServer');
const { SubscriptionServer } = require('subscriptions-transport-ws');

describe('#graphqlServer.js — isTraceOn', function () {
  it('returns false when enableGraphQLTracing key is absent from config', function () {
    const gs = new GraphqlServer({ config: {} });
    expect(gs.isTraceOn()).toBe(false);
  });

  it('returns true when enableGraphQLTracing is explicitly set to true', function () {
    const gs = new GraphqlServer({ config: { enableGraphQLTracing: true } });
    expect(gs.isTraceOn()).toBe(true);
  });

  it('returns false when enableGraphQLTracing is explicitly set to false', function () {
    const gs = new GraphqlServer({ config: { enableGraphQLTracing: false } });
    expect(gs.isTraceOn()).toBe(false);
  });
});

describe('#graphqlServer.js — setupSubscriptionServer', function () {
  it('does not create a SubscriptionServer when enableSubscription is false', function () {
    SubscriptionServer.mockClear();
    const sc = {
      config: {},
      logger: { debug: jest.fn(), error: jest.fn() },
      metrics: { incrementCounter: jest.fn() }
    };
    const gs = new GraphqlServer(sc);
    gs.setupSubscriptionServer({});
    expect(SubscriptionServer).not.toHaveBeenCalled();
  });
});
