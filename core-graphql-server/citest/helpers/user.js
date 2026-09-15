const _ = require('lodash');
const chakram = require('chakram');
const helpers = require('./index');
const config = helpers.config;
const roles = {
  superAdmin: '3459c3de-493f-443a-8ad0-ddb9f3f6c76d',
  orgAdmin: 'ddca9b68-d775-4934-8ffd-7aecc779b652'
};

async function createUser(client, input) {
  const queryUser = `mutation {
    createUser(input: {
        name: "${input.name}"
        password: "${input.password}"
        organizationId: "${input.orgId}"
        firstName: "Flow-User"
        lastName: "For-Test"
        roleIds: ${JSON.stringify(input.rolesIds)}
        })  {
          id
          name
          firstName
          lastName
        }
    }
`;
  const { gqlClient, options } = client;
  const result = await gqlClient.query(queryUser, null, options);
  const user = result.createUser;
  expect(user.id).toBeDefined();
  return user;
}

async function loginUser(client, input) {
  const query = `mutation($userName: String!, $password: String!, $organizationGuid: ID) {
            userLogin(input: {
              userName: $userName
              password: $password
              organizationGuid: $organizationGuid
            }) {
              token
              apiToken
              user {
                id
                name
              }
              organization {
                id
                guid
                jsondata
              }
            }
          }`;
  const { gqlClient, options } = client;
  const result = await gqlClient.query(query, input);
  const loginInfo = result.userLogin;
  expect(loginInfo.token).toBeDefined();
  expect(loginInfo.organization).toBeDefined();
  return loginInfo;
}

async function deleteUser(client, userId) {
  const query = `mutation {
        deleteUser(id: "${userId}")  {
          id
        }
      }`;
  const { gqlClient } = client;
  const result = await gqlClient.query(query);
  const userDeleted = result.deleteUser;
  expect(userDeleted.id).toEqual(userId);
  return userDeleted;
}

async function deleteMultiUser(client, userIds) {
  const validIds = userIds.filter((id) => id);
  const deleteUsersQuery = `mutation {
    ${validIds.map(
      (id, index) => `delete${index}: deleteUser(id: "${id}")  {
        id
      }`
    )}
  }`;

  const { gqlClient } = client;
  const result = await gqlClient.query(deleteUsersQuery);
  return validIds.map((id, index) => result[`delete${index}`]);
}

async function createMultiUser(client, userInputs) {
  const { gqlClient } = client;
  const createUsersQuery = `mutation createUser {
    ${userInputs.map(
      (user) =>
        `${user.key}: createUser(input: {
          name: "${user.name}"
          password: "testUserPassword"
          ${user.email ? `email: "${user.email}"` : ''}
          organizationId: ${user.orgId}
          roleIds: ${JSON.stringify(user.roleIds)}
        })  {
          id
          name
          email
          organization {
            id
            guid
            jsondata
          }
        }`
    )}
  }`;

  const createUsersRes = await gqlClient.query(createUsersQuery);

  return userInputs.map((user) => {
    return {
      key: user.key,
      ...createUsersRes[user.key]
    };
  });
}

async function impersonateUser(client, user) {
  const { superAdminToken } = client;
  const url = `${config.core_admin_url}/admin/impersonate/${user.id}/${user.organizationGuid}`;
  const options = helpers.requestOptions(superAdminToken);
  const impersonated = await chakram.get(url, options);
  expect(_.get(impersonated, 'body.token')).toBeDefined();
  const userToken = _.get(impersonated, 'body.token');

  return {
    key: user.key,
    userId: user.id,
    username: user.username,
    email: user.email,
    token: userToken,
    requestOptions: helpers.requestOptions(userToken)
  };
}

async function impersonateMultiUsers(client, loginInputs) {
  const listLoginRes = await Promise.all(
    loginInputs.map((user) => {
      const input = {
        key: user.key,
        id: user.id,
        username: user.username,
        email: user.email,
        organizationGuid: user.organizationGuid
      };
      return impersonateUser(client, input);
    })
  );

  return listLoginRes;
}

async function getMyInfo(client) {
  const { gqlClient, options } = client;

  const meGql = `
  query {
    me {
      id
      name
      organization {
        id
        guid
        jsondata
      }
      authGroupIds
      authGroups {
        records {
          id
          name
          authClass
          parentGroups {
            records {
              id
              name
              description
            }
          }
          permissionSet{
            id
            name
            permissions
          }
          appRole {
            description
            permissions {
              records {
                id
                name
                __typename
              }
            }
          }
        }
      }
    }
  }`;

  return gqlClient.query(meGql, {}, options);
}

async function getUsers(client, input) {
  const { gqlClient, options } = client;

  const query = `
    query users (
      $id: ID
      $ids: [ID]
      $name: String
      $organizationIds: [ID]
      $offset: Int = 0
      $limit: Int = 30
      $includeAllOrgUsers: Boolean
      $dateTimeFilter: [UsersDateTimeFilter!]
      $status: UserStatus
      $statuses: [UserStatus!]
      $roleIds: [ID]
    ) {
      users (
        id: $id
        ids: $ids
        name: $name
        organizationIds: $organizationIds
        offset: $offset
        limit: $limit
        includeAllOrgUsers: $includeAllOrgUsers
        dateTimeFilter: $dateTimeFilter
        status: $status
        statuses: $statuses
        roleIds: $roleIds
      ) {
        records {
          name
          id
          email
          status
          organizationInvites {
            id
            status
            organization {
              guid
            }
          }
        }
      }
    }`;

  return gqlClient.query(query, input, options);
}

async function removeUserFromOrg(client, input) {
  const { gqlClient, options } = client;

  const query = `
    mutation removeUserFromOrganization (
      $userId: ID
      $userName: String
      $organizationGuid: ID!
    ) {
      removeUserFromOrganization (
        userId: $userId
        userName: $userName
        organizationGuid: $organizationGuid
      ){
        id
        name
      }
    }`;

  return gqlClient.query(query, input, options);
}

async function helpCreateUser(client, input) {
  const queryUser = `mutation (
      $name: String!, $jsondata: JSONData, $requestorId: ID, $password: String, $passwordHash: String, $organizationId: ID!, $sendNewUserEmail: Boolean,
      $email: String, $roleIds: [ID!], $acls: [UserACLInput!], $firstName: String, $lastName: String, $userId: ID, $authGroupIds: [ID!], 
    ) {
    createUser(input: {
        name: $name
        jsondata: $jsondata
        requestorId: $requestorId
        password: $password
        passwordHash: $passwordHash
        organizationId: $organizationId
        sendNewUserEmail: $sendNewUserEmail
        email: $email
        roleIds: $roleIds
        acls: $acls
        firstName: $firstName
        lastName: $lastName
        userId: $userId
        authGroupIds: $authGroupIds
        })  {
          id
          name
          firstName
          lastName
          jsondata
        }
    }
`;
  const { gqlClient, options } = client;
  const result = await gqlClient.query(queryUser, input, options);
  return _.get(result, 'createUser');
}

async function helpAddUserToOrg(client, input) {
  const { gqlClient, options } = client;

  const query = `
    mutation add ( 
      $userId: ID, $userName: String, $organizationGuid: ID!, $roleIds: [ID], $priority: Int 
    ){
      addUserToOrganization(
        userId: $userId
        userName: $userName
        organizationGuid: $organizationGuid
        roleIds: $roleIds
        priority: $priority
      ){
        id
        name
        organizationGuids
      }
    }`;

  const result = await gqlClient.query(query, input, options);
  return _.get(result, 'addUserToOrganization');
}

module.exports = {
  createUser,
  loginUser,
  deleteUser,
  roles,
  createMultiUser,
  impersonateMultiUsers,
  impersonateUser,
  deleteMultiUser,
  getMyInfo,
  getUsers,
  removeUserFromOrg,
  helpCreateUser,
  helpAddUserToOrg
};
