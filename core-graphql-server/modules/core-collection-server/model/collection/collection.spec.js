'use strict';

var Collection = require('./collection');
var collectionIndex = require('./index');

describe('Collection model (model/collection)', function () {
  // Row #1 — _postgresConfig field mapping + primaryKey.
  // Regression: if the folder_id -> folderId mapping or primaryKey changed,
  // fromDB() / query builders would map the DB primary key to the wrong JS property.
  describe('_postgresConfig (row #1)', function () {
    it('maps folder_id -> folderId and targets the folder table with folder_id as primary key', function () {
      expect(Collection._postgresConfig).toMatchObject({
        schemaName: 'folder',
        tableName: 'folder',
        primaryKey: 'folder_id',
        fields: { folder_id: 'folderId' }
      });
    });
  });

  // Row #2 — organizationId field presence (type number, not required).
  // Regression: removing organizationId would hand org-scoped query builders
  // `undefined`, risking un-scoped cross-tenant queries.
  describe('organizationId field (row #2)', function () {
    it('declares organizationId as a number field', function () {
      var organizationId = Collection.allFields.find(function (f) {
        return f.key === 'organizationId';
      });
      expect(organizationId).toBeDefined();
      expect(organizationId.type).toBe('number');
    });

    it('lists organizationId among numberFields', function () {
      var numberKeys = Collection.numberFields.map(function (f) {
        return f.key;
      });
      expect(numberKeys).toContain('organizationId');
    });
  });

  // Row #4 — index.js re-export.
  // Regression: if index.js stopped re-exporting Collection, directory importers
  // would receive `undefined`.
  describe('index re-export (row #4)', function () {
    it('re-exports the Collection model from index.js', function () {
      expect(collectionIndex).toBe(Collection);
    });
  });
});
