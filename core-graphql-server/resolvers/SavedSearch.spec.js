'use strict';

const dal = { organization: { getOrganization: jest.fn() } };
const resolvers = require('./SavedSearch.js')({ dal });

function makeContext() {
  return { loaders: { usersById: { load: jest.fn() } } };
}

beforeEach(() => dal.organization.getOrganization.mockReset());

describe('SavedSearch.organization', () => {
  it('loads the organization by the object organizationId', () => {
    dal.organization.getOrganization.mockReturnValue('org');
    const context = makeContext();
    expect(resolvers.organization({ organizationId: 'o1' }, {}, context)).toBe('org');
    expect(dal.organization.getOrganization).toHaveBeenCalledWith(context, { id: 'o1' });
  });
});

describe('SavedSearch.owner', () => {
  it('loads the owner via the usersById loader when ownerId is present', () => {
    const context = makeContext();
    context.loaders.usersById.load.mockReturnValue('the-user');
    expect(resolvers.owner({ ownerId: 'u1' }, {}, context)).toBe('the-user');
    expect(context.loaders.usersById.load).toHaveBeenCalledWith('u1');
  });

  it('returns null when there is no ownerId', () => {
    const context = makeContext();
    expect(resolvers.owner({}, {}, context)).toBeNull();
    expect(context.loaders.usersById.load).not.toHaveBeenCalled();
  });
});
