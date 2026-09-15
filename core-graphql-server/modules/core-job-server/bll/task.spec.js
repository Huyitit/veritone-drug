'use strict';

const _ = require('lodash'),
  util = require('../../../test/mockUtil')();

describe('bll engine', () => {
  let testContext = {};
  testContext.mod = require('./task');

  util.mockCommon(testContext);

  let callbackHasBeenCalled;

  beforeEach(() => {
    testContext.dalSpy = {};
    testContext.dalSpiesIndex = {
      task: testContext.dalSpy
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
        getEngineUsageForOrganization: expect.any(Function)
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

  describe('when accessing getEngineUsageForOrganization', () => {
    beforeEach(() => {
      callbackHasBeenCalled = false;
      testContext.dalSpy.getEngineUsageForOrganization = jest.fn();
    });

    it('should throw error missing callback', () => {
      expect(testContext.bll.getEngineUsageForOrganization).toThrowError(
        /callback/
      );
    });

    it('should return err if missing app id', () => {
      testContext.bll.getEngineUsageForOrganization(
        null,
        null,
        null,
        function autoTransitionEngineStateCallback(err) {
          expect(err.message).toMatch(/missing\sapp\sid/);
          callbackHasBeenCalled = true;
        }
      );

      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should callback with error if error getting usage', () => {
      testContext.dalSpy.getEngineUsageForOrganization = jest
        .fn()
        .mockImplementation(function (options, dbClient, callback) {
          const now = new Date();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();
          expect(options.applicationId).toBe(
            '00000000-0000-0000-0000-000000000000'
          );
          expect(options.startEpoch).toBe(
            new Date(currentYear, currentMonth).getTime() / 1000
          );
          expect(options.endEpoch).toBe(
            new Date(currentYear, currentMonth + 1).getTime() / 1000
          );
          callback(new Error('some error'));
        });

      testContext.bll.getEngineUsageForOrganization(
        '00000000-0000-0000-0000-000000000000',
        {},
        null,
        function getEngineUsageForOrganizationCallback(err, payload) {
          expect(err).toEqual(expect.any(Object));
          expect(payload).toBe(undefined);
          callbackHasBeenCalled = true;
        }
      );

      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should callback with payload', () => {
      testContext.dalSpy.getEngineUsageForOrganization = jest
        .fn()
        .mockImplementation(function (options, dbClient, callback) {
          const now = new Date();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();
          expect(options.applicationId).toBe(
            '00000000-0000-0000-0000-000000000000'
          );
          expect(options.startEpoch).toBe(
            new Date(currentYear, currentMonth).getTime() / 1000
          );
          expect(options.endEpoch).toBe(
            new Date(currentYear, currentMonth + 1).getTime() / 1000
          );
          callback(null, { some: 'asdf' });
        });

      const mockOrg = {
        kvp: {
          billing: {
            type: 'monthly'
          }
        }
      };
      testContext.bll.getEngineUsageForOrganization(
        '00000000-0000-0000-0000-000000000000',
        mockOrg,
        null,
        function getEngineUsageForOrganizationCallback(err, payload) {
          expect(err).toBe(null);
          expect(payload).toEqual(
            expect.objectContaining({
              some: expect.any(String),
              billingType: expect.any(String)
            })
          );
          callbackHasBeenCalled = true;
        }
      );

      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should callback with payload with yearly', () => {
      testContext.dalSpy.getEngineUsageForOrganization = jest
        .fn()
        .mockImplementation(function (options, dbClient, callback) {
          const now = new Date();
          const currentYear = now.getFullYear();
          expect(options.applicationId).toBe(
            '00000000-0000-0000-0000-000000000000'
          );
          expect(options.startEpoch).toBe(
            new Date(currentYear, 0, 1).getTime() / 1000
          );
          expect(options.endEpoch).toBe(
            new Date(currentYear + 1, 0, 1).getTime() / 1000
          );
          callback(null, { some: 'asdf' });
        });

      const mockOrg = {
        kvp: {
          billing: {
            type: 'yearly'
          }
        }
      };
      testContext.bll.getEngineUsageForOrganization(
        '00000000-0000-0000-0000-000000000000',
        mockOrg,
        null,
        function getEngineUsageForOrganizationCallback(err, payload) {
          expect(err).toBe(null);
          expect(payload).toEqual(
            expect.objectContaining({
              some: expect.any(String),
              billingType: expect.any(String)
            })
          );
          callbackHasBeenCalled = true;
        }
      );

      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should callback with payload with total', () => {
      testContext.dalSpy.getEngineUsageForOrganization = jest
        .fn()
        .mockImplementation(function (options, dbClient, callback) {
          expect(options.applicationId).toBe(
            '00000000-0000-0000-0000-000000000000'
          );
          expect(options.startEpoch).toBe(null);
          expect(options.endEpoch).toBe(null);
          callback(null, { some: 'asdf' });
        });

      const mockOrg = {
        kvp: {
          billing: {
            type: 'total'
          }
        }
      };
      testContext.bll.getEngineUsageForOrganization(
        '00000000-0000-0000-0000-000000000000',
        mockOrg,
        null,
        function getEngineUsageForOrganizationCallback(err, payload) {
          expect(err).toBe(null);
          expect(payload).toEqual(
            expect.objectContaining({
              some: expect.any(String),
              billingType: expect.any(String)
            })
          );
          callbackHasBeenCalled = true;
        }
      );

      expect(callbackHasBeenCalled).toBe(true);
    });
  });
});
