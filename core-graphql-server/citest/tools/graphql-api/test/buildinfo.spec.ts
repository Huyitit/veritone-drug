import { GraphQLClient } from 'graphql-request';
import { getSdk, RootFolderType } from '../src/gql/gql'; // This is the generated SDK

//const testBuildInfo = helpers.getTestBuildInfo();
// TODO: COMPARE WITH STAGE WHEN CORE-ADMIN IS BACK UP
describe('buildInfo', () => {
  let client = new GraphQLClient('https://api.stage.us-1.veritone.com/v3/graphql');
  let sdk = getSdk(client);

  test('get build info', async () => {
    const info = await sdk.graphqlServiceInfo();
    expect(info).toBeDefined();
    const buildInfo = info?.data?.graphqlServiceInfo?.buildInfo;

    expect(buildInfo).toBeDefined();
    expect(buildInfo.commitHash).toBeDefined();
    expect(buildInfo.buildNumber).toBeDefined();
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
