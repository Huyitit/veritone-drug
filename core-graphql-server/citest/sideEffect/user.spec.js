const helpers = require('../helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');
const uuid = require('uuid');
const _ = require('lodash');
const config = helpers.config;
const CMS_EDITOR = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';
const DEVELOPER_EDITOR = '912e377e-f4a4-4184-8db1-baa9670d8081';
const CI_TEST_ROLE = 'ddf6f444-eaf0-4ee3-bded-98776e5fee0f';
const ADMIN_ROLE = 'ddca9b68-d775-4934-8ffd-7aecc779b652';
const DESKTOP_ADMIN_ROLE = '032218c3-d47e-4287-9d16-7bb867c01266';
const PRIVATE_CS_ROLE = '6d982ee9-ff07-499f-a182-03457a6187f6';
const CMS_APP_ID = '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5';
const ADMIN_APP_ID = 'ea1d26ab-0d29-4e97-8ae7-d998a243374e';
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

describe('user tests', () => {
  let gqlClient;
  let adminOrgId;
  let adminOrgGuid;
  let secondOrgId;
  let secondOrgGuid;
  let useRBACFeature;
  let hasRBACAuthModule;
  let enableDefaultDesktopApp;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();

    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    // check feature flag
    const appConfig = await gqlClient.query(
      `query {graphqlServiceInfo { featureFlags }}`
    );

    enableDefaultDesktopApp = _.get(
      appConfig,
      'graphqlServiceInfo.featureFlags.enableDefaultDesktopApp',
      false
    );

    console.log(
      '>> feature flag enableDefaultDesktopApp =',
      enableDefaultDesktopApp
    );

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

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    hasRBACAuthModule = _.has(introspectionQuery, '__type.name');

    expect(result.me).toBeDefined();
    expect(result.me.organization).toBeDefined();
    expect(result.me.organization.id).toBeDefined();
    expect(result.me.organization.guid).toBeDefined();
    expect(result.me.id).toBeDefined();
    expect(result.me.name).toBeDefined();

    const torg = result.me.organization.id;
    adminOrgId = torg.toString();
    adminOrgGuid =
      result.me.organization.guid ||
      result.me.organization.internalApplicationId;
  });

  afterAll(async () => {
    // delete Orgs second
    if (secondOrgId) {
      const query = `mutation updateOrg {
        updateOrganization (input: {
          id: "${secondOrgId}"
          status: "deleted"
        }){
          id
          status
        }
      }`;

      const result = await gqlClient.query(query);
      const updatedStatus = _.get(result, 'updateOrganization.status', '');
      expect(updatedStatus).toEqual('deleted');
    }
  });

  it('create the second organization', async () => {
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
        test: 'value',
        features: {
          enableRBACFeature: 'enabled'
        }
      },
      apps: [
        {
          applicationId: CMS_APP_ID,
          applicationKey: 'cms'
        },
        isDesktopAppEnabled
          ? null
          : {
              applicationId: ADMIN_APP_ID,
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
    const createdSecondOrgResult = await gqlClient.query(query, variables);
    const applicationIds = _.get(
      createdSecondOrgResult,
      'createOrganization.jsondata.applicationIds',
      []
    );

    expect(createdSecondOrgResult.createOrganization.type).toEqual(
      expect.arrayContaining(['Agency', 'Broadcaster'])
    );
    expect(createdSecondOrgResult.createOrganization.jsondata).toHaveProperty(
      'test',
      'value'
    );
    expect(applicationIds).toContain(CMS_APP_ID);
    expect(createdSecondOrgResult.createOrganization.id).toBeDefined();
    expect(createdSecondOrgResult.createOrganization.guid).toBeDefined();

    secondOrgId = createdSecondOrgResult.createOrganization.id;
    secondOrgGuid = createdSecondOrgResult.createOrganization.guid;
    useRBACFeature =
      hasRBACAuthModule &&
      _.get(
        createdSecondOrgResult,
        'createOrganization.jsondata.features.enableRBACFeature'
      ) === 'enabled';
  });

  describe('A user belongs to the organization of superadmin', () => {
    let testUserId, privateUserId;
    let testUserName;
    let testUserPassword;
    let testUserToken;

    it('create user', async () => {
      testUserPassword = Date.now();
      const query = `mutation {
        createUser(input: {
          name: "${citestMarker}-test_user_1_${uuid.v4()}@localhost"
          password: "${testUserPassword}"
          organizationId: "${adminOrgId}"
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
    });

    it('add user to the second organization', async () => {
      const query = `mutation {
            addUserToOrganization(userName: "${testUserName}",
            organizationGuid: "${secondOrgGuid}"
            roleIds: ["${CI_TEST_ROLE}"]
            ){
              id,
              organizationGuids
            }
          }`;
      const result = await gqlClient.query(query);
      expect(result.addUserToOrganization.organizationGuids).toBeDefined();
      expect(result.addUserToOrganization.organizationGuids.length).toEqual(2);
    });

    it('test user login successfully', async () => {
      const query = `mutation {
            userLogin(input: {
              userName: "${testUserName}"
              password: "${testUserPassword}"
              organizationGuid: "${adminOrgGuid}"
            }) {
              token
              user {
                id
                name
              }
              organization {
                id
                guid
              }
            }
          }`;
      const result = await gqlClient.query(query);
      expect(result.userLogin.token).toBeDefined();
      expect(result.userLogin.organization).toBeDefined();
      expect(result.userLogin.organization.id).toBeDefined();
      expect(result.userLogin.organization.guid).toBeDefined();
      expect(result.userLogin.user.id).toBeDefined();
      expect(result.userLogin.user.name).toBeDefined();

      testUserToken = result.userLogin.token;
    });

    it('update user in specific organization', async () => {
      const query = `fragment userFields on User {
            id
            name
            organizationId
          }
    
          mutation updateUser{
            updateUser(input: {
              id: "${testUserId}",
              name: "${testUserName}",
              organizationId: "${secondOrgId}",
              roleIds: ["${CMS_EDITOR}"]
              }) {
              ...userFields
            }
          }`;

      const result = await gqlClient.query(query);
      expect(result.updateUser.organizationId).toEqual(secondOrgId);

      const queryUser = `query {
        user(id: "${testUserId}", organizationIds: ["${secondOrgId}"]) {
          id
          email
          organizationGuid 
          organizationGuids
          roles {
            id
          }
        }
      }
      `;
      const result1 = await gqlClient.query(queryUser);
      const rolesId = result1.user.roles.map((role) => role.id);
      expect(rolesId[0]).toEqual(CMS_EDITOR);
      expect(result1.user.organizationGuid).toEqual(secondOrgGuid);
    });

    it('create a user with a private role and retrieve the user', async () => {
      const testUserPassword = Date.now();
      const createUserQuery = `mutation {
          createUser(input: {
            name: "${citestMarker}-test_user_${uuid.v4()}@localhost"
            password: "${testUserPassword}"
            organizationId: "${adminOrgId}"
            roleIds: ["${PRIVATE_CS_ROLE}"]
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
      privateUserId = result.createUser.id;

      const retrieveUsersQuery = `{
          users(id:"${privateUserId}"
          ) {
            records {
              id
              name
              roles {
                id
                name
              }
            }
          }
        }`;
      const resultFromUsers = await gqlClient.query(retrieveUsersQuery);
      expect(resultFromUsers.users.records).toBeDefined();
      const user = resultFromUsers.users.records[0];
      expect(user.id).toBeDefined();
      expect(user.name).toBeDefined();
      expect(
        user.roles.find((role) => role.id === PRIVATE_CS_ROLE)
      ).toBeDefined();
    });

    it('delete private user', async () => {
      const query = `mutation {
          deleteUser(id: "${privateUserId}")  {
            id
          }
        }`;
      const result = await gqlClient.query(query);
      expect(result.deleteUser.id).toEqual(privateUserId);
    });

    it('update user in default organization (do not specify organizationId)', async () => {
      const query = `fragment userFields on User {
            id
            name
            organizationId
            roles {
              id
              name
              appName
            }
          }
    
          mutation updateUser{
            updateUser(input: {
              id: "${testUserId}",
              name: "${testUserName}",
              roleIds: ["${DEVELOPER_EDITOR}"]
              }) {
              ...userFields
            }
          }`;

      const result = await gqlClient.query(query);
      const rolesId = result.updateUser.roles.map((role) => role.id);
      expect(result.updateUser.organizationId).toEqual(adminOrgId);
      expect(rolesId[0]).toEqual(DEVELOPER_EDITOR);
    });

    it('switch test user login to new organization successfully', async () => {
      const query = `mutation {
        switchUserToOrganization(token: "${testUserToken}"
          userName: "${testUserName}"
          organizationGuid: "${secondOrgGuid}") {
            token,
            organization {
              id,
              guid
            }
          }
        }`;

      const userOption = helpers.requestOptions(testUserToken);
      const result = await gqlClient.query(query, {}, userOption);
      expect(result.switchUserToOrganization.token).toBeDefined();
      expect(result.switchUserToOrganization.organization.guid).toEqual(
        secondOrgGuid
      );
    });

    it('remove user from organization', async () => {
      const query = `mutation {
        removeUserFromOrganization(userName: "${testUserName}",
          organizationGuid: "${secondOrgGuid}") {
            id,
            organizationGuids
          }
        }`;
      const result = await gqlClient.query(query);
      expect(
        result.removeUserFromOrganization.organizationGuids.length
      ).toEqual(1);
    });

    it('not be able to remove user from last organization', async () => {
      const query = `mutation {
        removeUserFromOrganization(userName: "${testUserName}",
          organizationGuid: "${adminOrgGuid}") {
            id,
            organizationGuids
          }
        }`;
      await expect(async () => gqlClient.query(query)).rejects.toThrow(
        'can not be removed from'
      );
    });

    it('delete user', async () => {
      const query = `mutation {
          deleteUser(id: "${testUserId}")  {
            id
          }
        }`;
      const result = await gqlClient.query(query);
      expect(result.deleteUser.id).toEqual(testUserId);
    });
  });

  describe('A user does not belong to the organization of superadmin', () => {
    let testUserId;
    let testUserName;
    let testUserPassword;

    it('create user in the second organization', async () => {
      testUserPassword = Date.now();
      const query = `mutation {
        createUser(input: {
          name: "${citestMarker}-test_user_${uuid.v4()}@localhost"
          password: "${testUserPassword}"
          organizationId: "${secondOrgId}"
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
    });

    it('update user (superadmin does not specify organizationId)', async () => {
      const query = `fragment userFields on User {
            id
            name
            organizationId
            roles {
              id
              name
              appName
            }
          }
    
          mutation updateUser{
            updateUser(input: {
              id: "${testUserId}",
              name: "${testUserName}",
              roleIds: ["${DEVELOPER_EDITOR}"]
              }) {
              ...userFields
            }
          }`;

      const result = await gqlClient.query(query);
      const rolesId = result.updateUser.roles.map((role) => role.id);
      expect(result.updateUser.organizationId).toEqual(secondOrgId);
      expect(rolesId[0]).toEqual(DEVELOPER_EDITOR);
    });

    it('delete user', async () => {
      const query = `mutation {
          deleteUser(id: "${testUserId}")  {
            id
          }
        }`;
      const result = await gqlClient.query(query);
      expect(result.deleteUser.id).toEqual(testUserId);
    });
  });

  describe('Add auth groups to the user', () => {
    let testUserId;
    let testUserName;
    let testUserPassword;
    let authgroup1;
    let authgroup2;
    let authgroup3;
    let testUserToken;

    it('create auth groups', async () => {
      if (useRBACFeature) {
        const query = `
          mutation {
            authgroup1: authGroupCreate(input: {
              name: "${citestMarker}-auth-group-${uuid.v4()}"
              description: "desc 1"
              ownerOrganization: "${secondOrgGuid}"
            }) {
              id
            },
            authgroup2: authGroupCreate(input: {
              name: "${citestMarker}-auth-group-${uuid.v4()}"
              description: "desc 2"
              ownerOrganization: "${secondOrgGuid}"
            }) {
              id
            },
            authgroup3: authGroupCreate(input: {
              name: "${citestMarker}-auth-group-${uuid.v4()}"
              description: "desc 3"
              ownerOrganization: "${secondOrgGuid}"
            }) {
              id
            }
          }
        `;

        const result = await gqlClient.query(query);
        authgroup1 = _.get(result, 'authgroup1.id');
        authgroup2 = _.get(result, 'authgroup2.id');
        authgroup3 = _.get(result, 'authgroup3.id');

        expect(authgroup1).toBeDefined();
        expect(authgroup2).toBeDefined();
        expect(authgroup3).toBeDefined();
      }
    });

    it('create user in the second organization', async () => {
      if (useRBACFeature) {
        testUserPassword = Date.now();
        const query = `mutation {
          createUser(input: {
            name: "${citestMarker}-test_user_${uuid.v4()}@localhost"
            password: "${testUserPassword}"
            organizationId: "${secondOrgId}"
            roleIds: ["${CI_TEST_ROLE}"]
            authGroupIds: ["${authgroup1}","${authgroup2}"]
            firstName: "First"
            lastName: "Last"
            jsondata: {
              foo: "bar"
            }
          })  {
            id
            name
            authGroups {
              records {
                id
                name
              }
            }
          }
        }`;

        const result = await gqlClient.query(query);
        expect(result.createUser.id).toBeDefined();
        expect(result.createUser.name).toBeDefined();
        expect(
          result.createUser.authGroups.records.length
        ).toBeGreaterThanOrEqual(2);
        testUserId = result.createUser.id;
        testUserName = result.createUser.name;
      }
    });

    it('update user', async () => {
      if (useRBACFeature) {
        const query = `
        mutation {
          updateUser(input: {
            id: "${testUserId}",
            name: "${testUserName}",
            organizationId: "${secondOrgId}",
            authGroupIds: ["${authgroup3}"]
            }) {
              id
              name
              organizationId
              authGroups {
                records {
                  id
                  name
                }
              }
          }
        }`;

        const result = await gqlClient.query(query);
        expect(result.updateUser.organizationId).toEqual(secondOrgId);
        expect(
          result.updateUser.authGroups.records.length
        ).toBeGreaterThanOrEqual(3);
      }
    });

    it('test user login successfully to org second for token', async () => {
      const query = `mutation {
            userLogin(input: {
              userName: "${testUserName}"
              password: "${testUserPassword}"
              organizationGuid: "${secondOrgGuid}"
            }) {
              token
              user {
                id
                name
              }
              organization {
                id
                guid
              }
            }
          }`;
      const result = await gqlClient.query(query);
      expect(result.userLogin.token).toBeDefined();
      expect(result.userLogin.organization).toBeDefined();
      expect(result.userLogin.organization.id).toBeDefined();
      expect(result.userLogin.organization.guid).toBeDefined();
      expect(result.userLogin.user.id).toBeDefined();
      expect(result.userLogin.user.name).toBeDefined();

      testUserToken = result.userLogin.token;
    });

    it('delete auth groups', async () => {
      if (authgroup1 || authgroup2 || authgroup3) {
        const query = `mutation delAuth {
          authGroupDelete1: authGroupDelete(id: "${authgroup1}"){
            id
            message
          }

          authGroupDelete2: authGroupDelete(id: "${authgroup2}"){
            id
            message
          }

          authGroupDelete3: authGroupDelete(id: "${authgroup3}"){
            id
            message
          }
        }`;
        const userOption = helpers.requestOptions(testUserToken);
        const result = await gqlClient.query(query, {}, userOption);

        expect(result.authGroupDelete1.id).toEqual(authgroup1);
        expect(result.authGroupDelete2.id).toEqual(authgroup2);
        expect(result.authGroupDelete3.id).toEqual(authgroup3);
      }
    });

    it('delete user', async () => {
      if (testUserId) {
        const query = `mutation {
          deleteUser(id: "${testUserId}")  {
            id
          }
        }`;
        const result = await gqlClient.query(query);
        expect(result.deleteUser.id).toEqual(testUserId);
      }
    });
  });

  describe('Automatically add users to default groups', () => {
    let orgId, guid;
    let testUserId, testAdminUserId, testDesktopUserId;

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
          test: 'value',
          features: {
            enableRBACFeature: 'enabled'
          }
        },
        apps: [
          isDesktopAppEnabled
            ? null
            : {
                applicationId: ADMIN_APP_ID,
                applicationKey: 'admin'
              },
          {
            applicationId: CMS_APP_ID,
            applicationKey: 'cms'
          }
        ].filter((app) => app)
      };
      const createdSecondOrgResult = await gqlClient.query(query, variables);
      expect(createdSecondOrgResult.createOrganization.type).toEqual(
        expect.arrayContaining(['Agency', 'Broadcaster'])
      );
      expect(createdSecondOrgResult.createOrganization.jsondata).toHaveProperty(
        'test',
        'value'
      );
      expect(createdSecondOrgResult.createOrganization.id).toBeDefined();
      expect(createdSecondOrgResult.createOrganization.guid).toBeDefined();

      orgId = createdSecondOrgResult.createOrganization.id;
      guid = createdSecondOrgResult.createOrganization.guid;
    });

    it('two default groups have not been created yet', async () => {
      const query = `query {
        authGroups(nameRegex: "orgAdmin|orgAllAccess", ownerOrganization: "${guid}") {
          records {
            id
            name
          }
        }
      }`;
      const result = await gqlClient.query(query);
      expect(result.authGroups.records.length).toEqual(0);
    });

    it('create a non-admin user and add them to the default organization group', async () => {
      const testUserPassword = Date.now();
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
            authGroups {
              records {
                id
                name
              }
            }
          }
        }`;

      const result = await gqlClient.query(query);
      const authGroupNames = _.map(
        _.get(result.createUser, 'authGroups.records', []),
        'name'
      );
      expect(result.createUser.id).toBeDefined();
      expect(result.createUser.name).toBeDefined();
      const authGroupName = authGroupNames.find((name) =>
        name.includes('Users')
      );
      expect(authGroupName).toBeDefined();
      testUserId = result.createUser.id;
    });

    // if enableDefaultDesktopApp = false then ADMIN_ROLE 'ddca9b68-d775-4934-8ffd-7aecc779b652' is treat as admin;
    // else DESKTOP_ADMIN_ROLE '032218c3-d47e-4287-9d16-7bb867c01266' is treat as admin;
    it(`create an admin user, and add them to the default admin group`, async () => {
      const testUserPassword = Date.now();
      const query = `mutation {
          createUser(input: {
            name: "${citestMarker}-test_user_${uuid.v4()}@localhost"
            password: "${testUserPassword}"
            organizationId: "${orgId}"
            roleIds: ["${CMS_EDITOR}", "${ADMIN_ROLE}"]
            firstName: "First"
            lastName: "Last"
            jsondata: {
              foo: "bar"
            }
          })  {
            id
            name
            authGroups {
              records {
                id
                name
              }
            }
          }
        }`;

      const result = await gqlClient.query(query);
      const authGroupNames = _.map(
        _.get(result.createUser, 'authGroups.records', []),
        'name'
      );
      expect(result.createUser.id).toBeDefined();
      expect(result.createUser.name).toBeDefined();
      const authGroupName = authGroupNames.find((name) =>
        name.includes('Administrators')
      );

      if (enableDefaultDesktopApp) {
        expect(authGroupName).toBeUndefined();
      } else {
        expect(authGroupName).toBeDefined();
      }
      testAdminUserId = result.createUser.id;
    });

    // if enableDefaultDesktopApp = false then ADMIN_ROLE 'ddca9b68-d775-4934-8ffd-7aecc779b652' is treat as admin;
    // else DESKTOP_ADMIN_ROLE '032218c3-d47e-4287-9d16-7bb867c01266' is treat as admin;
    it(`create a desktop admin user, and add them to the default admin group`, async () => {
      const testUserPassword = Date.now();
      const query = `mutation {
          createUser(input: {
            name: "${citestMarker}-test_user_${uuid.v4()}@localhost"
            password: "${testUserPassword}"
            organizationId: "${orgId}"
            roleIds: ["${CMS_EDITOR}", "${DESKTOP_ADMIN_ROLE}"]
            firstName: "First"
            lastName: "Last"
            jsondata: {
              foo: "bar"
            }
          })  {
            id
            name
            authGroups {
              records {
                id
                name
              }
            }
          }
        }`;

      const result = await gqlClient.query(query);
      const authGroupNames = _.map(
        _.get(result.createUser, 'authGroups.records', []),
        'name'
      );
      expect(result.createUser.id).toBeDefined();
      expect(result.createUser.name).toBeDefined();
      const authGroupName = authGroupNames.find((name) =>
        name.includes('Administrators')
      );

      if (enableDefaultDesktopApp) {
        expect(authGroupName).toBeDefined();
      } else {
        expect(authGroupName).toBeUndefined();
      }

      testDesktopUserId = result.createUser.id;
    });

    it('delete users', async () => {
      if (testUserId) {
        const query = `mutation {
          deleteUser: deleteUser(id: "${testUserId}")  {
            id
          },
          deleteAdminUserId: deleteUser(id: "${testAdminUserId}")  {
            id
          },
          deleteDesktopUserId: deleteUser(id: "${testDesktopUserId}")  {
            id
          },
        }`;
        const result = await gqlClient.query(query);
        expect(result.deleteUser.id).toEqual(testUserId);
        expect(result.deleteAdminUserId.id).toEqual(testAdminUserId);
      }
    });

    it('delete organization', async () => {
      const query = `mutation updateOrg {
        updateOrganization (input: {
          id: "${orgId}"
          status: "deleted"
        }){
          id
          status
        }
      }`;

      const result = await gqlClient.query(query);
      const updatedStatus = _.get(result, 'updateOrganization.status', '');
      expect(updatedStatus).toEqual('deleted');
    });
  });
});
