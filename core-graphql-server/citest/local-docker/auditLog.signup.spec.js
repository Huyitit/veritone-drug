const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');

const OPTIONS = {
  configurableEvents: [
    'TrialSignUp',
    'DeveloperTrialSignUp',
    'AutomateStudioSignUp',
    'AwsReferralSignUp',
    'RedactSelfServiceSignUp',
    'BenchmarkSignUp',
    'VerisafeSignUp',
    'VoiceSignUp',
    'SportxSignUp',
    'OrganizationCreate',
    'UserCreate'
  ]
};

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
   'audit-log-signup', () => {
  let helpersAuditLog;
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
  });

  it('should index audit log events UserCreate AND OrganizationCreate AND TrialSignup WHEN user signup is default', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const data = {
      ...helpersAuditLog.createRandomUserData(),
      type: 'TEST-DEFAULT',
      source: helpers.DEFAULT_USER_AGENT
    };
    const url = `${helpersAuditLog._coreAdminClient.url}/admin/signup`;
    helpersAuditLog._coreAdminClient.userAuth.headers[
      'Veritone-Correlation-ID'
    ] = correlationID;
    const result = await helpersAuditLog._coreAdminClient.post(
      url,
      data,
      helpersAuditLog._coreAdminClient.userAuth
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      { eventType: 'user', eventName: 'UserCreate' },
      { eventType: 'organization', eventName: 'OrganizationCreate' },
      { eventType: 'signup', eventName: 'TrialSignUp' }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    for (const item of auditLogItems) {
      if (item.eventName === 'OrganizationCreate') {
        item.actionDetails = expect.stringMatching(
          /^Created organization .+ \(\d+\)$/
        );
      }
      if (item.eventName === 'UserCreate') {
        item.actionDetails =
          expect.stringMatching(/^Created user .+ .+$/);
      }
      if (item.eventName === 'TrialSignUp') {
        item.actionDetails = expect.stringMatching(
          /^Signed up for TrialSignUp: .+ .+$/
        );
      }
    }

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events UserCreate AND OrganizationCreate AND DeveloperTrialSignUp WHEN user signup is developer', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const data = {
      ...helpersAuditLog.createRandomUserData(),
      type: 'developer',
      source: helpers.DEFAULT_USER_AGENT
    };
    const url = `${helpersAuditLog._coreAdminClient.url}/admin/signup`;
    helpersAuditLog._coreAdminClient.userAuth.headers[
      'Veritone-Correlation-ID'
    ] = correlationID;
    await helpersAuditLog._coreAdminClient.post(
      url,
      data,
      helpersAuditLog._coreAdminClient.userAuth
    );
    const expectedAuditLogItems = [
      { eventType: 'user', eventName: 'UserCreate' },
      { eventType: 'organization', eventName: 'OrganizationCreate' },
      { eventType: 'signup', eventName: 'DeveloperTrialSignUp' }
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

  it('should index audit log events UserCreate AND OrganizationCreate AND AutomateStudioSignUp WHEN user signup is automate', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const data = {
      ...helpersAuditLog.createRandomUserData(),
      type: 'automate',
      source: helpers.DEFAULT_USER_AGENT
    };
    const url = `${helpersAuditLog._coreAdminClient.url}/admin/signup`;
    helpersAuditLog._coreAdminClient.userAuth.headers[
      'Veritone-Correlation-ID'
    ] = correlationID;
    await helpersAuditLog._coreAdminClient.post(
      url,
      data,
      helpersAuditLog._coreAdminClient.userAuth
    );
    const expectedAuditLogItems = [
      { eventType: 'user', eventName: 'UserCreate' },
      { eventType: 'organization', eventName: 'OrganizationCreate' },
      { eventType: 'signup', eventName: 'AutomateStudioSignUp' }
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

  it.skip('should index audit log events UserCreate AND OrganizationCreate AND AwsReferralSignUp WHEN user signup is amazon', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const data = {
      ...helpersAuditLog.createRandomUserData(),
      type: 'amazon',
      source: helpers.DEFAULT_USER_AGENT
    };
    const url = `${helpersAuditLog._coreAdminClient.url}/admin/signup`;
    helpersAuditLog._coreAdminClient.userAuth.headers[
      'Veritone-Correlation-ID'
    ] = correlationID;
    await helpersAuditLog._coreAdminClient.post(
      url,
      data,
      helpersAuditLog._coreAdminClient.userAuth
    );
    const expectedAuditLogItems = [
      { eventType: 'user', eventName: 'UserCreate' },
      { eventType: 'organization', eventName: 'OrganizationCreate' },
      { eventType: 'signup', eventName: 'AwsReferralSignUp' }
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

  it('should index audit log events UserCreate AND OrganizationCreate AND RedactSelfServiceSignUp WHEN user signup is redact', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const data = {
      ...helpersAuditLog.createRandomUserData(),
      type: 'redact',
      source: helpers.DEFAULT_USER_AGENT
    };
    const url = `${helpersAuditLog._coreAdminClient.url}/admin/signup`;
    helpersAuditLog._coreAdminClient.userAuth.headers[
      'Veritone-Correlation-ID'
    ] = correlationID;
    await helpersAuditLog._coreAdminClient.post(
      url,
      data,
      helpersAuditLog._coreAdminClient.userAuth
    );
    const expectedAuditLogItems = [
      { eventType: 'user', eventName: 'UserCreate' },
      { eventType: 'organization', eventName: 'OrganizationCreate' },
      { eventType: 'signup', eventName: 'RedactSelfServiceSignUp' }
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

  it('should index audit log events UserCreate AND OrganizationCreate AND VerisafeSignUp WHEN user signup is verisafe', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const data = {
      ...helpersAuditLog.createRandomUserData(),
      type: 'verisafe',
      source: helpers.DEFAULT_USER_AGENT
    };
    const url = `${helpersAuditLog._coreAdminClient.url}/admin/signup`;
    helpersAuditLog._coreAdminClient.userAuth.headers[
      'Veritone-Correlation-ID'
    ] = correlationID;
    await helpersAuditLog._coreAdminClient.post(
      url,
      data,
      helpersAuditLog._coreAdminClient.userAuth
    );
    const expectedAuditLogItems = [
      { eventType: 'user', eventName: 'UserCreate' },
      { eventType: 'organization', eventName: 'OrganizationCreate' },
      { eventType: 'signup', eventName: 'VerisafeSignUp' }
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

  it('should index audit log events UserCreate AND OrganizationCreate AND VoiceSignUp WHEN user signup is voice', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const data = {
      ...helpersAuditLog.createRandomUserData(),
      type: 'voice',
      source: helpers.DEFAULT_USER_AGENT
    };
    const url = `${helpersAuditLog._coreAdminClient.url}/admin/signup`;
    helpersAuditLog._coreAdminClient.userAuth.headers[
      'Veritone-Correlation-ID'
    ] = correlationID;
    await helpersAuditLog._coreAdminClient.post(
      url,
      data,
      helpersAuditLog._coreAdminClient.userAuth
    );
    const expectedAuditLogItems = [
      { eventType: 'user', eventName: 'UserCreate' },
      { eventType: 'organization', eventName: 'OrganizationCreate' },
      { eventType: 'signup', eventName: 'VoiceSignUp' }
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
});
