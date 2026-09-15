'use strict';

const convertDbValue = require('./convert-db-value');
const validators = require('./validators');

describe('core-collection-server model/util/convert-db-value', () => {
  describe('passthrough values', () => {
    it('returns primitives unchanged', () => {
      expect(convertDbValue('hello')).toBe('hello');
      expect(convertDbValue(42)).toBe(42);
      expect(convertDbValue(null)).toBeNull();
      expect(convertDbValue(true)).toBe(true);
    });

    it('returns Date values unchanged (not treated as a plain object)', () => {
      const d = new Date('2020-01-01T00:00:00Z');
      expect(convertDbValue(d)).toBe(d);
    });
  });

  describe('object key camel-casing', () => {
    it('camel-cases snake_case keys', () => {
      expect(convertDbValue({ media_source_name: 'CNN' })).toEqual({ mediaSourceName: 'CNN' });
    });

    it('leaves non-id, non-snake keys untouched', () => {
      expect(convertDbValue({ name: 'x' })).toEqual({ name: 'x' });
    });
  });

  describe('id casting to string', () => {
    it('stringifies a numeric *_id value and camel-cases the key', () => {
      expect(convertDbValue({ entity_id: 5 })).toEqual({ entityId: '5' });
    });

    it('stringifies a numeric "id" value', () => {
      expect(convertDbValue({ id: 7 })).toEqual({ id: '7' });
    });

    it('stringifies a numeric camelCase *Id value', () => {
      expect(convertDbValue({ someId: 9 })).toEqual({ someId: '9' });
    });

    it('leaves a non-numeric id value as-is', () => {
      expect(convertDbValue({ id: 'abc' })).toEqual({ id: 'abc' });
    });
  });

  describe('recursion', () => {
    it('recurses into arrays, converting each element', () => {
      expect(convertDbValue([{ entity_id: 1 }, { entity_id: 2 }])).toEqual([
        { entityId: '1' },
        { entityId: '2' }
      ]);
    });

    it('recurses into nested objects', () => {
      const input = { outer_id: 3, nested_obj: { inner_id: 4, label_text: 'hi' } };
      expect(convertDbValue(input)).toEqual({
        outerId: '3',
        nestedObj: { innerId: '4', labelText: 'hi' }
      });
    });

    it('recurses into arrays nested within objects', () => {
      expect(convertDbValue({ items_list: [{ item_id: 8 }] })).toEqual({
        itemsList: [{ itemId: '8' }]
      });
    });
  });

  describe('validation-error guard for numeric ids', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('leaves the numeric id unconverted when the number validator reports an error', () => {
      // convertDbValue calls validators.validateOptionalNumber() (with no args, so it normally
      // returns null and ids are stringified). Force an error to exercise the guard branch.
      jest.spyOn(validators, 'validateOptionalNumber').mockReturnValue({ value: { message: 'bad' } });

      expect(convertDbValue({ entity_id: 5 })).toEqual({ entityId: 5 });
    });
  });
});
