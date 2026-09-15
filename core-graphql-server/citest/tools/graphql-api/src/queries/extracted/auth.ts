import { gql } from 'graphql-request';
export const GET_AUTH_GROUPS = gql`
  query authGroups(
    $ids: [ID]
    $source: AuthGroupSourceType
    $member: AuthGroupMemberInput
    $modifiedDateTime: AuditDateTimeFilter
    $createdDateTime: AuditDateTimeFilter
    $authClass: [AuthObjectClass]
    $offset: Int = 0
    $nameRegex: String
    $limit: Int
    $appRoleID: ID
    $ownerOrganization: ID
  ) {
    authGroups(
      ids: $ids
      source: $source
      member: $member
      modifiedDateTime: $modifiedDateTime
      createdDateTime: $createdDateTime
      authClass: $authClass
      offset: $offset
      nameRegex: $nameRegex
      limit: $limit
      appRoleID: $appRoleID
      ownerOrganization: $ownerOrganization
    ) {
      records {
        id
        name
        memberCount
        organization {
          id
        }
        appRole {
          id
        }
        members(memberType: User, limit: 15, offset: 0) {
          records {
            member {
              __typename
              ... on User {
                id
              }
            }
          }
        }
      }
    }
  }
`;

// export const CREATE_AUTH_GROUP = gql`
//   mutation authGroupCreate($input: AuthGroupCreateInput!) {
//     authGroupCreate(input: $input) {
//       id
//       name
//       description
//     }
//   }
// `;

// Authentication and token operations

export const USER_LOGIN = gql`
  mutation userLogin($input: UserLogin!) {
    userLogin(input: $input) {
      apiToken
      token
      user {
        id
        name
        jsondata
        roles {
          id
        }
      }
      organization {
        billingUpdatedDatetime
        id
        guid
      }
      groups {
        id
      }
    }
  }
`;

export const VALIDATE_TOKEN = gql`
  mutation validateToken($token: String!) {
    validateToken(token: $token) {
      apiToken
      token
      user {
        name
      }
    }
  }
`;

export const REFRESH_TOKEN = gql`
  mutation refreshToken($token: String!) {
    refreshToken(token: $token) {
      apiToken
      token
      user {
        name
      }
    }
  }
`;

export const GET_TOKENS = gql`
  query tokens {
    tokens {
      id
      applicationId
      groupId
      json {
        rights
      }
    }
  }
`;

export const CREATE_API_TOKEN = gql`
  mutation apiTokenCreate($name: String!, $rights: [AuthPermissionType!]!) {
    apiTokenCreate(name: $name, rights: $rights) {
      id
      details {
        hash
      }
    }
  }
`;

export const CREATE_AUTH_PERMISSION_SET = gql`
  mutation authPermissionSetCreate($input: AuthPermissionSetInput!) {
    authPermissionSetCreate(input: $input) {
      id
      name
      permissions
      organization {
        id
      }
    }
  }
`;

export const DELETE_AUTH_PERMISSION_SET = gql`
  mutation authPermissionSetDelete($id: ID!, $ownerOrganization: ID) {
    authPermissionSetDelete(id: $id, ownerOrganization: $ownerOrganization) {
      id
      message
    }
  }
`;

export const CREATE_AUTH_GROUP = gql`
  mutation CreateAuthGroup($input: AuthGroupCreateInput!) {
    authGroupCreate(input: $input) {
      id
      name
      description
      organization {
        id
      }
    }
  }
`;

export const DELETE_AUTH_GROUP = gql`
  mutation authGroupDelete($id: ID!, $ownerOrganization: ID) {
    authGroupDelete(id: $id, ownerOrganization: $ownerOrganization) {
      id
      message
    }
  }
`;

export const AUTH_GROUP_REMOVE_MEMBERS = gql`
  mutation authGroupRemoveMembers(
    $id: ID!
    $memberIds: [ID!]!
    $ownerOrganization: ID
  ) {
    authGroupRemoveMembers(
      id: $id
      memberIds: $memberIds
      ownerOrganization: $ownerOrganization
    ) {
      id
    }
  }
`;

export const AUTH_GROUP_ADD_MEMBERS = gql`
  mutation authGroupAddMembers(
    $id: ID!
    $members: [AuthGroupMemberInput!]!
    $ownerOrganization: ID
  ) {
    authGroupAddMembers(
      id: $id
      members: $members
      ownerOrganization: $ownerOrganization
    ) {
      id
      name
      description
    }
  }
`;

export const ADD_ACES_TO_RESOURCES = gql`
  mutation addACEsToResources(
    $resourceType: AuthResourceType
    $resourceTypeSchemaId: ID
    $ids: [ID!]!
    $entries: [AuthACEPermissionInput!]!
    $ownerOrganization: ID
  ) {
    addACEsToResources(
      resourceType: $resourceType
      resourceTypeSchemaId: $resourceTypeSchemaId
      ids: $ids
      entries: $entries
      ownerOrganization: $ownerOrganization
    ) {
      records {
        id
        objectType
        member {
          ... on BasicUserInfo {
            id
          }
          ... on AuthGroup {
            id
            name
          }
          memberType: __typename
        }
        permissionSet {
          id
        }
        options
      }
    }
  }
`;

export const MY_RIGHTS = gql`
  query MyRights {
    myRights {
      operations
      resources
    }
  }
`;

export const GET_AUTH_PERMISSION_SETS = gql`
  query authPermissionSets(
    $ids: [ID!]
    $nameRegex: String
    $ownerOrganization: ID
    $applicationID: ID
    $roleID: ID
    $modifiedDateTime: DateTime
    $createdDateTime: DateTime
    $hasPermissions: [AuthPermissionType!]
    $authClass: [AuthObjectClass]
    $offset: Int = 0
    $limit: Int = 30
  ) {
    authPermissionSets(
      ownerOrganization: $ownerOrganization
      roleID: $roleID
      authClass: $authClass
      hasPermissions: $hasPermissions
      modifiedDateTime: $modifiedDateTime
      createdDateTime: $createdDateTime
      applicationID: $applicationID
      ids: $ids
      nameRegex: $nameRegex
      offset: $offset
      limit: $limit
    ) {
      records {
        id
        name
        permissions
        organization {
          id
        }
        applicationRole {
          id
        }
      }
    }
  }
`;

export const PERMISSIONS = gql`
  query getPermissions(
    $limit: Int = 30
    $id: ID
    $name: String
    $offset: Int = 0
  ) {
    permissions(limit: $limit, id: $id, name: $name, offset: $offset) {
      records {
        id
        name
        description
      }
      count
      limit
      offset
    }
  }
`;

export const CREATE_PASSWORD_UPDATE_REQUEST = gql`
  mutation createPasswordUpdateRequest($input: CreatePasswordUpdateRequest) {
    createPasswordUpdateRequest(input: $input) {
      id
    }
  }
`;

export const GET_CURRENT_USER_PASSWORD_TOKEN = gql`
  mutation getCurrentUserPasswordToken($input: GetCurrentUserPasswordToken!) {
    getCurrentUserPasswordToken(input: $input) {
      passwordToken
    }
  }
`;

export const UPDATE_CURRENT_USER = gql`
  mutation updateCurrentUser($input: UpdateCurrentUser!) {
    updateCurrentUser(input: $input) {
      id
      name
      userSettings {
        key
        value
      }
    }
  }
`;

export const BASIC_USER_INFO = gql`
  query basicUserInfo($id: ID!) {
    basicUserInfo(id: $id) {
      id
      name
      firstName
      lastName
      email
      imageUrl
    }
  }
`;

export const GET_GROUPS = gql`
  query groups(
    $ids: [ID]
    $id: ID
    $name: String
    $organizationIds: [ID]
    $offset: Int = 0
    $limit: Int = 30
  ) {
    groups(
      ids: $ids
      id: $id
      name: $name
      organizationIds: $organizationIds
      offset: $offset
      limit: $limit
    ) {
      records {
        id
        name
        organization {
          id
        }
      }
    }
  }
`;

export const API_TOKEN_UPDATE = gql`
  mutation apiTokenUpdate($hash: String!, $input: ApiTokenUpdateInput!) {
    apiTokenUpdate(hash: $hash, input: $input) {
      revoked
    }
  }
`;

export const USER_LOGOUT = gql`
  mutation userLogout($token: String!, $sessionExpired: Boolean = false) {
    userLogout(token: $token, sessionExpired: $sessionExpired)
  }
`;

export const SWITCH_USER_TO_ORGANIZATION = gql`
  mutation switchUserToOrganization(
    $token: String!
    $userName: String!
    $organizationGuid: ID!
  ) {
    switchUserToOrganization(
      token: $token
      userName: $userName
      organizationGuid: $organizationGuid
    ) {
      apiToken
      token
      organization {
        id
        guid
      }
    }
  }
`;

export const REMOVE_ACES_FROM_RESOURCE = gql`
  mutation removeACEsFromResource(
    $resourceType: AuthResourceType!
    $ids: [ID!]!
    $ownerOrganization: ID
    $resourceTypeSchemaId: ID
  ) {
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
  }
`;

export const AUTH_PERMISSIONSET_UPDATE = gql`
  mutation authPermissionSetUpdate($input: AuthPermissionSetUpdateInput!) {
    authPermissionSetUpdate(input: $input) {
      id
      name
      description
      permissions
    }
  }
`;

export const AUTH_GROUP_UPDATE = gql`
  mutation authGroupUpdate($input: AuthGroupUpdateInput!) {
    authGroupUpdate(input: $input) {
      id
      name
    }
  }
`;
