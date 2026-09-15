'use strict';

var configure = require('./index');

describe('index model aggregator (row #5)', function () {
  it('returns all expected model constructors when configured', function () {
    var models = configure({});

    expect(models.Mention).toBeTruthy();
    expect(models.Comment).toBeTruthy();
    expect(models.Rating).toBeTruthy();
    expect(models.Collection).toBeTruthy();
    expect(models.CollectionBulkQuery).toBeTruthy();
    expect(models.EmailOptions).toBeTruthy();
    expect(models.Widget).toBeTruthy();
    expect(models.Folder).toBeTruthy();
    expect(models.FolderSummary).toBeTruthy();
    expect(models.RootFolder).toBeTruthy();
    expect(models.TreeObjectUpdate).toBeTruthy();
  });

  it('throws when config is not an object', function () {
    expect(function () {
      configure(null);
    }).toThrow('Missing config object');
  });
});
