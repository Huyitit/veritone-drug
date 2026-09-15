'use strict';

const dal = {
  mention: { getCampaign: jest.fn() },
  organization: { getOrganization: jest.fn() }
};
const resolvers = require('./Mention.js')({ dal });

const context = { reqId: 'r1' };

beforeEach(() => {
  dal.mention.getCampaign.mockReset();
  dal.organization.getOrganization.mockReset();
});

describe('Mention.id', () => {
  it('prefers obj.id then obj.mentionId', () => {
    expect(resolvers.id({ id: 'm1', mentionId: 'mx' })).toBe('m1');
    expect(resolvers.id({ mentionId: 'mx' })).toBe('mx');
  });
});

describe('Mention.mentionDate', () => {
  it('appends Z to a string timestamp', () => {
    expect(resolvers.mentionDate({ mentionDate: '2018-02-21 22:59' })).toBe('2018-02-21 22:59Z');
  });
  it('passes a non-string value through unchanged', () => {
    expect(resolvers.mentionDate({ mentionDate: null })).toBeNull();
  });
});

describe('Mention.mentionRating', () => {
  it('returns the rating when set', () => {
    expect(resolvers.mentionRating({ rating: 4 })).toBe(4);
  });
  it('returns null when the rating is absent', () => {
    expect(resolvers.mentionRating({})).toBeNull();
  });
});

describe('Mention.campaign', () => {
  it('loads the campaign by id when present', async () => {
    dal.mention.getCampaign.mockResolvedValue('camp');
    expect(await resolvers.campaign({ campaignId: 'c1' })).toBe('camp');
    expect(dal.mention.getCampaign).toHaveBeenCalledWith({ id: 'c1' });
  });
  it('returns null when there is no campaignId', async () => {
    expect(await resolvers.campaign({})).toBeNull();
    expect(dal.mention.getCampaign).not.toHaveBeenCalled();
  });
});

describe('Mention.organization', () => {
  it('loads the organization by id when present', () => {
    dal.organization.getOrganization.mockReturnValue('org');
    expect(resolvers.organization({ organizationId: 'o1' }, {}, context)).toBe('org');
    expect(dal.organization.getOrganization).toHaveBeenCalledWith(context, { id: 'o1' });
  });
  it('returns null when there is no organizationId', () => {
    expect(resolvers.organization({}, {}, context)).toBeNull();
  });
});

describe('Mention.audience', () => {
  it('uses obj.audience when present', () => {
    expect(resolvers.audience({ audience: 50, dma_aqh_audience: 30 })).toBe(50);
  });
  it('falls back to dma_aqh_audience when audience is nil', () => {
    expect(resolvers.audience({ dma_aqh_audience: 30 })).toBe(30);
  });
  it('defaults to 0 when both are nil', () => {
    expect(resolvers.audience({})).toBe(0);
  });
});
