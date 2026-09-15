import { gql } from 'graphql-request';

// Organization management operations

export const GET_ORGANIZATIONS = gql`
  query organizations(
    $id: ID
    $limit: Int
    $offset: Int
    $name: String
    $nameMatch: StringMatch
    $kvpProperty: String
    $kvpValue: String
    $status: OrganizationStatus
  ) {
    organizations(
      id: $id
      limit: $limit
      offset: $offset
      name: $name
      nameMatch: $nameMatch
      kvpProperty: $kvpProperty
      kvpValue: $kvpValue
      status: $status
    ) {
      records {
        id
        name
        status
        guid
        type
        jsondata
        seatLimit
        rootFolder {
          id
          name
          description
        }
        applications {
          records {
            name
            id
            applicationRoles {
              id
            }
          }
        }
        users {
          records {
            name
            id
            email
            organizationGuid
            organizationId
            organizationGuids
            status
            roles {
              id
            }
            authGroups {
              records {
                id
                name
                description
              }
            }
            roles {
              id
            }
            status
          }
        }
      }
      count
      limit
      offset
    }
  }
`;

export const GET_ORGANIZATION = gql`
  query organization(
    $id: ID!
    $organizationInviteId: ID
    #$inviteStatuses: [OrganizationInviteStatus]
    $inviteType: OrganizationInviteType
    $email: String
  ) {
    organization(id: $id) {
      organizationInvites(
        organizationInviteId: $organizationInviteId
        #statuses: $inviteStatuses
        inviteType: $inviteType
        email: $email
      ) {
        id
        status
        email
        inviteType
        userDetails
        createdBy {
          id
          name
          email
        }
      }
      isUserPendingMember
      guid
      id
      name
      type
      roles {
        id
        name
        description
      }
      jsondata
      seatLimit
      applications(limit: 5) {
        records {
          name
          id
        }
      }
      users(limit: 5) {
        records {
          id
          name
        }
      }
      rootFolder(type: cms) {
        id
      }
      dashboards {
        index
        title
        description
        active
        filters
        type
        qlikAppId
        qlikSheetId
        thumbnail
      }
      seats
    }
  }
`;

/**
 * Narrow single-organization lookup used by the auth/admin citests.
 *
 * Mirrors the legacy admin.spec.js `organization(id:)` selection set. Unlike
 * `GET_ORGANIZATION` it omits `organizationInvites`, whose `createdBy` resolves
 * to null for invites created by since-deleted users on long-lived shared orgs
 * and makes the server return a non-nullable-field error next to an otherwise
 * complete payload. Specs that assert on invites should keep using
 * `GET_ORGANIZATION`.
 */
export const GET_ORGANIZATION_DETAILS = gql`
  query organizationDetails($id: ID!) {
    organization(id: $id) {
      id
      name
      jsondata
      seatLimit
      applications(limit: 5) {
        records {
          name
          id
        }
      }
      users(limit: 5) {
        records {
          id
          name
        }
      }
      rootFolder(type: cms) {
        id
      }
      dashboards {
        index
        title
        description
        active
        filters
        type
        thumbnail
      }
      seats
    }
  }
`;

export const CREATE_ORGANIZATION = gql`
  mutation createOrganization($input: CreateOrganization!) {
    createOrganization(input: $input) {
      id
      guid
      name
      type
      jsondata
      seatLimit
      status
      createdDateTime
      modifiedDateTime
      remainingBudget
      isLimitEnforced
    }
  }
`;

export const UPDATE_ORGANIZATION = gql`
  mutation updateOrganization($input: UpdateOrganization!) {
    updateOrganization(input: $input) {
      id
      name
      guid
      type
      jsondata
      seatLimit
      businessUnit
      modifiedDateTime
      remainingBudget
      isLimitEnforced
      status
      applications {
        records {
          id
          name
        }
      }
      users {
        records {
          name
          id
          organizationGuid
          organizationId
          organizationGuids
          status
          roles {
            id
          }
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
`;

/**
 * Billing-plan view of an organization. Deliberately narrow (rather than adding
 * these fields to GET_ORGANIZATION, whose broad selection set pulls invites,
 * users, folders and dashboards) so billing assertions do not depend on any of
 * that unrelated surface resolving.
 */
export const GET_ORGANIZATION_BILLING = gql`
  query organizationBilling($id: ID!) {
    organization(id: $id) {
      id
      billingDirty
      billingPlanId
      createdDateTime
      modifiedDateTime
    }
  }
`;

export const UPDATE_ORGANIZATION_BILLING = gql`
  mutation updateOrganizationBilling(
    $targetOrganizationId: ID
    $planId: String!
  ) {
    updateOrganizationBilling(
      targetOrganizationId: $targetOrganizationId
      planId: $planId
    ) {
      organizationId
      planId
    }
  }
`;

export const CREATE_ORG_INVITE = gql`
  mutation createOrgInvite(
    $input: CreateOrganizationInviteInput!
    $includePasswordResetToken: Boolean! = false
  ) {
    createOrganizationInvite(input: $input) {
      id
      email
      status
      message
      userDetails
      passwordResetToken @include(if: $includePasswordResetToken)
      organization {
        id
      }
      invitee {
        email
        name
        imageUrl
      }
      inviteType
      createdBy {
        id
        name
        email
      }
    }
  }
`;

export const UPDATE_ORG_INVITE = gql`
  mutation updateOrgInvite($input: UpdateOrganizationInviteInput!) {
    updateOrganizationInvite(input: $input) {
      id
      email
      organization {
        id
        guid
        name
      }
      invitee {
        email
        name
        imageUrl
      }
      message
      status
      inviteType
      invitationLink
    }
  }
`;

export const REMOVE_USER_FROM_ORG = gql`
  mutation removeUserFromOrganization(
    $userId: ID
    $userName: String
    $organizationGuid: ID!
  ) {
    removeUserFromOrganization(
      userId: $userId
      userName: $userName
      organizationGuid: $organizationGuid
    ) {
      name
      id
      organizationId
      organizationGuid
      organizationGuids
      email
      status
      organizationInvites {
        id
        email
        organization {
          id
          guid
          name
        }
        invitee {
          email
          name
        }
        status
      }
    }
  }
`;

export const DELETE_ORG_INVITE = gql`
  mutation deleteOrganizationInvite($id: ID!) {
    deleteOrganizationInvite(organizationInviteId: $id) {
      id
      message
    }
  }
`;

export const SET_ORGANIZATION_INTEGRATION_CONFIG = gql`
  mutation setOrganizationIntegrationConfig(
    $input: SetOrganizationIntegrationConfig!
  ) {
    setOrganizationIntegrationConfig(input: $input) {
      organizationId
      integrationId
      config
      userVisible
    }
  }
`;

export const DELETE_ORGANIZATION_INTEGRATION_CONFIG = gql`
  mutation deleteOrganizationIntegrationConfig(
    $input: DeleteOrganizationIntegrationConfig!
  ) {
    deleteOrganizationIntegrationConfig(input: $input) {
      organizationId
      integrationId
      message
    }
  }
`;

export const FETCH_ORG_APPS_AND_ROLES = gql`
  query fetchOrgAppsAndRoles($id: ID!) {
    organization(id: $id) {
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
  }
`;
