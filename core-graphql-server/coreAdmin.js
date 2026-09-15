const _ = require('lodash');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const rp = require('request-promise');

module.exports = function (serviceContext) {
  const errors = require('./error')(serviceContext.config);
  const mainUtil = require('./util.js')();

  const cookieDomain = _.get(
    serviceContext,
    'config.auth.domain',
    '.veritone.com'
  );
  const useInsecureCookie = !!_.get(
    serviceContext,
    'config.auth.useInsecureCookie'
  );
  const userTokenCookieName = _.get(
    serviceContext,
    'config.auth.userTokenCookieName',
    'veritone-session-id'
  );
  // mock out config that is required to load core-admin-server modules
  // but is not used in core-graphql-server.
  // any real values defined in the config will override these.
  if (!_.get(serviceContext, 'config.mfa')) {
    _.set(serviceContext, 'config.mfa', {
      secretAesPassword: ''
    });
  }
  if (!_.get(serviceContext, 'config.twilio')) {
    _.set(serviceContext, 'config.twilio', {
      accountSID: 'AC111',
      authToken: 'aaa',
      phoneNumber: ''
    });
  }

  // if a separate redis cluster is configured for authentication
  // sessions, use it here. otherwise use the default.
  let redisClient = serviceContext.redisClient;
  if (serviceContext.config.redisAuth) {
    redisClient = redis.createClient(serviceContext.config.redisAuth);
  }

  /*
   * Retrieves the user ID (UUID) corresponding to the given
   * user login ID (email or user name).
   * @param userLoginId The user login ID (usually email)
   * @returns the user ID
   * @throw NotFound if user login id not found.
   */
  async function getUserId(userLoginId) {
    const sql = `
      SELECT user_id FROM sso_user WHERE user_name = $1
    `;
    const res = await serviceContext.dbConnections['sso'].read.map(
      sql,
      [userLoginId],
      (row) => row.user_id
    );
    if (!res.length)
      throw new errors.NotFound({
        message: 'User ' + userLoginId + ' not found'
      });
    return res[0];
  }

  /**
   * Sets up the user session for a user ID that has ALREADY
   * been authenticated with Okta.
   */
  async function setupUserSession(userAuthInfo, oktaDomain, req, res) {
    const orgId = req.query.org;
    const userLoginId = userAuthInfo.userLoginId;
    const expiresAt = userAuthInfo.expiresAt;
    const logoutUrl = `https://${oktaDomain}/oauth2/default/v1/logout?id_token_hint=${userAuthInfo.oktaIdToken}`;
    const userId = await getUserId(userLoginId);

    let uri = _.get(serviceContext, 'config.services.coreAdminUri');
    if (!uri.endsWith('/')) uri += '/';
    uri += 'setup-user-session';

    const scopeToken = jwt.sign(
      {
        userId: userId,
        org: orgId,
        scope: [
          {
            actions: ['user:read']
          }
        ]
      },
      _.get(serviceContext.config, 'jwt.secret'),
      {
        jwtid: uuidv4(),
        expiresIn: '60s', // 60 seconds
        subject: 'okta'
      }
    );

    const sessionInfo = {
      ipAddress: (req.ip || '').startsWith('::ffff:')
        ? req.ip.substr(7)
        : req.ip,
      userAgent: _.get(req, `headers['user-agent']`)
    };

    let userInfo;

    try {
      const payload = {
        logoutUrl: logoutUrl,
        userAuthInfo: JSON.stringify(userAuthInfo),
        userId: userId,
        orgId: orgId,
        sessionInfo: JSON.stringify(sessionInfo)
      };
      const headers = {
        authorization: 'Bearer ' + scopeToken,
        accept: 'application/json'
      };
      const options = {
        method: 'POST',
        uri: uri,
        headers: headers,
        form: payload
      };
      const response = await rp.post(options);
      userInfo = JSON.parse(response);
    } catch (err) {
      throw new errors.NotFound(err);
    }
    // set the cookie
    const cookieOptions = {
      expires: new Date(expiresAt),
      domain: cookieDomain,
      path: '/',
      secure: req.protocol === 'https' && !useInsecureCookie,
      httpOnly: true
    };
    res.cookie(userTokenCookieName, userInfo.token, cookieOptions);

    // returns user session JSON
    return userInfo;
  }

  async function addApplicationsForOrganization(args, context) {
    const orgId = args.orgId || args.organizationId;
    if (!orgId) {
      throw errors.InvalidInput(`Invalid orgId input.`);
    }
    let uri = _.get(serviceContext, 'config.services.coreAdminUri');
    if (!uri.endsWith('/')) uri += '/';
    uri += `organizations/${orgId}/applications`;

    const authToken = mainUtil.getToken(context);
    const payload = {
      organizationId: orgId,
      applicationIds: args.appId ? [args.appId] : args.applicationIds
    };
    const headers = {
      authorization: 'Bearer ' + authToken
    };
    const options = {
      method: 'PATCH',
      uri: uri,
      headers: headers,
      body: payload,
      json: true
    };
    try {
      const response = await rp.patch(options);
      return response;
    } catch (err) {
      throw new errors.NotFound(err);
    }
  }

  async function impersonateUser(userId, organizationGuid, context) {
    let uri = _.get(serviceContext, 'config.services.coreAdminUri');
    if (!uri.endsWith('/')) uri += '/';
    uri += `impersonate/${userId}/${organizationGuid}`;

    const authToken = _.get(context, '_authInfo.token');
    const payload = {};
    const headers = {
      authorization: 'Bearer ' + authToken
    };
    const options = {
      method: 'GET',
      uri: uri,
      headers: headers,
      body: payload,
      json: true
    };
    try {
      const res = await rp.get(options);
      return res.token;
    } catch (err) {
      throw new errors.NotFound(err);
    }
  }

  async function removeApplicationsForOrganization(appIds, orgId, context) {
    if (!orgId) {
      throw errors.InvalidInput(`Invalid orgId input.`);
    }
    let uri = _.get(serviceContext, 'config.services.coreAdminUri');
    if (!uri.endsWith('/')) uri += '/';
    uri += `organizations/${orgId}/applications`;

    const authToken = mainUtil.getToken(context);
    const payload = {
      organizationId: orgId,
      applicationIds: appIds
    };
    const headers = {
      authorization: 'Bearer ' + authToken
    };
    const options = {
      method: 'DELETE',
      uri: uri,
      headers: headers,
      body: payload,
      json: true
    };
    try {
      const response = await rp.delete(options);
      return response;
    } catch (err) {
      throw new errors.NotFound(err);
    }
  }

  return {
    setupUserSession: setupUserSession,
    addApplicationsForOrganization: addApplicationsForOrganization,
    removeApplicationsForOrganization: removeApplicationsForOrganization,
    impersonateUser: impersonateUser,

    // unit test only
    _getUserId: getUserId
  };
};
