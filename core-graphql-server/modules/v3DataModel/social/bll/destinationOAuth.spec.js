const chaiExpect = require('chai').expect;
const mockUtil = require('../../../../test/mockUtil.js')();

// BE-14 orchestration tests. The Ayrshare adapter and the destination DAL are both mocked, so this verifies the
// orchestration logic (id pre-generation, PENDING_OAUTH persist, CONNECTED flip) without HTTP or DB.

describe('destinationOAuth.js (BE-14)', function () {
  // Built once and reused across tests (full serviceContext construction is
  // expensive - ~35 DAL/BLL modules + caches). Every field this file touches
  // (vendor, dal.destination, dal.destinationType) is unconditionally
  // reassigned fresh in beforeEach regardless, so sharing the base context
  // introduces no cross-test leakage.
  const serviceContext = require('../../test/serviceContext.mock.js')();
  let context;
  let oauth;
  let adapter;
  let dalDestination;
  let dalDestinationType;

  beforeEach(function () {
    serviceContext._clearAll();
    // _clearAll() doesn't touch this - one test enables 'instagram' via this
    // flag, and it would otherwise leak into later tests since serviceContext
    // is now shared across the whole file.
    if (serviceContext.config.featureFlags) {
      delete serviceContext.config.featureFlags.enabledDestinationConnects;
    }
    context = mockUtil.makeContext();

    adapter = {
      createProfile: jest.fn().mockResolvedValue({ vendorProfileId: 'pk-1' }),
      getConnectUrl: jest
        .fn()
        .mockResolvedValue({ url: 'https://profile.ayrshare.com/abc', expiresAt: '2026-06-27T00:05:00Z' }),
      verifyConnection: jest.fn(),
      detachAccount: jest.fn(),
      updateProfileLabel: jest.fn()
    };
    serviceContext.vendor = {
      publishProfile: { getPublishVendorAdapter: () => adapter }
    };

    dalDestination = {
      createDestination: jest
        .fn()
        .mockImplementation((ctx, args) => Promise.resolve(Object.assign({}, args.input))),
      updateDestination: jest
        .fn()
        .mockImplementation((ctx, args) => Promise.resolve(Object.assign({}, args.input))),
      deleteDestination: jest
        .fn()
        .mockImplementation((ctx, args) => Promise.resolve({ id: args.id, message: 'Destination deleted' })),
      loadOwnedDestination: jest.fn()
    };
    serviceContext.dal.destination = dalDestination;

    // VE-24929 (BR-1): createDestination loads the destination type to derive allowedSocial. Default to a youtube
    // type; individual tests override the platform.
    dalDestinationType = {
      getDestinationType: jest.fn().mockResolvedValue({ id: 'dt-1', platform: 'youtube' })
    };
    serviceContext.dal.destinationType = dalDestinationType;

    oauth = require('./destinationOAuth.js')(serviceContext);
  });

  describe('#createDestination', function () {
    it('mints a profile + connect URL, then persists PENDING_OAUTH with a matching id', async function () {
      const res = await oauth.createDestination(context, {
        input: { destinationTypeId: 'dt-1', label: 'Marketing YouTube', details: { foo: 'bar' } }
      });

      // createProfile got a generated destination id + the label + an org id
      expect(adapter.createProfile).toHaveBeenCalledTimes(1);
      const cpArg = adapter.createProfile.mock.calls[0][0];
      chaiExpect(cpArg.label).to.equal('Marketing YouTube');
      chaiExpect(cpArg.destinationId).to.be.a('string').with.length.greaterThan(10);
      chaiExpect(cpArg.orgId).to.exist;

      // connect URL minted against the returned profile key, scoped to the type's single network (BR-1)
      expect(adapter.getConnectUrl).toHaveBeenCalledWith({
        vendorProfileId: 'pk-1',
        allowedSocial: ['youtube']
      });

      // persisted with the SAME id, PENDING_OAUTH, profile key + oauth url
      const dalArg = dalDestination.createDestination.mock.calls[0][1].input;
      chaiExpect(dalArg.id).to.equal(cpArg.destinationId);
      chaiExpect(dalArg.status).to.equal('PENDING_OAUTH');
      chaiExpect(dalArg.vendorProfileId).to.equal('pk-1');
      chaiExpect(dalArg.oauthUrl).to.equal('https://profile.ayrshare.com/abc');
      chaiExpect(dalArg.destinationTypeId).to.equal('dt-1');
      chaiExpect(res.status).to.equal('PENDING_OAUTH');
    });

    it('rejects a context with no organization before minting an Ayrshare Profile (security-coverage)', async function () {
      context = {};

      let threw = false;
      try {
        await oauth.createDestination(context, {
          input: { destinationTypeId: 'dt-1', label: 'No Org' }
        });
      } catch (e) {
        threw = true;
        chaiExpect(e.message).to.contain('No organization');
      }
      chaiExpect(threw).to.equal(true);
      expect(dalDestinationType.getDestinationType).not.toHaveBeenCalled();
      expect(adapter.createProfile).not.toHaveBeenCalled();
      expect(adapter.getConnectUrl).not.toHaveBeenCalled();
    });

    it('derives allowedSocial from the destination type platform (BR-1) — e.g. instagram', async function () {
      dalDestinationType.getDestinationType.mockResolvedValue({ id: 'dt-ig', platform: 'instagram' });
      // instagram connect is gated by BR-5; enable it so we can exercise the allowedSocial derivation.
      serviceContext.config.featureFlags = serviceContext.config.featureFlags || {};
      serviceContext.config.featureFlags.enabledDestinationConnects = ['instagram'];

      await oauth.createDestination(context, {
        input: { destinationTypeId: 'dt-ig', label: 'Brand IG' }
      });

      expect(dalDestinationType.getDestinationType).toHaveBeenCalledWith(context, { id: 'dt-ig' });
      const gcuArg = adapter.getConnectUrl.mock.calls[0][0];
      chaiExpect(gcuArg.allowedSocial).to.deep.equal(['instagram']);
    });

    it('fails fast for an unmapped platform WITHOUT creating an Ayrshare profile (BR-1)', async function () {
      dalDestinationType.getDestinationType.mockResolvedValue({ id: 'dt-x', platform: 'myspace' });

      let threw = false;
      try {
        await oauth.createDestination(context, {
          input: { destinationTypeId: 'dt-x', label: 'Nope' }
        });
      } catch (e) {
        threw = true;
      }
      chaiExpect(threw).to.equal(true);
      expect(adapter.createProfile).not.toHaveBeenCalled();
      expect(adapter.getConnectUrl).not.toHaveBeenCalled();
    });

    it('refuses to connect a platform gated off by feature flag (BR-5) — no profile created', async function () {
      dalDestinationType.getDestinationType.mockResolvedValue({ id: 'dt-fb', platform: 'facebook' });
      // facebook connect flag left default (off) -> white-label not configured.

      let threw = false;
      try {
        await oauth.createDestination(context, {
          input: { destinationTypeId: 'dt-fb', label: 'Brand FB' }
        });
      } catch (e) {
        threw = true;
      }
      chaiExpect(threw).to.equal(true);
      expect(adapter.createProfile).not.toHaveBeenCalled();
    });
  });

  describe('#completeDestinationConnection', function () {
    it('flips PENDING_OAUTH -> CONNECTED and clears the connect url when verified', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        status: 'PENDING_OAUTH',
        vendorProfileId: 'pk-1'
      });
      adapter.verifyConnection.mockResolvedValue({ connectedAccountLabel: '@my-channel' });

      await oauth.completeDestinationConnection(context, { input: { id: 'd-1' } });

      expect(adapter.verifyConnection).toHaveBeenCalledWith({ vendorProfileId: 'pk-1', platform: 'youtube' });
      const upd = dalDestination.updateDestination.mock.calls[0][1].input;
      chaiExpect(upd).to.deep.equal({
        id: 'd-1',
        status: 'CONNECTED',
        platformAccountLabel: '@my-channel',
        oauthUrl: null,
        oauthUrlExpiresAt: null
      });
    });

    it('leaves PENDING_OAUTH (no update) when the handshake is not yet complete', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        status: 'PENDING_OAUTH',
        vendorProfileId: 'pk-1'
      });
      adapter.verifyConnection.mockResolvedValue('PENDING');

      const res = await oauth.completeDestinationConnection(context, { input: { id: 'd-1' } });

      expect(dalDestination.updateDestination).not.toHaveBeenCalled();
      chaiExpect(res.status).to.equal('PENDING_OAUTH');
    });

    it('is idempotent — already CONNECTED returns without calling the vendor', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({ id: 'd-1', status: 'CONNECTED' });

      await oauth.completeDestinationConnection(context, { input: { id: 'd-1' } });

      expect(adapter.verifyConnection).not.toHaveBeenCalled();
      expect(dalDestination.updateDestination).not.toHaveBeenCalled();
    });

    it('surfaces an actionable prerequisite error and leaves PENDING_OAUTH (US-P4 / R-X1)', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        status: 'PENDING_OAUTH',
        vendorProfileId: 'pk-1',
        destinationTypeId: 'dt-ig'
      });
      dalDestinationType.getDestinationType.mockResolvedValue({ id: 'dt-ig', platform: 'instagram' });
      // Detection of this signal from Ayrshare is the VE-24935 follow-up; here we assert the orchestration maps a
      // known category to the actionable message and refuses to connect.
      adapter.verifyConnection.mockResolvedValue({ prerequisiteIssue: 'ACCOUNT_TYPE' });

      let err;
      try {
        await oauth.completeDestinationConnection(context, { input: { id: 'd-1' } });
      } catch (e) {
        err = e;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.message).to.match(/Business or Creator/i);
      expect(dalDestination.updateDestination).not.toHaveBeenCalled();
    });

    it('rejects a network mismatch and leaves the destination PENDING_OAUTH (BR-6)', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        status: 'PENDING_OAUTH',
        vendorProfileId: 'pk-1',
        destinationTypeId: 'dt-ig'
      });
      dalDestinationType.getDestinationType.mockResolvedValue({ id: 'dt-ig', platform: 'instagram' });
      adapter.verifyConnection.mockResolvedValue({
        networkMismatch: true,
        connectedNetworks: ['facebook']
      });

      let threw = false;
      try {
        await oauth.completeDestinationConnection(context, { input: { id: 'd-1' } });
      } catch (e) {
        threw = true;
      }
      chaiExpect(threw).to.equal(true);
      expect(adapter.verifyConnection).toHaveBeenCalledWith({ vendorProfileId: 'pk-1', platform: 'instagram' });
      expect(dalDestination.updateDestination).not.toHaveBeenCalled();
    });
  });

  describe('#refreshDestinationOAuthUrl (VE-26069)', function () {
    it('re-mints the connect URL against the EXISTING profile without creating a second one', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        status: 'PENDING_OAUTH',
        destinationTypeId: 'dt-1',
        vendorProfileId: 'pk-1'
      });
      adapter.getConnectUrl.mockResolvedValue({
        url: 'https://profile.ayrshare.com/fresh',
        expiresAt: '2026-06-27T09:05:00Z'
      });

      await oauth.refreshDestinationOAuthUrl(context, { input: { id: 'd-1' } });

      // The whole point of this mutation: reuse the profile, mint only a new URL. A second profile here would
      // orphan the first one in Ayrshare.
      expect(adapter.createProfile).not.toHaveBeenCalled();
      expect(adapter.getConnectUrl).toHaveBeenCalledWith({
        vendorProfileId: 'pk-1',
        allowedSocial: ['youtube']
      });
      const upd = dalDestination.updateDestination.mock.calls[0][1].input;
      chaiExpect(upd).to.deep.equal({
        id: 'd-1',
        status: 'PENDING_OAUTH',
        oauthUrl: 'https://profile.ayrshare.com/fresh',
        oauthUrlExpiresAt: '2026-06-27T09:05:00Z'
      });
    });

    it('moves a DISCONNECTED destination back to PENDING_OAUTH, so the fresh URL matches the SDL contract', async function () {
      // Retrying from DISCONNECTED/ERROR is legitimate, but the SDL contracts oauthUrl as present only while
      // status is PENDING_OAUTH. Leaving the row DISCONNECTED with a live URL would hide it from any client
      // gating on PENDING_OAUTH — the vendor JWT would be spent and never used.
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        status: 'DISCONNECTED',
        destinationTypeId: 'dt-1',
        vendorProfileId: 'pk-1'
      });
      adapter.getConnectUrl.mockResolvedValue({
        url: 'https://profile.ayrshare.com/fresh',
        expiresAt: '2026-06-27T09:05:00Z'
      });

      await oauth.refreshDestinationOAuthUrl(context, { input: { id: 'd-1' } });

      const upd = dalDestination.updateDestination.mock.calls[0][1].input;
      chaiExpect(upd.status).to.equal('PENDING_OAUTH');
      chaiExpect(upd.oauthUrl).to.equal('https://profile.ayrshare.com/fresh');
    });

    it('refuses to re-mint for an already CONNECTED destination (no vendor call)', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        status: 'CONNECTED',
        destinationTypeId: 'dt-1',
        vendorProfileId: 'pk-1'
      });

      let threw = false;
      try {
        await oauth.refreshDestinationOAuthUrl(context, { input: { id: 'd-1' } });
      } catch (e) {
        threw = true;
      }
      chaiExpect(threw).to.equal(true);
      expect(adapter.getConnectUrl).not.toHaveBeenCalled();
      expect(dalDestination.updateDestination).not.toHaveBeenCalled();
    });

    it('re-derives allowedSocial from the STORED destination type, never from the caller (BR-1)', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-ig',
        status: 'PENDING_OAUTH',
        destinationTypeId: 'dt-ig',
        vendorProfileId: 'pk-ig'
      });
      dalDestinationType.getDestinationType.mockResolvedValue({ id: 'dt-ig', platform: 'instagram' });
      serviceContext.config.featureFlags = serviceContext.config.featureFlags || {};
      serviceContext.config.featureFlags.enabledDestinationConnects = ['instagram'];

      await oauth.refreshDestinationOAuthUrl(context, { input: { id: 'd-ig' } });

      expect(dalDestinationType.getDestinationType).toHaveBeenCalledWith(context, { id: 'dt-ig' });
      const gcuArg = adapter.getConnectUrl.mock.calls[0][0];
      chaiExpect(gcuArg.allowedSocial).to.deep.equal(['instagram']);
    });

    it('re-checks the white-label gate — a platform disabled since creation cannot be retried (BR-5)', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-fb',
        status: 'PENDING_OAUTH',
        destinationTypeId: 'dt-fb',
        vendorProfileId: 'pk-fb'
      });
      dalDestinationType.getDestinationType.mockResolvedValue({ id: 'dt-fb', platform: 'facebook' });
      // facebook connect flag left default (off) -> white-label not configured.

      let threw = false;
      try {
        await oauth.refreshDestinationOAuthUrl(context, { input: { id: 'd-fb' } });
      } catch (e) {
        threw = true;
      }
      chaiExpect(threw).to.equal(true);
      expect(adapter.getConnectUrl).not.toHaveBeenCalled();
    });

    it('guards the write itself with notStatus, not just the earlier read', async function () {
      // The status read happens before getDestinationType + an outbound generateJWT, so it is stale by the time
      // the UPDATE lands. The predicate has to carry the guard or a concurrently-CONNECTED row gets clobbered.
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        status: 'PENDING_OAUTH',
        destinationTypeId: 'dt-1',
        vendorProfileId: 'pk-1'
      });

      await oauth.refreshDestinationOAuthUrl(context, { input: { id: 'd-1' } });

      chaiExpect(dalDestination.updateDestination.mock.calls[0][1].notStatus).to.equal('CONNECTED');
    });

    it('refuses instead of clobbering when the row turns CONNECTED mid-flight', async function () {
      // Sequence: retry passes the read guard and goes to Ayrshare; meanwhile the ORIGINAL popup completes and
      // completeDestinationConnection flips the row to CONNECTED. The predicate matches zero rows, so the write
      // is a no-op and the caller must surface an error rather than report a fresh PENDING_OAUTH.
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        status: 'PENDING_OAUTH',
        destinationTypeId: 'dt-1',
        vendorProfileId: 'pk-1'
      });
      dalDestination.updateDestination.mockResolvedValue(undefined);

      let err;
      try {
        await oauth.refreshDestinationOAuthUrl(context, { input: { id: 'd-1' } });
      } catch (e) {
        err = e;
      }
      chaiExpect(err).to.not.equal(undefined);
      chaiExpect(String(err.message)).to.contain('already connected');
    });

    it('surfaces NotFound, not "already connected", when the row is deleted mid-flight', async function () {
      // Same empty-result shape as the CONNECTED race, different cause — the re-load distinguishes them so the
      // client is not told a deleted destination is connected.
      dalDestination.loadOwnedDestination
        .mockResolvedValueOnce({
          id: 'd-1',
          status: 'PENDING_OAUTH',
          destinationTypeId: 'dt-1',
          vendorProfileId: 'pk-1'
        })
        .mockRejectedValueOnce(new Error('Destination not found'));
      dalDestination.updateDestination.mockResolvedValue(undefined);

      let err;
      try {
        await oauth.refreshDestinationOAuthUrl(context, { input: { id: 'd-1' } });
      } catch (e) {
        err = e;
      }
      chaiExpect(err).to.not.equal(undefined);
      chaiExpect(String(err.message)).to.contain('not found');
    });

    it('never reaches the vendor when the destination is not owned by the caller org (security-coverage)', async function () {
      // loadOwnedDestination is the org-isolation boundary (MT-2); a cross-org id rejects there.
      dalDestination.loadOwnedDestination.mockRejectedValue(new Error('Destination not found'));

      let threw = false;
      try {
        await oauth.refreshDestinationOAuthUrl(context, { input: { id: 'd-other-org' } });
      } catch (e) {
        threw = true;
      }
      chaiExpect(threw).to.equal(true);
      expect(adapter.getConnectUrl).not.toHaveBeenCalled();
      expect(dalDestination.updateDestination).not.toHaveBeenCalled();
    });
  });

  describe('#updateDestination (BE-15)', function () {
    it('updates the DAL and syncs the Ayrshare title when the label changes', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        label: 'Old name',
        vendorProfileId: 'pk-1'
      });

      await oauth.updateDestination(context, { input: { id: 'd-1', label: 'New name' } });

      const dalArg = dalDestination.updateDestination.mock.calls[0][1].input;
      chaiExpect(dalArg).to.deep.equal({ id: 'd-1', label: 'New name', details: undefined });
      expect(adapter.updateProfileLabel).toHaveBeenCalledTimes(1);
      const upArg = adapter.updateProfileLabel.mock.calls[0][0];
      chaiExpect(upArg.vendorProfileId).to.equal('pk-1');
      chaiExpect(upArg.label).to.equal('New name');
    });

    it('does NOT sync the Ayrshare title when the label is unchanged (details-only edit)', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        label: 'Same name',
        vendorProfileId: 'pk-1'
      });

      await oauth.updateDestination(context, {
        input: { id: 'd-1', label: 'Same name', details: { foo: 'bar' } }
      });

      expect(dalDestination.updateDestination).toHaveBeenCalledTimes(1);
      expect(adapter.updateProfileLabel).not.toHaveBeenCalled();
    });

    it('still succeeds when the cosmetic Ayrshare title sync fails (non-fatal)', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({
        id: 'd-1',
        label: 'Old name',
        vendorProfileId: 'pk-1'
      });
      adapter.updateProfileLabel.mockRejectedValue(new Error('ayrshare 500'));

      const res = await oauth.updateDestination(context, { input: { id: 'd-1', label: 'New name' } });

      expect(dalDestination.updateDestination).toHaveBeenCalledTimes(1);
      chaiExpect(res.label).to.equal('New name');
    });
  });

  describe('#deleteDestination (BE-15)', function () {
    it('soft-deletes the row, then detaches the Ayrshare profile', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({ id: 'd-1', vendorProfileId: 'pk-1' });

      const res = await oauth.deleteDestination(context, { id: 'd-1' });

      expect(dalDestination.deleteDestination).toHaveBeenCalledWith(context, { id: 'd-1' });
      expect(adapter.detachAccount).toHaveBeenCalledWith({ vendorProfileId: 'pk-1' });
      chaiExpect(res.id).to.equal('d-1');
    });

    it('still reports the row deleted when detach fails (orphan left for the reaper)', async function () {
      dalDestination.loadOwnedDestination.mockResolvedValue({ id: 'd-1', vendorProfileId: 'pk-1' });
      adapter.detachAccount.mockRejectedValue(new Error('ayrshare 404'));

      const res = await oauth.deleteDestination(context, { id: 'd-1' });

      expect(dalDestination.deleteDestination).toHaveBeenCalledTimes(1);
      chaiExpect(res.id).to.equal('d-1');
    });
  });
});
