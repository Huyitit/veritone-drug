'use strict';

var EmailOptions = require('./email-options');
var EmailOptionsIndex = require('./');

describe('EmailOptions model', function () {
  describe('validateTemplateId', function () {
    it('row #1: requires templateId when toEmail has recipients', function () {
      var instance = new EmailOptions({ toEmail: 'user@example.com' });
      var errors = instance.validate();
      expect(errors).not.toBeNull();
      expect(errors.templateId).toBeTruthy();
    });

    it('row #1: no validation error when toEmail has recipients and templateId is provided', function () {
      var instance = new EmailOptions({ toEmail: 'user@example.com', templateId: 'tmpl-abc' });
      expect(instance.validate()).toBeNull();
    });

    it('row #2: templateId not required when toEmail is absent', function () {
      var instance = new EmailOptions({ fromEmail: 'sender@example.com' });
      expect(instance.validate()).toBeNull();
    });

    it('row #3: templateId not required when toEmail is an empty array', function () {
      var instance = new EmailOptions({ toEmail: [] });
      expect(instance.validate()).toBeNull();
    });

    it('row #4: whitespace-only toEmail converts to non-empty array, so templateId is still required', function () {
      var instance = new EmailOptions({ toEmail: '   ' });
      expect(instance.toEmail).toEqual(['']);
      var errors = instance.validate();
      expect(errors).not.toBeNull();
      expect(errors.templateId).toBeTruthy();
    });
  });

  describe('toEmail converter', function () {
    it('row #5: splits comma-delimited string into trimmed array', function () {
      var instance = new EmailOptions({ toEmail: 'a@b.com, c@d.com' });
      expect(instance.toEmail).toEqual(['a@b.com', 'c@d.com']);
    });

    it('row #5: single address string becomes single-element array', function () {
      var instance = new EmailOptions({ toEmail: 'solo@example.com' });
      expect(instance.toEmail).toEqual(['solo@example.com']);
    });
  });

  describe('index.js re-export', function () {
    it('row #6: index.js re-exports the EmailOptions constructor', function () {
      expect(EmailOptionsIndex).toBe(EmailOptions);
    });
  });
});
