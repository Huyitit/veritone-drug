'use strict';

// VE-24929 (U-SHARED-CORE, BL-1 / BR-5) — social-destination connect gating (white-label fallback).
//
// A social platform's connect entry stays OFF in prod until Ayrshare white-label is configured for that network, so
// we never surface vendor (Ayrshare) branding on the hosted linking page. Enablement is driven by a single feature
// flag `enabledDestinationConnects` — an array of lowercase Ayrshare platform keys (e.g. ['facebook', 'instagram']).
// A platform's connect is enabled iff its key is present in that array; enabling a new platform is therefore a
// remote-config change, not a code change / new flag. YouTube (pre-existing VP-2581 behavior) is always enabled and
// is never gated. FE mock work is unaffected by this server-side gate.

const _ = require('lodash');

const ENABLED_CONNECTS_FLAG = 'enabledDestinationConnects';

// Platforms whose connect entry is always enabled, regardless of the gate (pre-existing, no white-label concern).
const ALWAYS_ENABLED_PLATFORMS = Object.freeze(['youtube']);

function normalize(platform) {
  return typeof platform === 'string' ? platform.trim().toLowerCase() : '';
}

module.exports = function createDestinationConnectPolicy(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../../../../error/index.js')(config);

  // True when a destination of this platform may be connected in the current environment.
  function isConnectEnabled(platform) {
    const key = normalize(platform);
    if (!key) {
      return false;
    }
    if (ALWAYS_ENABLED_PLATFORMS.includes(key)) {
      // Always on (youtube / pre-existing). Unknown platforms are rejected upstream by BR-1.
      return true;
    }
    const enabled = _.get(config, ['featureFlags', ENABLED_CONNECTS_FLAG], []);
    if (!Array.isArray(enabled)) {
      return false;
    }
    return enabled.map(normalize).includes(key);
  }

  // Throw a NotAllowed error if this platform's connect entry is gated OFF (BR-5).
  function assertConnectEnabled(platform) {
    if (!isConnectEnabled(platform)) {
      throw new errors.NotAllowed({
        message:
          `Connecting a '${platform}' destination is not enabled in this environment ` +
          `(pending Ayrshare white-label configuration).`
      });
    }
  }

  return { isConnectEnabled, assertConnectEnabled, ENABLED_CONNECTS_FLAG, ALWAYS_ENABLED_PLATFORMS };
};

module.exports.ENABLED_CONNECTS_FLAG = ENABLED_CONNECTS_FLAG;
module.exports.ALWAYS_ENABLED_PLATFORMS = ALWAYS_ENABLED_PLATFORMS;
