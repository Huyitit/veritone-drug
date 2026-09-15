'use strict';

// VE-25263 — transit encryption for engine-bound scoped secrets.
//
// The distribute engine fetches a decrypted secret (the Ayrshare Profile-Key) from core via
// destinationVendorProfile. TLS protects the outer connection, but the value crosses several internal hops in
// cleartext once TLS terminates. This wraps the value in an application-layer envelope encrypted with a secret
// shared only by core and the engine (config.engineTransitSecret), so intermediate hops — and callers holding
// a forged engine token but not the shared secret — see ciphertext only. The engine holds the same secret and
// decrypts. See PR #4457 discussion and ADR-0001.
//
// Scheme: AES-256-GCM (authenticated). Envelope `iv::ciphertext::authTag`, each segment base64. The 32-byte
// key is derived from the shared secret via SHA-256 (domain-separated), so the configured secret may be any
// string. Fail-closed: no secret, or empty input, throws — never returns plaintext. Never logs the value.

const _ = require('lodash');
const crypto = require('crypto');

const KEY_LABEL = 'engine.transit.v1';
const IV_BYTES = 12; // GCM standard nonce length

module.exports = function createTransitCrypto(serviceContext) {
  const { config } = serviceContext;

  function sharedSecret() {
    const secret = process.env.ENGINE_TRANSIT_SECRET || _.get(config, 'engineTransitSecret');
    if (!secret) {
      throw new Error('transitCrypto: engine transit secret is not configured');
    }
    return secret;
  }

  // Derived, domain-separated 32-byte key — never the raw configured secret.
  function key() {
    return crypto.createHash('sha256').update(`${sharedSecret()}:${KEY_LABEL}`).digest();
  }

  // Encrypt a plaintext secret for the engine -> `iv::ciphertext::authTag` (base64 segments).
  function encryptForEngine(plaintext) {
    if (_.isNil(plaintext) || plaintext === '') {
      throw new Error('transitCrypto.encryptForEngine: refusing to encrypt an empty value');
    }
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    let ciphertext = cipher.update(String(plaintext), 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}::${ciphertext}::${authTag.toString('base64')}`;
  }

  // Inverse of encryptForEngine — the reference the engine (VE-25611) mirrors; used by tests. Fail-closed on a
  // malformed envelope or a failed auth-tag check (tamper/wrong-key).
  function decrypt(envelope) {
    const [ivB64, ciphertextB64, authTagB64] = String(envelope || '').split('::');
    if (!ivB64 || !ciphertextB64 || !authTagB64) {
      throw new Error('transitCrypto.decrypt: malformed envelope');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    let plaintext = decipher.update(ciphertextB64, 'base64', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  }

  return { encryptForEngine, decrypt };
};
