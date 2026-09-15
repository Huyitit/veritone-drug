'use strict';

var TreeObjectUpdate = require('./tree-object-update');

// A syntactically valid v4-style UUID (matches the module's uuidRegex).
var VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('TreeObjectUpdate model (model/tree-object-update)', function () {
  it('exposes the documented field set', function () {
    var keys = TreeObjectUpdate.allFields.map(function (f) {
      return f.key;
    });
    expect(keys).toEqual(
      expect.arrayContaining([
        'treeObjectId',
        'newParentTreeObjectId',
        'newOrderIndex',
        'prevParentTreeObjectId',
        'prevOrderIndex',
        'parentTreeObjectId',
        'orderIndex',
        'newTreeFolderName'
      ])
    );
  });

  it('categorizes fields by type (uuid / number / string)', function () {
    var uuidKeys = TreeObjectUpdate.uuidFields.map(function (f) {
      return f.key;
    });
    var numberKeys = TreeObjectUpdate.numberFields.map(function (f) {
      return f.key;
    });
    var stringKeys = TreeObjectUpdate.stringFields.map(function (f) {
      return f.key;
    });

    expect(uuidKeys).toEqual(
      expect.arrayContaining([
        'treeObjectId',
        'newParentTreeObjectId',
        'prevParentTreeObjectId',
        'parentTreeObjectId'
      ])
    );
    expect(numberKeys).toEqual(
      expect.arrayContaining(['newOrderIndex', 'prevOrderIndex', 'orderIndex'])
    );
    expect(stringKeys).toContain('newTreeFolderName');
  });

  it('marks treeObjectId as the only required field', function () {
    expect(TreeObjectUpdate.requiredFields).toEqual({ treeObjectId: true });
  });

  describe('validate()', function () {
    it('returns an error when required treeObjectId is missing', function () {
      var errors = new TreeObjectUpdate({}).validate();
      expect(errors).not.toBeNull();
      expect(errors.treeObjectId).toBeTruthy();
    });

    it('returns an error when treeObjectId is not a valid uuid', function () {
      var errors = new TreeObjectUpdate({ treeObjectId: 'not-a-uuid' }).validate();
      expect(errors).not.toBeNull();
      expect(errors.treeObjectId).toBeTruthy();
    });

    it('passes validation for a valid uuid treeObjectId', function () {
      var errors = new TreeObjectUpdate({ treeObjectId: VALID_UUID }).validate();
      expect(errors).toBeNull();
    });
  });
});
