'use strict';

var Program = require('./program');

describe('Program model (model/collection/program)', function () {
  // Row #3 — Program.programId type.
  // Regression: if programId were changed from 'number' to 'string', numeric-ID
  // program lookups would be coerced to strings and mismatch SQL comparisons.
  describe('programId type (row #3)', function () {
    it('declares programId as a number field', function () {
      var programId = Program.allFields.find(function (f) {
        return f.key === 'programId';
      });
      expect(programId).toBeDefined();
      expect(programId.type).toBe('number');
    });

    it('lists programId among numberFields and not stringFields', function () {
      expect(
        Program.numberFields.map(function (f) {
          return f.key;
        })
      ).toContain('programId');
      expect(
        Program.stringFields.map(function (f) {
          return f.key;
        })
      ).not.toContain('programId');
    });
  });

  it('exposes programName and programImage as string fields', function () {
    var stringKeys = Program.stringFields.map(function (f) {
      return f.key;
    });
    expect(stringKeys).toContain('programName');
    expect(stringKeys).toContain('programImage');
  });
});
