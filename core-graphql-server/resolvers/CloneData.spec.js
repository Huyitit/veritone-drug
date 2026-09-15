'use strict';

const resolvers = require('./CloneData.js')({});

const MAP = [
  { oldAssetId: 'o1', newAssetId: 'n1' },
  { oldAssetId: 'o1', newAssetId: 'n2' },
  { oldAssetId: 'o2', newAssetId: 'n1' }
];

const assetIdMap = (obj, args) => resolvers.assetIdMap(obj, args, {}, {});

describe('CloneData.assetIdMap', () => {
  it('returns the full map when no filter args are supplied', () => {
    expect(assetIdMap({ assetIdMap: MAP }, {})).toEqual(MAP);
  });

  it('returns an empty array when the object has no assetIdMap', () => {
    expect(assetIdMap({}, {})).toEqual([]);
  });

  it('filters by both old and new asset id when both are provided', () => {
    expect(assetIdMap({ assetIdMap: MAP }, { oldAssetId: 'o1', newAssetId: 'n1' })).toEqual([
      { oldAssetId: 'o1', newAssetId: 'n1' }
    ]);
  });

  it('filters by old asset id alone', () => {
    expect(assetIdMap({ assetIdMap: MAP }, { oldAssetId: 'o1' })).toEqual([
      { oldAssetId: 'o1', newAssetId: 'n1' },
      { oldAssetId: 'o1', newAssetId: 'n2' }
    ]);
  });

  it('filters by new asset id alone', () => {
    expect(assetIdMap({ assetIdMap: MAP }, { newAssetId: 'n1' })).toEqual([
      { oldAssetId: 'o1', newAssetId: 'n1' },
      { oldAssetId: 'o2', newAssetId: 'n1' }
    ]);
  });

  it('requires both ids to match in the both-provided branch (an old-only match is excluded)', () => {
    // o1 appears with n1 and n2; asking for o1 + n1 must exclude the o1/n2 entry
    expect(assetIdMap({ assetIdMap: MAP }, { oldAssetId: 'o1', newAssetId: 'n2' })).toEqual([
      { oldAssetId: 'o1', newAssetId: 'n2' }
    ]);
  });
});
