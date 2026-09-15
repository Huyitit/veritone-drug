'use strict';

const { has } = require('lodash');

const _ = require('lodash'),
  util = require('../../../test/mockUtil')();

describe('bll engine', () => {
  let testContext = {};
  testContext.mod = require('./engine');

  util.mockCommon(testContext);

  let callbackHasBeenCalled;
  beforeEach(() => {
    testContext.dalSpy = {
      getEngineBuilds: jest.fn(),
      updateEngineState: jest.fn()
    };
    testContext.dalSpiesIndex = {
      engine: testContext.dalSpy,
      build: testContext.dalSpy
    };
    testContext.bll = testContext.mod(
      testContext.app,
      testContext.dalSpiesIndex,
      testContext.model
    );
  });

  it('should be a configurable package', () => {
    expect(testContext.mod).toEqual(expect.any(Function));
  });

  it('should export an object containing cluster bll functions', () => {
    expect(
      testContext.mod(
        testContext.app,
        testContext.dalSpiesIndex,
        testContext.model
      )
    ).toEqual(
      expect.objectContaining({
        autoTransitionEngineState: expect.any(Function)
      })
    );
  });

  it('should throw error if app is missing', () => {
    expect(testContext.mod.bind(null, null)).toThrowError(/missing app/);
  });

  it('should throw error if dal is missing', () => {
    expect(testContext.mod.bind(null, testContext.app, null)).toThrowError(
      /missing dal/
    );
  });

  it('should throw error if model is missing', () => {
    expect(
      testContext.mod.bind(
        null,
        testContext.app,
        testContext.dalSpiesIndex,
        null
      )
    ).toThrowError(/missing model/);
  });

  describe('when accessing autoTransitionEngineState', () => {
    beforeEach(() => {
      callbackHasBeenCalled = false;
    });

    it('should throw error missing callback', () => {
      expect(() => testContext.bll.autoTransitionEngineState()).toThrowError(
        /callback/
      );
    });

    it('should return err if missing engine', () => {
      testContext.bll.autoTransitionEngineState(
        null,
        null,
        false,
        function autoTransitionEngineStateCallback(err) {
          expect(err.message).toMatch(/missing\sengine/);
          callbackHasBeenCalled = true;
        }
      );

      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should callback with engine with active state if at least one build is deployed', async () => {
      const mockBuilds = [
        {
          engineId: 'some-engine-id',
          buildId: 'build-1',
          buildState: 'paused'
        },
        {
          engineId: 'some-engine-id',
          buildId: 'build-2',
          buildState: 'deployed'
        },
        {
          engineId: 'some-engine-id',
          buildId: 'build-3',
          buildState: 'paused'
        }
      ];
      testContext.dalSpy.getEngineBuilds = jest
        .fn()
        .mockImplementation(function getEngineBuilds(
          options,
          dbClient,
          callback
        ) {
          expect(options.engineId).toBe('00000000-0000-0000-0000-000000000000');
          callback(null, { results: mockBuilds });
        });

      testContext.dalSpy.updateEngineState = jest
        .fn()
        .mockImplementation(function updateEngineState(
          engineId,
          engineState,
          dbClient,
          callback
        ) {
          expect(engineId).toBe('00000000-0000-0000-0000-000000000000');
          expect(engineState).toBe('active');
          callback(null, {
            engineId: 'some-engine-id',
            engineState: engineState
          });
        });

      await testContext.bll.autoTransitionEngineState(
        {
          engineId: '00000000-0000-0000-0000-000000000000',
          engineState: 'active'
        },
        null,
        false,
        function autoTransitionEngineStateCallback(err, engine) {
          expect(err).toEqual(expect.any(Object));
          expect(engine).not.toBe(null);
          expect(engine.engineState).toBe('active');
          callbackHasBeenCalled = true;
        }
      );

      expect(callbackHasBeenCalled).toBe(true);
    });
  });
});
