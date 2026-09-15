'use strict';

// VP-2581 — Ayrshare OAuth/profile adapter (BE-12 + BE-13).
//
// Implements the PublishVendorProfile contract (see ./publishVendorProfile.js) for Ayrshare. This is the
// aiware-core *resolver-side* half of the integration (profile lifecycle + the hosted OAuth/connect URL). The
// actual social post + status poll runs in the Go distribute engine — NOT here (engine-ayrshare-auth.md R5).
//
// Auth: every call sends `Authorization: Bearer <PRIMARY_API_KEY>`; per-profile calls add `Profile-Key`.
// Endpoints (canonical, per ayrshare-api-spec-openapi3.yaml — NOT the stale vendor-survey paths):
//   createProfile       POST   /api/profiles               -> { profileKey }
//   getConnectUrl       POST   /api/profiles/generateJWT    -> { url, token }  (needs account privateKey + domain)
//   verifyConnection    GET    /api/user (?validate=true, Profile-Key header)
//   detachAccount       DELETE /api/profiles  (Profile-Key header)
//   updateProfileLabel  PUT    /api/profiles  (Profile-Key header)
//
// Credential: loaded LAZILY (first use, then cached) from sso.external_credential
// (service_type='ayrshare', credential_name='ayrshare-primary'), decrypted via CORE_GRAPHQL_DECRYPT_KEY — the
// s3Util.js pattern. Falls back to env (AYRSHARE_API_KEY / AYRSHARE_PRIVATE_KEY / AYRSHARE_DOMAIN) for local dev.
// Loading is lazy so the server boots — and unit tests run — without any Ayrshare credential configured; a clear
// error is thrown only if a profile operation is actually invoked without a key.

const _ = require('lodash');
const rp = require('request-promise');

module.exports = function createAyrshareAdapter(serviceContext) {
  const config = serviceContext.config;
  const logger = serviceContext.logger;
  const errors = require('../../../../error/index.js')(config);
  const { decryptObject } = require('@veritone/core-server-base/util.js')();

  const BASE_URL = _.get(config, 'ayrshare.baseUrl', 'https://api.ayrshare.com');

  // Ayrshare's /api/profiles/generateJWT link is a signed, short-lived token — the vendor default is 5 minutes and
  // the response carries no explicit expiry. Persisting a computed expiry (see getConnectUrl) is what lets callers
  // tell a usable connect URL from a dead one; without it every destination row stores a NULL expiry and a stale
  // URL is indistinguishable from a fresh one (VE-26069).
  //
  // Coerced to Number rather than used raw. `ayrshare.connectUrlTtlMs` is declared `format: 'nat'` in config.js and
  // is env-only, so convict does coerce every path that can currently set it — this guard is for the day someone
  // gives it a `remoteConfig` key, since those values land on the config object without convict's coercion. A string
  // there would survive to `Date.now() + ttl`: concatenation, then Invalid Date, then a RangeError out of
  // getConnectUrl that fails the whole Connect flow. Fall back to the vendor default if it isn't a usable positive
  // number.
  const FALLBACK_CONNECT_URL_TTL_MS = 5 * 60 * 1000;
  const configuredTtlMs = Number(_.get(config, 'ayrshare.connectUrlTtlMs'));
  const DEFAULT_CONNECT_URL_TTL_MS =
    Number.isFinite(configuredTtlMs) && configuredTtlMs > 0
      ? configuredTtlMs
      : FALLBACK_CONNECT_URL_TTL_MS;

  // Lazy, memoized credential load. Resolves to { apiKey, privateKey, domain } (any may be undefined).
  let credsPromise;
  async function loadCreds() {
    let creds = {};
    try {
      // VP-2581: `decryptKeyDefault` is the shared aes key the core-admin external-credential endpoint uses to
      // encrypt service_type='ayrshare' rows (aes-align, b)). Kept as the last fallback after the s3Util key
      // refs so existing behavior is unchanged. (FUTURE (a): real KMS on both sides via encryption_key_id.)
      const decryptKey =
        process.env.CORE_GRAPHQL_DECRYPT_KEY ||
        _.get(config, 's3.fileId') ||
        _.get(config, 'decryptKeyDefault');
      const sql = `
        SELECT credentials_ciphertext
        FROM external_credential
        WHERE service_type = $1 AND credential_name = $2
        ORDER BY created_date DESC
        LIMIT 1
      `;
      const rows = await serviceContext.dbConnections['sso'].read.map(
        sql,
        ['ayrshare', _.get(config, 'ayrshare.credentialName', 'ayrshare-primary')],
        (row) => row.credentials_ciphertext
      );
      if (rows.length && decryptKey) {
        creds = decryptObject(rows[0], decryptKey) || {};
      }
    } catch (err) {
      // Don't fail boot/first-use on a credential-store hiccup — fall through to env, then to a clear error.
      logger.warn('ayrshareAdapter: external_credential load failed, falling back to env', {
        error: err && err.message
      });
    }
    // Prefer the decrypted external_credential row, then the env-mapped config (config.ayrshare.*,
    // injected from cluster secrets by aiware-charts), then raw process.env for bare local-dev runs.
    return {
      apiKey: creds.apiKey || _.get(config, 'ayrshare.apiKey') || process.env.AYRSHARE_API_KEY,
      privateKey: creds.privateKey || _.get(config, 'ayrshare.privateKey') || process.env.AYRSHARE_PRIVATE_KEY,
      domain: creds.domain || _.get(config, 'ayrshare.domain') || process.env.AYRSHARE_DOMAIN
    };
  }
  function getCreds() {
    if (!credsPromise) {
      credsPromise = loadCreds();
    }
    return credsPromise;
  }

  async function requireApiKey() {
    const creds = await getCreds();
    if (!creds.apiKey) {
      throw new errors.InternalServerError({
        message:
          'Ayrshare is not configured: no PRIMARY_API_KEY (seed sso.external_credential ' +
          "service_type='ayrshare' or set AYRSHARE_API_KEY)."
      });
    }
    return creds;
  }

  // Thin request-promise wrapper: Bearer auth + optional Profile-Key, JSON in/out, errors wrapped.
  async function call(method, path, { profileKey, body, qs } = {}) {
    const creds = await requireApiKey();
    const headers = { Authorization: `Bearer ${creds.apiKey}` };
    if (profileKey) {
      headers['Profile-Key'] = profileKey;
    }
    const options = {
      method,
      uri: `${BASE_URL}${path}`,
      headers,
      json: true,
      timeout: _.get(config, 'ayrshare.httpTimeoutMs', 30000)
    };
    if (body) {
      options.body = body;
    }
    if (qs) {
      options.qs = qs;
    }
    try {
      return await rp(options);
    } catch (err) {
      // request-promise throws StatusCodeError (non-2xx) / RequestError (network). Never log the headers.
      const status = err && err.statusCode;
      logger.error('ayrshareAdapter: request failed', { method, path, status });
      throw new errors.InternalServerError({
        message: `Ayrshare request failed (${method} ${path})`,
        data: { statusCode: status, ayrshareError: _.get(err, 'error') }
      });
    }
  }

  // ----- PublishVendorProfile implementation -----

  // BE-12. Create a sub-account User Profile. title/refId carry the Veritone org id (multitenancy.md MT-2).
  async function createProfile({ orgId, destinationId, label }) {
    const res = await call('POST', '/api/profiles', {
      body: {
        title: `Veritone Org ${orgId} — ${label}`,
        refId: `${orgId}:${destinationId}`
      }
    });
    const vendorProfileId = res && (res.profileKey || res.profile_key);
    if (!vendorProfileId) {
      throw new errors.InternalServerError({
        message: 'Ayrshare createProfile returned no profileKey'
      });
    }
    return { vendorProfileId };
  }

  // BE-12. Mint the short-lived hosted OAuth/connect URL. generateJWT needs the account's privateKey + domain.
  // `allowedSocial` (VE-24929 / BR-1), when provided, restricts the hosted linking page to a single network (R-A5).
  async function getConnectUrl({ vendorProfileId, allowedSocial }) {
    const creds = await getCreds();
    if (!creds.privateKey || !creds.domain) {
      throw new errors.InternalServerError({
        message:
          'Ayrshare connect URL unavailable: privateKey/domain not configured ' +
          '(set on the external_credential payload or AYRSHARE_PRIVATE_KEY / AYRSHARE_DOMAIN).'
      });
    }
    const body = {
      domain: creds.domain,
      privateKey: creds.privateKey,
      profileKey: vendorProfileId
    };
    // Single-network hosted linking page (R-A5 / BR-1): scope the page to the destination type's network when the
    // caller supplies it. Omitted -> Ayrshare's default (all-network) page, preserving prior behavior.
    if (Array.isArray(allowedSocial) && allowedSocial.length) {
      body.allowedSocial = allowedSocial;
    }
    const res = await call('POST', '/api/profiles/generateJWT', { body });
    if (!res || !res.url) {
      throw new errors.InternalServerError({
        message: 'Ayrshare generateJWT returned no url'
      });
    }
    // Ayrshare's hosted JWT URL defaults to a ~5-min TTL and the response carries no expiry, so compute one from
    // DEFAULT_CONNECT_URL_TTL_MS. Callers persist this on the destination; it is the only signal that distinguishes
    // a usable connect URL from an expired one (VE-26069).
    const expiresAt =
      res.expiresAt || new Date(Date.now() + DEFAULT_CONNECT_URL_TTL_MS).toISOString();
    return { url: res.url, token: res.token, expiresAt };
  }

  // BE-13. Confirm the OAuth handshake completed for the destination's network (VE-24929 / BR-6). Returns:
  //   'PENDING'                                  — no account connected yet (handshake not finished),
  //   { connectedAccountLabel }                  — the expected `platform` network is connected,
  //   { networkMismatch: true, connectedNetworks } — a DIFFERENT network connected (allowedSocial didn't restrict).
  // `platform` defaults to 'youtube' for backward compatibility with the original single-network behavior.
  async function verifyConnection({ vendorProfileId, platform }) {
    const expected = String(platform || 'youtube').toLowerCase();
    const res = await call('GET', '/api/user', {
      profileKey: vendorProfileId,
      qs: { validate: true }
    });
    const accounts = _.get(res, 'activeSocialAccounts') || _.get(res, 'accounts') || [];
    const connectedAccounts = accounts.filter((a) => (typeof a === 'string' ? true : a.connected !== false));
    if (!connectedAccounts.length) {
      return 'PENDING';
    }
    const match = _.find(
      connectedAccounts,
      (a) => String(a.platform || a).toLowerCase() === expected
    );
    if (!match) {
      // Something connected, but not the network this destination binds to — reject (BR-6 server enforcement).
      return {
        networkMismatch: true,
        connectedNetworks: connectedAccounts.map((a) => a.platform || a)
      };
    }
    const label =
      _.get(match, 'displayName') ||
      _.get(match, 'username') ||
      _.get(res, 'displayNames[0].displayName') ||
      expected;
    return { connectedAccountLabel: label };
  }

  // BE-13. Delete the Ayrshare Profile entirely (severs the social link).
  async function detachAccount({ vendorProfileId }) {
    await call('DELETE', '/api/profiles', { profileKey: vendorProfileId });
  }

  // BE-13. Keep the Ayrshare console title in sync on a Destination label edit (refId stays immutable).
  async function updateProfileLabel({ vendorProfileId, orgId, label }) {
    await call('PUT', '/api/profiles', {
      profileKey: vendorProfileId,
      body: { title: `Veritone Org ${orgId} — ${label}` }
    });
  }

  return {
    createProfile,
    getConnectUrl,
    verifyConnection,
    detachAccount,
    updateProfileLabel
  };
};
