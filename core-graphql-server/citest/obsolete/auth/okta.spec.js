const helpers = require('../../helpers/index');
const config = helpers.config;
const supertest = require('supertest')('');
let baseUrl = config.graphql_url;
if (baseUrl.endsWith('/v3/graphql')) {
  baseUrl = baseUrl.replace('/v3/graphql', '/auth');
} else {
  baseUrl = baseUrl.replace('/graphql', '/auth');
}

let env = process.env.ENVIRONMENT || config.env;
// External dns for dev includes aws prefix
switch (env) {
  case 'dev':
  case 'aws-dev':
    env = 'dev.us-1.';
    break;
  case 'aws-stage':
    env = 'stage.us-1.';
    break;
  case 'prod':
  case 'aws-prod':
    // prod external dns doesn't include any env
    env = '';
    break;
  default:
    // all other environments should just need to add `environment + .`
    env += '.';
    break;
}

describe('citest_auth: Okta integration endpoint tests', () => {
  describe('auth-type', () => {
    it('should get normal login from auth-type endpoint', (done) => {
      const url = baseUrl + '/auth-type';
      supertest
        .post(url)
        .send(`userLoginId=${encodeURIComponent(config.userName)}`)
        .expect(
          'Location',
          new RegExp(
            `.*/login/#/next/\\?username=${config.userName.replace(
              /[-\/\\^$*+?.()|[\]{}]/g,
              '\\$&'
            )}`
          )
        )
        .expect(302, done);
    });
  });
  describe('authorization-code-callback', () => {
    it('should get error on invalid state', (done) => {
      const url =
        baseUrl +
        '/authorization-code-callback?' +
        'org=7682&' +
        'state=citest_invalid_state&' +
        'code=citest_fake_code&' +
        'appRedirect=' +
        baseUrl;
      supertest.get(url).expect(401, done);
    });
    it('should handle error from Okta', (done) => {
      const url =
        baseUrl +
        '/authorization-code-callback?' +
        'org=7682&' +
        'state=citest_invalid_state&' +
        'error=citest_err&' +
        'error_description=CITEST+error';
      // TODO this will change to redirect once error page is enabled
      supertest.get(url).expect(400, done);
    });
  });
});
