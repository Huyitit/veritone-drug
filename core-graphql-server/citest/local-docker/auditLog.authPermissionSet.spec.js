const uuid = require('uuid');
const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents,
} = require('./helpers.auditLog.js');

const OPTIONS = {
  baselineEvents: [
    'auth_permission_set_create',
    'auth_permission_set_update',
    'auth_permission_set_delete',
  ],
  configurableEvents: [
    'LoginSucceeded'
  ],
};

const citestMarker = global.citestMarker || 'citest-should-delete';

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

let testPermissionSetId;
let testPermissionSetName;
let organizationId;

describeif(
  config.env === DEFAULT_ENV_TO_RUN_IN,
  'audit-log-auth-permission-set',
  () => {
    let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;

    beforeAll(async () => {
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(
        config,
        OPTIONS,
      );

      const result = await helpersAuditLog.loginWithConfiguredUser();

      CONFIG_ADMIN_TOKEN = result.userLogin.token;
      CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;

      expect(CONFIG_ADMIN_TOKEN).toBeDefined();
      expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();

      organizationId = result.userLogin.organization.id;
    });

    describe('should index audit log when', () => {
      it('creating an auth permission set - success', async () => {
        const query = `mutation authPermissionSetCreate {
          authPermissionSetCreate(
            input: {
              organizationID: "${organizationId}"
              name: "${citestMarker}-auth-permission-set-${Date.now()}"
              description: "test auth permission set"
              permissions: [
                AIWARE_SDO_CREATE
                AIWARE_SDO_UPDATE
                AIWARE_SDO_READ
                AIWARE_SDO_DELETE
                AIWARE_SCHEMA_UPDATE
              ]
            }
          ) {
            id
            name
            permissions
          }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers,
        );

        testPermissionSetId = result.authPermissionSetCreate.id;
        testPermissionSetName = result.authPermissionSetCreate.name;

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();
        expect(testPermissionSetId).toBeDefined();
        expect(testPermissionSetName).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthPermissionSetCreate',
            actionResult: 'success',
            actionDetails: `Created AuthPermissionSet ${testPermissionSetId}`,
          },
        ];

        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('creating an auth permission set - failure', async () => {
        const invalidRoleId = uuid.v4();
        const query = `mutation authPermissionSetCreate {
          authPermissionSetCreate(
            input: {
              organizationID: "${organizationId}"
              roleID: "${invalidRoleId}" 
              name: "${testPermissionSetName}"
              description: "test duplicate auth permission set"
              permissions: [
                AIWARE_SDO_CREATE
                AIWARE_SDO_UPDATE
                AIWARE_SDO_READ
                AIWARE_SDO_DELETE
                AIWARE_SCHEMA_UPDATE
              ]
            }
          ) {
            id
            name
            permissions
          }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        let error;
        let result;

        try {
          result = await helpersAuditLog._gqlClient.query(query, null, headers);
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain('The object could not be created because the input references an object ID that does not exist');

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthPermissionSetCreate',
            actionResult: 'failure',
            actionDetails: 'Failed to create AuthPermissionSet',
          },
        ];

        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('updating an auth permission set - success', async () => {
        const query = `mutation authPermissionSetUpdate {
          authPermissionSetUpdate(
            input: {
              id: "${testPermissionSetId}"
              permissions: [AIWARE_JOB_READ]
            }
          ) {
            id
            permissions
          }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers,
        );

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthPermissionSetUpdate',
            actionResult: 'success',
            actionDetails: `Updated AuthPermissionSet ${testPermissionSetId}`,
          },
        ];

        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('updating an auth permission set - failure', async () => {
        const missingPermissionSetId = uuid.v4();

        const query = `mutation authPermissionSetUpdate {
          authPermissionSetUpdate(
            input: {
              id: "${missingPermissionSetId}"
              permissions: [AIWARE_JOB_READ]
            }
          ) {
            id
            permissions
          }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        let error;
        let result;

        try {
          result = await helpersAuditLog._gqlClient.query(query, null, headers);
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain('Authorization permission set not found');

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthPermissionSetUpdate',
            actionResult: 'failure',
            actionDetails: `Failed to update AuthPermissionSet ${missingPermissionSetId}`,
          },
        ];

        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('deleting an auth permission set - success', async () => {
        const query = `mutation authPermissionSetDelete {
          authPermissionSetDelete(id: "${testPermissionSetId}") {
            id
          }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers,
        );

        const deletedPermissionSetId = result.authPermissionSetDelete.id;
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();
        expect(deletedPermissionSetId).toEqual(testPermissionSetId);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthPermissionSetDelete',
            actionResult: 'success',
            actionDetails: `Deleted AuthPermissionSet ${testPermissionSetId}`,
          },
        ];

        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('deleting an auth permission set - failure', async () => {
        const missingPermissionSetId = uuid.v4();

        const query = `mutation authPermissionSetDelete {
          authPermissionSetDelete(id: "${missingPermissionSetId}") {
            id
          }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        let error;
        let result;

        try {
          result = await helpersAuditLog._gqlClient.query(query, null, headers);
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain('Authorization permission set not found');

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthPermissionSetDelete',
            actionResult: 'failure',
            actionDetails: `Failed to delete AuthPermissionSet ${missingPermissionSetId}`,
          },
        ];

        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });
    });
  },
);