const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  configurableEvents: [
    'ApplicationCreate',
    'ApplicationUpdate',
    'ApplicationDelete'
  ]
};

let applicationId;

const testName = 'citest_application_' + Date.now();

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif(
  (config.env === DEFAULT_ENV_TO_RUN_IN),
  'audit-log-application',
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

    it('should index audit log when creating an application', async () => {
      const query = `
      mutation {
        createApplication(
          input: {
            name: "${testName}"
            checkPermissions: false
            url: "https://www.veritone.com/"
          }) {
            id
            name
            url
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
      expect(result.createApplication.id).toBeDefined();
      applicationId = result.createApplication.id;
      expect(result.createApplication.name).toEqual(testName);
      expect(result.createApplication.url).toEqual('https://www.veritone.com/');

      const expectedAuditLogItems = [
        {
          eventType: 'application',
          eventName: 'ApplicationCreate',
          actionResult: 'success',
          actionName: 'create'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        /^Created application citest_application_\d+$/
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    it('should index audit log when failing to create an application (conflicting name)', async () => {
      const query = `
      mutation {
        createApplication(
          input: {
            name: "${testName}"
            checkPermissions: false
            url: "https://www.veritone.com/"
          }) {
            id
            name
            url
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
              eventType: 'application',
              eventName: 'ApplicationCreate',
              actionResult: 'failure',
              actionName: 'create'
            }
          ];
          const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
            correlationID,
            expectedAuditLogItems
          );
          expectedAuditLogItems[0].actionDetails = expect.stringMatching(
            /^Failed to create application/
          );
          validateExpectedEvents({
            auditLogItems,
            expectedAuditLogItems,
            correlationID,
            correlationIDResponse
          });
        });
    });

    it('should index audit log when updating an application', async () => {
      const query = `
      mutation {
        updateApplication(
          input: {
            id: "${applicationId}"
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
      expect(result.updateApplication.id).toBeDefined();
      expect(result.updateApplication.name).toEqual(`${testName}-updated`);

      const expectedAuditLogItems = [
        {
          eventType: 'application',
          eventName: 'ApplicationUpdate',
          actionResult: 'success',
          actionName: 'update'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        /^Updated application citest_application_\d+-updated$/
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    it('should index audit log when failing to update an application', async () => {
      const query = `
      mutation {
        updateApplication(
          input: {
            id: "${(Math.random() * 1000).toFixed()}"
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
              eventType: 'application',
              eventName: 'ApplicationUpdate',
              actionResult: 'failure',
              actionName: 'update'
            }
          ];
          const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
            correlationID,
            expectedAuditLogItems
          );
          expectedAuditLogItems[0].actionDetails = expect.stringMatching(
            /^Failed to update application/
          );
          validateExpectedEvents({
            auditLogItems,
            expectedAuditLogItems,
            correlationID,
            correlationIDResponse
          });
        });
    });

    it('should index audit log when deleting an application', async () => {
      const query = `
      mutation {
        deleteApplication(
          id: "${applicationId}"
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
      expect(result.deleteApplication.id).toBeDefined();
      expect(result.deleteApplication.message).toBeNull();

      const expectedAuditLogItems = [
        {
          eventType: 'application',
          eventName: 'ApplicationDelete',
          actionResult: 'success'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        /^Deleted application/
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    it('should index audit log when failing to delete an application', async () => {
      const query = `
      mutation {
        deleteApplication(
          id: "${(Math.random() * 1000).toFixed()}"
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
              eventType: 'application',
              eventName: 'ApplicationDelete',
              actionResult: 'failure'
            }
          ];
          const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
            correlationID,
            expectedAuditLogItems
          );
          expectedAuditLogItems[0].actionDetails = expect.stringMatching(
            /^Failed to delete application/
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
