import { helpers } from '../../src/helpers/index';
import * as _ from 'lodash';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { OrganizationStatus } from '../../src/gql';

const config = helpers.config;

let orgId: string;
let orgGuid: string;
let orgId1: string;
let orgGuid1: string;
let testRole: string;
const CMS_EDITOR = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';
const DEVELOPER_EDITOR = '912e377e-f4a4-4184-8db1-baa9670d8081';
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const citestOrgName = citestMarker + '-org-7e59cb5b2f52c763bc846471fe5942e4';
let userTokenAuth: { headers: { Authorization: string } };
let testUserId: string;
let testUserName: string;
let testUserPassword: string;
let testUserToken: string;
let testUserAuth: { headers: { Authorization: string } };
let testUserId1: string;
let testUserName1: string;
let testUserPassword1: string;
let sdkClient: GraphqlClient;

const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

describe('citest_auth: admin multi org tests', () => {
  beforeAll(async () => {
    const env = config.env;
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    const token = sdkClient.sessionToken as string;
    userTokenAuth = { headers: { Authorization: `Bearer ${token}` } };
    expect(token).toBeDefined();

    const result = await sdkClient.sdk.me();
    const meData = _.get(result, 'data.me');
    expect(meData).toBeDefined();
    expect(_.get(meData, 'organization')).toBeDefined();
    expect(_.get(meData, 'organization.id')).toBeDefined();
    expect(_.get(meData, 'organization.guid')).toBeDefined();
    expect(_.get(meData, 'id')).toBeDefined();
    expect(_.get(meData, 'name')).toBeDefined();

    const torg = _.get(meData, 'organization.id', '');
    orgId = torg.toString();
    orgGuid =
      _.get(meData, 'organization.guid', '') ||
      _.get(meData, 'organization.internalApplicationId', '');

    // Create a new one

    const newOrg = await sdkClient.sdk.createOrganization({
      input: {
        name: `${citestOrgName}-${new Date().toISOString()}`,
        metadata: {},
        businessUnit: 'citest',
        applications: [
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
    });
    const newOrgId = _.get(newOrg, 'data.createOrganization.id', '');
    await sdkClient.sdk.addAppToOrg({
      appId: 'e4739d44-53d2-4153-b55f-5e246fc989b1', // desktop app
      orgId: newOrgId.toString(),
      configs: []
    });

    // get the created org

    const orgResponse = await sdkClient.sdk.organizations({
      id: newOrgId.toString()
    });
    const orgData = _.get(orgResponse, 'data.organizations.records[0]');
    // Get role Id
    const hasAppWithRoles = _.get(orgData, 'applications.records', []).find(
      (app) => _.get(app, 'applicationRoles', []).length > 0
    );
    if (!_.isNil(hasAppWithRoles)) {
      testRole = _.get(hasAppWithRoles, 'applicationRoles[0].id', '');
    }

    orgId1 = _.get(orgData, 'id', '');
    orgGuid1 = _.get(orgData, 'guid', '')!;

    if (_.isNil(testRole)) {
      throw new Error(
        `Missing the test role: orgId: ${orgId1}, orgName: ${orgData?.name}`
      );
    }
  });

  afterAll(async () => {
    const safe = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err: any) {
        console.warn(
          `afterAll cleanup (${label}) failed: ${err?.message ?? err}`
        );
      }
    };

    if (testUserId) {
      await safe('delete test user', async () => {
        await sdkClient.sdk.deleteUser({ id: testUserId });
      });
    }

    if (testUserId1) {
      await safe('delete test user 1', async () => {
        await sdkClient.sdk.deleteUser({ id: testUserId1 });
      });
    }

    if (orgId1) {
      await safe('delete test org', async () => {
        await sdkClient.sdk.updateOrganization({
          input: {
            id: orgId1,
            status: OrganizationStatus.Deleted
          }
        });
      });
    }
  });

  it('create user', async () => {
    testUserPassword = Date.now().toString();
    const appKey = Date.now();

    const result = await sdkClient.sdk.createUser({
      input: {
        name: `${citestMarker}-user_${appKey}@localhost`,
        password: testUserPassword,
        organizationId: orgId,
        roleIds: [DEVELOPER_EDITOR],
        firstName: 'First',
        lastName: 'Last',
        jsondata: {
          foo: 'bar'
        }
      }
    });
    const createUserData = _.get(result, 'data.createUser');
    expect(createUserData).toBeDefined();
    testUserId = _.get(createUserData, 'id', '');
    testUserName = _.get(createUserData, 'name', '');
    expect(testUserId).toBeDefined();
    expect(testUserName).toBeDefined();
  });

  it('create user not belong to the organization of superadmin', async () => {
    testUserPassword1 = Date.now().toString();
    const appKey = Date.now();

    const result = await sdkClient.sdk.createUser(
      {
        input: {
          name: `${citestMarker}-user_${appKey}@localhost`,
          password: testUserPassword1,
          organizationId: orgId1,
          roleIds: [testRole],
          firstName: 'First',
          lastName: 'Last',
          jsondata: {
            foo: 'bar'
          }
        }
      },
      getRequestHeaders(userTokenAuth)
    );
    const createUserData = _.get(result, 'data.createUser');
    expect(createUserData).toBeDefined();
    testUserId1 = _.get(createUserData, 'id', '');
    testUserName1 = _.get(createUserData, 'name', '');
    expect(testUserId1).toBeDefined();
    expect(testUserName1).toBeDefined();
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
    const result = await sdkClient.sdk.addUserToOrganization({
      userName: testUserName,
      organizationGuid: orgGuid1,
      roleIds: [testRole]
    });

    const addUserToOrgData = _.get(result, 'data.addUserToOrganization');
    expect(addUserToOrgData).toBeDefined();
    expect(_.get(addUserToOrgData, 'id')).toBeDefined();
    expect(_.get(addUserToOrgData, 'organizationGuids.length')).toEqual(2);
    // organizationGuids = result.addUserToOrganization.organizationGuids;
  });

  it('test user login successfully', async () => {
    const result = await sdkClient.sdk.userLogin({
      input: {
        userName: testUserName,
        password: testUserPassword,
        organizationGuid: orgGuid
      }
    });

    const userLoginData = _.get(result, 'data.userLogin');
    expect(userLoginData).toBeDefined();
    expect(_.get(userLoginData, 'token')).toBeDefined();
    expect(_.get(userLoginData, 'organization')).toBeDefined();
    expect(_.get(userLoginData, 'organization.id')).toBeDefined();
    expect(_.get(userLoginData, 'organization.guid')).toBeDefined();
    expect(_.get(userLoginData, 'user.id')).toBeDefined();
    expect(_.get(userLoginData, 'user.name')).toBeDefined();

    testUserToken = _.get(userLoginData, 'token', '')!;
    testUserAuth = { headers: { Authorization: `Bearer ${testUserToken}` } };
  });

  it('update user in specific organization', async () => {
    const result = await sdkClient.sdk.updateUser({
      input: {
        id: testUserId,
        name: testUserName,
        organizationId: orgId1,
        roleIds: [CMS_EDITOR]
      }
    });

    const updateUserData = _.get(result, 'data.updateUser');
    expect(updateUserData).toBeDefined();
    expect(_.get(updateUserData, 'organizationId')).toEqual(orgId1);

    const result1 = await sdkClient.sdk.user({
      id: testUserId,
      organizationIds: [orgId1]
    });

    const userData = _.get(result1, 'data.user');
    expect(userData).toBeDefined();
    const rolesId = _.get(userData, 'roles', [])?.map((role) =>
      _.get(role, 'id')
    );
    expect(_.get(rolesId, '[0]')).toEqual(CMS_EDITOR);
  });

  it('update user in default organization (do not specify organizationId)', async () => {
    const result = await sdkClient.sdk.updateUser({
      input: {
        id: testUserId,
        name: testUserName,
        roleIds: [DEVELOPER_EDITOR]
      }
    });

    const updateUserData = _.get(result, 'data.updateUser');
    expect(updateUserData).toBeDefined();
    const rolesId = _.get(updateUserData, 'roles', [])?.map((role) =>
      _.get(role, 'id')
    );
    expect(_.get(updateUserData, 'organizationId')).toEqual(orgId);
    expect(_.get(rolesId, '[0]')).toEqual(DEVELOPER_EDITOR);
  });

  it('update user not belong to the organization of superadmin (do not specify organizationId)', async () => {
    const result = await sdkClient.sdk.updateUser({
      input: {
        id: testUserId1,
        name: testUserName1,
        roleIds: [DEVELOPER_EDITOR]
      }
    });

    const updateUserData = _.get(result, 'data.updateUser');
    expect(updateUserData).toBeDefined();
    const rolesId = _.get(updateUserData, 'roles', [])?.map((role) =>
      _.get(role, 'id')
    );
    expect(_.get(updateUserData, 'organizationId')).toEqual(orgId1);
    expect(_.get(rolesId, '[0]')).toEqual(DEVELOPER_EDITOR);
  });

  it('switch test user login to new organization successfully', async () => {
    const result = await sdkClient.sdk.switchUserToOrganization(
      {
        token: testUserToken,
        userName: testUserName,
        organizationGuid: orgGuid1
      },
      getRequestHeaders(testUserAuth)
    );

    const switchUserToOrganizationData = _.get(
      result,
      'data.switchUserToOrganization'
    );
    expect(_.get(switchUserToOrganizationData, 'token')).toBeDefined();
    expect(_.get(switchUserToOrganizationData, 'organization.guid')).toEqual(
      orgGuid1
    );
  });

  it('remove user from org', async () => {
    const result = await sdkClient.sdk.removeUserFromOrganization({
      userName: testUserName,
      organizationGuid: orgGuid1
    });

    const removeUserFromOrganizationData = _.get(
      result,
      'data.removeUserFromOrganization'
    );
    expect(removeUserFromOrganizationData).toBeDefined();
    expect(
      _.get(removeUserFromOrganizationData, 'organizationGuids.length')
    ).toEqual(1);
  });

  it('not be able to remove user from last org', async () => {
    const removeUser = sdkClient.sdk.removeUserFromOrganization({
      userName: testUserName,
      organizationGuid: orgGuid
    });

    await expect(removeUser).rejects.toThrow('can not be removed from');
  });

  it('delete a user', async () => {
    const result = await sdkClient.sdk.deleteUser({ id: testUserId });

    const deleteUserData = _.get(result, 'data.deleteUser');
    expect(_.get(deleteUserData, 'id')).toEqual(testUserId);
  });

  it('delete the user not belong to the organization of superadmin', async () => {
    const result = await sdkClient.sdk.deleteUser({ id: testUserId1 });
    const deleteUserData = _.get(result, 'data.deleteUser');
    expect(_.get(deleteUserData, 'id')).toEqual(testUserId1);
  });
});
