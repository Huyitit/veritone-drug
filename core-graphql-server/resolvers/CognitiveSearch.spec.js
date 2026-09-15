'use strict';

const dalWatchlist = { getMentionStatusOption: jest.fn(), toV3Query: jest.fn() };
const resolvers = require('./CognitiveSearch.js')({ dal: { watchlist: dalWatchlist } });

beforeEach(() => {
  dalWatchlist.getMentionStatusOption.mockReset();
  dalWatchlist.toV3Query.mockReset();
});

describe('CognitiveSearch.mentionStatus', () => {
  it('looks up the mention status option by id', () => {
    dalWatchlist.getMentionStatusOption.mockReturnValue('status');
    expect(resolvers.mentionStatus({ mentionStatusId: 'ms1' })).toBe('status');
    expect(dalWatchlist.getMentionStatusOption).toHaveBeenCalledWith({ id: 'ms1' });
  });
});

describe('CognitiveSearch.profile', () => {
  it('returns the raw profile', () => {
    const profile = { some: 'profile' };
    expect(resolvers.profile({ profile })).toBe(profile);
  });
});

describe('CognitiveSearch.query', () => {
  it('returns the stored query when present (without converting)', () => {
    expect(resolvers.query({ query: 'existing', profile: { p: 1 } })).toBe('existing');
    expect(dalWatchlist.toV3Query).not.toHaveBeenCalled();
  });

  it('converts the profile to a v3 query when no query is stored', () => {
    dalWatchlist.toV3Query.mockReturnValue('converted');
    const profile = { p: 1 };
    expect(resolvers.query({ profile })).toBe('converted');
    expect(dalWatchlist.toV3Query).toHaveBeenCalledWith(profile);
  });
});
