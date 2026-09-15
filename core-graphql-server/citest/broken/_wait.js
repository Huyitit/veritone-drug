const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const _ = require('lodash');
const moment = require('moment');

const config = helpers.config;
const env = config.env;

const bakeConfig = require('./bakeConfig.json');

const durationMinutes = _.get(bakeConfig, `${env}.waitDurationMinutes`, 1);
const checkIntervalSec = _.get(bakeConfig, `${env}.checkIntervalSec`, 10);
const startMillis = Date.now();
const endMillis = startMillis + durationMinutes * 60 * 1000;
const builds = {};

describe('wait for deployment to complete', () => {
  jest.timeout(durationMinutes * 60 * 1000 * 2);
  const util = require('../../util.js')({});

  const query = `
  query {
    graphqlServiceInfo {
      buildInfo
    }
  }
  `;

  async function testLoop() {
    let now = Date.now();
    let res;
    console.log(
      `${moment().format()} "wait" test will run on ${env} for ${durationMinutes} minutes every ${checkIntervalSec} seconds to ensure all containers are current for test run.\n`
    );
    const dateLen = moment().format().length;
    const hashLen = 'ba01f676c1434a713cd851990ad7308cb1c8a400'.length;
    console.log(
      `${'Time'.padEnd(dateLen, ' ')} ${'Server'.padEnd(
        50,
        ' '
      )} ${'Branch'.padEnd(20, ' ')} ${'Build'.padEnd(
        5,
        ' '
      )} ${'Build Date'.padEnd(dateLen, ' ')}${'Commit Hash'.padEnd(
        hashLen,
        ' '
      )}`
    );

    while (now < endMillis) {
      res = await testIt();
      now = Date.now();
      if (now < endMillis) res = await util.sleep(checkIntervalSec * 1000);
    }
    console.log(`\n${moment().format()} "bake" test successful!`);
    return res;
  }

  async function testIt() {
    const result = await gqlClient.query(query);

    const build = _.get(result, 'graphqlServiceInfo.buildInfo.buildNumber');
    const branch = _.get(result, 'graphqlServiceInfo.buildInfo.branch');
    const buildDate = _.get(result, 'graphqlServiceInfo.buildInfo.buildDate');
    const commitHash = _.get(result, 'graphqlServiceInfo.buildInfo.commitHash');
    const server = result._response.headers['veritone-service-ip'] || '???';
    builds[build] = true;

    console.log(
      `${moment().format()} ${server.padEnd(50, ' ')} ${branch.padEnd(
        20,
        ' '
      )} ${build.padEnd(5, ' ')} ${buildDate} ${commitHash}`
    );
  }

  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('should run test loop', async () => {
    console.log(
      '\n------------------------------------------------------------------'
    );
    await testLoop();
    if (Object.keys(builds).length > 1) {
      console.log(
        moment().format() +
          '  WARNING:  multiple build levels encountered -- ' +
          Object.keys(builds)
      );
    }
    console.log(
      '------------------------------------------------------------------\n'
    );
    expect(Object.keys(builds)).toHaveLength(1);
  });
});
