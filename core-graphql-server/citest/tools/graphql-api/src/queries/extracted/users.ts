import { gql } from "graphql-request";

// User management operations

export const GET_USERS = gql`
  query users(
    $id: ID
    $ids: [ID!]
    $name: String
    $organizationIds: [ID]
    $offset: Int
    $limit: Int
    $includeAllOrgUsers: Boolean
    $status: UserStatus
    $statuses: [UserStatus!]
    $roleIds: [ID]
  ) {
    users(
      id: $id
      ids: $ids
      name: $name
      organizationIds: $organizationIds
      offset: $offset
      limit: $limit
      includeAllOrgUsers: $includeAllOrgUsers
      status: $status
      statuses: $statuses
      roleIds: $roleIds
    ) {
      records {
        id
        name
        email
        firstName
        lastName
        status
        organizationInvites {
          id
          status
          organization {
            guid
          }
        }
        organization {
          id
          name
          status
        }
        roles {
          name
          id
          permissions {
            records {
              name
              id
            }
          }
        }
        mfaInfo {
          phoneNumber
          smsVoiceVerifiedDateTime
          gaVerifiedDateTime
          defaultOption
        }
      }
      count
      limit
      offset
    }
  }
`;

/**
 * Narrow `users` listing used by the auth/admin citests.
 *
 * Deliberately does NOT select `organizationInvites` the way `GET_USERS` does.
 * Against long-lived shared orgs (e.g. Veritone, Inc.) the invite table
 * accumulates rows whose target organization or `createdBy` user has since been
 * deleted; resolving them makes the server emit a `not_found` /
 * "Cannot return null for non-nullable field BasicUserInfo.id" error alongside
 * an otherwise-complete payload, and graphql-request throws on any non-empty
 * `errors` array. Specs that need invite data should keep using `GET_USERS`.
 *
 * The selection set is the union of the four legacy admin.spec.js `users(...)`
 * queries (by id, by ids, by roleIds), so one operation covers all of them.
 */
export const GET_USERS_WITH_ROLES = gql`
  query usersWithRoles(
    $id: ID
    $ids: [ID!]
    $name: String
    $roleIds: [ID]
    $offset: Int
    $limit: Int
  ) {
    users(
      id: $id
      ids: $ids
      name: $name
      roleIds: $roleIds
      offset: $offset
      limit: $limit
    ) {
      records {
        id
        name
        organization {
          id
          name
          status
        }
        roles {
          name
          id
          permissions {
            records {
              name
              id
            }
          }
        }
        mfaInfo {
          phoneNumber
          smsVoiceVerifiedDateTime
          gaVerifiedDateTime
          defaultOption
        }
      }
      count
      limit
      offset
    }
  }
`;

export const GET_USER = gql`
  query user($id: ID!, $organizationIds: [ID!]) {
    user(id: $id, organizationIds: $organizationIds) {
      id
      name
      email
      firstName
      lastName
      status
      passwordUpdatedDateTime
      modifiedDateTime
      createdDateTime
      organization {
        id
        guid
        name
        status
      }
      roles {
        name
        id
        permissions {
          records {
            name
            id
          }
        }
      }
      rootFolder(type: watchlist) {
        id
      }
    }
  }
`;

export const GET_USERS_BY_NAME = gql`
  query usersByName($name: String!) {
    users(name: $name) {
      records {
        id
        name
        organization {
          id
          name
        }
      }
    }
  }
`;

export const GET_CURRENT_USER = gql`
  query me(
    $notificationsOrderBy: NotificationDateTimeField
    $notificationsOrderDirection: OrderDirection
    $notificationsFlags: [NotificationFlag!]
    $notificationsLimit: Int
  ) {
    me {
      id
      name
      firstName
      lastName
      imageUrl
      status
      organizationId
      authGroupIds
      notifications(
        orderBy: $notificationsOrderBy
        orderDirection: $notificationsOrderDirection
        flags: $notificationsFlags
        limit: $notificationsLimit
      ) {
        count
      }
      authGroups {
        records {
          id
          name
        }
      }
      organization {
        id
        guid
        name
        status
        jsondata
        internalApplicationId
        jsondata
        notifications(
          orderBy: $notificationsOrderBy
          orderDirection: $notificationsOrderDirection
          flags: $notificationsFlags
          limit: $notificationsLimit
        ) {
          count
        }
      }
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
          permissionSet {
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
      roles {
        name
        id
        permissions {
          records {
            name
            id
          }
        }
      }
      mfaInfo {
        phoneNumber
        smsVoiceVerifiedDateTime
        gaVerifiedDateTime
        defaultOption
      }
      userSettings {
        key
        value
      }
    }
  }
`;

export const GET_CURRENT_USER_SIMPLE = gql`
  query meBasic {
    me {
      id
      name
      organizationId
      organizationGuid
      organizationGuids
      roles {
        name
        id
        permissions {
          records {
            name
            id
          }
        }
      }
    }
  }
`;

export const CREATE_USER = gql`
  mutation createUser($input: CreateUser!) {
    createUser(input: $input) {
      id
      name
      email
      organizationId
      organization {
        id
      }
      roles {
        id
        name
      }
      firstName
      lastName
      jsondata
    }
  }
`;

export const UPDATE_USER = gql`
  mutation updateUser($input: UpdateUser!) {
    updateUser(input: $input) {
      id
      name
      organizationId
      roles {
        id
      }
      roleIds
      jsondata
      imageUrl
      firstName
      lastName
      email
      title
      developerType
    }
  }
`;

export const DELETE_USER = gql`
  mutation deleteUser($id: ID!) {
    deleteUser(id: $id) {
      id
      message
    }
  }
`;

export const UPDATE_USER_STATUS = gql`
  mutation updateUserStatus($input: UpdateUserStatus!) {
    updateUserStatus(input: $input) {
      id
      status
    }
  }
`;

export const ADD_USER_TO_ORG = gql`
  mutation addUserToOrganization(
    $userId: ID
    $userName: String
    $organizationGuid: ID!
    $roleIds: [ID]
    $priority: Int
  ) {
    addUserToOrganization(
      userId: $userId
      userName: $userName
      organizationGuid: $organizationGuid
      roleIds: $roleIds
      priority: $priority
    ) {
      id
      name
      organizationGuid
      organizationGuids
    }
  }
`;

export const UPDATE_USER_ROLES = gql`
  mutation updateUserRoles($input: UpdateUserRolesInput!) {
    updateUserRoles(input: $input) {
      id
      roleIds
      roles {
        id
        name
      }
    }
  }
`;
