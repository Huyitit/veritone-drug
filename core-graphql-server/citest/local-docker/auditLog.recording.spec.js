const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  baselineEvents: [
    'recording_delete',
    'recording_create'
    //'recording_inserted',
    //'recording_cognition_completed',
    //'recording_insert_failed'
  ],
  configurableEvents: [
    'LoginSucceeded', // NEEDED TO FLUSH CACHE IN eventing service
    //'RecordingCognitionCompleted',
    'RecordingCreate',
    'RecordingDelete',
    'RecordingUpdate'
  ]
};

let tdoID;

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
   'audit-log-recording @nightly', () => {
  let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
    const result = await helpersAuditLog.loginWithConfiguredUser();
    CONFIG_ADMIN_TOKEN = result.userLogin.token;
    CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
    expect(CONFIG_ADMIN_TOKEN).toBeDefined();
    expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
  });

  it.skip('should index audit log events RecordingInsertFailed WHEN TODO not implemented and will not be implemented with this version', async () => {
    // SEE https://veritone.slack.com/archives/C07D2TNP92M/p1721936867415349
    expect(true).toBe(false);
  });

  it.skip('should index audit log events RecordingInserted WHEN TODO not implemented and will not be implemented with this version', async () => {
    // SEE https://veritone.slack.com/archives/C07D2TNP92M/p1721936867415349
    expect(true).toBe(false);
  });

  it('should index audit log events RecordingCreate WHEN creating a TDO', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    let result = await helpersAuditLog.createTDO(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    tdoID = _.get(result, 'createTDO.id');
    result = await helpersAuditLog.createAssetMp4(
      CONFIG_ADMIN_TOKEN,
      tdoID,
      'test.mp4',
      './citest/data/movie.mp4',
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        actionName: 'create',
        actionResult: 'success',
        targetId: tdoID,
        targetType: 'tt_TDO',
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        eventType: 'recording',
        eventName: 'RecordingCreate',
        organizationName: 'Veritone, Inc.'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    // Not used as a filter to retrieve the record from Elasticsearch, but used for comparison with the expected values.
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Created TDO \d+$/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events RecordingCreate with failure WHEN createTDO fails', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();

    let result, error;
    try {
      result = await helpersAuditLog.createTDO(
        CONFIG_ADMIN_TOKEN,
        correlationID,
        { invalid: true }
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      error
    );

    const expectedAuditLogItems = [
      {
        actionName: 'create',
        actionResult: 'failure',
        targetType: 'tt_TDO',
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        eventType: 'recording',
        eventName: 'RecordingCreate',
        organizationName: 'Veritone, Inc.'
      }
    ];

    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Failed to create TDO.*$/
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log event RecordingCreate when calling createJob', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const jobResult = await helpersAuditLog.createJob(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      jobResult
    );
    const expectedAuditLogItems = [
      {
        actionName: 'create',
        actionResult: 'success',
        eventName: 'RecordingCreate',
        targetType: 'tt_TDO',
        targetId: _.get(jobResult, 'createJob.targetId'),
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        eventType: 'recording',
        organizationName: 'Veritone, Inc.'
      }
    ];

    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Created TDO \d+$/
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log event RecordingCreate with failure when createJob fails', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    let jobResult, error;

    try {
      jobResult = await helpersAuditLog.createJob(
        CONFIG_ADMIN_TOKEN,
        correlationID,
        { invalid: true }
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      error
    );

    const expectedAuditLogItems = [
      {
        actionName: 'create',
        actionResult: 'failure',
        eventName: 'RecordingCreate',
        targetType: 'tt_TDO',
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        eventType: 'recording',
        organizationName: 'Veritone, Inc.'
      }
    ];

    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Failed to create TDO.*$/
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log event RecordingCreate when calling launchJobTemplate', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const jobResult = await helpersAuditLog.createLaunchJobTemplate(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      jobResult
    );
    const expectedAuditLogItems = [
      {
        actionName: 'create',
        actionResult: 'success',
        eventName: 'RecordingCreate',
        targetType: 'tt_TDO',
        targetId: _.get(jobResult, 'launchJobTemplates[0].target.id'),
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        eventType: 'recording',
        organizationName: 'Veritone, Inc.'
      }
    ];

    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Created TDO \d+$/
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log event RecordingCreate with failure when calling launchJobTemplate fails', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    let jobResult, error;

    try {
      jobResult = await helpersAuditLog.createLaunchJobTemplate(
        CONFIG_ADMIN_TOKEN,
        correlationID,
        { invalid: true }
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      error
    );

    const expectedAuditLogItems = [
      {
        actionName: 'create',
        actionResult: 'failure',
        eventName: 'RecordingCreate',
        targetType: 'tt_TDO',
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        eventType: 'recording',
        organizationName: 'Veritone, Inc.'
      }
    ];

    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Failed to create TDO.*$/
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events when updating a recording', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    let result = await helpersAuditLog.updateTDO(
      tdoID,
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        eventName: 'RecordingUpdate',
        targetId: tdoID,
        targetType: 'tt_TDO',
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        eventType: 'recording',
        organizationName: 'Veritone, Inc.'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    // Not used as a filter to retrieve the record from Elasticsearch, but used for comparison with the expected values.
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Updated TDO \d+$/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log event RecordingUpdate with failure when updating a recording fails', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    let result, error;

    try {
      result = await helpersAuditLog.updateTDO(
        tdoID,
        CONFIG_ADMIN_TOKEN,
        correlationID,
        { invalid: true }
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      error
    );

    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'failure',
        eventName: 'RecordingUpdate',
        targetId: tdoID,
        targetType: 'tt_TDO',
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        eventType: 'recording',
        organizationName: 'Veritone, Inc.'
      }
    ];

    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Failed to update TDO \d+$/
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log event RecordingUpdate when deleteAsset', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    let result = await helpersAuditLog.createTDOAsset(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    tdoID = _.get(result, 'createTDO.id');
    const assetId = _.get(result, 'createTDO.assets.records[0].id');
    result = await helpersAuditLog.deleteAsset(
      CONFIG_ADMIN_TOKEN,
      assetId,
      correlationID
    );

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        actionName: 'update',
        eventName: 'RecordingUpdate',
        targetId: tdoID,
        targetType: 'tt_TDO',
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        eventType: 'recording',
        organizationName: 'Veritone, Inc.'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    // Not used as a filter to retrieve the record from Elasticsearch, but used for comparison with the expected values.
    expectedAuditLogItems[0].actionResult = expect.stringMatching(
      /^Updated TDO \d+$/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events RecordingDelete WHEN deleting TDO', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    let result = await helpersAuditLog.createTDO(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const tdoID = _.get(result, 'createTDO.id');
    result = await helpersAuditLog.createAssetMp4(
      CONFIG_ADMIN_TOKEN,
      tdoID,
      'test.mp4',
      './citest/data/movie.mp4'
    );
    result = await helpersAuditLog.deleteTDO(
      CONFIG_ADMIN_TOKEN,
      tdoID,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        actionName: 'delete',
        actionResult: 'success',
        targetId: tdoID,
        targetType: 'tt_TDO',
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        eventType: 'recording',
        eventName: 'RecordingDelete'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Deleted TDO \d+$/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events RecordingDelete WHEN failing to delete a TDO', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    let result, error;
    try {
      result = await helpersAuditLog.deleteTDO(
        CONFIG_ADMIN_TOKEN,
        '9999999999',
        correlationID
      );
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        actionName: 'delete',
        actionResult: 'failure',
        targetId: '9999999999',
        targetType: 'tt_TDO',
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        eventType: 'recording',
        eventName: 'RecordingDelete'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Failed to delete TDO 9999999999$/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events RecordingDelete WHEN failing to cleanupTDO', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    let result, error;
    try {
      result = await helpersAuditLog.cleanupTDO(
        CONFIG_ADMIN_TOKEN,
        '9999999999',
        correlationID
      );
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        actionName: 'delete',
        actionResult: 'failure',
        targetId: '9999999999',
        targetType: 'tt_TDO',
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID),
        eventType: 'recording',
        eventName: 'RecordingDelete'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Failed to delete TDO 9999999999$/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log AccessMedia when fetching TDO', async () => {
    const result = await helpersAuditLog.createTDO(CONFIG_ADMIN_TOKEN);
    const tdoID = _.get(result, 'createTDO.id');
    const correlationID = helpersAuditLog.buildCorrelationID();
    const fetchedTDO = await helpersAuditLog.getTDO(
      CONFIG_ADMIN_TOKEN,
      tdoID,
      correlationID
    );

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      fetchedTDO
    );
    const expectedAuditLogItems = [
      {
        actionName: 'read',
        actionResult: 'success',
        eventType: 'media',
        eventName: 'AccessMedia',    
        actionDetails: `Accessed media ${tdoID}`    
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

  it('should index audit log AccessMedia when failing to fetch a TDO', async () => {
    const tdoID = 'INVALID_TDO_ID';
    const correlationID = helpersAuditLog.buildCorrelationID();
    await helpersAuditLog
      .getTDO(CONFIG_ADMIN_TOKEN, tdoID, correlationID)
      .catch(async (err) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          err
        );
        const expectedAuditLogItems = [
          {
            actionName: 'read',
            actionResult: 'failure',
            eventType: 'media',
            eventName: 'AccessMedia',
            actionDetails: `Failed to access ${tdoID} for reason: Invalid ID format. A UUID or numerical value is required.`
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
