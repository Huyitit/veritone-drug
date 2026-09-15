import { v4 as uuidv4 } from 'uuid';
const chakram = require('chakram');
const helpers = require('../../../../helpers/index');
const orgInviteHelpers = require('../../../../helpers/orgInvite');
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  OrganizationInviteAction,
  UserStatus,
  OrganizationType
} from '../../src/gql';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import { safe } from '../../src/helpers/commonHelper';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;
const MAILPIT_BASE_URL =
  process.env.NODE_ENV === 'test'
    ? 'http://mailpit:8025'
    : 'http://localhost:8025';

let gqlClient: GraphqlClient;

const superAdmin = {
  options: {} as Record<string, string>,
  token: ''
};

const org1Setup: any = { org: {}, adminUser: {}, regularUser: {}, newUser: {} };
let invitations: any = { first: {}, second: {} };

const applicationRoles = [
  {
    applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
    roleId: '912e377e-f4a4-4184-8db1-baa9670d8081'
  }
];
let emailCount = 0;
const inviteEmails = new Set<string>();
const createdInviteIds = new Set<string>();
const createdUserEmails = new Set<string>();

function trackInvite(inviteId?: string) {
  expect(inviteId).toBeDefined();

  if (inviteId) {
    createdInviteIds.add(inviteId);
  }
}

function trackInviteEmail(email?: string) {
  if (email && !inviteEmails.has(email)) {
    emailCount++;
    inviteEmails.add(email);
  }
}

function trackCreatedUserEmail(email?: string) {
  if (email) {
    createdUserEmails.add(email);
  }
}

describe('citest_orginvite: User basic org invite new user', () => {
  let newEmail: string;
  let newToken: string | undefined;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      process.env.NODE_ENV
    );

    expect(gqlClient.sessionToken).toBeDefined();
    superAdmin.token = gqlClient.sessionToken!;
    superAdmin.options = helpers.requestOptions(superAdmin.token).headers;

    const testOrg1 = await setupTestOrgAndUser(
      gqlClient,
      createOrgAndUserInput(citestMarker + '-org-invite-1-')
    );
    org1Setup.org = testOrg1.org;
    org1Setup.adminUser = testOrg1.listOptions.find((o: any) =>
      o.userName?.includes('admin-')
    );
    org1Setup.regularUser = testOrg1.listOptions.find((o: any) =>
      o.userName?.includes('regular-')
    );
  });

  describe('OrganizationInvite flow - User role invite new user', () => {
    let tokenOptions: Record<string, string>;
    beforeAll(() => {
      newEmail = 'thoang2+new-' + uuidv4() + '@veritone.com';
      tokenOptions = org1Setup.regularUser.requestOptions;
    });

    describe('Invite new users', () => {
      it('Check new user email should not exist', async () => {
        const fetchUserRes = await gqlClient.sdk.users(
          {
            name: newEmail,
            status: UserStatus.Active,
            includeAllOrgUsers: true,
            limit: 200
          },
          superAdmin.options
        );

        const listUsers = fetchUserRes?.data?.users?.records ?? [];
        const user = listUsers.find((u: any) => u.email === newEmail);
        expect(user).toBeUndefined();
      });

      it('Create org invite for new user should success', async () => {
        const orgInviteRes = await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 1',
              applicationRoles
            }
          },
          tokenOptions
        );

        invitations.first = orgInviteRes?.data?.createOrganizationInvite;
        expect(invitations.first.id).toBeDefined();
        expect(invitations.first.email).toEqual(newEmail);
        expect(invitations.first.status).toEqual('submitted');
        expect(invitations.first.organization.id).toEqual(org1Setup.org.id);
        trackInvite(invitations.first.id);
      });

      it('Re create org invite for new user again should success', async () => {
        const orgInviteRes = await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 2',
              applicationRoles
            }
          },
          tokenOptions
        );

        invitations.second = orgInviteRes?.data?.createOrganizationInvite;
        expect(invitations.second.id).toBeDefined();
        expect(invitations.second.email).toEqual(newEmail);
        expect(invitations.second.status).toEqual('submitted');
        expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
        trackInvite(invitations.second.id);
      });

      it('Previous invitation is rejected', async () => {
        const listInviteRes = await gqlClient.sdk.organization(
          { id: org1Setup.org.id },
          superAdmin.options
        );
        const invites =
          listInviteRes?.data?.organization?.organizationInvites ?? [];
        const oldInvite = invites.find(
          (i: any) => i.id === invitations.first.id
        );
        expect(oldInvite).toBeDefined();
        expect(oldInvite?.status).toEqual('rejected');
      });

      it('Admin reject invitation should success', async () => {
        const updateQuery = `mutation updateInv( $organizationInviteId: ID!, $message: String, $applicationRoles: [ApplicationInviteRoleInput!]!, $action: OrganizationInviteAction ) { updateOrganizationInvite(input: { organizationInviteId: $organizationInviteId, message: $message, applicationRoles: $applicationRoles, action: $action }) { id email organization { id } invitee { name email } status } }`;

        const rejectInviteRes = await gqlClient.query(
          updateQuery,
          {
            organizationInviteId: invitations.second.id,
            applicationRoles: [],
            action: OrganizationInviteAction.Reject
          },
          superAdmin.options
        );

        const reject = rejectInviteRes?.updateOrganizationInvite;
        expect(reject?.email).toEqual(newEmail);
        expect(reject?.status).toEqual('rejected');
        expect(reject?.organization?.id).toEqual(org1Setup.org.id);
      });

      it('Create org invite for new user again (rejected) should fail', async () => {
        const orgInviteRes = gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 3',
              applicationRoles
            }
          },
          tokenOptions
        );
        await expect(orgInviteRes).rejects.toThrow(
          /previously rejected by an administrator/
        );
      });

      it('Admin create org invite for new user again should success', async () => {
        const orgInviteRes = await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email',
              applicationRoles
            }
          },
          superAdmin.options
        );

        invitations.second = orgInviteRes?.data?.createOrganizationInvite;
        expect(invitations.second.id).toBeDefined();
        expect(invitations.second.email).toEqual(newEmail);
        expect(invitations.second.status).toEqual('approved');
        expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
        trackInvite(invitations.second.id);
        trackInviteEmail(newEmail);
      });

      it('Verify invitation is approved', async () => {
        const listInviteRes = await gqlClient.sdk.organization(
          { id: org1Setup.org.id },
          superAdmin.options
        );
        const invites =
          listInviteRes?.data?.organization?.organizationInvites ?? [];
        const approve = invites.find(
          (invite: any) =>
            invite.id === invitations.second.id &&
            invite.email === newEmail &&
            invite.status === 'approved'
        );
        expect(approve).toBeDefined();
        expect(approve?.email).toEqual(newEmail);
        expect(approve?.status).toEqual('approved');
      });

      it('New user email not existed in system', async () => {
        const fetchUserRes = await gqlClient.sdk.users(
          {
            name: newEmail,
            status: UserStatus.Active,
            includeAllOrgUsers: true,
            limit: 200
          },
          superAdmin.options
        );
        const listUsers = fetchUserRes?.data?.users?.records ?? [];
        expect(listUsers.length).toEqual(0);
      });

      it('Run reset password API for new user should fail (user not created)', async () => {
        const queryOrg = `query fetchOrgInvite($orgId: ID!, $organizationInviteId: ID, $inviteType: OrganizationInviteType, $email: String) { organization(id: $orgId) { organizationInvites(organizationInviteId: $organizationInviteId, inviteType: $inviteType, email: $email) { id status email passwordResetToken userDetails expirationDate invitationLink } } }`;

        const variables = {
          orgId: org1Setup.org.id,
          passwordResetToken: true,
          inviteStatuses: ['approved']
        };

        const listInviteRes = await gqlClient.query(
          queryOrg,
          variables,
          superAdmin.options as any
        );
        const listInvite =
          listInviteRes?.organization?.organizationInvites ?? [];
        const preInvite = listInvite.find(
          (inv: any) => inv.email === newEmail && inv.status === 'approved'
        );
        expect(preInvite).toBeDefined();
        invitations.second = preInvite;
        newToken = preInvite?.passwordResetToken;

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
        const updateQuery = `mutation updateInv($organizationInviteId: ID!, $message: String, $applicationRoles: [ApplicationInviteRoleInput!]!, $action: OrganizationInviteAction) { updateOrganizationInvite(input: { organizationInviteId: $organizationInviteId, message: $message, applicationRoles: $applicationRoles, action: $action }) { id status } }`;

        const inviteRes = await gqlClient.query(
          updateQuery,
          {
            organizationInviteId: invitations.second.id,
            applicationRoles: [],
            action: OrganizationInviteAction.Complete
          },
          helpers.requestOptions(newToken).headers
        );
        const invite = inviteRes?.updateOrganizationInvite;
        expect(invite?.id).toEqual(invitations.second.id);
        expect(invite?.status).toEqual('completed');
      });

      it('New user is created', async () => {
        const fetchUserRes = await gqlClient.sdk.users(
          {
            name: newEmail,
            status: UserStatus.Active,
            includeAllOrgUsers: true,
            limit: 200
          },
          superAdmin.options
        );
        const listUsers = fetchUserRes?.data?.users?.records ?? [];
        expect(listUsers.length).toEqual(1);
        expect(listUsers[0]?.email).toEqual(newEmail);
        expect(listUsers[0]?.status).toEqual('active');
        trackCreatedUserEmail(newEmail);
      });

      it('Org user should included invitee', async () => {
        const listUserRes = await gqlClient.sdk.organizations(
          { id: org1Setup.org.id },
          superAdmin.options
        );
        const listUser =
          listUserRes?.data?.organizations?.records?.[0]?.users?.records ?? [];
        const invitee = listUser.find((u: any) => u.email === newEmail);
        expect(invitee).toBeDefined();
        expect(invitee?.email).toEqual(newEmail);
        org1Setup.newUser.userId = invitee?.id;
        org1Setup.newUser.username = invitee?.name;
        org1Setup.newUser.email = invitee?.email;
      });

      it('Run reset password for user email should success', async () => {
        const resetPasswordRes = await orgInviteHelpers.helpResetPasswordInvite(
          {
            baseUrl: config.core_admin_url,
            invitation: invitations.second,
            userName: newEmail,
            password: 'testPassword',
            ApiPath: '/admin/org-invite/password/reset'
          }
        );
        expect(resetPasswordRes).toBeDefined();
        expect(resetPasswordRes.error).toEqual(false);
        expect(resetPasswordRes.statusCode).toEqual(204);
      });

      it('Invitee can login to org', async () => {
        const loginRes = await gqlClient.sdk.userLogin({
          input: {
            userName: org1Setup.newUser.username,
            password: 'testPassword',
            organizationGuid: org1Setup.org.guid
          }
        });
        const login = loginRes?.data?.userLogin;
        expect(login).toBeDefined();
        expect(login?.user?.id).toEqual(org1Setup.newUser.userId);
        expect(login?.organization?.id).toEqual(org1Setup.org.id);
      });

      it('Delete old invitation should success', async () => {
        const deleteInviteRes = await gqlClient.sdk.deleteOrganizationInvite(
          { id: invitations.second.id },
          superAdmin.options
        );
        const deletedInvite = deleteInviteRes?.data?.deleteOrganizationInvite;
        expect(deletedInvite).toBeDefined();
        expect(deletedInvite?.id).toEqual(invitations.second.id);
        createdInviteIds.delete(invitations.second.id);
      });

      it('Remove invitee from org should fail - user is belong to only one org', async () => {
        const removeUserRes = gqlClient.sdk.removeUserFromOrganization(
          {
            organizationGuid: org1Setup.org.guid,
            userId: org1Setup.newUser.userId
          },
          superAdmin.options
        );

        await expect(removeUserRes).rejects.toThrow(
          /User .* can not be removed from the only one organization it belongs to/
        );
      });

      it('Invite user again should fail', async () => {
        const orgInviteRes = gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 3',
              applicationRoles
            }
          },
          tokenOptions
        );

        await expect(orgInviteRes).rejects.toThrow(
          /This user is already a member of this organization/
        );
      });

      //   afterAll(async () => {
      //     const getInvitesRes = await gqlClient.sdk.organization(
      //       { id: org1Setup.org.id },
      //       tokenOptions
      //     );
      //     const invites =
      //       getInvitesRes?.data?.organization?.organizationInvites ?? [];
      //     await Promise.all(
      //       invites.map((inv: any) =>
      //         gqlClient.sdk.deleteOrganizationInvite({ id: inv.id }, tokenOptions)
      //       )
      //     );
      //   });
    });
  });

  afterAll(async () => {
    const { messageIds } = await getEmailCountFromMailpit();
    if (messageIds.size > 0) {
      await safe('delete mailpit org invite messages', async () =>
        chakram.delete(`${MAILPIT_BASE_URL}/api/v1/messages`, {
          ids: Array.from(messageIds)
        })
      );
    }

    if (org1Setup?.org?.id) {
      await deleteRemainingInvites(org1Setup.org.id);
    }

    trackCreatedUserEmail(newEmail);
    await collectCreatedNewUserIds();

    const listUsersIds = [
      org1Setup?.adminUser?.userId,
      org1Setup?.regularUser?.userId,
      org1Setup?.newUser?.userId
    ].filter((id): id is string => Boolean(id));

    for (const userId of Array.from(new Set(listUsersIds))) {
      await safe(`delete user ${userId}`, () =>
        gqlClient.sdk.deleteUser({ id: userId })
      );
    }

    if (org1Setup?.org?.id) {
      await safe(`delete org ${org1Setup.org.id}`, () =>
        gqlClient.sdk.updateOrganization({
          input: { id: org1Setup.org.id, status: 'deleted' }
        })
      );
    }
  });
});

async function deleteRemainingInvites(orgId: string) {
  const getInviteRes = await safe(
    `fetch org ${orgId} invites for cleanup`,
    () => gqlClient.sdk.organization({ id: orgId }, superAdmin.options)
  );

  const getInvites =
    getInviteRes?.data?.organization?.organizationInvites ?? [];

  await Promise.all(
    getInvites
      .filter((inv: any) => inv?.id && inv.status !== 'deleted')
      .map((inv: any) =>
        safe(`delete org invite ${inv.id}`, async () => {
          await gqlClient.sdk.deleteOrganizationInvite(
            { id: inv.id },
            superAdmin.options
          );
          createdInviteIds.delete(inv.id);
        })
      )
  );
}

async function collectCreatedNewUserIds() {
  for (const email of createdUserEmails) {
    const fetchUserRes = await safe(`fetch created user ${email}`, () =>
      gqlClient.sdk.users(
        {
          name: email,
          status: UserStatus.Active,
          includeAllOrgUsers: true,
          limit: 200
        },
        superAdmin.options
      )
    );

    const users = fetchUserRes?.data?.users?.records ?? [];
    const user = users.find((u: any) => u.email === email);

    if (user?.id) {
      org1Setup.newUser.userId = user.id;
    }
  }
}

function createOrgAndUserInput(orgName: string) {
  const uniqueId = uuidv4();

  return {
    orgInput: {
      name: orgName + uniqueId,
      businessUnit: 'Legal',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
      metadata: { features: { enableRBACFeature: 'disabled' } },
      applications: [
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
        name: `thoang2+admin-${uniqueId}@veritone.com`,
        email: `thoang2+admin-${uniqueId}@veritone.com`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652',
          '032218c3-d47e-4287-9d16-7bb867c01266',
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
        ].filter(Boolean)
      },
      {
        name: `thoang2+regular-${uniqueId}@veritone.com`,
        email: `thoang2+regular-${uniqueId}@veritone.com`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828']
      }
    ]
  };
}

async function getEmailCountFromMailpit() {
  let messagesCount = 0;
  const maxRetries = 5;
  let retries = 0;
  const messageIds = new Set<string>();

  while (messagesCount < emailCount && retries < maxRetries) {
    const res = await chakram.get(`${MAILPIT_BASE_URL}/api/v1/messages`);
    const messages = res.body?.messages ?? [];

    messagesCount = messages.filter((message: any) => {
      const email = message?.To?.[0]?.Address;
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
