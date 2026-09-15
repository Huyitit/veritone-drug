import { helpers } from '../../../src/helpers/index';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../../src/graphqlUtil';
import { OrganizationStatus, OrganizationType } from '../../../src/gql';
import { safe } from '../../../src/helpers/commonHelper';

const _ = require('lodash');
const uuid = require('uuid');
const chakram = require('chakram');

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp || false;

let sdkClient: GraphqlClient;

type RequestOptions = Record<string, any>;

type CreatedUser = {
  key: string;
  userId: string;
  requestOptions: RequestOptions;
};

describe('citest_package: RBAC for get packages', () => {
  let superToken = '';
  let testOrg: { id: string; guid: string; name: string } = {
    id: '',
    guid: '',
    name: ''
  };
  let testUsers: CreatedUser[] = [];
  let adminUser: CreatedUser;
  let regularUser: CreatedUser;
  let secondRegularUser: CreatedUser;
  let adminOptions: RequestOptions;
  let regularOptions: RequestOptions;
  let useRBACFeature = false;
  let superAdminOptions: RequestOptions = {};
  let secondRegularOptions: RequestOptions;
  let testAppId = '';
  let newAuthPermissionSet: any;
  const packageIds = new Set<string>();

  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, config.env);
    expect(sdkClient.sessionToken).toBeDefined();
    superToken = sdkClient.sessionToken!;
    superAdminOptions = helpers.requestOptions(superToken);

    const introspectionQuery = await sdkClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
      }
    `);

    useRBACFeature = _.has(introspectionQuery, '__type.name');

    const orgRes = await sdkClient.sdk.createOrganization(
      {
        input: {
          ...createOrgAndUserInput.orgInput,
          name: `${citestMarker}-org-folder-rbac-${uuid.v4()}`
        }
      },
      getRequestHeaders(superAdminOptions)
    );

    testOrg = _.get(orgRes, 'data.createOrganization');
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);

    testUsers = await createUsersForOrg(testOrg.id, testOrg.guid, superToken);
    expect(testUsers.length).toEqual(5);

    adminUser = _.find(testUsers, { key: 'adminUser' });
    regularUser = _.find(testUsers, { key: 'regularUser' });
    secondRegularUser = _.find(testUsers, { key: 'secondRegularUser' });

    adminOptions = adminUser.requestOptions;
    regularOptions = regularUser.requestOptions;
    secondRegularOptions = secondRegularUser.requestOptions;
  });

  describe('RBAC for get packages', () => {
    let ciAppGrantPackage: any;
    const appUuid = uuid.v4();
    const testApp = {
      name: `${citestMarker} Package App - ${appUuid}`,
      description: `Citest Package App - ${appUuid}`,
      url: 'www.example.com',
      oauth2RedirectUrls: ['www.example.com/callback'],
      checkPermissions: false,
      status: 'active'
    };
    let ciAppOwnedPackage: any;

    it('should create application', async () => {
      const result = await sdkClient.sdk.createApplication(
        { input: testApp as any },
        getRequestHeaders(superAdminOptions)
      );
      testAppId = _.get(result, 'data.createApplication.id');
      expect(testAppId).toBeDefined();
    });

    it('should create package with application resource', async () => {
      const result = await sdkClient.sdk.packageCreate(
        {
          input: {
            name: `${citestMarker} citest appGrant test package`,
            version: '1.0',
            primaryResourceId: testAppId,
            resources: [
              {
                resourceId: testAppId,
                resourceType: 'application',
                action: 'ADD'
              }
            ]
          } as any
        },
        getRequestHeaders(superAdminOptions)
      );

      ciAppGrantPackage = _.get(result, 'data.packageCreate');
      packageIds.add(ciAppGrantPackage.id);
    });

    it('should grant package to organization with VIEW access', async () => {
      const result = await sdkClient.sdk.mutationPackageUpdateGrants(
        {
          packageId: ciAppGrantPackage.id,
          packageGrants: [
            {
              organizationId: testOrg.id,
              action: 'ADD',
              grantType: 'VIEW'
            }
          ]
        } as any,
        getRequestHeaders(superAdminOptions)
      );

      expect(_.get(result, 'data.packageUpdateGrants.id')).toEqual(
        ciAppGrantPackage.id
      );
    });

    it('should create a package owned by organization', async () => {
      const result = await sdkClient.sdk.packageCreate(
        {
          input: {
            name: `${citestMarker} citest org owned packages`,
            version: '1.0',
            organizationId: testOrg.id
          } as any
        },
        getRequestHeaders(adminOptions)
      );

      ciAppOwnedPackage = _.get(result, 'data.packageCreate');
      packageIds.add(ciAppOwnedPackage.id);
    });

    it('admin user should fetch both granted and org-owned packages', async () => {
      const packages = await sdkClient.sdk.queryPackages(
        {
          ids: [ciAppGrantPackage.id, ciAppOwnedPackage.id],
          limit: 1000
        },
        getRequestHeaders(adminOptions)
      );

      const packageData = _.get(packages, 'data.packages.records');
      expect(packageData.length).toEqual(2);
    });

    it('regular user with AIWARE_DEVELOPER_ENGINE_READ should fetch both granted and org-owned packages', async () => {
      if (!useRBACFeature) {
        return;
      }

      const result = await sdkClient.sdk.authPermissionSetCreate(
        {
          input: {
            name: `${citestMarker}-auth-permission-set-${uuid.v4()}`,
            description: `${citestMarker}-auth-permission-set`,
            organizationID: testOrg.id,
            permissions: ['DEVELOPER_ENGINE_READ']
          } as any
        },
        getRequestHeaders(adminOptions)
      );

      expect(_.get(result, 'data.authPermissionSetCreate')).toBeDefined();
      expect(_.get(result, 'data.authPermissionSetCreate.name')).toContain(
        `${citestMarker}-auth-permission-set`
      );
      newAuthPermissionSet = _.get(result, 'data.authPermissionSetCreate');

      const aclRes = await sdkClient.sdk.addACEsToResources(
        {
          resourceType: 'Organization',
          ids: [testOrg.id],
          entries: [
            {
              member: {
                id: secondRegularUser.userId,
                memberType: 'User'
              },
              permissionSetID: newAuthPermissionSet.id
            }
          ]
        } as any,
        getRequestHeaders(adminOptions)
      );

      const acl = _.get(aclRes, 'data.addACEsToResources.records');
      expect(acl.length).toBeGreaterThan(0);

      const impersonatedOptions = await impersonate(
        secondRegularUser.userId,
        testOrg.guid,
        superToken
      );
      secondRegularOptions = impersonatedOptions;

      const packages = await sdkClient.sdk.queryPackages(
        {
          ids: [ciAppGrantPackage.id, ciAppOwnedPackage.id],
          limit: 1000
        },
        getRequestHeaders(secondRegularOptions)
      );

      const packageData = _.get(packages, 'data.packages.records');
      expect(packageData.length).toEqual(2);
    });

    it('regular user without AIWARE_DEVELOPER_ENGINE_READ should fetch only granted packages', async () => {
      const packages = await sdkClient.sdk.queryPackages(
        {
          ids: [ciAppGrantPackage.id, ciAppOwnedPackage.id],
          limit: 1000
        },
        getRequestHeaders(regularOptions)
      );

      const packageData = _.get(packages, 'data.packages.records');
      expect(packageData.length).toEqual(1);
    });

    it('superadmin should see same packages via packages query and packageGrants', async () => {
      const grantedRes = await sdkClient.sdk.packageGrants(
        {
          orgId: testOrg.id,
          limit: 1000
        },
        getRequestHeaders(superAdminOptions)
      );

      const grantedIds = extractPackageIdsFromResults(grantedRes, 'grants');
      const fetchedPackages = await sdkClient.sdk.queryPackages(
        {
          ids: grantedIds,
          limit: 1000
        },
        getRequestHeaders(superAdminOptions)
      );

      const fetchedPackageIds = extractPackageIdsFromResults(
        fetchedPackages,
        'packages'
      );
      expect(new Set(fetchedPackageIds)).toEqual(new Set(grantedIds));
    });

    it('developer user should see same packages from packages and packageGrants', async () => {
      const grantRes = await sdkClient.sdk.packageGrants(
        {
          orgId: testOrg.id,
          limit: 1000
        },
        getRequestHeaders(secondRegularOptions)
      );

      const grantedIds = extractPackageIdsFromResults(grantRes, 'grants');
      const fetchedPackages = await sdkClient.sdk.queryPackages(
        {
          ids: grantedIds,
          limit: 1000
        },
        getRequestHeaders(secondRegularOptions)
      );
      const fetchedPackageIds = extractPackageIdsFromResults(
        fetchedPackages,
        'packages'
      );

      expect(new Set(fetchedPackageIds)).toEqual(new Set(grantedIds));
    });

    it('regular user without developer permission should see same granted packages from both APIs', async () => {
      const grantRes = await sdkClient.sdk.packageGrants(
        {
          orgId: testOrg.id,
          limit: 1000
        },
        getRequestHeaders(regularOptions)
      );

      const grantedIds = extractPackageIdsFromResults(grantRes, 'grants');
      const fetchedPackages = await sdkClient.sdk.queryPackages(
        {
          ids: grantedIds,
          limit: 1000
        },
        getRequestHeaders(regularOptions)
      );

      const fetchedPackageIds = extractPackageIdsFromResults(
        fetchedPackages,
        'packages'
      );
      expect(new Set(fetchedPackageIds)).toEqual(new Set(grantedIds));
    });

    it('should delete multiple packages sequentially', async () => {
      const packageIdsToDelete = [ciAppGrantPackage.id, ciAppOwnedPackage.id];

      for (const id of packageIdsToDelete) {
        const result = await sdkClient.sdk.packageDelete(
          { id },
          getRequestHeaders(superAdminOptions)
        );
        expect(_.get(result, 'data.packageDelete.success')).toBe(true);
        packageIds.delete(id);
      }
    });

    it('should delete application', async () => {
      const result = await sdkClient.sdk.deleteApplication(
        { id: testAppId },
        getRequestHeaders(superAdminOptions)
      );
      const deletedApp = _.get(result, 'data.deleteApplication');
      expect(deletedApp.id).toEqual(testAppId);
      testAppId = '';
    });
  });

  afterAll(async () => {
    if (packageIds.size) {
      for (const id of packageIds) {
        await safe(`delete package ${id}`, () =>
          sdkClient.sdk.packageDelete(
            { id },
            getRequestHeaders(superAdminOptions)
          )
        );
      }
    }

    if (testAppId) {
      await safe('delete app', () =>
        sdkClient.sdk.deleteApplication(
          { id: testAppId },
          getRequestHeaders(superAdminOptions)
        )
      );
    }

    if (newAuthPermissionSet) {
      await safe('delete auth permission set', () =>
        sdkClient.sdk.authPermissionSetDelete(
          { id: newAuthPermissionSet.id },
          getRequestHeaders(adminOptions)
        )
      );
    }

    if (!_.isEmpty(testUsers)) {
      for (const user of testUsers) {
        await safe(`delete user ${user.userId}`, () =>
          sdkClient.sdk.deleteUser(
            { id: user.userId },
            getRequestHeaders(superAdminOptions)
          )
        );
      }
    }

    if (testOrg.id) {
      await safe('delete org', () =>
        sdkClient.sdk.updateOrganization(
          {
            input: {
              id: testOrg.id,
              status: OrganizationStatus.Deleted
            }
          },
          getRequestHeaders(superAdminOptions)
        )
      );
    }
  });
});

function getRequestHeaders(options: RequestOptions) {
  return _.get(options, 'headers', undefined);
}

async function impersonate(
  userId: string,
  applicationOrgGUID: string,
  token: string
): Promise<RequestOptions> {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

async function createUsersForOrg(
  organizationId: string,
  organizationGuid: string,
  token: string
): Promise<CreatedUser[]> {
  const users: CreatedUser[] = [];
  const superAdminHeaders = getRequestHeaders(helpers.requestOptions(token));

  for (const userInput of createOrgAndUserInput.userInputs) {
    const createUserRes = await sdkClient.sdk.createUser(
      {
        input: {
          name: userInput.name,
          password: 'TestUserPassword',
          organizationId,
          roleIds: userInput.roleIds
        }
      } as any,
      superAdminHeaders
    );

    const createdUserId = _.get(createUserRes, 'data.createUser.id');
    const requestOptions = await impersonate(
      createdUserId,
      organizationGuid,
      token
    );

    users.push({
      key: userInput.key,
      userId: createdUserId,
      requestOptions
    });
  }

  return users;
}

function extractPackageIdsFromResults(
  results: any,
  type = 'packages'
): string[] {
  if (type === 'packages') {
    return _.map(_.get(results, 'data.packages.records', []), 'id');
  }

  return _.map(_.get(results, 'data.packageGrants.records', []), (r: any) =>
    _.get(r, 'package.id')
  );
}

const createOrgAndUserInput = {
  orgInput: {
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
  },
  userInputs: [
    {
      key: 'adminUser',
      name: `${citestMarker}-admin-user-${uuid.v4()}@localhost`,
      roleIds: [
        isDesktopAppEnabled ? '' : 'ddca9b68-d775-4934-8ffd-7aecc779b652',
        '032218c3-d47e-4287-9d16-7bb867c01266',
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
      ].filter((roleId: string) => roleId)
    },
    {
      key: 'regularUser',
      name: `${citestMarker}-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828']
    },
    {
      key: 'secondRegularUser',
      name: `${citestMarker}-second-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828']
    },
    {
      key: 'restrictUser',
      name: `${citestMarker}-first-restrict-user-${uuid.v4()}@localhost`,
      roleIds: []
    },
    {
      key: 'secondRestrictUser',
      name: `${citestMarker}-second-restrict-user-${uuid.v4()}@localhost`,
      roleIds: []
    }
  ]
};
