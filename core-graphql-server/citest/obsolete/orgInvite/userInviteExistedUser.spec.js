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
const enableStrictRoleValidation = global.enableStrictRoleValidation ?? false;
const superAdmin = {
  options: {},
  token: ''
};

const org1Setup = {
  org: {},
  adminUser: {},
  regularUser: {}
};

const org2Setup = {
  org: {},
  adminUser: {},
  regularUser: {}
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

describe('citest_orginvite: User basic org invite existed user', () => {
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

    // create org 2
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

  describe('OrganizationInvite flow', () => {
    let tokenOptions;
    beforeAll(() => {
      tokenOptions = org1Setup.regularUser.requestOptions;
    });

    describe('Invite existed users', () => {
      it('Check user invite should success', async () => {
        const listInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
          { gqlClient, options: superAdmin.options },
          {
            orgId: org1Setup.org.id,
            inviteStatuses: ['submitted', 'completed', 'approved']
          }
        );

        const listInvite = _.get(
          listInviteRes,
          'organization.organizationInvites'
        );

        expect(listInvite.length).toEqual(0);
      });

      it('Create org invite for existed user should success', async () => {
        const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: tokenOptions },
          {
            organizationId: org1Setup.org.id,
            email: org2Setup.regularUser.email,
            message: 'test email 1',
            applicationRoles
          }
        );

        invitations.first = _.get(orgInviteRes, 'createOrganizationInvite');
        expect(invitations.first.id).toBeDefined();
        expect(invitations.first.email).toEqual(org2Setup.regularUser.email);
        expect(invitations.first.status).toEqual('submitted');
        expect(invitations.first.organization.id).toEqual(org1Setup.org.id);
        trackCreatedInvite(invitations.first.id);
      });

      it('Create org invite for existed user with invalid application id should fail', async () => {
        if (!enableStrictRoleValidation) return;
        const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: tokenOptions },
          {
            organizationId: org1Setup.org.id,
            email: org2Setup.regularUser.email,
            message: 'test email invalid app',
            applicationRoles: [
              {
                applicationId: '00000000-0000-0000-0000-000000000000',
                roleId: '912e377e-f4a4-4184-8db1-baa9670d8081'
              }
            ]
          }
        );

        await expect(orgInviteRes).rejects.toThrow(
          /The application was not found. It either does not exist or you or your organization do not have access to it./
        );
      });

      it('Create org invite for existed user with invalid role id should fail', async () => {
        if (!enableStrictRoleValidation) return;
        const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: tokenOptions },
          {
            organizationId: org1Setup.org.id,
            email: org2Setup.regularUser.email,
            message: 'test email invalid role',
            applicationRoles: [
              {
                applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
                roleId: '00000000-0000-0000-0000-000000000000'
              }
            ]
          }
        );

        await expect(orgInviteRes).rejects.toThrow(
          /The role was not found. It either does not exist or you or your organization do not have access to it./
        );
      });

      it('Re create org invite for existed user again should success', async () => {
        const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: tokenOptions },
          {
            organizationId: org1Setup.org.id,
            email: org2Setup.regularUser.email,
            message: 'test email 2',
            applicationRoles
          }
        );

        invitations.second = _.get(orgInviteRes, 'createOrganizationInvite');
        expect(invitations.second.id).toBeDefined();
        expect(invitations.second.status).toEqual('submitted');
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

      it('Create invite for current member should fail', async () => {
        const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: tokenOptions },
          {
            organizationId: org1Setup.org.id,
            email: org1Setup.adminUser.email,
            message: 'test email 3',
            applicationRoles
          }
        );

        await expect(orgInviteRes).rejects.toThrow(
          /This user is already a member of this organization/
        );
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
        expect(reject.email).toEqual(org2Setup.regularUser.email);
        expect(reject.status).toEqual('rejected');
        expect(reject.organization.id).toEqual(org1Setup.org.id);
      });

      it('User not have any invitation', async () => {
        const getInviteRes = await orgInviteHelpers.helpGetMyInvitation({
          gqlClient,
          options: org2Setup.regularUser.requestOptions
        });

        const user = _.get(getInviteRes, 'me');
        expect(user).toBeDefined();
        expect(user.id).toEqual(org2Setup.regularUser.userId);
        expect(user.organizationInvites).toBeDefined();
        const invites = _.get(user, 'organizationInvites');
        const approvedInvites = invites.filter(
          (inv) => inv.status === 'approved' || inv.status === 'submitted'
        );
        expect(approvedInvites.length).toEqual(0);
      });

      it('Create org invite for existed user again (when rejected) should fail', async () => {
        const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: tokenOptions },
          {
            organizationId: org1Setup.org.id,
            email: org2Setup.regularUser.email,
            message: 'test email 4',
            applicationRoles
          }
        );
        await expect(orgInviteRes).rejects.toThrow(
          /This user's invitation was previously rejected by an administrator. Please contact an administrator for assistance./
        );
      });

      it('Admin create org invite should success (bypass rejected)', async () => {
        const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: superAdmin.options },
          {
            organizationId: org1Setup.org.id,
            email: org2Setup.regularUser.email,
            message: 'test email',
            applicationRoles
          }
        );

        const approve = _.get(orgInviteRes, 'createOrganizationInvite');
        expect(approve.email).toEqual(org2Setup.regularUser.email);
        expect(approve.status).toEqual('approved');
        expect(approve.organization.id).toEqual(org1Setup.org.id);
        invitations.second = approve;
        trackCreatedInvite(invitations.second.id);
        emailCount++;
        inviteEmails.add(org2Setup.regularUser.email);
      });

      xit('Create org invite for existed user again after approved should fail (regular user still blocked by rejection)', async () => {
        const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: tokenOptions },
          {
            organizationId: org1Setup.org.id,
            email: org2Setup.regularUser.email,
            message: 'test email 5',
            applicationRoles
          }
        );
        await expect(orgInviteRes).rejects.toThrow(
          /previously rejected by an administrator/
        );
      });

      it('Org user should not included invitee', async () => {
        const listUserRes = await orgHelpers.getTestOrganization(
          { gqlClient, options: org1Setup.adminUser.requestOptions },
          { id: org1Setup.org.id }
        );

        expect(listUserRes).toBeDefined();
        expect(listUserRes.length).toEqual(1);
        const listUser = _.get(listUserRes, '[0].users.records');
        const invitee = listUser.filter(
          (u) => u.id === org2Setup.regularUser.userId
        );
        expect(invitee.length).toEqual(0);
      });

      it('Invitee accept invitation should success', async () => {
        const inviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
          { gqlClient, options: org2Setup.regularUser.requestOptions },
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

      it('Org user should included invitee', async () => {
        const listUserRes = await orgHelpers.getTestOrganization(
          { gqlClient, options: superAdmin.options },
          { id: org1Setup.org.id }
        );

        expect(listUserRes).toBeDefined();
        expect(listUserRes.length).toEqual(1);
        const listUser = _.get(listUserRes, '[0].users.records');
        const invitee = listUser.find(
          (u) => u.id === org2Setup.regularUser.userId
        );
        expect(invitee).toBeDefined();
        expect(invitee.id).toEqual(org2Setup.regularUser.userId);
      });

      it('Invitee can login to org', async () => {
        const loginRes = await userHelpers.loginUser(
          { gqlClient },
          {
            userName: org2Setup.regularUser.username,
            password: 'testUserPassword',
            organizationGuid: org1Setup.org.guid
          }
        );

        expect(loginRes).toBeDefined();
        expect(loginRes.user.id).toEqual(org2Setup.regularUser.userId);
        expect(loginRes.organization.id).toEqual(org1Setup.org.id);
      });

      it('Remove invitee from org should success', async () => {
        const removeRes = await userHelpers.removeUserFromOrg(
          { gqlClient, options: superAdmin.options },
          {
            organizationGuid: org1Setup.org.guid,
            userId: org2Setup.regularUser.userId
          }
        );

        const remove = _.get(removeRes, 'removeUserFromOrganization');
        expect(remove.id).toEqual(org2Setup.regularUser.userId);
      });

      it('Org user should not included invitee', async () => {
        const listUserRes = await orgHelpers.getTestOrganization(
          { gqlClient, options: superAdmin.options },
          { id: org1Setup.org.id }
        );

        expect(listUserRes).toBeDefined();
        expect(listUserRes.length).toEqual(1);
        const listUser = _.get(listUserRes, '[0].users.records');
        const invitee = listUser.filter(
          (u) => u.id === org2Setup.regularUser.userId
        );
        expect(invitee.length).toEqual(0);
      });

      xit('Invite user again without delete invitation should fail (regular user still blocked by rejection)', async () => {
        const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: tokenOptions },
          {
            organizationId: org1Setup.org.id,
            email: org2Setup.regularUser.email,
            message: 'test email 6',
            applicationRoles
          }
        );
        await expect(orgInviteRes).rejects.toThrow(
          /previously rejected by an administrator/
        );
      });

      it('Delete old invitation should success', async () => {
        const deleteInviteRes = await orgInviteHelpers.helpDeleteOrgInvite(
          { gqlClient, options: superAdmin.options },
          invitations.second.id
        );

        const deleteInvite = _.get(deleteInviteRes, 'deleteOrganizationInvite');
        expect(deleteInvite.id).toEqual(invitations.second.id);
      });

      xit('Create org invite for existed user again should fail (regular user still blocked by rejection)', async () => {
        const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: tokenOptions },
          {
            organizationId: org1Setup.org.id,
            email: org2Setup.regularUser.email,
            message: 'test email 7',
            applicationRoles
          }
        );
        await expect(orgInviteRes).rejects.toThrow(
          /previously rejected by an administrator/
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

function trackCreatedInvite(inviteId) {
  if (inviteId) {
    createdInviteIds.add(inviteId);
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
        name: `thoang2+admin-${uniqueId}@veritone.com`,
        email: `thoang2+admin-${uniqueId}@veritone.com`,
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'regularUser',
        name: `thoang2+regular-${uniqueId}@veritone.com`,
        email: `thoang2+regular-${uniqueId}@veritone.com`,
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
