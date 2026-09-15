const chaiExpet = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.V3_DATA_MODEL);

const { eventsMap } = require('@veritone/core-server-base/events-map.js');

const dal = require('./dalEngine.js')(
  null,
  serviceContext.logger,
  null,
  null,
  serviceContext.blls3,
  serviceContext.config,
  serviceContext.dal.tdo,
  serviceContext.app,
  serviceContext
);
serviceContext.bll.rbacAuth.hasPermissions = jest.fn();
describe('coreJob routes engines tests', function () {
  describe('when accessing updateEngine', function () {
    let mockRequestEngine, mockResponseEngine, args, context, mock;

    beforeEach(() => {
      mockRequestEngine = {
        engineCategoryId: '088a31be-9bd6-4628-a6f0-e4004e362ea0',
        engineName: 'some engine',
        engineDescription: 'some engine description',
        deploymentModel: 0,
        isPublic: false,
        price: 1,
        jwtRights: {
          roles: [
            {
              roleName: 'foo',
              taskRights: ['foo'],
              assetRights: ['bar']
            }
          ]
        }
      };

      mockResponseEngine = mockRequestEngine;
      mockResponseEngine.engineId = '23cde077-9575-4b46-b011-d55e41cb4545';
      mockResponseEngine.engineState = 'draft';
      mockResponseEngine.ownerOrganizationId = 1336;

      args = {
        input: {
          id: mockResponseEngine.engineId
        },
        organizationId: mockResponseEngine.ownerOrganizationId
      };
      context = mockUtil.makeContext();

      // reset a mock back to its initial state
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockReset();
      serviceContext.coreJob.cjdal.engine.updateEngine.mockReset();

      // Mock values
      mock = {
        getEngineResponse: {
          engineId: mockResponseEngine.engineId,
          ownerOrganizationId: mockResponseEngine.ownerOrganizationId,
          engineState: mockResponseEngine.engineState,
          engineCategoryId: mockResponseEngine.engineCategoryId
        },
        getEngineCategoryResponse: [
          {
            id: mockResponseEngine.engineCategoryId,
            engine_ids: [mockResponseEngine.engineId],
            engine_alias_ids: [mockResponseEngine.engineId]
          }
        ]
      };
    });

    it('should return 400 on engine model validation with error', async function () {
      let res, err;

      mockRequestEngine = {};
      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );

      try {
        res = await dal._updateEngine(args, mockRequestEngine, context);
      } catch (error) {
        expect(error.message).toEqual('bad request');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
      expect(err.name).toEqual('invalid_input');
      // verify the validation errors data
      const validationErrs = _.get(err, 'data.validationErrs');
      expect(validationErrs).toEqual(expect.any(Object));
      expect(Object.keys(validationErrs)).toEqual(
        expect.arrayContaining([
          'engineName',
          'engineCategoryId',
          'engineDescription',
          'deploymentModel',
          'isPublic'
        ])
      );
    });

    it('should return 400 on engine model validation with error', async function () {
      let res, err;

      mockRequestEngine.engineCategoryId = 'wut';

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );

      try {
        res = await dal._updateEngine(args, mockRequestEngine, context);
      } catch (error) {
        expect(error.message).toEqual('invalid engine category id');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
      expect(err.name).toEqual('invalid_input');
      // verify the validation errors data
      expect(err.data).toEqual({
        objectType: 'engineCategoryId',
        objectData: mockRequestEngine.engineCategoryId
      });
    });

    it('should return 400 on update JwtRights for private engine', async function () {
      let res, err;

      mockRequestEngine.isPublic = true;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );

      try {
        res = await dal._updateEngine(args, mockRequestEngine, context);
      } catch (error) {
        expect(error.message).toEqual('bad request');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
      expect(err.name).toEqual('invalid_input');
      // verify the validation errors data
      chaiExpet(err.data).to.include.keys('validationErrs');
      const validationErrs = _.get(err, 'data.validationErrs');
      chaiExpet(validationErrs).to.include.keys('jwtRights');
      expect(validationErrs.jwtRights.message).toEqual(
        'cannot update jwtRights for public engines'
      );
    });

    it('should return 503 on engine with error', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );
      // get engine category
      serviceContext.coreJob.cjdal.engineCategory.getEngineCategory.mockImplementationOnce(
        (engineCategoryId, dbClient, callback) => {
          return callback(null, {
            dependencies: { category: 'derek', dependencies: ['ingestion'] }
          });
        }
      );
      // mock update engine
      serviceContext.coreJob.cjdal.engine.updateEngine.mockImplementationOnce(
        (engine, dbClient, callback) => {
          return callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal._updateEngine(args, mockRequestEngine, context);
      } catch (error) {
        expect(error.message).toEqual(
          'The server experienced an internal error'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
    });

    it('should return 200 with engine', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );
      // get engine category
      serviceContext.coreJob.cjdal.engineCategory.getEngineCategory.mockImplementationOnce(
        (engineCategoryId, dbClient, callback) => {
          return callback(null, {
            engineCategoryName: 'Transcription',
            dependencies: { category: 'derek', dependencies: ['ingestion'] }
          });
        }
      );
      // mock update engine
      serviceContext.coreJob.cjdal.engine.updateEngine.mockImplementationOnce(
        (engine, dbClient, callback) => {
          expect(engine.asset).toEqual(mockResponseEngine.engineId);
          return callback(null, mockResponseEngine);
        }
      );
      // mock autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          expect(engine.engineId).toEqual(mockResponseEngine.engineId);
          return callback(
            null,
            Object.assign(mockResponseEngine, { engineState: 'active' })
          );
        }
      );

      try {
        res = await dal._updateEngine(args, mockRequestEngine, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.updateEngine.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mock
          .calls.length
      ).to.equal(1);
      const expectedRes = Object.assign(mockResponseEngine, {
        engineState: 'active',
        deploymentModel: 'FullyNetworkIsolated',
        deploymentModelNum: 0,
        id: mockResponseEngine.engineId,
        name: mockResponseEngine.engineName,
        state: mockResponseEngine.engineState,
        description: mockResponseEngine.engineDescription,
        categoryId: mockResponseEngine.engineCategoryId,
        internalId: mockResponseEngine.engineId
      });
      // for testing the mapper
      chaiExpet(
        _.omitBy(res, (prop) => {
          return _.isNull(prop) || _.isUndefined(prop);
        })
      ).to.eql(expectedRes);
      // verify the event message
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      const message = _.head(serviceContext.messageUtil._messages());
      expect(_.omit(message, 'updatedFields')).toEqual({
        event: 'engine_update',
        type: 'engine',
        serviceName: 'core-graphql-server',
        requestUrl: _.get(context, 'requestInfo.httpUrl'),
        action: 'update',
        engineId: mockResponseEngine.engineId,
        success: 201,
        statusCode: 201,
        organizationId: args.organizationId,
        userId: _.get(context, '_authInfo.userId')
      });
    });
  });

  describe('when accessing disableEngine', function () {
    let mockResponseEngine, args, context, mock;

    beforeEach(() => {
      mockResponseEngine = {
        engineId: 'some engine',
        ownerOrganizationId: 7682,
        engineState: 'active',
        engineCategoryId: 'd2bb985b-7be0-4a5d-9a06-34e49a2974bc'
      };
      args = {
        input: {
          id: mockResponseEngine.engineId
        },
        organizationId: mockResponseEngine.ownerOrganizationId
      };
      context = mockUtil.makeContext();
      // reset a mock back to its initial state
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mockReset();
      serviceContext.coreJob.cjdal.engine.updateEngineState.mockReset();

      // Mock values
      mock = {
        getEngineResponse: {
          engineId: mockResponseEngine.engineId,
          ownerOrganizationId: mockResponseEngine.ownerOrganizationId,
          engineState: mockResponseEngine.engineState,
          engineCategoryId: mockResponseEngine.engineCategoryId
        },
        getEngineCategoryResponse: [
          {
            id: mockResponseEngine.engineCategoryId,
            engine_ids: [mockResponseEngine.engineId],
            engine_alias_ids: [mockResponseEngine.engineId]
          }
        ]
      };
    });

    it('should return 503 on pause deployed builds for engine state dal error', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );
      // mock pauseDeployedBuildsForEngine
      serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal._disableEngine(args, context);
      } catch (error) {
        expect(error.message).toEqual(
          'The server experienced an internal error'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
      expect(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).toEqual(1);
      expect(
        serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mock
          .calls.length
      ).toEqual(1);
    });

    it('should return 503 on update engine state dal error', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );
      // mock pauseDeployedBuildsForEngine
      serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, null);
        }
      );
      // mock updateEngineState
      serviceContext.coreJob.cjdal.engine.updateEngineState.mockImplementationOnce(
        (engineId, engineState, dbClient, callback) => {
          return callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal._disableEngine(args, context);
      } catch (error) {
        expect(error.message).toEqual(
          'The server experienced an internal error'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mock
          .calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.updateEngineState.mock.calls.length
      ).to.equal(1);
    });

    it('should return 200 with engine', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );
      // mock pauseDeployedBuildsForEngine
      serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, null);
        }
      );
      // mock updateEngineState
      serviceContext.coreJob.cjdal.engine.updateEngineState.mockImplementationOnce(
        (engineId, engineState, dbClient, callback) => {
          callback(
            null,
            Object.assign(mockResponseEngine, { engineState: 'disabled' })
          );
        }
      );

      try {
        res = await dal._disableEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mock
          .calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.updateEngineState.mock.calls.length
      ).to.equal(1);

      const expectedRes = Object.assign(mockResponseEngine, {
        engineState: 'disabled',
        id: mockResponseEngine.engineId,
        state: 'disabled',
        internalId: mockResponseEngine.engineId,
        categoryId: mockResponseEngine.engineCategoryId
      });
      // for testing the mapper
      chaiExpet(
        _.omitBy(res, (prop) => {
          return _.isNull(prop) || _.isUndefined(prop);
        })
      ).to.eql(expectedRes);

      // verify the event message
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      const message = _.head(serviceContext.messageUtil._messages());
      expect(message).toEqual({
        event: 'engine_disable',
        type: 'engine',
        serviceName: 'core-graphql-server',
        requestUrl: _.get(context, 'requestInfo.httpUrl'),
        action: 'disable',
        engineId: mockResponseEngine.engineId,
        success: 201,
        updatedFields: undefined,
        statusCode: 200,
        organizationId: args.organizationId,
        userId: _.get(context, '_authInfo.userId')
      });
    });
  });

  describe('when accessing enableEngine', function () {
    let mockResponseEngine, args, context, mock;

    beforeEach(() => {
      mockResponseEngine = {
        engineId: 'some engine',
        ownerOrganizationId: 7682,
        engineState: 'disabled',
        engineCategoryId: '3db50762-6b3c-4fde-88e2-f3c9df88c852'
      };
      args = {
        input: {
          id: mockResponseEngine.engineId
        },
        organizationId: mockResponseEngine.ownerOrganizationId
      };
      context = mockUtil.makeContext();
      // reset a mock back to its initial state
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockReset();

      mock = {
        getEngineResponse: {
          engineId: mockResponseEngine.engineId,
          ownerOrganizationId: mockResponseEngine.ownerOrganizationId,
          engineState: mockResponseEngine.engineState,
          engineCategoryId: mockResponseEngine.engineCategoryId
        },
        getEngineCategoryResponse: [
          {
            id: mockResponseEngine.engineCategoryId,
            engine_ids: [mockResponseEngine.engineId],
            engine_alias_ids: [mockResponseEngine.engineId]
          }
        ]
      };
    });

    it('should return 503 on auto trans state error', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );
      // mock pauseDeployedBuildsForEngine
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          expect(engine.engineId).toEqual(mockResponseEngine.engineId);
          return callback(new Error('some error'));
        }
      );

      try {
        res = await dal._enableEngine(args, context);
      } catch (error) {
        expect(error.message).toEqual('some error');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mock
          .calls.length
      ).to.equal(1);
    });

    it('should return 200 on auto trans state', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );
      // mock pauseDeployedBuildsForEngine
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          expect(engine.engineId).toEqual(mockResponseEngine.engineId);
          return callback(
            null,
            Object.assign(mockResponseEngine, { engineState: 'ready' })
          );
        }
      );

      try {
        res = await dal._enableEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();

      const expectedRes = Object.assign(mockResponseEngine, {
        engineState: 'ready',
        id: mockResponseEngine.engineId,
        state: 'ready',
        internalId: mockResponseEngine.engineId,
        categoryId: mockResponseEngine.engineCategoryId
      });
      // for testing the mapper
      chaiExpet(
        _.omitBy(res, (prop) => {
          return _.isNull(prop) || _.isUndefined(prop);
        })
      ).to.eql(expectedRes);

      // verify the event message
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      const message = _.head(serviceContext.messageUtil._messages());
      expect(message).toEqual({
        event: 'engine_enable',
        type: 'engine',
        serviceName: 'core-graphql-server',
        requestUrl: _.get(context, 'requestInfo.httpUrl'),
        action: 'enable',
        engineId: mockResponseEngine.engineId,
        success: 201,
        updatedFields: undefined,
        statusCode: 200,
        organizationId: args.organizationId,
        userId: _.get(context, '_authInfo.userId')
      });
    });
  });

  describe('when accessing deleteEngine', function () {
    let mock, mockResponseEngine, args, context;

    beforeEach(() => {
      mockResponseEngine = {
        engineId: 'some engine',
        ownerOrganizationId: 7682,
        engineState: 'ready',
        engineCategoryId: 'bdac2fbe-0803-4e53-b146-08a33afe9248'
      };
      args = {
        input: {
          engineId: mockResponseEngine.engineId
        },
        organizationId: mockResponseEngine.ownerOrganizationId
      };
      context = mockUtil.makeContext();
      // reset a mock back to its initial state
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.engine.deleteEngine.mockReset();

      mock = {
        getEngineResponse: {
          engineId: mockResponseEngine.engineId,
          ownerOrganizationId: mockResponseEngine.ownerOrganizationId,
          engineState: mockResponseEngine.engineState,
          engineCategoryId: mockResponseEngine.engineCategoryId
        },
        getEngineCategoryResponse: [
          {
            id: mockResponseEngine.engineCategoryId,
            engine_ids: [mockResponseEngine.engineId],
            engine_alias_ids: [mockResponseEngine.engineId]
          }
        ]
      };
    });

    it('should return 503 on engine with error', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );
      // mock deleteEngine
      serviceContext.coreJob.cjdal.engine.deleteEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal._deleteEngine(args, context);
      } catch (error) {
        expect(error.message).toEqual('some error');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.deleteEngine.mock.calls.length
      ).to.equal(1);
    });

    it('should return 204 on no engine found or success', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        mock.getEngineCategoryResponse,
        false
      );
      // mock deleteEngine
      serviceContext.coreJob.cjdal.engine.deleteEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, null);
        }
      );

      try {
        res = await dal._deleteEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
  });

  describe('when accessing createEngineBuild', function () {
    let mockResponseBuild, context, mockEngine, input;

    beforeEach(() => {
      context = mockUtil.makeContext();
      mockResponseBuild = {
        price: 1,
        buildId: '23cde077-9575-4b46-b011-d55e41cb4545',
        engineId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
        buildState: 'fetching'
      };
      mockEngine = {
        engineId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
        price: 100,
        deploymentModel: 0,
        engineManifest: { foo: 'bar' }
      };
      input = {
        engineId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0'
      };
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.build.createEngineBuild.mockReset();
    });

    it('should return 400 on build model validation with error', async function () {
      let res, err;

      mockEngine.deploymentModel = null;

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mockEngine);
        }
      );

      try {
        res = await dal.newCreateEngineBuild(context, { input });
      } catch (error) {
        expect(error.message).toEqual('bad request');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).to.equal(1);
      expect(err).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildCreate,
        expect.any(Object),
        expect.objectContaining({
          action: 'create',
          statusCode: 500
        }),
        expect.any(Object)
      );
      expect(err.name).toEqual('invalid_input');
      // verify the validation errors data
      chaiExpet(err.data).to.include.keys('validationErrs');
      const validationErrs = _.get(err, 'data.validationErrs');
      chaiExpet(validationErrs).to.include.keys('deploymentModel');
    });

    it('should return 503 on engine with error', async function () {
      let res, err;

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mockEngine);
        }
      );
      serviceContext.coreJob.cjdal.build.createEngineBuild.mockImplementationOnce(
        (build, dbClient, callback) => {
          return callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal.newCreateEngineBuild(context, { input });
      } catch (error) {
        expect(error.message).toEqual('some error');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpet(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.createEngineBuild.mock.calls.length
      ).to.equal(1);
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildCreate,
        expect.any(Object),
        expect.objectContaining({
          action: 'create',
          statusCode: 500
        }),
        expect.any(Object)
      );
    });

    it('should return 201 with engine', async function () {
      let res, err;

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mockEngine);
        }
      );
      serviceContext.coreJob.cjdal.build.createEngineBuild.mockImplementationOnce(
        (build, dbClient, callback) => {
          return callback(null, mockResponseBuild);
        }
      );
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: input.engineId
          });
        }
      );

      try {
        res = await dal.newCreateEngineBuild(context, { input });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpet(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.createEngineBuild.mock.calls.length
      ).to.equal(1);
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildCreate,
        expect.any(Object),
        expect.objectContaining({
          action: 'create',
          statusCode: 201
        }),
        undefined
      );
      chaiExpet(res).exist;
      expect(err).toBeUndefined();
      chaiExpet(
        _.omitBy(res, (prop) => {
          return _.isNull(prop) || _.isUndefined(prop);
        })
      ).to.eql(
        Object.assign(mockResponseBuild, {
          id: mockResponseBuild.buildId,
          state: mockResponseBuild.buildState,
          status: mockResponseBuild.buildState,
          runtime: {
            edge: {}
          }
        })
      );
    });
  });

  describe('when accessing deleteEngineBuild', function () {
    let args, context;

    beforeEach(() => {
      args = {
        input: {
          buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
          engineId: '23cde077-9575-4b46-b011-d55e41cb4545'
        }
      };
      context = mockUtil.makeContext();
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockReset();
      serviceContext.coreJob.cjdal.build.deleteEngineBuild.mockReset();
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mockReset();
    });

    it('should return 503 on update build state error', async function () {
      let res, err;

      //loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            buildId: args.input.buildId,
            buildState: 'available'
          });
        }
      );
      // deleteEngineBuild
      serviceContext.coreJob.cjdal.build.deleteEngineBuild.mockImplementationOnce(
        (buildId, dbClient, callback) => {
          return callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal.newDeleteEngineBuild(args, context);
      } catch (error) {
        expect(error.message).toEqual(
          'The server experienced an internal error'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
      chaiExpet(
        serviceContext.coreJob.cjdal.build.getEngineBuild.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.deleteEngineBuild.mock.calls.length
      ).to.equal(1);
    });

    it('should return 204', async function () {
      let res, err;

      //loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            buildId: args.input.buildId,
            buildState: 'available'
          });
        }
      );
      // deleteEngineBuild
      serviceContext.coreJob.cjdal.build.deleteEngineBuild.mockImplementationOnce(
        (buildId, dbClient, callback) => {
          return callback(null, {});
        }
      );

      try {
        res = await dal.newDeleteEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual({
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        buildState: 'available'
      });
      chaiExpet(
        serviceContext.coreJob.cjdal.build.getEngineBuild.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.deleteEngineBuild.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock.calls
          .length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][0]
      ).to.equal(eventsMap.EngineBuildDelete);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][1]
      ).to.equal(context);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][2]
      ).to.eql({
        action: 'delete',
        userInfo: context._authInfo,
        actionDetails: "Deleted build ffffffff-9bd6-4628-a6f0-e4004e362ea0 for engine 23cde077-9575-4b46-b011-d55e41cb4545",
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        statusCode: 204
      });
    });

    it('should emit failed build deletion event if the parent operation fails', async function () {
      let res, err;
      //loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            buildId: args.input.buildId,
            buildState: 'available'
          });
        }
      );
      // deleteEngineBuild
      serviceContext.coreJob.cjdal.build.deleteEngineBuild.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          return callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal.newDeleteEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildDelete,
        expect.any(Object),
        expect.objectContaining({
          action: 'delete',
          statusCode: 500
        }),
        expect.any(Object)
      );
    });
  });

  describe('when accessing deployEngineBuild', function () {
    let args, context;

    beforeEach(() => {
      args = {
        input: {
          buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
          engineId: '23cde077-9575-4b46-b011-d55e41cb4545'
        }
      };
      context = mockUtil.makeContext();
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockReset();
      serviceContext.coreJob.cjdal.build.updateBuildState.mockReset();
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mockReset();
    });

    it('should return 503 on update build state error', async function () {
      let res, err;

      // loadCheckEngine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: '23cde077-9575-4b46-b011-d55e41cb4545',
            edgeVersion: 3,
            deploymentModel: 1,
            engineManifest: { foo: 'bar' }
          });
        }
      );
      //loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            buildId: args.input.buildId,
            buildState: 'approved'
          });
        }
      );
      // pauseDeployedBuildForEngine
      serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback();
        }
      );
      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          return callback(new Error('some error'), null);
        }
      );
      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, trans, isEnabling, callback) => {
          return callback(null, { engineId: args.input.engineId });
        }
      );

      try {
        res = await dal.newDeployEngineBuild(args, context);
      } catch (error) {
        expect(error.message).toEqual('some error');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      chaiExpet(
        serviceContext.coreJob.cjdal.build.getEngineBuild.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
    });

    it('should return 200 with build', async function () {
      let res, err;

      // loadCheckEngine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            edgeVersion: 3,
            engineManifest: { foo: 'bar' }
          });
        }
      );
      //loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            buildId: args.input.buildId,
            buildState: 'approved',
            manifest: {
              runtime: ''
            }
          });
        }
      );
      // pauseDeployedBuildForEngine
      serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback();
        }
      );
      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('deployed');
          return callback(null, {
            buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
            buildState: 'deployed'
          });
        }
      );
      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, trans, isEnabling, callback) => {
          return callback(null, { engineId: args.input.engineId });
        }
      );

      // check if package already exists, returns none
      serviceContext.dbConnections['core'].read._push([], false);

      // validate primary resource
      serviceContext.dbConnections['core'].read._push([], false);
      // packageCreate()
      serviceContext.dbConnections['core'].write._push(
        [
          {
            package_id: 'b0748515-0014-49e9-8583-856cca5ffa0b',
            package_name: 'new package name',
            package_version: '1.0',
            distribution_type: 'private',
            organization_id: 7682,
            status: 'published'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[8]).toEqual('published');
          return true;
        }
      );
      // for org check done in packageUpdateResources()
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // getLinkedResources
      serviceContext.dbConnections['core'].read._push([], false);

      // packageUpdateResourcesDb()
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: 'b0748515-0014-49e9-8583-856cca5ffa0b'
          }
        ],
        false
      );

      // getPackages()
      serviceContext.dbConnections['core'].read._push([], false);
      serviceContext.dbConnections['core'].read._push([], false);
      serviceContext.dbConnections['core'].read._push([], false);

      try {
        res = await dal.newDeployEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual({
        buildId: args.input.buildId,
        buildState: 'deployed'
      });
      chaiExpet(
        serviceContext.coreJob.cjdal.build.getEngineBuild.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock.calls
          .length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][0]
      ).to.equal(eventsMap.EngineBuildDeploy);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][1]
      ).to.equal(context);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][2]
      ).to.eql({
        action: 'deploy',
        buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
        actionDetails: "Deployed build ffffffff-9bd6-4628-a6f0-e4004e362ea0 for engine 23cde077-9575-4b46-b011-d55e41cb4545",
        engineId: '23cde077-9575-4b46-b011-d55e41cb4545',
        userInfo: context._authInfo,
        statusCode: 200
      });
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(2);
      // expect emit both package created and package installed events
      expect(messages[0].packageId).toEqual(
        'b0748515-0014-49e9-8583-856cca5ffa0b'
      ); // public event for creating automate package
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      expect(messages[1].packageId).toEqual(
        'b0748515-0014-49e9-8583-856cca5ffa0b'
      ); // public event for publishing automate package
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
    });
  });

  describe('when accessing pauseEngineBuild', function () {
    let args, context, mockResponseEngine, mock;

    beforeEach(() => {
      mockResponseEngine = {
        engineId: '23cde077-9575-4b46-b011-d55e41cb4545',
        ownerOrganizationId: 7682,
        engineState: 'disabled',
        engineCategoryId: '3db50762-6b3c-4fde-88e2-f3c9df88c852'
      };
      args = {
        input: {
          buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
          engineId: mockResponseEngine.engineId
        }
      };

      context = mockUtil.makeContext();
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockReset();
      serviceContext.coreJob.cjdal.build.updateBuildState.mockReset();
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockReset();
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mockReset();

      mock = {
        getEngineResponse: {
          engineId: mockResponseEngine.engineId,
          ownerOrganizationId: mockResponseEngine.ownerOrganizationId,
          engineState: mockResponseEngine.engineState,
          engineCategoryId: mockResponseEngine.engineCategoryId
        }
      };
    });

    it('should return 503 on update build state error', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );

      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('paused');
          callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal.newPauseEngineBuild(args, context);
      } catch (error) {
        expect(error.message).toEqual(
          'The server experienced an internal error'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildPause,
        expect.any(Object),
        expect.objectContaining({
          action: 'pause',
          statusCode: 500
        }),
        expect.any(Object)
      );
      expect(err.name).toEqual('internal_error');
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
    });

    it('should return 200 with build', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );

      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('paused');
          callback(null, {
            engineId: args.input.engineId,
            buildId: args.input.buildId,
            buildState: 'paused'
          });
        }
      );
      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: args.input.engineId,
            engineState: 'ready'
          });
        }
      );

      try {
        res = await dal.newPauseEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual({
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        buildState: 'paused'
      });
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mock
          .calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock.calls
          .length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][0]
      ).to.equal(eventsMap.EngineBuildPause);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][1]
      ).to.equal(context);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][2]
      ).to.eql({
        action: 'pause',
        userInfo: context._authInfo,
        actionDetails: "Paused build ffffffff-9bd6-4628-a6f0-e4004e362ea0 for engine 23cde077-9575-4b46-b011-d55e41cb4545",
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        statusCode: 200
      });
    });
  });

  describe('when accessing unpauseEngineBuild', function () {
    let args, context, mockResponseEngine, mock;

    beforeEach(() => {
      mockResponseEngine = {
        engineId: '23cde077-9575-4b46-b011-d55e41cb4545',
        ownerOrganizationId: 7682,
        engineState: 'disabled',
        engineCategoryId: '3db50762-6b3c-4fde-88e2-f3c9df88c852'
      };
      args = {
        input: {
          buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
          engineId: '23cde077-9575-4b46-b011-d55e41cb4545'
        }
      };
      context = mockUtil.makeContext();
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockReset();
      serviceContext.coreJob.cjdal.build.updateBuildState.mockReset();
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockReset();
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mockReset();

      mock = {
        getEngineResponse: {
          engineId: mockResponseEngine.engineId,
          ownerOrganizationId: mockResponseEngine.ownerOrganizationId,
          engineState: mockResponseEngine.engineState,
          engineCategoryId: mockResponseEngine.engineCategoryId
        }
      };
    });

    it('should return 503 on update build state error', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );

      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('approved');
          callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal.newUnpauseEngineBuild(args, context);
      } catch (error) {
        expect(
          serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
        ).toHaveBeenCalledWith(
          eventsMap.EngineBuildUnpause,
          expect.any(Object),
          expect.objectContaining({
            action: 'unpause',
            statusCode: 500
          }),
          expect.any(Object)
        );
        expect(error.message).toEqual(
          'The server experienced an internal error'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
    });

    it('should return 200 with build', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );

      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('approved');
          callback(null, {
            engineId: args.input.engineId,
            buildId: args.input.buildId,
            buildState: 'approved'
          });
        }
      );
      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: args.input.engineId,
            engineState: 'ready'
          });
        }
      );

      try {
        res = await dal.newUnpauseEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildUnpause,
        expect.any(Object),
        expect.objectContaining({
          action: 'unpause',
          statusCode: 200
        }),
        undefined
      );
      expect(res).toEqual({
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        buildState: 'approved'
      });
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mock
          .calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock.calls
          .length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][0]
      ).to.equal(eventsMap.EngineBuildUnpause);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][1]
      ).to.equal(context);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][2]
      ).to.eql({
        action: 'unpause',
        userInfo: context._authInfo,
        actionDetails: "Unpaused build ffffffff-9bd6-4628-a6f0-e4004e362ea0 for engine 23cde077-9575-4b46-b011-d55e41cb4545",
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        statusCode: 200
      });
    });
  });

  describe('when accessing approveEngineBuild', function () {
    let args, context, mockResponseEngine, mock;

    beforeEach(() => {
      mockResponseEngine = {
        engineId: '23cde077-9575-4b46-b011-d55e41cb4545',
        ownerOrganizationId: 7682,
        engineState: 'disabled',
        engineCategoryId: '3db50762-6b3c-4fde-88e2-f3c9df88c852'
      };
      args = {
        input: {
          buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
          engineId: mockResponseEngine.engineId
        }
      };
      context = mockUtil.makeContext();
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockReset();
      serviceContext.coreJob.cjdal.build.updateBuildState.mockReset();
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockReset();
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mockReset();

      mock = {
        getEngineResponse: {
          engineId: mockResponseEngine.engineId,
          ownerOrganizationId: mockResponseEngine.ownerOrganizationId,
          engineState: mockResponseEngine.engineState,
          engineCategoryId: mockResponseEngine.engineCategoryId
        }
      };
    });

    it('should return 503 on update build state error', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );

      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('approved');
          callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal.newApproveEngineBuild(args, context);
      } catch (error) {
        expect(
          serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
        ).toHaveBeenCalledWith(
          eventsMap.EngineBuildApprove,
          expect.any(Object),
          expect.objectContaining({
            action: 'approve',
            statusCode: 500
          }),
          expect.any(Object)
        );
        expect(error.message).toEqual(
          'The server experienced an internal error'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
    });

    it('should return 200 with build', async function () {
      let res, err;

      // loadCheckEngine()
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, mock.getEngineResponse);
        }
      );

      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('approved');
          callback(null, {
            engineId: args.input.engineId,
            buildId: args.input.buildId,
            buildState: 'approved'
          });
        }
      );
      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: args.input.engineId,
            engineState: 'ready'
          });
        }
      );

      try {
        res = await dal.newApproveEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildApprove,
        expect.any(Object),
        expect.objectContaining({
          action: 'approve',
          statusCode: 200
        }),
        undefined
      );
      expect(res).toEqual({
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        buildState: 'approved'
      });
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mock
          .calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock.calls
          .length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][0]
      ).to.equal(eventsMap.EngineBuildApprove);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][1]
      ).to.equal(context);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][2]
      ).to.eql({
        action: 'approve',
        userInfo: context._authInfo,
        actionDetails: "Approved new build ffffffff-9bd6-4628-a6f0-e4004e362ea0 for engine 23cde077-9575-4b46-b011-d55e41cb4545",
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        statusCode: 200
      });
    });
  });

  describe('when accessing disapproveEngineBuild', function () {
    let args, context;

    beforeEach(() => {
      args = {
        input: {
          buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
          engineId: '23cde077-9575-4b46-b011-d55e41cb4545'
        }
      };
      context = mockUtil.makeContext();
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockReset();
      serviceContext.coreJob.cjdal.build.updateBuildState.mockReset();
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockReset();
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mockReset();
    });

    it('should return 503 on update build state error', async function () {
      let res, err;

      // loadCheckEngine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: args.input.engineId,
            engineState: 'pending'
          });
        }
      );
      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('disapproved');
          callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal.newDisapproveEngineBuild(args, context);
      } catch (error) {
        expect(error.message).toEqual(
          'The server experienced an internal error'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildDisapprove,
        expect.any(Object),
        expect.objectContaining({
          action: 'disapprove',
          statusCode: 500
        }),
        expect.any(Object)
      );
      expect(err.name).toEqual('internal_error');
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
    });

    it('should return 200 with build', async function () {
      let res, err;

      // loadCheckEngine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: args.input.engineId,
            engineState: 'pending'
          });
        }
      );
      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('disapproved');
          callback(null, {
            engineId: args.input.engineId,
            buildId: args.input.buildId,
            buildState: 'disapproved'
          });
        }
      );

      try {
        res = await dal.newDisapproveEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildDisapprove,
        expect.any(Object),
        expect.objectContaining({
          action: 'disapprove',
          statusCode: 200
        }),
        undefined
      );
      expect(res).toEqual({
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        buildState: 'disapproved'
      });
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock.calls
          .length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][0]
      ).to.equal(eventsMap.EngineBuildDisapprove);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][1]
      ).to.equal(context);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][2]
      ).to.eql({
        action: 'disapprove',
        userInfo: context._authInfo,
        actionDetails: "Disapproved new build ffffffff-9bd6-4628-a6f0-e4004e362ea0 for engine 23cde077-9575-4b46-b011-d55e41cb4545",
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        statusCode: 200
      });
    });
  });

  describe('when accessing invalidateEngineBuild', function () {
    let args, context;

    beforeEach(() => {
      args = {
        input: {
          buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
          engineId: '23cde077-9575-4b46-b011-d55e41cb4545'
        }
      };
      context = mockUtil.makeContext();
      serviceContext.coreJob.cjdal.build.updateBuildState.mockReset();
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mockReset();
    });

    it('should return 503 on update build state error', async function () {
      let res, err;

      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('invalid');
          return callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal.newInvalidateEngineBuild(args, context);
      } catch (error) {
        expect(error.message).toEqual('some error');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildInvalidate,
        expect.any(Object),
        expect.objectContaining({
          action: 'invalidate',
          statusCode: 500
        }),
        expect.any(Object)
      );
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
    });

    it('should return 200 with build', async function () {
      let res, err;

      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('invalid');
          return callback(null, {
            engineId: args.input.engineId,
            buildId: args.input.buildId,
            buildState: 'invalid'
          });
        }
      );

      try {
        res = await dal.newInvalidateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildInvalidate,
        expect.any(Object),
        expect.objectContaining({
          action: 'invalidate',
          statusCode: 204
        }),
        undefined
      );
      expect(res).toEqual({
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        buildState: 'invalid'
      });
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock.calls
          .length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][0]
      ).to.equal(eventsMap.EngineBuildInvalidate);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][1]
      ).to.equal(context);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][2]
      ).to.eql({
        action: 'invalidate',
        tokenInfo: context._authInfo,
        actionDetails: "Invalidated build undefined for engine 23cde077-9575-4b46-b011-d55e41cb4545",
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        statusCode: 204
      });
    });
  });

  describe('when accessing submitEngineBuild', function () {
    let args, context;

    beforeEach(() => {
      args = {
        input: {
          buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
          engineId: '23cde077-9575-4b46-b011-d55e41cb4545'
        }
      };
      context = mockUtil.makeContext();
      _.set(
        context,
        '_authInfo.organization.kvp.engineApprovalWhiteListed',
        false
      );
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockReset();
      serviceContext.coreJob.cjdal.build.updateBuildState.mockReset();
      serviceContext.coreJob.cjdal.build.updateBuildState.mockReset();
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mockReset();
    });

    it('should return 503 on update build state error', async function () {
      let res, err;

      // loadCheckEngine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: args.input.engineId,
            engineState: 'active'
          });
        }
      );
      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('pending');
          return callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal.newSubmitEngineBuild(args, context);
      } catch (error) {
        expect(error.message).toEqual(
          'The server experienced an internal error'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildSubmit,
        expect.any(Object),
        expect.objectContaining({ action: 'submit', statusCode: 500 }),
        expect.any(Object)
      );
      expect(err.name).toEqual('internal_error');
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
    });

    it('should return 200 with build', async function () {
      let res, err;

      // loadCheckEngine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: args.input.engineId,
            engineState: 'active'
          });
        }
      );
      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementationOnce(
        (buildId, buildState, dbClient, callback) => {
          expect(buildState).toEqual('pending');
          return callback(null, {
            engineId: args.input.engineId,
            buildId: args.input.buildId,
            buildState: 'pending'
          });
        }
      );

      // getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: args.input.engineId,
          is_public: true
        }
      ]);

      try {
        res = await dal.newSubmitEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildSubmit,
        expect.any(Object),
        expect.objectContaining({ action: 'submit', statusCode: 200 }),
        undefined
      );
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual({
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        buildState: 'pending'
      });
      chaiExpet(
        serviceContext.coreJob.cjdal.engine.getEngine.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.cjdal.build.updateBuildState.mock.calls.length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock.calls
          .length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][0]
      ).to.equal(eventsMap.EngineBuildSubmit);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][1]
      ).to.equal(context);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][2]
      ).to.eql({
        action: 'submit',
        userInfo: context._authInfo,
        actionDetails: "Submitted new build ffffffff-9bd6-4628-a6f0-e4004e362ea0 for engine 23cde077-9575-4b46-b011-d55e41cb4545",
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        statusCode: 200
      });
    });
  });

  describe('when accessing uploadEngineBuild', function () {
    let args, context;

    beforeEach(() => {
      args = {
        input: {
          buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
          engineId: 'engine-id',
          dockerImage: '123'
        }
      };
      context = mockUtil.makeContext();
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockReset();
      serviceContext.coreJob.jobBll.s3.getEngineBuildReport.mockReset();
      serviceContext.coreJob.jobBll.s3.getEngineBuildManifest.mockReset();
      serviceContext.coreJob.cjdal.buildCapability.addBuildCapabilities.mockReset();
      serviceContext.coreJob.cjdal.build.updateEngineBuild.mockReset();
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mockReset();

      // loadCheckEngine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            edgeVersion: 3,
            deploymentModel: 1,
            engineManifest: { foo: 'bar' }
          });
        }
      );
    });

    it('should return 400 on invalid docker image ref', async function () {
      let res, err;

      args.input.dockerImage = null;

      //loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            buildId: args.input.buildId,
            buildState: 'fetching'
          });
        }
      );

      try {
        res = await dal.newUploadEngineBuild(args, context);
      } catch (error) {
        expect(
          serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
        ).toHaveBeenCalledWith(
          eventsMap.EngineBuildUpload,
          expect.any(Object),
          expect.objectContaining({
            action: 'upload',
            statusCode: 500
          }),
          expect.any(Object)
        );
        expect(error.message).toEqual('bad request');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(err.data).toEqual({
        dockerImage: { message: 'should be a String' }
      });
    });

    it('should return 503 on update engine build error', async function () {
      let res, err;

      // loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            buildId: args.input.buildId,
            buildState: 'fetching'
          });
        }
      );
      // getEngineBuildReport
      serviceContext.coreJob.jobBll.s3.getEngineBuildReport.mockImplementationOnce(
        (engineId, buildId, callback) => {
          return callback(null, {});
        }
      );
      //getEngineBuildManifest
      serviceContext.coreJob.jobBll.s3.getEngineBuildManifest.mockImplementationOnce(
        (engineId, buildId, callback) => {
          return callback(null, {});
        }
      );
      // updateEngineBuild
      serviceContext.coreJob.cjdal.build.updateEngineBuild.mockImplementationOnce(
        (build, dbClient, callback) => {
          expect(build.dockerImage).toEqual('123');
          return callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal.newUploadEngineBuild(args, context);
      } catch (error) {
        expect(error.message).toEqual('some error');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildUpload,
        expect.any(Object),
        expect.objectContaining({
          action: 'upload',
          statusCode: 500
        }),
        expect.any(Object)
      );
    });

    it('should return 204 if successful (default if invalid build report values)', async function () {
      let res, err;

      // loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            buildId: args.input.buildId,
            buildState: 'fetching'
          });
        }
      );
      // getEngineBuildReport
      serviceContext.coreJob.jobBll.s3.getEngineBuildReport.mockImplementationOnce(
        (engineId, buildId, callback) => {
          return callback(null, {});
        }
      );
      //getEngineBuildManifest
      serviceContext.coreJob.jobBll.s3.getEngineBuildManifest.mockImplementationOnce(
        (engineId, buildId, callback) => {
          return callback(null, {
            engineId: '123',
            category: 'transcription'
          });
        }
      );
      // updateEngineBuild
      serviceContext.coreJob.cjdal.build.updateEngineBuild.mockImplementationOnce(
        (build, dbClient, callback) => {
          expect(build.dockerImage).toEqual('123');
          expect(build.buildState).toEqual('approved');
          expect(build.buildSize).toEqual(undefined);
          expect(build.vulLowCount).toEqual(undefined);
          expect(build.vulMediumCount).toEqual(undefined);
          expect(build.vulHighCount).toEqual(undefined);
          expect(build.vulCriticalCount).toEqual(undefined);

          return callback(null, {
            engineId: 'engine-id',
            buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0'
          });
        }
      );
      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: args.input.engineId
          });
        }
      );

      try {
        res = await dal.newUploadEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildUpload,
        expect.any(Object),
        expect.objectContaining({
          action: 'upload',
          statusCode: 200
        }),
        undefined
      );
      expect(res).toEqual({
        engineId: 'engine-id',
        buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0'
      });
    });

    it('should return 204 if successful with valid manifest', async function () {
      let res, err;

      // loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            buildId: args.input.buildId,
            buildState: 'fetching'
          });
        }
      );
      // getEngineBuildReport
      serviceContext.coreJob.jobBll.s3.getEngineBuildReport.mockImplementationOnce(
        (engineId, buildId, callback) => {
          return callback(null, {
            vulnerabilityCounts: {
              Low: 0,
              Medium: 2,
              High: 100,
              Critical: 1000
            },
            inspect: {
              Size: 512
            }
          });
        }
      );
      //getEngineBuildManifest
      serviceContext.coreJob.jobBll.s3.getEngineBuildManifest.mockImplementationOnce(
        (engineId, buildId, callback) => {
          return callback(null, {
            engineId: '123',
            category: 'transcription',
            supportedLanguages: ['en', 'fr']
          });
        }
      );
      // addBuildCapabilities
      serviceContext.coreJob.cjdal.buildCapability.addBuildCapabilities.mockImplementationOnce(
        (build, capabilities, dbClient, callback) => {
          expect(capabilities).toEqual([
            { key: 'language', value: 'en' },
            { key: 'language', value: 'fr' }
          ]);
          callback(null, { totalResults: 2 });
        }
      );
      // updateEngineBuild
      serviceContext.coreJob.cjdal.build.updateEngineBuild.mockImplementationOnce(
        (build, dbClient, callback) => {
          expect(build.dockerImage).toEqual('123');
          expect(build.buildState).toEqual('approved');
          expect(build.buildSize).toEqual(512);
          expect(build.vulLowCount).toEqual(0);
          expect(build.vulMediumCount).toEqual(2);
          expect(build.vulHighCount).toEqual(100);
          expect(build.vulCriticalCount).toEqual(1000);

          return callback(null, {
            engineId: 'engine-id',
            buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0'
          });
        }
      );
      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: args.input.engineId
          });
        }
      );

      try {
        res = await dal.newUploadEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual({
        engineId: 'engine-id',
        buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0'
      });
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock.calls
          .length
      ).to.equal(1);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][0]
      ).to.equal(eventsMap.EngineBuildUpload);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][1]
      ).to.equal(context);
      chaiExpet(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mock
          .calls[0][2]
      ).to.eql({
        action: 'upload',
        userInfo: context._authInfo,
        actionDetails: "Uploaded new build ffffffff-9bd6-4628-a6f0-e4004e362ea0 for engine engine-id",
        engineId: args.input.engineId,
        buildId: args.input.buildId,
        statusCode: 200,
        dockerImage: '123'
      });
    });
  });

  describe('when accessing newUpdateEngineBuildForNodeRed', function () {
    let args, context;

    beforeEach(() => {
      args = {
        input: {
          buildId: 'ffffffff-9bd6-4628-a6f0-e4004e362ea0',
          engineId: 'engine-id',
          dockerImage: '123',
          taskRuntime: {}
        }
      };
      context = mockUtil.makeContext();
      serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockReset();
      serviceContext.coreJob.jobBll.s3.getEngineBuildReport.mockReset();
      serviceContext.coreJob.jobBll.s3.getEngineBuildManifest.mockReset();
      serviceContext.coreJob.cjdal.buildCapability.addBuildCapabilities.mockReset();
      serviceContext.coreJob.cjdal.build.updateEngineBuild.mockReset();
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent.mockReset();

      // loadCheckEngine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            edgeVersion: 3,
            deploymentModel: 1,
            engineManifest: { foo: 'bar' }
          });
        }
      );
    });

    it('should update a build and emit respective audit event', async function () {
      let res, err;
      // loadCheckBuild
      serviceContext.coreJob.cjdal.build.updateEngineBuildForNodeRed.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: engineId,
            buildId: args.input.buildId,
            buildState: 'available'
          });
        }
      );
      try {
        res = await dal.newUpdateEngineBuildForNodeRed(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildUpdate,
        expect.any(Object),
        expect.objectContaining({
          action: 'update',
          statusCode: 204
        }),
        null
      );
    });

    it('should emit failure audit event if the build update fails', async function () {
      let res, err;
      // loadCheckBuild
      serviceContext.coreJob.cjdal.build.updateEngineBuildForNodeRed.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(new Error('some error'), null);
        }
      );
      try {
        res = await dal.newUpdateEngineBuildForNodeRed(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildUpdate,
        expect.any(Object),
        expect.objectContaining({
          action: 'update',
          statusCode: 500
        }),
        expect.any(Object)
      );
    });
  });

  describe('when accessing cancelJob', function () {
    let jobId, context;

    beforeEach(() => {
      jobId = 'job-123';
      context = mockUtil.makeContext();
      serviceContext.coreJob.jobBll.job.cancelJob.mockReset();
    });

    it('should throw unauthenicate error on cancel job if token is invalid or missing', async function () {
      let res, err;

      try {
        res = await dal.newCancelJob(jobId, {});
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('authentication_error');
    });

    it('should throw internal error on bll cancelJob with error', async function () {
      let res, err;

      // bll.cancelJob
      serviceContext.coreJob.jobBll.job.cancelJob.mockImplementationOnce(
        (jobId, applicationId, dbClient, callback) => {
          return callback(new Error('some error'), null);
        }
      );

      try {
        res = await dal.newCancelJob(jobId, context);
      } catch (error) {
        expect(error.message).toEqual(
          'The server experienced an internal error'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
      chaiExpet(
        serviceContext.coreJob.jobBll.job.cancelJob.mock.calls.length
      ).to.equal(1);
    });

    it('should throw not_allow error on get job app id not matching token app it', async function () {
      let res, err;

      // bll.cancelJob
      serviceContext.coreJob.jobBll.job.cancelJob.mockImplementationOnce(
        (jobId, applicationId, dbClient, callback) => {
          return callback({ statusCode: 403, message: 'not allowed' }, null);
        }
      );

      try {
        res = await dal.newCancelJob(jobId, context);
      } catch (error) {
        expect(error.message).toEqual('not allowed');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
      chaiExpet(
        serviceContext.coreJob.jobBll.job.cancelJob.mock.calls.length
      ).to.equal(1);
    });

    it('should throw not_found on job not found from cancel job', async function () {
      let res, err;

      // bll.cancelJob
      serviceContext.coreJob.jobBll.job.cancelJob.mockImplementationOnce(
        (jobId, applicationId, dbClient, callback) => {
          return callback({ statusCode: 404, message: 'not found' }, null);
        }
      );

      try {
        res = await dal.newCancelJob(jobId, context);
      } catch (error) {
        expect(error.message).toEqual('not found');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      chaiExpet(
        serviceContext.coreJob.jobBll.job.cancelJob.mock.calls.length
      ).to.equal(1);
    });

    it('should cancel job successfully', async function () {
      let res, err;

      // bll.cancelJob
      serviceContext.coreJob.jobBll.job.cancelJob.mockImplementationOnce(
        (jobId, applicationId, dbClient, callback) => {
          return callback(null, {
            organizationId: 'org-id',
            applicationId: 'app-id'
          });
        }
      );

      try {
        res = await dal.newCancelJob(jobId, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual(jobId);
      chaiExpet(
        serviceContext.coreJob.jobBll.job.cancelJob.mock.calls.length
      ).to.equal(1);
    });
  });
});
