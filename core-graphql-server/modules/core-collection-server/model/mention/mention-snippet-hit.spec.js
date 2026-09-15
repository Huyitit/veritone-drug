'use strict';

var MentionSnippetHit = require('./mention-snippet-hit');

describe('MentionSnippetHit model — required fields (row #3)', function () {
  it('enforces startTime, endTime, and queryTerm as required fields', function () {
    expect(MentionSnippetHit.requiredFields.startTime).toBe(true);
    expect(MentionSnippetHit.requiredFields.endTime).toBe(true);
    expect(MentionSnippetHit.requiredFields.queryTerm).toBe(true);
  });

  it('returns a validation error when required fields are missing', function () {
    var instance = new MentionSnippetHit({});

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.startTime).toBeTruthy();
    expect(errors.endTime).toBeTruthy();
    expect(errors.queryTerm).toBeTruthy();
  });

  it('returns null validation when all required fields are provided', function () {
    var instance = new MentionSnippetHit({ startTime: 0, endTime: 1000, queryTerm: 'cat' });

    expect(instance.validate()).toBeNull();
  });
});
