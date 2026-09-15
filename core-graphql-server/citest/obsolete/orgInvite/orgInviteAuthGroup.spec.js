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

let adminAuthGroup;
let userAuthGroup;
let newLoginOption;
let emailCount = 0;
const inviteEmails = new Set();
const createdUserIds = new Set();
const createdInviteIds = new Set();

describe('citest_orginvite: Admin basic org invite authGroup', () => {
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

  describe('OrganizationInvite authGroup flow - admin invite handling', () => {
    let tokenOptions;
    beforeAll(() => {
      tokenOptions = superAdmin.options;
    });

    describe(`invite with authGroup`, () => {
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

      it('Create org invite with authGroup Admin should success', async () => {
        const authGroupRes = await gqlClient.query(
          `  query au{
              authGroups (limit: 100) {
                records {
                  id
                  name
                }
              }
            }`,
          {},
          org1Setup.adminUser.requestOptions
        );
        const authGroup = _.get(authGroupRes, 'authGroups.records');
        adminAuthGroup = authGroup.find((auth) =>
          auth.name.includes('Administrator')
        );
        userAuthGroup = authGroup.find((auth) => auth.name.includes('User'));

        const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: tokenOptions },
          {
            organizationId: org1Setup.org.id,
            email: org2Setup.adminUser.email,
            message: 'test emai 1',
            applicationRoles,
            authGroupIds: [adminAuthGroup.id]
          }
        );

        invitations.first = _.get(orgInviteRes, 'createOrganizationInvite');
        trackCreatedInvite(invitations.first.id);
        expect(invitations.first.id).toBeDefined();
        expect(invitations.first.email).toEqual(org2Setup.adminUser.email);
        expect(invitations.first.status).toEqual('approved');
        expect(invitations.first.organization.id).toEqual(org1Setup.org.id);
        emailCount++;
        inviteEmails.add(org2Setup.adminUser.email);
      });

      it('Invitee accept invitation should success', async () => {
        const inviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
          { gqlClient, options: org2Setup.adminUser.requestOptions },
          {
            organizationInviteId: invitations.first.id,
            applicationRoles: [],
            action: 'complete'
          }
        );

        const invite = _.get(inviteRes, 'updateOrganizationInvite');

        expect(invite.id).toEqual(invitations.first.id);
        expect(invite.status).toEqual('completed');
      });

      it('Invitee can login to org', async () => {
        const loginRes = await userHelpers.loginUser(
          { gqlClient },
          {
            userName: org2Setup.adminUser.username,
            password: 'testUserPassword',
            organizationGuid: org1Setup.org.guid
          }
        );

        expect(loginRes).toBeDefined();
        expect(loginRes.user.id).toEqual(org2Setup.adminUser.userId);
        expect(loginRes.organization.id).toEqual(org1Setup.org.id);
        expect(loginRes.token).toBeDefined();
        newLoginOption = helpers.requestOptions(loginRes.token);
      });

      xit('Invitee should have authGroup Admin', async () => {
        const userRes = await userHelpers.getMyInfo({
          gqlClient,
          options: newLoginOption
        });
        const user = _.get(userRes, 'me');
        expect(user).toBeDefined();
        const authGroupIds = _.get(user, 'authGroupIds');
        expect(authGroupIds).toContain(adminAuthGroup.id);
      });

      it('Create org invite with authGroup User should success', async () => {
        const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: tokenOptions },
          {
            organizationId: org1Setup.org.id,
            email: org2Setup.regularUser.email,
            message: 'test email 2',
            applicationRoles,
            authGroupIds: [userAuthGroup.id]
          }
        );

        invitations.second = _.get(orgInviteRes, 'createOrganizationInvite');
        trackCreatedInvite(invitations.second.id);
        expect(invitations.second.id).toBeDefined();
        expect(invitations.second.email).toEqual(org2Setup.regularUser.email);
        expect(invitations.second.status).toEqual('approved');
        expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
        emailCount++;
        inviteEmails.add(org2Setup.regularUser.email);
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
        expect(loginRes.token).toBeDefined();
        newLoginOption = helpers.requestOptions(loginRes.token);
      });

      xit('Invitee should have authGroup User', async () => {
        const userRes = await userHelpers.getMyInfo({
          gqlClient,
          options: newLoginOption
        });
        const user = _.get(userRes, 'me');
        expect(user).toBeDefined();
        const authGroupIds = _.get(user, 'authGroupIds');
        expect(authGroupIds).toContain(adminAuthGroup.id);
      });

      it('delete org invite', async () => {
        const deleteResFirst = await orgInviteHelpers.helpDeleteOrgInvite(
          { gqlClient, options: superAdmin.options },
          invitations.first.id
        );
        expect(deleteResFirst).toBeDefined();
        const deleted1 = _.get(deleteResFirst, 'deleteOrganizationInvite');
        expect(deleted1.id).toEqual(invitations.first.id);

        const deleteResSecond = await orgInviteHelpers.helpDeleteOrgInvite(
          { gqlClient, options: superAdmin.options },
          invitations.second.id
        );
        expect(deleteResSecond).toBeDefined();
        const deleted2 = _.get(deleteResSecond, 'deleteOrganizationInvite');
        expect(deleted2.id).toEqual(invitations.second.id);
      });

      it('remove user from Org', async () => {
        const removeUserRes1 = await userHelpers.removeUserFromOrg(
          { gqlClient, options: superAdmin.options },
          {
            userId: org2Setup.adminUser.userId,
            organizationGuid: org1Setup.org.guid
          }
        );
        expect(removeUserRes1).toBeDefined();
        const removedUser1 = _.get(
          removeUserRes1,
          'removeUserFromOrganization'
        );
        expect(removedUser1.id).toEqual(org2Setup.adminUser.userId);

        const removeUserRes2 = await userHelpers.removeUserFromOrg(
          { gqlClient, options: superAdmin.options },
          {
            userId: org2Setup.regularUser.userId,
            organizationGuid: org1Setup.org.guid
          }
        );
        expect(removeUserRes2).toBeDefined();
        const removedUser2 = _.get(
          removeUserRes2,
          'removeUserFromOrganization'
        );
        expect(removedUser2.id).toEqual(org2Setup.regularUser.userId);
      });
    });
  });

  describe(`user invite with authGroup`, () => {
    let tokenOptions;
    beforeAll(async () => {
      tokenOptions = org1Setup.regularUser.requestOptions;
      const authGroupRes = await gqlClient.query(
        `  query au{
              authGroups (limit: 100) {
                records {
                  id
                  name
                }
              }
            }`,
        {},
        org2Setup.adminUser.requestOptions
      );
      const authGroup = _.get(authGroupRes, 'authGroups.records');
      adminAuthGroup = authGroup.find((auth) =>
        auth.name.includes('Administrator')
      );
      userAuthGroup = authGroup.find((auth) => auth.name.includes('User'));
    });

    it('Check user invite should success', async () => {
      const listInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
        { gqlClient, options: superAdmin.options },
        {
          orgId: org2Setup.org.id,
          inviteStatuses: ['submitted', 'completed', 'approved']
        }
      );

      const listInvite = _.get(
        listInviteRes,
        'organization.organizationInvites'
      );

      expect(listInvite.length).toEqual(0);
    });

    xit('Create org invite with authGroup Admin should fail', async () => {
      const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: org2Setup.regularUser.requestOptions },
        {
          organizationId: org2Setup.org.id,
          email: org1Setup.regularUser.email,
          message: 'test email 3',
          applicationRoles,
          authGroupIds: [adminAuthGroup.id]
        }
      );
      await expect(orgInviteRes).rejects.toThrow();
    });

    it('Create org invite with invalid authGroupId string should fail', async () => {
      const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: org2Setup.regularUser.requestOptions },
        {
          organizationId: org2Setup.org.id,
          email: org1Setup.regularUser.email,
          message: 'test email invalid uuid',
          applicationRoles,
          authGroupIds: ['invalid-uuid']
        }
      );
      await expect(orgInviteRes).rejects.toThrow(/Invalid authGroupId/);
    });

    it('Create org invite with nonexistent authGroupId should fail', async () => {
      const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: org2Setup.regularUser.requestOptions },
        {
          organizationId: org2Setup.org.id,
          email: org1Setup.regularUser.email,
          message: 'test email nonexistent uuid',
          applicationRoles,
          authGroupIds: ['6017d062-252f-4ec2-82e1-79066f7d35e4']
        }
      );
      await expect(orgInviteRes).rejects.toThrow(
        /One or more authGroupIds do not exist in the organization/
      );
    });

    it('Create org invite with authGroup User should success', async () => {
      const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: org2Setup.regularUser.requestOptions },
        {
          organizationId: org2Setup.org.id,
          email: org1Setup.adminUser.email,
          message: 'test email 4',
          applicationRoles,
          authGroupIds: [userAuthGroup.id]
        }
      );

      invitations.first = _.get(orgInviteRes, 'createOrganizationInvite');
      trackCreatedInvite(invitations.first.id);
      expect(invitations.first.id).toBeDefined();
      expect(invitations.first.email).toEqual(org1Setup.adminUser.email);
      expect(invitations.first.status).toEqual('submitted');
      expect(invitations.first.organization.id).toEqual(org2Setup.org.id);
    });

    it('admin approve should success', async () => {
      const approveRes = await orgInviteHelpers.helpUpdateOrgInvite(
        { gqlClient, options: superAdmin.options },
        {
          organizationInviteId: invitations.first.id,
          applicationRoles: [],
          action: 'approve'
        }
      );

      const approve = _.get(approveRes, 'updateOrganizationInvite');

      expect(approve.id).toEqual(invitations.first.id);
      expect(approve.status).toEqual('approved');
      emailCount++;
      inviteEmails.add(org1Setup.adminUser.email);
    });

    it('Invitee accept invitation should success', async () => {
      const inviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
        { gqlClient, options: org1Setup.adminUser.requestOptions },
        {
          organizationInviteId: invitations.first.id,
          applicationRoles: [],
          action: 'complete'
        }
      );

      const invite = _.get(inviteRes, 'updateOrganizationInvite');

      expect(invite.id).toEqual(invitations.first.id);
      expect(invite.status).toEqual('completed');
    });

    it('Invitee can login to org', async () => {
      const loginRes = await userHelpers.loginUser(
        { gqlClient },
        {
          userName: org1Setup.adminUser.username,
          password: 'testUserPassword',
          organizationGuid: org2Setup.org.guid
        }
      );

      expect(loginRes).toBeDefined();
      expect(loginRes.user.id).toEqual(org1Setup.adminUser.userId);
      expect(loginRes.organization.id).toEqual(org2Setup.org.id);
      expect(loginRes.token).toBeDefined();
      newLoginOption = helpers.requestOptions(loginRes.token);
    });

    xit('Invitee should have authGroup user', async () => {
      const userRes = await userHelpers.getMyInfo({
        gqlClient,
        options: newLoginOption
      });
      const user = _.get(userRes, 'me');
      expect(user).toBeDefined();
      const authGroupIds = _.get(user, 'authGroupIds');
      expect(authGroupIds).toContain(userAuthGroup.id);
    });

    it('delete org invite', async () => {
      const deleteResFirst = await orgInviteHelpers.helpDeleteOrgInvite(
        { gqlClient, options: superAdmin.options },
        invitations.first.id
      );
      expect(deleteResFirst).toBeDefined();
      const deleted1 = _.get(deleteResFirst, 'deleteOrganizationInvite');
      expect(deleted1.id).toEqual(invitations.first.id);
    });

    it('remove user from Org', async () => {
      const removeUserRes1 = await userHelpers.removeUserFromOrg(
        { gqlClient, options: superAdmin.options },
        {
          userId: org1Setup.adminUser.userId,
          organizationGuid: org2Setup.org.guid
        }
      );
      expect(removeUserRes1).toBeDefined();
      const removedUser1 = _.get(removeUserRes1, 'removeUserFromOrganization');
      expect(removedUser1.id).toEqual(org1Setup.adminUser.userId);
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
          enableRBACFeature: 'enabled'
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
