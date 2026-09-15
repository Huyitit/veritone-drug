'use strict';

const dal = {
  tdo: { getTDO: jest.fn() },
  scheduledJob: { getScheduledJob: jest.fn(), getDetails: jest.fn() }
};
const resolvers = require('./SharedMention.js')({ dal });

const context = { reqId: 'r1' };

beforeEach(() => {
  dal.tdo.getTDO.mockReset();
  dal.scheduledJob.getScheduledJob.mockReset();
  dal.scheduledJob.getDetails.mockReset();
});

describe('SharedMention id-style fallbacks', () => {
  it('id prefers obj.id then obj.mentionId', () => {
    expect(resolvers.id({ id: 'm1', mentionId: 'mx' })).toBe('m1');
    expect(resolvers.id({ mentionId: 'mx' })).toBe('mx');
  });

  it('sourceId / sourceTypeId / scheduledJobId use their media* / program fallbacks', () => {
    expect(resolvers.sourceId({ mediaSourceId: 's9' })).toBe('s9');
    expect(resolvers.sourceTypeId({ mediaSourceTypeId: 'st9' })).toBe('st9');
    expect(resolvers.scheduledJobId({ programId: 'p9' })).toBe('p9');
  });
});

describe('SharedMention.mentionDate (coerceDateToUTC)', () => {
  it('formats a Date and appends Z', () => {
    const result = resolvers.mentionDate({ mentionDate: new Date('2018-02-21T22:59:00Z') });
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('appends Z to a string without a trailing Z', () => {
    expect(resolvers.mentionDate({ mentionDate: '2018-02-21 22:59' })).toBe('2018-02-21 22:59Z');
  });

  it('leaves a string that already ends in Z unchanged', () => {
    expect(resolvers.mentionDate({ mentionDate: '2018-02-21T22:59:00Z' })).toBe('2018-02-21T22:59:00Z');
  });

  it('passes non-date, non-string values through unchanged', () => {
    expect(resolvers.mentionDate({ mentionDate: null })).toBeNull();
  });
});

describe('SharedMention.temporalDataObject', () => {
  it('returns null when there is no mediaId', async () => {
    expect(await resolvers.temporalDataObject({}, {}, context)).toBeNull();
    expect(dal.tdo.getTDO).not.toHaveBeenCalled();
  });

  it('fetches the TDO by stringified mediaId and returns ISO start/stop', async () => {
    dal.tdo.getTDO.mockResolvedValue({
      id: 't1',
      startDateTime: '2018-02-21T22:00:00Z',
      stopDateTime: '2018-02-21T23:00:00Z'
    });
    const result = await resolvers.temporalDataObject({ mediaId: 123 }, {}, context);
    expect(dal.tdo.getTDO).toHaveBeenCalledWith(context, { id: '123' });
    expect(result).toEqual({
      id: 't1',
      startDateTime: '2018-02-21T22:00:00.000Z',
      stopDateTime: '2018-02-21T23:00:00.000Z'
    });
  });
});

describe('SharedMention.scheduledJob', () => {
  it('returns null when there is no scheduled-job id', async () => {
    expect(await resolvers.scheduledJob({}, {}, context)).toBeNull();
    expect(dal.scheduledJob.getScheduledJob).not.toHaveBeenCalled();
  });

  it('picks the scheduled job + detail image fields', async () => {
    dal.scheduledJob.getScheduledJob.mockResolvedValue({
      id: 'sj1',
      name: 'Morning',
      programFormat: 'news',
      extra: 'drop-me'
    });
    dal.scheduledJob.getDetails.mockResolvedValue({
      programImage: 'img',
      programLiveImage: 'live',
      other: 'drop-me'
    });
    const result = await resolvers.scheduledJob({ scheduledJobId: 'sj1' }, {}, context);
    expect(result).toEqual({
      id: 'sj1',
      name: 'Morning',
      programFormat: 'news',
      details: { programImage: 'img', programLiveImage: 'live' }
    });
  });
});
