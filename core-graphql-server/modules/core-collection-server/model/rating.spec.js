'use strict';

var Rating = require('./rating');

describe('Rating model (row #1)', function () {
  it('exposes the expected fields', function () {
    var fieldKeys = Rating.allFields.map(function (f) {
      return f.key;
    });
    expect(fieldKeys).toContain('mentionId');
    expect(fieldKeys).toContain('userId');
    expect(fieldKeys).toContain('ratingId');
    expect(fieldKeys).toContain('ratingValue');
    expect(fieldKeys).toContain('dateCreated');
    expect(fieldKeys).toContain('dateModified');
  });

  it('enforces userId presence via validate.js constraint', function () {
    expect(Rating._validation.userId).toMatchObject({ presence: true });
  });

  it('returns a validation error when required userId is missing', function () {
    var instance = new Rating({ mentionId: 'm1' });

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.userId).toBeTruthy();
  });

  it('returns null validation for a valid Rating instance', function () {
    var instance = new Rating({ userId: 'u1', ratingValue: 5 });

    expect(instance.validate()).toBeNull();
  });
});
