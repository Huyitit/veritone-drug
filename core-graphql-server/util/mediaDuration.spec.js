const { secondsToMs } = require('./mediaDuration.js');

// VE-26450 — this conversion is shared by resolvers/Asset.js (which exposes Asset.fileData.mediaDurationMs) and
// by the distributeAsset pre-flight duration check. Decision 4 made that field the single source of truth for
// both the server and the client, which only holds while both derive it identically — so these tests guard the
// conversion itself, not just its callers.
describe('util/mediaDuration.js', function () {
  it('converts seconds to whole milliseconds', function () {
    expect(secondsToMs(13.145)).toEqual(13145);
    expect(secondsToMs(3197.06)).toEqual(3197060);
  });

  it('rounds rather than truncating, so the server and client agree at sub-ms precision', function () {
    expect(secondsToMs(901.1234)).toEqual(901123);
    expect(secondsToMs(901.1236)).toEqual(901124);
    expect(secondsToMs(0.0005)).toEqual(1);
  });

  it('passes nullish through unchanged so "not probed yet" stays distinguishable from a measurement', function () {
    expect(secondsToMs(null)).toEqual(null);
    expect(secondsToMs(undefined)).toEqual(undefined);
  });

  it('returns 0 for zero and for sub-millisecond input — a finite value, NOT a nullish one', function () {
    // Deliberately recorded rather than assumed: 0 is a finite number, so it survives any isFinite() guard and
    // is indistinguishable here from a real measurement. Deciding that a non-positive duration is UNKNOWN is the
    // caller's policy (bll/mediaConstraintPolicy.js), not this function's — enforcing it as a measurement
    // rejected publishes the vendor accepts.
    expect(secondsToMs(0)).toEqual(0);
    expect(secondsToMs(0.0004)).toEqual(0);
    expect(Number.isFinite(secondsToMs(0))).toBe(true);
  });
});
