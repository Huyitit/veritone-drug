/* global pending */
const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const moment = require('moment');

const citestMarker = global.citestMarker || 'citest-should-delete';
const newOrgName = `${citestMarker}-rbac_tdo-sideEffect-org-${uuid.v4()}`;
const newAdminUserName = `${citestMarker}-rbac-admin-user-${uuid.v4()}@localhost`;
const CI_TEST_ROLE = 'ddf6f444-eaf0-4ee3-bded-98776e5fee0f';
const CMS_Editor = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';
const ADMIN_ROLE = '032218c3-d47e-4287-9d16-7bb867c01266';
const ADMIN_ROLE_LEGACY = 'ddca9b68-d775-4934-8ffd-7aecc779b652';
const newCIUserName = `${citestMarker}-rbac-user-${uuid.v4()}@localhost`;
const testUserPassword = 'testUserPassword';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

// use admin roleID base on setting
let enableDefaultDesktopApp;
let adminRole = ADMIN_ROLE_LEGACY;

describe('authGroup', () => {
  let orgGuid, orgId, userId, token;
  let authGroupId, psetTDOCreate, psetTDORW;
  let newOrgId, newOrgGuid;
  let createdTDOId;
  let useRBACFeature = false;
  let gqlClient;
  let clearAuthGroups = [];
  let clearPermissionSets = [];
  let members = [];
  let adminOptions, userOptions, testAdminOption;
  let testOrgGuid, testOrgId;
  let testUserId, testAdminId;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    token = result.token;
    adminOptions = helpers.requestOptions(token);

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    const hasRBACAuthModule = _.has(introspectionQuery, '__type.name');

    // check enableDefaultDesktopApp;
    const appConfig = await gqlClient.query(`
      query {
        graphqlServiceInfo {
          featureFlags
        }
      }`);

    enableDefaultDesktopApp = _.get(
      appConfig,
      'graphqlServiceInfo.featureFlags.enableDefaultDesktopApp',
      false
    );

    if (enableDefaultDesktopApp) adminRole = ADMIN_ROLE;

    console.log(
      '>> feature flag enableDefaultDesktopApp =',
      enableDefaultDesktopApp
    );
    console.log('>> using admin roleID ', adminRole);

    // create organization with enableRBACFeature
    const testOrg = await setupTestOrganization(gqlClient);
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(newOrgName);
    expect(testOrg.users).toBeDefined();
    expect(testOrg.guid).toBeDefined();
    expect(testOrg.id).toBeDefined();
    testOrgGuid = testOrg.guid;
    testOrgId = testOrg.id;

    // login with new test Admin
    const queryLoginNewAdmin = `mutation {
      userLogin(input: {
        userName: "${newAdminUserName}"
        password: "${testUserPassword}"
        organizationGuid: "${testOrgGuid}"
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
    const newTestAdmin = await gqlClient.query(queryLoginNewAdmin);
    expect(newTestAdmin.userLogin.organization).toBeDefined();
    expect(
      newTestAdmin.userLogin.organization.jsondata.features.enableRBACFeature
    ).toEqual('enabled');

    const testAdminToken = newTestAdmin.userLogin.token;
    testAdminId = newTestAdmin.userLogin.user.id;
    testAdminOption = helpers.requestOptions(testAdminToken);

    // login with new user
    const queryLoginNewUser = `mutation {
      userLogin(input: {
        userName: "${newCIUserName}"
        password: "${testUserPassword}"
        organizationGuid: "${testOrgGuid}"
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
    const newUser = await gqlClient.query(queryLoginNewUser);
    expect(newUser.userLogin.organization).toBeDefined();
    expect(
      newUser.userLogin.organization.jsondata.features.enableRBACFeature
    ).toEqual('enabled');

    const testUserToken = newUser.userLogin.token;
    testUserId = newUser.userLogin.user.id;
    userOptions = helpers.requestOptions(testUserToken);

    const isOrgRbacEnabled = async () => {
      const result = await gqlClient.query(
        `
        query {
          me {
            id
            name
            organization {
              name
              id
              guid
              jsondata
            }
          }
      }`,
        {},
        userOptions
      );

      expect(result.me).toBeDefined();
      orgGuid = _.get(result, 'me.organization.guid');
      orgId = _.get(result, 'me.organization.id');
      userId = _.get(result, 'me.id');

      return (
        _.get(result, 'me.organization.jsondata.features.enableRBACFeature') ===
        'enabled'
      );
    };
    let olpOrgEnabled = await isOrgRbacEnabled();
    expect(olpOrgEnabled).toEqual(true);

    useRBACFeature = hasRBACAuthModule && olpOrgEnabled;
  });

  describe('auth groups', () => {
    it('should create an auth group: authGroupCreate', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const gql = `
        mutation {
          authGroupCreate(input: {
            name: "${citestMarker}-auth-group-${uuid.v4()}"
            description: "desc citest"
            # ownerOrganization: "${testOrgGuid}"
          }) {
            id
            name
    				description
    				isProtected
    				referencedACEs {
              id
              objectType
              objectID
              isProtected
            }
          }
        }
      `;

      const result = await gqlClient.query(gql, {}, testAdminOption);
      expect(result.authGroupCreate.id).toBeDefined();
      clearAuthGroups.push(_.get(result, 'authGroupCreate'));
      authGroupId = _.get(result, 'authGroupCreate.id');
    });

    it('should create two default auth groups: authEnforcementEnable', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const gql = `
        mutation {
          authEnforcementEnable(input: {
            ownerOrganization: "${testOrgGuid}"
            enable: true
          }) {
            id
            name
            description
    				isProtected
            referencedACEs {
              id
              objectType
              objectID
              isProtected
            }
            referencedFolders {
              records {
                id
                name
              }
            }
          }
        }
      `;

      const result = await gqlClient.query(gql, {}, testAdminOption);
      const resAuthGroups = _.get(result, 'authEnforcementEnable');
      // TODO: add folder check after referencedFolders is completed

      // authGroup for Administrators and Users
      expect(resAuthGroups.length).toEqual(2);
      expect(resAuthGroups[0].id).toBeDefined();
      clearAuthGroups.push(...resAuthGroups);
    });

    it('should get auth groups - caching by filter', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const gql = `
        query {
          authGroups(
            ownerOrganization: "${testOrgGuid}",
            ids:["${authGroupId}"]
          ) {
            records {
              id
            }
          }
        }
      `;

      const result = await gqlClient.query(gql, {}, testAdminOption);
      const resAuthGroups = _.get(result, 'authGroups.records');
      expect(resAuthGroups).toEqual(
        expect.arrayContaining([{ id: authGroupId }])
      );
    });
  });

  describe('permission sets', () => {
    it('should get permission sets: authPermissionSets', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const gql = `
        query permission {
          authPermissionSets(
            ownerOrganization: "${testOrgGuid}"
          ) {
            records {
              id
              name
              description
              isProtected
            }
          }
        }
      `;

      const result = await gqlClient.query(gql, {}, testAdminOption);

      const permissionSets = _.get(result, 'authPermissionSets.records');
      expect(permissionSets[0].id).toBeDefined();
      clearPermissionSets.push(...permissionSets);
    });
  });

  afterAll(async () => {
    if (clearPermissionSets.length) {
      for (var permissionSet of clearPermissionSets.filter(
        (e) => !e.isProtected
      )) {
        const clearPermissionGQL = `
          mutation clearPermission {
            authPermissionSetDelete (
              id: "${permissionSet.id}"
            ) {
              id
              message
            }
          }
        `;

        await gqlClient.query(clearPermissionGQL, {}, testAdminOption);
      }
    }

    if (clearAuthGroups.length) {
      for (var authGroup of clearAuthGroups.filter((e) => !e.isProtected)) {
        const clearAuthGroupGQL = `
          mutation clearAuthGroup {
            authGroupDelete(
              id: "${authGroup.id}"
            ) {
              id
              message
            }
          }
        `;
        await gqlClient.query(clearAuthGroupGQL, {}, testAdminOption);
      }
    }

    if (testUserId) {
      const query = `mutation del {
          deleteUser (id: "${testUserId}") {
            id
            message
          }
        }`;

      const result = await gqlClient.query(query, {}, testAdminOption);

      expect(result.deleteUser).toBeDefined();
      expect(result.deleteUser.id).toEqual(testUserId);
    }

    if (testAdminId) {
      const query = `mutation del {
          deleteUser (id: "${testAdminId}") {
            id
            message
          }
        }`;

      const result = await gqlClient.query(query, {}, adminOptions);

      expect(result.deleteUser).toBeDefined();
      expect(result.deleteUser.id).toEqual(testAdminId);
    }

    if (testOrgId) {
      const queryDeleteOrg = `mutation updateOrg {
          updateOrganization (input: {
            id: "${testOrgId}"
            status: "deleted"
          }){
            id
            status
          }
        }`;

      const deleteOrg = await gqlClient.query(queryDeleteOrg);
      expect(deleteOrg.updateOrganization.id).toEqual(testOrgId);
    }
  }); // clean up processes
});

const getOrgGQL = `
query getOrganization($orgName: String) {
  organizations(
    name: $orgName
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

async function setupTestOrganization(client) {
  // set up organization and users
  const orgName = newOrgName;
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
        enableRBACFeature: 'enabled'
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
  const org = await client.query(createOrgGql, variables);
  const newOrgGuid = _.get(org, 'createOrganization.guid');
  const newOrgId = _.get(org, 'createOrganization.id');

  // newFilePicker flag should be enabled in the new organization
  const useNewFilePickerFeature = _.get(
    org,
    'createOrganization.jsondata.features.newFilePicker'
  );
  expect(useNewFilePickerFeature).toEqual('enabled');

  // create ci test user
  // "ddca9b68-d775-4934-8ffd-7aecc779b652",
  const createCITestUser = `mutation {
    createUser(input: {
      name: "${newCIUserName}"
      password: "${testUserPassword}"
      organizationId: "${newOrgId}"
      roleIds: [
        "${CI_TEST_ROLE}",
      ]
      firstName: "First"
      lastName: "Last"
      jsondata: {
        firstName: "RBAC-User"
        lastName: "Admin"
      }
    })  {
      id
      name
      firstName
      lastName
      jsondata
    }
  }`;

  const regularUser = await client.query(createCITestUser, {});
  expect(regularUser.createUser.id).toBeDefined();
  expect(regularUser.createUser.name).toBeDefined();

  const createAdminUser = `
    mutation createUser {
      createUser(
        input: {
          name: "${newAdminUserName}"
          password: "${testUserPassword}"
          organizationId: "${newOrgId}"
          roleIds: [
            "${ADMIN_ROLE}",
            "${CMS_Editor}",
          ]
          firstName: "RBAC-User"
          lastName: "Regular"
          jsondata: {
            firstName: "RBAC-User"
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
  const newAdmin = await client.query(createAdminUser);

  expect(newAdmin.createUser.id).toBeDefined();
  expect(newAdmin.createUser.name).toBeDefined();

  const result = await client.query(getOrgGQL, { orgName: orgName });

  const testOrg = _.get(result, 'organizations.records[0]');
  return testOrg;
}
