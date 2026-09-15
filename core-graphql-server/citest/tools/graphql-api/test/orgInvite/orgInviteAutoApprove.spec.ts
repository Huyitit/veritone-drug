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
let adminOrg1RequestHeaders: Record<string, string>;
let regularUserOrg1RequestHeaders: Record<string, string>;
let regularUserOrg2RequestHeaders: Record<string, string>;

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

describe('citest_orginvite: Org invite with disableAutoApproval', () => {
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
      option.userName.includes('admin-')
    );
    org1Setup.regularUser = testOrg1.listOptions.find((option) =>
      option.userName.includes('regular-')
    );

    adminOrg1RequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: org1Setup.adminUser.userName,
      password: org1Setup.adminUser.password
    });
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
      u.userName.includes('admin-')
    );
    org2Setup.regularUser = testOrg2.listOptions.find((u: any) =>
      u.userName.includes('regular-')
    );

    regularUserOrg2RequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: org2Setup.regularUser.userName,
      password: org2Setup.regularUser.password
    });

    // cleanup any leftover invites in the newly created org before assertions start
    await deleteRemainingInvites(org1Setup.org.id, superAdmin.options);
  });

  describe.each(['superAdmin', 'orgAdmin'])(
    'OrganizationInvite flow - %s invite handling',
    (tokenType) => {
      let tokenOptions: Record<string, string>;

      beforeAll(async () => {
        tokenOptions =
          tokenType === 'superAdmin'
            ? superAdmin.options
            : adminOrg1RequestHeaders;
      });

      describe(`${tokenType} invite existed users`, () => {
        it('Check user invite should be empty', async () => {
          const listInviteRes = await gqlClient.sdk.organization(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          const listInvite =
            listInviteRes?.data?.organization?.organizationInvites?.filter(
              (inv: any) =>
                ['submitted', 'completed', 'approved'].includes(inv.status)
            ) ?? [];

          expect(listInvite.length).toEqual(0);
        });

        it('Create org invite for existed user without autoApprove should success', async () => {
          const orgInviteRes = await gqlClient.sdk.createOrgInvite(
            {
              input: {
                organizationId: org1Setup.org.id,
                email: org2Setup.regularUser.email,
                message: 'test email 1',
                applicationRoles,
                disableAutoApproval: true
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

        it('Org invitation should have status submitted', async () => {
          const getInviteRes = await gqlClient.sdk.organization(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          const getInvites =
            getInviteRes?.data?.organization?.organizationInvites?.filter(
              (inv: any) => ['approved', 'submitted'].includes(inv.status)
            ) ?? [];
          const approvedInvitation = getInvites.filter(
            (inv: any) => inv.status === 'approved'
          );
          const submittedInvitation = getInvites.filter(
            (inv: any) => inv.status === 'submitted'
          );

          expect(approvedInvitation.length).toEqual(0);
          expect(submittedInvitation.length).toEqual(1);
          expect(submittedInvitation[0]?.id).toEqual(invitations.first.id);
        });

        it('Admin approve invitation should success', async () => {
          const inviteRes = await gqlClient.query(
            `mutation updateInv (
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
            }`,
            {
              organizationInviteId: invitations.first.id,
              applicationRoles: [],
              action: OrganizationInviteAction.Approve
            },
            adminOrg1RequestHeaders
          );

          const invite = inviteRes?.updateOrganizationInvite;
          expect(invite.id).toEqual(invitations.first.id);
          expect(invite.status).toEqual('approved');
        });

        it('Invitee accept invitation should success', async () => {
          const inviteRes = await gqlClient.query(
            `mutation updateInv (
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
            }`,
            {
              organizationInviteId: invitations.first.id,
              applicationRoles: [],
              action: OrganizationInviteAction.Complete
            },
            regularUserOrg2RequestHeaders
          );

          const invite = inviteRes?.updateOrganizationInvite;

          expect(invite.id).toEqual(invitations.first.id);
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
        });

        it('Delete invitation should success', async () => {
          const deleteInviteRes = await gqlClient.sdk.deleteOrganizationInvite(
            {
              id: invitations.first.id
            },
            tokenOptions
          );

          const deleteInvite = deleteInviteRes?.data?.deleteOrganizationInvite;
          expect(deleteInvite?.id).toEqual(invitations.first.id);
          createdInviteIds.delete(invitations.first.id);
        });

        it('Remove user from org should success', async () => {
          const removeRes = await gqlClient.sdk.removeUserFromOrganization({
            userId: org2Setup.regularUser.userId,
            organizationGuid: org1Setup.org.guid
          });

          const remove = removeRes?.data?.removeUserFromOrganization;
          expect(remove?.id).toEqual(org2Setup.regularUser.userId);
          crossOrgMemberships.delete(
            `${org1Setup.org.guid}:${org2Setup.regularUser.userId}`
          );
        });

        it('Create autoApprove org invite should success', async () => {
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
          expect(invitations.second.email).toEqual(org2Setup.regularUser.email);
          expect(invitations.second.status).toEqual('approved');
          expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
          trackInvite(invitations.second.id);
          trackInviteEmail(org2Setup.regularUser.email);
        });

        it('Org invitation should have status approved', async () => {
          const getInviteRes = await gqlClient.sdk.organization(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          const getInvites =
            getInviteRes?.data?.organization?.organizationInvites?.filter(
              (inv: any) => ['approved', 'submitted'].includes(inv.status)
            ) ?? [];
          const approvedInvitation = getInvites.filter(
            (inv: any) => inv.status === 'approved'
          );
          const submittedInvitation = getInvites.filter(
            (inv: any) => inv.status === 'submitted'
          );

          expect(approvedInvitation.length).toEqual(1);
          expect(approvedInvitation[0]?.id).toEqual(invitations.second.id);
          expect(submittedInvitation.length).toEqual(0);
        });

        it('Invitee accept invitation should success', async () => {
          const inviteRes = await gqlClient.query(
            `mutation updateInv (
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
            }`,
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
        });

        it('Delete invitation and remove user from org should success', async () => {
          const removeRes = await gqlClient.sdk.removeUserFromOrganization({
            userId: org2Setup.regularUser.userId,
            organizationGuid: org1Setup.org.guid
          });

          const remove = removeRes?.data?.removeUserFromOrganization;
          expect(remove?.id).toEqual(org2Setup.regularUser.userId);
          crossOrgMemberships.delete(
            `${org1Setup.org.guid}:${org2Setup.regularUser.userId}`
          );

          const deleteInviteRes = await gqlClient.sdk.deleteOrganizationInvite(
            {
              id: invitations.second.id
            },
            tokenOptions
          );

          const deleteInvite = deleteInviteRes?.data?.deleteOrganizationInvite;
          expect(deleteInvite?.id).toEqual(invitations.second.id);
          createdInviteIds.delete(invitations.second.id);
        });
      });

      afterAll(async () => {
        await deleteRemainingInvites(org1Setup.org.id, tokenOptions);
      });
    }
  );

  describe('OrganizationInvite autoApprove User flow', () => {
    let tokenOptions: Record<string, string>;

    beforeAll(async () => {
      tokenOptions = regularUserOrg1RequestHeaders;
    });

    it('OrgInvitation created by user can not be auto approved', async () => {
      const orgInviteRes = await gqlClient.sdk.createOrgInvite(
        {
          input: {
            organizationId: org1Setup.org.id,
            email: org2Setup.regularUser.email,
            message: 'test email 3',
            applicationRoles,
            disableAutoApproval: false
          }
        },
        tokenOptions
      );

      invitations.first = orgInviteRes?.data?.createOrganizationInvite;
      expect(invitations.first.id).toBeDefined();
      expect(invitations.first.status).toEqual('submitted');
      expect(invitations.first.email).toEqual(org2Setup.regularUser.email);
      expect(invitations.first.organization.id).toEqual(org1Setup.org.id);
      trackInvite(invitations.first.id);
      trackInviteEmail(org2Setup.regularUser.email);
    });

    it('Org invitation should have status submitted', async () => {
      const getInviteRes = await gqlClient.sdk.organization(
        {
          id: org1Setup.org.id
        },
        superAdmin.options
      );

      const getInvites =
        getInviteRes?.data?.organization?.organizationInvites?.filter(
          (inv: any) => ['approved', 'submitted'].includes(inv.status)
        ) ?? [];
      const approvedInvitation = getInvites.filter(
        (inv: any) => inv.status === 'approved'
      );
      const submittedInvitation = getInvites.filter(
        (inv: any) => inv.status === 'submitted'
      );

      expect(approvedInvitation.length).toEqual(0);
      expect(submittedInvitation.length).toEqual(1);
      expect(submittedInvitation[0]?.id).toEqual(invitations.first.id);
    });

    it('Admin approve invitation should success', async () => {
      const inviteRes = await gqlClient.query(
        `mutation updateInv (
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
        }`,
        {
          organizationInviteId: invitations.first.id,
          applicationRoles: [],
          action: OrganizationInviteAction.Approve
        },
        adminOrg1RequestHeaders
      );

      const invite = inviteRes?.updateOrganizationInvite;
      expect(invite.id).toEqual(invitations.first.id);
      expect(invite.status).toEqual('approved');
    });

    it('Invitee accept invitation should success', async () => {
      const inviteRes = await gqlClient.query(
        `mutation updateInv (
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
        }`,
        {
          organizationInviteId: invitations.first.id,
          applicationRoles: [],
          action: OrganizationInviteAction.Complete
        },
        regularUserOrg2RequestHeaders
      );

      const invite = inviteRes?.updateOrganizationInvite;

      expect(invite.id).toEqual(invitations.first.id);
      expect(invite.status).toEqual('completed');
      trackCrossOrgMembership(org2Setup.regularUser.userId, org1Setup.org.guid);
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
    });

    it('Delete invitation should success', async () => {
      const deleteInviteRes = await gqlClient.sdk.deleteOrganizationInvite(
        {
          id: invitations.first.id
        },
        superAdmin.options
      );

      const deleteInvite = deleteInviteRes?.data?.deleteOrganizationInvite;
      expect(deleteInvite?.id).toEqual(invitations.first.id);
      createdInviteIds.delete(invitations.first.id);
    });

    it('Remove user from org should success', async () => {
      const removeRes = await gqlClient.sdk.removeUserFromOrganization({
        userId: org2Setup.regularUser.userId,
        organizationGuid: org1Setup.org.guid
      });

      const remove = removeRes?.data?.removeUserFromOrganization;
      expect(remove?.id).toEqual(org2Setup.regularUser.userId);
      crossOrgMemberships.delete(
        `${org1Setup.org.guid}:${org2Setup.regularUser.userId}`
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
      await deleteRemainingInvites(orgId as string, superAdmin.options);
    }

    const knownMemberships = [
      {
        userId: org2Setup?.regularUser?.userId,
        organizationGuid: org1Setup?.org?.guid
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

    const listUsersIds = [
      org1Setup?.adminUser?.userId,
      org1Setup?.regularUser?.userId,
      org2Setup?.adminUser?.userId,
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
            {
              gqlClient,
              options: superAdmin.options
            },
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
      metadata: {
        features: {
          enableRBACFeature: 'disabled'
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

async function deleteRemainingInvites(
  orgId: string,
  tokenOptions: Record<string, string>
) {
  const getInviteRes = await safe(
    `fetch org ${orgId} invites for cleanup`,
    () =>
      gqlClient.sdk.organization(
        {
          id: orgId
        },
        tokenOptions
      )
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
          await gqlClient.sdk.deleteOrganizationInvite(
            {
              id: inv.id
            },
            tokenOptions
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
