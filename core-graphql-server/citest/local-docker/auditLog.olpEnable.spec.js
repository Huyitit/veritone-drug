const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents,
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  baselineEvents: ['olp_enable', 'olp_disable'],
  configurableEvents: ['OrganizationCreate', 'OrganizationUpdate'],
};

const citestMarker = global.citestMarker || 'citest-should-delete';

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

function buildOrganizationName(testName) {
  return `${citestMarker}-olp-enable-${testName}-${Date.now()}`;
}

function buildOLPEnableAuditItem({
  organizationId,
  organizationName,
  isEnabled,
}) {
  const actionDetails = isEnabled
    ? `Enabled OLP for organization ${organizationName} (${organizationId})`
    : `Disabled OLP for organization ${organizationName} (${organizationId})`;

  return {
    actionName: 'update',
    actionResult: 'success',
    actionDetails,
    targetId: _.toString(organizationId),
    targetType: 'tt_OLP',
    eventType: 'olp',
    // enable/disable are distinct audit events
    eventName: isEnabled ? 'OLPEnable' : 'OLPDisable',
  };
}

function buildOrganizationCreateAuditItem({ organizationId, organizationName }) {
  return {
    actionName: 'create',
    actionResult: 'success',
    actionDetails: `Created organization ${organizationName} (${organizationId})`,
    targetId: _.toString(organizationId),
    targetType: 'tt_Organization',
    eventType: 'organization',
    eventName: 'OrganizationCreate',
  };
}

function buildOrganizationUpdateAuditItem({ organizationId, organizationName }) {
  return {
    actionName: 'update',
    actionResult: 'success',
    actionDetails: expect.stringMatching(
      new RegExp(
        `^Updated organization ${_.escapeRegExp(
          organizationName,
        )} \\(${organizationId}\\) with payload `,
      ),
    ),
    targetId: _.toString(organizationId),
    targetType: 'tt_Organization',
    eventType: 'organization',
    eventName: 'OrganizationUpdate',
  };
}

describeif(
  config.env === DEFAULT_ENV_TO_RUN_IN,
  'audit-log-olp-enable',
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
    });

    async function expectAuditLogItems({
      correlationID,
      correlationIDResponse,
      expectedAuditLogItems,
    }) {
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
    }

    it('should index OLPEnable and OrganizationCreate when creating an OLP-enabled organization', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      const organizationName = buildOrganizationName('create-enabled');

      const result = await helpersAuditLog.createOrganizationWithOLPEnabled(
        CONFIG_ADMIN_TOKEN,
        correlationID,
        organizationName,
      );

      const correlationIDResponse =
        helpersAuditLog.getCorrelationIDFromResponse(result);

      expect(result).toBeDefined();
      expect(result.createOrganization).toBeDefined();

      const organization = result.createOrganization;

      const expectedAuditLogItems = [
        buildOLPEnableAuditItem({
          organizationId: organization.id,
          organizationName: organization.name,
          isEnabled: true,
        }),
        buildOrganizationCreateAuditItem({
          organizationId: organization.id,
          organizationName: organization.name,
        }),
      ];

      await expectAuditLogItems({
        correlationID,
        correlationIDResponse,
        expectedAuditLogItems,
      });
    });

    it('should index OLPEnable and OrganizationUpdate when enabling OLP for an existing organization', async () => {
      const organizationName = buildOrganizationName('update-enable');

      const createResult =
        await helpersAuditLog.createOrganizationWithOLPDisabled(
          CONFIG_ADMIN_TOKEN,
          null,
          organizationName,
        );

      expect(createResult).toBeDefined();
      expect(createResult.createOrganization).toBeDefined();

      const organization = createResult.createOrganization;

      const correlationID = helpersAuditLog.buildCorrelationID();

      const updateResult = await helpersAuditLog.enableOLPForOrganization(
        CONFIG_ADMIN_TOKEN,
        organization.id,
        organization.name,
        correlationID,
      );

      const correlationIDResponse =
        helpersAuditLog.getCorrelationIDFromResponse(updateResult);

      expect(updateResult).toBeDefined();
      expect(updateResult.updateOrganization).toBeDefined();
      expect(updateResult.updateOrganization.id).toEqual(organization.id);

      const expectedAuditLogItems = [
        buildOLPEnableAuditItem({
          organizationId: organization.id,
          organizationName: organization.name,
          isEnabled: true,
        }),
        buildOrganizationUpdateAuditItem({
          organizationId: organization.id,
          organizationName: organization.name,
        }),
      ];

      await expectAuditLogItems({
        correlationID,
        correlationIDResponse,
        expectedAuditLogItems,
      });
    });

    it('should index OLPDisable and OrganizationUpdate when disabling OLP for an existing organization', async () => {
      const correlationIDForCreate = helpersAuditLog.buildCorrelationID();
      const organizationName = buildOrganizationName('update-disable');

      const createResult = await helpersAuditLog.createOrganizationWithOLPEnabled(
        CONFIG_ADMIN_TOKEN,
        correlationIDForCreate,
        organizationName,
      );

      expect(createResult).toBeDefined();
      expect(createResult.createOrganization).toBeDefined();

      const organization = createResult.createOrganization;

      const correlationID = helpersAuditLog.buildCorrelationID();

      const updateResult = await helpersAuditLog.disableOLPForOrganization(
        CONFIG_ADMIN_TOKEN,
        organization.id,
        organization.name,
        correlationID,
      );

      const correlationIDResponse =
        helpersAuditLog.getCorrelationIDFromResponse(updateResult);

      expect(updateResult).toBeDefined();
      expect(updateResult.updateOrganization).toBeDefined();
      expect(updateResult.updateOrganization.id).toEqual(organization.id);

      const expectedAuditLogItems = [
        buildOLPEnableAuditItem({
          organizationId: organization.id,
          organizationName: organization.name,
          isEnabled: false,
        }),
        buildOrganizationUpdateAuditItem({
          organizationId: organization.id,
          organizationName: organization.name,
        }),
      ];

      await expectAuditLogItems({
        correlationID,
        correlationIDResponse,
        expectedAuditLogItems,
      });
    });
  },
);