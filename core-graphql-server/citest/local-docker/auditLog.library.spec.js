const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');
const GraphqlClient = require('../helpers/gql');
const Minio = require('minio');

const OPTIONS = {
  configurableEvents: ['LibraryTrain']
};

let newLibraryTypeId = 'people';
let libraryEngineModelEngineId, newLibraryId, newEngineModelId;
const imageUrl = 'https://www.veritone.com/images/logo.svg';

const testName = 'citest_library_' + Date.now();

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
   'audit-log-library @nightly', () => {
  let gqlClient, helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
    let result = await helpersAuditLog.loginWithConfiguredUser();
    CONFIG_ADMIN_TOKEN = result.userLogin.token;
    CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
    expect(CONFIG_ADMIN_TOKEN).toBeDefined();
    expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();

    const env = config.env;
    gqlClient = new GraphqlClient(env);
    result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    const query = `
      query {
        engines(limit: 1, libraryRequired:true) {
          count
          records {
            id
          }
        }
      }
    `;
    const queryResult = await gqlClient.query(query);
    libraryEngineModelEngineId = _.get(queryResult, 'engines.records[0].id');
    expect(libraryEngineModelEngineId).toBeDefined();
  });

  afterAll(async () => {
    if (newEngineModelId) {
      const query = `mutation {
      deleteLibraryEngineModel(id: "${newEngineModelId}")  {
        id
        message
      }
    }`;
      await gqlClient.query(query);
    }
    if (newLibraryId) {
      const query = `mutation {
      deleteLibrary(id: "${newLibraryId}")  {
        id
        message
      }
    }`;
      await gqlClient.query(query);
    }
  });

  it('should index audit log when updating library engine model', async () => {
    // Create a Library
    let query = `mutation {
      createLibrary(input: {
        name: "${testName}"
        libraryTypeId: "${newLibraryTypeId}"
        coverImageUrl: "${imageUrl}"
      })  {
        id
        name
        coverImageUrl
      }
    }`;
    let result = await gqlClient.query(query);
    newLibraryId = _.get(result, 'createLibrary.id');
    expect(newLibraryId).toBeDefined();

    // Create a Library Engine Model
    query = `mutation {
      createLibraryEngineModel(input: {
        libraryId: "${newLibraryId}"
        engineId: "${libraryEngineModelEngineId}"
        trainStatus: pending
        dataUrl: "${imageUrl}"
        accuracy: 75
      })  {
        id
        trainStatus
        libraryId
        engineId
        dataUrl
      }
    }`;
    result = await gqlClient.query(query);
    let records = result.createLibraryEngineModel;
    newEngineModelId = records.id;

    // Update the Library Engine Model to trigger event
    query = `mutation {
      updateLibraryEngineModel(input: {
        id: "${newEngineModelId}"
        trainStatus: complete
        accuracy: 90
      })  {
        id
        trainStatus
        dataUrl
        accuracy
      }
    }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    result = await gqlClient.query(query, null, headers);
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    expect(result.updateLibraryEngineModel).toBeDefined();

    const expectedAuditLogItems = [
      { eventType: 'library', eventName: 'LibraryTrain' }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      new RegExp(`^Trained library ${testName}$`)
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });
});
