'use strict';

const validators = require('./validators');

// Each validator returns null when valid, or { [key]: { message } } when invalid.
// Optional validators additionally treat an absent key and an explicit null as valid.

describe('core-collection-server model/util/validators', () => {
  const key = 'field';

  describe('validateString', () => {
    it('accepts a string', () => {
      expect(validators.validateString('hi', {}, key)).toBeNull();
    });
    it('rejects a non-string', () => {
      expect(validators.validateString(42, {}, key)).toEqual({ field: { message: 'should be a String' } });
    });
  });

  describe('validateOptionalString', () => {
    it('passes when the key is absent', () => {
      expect(validators.validateOptionalString(undefined, {}, key)).toBeNull();
    });
    it('accepts a string or null when present', () => {
      expect(validators.validateOptionalString('hi', { field: 'hi' }, key)).toBeNull();
      expect(validators.validateOptionalString(null, { field: null }, key)).toBeNull();
    });
    it('rejects a non-string when present', () => {
      expect(validators.validateOptionalString(1, { field: 1 }, key)).toEqual({
        field: { message: 'should be a String' }
      });
    });
  });

  describe('validateNumber', () => {
    it('accepts a finite number', () => {
      expect(validators.validateNumber(3.14, {}, key)).toBeNull();
    });
    it.each([NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '5'])(
      'rejects non-finite / non-number %p',
      (bad) => {
        expect(validators.validateNumber(bad, {}, key)).toEqual({ field: { message: 'should be a Number' } });
      }
    );
  });

  describe('validateOptionalNumber', () => {
    it('passes when absent', () => {
      expect(validators.validateOptionalNumber(undefined, {}, key)).toBeNull();
    });
    it('accepts a finite number or null when present', () => {
      expect(validators.validateOptionalNumber(7, { field: 7 }, key)).toBeNull();
      expect(validators.validateOptionalNumber(null, { field: null }, key)).toBeNull();
    });
    it('rejects Infinity when present', () => {
      expect(validators.validateOptionalNumber(Infinity, { field: Infinity }, key)).toEqual({
        field: { message: 'should be a Number' }
      });
    });
  });

  describe('validateBoolean', () => {
    it.each([true, false, 0, 1])('accepts %p', (v) => {
      expect(validators.validateBoolean(v, {}, key)).toBeNull();
    });
    it('rejects a non-boolean', () => {
      expect(validators.validateBoolean('true', {}, key)).toEqual({
        field: { message: 'should be a Boolean (or either 0 or 1)' }
      });
    });
  });

  describe('validateOptionalBoolean', () => {
    it('passes when absent', () => {
      expect(validators.validateOptionalBoolean(undefined, {}, key)).toBeNull();
    });
    it('accepts boolean-like or null when present', () => {
      expect(validators.validateOptionalBoolean(1, { field: 1 }, key)).toBeNull();
      expect(validators.validateOptionalBoolean(null, { field: null }, key)).toBeNull();
    });
    it('rejects a non-boolean when present', () => {
      expect(validators.validateOptionalBoolean(2, { field: 2 }, key)).toEqual({
        field: { message: 'should be a Boolean (or either 0 or 1)' }
      });
    });
  });

  describe('validateDate', () => {
    it('accepts a valid Date', () => {
      expect(validators.validateDate(new Date('2020-01-01'), {}, key)).toBeNull();
    });
    it('rejects an invalid Date', () => {
      expect(validators.validateDate(new Date('not-a-date'), {}, key)).toEqual({
        field: { message: 'should be a Date' }
      });
    });
    it('rejects a non-Date', () => {
      expect(validators.validateDate('2020-01-01', {}, key)).toEqual({ field: { message: 'should be a Date' } });
    });
  });

  describe('validateOptionalDate', () => {
    it('passes when absent', () => {
      expect(validators.validateOptionalDate(undefined, {}, key)).toBeNull();
    });
    it('accepts a Date or null when present', () => {
      expect(validators.validateOptionalDate(new Date(), { field: new Date() }, key)).toBeNull();
      expect(validators.validateOptionalDate(null, { field: null }, key)).toBeNull();
    });
    it('rejects a non-Date when present', () => {
      expect(validators.validateOptionalDate('x', { field: 'x' }, key)).toEqual({
        field: { message: 'should be a Date' }
      });
    });
  });

  describe('validateJSON', () => {
    it('accepts an object or array', () => {
      expect(validators.validateJSON({ a: 1 }, {}, key)).toBeNull();
      expect(validators.validateJSON([1, 2], {}, key)).toBeNull();
    });
    it('rejects a primitive', () => {
      expect(validators.validateJSON('str', {}, key)).toEqual({
        field: { message: 'should be an Object or Array' }
      });
    });
  });

  describe('validateOptionalJSON', () => {
    it('passes when absent', () => {
      expect(validators.validateOptionalJSON(undefined, {}, key)).toBeNull();
    });
    it('accepts object/array/null when present', () => {
      expect(validators.validateOptionalJSON({ a: 1 }, { field: {} }, key)).toBeNull();
      expect(validators.validateOptionalJSON(null, { field: null }, key)).toBeNull();
    });
    it('rejects a primitive when present', () => {
      expect(validators.validateOptionalJSON(5, { field: 5 }, key)).toEqual({
        field: { message: 'should be an Object or Array' }
      });
    });
  });

  describe('validateUUID', () => {
    it('accepts a valid UUID', () => {
      expect(validators.validateUUID('123e4567-e89b-12d3-a456-426614174000', {}, key)).toBeNull();
    });
    it('rejects a non-UUID', () => {
      expect(validators.validateUUID('not-a-uuid', {}, key)).toEqual({ field: { message: 'should be a UUID' } });
    });
  });

  describe('validateOptionalUUID', () => {
    it('passes when absent', () => {
      expect(validators.validateOptionalUUID(undefined, {}, key)).toBeNull();
    });
    it('accepts a UUID or null when present', () => {
      expect(
        validators.validateOptionalUUID('123e4567-e89b-12d3-a456-426614174000', { field: 'x' }, key)
      ).toBeNull();
      expect(validators.validateOptionalUUID(null, { field: null }, key)).toBeNull();
    });
    it('rejects a bad UUID when present', () => {
      expect(validators.validateOptionalUUID('nope', { field: 'nope' }, key)).toEqual({
        field: { message: 'should be a UUID' }
      });
    });
  });

  describe('validateOptionalEmailConstraint', () => {
    it('passes when absent', () => {
      expect(validators.validateOptionalEmailConstraint(undefined, {}, key)).toBeNull();
    });

    it('accepts a valid email string', () => {
      expect(
        validators.validateOptionalEmailConstraint('a@b.com', { field: 'a@b.com' }, key)
      ).toBeNull();
    });

    it('rejects an invalid email string', () => {
      expect(
        validators.validateOptionalEmailConstraint('nope', { field: 'nope' }, key)
      ).toEqual({ field: { message: 'nope is not a valid email' } });
    });

    it('accepts an array of valid emails', () => {
      expect(
        validators.validateOptionalEmailConstraint(['a@b.com', 'c@d.com'], { field: [] }, key)
      ).toBeNull();
    });

    it('reports per-index errors for an invalid array entry', () => {
      const result = validators.validateOptionalEmailConstraint(['a@b.com', ''], { field: [] }, key);
      expect(result.field.length).toBeGreaterThan(0);
      expect(result.field[0].message).toBe('email at index 1 should be a String');
    });

    it('rejects a non-string, non-array value', () => {
      expect(validators.validateOptionalEmailConstraint(42, { field: 42 }, key)).toEqual({
        field: { message: 'should be a String or Array of Strings' }
      });
    });
  });
});
