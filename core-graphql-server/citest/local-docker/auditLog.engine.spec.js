const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  configurableEvents: [
    'EngineBuildDeploy',
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
    'EngineCreate',
    'EngineUpdate',
    'EngineDisable',
    'EngineEnable'
  ]
};

let categoryId,
  engineId,
  engineBuildId,
  engineBuildNodeRedId,
  engineIdGQLTest,
  draftengineBuildNodeRedId;
let engineId1, engineBuildId1;

const testName = 'citest_engine_' + Date.now();
const testNameDescriptor = 'citest Transcription-Veritone Inc-Chunk-Test-V3';

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
   'audit-log-engine', () => {
  let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
    const result = await helpersAuditLog.loginWithConfiguredUser();
    CONFIG_ADMIN_TOKEN = result.userLogin.token;
    CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
    expect(CONFIG_ADMIN_TOKEN).toBeDefined();
    expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
  }, 3 * 60 * 1000);

  afterAll(async () => {
    const query = `mutation {
        engineWorkflow: engineWorkflow(input: {
          id: "${engineId}"
          action: disable
        }) {
          id
          state
        }
      }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    const engineWorkflow = _.get(result, 'engineWorkflow');
    expect(engineWorkflow).toBeDefined();
    expect(engineWorkflow.id).toEqual(engineId);
    expect(engineWorkflow.state).toEqual('disabled');
  });

  it('get transcription category id', async () => {
    const query = `{
        engineCategories(type: "Cognition", name: "Transcription", limit: 1) {
          count
          records {
            id
            name
          }
        }
      }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    const engineCategories = _.get(result, 'engineCategories');
    expect(engineCategories).toBeDefined();
    expect(engineCategories.count).toEqual(1);
    expect(engineCategories.records).toHaveLength(1);
    expect(_.get(engineCategories, 'records[0].id')).toBeDefined();

    categoryId = _.get(engineCategories, 'records[0].id');
  });

  it('get engine and draft build for citest', async () => {
    const query = `query {
        engines(createsTDO:false, state: [active], limit:1, name: "CITest Engine 20221219") {
          records {
            id
            name
            createsTDO
            libraryRequired
            categoryId
            state
            category {
              name
            }
            builds(id: "adf4e54a-36f1-4421-bb44-73ac8d375e91", buildStatus: [available, paused, approved, invalid]) {
              records {
                id
                status
              }
            }
          }
        }
      }`;

    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);

    const engineGQLTest = _.get(result, 'engines.records[0]');

    expect(engineGQLTest).toBeDefined();
    expect(engineGQLTest.id).toBeDefined();
    engineIdGQLTest = engineGQLTest.id;

    const draftEngineBuild = _.get(
      result,
      'engines.records[0].builds.records[0]'
    );

    expect(draftEngineBuild).toBeDefined();
    expect(draftEngineBuild.id).toBeDefined();
    draftengineBuildNodeRedId = draftEngineBuild.id;
  });

  it('upload engine build - citest engine', async () => {
    const query = `mutation {
        updateEngineBuild(input: {
            id: "${draftengineBuildNodeRedId}"
            engineId: "${engineIdGQLTest}"
            action: upload
            dockerImage: "docker.aws-prod.veritone.com/validated/${engineIdGQLTest}:${draftengineBuildNodeRedId}"
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
    const updateEngineBuild = _.get(result, 'updateEngineBuild');

    expect(updateEngineBuild).toBeDefined();
    expect(updateEngineBuild.id).toEqual(draftengineBuildNodeRedId);

    // ASSERT AUDIT LOG EVENTS
    const expectedAuditLogItems = [
      {
        actionName: 'create',
        actionResult: 'success',
        actionDetails: `Uploaded new build ${draftengineBuildNodeRedId} for engine ${engineIdGQLTest}`,
        targetType: 'tt_Build',
        userName: helpers.config.userName,
        userAgent: 'core-graphql-server test',
        organizationId: _.toString(helpersAuditLog._organizationID),
        eventType: 'engine',
        eventName: 'EngineBuildUpload',
        organizationName: 'Veritone, Inc.'
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

  it('create engine - transcription', async () => {
    const query = `mutation {
        createEngine(input: {
          deploymentModel: FullyNetworkIsolated
          fields: [{
            max: 2
            min: 1
            type: Number
            name: "Test name"
            label: "test label"
          }],
          categoryId: "${categoryId}"
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
          jwtRights: {
            roles: [
              {
                roleName: "adapter"
                taskRights: [
                  "developer.engine.read",
                  "job:create",
                  "job.read",
                  "cms.access",
                  "cms.sources.read",
                  "cms.sources.update",
                  "task:read"
                ]
                assetRights: [
                  "recording:create",
                  "recording:update"
                ]
              }
            ]
          }
          distributionType: private
        }) {
          id
          state
          deploymentModel
          name
          fields {
            max
            min
            type
            name
            label
          }
          categoryId
          createsTDO
          price
          priceDimension
          logoPath
          iconPath
          libraryRequired
          useCases
          industries
          manifest
          testingDetails {
            email
            mediaFileUri
            customFields
          }
          isPublic
          edgeVersion
          cpuResourceMcpu
          gpuSupported
          website
          jwtRights
          distributionType
        }
      }`;

    const meQuery = `query {
        me {
          organization {
            name
          }
        }
      }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const me = await helpersAuditLog._gqlClient.query(meQuery, null, headers);
    const orgName = _.get(me, 'me.organization.name');
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);

    const createEngine = _.get(result, 'createEngine');
    expect(createEngine).toBeDefined();
    expect(createEngine.id).toBeDefined();
    expect(createEngine.name).toEqual(
      `Transcription-${_.replace(orgName, /[.,]/g, '')}-Chunk-V1`
    );
    expect(createEngine.state).toEqual('pending');
    expect(createEngine.categoryId).toEqual(categoryId);
    expect(createEngine.deploymentModel).toEqual('FullyNetworkIsolated');
    expect(createEngine.fields).toHaveLength(1);
    expect(
      _.isEqual(createEngine.fields[0], {
        max: 2,
        min: 1,
        type: 'Number',
        name: 'Test name',
        label: 'test label'
      })
    ).toEqual(true);
    expect(createEngine.createsTDO).toEqual(false);
    expect(createEngine.price).toEqual(100);
    expect(createEngine.priceDimension).toEqual('PRICE_PER_TASK');
    expect(createEngine.logoPath).toEqual('http://localhost/logo');
    expect(createEngine.iconPath).toEqual('http://localhost/icon');
    expect(createEngine.libraryRequired).toEqual(true);
    expect(createEngine.useCases).toHaveLength(2);
    expect(createEngine.industries).toHaveLength(2);
    expect(createEngine.edgeVersion).toEqual(1);
    expect(createEngine.cpuResourceMcpu).toEqual(2048);
    expect(createEngine.gpuSupported).toEqual('aws_p2');
    expect(createEngine.website).toEqual('https://veritone.com');
    expect(_.isEqual(createEngine.manifest, { engineMode: 'chunk' })).toEqual(
      true
    );
    expect(
      _.isEqual(createEngine.testingDetails, {
        email: 'dev@veritone.com',
        mediaFileUri: 'http://localhost/testingDetails/mediaFileUri',
        customFields: { foo: 'bar' }
      })
    ).toEqual(true);
    expect(createEngine.isPublic).toEqual(false);
    expect(createEngine.distributionType).toEqual('private');
    expect(createEngine.jwtRights).toBeDefined();
    expect(_.get(createEngine, 'jwtRights.roles')).toHaveLength(1);
    expect(_.get(createEngine, 'jwtRights.roles[0]', createEngine)).toEqual({
      roleName: 'adapter',
      taskRights: [
        'developer.engine.read',
        'job:create',
        'job.read',
        'cms.access',
        'cms.sources.read',
        'cms.sources.update',
        'task:read'
      ],
      assetRights: ['recording:create', 'recording:update']
    });

    engineId = createEngine.id;
  });

  it('update the test engine', async () => {
    const query = `mutation updateEngine {
        updateEngine(input: {
          id: "${engineId}"
          name: "${testNameDescriptor}"
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
          isPublic: false
          categoryId: "${categoryId}"
          price: 100
          priceDimension: PRICE_PER_TASK
          edgeVersion: 3
          fields: {
            max: 1000
            min: 100
            step: 1
            type: Number
            info: "test"
            name: "test field"
            label: "test field"
            options: [{ key: "foo", value: "bar" }]
            defaultValue: "test default"
            defaultValues: ["test1", "test"]
          }
          iconPath: "http://localhost/icon_test"
          logoPath: "http://localhost/logo_test"
          libraryRequired: false
          useCases: ["test", "help"]
          industries: ["foo", "bar"]
          manifest: { engineMode: "chunk", foo: "bar" }
          cpuResourceMcpu: 256
          gpuSupported: aws_p3
          website: "https://veritoneone.com/"
          distributionType: org_locked
        }) {
          id
          name
          jwtRights
          isPublic
          categoryId
          price
          priceDimension
          edgeVersion
          fields {
            max
            min
            type
            info
            name
            label
            options {
              key
              value
            }
            defaultValue
            defaultValues
          }
          iconPath
          logoPath
          libraryRequired
          useCases
          industries
          manifest
          cpuResourceMcpu
          gpuSupported
          website
          state
          distributionType
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
    const updateEngine = _.get(result, 'updateEngine');
    expect(updateEngine).toBeDefined();
    expect(updateEngine.id).toEqual(engineId);
    expect(updateEngine.name).toEqual(testNameDescriptor);
    expect(updateEngine.jwtRights).toBeDefined();
    expect(_.get(updateEngine, 'jwtRights.roles')).toHaveLength(1);
    expect(_.get(updateEngine, 'jwtRights.roles[0]')).toEqual({
      roleName: 'adapter',
      taskRights: [
        'job:create',
        'job.read',
        'cms.access',
        'cms.sources.read',
        'cms.sources.update',
        'task:read'
      ],
      assetRights: ['recording:update']
    });
    expect(updateEngine.isPublic).toEqual(false);
    expect(updateEngine.categoryId).toEqual(categoryId);
    expect(updateEngine.price).toEqual(100);
    expect(updateEngine.priceDimension).toEqual('PRICE_PER_TASK');
    expect(updateEngine.edgeVersion).toEqual(3);
    expect(updateEngine.fields).toHaveLength(1);
    expect(
      _.isEqual(updateEngine.fields[0], {
        max: 1000,
        min: 100,
        type: 'Number',
        info: 'test',
        name: 'test field',
        label: 'test field',
        options: [{ key: 'foo', value: 'bar' }],
        defaultValue: 'test default',
        defaultValues: ['test1', 'test']
      })
    ).toEqual(true);
    expect(updateEngine.iconPath).toEqual('http://localhost/icon_test');
    expect(updateEngine.logoPath).toEqual('http://localhost/logo_test');
    expect(updateEngine.libraryRequired).toEqual(false);
    expect(updateEngine.useCases).toHaveLength(2);
    expect(updateEngine.useCases[0]).toEqual('test');
    expect(updateEngine.useCases[1]).toEqual('help');
    expect(updateEngine.industries).toHaveLength(2);
    expect(updateEngine.industries[0]).toEqual('foo');
    expect(updateEngine.industries[1]).toEqual('bar');
    expect(
      _.isEqual(updateEngine.manifest, { engineMode: 'chunk', foo: 'bar' })
    ).toEqual(true);
    expect(updateEngine.cpuResourceMcpu).toEqual(256);
    expect(updateEngine.gpuSupported).toEqual('aws_p3');
    expect(updateEngine.website).toEqual('https://veritoneone.com/');
    expect(updateEngine.state).toEqual('pending');
    expect(updateEngine.distributionType).toEqual('org_locked');

    // ASSERT AUDIT LOG EVENTS
    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated engine ${engineId}`,
        targetType: 'tt_Engine',
        userName: helpers.config.userName,
        userAgent: 'core-graphql-server test',
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'engine',
        eventName: 'EngineUpdate',
        organizationName: 'Veritone, Inc.'
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

  it('update the test engine failed', async () => {
    const query = `mutation updateEngine {
        updateEngine(input: {
          id: "${engineId}"
          name: "${testNameDescriptor}"
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
          isPublic: false
          categoryId: "invalid_category_id"
          price: 100
          priceDimension: PRICE_PER_TASK
          edgeVersion: 3
          fields: {
            max: 1000
            min: 100
            step: 1
            type: Number
            info: "test"
            name: "test field"
            label: "test field"
            options: [{ key: "foo", value: "bar" }]
            defaultValue: "test default"
            defaultValues: ["test1", "test"]
          }
          iconPath: "http://localhost/icon_test"
          logoPath: "http://localhost/logo_test"
          libraryRequired: false
          useCases: ["test", "help"]
          industries: ["foo", "bar"]
          manifest: { engineMode: "chunk", foo: "bar" }
          cpuResourceMcpu: 256
          gpuSupported: aws_p3
          website: "https://veritoneone.com/"
          distributionType: org_locked
        }) {
          id
          name
          jwtRights
          isPublic
          categoryId
          price
          priceDimension
          edgeVersion
          fields {
            max
            min
            type
            info
            name
            label
            options {
              key
              value
            }
            defaultValue
            defaultValues
          }
          iconPath
          logoPath
          libraryRequired
          useCases
          industries
          manifest
          cpuResourceMcpu
          gpuSupported
          website
          state
          distributionType
        }
      }`;
    
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    try {
      await helpersAuditLog._gqlClient.query(query, null, headers);
    } catch (error) {
      expect(error).toBeDefined();
      expect(error.message).toEqual(
        expect.stringMatching(/Invalid engine category id/)
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        error
      );
  
      // ASSERT AUDIT LOG EVENTS
      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to update engine ${engineId}`,
          targetType: 'tt_Engine',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'engine',
          eventName: 'EngineUpdate',
          organizationName: 'Veritone, Inc.'
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
    }
  });

  it('creates engine build', async () => {
    const query = `mutation {
        createEngineBuild(input: {
            engineId: "${engineId}"
        }) {
            id
            status
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
    const createdEngineBuild = _.get(result, 'createEngineBuild');

    expect(createdEngineBuild).toBeDefined();
    expect(createdEngineBuild.id).toBeDefined();
    expect(createdEngineBuild.status).toEqual('fetching');
    engineBuildId = createdEngineBuild.id;

    // ASSERT AUDIT LOG EVENTS
    const expectedAuditLogItems = [
      {
        actionName: 'create',
        actionResult: 'success',
        actionDetails: `Created build ${engineBuildId} for engine ${engineId}`,
        targetType: 'tt_Build',
        userName: helpers.config.userName,
        userAgent: 'core-graphql-server test',
        organizationId: _.toString(helpersAuditLog._organizationID),
        eventType: 'engine',
        eventName: 'EngineBuildCreate',
        organizationName: 'Veritone, Inc.'
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

  it('invalidate engine build', async () => {
    const query = `mutation {
        updateEngineBuild(input: {
            id: "${engineBuildId}"
            engineId: "${engineId}"
            action: invalidate
        }) {
            id
            status
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
    const updateEngineBuild = _.get(result, 'updateEngineBuild');

    expect(updateEngineBuild).toBeDefined();
    expect(updateEngineBuild.id).toEqual(engineBuildId);
    expect(updateEngineBuild.status).toEqual('invalid');

    // ASSERT AUDIT LOG EVENTS
    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Invalidated build ${engineBuildId} for engine ${engineId}`,
        targetType: 'tt_Build',
        userName: helpers.config.userName,
        userAgent: 'core-graphql-server test',
        organizationId: _.toString(helpersAuditLog._organizationID),
        eventType: 'engine',
        eventName: 'EngineBuildInvalidate',
        organizationName: 'Veritone, Inc.'
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

  it('create engine build - nodeRed runtime', async () => {
    const query = `mutation {
        createEngineBuild(input: {
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
        }
      }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    const createEngineBuild = _.get(result, 'createEngineBuild');
    expect(createEngineBuild).toBeDefined();
    expect(createEngineBuild.id).toBeDefined();
    // ignore this case since this field is currently incorrect on Dev
    // expect(createEngineBuild.status).toEqual('available');

    engineBuildNodeRedId = createEngineBuild.id;
  });

  it('submit engine build - nodeRed runtime', async () => {
    const query = `mutation {
        updateEngineBuild(input: {
          id: "${engineBuildNodeRedId}"
          engineId: "${engineId}"
          action: submit
        }) {
          id
          engineId
          status
          validStateActions
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
    const updateEngineBuild = _.get(result, 'updateEngineBuild');
    expect(updateEngineBuild).toBeDefined();
    expect(updateEngineBuild.id).toEqual(engineBuildNodeRedId);
    expect(updateEngineBuild.engineId).toEqual(engineId);
    expect(updateEngineBuild.status).toEqual('approved');
    // expect(updateEngineBuild.validStateActions).toHaveLength(3);

    // ASSERT AUDIT LOG EVENTS
    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Submitted new build ${engineBuildNodeRedId} for engine ${engineId}`,
        targetType: 'tt_Build',
        userName: helpers.config.userName,
        userAgent: 'core-graphql-server test',
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'engine',
        eventName: 'EngineBuildSubmit',
        organizationName: 'Veritone, Inc.'
      },
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Approved new build ${engineBuildNodeRedId} for engine ${engineId}`,
        targetType: 'tt_Build',
        userName: helpers.config.userName,
        userAgent: 'core-graphql-server test',
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'engine',
        eventName: 'EngineBuildApprove',
        organizationName: 'Veritone, Inc.'
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

  it('delete engine build', async () => {
    const query = `mutation {
      deleteEngineBuild: deleteEngineBuild(input: {
          id: "${engineBuildId}"
          engineId: "${engineId}"
        }) {
          id
          message
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

    // ASSERT AUDIT LOG EVENTS
    const expectedAuditLogItems = [
      {
        actionName: 'delete',
        actionResult: 'success',
        actionDetails: `Deleted build ${engineBuildId} for engine ${engineId}`,
        targetType: 'tt_Build',
        userName: helpers.config.userName,
        userAgent: 'core-graphql-server test',
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'engine',
        eventName: 'EngineBuildDelete',
        organizationName: 'Veritone, Inc.'
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

  it('disable engine', async () => {
    const query = `mutation {
      engineWorkflow: engineWorkflow(input: {
        id: "${engineId}"
        action: disable
      }) {
        id
        state
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
    const engineWorkflow = _.get(result, 'engineWorkflow');
    expect(engineWorkflow).toBeDefined();
    expect(engineWorkflow.id).toEqual(engineId);
    expect(engineWorkflow.state).toEqual('disabled');

    // ASSERT AUDIT LOG EVENTS
    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Disabled engine ${engineId}`,
        targetType: 'tt_Engine',
        userName: helpers.config.userName,
        userAgent: 'core-graphql-server test',
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'engine',
        eventName: 'EngineDisable',
        organizationName: 'Veritone, Inc.'
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

  it('disable engine failed', async () => {
    const query = `mutation {
      engineWorkflow: engineWorkflow(input: {
        id: "${engineId}"
        action: disable
      }) {
        id
        state
      }
    }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    try {
      const res = await helpersAuditLog._gqlClient.query(query, null, headers);
    } catch (error) {
      expect(error).toBeDefined();
      expect(error.message).toEqual(
        expect.stringMatching(/not a valid engine action in current engine state/)
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        error
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to disable engine ${engineId}`,
          targetType: 'tt_Engine',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'engine',
          eventName: 'EngineDisable',
          organizationName: 'Veritone, Inc.'
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
    }
  });

  it('enable engine', async () => {
    const query = `mutation {
      engineWorkflow: engineWorkflow(input: {
        id: "${engineId}"
        action: enable
      }) {
        id
        state
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
    const engineWorkflow = _.get(result, 'engineWorkflow');
    expect(engineWorkflow).toBeDefined();
    expect(engineWorkflow.id).toEqual(engineId);
    expect(engineWorkflow.state).toEqual('ready');

    // ASSERT AUDIT LOG EVENTS
    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Enabled engine ${engineId}`,
        targetType: 'tt_Engine',
        userName: helpers.config.userName,
        userAgent: 'core-graphql-server test',
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'engine',
        eventName: 'EngineEnable',
        organizationName: 'Veritone, Inc.'
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

  it('enable engine failed', async () => {
    const query = `mutation {
      engineWorkflow: engineWorkflow(input: {
        id: "${engineId}"
        action: enable
      }) {
        id
        state
      }
    }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    try {
      await helpersAuditLog._gqlClient.query(query, null, headers);
    } catch (error) {
      expect(error).toBeDefined();
      expect(error.message).toEqual(
        expect.stringMatching(/not a valid engine action in current engine state/)
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        error
      );

      // ASSERT AUDIT LOG EVENTS
      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to enable engine ${engineId}`,
          targetType: 'tt_Engine',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'engine',
          eventName: 'EngineEnable',
          organizationName: 'Veritone, Inc.'
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
    }
  });
});

describeif(
  config.env === DEFAULT_ENV_TO_RUN_IN,
  'audit-log-engine-Engine Build new process testing',
  () => {
    let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
    beforeAll(async () => {
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(
        config,
        OPTIONS
      );
      const result = await helpersAuditLog.loginWithConfiguredUser();
      CONFIG_ADMIN_TOKEN = result.userLogin.token;
      CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
      expect(CONFIG_ADMIN_TOKEN).toBeDefined();
      expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
    });

    it('get transcription category id', async () => {
      const query = `{
      engineCategories(type: "Cognition", name: "Transcription", limit: 1) {
        count
        records {
          id
          name
        }
      }
    }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const engineCategories = _.get(result, 'engineCategories');
      expect(engineCategories).toBeDefined();
      expect(engineCategories.count).toEqual(1);
      expect(engineCategories.records).toHaveLength(1);
      expect(_.get(engineCategories, 'records[0].id')).toBeDefined();

      categoryId = _.get(engineCategories, 'records[0].id');
    });

    it('create new engine - for testing build with new process', async () => {
      const query = `
      mutation {
        createEngine(input: {
          name: "${testName}"
          categoryId: "${categoryId}"
          deploymentModel: FullyNetworkIsolated
        }) {
          id
          name
          categoryId
          deploymentModel
          state
        }
      }
    `;
      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      expect(result.createEngine).toBeDefined();
      expect(result.createEngine.id).toBeDefined();
      expect(result.createEngine.name).toEqual(testName);
      expect(result.createEngine.categoryId).toEqual(categoryId);
      expect(result.createEngine.deploymentModel).toEqual(
        'FullyNetworkIsolated'
      );
      expect(result.createEngine.state).toEqual('pending');

      engineId1 = result.createEngine.id;

      // ASSERT AUDIT LOG EVENTS
      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'success',
          actionDetails: `Created engine ${engineId1}`,
          targetType: 'tt_Engine',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'engine',
          eventName: 'EngineCreate',
          organizationName: 'Veritone, Inc.'
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

    it('create new engine failed', async () => {
      const query = `
      mutation {
        createEngine(input: {
          name: "${testName}"
          categoryId: "invalid_category"
          deploymentModel: FullyNetworkIsolated
        }) {
          id
          name
          categoryId
          deploymentModel
          state
        }
      }
    `;
      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      try {
        await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toEqual(
          expect.stringMatching(/Invalid engine category id/)
        );
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          error
        );

        // ASSERT AUDIT LOG EVENTS
        const expectedAuditLogItems = [
          {
            actionName: 'create',
            actionResult: 'failure',
            actionDetails: 'Failed to create new engine',
            targetType: 'tt_Engine',
            userName: helpers.config.userName,
            userAgent: 'core-graphql-server test',
            organizationId: _.toString(helpersAuditLog._organizationID),
            originatorApplication: 'GraphQL-CI-Test',
            originatorService: 'core-graphql-server',
            eventType: 'engine',
            eventName: 'EngineCreate',
            organizationName: 'Veritone, Inc.'
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
      }
    });

    it('creates engine build - has dockerImage with private engine', async () => {
      const query = `mutation {
      createEngineBuild(input: {
        engineId: "${engineId1}"
        dockerImage: "${builddockerImageUploaded(engineId1)}"
      }) {
        id
        status
        engine {
          state
        }
      }
    }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const engine = await checkEngineBuildApprovedFromGetEngineBuildQuery(
        result.createEngineBuild.id,
        CONFIG_ADMIN_TOKEN,
        helpersAuditLog
      );
      expect(engine.engineBuild.engine.state).toEqual('ready');
      engineBuildId1 = result.createEngineBuild.id;
    });

    it('update engine build - new engine build process', async () => {
      const query = `
        mutation {
          updateEngineBuild(input: {
            id: "${engineBuildId1}"
            engineId: "${engineId1}"
            taskRuntime: {
              nodeRed: false
            }
            action: update
          }) {
            id
            status
            engine {
              state
            }
          }
        }
      `;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('approved');

      // ASSERT AUDIT LOG EVENTS
      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Updated build ${engineBuildId1} for engine ${engineId1}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'engine',
          eventName: 'EngineBuildUpdate',
          organizationName: 'Veritone, Inc.'
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

    it('deploy engine build - new engine build process', async () => {
      const query = `
        mutation {
          updateEngineBuild(input: {
            id: "${engineBuildId1}"
            engineId: "${engineId1}"
            action: deploy
          }) {
            id
            status
            engine {
              state
            }
          }
        }
      `;

      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('deployed');
    });

    it('pause engine build - new engine build process', async () => {
      const query = `
        mutation {
          updateEngineBuild(input: {
            id: "${engineBuildId1}"
            engineId: "${engineId1}"
            action: pause
          }) {
            id
            status
            engine {
              state
            }
          }
        }
      `;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('paused');

      // ASSERT AUDIT LOG EVENTS
      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Paused build ${engineBuildId1} for engine ${engineId1}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'engine',
          eventName: 'EngineBuildPause',
          organizationName: 'Veritone, Inc.'
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

    it('unpause engine build - new engine build process', async () => {
      const query = `
        mutation {
          updateEngineBuild(input: {
            id: "${engineBuildId1}"
            engineId: "${engineId1}"
            action: unpause
          }) {
            id
            status
            engine {
              state
            }
          }
        }
      `;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('approved');

      // ASSERT AUDIT LOG EVENTS
      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Unpaused build ${engineBuildId1} for engine ${engineId1}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'engine',
          eventName: 'EngineBuildUnpause',
          organizationName: 'Veritone, Inc.'
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
  }
);

describeif(
  config.env === DEFAULT_ENV_TO_RUN_IN,
  'audit-log-engine-Engine Build new process testing disapprove',
  () => {
    let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
    beforeAll(async () => {
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(
        config,
        OPTIONS
      );
      const result = await helpersAuditLog.loginWithConfiguredUser();
      CONFIG_ADMIN_TOKEN = result.userLogin.token;
      CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
      expect(CONFIG_ADMIN_TOKEN).toBeDefined();
      expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
    });

    it('get transcription category id', async () => {
      const query = `{
      engineCategories(type: "Cognition", name: "Transcription", limit: 1) {
        count
        records {
          id
          name
        }
      }
    }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const engineCategories = _.get(result, 'engineCategories');
      expect(engineCategories).toBeDefined();
      expect(engineCategories.count).toEqual(1);
      expect(engineCategories.records).toHaveLength(1);
      expect(_.get(engineCategories, 'records[0].id')).toBeDefined();

      categoryId = _.get(engineCategories, 'records[0].id');
    });

    it('create new engine - for testing build with new process', async () => {
      const query = `
      mutation {
        createEngine(input: {
          name: "${testName}"
          categoryId: "${categoryId}"
          deploymentModel: FullyNetworkIsolated
          manifest: {
              supportedInputTypes: [
                    "application/json"
                ]
          }
        }) {
          id
          name
          categoryId
          deploymentModel
          state
        }
      }
    `;
      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      expect(result.createEngine).toBeDefined();
      expect(result.createEngine.id).toBeDefined();
      expect(result.createEngine.name).toEqual(testName);
      expect(result.createEngine.categoryId).toEqual(categoryId);
      expect(result.createEngine.deploymentModel).toEqual(
        'FullyNetworkIsolated'
      );
      expect(result.createEngine.state).toEqual('pending');

      engineId1 = result.createEngine.id;
    });

    it('creates engine build - has dockerImage with private engine', async () => {
      const query = `mutation {
      createEngineBuild(input: {
        engineId: "${engineId1}"
        dockerImage: "${builddockerImageUploaded(engineId1)}"
      }) {
        id
        status
        engine {
          state
        }
      }
    }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const engine = await checkEngineBuildApprovedFromGetEngineBuildQuery(
        result.createEngineBuild.id,
        CONFIG_ADMIN_TOKEN,
        helpersAuditLog
      );
      expect(engine.engineBuild.engine.state).toEqual('ready');
      engineBuildId1 = result.createEngineBuild.id;
    });

    it('disapprove engine build - failed to disapprove engine build in deploy state', async () => {
      // create engine
      const resultEngine = await helpersAuditLog._gqlClient.query(
        `
          mutation {
            createEngine(input: {
              name: "${testName}"
              categoryId: "${categoryId}"
              deploymentModel: FullyNetworkIsolated
              manifest: {
                  supportedInputTypes: [
                        "application/json"
                    ]
              }
            }) {
              id
              name
              categoryId
              deploymentModel
              state
            }
          }
        `,
        null,
        helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          helpersAuditLog.buildCorrelationID(),
        )
      );
      const engineId = resultEngine.createEngine.id

      const resultEngineBuild = await helpersAuditLog._gqlClient.query(
        `mutation {
          createEngineBuild(input: {
            engineId: "${engineId}"
            dockerImage: "${builddockerImageUploaded(engineId)}"
          }) {
            id
            status
            engine {
              state
            }
          }
        }`,
        null,
        helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          helpersAuditLog.buildCorrelationID()
        )
      );
      const engine = await checkEngineBuildApprovedFromGetEngineBuildQuery(
        resultEngineBuild.createEngineBuild.id,
        CONFIG_ADMIN_TOKEN,
        helpersAuditLog
      );

      const engineBuildId = resultEngineBuild.createEngineBuild.id

      // update engine state to deploy
      let query = `
        mutation {
          updateEngineBuild(input: {
            id: "${engineBuildId}"
            engineId: "${engineId}"
            action: deploy
          }) {
            id
            status
            engine {
              state
            }
          }
        }
      `;

      let correlationID = helpersAuditLog.buildCorrelationID();
      let headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      let result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('deployed');

      query = `
        mutation {
          updateEngineBuild(input: {
            id: "${engineBuildId}"
            engineId: "${engineId}"
            action: disapprove
          }) {
            id
            status
            engine {
              state
            }
          }
        }
      `;
      correlationID = helpersAuditLog.buildCorrelationID();
      headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      let err;
      try {
        result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers
        );
      } catch (error) {
        err = error
      }
      expect(err).toBeDefined();

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        err
      );

      // ASSERT AUDIT LOG EVENTS
      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to disapprove new build ${engineBuildId} for engine ${engineId}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'engine',
          eventName: 'EngineBuildDisapprove',
          organizationName: 'Veritone, Inc.'
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

    it('disapprove engine build - new engine build process', async () => {
      const query = `
        mutation {
          updateEngineBuild(input: {
            id: "${engineBuildId1}"
            engineId: "${engineId1}"
            action: disapprove
          }) {
            id
            status
            engine {
              state
            }
          }
        }
      `;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('disapproved');

      // ASSERT AUDIT LOG EVENTS
      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Disapproved new build ${engineBuildId1} for engine ${engineId1}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'engine',
          eventName: 'EngineBuildDisapprove',
          organizationName: 'Veritone, Inc.'
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
  }
);

describeif(
  config.env === DEFAULT_ENV_TO_RUN_IN,
  'audit-log-engine-Engine Build new deploy testing',
  () => {
    let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
    beforeAll(async () => {
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(
        config,
        OPTIONS
      );
      const result = await helpersAuditLog.loginWithConfiguredUser();
      CONFIG_ADMIN_TOKEN = result.userLogin.token;
      CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
      expect(CONFIG_ADMIN_TOKEN).toBeDefined();
      expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
    });

    it('deploy new engine', async () => {
      // get transcription category id
      let query = `{
        engineCategories(type: "Cognition", name: "Transcription", limit: 1) {
          count
          records {
            id
            name
          }
        }
      }`;

      let correlationID = helpersAuditLog.buildCorrelationID();
      let headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      let result = await helpersAuditLog._gqlClient.query(query, null, headers);
      const engineCategories = _.get(result, 'engineCategories');
      categoryId = _.get(engineCategories, 'records[0].id');

      // creating Engine
      query = `
      mutation {
        createEngine(input: {
          name: "${testName}"
          categoryId: "${categoryId}"
          deploymentModel: FullyNetworkIsolated
          manifest: {
              supportedInputTypes: [
                    "application/json"
                ]
          }
        }) {
          id
          name
          categoryId
          deploymentModel
          state
        }
      }
    `;
      result = await helpersAuditLog._gqlClient.query(query, null, headers);
      let correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      engineId1 = result.createEngine.id;

      // create engine build
      query = `mutation {
        createEngineBuild(input: {
          engineId: "${engineId1}"
          dockerImage: "${builddockerImageUploaded(engineId1)}"
        }) {
          id
          status
          engine {
            state
          }
        }
      }`;
      result = await helpersAuditLog._gqlClient.query(query, null, headers);
      engineBuildId1 = result.createEngineBuild.id;

      // deploy engine build
      query = `
        mutation {
          updateEngineBuild(input: {
            id: "${engineBuildId1}"
            engineId: "${engineId1}"
            taskRuntime: {
              nodeRed: false
            }
            action: deploy
          }) {
            id
            status
            engine {
              state
            }
          }
        }
      `;
      correlationID = helpersAuditLog.buildCorrelationID();
      headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      result = await helpersAuditLog._gqlClient.query(query, null, headers);
      correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('deployed');

      // ASSERT AUDIT LOG EVENTS
      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Deployed build ${engineBuildId1} for engine ${engineId1}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'engine',
          eventName: 'EngineBuildDeploy',
          organizationName: 'Veritone, Inc.'
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
    it('error doing deploy of new engine twice', async () => {
      // get transcription category id
      let query = `{
        engineCategories(type: "Cognition", name: "Transcription", limit: 1) {
          count
          records {
            id
            name
          }
        }
      }`;

      let correlationID = helpersAuditLog.buildCorrelationID();
      let headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      let result = await helpersAuditLog._gqlClient.query(query, null, headers);
      const engineCategories = _.get(result, 'engineCategories');
      categoryId = _.get(engineCategories, 'records[0].id');

      // creating Engine
      query = `
      mutation {
        createEngine(input: {
          name: "${testName}"
          categoryId: "${categoryId}"
          deploymentModel: FullyNetworkIsolated
        }) {
          id
          name
          categoryId
          deploymentModel
          state
        }
      }
    `;
      result = await helpersAuditLog._gqlClient.query(query, null, headers);
      let correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      engineId1 = result.createEngine.id;

      // create engine build
      query = `mutation {
        createEngineBuild(input: {
          engineId: "${engineId1}"
          dockerImage: "${builddockerImageUploaded(engineId1)}"
        }) {
          id
          status
          engine {
            state
          }
        }
      }`;
      result = await helpersAuditLog._gqlClient.query(query, null, headers);
      engineBuildId1 = result.createEngineBuild.id;

      // deploy engine build
      query = `
        mutation {
          updateEngineBuild(input: {
            id: "${engineBuildId1}"
            engineId: "${engineId1}"
            taskRuntime: {
              nodeRed: false
            }
            action: deploy
          }) {
            id
            status
            engine {
              state
            }
          }
        }
      `;
      correlationID = helpersAuditLog.buildCorrelationID();
      headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      result = await helpersAuditLog._gqlClient.query(query, null, headers);
      correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('deployed');

      // try to deploy again the same engine to generate a failure case for EngineBuildDeploy event
      try {
        result = await helpersAuditLog._gqlClient.query(query, null, headers);
      } catch (error) {
        //continue test
      }

      // ASSERT AUDIT LOG EVENTS
      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to deploy build ${engineBuildId1} for engine ${engineId1}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'engine',
          eventName: 'EngineBuildDeploy',
          organizationName: 'Veritone, Inc.'
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
  }
);

describeif(
  config.env === DEFAULT_ENV_TO_RUN_IN,
  'audit-log-engine-build-failure-cases',
  () => {
    let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
    let testEngineId, testBuildId;

    beforeAll(async () => {
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
      const result = await helpersAuditLog.loginWithConfiguredUser();
      CONFIG_ADMIN_TOKEN = result.userLogin.token;
      CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
      expect(CONFIG_ADMIN_TOKEN).toBeDefined();
      expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();

      // Setup test engine and build for failure tests
      await setupTestEngineAndBuild();
    });

    async function setupTestEngineAndBuild() {
      // Get category ID
      const categoryQuery = `{
        engineCategories(type: "Cognition", name: "Transcription", limit: 1) {
          records { id }
        }
      }`;
      const categoryResult = await helpersAuditLog._gqlClient.query(
        categoryQuery, 
        null, 
        helpersAuditLog.buildHeadersWithBearerToken(CONFIG_ADMIN_TOKEN)
      );
      const categoryId = categoryResult.engineCategories.records[0].id;

      // Create test engine
      const engineQuery = `mutation {
        createEngine(input: {
          name: "Test Engine for Failures ${Date.now()}"
          categoryId: "${categoryId}"
          deploymentModel: FullyNetworkIsolated
        }) {
          id
        }
      }`;
      const engineResult = await helpersAuditLog._gqlClient.query(
        engineQuery,
        null,
        helpersAuditLog.buildHeadersWithBearerToken(CONFIG_ADMIN_TOKEN)
      );
      testEngineId = engineResult.createEngine.id;

      // Create test build
      const buildQuery = `mutation {
        createEngineBuild(input: {
          engineId: "${testEngineId}"
        }) {
          id
        }
      }`;
      const buildResult = await helpersAuditLog._gqlClient.query(
        buildQuery,
        null,
        helpersAuditLog.buildHeadersWithBearerToken(CONFIG_ADMIN_TOKEN)
      );
      testBuildId = buildResult.createEngineBuild.id;
    }

    it('should log failure event for EngineBuildSubmit - invalid build state', async () => {
      const query = `mutation {
        updateEngineBuild(input: {
          id: "${testBuildId}"
          engineId: "${testEngineId}"
          action: submit
        }) {
          id
          status
        }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      try {
        await helpersAuditLog._gqlClient.query(query, null, headers);
      } catch (error) {
        // Expected to fail due to invalid state transition
      }

      // ASSERT AUDIT LOG EVENTS
      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to submit new build ${testBuildId} for engine ${testEngineId}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'engine',
          eventName: 'EngineBuildSubmit',
          organizationName: 'Veritone, Inc.'
        }
      ];

      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );

      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID
      });
    });

    it('should log failure event for EngineBuildApprove - invalid build state', async () => {
      await helpersAuditLog._gqlClient.query(`mutation {
        updateEngineBuild(input: {
          id: "${testBuildId}"
          engineId: "${testEngineId}"
          action: invalidate
        }) {
          id
        }
      }`, null, helpersAuditLog.buildHeadersWithBearerToken(CONFIG_ADMIN_TOKEN));

      const query = `mutation {
        updateEngineBuild(input: {
          id: "${testBuildId}"
          engineId: "${testEngineId}"
          action: approve
        }) {
          id
          status
        }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      try {
        await helpersAuditLog._gqlClient.query(query, null, headers);
      } catch (error) {
        // Expected to fail due to invalid state
      }

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to approve new build ${testBuildId} for engine ${testEngineId}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'engine',
          eventName: 'EngineBuildApprove',
          organizationName: 'Veritone, Inc.'
        }
      ];

      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );

      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID
      });
    });

    it('should log failure event for EngineBuildDisapprove - invalid build state', async () => {
      const query = `mutation {
        updateEngineBuild(input: {
          id: "${testBuildId}"
          engineId: "${testEngineId}"
          action: disapprove
        }) {
          id
          status
        }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      try {
        await helpersAuditLog._gqlClient.query(query, null, headers);
      } catch (error) {
        // Expected to fail due to invalid state
      }

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to disapprove new build ${testBuildId} for engine ${testEngineId}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'engine',
          eventName: 'EngineBuildDisapprove',
          organizationName: 'Veritone, Inc.'
        }
      ];

      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );

      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID
      });
    });

    it('should log failure event for EngineBuildPause - invalid build state', async () => {
      const query = `mutation {
        updateEngineBuild(input: {
          id: "${testBuildId}"
          engineId: "${testEngineId}"
          action: pause
        }) {
          id
          status
        }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      try {
        await helpersAuditLog._gqlClient.query(query, null, headers);
      } catch (error) {
        // Expected to fail due to invalid state (can only pause deployed builds)
      }

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to pause build ${testBuildId} for engine ${testEngineId}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'engine',
          eventName: 'EngineBuildPause',
          organizationName: 'Veritone, Inc.'
        }
      ];

      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );

      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID
      });
    });

    it('should log failure event for EngineBuildUnpause - invalid build state', async () => {
      const query = `mutation {
        updateEngineBuild(input: {
          id: "${testBuildId}"
          engineId: "${testEngineId}"
          action: unpause
        }) {
          id
          status
        }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      try {
        await helpersAuditLog._gqlClient.query(query, null, headers);
      } catch (error) {
        // Expected to fail due to invalid state (can only unpause paused builds)
      }

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to unpause build ${testBuildId} for engine ${testEngineId}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'engine',
          eventName: 'EngineBuildUnpause',
          organizationName: 'Veritone, Inc.'
        }
      ];

      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );

      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID
      });
    });

    it('should log failure event for EngineBuildDelete - invalid build state', async () => {

      // Create a fresh build that will be in 'fetching' state
      const fetchingBuildQuery = `mutation {
        createEngineBuild(input: {
          engineId: "${testEngineId}"
          }) {
              id
            }
          }`;

      const fetchingBuildResult = await helpersAuditLog._gqlClient.query(
        fetchingBuildQuery,
        null,
        helpersAuditLog.buildHeadersWithBearerToken(CONFIG_ADMIN_TOKEN)
      );
      const fetchingBuildId = fetchingBuildResult.createEngineBuild.id;

      // Try to delete a build in 'fetching' state (should fail)
      const query = `mutation {
        updateEngineBuild(input: {
          id: "${fetchingBuildId}"
          engineId: "${testEngineId}"
          action: delete
        }) {
          id
          status
        }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      try {
        await helpersAuditLog._gqlClient.query(query, null, headers);
      } catch (error) {
        // Expected to fail because fetching builds don't allow delete action
      }


      await new Promise(resolve => setTimeout(resolve, 2000));

      const expectedAuditLogItems = [
        {
          actionName: 'delete',
          actionResult: 'failure',
          actionDetails: `Failed to delete build ${fetchingBuildId} for engine ${testEngineId}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'engine',
          eventName: 'EngineBuildDelete',
          organizationName: 'Veritone, Inc.'
        }
      ];

      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );

      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID
      });
    });

    it('should log failure event for EngineBuildUpdate - invalid build state', async () => {

     const query = `mutation {
        updateEngineBuild(input: {
          id: "${testBuildId}"
          engineId: "${testEngineId}"
          action: update
        }) {
          id
          status
        }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      try {
        await helpersAuditLog._gqlClient.query(query, null, headers);
      } catch (error) {
        // Expected to fail due to invalid state (can only pause deployed builds)
      }

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to update build ${testBuildId} for engine ${testEngineId}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'engine',
          eventName: 'EngineBuildUpdate',
          organizationName: 'Veritone, Inc.'
        }
      ];

      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );

      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID
      });
    });

    it('should log failure event for EngineBuildCreate - invalid engine access', async () => {
      const invalidEngineId = '00000000-0000-0000-0000-000000000000';
      const query = `mutation {
        createEngineBuild(input: {
          engineId: "${invalidEngineId}"
        }) {
          id
          status
        }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      try {
        await helpersAuditLog._gqlClient.query(query, null, headers);
      } catch (error) {
        // Expected to fail due to invalid engine
      }

      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'failure',
          actionDetails: `Failed to create new build for engine ${invalidEngineId}`,
          targetType: 'tt_Build',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'engine',
          eventName: 'EngineBuildCreate',
          organizationName: 'Veritone, Inc.'
        }
      ];

      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );

      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID
      });
    });
  }
);
/**
 * In charge of doing up to 5 requests to check if the status of the engineBuildId
 * has changed from 'fetching' to 'approved'. This process can take a couple of seconds,
 * and it's necessary to wait until this status updated to continue with the execution
 * of the tests
 */
async function checkEngineBuildApprovedFromGetEngineBuildQuery(
  engineBuildId,
  authorizaton,
  helpersAuditLog
) {
  let result;
  for (let i = 0; i < 5; i++) {
    await helpers.sleep(4000);
    let query = `
      query getEngineBuild{
        engineBuild(id:"${engineBuildId}"){
          id
          status
          engine {
            state
          }
        }
      }`;
    result = await helpersAuditLog._gqlClient.query(query, null, authorizaton);
    if (result.engineBuild.status !== 'fetching') break;
  }
  expect(result.engineBuild).toBeDefined();
  expect(result.engineBuild.id).toBeDefined();
  expect(result.engineBuild.status).toEqual('approved');
  return result;
}

function builddockerImageUploaded(engineId) {
  // docker image to be reused and avoiding uploading one image for each test
  return `registry.central.aiware.com/${engineId}:838d1aa4-6a28-4a59-acf1-6ff346944299`;
}
