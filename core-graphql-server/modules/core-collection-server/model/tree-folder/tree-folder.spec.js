'use strict';

var TreeFolder = require('./tree-folder');

// A valid base instance satisfying all required fields.
var BASE = {
  treeFolderName: 'My Tree Folder',
  parentTreeObjectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
};

describe('TreeFolder model — schema (row #2)', function () {
  it('exposes the expected fields', function () {
    var fieldKeys = TreeFolder.allFields.map(function (f) { return f.key; });

    expect(fieldKeys).toContain('treeFolderName');
    expect(fieldKeys).toContain('treeFolderDescription');
    expect(fieldKeys).toContain('treeFolderId');
    expect(fieldKeys).toContain('parentTreeObjectId');
    expect(fieldKeys).toContain('userId');
    expect(fieldKeys).toContain('orderIndex');
    expect(fieldKeys).toContain('organizationId');
    expect(fieldKeys).toContain('maxDepth');
    expect(fieldKeys).toContain('hasSubFolder');
    expect(fieldKeys).toContain('treeObjectTypeId');
    expect(fieldKeys).toContain('treeObjectId');
  });

  it('marks treeFolderName and parentTreeObjectId as required', function () {
    expect(TreeFolder.requiredFields).toMatchObject({
      treeFolderName: true,
      parentTreeObjectId: true
    });
  });

  it('returns null validation for an instance with all required fields present', function () {
    var instance = new TreeFolder(BASE);

    expect(instance.validate()).toBeNull();
  });

  it('returns a validation error when treeFolderName is absent', function () {
    var instance = new TreeFolder({ parentTreeObjectId: BASE.parentTreeObjectId });

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.treeFolderName).toBeTruthy();
  });

  it('returns a validation error when parentTreeObjectId is absent', function () {
    var instance = new TreeFolder({ treeFolderName: BASE.treeFolderName });

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.parentTreeObjectId).toBeTruthy();
  });
});

describe('tree-folder/index.js — re-exports (row #3)', function () {
  it('re-exports TreeFolder as the module default', function () {
    expect(require('./index')).toBe(TreeFolder);
  });
});
