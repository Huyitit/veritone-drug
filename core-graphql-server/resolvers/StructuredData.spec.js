'use strict';

const cacheGet = jest.fn((context, args, name, fn) => fn());
jest.mock('./cache.js', () => () => ({ get: cacheGet }));

const mockGetSchema = jest.fn();
const serviceContext = require('../test/serviceContext.mock.js')();
serviceContext.dal = serviceContext.dal || {};
serviceContext.dal.structuredData = { getSchema: mockGetSchema };

const resolvers = require('./StructuredData.js')(serviceContext);

const context = { reqId: 'r1' };

beforeEach(() => {
  cacheGet.mockClear();
  mockGetSchema.mockReset();
});

describe('StructuredData.data', () => {
  it('returns the whole data object when no path is given', () => {
    const data = { a: { b: 5 } };
    expect(resolvers.data({ data }, {})).toBe(data);
  });

  it('extracts a nested value when a path is given', () => {
    expect(resolvers.data({ data: { a: { b: 5 } } }, { path: 'a.b' })).toBe(5);
  });
});

describe('StructuredData.dataString', () => {
  it('serializes the data with the requested indent', () => {
    const obj = { data: { x: 1 } };
    expect(resolvers.dataString(obj, { indent: 2 }, context, {})).toBe(JSON.stringify({ x: 1 }, null, 2));
  });

  it('serializes an empty object when data is absent', () => {
    expect(resolvers.dataString({}, {}, context, {})).toBe('{}');
  });
});

describe('StructuredData.schemaId', () => {
  it('returns the dataRegistryId', () => {
    expect(resolvers.schemaId({ dataRegistryId: 'dr1' })).toBe('dr1');
  });
});

describe('StructuredData.schema', () => {
  it('resolves the schema via the cache keyed by dataRegistryId + organizationId', () => {
    mockGetSchema.mockReturnValue('the-schema');
    const result = resolvers.schema({ dataRegistryId: 'dr1', organizationId: 7 }, {}, context);

    expect(cacheGet).toHaveBeenCalledWith(
      context,
      { id: 'dr1', organizationId: 7 },
      'Schema',
      expect.any(Function)
    );
    expect(mockGetSchema).toHaveBeenCalledWith(context, { id: 'dr1', organizationId: 7 });
    expect(result).toBe('the-schema');
  });
});
