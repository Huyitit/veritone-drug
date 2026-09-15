'use strict';

const { isLocalStorageEndpointEnabled } = require('./storageEndpoint');

describe('isLocalStorageEndpointEnabled', () => {
  it('returns true when oci.enabled is true (no override needed)', () => {
    expect(isLocalStorageEndpointEnabled({ oci: { enabled: true } })).toBe(true);
  });

  it('returns true when signedWritableUrlOverride is true', () => {
    expect(
      isLocalStorageEndpointEnabled({
        featureFlags: { signedWritableUrlOverride: true }
      })
    ).toBe(true);
  });

  it('returns true when both OCI and the override are enabled', () => {
    expect(
      isLocalStorageEndpointEnabled({
        oci: { enabled: true },
        featureFlags: { signedWritableUrlOverride: true }
      })
    ).toBe(true);
  });

  it('returns false when OCI is disabled and the override is unset', () => {
    expect(
      isLocalStorageEndpointEnabled({
        oci: { enabled: false },
        featureFlags: {}
      })
    ).toBe(false);
  });

  it('returns false for an empty config', () => {
    expect(isLocalStorageEndpointEnabled({})).toBe(false);
  });

  it('does not throw and returns false when config is undefined', () => {
    expect(isLocalStorageEndpointEnabled(undefined)).toBe(false);
  });

  // Azure is intentionally NOT a trigger yet (tracked under VE-23156); guard
  // against a future change accidentally coupling it in without the route work.
  it('returns false when only azure_blob.enabled is set', () => {
    expect(
      isLocalStorageEndpointEnabled({ azure_blob: { enabled: true } })
    ).toBe(false);
  });

  // The predicate is strict-equality on `true`; truthy-but-not-true values
  // (e.g. a stray string) must not silently enable the local endpoint.
  it('requires a strict boolean true, not just a truthy value', () => {
    expect(
      isLocalStorageEndpointEnabled({ oci: { enabled: 'yes' } })
    ).toBe(false);
    expect(
      isLocalStorageEndpointEnabled({
        featureFlags: { signedWritableUrlOverride: 1 }
      })
    ).toBe(false);
  });
});
