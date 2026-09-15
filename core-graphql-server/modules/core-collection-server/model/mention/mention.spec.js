'use strict';

var Mention = require('./mention');
var MentionSnippet = require('./mention-snippet');

describe('Mention model — organizationId validation (row #1)', function () {
  it('enforces presence and minimum-length constraints on organizationId', function () {
    expect(Mention._validation.organizationId).toMatchObject({
      presence: true,
      length: { minimum: 1 }
    });
  });

  it('returns a validation error when organizationId is missing', function () {
    var instance = new Mention({ mentionId: 'm1' });

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.organizationId).toBeTruthy();
  });

  it('returns null validation for a Mention with a valid organizationId', function () {
    var instance = new Mention({ organizationId: 'org-1' });

    expect(instance.validate()).toBeNull();
  });
});

describe('Mention model — mentionSnippets embeddedModelArray (row #2)', function () {
  it('converts mentionSnippets array entries to MentionSnippet instances on construction', function () {
    var instance = new Mention({
      organizationId: 'org-1',
      mentionSnippets: [{ startTime: 0, endTime: 1000, text: 'snippet' }]
    });

    expect(instance.mentionSnippets[0]).toBeInstanceOf(MentionSnippet);
  });

  it('returns a validation error when a mentionSnippets entry is missing required fields', function () {
    var instance = new Mention({
      organizationId: 'org-1',
      mentionSnippets: [{ startTime: 0 }]
    });

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.mentionSnippets).toBeTruthy();
  });
});
