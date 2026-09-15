'use strict';

const Watchlist = require('./Watchlist.js');

function makeDal(overrides = {}) {
  return {
    scheduledJob: { getScheduledJobs: jest.fn() },
    sourceType: { getCombinedSourceTypeIds: jest.fn() },
    source: { name: 'source-dal' },
    mention: {},
    creative: { getCreative: jest.fn() },
    watchlist: { populateDetails: jest.fn() },
    ...overrides
  };
}

const context = { reqId: 'r1' };

describe('v3DataModel Watchlist resolver factory', () => {
  it('throws when a required dal collaborator is missing', () => {
    expect(() => Watchlist({ dal: makeDal({ scheduledJob: undefined }) })).toThrow('dalScheduledJob');
    expect(() => Watchlist({ dal: makeDal({ sourceType: undefined }) })).toThrow('dalSourceTYpe');
    expect(() => Watchlist({ dal: makeDal({ source: undefined }) })).toThrow('dalSource');
  });
});

describe('v3DataModel Watchlist.schedules', () => {
  it('returns an empty page (echoing offset/limit) when there are no program ids', async () => {
    const dal = makeDal();
    dal.watchlist.populateDetails.mockResolvedValue({ programIds: [] });
    const resolvers = Watchlist({ dal });

    const result = await resolvers.schedules({ id: 'w1' }, { offset: 5, limit: 10 }, context);

    expect(result).toEqual({ count: 0, offset: 5, limit: 10, records: [] });
    expect(dal.scheduledJob.getScheduledJobs).not.toHaveBeenCalled();
  });

  it('fetches scheduled jobs by program ids merged with the args', async () => {
    const dal = makeDal();
    dal.watchlist.populateDetails.mockResolvedValue({ programIds: ['p1', 'p2'] });
    dal.scheduledJob.getScheduledJobs.mockResolvedValue('jobs');
    const resolvers = Watchlist({ dal });

    const result = await resolvers.schedules({ id: 'w1' }, { offset: 0, limit: 20 }, context);

    expect(dal.scheduledJob.getScheduledJobs).toHaveBeenCalledWith(context, {
      id: ['p1', 'p2'],
      offset: 0,
      limit: 20
    });
    expect(result).toBe('jobs');
  });

  it('treats nil details as no program ids', async () => {
    const dal = makeDal();
    dal.watchlist.populateDetails.mockResolvedValue(null);
    const resolvers = Watchlist({ dal });

    const result = await resolvers.schedules({ id: 'w1' }, { offset: 1, limit: 2 }, context);
    expect(result).toEqual({ count: 0, offset: 1, limit: 2, records: [] });
  });
});

describe('v3DataModel Watchlist.combinedSourceTypeIds', () => {
  it('delegates to dalSourceType with source, scheduledJob, and the object', () => {
    const dal = makeDal();
    dal.sourceType.getCombinedSourceTypeIds.mockReturnValue('ids');
    const resolvers = Watchlist({ dal });
    const object = { id: 'w1' };

    const result = resolvers.combinedSourceTypeIds(object, {}, context);

    expect(dal.sourceType.getCombinedSourceTypeIds).toHaveBeenCalledWith(
      context,
      dal.source,
      dal.scheduledJob,
      object
    );
    expect(result).toBe('ids');
  });
});

describe('v3DataModel Watchlist.creative', () => {
  it('loads the creative by id and organizationId when creativeId is present', async () => {
    const dal = makeDal();
    dal.creative.getCreative.mockResolvedValue('the-creative');
    const resolvers = Watchlist({ dal });

    const result = await resolvers.creative({ creativeId: 'c1' }, { organizationId: 7 }, context);

    expect(dal.creative.getCreative).toHaveBeenCalledWith({ id: 'c1', organizationId: 7 }, context);
    expect(result).toBe('the-creative');
  });

  it('returns null when creativeId is absent', async () => {
    const dal = makeDal();
    const resolvers = Watchlist({ dal });
    expect(await resolvers.creative({}, {}, context)).toBeNull();
    expect(dal.creative.getCreative).not.toHaveBeenCalled();
  });
});
