const helpers = require('../../helpers/index.js');
const GraphqlClient = require('../../helpers/gql.js');

const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');

const env = config.env;
const userAgent = config.userAgent || 'core-graphql-server test';
const citestMarker = global.citestMarker || 'citest-should-delete';

const roleA = '912e377e-f4a4-4184-8db1-baa9670d8081';
const roleB = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';

describe('citest_auth: updateUserRoles', () => {
  let gqlClient;
  let orgId;
  let testUserId;

  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    await gqlClient.connect();
    const loginQuery = `mutation {
      userLogin(input: {
        userName: "${config.userName}"
        password: "${config.password}"
      }) {
        token
        organization { id }
      }
    }`;
    const loginResult = await gqlClient.query(loginQuery, null, {
      headers: { 'User-Agent': userAgent, Accept: '*/*' }
    });
    orgId = _.get(loginResult, 'userLogin.organization.id', '').toString();
    expect(orgId).toBeDefined();

    // Create a test user with roleA
    const createQuery = `mutation {
      createUser(input: {
        name: "${citestMarker}-updateUserRoles-${uuid.v4()}@localhost"
        organizationId: "${orgId}"
        roleIds: ["${roleA}"]
        firstName: "UpdateRoles"
        lastName: "TestUser"
      }) {
        id
        roleIds
      }
    }`;
    const createResult = await gqlClient.query(createQuery);
    testUserId = _.get(createResult, 'createUser.id');
    expect(testUserId).toBeDefined();
  });

  afterAll(async () => {
    if (testUserId) {
      try {
        await gqlClient.query(
          `mutation { deleteUser(id: "${testUserId}") { id } }`
        );
      } catch (e) {
        console.error(`Failed to delete test user ${testUserId} during cleanup:`, e);
      }
    }
  });

  it('should add a role to the user', async () => {
    const query = `mutation {
      updateUserRoles(input: {
        userId: "${testUserId}"
        addRoleIds: ["${roleB}"]
        organizationId: "${orgId}"
      }) {
        id
        roleIds
        roles { id name }
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.updateUserRoles.id).toEqual(testUserId);
    expect(result.updateUserRoles.roleIds).toContain(roleA);
    expect(result.updateUserRoles.roleIds).toContain(roleB);
    expect(result.updateUserRoles.roles.length).toBeGreaterThanOrEqual(2);
  });

  it('should remove a role from the user', async () => {
    // User currently has roleA + roleB
    const query = `mutation {
      updateUserRoles(input: {
        userId: "${testUserId}"
        removeRoleIds: ["${roleA}"]
        organizationId: "${orgId}"
      }) {
        id
        roleIds
        roles { id name }
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.updateUserRoles.id).toEqual(testUserId);
    expect(result.updateUserRoles.roleIds).not.toContain(roleA);
    expect(result.updateUserRoles.roleIds).toContain(roleB);
  });

  it('should add and remove roles simultaneously', async () => {
    // User currently has roleB only. Add roleA, remove roleB.
    const query = `mutation {
      updateUserRoles(input: {
        userId: "${testUserId}"
        addRoleIds: ["${roleA}"]
        removeRoleIds: ["${roleB}"]
        organizationId: "${orgId}"
      }) {
        id
        roleIds
        roles { id name }
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.updateUserRoles.id).toEqual(testUserId);
    expect(result.updateUserRoles.roleIds).toContain(roleA);
    expect(result.updateUserRoles.roleIds).not.toContain(roleB);
  });

  it('should work without organizationId', async () => {
    // The endpoint should resolve the org from the user
    const query = `mutation {
      updateUserRoles(input: {
        userId: "${testUserId}"
        addRoleIds: ["${roleB}"]
      }) {
        id
        roleIds
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.updateUserRoles.id).toEqual(testUserId);
    expect(result.updateUserRoles.roleIds).toContain(roleB);
  });

  it('should cancel out overlapping roleIds in add and remove', async () => {
    const query = `mutation {
      updateUserRoles(input: {
        userId: "${testUserId}"
        addRoleIds: ["${roleB}"]
        removeRoleIds: ["${roleB}"]
        organizationId: "${orgId}"
      }) {
        id
        roleIds
      }
    }`;
    // After dedupe, both arrays become empty
    await expect(async () => gqlClient.query(query)).rejects.toThrow();
  });

  it('should return error for invalid userId', async () => {
    const query = `mutation {
      updateUserRoles(input: {
        userId: "not-a-valid-uuid"
        addRoleIds: ["${roleA}"]
      }) {
        id
      }
    }`;
    await expect(async () => gqlClient.query(query)).rejects.toThrow();
  });

  it('should return error when both arrays are empty', async () => {
    const query = `mutation {
      updateUserRoles(input: {
        userId: "${testUserId}"
      }) {
        id
      }
    }`;
    await expect(async () => gqlClient.query(query)).rejects.toThrow();
  });

  it('should return error for non-existent user', async () => {
    const nonExistentUserId = '00000000-0000-0000-0000-000000000000';
    const query = `mutation {
      updateUserRoles(input: {
        userId: "${nonExistentUserId}"
        addRoleIds: ["${roleA}"]
        organizationId: "${orgId}"
      }) {
        id
      }
    }`;
    await expect(async () => gqlClient.query(query)).rejects.toThrow();
  });

  it('should restore user to original state for cleanup', async () => {
    const query = `mutation {
      updateUserRoles(input: {
        userId: "${testUserId}"
        removeRoleIds: ["${roleB}"]
        organizationId: "${orgId}"
      }) {
        id
        roleIds
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.updateUserRoles.id).toEqual(testUserId);
  });
});
