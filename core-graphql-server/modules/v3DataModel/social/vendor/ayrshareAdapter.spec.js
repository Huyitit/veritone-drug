jest.mock('request-promise');

const chaiExpect = require('chai').expect;
const rp = require('request-promise');

// Unit tests for the Ayrshare adapter (BE-12 createProfile/getConnectUrl + BE-13 verify/detach/update).
// Ayrshare HTTP is mocked via request-promise; the PRIMARY_API_KEY (+ privateKey/domain) come from the env
// fallback so no DB credential or decryptObject is exercised (the DB query in loadCreds is try/caught → env).

describe('ayrshareAdapter.js (BE-12 / BE-13)', function () {
  // Built once and reused across tests (full serviceContext construction is
  // expensive - ~35 DAL/BLL modules + caches). This is safe because
  // ayrshareAdapter.js reads process.env.AYRSHARE_* lazily inside loadCreds()
  // at call time, not at construction time, so a stable adapter instance
  // still picks up the env vars beforeEach sets fresh every test.
  const serviceContext = require('../../test/serviceContext.mock.js')();
  let adapter = require('./ayrshareAdapter.js')(serviceContext);
  // Snapshot of every logger method, so the BE-19 logging-safety block can spy across all of them
  // (a secret leaked via logger.info is no better than one leaked via logger.error) and beforeEach
  // can put the originals back.
  const defaultLogger = { ...serviceContext.logger };

  // A handful of tests need their own throwaway adapter (e.g. to probe
  // behavior with specific env vars deleted) - kept as a function for them.
  function makeAdapter() {
    return require('./ayrshareAdapter.js')(serviceContext);
  }

  beforeEach(function () {
    serviceContext._clearAll();
    Object.assign(serviceContext.logger, defaultLogger);
    jest.clearAllMocks();
    process.env.AYRSHARE_API_KEY = 'test-api-key';
    process.env.AYRSHARE_PRIVATE_KEY = 'test-private-key';
    process.env.AYRSHARE_DOMAIN = 'veritone';
  });

  afterEach(function () {
    delete process.env.AYRSHARE_API_KEY;
    delete process.env.AYRSHARE_PRIVATE_KEY;
    delete process.env.AYRSHARE_DOMAIN;
  });

  describe('#require', function () {
    it('exposes the PublishVendorProfile contract', function () {
      ['createProfile', 'getConnectUrl', 'verifyConnection', 'detachAccount', 'updateProfileLabel'].forEach(
        (m) => chaiExpect(adapter[m]).to.be.a('function')
      );
    });
  });

  describe('#createProfile', function () {
    it('POSTs /api/profiles with org-id title + refId and returns the profileKey', async function () {
      rp.mockResolvedValue({ profileKey: 'pk-abc', refId: '7682:dest-1' });
      const res = await adapter.createProfile({ orgId: 7682, destinationId: 'dest-1', label: 'Marketing YouTube' });

      chaiExpect(res.vendorProfileId).to.equal('pk-abc');
      const opts = rp.mock.calls[0][0];
      chaiExpect(opts.method).to.equal('POST');
      chaiExpect(opts.uri).to.equal('https://api.ayrshare.com/api/profiles');
      chaiExpect(opts.headers.Authorization).to.equal('Bearer test-api-key');
      chaiExpect(opts.body.title).to.equal('Veritone Org 7682 — Marketing YouTube');
      chaiExpect(opts.body.refId).to.equal('7682:dest-1');
    });

    it('throws if Ayrshare returns no profileKey', async function () {
      rp.mockResolvedValue({});
      await expect(adapter.createProfile({ orgId: 1, destinationId: 'd', label: 'x' })).rejects.toThrow();
    });
  });

  describe('#getConnectUrl', function () {
    it('POSTs /api/profiles/generateJWT with domain+privateKey+profileKey and returns the url', async function () {
      rp.mockResolvedValue({ url: 'https://profile.ayrshare.com/abc', token: 'jwt' });
      const res = await adapter.getConnectUrl({ vendorProfileId: 'pk-abc' });

      chaiExpect(res.url).to.equal('https://profile.ayrshare.com/abc');
      const opts = rp.mock.calls[0][0];
      chaiExpect(opts.uri).to.equal('https://api.ayrshare.com/api/profiles/generateJWT');
      chaiExpect(opts.body).to.deep.include({ domain: 'veritone', privateKey: 'test-private-key', profileKey: 'pk-abc' });
      chaiExpect(opts.body).to.not.have.property('allowedSocial'); // omitted when not provided (back-compat)
    });

    it('includes allowedSocial in the generateJWT body when provided (BR-1)', async function () {
      rp.mockResolvedValue({ url: 'https://profile.ayrshare.com/abc', token: 'jwt' });
      await adapter.getConnectUrl({ vendorProfileId: 'pk-abc', allowedSocial: ['instagram'] });
      const opts = rp.mock.calls[0][0];
      chaiExpect(opts.body.allowedSocial).to.deep.equal(['instagram']);
    });

    it('computes an expiry when Ayrshare returns none, so callers can tell a stale URL from a fresh one (VE-26069)', async function () {
      // Ayrshare's generateJWT response carries no expiry; without a computed one every destination row stores
      // NULL and an expired connect URL is indistinguishable from a usable one.
      rp.mockResolvedValue({ url: 'https://profile.ayrshare.com/abc', token: 'jwt' });
      const TTL_MS = 5 * 60 * 1000;

      // Bracket the call rather than measuring from `before` alone: the expiry is computed from a Date.now()
      // taken *inside* getConnectUrl, after it awaits the memoized creds load and the rp mock. Comparing against
      // only the pre-call timestamp folds that elapsed time into the measured TTL, so an `at.most(TTL_MS)`
      // assertion holds only when the awaits round to 0ms — fine locally, flaky on a loaded CI worker.
      const before = Date.now();
      const res = await adapter.getConnectUrl({ vendorProfileId: 'pk-abc' });
      const after = Date.now();

      chaiExpect(res.expiresAt).to.be.a('string');
      const expiresAtMs = new Date(res.expiresAt).getTime();
      chaiExpect(expiresAtMs).to.be.at.least(before + TTL_MS);
      chaiExpect(expiresAtMs).to.be.at.most(after + TTL_MS);
    });

    it('prefers an explicit expiry from Ayrshare over the computed default (VE-26069)', async function () {
      rp.mockResolvedValue({
        url: 'https://profile.ayrshare.com/abc',
        token: 'jwt',
        expiresAt: '2026-06-27T00:05:00Z'
      });
      const res = await adapter.getConnectUrl({ vendorProfileId: 'pk-abc' });
      chaiExpect(res.expiresAt).to.equal('2026-06-27T00:05:00Z');
    });

    // The TTL is declared `format: 'nat'` in config.js, but remoteConfig values bypass convict's coercion, so the
    // adapter must not trust the type. A raw string would make `Date.now() + ttl` concatenate -> Invalid Date ->
    // RangeError out of .toISOString(), taking down the whole Connect flow rather than just the expiry.
    [
      { label: 'a numeric string (as remoteConfig would deliver it)', value: '600000', expectedTtlMs: 600000 },
      { label: 'a valid number override', value: 600000, expectedTtlMs: 600000 },
      { label: 'a non-numeric string', value: 'soon', expectedTtlMs: 5 * 60 * 1000 },
      { label: 'a nonsensical zero', value: 0, expectedTtlMs: 5 * 60 * 1000 }
    ].forEach(function (testCase) {
      it(`computes a valid expiry when connectUrlTtlMs is ${testCase.label} (VE-26069)`, async function () {
        const original = serviceContext.config.ayrshare;
        serviceContext.config.ayrshare = { ...original, connectUrlTtlMs: testCase.value };
        try {
          // Built fresh: the TTL is resolved once at adapter construction, not per call.
          const scopedAdapter = makeAdapter();
          rp.mockResolvedValue({ url: 'https://profile.ayrshare.com/abc', token: 'jwt' });

          const before = Date.now();
          const res = await scopedAdapter.getConnectUrl({ vendorProfileId: 'pk-abc' });
          const after = Date.now();

          chaiExpect(res.expiresAt).to.be.a('string');
          const expiresAtMs = new Date(res.expiresAt).getTime();
          chaiExpect(Number.isNaN(expiresAtMs)).to.equal(false);
          chaiExpect(expiresAtMs).to.be.at.least(before + testCase.expectedTtlMs);
          chaiExpect(expiresAtMs).to.be.at.most(after + testCase.expectedTtlMs);
        } finally {
          serviceContext.config.ayrshare = original;
        }
      });
    });

    it('throws a clear error when privateKey/domain are not configured', async function () {
      delete process.env.AYRSHARE_PRIVATE_KEY;
      delete process.env.AYRSHARE_DOMAIN;
      const a = makeAdapter();
      await expect(a.getConnectUrl({ vendorProfileId: 'pk-abc' })).rejects.toThrow();
      expect(rp).not.toHaveBeenCalled(); // never hits Ayrshare without the connect config
    });
  });

  describe('#verifyConnection', function () {
    it('returns the connected account label when youtube is linked', async function () {
      rp.mockResolvedValue({ activeSocialAccounts: [{ platform: 'youtube', displayName: '@my-channel' }] });
      const res = await adapter.verifyConnection({ vendorProfileId: 'pk-abc' });
      chaiExpect(res).to.deep.equal({ connectedAccountLabel: '@my-channel' });

      const opts = rp.mock.calls[0][0];
      chaiExpect(opts.method).to.equal('GET');
      chaiExpect(opts.uri).to.equal('https://api.ayrshare.com/api/user');
      chaiExpect(opts.headers['Profile-Key']).to.equal('pk-abc');
      chaiExpect(opts.qs).to.deep.equal({ validate: true });
    });

    it("returns 'PENDING' when no account is linked yet", async function () {
      rp.mockResolvedValue({ activeSocialAccounts: [] });
      const res = await adapter.verifyConnection({ vendorProfileId: 'pk-abc' });
      chaiExpect(res).to.equal('PENDING');
    });

    it('matches the requested platform (BR-6) — e.g. instagram', async function () {
      rp.mockResolvedValue({
        activeSocialAccounts: [{ platform: 'instagram', displayName: '@brand', connected: true }]
      });
      const res = await adapter.verifyConnection({ vendorProfileId: 'pk-abc', platform: 'instagram' });
      chaiExpect(res).to.deep.equal({ connectedAccountLabel: '@brand' });
    });

    it('reports a network mismatch when a different network is connected (BR-6)', async function () {
      rp.mockResolvedValue({
        activeSocialAccounts: [{ platform: 'facebook', displayName: 'FB Page', connected: true }]
      });
      const res = await adapter.verifyConnection({ vendorProfileId: 'pk-abc', platform: 'instagram' });
      chaiExpect(res).to.deep.equal({ networkMismatch: true, connectedNetworks: ['facebook'] });
    });

    it('excludes an explicitly disconnected account from the connected-accounts list (connected:false filter)', async function () {
      // a.connected !== false is the predicate under test — an account with connected:false must be
      // filtered out, not merely deprioritized, so a severed account is reported PENDING, not connected.
      rp.mockResolvedValue({
        activeSocialAccounts: [{ platform: 'youtube', displayName: '@my-channel', connected: false }]
      });
      const res = await adapter.verifyConnection({ vendorProfileId: 'pk-abc' });
      chaiExpect(res).to.equal('PENDING');
    });

    describe('label fallback chain', function () {
      it('falls back to username when displayName is absent', async function () {
        rp.mockResolvedValue({
          activeSocialAccounts: [{ platform: 'youtube', username: 'channel_handle' }]
        });
        const res = await adapter.verifyConnection({ vendorProfileId: 'pk-abc' });
        chaiExpect(res).to.deep.equal({ connectedAccountLabel: 'channel_handle' });
      });

      it('falls back to displayNames[0].displayName when displayName and username are both absent', async function () {
        rp.mockResolvedValue({
          activeSocialAccounts: [{ platform: 'youtube' }],
          displayNames: [{ displayName: 'Fallback Channel' }]
        });
        const res = await adapter.verifyConnection({ vendorProfileId: 'pk-abc' });
        chaiExpect(res).to.deep.equal({ connectedAccountLabel: 'Fallback Channel' });
      });

      it('falls back to the bare platform string when no label field is present at all', async function () {
        rp.mockResolvedValue({
          activeSocialAccounts: [{ platform: 'youtube' }]
        });
        const res = await adapter.verifyConnection({ vendorProfileId: 'pk-abc' });
        chaiExpect(res).to.deep.equal({ connectedAccountLabel: 'youtube' });
      });
    });
  });

  describe('#detachAccount / #updateProfileLabel', function () {
    it('DELETEs /api/profiles with the Profile-Key header', async function () {
      rp.mockResolvedValue({ success: true });
      await adapter.detachAccount({ vendorProfileId: 'pk-abc' });
      const opts = rp.mock.calls[0][0];
      chaiExpect(opts.method).to.equal('DELETE');
      chaiExpect(opts.uri).to.equal('https://api.ayrshare.com/api/profiles');
      chaiExpect(opts.headers['Profile-Key']).to.equal('pk-abc');
    });

    it('PUTs /api/profiles with the new org-id title', async function () {
      rp.mockResolvedValue({ profileKey: 'pk-abc' });
      await adapter.updateProfileLabel({ vendorProfileId: 'pk-abc', orgId: 7682, label: 'PR YouTube' });
      const opts = rp.mock.calls[0][0];
      chaiExpect(opts.method).to.equal('PUT');
      chaiExpect(opts.headers['Profile-Key']).to.equal('pk-abc');
      chaiExpect(opts.body.title).to.equal('Veritone Org 7682 — PR YouTube');
    });
  });

  describe('lazy credential — no key configured', function () {
    it('throws a clear "not configured" error only when a call is actually made (boot is unaffected)', async function () {
      delete process.env.AYRSHARE_API_KEY;
      const a = makeAdapter(); // creating the adapter does NOT throw (lazy)
      await expect(a.createProfile({ orgId: 1, destinationId: 'd', label: 'x' })).rejects.toThrow();
      expect(rp).not.toHaveBeenCalled();
    });
  });

  describe('logging safety (BE-19) — never logs secrets', function () {
    // The adapter handles the Ayrshare Bearer apiKey, per-profile Profile-Key (vendorProfileId), the account
    // privateKey, and the short-lived SIGNED connect URL minted by generateJWT (the URL embeds a JWT — anyone
    // holding it can drive the hosted linking page for that profile, so it is a bearer credential, not a
    // harmless link). On an HTTP failure the adapter must log ONLY non-sensitive request metadata
    // (method/path/status), never the headers/credentials/body; on success it must log nothing at all. These
    // tests force both paths and assert no secret value reaches ANY logger method.
    const SECRETS = ['test-api-key', 'Bearer test-api-key', 'test-private-key'];
    // The signed connect URL and the bare JWT it carries, asserted separately from SECRETS because they are
    // minted by Ayrshare (response-side) rather than supplied as credentials (request-side).
    const SIGNED_JWT = 'eyJhbGciOiJSUzI1NiJ9.c2lnbmVkLXVybC1wYXlsb2Fk.c2ln';
    const SIGNED_URL = `https://profile.ayrshare.com/social-accounts?domain=veritone&jwt=${SIGNED_JWT}`;
    const LOG_METHODS = ['error', 'warn', 'info', 'debug', 'log', 'trace'];

    function spyLogger() {
      LOG_METHODS.forEach((m) => {
        serviceContext.logger[m] = jest.fn();
      });
    }
    function loggedBlob() {
      return JSON.stringify(
        LOG_METHODS.flatMap((m) => serviceContext.logger[m].mock.calls)
      );
    }

    it('logs only method/path/status (no apiKey/Authorization) when a request fails', async function () {
      spyLogger();
      const err = new Error('401 - Unauthorized');
      err.statusCode = 401;
      err.error = { message: 'bad key' };
      rp.mockRejectedValue(err);

      await expect(
        adapter.createProfile({ orgId: 7682, destinationId: 'dest-1', label: 'L' })
      ).rejects.toThrow();

      expect(serviceContext.logger.error).toHaveBeenCalled();
      // the error log carries the safe request context...
      const errArgs = serviceContext.logger.error.mock.calls[0];
      chaiExpect(errArgs[1]).to.deep.equal({ method: 'POST', path: '/api/profiles', status: 401 });
      // ...and NO secret ever reaches the logger.
      const blob = loggedBlob();
      SECRETS.forEach((s) => chaiExpect(blob).to.not.contain(s));
    });

    it('never logs the Profile-Key (vendorProfileId) on a per-profile call failure', async function () {
      spyLogger();
      const err = new Error('403 - Forbidden');
      err.statusCode = 403;
      rp.mockRejectedValue(err);

      await expect(adapter.detachAccount({ vendorProfileId: 'pk-super-secret' })).rejects.toThrow();

      const blob = loggedBlob();
      chaiExpect(blob).to.not.contain('pk-super-secret');
      SECRETS.forEach((s) => chaiExpect(blob).to.not.contain(s));
    });

    it('never logs the minted signed connect URL or its JWT on the success path', async function () {
      spyLogger();
      rp.mockResolvedValue({ url: SIGNED_URL, token: SIGNED_JWT });

      const res = await adapter.getConnectUrl({
        vendorProfileId: 'pk-abc',
        allowedSocial: ['youtube']
      });

      // The signed URL really did pass through the adapter (so "not logged" is a claim about a value that
      // was genuinely in scope, not a vacuous assertion)...
      chaiExpect(res.url).to.equal(SIGNED_URL);
      chaiExpect(res.token).to.equal(SIGNED_JWT);
      // ...and it reached no logger, whole or in part. The host is checked too so a future
      // "minted connect url for <host>" style log line fails here rather than shipping.
      const blob = loggedBlob();
      chaiExpect(blob).to.not.contain(SIGNED_URL);
      chaiExpect(blob).to.not.contain(SIGNED_JWT);
      chaiExpect(blob).to.not.contain('profile.ayrshare.com');
      SECRETS.forEach((s) => chaiExpect(blob).to.not.contain(s));
    });

    it('logs only method/path/status when generateJWT fails (its body carries the privateKey)', async function () {
      spyLogger();
      // generateJWT is the one call whose request BODY holds the account privateKey (not just a header), so a
      // regression that logged `options.body` on failure would leak it here.
      const err = new Error('500 - Internal Server Error');
      err.statusCode = 500;
      err.error = { message: 'jwt generation failed' };
      rp.mockRejectedValue(err);

      await expect(adapter.getConnectUrl({ vendorProfileId: 'pk-abc' })).rejects.toThrow();

      const errArgs = serviceContext.logger.error.mock.calls[0];
      chaiExpect(errArgs[1]).to.deep.equal({
        method: 'POST',
        path: '/api/profiles/generateJWT',
        status: 500
      });
      const blob = loggedBlob();
      SECRETS.forEach((s) => chaiExpect(blob).to.not.contain(s));
      chaiExpect(blob).to.not.contain('pk-abc');
      chaiExpect(blob).to.not.contain('veritone'); // the generateJWT `domain`
    });
  });

  describe('credential load — DB read failure fallback', function () {
    it('catches a rejected external_credential read, warns, and falls through to the env credentials', async function () {
      const dbError = new Error('connection terminated unexpectedly');
      const sc = require('../../test/serviceContext.mock.js')();
      sc.dbConnections = { sso: { read: { map: jest.fn().mockRejectedValue(dbError) } } };
      const a = require('./ayrshareAdapter.js')(sc);

      rp.mockResolvedValue({ profileKey: 'pk-env-fallback' });
      const res = await a.createProfile({ orgId: 1, destinationId: 'd', label: 'L' });

      chaiExpect(res.vendorProfileId).to.equal('pk-env-fallback');
      expect(sc.logger.warn).toHaveBeenCalledWith(
        'ayrshareAdapter: external_credential load failed, falling back to env',
        expect.objectContaining({ error: dbError.message })
      );
      // the rejection did not propagate — the call proceeded on the env-fallback apiKey, not a DB one.
      const opts = rp.mock.calls[0][0];
      chaiExpect(opts.headers.Authorization).to.equal('Bearer test-api-key');
    });
  });

  describe('DB credential row (aes-aligned, service_type=ayrshare)', function () {
    // Proves the adapter reads + decrypts an sso.external_credential row written by the core-admin endpoint's
    // aes path: encryptObject({apiKey,...}, decryptKeyDefault) -> the adapter's decryptObject(... decryptKeyDefault).
    // The DB value takes precedence over the env fallback.
    it('decrypts the external_credential ciphertext with decryptKeyDefault and uses it as the Bearer', async function () {
      const { encryptObject } = require('@veritone/core-server-base/util.js')();
      const KEY = 'b7c3f2d49867e8f14ce04c3e5a9655d3196b870ad6ea34829b5e3e9abfa0c87c';
      const ciphertext = encryptObject({ apiKey: 'DB-API-KEY', privateKey: 'pk', domain: 'id-ntS-M' }, KEY);

      delete process.env.AYRSHARE_API_KEY; // ensure the key comes from the DB row, not env
      const sc = require('../../test/serviceContext.mock.js')();
      sc.config = Object.assign({}, sc.config, { decryptKeyDefault: KEY });
      sc.dbConnections = { sso: { read: { map: jest.fn().mockResolvedValue([ciphertext]) } } };
      const a = require('./ayrshareAdapter.js')(sc);

      rp.mockResolvedValue({ profileKey: 'pk-db' });
      await a.createProfile({ orgId: 7682, destinationId: 'd1', label: 'L' });

      expect(sc.dbConnections.sso.read.map).toHaveBeenCalledTimes(1);
      const opts = rp.mock.calls[0][0];
      chaiExpect(opts.headers.Authorization).to.equal('Bearer DB-API-KEY');
    });
  });
});
