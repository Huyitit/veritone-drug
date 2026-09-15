const _ = require('lodash');
const { TEST_CONFIG } = require('./config');
const { configureAdminRole, createTemporaryAdmin } = require('./utils');

/**
 * Delete folders
 */
async function deleteFolders(gqlClient, adminOptions, orgsToProcess) {
  try {
    console.log('Starting delete folder...');

    if (orgsToProcess.length === 0) {
      console.log('No organizations found for folders cleanup');
      return;
    }

    for (const org of orgsToProcess) {
      await processFolderForOrg(gqlClient, adminOptions, org);
    }

    console.log('Folders cleanup completed');
  } catch (error) {
    console.error('Error in Folders cleanup:', error.message);
    throw error;
  }
}

async function processFolderForOrg(gqlClient, adminOptions, org) {
  const { id: orgId, name: orgName } = org;

  console.log(`Processing folder for org: ${orgName}`);

  const folders = await getFolderToDeleteForOrg(gqlClient, orgId, adminOptions);

  if (folders.length === 0) {
    console.log(`No Folder to delete for org ${orgName}`);
    return;
  }

  console.log(`Deleting ${folders.length} Folder(s) for org ${orgName}...`);

  const adminRoleId = await configureAdminRole(gqlClient);
  const tempAdminOptions = await createTemporaryAdmin(
    gqlClient,
    orgId,
    adminRoleId,
    adminOptions
  );

  await Promise.all(
    folders.map((folder) =>
      deleteIndividualFolder(gqlClient, folder, tempAdminOptions)
    )
  );
}

async function getFolderToDeleteForOrg(gqlClient, orgId, adminOptions) {
  const getOrgGQL = `
  query {
    organization(id:"${orgId}"){
        id
        name
        guid
        rootFolder(
          type: watchlist
        ) {
          id
          organizationId
          childFolders{
            records{
                id
                name
                orderIndex
            }
          }
        }
    }
}`;
  const response = await gqlClient.query(getOrgGQL, {}, adminOptions);
  const allFolderItems = _.get(
    response,
    'organization.rootFolder.childFolders.records'
  );
  return allFolderItems.filter((item) =>
    item.name.includes(TEST_CONFIG.userNamePrefix)
  );
}

async function deleteIndividualFolder(gqlClient, folder, tempAdminOptions) {
  try {
    const {
      id: folderId,
      name: folderName,
      orderIndex: testOrderIndex
    } = folder;

    const deleteFolderMutation = `
      mutation {
        deleteFolder(input: {
          id: "${folderId}"
          orderIndex: ${testOrderIndex}
        }) {
          id
        }
      }`;

    await gqlClient.query(deleteFolderMutation, {}, tempAdminOptions);

    const item = 'folder';
    const isDeleted = await validateFolderDeletion(
      gqlClient,
      item,
      folderId,
      tempAdminOptions
    );

    if (isDeleted) {
      console.log(`Folder ${folderName} deleted successfully`);
    } else {
      console.error(`Failed to delete folder ${folderName}`);
    }
  } catch (error) {
    console.error(`Error deleting folder ${folder.name}:`, error.message);
  }
}

async function validateFolderDeletion(
  gqlClient,
  item,
  itemId,
  tempAdminOptions
) {
  const validateQuery = `
    query {
      ${item}(id: "${itemId}") {
        id
        name
      }
    }`;

  try {
    await gqlClient.query(validateQuery, tempAdminOptions);
    return false;
  } catch (error) {
    // If we get "not found" error, the item was successfully deleted
    return error.message && error.message.includes('not found');
  }
}

module.exports = {
  deleteFolders
};
