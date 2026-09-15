import { helpers } from '../../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../../src/graphqlUtil';
import {
  AuthGroupMemberType,
  AuthPermissionType,
  AuthResourceType,
  BuildUpdateAction,
  DeploymentModel,
  EngineDistributionType,
  OrganizationStatus,
  OrganizationType,
  PackageGrantAction,
  PackageGrantType,
  PackageResourceAction,
  PackageResourceType,
  PackageStatus,
  SchemaStatus
} from '../../../src/gql';
import { safe } from '../../../src/helpers/commonHelper';
import * as _ from 'lodash';
import * as uuid from 'uuid';

import chakram from 'chakram';
const config = helpers.config;
const env = config.env;

let sdkClient: GraphqlClient;
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

let orgResult: any, orgResult2: any, orgResult3: any;

const orgMarker = (global as any).orgMarker.package;
const testOrgName = `${orgMarker}-filters-${uuid.v4()}`;
const ROLES_IDS = [
  (global as any).enableDefaultDesktopApp
    ? ''
    : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);

const testOrgInput = {
  name: testOrgName,
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
};

const testUserInput = {
  name: `${citestMarker}-test-user-${uuid.v4()}`,
  password: 'TestPassword123',
  organizationId: '',
  roleIds: ROLES_IDS
};

const testUserInput2 = {
  name: `${citestMarker}-test-user2-${uuid.v4()}`,
  password: 'TestPassword123',
  organizationId: '',
  roleIds: ROLES_IDS
};

const testUserInput3 = {
  name: `${citestMarker}-test-user3-${uuid.v4()}`,
  password: 'TestPassword123',
  organizationId: '',
  roleIds: ROLES_IDS
};

const packageInput = {
  name: `${citestMarker}-package-filters-${uuid.v4()}`,
  description: 'Test Package for Filters',
  version: '1.0.0',
  distributionType: EngineDistributionType.Sharable
};

let testData: any = {
  superAdminToken: '',
  superAdminOption: {},
  userId: '',
  userId2: '',
  userId3: '',
  userOption: {},
  userOption2: {},
  userOption3: {},
  appId: '',
  package1Id: '',
  package2Id: '',
  package3Id: ''
};

const createdPackageIds = new Set<string>();
const createdUserIds = new Set<string>();
const createdOrgIds = new Set<string>();

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

describe('Package Filter by grantTypes', () => {
  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(sdkClient.sessionToken).toBeDefined();
    testData.superAdminToken = sdkClient.sessionToken;
    testData.superAdminOption = helpers.requestOptions(
      testData.superAdminToken
    );

    const createOrgRe = await sdkClient.sdk.createOrganization({
      input: {
        ...testOrgInput,
        name: `${testOrgInput.name}-1`
      }
    });

    orgResult = _.get(createOrgRe, 'data.createOrganization');
    expect(orgResult).toBeDefined();
    expect(orgResult.id).toBeDefined();
    createdOrgIds.add(orgResult.id);

    const createOrgRes2 = await sdkClient.sdk.createOrganization({
      input: {
        ...testOrgInput,
        name: `${testOrgInput.name}-2`
      }
    });

    orgResult2 = _.get(createOrgRes2, 'data.createOrganization');
    expect(orgResult2).toBeDefined();
    expect(orgResult2.id).toBeDefined();
    createdOrgIds.add(orgResult2.id);

    const createOrgRes3 = await sdkClient.sdk.createOrganization({
      input: {
        ...testOrgInput,
        name: `${testOrgInput.name}-3`
      }
    });

    orgResult3 = _.get(createOrgRes3, 'data.createOrganization');
    expect(orgResult3).toBeDefined();
    expect(orgResult3.id).toBeDefined();
    createdOrgIds.add(orgResult3.id);

    testUserInput.organizationId = orgResult.id;
    const createUserRes = await sdkClient.sdk.createUser({
      input: testUserInput
    });

    const userResult = _.get(createUserRes, 'data.createUser');
    expect(userResult).toBeDefined();
    testData.userId = userResult?.id;
    createdUserIds.add(testData.userId);

    testUserInput2.organizationId = orgResult2.id;
    const createUserRes2 = await sdkClient.sdk.createUser({
      input: testUserInput2
    });

    const userResult2 = _.get(createUserRes2, 'data.createUser');
    expect(userResult2).toBeDefined();
    testData.userId2 = userResult2?.id;
    createdUserIds.add(testData.userId2);

    testUserInput3.organizationId = orgResult3.id;
    const createUserRes3 = await sdkClient.sdk.createUser({
      input: testUserInput3
    });

    const userResult3 = _.get(createUserRes3, 'data.createUser');
    expect(userResult3).toBeDefined();
    testData.userId3 = userResult3?.id;
    createdUserIds.add(testData.userId3);

    testData.userOption = await impersonate(
      testData.userId,
      orgResult.guid,
      testData.superAdminToken
    );

    testData.userOption2 = await impersonate(
      testData.userId2,
      orgResult2.guid,
      testData.superAdminToken
    );

    testData.userOption3 = await impersonate(
      testData.userId3,
      orgResult3.guid,
      testData.superAdminToken
    );
  });

  afterAll(async () => {
    for (const packageId of createdPackageIds) {
      await safe(`delete package ${packageId}`, () =>
        sdkClient.sdk.packageDelete(
          { id: packageId },
          getRequestHeaders(testData.userOption)
        )
      );
    }

    for (const userId of createdUserIds) {
      await safe(`delete user ${userId}`, () =>
        sdkClient.sdk.deleteUser({ id: userId })
      );
    }

    for (const orgId of createdOrgIds) {
      await safe(`disable RBAC org ${orgId}`, () =>
        sdkClient.sdk.updateOrganization(
          {
            input: {
              id: orgId,
              metadata: { features: { enableRBACFeature: 'disabled' } }
            }
          },
          getRequestHeaders(testData.superAdminOption)
        )
      );

      await safe(`delete org ${orgId}`, () =>
        sdkClient.sdk.updateOrganization(
          {
            input: {
              id: orgId,
              status: OrganizationStatus.Deleted
            }
          },
          getRequestHeaders(testData.superAdminOption)
        )
      );
    }
  });

  describe('grantTypes array filter', () => {
    beforeAll(async () => {
      const pkg1Res = await sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            name: `${packageInput.name}-1-${uuid.v4()}`,
            resources: []
          }
        },
        getRequestHeaders(testData.userOption)
      );

      testData.package1Id = _.get(pkg1Res, 'data.packageCreate.id');
      expect(testData.package1Id).toBeDefined();
      createdPackageIds.add(testData.package1Id);

      await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.package1Id,
            status: PackageStatus.Approved
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const pkg2Res = await sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            name: `${packageInput.name}-2-${uuid.v4()}`,
            resources: []
          }
        },
        getRequestHeaders(testData.userOption)
      );

      testData.package2Id = _.get(pkg2Res, 'data.packageCreate.id');
      expect(testData.package2Id).toBeDefined();
      createdPackageIds.add(testData.package2Id);

      await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.package2Id,
            status: PackageStatus.Approved
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.package1Id,
            packageGrants: [
              {
                organizationId: orgResult2.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.superAdminOption)
      );

      await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.package2Id,
            packageGrants: [
              {
                organizationId: orgResult2.id,
                grantType: PackageGrantType.View,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.superAdminOption)
      );

      await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.package1Id,
            packageGrants: [
              {
                organizationId: orgResult3.id,
                grantType: PackageGrantType.View,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.superAdminOption)
      );
    });

    it('should filter packages by single grantType', async () => {
      const result = await sdkClient.sdk.queryPackages(
        {
          packageFilter: {
            grantTypes: [PackageGrantType.Grant],
            isLatest: true
          }
        },
        getRequestHeaders(testData.userOption2)
      );

      const packages = _.get(result, 'data.packages.records');
      expect(packages).toBeDefined();
      expect(packages?.length).toBeGreaterThan(0);

      const findPackage1 = packages?.find(
        (pkg: any) => pkg.id === testData.package1Id
      );
      expect(findPackage1).toBeDefined();
      expect(findPackage1?.grantType).toEqual(PackageGrantType.Grant);

      const findPackage2 = packages?.find(
        (pkg: any) => pkg.id === testData.package2Id
      );
      expect(findPackage2).toBeUndefined();
    });

    it('should filter packages by multiple grantTypes', async () => {
      const result = await sdkClient.sdk.queryPackages(
        {
          packageFilter: {
            grantTypes: [PackageGrantType.Grant, PackageGrantType.View],
            isLatest: true
          }
        },
        getRequestHeaders(testData.userOption2)
      );

      const packages = _.get(result, 'data.packages.records');
      expect(packages).toBeDefined();
      expect(packages?.length).toBeGreaterThan(0);

      const findPackage1 = packages?.find(
        (pkg: any) => pkg.id === testData.package1Id
      );
      expect(findPackage1).toBeDefined();
      expect(findPackage1?.grantType).toEqual(PackageGrantType.Grant);

      const findPackage2 = packages?.find(
        (pkg: any) => pkg.id === testData.package2Id
      );
      expect(findPackage2).toBeDefined();
      expect(findPackage2?.grantType).toEqual(PackageGrantType.View);
    });

    it('should include owned packages when using grantTypes with includeOwned', async () => {
      const result = await sdkClient.sdk.queryPackages(
        {
          packageFilter: {
            grantTypes: [PackageGrantType.View],
            includeOwned: true,
            isLatest: true
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packages = _.get(result, 'data.packages.records');
      expect(packages).toBeDefined();

      const findPackage1 = packages?.find(
        (pkg: any) => pkg.id === testData.package1Id
      );
      expect(findPackage1).toBeDefined();

      const findPackage2 = packages?.find(
        (pkg: any) => pkg.id === testData.package2Id
      );
      expect(findPackage2).toBeDefined();
    });

    it('each package record should include contextual grantType field', async () => {
      const result = await sdkClient.sdk.queryPackages(
        {
          packageFilter: {
            grantTypes: [PackageGrantType.Grant, PackageGrantType.View],
            isLatest: true
          }
        },
        getRequestHeaders(testData.userOption2)
      );

      const packages = _.get(result, 'data.packages.records', []);
      expect(packages).toBeDefined();
      expect(packages?.length).toBeGreaterThan(0);

      for (const pkg of packages) {
        expect(pkg?.grantType).toBeDefined();
        expect([
          PackageGrantType.Grant,
          PackageGrantType.View,
          PackageGrantType.Deny,
          null
        ]).toContain(pkg?.grantType);
      }
    });

    it('superadmin can query packages with grantTypes for specific org', async () => {
      const result = await sdkClient.sdk.queryPackages(
        {
          orgId: orgResult2.id,
          packageFilter: {
            grantTypes: [PackageGrantType.View],
            isLatest: true
          }
        },
        getRequestHeaders(testData.superAdminOption)
      );

      const packages = _.get(result, 'data.packages.records');
      expect(packages).toBeDefined();

      // Should return only package 2 (VIEW to org 2)
      const findPackage2 = packages?.find(
        (pkg: any) => pkg.id === testData.package2Id
      );
      expect(findPackage2).toBeDefined();

      // Should not return package 1 (GRANT to org 2, not VIEW)
      const findPackage1 = packages?.find(
        (pkg: any) => pkg.id === testData.package1Id
      );
      expect(findPackage1).toBeUndefined();
    });
  });
});
