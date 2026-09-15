'use strict';

// VP-2581 — PublishVendorProfile contract + registry.
//
// The destination/OAuth resolvers (BE-14/BE-15) depend on this contract, NOT on Ayrshare directly, so a second
// publish vendor (e.g. Zernio) can be added later by writing another adapter and registering it here — no
// resolver changes. MVP ships only the Ayrshare adapter.
//
// Contract — every adapter returned by getPublishVendorAdapter() exposes:
//   createProfile({ orgId, destinationId, label })        -> Promise<{ vendorProfileId }>
//   getConnectUrl({ vendorProfileId })                    -> Promise<{ url, token, expiresAt }>
//   verifyConnection({ vendorProfileId })                 -> Promise<{ connectedAccountLabel } | 'PENDING'>
//   detachAccount({ vendorProfileId })                    -> Promise<void>
//   updateProfileLabel({ vendorProfileId, orgId, label }) -> Promise<void>

const REQUIRED_METHODS = [
  'createProfile',
  'getConnectUrl',
  'verifyConnection',
  'detachAccount',
  'updateProfileLabel'
];

module.exports = function publishVendorProfile(serviceContext) {
  // vendor key -> lazy adapter factory. Add new vendors here.
  const factories = {
    ayrshare: () => require('./ayrshareAdapter.js')(serviceContext)
  };
  const adapters = {};

  // `vendor` is the DestinationType.vendorCapability's implied vendor; MVP is always 'ayrshare'.
  function getPublishVendorAdapter(vendor = 'ayrshare') {
    const key = String(vendor || 'ayrshare').toLowerCase();
    const factory = factories[key];
    if (!factory) {
      const errors = require('../../../../error/index.js')(serviceContext.config);
      throw new errors.InternalServerError({
        message: `No publish-vendor adapter registered for '${vendor}'`
      });
    }
    if (!adapters[key]) {
      const adapter = factory();
      for (const m of REQUIRED_METHODS) {
        if (typeof adapter[m] !== 'function') {
          const errors = require('../../../../error/index.js')(serviceContext.config);
          throw new errors.InternalServerError({
            message: `Publish-vendor adapter '${vendor}' is missing method '${m}'`
          });
        }
      }
      adapters[key] = adapter;
    }
    return adapters[key];
  }

  return { getPublishVendorAdapter, REQUIRED_METHODS };
};
