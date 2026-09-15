const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  configurableEvents: [
    'MediaSourceCreate',
    'MediaSourceUpdate',
    'MediaSourceDelete'
  ]
};

let mediaSourceId;

const testName = 'citest_media_source_' + Date.now();

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif(
  (config.env === DEFAULT_ENV_TO_RUN_IN),
  'audit-log-media-source @nightly',
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

    it('should index audit log when creating media source', async () => {
      const query = `mutation {
        createSource(input: {
          sourceTypeId: 1
          name: "${testName}"
          isPublic: false
        }) {
          id
          sourceTypeId          
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
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      expect(result).toBeDefined();
      expect(result.createSource).toBeDefined();
      expect(result.createSource.id).toBeDefined();
      mediaSourceId = result.createSource.id;

      const expectedAuditLogItems = [
        {
          eventType: 'media_source',
          eventName: 'MediaSourceCreate',
          actionResult: 'success',
          actionDetails: `Created source ${testName}`,
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

    it('should index audit log when failing to create media source', async () => {
      const query = `mutation {
        createSource(input: {
          sourceTypeId: "XYZ"
          name: "${testName}"
          isPublic: false
        }) {
          id
          sourceTypeId          
        }
      }`;
      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      await helpersAuditLog._gqlClient
        .query(query, null, headers)
        .catch(async (err) => {
          const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
            err
          );

          const expectedAuditLogItems = [
            {
              eventType: 'media_source',
              eventName: 'MediaSourceCreate',
              actionResult: 'failure',
              actionDetails: 'Failed to create new source',
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

    it('should index audit log when updating a media source', async () => {
      const query = `
      mutation {
        updateSource(
          input: {
            id: "${mediaSourceId}"
            name: "${testName}-updated"
          }) {
            id
            name
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

      expect(result).toBeDefined();
      expect(result.updateSource.id).toBeDefined();
      expect(result.updateSource.name).toEqual(`${testName}-updated`);

      const expectedAuditLogItems = [
        {
          eventType: 'media_source', eventName: 'MediaSourceUpdate', actionResult: 'success',
          actionDetails: `Updated source ${testName}`,
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

    it('should index audit log when failing to update a media source', async () => {
      const query = `
      mutation {
        updateSource(
          input: {
            id: "XYZ"
            name: "${testName}-updated"
          }) {
            id
            name
          }
        }
      `;
      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      await helpersAuditLog._gqlClient
        .query(query, null, headers)
        .catch(async (err) => {
          const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
            err
          );

          const expectedAuditLogItems = [
            {
              eventType: 'media_source',
              eventName: 'MediaSourceUpdate',
              actionResult: 'failure',
              actionDetails: `Failed to update source undefined`,
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

    it('should index audit log when deleting a media source', async () => {
      const query = `
    mutation {
      deleteSource(
        id: "${mediaSourceId}"
      ) {
          id
          message
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

      expect(result).toBeDefined();
      expect(result.deleteSource.id).toEqual(mediaSourceId);
      expect(result.deleteSource.message).toEqual('Source deleted');

      const expectedAuditLogItems = [
        {
          eventType: 'media_source', eventName: 'MediaSourceDelete', actionResult: 'success',
          actionDetails: `Deleted source ${`${testName}-updated`}`,
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

    it('should index audit log when failing to delete a media source', async () => {
      const query = `
    mutation {
      deleteSource(
        id: "XYZ"
      ) {
          id
          message
        }
      }
    `;
      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      await helpersAuditLog._gqlClient
        .query(query, null, headers)
        .catch(async (err) => {
          const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
            err
          );

          const expectedAuditLogItems = [
            {
              eventType: 'media_source',
              eventName: 'MediaSourceDelete',
              actionResult: 'failure',
              actionDetails: 'Failed to delete source undefined',
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
  }
);
