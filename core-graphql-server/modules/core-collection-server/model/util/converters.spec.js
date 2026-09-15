'use strict';

var converters = require('./converters');
var toStringList = converters.convertOneOrManyCommaDelimitedString;
var toNumberList = converters.convertOneOrManyCommaDelimitedNumber;

describe('converters (model/util)', function () {
  describe('convertOneOrManyCommaDelimitedString', function () {
    it('splits a comma-delimited string and trims each item', function () {
      var dst = {};
      toStringList('a, b ,c', { tags: 'a, b ,c' }, dst, 'tags');
      expect(dst.tags).toEqual(['a', 'b', 'c']);
    });

    it('wraps a single value (no comma) in a one-element array', function () {
      var dst = {};
      toStringList('solo', { tags: 'solo' }, dst, 'tags');
      expect(dst.tags).toEqual(['solo']);
    });

    it('maps and trims an array input', function () {
      var dst = {};
      toStringList([' a ', 'b '], { tags: [' a ', 'b '] }, dst, 'tags');
      expect(dst.tags).toEqual(['a', 'b']);
    });

    it('is a no-op when the source lacks the key', function () {
      var dst = {};
      toStringList(undefined, {}, dst, 'tags');
      expect(Object.prototype.hasOwnProperty.call(dst, 'tags')).toBe(false);
    });
  });

  describe('convertOneOrManyCommaDelimitedNumber', function () {
    it('splits a comma-delimited string and parses each to a number', function () {
      var dst = {};
      toNumberList('1,2,3', { ids: '1,2,3' }, dst, 'ids');
      expect(dst.ids).toEqual([1, 2, 3]);
    });

    it('parses a single numeric string into a one-element array', function () {
      var dst = {};
      toNumberList('5', { ids: '5' }, dst, 'ids');
      expect(dst.ids).toEqual([5]);
    });

    it('maps an array input through parseFloat', function () {
      var dst = {};
      toNumberList(['1', '2.5'], { ids: ['1', '2.5'] }, dst, 'ids');
      expect(dst.ids).toEqual([1, 2.5]);
    });

    it('is a no-op when the source lacks the key', function () {
      var dst = {};
      toNumberList(undefined, {}, dst, 'ids');
      expect(Object.prototype.hasOwnProperty.call(dst, 'ids')).toBe(false);
    });

    it('is a no-op for a non-string, non-array value', function () {
      var dst = {};
      toNumberList(42, { ids: 42 }, dst, 'ids');
      expect(Object.prototype.hasOwnProperty.call(dst, 'ids')).toBe(false);
    });
  });
});
