'use strict';

const dal = {
  collection: { getCollection: jest.fn() },
  mention: { getMention: jest.fn() }
};
const resolvers = require('./CollectionMention.js')({ dal });

const context = { reqId: 'r1' };

beforeEach(() => {
  dal.collection.getCollection.mockReset();
  dal.mention.getMention.mockReset();
});

describe('CollectionMention.collection', () => {
  it('loads the collection by the folderId and organizationId from the parent object', () => {
    dal.collection.getCollection.mockReturnValue('collection');

    const result = resolvers.collection(
      { folderId: 'f1', organizationId: 'o1', mentionId: 'm1' },
      {},
      context
    );

    expect(dal.collection.getCollection).toHaveBeenCalledWith(context, {
      id: 'f1',
      organizationId: 'o1'
    });
    expect(result).toBe('collection');
  });
});

describe('CollectionMention.mention', () => {
  it('loads the mention by the mentionId and organizationId from the parent object', () => {
    dal.mention.getMention.mockReturnValue('mention');

    const result = resolvers.mention(
      { mentionId: 'm1', organizationId: 'o1', folderId: 'f1' },
      {},
      context
    );

    expect(dal.mention.getMention).toHaveBeenCalledWith(context, {
      id: 'm1',
      organizationId: 'o1'
    });
    expect(result).toBe('mention');
  });
});
