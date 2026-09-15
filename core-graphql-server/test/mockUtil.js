const _ = require('lodash');
const httpMock = require('node-mocks-http');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// hard-coded authentication contexts that exactly
// resemble those produced by core-server-base
// authentication middleware for the different token
// types supported.
const userContext = require('./tokenContextUser.json');
const orgApiContext = require('./tokenContextOrgApi.json');
const internalApiContext = require('./tokenContextInternalApi.json');
const engineJWTContext = require('./tokenContextEngineJwt.json');

module.exports = function init() {
  /**
   * get a mock request object with an appropriate authentication context
   *
   * @param authToken Authentication token. Optional. If not provided,
   *   the token hard-coded into the test context for the auth context
   *   type will be used. If a token is provided but not type,
   *   defaults to "user"
   * @param authType Type of token -- user, api_org, api_internal, engineJwt,
   *   or none (indicating no authentication).
   *   If not provided, the request will not have an authentication context.
   */
  function getRequest(authToken = null, authType) {
    const context = getGraphQLContext(authToken, authType);
    const req = httpMock.createRequest({
      method: 'POST',
      url: '/v3/graphql',
      headers: {
        Authorization: _.get(context, 'authToken')
          ? 'Bearer ' + context.authToken
          : undefined
      }
    });
    req.context = context;

    return req;
  }

  function getGraphQLContext(authToken = null, authType, authRole) {
    let context;
    let type = authType;
    // default to user if a token is provided but not type
    if (!authType && authToken) type = 'user';
    else if (!authToken && !authType) type = 'none';
    switch (type) {
      case 'user':
        context = _.cloneDeep(userContext);
        if (authRole === 'regularUser') {
          context.userInfo.permissionMasks = [];
        }
        if (authRole === 'orgAdmin') {
          context.userInfo.permissionMasks = [16];
        }
        break;
      case 'api_org':
        context = orgApiContext;
        break;
      case 'engineJWT':
        context = engineJWTContext;
        break;
      case 'api_internal':
        context = internalApiContext;
        break;
      case 'none': // tests unauthenticated code path
        break;
      default:
        throw new Error('unknown type ' + type);
    }
    let token = authToken;
    if (!token && context) {
      // if a token was not given explicitly but
      // we have a context, use the token embedded
      // in the context.
      authToken = context.authToken;
    } else if (token && context) {
      // or, if a token was given, set it into
      // the context.
      context.authToken = token;
    }

    return context;
  }

  /**
   * Get a mock HTTP response object.
   */
  function getHttpResponse() {
    return httpMock.createResponse();
  }

  /**
   * Returns a function suitable for use as middleware
   * next parameter. It sets HTTP response status to 200
   * with the specified body, or a default GraphQL body
   * if one is not provided.
   * @param httpResponse The HTTP response object
   */
  function getOkHttpResponseNext(httpResponse, body = null) {
    if (!httpResponse) throw new Error('httpResponse must be provided.');
    const defBody = {
      data: {
        query: {
          id: '123'
        }
      }
    };
    return () => {
      httpResponse._weHandled = true;
      httpResponse
        .status(200)
        .set('Content-Type', 'application/json')
        .send(_.isNil(body) ? defBody : body);
    };
  }

  /**
   * Gets an engine JWT suitable for unit testing.
   * Uses the provided service context for config.
   * If not provided, a hard-coded JWT secret is used.
   *
   * @param serviceContext service context containing
   *  configuration. Optional. However, if not provided,
   * the JWT might not be validated by source code that
   * depends on a shared secret.
   */
  function getEngineJWT(serviceContext) {
    const defaultSecret = 'xkasd978z234ac1b2';
    const jwtSecret = serviceContext
      ? _.get(serviceContext, 'config.jwt.secret', defaultSecret)
      : defaultSecret;

    const task = {
      engineId: 'engine-123',
      applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
      recordingId: '123',
      jobId: toTaskId('job-123'),
      taskId: toTaskId('task-job-123')
    };
    const data = {
      contentApplicationId: task.applicationId,
      contentOrganizationId: 7682,
      scope: [
        {
          actions: ['asset:create', 'asset:uri'],
          resources: {
            recordingIds: [task.recordingId]
          }
        },
        {
          actions: ['task:read', 'task:update'],
          resources: {
            jobIds: [task.jobId],
            taskIds: [task.taskId]
          }
        }
      ]
    };
    const info = {
      expiresIn: '1d',
      jwtid: uuidv4(),
      subject: 'engine-run'
    };
    return jwt.sign(data, jwtSecret, info);
  }

  function makeContext(options) {
    const op = options || {};
    const rc = getGraphQLContext(null, op.authType || 'user', op.authRole);

    return {
      requestContext: rc,
      _authInfo: rc.userInfo || rc.tokenInfo,
      requestInfo: {
        correlationId: '12345',
        requestId: '12345',
        responseTotalSize: 0,
        startTime: Date.now()
      }
    };
  }

  // test util for module core-job-server
  function createSpyObj(baseName, methodNames) {
    let obj = {};

    for (let i = 0; i < methodNames.length; i++) {
      obj[methodNames[i]] = jest.fn();
    }

    return obj;
  }

  function spyOn(baseObj, methodName) {
    return {
      and: {
        callFake: (mockFunc) => {
          baseObj[methodName] = jest.fn().mockImplementation(mockFunc);
        }
      }
    };
  }

  function spyWasCalledWith(spy, funcToApplyArgs) {
    if (!spy.calls || !_.isFunction(spy.calls.first)) {
      throw new Error('spy must be a jasmine spy that has been called');
    }

    if (!_.isFunction(funcToApplyArgs)) {
      throw new Error('funcToApplyArgs must be a function');
    }

    expect(spy).toHaveBeenCalled();
    funcToApplyArgs.apply(null, spy.calls.first().args);
  }

  function callbackWith() {
    const argsToCallWith = Array.prototype.slice.call(arguments);

    return function receiveAndCall() {
      let callback = arguments[arguments.length - 1];
      if (!_.isFunction(callback)) {
        throw new Error('missing callback');
      }

      callback(...argsToCallWith);  
    };
  }

  function runBasicDalTests(testContext, funcToTestGetter) {
    if (!_.isFunction(funcToTestGetter)) {
      throw new Error('funcToTestGetter is not a function.');
    }

    describe('test common dal behavior', () => {
      beforeEach(() => {
        testContext.funcToTest = funcToTestGetter.call(this);
      });

      it('should throw when there is a missing callback param', () => {
        expect(testContext.funcToTest).toThrowError(/callback/);
      });

      it('should execute callback with an error on connect failure', () => {
        testContext.pg.connect.mockImplementation(
          callbackWith(new Error('conn error man'))
        );

        testContext.funcToTest(
          testContext.mainCallback.mockImplementation(function (err, result) {
            expect(err.message).toMatch(/conn error man/);
            expect(result).toBe(null);
          })
        );

        expect(testContext.mainCallback).toHaveBeenCalled();
      });

      it('should execute callback with an error on query failure', () => {
        testContext.pg.query.mockImplementation(
          callbackWith(new Error('query error man'))
        );

        testContext.funcToTest(
          testContext.mainCallback.mockImplementation(function (err) {
            expect(err.message).toMatch(/query error man/);
          })
        );

        expect(testContext.mainCallback).toHaveBeenCalled();
        expect(testContext.pg.connect).toHaveBeenCalled();
        expect(testContext.pg.release).toHaveBeenCalled();
        expect(testContext.pg.query).toHaveBeenCalled();
      });

      it('should execute callback with an error on invalid dbresult', () => {
        testContext.pg.query.mockImplementation(callbackWith(null, null));

        testContext.funcToTest(
          testContext.mainCallback.mockImplementation(function (err, result) {
            expect(err.message).toMatch(/dbResult.rows/);
            expect(result).toBeFalsy();
          })
        );

        expect(testContext.mainCallback).toHaveBeenCalled();
        expect(testContext.pg.connect).toHaveBeenCalled();
        expect(testContext.pg.release).toHaveBeenCalled();
        expect(testContext.pg.query).toHaveBeenCalled();
      });
    });
  }

  // Used by dal code under modules/core-job-server/dal.
  function runBasicDalTestsNew(testContext, funcToTestGetter) {
    if (!_.isFunction(funcToTestGetter)) {
      throw new Error('funcToTestGetter is not a function.');
    }

    describe('test common dal behavior', () => {
      beforeEach(() => {
        testContext.funcToTest = funcToTestGetter.call(this);
      });

      it('should throw when there is a missing callback param', async () => {
        await expect(testContext.funcToTest).rejects.toThrow(/callback/);
      });

      it('should execute callback with an error on query failure', async () => {
        testContext.coreConn.query.mockImplementation(() =>
          Promise.reject(new Error('query error man'))
        );

        await testContext.funcToTest(
          testContext.mainCallback.mockImplementation(function (err) {
            expect(err.message).toMatch(/query error man/);
          })
        );

        expect(testContext.coreConn.query).toHaveBeenCalled();
        expect(testContext.mainCallback).toHaveBeenCalled();
      });

      it('should execute callback with an error on invalid dbresult', async () => {
        testContext.coreConn.query.mockImplementation(() =>
          Promise.resolve(null)
        );

        await testContext.funcToTest(
          testContext.mainCallback.mockImplementation(function (err, result) {
            expect(err.message).toMatch(/dbResult/);
            expect(result).toBeFalsy();
          })
        );

        expect(testContext.mainCallback).toHaveBeenCalled();
        expect(testContext.coreConn.query).toHaveBeenCalled();
      });
    });
  }

  function mockCommonBase(testContext, options) {
    beforeEach(function () {
      testContext.app = {
        config: {
          services: {
            coreAdminUri: 'the-core-admin-uri'
          }
        },
        logger: createSpyObj('logger', ['info', 'error', 'debug', 'warn'])
      };

      testContext.mainCallback = jest.fn();

      if (options && options.initMockery) {
        if (!_.isFunction(options.initMockery)) {
          throw new Error('options.initMockery must be a function');
        }

        testContext.mockery = options.initMockery.call(this);

        testContext.mockery.enable({
          useCleanCache: true,
          warnOnUnregistered: false,
          warnOnReplace: false
        });
        _.keys(testContext.mockery).forEach((key) => {
          // arrow to allow to use this below
          testContext.mockery.registerMock(key, testContext.mockery[key]);
        });
      }
    });

    afterEach(function () {
      if (options && options.initMockery) {
        testContext.mockery.deregisterAll();
        testContext.mockery.disable();
      }
    });
  }

  function mockCommon(testContext, options) {
    mockCommonBase(testContext, options);

    beforeEach(() => {
      testContext.app = {
        config: {
          applicationName: 'core-job-server-test',
          db: {
            sso: {
              read: '',
              write: ''
            },
            media_platform: {
               
              read: '',
              write: ''
            },
            core: {
              read: '',
              write: ''
            },
            'core-job': {
              read: '',
              write: ''
            }
          },
          dnsZone: {},
          services: {
            coreAdminUri: 'core-admin-uri'
          },
          serverToken: 'abc-server'
        },
        logger: createSpyObj('logger', ['info', 'error', 'debug', 'trace']),
        redisClient: createSpyObj('redisClient', ['get', 'set']),
        redisCache: createSpyObj('redisCache', ['get', 'asyncSet'])
      };
      _.assign(
        testContext.app,
        createSpyObj('app', ['get', 'post', 'delete', 'put', 'use'])
      );

      testContext.model = require('../modules/core-job-server/model')();

      testContext.pg = createSpyObj('pg', ['connect', 'query', 'release']);
      testContext.pg.connect.mockImplementation(
        callbackWith(null, testContext.pg, testContext.pg.release)
      );
      testContext.pg.query.mockImplementation(callbackWith(null, null));

      testContext.app.redisClient.get.mockImplementation(
        callbackWith(null, null)
      );

      // Used by dal code under modules/core-job-server/dal.
      testContext.coreConn = {
        query: jest.fn()
      };

      testContext.req = {
        body: {},
        context: {},
        params: {}
      };

      testContext.res = createSpyObj('res', [
        'status',
        'send',
        'end',
        'set',
        'setHeader'
      ]);
      testContext.next = jest.fn();
      testContext.res.status = jest
        .fn()
        .mockImplementation(() => testContext.res);
      testContext.res.send = jest
        .fn()
        .mockImplementation(() => testContext.res);

      testContext.mainCallback = jest.fn();
    });
  }

  async function stringReplaceAsync(str, regex, asyncFn) {
    const promises = [];
    str.replace(regex, (match, ...args) => {
      const promise = asyncFn(match, ...args);
      promises.push(promise);
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift());
  }

  function fromTaskId(id) {
    return id.substring(id.indexOf('_') + 1);
  }

  function toTaskId(taskId) {
    return `${moment.utc().format('YYMMWWDD')}_${taskId}`;
  }

  function getMockEngineTemplate(engineId, type = 'reproc') {
    let template;
    const templatePath = './template/';
    const engineTemplateFilename = `engine.${engineId}.txt`;
    const engineTemplates = fs
      .readFileSync(
        path.resolve(__dirname, templatePath + engineTemplateFilename),
        'utf-8'
      )
      .toString()
      .split('\n');

    if (engineTemplates && engineTemplates.length >= 3) {
      const jobTemplatePath = `${templatePath}${engineTemplates[0]}.${type}.txt`;
      const dagTemplatePath = `${templatePath}${engineTemplates[1]}.${type}.txt`;
      const taskTemplatePath = `${templatePath}${engineTemplates[2]}.txt`;
      const jobTemplateString = fs.readFileSync(
        path.resolve(__dirname, jobTemplatePath),
        'utf-8'
      );
      const dagTemplateString = fs.readFileSync(
        path.resolve(__dirname, dagTemplatePath),
        'utf-8'
      );
      const taskTemplateString = fs.readFileSync(
        path.resolve(__dirname, taskTemplatePath),
        'utf-8'
      );

      if (jobTemplateString) {
        template = jobTemplateString
          .replace('<DAG>', dagTemplateString)
          .replace('<TASK>', taskTemplateString);
      }
    }

    return template;
  }

  return {
    getOkHttpResponseNext,
    getHttpResponse,
    getRequest,
    getGraphQLContext,
    makeContext,
    getEngineJWT,
    // test util for module core-job-server
    spyWasCalledWith,
    callbackWith,
    runBasicDalTests,
    runBasicDalTestsNew,
    mockCommon,
    createSpyObj,
    spyOn,
    stringReplaceAsync,
    toTaskId,
    fromTaskId,
    getMockEngineTemplate
  };
};
