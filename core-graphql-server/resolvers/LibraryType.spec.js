'use strict';

const dalLibrary = { getEntityIdentifierTypes: jest.fn() };
const resolvers = require('./LibraryType.js')({ dal: { library: dalLibrary } });

const context = { reqId: 'r1' };
const info = {};

beforeEach(() => dalLibrary.getEntityIdentifierTypes.mockReset());

describe('LibraryType.entityIdentifierTypes', () => {
  it('maps the identifier type ids and queries by ids + libraryTypeId, returning records', async () => {
    dalLibrary.getEntityIdentifierTypes.mockResolvedValue({ records: ['r1', 'r2'] });

    const obj = {
      libraryTypeId: 'lt1',
      entityIdentifierTypes: [{ entityIdentifierTypeId: 't1' }, { entityIdentifierTypeId: 't2' }]
    };
    const result = await resolvers.entityIdentifierTypes(obj, {}, context, info);

    expect(dalLibrary.getEntityIdentifierTypes).toHaveBeenCalledWith({
      ids: ['t1', 't2'],
      libraryTypeId: 'lt1'
    });
    expect(result).toEqual(['r1', 'r2']);
  });

  it('defaults to an empty id list when entityIdentifierTypes is absent', async () => {
    dalLibrary.getEntityIdentifierTypes.mockResolvedValue({ records: [] });

    const result = await resolvers.entityIdentifierTypes({ libraryTypeId: 'lt1' }, {}, context, info);

    expect(dalLibrary.getEntityIdentifierTypes).toHaveBeenCalledWith({ ids: [], libraryTypeId: 'lt1' });
    expect(result).toEqual([]);
  });
});
