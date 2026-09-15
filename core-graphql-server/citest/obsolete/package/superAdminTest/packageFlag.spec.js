/* global pending */
const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const { createIsolatedSuperadmin } = require('../../helpers/superadminSession');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const chakram = require('chakram');
const moment = require('moment');
let gqlClient;
const { safe } = require('../../helpers/cleanup/utils');

// use this name stamp on packages and resources for clean-up filtering and aiWARE CI Test artifact identification
const citestMarker = global.citestMarker || 'citest-should-delete';
const AIWARE_CI_TEST_STAMP = citestMarker;
const startDateTime = moment().subtract(2, 'hour').unix();
const stopDateTime = moment().subtract(1, 'hour').unix();
const publicEnginesPackageName = `${AIWARE_CI_TEST_STAMP} publicEngines`;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
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

const itif = (condition, ...args) =>
  condition ? it(...args) : it.skip(...args);

const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);
// FIXME: fails in ai13s
// enable this after VE-19898 is done
describe('citest_package: package feature flag', () => {
  let superToken, engineGrantOrg, appGrantOrg, noEngineGrantOrg;
  let session;
  let engineGrantSuperAdminOptions;
  let noEngineGrantSuperAdminOptions;
  let orgAdminUserInNoEngineGrantOrg,
    orgAdminUserInEngineGrantOrg,
    orgAdminUserInAppGrantOrg,
    orgRegularUserInAppGrantOrg,
    orgRegularUserInAppGrantOrgNoRole;
  let engineGrantOrgAdminOptions;
  let appGrantOrgAdminOptions;
  let noEngineGrantOrgAdminOptions;
  let appGrantOrgRegularOptions, appGrantOrgRegularNoRoleOptions;
  const validatePackageGrant = async (
    grantType,
    packageId,
    gqlClient,
    variables = {},
    useTokenAuth = false
  ) => {
    // verify that the grantType was set correctly
    const query = `
    query packageGrants {
      packageGrants(id: "${packageId}") {
        records {
          grantType
        }
      }
    }
  `;
    const result = await gqlClient.query(query, variables, useTokenAuth);
    expect(_.get(result, 'packageGrants.records[0].grantType')).toEqual(
      grantType
    );
  };

  // T46: This suite previously ran on the SHARED superadmin session
  // (sys_graphql_citest_superadmin), which is an admin MEMBER of every test org it creates
  // (createOrganization enrolls the caller via addAdminToOrganization). Many concurrent specs
  // (MAX_WORKERS=2) delete their test org in teardown; org-delete enumerates all active members
  // of that org and calls removeAllUserSessions(userId) on each — which is GLOBAL, not
  // org-scoped, and DELetes every one of the superadmin's session tokens, including this
  // suite's, at any point during the run. Bearer validation is per-token-key existence, so a
  // killed token can never recover. This is the exact T14/T10/T12 mechanism, hitting this file
  // (see T46). Fix: use a throwaway superadmin that is a member of no org except its own, so no
  // other spec's org-delete/user-delete can ever enumerate or kill its session. See
  // helpers/superadminSession.js.
  //
  // The old code's second connect() call ("Re-login so the session token is committed to Redis
  // before graphql validates it") is no longer needed: createIsolatedSuperadmin's own bootstrap
  // does its own connect(), then round-trips through org/user creation and a fresh userLogin
  // over the network before this session's token is ever used, which is far more time than a
  // second immediate connect() gave the original startup race to resolve. It also has its own
  // authentication_error retry (BOOTSTRAP_RETRY_ATTEMPTS) for exactly this class of race.
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    await gqlClient.connect();
    session = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = session.options; // preserve implicit-auth call sites below

    // impersonateUser() below calls the REST /admin/impersonate endpoint directly with a raw
    // bearer token (not through gqlClient), so it needs the isolated superadmin's raw token too.
    superToken = session.token;

    const result = await gqlClient.query(meGql);
    expect(result.me).toBeDefined();
    const superUserId = _.get(result, 'me.id');

    // get citest org which has useEngineGrant and useAppGrant disabled
    let nameOrg = 'citest-no-engine-grant-org';
    // noEngineGrantOrg = await getOrganization(nameOrg, true);
    if (!noEngineGrantOrg) {
      noEngineGrantOrg = await setupTestOrganization(gqlClient, nameOrg, false);
      // add CI-test role to org creater
      await updateUserRole(superUserId, noEngineGrantOrg.id, adminRoles);
    }
    orgAdminUserInNoEngineGrantOrg = _.find(
      _.get(noEngineGrantOrg, 'users.records'),
      (user) => {
        return _.includes(user.name, `${nameOrg}-citest-admin-user`);
      }
    );

    // create org admin user (noEngineGrantOrg)
    if (!orgAdminUserInNoEngineGrantOrg) {
      orgAdminUserInNoEngineGrantOrg = await createOrgAdminUser(
        gqlClient,
        nameOrg,
        noEngineGrantOrg.id
      );
    }

    // get citest org which has useEngineGrant is enabled
    nameOrg = 'citest-engine-grant-org';
    // engineGrantOrg = await getOrganization(nameOrg, true);
    if (!engineGrantOrg) {
      engineGrantOrg = await setupTestOrganization(gqlClient, nameOrg, true);
      // add CI-test role to org creater
      await updateUserRole(superUserId, engineGrantOrg.id, adminRoles);
    }
    orgAdminUserInEngineGrantOrg = _.find(
      _.get(engineGrantOrg, 'users.records'),
      (user) => {
        return _.includes(user.name, `${nameOrg}-citest-admin-user`);
      }
    );

    // create org admin user (engineGrantOrg)
    if (!orgAdminUserInEngineGrantOrg) {
      orgAdminUserInEngineGrantOrg = await createOrgAdminUser(
        gqlClient,
        nameOrg,
        engineGrantOrg.id
      );
    }

    // get citest org which has useAppGrant is enabled
    nameOrg = 'citest-app-grant-org';
    // appGrantOrg = await getOrganization(nameOrg, true);
    if (!appGrantOrg) {
      appGrantOrg = await setupTestOrganization(gqlClient, nameOrg, true, true);
      // add CI-test role to org creater
      await updateUserRole(superUserId, appGrantOrg.id, adminRoles);
    }
    orgAdminUserInAppGrantOrg = _.find(
      _.get(appGrantOrg, 'users.records'),
      (user) => {
        return _.includes(user.name, `${nameOrg}-citest-admin-user`);
      }
    );

    // create org admin user (appGrantOrg)
    if (!orgAdminUserInAppGrantOrg) {
      orgAdminUserInAppGrantOrg = await createOrgAdminUser(
        gqlClient,
        nameOrg,
        appGrantOrg.id
      );
    }
    // Login for super Admin user (engineGrantOrg)
    engineGrantSuperAdminOptions = await impersonateUser(
      superUserId,
      engineGrantOrg.guid,
      superToken
    );

    // Login for super Admin user (noEngineGrantOrg)
    noEngineGrantSuperAdminOptions = await impersonateUser(
      superUserId,
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
      (user) => user.name.includes(`${nameOrg}-citest-regular-user-with-role`)
    );
    orgRegularUserInAppGrantOrgNoRole = _.find(
      _.get(appGrantOrg, 'users.records'),
      (user) => user.name.includes(`${nameOrg}-citest-regular-user-no-role`)
    );
    // create org regular user (appGrantOrg)
    if (!orgRegularUserInAppGrantOrg) {
      // create application for appGrantOrg
      const application = await createApplication(appGrantOrgAdminOptions);
      const applicationRole =
        _.find(application.applicationRoles, (role) =>
          role.name.includes('aiware')
        ) || application.applicationRoles[0];

      // add app to org
      await gqlClient.query(
        `mutation addApp {
          applicationAddToOrg (
            orgId: ${appGrantOrg.id}
            appId: "${application.id}"
            configs: [{
              configKey: "test_${uuid.v4()}",
              configValue: "test"
            }]
          ) {
            id
          }
        }`
      );

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

  afterAll(async () => {
    await session?.cleanup();
  });

  // TODO: Should enable when the changes are deployed to dev env.
  describe('#package operations', () => {
    describe('Test for query TDOs using resourceAlias, useEngineGrant and useAppGrant disabled', () => {
      let adminOptions;
      let tdoId_1, tdoId_2, tdoId_3;
      let packageId, packageId1, packageId3, distributionType;
      let appId, appResourceAlias;
      const clearTDOs = new Set();
      const clearPackages = new Set();
      const clearApps = new Set();
      const uniqueId = Date.now().valueOf();

      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
      });

      afterAll(async () => {
        if (clearApps.size) {
          for (const apId of clearApps) {
            await safe(`afterAll delete application ${apId}`, async () =>
              deleteApplication(apId, adminOptions)
            );
          }
        }

        if (clearPackages.size) {
          for (const packageId of clearPackages) {
            await safe(`afterAll delete package ${packageId}`, async () =>
              deletePackage(packageId, adminOptions)
            );
          }
        }

        if (clearTDOs.size) {
          for (const tdoId of clearTDOs) {
            await safe(`afterAll delete TDO ${tdoId}`, async () =>
              deleteTDO(tdoId, adminOptions)
            );
          }
        }
      });

      it('should create TDO', async () => {
        let query, result, tdo;
        query = `
          mutation createTDO {
            createTDO(
              input: {
                name: "citest test TDO 1"
                status: "uploaded"
                startDateTime: 1476726655
                stopDateTime: 1476726655
              }
            ) {
              id
              name
            }
          }
        `;
        result = await gqlClient.query(query, {}, adminOptions);
        tdo = _.get(result, 'createTDO');
        tdoId_1 = _.get(tdo, 'id');
        clearTDOs.add(tdoId_1);
        expect(tdoId_1).toBeDefined();
        query = `
          mutation createTDO {
            createTDO(
              input: {
                name: "citest test TDO 2"
                status: "uploaded"
                startDateTime: 1476726655
                stopDateTime: 1476726655
              }
            ) {
              id
              name
            }
          }
        `;
        result = await gqlClient.query(query, {}, adminOptions);
        tdo = _.get(result, 'createTDO');
        tdoId_2 = _.get(tdo, 'id');
        clearTDOs.add(tdoId_2);
        expect(tdoId_2).toBeDefined();

        // Tdo 3
        query = `
          mutation createTDO {
            createTDO(
              input: {
                name: "citest test TDO 3"
                status: "uploaded"
                startDateTime: 1476726655
                stopDateTime: 1476726655
              }
            ) {
              id
              name
            }
          }
        `;
        result = await gqlClient.query(query, {}, adminOptions);
        tdo = _.get(result, 'createTDO');
        tdoId_3 = _.get(tdo, 'id');
        clearTDOs.add(tdoId_3);
        expect(tdoId_3).toBeDefined();
      });
      it('should create application', async () => {
        let query, result, app;
        query = `
          mutation createApp {
            createApplication(
              input: {
                name: "${AIWARE_CI_TEST_STAMP} App 1 for package - ${uniqueId}"
                key: "citest-app-1-for-package-${uniqueId}"
                description: "Citest App 1 for package test"
                url: "www.example.com"
                checkPermissions: false
              }
            ) {
              id
            }
          }
        `;
        result = await gqlClient.query(query, {}, adminOptions);
        app = _.get(result, 'createApplication');
        appId = _.get(app, 'id');
        expect(appId).toBeDefined();
        clearApps.add(appId);
      });
      it('should create package with TDO 1 resources', async () => {
        let query, result, ci_package;
        query = `
          mutation createPackage {
            packageCreate(
              input: {
                name: "${AIWARE_CI_TEST_STAMP} package 1"
                version: "1.0"
                primaryResourceId: "${appId}"
                resources: [
                  {
                    resourceId: "${appId}"
                    resourceType: application
                    action: ADD
                  },
                  {
                    resourceId: "${tdoId_1}"
                    resourceType: tdo
                    resourceAlias: "tdo 1"
                    action: ADD
                  }
                ]
              }
            ) {
              id
              resources {
                records {
                  id
                  resourceId
                  resourceType
                  resourceAlias
                }
              }
            }
          }
        `;
        result = await gqlClient.query(query, {}, adminOptions);
        ci_package = _.get(result, 'packageCreate');
        packageId = _.get(ci_package, 'id');
        expect(_.get(ci_package, 'id')).toBeDefined();
        expect(_.get(ci_package, 'resources.records').length).toBeGreaterThan(
          0
        );

        // validate resource Alias
        _.get(ci_package, 'resources.records', []).forEach((pr) => {
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
        const query = `
          mutation createPackage {
            packageCreate(
              input: {
                name: "${AIWARE_CI_TEST_STAMP} package 2"
                version: "1.0"
                primaryResourceId: "${tdoId_2}"
                resources: [
                  {
                    resourceId: "${appId}"
                    resourceType: application
                    action: ADD
                  },
                  {
                    resourceId: "${tdoId_2}"
                    resourceType: tdo
                    resourceAlias: "tdo 2"
                    action: ADD
                  }
                ]
              }
            ) {
              id
              resources {
                records {
                  id
                  resourceId
                  resourceType
                  resourceAlias
                }
              }
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        const ci_package = _.get(result, 'packageCreate');
        packageId1 = _.get(ci_package, 'id');
        expect(_.get(ci_package, 'id')).toBeDefined();
        expect(_.get(ci_package, 'resources.records').length).toBeGreaterThan(
          0
        );
        clearPackages.add(packageId1);
      });
      it('should get packages ordered by package_name ASC by default', async () => {
        const query = `
          query getPackages {
            packages(packageFilter: {
              nameMatch: contains
              caseSensitive: true
              name: "${AIWARE_CI_TEST_STAMP} package"
            }) {
              count
              records {
                id
                name
              }
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        const packages = _.get(result, 'packages.records');
        expect(packages[0].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 1`);
        expect(packages[1].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 2`);
      });
      it('should get packages ordered by name with direction desc', async () => {
        const query = `
          query getPackages {
            packages(orderBy: {
              field: name
              direction: desc
            }, packageFilter: {
              nameMatch: contains
              caseSensitive: true
              name: "${AIWARE_CI_TEST_STAMP} package"
            }) {
              count
              records {
                id
                name
              }
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        const packages = _.get(result, 'packages.records');
        expect(packages[1].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 1`);
        expect(packages[0].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 2`);
      });
      it('should get packages ordered by createdDateTime with direction desc', async () => {
        const query = `
          query getPackages {
            packages(orderBy: {
              field: createdDateTime
              direction: desc
            }, packageFilter: {
              nameMatch: contains
              caseSensitive: true
              name: "${AIWARE_CI_TEST_STAMP} package"
            }) {
              count
              records {
                id
                name
              }
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        const packages = _.get(result, 'packages.records');
        expect(packages[1].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 1`);
        expect(packages[0].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 2`);
      });
      it('should get packages ordered by modifiedDateTime with direction desc', async () => {
        const query = `
          query getPackages {
            packages(orderBy: {
              field: modifiedDateTime
              direction: desc
            }, packageFilter: {
              nameMatch: contains
              caseSensitive: true
              name: "${AIWARE_CI_TEST_STAMP} package"
            }) {
              count
              records {
                id
                name
              }
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        const packages = _.get(result, 'packages.records');
        expect(packages[1].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 1`);
        expect(packages[0].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 2`);
      });
      it('should get packages ordered by distributionType with direction desc', async () => {
        // update package distributionType and status
        await gqlClient.query(
          `mutation updatePackage {
            packageUpdate (input: {
              id: "${packageId1}"
              distributionType: public
              status: pending
            }){
              id
              name
            }
          }`,
          {},
          adminOptions
        );

        const query = `
          query getPackages {
            packages(orderBy: {
              field: distributionType
              direction: desc
            }, packageFilter: {
              nameMatch: contains
              caseSensitive: true
              name: "${AIWARE_CI_TEST_STAMP} package"
            }) {
              count
              records {
                id
                name
                distributionType
                status
              }
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        const packages = _.get(result, 'packages.records');
        expect(packages[1].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 2`);
        expect(packages[0].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 1`);
      });
      it('should get packages ordered by status with direction desc', async () => {
        const query = `
          query getPackages {
            packages(orderBy: {
              field: status
              direction: desc
            }, packageFilter: {
              nameMatch: contains
              caseSensitive: true
              name: "${AIWARE_CI_TEST_STAMP} package"
            }) {
              count
              records {
                id
                name
              }
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        const packages = _.get(result, 'packages.records');
        expect(packages[1].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 1`);
        expect(packages[0].name).toEqual(`${AIWARE_CI_TEST_STAMP} package 2`);
      });
      it('should update package with TDO 2 resources', async () => {
        let query, result, ci_package;
        query = `
          mutation updatePackage {
            packageUpdate(
              input: {
                id: "${packageId}"
                resources: [
                  {
                    resourceId: "${tdoId_2}"
                    resourceType: tdo
                    resourceAlias: "tdo 2"
                    action: ADD
                  },
                ]
              }
            ) {
              id
              resources {
                records {
                  id
                  resourceType
                  resourceId
                  resourceAlias
                }
              }
            }
          }
        `;
        result = await gqlClient.query(query, {}, adminOptions);
        ci_package = _.get(result, 'packageUpdate');
        packageId = _.get(ci_package, 'id');
        clearPackages.add(packageId);
        expect(_.get(ci_package, 'resources.records').length).toEqual(3);
      });
      it('should update package with TDO 3 resources. Auto generate resourceAlias', async () => {
        let query, result, ci_package;
        query = `
          mutation updatePackage {
            packageUpdate(
              input: {
                id: "${packageId}"
                resources: [
                  {
                    resourceId: "${tdoId_3}"
                    resourceType: tdo
                    action: ADD
                  },
                ]
              }
            ) {
              id
              resources {
                records {
                  id
                  resourceType
                  resourceId
                  resourceAlias
                }
              }
            }
          }
        `;
        result = await gqlClient.query(query, {}, adminOptions);
        ci_package = _.get(result, 'packageUpdate');
        packageId = _.get(ci_package, 'id');
        clearPackages.add(packageId);
        expect(_.get(ci_package, 'resources.records').length).toEqual(4);

        // validate resource Alias
        _.get(ci_package, 'resources.records', []).forEach((pr) => {
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
        result = await gqlClient.query(query, {}, adminOptions);
        ci_package = _.get(result, 'packages.records[0]');
        distributionType = ci_package.distributionType;
        resources = _.get(ci_package, 'resources.records');
        expect(resources.length).toEqual(1);
        expect(resources[0].resourceAlias).toEqual('tdo 1');
      });

      it('should get package using resourceAlias in the parent query', async () => {
        let query, result, ci_package, resources;
        query = `
          query package {
            packages(
              resourceAlias: "${appResourceAlias}"
            ) {
              count
              records {
                id
                name
                status
                resources{
                  count
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
        result = await gqlClient.query(query, {}, adminOptions);
        ci_package = _.get(result, 'packages.records[0]');
        resources = _.get(ci_package, 'resources.records');
        expect(ci_package.id).toEqual(packageId);
        expect(result.packages.count).toEqual(2);
        expect(resources.length).toEqual(4);
        // prep the tdo clones for deletion
        resources.map((resource) => {
          if (resource.resourceType === 'tdo') {
            clearTDOs.add(resource.resourceId);
          }
        });
      });

      // TODO: Should enable this after VE-3226 is deployed to Prod env
      it('should get package by ids, distributionTypes', async () => {
        let query, result, ci_package;
        query = `
          query package {
            packages(
              ids: ["${packageId}"],
              distributionTypes: [${distributionType}]
            ) {
              count
              records {
                id
                name
                status
                distributionType
              }
            }
          }
        `;
        result = await gqlClient.query(query, {}, adminOptions);
        ci_package = _.get(result, 'packages.records[0]');
        expect(ci_package.id).toEqual(packageId);
        expect(ci_package.distributionType).toEqual(distributionType);
        expect(result.packages.count).toEqual(1);
      });

      it('should create a package with appId and tdo2 resources when primaryResourceId is not provided', async () => {
        const query = `
          mutation createPackage {
            packageCreate(
              input: {
                name: "${AIWARE_CI_TEST_STAMP} package 3"
                version: "1.0"
                resources: [
                  {
                    resourceId: "${appId}"
                    resourceType: application
                    action: ADD
                  },
                  {
                    resourceId: "${tdoId_2}"
                    resourceType: tdo
                    resourceAlias: "tdo 2"
                    action: ADD
                  }
                ]
              }
            ) {
              id
              resources {
                records {
                  id
                  resourceId
                  resourceType
                  resourceAlias
                }
              }
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        const ci_package = _.get(result, 'packageCreate');
        packageId3 = _.get(ci_package, 'id');
        expect(_.get(ci_package, 'id')).toBeDefined();
        expect(_.get(ci_package, 'resources.records').length).toBeGreaterThan(
          0
        );
        clearPackages.add(packageId3);
      });

      it('should get package with appId and tdo2 resources when not filtering by primaryResourceType', async () => {
        const query = `
          query packages {
            packages (packageFilter:{
              primaryResourceType: null
            }) {
              records {
                id
                name
                status	
                organization {
                  id
                }
                primaryResource {
                  resourceType
                }
              }
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        const packages = _.get(result, 'packages');
        const found = _.find(_.get(packages, 'records'), { id: packageId3 });
        expect(found).toBeDefined();
      });

      it('should clean up the apps and packages', async () => {
        let query, result;
        await Promise.all(
          Array.from(clearApps).map(async (apId) => {
            query = `
            mutation deleteApps {
              deleteApplication(
                id: "${apId}"
              ) {
                id
              }
            }
          `;
            result = await gqlClient.query(query, {}, adminOptions);
            expect(result.deleteApplication.id).toBeDefined();
          })
        );
        clearApps.clear();

        await Promise.all(
          Array.from(clearPackages).map(async (packageId) => {
            query = `
            mutation deletePackage {
              packageDelete(
                id: "${packageId}"
              ) {
                success
              }
            }
          `;
            result = await gqlClient.query(query, {}, adminOptions);
            expect(result.packageDelete.success).toBeDefined();
          })
        );
        clearPackages.clear();

        await Promise.all(
          Array.from(clearTDOs).map(async (tdoId) => {
            query = `
            mutation deleteTDO {
              deleteTDO(
                id: "${tdoId}"
              ) {
                id
              }
            }
          `;
            result = await gqlClient.query(query, {}, adminOptions);
            expect(result.deleteTDO.id).toBeDefined();
          })
        );
        clearTDOs.clear();
      });
    });
  });
  describeif(global.enablePackageGrantLogic, '#package grant', () => {
    describe('Tests for Org with useEngineGrant and useAppGrant disabled', () => {
      let adminOptions;
      let engineId, secondEngineId;
      let engineBuildId, secondEngineBuildId;
      let packageId;

      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
      });

      afterAll(async () => {
        if (engineId) {
          await safe(`deleteEngine ${engineId}`, async () =>
            deleteEngine(engineId, adminOptions)
          );
        }

        if (secondEngineId) {
          await safe(`deleteEngine ${secondEngineId}`, async () =>
            deleteEngine(secondEngineId, adminOptions)
          );
        }

        if (engineId && engineBuildId) {
          await safe(`deleteEngineBuild ${engineBuildId}`, async () =>
            deleteEngineBuild(engineId, engineBuildId, adminOptions)
          );
        }

        if (secondEngineId && secondEngineBuildId) {
          await safe(`deleteEngineBuild ${secondEngineBuildId}`, async () =>
            deleteEngineBuild(secondEngineId, secondEngineBuildId, adminOptions)
          );
        }

        if (packageId) {
          await safe(`deletePackage ${packageId}`, async () =>
            deletePackage(packageId, adminOptions)
          );
        }
      });

      it('should get engine categories via whitelist', async () => {
        const query = `query engineCategories($ids: [ID!]){
          engineCategories(ids: $ids) {
            count
            records {
              id
              name
            }
          }
        }`;
        const ids = [
          TRANSCRIPT_ENGINE_CATEGORY_ID,
          TRANSLATION_ENGINE_CATEGORY_ID
        ];
        const result = await gqlClient.query(query, { ids }, adminOptions);
        const engineCategories = _.get(result, 'engineCategories.records');
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

        let results = await gqlClient.query(query, {}, adminOptions);
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
        results = await gqlClient.query(query, {}, adminOptions);
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

        results = await gqlClient.query(query, null);
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
        results = await gqlClient.query(query, {}, adminOptions);
      });
      it('should create package with engine resources', async () => {
        const query = `
          mutation packageCreate($name: String!, $orgId: ID, $resources: [PackageResourceInput]){
            packageCreate(input: {
              id: "${uuid.v4()}"
              organizationId: $orgId
              name: $name
              description: "a mock package to evaluate grant for an organization"
              distributionType: public
              status: published
              version: "1.0"
              resources: $resources
            }){
              id
            }
          }
        `;
        const variables = {
          name: `${AIWARE_CI_TEST_STAMP} citest_package_${Date.now()}`,
          orgId: noEngineGrantOrg.id,
          resources: [
            {
              resourceId: engineId,
              resourceType: 'engine',
              action: 'ADD'
            },
            {
              resourceId: secondEngineId,
              resourceType: 'engine',
              action: 'ADD'
            }
          ]
        };
        const results = await gqlClient.query(query, variables, adminOptions);
        expect(_.get(results, 'packageCreate.id')).toBeDefined();
        packageId = results.packageCreate.id;
      });

      it('should grant created package for the organization', async () => {
        const mutation = `
          mutation packageUpdateGrants{
            packageUpdateGrants(input: {
              packageId: "${packageId}"
              packageGrants: [
                {
                  organizationId: ${noEngineGrantOrg.id}
                  grantType: GRANT
                  action: ADD
                }
              ]
            }){
              id
            }
          }
        `;
        const results = await gqlClient.query(mutation, {}, adminOptions);
        expect(_.get(results, 'packageUpdateGrants')).toBeDefined();
        expect(results.packageUpdateGrants.id).toEqual(packageId);

        // verify that the grant was added
        await validatePackageGrant(
          'GRANT',
          packageId,
          gqlClient,
          {},
          adminOptions
        );
      });
      it('should get engines after granted', async () => {
        const query = `
          query engines($ids: [ID!]) {
            engines(ids: $ids) {
              records {
                id
                name
              }
            }
          }
        `;
        const result = await gqlClient.query(
          query,
          {
            ids: [engineId, secondEngineId]
          },
          adminOptions
        );
        const engines = _.get(result, 'engines.records');
        expect(engines).toBeDefined();
        expect(engines).toHaveLength(2);
      });

      it('should add an engine to blacklist', async () => {
        const query = `
          mutation addToEngineBlacklist {
            addToEngineBlacklist(toAdd: {
              engineIds: ["${secondEngineId}"]
              organizationId: ${noEngineGrantOrg.id}
            }) {
              engines {
                id
              }
            }
          }
        `;
        const result = await gqlClient.query(query);
        const engines = _.get(result, 'addToEngineBlacklist.engines');
        expect(engines).toBeDefined();
        // TODO: To prevent spam data, engine blacklist records should be cleaned after engine deletion
        const engineIds = _.map(engines, 'id');
        expect(engineIds).toEqual(expect.arrayContaining([secondEngineId]));
      });
      it('should add engine category to blacklist', async () => {
        const query = `
          mutation addToEngineBlacklist {
            addToEngineBlacklist(toAdd: {
              engineCategoryIds: ["${TRANSLATION_ENGINE_CATEGORY_ID}"]
              organizationId: ${noEngineGrantOrg.id}
            }) {
              engineCategories {
                id
              }
            }
          }
        `;
        const result = await gqlClient.query(query);
        const engineCategories = _.get(
          result,
          'addToEngineBlacklist.engineCategories'
        );
        expect(engineCategories).toBeDefined();
        expect(engineCategories).toHaveLength(1);
        expect(engineCategories[0].id).toEqual(TRANSLATION_ENGINE_CATEGORY_ID);
      });
      it('should get engines after adding to blacklist', async () => {
        const query = `
          query engines($ids: [ID!]) {
            engines(ids: $ids) {
              records {
                id
                name
              }
            }
          }
        `;
        const result = await gqlClient.query(
          query,
          {
            ids: [engineId, secondEngineId]
          },
          adminOptions
        );
        const engines = _.get(result, 'engines.records');
        expect(engines).toBeDefined();
        expect(engines).toHaveLength(1);
        expect(engines[0].id).toEqual(engineId);
      });
      xit('should get engine category after adding blacklist', async () => {
        const query = `query engineCategories($ids: [ID!]){
          engineCategories(ids: $ids) {
            count
            records {
              id
              name
            }
          }
        }`;
        const ids = [TRANSLATION_ENGINE_CATEGORY_ID];
        const result = await gqlClient.query(query, { ids });
        const engineCategories = _.get(result, 'engineCategories.records');
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
        const result = await gqlClient.query(query, {});
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
        let query = `
          mutation packageUpdateGrants{
            packageUpdateGrants(input: {
              packageId: "${packageId}"
              packageGrants: [
                {
                    organizationId: ${noEngineGrantOrg.id}
                    grantType: GRANT
                    action: REMOVE
                }
              ]
            }){
            id
            }
          }
        `;
        let result = await gqlClient.query(query, {}, adminOptions);
        expect(result.packageUpdateGrants).toBeDefined();
        expect(result.packageUpdateGrants.id).toEqual(packageId);

        // verify that the grant was removed
        query = `
          query packageGrants {
            packageGrants(id: "${packageId}") {
              records {
                grantType
              }
            }
          }
        `;
        result = await gqlClient.query(query);
        expect(_.get(result, 'packageGrants.records.length')).toEqual(0);
      });
      it('should get engines after removing granted', async () => {
        const query = `
          query engines($ids: [ID!]) {
            engines(ids: $ids) {
              records {
                id
                name
              }
            }
          }
        `;
        const result = await gqlClient.query(
          query,
          {
            ids: [engineId]
          },
          adminOptions
        );
        const engines = _.get(result, 'engines.records');
        expect(engines).toBeDefined();
        expect(engines).toHaveLength(1);
      });

      it('clean up test data', async () => {
        await safe(`deleteEngine ${engineId}`, async () =>
          deleteEngine(engineId, adminOptions)
        );

        await safe(`deleteEngine ${secondEngineId}`, async () =>
          deleteEngine(secondEngineId, adminOptions)
        );

        await safe(`deleteEngineBuild ${engineBuildId}`, async () =>
          deleteEngineBuild(engineId, engineBuildId, adminOptions)
        );
        engineBuildId = null;
        engineId = null;

        await safe(`deleteEngineBuild ${secondEngineBuildId}`, async () =>
          deleteEngineBuild(secondEngineId, secondEngineBuildId, adminOptions)
        );
        secondEngineBuildId = null;
        secondEngineId = null;

        await safe(`deletePackage ${packageId}`, async () =>
          deletePackage(packageId, adminOptions)
        );
        packageId = null;
      });
    });

    // TODO: skip until AWT-9376 and AWT-9377 tickets have completed.
    // New org in the enablePackageGrantLogic == true environment
    // will automatically get useEngineGrant == true feature flag
    describe('Tests engine grant with useEngineGrant enabled', () => {
      let publicEnginesPackageId;
      let adminOptions;

      beforeAll(() => {
        adminOptions = engineGrantSuperAdminOptions;
      });

      it('should get engine categories before granting', async () => {
        const query = `
          query engineCategories {
            engineCategories(limit: 10) {
              records {
                id
                name
              }
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        expect(result.engineCategories).toBeDefined();
        expect(result.engineCategories.records).toHaveLength(0);
      });
      it('should get/create the publicEngines package', async () => {
        // getting before create new package
        let query = `
          query packages {
            packages(
              nameRegexp: "${publicEnginesPackageName}"
              distributionType: public
              status: published
            ) {
              records {
                id
                name
              }
            }
          }
        `;

        let isRecordsEmpty = false;
        let results = await gqlClient.query(query, {}, adminOptions);

        let recordsArray = _.get(results, 'packages.records').length;
        if (recordsArray > 0) {
          publicEnginesPackageId = _.get(results, 'packages.records.[0].id');
        } else {
          isRecordsEmpty = true;
        }

        // if not existing, create one
        if (!publicEnginesPackageId || isRecordsEmpty === true) {
          query = `
            mutation packageCreate($name: String!, $orgId: ID, $resources: [PackageResourceInput]){
              packageCreate(input: {
                id: "${uuid.v4()}"
                organizationId: $orgId
                name: $name
                description: "a mock package to evaluate grant for an organization"
                distributionType: public
                status: published
                version: "1.0"
                resources: $resources
              }){
                id
              }
            }
          `;
          const variables = {
            name: publicEnginesPackageName,
            orgId: engineGrantOrg.id
          };
          results = await gqlClient.query(query, variables, adminOptions);
          expect(_.get(results, 'packageCreate.id')).toBeDefined();
          publicEnginesPackageId = _.get(results, 'packageCreate.id');
        }

        expect(publicEnginesPackageId).toBeDefined();
      });
      it('grant publicEngines package for the organization', async () => {
        const query = `
        mutation packageUpdateGrants{
          packageUpdateGrants(input: {
            packageId: "${publicEnginesPackageId}"
            packageGrants: [
              {
                  organizationId: ${engineGrantOrg.id}
                  grantType: GRANT
                  action: ADD
              }
            ]
          }){
            id
          }
        }
      `;
        const result = await gqlClient.query(query, {}, adminOptions);
        const packageUpdateGrants = _.get(result, 'packageUpdateGrants');
        expect(packageUpdateGrants).toBeDefined();
        expect(packageUpdateGrants.id).toEqual(publicEnginesPackageId);
      });
      it('get engine categories after granted', async () => {
        const query = `
          query engineCategories {
            engineCategories(limit: 10) {
              records {
                id
                name
              }
            }
          }
        `;
        const result = await gqlClient.query(query);
        expect(result.engineCategories).toBeDefined();
        expect(result.engineCategories.records.length).toBeGreaterThan(0);
      });
    });

    describe('support granting access to automateNodes, useEngineGrant disabled', () => {
      let adminOptions;
      let orgAdminOptionsInOtherOrg;
      let tdoId, cloneTDOId;
      let packageId;
      let resourceFolderId;

      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
        orgAdminOptionsInOtherOrg = engineGrantOrgAdminOptions;
      });

      afterAll(async () => {
        if (packageId) {
          await safe('delete automateNode package', async () =>
            deletePackage(packageId, adminOptions)
          );
        }

        if (tdoId) {
          await safe('delete source automateNode TDO', async () =>
            deleteTDO(tdoId, adminOptions)
          );
        }

        if (cloneTDOId) {
          await safe('delete cloned automateNode TDO', async () =>
            deleteTDO(cloneTDOId, adminOptions)
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
        let result = await gqlClient.uploadFile(
          query,
          'AutomateNode-1.1.1.gz',
          './citest/data/AutomateNode-1.1.1.gz'
        );
        result = await gqlClient.query(query, {}, adminOptions);
        tdoId = _.get(result, 'createTDOWithAsset.id');
        expect(tdoId).toBeTruthy();
      });
      it('should create package with automateNode resource', async () => {
        const query = `
          mutation packageCreate(
            $name: String!,
            $primaryResourceId: ID,
            $orgId: ID,
            $resources: [PackageResourceInput]
          ){
            packageCreate(input: {
              organizationId: $orgId
              name: $name
              description: "a mock package to evaluate grant for an organization"
              version: "1.0.0"
              primaryResourceId: $primaryResourceId
              resources: $resources
            }){
              id
              version
            }
          }
      `;
        const variables = {
          primaryResourceId: tdoId,
          name: `${AIWARE_CI_TEST_STAMP} citest_automateNode_package_${Date.now()}`,
          orgId: noEngineGrantOrg.id,
          resources: [
            {
              resourceId: tdoId,
              resourceType: 'automateNode',
              action: 'ADD'
            }
          ]
        };
        const results = await gqlClient.query(query, variables, adminOptions);
        expect(_.get(results, 'packageCreate.id')).toBeDefined();
        expect(_.get(results, 'packageCreate.version')).toEqual('1.0.0');
        packageId = results.packageCreate.id;
      });
      it('should validate automateNode access before granting - queryTDO should fail', async () => {
        const query = `query { temporalDataObject(id: "${tdoId}") { id }}`;
        await expect(
          gqlClient.query(query, {}, orgAdminOptionsInOtherOrg)
        ).rejects.toThrow(
          'The specified object does not exist or access not granted.'
        );
      });
      it('should grant created package for an organization', async () => {
        const query = `
          mutation packageUpdateGrants{
            packageUpdateGrants(input: {
              packageId: "${packageId}"
              packageGrants: [
                {
                  organizationId: ${engineGrantOrg.id}
                  grantType: GRANT
                  action: ADD
                }
              ]
            }){
              id
            }
          }
        `;
        const results = await gqlClient.query(query, {});
        expect(_.get(results, 'packageUpdateGrants')).toBeDefined();
        expect(results.packageUpdateGrants.id).toEqual(packageId);
      });
      it('should retrieve a valid grant', async () => {
        const query = `
          query packageGrants {
            packageGrant: packageGrants(
              id: "${packageId}"
              orgId: ${engineGrantOrg.id}
            ) {
              records {
                package {
                  id
                }
              }
            }
          }
        `;
        const results = await gqlClient.query(query, {}, adminOptions);
        const packageGrant = _.head(_.get(results, 'packageGrant.records'));
        expect(packageGrant).toBeDefined();
        expect(packageGrant.package.id).toEqual(packageId);
      });
      it('should get shared package', async () => {
        const query = `
          query packagesList {
            packages(
              id: "${packageId}"
              packageFilter: { primaryResourceType: automateNode }
            ){
              records{
                id
                resources{
                  records{
                    resourceId
                    packageId
                  }
                }
              }
            }
          }
        `;
        const results = await gqlClient.query(
          query,
          {},
          orgAdminOptionsInOtherOrg
        );
        const automateNodePackage = _.head(_.get(results, 'packages.records'));
        const packageResource = _.head(
          _.get(automateNodePackage, 'resources.records')
        );
        expect(automateNodePackage).toBeDefined();
        expect(automateNodePackage.id).toEqual(packageId);
        expect(packageResource).toBeDefined();

        cloneTDOId = packageResource.resourceId;
      });
      it('should validate automateNode access after granting', async () => {
        const query = `query { temporalDataObject(id: "${cloneTDOId}") { id }}`;
        const results = await gqlClient.query(
          query,
          {},
          orgAdminOptionsInOtherOrg
        );
        expect(results.temporalDataObject).toBeDefined();
        expect(results.temporalDataObject.id).toEqual(cloneTDOId);
      });
      it('should be filed in the nodes subfolder', async () => {
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
        let results = await gqlClient.query(
          query,
          {},
          noEngineGrantOrgAdminOptions
        );
        resourceFolderId = _.get(
          results,
          'rootFolders[0].childFolders.records[0].id'
        );
        expect(resourceFolderId).toBeDefined();

        query = `query {
          temporalDataObject(id: "${cloneTDOId}") {
            id,
            folders {
              id
            }
          }
        }`;
        results = await gqlClient.query(query, {}, orgAdminOptionsInOtherOrg);
        const parentFolderIds = _.map(
          _.get(results, 'temporalDataObject.folders'),
          'id'
        );
        expect(parentFolderIds).toEqual(
          expect.arrayContaining([resourceFolderId])
        );
      });
      it('should remove granting for an organization', async () => {
        const query = `
          mutation packageUpdateGrants{
            packageUpdateGrants(input: {
              packageId: "${packageId}"
              packageGrants: [
                {
                  organizationId: ${engineGrantOrg.id}
                  grantType: GRANT
                  action: REMOVE
                }
              ]
            }){
              id
            }
          }
        `;
        const results = await gqlClient.query(query, {});
        expect(_.get(results, 'packageUpdateGrants')).toBeDefined();
        expect(results.packageUpdateGrants.id).toEqual(packageId);
      });
      it('should validate automateNode access after granting remove - queryTDO should fail', async () => {
        const query = `query { temporalDataObject(id: "${cloneTDOId}") { id }}`;
        await expect(
          gqlClient.query(query, {}, orgAdminOptionsInOtherOrg)
        ).rejects.toThrow(
          'The specified object does not exist or access not granted.'
        );
      });
      it('clean up test data', async () => {
        await safe('delete automateNode package', async () =>
          deletePackage(packageId, adminOptions)
        );
        packageId = null;

        await safe('delete source automateNode TDO', async () =>
          deleteTDO(tdoId, adminOptions)
        );
        tdoId = null;

        await safe('delete cloned automateNode TDO', async () =>
          deleteTDO(cloneTDOId, adminOptions)
        );
        cloneTDOId = null;
      });
    });

    describe('support granting access to automatePalettes, useEngineGrant disabled', () => {
      let adminOptions;
      let orgAdminOptionsInOtherOrg;
      let tdoId, cloneTDOId;
      let packageId;
      let resourceFolderId;

      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
        orgAdminOptionsInOtherOrg = engineGrantOrgAdminOptions;
      });

      afterAll(async () => {
        if (packageId) {
          await safe('delete automatePalette package', async () =>
            deletePackage(packageId, adminOptions)
          );
        }

        if (tdoId) {
          await safe('delete source automatePalette TDO', async () =>
            deleteTDO(tdoId, adminOptions)
          );
        }

        if (cloneTDOId) {
          await safe('delete cloned automatePalette TDO', async () =>
            deleteTDO(cloneTDOId, adminOptions)
          );
        }
      });

      it('creates automatePalette', async () => {
        const name = `citest_automatePalette_${Date.now()}`;
        const query = `
        mutation createTDO {
          createTDO(input:{
            startDateTime:${startDateTime},
            stopDateTime:${stopDateTime},
            name: "${name}"
            addToIndex: false
            details: {
              tags: [
                {
                  value: "automatePalette"
                }
              ],
              addToIndex: false,
              nodeModules: {
                moduleName: "@gagestestorg/npm_private_test_package",
                moduleRepo: "npm",
                isPrivateRepo: true,
                isPrivateRegistry: false,
                moduleVersion: "1.0.0",
                scope: "gagestestorg",
                registryUrl: "",
                sshUrl: ""
              }
            }
          }){
            id
          }
        }`;
        const result = await gqlClient.query(query, {}, adminOptions);
        tdoId = _.get(result, 'createTDO.id');
        expect(tdoId).toBeTruthy();
      });
      it('should create package with automatePalette resource', async () => {
        const query = `
          mutation packageCreate(
            $name: String!,
            $primaryResourceId: ID,
            $orgId: ID,
            $resources: [PackageResourceInput]
          ){
            packageCreate(input: {
              organizationId: $orgId
              name: $name
              description: "a mock package to evaluate grant for an organization"
              version: "1.0.0"
              primaryResourceId: $primaryResourceId
              resources: $resources
              distributionType: private
            }){
              id
              version
              distributionType
            }
          }
      `;
        const variables = {
          primaryResourceId: tdoId,
          name: `${AIWARE_CI_TEST_STAMP} citest_automatePalette_package_${Date.now()}`,
          orgId: noEngineGrantOrg.id,
          resources: [
            {
              resourceId: tdoId,
              resourceType: 'automatePalette',
              action: 'ADD'
            }
          ]
        };
        const results = await gqlClient.query(query, variables, adminOptions);
        expect(_.get(results, 'packageCreate.id')).toBeDefined();
        expect(_.get(results, 'packageCreate.version')).toEqual('1.0.0');
        expect(_.get(results, 'packageCreate.distributionType')).toEqual(
          'private'
        );
        packageId = results.packageCreate.id;
      });
      it('should validate automatePalette access before granting - queryTDO should fail', async () => {
        const query = `query { temporalDataObject(id: "${tdoId}") { id }}`;
        await expect(
          gqlClient.query(query, {}, orgAdminOptionsInOtherOrg)
        ).rejects.toThrow(
          'The specified object does not exist or access not granted.'
        );
      });
      it('should grant created package for an organization', async () => {
        const query = `
          mutation packageUpdateGrants{
            packageUpdateGrants(input: {
              packageId: "${packageId}"
              packageGrants: [
                {
                  organizationId: ${engineGrantOrg.id}
                  grantType: GRANT
                  action: ADD
                }
              ]
            }){
              id
            }
          }
        `;
        const results = await gqlClient.query(query, {});
        expect(_.get(results, 'packageUpdateGrants')).toBeDefined();
        expect(results.packageUpdateGrants.id).toEqual(packageId);
      });
      it('should retrieve a valid grant', async () => {
        const query = `
          query packageGrants {
            packageGrant: packageGrants(
              id: "${packageId}"
              orgId: ${engineGrantOrg.id}
              packageFilter: {
                distributionType: private
              }
            ) {
              records {
                package {
                  id
                }
              }
            }
          }
        `;
        const results = await gqlClient.query(query, {}, adminOptions);
        const packageGrant = _.head(_.get(results, 'packageGrant.records'));
        expect(packageGrant).toBeDefined();
        expect(packageGrant.package.id).toEqual(packageId);
      });
      it('should get shared package', async () => {
        const query = `
          query packagesList {
            packages(
              id: "${packageId}"
              packageFilter: { primaryResourceType: automatePalette }
            ){
              records{
                id
                resources{
                  records{
                    resourceId
                    packageId
                  }
                }
              }
            }
          }
        `;
        const results = await gqlClient.query(
          query,
          {},
          orgAdminOptionsInOtherOrg
        );
        const automatePalettePackage = _.head(
          _.get(results, 'packages.records')
        );
        const packageResource = _.head(
          _.get(automatePalettePackage, 'resources.records')
        );
        expect(automatePalettePackage).toBeDefined();
        expect(automatePalettePackage.id).toEqual(packageId);
        expect(packageResource).toBeDefined();

        cloneTDOId = packageResource.resourceId;
      });
      it('should validate automatePalette access after granting', async () => {
        const query = `query { temporalDataObject(id: "${cloneTDOId}") { id }}`;
        const results = await gqlClient.query(
          query,
          {},
          orgAdminOptionsInOtherOrg
        );
        expect(results.temporalDataObject).toBeDefined();
        expect(results.temporalDataObject.id).toEqual(cloneTDOId);
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
        let results = await gqlClient.query(
          query,
          {},
          noEngineGrantOrgAdminOptions
        );
        resourceFolderId = _.get(
          results,
          'rootFolders[0].childFolders.records[0].id'
        );
        expect(resourceFolderId).toBeDefined();

        query = `query {
          temporalDataObject(id: "${cloneTDOId}") {
            id,
            folders {
              id
            }
          }
        }`;
        results = await gqlClient.query(query, {}, orgAdminOptionsInOtherOrg);
        const parentFolderIds = _.map(
          _.get(results, 'temporalDataObject.folders'),
          'id'
        );
        expect(parentFolderIds).toEqual(
          expect.arrayContaining([resourceFolderId])
        );
      });
      it('should remove granting for an organization', async () => {
        const query = `
          mutation packageUpdateGrants{
            packageUpdateGrants(input: {
              packageId: "${packageId}"
              packageGrants: [
                {
                  organizationId: ${engineGrantOrg.id}
                  grantType: GRANT
                  action: REMOVE
                }
              ]
            }){
              id
            }
          }
        `;
        const results = await gqlClient.query(query, {});
        expect(_.get(results, 'packageUpdateGrants')).toBeDefined();
        expect(results.packageUpdateGrants.id).toEqual(packageId);
      });
      it('should validate automatePalette access after granting remove - queryTDO should fail', async () => {
        const query = `query { temporalDataObject(id: "${cloneTDOId}") { id }}`;
        await expect(
          gqlClient.query(query, {}, orgAdminOptionsInOtherOrg)
        ).rejects.toThrow(
          'The specified object does not exist or access not granted.'
        );
      });
      it('clean up test data', async () => {
        await safe('delete automatePalette package', async () =>
          deletePackage(packageId, adminOptions)
        );
        packageId = null;

        await safe('delete source automatePalette TDO', async () =>
          deleteTDO(tdoId, adminOptions)
        );
        tdoId = null;

        await safe('delete cloned automatePalette TDO', async () =>
          deleteTDO(cloneTDOId, adminOptions)
        );
        cloneTDOId = null;
      });
    });

    describe('use package grant with nested packages, superAdmin', () => {
      const nestedPackageA = uuid.v4();
      const nestedPackageB = uuid.v4();
      const nestedPackageC = uuid.v4();
      const parentPackage = uuid.v4();
      let tdoA;
      let tdoB;
      let tdoC;
      const sourceId = uuid.v4();

      afterAll(async () => {
        if (parentPackage) {
          await safe('delete parent package', async () =>
            deletePackage(parentPackage)
          );
        }

        if (nestedPackageC) {
          await safe('delete nested package C', async () =>
            deletePackage(nestedPackageC)
          );
        }

        if (nestedPackageB) {
          await safe('delete nested package B', async () =>
            deletePackage(nestedPackageB)
          );
        }

        if (nestedPackageA) {
          await safe('delete nested package A', async () =>
            deletePackage(nestedPackageA)
          );
        }

        if (tdoA) {
          await safe('delete tdoA', async () => deleteTDO(tdoA));
        }

        if (tdoB) {
          await safe('delete tdoB', async () => deleteTDO(tdoB));
        }

        if (tdoC) {
          await safe('delete tdoC', async () => deleteTDO(tdoC));
        }
      });

      it('should create TDOs for test bed', async () => {
        const mutationA = `
          mutation {
            createTDO(
              input: {
                startDateTime: 1623253937
                stopDateTime: 1623259000
                source: "123"
                name: "${AIWARE_CI_TEST_STAMP} TDOA"
                description: "TDO A"
                isPublic: false
                applicationId: "123"
              }
            ) {
              id
              name
            }
          }
        `;
        let result = await gqlClient.query(mutationA);
        let createTDO = _.get(result, 'createTDO');
        expect(createTDO).toBeDefined();
        tdoA = createTDO.id;

        const mutationB = `
          mutation {
            createTDO(
              input: {
                startDateTime: 1623253937
                stopDateTime: 1623259000
                source: "123"
                name: "${AIWARE_CI_TEST_STAMP} TDOB"
                description: "TDO B"
                isPublic: false
                applicationId: "123"
              }
            ) {
              id
              name
            }
          }
        `;
        result = await gqlClient.query(mutationB);
        createTDO = _.get(result, 'createTDO');
        expect(createTDO).toBeDefined();
        tdoB = createTDO.id;

        const mutationC = `
          mutation {
            createTDO(
              input: {
                startDateTime: 1623253937
                stopDateTime: 1623259000
                source: "123"
                name: "${AIWARE_CI_TEST_STAMP} TDOC"
                description: "TDO C"
                isPublic: false
                applicationId: "123"
              }
            ) {
              id
              name
            }
          }
        `;
        result = await gqlClient.query(mutationC);
        createTDO = _.get(result, 'createTDO');
        expect(createTDO).toBeDefined();
        tdoC = createTDO.id;
      });
      it('should create nested package A', async () => {
        const mutation = `
          mutation packageCreate {
            packageCreate(input: {
              id: "${nestedPackageA}",
              organizationId: "${engineGrantOrg.id}",
              name: "${AIWARE_CI_TEST_STAMP} Nested Package A",
              version:"1.0.1",
              sourceOriginId: "${sourceId}"
              resources:[
                {resourceId: "${tdoA}", resourceType: tdo},
              ]})
            {
              id
            }
          }
        `;

        const result = await gqlClient.query(mutation);
        const packageCreate = _.get(result, 'packageCreate');
        expect(packageCreate).toBeDefined();
      });

      it('should create nested package B', async () => {
        const mutation = `
          mutation packageCreate {
            packageCreate(input: {
              id: "${nestedPackageB}",
              organizationId: "${engineGrantOrg.id}",
              name: "${AIWARE_CI_TEST_STAMP} Nested Package B",
              version:"1.0.2",
              sourceOriginId: "${sourceId}",
              resources:[
                {resourceId: "${nestedPackageA}", resourceType: package},
                {resourceId: "${tdoA}", resourceType: tdo}
              ]})
            {
              id
            }
          }
        `;

        const result = await gqlClient.query(mutation);
        const packageCreate = _.get(result, 'packageCreate');
        expect(packageCreate).toBeDefined();
      });

      it('should create nested package C', async () => {
        const mutation = `
          mutation packageCreate {
            packageCreate(input: {
              id: "${nestedPackageC}",
              organizationId: "${engineGrantOrg.id}",
              name: "${AIWARE_CI_TEST_STAMP} Nested Package C",
              version:"1.0.3",
              sourceOriginId: "${sourceId}",
              resources:[
                {resourceId: "${nestedPackageB}", resourceType: package},
                {resourceId: "${tdoA}", resourceType: tdo}
                {resourceId: "${tdoB}", resourceType: tdo}
              ]})
            {
              id
            }
          }
        `;

        const result = await gqlClient.query(mutation);
        const packageCreate = _.get(result, 'packageCreate');
        expect(packageCreate).toBeDefined();
      });

      it('should create the parent package', async () => {
        const mutation = `
          mutation packageCreate {
            packageCreate(input: {
              id: "${parentPackage}",
              organizationId: "${engineGrantOrg.id}",
              name: "${AIWARE_CI_TEST_STAMP} Parent Package",
              version:"1.0.4",
              sourceOriginId: "${sourceId}",
              resources:[
                {resourceId: "${nestedPackageC}", resourceType: package}
                {resourceId: "${tdoA}", resourceType: tdo},
                {resourceId: "${tdoB}", resourceType: tdo}
                {resourceId: "${tdoC}", resourceType: tdo}
              ]})
            {
              id
            }
          }
        `;

        const result = await gqlClient.query(mutation);
        const packageCreate = _.get(result, 'packageCreate');
        expect(packageCreate).toBeDefined();
      });

      it('should get all nested resources', async () => {
        const packagesQuery = `
            query packages {
              packages(id: "${parentPackage}") {
                records {
                  nestedResources {
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

        const result = await gqlClient.query(packagesQuery);

        expect(result.packages.records).toBeDefined();
        expect(result.packages.records[0].nestedResources).toBeDefined();
        expect(
          result.packages.records[0].nestedResources.records
        ).toBeDefined();
        expect(
          result.packages.records[0].nestedResources.records.length
        ).toEqual(10);
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

        const result = await gqlClient.query(packagesQuery);

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

        const result = await gqlClient.query(packagesQuery);

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
        const query = `
            query packageGrants {
              packageGrants(orgId: ${engineGrantOrg.id}) {
                records {
                  grantType
                  package {
                    name
                    id
                    organization {
                      name
                      id
                    }
                  }
                }
              }
            }
          `;
        const result = await gqlClient.query(query);
        const packageGrants = _.get(result, 'packageGrants');
        expect(packageGrants).toBeDefined();

        const packageIdsToFilter = [
          parentPackage,
          nestedPackageA,
          nestedPackageB,
          nestedPackageC
        ];

        const packageIds = _.filter(packageGrants.records, (packageRecord) =>
          packageIdsToFilter.includes(packageRecord.package.id)
        );

        expect(packageIds.length).toEqual(0);
      });

      it('should grant nested packages with the grant(s) of the parent package', async () => {
        const query = `
            mutation packageUpdateGrants{
              packageUpdateGrants(input: {
                packageId: "${parentPackage}"
                packageGrants: [
                  {
                      organizationId: ${engineGrantOrg.id}
                      grantType: GRANT
                      action: ADD
                  }
                ]
              }){
                id
              }
            }
          `;
        const result = await gqlClient.query(query);
        const packageUpdateGrants = _.get(result, 'packageUpdateGrants');
        expect(packageUpdateGrants).toBeDefined();
        expect(packageUpdateGrants.id).toEqual(parentPackage);

        // verify that the grantTypes were set correctly for each package
        await validatePackageGrant('GRANT', parentPackage, gqlClient);
        await validatePackageGrant('GRANT', nestedPackageA, gqlClient);
        await validatePackageGrant('GRANT', nestedPackageB, gqlClient);
        await validatePackageGrant('GRANT', nestedPackageC, gqlClient);
      });

      it('clean up source TDOs', async () => {
        await safe('delete tdoA', async () => deleteTDO(tdoA));
        tdoA = null;

        await safe('delete tdoB', async () => deleteTDO(tdoB));
        tdoB = null;

        await safe('delete tdoC', async () => deleteTDO(tdoC));
        tdoC = null;
      });
    });

    describe('support granting access to applications, useAppGrant disabled / enabled', () => {
      let adminOptions;
      let ci_app_grant_package;
      let app_uuid = uuid.v4();
      let testAppId;
      let testApp = {
        id: uuid.v4(),
        name: `${AIWARE_CI_TEST_STAMP} Package App - ${app_uuid}}`,
        key: `citest-package-app ${app_uuid}`,
        description: `Citest Package App - ${app_uuid}`,
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false,
        status: 'active'
      };
      let ci_app_owned_package;
      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
      });
      it('should create application', async () => {
        const query = `
          mutation createApp {
            createApplication(
              input: {
                name: "${testApp.name}"
                key: "${testApp.key}"
                description: "${testApp.description}"
                url: "${testApp.url}"
                oauth2RedirectUrls: "${testApp.oauth2RedirectUrls}"
                checkPermissions: ${testApp.checkPermissions}
                status: ${testApp.status}
              }
            ) {
              id
              name
              status
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        testAppId = _.get(result, 'createApplication.id');
        expect(testAppId).toBeDefined();
      });
      it('should create package with application resource', async () => {
        let appGrantPackageQuery = `
          mutation createPackage {
            packageCreate(
              input: {
                name: "${AIWARE_CI_TEST_STAMP} citest appGrant test package"
                version: "1.0"
                primaryResourceId: "${testAppId}"
                resources: [
                  {
                    resourceId: "${testAppId}"
                    resourceType: application
                    action: ADD
                  }
                ]
              }
            ) {
              id
              resources {
                records {
                  id
                  resourceType
                  resourceAlias
                }
              }
            }
          }
        `;
        let resultAppGrantPackageMutation = await gqlClient.query(
          appGrantPackageQuery,
          {},
          adminOptions
        );
        ci_app_grant_package = _.get(
          resultAppGrantPackageMutation,
          'packageCreate'
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
        try {
          const result = await gqlClient.query(
            query,
            {},
            appGrantOrgAdminOptions
          );
        } catch (err) {
          expect(err).toBeDefined();
        }
      });
      it('should grant package to organization with VIEW access', async () => {
        const query = `
          mutation addGrant {
            packageUpdateGrants(
              input: {
                packageId: "${ci_app_grant_package.id}"
                packageGrants: [
                  {
                    organizationId: ${appGrantOrg.id}
                    action: ADD
                    grantType: VIEW
                  }
                ]
              }
            ) {
              id
              name
              version
            }
          }
        `;
        const result = await gqlClient.query(query, {}, adminOptions);
        expect(_.get(result, 'packageUpdateGrants.id')).toEqual(
          ci_app_grant_package.id
        );

        // verify that the grantType was set correctly
        await validatePackageGrant(
          'VIEW',
          ci_app_grant_package.id,
          gqlClient,
          {},
          adminOptions
        );
      });

      it('should create a package owned by organization', async () => {
        let query = `
          mutation createPackage {
            packageCreate(
              input: {
                name: "${AIWARE_CI_TEST_STAMP} citest org owned packages"
                version: "1.0"
                organizationId:"${appGrantOrg.id}"
              }
            ) {
              id
              organization {
                id
              }
            }
          }
        `;
        let resultAppGrantPackageMutation = await gqlClient.query(query, {});
        ci_app_owned_package = _.get(
          resultAppGrantPackageMutation,
          'packageCreate'
        );

        expect(ci_app_owned_package).toBeDefined();
      });

      xit('admin user should fetch both granted and org-owned packages', async () => {
        const packagesQuery = `
         query packages {
          packages (ids: ["${ci_app_grant_package.id}", "${ci_app_owned_package.id}"]) {
            records {
              id
              name
              status
              organization {
                id
              }
            }
          }
        }
        `;
        const packagesResult = await gqlClient.query(
          packagesQuery,
          {},
          adminOptions
        );
        const packages = _.get(packagesResult, 'packages.records');
        expect(packages.length).toEqual(2);
      });

      it('regular user with AIWARE_DEVELOPER_ENGINE_READ should fetch both granted and org-owned packages', async () => {
        const packagesQuery = `
         query packages {
          packages (ids: ["${ci_app_grant_package.id}", "${ci_app_owned_package.id}"]) {
            records {
              id
              name
              status
              organization {
                id
              }
            }
          }
        }
        `;
        const packagesResult = await gqlClient.query(
          packagesQuery,
          {},
          appGrantOrgRegularOptions
        );

        const packages = _.get(packagesResult, 'packages.records');
        expect(packages.length).toEqual(2);
      });

      it('regular user without AIWARE_DEVELOPER_ENGINE_READ should fetch only granted packages', async () => {
        const packagesQuery = `
         query packages {
          packages (ids: ["${ci_app_grant_package.id}", "${ci_app_owned_package.id}"]) {
            records {
              id
              name
              status
              organization {
                id
              }
            }
          }
        }
        `;
        const packagesResult = await gqlClient.query(
          packagesQuery,
          {},
          appGrantOrgRegularNoRoleOptions
        );
        const packages = _.get(packagesResult, 'packages.records');
        expect(packages.length).toEqual(1);
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
        result = await gqlClient.query(query, {}, appGrantOrgAdminOptions);
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
        try {
          result = await gqlClient.query(query, {}, appGrantOrgAdminOptions);
        } catch (err) {
          expect(err).toBeDefined();
        }
      });
      it('should update grant type to GRANT', async () => {
        const query = `
          mutation addGrant {
            packageUpdateGrants(
              input: {
                packageId: "${ci_app_grant_package.id}"
                packageGrants: [
                  {
                    organizationId: ${appGrantOrg.id}
                    action: ADD
                    grantType: GRANT
                  }
                ]
              }
            ) {
              id
              name
              version
            }
          }
        `;
        const result = await gqlClient.query(query, {});
        expect(_.get(result, 'packageUpdateGrants.id')).toEqual(
          ci_app_grant_package.id
        );

        // verify that the grantType was set correctly
        await validatePackageGrant(
          'GRANT',
          ci_app_grant_package.id,
          gqlClient,
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
        result = await gqlClient.query(query, {}, appGrantOrgAdminOptions);
        const getApps = _.get(result, 'applications.records');
        expect(getApps.length).toEqual(1);
        expect(getApps[0].id).toEqual(testAppId);
      });
      it('should update grant type to DENY', async () => {
        const query = `
          mutation addGrant {
            packageUpdateGrants(
              input: {
                packageId: "${ci_app_grant_package.id}"
                packageGrants: [
                  {
                    organizationId: ${appGrantOrg.id}
                    action: ADD
                    grantType: DENY
                  }
                ]
              }
            ) {
              id
              name
              version
            }
          }
        `;
        const result = await gqlClient.query(query, {});
        expect(_.get(result, 'packageUpdateGrants.id')).toEqual(
          ci_app_grant_package.id
        );

        // verify that the grantType was set correctly
        await validatePackageGrant(
          'DENY',
          ci_app_grant_package.id,
          gqlClient,
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
        try {
          result = await gqlClient.query(query, {}, appGrantOrgAdminOptions);
        } catch (err) {
          expect(err).toBeDefined();
        }
      });
      it('should delete package', async () => {
        await deletePackage(ci_app_grant_package.id, adminOptions);
        await deletePackage(ci_app_owned_package.id);
      });
      it('should delete application', async () => {
        const query = `
          mutation deleteTestApp {
            deleteApplication(id: "${testAppId}") {
              id
              message
            }
          }
        `;
        const result = await gqlClient.query(query);
        const deletedApp = _.get(result, 'deleteApplication');
        expect(deletedApp.id).toEqual(testAppId);
      });
    });
  });

  describe('validation against circular package references, useEngineGrant and useAppGrant disabled', () => {
    const firstUniqueId = Date.now().valueOf();
    const secondUniqueId = Date.now().valueOf() + 1;
    let adminOptions;
    let firstAppId, secondAppId;
    let idFirstPackage, idSecondPackage;
    let result;

    beforeAll(async () => {
      adminOptions = noEngineGrantSuperAdminOptions;
      let createFirstApplicationMutation = `
          mutation createApp {
            createApplication(
              input: {
                name: "${AIWARE_CI_TEST_STAMP} App 1 for package - ${firstUniqueId}"
                key: "citest-app-1-for-package-${firstUniqueId}"
                description: "Citest App 1 for package test"
                url: "www.example.com"
                checkPermissions: false,
                status: active
              }
            ) {
              id
            }
          }
        `;
      let resultFirstCreateApplication = await gqlClient.query(
        createFirstApplicationMutation,
        {},
        adminOptions
      );
      let app1 = _.get(resultFirstCreateApplication, 'createApplication');
      firstAppId = _.get(app1, 'id');
      expect(firstAppId).toBeDefined();

      let createSecondApplicationMutation = `
          mutation createApp {
            createApplication(
              input: {
                name: "${AIWARE_CI_TEST_STAMP} App 1 for package - ${secondUniqueId}"
                key: "citest-app-1-for-package-${secondUniqueId}"
                description: "Citest App 1 for package test"
                url: "www.example.com"
                checkPermissions: false,
                status: active
              }
            ) {
              id
            }
          }
        `;
      let resultSecondCreateApplication = await gqlClient.query(
        createSecondApplicationMutation,
        {},
        adminOptions
      );
      let app2 = _.get(resultSecondCreateApplication, 'createApplication');
      secondAppId = _.get(app2, 'id');
      expect(secondAppId).toBeDefined();

      // Find the auto created package (if any)
      let gql = `query {
        packages(primaryResourceId: "${firstAppId}") {
          records {
            id
          }
        }
      }`;
      result = await gqlClient.query(gql);
      let packages = _.get(result, 'packages');
      idFirstPackage = _.get(packages, 'records[0].id');

      if (!idFirstPackage) {
        let firstCreatePackageMutation = `
            mutation createPackage {
              packageCreate(
                input: {
                  name: "${AIWARE_CI_TEST_STAMP} citest test package 1"
                  version: "1.0"
                  primaryResourceId: "${firstAppId}",
                  status: published,
                  resources: [
                    {
                      resourceId: "${firstAppId}"
                      resourceType: application
                      action: ADD
                    }
                  ]
                }
              ) {
                id
                resources {
                  records {
                    id
                    resourceType
                    resourceAlias
                  }
                }
              }
            }
          `;

        let resultFirstCreatePackageMutation = await gqlClient.query(
          firstCreatePackageMutation,
          {},
          adminOptions
        );
        let ci_packageOne = _.get(
          resultFirstCreatePackageMutation,
          'packageCreate'
        );

        idFirstPackage = _.get(ci_packageOne, 'id');
        expect(
          _.get(ci_packageOne, 'resources.records').length
        ).toBeGreaterThan(0);
      } else {
        // If package auto created, we must update the state to published
        gql = `
          mutation updatePackage {
            packageUpdate(
              input: {
                id: "${idFirstPackage}"
                status: published
              }
            ) {
                id
              }
            }
        `;
        result = await gqlClient.query(gql);
      }

      expect(idFirstPackage).toBeDefined();

      // Find the auto created package (if any)
      gql = `query {
        packages(primaryResourceId: "${secondAppId}") {
          records {
            id
          }
        }
      }`;
      result = await gqlClient.query(gql);
      packages = _.get(result, 'packages');
      idSecondPackage = _.get(packages, 'records[0].id');

      if (!idSecondPackage) {
        let secondCreatePackageMutation = `
            mutation createPackage {
              packageCreate(
                input: {
                  name: "${AIWARE_CI_TEST_STAMP} citest test package 2"
                  version: "1.0"
                  primaryResourceId: "${secondAppId}",
                  status: published,
                  resources: [
                    {
                      resourceId: "${secondAppId}"
                      resourceType: application
                      action: ADD
                    }
                  ]
                }
              ) {
                id
                resources {
                  records {
                    id
                    resourceType
                    resourceAlias
                  }
                }
              }
            }
          `;

        let resultSecondCreatePackageMutation = await gqlClient.query(
          secondCreatePackageMutation,
          {},
          adminOptions
        );
        let ci_packageTwo = _.get(
          resultSecondCreatePackageMutation,
          'packageCreate'
        );

        idSecondPackage = _.get(ci_packageTwo, 'id');

        expect(
          _.get(ci_packageTwo, 'resources.records').length
        ).toBeGreaterThan(0);
      } else {
        // If package auto created, we must update the state to published
        gql = `
          mutation updatePackage {
            packageUpdate(
              input: {
                id: "${idSecondPackage}"
                status: published
              }
            ) {
                id
              }
            }
        `;
        result = await gqlClient.query(gql);
      }

      expect(idSecondPackage).toBeDefined();
    });

    it('avoid cycle in a nested package for packageUpdate', async () => {
      let firstUpdatePackageMutation = `
          mutation updatePackage {
            packageUpdate(
              input: {
                id: "${idFirstPackage}"
                resources: [
                  {
                    resourceId: "${idSecondPackage}"
                    resourceType: package
                    action: ADD
                  },
                ]
              }
            ) {
              id
              resources {
                records {
                  id
                  resourceType
                  resourceId
                  resourceAlias
                }
              }
            }
          }
        `;
      let resultFirstPackageUpdate = await gqlClient.query(
        firstUpdatePackageMutation,
        {},
        adminOptions
      );
      let packageUpdateResult = _.get(
        resultFirstPackageUpdate,
        'packageUpdate'
      );
      let IdForFirstPackage = _.get(packageUpdateResult, 'id');
      expect(IdForFirstPackage).toBeDefined();

      let secondUpdatePackageMutation = `
          mutation updatePackage {
            packageUpdate(
              input: {
                id: "${idSecondPackage}"
                resources: [
                  {
                    resourceId: "${idFirstPackage}"
                    resourceType: package
                    action: ADD
                  },
                ]
              }
            ) {
              id
              resources {
                records {
                  id
                  resourceType
                  resourceId
                  resourceAlias
                }
              }
            }
          }
        `;
      try {
        result = await gqlClient.query(
          secondUpdatePackageMutation,
          {},
          adminOptions
        );
      } catch (e) {
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
      let gql = `
        mutation {
          createApplication(
            input: {
              name: "${AIWARE_CI_TEST_STAMP} Draft Application - ${uuid.v4()}"
              status: draft
              checkPermissions: false
              key: "CITestApp - ${uuid.v4()}"
              url: "www.example.com"
            }
          ) {
            id
          }
        }`;
      let result = await gqlClient.query(gql);
      let createApplication = _.get(result, 'createApplication');
      expect(createApplication).toBeDefined();
      expect(createApplication.id).toBeDefined();

      const draftApplicationId = createApplication.id;

      // Find the auto created package (if any)
      gql = `query {
        packages(primaryResourceId: "${draftApplicationId}") {
          records {
            id
          }
        }
      }`;
      result = await gqlClient.query(gql);
      const packages = _.get(result, 'packages');
      let testPackageId = _.get(packages, 'records[0].id');

      if (!testPackageId) {
        gql = `
          mutation {
            packageCreate(
              input: {
                name: "${AIWARE_CI_TEST_STAMP} Package - ${uuid.v4()}"
                organizationId: 7682
                version: "1.0.0"
                primaryResourceId: "${draftApplicationId}"
                resources: [
                  {
                    resourceType: application
                    resourceId: "${draftApplicationId}"
                  }
                ]
              }
            ) {
              id
            }
          }
        `;

        result = await gqlClient.query(gql);
        let packageCreate = _.get(result, 'packageCreate');
        expect(packageCreate).toBeDefined();
        expect(packageCreate.id).toBeDefined();

        testPackageId = packageCreate.id;
      }

      // Try to move the package to the next state (non-draft state),
      // but should fail since the application is in draft status

      gql = `
      mutation {
        packageUpdate(
          input: {
            id: "${testPackageId}"
            status: pending
          }
        ) {
          id
        }
      }
      `;

      try {
        result = await gqlClient.query(gql);
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });

  itif(
    !global.enablePackageGrantLogic,
    'should pass package state change to non-draft due to application resource in the active state',
    async () => {
      let gql = `
      mutation {
        createApplication(
          input: {
            name: "${AIWARE_CI_TEST_STAMP} Active Application - ${uuid.v4()}"
            status: active
            checkPermissions: false
            key: "CITestApp - ${uuid.v4()}"
            url: "www.citest.com"
          }
        ) {
          id
        }  
      }`;
      let result = await gqlClient.query(gql);
      let createApplication = _.get(result, 'createApplication');
      expect(createApplication).toBeDefined();
      expect(createApplication.id).toBeDefined();

      const activeApplicationId = createApplication.id;

      // Find the auto created package (if any)
      gql = `query {
      packages(primaryResourceId: "${activeApplicationId}") {
        records {
          id
        }
      }
    }`;
      result = await gqlClient.query(gql);
      const packages = _.get(result, 'packages');
      let testPackageId = _.get(packages, 'records[0].id');

      if (!testPackageId) {
        gql = `
        mutation {
          packageCreate(
            input: {
              name: "${AIWARE_CI_TEST_STAMP} Package - ${uuid.v4()}"
              organizationId: 7682
              version: "1.0.0"
              primaryResourceId: "${activeApplicationId}"
              resources: [
                {
                  resourceType: application
                  resourceId: "${activeApplicationId}"
                }
              ]
            }
          ) {
            id
          }
        }            
        `;
        result = await gqlClient.query(gql);
        let packageCreate = _.get(result, 'packageCreate');
        expect(packageCreate).toBeDefined();
        expect(packageCreate.id).toBeDefined();

        testPackageId = packageCreate.id;
      }

      gql = `
    mutation {
      packageUpdate(
        input: {
          id: "${testPackageId}"
          status: pending
        }
      ) {
        id
      }
    }                  
    `;

      result = await gqlClient.query(gql);
      let packageUpdate = _.get(result, 'packageUpdate');
      expect(packageUpdate).toBeDefined();
      expect(packageUpdate.id).toBeDefined();
    }
  );

  itif(
    !global.enablePackageGrantLogic,
    'should fail package state change to non-draft due to schema resource not in the published state, useAppGrant = true',
    async () => {
      let gql = `
    mutation {
      createDataRegistry(input: { name: "DataRegistry - ${uuid.v4()}", description: "", source: "" }) {
        id
      }
    }
    `;
      let result = await gqlClient.query(gql, {}, appGrantOrgAdminOptions);
      const createDataRegistry = _.get(result, 'createDataRegistry');
      expect(createDataRegistry).toBeDefined();
      expect(createDataRegistry.id).toBeDefined();

      const dataRegistryId = createDataRegistry.id;

      gql = `
      mutation ($schema: JSONData!) {
        upsertSchemaDraft(
          input: {
            schema: $schema
            majorVersion: 1
            dataRegistryId: "${dataRegistryId}"
          }
        ) {
          id
        }
      }`;
      result = await gqlClient.query(gql, { schema }, appGrantOrgAdminOptions);
      const upsertSchemaDraft = _.get(result, 'upsertSchemaDraft');
      expect(upsertSchemaDraft).toBeDefined();
      expect(upsertSchemaDraft.id).toBeDefined();

      const draftSchemaId = upsertSchemaDraft.id;
      gql = `
      mutation {
        packageCreate(
          input: {
            name: "${AIWARE_CI_TEST_STAMP} Package - ${uuid.v4()}"
            organizationId: "${appGrantOrg.id}"
            version: "1.0.0"
            primaryResourceId: "${draftSchemaId}"
            resources: [
              {
                resourceType: schema
                resourceId: "${draftSchemaId}"
              }
            ]
          }
        ) {
          id
        }
      }            
      `;

      result = await gqlClient.query(gql, {}, appGrantOrgAdminOptions);
      let packageCreate = _.get(result, 'packageCreate');
      expect(packageCreate).toBeDefined();
      expect(packageCreate.id).toBeDefined();
      const testPackageId = packageCreate.id;
      gql = `
        mutation {
          packageUpdate(
            input: {
              id: "${testPackageId}"
              status: published
            }
          ) {
            id
          }
        }                  
      `;

      try {
        result = await gqlClient.query(gql, {}, appGrantOrgAdminOptions);
        expect(_.get(result, 'packageUpdate').id).toBeUndefined();
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.toString()).toContain(
          'Resource is inactive. This package cannot be published until all its resources are active/published.'
        );
      }
    }
  );

  itif(
    !global.enablePackageGrantLogic,
    'should pass package state change to non-draft due to schema resource in the published state',
    async () => {
      let gql = `
    mutation {
      createDataRegistry(input: { name: "DataRegistry - ${uuid.v4()}", description: "", source: "", isPublic: true }) {
        id
      }
    }
    `;
      let result = await gqlClient.query(gql);
      const createDataRegistry = _.get(result, 'createDataRegistry');
      expect(createDataRegistry).toBeDefined();
      expect(createDataRegistry.id).toBeDefined();

      const dataRegistryId = createDataRegistry.id;

      gql = `
      mutation ($schema: JSONData!) {
        upsertSchemaDraft(
          input: {
            schema: $schema
            majorVersion: 1
            dataRegistryId: "${dataRegistryId}"
          }
        ) {
          id
        }
      }`;
      result = await gqlClient.query(gql, { schema });
      const upsertSchemaDraft = _.get(result, 'upsertSchemaDraft');
      expect(upsertSchemaDraft).toBeDefined();
      expect(upsertSchemaDraft.id).toBeDefined();

      const activeSchemaId = upsertSchemaDraft.id;

      gql = `
      mutation {
        updateSchemaState(
          input: {
            status: published
            id: "${activeSchemaId}"
          }
        ) {
          id
        }
      }`;
      result = await gqlClient.query(gql);
      const updateSchemaState = _.get(result, 'updateSchemaState');
      expect(updateSchemaState).toBeDefined();
      expect(updateSchemaState.id).toBeDefined();

      gql = `
      mutation {
        packageCreate(
          input: {
            name: "${AIWARE_CI_TEST_STAMP} Package - ${uuid.v4()}"
            organizationId: 7682
            version: "1.0.0"
            primaryResourceId: "${activeSchemaId}"
            resources: [
              {
                resourceType: schema
                resourceId: "${activeSchemaId}"
              }
            ]
          }
        ) {
          id
        }
      }            
      `;
      result = await gqlClient.query(gql);
      let packageCreate = _.get(result, 'packageCreate');
      expect(packageCreate).toBeDefined();
      expect(packageCreate.id).toBeDefined();

      const testPackageId = packageCreate.id;

      gql = `
    mutation {
      packageUpdate(
        input: {
          id: "${testPackageId}"
          status: pending
        }
      ) {
        id
      }
    }                  
    `;

      try {
        result = await gqlClient.query(gql);
      } catch (err) {
        expect(err).toBeDefined();
      }
    }
  );

  itif(
    !global.enablePackageGrantLogic,
    'should fail package state change to non-draft due to engine resource not in the active state',
    async () => {
      // Fix: The org does not have access to 078d34a7-80b4-4efe-903f-2f13392deca8 - Generator
      let gql = `
    mutation {
      createEngine(
        input: {
          name: "${AIWARE_CI_TEST_STAMP} Engine - ${uuid.v4()}"
          categoryId: "${defaultEngineCategoryId}"
          deploymentModel: NonNetworkIsolated
        }
      ) {
        id
      }
    }    
    `;
      let result = await gqlClient.query(gql);
      const createEngine = _.get(result, 'createEngine');
      expect(createEngine).toBeDefined();
      expect(createEngine.id).toBeDefined();

      const testEngineId = createEngine.id;

      gql = `
      mutation {
        packageCreate(
          input: {
            name: "${AIWARE_CI_TEST_STAMP} Package - ${uuid.v4()}"
            organizationId: 7682
            version: "1.0.0"
            primaryResourceId: "${testEngineId}"
            resources: [
              {
                resourceType: engine
                resourceId: "${testEngineId}"
              }
            ]
          }
        ) {
          id
        }
      }            
      `;
      result = await gqlClient.query(gql);
      let packageCreate = _.get(result, 'packageCreate');
      expect(packageCreate).toBeDefined();
      expect(packageCreate.id).toBeDefined();

      const testPackageId = packageCreate.id;

      gql = `
    mutation {
      packageUpdate(
        input: {
          id: "${testPackageId}"
          status: pending
        }
      ) {
        id
      }
    }                  
    `;

      try {
        result = await gqlClient.query(gql);
      } catch (err) {
        expect(err).toBeDefined();
      }
    }
  );

  itif(
    !global.enablePackageGrantLogic,
    'should pass package state change to non-draft due to engine resources in the active state',
    async () => {
      let gql = `
    mutation {
      createEngine(
        input: {
          name: "${AIWARE_CI_TEST_STAMP} Engine - ${uuid.v4()}"
          categoryId: "${defaultEngineCategoryId}"
          deploymentModel: NonNetworkIsolated
        }
      ) {
        id
      }
    }   
    `;

      let result = await gqlClient.query(gql);
      const createEngine = _.get(result, 'createEngine');
      expect(createEngine).toBeDefined();
      expect(createEngine.id).toBeDefined();

      const testEngineId = createEngine.id;

      gql = `mutation {
      createEngineBuild(input: { engineId: "${testEngineId}", dockerImage: "mcr.microsoft.com/dotnet/samples:aspnetapp" }) {
        id
      }
    }
    `;

      result = await gqlClient.query(gql);
      const createEngineBuild = _.get(result, 'createEngineBuild');
      expect(createEngineBuild).toBeDefined();
      expect(createEngineBuild.id).toBeDefined();

      let testEngineBuildId = createEngineBuild.id;

      gql = `mutation {
      updateEngineBuild(
        input: {
          id: "${testEngineBuildId}"
          engineId: "${testEngineId}"
          dockerImage: "mcr.microsoft.com/dotnet/samples:aspnetapp"
          action: upload
        }
      ) {
        id
      }
    }`;

      result = await gqlClient.query(gql);
      let updateEngineBuild = _.get(result, 'updateEngineBuild');
      expect(updateEngineBuild).toBeDefined();
      expect(updateEngineBuild.id).toBeDefined();

      gql = `mutation {
      updateEngineBuild(
        input: {
          id: "${testEngineBuildId}"
          engineId: "${testEngineId}"
          action: deploy
        }
      ) {
        id
      }
    }`;

      try {
        result = await gqlClient.query(gql);
        updateEngineBuild = _.get(result, 'updateEngineBuild');
        expect(updateEngineBuild).toBeDefined();
        expect(updateEngineBuild.id).toBeDefined();
      } catch (ex) {
        // Sometimes we cannot update build status due to the validation
        // [{"message":"not a valid build action in current build state","name":"not_allowed","time_thrown":"2023-11-02T10:01:40.533Z",
        // "data":{"objectType":"action","objectData":"deploy","currentBuildState":"invalid","validBuildStates":["delete"],
        console.log('Unable to update build status', ex);
        testEngineBuildId = null;
      }

      // Find the auto created package (if any)
      gql = `query {
      packages(primaryResourceId: "${testEngineId}") {
        records {
          id
        }
      }
    }`;
      result = await gqlClient.query(gql);
      const packages = _.get(result, 'packages');
      let testPackageId = _.get(packages, 'records[0].id');

      if (!testPackageId) {
        gql = `
        mutation {
          packageCreate(
            input: {
              name: "CI Test Package - ${uuid.v4()}"
              organizationId: 7682
              version: "1.0.0"
              primaryResourceId: "${testEngineId}"
              resources: [
                {
                  resourceType: engine
                  resourceId: "${testEngineId}"
                }${
                  !testEngineBuildId
                    ? ''
                    : `,
                {
                  resourceType: engineBuild
                  resourceId: "${testEngineBuildId}"
                }`
                }
              ]
            }
          ) {
            id
          }
        }            
        `;
        result = await gqlClient.query(gql);
        let packageCreate = _.get(result, 'packageCreate');
        expect(packageCreate).toBeDefined();
        expect(packageCreate.id).toBeDefined();

        testPackageId = packageCreate.id;
      }

      gql = `
    mutation {
      packageUpdate(
        input: {
          id: "${testPackageId}"
          status: pending
        }
      ) {
        id
      }
    }                  
    `;

      result = await gqlClient.query(gql);
      let packageUpdate = _.get(result, 'packageUpdate');
      expect(packageUpdate).toBeDefined();
      expect(packageUpdate.id).toBeDefined();
    }
  );
  describe('Final Test Artifact Clean-Up', () => {
    it('should clean up test artifacts', async () => {
      // delete packages and resources
      const packagesGQL = `
      query {
        packages(nameRegexp: "${AIWARE_CI_TEST_STAMP}") {
          records {
            id
            resources{
              records{
                resourceId
                resourceType
              }
            }
          }
        }
      }   
      `;

      const packagesResult = await gqlClient.query(packagesGQL);
      const packages = _.get(packagesResult, 'packages');
      const resources = [];
      // delete any residual packages
      for (const record of packages.records) {
        // delete the package resources
        await Promise.all(
          record.resources.records.map(async (resource) => {
            // avoid duplicate resource deletion
            if (
              !_.find(
                resources,
                (resourceId) => resourceId === resource.resourceId
              )
            ) {
              if (resource.resourceType === 'engine') {
                const engineId = resource.resourceId;
                resources.push(engineId);
                return safe(`deleteEngine ${engineId}`, async () =>
                  deleteEngine(engineId)
                );
              } else if (resource.resourceType === 'application') {
                const applicationId = resource.resourceId;
                resources.push(applicationId);
                return safe(`deleteApplication ${applicationId}`, async () =>
                  deleteApplication(applicationId)
                );
              } else if (resource.resourceType === 'tdo') {
                // delete the cloned tdo added to this package
                const tdoId = resource.resourceId;
                resources.push(tdoId);
                return safe(`deleteTDO ${tdoId}`, async () => deleteTDO(tdoId));
              }
            }
          })
        );

        // delete the package
        const packageId = record.id;
        await safe(`deletePackage ${packageId}`, async () =>
          deletePackage(packageId)
        );
      }
    });
  });
});

async function getOrganization(name, ignoreExpect) {
  const getOrgGQL = `
      query getOrganization {
        organizations(
          name: "${name}"
          nameMatch: contains
        ) {
          records {
            id
            guid
            name
            rootFolder {
              id
              name
              description
            }
            jsondata
            users {
              records {
                name
                id
                organizationGuid
                organizationId
                authGroups {
                  records {
                    id
                    name
                    description
                  }
                }
              }
            }
          }
        }
      }`;

  const resultOrgGql = await gqlClient.query(getOrgGQL);
  const engineGrantOrg = _.get(resultOrgGql, 'organizations.records[0]');

  if (!ignoreExpect) {
    expect(engineGrantOrg).toBeDefined();
    expect(engineGrantOrg.name).toContain(name);
    expect(engineGrantOrg.users).toBeDefined();
  }

  return engineGrantOrg;
}

async function deleteApplication(applicationId, options) {
  if (applicationId) {
    const gql = `
      mutation {
        deleteApplication(
          id: "${applicationId}"
        ) {
          id
        }
      }
    `;
    const result = await gqlClient.query(gql, {}, options);
    expect(result.deleteApplication).toBeDefined();
    if (result.deleteApplication) {
      expect(result.deleteApplication.id).toEqual(applicationId);
    }
  }
}

async function deleteTDO(tdoId, option) {
  if (tdoId) {
    const gql = `
    mutation {
      deleteTDO(
        id: "${tdoId}"
      ) {
        id
      }
    }
  `;
    const result = await gqlClient.query(gql, {}, option);
    expect(result.deleteTDO.id).toEqual(tdoId);
  }
}

async function deleteEngine(id, adminOptions) {
  if (id) {
    const deleteEngine = `
    mutation {
      deleteEngine(id: "${id}") {
        id
        message
      }
    }
  `;
    try {
      const engineDeleted = await gqlClient.query(
        deleteEngine,
        {},
        adminOptions
      );
      expect(engineDeleted.deleteEngine.id).toEqual(id);
    } catch (error) {
      expect(error.message).toContain('engine has been deleted');
    }
  }
}

async function deleteEngineBuild(engineId, engineBuildId, adminOptions) {
  if (engineId && engineBuildId) {
    const deleteEngineBuild = `
    mutation deleteEngineBuild {
      deleteEngineBuild(
        input: {
          id: "${engineBuildId}"
          engineId: "${engineId}"
        }
      ) {
        id
        message
      }
    }
  `;
    const engineBuildDeleted = await gqlClient.query(
      deleteEngineBuild,
      {},
      adminOptions
    );
    expect(engineBuildDeleted.deleteEngineBuild.id).toEqual(engineBuildId);
  }
}

async function deletePackage(id, adminOptions) {
  if (id) {
    const deletePackage = `
    mutation packageDelete{
      packageDelete(id: "${id}") {
        success
        msg
        code
      }
    }
  `;
    const packageDeleted = await gqlClient.query(
      deletePackage,
      {},
      adminOptions
    );
    expect(packageDeleted.packageDelete.success).toEqual(true);
  }
}

async function setupTestOrganization(
  client,
  prefixName,
  useEngineGrant,
  useAppGrant
) {
  // set up organization
  const createOrgGql = `mutation ($kvp: JSONData!, $apps: JSONData) {
    createOrganization (input: {
      name: "${prefixName}-${uuid.v4()}"
      businessUnit: "Legal"
      types: [agency, broadcaster]
      metadata: $kvp
      applications: $apps
    }) {
      id
      guid
      name
      type
      jsondata
    }
  }`;

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
  const org = await client.query(createOrgGql, variables);

  return await getOrganization(prefixName);
}

const meGql = `
query {
  me {
    id
    name
    organization {
      id
      guid
      jsondata
    }
    authGroups {
      records {
        id
        name
        parentGroups {
          records {
            id
            name
            description
          }
        }
        permissionSet{
          id
          name
          permissions
        }
        appRole {
          description
          permissions {
            records {
              id
              name
              __typename
            }
          }
        }
      }
    }
  }
}`;

async function updateUserRole(userId, orgId, roleIds = []) {
  const createResourceMutation = `
  mutation updateUser ($userId: ID!, $orgId: ID!, $roleIds: [ID!]) {
    updateUser(
      input: {
        id: $userId
        roleIds: $roleIds
        organizationId: $orgId
      }
    ) {
      id
    }
  }
  `;

  const result = await gqlClient.query(createResourceMutation, {
    userId,
    orgId,
    roleIds
  });
  expect(result.updateUser.id).toBeDefined();
}

async function createOrgAdminUser(client, prefixName, orgId) {
  const createOrgAdminUser = `
    mutation createUser {
      createUser(
        input: {
          name: "${prefixName}-citest-admin-user-${uuid.v4()}@localhost"
          organizationId: "${orgId}"
          firstName: "Package-User"
          lastName: "Admin"
          jsondata: {
            firstName: "Package-User"
            lastName: "Admin"
          }
          roleIds: ${JSON.stringify(ROLES_IDS)}
        }
      )  {
        id
        name
        firstName
        lastName
        jsondata
      }
    }`;
  const adminUser = await client.query(createOrgAdminUser, {});
  expect(adminUser.createUser).toBeDefined();

  return adminUser.createUser;
}

async function createApplication(adminOptions) {
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
      permissions: ['DEVELOPER_ENGINE_READ']
    }
  };
  const result = await gqlClient.query(query, variables, adminOptions);
  return _.get(result, 'createApplication');
}

async function createRegularUser(prefixName, orgId, aiwareRoleId, suffix = '') {
  const userName = `${prefixName}-citest-regular-user${
    suffix ? '-' + suffix : ''
  }-${uuid.v4()}@localhost`;
  const roleIdsInput = aiwareRoleId ? `roleIds: ["${aiwareRoleId}"]` : '';
  const query = `mutation {
    createUser(input: {
    name: "${userName}"
      organizationId: "${orgId}"
      firstName: "User"
      lastName: "Aiware"
      jsondata: {
        firstName: "User"
        lastName: "Aiware"
      }
      ${roleIdsInput}
    })  {
      id
      name
      firstName
      lastName
      jsondata
    }
  }

  `;
  const result = await gqlClient.query(query);
  return _.get(result, 'createUser');
}

async function impersonateUser(userId, orgGuid, superToken) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${orgGuid}`;
  const options = helpers.requestOptions(superToken);
  const res = await chakram.get(url, options);
  expect(_.get(res, 'body.token')).toBeDefined();
  return helpers.requestOptions(_.get(res, 'body.token'));
}

function extractPackageIdsFromResults(results, type = 'packages') {
  if (type === 'packages') {
    return _.map(_.get(results, 'packages.records'), 'id');
  } else {
    return _.map(_.get(results, 'packageGrants.records'), (r) =>
      _.get(r, 'package.id')
    );
  }
}

const getGrantedPackageIds = async (orgId, userOptions) => {
  const grantsQuery = `
    query {
      packageGrants(orgId: "${orgId}", limit: 1000) {
        records {
          package { id }
        }
      }
    }
  `;
  const grantsRes = await gqlClient.query(grantsQuery, {}, userOptions);
  return extractPackageIdsFromResults(grantsRes, 'grants');
};

const getPackagesByIds = async (ids, userOptions) => {
  const idList = ids.map((id) => `"${id}"`).join(', ');
  const packagesQuery = `
    query {
      packages(ids: [${idList}], limit: 1000) {
        records { id }
      }
    }
  `;
  const packagesRes = await gqlClient.query(packagesQuery, {}, userOptions);
  return extractPackageIdsFromResults(packagesRes, 'packages');
};
