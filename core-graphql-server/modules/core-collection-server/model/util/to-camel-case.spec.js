'use strict';

var toCamelCase = require('./to-camel-case');

describe('toCamelCase (model/util)', function () {
  it('converts a single snake_case boundary', function () {
    expect(toCamelCase('folder_id')).toBe('folderId');
  });

  it('converts multiple boundaries', function () {
    expect(toCamelCase('owner_org_id')).toBe('ownerOrgId');
  });

  it('drops the underscore at a digit boundary (digit unchanged)', function () {
    expect(toCamelCase('field_2')).toBe('field2');
  });

  it('uppercases after a leading underscore', function () {
    expect(toCamelCase('_id')).toBe('Id');
  });

  it('leaves a plain key with no underscores unchanged', function () {
    expect(toCamelCase('name')).toBe('name');
  });

  it('leaves a trailing underscore (not followed by alphanumeric) unchanged', function () {
    expect(toCamelCase('foo_')).toBe('foo_');
  });

  it('throws when given a non-string', function () {
    expect(function () {
      toCamelCase(123);
    }).toThrow('Key should be a string');
  });
});
