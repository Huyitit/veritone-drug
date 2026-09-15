'use strict';

const _ = require('lodash');
const util = require('../../../test/mockUtil')();

describe('build cache', () => {
  let testContext = {};

  util.mockCommon(testContext);
  beforeAll(() => {
    testContext.mod = require('./build');
  });
  beforeEach(() => {
    testContext.dalSpy = {};
    testContext.app.config.taskTypeCacheRefreshIntervalMs = 999999;
    testContext.app.redisClient.multi = jest.fn().mockImplementation(() => {
      return {
        set: jest.fn(),
        get: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockImplementation((cb) => {
          return cb(null, null);
        }),
        del: jest.fn()
      };
    });
    testContext.app.redisClient.keys = jest
      .fn()
      .mockImplementation((key, cb) => {
        return cb(null, ['rows']);
      });
    testContext.app.redisCache.get = jest
      .fn()
      .mockImplementation((type, key) => {
        return Promise.resolve();
      });
    testContext.app.redisCache.asyncSet = jest
      .fn()
      .mockImplementation(
        (type, key, value, keyOverride = null, ttlMin = null) => {
          return Promise.resolve();
        }
      );
    testContext.dalSpy = {
      getEngineBuilds: jest.fn(),
      getAllActiveEngineBuilds: jest.fn(),
      getBuild: jest.fn(),
      getActiveEngineBuild: jest.fn(),
      dirtyBuildCache: jest.fn(),
      getBuildCacheRedisKey: jest.fn()
    };
    testContext.dalSpiesIndex = {
      build: testContext.dalSpy
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    expect(
      testContext.mod.bind(
        null,
        { config: { taskTypeCacheRefreshIntervalMs: 1 } },
        null
      )
    ).toThrowError(/missing app\.logger/);
  });

  it('should require a dal object', () => {
    expect(testContext.mod.bind(null, testContext.app, null)).toThrowError(
      /missing dal/
    );
  });

  describe('when accessing get active build', () => {
    testContext.router = testContext.mod;
    beforeEach(() => {
      testContext.router = require('./build')(
        testContext.app,
        testContext.dalSpiesIndex
      );
    });
    afterEach(() => {
      testContext.router = null;
    });

    it('should get build, lazy load cache, get from db then cache', async () => {
      testContext.dalSpy.getActiveEngineBuild = jest
        .fn()
        .mockImplementation(function getActiveEngineBuild(
          engineId,
          dbClient,
          callback
        ) {
          callback(null, {
            buildId: 'build-123'
          });
        });
      const build = await testContext.router.getActiveBuildForEngine(
        'engine-123'
      );
      expect(build.buildId).toBe('build-123');
      expect(testContext.dalSpy.getActiveEngineBuild).toHaveBeenCalledTimes(1);
    });

    it('should get build from cache, from previous cached', async () => {
      testContext.dalSpy.getActiveEngineBuild = jest
        .fn()
        .mockImplementation(function getActiveEngineBuild(
          engineId,
          dbClient,
          callback
        ) {
          callback(null, {
            buildId: 'build-123'
          });
        });

      let build = await testContext.router.getActiveBuildForEngine(
        'engine-123'
      );
      expect(build.buildId).toBe('build-123');

      build = await testContext.router.getActiveBuildForEngine('engine-123');

      expect(build.buildId).toBe('build-123');
      expect(testContext.dalSpy.getActiveEngineBuild).toHaveBeenCalledTimes(2);
    });
  });
});
