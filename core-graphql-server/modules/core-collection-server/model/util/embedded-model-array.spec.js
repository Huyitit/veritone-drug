'use strict';

var embeddedModelArray = require('./embedded-model-array');
var createModel = require('./create-model');

var InnerModel = createModel({
  a: { type: 'string', required: true },
  b: { type: 'string' }
});

describe('embeddedModelArray (model/util)', function () {
  describe('option validation', function () {
    it('throws when options is not an object', function () {
      expect(function () {
        embeddedModelArray('nope');
      }).toThrow(/Missing options object/);
    });

    it('throws when options.model is not a function', function () {
      expect(function () {
        embeddedModelArray({ modelName: 'Inner' });
      }).toThrow(/Missing options\.model/);
    });

    it('throws when options.modelName is missing or empty', function () {
      expect(function () {
        embeddedModelArray({ model: InnerModel, modelName: '' });
      }).toThrow(/Missing options\.modelName/);
    });

    it('throws when options.required is not a boolean', function () {
      expect(function () {
        embeddedModelArray({ model: InnerModel, modelName: 'Inner', required: 'yes' });
      }).toThrow(/required should be a boolean/);
    });
  });

  describe('field config shape', function () {
    it('returns a json field config with convert and validate functions', function () {
      var f = embeddedModelArray({ model: InnerModel, modelName: 'Inner' });
      expect(f.type).toBe('json');
      expect(typeof f.convert).toBe('function');
      expect(typeof f.validate).toBe('function');
    });

    it('passes through dbKey, required and userEditable', function () {
      var f = embeddedModelArray({
        model: InnerModel,
        modelName: 'Inner',
        dbKey: 'my_key',
        required: true,
        userEditable: true
      });
      expect(f.dbKey).toBe('my_key');
      expect(f.required).toBe(true);
      expect(f.userEditable).toBe(true);
    });

    it('uses a caller-provided convert/validate over the defaults', function () {
      var convert = function () {};
      var validate = function () {};
      var f = embeddedModelArray({
        model: InnerModel,
        modelName: 'Inner',
        convert: convert,
        validate: validate
      });
      expect(f.convert).toBe(convert);
      expect(f.validate).toBe(validate);
    });
  });

  describe('default convert', function () {
    var convert;
    beforeEach(function () {
      convert = embeddedModelArray({ model: InnerModel, modelName: 'Inner' }).convert;
    });

    it('maps an array of objects to an array of Model instances', function () {
      var dst = {};
      convert([{ a: 'x' }, { a: 'y' }], { f: [{ a: 'x' }, { a: 'y' }] }, dst, 'f');
      expect(Array.isArray(dst.f)).toBe(true);
      expect(dst.f).toHaveLength(2);
      expect(dst.f[0]).toBeInstanceOf(InnerModel);
      expect(dst.f[1]).toBeInstanceOf(InnerModel);
      expect(dst.f[0].a).toBe('x');
    });

    it('is a no-op when the source lacks the key', function () {
      var dst = {};
      convert(undefined, {}, dst, 'f');
      expect(Object.prototype.hasOwnProperty.call(dst, 'f')).toBe(false);
    });

    it('passes a non-array value through unchanged', function () {
      var dst = {};
      convert('notArray', { f: 'notArray' }, dst, 'f');
      expect(dst.f).toBe('notArray');
    });
  });

  describe('default validate', function () {
    var requiredValidate, optionalValidate;
    beforeEach(function () {
      requiredValidate = embeddedModelArray({
        model: InnerModel,
        modelName: 'Inner',
        required: true
      }).validate;
      optionalValidate = embeddedModelArray({ model: InnerModel, modelName: 'Inner' }).validate;
    });

    it('rejects a non-array value', function () {
      var err = requiredValidate('notArray', { f: 'notArray' }, 'f');
      expect(err.f.message).toMatch(/should be an Array/);
    });

    it('flags a non-Model-instance item with its position', function () {
      var err = requiredValidate([{ a: 'x' }], { f: [{ a: 'x' }] }, 'f');
      expect(err.f[0].message).toMatch(/should be an instance of Inner/);
      expect(err.f[0].position).toBe(0);
    });

    it('propagates an item validate() error with its position', function () {
      var err = requiredValidate([new InnerModel({})], { f: [{}] }, 'f');
      expect(err.f[0].a).toBeTruthy();
      expect(err.f[0].position).toBe(0);
    });

    it('passes for an array of valid Model instances', function () {
      expect(
        requiredValidate([new InnerModel({ a: 'x' })], { f: [{}] }, 'f')
      ).toBeNull();
    });

    it('optional validate returns null when the key is absent', function () {
      expect(optionalValidate(undefined, {}, 'f')).toBeNull();
    });
  });
});
