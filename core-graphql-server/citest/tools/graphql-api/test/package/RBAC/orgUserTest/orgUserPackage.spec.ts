import { helpers } from '../../../../src/helpers/index';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../../../src/graphqlUtil';
import {
  AuthGroupMemberType,
  AuthPermissionType,
  AuthResourceType,
  EngineDistributionType,
  OrganizationStatus,
  OrganizationType,
  PackageGrantAction,
  PackageGrantType,
  PackageResourceAction,
  PackageResourceType
} from '../../../../src/gql';
import { safe } from '../../../../src/helpers/commonHelper';

const _ = require('lodash');
const uuid = require('uuid');
const chakram = require('chakram');
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp || false;

const config = helpers.config;
const env = config.env;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

const testPassword = 'testPassword123!';
let sdkClient: GraphqlClient;

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
    name: `${(global as any).orgMarker.package}-${uuid.v4()}`,
    guid: '',
    adminId: '',
    userId: ''
  },
  org2: {
    id: '',
    name: `${(global as any).orgMarker.package}-${uuid.v4()}`,
    guid: '',
    adminId: '',
    userId: ''
  },
  adminOptions: {},
  authGroupId: '',
  authPermissionId: ''
};

const packageIds = new Set<string>();
let olpObjectIds:
  | { authGroupId: string; permissionId: string; aceOrgRecords: any[] }
  | undefined;

describe('citest_package: Organization User Package Tests', () => {
  let superToken: string;
  let nonRbacOptions: any;
  let rbacOptions: any;

  const impersonateUser = async (user: {
    id: string;
    organizationGuid: string;
    superToken: string;
  }) => {
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
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(sdkClient.sessionToken).toBeDefined();

    superAdmin.token = sdkClient.sessionToken!;
    superToken = sdkClient.sessionToken!;
    superAdmin.option = helpers.requestOptions(superToken);

    const meRes = await sdkClient.sdk.me(
      {},
      getRequestHeaders(superAdmin.option)
    );
    const meData = _.get(meRes, 'data.me');
    expect(meData).toBeDefined();

    superAdmin.orgId = _.get(meData, 'organization.id');
    superAdmin.orgGuid = _.get(meData, 'organization.guid');
    superAdmin.userId = _.get(meData, 'id');
  });

  describe('Legacy Package Access for OrgUser', () => {
    let packageId = '';
    let packageId2 = '';

    beforeAll(async () => {
      const newOrgRes = await sdkClient.sdk.createOrganization(
        {
          input: {
            name: defaultTestData.org1.name,
            businessUnit: 'Legal',
            types: [OrganizationType.Agency, OrganizationType.Broadcaster],
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
            ].filter((app) => app),
            metadata: {
              features: {
                enableRBACFeature: 'disabled'
              }
            }
          }
        },
        getRequestHeaders(superAdmin.option)
      );

      const newOrg = _.get(newOrgRes, 'data.createOrganization');
      expect(newOrg.id).toBeDefined();
      defaultTestData.org1.id = newOrg.id;
      defaultTestData.org1.guid = newOrg.guid;

      const newPackageRes = await sdkClient.sdk.packageCreate(
        {
          input: {
            name: `${citestMarker}-package-${uuid.v4()}`,
            distributionType: EngineDistributionType.Public,
            resources: [],
            organizationId: newOrg.id,
            version: '1.0.0'
          }
        },
        getRequestHeaders(superAdmin.option)
      );

      packageId = _.get(newPackageRes, 'data.packageCreate.id');

      expect(packageId).toBeDefined();
      packageIds.add(packageId);

      const newPackageRes2 = await sdkClient.sdk.packageCreate(
        {
          input: {
            name: `${citestMarker}-package-${uuid.v4()}`,
            distributionType: EngineDistributionType.Public,
            resources: [],
            organizationId: newOrg.id,
            version: '1.0.0'
          }
        },
        getRequestHeaders(superAdmin.option)
      );

      packageId2 = _.get(newPackageRes2, 'data.packageCreate.id');

      expect(packageId2).toBeDefined();
      packageIds.add(packageId2);

      const newUserRes = await sdkClient.sdk.createUser(
        {
          input: {
            name: `${citestMarker}-non-rbac-user-${uuid.v4()}`,
            organizationId: newOrg.id,
            roleIds: [],
            password: testPassword
          }
        },
        getRequestHeaders(superAdmin.option)
      );

      const newUserData = _.get(newUserRes, 'data.createUser');

      expect(newUserData.organizationId).toEqual(newOrg.id);
      defaultTestData.org1.userId = newUserData.id;

      const impersonated = await impersonateUser({
        id: defaultTestData.org1.userId,
        organizationGuid: defaultTestData.org1.guid,
        superToken: superToken
      });
      nonRbacOptions = impersonated.requestOptions;

      const meRes = await sdkClient.sdk.me(
        {},
        getRequestHeaders(nonRbacOptions)
      );
      expect(_.get(meRes, 'data.me.name')).toContain('non-rbac-user');
    });

    it('User should see their orgs org-locked packages', async () => {
      const packageRes = await sdkClient.sdk.queryPackages(
        {
          ids: [packageId],
          limit: 10
        },
        getRequestHeaders(nonRbacOptions)
      );
      expect(_.get(packageRes, 'data.packages.records')).toBeDefined();
    });

    it('User creates a package should fail', async () => {
      await expect(
        sdkClient.sdk.packageCreate(
          {
            input: {
              name: `${citestMarker}-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [],
              version: '1.0.0'
            }
          },
          getRequestHeaders(nonRbacOptions)
        )
      ).rejects.toThrow(
        /"rightsRequired":\s*\[[^\]]*"aiware\.package\.create"[^\]]*]/
      );
    });

    it('User updates a package should fail', async () => {
      await expect(
        sdkClient.sdk.packageUpdate(
          {
            input: {
              id: packageId,
              name: `${citestMarker}-updateName-${uuid.v4()}`,
              description: 'test description'
            }
          },
          getRequestHeaders(nonRbacOptions)
        )
      ).rejects.toThrow(
        /"rightsRequired":\s*\[[^\]]*"aiware\.package\.update"[^\]]*]/
      );
    });

    it('User updates a package resource should fail', async () => {
      await expect(
        sdkClient.sdk.packageUpdateResources(
          {
            packageId,
            resources: [
              {
                resourceType: PackageResourceType.Package,
                resourceId: packageId2,
                action: PackageResourceAction.Add
              }
            ]
          },
          getRequestHeaders(nonRbacOptions)
        )
      ).rejects.toThrow(
        /"rightsRequired":\s*\[[^\]]*"aiware\.package\.update"[^\]]*]/
      );
    });

    it('User grant a package should fail', async () => {
      const grantRes = sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId,
          packageGrants: [
            {
              organizationId: defaultTestData.org1.id,
              grantType: PackageGrantType.Grant,
              action: PackageGrantAction.Add
            }
          ]
        },
        getRequestHeaders(nonRbacOptions)
      );

      await expect(grantRes).rejects.toThrow();
    });

    it('User delete a package should fail', async () => {
      await expect(
        sdkClient.sdk.packageDelete(
          {
            id: packageId
          },
          getRequestHeaders(nonRbacOptions)
        )
      ).rejects.toThrow(
        /"rightsRequired":\s*\[[^\]]*"aiware\.package\.delete"[^\]]*]/
      );
    });

    afterAll(async () => {
      if (packageIds.size) {
        for (const id of packageIds) {
          await safe(`delete package ${id}`, () =>
            sdkClient.sdk.packageDelete(
              { id },
              getRequestHeaders(superAdmin.option)
            )
          );
          packageIds.delete(id);
        }
      }
    });
  });

  describe('RBAC Package Access for OrgUser', () => {
    let packageId = '';
    let packageId2 = '';

    beforeAll(async () => {
      const newOrgRes = await sdkClient.sdk.createOrganization(
        {
          input: {
            name: defaultTestData.org2.name,
            businessUnit: 'Legal',
            types: [OrganizationType.Agency, OrganizationType.Broadcaster],
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
            ].filter((app) => app),
            metadata: {
              features: {
                enableRBACFeature: 'enabled'
              }
            }
          }
        },
        getRequestHeaders(superAdmin.option)
      );

      const newOrg = _.get(newOrgRes, 'data.createOrganization');
      expect(newOrg.id).toBeDefined();
      defaultTestData.org2.id = newOrg.id;
      defaultTestData.org2.guid = newOrg.guid;

      const newPackageRes = await sdkClient.sdk.packageCreate(
        {
          input: {
            name: `${citestMarker}-package-${uuid.v4()}`,
            distributionType: EngineDistributionType.Public,
            resources: [],
            organizationId: newOrg.id,
            version: '1.0.0'
          }
        },
        getRequestHeaders(superAdmin.option)
      );

      packageId = _.get(newPackageRes, 'data.packageCreate.id');
      expect(packageId).toBeDefined();
      packageIds.add(packageId);

      const newPackageRes2 = await sdkClient.sdk.packageCreate(
        {
          input: {
            name: `${citestMarker}-package-${uuid.v4()}`,
            distributionType: EngineDistributionType.Public,
            resources: [],
            organizationId: newOrg.id,
            version: '1.0.0'
          }
        },
        getRequestHeaders(superAdmin.option)
      );

      packageId2 = _.get(newPackageRes2, 'data.packageCreate.id');
      expect(packageId2).toBeDefined();
      packageIds.add(packageId2);

      const newUserRes = await sdkClient.sdk.createUser(
        {
          input: {
            name: `${citestMarker}-rbac-user-${uuid.v4()}`,
            organizationId: newOrg.id,
            roleIds: []
          }
        },
        getRequestHeaders(superAdmin.option)
      );

      const newUserData = _.get(newUserRes, 'data.createUser');
      expect(newUserData.organizationId).toEqual(newOrg.id);
      defaultTestData.org2.userId = newUserData.id;

      const impersonated = await impersonateUser({
        id: defaultTestData.org2.userId,
        organizationGuid: defaultTestData.org2.guid,
        superToken: superToken
      });
      rbacOptions = impersonated.requestOptions;
    });

    it('default user creates a package should fail', async () => {
      await expect(
        sdkClient.sdk.packageCreate(
          {
            input: {
              name: `${citestMarker}-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [],
              version: '1.0.0'
            }
          },
          getRequestHeaders(rbacOptions)
        )
      ).rejects.toThrow(
        'No authorization access role found for Mutation.packageCreate'
      );
    });

    it('default user updates a package should fail', async () => {
      await expect(
        sdkClient.sdk.packageUpdate(
          {
            input: {
              id: packageId,
              name: `${citestMarker}-updateName-${uuid.v4()}`,
              description: 'test description'
            }
          },
          getRequestHeaders(rbacOptions)
        )
      ).rejects.toThrow(
        'No authorization access role found for Mutation.packageUpdate'
      );
    });

    it('default user updates a package resource should fail', async () => {
      await expect(
        sdkClient.sdk.packageUpdateResources(
          {
            packageId,
            resources: [
              {
                resourceType: PackageResourceType.Package,
                resourceId: packageId2,
                action: PackageResourceAction.Add
              }
            ]
          },
          getRequestHeaders(rbacOptions)
        )
      ).rejects.toThrow(
        'No authorization access role found for Mutation.packageUpdate'
      );
    });

    it('default user grant a package should fail', async () => {
      const grantRes = sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId,
          packageGrants: [
            {
              organizationId: defaultTestData.org2.id,
              grantType: PackageGrantType.Grant,
              action: PackageGrantAction.Add
            }
          ]
        },
        getRequestHeaders(rbacOptions)
      );

      await expect(grantRes).rejects.toThrow();
    });

    it('default user query package grant should success', async () => {
      const grantRes = await sdkClient.sdk.packageGrants(
        {
          id: packageId
        },
        getRequestHeaders(rbacOptions)
      );

      expect(_.get(grantRes, 'data.packageGrants.records')).toBeDefined();
    });

    it('default user get package should success', async () => {
      const packageRes = await sdkClient.sdk.queryPackages(
        {
          ids: [packageId],
          limit: 10
        },
        getRequestHeaders(rbacOptions)
      );
      expect(_.get(packageRes, 'data.packages.records')).toBeDefined();
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

      const impersonated = await impersonateUser({
        id: defaultTestData.org2.userId,
        organizationGuid: defaultTestData.org2.guid,
        superToken: superToken
      });
      rbacOptions = impersonated.requestOptions;
    });

    it('User creates a package should success', async () => {
      const result = await sdkClient.sdk.packageCreate(
        {
          input: {
            name: `${citestMarker}-package-${uuid.v4()}`,
            distributionType: EngineDistributionType.Public,
            resources: [],
            version: '1.0.0'
          }
        },
        getRequestHeaders(rbacOptions)
      );
      expect(_.get(result, 'data.packageCreate.id')).toBeDefined();

      // User Clean up the created package
      const createdPackageId = _.get(result, 'data.packageCreate.id');
      await safe(`delete package ${createdPackageId}`, () =>
        sdkClient.sdk.packageDelete(
          { id: createdPackageId },
          getRequestHeaders(rbacOptions)
        )
      );
    });

    it('User get package should success', async () => {
      const packageRes = await sdkClient.sdk.queryPackages(
        {
          ids: [packageId],
          limit: 10
        },
        getRequestHeaders(rbacOptions)
      );

      expect(_.get(packageRes, 'data.packages.records[0].id')).toEqual(
        packageId
      );
    });

    it('User updates a package should success', async () => {
      const result = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: packageId,
            name: `${citestMarker}-updateName-${uuid.v4()}`,
            description: 'test description'
          }
        },
        getRequestHeaders(rbacOptions)
      );
      expect(_.get(result, 'data.packageUpdate.id')).toEqual(packageId);
    });

    it('User updates a package resource should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdateResources(
        {
          packageId,
          resources: [
            {
              resourceType: PackageResourceType.Package,
              resourceId: packageId2,
              action: PackageResourceAction.Add
            }
          ]
        },
        getRequestHeaders(rbacOptions)
      );
      expect(
        _.get(
          updateRes,
          'data.packageUpdateResources.resources.records[0].resourceId'
        )
      ).toBe(packageId2);
    });

    it('User grant a package should fail', async () => {
      const grantRes = sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId,
          packageGrants: [
            {
              organizationId: defaultTestData.org2.id,
              grantType: PackageGrantType.Grant,
              action: PackageGrantAction.Add
            }
          ]
        },
        getRequestHeaders(rbacOptions)
      );

      await expect(grantRes).rejects.toThrow(
        'Not Authorized to grant package access'
      );
    });

    it('Grant package by super admin for User to query', async () => {
      const grantRes = await sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId,
          packageGrants: [
            {
              organizationId: defaultTestData.org2.id,
              grantType: PackageGrantType.Grant,
              action: PackageGrantAction.Add
            }
          ]
        },
        getRequestHeaders(superAdmin.option)
      );

      expect(_.get(grantRes, 'data.packageUpdateGrants.id')).toEqual(packageId);
    });

    it('User query package grant should success', async () => {
      const grantRes = await sdkClient.sdk.packageGrants(
        {
          id: packageId
        },
        getRequestHeaders(rbacOptions)
      );

      expect(_.get(grantRes, 'data.packageGrants.records.length')).toEqual(1);
      expect(
        _.get(grantRes, 'data.packageGrants.records[0].package.id')
      ).toEqual(packageId);
      expect(
        _.get(grantRes, 'data.packageGrants.records[0].grantType')
      ).toEqual('GRANT');
    });

    it('User delete a package should success', async () => {
      const deleteRes = await sdkClient.sdk.packageDelete(
        {
          id: packageId
        },
        getRequestHeaders(rbacOptions)
      );

      expect(_.get(deleteRes, 'data.packageDelete.success')).toEqual(true);
    });

    afterAll(async () => {
      if (packageIds.size) {
        for (const id of packageIds) {
          await safe(`delete package ${id}`, () =>
            sdkClient.sdk.packageDelete(
              { id },
              getRequestHeaders(superAdmin.option)
            )
          );
          packageIds.delete(id);
        }
      }
    });
  });

  afterAll(async () => {
    if (olpObjectIds?.authGroupId) {
      await safe('delete authGroup', () =>
        sdkClient.sdk.authGroupDelete(
          {
            id: olpObjectIds!.authGroupId,
            ownerOrganization: defaultTestData.org2.guid
          },
          getRequestHeaders(superAdmin.option)
        )
      );
    }

    if (olpObjectIds?.permissionId) {
      await safe('delete auth permission set', () =>
        sdkClient.sdk.authPermissionSetDelete(
          {
            id: olpObjectIds!.permissionId,
            ownerOrganization: defaultTestData.org2.guid
          },
          getRequestHeaders(superAdmin.option)
        )
      );
    }

    if (defaultTestData.org1.userId) {
      await safe('delete user org1', () =>
        sdkClient.sdk.deleteUser(
          {
            id: defaultTestData.org1.userId
          },
          getRequestHeaders(superAdmin.option)
        )
      );
    }

    if (defaultTestData.org2.userId) {
      await safe('delete user org2', () =>
        sdkClient.sdk.deleteUser(
          {
            id: defaultTestData.org2.userId
          },
          getRequestHeaders(superAdmin.option)
        )
      );
    }

    // delete org and related RBAC auth
    if (defaultTestData.org2.id) {
      await safe('delete org2', () =>
        sdkClient.sdk.updateOrganization(
          {
            input: {
              id: defaultTestData.org2.id,
              metadata: {
                features: {
                  enableRBACFeature: 'disabled'
                }
              },
              status: OrganizationStatus.Deleted
            }
          },
          getRequestHeaders(superAdmin.option)
        )
      );
    }

    if (defaultTestData.org1.id) {
      await safe('delete org1', () =>
        sdkClient.sdk.updateOrganization(
          {
            input: {
              id: defaultTestData.org1.id,
              metadata: {
                features: {
                  enableRBACFeature: 'disabled'
                }
              },
              status: OrganizationStatus.Deleted
            }
          },
          getRequestHeaders(superAdmin.option)
        )
      );
    }
  });
});

async function setOLPPermissions(orgInfo: {
  orgId: string;
  orgGuid: string;
  userId: string;
}) {
  const olpObjectIds: {
    authGroupId: string;
    permissionId: string;
    aceOrgRecords: any[];
  } = {
    authGroupId: '',
    permissionId: '',
    aceOrgRecords: []
  };

  const authGroupRes = await sdkClient.sdk.CreateAuthGroup(
    {
      input: {
        name: `${citestMarker}-auth-group-test-${uuid.v4()}`,
        description: 'desc',
        ownerOrganization: orgInfo.orgGuid,
        members: [
          {
            id: orgInfo.userId,
            memberType: AuthGroupMemberType.User
          }
        ]
      }
    },
    getRequestHeaders(superAdmin.option)
  );
  const authGroupData = _.get(authGroupRes, 'data.authGroupCreate');
  expect(authGroupData.id).toBeDefined();
  defaultTestData.authGroupId = _.get(authGroupData, 'id');
  olpObjectIds.authGroupId = _.get(authGroupData, 'id');

  const permissionSetRes = await sdkClient.sdk.authPermissionSetCreate(
    {
      input: {
        name: `${citestMarker}-permission-${uuid.v4()}`,
        description: 'desc',
        organizationID: orgInfo.orgId,
        permissions: [
          AuthPermissionType.AiwarePackageCreate,
          AuthPermissionType.AiwarePackageRead,
          AuthPermissionType.AiwarePackageUpdate,
          AuthPermissionType.AiwarePackageDelete
        ]
      }
    },
    getRequestHeaders(superAdmin.option)
  );
  const permissionSetData = _.get(
    permissionSetRes,
    'data.authPermissionSetCreate'
  );
  expect(permissionSetData.id).toBeDefined();
  defaultTestData.authPermissionId = _.get(permissionSetData, 'id');
  olpObjectIds.permissionId = _.get(permissionSetData, 'id');

  const addAcesRes = await sdkClient.sdk.addACEsToResources(
    {
      ids: [orgInfo.orgId],
      resourceType: AuthResourceType.Organization,
      ownerOrganization: orgInfo.orgGuid,
      entries: [
        {
          member: {
            id: olpObjectIds.authGroupId,
            memberType: AuthGroupMemberType.Group
          },
          permissionSetID: olpObjectIds.permissionId
        }
      ]
    },
    getRequestHeaders(superAdmin.option)
  );
  const addAcesData = _.get(addAcesRes, 'data.addACEsToResources');
  expect(addAcesData.records.length).toBeGreaterThan(0);
  olpObjectIds.aceOrgRecords = addAcesData.records;

  return olpObjectIds;
}
