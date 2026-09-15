const RBACAuthACE = require('./RBACAuthACE');
const mockUtil = require('../../test/mockUtil.js')();
const createServiceContext = require('../../test/serviceContext.mock.js');
const defaultServiceContext = createServiceContext();

describe('RBACAuthACE resolver', () => {
  let serviceContext;
  let resolver;
  let mockContext;

  beforeEach(() => {
    serviceContext = {
      bll: {
        rbacAuth: {
          getAuthGroup: jest.fn()
        }
      },
      dal: {
        application: {
          getAppIdFromOrgId: jest.fn()
        },
        authGroup: {
          getAuthGroupMemberIds: jest.fn()
        },
        admin: {
          getUserBasicInfo: jest.fn()
        }
      },
      config: defaultServiceContext.config,
    };

    mockContext = {
      user: { id: 'user-123' }
    };

    resolver = RBACAuthACE(serviceContext);
  });

  describe('member resolver', () => {
    it('should return auth group when authClass is not User', async () => {
      const mockObj = { authGroupId: 'auth-group-123', organizationId: 456 };
      const mockAuthGroup = { id: 'auth-group-123', authClass: 'System' };

      serviceContext.dal.application.getAppIdFromOrgId.mockResolvedValue('app-456');
      serviceContext.bll.rbacAuth.getAuthGroup.mockResolvedValue(mockAuthGroup);

      const result = await resolver.member(mockObj, {}, mockContext);

      expect(result).toEqual(mockAuthGroup);
      expect(serviceContext.bll.rbacAuth.getAuthGroup).toHaveBeenCalledWith(mockContext, {
        id: 'auth-group-123',
        ownerOrganization: 'app-456'
      });
    });

    it('should return user when authClass is User', async () => {
      const mockObj = { authGroupId: 'auth-group-123', organizationId: 456 };
      const mockAuthGroup = { id: 'auth-group-123', authClass: 'User' };
      const mockUser = { id: 'user-789', name: 'username-789' };

      serviceContext.dal.application.getAppIdFromOrgId.mockResolvedValue('app-456');
      serviceContext.bll.rbacAuth.getAuthGroup.mockResolvedValue(mockAuthGroup);
      serviceContext.dal.authGroup.getAuthGroupMemberIds.mockResolvedValue(['user-789']);
      serviceContext.dal.admin.getUserBasicInfo.mockResolvedValue({ id: 'user-789', name: 'username-789' });

      const result = await resolver.member(mockObj, {}, mockContext);

      expect(result).toEqual(mockUser);
      expect(serviceContext.dal.authGroup.getAuthGroupMemberIds).toHaveBeenCalledWith(
        ['auth-group-123'],
        { memberType: 'User' }
      );
    });

    it('should return auth group for internal token', async () => {
      const mockObj = { authGroupId: 'auth-group-123', organizationId: 456 };
      const mockAuthGroup = { id: 'auth-group-123', authClass: 'System' };

      serviceContext.dal.application.getAppIdFromOrgId.mockResolvedValue(
        'app-456'
      );
      serviceContext.bll.rbacAuth.getAuthGroup.mockResolvedValue(mockAuthGroup);

      const result = await resolver.member(
        mockObj,
        {},
        mockUtil.makeContext({ authType: 'api_internal' })
      );

      expect(result).toEqual(mockAuthGroup);
      expect(serviceContext.bll.rbacAuth.getAuthGroup).toHaveBeenCalledWith(
        expect.any(Object),
        {
          id: 'auth-group-123',
          ownerOrganization: 'app-456'
        }
      );
      expect(serviceContext.dal.admin.getUserBasicInfo).not.toHaveBeenCalled();
    });
  });
});
