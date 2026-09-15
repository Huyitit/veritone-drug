'use strict';

// VE-24929 (U-SHARED-CORE, US-P4 / R-X1) — actionable messages for unmet account prerequisites at connect time.
//
// When a user connects a social account that can't publish (e.g. a personal Instagram instead of Business/Creator, a
// Facebook account without Page-admin rights, or a TikTok account that isn't content-eligible), we surface a clear,
// ACTIONABLE message — and deliberately NO guided-onboarding UI (R-X1). This module is the deterministic message layer:
// given a prerequisite category (+ platform), it returns the copy the connect flow throws.
//
// SCOPE NOTE: detecting WHICH category applies from the Ayrshare `GET /user` response (account type, page-admin flags,
// eligibility) is refined by the vendor survey (VE-24935, which blocks this Story). The connect flow
// (destinationOAuth.completeDestinationConnection) calls messageForPrerequisite() once a category is known; wiring the
// Ayrshare-signal -> category detection is the VE-24935 follow-up. Publish-time async vendor errors are surfaced on the
// Job by the engine + Processing Center (U-SHARED-ENGINE / core-job-server), not here.

const PREREQUISITE_CATEGORIES = Object.freeze({
  ACCOUNT_TYPE: 'ACCOUNT_TYPE', // e.g. Instagram must be a Business/Creator account
  PAGE_ADMIN: 'PAGE_ADMIN', // e.g. Facebook requires Page-admin rights
  CONTENT_ELIGIBILITY: 'CONTENT_ELIGIBILITY', // e.g. TikTok content eligibility
  GENERIC: 'GENERIC'
});

// platform (lowercase) -> category -> actionable message. Missing combos fall back to a generic, platform-interpolated
// message. Copy is intentionally instructional-but-brief (no step-by-step onboarding — R-X1).
const MESSAGES = Object.freeze({
  instagram: {
    ACCOUNT_TYPE:
      'This Instagram account must be a Business or Creator account to publish. Convert it in the Instagram app, ' +
      'then reconnect the destination.'
  },
  facebook: {
    PAGE_ADMIN:
      'You must be an admin of the Facebook Page to publish to it. Get Page-admin access, then reconnect the ' +
      'destination.'
  },
  tiktok: {
    CONTENT_ELIGIBILITY:
      "This TikTok account isn't eligible to publish through connected apps. Check your TikTok account settings, " +
      'then reconnect the destination.'
  }
});

function genericMessage(platform) {
  const name = platform ? String(platform) : 'social';
  return (
    `The connected ${name} account doesn't meet the requirements to publish. ` +
    'Check the account and reconnect the destination.'
  );
}

// Return an actionable connect-prerequisite message for a platform + category. Always returns a non-empty string.
function messageForPrerequisite(platform, category) {
  const key = typeof platform === 'string' ? platform.trim().toLowerCase() : '';
  const platformMessages = MESSAGES[key] || {};
  return platformMessages[category] || genericMessage(key || platform);
}

module.exports = { messageForPrerequisite, PREREQUISITE_CATEGORIES };
