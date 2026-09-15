const helpers = require('../helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');
const chakram = require('chakram');
const orgHelpers = require('../helpers/organization.js');
const userHelpers = require('../helpers/user.js');
const orgInviteHelpers = require('../helpers/orgInvite.js');
const { safe } = require('../helpers/cleanup/utils.js');

const config = helpers.config;
const _ = require('lodash');
const env = config.env;
const uuid = require('uuid');
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
const createdInviteIds = new Set();
const createdUserEmails = new Set();

describe('citest_orginvite: User basic org invite new user', () => {
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
  });

  describe('OrganizationInvite flow - User role invite new user', () => {
    let tokenOptions;
    beforeAll(() => {
      newEmail = 'thoang2+new-' + uuid.v4() + '@veritone.com';
      tokenOptions = org1Setup.regularUser.requestOptions;
      trackCreatedUserEmail(newEmail);
    });

    describe('Invite new users', () => {
      it('Check new user email should not exist', async () => {
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
        expect(invitations.first.status).toEqual('submitted');
        expect(invitations.first.organization.id).toEqual(org1Setup.org.id);
        trackCreatedInvite(invitations.first.id);
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
        expect(invitations.second.status).toEqual('submitted');
        expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
        trackCreatedInvite(invitations.second.id);
      });

      it('Previous invitation is rejected', async () => {
        const listInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
          { gqlClient, options: superAdmin.options },
          {
            orgId: org1Setup.org.id,
            inviteStatuses: ['rejected']
          }
        );
        const invites = _.get(
          listInviteRes,
          'organization.organizationInvites'
        );
        const oldInvite = invites.find((i) => i.id === invitations.first.id);
        expect(oldInvite).toBeDefined();
        expect(oldInvite.status).toEqual('rejected');
      });

      it('Admin reject invitation should success', async () => {
        const rejectInviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
          { gqlClient, options: superAdmin.options },
          {
            organizationInviteId: invitations.second.id,
            applicationRoles: [],
            action: 'reject'
          }
        );

        const reject = _.get(rejectInviteRes, 'updateOrganizationInvite');
        expect(reject.email).toEqual(newEmail);
        expect(reject.status).toEqual('rejected');
        expect(reject.organization.id).toEqual(org1Setup.org.id);
      });

      it('Create org invite for new user again (rejected) should fail', async () => {
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
          /This user's invitation was previously rejected by an administrator. Please contact an administrator for assistance./
        );
      });

      it('Admin create org invite for new user again should success', async () => {
        const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: superAdmin.options },
          {
            organizationId: org1Setup.org.id,
            email: newEmail,
            message: 'test email',
            applicationRoles
          }
        );

        invitations.second = _.get(orgInviteRes, 'createOrganizationInvite');
        expect(invitations.second.id).toBeDefined();
        expect(invitations.second.email).toEqual(newEmail);
        expect(invitations.second.status).toEqual('approved');
        expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
        trackCreatedInvite(invitations.second.id);
      });

      it('Verify invitation is approved', async () => {
        // Since admin created it, it should be approved
        const listInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
          { gqlClient, options: superAdmin.options },
          {
            orgId: org1Setup.org.id,
            organizationInviteId: invitations.second.id
          }
        );

        const approve = _.get(
          listInviteRes,
          'organization.organizationInvites[0]'
        );
        expect(approve.email).toEqual(newEmail);
        expect(approve.status).toEqual('approved');
        emailCount++;
        inviteEmails.add(newEmail);
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
        trackCreatedInvite(preInvite.id);
        newToken = preInvite.passwordResetToken;

        const resetPasswordRes = await orgInviteHelpers.helpResetPasswordInvite(
          {
            baseUrl: config.core_admin_url,
            invitation: invitations.second,
            userName: newEmail,
            password: 'testUserPassword',
            ApiPath: '/admin/org-invite/password/reset'
          }
        );

        expect(resetPasswordRes).toBeDefined();
        expect(resetPasswordRes.statusCode).toEqual(400);
        expect(resetPasswordRes.error.text).toMatch(/invite status is invalid/);
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
          { gqlClient, options: superAdmin.options },
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
        const resetPasswordRes = await orgInviteHelpers.helpResetPasswordInvite(
          {
            baseUrl: config.core_admin_url,
            invitation: invitations.second,
            userName: newEmail,
            password: 'testUserPassword',
            ApiPath: '/admin/org-invite/password/reset'
          }
        );

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
          { gqlClient, options: superAdmin.options },
          invitations.second.id
        );

        const deleteInvite = _.get(deleteInviteRes, 'deleteOrganizationInvite');
        expect(deleteInvite.id).toEqual(invitations.second.id);
      });

      it('Remove invitee from org should fail - user is belong to only one org', async () => {
        const removeRes = userHelpers.removeUserFromOrg(
          { gqlClient, options: superAdmin.options },
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
            message: 'test email 4',
            applicationRoles
          }
        );

        await expect(orgInviteRes).rejects.toThrow(
          /This user is already a member of this organization/
        );
      });
    });
  });

  afterAll(async () => {
    await safe('delete Mailpit messages', async () => {
      const { messageIds } = await getEmailCountFromMailpit();

      if (messageIds.size) {
        await chakram.delete(`${MAILPIT_BASE_URL}/api/v1/messages`, {
          ids: Array.from(messageIds)
        });
      }
    });

    await safeDeleteTrackedOrgInvites();
    await safeDeleteOrgInvites(org1Setup.org.id);

    await safeTrackUsersByEmail(Array.from(createdUserEmails));

    await safeDeleteUsers(Array.from(createdUserIds));
    await safeDeleteOrganization(org1Setup.org.id);
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
  const inviteIds = Array.from(createdInviteIds).filter(Boolean);

  if (_.isEmpty(inviteIds) || !superAdmin.options) {
    return;
  }

  await safe('delete tracked organization invites', async () => {
    await Promise.allSettled(
      inviteIds.map((inviteId) =>
        orgInviteHelpers.helpDeleteOrgInvite(
          { gqlClient, options: superAdmin.options },
          inviteId
        )
      )
    );
  });
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
        .map((inv) => inv.id)
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

async function safeTrackUsersByEmail(emails) {
  const uniqueEmails = _.uniq(emails.filter(Boolean));

  if (_.isEmpty(uniqueEmails) || !superAdmin.options) {
    return;
  }

  await safe('track users by email for cleanup', async () => {
    for (const email of uniqueEmails) {
      const usersRes = await userHelpers.getUsers(
        { gqlClient, options: superAdmin.options },
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
