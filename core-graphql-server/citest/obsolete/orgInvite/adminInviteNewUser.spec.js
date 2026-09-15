const helpers = require('../helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');
const chakram = require('chakram');
const orgHelpers = require('../helpers/organization.js');
const userHelpers = require('../helpers/user.js');
const orgInviteHelpers = require('../helpers/orgInvite.js');

const config = helpers.config;
const _ = require('lodash');
const env = config.env;
const uuid = require('uuid');
const { safe } = require('../helpers/cleanup/utils.js');
const gqlClient = new GraphqlClient(env);
const MAILPIT_BASE_URL =
  process.env.NODE_ENV === 'test'
    ? 'http://mailpit:8025' // run on ci pipeline
    : 'http://localhost:8025'; // run on local

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const superAdmin = {
  options: {},
  token: ''
};

const org1Setup = {
  org: {},
  adminUser: {},
  regularUser: {},
  newUser: {}
};

const org2Setup = {
  org: {},
  adminUser: {},
  regularUser: {},
  newUser: {}
};

let invitations = {
  first: {},
  second: {}
};

const applicationRoles = [
  {
    applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
    roleId: '912e377e-f4a4-4184-8db1-baa9670d8081'
  }
];
let emailCount = 0;
const inviteEmails = new Set();
const createdUserIds = new Set();

describe('citest_orginvite: Admin basic org invite new user', () => {
  let newEmail;
  let newToken;
  beforeAll(async () => {
    const result = await gqlClient.connect();

    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superAdmin.token = result.token;
    superAdmin.options = helpers.requestOptions(result.token);

    // create org 1
    const testOrg1 = await orgHelpers.setupTestOrgAndUser(
      {
        gqlClient,
        superAdminToken: superAdmin.token
      },
      createOrgAndUserInput(citestMarker + '-org-invite-1-')
    );
    org1Setup.org = testOrg1.org;
    org1Setup.adminUser = testOrg1.listOptions.find(
      (u) => u.key === 'adminUser'
    );
    org1Setup.regularUser = testOrg1.listOptions.find(
      (u) => u.key === 'regularUser'
    );
    trackCreatedUser(org1Setup.adminUser.userId);
    trackCreatedUser(org1Setup.regularUser.userId);

    // create org 2 (used as holding org for deleted user tests)
    const testOrg2 = await orgHelpers.setupTestOrgAndUser(
      {
        gqlClient,
        superAdminToken: superAdmin.token
      },
      createOrgAndUserInput(citestMarker + '-org-invite-2-')
    );
    org2Setup.org = testOrg2.org;
    org2Setup.adminUser = testOrg2.listOptions.find(
      (u) => u.key === 'adminUser'
    );
    org2Setup.regularUser = testOrg2.listOptions.find(
      (u) => u.key === 'regularUser'
    );
    trackCreatedUser(org2Setup.adminUser.userId);
    trackCreatedUser(org2Setup.regularUser.userId);
  });

  describe.each(['superAdmin', 'orgAdmin'])(
    'OrganizationInvite flow - %s invite handling',
    (tokenType) => {
      let tokenOptions;
      beforeAll(() => {
        newEmail = 'thoang2+new-user-' + uuid.v4() + '@veritone.com';

        tokenOptions =
          tokenType === 'superAdmin'
            ? superAdmin.options
            : org1Setup.adminUser.requestOptions;
      });

      describe(`${tokenType} invite new users`, () => {
        it('Check new user email should not exist', async () => {
          const fetchUserRes = await userHelpers.getUsers(
            { gqlClient, options: tokenOptions },
            {
              name: newEmail,
              status: 'active',
              includeAllOrgUsers: true,
              limit: 200
            }
          );

          const listUsers = _.get(fetchUserRes, 'users.records');

          const user = listUsers.find((u) => u.email === newEmail);
          expect(user).toBeUndefined();
        });

        it('Create org invite for new user should success', async () => {
          const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 1',
              applicationRoles
            }
          );

          invitations.first = _.get(orgInviteRes, 'createOrganizationInvite');
          expect(invitations.first.id).toBeDefined();
          expect(invitations.first.email).toEqual(newEmail);
          expect(invitations.first.status).toEqual('approved');
          expect(invitations.first.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(newEmail);
        });

        it('Re create org invite for new user again should success', async () => {
          const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 2',
              applicationRoles
            }
          );

          invitations.second = _.get(orgInviteRes, 'createOrganizationInvite');
          expect(invitations.second.id).toBeDefined();
          expect(invitations.second.email).toEqual(newEmail);
          expect(invitations.second.status).toEqual('approved');
          expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(newEmail);
        });

        it('Previous invitation is deleted', async () => {
          const listInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
            { gqlClient, options: tokenOptions },
            {
              orgId: org1Setup.org.id
            }
          );

          const listInvite = _.get(
            listInviteRes,
            'organization.organizationInvites'
          );

          const preInvite = listInvite.find(
            (inv) => inv.id === invitations.first.id
          );
          expect(preInvite.id).toEqual(invitations.first.id);
          expect(preInvite.status).toEqual('deleted');
        });

        it('Resend org invite should success', async () => {
          const resendInviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationInviteId: invitations.second.id,
              applicationRoles: [],
              action: 'resend'
            }
          );

          const resend = _.get(resendInviteRes, 'updateOrganizationInvite');
          expect(resend.email).toEqual(newEmail);
          expect(resend.status).toEqual('approved');
          expect(resend.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(newEmail);
        });

        it('Only 1 active invitation, not create new invitation', async () => {
          const listInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
            { gqlClient, options: tokenOptions },
            {
              orgId: org1Setup.org.id
            }
          );

          const listInvite = _.get(
            listInviteRes,
            'organization.organizationInvites'
          );

          const approvedInvites = listInvite.filter(
            (inv) => inv.status === 'approved'
          );
          expect(approvedInvites.length).toEqual(1);
          expect(approvedInvites[0].id).toEqual(invitations.second.id);
          expect(approvedInvites[0].status).toEqual('approved');
        });

        it('Org user should not included invitee', async () => {
          const listUserRes = await orgHelpers.getTestOrganization(
            { gqlClient, options: tokenOptions },
            { id: org1Setup.org.id }
          );

          expect(listUserRes).toBeDefined();
          expect(listUserRes.length).toEqual(1);
          const listUser = _.get(listUserRes, '[0].users.records');
          const invitee = listUser.filter((u) => u.email === newEmail);
          expect(invitee.length).toEqual(0);
        });

        it('Check org invitation', async () => {
          const getInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
            { gqlClient, options: tokenOptions },
            {
              inviteStatuses: ['approved', 'submitted'],
              orgId: org1Setup.org.id
            }
          );

          const getInvites = _.get(
            getInviteRes,
            'organization.organizationInvites'
          );
          const approvedInvitation = getInvites.filter(
            (inv) => inv.status === 'approved'
          );
          const submittedInvitation = getInvites.filter(
            (inv) => inv.status === 'submitted'
          );

          expect(approvedInvitation.length).toEqual(1);
          expect(approvedInvitation[0].id).toEqual(invitations.second.id);
          expect(submittedInvitation.length).toEqual(0);
        });

        it('Run reset password API for new user should fail (user not created)', async () => {
          const listInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
            { gqlClient, options: superAdmin.options },
            {
              orgId: org1Setup.org.id,
              passwordResetToken: true,
              inviteStatuses: ['approved']
            }
          );

          const listInvite = _.get(
            listInviteRes,
            'organization.organizationInvites'
          );

          const preInvite = listInvite.find((inv) => inv.email === newEmail);
          expect(preInvite).toBeDefined();
          invitations.second = preInvite;
          newToken = preInvite.passwordResetToken;

          const resetPasswordRes =
            await orgInviteHelpers.helpResetPasswordInvite({
              baseUrl: config.core_admin_url,
              invitation: invitations.second,
              userName: newEmail,
              password: 'testUserPassword',
              ApiPath: '/admin/org-invite/password/reset'
            });

          expect(resetPasswordRes).toBeDefined();
          expect(resetPasswordRes.statusCode).toEqual(400);
          expect(resetPasswordRes.error.text).toMatch(
            /invite status is invalid/
          );
        });

        it('New user email not existed in system', async () => {
          const fetchUserRes = await userHelpers.getUsers(
            { gqlClient, options: superAdmin.options },
            {
              name: newEmail,
              status: 'active',
              includeAllOrgUsers: true,
              limit: 200
            }
          );

          const listUsers = _.get(fetchUserRes, 'users.records');
          expect(listUsers.length).toEqual(0);
        });

        it('Invitee accept invitation should success', async () => {
          const inviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
            { gqlClient, options: helpers.requestOptions(newToken) },
            {
              organizationInviteId: invitations.second.id,
              applicationRoles: [],
              action: 'complete'
            }
          );

          const invite = _.get(inviteRes, 'updateOrganizationInvite');

          expect(invite.id).toEqual(invitations.second.id);
          expect(invite.status).toEqual('completed');
        });

        it('New user is created', async () => {
          const fetchUserRes = await userHelpers.getUsers(
            { gqlClient, options: superAdmin.options },
            {
              name: newEmail,
              status: 'active',
              includeAllOrgUsers: true,
              limit: 200
            }
          );

          const listUsers = _.get(fetchUserRes, 'users.records');
          expect(listUsers.length).toEqual(1);
          expect(listUsers[0].email).toEqual(newEmail);
          expect(listUsers[0].status).toEqual('active');
          trackCreatedUser(listUsers[0].id);
        });

        it('Org user should included invitee', async () => {
          const listUserRes = await orgHelpers.getTestOrganization(
            { gqlClient, options: tokenOptions },
            { id: org1Setup.org.id }
          );

          expect(listUserRes).toBeDefined();
          expect(listUserRes.length).toEqual(1);
          const listUser = _.get(listUserRes, '[0].users.records');
          const invitee = listUser.find((u) => u.email === newEmail);
          expect(invitee).toBeDefined();
          expect(invitee.email).toEqual(newEmail);
          org1Setup.newUser.userId = invitee.id;
          org1Setup.newUser.username = invitee.name;
          org1Setup.newUser.email = invitee.email;
          trackCreatedUser(invitee.id);
        });

        it('Run reset password for user email should success', async () => {
          const resetPasswordRes =
            await orgInviteHelpers.helpResetPasswordInvite({
              baseUrl: config.core_admin_url,
              invitation: invitations.second,
              userName: newEmail,
              password: 'testUserPassword',
              ApiPath: '/admin/org-invite/password/reset'
            });

          expect(resetPasswordRes).toBeDefined();
          expect(resetPasswordRes.error).toEqual(false);
          expect(resetPasswordRes.statusCode).toEqual(204);
        });

        it('Invitee can login to org', async () => {
          const loginRes = await userHelpers.loginUser(
            { gqlClient },
            {
              userName: org1Setup.newUser.username,
              password: 'testUserPassword',
              organizationGuid: org1Setup.org.guid
            }
          );

          expect(loginRes).toBeDefined();
          expect(loginRes.user.id).toEqual(org1Setup.newUser.userId);
          expect(loginRes.organization.id).toEqual(org1Setup.org.id);
        });

        it('Delete old invitation should success', async () => {
          const deleteInviteRes = await orgInviteHelpers.helpDeleteOrgInvite(
            { gqlClient, options: tokenOptions },
            invitations.second.id
          );

          const deleteInvite = _.get(
            deleteInviteRes,
            'deleteOrganizationInvite'
          );
          expect(deleteInvite.id).toEqual(invitations.second.id);
        });

        it('Remove invitee from org should fail', async () => {
          const removeRes = userHelpers.removeUserFromOrg(
            { gqlClient, options: tokenOptions },
            {
              organizationGuid: org1Setup.org.guid,
              userId: org1Setup.newUser.userId
            }
          );

          await expect(removeRes).rejects.toThrow(
            /User .* can not be removed from the only one organization it belongs to/
          );
        });

        it('Invite user again should fail', async () => {
          const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 3',
              applicationRoles
            }
          );

          await expect(orgInviteRes).rejects.toThrow(
            /This user is already a member of this organization/
          );
        });

        if (tokenType === 'orgAdmin') {
          it("OrgAdmin invite a deleted user should error with 'unavailable' message", async () => {
            // 1. Add user to org2 so they can be removed from org1
            await userHelpers.helpAddUserToOrg(
              { gqlClient, options: superAdmin.options },
              {
                userId: org1Setup.newUser.userId,
                organizationGuid: org2Setup.org.guid,
                roleIds: ['032218c3-d47e-4287-9d16-7bb867c01266'] // Desktop
              }
            );

            // 2. Remove user from org1
            await userHelpers.removeUserFromOrg(
              { gqlClient, options: superAdmin.options },
              {
                organizationGuid: org1Setup.org.guid,
                userId: org1Setup.newUser.userId
              }
            );

            // 3. Delete the user
            await userHelpers.deleteUser(
              { gqlClient, options: superAdmin.options },
              org1Setup.newUser.userId
            );

            // 4. Try to invite the deleted user (orgAdmin)
            const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
              { gqlClient, options: tokenOptions },
              {
                organizationId: org1Setup.org.id,
                email: newEmail,
                message: 'test email',
                applicationRoles
              }
            );

            // 5. Verify the error message
            await expect(orgInviteRes).rejects.toThrow(
              'The user account this email belongs to is unavailable. Please contact an instance administrator for assistance'
            );
          });
        } else {
          it('SuperAdmin invite a deleted user should succeed (superAdmin bypasses status check)', async () => {
            // 1. Add user to org2 so they can be removed from org1
            await userHelpers.helpAddUserToOrg(
              { gqlClient, options: superAdmin.options },
              {
                userId: org1Setup.newUser.userId,
                organizationGuid: org2Setup.org.guid,
                roleIds: ['032218c3-d47e-4287-9d16-7bb867c01266'] // Desktop
              }
            );

            // 2. Remove user from org1
            await userHelpers.removeUserFromOrg(
              { gqlClient, options: superAdmin.options },
              {
                organizationGuid: org1Setup.org.guid,
                userId: org1Setup.newUser.userId
              }
            );

            // 3. Delete the user (now in org2 only)
            await userHelpers.deleteUser(
              { gqlClient, options: superAdmin.options },
              org1Setup.newUser.userId
            );

            // 4. SuperAdmin can invite deleted users
            const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
              { gqlClient, options: tokenOptions },
              {
                organizationId: org1Setup.org.id,
                email: newEmail,
                message: 'test email',
                applicationRoles
              }
            );

            // 5. Verify the invite was created successfully
            const invite = _.get(orgInviteRes, 'createOrganizationInvite');
            expect(invite.id).toBeDefined();
            expect(invite.email).toEqual(newEmail);
            emailCount++;
            inviteEmails.add(newEmail);
          });
        }
      });

      afterAll(async () => {
        await safeDeleteOrgInvites(org1Setup.org.id);
        await safeDeleteOrgInvites(org2Setup.org.id);
      });
    }
  );

  afterAll(async () => {
    await safe('delete Mailpit messages', async () => {
      const { messageIds } = await getEmailCountFromMailpit();

      if (messageIds.size) {
        await chakram.delete(`${MAILPIT_BASE_URL}/api/v1/messages`, {
          ids: Array.from(messageIds)
        });
      }
    });

    await safeDeleteOrgInvites(org1Setup.org.id);
    await safeDeleteOrgInvites(org2Setup.org.id);

    await safeDeleteUsers(Array.from(createdUserIds));
    await safeDeleteOrganization(org1Setup.org.id);
    await safeDeleteOrganization(org2Setup.org.id);
  });
});

function trackCreatedUser(userId) {
  if (userId) {
    createdUserIds.add(userId);
  }
}

async function safeDeleteOrgInvites(orgId) {
  if (!orgId || !superAdmin.options) {
    return;
  }

  await safe(`delete organization invites for org ${orgId}`, async () => {
    const getInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
      { gqlClient, options: superAdmin.options },
      { orgId }
    );

    const getInvites = _.get(
      getInviteRes,
      'organization.organizationInvites',
      []
    );

    await Promise.allSettled(
      getInvites
        .map((invite) => invite.id)
        .filter(Boolean)
        .map((inviteId) =>
          orgInviteHelpers.helpDeleteOrgInvite(
            { gqlClient, options: superAdmin.options },
            inviteId
          )
        )
    );
  });
}

async function safeDeleteUsers(userIds) {
  const ids = _.uniq(userIds.filter(Boolean));

  if (_.isEmpty(ids) || !superAdmin.options) {
    return;
  }

  await safe('delete test users', async () => {
    await Promise.allSettled(
      ids.map((userId) =>
        userHelpers.deleteUser(
          {
            gqlClient,
            options: superAdmin.options
          },
          userId
        )
      )
    );
  });
}

async function safeDeleteOrganization(orgId) {
  if (!orgId || !superAdmin.options) {
    return;
  }

  await safe(`delete organization ${orgId}`, async () => {
    await orgHelpers.deleteOrganization(
      {
        gqlClient,
        options: superAdmin.options
      },
      orgId
    );
  });
}

function createOrgAndUserInput(orgName) {
  const uniqueId = uuid.v4();
  return {
    orgInput: {
      name: orgName + uniqueId,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      kvp: {
        features: {
          enableRBACFeature: 'disabled'
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
    },
    userInputs: [
      {
        key: 'adminUser',
        name: `thoang2+admin-${uniqueId}@veriton.com`,
        email: `thoang2+admin-${uniqueId}@veriton.com`,
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'regularUser',
        name: `thoang2+regular-${uniqueId}@veriton.com`,
        email: `thoang2+regular-${uniqueId}@veriton.com`,
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };
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
