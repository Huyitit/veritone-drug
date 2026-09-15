import { find, get, includes } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { loadConfig } from '@api/src/config';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '@api/src/graphqlUtil';
import { safe, impersonateUser } from '@api/src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import {
  OrganizationType,
  StringMatch,
  EngineDistributionType,
  PackageStatus,
  PackageResourceType,
  PackageResourceAction,
  PackageGrantType,
  PackageGrantAction
} from '@api/src/gql';

const config = loadConfig();

interface CitestGlobals {
  citestMarker?: string;
}
const citestMarker =
  (globalThis as CitestGlobals).citestMarker || 'citest-should-delete';
const orgNamePrefix1 = `${citestMarker}-flow-citest-org1-2023-06-26`;
const createANewOrgForTesting = false;
const serverConfig = {
  featureFlags: {
    // Should change to true when all envs switched to use engine grant to make sure CI tests are success
    enablePackageGrantLogic: false
  }
};

async function setupTestOrganization(
  client: GraphqlClient,
  orgNamePrefix: string
): Promise<any> {
  const orgName = `${orgNamePrefix}-${uuidv4()}`;
  // set up organization and users
  const orgRes = await client.sdk.createOrganization({
    input: {
      name: orgName,
      businessUnit: 'Legal',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
      metadata: {
        features: {
          useEngineGrant: 'enabled'
        }
      },
      applications: [
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
    }
  });
  const newOrgId = get(orgRes, 'data.createOrganization.id');
  console.log(
    `>> Created test org for testing Flow: ${newOrgId} - ${orgName}`
  );

  // create admin + regular users
  // Admin roles: Admin; CMS Customer Service, Customer Service, Discovery Editor, Developer editor
  await client.sdk.createUser({
    input: {
      name: `${orgNamePrefix}-admin-user-${uuidv4()}@localhost`,
      organizationId: newOrgId!,
      firstName: 'Flow-User',
      lastName: 'Admin',
      jsondata: {
        firstName: 'Flow-User',
        lastName: 'Admin'
      },
      roleIds: [
        '032218c3-d47e-4287-9d16-7bb867c01266',
        '6d982ee9-ff07-499f-a182-03457a6187f6',
        '3459c3de-493f-443a-8ad0-ddb9f3f6c76d',
        '3577dfc6-f441-41f9-8dab-ef9079530450',
        '912e377e-f4a4-4184-8db1-baa9670d8081'
      ]
    }
  });

  await client.sdk.createUser({
    input: {
      name: `${orgNamePrefix}--regular-user-${uuidv4()}@localhost`,
      organizationId: newOrgId!,
      firstName: 'Flow-User',
      lastName: 'Regular',
      jsondata: {
        firstName: 'Flow-User',
        lastName: 'Regular'
      }
    }
  });

  const result = await client.sdk.organizations({
    name: orgName,
    nameMatch: StringMatch.Contains
  });

  return get(result, 'data.organizations.records[0]');
}

async function getOrganizationForTesting(
  client: GraphqlClient,
  superToken: string,
  prefix: string
): Promise<any> {
  let org: any;
  // get citest org
  if (!createANewOrgForTesting) {
    const graphqlResult = await client.sdk.organizations({
      name: prefix,
      nameMatch: StringMatch.Contains
    });
    org = get(graphqlResult, 'data.organizations.records[0]');
  }

  if (!org) {
    // create a new org
    org = await setupTestOrganization(client, prefix);
  } else {
    console.log(`>> Found a test org for Flow: ${org.id} - ${org.name}`);
  }
  expect(org).toBeDefined();
  expect(org.name).toContain(prefix);
  expect(org.users).toBeDefined();
  const users = get(org, 'users.records');
  // test users + superadmin who created the org
  expect(users.length).toEqual(3);

  const adminUser = find(users, (user: any) => includes(user.name, 'admin'));
  const regularUser = find(users, (user: any) =>
    includes(user.name, 'regular')
  );

  // Login for Admin user
  const { token: adminToken, requestOptions: adminOptions } =
    await impersonateUser(
      superToken,
      adminUser.id,
      adminUser.organizationGuid
    );

  // Login for Regular user
  const { requestOptions: regularOptions } = await impersonateUser(
    superToken,
    regularUser.id,
    regularUser.organizationGuid
  );

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
      const gqlClient = await createGraphqlClient(
        AuthType.SESSION_TOKEN,
        config.env
      );
      expect(gqlClient).toBeDefined();
    });
    return;
  }

  const testData: any = {
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

  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;

  beforeAll(async () => {
    const gqlClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      config.env
    );
    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);

    const superToken = isolatedSuperadmin.token;
    const meResult = await isolatedSuperadmin.client.sdk.me();

    expect(get(meResult, 'data.me')).toBeDefined();
    testData.superToken = superToken;
    testData.superOptions = isolatedSuperadmin.options;
    testData.superOrgGuid = get(meResult, 'data.me.organization.guid');
    testData.superOrgId = get(meResult, 'data.me.organization.id');
    testData.superUserId = get(meResult, 'data.me.id');

    testData.orgs.org1.info = get(meResult, 'data.me.organization');
    testData.orgs.org1.adminToken = superToken;
    testData.orgs.org1.adminOptions = isolatedSuperadmin.options;

    testData.orgs.org2 = await getOrganizationForTesting(
      isolatedSuperadmin.client,
      superToken,
      orgNamePrefix1
    );
  });

  afterAll(async () => {
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  describe('Flow', () => {
    it('Org1: create a flow', async () => {
      const flowId = uuidv4();
      const result = await isolatedSuperadmin.client.sdk.createFlow(
        {
          input: {
            id: flowId,
            name: `${citestMarker}-graphql-ci-test-flow-${flowId}`,
            description: 'graphql-flow-description'
          }
        },
        testData.orgs.org1.adminOptions
      );
      testData.orgs.org1.flows.public = get(result, 'data.createFlow');
      expect(testData.orgs.org1.flows.public).toBeDefined();

      expect(testData.orgs.org1.flows.public.id).toBeDefined();
      expect(testData.orgs.org1.flows.public.id).toEqual(flowId);
    });

    it('Org2: should not get flow when has not been granted', async () => {
      let result, error;
      try {
        result = await isolatedSuperadmin.client.sdk.flow(
          { id: testData.orgs.org1.flows.public.id },
          testData.orgs.org2.adminOptions
        );
      } catch (err) {
        error = `${err}`;
      }

      expect(result).toBeUndefined();

      expect(error).toBeDefined();
      expect(error).toContain('authorization_error');
      expect(error).toContain('Flow does not access via accessible package');
    });

    it('Org1: should create public package with engine resources', async () => {
      const result = await isolatedSuperadmin.client.sdk.packageCreate(
        {
          input: {
            id: uuidv4(),
            organizationId: testData.orgs.org1.info.id,
            name: `${citestMarker}-citest_package_${Date.now()}`,
            description:
              'a mock package to evaluate grant for an organization',
            distributionType: EngineDistributionType.Public,
            status: PackageStatus.Published,
            version: '1.0',
            resources: [
              {
                resourceId: testData.orgs.org1.flows.public.id,
                resourceType: PackageResourceType.Engine,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        testData.orgs.org1.adminOptions
      );
      testData.orgs.org1.packages.public = get(result, 'data.packageCreate');
      expect(get(result, 'data.packageCreate.id')).toBeDefined();
    });

    it('Org1: should grant created public package for the organization 2', async () => {
      const result = await isolatedSuperadmin.client.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.orgs.org1.packages.public.id,
            packageGrants: [
              {
                organizationId: testData.orgs.org2.info.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        testData.orgs.org1.adminOptions
      );
      expect(get(result, 'data.packageUpdateGrants')).toBeDefined();
      expect(result.data.packageUpdateGrants?.id).toEqual(
        testData.orgs.org1.packages.public.id
      );
    });

    it('Org2: should get engines after granted', async () => {
      const result = await isolatedSuperadmin.client.sdk.engines(
        { ids: [testData.orgs.org1.flows.public.id] },
        testData.orgs.org2.adminOptions
      );
      const engines = get(result, 'data.engines.records');
      expect(engines).toBeDefined();
      expect(engines).toHaveLength(1);
      expect(engines![0]!.id).toEqual(testData.orgs.org1.flows.public.id);
    });

    it('Org2: should get a flow when has been granted', async () => {
      let result, error;
      try {
        result = await isolatedSuperadmin.client.sdk.flow(
          { id: testData.orgs.org1.flows.public.id },
          testData.orgs.org2.adminOptions
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeUndefined();
      expect(result).toBeDefined();
      const flow = get(result, 'data.flow');
      expect(flow).toBeDefined();
      expect(flow?.id).toEqual(testData.orgs.org1.flows.public.id);
    });

    it('Org2: should not be able to update the flow that is not owned by org 2', async () => {
      let result, error;

      try {
        result = await isolatedSuperadmin.client.sdk.updateFlow(
          {
            input: {
              id: testData.orgs.org1.flows.public.id,
              name: `${citestMarker}-${testData.orgs.org1.flows.public.id}-updated`,
              categoryId: testData.orgs.org1.flows.public.categoryId,
              deploymentModel: testData.orgs.org1.flows.public.deploymentModel
            }
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
      const flowId = uuidv4();
      const result = await isolatedSuperadmin.client.sdk.createFlow(
        {
          input: {
            id: flowId,
            name: `${citestMarker}-graphql-ci-test-flow-${flowId}`,
            description: 'graphql-flow-description'
          }
        },
        testData.orgs.org2.adminOptions
      );
      testData.orgs.org2.flows.private = get(result, 'data.createFlow');
      expect(testData.orgs.org2.flows.private).toBeDefined();

      expect(testData.orgs.org2.flows.private.id).toBeDefined();
      expect(testData.orgs.org2.flows.private.id).toEqual(flowId);
    });

    it('Org2: should create private package with engine resources', async () => {
      const result = await isolatedSuperadmin.client.sdk.packageCreate(
        {
          input: {
            id: uuidv4(),
            organizationId: testData.orgs.org2.info.id,
            name: `${citestMarker}-citest_package_${Date.now()}`,
            description:
              'a mock package to evaluate grant for an organization',
            distributionType: EngineDistributionType.Private,
            status: PackageStatus.Published,
            version: '1.0',
            resources: [
              {
                resourceId: testData.orgs.org2.flows.private.id,
                resourceType: PackageResourceType.Engine,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        testData.orgs.org1.adminOptions
      );
      testData.orgs.org2.packages.private = get(result, 'data.packageCreate');
      expect(get(result, 'data.packageCreate.id')).toBeDefined();
    });

    it('Org2: should be able to update the flow that is owned by org 2', async () => {
      let result, error;

      try {
        result = await isolatedSuperadmin.client.sdk.updateFlow(
          {
            input: {
              id: testData.orgs.org2.flows.private.id,
              name: `${citestMarker}-${testData.orgs.org2.flows.private.id}-updated`,
              categoryId: testData.orgs.org2.flows.private.categoryId,
              deploymentModel: testData.orgs.org2.flows.private.deploymentModel
            }
          },
          testData.orgs.org2.adminOptions
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeUndefined();
      expect(result).toBeDefined();
      const flow = get(result, 'data.updateFlow');
      expect(flow).toBeDefined();
      expect(flow?.id).toEqual(testData.orgs.org2.flows.private.id);
      expect(flow?.name).toEqual(
        `${testData.orgs.org2.flows.private.id}-updated`
      );
    });
  });
});
