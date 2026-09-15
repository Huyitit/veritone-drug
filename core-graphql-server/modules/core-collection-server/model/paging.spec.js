'use strict';

var configure = require('./paging');

describe('paging model', function () {
  var Paging, LimitField, OffsetField;

  beforeEach(function () {
    var result = configure({ paging: { defaultLimit: 10, maxLimit: 100 } });
    Paging = result.Paging;
    LimitField = result.LimitField;
    OffsetField = result.OffsetField;
  });

  describe('configure() factory (row #4)', function () {
    it('returns LimitField, OffsetField, and Paging constructor', function () {
      expect(typeof Paging).toBe('function');
      expect(LimitField).toHaveProperty('type', 'number');
      expect(OffsetField).toHaveProperty('type', 'number');
    });

    it('throws when config object is missing', function () {
      expect(function () {
        configure();
      }).toThrow('Missing config object');
    });

    it('throws when config.paging is missing', function () {
      expect(function () {
        configure({});
      }).toThrow('Missing config.paging object');
    });
  });

  describe('convertLimit (row #8)', function () {
    it('converts a string limit value to a number', function () {
      var instance = new Paging({ limit: '25' });

      expect(instance.limit).toBe(25);
    });
  });

  describe('validateLimit (row #9)', function () {
    it('returns a validation error when limit exceeds MAX_LIMIT', function () {
      var instance = new Paging({ limit: 101 });

      var errors = instance.validate();

      expect(errors).not.toBeNull();
      expect(errors.limit.message).toBe(
        'should be a positive Number less than or equal to 100'
      );
    });
  });

  describe('convertOffset (row #10)', function () {
    it('defaults offset to 0 when offset is not provided', function () {
      var instance = new Paging({});

      expect(instance.offset).toBe(0);
    });
  });
});
