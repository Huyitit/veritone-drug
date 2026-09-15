const _ = require('lodash');
const { TEST_CONFIG } = require('./config');
const {
  validateItemDeletion,
  configureAdminRole,
  createTemporaryAdmin
} = require('./utils');

async function deleteTDO(gqlClient, adminOptions, orgsToProcess) {
  try {
    console.log('Starting delete TDO...');

    if (orgsToProcess.length === 0) {
      console.log('No organizations found for TDOs cleanup');
      return;
    }

    for (const org of orgsToProcess) {
      await processTDOForOrg(gqlClient, adminOptions, org);
    }

    console.log('TDOs cleanup completed');
  } catch (error) {
    console.error('Error in TDOs cleanup:', error.message);
    throw error;
  }
}

async function processTDOForOrg(gqlClient, adminOptions, org) {
  const { id: orgId, name: orgName } = org;
  console.log(`Processing TDO for org: ${orgName}`);

  const adminRoleId = await configureAdminRole(gqlClient);
  const tempAdminOptions = await createTemporaryAdmin(
    gqlClient,
    orgId,
    adminRoleId,
    adminOptions
  );

  const tdos = await getTDOsToDeleteForOrg(gqlClient, orgId, tempAdminOptions);
  if (tdos.length === 0) {
    console.log(`No TDOs to delete for org ${orgName}`);
    return;
  }
  console.log(`Deleting ${tdos.length} TDO(s) for org ${orgName}...`);

  await Promise.all(
    tdos.map((tdo) => deleteIndividualTDO(gqlClient, tdo, tempAdminOptions))
  );
}

async function getTDOsToDeleteForOrg(gqlClient, orgId, tempAdminOptions) {
  const getTDOsGql = `
  query {
    temporalDataObjects(
    organizationId: "${orgId}", limit: 100){
        records{
            name
            id
        }
    offset
    limit
    count
    }
}`;
  const response = await gqlClient.query(getTDOsGql, {}, tempAdminOptions);
  const allTDOs = _.get(response, 'temporalDataObjects.records');
  return allTDOs.filter((item) =>
    item.name.includes(TEST_CONFIG.userNamePrefix)
  );
}

async function deleteIndividualTDO(gqlClient, tdo, tempAdminOptions) {
  const { id: tdoId, name: tdoName } = tdo;
  try {
    const deleteTDOGql = `
        mutation {
            deleteTDO(id: "${tdoId}") {
                id
                message
            }
        }`;
    await gqlClient.query(deleteTDOGql, {}, tempAdminOptions);

    const item = 'temporalDataObject';
    const isDeleted = await validateItemDeletion(
      gqlClient,
      item,
      tdoId,
      tempAdminOptions
    );
    if (isDeleted) {
      console.log(`TDO ${tdoName} deleted successfully`);
    } else {
      console.error(`Failed to delete folder ${tdoName}`);
    }
  } catch (error) {
    console.error(`Error deleting tdo ${tdo.name}:`, error.message);
  }
}

module.exports = {
  deleteTDO
};
