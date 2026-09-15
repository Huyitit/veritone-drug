'use strict';

const dalEngineCategory = { getEngineCategories: jest.fn() };
const resolvers = require('./EngineDependency.js')({ dal: { engineCategory: dalEngineCategory } });

const context = {};

beforeEach(() => dalEngineCategory.getEngineCategories.mockReset());

describe('EngineDependency.category', () => {
  it('queries engine categories by the dependency type and returns the first record when any match', async () => {
    dalEngineCategory.getEngineCategories.mockResolvedValue({ count: 2, records: ['c1', 'c2'] });

    const result = await resolvers.category({ dependencyType: 'transcription' }, {}, context);

    expect(dalEngineCategory.getEngineCategories).toHaveBeenCalledWith({ categoryKey: 'transcription' });
    expect(result).toBe('c1');
  });

  it('returns null when there are no matching categories', async () => {
    dalEngineCategory.getEngineCategories.mockResolvedValue({ count: 0, records: [] });

    const result = await resolvers.category({ dependencyType: 'transcription' }, {}, context);
    expect(result).toBeNull();
  });
});
