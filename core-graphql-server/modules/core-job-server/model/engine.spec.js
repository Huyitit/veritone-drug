'use strict';

const _ = require('lodash');

describe('model engine', () => {
  let testContext;

  beforeEach(() => {
    testContext = {};
  });

  const EngineModel = require('../model')().Engine;

  beforeEach(() => {
    testContext.testEngine = {
      engineId: '00000000-bbbb-0000-0000-000000000000',
      engineName: 'im an engine',
      engineDescription: 'hello'
    };
  });

  it('should be a constructor function', () => {
    expect(EngineModel).toEqual(expect.any(Function));
    const inst = new EngineModel({});
    expect(inst.constructor).toBe(EngineModel);
  });

  it('should validate task object, returning error if missing task', () => {
    const engine = new EngineModel(testContext.testEngine);
    expect(engine.validateTask).toEqual(expect.any(Function));
    expect(engine.validateTask.bind(engine, jest.fn(), jest.fn())).toThrowError(
      /Missing\stask!/
    );
  });

  it('should validate task object, returning error if missing callback', () => {
    const engine = new EngineModel(testContext.testEngine);
    expect(engine.validateTask).toEqual(expect.any(Function));
    expect(engine.validateTask.bind(engine, {}, null)).toThrowError(
      /Missing\scallback!/
    );
  });

  it('should validate task object, returning undefined if no errors', () => {
    const engine = new EngineModel(testContext.testEngine);
    expect(engine.validateTask).toEqual(expect.any(Function));

    const mockTask = {};
    const callback = jest.fn();
    engine.validateTask(mockTask, callback);
    expect(callback).toHaveBeenCalledWith(null, undefined);
  });

  it('should validate task object, returning errors validatejs', () => {
    const engine = new EngineModel(testContext.testEngine);
    expect(engine.validateTask).toEqual(expect.any(Function));
    engine.validation = {
      engineCategoryId: {
        presence: true
      }
    };
    const mockTask = {};
    const callback = jest.fn();
    engine.validateTask(mockTask, callback);
    expect(callback).toHaveBeenCalledWith(null, {
      engineCategoryId: expect.any(Array)
    });
  });

  it('should validate task object, returning library errors validatejs', () => {
    testContext.testEngine.libraryRequired = true;
    const engine = new EngineModel(testContext.testEngine);
    expect(engine.validateTask).toEqual(expect.any(Function));
    const mockTask = {
      taskPayload: {}
    };
    const callback = jest.fn();
    engine.validateTask(mockTask, callback);
    expect(callback).toHaveBeenCalledWith(null, {
      'taskPayload.libraryId': expect.any(String)
    });
  });

  it('should filter internal fields', () => {
    const engine = new EngineModel(testContext.testEngine);
    expect(engine.generateFilteredTaskType).toEqual(expect.any(Function));
    expect(engine.generateFilteredTaskType()).toEqual(
      expect.objectContaining({
        engineId: expect.any(String),
        engineName: expect.any(String),
        engineDescription: expect.any(String)
      })
    );
  });

  it('should generate modelParameters', () => {
    testContext.testEngine.capabilityKey = 'language';
    testContext.testEngine.capabilityValue = 'en';
    const engine = new EngineModel(testContext.testEngine);
    expect(engine.generateFilteredTaskType).toEqual(expect.any(Function));
    expect(engine.generateFilteredTaskType()).toEqual(
      expect.objectContaining({
        engineId: expect.any(String),
        engineName: expect.any(String),
        engineDescription: expect.any(String),
        buildCapability: expect.objectContaining({
          language: 'en'
        })
      })
    );
  });
});
