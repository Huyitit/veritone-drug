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
  AuthGroupMemberType,
  AuthObjectClass,
  AuthPermissionType,
  AuthResourceType,
  DeploymentModel,
  EngineDistributionType,
  OrganizationStatus,
  OrganizationType,
  PackageGrantAction,
  PackageGrantType,
  PackageResourceAction,
  PackageResourceType
} from '../../../../src/gql';
import { safe } from '../../../../src/helpers/commonHelper';

const config = helpers.config;
const env = config.env;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const orgMarker =
  (global as any)?.orgMarker?.package || `${citestMarker}-package-org`;
const testOrgName = `${orgMarker}-olp-org-${uuid.v4()}`;
const isDesktopAppEnabled = (global as any)?.enableDefaultDesktopApp ?? true;

const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

const ROLES_IDS: string[] = [
  isDesktopAppEnabled ? '' : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
].filter((roleId): roleId is string => Boolean(roleId));

let sdkClient: GraphqlClient;
let org1Result: any;
let org2Result: any;

const testUserInput = {
  name: `${citestMarker}-test-user-${uuid.v4()}`,
  password: 'TestPassword123',
  organizationId: '',
  roleIds: ROLES_IDS
};

const testData: any = {
  superAdminToken: '',
  superAdminOption: {},
  userOption: {},
  userId: '',
  authGroupId: '',
  authPermissionId: '',
  innerPermissionSetId: '',
  applicationId: '',
  packageId: ''
};

describe('citest_package: Package granting logic in multi orgs scenario', () => {
  let userOrgInfo = {
    orgGuid: '',
    orgId: '',
    orgName: '',
    userId: '',
    userName: '',
    isOLPEnabled: false
  };

  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(sdkClient.sessionToken).toBeDefined();
    testData.superAdminToken = sdkClient.sessionToken;
    testData.superAdminOption = helpers.requestOptions(
      testData.superAdminToken
    );

    // Legacy gqlClient setup
    const org1Res = await sdkClient.sdk.createOrganization({
      input: {
        name: `${testOrgName}-1`,
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
      }
    });

    org1Result = _.get(org1Res, 'data.createOrganization');
    expect(org1Result).toBeDefined();
    expect(org1Result.id).toBeDefined();

    const org2Res = await sdkClient.sdk.createOrganization({
      input: {
        name: `${testOrgName}-2`,
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
      }
    });
    org2Result = _.get(org2Res, 'data.createOrganization');
    expect(org2Result).toBeDefined();
    expect(org2Result.id).toBeDefined();

    testUserInput.organizationId = org1Result.id;
    const userRes = await sdkClient.sdk.createUser({
      input: testUserInput
    });
    // Legacy createUser helper
    const userResult = _.get(userRes, 'data.createUser');
    expect(userResult).toBeDefined();
    expect(userResult?.id).toBeDefined();
    testData.userId = userResult?.id;

    testData.userOption = await impersonate(
      userResult?.id!,
      org1Result.guid,
      testData.superAdminToken
    );

    const userInfoRes = await sdkClient.sdk.me(
      {},
      getRequestHeaders(testData.userOption)
    );

    userOrgInfo = {
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

    await setOLPPermissions(userOrgInfo);

    await helpers.sleep(5000);

    testData.userOption = await impersonate(
      testData.userId,
      userOrgInfo.orgGuid!,
      testData.superAdminToken
    );
  });

  afterAll(async () => {
    if (testData.applicationId) {
      await safe('delete application', async () =>
        sdkClient.sdk.deleteApplication(
          { id: testData.applicationId },
          getRequestHeaders(testData.userOption)
        )
      );
    }

    if (testData.packageId) {
      await safe('delete package', async () =>
        sdkClient.sdk.packageDelete(
          { id: testData.packageId },
          getRequestHeaders(testData.userOption)
        )
      );
    }

    if (testData.innerPermissionSetId) {
      // delete permission set created by user before delete user
      await safe('delete inner permission set', async () =>
        sdkClient.sdk.authPermissionSetDelete(
          { id: testData.innerPermissionSetId },
          getRequestHeaders(testData.userOption)
        )
      );
    }

    if (testData.userId) {
      await safe('delete user', async () =>
        sdkClient.sdk.deleteUser({
          id: testData.userId
        })
      );
    }

    if (testData.authGroupId) {
      await safe('delete auth group', () =>
        sdkClient.sdk.authGroupDelete(
          { id: testData.authGroupId, ownerOrganization: org1Result.guid },
          getRequestHeaders(testData.superAdminOption)
        )
      );
    }

    if (testData.authPermissionId) {
      await safe('delete auth permission', () =>
        sdkClient.sdk.authPermissionSetDelete(
          { id: testData.authPermissionId, ownerOrganization: org1Result.guid },
          getRequestHeaders(testData.superAdminOption)
        )
      );
    }

    if (org1Result?.id) {
      await safe('disable RBAC and delete org1', () =>
        sdkClient.sdk.updateOrganization({
          input: {
            id: org1Result.id,
            metadata: {
              features: {
                enableRBACFeature: 'disabled'
              }
            },
            status: OrganizationStatus.Deleted
          }
        })
      );
    }

    if (org2Result?.id) {
      await safe('disable RBAC and delete org2', () =>
        sdkClient.sdk.updateOrganization({
          input: {
            id: org2Result.id,
            metadata: {
              features: {
                enableRBACFeature: 'disabled'
              }
            },
            status: OrganizationStatus.Deleted
          }
        })
      );
    }
  });

  describe('Setup multi orgs scenario for admin user', () => {
    const applicationRoleId = uuid.v4();
    let switchedOptions: any;

    it('should add admin user to org_2', async () => {
      const result = await sdkClient.sdk.addUserToOrganization(
        {
          userId: testData.userId,
          organizationGuid: org2Result.guid,
          roleIds: ROLES_IDS
        },
        getRequestHeaders(testData.superAdminOption)
      );
      const addUserResult = _.get(result, 'data.addUserToOrganization');
      expect(addUserResult).toBeDefined();
      expect(addUserResult?.id).toBeDefined();
      expect(addUserResult?.organizationGuid).toBeDefined();
    });

    it('should create permission set for admin to be able to create application', async () => {
      const result = await sdkClient.sdk.authPermissionSetCreate(
        {
          input: {
            name: `${citestMarker}-permSet-${uuid.v4()}`,
            description: 'desc',
            permissions: [
              AuthPermissionType.AiwareSchemaCreate,
              AuthPermissionType.DeveloperEngineCreate,
              AuthPermissionType.DeveloperEngineRead,
              AuthPermissionType.DeveloperEngineUpdate,
              AuthPermissionType.DeveloperEngineEnable,
              AuthPermissionType.DeveloperEngineDelete,
              AuthPermissionType.DeveloperBuildCreate,
              AuthPermissionType.DeveloperBuildUpdate
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const permissionSet = _.get(result, 'data.authPermissionSetCreate');
      expect(permissionSet).toBeDefined();
      expect(permissionSet.id).toBeDefined();
      expect(permissionSet.permissions).toContain(
        AuthPermissionType.DeveloperEngineCreate
      );
      testData.innerPermissionSetId = permissionSet.id;
    });

    it('should add permission set for admin user to create application', async () => {
      const result = await sdkClient.sdk.addACEsToResources(
        {
          ownerOrganization: org1Result.guid,
          ids: [org1Result.id],
          resourceType: AuthResourceType.Organization,
          entries: [
            {
              member: {
                id: testData.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: testData.innerPermissionSetId
            }
          ]
        },
        getRequestHeaders(testData.superAdminOption)
      );
      expect(_.get(result, 'data.addACEsToResources')).toBeDefined();

      await helpers.sleep(5000);
    });

    it('should create application', async () => {
      const timestamp = Date.now();

      const result = await sdkClient.sdk.createApplication(
        {
          input: {
            name: `${citestMarker}-app-${timestamp}`,
            deploymentModel: DeploymentModel.FullyNetworkIsolated,
            description: 'test application',
            iconUrl: 'imageUrl',
            iconSvg: 'imageSvg',
            url: 'https://test.com/app',
            checkPermissions: true,
            applicationRoles: [
              {
                id: applicationRoleId,
                name: `${citestMarker}-app-role-${timestamp}`,
                description: 'ci-aiware-test-app-role',
                isPrivate: false,
                isAppEventRole: false,
                permissions: [AuthPermissionType.DeveloperEngineRead]
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const createDraftAppRes = _.get(result, 'data.createApplication');
      expect(createDraftAppRes).toBeDefined();
      expect(createDraftAppRes?.iconUrl).toBeDefined();
      expect(createDraftAppRes?.iconSvg).toBeDefined();
      expect(createDraftAppRes?.id).toBeDefined();
      testData.applicationId = createDraftAppRes?.id;
    });

    it('should create package', async () => {
      const result = await sdkClient.sdk.packageCreate(
        {
          input: {
            name: `${citestMarker}-test_package-${uuid.v4()}`,
            version: '1.0',
            distributionType: EngineDistributionType.Public,
            primaryResourceId: testData.applicationId,
            resources: [
              {
                resourceId: testData.applicationId,
                resourceType: PackageResourceType.Application,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const packageData = _.get(result, 'data.packageCreate');
      expect(packageData).toBeDefined();
      expect(packageData?.id).toBeDefined();
      testData.packageId = packageData?.id;
    });

    it('should grant package to org_1 with GRANT grantType', async () => {
      const result = await sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId: testData.packageId,
          packageGrants: [
            {
              organizationId: org1Result.id,
              grantType: PackageGrantType.Grant,
              action: PackageGrantAction.Add
            }
          ]
        },
        getRequestHeaders(testData.userOption)
      );

      const grantData = _.get(result, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
      expect(grantData?.id).toBeDefined();
    });

    it('should get appRole permissionSet', async () => {
      const result = await sdkClient.sdk.authPermissionSets(
        {
          ownerOrganization: org1Result.guid,
          roleID: applicationRoleId,
          authClass: [AuthObjectClass.Application]
        },
        getRequestHeaders(testData.superAdminOption)
      );

      const permissionSets = _.get(result, 'data.authPermissionSets');
      expect(permissionSets).toBeDefined();
      expect(permissionSets.records).toBeDefined();
      expect(permissionSets.records.length).toBeGreaterThan(0);
    });

    it('should login org admin to org_2', async () => {
      const result = await sdkClient.sdk.userLogin(
        {
          input: {
            userName: testUserInput.name,
            password: 'TestPassword123',
            organizationGuid: org2Result.guid
          }
        },
        getRequestHeaders(testData.userOption)
      );

      const loginData = _.get(result, 'data.userLogin');
      expect(loginData).toBeDefined();
      expect(loginData?.organization).toBeDefined();
      expect(loginData?.organization?.guid).toEqual(org2Result.guid);
      expect(loginData?.token).toBeDefined();
      switchedOptions = helpers.requestOptions(loginData?.token!);
    });

    // In order to reproduce VE-14390 issue, we need to consequentially grant the package to org_2 with different grant types in 3 steps
    it('should grant package to org_2 with GRANT grantType', async () => {
      const result = await sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId: testData.packageId,
          packageGrants: [
            {
              organizationId: org2Result.id,
              grantType: PackageGrantType.Grant,
              action: PackageGrantAction.Add
            }
          ]
        },
        getRequestHeaders(switchedOptions)
      );
      const grantData = _.get(result, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
      expect(grantData?.id).toBeDefined();
    });

    it('should grant package to org_2 with VIEW grantType', async () => {
      const result = await sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId: testData.packageId,
          packageGrants: [
            {
              organizationId: org2Result.id,
              grantType: PackageGrantType.View,
              action: PackageGrantAction.Add
            }
          ]
        },
        getRequestHeaders(switchedOptions)
      );
      const grantData = _.get(result, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
      expect(grantData?.id).toBeDefined();
    });

    it('should grant package to org_2 with GRANT grantType', async () => {
      const result = await sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId: testData.packageId,
          packageGrants: [
            {
              organizationId: org2Result.id,
              grantType: PackageGrantType.Grant,
              action: PackageGrantAction.Add
            }
          ]
        },
        getRequestHeaders(switchedOptions)
      );
      const grantData = _.get(result, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
      expect(grantData?.id).toBeDefined();
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

async function setOLPPermissions(orgInfo: any) {
  const olpObjectIds: any = {
    authGroupId: '',
    permissionId: '',
    aceOrgRecords: []
  };

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

  const authGroupRes = await sdkClient.sdk.CreateAuthGroup({
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
  const authGroupData = _.get(authGroupRes, 'data.authGroupCreate');
  expect(authGroupData.id).toBeDefined();
  testData.authGroupId = _.get(authGroupData, 'id');
  olpObjectIds.authGroupId = _.get(authGroupData, 'id');

  const permissionSetRes = await sdkClient.sdk.authPermissionSetCreate({
    input: {
      name: `${citestMarker}-permission-${uuid.v4()}`,
      description: 'desc',
      organizationID: orgInfo.orgId,
      permissions
    }
  });
  const permissionSetData = _.get(
    permissionSetRes,
    'data.authPermissionSetCreate'
  );
  expect(permissionSetData.id).toBeDefined();
  testData.authPermissionId = _.get(permissionSetData, 'id');
  olpObjectIds.permissionId = _.get(permissionSetData, 'id');

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
