const GraphqlClient = require('../helpers/gql.js');
const CoreAdminClient = require('../helpers/coreAdmin.js');
const helpers = require('../helpers/index.js');
const supertest = require('supertest');
const uuid = require('uuid');
const _ = require('lodash');
const moment = require('moment');
const { Client } = require('pg');
const redis = require('redis');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const crypto = require('crypto-js');
const sha256 = require('crypto-js/sha256');

const _DEFAULT_ENV_TO_RUN_IN = 'local-compose';
const _DEFAULT_ENV_TO_ISO = 'local-compose-ISO';
const _DEFAULT_CI_TEST_SERVICE_TOKEN =
  'citest_service_token:dbd399ece3554c9d9fa3d1015e743b5858468ad2eeb540f2b58556ff69562c50';
const _DEFAULT_organizationId = 7682;
const _DEFAULT_applicationID = 'ea1d26ab-0d29-4e97-8ae7-d998a243374e';
const _DEFAULT_roleID = '5e9cfff9-4652-4755-ae49-796615079375';
const _DEFAULT_elasticRetryAttempts = 60;
const _DEFAULT_elasticSleepBetweenRetryAttempts = 1000;
const _DEFAULT_elasticQuerySize = 1000;
const _DEFAULT_initializationAttemptRetries = 20;
const _DEFAULT_initializationSleepBetweenRetryAttempts = 1000;


const authFailureReason = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  NON_EXISTENT_USER: 'NON_EXISTENT_USER'
};

async function buildAndInitializeAuditLogHelpers(config, options) {
  if (!options) options = {};
  options && !options.elasticRetryAttempts
    ? (options.elasticRetryAttempts = _DEFAULT_elasticRetryAttempts)
    : null;

  const helpersAuditLog = new AuditLogHelpers(config, options);

  // NOTE: if using options.configurableEventsDB there must be a triggering event to flush eventing service cache
  // therefore options.configurableEvents must be passed as well with at least one supported event (LoginSucceeded)
  if (options && options.baselineEvents) {
    await helpersAuditLog.initDB();
  }


  await helpersAuditLog.initGqlClient();
  await helpersAuditLog.initAdminClient();
  await helpersAuditLog.addApplications();
  await helpersAuditLog.enableReadAuditLoggingForConfigUser();

  await helpersAuditLog.waitForAuditLogIndexingPipeline(120, config.apiToken);

  if (options && (options.configurableEvents || options.removeEvents)) {
    await helpersAuditLog.initAuditLogConfigurableEvents();
  }

  helpersAuditLog._elasticRetryAttempts = _DEFAULT_elasticRetryAttempts;
  return helpersAuditLog;
}

/*
  THIS DOES NOT TEST THAT A PROPERTY DOES NOT EXIST ON THE EVENT
  THE expectedAuditLogItems.event HAS TO HAVE THE PROPERTIES OTHERWISE IT WILL NOT BE TESTED see toMatchObject
*/
function validateExpectedEvents({
  auditLogItems,
  expectedAuditLogItems,
  correlationID,
  correlationIDResponse
}) {
  expect(auditLogItems).toBeDefined();
  expect(auditLogItems.length > 0).toBeTruthy();
  for (const expectedAuditLogItem of expectedAuditLogItems) {
    const expectedAuditLogItemKeys = Object.keys(expectedAuditLogItem);
    const auditLogItem = auditLogItems.find((item, index) => {
      try {
        for (const key of expectedAuditLogItemKeys) {
          const expectedValue = expectedAuditLogItem[key];
          const actualValue = item[key];

          // support matchers like expect.stringContaining, expect.any, etc.
          if (
            typeof expectedValue === 'object' &&
            expectedValue !== null &&
            typeof expectedValue.asymmetricMatch === 'function'
          ) {
            expect(actualValue).toEqual(expectedValue);
          } else {
            if (actualValue !== expectedValue) return false;
          }
        }
        return true;
      } catch (error) {
        return false;
      }
    });
    if (!auditLogItem) {
      // the following will fail and print the mismatched content
      expect(JSON.stringify(auditLogItems)).toEqual(JSON.stringify(expectedAuditLogItems));
    }
    expect(auditLogItem).toBeDefined();
    expect(auditLogItem.correlationId).toEqual(correlationID);
    /*
      THIS DOES NOT TEST THAT SOMETHING DOES NOT EXIST ON THE EVENT
      EXPECTED OBJECT MUST EXPLICITLY SET WHAT IT NEEDS TO HAVE OTHERWISE IT WILL NOT BE TESTED
      {
      actionResult: 'failure',
      }
      will match that the object has
      {
      actionResult: 'failure',
      }

      BUT WILL NOT CARE IF IT HAS MORE PROPERTIES
      {
      actionResult: 'failure',
      }
      will match the below
      {
      actionResult: 'failure',
      additionalData: 'true'
      }
      SEE https://jestjs.io/docs/expect#tomatchobjectobject
    */
    expect(auditLogItem).toMatchObject(expectedAuditLogItem);
  }

  if (correlationIDResponse) {
    expect(correlationID).toEqual(correlationIDResponse);
  }
}

function validateExpectedEmailEvent({ auditLogItems, expectedAuditLogItems }) {
  expect(auditLogItems).toBeDefined();
  expect(auditLogItems.length > 0).toBeTruthy();

  for (const expectedAuditLogItem of expectedAuditLogItems) {
    const expectedAuditLogItemKeys = Object.keys(expectedAuditLogItem);
    const auditLogItem = auditLogItems.find((item) => {
      try {
        for (const key of expectedAuditLogItemKeys) {
          const expectedValue = expectedAuditLogItem[key];
          const actualValue = item[key];

          // support matchers like expect.stringContaining, expect.any, etc.
          if (
            typeof expectedValue === 'object' &&
            expectedValue !== null &&
            typeof expectedValue.asymmetricMatch === 'function'
          ) {
            expect(actualValue).toEqual(expectedValue);
          } else {
            if (actualValue !== expectedValue) return false;
          }
        }
        return true;
      } catch (error) {
        return false;
      }
    });
    expect(auditLogItem).toBeDefined();
    expect(auditLogItem).toMatchObject(expectedAuditLogItem);
  }
}

class AuditLogHelpers {
  constructor(config, options) {
    this._configurableEvents =
      options && options.configurableEvents ? options.configurableEvents : [];
    this._baselineEvents =
      options && options.baselineEvents ? options.baselineEvents : [];
    this._removeEvents =
      options && options.removeEvents ? options.removeEvents : [];
    this._env = config.env;
    this._config = config;
    this._adminUrl = config.core_admin_url
      ? config.core_admin_url
      : 'https://api.' + config.env + '.veritone.com/v1';
    this._elasticUrl = config.elastic_url
      ? config.elastic_url
      : 'http://localhost:9200';
    this._postgresUrl = config.postgres_url ? config.postgres_url : 'localhost';
    this._nsqdUrl = config.nsqd_url ? config.nsqd_url : 'http://localhost:4151';

    this._auditLogIndexMonth = `0${new Date().getMonth() + 1}`.slice(-2);
    this._audtLogIndex = `audit_log-${new Date().getFullYear()}.${
      this._auditLogIndexMonth
    }`;
    this._userAgent = config.userAgent || 'core-graphql-server test';

    this._organizationID =
      options && options.organizationID
        ? options.organizationID
        : _DEFAULT_organizationId;
    this._applicationID =
      options && options.applicationID
        ? options.applicationID
        : _DEFAULT_applicationID;
    this._roleID = options && options.roleID ? options.roleID : _DEFAULT_roleID;
    this._elasticRetryAttempts =
      options && options.elasticRetryAttempts
        ? options.elasticRetryAttempts
        : _DEFAULT_elasticRetryAttempts;
    this._elasticSleepBetweenRetryAttempts =
      options && options.elasticSleepBetweenRetryAttempts
        ? options.elasticSleepBetweenRetryAttempts
        : _DEFAULT_elasticSleepBetweenRetryAttempts;
    this._elasticQuerySize =
      options && options.elasticQuerySize
        ? options.elasticQuerySize
        : _DEFAULT_elasticQuerySize;
    this._initializationAttemptRetries = _DEFAULT_initializationAttemptRetries;
    this._initializationSleepBetweenRetryAttempts =
    options && options.initializationSleepBetweenRetryAttempts ?
      options.initializationSleepBetweenRetryAttempts :
      _DEFAULT_initializationSleepBetweenRetryAttempts;
  }

  buildCorrelationID() {
    const correlationID = uuid.v4();
    if (this._config.debug) {
      console.log('######correlationID', correlationID);
    }
    return correlationID;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async initAuditLogConfigurableEvents() {
    let initializationAttempts = 0;
    let lastCorrelationId;
    while (initializationAttempts < this._initializationAttemptRetries) {
      try {
        const correlationID = this.buildCorrelationID();
        lastCorrelationId = correlationID;
        const gqlClient = new GraphqlClient(this._env);
        await gqlClient.connect();
        gqlClient.userAuth.headers['Veritone-Correlation-ID'] = correlationID;
        const result = await gqlClient.query(`mutation {
        updateInstanceAuditLogConfig(input: {
          addAuditEvents: [${this._configurableEvents}]
          removeAuditEvents: [${this._removeEvents}]
        }) {
          configurableEvents
        }
      }`);
        const correlationIDResponse = this.getCorrelationIDFromResponse(result);
        if (this._config.debug) {
          console.log(
            '######initAuditLogConfigurableEvents-mutation:updateInstanceAuditLogConfig',
            {
              correlationID,
              correlationIDResponse,
              configurableEvents: this._configurableEvents,
              result: result.updateInstanceAuditLogConfig
            }
          );
        }
        const actionDetails = `Updated the audit log configuration`;
        const expectedAuditLogItems = [
          {
            actionResult: 'success',
            actionDetails,
            eventType: 'platform',
            eventName: 'AuditLogConfigChange'
          }
        ];
        const auditLogItems = await this.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        if (this._config.debug) {
          console.log(
            '######initAuditLogConfigurableEvents-ES-query-auditLogItems',
            {
              correlationID,
              auditLogItems
            }
          );
        }
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });

        // "actionName": "update",
        //                 "actionResult": "success",
        //                 "actionDetails": "{\"addAuditEvents\":[\"IntegrationSettings\"],\"removeAuditEvents\":[]}",
        //                 "targetId": "N/A",
        //                 "targetType": "tt_Platform",
        //                 "userId": "10ffa55a-d68b-494b-83df-49ce2d008e6d",
        //                 "userName": "sys_graphql_citest_superadmin@veritone.com",
        //                 "requestIP": "::ffff:172.31.0.14",
        //                 "userAgent": "core-graphql-server test",
        //                 "organizationId": "7682",
        //                 "originatorApplication": "GraphQL-CI-Test",
        //                 "originatorService": "core-graphql-server",
        //                 "timestamp": "2024-08-30T15:19:11.884Z",
        //                 "eventType": "platform",
        //                 "eventName": "AuditLogConfigChange",
        //                 "correlationId": "707f9b4a-f266-42e3-8173-230a141b45cf",
        //                 "organizationName": "Veritone, Inc.",
        //                 "organizationGuid": "ed075985-bc94-406b-8639-44d1da42c3fb"
        break;
      } catch (error) {
        if (this._config.debug) {
          console.error('######initAuditLogConfigurableEvents-error', error);
        }
        this.sleep(this._initializationAttemptRetries);
        initializationAttempts++;
        await this.sleepAsync(this._elasticSleepBetweenRetryAttempts);
      }
    }

    if (initializationAttempts >= this._initializationAttemptRetries) {
      const dumpData = await this._dumpIndexContents();
      throw new Error(
        `Failed to initialize AuditLogHelpers.initAuditLogConfigurableEvents after ${initializationAttempts} attempts, correlationId: ${lastCorrelationId}, index: ${JSON.stringify(dumpData)}`
      );
    }
  }

  async initDB() {
    const client = new Client({
      connectionString: `postgres://postgres:postgres@${this._postgresUrl}:5432/platform?sslmode=disable`
    });
    const sql = `UPDATE aiware.audit_config
    SET baseline_events = ARRAY(
        SELECT DISTINCT unnest(baseline_events || ARRAY[
          ${this._baselineEvents.map((i) => `'${i}'`)}
        ])
    )
    WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1;`;
    // 'access_media',
    //         'audit_forbidden_action_token',
    //         'audit_forbidden_action_user',
    //         'application_create',
    //         'application_update',
    //         'application_delete',
    //         'cluster_delete',
    //         'cluster_update',
    //         'engine_build_pause',
    //         'engine_build_unpause',
    //         'engine_build_submit',
    //         'audit_login_attempts_exceeded',
    //         'new_version_installed',
    //     'integration_settings',
    //         'organization_create',
    //         'organization_update',
    //         'organization_delete',
    //     'organization_invitation',
    //         'organization_invitation_accepted',
    //         'organization_invitation_rejected',
    //         'organization_request',
    //         'organization_request_rejected',
    //         'organization_request_approved',
    //         'package_created',
    //         'package_deleted',
    //         'package_approved',
    //         'package_grant_set',
    //         'package_grant_removed',
    //         'package_installed',
    //         'package_rejected',
    //         'user_create',
    //         'user_created',
    //         'user_update',
    //         'user_delete',
    //         'user_deleted',
    //         'trial_sign_up',
    //         'developer_trial_sign_up',
    //         'automate_studio_sign_up',
    //         'aws_referral_sign_up',
    //         'redact_self_service_sign_up',
    //         'benchmark_sign_up',
    //         'verisafe_sign_up',
    //         'voice_sign_up',
    //         'sportx_sign_up',
    //         'recording_deleted',
    //         'recording_created',
    //         'recording_inserted',
    //         'recording_cognition_completed',
    //         'recording_insert_failed',
    //         'watchlist_updated'
    await client.connect();
    await client.query(sql);
    await client.end();
  }

  async addApplications() {
    const ssoClient = new Client({
      connectionString: `postgres://postgres:postgres@${this._postgresUrl}:5432/sso?sslmode=disable`
    });

    const addApps = `
      INSERT INTO public.application(application_id, application_name, application_key, application_status, application_description,
      application_url, application_check_permissions, application_order, owner_organization_id, deployment_model, application_free_trial_months,
      application_monthly_charge, application_charge_per_user, public, headerbar_enabled, metadata_version)
      VALUES
      ('c660093d-4958-4402-a6e5-f68841cd7c16', 'Verisafe', 'Verisafe', 'active', 'verisafe', 'https://app.verisafe.ai', false, 0,
      7682, 0, 0, 0, 0, false, false, 1),
      ('3a9a9364-535c-4388-920a-806c3664a2bb', 'Voice', 'Voice', 'active', 'Veritone Voice v2.0', 'https://app.voice.ai', false, 0,
      7682, 0, 0, 0, 0, false, false, 1)
      ON CONFLICT (application_id) DO NOTHING;
    `;
    await ssoClient.connect();
    await ssoClient.query(addApps);
    await ssoClient.end();
  }

  async enableReadAuditLoggingForConfigUser() {
    const ssoClient = new Client({
      connectionString: `postgres://postgres:postgres@${this._postgresUrl}:5432/sso?sslmode=disable`
    });

    const sql = `
      UPDATE public.sso_user
        SET kvp = jsonb_set(kvp::jsonb, '{readAuditEvents}', 'true'::jsonb, true)
        WHERE user_name='sys_graphql_citest_superadmin@veritone.com';
    `;

    await ssoClient.connect();
    await ssoClient.query(sql);
    await ssoClient.end();
  }

  async initRedis() {
    const redisClient = redis.createClient({
      host: this._config.redis.host,
      port: this._config.redis.port
    });
    return new Promise((resolve, reject) => {
      redisClient.on('connect', () => {
        resolve(redisClient);
      });

      redisClient.on('error', (err) => {
        reject(err);
      });
    });
  }

  getLoginAttemtpsCacheKey() {
    return `LOGIN_ATTEMPTS:${this._config.userName}`;
  }

  setMaxLoginAttemptsInCache(redisClient) {
    const key = this.getLoginAttemtpsCacheKey();
    return new Promise((resolve, reject) => {
      // max attempts are set in the runall/config/admin.json
      redisClient.set(key, 10000, (err, reply) => {
        if (err) {
          reject(err);
        } else {
          resolve(reply);
        }
      });
    });
  }

  async getUserMultiFactorAuthentication(
    userId,
    redisClient,
    authToken,
    causeError,
    key = 'LOGIN',
    verified = true
  ) {
    const secret = speakeasy.generateSecret();
    const token = speakeasy.totp({
      secret: secret.base32,
      window: 6,
      encoding: 'base32'
    });

    const encryptedSecret = crypto.AES.encrypt(
      secret.base32,
      this._config.mfa.secretAesPassword
    ).toString();

    // set mfa details in db
    const sql = `
			UPDATE
				sso_user u
      SET mfa_ga_shared_secret = $2, mfa_ga_verified_date = ${
        verified ? `now()` : null
      }, mfa_default_option = 'ga'
			WHERE
				u.user_id = $1`;
    const client = new Client({
      connectionString: `postgres://postgres:postgres@${this._postgresUrl}:5432/sso?sslmode=disable`
    });
    client.connect();
    await client.query(sql, [userId, encryptedSecret]);
    client.end();

    // set login token in redis
    await redisClient.set(`${key}:${authToken}`, `{ "userId": "${userId}" }`);

    // return invalid OTP
    if (causeError) return 100000;

    return token;
  }

  async redisSetKey(prefix, key, value, redisClient) {
    const insertValue =
      typeof value === 'string' ? value : JSON.stringify(value);
    await redisClient.set(`${prefix}:${key}`, insertValue);
  }

  adminUnregisterMfa(token, correlationID, endpoint, skipPayload = false) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    const url = `${this._adminUrl}${endpoint}`;
    if (skipPayload) {
      return supertest(url).post('').set(headers.headers);
    }
    return supertest(url)
      .post('')
      .send({ passwordToken: token })
      .set(headers.headers);
  }

  adminVerifyMfaToken(token, correlationID, mfaToken) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    const url = `${this._adminUrl}/admin/mfa/verify/${mfaToken}`;
    return supertest(url).post('').set(headers.headers);
  }

  adminVerifyUserMFARegistration(token, correlationID, endpoint, sendPayload = true) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    if (sendPayload) {
      return supertest(this._adminUrl)
        .post(endpoint)
        .send({ passwordToken: token })
        .set(headers.headers);
    } else {
      return supertest(this._adminUrl).post(endpoint).set(headers.headers);
    }
  }

  adminRegisterMFA(token, correlationID, endpoint, payload) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;    
    return supertest(this._adminUrl)
      .post(endpoint)
      .send({...payload, passwordToken: token })
      .set(headers.headers);
  }

  adminPasswordToken(correlationID, userName, password, token) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    const url = `${this._adminUrl}/admin/password-token`;
    return supertest(url)
      .post('')
      .send({ userName, password })
      .set(headers.headers);
  }

  adminImpersonate(token, correlationID, targetId) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    const url = `${this._adminUrl}/admin/impersonate/${targetId}`;
    return supertest(url).get('').set(headers.headers);
  }

  adminPasswordReset(token, correlationID, userName, password) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    return supertest(this._adminUrl)
      .post('/admin/password/reset')
      .send({ userName, password, token })
      .set(headers.headers);
  }

  adminPasswordChange(
    token,
    correlationID,
    oldPassword,
    newPassword,
    endpoint
  ) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    return supertest(this._adminUrl)
      .post(endpoint)
      .send({ newPassword, oldPassword })
      .set(headers.headers);
  }

  async initGqlClient() {
    this._gqlClient = new GraphqlClient(this._env);
    await this._gqlClient.connect();
  }

  async initAdminClient() {
    this._coreAdminClient = new CoreAdminClient(this._env);
    await this._coreAdminClient.connect();
  }

  createRandomUserData() {
    return {
      email: `user_${this.createRandomString()}@localhost.com`,
      firstName: this.createRandomString('TEST-firstName'),
      lastName: this.createRandomString('TEST-lastName')
    };
  }

  createRandomString(prefix) {
    return `${prefix === undefined ? '' : prefix + '_'}${_.toString(
      Date.now()
    )}`;
  }

  async loginWithConfiguredUser(correlationID, causeFailure) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationuserLogin(
      this._config.userName,
      this._config.password,
      causeFailure
    );
    const headers = this.buildHeadersNoBearerToken(correlationID);
    return this._gqlClient.query(mutation, null, headers);
  }

  async loginUser(username, password, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationuserLogin(username, password);
    const headers = this.buildHeadersNoBearerToken(correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async setCacheOpenIdAuth(
    cacheKey,
    identifier,
    connectId,
    sessionState,
    redisClient
  ) {
    const key = `AUTHENTICATION_INFO:${cacheKey}`;
    await redisClient.set(
      key,
      JSON.stringify({
        identifier: identifier || 'a',
        connectId: connectId || 'b',
        sessionState: sessionState || 'active'
      })
    );
  }

  /**
   * @param {string} endpoint - core-admin endpoint
   * @param {string} method - e.g., 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'.
   * @param {string} token - authorization token.
   * @param {object} [body=null] - The request body for methods like POST, PUT, PATCH.
   * @param {object} [query=null] - An object representing URL query parameters.
   * @param {string} [correlationID=null] - A unique ID for request correlation.
   * @returns {Promise<object>} The response body, or an empty object on error.
   */
  async coreAdminRequest(endpoint, method, token, body, query, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    let data;
    try {
      const url = `${this._adminUrl}${endpoint}`;
      const headers = helpers.requestOptions(token);
      headers.headers['Veritone-Correlation-ID'] = correlationID;

      let request;
      switch (method.toUpperCase()) {
        case 'GET':
          request = supertest(url).get('');
          break;
        case 'POST':
          request = supertest(url).post('');
          break;
        case 'PUT':
          request = supertest(url).put('');
          break;
        case 'DELETE':
          request = supertest(url).delete('');
          break;
        case 'PATCH':
          request = supertest(url).patch('');
          break;
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }

      request = request.set(headers.headers);

      if (query && typeof query === 'object' && Object.keys(query).length > 0) {
        request = request.query(query);
      }

      const methodsWithBody = ['POST', 'PUT', 'PATCH', 'DELETE'];
      if (body && methodsWithBody.includes(method.toUpperCase())) {
        request = request.send(body);
      }

      // Execute the request
      data = await request;
    } catch (error) {
      console.error(`Error calling core-admin: ${error.message}`, error);
      data = null;
    }
    return (data || {}).body;
  }

  async createToken(
    rights,
    namePrefix,
    internal = false,
    label = 'citest-token'
  ) {
    const client = new Client({
      connectionString: `postgres://postgres:postgres@${this._postgresUrl}:5432/sso?sslmode=disable`
    });
    const hash =
      namePrefix + ':' + sha256(new Date().getTime().toString()).toString();
    const tokenJson = {
      rights,
      tokenId: hash,
      internal: internal,
      isRevoked: false,
      tokenLabel: label
    };
    const sql = `INSERT INTO public.sso_token (
            token_id,
            json
        ) VALUES (
            $1,
            $2::jsonb
        );`;
    await client.connect();
    await client.query(sql, [hash, tokenJson]);
    await client.end();
    return hash;
  }

  async instanceAuditLogConfig(
    token,    
    correlationID,    
  ) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildQueryInstanceAuditLogConfig();
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async createUser(
    token,
    username,
    password,
    organizationId,
    correlationID,
    roleIds,
    userOptions = {}
  ) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationcreateUser(
      username,
      password,
      organizationId,
      roleIds,
      userOptions
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async createUsers(
    token,
    count,
    organizationId,
    namePrefix = 'citest-should-delete-user',
    password,
    roleIds
  ) {
    const users = [];

    for (let i = 0; i < count; i++) {
      const unique = `${Date.now()}-${uuid.v4()}`;
      const username = `${namePrefix}-${i}-${unique}@localhost.com`;

      const result = await this.createUser(
        token,
        username,
        password,
        organizationId,
        null,
        roleIds,
        {
          firstName: `AuditFirst${i}`,
          lastName: `AuditLast${i}`,
        }
      );

      users.push(result.createUser);
    }

    return users;
  }

  async deleteUser(token, userID, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationdeleteUser(userID);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async deleteTDO(token, tdoID, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationdeleteTDO(tdoID);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  buildMutationdeleteTDO(tdoID) {
    return `
    mutation {
      deleteTDO(id: "${tdoID}") {
        id
      }
    }
    `;
  }

  async createTDO(token, correlationID, options = {}) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationcreateTDO(options.invalid);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async updateTDO(tdoID, token, correlationID, options = {}) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationupdateTDO(tdoID, options.invalid);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async getTDO(token, tdoID, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const query = this.buildQuerygetTDO(tdoID);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(query, null, headers);
  }

  buildQuerygetTDO(tdoID) {
    return `
    query {
      temporalDataObject(id: "${tdoID}") {
        id
        startDateTime
        stopDateTime
      }
    }`;
  }

  async createAsset(token, name, tdoID, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const query = this.buildQueryCreateAsset(name, tdoID);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(query, null, headers);
  }

  buildQueryCreateAsset(name, tdoID) {    
    return `
    mutation {
      createAsset(input: {
      name: "${name}"
      containerId: "${tdoID}"
      assetType: "{}"
      uri: "www.veritone.com"
      contentType: "application/json"
    }) {
    id
  }
}`;
  }

  async getAsset(token, assetId, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const query = this.buildQuerygetAsset(assetId);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(query, null, headers);
  }

  buildQueryInstanceAuditLogConfig() {
    return `
    query {
      instanceAuditLogConfig {
        immutableEvents
        configurableEvents
      }
    }`
  }

  buildQuerygetAsset(assetId) {
    return `
    query {
      asset(id: "${assetId}") {
        id
        name
        uri
      }
    }`;
  }

  buildMutationcreateTDO(invalid = false) {
    const inputFields = `
      startDateTime: "${moment().subtract(15, 'minutes').toISOString()}"
      stopDateTime: "${moment().toISOString()}"
      ${invalid ? 'parentFolderId: "invalid-folder-id"' : ''}
    `;
    return `
    mutation {
      createTDO(input: {
       ${inputFields}
      }) {
        id
        startDateTime
        stopDateTime
      }
    }
    `;
  }

  buildMutationupdateTDO(tdoID, invalid = false) {
    const inputFields = `
      ${invalid ? `details: { sourceData: "invalid-value" }` : ''}
    `;
    return `
    mutation {
      updateTDO(input: {
        id: "${tdoID}"
        status: "recorded"
        ${inputFields}
      }) {
        id
        streamManifest {
          segments
          initSegment
        }
      }
    }
    `;
  }

  async createAssetMp4(token, tdoID, fileName, filePath, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationcreateAssetMp4(tdoID);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.uploadFile(
      mutation,
      fileName,
      filePath,
      null,
      headers
    );
  }

  buildMutationcreateAssetMp4(tdoID) {
    return `
    mutation {
      createAsset(input: {
        containerId: "${tdoID}"
        assetType: "media"
        contentType: "video/mp4"
      }) {
        id
        uri
        signedUri
      }
    }
    `;
  }

  async updateWatchList(
    token,
    watchListID,
    watchListName,
    testSourceTypeIds,
    testSourceIds,
    correlationID
  ) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationupdateWatchList(
      watchListID,
      watchListName,
      testSourceTypeIds,
      testSourceIds
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  buildMutationupdateWatchList(
    watchListID,
    watchListName,
    testSourceTypeIds,
    testSourceIds
  ) {
    return `
      mutation {
        updateWatchlist(input: {
          isDisabled: false
          id: ${watchListID}
          name: "${watchListName}"
          details: {
            foo: "bar2"
            targetAudience: {
              foo: "bar2"
            }
            programIds: [-1]
          }
          searchIndex: mine
          sourceTypeIds: [${testSourceTypeIds}]
          sourceIds: [${testSourceIds}]
          cognitiveSearches: [
            {
              mentionStatusId: 1
              jsonstring: "{\\"and\\":[{\\"state\\":{\\"search\\":\\"foo2\\",\\"language\\":\\"en\\"}, \\"engineCategoryId\\":\\"67cd4dd0-2f75-445d-a6f0-2f297d6cd182\\"}]}"
            }
          ]
        }) {
          id
          name
          startDateTime
          stopDateTime
          modifiedDateTime
          createdDateTime
          sourceTypeIds
          sourceIds
          details
          searchIndex
          cognitiveSearches {
            id
          }
          isDisabled
        }
      }
    `;
  }

  async updateUser(token, userID, firstName, lastName, correlationID, roleIds) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationupdateUser(
      userID,
      firstName,
      lastName,
      roleIds
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async approveInvitationRequest(token, organizationInviteID, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationupdateOrganizationInviteApproveInvite(
      organizationInviteID,
      this._applicationID,
      this._roleID
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  modifyOptionsUpdateVeritoneCorrelationID(options, correlationID) {
    if (options && options.headers) {
      options.headers['Veritone-Correlation-ID'] = correlationID;
    }
    return options;
  }

  async approveInvitationRequestPassNoCorrelationIDHeader(
    token,
    organizationInviteID
  ) {
    const mutation = this.buildMutationupdateOrganizationInviteApproveInvite(
      organizationInviteID,
      this._applicationID,
      this._roleID
    );
    const headers = this.buildHeadersWithBearerTokenAndNoCorrelationID(token);
    if (headers.headers['Veritone-Correlation-ID']) {
      throw new Error(
        'Veritone-Correlation-ID should not be present in headers'
      );
    }
    return await this._gqlClient.query(mutation, null, headers);
  }

  async rejectInvitationRequest(token, organizationInviteID, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationupdateOrganizationInviteAdminRejectInvite(
      organizationInviteID,
      this._applicationID,
      this._roleID
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async rejectInvitationRequestPassNoCorrelationIDHeader(
    token,
    organizationInviteID
  ) {
    const mutation = this.buildMutationupdateOrganizationInviteAdminRejectInvite(
      organizationInviteID,
      this._applicationID,
      this._roleID
    );
    const headers = this.buildHeadersWithBearerTokenAndNoCorrelationID(token);
    if (headers.headers['Veritone-Correlation-ID']) {
      throw new Error(
        'Veritone-Correlation-ID should not be present in headers'
      );
    }
    return await this._gqlClient.query(mutation, null, headers);
  }

  async acceptInvite(token, organizationInviteID, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationupdateOrganizationInviteAcceptInvite(
      organizationInviteID,
      this._applicationID,
      this._roleID
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async acceptInvitePassNoCorrelationIDHeader(token, organizationInviteID) {
    const mutation = this.buildMutationupdateOrganizationInviteAcceptInvite(
      organizationInviteID,
      this._applicationID,
      this._roleID
    );
    const headers = this.buildHeadersWithBearerTokenAndNoCorrelationID(token);
    if (headers.headers['Veritone-Correlation-ID']) {
      throw new Error(
        'Veritone-Correlation-ID should not be present in headers'
      );
    }
    return await this._gqlClient.query(mutation, null, headers);
  }

  async rejectInvite(token, organizationInviteID, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationupdateOrganizationInviteRejectInvite(
      organizationInviteID,
      this._applicationID,
      this._roleID
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async rejectInvitePassNoCorrelationIDHeader(token, organizationInviteID) {
    const mutation = this.buildMutationupdateOrganizationInviteRejectInvite(
      organizationInviteID,
      this._applicationID,
      this._roleID
    );
    const headers = this.buildHeadersWithBearerTokenAndNoCorrelationID(token);
    if (headers.headers['Veritone-Correlation-ID']) {
      throw new Error(
        'Veritone-Correlation-ID should not be present in headers'
      );
    }
    return await this._gqlClient.query(mutation, null, headers);
  }

  async createOrganization(token, correlationID, name, orgGuid, features) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationcreateOrganization(name, orgGuid, features);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async deleteOrganization(correlationID, token, organizationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    const url = `${this._adminUrl}/admin/organizations/${organizationID}`;
    return supertest(url).delete('').set(headers.headers);
  }

  async createOrganizationPassNoCorrelationIDHeader(token, orgGuid) {
    const mutation = this.buildMutationcreateOrganization(null, orgGuid);
    const headers = this.buildHeadersWithBearerTokenAndNoCorrelationID(token);
    if (headers.headers['Veritone-Correlation-ID']) {
      throw new Error(
        'Veritone-Correlation-ID should not be present in headers'
      );
    }
    return await this._gqlClient.query(mutation, null, headers);
  }

  async createOrganizationInvite(
    token,
    organizationID,
    username,
    correlationID,
    isAdmin = false
  ) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationcreateOrganizationInvite(
      organizationID,
      username,
      this._applicationID,
      this._roleID,
      isAdmin
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async updateOrganizationInvite(
    token,
    organizationInviteID,
    action,
    correlationID
  ) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationUpdateOrganizationInvite(
      organizationInviteID,
      action
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async addUserIdToOrganizationInvite(userId, organizationInviteID) {
    const client = new Client({
      connectionString: `postgres://postgres:postgres@${this._postgresUrl}:5432/sso?sslmode=disable`
    });
    const sql = `UPDATE organization_invite
    SET user_id = $1
    WHERE organization_invite_id = $2;`;
    await client.connect();
    await client.query(sql, [userId, organizationInviteID]);
    await client.end();
  }

  async createOrganizationInvitePassNoCorrelationIDHeader(
    token,
    organizationID,
    username
  ) {
    const mutation = this.buildMutationcreateOrganizationInvite(
      organizationID,
      username,
      this._applicationID,
      this._roleID
    );
    const headers = this.buildHeadersWithBearerTokenAndNoCorrelationID(token);
    if (headers.headers['Veritone-Correlation-ID']) {
      throw new Error(
        'Veritone-Correlation-ID should not be present in headers'
      );
    }
    return await this._gqlClient.query(mutation, null, headers);
  }

  async updateOrganization(
    token,
    organizationID,
    organizationName,
    correlationID,
    status,
    features
  ) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationupdateOrganization(
      organizationID,
      organizationName,
      status,
      features
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async updateOrganizationPassNoCorrelationIDHeader(
    token,
    organizationID,
    organizationName,
    status
  ) {
    const mutation = this.buildMutationupdateOrganization(
      organizationID,
      organizationName,
      status
    );
    const headers = this.buildHeadersWithBearerTokenAndNoCorrelationID(token);
    if (headers.headers['Veritone-Correlation-ID']) {
      throw new Error(
        'Veritone-Correlation-ID should not be present in headers'
      );
    }
    return await this._gqlClient.query(mutation, null, headers);
  }

  async createOrganizationIntegrationConfig(
    token,
    integrationId,
    correlationID
  ) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationsetOrganizationIntegrationConfig(
      this._organizationID,
      integrationId
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  getOrganizationIntegrationConfig(token, integrationId, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    const url = `${this._adminUrl}/admin/integration/${integrationId}`;
    return supertest(url).get('').set(headers.headers);
  }

  getOrganizationIntegrationConfigDoNotPassCorrelationIDHeader(
    token,
    integrationId
  ) {
    const headers = helpers.requestOptions(token);
    delete headers.headers['Veritone-Correlation-ID'];
    if (headers.headers['Veritone-Correlation-ID']) {
      throw new Error(
        'Veritone-Correlation-ID should not be present in headers'
      );
    }
    const url = `${this._adminUrl}/admin/integration/${integrationId}`;
    return supertest(url).get('').set(headers.headers);
  }

  async addRoleToUser(token, correlationID, userId, roleId) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    const url = `${this._adminUrl}/admin/users/${userId}/roles/${roleId}`;
    return supertest(url).post('').set(headers.headers);
  }

  async removeRoleToUser(token, correlationID, userId, roleId) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    const url = `${this._adminUrl}/admin/users/${userId}/roles/${roleId}`;
    return supertest(url).delete('').set(headers.headers);
  }

  async getAuditLogItemsByFilter(correlationID, filters) {
    const items = await this._doGetAuditLogItemsByFilter(
      correlationID,
      filters
    );
    return Array.isArray(items) && items.map((p) => p._source);
  }
  
  async getAuditLogItemsByFilterNoCorrelationId(query, filters) {
    const items = await this._doGetAuditLogItemsByFilterNoCorrelationId(      
      query, 
      filters
    );
    return Array.isArray(items) && items.map((p) => p._source);
  }

  async getAuditLogEmail(targetId, filters) {
    const items = await this._doGetAuditLogEmailItemsByFilter(
      targetId,
      filters
    );
    return items.map((p) => p._source);
  }

  async generatePasswordResetToken(userId, expiration) {
    const payload = _.assign(
      _.pick({ passwordRestriction: false }, ['passwordRestriction']),
      { userId }
    );
    const resetToken = jwt.sign(payload, this._config.jwt.secret, {
      jwtid: uuid.v4(),
      expiresIn: expiration || 60 * 20
    });

    // store token in the db
    const client = new Client({
      connectionString: `postgres://postgres:postgres@${this._postgresUrl}:5432/sso?sslmode=disable`
    });
    const sql = `UPDATE sso_user
    SET password_reset_token = $1
    WHERE user_id = $2;`;
    await client.connect();
    await client.query(sql, [resetToken, userId]);
    await client.end();

    return resetToken;
  }

  async dbUpdateUserMFAVerified(userId) {
    const client = new Client({
      connectionString: `postgres://postgres:postgres@${this._postgresUrl}:5432/sso?sslmode=disable`
    });
    const sql = `UPDATE sso_user
    SET mfa_verified_date = NOW()
    WHERE user_id = $1;`;
    await client.connect();
    await client.query(sql, [userId]);
    await client.end();
  }

  async dbUpdateOrgRetention(orgId) {
    const client = new Client({
      connectionString: `postgres://postgres:postgres@${this._postgresUrl}:5432/media_platform?sslmode=disable`
    });
    const sql = `
    INSERT INTO public.retention_tdo__organization(
      organization_id, last_run, last_success, success
    ) 
    VALUES ($1, NOW() - '23 hours'::interval, NOW() - '23 hours'::interval, TRUE)
    ON CONFLICT (organization_id) DO UPDATE SET last_run = NOW() - '23 hours'::interval;`;
    await client.connect();
    await client.query(sql, [orgId]);
    await client.end();
  }

  async createTestConnectId(orgGuid) {
    try {
      const client = new Client({
        connectionString: `postgres://postgres:postgres@${this._postgresUrl}:5432/sso?sslmode=disable`
      });
      const connectId = uuid.v4();
      let sql = `INSERT INTO public.sso_openid_connect(
        connect_id, owner_organization_guid, name
        ) VALUES ($1, $2, 'Test OpenID Connect') ON CONFLICT (connect_id) DO NOTHING;`;

      await client.connect();
      await client.query(sql, [connectId, orgGuid]);

      sql = `INSERT INTO public.sso_openid_connect__organization(
        connect_id, organization_guid, enabled
        ) VALUES ($1, $2, true);`;
      await client.query(sql, [connectId, orgGuid]);

      await client.end();

      return connectId;
    } catch (error) {
      console.error('Error creating Test OpenID Connect:', error);
      throw error;
    }
  }

  async getConnectUserId(connectId) {
    try {
      const client = new Client({
        connectionString: `postgres://postgres:postgres@${this._postgresUrl}:5432/sso?sslmode=disable`
      });
      const sql = `SELECT connect_user_id, user_id FROM public.sso_user__openid_connect WHERE connect_id = $1;`;
      await client.connect();
      const res = await client.query(sql, [connectId]);
      await client.end();
      if (res.rows.length > 0) {
        return {
          connectUserId: res.rows[0].connect_user_id,
          userId: res.rows[0].user_id
        };
      } else {
        throw new Error(`No connect user found for connectId: ${connectId}`);
      }
    } catch (error) {
      console.error('Error retrieving connect user ID:', error);
      throw error;
    }
  }

  async logoutUser(token, correlationID, sessionExpired) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    let url = `${this._adminUrl}/admin/token/${token}/logout`;
    if (sessionExpired) {
      url += '?sessionExpired=true';
    }
    return supertest(url).get('').set(headers.headers);
  }

  async linkUserToOid(token, userName, password, sessionKey, correlationID) {

    if (!correlationID) {

      correlationID = this.buildCorrelationID();

    }



    const headers = helpers.requestOptions(token);

    headers.headers['Veritone-Correlation-ID'] = correlationID;

    const url = `${this._adminUrl}/admin/openid/linkUserToOid`;

    return supertest(url)

      .post('')

      .send({ userName, password, sessionKey })

      .set(headers.headers);

  }



  getAuthenticationInfoCacheKey(key) {

    return `AUTHENTICATION_INFO:${key}`;

  }

  async deleteKeysByPatternScan(redis, pattern) {
    let cursor = '0';
    let keysToDelete = [];

    do {
      await new Promise((resolve, reject) => {
        redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100, (err, reply) => {
          if (err) return reject(err);

          cursor = reply[0];
          keysToDelete = reply[1];

          if (keysToDelete.length > 0) {
            redis.del(keysToDelete, (err, response) => {
              if (err) {
                console.error('Error deleting keys:', err);
              } else if (this._config.debug) {
                console.log(`#######Redis: ${response} keys deleted`);
              }
            });
          }

          resolve();
        });
      });
    } while (cursor !== '0'); // Continue scanning until cursor returns to '0'
  }

  async _doGetAuditLogItemsByFilter(correlationID, filterItems = undefined) {
    let retry = false;
    const elasticUrl = this.buildQueryElasticWithCorrelationID(correlationID);

    for (let i = 0; i < this._elasticRetryAttempts + 1; i++) {
      await this.sleepAsync(this._elasticSleepBetweenRetryAttempts);
      const result = await supertest(elasticUrl).get('');
      if (
        result &&
        result.body &&
        result.body.hits &&
        result.body.hits.hits &&
        result.body.hits.hits.length > 0
      ) {
        let items = result.body.hits.hits.filter(
          (p) => p._source.correlationId == correlationID
        );

        if (items.length < (filterItems || []).length) {
          if (this._config.debug) {
            console.log(
              `#######Elastic failed to return a item with correlationID::Elastic-result.body returned for correlationID(${correlationID})`,
              {
                resultBody: JSON.stringify(result.body)
              }
            );
          }
          if (i === this._elasticRetryAttempts) {
            throw new Error(
              `Attemtped to call Elastic(${this._elasticRetryAttempts}) to retrieve Elastic audit log events for correlationID(${correlationID})`
            );
          } else {
            // try again
            continue;
          }
        }

        if (filterItems) {
          for (const filterItem of filterItems) {
            const filterProperties = Object.keys(filterItem);
            const testFilterItemItems = items.filter((p) => {
              for (const filterProperty of filterProperties) {
                const expectedValue = filterItem[filterProperty];
                const actualValue = p._source[filterProperty];
                // support asymmetric matchers (expect.stringContaining, expect.any, ...)
                if (
                  expectedValue &&
                  typeof expectedValue === 'object' &&
                  typeof expectedValue.asymmetricMatch === 'function'
                ) {
                  if (!expectedValue.asymmetricMatch(actualValue)) {
                    return false;
                  }
                } else if (actualValue !== expectedValue) {
                  return false;
                }
              }
              return true;
            });
            if (testFilterItemItems.length === 0) {
              if (this._config.debug) {
                console.log(
                  `#######Elastic failed to return enough items with correlationID to satisfy filterItems::Elastic-result.body returned for correlationID(${correlationID}) with filterItems`,
                  {
                    resultBody: JSON.stringify(result.body),
                    filterItems
                  }
                );
              }
              if (i === this._elasticRetryAttempts) {
                throw new Error(
                  `Attemtped to call Elastic(${this._elasticRetryAttempts}) to retrieve Elastic audit log events for correlationID(${correlationID}) with enough items to satisfy filterItems`
                );
              } else {
                // try again
                retry = true;
                break;
              }
            }
          }

          if (retry) {
            retry = false;
            continue;
          }
        }

        return items;
      }

      if (i === this._elasticRetryAttempts) {
        const indexData = await this._dumpIndexContents();
        throw new Error(
          `Failed to find audit log item in elastic for correlationID(${correlationID}): ${JSON.stringify(indexData)} ${(new Date()).toISOString()}`
        );
      }
    }
  }

  async _doGetAuditLogItemsByFilterNoCorrelationId(query, filterItems = undefined) {
    let retry = false;
    const elasticUrl = this.buildQueryElasticWithQuery(query);

    for (let i = 0; i < this._elasticRetryAttempts + 1; i++) {
      await this.sleepAsync(this._elasticSleepBetweenRetryAttempts);
      const result = await supertest(elasticUrl).get('');
      if (
        result &&
        result.body &&
        result.body.hits &&
        result.body.hits.hits        
      ) {
        let items = result.body.hits.hits;

        if (items.length < (filterItems || []).length) {
          if (this._config.debug) {
            console.log(
              `#######Elastic failed to return a item for query ${JSON.stringify(query)}`,
              {
                resultBody: JSON.stringify(result.body)
              }
            );
          }
          if (i === this._elasticRetryAttempts) {
            throw new Error(
              `Attempted to call Elastic(${this._elasticRetryAttempts}) to retrieve Elastic audit log events for query ${JSON.stringify(query)}`
            );
          } else {
            // try again
            continue;
          }
        }

        if (filterItems) {
          for (const filterItem of filterItems) {
            const filterProperties = Object.keys(filterItem);
            const testFilterItemItems = items.filter((p) => {
              for (const filterProperty of filterProperties) {
                const expectedValue = filterItem[filterProperty];
                const actualValue = p._source[filterProperty];
                // support asymmetric matchers (expect.stringContaining, expect.any, ...)
                if (
                  expectedValue &&
                  typeof expectedValue === 'object' &&
                  typeof expectedValue.asymmetricMatch === 'function'
                ) {
                  if (!expectedValue.asymmetricMatch(actualValue)) {
                    return false;
                  }
                } else if (actualValue !== expectedValue) {
                  return false;
                }
              }
              return true;
            });
            if (testFilterItemItems.length === 0) {
              if (this._config.debug) {
                console.log(
                  `#######Elastic failed to return enough items with correlationID to satisfy filterItems::Elastic-result.body returned for query ${JSON.stringify(query)} with filterItems`,
                  {
                    resultBody: JSON.stringify(result.body),
                    filterItems
                  }
                );
              }
              if (i === this._elasticRetryAttempts) {
                throw new Error(
                  `Attemtped to call Elastic(${this._elasticRetryAttempts}) to retrieve Elastic audit log events for query ${JSON.stringify(query)} with enough items to satisfy filterItems`
                );
              } else {
                // try again
                retry = true;
                break;
              }
            } else {
              return testFilterItemItems
            }
          }

          if (retry) {
            retry = false;
            continue;
          }
        }

        return items;
      }

      if (i === this._elasticRetryAttempts) {
        const indexData = await this._dumpIndexContents();
        throw new Error(
          `Failed to find audit log item in elastic for query ${JSON.stringify(query)}: ${JSON.stringify(indexData)}`
        );
      }
    }
  }

  async _dumpIndexContents() {
    const indexListUrl = `${this._elasticUrl}/_cat/indices?format=json`;
    const indices = await supertest(indexListUrl).get('');

    const indexSearchUrl = `${this._elasticUrl}/${this._audtLogIndex}/_search?size=0`;
    const result = await supertest(indexSearchUrl).post('').send(
      {
         aggs: {
            x: {
              terms: {
                  field: 'correlationId',
                  size: 100
              }
          }
        }
      }
    );
    return {
      indices,
      logs: result
    }
    //return _.get(result, 'aggregations.x.buckets', []).map(x => x.key);
  }

  async waitForAuditLogIndexingPipeline(maxWaitSeconds, token) {
    const uniqueTargetId = uuid.v4();
    const eventPayload = {
      "actionInfo": {
        "actionName": "create",
        "actionResult": "success",
        "actionDetails": "Created SDO 98c52836-0c96-55a4-afbc-b0c0ead682ec using schema 5e8ed684-b3ce-4793-aed3-ad7634e164ea",
        "targetId": uniqueTargetId
      },
      "callerInfo": {
        "organizationId": "1",
        "originatorApplication": "",
        "originatorService": "core-graphql-server",
        "userName": "test@veritone.com",
        "organizationName": "root",
        "organizationGuid": "9e13681e-c0e9-4c7f-b988-92fa23f7b6f0"
      },
      "core": {
        "eventId": "be60e531-8d86-49ec-bff9-8fe299ba0557",
        "id": "be60e531-8d86-49ec-bff9-8fe299ba0557",        
        "targetType": "tt_SDO",
        "userId": "a59c7272-51d6-49ec-bf8c-10490c39fb6e",
        "timestamp": "2025-09-01T16:11:03.743Z",
        "type": "structuredData",
        "name": "StructuredDataCreate",
        "correlationId": "QwhbC6ABbK"
      }
    };

    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      try {
        await this.sleepAsync(2000);
        const event = await this.emitEvent('AuditTopic', eventPayload, token);
        // targetId lives on actionInfo, not core (it was moved there by #3450 without updating
        // this lookup, so the search ran as `q=targetId:undefined` and matched nothing — every
        // caller silently paid the full maxWaitSeconds).
        const indexedDocs = await this.searchForEvents(
          eventPayload.actionInfo.targetId,
          10,
          2000
        );
        if (indexedDocs.length > 0) {
          return true;
        }
      } catch (error) {
        console.info('Error waiting for audit log indexing pipeline:', error);
      }
      await this.sleepAsync(1000);
    }
    console.warn(
      `waitForAuditLogIndexingPipeline: probe event never became searchable after ${maxWaitSeconds}s ` +
        `(targetId=${eventPayload.actionInfo.targetId}) — audit assertions in this suite may be unreliable`
    );
    return false;
  }

  async searchForEvents(targetId, retryCount, delay) {
    let retry = false;
    const elasticUrl = `${this._elasticUrl}/${this._audtLogIndex}/_search?q=targetId:${targetId}&size=${this._elasticQuerySize}`;

    // call elastic to flush documents to the index
    await this.refreshElasticLogIndex();

    for (let i = 0; i < retryCount; i++) {
      await this.sleepAsync(delay);
      const result = await supertest(elasticUrl).get('');
      if (
        result &&
        result.body &&
        result.body.hits &&
        result.body.hits.hits &&
        result.body.hits.hits.length > 0
      ) {
        let items = result.body.hits.hits;
        if (items.length > 0) {
          return items;
        }
      }
    }
    return [];
  }

    // `payload` is an object and JSONData is a scalar, so it must go through a GraphQL variable.
    // Interpolating it into the query text stringified it to the literal `[object Object]`, which
    // never emitted anything — the sole caller (waitForAuditLogIndexingPipeline) then polled for an
    // event that was never published and always burned its full timeout.
    async  emitEvent(topic, payload, token) {
      const mutation = `
        mutation emitSystemEvent($topic: String!, $payload: JSONData!) {
          emitSystemEvent(
            input: {
              topic: $topic
              payload: $payload
            }
          ) {
            id
          }
        }`;
      try {
        const headers = this.buildHeadersWithBearerToken(token);
        return await this._gqlClient.query(mutation, { topic, payload }, headers)
      } catch (error) {
        throw new Error(
          `Failed to emit system event on topic ${topic}: ${error.message}`
        );
    }
  }

  async _doGetAuditLogEmailItemsByFilter(targetId, filterItems = undefined) {
    let retry = false;
    const elasticUrl = `${this._elasticUrl}/${this._audtLogIndex}/_search?q=targetId:${targetId}&size=${this._elasticQuerySize}`;

    // call elastic to flush documents to the index
    await this.refreshElasticLogIndex();

    for (let i = 0; i < this._elasticRetryAttempts + 1; i++) {
      await this.sleepAsync(this._elasticSleepBetweenRetryAttempts);
      const result = await supertest(elasticUrl).get('');
      if (
        result &&
        result.body &&
        result.body.hits &&
        result.body.hits.hits &&
        result.body.hits.hits.length > 0
      ) {
        let items = result.body.hits.hits.filter(
          (p) => p._source.targetId == targetId
        );

        if (items.length === 0) {
          if (this._config.debug) {
            console.log(
              `#######Elastic failed to return a item with correlationID::Elastic-result.body returned for targetId(${targetId})`,
              {
                resultBody: JSON.stringify(result.body)
              }
            );
          }
          if (i === this._elasticRetryAttempts) {
            throw new Error(
              `Attemtped to call Elastic(${this._elasticRetryAttempts}) to retrieve Elastic audit log events for targetId(${targetId})`
            );
          } else {
            // try again
            continue;
          }
        }

        if (filterItems) {
          for (const filterItem of filterItems) {
            const filterProperties = Object.keys(filterItem);
            const testFilterItemItems = items.filter((p) => {
              for (const filterProperty of filterProperties) {
                const expectedValue = filterItem[filterProperty];
                const actualValue = p._source[filterProperty];
                // support asymmetric matchers (expect.stringContaining, expect.any, ...)
                if (
                  expectedValue &&
                  typeof expectedValue === 'object' &&
                  typeof expectedValue.asymmetricMatch === 'function'
                ) {
                  if (!expectedValue.asymmetricMatch(actualValue)) {
                    return false;
                  }
                } else if (actualValue !== expectedValue) {
                  return false;
                }
              }
              return true;
            });
            if (testFilterItemItems.length === 0) {
              if (this._config.debug) {
                console.log(
                  `#######Elastic failed to return enough items with correlationID to satisfy filterItems::Elastic-result.body returned for targetId(${targetId}) with filterItems`,
                  {
                    resultBody: JSON.stringify(result.body),
                    filterItems
                  }
                );
              }
              if (i === this._elasticRetryAttempts) {
                throw new Error(
                  `Attemtped to call Elastic(${this._elasticRetryAttempts}) to retrieve Elastic audit log events for targetId(${targetId}) with enough items to satisfy filterItems`
                );
              } else {
                // try again
                retry = true;
                break;
              }
            }
          }

          if (retry) {
            retry = false;
            continue;
          }
        }

        return items;
      }

      if (i === this._elasticRetryAttempts) {
        throw new Error(
          `Failed to find audit log item in elastic for targetId(${targetId})`
        );
      }
    }
  }

  async sleepAsync(ms) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  getCorrelationIDFromResponse(result) {
    if (result && result.headers && result.headers['veritone-correlation-id']) {
      return result.headers['veritone-correlation-id'];
    } else if (
      result &&
      result._response &&
      result._response.headers &&
      result._response.headers['veritone-correlation-id']
    ) {
      return result._response.headers['veritone-correlation-id'];
    }

    return undefined;
  }

  buildMutationuserLogin(userName, password, causeFailure) {
    let passwordArg = password;
    let userNameArg = userName;
    switch (causeFailure) {
      case authFailureReason.INVALID_CREDENTIALS:
        passwordArg = 'invalid_password';
        break;
      case authFailureReason.NON_EXISTENT_USER:
        userNameArg = `non_existent_user_${this.createRandomString()}`;
    }
    return `mutation {
        userLogin(input: {
          userName: "${userNameArg}"
          password: "${passwordArg}"
        }) {
          apiToken
          token
          user {
            id
            name
            firstName
            lastName
            jsondata
            roles {
              id
            }
          }
          organization {
            id
            guid
          }
          groups {
            id
          }
        }
      }`;
  }

  buildQueryElasticWithCorrelationID(correlationID) {
    return `${this._elasticUrl}/${this._audtLogIndex}/_search?q=correlationId:${correlationID}&size=${this._elasticQuerySize}`;
  }

  /**
   * 
   * @param {JSON} query Example: { eventName: "RetentionRun" }
   */
  buildQueryElasticWithQuery(query) {
    const queryString = Object.entries(query).map(([key, value]) => `${key}:${value}`).join(' AND ');
    return `${this._elasticUrl}/${this._audtLogIndex}/_search?q=${queryString}&size=${this._elasticQuerySize}`;
  }

  async refreshElasticLogIndex() {
    const refreshUrl = `${this._elasticUrl}/${this._audtLogIndex}/_refresh`;
    return supertest(refreshUrl).get('');
  }


  buildMutationcreateUser(username, password, organizationId, roleIds, userOptions = {}) {
    const firstName = userOptions.firstName || 'First';
    const lastName = userOptions.lastName || 'Last';

    return `mutation {
      createUser(input: {
        name: "${username}"
        password: "${password}"
        organizationId: "${organizationId}"
        firstName: "${firstName}"
        lastName: "${lastName}"
        jsondata: {
          foo: "bar"
        }
        sendNewUserEmail: false
        ${
          roleIds
            ? `roleIds: [${roleIds.map((role) => `"${role}"`).join(', ')}]`
            : ''
        }      })  {
        id
        name
        organizationId
        firstName
        lastName
      }
    }`;
  }

  buildMutationdeleteUser(userID) {
    return `mutation {
      deleteUser(id: "${userID}") {
        id
        message
      }
    }`;
  }

  buildMutationupdateUser(userID, firstName, lastName, roleIds) {
    return `mutation {
      updateUser(input: {
        id: "${userID}"
        firstName: "${firstName}"
        lastName: "${lastName}"
        ${
          roleIds
            ? `roleIds: [${roleIds.map((role) => `"${role}"`).join(', ')}]`
            : ''
        }
      }) {
        firstName
        lastName
        roles {
          id
          name
        }
      }
    }`;
  }

  buildHeadersNoBearerToken(correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const headers = helpers.requestOptions();
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    delete headers.headers.Authorization;
    return headers;
  }

  buildHeadersWithBearerToken(token, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const headers = helpers.requestOptions(token);
    headers.headers['Veritone-Correlation-ID'] = correlationID;
    return headers;
  }

  buildHeadersNoBearerTokenAndNoCorrelationID() {
    const headers = helpers.requestOptions();
    delete headers.headers['Veritone-Correlation-ID'];
    delete headers.headers.Authorization;
    return headers;
  }

  buildHeadersWithBearerTokenAndNoCorrelationID(token) {
    const headers = helpers.requestOptions(token);
    delete headers.headers['Veritone-Correlation-ID'];
    return headers;
  }

  buildMutationcreateOrganization(name, orgGuid, features) {
    return `mutation {
          createOrganization(input: {
                name: "${name ? name : 'CI-TESTING organization'}"
                adminSeatLimit: 10
                seatLimit: 10
                types: [agency]
                businessUnit: "personal"
                ${orgGuid ? `guid: "${orgGuid}"` : ''}
                ${this.buildMetadataFeaturesBlock(features, { required: true })}
            }) {
                id
                guid
                name
                type
                status
            }
        }`;
  }

  buildMutationsetOrganizationIntegrationConfig(
    organizationId,
    integrationId,
    userVisible = true,
    config = `{
    testField: "first test name"
  }`
  ) {
    return `mutation {
      setOrganizationIntegrationConfig(input: {
        organizationId: ${organizationId}
        integrationId: "${integrationId}"
        config: ${config}
        userVisible : ${userVisible}
      }) {
        organizationId
        integrationId
        config
        userVisible
      }
    }`;
  }

  buildMutationupdateOrganization(organizationID, organizationName, status, features) {
    return `mutation {
      updateOrganization(input: {
        id: "${organizationID}"
        name: "${organizationName}"
        ${status ? `status: "${status}"` : ''}
        ${this.buildMetadataFeaturesBlock(features)}
        }) {
        id
        name
      }
    }`;
  }

  buildMutationcreateOrganizationInvite(
    organizationID,
    userNameToInvite,
    applicationID,
    roleID,
    isAdmin
  ) {
    return `
    mutation {
      createOrganizationInvite(input: {
          organizationId: "${organizationID}"
          email: "${userNameToInvite}"
          message: "CI-TESTING invite"
          applicationRoles: {
              applicationId: "${applicationID}"
              roleId: "${roleID}"
          }
      }) {
          id
          email
          ${isAdmin ? 'passwordResetToken' : ''}
      }
  }
    `;
  }

  buildMutationUpdateOrganizationInvite(organizationInviteID, action) {
    return `
    mutation {
      updateOrganizationInvite(input: {
          organizationInviteId: "${organizationInviteID}"
          action: ${action}
          applicationRoles: []
      }) {
          id
      }
    }
    `;
  }

  buildMutationupdateOrganizationInviteAcceptInvite(
    organizationInviteID,
    applicationID,
    roleID
  ) {
    return `
    mutation {
      updateOrganizationInvite(input: {
          organizationInviteId: "${organizationInviteID}"
          message: "CI-TESTING invite update accept"
          action: complete
          applicationRoles: {
              applicationId: "${applicationID}"
              roleId: "${roleID}"
          }
      }) {
          id
          email
      }
  }
    `;
  }

  buildMutationupdateOrganizationInviteRejectInvite(
    organizationInviteID,
    applicationID,
    roleID
  ) {
    return `
    mutation {
      updateOrganizationInvite(input: {
          organizationInviteId: "${organizationInviteID}"
          message: "CI-TESTING invite update reject"
          action: delete
          applicationRoles: {
              applicationId: "${applicationID}"
              roleId: "${roleID}"
          }
      }) {
          id
          email
      }
  }`;
  }

  buildMutationupdateOrganizationInviteApproveInvite(
    organizationInviteID,
    applicationID,
    roleID
  ) {
    return `mutation {
        updateOrganizationInvite(input: {
            organizationInviteId: "${organizationInviteID}"
            message: "CI-TESTING invite update approve"
            action: approve
            applicationRoles: {
                applicationId: "${applicationID}"
                roleId: "${roleID}"
            }
        }) {
            id
            email
        }
    }`;
  }

  buildMutationupdateOrganizationInviteAdminRejectInvite(
    organizationInviteID,
    applicationID,
    roleID
  ) {
    return `mutation {
        updateOrganizationInvite(input: {
            organizationInviteId: "${organizationInviteID}"
            message: "CI-TESTING invite update reject"
            action: reject
            applicationRoles: {
                  applicationId: "${applicationID}"
                  roleId: "${roleID}"
            }
        }) {
            id
            email
        }
    }`;
  }

  buildMetadataFeaturesBlock(features, { required = false } = {}) {
    const featureLines = features
      ? Object.entries(features)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      : [];

    if (!featureLines.length) {
      return required ? '\n          metadata: {}' : '';
    }

    return `
          metadata: {
            features: {
              ${featureLines.join('\n')}
            }
          }`;
  }

  async enableOLPForOrganization(
    token,
    organizationID,
    organizationName,
    correlationID
  ) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const mutation = this.buildMutationEnableOLPForOrganization(
      organizationID,
      organizationName
    );

    const headers = this.buildHeadersWithBearerToken(token, correlationID);

    return await this._gqlClient.query(mutation, null, headers);
  }

  async createOrganizationWithOLP(token, correlationID, name, enabled) {
    return this.createOrganization(
      token,
      correlationID,
      name ||
        `CI-TESTING OLP ${enabled ? 'enabled' : 'disabled'} organization ${Date.now()}`,
      null,
      {
        enableRBACFeature: enabled ? 'enabled' : 'disabled',
        enableRBACFeatureForSDO: enabled ? 'enabled' : 'disabled'
      }
    );
  }

  async updateOrganizationOLP(
    token,
    organizationID,
    organizationName,
    enabled,
    correlationID
  ) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }

    const mutation = this.buildMutationupdateOrganization(
      organizationID,
      organizationName,
      null,
      {
        enableRBACFeature: enabled ? 'enabled' : 'disabled',
        enableRBACFeatureForSDO: enabled ? 'enabled' : 'disabled'
      }
    );

    const headers = this.buildHeadersWithBearerToken(token, correlationID);

    return await this._gqlClient.query(mutation, null, headers);
  }

  buildOLPFeatureMetadata(isEnabled) {
    const value = isEnabled ? 'enabled' : 'disabled';

    return {
      enableRBACFeature: value,
      enableRBACFeatureForSDO: value
    };
  }

  async createOrganizationWithOLPEnabled(token, correlationID, name) {
    return this.createOrganization(
      token,
      correlationID,
      name || `CI-TESTING OLP enabled organization ${Date.now()}`,
      null,
      this.buildOLPFeatureMetadata(true)
    );
  }

  async createOrganizationWithOLPDisabled(token, correlationID, name) {
    return this.createOrganization(
      token,
      correlationID,
      name || `CI-TESTING OLP disabled organization ${Date.now()}`,
      null,
      this.buildOLPFeatureMetadata(false)
    );
  }

  async enableOLPForOrganization(
    token,
    organizationID,
    organizationName,
    correlationID
  ) {
    return this.updateOrganization(
      token,
      organizationID,
      organizationName,
      correlationID,
      null,
      this.buildOLPFeatureMetadata(true)
    );
  }

  async disableOLPForOrganization(
    token,
    organizationID,
    organizationName,
    correlationID
  ) {
    return this.updateOrganization(
      token,
      organizationID,
      organizationName,
      correlationID,
      null,
      this.buildOLPFeatureMetadata(false)
    );
  }

  async createWatchList(
    token,
    stop,
    watchListName,
    testSourceIds,
    variables,
    correlationID
  ) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationCreateWatchList(
      stop,
      watchListName,
      testSourceIds
    );
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, variables, headers);
  }

  buildMutationCreateWatchList(stop, watchListName, testSourceIds) {
    return `
    mutation createWatchlist($details: JSONData, $cogSearch2: CreateCognitiveSearchInWatchlist!){
      createWatchlist(input: {
        searchIndex: mine
        stopDateTime: "${moment(stop).toISOString()}"
        name: "${watchListName}"
        sourceTypeIds: [1, 2, 5]
        sourceIds: [${testSourceIds}]
        details: $details
        subscriptions: [
          {
            scheduledDay: Tuesday
            scheduledTime: "07:11:22"
            scheduledTimeZone: "EST"
            contact: {
              emailAddress: "foo@bar.com"
              phoneNumber: "555-555-5555"
            }
          }
        ]
        cognitiveSearches: [
          {
            mentionStatusId: 1
            jsonstring: "{\\"and\\":[{\\"state\\":{\\"search\\":\\"foo\\",\\"language\\":\\"en\\"}, \\"engineCategoryId\\":\\"67cd4dd0-2f75-445d-a6f0-2f297d6cd182\\"}]}"
          },
          $cogSearch2
        ]
      }) {
        id
        details
        query
        searchIndex
        subscriptions {
          id
        }
        folders {
          id
        }
        cognitiveSearches {
          query
          id
          mentionStatusId
          mentionStatus {
            id
            name
          }
          profile

        }
        sourceIds

        schedules {
          records {
            id
            name
            sources {
              records {
                id
                name
              }
            }
          }
        }
      }
    }
    `;
  }

  async deleteWatchList(token, watchListID) {
    const mutation = `mutation deleteWatchlist {
        deleteWatchlist(id: ${watchListID}) {
            message
        }
    }`;
    const headers = this.buildHeadersWithBearerToken(token);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async createJob(token, correlationID, options = {}) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationcreateJob(options.invalid);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async createLaunchJobTemplate(token, correlationID, options = {}) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    const createJobTemplateMutation = this.buildMutationCreateJobTemplate();
    const jobTemplate = await this._gqlClient.query(
      createJobTemplateMutation,
      null,
      headers
    );
    const jobTemplateId = _.get(jobTemplate, 'createJobTemplate.id');
    const launchJobTemplatesMutation = this.buildMutationLaunchJobTemplates(
      jobTemplateId,
      options.invalid
    );

    return await this._gqlClient.query(
      launchJobTemplatesMutation,
      null,
      headers
    );
  }

  async cleanupTDO(token, tdoID, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationCleanupTDO(tdoID);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }
  async deleteAsset(token, assetId, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationDeleteAsset(assetId);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async updateAsset(token, assetId, name, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationUpdateAsset(assetId, name);
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  async createTDOAsset(token, correlationID) {
    if (!correlationID) {
      correlationID = this.buildCorrelationID();
    }
    const mutation = this.buildMutationcreateTDOAsset();
    const headers = this.buildHeadersWithBearerToken(token, correlationID);
    return await this._gqlClient.query(mutation, null, headers);
  }

  buildMutationcreateJob(invalid = false) {
    const targetFields = `
      startDateTime: "${moment().subtract(15, 'minutes').toISOString()}"
      stopDateTime: "${moment().toISOString()}"
      ${invalid ? 'parentFolderId: "invalid-folder-id"' : ''}
    `;
    const internalEngineId = 'insert-into-index';
    return `
     mutation {
      createJob(input: {
        target: {
          ${targetFields}
        }
        skipDecider:true
        tasks: [{
          engineId: "${internalEngineId}"
          payload: {
            engineReturnValue: true
          }
        }]
      }) {
        id,
        targetId
      }
    }
    `;
  }
  buildMutationLaunchJobTemplates(jobTemplateId, invalid) {
    const targetFields = `
      ${invalid ? 'parentFolderId: "invalid-folder-id"' : ''}
    `;
    return `
     mutation($details: JSONData) {
        launchJobTemplates(input: {
          ids: ["${jobTemplateId}"]
          createTargetInfo: {
            name: "test name"
            details: $details
            ${targetFields}
          }
          payload: {
            mode: "offline",
            url: "https://cdn.filestackcontent.com/NGe98IbjSh6Xbwm7Lf0l",
            offlineTaskId: "not_available"
            recordStartTime: ${moment().valueOf()},
            recordEndTime: ${moment().add(10, 's').valueOf()}
          }
        }) {
          id
          target {
            id
            details
            name
            isPublic
          }
        }
      }
    `;
  }

  buildMutationCreateJobTemplate(gqlClient) {
    const internalEngineId = 'insert-into-index';
    return `
      mutation {
        createJobTemplate(input: {
          jobConfig: {
            createTDOInput: {
              details: {
                tags: ["foo", "bar"]
              }
            }
            jobPipelineStage: 1
          }
          taskTemplates: [
            {
              engineId: "${internalEngineId}"
              payload: {
                foo: "bar"
              }
            }
          ]
        }) {
          id
          jobPipelineId
          taskTemplates {
            records {
              id
              engineId
            }
          }
          jobConfig
        }
      }
      `;
  }

  buildMutationCleanupTDO(tdoID) {
    return `
      mutation {
        cleanupTDO(id: "${tdoID}", options: [storage]) {
          id
          message
        }
      }
    `;
  }

  buildMutationDeleteAsset(assetId) {
    return `
      mutation {
        deleteAsset(id: "${assetId}") {
            id
            message
        }
      }
    `;
  }

  buildMutationUpdateAsset(assetId, name) {
    return `
      mutation {
        updateAsset(input: {
          id: "${assetId}"
          name: "${name}"
        }) {
            id
            name
        }
      }
    `;
  }
  buildMutationcreateAsset(tdoID) {
    return `
    mutation {
      createAsset(input: {
        containerId: "${tdoID}"
        assetType: "media"
        contentType: "video/mp4"
        uri: "http://example.com/"
      }) {
        id
        uri
        signedUri
      }
    }
    `;
  }

  buildMutationcreateTDOAsset() {
    return `
    mutation {
      createTDO(input: {
        startDateTime: "${moment().subtract(15, 'minutes').toISOString()}"
        stopDateTime: "${moment().toISOString()}"
        assets:[
          {
            contentType: "video/mp4"
            assetType: "media"
            uri: "http://localhost/"
            setAsPrimary: true
          }
        ]
      }) {
        id
        assets {
          records {
            id
          }
        }
        startDateTime
        stopDateTime

      }
    }
    `;
  }
  async seedExpiredSessionInRedis(redisClient, token, meta, expiresAtMs) {
    return new Promise((resolve, reject) => {
      const multi = redisClient.multi();
      multi.del(`TOKEN:${token}:`);
      const hsetFields = [];
      for (const [k, v] of Object.entries({ ...meta, expiresAt: expiresAtMs })) {
        if (v !== undefined && v !== null) {
          hsetFields.push(k, String(v));
        }
      }
      multi.hset(`SESSION_META:${token}`, hsetFields);
      multi.zadd('pending_session_audits', expiresAtMs, token);
      multi.exec((err, replies) => {
        if (err) return reject(err);
        resolve(replies);
      });
    });
  }

  async triggerSessionExpirySweep() {
    return this.publishEvent('events', 'session_expiry_sweep_cron');
  }

  async publishEvent(topic, event) {
    try {
      const res = await supertest(this._config.core_admin_url).get('/health');   
      const messagingConfig = _.get(res, 'body.appConfig.messaging', {});      
      const { nsqdHost } = messagingConfig;
      await supertest(`http://${nsqdHost}:4151`)
        .post(`/pub?topic=${topic}`)
        .set('Content-Type', 'application/json')
        .send({
          event: event
        })      
    } catch(err) {
      console.log(err)
    }
    } 
  getCoreServerApp() {
    return this._coreServer.app;
  }
}

module.exports = {
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents,
  validateExpectedEmailEvent,
  AuditLogHelpers,
  DEFAULT_ENV_TO_RUN_IN: _DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_CI_TEST_SERVICE_TOKEN: _DEFAULT_CI_TEST_SERVICE_TOKEN,
  DEFAULT_ENV_TO_ISO: _DEFAULT_ENV_TO_ISO,
  authFailureReason
};
