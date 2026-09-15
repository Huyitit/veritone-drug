'use strict';

const util = require('../../../test/mockUtil')();

describe('dal build capability', () => {
  let testContext = {};

  util.mockCommon(testContext);

  const coreConn = { query: jest.fn() };
  beforeAll(() => {
    testContext.mod = require('./build-capability')(
      testContext.app,
      testContext.model,
      { core: coreConn }
    );
  });

  it('should be a configurable package', () => {
    expect(require('./build-capability')).toEqual(expect.any(Function));
  });

  it('should export an object containing build functions', () => {
    expect(
      require('./build-capability')(testContext.app, testContext.model, {
        core: coreConn
      })
    ).toEqual({
      addBuildCapabilities: expect.any(Function)
    });
  });

  describe('when calling addBuildCapabilities', () => {
    it('should throw when there is a missing callback param', async () => {
      await expect(testContext.mod.addBuildCapabilities).rejects.toThrow(
        /callback/
      );
    });

    it('should throw error when empty capabilities', async () => {
      await expect(
        testContext.mod.addBuildCapabilities('test', [], null, function () {})
      ).rejects.toThrow(/missing\scapabilities/);
    });

    it('should execute callback with an error on query failure', async () => {
      coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.reject(new Error('query error')));

      await testContext.mod.addBuildCapabilities(
        'test',
        [{}],
        null,
        function callback(err, result) {
          expect(err.message).toMatch(/query\serror/);
        }
      );

      expect(coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      coreConn.query = jest.fn().mockImplementation(() => Promise.resolve([]));

      await testContext.mod.addBuildCapabilities(
        '683de78d-9c09-4246-8704-45ead6835167',
        [{}],
        null,
        function callback(err, result) {
          expect(err).toBe(null);
        }
      );
      expect(coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      coreConn.query = jest.fn().mockImplementation(() => Promise.resolve([]));

      await testContext.mod.addBuildCapabilities(
        '683de78d-9c09-4246-8704-45ead6835167',
        [{ key: 'language', value: 'fr' }],
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(
            expect.objectContaining({
              totalResults: 0
            })
          );
        }
      );
      expect(coreConn.query).toHaveBeenCalled();
    });
  });
});
