/* global pending */
const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const moment = require('moment');

const citestMarker = global.citestMarker || 'citest-should-delete';
const newOrgName = `${citestMarker}-citest-org-${uuid.v4()}`;
const newAdminUserName = `${citestMarker}-admin-user-${uuid.v4()}@localhost`;
const newAdminUserNameRemoveData = `${citestMarker}-admin-user-1-${uuid.v4()}@localhost`;
const newCIUserName = `${citestMarker}-user-${uuid.v4()}@localhost`;
const CI_TEST_ROLE = 'ddf6f444-eaf0-4ee3-bded-98776e5fee0f';
const CMS_Editor = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';
const ADMIN_ROLE = '032218c3-d47e-4287-9d16-7bb867c01266';
const testUserPassword = 'testUserPassword';
const perissionPrefix = 'permission-test-tdo';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

describe('TDO', () => {
  let orgGuid, orgId, orgName, userId, token, userName;
  let authGroupId, psetTDOCreate, psetTDORW;
  let createdTDOId;
  let useRBACFeature = false;
  let gqlClient;
  let testOrgGuid, testUserId, testUserToken;
  let adminOptions, userOptions, testAdminOption;
  let testAdminId, testAdminToken;
  let aceOrgRecords, aceTDORecords;
  // For some reason this hack doesn't seem to work
  const testIf = (condition, ...args) =>
    condition ? test(...args) : test.skip(...args);

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    token = result.token;
    adminOptions = helpers.requestOptions(token);

    const originInfo = await gqlClient.query(meGql);
    expect(originInfo).toBeDefined();
    expect(originInfo.me).toBeDefined();
    expect(originInfo.me.name).toBeDefined();
    expect(originInfo.me.organization).toBeDefined();
    expect(originInfo.me.organization.guid).toBeDefined();
    expect(originInfo.me.organization.name).toBeDefined();
    userName = originInfo.me.name;

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    const hasRBACAuthModule = _.has(introspectionQuery, '__type.name');

    // create organization with enableRBACFeature
    const testOrg = await setupTestOrganization(gqlClient);
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(newOrgName);
    expect(testOrg.users).toBeDefined();
    expect(testOrg.guid).toBeDefined();
    expect(testOrg.id).toBeDefined();
    testOrgGuid = testOrg.guid;

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

    testAdminToken = newTestAdmin.userLogin.token;
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

    testUserToken = newUser.userLogin.token;
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
      orgName = _.get(result, 'me.organization.name');
      userId = _.get(result, 'me.id');
      userName = _.get(result, 'me.name');

      return (
        _.get(result, 'me.organization.jsondata.features.enableRBACFeature') ===
        'enabled'
      );
    };
    let olpOrgEnabled = await isOrgRbacEnabled();
    expect(olpOrgEnabled).toEqual(true);

    useRBACFeature = hasRBACAuthModule && olpOrgEnabled;
  });

  describe('RBAC creation', () => {
    test('create auth group with a member', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const query = `
        mutation {
          authGroupCreate(input: {
            name: "${citestMarker}-auth-group-${uuid.v4()}"
            description: "desc"
            members: [{
              id: "${userId}",
              memberType: User
            }]
          }) {
            id
            name
          }
        }
      `;

      const result = await gqlClient.query(query, {}, testAdminOption);
      expect(result.authGroupCreate.id).toBeDefined();
      authGroupId = _.get(result, 'authGroupCreate.id');
    });

    test('create auth permission set having CREATE', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const query = `mutation {
          authPermissionSetCreate(input: {
            name: "${perissionPrefix}-${uuid.v4()}",
            description: "desc"
            permissions: [
              AIWARE_TDO_CREATE,
              # AIWARE_TDO_READ
            ]
          }){
            id
            permissions
          }
        }`;

      const result = await gqlClient.query(query, {}, testAdminOption);
      expect(result.authPermissionSetCreate.id).toBeDefined();
      expect(result.authPermissionSetCreate.permissions).toEqual(
        expect.arrayContaining([
          // 'AIWARE_TDO_READ',
          'AIWARE_TDO_CREATE'
        ])
      );

      psetTDOCreate = result.authPermissionSetCreate.id;
    });
  });

  describe('Create TDO', () => {
    // user can create tdo without ACE
    xit('createTDO without ACE assigned should fail', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const query = `mutation createTDO {
        createTDO(input: {
          startDateTime: "2022-08-18T00:00:00Z"
          stopDateTime: "2022-08-18T00:30:00Z"
          name: "${citestMarker}-rbac-tdo-citest"
        }) {
          id
        }
      }`;
      await expect(gqlClient.query(query, {}, userOptions)).rejects.toThrow(
        /No authorization access role found/
        // 'No authorization access role found for Mutation.createTDO'
      );
    });

    test('re-login to refresh authInfo.authGroups', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const logoutMutation = `mutation {
          userLogout(token: "${testUserToken}")
        }`;

      let result = await gqlClient.query(logoutMutation, {}, userOptions);
      expect(result.userLogout).toEqual(true);

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
      testUserToken = newUser.userLogin.token;
      userOptions = helpers.requestOptions(testUserToken);
    });

    it('createTDO should succeed', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const query = `mutation createTDO {
        createTDO(input: {
          startDateTime: "2022-08-18T00:00:00Z"
          stopDateTime: "2022-08-18T00:30:00Z"
          name: "${citestMarker}-rbac-tdo-citest"
        }) {
          id
        }
      }`;
      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.createTDO).toBeDefined();
      expect(result.createTDO.id).toBeDefined();
      createdTDOId = result.createTDO.id;
    });

    it('queryTDO should fail', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const query = `query { temporalDataObject(id: "${createdTDOId}") { id }}`;
      await expect(gqlClient.query(query, {}, userOptions)).rejects.toThrow(
        /No authorization access role found/
      );
    });

    it('queryTDOs should fail', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const query = `query { temporalDataObjects(id: "${createdTDOId}") { records { id name } }}`;
      await expect(gqlClient.query(query, {}, userOptions)).rejects.toThrow(
        /No authorization access role found/
      );
    });

    test('create auth permission set having UPDATE, READ, DELETE', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const query = `mutation {
          authPermissionSetCreate(input: {
            name: "${perissionPrefix}-${uuid.v4()}",
            description: "desc"
            permissions: [
              AIWARE_TDO_UPDATE,
              AIWARE_TDO_READ,
              AIWARE_TDO_DELETE
            ]
          }){
            id
            permissions
          }
        }`;

      const result = await gqlClient.query(query, {}, testAdminOption);
      expect(result.authPermissionSetCreate.id).toBeDefined();
      expect(result.authPermissionSetCreate.permissions).toEqual(
        expect.arrayContaining([
          'AIWARE_TDO_UPDATE',
          'AIWARE_TDO_READ',
          'AIWARE_TDO_DELETE'
        ])
      );

      psetTDORW = result.authPermissionSetCreate.id;
    });

    it('add tdo ACE', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const query = `mutation  {
          addACEsToResources(
            ids:["${createdTDOId}"], 
            resourceType: TDO
            entries: [{
              member: {id: "${authGroupId}", memberType: Group}, 
              permissionSetID: "${psetTDORW}"}
            ]) {
            records {
              id
              objectType
              permissionSet {
                id
                name
                description
              }
              objectType
            }
          }
        }`;

      const result = await gqlClient.query(query, {}, testAdminOption);
      expect(result.addACEsToResources.records.length).toBeGreaterThan(0);
      aceTDORecords = result.addACEsToResources.records;
    });

    test('re-login to refresh authInfo.authGroups', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const logoutMutation = `mutation {
          userLogout(token: "${testUserToken}")
        }`;

      let result = await gqlClient.query(logoutMutation, {}, userOptions);
      expect(result.userLogout).toEqual(true);
      // await gqlClient.connect();

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
      testUserToken = newUser.userLogin.token;
      userOptions = helpers.requestOptions(testUserToken);
    });

    test('queryTDO should succeed due to the new acl', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const query = `query { temporalDataObject(id: "${createdTDOId}") { id }}`;
      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.temporalDataObject).toBeDefined();
      expect(result.temporalDataObject.id).toEqual(createdTDOId);
    });
  });

  afterAll(async () => {
    if (psetTDOCreate) {
      const query = `mutation { authPermissionSetDelete(id: "${psetTDOCreate}") { id }}`;
      const result = await gqlClient.query(query, {}, testAdminOption);
      expect(result.authPermissionSetDelete.id).toEqual(psetTDOCreate);
    }

    if (psetTDORW) {
      // remove ACE from permission set before delete permission set
      const prodeleteOrgPer = await Promise.all(
        aceTDORecords.map((rec) => {
          const resourceType = rec.id.split('::')[0];
          const removeQuery = `mutation {
            removeACEsFromResource (
              resourceType: ${resourceType}
              ids: ["${rec.id}"]
            ) {
              records {
                id
              }
            }
          }`;
          return gqlClient.query(removeQuery, {}, testAdminOption);
        })
      );
      // delete permission set
      const query = `mutation { authPermissionSetDelete(id: "${psetTDORW}") { id }}`;
      const result = await gqlClient.query(query, {}, testAdminOption);
      expect(result.authPermissionSetDelete.id).toEqual(psetTDORW);
    }

    if (createdTDOId) {
      const query = `mutation { deleteTDO(id: "${createdTDOId}") { id }}`;
      const result = await gqlClient.query(query, {}, testAdminOption);
      expect(result.deleteTDO.id).toEqual(createdTDOId);
    }

    if (authGroupId) {
      const query = `mutation { authGroupDelete(id: "${authGroupId}") { id }}`;
      const result = await gqlClient.query(query, {}, testAdminOption);
      expect(result.authGroupDelete.id).toEqual(authGroupId);
    }

    if (testUserId) {
      const query = `mutation {
        deleteUser(id: "${testUserId}")  {
          id
        }
      }`;
      const result = await gqlClient.query(query, {}, testAdminOption);
      expect(result.deleteUser.id).toEqual(testUserId);
    }

    if (testAdminId) {
      const query = `mutation {
        deleteUser(id: "${testAdminId}")  {
          id
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOptions);
      expect(result.deleteUser.id).toEqual(testAdminId);
    }

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

      const result = await gqlClient.query(query, {}, adminOptions);
      const updatedStatus = _.get(result, 'updateOrganization.status', '');
      expect(updatedStatus).toEqual('deleted');
    }
  });
});

const meGql = `
query {
  me {
    id
    name
    organization {
      id
      name
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
