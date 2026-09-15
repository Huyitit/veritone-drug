'use strict';

var MentionSnippet = require('./mention-snippet');
var MentionSnippetHit = require('./mention-snippet-hit');

describe('MentionSnippet model — required fields and embedded hits (row #4)', function () {
  it('enforces startTime, endTime, and text as required fields', function () {
    expect(MentionSnippet.requiredFields.startTime).toBe(true);
    expect(MentionSnippet.requiredFields.endTime).toBe(true);
    expect(MentionSnippet.requiredFields.text).toBe(true);
  });

  it('returns a validation error when required fields are missing', function () {
    var instance = new MentionSnippet({});

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.startTime).toBeTruthy();
    expect(errors.endTime).toBeTruthy();
    expect(errors.text).toBeTruthy();
  });

  it('converts hits entries to MentionSnippetHit instances on construction', function () {
    var instance = new MentionSnippet({
      startTime: 0,
      endTime: 1000,
      text: 'test',
      hits: [{ startTime: 0, endTime: 100, queryTerm: 'cat' }]
    });

    expect(instance.hits[0]).toBeInstanceOf(MentionSnippetHit);
  });

  it('returns a validation error when a hits entry is missing required MentionSnippetHit fields', function () {
    var instance = new MentionSnippet({
      startTime: 0,
      endTime: 1000,
      text: 'test',
      hits: [{ startTime: 0 }]
    });

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.hits).toBeTruthy();
  });
});
