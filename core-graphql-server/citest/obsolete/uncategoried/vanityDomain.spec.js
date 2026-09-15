const helpers = require('../../helpers/index.js');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const env = config.env;

describe('citest_vanity: vanity domain tests', () => {
  describe('smoke-test', () => {
    let gqlClient;

    beforeAll(() => {
      gqlClient = new GraphqlClient(env);
    });

    it('should set token with allowVanityDomain=true via the Mutation.userLogin', async () => {
      const query = `mutation {
        userLogin(input: {
          userName: "${config.userName}"
          password: "${config.password}"
          allowVanityDomain: true
        }) {
          apiToken
          token
        }
      }`;
      await gqlClient.connect();
      const result = await gqlClient.query(query);

      const token = _.get(result, 'userLogin.token');
      expect(token).toBeDefined();
    });

    it('should set token with allowVanityDomain=false via the Mutation.userLogin', async () => {
      const query = `mutation {
        userLogin(input: {
          userName: "${config.userName}"
          password: "${config.password}"
          allowVanityDomain: false
        }) {
          apiToken
          token
        }
      }`;
      await gqlClient.connect();
      const result = await gqlClient.query(query);

      const token = _.get(result, 'userLogin.token');
      expect(token).toBeDefined();
    });
  });

  let gqlClient;

  beforeAll(() => {
    gqlClient = new GraphqlClient(env);
  });

  it('should set cookie with allowVanityDomain=true via the Mutation.userLogin', async () => {
    const query = `mutation {
        userLogin(input: {
          userName: "${config.userName}"
          password: "${config.password}"
          allowVanityDomain: true
        }) {
          apiToken
          token
        }
      }`;
    await gqlClient.connect();
    const result = await gqlClient.query(query);

    const token = _.get(result, 'userLogin.token');
    expect(token).toBeDefined();
    if (env.includes('local')) {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some((cookie) =>
          cookie.includes('veritone-session-id')
        )
      ).toEqual(true);
    } else {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some(
          (cookie) =>
            cookie.includes(`Domain=api.test.${env}.us-1.veritone.com`) &&
            cookie.includes('SameSite=None') &&
            cookie.includes('Secure')
        )
      ).toEqual(true);
    }
  });

  it('should set cookie with allowVanityDomain=true via the login API', async () => {
    const result = await helpers.signin(gqlClient.getAuthUrl(), {
      allowVanityDomain: true
    });

    const token = _.get(result, 'token');
    expect(token).toBeDefined();
    if (env.includes('local')) {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some((cookie) =>
          cookie.includes('veritone-session-id')
        )
      ).toEqual(true);
    } else {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some(
          (cookie) =>
            cookie.includes(`Domain=api.prod.${env}.us-1.veritone.com`) &&
            cookie.includes('SameSite=None') &&
            cookie.includes('Secure')
        )
      ).toEqual(true);
    }
  });

  it('should set cookie with allowVanityDomain=false via the Mutation.userLogin', async () => {
    const query = `mutation {
        userLogin(input: {
          userName: "${config.userName}"
          password: "${config.password}"
          allowVanityDomain: false
        }) {
          apiToken
          token
        }
      }`;
    await gqlClient.connect();
    const result = await gqlClient.query(query);

    const token = _.get(result, 'userLogin.token');
    expect(token).toBeDefined();
    if (env.includes('local')) {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some((cookie) =>
          cookie.includes('veritone-session-id')
        )
      ).toEqual(true);
    } else {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some(
          (cookie) =>
            cookie.includes(`Domain=${env}.us-1.veritone.com`) &&
            !cookie.includes('SameSite=None') &&
            cookie.includes('Secure')
        )
      ).toEqual(true);
    }
  });

  it('should set cookie with allowVanityDomain=false via the login API', async () => {
    const result = await helpers.signin(gqlClient.getAuthUrl(), {
      allowVanityDomain: false
    });

    const token = _.get(result, 'token');
    expect(token).toBeDefined();
    if (env.includes('local')) {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some((cookie) =>
          cookie.includes('veritone-session-id')
        )
      ).toEqual(true);
    } else {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some(
          (cookie) =>
            cookie.includes(`Domain=${env}.us-1.veritone.com`) &&
            !cookie.includes('SameSite=None') &&
            !cookie.includes('Secure')
        )
      ).toEqual(true);
    }
  });
});
