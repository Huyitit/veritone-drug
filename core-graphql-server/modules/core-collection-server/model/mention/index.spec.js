'use strict';

var Mention = require('./mention');
var index = require('./index');

describe('model/mention index — re-export (row #8)', function () {
  it('re-exports the Mention constructor', function () {
    expect(index).toBe(Mention);
  });
});
