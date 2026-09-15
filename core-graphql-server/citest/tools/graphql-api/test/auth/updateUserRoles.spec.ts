import * as _ from 'lodash';
import * as uuid from 'uuid';
import { helpers } from '../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

const config = helpers.config;
const env = config.env;

const userAgent = config.userAgent || 'core-graphql-server test';

const roleA = '912e377e-f4a4-4184-8db1-baa9670d8081';
const roleB = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';

describe('citest_auth: updateUserRoles', () => {
  let sdkClient: GraphqlClient;
  let orgId: string;
  let testUserId: string;

  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(sdkClient.sessionToken).toBeDefined();

    const loginResult = await sdkClient.sdk.userLogin(
      {
        input: {
          userName: config.userName,
          password: config.password
        }
      },
      { 'User-Agent': userAgent, Accept: '*/*' }
    );

    orgId = _.get(loginResult, 'data.userLogin.organization.id', '').toString();
    expect(orgId).toBeDefined();

    // Create a test user with roleA
    const createResult = await sdkClient.sdk.createUser({
      input: {
        name: `${citestMarker}-updateUserRoles-${uuid.v4()}@localhost`,
        organizationId: orgId,
        roleIds: [roleA],
        firstName: 'UpdateRoles',
        lastName: 'TestUser'
      }
    });
    testUserId = _.get(createResult, 'data.createUser.id');
    expect(testUserId).toBeDefined();
  });

  afterAll(async () => {
    if (testUserId) {
      try {
        await sdkClient.sdk.deleteUser({ id: testUserId });
      } catch (e) {
        console.error(
          `Failed to delete test user ${testUserId} during cleanup:`,
          e
        );
      }
    }
  });

  it('should add a role to the user', async () => {
    const result = await sdkClient.sdk.updateUserRoles({
      input: {
        userId: testUserId,
        addRoleIds: [roleB],
        organizationId: orgId
      }
    });

    const updatedRoleData = _.get(result, 'data.updateUserRoles');
    expect(updatedRoleData.id).toEqual(testUserId);
    expect(updatedRoleData.roleIds).toContain(roleA);
    expect(updatedRoleData.roleIds).toContain(roleB);
    expect(updatedRoleData.roles.length).toBeGreaterThanOrEqual(2);
  });

  it('should remove a role from the user', async () => {
    // User currently has roleA + roleB

    const result = await sdkClient.sdk.updateUserRoles({
      input: {
        userId: testUserId,
        removeRoleIds: [roleA],
        organizationId: orgId
      }
    });

    const updatedRoleData = _.get(result, 'data.updateUserRoles');
    expect(updatedRoleData.id).toEqual(testUserId);
    expect(updatedRoleData.roleIds).not.toContain(roleA);
    expect(updatedRoleData.roleIds).toContain(roleB);
  });

  it('should add and remove roles simultaneously', async () => {
    // User currently has roleB only. Add roleA, remove roleB.

    const result = await sdkClient.sdk.updateUserRoles({
      input: {
        userId: testUserId,
        addRoleIds: [roleA],
        removeRoleIds: [roleB],
        organizationId: orgId
      }
    });

    const updatedRoleData = _.get(result, 'data.updateUserRoles');
    expect(updatedRoleData.id).toEqual(testUserId);
    expect(updatedRoleData.roleIds).toContain(roleA);
    expect(updatedRoleData.roleIds).not.toContain(roleB);
  });

  it('should work without organizationId', async () => {
    // The endpoint should resolve the org from the user

    const result = await sdkClient.sdk.updateUserRoles({
      input: {
        userId: testUserId,
        addRoleIds: [roleB]
      }
    });
    const updatedRoleData = _.get(result, 'data.updateUserRoles');
    expect(updatedRoleData.id).toEqual(testUserId);
    expect(updatedRoleData.roleIds).toContain(roleB);
  });

  it('should cancel out overlapping roleIds in add and remove', async () => {
    // After dedupe, both arrays become empty
    await expect(async () =>
      sdkClient.sdk.updateUserRoles({
        input: {
          userId: testUserId,
          addRoleIds: [roleB],
          removeRoleIds: [roleB],
          organizationId: orgId
        }
      })
    ).rejects.toThrow();
  });

  it('should return error for invalid userId', async () => {
    await expect(async () =>
      sdkClient.sdk.updateUserRoles({
        input: {
          userId: 'not-a-valid-uuid',
          addRoleIds: [roleA]
        }
      })
    ).rejects.toThrow();
  });

  it('should return error when both arrays are empty', async () => {
    await expect(async () =>
      sdkClient.sdk.updateUserRoles({
        input: {
          userId: testUserId
        }
      })
    ).rejects.toThrow();
  });

  it('should return error for non-existent user', async () => {
    const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

    await expect(async () =>
      sdkClient.sdk.updateUserRoles({
        input: {
          userId: nonExistentUserId,
          addRoleIds: [roleA],
          organizationId: orgId
        }
      })
    ).rejects.toThrow();
  });

  it('should restore user to original state for cleanup', async () => {
    const result = await sdkClient.sdk.updateUserRoles({
      input: {
        userId: testUserId,
        removeRoleIds: [roleB],
        organizationId: orgId
      }
    });
    const updatedRoleData = _.get(result, 'data.updateUserRoles');
    expect(updatedRoleData.id).toEqual(testUserId);
  });
});
