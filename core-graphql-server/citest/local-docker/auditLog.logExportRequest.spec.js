const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');

const OPTIONS = {
  configurableEvents: ['AuditLogExportCreate', 'AuditLogExportQuery', 'AuditLogExportCancel']
};

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

let helpersAuditLog;
let CONFIG_ADMIN_TOKEN, CONFIG_ADMIN_API_TOKEN;
describeif(
  (config.env === DEFAULT_ENV_TO_RUN_IN),
  'audit-log-logExportRequest @nightly',
  () => {
    let orgId, userName;
    beforeAll(async () => {
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(
        config,
        OPTIONS
      );
      const result = await helpersAuditLog.loginWithConfiguredUser();
      CONFIG_ADMIN_TOKEN = result.userLogin.token;
      orgId = result.userLogin.organization.id;
      userName = result.userLogin.user.name;
      CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
      expect(CONFIG_ADMIN_TOKEN).toBeDefined();
      expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
    });

    it('should index log when create audit log export request', async () => {
      const query = `mutation {
            createAuditLogExportRequest(filters: {
                dateTimeFilter: {
                    toDateTime: "2022-12-30T05:05:21.000Z"
                    fromDateTime: "2022-12-30T05:05:20.000Z"
                }
            }) {
                id
                filters
                status
                requestorId
                downloadUrl
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

      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportCreate',
          actionResult: 'success',
          actionName: 'create',
          actionDetails: `Created an audit log export ${result.createAuditLogExportRequest.id}`
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
      await cancelAuditLogExport(result.createAuditLogExportRequest.id);
    });

    it('should index log when failng to create audit log export request', async () => {
      // fromDateTime is greater than toDateTime, which should cause an error
      const query = `mutation {
            createAuditLogExportRequest(filters: {
                dateTimeFilter: {
                    toDateTime: "2022-12-30T05:05:21.000Z"
                    fromDateTime: "2023-12-30T05:05:20.000Z"
                }
            }) {
                id
                filters
                status
                requestorId
                downloadUrl
            }
        }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      let error;
      await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      ).catch((err) => {
        error = err;
        return null;
      });
      expect(error).toBeDefined();
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        error
      );      

      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportCreate',
          actionResult: 'failure',
          actionName: 'create',
          actionDetails: `Failed to create an audit log export`
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
    it('should index log when query audit log export by id', async () => {
      const query = `mutation {
            createAuditLogExportRequest(filters: {
                dateTimeFilter: {
                    toDateTime: "2022-12-30T05:05:22.000Z"
                    fromDateTime: "2022-12-30T05:05:21.000Z"
                }
            }) {
                id
                filters
                status
                requestorId
                downloadUrl
            }
        }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const resultCreation = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const id = resultCreation.createAuditLogExportRequest.id;
      const auditLogExportRequestQuery = `query {
          auditLogExportRequest(id:"${id}") {
              id
              filters
              status
              requestorId
              downloadUrl
            }
          }`;
      const correlationIDForQuery = helpersAuditLog.buildCorrelationID();
      const newHeader = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationIDForQuery
      );
      const result = await helpersAuditLog._gqlClient.query(
        auditLogExportRequestQuery,
        null,
        newHeader
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      expect(result).toBeDefined();

      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportQuery',
          actionResult: 'success',
          actionName: 'read',
          actionDetails: `Requested the audit log export ${id}`
        }
      ];
      await cancelAuditLogExport(id);
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationIDForQuery,
        expectedAuditLogItems
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID: correlationIDForQuery,
        correlationIDResponse
      });
    });
    it('should index log when query audit log export by id and internal token', async () => {
      const query = `mutation {
            createAuditLogExportRequest(filters: {
                dateTimeFilter: {
                    toDateTime: "2022-12-30T05:05:22.000Z"
                    fromDateTime: "2022-12-30T05:05:21.000Z"
                }
            }) {
                id
                filters
                status
                requestorId
                downloadUrl
            }
        }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_API_TOKEN,
        correlationID
      );
      const resultCreation = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const id = resultCreation.createAuditLogExportRequest.id;
      const auditLogExportRequestQuery = `query {
          auditLogExportRequest(id:"${id}") {
              id
              filters
              status
              requestorId
              downloadUrl
            }
          }`;
      const correlationIDForQuery = helpersAuditLog.buildCorrelationID();
      const newHeader = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_API_TOKEN,
        correlationIDForQuery
      );
      const result = await helpersAuditLog._gqlClient.query(
        auditLogExportRequestQuery,
        null,
        newHeader
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      expect(result).toBeDefined();

      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportQuery',
          actionResult: 'success',
          actionName: 'read',
          actionDetails: `Requested the audit log export ${id}`
        }
      ];
      await cancelAuditLogExport(id);
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationIDForQuery,
        expectedAuditLogItems
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID: correlationIDForQuery,
        correlationIDResponse
      });
    });
    it('should index log when query audit log export by orgId', async () => {
      const query = `mutation {
            createAuditLogExportRequest(filters: {
                dateTimeFilter: {
                    toDateTime: "2022-12-30T05:05:22.000Z"
                    fromDateTime: "2022-12-30T05:05:21.000Z"
                }
            }) {
                id
                filters
                status
                requestorId
                downloadUrl
            }
        }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const resultCreation = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const id = resultCreation.createAuditLogExportRequest.id;
      const auditLogExportRequestQuery = `query {
          auditLogExportRequestForOrg(organizationId:"${orgId}") {
            records {
              id
              filters
              status
              requestorId
              downloadUrl
            }
          }
          }`;

      const correlationIDForQuery = helpersAuditLog.buildCorrelationID();
      const newHeader = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationIDForQuery
      );
      const result = await helpersAuditLog._gqlClient.query(
        auditLogExportRequestQuery,
        null,
        newHeader
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      expect(result).toBeDefined();

      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportQuery',
          actionResult: 'success',
          actionName: 'read',          
          actionDetails: `Requested a list of audit log exports for organization ${orgId}`
        }
      ];
      await cancelAuditLogExport(id);
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationIDForQuery,
        expectedAuditLogItems
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID: correlationIDForQuery,
        correlationIDResponse
      });      
    });
    it('should index log when query audit log export by orgId and internal token', async () => {
      const query = `mutation {
            createAuditLogExportRequest(filters: {
                dateTimeFilter: {
                    toDateTime: "2022-12-30T05:05:22.000Z"
                    fromDateTime: "2022-12-30T05:05:21.000Z"
                }
            }) {
                id
                filters
                status
                requestorId
                downloadUrl
            }
        }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_API_TOKEN,
        correlationID
      );
      const resultCreation = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const id = resultCreation.createAuditLogExportRequest.id;
      const auditLogExportRequestQuery = `query {
          auditLogExportRequestForOrg(organizationId:"${orgId}") {
            records {
              id
              filters
              status
              requestorId
              downloadUrl
            }
          }
          }`;

      const correlationIDForQuery = helpersAuditLog.buildCorrelationID();
      const newHeader = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_API_TOKEN,
        correlationIDForQuery
      );
      const result = await helpersAuditLog._gqlClient.query(
        auditLogExportRequestQuery,
        null,
        newHeader
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      expect(result).toBeDefined();

      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportQuery',
          actionResult: 'success',
          actionName: 'read',          
          actionDetails: `Requested a list of audit log exports for organization ${orgId}`
        }
      ];
      await cancelAuditLogExport(id);
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationIDForQuery,
        expectedAuditLogItems
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID: correlationIDForQuery,
        correlationIDResponse
      });
    });
    it('should index log when query audit log export by orgId and statuses', async () => {
      const query = `mutation {
            createAuditLogExportRequest(filters: {
                dateTimeFilter: {
                    toDateTime: "2022-12-30T05:05:22.000Z"
                    fromDateTime: "2022-12-30T05:05:21.000Z"
                }
            }) {
                id
                filters
                status
                requestorId
                downloadUrl
            }
        }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const resultCreation = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );
      const id = resultCreation.createAuditLogExportRequest.id;
      const auditLogExportRequestQuery = `query {
          auditLogExportRequestForOrg(organizationId:"${orgId}", statuses: [PENDING, COMPLETED, FAILED]) {
            records {
              id
              filters
              status
              requestorId
              downloadUrl
            }
          }
          }`;

      const correlationIDForQuery = helpersAuditLog.buildCorrelationID();
      const newHeader = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationIDForQuery
      );
      const result = await helpersAuditLog._gqlClient.query(
        auditLogExportRequestQuery,
        null,
        newHeader
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      expect(result).toBeDefined();

      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportQuery',
          actionResult: 'success',
          actionName: 'read',          
          actionDetails: `Requested a list of audit log exports for organization ${orgId}`
        }
      ];
      await cancelAuditLogExport(id);
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationIDForQuery,
        expectedAuditLogItems
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID: correlationIDForQuery,
        correlationIDResponse
      });
    });
    it('should index log when query audit log export by invalid id', async () => {
      const invalidId = `99923512-f485-4c12-8576-2b4cf418657d`;
      const auditLogExportRequestQuery = `query {
          auditLogExportRequest(id:"${invalidId}") {
              id
              filters
              status
              requestorId
              downloadUrl
            }
          }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const newHeader = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      try {
        const result = await helpersAuditLog._gqlClient.query(
          auditLogExportRequestQuery,
          null,
          newHeader
        );
      } catch (error) {
        expect(error).toBeDefined();
      }

      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportQuery',
          actionResult: 'failure',
          actionName: 'read',
          actionDetails: `Failed to request the audit log export undefined`
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
    it('should index log when query audit log export by invalid id and internal token', async () => {
      const invalidId = `99923512-f485-4c12-8576-2b4cf418657d`;
      const auditLogExportRequestQuery = `query {
          auditLogExportRequest(id:"${invalidId}") {
              id
              filters
              status
              requestorId
              downloadUrl
            }
          }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const newHeader = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_API_TOKEN,
        correlationID
      );
      try {
        const result = await helpersAuditLog._gqlClient.query(
          auditLogExportRequestQuery,
          null,
          newHeader
        );
      } catch (error) {
        expect(error).toBeDefined();
      }

      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportQuery',
          actionResult: 'failure',
          actionName: 'read',
          actionDetails: `Failed to request the audit log export undefined`
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
    it('should index log when query audit log export by invalid orgId', async () => {
      const invalidOrgId = `768ERROR2`;
      const auditLogExportRequestQuery = `query {
        auditLogExportRequestForOrg(organizationId:"${invalidOrgId}") {
            records {
              id
              filters
              status
              requestorId
              downloadUrl
            }
          }
        }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const newHeader = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      try {
        const result = await helpersAuditLog._gqlClient.query(
          auditLogExportRequestQuery,
          null,
          newHeader
        );
      } catch (error) {
        expect(error).toBeDefined();
      }

      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportQuery',
          actionResult: 'failure',
          actionName: 'read',
          actionDetails: `Failed to request a list of audit log exports for organization ${invalidOrgId}`
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

    it('should index log when cancelling audit log export request', async () => {
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN        
      );
      const query = `mutation {
            createAuditLogExportRequest(filters: {
                dateTimeFilter: {
                    toDateTime: "2022-12-30T05:05:21.000Z"
                    fromDateTime: "2022-12-30T05:05:20.000Z"
                }
            }) {
                id
                filters
                status
                requestorId
                downloadUrl
            }
        }`;
      
      // This test races the export worker. cancelAuditLogExportRequest only
      // succeeds while the request is 'pending'/'in_progress' (dalPlatform.js
      // cancelAuditLogExportRequestDB); once it reaches a terminal state the DAL takes its
      // `cannot_cancel` branch and emits a FAILURE-flavoured AuditLogExportCancel event
      // ("Failed to cancel ... because it is not in a cancellable state") instead of the success
      // event asserted below. The filter here matches nothing in that case, so the test used to
      // burn the full ES poll window and fail with a misleading "could not satisfy filterItems".
      //
      // So retry create+cancel until a cancel actually succeeds, and assert that
      // explicitly: if the race can never be won the test now fails in seconds with a clear
      // reason rather than after polling for an event that was never written.
      // NOTE: the persisted row is NOT evidence of the outcome — a successful cancel writes
      // 'cancelled', but the worker then overwrites it with 'completed'/'failed'.
      const MAX_CANCEL_ATTEMPTS = 5;
      let id;
      let respose;
      let correlationID;
      let cancelSucceeded = false;

      for (
        let attempt = 1;
        attempt <= MAX_CANCEL_ATTEMPTS && !cancelSucceeded;
        attempt++
      ) {
        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers
        );

        id = result.createAuditLogExportRequest.id;
        const auditLogExportRequestCancel = `mutation cancelAuditExport {
        cancelAuditLogExportRequest(id: "${id}")
      }`;

        // A fresh correlationID per attempt, so the audit assertion below only ever sees events
        // from the attempt that actually won the race.
        correlationID = helpersAuditLog.buildCorrelationID();
        const newHeader = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID
        );
        respose = await helpersAuditLog._gqlClient.query(
          auditLogExportRequestCancel,
          null,
          newHeader
        );
        expect(respose).toBeDefined();
        // The mutation returns a boolean: true only when a row moved to 'cancelled'.
        cancelSucceeded = respose.cancelAuditLogExportRequest === true;
      }

      expect(
        cancelSucceeded,
        `cancelAuditLogExportRequest never returned true in ${MAX_CANCEL_ATTEMPTS} attempts — the export reached a terminal state before every cancel, so no success audit event is emitted`
      ).toBe(true);

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        respose
      );
      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportCancel',
          actionResult: 'success',
          actionDetails: `Cancelled the audit log export ${id}`                    
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

    it('should index log when failing to cancel audit log export request', async () => {
      const auditLogExportRequestQuery = `mutation cancelAuditExport {
        cancelAuditLogExportRequest(id: "1") 
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const newHeader = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      let error;
      try {
        await helpersAuditLog._gqlClient.query(
          auditLogExportRequestQuery,
          null,
          newHeader
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        error
      );      
      const expectedAuditLogItems = [
        {
          eventType: 'export',
          eventName: 'AuditLogExportCancel',
          actionResult: 'failure',
          actionDetails: `Failed to cancel the audit log export undefined`
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

async function cancelAuditLogExport(id) {
  // cancel export request
  const cancelAuditLogQuery = `
        mutation {
          cancelAuditLogExportRequest(id: "${id}") 
        }
    `;
  const correlationIDForCancel = helpersAuditLog.buildCorrelationID();
  const headerForCancel = helpersAuditLog.buildHeadersWithBearerToken(
    CONFIG_ADMIN_TOKEN,
    correlationIDForCancel
  );
  await helpersAuditLog._gqlClient.query(
    cancelAuditLogQuery,
    null,
    headerForCancel
  );
}
