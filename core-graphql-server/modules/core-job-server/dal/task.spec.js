'use strict';

const util = require('../../../test/mockUtil')();

describe('dal task', () => {
  let testContext = {};

  util.mockCommon(testContext);

  beforeEach(() => {
    const mockShared = {
      getTaskTablePartition: jest.fn().mockReturnValue('task_table')
    };
    testContext.model.Task.fromDB = jest.fn();
    testContext.mod = require('./task')(
      testContext.app,
      testContext.model,
      { core: testContext.coreConn },
      mockShared
    );
    testContext.model.Recording.fromDB = jest.fn();
    testContext.model.Asset.fromDB = jest.fn();
  });

  it('should be a configurable package', () => {
    expect(require('./task')).toEqual(expect.any(Function));
  });

  it('should export an object containing group functions', () => {
    expect(
      require('./task')(
        testContext.app,
        testContext.model,
        {
          core: testContext.pg
        },
        {
          getTaskTablePartition: jest.fn().mockReturnValue('task_table')
        }
      )
    ).toEqual({
      getEngineUsageForOrganization: expect.any(Function),
      cleanTask: expect.any(Function),
      cancelTask: expect.any(Function)
    });
  });

  describe('when calling getEngineUsageForOrganization', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.getEngineUsageForOrganization.bind(null, {}, null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.getEngineUsageForOrganization(
        {},
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual({
            totalDuration: 0,
            totalCost: 0,
            usage: []
          });
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      const mockUsage = [
        { engine_id: 'engine-1', total_cost: 200, total_duration: 10 },
        { engine_id: 'engine-1', total_cost: 200, total_duration: 10 },
        { engine_id: 'engine-2', total_cost: 200, total_duration: 10 },
        { engine_id: 'engine-3', total_cost: 500, total_duration: 20 }
      ];

      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve(mockUsage));

      await testContext.mod.getEngineUsageForOrganization(
        {},
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result.totalCost).toEqual(11);
          expect(result.totalDuration).toEqual(50);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });
  });

  describe('when calling cancelTask', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.cancelTask.bind(null, 'task-i123', null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.cancelTask(
        'task-i123',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      const mockTask = {
        engineId: '683de78d-9c09-4246-8704-45ead6835167',
        taskId: '683de78d-9c09-4246-8704-45ead6835167'
      };

      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockTask]));

      testContext.model.Task.fromDB.mockReturnValue(mockTask);

      await testContext.mod.cancelTask(
        'task-i123',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockTask);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Task.fromDB).toHaveBeenCalled();
    });
  });
});
