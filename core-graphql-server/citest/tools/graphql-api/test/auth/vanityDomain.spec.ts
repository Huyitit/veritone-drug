import * as _ from 'lodash';

import { helpers } from '../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';

const config = helpers.config;
const env = config.env;

describe('citest_vanity: vanity domain tests', () => {
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
  });

  describe('smoke-test', () => {
    it('should set token with allowVanityDomain=true via the Mutation.userLogin', async () => {
      const result = await gqlClient.sdk.userLogin({
        input: {
          userName: config.userName,
          password: config.password,
          allowVanityDomain: true
        }
      });

      const token = result?.data?.userLogin?.token;
      expect(token).toBeDefined();
    });

    it('should set token with allowVanityDomain=false via the Mutation.userLogin', async () => {
      const result = await gqlClient.sdk.userLogin({
        input: {
          userName: config.userName,
          password: config.password,
          allowVanityDomain: false
        }
      });

      const token = result?.data?.userLogin?.token;
      expect(token).toBeDefined();
    });
  });

  it('should set cookie with allowVanityDomain=true via the Mutation.userLogin', async () => {
    const result = await gqlClient.sdk.userLogin({
      input: {
        userName: config.userName,
        password: config.password,
        allowVanityDomain: true
      }
    });

    const token = result?.data?.userLogin?.token;
    expect(token).toBeDefined();
    const cookies = result.headers.getSetCookie();
    if (env.includes('local')) {
      expect(
        cookies.some((cookie) => cookie.includes('veritone-session-id'))
      ).toEqual(true);
    } else {
      expect(
        cookies.some(
          (cookie) =>
            cookie.includes(`Domain=api.test.${env}.us-1.veritone.com`) &&
            cookie.includes('SameSite=None') &&
            cookie.includes('Secure')
        )
      ).toEqual(true);
    }
  });

  it('should set cookie with allowVanityDomain=true via the login API', async () => {
    const result = await helpers.signin(gqlClient.authUrl, {
      allowVanityDomain: true
    });

    const token = _.get(result, 'token');
    expect(token).toBeDefined();
    if (env.includes('local')) {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some((cookie: string) =>
          cookie.includes('veritone-session-id')
        )
      ).toEqual(true);
    } else {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some(
          (cookie: string) =>
            cookie.includes(`Domain=api.prod.${env}.us-1.veritone.com`) &&
            cookie.includes('SameSite=None') &&
            cookie.includes('Secure')
        )
      ).toEqual(true);
    }
  });

  it('should set cookie with allowVanityDomain=false via the Mutation.userLogin', async () => {
    const result = await gqlClient.sdk.userLogin({
      input: {
        userName: config.userName,
        password: config.password,
        allowVanityDomain: false
      }
    });

    const token = result?.data?.userLogin?.token;
    expect(token).toBeDefined();
    const cookies = result.headers.getSetCookie();
    if (env.includes('local')) {
      expect(
        cookies.some((cookie) => cookie.includes('veritone-session-id'))
      ).toEqual(true);
    } else {
      expect(
        cookies.some(
          (cookie) =>
            cookie.includes(`Domain=${env}.us-1.veritone.com`) &&
            !cookie.includes('SameSite=None') &&
            cookie.includes('Secure')
        )
      ).toEqual(true);
    }
  });

  it('should set cookie with allowVanityDomain=false via the login API', async () => {
    const result = await helpers.signin(gqlClient.authUrl, {
      allowVanityDomain: false
    });

    const token = _.get(result, 'token');
    expect(token).toBeDefined();
    if (env.includes('local')) {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some((cookie: string) =>
          cookie.includes('veritone-session-id')
        )
      ).toEqual(true);
    } else {
      expect(
        _.get(result, '_response.headers.set-cookie', []).some(
          (cookie: string) =>
            cookie.includes(`Domain=${env}.us-1.veritone.com`) &&
            !cookie.includes('SameSite=None') &&
            !cookie.includes('Secure')
        )
      ).toEqual(true);
    }
  });
});
