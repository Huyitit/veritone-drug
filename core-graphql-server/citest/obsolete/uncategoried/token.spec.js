/* global pending */
const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const chakram = require('chakram');
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

describe('citest_token: token tests', () => {
  let superUserId, superToken;
  let testOrg;
  let superAdminOptions;
  let gqlClient;
  let orgLessToken;
  let tokenHashes = [];
  const tokens = [];

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    superAdminOptions = helpers.requestOptions(superToken);

    result = await gqlClient.query(meGql);

    expect(result.me).toBeDefined();
    superUserId = _.get(result, 'me.id');
    // get citest org
    result = await gqlClient.query(getOrgGQL);
    testOrg = _.get(result, 'organizations.records[0]', []);

    if (testOrg.length <= 0) {
      testOrg = await setupTestOrganization(gqlClient);
    }
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(citestMarker + '-api-token');
  });

  describe('Create API token', () => {
    describe('no providing userId', () => {
      it('create token - assign token to organization admin', async () => {
        const res = await createToken(
          { orgGuid: testOrg.guid, orgId: testOrg.id },
          superAdminOptions
        );
        const tokenId = _.get(res, 'tokenId');
        const tokenHash = _.get(res, 'tokenHash');
        const userId = _.get(res, 'userId');
        expect(tokenId).toBeDefined();
        expect(tokenHash).toBeDefined();
        expect(userId).toEqual(superUserId);

        tokenHashes.push(tokenHash);
        tokens.push(tokenId);
        orgLessToken = tokenId;
      });
    });

    describe('providing userId', () => {
      let ownerUserId;
      it('create user', async () => {
        const createRegularUser = `
          mutation createUser {
            createUser(
              input: {
                name: "${citestMarker}-token-citest-regular-user-${uuid.v4()}@localhost"
                organizationId: "${testOrg.id}"
                firstName: "Token-User"
                lastName: "Regular"
                jsondata: {
                  firstName: "Token-User"
                  lastName: "Regular"
                }
              }
            )  {
              id
              name
              firstName
              lastName
              jsondata
            }
          }`;
        const regularUser = await gqlClient.query(createRegularUser);
        ownerUserId = _.get(regularUser, 'createUser.id');
      });
      it('create token by superadmin', async () => {
        const res = await createToken(
          { orgGuid: testOrg.guid, orgId: testOrg.id, userId: ownerUserId },
          superAdminOptions
        );
        const tokenHash = _.get(res, 'tokenHash');
        const userId = _.get(res, 'userId');
        expect(tokenHash).toBeDefined();
        expect(userId).toEqual(ownerUserId);

        tokenHashes.push(tokenHash);
        tokens.push(res.tokenId);
      });
      it('create token by org less token', async () => {
        const res = await createToken(
          { orgGuid: testOrg.guid, orgId: testOrg.id, userId: ownerUserId },
          helpers.requestOptions(orgLessToken)
        );
        const tokenHash = _.get(res, 'tokenHash');
        const userId = _.get(res, 'userId');
        expect(tokenHash).toBeDefined();
        expect(userId).toEqual(ownerUserId);

        tokenHashes.push(tokenHash);
        tokens.push(res.tokenId);
      });
      it('delete a user', async () => {
        const query = `mutation {
          deleteUser(id: "${ownerUserId}")  {
            id
          }
        }
        `;
        const result = await gqlClient.query(query);
        expect(result.deleteUser.id).toEqual(ownerUserId);
      });
    });
  });

  describe('Validate API tokens', () => {
    it('validate tokens', async () => {
      for (let token of tokens) {
        const tokenOptions = helpers.requestOptions(token);
        const res = await gqlClient.query(meGql, undefined, tokenOptions);
        expect(_.get(res, 'me.id')).toBeDefined();
      }
    });
  });

  describe('Revoke tokens', () => {
    it('revoke tokens', async () => {
      for (let tokenHash of tokenHashes) {
        const res = await revokeToken(tokenHash, superAdminOptions);
        expect(_.get(res, 'json.isRevoked', false)).toEqual(true);
      }
    });
  });
});

const meGql = `
query {
  me {
    id
    name
    organization {
      id
      guid
      jsondata
    }
  }
}`;

const getOrgGQL = `
query getOrganization {
  organizations(
    name: "${citestMarker}-api-token-org"
    nameMatch: contains
  ) {
    records {
      id
      guid
      name
      users {
        records {
          name
          id
          organizationGuid
          authGroups {
            records {
              id
              name
              description
            }
          }
        }
      }
    }
  }
}`;

async function setupTestOrganization(client) {
  // set up organization
  const createOrgGql = `mutation ($kvp: JSONData!, $apps: JSONData) {
    createOrganization (input: {
      name: "${citestMarker}-api-token-org-${uuid.v4()}"
      businessUnit: "Legal"
      types: [agency, broadcaster]
      metadata: $kvp
      applications: $apps
    }) {
      id
      guid
      name
      type
      jsondata
    }
  }`;

  const variables = {
    kvp: {
      features: {
        enableRBACFeature: 'diabled'
      }
    },
    apps: [
      {
        applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
        applicationKey: 'cms'
      },
      isDesktopAppEnabled
        ? null
        : {
            applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
            applicationKey: 'admin'
          },
      {
        applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
        applicationKey: 'developer'
      },
      {
        applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
        applicationKey: 'discovery'
      }
    ].filter((app) => app)
  };
  await client.query(createOrgGql, variables);

  const result = await client.query(getOrgGQL);
  const testOrg = _.get(result, 'organizations.records[0]');
  return testOrg;
}

async function createToken(args = {}, options) {
  const url = `${config.core_admin_url}/admin/tokens`;
  const res = await chakram.post(
    url,
    {
      token: {
        userId: args.userId,
        applicationId: args.orgGuid,
        json: {
          rights: [
            'user:create',
            'user:update',
            'user:read',
            'user:delete',
            'token:create'
          ]
        },
        internal: true
      },
      orgId: args.orgId
    },
    options
  );
  return _.get(res, 'body', {});
}

async function revokeToken(tokenHash, options) {
  const url = `${config.core_admin_url}/admin/tokens/${tokenHash}/revoke`;
  const res = await chakram.post(url, {}, options);
  return _.get(res, 'body', {});
}
