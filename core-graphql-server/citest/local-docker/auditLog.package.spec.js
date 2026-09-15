const helpers = require('../helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_CI_TEST_SERVICE_TOKEN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const uuid = require('uuid');
const chakram = require('chakram');
const moment = require('moment');
const _ = require('lodash');
const { getPackageByIdQuery } = require('../package/packageCommonQuery.js');
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const OPTIONS = {
  configurableEvents: [
    'PackageCreate',
    'PackageDelete',
    'PackageApprove',
    'PackageReject',
    'PackageInstall',
    'PackageGrantSet',
    'PackageGrantRemove'
  ],
  baseLineEvents: [
    'task_queued', // 'TaskQueued',
    'task_updated', // 'TaskUpdated',
    'task_completed' // 'TaskCompleted',
  ]
};
let gqlClient, helpersAuditLog, adminOptions;
// use this name stamp on packages and resources for clean-up filtering and aiWARE CI Test artifact identification
const AIWARE_CI_TEST_STAMP = 'aiWARE CI Test';
const startDateTime = moment().subtract(2, 'hour').unix();
const stopDateTime = moment().subtract(1, 'hour').unix();
const publicEnginesPackageName = `${AIWARE_CI_TEST_STAMP} publicEngines`;
const adminRoles = [
  'ddca9b68-d775-4934-8ffd-7aecc779b652', // Org Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop Admin
  'ddf6f444-eaf0-4ee3-bded-98776e5fee0f' // CI Tester
];

const TRANSCRIPT_ENGINE_CATEGORY_ID = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
const TRANSLATION_ENGINE_CATEGORY_ID = '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923';

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

const config = helpers.config;

const itif = (condition, ...args) =>
  condition ? it(...args) : it.skip(...args);
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
   'audit-log-package', () => {
  let CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
    const result = await helpersAuditLog.loginWithConfiguredUser();
    CONFIG_ADMIN_TOKEN = result.userLogin.token;
    CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
    expect(CONFIG_ADMIN_TOKEN).toBeDefined();
    expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
  });

  it.skip('TEMPLATE', async () => {
    // ARRANGE
    const correlationID = helpersAuditLog.buildCorrelationID();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    const firstOrganizationId = result.createOrganization.id;
    result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    const secondOrganizationId = result.createOrganization.id;

    const userDataNotAdmin = helpersAuditLog.createRandomUserData();
    await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userDataNotAdmin.email,
      config.password,
      secondOrganizationId
    );
    result = await helpersAuditLog.loginUser(
      userDataNotAdmin.email,
      config.password
    );
    const userTokenNotAdmin = result.userLogin.token;

    const userData = helpersAuditLog.createRandomUserData();
    await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      firstOrganizationId
    );
    result = await helpersAuditLog.createOrganizationInvite(
      userTokenNotAdmin,
      secondOrganizationId,
      userData.email
    );
    const organizationInviteID = result.createOrganizationInvite.id;

    // ACT
    result = await helpersAuditLog.approveInvitationRequest(
      CONFIG_ADMIN_TOKEN,
      organizationInviteID,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    // ASSERT
    // START WITH undefined as the log will show what has been indexed
    const expectedAuditLogItems = undefined;
    //[
    //   {
    //     eventType: 'organizationInvite',
    //     eventName: 'OrganizationRequest'
    //   }
    // ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  let superToken, engineGrantOrg, appGrantOrg, noEngineGrantOrg;
  let engineGrantSuperAdminToken, engineGrantSuperAdminOptions;
  let noEngineGrantSuperAdminToken, noEngineGrantSuperAdminOptions;
  let orgAdminUserInNoEngineGrantOrg,
    orgAdminUserInEngineGrantOrg,
    orgAdminUserInAppGrantOrg;
  let engineGrantOrgAdminToken, engineGrantOrgAdminOptions;
  let appGrantOrgAdminToken, appGrantOrgAdminOptions;
  let noEngineGrantOrgAdminToken, noEngineGrantOrgAdminOptions;

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

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;

    result = await gqlClient.query(meGql);
    expect(result.me).toBeDefined();
    const superUserId = _.get(result, 'me.id');

    // get citest org which has useEngineGrant and useAppGrant disabled
    let nameOrg = 'citest-no-engine-grant-org';
    noEngineGrantOrg = await getOrganization(nameOrg, true);
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
    engineGrantOrg = await getOrganization(nameOrg, true);
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
    appGrantOrg = await getOrganization(nameOrg, true);
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
    let url, options, impersonated;
    url = `${config.core_admin_url}/admin/impersonate/${superUserId}/${engineGrantOrg.guid}`;
    options = helpers.requestOptions(superToken);
    impersonated = await chakram.get(url, options);
    expect(_.get(impersonated, 'body.token')).toBeDefined();
    engineGrantSuperAdminToken = _.get(impersonated, 'body.token');
    engineGrantSuperAdminOptions = helpers.requestOptions(
      engineGrantSuperAdminToken
    );

    // Login for super Admin user (noEngineGrantOrg)
    url = `${config.core_admin_url}/admin/impersonate/${superUserId}/${noEngineGrantOrg.guid}`;
    options = helpers.requestOptions(superToken);
    impersonated = await chakram.get(url, options);
    expect(_.get(impersonated, 'body.token')).toBeDefined();
    noEngineGrantSuperAdminToken = _.get(impersonated, 'body.token');
    noEngineGrantSuperAdminOptions = helpers.requestOptions(
      noEngineGrantSuperAdminToken
    );

    // Login for org Admin user (engineGrantOrg)
    url = `${config.core_admin_url}/admin/impersonate/${orgAdminUserInEngineGrantOrg.id}/${engineGrantOrg.guid}`;
    options = helpers.requestOptions(superToken);
    impersonated = await chakram.get(url, options);
    expect(_.get(impersonated, 'body.token')).toBeDefined();
    engineGrantOrgAdminToken = _.get(impersonated, 'body.token');
    engineGrantOrgAdminOptions = helpers.requestOptions(
      engineGrantOrgAdminToken
    );

    // Login for org Admin user (noEngineGrantOrg)
    url = `${config.core_admin_url}/admin/impersonate/${orgAdminUserInNoEngineGrantOrg.id}/${noEngineGrantOrg.guid}`;
    options = helpers.requestOptions(superToken);
    impersonated = await chakram.get(url, options);
    expect(_.get(impersonated, 'body.token')).toBeDefined();
    noEngineGrantOrgAdminToken = _.get(impersonated, 'body.token');
    noEngineGrantOrgAdminOptions = helpers.requestOptions(
      noEngineGrantOrgAdminToken
    );

    // Login for org Admin user (appGrantOrg)
    url = `${config.core_admin_url}/admin/impersonate/${orgAdminUserInAppGrantOrg.id}/${appGrantOrg.guid}`;
    options = helpers.requestOptions(superToken);
    impersonated = await chakram.get(url, options);
    expect(_.get(impersonated, 'body.token')).toBeDefined();
    appGrantOrgAdminToken = _.get(impersonated, 'body.token');
    appGrantOrgAdminOptions = helpers.requestOptions(appGrantOrgAdminToken);
  });

  // TODO: Should enable when the changes are deployed to dev env.
  describe('#package operations', () => {
    describe('Test for query TDOs using resourceAlias', () => {
      let tdoId_1, tdoId_2, tdoId_3;
      let packageId, distributionType, approvedPackageId;
      let appId, appResourceAlias;
      const clearTDOs = new Set();
      const clearPackages = new Set();
      const clearApps = new Set();
      const uniqueId = Date.now().valueOf();

      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
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
                status: active
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

      it('should create package with TDO 1 resources and index event to Audit Log for eventName PackageCreate', async () => {
        const correlationID = helpersAuditLog.buildCorrelationID();
        const result = await createPackage(
          appId,
          appId,
          tdoId_1,
          correlationID,
          'pending'
        );
        let correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        const packageCreated = _.get(result, 'packageCreate');
        expect(correlationIDResponse).toEqual(correlationID);
        packageId = _.get(packageCreated, 'id');
        expect(packageId).toBeDefined();
        expect(
          _.get(packageCreated, 'resources.records').length
        ).toBeGreaterThan(0);

        // validate resource Alias
        _.get(packageCreated, 'resources.records', []).forEach((pr) => {
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

        const expectedAuditLogItems = [
          {
            actionName: 'create',
            actionResult: 'success',
            actionDetails: `Created package ${packageCreated.name}`,
            targetType: 'tt_Package',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageCreate'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });

      it('should approve package with TDO 1 resources and index event to Audit Log for eventName PackageApprove', async () => {
        // to create package
        const firstCorrelationId = helpersAuditLog.buildCorrelationID();
        let result = await createPackage(
          tdoId_1,
          appId,
          tdoId_1,
          firstCorrelationId,
          'pending'
        );
        let firstCorrelationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        expect(firstCorrelationIDResponse).toEqual(firstCorrelationId);
        const packageCreated = _.get(result, 'packageCreate');

        // to update package
        const secondCorrelationId = helpersAuditLog.buildCorrelationID();
        result = await updatePackage(
          packageCreated.id,
          secondCorrelationId,
          'approved'
        );
        let secondCorrelationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        const packageUpdated = _.get(result, 'packageUpdate');
        expect(secondCorrelationIDResponse).toEqual(secondCorrelationId);
        expect(_.get(packageUpdated, 'id')).toBeDefined();
        expect(
          _.get(packageUpdated, 'resources.records').length
        ).toBeGreaterThan(0);

        // validate resource Alias
        _.get(packageUpdated, 'resources.records', []).forEach((pr) => {
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

        const expectedAuditLogItems = [
          {
            actionName: 'update',
            actionResult: 'success',
            actionDetails: `Approved package ${packageUpdated.name}`,
            targetType: 'tt_Package',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageApprove'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          secondCorrelationId,
          expectedAuditLogItems
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID: secondCorrelationId,
          correlationIDResponse: secondCorrelationIDResponse
        });
      });

      it('should log a failed packageUpdate operation when initial input validation fails', async () => {
        // to update package
        const correlationId = helpersAuditLog.buildCorrelationID();
        let correlationIDResponse;
        try {
          await updatePackage('', correlationId, 'approved'); // '' package id will cause failure
        } catch (err) {
          correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
            err
          );
        }
        // validate resource Alias
        const expectedAuditLogItems = [
          {
            actionName: 'update',
            actionResult: 'failure',
            actionDetails: 'Failed to approve package undefined',
            targetType: 'tt_Package'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationId,
          expectedAuditLogItems
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID: correlationId,
          correlationIDResponse
        });
      });

      it('should reject package with TDO 1 resources and index event to Audit Log for eventName PackageReject', async () => {
        // to create package
        const firstCorrelationId = helpersAuditLog.buildCorrelationID();
        let result = await createPackage(
          tdoId_1,
          appId,
          tdoId_1,
          firstCorrelationId,
          'pending'
        );
        let firstCorrelationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        expect(firstCorrelationIDResponse).toEqual(firstCorrelationId);
        const packageCreated = _.get(result, 'packageCreate');

        // to update package
        const secondCorrelationId = helpersAuditLog.buildCorrelationID();
        result = await updatePackage(
          packageCreated.id,
          secondCorrelationId,
          'rejected'
        );
        let secondCorrelationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        const packageUpdated = _.get(result, 'packageUpdate');
        expect(secondCorrelationIDResponse).toEqual(secondCorrelationId);
        expect(_.get(packageUpdated, 'id')).toBeDefined();
        expect(
          _.get(packageUpdated, 'resources.records').length
        ).toBeGreaterThan(0);

        // validate resource Alias
        _.get(packageUpdated, 'resources.records', []).forEach((pr) => {
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
        const expectedAuditLogItems = [
          {
            actionName: 'update',
            actionResult: 'success',
            actionDetails: `Rejected package ${packageUpdated.name}`,
            targetType: 'tt_Package',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageReject'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          secondCorrelationId,
          expectedAuditLogItems
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID: secondCorrelationId,
          correlationIDResponse: secondCorrelationIDResponse
        });
      });

      it('should log a failed PackageReject operation when initial input validation fails', async () => {
        // to update package
        const correlationId = helpersAuditLog.buildCorrelationID();
        let correlationIDResponse;
        try {
          await updatePackage('', correlationId, 'rejected'); // '' package id will cause failure
        } catch (err) {
          correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
            err
          );
        }
        // validate resource Alias
        const expectedAuditLogItems = [
          {
            actionName: 'update',
            actionResult: 'failure',
            actionDetails: 'Failed to reject package undefined',
            targetType: 'tt_Package'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationId,
          expectedAuditLogItems
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID: correlationId,
          correlationIDResponse
        });
      });

      it('should delete package and index event to Audit Log for eventName PackageDelete', async () => {
        let query, result, ci_package;

        // get package name
        ci_package = await gqlClient.query(
                getPackageByIdQuery,
                { id: packageId },
                adminOptions
              );
        const packageName = _.get(ci_package, 'packages.records[0].name');
        expect(packageName).toBeDefined();

        query = `
        mutation deletePackage {
          packageDelete(
            id: "${packageId}"
          ) {
            success
          }
        }
      `;
        const correlationID = helpersAuditLog.buildCorrelationID();
        result = await gqlClient.query(
          query,
          {},
          helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
            adminOptions,
            correlationID
          )
        );
        let correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        expect(correlationIDResponse).toEqual(correlationID);

        // ASSERT AUDIT LOG EVENTS
        const expectedAuditLogItems = [
          {
            actionName: 'delete',
            actionResult: 'success',
            actionDetails: `Deleted package ${packageName}`,
            targetType: 'tt_Package',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageDelete'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });

      it('should throw error for an invalid packageId and emit event to Audit Log for eventName PackageDelete', async () => {
        let query, result, ci_package;
        const invalidPackageId = 'b3234e83-7f4f-40f1-a1e8-78e0cea976b5';
        query = `
        mutation deletePackage {
          packageDelete(
            id: "${invalidPackageId}"
          ) {
            success
          }
        }
      `;
        const correlationID = helpersAuditLog.buildCorrelationID();
        try {
          result = await gqlClient.query(
            query,
            {},
            helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
              adminOptions,
              correlationID
            )
          );
        } catch (error) {
          // ASSERT AUDIT LOG EVENTS
          const expectedAuditLogItems = [
            {
              actionName: 'delete',
              actionResult: 'failure',
              actionDetails: 'Failed to delete package undefined',
              targetType: 'tt_Package',
              userName: helpers.config.userName,
              userAgent: 'core-graphql-server test',
              originatorApplication: 'GraphQL-CI-Test',
              originatorService: 'core-graphql-server',
              eventType: 'package',
              eventName: 'PackageDelete'
            }
          ];
          const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
            correlationID,
            expectedAuditLogItems
          );
          validateExpectedEvents({
            auditLogItems,
            expectedAuditLogItems,
            correlationID,
            undefined
          });
        }
      });

      it('should throw error for a missing packageId and emit event to Audit Log for eventName PackageDelete', async () => {
        let query;
        query = `
        mutation deletePackage {
          packageDelete (id: "") {
            success
          }
        }
      `;
        const correlationID = helpersAuditLog.buildCorrelationID();
        try {
          await gqlClient.query(
            query,
            {},
            helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
              adminOptions,
              correlationID
            )
          );
        } catch (error) {
          const expectedAuditLogItems = [
            {
              actionName: 'delete',
              actionResult: 'failure',
              targetType: 'tt_Package',
              userName: helpers.config.userName,
              userAgent: 'core-graphql-server test',
              originatorApplication: 'GraphQL-CI-Test',
              originatorService: 'core-graphql-server',
              eventType: 'package',
              eventName: 'PackageDelete'
            }
          ];
          const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
            correlationID,
            expectedAuditLogItems
          );
          expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /Failed to delete package/
          );

          validateExpectedEvents({
            auditLogItems,
            expectedAuditLogItems,
            correlationID,
            undefined
          });
        }
      });

      it('should create approved package and index event to Audit Log for both PackageCreate and PackageApprove eventNames', async () => {
        let correlationID = helpersAuditLog.buildCorrelationID();
        let result = await createPackage(
          appId,
          appId,
          tdoId_1,
          correlationID,
          'approved'
        );
        let correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        const packageCreated = _.get(result, 'packageCreate');
        expect(correlationIDResponse).toEqual(correlationID);
        approvedPackageId = _.get(packageCreated, 'id');
        expect(approvedPackageId).toBeDefined();

        const expectedAuditLogItems = [
          {
            actionName: 'create',
            actionResult: 'success',
            actionDetails: `Created package ${packageCreated.name}`,
            targetType: 'tt_Package',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageCreate'
          },
          {
            actionName: 'update',
            actionResult: 'success',
            actionDetails: `Approved package ${packageCreated.name}`,
            targetType: 'tt_Package',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageApprove'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });

      it('should throw error for an invalid packageId and emit event to Audit Log for eventName PackageCreate', async () => {
        let correlationID = helpersAuditLog.buildCorrelationID();
        let result;
        try {
          result = await createPackage(
            appId,
            appId,
            tdoId_1,
            correlationID,
            'pending',
            approvedPackageId
          );
        } catch (error) {
          const expectedAuditLogItems = [
            {
              actionName: 'create',
              actionResult: 'failure',
              targetType: 'tt_Package',
              userName: helpers.config.userName,
              userAgent: 'core-graphql-server test',
              originatorApplication: 'GraphQL-CI-Test',
              originatorService: 'core-graphql-server',
              eventType: 'package',
              eventName: 'PackageCreate'
            }
          ];
          const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
            correlationID,
            expectedAuditLogItems
          );
          expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /Failed to create package/
          );

          validateExpectedEvents({
            auditLogItems,
            expectedAuditLogItems,
            correlationID,
            undefined
          });
        }

        // delete published package.
        const query = `
        mutation deletePackage {
          packageDelete(
            id: "${packageId}"
          ) {
            success
          }
        }
      `;
        correlationID = helpersAuditLog.buildCorrelationID();
        result = await gqlClient.query(
          query,
          {},
          helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
            adminOptions,
            correlationID
          )
        );
      });

      it('should delete approved package and index event to Audit Log for eventName PackageDelete', async () => {
        let query, result, ci_package;

        // get package name
        ci_package = await gqlClient.query(
                getPackageByIdQuery,
                { id: approvedPackageId },
                adminOptions
              );
        const packageName = _.get(ci_package, 'packages.records[0].name');
        expect(packageName).toBeDefined();

        query = `
        mutation deletePackage {
          packageDelete(
            id: "${approvedPackageId}"
          ) {
            success
          }
        }
      `;
        const correlationID = helpersAuditLog.buildCorrelationID();
        result = await gqlClient.query(
          query,
          {},
          helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
            adminOptions,
            correlationID
          )
        );
        let correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        expect(correlationIDResponse).toEqual(correlationID);

        // ASSERT AUDIT LOG EVENTS
        const expectedAuditLogItems = [
          {
            actionName: 'delete',
            actionResult: 'success',
            actionDetails: `Deleted package ${packageName}`,
            targetType: 'tt_Package',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageDelete'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });
    });
  });

  describe('#package grant', () => {
    describe('Tests for Org with useEngineGrant is disabled', () => {
      let engineId, secondEngineId;
      let engineBuildId, secondEngineBuildId;
      let packageId, packageName;

      beforeAll(() => {
        adminOptions = noEngineGrantSuperAdminOptions;
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

      it('should create package with engine resources and index event to Audit Log for eventName PackageInstall', async () => {
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
              name
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
        const correlationID = helpersAuditLog.buildCorrelationID();
        const results = await gqlClient.query(
          query,
          variables,
          helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
            adminOptions,
            correlationID
          )
        );
        let correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          results
        );
        expect(_.get(results, 'packageCreate.id')).toBeDefined();
        packageName = _.get(results, 'packageCreate.name');
        expect(packageName).toBeDefined();
        expect(packageName).toEqual(variables.name);
        packageId = results.packageCreate.id;

        // ASSERT AUDIT LOG EVENTS
        const expectedAuditLogItems = [
          {
            actionName: 'create',
            actionResult: 'success',
            actionDetails: `Installed package ${packageName}`,
            targetType: 'tt_Package',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: noEngineGrantOrg.id,
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageInstall'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });

      it('should fail to update package with engine resources and index event to Audit Log for eventName PackageInstall', async () => {
        // to update package
        const correlationId = helpersAuditLog.buildCorrelationID();
        let correlationIDResponse;
        try {
          await updatePackage(packageId, correlationId, 'published'); // updating published package will cause failure (no changes made)
        } catch (err) {
          correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
            err
          );
        }
        // validate resource Alias
        const expectedAuditLogItems = [
          {
            actionName: 'create',
            actionResult: 'failure',
            actionDetails: `Failed to install package ${packageName}`,
            targetType: 'tt_Package'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationId,
          expectedAuditLogItems
        );
        expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /Failed to install package/
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID: correlationId,
          correlationIDResponse
        });
      });

      it('should grant created package for the organization and remove the grant and index event to Audit Log for eventName PackageGrantSet and eventName PackageGrantRemove', async () => {
        let mutation = `
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
        const correlationID = helpersAuditLog.buildCorrelationID();
        let result = await gqlClient.query(
          mutation,
          {},
          helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
            adminOptions,
            correlationID
          )
        );
        let correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        expect(correlationIDResponse).toEqual(correlationID);
        expect(_.get(result, 'packageUpdateGrants')).toBeDefined();
        expect(result.packageUpdateGrants.id).toEqual(packageId);
        
        // verify that the grant was added
        await validatePackageGrant(
          'GRANT',
          packageId,
          gqlClient,
          {},
          adminOptions
        );

        mutation = `
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
        result = await gqlClient.query(
          mutation,
          {},
          helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
            adminOptions,
            correlationID
          )
        );

        // ASSERT AUDIT LOG EVENTS
        const expectedAuditLogItems = [
          {
            actionName: 'update',
            actionResult: 'success',
            actionDetails: `Granted package ${packageName} to org ${noEngineGrantOrg.name} (${noEngineGrantOrg.id})`,
            targetType: 'tt_Package',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: noEngineGrantOrg.id,
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageGrantSet'
          },
          {
            actionName: 'update',
            actionResult: 'success',
            actionDetails: `Removed granted package ${packageName} from org ${noEngineGrantOrg.name} (${noEngineGrantOrg.id})`,
            targetType: 'tt_Package',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: noEngineGrantOrg.id,
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageGrantRemove'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });

      it('should fail to grant created package for the organization and fail to remove the grant and index event to Audit Log for eventName PackageGrantSet and eventName PackageGrantRemove', async () => {
        const correlationID = helpersAuditLog.buildCorrelationID();
        let packageName;

        const packageResult = await gqlClient.query(
          `query getPackage {
            packages(ids: ["${packageId}"]) {
              records {
                id
                name
                }
              }
            }`,
          {},
          adminOptions
        );
        packageName = _.get(packageResult, 'packages.records[0].name');
        expect(packageName).toBeDefined();

        // Test Case 1: Fail to ADD grant by using invalid organization ID
        let mutation = `
          mutation packageUpdateGrants{
            packageUpdateGrants(input: {
              packageId: "${packageId}"
              packageGrants: [
                {
                  organizationId: "99999999" 
                  grantType: GRANT
                  action: ADD
                }
              ]
              }){
                id
                name
            }
          }
          `;

        let error1;
        try {
          await gqlClient.query(
            mutation,
            {},
            helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
              adminOptions,
              correlationID
            )
          );
        } catch (err) {
          error1 = err;
        }

        expect(error1).toBeDefined();

        // Test Case 2: Fail to REMOVE grant by using invalid package ID
        mutation = `
          mutation packageUpdateGrants{
            packageUpdateGrants(input: {
              packageId: "00000000-0000-0000-0000-000000000000"
              packageGrants: [
                {
                  organizationId: ${noEngineGrantOrg.id}
                  grantType: GRANT
                  action: REMOVE
                }
              ]
              }){
                id
                name
            }
          }
        `;

        let error2;
        try {
          await gqlClient.query(
            mutation,
            {},
            helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
              adminOptions,
              correlationID
            )
          );
        } catch (err) {
          error2 = err;
        }

        expect(error2).toBeDefined();
        // ASSERT AUDIT LOG EVENTS
        const expectedAuditLogItems = [
          {
            actionName: 'update',
            actionResult: 'failure',
            targetType: 'tt_Package',
            actionDetails: `Failed to grant package ${packageName} to org undefined (99999999)`,
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: noEngineGrantOrg.id,
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageGrantSet'
          },
          {
            actionName: 'update',
            actionResult: 'failure',
            targetType: 'tt_Package',
            actionDetails: `Failed to remove granted package 00000000-0000-0000-0000-000000000000 from org ${noEngineGrantOrg.name} (${noEngineGrantOrg.id})`,
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: noEngineGrantOrg.id,
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'package',
            eventName: 'PackageGrantRemove'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse: correlationID
        });
      });

      it('clean up test data', async () => {
        await deleteEngine(engineId, adminOptions);
        await deleteEngine(secondEngineId, adminOptions);
        await deleteEngineBuild(engineId, engineBuildId, adminOptions);
        await deleteEngineBuild(
          secondEngineId,
          secondEngineBuildId,
          adminOptions
        );
        await deletePackage(packageId, adminOptions);
      });
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

async function deleteApplication(applicationId) {
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
    const result = await gqlClient.query(gql, {});
    expect(result.deleteApplication.id).toEqual(applicationId);
  }
}

async function deleteTDO(tdoId) {
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
    const result = await gqlClient.query(gql, {});
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
    const engineDeleted = await gqlClient.query(deleteEngine, {}, adminOptions);
    expect(engineDeleted.deleteEngine.id).toEqual(id);
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
          roleIds: [
            "ddca9b68-d775-4934-8ffd-7aecc779b652"
            "cf2ed945-176b-4dd9-943e-22fcb1cf684f", # CMS Editor
            "912e377e-f4a4-4184-8db1-baa9670d8081" # Developer Editor
          ]
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

async function createPackage(
  primaryResourceId,
  resourceOne,
  resourceTwo,
  correlationID,
  status,
  packageId
) {
  let query = `
          mutation createPackage($id: ID) {
            packageCreate(
              input: {
                id: $id
                status: ${status}
                name: "${AIWARE_CI_TEST_STAMP} package 1"
                version: "1.0"
                primaryResourceId: "${primaryResourceId}"
                resources: [
                  {
                    resourceId: "${resourceOne}"
                    resourceType: application
                    action: ADD
                  },
                  {
                    resourceId: "${resourceTwo}"
                    resourceType: tdo
                    resourceAlias: "tdo 1"
                    action: ADD
                  }
                ]
              }
            ) {
              id
              name
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
  return await gqlClient.query(
    query,
    { id: packageId },
    helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
      adminOptions,
      correlationID
    )
  );
}

async function updatePackage(packageId, correlationId, status) {
  const queryToUpdatePkg = `
          mutation updatePackage {
            packageUpdate(
              input: {
                id: "${packageId}"
                status: ${status}
              }
            ) {
              id
              name
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
  return await gqlClient.query(
    queryToUpdatePkg,
    {},
    helpersAuditLog.modifyOptionsUpdateVeritoneCorrelationID(
      adminOptions,
      correlationId
    )
  );
}