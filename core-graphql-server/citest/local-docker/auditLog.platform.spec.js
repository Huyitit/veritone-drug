const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const { safe } = require('../helpers/cleanup/utils');
const _ = require('lodash');

const OPTIONS = {
  configurableEvents: [
    'AuditLogConfigChange',
    'NewVersionCreate',
    'NewVersionInstall',
    'AuditLogAccess',
    'JobCreate'
  ]
};

let clusterId;
const existingVersion = '1.2.0';
const nonExistingVersion = '1.2.1';

const testName = 'citest_cluster_' + Date.now();

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
   'audit-log-platform', () => {
  let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
    const result = await helpersAuditLog.loginWithConfiguredUser();
    CONFIG_ADMIN_TOKEN = result.userLogin.token;
    CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
    expect(CONFIG_ADMIN_TOKEN).toBeDefined();
    expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
  });

  afterAll(async () => {
    if (!helpersAuditLog || !CONFIG_ADMIN_TOKEN) return;
    await safe('restore JobCreate to configured_events', async () => {
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        helpersAuditLog.buildCorrelationID()
      );
      await helpersAuditLog._gqlClient.query(
        `mutation {
          updateInstanceAuditLogConfig(input: {
            addAuditEvents: [JobCreate]
          }) {
            configurableEvents
          }
        }`,
        null,
        headers
      );
    });
  });

  // this test should be first to avoid interference from other tests
  //
  // SOURCE OF TRUTH for both arrays below is the Flyway migrations under
  // flyway/db/platform/sql/, which seed aiware.audit_config:
  //   baseline_events   -> immutableEvents   (always-on, cannot be toggled off)
  //   configured_events -> configurableEvents (toggleable, enabled by default)
  // See dal/dalPlatform.js (instanceAuditLogConfig) for the mapping.
  //
  // When a migration adds an audit event, update the matching array here. These lists are
  // deliberately explicit rather than derived, so that adding an event forces a conscious
  // always-on vs toggleable classification.
  it('should return correct always-on and toggleable events', async () => {
    const configurable = [
    'Impersonated',
    'PasswordChange',
    'Logout',
    'PasswordToken',
    'RecordingDelete',
    'RecordingCreate',
    'RecordingUpdate',
    'AssetUpload',
    'AssetMetadataUpdate',
    'AssetUpdate',
    'AssetDelete',
    'StructuredDataCreate',
    'StructuredDataUpdate',
    'StructuredDataDelete',
    'RegisterMFA',
    'VerifyUserMFARegistration',
    'UnregisterMFA',
    'AuditLogExportCreate',
    'AuditLogExportCancel',
    'AuditLogExportQuery',
    'AuditLogAccess',
    'FolderCreate',
    'FolderUpdate',
    'FolderDelete',
    'MediaSourceCreate',
    'MediaSourceUpdate',
    'MediaSourceDelete',
    'StructuredDataRegistryCreate',
    'StructuredDataRegistryUpdate',
    'StructuredDataRegistryDelete',
    'JobCreate',
    'Unknown',
    'WatchListCreate',
    'WatchListUpdate',
    'AccessMedia',
    'LibraryTrain',
    'SendEmail',
    'AuthorizationDenied'
    ];
    
    const immutable = [
    'LoginSucceeded',
    'LoginFailed',
    'LoginAttemptsExceeded',
    'UserCreate',
    'UserUpdate',
    'UserDelete',
    'UserPermissionsUpdate',
    'LoginVerifyMFAToken',
    'AuditLogConfigChange',
    'OrganizationInvitationCreate',
    'OrganizationRequestCreate',
    'OrganizationRequestReject',
    'OrganizationRequestAccept',
    'OrganizationInvitationReject',
    'OrganizationInvitationAccept',
    'PackageCreate',
    'PackageDelete',
    'PackageApprove',
    'PackageReject',
    'PackageInstall',
    'PackageGrantSet',
    'PackageGrantRemove',
    'ApplicationCreate',
    'ApplicationUpdate',
    'ApplicationDelete',
    'IntegrationSettings',
    'EngineBuildSubmit',
    'EngineBuildApprove',
    'EngineBuildDisapprove',
    'EngineBuildCreate',
    'EngineBuildUpload',
    'EngineBuildInvalidate',
    'EngineBuildPause',
    'EngineBuildUnpause',
    'EngineBuildDelete',
    'EngineBuildUpdate',
    'EngineBuildDeploy',
    'EngineCreate',
    'EngineUpdate',
    'EngineDisable',
    'EngineEnable',
    'OrganizationCreate',
    'OrganizationUpdate',
    'OrganizationDelete',
    'NewVersionCreate',
    'NewVersionInstall',
    'ClusterCreate',
    'ClusterDelete',
    'ClusterUpdate',
    'OrganizationInvitationRevoke',
    'RetentionRun',
    'SessionEnded',
    'OLPEnable',
    'OLPDisable',
    'AuthGroupCreate',
    'AuthGroupUpdate',
    'AuthGroupDelete',
    'AuthGroupMemberAdd',
    'AuthGroupMemberRemove',
    'AuthPermissionSetCreate',
    'AuthPermissionSetUpdate',
    'AuthPermissionSetDelete',
    'DefaultACEPolicyUpdate',
    'ACEGrant',
    'ACERevoke'
  ];

    const correlationID = helpersAuditLog.buildCorrelationID();    
    const response = await helpersAuditLog.instanceAuditLogConfig(CONFIG_ADMIN_TOKEN, correlationID);
    const { immutableEvents, configurableEvents } = response.instanceAuditLogConfig;
    expect(_.sortBy(immutableEvents)).toEqual(_.sortBy(immutable));
    expect(_.sortBy(configurableEvents)).toEqual(_.sortBy(configurable));
  });

  it('should index audit log when user search for audit log records with full filters', async () => {
    const query = `query instanceAuditLog {
        instanceAuditLog(input: {
            id: ["5c4aec25-7197-4c68-a6a5-268cbf1de77a"]
            eventNames: [AuditLogExportQuery, LoginSucceeded, LoginFailed]
            organizationId: "999"
            userId: "3e8c5d95-b608-40ae-afbc-520675b57cc9"
            userName: "sys_graphql_citest_superadmin@veritone.com"
            toDateTime: "2025-01-30T04:05:21.021Z"
            fromDateTime: "2024-03-08T00:00:00.021Z"
        }) {
            records{
                id
            }
        }
    }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const resultFirstQuery = await helpersAuditLog._gqlClient.query(
      query,
      null,
      headers
    );
    expect(resultFirstQuery.instanceAuditLog).toBeDefined();

    const queryTwo = `query instanceAuditLog {
        instanceAuditLog(input: {
            eventNames: [AuditLogAccess]
        }) {
            records{
                id
                eventId
                organizationId
                organizationGuid
                organizationName
                userId
                userName
                clientIpAddress
                clientUserAgent
                description
                createdDateTime
                eventType
                eventName
                targetType
                objectId
                actionResult
                actionName
                originatorApplication
                originatorService
                impersonatorUserId
                impersonatorUserName
                correlationId
            }
        }
    }`;
    const resultSecondQuery = await helpersAuditLog._gqlClient.query(
      queryTwo,
      null,
      headers
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      resultSecondQuery
    );
    const expectedAuditLogItems = [
      {
        actionName: 'read',
        actionResult: 'success',
        targetId: '10ffa55a-d68b-494b-83df-49ce2d008e6d',
        userName: 'sys_graphql_citest_superadmin@veritone.com',
        userAgent: 'core-graphql-server test',
        organizationId: '7682',
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'platform',
        eventName: 'AuditLogAccess',
        organizationName: 'Veritone, Inc.'
      },
      {
        actionName: 'read',
        actionResult: 'success',
        targetId: '10ffa55a-d68b-494b-83df-49ce2d008e6d',
        userName: 'sys_graphql_citest_superadmin@veritone.com',
        userAgent: 'core-graphql-server test',
        organizationId: '7682',
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'platform',
        eventName: 'AuditLogAccess',
        organizationName: 'Veritone, Inc.',
        actionDetails:
          'Accessed the audit log'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /Accessed the audit log*/
    );
    // FIXME:
    // expectedAuditLogItems[1].actionDetails = expect.stringMatching(
    //   /Query instanceAuditLog executed by user sys_graphql_citest_superadmin@veritone\.com to get audit logs with organizationId 999, id 5c4aec25-7197-4c68-a6a5-268cbf1de77a, eventNames \[QueryAuditLogExport, LoginSucceeded, LoginFailed\], userId 3e8c5d95-b608-40ae-afbc-520675b57cc9, userName sys_graphql_citest_superadmin@veritone\.com, from .* to .*\./
    // );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log when user search for audit log records without filters', async () => {
    const query = `query instanceAuditLog {
        instanceAuditLog(input: {
        }) {
            records{
                id
            }
        }
    }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const resultFirstQuery = await helpersAuditLog._gqlClient.query(
      query,
      null,
      headers
    );
    expect(resultFirstQuery.instanceAuditLog).toBeDefined();

    const queryTwo = `query instanceAuditLog {
        instanceAuditLog(input: {
            eventNames: [AuditLogAccess]
        }) {
            records{
                id
                eventId
                organizationId
                organizationGuid
                organizationName
                userId
                userName
                clientIpAddress
                clientUserAgent
                description
                createdDateTime
                eventType
                eventName
                targetType
                objectId
                actionResult
                actionName
                originatorApplication
                originatorService
                impersonatorUserId
                impersonatorUserName
                correlationId
            }
        }
    }`;
    const resultSecondQuery = await helpersAuditLog._gqlClient.query(
      queryTwo,
      null,
      headers
    );

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      resultSecondQuery
    );
    const expectedAuditLogItems = [
      {
        actionName: 'read',
        actionResult: 'success',
        targetId: '10ffa55a-d68b-494b-83df-49ce2d008e6d',
        userName: 'sys_graphql_citest_superadmin@veritone.com',
        userAgent: 'core-graphql-server test',
        organizationId: '7682',
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'platform',
        eventName: 'AuditLogAccess',
        organizationName: 'Veritone, Inc.'
      },
      {
        actionName: 'read',
        actionResult: 'success',
        targetId: '10ffa55a-d68b-494b-83df-49ce2d008e6d',
        userName: 'sys_graphql_citest_superadmin@veritone.com',
        userAgent: 'core-graphql-server test',
        organizationId: '7682',
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'platform',
        eventName: 'AuditLogAccess',
        organizationName: 'Veritone, Inc.'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /Accessed the audit log*/
    );
    expectedAuditLogItems[1].actionDetails = expect.stringMatching(
      /Accessed the audit log*/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log error when user search for audit logs with a time windown bigger than 1 year', async () => {
    const query = `query instanceAuditLog {
        instanceAuditLog(input: {
            toDateTime: "2025-01-30T04:05:21.021Z"
            fromDateTime: "2022-03-08T00:00:00.021Z"
        }) {
            records{
                id
            }
        }
    }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    let resultFirstQuery;
    try {
      resultFirstQuery = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
    } catch (error) {
      expect(resultFirstQuery).toBeUndefined();
    }

    const queryTwo = `query instanceAuditLog {
        instanceAuditLog(input: {
            eventNames: [AuditLogAccess]
        }) {
            records{
                id
                eventId
                organizationId
                organizationGuid
                organizationName
                userId
                userName
                clientIpAddress
                clientUserAgent
                description
                createdDateTime
                eventType
                eventName
                targetType
                objectId
                actionResult
                actionName
                originatorApplication
                originatorService
                impersonatorUserId
                impersonatorUserName
                correlationId
            }
        }
    }`;
    const resultSecondQuery = await helpersAuditLog._gqlClient.query(
      queryTwo,
      null,
      headers
    );

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      resultSecondQuery
    );
    const expectedAuditLogItems = [
      {
        actionName: 'read',
        actionResult: 'failure',
        targetId: '10ffa55a-d68b-494b-83df-49ce2d008e6d',
        userName: 'sys_graphql_citest_superadmin@veritone.com',
        userAgent: 'core-graphql-server test',
        organizationId: '7682',
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'platform',
        eventName: 'AuditLogAccess',
        organizationName: 'Veritone, Inc.',
        actionDetails:
          'Failed to access the audit log'
      },
      {
        actionName: 'read',
        actionResult: 'success',
        targetId: '10ffa55a-d68b-494b-83df-49ce2d008e6d',
        userName: 'sys_graphql_citest_superadmin@veritone.com',
        userAgent: 'core-graphql-server test',
        organizationId: '7682',
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'platform',
        eventName: 'AuditLogAccess',
        organizationName: 'Veritone, Inc.'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[1].actionDetails = expect.stringMatching(
      /Accessed the audit log*/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log when successfully updating instance audit config', async () => {
    const query = `mutation updateConfig {
        updateInstanceAuditLogConfig(input: {
          removeAuditEvents: [JobCreate]          
        }) {
          configurableEvents
        }
    }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    expect(result).toBeDefined();
    expect(
      result.updateInstanceAuditLogConfig.configurableEvents
    ).toBeDefined();
    expect(
      result.updateInstanceAuditLogConfig.configurableEvents
    ).not.toContain('JobCreate');

    const expectedAuditLogItems = [
      { eventType: 'platform', eventName: 'AuditLogConfigChange' }
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

  it('should index audit log when attempting to update instance audit config that results in a failure', async () => {
    // adding and removing the same event throws an exception
    const query = `mutation updateConfig {
        updateInstanceAuditLogConfig(input: {
          removeAuditEvents: [JobCreate]
          addAuditEvents: [JobCreate]          
        }) {
          configurableEvents
        }
    }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    await helpersAuditLog._gqlClient
      .query(query, null, headers)
      .catch(async (e) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          e
        );
        expect(e).toBeDefined();
        const expectedAuditLogItems = [
          { eventType: 'platform', eventName: 'AuditLogConfigChange' }
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

  it('should index audit log when a new version is added to instance', async () => {
    const query = `mutation {
    addPlatformVersion(input: {
      version: "${existingVersion}"
    }) {
      id
    }
  }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );

    const result = await helpersAuditLog._gqlClient.query(query, null, headers);

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        eventType: 'platformEvent',
        eventName: 'NewVersionCreate',
        actionResult: 'success'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Created platform version 1\.2\.0$/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log when failing to add a new platform version', async () => {
    const query = `mutation {
    addPlatformVersion(input: {
      version: ""
    }) {
      id
    }
  }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    await helpersAuditLog._gqlClient
      .query(query, null, headers)
      .catch(async (e) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          e
        );
        expect(e).toBeDefined();
        const expectedAuditLogItems = [
          {
            eventType: 'platformEvent',
            eventName: 'NewVersionCreate',
            actionResult: 'failure'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /^Failed to create new platform version$/
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });
  });

  // TODO: test event emission on addPlatformVersion mutation failure after VE-8359 is done
  it('should index audit log when a new version is installed', async () => {
    const check = `query platformInfo {
      platformInfo {
        aiWAREVersionList {
          records {        
            version
          }
        }
      }
    }`
    const checkHeaders = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN
    );
    const result = await helpersAuditLog._gqlClient.query(check, null, checkHeaders);
    const versions = _.map(result.platformInfo.aiWAREVersionList.records, 'version');
    if (!_.includes(versions, existingVersion)) {
      const addVersion = `mutation {
        addPlatformVersion(input: {
          version: "${existingVersion}"
        }) {
          id      
        }
      }`;
      await helpersAuditLog._gqlClient.query(addVersion, null, checkHeaders);
    }
    const query = `mutation {
      setCurrentPlatformVersion(version: "${existingVersion}") {
        id      
      }
    }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const response = await helpersAuditLog._gqlClient
      .query(query, null, headers);      
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          response
        );
      const expectedAuditLogItems = [
          {
            eventType: 'platformEvent',
            eventName: 'NewVersionInstall',
            actionResult: 'success'
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

  it('should index audit log when a new version fails to install', async () => {
    const query = `mutation {
    setCurrentPlatformVersion(version: "${nonExistingVersion}") {
      id
    }
  }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    await helpersAuditLog._gqlClient
      .query(query, null, headers)
      .catch(async (e) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          e
        );
        expect(e).toBeDefined();
        const expectedAuditLogItems = [
          {
            eventType: 'platformEvent',
            eventName: 'NewVersionInstall',
            actionResult: 'failure'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /^Failed to install platform version 1\.2\.1$/
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
