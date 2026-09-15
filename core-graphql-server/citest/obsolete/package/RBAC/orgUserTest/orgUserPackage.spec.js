const helpers = require('../../../helpers/index');
const orgHelpers = require('../../../helpers/organization');
const rbacHelpers = require('../../../helpers/rbacHelper');
const GraphqlClient = require('../../../helpers/gql');
const uuid = require('uuid');
const config = helpers.config;
const env = config.env;
const _ = require('lodash');
const chakram = require('chakram');
const { safe } = require('../../../helpers/cleanup/utils');

const {
  createPackageQuery,
  grantPackageQuery,
  updatePackageQuery,
  meGql,
  queryGrant,
  deletePackageQuery,
  createUserQuery,
  createOrgQuery,
  updatePackageResourcesQuery,
  getPackages
} = require('../../packageCommonQuery');

let gqlClient;
let orgResult;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const citestMarker = global.citestMarker || 'citest-should-delete';
const orgMarker = global.orgMarker.package;
const testOrgName = `${orgMarker}-${uuid.v4()}`;
const ROLES_IDS = [
  'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
];

const superAdmin = {
  token: '',
  orgId: '',
  userId: '',
  orgGuid: '',
  option: {}
};

const defaultTestData = {
  org1: {
    id: '',
    name: global.orgMarker.package + '-' + uuid.v4(),
    guid: '',
    adminId: '',
    userId: ''
  },
  org2: {
    id: '',
    name: global.orgMarker.package + '-' + uuid.v4(),
    guid: '',
    adminId: '',
    userId: ''
  },
  adminOptions: {},
  authGroupId: '',
  authPermissionId: ''
};

const packageIds = new Set();
let olpObjectIds;

describe('citest_package: Organization User Package Tests', () => {
  let superToken;
  let nonRbacToken, nonRbacOptions;
  let rbacToken, rbacOptions;

  const impersonateUser = async (user) => {
    const url = `${config.core_admin_url}/admin/impersonate/${user.id}/${user.organizationGuid}`;
    const options = helpers.requestOptions(superToken);
    const impersonated = await chakram.get(url, options);
    expect(_.get(impersonated, 'body.token')).toBeDefined();
    const userToken = _.get(impersonated, 'body.token');

    return {
      token: userToken,
      requestOptions: helpers.requestOptions(userToken)
    };
  };

  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superAdmin.token = result.token;
    superToken = result.token;
    superAdmin.option = helpers.requestOptions(result.token);

    result = await gqlClient.query(meGql);
    expect(result.me).toBeDefined();
    superAdmin.orgId = _.get(result, 'me.organization.id');
    superAdmin.orgGuid = _.get(result, 'me.organization.guid');
    superAdmin.userId = _.get(result, 'me.id');
  });

  describe('Legacy Package Access for OrgUser', () => {
    let result, impersonated;
    let packageId, packageId2;
    beforeAll(async () => {
      const newOrgRes = await gqlClient.query(createOrgQuery, {
        name: defaultTestData.org1.name,
        businessUnit: 'Legal',
        types: ['agency', 'broadcaster'],
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
        ].filter((app) => app),
        kvp: {
          features: {
            enableRBACFeature: 'disabled'
          }
        }
      });

      const newOrg = _.get(newOrgRes, 'createOrganization');
      expect(newOrg.id).toBeDefined();
      defaultTestData.org1.id = newOrg.id;
      defaultTestData.org1.guid = newOrg.guid;

      const newPackageRes = await gqlClient.query(createPackageQuery, {
        name: `${citestMarker}-package-${uuid.v4()}`,
        distributionType: 'public',
        resources: [],
        organizationId: newOrg.id
      });

      packageId = _.get(newPackageRes, 'packageCreate.id');
      expect(packageId).toBeDefined();
      packageIds.add(packageId);

      const newPackageRes2 = await gqlClient.query(createPackageQuery, {
        name: `${citestMarker}-package-${uuid.v4()}`,
        distributionType: 'public',
        resources: [],
        organizationId: newOrg.id
      });

      packageId2 = _.get(newPackageRes2, 'packageCreate.id');
      expect(packageId2).toBeDefined();
      packageIds.add(packageId2);

      const newUserRes = await gqlClient.query(createUserQuery, {
        name: citestMarker + '-non-rbac-user-' + uuid.v4(),
        organizationId: newOrg.id,
        roleIds: []
      });

      const newUserData = _.get(newUserRes, 'createUser');
      expect(newUserData.organizationId).toEqual(newOrg.id);
      defaultTestData.org1.userId = newUserData.id;

      impersonated = await impersonateUser({
        id: defaultTestData.org1.userId,
        organizationGuid: defaultTestData.org1.guid,
        superToken: superAdmin.token
      });
      nonRbacToken = impersonated.token;
      nonRbacOptions = impersonated.requestOptions;

      // check non RBAC user login
      result = await gqlClient.query(meGql, {}, nonRbacOptions);
      expect(_.get(result, 'me.name')).toContain(`non-rbac-user`);
    });

    // it('User should see their orgs org-locked packages', async () => {});

    it('User creates a package should fail', async () => {
      await expect(() => {
        return gqlClient.query(
          createPackageQuery,
          {
            name: `${citestMarker}-package-${uuid.v4()}`,
            distributionType: 'public',
            resources: []
          },
          nonRbacOptions
        );
      }).rejects.toThrow(
        /"rightsRequired":\s*\[[^\]]*"aiware\.package\.create"[^\]]*]/
      );
    });

    it('User updates a package should fail', async () => {
      await expect(() => {
        return gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: packageId,
              name: citestMarker + '-updateName-' + uuid.v4(),
              description: 'test description'
            }
          },
          nonRbacOptions
        );
      }).rejects.toThrow(
        /"rightsRequired":\s*\[[^\]]*"aiware\.package\.update"[^\]]*]/
      );
    });

    it('User updates a package resource should fail', async () => {
      await expect(() => {
        return gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: packageId,
            resources: [
              {
                resourceType: 'package',
                resourceId: packageId2,
                action: 'ADD'
              }
            ]
          },
          nonRbacOptions
        );
      }).rejects.toThrow(
        /"rightsRequired":\s*\[[^\]]*"aiware\.package\.update"[^\]]*]/
      );
    });

    it('User grant a package should fail', async () => {
      const grantRes = gqlClient.query(
        grantPackageQuery,
        {
          packageId,
          packageGrants: [
            {
              organizationId: defaultTestData.org1.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        nonRbacOptions
      );

      await expect(grantRes).rejects.toThrow();
    });

    it('User delete a package should fail', async () => {
      await expect(() => {
        return gqlClient.query(
          deletePackageQuery,
          {
            id: packageId
          },
          nonRbacOptions
        );
      }).rejects.toThrow(
        /"rightsRequired":\s*\[[^\]]*"aiware\.package\.delete"[^\]]*]/
      );
    });

    afterAll(async () => {
      if (packageIds.size) {
        for (const id of packageIds) {
          await safe('delete package packageId', async () =>
            gqlClient.query(deletePackageQuery, {
              id: id
            })
          );

          packageIds.delete(id);
        }
      }
    });
  });

  describe('RBAC Package Access for OrgUser', () => {
    let impersonated;
    let packageId, packageId2;
    beforeAll(async () => {
      const newOrgRes = await gqlClient.query(createOrgQuery, {
        name: defaultTestData.org2.name,
        businessUnit: 'Legal',
        types: ['agency', 'broadcaster'],
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
        ].filter((app) => app),
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      });

      const newOrg = _.get(newOrgRes, 'createOrganization');
      expect(newOrg.id).toBeDefined();
      defaultTestData.org2.id = newOrg.id;
      defaultTestData.org2.guid = newOrg.guid;

      const newPackageRes = await gqlClient.query(createPackageQuery, {
        name: `${citestMarker}-package-${uuid.v4()}`,
        distributionType: 'public',
        resources: [],
        organizationId: newOrg.id
      });

      packageId = _.get(newPackageRes, 'packageCreate.id');
      expect(packageId).toBeDefined();
      packageIds.add(packageId);

      const newPackageRes2 = await gqlClient.query(createPackageQuery, {
        name: `${citestMarker}-package-${uuid.v4()}`,
        distributionType: 'public',
        resources: [],
        organizationId: newOrg.id
      });

      packageId2 = _.get(newPackageRes2, 'packageCreate.id');
      expect(packageId2).toBeDefined();
      packageIds.add(packageId2);

      const newUserRes = await gqlClient.query(createUserQuery, {
        name: citestMarker + '-rbac-user-' + uuid.v4(),
        organizationId: newOrg.id,
        roleIds: []
      });

      const newUserData = _.get(newUserRes, 'createUser');
      expect(newUserData.organizationId).toEqual(newOrg.id);
      defaultTestData.org2.userId = newUserData.id;

      impersonated = await impersonateUser({
        id: defaultTestData.org2.userId,
        organizationGuid: defaultTestData.org2.guid,
        superToken: superAdmin.token
      });
      rbacToken = impersonated.token;
      rbacOptions = impersonated.requestOptions;
    });

    it('default user creates a package should fail', async () => {
      await expect(() => {
        return gqlClient.query(
          createPackageQuery,
          {
            name: `${citestMarker}-package-${uuid.v4()}`,
            distributionType: 'public',
            resources: []
          },
          rbacOptions
        );
      }).rejects.toThrow(
        'No authorization access role found for Mutation.packageCreate'
      );
    });

    it('default user updates a package should fail', async () => {
      await expect(() => {
        return gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: packageId,
              name: citestMarker + '-updateName-' + uuid.v4(),
              description: 'test description'
            }
          },
          rbacOptions
        );
      }).rejects.toThrow(
        'No authorization access role found for Mutation.packageUpdate'
      );
    });

    it('default user updates a package resource should fail', async () => {
      await expect(() => {
        return gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: packageId,
            resources: [
              {
                resourceType: 'package',
                resourceId: packageId2,
                action: 'ADD'
              }
            ]
          },
          rbacOptions
        );
      }).rejects.toThrow(
        'No authorization access role found for Mutation.packageUpdate'
      );
    });

    it('default user grant a package should fail', async () => {
      const grantRes = gqlClient.query(
        grantPackageQuery,
        {
          packageId,
          packageGrants: [
            {
              organizationId: defaultTestData.org2.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        rbacOptions
      );

      await expect(grantRes).rejects.toThrow();
    });

    it('default user query package grant should success', async () => {
      const grantRes = await gqlClient.query(
        queryGrant,
        {
          id: packageId
        },
        rbacOptions
      );

      expect(grantRes.packageGrants.records).toBeDefined();
      ///
    });

    it('default user get package should success', async () => {
      const packageRes = await gqlClient.query(
        getPackages,
        {
          id: packageId
        },
        rbacOptions
      );
      expect(packageRes.packages.records).toBeDefined();
      // await expect(packageRes).rejects.toThrow();
    });

    it('super admin add permission for RBAC user should success', async () => {
      const orgInfo = {
        orgId: defaultTestData.org2.id,
        orgGuid: defaultTestData.org2.guid,
        userId: defaultTestData.org2.userId
      };

      olpObjectIds = await setOLPPermissions(orgInfo);
      expect(olpObjectIds).toBeDefined();
      expect(olpObjectIds.authGroupId).toBeDefined();
      expect(olpObjectIds.permissionId).toBeDefined();
      expect(olpObjectIds.aceOrgRecords.length).toBeGreaterThan(0);

      impersonated = await impersonateUser({
        id: defaultTestData.org2.userId,
        organizationGuid: defaultTestData.org2.guid,
        superToken: superAdmin.token
      });
      rbacToken = impersonated.token;
      rbacOptions = impersonated.requestOptions;
    });

    it('User creates a package should success', async () => {
      const result = await gqlClient.query(
        createPackageQuery,
        {
          name: `${citestMarker}-package-${uuid.v4()}`,
          distributionType: 'public',
          resources: []
        },
        rbacOptions
      );
      expect(_.get(result, 'packageCreate.id')).toBeDefined();
      const id = _.get(result, 'packageCreate.id');

      // delete package
      await safe('delete package', async () =>
        gqlClient.query(deletePackageQuery, {
          id: id
        })
      );
    });

    it('User get package should success', async () => {
      const packageRes = await gqlClient.query(
        getPackages,
        {
          id: packageId
        },
        rbacOptions
      );

      expect(_.get(packageRes, 'packages.records[0].id')).toEqual(packageId);
    });

    it('User updates a package should success', async () => {
      const result = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: packageId,
            name: citestMarker + '-updateName-' + uuid.v4(),
            description: 'test description'
          }
        },
        rbacOptions
      );
      expect(_.get(result, 'packageUpdate.id')).toEqual(packageId);
    });

    it('User updates a package resource should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageResourcesQuery,
        {
          packageId: packageId,
          resources: [
            {
              resourceType: 'package',
              resourceId: packageId2,
              action: 'ADD'
            }
          ]
        },
        rbacOptions
      );
      expect(
        updateRes.packageUpdateResources.resources.records[0].resourceId
      ).toBe(packageId2);
    });

    it('User grant a package should fail', async () => {
      const grantRes = gqlClient.query(
        grantPackageQuery,
        {
          packageId: packageId,
          packageGrants: [
            {
              organizationId: defaultTestData.org2.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        rbacOptions
      );

      await expect(grantRes).rejects.toThrow(
        'Not Authorized to grant package access'
      );
    });

    it('Grant package by super admin for User to query', async () => {
      const grantRes = await gqlClient.query(
        grantPackageQuery,
        {
          packageId: packageId,
          packageGrants: [
            {
              organizationId: defaultTestData.org2.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        superAdmin.option
      );

      expect(grantRes.packageUpdateGrants.id).toEqual(packageId);
    });

    it('User query package grant should success', async () => {
      const grantRes = await gqlClient.query(
        queryGrant,
        {
          id: packageId
        },
        rbacOptions
      );

      expect(_.get(grantRes, 'packageGrants.records.length')).toEqual(1);
      expect(_.get(grantRes, 'packageGrants.records[0].package.id')).toEqual(
        packageId
      );
      expect(_.get(grantRes, 'packageGrants.records[0].grantType')).toEqual(
        'GRANT'
      );
    });

    it('User delete a package should success', async () => {
      const deleteRes = await gqlClient.query(
        deletePackageQuery,
        {
          id: packageId
        },
        rbacOptions
      );

      expect(_.get(deleteRes, 'packageDelete.success')).toEqual(true);
    });

    afterAll(async () => {
      if (packageIds.size) {
        for (const id of packageIds) {
          await safe('delete package packageId', async () =>
            gqlClient.query(deletePackageQuery, {
              id: id
            })
          );

          packageIds.delete(id);
        }
      }
    });
  });

  afterAll(async () => {
    if (olpObjectIds?.authGroupId) {
      await safe('delete authGroup', async () =>
        rbacHelpers.helpDeleteAuthGroup(
          { gqlClient },
          { id: olpObjectIds.authGroupId }
        )
      );
    }

    if (olpObjectIds?.permissionId) {
      await safe('delete permission', async () =>
        rbacHelpers.helpDeleteAuthPermissionSet(
          { gqlClient },
          { id: olpObjectIds.permissionId }
        )
      );
    }

    // delete user
    if (defaultTestData.org1.userId) {
      const query = `mutation {
            deleteUser(id: "${defaultTestData.org1.userId}")  {
              id
            }
          }`;
      await safe('delete user defaultTestData.org1.userId', async () =>
        gqlClient.query(query)
      );
    }

    if (defaultTestData.org2.userId) {
      const query = `mutation {
            deleteUser(id: "${defaultTestData.org2.userId}")  {
              id
            }
          }`;
      await safe('delete user defaultTestData.org2.userId', async () =>
        gqlClient.query(query)
      );
    }

    // delete org
    if (defaultTestData.org2.id) {
      await safe('disable RBAC org defaultTestData.org2.id', async () =>
        orgHelpers.modifyRBACFeature(
          { gqlClient, options: superAdmin.option },
          defaultTestData.org2.id,
          'disabled'
        )
      );
      await safe('delete org defaultTestData.org2.id', async () =>
        orgHelpers.deleteOrganization(
          { gqlClient, options: superAdmin.option },
          defaultTestData.org2.id
        )
      );
    }

    if (defaultTestData.org1.id) {
      await safe('delete org defaultTestData.org1.id', async () =>
        orgHelpers.deleteOrganization(
          { gqlClient, options: superAdmin.option },
          defaultTestData.org1.id
        )
      );
    }
  });
});

async function setOLPPermissions(orgInfo) {
  const olpObjectIds = {};

  const permissions = `
      AIWARE_PACKAGE_CREATE
      AIWARE_PACKAGE_READ
      AIWARE_PACKAGE_UPDATE
      AIWARE_PACKAGE_DELETE`;

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
  defaultTestData.authGroupId = _.get(result, 'authGroupCreate.id');
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
  defaultTestData.authPermissionId = _.get(
    result,
    'authPermissionSetCreate.id'
  );
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

  result = await gqlClient.query(query, null, superAdmin.option);
  expect(result.addACEsToResources.records.length).toBeGreaterThan(0);
  olpObjectIds.aceOrgRecords = result.addACEsToResources.records;

  return olpObjectIds;
}
