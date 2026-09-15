'use strict';

const dalLibrary = { getEntityIdentifierItems: jest.fn() };
const resolvers = require('./EntityIdentifierType.js')({ dal: { library: dalLibrary } });

beforeEach(() => dalLibrary.getEntityIdentifierItems.mockReset());

describe('EntityIdentifierType.dataType', () => {
  it('returns the raw dataType', () => {
    expect(resolvers.dataType({ dataType: 'string' })).toBe('string');
  });
});

describe('EntityIdentifierType.entityIdentifierItems', () => {
  it('queries items by the type id + libraryTypeId arg and returns records', async () => {
    dalLibrary.getEntityIdentifierItems.mockResolvedValue({ records: ['i1', 'i2'] });

    const result = await resolvers.entityIdentifierItems({ id: 'eit1' }, { libraryTypeId: 'lt1' });

    expect(dalLibrary.getEntityIdentifierItems).toHaveBeenCalledWith({
      entityIdentifierTypeId: 'eit1',
      libraryTypeId: 'lt1'
    });
    expect(result).toEqual(['i1', 'i2']);
  });
});
