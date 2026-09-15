const helpers = require('../../../../helpers/index');
import {
  OrganizationInviteAction,
  OrganizationStatus,
  OrganizationType
} from '../../src/gql';
import {
  AuthType,
  buildRequestHeaders,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { v4 as uuidv4 } from 'uuid';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import chakram from 'chakram';
import { safe } from '../../src/helpers/commonHelper';
import _ from 'lodash';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

const config = helpers.config;
const baseUrl = config.core_admin_url;
const supertest = require('supertest')(baseUrl);

interface Application {
  applicationId: string;
  applicationKey: string;
}

interface Role {
  id: string;
  appName: string;
}

interface MappedAppRole {
  applicationId: string;
  roleId: string;
}

const MAILPIT_BASE_URL =
  process.env.NODE_ENV === 'test'
    ? 'http://mailpit:8025' // run on ci pipeline
    : 'http://localhost:8025'; // run on local

let gqlClient: GraphqlClient;
// T63: this spec's own login activity in beforeAll can rotate the SHARED
// citest superadmin's session token, which adminInviteExistedUser.spec.ts
// (pinned to the same shard) also authenticates as — a rotated token there
// made `createdBy` resolve to a stale/missing user mid-run. Using an
// isolated superadmin here means this spec never touches the shared session
// at all, removing the rotation at its source rather than just protecting
// the other spec from it.
let isolatedSA: IsolatedSuperadmin;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const userAgent = config.userAgent || 'core-graphql-server test';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;
let adminRequestHeaders: Record<string, string>;
let regularUserRequestHeaders: Record<string, string>;

let org1Setup = {
  org: {} as any,
  adminUser: { requestOptions: {} as Record<string, string> } as any,
  regularUser: { requestOptions: {} as Record<string, string> } as any
};

let org2Setup = {
  org: {} as any,
  adminUser: { requestOptions: {} as Record<string, string> } as any,
  regularUser: { requestOptions: {} as Record<string, string> } as any
};

const notMatchAppRole: MappedAppRole[] = [];

let invitations: any = { first: null, second: null };

const newUserIds: string[] = [];
let emailCount = 0;
const inviteEmails = new Set();

function requestOptions(token: string) {
  return {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'User-Agent': userAgent,
    Accept: '*/*',
    'Veritone-Correlation-ID': uuidv4(),
    'X-Veritone-Application': 'GraphQL-CI-Test'
  };
}

describe('citest_orginvite: Test org invite app Role', () => {
  beforeAll(async () => {
    const bootstrap = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSA = await createIsolatedSuperadmin(bootstrap);
    gqlClient = isolatedSA.client;

    // create org 1
    const testOrg1 = await setupTestOrgAndUser(
      gqlClient,
      createOrgAndUserInput(citestMarker + '-org-invite-1-')
    );

    org1Setup.org = testOrg1.org;
    org1Setup.adminUser = testOrg1.listOptions.find((option) =>
      option.userName.includes(`${citestMarker}-admin-user-`)
    );
    adminRequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: org1Setup.adminUser.userName,
      password: org1Setup.adminUser.password
    });

    org1Setup.regularUser = testOrg1.listOptions.find((option) =>
      option.userName.includes(`${citestMarker}-regular-user-`)
    );
    regularUserRequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: org1Setup.regularUser.userName,
      password: org1Setup.regularUser.password
    });

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
    'OrganizationInvite AppRole flow - %s invite handling',
    (tokenType) => {
      let tokenOptions: any;
      let isSuperAdmin = false;
      beforeAll(async () => {
        tokenOptions =
          tokenType === 'superAdmin' ? {} : org1Setup.adminUser.requestOptions;
      });

      let appList = [];
      let roleList: any[] = [];
      let mappedAppRole: MappedAppRole[] = [];
      let appListOrg2 = [];
      let roleListOrg2 = [];
      let mappedAppRoleOrg2: MappedAppRole[] = [];
      let newToken = '';

      describe(`${tokenType} invite appRole`, () => {
        const newEmail = `thoang2+${uuidv4()}@veritone.com`;
        beforeEach(() => {
          isSuperAdmin = tokenType === 'superAdmin' ? true : false;
        });

        it('get list app and roles of org', async () => {
          const query = `
            query fetchOrgAppsAndRoles{
      organization(id: "${org1Setup.org.id}") {
        id
        name
        applications {
          records {
            id
            name
            isPublic
            status
          }
        }
        roles(isAppEventRole: false) {
          id
          name
          appName
          description
        }
      }
    }
        `;
          const listRolesRes = await gqlClient.query(query, {}, tokenOptions);

          expect(listRolesRes?.organization).toBeDefined();
          expect(listRolesRes?.organization?.id).toEqual(org1Setup.org.id);
          expect(listRolesRes?.organization?.applications).toBeDefined();

          roleList = listRolesRes?.organization?.roles as [];
          expect(roleList).toBeDefined();
          expect(roleList.length).toBeGreaterThan(0);
        });

        it('get list apps', async () => {
          const limit = 200;
          let offset = 0;
          let total = 0;

          const appList: Application[] = [];

          do {
            const apiPath = `/admin/current-user/applications?offset=${offset}&limit=${limit}`;

            const res = await supertest
              .get(apiPath)
              .set('Content-Type', 'application/json')
              .set('Authorization', `Bearer ${gqlClient.sessionToken}`);

            const appData = res.body as {
              totalResults: number;
              results: Application[];
            };

            const { totalResults, results } = appData;

            total = totalResults;

            appList.push(...results);

            offset += limit;

            expect(appList).toBeDefined();
            expect(appList.length).toBeGreaterThan(0);
          } while (offset <= total);

          expect(appList.length).toEqual(total);

          // map app and role
          mappedAppRole = roleList.reduce<MappedAppRole[]>(
            (listMapped, role: Role) => {
              const app = appList.find(
                (app) => app.applicationKey === role.appName
              );

              if (app) {
                listMapped.push({
                  applicationId: app.applicationId,
                  roleId: role.id
                });
              }

              return listMapped;
            },
            []
          );

          expect(mappedAppRole.length).toBeGreaterThan(0);

          // get a pair of not matched app and role
          const unmatchedApp = appList.find((app) =>
            roleList.some((role: Role) => role.appName !== app.applicationKey)
          );

          const unmatchedRole = unmatchedApp
            ? roleList.find(
                (role: Role) => role.appName !== unmatchedApp.applicationKey
              )
            : undefined;

          if (unmatchedApp && unmatchedRole) {
            notMatchAppRole.push({
              applicationId: unmatchedApp.applicationId,
              roleId: unmatchedRole.id
            });
          }
        });

        xit('Create invite using not existed role and app should fail', async () => {
          try {
            await gqlClient.sdk.createOrgInvite(
              {
                input: {
                  organizationId: org1Setup.org.id,
                  email: newEmail,
                  message: 'test email 1',
                  applicationRoles: [
                    {
                      applicationId: uuidv4(),
                      roleId: uuidv4()
                    }
                  ]
                }
              },
              tokenOptions
            );
          } catch (error) {
            expect(error).toBeDefined();
          }
        });

        xit('Create invite using not matched role and app should fail', async () => {
          try {
            await gqlClient.sdk.createOrgInvite(
              {
                input: {
                  organizationId: org1Setup.org.id,
                  email: newEmail,
                  message: 'test email 2',
                  applicationRoles: notMatchAppRole
                }
              },
              tokenOptions
            );
          } catch (error) {
            expect(error).toBeDefined();
          }
        });

        xit('Create invite with multi applications and Roles having not matched role and app should fail', async () => {
          try {
            await gqlClient.sdk.createOrgInvite(
              {
                input: {
                  organizationId: org1Setup.org.id,
                  email: newEmail,
                  message: 'test email 3',
                  applicationRoles: [...mappedAppRole, ...notMatchAppRole]
                }
              },
              tokenOptions
            );
          } catch (error) {
            expect(error).toBeDefined();
          }
        });

        it('get app and role of other org', async () => {
          const query = `
            query fetchOrgAppsAndRoles{
      organization(id: "${org2Setup.org.id}") {
        id
        name
        applications {
          records {
            id
            name
            isPublic
            status
          }
        }
        roles(isAppEventRole: false) {
          id
          name
          appName
          description
        }
      }
    }
        `;

          const listRolesRes = await gqlClient.query(query, {});

          expect(listRolesRes?.organization).toBeDefined();
          expect(listRolesRes?.organization?.id).toEqual(org2Setup.org.id);
          expect(listRolesRes?.organization?.applications).toBeDefined();

          roleListOrg2 = listRolesRes?.organization?.roles as [];
          expect(roleListOrg2).toBeDefined();
          expect(roleListOrg2.length).toBeGreaterThan(0);

          const limit = 200;
          let offset = 0;
          let total = 0;
          do {
            const apiPath = `/admin/current-user/applications?offset=${offset}&limit=${limit}`;

            const res = await supertest
              .get(apiPath)
              .set('Content-Type', 'application/json')
              .set('Authorization', `Bearer ${gqlClient.sessionToken}`);

            const appData = res.body as {
              totalResults: number;
              results: Application[];
            };

            const { totalResults, results } = appData;

            total = totalResults;

            appListOrg2.push(...results);

            offset += limit;

            expect(appListOrg2).toBeDefined();
            expect(appListOrg2.length).toBeGreaterThan(0);
          } while (offset <= total);

          expect(appListOrg2.length).toEqual(total);

          // map app and role
          mappedAppRoleOrg2 = roleListOrg2.reduce<MappedAppRole[]>(
            (listMapped, role: Role) => {
              const app = appListOrg2.find(
                (app) => app.applicationKey === role.appName
              );

              if (app) {
                listMapped.push({
                  applicationId: app.applicationId,
                  roleId: role.id
                });
              }

              return listMapped;
            },
            []
          );

          expect(mappedAppRoleOrg2.length).toBeGreaterThan(0);
        });

        xit('Create invite using role and app of other org should fail', async () => {
          try {
            await gqlClient.sdk.createOrgInvite(
              {
                input: {
                  organizationId: org1Setup.org.id,
                  email: newEmail,
                  message: 'test email 4',
                  applicationRoles: [mappedAppRoleOrg2 as any]
                }
              },
              tokenOptions
            );
          } catch (error) {
            expect(error).toBeDefined();
          }
        });

        xit('Create invite having role and app of other org should fail', async () => {
          try {
            await gqlClient.sdk.createOrgInvite(
              {
                input: {
                  organizationId: org1Setup.org.id,
                  email: newEmail,
                  message: 'test email 5',
                  applicationRoles: [
                    ...mappedAppRole,
                    ...(mappedAppRoleOrg2 as any)
                  ]
                }
              },
              tokenOptions
            );
          } catch (error) {
            expect(error).toBeDefined();
          }
        });

        it('Create invite using all matched apps and roles in current org should success', async () => {
          const orgInviteRes = await gqlClient.sdk.createOrgInvite(
            {
              input: {
                organizationId: org1Setup.org.id,
                email: newEmail,
                message: 'test email 6',
                applicationRoles: [mappedAppRole[0]] as any
              },
              includePasswordResetToken: isSuperAdmin // only super admin can get password reset token in response
            },
            tokenOptions
          );

          expect(orgInviteRes).toBeDefined();
          expect(orgInviteRes?.data?.createOrganizationInvite).toBeDefined();
          expect(orgInviteRes?.data?.createOrganizationInvite.email).toEqual(
            newEmail
          );
          expect(orgInviteRes?.data?.createOrganizationInvite.status).toEqual(
            'approved'
          );

          invitations.first = orgInviteRes?.data?.createOrganizationInvite;
          emailCount++;
          inviteEmails.add(newEmail);
        });

        it('Update invitation applicationRoles to not matched role and apps should fail', async () => {
          expect(invitations.first?.id).toBeDefined();
          expect(notMatchAppRole.length).toBeGreaterThan(0);

          const updateInviteRes = gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.first.id!,
                applicationRoles: notMatchAppRole
              }
            },
            tokenOptions
          );

          await expect(updateInviteRes).rejects.toThrow(
            /Failed to update organization invite/
          );
        });

        it('Update invitation applicationRoles to matched app and role of other org should fail', async () => {
          expect(invitations.first?.id).toBeDefined();
          expect(mappedAppRoleOrg2.length).toBeGreaterThan(0);

          const updateInviteRes = gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.first.id!,
                applicationRoles: mappedAppRoleOrg2 as any
              }
            },
            tokenOptions
          );

          await expect(updateInviteRes).rejects.toThrow(
            /Failed to update organization invite/
          );
        });

        xit('Update invitation: add valid applicationRoles should success', async () => {
          const updateOrgInviteRes = await gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.first.id!,
                applicationRoles: mappedAppRole as any
              }
            },
            tokenOptions
          );

          expect(
            updateOrgInviteRes?.data?.updateOrganizationInvite?.id
          ).toEqual(invitations.first.id);
          expect(
            updateOrgInviteRes?.data?.updateOrganizationInvite?.status
          ).toEqual('approved');
        });

        it('Update invitation: add invalid applicationRoles should fail', async () => {
          expect(invitations.first?.id).toBeDefined();
          expect(mappedAppRole.length).toBeGreaterThan(0);
          expect(notMatchAppRole.length).toBeGreaterThan(0);

          const updateInviteRes = gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.first.id!,
                applicationRoles: [...mappedAppRole, ...notMatchAppRole] as any
              }
            },
            tokenOptions
          );

          await expect(updateInviteRes).rejects.toThrow(
            /Failed to update organization invite/
          );
        });

        it('Update invitation: remove all applicationRoles should fail', async () => {
          expect(invitations.first?.id).toBeDefined();

          const updateInviteRes = gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.first.id!,
                applicationRoles: []
              }
            },
            tokenOptions
          );

          await expect(updateInviteRes).rejects.toThrow(
            /Failed to update organization invite/
          );
        });

        xit('Update invitation: remove and leaving at least 1 remain applicationRoles should success', async () => {
          const updateOrgInviteRes = await gqlClient.sdk.updateOrgInvite(
            {
              input: {
                organizationInviteId: invitations.first.id!,
                applicationRoles: [mappedAppRole[0]]
              }
            },
            tokenOptions
          );
          expect(
            updateOrgInviteRes?.data?.updateOrganizationInvite?.id
          ).toEqual(invitations.first.id);
          expect(
            updateOrgInviteRes?.data?.updateOrganizationInvite?.status
          ).toEqual('approved');
        });

        it('Invitee accept invitation should success', async () => {
          const query = `
                query fetchOrgInvites ($orgId: ID!, $organizationInviteId: ID) {
                    organization(id: $orgId) {
                    organizationInvites(
                        organizationInviteId: $organizationInviteId
                        statuses: [approved]
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
                }
            `;

          expect(invitations.first?.id).toBeDefined();

          const listInvitesRes = await gqlClient.query(query, {
            orgId: org1Setup.org.id,
            organizationInviteId: invitations.first.id!
          });
          expect(
            listInvitesRes?.organization?.organizationInvites
          ).toBeDefined();

          const listInvites = listInvitesRes.organization.organizationInvites;
          const preInvite = listInvites.find(
            (invite: any) => invite.email === newEmail
          );
          expect(preInvite).toBeDefined();
          invitations.first = preInvite;
          newToken = preInvite.passwordResetToken;
          expect(newToken).toBeDefined();

          const queryUpdateOrgInvite = `
                mutation updateInv (
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
                audit {
                    action
                    actor
                    priorStatus
                }
                organization {
                    id
                    guid
                }
                applicationRoles {
                    application {
                    id
                    }
                    role {
                    id
                    }
                }
                invitee {
                    name
                    email
                }
                status
                }
            }
            `;

          const inviteRes = await gqlClient.query(
            queryUpdateOrgInvite,
            {
              organizationInviteId: invitations.first.id!,
              applicationRoles: [],
              action: OrganizationInviteAction.Complete
            },
            requestOptions(newToken)
          );

          expect(inviteRes.updateOrganizationInvite.id).toEqual(
            invitations.first.id
          );
          expect(inviteRes.updateOrganizationInvite.status).toEqual(
            'completed'
          );
        });

        it('Run reset password for user email should success', async () => {
          const resetPasswordInvite = await supertest
            .post('/admin/org-invite/password/reset')
            .set('Content-Type', 'application/json')
            .send({
              userName: newEmail,
              password: 'testUserPassword',
              token: invitations.first.passwordResetToken,
              organizationInviteId: invitations.first.id
            });

          expect(resetPasswordInvite).toBeDefined();
          expect(resetPasswordInvite.error).toEqual(false);
          expect(resetPasswordInvite.status).toEqual(204);
        });

        it('Invitee can login to org', async () => {
          const loginRes = await gqlClient.sdk.userLogin({
            input: {
              userName: newEmail,
              password: 'testUserPassword',
              organizationGuid: org1Setup.org.guid
            }
          });

          expect(loginRes).toBeDefined();
          expect(loginRes?.data?.userLogin?.user?.name).toEqual(newEmail);
          expect(loginRes?.data?.userLogin?.organization?.id).toEqual(
            org1Setup.org.id
          );
          newToken = loginRes?.data?.userLogin?.token as string;
          newUserIds.push(loginRes?.data?.userLogin?.user?.id as string);
        });

        xit('Invitee query added applicationRoles should success', async () => {
          const query = `
            query app1 {
              applications (accessScope: [owned, granted]) {
                records {
                  id
                  name
                }
              }
            }
            `;
          const appRes = await gqlClient.query(
            query,
            {},
            requestOptions(newToken)
          );

          expect(appRes?.applications).toBeDefined();
          const appList = appRes.applications.records;
          const assignedApp = appList.find(
            (app: any) => app.id === mappedAppRole[0].applicationId
          );
          expect(assignedApp).toBeDefined();
        });
      });
    }
  );

  describe('OrganizationInvite AppRole - user role', () => {
    let newUserEmail = `thoang2+${uuidv4()}@veritone.com`;
    let appList: any[] = [];
    let roleList: any[] = [];
    let mappedAppRole: any[] = [];
    let appListOrg2: any[] = [];
    let roleListOrg2: any[] = [];
    let mappedAppRoleOrg2: any[] = [];
    let newToken = '';

    it('get list app and roles of org', async () => {
      const query = `
            query fetchOrgAppsAndRoles{
      organization(id: "${org1Setup.org.id}") {
        id
        name
        applications {
          records {
            id
            name
            isPublic
            status
          }
        }
        roles(isAppEventRole: false) {
          id
          name
          appName
          description
        }
      }
    }
        `;
      const listRolesRes = await gqlClient.query(query);

      expect(listRolesRes?.organization).toBeDefined();
      expect(listRolesRes?.organization?.id).toEqual(org1Setup.org.id);
      expect(listRolesRes?.organization?.applications).toBeDefined();

      roleList = listRolesRes?.organization?.roles as [];
      expect(roleList).toBeDefined();
      expect(roleList.length).toBeGreaterThan(0);
    });

    it('get list apps', async () => {
      const limit = 200;
      let offset = 0;
      let total = 0;

      const appList: Application[] = [];

      do {
        const apiPath = `/admin/current-user/applications?offset=${offset}&limit=${limit}`;

        const res = await supertest
          .get(apiPath)
          .set('Content-Type', 'application/json')
          .set('Authorization', `Bearer ${gqlClient.sessionToken}`);

        const appData = res.body as {
          totalResults: number;
          results: Application[];
        };

        const { totalResults, results } = appData;

        total = totalResults;

        appList.push(...results);

        offset += limit;

        expect(appList).toBeDefined();
        expect(appList.length).toBeGreaterThan(0);
      } while (offset <= total);

      expect(appList.length).toEqual(total);

      // map app and role
      mappedAppRole = roleList.reduce<MappedAppRole[]>(
        (listMapped, role: Role) => {
          const app = appList.find(
            (app) => app.applicationKey === role.appName
          );

          if (app) {
            listMapped.push({
              applicationId: app.applicationId,
              roleId: role.id
            });
          }

          return listMapped;
        },
        []
      );

      expect(mappedAppRole.length).toBeGreaterThan(0);

      // get a pair of not matched app and role
      const unmatchedApp = appList.find((app) =>
        roleList.some((role: Role) => role.appName !== app.applicationKey)
      );

      const unmatchedRole = unmatchedApp
        ? roleList.find(
            (role: Role) => role.appName !== unmatchedApp.applicationKey
          )
        : undefined;

      if (unmatchedApp && unmatchedRole) {
        notMatchAppRole.push({
          applicationId: unmatchedApp.applicationId,
          roleId: unmatchedRole.id
        });
      }
    });

    xit('Create invite using not existed role and app should fail', async () => {
      try {
        await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: newUserEmail,
              message: 'test email 7',
              applicationRoles: [
                {
                  applicationId: uuidv4(),
                  roleId: uuidv4()
                }
              ]
            }
          },
          regularUserRequestHeaders
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    xit('Create invite using not matched role and app should fail', async () => {
      try {
        await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: newUserEmail,
              message: 'test email 8',
              applicationRoles: notMatchAppRole
            }
          },
          regularUserRequestHeaders
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    xit('Create invite with multi applications and Roles having not matched role and app should fail', async () => {
      try {
        await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: newUserEmail,
              message: 'test email 9',
              applicationRoles: [...mappedAppRole, ...notMatchAppRole]
            }
          },
          regularUserRequestHeaders
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('get app and role of other org', async () => {
      const query = `
            query fetchOrgAppsAndRoles{
      organization(id: "${org2Setup.org.id}") {
        id
        name
        applications {
          records {
            id
            name
            isPublic
            status
          }
        }
        roles(isAppEventRole: false) {
          id
          name
          appName
          description
        }
      }
    }
        `;

      const listRolesRes = await gqlClient.query(
        query,
        {},
        gqlClient.sessionToken
      );

      expect(listRolesRes?.organization).toBeDefined();
      expect(listRolesRes?.organization?.id).toEqual(org2Setup.org.id);
      expect(listRolesRes?.organization?.applications).toBeDefined();

      roleListOrg2 = listRolesRes?.organization?.roles as [];
      expect(roleListOrg2).toBeDefined();
      expect(roleListOrg2.length).toBeGreaterThan(0);

      const limit = 200;
      let offset = 0;
      let total = 0;
      do {
        const apiPath = `/admin/current-user/applications?offset=${offset}&limit=${limit}`;

        const res = await supertest
          .get(apiPath)
          .set('Content-Type', 'application/json')
          .set('Authorization', `Bearer ${gqlClient.sessionToken}`);

        const appData = res.body as {
          totalResults: number;
          results: Application[];
        };

        const { totalResults, results } = appData;

        total = totalResults;

        appListOrg2.push(...results);

        offset += limit;

        expect(appListOrg2).toBeDefined();
        expect(appListOrg2.length).toBeGreaterThan(0);
      } while (offset <= total);

      expect(appListOrg2.length).toEqual(total);

      // map app and role
      mappedAppRoleOrg2 = roleListOrg2.reduce<MappedAppRole[]>(
        (listMapped, role: Role) => {
          const app = appListOrg2.find(
            (app) => app.applicationKey === role.appName
          );

          if (app) {
            listMapped.push({
              applicationId: app.applicationId,
              roleId: role.id
            });
          }

          return listMapped;
        },
        []
      );

      expect(mappedAppRoleOrg2.length).toBeGreaterThan(0);
    });

    xit('Create invite using role and app of other org should fail', async () => {
      try {
        await gqlClient.sdk.createOrgInvite(
          {
            input: {
              organizationId: org1Setup.org.id,
              email: newUserEmail,
              message: 'test email 10',
              applicationRoles: [mappedAppRoleOrg2 as any]
            }
          },
          regularUserRequestHeaders
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('Create invite using all matched apps and roles in current org should success', async () => {
      const orgInviteRes = await gqlClient.sdk.createOrgInvite(
        {
          input: {
            organizationId: org1Setup.org.id,
            email: newUserEmail,
            message: 'test email 11',
            applicationRoles: [mappedAppRole[0]] as any
          }
        },
        regularUserRequestHeaders
      );

      expect(orgInviteRes).toBeDefined();
      expect(orgInviteRes?.data?.createOrganizationInvite).toBeDefined();
      expect(orgInviteRes?.data?.createOrganizationInvite.email).toEqual(
        newUserEmail
      );
      expect(orgInviteRes?.data?.createOrganizationInvite.status).toEqual(
        'submitted'
      );

      invitations.first = orgInviteRes?.data?.createOrganizationInvite;
      emailCount++;
      inviteEmails.add(newUserEmail);
    });

    it('invitation created', async () => {
      const query = `
        query fetchOrgInvite (
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
        }
        `;

      const listInvitesRes = await gqlClient.query(query, {
        orgId: org1Setup.org.id,
        passwordResetToken: true
      });

      const listInvites = listInvitesRes?.organization?.organizationInvites;
      const preInvite = listInvites.find(
        (invite: any) => invite.email === newUserEmail
      );
      expect(preInvite.email).toEqual(newUserEmail);
      expect(preInvite.status).toEqual('submitted');
      invitations.second = preInvite;
    });

    it('admin approve invitation', async () => {
      const orgInviteRes = await gqlClient.sdk.updateOrgInvite({
        input: {
          organizationInviteId: invitations.first.id!,
          applicationRoles: [],
          action: OrganizationInviteAction.Approve
        }
      });

      expect(orgInviteRes?.data?.updateOrganizationInvite?.status).toEqual(
        'approved'
      );
      expect(orgInviteRes?.data?.updateOrganizationInvite?.email).toEqual(
        newUserEmail
      );
    });

    it('Update invitation applicationRoles to not matched role and apps should fail', async () => {
      expect(invitations.first?.id).toBeDefined();
      expect(mappedAppRoleOrg2.length).toBeGreaterThan(0);

      const updateInviteRes = gqlClient.sdk.updateOrgInvite(
        {
          input: {
            organizationInviteId: invitations.first.id!,
            applicationRoles: mappedAppRoleOrg2 as any
          }
        },
        regularUserRequestHeaders
      );

      await expect(updateInviteRes).rejects.toThrow(
        /Failed to update organization invite/
      );
    });

    it('Update invitation applicationRoles to matched app and role of other org should fail', async () => {
      expect(invitations.second?.id).toBeDefined();
      expect(mappedAppRoleOrg2.length).toBeGreaterThan(0);

      const updateInviteRes = gqlClient.sdk.updateOrgInvite(
        {
          input: {
            organizationInviteId: invitations.second.id!,
            applicationRoles: mappedAppRoleOrg2 as any
          }
        },
        regularUserRequestHeaders
      );

      await expect(updateInviteRes).rejects.toThrow(
        /Failed to update organization invite/
      );
    });

    xit('Update invitation: add valid applicationRoles should success', async () => {
      const updateOrgInviteRes = await gqlClient.sdk.updateOrgInvite(
        {
          input: {
            organizationInviteId: invitations.second.id!,
            applicationRoles: mappedAppRole as any
          }
        },
        regularUserRequestHeaders
      );

      expect(updateOrgInviteRes?.data?.updateOrganizationInvite?.id).toEqual(
        invitations.second.id
      );
      expect(
        updateOrgInviteRes?.data?.updateOrganizationInvite?.status
      ).toEqual('approved');
    });

    it('Update invitation: add invalid applicationRoles should fail', async () => {
      expect(invitations.second?.id).toBeDefined();
      expect(mappedAppRole.length).toBeGreaterThan(0);
      expect(notMatchAppRole.length).toBeGreaterThan(0);

      const updateInviteRes = gqlClient.sdk.updateOrgInvite(
        {
          input: {
            organizationInviteId: invitations.second.id!,
            applicationRoles: [...mappedAppRole, ...notMatchAppRole] as any
          }
        },
        regularUserRequestHeaders
      );

      await expect(updateInviteRes).rejects.toThrow(
        /Failed to update organization invite/
      );
    });

    it('Update invitation: remove all applicationRoles should fail', async () => {
      expect(invitations.second?.id).toBeDefined();

      const updateInviteRes = gqlClient.sdk.updateOrgInvite(
        {
          input: {
            organizationInviteId: invitations.second.id!,
            applicationRoles: []
          }
        },
        regularUserRequestHeaders
      );

      await expect(updateInviteRes).rejects.toThrow(
        /Failed to update organization invite/
      );
    });

    xit('Update invitation: remove and leaving at least 1 remain applicationRoles should success', async () => {
      const updateOrgInviteRes = await gqlClient.sdk.updateOrgInvite(
        {
          input: {
            organizationInviteId: invitations.second.id!,
            applicationRoles: [mappedAppRole[0]]
          }
        },
        regularUserRequestHeaders
      );
      expect(updateOrgInviteRes?.data?.updateOrganizationInvite?.id).toEqual(
        invitations.second.id
      );
      expect(
        updateOrgInviteRes?.data?.updateOrganizationInvite?.status
      ).toEqual('approved');
    });

    it('Invitee accept invitation should success', async () => {
      const query = `
                query fetchOrgInvites ($orgId: ID!, $organizationInviteId: ID) {
                    organization(id: $orgId) {
                    organizationInvites(
                        organizationInviteId: $organizationInviteId
                        statuses: [approved]
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
                }
            `;

      expect(invitations.first?.id).toBeDefined();

      const listInvitesRes = await gqlClient.query(
        query,
        {
          orgId: org1Setup.org.id,
          organizationInviteId: invitations.first.id!
        },
        gqlClient.sessionToken
      );
      expect(listInvitesRes?.organization?.organizationInvites).toBeDefined();

      const listInvites = listInvitesRes.organization.organizationInvites;
      const preInvite = listInvites.find(
        (invite: any) => invite.email === newUserEmail
      );
      expect(preInvite).toBeDefined();
      invitations.second = preInvite;
      newToken = preInvite.passwordResetToken;
      expect(newToken).toBeDefined();

      const queryUpdateOrgInvite = `
                mutation updateInv (
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
                audit {
                    action
                    actor
                    priorStatus
                }
                organization {
                    id
                    guid
                }
                applicationRoles {
                    application {
                    id
                    }
                    role {
                    id
                    }
                }
                invitee {
                    name
                    email
                }
                status
                }
            }
            `;

      const inviteRes = await gqlClient.query(
        queryUpdateOrgInvite,
        {
          organizationInviteId: invitations.second.id!,
          applicationRoles: [],
          action: OrganizationInviteAction.Complete
        },
        requestOptions(newToken)
      );

      expect(inviteRes.updateOrganizationInvite.id).toEqual(
        invitations.second.id
      );
      expect(inviteRes.updateOrganizationInvite.status).toEqual('completed');
    });

    it('Run reset password for user email should success', async () => {
      const resetPasswordInvite = await supertest
        .post('/admin/org-invite/password/reset')
        .set('Content-Type', 'application/json')
        .send({
          userName: newUserEmail,
          password: 'testUserPassword',
          token: invitations.second.passwordResetToken,
          organizationInviteId: invitations.second.id
        });

      expect(resetPasswordInvite).toBeDefined();
      expect(resetPasswordInvite.error).toEqual(false);
      expect(resetPasswordInvite.status).toEqual(204);
    });

    it('Invitee can login to org', async () => {
      const loginRes = await gqlClient.sdk.userLogin({
        input: {
          userName: newUserEmail,
          password: 'testUserPassword',
          organizationGuid: org1Setup.org.guid
        }
      });

      expect(loginRes).toBeDefined();
      expect(loginRes?.data?.userLogin?.user?.name).toEqual(newUserEmail);
      expect(loginRes?.data?.userLogin?.organization?.id).toEqual(
        org1Setup.org.id
      );
      newToken = loginRes?.data?.userLogin?.token as string;
      newUserIds.push(loginRes?.data?.userLogin?.user?.id as string);
    });

    xit('Invitee query added applicationRoles should success', async () => {
      const query = `
            query app1 {
              applications (accessScope: [owned, granted]) {
                records {
                  id
                  name
                }
              }
            }
            `;
      const appRes = await gqlClient.query(query, {}, requestOptions(newToken));

      expect(appRes?.applications).toBeDefined();
      const appList = appRes.applications.records;
      const assignedApp = appList.find(
        (app: any) => app.id === mappedAppRole[0].applicationId
      );
      expect(assignedApp).toBeDefined();
    });
  });

  afterAll(async () => {
    // validate no email sent externally and email sent to mailpit
    const { messageIds } = await getEmailCountFromMailpit();

    // remove test emails after test
    if (messageIds.size > 0) {
      await safe('delete mailpit org invite messages', async () =>
        chakram.delete(`${MAILPIT_BASE_URL}/api/v1/messages`, {
          ids: Array.from(messageIds)
        })
      );
    }

    // delete all invitations created in org1
    if (org1Setup?.org?.id) {
      const getInviteRes = await safe('fetch org1 invites for cleanup', () =>
        gqlClient.sdk.organization({
          id: org1Setup.org.id
        })
      );

      const getInvites = _.get(
        getInviteRes,
        'data.organization.organizationInvites',
        []
      ) as any[];

      await Promise.all(
        getInvites
          .filter((inv: any) => inv?.id && inv.status !== 'deleted')
          .map((inv: any) =>
            safe(`delete org invite ${inv.id}`, () =>
              gqlClient.sdk.deleteOrganizationInvite({
                id: inv.id
              })
            )
          )
      );
    }

    // delete users
    const listUsersIds: string[] = [
      org1Setup?.adminUser?.userId,
      org1Setup?.regularUser?.userId,
      org2Setup?.adminUser?.userId,
      org2Setup?.regularUser?.userId,
      ...newUserIds
    ].filter((id): id is string => Boolean(id));

    for (const userId of Array.from(new Set(listUsersIds))) {
      await safe(`delete user ${userId}`, () =>
        gqlClient.sdk.deleteUser({ id: userId })
      );
    }

    // delete orgs
    for (const org of [org1Setup.org, org2Setup.org]) {
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

    // Must run after this spec's own org/user cleanup above, since it uses
    // the SHARED bootstrap session (unaffected by anything this spec did to
    // the isolated superadmin's session) to tear down the throwaway org+user.
    await isolatedSA?.cleanup();
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
        billing: {
          pausedProcessing: false
        },
        features: {
          automaticPackageCreation: 'enabled'
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
  To?: {
    Address?: string;
  }[];
};
type MailpitResponse = {
  body?: {
    messages?: MailpitMessage[];
  };
};

async function getEmailCountFromMailpit(): Promise<{
  messagesCount: number;
  messageIds: Set<string>;
}> {
  let messagesCount = 0;
  const maxRetries = 5;
  let retries = 0;
  const messageIds = new Set<string>();

  while (messagesCount < emailCount && retries < maxRetries) {
    const res = (await chakram.get(
      `${MAILPIT_BASE_URL}/api/v1/messages`
    )) as MailpitResponse;

    const messages = res.body?.messages ?? [];

    messagesCount = messages.filter((message) => {
      const email = message.To?.[0]?.Address;
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
