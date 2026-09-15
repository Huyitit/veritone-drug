'use strict';

const serviceContext = require('../../test/serviceContext.mock.js')();

describe('batchActionsAPI index', function() {
  let module;

  beforeAll(function() {
    module = require('./index.js')(serviceContext);
  });

  it('exports typeDefs', function() {
    expect(module.typeDefs).toBeDefined();
    expect(Array.isArray(module.typeDefs)).toBe(true);
    expect(module.typeDefs.length).toBeGreaterThan(0);
  });

  it('exports resolvers with Query, Mutation, TDOBatch, TDOBatchProcess, TDOBatchJobProcess, TDOBatchJobActionResult', function() {
    expect(module.resolvers).toBeDefined();
    const keys = Object.keys(module.resolvers);
    expect(keys).toContain('Query');
    expect(keys).toContain('Mutation');
    expect(keys).toContain('TDOBatch');
    expect(keys).toContain('TDOBatchProcess');
    expect(keys).toContain('TDOBatchJobProcess');
    expect(keys).toContain('TDOBatchJobActionResult');
  });

  it('Query resolvers include createTDOBatch-related functions', function() {
    expect(typeof module.resolvers.Mutation.createTDOBatch).toBe('function');
    expect(typeof module.resolvers.Mutation.cancelTDOBatchProcess).toBe('function');
  });
});
