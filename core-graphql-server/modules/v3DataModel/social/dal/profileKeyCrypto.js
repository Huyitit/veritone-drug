'use strict';

// VE-25263 — Ayrshare Profile-Key crypto (business-rules BR-1..BR-5).
//
// Single, auditable home for encrypt / decrypt / HMAC of the `destination.vendor_profile_id` bearer credential
// (SECURITY-11: isolate security-critical logic instead of scattering it through the DAL). Thin wrapper over the
// platform helper (@veritone/core-server-base/util.js) — the same aes-256-cbc, `iv::ciphertext` scheme used for
// external_credential / PRIMARY_API_KEY. (Moving the shared helper to authenticated encryption / AES-256-GCM is
// tracked separately in VE-25644.)
//
// Key material: the platform key resolves CORE_GRAPHQL_DECRYPT_KEY -> config.s3.fileId ->
// config.decryptKeyDefault (the existing external_credential/s3Util precedent). The HMAC uses a DERIVED subkey
// (domain separation — never MAC with the raw encryption key; DECISION-1). Nothing here logs the key or cipher.

const _ = require('lodash');
const crypto = require('crypto');
const { encryptObject, decryptObject } = require('@veritone/core-server-base/util.js')();

const HMAC_LABEL = 'vendor_profile_id.hmac.v1';

module.exports = function createProfileKeyCrypto(serviceContext) {
  const { config } = serviceContext;

  function platformKey() {
    const key =
      process.env.CORE_GRAPHQL_DECRYPT_KEY ||
      _.get(config, 's3.fileId') ||
      _.get(config, 'decryptKeyDefault');
    if (!key) {
      // Fail closed: without a key we cannot protect the credential — never fall back to plaintext.
      throw new Error('profileKeyCrypto: platform encryption key is not configured');
    }
    return key;
  }

  // Derived, domain-separated HMAC subkey — distinct from the AES key encryptObject derives from platformKey.
  function hmacKey() {
    return crypto.createHash('sha256').update(`${platformKey()}:${HMAC_LABEL}`).digest();
  }

  // Encrypt a Profile-Key string -> `iv::ciphertext`. Refuses empty input (never persist empty ciphertext).
  function encrypt(plaintextKey) {
    if (_.isNil(plaintextKey) || plaintextKey === '') {
      throw new Error('profileKeyCrypto.encrypt: refusing to encrypt an empty Profile-Key');
    }
    return encryptObject(plaintextKey, platformKey(), 'aes-256-cbc');
  }

  // Decrypt stored ciphertext -> plaintext. Fail-closed: throws on any failure, never returns a fallback,
  // never logs the value.
  function decrypt(stored) {
    let result;
    try {
      result = decryptObject(stored, platformKey());
    } catch (err) {
      throw new Error('profileKeyCrypto.decrypt: failed to decrypt Profile-Key');
    }
    if (_.isNil(result) || result === '') {
      throw new Error('profileKeyCrypto.decrypt: decryption produced no value');
    }
    return result;
  }

  // Deterministic HMAC-SHA256 (hex) of the Profile-Key, for the uniqueness index. Deterministic by design.
  function hmac(plaintextKey) {
    if (_.isNil(plaintextKey) || plaintextKey === '') {
      throw new Error('profileKeyCrypto.hmac: refusing to hash an empty Profile-Key');
    }
    return crypto.createHmac('sha256', hmacKey()).update(String(plaintextKey)).digest('hex');
  }

  return { encrypt, decrypt, hmac };
};
