// @ts-ignore
import chakram from 'chakram';
import { get } from 'lodash';
import { helpers } from '@api/src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '@api/src/graphqlUtil';
import { impersonateUser } from '@api/src/helpers/commonHelper';

const config = helpers.config;

const hubUniversalUserId = '7b2a935e-6c68-4c59-b54d-d502f0b63d7d';

let hubUniversalOrgId: string;
let hubUniversalOrgGUId: string;
let adminToken: string;
let gqlClient: GraphqlClient;

describe('citest_hub: hub', () => {
  beforeAll(async () => {
    const orgId = await getHubOrgId();
    const stageHubUniversalOrgId = orgId || '7682';
    const localHubUniversalOrgId = orgId || '1';
    const env = config.env;
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(gqlClient.sessionToken).toBeDefined();
    adminToken = gqlClient.sessionToken!;
    hubUniversalOrgId = env.includes('local')
      ? localHubUniversalOrgId
      : stageHubUniversalOrgId;
    await setHubUserOrg();
  });

  it('should login with HUB universal agent and verify super admin permission', async () => {
    // login via impersonate
    const { requestOptions: hubUserOptions } = await impersonateUser(
      adminToken,
      hubUniversalUserId,
      hubUniversalOrgGUId
    );

    const result = await gqlClient.sdk.user(
      { id: hubUniversalUserId, organizationIds: [hubUniversalOrgId] },
      hubUserOptions
    );
    const user = get(result, 'data.user');
    expect(user).toBeDefined();
    expect(user?.roles).toBeDefined();
    expect(user?.roles?.[0]).toBeDefined();
    if (config.env.includes('local')) {
      expect(user?.roles?.[0].name).toEqual('aiWARE Instance Administrator');
    } else {
      expect(user?.roles?.[0].name).toEqual('Customer Service');
    }
  });
});

const setHubUserOrg = async () => {
  const adminOptions = helpers.requestOptions(adminToken).headers;
  const result = await gqlClient.sdk.user(
    { id: hubUniversalUserId, organizationIds: [hubUniversalOrgId] },
    adminOptions
  );
  const user = get(result, 'data.user');
  expect(user).toBeDefined();
  expect(user?.organization).toBeDefined();
  expect(user?.organization?.id).toBeDefined();
  expect(user?.organization?.guid).toBeDefined();
  hubUniversalOrgGUId = user?.organization?.guid!;
};

const getHubOrgId = async () => {
  const url = config.graphql_url;
  const healthUrl = url.replace('graphql', 'health');

  const health = await chakram.get(healthUrl);
  const orgId = get(health, 'body.appConfig.flyway.rootOrgId');
  expect(orgId).toBeDefined();
  return orgId;
};
