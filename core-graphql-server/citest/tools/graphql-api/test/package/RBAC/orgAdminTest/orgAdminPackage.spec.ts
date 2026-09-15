import * as _ from 'lodash';
import * as uuid from 'uuid';
import chakram from 'chakram';
import { helpers } from '../../../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../../../src/graphqlUtil';
import {
  ApplicationStatus,
  AuthGroupMemberType,
  AuthPermissionType,
  AuthResourceType,
  EngineDistributionType,
  OrganizationStatus,
  OrganizationType,
  PackageGrantAction,
  PackageGrantType,
  PackageResourceAction,
  PackageResourceType,
  PackageStatus
} from '../../../../src/gql';
import { safe } from '../../../../src/helpers/commonHelper';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

let sdkClient: GraphqlClient;
const config = helpers.config;
const env = config.env;
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

// Test setup
const ROLES_IDS: string[] = [
  isDesktopAppEnabled ? '' : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);

let packageInOrg: any, packageNotInOrg: any;
let rbacPackageInOrg: any, rbacPackageNotInOrg: any;
let afterRbacPackage: any;
let draftAppId: string, rbacDraftAppId: string;
let superAdminOptions = {};
let legacyAdminOptions = {};
let rbacAdminOptions = {};
let testUserLegacyId = '';
let testUserRBACId = '';
let appResourceId: string;

let testOrgLegacy: any = {
  id: '',
  guid: ''
};

let testOrgRBAC: any = {
  id: '',
  guid: ''
};
let superToken: string;

const testOrgLegacyInput = {
  businessUnit: 'Legal',
  types: [OrganizationType.Agency, OrganizationType.Broadcaster],
  metadata: {
    features: {
      enableRBACFeature: 'disabled', // Disabled for legacy admin tests
      automaticPackageCreation: 'disabled'
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
};

let OLPObjbectIds: {
  authGroupId: string;
  permissionId: string;
  aceOrgRecords: any;
} | null = null;

const testOrgRBACInput = {
  businessUnit: 'Legal',
  types: [OrganizationType.Agency, OrganizationType.Broadcaster],
  metadata: {
    features: {
      enableRBACFeature: 'enabled', // Enable for rabc admin tests
      automaticPackageCreation: 'disabled'
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
};

const testUserInput = {
  name: `${citestMarker}-test-user-${uuid.v4()}`,
  password: 'TestUserPassword',
  organizationId: '',
  roleIds: []
};

const packageInput = {
  name: `${citestMarker}-package-test-${uuid.v4()}`,
  description: 'Test',
  version: '1.0.0',
  distributionType: '' // This will be set later
};

describe('Organization Admin Package Tests', () => {
  let RbacInfo = {
    orgGuid: '',
    orgId: '',
    orgName: '',
    userId: '',
    userName: '',
    isOLPEnabled: true
  };

  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(sdkClient.sessionToken).toBeDefined();
    superToken = sdkClient.sessionToken!;
    superAdminOptions = helpers.requestOptions(superToken);

    // Set up legacy organization for testing
    const testOrgLegacyRes = await sdkClient.sdk.createOrganization({
      input: {
        ...testOrgLegacyInput,
        name: `${citestMarker}-legacy-org-${uuid.v4()}`
      }
    });

    testOrgLegacy = _.get(testOrgLegacyRes, 'data.createOrganization');
    expect(testOrgLegacy).toBeDefined();

    // Set up rbac organization for testing
    const testOrgRBACRes = await sdkClient.sdk.createOrganization({
      input: {
        ...testOrgRBACInput,
        name: `${citestMarker}-rbac-org-${uuid.v4()}`
      }
    });

    testOrgRBAC = _.get(testOrgRBACRes, 'data.createOrganization');
    expect(testOrgRBAC).toBeDefined();

    // Create a legacy admin in the test organization
    const legacyUserInput = {
      ...testUserInput,
      name: `${citestMarker}-test-user-legacy-${uuid.v4()}`,
      organizationId: testOrgLegacy.id,
      roleIds: [ROLES_IDS[0]]
    };

    const userRes = await sdkClient.sdk.createUser({
      input: legacyUserInput
    });

    const userResult = _.get(userRes, 'data.createUser');
    expect(userResult).toBeDefined();
    testUserLegacyId = userResult?.id || '';

    // Create a rbac admin in the test organization
    const rbacUserInput = {
      ...testUserInput,
      name: `${citestMarker}-test-user-rbac-${uuid.v4()}`,
      organizationId: testOrgRBAC.id,
      roleIds: ['032218c3-d47e-4287-9d16-7bb867c01266']
    };
    const rabcAdminRes = await sdkClient.sdk.createUser({
      input: rbacUserInput
    });

    const rabcAdminResult = _.get(rabcAdminRes, 'data.createUser');
    expect(rabcAdminResult).toBeDefined();
    testUserRBACId = rabcAdminResult?.id || '';

    // Impersonate the legacy admin to get the request options
    legacyAdminOptions = await impersonate(
      testUserLegacyId,
      testOrgLegacy.guid,
      superToken
    );

    // Impersonate the rabc admin to get the request options
    rbacAdminOptions = await impersonate(
      testUserRBACId,
      testOrgRBAC.guid,
      superToken
    );
  });

  afterAll(async () => {
    // delete draft app if created
    if (draftAppId) {
      await safe('deleteApplication draftAppId', () =>
        sdkClient.sdk.deleteApplication({ id: draftAppId })
      );
    }

    if (rbacDraftAppId) {
      await safe('deleteApplication rbacDraftAppId', () =>
        sdkClient.sdk.deleteApplication({ id: rbacDraftAppId })
      );
    }

    if (appResourceId) {
      await safe('deleteApplication appResourceId', () =>
        sdkClient.sdk.deleteApplication({ id: appResourceId })
      );
    }

    // delete packages if it created
    if (afterRbacPackage && afterRbacPackage.id) {
      await safe('deletePackage afterRbacPackage', () =>
        sdkClient.sdk.packageDelete({ id: afterRbacPackage.id })
      );
    }

    if (packageNotInOrg && packageNotInOrg.id) {
      await safe('deletePackage packageNotInOrg', () =>
        sdkClient.sdk.packageDelete({ id: packageNotInOrg.id })
      );
    }

    if (packageInOrg && packageInOrg.id) {
      await safe('deletePackage packageInOrg', () =>
        sdkClient.sdk.packageDelete({ id: packageInOrg.id })
      );
    }

    if (rbacPackageNotInOrg && rbacPackageNotInOrg.id) {
      await safe('deletePackage rbacPackageNotInOrg', () =>
        sdkClient.sdk.packageDelete({ id: rbacPackageNotInOrg.id })
      );
    }

    if (rbacPackageInOrg && rbacPackageInOrg.id) {
      await safe('deletePackage rbacPackageInOrg', () =>
        sdkClient.sdk.packageDelete({ id: rbacPackageInOrg.id })
      );
    }

    // OLPObjbectIds
    // delete OLP data
    if (OLPObjbectIds?.authGroupId) {
      await safe('deleteAuthGroup', () =>
        sdkClient.sdk.authGroupDelete({
          id: OLPObjbectIds?.authGroupId!,
          ownerOrganization: RbacInfo.orgGuid
        })
      );
    }

    if (OLPObjbectIds?.permissionId) {
      await safe('deletePermissionSet', () =>
        sdkClient.sdk.authPermissionSetDelete({
          id: OLPObjbectIds?.permissionId!,
          ownerOrganization: RbacInfo.orgGuid
        })
      );
    }

    if (testUserLegacyId) {
      await safe('deleteUser testUserLegacyId', () =>
        sdkClient.sdk.deleteUser({ id: testUserLegacyId })
      );
    }

    if (testUserRBACId) {
      await safe('deleteUser testUserRBACId', () =>
        sdkClient.sdk.deleteUser({ id: testUserRBACId })
      );
    }

    if (testOrgLegacy && testOrgLegacy.id) {
      await safe('deleteOrganization testOrgLegacy', () =>
        sdkClient.sdk.updateOrganization({
          input: {
            id: testOrgLegacy.id,
            metadata: {
              features: { enableRBACFeature: 'disabled' }
            },
            status: OrganizationStatus.Deleted
          }
        })
      );
    }

    if (testOrgRBAC && testOrgRBAC.id) {
      await safe('deleteOrganization testOrgRBAC', () =>
        sdkClient.sdk.updateOrganization({
          input: {
            id: testOrgRBAC.id,
            metadata: {
              features: { enableRBACFeature: 'disabled' }
            },
            status: OrganizationStatus.Deleted
          }
        })
      );
    }
  });

  describe('Legacy Admin Package Tests', () => {
    it('should succeed when creating package by super admin', async () => {
      const pkg = await sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            distributionType: EngineDistributionType.Sharable,
            resources: []
          }
        },
        getRequestHeaders(superAdminOptions)
      );

      const packageData = _.get(pkg, 'data.packageCreate');
      expect(packageData).toBeDefined();
      expect(packageData?.id).toBeDefined();
      packageNotInOrg = packageData;
    });

    it('should succeed when creating package for org by super admin', async () => {
      const pkg = await sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            distributionType: EngineDistributionType.Sharable,
            resources: [],
            organizationId: testOrgLegacy.id
          }
        },
        getRequestHeaders(superAdminOptions)
      );

      const packageData = _.get(pkg, 'data.packageCreate');
      expect(packageData).toBeDefined();
      expect(packageData?.id).toBeDefined();
      packageInOrg = packageData;
    });

    it('should succeed when super admin shares package with organization', async () => {
      const grantRes = await sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId: packageNotInOrg.id,
          packageGrants: [
            {
              organizationId: testOrgLegacy.id,
              grantType: PackageGrantType.Grant,
              action: PackageGrantAction.Add
            }
          ]
        },
        getRequestHeaders(superAdminOptions)
      );

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('should succeed when legacy admin grant package of their own org', async () => {
      const grantRes = await sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId: packageInOrg.id,
          packageGrants: [
            {
              organizationId: testOrgLegacy.id,
              grantType: PackageGrantType.Grant,
              action: PackageGrantAction.Add
            }
          ]
        },
        getRequestHeaders(legacyAdminOptions)
      );

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('should succeed when legacy admin approves package for org', async () => {
      const approveRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: packageInOrg.id,
            status: PackageStatus.Approved
          }
        },
        getRequestHeaders(legacyAdminOptions)
      );

      const packageData = _.get(approveRes, 'data.packageUpdate');
      expect(packageData).toBeDefined();
      expect(packageData?.id).toBe(packageInOrg.id);
    });

    it('should succeed when legacy admin get packages for org', async () => {
      const getPackages = await sdkClient.sdk.packageGrants(
        {
          limit: 10,
          offset: 0,
          orgId: testOrgLegacy.id,
          packageFilter: {
            grantType: PackageGrantType.Grant,
            isLatest: true
          }
        },
        getRequestHeaders(legacyAdminOptions)
      );

      const getPackagesData = _.get(getPackages, 'data.packageGrants');
      expect(getPackagesData).toBeDefined();
      const records = _.get(getPackagesData, 'records', []);
      expect(records.length).toBeGreaterThan(0);
    });

    xit('should fail when creating package by legacy admin', async () => {
      await expect(
        sdkClient.sdk.packageCreate(
          {
            input: {
              ...packageInput,
              distributionType: EngineDistributionType.Sharable,
              resources: [],
              organizationId: testOrgLegacy.id
            }
          },
          getRequestHeaders(legacyAdminOptions)
        )
      ).rejects.toThrow('You do not have permission to perform this action');
    });

    it('should succeed when legacy admin updates package resources', async () => {
      appResourceId = await getAppResource();

      const updateRes = await sdkClient.sdk.packageUpdateResources(
        {
          packageId: packageInOrg.id,
          resources: [
            {
              resourceType: PackageResourceType.Application,
              resourceId: appResourceId!,
              action: PackageResourceAction.Add
            }
          ]
        },
        getRequestHeaders(legacyAdminOptions)
      );

      const packageData = _.get(updateRes, 'data.packageUpdateResources');
      expect(packageData).toBeDefined();
    });

    xit('should fail when legacy admin updates package basic info', async () => {
      await expect(
        sdkClient.sdk.packageUpdate(
          {
            input: {
              id: packageInOrg.id,
              name: citestMarker + '-updateName-' + uuid.v4(),
              description: 'test description'
            }
          },
          getRequestHeaders(legacyAdminOptions)
        )
      ).rejects.toThrow('You do not have permission to perform this action');
    });

    xit('should fail when legacy admin deletes package', async () => {
      await expect(
        sdkClient.sdk.packageDelete(
          {
            id: packageInOrg.id
          },
          getRequestHeaders(legacyAdminOptions)
        )
      ).rejects.toThrow('You do not have permission to perform this action');
    });

    it('should delete package resource', async () => {
      const deleteRes = await sdkClient.sdk.packageDelete({
        id: packageInOrg.id
      });

      const packageData = _.get(deleteRes, 'data.packageDelete');
      expect(packageData).toBeDefined();
      expect(packageData?.success).toBe(true);
      packageInOrg = undefined; // Set to undefined to avoid afterAll trying to delete again

      // delete packageNotInOrg
      const deleteRes2 = await sdkClient.sdk.packageDelete({
        id: packageNotInOrg.id
      });

      const packageData2 = _.get(deleteRes2, 'data.packageDelete');
      expect(packageData2).toBeDefined();
      expect(packageData2?.success).toBe(true);
      packageNotInOrg = undefined; // Set to undefined to avoid afterAll trying to delete again
    });
  });

  describe('RBAC Admin Package Tests', () => {
    xit('should fail when creating package by rbac admin', async () => {
      const pkg = sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            distributionType: EngineDistributionType.Sharable,
            resources: []
          }
        },
        getRequestHeaders(rbacAdminOptions)
      );

      await expect(pkg).rejects.toThrow();
    });

    it('should succeed when creating package by super admin', async () => {
      const pkg = await sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            distributionType: EngineDistributionType.Sharable,
            resources: []
          }
        },
        getRequestHeaders(superAdminOptions)
      );
      const packageData = _.get(pkg, 'data.packageCreate');
      expect(packageData).toBeDefined();
      expect(packageData?.id).toBeDefined();
      rbacPackageNotInOrg = packageData;
    });

    it('should succeed when super admin create package for org', async () => {
      const pkg = await sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            distributionType: EngineDistributionType.Sharable,
            resources: [],
            organizationId: testOrgRBAC.id
          }
        },
        getRequestHeaders(superAdminOptions)
      );
      const packageData = _.get(pkg, 'data.packageCreate');
      expect(packageData).toBeDefined();
      expect(packageData?.id).toBeDefined();
      rbacPackageInOrg = packageData;
    });

    it('should succeed when rbac admin update package resource', async () => {
      const createDraftAppRes = await sdkClient.sdk.createApplication({
        input: {
          name: citestMarker + '-app-' + uuid.v4(),
          description: 'test',
          isPublic: true,
          url: 'www.example.com',
          oauth2RedirectUrls: ['www.example.com/callback'],
          checkPermissions: false,
          iconUrl: 'http://abc.com/link-icon.png'
        }
      });

      const appDraft = _.get(createDraftAppRes, 'data.createApplication');
      expect(appDraft?.id).toBeDefined();
      draftAppId = appDraft?.id!;

      const updateRes = await sdkClient.sdk.packageUpdateResources(
        {
          packageId: rbacPackageInOrg.id,
          resources: [
            {
              resourceType: PackageResourceType.Application,
              resourceId: draftAppId,
              action: PackageResourceAction.Add
            }
          ]
        },
        getRequestHeaders(rbacAdminOptions)
      );

      const packageData = _.get(updateRes, 'data.packageUpdateResources');
      expect(packageData).toBeDefined();
    });

    it('should succeed when rbac admin update package status', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: rbacPackageInOrg.id,
            status: PackageStatus.Approved
          }
        },
        getRequestHeaders(rbacAdminOptions)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      expect(packageData).toBeDefined();
      expect(packageData?.id).toBe(rbacPackageInOrg.id);
    });

    it('should succeed when rbac admin grant package to own org', async () => {
      const grantRes = await sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId: rbacPackageInOrg.id,
          packageGrants: [
            {
              organizationId: testOrgRBAC.id,
              grantType: PackageGrantType.Grant,
              action: PackageGrantAction.Add
            }
          ]
        },
        getRequestHeaders(rbacAdminOptions)
      );

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('should succeed when rbac admin get package grant', async () => {
      const getGrantRes = await sdkClient.sdk.packageGrants(
        { id: rbacPackageInOrg.id },
        getRequestHeaders(rbacAdminOptions)
      );

      const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
      expect(getGrant).toBeDefined();

      const currentGrant = getGrant?.find(
        (rec: any) => rec.organization.id == testOrgRBAC.id
      );
      expect(currentGrant).toBeDefined();
      expect(currentGrant?.grantType).toEqual('GRANT');
    });

    it('should succeed when rbac admin revoke package grant to own org', async () => {
      const revokeRes = await sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId: rbacPackageInOrg.id,
          packageGrants: [
            {
              organizationId: testOrgRBAC.id,
              grantType: PackageGrantType.Grant,
              action: PackageGrantAction.Remove
            }
          ]
        },
        getRequestHeaders(rbacAdminOptions)
      );

      const revokeData = _.get(revokeRes, 'data.packageUpdateGrants');
      expect(revokeData).toBeDefined();
      expect(revokeData?.id).toEqual(rbacPackageInOrg.id);
    });

    xit('should fail when rbac admin delete package', async () => {
      const deleteRes = sdkClient.sdk.packageDelete(
        {
          id: rbacPackageInOrg.id
        },
        getRequestHeaders(rbacAdminOptions)
      );

      await expect(deleteRes).rejects.toThrow();
    });

    it('should succeed when super admin set package permission for rbac admin', async () => {
      const userInfoRes = await sdkClient.sdk.me(
        {},
        getRequestHeaders(rbacAdminOptions)
      );

      RbacInfo = {
        orgGuid: _.get(userInfoRes, 'data.me.organization.guid', ''),
        orgId: _.get(userInfoRes, 'data.me.organization.id', ''),
        orgName: _.get(userInfoRes, 'data.me.organization.name', ''),
        userId: _.get(userInfoRes, 'data.me.id', ''),
        userName: _.get(userInfoRes, 'data.me.name', ''),
        isOLPEnabled:
          _.get(
            userInfoRes,
            'data.me.organization.jsondata.features.enableRBACFeature'
          ) === 'enabled'
      };

      const result = await setOLPPermissions(RbacInfo);
      OLPObjbectIds = result;
      expect(result).toBeDefined();
      expect(result.authGroupId).toBeDefined();
      expect(result.permissionId).toBeDefined();
      expect(result.aceOrgRecords.length).toBeGreaterThan(0);

      await helpers.sleep(5000);

      // re-login to get new permissions take effect
      rbacAdminOptions = await impersonate(
        testUserRBACId,
        testOrgRBAC.guid,
        superToken
      );
    });

    it('should succeed when rbac admin create package', async () => {
      const packageRes = await sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            distributionType: EngineDistributionType.Sharable,
            resources: [],
            organizationId: testOrgRBAC.id
          }
        },
        getRequestHeaders(rbacAdminOptions)
      );
      const packageData = _.get(packageRes, 'data.packageCreate');
      expect(packageData).toBeDefined();
      expect(packageData?.id).toBeDefined();
      afterRbacPackage = packageData;
    });

    it('should succeed when rbac admin update package resource', async () => {
      const createDraftAppRes = await sdkClient.sdk.createApplication({
        input: {
          name: citestMarker + '-app-' + uuid.v4(),
          description: 'test',
          isPublic: true,
          url: 'www.example.com',
          oauth2RedirectUrls: ['www.example.com/callback'],
          checkPermissions: false,
          iconUrl: 'http://abc.com/link-icon.png'
        }
      });

      const appDraft = _.get(createDraftAppRes, 'data.createApplication');
      expect(appDraft?.id).toBeDefined();
      rbacDraftAppId = appDraft?.id!;

      const updateRes = await sdkClient.sdk.packageUpdateResources(
        {
          packageId: afterRbacPackage.id,
          resources: [
            {
              resourceType: PackageResourceType.Application,
              resourceId: rbacDraftAppId,
              action: PackageResourceAction.Add
            }
          ]
        },
        getRequestHeaders(rbacAdminOptions)
      );

      const packageData = _.get(updateRes, 'data.packageUpdateResources');
      expect(packageData).toBeDefined();
    });

    it('should succeed when rbac admin update package status', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: afterRbacPackage.id,
            status: PackageStatus.Approved
          }
        },
        getRequestHeaders(rbacAdminOptions)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      expect(packageData).toBeDefined();
      expect(packageData?.id).toBe(afterRbacPackage.id);
    });

    it('should succeed when rbac admin delete package', async () => {
      const deleteRes = await sdkClient.sdk.packageDelete(
        { id: afterRbacPackage.id },
        getRequestHeaders(rbacAdminOptions)
      );

      const packageData = _.get(deleteRes, 'data.packageDelete');
      expect(packageData).toBeDefined();
      expect(packageData?.success).toBe(true);
      afterRbacPackage = undefined; // Set to undefined to avoid afterAll trying to delete again
    });
  });
});

async function impersonate(
  userId: string,
  applicationOrgGUID: string,
  token: string
) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

async function getAppResource() {
  const app_uuid = uuid.v4();
  const createAppRes = await sdkClient.sdk.createApplication(
    {
      input: {
        name: `${citestMarker} Package App - ${app_uuid}`,
        // key: `citest-package-app ${app_uuid}`,
        description: `Citest Package App - ${app_uuid}`,
        url: 'www.example.com',
        oauth2RedirectUrls: ['www.example.com/callback'],
        checkPermissions: false,
        status: ApplicationStatus.Active
      }
    },
    getRequestHeaders(superAdminOptions)
  );

  const testAppId = _.get(createAppRes, 'data.createApplication.id');
  expect(testAppId).toBeDefined();
  return testAppId || '';
}

async function setOLPPermissions(orgInfo: any) {
  const olpObjectIds = {
    authGroupId: '',
    permissionId: '',
    aceOrgRecords: [] as any[]
  };

  const permissions = [
    AuthPermissionType.AiwarePackageCreate,
    AuthPermissionType.AiwarePackageRead,
    AuthPermissionType.AiwarePackageUpdate,
    AuthPermissionType.AiwarePackageDelete
  ];

  let result = await sdkClient.sdk.CreateAuthGroup({
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
  });
  const authGroupData = _.get(result, 'data.authGroupCreate');
  expect(authGroupData.id).toBeDefined();
  olpObjectIds.authGroupId = _.get(authGroupData, 'id');

  const permissionSetRes = await sdkClient.sdk.authPermissionSetCreate({
    input: {
      name: `${citestMarker}-permission-${uuid.v4()}`,
      description: 'desc',
      organizationID: orgInfo.orgId,
      permissions: permissions
    }
  });
  const permissionSetData = _.get(
    permissionSetRes,
    'data.authPermissionSetCreate'
  );
  expect(permissionSetData.id).toBeDefined();
  olpObjectIds.permissionId = _.get(permissionSetData, 'id');

  const addACERes = await sdkClient.sdk.addACEsToResources({
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
  });
  const addACEData = _.get(addACERes, 'data.addACEsToResources');
  expect(addACEData.records.length).toBeGreaterThan(0);
  olpObjectIds.aceOrgRecords = addACEData.records;

  return olpObjectIds;
}
