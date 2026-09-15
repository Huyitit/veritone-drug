'use strict';

const _ = require('lodash');
const util = require('../../../test/mockUtil')();

describe('core-job-server/engine-runtime/engine.runtime', () => {
  let testContext = {};

  util.mockCommon(testContext);

  var engineRuntime, aiwareRuntimeMock, task;

  beforeEach(() => {
    testContext.app.config.jwt = {
      secret: 'shhhhhh...',
      ttl: '7d'
    };
    testContext.dalSpy = {
      getActiveBuildForEngine: jest.fn()
    };
    testContext.dalSpiesIndex = {
      cluster: testContext.dalSpy,
      build: testContext.dalSpy
    };
    testContext.buildCache = util.createSpyObj('buildCache', [
      'getActiveBuildForEngine'
    ]);
    aiwareRuntimeMock = util.createSpyObj('aiwareRuntimeMock', [
      'queueTask',
      'cancelTask'
    ]);
    task = {
      engineId: 'engineId'
    };

    testContext.mod = require('./engine.runtime');
    engineRuntime = testContext.mod(
      testContext.app,
      testContext.dalSpiesIndex,
      testContext.buildCache,
      aiwareRuntimeMock
    );
  });

  it('should require an app', () => {
    expect(testContext.mod.bind(null, null)).toThrowError(/missing app/);
  });

  it('should require an app config', () => {
    expect(testContext.mod.bind(null, {}, null)).toThrowError(
      /missing app\.config/
    );
  });

  it('should require an app logger', () => {
    expect(testContext.mod.bind(null, { config: {} }, null)).toThrowError(
      /missing app\.logger/
    );
  });

  it('should require a dal object', () => {
    expect(testContext.mod.bind(null, testContext.app, null)).toThrowError(
      /missing dal/
    );
  });

  it('should require build cache object', () => {
    expect(
      testContext.mod.bind(null, testContext.app, testContext.dalSpiesIndex)
    ).toThrowError(/missing build cache/);
  });

  describe('cancelTask', () => {
    let mockAiwareBuild;

    beforeEach(() => {
      testContext.mockTask = {
        engineId: 'engine-id'
      };
      mockAiwareBuild = {
        engineId: 'engine-id',
        buildId: 'build-id',
        taskRuntime: { aiware: { cluster: 'cluster', priority: 0 } }
      };
      testContext.buildCache.getActiveBuildForEngine = jest
        .fn()
        .mockImplementation(function getActiveBuildForEngine(engineId) {
          return mockAiwareBuild;
        });
    });

    it('should throw an error for missing task', () => {
      expect(function () {
        engineRuntime.cancelTask();
      }).toThrow(new Error('Missing task!'));
    });

    it('should throw an error for missing callback', () => {
      expect(function () {
        engineRuntime.cancelTask({});
      }).toThrow(new Error('Missing callback!'));
    });

    it('should return an error if the engine build is not found', () => {
      mockAiwareBuild = null;
      engineRuntime.cancelTask(testContext.mockTask, function callback(err) {
        expect(aiwareRuntimeMock.cancelTask).not.toHaveBeenCalled();
        expect(err.message).toContain('Could not find cached deployed build');
      });
    });

    it('should return an error if the engine build has no runtime', () => {
      mockAiwareBuild = {};

      engineRuntime.cancelTask(testContext.mockTask, function callback(err) {
        expect(aiwareRuntimeMock.cancelTask).not.toHaveBeenCalled();
        expect(err.message).toContain('Could not find build runtime');
      });
    });

    it('should return an error if the engine build does not have a valid runtime', () => {
      mockAiwareBuild = {
        taskRuntime: {}
      };

      engineRuntime.cancelTask(testContext.mockTask, function callback(err) {
        expect(aiwareRuntimeMock.cancelTask).not.toHaveBeenCalled();
        expect(err.message).toContain('Could not select build runtime');
      });
    });
  });

  describe('selectRuntime', () => {
    it('should select appropriate runtime given taskRuntime', () => {
      var testCases = {
        'null taskRuntime': {
          intput: null,
          output: null
        },
        'empty runtime': {
          input: {},
          output: { options: undefined, runtime: undefined }
        }
      };

      Object.keys(testCases).forEach(function eachKey(key) {
        var testCase = testCases[key];
        const runtime = engineRuntime._selectRuntime(testCase.input);
        expect(runtime).toEqual(testCase.output);
      });
    });
  });
});
