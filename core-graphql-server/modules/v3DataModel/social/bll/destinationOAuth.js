'use strict';

// VP-2581 — Destination OAuth/create orchestration (BE-14).
//
// Bridges the Ayrshare profile adapter (./vendor/publishVendorProfile.js) and the destination DAL for the two
// mutations that combine an external vendor call with a DB write:
//   createDestination             — mint an Ayrshare Profile + hosted connect URL, then persist PENDING_OAUTH.
//   completeDestinationConnection — verify the OAuth handshake, then flip PENDING_OAUTH -> CONNECTED.
//
// Plain reads + label/details edits stay in the DAL; update/delete that ALSO call the vendor (label sync,
// profile detach) are BE-15. The vendor adapter is resolved lazily so the credential only loads on real use.

const _ = require('lodash');
const { randomUUID } = require('crypto');

module.exports = function createDestinationOAuth(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../../../../error/index.js')(config);
  const resUtil = require('../../../../resolvers/util.js')(serviceContext);
  const dalDestination = serviceContext.dal.destination;
  const { deriveAllowedSocial } = require('../helper/allowedSocial.js')(config);
  const { assertConnectEnabled } = require('./destinationConnectPolicy.js')(serviceContext);
  const { messageForPrerequisite } = require('../helper/destinationConnectErrors.js');

  function adapter() {
    return serviceContext.vendor.publishProfile.getPublishVendorAdapter('ayrshare');
  }

  function alreadyConnected() {
    return new errors.NotAllowed({
      message: 'This destination is already connected. Disconnect it before connecting a different account.'
    });
  }

  // BE-14. Mint the Ayrshare Profile + connect URL, then persist the destination as PENDING_OAUTH.
  async function createDestination(context, args) {
    const input = args.input;
    const orgId = resUtil.getOrgFromAuthContext(context);
    if (!orgId) {
      // Fail before creating an Ayrshare Profile we'd orphan.
      throw new errors.NotAllowed({ message: 'No organization in auth context.' });
    }
    const vendor = adapter();

    // Derive the single-network allowedSocial from the destination type's platform (BR-1) — server-side, never from
    // the client — so the hosted linking page is scoped to exactly this network (R-A5). Load + derive BEFORE
    // creating the Ayrshare Profile so an unknown/unmapped type fails fast without orphaning a Profile.
    const destinationType = await serviceContext.dal.destinationType.getDestinationType(context, {
      id: input.destinationTypeId
    });
    // BR-5 white-label fallback: refuse to connect a platform whose hosted linking page isn't white-labeled yet.
    assertConnectEnabled(destinationType.platform);
    const allowedSocial = deriveAllowedSocial(destinationType.platform);

    // Pre-generate the id so (a) the Ayrshare Profile refId can carry <orgId>:<destinationId> (MT-2) and
    // (b) vendor_profile_id (NOT NULL) is known before the row is inserted.
    const destinationId = randomUUID();
    const { vendorProfileId } = await vendor.createProfile({
      orgId,
      destinationId,
      label: input.label
    });
    const { url, expiresAt } = await vendor.getConnectUrl({ vendorProfileId, allowedSocial });

    return dalDestination.createDestination(context, {
      input: {
        id: destinationId,
        destinationTypeId: input.destinationTypeId,
        label: input.label,
        details: input.details,
        vendorProfileId,
        status: 'PENDING_OAUTH',
        oauthUrl: url,
        oauthUrlExpiresAt: expiresAt
      }
    });
  }

  // BE-14. Verify the handshake completed; flip PENDING_OAUTH -> CONNECTED and clear the short-lived connect URL.
  async function completeDestinationConnection(context, args) {
    const id = args.input.id;
    const destination = await dalDestination.loadOwnedDestination(context, id);
    if (destination.status === 'CONNECTED') {
      return destination; // idempotent — already connected
    }
    // BR-6: enforce that the network the user actually connected matches this destination's declared platform.
    const destinationType = await serviceContext.dal.destinationType.getDestinationType(context, {
      id: destination.destinationTypeId
    });
    const platform = String(destinationType.platform || '').toLowerCase();
    const result = await adapter().verifyConnection({
      vendorProfileId: destination.vendorProfileId,
      platform
    });
    if (result === 'PENDING') {
      // OAuth not finished yet — leave PENDING_OAUTH so the FE can retry.
      return destination;
    }
    if (result && result.prerequisiteIssue) {
      // US-P4 / R-X1: the connected account can't publish (e.g. IG not Business/Creator, no FB Page admin, TikTok not
      // eligible). Surface a clear, actionable message (no guided-onboarding UI); destination stays PENDING_OAUTH.
      // NOTE: populating `result.prerequisiteIssue` from the Ayrshare /user response is the vendor-survey (VE-24935)
      // follow-up; the message mapping below is complete.
      throw new errors.NotAllowed({
        message: messageForPrerequisite(platform, result.prerequisiteIssue)
      });
    }
    if (result && result.networkMismatch) {
      // A different network was connected on the hosted page (allowedSocial didn't restrict it). Refuse to bind the
      // destination to the wrong network (BR-6). The destination stays PENDING_OAUTH; the user can retry correctly.
      throw new errors.NotAllowed({
        message:
          `Connected network(s) [${(result.connectedNetworks || []).join(', ')}] do not match this destination's ` +
          `platform '${platform}'. Connect the ${platform} account for this destination.`
      });
    }
    return dalDestination.updateDestination(context, {
      input: {
        id,
        status: 'CONNECTED',
        platformAccountLabel: result.connectedAccountLabel,
        oauthUrl: null,
        oauthUrlExpiresAt: null
      }
    });
  }

  // VE-26069. Re-issue the hosted connect URL for a destination whose OAuth handshake never completed.
  //
  // createDestination has to persist the row BEFORE the user touches the vendor page (the row is what carries the
  // Ayrshare Profile the connect URL is minted against), so a cancelled/closed/failed popup leaves a PENDING_OAUTH
  // row behind. The connect URL on that row is a signed ~5-minute token, so it cannot simply be re-opened later —
  // it has to be re-minted. This skips the profile creation createDestination does and runs only the connect-URL
  // step against the EXISTING vendorProfileId, so no second Profile is created and nothing can be orphaned.
  async function refreshDestinationOAuthUrl(context, args) {
    const id = args.input.id;
    const destination = await dalDestination.loadOwnedDestination(context, id);
    if (destination.status === 'CONNECTED') {
      // Nothing to retry — re-minting here would hand out a connect URL that could rebind a working destination.
      // This is the cheap pre-check: it refuses before spending an Ayrshare JWT on the common case. It is NOT the
      // authoritative guard — see the `notStatus` predicate on the write below.
      throw alreadyConnected();
    }

    // Re-derive allowedSocial from the stored destination type, server-side, exactly as createDestination does —
    // never from the client (BR-1 / R-A5) — and re-check the white-label gate (BR-5) in case the platform has been
    // disabled since the destination was first created.
    const destinationType = await serviceContext.dal.destinationType.getDestinationType(context, {
      id: destination.destinationTypeId
    });
    assertConnectEnabled(destinationType.platform);
    const allowedSocial = deriveAllowedSocial(destinationType.platform);

    const { url, expiresAt } = await adapter().getConnectUrl({
      vendorProfileId: destination.vendorProfileId,
      allowedSocial
    });

    // Re-assert PENDING_OAUTH. A retry is legitimate from DISCONNECTED/ERROR as well as PENDING_OAUTH, but the
    // SDL contracts `oauthUrl` as "short-lived vendor OAuth URL while status is PENDING_OAUTH"
    // (v3DataModel.graphql:3656) — leaving a DISCONNECTED/ERROR row with a live URL would put the row outside
    // that contract, and a client gating the retry affordance on PENDING_OAUTH would never surface the URL the
    // vendor JWT was just spent on. The handshake IS pending again from here, so the status must say so.
    //
    // `notStatus: 'CONNECTED'` makes the guard part of the write. The status read above is stale by the time we
    // get here — getDestinationType plus an outbound generateJWT sit in between — so the original popup can have
    // completed and flipped the row to CONNECTED in that window. An unconditional UPDATE would stamp
    // PENDING_OAUTH back over a working destination, and distributeAsset only accepts CONNECTED, so distribution
    // would fail silently until the user ran complete again.
    const updated = await dalDestination.updateDestination(context, {
      notStatus: 'CONNECTED',
      input: {
        id,
        status: 'PENDING_OAUTH',
        oauthUrl: url,
        oauthUrlExpiresAt: expiresAt
      }
    });
    if (!updated) {
      // Zero rows matched — the guard fired. Log it: this is the rare, hard-to-reproduce event the predicate
      // exists for, and if the window turns out wider than assumed (an Ayrshare latency spike, say) this line is
      // the only signal. No URL, profile key or JWT here — the destination id alone is enough to correlate.
      serviceContext.logger.info('destinationOAuth: refresh lost the race to a concurrent write', {
        destinationId: id
      });
      // Re-load to tell "connected underneath us" from "deleted underneath us" — loadOwnedDestination raises
      // NotFound for the latter, so the client gets the accurate error. This reads the replica, so under lag a
      // concurrent delete can still surface as already-connected; the write predicate stays the authority.
      await dalDestination.loadOwnedDestination(context, id);
      throw alreadyConnected();
    }
    return updated;
  }

  // BE-15. Update label/details; keep the Ayrshare Profile title in sync on a label change.
  async function updateDestination(context, args) {
    const input = args.input;
    const existing = await dalDestination.loadOwnedDestination(context, input.id);

    const updated = await dalDestination.updateDestination(context, {
      input: { id: input.id, label: input.label, details: input.details }
    });

    // Best-effort title sync: the Ayrshare console title mirrors the label, but a cosmetic sync failure must
    // NOT fail the mutation — the destination is already updated and the title can be reconciled later. The
    // refId (<orgId>:<destinationId>) is immutable, so org isolation is unaffected. (multitenancy.md MT-2)
    if (!_.isUndefined(input.label) && input.label !== existing.label) {
      try {
        await adapter().updateProfileLabel({
          vendorProfileId: existing.vendorProfileId,
          orgId: resUtil.getOrgFromAuthContext(context),
          label: input.label
        });
      } catch (err) {
        serviceContext.logger.warn(
          'destinationOAuth: updateProfileLabel sync failed (Ayrshare title drift, non-fatal)',
          { destinationId: input.id, error: err && err.message }
        );
      }
    }
    return updated;
  }

  // BE-15. Soft-delete the destination, then detach (delete) the Ayrshare Profile. The row is deleted first so
  // a failed detach leaves only an orphaned Profile for the reaper (MT-5) rather than failing the user's delete.
  async function deleteDestination(context, args) {
    const existing = await dalDestination.loadOwnedDestination(context, args.id);
    const result = await dalDestination.deleteDestination(context, { id: args.id });
    try {
      await adapter().detachAccount({ vendorProfileId: existing.vendorProfileId });
    } catch (err) {
      serviceContext.logger.warn(
        'destinationOAuth: detachAccount failed (orphaned Ayrshare profile, reaper MT-5)',
        { destinationId: args.id, error: err && err.message }
      );
    }
    return result;
  }

  return {
    createDestination,
    completeDestinationConnection,
    refreshDestinationOAuthUrl,
    updateDestination,
    deleteDestination
  };
};
