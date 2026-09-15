const _ = require('lodash');

async function helpCreateOrgInvite(client, input) {
  const { gqlClient, options } = client;

  const createOrgInviteQuery = `mutation invite (
    $organizationId: ID!
    $email: String!
    $message: String
    $applicationRoles: [ApplicationInviteRoleInput!]!
    $authGroupIds: [ID]
    $userDetails: JSONData
    $disableAutoApproval: Boolean
    $requestToJoinOrganization: Boolean
  ) {
    createOrganizationInvite (input: {
      organizationId: $organizationId
      email: $email
      message: $message
      applicationRoles: $applicationRoles
      authGroupIds: $authGroupIds
      userDetails: $userDetails
      disableAutoApproval: $disableAutoApproval
      requestToJoinOrganization: $requestToJoinOrganization
    }) {
      id
      email
      audit {
        action
        actor
        priorStatus
      }
      organization {
        id
        guid
      }
      invitee {
        name
        email
      }
      status
      inviteType
      ${input.passwordResetToken ? 'passwordResetToken' : ''}
      userDetails
    }
  }`;

  return gqlClient.query(createOrgInviteQuery, input, options);
}

async function helpDeleteOrgInvite(client, id) {
  const { gqlClient, options } = client;

  const deleteOrgInviteQuery = `mutation deleteOrgInvite ($id: ID!) {
    deleteOrganizationInvite(organizationInviteId: $id){
      message
      id
    }
  }`;

  return gqlClient.query(deleteOrgInviteQuery, { id }, options);
}

async function helpUpdateOrgInvite(client, input) {
  const { gqlClient, options } = client;

  const updateOrgInviteQuery = `mutation updateInv (
    $organizationInviteId: ID!
    $message: String
    $applicationRoles: [ApplicationInviteRoleInput!]!
    $action: OrganizationInviteAction
  ) {
    updateOrganizationInvite (
      input: {
        organizationInviteId: $organizationInviteId
        message: $message
        applicationRoles: $applicationRoles
        action: $action
      }
    ){
      id
      email
      audit {
        action
        actor
        priorStatus
      }
      organization {
        id
        guid
      }
      applicationRoles {
        application {
          id
        }
        role {
          id
        }
      }
      invitee {
        name
        email
      }
      status
    }
  }`;

  return gqlClient.query(updateOrgInviteQuery, input, options);
}

async function helpGetOrgInviteByOrgId(client, input) {
  const { gqlClient, options } = client;
  const { inviteStatuses, passwordResetToken } = input;

  let statusString = '';
  if (!_.isEmpty(inviteStatuses)) {
    statusString = inviteStatuses.join(',');
  }

  const fetchOrgInviteQuery = `query fetchOrgInvite (
    $orgId: ID!
    $organizationInviteId: ID
    #$inviteStatuses: [OrganizationInviteStatus]
    $inviteType: OrganizationInviteType
    $email: String
  ) {
    organization (id: $orgId) {
      organizationInvites (
        organizationInviteId: $organizationInviteId
        #statuses: $inviteStatuses
        ${statusString ? `statuses: [${statusString}]` : ''}
        inviteType: $inviteType
        email: $email
      ) {
        id
        status
        email
        ${passwordResetToken ? 'passwordResetToken' : ''}
        userDetails
        expirationDate
        invitationLink
      }
    }
  }`;

  return gqlClient.query(fetchOrgInviteQuery, input, options);
}

async function helpGetOrgInviteOfUser(client, input) {
  const { gqlClient, options } = client;

  const fetchOrgInviteOfUserQuery = `
  query lookupUsersByEmail($name: String){
    users(name: $name includeAllOrgUsers:true){
      records {
        id  
        name
        email: name
        firstName
        lastName
        status
        organizationGuids
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

  return gqlClient.query(fetchOrgInviteOfUserQuery, input, options);
}

async function helpResetPasswordInvite(input) {
  let { baseUrl, invitation, userName, password, ApiPath } = input;
  if (!baseUrl) {
    baseUrl = config.core_admin_url;
  }

  if (!ApiPath) {
    ApiPath = '/admin/org-invite/password/reset';
  }
  const supertest = require('supertest')(baseUrl);
  const res = await supertest
    .post(ApiPath)
    .set('Content-Type', 'application/json')
    .send({
      userName: userName,
      password: password,
      token: invitation.passwordResetToken,
      organizationInviteId: invitation.id
    });

  return res;
}

async function helpGetMyInvitation(client) {
  const { gqlClient, options } = client;
  const query = `query me {
    me {
      id
      name
      email
      status
      organizationInvites {
        id
        email
        status
        organization {
          guid
        }
      }
    }
  }`;

  return gqlClient.query(query, {}, options);
}

module.exports = {
  helpCreateOrgInvite,
  helpDeleteOrgInvite,
  helpUpdateOrgInvite,
  helpGetOrgInviteByOrgId,
  helpGetOrgInviteOfUser,
  helpResetPasswordInvite,
  helpGetMyInvitation
};
