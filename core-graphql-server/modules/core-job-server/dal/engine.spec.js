'use strict';

// const _ = require('lodash');
const util = require('../../../test/mockUtil')();

describe('dal engine', () => {
  let testContext = {};

  util.mockCommon(testContext);

  beforeEach(() => {
    const engine = require('./engine');
    testContext.mod = engine(testContext.app, testContext.model, {
      core: testContext.coreConn
    });
  });

  it('should be a configurable package', () => {
    expect(require('./engine')).toEqual(expect.any(Function));
  });

  it('should export an object containing engine functions', () => {
    expect(
      require('./engine')(testContext.app, testContext.model, {
        core: testContext.pg
      })
    ).toEqual({
      getEngine: expect.any(Function),
      updateEngine: expect.any(Function),
      dirtyEngineBuildCache: expect.any(Function),
      updateEngineState: expect.any(Function),
      deleteEngine: expect.any(Function)
    });
  });

  describe('when calling getEngine', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.getEngine.bind(
        null,
        { engineId: 'engine-abc' },
        null
      );
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.getEngine(
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
      const mockEngine = {
        engineId: 'some-engine',
        ownerOrganizationId: 123,
        isPublic: true,
        engineCategoryId: '00000000-0000-0000-0000-000000000000'
      };

      testContext.coreConn.query = jest.fn().mockImplementation((sql) => {
        expect(sql).toMatch(/price_dimension/);
        return Promise.resolve([mockEngine]);
      });

      jest
        .spyOn(testContext.model.Engine, 'fromDB')
        .mockReturnValue(mockEngine);

      await testContext.mod.getEngine(
        'engine-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockEngine);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Engine.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling updateEngine', () => {
    let mockUpdateEngine;
    let mockResultEngine;

    beforeEach(() => {
      mockUpdateEngine = {
        isPublic: true,
        engineCategoryId: '00000000-0000-0000-0000-000000000000',
        priceDimension: 'PRICE_PER_TASK'
      };

      mockResultEngine = mockUpdateEngine;
      mockResultEngine.engineId = 'some-engine-id';
    });

    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.updateEngine.bind(
        null,
        { engineId: 'engine-abc' },
        null
      );
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.updateEngine(
        mockUpdateEngine,
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest.fn().mockImplementation((sql) => {
        expect(sql).toMatch(/price_dimension/);

        return Promise.resolve([mockResultEngine]);
      });

      jest
        .spyOn(testContext.model.Engine, 'fromDB')
        .mockReturnValue(mockResultEngine);

      await testContext.mod.updateEngine(
        mockUpdateEngine,
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockResultEngine);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Engine.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling updateEngineState', () => {
    let mockResultEngine;

    beforeEach(() => {
      mockResultEngine = {
        engineId: 'some-engine-id',
        isPublic: true,
        engineCategoryId: '00000000-0000-0000-0000-000000000000'
      };
    });

    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.updateEngineState.bind(
        null,
        'engine-abc',
        'disabled',
        null
      );
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.updateEngineState(
        'engine-abc',
        'disabled',
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
        .mockImplementation(() => Promise.resolve([mockResultEngine]));

      jest
        .spyOn(testContext.model.Engine, 'fromDB')
        .mockReturnValue(mockResultEngine);

      await testContext.mod.updateEngineState(
        'engine-abc',
        'disabled',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockResultEngine);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Engine.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling deleteEngine', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.deleteEngine.bind(
        null,
        { engineId: 'engine-abc' },
        null
      );
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.deleteEngine(
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
      const mockEngine = {
        engineId: 'some-engine',
        ownerOrganizationId: 123,
        isPublic: true,
        engineCategoryId: '00000000-0000-0000-0000-000000000000'
      };

      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockEngine]));

      jest
        .spyOn(testContext.model.Engine, 'fromDB')
        .mockReturnValue(mockEngine);

      await testContext.mod.deleteEngine(
        'engine-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockEngine);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Engine.fromDB).toHaveBeenCalled();
    });
  });
});
