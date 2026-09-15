'use strict';

jest.mock('es7', () => ({
  Client: jest.fn().mockImplementation(() => ({})),
}));

const { Client: MockClient } = require('es7');
const createFunction = require('./elastic');

describe('elastic.js', () => {
  beforeEach(() => {
    MockClient.mockClear();
  });

  describe('authenticate', () => {
    it('adds Base64-encoded Authorization header when both username and password are provided', () => {
      const serviceContext = {
        elastic: {
          connection: {
            host: 'http://localhost:9200',
            username: 'esuser',
            password: 'espass',
          },
        },
      };

      createFunction(serviceContext);

      const headersPassedToClient = MockClient.mock.calls[0][0].headers;
      const expectedAuth = 'Basic ' + Buffer.from('esuser:espass').toString('base64');
      expect(headersPassedToClient['Authorization']).toBe(expectedAuth);
    });

    it('throws when only username is provided without a matching password', () => {
      const serviceContext = {
        elastic: {
          connection: { host: 'http://localhost:9200', username: 'esuser', password: '' },
        },
      };

      expect(() => createFunction(serviceContext)).toThrow();
    });
  });

  describe('newConnection', () => {
    it('returns a new ES client pointed at the given host with authenticated headers', () => {
      const serviceContext = {
        elastic: {
          connection: { host: 'http://localhost:9200', username: 'u', password: 'p' },
        },
      };

      const { newConnection } = createFunction(serviceContext);
      const secondHost = 'http://es-node2:9200';
      newConnection(secondHost);

      expect(MockClient).toHaveBeenCalledTimes(2);
      const secondCallArgs = MockClient.mock.calls[1][0];
      expect(secondCallArgs.node).toBe(secondHost);
      expect(secondCallArgs.headers['Authorization']).toBeTruthy();
    });
  });

  describe('connection pooling / timeouts', () => {
    it('applies default requestTimeout, maxRetries, and keepAlive agent options to the client singleton', () => {
      const serviceContext = {
        elastic: { connection: { host: 'http://localhost:9200' } },
      };

      createFunction(serviceContext);

      const clientArgs = MockClient.mock.calls[0][0];
      expect(clientArgs.requestTimeout).toBe(30000);
      expect(clientArgs.maxRetries).toBe(0);
      expect(typeof clientArgs.agent).toBe('function');

      const agent = clientArgs.agent();
      expect(agent.options.keepAlive).toBe(true);
      expect(agent.options.keepAliveMsecs).toBe(1000);
      expect(agent.options.maxSockets).toBe(25);
      expect(agent.options.maxFreeSockets).toBe(10);
      agent.destroy();
    });

    it('honors configured overrides and applies them to both the singleton and newConnection', () => {
      const serviceContext = {
        elastic: {
          connection: {
            host: 'http://localhost:9200',
            requestTimeout: 5000,
            maxRetries: 1,
            maxSockets: 5,
            maxFreeSockets: 2,
          },
        },
      };

      const { newConnection } = createFunction(serviceContext);
      newConnection('http://es-node2:9200');

      [0, 1].forEach(callIndex => {
        const args = MockClient.mock.calls[callIndex][0];
        expect(args.requestTimeout).toBe(5000);
        expect(args.maxRetries).toBe(1);
        const agent = args.agent();
        expect(agent.options.maxSockets).toBe(5);
        expect(agent.options.maxFreeSockets).toBe(2);
        agent.destroy();
      });
    });

    it("passes newConnection's own target host to the instrumented agent, not the default client's host", () => {
      const http = require('http');
      const https = require('https');
      const serviceContext = {
        elastic: { connection: { host: 'http://localhost:9200' } },
      };

      const { newConnection } = createFunction(serviceContext);
      const defaultAgent = MockClient.mock.calls[0][0].agent();
      expect(defaultAgent).toBeInstanceOf(http.Agent);
      expect(defaultAgent).not.toBeInstanceOf(https.Agent);

      newConnection('https://es-node2:9200');
      const secondAgent = MockClient.mock.calls[1][0].agent();
      expect(secondAgent).toBeInstanceOf(https.Agent);

      defaultAgent.destroy();
      secondAgent.destroy();
    });
  });
});
