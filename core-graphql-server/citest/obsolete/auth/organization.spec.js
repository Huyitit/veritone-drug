// const request = require('request');
const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const chakram = require('chakram');
const uuid = require('uuid');
let gqlClient;

// use this name stamp on packages and resources for clean-up filtering and aiWARE CI Test artifact identification
const citestMarker = global.citestMarker || 'citest-should-delete';
const AIWARE_CI_TEST_STAMP = citestMarker;

let token;
let apiToken;
const userAgent = config.userAgent || 'core-graphql-server test';

let debug = config.debug && config.debug === true;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
const organizationId = 7682,
  integrationId = 'test' + _.toString(Date.now());

const nameOrg = citestMarker + '-organization-admin-seat-limit';
const ADMIN_ROLE = 'ddca9b68-d775-4934-8ffd-7aecc779b652';
const DESKTOP_ADMIN_ROLE = '032218c3-d47e-4287-9d16-7bb867c01266';
let organizationSeatLimitID;
let userId;
describe('citest_auth: authenticate', () => {
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    token = result.token;
  });

  describe('organization integration config', () => {
    const username = `user_${_.toString(Date.now())}@localhost`;
    let regularUser, userToken;

    beforeAll(async () => {
      // create user with CMS viewer role
      const query = `mutation {
        createUser(input: {
          name: "${username}"
          password: "${config.password}"
          organizationId: "${organizationId}"
          roleIds: ["555033d1-508c-49c0-8127-66c2dc129828"]
          firstName: "${AIWARE_CI_TEST_STAMP}"
          lastName: "${AIWARE_CI_TEST_STAMP}"
          jsondata: {
            foo: "${AIWARE_CI_TEST_STAMP}"
          }
          sendNewUserEmail: false
        })  {
          id
          name
          organizationId
        }
      }
      `;

      const response = await gqlClient.query(query, { token: token });
      regularUser = _.get(response, 'createUser');
      expect(regularUser).toBeDefined();
    });

    describe('organization integration config', () => {
      beforeAll(async () => {
        const query = `mutation login {
          userLogin(
            input: {
              userName: "${username}"
              password: "${config.password}"
            }
          ) {
            token
          }
        }
        `;
        const result = await gqlClient.query(query);
        expect(result.userLogin).toBeDefined();
        userToken = _.get(result, 'userLogin.token');
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
          const response = await gqlClient.query(query);
        } catch (e) {
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
        const query = `mutation {
          setOrganizationIntegrationConfig(input: {
            organizationId: ${organizationId}
            integrationId: "${integrationId}"
            config : {
              testField: "first test name"
            }
            userVisible : true
          }) {
            organizationId
            integrationId
            config
            userVisible
          }
        }`;

        const response = await gqlClient.query(query);
        const ingegrationConfig = _.get(
          response,
          'setOrganizationIntegrationConfig'
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

        const response = await gqlClient.query(query);
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

        const response = await gqlClient.query(query);
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
        const query = `mutation {
          setOrganizationIntegrationConfig(input: {
            organizationId: ${organizationId}
            integrationId: "${integrationId}"
            config : {
              testField: "test name"
            }
            userVisible : false
          }) {
            organizationId
            integrationId
            config
            userVisible
          }
        }`;

        const response = await gqlClient.query(query);

        const setOrganizationIntegrationConfig = _.get(
          response,
          'setOrganizationIntegrationConfig'
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

        const response = await gqlClient.query(query);
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
        var options = {
          headers: {
            Authorization: 'Bearer ' + userToken,
            'User-Agent': userAgent,
            Accept: '*/*'
          }
        };
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

        try {
          const response = await gqlClient.query(query);
        } catch (e) {
          expect(e.message).toMatch(/not found/);
        }
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

        const response = await gqlClient.query(query);
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
        const query = `
            mutation {
                deleteOrganizationIntegrationConfig(input: {
                    organizationId: ${organizationId}
                    integrationId: "${integrationId}"
                }) {
                    organizationId
                    integrationId
                    message
                }
              }`;

        const response = await gqlClient.query(query);

        expect(response.deleteOrganizationIntegrationConfig).toBeDefined();
        const deleteOrganizationIntegrationConfig = _.get(
          response,
          'deleteOrganizationIntegrationConfig'
        );

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
  });

  describe('user admin seat limit', () => {
    it('should allow create and update admin user when org is max adminSeatLimit', async () => {
      organizationSeatLimitID = await createOrganization(nameOrg);
      await updateOrgLimits(gqlClient, organizationSeatLimitID, token, {
        adminSeatLimit: 1
      });
      const createUserQuery = `mutation {
          createUser(input: {
            name: "${citestMarker}-test_user_1_${uuid.v4()}@localhost"
            password: "123456789"
            organizationId: "${organizationSeatLimitID}"
            roleIds: ["${ADMIN_ROLE}", "${DESKTOP_ADMIN_ROLE}"]
            firstName: "First"
            lastName: "Last"
            jsondata: {
              foo: "bar"
            }
          })  {
            id
            name
          }
        }`;

      const result = await gqlClient.query(createUserQuery);
      expect(result.createUser.id).toBeDefined();
      expect(result.createUser.name).toBeDefined();

      userId = result.createUser.id;
      const updateUserQuery = `mutation {
        updateUser(input: {
          id: "${userId}"
          firstName: "UpdatedFirst"
          lastName: "UpdatedLast"
          roleIds: ["${ADMIN_ROLE}", "${DESKTOP_ADMIN_ROLE}"]
        }) {
          id
          firstName
          lastName
        }
      }`;

      const updated = await gqlClient.query(updateUserQuery);
      expect(updated.updateUser.id).toEqual(userId);
      expect(updated.updateUser.firstName).toEqual('UpdatedFirst');
      expect(updated.updateUser.lastName).toEqual('UpdatedLast');
    });

    it('should allow add admin role when org is max adminSeatLimit', async () => {
      const res = await helpers.addRole(
        gqlClient.authUrl,
        userId,
        ADMIN_ROLE,
        token
      );
      expect(res.status).toBe(204);
    });
    it('shoule delete user', async () => {
      const query = `mutation {
          deleteUser(id: "${userId}")  {
            id
          }
        }`;
      const result = await gqlClient.query(query);
      expect(result.deleteUser.id).toEqual(userId);
    });
  });

  describe('user seat limit', () => {
    it('should allow create user when org is not at max seatLimit', async () => {
      const orgName = citestMarker + '-organization-seat-limit';
      organizationSeatLimitID = await createOrganization(orgName);
      await updateOrgLimits(gqlClient, organizationSeatLimitID, token, {
        seatLimit: 1
      });
      const createUserQuery = `mutation {
          createUser(input: {
            name: "${citestMarker}-test_user_1_${uuid.v4()}@localhost"
            password: "123456789"
            organizationId: "${organizationSeatLimitID}"
            roleIds: ["${ADMIN_ROLE}", "${DESKTOP_ADMIN_ROLE}"]
            firstName: "First"
            lastName: "Last"
            jsondata: {
              foo: "bar"
            }
          })  {
            id
            name
          }
        }`;

      const result = await gqlClient.query(createUserQuery);
      expect(result.createUser.id).toBeDefined();
      expect(result.createUser.name).toBeDefined();
    });

    it('should not allow add user when seatLimit is at max', async () => {
      try {
        const createUserQuery = `mutation {
          createUser(input: {
            name: "${citestMarker}-test_user_1_${uuid.v4()}@localhost"
            password: "123456789"
            organizationId: "${organizationSeatLimitID}"
            roleIds: ["${ADMIN_ROLE}", "${DESKTOP_ADMIN_ROLE}"]
            firstName: "First"
            lastName: "Last"
            jsondata: {
              foo: "bar"
            }
          })  {
            id
            name
          }
        }`;

        await gqlClient.query(createUserQuery);
      } catch (e) {
        expect(e.message).toMatch(/invalid request, seat limit exceeded/);
      }
    });
  });
});

async function createOrganization(prefixName) {
  // create organization
  const queryOrg = `mutation ($kvp: JSONData!, $apps: JSONData) {
        createOrganization (input: {
          name: "${prefixName}-${uuid.v4()}"
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
  const resultOrg = await gqlClient.query(queryOrg, variables);
  expect(resultOrg.createOrganization.type).toEqual(
    expect.arrayContaining(['Agency', 'Broadcaster'])
  );
  expect(resultOrg.createOrganization.id).toBeDefined();
  expect(resultOrg.createOrganization.guid).toBeDefined();
  return resultOrg.createOrganization.id;
}
async function updateOrgLimits(
  gqlClient,
  applicationOrgId,
  superToken,
  { seatLimit, adminSeatLimit }
) {
  return helpers.updateOrganization(
    gqlClient.authUrl,
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
    }
  );
}
