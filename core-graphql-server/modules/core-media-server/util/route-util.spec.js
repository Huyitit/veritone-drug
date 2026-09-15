'use strict';

const {
  parseQueryParam,
  getOrganizationId
} = require('./route-util');

describe('util/route-util', function() {
  describe('parseQueryParam()', function() {
    it('splits a comma-delimited string into trimmed parts', function() {
      const result = parseQueryParam('foo , bar , baz');

      expect(result).toEqual(['foo', 'bar', 'baz']);
    });

    it('returns the input array values as strings', function() {
      const result = parseQueryParam(['alpha', 'beta']);

      expect(result).toEqual(['alpha', 'beta']);
    });
  });

  describe('getOrganizationId()', function() {
    it('returns null when context is falsy', function() {
      expect(getOrganizationId(null)).toBe(null);
      expect(getOrganizationId(undefined)).toBe(null);
    });

    it('returns true for an org-less SSO token (global access)', function() {
      const context = { tokenInfo: {} };
      const result = getOrganizationId(context);

      expect(result).toBe(true);
    });

    it('returns the organizationId from tokenInfo.organization', function() {
      const context = {
        tokenInfo: { organization: { organizationId: 'org-42' } }
      };
      const result = getOrganizationId(context);

      expect(result).toBe('org-42');
    });
  });
});
