'use strict';

// VE-24943: coverage for the user-snippets create-model (sibling of the already-tested
// user-snippet.js). startTime, endTime and text are all required; a regression dropping any
// `required: true` would let an incomplete user-snippets payload validate.
var UserSnippets = require('./user-snippets');

describe('UserSnippets model — required fields', function () {
  it('enforces startTime, endTime, and text as required fields', function () {
    expect(UserSnippets.requiredFields.startTime).toBe(true);
    expect(UserSnippets.requiredFields.endTime).toBe(true);
    expect(UserSnippets.requiredFields.text).toBe(true);
  });

  it('exposes startTime, endTime, and text fields', function () {
    var keys = UserSnippets.allFields.map(function (f) {
      return f.key;
    });
    expect(keys).toContain('startTime');
    expect(keys).toContain('endTime');
    expect(keys).toContain('text');
  });

  it('returns a validation error when required fields are missing', function () {
    var errors = new UserSnippets({}).validate();

    expect(errors).not.toBeNull();
    expect(errors.startTime).toBeTruthy();
    expect(errors.endTime).toBeTruthy();
    expect(errors.text).toBeTruthy();
  });

  it('returns null validation when all required fields are provided', function () {
    var instance = new UserSnippets({ startTime: 0, endTime: 1000, text: 'user comment' });

    expect(instance.validate()).toBeNull();
  });
});
