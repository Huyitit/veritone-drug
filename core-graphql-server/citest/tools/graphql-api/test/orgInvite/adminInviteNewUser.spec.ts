import { v4 as uuidv4 } from 'uuid';
import supertest from 'supertest';
const chakram = require('chakram');
import * as helpers from '../../../../helpers/index';
import { safe } from '../../src/helpers/commonHelper';
import _ from 'lodash';
import {
  OrganizationInviteAction,
  OrganizationInviteStatus,
  OrganizationType,
  UserStatus
} from '../../src/gql';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { setupTestOrgAndUser } from '../helpers/organization.helper';

let gqlClient: GraphqlClient;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const org1Setup = {
  org: {} as any,
  adminUser: { requestOptions: {} as Record<string, string> } as any,
  regularUser: { requestOptions: {} as Record<string, string> } as any,
  newUser: { requestOptions: {} as Record<string, string> } as any
};

const org2Setup = {
  org: {} as any,
  adminUser: { requestOptions: {} as Record<string, string> } as any,
  regularUser: { requestOptions: {} as Record<string, string> } as any,
  newUser: { requestOptions: {} as Record<string, string> } as any
};
const applicationRoles = [
  {
    applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
    roleId: '912e377e-f4a4-4184-8db1-baa9670d8081'
  }
];

const config = helpers.config;
let emailCount = 0;
const inviteEmails = new Set<string>();
const createdUserIds = new Set<string>();

const MAILPIT_BASE_URL =
  process.env.NODE_ENV === 'test'
    ? 'http://mailpit:8025' // run on ci pipeline
    : 'http://localhost:8025'; // run on local

const userAgent = config.userAgent || 'core-graphql-server test';
function requestOptions(token: any) {
  return {
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'User-Agent': userAgent,
      Accept: '*/*',
      'Veritone-Correlation-ID': uuidv4(),
      'X-Veritone-Application': 'GraphQL-CI-Test'
    }
  };
}

describe('citest_orginvite: Admin basic org invite new user', () => {
  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    // create org 1
    const testOrg1 = await setupTestOrgAndUser(
      gqlClient,
      createOrgAndUserInput(citestMarker + '-org-invite-1-')
    );

    org1Setup.org = testOrg1.org;
    org1Setup.adminUser = testOrg1.listOptions.find((option) =>
      option.userName.includes(`${citestMarker}-admin-user-`)
    );
    org1Setup.regularUser = testOrg1.listOptions.find((option) =>
      option.userName.includes(`${citestMarker}-regular-user-`)
    );

    // create org 2
    const testOrg2 = await setupTestOrgAndUser(
      gqlClient,
      createOrgAndUserInput(citestMarker + '-org-invite-2-')
    );

    org2Setup.org = testOrg2.org;
    org2Setup.adminUser = testOrg2.listOptions.find((option) =>
      option.userName.includes(`${citestMarker}-admin-user-`)
    );
    org2Setup.regularUser = testOrg2.listOptions.find((option) =>
      option.userName.includes(`${citestMarker}-regular-user-`)
    );
  });

  describe.each(['superAdmin', 'orgAdmin'])(
    'OrganizationInvite flow - %s invite handling',
    (tokenType) => {
      let tokenOptions: Record<string, string>;
      let newEmail: string;
      let newToken: string;
      let invitations: any = {
        first: {},
        second: {}
      };

      beforeAll(() => {
        newEmail = 'thoang2-new-user-' + uuidv4() + '@veritone.com';

        tokenOptions =
          tokenType === 'superAdmin' ? {} : org1Setup.adminUser.requestOptions;
      });

      describe(`${tokenType} invite new users`, () => {
        it('Check new user email should not exist', async () => {
          const fetchUserRes = await gqlClient.sdk.users(
            {
              name: newEmail,
              status: UserStatus.Active,
              includeAllOrgUsers: true,
              limit: 200
            },
            tokenOptions
          );

          const listUsers = fetchUserRes?.data?.users?.records ?? [];
          const user = listUsers.find((u: any) => u.email === newEmail);

          expect(user).toBeUndefined();
        });

        it('Create org invite for new user should success', async () => {
          const createOrgInviteRes = await gqlClient.sdk.createOrgInvite(
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

          invitations.first =
            createOrgInviteRes?.data?.createOrganizationInvite;

          expect(invitations.first.id).toBeDefined();
          expect(invitations.first.email).toEqual(newEmail);
          expect(invitations.first.status).toEqual('approved');
          expect(invitations.first.organization.id).toEqual(org1Setup.org.id);

          emailCount++;
          inviteEmails.add(newEmail);
        });

        it('Re create org invite for new user again should success', async () => {
          const createOrgInviteRes = await gqlClient.sdk.createOrgInvite(
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

          invitations.second =
            createOrgInviteRes?.data?.createOrganizationInvite;

          expect(invitations.second.id).toBeDefined();
          expect(invitations.second.email).toEqual(newEmail);
          expect(invitations.second.status).toEqual('approved');
          expect(invitations.second.organization.id).toEqual(org1Setup.org.id);

          emailCount++;
          inviteEmails.add(newEmail);
        });

        it('Previous invitation is deleted', async () => {
          const organizationRes = await gqlClient.sdk.organization(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          const listInvite =
            organizationRes?.data?.organization?.organizationInvites ?? [];

          const preInvite = listInvite.find(
            (inv: any) => inv.id === invitations.first.id
          );

          expect(preInvite?.id).toEqual(invitations.first.id);
          expect(preInvite?.status).toEqual('deleted');
        });

        it('Resend org invite should success', async () => {
          const updateOrgRes = await gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.second.id,
                applicationRoles: [],
                action: OrganizationInviteAction.Resend
              }
            },
            tokenOptions
          );

          const resend = updateOrgRes?.data?.updateOrganizationInvite;
          expect(resend.email).toEqual(newEmail);
          expect(resend.status).toEqual('approved');
          expect(resend.organization.id).toEqual(org1Setup.org.id);

          emailCount++;
          inviteEmails.add(newEmail);
        });

        it('Only 1 active invitation, not create new invitation', async () => {
          const organizationRes = await gqlClient.sdk.organization(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          const listInvite =
            organizationRes?.data?.organization?.organizationInvites ?? [];

          const approved = listInvite.filter(
            (inv: any) => inv.status === 'approved'
          );

          expect(approved.length).toEqual(1);
          expect(approved?.[0]?.id).toEqual(invitations.second.id);
        });

        it('Org user should not included invitee', async () => {
          const listUsersRes = await gqlClient.sdk.organizations(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          const listUsers =
            listUsersRes?.data?.organizations?.records?.[0]?.users?.records ??
            [];

          const invitee = listUsers.filter((u: any) => u.email === newEmail);
          expect(invitee.length).toEqual(0);
        });

        it('Check org invitation', async () => {
          const getInvitesRes = await gqlClient.sdk.organization(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          const invites =
            getInvitesRes?.data?.organization?.organizationInvites ?? [];
          const approvedInvitations = invites.filter(
            (inv: any) => inv.status === 'approved'
          );
          const submittedInvitations = invites.filter(
            (inv: any) => inv.status === 'submitted'
          );

          expect(approvedInvitations.length).toEqual(1);
          expect(approvedInvitations?.[0]?.id).toEqual(invitations.second.id);
          expect(submittedInvitations.length).toEqual(0);
        });

        it('Run reset password API for new user should fail (user not created)', async () => {
          const queryOrg = `query fetchOrgInvite (
            $orgId: ID!
            $organizationInviteId: ID
            #$inviteStatuses: [OrganizationInviteStatus]
            $inviteType: OrganizationInviteType
            $email: String
        ) {
            organization (id: $orgId) {
            organizationInvites (
                organizationInviteId: $organizationInviteId
                #statuses: $inviteStatuses
                inviteType: $inviteType
                email: $email
            ) {
                id
                status
                email
                passwordResetToken
                userDetails
                expirationDate
                invitationLink
            }
            }
        }`;

          const variables = {
            orgId: org1Setup.org.id,
            passwordResetToken: true,
            inviteStatuses: [OrganizationInviteStatus.Approved]
          };

          const listInviteRes = await gqlClient.query(queryOrg, variables, {
            gqlClient
          });

          const listInvite =
            listInviteRes?.organization?.organizationInvites ?? [];
          const preInvite = listInvite.find(
            (inv: any) => inv.email === newEmail && inv.status === 'approved'
          );
          expect(preInvite).toBeDefined();
          invitations.second = preInvite;
          newToken = preInvite?.passwordResetToken;

          const resetPasswordRes = await helpResetPasswordInvite({
            baseUrl: config.core_admin_url,
            invitation: invitations.second,
            userName: newEmail,
            password: 'testUserPassword',
            ApiPath: '/admin/org-invite/password/reset'
          });
          expect(resetPasswordRes).toBeDefined();
          expect(resetPasswordRes.statusCode).toEqual(400);
          expect(_.get(resetPasswordRes, 'error.text')).toMatch(
            /invite status is invalid/
          );
        });

        it('New user email not existed in system', async () => {
          const fetchUserRes = await gqlClient.sdk.users(
            {
              name: newEmail,
              status: UserStatus.Active,
              includeAllOrgUsers: true,
              limit: 200
            },
            tokenOptions
          );
          expect(fetchUserRes?.data?.users?.records?.length).toEqual(0);
        });

        it('Invitee accept invitation should success', async () => {
          const updateOrgRes = await gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.second.id,
                applicationRoles: [],
                action: OrganizationInviteAction.Complete
              }
            },
            requestOptions(newToken) as any
          );

          expect(updateOrgRes?.data?.updateOrganizationInvite.id).toEqual(
            invitations.second.id
          );
          expect(updateOrgRes?.data?.updateOrganizationInvite.status).toEqual(
            'completed'
          );
        });

        it('New user is created', async () => {
          const fetchUserRes = await gqlClient.sdk.users({
            name: newEmail,
            status: UserStatus.Active,
            includeAllOrgUsers: true,
            limit: 200
          });
          expect(fetchUserRes?.data?.users?.records?.length).toEqual(1);
          expect(fetchUserRes?.data?.users?.records?.[0]?.email).toEqual(
            newEmail
          );
          expect(fetchUserRes?.data?.users?.records?.[0]?.status).toEqual(
            'active'
          );
        });

        it('Org user should included invitee', async () => {
          const listUsersRes = await gqlClient.sdk.organizations(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          const listUsers =
            listUsersRes?.data?.organizations?.records?.[0]?.users?.records ??
            [];

          const invitee = listUsers.filter((u: any) => u.email === newEmail);
          expect(invitee.length).toEqual(1);
          expect(invitee?.[0]?.email).toEqual(newEmail);
          org1Setup.newUser.userId = invitee?.[0]?.id;
          org1Setup.newUser.username = invitee?.[0]?.name;
          org1Setup.newUser.email = invitee?.[0]?.email;

          if (org1Setup.newUser.userId) {
            createdUserIds.add(org1Setup.newUser.userId);
          }
        });

        it('Run reset password for user email should success', async () => {
          const resetPasswordRes = await helpResetPasswordInvite({
            baseUrl: config.core_admin_url,
            invitation: invitations.second,
            userName: newEmail,
            password: 'testPassword',
            ApiPath: '/admin/org-invite/password/reset'
          });

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

          expect(loginRes?.data?.userLogin).toBeDefined();
          expect(loginRes?.data?.userLogin?.user?.id).toEqual(
            org1Setup.newUser.userId
          );
          expect(loginRes?.data?.userLogin?.organization?.id).toEqual(
            org1Setup.org.id
          );
        });

        it('Delete old invitation should success', async () => {
          const deleteInviteRes = await gqlClient.sdk.deleteOrganizationInvite(
            {
              id: invitations.second.id
            },
            tokenOptions
          );

          const deletedInvite = deleteInviteRes?.data?.deleteOrganizationInvite;
          expect(deletedInvite?.id).toEqual(invitations.second.id);
        });

        it('Remove invitee from org should fail', async () => {
          const removeUserFromOrgRes = gqlClient.sdk.removeUserFromOrganization(
            {
              organizationGuid: org1Setup.org.guid,
              userId: org1Setup.newUser.userId
            },
            tokenOptions
          );

          await expect(removeUserFromOrgRes).rejects.toThrow(
            /User .* can not be removed from the only one organization it belongs to/
          );
        });

        it('Invite user again should fail', async () => {
          const createOrgInviteRes = gqlClient.sdk.createOrgInvite(
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

          await expect(createOrgInviteRes).rejects.toThrow(
            /This user is already a member of this organization/
          );
        });

        if (tokenType === 'orgAdmin') {
          it("OrgAdmin invite a deleted user should error with 'unavailable' message", async () => {
            // 1. Add user to org2 so they can be removed from org1
            await gqlClient.sdk.addUserToOrganization({
              organizationGuid: org2Setup.org.guid,
              userId: org1Setup.newUser.userId,
              roleIds: [
                '032218c3-d47e-4287-9d16-7bb867c01266' // Desktop
              ]
            });

            // 2. Remove user from org1
            await gqlClient.sdk.removeUserFromOrganization({
              organizationGuid: org1Setup.org.guid,
              userId: org1Setup.newUser.userId
            });

            // 3. Delete the user
            await gqlClient.sdk.deleteUser({
              id: org1Setup.newUser.userId
            });

            // 4. Try to invite the deleted user again
            const createOrgInviteRes = gqlClient.sdk.createOrgInvite(
              {
                input: {
                  organizationId: org1Setup.org.id,
                  email: newEmail,
                  message: 'test email 4',
                  applicationRoles
                }
              },
              tokenOptions
            );

            await expect(createOrgInviteRes).rejects.toThrow(
              /The user account this email belongs to is unavailable. Please contact an instance administrator for assistance/
            );
          });
        } else {
          it('SuperAdmin invite a deleted user should succeed (superAdmin bypasses status check)', async () => {
            // 1. Add user to org2 so they can be removed from org1
            await gqlClient.sdk.addUserToOrganization({
              userId: org1Setup.newUser.userId,
              organizationGuid: org2Setup.org.guid,
              roleIds: [
                '032218c3-d47e-4287-9d16-7bb867c01266' // Desktop
              ]
            });

            // 2. Remove user from org1
            await gqlClient.sdk.removeUserFromOrganization({
              organizationGuid: org1Setup.org.guid,
              userId: org1Setup.newUser.userId
            });

            // 3. Delete the user
            await gqlClient.sdk.deleteUser({
              id: org1Setup.newUser.userId
            });

            // 4. SuperAdmin can invite deleted users
            const createOrgInviteRes = await gqlClient.sdk.createOrgInvite(
              {
                input: {
                  organizationId: org1Setup.org.id,
                  email: newEmail,
                  message: 'test email 5',
                  applicationRoles
                }
              },
              tokenOptions
            );

            // 5. Verify the invite was created successfully
            const invite = createOrgInviteRes?.data?.createOrganizationInvite;
            expect(invite).toBeDefined();
            expect(invite.id).toBeDefined();
            expect(invite.email).toEqual(newEmail);
            emailCount++;
            inviteEmails.add(newEmail);
          });
        }
      });

      afterAll(async () => {
        //delete all invitation
        const getInvitesRes = await gqlClient.sdk.organization(
          {
            id: org1Setup.org.id
          },
          tokenOptions
        );

        const invites =
          getInvitesRes?.data?.organization?.organizationInvites ?? [];

        await Promise.all(
          invites
            .filter((inv: any) => inv?.id && inv.status !== 'deleted')
            .map((inv: any) =>
              safe(`delete org invite ${inv.id}`, async () =>
                gqlClient.sdk.deleteOrganizationInvite(
                  {
                    id: inv.id
                  },
                  tokenOptions
                )
              )
            )
        );
      });
    }
  );

  afterAll(async () => {
    // validate no email sent externally and email sent to mailpit
    const { messageIds } = await getEmailCountFromMailpit(
      emailCount,
      inviteEmails,
      MAILPIT_BASE_URL
    );

    if (messageIds.size > 0) {
      await safe('delete mailpit org invite messages', async () =>
        chakram.delete(`${MAILPIT_BASE_URL}/api/v1/messages`, {
          ids: Array.from(messageIds)
        })
      );
    }

    // delete users
    const listUsersIds: string[] = [
      org1Setup.adminUser?.userId,
      org1Setup.regularUser?.userId,
      org2Setup.adminUser?.userId,
      org2Setup.regularUser?.userId,
      ...createdUserIds
    ].filter((id): id is string => Boolean(id));

    if (listUsersIds.length > 0) {
      await Promise.all(
        Array.from(new Set(listUsersIds)).map((userId) =>
          safe(`delete user ${userId}`, async () =>
            gqlClient.sdk.deleteUser({ id: userId })
          )
        )
      );
    }

    // delete orgs
    if (org1Setup.org.id) {
      await safe(`delete org ${org1Setup.org.id}`, async () =>
        gqlClient.sdk.updateOrganization({
          input: {
            id: org1Setup.org.id,
            status: 'deleted'
          }
        })
      );
    }

    if (org2Setup.org.id) {
      await safe(`delete org ${org2Setup.org.id}`, async () =>
        gqlClient.sdk.updateOrganization({
          input: {
            id: org2Setup.org.id,
            status: 'deleted'
          }
        })
      );
    }
  });
});

function createOrgAndUserInput(orgName: any) {
  const uniqueId = uuidv4();

  return {
    orgInput: {
      name: orgName + uniqueId,
      businessUnit: 'Legal',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
      metadata: {
        billing: {
          pausedProcessing: false
        },
        features: {
          enableOLPFeature: 'disabled'
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
        name: `${citestMarker}-admin-user-${uniqueId}@veritone.com`,
        email: `${citestMarker}-admin-user-${uniqueId}@veritone.com`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        name: `${citestMarker}-regular-user-${uniqueId}@veritone.com`,
        email: `${citestMarker}-regular-user-${uniqueId}@veritone.com`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };
}

type ResetPasswordInviteInput = {
  baseUrl?: string;
  invitation: {
    id: string;
    passwordResetToken: string;
  };
  userName: string;
  password: string;
  ApiPath?: string;
};

export async function helpResetPasswordInvite(input: ResetPasswordInviteInput) {
  let { baseUrl, invitation, userName, password, ApiPath } = input;

  if (!baseUrl) {
    baseUrl = config.core_admin_url;
  }

  if (!ApiPath) {
    ApiPath = '/admin/org-invite/password/reset';
  }

  const request = supertest(baseUrl as any);

  const res = await request
    .post(ApiPath)
    .set('Content-Type', 'application/json')
    .send({
      userName,
      password,
      token: invitation.passwordResetToken,
      organizationInviteId: invitation.id
    });

  return res;
}

type MailpitMessage = {
  ID: string;
  To?: {
    Address?: string;
  }[];
};

type MailpitResponse = {
  messages?: MailpitMessage[];
};

export async function getEmailCountFromMailpit(
  emailCount: number,
  inviteEmails: Set<string>,
  MAILPIT_BASE_URL: string
): Promise<{ messagesCount: number; messageIds: Set<string> }> {
  let messagesCount = 0;
  const maxRetries = 5;
  let retries = 0;
  const messageIds = new Set<string>();

  while (messagesCount < emailCount && retries < maxRetries) {
    const res = await chakram.get(`${MAILPIT_BASE_URL}/api/v1/messages`);
    const body: MailpitResponse = res.body;

    const messages = body?.messages ?? [];

    messagesCount = messages.filter((message) => {
      const email = message?.To?.[0]?.Address;
      const isValidMessage = email ? inviteEmails.has(email) : false;

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
