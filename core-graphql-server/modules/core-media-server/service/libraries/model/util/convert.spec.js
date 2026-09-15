'use strict';

var url = require('url');
var convert = require('./convert');

describe('convert', function () {
  describe('toURLObject', function () {
    it('parses a valid URL and returns an object with host and pathname', function () {
      var result = convert.toURLObject('http://example.com/path?foo=bar');
      expect(result).toBeTruthy();
      expect(result.host).toBe('example.com');
      expect(result.pathname).toBe('/path');
    });

    it('attaches a toString helper that formats the URL', function () {
      var result = convert.toURLObject('http://example.com/path?foo=bar');
      expect(typeof result.toString).toBe('function');
      expect(result.toString()).toContain('example.com');
    });

    it('strips X-Amz-* signature parameters from the query', function () {
      var result = convert.toURLObject(
        'http://example.com/file?X-Amz-Signature=abc&X-Amz-Expires=3600&keep=1'
      );
      expect(result.query).not.toHaveProperty('X-Amz-Signature');
      expect(result.query).not.toHaveProperty('X-Amz-Expires');
      expect(result.query).toHaveProperty('keep', '1');
    });

    it('sets search to null when all params are stripped', function () {
      var result = convert.toURLObject('http://example.com/file?X-Amz-Signature=abc');
      expect(result.search).toBeNull();
    });

    it('returns false for null input', function () {
      expect(convert.toURLObject(null)).toBe(false);
    });
  });

  describe('dateTimeToJSON', function () {
    it('returns undefined for null', function () {
      expect(convert.dateTimeToJSON(null)).toBeUndefined();
    });

    it('returns undefined for undefined', function () {
      expect(convert.dateTimeToJSON(undefined)).toBeUndefined();
    });

    it('returns undefined for 0', function () {
      expect(convert.dateTimeToJSON(0)).toBeUndefined();
    });

    it('converts epoch seconds to an ISO 8601 string', function () {
      var result = convert.dateTimeToJSON(1000);
      expect(result).toBe(new Date(1000 * 1000).toISOString());
    });

    it('produces a string matching ISO 8601 format', function () {
      var result = convert.dateTimeToJSON(1500000000);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('toSignedURL', function () {
    it('returns null unchanged when val is null', function () {
      expect(convert.toSignedURL(null, jest.fn())).toBeNull();
    });

    it('returns undefined unchanged when val is undefined', function () {
      expect(convert.toSignedURL(undefined, jest.fn())).toBeUndefined();
    });

    it('returns string val unchanged when signer is not a function', function () {
      expect(convert.toSignedURL('http://example.com/file', null)).toBe('http://example.com/file');
      expect(convert.toSignedURL('http://example.com/file', 'not-a-fn')).toBe('http://example.com/file');
    });

    it('calls signer function with the string val and returns the result', function () {
      var signer = jest.fn(function (v) {
        return v + '?signed=1';
      });
      var result = convert.toSignedURL('http://example.com/file', signer);
      expect(signer).toHaveBeenCalledWith('http://example.com/file');
      expect(result).toBe('http://example.com/file?signed=1');
    });

    it('extracts href from a url.Url instance before passing to signer', function () {
      var parsed = url.parse('http://example.com/path');
      var signer = jest.fn(function (v) {
        return v;
      });
      convert.toSignedURL(parsed, signer);
      expect(signer).toHaveBeenCalledWith(parsed.href);
    });

    it('returns the href string unchanged from a url.Url instance when no signer', function () {
      var parsed = url.parse('http://example.com/path');
      var result = convert.toSignedURL(parsed, null);
      expect(result).toBe(parsed.href);
    });
  });

  describe('extractMimeType', function () {
    it('returns null for null input', function () {
      expect(convert.extractMimeType(null)).toBeNull();
    });

    it('returns null for empty string', function () {
      expect(convert.extractMimeType('')).toBeNull();
    });

    it('extracts the mime type from a bare content-type', function () {
      expect(convert.extractMimeType('video/mp4')).toBe('video/mp4');
      expect(convert.extractMimeType('image/jpeg')).toBe('image/jpeg');
    });

    it('strips parameters after a semicolon', function () {
      expect(convert.extractMimeType('text/html; charset=utf-8')).toBe('text/html');
    });

    it('normalizes audio/mpeg to audio/mp3', function () {
      expect(convert.extractMimeType('audio/mpeg')).toBe('audio/mp3');
    });

    it('normalizes audio/mpeg3 to audio/mp3', function () {
      expect(convert.extractMimeType('audio/mpeg3')).toBe('audio/mp3');
    });

    it('leaves audio/mp3 unchanged', function () {
      expect(convert.extractMimeType('audio/mp3')).toBe('audio/mp3');
    });

    it('returns null for a string that does not match mime type pattern', function () {
      expect(convert.extractMimeType('not-a-mime')).toBeNull();
    });
  });
});
