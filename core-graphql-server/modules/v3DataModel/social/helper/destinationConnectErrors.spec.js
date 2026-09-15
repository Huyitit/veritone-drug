'use strict';

// VE-24929 (U-SHARED-CORE, US-P4 / R-X1) — unit tests for connect-prerequisite message mapping.

const chaiExpect = require('chai').expect;
const { messageForPrerequisite, PREREQUISITE_CATEGORIES } = require('./destinationConnectErrors.js');

describe('destinationConnectErrors.js (US-P4 / R-X1)', function () {
  describe('messageForPrerequisite', function () {
    it('returns the Instagram Business/Creator message', function () {
      const msg = messageForPrerequisite('instagram', PREREQUISITE_CATEGORIES.ACCOUNT_TYPE);
      chaiExpect(msg).to.match(/Business or Creator/i);
      chaiExpect(msg).to.match(/reconnect/i);
    });

    it('returns the Facebook Page-admin message', function () {
      const msg = messageForPrerequisite('facebook', PREREQUISITE_CATEGORIES.PAGE_ADMIN);
      chaiExpect(msg).to.match(/Page-admin/i);
    });

    it('returns the TikTok eligibility message', function () {
      const msg = messageForPrerequisite('tiktok', PREREQUISITE_CATEGORIES.CONTENT_ELIGIBILITY);
      chaiExpect(msg).to.match(/eligible/i);
    });

    it('is actionable and contains no guided-onboarding step list (R-X1)', function () {
      const msg = messageForPrerequisite('instagram', PREREQUISITE_CATEGORIES.ACCOUNT_TYPE);
      // No numbered step list ("1.", "Step 1") — a clear instruction, not an onboarding wizard.
      chaiExpect(msg).to.not.match(/step\s*1|^\s*1\./i);
    });

    it('normalizes platform casing', function () {
      chaiExpect(messageForPrerequisite('Instagram', PREREQUISITE_CATEGORIES.ACCOUNT_TYPE)).to.match(
        /Business or Creator/i
      );
    });

    it('falls back to a generic, platform-named message for an unmapped platform/category', function () {
      const msg = messageForPrerequisite('linkedin', PREREQUISITE_CATEGORIES.ACCOUNT_TYPE);
      chaiExpect(msg).to.match(/linkedin/i);
      chaiExpect(msg).to.match(/requirements to publish/i);
      // A generic-category request for a known platform also falls back cleanly.
      chaiExpect(messageForPrerequisite('facebook', PREREQUISITE_CATEGORIES.GENERIC)).to.be.a('string').with.length
        .greaterThan(0);
    });

    it('never returns an empty string', function () {
      chaiExpect(messageForPrerequisite(undefined, undefined)).to.be.a('string').with.length.greaterThan(0);
    });
  });
});
