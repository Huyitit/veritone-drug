'use strict';

/**
 * Assets store duration as `metadata.mediaDuration` in SECONDS; the API exposes `mediaDurationMs`. VE-26450 made
 * that field authoritative for both the server's duration check and the client's, which only holds while both
 * derive it identically — so the conversion lives here rather than at each call site.
 *
 * `0` and any sub-millisecond value both return `0`, which is finite and so indistinguishable from a real
 * measurement; whether that is a usable duration is the caller's policy.
 */
function secondsToMs(seconds) {
  return seconds ? Math.round(seconds * 1000) : seconds;
}

module.exports = { secondsToMs };
