//TODO warnt only
const request = require('request');
const helpers = require('../helpers/index');

const _ = require('lodash');
const moment = require('moment');

const config = helpers.config;
const env = config.env;
const bakeConfig = require('../bakeConfig.json');

const durationMinutes = _.get(bakeConfig, `${env}.durationMinutes`, 10);
const minRequestsPerCheck = _.get(bakeConfig, `${env}.minRequestsPerCheck`, 10);
const maxErrorsPerCheck = _.get(bakeConfig, `${env}.maxErrorsPerCheck`, 0);
const checkIntervalSec = _.get(bakeConfig, `${env}.checkIntervalSec`, 10);
const maxEngineJWTErrorsPerCheck = _.get(
  bakeConfig,
  `${env}.maxEngineJWTErrorsPerCheck`,
  0
);
const maxInternalTokenErrorsPerCheck = _.get(
  bakeConfig,
  `${env}.maxInternalTokenErrorsPerCheck`,
  0
);

const allowedMinRequestsFailures = _.get(
  bakeConfig,
  `${env}.allowedMinRequestsFailures`,
  1
);

const startMillis = Date.now();
const endMillis = startMillis + durationMinutes * 60 * 1000;

describe('deployment stage bake test', () => {
  this.timeout(durationMinutes * 60 * 1000 * 2);

  let options;
  let s3uri, getUri;
  const authUrl = `https://api.${env}.veritone.com/v1`;
  const url = config.graphql_url || authUrl;

  const util = require('../../util.js')({});
  let ct = 0;
  let minRequestsFailures = 0;

  const query = `
query {
  me { id }
  graphqlServiceInfo {
    heartbeatStats
  }
}
`;

  async function testLoop() {
    let now = Date.now();
    let res;
    console.log(
      `${moment().toISOString()} "bake" test will run on ${env} for ${durationMinutes} minutes every ${checkIntervalSec} seconds. ${maxErrorsPerCheck} errors allowed per check.\n`
    );
    while (now < endMillis) {
      res = await testIt();
      now = Date.now();
      if (now < endMillis) res = await util.sleep(checkIntervalSec * 1000);
    }
    console.log(`\n${moment().toISOString()} "bake" test successful!`);
    return res;
  }

  async function testIt() {
    const result = await gqlClient.query(query);

    const requests = _.get(
      response,
      'body.data.graphqlServiceInfo.heartbeatStats.graphqlRequests',
      0
    );
    const errors = _.get(
      response,
      'body.data.graphqlServiceInfo.heartbeatStats.unexpectedError',
      0
    );
    const engineJWTErrors = _.get(
      response,
      'body.data.graphqlServiceInfo.heartbeatStats.engineJWTError',
      0
    );
    const internalTokenErrors = _.get(
      response,
      'body.data.graphqlServiceInfo.heartbeatStats.internalTokenError',
      0
    );
    console.log(
      `${moment().toISOString()} ${ct++} requests ${requests} errors ${errors} ${internalTokenErrors} ${engineJWTErrors}`
    );
    if (requests < minRequestsPerCheck) {
      minRequestsFailures++;
      if (minRequestsFailures > allowedMinRequestsFailures) {
        console.log(`

FAILURE! The test configuration for ${env} requires a minimum of ${minRequestsPerCheck} API
requests to be reported for each test interval. The current check fell below that threshold
with only ${requests} API requests. This may mean that load on the system is too low to validate
functionality or that code or configuration is broken so that statistics are not reported
properly in the "hearbeatStats" field.

------------------------------------------------------------------
          `);
      } else {
        console.log(`
WARNING:  API requests to server for this interval were below the threshold of ${minRequestsPerCheck}
at ${requests}. ${allowedMinRequestsFailures} failing intervals are allowed and ${allowedMinRequestsFailures -
          minRequestsFailures} remain.
`);
      }
    }
    if (errors > maxErrorsPerCheck) {
      console.log(`

FAILURE! The test configuration for ${env} allows a maximum of ${maxErrorsPerCheck} unexpected
errors to be reported for each test interval. The current check was above that threshold with
${errors} unexpected errors. This may mean that the last deployment broke something and
should be rolled back. Metrics in Prometheus/Kibana should be consulted. If errors were occuring
before the deployment, then something is broken on the system and the deployment cannot be
properly validated.

------------------------------------------------------------------
`);

      if (internalTokenErrors > maxInternalTokenErrorsPerCheck) {
        console.log(`

FAILURE! The test configuration for ${env} allows a maximum of ${maxInternalTokenErrorsPerCheck}
errors to be reported for internal tokens for each test interval.
These errors might be "expected" errors such as "not found" or "not allowed",
but when encountered by an internal token used by a system component can
indicate a serious problem. The current check was above that threshold with
${internalTokenErrors} unexpected errors. This may mean that the last deployment broke something and
should be rolled back. Metrics in Prometheus/Kibana should be consulted. If errors were occuring
before the deployment, then something is broken on the system and the deployment cannot be
properly validated.

------------------------------------------------------------------
`);
      }
      if (engineJWTErrors > maxEngineJWTErrorsPerCheck) {
        console.log(`

FAILURE! The test configuration for ${env} allows a maximum of ${maxEngineJWTErrorsPerCheck}
errors to be reported for engine JWT tokens for each test interval.
These errors might be "expected" errors such as "not found" or "not allowed",
but when encountered by a JWT used by a critical engine can
indicate a serious problem. The current check was above that threshold with
${engineJWTErrors} unexpected errors. This may mean that the last deployment broke something and
should be rolled back. Metrics in Prometheus/Kibana should be consulted. If errors were occuring
before the deployment, then something is broken on the system and the deployment cannot be
properly validated.

------------------------------------------------------------------
`);
      }
    }
    if (minRequestsFailures > allowedMinRequestsFailures) {
      expect(requests).to.be.above(minRequestsPerCheck - 1);
    }
    expect(errors).to.be.below(maxErrorsPerCheck + 1);
    expect(internalTokenErrors).to.be.below(maxInternalTokenErrorsPerCheck + 1);
    expect(engineJWTErrors).to.be.below(maxEngineJWTErrorsPerCheck + 1);
  }

  beforeAll(done => {
    helpers
      .signin(authUrl)
      .then(({ token, apiToken }) => {
        options = helpers.requestOptions(token);
        done();
      })
      .catch(err => done(err));
  });

  it('should run test loop', () => {
    console.log(
      '\n------------------------------------------------------------------'
    );
    return testLoop().then(() => {
      console.log(
        '------------------------------------------------------------------\n'
      );
    });
  });
});
