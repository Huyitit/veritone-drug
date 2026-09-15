const _ = require('lodash');
const helpers = require('../index');
const { ROLE_IDS, TEST_CONFIG } = require('./config');
const uuid = require('uuid');

/**
 * Configure the admin role ID based on feature flags
 */
async function configureAdminRole(gqlClient) {
  const appConfigQuery = `
    query {
      graphqlServiceInfo {
        featureFlags
      }
    }`;

  const appConfig = await gqlClient.query(appConfigQuery);
  const enableDefaultDesktopApp = _.get(
    appConfig,
    'graphqlServiceInfo.featureFlags.enableDefaultDesktopApp',
    false
  );

  let adminRoleId = ROLE_IDS.ADMIN_ROLE_LEGACY;
  if (enableDefaultDesktopApp) {
    adminRoleId = ROLE_IDS.ADMIN_ROLE;
  }

  console.log(
    `Feature flag enableDefaultDesktopApp: ${enableDefaultDesktopApp}`
  );
  console.log(`Using admin role ID: ${adminRoleId}`);

  return adminRoleId;
}

/**
 * Create a temporary admin user for auth operations
 */
async function createTemporaryAdminReturnLogin(
  gqlClient,
  orgId,
  adminRoleId,
  adminOptions
) {
  const newUserName = `${
    TEST_CONFIG.userNamePrefix
  }-rbac-admin-${uuid.v4()}@localhost`;

  const queryOrg = `
    query {
      organizations(id:${orgId}){
        records {
          id
          name
          status
        }
      }
    }
  `;
  const orgResult = await gqlClient.query(queryOrg, {}, adminOptions);
  const orgStatus = _.get(orgResult, 'organizations.records[0].status');
  if (orgStatus === 'deleted') {
    console.log(
      `This organization id: ${orgId} is already deleted - cannot create temp user - skip deleting for this org`
    );
    return;
  }

  const createAdminMutation = `
    mutation {
      createUser(input: {
        name: "${newUserName}"
        password: "${TEST_CONFIG.testUserPassword}"
        organizationId: "${orgId}"
        roleIds: [
          "${adminRoleId}",
          "${ROLE_IDS.CMS_EDITOR}"
        ]
        firstName: "First"
        lastName: "Last"
        jsondata: {
          firstName: "RBAC-User"
          lastName: "Admin"
        }
      }) {
        id
        name
        status
        firstName
        lastName
        jsondata
      }
    }`;

  const newAdmin = await gqlClient.query(createAdminMutation, {}, adminOptions);

  if (!newAdmin || !newAdmin.createUser) {
    throw new Error('Failed to create temporary admin user');
  }

  const loginGql = `
    mutation userLogin {
      userLogin(
      input: {userName: "${newAdmin.createUser.name}", password: "${TEST_CONFIG.testUserPassword}"}
    ) {
      token
      user{
        name
      }
    }
  }`;

  const result = await gqlClient.query(loginGql, {});
  return result;
}

async function createTemporaryAdmin(
  gqlClient,
  orgId,
  adminRoleId,
  adminOptions
) {
  const result = await createTemporaryAdminReturnLogin(
    gqlClient,
    orgId,
    adminRoleId,
    adminOptions
  );
  const newAdminToken = _.get(result, 'userLogin.token');
  return helpers.requestOptions(newAdminToken);
}
/**
 * Get items to delete for a specific organization and item type
 */
async function getDeleteItemsForOrg(gqlClient, item, orgId, adminOptions) {
  const getItemsQuery = `
    query {
      ${item}(ownerOrganization: ${orgId}) {
        records {
          id
          name
          isProtected
        }
      }
    }`;

  const response = await gqlClient.query(getItemsQuery, adminOptions);
  const allItems = _.get(response, `${item}.records`, []);

  return allItems.filter(
    (item) =>
      item.name.includes(TEST_CONFIG.userNamePrefix) &&
      item.isProtected === false
  );
}

/**
 * Validate that an authentication item was successfully deleted
 */
async function validateItemDeletion(gqlClient, item, itemId, adminOptions) {
  const validateQuery = `
    query {
      ${item}(id: "${itemId}") {
        id
        name
      }
    }`;

  try {
    await gqlClient.query(validateQuery, adminOptions);
    return false;
  } catch (error) {
    // If we get "not found" error, the item was successfully deleted
    return error.message && error.message.includes('not found');
  }
}

/**
 * Validate that auth groups were successfully deleted
 */
async function validateAuthGroupsDeletetion(gqlClient, orgId, options) {
  const getAuthGroupsGql = `
    query {
    authGroups(ownerOrganization: ${orgId}){
        records{
            id 
            name
        }
    }
}
  `;
  const response = await gqlClient.query(getAuthGroupsGql, {}, options);
  const records = _.get(response, 'authGroups.records');
  const validate = Boolean(records.length === 0);
  return validate;
}

async function getTestDataRegistry(gqlClient, adminOptions) {
  const getDataRegistryQuery = `
    query {
  dataRegistries(name: "${TEST_CONFIG.userNamePrefix}", nameMatch: contains, limit: 1000, orderBy: createdDateTime, orderDirection: desc){
    records{
      id
      name
      organizationId
      createdDateTime
      schemas{
        records{
          id
          __typename
          status
        }
      }
    }
  }
}`;

  const response = await gqlClient.query(
    getDataRegistryQuery,
    {},
    adminOptions
  );

  return _.get(response, 'dataRegistries.records', []);
}

const safe = async (label, fn) => {
  try {
    await fn();
  } catch (err) {
    console.warn(`cleanup (${label}) failed:`, err);
  }
};

/**
 * Conditional test execution helpers
 * Use itif for individual test cases that should run/skip based on a condition
 * Use describif for entire test suites that should run/skip based on a condition
 */
const itif = (condition, ...args) => (condition ? it(...args) : it.skip(...args));
const describif = (condition, ...args) => (condition ? describe(...args) : describe.skip(...args));

module.exports = {
  configureAdminRole,
  createTemporaryAdmin,
  getDeleteItemsForOrg,
  validateItemDeletion,
  validateAuthGroupsDeletetion,
  getTestDataRegistry,
  createTemporaryAdminReturnLogin,
  safe,
  itif,
  describif
};
