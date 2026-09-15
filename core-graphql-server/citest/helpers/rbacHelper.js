const _ = require('lodash');

async function helpRemoveRbac(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `mutation removeACE ( $resourceType: AuthResourceType!, $ids: [ID!]!, $ownerOrganization: ID, $resourceTypeSchemaId: ID ) {
      removeACEsFromResource(
        resourceType: $resourceType
        ids: $ids
        ownerOrganization: $ownerOrganization
        resourceTypeSchemaId: $resourceTypeSchemaId
      ) {
        records {
          id
        }
      }
    }`,
    input,
    options
  );
}

async function helpGetAuthPermissions(client, input) {
  const { gqlClient, options } = client;
  const result = await gqlClient.query(
    `query authPermissionSets ($roleID: ID, $nameRegex: String, $ownerOrganization: ID, $authClass: [AuthObjectClass]) {
      authPermissionSets(
        roleID: $roleID
        nameRegex: $nameRegex
        ownerOrganization: $ownerOrganization
        authClass: $authClass
      ) {
        records {
          id
          name
          organization {
            id
          }
          applicationRole {
            id
          }
        }
      }
    }`,
    input,
    options
  );

  return _.get(result, 'authPermissionSets.records');
}

async function helpGetGroup(client) {
  const { gqlClient, options } = client;
  const getGroupRes = await gqlClient.query(
    `query getGroup {
      authGroups {
        records {
          id
          name
        }
      }
    }`,
    {},
    options
  );

  return _.get(getGroupRes, 'authGroups.records');
}

async function helpAddACEsToResources(client, input) {
  const { gqlClient, options } = client;
  const { entries } = input;
  let entriesString = '';
  if (!_.isEmpty(entries)) {
    entriesString = entries.reduce((query, record) => {
      let options = '';
      if (record.options) {
        options = `options: [${record.options.map((e) => `"${e}"`)}]`;
      }
      query += `
        {
          member: {
            id: "${record.member.id}"
            memberType: ${record.member.memberType}
          }
          permissionSetID: "${record.permissionSetID}"
          ${options}
        },`;

      return query;
    }, ``);
  }

  const query = `mutation addRole ($ids: [ID!]!, $resourceType: AuthResourceType, $ownerOrganization: ID, $resourceTypeSchemaId: ID
      ) {
      addACEsToResources(
        resourceType: $resourceType
        ids: $ids
        resourceTypeSchemaId: $resourceTypeSchemaId
        ownerOrganization: $ownerOrganization
        ${entriesString ? `entries: [${entriesString}]` : ''}
      ) {
        records {
          id
          objectType
          member {
            ... on BasicUserInfo {id}
            ... on AuthGroup {id name}
            memberType: __typename
          }
          permissionSet {
            id
          }
          options
        }
      }
    }`;

  const result = await gqlClient.query(query, input, options);

  return result;
}

async function helpGetAclForResources(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `query getACL (
      $resourceType: AuthResourceType!, $ids: [ID]!, $offset: Int, $limit: Int
      $permissions: [AuthPermissionType!], $requireAll: Boolean, $ownerOrganization: ID
    ) {
      getACLForResources(
        ids: $ids
        resourceType: $resourceType
        requireAll: $requireAll
        ownerOrganization: $ownerOrganization
        permissions: $permissions
        offset: $offset
        limit: $limit
      ) {
        records {
          id
          memberType: __typename
          member {
            ... on BasicUserInfo { id }
            ... on AuthGroup { id }
            memberType: __typename
          }
          permissionSet {
            id
          }
          options
        }
      }
    }`,
    input,
    options
  );
}

async function helpDeleteAuthPermissionSet(client, input) {
  const { gqlClient, options } = client;
  return await gqlClient.query(
    `mutation deleteAuthPermissionSet ($id: ID!, $ownerOrganization: ID) {
      authPermissionSetDelete(
        id: $id
        ownerOrganization: $ownerOrganization
      ) {
        id
      }
    }`,
    input,
    options
  );
}

async function helpDeleteAuthGroup(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `mutation deleteAuthGroup ( $id: ID!, $ownerOrganization: ID ) {
      authGroupDelete(
        id: $id
        ownerOrganization: $ownerOrganization
      ) { id }
    }`,
    input,
    options
  );
}

async function helpCreateAuthPermissionSet(client, input) {
  const { gqlClient, options } = client;
  const { permissions } = input;

  let permissionString = '';
  if (!_.isEmpty(permissions)) {
    permissionString = `permissions: [${permissions.map((e) => e)}]`;
  }

  const query = `
    mutation addPermSet (
      $name: String!
      $description: String!
      #$permissions: [AuthPermissionType!]!
      $organizationID: ID
      $applicationID: ID
      $roleID: ID
      $authClass: AuthObjectClass
      $isProtected: Boolean
    ) {
      authPermissionSetCreate(
        input: {
          name: $name
          description: $description
          ${permissionString}
          organizationID: $organizationID
          applicationID: $applicationID
          roleID: $roleID
          authClass: $authClass
          isProtected: $isProtected
        }
      ) {
        id
        name
        permissions
      }
    }
  `;

  return gqlClient.query(query, input, options);
}

async function helpCreateAuthGroup(client, input) {
  const { gqlClient, options } = client;

  const result = await gqlClient.query(
    `mutation authGroupCreate ($input: AuthGroupCreateInput!) {
      authGroupCreate(
        input: $input
      ) {
        id
        name
        description
      }
    }`,
    { input },
    options
  );

  return _.get(result, 'authGroupCreate');
}

async function helpUpdatePermissionSet(client, input) {
  const { gqlClient, options } = client;

  const result = await gqlClient.query(
    `mutation ($input: AuthPermissionSetUpdateInput!) {
      authPermissionSetUpdate(
        input: $input
      ) {
        id
        name
        description
        permissions
      }
    }`,
    { input },
    options
  );

  return _.get(result, 'authPermissionSetUpdate');
}

async function helpCreateAPIToken(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation apiTokenCreate ($name: String!, $rights: [AuthPermissionType]!) {
    apiTokenCreate (name: $name, rights: $rights) {
      id
      details {
        hash
        name
        rights
        revoked
      }
    }
  }`;

  const result = await gqlClient.query(query, input, options);

  return _.get(result, 'apiTokenCreate');
}

module.exports = {
  helpRemoveRbac,
  helpGetAuthPermissions,
  helpGetGroup,
  helpDeleteAuthGroup,
  helpAddACEsToResources,
  helpCreateAuthPermissionSet,
  helpDeleteAuthPermissionSet,
  helpGetAclForResources,
  helpCreateAuthGroup,
  helpUpdatePermissionSet,
  helpCreateAPIToken
};
