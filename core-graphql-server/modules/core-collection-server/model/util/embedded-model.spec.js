'use strict';

var embeddedModel = require('./embedded-model');
var createModel = require('./create-model');

var InnerModel = createModel({
  a: { type: 'string', required: true },
  b: { type: 'string' }
});

describe('embeddedModel (model/util)', function () {
  describe('option validation', function () {
    it('throws when options is not an object', function () {
      expect(function () {
        embeddedModel('nope');
      }).toThrow(/Missing options object/);
    });

    it('throws when options.model is not a function', function () {
      expect(function () {
        embeddedModel({ modelName: 'Inner' });
      }).toThrow(/Missing options\.model/);
    });

    it('throws when options.modelName is missing or empty', function () {
      expect(function () {
        embeddedModel({ model: InnerModel, modelName: '' });
      }).toThrow(/Missing options\.modelName/);
    });

    it('throws when options.required is not a boolean', function () {
      expect(function () {
        embeddedModel({ model: InnerModel, modelName: 'Inner', required: 'yes' });
      }).toThrow(/required should be a boolean/);
    });
  });

  describe('field config shape', function () {
    it('returns a json field config with convert and validate functions', function () {
      var f = embeddedModel({ model: InnerModel, modelName: 'Inner' });
      expect(f.type).toBe('json');
      expect(typeof f.convert).toBe('function');
      expect(typeof f.validate).toBe('function');
    });

    it('passes through dbKey, required and userEditable', function () {
      var f = embeddedModel({
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
      var f = embeddedModel({
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
      convert = embeddedModel({ model: InnerModel, modelName: 'Inner' }).convert;
    });

    it('instantiates the Model from an object value', function () {
      var dst = {};
      convert({ a: 'x' }, { f: { a: 'x' } }, dst, 'f');
      expect(dst.f).toBeInstanceOf(InnerModel);
      expect(dst.f.a).toBe('x');
    });

    it('is a no-op when the source lacks the key', function () {
      var dst = {};
      convert(undefined, {}, dst, 'f');
      expect(Object.prototype.hasOwnProperty.call(dst, 'f')).toBe(false);
    });
  });

  describe('default validate', function () {
    var requiredValidate, optionalValidate;
    beforeEach(function () {
      requiredValidate = embeddedModel({
        model: InnerModel,
        modelName: 'Inner',
        required: true
      }).validate;
      optionalValidate = embeddedModel({ model: InnerModel, modelName: 'Inner' }).validate;
    });

    it('rejects a value that is not a Model instance', function () {
      var err = requiredValidate({ a: 'x' }, { f: { a: 'x' } }, 'f');
      expect(err.f.message).toMatch(/should be an instance of Inner/);
    });

    it('propagates the inner model validation errors', function () {
      var err = requiredValidate(new InnerModel({}), { f: {} }, 'f');
      expect(err.f).toBeTruthy();
      expect(err.f.a).toBeTruthy();
    });

    it('passes for a valid Model instance', function () {
      expect(requiredValidate(new InnerModel({ a: 'x' }), { f: {} }, 'f')).toBeNull();
    });

    it('optional validate returns null when the key is absent', function () {
      expect(optionalValidate(undefined, {}, 'f')).toBeNull();
    });
  });
});
