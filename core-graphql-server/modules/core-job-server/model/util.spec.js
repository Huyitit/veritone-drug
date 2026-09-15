'use strict';

describe('model util', () => {
  const util = require('./util.js')();

  it('should have these functions', () => {
    expect(util.dateTimeToJson).toEqual(expect.any(Function));
  });

  describe('when calling date time to json', () => {
    it('should return nothing if value is null', () => {
      expect(util.dateTimeToJson()).toEqual();
    });

    it('should return iso date string if value', () => {
      expect(util.dateTimeToJson(new Date())).toEqual(expect.any(String));
    });
  });
});
