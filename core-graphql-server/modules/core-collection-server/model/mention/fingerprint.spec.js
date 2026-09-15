'use strict';

var Fingerprint = require('./fingerprint');

describe('Fingerprint model — fingerprintId required (row #6)', function () {
  it('enforces fingerprintId as a required field', function () {
    expect(Fingerprint.requiredFields.fingerprintId).toBe(true);
  });

  it('returns a validation error when fingerprintId is missing', function () {
    var instance = new Fingerprint({ spotTypeId: 'type-1' });

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.fingerprintId).toBeTruthy();
  });

  it('returns null validation when fingerprintId is provided', function () {
    var instance = new Fingerprint({ fingerprintId: 'fp-1' });

    expect(instance.validate()).toBeNull();
  });
});
