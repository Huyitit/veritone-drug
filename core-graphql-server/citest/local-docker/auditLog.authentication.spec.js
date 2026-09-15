const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents,
  authFailureReason
} = require('./helpers.auditLog.js');
const _ = require('lodash');
const uuid = require('uuid');

const OPTIONS = {
  configurableEvents: [
    'LoginSucceeded',
    'LoginFailed',
    'LoginAttemptsExceeded',
    'Impersonated',
    'PasswordChange',
    'Logout',
    'SessionEnded',
    'PasswordToken',
    'LoginVerifyMFAToken',
    'RegisterMFA',
    'UnregisterMFA',
    'VerifyUserMFARegistration'
  ]
};

let userId, configAdminToken;

const config = helpers.config;
let redisClient;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif(
   (config.env === DEFAULT_ENV_TO_ISO),
  'audit-log-authentication', () => {
    let helpersAuditLog;
    beforeAll(async () => {
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(
        config,
        OPTIONS
      );
      redisClient = await helpersAuditLog.initRedis();
      redisClient.flushall();
    
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
      const result = await helpersAuditLog.loginWithConfiguredUser();
      const token = result.userLogin.token;

      if (false === await helpersAuditLog.waitForAuditLogIndexingPipeline(120, token)) {
        console.error(`${(new Date()).toISOString()}: Audit log indexing pipeline not ready. Following tests may fail.`);
      }
    },  10 * 60 * 1000);

    afterEach(async () => {
      const loginAttemptsKey = helpersAuditLog.getLoginAttemtpsCacheKey();
      await redisClient.del(loginAttemptsKey);

      if (userId && configAdminToken) {
        await helpersAuditLog.deleteUser(configAdminToken, userId);
        userId = null;
        configAdminToken = null;
      }
    });

    it('should add LoginSucceeded event to index authenticating - userLogin', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();

      const result = await helpersAuditLog.loginWithConfiguredUser(
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginSucceeded',
          actionDetails: 'Logged in'
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

    it('should add LoginSucceeded event to index authenticating - POST /api/admin/login', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result;
      const { userName, password } = helpersAuditLog._config;
      result = await helpersAuditLog.coreAdminRequest(
        '/admin/login',
        'POST',
        null,
        {
          userName,
          password
        },
        null,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginSucceeded',
          actionDetails: 'Logged in'
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

    it('should add LoginSucceeded event to index authenticating - POST /api/admin/mfa/verify/:token - success', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const userId = _.get(result, 'userLogin.user.id');
      const token = _.get(result, 'userLogin.token');
      const otpToken = await helpersAuditLog.getUserMultiFactorAuthentication(
        userId,
        redisClient,
        token
      );
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.coreAdminRequest(
        `/admin/mfa/verify/${otpToken}`,
        'POST',
        token,
        null,
        null,
        correlationID
      );
      const defaultMfaOption = _.get(result, 'mfaDefaultOption');

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginSucceeded',
          actionDetails: 'Logged in',
          actionResult: 'success'
        },
        {
          eventType: 'authentication',
          eventName: 'LoginVerifyMFAToken',
          actionDetails: `${defaultMfaOption} MFA login`,
          actionResult: 'success'
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

    it('should add LoginFailed event to index authenticating - POST /api/admin/mfa/verify/:token - failure (wrong OTP)', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const token = _.get(result, 'userLogin.token');
      const otpToken = await helpersAuditLog.getUserMultiFactorAuthentication(
        userId,
        redisClient,
        token,
        true // this will generate a wrong token to simulate failure
      );
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.coreAdminRequest(
        `/admin/mfa/verify/${otpToken}`,
        'POST',
        token,
        null,
        null,
        correlationID
      );
      const defaultMfaOption = _.get(result, 'mfaDefaultOption');

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginFailed',
          actionDetails:
            'Login failed because of failed MFA token verification',
          actionResult: 'failure'
        },
        {
          eventType: 'authentication',
          eventName: 'LoginVerifyMFAToken',
          actionDetails: `Failed ${defaultMfaOption} MFA verification`,
          actionResult: 'failure'
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

    // FIXME: this will only work if events are emitted from auth middleware, which is not implemented at the moment
    xit('should add LoginFailed event to index authenticating - POST /api/admin/mfa/verify/:token - failure (wrong auth token)', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const token = _.get(result, 'userLogin.token');
      const otpToken = await helpersAuditLog.getUserMultiFactorAuthentication(
        userId,
        redisClient,
        token,
        true // this will generate a wrong token to simulate failure
      );
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.coreAdminRequest(
        `/admin/mfa/verify/${otpToken}`,
        'POST',
        'fake-token', // using a wrong auth token to simulate failure
        null,
        null,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginFailed',
          actionDetails:
            'Login failed because of failed MFA token verification',
          actionResult: 'failure'
        },
        {
          eventType: 'authentication',
          eventName: 'LoginVerifyMFAToken',
          actionDetails: 'Failed to verify MFA token',
          actionResult: 'failure'
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

    it('should index audit log when login fails - wrong password', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result, error;
      try {
        result = await helpersAuditLog.loginWithConfiguredUser(
          correlationID,
          authFailureReason.INVALID_CREDENTIALS
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
          eventType: 'authentication',
          eventName: 'LoginFailed',
          actionDetails: 'Login failed because of invalid password'
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

    it('should index audit log when login fails - wrong username (user does not exist)', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result, error;
      try {
        result = await helpersAuditLog.loginWithConfiguredUser(
          correlationID,
          authFailureReason.NON_EXISTENT_USER
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
          eventType: 'authentication',
          eventName: 'LoginFailed',
          actionDetails: 'Login failed because user was not found'
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

    it('should index audit log when login fails - missing username | core-admin endpoint', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result;
      const { password } = helpersAuditLog._config;
      result = await helpersAuditLog.coreAdminRequest(
        '/admin/login',
        'POST',
        null,
        {
          userName: '', // missing username
          password
        },
        null,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginFailed',
          actionDetails: 'Login failed because of missing username or password.'
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

    it('should index audit log when login fails - missing password | core-admin endpoint', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result;
      const { userName } = helpersAuditLog._config;
      result = await helpersAuditLog.coreAdminRequest(
        '/admin/login',
        'POST',
        null,
        {
          userName,
          password: ''
        },
        null,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginFailed',
          actionDetails: 'Login failed because of missing username or password.'
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

    it('should index audit log when login fails - missing sessionKey | core-admin endpoint /admin/openid/linkUserToOid', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result;
      const { userName, password } = helpersAuditLog._config;
      result = await helpersAuditLog.coreAdminRequest(
        '/admin/openid/linkUserToOid',
        'POST',
        null,
        {
          userName,
          password
        },
        null,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginFailed',
          actionDetails: 'Login failed because of empty sessionKey'
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

    it('should index audit log when login fails - missing userName or password | core-admin endpoint /admin/openid/linkUserToOid', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result;
      const { password } = helpersAuditLog._config;
      result = await helpersAuditLog.coreAdminRequest(
        '/admin/openid/linkUserToOid',
        'POST',
        null,
        {
          userName: '',
          password,
          sessionKey: 'abc'
        },
        null,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginFailed',
          actionDetails: 'Login failed because of empty userName or password'
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

    it('should index audit log when login fails - sessionKey is not connected to any connectId | core-admin endpoint /admin/openid/linkUserToOid', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result;
      const { userName, password } = helpersAuditLog._config;
      result = await helpersAuditLog.coreAdminRequest(
        '/admin/openid/linkUserToOid',
        'POST',
        null,
        {
          userName,
          password,
          sessionKey: 'abc'
        },
        null,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginFailed',
          actionDetails:
            'Login failed because of invalid authentication info for OpenId Provider'
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

    it('should index audit log when login fails - invalid connectId | core-admin endpoint /admin/openid/linkUserToOid', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result;
      const { userName, password } = helpersAuditLog._config;
      const key = 'abc';
      await helpersAuditLog.setCacheOpenIdAuth(
        key,
        null,
        null,
        null,
        redisClient
      );
      result = await helpersAuditLog.coreAdminRequest(
        '/admin/openid/linkUserToOid',
        'POST',
        null,
        {
          userName,
          password,
          sessionKey: key
        },
        null,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginFailed',
          actionDetails:
            'Login failed because of error validating user and OpenId Provider'
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

    it('should index audit log when login with open id succeeds | core-admin endpoint /admin/openid/linkUserToOid', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      const { userName, password } = helpersAuditLog._config;
      const key = uuid.v4();
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const orgGuid = _.get(result, 'userLogin.organization.guid');
      const connectId = await helpersAuditLog.createTestConnectId(orgGuid);
      await helpersAuditLog.setCacheOpenIdAuth(
        key,
        null,
        connectId,
        null,
        redisClient
      );
      result = await helpersAuditLog.coreAdminRequest(
        '/admin/openid/linkUserToOid',
        'POST',
        null,
        {
          userName,
          password,
          sessionKey: key
        },
        null,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginSucceeded',
          actionDetails: 'Logged in and redirected to OID provider to complete authentication'
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

    // FIXME: this is currently not testable because the handler has unhandled errors breaking the app
    xit('should index audit log when login with open id fails | core-admin endpoint /admin/openid/:connectId/callback/login', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      const key = uuid.v4();
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const orgGuid = _.get(result, 'userLogin.organization.guid');
      const connectId = await helpersAuditLog.createTestConnectId(orgGuid);
      await helpersAuditLog.setCacheOpenIdAuth(
        key,
        null,
        connectId,
        null,
        redisClient
      );
      result = await helpersAuditLog.coreAdminRequest(
        `/admin/openid/${connectId}/callback/login`,
        'GET',
        null,
        null,
        { foo: 'bar' },
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginSucceeded',
          actionDetails: 'Logged in and redirected to OID provider to complete authentication'
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

    it('should index audit log when successfully impersonating another user', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      const correlationID = helpersAuditLog.buildCorrelationID();
      // 1. create user to impersonate
      const userData = helpersAuditLog.createRandomUserData();
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      result = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        organizationId
      );
      userId = result.createUser.id;
      // 2. impersonate user
      const impersonationResult = await helpersAuditLog.adminImpersonate(
        CONFIG_ADMIN_TOKEN,
        correlationID,
        userId
      );
      // 3. validate audit log
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        impersonationResult
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Impersonated',
          actionResult: 'success',
          actionDetails: 'Impersonated user First Last'
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
      // 4. delete user
      await helpersAuditLog.deleteUser(CONFIG_ADMIN_TOKEN, userId);
    });

    it('should index audit log when fails to impersonate another user', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      const correlationID = helpersAuditLog.buildCorrelationID();
      const fakeUserId = '00000000-0000-0000-0000-000000000000';
      // 1. impersonate user
      const impersonationResult = await helpersAuditLog.adminImpersonate(
        CONFIG_ADMIN_TOKEN,
        correlationID,
        fakeUserId
      );
      // 2. validate audit log
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        impersonationResult
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Impersonated',
          actionResult: 'failure',
          actionDetails: `Failed to impersonate user ${fakeUserId}`
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

    it('should index audit log with too many login attempts', async () => {
      // the next login attempt should fail with LoginAttemptsExceeded
      helpersAuditLog.setMaxLoginAttemptsInCache(redisClient);

      const correlationID = helpersAuditLog.buildCorrelationID();
      let result, error;
      try {
        result = await helpersAuditLog.loginWithConfiguredUser(
          correlationID,
          true
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
          eventType: 'authentication',
          eventName: 'LoginAttemptsExceeded',
          actionDetails: 'Exceeded login attempt limit'
        },
        {
          eventType: 'authentication',
          eventName: 'LoginFailed',
          actionDetails: 'Login failed because of exceeded login attempts.'
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

    it('should index audit log when successfully impersonating another user', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      const correlationID = helpersAuditLog.buildCorrelationID();
      // 1. create user to impersonate
      const userData = helpersAuditLog.createRandomUserData();
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      result = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        organizationId
      );
      userId = result.createUser.id;
      // 2. impersonate user
      const impersonationResult = await helpersAuditLog.adminImpersonate(
        CONFIG_ADMIN_TOKEN,
        correlationID,
        userId
      );
      // 3. validate audit log
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        impersonationResult
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Impersonated',
          actionResult: 'success'
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
      // 4. delete user
      await helpersAuditLog.deleteUser(CONFIG_ADMIN_TOKEN, userId);
    });

    it('should index audit log when fails to impersonate another user', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      const correlationID = helpersAuditLog.buildCorrelationID();
      // 1. impersonate user
      const impersonationResult = await helpersAuditLog.adminImpersonate(
        CONFIG_ADMIN_TOKEN,
        correlationID,
        '00000000-0000-0000-0000-000000000000'
      );
      // 2. validate audit log
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        impersonationResult
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Impersonated',
          actionResult: 'failure'
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

    /* PasswordChange should be tested POSTing to 3 endpoints
      - /admin/current-user/change-password
      - /admin/users/me/change-password
      - /admin/password/reset (this one has a different payload than the other two)
    */
    [
      '/admin/current-user/change-password',
      '/admin/users/me/change-password'
    ].forEach((endpoint) => {
      it(`should index audit log when fails to change password with ${endpoint} endpoint`, async () => {
        // 1. create test user and set initial password
        let result = await helpersAuditLog.loginWithConfiguredUser();
        const testPassword = 'T3stP@ssw0rd';
        const CONFIG_ADMIN_TOKEN = result.userLogin.token;
        configAdminToken = CONFIG_ADMIN_TOKEN;
        // // 1. create user to impersonate
        const userData = helpersAuditLog.createRandomUserData();
        result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
        const organizationId = result.createOrganization.id;
        result = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          userData.email,
          testPassword,
          organizationId
        );
        userId = result.createUser.id;
        // 2. authenticate with test user
        result = await helpersAuditLog.loginUser(
          result.createUser.name,
          testPassword
        );
        const tempUserToken = result.userLogin.token;
        // 3. attempt to change password with invalid current password
        const correlationID = helpersAuditLog.buildCorrelationID();
        result = await helpersAuditLog.adminPasswordChange(
          tempUserToken,
          correlationID,
          'invalidPassword', // this should cause a failure
          'newPassword',
          endpoint
        );
        // 4. validate audit log
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        const expectedAuditLogItems = [
          {
            eventType: 'authentication',
            eventName: 'PasswordChange',
            actionResult: 'failure',
            actionDetails:
              'Password change attempt failed because of incorrect old password'
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

      it(`should index audit log when fails to change password with ${endpoint} endpoint - missing old or new password`, async () => {
        // 1. create test user and set initial password
        let result = await helpersAuditLog.loginWithConfiguredUser();
        const testPassword = 'T3stP@ssw0rd';
        const CONFIG_ADMIN_TOKEN = result.userLogin.token;
        configAdminToken = CONFIG_ADMIN_TOKEN;
        // // 1. create user to impersonate
        const userData = helpersAuditLog.createRandomUserData();
        result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
        const organizationId = result.createOrganization.id;
        result = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          userData.email,
          testPassword,
          organizationId
        );
        userId = result.createUser.id;
        // 2. authenticate with test user
        result = await helpersAuditLog.loginUser(
          result.createUser.name,
          testPassword
        );
        const tempUserToken = result.userLogin.token;
        // 3. attempt to change password with invalid current password
        const correlationID = helpersAuditLog.buildCorrelationID();
        result = await helpersAuditLog.adminPasswordChange(
          tempUserToken,
          correlationID,
          testPassword,
          '', // missing new password
          endpoint
        );
        // 4. validate audit log
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        const expectedAuditLogItems = [
          {
            eventType: 'authentication',
            eventName: 'PasswordChange',
            actionResult: 'failure',
            actionDetails:
              'Password change attempt failed because of missing old or new password'
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

      it(`should index audit log when successfully changing password with ${endpoint} endpoint`, async () => {
        // 1. create test user and set initial password
        let result = await helpersAuditLog.loginWithConfiguredUser();
        const testPassword = 'T3stP@ssw0rd';
        const CONFIG_ADMIN_TOKEN = result.userLogin.token;
        configAdminToken = CONFIG_ADMIN_TOKEN;
        // // 1. create user to impersonate
        const userData = helpersAuditLog.createRandomUserData();
        result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
        const organizationId = result.createOrganization.id;
        result = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          userData.email,
          testPassword,
          organizationId
        );
        userId = result.createUser.id;
        // 2. authenticate with test user
        result = await helpersAuditLog.loginUser(
          result.createUser.name,
          testPassword
        );
        const tempUserToken = result.userLogin.token;
        // 3. attempt to change password with invalid current password
        const correlationID = helpersAuditLog.buildCorrelationID();
        result = await helpersAuditLog.adminPasswordChange(
          tempUserToken,
          correlationID,
          testPassword,
          'newPassword',
          endpoint
        );
        // 4. validate audit log
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        const expectedAuditLogItems = [
          {
            eventType: 'authentication',
            eventName: 'PasswordChange',
            actionResult: 'success',
            actionDetails: 'Password changed'
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

    it('should index audit log when resets password', async () => {
      // 1. create test user and set initial password
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const testPassword = 'T3stP@ssw0rd';
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      configAdminToken = CONFIG_ADMIN_TOKEN;
      // // 1. create user to impersonate
      const userData = helpersAuditLog.createRandomUserData();
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      result = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        testPassword,
        organizationId
      );
      userId = result.createUser.id;
      const userName = result.createUser.name;
      const resetToken = await helpersAuditLog.generatePasswordResetToken(
        userId
      );
      // 2. attempt to reset password with invalid token
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.adminPasswordReset(
        resetToken,
        correlationID,
        userName,
        testPassword
      );
      // 4. validate audit log
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'PasswordChange',
          actionResult: 'success',
          actionDetails: 'Password changed'
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

    it('should index audit log fails to reset password', async () => {
      // 1. create test user and set initial password
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      configAdminToken = CONFIG_ADMIN_TOKEN;
      const resetToken = await helpersAuditLog.generatePasswordResetToken(
        '00000000-0000-0000-0000-000000000000'
      );
      // 2. attempt to reset password with invalid token
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.adminPasswordReset(
        resetToken,
        correlationID,
        'invalidUser',
        'T3stP@ssw0rd'
      );
      // 3. validate audit log
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'PasswordChange',
          actionResult: 'failure',
          actionDetails:
            'Password change failed because of invalid username or reset password token'
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
    // POST /admin/org-invite/password/reset
    it('should index audit log when resetting password with org invite - success', async () => {
      // login with admin
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      // create organization
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;

      // create org to invite user to
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      // create user
      const userData = helpersAuditLog.createRandomUserData();
      const targetOrganizationId = result.createOrganization.id;
      // create invite
      result = await helpersAuditLog.createOrganizationInvite(
        CONFIG_ADMIN_TOKEN,
        targetOrganizationId,
        userData.email,
        null,
        true
      );
      const { passwordResetToken: token, id: organizationInviteId } = _.get(
        result,
        'createOrganizationInvite'
      );

      // update the invite to 'complete' before using it for password reset.
      await helpersAuditLog.updateOrganizationInvite(
        CONFIG_ADMIN_TOKEN,
        organizationInviteId,
        'complete',
        null
      );
      const resetBody = {
        password: 'Veritone123!',
        organizationInviteId,
        token,
        userName: userData.email
      };
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.coreAdminRequest(
        '/admin/org-invite/password/reset',
        'POST',
        null,
        resetBody,
        null,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'PasswordChange',
          actionResult: 'success',
          actionDetails: 'Password changed'
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

    it('should index audit log when resetting password with org invite - failure', async () => {
      // login with admin
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;

      // create org to invite user to
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      // create user
      const userData = helpersAuditLog.createRandomUserData();
      const targetOrganizationId = result.createOrganization.id;
      // create invite
      result = await helpersAuditLog.createOrganizationInvite(
        CONFIG_ADMIN_TOKEN,
        targetOrganizationId,
        userData.email,
        null,
        true
      );
      const { passwordResetToken: token, id: organizationInviteId } = _.get(
        result,
        'createOrganizationInvite'
      );

      // token is missing, which should fail validation
      const resetBody = {
        password: 'Veritone123!',
        organizationInviteId,
        userName: userData.email
      };
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.coreAdminRequest(
        '/admin/org-invite/password/reset',
        'POST',
        null,
        resetBody,
        null,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'PasswordChange',
          actionResult: 'failure',
          actionDetails: 'Password change failed because of bad request'
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
    // /admin/users/me/change-password
    it('should index audit log when logging out successfully', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.logoutUser(
        result.userLogin.token,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Logout',
          actionResult: 'success',
          actionDetails: 'Logged out'
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

    it('should index audit log when logging out fails', async () => {
      // login
      let result = await helpersAuditLog.loginWithConfiguredUser();
      // remove token from cache to cause logout to fail
      const { token } = result.userLogin;
      const pattern = `TOKEN:${token}*`;
      await helpersAuditLog.deleteKeysByPatternScan(redisClient, pattern);
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.logoutUser(token, correlationID);
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Logout',
          actionResult: 'failure',
          actionDetails: `Failed to logout`
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

    // GET /api/admin/org-logout/:id
    it('should index audit log when logging out everyone in the organization successfully', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const correlationID = helpersAuditLog.buildCorrelationID();
      const token = await helpersAuditLog.createToken(
        ['master', 'admin:org:update'],
        'logout-all-token',
        true
      );
      result = await helpersAuditLog.coreAdminRequest(
        `/admin/org-logout/${result.userLogin.organization.id}`,
        'GET',
        token,
        null,
        null,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'SessionEnded',
          actionResult: 'success',
          actionDetails: expect.stringContaining('olp_toggle')
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
    it('should index audit log when fail to log out everyone in the organization', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const correlationID = helpersAuditLog.buildCorrelationID();
      const token = await helpersAuditLog.createToken(
        ['master', 'admin:org:update'],
        'logout-all-token',
        true
      );
      result = await helpersAuditLog.coreAdminRequest(
        `/admin/org-logout/fake-org-id`,
        'GET',
        token,
        null,
        null,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Logout',
          actionResult: 'failure',
          actionDetails: 'Failed to logout because of system error'
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

    // GET /api/admin/token/:token/logout
    it('should index audit log when logging out token successfully', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.coreAdminRequest(
        `/admin/token/${result.userLogin.token}/logout`,
        'GET',
        null,
        null,
        null,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Logout',
          actionResult: 'success',
          actionDetails: 'Logged out'
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
    it('should index audit log when logging out token fails', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      let result = await helpersAuditLog.coreAdminRequest(
        `/admin/token/${uuid.v4()}/logout`,
        'GET',
        null,
        null,
        null,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Logout',
          actionResult: 'failure',
          actionDetails: 'Failed to logout'
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

    it('should index audit log when logging out successfully by oidc', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      const userName = helpersAuditLog._config.userName;
      const password = helpersAuditLog._config.password;
      const userId = _.get(result, 'userLogin.user.id');

      const orgGuid = _.get(result, 'userLogin.organization.guid');
      const connectId = await helpersAuditLog.createTestConnectId(orgGuid);

      const sessionKey = uuid.v4();
      await helpersAuditLog.setCacheOpenIdAuth(
        sessionKey,
        'some-identifier', // Placeholder, as it's not directly used by linkUserToOid for login
        connectId,
        'some-session-state', // Placeholder
        redisClient
      );

      await helpersAuditLog.linkUserToOid(
        CONFIG_ADMIN_TOKEN,
        userName,
        password,
        sessionKey
      );

      const correlationID = helpersAuditLog.buildCorrelationID();
      
      result = await helpersAuditLog.logoutUser(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Logout',
          actionResult: 'success',
          actionDetails: 'Logged out'
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

    it('should index audit log when logging out by oidc fails', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      const userName = helpersAuditLog._config.userName;
      const password = helpersAuditLog._config.password;
      const userId = _.get(result, 'userLogin.user.id');

      const orgGuid = _.get(result, 'userLogin.organization.guid');
      const connectId = await helpersAuditLog.createTestConnectId(orgGuid);

      const sessionKey = uuid.v4();
      await helpersAuditLog.setCacheOpenIdAuth(
        sessionKey,
        'some-identifier', // Placeholder
        connectId,
        'some-session-state', // Placeholder
        redisClient
      );

      await helpersAuditLog.linkUserToOid(
        CONFIG_ADMIN_TOKEN,
        userName,
        password,
        sessionKey
      );

      const pattern = `TOKEN:${CONFIG_ADMIN_TOKEN}*`;
      await helpersAuditLog.deleteKeysByPatternScan(redisClient, pattern);

      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.logoutUser(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Logout',
          actionResult: 'failure',
          actionDetails: 'Failed to logout'
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


    it('should index audit log when logging out successfully done by system', async () => {
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.logoutUser(
        result.userLogin.token,
        correlationID,
        true
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Logout',
          actionResult: 'success',
          actionDetails: 'Was logged out automatically'
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

    it('should index audit log when logging out done by system fails', async () => {
      // login
      let result = await helpersAuditLog.loginWithConfiguredUser();
      // remove token from cache to cause logout to fail
      const { token } = result.userLogin;
      const pattern = `TOKEN:${token}*`;
      await helpersAuditLog.deleteKeysByPatternScan(redisClient, pattern);
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.logoutUser(token, correlationID, true);
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'Logout',
          actionResult: 'failure',
          actionDetails: `System failed to logout automatically`
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
    it('should index audit log when successfully requesting token at POST admin/password-token', async () => {
      // 1. create test user and set initial password
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const testPassword = 'T3stP@ssw0rd';
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      configAdminToken = CONFIG_ADMIN_TOKEN;
      // // 1. create user to impersonate
      const userData = helpersAuditLog.createRandomUserData();
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      result = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        testPassword,
        organizationId
      );
      userId = result.createUser.id;
      const userName = result.createUser.name;
      // 2. attempt to reset password with invalid token
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.adminPasswordToken(
        correlationID,
        userName,
        testPassword,
        CONFIG_ADMIN_TOKEN
      );
      // 4. validate audit log
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'PasswordToken',
          actionResult: 'success',
          actionDetails: 'Generated password token for First Last'
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

    it('should index audit log when failing to request token at POST admin/password-token', async () => {
      // 1. create test user and set initial password
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const testPassword = 'T3stP@ssw0rd';
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      configAdminToken = CONFIG_ADMIN_TOKEN;
      // // 1. create user to impersonate
      const userData = helpersAuditLog.createRandomUserData();
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      result = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        testPassword,
        organizationId
      );
      userId = result.createUser.id;
      const userName = result.createUser.name;
      // 2. attempt to reset password with invalid token
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.adminPasswordToken(
        correlationID,
        userName,
        'invalidPassword',
        CONFIG_ADMIN_TOKEN
      );
      // 4. validate audit log
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'PasswordToken',
          actionResult: 'failure',
          actionDetails: 'Failed to generate password token for First Last'
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

    it('should index audit log when verifying MFA token', async () => {
      // 1. create test user and set initial password
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const testPassword = 'T3stP@ssw0rd';
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      configAdminToken = CONFIG_ADMIN_TOKEN;
      // // 1. create user to impersonate
      const userData = helpersAuditLog.createRandomUserData();
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      result = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        testPassword,
        organizationId
      );
      userId = result.createUser.id;
      // 2. generate MFA token
      const mfaToken = await helpersAuditLog.getUserMultiFactorAuthentication(
        userId,
        redisClient,
        CONFIG_ADMIN_TOKEN
      );

      // 3. verify MFA token
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.adminVerifyMfaToken(
        CONFIG_ADMIN_TOKEN,
        correlationID,
        mfaToken
      );
      // 4. validate audit log
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginVerifyMFAToken',
          actionResult: 'success'
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

    it('should index audit log when failing to verify MFA token', async () => {
      // 1. create test user and set initial password
      let result = await helpersAuditLog.loginWithConfiguredUser();
      const testPassword = 'T3stP@ssw0rd';
      const CONFIG_ADMIN_TOKEN = result.userLogin.token;
      configAdminToken = CONFIG_ADMIN_TOKEN;
      // // 1. create user to impersonate
      const userData = helpersAuditLog.createRandomUserData();
      result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      const organizationId = result.createOrganization.id;
      result = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        testPassword,
        organizationId
      );
      userId = result.createUser.id;
      // 2. generate MFA token
      const mfaToken = await helpersAuditLog.getUserMultiFactorAuthentication(
        userId,
        redisClient,
        CONFIG_ADMIN_TOKEN,
        true
      );

      // 3. verify MFA token
      const correlationID = helpersAuditLog.buildCorrelationID();
      result = await helpersAuditLog.adminVerifyMfaToken(
        CONFIG_ADMIN_TOKEN,
        correlationID,
        mfaToken
      );

      // 4. validate audit log
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        {
          eventType: 'authentication',
          eventName: 'LoginVerifyMFAToken',
          actionResult: 'failure'
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

    [
      '/admin/current-user/mfa/register/verify/:type/:token'
      // '/admin/users/me/mfa/register/verify/:type/:token' // FIXME: this route is inaccessbile until VE-8727 is addressed
    ].forEach((endpoint) => {
      const executeTest = async (type, actionResult) => {
        // 1. create test user and set initial password
        let result = await helpersAuditLog.loginWithConfiguredUser();
        const testPassword = 'T3stP@ssw0rd';
        const CONFIG_ADMIN_TOKEN = result.userLogin.token;
        configAdminToken = CONFIG_ADMIN_TOKEN;
        // // 1. create user to impersonate
        const userData = helpersAuditLog.createRandomUserData();
        result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
        const organizationId = result.createOrganization.id;
        result = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          userData.email,
          testPassword,
          organizationId
        );
        userId = result.createUser.id;
        // 2. authenticate with test user
        result = await helpersAuditLog.loginUser(
          result.createUser.name,
          testPassword
        );
        const tempUserToken = result.userLogin.token;
        // 3. generate MFA token
        const mfaToken = await helpersAuditLog.getUserMultiFactorAuthentication(
          userId,
          redisClient,
          tempUserToken,
          false,
          'PASSWORD',
          false
        );

        // 4. verify MFA token
        const correlationID = helpersAuditLog.buildCorrelationID();
        const emptyPOST = !endpoint.includes(':userId');
        const configuredEndpoint = endpoint
          .replace(':userId', userId)
          .replace(':token', mfaToken)
          .replace(':type', type);
        result = await helpersAuditLog.adminVerifyUserMFARegistration(
          tempUserToken,
          correlationID,
          configuredEndpoint,
          emptyPOST
        );
        // 5. validate audit log
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        const expectedAuditLogItems = [
          {
            eventType: 'authentication',
            eventName: 'VerifyUserMFARegistration',
            actionResult
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        if(auditLogItems.actionResult === 'success') {
           expectedAuditLogItems[0].actionDetails = expect.stringMatching(
            /^Verified MFA token for \d+$/
          );
        }
        if(auditLogItems.actionResult === 'failure') {
          expectedAuditLogItems[0].actionDetails = expect.stringMatching(
            /^Failed attempt to verify MFA token for \d+$/
          );
        }

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      };
      it(`should index audit log when failing to verify MFA Registration - wrong MFA type calling ${endpoint}`, async () => {
        await executeTest('sms', 'failure');
      });
      it(`should index audit log when successfully verified MFA registration calling ${endpoint}`, async () => {
        await executeTest('ga', 'success');
      });
    });

    [
      '/admin/current-user/mfa/unregister/:type',
      '/admin/users/:userId/mfa/unregister/:type'
      // '/admin/users/me/mfa/unregister/:type' // FIXME: this route is inaccessbile until VE-8727 is addressed
    ].forEach((endpoint) => {
      const executeTest = async (type, actionResult) => {
        // 1. create test user and set initial password
        let result = await helpersAuditLog.loginWithConfiguredUser();
        const testPassword = 'T3stP@ssw0rd';
        const CONFIG_ADMIN_TOKEN = result.userLogin.token;
        configAdminToken = CONFIG_ADMIN_TOKEN;
        // // 1. create user to impersonate
        const userData = helpersAuditLog.createRandomUserData();
        result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
        const organizationId = result.createOrganization.id;
        result = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          userData.email,
          testPassword,
          organizationId
        );
        userId = result.createUser.id;
        // 2. authenticate with test user
        result = await helpersAuditLog.loginUser(
          result.createUser.name,
          testPassword
        );
        // 3. generate MFA token
        await helpersAuditLog.getUserMultiFactorAuthentication(
          userId,
          redisClient,
          CONFIG_ADMIN_TOKEN,
          false,
          'PASSWORD',
          false
        );

        // 4. verify MFA token
        const correlationID = helpersAuditLog.buildCorrelationID();
        const skipPayload = endpoint.includes(':userId');
        const updatedType = skipPayload && type === 'ga' ? 'all' : type;
        const configuredEndpoint = endpoint
          .replace(':userId', userId)
          .replace(':type', updatedType);
        result = await helpersAuditLog.adminUnregisterMfa(
          CONFIG_ADMIN_TOKEN,
          correlationID,
          configuredEndpoint,
          skipPayload
        );
        // 5. validate audit log
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        const expectedAuditLogItems = [
          {
            eventType: 'authentication',
            eventName: 'UnregisterMFA',
            actionResult,
            actionDetails: actionResult === 'success' ? `${updatedType} MFA unregistration` : `Failed ${updatedType} MFA unregistration`
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
      };
      it(`should index audit log when failing to unregister MFA - wrong MFA type calling ${endpoint}`, async () => {
        await executeTest('sms', 'failure');
      });
      it(`should index audit log when unregistering MFA calling ${endpoint}`, async () => {
        await executeTest('ga', 'success');
      });
            
    });
      
    // POST /api/admin/current-user/mfa/register - RegisterMFA
      // POST /api/admin/users/:userId/mfa/register - RegisterMFA (as admin)
      // body: {type: 'ga' | 'sms', phoneNumber: string (if type is sms)}
      [
      '/admin/current-user/mfa/register',
      '/admin/users/:userId/mfa/register'
    ].forEach((endpoint) => {
      const executeTest = async (type, actionResult) => {
        // 1. create test user and set initial password
        let result = await helpersAuditLog.loginWithConfiguredUser();
        const testPassword = 'T3stP@ssw0rd';
        const CONFIG_ADMIN_TOKEN = result.userLogin.token;
        configAdminToken = CONFIG_ADMIN_TOKEN;
        // // 1. create user to impersonate
        const userData = helpersAuditLog.createRandomUserData();
        result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
        const organizationId = result.createOrganization.id;
        result = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          userData.email,
          testPassword,
          organizationId
        );
        userId = result.createUser.id;
        // 2. authenticate with test user
        result = await helpersAuditLog.loginUser(
          result.createUser.name,
          testPassword
        );
        const tempUserToken = result.userLogin.token;        
        await helpersAuditLog.dbUpdateUserMFAVerified(userId);
        await helpersAuditLog.redisSetKey('PASSWORD', tempUserToken, { userId: userId }, redisClient);
        // 3. Register MFA
        const correlationID = helpersAuditLog.buildCorrelationID();
        
        const configuredEndpoint = endpoint
          .replace(':userId', userId)          
        result = await helpersAuditLog.adminRegisterMFA(
          endpoint.includes(':userId') ? CONFIG_ADMIN_TOKEN : tempUserToken,
          correlationID,
          configuredEndpoint,
          { type, phoneNumber: '234567890' },
        );        
        // 5. validate audit log
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          result
        );
        const expectedAuditLogItems = [
          {
            eventType: 'authentication',
            eventName: 'RegisterMFA',
            actionResult
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        if(auditLogItems.actionResult === 'success') {
          expectedAuditLogItems[0].actionDetails = expect.stringMatching(
            /^ga MFA registration*$/
          );
        }
        if(auditLogItems.actionResult === 'failure') {
          expectedAuditLogItems[0].actionDetails = expect.stringMatching(
            /^Failed sms MFA registration*$/
          );
        }
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      };
      it(`should index audit log when failing to register MFA - wrong MFA type calling ${endpoint}`, async () => {
        await executeTest('sms', 'failure');
      });
      it(`should index audit log when registering MFA calling ${endpoint}`, async () => {
        await executeTest('ga', 'success');
      });
    });

    describe('SessionEnded', () => {
      let testUserId;
      let testOrgId;

      afterEach(async () => {        
        if (testUserId && configAdminToken) {
          try {
            await helpersAuditLog.deleteUser(configAdminToken, testUserId);
          } catch (err) { }
          testUserId = null;
        }
        testOrgId = null;
      });

            
      // Note: the sweeper runs without a request context, so the audit event
      // it emits doesn't carry a caller-injected correlation ID. We can't use
      // the same method as every other audit log citest does to pull the ES index entry
      it('sweeper consumes a seeded expired session and drains the audit index (end-to-end smoke)', async () => {
        const login = await helpersAuditLog.loginWithConfiguredUser();
        const sessionToken = login.userLogin.token;
        const pastMs = Date.now() - 5000;

        await helpersAuditLog.seedExpiredSessionInRedis(redisClient, sessionToken, {
          userId: _.get(login, 'userLogin.userId'),
          userName: helpersAuditLog._config.userName,
          organizationId: _.get(login, 'userLogin.organization.id'),
          applicationId: 'system',
          loginAt: pastMs - 12 * 3600 * 1000
        }, pastMs);

        // Confirm the seed landed.
        const beforeScore = await new Promise((resolve, reject) => {
          redisClient.zscore('pending_session_audits', sessionToken, (err, score) =>
            err ? reject(err) : resolve(score)
          );
        });
        expect(beforeScore).not.toBeNull();

        await helpersAuditLog.triggerSessionExpirySweep();

        // Poll for the ZSET entry to disappear. That's the evidence the sweeper consumed it.        
        let afterScore = beforeScore;
        for (let i = 0; i < 30 && afterScore !== null; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          afterScore = await new Promise((resolve, reject) => {
            redisClient.zscore('pending_session_audits', sessionToken, (err, score) =>
              err ? reject(err) : resolve(score)
            );
          });
        }
        expect(afterScore).toBeNull();

        // SESSION_META should also be gone.
        const metaAfter = await new Promise((resolve, reject) => {
          redisClient.hgetall(`SESSION_META:${sessionToken}`, (err, val) =>
            err ? reject(err) : resolve(val)
          );
        });
        expect(metaAfter).toBeFalsy();
      });
      
      it('should index SessionEnded with reason=admin_user_delete when an active user is deleted', async () => {
        // 1. Admin token + create a target user.
        let result = await helpersAuditLog.loginWithConfiguredUser();
        configAdminToken = result.userLogin.token;
        const testPassword = 'T3stP@ssw0rd';
        const userData = helpersAuditLog.createRandomUserData();
        result = await helpersAuditLog.createOrganization(configAdminToken);
        testOrgId = result.createOrganization.id;
        result = await helpersAuditLog.createUser(
          configAdminToken, userData.email, testPassword, testOrgId
        );
        testUserId = result.createUser.id;

        // 2. Log that user in so they have an active session in Redis.
        await helpersAuditLog.loginUser(userData.email, testPassword);

        // 3. Delete the user via the admin path.
        // This emits SessionEnded for each active session before purging.
        const targetUserId = testUserId;
        const correlationID = helpersAuditLog.buildCorrelationID();
        await helpersAuditLog.deleteUser(
          configAdminToken, targetUserId, correlationID
        );
        // afterEach will skip cleanup since we already deleted the user.
        testUserId = null;

        // deleteUser goes GraphQL -> core-admin, which does not forward the
        // correlation id, so the SessionEnded event carries an internally
        // generated one. Locate it by the freshly-created user's id (targetId)
        // instead - it is unique to this run, so a match cannot come from
        // pre-existing data left by a previous run.
        const expectedAuditLogItems = [
          {
            eventType: 'authentication',
            eventName: 'SessionEnded',
            actionResult: 'success',
            actionDetails: expect.stringContaining('admin_user_delete')
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilterNoCorrelationId(
          { targetId: targetUserId },
          expectedAuditLogItems
        );
        expect(auditLogItems).toBeDefined();
        expect(auditLogItems.length > 0).toBeTruthy();
        expect(auditLogItems[0]).toMatchObject(expectedAuditLogItems[0]);
      });

      it('should index SessionEnded with reason=admin_org_delete when org is soft-deleted with active users', async () => {
        let result = await helpersAuditLog.loginWithConfiguredUser();
        configAdminToken = result.userLogin.token;
        const testPassword = 'T3stP@ssw0rd';
        const userData = helpersAuditLog.createRandomUserData();
        result = await helpersAuditLog.createOrganization(configAdminToken);
        testOrgId = result.createOrganization.id;
        result = await helpersAuditLog.createUser(
          configAdminToken, userData.email, testPassword, testOrgId
        );
        testUserId = result.createUser.id;
        await helpersAuditLog.loginUser(userData.email, testPassword);

        const correlationID = helpersAuditLog.buildCorrelationID();
        const delRes = await helpersAuditLog.deleteOrganization(
          correlationID, configAdminToken, testOrgId
        );
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(delRes);

        const expectedAuditLogItems = [
          {
            eventType: 'authentication',
            eventName: 'SessionEnded',
            actionResult: 'success',
            actionDetails: expect.stringContaining('admin_org_delete')
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID, expectedAuditLogItems
        );
        validateExpectedEvents({
          auditLogItems, expectedAuditLogItems, correlationID, correlationIDResponse
        });
      });

      it('should index SessionEnded with reason=password_change when password reset terminates active sessions', async () => {
        let result = await helpersAuditLog.loginWithConfiguredUser();
        configAdminToken = result.userLogin.token;
        const testPassword = 'T3stP@ssw0rd';
        const userData = helpersAuditLog.createRandomUserData();
        result = await helpersAuditLog.createOrganization(configAdminToken);
        testOrgId = result.createOrganization.id;
        result = await helpersAuditLog.createUser(
          configAdminToken, userData.email, testPassword, testOrgId
        );
        testUserId = result.createUser.id;
        const userName = result.createUser.name;
        await helpersAuditLog.loginUser(userData.email, testPassword);

        const resetToken = await helpersAuditLog.generatePasswordResetToken(testUserId);
        const correlationID = helpersAuditLog.buildCorrelationID();
        const resetRes = await helpersAuditLog.adminPasswordReset(
          resetToken, correlationID, userName, testPassword
        );
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(resetRes);

        const expectedAuditLogItems = [
          {
            eventType: 'authentication',
            eventName: 'SessionEnded',
            actionResult: 'success',
            actionDetails: expect.stringContaining('password_change')
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID, expectedAuditLogItems
        );
        validateExpectedEvents({
          auditLogItems, expectedAuditLogItems, correlationID, correlationIDResponse
        });
      });
      
      it('should index SessionEnded with reason=forced_password_reset when admin forces a reset on a logged-in user', async () => {
        let result = await helpersAuditLog.loginWithConfiguredUser();
        configAdminToken = result.userLogin.token;
        const testPassword = 'T3stP@ssw0rd';
        const userData = helpersAuditLog.createRandomUserData();
        result = await helpersAuditLog.createOrganization(configAdminToken);
        testOrgId = result.createOrganization.id;
        result = await helpersAuditLog.createUser(
          configAdminToken, userData.email, testPassword, testOrgId
        );
        testUserId = result.createUser.id;
        await helpersAuditLog.loginUser(userData.email, testPassword);

        const correlationID = helpersAuditLog.buildCorrelationID();
        
        const forceRes = await helpersAuditLog.coreAdminRequest(
          `/admin/users/${testUserId}/force-password-reset`,
          'POST',
          configAdminToken,
          { skipPasswordResetEmail: true },
          null,
          correlationID
        );
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(forceRes);

        const expectedAuditLogItems = [
          {
            eventType: 'authentication',
            eventName: 'SessionEnded',
            actionResult: 'success',
            actionDetails: expect.stringContaining('forced_password_reset')
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID, expectedAuditLogItems
        );
        validateExpectedEvents({
          auditLogItems, expectedAuditLogItems, correlationID, correlationIDResponse
        });
      });
    });
  }
);
