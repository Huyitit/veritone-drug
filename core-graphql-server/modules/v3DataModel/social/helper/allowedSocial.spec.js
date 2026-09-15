'use strict';

// VE-24929 (U-SHARED-CORE, BR-1) — unit tests for server-side allowedSocial derivation.

const chaiExpect = require('chai').expect;

describe('allowedSocial.js (BR-1)', function () {
  let deriveAllowedSocial;
  let PLATFORM_TO_ALLOWED_SOCIAL;

  beforeEach(function () {
    // The error factory only needs a config; a bare object is sufficient for these unit tests.
    const mod = require('./allowedSocial.js')({});
    deriveAllowedSocial = mod.deriveAllowedSocial;
    PLATFORM_TO_ALLOWED_SOCIAL = mod.PLATFORM_TO_ALLOWED_SOCIAL;
  });

  describe('deriveAllowedSocial', function () {
    // Table-driven: every seeded/MVP platform maps to a single-element list of its network.
    const cases = [
      ['youtube', ['youtube']],
      ['facebook', ['facebook']],
      ['instagram', ['instagram']],
      ['tiktok', ['tiktok']]
    ];

    cases.forEach(function ([platform, expected]) {
      it(`maps '${platform}' -> ${JSON.stringify(expected)} (exactly one network)`, function () {
        const result = deriveAllowedSocial(platform);
        chaiExpect(result).to.deep.equal(expected);
        chaiExpect(result).to.have.lengthOf(1);
      });
    });

    it('normalizes casing/whitespace to the lowercase convention', function () {
      chaiExpect(deriveAllowedSocial('FACEBOOK')).to.deep.equal(['facebook']);
      chaiExpect(deriveAllowedSocial('  Instagram  ')).to.deep.equal(['instagram']);
    });

    it('never returns more than one network', function () {
      Object.keys(PLATFORM_TO_ALLOWED_SOCIAL).forEach(function (platform) {
        chaiExpect(deriveAllowedSocial(platform)).to.have.lengthOf(1);
      });
    });

    [undefined, null, '', '   ', 'linkedin', 'twitter', 'x', 42, {}].forEach(function (bad) {
      it(`rejects unmapped/invalid platform ${JSON.stringify(bad)} with a configuration error`, function () {
        chaiExpect(() => deriveAllowedSocial(bad)).to.throw();
      });
    });
  });

  describe('PLATFORM_TO_ALLOWED_SOCIAL table', function () {
    it('covers the MVP platforms and is immutable', function () {
      chaiExpect(PLATFORM_TO_ALLOWED_SOCIAL).to.include.keys('youtube', 'facebook', 'instagram', 'tiktok');
      chaiExpect(() => {
        PLATFORM_TO_ALLOWED_SOCIAL.linkedin = 'linkedin';
      }).to.throw();
    });
  });
});
