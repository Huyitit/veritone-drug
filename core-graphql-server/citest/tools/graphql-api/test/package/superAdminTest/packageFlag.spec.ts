/* global pending */
import * as _ from 'lodash';
import * as uuid from 'uuid';
import moment from 'moment';
import chakram from 'chakram';
import { helpers } from '../../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../../src/graphqlUtil';
import {
  AccessScope,
  ApplicationStatus,
  AuthPermissionType,
  BuildUpdateAction,
  DeploymentModel,
  EngineDistributionType,
  OrderDirection,
  OrganizationType,
  PackageGrantAction,
  PackageGrantType,
  PackageOrderByField,
  PackageResourceAction,
  PackageResourceType,
  PackageStatus,
  SchemaStatus,
  StringMatch
} from '../../../src/gql';
import { safe } from '../../../src/helpers/commonHelper';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);
const config = helpers.config;
const env = config.env;

let sdkClient: GraphqlClient;

const AIWARE_CI_TEST_STAMP = citestMarker;
const startDateTime = moment().subtract(2, 'hour').unix();
const stopDateTime = moment().subtract(1, 'hour').unix();
const publicEnginesPackageName = `${AIWARE_CI_TEST_STAMP} publicEngines`;
const adminRoles = [
  // 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Org Admin
  '032218c3-d47e-4287-9d16-7bb867c01266' // DESKTOP ADMIN
  // 'ddf6f444-eaf0-4ee3-bded-98776e5fee0f' // CI Tester
];

const TRANSCRIPT_ENGINE_CATEGORY_ID = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
const TRANSLATION_ENGINE_CATEGORY_ID = '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923';

const ROLES_IDS = [
  // 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450' // Discovery Editor
  // '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
];

const schema = {
  $id: 'http://example.com/example.json',
  type: 'object',
  definitions: {},
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    foo: {
      $id: '/properties/foo',
      type: 'string',
      title: 'the schema title',
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
const defaultEngineCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'; // Transcription

const itif = (condition: boolean, ...args: any[]) =>
  condition ? it(...args) : it.skip(...args);

const describeif = (condition: boolean, ...args: any[]) =>
  condition ? describe(...args) : describe.skip(...args);
// FIXME: fails in ai13s
describe('citest_package: package feature flag', () => {
  let superToken: string,
    engineGrantOrg: any,
    appGrantOrg: any,
    noEngineGrantOrg: any;
  let engineGrantSuperAdminOptions: any;
  let noEngineGrantSuperAdminOptions: any;
  let orgAdminUserInNoEngineGrantOrg: any,
    orgAdminUserInEngineGrantOrg: any,
    orgAdminUserInAppGrantOrg: any,
    orgRegularUserInAppGrantOrg: any,
    orgRegularUserInAppGrantOrgNoRole: any;
  let engineGrantOrgAdminOptions: any;
  let appGrantOrgAdminOptions: any;
  let noEngineGrantOrgAdminOptions: any;
  let appGrantOrgRegularOptions: any, appGrantOrgRegularNoRoleOptions: any;
  const validatePackageGrant = async (
    grantType: string,
    packageId: string,
    sdkClient: GraphqlClient,
    variables: Record<string, any> = {},
    useTokenAuth = false
  ) => {
    // verify that the grantType was set correctly

    const result = await sdkClient.sdk.packageGrants(
      { id: packageId },
      getRequestHeaders(useTokenAuth)
    );
    expect(_.get(result, 'data.packageGrants.records[0].grantType')).toEqual(
      grantType
    );
  };

  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(sdkClient.sessionToken).toBeDefined();
    superToken = sdkClient.sessionToken!;
    // options.adminOption = helpers.requestOptions(options.adminToken);

    const meRes = await sdkClient.sdk.meBasic({});
    const meData = _.get(meRes, 'data.me');
    expect(meData).toBeDefined();
    const superUserId = _.get(meData, 'id');

    // get citest org which has useEngineGrant and useAppGrant disabled
    let nameOrg = `${AIWARE_CI_TEST_STAMP}-no-engine-grant-org`;
    if (!noEngineGrantOrg) {
      noEngineGrantOrg = await setupTestOrganization(sdkClient, nameOrg, false);
      // add CI-test role to org creater
      await updateUserRole(superUserId || '', noEngineGrantOrg.id, adminRoles);
    }
    orgAdminUserInNoEngineGrantOrg = _.find(
      _.get(noEngineGrantOrg, 'users.records'),
      (user: any) => {
        return _.includes(user.name, `${nameOrg}-citest-admin-user`);
      }
    );

    // create org admin user (noEngineGrantOrg)
    if (!orgAdminUserInNoEngineGrantOrg) {
      orgAdminUserInNoEngineGrantOrg = await createOrgAdminUser(
        sdkClient,
        nameOrg,
        noEngineGrantOrg.id
      );
    }

    // get citest org which has useEngineGrant is enabled
    nameOrg = 'citest-engine-grant-org';
    if (!engineGrantOrg) {
      engineGrantOrg = await setupTestOrganization(sdkClient, nameOrg, true);
      // add CI-test role to org creater
      await updateUserRole(superUserId || '', engineGrantOrg.id, adminRoles);
    }
    orgAdminUserInEngineGrantOrg = _.find(
      _.get(engineGrantOrg, 'users.records'),
      (user: any) => {
        return _.includes(user.name, `${nameOrg}-citest-admin-user`);
      }
    );

    // create org admin user (engineGrantOrg)
    if (!orgAdminUserInEngineGrantOrg) {
      orgAdminUserInEngineGrantOrg = await createOrgAdminUser(
        sdkClient,
        nameOrg,
        engineGrantOrg.id
      );
    }

    // get citest org which has useAppGrant is enabled
    nameOrg = 'citest-app-grant-org';
    if (!appGrantOrg) {
      appGrantOrg = await setupTestOrganization(sdkClient, nameOrg, true, true);
      // add CI-test role to org creater
      await updateUserRole(superUserId || '', appGrantOrg.id, adminRoles);
    }
    orgAdminUserInAppGrantOrg = _.find(
      _.get(appGrantOrg, 'users.records'),
      (user: any) => {
        return _.includes(user.name, `${nameOrg}-citest-admin-user`);
      }
    );

    // create org admin user (appGrantOrg)
    if (!orgAdminUserInAppGrantOrg) {
      orgAdminUserInAppGrantOrg = await createOrgAdminUser(
        sdkClient,
        nameOrg,
        appGrantOrg.id
      );
    }
    // Login for super Admin user (engineGrantOrg)
    engineGrantSuperAdminOptions = await impersonateUser(
      superUserId || '',
      engineGrantOrg.guid,
      superToken
    );

    // Login for super Admin user (noEngineGrantOrg)
    noEngineGrantSuperAdminOptions = await impersonateUser(
      superUserId || '',
      noEngineGrantOrg.guid,
      superToken
    );

    // Login for org Admin user (engineGrantOrg)
    engineGrantOrgAdminOptions = await impersonateUser(
      orgAdminUserInEngineGrantOrg.id,
      engineGrantOrg.guid,
      superToken
    );

    // Login for org Admin user (noEngineGrantOrg)
    noEngineGrantOrgAdminOptions = await impersonateUser(
      orgAdminUserInNoEngineGrantOrg.id,
      noEngineGrantOrg.guid,
      superToken
    );

    // Login for org Admin user (appGrantOrg)
    appGrantOrgAdminOptions = await impersonateUser(
      orgAdminUserInAppGrantOrg.id,
      appGrantOrg.guid,
      superToken
    );

    orgRegularUserInAppGrantOrg = _.find(
      _.get(appGrantOrg, 'users.records'),
      (user: any) =>
        user.name.includes(`${nameOrg}-citest-regular-user-with-role`)
    );
    orgRegularUserInAppGrantOrgNoRole = _.find(
      _.get(appGrantOrg, 'users.records'),
      (user: any) =>
        user.name.includes(`${nameOrg}-citest-regular-user-no-role`)
    );
    // create org regular user (appGrantOrg)
    if (!orgRegularUserInAppGrantOrg) {
      // create application for appGrantOrg
      const application = await createApplication(appGrantOrgAdminOptions);
      const applicationRole =
        _.find(application.applicationRoles, (role: any) =>
          role.name.includes('aiware')
        ) || application.applicationRoles[0];

      // add app to org
      await sdkClient.sdk.addAppToOrg({
        appId: application.id,
        orgId: appGrantOrg.id,
        configs: [
          {
            configKey: `test_${uuid.v4()}`,
            configValue: 'test'
          }
        ]
      });

      // Create regular user (with application role) in appGrantOrg
      orgRegularUserInAppGrantOrg = await createRegularUser(
        nameOrg,
        appGrantOrg.id,
        applicationRole.id,
        'with-role'
      );
    }
    if (!orgRegularUserInAppGrantOrgNoRole) {
      orgRegularUserInAppGrantOrgNoRole = await createRegularUser(
        nameOrg,
        appGrantOrg.id,
        '',
        'no-role'
      );
    }

    // Login for org regular user with application role (appGrantOrg)
    appGrantOrgRegularOptions = await impersonateUser(
      orgRegularUserInAppGrantOrg.id,
      appGrantOrg.guid,
      superToken
    );

    // Login for org regular user (appGrantOrg)
    appGrantOrgRegularNoRoleOptions = await impersonateUser(
      orgRegularUserInAppGrantOrgNoRole.id,
      appGrantOrg.guid,
      superToken
    );
  });

  // TODO: Should enable when the changes are deployed to dev env.
  describe('#package operations', () => {
    describe('Test for query TDOs using resourceAlias, useEngineGrant and useAppGrant disabled', () => {
      let adminOptions: any;
      let tdoId_1: string, tdoId_2: string, tdoId_3: string;
      let packageId: string,
        packageId1: string,
        packageId3: string,
        distributionType: EngineDistributionType;
      let appId: string, appResourceAlias: string;
      const clearTDOs = new Set<string>();
      const clearPackages = new Set<string>();
      const clearApps = new Set<string>();
      const uniqueId = Date.now().valueOf();

      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
      });

      afterAll(async () => {
        if (clearApps.size) {
          for (const apId of clearApps) {
            await safe(`afterAll delete application ${apId}`, () =>
              sdkClient.sdk.deleteApplication(
                { id: apId },
                getRequestHeaders(adminOptions)
              )
            );
          }
        }

        if (clearPackages.size) {
          for (const pkgId of clearPackages) {
            await safe(`afterAll delete package ${pkgId}`, () =>
              sdkClient.sdk.packageDelete(
                { id: pkgId },
                getRequestHeaders(adminOptions)
              )
            );
          }
        }

        if (clearTDOs.size) {
          for (const tdoId of clearTDOs) {
            await safe(`afterAll delete TDO ${tdoId}`, () =>
              sdkClient.sdk.deleteTDO(
                { id: tdoId },
                getRequestHeaders(adminOptions)
              )
            );
          }
        }
      });

      it('should create TDO', async () => {
        let result, tdo;

        result = await sdkClient.sdk.createTDO(
          {
            input: {
              name: 'citest test TDO 1',
              status: 'uploaded',
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          getRequestHeaders(adminOptions)
        );
        tdo = _.get(result, 'data.createTDO');
        tdoId_1 = _.get(tdo, 'id', '');
        clearTDOs.add(tdoId_1);
        expect(tdoId_1).toBeDefined();

        result = await sdkClient.sdk.createTDO(
          {
            input: {
              name: 'citest test TDO 2',
              status: 'uploaded',
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          getRequestHeaders(adminOptions)
        );
        tdo = _.get(result, 'data.createTDO');
        tdoId_2 = _.get(tdo, 'id', '');
        clearTDOs.add(tdoId_2);
        expect(tdoId_2).toBeDefined();

        // Tdo 3

        result = await sdkClient.sdk.createTDO(
          {
            input: {
              name: 'citest test TDO 3',
              status: 'uploaded',
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          getRequestHeaders(adminOptions)
        );
        tdo = _.get(result, 'data.createTDO');
        tdoId_3 = _.get(tdo, 'id', '');
        clearTDOs.add(tdoId_3);
        expect(tdoId_3).toBeDefined();
      });
      it('should create application', async () => {
        let result, app;

        result = await sdkClient.sdk.createApplication(
          {
            input: {
              name: `${AIWARE_CI_TEST_STAMP} App 1 for package - ${uniqueId}`,
              description: 'Citest App 1 for package test',
              url: 'www.example.com',
              checkPermissions: false
            }
          },
          getRequestHeaders(adminOptions)
        );
        app = _.get(result, 'data.createApplication');
        appId = _.get(app, 'id', '');
        expect(appId).toBeDefined();
        clearApps.add(appId);
      });
      it('should create package with TDO 1 resources', async () => {
        let result, ci_package;

        result = await sdkClient.sdk.packageCreate(
          {
            input: {
              name: `${AIWARE_CI_TEST_STAMP} package 1`,
              version: '1.0',
              primaryResourceId: appId,
              resources: [
                {
                  resourceId: appId,
                  resourceType: PackageResourceType.Application,
                  action: PackageResourceAction.Add
                },
                {
                  resourceId: tdoId_1,
                  resourceType: PackageResourceType.Tdo,
                  resourceAlias: 'tdo 1',
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
        ci_package = _.get(result, 'data.packageCreate');
        packageId = _.get(ci_package, 'id', '');
        expect(_.get(ci_package, 'id')).toBeDefined();
        expect(_.get(ci_package, 'resources.records')?.length).toBeGreaterThan(
          0
        );

        // validate resource Alias
        _.get(ci_package, 'resources.records', []).forEach((pr: any) => {
          if (pr.resourceId === appId) {
            expect(pr.resourceAlias).toBeDefined();
            expect(pr.resourceAlias).toEqual(pr.resourceId);
            // store appResourceAlias
            appResourceAlias = pr.resourceAlias;
          } else if (pr.resourceId === `${tdoId_1}`) {
            expect(pr.resourceAlias).toBeDefined();
            expect(pr.resourceAlias).toEqual('tdo 1');
          }
        });

        clearPackages.add(packageId);
      });
      it('should create another package with TDO 2 resources', async () => {
        const result = await sdkClient.sdk.packageCreate(
          {
            input: {
              name: `${AIWARE_CI_TEST_STAMP} package 2`,
              version: '1.0',
              primaryResourceId: tdoId_2,
              resources: [
                {
                  resourceId: appId,
                  resourceType: PackageResourceType.Application,
                  action: PackageResourceAction.Add
                },
                {
                  resourceId: tdoId_2,
                  resourceType: PackageResourceType.Tdo,
                  resourceAlias: 'tdo 2',
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
        const ci_package = _.get(result, 'data.packageCreate');
        packageId1 = _.get(ci_package, 'id', '');
        expect(_.get(ci_package, 'id')).toBeDefined();
        expect(_.get(ci_package, 'resources.records')?.length).toBeGreaterThan(
          0
        );
        clearPackages.add(packageId1);
      });
      it('should get packages ordered by package_name ASC by default', async () => {
        const result = await sdkClient.sdk.queryPackages(
          {
            packageFilter: {
              nameMatch: StringMatch.Contains,
              caseSensitive: true,
              name: `${AIWARE_CI_TEST_STAMP} package`
            }
          },
          getRequestHeaders(adminOptions)
        );
        const packages = _.get(result, 'data.packages.records');
        expect(packages?.[0]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 1`
        );
        expect(packages?.[1]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 2`
        );
      });
      it('should get packages ordered by name with direction desc', async () => {
        const result = await sdkClient.sdk.queryPackages(
          {
            orderBy: {
              field: PackageOrderByField.Name,
              direction: OrderDirection.Desc
            },
            packageFilter: {
              nameMatch: StringMatch.Contains,
              caseSensitive: true,
              name: `${AIWARE_CI_TEST_STAMP} package`
            }
          },
          getRequestHeaders(adminOptions)
        );
        const packages = _.get(result, 'data.packages.records');
        expect(packages?.[1]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 1`
        );
        expect(packages?.[0]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 2`
        );
      });
      it('should get packages ordered by createdDateTime with direction desc', async () => {
        const result = await sdkClient.sdk.queryPackages(
          {
            orderBy: {
              field: PackageOrderByField.CreatedDateTime,
              direction: OrderDirection.Desc
            },
            packageFilter: {
              nameMatch: StringMatch.Contains,
              caseSensitive: true,
              name: `${AIWARE_CI_TEST_STAMP} package`
            }
          },
          getRequestHeaders(adminOptions)
        );
        const packages = _.get(result, 'data.packages.records');
        expect(packages?.[1]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 1`
        );
        expect(packages?.[0]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 2`
        );
      });
      it('should get packages ordered by modifiedDateTime with direction desc', async () => {
        const result = await sdkClient.sdk.queryPackages(
          {
            orderBy: {
              field: PackageOrderByField.ModifiedDateTime,
              direction: OrderDirection.Desc
            },
            packageFilter: {
              nameMatch: StringMatch.Contains,
              caseSensitive: true,
              name: `${AIWARE_CI_TEST_STAMP} package`
            }
          },
          getRequestHeaders(adminOptions)
        );
        const packages = _.get(result, 'data.packages.records');
        expect(packages?.[1]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 1`
        );
        expect(packages?.[0]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 2`
        );
      });
      it('should get packages ordered by distributionType with direction desc', async () => {
        // update package distributionType and status
        await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: packageId1,
              distributionType: EngineDistributionType.Public,
              status: PackageStatus.Pending
            }
          },
          getRequestHeaders(adminOptions)
        );

        const result = await sdkClient.sdk.queryPackages(
          {
            orderBy: {
              field: PackageOrderByField.DistributionType,
              direction: OrderDirection.Desc
            },
            packageFilter: {
              nameMatch: StringMatch.Contains,
              caseSensitive: true,
              name: `${AIWARE_CI_TEST_STAMP} package`
            }
          },
          getRequestHeaders(adminOptions)
        );
        const packages = _.get(result, 'data.packages.records');
        expect(packages?.[1]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 2`
        );
        expect(packages?.[0]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 1`
        );
      });
      it('should get packages ordered by status with direction desc', async () => {
        const result = await sdkClient.sdk.queryPackages(
          {
            orderBy: {
              field: PackageOrderByField.Status,
              direction: OrderDirection.Desc
            },
            packageFilter: {
              nameMatch: StringMatch.Contains,
              caseSensitive: true,
              name: `${AIWARE_CI_TEST_STAMP} package`
            }
          },
          getRequestHeaders(adminOptions)
        );
        const packages = _.get(result, 'data.packages.records');
        expect(packages?.[1]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 1`
        );
        expect(packages?.[0]?.name).toEqual(
          `${AIWARE_CI_TEST_STAMP} package 2`
        );
      });
      it('should update package with TDO 2 resources', async () => {
        let result, ci_package;

        result = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: packageId,
              resources: [
                {
                  resourceId: tdoId_2,
                  resourceType: PackageResourceType.Tdo,
                  resourceAlias: 'tdo 2',
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
        ci_package = _.get(result, 'data.packageUpdate');
        packageId = _.get(ci_package, 'id', '');
        clearPackages.add(packageId);
        expect(_.get(ci_package, 'resources.records')?.length).toEqual(3);
      });
      it('should update package with TDO 3 resources. Auto generate resourceAlias', async () => {
        let result, ci_package;

        result = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: packageId,
              resources: [
                {
                  resourceId: tdoId_3,
                  resourceType: PackageResourceType.Tdo,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
        ci_package = _.get(result, 'data.packageUpdate');
        packageId = _.get(ci_package, 'id', '');
        clearPackages.add(packageId);
        expect(_.get(ci_package, 'resources.records')?.length).toEqual(4);

        // validate resource Alias
        _.get(ci_package, 'resources.records', []).forEach((pr: any) => {
          if (pr.resourceId === `${tdoId_3}`) {
            expect(pr.resourceAlias).toBeDefined();
            expect(pr.resourceAlias).not.toEqual(`${tdoId_3}`);
            expect(pr.resourceAlias.length).toEqual(36);
          }
        });
      });

      it('should get package resource using resourceAlias', async () => {
        let query, result, ci_package, resources;
        query = `
          query package {
            packages(
              id: "${packageId}"
            ) {
              records {
                id
                name
                status
                distributionType
                resources(
                  alias: "tdo 1"
                ) {
                  records {
                    id
                    resourceType
                    resourceId
                    resourceAlias
                  }
                }
              }
            }
          }
        `;
        result = await sdkClient.query(
          query,
          {},
          getRequestHeaders(adminOptions)
        );
        ci_package = _.get(result, 'packages.records[0]');
        distributionType = ci_package.distributionType;
        resources = _.get(ci_package, 'resources.records');
        expect(resources.length).toEqual(1);
        expect(resources[0].resourceAlias).toEqual('tdo 1');
      });

      it('should get package using resourceAlias in the parent query', async () => {
        let result, ci_package, resources;

        result = await sdkClient.sdk.queryPackages(
          { resourceAlias: appResourceAlias },
          getRequestHeaders(adminOptions)
        );
        ci_package = _.get(result, 'data.packages.records[0]');
        resources = _.get(ci_package, 'resources.records', []);
        expect(ci_package?.id).toEqual(packageId);
        const packages = _.get(result, 'data.packages');
        expect(packages?.count).toEqual(2);
        expect(resources?.length).toEqual(4);
        // prep the tdo clones for deletion
        resources?.map((resource: any) => {
          if (resource.resourceType === 'tdo') {
            clearTDOs.add(resource.resourceId);
          }
        });
      });

      // TODO: Should enable this after VE-3226 is deployed to Prod env
      it('should get package by ids, distributionTypes', async () => {
        let result, ci_package;

        result = await sdkClient.sdk.queryPackages(
          {
            ids: [packageId],
            distributionTypes: [distributionType]
          },
          getRequestHeaders(adminOptions)
        );
        ci_package = _.get(result, 'data.packages.records[0]');
        expect(ci_package?.id).toEqual(packageId);
        expect(ci_package?.distributionType).toEqual(distributionType);
        expect(_.get(result, 'data.packages.count')).toEqual(1);
      });

      it('should create a package with appId and tdo2 resources when primaryResourceId is not provided', async () => {
        const result = await sdkClient.sdk.packageCreate(
          {
            input: {
              name: `${AIWARE_CI_TEST_STAMP} package 3`,
              version: '1.0',
              resources: [
                {
                  resourceId: appId,
                  resourceType: PackageResourceType.Application,
                  action: PackageResourceAction.Add
                },
                {
                  resourceId: tdoId_2,
                  resourceType: PackageResourceType.Tdo,
                  resourceAlias: 'tdo 2',
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
        const ci_package = _.get(result, 'data.packageCreate');
        packageId3 = _.get(ci_package, 'id', '');
        expect(_.get(ci_package, 'id')).toBeDefined();
        expect(_.get(ci_package, 'resources.records')?.length).toBeGreaterThan(
          0
        );
        clearPackages.add(packageId3);
      });

      it('should get package with appId and tdo2 resources when not filtering by primaryResourceType', async () => {
        const result = await sdkClient.sdk.queryPackages(
          {
            packageFilter: {
              primaryResourceType: null
            }
          },
          getRequestHeaders(adminOptions)
        );
        const packages = _.get(result, 'data.packages');
        const found = _.find(_.get(packages, 'records'), { id: packageId3 });
        expect(found).toBeDefined();
      });

      it('should clean up the apps and packages', async () => {
        let result;
        for (const apId of Array.from(clearApps)) {
          result = await sdkClient.sdk.deleteApplication(
            {
              id: apId
            },
            getRequestHeaders(adminOptions)
          );
          const deletedApp = _.get(result, 'data.deleteApplication');
          expect(deletedApp?.id).toBeDefined();
        }
        clearApps.clear();
        // clearApps.forEach(async (apId) => {
        //   result = await sdkClient.sdk.deleteApplication(
        //     {
        //       id: apId
        //     },
        //     getRequestHeaders(adminOptions)
        //   );
        //   const deletedApp = _.get(result, 'data.deleteApplication');
        //   expect(deletedApp.id).toBeDefined();
        // });

        for (const packageId of Array.from(clearPackages)) {
          result = await sdkClient.sdk.packageDelete(
            {
              id: packageId
            },
            getRequestHeaders(adminOptions)
          );
          const deletedPackage = _.get(result, 'data.packageDelete');
          expect(deletedPackage?.success).toBeDefined();
        }
        clearPackages.clear();
        // clearPackages.forEach(async (packageId) => {
        //   result = await sdkClient.sdk.packageDelete(
        //     {
        //       id: packageId
        //     },
        //     getRequestHeaders(adminOptions)
        //   );
        //   const deletedPackage = _.get(result, 'data.packageDelete');
        //   expect(deletedPackage.success).toBeDefined();
        // });

        for (const tdoId of Array.from(clearTDOs)) {
          result = await sdkClient.sdk.deleteTDO(
            {
              id: tdoId
            },
            getRequestHeaders(adminOptions)
          );
          const deletedTDO = _.get(result, 'data.deleteTDO');
          expect(deletedTDO?.id).toBeDefined();
        }
        clearTDOs.clear();
        // clearTDOs.forEach(async (tdoId) => {
        //   result = await sdkClient.sdk.deleteTDO(
        //     {
        //       id: tdoId
        //     },
        //     getRequestHeaders(adminOptions)
        //   );
        //   const deletedTDO = _.get(result, 'data.deleteTDO');
        //   expect(deletedTDO.id).toBeDefined();
        // });
      });
    });
  });
  describeif((global as any).enablePackageGrantLogic, '#package grant', () => {
    describe('Tests for Org with useEngineGrant and useAppGrant disabled', () => {
      let adminOptions: any;
      let engineId: any, secondEngineId: any;
      let engineBuildId: any, secondEngineBuildId: any;
      let packageId: any;

      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
      });

      afterAll(async () => {
        if (engineId) {
          await safe(`deleteEngine ${engineId}`, () =>
            deleteEngine(engineId, adminOptions)
          );
        }

        if (secondEngineId) {
          await safe(`deleteEngine ${secondEngineId}`, () =>
            deleteEngine(secondEngineId, adminOptions)
          );
        }

        if (engineId && engineBuildId) {
          await safe(`deleteEngineBuild ${engineBuildId}`, () =>
            deleteEngineBuild(engineId, engineBuildId, adminOptions)
          );
        }

        if (secondEngineId && secondEngineBuildId) {
          await safe(`deleteEngineBuild ${secondEngineBuildId}`, () =>
            deleteEngineBuild(secondEngineId, secondEngineBuildId, adminOptions)
          );
        }

        if (packageId) {
          await safe(`deletePackage ${packageId}`, () =>
            deletePackage(packageId, adminOptions)
          );
        }
      });

      it('should get engine categories via whitelist', async () => {
        const ids = [
          TRANSCRIPT_ENGINE_CATEGORY_ID,
          TRANSLATION_ENGINE_CATEGORY_ID
        ];
        const result = await sdkClient.sdk.engineCategories(
          { ids },
          getRequestHeaders(adminOptions)
        );
        const engineCategories = _.get(result, 'data.engineCategories.records');
        expect(engineCategories).toBeDefined();
        expect(engineCategories).toHaveLength(ids.length);
      });
      it('should create engines', async () => {
        let query = `mutation {
          createEngine(input: {
            deploymentModel: FullyNetworkIsolated
            name: "${AIWARE_CI_TEST_STAMP} citest_engine_${Date.now()}"
            categoryId: "${TRANSCRIPT_ENGINE_CATEGORY_ID}"
            fields: [{
              max: 2
              min: 1
              type: Number
              name: "Test name"
              label: "test label"
            }],
            price: 100
            priceDimension: PRICE_PER_TASK
            logoPath: "http://localhost/logo"
            iconPath: "http://localhost/icon"
            useCases: ["case 1", "case 2"]
            industries: ["industry 1", "industry 2"]
            manifest: {
              engineMode: "chunk"
            }
            testingDetails: {
              email: "dev@veritone.com"
              mediaFileUri: "http://localhost/testingDetails/mediaFileUri"
              customFields: { foo: "bar" }
            }
            isPublic: false
            libraryRequired: true
            edgeVersion: 1
            cpuResourceMcpu: 2048
            gpuSupported: aws_p2
            website: "https://veritone.com"
            distributionType: private
            jwtRights: {
              roles: [{
                roleName: "adapter"
                taskRights: [
                  "job:create",
                  "job.read",
                  "cms.access",
                  "cms.sources.read",
                  "cms.sources.update",
                  "task:read"
                ]
                assetRights: [
                  "recording:update"
                ]
              }]
            }
          }) {
            id
            state
            applicationId
          },
          createSecondEngine: createEngine(input: {
            deploymentModel: FullyNetworkIsolated
            name: "${AIWARE_CI_TEST_STAMP} citest_engine_${Date.now()}"
            categoryId: "${TRANSLATION_ENGINE_CATEGORY_ID}"
            fields: [{
              max: 2
              min: 1
              type: Number
              name: "Test name"
              label: "test label"
            }],
            price: 100
            priceDimension: PRICE_PER_TASK
            logoPath: "http://localhost/logo"
            iconPath: "http://localhost/icon"
            useCases: ["case 1", "case 2"]
            industries: ["industry 1", "industry 2"]
            manifest: {
              engineMode: "chunk"
            }
            testingDetails: {
              email: "dev@veritone.com"
              mediaFileUri: "http://localhost/testingDetails/mediaFileUri"
              customFields: { foo: "bar" }
            }
            isPublic: false
            libraryRequired: true
            edgeVersion: 1
            cpuResourceMcpu: 2048
            gpuSupported: aws_p2
            website: "https://veritone.com"
            distributionType: private
            jwtRights: {
              roles: [{
                roleName: "adapter"
                taskRights: [
                  "job:create",
                  "job.read",
                  "cms.access",
                  "cms.sources.read",
                  "cms.sources.update",
                  "task:read"
                ]
                assetRights: [
                  "recording:update"
                ]
              }]
            }
          }) {
            id
            state
            applicationId
          }
        }`;

        let results = await sdkClient.query(
          query,
          {},
          getRequestHeaders(adminOptions)
        );
        expect(results.createEngine.id).toBeDefined();
        expect(results.createSecondEngine.id).toBeDefined();
        expect(results.createEngine.state).toEqual('pending');
        expect(results.createSecondEngine.state).toEqual('pending');
        engineId = results.createEngine.id;
        secondEngineId = results.createSecondEngine.id;
        // activate engines
        query = `mutation {
          createEngineBuild: createEngineBuild(input: {
            engineId: "${engineId}"
            taskRuntime: {
              nodeRed: true
            }
            manifest: {
              runtime: "NodeRed"
            }
          }) {
            id
            status
          },
          createSecondEngineBuild: createEngineBuild(input: {
            engineId: "${secondEngineId}"
            taskRuntime: {
              nodeRed: true
            }
            manifest: {
              runtime: "NodeRed"
            }
          }) {
            id
            status
          }
        }`;
        results = await sdkClient.query(
          query,
          {},
          getRequestHeaders(adminOptions)
        );
        expect(results.createEngineBuild.id).toBeDefined();
        expect(results.createEngineBuild.status).toEqual('available');
        expect(results.createSecondEngineBuild.id).toBeDefined();
        expect(results.createSecondEngineBuild.status).toEqual('available');

        engineBuildId = results.createEngineBuild.id;
        secondEngineBuildId = results.createSecondEngineBuild.id;

        query = `mutation {
          updateEngineBuild: updateEngineBuild(input: {
            id: "${engineBuildId}"
            engineId: "${engineId}"
            action: submit
          }) {
            id
            engineId
            status
            validStateActions
          },
          updateSecondEngineBuild: updateEngineBuild(input: {
            id: "${secondEngineBuildId}"
            engineId: "${secondEngineId}"
            action: submit
          }) {
            id
            engineId
            status
            validStateActions
          }
        }`;

        results = await sdkClient.query(
          query,
          {},
          getRequestHeaders(adminOptions)
        );
        expect(results.updateEngineBuild).toBeDefined();
        expect(results.updateEngineBuild.id).toEqual(engineBuildId);
        expect(results.updateEngineBuild.engineId).toEqual(engineId);
        expect(results.updateEngineBuild.status).toEqual('approved');
        expect(results.updateSecondEngineBuild).toBeDefined();
        expect(results.updateSecondEngineBuild.id).toEqual(secondEngineBuildId);
        expect(results.updateSecondEngineBuild.engineId).toEqual(
          secondEngineId
        );
        expect(results.updateSecondEngineBuild.status).toEqual('approved');

        query = `
          mutation {
            updateEngineBuild: updateEngineBuild (
              input: {
                id: "${engineBuildId}"
                engineId: "${engineId}"
                action: deploy
              }
            ) {
              id
              name
              status
            }
            secondUpdateEngineBuild: updateEngineBuild (
              input: {
                id: "${secondEngineBuildId}"
                engineId: "${secondEngineId}"
                action: deploy
              }
            ) {
              id
              name
              status
            }
          }
        `;
        results = await sdkClient.query(
          query,
          {},
          getRequestHeaders(adminOptions)
        );
      });
      it('should create package with engine resources', async () => {
        const results = await sdkClient.sdk.packageCreate(
          {
            input: {
              id: uuid.v4(),
              description:
                'a mock package to evaluate grant for an organization',
              distributionType: EngineDistributionType.Public,
              status: PackageStatus.Published,
              version: '1.0',
              name: `${AIWARE_CI_TEST_STAMP} citest_package_${Date.now()}`,
              organizationId: noEngineGrantOrg.id,
              resources: [
                {
                  resourceId: engineId,
                  resourceType: PackageResourceType.Engine,
                  action: PackageResourceAction.Add
                },
                {
                  resourceId: secondEngineId,
                  resourceType: PackageResourceType.Engine,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
        expect(_.get(results, 'data.packageCreate.id')).toBeDefined();
        packageId = _.get(results, 'data.packageCreate.id');
      });

      it('should grant created package for the organization', async () => {
        const results = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: packageId,
              packageGrants: [
                {
                  organizationId: noEngineGrantOrg.id,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
        const packageUpdateGrants = _.get(results, 'data.packageUpdateGrants');
        expect(packageUpdateGrants).toBeDefined();
        expect(packageUpdateGrants?.id).toEqual(packageId);

        // verify that the grant was added
        await validatePackageGrant(
          'GRANT',
          packageId,
          sdkClient,
          {},
          adminOptions
        );
      });
      it('should get engines after granted', async () => {
        const result = await sdkClient.sdk.engines(
          {
            ids: [engineId, secondEngineId]
          },
          getRequestHeaders(adminOptions)
        );

        const engines = _.get(result, 'data.engines.records');
        expect(engines).toBeDefined();
        expect(engines).toHaveLength(2);
      });

      it('should add an engine to blacklist', async () => {
        const result = await sdkClient.sdk.addToEngineBlacklist({
          toAdd: {
            engineIds: [secondEngineId],
            organizationId: noEngineGrantOrg.id
          }
        });
        const engines = _.get(result, 'data.addToEngineBlacklist.engines');
        expect(engines).toBeDefined();
        // TODO: To prevent spam data, engine blacklist records should be cleaned after engine deletion
        const engineIds = _.map(engines, 'id');
        expect(engineIds).toEqual(expect.arrayContaining([secondEngineId]));
      });
      it('should add engine category to blacklist', async () => {
        const result = await sdkClient.sdk.addToEngineBlacklist({
          toAdd: {
            engineCategoryIds: [TRANSLATION_ENGINE_CATEGORY_ID],
            organizationId: noEngineGrantOrg.id
          }
        });
        const engineCategories = _.get(
          result,
          'data.addToEngineBlacklist.engineCategories'
        );
        expect(engineCategories).toBeDefined();
        expect(engineCategories).toHaveLength(1);
        expect(engineCategories?.[0]?.id).toEqual(
          TRANSLATION_ENGINE_CATEGORY_ID
        );
      });
      it('should get engines after adding to blacklist', async () => {
        const result = await sdkClient.sdk.engines(
          {
            ids: [engineId, secondEngineId]
          },
          getRequestHeaders(adminOptions)
        );

        const engines = _.get(result, 'data.engines.records');
        expect(engines).toBeDefined();
        expect(engines).toHaveLength(1);
        expect(engines?.[0]?.id).toEqual(engineId);
      });
      xit('should get engine category after adding blacklist', async () => {
        const ids = [TRANSLATION_ENGINE_CATEGORY_ID];
        const result = await sdkClient.sdk.engineCategories({ ids });
        const engineCategories = _.get(result, 'data.engineCategories.records');
        expect(engineCategories).toBeDefined();
        expect(engineCategories).toHaveLength(0);
      });
      it('should delete the engine and engineCategory from blacklist', async () => {
        const query = `
            mutation deleteFromEngineBlacklist {
              deleteFromEngineBlacklist(toDelete: {
                engineIds: ["${secondEngineId}"]
                organizationId: ${noEngineGrantOrg.id}
              }) {
                engines {
                  id
                }
              },
              deleteFromEngineCategoryBlacklist: deleteFromEngineBlacklist(toDelete: {
                engineCategoryIds: ["${TRANSLATION_ENGINE_CATEGORY_ID}"]
                organizationId: ${noEngineGrantOrg.id}
              }) {
                engineCategories {
                  id
                }
              }
            }
          `;
        const result = await sdkClient.query(query, {});
        const engines = _.get(result, 'deleteFromEngineBlacklist.engines');
        const engineCategories = _.get(
          result,
          'deleteFromEngineCategoryBlacklist.engineCategories'
        );

        expect(engines).toBeDefined();
        expect(engines).toHaveLength(0);
        expect(engineCategories).toBeDefined();
        expect(engineCategories).toHaveLength(0);
      });

      it('should remove engine from white list via granted', async () => {
        let result = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: packageId,
              packageGrants: [
                {
                  organizationId: noEngineGrantOrg.id,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Remove
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
        const packageUpdateGrants = _.get(result, 'data.packageUpdateGrants');
        expect(packageUpdateGrants).toBeDefined();
        expect(packageUpdateGrants?.id).toEqual(packageId);

        // verify that the grant was removed

        const packageGrantRes = await sdkClient.sdk.packageGrants({
          id: packageId
        });
        expect(
          _.get(packageGrantRes, 'data.packageGrants.records.length')
        ).toEqual(0);
      });
      it('should get engines after removing granted', async () => {
        const result = await sdkClient.sdk.engines(
          {
            ids: [engineId]
          },
          getRequestHeaders(adminOptions)
        );

        const engines = _.get(result, 'data.engines.records');
        expect(engines).toBeDefined();
        expect(engines).toHaveLength(1);
      });

      it('clean up test data', async () => {
        await safe(`deleteEngine ${engineId}`, () =>
          deleteEngine(engineId, adminOptions)
        );

        await safe(`deleteEngine ${secondEngineId}`, () =>
          deleteEngine(secondEngineId, adminOptions)
        );

        await safe(`deleteEngineBuild ${engineBuildId}`, () =>
          deleteEngineBuild(engineId, engineBuildId, adminOptions)
        );
        engineBuildId = null;
        engineId = null;

        await safe(`deleteEngineBuild ${secondEngineBuildId}`, () =>
          deleteEngineBuild(secondEngineId, secondEngineBuildId, adminOptions)
        );
        secondEngineBuildId = null;
        secondEngineId = null;

        await safe(`deletePackage ${packageId}`, () =>
          deletePackage(packageId, adminOptions)
        );
        packageId = null;
      });
    });

    // TODO: skip until AWT-9376 and AWT-9377 tickets have completed.
    // New org in the enablePackageGrantLogic == true environment
    // will automatically get useEngineGrant == true feature flag
    describe('Tests engine grant with useEngineGrant enabled', () => {
      let publicEnginesPackageId: string;
      let adminOptions: any;

      beforeAll(() => {
        adminOptions = engineGrantSuperAdminOptions;
      });

      it('should get engine categories before granting', async () => {
        const result = await sdkClient.sdk.engineCategories(
          {
            limit: 10
          },
          getRequestHeaders(adminOptions)
        );
        const engineCategories = _.get(result, 'data.engineCategories');
        expect(engineCategories).toBeDefined();
        expect(engineCategories?.records).toHaveLength(0);
      });
      it('should get/create the publicEngines package', async () => {
        // getting before create new package

        let isRecordsEmpty = false;
        let results = await sdkClient.sdk.queryPackages(
          {
            nameRegexp: publicEnginesPackageName,
            distributionType: EngineDistributionType.Public,
            status: PackageStatus.Published
          },
          getRequestHeaders(adminOptions)
        );

        let recordsArray = _.get(results, 'data.packages.records')?.length || 0;
        if (recordsArray > 0) {
          publicEnginesPackageId = _.get(
            results,
            'data.packages.records.[0].id',
            ''
          );
        } else {
          isRecordsEmpty = true;
        }

        // if not existing, create one
        if (!publicEnginesPackageId || isRecordsEmpty === true) {
          const results = await sdkClient.sdk.packageCreate(
            {
              input: {
                id: uuid.v4(),
                organizationId: engineGrantOrg.id,
                name: publicEnginesPackageName,
                description:
                  'a mock package to evaluate grant for an organization',
                distributionType: EngineDistributionType.Public,
                status: PackageStatus.Published,
                version: '1.0'
              }
            },
            getRequestHeaders(adminOptions)
          );
          expect(_.get(results, 'data.packageCreate.id')).toBeDefined();
          publicEnginesPackageId = _.get(results, 'data.packageCreate.id', '');
        }

        expect(publicEnginesPackageId).toBeDefined();
      });
      it('grant publicEngines package for the organization', async () => {
        const result = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: publicEnginesPackageId,
              packageGrants: [
                {
                  organizationId: engineGrantOrg.id,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
        const packageUpdateGrants = _.get(result, 'data.packageUpdateGrants');
        expect(packageUpdateGrants).toBeDefined();
        expect(packageUpdateGrants?.id).toEqual(publicEnginesPackageId);
      });
      it('get engine categories after granted', async () => {
        const result = await sdkClient.sdk.engineCategories({
          limit: 10
        });
        const engineCategories = _.get(result, 'data.engineCategories');
        expect(engineCategories).toBeDefined();
        expect(engineCategories?.records?.length).toBeGreaterThan(0);
      });
    });

    describe('support granting access to automateNodes, useEngineGrant disabled', () => {
      let adminOptions: any;
      let orgAdminOptionsInOtherOrg: any;
      let tdoId: string, cloneTDOId: string;
      let packageId: string;
      let resourceFolderId: string;

      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
        orgAdminOptionsInOtherOrg = engineGrantOrgAdminOptions;
      });

      afterAll(async () => {
        if (packageId) {
          await safe('delete automateNode package', () =>
            deletePackage(packageId, adminOptions)
          );
        }

        if (tdoId) {
          await safe('delete source automateNode TDO', () => deleteTDO(tdoId));
        }

        if (cloneTDOId) {
          await safe('delete cloned automateNode TDO', () =>
            deleteTDO(cloneTDOId)
          );
        }
      });

      it('creates automateNode', async () => {
        const name = `citest_automateNode_${Date.now()}`;
        const query = `
        mutation createTDOwithAsset {
          createTDOWithAsset(input:{
            startDateTime:${startDateTime},
            contentType: "application/gzip"
            assetType: "automateNode"
            name: "${AIWARE_CI_TEST_STAMP} ${name}"
            addToIndex: true
            uri: "./citest/data/AutomateNode-1.1.1.gz"
            details: {
              tags: [
                {
                  value: "automateNode"
                }
              ],
              addToIndex: true,
              automateNode: {
                  module: "AutomateNode",
                  type: "AutomateType",
                  version: "1.1.1",
                  author: "citest",
                  desc: "desc",
                  keywords: "test"
              }
            }
          }){
            id
          }
        }`;
        let result = await sdkClient.uploadFile(
          query,
          'AutomateNode-1.1.1.gz',
          './citest/data/AutomateNode-1.1.1.gz'
        );
        result = await sdkClient.query(
          query,
          {},
          getRequestHeaders(adminOptions)
        );
        tdoId = _.get(result, 'createTDOWithAsset.id');
        expect(tdoId).toBeTruthy();
      });
      it('should create package with automateNode resource', async () => {
        const results = await sdkClient.sdk.packageCreate(
          {
            input: {
              organizationId: noEngineGrantOrg.id,
              name: `${AIWARE_CI_TEST_STAMP} citest_automateNode_package_${Date.now()}`,
              description:
                'a mock package to evaluate grant for an organization',
              version: '1.0.0',
              primaryResourceId: tdoId,
              resources: [
                {
                  resourceId: tdoId,
                  resourceType: PackageResourceType.AutomateNode,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
        expect(_.get(results, 'data.packageCreate.id')).toBeDefined();
        expect(_.get(results, 'data.packageCreate.version')).toEqual('1.0.0');
        packageId = _.get(results, 'data.packageCreate.id', '');
      });
      it('should validate automateNode access before granting - queryTDO should fail', async () => {
        await expect(
          sdkClient.sdk.GetTemporalDataObject(
            { id: tdoId },
            getRequestHeaders(orgAdminOptionsInOtherOrg)
          )
        ).rejects.toThrow(
          'The specified object does not exist or access not granted.'
        );
      });
      it('should grant created package for an organization', async () => {
        const results = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: packageId,
            packageGrants: [
              {
                organizationId: engineGrantOrg.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        });
        expect(_.get(results, 'data.packageUpdateGrants')).toBeDefined();
        expect(_.get(results, 'data.packageUpdateGrants.id')).toEqual(
          packageId
        );
      });
      it('should retrieve a valid grant', async () => {
        const results = await sdkClient.sdk.packageGrants(
          {
            id: packageId,
            orgId: engineGrantOrg.id
          },
          getRequestHeaders(adminOptions)
        );
        const packageGrant = _.head(
          _.get(results, 'data.packageGrants.records')
        );
        expect(packageGrant).toBeDefined();
        expect(packageGrant?.package.id).toEqual(packageId);
      });
      it('should get shared package', async () => {
        const results = await sdkClient.sdk.queryPackages(
          {
            id: packageId,
            packageFilter: {
              primaryResourceType: PackageResourceType.AutomateNode
            }
          },
          getRequestHeaders(orgAdminOptionsInOtherOrg)
        );

        const automateNodePackage = _.head(
          _.get(results, 'data.packages.records')
        );
        const packageResource = _.head(
          _.get(automateNodePackage, 'resources.records')
        );
        expect(automateNodePackage).toBeDefined();
        expect(automateNodePackage?.id).toEqual(packageId);
        expect(packageResource).toBeDefined();

        cloneTDOId = packageResource?.resourceId || '';
      });
      it('should validate automateNode access after granting', async () => {
        const results = await sdkClient.sdk.GetTemporalDataObject(
          { id: cloneTDOId },
          getRequestHeaders(orgAdminOptionsInOtherOrg)
        );

        const temporalDataObject = _.get(results, 'data.temporalDataObject');
        expect(temporalDataObject).toBeDefined();
        expect(temporalDataObject?.id).toEqual(cloneTDOId);
      });
      xit('should be filed in the nodes subfolder', async () => {
        let query = `
          query rootFolders {
            rootFolders (type: resource) {
              id
              childFolders(names: ["nodes"], nameMatch: exact) {
                records {
                  id
                }
              }
            }
          }
        `;
        let results = await sdkClient.query(
          query,
          {},
          getRequestHeaders(noEngineGrantOrgAdminOptions)
        );

        resourceFolderId = _.get(
          results,
          'rootFolders[0].childFolders.records[0].id'
        );
        expect(resourceFolderId).toBeDefined();

        results = await sdkClient.sdk.GetTemporalDataObject(
          { id: cloneTDOId },
          getRequestHeaders(orgAdminOptionsInOtherOrg)
        );
        const parentFolderIds = _.map(
          _.get(results, 'data.GetTemporalDataObject.folders'),
          'id'
        );
        expect(parentFolderIds).toEqual(
          expect.arrayContaining([resourceFolderId])
        );
      });
      it('should remove granting for an organization', async () => {
        const results = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: packageId,
            packageGrants: [
              {
                organizationId: engineGrantOrg.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Remove
              }
            ]
          }
        });
        expect(_.get(results, 'data.packageUpdateGrants')).toBeDefined();
        expect(_.get(results, 'data.packageUpdateGrants.id')).toEqual(
          packageId
        );
      });
      it('should validate automateNode access after granting remove - queryTDO should fail', async () => {
        await expect(
          sdkClient.sdk.GetTemporalDataObject(
            { id: cloneTDOId },
            getRequestHeaders(orgAdminOptionsInOtherOrg)
          )
        ).rejects.toThrow(
          'The specified object does not exist or access not granted.'
        );
      });
      it('clean up test data', async () => {
        await safe('delete automateNode package', () =>
          deletePackage(packageId, adminOptions)
        );
        packageId = '';

        await safe('delete source automateNode TDO', () => deleteTDO(tdoId));
        tdoId = '';

        await safe('delete cloned automateNode TDO', () =>
          deleteTDO(cloneTDOId)
        );
        cloneTDOId = '';
      });
    });

    describe('support granting access to automatePalettes, useEngineGrant disabled', () => {
      let adminOptions: any;
      let orgAdminOptionsInOtherOrg: any;
      let tdoId: string, cloneTDOId: string;
      let packageId: string;
      let resourceFolderId: string;

      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
        orgAdminOptionsInOtherOrg = engineGrantOrgAdminOptions;
      });

      afterAll(async () => {
        if (packageId) {
          await safe('delete automatePalette package', () =>
            deletePackage(packageId, adminOptions)
          );
        }

        if (tdoId) {
          await safe('delete source automatePalette TDO', () =>
            deleteTDO(tdoId)
          );
        }

        if (cloneTDOId) {
          await safe('delete cloned automatePalette TDO', () =>
            deleteTDO(cloneTDOId)
          );
        }
      });

      it('creates automatePalette', async () => {
        const name = `citest_automatePalette_${Date.now()}`;

        const result = await sdkClient.sdk.createTDO(
          {
            input: {
              startDateTime: startDateTime,
              stopDateTime: stopDateTime,
              name: name,
              addToIndex: false,
              details: {
                tags: [{ value: 'automatePalette' }],
                addToIndex: false,
                nodeModules: {
                  moduleName: '@gagestestorg/npm_private_test_package',
                  moduleRepo: 'npm',
                  isPrivateRepo: true,
                  isPrivateRegistry: false,
                  moduleVersion: '1.0.0',
                  scope: 'gagestestorg',
                  registryUrl: '',
                  sshUrl: ''
                }
              }
            }
          },
          getRequestHeaders(adminOptions)
        );
        tdoId = _.get(result, 'data.createTDO.id', '');
        expect(tdoId).toBeTruthy();
      });
      it('should create package with automatePalette resource', async () => {
        const results = await sdkClient.sdk.packageCreate(
          {
            input: {
              organizationId: noEngineGrantOrg.id,
              name: `${AIWARE_CI_TEST_STAMP} citest_automatePalette_package_${Date.now()}`,
              description:
                'a mock package to evaluate grant for an organization',
              version: '1.0.0',
              primaryResourceId: tdoId,
              resources: [
                {
                  resourceId: tdoId,
                  resourceType: PackageResourceType.AutomatePalette,
                  action: PackageResourceAction.Add
                }
              ],
              distributionType: EngineDistributionType.Private
            }
          },
          getRequestHeaders(adminOptions)
        );
        expect(_.get(results, 'data.packageCreate.id')).toBeDefined();
        expect(_.get(results, 'data.packageCreate.version')).toEqual('1.0.0');
        expect(_.get(results, 'data.packageCreate.distributionType')).toEqual(
          'private'
        );
        packageId = _.get(results, 'data.packageCreate.id', '');
      });
      it('should validate automatePalette access before granting - queryTDO should fail', async () => {
        await expect(
          sdkClient.sdk.GetTemporalDataObject(
            { id: tdoId },
            getRequestHeaders(orgAdminOptionsInOtherOrg)
          )
        ).rejects.toThrow(
          'The specified object does not exist or access not granted.'
        );
      });
      it('should grant created package for an organization', async () => {
        const results = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: packageId,
            packageGrants: [
              {
                organizationId: engineGrantOrg.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        });
        expect(_.get(results, 'data.packageUpdateGrants')).toBeDefined();
        expect(_.get(results, 'data.packageUpdateGrants.id')).toEqual(
          packageId
        );
      });
      it('should retrieve a valid grant', async () => {
        const results = await sdkClient.sdk.packageGrants(
          {
            id: packageId,
            orgId: engineGrantOrg.id,
            packageFilter: {
              distributionType: EngineDistributionType.Private
            }
          },
          getRequestHeaders(adminOptions)
        );
        const packageGrant = _.head(
          _.get(results, 'data.packageGrants.records')
        );
        expect(packageGrant).toBeDefined();
        expect(packageGrant?.package.id).toEqual(packageId);
      });
      it('should get shared package', async () => {
        const results = await sdkClient.sdk.queryPackages(
          {
            id: packageId,
            packageFilter: {
              primaryResourceType: PackageResourceType.AutomatePalette
            }
          },
          getRequestHeaders(orgAdminOptionsInOtherOrg)
        );

        const automatePalettePackage = _.head(
          _.get(results, 'data.packages.records')
        );
        const packageResource = _.head(
          _.get(automatePalettePackage, 'resources.records')
        );
        expect(automatePalettePackage).toBeDefined();
        expect(automatePalettePackage?.id).toEqual(packageId);
        expect(packageResource).toBeDefined();

        cloneTDOId = packageResource?.resourceId || '';
      });
      it('should validate automatePalette access after granting', async () => {
        const results = await sdkClient.sdk.GetTemporalDataObject(
          {
            id: cloneTDOId
          },
          getRequestHeaders(orgAdminOptionsInOtherOrg)
        );

        const temporalDataObject = _.get(results, 'data.temporalDataObject');
        expect(temporalDataObject).toBeDefined();
        expect(temporalDataObject?.id).toEqual(cloneTDOId);
      });
      it('should be filed in the palettes subfolder', async () => {
        let query = `
          query rootFolders {
            rootFolders (type: resource) {
              id
              childFolders(names: ["palettes"], nameMatch: exact) {
                records {
                  id
                }
              }
            }
          }
        `;
        let results = await sdkClient.query(
          query,
          {},
          getRequestHeaders(noEngineGrantOrgAdminOptions)
        );
        resourceFolderId = _.get(
          results,
          'rootFolders[0].childFolders.records[0].id'
        );
        expect(resourceFolderId).toBeDefined();

        results = await sdkClient.sdk.GetTemporalDataObject(
          {
            id: cloneTDOId
          },
          getRequestHeaders(orgAdminOptionsInOtherOrg)
        );
        const parentFolderIds = _.map(
          _.get(results, 'data.temporalDataObject.folders'),
          'id'
        );
        expect(parentFolderIds).toEqual(
          expect.arrayContaining([resourceFolderId])
        );
      });
      it('should remove granting for an organization', async () => {
        const results = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: packageId,
            packageGrants: [
              {
                organizationId: engineGrantOrg.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Remove
              }
            ]
          }
        });
        expect(_.get(results, 'data.packageUpdateGrants')).toBeDefined();
        expect(_.get(results, 'data.packageUpdateGrants.id')).toEqual(
          packageId
        );
      });
      it('should validate automatePalette access after granting remove - queryTDO should fail', async () => {
        await expect(
          sdkClient.sdk.GetTemporalDataObject(
            {
              id: cloneTDOId
            },
            getRequestHeaders(orgAdminOptionsInOtherOrg)
          )
        ).rejects.toThrow(
          'The specified object does not exist or access not granted.'
        );
      });
      it('clean up test data', async () => {
        await safe('delete automatePalette package', () =>
          deletePackage(packageId, adminOptions)
        );
        packageId = '';

        await safe('delete source automatePalette TDO', () => deleteTDO(tdoId));
        tdoId = '';

        await safe('delete cloned automatePalette TDO', () =>
          deleteTDO(cloneTDOId)
        );
        cloneTDOId = '';
      });
    });

    describe('use package grant with nested packages, superAdmin', () => {
      const nestedPackageA = uuid.v4();
      const nestedPackageB = uuid.v4();
      const nestedPackageC = uuid.v4();
      const parentPackage = uuid.v4();
      let tdoA: string;
      let tdoB: string;
      let tdoC: string;
      const sourceId = uuid.v4();

      afterAll(async () => {
        await safe(`delete package ${parentPackage}`, () =>
          deletePackage(parentPackage)
        );
        await safe(`delete package ${nestedPackageC}`, () =>
          deletePackage(nestedPackageC)
        );
        await safe(`delete package ${nestedPackageB}`, () =>
          deletePackage(nestedPackageB)
        );
        await safe(`delete package ${nestedPackageA}`, () =>
          deletePackage(nestedPackageA)
        );

        if (tdoA) {
          await safe(`delete TDO ${tdoA}`, () => deleteTDO(tdoA));
        }
        if (tdoB) {
          await safe(`delete TDO ${tdoB}`, () => deleteTDO(tdoB));
        }
        if (tdoC) {
          await safe(`delete TDO ${tdoC}`, () => deleteTDO(tdoC));
        }
      });

      it('should create TDOs for test bed', async () => {
        let result = await sdkClient.sdk.createTDO({
          input: {
            startDateTime: 1623253937,
            stopDateTime: 1623259000,
            source: '123',
            name: `${AIWARE_CI_TEST_STAMP} TDOA`,
            description: 'TDO A',
            isPublic: false,
            applicationId: '123'
          }
        });
        let createTDO = _.get(result, 'data.createTDO');
        expect(createTDO).toBeDefined();
        tdoA = createTDO?.id || '';

        result = await sdkClient.sdk.createTDO({
          input: {
            startDateTime: 1623253937,
            stopDateTime: 1623259000,
            source: '123',
            name: `${AIWARE_CI_TEST_STAMP} TDOB`,
            description: 'TDO B',
            isPublic: false,
            applicationId: '123'
          }
        });
        createTDO = _.get(result, 'data.createTDO');
        expect(createTDO).toBeDefined();
        tdoB = createTDO?.id || '';

        result = await sdkClient.sdk.createTDO({
          input: {
            startDateTime: 1623253937,
            stopDateTime: 1623259000,
            source: '123',
            name: `${AIWARE_CI_TEST_STAMP} TDOC`,
            description: 'TDO C',
            isPublic: false,
            applicationId: '123'
          }
        });
        createTDO = _.get(result, 'data.createTDO');
        expect(createTDO).toBeDefined();
        tdoC = createTDO?.id || '';
      });
      it('should create nested package A', async () => {
        const result = await sdkClient.sdk.packageCreate({
          input: {
            id: nestedPackageA,
            organizationId: engineGrantOrg.id,
            name: `${AIWARE_CI_TEST_STAMP} Nested Package A`,
            version: '1.0.1',
            sourceOriginId: sourceId,
            resources: [
              { resourceId: tdoA, resourceType: PackageResourceType.Tdo }
            ]
          }
        });
        const packageCreate = _.get(result, 'data.packageCreate');
        expect(packageCreate).toBeDefined();
      });

      it('should create nested package B', async () => {
        const result = await sdkClient.sdk.packageCreate({
          input: {
            id: nestedPackageB,
            organizationId: engineGrantOrg.id,
            name: `${AIWARE_CI_TEST_STAMP} Nested Package B`,
            version: '1.0.2',
            sourceOriginId: sourceId,
            resources: [
              {
                resourceId: nestedPackageA,
                resourceType: PackageResourceType.Package
              },
              { resourceId: tdoA, resourceType: PackageResourceType.Tdo }
            ]
          }
        });
        const packageCreate = _.get(result, 'data.packageCreate');
        expect(packageCreate).toBeDefined();
      });

      it('should create nested package C', async () => {
        const result = await sdkClient.sdk.packageCreate({
          input: {
            id: nestedPackageC,
            organizationId: engineGrantOrg.id,
            name: `${AIWARE_CI_TEST_STAMP} Nested Package C`,
            version: '1.0.3',
            sourceOriginId: sourceId,
            resources: [
              {
                resourceId: nestedPackageB,
                resourceType: PackageResourceType.Package
              },
              { resourceId: tdoA, resourceType: PackageResourceType.Tdo },
              { resourceId: tdoB, resourceType: PackageResourceType.Tdo }
            ]
          }
        });
        const packageCreate = _.get(result, 'data.packageCreate');
        expect(packageCreate).toBeDefined();
      });

      it('should create the parent package', async () => {
        const result = await sdkClient.sdk.packageCreate({
          input: {
            id: parentPackage,
            organizationId: engineGrantOrg.id,
            name: `${AIWARE_CI_TEST_STAMP} Parent Package`,
            version: '1.0.4',
            sourceOriginId: sourceId,
            resources: [
              {
                resourceId: nestedPackageC,
                resourceType: PackageResourceType.Package
              },
              { resourceId: tdoA, resourceType: PackageResourceType.Tdo },
              { resourceId: tdoB, resourceType: PackageResourceType.Tdo },
              { resourceId: tdoC, resourceType: PackageResourceType.Tdo }
            ]
          }
        });
        const packageCreate = _.get(result, 'data.packageCreate');
        expect(packageCreate).toBeDefined();
      });

      it('should get all nested resources', async () => {
        const result = await sdkClient.sdk.queryPackages({ id: parentPackage });
        const packages = _.get(result, 'data.packages.records');
        expect(packages).toBeDefined();
        expect(packages?.[0]?.nestedResources).toBeDefined();
        expect(packages?.[0]?.nestedResources?.records).toBeDefined();
        expect(packages?.[0]?.nestedResources?.records.length).toEqual(10);
      });

      it('should get nested TDO types', async () => {
        const packagesQuery = `
            query packages {
              packages(id: "${parentPackage}") {
                records {
                  nestedResources(type: tdo) {
                    records {
                      id
                      resourceType
                      packageId
                      referencePaths
                    }
                  }
                }
              }
            }
          `;

        const result = await sdkClient.query(packagesQuery);

        expect(result.packages.records).toBeDefined();
        expect(result.packages.records[0].nestedResources).toBeDefined();
        expect(
          result.packages.records[0].nestedResources.records
        ).toBeDefined();
        expect(
          result.packages.records[0].nestedResources.records.length
        ).toEqual(7);
      });

      it('should get nested Package types', async () => {
        const packagesQuery = `
            query packages {
              packages(id: "${parentPackage}") {
                records {
                  nestedResources(type: package) {
                    records {
                      id
                      resourceType
                      packageId
                      referencePaths
                    }
                  }
                }
              }
            }
          `;

        const result = await sdkClient.query(packagesQuery);

        expect(result.packages.records).toBeDefined();
        expect(result.packages.records[0].nestedResources).toBeDefined();
        expect(
          result.packages.records[0].nestedResources.records
        ).toBeDefined();
        expect(
          result.packages.records[0].nestedResources.records.length
        ).toEqual(3);
      });

      it('should NOT retrieve a valid grant on the nested package', async () => {
        const result = await sdkClient.sdk.packageGrants({
          orgId: engineGrantOrg.id
        });
        const packageGrants = _.get(result, 'data.packageGrants');
        expect(packageGrants).toBeDefined();

        const packageIdsToFilter = [
          parentPackage,
          nestedPackageA,
          nestedPackageB,
          nestedPackageC
        ];

        const packageIds = _.filter(
          packageGrants?.records,
          (packageRecord: any) =>
            packageIdsToFilter.includes(packageRecord.package.id)
        );

        expect(packageIds.length).toEqual(0);
      });

      it('should grant nested packages with the grant(s) of the parent package', async () => {
        const result = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: parentPackage,
            packageGrants: [
              {
                organizationId: engineGrantOrg.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        });
        const packageUpdateGrants = _.get(result, 'data.packageUpdateGrants');
        expect(packageUpdateGrants).toBeDefined();
        expect(packageUpdateGrants?.id).toEqual(parentPackage);

        // verify that the grantTypes were set correctly for each package
        await validatePackageGrant('GRANT', parentPackage, sdkClient);
        await validatePackageGrant('GRANT', nestedPackageA, sdkClient);
        await validatePackageGrant('GRANT', nestedPackageB, sdkClient);
        await validatePackageGrant('GRANT', nestedPackageC, sdkClient);
      });

      it('clean up source TDOs', async () => {
        await safe(`delete TDO ${tdoA}`, () => deleteTDO(tdoA));
        tdoA = '';
        await safe(`delete TDO ${tdoB}`, () => deleteTDO(tdoB));
        tdoB = '';
        await safe(`delete TDO ${tdoC}`, () => deleteTDO(tdoC));
        tdoC = '';
      });
    });

    describe('support granting access to applications, useAppGrant disabled / enabled', () => {
      let adminOptions: any;
      let ci_app_grant_package: any;
      let app_uuid = uuid.v4();
      let testAppId: string;
      let testApp = {
        id: uuid.v4(),
        name: `${AIWARE_CI_TEST_STAMP} Package App - ${app_uuid}}`,
        key: `citest-package-app ${app_uuid}`,
        description: `Citest Package App - ${app_uuid}`,
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false,
        status: ApplicationStatus.Active
      };
      let ci_app_owned_package: any;
      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
      });
      it('should create application', async () => {
        const result = await sdkClient.sdk.createApplication(
          {
            input: {
              name: testApp.name,
              // key: testApp.key,
              description: testApp.description,
              url: testApp.url,
              oauth2RedirectUrls: [testApp.oauth2RedirectUrls],
              checkPermissions: testApp.checkPermissions,
              status: testApp.status
            }
          },
          getRequestHeaders(adminOptions)
        );
        testAppId = _.get(result, 'data.createApplication.id', '');
        expect(testAppId).toBeDefined();
      });
      it('should create package with application resource', async () => {
        let resultAppGrantPackageMutation = await sdkClient.sdk.packageCreate(
          {
            input: {
              name: `${AIWARE_CI_TEST_STAMP} citest appGrant test package`,
              version: '1.0',
              primaryResourceId: testAppId,
              resources: [
                {
                  resourceId: testAppId,
                  resourceType: PackageResourceType.Application,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );

        ci_app_grant_package = _.get(
          resultAppGrantPackageMutation,
          'data.packageCreate'
        );
      });
      it('should validate application access before granting - query applications should fail', async () => {
        const query = `
          query {
            applications(
              id: "${testAppId}"
              owned: false
              excludeViewOnly: false
            ) {
              records {
                id
                name
                organizationId
                status

              }
            }
          }
        `;
        const result = await sdkClient.query(
          query,
          {},
          getRequestHeaders(appGrantOrgAdminOptions)
        );

        const appData = _.get(result, 'applications.records');
        expect(appData).toBeDefined();
        expect(appData.length).toEqual(0);
      });
      it('should grant package to organization with VIEW access', async () => {
        const result = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: ci_app_grant_package.id,
              packageGrants: [
                {
                  organizationId: appGrantOrg.id,
                  action: PackageGrantAction.Add,
                  grantType: PackageGrantType.View
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
        expect(_.get(result, 'data.packageUpdateGrants.id')).toEqual(
          ci_app_grant_package.id
        );

        // verify that the grantType was set correctly
        await validatePackageGrant(
          'VIEW',
          ci_app_grant_package.id,
          sdkClient,
          {},
          adminOptions
        );
      });

      it('should create a package owned by organization', async () => {
        let resultAppGrantPackageMutation = await sdkClient.sdk.packageCreate({
          input: {
            name: `${AIWARE_CI_TEST_STAMP} citest org owned packages`,
            version: '1.0',
            organizationId: appGrantOrg.id
          }
        });
        ci_app_owned_package = _.get(
          resultAppGrantPackageMutation,
          'data.packageCreate'
        );

        expect(ci_app_owned_package).toBeDefined();
      });

      xit('admin user should fetch both granted and org-owned packages', async () => {
        const packagesResult = await sdkClient.sdk.queryPackages(
          { ids: [ci_app_grant_package.id, ci_app_owned_package.id] },
          getRequestHeaders(adminOptions)
        );

        const packages = _.get(packagesResult, 'data.packages.records');
        expect(packages?.length).toEqual(2);
      });

      it('regular user with AIWARE_DEVELOPER_ENGINE_READ should fetch both granted and org-owned packages', async () => {
        const packagesResult = await sdkClient.sdk.queryPackages(
          { ids: [ci_app_grant_package.id, ci_app_owned_package.id] },
          getRequestHeaders(appGrantOrgRegularOptions)
        );

        const packages = _.get(packagesResult, 'data.packages.records');
        expect(packages?.length).toEqual(2);
      });

      it('regular user without AIWARE_DEVELOPER_ENGINE_READ should fetch only granted packages', async () => {
        const packagesResult = await sdkClient.sdk.queryPackages(
          { ids: [ci_app_grant_package.id, ci_app_owned_package.id] },
          getRequestHeaders(appGrantOrgRegularNoRoleOptions)
        );

        const packages = _.get(packagesResult, 'data.packages.records');
        expect(packages?.length).toEqual(1);
      });
      it('superadmin should see same packages via packages query and packageGrants', async () => {
        const grantedIds = await getGrantedPackageIds(
          appGrantOrg.id,
          adminOptions
        );
        const fetchedPackages = await getPackagesByIds(
          grantedIds,
          adminOptions
        );

        expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
      });

      it('developer user should see same packages from packages and packageGrants', async () => {
        const grantedIds = await getGrantedPackageIds(
          appGrantOrg.id,
          appGrantOrgRegularOptions
        );
        const fetchedPackages = await getPackagesByIds(
          grantedIds,
          appGrantOrgRegularOptions
        );

        expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
      });

      it('regular user without developer permission should see same granted packages from both APIs', async () => {
        const grantedIds = await getGrantedPackageIds(
          appGrantOrg.id,
          appGrantOrgRegularNoRoleOptions
        );
        const fetchedPackages = await getPackagesByIds(
          grantedIds,
          appGrantOrgRegularNoRoleOptions
        );

        expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
      });

      it('should validate application access with grantType VIEW', async () => {
        let query, result;
        query = `
          query {
            applications(
              id: "${testAppId}"
              owned: false
              excludeViewOnly: false
            ) {
              records {
                id
                name
                organizationId
                status

              }
            }
          }
        `;
        result = await sdkClient.query(
          query,
          {},
          getRequestHeaders(appGrantOrgAdminOptions)
        );
        const getApps = _.get(result, 'applications.records');
        expect(getApps.length).toEqual(1);
        expect(getApps[0].id).toEqual(testAppId);
        // excludeViewOnly is true -> check granted app only
        query = `
          query {
            applications(
              id: "${testAppId}"
              owned: false
            ) {
              records {
                id
                name
                organizationId
                status
              }
            }
          }
        `;
        result = await sdkClient.query(
          query,
          {},
          getRequestHeaders(appGrantOrgAdminOptions)
        );
        const appData = _.get(result, 'applications.records');
        expect(appData).toBeDefined();
        expect(appData.length).toEqual(0);
      });
      it('should update grant type to GRANT', async () => {
        const result = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: ci_app_grant_package.id,
            packageGrants: [
              {
                organizationId: appGrantOrg.id,
                action: PackageGrantAction.Add,
                grantType: PackageGrantType.Grant
              }
            ]
          }
        });
        expect(_.get(result, 'data.packageUpdateGrants.id')).toEqual(
          ci_app_grant_package.id
        );

        // verify that the grantType was set correctly
        await validatePackageGrant(
          'GRANT',
          ci_app_grant_package.id,
          sdkClient,
          {},
          adminOptions
        );
      });
      it('should validate application access with grantType GRANT', async () => {
        let query, result;
        query = `
          query {
            applications(
              id: "${testAppId}"
              owned: false
            ) {
              records {
                id
                name
                organizationId
                status

              }
            }
          }
        `;
        result = await sdkClient.query(
          query,
          {},
          getRequestHeaders(appGrantOrgAdminOptions)
        );
        const getApps = _.get(result, 'applications.records');
        expect(getApps.length).toEqual(1);
        expect(getApps[0].id).toEqual(testAppId);
      });
      it('should update grant type to DENY', async () => {
        const result = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: ci_app_grant_package.id,
            packageGrants: [
              {
                organizationId: appGrantOrg.id,
                action: PackageGrantAction.Add,
                grantType: PackageGrantType.Deny
              }
            ]
          }
        });
        expect(_.get(result, 'data.packageUpdateGrants.id')).toEqual(
          ci_app_grant_package.id
        );

        // verify that the grantType was set correctly
        await validatePackageGrant(
          'DENY',
          ci_app_grant_package.id,
          sdkClient,
          {},
          adminOptions
        );
      });
      it('should validate application access with grantType DENY', async () => {
        let query, result;
        query = `
          query {
            applications(
              id: "${testAppId}"
              owned: false
            ) {
              records {
                id
                name
                organizationId
                status

              }
            }
          }
        `;
        result = await sdkClient.query(
          query,
          {},
          getRequestHeaders(appGrantOrgAdminOptions)
        );
        const appData = _.get(result, 'applications.records');
        expect(appData).toBeDefined();
        expect(appData.length).toEqual(0);
      });
      it('should delete package', async () => {
        await deletePackage(ci_app_grant_package.id, adminOptions);
        await deletePackage(ci_app_owned_package.id);
      });
      it('should delete application', async () => {
        const result = await sdkClient.sdk.deleteApplication({
          id: testAppId
        });
        const deletedApp = _.get(result, 'data.deleteApplication');
        expect(deletedApp?.id).toEqual(testAppId);
      });
    });
  });

  describe('validation against circular package references, useEngineGrant and useAppGrant disabled', () => {
    const firstUniqueId = Date.now().valueOf();
    const secondUniqueId = Date.now().valueOf() + 1;
    let adminOptions: any;
    let firstAppId: string, secondAppId: string;
    let idFirstPackage: string, idSecondPackage: string;
    let result: any;

    beforeAll(async () => {
      adminOptions = noEngineGrantSuperAdminOptions;

      let resultFirstCreateApplication = await sdkClient.sdk.createApplication(
        {
          input: {
            name: `${AIWARE_CI_TEST_STAMP} App 1 for package - ${firstUniqueId}`,
            // key: `citest-app-1-for-package-${firstUniqueId}`,
            description: 'Citest App 1 for package test',
            url: 'www.example.com',
            checkPermissions: false,
            status: ApplicationStatus.Active
          }
        },
        getRequestHeaders(adminOptions)
      );

      let app1 = _.get(resultFirstCreateApplication, 'data.createApplication');
      firstAppId = _.get(app1, 'id', '');
      expect(firstAppId).toBeDefined();

      let resultSecondCreateApplication = await sdkClient.sdk.createApplication(
        {
          input: {
            name: `${AIWARE_CI_TEST_STAMP} App 1 for package - ${secondUniqueId}`,
            // key: `citest-app-1-for-package-${secondUniqueId}`,
            description: 'Citest App 1 for package test',
            url: 'www.example.com',
            checkPermissions: false,
            status: ApplicationStatus.Active
          }
        },
        getRequestHeaders(adminOptions)
      );

      let app2 = _.get(resultSecondCreateApplication, 'data.createApplication');
      secondAppId = _.get(app2, 'id', '');
      expect(secondAppId).toBeDefined();

      // Find the auto created package (if any)

      result = await sdkClient.sdk.queryPackages({
        primaryResourceId: firstAppId
      });
      let packages = _.get(result, 'data.packages');
      idFirstPackage = _.get(packages, 'records[0].id');

      if (!idFirstPackage) {
        let resultFirstCreatePackageMutation =
          await sdkClient.sdk.packageCreate(
            {
              input: {
                name: `${AIWARE_CI_TEST_STAMP} citest test package 1`,
                version: '1.0',
                primaryResourceId: firstAppId,
                status: PackageStatus.Published,
                resources: [
                  {
                    resourceId: firstAppId,
                    resourceType: PackageResourceType.Application,
                    action: PackageResourceAction.Add
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

        let ci_packageOne = _.get(
          resultFirstCreatePackageMutation,
          'data.packageCreate'
        );

        idFirstPackage = _.get(ci_packageOne, 'id', '');
        expect(
          _.get(ci_packageOne, 'resources.records')?.length
        ).toBeGreaterThan(0);
      } else {
        // If package auto created, we must update the state to published

        result = await sdkClient.sdk.packageUpdate({
          input: {
            id: idFirstPackage,
            status: PackageStatus.Published
          }
        });
      }

      expect(idFirstPackage).toBeDefined();

      // Find the auto created package (if any)

      result = await sdkClient.sdk.queryPackages({
        primaryResourceId: secondAppId
      });
      packages = _.get(result, 'data.packages');
      idSecondPackage = _.get(packages, 'records[0].id');

      if (!idSecondPackage) {
        let resultSecondCreatePackageMutation =
          await sdkClient.sdk.packageCreate(
            {
              input: {
                name: `${AIWARE_CI_TEST_STAMP} citest test package 2`,
                version: '1.0',
                primaryResourceId: secondAppId,
                status: PackageStatus.Published,
                resources: [
                  {
                    resourceId: secondAppId,
                    resourceType: PackageResourceType.Application,
                    action: PackageResourceAction.Add
                  }
                ]
              }
            },
            getRequestHeaders(adminOptions)
          );

        let ci_packageTwo = _.get(
          resultSecondCreatePackageMutation,
          'data.packageCreate'
        );

        idSecondPackage = _.get(ci_packageTwo, 'id', '');

        expect(
          _.get(ci_packageTwo, 'resources.records')?.length
        ).toBeGreaterThan(0);
      } else {
        // If package auto created, we must update the state to published

        result = await sdkClient.sdk.packageUpdate({
          input: {
            id: idSecondPackage,
            status: PackageStatus.Published
          }
        });
      }

      expect(idSecondPackage).toBeDefined();
    });

    it('avoid cycle in a nested package for packageUpdate', async () => {
      let resultFirstPackageUpdate = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: idFirstPackage,
            resources: [
              {
                resourceId: idSecondPackage,
                resourceType: PackageResourceType.Package,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(adminOptions)
      );

      let packageUpdateResult = _.get(
        resultFirstPackageUpdate,
        'data.packageUpdate'
      );
      let IdForFirstPackage = _.get(packageUpdateResult, 'id');
      expect(IdForFirstPackage).toBeDefined();

      try {
        result = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: idSecondPackage,
              resources: [
                {
                  resourceId: idFirstPackage,
                  resourceType: PackageResourceType.Package,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );
      } catch (e: any) {
        let error = JSON.parse(e.message);
        expect(result).toBeUndefined();
        expect(error[0].message).toEqual(
          `A cycle has been detected in a nested package of ${idSecondPackage}.`
        );
        expect(error[0].name).toEqual('nested_resources_cycle_detected');
        expect(error[0].data.validationErrors[0].fieldName).toEqual(
          'packageId'
        );
        expect(
          error[0].data.validationErrors[0].fieldValue.nestedPackage
        ).toEqual(idSecondPackage);
        expect(
          error[0].data.validationErrors[0].fieldValue.referencePathsWithIds
            .length
        ).toEqual(2);
        expect(
          error[0].data.validationErrors[0].fieldValue.referencePathsWithIds[0]
        ).toEqual(idSecondPackage);
        expect(
          error[0].data.validationErrors[0].fieldValue.referencePathsWithIds[1]
        ).toEqual(idFirstPackage);
        expect(
          error[0].data.validationErrors[0].fieldValue.referencePaths.length
        ).toEqual(2);
        expect(
          error[0].data.validationErrors[0].fieldValue.referencePaths[0]
        ).toEqual('citest test package 2 (1.0.0)');
        expect(
          error[0].data.validationErrors[0].fieldValue.referencePaths[1]
        ).toEqual('citest test package 1 (1.0.0)');
      }
    });
  });

  describe('enforce resources to be in the active/published state before a package can change its current state', () => {
    it('should fail package state change to non-draft due to application resource not in the active state', async () => {
      let result = await sdkClient.sdk.createApplication({
        input: {
          name: `${AIWARE_CI_TEST_STAMP} Draft Application - ${uuid.v4()}`,
          status: ApplicationStatus.Draft,
          checkPermissions: false,
          // key: `CITestApp - ${uuid.v4()}`,
          url: 'www.example.com'
        }
      });
      let createApplication = _.get(result, 'data.createApplication');
      expect(createApplication).toBeDefined();
      expect(createApplication?.id).toBeDefined();

      const draftApplicationId = createApplication?.id;

      // Find the auto created package (if any)

      const packageResult = await sdkClient.sdk.queryPackages({
        primaryResourceId: draftApplicationId
      });
      const packages = _.get(packageResult, 'data.packages');
      let testPackageId = _.get(packages, 'records[0].id');

      if (!testPackageId) {
        result = await sdkClient.sdk.packageCreate({
          input: {
            name: `${AIWARE_CI_TEST_STAMP} Package - ${uuid.v4()}`,
            organizationId: '7682',
            version: '1.0.0',
            primaryResourceId: draftApplicationId,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: draftApplicationId || ''
              }
            ]
          }
        });
        let packageCreate = _.get(result, 'data.packageCreate');
        expect(packageCreate).toBeDefined();
        testPackageId = _.get(packageCreate, 'id', '');
        expect(testPackageId).toBeDefined();
      }

      // Try to move the package to the next state (non-draft state),
      // but should fail since the application is in draft status

      try {
        result = await sdkClient.sdk.packageUpdate({
          input: {
            id: testPackageId || '',
            status: PackageStatus.Published
          }
        });
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });

  itif(
    !(global as any).enablePackageGrantLogic,
    'should pass package state change to non-draft due to application resource in the active state',
    async () => {
      let result = await sdkClient.sdk.createApplication({
        input: {
          name: `${AIWARE_CI_TEST_STAMP} Active Application - ${uuid.v4()}`,
          status: ApplicationStatus.Active,
          checkPermissions: false,
          // key: `CITestApp - ${uuid.v4()}`,
          url: 'www.citest.com'
        }
      });
      let createApplication = _.get(result, 'data.createApplication');
      expect(createApplication).toBeDefined();
      expect(createApplication?.id).toBeDefined();

      const activeApplicationId = createApplication?.id;

      // Find the auto created package (if any)

      const PackageResult = await sdkClient.sdk.queryPackages({
        primaryResourceId: activeApplicationId
      });
      const packages = _.get(PackageResult, 'data.packages');
      let testPackageId = _.get(packages, 'records[0].id');

      if (!testPackageId) {
        result = await sdkClient.sdk.packageCreate({
          input: {
            name: `${AIWARE_CI_TEST_STAMP} Package - ${uuid.v4()}`,
            organizationId: '7682',
            version: '1.0.0',
            primaryResourceId: activeApplicationId,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: activeApplicationId || ''
              }
            ]
          }
        });
        let packageCreate = _.get(result, 'data.packageCreate');
        expect(packageCreate).toBeDefined();
        testPackageId = _.get(packageCreate, 'id');
        expect(testPackageId).toBeDefined();
      }

      result = await sdkClient.sdk.packageUpdate({
        input: {
          id: testPackageId || '',
          status: PackageStatus.Pending
        }
      });
      let packageUpdate = _.get(result, 'data.packageUpdate');
      expect(packageUpdate).toBeDefined();

      expect(_.get(packageUpdate, 'id')).toBeDefined();
    }
  );

  itif(
    !(global as any).enablePackageGrantLogic,
    'should fail package state change to non-draft due to schema resource not in the published state, useAppGrant = true',
    async () => {
      let result = await sdkClient.sdk.createDataRegistry(
        {
          input: {
            name: `DataRegistry - ${uuid.v4()}`,
            description: '',
            source: ''
          }
        },
        getRequestHeaders(appGrantOrgAdminOptions)
      );
      const createDataRegistry = _.get(result, 'data.createDataRegistry');
      expect(createDataRegistry).toBeDefined();
      expect(createDataRegistry?.id).toBeDefined();

      const dataRegistryId = createDataRegistry?.id;

      result = await sdkClient.sdk.upsertSchemaDraft(
        {
          input: {
            schema: schema,
            majorVersion: 1,
            dataRegistryId: dataRegistryId || ''
          }
        },
        getRequestHeaders(appGrantOrgAdminOptions)
      );
      const upsertSchemaDraft = _.get(result, 'data.upsertSchemaDraft');
      expect(upsertSchemaDraft).toBeDefined();
      const draftSchemaId = _.get(upsertSchemaDraft, 'id');
      expect(draftSchemaId).toBeDefined();

      result = await sdkClient.sdk.packageCreate(
        {
          input: {
            name: `${AIWARE_CI_TEST_STAMP} Package - ${uuid.v4()}`,
            organizationId: appGrantOrg.id,
            version: '1.0.0',
            primaryResourceId: draftSchemaId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: draftSchemaId || ''
              }
            ]
          }
        },
        getRequestHeaders(appGrantOrgAdminOptions)
      );
      let packageCreate = _.get(result, 'data.packageCreate');
      expect(packageCreate).toBeDefined();
      const testPackageId = _.get(packageCreate, 'id');
      expect(testPackageId).toBeDefined();

      try {
        result = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testPackageId || '',
              status: PackageStatus.Published
            }
          },
          getRequestHeaders(appGrantOrgAdminOptions)
        );
        expect(_.get(result, 'data.packageUpdate.id')).toBeUndefined();
      } catch (err: any) {
        expect(err).toBeDefined();
        expect(err.toString()).toContain(
          'Resource is inactive. This package cannot be published until all its resources are active/published.'
        );
      }
    }
  );

  itif(
    !(global as any).enablePackageGrantLogic,
    'should pass package state change to non-draft due to schema resource in the published state',
    async () => {
      let result = await sdkClient.sdk.createDataRegistry({
        input: {
          name: `DataRegistry - ${uuid.v4()}`,
          description: '',
          source: '',
          isPublic: true
        }
      });
      const createDataRegistry = _.get(result, 'data.createDataRegistry');
      expect(createDataRegistry).toBeDefined();
      expect(createDataRegistry?.id).toBeDefined();

      const dataRegistryId = createDataRegistry?.id;

      result = await sdkClient.sdk.upsertSchemaDraft({
        input: {
          schema: schema,
          majorVersion: 1,
          dataRegistryId: dataRegistryId || ''
        }
      });
      const upsertSchemaDraft = _.get(result, 'data.upsertSchemaDraft');
      expect(upsertSchemaDraft).toBeDefined();
      const activeSchemaId = _.get(upsertSchemaDraft, 'id');
      expect(activeSchemaId).toBeDefined();

      result = await sdkClient.sdk.updateSchemaState({
        input: {
          status: SchemaStatus.Published,
          id: activeSchemaId || ''
        }
      });
      const updateSchemaState = _.get(result, 'data.updateSchemaState');
      expect(updateSchemaState).toBeDefined();
      expect(_.get(updateSchemaState, 'id')).toBeDefined();

      result = await sdkClient.sdk.packageCreate({
        input: {
          name: `${AIWARE_CI_TEST_STAMP} Package - ${uuid.v4()}`,
          organizationId: '7682',
          version: '1.0.0',
          primaryResourceId: activeSchemaId,
          resources: [
            {
              resourceType: PackageResourceType.Schema,
              resourceId: activeSchemaId || ''
            }
          ]
        }
      });
      let packageCreate = _.get(result, 'data.packageCreate');
      expect(packageCreate).toBeDefined();

      const testPackageId = _.get(packageCreate, 'id');
      expect(testPackageId).toBeDefined();

      try {
        result = await sdkClient.sdk.packageUpdate({
          input: {
            id: testPackageId || '',
            status: PackageStatus.Pending
          }
        });
      } catch (err) {
        expect(err).toBeDefined();
      }
    }
  );

  itif(
    !(global as any).enablePackageGrantLogic,
    'should fail package state change to non-draft due to engine resource not in the active state',
    async () => {
      // Fix: The org does not have access to 078d34a7-80b4-4efe-903f-2f13392deca8 - Generator

      let result = await sdkClient.sdk.createEngine({
        input: {
          name: `${AIWARE_CI_TEST_STAMP} Engine - ${uuid.v4()}`,
          categoryId: defaultEngineCategoryId,
          deploymentModel: DeploymentModel.NonNetworkIsolated
        }
      });
      const createEngine = _.get(result, 'data.createEngine');
      expect(createEngine).toBeDefined();
      expect(createEngine?.id).toBeDefined();

      const testEngineId = createEngine?.id;

      result = await sdkClient.sdk.packageCreate({
        input: {
          name: `${AIWARE_CI_TEST_STAMP} Package - ${uuid.v4()}`,
          organizationId: '7682',
          version: '1.0.0',
          primaryResourceId: testEngineId,
          resources: [
            {
              resourceType: PackageResourceType.Engine,
              resourceId: testEngineId || ''
            }
          ]
        }
      });
      let packageCreate = _.get(result, 'data.packageCreate');
      expect(packageCreate).toBeDefined();
      expect(_.get(packageCreate, 'id')).toBeDefined();

      const testPackageId = _.get(packageCreate, 'id');

      try {
        result = await sdkClient.sdk.packageUpdate({
          input: {
            id: testPackageId || '',
            status: PackageStatus.Pending
          }
        });
      } catch (err) {
        expect(err).toBeDefined();
      }
    }
  );

  itif(
    !(global as any).enablePackageGrantLogic,
    'should pass package state change to non-draft due to engine resources in the active state',
    async () => {
      let result = await sdkClient.sdk.createEngine({
        input: {
          name: `${AIWARE_CI_TEST_STAMP} Engine - ${uuid.v4()}`,
          categoryId: defaultEngineCategoryId,
          deploymentModel: DeploymentModel.NonNetworkIsolated
        }
      });
      const createEngine = _.get(result, 'data.createEngine');
      expect(createEngine).toBeDefined();
      expect(createEngine?.id).toBeDefined();

      const testEngineId = createEngine?.id;

      result = await sdkClient.sdk.createEngineBuild({
        input: {
          engineId: testEngineId || '',
          dockerImage: 'mcr.microsoft.com/dotnet/samples:aspnetapp'
        }
      });
      const createEngineBuild = _.get(result, 'data.createEngineBuild') as any;
      expect(createEngineBuild).toBeDefined();
      expect(createEngineBuild.id).toBeDefined();

      let testEngineBuildId = createEngineBuild?.id;

      result = await sdkClient.sdk.updateEngineBuild({
        input: {
          id: testEngineBuildId,
          engineId: testEngineId || '',
          dockerImage: 'mcr.microsoft.com/dotnet/samples:aspnetapp',
          action: BuildUpdateAction.Upload
        }
      });
      let updateEngineBuild = _.get(result, 'data.updateEngineBuild');
      expect(updateEngineBuild).toBeDefined();
      expect(_.get(updateEngineBuild, 'id')).toBeDefined();

      try {
        result = await sdkClient.sdk.updateEngineBuild({
          input: {
            id: testEngineBuildId,
            engineId: testEngineId || '',
            action: BuildUpdateAction.Deploy
          }
        });

        updateEngineBuild = _.get(result, 'data.updateEngineBuild');
        expect(updateEngineBuild).toBeDefined();
        expect(_.get(updateEngineBuild, 'id')).toBeDefined();
      } catch (ex) {
        // Sometimes we cannot update build status due to the validation
        // [{"message":"not a valid build action in current build state","name":"not_allowed","time_thrown":"2023-11-02T10:01:40.533Z",
        // "data":{"objectType":"action","objectData":"deploy","currentBuildState":"invalid","validBuildStates":["delete"],
        console.log('Unable to update build status', ex);
        testEngineBuildId = null;
      }

      // Find the auto created package (if any)

      const packageRes = await sdkClient.sdk.queryPackages({
        primaryResourceId: testEngineId
      });
      const packages = _.get(packageRes, 'data.packages');
      let testPackageId = _.get(packages, 'records[0].id');

      if (!testPackageId) {
        const resourceList = [
          {
            resourceType: PackageResourceType.Engine,
            resourceId: testEngineId
          }
        ];
        if (testEngineBuildId) {
          resourceList.push({
            resourceType: PackageResourceType.EngineBuild,
            resourceId: testEngineBuildId
          });
        }
        result = await sdkClient.sdk.packageCreate({
          input: {
            name: `,CI Test Package - ${uuid.v4()}`,
            organizationId: '7682',
            version: '1.0.0',
            primaryResourceId: testEngineId,
            resources: resourceList as any
          }
        });
        let packageCreate = _.get(result, 'data.packageCreate') as any;
        expect(packageCreate).toBeDefined();
        expect(packageCreate?.id).toBeDefined();

        testPackageId = packageCreate?.id;
      }

      result = await sdkClient.sdk.packageUpdate({
        input: {
          id: testPackageId || '',
          status: PackageStatus.Pending
        }
      });
      let packageUpdate = _.get(result, 'data.packageUpdate') as any;
      expect(packageUpdate).toBeDefined();
      expect(packageUpdate.id).toBeDefined();
    }
  );
  describe('Final Test Artifact Clean-Up', () => {
    it('should clean up test artifacts', async () => {
      // delete packages and resources

      const packagesResult = await sdkClient.sdk.queryPackages({
        nameRegexp: AIWARE_CI_TEST_STAMP
      });
      const packages = _.get(packagesResult, 'data.packages');
      const resources: any[] = [];
      // delete any residual packages
      for (const record of packages?.records ?? []) {
        // delete the package resources
        await Promise.all(
          (record?.resources?.records ?? []).map(async (resource: any) => {
            // avoid duplicate resource deletion
            if (
              _.find(
                resources,
                (resourceId: any) => resourceId === resource.resourceId
              )
            ) {
              return;
            }

            if (resource.resourceType === 'engine') {
              const engineId = resource.resourceId;
              resources.push(engineId);
              await safe(`delete engine ${engineId}`, () =>
                deleteEngine(engineId)
              );
            } else if (resource.resourceType === 'application') {
              const applicationId = resource.resourceId;
              resources.push(applicationId);
              await safe(`delete application ${applicationId}`, () =>
                deleteApplication(applicationId)
              );
            } else if (resource.resourceType === 'tdo') {
              // delete the cloned tdo added to this package
              const tdoId = resource.resourceId;
              resources.push(tdoId);
              await safe(`delete TDO ${tdoId}`, () => deleteTDO(tdoId));
            }
          })
        );

        // delete the package
        const packageId = record?.id;
        if (packageId) {
          await safe(`delete package ${packageId}`, () =>
            deletePackage(packageId)
          );
        }
      }
    });
  });
});

// async function getOrganization(name, ignoreExpect) {
//   const getOrgGQL = `
//       query getOrganization {
//         organizations(
//           name: "${name}"
//           nameMatch: contains
//         ) {
//           records {
//             id
//             guid
//             name
//             rootFolder {
//               id
//               name
//               description
//             }
//             jsondata
//             users {
//               records {
//                 name
//                 id
//                 organizationGuid
//                 organizationId
//                 authGroups {
//                   records {
//                     id
//                     name
//                     description
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }`;

//   const resultOrgGql = await gqlClient.query(getOrgGQL);
//   const engineGrantOrg = _.get(resultOrgGql, 'organizations.records[0]');

//   if (!ignoreExpect) {
//     expect(engineGrantOrg).toBeDefined();
//     expect(engineGrantOrg.name).toContain(name);
//     expect(engineGrantOrg.users).toBeDefined();
//   }

//   return engineGrantOrg;
// }

async function deleteApplication(applicationId: string) {
  if (applicationId) {
    const result = await sdkClient.sdk.deleteApplication({
      id: applicationId
    });

    const applicationDeleted = _.get(result, 'data.deleteApplication');
    expect(applicationDeleted).toBeDefined();
    if (applicationDeleted) {
      expect(applicationDeleted.id).toEqual(applicationId);
    }
  }
}

async function deleteTDO(tdoId: string) {
  if (tdoId) {
    const result = await sdkClient.sdk.deleteTDO({
      id: tdoId
    });
    const tdoDeleted = _.get(result, 'data.deleteTDO');
    expect(tdoDeleted?.id).toEqual(tdoId);
  }
}

async function deleteEngine(id: string, adminOptions?: any) {
  if (id) {
    try {
      const engineDeleted = await sdkClient.sdk.deleteEngine(
        {
          id: id
        },
        getRequestHeaders(adminOptions)
      );

      const engineDeletedData = _.get(engineDeleted, 'data.deleteEngine');
      expect(engineDeletedData?.id).toEqual(id);
    } catch (error: any) {
      expect(error.message).toContain('engine has been deleted');
    }
  }
}

async function deleteEngineBuild(
  engineId: string,
  engineBuildId: string,
  adminOptions: any
) {
  if (engineId && engineBuildId) {
    const engineBuildDeleted = await sdkClient.sdk.deleteEngineBuild(
      {
        input: {
          id: engineBuildId,
          engineId: engineId
        }
      },
      getRequestHeaders(adminOptions)
    );

    const engineBuildDeletedData = _.get(
      engineBuildDeleted,
      'data.deleteEngineBuild'
    );
    expect(engineBuildDeletedData?.id).toEqual(engineBuildId);
  }
}

async function deletePackage(id: string, adminOptions?: any) {
  if (id) {
    const packageDeleted = await sdkClient.sdk.packageDelete(
      {
        id: id
      },
      getRequestHeaders(adminOptions)
    );

    const packageDeletedData = _.get(packageDeleted, 'data.packageDelete');
    expect(packageDeletedData?.success).toEqual(true);
  }
}

async function setupTestOrganization(
  sdkClient: GraphqlClient,
  prefixName: string,
  useEngineGrant: boolean = false,
  useAppGrant: boolean = false
) {
  // set up organization

  const variables = {
    kvp: {
      features: {
        enableRBACFeature: 'disabled',
        useEngineGrant: useEngineGrant ? 'enabled' : 'disabled',
        useAppGrant: useAppGrant ? 'enabled' : 'disabled'
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
  };
  const org = await sdkClient.sdk.createOrganization({
    input: {
      name: `${prefixName}-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
      metadata: variables.kvp,
      applications: variables.apps
    }
  });

  const orgData = _.get(org, 'data.createOrganization');
  expect(orgData).toBeDefined();

  return orgData;
}

async function updateUserRole(
  userId: string,
  orgId: string,
  roleIds: string[] = []
) {
  const result = await sdkClient.sdk.updateUser({
    input: {
      id: userId,
      roleIds: roleIds,
      organizationId: orgId
    }
  });

  const updateUser = _.get(result, 'data.updateUser');
  expect(updateUser).toBeDefined();
  expect(updateUser?.id).toBeDefined();
}

async function createOrgAdminUser(
  sdkClient: GraphqlClient,
  prefixName: string,
  orgId: string
) {
  const adminUser = await sdkClient.sdk.createUser({
    input: {
      name: `${prefixName}-citest-admin-user-${uuid.v4()}@localhost`,
      organizationId: orgId,
      jsondata: {},
      roleIds: ROLES_IDS
    }
  });
  const userData = _.get(adminUser, 'data.createUser');
  expect(userData).toBeDefined();
  expect(userData?.id).toBeDefined();

  return userData;
}

async function createApplication(adminOptions: any) {
  const query = `
      mutation CreateApplicationWithRoles($appRolesInput: [CreateApplicationRole!]) {
        createApplication(input: {
          name: "ci-test-app-role-${uuid.v4()}",
          description: "ci-test-app-role",
          url: "www.example.com",
          checkPermissions: true,
          status: active
          applicationRoles: $appRolesInput
        }) {
          id
          applicationRoles(ownedOnly: false) {
            id
            name
            permissions
          }
        }
      }`;
  const variables = {
    appRolesInput: {
      id: uuid.v4(),
      name: `ci-aiware-test-app-role-${uuid.v4()}`,
      description: 'ci-aiware-test-app-role',
      isPrivate: false,
      isAppEventRole: false,
      permissions: [AuthPermissionType.DeveloperEngineRead]
    }
  };

  const result = await sdkClient.query(
    query,
    variables,
    getRequestHeaders(adminOptions)
  );

  return _.get(result, 'createApplication');
}

async function createRegularUser(
  prefixName: string,
  orgId: string,
  aiwareRoleId: string,
  suffix = ''
) {
  const userName = `${prefixName}-citest-regular-user${
    suffix ? '-' + suffix : ''
  }-${uuid.v4()}@localhost`;

  const result = await sdkClient.sdk.createUser({
    input: {
      name: userName,
      organizationId: orgId,
      jsondata: {},
      roleIds: aiwareRoleId ? [aiwareRoleId] : []
    }
  });
  return _.get(result, 'data.createUser');
}

async function impersonateUser(
  userId: string,
  orgGuid: string,
  superToken: string
) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${orgGuid}`;
  const options = helpers.requestOptions(superToken);
  const res = await chakram.get(url, options);
  expect(_.get(res, 'body.token')).toBeDefined();
  return helpers.requestOptions(_.get(res, 'body.token'));
}

function extractPackageIdsFromResults(results: any, type = 'packages') {
  if (type === 'packages') {
    return _.map(_.get(results, 'records'), 'id');
  } else {
    return _.map(_.get(results, 'records'), (r: any) => _.get(r, 'package.id'));
  }
}

const getGrantedPackageIds = async (orgId: string, userOptions: any) => {
  const grantsRes = await sdkClient.sdk.packageGrants(
    {
      orgId: orgId,
      limit: 1000
    },
    getRequestHeaders(userOptions)
  );
  const packageData = _.get(grantsRes, 'data.packageGrants');
  return extractPackageIdsFromResults(packageData, 'grants');
};

const getPackagesByIds = async (ids: string[], userOptions: any) => {
  const packagesRes = await sdkClient.sdk.queryPackages(
    { ids: ids, limit: 1000 },
    getRequestHeaders(userOptions)
  );
  const packageData = _.get(packagesRes, 'data.packages');
  return extractPackageIdsFromResults(packageData, 'packages');
};
