const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  DEFAULT_CI_TEST_SERVICE_TOKEN,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents,
  validateExpectedEmailEvent
} = require('./helpers.auditLog.js');
const _ = require('lodash');

// VE-25093: swap the legacy Admin app for its successor, the aiWARE Desktop app. The platform now
// provisions the Desktop app to newly created orgs by default (feature flag
// `enableDefaultDesktopApp`, set in jest.global.setup.js). When the flag is off we fall back to the
// helper's legacy Admin defaults (_DEFAULT_applicationID / _DEFAULT_roleID in helpers.auditLog.js).
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
// aiWARE Desktop application, and its "aiWARE Administrator" role (the admin-equivalent of the
// legacy Admin app's "Default App Access" role).
const DESKTOP_APP_ID = 'e4739d44-53d2-4153-b55f-5e246fc989b1';
const DESKTOP_ROLE_ID = '032218c3-d47e-4287-9d16-7bb867c01266';

const OPTIONS = {
  configurableEvents: [
    'IntegrationSettings',
    'OrganizationCreate',
    'OrganizationUpdate',
    'OrganizationDelete',
    'OrganizationInvitationCreate',
    'OrganizationInvitationAccept',
    'OrganizationInvitationReject',
    'OrganizationRequestCreate',
    'OrganizationRequestAccept',
    'OrganizationRequestReject',
    'OrganizationInvitationRevoke',
    'SendEmail'
  ],
  ...(isDesktopAppEnabled
    ? { applicationID: DESKTOP_APP_ID, roleID: DESKTOP_ROLE_ID }
    : {})
};

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif(
  (config.env === DEFAULT_ENV_TO_RUN_IN),
  'audit-log-organization',
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

    it.skip('TEMPLATE', async () => {
      // ARRANGE
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;

      // ACT
      result = await helpersAuditLog.approveInvitationRequest(
        CONFIG_ADMIN_TOKEN,
        organizationInviteID,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      // ASSERT
      // START WITH undefined as the log will show what has been indexed
      const expectedAuditLogItems = undefined;
      //[
      //   {
      //     eventType: 'organizationInvite',
      //     eventName: 'OrganizationRequestCreate'
      //   }
      // ];
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

    it('should index audit log when creating organization', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      const result = await helpersAuditLog.createOrganization(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      const organziationID = result.createOrganization.id;
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'success',
          targetId: organziationID,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organization',
          eventName: 'OrganizationCreate',
          organizationName: 'Veritone, Inc.'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );

      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        /^Created organization CI-TESTING organization \(\d+\)$/
      );

      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    it('should index audit log when failing to create organization', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();

      let result, error;
      try {
        result = await helpersAuditLog.createOrganization(
          CONFIG_ADMIN_TOKEN,
          correlationID,
          null,
          'orgGuid'
        );
      } catch (e) {
        error = e;
      }

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        error
      );
      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'failure',
          actionDetails: `Failed to create organization`,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organization',
          eventName: 'OrganizationCreate',
          organizationName: 'Veritone, Inc.'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        /^Failed to create organization*$/
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    it('should index audit log when fetching integration settings', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      const integrationId = helpersAuditLog.createRandomString(
        'test-integration-settings'
      );
      await helpersAuditLog.createOrganizationIntegrationConfig(
        CONFIG_ADMIN_TOKEN,
        integrationId
      );
      const result = await helpersAuditLog
        .getOrganizationIntegrationConfig(
          CONFIG_ADMIN_API_TOKEN,
          integrationId,
          correlationID
        )
        .expect(200);
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'read',
          actionResult: 'success',
          actionDetails: `Requested integration settings for ${integrationId}`,
          targetId: integrationId,
          targetType: 'tt_Organization',
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organization',
          eventName: 'IntegrationSettings',
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

    it('should index audit log when fetching integration settings and Bearer token NOT-EXISTS', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      const integrationId = helpersAuditLog.createRandomString(
        'test-integration-settings'
      );
      await helpersAuditLog.createOrganizationIntegrationConfig(
        CONFIG_ADMIN_TOKEN,
        integrationId
      );
      const result = await helpersAuditLog
        .getOrganizationIntegrationConfig(
          'NOT-EXISTS',
          integrationId,
          correlationID
        )
        .expect(401);
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'read',
          actionResult: 'failure',
          actionDetails: `Requested integration settings for ${integrationId}`,
          targetId: integrationId,
          targetType: 'tt_Organization',
          userName: 'NOT-EXISTS',
          eventType: 'organization',
          eventName: 'IntegrationSettings'
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

    it('should index audit log when fetching integration settings and integrationID does-not-exist', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      const integrationId = helpersAuditLog.createRandomString(
        'does-not-exist'
      );
      const result = await helpersAuditLog
        .getOrganizationIntegrationConfig(
          CONFIG_ADMIN_API_TOKEN,
          integrationId,
          correlationID
        )
        .expect(404);
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'read',
          actionResult: 'failure',
          actionDetails: `Requested integration settings for ${integrationId}`,
          targetId: integrationId,
          targetType: 'tt_Organization',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organization',
          eventName: 'IntegrationSettings',
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

    it('should index audit log when fetching integration settings and api key is not authorized', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      const integrationId = helpersAuditLog.createRandomString(
        'test-integration-settings'
      );
      await helpersAuditLog.createOrganizationIntegrationConfig(
        CONFIG_ADMIN_TOKEN,
        integrationId
      );
      const tokenThatHasRoleButNotAPartOfOrganization = DEFAULT_CI_TEST_SERVICE_TOKEN;
      const result = await helpersAuditLog
        .getOrganizationIntegrationConfig(
          tokenThatHasRoleButNotAPartOfOrganization,
          integrationId,
          correlationID
        )
        .expect(403);
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'read',
          actionResult: 'failure',
          actionDetails: `Requested integration settings for ${integrationId}`,
          targetId: integrationId,
          targetType: 'tt_Organization',
          userName: tokenThatHasRoleButNotAPartOfOrganization,
          organizationId: 'n/a',
          eventType: 'organization',
          eventName: 'IntegrationSettings'
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

    it('should index audit log when updating organization with the same name', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      const organizationName = result.createOrganization.name;
      result = await helpersAuditLog.updateOrganization(
        CONFIG_ADMIN_TOKEN,
        organizationId,
        organizationName,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'organization',
          eventName: 'OrganizationUpdate'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        /^Updated organization CI-TESTING organization \(\d+\) with payload \{.*\}$/
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    it('should index audit log when failing to update organization', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      const organizationName = result.createOrganization.name;

      let updateResult, error;
      try {
        updateResult = await helpersAuditLog.updateOrganization(
          CONFIG_ADMIN_TOKEN,
          organizationId,
          organizationName,
          correlationID,
          'invalid-status'
        );
      } catch (e) {
        error = e;
      }

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        updateResult
      );
      const expectedAuditLogItems = [
        {
          eventType: 'organization',
          eventName: 'OrganizationUpdate'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        /^Failed to update organization \d+ with payload \{.*\}$/
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    it('should index audit log when updating organization to a new name', async () => {
      // Renaming an org also renames its CMS application, whose application_name is unique
      // (_ix_sso_application@application_name). Use a per-run unique name so repeated runs against
      // the same DB don't collide on that constraint.
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      const newOrganizationName = helpersAuditLog.createRandomString(
        'CI-TESTING updating organization'
      );
      result = await helpersAuditLog.updateOrganization(
        CONFIG_ADMIN_TOKEN,
        organizationId,
        newOrganizationName,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'organization',
          eventName: 'OrganizationUpdate'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        new RegExp(
          `^Updated organization ${_.escapeRegExp(
            newOrganizationName
          )} \\(\\d+\\) with payload \\{.*\\}$`
        )
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    it('should index audit log when user invite is created', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      const secondOrganizationName = result.createOrganization.name;

      result = await helpersAuditLog.createOrganizationInvite(
        CONFIG_ADMIN_TOKEN,
        secondOrganizationId,
        userData.email,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'success',
          actionDetails: `Invited ${userData.email} to organization ${secondOrganizationName} (${secondOrganizationId})`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationCreate',
          organizationName: 'Veritone, Inc.'
        },
        {
          actionName: 'SendEmail',
          actionResult: 'success',
          targetId: userData.email,
          eventType: 'media',
          eventName: 'SendEmail'
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

    it('should index audit log when user invite is failed to create', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      let err;
      try {
        result = await helpersAuditLog.createOrganizationInvite(
          CONFIG_ADMIN_TOKEN,
          secondOrganizationId,
          'invalid_email',
          correlationID
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'failure',
          actionDetails: `Failed to invite invalid_email to organization Veritone, Inc. (${secondOrganizationId})`,
          targetId: 'invalid_email',
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationCreate',
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

    it('should index audit log when user has accepted invitation', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganizationInvite(
        CONFIG_ADMIN_TOKEN,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;
      result = await helpersAuditLog.loginUser(userData.email, config.password);
      userData.token = result.userLogin.token;

      result = await helpersAuditLog.acceptInvite(
        userData.token,
        organizationInviteID,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Accepted an invitation to organization CI-TESTING organization (${secondOrganizationId})`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: userData.email,
          organizationId: firstOrganizationId,
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationAccept',
          organizationName: 'CI-TESTING organization'
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

    it('should index audit log when user has failed to accept invitation', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );

      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganizationInvite(
        CONFIG_ADMIN_TOKEN,
        secondOrganizationId,
        userData.email
      );

      result = await helpersAuditLog.loginUser(userData.email, config.password);
      userData.token = result.userLogin.token;

      let err;
      try {
        result = await helpersAuditLog.acceptInvite(
          userData.token,
          'invalid_org_id',
          correlationID
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to accept an invitation to organization CI-TESTING organization (${firstOrganizationId})`,
          // targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: userData.email,
          // organizationId: firstOrganizationId,
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationAccept',
          organizationName: 'CI-TESTING organization'
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
        correlationIDResponse: null
      });
    });

    it('should index audit log when user has rejected invitation', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganizationInvite(
        CONFIG_ADMIN_TOKEN,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;
      result = await helpersAuditLog.loginUser(userData.email, config.password);
      userData.token = result.userLogin.token;

      result = await helpersAuditLog.rejectInvite(
        userData.token,
        organizationInviteID,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Rejected an invitation to organization CI-TESTING organization (${secondOrganizationId})`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: userData.email,
          organizationId: firstOrganizationId,
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationReject',
          organizationName: 'CI-TESTING organization'
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

    it('should index audit log when user has failed to reject invitation', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganizationInvite(
        CONFIG_ADMIN_TOKEN,
        secondOrganizationId,
        userData.email
      );

      result = await helpersAuditLog.loginUser(userData.email, config.password);
      userData.token = result.userLogin.token;

      let err;
      try {
        result = await helpersAuditLog.rejectInvite(
          userData.token,
          'invalid_org_id',
          correlationID
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to reject an invitation to organization CI-TESTING organization (${firstOrganizationId})`,
          targetType: 'tt_Organization',
          userName: userData.email,
          organizationId: firstOrganizationId,
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationReject',
          organizationName: 'CI-TESTING organization'
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
        correlationIDResponse: null
      });
    });

    it('should index audit log when a non admin invites a user', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'success',
          actionDetails: `Sent an organization invitation request for CI-TESTING organization (${secondOrganizationId}) to ${userData.email}`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: userDataNotAdmin.email,
          organizationId: secondOrganizationId,
          eventType: 'organizationInvite',
          eventName: 'OrganizationRequestCreate',
          organizationName: 'CI-TESTING organization'
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

    it('should index audit log when a non-admin failed to invite an user', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      let err;
      try {
        result = await helpersAuditLog.createOrganizationInvite(
          userTokenNotAdmin,
          secondOrganizationId,
          'invalid_email',
          correlationID
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();

      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'failure',
          actionDetails: `Failed to send an organization invitation request for CI-TESTING organization (${secondOrganizationId}) to invalid_email`,
          targetId: 'invalid_email',
          targetType: 'tt_Organization',
          userName: userDataNotAdmin.email,
          organizationId: secondOrganizationId,
          eventType: 'organizationInvite',
          eventName: 'OrganizationRequestCreate',
          organizationName: 'CI-TESTING organization'
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
        correlationIDResponse: null
      });
    });

    it('should index audit log when a non admin invites a user and an admin approves the invite', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;

      result = await helpersAuditLog.approveInvitationRequest(
        CONFIG_ADMIN_TOKEN,
        organizationInviteID,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Accepted an organization request from ${userData.email}`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organizationInvite',
          eventName: 'OrganizationRequestAccept',
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

      const expectedEmailEvent = [
        {
          actionName: 'SendEmail',
          actionResult: 'success',
          targetId: userData.email,
          eventType: 'media',
          eventName: 'SendEmail'
        }
      ];
    });

    it('should index audit log when a non admin invites a user and an admin failed to approve the invite', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );

      let err;
      try {
        result = await helpersAuditLog.approveInvitationRequest(
          CONFIG_ADMIN_TOKEN,
          'invalid_org_id',
          correlationID
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to accept an organization request from undefined`,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organizationInvite',
          eventName: 'OrganizationRequestAccept',
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
        correlationIDResponse: null
      });
    });

    it('should index audit log when a non admin invites a user and an admin revoke the invite', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      const secondOrganizationName = result.createOrganization.name;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;

      result = await helpersAuditLog.rejectInvite(
        CONFIG_ADMIN_TOKEN,
        organizationInviteID,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Revoked an organization invitation to ${secondOrganizationName} (${secondOrganizationId}) from user ${newUser.firstName} ${newUser.lastName}`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationRevoke',
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

    it('should index audit log when a non admin invites a user and an admin failed to revoke the invite', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );

      let err;
      try {
        result = await helpersAuditLog.rejectInvite(
          CONFIG_ADMIN_TOKEN,
          'invalid_org_id',
          correlationID
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationRevoke',
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
        correlationIDResponse: null
      });
    });

    it('should index audit log when a non admin invites a user and an admin approves the invite and user accepts the invite', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.loginUser(userData.email, config.password);
      userData.token = result.userLogin.token;
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;

      await helpersAuditLog.approveInvitationRequest(
        CONFIG_ADMIN_TOKEN,
        organizationInviteID
      );

      result = await helpersAuditLog.acceptInvite(
        userData.token,
        organizationInviteID,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Accepted an invitation to organization CI-TESTING organization (${secondOrganizationId})`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: userData.email,
          organizationId: firstOrganizationId,
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationAccept',
          organizationName: 'CI-TESTING organization'
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

      const expectedEmailEvent = [
        {
          actionName: 'SendEmail',
          actionResult: 'success',
          targetId: userData.email,
          eventType: 'media',
          eventName: 'SendEmail'
        }
      ];
    });

    it('should index audit log when a non admin invites a user and an admin approves the invite and user rejects the invite', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.loginUser(userData.email, config.password);
      userData.token = result.userLogin.token;
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;

      await helpersAuditLog.approveInvitationRequest(
        CONFIG_ADMIN_TOKEN,
        organizationInviteID
      );

      result = await helpersAuditLog.rejectInvite(
        userData.token,
        organizationInviteID,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Rejected an invitation to organization CI-TESTING organization (${secondOrganizationId})`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: userData.email,
          userAgent: 'core-graphql-server test',
          organizationId: firstOrganizationId,
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationReject',
          organizationName: 'CI-TESTING organization'
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

    it('should index audit log when a non admin invites a user and an admin rejects the invite', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      const secondOrganizationName = result.createOrganization.name;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;

      result = await helpersAuditLog.rejectInvitationRequest(
        CONFIG_ADMIN_TOKEN,
        organizationInviteID,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Rejected an organization request from ${userData.email}`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          eventType: 'organizationInvite',
          eventName: 'OrganizationRequestReject',
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

    it('should index audit log when a non admin invites a user and an admin failed to reject the invite', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );

      let err;
      try {
        result = await helpersAuditLog.rejectInvitationRequest(
          CONFIG_ADMIN_TOKEN,
          'invalid_org_id',
          correlationID
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          actionDetails: `Failed to reject an organization request from undefined`,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          eventType: 'organizationInvite',
          eventName: 'OrganizationRequestReject',
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
        correlationIDResponse: null
      });
    });

    it('should index audit log when failing to delete organization', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.deleteOrganization(
        correlationID,
        CONFIG_ADMIN_TOKEN,
        '2147483647'
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'delete',
          actionResult: 'failure',
          eventType: 'organization',
          eventName: 'OrganizationDelete'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        /^Failed to delete organization (undefined|\d+) \(2147483647\)$/
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    it('should index audit log when successfully deleting an organization', async () => {
      let result = await helpersAuditLog.createOrganization(
        CONFIG_ADMIN_TOKEN,
        null,
        'TEST_ORG_DELETED_AFTER_TEST'
      );
      const organziationID = result.createOrganization.id;
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.deleteOrganization(
        correlationID,
        CONFIG_ADMIN_TOKEN,
        organziationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'delete',
          actionResult: 'success',
          eventType: 'organization',
          eventName: 'OrganizationDelete'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        /^Deleted organization TEST_ORG_DELETED_AFTER_TEST \(\d+\)$/
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
  (config.env === DEFAULT_ENV_TO_RUN_IN),
  'audit-log-organization-no-pass-correlationID',
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

    it('should index audit log when creating organization', async () => {
      const result = await helpersAuditLog.createOrganizationPassNoCorrelationIDHeader(
        CONFIG_ADMIN_TOKEN
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        { eventType: 'organization', eventName: 'OrganizationCreate' }
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

    it('should index audit log when fetching integration settings', async () => {
      const integrationId = helpersAuditLog.createRandomString(
        'test-integration-settings'
      );
      await helpersAuditLog.createOrganizationIntegrationConfig(
        CONFIG_ADMIN_TOKEN,
        integrationId
      );
      const result = await helpersAuditLog
        .getOrganizationIntegrationConfigDoNotPassCorrelationIDHeader(
          CONFIG_ADMIN_API_TOKEN,
          integrationId
        )
        .expect(200);
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'read',
          actionResult: 'success',
          actionDetails: `Requested integration settings for ${integrationId}`,
          targetId: integrationId,
          targetType: 'tt_Organization',
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organization',
          eventName: 'IntegrationSettings',
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

    it('should index audit log when fetching integration settings and Bearer token NOT-EXISTS', async () => {
      const integrationId = helpersAuditLog.createRandomString(
        'test-integration-settings'
      );
      await helpersAuditLog.createOrganizationIntegrationConfig(
        CONFIG_ADMIN_TOKEN,
        integrationId
      );
      const result = await helpersAuditLog
        .getOrganizationIntegrationConfigDoNotPassCorrelationIDHeader(
          'NOT-EXISTS',
          integrationId
        )
        .expect(401);
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'read',
          actionResult: 'failure',
          actionDetails: `Requested integration settings for ${integrationId}`,
          targetId: integrationId,
          targetType: 'tt_Organization',
          userName: 'NOT-EXISTS',
          eventType: 'organization',
          eventName: 'IntegrationSettings'
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

    it('should index audit log when fetching integration settings and integrationID does-not-exist', async () => {
      const integrationId = helpersAuditLog.createRandomString(
        'does-not-exist'
      );
      const result = await helpersAuditLog
        .getOrganizationIntegrationConfigDoNotPassCorrelationIDHeader(
          CONFIG_ADMIN_API_TOKEN,
          integrationId
        )
        .expect(404);
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'read',
          actionResult: 'failure',
          actionDetails: `Requested integration settings for ${integrationId}`,
          targetId: integrationId,
          targetType: 'tt_Organization',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organization',
          eventName: 'IntegrationSettings',
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

    it('should index audit log when fetching integration settings and api key is not authorized', async () => {
      const integrationId = helpersAuditLog.createRandomString(
        'test-integration-settings'
      );
      await helpersAuditLog.createOrganizationIntegrationConfig(
        CONFIG_ADMIN_TOKEN,
        integrationId
      );
      const tokenThatHasRoleButNotAPartOfOrganization = DEFAULT_CI_TEST_SERVICE_TOKEN;
      const result = await helpersAuditLog
        .getOrganizationIntegrationConfigDoNotPassCorrelationIDHeader(
          tokenThatHasRoleButNotAPartOfOrganization,
          integrationId
        )
        .expect(403);
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'read',
          actionResult: 'failure',
          actionDetails: `Requested integration settings for ${integrationId}`,
          targetId: integrationId,
          targetType: 'tt_Organization',
          userName: tokenThatHasRoleButNotAPartOfOrganization,
          organizationId: 'n/a',
          eventType: 'organization',
          eventName: 'IntegrationSettings'
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

    it('should index audit log when updating organization with the same name', async () => {
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      const organizationName = result.createOrganization.name;
      result = await helpersAuditLog.updateOrganizationPassNoCorrelationIDHeader(
        CONFIG_ADMIN_TOKEN,
        organizationId,
        organizationName
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'organization',
          eventName: 'OrganizationUpdate'
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

    it('should index audit log when updating organization to a new name (no correlation-id header)', async () => {
      // Renaming an org also renames its CMS application, whose application_name is unique
      // (_ix_sso_application@application_name). Use a per-run unique name so repeated runs against
      // the same DB don't collide on that constraint.
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      const newOrganizationName = helpersAuditLog.createRandomString(
        'CI-TESTING updating organization'
      );
      result = await helpersAuditLog.updateOrganizationPassNoCorrelationIDHeader(
        CONFIG_ADMIN_TOKEN,
        organizationId,
        newOrganizationName
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'organization',
          eventName: 'OrganizationUpdate'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        new RegExp(
          `^Updated organization ${_.escapeRegExp(
            newOrganizationName
          )} \\(\\d+\\) with payload \\{.*\\}$`
        )
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID
      });
    });

    it('should index audit log when user invite is created', async () => {
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      const secondOrganizationName = result.createOrganization.name;

      result = await helpersAuditLog.createOrganizationInvitePassNoCorrelationIDHeader(
        CONFIG_ADMIN_TOKEN,
        secondOrganizationId,
        userData.email
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'success',
          actionDetails: `Invited ${userData.email} to organization ${secondOrganizationName} (${secondOrganizationId})`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationCreate',
          organizationName: 'Veritone, Inc.'
        },
        {
          actionName: 'SendEmail',
          actionResult: 'success',
          targetId: userData.email,
          eventType: 'media',
          eventName: 'SendEmail'
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

    it('should index audit log when user has accepted invitation', async () => {
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganizationInvite(
        CONFIG_ADMIN_TOKEN,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;
      result = await helpersAuditLog.loginUser(userData.email, config.password);
      userData.token = result.userLogin.token;

      result = await helpersAuditLog.acceptInvitePassNoCorrelationIDHeader(
        userData.token,
        organizationInviteID
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Accepted an invitation to organization CI-TESTING organization (${secondOrganizationId})`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: userData.email,
          organizationId: firstOrganizationId,
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationAccept',
          organizationName: 'CI-TESTING organization'
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

    it('should index audit log when user has rejected invitation', async () => {
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganizationInvite(
        CONFIG_ADMIN_TOKEN,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;
      result = await helpersAuditLog.loginUser(userData.email, config.password);
      userData.token = result.userLogin.token;

      result = await helpersAuditLog.rejectInvitePassNoCorrelationIDHeader(
        userData.token,
        organizationInviteID
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Rejected an invitation to organization CI-TESTING organization (${secondOrganizationId})`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: userData.email,
          organizationId: firstOrganizationId,
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationReject',
          organizationName: 'CI-TESTING organization'
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

    it('should index audit log when a non admin invites a user', async () => {
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganizationInvitePassNoCorrelationIDHeader(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'success',
          actionDetails: `Sent an organization invitation request for CI-TESTING organization (${secondOrganizationId}) to ${userData.email}`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: userDataNotAdmin.email,
          organizationId: secondOrganizationId,
          eventType: 'organizationInvite',
          eventName: 'OrganizationRequestCreate',
          organizationName: 'CI-TESTING organization'
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

    it('should index audit log when a non admin invites a user and an admin approves the invite', async () => {
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;

      result = await helpersAuditLog.approveInvitationRequestPassNoCorrelationIDHeader(
        CONFIG_ADMIN_TOKEN,
        organizationInviteID
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Accepted an organization request from ${userData.email}`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          eventType: 'organizationInvite',
          eventName: 'OrganizationRequestAccept',
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

    it('should index audit log when a non admin invites a user and an admin revoke the invite', async () => {
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      const secondOrganizationName = result.createOrganization.name;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;

      result = await helpersAuditLog.rejectInvitePassNoCorrelationIDHeader(
        CONFIG_ADMIN_TOKEN,
        organizationInviteID
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Revoked an organization invitation to ${secondOrganizationName} (${secondOrganizationId}) from user ${newUser.firstName} ${newUser.lastName}`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationRevoke',
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

    it('should index audit log when a non admin invites a user and an admin approves the invite and user accepts the invite', async () => {
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.loginUser(userData.email, config.password);
      userData.token = result.userLogin.token;
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;

      await helpersAuditLog.approveInvitationRequest(
        CONFIG_ADMIN_TOKEN,
        organizationInviteID
      );

      result = await helpersAuditLog.acceptInvitePassNoCorrelationIDHeader(
        userData.token,
        organizationInviteID
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Accepted an invitation to organization CI-TESTING organization (${secondOrganizationId})`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: userData.email,
          organizationId: firstOrganizationId,
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationAccept',
          organizationName: 'CI-TESTING organization'
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

    it('should index audit log when a non admin invites a user and an admin approves the invite and user rejects the invite', async () => {
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.loginUser(userData.email, config.password);
      userData.token = result.userLogin.token;
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;

      await helpersAuditLog.approveInvitationRequest(
        CONFIG_ADMIN_TOKEN,
        organizationInviteID
      );

      result = await helpersAuditLog.rejectInvitePassNoCorrelationIDHeader(
        userData.token,
        organizationInviteID
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Rejected an invitation to organization CI-TESTING organization (${secondOrganizationId})`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: userData.email,
          userAgent: 'core-graphql-server test',
          organizationId: firstOrganizationId,
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'organizationInvite',
          eventName: 'OrganizationInvitationReject',
          organizationName: 'CI-TESTING organization'
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

    it('should index audit log when a non admin invites a user and an admin rejects the invite', async () => {
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const firstOrganizationId = result.createOrganization.id;
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const secondOrganizationId = result.createOrganization.id;
      const secondOrganizationName = result.createOrganization.name;

      const userDataNotAdmin = helpersAuditLog.createRandomUserData();
      await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userDataNotAdmin.email,
        config.password,
        secondOrganizationId
      );
      result = await helpersAuditLog.loginUser(
        userDataNotAdmin.email,
        config.password
      );
      const userTokenNotAdmin = result.userLogin.token;

      const userData = helpersAuditLog.createRandomUserData();
      const respNewUser = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        firstOrganizationId
      );
      const newUser = respNewUser.createUser;
      result = await helpersAuditLog.createOrganizationInvite(
        userTokenNotAdmin,
        secondOrganizationId,
        userData.email
      );
      const organizationInviteID = result.createOrganizationInvite.id;

      result = await helpersAuditLog.rejectInvitationRequestPassNoCorrelationIDHeader(
        CONFIG_ADMIN_TOKEN,
        organizationInviteID
      );
      const correlationID = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Rejected an organization request from ${userData.email}`,
          targetId: newUser.id,
          targetType: 'tt_Organization',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          eventType: 'organizationInvite',
          eventName: 'OrganizationRequestReject',
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
