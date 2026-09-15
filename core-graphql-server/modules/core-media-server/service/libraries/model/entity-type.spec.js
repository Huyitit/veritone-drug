'use strict';

const EntityType = require('./entity-type');

function makeEntityType(overrides) {
  return new EntityType(
    Object.assign({ name: 'Person', namePlural: 'People', schema: { type: 'object' } }, overrides)
  );
}

describe('core-media-server libraries model/entity-type', () => {
  describe('construction & schema normalization', () => {
    it('sets name, namePlural and schema from the data', () => {
      const e = makeEntityType();
      expect(e.name).toBe('Person');
      expect(e.namePlural).toBe('People');
      expect(e.schema).toEqual({ type: 'object' });
    });

    it('normalizes a null schema to an empty object', () => {
      const e = makeEntityType({ schema: null });
      expect(e.schema).toEqual({});
    });
  });

  describe('validate', () => {
    it('returns null for a valid entity type', () => {
      expect(makeEntityType().validate()).toBeNull();
    });

    it('reports a non-object schema as "must be an object"', () => {
      expect(makeEntityType({ schema: 'not-an-object' }).validate()).toEqual({
        schema: { message: 'must be an object' }
      });
    });

    it('reports a meta-schema violation for an object schema that is not a valid JSON schema', () => {
      const result = makeEntityType({ schema: { properties: 'nope' } }).validate();
      expect(result.schema.property).toBe('properties');
      expect(result.schema.message).toMatch(/is not of a type/);
    });

    it('reports an error for a missing/empty name', () => {
      expect(makeEntityType({ name: '' }).validate()).toEqual({
        name: { message: 'should be a String' }
      });
    });
  });

  describe('generateCombinedSchema', () => {
    it('throws when the libraryType is not set', () => {
      expect(() => makeEntityType().generateCombinedSchema()).toThrow(
        'libraryType of EntityType not defined'
      );
    });

    it('produces a combined schema id scoped to the library type', () => {
      const e = makeEntityType();
      e._libraryType = { libraryTypeId: 'LT1', label: 'People Lib' };
      expect(e.generateCombinedSchema().id).toBe('/library-type/LT1/schema');
    });
  });

  describe('toJSON schema serialization', () => {
    it('serializes schema as a $ref to the combined schema by default', () => {
      const e = makeEntityType();
      e._libraryType = { libraryTypeId: 'LT1', label: 'People Lib' };
      expect(e.toJSON().schema).toEqual({ $ref: '/api/media/library-type/LT1/schema' });
    });

    it('enableStringifySchema() is chainable and makes toJSON emit the raw schema', () => {
      const e = makeEntityType({ schema: { type: 'object', title: 'raw' } });
      e._libraryType = { libraryTypeId: 'LT1', label: 'People Lib' };

      expect(e.enableStringifySchema()).toBe(e);
      expect(e.toJSON().schema).toEqual({ type: 'object', title: 'raw' });
    });
  });
});
