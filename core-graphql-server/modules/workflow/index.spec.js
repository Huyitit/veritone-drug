'use strict';

var fs = require('fs');

// Mock the Query/Mutation resolver factories so the module factory can be tested
// without real resolver wiring. (cgql jest runs with `transform: {}` — no hoisting —
// so jest.mock() is declared before require('./index') and closes over these vars.)
var queryFactory = jest.fn();
var mutationFactory = jest.fn();

jest.mock('./Query.js', function () {
  return queryFactory;
});
jest.mock('./Mutation.js', function () {
  return mutationFactory;
});

var createModule = require('./index');

describe('workflow module factory (index.js)', function () {
  var serviceContext, mod, readSpy;

  beforeEach(function () {
    queryFactory.mockReset().mockReturnValue({ resolver: 'QUERY' });
    mutationFactory.mockReset().mockReturnValue({ resolver: 'MUTATION' });
    readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('WORKFLOW_TYPEDEFS');

    serviceContext = { config: { workflow: true } };
    mod = createModule(serviceContext);
  });

  afterEach(function () {
    readSpy.mockRestore();
  });

  it('returns a module with exactly resolvers and typeDefs', function () {
    expect(Object.keys(mod).sort()).toEqual(['resolvers', 'typeDefs']);
  });

  it('wires Query and Mutation resolvers from their factories with (serviceContext, config)', function () {
    expect(mod.resolvers.Query).toEqual({ resolver: 'QUERY' });
    expect(mod.resolvers.Mutation).toEqual({ resolver: 'MUTATION' });
    expect(queryFactory).toHaveBeenCalledWith(serviceContext, serviceContext.config);
    expect(mutationFactory).toHaveBeenCalledWith(serviceContext, serviceContext.config);
  });

  it('loads typeDefs from the workflow.graphql schema file', function () {
    expect(readSpy).toHaveBeenCalledWith(
      './modules/workflow/workflow.graphql',
      'utf8'
    );
    expect(mod.typeDefs).toEqual(['WORKFLOW_TYPEDEFS']);
  });
});
