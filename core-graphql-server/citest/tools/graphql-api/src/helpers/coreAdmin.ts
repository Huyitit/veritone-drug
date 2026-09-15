import _ from 'lodash';
import { helpers } from './index';

const config = helpers.config;

type RequestAuth = { headers: Record<string, string> };

/**
 * TS port of the legacy `citest/helpers/coreAdmin.js` CoreAdminClient. Several
 * core-admin-server surfaces (admin tokens, SCIM user provisioning, OpenID
 * login redirects) have no GraphQL equivalent, so citests against them go
 * through plain REST calls instead of the generated SDK. Only the methods
 * actually exercised by `test/openId/openid.spec.ts` are ported here
 * (connect/get/post/uploadFileMultipart) — see the legacy file if a future
 * conversion needs more of its surface.
 */
export class CoreAdminClient {
  url: string;
  tokenAuth: RequestAuth;
  userAuth?: RequestAuth;
  testAuth?: RequestAuth;

  constructor(environment: string) {
    this.url =
      config.core_admin_url || `https://api.${environment}.veritone.com/v1`;
    this.tokenAuth = helpers.requestOptions(config.apiToken as string);
  }

  /**
   * Authenticates the client. Pass an existing session token to reuse it
   * (e.g. an isolated superadmin's session) — otherwise signs in fresh using
   * the configured citest credentials, matching the legacy behavior.
   */
  async connect(userToken?: string): Promise<void> {
    if (userToken) {
      this.userAuth = helpers.requestOptions(userToken);
    } else {
      const res = await helpers.signin(this.url);
      this.userAuth = helpers.requestOptions(res.token);
    }
  }

  async uploadFileMultipart(
    filePath: string,
    url: string,
    auth: RequestAuth
  ): Promise<any> {
    // Clone before mutating — callers often pass a shared auth object (e.g.
    // this.userAuth) that's reused for plain JSON requests elsewhere; setting
    // Content-Type in place on that shared object leaked
    // 'multipart/form-data' into later unrelated calls, which then failed to
    // JSON-serialize their body.
    const uploadAuth = _.cloneDeep(auth);
    _.set(uploadAuth, 'headers.Content-Type', 'multipart/form-data');

    const res = await helpers
      .supertest(url)
      .post('')
      .set(uploadAuth.headers)
      .field('filename', 'test_file.csv')
      .attach('file', filePath)
      .expect(200);

    return _.get(res, 'body');
  }

  async get(url: string, auth: RequestAuth, expected = 200): Promise<any> {
    return helpers.supertest(url).get('').set(auth.headers).expect(expected);
  }

  async post(
    url: string,
    data: any,
    useTokenAuth: boolean | 'testToken' | RequestAuth = false,
    isPatch = false
  ): Promise<any> {
    let options: RequestAuth | undefined = this.userAuth;
    if (_.isBoolean(useTokenAuth) && useTokenAuth) {
      options = this.tokenAuth;
    } else if (useTokenAuth === 'testToken') {
      options = this.testAuth;
    } else if (_.get(useTokenAuth, 'headers')) {
      options = useTokenAuth as RequestAuth;
    }

    const respObj = await helpers.postRetry(
      url,
      data,
      options,
      3, // retry count
      isPatch
    );

    if (
      respObj.status !== 200 &&
      respObj.status !== 204 &&
      respObj.status !== 201
    ) {
      if (config.debug) {
        console.log(JSON.stringify(respObj, null, 2));
      }
      throw new Error(
        `[CAC-001] Server response error: ${respObj.status}: ${JSON.stringify(respObj.body)}`
      );
    }

    if (respObj.status === 204) {
      return null;
    }

    const body = respObj.body;
    if (body) {
      return body;
    } else {
      throw new Error('[CAC-002] no body data');
    }
  }
}
