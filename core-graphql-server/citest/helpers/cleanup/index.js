const helpers = require('../index');
const GraphqlClient = require('../gql.js');
const config = helpers.config;

const { deleteFolders } = require('./folderCleanup');
const { deleteUsers } = require('./userCleanup');
const {
  deleteOrganizations,
  getTestOrganizations
} = require('./organizationCleanup');
const { deleteTDO } = require('./TDOCleanup');
const { deleteSchema } = require('./schemaCleanup');
const { deleteEngines } = require('./engineCleanup');

let gqlClient;
let adminToken;
let adminOptions;

/**
 * Main cleanup function that orchestrates the entire cleanup process
 */
async function cleanup() {
  try {
    console.log('Starting CI test cleanup process...');

    await initializeConnection();
    await executeCleanupSteps();

    console.log('Cleanup process completed successfully');
  } catch (error) {
    console.error('Cleanup process failed:', error.message);
    throw error;
  }
}

/**
 * Initialize GraphQL connection and authentication
 */
async function initializeConnection() {
  const env = config.env;
  gqlClient = new GraphqlClient(env);

  const result = await gqlClient.connect();
  adminToken = result.token;
  adminOptions = helpers.requestOptions(adminToken);
}

/**
 * Execute all cleanup steps in the correct order
 */
async function executeCleanupSteps() {
  // Order matters: permissions first then folders, then users, then organizations
  const listOrgs = await getTestOrganizations(gqlClient, adminOptions);
  await deleteTDO(gqlClient, adminOptions, listOrgs);
  await deleteFolders(gqlClient, adminOptions, listOrgs);
  await deleteSchema(gqlClient, adminOptions);
  await deleteEngines(gqlClient, adminOptions);
  await deleteUsers(gqlClient, adminOptions);
  await deleteOrganizations(gqlClient, adminOptions);
}

module.exports = {
  cleanup
};
