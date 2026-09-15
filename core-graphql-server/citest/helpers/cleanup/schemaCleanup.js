const _ = require('lodash');
const { TEST_CONFIG } = require('./config');
const {
  configureAdminRole,
  createTemporaryAdminReturnLogin,
  getTestDataRegistry
} = require('./utils');
const helpers = require('../index');

async function deleteSchema(gqlClient, adminOptions) {
  let orgIds = [];
  let org = new Map();

  try {
    console.log('Starting delete Schemas...');

    const dgsToProcess = await getTestDataRegistry(gqlClient, adminOptions);

    if (dgsToProcess.length === 0) {
      console.log('No dataRegistry found for schema cleanup');
      return;
    }
    const schemas = dgsToProcess.flatMap((dataRegistry) =>
      _.get(dataRegistry, 'schemas.records', [])
    );

    if (schemas.length === 0) {
      console.log('No schemas found for cleanup');
      return;
    }

    for (const schema of schemas) {
      await processSchema(
        gqlClient,
        dgsToProcess,
        schema,
        adminOptions,
        orgIds,
        org
      );
    }

    console.log('Schemas cleanup completed');
  } catch (error) {
    console.error('Error in Schemas cleanup:', error.message);
    throw error;
  }
}

async function processSchema(
  gqlClient,
  dgsToProcess,
  schema,
  adminOptions,
  orgIds,
  org
) {
  const dg = dgsToProcess.find((dataRegistry) =>
    _.get(dataRegistry, 'schemas.records', []).some((s) => s.id === schema.id)
  );
  const { organizationId: orgId } = dg;

  if (orgIds.includes(orgId)) {
    const { username, password } = org.get(orgId);
    const loginGql = `
            mutation userLogin {
                userLogin(
                input: {userName: "${username}", password: "${password}"}
                ) {
                token
                }
            }`;
    const result = await gqlClient.query(loginGql, {});
    const newAdminToken = _.get(result, 'userLogin.token');
    const tempAdminOptions = helpers.requestOptions(newAdminToken);
    await deleteIndividualschema(gqlClient, schema, tempAdminOptions);
  } else {
    const adminRoleId = await configureAdminRole(gqlClient);
    const newAdmin = await createTemporaryAdminReturnLogin(
      gqlClient,
      orgId,
      adminRoleId,
      adminOptions
    );
    if (!newAdmin) {
      return;
    }
    const newAdminToken = _.get(newAdmin, 'userLogin.token');
    const tempAdminOptions = helpers.requestOptions(newAdminToken);
    const username = _.get(newAdmin, 'userLogin.user.name');
    const password = TEST_CONFIG.testUserPassword;
    orgIds.push(orgId);
    org.set(orgId, { username, password });
    await deleteIndividualschema(gqlClient, schema, tempAdminOptions);
  }
}

async function deleteIndividualschema(gqlClient, schema, tempAdminOptions) {
  const { id: schemaId } = schema;
  try {
    const deleteSchemaGql = `
        mutation {
          updateSchemaState(input:{id: "${schemaId}",  status:deleted}) {
            id
            status
          }
        }`;
    await gqlClient.query(deleteSchemaGql, {}, tempAdminOptions);
  } catch (error) {
    console.error(`Error deleting schema ${schemaId}:`, error.message);
  }
}

module.exports = {
  deleteSchema
};
