const userHelpers = require('./user');
const helpers = require('./index');
async function createTestOrganization(client, input) {
  // create organization
  const queryOrg = `mutation ($name: String!, $businessUnit: String!, $types: [OrganizationType], $kvp: JSONData!, $apps: JSONData, $remainingBudget: Int, $isLimitEnforced: Boolean) {
        createOrganization (input: {
          name: $name
          businessUnit: $businessUnit
          types: $types
          metadata: $kvp
          applications: $apps
          remainingBudget: $remainingBudget
          isLimitEnforced: $isLimitEnforced
        }) {
          id
          guid
          name
          type
          status
          jsondata
          remainingBudget
          isLimitEnforced
          businessUnit
          users {
            records {
              name
              id
              organizationGuid
              organizationId
              organizationGuids
              authGroups {
                records {
                  id
                  name
                  description
                }
              }
              roles{
                id
              } 
              status
            }
          }
        }
      }`;
  const { gqlClient, options } = client;
  const result = await gqlClient.query(queryOrg, input, options);
  const org = result.createOrganization;
  expect(org.id).toBeDefined();
  expect(org.guid).toBeDefined();
  return org;
}

async function getTestOrganization(client, input) {
  const queryOrg = `query ($name: String, $id: ID) {
    organizations(
        name: $name
        id: $id
        nameMatch: contains
        status: active
  ) {
      records {
        id
        guid
        name
        status
        rootFolder {
          id
          name
          description
        }
        jsondata
        users {
          records {
            name
            email
            id
            organizationGuid
            organizationId
            authGroups {
              records {
                id
                name
                description
              }
            }
          }
        }
      }
    }
  }`;

  const { gqlClient, options } = client;
  const result = await gqlClient.query(queryOrg, input, options);
  return result.organizations && result.organizations.records ? result.organizations.records : [];
}

async function deleteOrganization(client, orgId) {
  const query = `
  mutation updateOrg {
    updateOrganization (input: {
      id: "${orgId}"
      status: "deleted"
    }){
        id
        status
      }
  }`;
  const { gqlClient, options } = client;
  return await gqlClient.query(query, {}, options);
}

async function modifyRBACFeature(client, orgId, value) {
  const query = `mutation {
          updateOrganization(input: {
            id: "${orgId}"
            metadata: {
              features: {
                enableRBACFeature: "${value}"
              }
            }
          }) {
            id
            guid
            name
            type
            jsondata
          }
        }`;
  const { gqlClient, options } = client;
  return await gqlClient.query(query, {}, options);
}

async function updateOrganization(client, input) {
  const query = `mutation ($name: String, $id: ID!, $businessUnit: String, $jsondata: JSONData, $remainingBudget: Int, $isLimitEnforced: Boolean,
    $applicationAccess: [SetOrganizationApplicationAccess!]
  ) {
          updateOrganization(input: {
          id: $id
          name: $name
          businessUnit: $businessUnit
          metadata: $jsondata
          remainingBudget: $remainingBudget
          isLimitEnforced: $isLimitEnforced
          applicationAccess: $applicationAccess
        }) {
          id
          guid
          name
          applications {
            records {
              id
              name
              key
            }
          }
          type
          jsondata
          remainingBudget
          isLimitEnforced
          businessUnit
          users {
            records {
              name
              id
              organizationGuid
              organizationId
              organizationGuids
              authGroups {
                records {
                  id
                  name
                  description
                }
              }
              roles{
                id
              } 
              status
            }
          }
          }
        }`;

  const { gqlClient, options } = client;
  const result = await gqlClient.query(query, input, options);
  return result.updateOrganization;
}

async function orgSetup(orgPrefix, client, input, forceCreate = false) {
  if (forceCreate === true) {
    return await createTestOrganization(client, input);
  }

  // first check for existing org
  const existingOrgs = await getTestOrganization(client, {
    name: `${orgPrefix}`
  }); // for example, 'userGroup-org-testing'

  //if org exists, get the first one with status is 'active'
  if (existingOrgs.length > 0) {
    const activeOrg = existingOrgs.find((org) => org.status === 'active');
    if (activeOrg) {
      return activeOrg;
    }
  }

  // if no active org found, create a new one
  const newOrg = await createTestOrganization(client, input);
  if (newOrg && newOrg.id) {
    return newOrg;
  } else {
    throw new Error('Failed to create organization');
  }
}

async function findOrgWithFilter(client, filterOption) {
  const queryOrg = `query findOrg (
    $id: ID, $limit: Int, $offset: Int, $name: String, $nameMatch: StringMatch, 
    $kvpProperty: String, $kvpValue: String, $status: OrganizationStatus
  ) {
    organizations(
      id: $id, limit: $limit, offset: $offset, name: $name, nameMatch: $nameMatch, 
      kvpProperty: $kvpProperty, kvpValue: $kvpValue, status: $status
  ) {
      records {
        id
        guid
        name
        status
        rootFolder {
          id
          name
          description
        }
        jsondata
        users {
          records {
            name
            id
            organizationGuid
            organizationId
            authGroups {
              records {
                id
                name
                description
              }
            }
          }
        }
      }
    }
  }`;

  const { gqlClient, options } = client;
  const result = await gqlClient.query(queryOrg, filterOption, options);
  return result.organizations && result.organizations.records ? result.organizations.records : [];
}

async function setupTestOrgAndUser(client, orgAndUserInput, filterOrgs, options) {
  // find or create org
  const { orgInput, userInputs } = orgAndUserInput;
  let orgData;
  if (filterOrgs) {
    orgData = (await findOrgWithFilter(client, filterOrgs))[0];
  }

  if (!orgData) {
    orgData = await createTestOrganization(client, orgInput);
  }

  // If requested, clear adminSeatLimit before creating users to avoid seat limit errors.
  if (options && options.clearAdminSeatLimit && client.superAdminToken && client.gqlClient && client.gqlClient.authUrl) {
    const orgDetails = await helpers.getOrganization(client.gqlClient.authUrl, orgData.id, client.superAdminToken);
    await helpers.updateOrganization(client.gqlClient.authUrl, orgData.id, client.superAdminToken, {
      ...orgDetails,
      adminSeatLimit: null
    });
  }

  // create users
  const userInputsWithOrgId = userInputs.map((user) => {
    user.orgId = orgData.id;
    return user;
  });
  const usersData = await userHelpers.createMultiUser(client, userInputsWithOrgId);

  // login users
  const impersonateInputs = usersData.map((user) => ({
    key: user.key,
    username: user.name,
    id: user.id,
    email: user.email,
    organizationGuid: user.organization.guid
  }));
  const listOptions = await userHelpers.impersonateMultiUsers(client, impersonateInputs);

  // get org again
  const orgDataRes = await getTestOrganization(client, {
    name: orgData.name,
    id: orgData.id
  });
  orgData = orgDataRes[0];

  return {
    org: orgData,
    listOptions
  };
}

async function helpFetchOrgAppsAndRoles(client, id) {
  const { gqlClient, options } = client;

  const query = `
    query fetchOrgAppsAndRoles($id: ID!){
      organization(id: $id){
        id
        name
        applications {
          records {
            id
            name
            isPublic
            status
          }
        }
        roles(isAppEventRole: false) {
          id
          name
          appName
          description
        }
      }
    }`;

  return gqlClient.query(query, { id }, options);
}

module.exports = {
  createTestOrganization,
  getTestOrganization,
  deleteOrganization,
  modifyRBACFeature,
  updateOrganization,
  orgSetup,
  findOrgWithFilter,
  setupTestOrgAndUser,
  helpFetchOrgAppsAndRoles
};
