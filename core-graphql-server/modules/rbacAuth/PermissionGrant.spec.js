const createPermissionGrant = require('./PermissionGrant');
const createServiceContext = require('../../test/serviceContext.mock.js');
const defaultServiceContext = createServiceContext();

describe('PermissionGrant resolvers', () => {
  let serviceContext;
  let resolver;
  const mockContext = { user: { id: 'user-1' } };

  beforeEach(() => {
    serviceContext = {
      bll: {
        rbacAuth: {
          getAuthGroup: jest.fn(),
          getAuthPermissionSet: jest.fn()
        }
      },
      dal: {
        admin: {
          getUsers: jest.fn()
        }
      },
      config: defaultServiceContext.config
    };
    resolver = createPermissionGrant(serviceContext);
  });

  it('owner calls dal.admin.getUsers when ownerType is User and returns first record', async () => {
    const obj = { ownerId: 'user-99', ownerType: 'User', organizationId: 'org-1' };
    const mockUser = { id: 'user-99', name: 'Test User' };
    serviceContext.dal.admin.getUsers.mockResolvedValue({ records: [mockUser] });

    const result = await resolver.owner(obj, {}, mockContext);

    expect(result).toEqual(mockUser);
    expect(serviceContext.dal.admin.getUsers).toHaveBeenCalledWith(
      { ids: ['user-99'], limit: 1 },
      mockContext
    );
  });

  it('owner calls bllRbac.getAuthGroup when ownerType is not User', async () => {
    const obj = { ownerId: 'group-5', ownerType: 'Group', organizationId: 'org-1' };
    const mockGroup = { id: 'group-5' };
    serviceContext.bll.rbacAuth.getAuthGroup.mockResolvedValue(mockGroup);

    const result = await resolver.owner(obj, {}, mockContext);

    expect(result).toEqual(mockGroup);
    expect(serviceContext.bll.rbacAuth.getAuthGroup).toHaveBeenCalledWith(
      mockContext,
      { id: 'group-5', ownerOrganization: 'org-1' }
    );
  });
});
