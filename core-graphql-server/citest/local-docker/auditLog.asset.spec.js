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
    'AccessMedia',
    'AssetUpdate',
    'AssetDelete'
  ]
};

let tdoID;

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
  'audit-log-asset @nightly', () => {
  let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
    const result = await helpersAuditLog.loginWithConfiguredUser();
    CONFIG_ADMIN_TOKEN = result.userLogin.token;
    CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
    expect(CONFIG_ADMIN_TOKEN).toBeDefined();
    expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
  });

  it('should index audit log AccessMedia when fetching Asset', async () => {
    const result = await helpersAuditLog.createTDO(CONFIG_ADMIN_TOKEN);
    const tdoID = _.get(result, 'createTDO.id');
    const asset = await helpersAuditLog.createAsset(CONFIG_ADMIN_TOKEN, 'test asset', tdoID);
    const assetID = _.get(asset, 'createAsset.id');
    const correlationID = helpersAuditLog.buildCorrelationID();
    const fetchedAsset = await helpersAuditLog.getAsset(
      CONFIG_ADMIN_TOKEN,
      assetID,
      correlationID
    );

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      fetchedAsset
    );
    const expectedAuditLogItems = [
      {
        actionName: 'read',
        actionResult: 'success',
        eventType: 'media',
        eventName: 'AccessMedia',    
        actionDetails: `Accessed media ${tdoID}`    
      },
      {
        actionName: 'read',
        actionResult: 'success',
        eventType: 'media',
        eventName: 'AccessMedia',    
        actionDetails: `Accessed media test asset`    
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

  it('should index audit log AccessMedia when failing to fetch an Asset', async () => {
    const assetId = 'INVALID_ASSET_ID';
    const correlationID = helpersAuditLog.buildCorrelationID();
    await helpersAuditLog
      .getAsset(CONFIG_ADMIN_TOKEN, assetId, correlationID)
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
            actionDetails: `Failed to access ${assetId} for reason: The requested object was not found`
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

  it('should index audit log AssetUpdate when updating an Asset', async () => {
    const result = await helpersAuditLog.createTDO(CONFIG_ADMIN_TOKEN);
    const tdoID = _.get(result, 'createTDO.id');
    const fileName = 'audit-update-test.json';
    const asset = await helpersAuditLog.createAsset(
      CONFIG_ADMIN_TOKEN,
      fileName,
      tdoID
    );
    const assetID = _.get(asset, 'createAsset.id');
    const correlationID = helpersAuditLog.buildCorrelationID();
    const updated = await helpersAuditLog.updateAsset(
      CONFIG_ADMIN_TOKEN,
      assetID,
      fileName,
      correlationID
    );

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      updated
    );
    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        eventType: 'asset',
        eventName: 'AssetUpdate',
        actionDetails: `Updated file ${fileName}`
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

  it('should index audit log AssetUpdate when failing to update an Asset', async () => {
    const assetId = 'INVALID_ASSET_ID';
    const correlationID = helpersAuditLog.buildCorrelationID();
    await helpersAuditLog
      .updateAsset(CONFIG_ADMIN_TOKEN, assetId, 'ignored.json', correlationID)
      .catch(async (err) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          err
        );
        // the asset is never resolved, so the template falls back to the id
        const expectedAuditLogItems = [
          {
            actionName: 'update',
            actionResult: 'failure',
            eventType: 'asset',
            eventName: 'AssetUpdate',
            actionDetails: `Failed to update file ${assetId}`
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

  it('should index audit log AssetDelete when deleting an Asset', async () => {
    const result = await helpersAuditLog.createTDO(CONFIG_ADMIN_TOKEN);
    const tdoID = _.get(result, 'createTDO.id');
    const fileName = 'audit-delete-test.json';
    const asset = await helpersAuditLog.createAsset(
      CONFIG_ADMIN_TOKEN,
      fileName,
      tdoID
    );
    const assetID = _.get(asset, 'createAsset.id');
    const correlationID = helpersAuditLog.buildCorrelationID();
    const deleted = await helpersAuditLog.deleteAsset(
      CONFIG_ADMIN_TOKEN,
      assetID,
      correlationID
    );

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      deleted
    );
    const expectedAuditLogItems = [
      {
        actionName: 'delete',
        actionResult: 'success',
        eventType: 'asset',
        eventName: 'AssetDelete',
        actionDetails: `Deleted file ${fileName}`
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

  it('should index audit log AssetDelete when failing to delete an Asset', async () => {
    const assetId = 'INVALID_ASSET_ID';
    const correlationID = helpersAuditLog.buildCorrelationID();
    await helpersAuditLog
      .deleteAsset(CONFIG_ADMIN_TOKEN, assetId, correlationID)
      .catch(async (err) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          err
        );
        const expectedAuditLogItems = [
          {
            actionName: 'delete',
            actionResult: 'failure',
            eventType: 'asset',
            eventName: 'AssetDelete',
            actionDetails: `Failed to delete file ${assetId}`
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
