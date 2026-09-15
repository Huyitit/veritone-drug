const helpers = require('../helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');
const uuid = require('uuid');
const _ = require('lodash');
const config = helpers.config;

const citestMarker = global.citestMarker || 'citest-should-delete';
const newOrgName = `${citestMarker}-rbac_folder-sideEffect-citest-org-${uuid.v4()}`;
const newUserName = `${citestMarker}-rbac-citest-admin-user-${uuid.v4()}@localhost`;
const CMS_Editor = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';
const ADMIN_ROLE = '032218c3-d47e-4287-9d16-7bb867c01266';
const ADMIN_ROLE_LEGACY = 'ddca9b68-d775-4934-8ffd-7aecc779b652';
const testUserPassword = 'testUserPassword';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

// use admin roleID base on setting
let enableDefaultDesktopApp;
let adminRole = ADMIN_ROLE_LEGACY;

describe('auth permission set tests', () => {
  let gqlClient;
  let authPermissionSetId,
    protectedAuthPermissionSetId,
    authPermissionSetIdToUpdateProtect;
  let hasRBACAuthModule = false;
  let useRBACFeature;
  let testOrgId;
  let userOptions, adminOption;
  let userId, token;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();

    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    token = result.token;
    adminOption = helpers.requestOptions(token);

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    hasRBACAuthModule = _.has(introspectionQuery, '__type.name');

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
    testOrgId = testOrg.id;

    // login with new user
    const queryLoginNewUser = `mutation {
          userLogin(input: {
            userName: "${newUserName}"
            password: "${testUserPassword}"
            organizationGuid: "${testOrg.guid}"
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
    userOptions = helpers.requestOptions(testUserToken);

    result = await gqlClient.query(
      `
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
          }`,
      {},
      userOptions
    );

    expect(result.me).toBeDefined();
    useRBACFeature =
      hasRBACAuthModule &&
      _.get(result, 'me.organization.jsondata.features.enableRBACFeature') ===
        'enabled';
    userId = _.get(result, 'me.id');
  });

  afterAll(async () => {
    //delete user
    if (userId) {
      const query = `mutation {
        deleteUser(id: "${userId}")  {
          id
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOption);
      expect(result.deleteUser.id).toEqual(userId);
    }

    // delete org
    if (testOrgId) {
      const query = `mutation {
        updateOrganization(input:{
          id:"${testOrgId}",
          status: "deleted"
        }) {
          id
          name
          status
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOption);
      expect(result.updateOrganization.id).toEqual(testOrgId);
    }
  });

  it('create auth permission set', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const query = `mutation  {
        authPermissionSetCreate: authPermissionSetCreate(input: {
          name: "${citestMarker}-permission-test-${uuid.v4()}",
          description: "desc"
          permissions: [CMS_SOURCES_READ, RECORDING_READ, JOB_CREATE],
          organizationID: ${testOrgId}
        }){
          id
          name
          description
          permissions
        },
        authPermissionSetCreateSecond: authPermissionSetCreate(input: {
          name: "${citestMarker}-permission-test-${uuid.v4()}",
          description: "desc 2"
          permissions: [CMS_SOURCES_READ, RECORDING_READ],
          organizationID: ${testOrgId}
        }){
          id
          name
          description
          permissions
        }
      }`;

      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.authPermissionSetCreate.id).toBeDefined();
      expect(result.authPermissionSetCreate.permissions).toEqual(
        expect.arrayContaining([
          'AIWARE_JOB_CREATE',
          'RECORDING_READ',
          'CMS_RECORDING_READ',
          'RECORDING_READ',
          'AIWARE_SOURCES_READ'
        ])
      );
      expect(result.authPermissionSetCreateSecond.id).toBeDefined();
      expect(result.authPermissionSetCreateSecond.permissions).toEqual(
        expect.arrayContaining([
          'RECORDING_READ',
          'CMS_RECORDING_READ',
          'AIWARE_SOURCES_READ'
        ])
      );

      authPermissionSetId = result.authPermissionSetCreate.id;
      authPermissionSetIdToUpdateProtect =
        result.authPermissionSetCreateSecond.id;
    }
  });

  it('create protected auth permission set', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const query = `mutation  {
        authPermissionSetCreate(input: {
          name: "${citestMarker}-permission-test-${uuid.v4()}",
          description: "desc"
          permissions: [AIWARE_SOURCES_READ, RECORDING_READ, JOB_CREATE],
          organizationID: ${testOrgId},
          isProtected: true
        }){
          id
          name
          description
          permissions
          isProtected
        }
      }`;

      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.authPermissionSetCreate.id).toBeDefined();
      expect(result.authPermissionSetCreate.isProtected).toEqual(true);
      expect(result.authPermissionSetCreate.permissions).toEqual(
        expect.arrayContaining([
          'AIWARE_JOB_CREATE',
          'RECORDING_READ',
          'CMS_RECORDING_READ',
          'RECORDING_READ',
          'AIWARE_SOURCES_READ'
        ])
      );

      protectedAuthPermissionSetId = result.authPermissionSetCreate.id;
    }
  });

  it('query: auth permission set - not found', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const id = uuid.v4();
      const query = `query {
        authPermissionSet(id: "${id}"){
          id
          name
          description
          permissions
        }
      }`;

      expect(async () =>
        gqlClient.query(query, {}, userOptions)
      ).rejects.toThrow('not_found');
    }
  });

  it('query: auth permission set', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const query = `query {
        authPermissionSet(id: "${authPermissionSetId}"){
          id
          name
          description
          permissions
        }
      }`;

      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.authPermissionSet.id).toBeDefined();
      expect(result.authPermissionSet.permissions).toEqual(
        expect.arrayContaining([
          'AIWARE_JOB_CREATE',
          'RECORDING_READ',
          'CMS_RECORDING_READ',
          'RECORDING_READ',
          'AIWARE_SOURCES_READ'
        ])
      );
    }
  });

  it('query: auth permission sets', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const query = `query {
        authPermissionSets(ids:["${authPermissionSetId}"]){
          count
          records{
            id
            name
            description
            permissions
          }
        }
      }`;

      const results = await gqlClient.query(query, {}, userOptions);
      expect(results.authPermissionSets.count).toEqual(1);
      expect(results.authPermissionSets.records).toBeDefined();
    }
  });

  it('get permission sets - caching by filter', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const query = `query {
        authPermissionSets(
          ids: ["${authPermissionSetIdToUpdateProtect}"]
          ownerOrganization: ${testOrgId}
        ) {
          records {
            id
            isProtected
          }
        }
      }`;

      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.authPermissionSets.records).toEqual(
        expect.arrayContaining([
          { id: authPermissionSetIdToUpdateProtect, isProtected: false }
        ])
      );
    }
  });

  it('update an auth permission set to protected', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const newName = `${citestMarker}-permission-update-test-${uuid.v4()}`;
      const query = `mutation  {
      authPermissionSetUpdate(input:{
        id: "${authPermissionSetIdToUpdateProtect}",
        name: "${newName}",
        description: "Update description",
        permissions: [AIWARE_SOURCES_UPDATE, RECORDING_UPDATE],
        isProtected: true
      }){
        id
        name
        description
        permissions
      }
    }`;

      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.authPermissionSetUpdate.name).toEqual(newName);
      expect(result.authPermissionSetUpdate.description).toEqual(
        'Update description'
      );
      expect(result.authPermissionSetUpdate.permissions).toEqual(
        expect.arrayContaining([
          'CMS_RECORDING_UPDATE',
          'RECORDING_UPDATE',
          'AIWARE_SOURCES_UPDATE'
        ])
      );
    }
  });

  it('get permission sets - caching is refreshed after updating', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const query = `query {
        authPermissionSets(
          ids: ["${authPermissionSetIdToUpdateProtect}"]
          ownerOrganization: ${testOrgId}
        ) {
          records {
            id
            isProtected
          }
        }
      }`;

      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.authPermissionSets.records).toEqual(
        expect.arrayContaining([
          { id: authPermissionSetIdToUpdateProtect, isProtected: true }
        ])
      );
    }
  });

  it('should error when updating a protected auth permission set', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const newName = `${citestMarker}-permission-update-test-${uuid.v4()}`;
      const query = `mutation  {
      authPermissionSetUpdate(input:{
        id: "${protectedAuthPermissionSetId}",
        name: "${newName}",
        description: "Second update description",
        permissions: [CMS_SOURCES_UPDATE]
      }){
        id
        name
        description
        permissions
      }
    }`;

      await expect(async () =>
        gqlClient.query(query, {}, userOptions)
      ).rejects.toThrow('You cannot update this permission set.');
    }
  });

  it('should error when updating auth permission set that has been protected', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const newName = `${citestMarker}-permission-update-test-${uuid.v4()}`;
      const query = `mutation  {
        authPermissionSetUpdate(input:{
          id: "${authPermissionSetIdToUpdateProtect}",
          name: "${newName}",
          description: "Second update description",
          permissions: [CMS_SOURCES_UPDATE]
        }){
          id
          name
          description
          permissions
        }
    }`;

      await expect(async () =>
        gqlClient.query(query, {}, userOptions)
      ).rejects.toThrow('You cannot update this permission set.');
    }
  });

  it('should error when deleting a protected auth permission set', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const query = `mutation  {
        authPermissionSetDelete(id: "${protectedAuthPermissionSetId}"){
          id
          message
        }
      }`;

      await expect(async () =>
        gqlClient.query(query, {}, userOptions)
      ).rejects.toThrow('You cannot delete this permission set.');
    }
  });

  // note that these protected permission sets cannot been deleted
  it('delete an auth permission set', async () => {
    if (hasRBACAuthModule && useRBACFeature) {
      const query = `mutation  {
        authPermissionSetDelete(id: "${authPermissionSetId}"){
          id
          message
        }
      }`;

      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.authPermissionSetDelete.id).toBeDefined();
    }
  });
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
  const newOrgId = _.get(org, 'createOrganization.id');

  // newFilePicker flag should be enabled in the new organization
  const useNewFilePickerFeature = _.get(
    org,
    'createOrganization.jsondata.features.newFilePicker'
  );
  expect(useNewFilePickerFeature).toEqual('enabled');

  // create admin
  const createAdminUser = `mutation {
    createUser(input: {
      name: "${newUserName}"
      password: "${testUserPassword}"
      organizationId: "${newOrgId}"
      roleIds: [
        "${adminRole}",
        "${CMS_Editor}",
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
  const newAdmin = await client.query(createAdminUser, {});
  expect(newAdmin.createUser.id).toBeDefined();
  expect(newAdmin.createUser.name).toBeDefined();

  const result = await client.query(getOrgGQL, { orgName: orgName });

  const testOrg = _.get(result, 'organizations.records[0]');
  return testOrg;
}
