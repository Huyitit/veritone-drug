const helpers = require('./helpers/index');
const config = helpers.config;

const env = config.env;
const _ = require('lodash');

describe('citest_misc: Miscellaneous tests', () => {
  const authUrl = `https://api.${env}.veritone.com/v1`;
  const url = config.graphql_url || authUrl;

  describe('bad request', () => {
    it('return error on invalid content type', async () => {
      const result = await helpers
        .supertest(url)
        .post('')
        .send(`{ "query": "query { me { id }}"}`)
        .set({ 'Content-Type': 'application/octet-stream' })
        .expect(400);
      expect(_.get(result, 'body.errors[0].name')).toEqual('invalid_input');
      expect(_.get(result, 'body.errors[0].message')).toBeDefined();
      expect(result.headers).toHaveProperty('veritone-correlation-id');
      expect(result.headers).toHaveProperty('veritone-request-id');
      expect(result.headers).toHaveProperty('veritone-service-ip');
      expect(result.headers).toHaveProperty('veritone-build-info');
    });
  });
});
