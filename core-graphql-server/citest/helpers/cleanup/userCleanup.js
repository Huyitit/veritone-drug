const _ = require('lodash');
const { TEST_CONFIG } = require('./config');

/**
 * Delete all test users matching the cleanup criteria
 */
async function deleteUsers(gqlClient, adminOptions) {
  try {
    console.log('Starting user cleanup...');

    const usersToDelete = await getTestUsers(gqlClient, adminOptions);

    if (usersToDelete.length === 0) {
      console.log('No users to delete');
      return;
    }

    console.log(`Deleting ${usersToDelete.length} test users...`);

    await Promise.all(
      usersToDelete.map((user) =>
        deleteIndividualUser(gqlClient, user, adminOptions)
      )
    );

    console.log('User cleanup completed');
  } catch (error) {
    console.error('Error in user cleanup:', error.message);
    throw error;
  }
}

/**
 * Retrieve all test users that need to be deleted
 */
async function getTestUsers(gqlClient, adminOptions) {
  const getUsersQuery = `
    query {
      users(name: "${TEST_CONFIG.userNamePrefix}", includeAllOrgUsers: true, statuses: [active, suspended, deactivated, inactive]) {
        records {
          jsondata
          status
          id
          name
          systemUser
          organization {
            id
            guid
          }
        }
      }
    }`;

  const response = await gqlClient.query(getUsersQuery, adminOptions);
  const allUsers = _.get(response, 'users.records', []);

  return allUsers.filter(
    (user) =>
      user.name.includes(TEST_CONFIG.userNamePrefix) &&
      user.systemUser !== true &&
      user.status !== 'deleted'
  );
}

/**
 * Delete a single user and validate the deletion
 */
async function deleteIndividualUser(gqlClient, user, adminOptions) {
  try {
    const { id: userId, name: userName, organization } = user;
    const organizationId = organization.id;

    const deleteUserMutation = `
      mutation {
        deleteUser(id: "${userId}") {
          message
        }
      }`;

    await gqlClient.query(deleteUserMutation, adminOptions);

    const isDeleted = await validateUserDeletion(
      gqlClient,
      userId,
      organizationId,
      adminOptions
    );

    if (isDeleted) {
      console.log(`User ${userName} deleted successfully`);
    } else {
      console.error(`Failed to delete user ${userName} (ID: ${userId})`);
    }
  } catch (error) {
    console.error(`Error deleting user ${user.name}:`, error.message);
  }
}

/**
 * Validate that a user was successfully deleted
 */
async function validateUserDeletion(
  gqlClient,
  userId,
  organizationId,
  adminOptions
) {
  const validateQuery = `
    query {
      user(id: "${userId}", organizationIds: ["${organizationId}"]) {
        name
        id
        status
        organization {
          id
          guid
        }
      }
    }`;

  const response = await gqlClient.query(validateQuery, adminOptions);
  return response.user.status === 'deleted';
}

module.exports = {
  deleteUsers
};
