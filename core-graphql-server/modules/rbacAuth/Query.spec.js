const createQuery = require('./Query');
const createServiceContext = require('../../test/serviceContext.mock.js');
const defaultServiceContext = createServiceContext();

describe('rbacAuth Query resolvers', () => {
  let serviceContext;
  let resolver;
  const mockContext = { user: { id: 'user-1' } };

  beforeEach(() => {
    serviceContext = {
      bll: {
        rbacAuth: {
          getAuthGroup: jest.fn(),
          hasPermissions: jest.fn()
        }
      },
      config: defaultServiceContext.config
    };
    resolver = createQuery(serviceContext);
  });

  it('authGroup passes unsupportedAuthClasses=[User] to bllRbac.getAuthGroup', async () => {
    const args = { id: 'group-1' };
    const expected = { id: 'group-1' };
    serviceContext.bll.rbacAuth.getAuthGroup.mockResolvedValue(expected);

    const result = await resolver.authGroup(null, args, mockContext);

    expect(result).toEqual(expected);
    expect(serviceContext.bll.rbacAuth.getAuthGroup).toHaveBeenCalledWith(
      mockContext,
      expect.objectContaining({ unsupportedAuthClasses: ['User'] })
    );
  });

  it('applicationRoles throws a NotImplemented error', () => {
    expect(() => resolver.applicationRoles(null, {}, mockContext)).toThrow();
  });

  it('hasPermissions passes auditAccessQuery=true as a 4th object-literal arg, without merging it into args', async () => {
    const args = { resourceId: 'resource-1' };
    const originalArgs = { ...args };
    const expected = [{ resourceId: 'resource-1', hasPermission: true }];
    serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValue(expected);

    const result = await resolver.hasPermissions(null, args, mockContext);

    expect(result).toEqual(expected);
    expect(serviceContext.bll.rbacAuth.hasPermissions).toHaveBeenCalledWith(
      mockContext,
      args,
      true,
      { auditAccessQuery: true }
    );
    // The flag must NOT leak into `args` itself — args feeds the DAL's whole-args permission-cache key.
    expect(args).toEqual(originalArgs);
  });
});
