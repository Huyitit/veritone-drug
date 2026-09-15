'use strict';

var fs = require('fs');

var createModule = require('./index');

describe('root module factory (index.js)', function () {
  var mod, readSpy;

  beforeEach(function () {
    readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('ROOT_TYPEDEFS');
    mod = createModule({ config: {} });
  });

  afterEach(function () {
    readSpy.mockRestore();
  });

  it('returns a module with exactly resolvers and typeDefs', function () {
    expect(Object.keys(mod).sort()).toEqual(['resolvers', 'typeDefs']);
  });

  it('contributes no resolvers (root module is type defs / directives only)', function () {
    expect(mod.resolvers).toEqual({});
  });

  it('loads typeDefs from the root.graphql schema file', function () {
    expect(readSpy).toHaveBeenCalledWith('./modules/root/root.graphql', 'utf8');
    expect(mod.typeDefs).toEqual(['ROOT_TYPEDEFS']);
  });
});
