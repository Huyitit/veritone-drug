'use strict';

var CollectionBulkQuery = require('./collection-bulk-query');

describe('CollectionBulkQuery model', function () {
  // Row #1 (security-coverage): organizationId presence + length guards prevent cross-tenant queries
  describe('organizationId validation', function () {
    it('rejects a missing organizationId to enforce tenant isolation', function () {
      var instance = new CollectionBulkQuery({ collectionId: [1] });

      var errors = instance.validate();

      expect(errors).not.toBeNull();
      expect(errors.organizationId).toBeTruthy();
    });
  });

  // Row #2: valid integer array passes the collectionId validator
  describe('validateCollectionId — valid array', function () {
    it('returns null for an array of valid integer collectionIds', function () {
      var instance = new CollectionBulkQuery({
        collectionId: [1, 2, 3],
        organizationId: 'org-1'
      });

      var errors = instance.validate();

      expect(errors).toBeNull();
    });
  });

  // Row #3: NaN element in collectionId array is rejected
  describe('validateCollectionId — NaN element', function () {
    it('returns an error when a collectionId array contains a NaN element', function () {
      var instance = new CollectionBulkQuery({
        collectionId: [NaN, 1],
        organizationId: 'org-1'
      });

      var errors = instance.validate();

      expect(errors).not.toBeNull();
      expect(errors.collectionId).toBeTruthy();
    });
  });

  // Row #4: Infinity element in collectionId array is rejected
  describe('validateCollectionId — Infinity element', function () {
    it('returns an error when a collectionId array contains Infinity', function () {
      var instance = new CollectionBulkQuery({
        collectionId: [Infinity, 1],
        organizationId: 'org-1'
      });

      var errors = instance.validate();

      expect(errors).not.toBeNull();
      expect(errors.collectionId).toBeTruthy();
    });
  });

  // Row #5: non-array value (bare number) is not converted to an array and triggers the else branch
  describe('validateCollectionId — non-array value', function () {
    it('returns an error when collectionId is a non-array value after conversion', function () {
      var instance = new CollectionBulkQuery({
        collectionId: 123,
        organizationId: 'org-1'
      });

      var errors = instance.validate();

      expect(errors).not.toBeNull();
      expect(errors.collectionId).toHaveProperty(
        'message',
        'should be a String or Array of Strings'
      );
    });
  });
});
