'use strict';

// VE-25263 — ScopedSecret: fetch-from-core resolution of a destination's Ayrshare Profile-Key for the
// distribute engine (ADR-0001, Option A). At task pickup the engine calls this with the scoped task token it
// already receives (createTaskPayload injects `token` + `veritoneApiBaseUrl`) instead of reading the key from
// the task payload. Shaped generically (a scoped-secret resolution); the Profile-Key is the first consumer.
//
// Authorization (BR-7 / DECISION-2), all server-side, fail-closed, deny-by-default:
//   1. engine-run identity ONLY (util.hasEngineJwt) — no human/apikey caller may resolve a raw secret here;
//   2. TASK BINDING (least privilege): the caller may only resolve the key for the destination its OWN task is
//      distributing to — core reads the caller's task (taskId from the token) and requires
//      task.payload.destinationId === the requested destinationId. This keeps the grant no wider than the old
//      payload model (only the distribute task that would have received the key can fetch it), so a different
//      engine/task in the same org cannot harvest other destinations' keys;
//   3. org-scoped destination load (org derived from context, never client input) — defense-in-depth vs IDOR;
//   4. destination must be CONNECTED.
// Never logs the key value (BR-8) — only the fact of the fetch.
//
// The resolved key is returned transit-encrypted (transitCrypto), not in cleartext: authz gates who may fetch,
// transit encryption protects the value across the internal hops and against a forged engine token that lacks
// the shared secret (PR #4457). The engine passes nothing extra beyond its existing task token, but must hold
// the shared secret and decrypt the response (VE-25611). NB: VE-25619 removes `vendorProfileId` from the
// payload but MUST keep `destinationId` there, since the task binding relies on it.

const _ = require('lodash');

module.exports = function createScopedSecret(serviceContext) {
  const { config, logger } = serviceContext;
  const errors = require('../../../../error/index.js')(config);
  const mainUtil = require('../../../../util.js')(serviceContext);
  const resUtil = require('../../../../resolvers/util.js')(serviceContext);
  const transitCrypto = require('./transitCrypto.js')(serviceContext);
  const dalDestination = serviceContext.dal.destination;

  async function resolveDestinationVendorProfile(context, args) {
    const destinationId = args && args.destinationId;

    // 1. Engine identity only.
    if (!mainUtil.hasEngineJwt(context)) {
      throw new errors.NotAllowed({
        message: 'destinationVendorProfile is restricted to the engine execution context.'
      });
    }

    // 2. Task binding — the caller may only resolve the key for the destination its own task distributes to.
    const taskId = _.get(resUtil.getClientInfo(context), 'taskId');
    if (!taskId) {
      throw new errors.NotAllowed({
        message: 'destinationVendorProfile requires a task-scoped engine token.'
      });
    }
    const task = await serviceContext.dal.task.getTask(
      {},
      { id: taskId, useCached: true }
    );
    const taskDestinationId = _.get(task, 'payload.destinationId');
    if (!taskDestinationId || String(taskDestinationId) !== String(destinationId)) {
      // This engine task is not the one distributing to the requested destination — deny (no key).
      throw new errors.NotAllowed({
        message: 'This engine task is not authorized to resolve the requested destination.',
        data: { destinationId }
      });
    }

    // 3. Org-scoped load — NotFound if absent / other org / soft-deleted (org from the token, not input).
    const destination = await dalDestination.loadOwnedDestination(context, destinationId);

    // 4. Only connected destinations resolve.
    if (destination.status !== 'CONNECTED') {
      throw new errors.InvalidInput({
        message: `Destination ${destinationId} is not connected (status: ${destination.status}).`,
        data: { destinationId, status: destination.status }
      });
    }

    // Audit the fact of the fetch — never the value (BR-8 / OBS-1).
    logger.info('destinationVendorProfile: resolved Profile-Key for engine', {
      destinationId,
      organizationId: destination.organizationId,
      taskId
    });

    // loadOwnedDestination -> getDestination -> the DAL map() has already decrypted vendorProfileId. Re-encrypt
    // it for transit under the engine-shared secret so it never crosses the hops in cleartext; the engine
    // decrypts (BR-9 / PR #4457).
    return { vendorProfileIdEncrypted: transitCrypto.encryptForEngine(destination.vendorProfileId) };
  }

  return { resolveDestinationVendorProfile };
};
