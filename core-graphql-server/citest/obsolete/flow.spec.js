const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const moment = require('moment');
const uuid = require('uuid');
const chakram = require('chakram');
const util = require('../../util.js')();
const citestMarker = global.citestMarker || 'citest-should-delete';
const orgNamePrefix1 = citestMarker + '-flow-citest-org1-2023-06-26';
const createANewOrgForTesting = false;
const serverConfig = {
  featureFlags: {
    // Should change to true when all envs switched to use engine grant to make sure CI tests are success
    enablePackageGrantLogic: false
  }
};

async function getOrganizationForTesting(gqlClient, superToken, prefix) {
  let org;
  // get citest org
  if (!createANewOrgForTesting) {
    const graphqlResult = await gqlClient.query(getOrgGQL(prefix));
    org = _.get(graphqlResult, 'organizations.records[0]');
  }

  if (!org) {
    // create a new org
    org = await setupTestOrganization(gqlClient, prefix);
  } else {
    console.log(`>> Found a test org for Flow: ${org.id} - ${org.name}`);
  }
  expect(org).toBeDefined();
  expect(org.name).toContain(prefix);
  expect(org.users).toBeDefined();
  const users = _.get(org, 'users.records');
  // test users + superadmin who created the org
  expect(users.length).toEqual(3);

  const adminUser = _.find(users, (user) => {
    return _.includes(user.name, 'admin');
  });
  const regularUser = _.find(users, (user) => {
    return _.includes(user.name, 'regular');
  });

  // Login for Admin user
  let url, options, impersonated;
  url = `${config.core_admin_url}/admin/impersonate/${adminUser.id}/${adminUser.organizationGuid}`;
  options = helpers.requestOptions(superToken);
  impersonated = await chakram.get(url, options);
  expect(_.get(impersonated, 'body.token')).toBeDefined();
  const adminToken = _.get(impersonated, 'body.token');
  const adminOptions = helpers.requestOptions(adminToken);

  // Login for Regular user
  url = `${config.core_admin_url}/admin/impersonate/${regularUser.id}/${regularUser.organizationGuid}`;
  options = helpers.requestOptions(superToken);
  impersonated = await chakram.get(url, options);
  expect(_.get(impersonated, 'body.token')).toBeDefined();
  const regularToken = _.get(impersonated, 'body.token');
  const regularOptions = helpers.requestOptions(regularToken);

  return {
    info: org,
    users,
    adminUser,
    regularUser,
    adminToken,
    adminOptions,
    regularOptions,
    flows: {
      public: null,
      private: null
    },
    packages: {
      public: null,
      private: null
    }
  };
}

describe('citest_flow: Flow-enablePackageGrantLogic = enabled/disabled', () => {
  if (!serverConfig.featureFlags.enablePackageGrantLogic) {
    it('enablePackageGrantLogic is not enabled', async () => {
      const env = config.env;
      const gqlClient = new GraphqlClient(env);
      expect(gqlClient).toBeDefined();
    });
    return;
  }

  const testData = {
    superToken: null,
    superOptions: null,
    superOrgGuid: null,
    superOrgId: null,
    superUserId: null,
    orgs: {
      org1: {
        info: null,
        users: null,
        adminUser: null,
        regularUser: null,
        adminToken: null,
        adminOptions: null,
        flows: {
          public: null,
          private: null
        },
        packages: {
          public: null,
          private: null
        }
      },
      org2: {
        info: null,
        users: null,
        adminUser: null,
        regularUser: null,
        adminToken: null,
        adminOptions: null,
        flows: {
          public: null,
          private: null
        },
        packages: {
          public: null,
          private: null
        }
      }
    }
  };

  let gqlClient;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    const superToken = result.token;
    result = await gqlClient.query(meGql);

    expect(result.me).toBeDefined();
    testData.superToken = superToken;
    testData.superOptions = helpers.requestOptions(testData.superToken);
    testData.superOrgGuid = _.get(result, 'me.organization.guid');
    testData.superOrgId = _.get(result, 'me.organization.id');
    testData.superUserId = _.get(result, 'me.id');

    testData.orgs.org1.info = _.get(result, 'me.organization');
    testData.orgs.org1.adminToken = superToken;
    testData.orgs.org1.adminOptions = helpers.requestOptions(superToken);

    testData.orgs.org2 = await getOrganizationForTesting(
      gqlClient,
      superToken,
      orgNamePrefix1
    );
  });

  describe('Flow', () => {
    it('Org1: create a flow', async () => {
      const flowId = uuid.v4();
      const query = `mutation createFlow {
        createFlow(
          input: {
            id: "${flowId}"
            name: "${citestMarker}-graphql-ci-test-flow-${flowId}"
            description: "graphql-flow-description"
          }
        ) {
          id
          ownerOrganizationId
          isPublic
          name
          categoryId
          deploymentModel
        }
      }`;
      const result = await gqlClient.query(
        query,
        {},
        testData.orgs.org1.adminOptions
      );
      testData.orgs.org1.flows.public = _.get(result, 'createFlow');
      expect(testData.orgs.org1.flows.public).toBeDefined();

      expect(testData.orgs.org1.flows.public.id).toBeDefined();
      expect(testData.orgs.org1.flows.public.id).toEqual(flowId);
    });

    it('Org2: should not get flow when has not been granted', async () => {
      const query = `
        query flow($id: ID!) {
          flow(id: $id) {
            id
            name
          }
        }
      `;
      let result, error;
      try {
        result = await gqlClient.query(
          query,
          {
            id: testData.orgs.org1.flows.public.id
          },
          testData.orgs.org2.adminOptions
        );
      } catch (err) {
        error = `${err}`;
      }

      expect(result).toBeUndefined();
      const flow = _.get(result, 'flow');
      expect(flow).toBeUndefined();

      expect(error).toBeDefined();
      expect(error).toContain('authorization_error');
      expect(error).toContain('Flow does not access via accessible package');
    });

    it('Org1: should create public package with engine resources', async () => {
      const query = `
        mutation packageCreate($name: String!, $orgId: ID, $resources: [PackageResourceInput]){
          packageCreate(input: {
            id: "${uuid.v4()}"
            organizationId: $orgId
            name: $name
            description: "a mock package to evaluate grant for an organization"
            distributionType: public
            status: published
            version: "1.0"
            resources: $resources
          }){
            id
          }
        }
    `;
      const variables = {
        name: `${citestMarker}-citest_package_${Date.now()}`,
        orgId: testData.orgs.org1.info.id,
        resources: [
          {
            resourceId: testData.orgs.org1.flows.public.id,
            resourceType: 'engine',
            action: 'ADD'
          }
        ]
      };
      const results = await gqlClient.query(
        query,
        variables,
        testData.orgs.org1.adminOptions
      );
      testData.orgs.org1.packages.public = _.get(results, 'packageCreate');
      expect(_.get(results, 'packageCreate.id')).toBeDefined();
    });

    it('Org1: should grant created public package for the organization 2', async () => {
      const mutation = `
        mutation packageUpdateGrants{
          packageUpdateGrants(input: {
            packageId: "${testData.orgs.org1.packages.public.id}"
            packageGrants: [
              {
                organizationId: ${testData.orgs.org2.info.id}
                grantType: GRANT
                action: ADD
              }
            ]
          }){
            id
          }
        }
      `;
      const results = await gqlClient.query(
        mutation,
        {},
        testData.orgs.org1.adminOptions
      );
      expect(_.get(results, 'packageUpdateGrants')).toBeDefined();
      expect(results.packageUpdateGrants.id).toEqual(
        testData.orgs.org1.packages.public.id
      );
    });
    it('Org2: should get engines after granted', async () => {
      const query = `
        query engines($ids: [ID!]) {
          engines(ids: $ids) {
            records {
              id
              name
            }
          }
        }
      `;
      const result = await gqlClient.query(
        query,
        {
          ids: [testData.orgs.org1.flows.public.id]
        },
        testData.orgs.org2.adminOptions
      );
      const engines = _.get(result, 'engines.records');
      expect(engines).toBeDefined();
      expect(engines).toHaveLength(1);
      expect(engines[0].id).toEqual(testData.orgs.org1.flows.public.id);
    });

    it('Org2: should get a flow when has been granted', async () => {
      const query = `
        query flow($id: ID!) {
          flow(id: $id) {
            id
            name
          }
        }
      `;
      let result, error;
      try {
        result = await gqlClient.query(
          query,
          {
            id: testData.orgs.org1.flows.public.id
          },
          testData.orgs.org2.adminOptions
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeUndefined();
      expect(result).toBeDefined();
      const flow = _.get(result, 'flow');
      expect(flow).toBeDefined();
      expect(flow.id).toEqual(testData.orgs.org1.flows.public.id);
    });

    it('Org2: should not be able to update the flow that is not owned by org 2', async () => {
      const query = `
      mutation updateFlow($id: ID!) {
        updateFlow(
          input: {
            id: $id
            name: "${citestMarker}-${testData.orgs.org1.flows.public.id}-updated"
            categoryId: "${testData.orgs.org1.flows.public.categoryId}"
            deploymentModel: ${testData.orgs.org1.flows.public.deploymentModel}
          }
        ) {
          id
          ownerOrganizationId
          isPublic
          name
          categoryId
          deploymentModel
        }
      }
      `;
      let result, error;

      try {
        result = await gqlClient.query(
          query,
          {
            id: testData.orgs.org1.flows.public.id
          },
          testData.orgs.org2.adminOptions
        );
      } catch (err) {
        error = `${err}`;
      }

      expect(result).toBeUndefined();
      expect(error).toBeDefined();
      expect(error).toContain('authorization_error');
      expect(error).toContain('Does not have access to do on the flows');
    });

    it('Org2: create a private flow', async () => {
      const flowId = uuid.v4();
      const query = `mutation createFlow {
        createFlow(
          input: {
            id: "${flowId}"
            name: "${citestMarker}-graphql-ci-test-flow-${flowId}"
            description: "graphql-flow-description"
          }
        ) {
          id
          ownerOrganizationId
          isPublic
          name
          categoryId
          deploymentModel
        }
      }`;
      const result = await gqlClient.query(
        query,
        {},
        testData.orgs.org2.adminOptions
      );
      testData.orgs.org2.flows.private = _.get(result, 'createFlow');
      expect(testData.orgs.org2.flows.private).toBeDefined();

      expect(testData.orgs.org2.flows.private.id).toBeDefined();
      expect(testData.orgs.org2.flows.private.id).toEqual(flowId);
    });

    it('Org2: should create private package with engine resources', async () => {
      const query = `
        mutation packageCreate($name: String!, $orgId: ID, $resources: [PackageResourceInput]){
          packageCreate(input: {
            id: "${uuid.v4()}"
            organizationId: $orgId
            name: $name
            description: "a mock package to evaluate grant for an organization"
            distributionType: private
            status: published
            version: "1.0"
            resources: $resources
          }){
            id
          }
        }
    `;
      const variables = {
        name: `${citestMarker}-citest_package_${Date.now()}`,
        orgId: testData.orgs.org2.info.id,
        resources: [
          {
            resourceId: testData.orgs.org2.flows.private.id,
            resourceType: 'engine',
            action: 'ADD'
          }
        ]
      };
      const results = await gqlClient.query(
        query,
        variables,
        testData.orgs.org1.adminOptions
      );
      testData.orgs.org2.packages.private = _.get(results, 'packageCreate');
      expect(_.get(results, 'packageCreate.id')).toBeDefined();
    });

    it('Org2: should be able to update the flow that is owned by org 2', async () => {
      const query = `
      mutation updateFlow($id: ID!) {
        updateFlow(
          input: {
            id: $id
            name: "${citestMarker}-${testData.orgs.org2.flows.private.id}-updated"
            categoryId: "${testData.orgs.org2.flows.private.categoryId}"
            deploymentModel: ${testData.orgs.org2.flows.private.deploymentModel}
          }
        ) {
          id
          ownerOrganizationId
          isPublic
          name
          categoryId
          deploymentModel
        }
      }
      `;
      let result, error;

      try {
        result = await gqlClient.query(
          query,
          {
            id: testData.orgs.org2.flows.private.id
          },
          testData.orgs.org2.adminOptions
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeUndefined();
      expect(result).toBeDefined();
      const flow = _.get(result, 'updateFlow');
      expect(flow).toBeDefined();
      expect(flow.id).toEqual(testData.orgs.org2.flows.private.id);
      expect(flow.name).toEqual(
        `${testData.orgs.org2.flows.private.id}-updated`
      );
    });
  });
});

async function setupTestOrganization(client, orgNamePrefix) {
  const orgName = `${orgNamePrefix}-${uuid.v4()}`;
  // set up organization and users
  const createOrgGql = `mutation ($kvp: JSONData!, $apps: JSONData) {
    createOrganization (input: {
      name: "${orgName}"
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
        useEngineGrant: 'enabled'
      }
    },
    apps: [
      {
        applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
        applicationKey: 'cms'
      },
      {
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
    ]
  };
  const org = await client.query(createOrgGql, variables);
  // const newOrgGuid = _.get(org, 'createOrganization.guid');
  const newOrgId = _.get(org, 'createOrganization.id');
  console.log(`>> Created test org for testing Flow: ${newOrgId} - ${orgName}`);

  // create admin + regular users
  // Admin roles: Admin; CMS Customer Service, Customer Service, Discovery Editor, Developer editor
  const createAdminUser = `
    mutation createUser {
      createUser(
        input: {
          name: "${orgNamePrefix}-admin-user-${uuid.v4()}@localhost"
          organizationId: "${newOrgId}"
          firstName: "Flow-User"
          lastName: "Admin"
          jsondata: {
            firstName: "Flow-User"
            lastName: "Admin"
          }
          roleIds: [
            "ddca9b68-d775-4934-8ffd-7aecc779b652",
            "6d982ee9-ff07-499f-a182-03457a6187f6",
            "3459c3de-493f-443a-8ad0-ddb9f3f6c76d",
            "3577dfc6-f441-41f9-8dab-ef9079530450",
            "912e377e-f4a4-4184-8db1-baa9670d8081"
          ]
        }
      )  {
        id
        name
        firstName
        lastName
        jsondata
      }
    }`;

  // create adminUser
  await client.query(createAdminUser, {});

  const createRegularUser = `
    mutation createUser {
      createUser(
        input: {
          name: "${orgNamePrefix}--regular-user-${uuid.v4()}@localhost"
          organizationId: "${newOrgId}"
          firstName: "Flow-User"
          lastName: "Regular"
          jsondata: {
            firstName: "Flow-User"
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

  // regularUser
  await client.query(createRegularUser);

  const result = await client.query(getOrgGQL(orgName));

  const testOrg = _.get(result, 'organizations.records[0]');
  return testOrg;
}

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
    authGroups {
      records {
        id
        name
        parentGroups {
          records {
            id
            name
            description
          }
        }
        permissionSet{
          id
          name
          permissions
        }
        appRole {
          description
          permissions {
            records {
              id
              name
              __typename
            }
          }
        }
      }
    }
  }
}`;

const getOrgGQL = (orgNamePrefix, orgName) => `
query getOrganization {
  organizations(
    name: "${orgName ? orgName : orgNamePrefix}"
    nameMatch: contains
  ) {
    records {
      id
      guid
      name
      rootFolder {
        id
        name
        description
      }
      users {
        records {
          name
          id
          organizationGuid
          organizationId
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
