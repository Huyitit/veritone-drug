'use strict';

// cgql jest has transform:{} → jest.mock is NOT hoisted; declare mocks and the
// jest.mock call before requiring the module under test.
const mockGetSignedUrl = jest.fn();
const mockGetSignedUrlOrVirtual = jest.fn();
jest.mock('./util.js', () => () => ({
  getSignedUrl: mockGetSignedUrl,
  getSignedUrlOrVirtual: mockGetSignedUrlOrVirtual
}));

const dalShare = { getSharedMentions: jest.fn() };
const resolvers = require('./SharedCollection.js')({ dal: { share: dalShare } });

const context = { reqId: 'r1' };

beforeEach(() => {
  dalShare.getSharedMentions.mockReset();
  mockGetSignedUrl.mockReset();
  mockGetSignedUrlOrVirtual.mockReset();
});

describe('SharedCollection.mentions', () => {
  it('maps the shared mention shareIds and folderId into the dal call, merging extra args', () => {
    dalShare.getSharedMentions.mockResolvedValue('sharedMentions');
    const obj = {
      shareInfo: {
        sharedMentions: [{ shareId: 's1' }, { shareId: 's2' }],
        objectId: 'folder1'
      }
    };

    const result = resolvers.mentions(obj, { limit: 10 }, context);

    expect(dalShare.getSharedMentions).toHaveBeenCalledWith(context, {
      shareId: ['s1', 's2'],
      folderId: 'folder1',
      limit: 10
    });
    return expect(result).resolves.toBe('sharedMentions');
  });
});

describe('SharedCollection.signedImageUrl', () => {
  it('delivers the parent image via util.getSignedUrlOrVirtual (VE-25066)', () => {
    mockGetSignedUrlOrVirtual.mockReturnValue('https://virtual/img');

    const result = resolvers.signedImageUrl({ image: 'img1' });

    expect(mockGetSignedUrlOrVirtual).toHaveBeenCalledWith('img1');
    expect(result).toBe('https://virtual/img');
  });
});
