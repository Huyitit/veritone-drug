/* global describe, it, expect */
'use strict';

const initSubquery = require('./library-type.subquery');

describe('libraries.dal.library-type.subquery:', function () {
  it('throws when schemaName is not provided', function () {
    expect(function () {
      initSubquery();
    }).toThrow('schemaName is required');
  });

  it('returns SQL string that references the provided schemaName table', function () {
    const sql = initSubquery('myschema');
    expect(sql).toContain('myschema.library_type__entity_identifier_type');
  });

  it('returns SQL that groups results by library_type_id', function () {
    const sql = initSubquery('myschema');
    expect(sql).toContain('library_type_id');
  });
});
