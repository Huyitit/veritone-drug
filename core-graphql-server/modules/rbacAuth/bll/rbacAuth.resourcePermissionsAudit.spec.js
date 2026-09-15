const _ = require('lodash');
const mockUtil = global.mockUtil;
const createServiceContext = require('../../../test/serviceContext.mock.js');

// Built once and reused across tests (full serviceContext construction is
// expensive - ~35 DAL/BLL modules + caches). Per-test isolation is restored
// via _clearAll(); the DAL mocks and config flag below are reassigned fresh
// in every beforeEach regardless, so sharing the base context is safe.
const serviceContext = createServiceContext();

describe('RBAC BLL - resourcePermissionsAudit', () => {
  let rbacBll;

  // Test constants
  const ORG_GUID = '38e940c0-bfad-413f-b2f7-2acc6b497732';
  const ORG_ID = 1;
  const OWNER_ORG_ID = 2;
  const ORG_GUID_OF_OWNER_ORG = 'e6344546-89d2-4b82-a0eb-69971f8326c6';
  const USER_ID = '513e96ec-2bea-49a5-9d98-dc74ac19b396';
  const RESOURCE_ID = 'test-resource-id';
  const PERMISSION_SET_ID = 'permission-set-id';
  const ADMIN_PERMISSION_SET_ID = 'admin-perm-set-id';
  const AUTH_GROUP_ID = 'auth-group-id';
  const ADMIN_AUTH_GROUP_ID = 'admin-auth-group-id';

  // Mock DAL objects
  const organizationDal = {
    getOrgIdFromAppId: jest.fn(),
    getOrganization: jest.fn()
  };

  const authGroupDal = {
    getAuthGroups: jest.fn().mockImplementation((args) => {
      return {
        count: args.ids.length,
        records: args.ids.map((id) => (
          { 
            id: id,
            authClass: (id === USER_ID) ? 'User' : null 
          })
        )
      };
    }),
    getAuthGroupsContainingMember: jest.fn()
  };

  const authACEDal = {
    getACLForResources: jest.fn()
  };

  const authPermissionDal = {
    getAuthPermissionSets: jest.fn()
  };

  const adminDal = {
    getUsers: jest.fn().mockImplementation((args) => {
      return {
        count: args.ids.length,
        records: args.ids.map((id) => ({ id: id }))
      };
    }),
    getOrganizationGuidsForUser: jest.fn()
  };

  const userDal = {
    getDefaultOrgAdminUser: jest.fn()
  };

  const applicationDal = {
    getAppIdFromOrgId: jest.fn()
  };

  // Mock contexts
  let regularUserContext;
  let superadminContext;
  let internalTokenContext;

  beforeEach(() => {
    jest.clearAllMocks();

    serviceContext._clearAll();

    // Set up DAL mocks
    serviceContext.dal.organization = organizationDal;
    serviceContext.dal.authGroup = authGroupDal;
    serviceContext.dal.authAce = authACEDal;
    serviceContext.dal.authPermissionDal = authPermissionDal;
    serviceContext.dal.admin = adminDal;
    serviceContext.dal.user = userDal;
    serviceContext.dal.application = applicationDal;

    _.set(serviceContext.config, 'featureFlags.enableRBACFeature', true);

    // Create BLL instance
    rbacBll = require('./rbacAuth.bll.js')(serviceContext);

    // Set up contexts
    regularUserContext = _.merge(
      {},
      mockUtil.makeContext({ authType: 'user', authRole: 'regularUser' }),
      {
        _authInfo: {
          userId: USER_ID,
          organization: {
            organizationId: ORG_ID,
            organizationGuid: ORG_GUID
          },
          authGroups: [AUTH_GROUP_ID],
          roles: ['regular_user'],
          permissionMasks: []
        }
      }
    );

    superadminContext = _.merge({}, mockUtil.makeContext(), {
      _authInfo: {
        userId: USER_ID,
        organization: {
          organizationId: ORG_ID,
          organizationGuid: ORG_GUID
        },
        authGroups: [AUTH_GROUP_ID],
        roles: ['superadmin']
      }
    });

    internalTokenContext = _.merge({}, mockUtil.makeContext(), {
      _authInfo: {
        userId: USER_ID,
        organization: {
          organizationId: ORG_ID,
          organizationGuid: ORG_GUID
        },
        authGroups: [AUTH_GROUP_ID],
        tokenType: 'internal'
      }
    });

    // Default mock implementations
    organizationDal.getOrgIdFromAppId.mockResolvedValue(ORG_ID);
    organizationDal.getOrganization.mockResolvedValue({
      organizationId: ORG_ID,
      organizationGuid: ORG_GUID,
      kvp: {
        features: {
          enableRBACFeature: 'enabled'
        }
      }
    });

    authGroupDal.getAuthGroupsContainingMember.mockResolvedValue({
      records: [{ id: AUTH_GROUP_ID }]
    });

    authACEDal.getACLForResources.mockResolvedValue([]);
    authPermissionDal.getAuthPermissionSets.mockResolvedValue([]);
    adminDal.getOrganizationGuidsForUser.mockResolvedValue([ORG_GUID]);
  });

  describe('Parameter validation', () => {
    it('should throw error if non-superadmin tries to use userID parameter', async () => {
      organizationDal.getOrganization.mockResolvedValue({
        organizationId: ORG_ID,
        organizationGuid: ORG_GUID,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      });

      await expect(
        rbacBll.resourcePermissionsAudit(regularUserContext, {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          userID: 'other-user-id',
          ownerOrganization: OWNER_ORG_ID
        })
      ).rejects.toThrow(
        'Access to field ownerOrganization and userID require superadmin rights'
      );
    });

    it('should throw error if non-superadmin tries to use ownerOrganization parameter', async () => {
      organizationDal.getOrganization.mockResolvedValue({
        organizationId: ORG_ID,
        organizationGuid: ORG_GUID,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      });

      await expect(
        rbacBll.resourcePermissionsAudit(regularUserContext, {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          userID: 'other-user-id',
          ownerOrganization: OWNER_ORG_ID
        })
      ).rejects.toThrow(
        'Access to field ownerOrganization and userID require superadmin rights'
      );
    });

    it('should throw error if userID is provided without ownerOrganization', async () => {
      organizationDal.getOrganization.mockResolvedValue({
        organizationId: ORG_ID,
        organizationGuid: ORG_GUID,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      });

      await expect(
        rbacBll.resourcePermissionsAudit(superadminContext, {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          userID: 'other-user-id'
        })
      ).rejects.toThrow('Both userID and ownerOrganization must be provided');
    });

    it('should throw error if ownerOrganization is provided without userID', async () => {
      // Mock organization with RBAC feature enabled so parameter validation can be reached
      organizationDal.getOrganization.mockResolvedValue({
        organizationId: ORG_ID,
        organizationGuid: ORG_GUID,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      });

      await expect(
        rbacBll.resourcePermissionsAudit(superadminContext, {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          ownerOrganization: OWNER_ORG_ID
        })
      ).rejects.toThrow('Both userID and ownerOrganization must be provided');
    });

    it('should allow superadmin to use both userID and ownerOrganization', async () => {
      organizationDal.getOrgIdFromAppId.mockResolvedValue(OWNER_ORG_ID);
      organizationDal.getOrganization.mockResolvedValue({
        organizationId: OWNER_ORG_ID,
        organizationGuid: ORG_GUID_OF_OWNER_ORG,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      });

      adminDal.getOrganizationGuidsForUser.mockResolvedValue([
        ORG_GUID_OF_OWNER_ORG
      ]);

      await expect(
        rbacBll.resourcePermissionsAudit(superadminContext, {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          ownerOrganization: OWNER_ORG_ID,
          userID: 'other-user-id'
        })
      ).rejects.toThrow('The user does not belong to the organization');
    });
  });

  describe('RBAC feature validation', () => {
    it('should throw error if RBAC feature is not enabled for organization', async () => {
      organizationDal.getOrganization.mockResolvedValue({
        organizationId: ORG_ID,
        organizationGuid: ORG_GUID,
        kvp: {
          features: {
            enableRBACFeature: 'disabled'
          }
        }
      });

      await expect(
        rbacBll.resourcePermissionsAudit(regularUserContext, {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID }
        })
      ).rejects.toThrow('RBAC feature is not enabled for this organization');
    });

    it('should proceed if RBAC feature is enabled', async () => {
      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID }
        }
      );

      expect(result).toBeDefined();
      expect(result.resourceType).toBe('TDO');
      expect(result.resourceId).toBe(RESOURCE_ID);
    });
  });

  describe('User validation', () => {
    it('should default to current user if no userID provided', async () => {
      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID }
        }
      );

      expect(result.userId).toBe(USER_ID);
    });

    it('should validate user belongs to organization when userID is different', async () => {
      const otherUserId = 'other-user-id';
      adminDal.getOrganizationGuidsForUser.mockResolvedValue([
        'different-org-guid'
      ]);

      await expect(
        rbacBll.resourcePermissionsAudit(superadminContext, {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          userID: otherUserId,
          ownerOrganization: ORG_ID
        })
      ).rejects.toThrow('The user does not belong to the organization');
    });

    it('should succeed when user belongs to organization', async () => {
      const otherUserId = 'other-user-id';
      adminDal.getOrganizationGuidsForUser.mockResolvedValue([ORG_GUID]);

      const result = await rbacBll.resourcePermissionsAudit(superadminContext, {
        resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
        userID: otherUserId,
        ownerOrganization: ORG_ID
      });

      expect(result.userId).toBe(otherUserId);
    });
  });

  describe('Permission processing', () => {
    it('should use default permissions for resource type if none provided', async () => {
      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID }
        }
      );

      expect(authACEDal.getACLForResources).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'TDO',
          ids: [RESOURCE_ID]
        })
      );
    });

    it('should use provided permissions if specified', async () => {
      const permissions = ['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE'];

      await rbacBll.resourcePermissionsAudit(regularUserContext, {
        resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
        permissions
      });

      expect(authACEDal.getACLForResources).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions
        })
      );
    });

    it('should query both resource and organization ACEs', async () => {
      await rbacBll.resourcePermissionsAudit(regularUserContext, {
        resource: { resourceType: 'TDO', resourceId: RESOURCE_ID }
      });

      expect(authACEDal.getACLForResources).toHaveBeenCalledTimes(2);

      // First call for resource
      expect(authACEDal.getACLForResources).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          resourceType: 'TDO',
          ids: [RESOURCE_ID]
        })
      );

      // Second call for organization
      expect(authACEDal.getACLForResources).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          resourceType: 'organization',
          ids: [ORG_ID.toString()]
        })
      );
    });
  });

  describe('Permission grant processing', () => {
    beforeEach(() => {
      // Mock ACE data
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            aceId: 'ace-1',
            permissionSetId: PERMISSION_SET_ID,
            authGroupId: AUTH_GROUP_ID,
            objectType: 'TDO',
            objectId: RESOURCE_ID
          }
        ]
      });

      // Mock permission set data
      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
        {
          id: PERMISSION_SET_ID,
          name: 'Test Permission Set',
          permissions: ['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE']
        }
      ]);
    });

    it('should group ACEs by permission set', async () => {
      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ']
        }
      );

      expect(authPermissionDal.getAuthPermissionSets).toHaveBeenCalledWith({
        ids: [PERMISSION_SET_ID],
        organizationGuid: ORG_GUID
      });
    });

    it('should determine grant types correctly', async () => {
      // Test Direct grant (user is the auth group member)
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            aceId: 'ace-1',
            permissionSetId: PERMISSION_SET_ID,
            authGroupId: USER_ID, // Direct user assignment
            objectType: 'TDO',
            objectId: RESOURCE_ID
          }
        ]
      });

      // Mock permission set data
      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
        {
          id: PERMISSION_SET_ID,
          name: 'Test Permission Set',
          permissions: ['AIWARE_TDO_READ'],
          permissionMask: [32768]
        }
      ]);

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ']
        }
      );

      expect(result.permissionDetails).toHaveLength(1);
      expect(result.permissionDetails[0].grants[0].type).toBe('Direct');
    });

    it('should identify organization role grants', async () => {
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            aceId: 'ace-1',
            permissionSetId: PERMISSION_SET_ID,
            authGroupId: AUTH_GROUP_ID,
            objectType: 'organization',
            objectId: ORG_ID.toString()
          }
        ]
      });

      // Mock permission set data
      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
        {
          id: PERMISSION_SET_ID,
          name: 'Test Permission Set',
          permissions: ['AIWARE_TDO_READ'],
          permissionMask: [32768]
        }
      ]);

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ']
        }
      );

      expect(result.permissionDetails).toHaveLength(1);
      expect(result.permissionDetails[0].grants[0].type).toBe(
        'OrganizationRole'
      );
    });

    it('should identify group membership grants', async () => {
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            aceId: 'ace-1',
            permissionSetId: PERMISSION_SET_ID,
            authGroupId: AUTH_GROUP_ID,
            objectType: 'TDO',
            objectId: RESOURCE_ID
          }
        ]
      });

      // Mock permission set data
      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
        {
          id: PERMISSION_SET_ID,
          name: 'Test Permission Set',
          permissions: ['AIWARE_TDO_READ'],
          permissionMask: [32768]
        }
      ]);

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ']
        }
      );

      expect(result.permissionDetails).toHaveLength(1);
      expect(result.permissionDetails[0].grants[0].type).toBe(
        'GroupMembership'
      );
    });
  });

  describe('Return value structure', () => {
    it('should return correct structure for audit result', async () => {
      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID }
        }
      );

      expect(result).toHaveProperty('resourceType', 'TDO');
      expect(result).toHaveProperty('resourceId', RESOURCE_ID);
      expect(result).toHaveProperty('userId', USER_ID);
      expect(result).toHaveProperty('effectivePermissions');
      expect(result).toHaveProperty('permissionDetails');
      expect(Array.isArray(result.effectivePermissions)).toBe(true);
      expect(Array.isArray(result.permissionDetails)).toBe(true);
    });

    it('should include effective permissions in result', async () => {
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            aceId: 'ace-1',
            permissionSetId: PERMISSION_SET_ID,
            authGroupId: AUTH_GROUP_ID,
            objectType: 'TDO',
            objectId: RESOURCE_ID
          }
        ]
      });

      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
        {
          id: PERMISSION_SET_ID,
          name: 'Test Permission Set',
          permissions: ['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE'],
          permissionMask: [98304]
        }
      ]);

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ']
        }
      );

      expect(result.permissionDetails).toHaveLength(1);
      expect(result.permissionDetails[0].permission).toBe('AIWARE_TDO_READ');
      expect(result.permissionDetails[0].reason).toContain(
        'Test Permission Set'
      );
      expect(result.effectivePermissions).toContain('AIWARE_TDO_READ');
    });

    it('should work with no acls', async () => {
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
        ]
      });

      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
      ]);

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ']
        }
      );

      expect(result.permissionDetails).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      authACEDal.getACLForResources.mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        rbacBll.resourcePermissionsAudit(regularUserContext, {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID }
        })
      ).rejects.toThrow('Error getting resource Access Control List');
    });

    it('should log errors before throwing', async () => {
      const consoleSpy = jest
        .spyOn(serviceContext.logger, 'error')
        .mockImplementation();
      authACEDal.getACLForResources.mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        rbacBll.resourcePermissionsAudit(regularUserContext, {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID }
        })
      ).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('Resource type permission mappings', () => {
    const testCases = [
      {
        resourceType: 'TDO',
        expectedPermissions: [
          'AIWARE_TDO_CREATE',
          'AIWARE_TDO_DELETE',
          'AIWARE_TDO_READ',
          'AIWARE_TDO_SEARCH',
          'AIWARE_TDO_UPDATE'
        ]
      },
      {
        resourceType: 'Folder',
        expectedPermissions: [
          'AIWARE_FOLDER_CREATE',
          'AIWARE_FOLDER_DELETE',
          'AIWARE_FOLDER_READ',
          'AIWARE_FOLDER_FILE',
          'AIWARE_FOLDER_UPDATE'
        ]
      },
      {
        resourceType: 'SDO',
        expectedPermissions: [
          'AIWARE_SDO_CREATE',
          'AIWARE_SDO_DELETE',
          'AIWARE_SDO_READ',
          'AIWARE_SDO_UPDATE'
        ]
      },
      {
        resourceType: 'Source',
        expectedPermissions: [
          'AIWARE_SOURCES_CREATE',
          'AIWARE_SOURCES_DELETE',
          'AIWARE_SOURCES_READ',
          'AIWARE_SOURCES_UPDATE'
        ]
      },
      {
        resourceType: 'Organization',
        expectedPermissions: [
          'ADMIN_ORG_CREATE',
          'ADMIN_ORG_READ',
          'ADMIN_ORG_UPDATE',
          'ADMIN_ACCESS'
        ]
      },
      {
        resourceType: 'Engine',
        expectedPermissions: [
          'DEVELOPER_ENGINE_CREATE',
          'DEVELOPER_ENGINE_DELETE',
          'DEVELOPER_ENGINE_READ',
          'DEVELOPER_ENGINE_UPDATE',
          'DEVELOPER_ENGINE_ENABLE',
          'DEVELOPER_ENGINE_DISABLE'
        ]
      },
      {
        resourceType: 'Library',
        expectedPermissions: [
          'AIWARE_PACKAGE_CREATE',
          'AIWARE_PACKAGE_READ',
          'AIWARE_PACKAGE_UPDATE',
          'AIWARE_PACKAGE_DELETE'
        ]
      },
      {
        resourceType: 'Dataset',
        expectedPermissions: [
          'AIWARE_SCHEMA_CREATE',
          'AIWARE_SCHEMA_DELETE',
          'AIWARE_SCHEMA_READ',
          'AIWARE_SCHEMA_SEARCH',
          'AIWARE_SCHEMA_UPDATE'
        ]
      },
      {
        resourceType: 'Application',
        expectedPermissions: [
          'DEVELOPER_BUILD_CREATE',
          'DEVELOPER_BUILD_DELETE',
          'DEVELOPER_BUILD_READ',
          'DEVELOPER_BUILD_UPDATE',
          'DEVELOPER_BUILD_APPROVE',
          'DEVELOPER_BUILD_DEPLOY'
        ]
      }
    ];

    testCases.forEach(({ resourceType, expectedPermissions }) => {
      it(`should use correct default permissions for ${resourceType}`, async () => {
        await rbacBll.resourcePermissionsAudit(regularUserContext, {
          resource: { resourceType, resourceId: RESOURCE_ID }
        });

        expect(authACEDal.getACLForResources).toHaveBeenCalledWith(
          expect.objectContaining({
            permissions: expectedPermissions
          })
        );
      });
    });

    it('should handle unknown resource types gracefully', async () => {
      await rbacBll.resourcePermissionsAudit(regularUserContext, {
        resource: { resourceType: 'UnknownType', resourceId: RESOURCE_ID }
      });

      expect(authACEDal.getACLForResources).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: []
        })
      );
    });
  });

  describe('Permission grant sorting', () => {
    it('should sort permission grants by priority (Direct > GroupMembership > OrganizationRole)', async () => {
      // Mock both resource and organization ACEs
      authACEDal.getACLForResources.mockImplementation(({ resourceType }) => {
        if (resourceType === 'TDO') {
          return Promise.resolve({
            records: [
              {
                aceId: 'ace-group',
                permissionSetId: 'perm-set-group',
                authGroupId: AUTH_GROUP_ID,
                objectType: 'TDO',
                objectId: RESOURCE_ID
              },
              {
                aceId: 'ace-direct',
                permissionSetId: 'perm-set-direct',
                authGroupId: USER_ID,
                objectType: 'TDO',
                objectId: RESOURCE_ID
              }
            ]
          });
        } else if (resourceType === 'organization') {
          return Promise.resolve({
            records: [
              {
                aceId: 'ace-org',
                permissionSetId: 'perm-set-org',
                authGroupId: AUTH_GROUP_ID,
                objectType: 'organization',
                objectId: ORG_ID.toString()
              }
            ]
          });
        }
        return Promise.resolve([]);
      });

      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
        {
          id: 'perm-set-org',
          name: 'Org Permission Set',
          permissions: ['AIWARE_TDO_READ'],
          permissionMask: [32768]
        },
        {
          id: 'perm-set-group',
          name: 'Group Permission Set',
          permissions: ['AIWARE_TDO_READ'],
          permissionMask: [32768]
        },
        {
          id: 'perm-set-direct',
          name: 'Direct Permission Set',
          permissions: ['AIWARE_TDO_READ'],
          permissionMask: [32768]
        }
      ]);

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ']
        }
      );

      expect(result.permissionDetails).toHaveLength(1);
      const grants = result.permissionDetails[0].grants;
      expect(grants).toHaveLength(3);

      // Should be sorted: Direct, GroupMembership, OrganizationRole
      expect(grants[0].type).toBe('Direct');
      expect(grants[1].type).toBe('GroupMembership');
      expect(grants[2].type).toBe('OrganizationRole');
    });
  });

  describe('Complex permission scenarios', () => {
    it('should handle multiple permission sets with overlapping permissions', async () => {
      // Mock ACEs with multiple permission sets
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            aceId: 'ace-1',
            permissionSetId: ADMIN_PERMISSION_SET_ID,
            authGroupId: ADMIN_AUTH_GROUP_ID,
            objectType: 'TDO',
            objectId: RESOURCE_ID
          },
          {
            aceId: 'ace-2',
            permissionSetId: PERMISSION_SET_ID,
            authGroupId: AUTH_GROUP_ID,
            objectType: 'TDO',
            objectId: RESOURCE_ID
          }
        ]
      });

      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
        {
          id: ADMIN_PERMISSION_SET_ID,
          name: 'Admin Permission Set',
          permissions: [
            'AIWARE_TDO_READ',
            'AIWARE_TDO_UPDATE',
            'AIWARE_TDO_DELETE'
          ],
          permissionMask: [229376]
        },
        {
          id: PERMISSION_SET_ID,
          name: 'User Permission Set',
          permissions: ['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE'],
          permissionMask: [98304]
        }
      ]);

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE']
        }
      );

      expect(result.effectivePermissions).toHaveLength(2);
      expect(result.effectivePermissions).toContain('AIWARE_TDO_READ');
      expect(result.effectivePermissions).toContain('AIWARE_TDO_UPDATE');
      expect(result.permissionDetails).toHaveLength(2);

      // Each permission should have multiple grants
      result.permissionDetails.forEach((detail) => {
        expect(detail.grants.length).toBeGreaterThan(0);
      });
    });

    it('should handle inherited permissions from parent folders', async () => {
      // Mock ACEs for both resource and parent folder
      authACEDal.getACLForResources.mockImplementation(
        ({ resourceType, ids }) => {
          if (resourceType === 'TDO') {
            // Direct resource ACE
            return Promise.resolve({
              records: [
                {
                  aceId: 'ace-direct',
                  permissionSetId: PERMISSION_SET_ID,
                  authGroupId: AUTH_GROUP_ID,
                  objectType: 'TDO',
                  objectId: RESOURCE_ID
                }
              ]
            });
          } else if (resourceType === 'organization') {
            // Organization-level ACE
            return Promise.resolve({
              records: [
                {
                  aceId: 'ace-org',
                  permissionSetId: ADMIN_PERMISSION_SET_ID,
                  authGroupId: ADMIN_AUTH_GROUP_ID,
                  objectType: 'organization',
                  objectId: ORG_ID.toString()
                }
              ]
            });
          }
          return Promise.resolve([]);
        }
      );

      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
        {
          id: PERMISSION_SET_ID,
          name: 'User Permission Set',
          permissions: ['AIWARE_TDO_READ'],
          permissionMask: [32768]
        },
        {
          id: ADMIN_PERMISSION_SET_ID,
          name: 'Admin Permission Set',
          permissions: ['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE'],
          permissionMask: [98304]
        }
      ]);

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ']
        }
      );

      expect(result.effectivePermissions).toContain('AIWARE_TDO_READ');
      expect(result.permissionDetails).toHaveLength(1);
      expect(result.permissionDetails[0].grants).toHaveLength(2);

      // Should have both direct and organization grants
      const grantTypes = result.permissionDetails[0].grants.map((g) => g.type);
      expect(grantTypes).toContain('GroupMembership');
      expect(grantTypes).toContain('OrganizationRole');
    });
  });

  describe('Permission set validation and filtering', () => {
    it('should only return permissions that exist in permission sets', async () => {
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            aceId: 'ace-1',
            permissionSetId: PERMISSION_SET_ID,
            authGroupId: AUTH_GROUP_ID,
            objectType: 'TDO',
            objectId: RESOURCE_ID
          }
        ]
      });

      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
        {
          id: PERMISSION_SET_ID,
          name: 'Limited Permission Set',
          permissions: ['AIWARE_TDO_READ'], // Only has READ, not UPDATE
          permissionMask: [32768]
        }
      ]);

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE'] // Requesting both
        }
      );

      // Should only return the permission that exists in the permission set
      expect(result.effectivePermissions).toHaveLength(1);
      expect(result.effectivePermissions).toContain('AIWARE_TDO_READ');
      expect(result.effectivePermissions).not.toContain('AIWARE_TDO_UPDATE');
    });

    it('should handle empty permission sets gracefully', async () => {
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            aceId: 'ace-1',
            permissionSetId: PERMISSION_SET_ID,
            authGroupId: AUTH_GROUP_ID,
            objectType: 'TDO',
            objectId: RESOURCE_ID
          }
        ]
      });

      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
        {
          id: PERMISSION_SET_ID,
          name: 'Empty Permission Set',
          permissions: [] // Empty permissions
        }
      ]);

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ']
        }
      );

      expect(result.effectivePermissions).toHaveLength(0);
      expect(result.permissionDetails).toHaveLength(0);
    });
  });

  describe('Performance and scalability scenarios', () => {
    it('should handle large numbers of ACEs efficiently', async () => {
      // Generate many ACEs
      const manyACEs = [];
      const manyPermissionSets = [];

      for (let i = 0; i < 100; i++) {
        manyACEs.push({
          aceId: `ace-${i}`,
          permissionSetId: `perm-set-${i}`,
          authGroupId: `group-${i}`,
          objectType: 'TDO',
          objectId: RESOURCE_ID
        });

        manyPermissionSets.push({
          id: `perm-set-${i}`,
          name: `Permission Set ${i}`,
          permissions: ['AIWARE_TDO_READ'],
          permissionMask: [32768]
        });
      }

      authACEDal.getACLForResources.mockResolvedValueOnce({
        records: manyACEs
      });
      authPermissionDal.getAuthPermissionSets.mockResolvedValue(
        manyPermissionSets
      );

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: ['AIWARE_TDO_READ']
        }
      );

      expect(result.effectivePermissions).toContain('AIWARE_TDO_READ');
      expect(result.permissionDetails).toHaveLength(1);
      expect(result.permissionDetails[0].grants).toHaveLength(100);
    });
  });

  describe('Edge cases and boundary conditions', () => {
    it('should handle empty resource ID', async () => {
      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: '' }
        }
      );

      expect(result.resourceId).toBe('');
      expect(authACEDal.getACLForResources).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ['']
        })
      );
    });

    it('should handle null/undefined permissions array', async () => {
      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID },
          permissions: null
        }
      );

      expect(result.effectivePermissions).toEqual([]);
      expect(result.permissionDetails).toEqual([]);
    });

    it('should handle special characters in resource IDs', async () => {
      const specialResourceId = 'resource-with-special-chars-@#$%^&*()';

      const result = await rbacBll.resourcePermissionsAudit(
        regularUserContext,
        {
          resource: { resourceType: 'TDO', resourceId: specialResourceId }
        }
      );

      expect(result.resourceId).toBe(specialResourceId);
      expect(authACEDal.getACLForResources).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: [specialResourceId]
        })
      );
    });
  });

  describe('Error recovery and resilience', () => {
    it('should handle partial ACE query failures gracefully', async () => {
      // First query succeeds, second fails
      authACEDal.getACLForResources
        .mockResolvedValueOnce([
          {
            aceId: 'ace-1',
            permissionSetId: PERMISSION_SET_ID,
            authGroupId: AUTH_GROUP_ID,
            objectType: 'TDO',
            objectId: RESOURCE_ID
          }
        ])
        .mockRejectedValueOnce(new Error('Organization ACE query failed'));

      await expect(
        rbacBll.resourcePermissionsAudit(regularUserContext, {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID }
        })
      ).rejects.toThrow('Error getting resource Access Control List');
    });

    it('should handle permission set lookup failures', async () => {
      authACEDal.getACLForResources.mockResolvedValue([
        {
          aceId: 'ace-1',
          permissionSetId: PERMISSION_SET_ID,
          authGroupId: AUTH_GROUP_ID,
          objectType: 'TDO',
          objectId: RESOURCE_ID
        }
      ]);

      authPermissionDal.getAuthPermissionSets.mockRejectedValue(
        new Error('Permission set lookup failed')
      );

      const resp = await rbacBll.resourcePermissionsAudit(regularUserContext, {
          resource: { resourceType: 'TDO', resourceId: RESOURCE_ID }
      });

      expect(resp.effectivePermissions).toEqual([]);
      expect(resp.permissionDetails).toEqual([]);
      expect(resp.resourceId).toEqual(RESOURCE_ID);
      expect(resp.resourceType).toEqual('TDO');
    });
  });
});
