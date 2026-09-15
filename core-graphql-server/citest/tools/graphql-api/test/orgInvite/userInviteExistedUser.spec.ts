import { v4 as uuidv4 } from 'uuid';
const chakram = require('chakram');
const helpers = require('../../../../helpers/index');
const orgHelpers = require('../../../../helpers/organization');
import {
  AuthType,
  buildRequestHeaders,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { OrganizationInviteAction, OrganizationType } from '../../src/gql';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import { safe } from '../../src/helpers/commonHelper';

const config = helpers.config;
const env = config.env;
const MAILPIT_BASE_URL =
  process.env.NODE_ENV === 'test'
    ? 'http://mailpit:8025' // run on ci pipeline
    : 'http://localhost:8025'; // run on local

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;
const enableStrictRoleValidation = (global as any).enableStrictRoleValidation ?? false;

const superAdmin = {
  options: {} as Record<string, string>,
  token: ''
};

const org1Setup = {
  org: {} as any,
  adminUser: {} as any,
  regularUser: {} as any
};

const org2Setup = {
  org: {} as any,
  adminUser: {} as any,
  regularUser: {} as any
};

let invitations: { first: any; second: any } = { first: {}, second: {} };

const applicationRoles = [
  {
    applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
    roleId: '912e377e-f4a4-4184-8db1-baa9670d8081'
  }
];

let emailCount = 0;
const inviteEmails = new Set<string>();
const createdInviteIds = new Set<string>();
const crossOrgMemberships = new Map<
  string,
  { userId: string; organizationGuid: string }
>();

function trackInvite(inviteId?: string) {
  expect(inviteId).toBeDefined();

  if (inviteId) {
    createdInviteIds.add(inviteId);
  }
}

function trackInviteEmail(email?: string) {
  if (email) {
    emailCount++;
    inviteEmails.add(email);
  }
}

function trackCrossOrgMembership(userId?: string, organizationGuid?: string) {
  if (userId && organizationGuid) {
    crossOrgMemberships.set(`${organizationGuid}:${userId}`, {
      userId,
      organizationGuid
    });
  }
}

let gqlClient: GraphqlClient;
let adminOrg1RequestHeaders: Record<string, string>;
let regularUserOrg1RequestHeaders: Record<string, string>;

describe('citest_orginvite: User basic org invite existed user', () => {
  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

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
    adminOrg1RequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: org1Setup.adminUser.userName,
      password: org1Setup.adminUser.password
    });

    org1Setup.regularUser = testOrg1.listOptions.find((o: any) =>
      o.userName?.includes('regular-')
    );
    regularUserOrg1RequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: org1Setup.regularUser.userName,
      password: org1Setup.regularUser.password
    });

    const testOrg2 = await setupTestOrgAndUser(
      gqlClient,
      createOrgAndUserInput(citestMarker + '-org-invite-2-')
    );
    org2Setup.org = testOrg2.org;
    org2Setup.adminUser = testOrg2.listOptions.find((o: any) =>
      o.userName?.includes('admin-')
    );

    org2Setup.regularUser = testOrg2.listOptions.find((o: any) =>
      o.userName?.includes('regular-')
    );
  });

  describe('OrganizationInvite flow', () => {
    let tokenOptions: Record<string, string>;
    beforeAll(() => {
      tokenOptions = regularUserOrg1RequestHeaders;
    });

    describe('Invite existed users', () => {
      it('Check user invite should success', async () => {
        const listInviteRes = await gqlClient.sdk.organization(
          { id: org1Setup.org.id },
          superAdmin.options
        );

        const listInvite =
          listInviteRes?.data?.organization?.organizationInvites ?? [];

        const filtered = listInvite.filter((inv: any) =>
          ['submitted', 'completed', 'approved'].includes(inv.status)
        );

        expect(filtered.length).toEqual(0);
      });

      it('Create org invite for existed user should success', async () => {
        const orgInviteRes = await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: org2Setup.regularUser.email,
              message: 'test email 1',
              applicationRoles
            }
          },
          tokenOptions
        );

        invitations.first = orgInviteRes?.data?.createOrganizationInvite;
        expect(invitations.first.id).toBeDefined();
        expect(invitations.first.email).toEqual(org2Setup.regularUser.email);
        expect(invitations.first.status).toEqual('submitted');
        expect(invitations.first.organization.id).toEqual(org1Setup.org.id);
        trackInvite(invitations.first.id);
        trackInviteEmail(org2Setup.regularUser.email);
      });

      it('Create org invite for existed user with invalid application id should fail', async () => {
        if (!enableStrictRoleValidation) return;
        const orgInviteRes = gqlClient.sdk.createOrgInvite(
          {
            input: {
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
          },
          tokenOptions
        );

        await expect(orgInviteRes).rejects.toThrow(
          /The application was not found. It either does not exist or you or your organization do not have access to it./
        );
      });

      it('Create org invite for existed user with invalid role id should fail', async () => {
        if (!enableStrictRoleValidation) return;
        const orgInviteRes = gqlClient.sdk.createOrgInvite(
          {
            input: {
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
          },
          tokenOptions
        );

        await expect(orgInviteRes).rejects.toThrow(
          /The role was not found. It either does not exist or you or your organization do not have access to it./
        );
      });

      it('Re create org invite for existed user again should success', async () => {
        const orgInviteRes = await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: org2Setup.regularUser.email,
              message: 'test email 2',
              applicationRoles
            }
          },
          tokenOptions
        );

        invitations.second = orgInviteRes?.data?.createOrganizationInvite;
        expect(invitations.second.id).toBeDefined();
        expect(invitations.second.status).toEqual('submitted');
        trackInvite(invitations.second.id);
        trackInviteEmail(org2Setup.regularUser.email);
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

      it('Create invite for current member should fail', async () => {
        const orgInviteRes = gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: org1Setup.adminUser.email,
              message: 'test email 3',
              applicationRoles
            }
          },
          tokenOptions
        );

        await expect(orgInviteRes).rejects.toThrow(
          /This user is already a member/
        );
      });

      it('Admin reject invitation should success', async () => {
        const updateQuery = `mutation updateInv (
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
            organization { id guid }
            invitee { name email }
            status
          }
        }`;

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
        expect(reject.email).toEqual(org2Setup.regularUser.email);
        expect(reject.status).toEqual('rejected');
        expect(reject.organization.id).toEqual(org1Setup.org.id);
      });

      it('User not have any invitation', async () => {
        const meQuery = `query { me { id organizationInvites { id status } } }`;
        const getInviteRes = await gqlClient.query(
          meQuery,
          {},
          org2Setup.regularUser.requestOptions
        );

        const user = getInviteRes?.me;
        expect(user).toBeDefined();
        expect(user.id).toEqual(org2Setup.regularUser.userId);
        const invites = user.organizationInvites ?? [];
        const approvedInvites = invites.filter((inv: any) =>
          ['approved', 'submitted'].includes(inv.status)
        );
        expect(approvedInvites.length).toEqual(0);
      });

      it('Create org invite for existed user again (when rejected) should fail', async () => {
        const orgInviteRes = gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: org2Setup.regularUser.email,
              message: 'test email 4',
              applicationRoles
            }
          },
          tokenOptions
        );
        await expect(orgInviteRes).rejects.toThrow(
          /previously rejected by an administrator/
        );
      });

      it('Admin create org invite should success (bypass rejected)', async () => {
        const orgInviteRes = await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: org2Setup.regularUser.email,
              message: 'test email',
              applicationRoles
            }
          },
          superAdmin.options
        );

        const approve = orgInviteRes?.data?.createOrganizationInvite;
        expect(approve.email).toEqual(org2Setup.regularUser.email);
        expect(approve.status).toEqual('approved');
        expect(approve.organization.id).toEqual(org1Setup.org.id);
        invitations.second = approve;
        trackInvite(invitations.second.id);
        trackInviteEmail(org2Setup.regularUser.email);
      });

      xit('Create org invite for existed user again after approved should fail (regular user still blocked by rejection)', async () => {
        const orgInviteRes = gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: org2Setup.regularUser.email,
              message: 'test email 5',
              applicationRoles
            }
          },
          tokenOptions
        );
        await expect(orgInviteRes).rejects.toThrow(
          /previously rejected by an administrator/
        );
      });

      it('Org user should not included invitee', async () => {
        const listUserRes = await gqlClient.sdk.organizations(
          { limit: 100 },
          org1Setup.adminUser.requestOptions as any
        );
        const orgList = listUserRes?.data?.organizations?.records ?? [];
        const target = orgList.find((o: any) => o.id === org1Setup.org.id);
        const listUser = target?.users?.records ?? [];
        const invitee = listUser.filter(
          (u: any) => u.id === org2Setup.regularUser.userId
        );
        expect(invitee.length).toEqual(0);
      });

      xit('Invite user again without delete invitation should fail (regular user still blocked by rejection)', async () => {
        const orgInviteRes = gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: org2Setup.regularUser.email,
              message: 'test email 6',
              applicationRoles
            }
          },
          tokenOptions
        );
        await expect(orgInviteRes).rejects.toThrow(
          /previously rejected by an administrator/
        );
      });

      it('Invitee accept invitation should success', async () => {
        const updateQuery = `mutation updateInv ($organizationInviteId: ID!, $message: String, $applicationRoles: [ApplicationInviteRoleInput!]!, $action: OrganizationInviteAction) {
          updateOrganizationInvite (input: { organizationInviteId: $organizationInviteId, message: $message, applicationRoles: $applicationRoles, action: $action }){
            id
            status
          }
        }`;

        const inviteRes = await gqlClient.query(
          updateQuery,
          {
            organizationInviteId: invitations.second.id,
            applicationRoles: [],
            action: OrganizationInviteAction.Complete
          },
          org2Setup.regularUser.requestOptions
        );

        const invite = inviteRes?.updateOrganizationInvite;
        expect(invite.id).toEqual(invitations.second.id);
        expect(invite.status).toEqual('completed');
        trackCrossOrgMembership(
          org2Setup.regularUser.userId,
          org1Setup.org.guid
        );
      });

      it('Org user should included invitee', async () => {
        const listUserRes = await gqlClient.sdk.organizations(
          { id: org1Setup.org.id },
          superAdmin.options as any
        );
        const orgList = listUserRes?.data?.organizations?.records ?? [];
        const target = orgList.find((o: any) => o.id === org1Setup.org.id);
        const listUser = target?.users?.records ?? [];
        const invitee = listUser.find(
          (u: any) => u.id === org2Setup.regularUser.userId
        );
        expect(invitee).toBeDefined();
        expect(invitee?.id).toEqual(org2Setup.regularUser.userId);
      });

      it('Invitee can login to org', async () => {
        const loginRes = await gqlClient.sdk.userLogin({
          input: {
            userName:
              org2Setup.regularUser.userName || org2Setup.regularUser.username,
            password: org2Setup.regularUser.password || 'testUserPassword',
            organizationGuid: org1Setup.org.guid
          }
        });

        const login = loginRes?.data?.userLogin;
        expect(login).toBeDefined();
        expect(login?.user?.id).toEqual(org2Setup.regularUser.userId);
        expect(login?.organization?.id).toEqual(org1Setup.org.id);
      });

      it('Remove invitee from org should success', async () => {
        const removeRes = await gqlClient.sdk.removeUserFromOrganization({
          userId: org2Setup.regularUser.userId,
          organizationGuid: org1Setup.org.guid
        });

        const remove = removeRes?.data?.removeUserFromOrganization;
        expect(remove).toBeDefined();
        expect(remove?.id).toEqual(org2Setup.regularUser.userId);
        crossOrgMemberships.delete(
          `${org1Setup.org.guid}:${org2Setup.regularUser.userId}`
        );
      });

      it('Org user should not included invitee', async () => {
        const listUserRes = await gqlClient.sdk.organizations(
          { limit: 100 },
          superAdmin.options as any
        );
        const orgList = listUserRes?.data?.organizations?.records ?? [];
        const target = orgList.find((o: any) => o.id === org1Setup.org.id);
        const listUser = target?.users?.records ?? [];
        const invitee = listUser.filter(
          (u: any) => u.id === org2Setup.regularUser.userId
        );
        expect(invitee.length).toEqual(0);
      });

      it('Delete old invitation should success', async () => {
        const deleteInviteRes = await gqlClient.sdk.deleteOrganizationInvite(
          { id: invitations.second.id },
          superAdmin.options
        );
        const deleteInvite = deleteInviteRes?.data?.deleteOrganizationInvite;
        expect(deleteInvite).toBeDefined();
        expect(deleteInvite?.id).toEqual(invitations.second.id);
        createdInviteIds.delete(invitations.second.id);
      });

      xit('Create org invite for existed user again should fail (regular user still blocked by rejection)', async () => {
        const orgInviteRes = gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: org2Setup.regularUser.email,
              message: 'test email 7',
              applicationRoles
            }
          },
          tokenOptions
        );
        await expect(orgInviteRes).rejects.toThrow(
          /previously rejected by an administrator/
        );
      });
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

    for (const orgId of [org1Setup?.org?.id, org2Setup?.org?.id].filter(
      Boolean
    )) {
      await deleteRemainingInvites(orgId as string);
    }

    trackCrossOrgMembership(
      org2Setup?.regularUser?.userId,
      org1Setup?.org?.guid
    );

    for (const { userId, organizationGuid } of crossOrgMemberships.values()) {
      await safe(`remove user ${userId} from org ${organizationGuid}`, () =>
        gqlClient.sdk.removeUserFromOrganization({
          userId,
          organizationGuid
        })
      );
    }

    const listUsersIds = [
      org1Setup?.adminUser?.userId,
      org2Setup?.adminUser?.userId,
      org1Setup?.regularUser?.userId,
      org2Setup?.regularUser?.userId
    ].filter(Boolean);

    for (const userId of Array.from(new Set(listUsersIds))) {
      await safe(`delete user ${userId}`, () =>
        gqlClient.sdk.deleteUser({ id: userId as string })
      );
    }

    for (const org of [org1Setup?.org, org2Setup?.org]) {
      if (org?.id) {
        await safe(`delete org ${org.id}`, () =>
          orgHelpers.deleteOrganization(
            { gqlClient, options: superAdmin.options },
            org.id
          )
        );
      }
    }
  });
});

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
