'use strict';

// cgql jest has transform:{} → jest.mock is NOT hoisted; declare mock factories and the jest.mock
// calls before requiring the module under test. createModule builds its resolvers by invoking the
// shared Query/Mutation resolver factories — mock them to sentinels so this test asserts the module
// WIRING (shape + serviceContext passthrough + SDL load) without constructing the whole resolver graph.
const queryFactory = jest.fn();
const mutationFactory = jest.fn();
jest.mock('../../resolvers/Query.js', () => queryFactory);
jest.mock('../../resolvers/Mutation.js', () => mutationFactory);

const fs = require('fs');
const createModule = require('./index.js');

const serviceContext = { dal: {}, config: {} };

let readFileSyncSpy;
beforeEach(() => {
  queryFactory.mockReset().mockReturnValue('QUERY_RESOLVERS');
  mutationFactory.mockReset().mockReturnValue('MUTATION_RESOLVERS');
  readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('AUDITLOG_SDL');
});
afterEach(() => readFileSyncSpy.mockRestore());

describe('instanceAuditLog module factory (createModule)', () => {
  it('wires Query and Mutation resolvers from the shared factories, passing the serviceContext through', () => {
    const mod = createModule(serviceContext);

    expect(queryFactory).toHaveBeenCalledWith(serviceContext);
    expect(mutationFactory).toHaveBeenCalledWith(serviceContext);
    expect(mod.resolvers).toEqual({
      Query: 'QUERY_RESOLVERS',
      Mutation: 'MUTATION_RESOLVERS'
    });
  });

  it('loads typeDefs from the instanceAuditLog.graphql SDL file', () => {
    const mod = createModule(serviceContext);

    expect(readFileSyncSpy).toHaveBeenCalledWith(
      './modules/instanceAuditLog/instanceAuditLog.graphql',
      'utf8'
    );
    expect(mod.typeDefs).toEqual(['AUDITLOG_SDL']);
  });
});
