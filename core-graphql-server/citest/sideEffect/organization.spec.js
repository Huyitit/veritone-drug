const helpers = require('../helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');
const uuid = require('uuid');
const _ = require('lodash');
const supertest = require('supertest');
const { requestOptions } = require('../helpers/index.js');
const CoreAdminClient = require('../helpers/coreAdmin.js');
const config = helpers.config;
const CI_TEST_ROLE = 'ddf6f444-eaf0-4ee3-bded-98776e5fee0f';
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

describe('organization tests', () => {
  let gqlClient, coreAdminClient;
  let orgId;
  let orgGuid;
  let hasRBACAuthModule = false;
  let superAdminOption;
  let authPermissionId;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    coreAdminClient = new CoreAdminClient(env);
    let result = await gqlClient.connect();

    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superAdminOption = requestOptions(result.token);

    const introspectionQuery = await gqlClient.query(`
    {
      __type(name: "AuthPermissionSet") {
        name
      }
    }`);

    hasRBACAuthModule = _.has(introspectionQuery, '__type.name');

    result = await gqlClient.query(`
      query {
        me {
          id
          name
          jsondata
          organization {
            id
            guid
            internalApplicationId
          }
        }
    }`);

    expect(result.me).toBeDefined();
  });

  afterAll(async () => {
    // delete org
    if (orgId) {
      const query = `mutation updateOrg {
          updateOrganization (input: {
            id: "${orgId}"
            status: "deleted"
          }){
            id
            status
          }
        }`;

      const result = await gqlClient.query(query, {}, superAdminOption);
      const updatedStatus = _.get(result, 'updateOrganization.status', '');
      expect(updatedStatus).toEqual('deleted');
    }
  });

  it('create organization', async () => {
    const query = `mutation ($kvp: JSONData!, $apps: JSONData) {
      createOrganization (input: {
        name: "${citestMarker}-test-org-${uuid.v4()}"
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
          enableRBACFeature: 'disabled'
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
    const result = await gqlClient.query(query, variables);
    expect(result.createOrganization.type).toEqual(
      expect.arrayContaining(['Agency', 'Broadcaster'])
    );
    expect(
      result.createOrganization.jsondata.features.enableRBACFeature
    ).toEqual('disabled');

    // APPs: Data Center , aiWARE Desktop , customCmsApp
    expect(result.createOrganization.jsondata.applicationIds).toHaveLength(3);
    expect(result.createOrganization.id).toBeDefined();
    expect(result.createOrganization.guid).toBeDefined();

    orgId = result.createOrganization.id;
    orgGuid = result.createOrganization.guid;
  });

  describe('enable/disable RBAC feature flag', () => {
    let testUserId;
    let testUserName;
    let testUserPassword;
    let testUserToken;
    let testUserOption;

    it('create user in the organization', async () => {
      if (hasRBACAuthModule) {
        testUserPassword = Date.now();
        const query = `mutation {
          createUser(input: {
            name: "${citestMarker}-test_user_${uuid.v4()}@localhost"
            password: "${testUserPassword}"
            organizationId: "${orgId}"
            roleIds: ["${CI_TEST_ROLE}"]
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
        const result = await gqlClient.query(query);
        expect(result.createUser.id).toBeDefined();
        expect(result.createUser.name).toBeDefined();

        testUserId = result.createUser.id;
        testUserName = result.createUser.name;
      }
    });

    it('test user login successfully', async () => {
      if (hasRBACAuthModule) {
        const query = `mutation {
          userLogin(input: {
            userName: "${testUserName}"
            password: "${testUserPassword}"
            organizationGuid: "${orgGuid}"
          }) {
            token
            user {
              id
              name
            }
            organization {
              id
              guid
              jsondata
            }
          }
        }`;
        const result = await gqlClient.query(query);
        expect(result.userLogin.organization).toBeDefined();
        expect(
          result.userLogin.organization.jsondata.features.enableRBACFeature
        ).toEqual('disabled');

        testUserToken = result.userLogin.token;
        testUserOption = requestOptions(testUserToken);
      }
    });

    it('should throw an not implemented error when the user uses any RBAC queries or muations', async () => {
      const query = `mutation {
            authPermissionSetCreate(input: {
              name: "${citestMarker}-test-permission-set-${uuid.v4()}",
              description: "desc"
              permissions: [CMS_SOURCES_READ, RECORDING_READ]
            }){
              id
              name
              description
              permissions
              createdAt
              modifiedAt
            }
          }`;

      await expect(async () =>
        gqlClient._execQuery(
          gqlClient.getUrl(),
          query,
          undefined,
          testUserOption
        )
      ).rejects.toThrow(/not_implemented/);
    });

    it('update oganization - enable RBAC feature', async () => {
      if (hasRBACAuthModule) {
        const query = `mutation {
          updateOrganization(input: {
            id: "${orgId}"
            metadata: {
              features: {
                enableRBACFeature: "enabled"
              }
            }
          }) {
            id
            guid
            name
            type
            jsondata
          }
        }`;

        const result = await gqlClient.query(query);
        expect(
          result.updateOrganization.jsondata.features.enableRBACFeature
        ).toEqual('enabled');
      }
    });

    it('user logs out and logs in again to refresh authInfo.organization', async () => {
      if (hasRBACAuthModule) {
        const logoutMutation = `mutation {
          userLogout(token: "${testUserToken}") 
        }`;

        let result = await gqlClient.query(logoutMutation);
        expect(result.userLogout).toEqual(true);

        const query = `mutation {
          userLogin(input: {
            userName: "${testUserName}"
            password: "${testUserPassword}"
            organizationGuid: "${orgGuid}"
          }) {
            token
            user {
              id
              name
            }
            organization {
              id
              guid
              jsondata
            }
          }
        }`;

        result = await gqlClient.query(query);
        expect(result.userLogin.organization).toBeDefined();
        expect(
          result.userLogin.organization.jsondata.features.enableRBACFeature
        ).toEqual('enabled');
        expect(
          result.userLogin.organization.jsondata.features.olpMigration
        ).toEqual(true);
        testUserToken = result.userLogin.token;
        testUserOption = requestOptions(testUserToken);
      }
    });

    it('update oganization - not update RBAC feature with flag olpMigration', async () => {
      if (hasRBACAuthModule) {
        const query = `mutation {
          updateOrganization(input: {
            id: "${orgId}"
            metadata: {
              features: {
                olpMigration: false
              }
            }
          }) {
            id
            guid
            name
            type
            jsondata
          }
        }`;

        const result = await gqlClient.query(query);
        expect(
          result.updateOrganization.jsondata.features.enableRBACFeature
        ).toEqual('enabled');
        expect(
          result.updateOrganization.jsondata.features.olpMigration
        ).toEqual(true);
      }
    });

    it('user can use any RBAC queries or mutations', async () => {
      if (hasRBACAuthModule) {
        const query = `mutation {
          authPermissionSetCreate(input: {
            name: "${citestMarker}-test-permission-set-${uuid.v4()}",
            description: "desc"
            permissions: [AIWARE_SOURCES_READ, RECORDING_READ]
          }){
            id
            name
            description
            permissions
            createdAt
            modifiedAt
          }
        }`;

        const result = await gqlClient._execQuery(
          gqlClient.getUrl(),
          query,
          undefined,
          testUserOption
        );

        expect(result.authPermissionSetCreate.id).toBeDefined();
        ['RECORDING_READ', 'AIWARE_SOURCES_READ'].forEach((item) => {
          expect(result.authPermissionSetCreate.permissions).toContain(item);
        });

        authPermissionId = result.authPermissionSetCreate.id;
      }
    });

    xit('should throw not implemented error when a non-admin user uses any query or mutation with @scope directive', async () => {
      if (hasRBACAuthModule) {
        const query = `query {
            organizations(id: "${orgId}") {
              records {
                id
                guid
                name
              }
            }
          }`;

        await expect(async () =>
          gqlClient._execQuery(
            gqlClient.getUrl(),
            query,
            undefined,
            testUserOption
          )
        ).rejects.toThrow(/not_implemented/);
      }
    });

    xit('should throw not implemented error when a non-admin user call the API in core-admin-server with middleware.hasAccessTo', async () => {
      if (testUserId && testUserToken) {
        await coreAdminClient.connect(testUserToken);
        const url = coreAdminClient.url + '/admin/users/' + testUserId;

        await supertest(url)
          .get('')
          .set(coreAdminClient.userAuth.headers)
          .expect(501);
      }
    });

    it('delete authPermission', async () => {
      if (hasRBACAuthModule && authPermissionId) {
        const query = `mutation del {
          authPermissionSetDelete (id: "${authPermissionId}") {
            id
            message
          }
        }`;

        const deleteData = await gqlClient.query(query, {}, testUserOption);
        expect(deleteData.authPermissionSetDelete.id).toEqual(authPermissionId);
      }
    });

    it('delete user', async () => {
      if (hasRBACAuthModule) {
        const query = `mutation {
          deleteUser(id: "${testUserId}")  {
            id
          }
        }`;
        const result = await gqlClient.query(query);
        expect(result.deleteUser.id).toEqual(testUserId);
      }
    });

    it('update oganization - disable RBAC feature', async () => {
      if (hasRBACAuthModule) {
        const query = `mutation {
          updateOrganization(input: {
            id: "${orgId}"
            metadata: {
              features: {
                enableRBACFeature: "disabled"
              }
            }
          }) {
            id
            guid
            name
            type
            jsondata
          }
        }`;

        const result = await gqlClient.query(query);
        expect(
          result.updateOrganization.jsondata.features.enableRBACFeature
        ).toEqual('disabled');
      }
    });
  });
});
