const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_ISO,
  DEFAULT_ENV_TO_RUN_IN
} = require('./helpers.auditLog.js');
const { expectConfigMarkedAsSensitive } = require('./helpers.routes.js');
const _ = require('lodash');
const supertest = require('supertest');
const URL = require('url-parse');

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

const services = {
  graphql: 'graphql_url',
  media_steamer: 'media_streamer_url',
  admin: 'core_admin_url'
};
const healthTable = _.reduce(
  services,
  (t, urlName, serviceName) => {
    if (_.get(config, urlName)) {
      t.push([serviceName, urlName]);
    }
    return t;
  },
  []
);

describeif(
  config.env === DEFAULT_ENV_TO_RUN_IN,
  'critical-path :: routes',
  () => {
    it('should return typename information when GET /graphql called with "?query=%7B__typename%7D"', async () => {
      const baseUrl = `${helpers.config.ingress_url}/v3/graphql`;
      const data = await supertest(baseUrl).get('?query=%7B__typename%7D');
      const responseBody = _.get(data, 'body');
      expect(responseBody).toEqual({ data: { __typename: 'Query' } });
    });

    it('should return status code 200 when GET /graphiql called with "?query=%7B__typename%7D"', async () => {
      const baseUrl = `${helpers.config.ingress_url}/v3/graphiql`;
      const data = await supertest(baseUrl)
        .get('?query=%7B__typename%7D')
        .expect(200);
    });

    it.each(healthTable)(
      '%s - should return app config with all sensitive data hidden',
      async (serviceName, urlName) => {
        const url = _.get(config, urlName);
        const parsedUrl = new URL(url);

        if (serviceName === 'graphql') {
          parsedUrl.set('pathname', 'v3');
        }

        const res = await supertest(parsedUrl.href).get('/health');
        const statusCode = _.get(res, 'body.status', _.get(res, 'statusCode'));

        expect(statusCode).toEqual(200);

        const appConfig = _.get(res, 'body.appConfig');
        expect(appConfig).toBeDefined();

        const sensitiveFieldPaths = _.get(appConfig, 'sensitiveFieldPaths', []);

        if (!_.isEmpty(sensitiveFieldPaths)) {
          expectConfigMarkedAsSensitive(appConfig, sensitiveFieldPaths);
        }
      }
    );
  }
);
