import { v4 as uuidv4 } from 'uuid';
const chakram = require('chakram');
const helpers = require('../../../../helpers/index');
const orgHelpers = require('../../../../helpers/organization');
const userHelpers = require('../../../../helpers/user');
import {
  AuthType,
  buildRequestHeaders,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  OrganizationInviteAction,
  OrganizationStatus,
  OrganizationType
} from '../../src/gql';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import { safe } from '../../src/helpers/commonHelper';
import _ from 'lodash';

const config = helpers.config;
const env = config.env;
const MAILPIT_BASE_URL =
  process.env.NODE_ENV === 'test'
    ? 'http://mailpit:8025' // run on ci pipeline
    : 'http://localhost:8025'; // run on local

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const applicationRoles = [
  {
    applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
    roleId: '912e377e-f4a4-4184-8db1-baa9670d8081'
  }
];

let gqlClient: GraphqlClient;

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

let invitations: {
  first: any;
  second: any;
} = {
  first: {},
  second: {}
};

let adminOrg1RequestHeaders: Record<string, string>;
let regularUserOrg1RequestHeaders: Record<string, string>;
let adminOrg2RequestHeaders: Record<string, string>;
let regularUserOrg2RequestHeaders: Record<string, string>;
let adminAuthGroup: any;
let userAuthGroup: any;
let newLoginOption: Record<string, string>;
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

describe('citest_orginvite: Admin basic org invite authGroup', () => {
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
    org1Setup.adminUser = testOrg1.listOptions.find((option) =>
      option.userName.includes('thoang2+admin-')
    );
    adminOrg1RequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: org1Setup.adminUser.userName,
      password: org1Setup.adminUser.password
    });

    org1Setup.regularUser = testOrg1.listOptions.find((option) =>
      option.userName.includes('thoang2+regular-')
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
    org2Setup.adminUser = testOrg2.listOptions.find((u: any) =>
      u.userName.includes('thoang2+admin-')
    );

    adminOrg2RequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: org2Setup.adminUser.userName,
      password: org2Setup.adminUser.password
    });

    org2Setup.regularUser = testOrg2.listOptions.find((u: any) =>
      u.userName.includes('thoang2+regular-')
    );
    regularUserOrg2RequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: org2Setup.regularUser.userName,
      password: org2Setup.regularUser.password
    });
  });

  describe('OrganizationInvite authGroup flow - admin invite handling', () => {
    let tokenOptions: Record<string, string>;

    beforeAll(() => {
      tokenOptions = superAdmin.options;
    });

    describe('invite with authGroup', () => {
      it('Check user invite should success', async () => {
        const listInviteRes = await gqlClient.sdk.organization(
          {
            id: org1Setup.org.id
          },
          superAdmin.options
        );

        const listInvite =
          listInviteRes?.data?.organization?.organizationInvites ?? [];

        expect(listInvite.length).toEqual(0);
      });

      it('Create org invite with authGroup Admin should success', async () => {
        const authGroupRes = await gqlClient.sdk.authGroups(
          { limit: 100 },
          adminOrg1RequestHeaders
        );
        const authGroup =
          authGroupRes?.data?.authGroups?.records?.filter(Boolean) ?? [];
        adminAuthGroup = authGroup.find((auth: any) =>
          auth?.name?.includes('Administrator')
        );
        userAuthGroup = authGroup.find((auth: any) =>
          auth?.name?.includes('User')
        );

        const orgInviteRes = await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: org2Setup.adminUser.email,
              message: 'test emai 1',
              applicationRoles,
              authGroupIds: [adminAuthGroup.id]
            }
          },
          tokenOptions
        );

        invitations.first = orgInviteRes?.data?.createOrganizationInvite;
        expect(invitations.first.id).toBeDefined();
        expect(invitations.first.email).toEqual(org2Setup.adminUser.email);
        expect(invitations.first.status).toEqual('approved');
        expect(invitations.first.organization.id).toEqual(org1Setup.org.id);
        trackInvite(invitations.first.id);
        trackInviteEmail(org2Setup.adminUser.email);
      });

      it('Invitee accept invitation should success', async () => {
        // Use inline query matching JS helper to avoid querying protected fields
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
            organization {
              id
              guid
            }
            invitee {
              name
              email
            }
            status
          }
        }`;

        const inviteRes = await gqlClient.query(
          updateOrgInviteQuery,
          {
            organizationInviteId: invitations.first.id,
            applicationRoles: [],
            action: OrganizationInviteAction.Complete
          },
          adminOrg2RequestHeaders
        );

        const invite = inviteRes?.updateOrganizationInvite;

        expect(invite.id).toEqual(invitations.first.id);
        expect(invite.status).toEqual('completed');
        trackCrossOrgMembership(org2Setup.adminUser.userId, org1Setup.org.guid);
      });

      it('Invitee can login to org', async () => {
        const loginRes = await gqlClient.sdk.userLogin({
          input: {
            userName: org2Setup.adminUser.userName,
            password: org2Setup.adminUser.password,
            organizationGuid: org1Setup.org.guid
          }
        });

        const login = loginRes?.data?.userLogin;

        expect(login).toBeDefined();
        expect(login?.user?.id).toEqual(org2Setup.adminUser.userId);
        expect(login?.organization?.id).toEqual(org1Setup.org.id);
        expect(login?.token).toBeDefined();
        newLoginOption = helpers.requestOptions(login!.token).headers;
      });

      xit('Invitee should have authGroup Admin', async () => {
        const userRes = await userHelpers.getMyInfo({
          gqlClient,
          options: newLoginOption
        });
        const user = userRes?.me;
        expect(user).toBeDefined();
        const authGroupIds = user?.authGroupIds ?? [];
        expect(authGroupIds).toContain(adminAuthGroup.id);
      });

      it('Create org invite with authGroup User should success', async () => {
        const orgInviteRes = await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: org2Setup.regularUser.email,
              message: 'test email 2',
              applicationRoles,
              authGroupIds: [userAuthGroup.id]
            }
          },
          tokenOptions
        );

        invitations.second = orgInviteRes?.data?.createOrganizationInvite;
        expect(invitations.second.id).toBeDefined();
        expect(invitations.second.email).toEqual(org2Setup.regularUser.email);
        expect(invitations.second.status).toEqual('approved');
        expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
        trackInvite(invitations.second.id);
        trackInviteEmail(org2Setup.regularUser.email);
      });

      it('Invitee accept invitation should success', async () => {
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
            organization {
              id
              guid
            }
            invitee {
              name
              email
            }
            status
          }
        }`;

        const inviteRes = await gqlClient.query(
          updateOrgInviteQuery,
          {
            organizationInviteId: invitations.second.id,
            applicationRoles: [],
            action: OrganizationInviteAction.Complete
          },
          regularUserOrg2RequestHeaders
        );

        const invite = inviteRes?.updateOrganizationInvite;

        expect(invite.id).toEqual(invitations.second.id);
        expect(invite.status).toEqual('completed');
        trackCrossOrgMembership(
          org2Setup.regularUser.userId,
          org1Setup.org.guid
        );
      });

      it('Invitee can login to org', async () => {
        const loginRes = await gqlClient.sdk.userLogin({
          input: {
            userName: org2Setup.regularUser.userName,
            password: org2Setup.regularUser.password,
            organizationGuid: org1Setup.org.guid
          }
        });

        const login = loginRes?.data?.userLogin;

        expect(login).toBeDefined();
        expect(login?.user?.id).toEqual(org2Setup.regularUser.userId);
        expect(login?.organization?.id).toEqual(org1Setup.org.id);
        expect(login?.token).toBeDefined();
        newLoginOption = helpers.requestOptions(login!.token).headers;
      });

      xit('Invitee should have authGroup User', async () => {
        const userRes = await userHelpers.getMyInfo({
          gqlClient,
          options: newLoginOption
        });
        const user = userRes?.me;
        expect(user).toBeDefined();
        const authGroupIds = user?.authGroupIds ?? [];
        expect(authGroupIds).toContain(adminAuthGroup.id);
      });

      it('delete org invite', async () => {
        const deleteResFirst = await gqlClient.sdk.deleteOrganizationInvite(
          {
            id: invitations.first.id
          },
          superAdmin.options
        );
        expect(deleteResFirst).toBeDefined();
        const deleted1 = deleteResFirst?.data?.deleteOrganizationInvite;
        expect(deleted1?.id).toEqual(invitations.first.id);
        createdInviteIds.delete(invitations.first.id);

        const deleteResSecond = await gqlClient.sdk.deleteOrganizationInvite(
          {
            id: invitations.second.id
          },
          superAdmin.options
        );
        expect(deleteResSecond).toBeDefined();
        const deleted2 = deleteResSecond?.data?.deleteOrganizationInvite;
        expect(deleted2?.id).toEqual(invitations.second.id);
        createdInviteIds.delete(invitations.second.id);
      });

      it('remove user from Org', async () => {
        const removeUserRes1 = await gqlClient.sdk.removeUserFromOrganization({
          userId: org2Setup.adminUser.userId,
          organizationGuid: org1Setup.org.guid
        });
        expect(removeUserRes1).toBeDefined();
        const removedUser1 = removeUserRes1?.data?.removeUserFromOrganization;
        expect(removedUser1?.id).toEqual(org2Setup.adminUser.userId);
        crossOrgMemberships.delete(
          `${org1Setup.org.guid}:${org2Setup.adminUser.userId}`
        );

        const removeUserRes2 = await gqlClient.sdk.removeUserFromOrganization({
          userId: org2Setup.regularUser.userId,
          organizationGuid: org1Setup.org.guid
        });
        expect(removeUserRes2).toBeDefined();
        const removedUser2 = removeUserRes2?.data?.removeUserFromOrganization;
        expect(removedUser2?.id).toEqual(org2Setup.regularUser.userId);
        crossOrgMemberships.delete(
          `${org1Setup.org.guid}:${org2Setup.regularUser.userId}`
        );
      });
    });
  });

  describe('user invite with authGroup', () => {
    let tokenOptions: Record<string, string>;

    beforeAll(async () => {
      tokenOptions = org1Setup.regularUser.requestOptions;

      const authGroupRes = await gqlClient.sdk.authGroups(
        { limit: 100 },
        org2Setup.adminUser.requestOptions
      );
      const authGroup =
        authGroupRes?.data?.authGroups?.records?.filter(Boolean) ?? [];
      adminAuthGroup = authGroup.find((auth: any) =>
        auth?.name?.includes('Administrator')
      );
      userAuthGroup = authGroup.find((auth: any) =>
        auth?.name?.includes('User')
      );
    });

    it('Check user invite should success', async () => {
      const listInviteRes = await gqlClient.sdk.organization(
        {
          id: org2Setup.org.id
        },
        superAdmin.options
      );

      const listInvite =
        listInviteRes?.data?.organization?.organizationInvites ?? [];

      expect(listInvite.length).toEqual(0);
    });

    xit('Create org invite with authGroup Admin should fail', async () => {
      const orgInviteRes = gqlClient.sdk.createOrgInvite(
        {
          input: {
            organizationId: org2Setup.org.id,
            email: org1Setup.regularUser.email,
            message: 'test email 3',
            applicationRoles,
            authGroupIds: [adminAuthGroup.id]
          }
        },
        org2Setup.regularUser.requestOptions
      );
      await expect(orgInviteRes).rejects.toThrow();
    });

    it('Create org invite with invalid authGroupId string should fail', async () => {
      const orgInviteRes = gqlClient.sdk.createOrgInvite(
        {
          input: {
            organizationId: org2Setup.org.id,
            email: org1Setup.regularUser.email,
            message: 'test email invalid uuid',
            applicationRoles,
            authGroupIds: ['invalid-uuid']
          }
        },
        org2Setup.regularUser.requestOptions
      );
      await expect(orgInviteRes).rejects.toThrow(/Invalid authGroupId/);
    });

    it('Create org invite with nonexistent authGroupId should fail', async () => {
      const orgInviteRes = gqlClient.sdk.createOrgInvite(
        {
          input: {
            organizationId: org2Setup.org.id,
            email: org1Setup.regularUser.email,
            message: 'test email nonexistent uuid',
            applicationRoles,
            authGroupIds: ['6017d062-252f-4ec2-82e1-79066f7d35e4']
          }
        },
        org2Setup.regularUser.requestOptions
      );
      await expect(orgInviteRes).rejects.toThrow(
        /One or more authGroupIds do not exist in the organization/
      );
    });

    it('Create org invite with authGroup User should success', async () => {
      const orgInviteRes = await gqlClient.sdk.createOrgInvite(
        {
          input: {
            organizationId: org2Setup.org.id,
            email: org1Setup.adminUser.email,
            message: 'test email 4',
            applicationRoles,
            authGroupIds: [userAuthGroup.id]
          }
        },
        regularUserOrg2RequestHeaders
      );

      invitations.first = orgInviteRes?.data?.createOrganizationInvite;
      expect(invitations.first.id).toBeDefined();
      expect(invitations.first.email).toEqual(org1Setup.adminUser.email);
      expect(invitations.first.status).toEqual('submitted');
      expect(invitations.first.organization.id).toEqual(org2Setup.org.id);
    });

    it('admin approve should success', async () => {
      const approveRes = await gqlClient.sdk.updateOrgInvite(
        {
          input: {
            organizationInviteId: invitations.first.id,
            applicationRoles: [],
            action: OrganizationInviteAction.Approve
          }
        },
        superAdmin.options
      );

      const approve = approveRes?.data?.updateOrganizationInvite;

      expect(approve.id).toEqual(invitations.first.id);
      expect(approve.status).toEqual('approved');
      trackInvite(invitations.first.id);
      trackInviteEmail(org1Setup.adminUser.email);
    });

    it('Invitee accept invitation should success', async () => {
      const inviteRes = await gqlClient.sdk.updateOrgInvite(
        {
          input: {
            organizationInviteId: invitations.first.id,
            applicationRoles: [],
            action: OrganizationInviteAction.Complete
          }
        },
        adminOrg1RequestHeaders
      );

      const invite = inviteRes?.data?.updateOrganizationInvite;

      expect(invite.id).toEqual(invitations.first.id);
      expect(invite.status).toEqual('completed');
      trackCrossOrgMembership(org1Setup.adminUser.userId, org2Setup.org.guid);
    });

    it('Invitee can login to org', async () => {
      const loginRes = await gqlClient.sdk.userLogin({
        input: {
          userName: org1Setup.adminUser.userName,
          password: org1Setup.adminUser.password,
          organizationGuid: org2Setup.org.guid
        }
      });

      const login = loginRes?.data?.userLogin;

      expect(login).toBeDefined();
      expect(login?.user?.id).toEqual(org1Setup.adminUser.userId);
      expect(login?.organization?.id).toEqual(org2Setup.org.id);
      expect(login?.token).toBeDefined();
      newLoginOption = helpers.requestOptions(login!.token).headers;
    });

    xit('Invitee should have authGroup user', async () => {
      const userRes = await userHelpers.getMyInfo({
        gqlClient,
        options: newLoginOption
      });
      const user = userRes?.me;
      expect(user).toBeDefined();
      const authGroupIds = user?.authGroupIds ?? [];
      expect(authGroupIds).toContain(userAuthGroup.id);
    });

    it('delete org invite', async () => {
      const deleteResFirst = await gqlClient.sdk.deleteOrganizationInvite(
        {
          id: invitations.first.id
        },
        superAdmin.options
      );
      expect(deleteResFirst).toBeDefined();
      const deleted1 = deleteResFirst?.data?.deleteOrganizationInvite;
      expect(deleted1?.id).toEqual(invitations.first.id);
      createdInviteIds.delete(invitations.first.id);
    });

    it('remove user from Org', async () => {
      const removeUserRes1 = await gqlClient.sdk.removeUserFromOrganization({
        userId: org1Setup.adminUser.userId,
        organizationGuid: org2Setup.org.guid
      });
      expect(removeUserRes1).toBeDefined();
      const removedUser1 = removeUserRes1?.data?.removeUserFromOrganization;
      expect(removedUser1?.id).toEqual(org1Setup.adminUser.userId);
      crossOrgMemberships.delete(
        `${org2Setup.org.guid}:${org1Setup.adminUser.userId}`
      );
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

    const knownMemberships = [
      {
        userId: org2Setup?.adminUser?.userId,
        organizationGuid: org1Setup?.org?.guid
      },
      {
        userId: org2Setup?.regularUser?.userId,
        organizationGuid: org1Setup?.org?.guid
      },
      {
        userId: org1Setup?.adminUser?.userId,
        organizationGuid: org2Setup?.org?.guid
      }
    ];

    for (const membership of knownMemberships) {
      trackCrossOrgMembership(membership.userId, membership.organizationGuid);
    }

    for (const { userId, organizationGuid } of crossOrgMemberships.values()) {
      await safe(`remove user ${userId} from org ${organizationGuid}`, () =>
        gqlClient.sdk.removeUserFromOrganization({
          userId,
          organizationGuid
        })
      );
    }

    const listUsersIds: string[] = [
      org1Setup?.adminUser?.userId,
      org1Setup?.regularUser?.userId,
      org2Setup?.adminUser?.userId,
      org2Setup?.regularUser?.userId
    ].filter((id): id is string => Boolean(id));

    for (const userId of Array.from(new Set(listUsersIds))) {
      await safe(`delete user ${userId}`, () =>
        gqlClient.sdk.deleteUser({ id: userId })
      );
    }

    for (const org of [org1Setup?.org, org2Setup?.org]) {
      if (org?.id) {
        await safe(`delete org ${org.id}`, () =>
          gqlClient.sdk.updateOrganization({
            input: {
              id: org.id,
              status: OrganizationStatus.Deleted
            }
          })
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
      metadata: {
        features: {
          enableRBACFeature: 'enabled'
        }
      },
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
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter(Boolean)
      },
      {
        name: `thoang2+regular-${uniqueId}@veritone.com`,
        email: `thoang2+regular-${uniqueId}@veritone.com`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };
}

async function deleteRemainingInvites(orgId: string) {
  const getInviteRes = await safe(
    `fetch org ${orgId} invites for cleanup`,
    () =>
      gqlClient.sdk.organization({
        id: orgId
      })
  );

  const getInvites = _.get(
    getInviteRes,
    'data.organization.organizationInvites',
    []
  );

  await Promise.all(
    getInvites
      .filter((inv: any) => inv?.id && inv.status !== 'deleted')
      .map((inv: any) =>
        safe(`delete org invite ${inv.id}`, async () => {
          await gqlClient.sdk.deleteOrganizationInvite({
            id: inv.id
          });
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
