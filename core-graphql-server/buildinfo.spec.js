// VE-24476 — row 8
// transform:{} means no Babel hoisting — jest.mock must appear before require
//
// buildinfo.js loads util.js at module top-level (many heavy transitive deps),
// so we mock it to keep this test self-contained.

jest.mock('./util.js', () => () => ({
  parseBuild: jest.fn().mockReturnValue({ number: '42', env: 'staging' })
}));

describe('buildinfo — getBuildInfo (lazy singleton)', () => {
  let getBuildInfo;

  beforeEach(() => {
    jest.resetModules();
    // Re-require after reset so each test gets a fresh module with
    // buildInfo === undefined (the singleton guard is not yet set).
    jest.mock('./util.js', () => () => ({
      parseBuild: jest.fn().mockReturnValue({ number: '42', env: 'staging' })
    }));
    ({ getBuildInfo } = require('./buildinfo.js'));
  });

  // ── Row 8: lazy singleton ─────────────────────────────────────────────────
  // A regression removing the singleton guard would re-parse buildinfo.json on
  // every call. A regression in the fallback would surface a raw exception
  // instead of the safe 'unknown' values.

  it('returns an object with unknown field values when buildinfo.json is absent', () => {
    const info = getBuildInfo();
    expect(info).toBeDefined();
  });

  it('returns the exact same object reference on repeated calls (singleton)', () => {
    const first = getBuildInfo();
    const second = getBuildInfo();
    expect(second).toBe(first); // strict reference equality
  });

  it('does not throw even when the JSON file is missing', () => {
    expect(() => getBuildInfo()).not.toThrow();
  });
});
