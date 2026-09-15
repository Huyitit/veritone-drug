'use strict';

// VE-24929 (U-SHARED-CORE, BR-5) — unit tests for social-destination connect gating.
// Gating is driven by the single `enabledDestinationConnects` array flag.

const chaiExpect = require('chai').expect;

describe('destinationConnectPolicy.js (BR-5)', function () {
  function makePolicy(enabledDestinationConnects) {
    const featureFlags = enabledDestinationConnects === undefined ? {} : { enabledDestinationConnects };
    return require('./destinationConnectPolicy.js')({ config: { featureFlags } });
  }

  describe('isConnectEnabled', function () {
    it('always enables youtube (never gated)', function () {
      chaiExpect(makePolicy([]).isConnectEnabled('youtube')).to.equal(true);
    });

    ['facebook', 'instagram', 'tiktok'].forEach(function (platform) {
      it(`gates ${platform} OFF by default (empty array — white-label not configured)`, function () {
        chaiExpect(makePolicy([]).isConnectEnabled(platform)).to.equal(false);
      });
    });

    it('missing flag defaults to gated OFF', function () {
      chaiExpect(makePolicy(undefined).isConnectEnabled('facebook')).to.equal(false);
    });

    it('enables only the platforms present in the array', function () {
      const policy = makePolicy(['facebook']);
      chaiExpect(policy.isConnectEnabled('facebook')).to.equal(true);
      chaiExpect(policy.isConnectEnabled('instagram')).to.equal(false);
    });

    it('enables multiple platforms listed in the array', function () {
      const policy = makePolicy(['facebook', 'tiktok']);
      chaiExpect(policy.isConnectEnabled('facebook')).to.equal(true);
      chaiExpect(policy.isConnectEnabled('tiktok')).to.equal(true);
      chaiExpect(policy.isConnectEnabled('instagram')).to.equal(false);
    });

    it('enables a future platform purely by array membership (no code change)', function () {
      chaiExpect(makePolicy(['linkedin']).isConnectEnabled('linkedin')).to.equal(true);
    });

    it('normalizes casing on both the array entries and the argument', function () {
      chaiExpect(makePolicy(['TikTok']).isConnectEnabled('tiktok')).to.equal(true);
      chaiExpect(makePolicy(['tiktok']).isConnectEnabled('TikTok')).to.equal(true);
    });

    it('returns false for a non-string / empty platform', function () {
      chaiExpect(makePolicy(['facebook']).isConnectEnabled('')).to.equal(false);
      chaiExpect(makePolicy(['facebook']).isConnectEnabled(null)).to.equal(false);
    });

    it('tolerates a non-array flag value (gated OFF)', function () {
      chaiExpect(makePolicy('facebook').isConnectEnabled('facebook')).to.equal(false);
    });
  });

  describe('assertConnectEnabled', function () {
    it('does not throw when enabled', function () {
      chaiExpect(() => makePolicy([]).assertConnectEnabled('youtube')).to.not.throw();
      chaiExpect(() => makePolicy(['instagram']).assertConnectEnabled('instagram')).to.not.throw();
    });

    it('throws when the platform is gated off', function () {
      chaiExpect(() => makePolicy([]).assertConnectEnabled('facebook')).to.throw();
    });
  });
});
