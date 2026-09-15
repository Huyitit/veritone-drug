'use strict';

const serviceContext = require('../test/serviceContext.mock.js')();
serviceContext.logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
serviceContext.dal = serviceContext.dal || {};
serviceContext.dal.collection = { getCollection: jest.fn() };
serviceContext.dal.share = { getShares: jest.fn(), getSharedMentions: jest.fn() };

const resolvers = require('./Widget.js')(serviceContext);

const context = { reqId: 'r1' };

beforeEach(() => {
  serviceContext.logger.warn.mockReset();
  serviceContext.dal.collection.getCollection.mockReset();
  serviceContext.dal.share.getShares.mockReset();
  serviceContext.dal.share.getSharedMentions.mockReset();
});

describe('Widget.id', () => {
  it('prefers obj.id', () => {
    expect(resolvers.id({ id: 'w1', widgetId: 'wx' })).toBe('w1');
  });
  it('falls back to obj.widgetId', () => {
    expect(resolvers.id({ widgetId: 'wx' })).toBe('wx');
  });
});

describe('Widget.collection', () => {
  it('loads the collection by collectionId', () => {
    serviceContext.dal.collection.getCollection.mockReturnValue('coll');
    expect(resolvers.collection({ collectionId: 42 }, context)).toBe('coll');
    expect(serviceContext.dal.collection.getCollection).toHaveBeenCalledWith(context, { id: 42 });
  });
});

describe('Widget.mentions', () => {
  it('warns and returns an empty page (no shared-mentions query) when the collection has no share', async () => {
    serviceContext.dal.share.getShares.mockResolvedValue([]);
    const result = await resolvers.mentions({ id: 'w1', collectionId: 42 }, { offset: 0, limit: 10 }, context);

    expect(serviceContext.dal.share.getShares).toHaveBeenCalledWith({
      objectId: '42',
      objectType: 'collection',
      limit: 1
    });
    expect(serviceContext.logger.warn).toHaveBeenCalled();
    expect(serviceContext.dal.share.getSharedMentions).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('resolves shared mentions by mapped shareIds and the share folder', async () => {
    serviceContext.dal.share.getShares.mockResolvedValue([
      { shareInfo: { sharedMentions: [{ shareId: 's1' }, { shareId: 's2' }], objectId: 'folder-1' } }
    ]);
    serviceContext.dal.share.getSharedMentions.mockResolvedValue('mentions-page');

    const result = await resolvers.mentions({ collectionId: 42 }, { offset: 3, limit: 5 }, context);

    expect(serviceContext.dal.share.getSharedMentions).toHaveBeenCalledWith(context, {
      shareId: ['s1', 's2'],
      folderId: 'folder-1',
      offset: 3,
      limit: 5
    });
    expect(result).toBe('mentions-page');
  });
});
