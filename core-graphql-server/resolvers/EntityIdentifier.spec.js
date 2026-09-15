'use strict';

// cgql jest has transform:{} → jest.mock is NOT hoisted; declare the mock fn and
// the jest.mock call before requiring the module under test.
const cacheGet = jest.fn((ctx, params, type, fn) => fn());
jest.mock('./cache.js', () => () => ({ get: cacheGet }));

const dalLibrary = { getEntity: jest.fn() };
const resolvers = require('./EntityIdentifier.js')({ dal: { library: dalLibrary } });

const context = { reqId: 'r1' };

beforeEach(() => {
  cacheGet.mockClear();
  cacheGet.mockImplementation((ctx, params, type, fn) => fn());
  dalLibrary.getEntity.mockReset();
});

describe('EntityIdentifier.entity', () => {
  it('resolves through the resolver cache keyed by entityId, loading via the dal fallback', () => {
    dalLibrary.getEntity.mockReturnValue('entity');

    const result = resolvers.entity({ entityId: 'e1' }, {}, context);

    expect(cacheGet).toHaveBeenCalledWith(
      context,
      { id: 'e1' },
      'Entity',
      expect.any(Function)
    );
    expect(dalLibrary.getEntity).toHaveBeenCalledWith({ id: 'e1' });
    expect(result).toBe('entity');
  });
});

describe('EntityIdentifier.jsonstring', () => {
  it('serializes jsondata to a JSON string when present', () => {
    expect(resolvers.jsonstring({ jsondata: { a: 1 } })).toBe('{"a":1}');
  });

  it('returns an empty string when jsondata is absent', () => {
    expect(resolvers.jsonstring({})).toBe('');
  });
});
