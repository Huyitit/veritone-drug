'use strict';

jest.mock('../dal/mapper', () => ({
  mapUser: jest.fn((u) => ({ mappedUser: u })),
  mapOrganization: jest.fn((o) => ({ mappedOrg: o })),
  mapGroup: jest.fn((g) => ({ mappedGroup: g }))
}));

const mapper = require('../dal/mapper');
const resolvers = require('./LoginInfo.js')({});

beforeEach(() => jest.clearAllMocks());

describe('LoginInfo.user / organization / groups', () => {
  it('maps the user from a shallow copy of the object', () => {
    const object = { userId: 'u1', name: 'Al' };
    const result = resolvers.user(object);
    expect(mapper.mapUser).toHaveBeenCalledWith({ userId: 'u1', name: 'Al' });
    expect(result).toEqual({ mappedUser: { userId: 'u1', name: 'Al' } });
  });

  it('maps the organization from object.organization', () => {
    const object = { organization: { id: 7 } };
    const result = resolvers.organization(object);
    expect(mapper.mapOrganization).toHaveBeenCalledWith({ id: 7 });
    expect(result).toEqual({ mappedOrg: { id: 7 } });
  });

  it('maps each group', () => {
    const object = { groups: [{ g: 1 }, { g: 2 }] };
    const result = resolvers.groups(object);
    expect(result).toEqual([{ mappedGroup: { g: 1 } }, { mappedGroup: { g: 2 } }]);
    expect(mapper.mapGroup).toHaveBeenCalledTimes(2);
  });
});

describe('LoginInfo.applicationPlatforms', () => {
  it('projects each application id into its platform entry', () => {
    const object = {
      applications: ['a1', 'a2'],
      applicationPlatforms: {
        a1: { platformType: 'web', platformUrl: 'https://a1' },
        a2: { platformType: 'ios', platformUrl: 'https://a2' }
      }
    };
    expect(resolvers.applicationPlatforms(object)).toEqual([
      { id: 'a1', platformType: 'web', platformUrl: 'https://a1' },
      { id: 'a2', platformType: 'ios', platformUrl: 'https://a2' }
    ]);
  });

  it('returns an empty array when there are no applications', () => {
    expect(resolvers.applicationPlatforms({ applications: [], applicationPlatforms: {} })).toEqual([]);
  });
});
