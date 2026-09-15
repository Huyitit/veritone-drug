'use strict';

var { convert } = require('./converter');

describe('converter.convert — DB→API field mapping (row #1)', function () {
  it('maps all tree-folder fields from src to dst.folderObject when treeFolderId is present', function () {
    var src = {
      treeFolderId: 'tf-001',
      treeFolderName: 'Root Folder',
      treeFolderDescription: 'A top-level tree folder',
      maxDepth: 3,
      hasSubFolder: true
    };
    var dst = {};

    convert(src, dst);

    expect(dst.folderObject).toEqual({
      treeFolderId: 'tf-001',
      name: 'Root Folder',
      description: 'A top-level tree folder',
      maxDepth: 3,
      hasSubFolder: true
    });
  });

  it('sets folderObject fields to undefined when optional src fields are absent', function () {
    var src = { treeFolderId: 'tf-002' };
    var dst = {};

    convert(src, dst);

    expect(dst.folderObject.treeFolderId).toBe('tf-002');
    expect(dst.folderObject.name).toBeUndefined();
    expect(dst.folderObject.description).toBeUndefined();
    expect(dst.folderObject.maxDepth).toBeUndefined();
    expect(dst.folderObject.hasSubFolder).toBeUndefined();
  });

  it('does not set dst.folderObject when dst is falsy', function () {
    var src = { treeFolderId: 'tf-003', treeFolderName: 'Folder' };

    expect(function () { convert(src, null); }).not.toThrow();
  });

  it('does not set dst.folderObject when src.treeFolderId is absent', function () {
    var src = { treeFolderName: 'Folder', treeFolderDescription: 'desc' };
    var dst = {};

    convert(src, dst);

    expect(dst.folderObject).toBeUndefined();
  });
});
