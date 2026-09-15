'use strict';

// const _ = require('lodash');
const util = require('../../../test/mockUtil')();

describe('dal engine category', () => {
  let testContext = {};

  util.mockCommon(testContext);

  beforeEach(() => {
    testContext.mod = require('./engine-category')(
      testContext.app,
      testContext.model,
      { core: testContext.coreConn }
    );
  });

  it('should be a configurable package', () => {
    expect(require('./engine-category')).toEqual(expect.any(Function));
  });

  it('should export an object containing group functions', () => {
    expect(
      require('./engine-category')(testContext.app, testContext.model, {
        core: testContext.pg
      })
    ).toEqual({
      getEngineCategory: expect.any(Function)
    });
  });

  describe('when calling getEngineCategory', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.getEngineCategory.bind(null, '', null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.getEngineCategory(
        '',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(expect.any(Object));
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve([{ engineCategoryId: 'abc-123' }])
        );

      jest
        .spyOn(testContext.model.EngineCategory, 'fromDB')
        .mockReturnValue({ engineCategoryId: 'abc-123' });

      await testContext.mod.getEngineCategory(
        '',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(expect.any(Object));
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.EngineCategory.fromDB).toHaveBeenCalled();
    });
  });
});
