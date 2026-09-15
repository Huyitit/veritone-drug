'use strict';

var AdCreative = require('./ad-creative');

describe('AdCreative model — schema fields (row #7)', function () {
  it('exposes isci, adId, and title fields', function () {
    var fieldKeys = AdCreative.allFields.map(function (f) {
      return f.key;
    });

    expect(fieldKeys).toContain('isci');
    expect(fieldKeys).toContain('adId');
    expect(fieldKeys).toContain('title');
  });

  it('populates adId and isci from construction data', function () {
    var instance = new AdCreative({ isci: 'ISCI001', adId: 'ad-1', title: 'Campaign Ad' });

    expect(instance.isci).toBe('ISCI001');
    expect(instance.adId).toBe('ad-1');
  });

  it('returns null validation for a valid AdCreative instance', function () {
    var instance = new AdCreative({ isci: 'ISCI001', adId: 'ad-1' });

    expect(instance.validate()).toBeNull();
  });
});
