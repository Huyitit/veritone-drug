const _ = require('lodash');
const { TEST_CONFIG } = require('./config');
const { validateAuthGroupsDeletetion } = require('./utils');

/**
 * Delete all test organizations
 */
async function deleteOrganizations(gqlClient, adminOptions) {
  try {
    console.log('Starting organization cleanup...');

    const orgsToDelete = await getTestOrganizations(gqlClient, adminOptions);

    if (orgsToDelete.length === 0) {
      console.log('No organizations to delete');
      return;
    }

    console.log(`Deleting ${orgsToDelete.length} test organizations...`);

    await Promise.all(
      orgsToDelete.map((org) =>
        deleteIndividualOrganization(gqlClient, org, adminOptions)
      )
    );

    console.log('Organization cleanup completed');
  } catch (error) {
    console.error('Error in organization cleanup:', error.message);
    throw error;
  }
}

/**
 * Get all test organizations that need to be deleted
 */
async function getTestOrganizations(gqlClient, adminOptions) {
  const getOrgsQuery = `
    query {
      organizations(name: "${TEST_CONFIG.userNamePrefix}", nameMatch: contains, limit:1000, status: active) {
        records {
          id
          guid
          name
          status
          jsondata
        }
      }
    }`;

  const response = await gqlClient.query(getOrgsQuery, {}, adminOptions);
  const allOrgs = _.get(response, 'organizations.records', []);

  return allOrgs.filter(
    (org) =>
      org.name.includes(TEST_CONFIG.userNamePrefix) && org.status !== 'deleted'
  );
}

/**
 * Delete a single organization and validate the deletion
 */
async function deleteIndividualOrganization(gqlClient, org, adminOptions) {
  try {
    const { id: orgId, name: orgName } = org;
    if (
      !org.jsondata.features.enableRBACFeature ||
      org.jsondata.features.enableRBACFeature === 'disabled'
    ) {
      console.log(
        `This organization ${orgId} doesn't have enableRBACFeature enabled. Cannot delete AuthGroups by disabling RBACFeature!`
      );
    } else {
      // disable rbac flag will also delete permisisonSet, authGroup and relate ACLs
      const result = await disableRBACFeature(gqlClient, orgId, adminOptions);
      const RBACFeature = _.get(
        result,
        'organization.jsondata.features.enableRBACFeature'
      );
      if (!RBACFeature === 'disabled') {
        throw new Error('Failed disabling RBACFeature to delete AuthGroups');
      } else {
        console.log('Delete authGroups successfully for org: ', orgName);
      }
    }

    // Execute deletion (called twice to ignore the cache)
    const deleteOrgMutation = `
      mutation updateOrg {
        updateOrganization(input: {
          id: "${orgId}"
          status: "deleted"
        }) {
          id
          status
        }
      }`;

    await gqlClient.query(deleteOrgMutation, adminOptions);
    await gqlClient.query(deleteOrgMutation, adminOptions);

    const isDeleted = await validateOrganizationDeletion(
      gqlClient,
      orgId,
      adminOptions
    );

    if (isDeleted) {
      console.log(`Organization ${orgName} deleted successfully`);
    } else {
      console.error(`Failed to delete organization ${orgName} (ID: ${orgId})`);
    }
  } catch (error) {
    console.error(`Error deleting organization ${org.name}:`, error.message);
  }
}

/**
 * Validate that an organization was successfully deleted
 */
async function validateOrganizationDeletion(gqlClient, orgId, adminOptions) {
  const validateQuery = `
    query {
      organization(id: "${orgId}") {
        name
        id
        status
      }
    }`;

  const response = await gqlClient.query(validateQuery, adminOptions);
  return response.organization.status === 'deleted';
}

async function disableRBACFeature(gqlClient, orgId, adminOptions) {
  try {
    //disable RBACFeature first
    const updateOrgGql = `
      mutation updateOrg {
          updateOrganization (input: {
            id: "${orgId}"
            metadata: {
              features: {
                enableRBACFeature: "disabled"
              }
            }
          }){
            id
            status
            jsondata
          }
        }
    `;

    const response = await gqlClient.query(updateOrgGql, {}, adminOptions);
    return response;
  } catch (err) {
    console.error(`Error disabling Org ${orgId}:`, err.message);
  }
}

module.exports = {
  deleteOrganizations,
  getTestOrganizations
};
