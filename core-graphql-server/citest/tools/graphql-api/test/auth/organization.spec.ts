import { helpers } from '../../src/helpers/index';
import * as _ from 'lodash';
import * as uuid from 'uuid';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { OrganizationType } from '../../src/gql';
const config = helpers.config;
let sdkClient: GraphqlClient;

// use this name stamp on packages and resources for clean-up filtering and aiWARE CI Test artifact identification
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const AIWARE_CI_TEST_STAMP = citestMarker;

let token: string;
const userAgent = config.userAgent || 'core-graphql-server test';

let debug = config.debug && config.debug === true;
const organizationId = 7682,
  integrationId = 'test' + _.toString(Date.now());

const nameOrg = citestMarker + '-organization-admin-seat-limit';
const ADMIN_ROLE = 'ddca9b68-d775-4934-8ffd-7aecc779b652';
const DESKTOP_ADMIN_ROLE = '032218c3-d47e-4287-9d16-7bb867c01266';
let organizationSeatLimitID: string;
let userId: string;
describe('citest_auth: authenticate', () => {
  beforeAll(async () => {
    const env = config.env;
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    token = sdkClient.sessionToken as string;
  });

  describe('organization integration config', () => {
    const username = `user_${_.toString(Date.now())}@localhost`;
    let regularUser: any, userToken: string;

    beforeAll(async () => {
      // create user with CMS viewer role

      const response = await sdkClient.sdk.createUser({
        input: {
          name: username,
          password: config.password,
          organizationId: organizationId.toString(),
          roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'],
          firstName: AIWARE_CI_TEST_STAMP,
          lastName: AIWARE_CI_TEST_STAMP,
          jsondata: {
            foo: AIWARE_CI_TEST_STAMP
          },
          sendNewUserEmail: false
        }
      });
      regularUser = _.get(response, 'data.createUser');
      expect(regularUser).toBeDefined();
    });

    describe('organization integration config', () => {
      beforeAll(async () => {
        const result = await sdkClient.sdk.userLogin({
          input: {
            userName: username,
            password: config.password
          }
        });
        const loginData = _.get(result, 'data.userLogin');
        expect(loginData).toBeDefined();
        userToken = _.get(loginData, 'token')!;
        expect(userToken).toBeDefined();
      });

      it('should get an org with integration config did not exists', async () => {
        const query = `query {
          organization(id: ${organizationId}) {
            id
            integrationConfig(id: "does-not-exist") {
              config
            }
          }
        }`;

        try {
          await sdkClient.query(query);
        } catch (e: any) {
          expect(e.message).toMatch(/not found/);
        }
      });

      it('should set an org integration config with userVisible true', async () => {
        var options = {
          headers: {
            Authorization: 'Bearer ' + token,
            'User-Agent': userAgent,
            Accept: '*/*'
          }
        };

        const response = await sdkClient.sdk.setOrganizationIntegrationConfig({
          input: {
            organizationId: organizationId.toString(),
            integrationId: integrationId,
            config: {
              testField: 'first test name'
            },
            userVisible: true
          }
        });
        const ingegrationConfig = _.get(
          response,
          'data.setOrganizationIntegrationConfig'
        );

        expect(ingegrationConfig).toBeDefined();
        expect(ingegrationConfig.config.testField).toEqual('first test name');
        expect(ingegrationConfig.userVisible).toEqual(true);
      });

      it('regular user can retrieve integration config with userVisible true', async () => {
        const query = `query {
          me {
            id
            organizationId
            organization {
              integrationConfig(id: "${integrationId}") {
                organizationId
                integrationId
                config
                userVisible
              }
            }
          }
        }`;

        const response = await sdkClient.query(query, undefined, {
          Authorization: `Bearer ${userToken}`
        });

        const integrationConfig = _.get(
          response,
          'me.organization.integrationConfig'
        );
        expect(integrationConfig.organizationId).toEqual(
          organizationId.toString()
        );
        expect(integrationConfig.integrationId).toEqual(integrationId);
        expect(integrationConfig.config.testField).toEqual('first test name');
        expect(integrationConfig.userVisible).toEqual(true);
      });

      it('regular user can retrieve integration config during userLogin', async () => {
        const query = `mutation login {
          userLogin(input: {userName: "${username}", password: "${config.password}"}) {
            token
            organization {
              integrationConfig(id: "${integrationId}") {
                organizationId
                integrationId
                userVisible
              }
            }
          }
        }
        `;

        const response = await sdkClient.query(query);
        // await gqlClient.query(query);
        const integrationConfig = _.get(
          response,
          'userLogin.organization.integrationConfig'
        );
        expect(integrationConfig.organizationId).toEqual(
          organizationId.toString()
        );
        expect(integrationConfig.integrationId).toEqual(integrationId);
        expect(integrationConfig.userVisible).toEqual(true);
      });

      it('should update an org integration config with userVisible false', async () => {
        const response = await sdkClient.sdk.setOrganizationIntegrationConfig({
          input: {
            organizationId: organizationId.toString(),
            integrationId: integrationId,
            config: {
              testField: 'test name'
            },
            userVisible: false
          }
        });

        const setOrganizationIntegrationConfig = _.get(
          response,
          'data.setOrganizationIntegrationConfig'
        );
        expect(
          _.get(setOrganizationIntegrationConfig, 'organizationId')
        ).toEqual(organizationId.toString());
        expect(
          _.get(setOrganizationIntegrationConfig, 'integrationId')
        ).toEqual(integrationId);
        expect(
          _.get(setOrganizationIntegrationConfig, 'config.testField')
        ).toEqual('test name');
        expect(setOrganizationIntegrationConfig.userVisible).toEqual(false);
      });

      it('admin user should get Organization Integration Config', async () => {
        const query = `query {
          organization(id: ${organizationId}) {
            id
            integrationConfig(id: "${integrationId}") {
              organizationId
              integrationId
              config
              userVisible
            }
          }
        }`;

        const response = await sdkClient.query(query);
        // await gqlClient.query(query);
        const integrationConfig = _.get(
          response,
          'organization.integrationConfig'
        );
        expect(integrationConfig.organizationId).toEqual(
          organizationId.toString()
        );
        expect(integrationConfig.integrationId).toEqual(integrationId);
        expect(integrationConfig.config.testField).toEqual('test name');
        expect(integrationConfig.userVisible).toEqual(false);
      });

      it('regular user cannot retrieve integration config with userVisible false', async () => {
        const query = `query {
            organization(id: ${organizationId}) {
              id
              integrationConfig(id: "${integrationId}") {
                organizationId
                integrationId
                config
                userVisible
              }
            }
          }`;

        await expect(
          sdkClient.query(query, undefined, {
            Authorization: `Bearer ${userToken}`
          })
        ).rejects.toThrow(/not authorized/);
      });

      it('should get Organization Integration Config - ApiToken', async () => {
        const query = `query {
            me {
              organization {
                id
                integrationConfig(id: "${integrationId}") {
                  organizationId
                  integrationId
                  config
                  userVisible
                }
              }
            }
          }`;

        const response = await sdkClient.query(query);
        // await gqlClient.query(query);
        const integrationConfig = _.get(
          response,
          'me.organization.integrationConfig'
        );
        expect(integrationConfig.organizationId).toEqual(
          organizationId.toString()
        );
        expect(integrationConfig.integrationId).toEqual(integrationId);
        expect(integrationConfig.config.testField).toEqual('test name');
        expect(integrationConfig.userVisible).toEqual(false);
      });

      it('should delete an org integration config', async () => {
        const response =
          await sdkClient.sdk.deleteOrganizationIntegrationConfig({
            input: {
              organizationId: organizationId.toString(),
              integrationId: integrationId
            }
          });

        const deleteOrganizationIntegrationConfig = _.get(
          response,
          'data.deleteOrganizationIntegrationConfig'
        );
        expect(deleteOrganizationIntegrationConfig).toBeDefined();

        expect(
          deleteOrganizationIntegrationConfig.organizationId
        ).toBeDefined();
        expect(deleteOrganizationIntegrationConfig.organizationId).toEqual(
          organizationId.toString()
        );
        expect(deleteOrganizationIntegrationConfig.integrationId).toBeDefined();
        expect(deleteOrganizationIntegrationConfig.integrationId).toEqual(
          integrationId
        );
        expect(deleteOrganizationIntegrationConfig).toBeDefined();
      });
    });

    describe('user admin seat limit', () => {
      it('should allow create and update admin user when org is max adminSeatLimit', async () => {
        organizationSeatLimitID = await createOrganization(nameOrg);
        await updateOrgLimits(sdkClient, organizationSeatLimitID, token, {
          adminSeatLimit: 1
        });

        const result = await sdkClient.sdk.createUser({
          input: {
            name: `${citestMarker}-test_user_1_${uuid.v4()}@localhost`,
            password: '123456789',
            organizationId: organizationSeatLimitID,
            roleIds: [ADMIN_ROLE, DESKTOP_ADMIN_ROLE],
            firstName: 'First',
            lastName: 'Last',
            jsondata: {
              foo: 'bar'
            }
          }
        });

        const createdUser: any = _.get(result, 'data.createUser');
        expect(createdUser.id).toBeDefined();
        expect(createdUser.name).toBeDefined();

        userId = createdUser.id;

        const updated = await sdkClient.sdk.updateUser({
          input: {
            id: userId,
            firstName: 'UpdatedFirst',
            lastName: 'UpdatedLast',
            roleIds: [ADMIN_ROLE, DESKTOP_ADMIN_ROLE]
          }
        });
        const updatedUser: any = _.get(updated, 'data.updateUser');
        expect(updatedUser.id).toEqual(userId);
        expect(updatedUser.firstName).toEqual('UpdatedFirst');
        expect(updatedUser.lastName).toEqual('UpdatedLast');
      });

      it('should allow add admin role when org is max adminSeatLimit', async () => {
        const res = await helpers.addRole(
          sdkClient.authUrl,
          userId,
          ADMIN_ROLE,
          token
        );
        expect(res.status).toBe(204);
      });
      it('shoule delete user', async () => {
        const result = await sdkClient.sdk.deleteUser({ id: userId });
        const deletedUser: any = _.get(result, 'data.deleteUser');
        expect(deletedUser.id).toEqual(userId);
      });
    });

    describe('user seat limit', () => {
      it('should allow create user when org is not at max seatLimit', async () => {
        const orgName = citestMarker + '-organization-seat-limit';
        organizationSeatLimitID = await createOrganization(orgName);
        await updateOrgLimits(sdkClient, organizationSeatLimitID, token, {
          seatLimit: 1
        });

        const result = await sdkClient.sdk.createUser({
          input: {
            name: `${citestMarker}-test_user_1_${uuid.v4()}@localhost`,
            password: '123456789',
            organizationId: organizationSeatLimitID,
            roleIds: [ADMIN_ROLE, DESKTOP_ADMIN_ROLE],
            firstName: 'First',
            lastName: 'Last',
            jsondata: {
              foo: 'bar'
            }
          }
        });
        const createdUser: any = _.get(result, 'data.createUser');
        expect(createdUser.id).toBeDefined();
        expect(createdUser.name).toBeDefined();
      });

      it('should not allow add user when seatLimit is at max', async () => {
        try {
          await sdkClient.sdk.createUser({
            input: {
              name: `${citestMarker}-test_user_1_${uuid.v4()}@localhost`,
              password: '123456789',
              organizationId: organizationSeatLimitID,
              roleIds: [ADMIN_ROLE, DESKTOP_ADMIN_ROLE],
              firstName: 'First',
              lastName: 'Last',
              jsondata: {
                foo: 'bar'
              }
            }
          });
        } catch (e: any) {
          expect(e.message).toMatch(/invalid request, seat limit exceeded/);
        }
      });
    });
  });
});

async function createOrganization(prefixName: string) {
  // create organization
  const variables = {
    kvp: {
      test: 'value',
      features: {
        automaticPackageCreation: 'enabled'
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
  const resultOrg = await sdkClient.sdk.createOrganization({
    input: {
      name: `${prefixName}-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
      metadata: variables.kvp,
      applications: variables.apps
    }
  });

  const createdOrg: any = _.get(resultOrg, 'data.createOrganization');
  expect(createdOrg.type).toEqual(
    expect.arrayContaining(['Agency', 'Broadcaster'])
  );
  expect(createdOrg.id).toBeDefined();
  expect(createdOrg.guid).toBeDefined();
  return createdOrg.id;
}
async function updateOrgLimits(
  sdkClient: GraphqlClient,
  applicationOrgId: string,
  superToken: string,
  { seatLimit, adminSeatLimit }: { seatLimit?: number; adminSeatLimit?: number }
) {
  return helpers.updateOrganization(
    sdkClient.authUrl,
    applicationOrgId,
    superToken,
    {
      seatLimit,
      adminSeatLimit,
      organizationName: `${nameOrg}-updated-${uuid.v4()}`,
      businessUnit: 'Legal',
      kvp: {
        test: 'value',
        features: {
          automaticPackageCreation: 'enabled'
        }
      },
      apps: [
        {
          applicationKey: 'aiware_desktop',
          name: 'AIWare Desktop'
        },
        {
          applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
          applicationKey: 'cms'
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
  );
}
