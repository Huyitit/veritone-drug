const {
  config,
  requestOptions,
  signin,
  supertest,
  postRetry
} = require('./index.js');
const _ = require('lodash');

class CoreAdminClient {
  constructor(environment) {
    this.url =
      config.core_admin_url || `https://api.${environment}.veritone.com/v1`;
    this.tokenAuth = requestOptions(config.apiToken);
  }

  async connect(userToken) {
    if (userToken) {
      this.userAuth = requestOptions(userToken);
    } else {
      const res = await signin(this.url);

      this.userAuth = requestOptions(res.token);
    }
  }

  async uploadFileMultipart(filePath, url, auth) {
    // Clone before mutating — callers often pass a shared auth object (e.g.
    // this.userAuth) that's reused for plain JSON requests elsewhere; setting
    // Content-Type in place on that shared object leaked 'multipart/form-data'
    // into later unrelated calls, which then failed to JSON-serialize their body.
    const uploadAuth = _.cloneDeep(auth);
    _.set(uploadAuth, 'headers.Content-Type', 'multipart/form-data');

    const res = await supertest(url)
      .post('')
      .set(uploadAuth.headers)
      .field('filename', 'test_file.csv')
      .attach('file', filePath)
      .expect(200);

    return _.get(res, 'body');
  }

  async get(url, auth, expected = 200) {
    return supertest(url).get('').set(auth.headers).expect(expected);
  }

  async post(url, data, useTokenAuth = false, isPatch = false) {
    let options = this.userAuth;
    if (_.isBoolean(useTokenAuth) && useTokenAuth) {
      options = this.tokenAuth;
    } else if (useTokenAuth === 'testToken') {
      options = this.testAuth;
    } else if (_.get(useTokenAuth, 'headers')) {
      options = useTokenAuth;
    }
    const respObj = await postRetry(
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
      const message = '[CAC-002] no body data';
      throw new Error(message);
    }
  }
}

module.exports = CoreAdminClient;
