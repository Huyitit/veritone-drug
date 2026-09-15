const supertest = require('supertest');
const argv = require('minimist')(process.argv.slice(2));
const conf = argv.conf || 'testconfig.json';
const confPath = '../../' + conf;
const config = process.env.CITEST_CONFIG
  ? require(process.env.CITEST_CONFIG)
  : require(confPath);
const url = require('url');
const userAgent = config.userAgent || 'core-graphql-server test';
const uuid = require('uuid');
const _ = require('lodash');
// const { rewireTypes } = require('graphql-tools/utils/map');
const querystring = require('querystring');
const { admin } = require('@veritone/functional-permissions-lib/permissions');

if (process.env.TESTS_ENV) {
  config.env = process.env.TESTS_ENV;
  console.log('got TESTS_ENV from env');
  if (config.graphql_url.indexOf('localhost') < 0) {
    config.graphql_url = `https://api.${config.env}.veritone.com/v3/graphql`;
    config.structured_data_url = `https://api.${config.env}.veritone.com/v3/graphql/structured-data`;
    config.media_streamer_url = `https://api.${config.env}.veritone.com/media-streamer`;
  }
}

if (process.env.TESTS_SERVER_URI) {
  config.graphql_url = process.env.TESTS_SERVER_URI;
  if (config.debug) console.log('got TESTS_SERVER_URI from env');
}

if (process.env.TESTS_TOKEN) {
  config.apiToken = process.env.TESTS_TOKEN;
  if (config.debug) console.log('got TESTS_TOKEN from env');
}
if (process.env.TESTS_INTERNAL_ORGLESS_TOKEN) {
  config.apiInternalOrgLessToken = process.env.TESTS_INTERNAL_ORGLESS_TOKEN;
  if (config.debug) console.log('got TESTS_INTERNAL_ORGLESS_TOKEN from env');
}
if (process.env.TESTS_AI_DATA_ORG_TOKEN) {
  config.apiAIDataOrgToken = process.env.TESTS_AI_DATA_ORG_TOKEN;
  if (config.debug) console.log('got TESTS_AI_DATA_ORG_TOKEN from env');
}
if (process.env.TESTS_PASSWORD) {
  config.password = process.env.TESTS_PASSWORD;
  if (config.debug) console.log('got TESTS_PASSWORD from env');
}
if (process.env.TESTS_USER) {
  config.userName = process.env.TESTS_USER;
  if (config.debug) console.log('got TESTS_USER from env');
}
/*  add @veritone.com only if userName is not a valid email
    the following is a fix for citest user  */
if (!_.isNil(config.userName) && _.isNil(config.userName.split('@')[1])) {
  config.userName = config.userName + '@veritone.com';
}

if (process.env.TESTS_HUB_USER_PASSWORD) {
  config.hubUserPassword = process.env.TESTS_HUB_PASSWORD;
  if (config.debug) console.log('got TESTS_HUB_USER_PASSWORD from env');
}
if (process.env.TESTS_HUB_USER) {
  config.hubUserName = process.env.TESTS_HUB_USER;
  if (config.debug) console.log('got TESTS_HUB_USER from env');
}

const HTTP_RETRY_CODES = [502, 503, 504, 429];
const DEFAULT_REQUEST_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': userAgent,
  Accept: '*/*',
  'Veritone-Correlation-ID': uuid.v4()
};

const AUTH_URL = `https://api.${config.env}.veritone.com/v1`;
const GRAPHQL_URL = _.get(
  config,
  'graphql_url',
  'https://api.' + config.env + '.veritone.com/v1'
);
const MEDIA_STREAMER_URL = _.get(
  config,
  'media_streamer_url',
  `https://api.${config.env}.veritone.com/media-streamer`
);

async function postRetry(url, data, options, retryCount, isPatch = false) {
  let res;
  if (isPatch) {
    res = await supertest(url)
      .patch('')
      .send(data)
      .set(options ? options.headers : {});
  } else {
    res = await supertest(url)
      .post('')
      .send(data)
      .set(options ? options.headers : {});
  }

  if (!res) {
    throw new Error('null response to http call to ' + url);
  }

  if (res.status >= 200 && res.status < 400) {
    return res;
  }

  if (!HTTP_RETRY_CODES.includes(res.status)) {
    return res;
  }
  if (retryCount <= 0) {
    return res;
  }

  if (config.debug) {
    console.log(
      ' ---- HTTP RETRY ON ' + res.status + ' after ' + res.responseTime + ' ms'
    );
  }
  return postRetry(url, data, options, --retryCount);
}

async function signin(authUrl, options = {}) {
  const signinUrl = `${authUrl}/admin/login`;
  const signinData = {
    userName: config.userName,
    password: config.password
  };

  if (!_.isNil(options.allowVanityDomain)) {
    signinData.allowVanityDomain = options.allowVanityDomain;
  }

  try {
    const response = await postRetry(
      signinUrl,
      signinData,
      { headers: DEFAULT_REQUEST_HEADERS },
      3
    );
    const body = response.body;
    const token = _.get(body, 'token');
    if (config.debug) {
      console.log(`token: ${token}`);
    }
    if (_.isNil(token)) {
      console.dir(config);
      throw new Error(`null user token: ${authUrl}: ${JSON.stringify(body)}`);
    }
    return {
      token,
      apiToken: _.get(body, 'apiToken') || config.apiToken || token,
      userId: _.get(body, 'userId'),
      organizationId: _.get(body, 'organization.organizationId'),
      _response: response
    };
  } catch (err) {
    console.log(
      `failed to sign in as ${config.userName} to ${signinUrl}: ${err}`
    );
    throw err;
  }
}

async function testMediaStreamerDownload(
  mediaStreamerUrl,
  tdoId,
  reqOptions,
  reqParams
) {
  if (!tdoId) {
    console.log('tdoId is required');
    throw new Error('tdoId is required');
  }
  const downloadUrl = `${mediaStreamerUrl}/download/tdo/${tdoId}?${querystring.stringify(
    reqParams
  )}`;

  return supertest(downloadUrl).get('').set(reqOptions.headers).expect(200);
}

async function testMediaStreamerStreams(
  mediaStreamerUrl,
  reqOptions,
  tdoId,
  manifest,
  reqParams
) {
  if (!tdoId) {
    console.log('tdoId is required');
    throw new Error('tdoId is required');
  }

  if (!manifest) {
    console.log('manifest is required');
    throw new Error('manifest is required');
  }
  const streamUrl = `${mediaStreamerUrl}/stream/${tdoId}/${manifest}?${querystring.stringify(
    reqParams
  )}`;

  return supertest(streamUrl).get('').set(reqOptions.headers).expect(200);
}

async function testMediaStreamerMediaSource(
  mediaStreamerUrl,
  reqOptions,
  reqParams
) {
  const sourceId = _.get(reqParams, 'sourceId', '-1');
  const programId = _.get(reqParams, 'programId', '-1');

  if (!_.has(reqParams, 'startDate') || !_.has(reqParams, 'endDate')) {
    console.log('startDate and endDate are required');
    throw new Error('startDate and endDate are required');
  }

  if (!_.has(reqParams, 'mediaId')) {
    console.log('mediaId is required');
    throw new Error('mediaId is required');
  }

  const queryString = _.pick(reqParams, ['startDate', 'endDate', 'mediaId']);
  const mediaSourceUrl = `${mediaStreamerUrl}/mediasource/${sourceId}/programId/${programId}?${querystring.stringify(
    reqParams
  )}`;

  return supertest(mediaSourceUrl).get('').set(reqOptions).expect(200);
}

async function deleteOrganization(baseUri, orgId, token) {
  const adminUrl = `${baseUri}/admin/`;
  return supertest(adminUrl)
    .delete(`organizations/${orgId}/`)
    .set({
      Authorization: 'Bearer ' + token
    })
    .expect(204);
}

function responseStatusParserThrowErrorOnNon200Status(respObj) {
  if (respObj.status !== 200) {
    if (config.debug) {
      console.log(JSON.stringify(respObj, null, 2));
    }
    throw new Error(`Server response error: ${respObj.status}`);
  }
}

function responseStatusParserAllowAllStatus(respObj) {}

function responseParserThrowErrorOnBodyError(respObj) {
  const data = responseParserThrowErrorOnNoBody(respObj);
  if (data.errors && data.errors.length > 0) {
    if (config.debug) {
      console.log(JSON.stringify(data._response.body, null, 2));
    }
    throw new Error(JSON.stringify(data.errors));
  }
  return data;
}

function responseParserThrowErrorOnNoBody(respObj) {
  const body = respObj.body;
  if (body) {
    const { data, errors } = body;
    data._response = respObj;
    data.errors = errors;
    return data;
  } else {
    const message = 'no body data';
    throw new Error(message);
  }
}

function responseParser(respObj) {
  return respObj;
}

/**
 * get an array of error from graphql query function
 * @param {*} err the error
 * @returns an array of errors
 * e.g: [
 *  {
      message: 'the application roles are invalid. Some permissions are not allowed',
      name: 'not_allowed',
      time_thrown: '2024-10-04T04:01:14.805Z',
      data: {
        applicationRoles: [ [Object] ],
        roles: { whitelist: [], blacklist: [Array] },
        errorId: '6d3a52a9-06b9-4353-a578-9668c454087a',
        requestId: '9024166d-e369-42d3-9f6d-0c7b61cd4030',
        correlationId: '3679ad4d-baf5-4cb9-b5f8-43b201eb9326'
      },
      path: [ 'createApplication' ],
      locations: [ { line: 3, column: 9 } ]
    }
 * ]
 */
function getErrorsFromGraphqlResponse(err) {
  if (typeof err !== 'object' && typeof err !== 'string') {
    return err;
  }
  let errorsStr = `${err}`;
  errorsStr = errorsStr.startsWith('Error: ')
    ? errorsStr.replace('Error: ', '')
    : errorsStr;
  try {
    return JSON.parse(errorsStr);
  } catch (error) {
    console.log(`getErrorsFromGraphqlResponse: Error:`, error);
    return [];
  }
}

async function getOrganization(baseUri, orgId, token) {
  const adminUrl = `${baseUri}/admin/`;
  const response = await supertest(adminUrl)
    .get(`organizations/${orgId}/`)
    .set({ Authorization: 'Bearer ' + token })
    .expect(200);
  return response.body;
}

async function updateOrganization(baseUri, orgId, token, payload) {
  const adminUrl = `${baseUri}/admin/`;
  return supertest(adminUrl)
    .put(`organizations/${orgId}/`)
    .set({
      Authorization: 'Bearer ' + token
    })
    .send(payload)
    .expect(200);
}

async function addRole(baseUri, userId, roleId, token) {
  const adminUrl = `${baseUri}/admin/`;
  return supertest(adminUrl)
    .post(`users/${userId}/roles/${roleId}/`)
    .set({
      Authorization: 'Bearer ' + token
    })
    .expect(204);
}

module.exports = {
  DEFAULT_USER_AGENT: userAgent,
  config,
  supertest,

  // Http Request wrapper functions
  postRetry,
  signin,
  testMediaStreamerDownload,
  testMediaStreamerStreams,
  testMediaStreamerMediaSource,
  deleteOrganization,

  // Url constants
  authUrl: AUTH_URL,
  graphqlUrl: GRAPHQL_URL,
  mediaStreamerUrl: MEDIA_STREAMER_URL,

  // utility functions
  requestOptions: (token) => {
    return {
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        Accept: '*/*',
        'Veritone-Correlation-ID': uuid.v4(),
        'X-Veritone-Application': 'GraphQL-CI-Test'
      }
    };
  },

  printResponse: (response) =>
    console.log(JSON.stringify(response.json, null, '\t')),

  expect: (value, valueName = 'value') =>
    expect(
      value ? valueName : value,
      valueName + ' = ' + JSON.stringify(value, null, 2)
    ),

  expectInResponse: (value, response) =>
    expect(value, 'response = ' + JSON.stringify(response, null, 2)),

  getTestBuildInfo: () => {
    try {
      const buildInfo = require('../../buildInfo.json');
      console.log('--- TEST BUILD INFO ---');
      console.log(JSON.stringify(buildInfo, null, 2));
      console.log('-----------------------');
      return buildInfo;
    } catch (err) {
      console.log('error getting build info:  ' + err);
      return {
        commitHash: '...',
        commitDate: new Date(),
        buildNumber: 1,
        buildDate: new Date(),
        branch: 'develop'
      };
    }
  },
  getUniqueList: (engineRuns, type) => {
    if (!engineRuns) return [];
    return _(engineRuns)
      .map((engineRun) => {
        return type && type === 'category'
          ? engineRun.engine.category.id
          : engineRun.engine.id;
      })
      .uniq()
      .value();
  },
  canTestEventing: () => {
    const localGraphql = _.includes(config.graphql_url, 'local');
    const localEventing = process.env.LOCAL_EVENTING === 'true';

    return !localGraphql || (localGraphql && localEventing);
  },
  mediaStreamerHeader: (token) => {
    return { headers: { Authorization: 'Bearer ' + token } };
  },
  isLocalHost: (endpoint) => {
    const hostname = url.parse(endpoint).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1';
  },
  sleep: (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
  responseStatusParserThrowErrorOnNon200Status,
  responseStatusParserAllowAllStatus,
  responseParserThrowErrorOnBodyError,
  responseParserThrowErrorOnNoBody,
  responseParser,
  getErrorsFromGraphqlResponse,
  getOrganization,
  updateOrganization,
  addRole
};
