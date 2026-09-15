'use strict';

var url = require('url');
var validators = require('./validate');

describe('validate', function () {
  describe('validateUUID', function () {
    it('returns null for a valid lowercase UUID', function () {
      var result = validators.validateUUID('550e8400-e29b-41d4-a716-446655440000', {}, 'id');
      expect(result).toBeNull();
    });

    it('returns null for a valid uppercase UUID', function () {
      var result = validators.validateUUID('550E8400-E29B-41D4-A716-446655440000', {}, 'id');
      expect(result).toBeNull();
    });

    it('returns an error object for a non-UUID string', function () {
      var result = validators.validateUUID('not-a-uuid', {}, 'id');
      expect(result).toEqual({ id: { message: 'not a valid UUID' } });
    });

    it('returns an error object for an empty string', function () {
      var result = validators.validateUUID('', {}, 'id');
      expect(result).toEqual({ id: { message: 'not a valid UUID' } });
    });

    it('uses the provided key as the error property name', function () {
      var result = validators.validateUUID('bad', {}, 'assetId');
      expect(result).toHaveProperty('assetId');
      expect(result).not.toHaveProperty('id');
    });
  });

  describe('validateURL', function () {
    it('returns null for null value', function () {
      expect(validators.validateURL(null, {}, 'url')).toBeNull();
    });

    it('returns null for a url.parse result with protocol, host, and path', function () {
      var parsed = url.parse('http://example.com/path');
      expect(validators.validateURL(parsed, {}, 'url')).toBeNull();
    });

    it('returns an error for a plain string', function () {
      var result = validators.validateURL('http://example.com/path', {}, 'url');
      expect(result).toEqual({ url: { message: 'invalid URL' } });
    });

    it('returns an error for a plain object that is not a Url instance', function () {
      var fakeUrl = { protocol: 'http:', host: 'example.com', path: '/path' };
      var result = validators.validateURL(fakeUrl, {}, 'url');
      expect(result).toEqual({ url: { message: 'invalid URL' } });
    });

    it('returns an error for a Url instance missing protocol', function () {
      var noProto = url.parse('//example.com/path');
      var result = validators.validateURL(noProto, {}, 'url');
      expect(result).toEqual({ url: { message: 'invalid URL' } });
    });
  });

  describe('validateOptionalObject', function () {
    it('returns null for null', function () {
      expect(validators.validateOptionalObject(null, {}, 'meta')).toBeNull();
    });

    it('returns null for undefined', function () {
      expect(validators.validateOptionalObject(undefined, {}, 'meta')).toBeNull();
    });

    it('returns null for a non-empty object', function () {
      expect(validators.validateOptionalObject({ key: 'val' }, {}, 'meta')).toBeNull();
    });

    it('returns null for an empty object', function () {
      expect(validators.validateOptionalObject({}, {}, 'meta')).toBeNull();
    });

    it('returns null for an array (arrays are objects)', function () {
      expect(validators.validateOptionalObject([], {}, 'meta')).toBeNull();
    });

    it('returns an error for a string value', function () {
      var result = validators.validateOptionalObject('string', {}, 'meta');
      expect(result).toEqual({ meta: { message: 'must be null or an object' } });
    });

    it('returns an error for a number value', function () {
      var result = validators.validateOptionalObject(42, {}, 'meta');
      expect(result).toEqual({ meta: { message: 'must be null or an object' } });
    });

    it('uses the provided key in the error object', function () {
      var result = validators.validateOptionalObject(true, {}, 'payload');
      expect(result).toHaveProperty('payload');
    });
  });

  describe('validateAgainstSchema', function () {
    var schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' }
      },
      required: ['name']
    };

    it('returns an empty array for a valid instance', function () {
      var result = validators.validateAgainstSchema({ name: 'test' }, schema);
      expect(result).toEqual([]);
    });

    it('returns an empty array when extra properties are present', function () {
      var result = validators.validateAgainstSchema({ name: 'test', extra: true }, schema);
      expect(result).toEqual([]);
    });

    it('returns errors when a required property is missing', function () {
      var result = validators.validateAgainstSchema({}, schema);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('message');
      expect(result[0]).toHaveProperty('property');
    });

    it('returns errors with remapped property name for a type violation', function () {
      var result = validators.validateAgainstSchema({ name: 123 }, schema);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].property).toBe('name');
    });

    it('accumulates multiple validation errors', function () {
      var multiSchema = {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'integer' }
        },
        required: ['a', 'b']
      };
      var result = validators.validateAgainstSchema({}, multiSchema);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('each error entry has message and property fields', function () {
      var result = validators.validateAgainstSchema({ name: 123 }, schema);
      result.forEach(function (err) {
        expect(err).toHaveProperty('message');
        expect(err).toHaveProperty('property');
      });
    });
  });
});
