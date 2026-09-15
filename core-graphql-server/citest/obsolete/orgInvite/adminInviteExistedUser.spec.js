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

describe('citest_orginvite: Admin basic org invite existed user', () => {
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

  describe.each(['superAdmin', 'orgAdmin'])(
    'OrganizationInvite flow - %s invite handling',
    (tokenType) => {
      let tokenOptions;
      beforeAll(() => {
        tokenOptions =
          tokenType === 'superAdmin'
            ? superAdmin.options
            : org1Setup.adminUser.requestOptions;
      });

      describe(`${tokenType} invite existed users`, () => {
        it('Check user invite should success', async () => {
          const listInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
            { gqlClient, options: tokenOptions },
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
          expect(invitations.first.status).toEqual('approved');
          expect(invitations.first.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
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
          expect(invitations.second.email).toEqual(org2Setup.regularUser.email);
          expect(invitations.second.status).toEqual('approved');
          expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
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

        it('Create invite for current member should fail', async () => {
          const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: org1Setup.regularUser.email,
              message: 'test email 3',
              applicationRoles
            }
          );

          await expect(orgInviteRes).rejects.toThrow(
            /This user is already a member of this organization/
          );
        });

        it('Check org invitation status approved, submitted', async () => {
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

        it('Check user invitation', async () => {
          const getInviteRes = await userHelpers.getUsers(
            { gqlClient, options: org2Setup.adminUser.requestOptions },
            {
              ids: [org2Setup.regularUser.userId],
              organizationIds: [org2Setup.org.id]
            }
          );

          const users = _.get(getInviteRes, 'users.records');
          expect(users.length).toEqual(1);
          expect(users[0].id).toEqual(org2Setup.regularUser.userId);
          expect(users[0].organizationInvites).toBeDefined();
          const invites = _.get(users[0], 'organizationInvites');
          const approvedInvites = invites.filter(
            (inv) => inv.status === 'approved'
          );
          expect(approvedInvites.length).toEqual(1);
          expect(approvedInvites[0].id).toEqual(invitations.second.id);
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
          expect(resend.email).toEqual(org2Setup.regularUser.email);
          expect(resend.status).toEqual('approved');
          expect(resend.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
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
          const invitee = listUser.filter(
            (u) => u.id === org2Setup.regularUser.userId
          );
          expect(invitee.length).toEqual(0);
        });

        it('Admin complete invitation for user should fail', async () => {
          const inviteRes = orgInviteHelpers.helpUpdateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationInviteId: invitations.second.id,
              applicationRoles: [],
              action: 'complete'
            }
          );

          await expect(inviteRes).rejects.toThrow(
            /Complete action is only allowed by Invitee/
          );
        });

        it('Invitee accept invitation with out app role should fail', async () => {
          const inviteRes = orgInviteHelpers.helpUpdateOrgInvite(
            { gqlClient, options: org2Setup.regularUser.requestOptions },
            {
              organizationInviteId: invitations.second.id,
              action: 'complete'
            }
          );

          await expect(inviteRes).rejects.toThrow(
            /applicationRoles.* was not provided/
          );
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
            { gqlClient, options: tokenOptions },
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

        it('Invite user again should fail', async () => {
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
            /This user is already a member of this organization/
          );
        });

        it('Remove invitee from org should success', async () => {
          const removeRes = await userHelpers.removeUserFromOrg(
            { gqlClient, options: tokenOptions },
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
            { gqlClient, options: tokenOptions },
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

        it('Invite user again without delete invitation should success', async () => {
          const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: org2Setup.regularUser.email,
              message: 'test email 5',
              applicationRoles
            }
          );

          const invite = _.get(orgInviteRes, 'createOrganizationInvite');
          expect(invite.id).toBeDefined();
          expect(invite.email).toEqual(org2Setup.regularUser.email);
          expect(invite.status).toEqual('approved');
          invitations.second = invite;
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
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

        it('Create org invite for existed user again should success', async () => {
          const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: org2Setup.regularUser.email,
              message: 'test email 6',
              applicationRoles
            }
          );

          invitations.second = _.get(orgInviteRes, 'createOrganizationInvite');
          expect(invitations.second.id).toBeDefined();
          expect(invitations.second.email).toEqual(org2Setup.regularUser.email);
          expect(invitations.second.status).toEqual('approved');
          expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
        });

        xit('Invitee login to org should fail', async () => {
          const loginRes = userHelpers.loginUser(
            { gqlClient },
            {
              userName: org2Setup.regularUser.username,
              password: 'testUserPassword',
              organizationGuid: org1Setup.org.guid
            }
          );

          await expect(loginRes).rejects.toThrow();
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
        });

        it('Delete invitation and remove user from org should success', async () => {
          const removeRes = await userHelpers.removeUserFromOrg(
            { gqlClient, options: tokenOptions },
            {
              organizationGuid: org1Setup.org.guid,
              userId: org2Setup.regularUser.userId
            }
          );

          const remove = _.get(removeRes, 'removeUserFromOrganization');
          expect(remove.id).toEqual(org2Setup.regularUser.userId);

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

        it('Create org invite for existed user again should success', async () => {
          const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: org2Setup.regularUser.email,
              message: 'test email 7',
              applicationRoles
            }
          );

          invitations.second = _.get(orgInviteRes, 'createOrganizationInvite');
          expect(invitations.second.id).toBeDefined();
          expect(invitations.second.email).toEqual(org2Setup.regularUser.email);
          expect(invitations.second.status).toEqual('approved');
          expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
        });

        it('Delete invitation should success', async () => {
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

        it('Invitee accept invitation should fail', async () => {
          const inviteRes = orgInviteHelpers.helpUpdateOrgInvite(
            { gqlClient, options: org2Setup.regularUser.requestOptions },
            {
              organizationInviteId: invitations.second.id,
              applicationRoles: [],
              action: 'complete'
            }
          );

          await expect(inviteRes).rejects.toThrow(
            /organizationInviteId not found/
          );
        });
      });

      afterAll(async () => {
        await safeDeleteOrgInvites(org1Setup.org.id);
      });
    }
  );

  describe('Invite deactivated/deleted user already in org', () => {
    // This test creates a user in org1, deactivates them, then tests:
    // 1. Super admin invite should succeed (reactivate user + create completed invite)
    // 2. Org admin invite should fail with NotAllowed

    let deactivatedUser = {};
    let deactivatedUserInvite = {};

    beforeAll(async () => {
      // Create a new user directly in org1
      const uniqueId = uuid.v4();
      const deactivatedUserEmail = `${citestMarker}-deactivated-user+${uniqueId}@veritone.com`;

      const createUserQuery = `mutation createUser($input: CreateUser!) {
        createUser(input: $input) {
          id
          name
          status
        }
      }`;

      const createUserRes = await gqlClient.query(
        createUserQuery,
        {
          input: {
            name: deactivatedUserEmail,
            organizationId: org1Setup.org.id,
            roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'],
            firstName: 'Deactivated',
            lastName: 'User'
          }
        },
        superAdmin.options
      );

      deactivatedUser = {
        userId: _.get(createUserRes, 'createUser.id'),
        email: deactivatedUserEmail
      };

      expect(deactivatedUser.userId).toBeDefined();
      trackCreatedUser(deactivatedUser.userId);
    });

    describe.each(['deleted', 'inactive', 'suspended'])(
      'Super admin invite user with status "%s" in org should succeed',
      (targetStatus) => {
        it(`Set user status to "${targetStatus}"`, async () => {
          const updateStatusQuery = `mutation {
            updateUserStatus(input: {
              id: "${deactivatedUser.userId}"
              status: ${targetStatus}
            }) {
              id
              status
            }
          }`;

          const result = await gqlClient.query(
            updateStatusQuery,
            null,
            superAdmin.options
          );
          expect(_.get(result, 'updateUserStatus.status')).toEqual(
            targetStatus
          );
        });

        it(`Super admin invite "${targetStatus}" user should succeed and create completed invite`, async () => {
          const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: superAdmin.options },
            {
              organizationId: org1Setup.org.id,
              email: deactivatedUser.email,
              message: `test invite ${targetStatus} user`,
              applicationRoles
            }
          );

          deactivatedUserInvite = _.get(
            orgInviteRes,
            'createOrganizationInvite'
          );
          expect(deactivatedUserInvite.id).toBeDefined();
          expect(deactivatedUserInvite.email).toEqual(deactivatedUser.email);
          expect(deactivatedUserInvite.organization.id).toEqual(
            org1Setup.org.id
          );
        });

        it('User status should be active after super admin invite', async () => {
          const getUserQuery = `query {
            user(id: "${deactivatedUser.userId}", organizationIds: [${org1Setup.org.id}]) {
                id
                email
                name
                status
            }
          }`;

          const result = await gqlClient.query(
            getUserQuery,
            null,
            superAdmin.options
          );
          const user = _.get(result, 'user');
          expect(user).toBeDefined();
          expect(user.status).toEqual('active');
        });

        it('Cleanup: delete the invite', async () => {
          if (deactivatedUserInvite.id) {
            const deleteRes = await orgInviteHelpers.helpDeleteOrgInvite(
              { gqlClient, options: superAdmin.options },
              deactivatedUserInvite.id
            );
            expect(_.get(deleteRes, 'deleteOrganizationInvite.id')).toEqual(
              deactivatedUserInvite.id
            );
          }
        });
      }
    );

    describe.each(['deleted', 'inactive', 'suspended'])(
      'Org admin invite user with status "%s" in org should fail',
      (targetStatus) => {
        it(`Set user status to "${targetStatus}"`, async () => {
          const updateStatusQuery = `mutation {
            updateUserStatus(input: {
              id: "${deactivatedUser.userId}"
              status: ${targetStatus}
            }) {
              id
              status
            }
          }`;

          const result = await gqlClient.query(
            updateStatusQuery,
            null,
            superAdmin.options
          );
          expect(_.get(result, 'updateUserStatus.status')).toEqual(
            targetStatus
          );
        });

        it(`Org admin invite "${targetStatus}" user should fail`, async () => {
          const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: org1Setup.adminUser.requestOptions },
            {
              organizationId: org1Setup.org.id,
              email: deactivatedUser.email,
              message: `test org admin invite ${targetStatus} user`,
              applicationRoles
            }
          );

          await expect(orgInviteRes).rejects.toThrow(
            /This user is already a member of this organization/
          );
        });
      }
    );

    afterAll(async () => {
      if (!deactivatedUser.userId) {
        return;
      }

      await safe('reactivate deactivated invite test user', async () => {
        const updateStatusQuery = `mutation {
          updateUserStatus(input: {
            id: "${deactivatedUser.userId}"
            status: active
          }) {
            id
            status
          }
        }`;
        await gqlClient.query(updateStatusQuery, null, superAdmin.options);
      });

      await safeDeleteUsers([deactivatedUser.userId]);
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
        name: `${citestMarker}-admin-user+${uniqueId}@veritone.com`,
        email: `${citestMarker}-admin-user+${uniqueId}@veritone.com`,

        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'regularUser',
        name: `${citestMarker}-regular-user+${uniqueId}@veritone.com`,
        email: `${citestMarker}-regular-user+${uniqueId}@veritone.com`,
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
