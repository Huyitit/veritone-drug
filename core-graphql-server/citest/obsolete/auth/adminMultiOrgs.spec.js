const helpers = require('../../helpers/index.js');
const GraphqlClient = require('../../helpers/gql.js');

const config = helpers.config;
const _ = require('lodash');

let orgId;
let orgGuid;
let orgId1;
let orgGuid1;
let testRole;
const CMS_EDITOR = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';
const DEVELOPER_EDITOR = '912e377e-f4a4-4184-8db1-baa9670d8081';
const citestMarker = global.citestMarker || 'citest-should-delete';
const citestOrgName = citestMarker + '-org-7e59cb5b2f52c763bc846471fe5942e4';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
let userTokenAuth;
let testUserId;
let testUserName;
let testUserPassword;
let testUserToken;
let testUserAuth;
let testUserId1;
let testUserName1;
let testUserPassword1;

describe('citest_auth: admin multi org tests', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    userTokenAuth = { headers: { Authorization: `Bearer ${result.token}` } };
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
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
    expect(result.me.organization).toBeDefined();
    expect(result.me.organization.id).toBeDefined();
    expect(result.me.organization.guid).toBeDefined();
    expect(result.me.id).toBeDefined();
    expect(result.me.name).toBeDefined();

    const torg = result.me.organization.id;
    orgId = torg.toString();
    orgGuid =
      result.me.organization.guid ||
      result.me.organization.internalApplicationId;
    const orgsQuery = `
    query {
      organizations (name: "citest") {
        records {
          id
          name
          status
          guid
          seats
          applications {
            records {
              applicationRoles {
                id
              }
            }
          }
        }
      }
    }`;
    const orgsResponse = await gqlClient.query(orgsQuery);
    const records = _.get(orgsResponse, 'organizations.records', []);
    let org1 = records.find((org) => {
      let hasAppWithRoles;
      if (
        org.status === 'active' && // active org
        org.id !== orgId && // is not the current org
        _.get(org, 'applications.records', []).length > 0 // has applications
      ) {
        hasAppWithRoles = org.applications.records.find(
          (app) => app.applicationRoles.length > 0
        );
        if (!_.isNil(hasAppWithRoles)) {
          testRole = hasAppWithRoles.applicationRoles[0].id;
        }
      }
      return !_.isNil(hasAppWithRoles);
    });
    if (_.isNil(org1)) {
      // Create a new one
      const createCitestOrgs = `mutation {
        createOrganization(input: {
          name: "${citestOrgName}-${new Date().toISOString()}"
          metadata: {}
          businessUnit: "citest"
          applications: [
            {
              applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
              applicationKey: 'cms'
            },
            ${
              isDesktopAppEnabled
                ? ''
                : `{
                    applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
                    applicationKey: 'admin'
                  }`
            }
            {
              applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
              applicationKey: 'developer'
            },
            {
              applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
              applicationKey: 'discovery'
            }
          ]
        }) {
          id
        }
      }`;
      const newOrg = await gqlClient.query(createCitestOrgs);
      const newOrgId = _.get(newOrg, 'createOrganization.id');
      const addApplication = `mutation {
        applicationAddToOrg(
          orgId: ${newOrgId}
          appId: "ea1d26ab-0d29-4e97-8ae7-d998a243374e"
          configs: []
        ) {
          status
        }
      }
      `;
      await gqlClient.query(addApplication);

      // get the created org
      const orgQuery = `
        query {
          organization (id: ${newOrgId}) {
            id
            name
            status
            guid
            seats
            applications {
              records {
                applicationRoles {
                  id
                }
              }
            }
          }
        }`;
      const orgResponse = await gqlClient.query(orgQuery);
      org1 = _.get(orgResponse, 'organization');
      // Get role Id
      const hasAppWithRoles = org1.applications.records.find(
        (app) => app.applicationRoles.length > 0
      );
      if (!_.isNil(hasAppWithRoles)) {
        testRole = hasAppWithRoles.applicationRoles[0].id;
      }
    }
    if (!_.isNil(org1)) {
      orgId1 = org1.id;
      orgGuid1 = org1.guid;
    } else {
      throw new Error(
        'Test environment lacks organizations that are required for testing'
      );
    }
    if (_.isNil(testRole)) {
      throw new Error(
        `Missing the test role: orgId: ${org1.id}, orgName: ${org1.name}`
      );
    }
  });

  it('create user', async () => {
    testUserPassword = Date.now();
    const appKey = Date.now();
    const query = `mutation {
      createUser(input: {
        name: "${citestMarker}-user_${appKey}@localhost"
        password: "${testUserPassword}"
        organizationId: "${orgId}"
        roleIds: ["912e377e-f4a4-4184-8db1-baa9670d8081"]
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

  it('create user not belong to the organization of superadmin', async () => {
    testUserPassword1 = Date.now();
    const appKey = Date.now();
    const query = `mutation {
      createUser(input: {
        name: "${citestMarker}-user_${appKey}@localhost"
        password: "${testUserPassword1}"
        organizationId: "${orgId1}"
        roleIds: ["${testRole}"]
        firstName: "First"
        lastName: "Last"
        jsondata: {
          foo: "bar"
        }
      })  {
        id
        name
      }
    }
    `;
    const result = await gqlClient.query(query, null, userTokenAuth);
    expect(result.createUser.id).toBeDefined();
    expect(result.createUser.name).toBeDefined();
    testUserId1 = result.createUser.id;
    testUserName1 = result.createUser.name;
  });

  // it('set session token cookie in response', () => {
  //   const authCookieName = _.get(
  //     serverConfig,
  //     'auth.userTokenCookieName',
  //     'veritone-session-id'
  //   );

  //   expect(
  //     _.get(response, 'response.headers.set-cookie').some(cookie =>
  //       cookie.includes(authCookieName)
  //     ),
  //     response
  //   ).to.be.true;
  // });

  it('add user to org', async () => {
    const query = `mutation {
          addUserToOrganization(userName: "${testUserName}",
          organizationGuid: "${orgGuid1}"
          roleIds: ["${testRole}"]
          ){
            id,
            organizationGuids
          }
         }`;
    const result = await gqlClient.query(query);
    expect(result.addUserToOrganization.organizationGuids).toBeDefined();
    expect(result.addUserToOrganization.organizationGuids.length).toEqual(2);
    // organizationGuids = result.addUserToOrganization.organizationGuids;
  });

  it('test user login successfully', async () => {
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
    testUserAuth = { headers: { Authorization: `Bearer ${testUserToken}` } };
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
            organizationId: "${orgId1}",
            roleIds: ["${CMS_EDITOR}"]
            }) {
            ...userFields
          }
        }`;

    const result = await gqlClient.query(query);
    expect(result.updateUser.organizationId).toEqual(orgId1);

    const queryUser = `query {
      user(id: "${testUserId}", organizationIds: ["${orgId1}"]) {
        id
        email
        organizationGuid 
        roles {
          id
        }
      }
    }
    `;
    const result1 = await gqlClient.query(queryUser);
    const rolesId = result1.user.roles.map((role) => role.id);
    expect(rolesId[0]).toEqual(CMS_EDITOR);
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
    expect(result.updateUser.organizationId).toEqual(orgId);
    expect(rolesId[0]).toEqual(DEVELOPER_EDITOR);
  });

  it('update user not belong to the organization of superadmin (do not specify organizationId)', async () => {
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
            id: "${testUserId1}",
            name: "${testUserName1}",
            roleIds: ["${DEVELOPER_EDITOR}"]
            }) {
            ...userFields
          }
        }`;

    const result = await gqlClient.query(query);
    const rolesId = result.updateUser.roles.map((role) => role.id);
    expect(result.updateUser.organizationId).toEqual(orgId1);
    expect(rolesId[0]).toEqual(DEVELOPER_EDITOR);
  });

  it('switch test user login to new organization successfully', async () => {
    const query = `mutation {
      switchUserToOrganization(token: "${testUserToken}",
        userName: "${testUserName}"
        organizationGuid: "${orgGuid1}") {
          token,
          organization {
            id,
            guid
          }
        }
       }`;
    const result = await gqlClient.query(query, null, testUserAuth);
    expect(result.switchUserToOrganization.token).toBeDefined();
    expect(result.switchUserToOrganization.organization.guid).toEqual(orgGuid1);
  });

  it('remove user from org', async () => {
    const query = `mutation {
      removeUserFromOrganization(userName: "${testUserName}",
        organizationGuid: "${orgGuid1}") {
          id,
          organizationGuids
        }
       }`;
    const result = await gqlClient.query(query);
    expect(result.removeUserFromOrganization.organizationGuids.length).toEqual(
      1
    );
  });

  it('not be able to remove user from last org', async () => {
    const query = `mutation {
    removeUserFromOrganization(userName: "${testUserName}",
      organizationGuid: "${orgGuid}") {
        id,
        organizationGuids
      }
      }`;
    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'can not be removed from'
    );
  });

  it('delete a user', async () => {
    const query = `mutation {
        deleteUser(id: "${testUserId}")  {
          id
        }
      }`;
    const result = await gqlClient.query(query);
    expect(result.deleteUser.id).toEqual(testUserId);
  });

  it('delete the user not belong to the organization of superadmin', async () => {
    const query = `mutation {
        deleteUser(id: "${testUserId1}")  {
          id
        }
      }`;
    const result = await gqlClient.query(query);
    expect(result.deleteUser.id).toEqual(testUserId1);
  });
});
