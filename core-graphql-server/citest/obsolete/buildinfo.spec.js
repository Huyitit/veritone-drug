const helpers = require('./helpers/index.js');
const GraphqlClient = require('./helpers/gql.js');

const config = helpers.config;
const _ = require('lodash');

//const testBuildInfo = helpers.getTestBuildInfo();
// TODO: COMPARE WITH STAGE WHEN CORE-ADMIN IS BACK UP
describe('buildInfo', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('get build info', async () => {
    const query = `query {
      graphqlServiceInfo {
        buildInfo
      }
    }`;
    // if (testBuildInfo && config.debug) {
    //   console.log(JSON.stringify(testBuildInfo, null, 2));
    // }
    const result = await gqlClient.query(query);
    expect(result.graphqlServiceInfo.buildInfo).toBeDefined();
    expect(
      _.get(result, 'graphqlServiceInfo.buildInfo.buildNumber')
    ).toBeDefined();
    /* buildInfo is of type JSONData, thus we cannot really enforce 
       any specific subfields validation as their availability is not guaranteed.
       ai13s environments don't have buildDate, and all other subfields are "unknown".
       If this assertion is important we'd need to type up buildInfo
    */
    // expect(
    //   _.get(result, 'graphqlServiceInfo.buildInfo.buildDate')
    // ).toBeDefined();
    expect(
      _.get(result, 'graphqlServiceInfo.buildInfo.commitHash')
    ).toBeDefined();

    // expect(
    //   _.get(respObj, 'body.data.graphqlServiceInfo.heartbeatStats'),
    //   respObj
    // ).to.be.null;
    // expect(_.get(respObj, 'body.errors[0].name'), respObj).toEqual(
    //   'authentication_error'
    // );

    /* TODO disable this comparison until test setup is correct so that it
       doesn't cause bogus failures
    expect(
      _.get(respObj, 'body.data.graphqlServiceInfo.buildInfo.commitHash')
    ).toEqual(testBuildInfo.commitHash);
    expect(
      _.get(respObj, 'body.data.graphqlServiceInfo.buildInfo.buildDate')
    ).toEqual(testBuildInfo.buildDate);
    expect(
      _.get(respObj, 'body.data.graphqlServiceInfo.buildInfo.buildNumber')
    ).toEqual(testBuildInfo.buildNumber);
    */
  });
});
