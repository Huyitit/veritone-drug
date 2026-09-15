const createMutation = require('./Mutation');
const createServiceContext = require('../../test/serviceContext.mock.js');
const defaultServiceContext = createServiceContext();

describe('rbacAuth Mutation resolvers', () => {
  let serviceContext;
  let resolver;
  const mockContext = { user: { id: 'user-1' } };

  beforeEach(() => {
    serviceContext = {
      bll: {
        rbacAuth: {
          createAuthGroup: jest.fn(),
          authEnforcementEnable: jest.fn()
        }
      },
      config: defaultServiceContext.config
    };
    resolver = createMutation(serviceContext);
  });

  it('authGroupCreate delegates to bllRbac.createAuthGroup with context and args', async () => {
    const args = { input: { name: 'TestGroup' } };
    const expected = { id: 'group-1' };
    serviceContext.bll.rbacAuth.createAuthGroup.mockResolvedValue(expected);

    const result = await resolver.authGroupCreate(null, args, mockContext);

    expect(result).toEqual(expected);
    expect(serviceContext.bll.rbacAuth.createAuthGroup).toHaveBeenCalledWith(mockContext, args);
  });

  it('authEnforcementEnable returns empty array when input.enable is falsy', async () => {
    const args = { input: { enable: false } };

    const result = await resolver.authEnforcementEnable(null, args, mockContext);

    expect(result).toEqual([]);
    expect(serviceContext.bll.rbacAuth.authEnforcementEnable).not.toHaveBeenCalled();
  });
});
