/* global pending */
const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const chakram = require('chakram');
let gqlClient;

const hubUniversalUserId = '7b2a935e-6c68-4c59-b54d-d502f0b63d7d';

let hubUniversalOrgId, hubUniversalOrgGUId;
let hubUserToken, hubUserOptions;
let adminToken, adminOptions;

describe('citest_hub: hub', () => {
  beforeAll(async () => {
    const orgId = await getHubOrgId();
    const stageHubUniversalOrgId = orgId || '7682';
    const localHubUniversalOrgId = orgId || '1';
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    adminToken = result.token;
    adminOptions = helpers.requestOptions(adminToken);
    hubUniversalOrgId = env.includes('local')
      ? localHubUniversalOrgId
      : stageHubUniversalOrgId;
    await setHubUserOrg();
  });

  it('should login with HUB universal agent and verify super admin permission', async () => {
    //login via impersonate
    let url, impersonated;
    url = `${config.core_admin_url}/admin/impersonate/${hubUniversalUserId}/${hubUniversalOrgGUId}`;
    impersonated = await chakram.get(url, adminOptions);
    expect(_.get(impersonated, 'body.token')).toBeDefined();
    hubUserToken = _.get(impersonated, 'body.token');
    hubUserOptions = helpers.requestOptions(hubUserToken);

    let gql = `
    query {
      user(id: "${hubUniversalUserId}", organizationIds: ["${hubUniversalOrgId}"]) {
        roles {
          name
        }
      }
    }`;
    let result = await gqlClient.query(gql, {}, hubUserOptions);
    const user = _.get(result, 'user');
    expect(user).toBeDefined();
    expect(user.roles).toBeDefined();
    expect(user.roles[0]).toBeDefined();
    if (config.env.includes('local')) {
      expect(user.roles[0].name).toEqual('aiWARE Instance Administrator');
    } else {
      expect(user.roles[0].name).toEqual('Customer Service');
    }
  });
});

const setHubUserOrg = async () => {
  let gql = `
  query {
      user(id: "${hubUniversalUserId}", organizationIds: ["${hubUniversalOrgId}"]) {
        name
        id
        organization{
            id
            guid
        }
      }
    }
  `;
  let result = await gqlClient.query(gql, {}, adminOptions);
  const user = _.get(result, 'user');
  expect(user).toBeDefined();
  expect(user.organization).toBeDefined();
  expect(user.organization.id).toBeDefined();
  expect(user.organization.guid).toBeDefined();
  hubUniversalOrgGUId = user.organization.guid;
};

const getHubOrgId = async () => {
  let url = `${config.graphql_url}`;
  let healthUrl = url.replace('graphql', 'health');

  const health = await chakram.get(healthUrl);
  const orgId = _.get(health, 'body.appConfig.flyway.rootOrgId');
  expect(orgId).toBeDefined();
  return orgId;
};
