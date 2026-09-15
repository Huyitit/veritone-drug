const helpers = require('../../citest/helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');

const config = helpers.config;
const _ = require('lodash');
const env = config.env;
const uuid = require('uuid');
const chakram = require('chakram');
const orgHelpers = require('../helpers/organization');
const userHelpers = require('../helpers/user.js');
const { safe } = require('../helpers/cleanup/utils.js');
const gqlClient = new GraphqlClient(env);
const MAILPIT_BASE_URL =
  process.env.NODE_ENV === 'test'
    ? 'http://mailpit:8025' // run on ci pipeline
    : 'http://localhost:8025'; // run on local

let applicationOrgId;
let applicationOrgGUID;
let applicationOrgId1;
let applicationOrgGUID1;
let superAdminOptions;
let organizationInviteId, organizationInviteId1;
let regularUser1;

const inviteIds = {
  superAdmin: [],
  orgAdmin: [],
  regular: []
};

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const testUserEmail = `${citestMarker}-test-user-email-${Math.floor(
  Date.now() / 1000
)}@test.com`;
const testUserEmail1 = `${citestMarker}-test-user-email-${Math.floor(
  Date.now() / 1000
)}-1@test.com`;
const testUserEmail2 = `${citestMarker}-test-user-email-${Math.floor(
  Date.now() / 1000
)}-2@test.com`;
const testUserEmail3 = `${citestMarker}-test-user-email-${Math.floor(
  Date.now() / 1000
)}-3@test.com`;
const testUserEmail4 = `${citestMarker}-test-user-email-${Math.floor(
  Date.now() / 1000
)}-4@test.com`;

const nameOrg = citestMarker + '-organization-invite';
const nameOrg1 = citestMarker + '-organization-invite-1';
const adminRole = isDesktopAppEnabled
  ? '032218c3-d47e-4287-9d16-7bb867c01266'
  : 'ddca9b68-d775-4934-8ffd-7aecc779b652';

const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450' // Discovery Editor
  // '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);

let emailCount = 0;
const inviteEmails = new Set();
const createdUserIds = new Set();
const createdInviteIds = new Set();
const createdUserEmails = new Set();

describe('citest_orginvite: Multi Orgs Invitation tests', () => {
  let adminOptions, regularOptions;
  let uniqueEmail;
  let superToken;
  const uniqueId = Date.now().valueOf();

  beforeAll(async () => {
    const result = await gqlClient.connect();
    superToken = result.token;
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    superAdminOptions = helpers.requestOptions(result.token);

    const applicationOrganization = await getOrCreateOrganization({ nameOrg });
    applicationOrgId = applicationOrganization.id;
    applicationOrgGUID = applicationOrganization.guid;

    // create or get admin user
    const { id: adminUserId } = await getOrCreateUser(
      applicationOrganization,
      uniqueId,
      true
    );
    trackCreatedUser(adminUserId);
    adminOptions = await impersonate(
      adminUserId,
      applicationOrgGUID,
      result.token
    );

    // create or get aiware user
    const { id: regularUserId } = await getOrCreateUser(
      applicationOrganization,
      uniqueId,
      false
    );
    trackCreatedUser(regularUserId);
    regularOptions = await impersonate(
      regularUserId,
      applicationOrgGUID,
      result.token
    );

    uniqueEmail = `${citestMarker}+${uniqueId}@veritone.com`;

    // create a new org and user to test the existing user invite flow
    const applicationOrganization1 = await getOrCreateOrganization({
      nameOrg: nameOrg1
    });
    applicationOrgId1 = applicationOrganization1.id;
    applicationOrgGUID1 = applicationOrganization1.guid;

    const regularUser = await getOrCreateUser(
      applicationOrganization1,
      uniqueId,
      false
    );
    regularUser1 = regularUser.name;
    trackCreatedUser(regularUser.id);
  });

  it('Should not found an invitation by email', async () => {
    const query = `query getPendingOrganizationInvites{
      organization(id: "${applicationOrgId}") {
        organizationInvites(statuses: [submitted, approved], email: "${testUserEmail}") {
          id
          email
          status
          expirationDate
        }
        isUserPendingMember(email:"${testUserEmail}")
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.organization.organizationInvites).toBeDefined();
    expect(result.organization.organizationInvites.length).toEqual(0);
    expect(result.organization.isUserPendingMember).toBeDefined();
    expect(result.organization.isUserPendingMember).toEqual(false);
  });

  it('should create and complete an organization invitation flow', async () => {
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${applicationOrgId}"
          message: "test email 1"
          email: "${testUserEmail}"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
            }
          ]
        }
      ) {
        id
        status
        passwordResetToken
      }
    }
      `;
    const result = await gqlClient.query(query, null);
    expect(result.createOrganizationInvite.status).toBeDefined();
    expect(result.createOrganizationInvite.status).toEqual('approved');
    emailCount++;
    inviteEmails.add(testUserEmail);

    organizationInviteId = result.createOrganizationInvite.id;
    trackCreatedInvite(organizationInviteId);
    trackCreatedUserEmail(testUserEmail);

    const passwordResetToken =
      result.createOrganizationInvite.passwordResetToken;
    const requestOptions = helpers.requestOptions(passwordResetToken);
    const updateQuery = ` mutation {
          updateOrganizationInvite(input: {
              organizationInviteId: "${organizationInviteId}"
              action: complete
              applicationRoles: []
          }) {
              id
          }
        }
      `;
    const updateInviteResult = await gqlClient.query(
      updateQuery,
      null,
      requestOptions
    );
    expect(updateInviteResult.updateOrganizationInvite.id).toBeDefined();
  });

  it('get invitation by email and statuses', async () => {
    const query = `query getPendingOrganizationInvites{
      organization(id: "${applicationOrgId}") {
        organizationInvites(statuses: [submitted, approved, completed], email: "${testUserEmail}") {
          id
          email
          status
          expirationDate
        }
        isUserPendingMember(email:"${testUserEmail}")
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.organization).toBeDefined();
    expect(result.organization.organizationInvites).toBeDefined();
    expect(result.organization.organizationInvites.length).toEqual(1);
    expect(result.organization.organizationInvites[0].email).toEqual(
      testUserEmail
    );
    expect(result.organization.isUserPendingMember).toBeDefined();
    expect(result.organization.isUserPendingMember).toEqual(true);
  });

  it('get invitation by email and status and statuses', async () => {
    const query = `query getPendingOrganizationInvites{
      organization(id: "${applicationOrgId}") {
        organizationInvites(status: approved, statuses: [submitted, completed], email: "${testUserEmail}") {
          id
          email
          status
          expirationDate
        }
        isUserPendingMember(email:"${testUserEmail}")
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.organization).toBeDefined();
    expect(result.organization.organizationInvites).toBeDefined();
    expect(result.organization.organizationInvites.length).toEqual(1);
    expect(result.organization.organizationInvites[0].email).toEqual(
      testUserEmail
    );
    expect(result.organization.isUserPendingMember).toBeDefined();
    expect(result.organization.isUserPendingMember).toEqual(true);
  });

  it('Should not be a user member by a new email', async () => {
    const query = `query getPendingOrganizationInvites{
      organization(id: "${applicationOrgId}") {
        isUserPendingMember(email:"xxx${testUserEmail}")
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.organization).toBeDefined();
    expect(result.organization.isUserPendingMember).toBeDefined();
    expect(result.organization.isUserPendingMember).toEqual(false);
  });

  it('get invitation by organizationInviteId', async () => {
    const query = `query getPendingOrganizationInvites{
      organization(id: "${applicationOrgId}") {
        organizationInvites(organizationInviteId:"${organizationInviteId}") {
          id
          email
          status
          expirationDate
        }
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.organization).toBeDefined();
    expect(result.organization.organizationInvites).toBeDefined();
    expect(result.organization.organizationInvites.length).toEqual(1);
    expect(result.organization.organizationInvites[0].email).toEqual(
      testUserEmail
    );
  });

  it('should throw error if organizationInviteId is not a valid UUID', async () => {
    const invalidId = 'not-a-uuid';

    const query = `query getOrganizationInviteByInvalidId{
      organization(id: "${applicationOrgId}") {
        organizationInvites(organizationInviteId: "${invalidId}") {
          id
          email
        }
      }
    }`;

    await expect(gqlClient.query(query)).rejects.toThrowError(
      /organizationInviteId is invalid/
    );
  });

  it('should succeed when seatLimit is unlimited (null)', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: null
    });
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${applicationOrgId}"
          message: "test email 2"
          email: "${testUserEmail1}"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
            }
          ]
        }
      ) {
        id
        status
      }
    }
      `;
    const res = await gqlClient.query(query, null, adminOptions);
    const inviteId = res.createOrganizationInvite.id;
    trackCreatedInvite(inviteId);

    expect(res.createOrganizationInvite).toBeDefined();
    expect(['submitted', 'approved']).toContain(
      res.createOrganizationInvite.status
    );

    const deleteOrganizationInvitequery = `
      mutation {
        deleteOrganizationInvite(organizationInviteId: "${inviteId}") {
          id
          message
        }
      }
    `;
    const result = await gqlClient.query(deleteOrganizationInvitequery);
    expect(_.get(result, 'deleteOrganizationInvite.id')).toEqual(inviteId);
  });

  it('should fail when seatLimit is set to 1 and the current user count exceeds the limit', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 1
    });

    const query = `mutation {
    createOrganizationInvite(
      input: {
        organizationId: "${applicationOrgId}"
        message: "test email 3"
        email: "second-${testUserEmail2}"
        applicationRoles: [
          {
            applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
            roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
          }
        ]
      }
    ) {
      id
      status
    }
  }`;

    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'Organization seat limit exceeded. Cannot invite new users.'
    );
  });

  it('should fail when seatLimit is exceeded even though adminSeatLimit still has available slots', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 1,
      adminSeatLimit: 150000
    });

    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${applicationOrgId}"
          message: "test email 4"
          email: "second-${testUserEmail2}"
          applicationRoles: [
            ${
              isDesktopAppEnabled
                ? ''
                : `{
                    applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
                    roleId: "ddca9b68-d775-4934-8ffd-7aecc779b652"
                  },`
            }
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
              roleId: "032218c3-d47e-4287-9d16-7bb867c01266"
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'Organization seat limit exceeded. Cannot invite new users.'
    );

    // update seatLimit and adminSeatLimit to be large numbers again for next tests
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: null,
      adminSeatLimit: 150000
    });
  });

  it('should create an organization invitation for regular user', async () => {
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${applicationOrgId}"
          message: "test email 5"
          email: "${testUserEmail2}"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
            }
          ]
        }
      ) {
        id
        status
      }
    }
      `;
    const result = await gqlClient.query(query, null, regularOptions);
    expect(result.createOrganizationInvite.id).toBeDefined();
    organizationInviteId1 = result.createOrganizationInvite.id;
    trackCreatedInvite(organizationInviteId1);
  });

  it('should fail when seat limit exceeded during approval', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 1
    });
    const query = `mutation {
      updateOrganizationInvite(input: {
        organizationInviteId: "${organizationInviteId1}"
        action: approve
        applicationRoles: []
      }) {
        id
        status
      }
    }`;
    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'Cannot approve this invitation'
    );
  });

  it('should succeed when seat limit allows approval', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 150000
    });

    const approveQuery = `mutation {
      updateOrganizationInvite(input: {
        organizationInviteId: "${organizationInviteId1}"
        action: approve
        applicationRoles: []
      }) { id status }
    }`;
    const result = await gqlClient.query(approveQuery, null, adminOptions);
    expect(result.updateOrganizationInvite.id).toBe(organizationInviteId1);
    emailCount++;
    inviteEmails.add(testUserEmail2);
  });

  it('should fail when seat limit exceeded during resend', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 1
    });

    const query = `mutation {
      updateOrganizationInvite(input: {
        organizationInviteId: "${organizationInviteId1}"
        action: resend
        applicationRoles: []
      }) {
        id
        status
      }
    }`;
    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'Cannot resend this invitation'
    );
  });

  it('should succeed when seat limit allows resend', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 150000
    });
    const resendQuery = `mutation {
      updateOrganizationInvite(input: {
        organizationInviteId: "${organizationInviteId1}"
        action: resend
        applicationRoles: []
      }) { id status }
    }`;
    const result = await gqlClient.query(resendQuery, null, adminOptions);
    expect(result.updateOrganizationInvite.id).toBe(organizationInviteId1);
    emailCount++;
    inviteEmails.add(testUserEmail2);
  });

  it('should succeed to createUser when seat limit allows', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 150000
    });

    const query = `mutation {
      createUser(input: {
        name: "${citestMarker}-user_${Date.now()}@localhost"
        password: "123456789"
        organizationId: "${applicationOrgId}"
        roleIds: ["032218c3-d47e-4287-9d16-7bb867c01266"]
        firstName: "First"
        lastName: "Last"
        jsondata: {
          foo: "bar"
        }
      }) {
        id
        name
      }
    }`;

    const result = await gqlClient.query(query);
    expect(result.createUser.id).toBeDefined();
    expect(result.createUser.name).toBeDefined();
    trackCreatedUser(result.createUser.id);
  });

  it('should fail to createUser when seat limit is exceeded', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 1
    });
    const query = `mutation {
      createUser(input: {
        name: "${citestMarker}-user_over_${Date.now()}@localhost"
        password: "123456789"
        organizationId: "${applicationOrgId}"
        roleIds: ["912e377e-f4a4-4184-8db1-baa9670d8081"]
        firstName: "First"
        lastName: "Last"
        jsondata: {
          foo: "bar"
        }
      }) {
        id
        name
      }
    }`;

    await expect(gqlClient.query(query)).rejects.toThrow(
      /Seat limit exceeded|seat limit/i
    );
  });

  it('should allow createUser when seatLimit is exceeded if the user email is internal domain', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 1
    });

    const internalEmail = `${citestMarker}-internal_${Date.now()}@veritone.com`;
    const createInternalQuery = `mutation {
    createUser(input: {
      name: "${internalEmail}"
      password: "123456789"
      organizationId: "${applicationOrgId}"
      roleIds: ["032218c3-d47e-4287-9d16-7bb867c01266"]
      firstName: "Internal"
      lastName: "User"
    })  {
      id
      name
    }
  }`;
    const res = await gqlClient.query(createInternalQuery, null, adminOptions);

    expect(res.createUser.id).toBeDefined();
    expect(res.createUser.name).toContain('@veritone.com');
    trackCreatedUser(res.createUser.id);
  });

  it('should error when adding an existing user and seat limit is full', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 1
    });

    const query = `mutation {
    createOrganizationInvite(
      input: {
        organizationId: "${applicationOrgId}"
        message: "test email 6"
        email: "${regularUser1}"
        applicationRoles: [
          {
            applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
            roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
          }
        ]
      }
    ) {
      id
      status
    }
  }`;

    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'Organization seat limit exceeded. Cannot invite new users.'
    );
  });

  it('should succeed when adding an existing user and seat limit allows', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 150000
    });

    const query = `mutation {
    createOrganizationInvite(
      input: {
        organizationId: "${applicationOrgId}"
        message: "test email 7"
        email: "${regularUser1}"
        applicationRoles: [
          {
            applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
            roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
          }
        ]
      }
    ) {
      id
      status
    }
  }`;

    const res = await gqlClient.query(query, null, regularOptions);
    expect(res.createOrganizationInvite.id).toBeDefined();
    expect(res.createOrganizationInvite.status).toEqual('submitted');
    trackCreatedInvite(res.createOrganizationInvite.id);
  });

  // Unaccepted invites
  it('should not count unaccepted invites towards seat limit', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId1, superToken, {
      seatLimit: 2
    });

    // Create an invite but do not approve
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${applicationOrgId1}"
          message: "test email 8"
          email: "${testUserEmail3}"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    const res = await gqlClient.query(query);
    expect(res.createOrganizationInvite.id).toBeDefined();
    trackCreatedInvite(res.createOrganizationInvite.id);
    emailCount++;
    inviteEmails.add(testUserEmail3);

    // Seat limit still allows another invite
    const secondQuery = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${applicationOrgId1}"
          message: "test email 9"
          email: "${testUserEmail4}"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    const secondRes = await gqlClient.query(secondQuery);
    expect(secondRes.createOrganizationInvite.id).toBeDefined();
    trackCreatedInvite(secondRes.createOrganizationInvite.id);
    emailCount++;
    inviteEmails.add(testUserEmail4);
  });

  // Internal users
  it('should not count internal/exempted users for external-only seat limit enforcement', async () => {
    await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
      seatLimit: 1
    });

    const query = `mutation {
    createOrganizationInvite(
      input: {
        organizationId: "${applicationOrgId}"
        message: "test email 10"
        email: "user@veritone.com"
        applicationRoles: [
          {
            applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
            roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
          }
        ]
      }
    ) {
      id
      status
    }
  }`;
    const res = await gqlClient.query(query, null, regularOptions);
    expect(res.createOrganizationInvite.id).toBeDefined();
    expect(res.createOrganizationInvite.status).toEqual('submitted');
    trackCreatedInvite(res.createOrganizationInvite.id);
  });

  describe.each(['superAdmin', 'orgAdmin'])(
    'OrganizationInvite flow - %s invite handling',
    (tokenType) => {
      let tokenOptions;
      beforeAll(() => {
        tokenOptions =
          tokenType === 'superAdmin' ? superAdminOptions : adminOptions;
      });

      it('should create invite successfully on first attempt', async () => {
        const query = `mutation {
          createOrganizationInvite(
            input: {
              organizationId: "${applicationOrgId}"
              email: "${uniqueEmail}"
              message: "test email 11"
              applicationRoles: [
                {
                  applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
                  roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
                }
              ]
            }
          ) {
            id
            status
          }
        }`;
        const result = await gqlClient.query(query, null, tokenOptions);
        inviteIds[tokenType].push(result.createOrganizationInvite.id);
        trackCreatedInvite(result.createOrganizationInvite.id);
        expect(result.createOrganizationInvite.status).toBeDefined();
        expect(result.createOrganizationInvite.status).toEqual('approved');
        emailCount++;
        inviteEmails.add(uniqueEmail);
      });

      it('should return invite after first creation', async () => {
        const query = `query organizationInvites{
          organization(id: "${applicationOrgId}") {
            organizationInvites(statuses: [submitted, approved], email: "${uniqueEmail}") {
              id
              email
              status
              expirationDate
            }
          }
        }`;
        const result = await gqlClient.query(query, null, tokenOptions);
        expect(result.organization.organizationInvites).toBeDefined();
        expect(result.organization.organizationInvites[0].id).toBe(
          inviteIds[tokenType][0]
        );
        expect(result.organization.organizationInvites.length).toEqual(1);
      });

      it('should re-create invite successfully (clears old invite)', async () => {
        const query = `mutation {
          createOrganizationInvite(
            input: {
              organizationId: "${applicationOrgId}"
              email: "${uniqueEmail}"
              message: "test email 12"
              applicationRoles: [
                {
                  applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
                  roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
                }
              ]
            }
          ) {
            id
            status
          }
        }`;
        const result = await gqlClient.query(query, null, tokenOptions);
        inviteIds[tokenType].push(result.createOrganizationInvite.id);
        trackCreatedInvite(result.createOrganizationInvite.id);
        expect(result.createOrganizationInvite.status).toBeDefined();
        expect(result.createOrganizationInvite.status).toEqual('approved');
        emailCount++;
        inviteEmails.add(uniqueEmail);
      });

      it('should return the previous invite with status "deleted" after a new one is created', async () => {
        const query = `query organizationInvites{
          organization(id: "${applicationOrgId}") {
            organizationInvites(organizationInviteId:"${inviteIds[tokenType][0]}" statuses: [deleted], email: "${uniqueEmail}") {
              id
              email
              status
              expirationDate
            }
          }
        }`;
        const result = await gqlClient.query(query, null, tokenOptions);
        expect(result).toBeDefined();
        expect(result.organization.organizationInvites).toBeDefined();
        expect(result.organization.organizationInvites.length).toEqual(1);
      });

      it('should only have one active invite after re-creationn', async () => {
        const query = `query organizationInvites{
          organization(id: "${applicationOrgId}") {
            organizationInvites(statuses: [submitted, approved], email: "${uniqueEmail}") {
              id
              email
              status
              expirationDate
            }
          }
        }`;
        const result = await gqlClient.query(query, null, tokenOptions);
        expect(result.organization.organizationInvites).toBeDefined();
        expect(result.organization.organizationInvites.length).toEqual(1);
        expect(result.organization.organizationInvites[0].id).toBe(
          inviteIds[tokenType][1]
        );
      });
    }
  );

  it('Regular User should fail to re-create invite due to active conflict', async () => {
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${applicationOrgId}"
          email: "${uniqueEmail}"
          message: "test email 13"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    let err;
    try {
      res = await gqlClient.query(query, null, regularOptions);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
  });

  it('Regular User should create invite successfully on first attempt', async () => {
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${applicationOrgId}"
          email: "regular-user@veritone.com"
          message: "test email 14"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    const result = await gqlClient.query(query, null, regularOptions);
    inviteIds.regular.push(result.createOrganizationInvite.id);
    trackCreatedInvite(result.createOrganizationInvite.id);
    expect(result.createOrganizationInvite.status).toBeDefined();
    expect(result.createOrganizationInvite.status).toEqual('submitted');
  });

  it('Regular User should re-create invite successfully (clears old invite)', async () => {
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${applicationOrgId}"
           email: "regular-user@veritone.com"
          message: "test email 15"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    const result = await gqlClient.query(query, null, regularOptions);
    const invite = result.createOrganizationInvite;
    expect(invite.id).toBeDefined();
    expect(invite.status).toEqual('submitted');

    // Update the invite ID for cleanup (old one was deleted)
    inviteIds.regular.pop();
    inviteIds.regular.push(invite.id);
    trackCreatedInvite(invite.id);
  });

  it('delete OrganizationInvites', async () => {
    const organizationInviteIds = [
      ...inviteIds.superAdmin,
      ...inviteIds.orgAdmin,
      ...inviteIds.regular
    ];
    for (const id of organizationInviteIds) {
      const query = `
      mutation {
        deleteOrganizationInvite(organizationInviteId: "${id}") {
          id
          message
        }
      }
    `;
      const result = await gqlClient.query(query);
      expect(_.get(result, 'deleteOrganizationInvite.id')).toEqual(id);
    }
  });

  afterAll(async () => {
    await safe('reset org seat limits before cleanup', async () => {
      if (applicationOrgId && superToken) {
        await updateOrgLimits(gqlClient, applicationOrgId, superToken, {
          seatLimit: null,
          adminSeatLimit: 150000
        });
      }

      if (applicationOrgId1 && superToken) {
        await updateOrgLimits(gqlClient, applicationOrgId1, superToken, {
          seatLimit: null,
          adminSeatLimit: 150000
        });
      }
    });

    await safe('delete Mailpit messages', async () => {
      const { messageIds } = await getEmailCountFromMailpit();

      if (messageIds.size) {
        await chakram.delete(`${MAILPIT_BASE_URL}/api/v1/messages`, {
          ids: Array.from(messageIds)
        });
      }
    });

    await safeDeleteTrackedOrgInvites();
    await safeDeleteOrgInvites(applicationOrgId);
    await safeDeleteOrgInvites(applicationOrgId1);

    await safeTrackUsersByEmail(Array.from(createdUserEmails));

    await safeDeleteUsers(Array.from(createdUserIds));
    await safeDeleteOrganization(applicationOrgId);
    await safeDeleteOrganization(applicationOrgId1);
  });
});

function trackCreatedUser(userId) {
  if (userId) {
    createdUserIds.add(userId);
  }
}

function trackCreatedInvite(inviteId) {
  if (inviteId) {
    createdInviteIds.add(inviteId);
  }
}

function trackCreatedUserEmail(email) {
  if (email) {
    createdUserEmails.add(email);
  }
}

async function safeDeleteTrackedOrgInvites() {
  const inviteIdsToDelete = Array.from(createdInviteIds).filter(Boolean);

  if (_.isEmpty(inviteIdsToDelete) || !superAdminOptions) {
    return;
  }

  await safe('delete tracked organization invites', async () => {
    await Promise.allSettled(
      inviteIdsToDelete.map((inviteId) =>
        deleteOrganizationInviteById(inviteId)
      )
    );
  });
}

async function safeDeleteOrgInvites(orgId) {
  if (!orgId || !superAdminOptions) {
    return;
  }

  await safe(`delete organization invites for org ${orgId}`, async () => {
    const query = `query getOrganizationInvitesForCleanup {
      organization(id: "${orgId}") {
        organizationInvites {
          id
        }
      }
    }`;

    const result = await gqlClient.query(query, null, superAdminOptions);
    const organizationInvites = _.get(
      result,
      'organization.organizationInvites',
      []
    );

    await Promise.allSettled(
      organizationInvites
        .map((invite) => invite.id)
        .filter(Boolean)
        .map((inviteId) => deleteOrganizationInviteById(inviteId))
    );
  });
}

async function deleteOrganizationInviteById(inviteId) {
  const query = `mutation {
    deleteOrganizationInvite(organizationInviteId: "${inviteId}") {
      id
      message
    }
  }`;

  return gqlClient.query(query, null, superAdminOptions);
}

async function safeTrackUsersByEmail(emails) {
  const uniqueEmails = _.uniq(emails.filter(Boolean));

  if (_.isEmpty(uniqueEmails) || !superAdminOptions) {
    return;
  }

  await safe('track users by email for cleanup', async () => {
    for (const email of uniqueEmails) {
      const usersRes = await userHelpers.getUsers(
        { gqlClient, options: superAdminOptions },
        {
          name: email,
          includeAllOrgUsers: true,
          limit: 200
        }
      );

      const users = _.get(usersRes, 'users.records', []);
      users
        .filter((user) => user.email === email || user.name === email)
        .forEach((user) => trackCreatedUser(user.id));
    }
  });
}

async function safeDeleteUsers(userIds) {
  const ids = _.uniq(userIds.filter(Boolean));

  if (_.isEmpty(ids) || !superAdminOptions) {
    return;
  }

  await safe('delete test users', async () => {
    await Promise.allSettled(
      ids.map((userId) =>
        userHelpers.deleteUser(
          {
            gqlClient,
            options: superAdminOptions
          },
          userId
        )
      )
    );
  });
}

async function safeDeleteOrganization(orgId) {
  if (!orgId || !superAdminOptions) {
    return;
  }

  await safe(`delete organization ${orgId}`, async () => {
    await orgHelpers.deleteOrganization(
      {
        gqlClient,
        options: superAdminOptions
      },
      orgId
    );
  });
}

async function getOrganization(name, ignoreExpect) {
  const getOrgQuery = `
      query getOrganization {
        organizations(
          name: "${name}"
          nameMatch: contains
          status: active
        ) {
          records {
            id
            guid
            name
            jsondata
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
        }
      }`;

  const resultOrg = await gqlClient.query(getOrgQuery);
  const applicationOrg = _.get(resultOrg, 'organizations.records[0]');

  if (!ignoreExpect) {
    expect(applicationOrg).toBeDefined();
    expect(applicationOrg.name).toContain(name);
  }

  return applicationOrg;
}

async function setupTestOrganization(prefixName) {
  // create organization
  const orgName = `${prefixName}-${uuid.v4()}`;
  const queryOrg = `mutation ($kvp: JSONData!, $apps: JSONData) {
        createOrganization (input: {
          name: "${orgName}"
          businessUnit: "Legal"
          types: [agency, broadcaster]
          metadata: $kvp
          applications: $apps
        }) {
          id
          guid
          name
          type
          jsondata
        }
      }`;

  const variables = {
    kvp: {
      test: 'value',
      features: {
        automaticPackageCreation: 'enabled'
      }
    },
    apps: [
      {
        applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
        applicationKey: 'cms'
      },
      isDesktopAppEnabled
        ? null
        : {
            applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
            applicationKey: 'admin'
          },
      {
        applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
        applicationKey: 'developer'
      },
      {
        applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
        applicationKey: 'discovery'
      }
    ].filter((app) => app)
  };
  const resultOrg = await gqlClient.query(queryOrg, variables);
  expect(resultOrg.createOrganization.type).toEqual(
    expect.arrayContaining(['Agency', 'Broadcaster'])
  );
  expect(resultOrg.createOrganization.id).toBeDefined();
  expect(resultOrg.createOrganization.guid).toBeDefined();

  return await getOrganization(orgName);
}

async function getOrCreateOrganization(input) {
  const { nameOrg } = input;

  const applicationOrganization = await setupTestOrganization(nameOrg);

  return applicationOrganization;
}

async function createAdminUser(orgId) {
  const query = `mutation {
    createUser(input: {
    name: "${citestMarker}-admin-user-${uuid.v4()}@localhost.com"
      organizationId: "${orgId}"
      firstName: "Flow-User"
      lastName: "Admin"
      jsondata: {
        firstName: "Flow-User"
        lastName: "Admin"
      }
      roleIds: ${JSON.stringify(ROLES_IDS)}
    })  {
      id
      name
      firstName
      lastName
      jsondata
    }
  }
  `;
  const result = await gqlClient.query(query);
  const user = _.get(result, 'createUser');
  trackCreatedUser(user?.id);
  return user;
}

async function createRegularUser(orgId) {
  const query = `mutation {
    createUser(input: {
      name: "${citestMarker}-regular-user-${uuid.v4()}@localhost.com"
      organizationId: "${orgId}"
      firstName: "User"
      lastName: "Aiware"
      jsondata: {
        firstName: "User"
        lastName: "Aiware"
      }
      roleIds: ["3577dfc6-f441-41f9-8dab-ef9079530450"]
    })  {
      id
      name
      firstName
      lastName
      jsondata
    }
  }

  `;
  const result = await gqlClient.query(query);
  const user = _.get(result, 'createUser');
  trackCreatedUser(user?.id);
  return user;
}

async function getOrCreateUser(
  applicationOrganization,
  uniqueId,
  isAdmin = false
) {
  const users = _.get(applicationOrganization, 'users.records', []) || [];

  const isSingleOrgUser = (user) =>
    user.status === 'active' && user.organizationGuids.length === 1;
  const isUserAdmin = (user) => {
    const userRoles = user.roles?.map((role) => role.id);
    return userRoles.includes(adminRole);
  };

  if (isAdmin) {
    const adminUsers = users.filter(
      (user) => isSingleOrgUser(user) && isUserAdmin(user)
    );
    if (adminUsers.length === 0) {
      return await createAdminUser(applicationOrganization.id);
    }

    const adminUser =
      _.find(adminUsers, (user) => user.name.includes('admin')) ||
      adminUsers[0];
    return { id: adminUser.id, name: adminUser.name };
  }

  const regularUsers = users.filter((user) => isSingleOrgUser(user));
  if (regularUsers.length === 0) {
    return await createRegularUser(applicationOrganization.id);
  }

  const regularUser =
    _.find(regularUsers, (user) => user.name.includes('regular')) ||
    regularUsers[0];
  return { id: regularUser.id, name: regularUser.name };
}

async function updateOrgLimits(
  gqlClient,
  applicationOrgId,
  superToken,
  { seatLimit, adminSeatLimit }
) {
  const apps = [
    {
      applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
      applicationKey: 'cms'
    },
    isDesktopAppEnabled
      ? null
      : {
          applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
          applicationKey: 'admin'
        },
    {
      applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
      applicationKey: 'developer'
    },
    {
      applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
      applicationKey: 'discovery'
    }
  ].filter((app) => app);

  if (isDesktopAppEnabled) {
    apps.push({
      applicationKey: 'aiware_desktop',
      name: 'AIWare Desktop'
    });
  }

  return helpers.updateOrganization(
    gqlClient.authUrl,
    applicationOrgId,
    superToken,
    {
      seatLimit,
      adminSeatLimit,
      organizationName: `${nameOrg}-updated-${uuid.v4()}`,
      businessUnit: 'Legal',
      kvp: {
        test: 'value',
        features: {
          automaticPackageCreation: 'enabled'
        }
      },
      apps
    }
  );
}

async function impersonate(userId, applicationOrgGUID, token) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

async function getEmailCountFromMailpit() {
  let messagesCount = 0;
  const maxRetries = 5;
  let retries = 0;
  const messageIds = new Set();

  while (messagesCount < emailCount && retries < maxRetries) {
    const res = await chakram.get(`${MAILPIT_BASE_URL}/api/v1/messages`);
    const messages = _.get(res, 'body.messages', []);

    messagesCount = messages.filter((message) => {
      const email = _.get(message, 'To[0].Address');
      const isValidMessage = inviteEmails.has(email);

      if (isValidMessage) {
        messageIds.add(message.ID);
      }

      return isValidMessage;
    }).length;

    console.log(`Attempt ${retries + 1}: messagesCount = ${messagesCount}`);

    if (messagesCount < emailCount) {
      await helpers.sleep(10000);
    }

    retries++;
  }
  return { messagesCount, messageIds };
}
