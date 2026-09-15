'use strict';

const util = require('../../../test/mockUtil')();

describe('dal build', () => {
  let testContext = {};

  util.mockCommon(testContext);

  beforeEach(() => {
    testContext.app.config.manifest = {
      clusterSizesToIds: {
        small: 'small-cluster',
        medium: 'medium-cluster',
        large: 'large-cluster'
      }
    };
    testContext.mod = require('./build')(testContext.app, testContext.model, {
      core: testContext.coreConn
    });
  });

  it('should be a configurable package', () => {
    expect(require('./build')).toEqual(expect.any(Function));
  });

  it('should export an object containing build functions', () => {
    expect(
      require('./build')(testContext.app, testContext.model, {
        core: testContext.pg
      })
    ).toEqual({
      getEngineBuilds: expect.any(Function),
      getEngineBuild: expect.any(Function),
      updateEngineBuild: expect.any(Function),
      getActiveEngineBuild: expect.any(Function),
      getAllActiveEngineBuilds: expect.any(Function),
      createEngineBuild: expect.any(Function),
      updateBuildState: expect.any(Function),
      pauseDeployedBuildsForEngine: expect.any(Function),
      deleteEngineBuild: expect.any(Function),
      dirtyBuildCache: expect.any(Function),
      getBuildCacheRedisKey: expect.any(Function),
      updateEngineBuildForNodeRed: expect.any(Function)
    });
  });

  describe('when calling getEngineBuilds', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.getEngineBuilds.bind(null, {}, null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.getEngineBuilds(
        {},
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(
            expect.objectContaining({
              totalResults: expect.any(Number),
              from: expect.any(Number),
              to: expect.any(Number),
              results: expect.any(Array)
            })
          );
          expect(result.results.length).toBe(0);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest.fn().mockImplementation(() =>
        Promise.resolve([
          {
            engineId: '683de78d-9c09-4246-8704-45ead6835167',
            buildId: '683de78d-9c09-4246-8704-45ead6835167'
          }
        ])
      );

      jest.spyOn(testContext.model.Build, 'fromDB').mockReturnValue({
        engineId: '683de78d-9c09-4246-8704-45ead6835167',
        buildId: '683de78d-9c09-4246-8704-45ead6835167'
      });

      await testContext.mod.getEngineBuilds(
        {
          engineId: '683de78d-9c09-4246-8704-45ead6835167',
          buildStates: ['deployed'],
          offset: 0,
          limit: 999
        },
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(
            expect.objectContaining({
              totalResults: expect.any(Number),
              from: expect.any(Number),
              to: expect.any(Number),
              results: expect.any(Array)
            })
          );
          expect(result.results.length).toBe(1);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).toHaveBeenCalled();
    });

    it('should execute callback with db results when sorting by column', async () => {
      testContext.coreConn.query = jest.fn().mockImplementation(() =>
        Promise.resolve([
          {
            engineId: '683de78d-9c09-4246-8704-45ead6835167',
            buildId: '683de78d-9c09-4246-8704-45ead6835167'
          }
        ])
      );

      jest.spyOn(testContext.model.Build, 'fromDB').mockReturnValue({
        engineId: '683de78d-9c09-4246-8704-45ead6835167',
        buildId: '683de78d-9c09-4246-8704-45ead6835167'
      });

      await testContext.mod.getEngineBuilds(
        {
          engineId: '683de78d-9c09-4246-8704-45ead6835167',
          sortColumn: 'build_id',
          sortOrder: 'asc',
          offset: 0,
          limit: 25
        },
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(
            expect.objectContaining({
              totalResults: expect.any(Number),
              from: expect.any(Number),
              to: expect.any(Number),
              results: expect.any(Array)
            })
          );
          expect(result.results.length).toBe(1);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).toHaveBeenCalled();
    });

    it('should set default taskRuntime if empty', async () => {
      testContext.coreConn.query = jest.fn().mockImplementation(() =>
        Promise.resolve([
          {
            engineId: '683de78d-9c09-4246-8704-45ead6835167',
            buildId: '683de78d-9c09-4246-8704-45ead6835167',
            taskRuntime: null
          }
        ])
      );

      jest
        .spyOn(testContext.model.Build, 'fromDB')
        .mockImplementation((row) => row);

      await testContext.mod.getEngineBuilds(
        {},
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(
            expect.objectContaining({
              totalResults: expect.any(Number),
              from: expect.any(Number),
              to: expect.any(Number),
              results: expect.any(Array)
            })
          );
          expect(result.results.length).toBe(1);
          expect(result.results[0].taskRuntime).toEqual({ edge: {} });
        }
      );

      expect(testContext.coreConn.query).toHaveBeenCalled();
    });
  });

  describe('when calling getEngineBuild', () => {
    let mockBuild = {};

    beforeEach(() => {
      mockBuild = {
        engineId: '23cde077-9575-4b46-b011-d55e41cb4545',
        buildId: '3f5c2c1b-fda2-4901-b7fe-d2fcae4b30f6',
        price: 1,
        validateUri: 'www.validate-uri.com',
        executeUri: 'www.execute-uri.com'
      };
    });

    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.getEngineBuild.bind(
        null,
        '683de78d-9c09-4246-8704-45ead6835167',
        '683de78d-9c09-4246-8704-45ead6835167',
        null
      );
    });

    it('should execute callback with no error on no results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));
      await testContext.mod.getEngineBuild(
        '683de78d-9c09-4246-8704-45ead6835167',
        '683de78d-9c09-4246-8704-45ead6835167',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockBuild]));

      jest.spyOn(testContext.model.Build, 'fromDB').mockReturnValue(mockBuild);

      await testContext.mod.getEngineBuild(
        '683de78d-9c09-4246-8704-45ead6835167',
        '683de78d-9c09-4246-8704-45ead6835167',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockBuild);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).toHaveBeenCalled();
    });
    it('should set default taskRuntime if empty', async () => {
      const mockBuildWithNullTaskRuntime = {
        ...mockBuild,
        taskRuntime: null
      };

      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve([mockBuildWithNullTaskRuntime])
        );

      jest
        .spyOn(testContext.model.Build, 'fromDB')
        .mockImplementation((row) => row);

      await testContext.mod.getEngineBuild(
        '683de78d-9c09-4246-8704-45ead6835167',
        '683de78d-9c09-4246-8704-45ead6835167',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(expect.objectContaining(mockBuild));
          expect(result.taskRuntime).toEqual({ edge: {} });
        }
      );

      expect(testContext.coreConn.query).toHaveBeenCalled();
    });
  });

  describe('when calling getActiveEngineBuild', () => {
    let mockBuild = {};

    beforeEach(() => {
      mockBuild = {
        engineId: '23cde077-9575-4b46-b011-d55e41cb4545',
        buildId: '3f5c2c1b-fda2-4901-b7fe-d2fcae4b30f6',
        price: 1,
        validateUri: 'www.validate-uri.com',
        executeUri: 'www.execute-uri.com',
        buildState: 'active'
      };
    });

    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.getActiveEngineBuild.bind(
        null,
        '23cde077-9575-4b46-b011-d55e41cb4545',
        null
      );
    });

    it('should execute callback with no error on no results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.getActiveEngineBuild(
        '23cde077-9575-4b46-b011-d55e41cb4545',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockBuild]));

      jest.spyOn(testContext.model.Build, 'fromDB').mockReturnValue(mockBuild);

      await testContext.mod.getActiveEngineBuild(
        '23cde077-9575-4b46-b011-d55e41cb4545',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockBuild);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).toHaveBeenCalled();
    });

    it('should execute callback with error results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockBuild]));

      jest.spyOn(testContext.model.Build, 'fromDB').mockReturnValue(mockBuild);

      await testContext.mod.getActiveEngineBuild(
        '23cde077-9575-4b46-b011-d55e41cb4545',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockBuild);
        }
      );

      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).toHaveBeenCalled();
    });

    it('should execute callback with error results if more than one active build', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockBuild, mockBuild]));

      jest.spyOn(testContext.model.Build, 'fromDB').mockReturnValue(mockBuild);

      await testContext.mod.getActiveEngineBuild(
        '23cde077-9575-4b46-b011-d55e41cb4545',
        null,
        function callback(err, result) {
          expect(err).toEqual(expect.any(Error));
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).not.toHaveBeenCalled();
    });
  });

  describe('when calling getAllActiveEngineBuilds', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.getAllActiveEngineBuilds.bind(null, null, null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.getAllActiveEngineBuilds(
        null,
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(
            expect.objectContaining({
              totalResults: expect.any(Number),
              results: expect.any(Array)
            })
          );
          expect(result.results.length).toBe(0);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest.fn().mockImplementation(() =>
        Promise.resolve([
          {
            engineId: '683de78d-9c09-4246-8704-45ead6835167',
            buildId: '683de78d-9c09-4246-8704-45ead6835167'
          }
        ])
      );

      jest.spyOn(testContext.model.Build, 'fromDB').mockReturnValue({
        engineId: '683de78d-9c09-4246-8704-45ead6835167',
        buildId: '683de78d-9c09-4246-8704-45ead6835167'
      });

      await testContext.mod.getAllActiveEngineBuilds(
        null,
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(
            expect.objectContaining({
              totalResults: expect.any(Number),
              results: expect.any(Array)
            })
          );
          expect(result.results.length).toBe(1);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling createEngineBuild', () => {
    let mockCreateBuild;
    let mockResultBuild;

    beforeEach(() => {
      mockCreateBuild = {
        engineId: '00000000-0000-0000-0000-000000000000'
      };

      mockResultBuild = mockCreateBuild;
      mockResultBuild.buildId = 'some-build-id';
    });

    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.createEngineBuild.bind(
        null,
        mockCreateBuild,
        null
      );
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.createEngineBuild(
        mockCreateBuild,
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockResultBuild]));

      jest
        .spyOn(testContext.model.Build, 'fromDB')
        .mockReturnValue(mockResultBuild);

      await testContext.mod.createEngineBuild(
        mockCreateBuild,
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockResultBuild);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling updateEngineBuild', () => {
    let mockReqBuild;
    let mockResultBuild;

    beforeEach(() => {
      mockReqBuild = {
        buildId: 'build-abc',
        dockerImage: '123'
      };

      mockResultBuild = {
        buildId: 'some-build-id',
        engineId: '00000000-0000-0000-0000-000000000000'
      };
    });

    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.updateEngineBuild.bind(null, mockReqBuild, null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.updateEngineBuild(
        mockReqBuild,
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockResultBuild]));

      jest
        .spyOn(testContext.model.Build, 'fromDB')
        .mockReturnValue(mockResultBuild);

      await testContext.mod.updateEngineBuild(
        mockReqBuild,
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockResultBuild);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling updateBuildState', () => {
    let mockResultBuild;

    beforeEach(() => {
      mockResultBuild = {
        buildId: 'some-build-id',
        engineId: '00000000-0000-0000-0000-000000000000'
      };
    });

    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.updateBuildState.bind(
        null,
        'build-abc',
        'uploaded',
        null
      );
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.updateBuildState(
        'build-abc',
        'uploaded',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockResultBuild]));

      jest
        .spyOn(testContext.model.Build, 'fromDB')
        .mockReturnValue(mockResultBuild);

      await testContext.mod.updateBuildState(
        'build-abc',
        'uploaded',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockResultBuild);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling pauseDeployedBuildsForEngine', () => {
    let mockResultBuild;

    beforeEach(() => {
      mockResultBuild = {
        buildId: 'some-build-id',
        engineId: '00000000-0000-0000-0000-000000000000'
      };
    });

    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.pauseDeployedBuildsForEngine.bind(
        null,
        'engine-abc',
        null
      );
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.pauseDeployedBuildsForEngine(
        'engine-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockResultBuild]));

      jest
        .spyOn(testContext.model.Build, 'fromDB')
        .mockReturnValue(mockResultBuild);

      await testContext.mod.pauseDeployedBuildsForEngine(
        'engine-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockResultBuild);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling deleteEngineBuild', () => {
    let mockResultBuild;

    beforeEach(() => {
      mockResultBuild = {
        buildId: 'some-build-id',
        engineId: '00000000-0000-0000-0000-000000000000',
        buildState: 'deleted'
      };
    });

    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.deleteEngineBuild.bind(null, 'build-abc', null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.deleteEngineBuild(
        'build-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockResultBuild]));
      jest
        .spyOn(testContext.model.Build, 'fromDB')
        .mockReturnValue(mockResultBuild);

      await testContext.mod.deleteEngineBuild(
        'build-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockResultBuild);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Build.fromDB).toHaveBeenCalled();
    });
  });
});
