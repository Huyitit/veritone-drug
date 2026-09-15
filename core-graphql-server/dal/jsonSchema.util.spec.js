'use strict';

const { validateSchemaCompatibility } = require('./jsonSchema.util');

describe('jsonSchema.util.js — validateSchemaCompatibility', () => {
  it('does not throw when both schemas are identical', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } }
    };
    expect(() => validateSchemaCompatibility(schema, schema)).not.toThrow();
  });

  it('throws when a top-level property is removed (breaking change)', () => {
    const original = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } }
    };
    const changed = {
      type: 'object',
      properties: { name: { type: 'string' } }
    };
    expect(() => validateSchemaCompatibility(original, changed)).toThrow(
      /backward compatible/
    );
  });

  it('does not throw when a new optional property is added (backward compatible)', () => {
    const original = {
      type: 'object',
      properties: { name: { type: 'string' } }
    };
    const changed = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } }
    };
    expect(() => validateSchemaCompatibility(original, changed)).not.toThrow();
  });

  it('throws when a required field is added to required array (existing producers break)', () => {
    const original = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    };
    const changed = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } },
      required: ['name', 'age']
    };
    expect(() => validateSchemaCompatibility(original, changed)).toThrow(
      /backward compatible/
    );
  });

  it('does not throw when a required field is removed from required array', () => {
    const original = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } },
      required: ['name', 'age']
    };
    const changed = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } },
      required: ['name']
    };
    expect(() => validateSchemaCompatibility(original, changed)).not.toThrow();
  });

  it('does not throw for empty schemas', () => {
    expect(() => validateSchemaCompatibility({}, {})).not.toThrow();
  });

  it('accepts allowReorder option and skips false positives when order changes', () => {
    const original = {
      type: 'object',
      anyOf: [{ $ref: '#/definitions/A' }, { $ref: '#/definitions/B' }]
    };
    const changed = {
      type: 'object',
      anyOf: [{ $ref: '#/definitions/B' }, { $ref: '#/definitions/A' }]
    };
    expect(() =>
      validateSchemaCompatibility(original, changed, { allowReorder: true })
    ).not.toThrow();
  });
});
