'use strict';

var createModel = require('./create-model');

function buildSampleModel() {
  return createModel({
    _postgresConfig: {
      schemaName: 's',
      tableName: 't',
      primaryKey: 'sample_id',
      fields: { sample_id: 'sampleId' }
    },
    displayName: { type: 'string', userEditable: true },
    userId: { type: 'string' },
    count: { type: 'number', required: true },
    active: { type: 'boolean' },
    createdAt: { type: 'date' },
    externalId: { type: 'uuid' }
  });
}

describe('createModel (model/util)', function () {
  describe('config validation', function () {
    it('throws when modelConfig is not an object', function () {
      expect(function () {
        createModel('nope');
      }).toThrow(/should be an object/);
    });

    it('throws on an unknown field type', function () {
      expect(function () {
        createModel({ bad: { type: 'definitely-not-a-type' } });
      }).toThrow(/unknown field type/);
    });
  });

  describe('field categorization', function () {
    var Sample;
    beforeEach(function () {
      Sample = buildSampleModel();
    });

    function keys(fields) {
      return fields.map(function (f) {
        return f.key;
      });
    }

    it('sorts each field into its typed bucket', function () {
      expect(keys(Sample.stringFields)).toEqual(
        expect.arrayContaining(['displayName', 'userId'])
      );
      expect(keys(Sample.numberFields)).toEqual(['count']);
      expect(keys(Sample.booleanFields)).toEqual(['active']);
      expect(keys(Sample.dateFields)).toEqual(['createdAt']);
      expect(keys(Sample.uuidFields)).toEqual(['externalId']);
    });

    it('aggregates every field into allFields', function () {
      expect(keys(Sample.allFields).sort()).toEqual(
        ['active', 'count', 'createdAt', 'displayName', 'externalId', 'userId']
      );
    });

    it('builds requiredFields and userEditableFields maps from config', function () {
      expect(Sample.requiredFields).toEqual({ count: true });
      expect(Sample.userEditableFields).toEqual({ displayName: true });
    });
  });

  describe('_postgresConfig', function () {
    it('exposes the provided _postgresConfig', function () {
      expect(buildSampleModel()._postgresConfig).toMatchObject({
        tableName: 't',
        primaryKey: 'sample_id',
        fields: { sample_id: 'sampleId' }
      });
    });

    it('defaults to an empty object when omitted', function () {
      var M = createModel({ name: { type: 'string' } });
      expect(M._postgresConfig).toEqual({});
    });
  });

  describe('instances', function () {
    var Sample;
    beforeEach(function () {
      Sample = buildSampleModel();
    });

    it('copies only whitelisted fields', function () {
      var instance = new Sample({ displayName: 'Bob', bogus: 'x' });
      expect(instance.displayName).toBe('Bob');
      expect(instance.bogus).toBeUndefined();
      expect(Object.keys(instance)).not.toContain('bogus');
    });

    it('fromDB renames snake_case keys to camelCase', function () {
      var instance = Sample.fromDB({ display_name: 'Bob' });
      expect(instance.displayName).toBe('Bob');
    });

    it('fromDB casts numeric id values to strings', function () {
      var instance = Sample.fromDB({ user_id: 42 });
      expect(instance.userId).toBe('42');
    });

    it('validate() returns an error when a required field is missing', function () {
      var errors = new Sample({}).validate();
      expect(errors).not.toBeNull();
      expect(errors.count).toBeTruthy();
    });

    it('validate() returns null for a valid instance', function () {
      expect(new Sample({ count: 3 }).validate()).toBeNull();
    });
  });
});
