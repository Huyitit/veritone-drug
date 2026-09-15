'use strict';

jest.mock('./ayrshareAdapter.js', () => jest.fn());

const ayrshareFactory = require('./ayrshareAdapter.js');
const serviceContext = require('../../../../test/serviceContext.mock.js')();
const publishVendorProfile = require('./publishVendorProfile.js');

const REQUIRED_METHODS = [
  'createProfile',
  'getConnectUrl',
  'verifyConnection',
  'detachAccount',
  'updateProfileLabel'
];

function completeAdapter() {
  return REQUIRED_METHODS.reduce((a, m) => {
    a[m] = jest.fn();
    return a;
  }, {});
}

beforeEach(() => ayrshareFactory.mockReset());

describe('v3DataModel publishVendorProfile registry', () => {
  it('exposes the required-methods contract', () => {
    const registry = publishVendorProfile(serviceContext);
    expect(registry.REQUIRED_METHODS).toEqual(REQUIRED_METHODS);
  });

  it('returns the ayrshare adapter by default', () => {
    const adapter = completeAdapter();
    ayrshareFactory.mockReturnValue(adapter);
    const registry = publishVendorProfile(serviceContext);
    expect(registry.getPublishVendorAdapter()).toBe(adapter);
  });

  it('resolves the vendor case-insensitively', () => {
    const adapter = completeAdapter();
    ayrshareFactory.mockReturnValue(adapter);
    const registry = publishVendorProfile(serviceContext);
    expect(registry.getPublishVendorAdapter('AYRSHARE')).toBe(adapter);
  });

  it('caches the adapter so the factory runs only once across calls', () => {
    ayrshareFactory.mockReturnValue(completeAdapter());
    const registry = publishVendorProfile(serviceContext);
    registry.getPublishVendorAdapter();
    registry.getPublishVendorAdapter('ayrshare');
    expect(ayrshareFactory).toHaveBeenCalledTimes(1);
  });

  it('throws for an unregistered vendor', () => {
    const registry = publishVendorProfile(serviceContext);
    expect(() => registry.getPublishVendorAdapter('zernio')).toThrow(
      "No publish-vendor adapter registered for 'zernio'"
    );
    expect(ayrshareFactory).not.toHaveBeenCalled();
  });

  it('throws when the adapter is missing a required method', () => {
    const incomplete = completeAdapter();
    delete incomplete.detachAccount;
    ayrshareFactory.mockReturnValue(incomplete);
    const registry = publishVendorProfile(serviceContext);
    expect(() => registry.getPublishVendorAdapter()).toThrow(
      "missing method 'detachAccount'"
    );
  });
});
