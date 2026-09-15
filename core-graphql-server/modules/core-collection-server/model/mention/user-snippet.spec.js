'use strict';

var UserSnippet = require('./user-snippet');

describe('UserSnippet model — required fields (row #5)', function () {
  it('enforces startTime, endTime, and text as required fields', function () {
    expect(UserSnippet.requiredFields.startTime).toBe(true);
    expect(UserSnippet.requiredFields.endTime).toBe(true);
    expect(UserSnippet.requiredFields.text).toBe(true);
  });

  it('returns a validation error when required fields are missing', function () {
    var instance = new UserSnippet({});

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.startTime).toBeTruthy();
    expect(errors.endTime).toBeTruthy();
    expect(errors.text).toBeTruthy();
  });

  it('returns null validation when all required fields are provided', function () {
    var instance = new UserSnippet({
      startTime: 0,
      endTime: 1000,
      text: 'user comment',
      transcriptStartDate: new Date('2025-01-01'),
      transcriptEndDate: new Date('2025-01-02')
    });

    expect(instance.validate()).toBeNull();
  });
});
