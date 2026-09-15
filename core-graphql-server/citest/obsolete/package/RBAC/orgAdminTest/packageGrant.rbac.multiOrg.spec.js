const helpers = require('../../../helpers/index');
const orgHelpers = require('../../../helpers/organization');
const userHelpers = require('../../../helpers/user');
const appHelpers = require('../../../helpers/application');
const rbacHelpers = require('../../../helpers/rbacHelper');
const GraphqlClient = require('../../../helpers/gql');
const uuid = require('uuid');
const config = helpers.config;
const env = config.env;
const _ = require('lodash');
const chakram = require('chakram');
const { meGql, deletePackageQuery } = require('../../packageCommonQuery');
const {
  createIsolatedSuperadmin
} = require('../../../helpers/superadminSession');

const { safe } = require('../../../helpers/cleanup/utils');

const citestMarker = global.citestMarker || 'citest-should-delete';
const orgMarker = global.orgMarker.package;
const testOrgName = `${orgMarker}-olp-org-${uuid.v4()}`;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
].filter((roleId) => roleId);

let gqlClient;
let org1Result;
let org2Result;
let isolatedSuperadminSession;

const testUserInput = {
  name: `${citestMarker}-test-user-${uuid.v4()}`,
  password: 'TestPassword123',
  orgId: '',
  rolesIds: ROLES_IDS
};

const testData = {
  superAdminToken: '',
  superAdminOption: {},
  userOption: {},
  userId: ''
};

describe('citest_package: Package granting logic in multi orgs scenario', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    // T12: use a throwaway superadmin + org, not the shared bootstrap superadmin —
    // an unrelated spec's OLP-toggle event can log out every session merely indexed
    // under an org it touches, including a superadmin who is simply a member. This
    // session is isolated (member of no other org) and cleaned up in afterAll.
    isolatedSuperadminSession = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = isolatedSuperadminSession.options; // preserve implicit-auth call sites below
    testData.superAdminToken = isolatedSuperadminSession.token;
    testData.superAdminOption = isolatedSuperadminSession.options;

    // Set up test organization_1
    org1Result = await orgHelpers.orgSetup(
      null,
      { gqlClient },
      {
        name: testOrgName,
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
      }
    );
    expect(org1Result).toBeDefined();
    expect(org1Result.id).toBeDefined();

    // Set up test organization_2
    org2Result = await orgHelpers.orgSetup(
      null,
      { gqlClient },
      {
        name: testOrgName,
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
      }
    );
    expect(org2Result).toBeDefined();
    expect(org2Result.id).toBeDefined();

    //Create an admin user in the test organization_1
    testUserInput.orgId = org1Result.id;
    const userResult = await userHelpers.createUser(
      { gqlClient },
      testUserInput
    );
    expect(userResult).toBeDefined();
    expect(userResult.id).toBeDefined();
    testData.userId = userResult.id;

    //Get user request options
    testData.userOption = await impersonate(
      userResult.id,
      org1Result.guid,
      testData.superAdminToken
    );

    const userInfoRes = await gqlClient.query(meGql, {}, testData.userOption);

    const userOrgInfo = {
      orgGuid: _.get(userInfoRes, 'me.organization.guid'),
      orgId: _.get(userInfoRes, 'me.organization.id'),
      orgName: _.get(userInfoRes, 'me.organization.name'),
      userId: _.get(userInfoRes, 'me.id'),
      userName: _.get(userInfoRes, 'me.name'),
      isOLPEnabled:
        _.get(
          userInfoRes,
          'me.organization.jsondata.features.enableRBACFeature'
        ) === 'enabled'
    };

    await setOLPPermissions(userOrgInfo);

    // re-login to reset permission
    testData.userOption = await impersonate(
      testData.userId,
      userOrgInfo.orgGuid,
      testData.superAdminToken
    );
  });

  afterAll(async () => {
    // delete user
    if (testData.userId) {
      const query = `mutation {
        deleteUser(id: "${testData.userId}")  {
          id
        }
      }`;
      await safe('delete user testData.userId', async () =>
        gqlClient.query(query)
      );
    }

    // delete both orgs
    if (org1Result.id) {
      await safe('disable RBAC for org org1Result.id', async () =>
        orgHelpers.modifyRBACFeature(
          { gqlClient, options: testData.superAdminOption },
          org1Result.id,
          'disabled'
        )
      );
      await safe('delete org org1Result.id', async () =>
        orgHelpers.deleteOrganization(
          { gqlClient, options: testData.superAdminOption },
          org1Result.id
        )
      );
    }
    if (org2Result.id) {
      await safe('disable RBAC org org2Result.id', async () =>
        orgHelpers.modifyRBACFeature(
          { gqlClient, options: testData.superAdminOption },
          org2Result.id,
          'disabled'
        )
      );
      await safe('delete org org2Result.id', async () =>
        orgHelpers.deleteOrganization(
          { gqlClient, options: testData.superAdminOption },
          org2Result.id
        )
      );
    }

    await isolatedSuperadminSession?.cleanup();
  });

  describe('Setup multi orgs scenario for admin user', () => {
    let permissionSetId, applicationId, packageId;
    let applicationRoleId = uuid.v4();
    let switchedOptions;

    afterAll(async () => {
      if (packageId) {
        await safe('delete package packageId', async () =>
          gqlClient.query(deletePackageQuery, {
            id: packageId
          })
        );
      }

      if (applicationId) {
        await safe('delete applicationId', async () =>
          appHelpers.helpDeleteApplication(
            { gqlClient, options: testData.userOption },
            {
              id: applicationId
            }
          )
        );
      }

      if (permissionSetId) {
        await safe('delete permission set', () =>
          rbacHelpers.helpDeleteAuthPermissionSet(
            { gqlClient, options: testData.userOption },
            { id: permissionSetId }
          )
        );
      }
    });

    it('should add admin user to org_2', async () => {
      const query = `
        mutation {
          addUserToOrganization(
            userId: "${testData.userId}",
            organizationGuid: "${org2Result.guid}",
            roleIds: [${ROLES_IDS.map((role) => `"${role}"`).join(', ')}]
          ) {
            id
            organizationGuid
          }
        }
        `;
      const result = await gqlClient.query(
        query,
        {},
        testData.superAdminOption
      );
      expect(result.addUserToOrganization).toBeDefined();
      expect(result.addUserToOrganization.id).toBeDefined();
      expect(result.addUserToOrganization.organizationGuid).toBeDefined();
    });

    it('should create permission set for admin to be able to create application', async () => {
      const query = `
          mutation {
            authPermissionSetCreate(input: {
              name: "${citestMarker}-permSet-for-admin-to-create-app-in-org",
              description: "desc"
              permissions: [
                AIWARE_SCHEMA_CREATE
                DEVELOPER_ENGINE_CREATE
                DEVELOPER_ENGINE_READ
                DEVELOPER_ENGINE_UPDATE
                DEVELOPER_ENGINE_ENABLE
                DEVELOPER_ENGINE_DELETE
                DEVELOPER_BUILD_APPROVE
                ]
              })
                {
                  id
                  permissions
                }
              }
        `;

      const result = await gqlClient.query(query, {}, testData.userOption);
      expect(result.authPermissionSetCreate).toBeDefined();
      expect(result.authPermissionSetCreate.id).toBeDefined();
      expect(result.authPermissionSetCreate.permissions).toContain(
        'DEVELOPER_ENGINE_CREATE'
      );

      permissionSetId = result.authPermissionSetCreate.id;
    });

    it('should add permission set for admin user to create application', async () => {
      const query = `
      mutation {
        addACEsToResources(
          ownerOrganization: "${org1Result.guid}",
          ids:["${org1Result.id}"],
          resourceType: Organization
          entries: [{
            member: {id: "${testData.userId}", memberType: User},
            permissionSetID: "${permissionSetId}"
          }
        ]) {
          records {
            id
            objectType
            permissionSet {
                  id
                  }
                  objectType
                  }
                }
              }
        `;

      const result = await gqlClient.query(
        query,
        {},
        testData.superAdminOption
      );
      expect(result.addACEsToResources).toBeDefined();
    });

    it('should create application', async () => {
      const timestamp = new Date().getTime();
      const query = `
        mutation {
          createApplication(
            input: {
              name: "${citestMarker}-app-${timestamp}",
              deploymentModel: FullyNetworkIsolated,
              description: "test application",
              iconUrl: "imageUrl",
              iconSvg: "imageSvg",
              url: "https://test.com/app",
              checkPermissions: true,
              applicationRoles: [{
                id: "${applicationRoleId}",
                name: "${citestMarker}-app-role-${timestamp}",
                description: "ci-aiware-test-app-role",
                isPrivate: false,
                isAppEventRole: false,
                permissions: [DEVELOPER_ENGINE_READ]
                }]
                }) {
                  id
                  iconSvg
                  iconUrl
                }
              }`;

      const result = await gqlClient.query(query, {}, testData.userOption);
      expect(result.createApplication).toBeDefined();
      expect(result.createApplication.iconUrl).toBeDefined();
      expect(result.createApplication.iconSvg).toBeDefined();
      expect(result.createApplication.id).toBeDefined();

      applicationId = result.createApplication.id;
    });

    it('should create package', async () => {
      const query = `
        mutation {
          packageCreate(
            input: {
              name: "${citestMarker}-test_package",
              version: "1.0",
              distributionType: public,
              primaryResourceId: "${applicationId}",
              resources: [
                {
                  resourceId: "${applicationId}",
                  resourceType: application,
                  action: ADD
                }
              ],
            }
          ) {
            id
            resources {
              records {
                resourceId
                resourceType
                resourceAlias
                id
              }
            }
          }
        }
      `;

      const result = await gqlClient.query(query, {}, testData.userOption);
      expect(result.packageCreate).toBeDefined();
      expect(result.packageCreate.id).toBeDefined();
      packageId = result.packageCreate.id;
    });

    it('should be able to grant package to org_1', async () => {
      const query = `
        mutation {
          packageUpdateGrants(
            input: {
              packageId: "${packageId}"
              packageGrants: { organizationId: "${org1Result.id}", grantType: GRANT }
            }
          ) {
            id
            }
          }
      `;

      const result = await gqlClient.query(query, {}, testData.userOption);
      expect(result.packageUpdateGrants).toBeDefined();
      expect(result.packageUpdateGrants.id).toBeDefined();
    });

    it('should grant package to org_1 with GRANT grantType', async () => {
      const query = `
        mutation {
          packageUpdateGrants(
            input: {
              packageId: "${packageId}"
              packageGrants: { organizationId: "${org1Result.id}", grantType: GRANT }
            }
          ) {
            id
          }
        }
      `;

      const result = await gqlClient.query(query, {}, testData.userOption);
      expect(result.packageUpdateGrants).toBeDefined();
      expect(result.packageUpdateGrants.id).toBeDefined();
    });

    it('should get appRole permissionSet', async () => {
      const query = `
          query {
            authPermissionSets(
              ownerOrganization: "${org1Result.id}"
              roleID: "${applicationRoleId}"
              authClass: Application
            ) {
              records {
                id
                name
                permissions
              }
            }
          }
      `;

      const result = await gqlClient.query(
        query,
        {},
        testData.superAdminOption
      );
      expect(result).toBeDefined();
      expect(result.authPermissionSets).toBeDefined();
      expect(result.authPermissionSets.records).toBeDefined();
      expect(result.authPermissionSets.records.length).toBeGreaterThan(0);
    });

    it('should login org admin to org_2', async () => {
      const query = `
        mutation {
          userLogin(
            input: {
              userName: "${testUserInput.name}"
              password: "TestPassword123"
              organizationGuid: "${org2Result.guid}"
            }
          ) {
            token
            organization {
              id
              guid
            }
          }
        }
      `;

      const result = await gqlClient.query(query, {}, testData.userOption);
      expect(result).toBeDefined();
      expect(result.userLogin.organization).toBeDefined();
      expect(result.userLogin.organization.guid).toEqual(org2Result.guid);
      expect(result.userLogin.token).toBeDefined();

      switchedOptions = helpers.requestOptions(result.userLogin.token);
    });

    // In order to reproduce VE-14390 issue, we need to consequentially grant the package to org_2 with different grant types in 3 steps
    it('should grant package to org_2 with GRANT grantType', async () => {
      const query = `
        mutation {
          packageUpdateGrants(
            input: {
              packageId: "${packageId}"
              packageGrants: { organizationId: ${org2Result.id}, grantType: GRANT }
            }
          ) {
            id
          }
        }
      `;

      const result = await gqlClient.query(query, {}, switchedOptions);
      expect(result.packageUpdateGrants).toBeDefined();
      expect(result.packageUpdateGrants.id).toBeDefined();
    });

    it('should grant package to org_2 with VIEW grantType', async () => {
      const query = `
        mutation {
          packageUpdateGrants(
            input: {
              packageId: "${packageId}"
              packageGrants: { organizationId: ${org2Result.id}, grantType: VIEW }
            }
          ) {
            id
          }
        }
      `;

      const result = await gqlClient.query(query, {}, switchedOptions);
      expect(result.packageUpdateGrants).toBeDefined();
      expect(result.packageUpdateGrants.id).toBeDefined();
    });

    it('should grant package to org_2 with GRANT grantType', async () => {
      const query = `
        mutation {
          packageUpdateGrants(
            input: {
              packageId: "${packageId}"
              packageGrants: { organizationId: ${org2Result.id}, grantType: GRANT }
            }
          ) {
            id
          }
        }
      `;

      const result = await gqlClient.query(query, {}, switchedOptions);
      expect(result.packageUpdateGrants).toBeDefined();
      expect(result.packageUpdateGrants.id).toBeDefined();
    });
  });
});

async function impersonate(userId, applicationOrgGUID, token) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

async function setOLPPermissions(orgInfo) {
  const olpObjectIds = {};

  const permissions = `
      AIWARE_SCHEMA_CREATE
      DEVELOPER_ENGINE_CREATE
      DEVELOPER_ENGINE_READ
      DEVELOPER_ENGINE_UPDATE
      DEVELOPER_ENGINE_ENABLE
      DEVELOPER_ENGINE_DELETE
      DEVELOPER_BUILD_CREATE
      DEVELOPER_BUILD_UPDATE`;

  let query = `
    mutation {
      authGroupCreate(input: {
        name: "${citestMarker}-auth-group-test-${uuid.v4()}"
        description: "desc"
        ownerOrganization: "${orgInfo.orgGuid}",
        members: [{
          id: "${orgInfo.userId}",
          memberType: User
        }]
      }) {
        id
        name
      }
    }
  `;

  let result = await gqlClient.query(query, null);
  expect(result.authGroupCreate.id).toBeDefined();
  testData.authGroupId = _.get(result, 'authGroupCreate.id');
  olpObjectIds.authGroupId = _.get(result, 'authGroupCreate.id');

  query = `mutation {
      authPermissionSetCreate(input: {
        name: "${citestMarker}-permission-${uuid.v4()}",
        description: "desc"
        organizationID: "${orgInfo.orgId}",
        permissions: [
          ${permissions}
        ]
      }){
        id
        permissions
      }
    }`;

  result = await gqlClient.query(query, null);
  expect(result.authPermissionSetCreate.id).toBeDefined();
  testData.authPermissionId = _.get(result, 'authPermissionSetCreate.id');
  olpObjectIds.permissionId = _.get(result, 'authPermissionSetCreate.id');

  query = `mutation  {
    addACEsToResources(
      ids:["${orgInfo.orgId}"],
      resourceType: Organization,
      ownerOrganization: "${orgInfo.orgGuid}",
      entries: [{
        member: {id: "${olpObjectIds.authGroupId}", memberType: Group},
        permissionSetID: "${olpObjectIds.permissionId}"}
      ]) {
      records {
        id
        objectType
        permissionSet {
          id
        }
        objectType
      }
    }
  }`;

  result = await gqlClient.query(query, null);
  expect(result.addACEsToResources.records.length).toBeGreaterThan(0);
  olpObjectIds.aceOrgRecords = result.addACEsToResources.records;

  return olpObjectIds;
}
