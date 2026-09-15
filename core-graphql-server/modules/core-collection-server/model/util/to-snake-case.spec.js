'use strict';

var toUnderscore = require('./to-snake-case');

describe('toUnderscore (model/util)', function () {
  it('converts a camelCase boundary to snake_case', function () {
    expect(toUnderscore('folderId')).toBe('folder_id');
  });

  it('converts multiple boundaries', function () {
    expect(toUnderscore('ownerOrgId')).toBe('owner_org_id');
  });

  it('prefixes an underscore for a leading capital', function () {
    expect(toUnderscore('FolderId')).toBe('_folder_id');
  });

  it('leaves an all-lowercase key unchanged', function () {
    expect(toUnderscore('name')).toBe('name');
  });

  it('round-trips with toCamelCase for a simple key', function () {
    var toCamelCase = require('./to-camel-case');
    expect(toCamelCase(toUnderscore('folderId'))).toBe('folderId');
  });

  it('throws when given a non-string', function () {
    expect(function () {
      toUnderscore(123);
    }).toThrow('Key should be a string');
  });
});
