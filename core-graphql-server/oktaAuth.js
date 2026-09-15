const { promisify } = require('util');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const base64 = require('base-64');
const rp = require('request-promise');
const moment = require('moment');
const fpl = require('@veritone/functional-permissions-lib');

module.exports = function (serviceContext) {
  const errors = require('./error')(serviceContext.config);

  // when the service is running into a k8s pod, the pubDnsRoot value will come from the env variable PUBLIC_DNS_ZONE_NAME
  const pubDnsRoot =
    process.env.PUBLIC_DNS_ZONE_NAME ||
    _.get(serviceContext, 'config.publicDnsZoneName', 'aws-dev.veritone.com');
  const wwwRoot = _.get(
    serviceContext,
    'config.wwwRoot',
    'https://www.' + pubDnsRoot
  );
  const apiRoot = _.get(
    serviceContext,
    'config.apiRoot',
    'https://api.' + pubDnsRoot
  );

  // base login URL
  const loginUrl = _.get(
    serviceContext,
    'config.services.loginPageUri',
    wwwRoot + '/login/#/'
  );
  // "next" login URL, which gets password only
  const nextLoginUrl = _.get(
    serviceContext,
    'config.services.nextLoginPageUri',
    wwwRoot + '/login/#/next/'
  );

  const appSwitcherUrl = _.get(
    serviceContext,
    'config.services.appSwitcherUri',
    wwwRoot + '/switch-app/default'
  );

  const errorPageUrl = _.get(
    serviceContext,
    'config.services.oktaErrorPageUri',
    wwwRoot + '/login/error/'
  );

  const authCallbackRedirectUrl = _.get(
    serviceContext,
    'config.oktaAuth.oktaCallbackUrl',
    apiRoot + '/v3/auth/authorization-code-callback'
  );

  const jwtSecret = _.get(serviceContext, 'config.jwt.secret');
  if (!jwtSecret) throw new Error('jwt.secret is not configured');

  const useErrorPage = _.get(
    serviceContext,
    'config.oktaAuth.useErrorPage',
    false
  );

  // used for unit testing only
  function _getConfiguredUrls() {
    return {
      pubDnsRoot,
      wwwRoot,
      apiRoot,
      loginUrl,
      nextLoginUrl,
      appSwitcherUrl,
      authCallbackRedirectUrl
    };
  }

  // gets Okta configuration for the given org ID.
  // might return null/empty.
  async function getOktaConfig(orgId) {
    const res = await serviceContext.dal.organization.getOrgOktaConfiguration(
      {},
      { id: orgId }
    );
    return res;
  }

  /*
   * ENDPOINT HANDLER for authorization code callback from okta.
   * the org ID is present in the ?org parameter.
   * e.g. https://api.veritone.com/v3/auth/authorization-code/callback?org=19000
   */
  async function oktaAuthCodeCallback(req, res, next) {
    const orgId = req.query.org;
    // if
    if (req.query.error) {
      const str =
        'Okta callback error:  ' +
        req.query.error +
        ' - ' +
        req.query.error_description;
      return returnErr(req, res, next, null, 400, str);
    }

    let stateParam;
    try {
      stateParam = validateState(req.query.state);
    } catch (err) {
      return returnErr(
        req,
        res,
        next,
        null,
        401,
        'URL not valid for org ' + orgId
      );
    }
    if (orgId !== _.toString(stateParam.org)) {
      return returnErr(
        req,
        res,
        next,
        null,
        401,
        'URL not valid for org ' + orgId
      );
    }
    const code = req.query.code;

    let authCodeRes;

    const redirectUrl = encodeURI(authCallbackRedirectUrl + '?org=' + orgId);
    try {
      const oktaConfig = await getOktaConfig(orgId);
      if (
        !(
          oktaConfig.oktaAuthenticationEnabled &&
          oktaConfig.clientId &&
          oktaConfig.clientSecret &&
          oktaConfig.oktaDomain
        )
      ) {
        return returnErr(
          req,
          res,
          next,
          null,
          400,
          'Okta integration is not enabled or configured properly for the target organization, ' +
            orgId
        );
      }

      authCodeRes = await authCodeRequest(code, oktaConfig, redirectUrl);

      const userInfo = extractUserInfo(authCodeRes);
      const oktaDomain = _.get(oktaConfig, 'oktaDomain');
      const session = await serviceContext.coreAdmin.setupUserSession(
        userInfo,
        oktaDomain,
        req,
        res
      );

      // we'll redirect here if it's defined.
      // otherwise default or app switcher
      const targetRedirect = stateParam.appRedirect || appSwitcherUrl;
      res.redirect(targetRedirect);
    } catch (err) {
      return returnErr(req, res, next, err);
    }
  }

  function extractUserInfo(tokenJson) {
    const accessToken = tokenJson.access_token;
    const oktaIdToken = tokenJson.id_token;
    const userTokenInfo = jwt.decode(oktaIdToken);
    const accessTokenInfo = jwt.decode(accessToken);

    // access token contains our user login ID
    const userLoginId = accessTokenInfo.sub;
    return {
      expiresAt: moment(accessTokenInfo.exp * 1000).valueOf(),
      userLoginId,
      oktaIdToken
    };
  }
  /**
   * Given an authorization code, this function makes the request to
   * exchange the code for tokens. It then verifies user ID from the
   * token and establishes the user session.
   */
  async function authCodeRequest(authCode, oktaConfig, redirectUrl) {
    /*
    curl --request POST \
  --url https://{yourOktaDomain}/oauth2/default/v1/token \
  --header 'accept: application/json' \
  --header 'authorization: Basic MG9hY...' \
  --header 'content-type: application/x-www-form-urlencoded' \
  --data 'grant_type=authorization_code&redirect_uri=http%3A%2F%2Flocalhost%3A8080&code=P59yPm1_X1gxtdEOEZjn'
  */

    const url = `https://${oktaConfig.oktaDomain}/oauth2/default/v1/token`;
    const data = {
      grant_type: 'authorization_code',
      redirect_uri: redirectUrl, // same URL used to get auth code. token endpoint does not redirect.
      code: authCode
    };
    const authHeader = base64.encode(
      oktaConfig.clientId + ':' + oktaConfig.clientSecret
    );
    const headers = {
      authorization: 'Basic ' + authHeader,
      accept: 'application/json'
    };
    const options = {
      method: 'POST',
      uri: url,
      headers,
      form: data
    };
    const res = await rp.post(options);
    const tokenJson = JSON.parse(res);
    return tokenJson;
  }

  /**
    * ENDPOINT HANDLER
    * takes as input JSON or form with user login.
    * { "userLoginId": "tester@veritone.com" }
    * redirects to either Okta login
    https://{yourOktaDomain}/oauth2/default/v1/authorize?client_id=0oabucvy
c38HLL1ef0h7&response_type=code&scope=openid&redirect_uri=http%3A%2F%2Flocal
host%3A8080&state=state-296bc9a0-a2a2-4a57-be1a-d0e2fd9bb601
    * or veritone login page
    */
  function getSigninMethod(req, res, next) {
    const userLoginId = req.query.userLoginId || req.body.userLoginId;
    const orgAlias =
      req.query.orgAlias || req.body.orgAlias || req.params.orgAlias;
    if (!(userLoginId || orgAlias)) {
      return returnErr(
        req,
        res,
        next,
        null,
        400,
        'Request should be application/json or form/urlencoded with userLoginId or orgAlias property'
      );
    }
    if (userLoginId) return getUserSigninMethod(req, res, next, userLoginId);
    else return getOrgSigninMethod(req, res, next, orgAlias);
  }

  function getOrgSigninMethod(req, res, next, orgLoginAlias) {
    return serviceContext.dal.organization
      .getOrganizations(
        {},
        {
          //loginAlias: orgLoginAlias
          kvpProperty: 'features.oktaAuthentication.loginAlias',
          kvpValue: orgLoginAlias
        }
      )
      .then((data) => {
        if (_.get(data, 'count', 0) < 1) {
          return returnErr(
            req,
            res,
            next,
            null,
            404,
            'No organization with the login alias "' +
              orgLoginAlias +
              '" was found.'
          );
        }
        const id = data.records[0].id;

        return serviceContext.dal.organization
          .getOrgOktaConfiguration({}, { id })
          .then((oktaConfig) => {
            if (oktaConfig.enabled || oktaConfig.oktaAuthenticationEnabled) {
              redirectToOkta(req, res, next, oktaConfig, null, id);
            } else {
              redirectToLogin(req, res, next, null);
            }
          })
          .catch((err) => {
            returnErr(
              req,
              res,
              next,
              err,
              500,
              err.message || 'Internal server error'
            );
          });
      })
      .catch((err) => {
        let status = 500;
        if (err.name === 'not_found') status = 404;
        else if (err.name === 'not_allowed') status = 401;
        else if (err.name === 'invalid_input') status = 400;

        returnErr(
          req,
          res,
          next,
          err,
          status,
          err.message || 'Internal server error'
        );
      });
  }

  function getUserSigninMethod(req, res, next, userLoginId) {
    // look up user by login ID
    return serviceContext.dal.user
      .getUserLoginMethod(userLoginId)
      .then((loginInfo) => {
        // depending on skipRedirect parameter, we might
        // send back only user info.

        if (loginInfo.authenticationType === 'okta') {
          // redirect to auth URL for org
          redirectToOkta(
            req,
            res,
            next,
            loginInfo.oktaConfig,
            userLoginId,
            loginInfo.organizationId
          );
        } else {
          // redirect to veritone password login page
          redirectToLogin(req, res, next, userLoginId);
        }
      })
      .catch((err) => {
        let status = 500;
        if (err.name === 'not_found') status = 404;
        else if (err.name === 'not_allowed') status = 401;
        else if (err.name === 'invalid_input') status = 400;

        returnErr(
          req,
          res,
          next,
          err,
          status,
          err.message || 'Internal server error'
        );
      });
  }

  function redirectToLogin(req, res, next, userLoginId) {
    const params = {};
    // if we got a redirect URL from the initial login page, send it
    if (req.query.redirect) params.redirect = req.query.redirect;
    // if we have a user ID, send it as username
    if (userLoginId) params.username = userLoginId;

    const query =
      Object.keys(params).length > 0
        ? '?' + Object.keys(params).map((key) => `${key}=${params[key]}`)
        : '';

    // this redirects to main Veritone login page
    res.redirect(nextLoginUrl + query);
  }

  /**
   * Redirects to the Okta login page for the given user ID and organization.
   */
  function redirectToOkta(
    req,
    res,
    next,
    oktaConfig,
    userLoginId,
    organizationId
  ) {
    const correlationId =
      req.header('veritone-correlation-id') ||
      req.header('veritone-request-id') ||
      uuidv4();
    if (
      !oktaConfig ||
      !oktaConfig.oktaDomain ||
      !oktaConfig.clientId ||
      !oktaConfig.clientSecret
    ) {
      return returnErr(
        req,
        res,
        next,
        'Incomplete Okta configuration. Contact your organization administrator for assistance with login.'
      );
    }
    // redirect URL to veritone target app, e.g. cms.veritone.com
    const appRedirect = req.query.redirect;

    // Okta authorization flow redirect URL should be the auth-code callback
    const redirectUrl = encodeURI(
      authCallbackRedirectUrl + '?org=' + organizationId
    );
    // generate a small JWT for the state so we can verify it later
    const state = generateState(
      organizationId,
      userLoginId,
      correlationId,
      appRedirect
    );

    const url = `https://${oktaConfig.oktaDomain}/oauth2/default/v1/authorize?client_id=${oktaConfig.clientId}&response_type=code&scope=openid&state=${state}&redirect_uri=${redirectUrl}`;
    res.redirect(url);
  }

  function returnErr(req, res, next, err, status, message) {
    const _status = status || 500;
    const _message = message || err;
    if (useErrorPage) {
      return res.redirect(
        errorPageUrl + '?status=' + _status + '&message=' + _message
      );
    } else {
      return res.status(_status).send(_message);
    }
  }

  /**
   * Generates a JWT containing some information
   * used to pass state to Okta authorize endpoint
   * and validate within the callback.
   * @param orgId The organization ID
   * @param userLoginId User login Id (email)
   * @return a JWT
   */
  function generateState(orgId, userLoginId, correlationId, appRedirect) {
    const stateObject = {
      org: orgId,
      user: userLoginId,
      correlationId,
      appRedirect
    };
    return jwt.sign(stateObject, jwtSecret, {
      expiresIn: 60, // 1 minute
      jwtid: uuidv4(),
      subject: 'okta'
    });
  }

  /**
   * Validates that the JWT containing state
   * was generated by this server and is not expired.
   * @param state The JWT
   * @returns JWT contents
   */
  function validateState(state) {
    return jwt.verify(state, jwtSecret);
  }

  return {
    oktaAuthCodeCallback,
    getSigninMethod,

    // unit test only
    _getConfiguredUrls,
    _validateState: validateState,
    _generateState: generateState,
    _authCodeRequest: authCodeRequest,
    _redirectToLogin: redirectToLogin,
    _redirectToOkta: redirectToOkta,
    _getOktaConfig: getOktaConfig
  };
};
