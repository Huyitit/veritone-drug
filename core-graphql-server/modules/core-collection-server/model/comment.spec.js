'use strict';

var Comment = require('./comment');

describe('Comment model (row #3)', function () {
  it('exposes the expected fields', function () {
    var fieldKeys = Comment.allFields.map(function (f) {
      return f.key;
    });
    expect(fieldKeys).toContain('commentId');
    expect(fieldKeys).toContain('mentionId');
    expect(fieldKeys).toContain('userId');
    expect(fieldKeys).toContain('commentText');
    expect(fieldKeys).toContain('dateCreated');
    expect(fieldKeys).toContain('dateModified');
  });

  it('enforces userId presence via validate.js constraint', function () {
    expect(Comment._validation.userId).toMatchObject({ presence: true });
  });

  it('returns a validation error when required userId is missing', function () {
    var instance = new Comment({ commentText: 'hello' });

    var errors = instance.validate();

    expect(errors).not.toBeNull();
    expect(errors.userId).toBeTruthy();
  });

  it('returns null validation for a valid Comment instance', function () {
    var instance = new Comment({ userId: 'u1', commentText: 'A comment' });

    expect(instance.validate()).toBeNull();
  });
});
