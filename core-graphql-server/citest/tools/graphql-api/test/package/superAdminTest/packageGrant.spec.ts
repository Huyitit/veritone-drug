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
let orgResult: any, orgResult2: any;

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

const orgMarker = (global as any).orgMarker.package;
const testOrgName = `${orgMarker}-${uuid.v4()}`;
const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId): roleId is string => Boolean(roleId));
const engineCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
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
  orgId: '',
  rolesIds: ROLES_IDS
};

const testUserInput2 = {
  name: `${citestMarker}-test-user2-${uuid.v4()}`,
  password: 'TestPassword123',
  orgId: '',
  rolesIds: ROLES_IDS
};

const packageInput = {
  name: `${citestMarker}-package-test-${uuid.v4()}`,
  description: 'Test',
  version: '1.0.0',
  distributionType: '' // This will be set later in the test
};

const schemaInput = {
  $id: 'http://example.com/example.json',
  type: 'object',
  definitions: {},
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    foo: {
      $id: '/properties/foo',
      type: 'string',
      title: 'The Foo Schema',
      default: '',
      examples: ['bar']
    },
    bar: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  }
};

let packages: any[] = [];
const packageIdSet = new Set<string>();
const testData: any = {
  switchPackageId: '',
  privatePackageId: '',
  sharablePackageId: '',
  orglockedPackageId: '',
  regId: '',
  schemaDraftId: '',
  schemaPublishId: '',
  appDraft: {
    id: '',
    name: citestMarker + '-' + uuid.v4()
  },
  superAdminToken: '',
  superAdminOption: {},
  userOption: {},
  userOption2: {},
  userId: ''
};

describe('citest_package: Package type granting logic', () => {
  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(sdkClient.sessionToken).toBeDefined();
    testData.superAdminToken = sdkClient.sessionToken;
    testData.superAdminOption = helpers.requestOptions(
      testData.superAdminToken
    );

    // Set up test organization
    const orgResultRes = await sdkClient.sdk.createOrganization({
      input: {
        ...testOrgInput,
        name: `${orgMarker}-${uuid.v4()}`
      }
    });
    orgResult = _.get(orgResultRes, 'data.createOrganization');
    expect(orgResult).toBeDefined();
    expect(orgResult.id).toBeDefined();

    // Create a second organization for testing package grants. Only change the name of the org
    const orgResult2Res = await sdkClient.sdk.createOrganization({
      input: {
        ...testOrgInput,
        name: `${testOrgInput.name}-2`,
        metadata: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      }
    });
    orgResult2 = _.get(orgResult2Res, 'data.createOrganization');
    expect(orgResult2).toBeDefined();
    expect(orgResult2.id).toBeDefined();

    //Create an admin user in the test organization
    testUserInput.orgId = orgResult.id;
    const userResultRes = await sdkClient.sdk.createUser({
      input: {
        name: testUserInput.name,
        password: testUserInput.password,
        organizationId: testUserInput.orgId,
        roleIds: testUserInput.rolesIds
      }
    });
    const userResult = _.get(userResultRes, 'data.createUser');
    expect(userResult).toBeDefined();
    expect(userResult?.id).toBeDefined();
    testData.userId = userResult?.id;

    //Create a second user in the test organization
    testUserInput2.orgId = orgResult2.id;
    const userResult2Res = await sdkClient.sdk.createUser({
      input: {
        name: testUserInput2.name,
        password: testUserInput2.password,
        organizationId: testUserInput2.orgId,
        roleIds: testUserInput2.rolesIds
      }
    });
    const userResult2 = _.get(userResult2Res, 'data.createUser');
    expect(userResult2).toBeDefined();
    expect(userResult2?.id).toBeDefined();
    testData.userId2 = userResult2?.id;

    //Get user request options
    testData.userOption = await impersonate(
      userResult?.id || '',
      orgResult.guid,
      testData.superAdminToken
    );

    // Get user request options for the second user
    testData.userOption2 = await impersonate(
      userResult2?.id || '',
      orgResult2.guid,
      testData.superAdminToken
    );

    const userInfoRes = await sdkClient.sdk.me(
      {},
      getRequestHeaders(testData.userOption)
    );

    const userOrgInfo = {
      orgGuid: _.get(userInfoRes, 'data.me.organization.guid'),
      orgId: _.get(userInfoRes, 'data.me.organization.id'),
      orgName: _.get(userInfoRes, 'data.me.organization.name'),
      userId: _.get(userInfoRes, 'data.me.id'),
      userName: _.get(userInfoRes, 'data.me.name'),
      isOLPEnabled:
        _.get(
          userInfoRes,
          'data.me.organization.jsondata.features.enableRBACFeature'
        ) === 'enabled'
    };

    await setOLPPermissions(userOrgInfo);

    // re-login to reset permission
    testData.userOption = await impersonate(
      testData.userId,
      userOrgInfo?.orgGuid || '',
      testData.superAdminToken
    );

    // create application draft
    const appDraft = await createDraftApp(
      {
        name: testData.appDraft.name,
        description: testData.appDraft.description
      },
      testData.superAdminOption
    );
    testData.appDraft.id = appDraft?.id;

    // create data Registry
    const regCreateRes = await sdkClient.sdk.createDataRegistry(
      {
        input: {
          name: citestMarker + '-' + uuid.v4(),
          description: 'test',
          source: 'Some url',
          isPublic: true
        }
      },
      getRequestHeaders(testData.userOption)
    );

    const regData = _.get(regCreateRes, 'data.createDataRegistry');
    expect(regData).toBeDefined();
    testData.regId = regData?.id;

    // create schema
    const activeSchemaData = await createAndPublicSchema(
      regData?.id || '',
      testData.userOption
    );
    testData.schemaPublishId = activeSchemaData?.id;

    const schemaData = await createDraftSchema(
      regData?.id || '',
      testData.userOption
    );
    testData.schemaDraftId = schemaData?.id;
  });

  afterAll(async () => {
    // delete any packages left over if an earlier assertion threw before
    // that block's own delete step ran
    for (const id of packageIdSet) {
      await safe(`delete package ${id}`, () =>
        sdkClient.sdk.packageDelete(
          { id },
          getRequestHeaders(testData.userOption)
        )
      );
    }

    // fallback for the engine created in "switch package distributionType"
    if (testData.engineId) {
      await safe(`delete engine ${testData.engineId}`, () =>
        sdkClient.sdk.deleteEngine({ id: testData.engineId })
      );
    }

    // delete schema will also delete registry
    if (testData.schemaDraftId || testData.schemaPublishId) {
      const listSchema = [
        testData.schemaDraftId,
        testData.schemaPublishId
      ].filter((id) => id);
      for (const id of listSchema) {
        await safe(`delete schema ${id}`, () =>
          sdkClient.sdk.updateSchemaState(
            {
              input: {
                id: id,
                status: SchemaStatus.Deleted
              }
            },
            getRequestHeaders(testData.userOption)
          )
        );
      }
    }

    // delete app
    if (testData.appDraft.id) {
      await safe(`delete app ${testData.appDraft.id}`, () =>
        sdkClient.sdk.deleteApplication({ id: testData.appDraft.id })
      );
    }

    // delete user
    if (testData.userId) {
      await safe(`delete user ${testData.userId}`, () =>
        sdkClient.sdk.deleteUser({ id: testData.userId })
      );
    }

    if (testData.userId2) {
      await safe(`delete user ${testData.userId2}`, () =>
        sdkClient.sdk.deleteUser({ id: testData.userId2 })
      );
    }

    // delete org
    if (orgResult.id) {
      await safe(`delete org ${orgResult.id}`, () =>
        sdkClient.sdk.updateOrganization({
          input: {
            id: orgResult.id,
            status: OrganizationStatus.Deleted
          }
        })
      );
    }

    if (orgResult2?.id) {
      await safe(`delete org ${orgResult2.id}`, () =>
        sdkClient.sdk.updateOrganization({
          input: {
            id: orgResult2.id,
            status: OrganizationStatus.Deleted
          }
        })
      );
    }
  });

  describe('Sharable package', () => {
    it('create sharable package should success', async () => {
      const packageCreateRes = await sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            distributionType: EngineDistributionType.Sharable,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageCreateData = _.get(packageCreateRes, 'data.packageCreate');
      expect(packageCreateData).toBeDefined();
      testData.sharablePackageId = packageCreateData?.id;
      packageIdSet.add(testData.sharablePackageId);
      expect(packageCreateData?.distributionType).toEqual(
        EngineDistributionType.Sharable
      );
    });
    it('approve sharable package with draft app should success', async () => {
      const approveRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.sharablePackageId,
            status: PackageStatus.Approved
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const approvePackage = _.get(approveRes, 'data.packageUpdate');
      testData.sharablePackageId = approvePackage?.id;
      packageIdSet.add(testData.sharablePackageId);

      expect(approvePackage).toBeDefined();
      expect(approvePackage?.status).toEqual(PackageStatus.Approved);
    });
    it('publish sharable package with draft app should fail', async () => {
      const publishRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.sharablePackageId,
            status: PackageStatus.Published
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });
    it('update resource should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.sharablePackageId,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Remove
              },
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaDraftId,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      testData.sharablePackageId = packageData?.id;
      packageIdSet.add(testData.sharablePackageId);
    });
    it('publish sharable package with draft schema should fail', async () => {
      const publishRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.sharablePackageId,
            status: PackageStatus.Published
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });
    it('publish sharable package with active schema should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.sharablePackageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaPublishId,
                action: PackageResourceAction.Add
              },
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaDraftId,
                action: PackageResourceAction.Remove
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      testData.sharablePackageId = packageData?.id;
      packageIdSet.add(testData.sharablePackageId);
      const publishRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.sharablePackageId,
            status: PackageStatus.Published
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const publishPackage = _.get(publishRes, 'data.packageUpdate');
      testData.sharablePackageId = publishPackage?.id;
      packageIdSet.add(testData.sharablePackageId);

      expect(publishPackage).toBeDefined();
      expect(publishPackage?.status).toEqual('published');
    });
    it('add active schema to published package should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.sharablePackageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaPublishId,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      expect(packageData).toBeDefined();
      testData.sharablePackageId = packageData?.id;
      packageIdSet.add(testData.sharablePackageId);
    });
    // This will work when VE-14305 is done
    xit('add draft schema to published package should fail', async () => {
      const updateRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.sharablePackageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaDraftId,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(updateRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });
    // This will work when VE-14305 is done
    xit('add draft app to published package should fail', async () => {
      const updateRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.sharablePackageId,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(updateRes).rejects.toThrow();
    });
    it('should not see package in pre-granted target org', async () => {
      const result = await sdkClient.sdk.packageGrants(
        {
          limit: 30,
          offset: 0,
          orgId: orgResult2.id,
          packageFilter: {
            grantType: PackageGrantType.Grant,
            distributionType: EngineDistributionType.Sharable,
            isLatest: true
          }
        },
        getRequestHeaders(testData.userOption2)
      );

      const grantData = _.get(result, 'data.packageGrants');
      expect(grantData?.records.length).toEqual(0);
    });
    it('should not see package in pre-granted calling org through filtered packages query', async () => {
      const result = await sdkClient.sdk.queryPackages(
        {
          packageFilter: {
            grantType: PackageGrantType.Grant,
            isLatest: true
          }
        },
        getRequestHeaders(testData.userOption2)
      );

      const resultData = _.get(result, 'data.packages.records');
      expect(resultData?.length).toEqual(0);
    });
    it('superadmin should not see package in pre-granted target org through filtered packages query', async () => {
      const result = await sdkClient.sdk.queryPackages(
        {
          orgId: orgResult2.id,
          packageFilter: {
            grantType: PackageGrantType.Grant,
            isLatest: true
          }
        },
        getRequestHeaders(testData.superAdminOption)
      );

      const resultData = _.get(result, 'data.packages.records');
      expect(resultData?.length).toEqual(0);
    });
    it('grant sharable package to owner org should success', async () => {
      const grantRes = await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.sharablePackageId,
            packageGrants: [
              {
                organizationId: orgResult.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();

      const grantListRes = await sdkClient.sdk.packageGrants({
        id: testData.sharablePackageId
      });

      const listGrant = _.get(grantListRes, 'data.packageGrants.records');
      const grant = listGrant?.find(
        (rec: any) => rec.organization.id === orgResult.id
      );
      expect(grant).toBeDefined();
    });
    // This will work when VE-14036 is done
    xit('grant active sharable package to deleted org should fail', async () => {
      const deleteOrgRes = await sdkClient.sdk.organizations({
        limit: 1,
        status: OrganizationStatus.Deleted
      });

      const orgData = _.get(deleteOrgRes, 'data.organizations.records[0]');
      expect(orgData).toBeDefined();

      const grantRes = sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.sharablePackageId,
            packageGrants: [
              {
                organizationId: orgData?.id || '',
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(grantRes).rejects.toThrow();
    });
    it('grant sharable package to other org should success', async () => {
      const grantRes = await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.sharablePackageId,
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

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();

      const grantListRes = await sdkClient.sdk.packageGrants({
        id: testData.sharablePackageId
      });

      const listGrant = _.get(grantListRes, 'data.packageGrants.records');
      const grant = listGrant?.find(
        (rec: any) => rec.organization.id === orgResult2.id
      );
      expect(grant).toBeDefined();
    });
    it('should see package in granted org', async () => {
      const result = await sdkClient.sdk.packageGrants(
        {
          limit: 30,
          offset: 0,
          orgId: orgResult2.id,
          packageFilter: {
            grantType: PackageGrantType.Grant,
            distributionType: EngineDistributionType.Sharable,
            isLatest: true
          }
        },
        getRequestHeaders(testData.userOption2)
      );

      const grantData = _.get(result, 'data.packageGrants');
      expect(grantData?.records.length).toBeGreaterThan(0);
      expect(grantData?.records?.[0]?.package.id).toBe(
        testData.sharablePackageId
      );
    });
    it('should see package in granted org through filtered packages query', async () => {
      const result = await sdkClient.sdk.queryPackages(
        {
          packageFilter: {
            grantType: PackageGrantType.Grant,
            isLatest: true
          }
        },
        getRequestHeaders(testData.userOption2)
      );

      const resultData = _.get(result, 'data.packages.records');
      expect(resultData?.length).toEqual(1);
      expect(resultData?.[0]?.id).toBe(testData.sharablePackageId);
    });
    it('superadmin should see package in granted target org through filtered packages query', async () => {
      const result = await sdkClient.sdk.queryPackages(
        {
          orgId: orgResult2.id,
          packageFilter: {
            grantType: PackageGrantType.Grant,
            isLatest: true
          }
        },
        getRequestHeaders(testData.superAdminOption)
      );

      const resultData = _.get(result, 'data.packages.records');
      expect(resultData?.length).toEqual(1);
      expect(resultData?.[0]?.id).toBe(testData.sharablePackageId);
    });
    xit('disable sharable package will also remove package grant', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.sharablePackageId,
            status: PackageStatus.Deactivated
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      testData.sharablePackageId = packageData?.id;
      packageIdSet.add(testData.sharablePackageId);
      expect(packageData?.status).toEqual('deactivated');

      const grantListRes = await sdkClient.sdk.packageGrants({
        id: testData.sharablePackageId
      });

      const listGrant = _.get(grantListRes, 'data.packageGrants.records');
      expect(listGrant?.length).toEqual(0);
    });
    it('grant deactivated sharable package for own org should success', async () => {
      const grantRes = await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.sharablePackageId,
            packageGrants: [
              {
                organizationId: orgResult.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
    });
    it('delete active sharable package should success', async () => {
      const deletePackageRes = await sdkClient.sdk.packageDelete(
        { id: testData.sharablePackageId },
        getRequestHeaders(testData.userOption)
      );

      const deletePackage = _.get(deletePackageRes, 'data.packageDelete');
      expect(deletePackage).toBeDefined();
      expect(deletePackage?.success).toBe(true);
    });
    it('delete package should success', async () => {
      const deletePackageRes = await sdkClient.sdk.packageDelete(
        { id: testData.sharablePackageId },
        getRequestHeaders(testData.userOption)
      );

      const deletePackage = _.get(deletePackageRes, 'data.packageDelete');
      expect(deletePackage).toBeDefined();
      expect(deletePackage?.success).toBe(true);
      packageIdSet.delete(testData.sharablePackageId);
    });
  });

  describe('Private package', () => {
    it('create private package should success', async () => {
      const packageCreateRes = await sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            distributionType: EngineDistributionType.Private,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageCreateData = _.get(packageCreateRes, 'data.packageCreate');
      expect(packageCreateData).toBeDefined();
      testData.privatePackageId = packageCreateData?.id;
      packageIdSet.add(testData.privatePackageId);
      expect(packageCreateData?.distributionType).toEqual(
        EngineDistributionType.Private
      );
    });

    it('approve private package with draft app should success', async () => {
      const approveRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            status: PackageStatus.Approved
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const approvePackage = _.get(approveRes, 'data.packageUpdate');
      testData.privatePackageId = approvePackage?.id;
      packageIdSet.add(testData.privatePackageId);

      expect(approvePackage).toBeDefined();
      expect(approvePackage?.status).toEqual('approved');
    });

    it('publish private package with draft app should fail', async () => {
      const publishRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            status: PackageStatus.Published
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    it('update resource should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Remove
              },
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaDraftId,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      testData.privatePackageId = packageData?.id;
      packageIdSet.add(testData.privatePackageId);
    });

    it('publish private package with draft schema should fail', async () => {
      const publishRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            status: PackageStatus.Published
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    it('publish private package with active schema should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaPublishId,
                action: PackageResourceAction.Add
              },
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaDraftId,
                action: PackageResourceAction.Remove
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      testData.privatePackageId = packageData?.id;
      packageIdSet.add(testData.privatePackageId);
      const publishRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            status: PackageStatus.Published
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const publishPackage = _.get(publishRes, 'data.packageUpdate');
      testData.privatePackageId = publishPackage?.id;
      packageIdSet.add(testData.privatePackageId);

      expect(publishPackage).toBeDefined();
      expect(publishPackage?.status).toEqual('published');
    });

    it('add active schema to published package should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaPublishId,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      expect(packageData).toBeDefined();
      testData.privatePackageId = packageData?.id;
      packageIdSet.add(testData.privatePackageId);
    });

    // This will work when VE-14305 is done
    xit('add draft schema to published package should fail', async () => {
      const updateRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaDraftId,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(updateRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    // This will work when VE-14305 is done
    xit('add draft app to published package should fail', async () => {
      const updateRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(updateRes).rejects.toThrow();
    });

    it('grant private package to owner org should success', async () => {
      const grantRes = await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.privatePackageId,
            packageGrants: [
              {
                organizationId: orgResult.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();

      const grantListRes = await sdkClient.sdk.packageGrants({
        id: testData.privatePackageId
      });

      const listGrant = _.get(grantListRes, 'data.packageGrants.records');
      const grant = listGrant?.find(
        (rec: any) => rec.organization.id === orgResult.id
      );
      expect(grant).toBeDefined();
    });

    // This will work when VE-14036 is done
    xit('grant active private package to deleted org should fail', async () => {
      const deleteOrgRes = await sdkClient.sdk.organizations({
        limit: 1,
        status: OrganizationStatus.Deleted
      });

      const orgData = _.get(deleteOrgRes, 'data.organizations.records[0]');
      expect(orgData).toBeDefined();

      const grantRes = sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.privatePackageId,
            packageGrants: [
              {
                organizationId: orgData?.id || '',
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(grantRes).rejects.toThrow();
    });

    // This will work when VE-14036 is done
    xit('grant private package to other org should fail', async () => {
      const activeOrgRes = await sdkClient.sdk.organizations({
        limit: 1,
        status: OrganizationStatus.Active
      });

      const orgData = _.get(activeOrgRes, 'data.organizations.records[0]');
      expect(orgData).toBeDefined();
      expect(orgData?.id).not.toEqual(orgResult.id);

      const grantRes = sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.privatePackageId,
            packageGrants: [
              {
                organizationId: orgData?.id || '',
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(grantRes).rejects.toThrow();
    });

    //TODO: Unskip when VE-14036 is done
    xit('disable private package will also remove package grant', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            status: PackageStatus.Deactivated
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      testData.privatePackageId = packageData?.id;
      packageIdSet.add(testData.privatePackageId);
      expect(packageData?.status).toEqual('deactivated');

      const grantListRes = await sdkClient.sdk.packageGrants({
        id: testData.privatePackageId
      });

      const listGrant = _.get(grantListRes, 'data.packageGrants.records');
      expect(listGrant?.length).toEqual(0);
    });

    it('disable private package', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            status: PackageStatus.Deactivated
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      testData.privatePackageId = packageData?.id;
      packageIdSet.add(testData.privatePackageId);
      expect(packageData?.status).toEqual('deactivated');

      const grantListRes = await sdkClient.sdk.packageGrants({
        id: testData.privatePackageId
      });

      const listGrant = _.get(grantListRes, 'data.packageGrants.records');
      expect(listGrant?.length).toEqual(1);
      expect(listGrant?.[0]?.organization.id).toEqual(orgResult.id);
    });

    // This will work when VE-14036 is done
    xit('grant deactivated private package for own org should fail', async () => {
      const grantRes = sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.privatePackageId,
            packageGrants: [
              {
                organizationId: orgResult.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(grantRes).rejects.toThrow();
    });

    it('active private package should success', async () => {
      const publishRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.privatePackageId,
            status: PackageStatus.Published
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const publishPackage = _.get(publishRes, 'data.packageUpdate');
      testData.privatePackageId = publishPackage?.id;
      packageIdSet.add(testData.privatePackageId);
      expect(publishPackage).toBeDefined();
      expect(publishPackage?.status).toEqual('published');
    });

    it('delete active private package should success', async () => {
      const deletePackageRes = await sdkClient.sdk.packageDelete(
        { id: testData.privatePackageId },
        getRequestHeaders(testData.userOption)
      );

      const deletePackage = _.get(deletePackageRes, 'data.packageDelete');
      expect(deletePackage).toBeDefined();
      expect(deletePackage?.success).toBe(true);
      packageIdSet.delete(testData.privatePackageId);
    });
  });

  describe('Org-locked package', () => {
    it('create org-locked package should success', async () => {
      const packageCreateRes = await sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            distributionType: EngineDistributionType.OrgLocked,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageCreateData = _.get(packageCreateRes, 'data.packageCreate');
      expect(packageCreateData).toBeDefined();
      testData.orglockedPackageId = packageCreateData?.id;
      packageIdSet.add(testData.orglockedPackageId);
      expect(packageCreateData?.distributionType).toEqual(
        EngineDistributionType.OrgLocked
      );
    });

    it('approve org-locked package with draft app should success', async () => {
      const approveRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            status: PackageStatus.Approved
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const approvePackage = _.get(approveRes, 'data.packageUpdate');
      testData.orglockedPackageId = approvePackage?.id;
      packageIdSet.add(testData.orglockedPackageId);

      expect(approvePackage).toBeDefined();
      expect(approvePackage?.status).toEqual('approved');
    });

    it('publish org-locked package with draft app should fail', async () => {
      const publishRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            status: PackageStatus.Published
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    it('update resource should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Remove
              },
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaDraftId,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      testData.orglockedPackageId = packageData?.id;
      packageIdSet.add(testData.orglockedPackageId);
    });

    it('publish org-locked package with draft schema should fail', async () => {
      const publishRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            status: PackageStatus.Published
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    it('publish org-locked package with active schema should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaPublishId,
                action: PackageResourceAction.Add
              },
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaDraftId,
                action: PackageResourceAction.Remove
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      testData.orglockedPackageId = packageData?.id;
      packageIdSet.add(testData.orglockedPackageId);
      const publishRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            status: PackageStatus.Published
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const publishPackage = _.get(publishRes, 'data.packageUpdate');
      testData.orglockedPackageId = publishPackage?.id;
      packageIdSet.add(testData.orglockedPackageId);

      expect(publishPackage).toBeDefined();
      expect(publishPackage?.status).toEqual('published');
    });

    it('add active schema to published org-locked package should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaPublishId,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      expect(packageData).toBeDefined();
      testData.orglockedPackageId = packageData?.id;
      packageIdSet.add(testData.orglockedPackageId);
    });

    //TODO: unskipped when VE-14305 is done
    xit('add draft schema to published package should fail', async () => {
      const updateRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: testData.schemaDraftId,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(updateRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    //TODO: Unskip when VE-14305 is done
    xit('add draft app to published package should fail', async () => {
      const updateRes = sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(updateRes).rejects.toThrow();
    });

    it('grant org-locked package to owner org should success', async () => {
      const grantRes = await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.orglockedPackageId,
            packageGrants: [
              {
                organizationId: orgResult.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();

      const grantListRes = await sdkClient.sdk.packageGrants({
        id: testData.orglockedPackageId
      });

      const listGrant = _.get(grantListRes, 'data.packageGrants.records');
      const grant = listGrant?.find(
        (rec: any) => rec.organization.id === orgResult.id
      );
      expect(grant).toBeDefined();
    });

    // This will work when VE-14036 is done
    xit('grant active sharable package to deleted org should fail', async () => {
      const deleteOrgRes = await sdkClient.sdk.organizations({
        limit: 1,
        status: OrganizationStatus.Deleted
      });

      const orgData = _.get(deleteOrgRes, 'data.organizations.records[0]');
      expect(orgData).toBeDefined();

      const grantRes = sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.orglockedPackageId,
            packageGrants: [
              {
                organizationId: orgData?.id || '',
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(grantRes).rejects.toThrow();
    });

    // This will work when VE-14036 is done
    xit('grant sharable package to other org should fail', async () => {
      const activeOrgRes = await sdkClient.sdk.organizations({
        limit: 1,
        status: OrganizationStatus.Active
      });

      const orgData = _.get(activeOrgRes, 'data.organizations.records[0]');
      expect(orgData).toBeDefined();
      expect(orgData?.id).not.toEqual(orgResult.id);

      const grantRes = sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.orglockedPackageId,
            packageGrants: [
              {
                organizationId: orgData?.id || '',
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(grantRes).rejects.toThrow();
    });

    //TODO: Unskip when VE-14036 is done
    xit('disable org-locked package will also remove package grant', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            status: PackageStatus.Deactivated
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      testData.orglockedPackageId = packageData?.id;
      packageIdSet.add(testData.orglockedPackageId);
      expect(packageData?.status).toEqual('deactivated');

      const grantListRes = await sdkClient.sdk.packageGrants({
        id: testData.orglockedPackageId
      });

      const listGrant = _.get(grantListRes, 'data.packageGrants.records');
      expect(listGrant?.length).toEqual(0);
    });

    it('disable org-locked package', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            status: PackageStatus.Deactivated
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      testData.orglockedPackageId = packageData?.id;
      packageIdSet.add(testData.orglockedPackageId);
      expect(packageData?.status).toEqual('deactivated');

      const grantListRes = await sdkClient.sdk.packageGrants({
        id: testData.orglockedPackageId
      });

      const listGrant = _.get(grantListRes, 'data.packageGrants.records');
      expect(listGrant?.length).toEqual(1);
      expect(listGrant?.[0]?.organization.id).toEqual(orgResult.id);
    });

    //TODO:Unskip when VE-14036 is done
    xit('grant deactivated org-locked package for own org should fail', async () => {
      const grantRes = sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.orglockedPackageId,
            packageGrants: [
              {
                organizationId: orgResult.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      await expect(grantRes).rejects.toThrow();
    });

    it('active org-locked package should success', async () => {
      const publishRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.orglockedPackageId,
            status: PackageStatus.Published
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const publishPackage = _.get(publishRes, 'data.packageUpdate');
      testData.orglockedPackageId = publishPackage?.id;
      packageIdSet.add(testData.orglockedPackageId);
      expect(publishPackage).toBeDefined();
      expect(publishPackage?.status).toEqual('published');
    });

    it('delete active org-locked package should success', async () => {
      const deletePackageRes = await sdkClient.sdk.packageDelete(
        { id: testData.orglockedPackageId },
        getRequestHeaders(testData.userOption)
      );

      const deletePackage = _.get(deletePackageRes, 'data.packageDelete');
      expect(deletePackage).toBeDefined();
      expect(deletePackage?.success).toBe(true);
      packageIdSet.delete(testData.orglockedPackageId);
    });
  });

  describe('switch package distributionType', () => {
    beforeAll(async () => {
      const engine = await sdkClient.sdk.createEngine(
        {
          input: {
            name: citestMarker + '-engine-' + uuid.v4(),
            categoryId: engineCategoryId,
            deploymentModel: DeploymentModel.FullyNetworkIsolated
          }
        },
        getRequestHeaders(testData.userOption)
      );

      testData.engineId = _.get(engine, 'data.createEngine.id');

      const engineBuild = await sdkClient.sdk.createEngineBuild(
        {
          input: {
            engineId: testData.engineId,
            taskRuntime: {
              nodeRed: true
            },
            manifest: {
              runtime: 'NodeRed'
            }
          }
        },
        getRequestHeaders(testData.userOption)
      );

      testData.engineBuildId = _.get(engineBuild, 'data.createEngineBuild.id');

      // publish engine, engineBuild
      const buildEngineActionList = [
        [BuildUpdateAction.Submit, 'approved'],
        [BuildUpdateAction.Deploy, 'deployed']
      ];

      for (let action of buildEngineActionList) {
        const updateBuildRes = await sdkClient.sdk.updateEngineBuild(
          {
            input: {
              id: testData.engineBuildId,
              engineId: testData.engineId,
              action: action[0] as BuildUpdateAction
            }
          },
          getRequestHeaders(testData.userOption)
        );

        const updateBuild = _.get(updateBuildRes, 'data.updateEngineBuild');
        expect(updateBuild?.id).toEqual(testData.engineBuildId);
        expect(updateBuild?.status).toEqual(action[1]);
      }
    });

    it('Org1 Create public package with engine and engineBuild should success', async () => {
      const packageCreateRes = await sdkClient.sdk.packageCreate(
        {
          input: {
            ...packageInput,
            distributionType: EngineDistributionType.Public,
            resources: [
              {
                resourceType: PackageResourceType.Engine,
                resourceId: testData.engineId,
                action: PackageResourceAction.Add
              },
              {
                resourceType: PackageResourceType.EngineBuild,
                resourceId: testData.engineBuildId,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageCreateData = _.get(packageCreateRes, 'data.packageCreate');
      expect(packageCreateData).toBeDefined();
      testData.switchPackageId = packageCreateData?.id;
      packageIdSet.add(testData.switchPackageId);
      expect(packageCreateData?.distributionType).toEqual(
        EngineDistributionType.Public
      );
    });

    it('Org2 get public package should success', async () => {
      const packageCreateRes = await sdkClient.sdk.packages(
        { id: testData.switchPackageId },
        getRequestHeaders(testData.userOption2)
      );

      const packageCreateData = _.get(
        packageCreateRes,
        'data.packages.records'
      );
      expect(packageCreateData).toBeDefined();
      const foundPackage = packageCreateData?.find((pkg: any) => {
        return pkg.id === testData.switchPackageId;
      });
      expect(foundPackage).toBeDefined();
    });

    it('change distribution type to share-able should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.switchPackageId,
            distributionType: EngineDistributionType.Sharable
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      expect(packageData).toBeDefined();
      expect(packageData?.distributionType).toEqual(
        EngineDistributionType.Sharable
      );
      testData.switchPackageId = packageData?.id;
      packageIdSet.add(testData.switchPackageId);
    });

    it('Org2 get share-able package should fail', async () => {
      const packageCreateRes = await sdkClient.sdk.packages(
        { id: testData.switchPackageId },
        getRequestHeaders(testData.userOption2)
      );

      const packageCreateData = _.get(
        packageCreateRes,
        'data.packages.records'
      );
      expect(packageCreateData?.length).toEqual(0);
    });

    it('grant share-able package to Org2 should success', async () => {
      const grantRes = await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.switchPackageId,
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

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('Org2 get share-able package should success', async () => {
      const packageCreateRes = await sdkClient.sdk.packages(
        { id: testData.switchPackageId },
        getRequestHeaders(testData.userOption2)
      );

      const packageCreateData = _.get(
        packageCreateRes,
        'data.packages.records'
      );
      expect(packageCreateData).toBeDefined();
      const foundPackage = packageCreateData?.find((pkg: any) => {
        return pkg.id === testData.switchPackageId;
      });
      expect(foundPackage).toBeDefined();
    });

    it('Revoke package access from Org2 should success', async () => {
      const grantRes = await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.switchPackageId,
            packageGrants: [
              {
                organizationId: orgResult2.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Remove
              }
            ]
          }
        },
        getRequestHeaders(testData.superAdminOption)
      );

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('change distribution type to private should success', async () => {
      const updateRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.switchPackageId,
            distributionType: EngineDistributionType.Private
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(updateRes, 'data.packageUpdate');
      expect(packageData).toBeDefined();
      expect(packageData?.distributionType).toEqual(
        EngineDistributionType.Private
      );
      testData.switchPackageId = packageData?.id;
      packageIdSet.add(testData.switchPackageId);
    });

    xit('grant package access to org2 should fail', async () => {
      const grantRes = sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.switchPackageId,
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

      await expect(grantRes).rejects.toThrow();
    });

    it('Org2 get private package should fail', async () => {
      const packageRes = await sdkClient.sdk.packages(
        { id: testData.switchPackageId },
        getRequestHeaders(testData.userOption2)
      );

      const packageCreateData = _.get(packageRes, 'data.packages.records');
      expect(packageCreateData?.length).toEqual(0);
    });

    it('delete package and resources', async () => {
      await safe(`delete engine ${testData.engineId}`, () =>
        sdkClient.sdk.deleteEngine(
          { id: testData.engineId },
          getRequestHeaders(testData.userOption)
        )
      );
      testData.engineId = '';

      const deletePackageRes = await sdkClient.sdk.packageDelete(
        { id: testData.switchPackageId },
        getRequestHeaders(testData.userOption)
      );

      const deletePackage = _.get(deletePackageRes, 'data.packageDelete');
      expect(deletePackage).toBeDefined();
      expect(deletePackage?.success).toBe(true);
      packageIdSet.delete(testData.switchPackageId);
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

  async function createDraftSchema(regId: string, userOption: any) {
    const createSchemaRes = await sdkClient.sdk.upsertSchemaDraft(
      {
        input: { schema: schemaInput, dataRegistryId: regId }
      },
      getRequestHeaders(userOption)
    );

    return _.get(createSchemaRes, 'data.upsertSchemaDraft');
  }

  async function createAndPublicSchema(regId: string, userOption: any) {
    const schema = await createDraftSchema(regId, userOption);
    const UpdateSchemaRes = await sdkClient.sdk.updateSchemaState(
      {
        input: {
          id: schema?.id || '',
          status: SchemaStatus.Published
        }
      },
      getRequestHeaders(userOption)
    );

    return _.get(UpdateSchemaRes, 'data.updateSchemaState');
  }

  async function setOLPPermissions(orgInfo: any) {
    const olpObjectIds: any = {};

    const permissions = [
      AuthPermissionType.AiwareSchemaCreate,
      AuthPermissionType.DeveloperEngineCreate,
      AuthPermissionType.DeveloperEngineRead,
      AuthPermissionType.DeveloperEngineUpdate,
      AuthPermissionType.DeveloperEngineEnable,
      AuthPermissionType.DeveloperEngineDelete,
      AuthPermissionType.DeveloperBuildCreate,
      AuthPermissionType.DeveloperBuildUpdate
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
    const authGroup = _.get(result, 'data.authGroupCreate');
    expect(authGroup.id).toBeDefined();
    testData.authGroupId = _.get(authGroup, 'id');
    olpObjectIds.authGroupId = _.get(authGroup, 'id');

    const permissionSetRes = await sdkClient.sdk.authPermissionSetCreate({
      input: {
        name: `${citestMarker}-permission-${uuid.v4()}`,
        description: 'desc',
        organizationID: orgInfo.orgId,
        permissions: permissions
      }
    });

    const permissionSet = _.get(
      permissionSetRes,
      'data.authPermissionSetCreate'
    );
    expect(permissionSet.id).toBeDefined();
    testData.authPermissionId = _.get(permissionSet, 'id');
    olpObjectIds.permissionId = _.get(permissionSet, 'id');

    const addAceRes = await sdkClient.sdk.addACEsToResources({
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

    const addAceData = _.get(addAceRes, 'data.addACEsToResources');
    expect(addAceData.records.length).toBeGreaterThan(0);
    olpObjectIds.aceOrgRecords = addAceData.records;

    return olpObjectIds;
  }

  async function createDraftApp(input: any, adminOptions: any) {
    const createDraftAppRes = await sdkClient.sdk.createApplication(
      {
        input: {
          ...input,
          url: 'www.example.com',
          oauth2RedirectUrls: 'www.example.com/callback',
          checkPermissions: false,
          iconUrl: 'http://abc.com/link-icon.png'
        }
      },
      getRequestHeaders(adminOptions)
    );

    const appDraft = _.get(createDraftAppRes, 'data.createApplication');
    expect(appDraft?.id).toBeDefined();
    return appDraft;
  }
});
