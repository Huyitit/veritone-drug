'use strict';

const serviceContext = require('../test/serviceContext.mock.js')();
const mockGetInvites = jest.fn();
serviceContext.dal = serviceContext.dal || {};
serviceContext.dal.organizationInvite = { getOrganizationInvites: mockGetInvites };

const resolvers = require('./OrganizationInfo.js')(serviceContext);

const context = { reqId: 'r1' };

beforeEach(() => mockGetInvites.mockReset());

describe('OrganizationInfo.guid', () => {
  it('returns the organizationGuid off the object', () => {
    expect(resolvers.guid({ organizationGuid: 'guid-1' })).toBe('guid-1');
  });
});

describe('OrganizationInfo.isUserPendingMember', () => {
  it('returns false without querying when the email is missing', async () => {
    expect(await resolvers.isUserPendingMember({ id: 7 }, {}, context)).toBe(false);
    expect(mockGetInvites).not.toHaveBeenCalled();
  });

  it('returns false without querying when the email is an empty string', async () => {
    expect(await resolvers.isUserPendingMember({ id: 7 }, { email: '' }, context)).toBe(false);
    expect(mockGetInvites).not.toHaveBeenCalled();
  });

  it('queries invites scoped to the org, email, and pending statuses and returns true when any exist', async () => {
    mockGetInvites.mockResolvedValue([{ id: 'inv1' }]);
    const result = await resolvers.isUserPendingMember({ id: 7 }, { email: 'a@b.com' }, context);

    expect(mockGetInvites).toHaveBeenCalledWith(
      { organizationId: 7 },
      { email: 'a@b.com', statuses: ['submitted', 'approved', 'completed'] },
      context
    );
    expect(result).toBe(true);
  });

  it('returns false when no matching invites exist', async () => {
    mockGetInvites.mockResolvedValue([]);
    expect(await resolvers.isUserPendingMember({ id: 7 }, { email: 'a@b.com' }, context)).toBe(false);
  });
});
