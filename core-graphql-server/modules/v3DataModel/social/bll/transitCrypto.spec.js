'use strict';

// VE-25263 — property + example tests for the engine transit-encryption helper (PR #4457).
// Covers: round-trip under the shared secret, non-deterministic ciphertext, authenticated-tamper detection,
// wrong-secret rejection, and fail-closed behavior (unset secret / empty input / malformed envelope).

const fc = require('fast-check');
const createTransitCrypto = require('./transitCrypto.js');

const SEED = 25263;
const tc = createTransitCrypto({ config: { engineTransitSecret: 'test-transit-secret-ve-25263' } });

// Realistic Profile-Key-style values plus boundary cases.
const secretArb = fc.oneof(
  fc.stringMatching(/^[A-Za-z0-9_-]{8,64}$/),
  fc.string({ minLength: 1, maxLength: 128 }),
  fc.constantFrom('pk-abc', 'citest-mock-profile-1', 'A', 'x'.repeat(256))
);

describe('transitCrypto (VE-25263)', () => {
  describe('property-based (fast-check)', () => {
    it('round-trip: decrypt(encryptForEngine(k)) === k', () => {
      fc.assert(
        fc.property(secretArb, (k) => {
          expect(tc.decrypt(tc.encryptForEngine(k))).toBe(k);
        }),
        { seed: SEED }
      );
    });

    it('ciphertext differs from plaintext and is non-deterministic (fresh IV)', () => {
      fc.assert(
        fc.property(secretArb, (k) => {
          const c1 = tc.encryptForEngine(k);
          const c2 = tc.encryptForEngine(k);
          expect(c1).not.toBe(k);
          expect(c1).not.toBe(c2);
          expect(tc.decrypt(c1)).toBe(k);
        }),
        { seed: SEED }
      );
    });
  });

  describe('example-based', () => {
    it('produces the iv::ciphertext::authTag envelope', () => {
      const env = tc.encryptForEngine('pk-abc');
      expect(env.split('::')).toHaveLength(3);
      expect(env).not.toContain('pk-abc');
    });

    it('a different shared secret cannot decrypt (authenticated) — fails closed', () => {
      const env = tc.encryptForEngine('pk-abc');
      const other = createTransitCrypto({ config: { engineTransitSecret: 'a-different-secret' } });
      expect(() => other.decrypt(env)).toThrow();
    });

    it('detects tampering — a mutated ciphertext segment fails the auth tag', () => {
      const [iv, ct, tag] = tc.encryptForEngine('pk-abc').split('::');
      const flipped = ct[0] === 'A' ? `B${ct.slice(1)}` : `A${ct.slice(1)}`;
      expect(() => tc.decrypt(`${iv}::${flipped}::${tag}`)).toThrow();
    });

    it('decrypt fails closed on a malformed envelope', () => {
      expect(() => tc.decrypt('not-an-envelope')).toThrow(/malformed/);
      expect(() => tc.decrypt('')).toThrow(/malformed/);
    });

    it('encryptForEngine refuses empty input', () => {
      expect(() => tc.encryptForEngine('')).toThrow();
      expect(() => tc.encryptForEngine(null)).toThrow();
    });

    it('fails closed when the shared secret is not configured', () => {
      const prior = process.env.ENGINE_TRANSIT_SECRET;
      delete process.env.ENGINE_TRANSIT_SECRET;
      try {
        const noSecret = createTransitCrypto({ config: {} });
        expect(() => noSecret.encryptForEngine('pk-abc')).toThrow(/transit secret/);
      } finally {
        if (prior !== undefined) process.env.ENGINE_TRANSIT_SECRET = prior;
      }
    });
  });
});
