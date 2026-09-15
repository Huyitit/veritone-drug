'use strict';

const chaiExpect = require('chai').expect;

const createResolvers = require('./InternalToken.js');

describe('InternalToken field resolvers', () => {
  let resolvers;

  beforeEach(() => {
    resolvers = createResolvers({});
  });

  it('extracts createdDateTime from object.json path', () => {
    const obj = { json: { createdDateTime: '2024-01-15T00:00:00Z' } };
    chaiExpect(resolvers.createdDateTime(obj)).to.equal('2024-01-15T00:00:00Z');
  });

  it('returns undefined when the json field is absent', () => {
    chaiExpect(resolvers.createdDateTime({})).to.equal(undefined);
  });
});
