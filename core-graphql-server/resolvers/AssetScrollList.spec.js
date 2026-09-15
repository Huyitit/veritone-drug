'use strict';

// cgql jest has transform:{} → jest.mock is NOT hoisted; declare mocks and the
// jest.mock call before requiring the module under test.
const mockToPage = jest.fn();
jest.mock('../util.js', () => () => ({ toPage: mockToPage }));

const dalAsset = { getAsset: jest.fn() };
const resolvers = require('./AssetScrollList.js')({ dal: { asset: dalAsset } });

const context = { reqId: 'r1' };

// Builds the GraphQL `info` shape the resolver walks to discover requested fields.
function infoFor(fieldNames) {
  return {
    fieldNodes: [
      {
        selectionSet: {
          selections: [
            {
              selectionSet: {
                selections: fieldNames.map((n) => ({ name: { value: n } }))
              }
            }
          ]
        }
      }
    ]
  };
}

beforeEach(() => {
  mockToPage.mockReset();
  dalAsset.getAsset.mockReset();
});

describe('AssetScrollList.assets', () => {
  it('short-circuits without db calls when the requested fields are a subset of id/containerId', async () => {
    mockToPage.mockReturnValue('page');
    const obj = { assets: [{ id: 'a1' }, { id: 'a2' }] };

    const result = await resolvers.assets(
      obj,
      { limit: 5 },
      context,
      infoFor(['id', 'containerId'])
    );

    expect(dalAsset.getAsset).not.toHaveBeenCalled();
    expect(mockToPage).toHaveBeenCalledWith({ limit: 5 }, obj.assets);
    expect(result).toBe('page');
  });

  it('fetches each asset from the dal when a field outside id/containerId is requested', async () => {
    dalAsset.getAsset.mockResolvedValue('full');
    mockToPage.mockReturnValue('page');
    const obj = { assets: [{ id: 'a1' }, { id: 'a2' }] };

    const result = await resolvers.assets(
      obj,
      { limit: 5 },
      context,
      infoFor(['id', 'name'])
    );

    expect(dalAsset.getAsset).toHaveBeenCalledWith(context, { id: 'a1' });
    expect(dalAsset.getAsset).toHaveBeenCalledWith(context, { id: 'a2' });
    expect(mockToPage).toHaveBeenCalledWith({ limit: 5 }, ['full', 'full']);
    expect(result).toBe('page');
  });

  it('fetches from the dal when no field selection info is present', async () => {
    dalAsset.getAsset.mockResolvedValue('full');
    mockToPage.mockReturnValue('page');
    const obj = { assets: [{ id: 'a1' }] };

    await resolvers.assets(obj, { limit: 5 }, context, undefined);

    expect(dalAsset.getAsset).toHaveBeenCalledWith(context, { id: 'a1' });
    expect(mockToPage).toHaveBeenCalledWith({ limit: 5 }, ['full']);
  });
});

describe('AssetScrollList.scrollId', () => {
  it('returns the parent scrollId', () => {
    expect(resolvers.scrollId({ scrollId: 'scroll-1', id: 'other' })).toBe(
      'scroll-1'
    );
  });
});
