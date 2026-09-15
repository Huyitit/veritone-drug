'use strict';

// VE-25263 — property + example tests for the Profile-Key crypto helper.
// PBT-02 (round-trip), PBT-03 (invariants), PBT-07 (domain generator), PBT-08 (seeded), PBT-10 (examples too).

const fc = require('fast-check');
const createProfileKeyCrypto = require('./profileKeyCrypto.js');

const SEED = 25263;
const serviceContext = { config: { decryptKeyDefault: 'test-platform-key-ve-25263' } };
const pkc = createProfileKeyCrypto(serviceContext);

// Realistic Ayrshare Profile-Key generator (PBT-07): token-like values + boundary cases, not raw noise.
const profileKeyArb = fc.oneof(
  fc.stringMatching(/^[A-Za-z0-9_-]{8,64}$/), // pk-style tokens
  fc.string({ minLength: 1, maxLength: 128 }),
  fc.constantFrom('pk-abc', 'citest-mock-profile-1', 'A', 'x'.repeat(256))
);

describe('profileKeyCrypto (VE-25263)', () => {
  describe('property-based (fast-check)', () => {
    it('PBT-02 round-trip: decrypt(encrypt(k)) === k', () => {
      fc.assert(
        fc.property(profileKeyArb, (k) => {
          expect(pkc.decrypt(pkc.encrypt(k))).toBe(k);
        }),
        { seed: SEED }
      );
    });

    it('PBT-03 HMAC is deterministic: hmac(k) === hmac(k)', () => {
      fc.assert(
        fc.property(profileKeyArb, (k) => {
          expect(pkc.hmac(k)).toBe(pkc.hmac(k));
        }),
        { seed: SEED }
      );
    });

    it('PBT-03 HMAC discriminates: k1 !== k2 => hmac(k1) !== hmac(k2)', () => {
      fc.assert(
        fc.property(profileKeyArb, profileKeyArb, (a, b) => {
          fc.pre(a !== b);
          expect(pkc.hmac(a)).not.toBe(pkc.hmac(b));
        }),
        { seed: SEED }
      );
    });

    it('PBT-03 ciphertext differs from plaintext and is non-deterministic (fresh IV)', () => {
      fc.assert(
        fc.property(profileKeyArb, (k) => {
          const c1 = pkc.encrypt(k);
          const c2 = pkc.encrypt(k);
          expect(c1).not.toBe(k);
          expect(c1).not.toBe(c2); // random IV → different ciphertext each time (why the HMAC column exists)
          expect(pkc.decrypt(c1)).toBe(k);
        }),
        { seed: SEED }
      );
    });
  });

  describe('example-based (PBT-10)', () => {
    it('encrypts to the modern iv::ciphertext format and hides the plaintext', () => {
      const c = pkc.encrypt('pk-abc');
      expect(c).toContain('::');
      expect(c).not.toContain('pk-abc');
    });

    it('decrypt fails closed on a corrupt value', () => {
      expect(() => pkc.decrypt('not-valid-ciphertext')).toThrow();
    });

    it('decrypt fails closed on empty input', () => {
      expect(() => pkc.decrypt('')).toThrow();
    });

    it('encrypt and hmac refuse empty input (never persist empty ciphertext)', () => {
      expect(() => pkc.encrypt('')).toThrow();
      expect(() => pkc.hmac('')).toThrow();
    });

    it('fails closed when no platform key is configured', () => {
      const prior = process.env.CORE_GRAPHQL_DECRYPT_KEY;
      delete process.env.CORE_GRAPHQL_DECRYPT_KEY;
      try {
        const noKey = createProfileKeyCrypto({ config: {} });
        expect(() => noKey.encrypt('pk-abc')).toThrow(/platform encryption key/);
      } finally {
        if (prior !== undefined) process.env.CORE_GRAPHQL_DECRYPT_KEY = prior;
      }
    });
  });
});
