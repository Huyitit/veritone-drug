const helpers = require('../helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');
const chakram = require('chakram');
const orgHelpers = require('../helpers/organization.js');
const userHelpers = require('../helpers/user.js');
const orgInviteHelpers = require('../helpers/orgInvite.js');
const { safe } = require('../helpers/cleanup/utils.js');

const config = helpers.config;
const baseUrl = config.core_admin_url;
const _ = require('lodash');
const env = config.env;
const uuid = require('uuid');
const gqlClient = new GraphqlClient(env);
const supertest = require('supertest')(baseUrl);
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

let notMathAppRole = [];

const applicationRoles = [
  {
    applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
    roleId: '912e377e-f4a4-4184-8db1-baa9670d8081'
  }
];

const newUserIds = [];
const createdUserIds = new Set();
const createdInviteIds = new Set();
const createdUserEmails = new Set();

let emailCount = 0;
const inviteEmails = new Set();

describe('citest_orginvite: Test org invite app Role', () => {
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
    'OrganizationInvite AppRole flow - %s invite handling',
    (tokenType) => {
      let tokenOptions;
      beforeAll(async () => {
        tokenOptions =
          tokenType === 'superAdmin'
            ? superAdmin.options
            : org1Setup.adminUser.requestOptions;
        tokenOptions = superAdmin.options;
      });

      let appList = [];
      let roleList = [];
      let mappedAppRole = [];
      let appListOrg2 = [];
      let roleListOrg2 = [];
      let mappedAppRoleOrg2 = [];
      let newToken = '';

      describe(`${tokenType} invite appRole`, () => {
        const newEmail = `thoang2+${uuid.v4()}@veritone.com`;

        it('get list app and roles of org', async () => {
          const listRoleRes = await orgHelpers.helpFetchOrgAppsAndRoles(
            { gqlClient, options: tokenOptions },
            org1Setup.org.id
          );

          const org = _.get(listRoleRes, 'organization');
          expect(org).toBeDefined();
          expect(org.id).toEqual(org1Setup.org.id);
          expect(org.applications).toBeDefined();
          roleList = _.get(org, 'roles');
          expect(roleList).toBeDefined();
          expect(roleList.length).toBeGreaterThan(0);
        });

        it('get list apps', async () => {
          const limit = 200;
          let offset = 0;
          let total = 0;
          do {
            const ApiPath = `/admin/current-user/applications?offset=${offset}&limit=${limit}`;
            const res = await supertest
              .get(ApiPath)
              .set('Content-Type', 'application/json')
              .set('Authorization', 'Bearer ' + superAdmin.token);

            const appData = _.get(res, '_body');
            const { totalResults, results } = appData;
            total = totalResults;
            appList.push(...results);
            offset += limit;
            expect(appList).toBeDefined();
            expect(appList.length).toBeGreaterThan(0);
          } while (offset <= total);
          expect(appList.length).toEqual(total);

          // map app and role
          mappedAppRole = roleList.reduce((listMapped, role) => {
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
          }, []);

          expect(mappedAppRole.length).toBeGreaterThan(0);

          // get a pair of not match app and role
          let roleData = {};
          const appData = appList.find((app) => {
            roleData = roleList.find(
              (role) => role.appName !== app.applicationKey
            );
            return roleData;
          });

          notMathAppRole.push({
            applicationId: appData.applicationId,
            roleId: roleData.id
          });
        });

        xit('Create invite using not existed role and app should fail', async () => {
          const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 1',
              applicationRoles: [
                {
                  applicationId: uuid.v4(),
                  roleId: uuid.v4()
                }
              ]
            }
          );

          await expect(orgInviteRes).rejects.toThrow();
        });

        xit('Create invite using not matched role and app should fail', async () => {
          const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 2',
              applicationRoles: notMathAppRole
            }
          );

          await expect(orgInviteRes).rejects.toThrow();
        });

        xit('Create invite with multi applications and Roles having not matched role and app should fail', async () => {
          const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 3',
              applicationRoles: [...mappedAppRole, ...notMathAppRole]
            }
          );

          await expect(orgInviteRes).rejects.toThrow();
        });

        it('get app and role of other org', async () => {
          // get role
          const listRoleRes = await orgHelpers.helpFetchOrgAppsAndRoles(
            { gqlClient, options: tokenOptions },
            org2Setup.org.id
          );

          const org = _.get(listRoleRes, 'organization');
          expect(org).toBeDefined();
          expect(org.id).toEqual(org2Setup.org.id);
          expect(org.applications).toBeDefined();
          roleListOrg2 = _.get(org, 'roles');
          expect(roleListOrg2).toBeDefined();
          expect(roleListOrg2.length).toBeGreaterThan(0);

          // get app
          const limit = 200;
          let offset = 0;
          let total = 0;
          do {
            const ApiPath = `/admin/current-user/applications?offset=${offset}&limit=${limit}`;
            const res = await supertest
              .get(ApiPath)
              .set('Content-Type', 'application/json')
              .set('Authorization', 'Bearer ' + superAdmin.token);

            const appData = _.get(res, '_body');
            const { totalResults, results } = appData;
            total = totalResults;
            appListOrg2.push(...results);
            offset += limit;
            expect(appListOrg2).toBeDefined();
            expect(appListOrg2.length).toBeGreaterThan(0);
          } while (offset <= total);
          expect(appListOrg2.length).toEqual(total);

          // map app and role
          mappedAppRoleOrg2 = roleList.reduce((listMapped, role) => {
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
          }, []);

          expect(mappedAppRoleOrg2.length).toBeGreaterThan(0);
        });

        xit('Create invite using role and app of other org should fail', async () => {
          const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 4',
              applicationRoles: mappedAppRoleOrg2
            }
          );

          await expect(orgInviteRes).rejects.toThrow();
        });

        xit('Create invite having role and app of other org should fail', async () => {
          const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 5',
              applicationRoles: [...mappedAppRoleOrg2, ...mappedAppRole]
            }
          );

          await expect(orgInviteRes).rejects.toThrow();
        });

        it('Create invite using all matched apps and roles in current org should success', async () => {
          const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationId: org1Setup.org.id,
              email: newEmail,
              message: 'test email 6',
              applicationRoles: [mappedAppRole[0]]
            }
          );

          const orgInviteData = _.get(orgInviteRes, 'createOrganizationInvite');
          expect(orgInviteData).toBeDefined();
          expect(orgInviteData.email).toEqual(newEmail);
          expect(orgInviteData.status).toEqual('approved');
          invitations.first = orgInviteData;
          trackCreatedInvite(orgInviteData.id);
          trackCreatedUserEmail(newEmail);
          emailCount++;
          inviteEmails.add(newEmail);
        });

        it('Update invitation applicationRoles to not matched role and apps should fail', async () => {
          const orgInviteRes = orgInviteHelpers.helpUpdateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationInviteId: invitations.first.id,
              applicationRoles: notMathAppRole
            }
          );

          await expect(orgInviteRes).rejects.toThrow(
            /Failed to update organization invite/
          );
        });

        it('Update invitation applicationRoles to matched app and role of other org should fail', async () => {
          const orgInviteRes = orgInviteHelpers.helpUpdateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationInviteId: invitations.first.id,
              applicationRoles: mappedAppRoleOrg2
            }
          );

          await expect(orgInviteRes).rejects.toThrow(
            /Failed to update organization invite/
          );
        });

        xit('Update invitation: add valid applicationRoles should success', async () => {
          const orgInviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationInviteId: invitations.first.id,
              applicationRoles: mappedAppRole
            }
          );

          const invite = _.get(orgInviteRes, 'updateOrganizationInvite');

          expect(invite.id).toEqual(invitations.first.id);
          expect(invite.status).toEqual('approved');
        });

        it('Update invitation: add invalid applicationRoles should fail', async () => {
          const orgInviteRes = orgInviteHelpers.helpUpdateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationInviteId: invitations.first.id,
              applicationRoles: [...mappedAppRole, ...notMathAppRole]
            }
          );

          await expect(orgInviteRes).rejects.toThrow(
            /Failed to update organization invite/
          );
        });

        it('Update invitation: remove all applicationRoles should fail', async () => {
          const orgInviteRes = orgInviteHelpers.helpUpdateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationInviteId: invitations.first.id,
              applicationRoles: []
            }
          );

          await expect(orgInviteRes).rejects.toThrow(
            /Failed to update organization invite/
          );
        });

        xit('Update invitation: remove and leaving at least 1 remain applicationRoles should success', async () => {
          const orgInviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
            { gqlClient, options: tokenOptions },
            {
              organizationInviteId: invitations.first.id,
              applicationRoles: [mappedAppRole[0]]
            }
          );

          const invite = _.get(orgInviteRes, 'updateOrganizationInvite');

          expect(invite.id).toEqual(invitations.first.id);
          expect(invite.status).toEqual('approved');
        });

        it('Invitee accept invitation should success', async () => {
          try {
            const listInviteRes =
              await orgInviteHelpers.helpGetOrgInviteByOrgId(
                { gqlClient, options: superAdmin.options },
                {
                  orgId: org1Setup.org.id,
                  passwordResetToken: true,
                  inviteStatuses: ['approved']
                }
              );

            const listInvite = _.get(
              listInviteRes,
              'organization.organizationInvites'
            );

            const preInvite = listInvite.find((inv) => inv.email === newEmail);
            expect(preInvite).toBeDefined();
            invitations.first = preInvite;
            trackCreatedInvite(preInvite.id);
            newToken = preInvite.passwordResetToken;
            const inviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
              { gqlClient, options: helpers.requestOptions(newToken) },
              {
                organizationInviteId: invitations.first.id,
                applicationRoles: [],
                action: 'complete'
              }
            );

            const invite = _.get(inviteRes, 'updateOrganizationInvite');

            expect(invite.id).toEqual(invitations.first.id);
            expect(invite.status).toEqual('completed');
          } catch (error) {
            console.log(error);
          }
        });

        it('Run reset password for user email should success', async () => {
          const resetPasswordRes =
            await orgInviteHelpers.helpResetPasswordInvite({
              baseUrl: config.core_admin_url,
              invitation: invitations.first,
              userName: newEmail,
              password: 'testUserPassword',
              ApiPath: '/admin/org-invite/password/reset'
            });

          expect(resetPasswordRes).toBeDefined();
          expect(resetPasswordRes.error).toEqual(false);
          expect(resetPasswordRes.statusCode).toEqual(204);
        });

        it('Invitee can login to org', async () => {
          const loginRes = await userHelpers.loginUser(
            { gqlClient },
            {
              userName: newEmail,
              password: 'testUserPassword',
              organizationGuid: org1Setup.org.guid
            }
          );

          expect(loginRes).toBeDefined();
          expect(loginRes.user.name).toEqual(newEmail);
          expect(loginRes.organization.id).toEqual(org1Setup.org.id);
          newToken = loginRes.token;
          newUserIds.push(loginRes.user.id);
          trackCreatedUser(loginRes.user.id);
        });

        xit('Invitee query added applicationRoles should success', async () => {
          const appRes = await gqlClient.query(
            `query app1 {
              applications (accessScope: [owned, granted]) {
                records {
                  id
                  name
                }
              }
            }`,
            {},
            helpers.requestOptions(newToken)
          );

          const app = _.get(appRes, 'applications');
          expect(app).toBeDefined();
          const addedApp = app.records.find(
            (a) => a.id === mappedAppRole[0].applicationId
          );
          expect(addedApp).toBeDefined();
        });
      });
    }
  );

  describe('OrganizationInvite AppRole - user role', () => {
    let newUserEmail = `thoang2+${uuid.v4()}@veritone.com`;
    let appList = [];
    let roleList = [];
    let mappedAppRole = [];
    let appListOrg2 = [];
    let roleListOrg2 = [];
    let mappedAppRoleOrg2 = [];
    let newToken = '';

    it('get list app and roles of org', async () => {
      const listRoleRes = await orgHelpers.helpFetchOrgAppsAndRoles(
        { gqlClient, options: superAdmin.token },
        org1Setup.org.id
      );

      const org = _.get(listRoleRes, 'organization');
      expect(org).toBeDefined();
      expect(org.id).toEqual(org1Setup.org.id);
      expect(org.applications).toBeDefined();
      roleList = _.get(org, 'roles');
      expect(roleList).toBeDefined();
      expect(roleList.length).toBeGreaterThan(0);
    });

    it('get list apps', async () => {
      const limit = 200;
      let offset = 0;
      let total = 0;
      do {
        const ApiPath = `/admin/current-user/applications?offset=${offset}&limit=${limit}`;
        const res = await supertest
          .get(ApiPath)
          .set('Content-Type', 'application/json')
          .set('Authorization', 'Bearer ' + superAdmin.token);

        const appData = _.get(res, '_body');
        const { totalResults, results } = appData;
        total = totalResults;
        appList.push(...results);
        offset += limit;
        expect(appList).toBeDefined();
        expect(appList.length).toBeGreaterThan(0);
      } while (offset <= total);
      expect(appList.length).toEqual(total);

      // map app and role
      mappedAppRole = roleList.reduce((listMapped, role) => {
        const app = appList.find((app) => app.applicationKey === role.appName);
        if (app) {
          listMapped.push({
            applicationId: app.applicationId,
            roleId: role.id
          });
        }
        return listMapped;
      }, []);

      expect(mappedAppRole.length).toBeGreaterThan(0);

      // get a pair of not match app and role
      let roleData = {};
      const appData = appList.find((app) => {
        roleData = roleList.find((role) => role.appName !== app.applicationKey);
        return roleData;
      });

      notMathAppRole.push({
        applicationId: appData.applicationId,
        roleId: roleData.id
      });
    });

    xit('Create invite using not existed role and app should fail', async () => {
      const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: org1Setup.regularUser.requestOptions },
        {
          organizationId: org1Setup.org.id,
          email: newUserEmail,
          message: 'test email 7',
          applicationRoles: [
            {
              applicationId: uuid.v4(),
              roleId: uuid.v4()
            }
          ]
        }
      );

      await expect(orgInviteRes).rejects.toThrow();
    });

    xit('Create invite using not matched role and app should fail', async () => {
      const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: org1Setup.regularUser.requestOptions },
        {
          organizationId: org1Setup.org.id,
          email: newUserEmail,
          message: 'test email 8',
          applicationRoles: notMathAppRole
        }
      );

      await expect(orgInviteRes).rejects.toThrow();
    });

    xit('Create invite with multi applications and Roles having not matched role and app should fail', async () => {
      const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: org1Setup.regularUser.requestOptions },
        {
          organizationId: org1Setup.org.id,
          email: newUserEmail,
          message: 'test email 9',
          applicationRoles: [...mappedAppRole, ...notMathAppRole]
        }
      );

      await expect(orgInviteRes).rejects.toThrow();
    });

    it('get app and role of other org', async () => {
      // get role
      const listRoleRes = await orgHelpers.helpFetchOrgAppsAndRoles(
        { gqlClient, options: superAdmin.options },
        org2Setup.org.id
      );

      const org = _.get(listRoleRes, 'organization');
      expect(org).toBeDefined();
      expect(org.id).toEqual(org2Setup.org.id);
      expect(org.applications).toBeDefined();
      roleListOrg2 = _.get(org, 'roles');
      expect(roleListOrg2).toBeDefined();
      expect(roleListOrg2.length).toBeGreaterThan(0);

      // get app
      const limit = 200;
      let offset = 0;
      let total = 0;
      do {
        const ApiPath = `/admin/current-user/applications?offset=${offset}&limit=${limit}`;
        const res = await supertest
          .get(ApiPath)
          .set('Content-Type', 'application/json')
          .set('Authorization', 'Bearer ' + superAdmin.token);

        const appData = _.get(res, '_body');
        const { totalResults, results } = appData;
        total = totalResults;
        appListOrg2.push(...results);
        offset += limit;
        expect(appListOrg2).toBeDefined();
        expect(appListOrg2.length).toBeGreaterThan(0);
      } while (offset <= total);
      expect(appListOrg2.length).toEqual(total);

      // map app and role
      mappedAppRoleOrg2 = roleList.reduce((listMapped, role) => {
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
      }, []);

      expect(mappedAppRoleOrg2.length).toBeGreaterThan(0);
    });

    xit('Create invite using role and app of other org should fail', async () => {
      const orgInviteRes = orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: org1Setup.regularUser.requestOptions },
        {
          organizationId: org1Setup.org.id,
          email: newUserEmail,
          message: 'test email 10',
          applicationRoles: mappedAppRoleOrg2
        }
      );

      await expect(orgInviteRes).rejects.toThrow();
    });

    it('Create invite using all matched apps and roles in current org should success', async () => {
      try {
        const orgInviteRes = await orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: org1Setup.regularUser.requestOptions },
          {
            organizationId: org1Setup.org.id,
            email: newUserEmail,
            message: 'test email 11',
            applicationRoles: [mappedAppRole[0]]
          }
        );

        const orgInviteData = _.get(orgInviteRes, 'createOrganizationInvite');
        expect(orgInviteData).toBeDefined();
        expect(orgInviteData.email).toEqual(newUserEmail);
        expect(orgInviteData.status).toEqual('submitted');
        invitations.second = orgInviteData;
        trackCreatedInvite(orgInviteData.id);
        trackCreatedUserEmail(newUserEmail);
        emailCount++;
        inviteEmails.add(newUserEmail);
      } catch (error) {
        console.log(error);
      }
    });

    it('invitation created', async () => {
      const listInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
        { gqlClient, options: superAdmin.options },
        {
          orgId: org1Setup.org.id,
          passwordResetToken: true
          // inviteStatuses: ['approved']
        }
      );

      const listInvite = _.get(
        listInviteRes,
        'organization.organizationInvites'
      );

      const preInvite = listInvite.find((inv) => inv.email === newUserEmail);
      expect(preInvite.email).toEqual(newUserEmail);
      expect(preInvite.status).toEqual('submitted');
      invitations.second = preInvite;
      trackCreatedInvite(preInvite.id);
    });

    it('admin approve invitation', async () => {
      try {
        const orgInviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
          { gqlClient, options: superAdmin.options },
          {
            organizationInviteId: invitations.second.id,
            applicationRoles: [],
            action: 'approve'
          }
        );

        const orgInvite = _.get(orgInviteRes, 'updateOrganizationInvite');
        expect(orgInvite.status).toEqual('approved');
        expect(orgInvite.email).toEqual(newUserEmail);
      } catch (error) {
        console.log(error);
      }
    });

    it('Update invitation applicationRoles to not matched role and apps should fail', async () => {
      const orgInviteRes = orgInviteHelpers.helpUpdateOrgInvite(
        { gqlClient, options: org1Setup.regularUser.requestOptions },
        {
          organizationInviteId: invitations.second.id,
          applicationRoles: notMathAppRole
        }
      );

      await expect(orgInviteRes).rejects.toThrow(
        /Failed to update organization invite/
      );
    });

    it('Update invitation applicationRoles to matched app and role of other org should fail', async () => {
      const orgInviteRes = orgInviteHelpers.helpUpdateOrgInvite(
        { gqlClient, options: org1Setup.regularUser.requestOptions },
        {
          organizationInviteId: invitations.second.id,
          applicationRoles: mappedAppRoleOrg2
        }
      );

      await expect(orgInviteRes).rejects.toThrow(
        /Failed to update organization invite/
      );
    });

    xit('Update invitation: add valid applicationRoles should success', async () => {
      const orgInviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
        { gqlClient, options: org1Setup.regularUser.requestOptions },
        {
          organizationInviteId: invitations.second.id,
          applicationRoles: mappedAppRole
        }
      );

      const invite = _.get(orgInviteRes, 'updateOrganizationInvite');

      expect(invite.id).toEqual(invitations.second.id);
      expect(invite.status).toEqual('approved');
    });

    it('Update invitation: add invalid applicationRoles should fail', async () => {
      const orgInviteRes = orgInviteHelpers.helpUpdateOrgInvite(
        { gqlClient, options: org1Setup.regularUser.requestOptions },
        {
          organizationInviteId: invitations.second.id,
          applicationRoles: [...mappedAppRole, ...notMathAppRole]
        }
      );

      await expect(orgInviteRes).rejects.toThrow(
        /Failed to update organization invite/
      );
    });

    it('Update invitation: remove all applicationRoles should fail', async () => {
      const orgInviteRes = orgInviteHelpers.helpUpdateOrgInvite(
        { gqlClient, options: org1Setup.regularUser.requestOptions },
        {
          organizationInviteId: invitations.second.id,
          applicationRoles: []
        }
      );

      await expect(orgInviteRes).rejects.toThrow(
        /Failed to update organization invite/
      );
    });

    xit('Update invitation: remove and leaving at least 1 remain applicationRoles should success', async () => {
      const orgInviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
        { gqlClient, options: org1Setup.regularUser.requestOptions },
        {
          organizationInviteId: invitations.second.id,
          applicationRoles: [mappedAppRole[0]]
        }
      );

      const invite = _.get(orgInviteRes, 'updateOrganizationInvite');

      expect(invite.id).toEqual(invitations.second.id);
      expect(invite.status).toEqual('approved');
    });

    it('Invitee accept invitation should success', async () => {
      try {
        const listInviteRes = await orgInviteHelpers.helpGetOrgInviteByOrgId(
          { gqlClient, options: superAdmin.options },
          {
            orgId: org1Setup.org.id,
            passwordResetToken: true,
            inviteStatuses: ['approved']
          }
        );

        const listInvite = _.get(
          listInviteRes,
          'organization.organizationInvites'
        );

        const preInvite = listInvite.find((inv) => inv.email === newUserEmail);
        expect(preInvite).toBeDefined();
        invitations.second = preInvite;
        trackCreatedInvite(preInvite.id);
        newToken = preInvite.passwordResetToken;
        const inviteRes = await orgInviteHelpers.helpUpdateOrgInvite(
          { gqlClient, options: helpers.requestOptions(newToken) },
          {
            organizationInviteId: invitations.second.id,
            applicationRoles: [],
            action: 'complete'
          }
        );

        const invite = _.get(inviteRes, 'updateOrganizationInvite');

        expect(invite.id).toEqual(invitations.second.id);
        expect(invite.status).toEqual('completed');
      } catch (error) {
        console.log(error);
      }
    });

    it('Run reset password for user email should success', async () => {
      const resetPasswordRes = await orgInviteHelpers.helpResetPasswordInvite({
        baseUrl: config.core_admin_url,
        invitation: invitations.second,
        userName: newUserEmail,
        password: 'testUserPassword',
        ApiPath: '/admin/org-invite/password/reset'
      });

      expect(resetPasswordRes).toBeDefined();
      expect(resetPasswordRes.error).toEqual(false);
      expect(resetPasswordRes.statusCode).toEqual(204);
    });

    it('Invitee can login to org', async () => {
      const loginRes = await userHelpers.loginUser(
        { gqlClient },
        {
          userName: newUserEmail,
          password: 'testUserPassword',
          organizationGuid: org1Setup.org.guid
        }
      );

      expect(loginRes).toBeDefined();
      expect(loginRes.user.name).toEqual(newUserEmail);
      expect(loginRes.organization.id).toEqual(org1Setup.org.id);
      newToken = loginRes.token;
      newUserIds.push(loginRes.user.id);
      trackCreatedUser(loginRes.user.id);
    });

    xit('Invitee query added applicationRoles should success', async () => {
      const appRes = await gqlClient.query(
        `query app1 {
        applications (accessScope: [owned, granted]) {
          records {
            id
            name
          }
        }
      }`,
        {},
        helpers.requestOptions(newToken)
      );

      const app = _.get(appRes, 'applications');
      expect(app).toBeDefined();
      const addedApp = app.records.find(
        (a) => a.id === mappedAppRole[0].applicationId
      );
      expect(addedApp).toBeDefined();
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

    await safeTrackUsersByEmail(Array.from(createdUserEmails));

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

function trackCreatedUserEmail(email) {
  if (email) {
    createdUserEmails.add(email);
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

async function safeTrackUsersByEmail(emails) {
  const uniqueEmails = _.uniq(emails.filter(Boolean));

  if (_.isEmpty(uniqueEmails) || !superAdmin.options) {
    return;
  }

  await safe('track users by email for cleanup', async () => {
    for (const email of uniqueEmails) {
      const usersRes = await userHelpers.getUsers(
        { gqlClient, options: superAdmin.options },
        {
          name: email,
          includeAllOrgUsers: true,
          limit: 200
        }
      );

      const users = _.get(usersRes, 'users.records', []);
      users
        .filter((user) => user.email === email || user.name === email)
        .forEach((user) => trackCreatedUser(user.id));
    }
  });
}

async function safeDeleteUsers(userIds) {
  const ids = _.uniq([...userIds, ...newUserIds].filter(Boolean));

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
  const userName = `thoang2+${uuid.v4()}@veritone.com`;
  const adminName = `thoang2+${uuid.v4()}@veritone.com`;
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
        name: adminName,
        email: adminName,
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'regularUser',
        name: userName,
        email: userName,
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
