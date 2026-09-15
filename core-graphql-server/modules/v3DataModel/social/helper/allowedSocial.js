'use strict';

// VE-24929 (U-SHARED-CORE, BL-1 / BR-1) — server-side `allowedSocial` derivation.
//
// `allowedSocial` restricts the Ayrshare hosted linking page (generateJWT) to a single social network so a
// Destination binds to exactly the network its DestinationType declares (R-A5). It is ALWAYS derived here from the
// DestinationType's `platform` — it is NEVER accepted from the client (BR-1).
//
// `destination_type.platform` is a free-form lowercase string by convention (e.g. 'youtube', 'facebook',
// 'instagram', 'tiktok'). This explicit table maps that platform key to the Ayrshare network key. For the MVP
// platforms the Veritone key and the Ayrshare key are identical, but keeping an explicit table (a) leaves room for
// any future key divergence and (b) gives us a single place to fail-fast on an unseeded/unknown platform.

// BR-1 mapping: destination_type.platform (lowercase) -> Ayrshare allowedSocial network key.
const PLATFORM_TO_ALLOWED_SOCIAL = Object.freeze({
  youtube: 'youtube',
  facebook: 'facebook',
  instagram: 'instagram',
  tiktok: 'tiktok'
});

module.exports = function createAllowedSocial(config) {
  const errors = require('../../../../error/index.js')(config);

  // Derive the single-network `allowedSocial` list for a DestinationType.platform, e.g. 'facebook' -> ['facebook'].
  // Input is normalized to lowercase (the DB convention). Throws a configuration error for an unmapped platform —
  // this should never occur for a seeded type (BR-1).
  function deriveAllowedSocial(platform) {
    const key = typeof platform === 'string' ? platform.trim().toLowerCase() : '';
    const network = PLATFORM_TO_ALLOWED_SOCIAL[key];
    if (!network) {
      throw new errors.InternalServerError({
        message:
          `Destination type platform '${platform}' has no allowedSocial mapping ` +
          `(expected one of: ${Object.keys(PLATFORM_TO_ALLOWED_SOCIAL).join(', ')}).`
      });
    }
    // Exactly one network — the selected type's (BR-1).
    return [network];
  }

  return { deriveAllowedSocial, PLATFORM_TO_ALLOWED_SOCIAL };
};

module.exports.PLATFORM_TO_ALLOWED_SOCIAL = PLATFORM_TO_ALLOWED_SOCIAL;
