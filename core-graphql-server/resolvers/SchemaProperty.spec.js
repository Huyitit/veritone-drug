'use strict';
const chaiExpect = require('chai').expect;

const serviceContext = require('../test/serviceContext.mock.js')();

const resolvers = require('./SchemaProperty.js')(serviceContext);

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#SchemaProperty', function () {
  describe('#searchPath', function () {
    it('constructs the structured-data search index path', function () {
      const result = resolvers.searchPath({ storageName: 'myStore', path: 'field.subfield' });
      chaiExpect(result).to.equal('myStore.series.field.subfield');
    });
  });
});
