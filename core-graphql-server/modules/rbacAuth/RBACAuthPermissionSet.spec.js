const createRBACAuthPermissionSet = require('./RBACAuthPermissionSet');
const createServiceContext = require('../../test/serviceContext.mock.js');
const defaultServiceContext = createServiceContext();

describe('RBACAuthPermissionSet resolvers', () => {
  let serviceContext;
  let resolver;

  beforeEach(() => {
    serviceContext = {
      bll: {
        rbacAuth: {
          permissionSetHasPermissions: jest.fn()
        }
      },
      dal: {
        admin: { getUsers: jest.fn() },
        application: { getApplication: jest.fn() },
        organization: {
          getOrgIdFromAppId: jest.fn(),
          getOrganization: jest.fn()
        }
      },
      config: defaultServiceContext.config
    };
    resolver = createRBACAuthPermissionSet(serviceContext);
  });

  it('permissions returns empty array when obj.permissions is null', () => {
    const obj = { permissions: null };

    const result = resolver.permissions(obj);

    expect(result).toEqual([]);
  });
});
