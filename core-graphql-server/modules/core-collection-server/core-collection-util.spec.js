'use strict';

var configure = require('./core-collection-util');

var mockConfig = { env: 'test' };
var mockLogger = { log: function () {}, error: function () {} };
var util = configure(mockConfig, mockLogger);

describe('core-collection-util', function () {
  describe('configure factory (row #1)', function () {
    it('returns an object with expected utility methods', function () {
      expect(typeof util).toBe('object');
      expect(typeof util.getMentionSnippetText).toBe('function');
      expect(typeof util.getShareButtonText).toBe('function');
      expect(typeof util.errorToFolderErrorObject).toBe('function');
      expect(typeof util.convertToPlainObject).toBe('function');
    });
  });

  describe('getMentionSnippetText', function () {
    it('returns null when mention is not an object (row #2)', function () {
      expect(util.getMentionSnippetText(null)).toBeNull();
      expect(util.getMentionSnippetText('string')).toBeNull();
      expect(util.getMentionSnippetText(42)).toBeNull();
    });

    it('uses userSnippets over mentionSnippets when both are present (row #3)', function () {
      var mention = {
        userSnippets: [{ text: 'user text' }],
        mentionSnippets: [{ text: 'mention text' }]
      };
      var result = util.getMentionSnippetText(mention);
      expect(result).toBe('user text');
    });
  });

  describe('getShareButtonText', function () {
    it('returns Watch for TV/YouTube and Listen to for Radio/Podcast mediaSourceTypeId (row #4)', function () {
      expect(util.getShareButtonText({ mediaSourceTypeId: '2' })).toBe('Watch');
      expect(util.getShareButtonText({ mediaSourceTypeId: '3' })).toBe('Watch');
      expect(util.getShareButtonText({ mediaSourceTypeId: '1' })).toBe('Listen to');
      expect(util.getShareButtonText({ mediaSourceTypeId: '4' })).toBe('Listen to');
    });
  });

  describe('errorToFolderErrorObject', function () {
    it('returns httpStatus 403 for read_access_only errorType (row #5)', function () {
      var err = { message: 'not allowed', errorType: 'read_access_only' };
      var result = util.errorToFolderErrorObject(err);
      expect(result.httpStatus).toBe(403);
      expect(result.errorType).toBe('read_access_only');
    });
  });

  describe('convertToPlainObject', function () {
    it('returns a Date instance unchanged by the skip guard (row #6)', function () {
      var date = new Date(2024, 0, 1);
      var result = util.convertToPlainObject(date);
      expect(result).toBe(date);
    });
  });
});
