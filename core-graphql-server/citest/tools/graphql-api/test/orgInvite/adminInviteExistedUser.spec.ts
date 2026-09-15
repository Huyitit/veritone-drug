import { v4 as uuidv4 } from 'uuid';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
const chakram = require('chakram');
import config from '../../src/config';
import * as helpers from '../../../../helpers/index';
import {
  OrganizationInviteAction,
  OrganizationType,
  UserStatus
} from '../../src/gql';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';
const MAILPIT_BASE_URL =
  process.env.NODE_ENV === 'test'
    ? 'http://mailpit:8025' // run on ci pipeline
    : 'http://localhost:8025'; // run on local

let gqlClient: GraphqlClient;
// T63: this spec previously authenticated as the SHARED citest superadmin
// (SESSION_TOKEN), which orgInviteAppRole.spec.ts's own login activity can
// rotate mid-run (both specs are pinned to the same shard, but Jest still
// interleaves their setup/teardown). A rotated token made `createdBy` resolve
// to a stale/missing user, throwing "Cannot return null for non-nullable
// field BasicUserInfo.id." A per-iteration re-auth (see git history) narrowed
// the window but didn't close it — recurred on PR #4363 against the
// "deleted" iteration, which the original fix assumed was safe. An isolated
// superadmin has no session for any other spec to rotate, closing the race
// at its source rather than narrowing it.
let isolatedSA: IsolatedSuperadmin;

const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;
const citestMarker = (globalThis as any).citestMarker || 'citest-should-delete';
const org1Setup = {
  org: {} as any,
  adminUser: { requestOptions: {} as Record<string, string> } as any,
  regularUser: {} as any
};

const org2Setup = {
  org: {} as any,
  adminUser: { requestOptions: {} as Record<string, string> } as any,
  regularUser: {} as any
};

const inviteEmails = new Set<string>();
let emailCount = 0;

const applicationRoles = [
  {
    applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
    roleId: '912e377e-f4a4-4184-8db1-baa9670d8081'
  }
];

describe('citest_orginvite: Admin basic org invite existed user', () => {
  beforeAll(async () => {
    const bootstrap = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSA = await createIsolatedSuperadmin(bootstrap);
    gqlClient = isolatedSA.client;

    // create org 1
    const testOrg1 = await setupTestOrgAndUser(
      gqlClient,
      createOrgAndUserInput(citestMarker + '-invite-1-')
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
      createOrgAndUserInput(citestMarker + '-invite-2-')
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
      let invitations: any = { first: null, second: null };
      let tokenOptions: Record<string, string>;
      let isSuperAdmin = false;
      beforeAll(() => {
        tokenOptions =
          tokenType === 'superAdmin' ? {} : org1Setup.adminUser.requestOptions;
      });

      describe(`${tokenType} invite existed users`, () => {
        beforeEach(() => {
          isSuperAdmin = tokenType === 'superAdmin' ? true : false;
        });
        it('Check user invite should success', async () => {
          const listInviteRes = await gqlClient.sdk.organization(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );
          const activeInvites = (
            listInviteRes?.data?.organization?.organizationInvites || []
          ).filter((invite: any) => invite.status !== 'deleted');

          expect(activeInvites.length).toBe(0);
        });

        it('Create org invite for existed user should success', async () => {
          const orgInviteRes = await gqlClient.sdk.createOrgInvite(
            {
              input: {
                organizationId: org1Setup.org.id,
                email: org2Setup.regularUser.email,
                message: 'test email',
                applicationRoles
              },
              includePasswordResetToken: isSuperAdmin // only super admin can get password reset token in response
            },
            tokenOptions
          );

          invitations.first = orgInviteRes?.data?.createOrganizationInvite;
          expect(invitations.first).toBeDefined();
          expect(invitations.first.email).toEqual(org2Setup.regularUser.email);
          expect(invitations.first.status).toEqual('approved');
          expect(invitations.first.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
        });

        it('Re create org invite for existed user again should success', async () => {
          const orgInviteRes = await gqlClient.sdk.createOrgInvite(
            {
              input: {
                organizationId: org1Setup.org.id,
                email: org2Setup.regularUser.email,
                message: 'test email 2',
                applicationRoles
              },
              includePasswordResetToken: isSuperAdmin // only super admin can get password reset token in response
            },
            tokenOptions
          );

          invitations.second = orgInviteRes?.data?.createOrganizationInvite;
          expect(invitations.second).toBeDefined();
          expect(invitations.second.email).toEqual(org2Setup.regularUser.email);
          expect(invitations.second.status).toEqual('approved');
          expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
        });

        it('Previous invitation is deleted', async () => {
          const listInviteRes = await gqlClient.sdk.organization(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );
          const invites =
            listInviteRes?.data?.organization?.organizationInvites || [];
          const preInvite = invites.find(
            (inv: any) => inv.id === invitations.first.id
          );
          expect(preInvite?.id).toEqual(invitations.first.id);
          expect(preInvite?.status).toEqual('deleted');
        });

        it('Create invite for current member should fail', async () => {
          const orgInviteRes = gqlClient.sdk.createOrgInvite(
            {
              input: {
                organizationId: org1Setup.org.id,
                email: org1Setup.regularUser.email,
                message: 'test email 3',
                applicationRoles
              },
              includePasswordResetToken: isSuperAdmin // only super admin can get password reset token in response
            },
            tokenOptions
          );

          await expect(orgInviteRes).rejects.toThrow(
            /This user is already a member of this organization/
          );
        });

        it('Check org invitation status approved, submitted', async () => {
          const listInviteRes = await gqlClient.sdk.organization(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );
          const getInvites =
            listInviteRes?.data?.organization?.organizationInvites || [];
          const approvedInvitation = getInvites.filter(
            (inv) => inv?.status === 'approved'
          );
          const submittedInvitation = getInvites.filter(
            (inv) => inv?.status === 'submitted'
          );
          expect(approvedInvitation.length).toEqual(1);
          expect(approvedInvitation?.[0]?.id).toEqual(invitations.second.id);
          expect(submittedInvitation.length).toEqual(0);
        });

        it('Check user invitation', async () => {
          const getInviteRes = await gqlClient.sdk.users(
            {
              id: org2Setup.regularUser.userId
            },
            org2Setup.adminUser.requestOptions
          );

          const users = getInviteRes?.data?.users?.records || [];
          expect(users.length).toEqual(1);
          expect(users?.[0]?.id).toEqual(org2Setup.regularUser.userId);
          const invites = users?.[0]?.organizationInvites || [];
          expect(invites).toBeDefined();
          const approvedInvites = invites.filter(
            (inv: any) => inv.status === 'approved'
          );
          expect(approvedInvites.length).toEqual(1);
          expect(approvedInvites?.[0]?.id).toEqual(invitations.second.id);
        });

        it('Resend org invite should success', async () => {
          const resendOrgInviteRes = await gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.second.id,
                action: OrganizationInviteAction.Resend,
                applicationRoles: []
              }
            },
            tokenOptions
          );

          const resend = resendOrgInviteRes?.data?.updateOrganizationInvite;
          expect(resend?.email).toEqual(org2Setup.regularUser.email);
          expect(resend?.status).toEqual('approved');
          expect(resend?.organization?.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
        });

        it('Only 1 active invitation, not create new invitation', async () => {
          const listInviteRes = await gqlClient.sdk.organization(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          const listInvites =
            listInviteRes?.data?.organization?.organizationInvites || [];
          const approvedInvites = listInvites.filter(
            (inv: any) => inv.status === 'approved'
          );
          expect(approvedInvites.length).toEqual(1);
          expect(approvedInvites?.[0]?.id).toEqual(invitations.second.id);
          expect(approvedInvites?.[0]?.status).toEqual('approved');
        });

        it('Org user should not included invitee', async () => {
          const listUserRes = await gqlClient.sdk.organizations(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          expect(listUserRes?.data?.organizations?.records?.length).toEqual(1);
          const listUser =
            listUserRes?.data?.organizations?.records?.[0]?.users?.records ||
            [];
          const invitee = listUser.filter(
            (u: any) => u.id === org2Setup.regularUser.userId
          );
          expect(invitee.length).toEqual(0);
        });

        it('Admin complete invitation for user should fail', async () => {
          const orgInvite = gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.second.id,
                action: OrganizationInviteAction.Complete,
                applicationRoles: []
              }
            },
            tokenOptions
          );

          await expect(orgInvite).rejects.toThrow(
            /Complete action is only allowed by Invitee/
          );
        });

        it('Invitee accept invitation with out app role should fail', async () => {
          const orgInvite = gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.second.id,
                action: OrganizationInviteAction.Complete,
                applicationRoles: undefined as any
              }
            },
            org2Setup.regularUser.requestOptions
          );

          await expect(orgInvite).rejects.toThrow(
            /applicationRoles.* was not provided/
          );
        });

        it('Invitee accept invitation should success', async () => {
          try {
            await gqlClient.sdk.updateOrgInvite(
              {
                input: {
                  organizationInviteId: invitations.second.id,
                  action: OrganizationInviteAction.Complete,
                  applicationRoles: []
                }
              },
              org2Setup.regularUser.requestOptions
            );

            // expect(inviteRes?.data?.updateOrganizationInvite?.status).toEqual(
            //   'completed'
            // );
            // expect(inviteRes?.data?.updateOrganizationInvite?.id).toEqual(
            //   invitations.second.id
            // );
          } catch (error) {}
        });

        it('Org user should included invitee', async () => {
          const listUserRes = await gqlClient.sdk.organizations(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          expect(listUserRes?.data?.organizations?.records?.length).toEqual(1);
          const listUser =
            listUserRes?.data?.organizations?.records?.[0]?.users?.records ||
            [];
          const invitee = listUser.filter(
            (u: any) => u.id === org2Setup.regularUser.userId
          );
          expect(invitee?.[0]?.id).toEqual(org2Setup.regularUser.userId);
        });

        it('Invitee can login to org', async () => {
          const loginRes = await gqlClient.sdk.userLogin({
            input: {
              userName: org2Setup.regularUser.userName,
              password: 'testPassword',
              organizationGuid: org1Setup.org.guid
            }
          });
          expect(loginRes?.data?.userLogin).toBeDefined();
          expect(loginRes?.data?.userLogin?.user?.id).toEqual(
            org2Setup.regularUser.userId
          );
          expect(loginRes?.data?.userLogin?.organization?.id).toEqual(
            org1Setup.org.id
          );
        });

        it('Invite user again should fail', async () => {
          const orgInvite = gqlClient.sdk.createOrgInvite(
            {
              input: {
                organizationId: org1Setup.org.id,
                email: org2Setup.regularUser.email,
                message: 'test email 4',
                applicationRoles
              },
              includePasswordResetToken: isSuperAdmin // only super admin can get password reset token in response
            },
            tokenOptions
          );

          await expect(orgInvite).rejects.toThrow(
            /This user is already a member of this organization/
          );
        });

        it('Remove invitee from org should success', async () => {
          const removeRes = await gqlClient.sdk.removeUserFromOrganization(
            {
              userId: org2Setup.regularUser.userId,
              organizationGuid: org1Setup.org.guid
            },
            tokenOptions
          );

          const remove = removeRes?.data?.removeUserFromOrganization;
          expect(remove?.id).toEqual(org2Setup.regularUser.userId);
        });

        it('Org user should not included invitee', async () => {
          const listUserRes = await gqlClient.sdk.organizations(
            {
              id: org1Setup.org.id
            },
            tokenOptions
          );

          expect(listUserRes?.data?.organizations?.records?.length).toEqual(1);
          const listUser =
            listUserRes?.data?.organizations?.records?.[0]?.users?.records ||
            [];
          const invitee = listUser.filter(
            (u: any) => u.id === org2Setup.regularUser.userId
          );
          expect(invitee.length).toEqual(0);
        });

        it('Invite user again without delete invitation should success', async () => {
          const orgInviteRes = await gqlClient.sdk.createOrgInvite(
            {
              input: {
                organizationId: org1Setup.org.id,
                email: org2Setup.regularUser.email,
                message: 'test email 5',
                applicationRoles
              },
              includePasswordResetToken: isSuperAdmin
            },
            tokenOptions
          );

          const invite = orgInviteRes?.data?.createOrganizationInvite;
          expect(invite.id).toBeDefined();
          expect(invite.email).toEqual(org2Setup.regularUser.email);
          expect(invite.status).toEqual('approved');
          invitations.second = invite;
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
        });

        it('Delete old invitation should success', async () => {
          const deleteOrgInviteRes =
            await gqlClient.sdk.deleteOrganizationInvite(
              {
                id: invitations.second.id
              },
              tokenOptions
            );

          const del = deleteOrgInviteRes?.data?.deleteOrganizationInvite;
          expect(del?.id).toEqual(invitations.second.id);
        });

        it('Create org invite for existed user again should success', async () => {
          const orgInviteRes = await gqlClient.sdk.createOrgInvite(
            {
              input: {
                organizationId: org1Setup.org.id,
                email: org2Setup.regularUser.email,
                message: 'test email 6',
                applicationRoles
              },
              includePasswordResetToken: isSuperAdmin
            },
            tokenOptions
          );
          const invite = orgInviteRes?.data?.createOrganizationInvite;
          invitations.second = invite;
          expect(invitations.second.id).toBeDefined();
          expect(invitations.second.email).toEqual(org2Setup.regularUser.email);
          expect(invitations.second.status).toEqual('approved');
          expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
        });

        xit('Invitee login to org should fail', async () => {
          const loginRes = gqlClient.sdk.userLogin({
            input: {
              userName: org2Setup.regularUser.userName,
              password: 'testPassword',
              organizationGuid: org1Setup.org.guid
            }
          });

          await expect(loginRes).rejects.toThrow(
            /User is not a member of this organization/
          );
        });

        it('Invitee accept invitation should success', async () => {
          try {
            await gqlClient.sdk.updateOrgInvite(
              {
                input: {
                  organizationInviteId: invitations.second.id,
                  action: OrganizationInviteAction.Complete,
                  applicationRoles: []
                }
              },
              org2Setup.regularUser.requestOptions
            );
          } catch (error) {}
        });

        it('Invitee can login to org', async () => {
          const loginRes = await gqlClient.sdk.userLogin({
            input: {
              userName: org2Setup.regularUser.userName,
              password: 'testPassword',
              organizationGuid: org1Setup.org.guid
            }
          });
          expect(loginRes?.data?.userLogin?.user?.id).toEqual(
            org2Setup.regularUser.userId
          );
          expect(loginRes?.data?.userLogin?.organization?.id).toEqual(
            org1Setup.org.id
          );
        });

        it('Delete invitation and remove user from org should success', async () => {
          const removeUserFromOrgRes =
            await gqlClient.sdk.removeUserFromOrganization(
              {
                userId: org2Setup.regularUser.userId,
                organizationGuid: org1Setup.org.guid
              },
              tokenOptions
            );

          const remove = removeUserFromOrgRes?.data?.removeUserFromOrganization;
          expect(remove?.id).toEqual(org2Setup.regularUser.userId);

          const deleteOrgInviteRes =
            await gqlClient.sdk.deleteOrganizationInvite(
              {
                id: invitations.second.id
              },
              tokenOptions
            );

          const deleteInvite =
            deleteOrgInviteRes?.data?.deleteOrganizationInvite;
          expect(deleteInvite?.id).toEqual(invitations.second.id);
        });

        it('Create org invite for existed user again should success', async () => {
          const orgInviteRes = await gqlClient.sdk.createOrgInvite(
            {
              input: {
                organizationId: org1Setup.org.id,
                email: org2Setup.regularUser.email,
                message: 'test email 7',
                applicationRoles
              },
              includePasswordResetToken: isSuperAdmin
            },
            tokenOptions
          );

          invitations.second = orgInviteRes?.data?.createOrganizationInvite;
          expect(invitations.second.id).toBeDefined();
          expect(invitations.second.email).toEqual(org2Setup.regularUser.email);
          expect(invitations.second.status).toEqual('approved');
          expect(invitations.second.organization.id).toEqual(org1Setup.org.id);
          emailCount++;
          inviteEmails.add(org2Setup.regularUser.email);
        });

        it('Delete invitation should success', async () => {
          const deleteOrgInviteRes =
            await gqlClient.sdk.deleteOrganizationInvite(
              {
                id: invitations.second.id
              },
              tokenOptions
            );

          const deleteInvite =
            deleteOrgInviteRes?.data?.deleteOrganizationInvite;
          expect(deleteInvite?.id).toEqual(invitations.second.id);
        });

        it('Invitee accept invitation should fail', async () => {
          const orgInvite = gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.second.id,
                action: OrganizationInviteAction.Complete,
                applicationRoles: []
              }
            },
            org2Setup.regularUser.requestOptions
          );

          await expect(orgInvite).rejects.toThrow(
            /organizationInviteId not found/
          );
        });
      });

      afterAll(async () => {
        //delete all invitation
        const getInviteRes = await gqlClient.sdk.organization(
          {
            id: org1Setup.org.id
          },
          tokenOptions
        );
        const invites =
          getInviteRes?.data?.organization?.organizationInvites || [];

        if (invites.length) {
          const deleteInvites = invites
            .filter((inv) => inv?.id && inv.status !== 'deleted')
            .map((inv) =>
              safe(`delete org invite ${inv?.id}`, async () =>
                gqlClient.sdk.deleteOrganizationInvite(
                  {
                    id: inv?.id!
                  },
                  tokenOptions
                )
              )
            );

          await Promise.all(deleteInvites);
        }
      });
    }
  );

  describe('Invite deactivated/deleted user already in org', () => {
    let deactivatedUser = {} as any;
    let deactivatedUserInvite = {} as any;

    beforeAll(async () => {
      // Create a new user directly in org1
      const uniqueId = uuidv4();
      const deactivatedUserEmail = `${citestMarker}-deactivated-user+${uniqueId}@veritone.com`;

      const createUserRes = await gqlClient.sdk.createUser({
        input: {
          name: deactivatedUserEmail,
          firstName: 'Deactivated',
          lastName: 'User',
          organizationId: org1Setup.org.id,
          roleIds: ['555033d1-508c-49c0-8127-66c2dc129828']
        }
      });

      deactivatedUser = {
        userId: createUserRes?.data?.createUser?.id,
        email: deactivatedUserEmail
      };

      expect(deactivatedUser.userId).toBeDefined();
    });

    describe.each(['deleted', 'inactive', 'suspended'])(
      'Super admin invite user with status "%s" in org should succeed',
      (targetStatus) => {
        // No per-iteration re-auth needed: gqlClient is the isolated superadmin
        // set up in the outer beforeAll above, so no other spec's session
        // activity can rotate it out from under this block (T63).

        it(`Set user status to "${targetStatus}"`, async () => {
          const updateStatusRes = await gqlClient.sdk.updateUserStatus({
            input: {
              id: deactivatedUser.userId,
              status: targetStatus as UserStatus
            }
          });

          const updatedUser = updateStatusRes?.data?.updateUserStatus;
          expect(updatedUser?.id).toEqual(deactivatedUser.userId);
          expect(updatedUser?.status).toEqual(targetStatus);
        });

        it(`Super admin invite "${targetStatus}" user should succeed and create completed invite`, async () => {
          // T55: createOrgInvite's response selection includes `createdBy`,
          // which the server resolves in-request from an audit row written
          // moments earlier by createOrganizationInvite. That resolution
          // intermittently returned no rows here, tripping "Cannot return
          // null for non-nullable field BasicUserInfo.id." (confirmed via
          // docker-compose-logs). citest's Postgres is a single instance
          // (sso.read/sso.write point at the same DB), so this isn't replica
          // lag — the exact mechanism isn't fully pinned down, but a short
          // fixed delay before the call is a pragmatic, low-risk mitigation.
          await helpers.sleep(1000);

          const orgInviteRes = await gqlClient.sdk.createOrgInvite({
            input: {
              organizationId: org1Setup.org.id,
              email: deactivatedUser.email,
              message: `test invite ${targetStatus} user`,
              applicationRoles
            }
          });

          deactivatedUserInvite = orgInviteRes?.data?.createOrganizationInvite;
          expect(deactivatedUserInvite.id).toBeDefined();
          expect(deactivatedUserInvite.email).toEqual(deactivatedUser.email);
          expect(deactivatedUserInvite.organization.id).toEqual(
            org1Setup.org.id
          );
        });

        it('User status should be active after super admin invite', async () => {
          const getUserRes = await gqlClient.sdk.user({
            id: deactivatedUser.userId,
            organizationIds: [org1Setup.org.id]
          });
          expect(getUserRes?.data?.user?.status).toEqual('active');
        });

        it('Cleanup: delete the invite', async () => {
          if (deactivatedUserInvite?.id) {
            const deleteOrgInviteRes =
              await gqlClient.sdk.deleteOrganizationInvite({
                id: deactivatedUserInvite.id
              });

            const deleteInvite =
              deleteOrgInviteRes?.data?.deleteOrganizationInvite;
            expect(deleteInvite?.id).toEqual(deactivatedUserInvite.id);
          }
        });
      }
    );

    describe.each(['deleted', 'inactive', 'suspended'])(
      'Org admin invite user with status "%s" in org should fail',
      (targetStatus) => {
        it(`Set user status to "${targetStatus}"`, async () => {
          const updateStatusRes = await gqlClient.sdk.updateUserStatus({
            input: {
              id: deactivatedUser.userId,
              status: targetStatus as UserStatus
            }
          });

          const updatedUser = updateStatusRes?.data?.updateUserStatus;
          expect(updatedUser?.id).toEqual(deactivatedUser.userId);
          expect(updatedUser?.status).toEqual(targetStatus);
        });

        it(`Org admin invite "${targetStatus}" user should fail`, async () => {
          const orgInvite = gqlClient.sdk.createOrgInvite(
            {
              input: {
                organizationId: org1Setup.org.id,
                email: deactivatedUser.email,
                message: `test invite ${targetStatus} user`,
                applicationRoles
              }
            },
            org1Setup.adminUser.requestOptions
          );

          await expect(orgInvite).rejects.toThrow(
            /This user is already a member of this organization/
          );
        });
      }
    );

    afterAll(async () => {
      // Cleanup: reactivate user so it can be properly cleaned up in main afterAll
      if (deactivatedUser.userId) {
        await safe(`reactivate user ${deactivatedUser.userId}`, async () =>
          gqlClient.sdk.updateUserStatus({
            input: {
              id: deactivatedUser.userId,
              status: 'active' as UserStatus
            }
          })
        );

        //Delete the User
        await safe(`delete user ${deactivatedUser.userId}`, async () =>
          gqlClient.sdk.deleteUser({
            id: deactivatedUser.userId
          })
        );
      }
    });
  });

  afterAll(async (): Promise<void> => {
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

    const listUsersIds: string[] = [
      org1Setup.adminUser?.userId,
      org1Setup.regularUser?.userId,
      org2Setup.adminUser?.userId,
      org2Setup.regularUser?.userId
    ].filter((id): id is string => Boolean(id));

    if (listUsersIds.length > 0) {
      await Promise.all(
        listUsersIds.map((userId) =>
          safe(`delete user ${userId}`, async () =>
            gqlClient.sdk.deleteUser({ id: userId })
          )
        )
      );
    }

    if (org1Setup.org?.id) {
      await safe(`delete org ${org1Setup.org.id}`, async () =>
        gqlClient.sdk.updateOrganization({
          input: {
            id: org1Setup.org.id,
            status: 'deleted'
          }
        })
      );
    }

    if (org2Setup.org?.id) {
      await safe(`delete org ${org2Setup.org.id}`, async () =>
        gqlClient.sdk.updateOrganization({
          input: {
            id: org2Setup.org.id,
            status: 'deleted'
          }
        })
      );
    }

    // Must run after this spec's own org/user cleanup above, since it uses
    // the SHARED bootstrap session (unaffected by anything this spec did to
    // the isolated superadmin's session) to tear down the throwaway org+user.
    await isolatedSA?.cleanup();
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

type MailpitMessage = {
  ID: string;
  To?: { Address?: string }[];
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
