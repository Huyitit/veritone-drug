'use strict';

var Widget = require('./widget');

// A minimal Widget that satisfies every required field.
// Used as a base for tests that need a valid instance to isolate one field.
var BASE_WIDGET = {
  widgetId: 'w1',
  organizationId: 'org-1',
  collectionId: 'col-1',
  displayCollectionName: true,
  displayCollectionDescription: false,
  displayLogo: false,
  displayMentionIntro: false,
  displayTranscription: false,
  displayMentionDescription: false,
  width: 800,
  numberOfMentionsToShow: 5
};

describe('Widget model — schema (row #1)', function () {
  it('exposes the expected fields', function () {
    var fieldKeys = Widget.allFields.map(function (f) {
      return f.key;
    });

    expect(fieldKeys).toContain('widgetId');
    expect(fieldKeys).toContain('organizationId');
    expect(fieldKeys).toContain('collectionId');
    expect(fieldKeys).toContain('displayCollectionName');
    expect(fieldKeys).toContain('width');
    expect(fieldKeys).toContain('numberOfMentionsToShow');
    expect(fieldKeys).toContain('seoTags');
    expect(fieldKeys).toContain('backgroundColor');
    expect(fieldKeys).toContain('dateCreated');
  });

  it('marks boolean display fields and numeric size fields as required', function () {
    expect(Widget.requiredFields).toMatchObject({
      displayCollectionName: true,
      displayCollectionDescription: true,
      displayLogo: true,
      displayMentionIntro: true,
      displayTranscription: true,
      displayMentionDescription: true,
      width: true,
      numberOfMentionsToShow: true
    });
  });

  it('enforces presence and minimum-length constraints on widgetId via validate.js', function () {
    expect(Widget._validation.widgetId).toMatchObject({
      presence: true,
      length: { minimum: 1 }
    });
  });

  it('returns a validation error when required boolean display fields are absent', function () {
    var instance = new Widget({ widgetId: 'w1', organizationId: 'org-1', collectionId: 'col-1' });

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.displayCollectionName).toBeTruthy();
  });

  it('returns null validation for a fully populated Widget', function () {
    var instance = new Widget(BASE_WIDGET);

    expect(instance.validate()).toBeNull();
  });
});

describe('widget/index.js — re-exports (row #2)', function () {
  it('re-exports Widget as the module default', function () {
    expect(require('./index')).toBe(Widget);
  });
});

describe('Widget model — validateHexColor (row #3)', function () {
  it('returns null when no color field is provided', function () {
    var instance = new Widget(BASE_WIDGET);

    expect(instance.validate()).toBeNull();
  });

  it('accepts a valid 6-character hex color code', function () {
    var instance = new Widget(Object.assign({}, BASE_WIDGET, { backgroundColor: 'ABCDEF' }));

    expect(instance.validate()).toBeNull();
  });

  it('accepts a valid 3-character hex color code', function () {
    var instance = new Widget(Object.assign({}, BASE_WIDGET, { backgroundColor: 'ABC' }));

    expect(instance.validate()).toBeNull();
  });

  it('returns a validation error for a named-color string', function () {
    var instance = new Widget(Object.assign({}, BASE_WIDGET, { backgroundColor: 'red' }));

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.backgroundColor).toBeTruthy();
  });

  it('returns a validation error for a hash-prefixed hex string', function () {
    var instance = new Widget(Object.assign({}, BASE_WIDGET, { backgroundColor: '#ABCDEF' }));

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.backgroundColor).toBeTruthy();
  });
});

describe('Widget model — validateStringArray (row #4)', function () {
  it('returns null when seoTags is absent', function () {
    var instance = new Widget(BASE_WIDGET);

    expect(instance.validate()).toBeNull();
  });

  it('accepts a valid array of non-empty strings', function () {
    var instance = new Widget(Object.assign({}, BASE_WIDGET, { seoTags: ['news', 'sports'] }));

    expect(instance.validate()).toBeNull();
  });

  it('returns a validation error when seoTags is not an array', function () {
    var instance = new Widget(Object.assign({}, BASE_WIDGET, { seoTags: 'news' }));

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.seoTags).toBeTruthy();
  });

  it('returns a validation error when seoTags contains an empty string', function () {
    var instance = new Widget(Object.assign({}, BASE_WIDGET, { seoTags: ['news', ''] }));

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.seoTags).toBeTruthy();
  });
});
