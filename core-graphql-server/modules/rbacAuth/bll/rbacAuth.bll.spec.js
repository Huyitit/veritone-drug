const _ = require('lodash');
const mockUtil = require('../../../test/mockUtil.js')();
const createServiceContext = require('../../../test/serviceContext.mock.js');
const uuid = require('uuid');

describe('RBAC BLL', () => {
  let rbacBll;
  const ORG_GUID = '38e940c0-bfad-413f-b2f7-2acc6b497732';
  const ORG_ID = 1;
  const OWNER_ORG_ID = 2;
  const ORG_GUID_OF_OWNER_ORG = 'e6344546-89d2-4b82-a0eb-69971f8326c6';
  const organizationDal = {
    getOrgIdFromAppId: jest.fn(),
    getOrganization: jest.fn(),
    updateOrganizationKvp: jest.fn()
  };
  const USER_ID = '513e96ec-2bea-49a5-9d98-dc74ac19b396';
  const authGroupDal = {
    getAuthGroups: jest.fn(),
    createAuthGroup: jest.fn(),
    updateAuthGroup: jest.fn(),
    deleteAuthGroup: jest.fn(),
    addMembersToAuthGroup: jest.fn(),
    removeMembersFromAuthGroup: jest.fn(),
    getAuthGroupMembers: jest.fn(),
    getAuthGroupsContainingMember: jest.fn(),
    getAuthGroupsPermissionMaskForOrganization: jest.fn(),
    markCacheDirtyForGetAuthGroups: jest.fn(),
    getAuthGroupMemberIds: jest.fn(),
    getUserPrivateAuthGroup: jest.fn(),
    getPrivateAuthGroupOwners: jest.fn().mockResolvedValue([])
  };
  const authACEDal = {
    hasPermissions: jest.fn(),
    hasOrgRolePermissions: jest.fn(),
    addACEsToResources: jest.fn(),
    removeACEsFromResources: jest.fn(),
    getACLForResources: jest.fn(),
    markCacheDirtyForGetACLForResources: jest.fn(),
    markCacheDirtyForHasPermissions: jest.fn(),
    getAuthGroupIdsByPermissionSets: jest.fn(),
    getAuthACLByResourceIdsAndPerms: jest.fn(),
    deleteACLForResources: jest.fn(),
    deleteAclsFromJoinTables: jest.fn()
  };
  const authPermissionDal = {
    createAuthPermissionSet: jest.fn(),
    getAuthPermissionSets: jest.fn(),
    markCacheDirtyForGetAuthPermissionSets: jest.fn(),
    updateAuthPermissionSet: jest.fn(),
    deleteAuthPermissionSet: jest.fn()
  };

  const adminDal = {
    getUsers: jest.fn(),
    getOrganizationGuidsForUser: jest.fn()
  };

  const dalFolder = {
    getOrCreateOrgRootFolder: jest.fn(),
    getObjectIdsFromOpaqueIds: jest.fn()
  };

  const applicationDal = {
    getAppIdFromOrgId: jest.fn(),
    getApplications: jest.fn()
  };

  const userDal = {
    getDefaultOrgAdminUser: jest.fn()
  };

  const roleDal = {
    getRoles: jest.fn()
  };
  let serviceContext;
  let superAdminContext;
  let regularUserContext;
  let internalTokenContext;
  let ctx;

  beforeAll(() => {
    serviceContext = createServiceContext();
    _.set(serviceContext, 'config.flyway.rootOrgId', 1);
    superAdminContext = mockUtil.makeContext();
    ctx = mockUtil.makeContext();
    _.set(ctx, '_authInfo.applicationId', ORG_GUID);
    regularUserContext = mockUtil.makeContext({ authRole: 'regularUser' });
    _.set(regularUserContext, '_authInfo.applicationId', ORG_GUID);
    internalTokenContext = mockUtil.makeContext({ authType: 'api_internal' });
    serviceContext.redisCache = {
      isCacheDirty: () => true,
      markCacheDirty: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      asyncSet: jest.fn(),
      clear: jest.fn(),
      incr: jest.fn(),
      incrBy: jest.fn(),
      incrByFloat: jest.fn(),
      decr: jest.fn(),
      multiExec: jest.fn(),
      asyncClear: jest.fn(),
    };
    _.set(serviceContext, 'config.featureFlags.enableRBACFeature', true);
    serviceContext.bll.rbacAuth._invalidateAnyAuthGroupRelatedCaches = jest.fn();
    serviceContext.bll.rbacAuth._invalidateAnyPermissionSetRelatedCaches = jest.fn();
    serviceContext.redisCache.markCacheDirty.mockResolvedValue(true);
    serviceContext.dal.organization = organizationDal;
    serviceContext.dal.authGroup = authGroupDal;
    serviceContext.dal.authAce = authACEDal;
    serviceContext.dal.authPermissionDal = authPermissionDal;
    serviceContext.dal.admin = adminDal;
    serviceContext.dal.folder = dalFolder;
    serviceContext.dal.application = applicationDal;
    serviceContext.dal.user = userDal;
    serviceContext.dal.role = roleDal;

    rbacBll = require('./rbacAuth.bll.js')(serviceContext);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    serviceContext._clearAll();
  });

  function mockImplementation_invalidateAnyAuthGroupRelatedCaches(
    serviceContxt,
    members = [],
    options = {}
  ) {
    const orgId = options.orgId || ORG_ID;
    serviceContxt.dal.organization.getOrgIdFromAppId.mockResolvedValue(orgId);
    members.forEach((member) => {
      serviceContxt.redisCache.markCacheDirty.mockImplementationOnce((key) => {
        expect(key).toMatch(
          new RegExp(`rbacAuthGroupsForMember:${orgId}:${member.id}`)
        );

        return Promise.resolve();
      });
    });
  }
  function expect_invalidateAnyAuthGroupRelatedCaches(
    serviceContxt,
    options = {}
  ) {
    const {
      ignoreACEHasPermissionMarkDirty,
      ignoreACLForResourcesMarkDirty,
      noExpectMarkCacheDirty,
      members,
      orgGuid = ORG_GUID,
      orgId = ORG_ID,
      resourceIds = []
    } = options;
    expect(
      serviceContxt.dal.authGroup.markCacheDirtyForGetAuthGroups
    ).toHaveBeenCalledWith(orgGuid);

    if (ignoreACEHasPermissionMarkDirty) {
      expect(
        serviceContxt.dal.authAce.markCacheDirtyForHasPermissions
      ).not.toHaveBeenCalled();
    } else {
      expect(
        serviceContxt.dal.authAce.markCacheDirtyForHasPermissions
      ).toHaveBeenCalledWith(orgId, resourceIds);
    }
    if (ignoreACLForResourcesMarkDirty) {
      expect(
        serviceContxt.dal.authAce.markCacheDirtyForGetACLForResources
      ).not.toHaveBeenCalled();
    } else {
      expect(
        serviceContxt.dal.authAce.markCacheDirtyForGetACLForResources
      ).toHaveBeenCalledWith(orgId, resourceIds);
    }

    if (!_.isEmpty(members)) {
      let count = 0;
      members.forEach((m) => {
        if (_.toLower(m.memberType) === 'user') {
          count += 1;
        }
      });

      if (!noExpectMarkCacheDirty) {
        expect(serviceContxt.redisCache.markCacheDirty).toHaveBeenCalledTimes(
          count
        );
      }
    }
  }
  function mockImplementation_invalidateAnyPermissionSetRelatedCaches(
    serviceContxt,
    options = {}
  ) {
    const { orgId = ORG_ID, userId } = options;
    serviceContxt.dal.organization.getOrgIdFromAppId.mockResolvedValue(orgId);
    serviceContxt.redisCache.markCacheDirty.mockImplementation((key) => {
      if (userId) {
        expect(key).toMatch(
          new RegExp(`rbacAuthGroupsForMember:${orgId}:${userId}`)
        );
      } else {
        expect(key).toMatch(new RegExp(`organization_permissions:${orgId}`));
      }

      return Promise.resolve();
    });
  }
  function expect_invalidateAnyPermissionSetRelatedCaches(
    serviceContxt,
    options = {}
  ) {
    const {
      ignoreOrgPermissionMarkDirty,
      noExpectMarkCacheDirty,
      organizationId = ORG_ID,
      resourceIds = []
    } = options;

    if (!noExpectMarkCacheDirty) {
      if (ignoreOrgPermissionMarkDirty) {
        expect(serviceContxt.redisCache.markCacheDirty).not.toHaveBeenCalled();
      } else {
        expect(serviceContxt.redisCache.markCacheDirty).toHaveBeenCalledTimes(
          1
        );
      }
    }

    expect(
      serviceContxt.dal.authAce.markCacheDirtyForGetACLForResources
    ).toHaveBeenCalledWith(organizationId, resourceIds);
    expect(
      serviceContxt.dal.authAce.markCacheDirtyForHasPermissions
    ).toHaveBeenCalledWith(organizationId, resourceIds);
  }

  describe('Authorization Groups', () => {
    it.each([
      ['getAuthGroups', { ownerOrganization: OWNER_ORG_ID }],
      [
        'createAuthGroup',
        {
          input: {
            ownerOrganization: OWNER_ORG_ID
          }
        }
      ],
      [
        'updateAuthGroup',
        {
          input: {
            ownerOrganization: OWNER_ORG_ID
          }
        }
      ],
      [
        'deleteAuthGroup',
        {
          id: 123,
          ownerOrganization: OWNER_ORG_ID
        }
      ]
    ])(
      '%s - restrict ownerOrganization to non superadmin or non internal token',
      async (funcName, args) => {
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        await expect(async () =>
          rbacBll[funcName](regularUserContext, args)
        ).rejects.toThrow(
          'Access to field ownerOrganization requires superadmin rights'
        );
      }
    );
    describe('getAuthGroups', () => {
      it('should call dal layer', async () => {
        const args = {
          test: 1
        };
        await rbacBll.getAuthGroups(regularUserContext, args);
        expect(authGroupDal.getAuthGroups).toHaveBeenCalledWith({
          orgGuid: ORG_GUID,
          test: 1
        });
      });
      it('should call dal layer - ownerOrganization - internal token', async () => {
        await rbacBll.getAuthGroups(internalTokenContext, {
          ownerOrganization: ORG_GUID
        });
        expect(authGroupDal.getAuthGroups).toHaveBeenCalledWith({
          ownerOrganization: ORG_GUID,
          orgGuid: ORG_GUID
        });
      });
      it('should call dal layer - ownerOrganization - superadmin', async () => {
        await rbacBll.getAuthGroups(superAdminContext, {
          ownerOrganization: ORG_GUID
        });
        expect(authGroupDal.getAuthGroups).toHaveBeenCalledWith({
          ownerOrganization: ORG_GUID,
          orgGuid: ORG_GUID
        });
      });
      it('getAuthGroup - no query params supplied', async () => {
        const args = {};
        await expect(async () =>
          rbacBll.getAuthGroup(regularUserContext, args)
        ).rejects.toThrow("At least one of 'id' or 'groupName' is required");
      });
      it('getAuthGroup', async () => {
        const args = {
          id: 1
        };
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authGroupDal.getAuthGroups.mockResolvedValueOnce({
          records: [
            {
              g: 1
            },
            {
              g: 2
            }
          ]
        });
        const result = await rbacBll.getAuthGroup(ctx, args);
        expect(result).toEqual({
          g: 1
        });
      });
      it('getAuthGroup - ownerOrganization - superadmin', async () => {
        const args = {
          id: 1,
          ownerOrganization: ORG_GUID_OF_OWNER_ORG
        };
        authGroupDal.getAuthGroups.mockResolvedValueOnce({
          records: [
            {
              g: 1
            }
          ]
        });
        const result = await rbacBll.getAuthGroup(ctx, args);
        expect(result).toEqual({
          g: 1
        });
        expect(authGroupDal.getAuthGroups).toHaveBeenCalledWith({
          id: 1,
          ids: [1],
          limit: 1,
          ownerOrganization: ORG_GUID_OF_OWNER_ORG,
          orgGuid: ORG_GUID_OF_OWNER_ORG
        });
      });
    });

    describe('createAuthGroup', () => {
      it('should call dal layer', async () => {
        const args = {
          input: {
            test: 1
          }
        };
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authGroupDal.createAuthGroup.mockResolvedValue({
          organizationId: ORG_GUID
        });
        mockImplementation_invalidateAnyAuthGroupRelatedCaches(serviceContext);

        await rbacBll.createAuthGroup(ctx, args);
        expect(authGroupDal.createAuthGroup).toHaveBeenCalledWith(
          expect.objectContaining({
            orgGuid: ORG_GUID,
            userId: USER_ID,
            test: 1
          })
        );

        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          ignoreACEHasPermissionMarkDirty: true,
          ignoreACLForResourcesMarkDirty: true
        });
      });
      it.each(['internal token', 'superadmin'])(
        'createAuthGroup - ownerOrganization - %s',
        async (tokenType) => {
          const isInternalToken = tokenType === 'internal token';
          const ctxByTokenType = isInternalToken ? internalTokenContext : ctx;
          const args = {
            input: {
              test: 1,
              ownerOrganization: ORG_GUID_OF_OWNER_ORG
            }
          };
          authGroupDal.createAuthGroup.mockResolvedValue({
            organizationId: ORG_GUID_OF_OWNER_ORG
          });
          mockImplementation_invalidateAnyAuthGroupRelatedCaches(
            serviceContext,
            [],
            {
              orgId: OWNER_ORG_ID
            }
          );

          await rbacBll.createAuthGroup(ctxByTokenType, args);
          expect(authGroupDal.createAuthGroup).toHaveBeenCalledWith(
            expect.objectContaining({
              orgGuid: ORG_GUID_OF_OWNER_ORG,
              userId:
                tokenType === 'internal token'
                  ? ORG_GUID_OF_OWNER_ORG
                  : USER_ID,
              test: 1
            })
          );

          expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
            ignoreACEHasPermissionMarkDirty: true,
            ignoreACLForResourcesMarkDirty: true,
            orgGuid: ORG_GUID_OF_OWNER_ORG,
            orgId: OWNER_ORG_ID
          });
        }
      );
      it('should add members', async () => {
        const members = [
          { id: 'member_id_1', memberType: 'User' },
          { id: 'member_id_2', memberType: 'Group' }
        ];
        const args = {
          input: {
            test: 1,
            members
          }
        };
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authGroupDal.createAuthGroup.mockImplementation((opts) => {
          expect(opts).toEqual(
            expect.objectContaining({
              id: expect.any(String),
              orgGuid: ORG_GUID,
              userId: USER_ID,
              test: 1,
              members: [
                { id: 'member_id_1', memberType: 'User' },
                { id: 'member_id_2', memberType: 'Group' }
              ]
            })
          );
          return Promise.resolve({
            organizationId: ORG_GUID
          });
        });
        mockImplementation_invalidateAnyAuthGroupRelatedCaches(
          serviceContext,
          members
        );

        await rbacBll.createAuthGroup(ctx, args);
        expect(authGroupDal.createAuthGroup).toHaveBeenCalled();
        expect(serviceContext.messageUtil._counter()).toEqual(4);
        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          members,
          ignoreACEHasPermissionMarkDirty: true,
          ignoreACLForResourcesMarkDirty: true
        });
      });
      it('should emit failure audit when DAL createAuthGroup rejects', async () => {
        const members = [
          {
            id: 'member_id_1',
            memberType: 'User'
          }
        ];
        const createError = new Error('failed to add members');

        const args = {
          input: {
            name: 'test auth group',
            description: 'test description',
            members
          }
        };

        authGroupDal.createAuthGroup.mockRejectedValueOnce(createError);

        await expect(
          rbacBll.createAuthGroup(ctx, args)
        ).rejects.toThrow('failed to add members');

        expect(authGroupDal.createAuthGroup).toHaveBeenCalledWith(
          expect.objectContaining({
            id: expect.any(String),
            name: 'test auth group',
            description: 'test description',
            orgGuid: ORG_GUID,
            userId: USER_ID,
            members
          })
        );

        expect(authGroupDal.markCacheDirtyForGetAuthGroups).not.toHaveBeenCalled();
        expect(authACEDal.markCacheDirtyForHasPermissions).not.toHaveBeenCalled();
        expect(authACEDal.markCacheDirtyForGetACLForResources).not.toHaveBeenCalled();
        expect(serviceContext.redisCache.markCacheDirty).not.toHaveBeenCalled();

        const messages = serviceContext.messageUtil._messages();

        expect(messages).toContainEqual(
          expect.objectContaining({
            event: 'auth_group_create',
            type: 'olp',
            serviceName: 'core-graphql-server',
            success: false
          })
        );

        expect(
          messages.find((message) => message.event === 'auth_group_member_add')
        ).toBeUndefined();

        expect(
          messages.find((message) => message.event === 'reload_session_users')
        ).toBeUndefined();
      });
      it('should emit create success and member-add failure audit when DAL marks add-member failure', async () => {
        const members = [
          {
            id: 'member_id_1',
            memberType: 'User'
          }
        ];

        const args = {
          input: {
            name: 'test auth group',
            description: 'test description',
            members
          }
        };

        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);

        authGroupDal.createAuthGroup.mockResolvedValueOnce({
          id: 'auth-group-id-1',
          organizationId: ORG_GUID,
          memberCount: 1,
          isAddMemberFailed: true
        });

        mockImplementation_invalidateAnyAuthGroupRelatedCaches(
          serviceContext,
          members
        );

        const result = await rbacBll.createAuthGroup(ctx, args);

        expect(result).toEqual(
          expect.objectContaining({
            id: 'auth-group-id-1',
            organizationId: ORG_GUID,
            memberCount: 1,
            isAddMemberFailed: true
          })
        );

        expect(authGroupDal.createAuthGroup).toHaveBeenCalledWith(
          expect.objectContaining({
            id: expect.any(String),
            name: 'test auth group',
            description: 'test description',
            orgGuid: ORG_GUID,
            userId: USER_ID,
            members
          })
        );

        const messages = serviceContext.messageUtil._messages();

        expect(messages).toContainEqual(
          expect.objectContaining({
            event: 'auth_group_create',
            type: 'olp',
            serviceName: 'core-graphql-server',
            authGroupId: 'auth-group-id-1',
            success: true
          })
        );

        expect(messages).toContainEqual(
          expect.objectContaining({
            event: 'auth_group_member_add',
            type: 'olp',
            serviceName: 'core-graphql-server',
            authGroupId: 'auth-group-id-1',
            success: false
          })
        );

        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          members,
          ignoreACEHasPermissionMarkDirty: true,
          ignoreACLForResourcesMarkDirty: true
        });
      });
    });

    describe('updateAuthGroup', () => {
      it('should call dal layer', async () => {
        const args = {
          input: {
            id: 123,
            test: 1
          }
        };
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        mockImplementation_invalidateAnyAuthGroupRelatedCaches(serviceContext);

        authGroupDal.updateAuthGroup.mockResolvedValue({
          organizationId: ORG_GUID
        });

        await rbacBll.updateAuthGroup(ctx, args);
        expect(authGroupDal.updateAuthGroup).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 123,
            orgGuid: ORG_GUID,
            userId: USER_ID,
            test: 1
          })
        );
        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          ignoreACEHasPermissionMarkDirty: true,
          ignoreACLForResourcesMarkDirty: true
        });
      });
      it.each(['internal token', 'superadmin'])(
        'updateAuthGroup - ownerOrganization - %s',
        async (tokenType) => {
          const isInternalToken = tokenType === 'internal token';
          const ctxByTokenType = isInternalToken ? internalTokenContext : ctx;
          const args = {
            input: {
              id: 123,
              test: 1,
              ownerOrganization: ORG_GUID_OF_OWNER_ORG
            }
          };
          mockImplementation_invalidateAnyAuthGroupRelatedCaches(
            serviceContext,
            [],
            {
              orgId: OWNER_ORG_ID
            }
          );

          authGroupDal.updateAuthGroup.mockResolvedValue({
            organizationId: ORG_GUID_OF_OWNER_ORG
          });

          await rbacBll.updateAuthGroup(ctxByTokenType, args);
          expect(authGroupDal.updateAuthGroup).toHaveBeenCalledWith(
            expect.objectContaining({
              id: 123,
              orgGuid: ORG_GUID_OF_OWNER_ORG,
              userId: isInternalToken ? ORG_GUID_OF_OWNER_ORG : USER_ID,
              test: 1
            })
          );

          expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
            ignoreACEHasPermissionMarkDirty: true,
            ignoreACLForResourcesMarkDirty: true,
            orgGuid: ORG_GUID_OF_OWNER_ORG,
            orgId: OWNER_ORG_ID
          });
        }
      );

      it('should emit AuthGroup update audit event', async () => {
        const args = {
          input: {
            id: 123,
            test: 1
          }
        };
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        mockImplementation_invalidateAnyAuthGroupRelatedCaches(serviceContext);

        authGroupDal.updateAuthGroup.mockResolvedValue({
          id: 123,
          organizationId: ORG_GUID
        });

        await rbacBll.updateAuthGroup(ctx, args);

        const messages = serviceContext.messageUtil._messages();

        expect(messages).toContainEqual(
          expect.objectContaining({
            event: 'auth_group_update',
            type: 'olp',
            serviceName: 'core-graphql-server',
            authGroupId: 123,
            success: true
          })
        );
      });
    });

    describe('deleteAuthGroup', () => {
      it('missing authGroup', async () => {
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        await expect(async () =>
          rbacBll.deleteAuthGroup(ctx, {
            id: 123
          })
        ).rejects.toThrow('Authorization group not found');
      });
      it('should NOT delete protected auth group', async () => {
        let error;
        authGroupDal.getAuthGroups.mockResolvedValueOnce({
          records: [
            {
              g: 123,
              isProtected: true
            }
          ]
        });
        try {
          await rbacBll.deleteAuthGroup(ctx, {
            id: 123
          });
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(authGroupDal.deleteAuthGroup).not.toHaveBeenCalled();
      });
      it('should call dal layer', async () => {
        const members = [
          {
            id: 'user_id_1',
            memberType: 'user'
          },
          {
            id: 'user_id_2',
            memberType: 'user'
          }
        ];
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authGroupDal.getAuthGroups.mockResolvedValueOnce({
          records: [
            {
              g: 123,
              isProtected: false,
              organizationId: ORG_GUID
            }
          ]
        });
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([
          'user_id_1',
          'user_id_2'
        ]);
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([
          'ag_id_1',
          'ag_id_2'
        ]);

        mockImplementation_invalidateAnyAuthGroupRelatedCaches(
          serviceContext,
          members
        );

        await rbacBll.deleteAuthGroup(ctx, {
          id: 123
        });
        expect(authGroupDal.deleteAuthGroup).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 123
          })
        );
        expect(authGroupDal.getAuthGroupMemberIds).toHaveBeenCalledTimes(2);
        expect(serviceContext.messageUtil._counter()).toEqual(3);
        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          members
        });
      });
      it.each(['internal token', 'superadmin'])(
        'deleteAuthGroup - ownerOrganization - %s',
        async (tokenType) => {
          const isInternalToken = tokenType === 'internal token';
          const ctxByTokenType = isInternalToken ? internalTokenContext : ctx;
          const members = [
            {
              id: 'user_id_1',
              memberType: 'user'
            },
            {
              id: 'user_id_2',
              memberType: 'user'
            }
          ];
          applicationDal.getAppIdFromOrgId.mockReturnValue(
            ORG_GUID_OF_OWNER_ORG
          );
          authGroupDal.getAuthGroups.mockResolvedValueOnce({
            records: [
              {
                g: 123,
                isProtected: false,
                organizationId: ORG_GUID_OF_OWNER_ORG
              }
            ]
          });
          authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([
            'user_id_1',
            'user_id_2'
          ]);
          authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([
            'ag_id_1',
            'ag_id_2'
          ]);

          mockImplementation_invalidateAnyAuthGroupRelatedCaches(
            serviceContext,
            members,
            { orgId: OWNER_ORG_ID }
          );

          await rbacBll.deleteAuthGroup(ctxByTokenType, {
            id: 123,
            ownerOrganization: OWNER_ORG_ID
          });
          expect(authGroupDal.deleteAuthGroup).toHaveBeenCalledWith(
            expect.objectContaining({
              id: 123
            })
          );
          expect(authGroupDal.getAuthGroupMemberIds).toHaveBeenCalledTimes(2);
          expect(serviceContext.messageUtil._counter()).toEqual(3);
          expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
            members,
            orgGuid: ORG_GUID_OF_OWNER_ORG,
            orgId: OWNER_ORG_ID
          });
        }
      );

      it('should emit AuthGroup delete audit event', async () => {
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authGroupDal.getAuthGroups.mockResolvedValueOnce({
          records: [
            {
              g: 123,
              isProtected: false,
              organizationId: ORG_GUID
            }
          ]
        });
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([]);
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([]);

        mockImplementation_invalidateAnyAuthGroupRelatedCaches(serviceContext);

        await rbacBll.deleteAuthGroup(ctx, {
          id: 123
        });

        const messages = serviceContext.messageUtil._messages();

        expect(messages).toContainEqual(
          expect.objectContaining({
            event: 'auth_group_delete',
            type: 'olp',
            serviceName: 'core-graphql-server',
            authGroupId: 123,
            success: true
          })
        );
      });
    });

    describe('group membership', () => {
      it.each([
        [
          'authGroupAddMembers',
          {
            id: 123,
            ownerOrganization: OWNER_ORG_ID
          }
        ],
        [
          'authGroupRemoveMembers',
          {
            id: 123,
            ownerOrganization: OWNER_ORG_ID
          }
        ]
      ])(
        '%s - restrict ownerOrganization to non superadmin or non internal token',
        async (funcName, args) => {
          applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
          await expect(async () =>
            rbacBll[funcName](regularUserContext, args)
          ).rejects.toThrow(
            'Access to field ownerOrganization requires superadmin rights'
          );
        }
      );
      it('throw on missing group', async () => {
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        await expect(async () =>
          rbacBll.authGroupAddMembers(ctx, {
            id: 123
          })
        ).rejects.toThrow('Authorization group not found');
        await expect(async () =>
          rbacBll.authGroupRemoveMembers(ctx, {
            id: 123
          })
        ).rejects.toThrow('Authorization group not found');
      });
      it('authGroupAddMembers - check member ids', async () => {
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authGroupDal.getAuthGroups.mockResolvedValueOnce({
          records: [
            {
              id: 123
            }
          ]
        });

        adminDal.getUsers.mockResolvedValueOnce({
          count: 0
        });
        await expect(async () =>
          rbacBll.authGroupAddMembers(ctx, {
            id: 123,
            members: [
              {
                memberType: 'user',
                id: 345
              }
            ]
          })
        ).rejects.toThrow(
          'One or more of the provided memberIds were not found'
        );
      });

      it('authGroupAddMembers', async () => {
        const members = [
          { id: 'member_id_1', memberType: 'User' },
          { id: 'member_id_2', memberType: 'User' }
        ];
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        adminDal.getUsers.mockResolvedValueOnce({
          count: 2,
          records: [{ id: 'member_id_1' }, { id: 'member_id_2' }]
        });
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            {
              id: 234,
              organizationId: ORG_GUID
            }
          ]
        });
        mockImplementation_invalidateAnyAuthGroupRelatedCaches(
          serviceContext,
          members
        );

        const g = await rbacBll.authGroupAddMembers(ctx, {
          id: 123,
          members
        });
        expect(g.id).toEqual(234);
        expect(authGroupDal.addMembersToAuthGroup).toHaveBeenCalledWith(234, [
          {
            id: 'member_id_1',
            memberType: 'User',
            member: { id: 'member_id_1' }
          },
          {
            id: 'member_id_2',
            memberType: 'User',
            member: { id: 'member_id_2' }
          }
        ]);
        expect(serviceContext.messageUtil._counter()).toEqual(2);
        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          members,
          ignoreACLForResourcesMarkDirty: true
        });
      });

      it('authGroupAddMembers - ownerOrganization - internal token', async () => {
        const members = [
          { id: 'member_id_1', memberType: 'User' },
          { id: 'member_id_2', memberType: 'User' }
        ];
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID_OF_OWNER_ORG);
        adminDal.getUsers.mockResolvedValueOnce({
          count: 2,
          records: [{ id: 'member_id_1' }, { id: 'member_id_2' }]
        });
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            {
              id: 234,
              organizationId: ORG_GUID_OF_OWNER_ORG
            }
          ]
        });
        mockImplementation_invalidateAnyAuthGroupRelatedCaches(
          serviceContext,
          members,
          {
            orgId: OWNER_ORG_ID
          }
        );

        const g = await rbacBll.authGroupAddMembers(internalTokenContext, {
          id: 123,
          members,
          ownerOrganization: OWNER_ORG_ID
        });
        expect(g.id).toEqual(234);
        expect(authGroupDal.addMembersToAuthGroup).toHaveBeenCalledWith(234, [
          {
            id: 'member_id_1',
            memberType: 'User',
            member: { id: 'member_id_1' }
          },
          {
            id: 'member_id_2',
            memberType: 'User',
            member: { id: 'member_id_2' }
          }
        ]);
        expect(serviceContext.messageUtil._counter()).toEqual(2);
        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          members,
          ignoreACLForResourcesMarkDirty: true,
          orgGuid: ORG_GUID_OF_OWNER_ORG,
          orgId: OWNER_ORG_ID
        });
      });

      it('authGroupAddMembers - ownerOrganization - superadmin', async () => {
        const members = [
          { id: 'member_id_1', memberType: 'User' },
          { id: 'member_id_2', memberType: 'User' }
        ];
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID_OF_OWNER_ORG);
        adminDal.getUsers.mockResolvedValueOnce({
          count: 2,
          records: [{ id: 'member_id_1' }, { id: 'member_id_2' }]
        });
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            {
              id: 234,
              organizationId: ORG_GUID_OF_OWNER_ORG
            }
          ]
        });
        mockImplementation_invalidateAnyAuthGroupRelatedCaches(
          serviceContext,
          members,
          {
            orgId: OWNER_ORG_ID
          }
        );

        const g = await rbacBll.authGroupAddMembers(ctx, {
          id: 123,
          members,
          ownerOrganization: OWNER_ORG_ID
        });
        expect(g.id).toEqual(234);
        expect(authGroupDal.addMembersToAuthGroup).toHaveBeenCalledWith(234, [
          {
            id: 'member_id_1',
            memberType: 'User',
            member: { id: 'member_id_1' }
          },
          {
            id: 'member_id_2',
            memberType: 'User',
            member: { id: 'member_id_2' }
          }
        ]);
        expect(serviceContext.messageUtil._counter()).toEqual(2);
        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          members,
          ignoreACLForResourcesMarkDirty: true,
          orgGuid: ORG_GUID_OF_OWNER_ORG,
          orgId: OWNER_ORG_ID
        });
      });
      it('authGroupAddMembers - should throw restriction error with internalToken, without ownerOrganization', async () => {
        const members = [
          { id: 'member_id_1', memberType: 'User' },
          { id: 'member_id_2', memberType: 'User' }
        ];
        await expect(async () =>
          rbacBll.authGroupAddMembers(internalTokenContext, {
            id: 123,
            members
          })
        ).rejects.toThrow(
          'Access to field ownerOrganization requires superadmin rights'
        );
      });

      it('authGroupRemoveMembers', async () => {
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        const memberIds = ['user_id_1', 'user_id_2'];
        const members = _.map(memberIds, (id) => ({
          id,
          memberType: 'user'
        }));

        adminDal.getUsers.mockResolvedValueOnce({
          records: memberIds.map((id) => ({ id }))
        });

        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            {
              id: 123,
              organizationId: ORG_GUID
            }
          ]
        });
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce(memberIds);
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([
          'ag_id_1',
          'ag_id_2'
        ]);
        mockImplementation_invalidateAnyAuthGroupRelatedCaches(
          serviceContext,
          members
        );

        const g = await rbacBll.authGroupRemoveMembers(ctx, {
          id: 123,
          memberIds
        });
        expect(g.id).toEqual(123);
        expect(authGroupDal.removeMembersFromAuthGroup).toHaveBeenCalledWith(
          123,
          memberIds
        );
        expect(serviceContext.messageUtil._counter()).toEqual(3);
        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          members,
          ignoreACLForResourcesMarkDirty: true
        });
      });

      it('should emit AuthGroup member-remove audit event', async () => {
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        const memberIds = ['user_id_1', 'user_id_2'];
        const members = _.map(memberIds, (id) => ({
          id,
          memberType: 'user'
        }));

        adminDal.getUsers.mockResolvedValueOnce({
          records: memberIds.map((id) => ({ id }))
        });

        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            {
              id: 123,
              organizationId: ORG_GUID
            }
          ]
        });
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce(memberIds);
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([]);
        mockImplementation_invalidateAnyAuthGroupRelatedCaches(
          serviceContext,
          members
        );

        await rbacBll.authGroupRemoveMembers(ctx, {
          id: 123,
          memberIds
        });

        const messages = serviceContext.messageUtil._messages();

        expect(messages).toContainEqual(
          expect.objectContaining({
            event: 'auth_group_member_remove',
            type: 'olp',
            serviceName: 'core-graphql-server',
            authGroupId: 123,
            success: true
          })
        );
      });

      it.each(['internal token', 'superadmin'])(
        'authGroupRemoveMembers - ownerOrganization - %s',
        async (tokenType) => {
          const isInternalToken = tokenType === 'internal token';
          const ctxByTokenType = isInternalToken ? internalTokenContext : ctx;
          applicationDal.getAppIdFromOrgId.mockReturnValue(
            ORG_GUID_OF_OWNER_ORG
          );
          const memberIds = ['user_id_1', 'user_id_2'];
          const members = _.map(memberIds, (id) => ({
            id,
            memberType: 'user'
          }));

          adminDal.getUsers.mockResolvedValueOnce({
            records: memberIds.map((id) => ({ id }))
          });

          authGroupDal.getAuthGroups.mockResolvedValue({
            records: [
              {
                id: 123,
                organizationId: ORG_GUID_OF_OWNER_ORG
              }
            ]
          });
          authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce(memberIds);
          authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([
            'ag_id_1',
            'ag_id_2'
          ]);
          mockImplementation_invalidateAnyAuthGroupRelatedCaches(
            serviceContext,
            members,
            {
              orgId: OWNER_ORG_ID
            }
          );

          const g = await rbacBll.authGroupRemoveMembers(ctxByTokenType, {
            id: 123,
            memberIds,
            ownerOrganization: OWNER_ORG_ID
          });
          expect(g.id).toEqual(123);
          expect(authGroupDal.removeMembersFromAuthGroup).toHaveBeenCalledWith(
            123,
            memberIds
          );
          expect(serviceContext.messageUtil._counter()).toEqual(3);
          expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
            members,
            ignoreACLForResourcesMarkDirty: true,
            orgGuid: ORG_GUID_OF_OWNER_ORG,
            orgId: OWNER_ORG_ID
          });
        }
      );

      it('authGroupRemoveMembers - auth group not found', async () => {
        const memberIds = ['user_id_1', 'user_id_2'];
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: []
        });
        let error;
        try {
          await rbacBll.authGroupRemoveMembers(ctx, {
            id: 123,
            memberIds
          });
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toEqual('Authorization group not found');
      });

      it('authGroupRemoveMembers - auth admin group - Should not allow remove member', async () => {
        const memberIds = ['user_id_1', 'user_id_2'];
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            {
              id: 123,
              name: 'orgAdmin',
              organizationId: ORG_GUID
            }
          ]
        });
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce(memberIds);
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([
          'ag_id_1',
          'ag_id_2'
        ]);
        // Get member in validateRemoveMembers
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue();
        // getOrganization
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: 1000,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            },
            defaultAuthGroups: [
              {
                id: '----orgAllAccess----',
                name: 'orgAllAccess',
                description: 'orgAllAccessDesc',
                defaultGroup: 'orgAllAccess'
              },
              {
                id: 123,
                name: 'orgAdmin',
                description: 'orgAdminDesc',
                defaultGroup: 'orgAdmin'
              }
            ]
          }
        });
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce(memberIds);

        let error;
        try {
          await rbacBll.authGroupRemoveMembers(ctx, {
            id: 123,
            memberIds
          });
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toEqual(
          'This operation will remove the last member of the Administrators group'
        );
      });

      it('authGroupRemoveMembers - auth admin group - Should allow remove member if have at least a user after deleting', async () => {
        const memberIds = ['user_id_1', 'user_id_2'];
        const dbMemberIds = [...memberIds, 'user_id_3'];
        const members = _.map(memberIds, (id) => ({
          id,
          memberType: 'user'
        }));

        adminDal.getUsers.mockResolvedValueOnce({
          records: memberIds.map((id) => ({ id }))
        });

        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            {
              id: 123,
              name: 'orgAdmin',
              organizationId: ORG_GUID
            }
          ]
        });
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce(memberIds);
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([
          'ag_id_1',
          'ag_id_2'
        ]);
        // Get member in validateRemoveMembers
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue();
        // getOrganization
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: 1000,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            },
            defaultAuthGroups: [
              {
                id: '----orgAllAccess----',
                name: 'orgAllAccess',
                description: 'orgAllAccessDesc',
                defaultGroup: 'orgAllAccess'
              },
              {
                id: 123,
                name: 'orgAdmin',
                description: 'orgAdminDesc',
                defaultGroup: 'orgAdmin'
              }
            ]
          }
        });
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce(dbMemberIds);

        mockImplementation_invalidateAnyAuthGroupRelatedCaches(
          serviceContext,
          members
        );

        const g = await rbacBll.authGroupRemoveMembers(ctx, {
          id: 123,
          memberIds
        });
        expect(g.id).toEqual(123);
        expect(authGroupDal.removeMembersFromAuthGroup).toHaveBeenCalledWith(
          123,
          memberIds
        );
        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          members,
          ignoreACLForResourcesMarkDirty: true
        });
      });

      it('authGroupRemoveMembers - auth admin group - Should allow remove member - total of DB records > Ids need to be removed', async () => {
        const memberIds = ['user_id_1', 'user_id_2'];
        const dbMemberIds = [...memberIds, 'user_id_3', 'user_id_4'];
        const members = _.map(memberIds, (id) => ({
          id,
          memberType: 'user'
        }));

        adminDal.getUsers.mockResolvedValueOnce({
          records: memberIds.map((id) => ({ id }))
        });

        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            {
              id: 123,
              name: 'orgAdmin',
              organizationId: ORG_GUID
            }
          ]
        });
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce(memberIds);
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([
          'ag_id_1',
          'ag_id_2'
        ]);
        // Get member in validateRemoveMembers
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue();
        // getOrganization
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: 1000,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            },
            defaultAuthGroups: [
              {
                id: '----orgAllAccess----',
                name: 'orgAllAccess',
                description: 'orgAllAccessDesc',
                defaultGroup: 'orgAllAccess'
              },
              {
                id: '123',
                name: 'orgAdmin',
                description: 'orgAdminDesc',
                defaultGroup: 'orgAdmin'
              }
            ]
          }
        });
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce(dbMemberIds);

        mockImplementation_invalidateAnyAuthGroupRelatedCaches(
          serviceContext,
          members
        );

        const g = await rbacBll.authGroupRemoveMembers(ctx, {
          id: 123,
          memberIds
        });
        expect(g.id).toEqual(123);
        expect(authGroupDal.removeMembersFromAuthGroup).toHaveBeenCalledWith(
          123,
          memberIds
        );
        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          members,
          ignoreACLForResourcesMarkDirty: true
        });
      });

      it('authGroupRemoveMembers - Remove member from non-admin group', async () => {
        const memberIds = ['user_id_1', 'user_id_2', 'user_id_3', 'user_id_4'];
        const members = _.map(memberIds, (id) => ({
          id,
          memberType: 'user'
        }));

        adminDal.getUsers.mockResolvedValueOnce({
          records: memberIds.map((id) => ({ id }))
        });

        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            {
              id: 123,
              organizationId: ORG_GUID
            }
          ]
        });
        // FIXME: seems that one of the following lines is redundant
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce(memberIds);
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([
          'ag_id_1',
          'ag_id_2'
        ]);

        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue();
        // getOrganization
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: 1000,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            },
            defaultAuthGroups: [
              {
                id: '----orgAllAccess----',
                name: 'orgAllAccess',
                description: 'orgAllAccessDesc',
                defaultGroup: 'orgAllAccess'
              },
              {
                id: 123,
                name: 'orgAdmin',
                description: 'orgAdminDesc',
                defaultGroup: 'orgAdmin'
              }
            ]
          }
        });

        // validateRemoveMembers
        authGroupDal.getAuthGroupMemberIds.mockResolvedValueOnce([
          ...members,
          { id: 'user_id_5', memberType: 'user' }
        ]);
        mockImplementation_invalidateAnyAuthGroupRelatedCaches(
          serviceContext,
          members
        );

        const g = await rbacBll.authGroupRemoveMembers(ctx, {
          id: 123,
          memberIds
        });
        expect(g.id).toEqual(123);
        expect(authGroupDal.removeMembersFromAuthGroup).toHaveBeenCalledWith(
          123,
          memberIds
        );
        expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
          members,
          ignoreACLForResourcesMarkDirty: true
        });
      });

      it('authGroupRemoveMembers - should throw restriction error with internalToken, without ownerOrganization', async () => {
        const memberIds = ['user_id_1', 'user_id_2', 'user_id_3', 'user_id_4'];
        await expect(async () =>
          rbacBll.authGroupRemoveMembers(internalTokenContext, {
            id: 123,
            memberIds
          })
        ).rejects.toThrow(
          'Access to field ownerOrganization requires superadmin rights'
        );
      });

      it('getAuthGroupMembers', async () => {
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            {
              id: 123
            }
          ]
        });
        authGroupDal.getAuthGroupMembers.mockResolvedValueOnce([]);
        await rbacBll.getAuthGroupMembers(ctx, {
          authGroupId: 123
        });
        expect(authGroupDal.getAuthGroupMembers).toHaveBeenCalledWith(123, {
          authGroupId: 123
        });
      });

      it('getAuthGroupMembership', async () => {
        await rbacBll.getAuthGroupMembership(
          _.set({}, '_authInfo.applicationId', 'test_org'),
          {
            authGroupId: 123
          }
        );
        expect(authGroupDal.getAuthGroupsContainingMember).toHaveBeenCalledWith(
          123,
          {
            authGroupId: 123,
            orgGuid: 'test_org'
          }
        );
      });
      it('getAuthGroupMembership - ownerOrganization', async () => {
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID_OF_OWNER_ORG);
        await rbacBll.getAuthGroupMembership(ctx, {
          authGroupId: 123,
          ownerOrganization: OWNER_ORG_ID
        });
        expect(authGroupDal.getAuthGroupsContainingMember).toHaveBeenCalledWith(
          123,
          {
            authGroupId: 123,
            orgGuid: ORG_GUID_OF_OWNER_ORG,
            ownerOrganization: OWNER_ORG_ID
          }
        );
      });
    });

    describe('checkAuthGroupsForOrganizationPermissions', () => {
      it('call dal', async () => {
        authGroupDal.getAuthGroupsPermissionMaskForOrganization.mockResolvedValueOnce(
          [1088]
        );
        const context = ctx;
        let result = await rbacBll.checkAuthGroupsForOrganizationPermissions(
          context,
          'test_org',
          ['test_g1', 'test_g2'],
          ['admin.user.read', 'admin.group.read']
        );
        expect(result).toEqual(true);
        expect(
          authGroupDal.getAuthGroupsPermissionMaskForOrganization
        ).toHaveBeenCalled();
        expect(
          authGroupDal.getAuthGroupsPermissionMaskForOrganization
        ).toHaveBeenCalledWith('test_org', ['test_g1', 'test_g2']);
      });
      it('should return false when requireAll option is set to true', async () => {
        const context = ctx;
        authGroupDal.getAuthGroupsPermissionMaskForOrganization.mockResolvedValueOnce(
          [1088]
        );
        let result = await rbacBll.checkAuthGroupsForOrganizationPermissions(
          context,
          'test_org',
          ['test_g1', 'test_g2'],
          ['admin.user.read', 'cms.sources.read'],
          {
            requireAll: true
          }
        );
        expect(result).toEqual(false);
        expect(
          authGroupDal.getAuthGroupsPermissionMaskForOrganization
        ).toHaveBeenCalled();
        expect(
          authGroupDal.getAuthGroupsPermissionMaskForOrganization
        ).toHaveBeenCalledWith('test_org', ['test_g1', 'test_g2']);
      });
      it('should return true when requireAll option is set to false (meaning requireAny)', async () => {
        const context = ctx;
        authGroupDal.getAuthGroupsPermissionMaskForOrganization.mockResolvedValueOnce(
          [1088]
        );
        let result = await rbacBll.checkAuthGroupsForOrganizationPermissions(
          context,
          'test_org',
          ['test_g1', 'test_g2'],
          ['admin.user.read', 'cms.sources.read'],
          {
            requireAll: false
          }
        );
        expect(result).toEqual(true);
        expect(
          authGroupDal.getAuthGroupsPermissionMaskForOrganization
        ).toHaveBeenCalled();
        expect(
          authGroupDal.getAuthGroupsPermissionMaskForOrganization
        ).toHaveBeenCalledWith('test_org', ['test_g1', 'test_g2']);
      });
      it('should return false when throwMismatchOrgRole option is set to true - missing auth group', async () => {
        const context = ctx;
        const result = await rbacBll.checkAuthGroupsForOrganizationPermissions(
          context,
          'test_org',
          [],
          ['admin.user.read'],
          {
            throwMismatchOrgRole: true
          }
        );
        expect(result).toBeDefined();
        expect(result).toEqual(false);
        expect(
          authGroupDal.getAuthGroupsPermissionMaskForOrganization
        ).not.toHaveBeenCalled();
      });
      it('should return false when mismatch between appRole AGs and org object (org ACLs)', async () => {
        const context = ctx;
        authGroupDal.getAuthGroupsPermissionMaskForOrganization.mockResolvedValueOnce(
          []
        );
        const result = await rbacBll.checkAuthGroupsForOrganizationPermissions(
          context,
          'test_org',
          ['test_g1', 'test_g2'],
          ['admin.user.read'],
          {
            throwMismatchOrgRole: true
          }
        );
        expect(result).toBeDefined();
        expect(result).toEqual(false);
        expect(
          authGroupDal.getAuthGroupsPermissionMaskForOrganization
        ).toHaveBeenCalled();
      });
      it.each([
        {
          tokenType: 'non-superadmin',
          desc: 'not be passed checking',
          expected: false
        },
        {
          tokenType: 'superadmin',
          desc: 'be passed checking',
          expected: true
        }
      ])(
        'should $desc input superadmin rights when requestor is $tokenType',
        async ({ expected, tokenType }) => {
          let ctxByTokenType = regularUserContext;
          authGroupDal.getAuthGroupsPermissionMaskForOrganization.mockResolvedValueOnce(
            [1088]
          );
          if (tokenType === 'superadmin') {
            ctxByTokenType = superAdminContext;
            serviceContext.dal.role.getRoles.mockReturnValue({
              records: [
                {
                  id: 'super_admin_role_id',
                  permissions: [-2, 268427519, 1073741824, 5189619]
                }
              ]
            });
          }
          const result = await rbacBll.checkAuthGroupsForOrganizationPermissions(
            ctxByTokenType,
            'test_org',
            ['test_g1', 'test_g2'],
            ['superadmin']
          );
          expect(result).toEqual(expected);
          expect(
            authGroupDal.getAuthGroupsPermissionMaskForOrganization
          ).toHaveBeenCalled();
          if (tokenType === 'superadmin') {
            expect(serviceContext.dal.role.getRoles).toHaveBeenCalledWith(
              expect.any(Object),
              expect.objectContaining({
                id: expect.any(String),
                organizationIds: [
                  _.get(serviceContext, 'config.flyway.rootOrgId')
                ]
              }),
              true
            );
          } else {
            expect(serviceContext.dal.role.getRoles).not.toHaveBeenCalled();
          }
        }
      );
    });

    describe('addDefaultACEsToResources', () => {
      let context, inputArgs;
      beforeEach(() => {
        // before each
        jest.resetAllMocks();
      });
      it('should error if no auth group or permission set', async () => {
        context = mockUtil.makeContext({ authType: 'api_internal' });
        // getOrg
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationGuid: '---orgGuid---',
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        });
        // getAuthPermissionSet
        applicationDal.getAppIdFromOrgId.mockReturnValue('---orgGuid---');
        serviceContext.redisCache.markCacheDirty.mockReturnValue();
        //addACEsToResource (not run)
        authACEDal.addACEsToResources.mockReturnValue();
        dalFolder.getObjectIdsFromOpaqueIds.mockImplementationOnce(
          async (ctx, ids) => {
            return ids.reduce((m, x) => m.set(x, x), new Map());
          }
        );
        let error;

        inputArgs = {
          organizationId: 10000,
          resourceType: 'TDO',
          newTDO: {}
        };

        try {
          await rbacBll.addDefaultACEsToResources(context, inputArgs);
        } catch (e) {
          error = e;
        }

        expect(error).toBeUndefined();
        expect(
          serviceContext.dal.organization.getOrganization
        ).toHaveBeenCalled();
        expect(authGroupDal.getAuthGroups).not.toHaveBeenCalled();
        expect(authPermissionDal.getAuthPermissionSets).not.toHaveBeenCalled();
        expect(serviceContext.redisCache.asyncSet).toHaveBeenCalled();
        expect(authACEDal.addACEsToResources).not.toHaveBeenCalled();
      });
      it.each([
        ['TDO', 'tdo_id'],
        ['Folder', 'folder_id']
      ])(
        'should create %s ACEs correctly',
        async (resourceType, resourceId) => {
          context = mockUtil.makeContext();
          // getOrg
          serviceContext.dal.organization.getOrganization.mockReturnValue({
            organizationGuid: ORG_GUID,
            kvp: {
              features: {
                enableRBACFeature: 'enabled'
              },
              defaultAuthGroups: [
                {
                  id: 'auth_group_1',
                  name: 'orgAdmin',
                  defaultGroup: 'orgAdmin',
                  permissionSets: {
                    resourceRole: {
                      id: 'id-003',
                      name: 'role 3'
                    },
                    organizationRole: {
                      id: 'id-004',
                      name: 'role 4'
                    }
                  }
                },
                {
                  id: 'auth_group_2',
                  name: 'orgAllAccess',
                  defaultGroup: 'orgAllAccess',
                  permissionSets: {
                    resourceRole: {
                      id: 'id-001',
                      name: 'role 1'
                    },
                    organizationRole: {
                      id: 'id-002',
                      name: 'role 2'
                    }
                  }
                }
              ]
            }
          });
          // _createDefaultUserAuthGroups - exist user private AG.
          authGroupDal.getUserPrivateAuthGroup.mockResolvedValueOnce({
            id: 'user-private-auth-group-id',
            authClass: 'User'
          });
          // getAuthGroups
          authGroupDal.getAuthGroups.mockResolvedValue({
            records: [
              { id: 'auth_group_1', name: 'orgAdmin' },
              { id: 'auth_group_2', name: 'orgAllAccess' }
            ]
          });
          // getAuthPermissionSet
          applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
          authPermissionDal.getAuthPermissionSets.mockReturnValue(
            [
              { id: '---id1---', name: 'aiWARE Administrator' },
              { id: '---id2---', name: 'aiWARE - Create' },
              { id: '---id2---', name: 'aiWARE Full Access' }
            ],
            [{ id: '---id1---' }, { id: '---id2---' }]
          );
          serviceContext.redisCache.markCacheDirty.mockReturnValue();
          authACEDal.addACEsToResources.mockReturnValue();
          serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
            ORG_ID
          );
          serviceContext.dal.user.getDefaultOrgAdminUser.mockReturnValue({
            id: '---userId---'
          });
          serviceContext.dal.admin.getUsers.mockReturnValue([{}, {}]);
          authGroupDal.getAuthGroups.mockResolvedValue({
            records: [
              { id: 'auth_group_1', name: 'orgAdmin' },
              { id: 'auth_group_2', name: 'orgAllAccess' }
            ]
          });
          authACEDal.getACLForResources.mockReturnValue({
            records: [
              {
                objectID: '',
                permissionSetId: ''
              }
            ]
          });
          serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
            ORG_GUID
          );
          authACEDal.addACEsToResources.mockImplementationOnce((args) => {
            // 2 resourceRoles from org KVP, 1 owner ACE
            expect(args.entries.length).toEqual(3);

            const ownerACE = _.find(
              args.entries,
              (e) => e.permissionSetID === 'id-004' // adminPermissionSet in organizationRole
            );
            expect(ownerACE).toBeDefined();

            return Promise.resolve({});
          });
          mockImplementation_invalidateAnyPermissionSetRelatedCaches(
            serviceContext
          );

          dalFolder.getObjectIdsFromOpaqueIds.mockImplementationOnce(
            (ctx, ids) => {
              return ids.reduce((m, x) => {
                const folderId = `folder_id_for_${x}`;
                m.set(folderId, folderId);
                m.set(x, folderId);

                return m;
              }, new Map());
            }
          );

          let error;

          inputArgs = {
            organizationId: 10000,
            resourceType,
            objectId: resourceId
          };

          try {
            await rbacBll.addDefaultACEsToResources(context, inputArgs);
          } catch (e) {
            error = e;
          }

          expect(error).toBeUndefined();
          expect(
            serviceContext.dal.organization.getOrganization
          ).toHaveBeenCalled();
          expect(authGroupDal.getAuthGroups).not.toHaveBeenCalled();
          expect(
            authPermissionDal.getAuthPermissionSets
          ).not.toHaveBeenCalled();
          expect(serviceContext.redisCache.asyncSet).toHaveBeenCalled();
          expect(authACEDal.addACEsToResources).toHaveBeenCalled();

          // Routine per-object default provisioning does NOT emit
          // DefaultACEPolicyUpdate (that event is reserved for the explicit
          // addACEs nested mutation on an SDO).
          const policyEvents = serviceContext.messageUtil
            ._messages()
            .filter((m) => m.event === 'default_ace_policy_update');
          expect(policyEvents).toHaveLength(0);

          if (resourceType === 'Folder') {
            expect(serviceContext.redisClient._counter()).toEqual(1);
          }
        }
      );
      it('re-throws when applying default ACEs fails and does NOT emit DefaultACEPolicyUpdate', async () => {
        context = mockUtil.makeContext();
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationGuid: ORG_GUID,
          kvp: {
            features: { enableRBACFeature: 'enabled' },
            defaultAuthGroups: [
              {
                id: 'auth_group_1',
                name: 'orgAdmin',
                defaultGroup: 'orgAdmin',
                permissionSets: {
                  resourceRole: { id: 'id-003', name: 'role 3' },
                  organizationRole: { id: 'id-004', name: 'role 4' }
                }
              }
            ]
          }
        });
        authGroupDal.getUserPrivateAuthGroup.mockResolvedValueOnce({
          id: 'user-private-auth-group-id',
          authClass: 'User'
        });
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [{ id: 'auth_group_1', name: 'orgAdmin' }]
        });
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authPermissionDal.getAuthPermissionSets.mockReturnValue([
          { id: '---id1---', name: 'aiWARE Administrator' }
        ]);
        serviceContext.redisCache.markCacheDirty.mockReturnValue();
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.user.getDefaultOrgAdminUser.mockReturnValue({
          id: '---userId---'
        });
        serviceContext.dal.admin.getUsers.mockReturnValue([{}, {}]);
        serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
          ORG_GUID
        );
        // The default-ACE apply fails at the DAL layer.
        authACEDal.addACEsToResources.mockRejectedValue(
          new Error('db write failed')
        );

        const inputArgs = {
          organizationId: 10000,
          resourceType: 'TDO',
          objectId: 'tdo_fail'
        };

        await expect(async () =>
          rbacBll.addDefaultACEsToResources(context, inputArgs)
        ).rejects.toThrow('Error creating resource Access Control Entries');

        // Provisioning failures propagate but are NOT audited as a policy
        // update — the default-ACE apply here is not a creation-policy change.
        const policyEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'default_ace_policy_update');
        expect(policyEvents).toHaveLength(0);
      });
      it('should create ACEs correctly', async () => {
        context = mockUtil.makeContext();
        // getOrg
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationGuid: ORG_GUID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            },
            defaultAuthGroups: [
              {
                id: 'auth_group_1',
                name: 'orgAdmin',
                defaultGroup: 'orgAdmin',
                permissionSets: {
                  resourceRole: {
                    id: 'id-003',
                    name: 'role 3'
                  },
                  organizationRole: {
                    id: 'id-004',
                    name: 'role 4'
                  }
                }
              },
              {
                id: 'auth_group_2',
                name: 'orgAllAccess',
                defaultGroup: 'orgAllAccess',
                permissionSets: {
                  resourceRole: {
                    id: 'id-001',
                    name: 'role 1'
                  },
                  organizationRole: {
                    id: 'id-002',
                    name: 'role 2'
                  }
                }
              }
            ]
          }
        });
        // _createDefaultUserAuthGroups - exist user private AG.
        const mockError = new Error('resource_conflict');
        mockError.name = 'resource_conflict';
        authGroupDal.createAuthGroup.mockRejectedValue(mockError);
        // getAuthGroups
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            { id: 'auth_group_1', name: 'orgAdmin' },
            { id: 'auth_group_2', name: 'orgAllAccess' }
          ]
        });
        // getAuthPermissionSet
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authPermissionDal.getAuthPermissionSets.mockReturnValue(
          [
            { id: '---id1---', name: 'aiWARE Administrator' },
            { id: '---id2---', name: 'aiWARE - Create' },
            { id: '---id2---', name: 'aiWARE Full Access' }
          ],
          [{ id: '---id1---' }, { id: '---id2---' }]
        );
        serviceContext.redisCache.markCacheDirty.mockReturnValue();
        //addACEsToResource (not run)
        authACEDal.addACEsToResources.mockReturnValue();
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.user.getDefaultOrgAdminUser.mockReturnValue({
          id: '---userId---'
        });
        serviceContext.dal.admin.getUsers.mockReturnValue([{}, {}]);
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [
            { id: 'auth_group_1', name: 'orgAdmin' },
            { id: 'auth_group_2', name: 'orgAllAccess' }
          ]
        });
        authACEDal.getACLForResources.mockReturnValue({
          records: [
            {
              objectID: '',
              permissionSetId: ''
            }
          ]
        });
        serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
          ORG_GUID
        );
        authACEDal.addACEsToResources.mockReturnValue({});
        mockImplementation_invalidateAnyPermissionSetRelatedCaches(
          serviceContext
        );

        let error;

        inputArgs = {
          organizationId: 10000,
          resourceType: 'TDO',
          newTDO: {}
        };

        try {
          await rbacBll.addDefaultACEsToResources(context, inputArgs);
        } catch (e) {
          error = e;
        }

        expect(error).toBeUndefined();
        expect(
          serviceContext.dal.organization.getOrganization
        ).toHaveBeenCalled();
        expect(authGroupDal.getAuthGroups).not.toHaveBeenCalled();
        expect(authPermissionDal.getAuthPermissionSets).not.toHaveBeenCalled();
        expect(serviceContext.redisCache.asyncSet).toHaveBeenCalled();

        expect(authACEDal.addACEsToResources).toHaveBeenCalled();
      });
      it('should create private user auth group for requestor from context when adding default ACEs', async () => {
        const privateAuthGroupId = 'private-auth-group-id';
        const resourceId = 'tdo_id_context_private_ag';
        const orgAdminPermissionSetId = 'org-admin-permission-set-id';

        context = mockUtil.makeContext();

        _.set(context, '_authInfo.applicationId', ORG_GUID);
        _.set(context, '_authInfo.userId', USER_ID);
        _.set(context, '_authInfo.kvp.firstName', 'Test');
        _.set(context, '_authInfo.kvp.lastName', 'User');
        _.set(context, '_authInfo.scimConnectId', 'test-scim-connect-id');

        serviceContext.dal.organization.getOrganization.mockResolvedValue({
          id: ORG_ID,
          organizationId: ORG_ID,
          organizationGuid: ORG_GUID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            },
            defaultAuthGroups: [
              {
                id: 'org_admin_group_id',
                name: 'orgAdmin',
                defaultGroup: 'orgAdmin',
                permissionSets: {
                  resourceRole: {
                    id: 'resource-role-permission-set-id',
                    name: 'aiWARE Full Access'
                  },
                  organizationRole: {
                    id: orgAdminPermissionSetId,
                    name: 'aiWARE Administrator'
                  }
                }
              },
              {
                id: 'org_all_access_group_id',
                name: 'orgAllAccess',
                defaultGroup: 'orgAllAccess',
                permissionSets: {
                  resourceRole: {
                    id: 'org-all-access-resource-role-permission-set-id',
                    name: 'aiWARE Full Access'
                  }
                }
              }
            ]
          }
        });

        serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(ORG_ID);
        serviceContext.dal.application.getAppIdFromOrgId.mockResolvedValue(ORG_GUID);

        // No existing private group, so _createDefaultUserAuthGroups should create one.
        authGroupDal.getUserPrivateAuthGroup.mockResolvedValueOnce(null);

        authGroupDal.createAuthGroup.mockResolvedValueOnce({
          id: privateAuthGroupId,
          organizationId: ORG_GUID
        });

        authGroupDal.addMembersToAuthGroup.mockResolvedValueOnce();

        authGroupDal.getAuthGroupsContainingMember
          .mockResolvedValueOnce({
            records: []
          })
          .mockResolvedValueOnce({
            records: [
              {
                id: privateAuthGroupId,
                authClass: 'User'
              }
            ]
          });

        serviceContext.redisCache.markCacheDirty.mockResolvedValue(true);
        serviceContext.redisCache.asyncSet.mockResolvedValue(true);

        authACEDal.addACEsToResources.mockResolvedValueOnce({});

        inputArgs = {
          organizationId: ORG_ID,
          resourceType: 'TDO',
          objectId: resourceId
        };

        await rbacBll.addDefaultACEsToResources(context, inputArgs);

        expect(authGroupDal.getUserPrivateAuthGroup).toHaveBeenCalledWith(
          ORG_GUID,
          USER_ID
        );

        expect(authGroupDal.createAuthGroup).toHaveBeenCalledWith(
          expect.objectContaining({
            name: `Default Private Group for User ${USER_ID}`,
            description: `This group is created as the default group for User: ${USER_ID}`,
            orgGuid: ORG_GUID,
            userId: USER_ID,
            isProtected: true,
            authClass: 'User',
            audit: {
              isPrivateUserAuthGroup: true,
              users: [
                expect.objectContaining({
                  memberId: USER_ID,
                  memberType: 'user',
                  userId: USER_ID
                })
              ]
            }
          })
        );

        expect(authGroupDal.addMembersToAuthGroup).toHaveBeenCalledWith(
          privateAuthGroupId,
          [{ id: USER_ID, memberType: 'User' }]
        );

        const addAcesArgs = authACEDal.addACEsToResources.mock.calls[0][0];

        expect(addAcesArgs).toEqual(
          expect.objectContaining({
            organizationGuid: ORG_GUID,
            ownerOrganization: ORG_ID,
            resourceType: 'TDO',
            ids: [resourceId]
          })
        );

        // 2 default resourceRole ACEs + 1 owner ACE using requestor private group.
        expect(addAcesArgs.entries.length).toBe(3);

        const ownerACE = _.find(
          addAcesArgs.entries,
          (entry) =>
            entry.permissionSetID === orgAdminPermissionSetId &&
            _.get(entry, 'member.id') === privateAuthGroupId &&
            _.get(entry, 'member.memberType') === 'group'
        );

        expect(ownerACE).toBeDefined();

        expect(authGroupDal.getAuthGroupsContainingMember).toHaveBeenCalledWith(
          USER_ID,
          { orgGuid: ORG_GUID }
        );

        expect(authGroupDal.getAuthGroupsContainingMember).toHaveBeenCalledTimes(2);

        expect(context._authInfo.authGroups).toEqual([privateAuthGroupId]);
        expect(context._authInfo.privateAuthGroups).toEqual([privateAuthGroupId]);

        const messages = serviceContext.messageUtil._messages();

        expect(messages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              event: 'auth_group_create',
              type: 'olp',
              serviceName: 'core-graphql-server',
              authGroupId: privateAuthGroupId,
              isPrivateUserAuthGroup: true,
              success: true,
              user: expect.objectContaining({
                memberId: USER_ID,
                memberType: 'User',
                userId: USER_ID
              })
            }),
            expect.objectContaining({
              event: 'auth_group_member_add',
              type: 'olp',
              serviceName: 'core-graphql-server',
              authGroupId: privateAuthGroupId,
              success: true,
              users: [
                expect.objectContaining({
                  memberId: USER_ID,
                  memberType: 'User',
                  userId: USER_ID
                })
              ]
            }),
            expect.objectContaining({
              type: 'session',
              event: 'reload_session_users',
              userIds: [USER_ID],
              organizationGuid: ORG_GUID
            })
          ])
        );
      });

      describe('SDOSchema resource type', () => {
        beforeEach(() => {
          context = mockUtil.makeContext();
          // getOrg
          serviceContext.dal.organization.getOrganization.mockReturnValue({
            id: ORG_ID,
            organizationGuid: ORG_GUID,
            kvp: {
              features: {
                enableRBACFeature: 'enabled',
                enableRBACFeatureForSDO: 'enabled'
              },
              defaultAuthGroups: [
                {
                  id: 'org_admin_group_id',
                  name: 'Test Organization - Administrators',
                  defaultGroup: 'orgAdmin',
                  permissionSets: {
                    organizationRole: {
                      id: 'org_admin_ps_id',
                      name: 'aiWARE Administrator'
                    },
                    resourceRole: {
                      id: 'resource_role_ps_id',
                      name: 'aiWARE Full Access'
                    }
                  }
                },
                {
                  id: 'org_user_group_id',
                  name: 'Test Organization - Users',
                  defaultGroup: 'orgAllAccess',
                  permissionSets: {
                    organizationRole: {
                      id: 'only_create_ps_id',
                      name: 'aiWARE - Create'
                    },
                    sdoRole: {
                      id: 'sdo_role_ps_id',
                      name: 'aiWARE Read Only'
                    }
                  }
                }
              ]
            }
          });

          _.set(context, 'config.rbac.defaultPolicies.policies', [
            {
              authGroupName: 'orgAdmin',
              permissionSetName: 'aiWARE Administrator',
              scope: 'Organization'
            },
            {
              authGroupName: 'orgAdmin',
              permissionSetName: 'aiWARE Full Access',
              scope: 'Resource'
            },
            {
              authGroupName: 'orgAdmin',
              permissionSetName: 'aiWARE Full Access',
              scope: 'RootFolder'
            },
            {
              authGroupName: 'orgAllAccess',
              permissionSetName: 'aiWARE - Create',
              scope: 'Organization'
            },
            {
              authGroupName: 'orgAllAccess',
              permissionSetName: 'aiWARE Full Access',
              scope: 'RootFolder'
            },
            {
              authGroupName: 'orgAllAccess',
              permissionSetName: 'aiWARE Read Only',
              scope: 'SDO'
            }
          ]);

          // _createDefaultUserAuthGroups - exist user private AG.
          const mockError = new Error('resource_conflict');
          mockError.name = 'resource_conflict';
          authGroupDal.createAuthGroup.mockRejectedValue(mockError);

          applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
          serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
            ORG_ID
          );
          serviceContext.dal.user.getDefaultOrgAdminUser.mockReturnValue({
            id: USER_ID
          });
          serviceContext.redisCache.markCacheDirty.mockReturnValue();

          inputArgs = {
            organizationId: ORG_ID,
            resourceType: 'SDOSchema',
            objectId: 'schema_id_123'
          };
        });
        it('should skip adding SDO default ACEs when ignoreDefaultSDORole is true', async () => {
          inputArgs = {
            organizationId: ORG_ID,
            resourceType: 'SDOSchema',
            objectId: 'schema_id_123',
            ignoreDefaultSDORole: true
          };

          authACEDal.addACEsToResources.mockImplementation((args) => {
            const sdoRoleEntries = args.entries.filter(
              (e) => e.permissionSetID === 'sdo_role_ps_id' //SDORole in Org KVP
            );
            expect(sdoRoleEntries.length).toBe(0);
            expect(args.entries.length).toBeGreaterThan(0);
            return Promise.resolve({});
          });

          await rbacBll.addDefaultACEsToResources(context, inputArgs);

          expect(authACEDal.addACEsToResources).toHaveBeenCalled();
        });

        it('should create ACEs for SDO and SDOSchema with existing permission sets in Org KVP', async () => {
          authGroupDal.createAuthGroup.mockResolvedValueOnce({ id: USER_ID });

          mockImplementation_invalidateAnyPermissionSetRelatedCaches(
            serviceContext,
            { userId: USER_ID }
          );

          authACEDal.addACEsToResources.mockImplementation((args) => {
            expect(args.entries.length).toEqual(3); // 1 sdo group + 1 resource group + 1 owner ACE

            // Check owner entry
            const ownerACE = _.find(
              args.entries,
              (e) => e.permissionSetID === 'org_admin_ps_id' // adminPermissionSet in organizationRole
            );
            expect(ownerACE).toBeDefined();

            return Promise.resolve([
              {
                object_type: 'recording',
                id_text: 't1',
                auth_group_id: 'ag1',
                permission_set_id: 'ps1',
                is_protected: false
              }
            ]);
          });

          await rbacBll.addDefaultACEsToResources(
            context,
            inputArgs
          );

          expect(authACEDal.addACEsToResources).toHaveBeenCalled();
          expect(
            serviceContext.dal.organization.updateOrganizationKvp
          ).not.toHaveBeenCalled();
        });

        it('should fetch missing permission sets from database and update organization KVP', async () => {
          authGroupDal.createAuthGroup.mockResolvedValueOnce({ id: USER_ID });
          // getOrg
          serviceContext.dal.organization.getOrganization.mockReturnValue({
            id: ORG_ID,
            organizationGuid: ORG_GUID,
            kvp: {
              features: {
                enableRBACFeature: 'enabled',
                enableRBACFeatureForSDO: 'enabled'
              },
              defaultAuthGroups: [
                {
                  id: 'org_admin_group_id',
                  name: 'Test Organization - Administrators',
                  defaultGroup: 'orgAdmin',
                  permissionSets: {
                    organizationRole: {
                      id: 'org_admin_ps_id',
                      name: 'aiWARE Administrator'
                    },
                    resourceRole: {
                      id: 'resource_role_ps_id',
                      name: 'aiWARE Full Access'
                    }
                  }
                },
                {
                  id: 'org_user_group_id',
                  name: 'Test Organization - Users',
                  defaultGroup: 'orgAllAccess',
                  permissionSets: {
                    organizationRole: {
                      id: 'only_create_ps_id',
                      name: 'aiWARE - Create'
                    },
                    sdoRole: {
                      authGroupName: 'orgAllAccess',
                      permissionSetName: 'aiWARE Read Only',
                      scope: 'SDO'
                    }
                  }
                }
              ]
            }
          });
          authPermissionDal.getAuthPermissionSets.mockImplementation((args) => {
            if (args.nameRegex === 'aiWARE Read Only') {
              return Promise.resolve([
                {
                  id: 'db_aiware_read_only_ps_id',
                  name: 'aiWARE Read Only'
                }
              ]);
            }

            return Promise.resolve([]);
          });

          serviceContext.dal.organization.updateOrganizationKvp.mockResolvedValue();

          authACEDal.addACEsToResources.mockImplementation((args) => {
            expect(args.entries.length).toEqual(3); // 1 sdo group + 1 owner ACE + 1 resource group
            return Promise.resolve({});
          });

          await rbacBll.addDefaultACEsToResources(context, inputArgs);

          expect(authPermissionDal.getAuthPermissionSets).toHaveBeenCalledTimes(
            1
          );
          expect(authPermissionDal.getAuthPermissionSets).toHaveBeenCalled();
          expect(
            serviceContext.dal.organization.updateOrganizationKvp
          ).toHaveBeenCalled();
        });

        it.each(['SDO', 'SDOSchema'])(
          'should skip %s ACE creation when RBAC for SDO is disabled',
          async (resourceType) => {
            inputArgs = {
              organizationId: ORG_ID,
              resourceType: 'SDOSchema',
              objectId: 'schema_id_123'
            };

            // getOrg
            serviceContext.dal.organization.getOrganization.mockReturnValue({
              id: ORG_ID,
              organizationGuid: ORG_GUID,
              kvp: {
                features: {
                  enableRBACFeature: 'enabled',
                  enableRBACFeatureForSDO: 'disabled'
                }
              }
            });
            await rbacBll.addDefaultACEsToResources(context, inputArgs);
            expect(authACEDal.addACEsToResources).not.toHaveBeenCalled();
          });
      });
    });
  });

  describe('Authorization Permission Set', () => {
    it.each([
      ['createAuthPermissionSet', { input: { organizationID: OWNER_ORG_ID } }],
      [
        'updateAuthPermissionSet',
        {
          input: {
            id: 'permission_set_1',
            ownerOrganization: OWNER_ORG_ID
          }
        }
      ],
      [
        'deleteAuthPermissionSet',
        { id: 'permission_set_id', ownerOrganization: OWNER_ORG_ID }
      ],
      [
        'getAuthPermissionSet',
        { id: 'permission_set_id', ownerOrganization: OWNER_ORG_ID }
      ],
      [
        'getAuthPermissionSets',
        { id: 'permission_set_id', ownerOrganization: OWNER_ORG_ID }
      ]
    ])(
      '%s - restrict ownerOrganization to non superadmin or non internal token',
      async (funcName, args) => {
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID_OF_OWNER_ORG);
        await expect(async () =>
          rbacBll[funcName](regularUserContext, args)
        ).rejects.toThrow(
          'Access to field ownerOrganization requires superadmin rights'
        );
      }
    );
    it('createAuthPermissionSet', async () => {
      const r = {
        id: 'permission_set_id',
        organizationGuid: ORG_GUID
      };
      applicationDal.getAppIdFromOrgId.mockResolvedValueOnce(ORG_GUID);
      authPermissionDal.createAuthPermissionSet.mockResolvedValueOnce(r);
      const res = await rbacBll.createAuthPermissionSet(ctx, { input: {} });
      expect(
        serviceContext.dal.authPermissionDal
          .markCacheDirtyForGetAuthPermissionSets
      ).toHaveBeenCalledWith(ORG_GUID);
      expect(res).toEqual(r);
    });
    it('createAuthPermissionSet - should throw restriction error with internalToken', async () => {
      await expect(async () =>
        rbacBll.createAuthPermissionSet(internalTokenContext, {
          input: {}
        })
      ).rejects.toThrow('Unable to get organizationGuid');
    });
    it.each(['internal token', 'superadmin'])(
      'createAuthPermissionSet - ownerOrganization - %s',
      async (tokenType) => {
        const ctxByTokenType =
          tokenType === 'internal token' ? internalTokenContext : ctx;
        const r = {
          id: 'permission_set_id',
          organizationGuid: ORG_GUID_OF_OWNER_ORG
        };
        applicationDal.getAppIdFromOrgId.mockResolvedValueOnce(
          ORG_GUID_OF_OWNER_ORG
        );
        authPermissionDal.createAuthPermissionSet.mockResolvedValueOnce(r);
        const res = await rbacBll.createAuthPermissionSet(ctxByTokenType, {
          input: { organizationID: OWNER_ORG_ID }
        }); // NOTENOTE
        expect(
          serviceContext.dal.authPermissionDal
            .markCacheDirtyForGetAuthPermissionSets
        ).toHaveBeenCalledWith(ORG_GUID_OF_OWNER_ORG);
        expect(applicationDal.getAppIdFromOrgId).toHaveBeenCalledWith(
          OWNER_ORG_ID
        );
        expect(res).toEqual(r);
      }
    );

    it('should emit AuthPermissionSet create audit event', async () => {
      const r = {
        id: 'permission_set_id',
        organizationGuid: ORG_GUID
      };
      applicationDal.getAppIdFromOrgId.mockResolvedValueOnce(ORG_GUID);
      authPermissionDal.createAuthPermissionSet.mockResolvedValueOnce(r);

      await rbacBll.createAuthPermissionSet(ctx, { input: {} });

      const messages = serviceContext.messageUtil._messages();

      expect(messages).toContainEqual(
        expect.objectContaining({
          event: 'auth_permission_set_create',
          type: 'olp',
          serviceName: 'core-graphql-server',
          authPermissionSetId: 'permission_set_id',
          success: true
        })
      );
    });

    it('updateAuthPermissionSet', async () => {
      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      const r = {
        id: 'permission_set_id',
        organizationGuid: ORG_GUID
      };
      authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);
      authPermissionDal.updateAuthPermissionSet.mockResolvedValueOnce(r);

      authACEDal.getAuthGroupIdsByPermissionSets.mockResolvedValueOnce([
        'ag_id_1',
        'ag_id_2'
      ]);

      mockImplementation_invalidateAnyPermissionSetRelatedCaches(
        serviceContext
      );

      const res = await rbacBll.updateAuthPermissionSet(ctx, {
        input: {
          id: 'permission_set_1',
          name: 'permission_set_name_1',
          description: 'permission_set_description_1',
          permissions: [
            'RECORDING_UPDATE',
            'NO_ACCESS',
            'DEVELOPER_ENGINE_READ'
          ],
          organizationId: 'org_id'
        }
      });
      expect(res).toEqual(r);
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      expect(
        serviceContext.dal.authPermissionDal
          .markCacheDirtyForGetAuthPermissionSets
      ).toHaveBeenCalledWith(ORG_GUID);
      expect_invalidateAnyPermissionSetRelatedCaches(serviceContext);
    });

    it('should emit AuthPermissionSet update audit event', async () => {
      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      const r = {
        id: 'permission_set_id',
        organizationGuid: ORG_GUID
      };
      authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);
      authPermissionDal.updateAuthPermissionSet.mockResolvedValueOnce(r);

      authACEDal.getAuthGroupIdsByPermissionSets.mockResolvedValueOnce([]);

      mockImplementation_invalidateAnyPermissionSetRelatedCaches(
        serviceContext
      );

      await rbacBll.updateAuthPermissionSet(ctx, {
        input: {
          id: 'permission_set_1',
          name: 'permission_set_name_1'
        }
      });

      const messages = serviceContext.messageUtil._messages();

      expect(messages).toContainEqual(
        expect.objectContaining({
          event: 'auth_permission_set_update',
          type: 'olp',
          serviceName: 'core-graphql-server',
          authPermissionSetId: 'permission_set_id',
          success: true
        })
      );
    });

    it('updateAuthPermissionSet - handle protection', async () => {
      const r = {
        id: 'permission_set_id',
        organizationGuid: ORG_GUID,
        isProtected: true
      };
      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);

      await expect(async () =>
        rbacBll.updateAuthPermissionSet(ctx, {
          input: {
            id: 'permission_set_1'
          }
        })
      ).rejects.toThrow('You cannot update this permission set');
    });
    it('updateAuthPermissionSet - unprotect', async () => {
      const r = {
        id: 'permission_set_id',
        organizationGuid: ORG_GUID,
        isProtected: true
      };
      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);
      authPermissionDal.updateAuthPermissionSet.mockResolvedValueOnce(r);

      authACEDal.getAuthGroupIdsByPermissionSets.mockResolvedValueOnce([
        'ag_id_1',
        'ag_id_2'
      ]);
      mockImplementation_invalidateAnyPermissionSetRelatedCaches(
        serviceContext
      );

      const res = await rbacBll.updateAuthPermissionSet(ctx, {
        input: {
          id: 'permission_set_1',
          permissions: [
            'RECORDING_UPDATE',
            'NO_ACCESS',
            'DEVELOPER_ENGINE_READ'
          ],
          organizationId: 'org_id',
          isProtected: false
        }
      });
      expect(res).toEqual(r);
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      expect(
        serviceContext.dal.authPermissionDal
          .markCacheDirtyForGetAuthPermissionSets
      ).toHaveBeenCalledWith(ORG_GUID);
      expect_invalidateAnyPermissionSetRelatedCaches(serviceContext, {
        organizationGuid: ORG_GUID
      });
    });
    it.each(['internal token', 'superadmin'])(
      'updateAuthPermissionSet - ownerOrganization - %s',
      async (tokenType) => {
        const ctxByTokenType =
          tokenType === 'internal token' ? internalTokenContext : ctx;
        const r = {
          id: 'permission_set_id',
          organizationGuid: ORG_GUID_OF_OWNER_ORG,
          isProtected: true
        };
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID_OF_OWNER_ORG);
        authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);
        authPermissionDal.updateAuthPermissionSet.mockResolvedValueOnce(r);

        authACEDal.getAuthGroupIdsByPermissionSets.mockResolvedValueOnce([
          'ag_id_1',
          'ag_id_2'
        ]);
        mockImplementation_invalidateAnyPermissionSetRelatedCaches(
          serviceContext
        );

        const res = await rbacBll.updateAuthPermissionSet(ctxByTokenType, {
          input: {
            id: 'permission_set_1',
            permissions: [
              'RECORDING_UPDATE',
              'NO_ACCESS',
              'DEVELOPER_ENGINE_READ'
            ],
            organizationId: 'org_id',
            isProtected: false,
            ownerOrganization: OWNER_ORG_ID
          }
        });
        expect(res).toEqual(r);
        expect(serviceContext.messageUtil._counter()).toEqual(2);
        expect(
          serviceContext.dal.authPermissionDal
            .markCacheDirtyForGetAuthPermissionSets
        ).toHaveBeenCalledWith(ORG_GUID_OF_OWNER_ORG);
        expect_invalidateAnyPermissionSetRelatedCaches(serviceContext);
      }
    );
    it('updateAuthPermissionSet - internalToken', async () => {
      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      const r = {
        id: 'permission_set_id',
        organizationGuid: ORG_GUID
      };
      authPermissionDal.getAuthPermissionSets.mockImplementationOnce((args) => {
        expect(args.organizationGuid).toBeUndefined();
        return Promise.resolve([r]);
      });
      authPermissionDal.updateAuthPermissionSet.mockResolvedValueOnce(r);

      authACEDal.getAuthGroupIdsByPermissionSets.mockResolvedValueOnce([
        'ag_id_1',
        'ag_id_2'
      ]);

      mockImplementation_invalidateAnyPermissionSetRelatedCaches(
        serviceContext
      );

      const res = await rbacBll.updateAuthPermissionSet(internalTokenContext, {
        input: {
          id: 'permission_set_1',
          name: 'permission_set_name_1',
          description: 'permission_set_description_1',
          permissions: [
            'RECORDING_UPDATE',
            'NO_ACCESS',
            'DEVELOPER_ENGINE_READ'
          ],
          organizationId: 'org_id'
        }
      });
      expect(res).toEqual(r);
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      expect(
        serviceContext.dal.authPermissionDal
          .markCacheDirtyForGetAuthPermissionSets
      ).toHaveBeenCalledWith(ORG_GUID);
      expect_invalidateAnyPermissionSetRelatedCaches(serviceContext);
    });

    it('deleteAuthPermissionSet: hard delete', async () => {
      const r = {
        id: 'permission_set_id',
        organizationGuid: ORG_GUID
      };

      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);
      authPermissionDal.deleteAuthPermissionSet.mockResolvedValueOnce(r);
      authPermissionDal.updateAuthPermissionSet.mockResolvedValueOnce(r);
      authACEDal.getAuthGroupIdsByPermissionSets.mockResolvedValueOnce([
        'ag_id_1',
        'ag_id_2'
      ]);
      mockImplementation_invalidateAnyPermissionSetRelatedCaches(
        serviceContext
      );

      const res = await rbacBll.deleteAuthPermissionSet(ctx, {
        id: 'permission_set_1'
      });
      expect(res).toEqual({ id: 'permission_set_id' });
      expect(authPermissionDal.updateAuthPermissionSet).not.toHaveBeenCalled();
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      expect(
        serviceContext.dal.authPermissionDal
          .markCacheDirtyForGetAuthPermissionSets
      ).toHaveBeenCalledWith(ORG_GUID);
      expect_invalidateAnyPermissionSetRelatedCaches(serviceContext, {
        organizationGuid: ORG_GUID
      });
    });

    it('deleteAuthPermissionSet: soft delete', async () => {
      const r = {
        id: 'permission_set_id',
        organizationGuid: ORG_GUID
      };

      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      authPermissionDal.getAuthPermissionSets.mockResolvedValue([r]);
      authPermissionDal.deleteAuthPermissionSet.mockResolvedValueOnce({});
      authPermissionDal.updateAuthPermissionSet.mockResolvedValueOnce(r);
      authACEDal.getAuthGroupIdsByPermissionSets.mockResolvedValueOnce([
        'ag_id_1',
        'ag_id_2'
      ]);
      mockImplementation_invalidateAnyPermissionSetRelatedCaches(
        serviceContext
      );

      const res = await rbacBll.deleteAuthPermissionSet(ctx, {
        id: 'permission_set_1',
        organizationId: 'org_id'
      });
      expect(res).toEqual({ id: 'permission_set_id' });
      expect(authPermissionDal.updateAuthPermissionSet).toHaveBeenCalled();
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      expect(
        serviceContext.dal.authPermissionDal
          .markCacheDirtyForGetAuthPermissionSets
      ).toHaveBeenCalledWith(ORG_GUID);
      expect_invalidateAnyPermissionSetRelatedCaches(serviceContext);
    });
    it('deleteAuthPermissionSet - handle protection', async () => {
      const r = {
        id: 'permission_set_id',
        organizationGuid: ORG_GUID,
        isProtected: true
      };
      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);

      await expect(async () =>
        rbacBll.deleteAuthPermissionSet(ctx, {
          id: 'permission_set_1',
          organizationId: 'org_id'
        })
      ).rejects.toThrow('You cannot delete this permission set');
    });
    it.each(['internal token', 'superadmin'])(
      'deleteAuthPermissionSet - ownerOrganization - %s',
      async (tokenType) => {
        const ctxByTokenType =
          tokenType === 'internal token' ? internalTokenContext : ctx;
        const r = {
          id: 'permission_set_id',
          organizationGuid: ORG_GUID_OF_OWNER_ORG
        };

        applicationDal.getAppIdFromOrgId.mockResolvedValueOnce(
          ORG_GUID_OF_OWNER_ORG
        );
        authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);
        authPermissionDal.deleteAuthPermissionSet.mockResolvedValueOnce(r);
        authPermissionDal.updateAuthPermissionSet.mockResolvedValueOnce(r);
        authACEDal.getAuthGroupIdsByPermissionSets.mockResolvedValueOnce([
          'ag_id_1',
          'ag_id_2'
        ]);
        mockImplementation_invalidateAnyPermissionSetRelatedCaches(
          serviceContext,
          { orgId: OWNER_ORG_ID }
        );

        const res = await rbacBll.deleteAuthPermissionSet(ctxByTokenType, {
          id: 'permission_set_1',
          ownerOrganization: OWNER_ORG_ID
        });
        expect(res).toEqual({ id: 'permission_set_id' });
        expect(
          authPermissionDal.updateAuthPermissionSet
        ).not.toHaveBeenCalled();
        expect(serviceContext.messageUtil._counter()).toEqual(2);
        expect(
          serviceContext.dal.authPermissionDal
            .markCacheDirtyForGetAuthPermissionSets
        ).toHaveBeenCalledWith(ORG_GUID_OF_OWNER_ORG);
        expect_invalidateAnyPermissionSetRelatedCaches(serviceContext, {
          organizationId: OWNER_ORG_ID
        });
      }
    );
    it('deleteAuthPermissionSet - internalToken', async () => {
      const r = {
        id: 'permission_set_id',
        organizationGuid: ORG_GUID
      };

      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      authPermissionDal.getAuthPermissionSets.mockImplementationOnce((args) => {
        expect(args.organizationGuid).toBeUndefined();
        return Promise.resolve([r]);
      });
      authPermissionDal.deleteAuthPermissionSet.mockResolvedValueOnce(r);
      authPermissionDal.updateAuthPermissionSet.mockResolvedValueOnce(r);
      authACEDal.getAuthGroupIdsByPermissionSets.mockResolvedValueOnce([
        'ag_id_1',
        'ag_id_2'
      ]);
      mockImplementation_invalidateAnyPermissionSetRelatedCaches(
        serviceContext
      );

      const res = await rbacBll.deleteAuthPermissionSet(internalTokenContext, {
        id: 'permission_set_1'
      });
      expect(res).toEqual({ id: 'permission_set_id' });
      expect(authPermissionDal.updateAuthPermissionSet).not.toHaveBeenCalled();
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      expect(
        serviceContext.dal.authPermissionDal
          .markCacheDirtyForGetAuthPermissionSets
      ).toHaveBeenCalledWith(ORG_GUID);
      expect_invalidateAnyPermissionSetRelatedCaches(serviceContext, {
        organizationGuid: ORG_GUID
      });
    });

    it('getAuthPermissionSet - Success', async () => {
      const r = {
        id: 'permission_set_2'
      };
      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);
      const res = await rbacBll.getAuthPermissionSet(regularUserContext, {
        id: r.id
      });
      expect(res).toEqual(r);
    });

    it('getAuthPermissionSet - Missing Permission Set ID', async () => {
      await expect(async () =>
        rbacBll.getAuthPermissionSet({}, {})
      ).rejects.toThrow('Missing Permission Set ID');
    });
    it('getAuthPermissionSet - Not found', async () => {
      const r = {
        id: 'permission_set_3'
      };
      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([]);
      await expect(async () =>
        rbacBll.getAuthPermissionSet(regularUserContext, { id: r.id })
      ).rejects.toThrow('Authorization permission set not found');
    });
    it.each(['internal token', 'superadmin'])(
      'getAuthPermissionSet - ownerOrganization - %s',
      async (tokenType) => {
        const ctxByTokenType =
          tokenType === 'internal token' ? internalTokenContext : ctx;
        const r = {
          id: 'permission_set_id',
          organizationGuid: ORG_GUID_OF_OWNER_ORG
        };

        applicationDal.getAppIdFromOrgId.mockResolvedValueOnce(
          ORG_GUID_OF_OWNER_ORG
        );
        authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);
        const res = await rbacBll.getAuthPermissionSet(ctxByTokenType, {
          id: r.id,
          ownerOrganization: OWNER_ORG_ID
        });
        expect(res).toEqual(r);
      }
    );
    it('getAuthPermissionSet - internalToken', async () => {
      const r = {
        id: 'permission_set_2'
      };
      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      authPermissionDal.getAuthPermissionSets.mockImplementationOnce((args) => {
        expect(args.organizationGuid).toBeUndefined();
        return Promise.resolve([r]);
      });
      const res = await rbacBll.getAuthPermissionSet(internalTokenContext, {
        id: r.id
      });
      expect(res).toEqual(r);
    });

    it('getAuthPermissionSets - Success', async () => {
      const organizationGuid = 'e25fb01c-a842-4f97-bb0a-d35f86a3df79';
      const r = {
        id: 'permission_set_4',
        organizationGuid: organizationGuid
      };
      const context = {
        _authInfo: {
          organization: {
            organizationId: '303605d7-28b4-4d27-a000-285a3a48f33e'
          }
        }
      };
      applicationDal.getAppIdFromOrgId.mockResolvedValueOnce(organizationGuid);
      authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);
      const res = await rbacBll.getAuthPermissionSets(context, { ids: [r.id] });
      expect(res.records[0]).toEqual(r);
    });
    it('getAuthPermissionSets - Unable to get organizationGuid', async () => {
      const organizationGuid = 'e25fb01c-a842-4f97-bb0a-d35f86a3df79';
      const r = {
        id: 'permission_set_5',
        organizationGuid: organizationGuid
      };
      const context = {
        _authInfo: {
          organization: {
            organizationId: '303605d7-28b4-4d27-a000-285a3a48f33e'
          }
        }
      };
      applicationDal.getAppIdFromOrgId.mockResolvedValueOnce(null);
      await expect(async () =>
        rbacBll.getAuthPermissionSets(context, { ids: [r.id] })
      ).rejects.toThrow('Unable to get organizationGuid');
    });
    it('getAuthPermissionSets - Internal token - with passing args.organizationGuid', async () => {
      const organizationGuid = 'e25fb01c-a842-4f97-bb0a-d35f86a3df79';
      const r = {
        id: 'permission_set_4',
        organizationGuid: organizationGuid
      };
      applicationDal.getAppIdFromOrgId.mockResolvedValueOnce(organizationGuid);
      authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);
      const res = await rbacBll.getAuthPermissionSets(internalTokenContext, {
        ids: [r.id],
        organizationGuid: organizationGuid
      });
      expect(res.records[0]).toEqual(r);
    });
    it('getAuthPermissionSets - Internal token - with passing args.allowInternalToken', async () => {
      const organizationGuid = 'e25fb01c-a842-4f97-bb0a-d35f86a3df79';
      const r = {
        id: 'permission_set_4',
        organizationGuid: organizationGuid
      };
      applicationDal.getAppIdFromOrgId.mockResolvedValueOnce(organizationGuid);
      authPermissionDal.getAuthPermissionSets.mockImplementationOnce((args) => {
        expect(args.organizationGuid).toBeUndefined();
        return Promise.resolve([r]);
      });
      const res = await rbacBll.getAuthPermissionSets(internalTokenContext, {
        ids: [r.id],
        allowInternalToken: true
      });
      expect(res.records[0]).toEqual(r);
    });
    it('getAuthPermissionSets - should throw restriction error with internalToken', async () => {
      const r = {
        id: 'permission_set_4'
      };
      await expect(async () =>
        rbacBll.getAuthPermissionSets(internalTokenContext, {
          id: r.id
        })
      ).rejects.toThrow('Unable to get organizationGuid');
    });
    it.each(['internal token', 'superadmin'])(
      'getAuthPermissionSet - ownerOrganization - %s',
      async (tokenType) => {
        const ctxByTokenType =
          tokenType === 'internal token' ? internalTokenContext : ctx;
        const r = {
          id: 'permission_set_id',
          organizationGuid: ORG_GUID_OF_OWNER_ORG
        };

        applicationDal.getAppIdFromOrgId.mockResolvedValueOnce(
          ORG_GUID_OF_OWNER_ORG
        );
        authPermissionDal.getAuthPermissionSets.mockResolvedValueOnce([r]);
        const res = await rbacBll.getAuthPermissionSets(ctxByTokenType, {
          ids: [r.id],
          ownerOrganization: OWNER_ORG_ID
        });
        expect(res.records[0]).toEqual(r);
      }
    );
  });

  describe('Authorization Access Control List', () => {
    it.each([
      [
        'removeACEsFromResources',
        {
          resourceType: 'TDO',
          ids: ['---aceId---'],
          ownerOrganization: OWNER_ORG_ID
        }
      ],
      [
        'addACEsToResources',
        {
          ids: ['tdo_id'],
          resourceType: 'TDO',
          entries: [
            {
              member: {
                id: 'ag_id',
                memberType: 'Group'
              },
              permissionSetID: 'ps_id'
            }
          ],
          ownerOrganization: OWNER_ORG_ID
        }
      ]
    ])(
      '%s - restrict ownerOrganization to non superadmin or non internal token',
      async (funcName, args) => {
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID_OF_OWNER_ORG);
        await expect(async () =>
          rbacBll[funcName](regularUserContext, args)
        ).rejects.toThrow(
          'Access to field ownerOrganization requires superadmin rights'
        );
      }
    );

    describe('#filterAuthGroupIdsByRights', () => {
      it('should throw error if rights is empty', async () => {
        await expect(async () =>
          rbacBll.filterAuthGroupIdsByRights(ctx, {})
        ).rejects.toThrow('Rights cannot be null or empty');
      });

      it('should throw error if invalid orgId for superadmin', async () => {
        const options = {
          rights: [
            'cms.sources.read',
            'recording:read',
            'developer.engine.read',
            'cms.sources.update'
          ]
        };

        await expect(async () =>
          rbacBll.filterAuthGroupIdsByRights(ctx, options)
        ).rejects.toThrow('orgId is required for superadmin.');
      });

      it('success', async () => {
        const options = {
          orgId: ORG_ID,
          userId: 'user_id_1',
          rights: [
            'cms.sources.read',
            'recording:read',
            'developer.engine.read',
            'cms.sources.update'
          ]
        };

        serviceContext.dal.application.getAppIdFromOrgId.mockResolvedValueOnce(
          ORG_GUID
        );

        serviceContext.dal.authGroup.getAuthGroupsContainingMember.mockResolvedValueOnce(
          {
            records: [{ id: 'auth_group_1' }, { id: 'auth_group_2' }]
          }
        );

        serviceContext.dal.authAce.getAuthACLByResourceIdsAndPerms.mockImplementationOnce(
          (options) => {
            expect(options.authGroupIds).toEqual(
              expect.arrayContaining(['auth_group_1', 'auth_group_2'])
            );
            return [
              {
                authGroupId: 'auth_group_1',
                permissions: ['cms.sources.read', 'recording.read'],
                roleId: ''
              },
              {
                authGroupId: 'auth_group_1',
                permissions: ['developer.engine.read'],
                roleId: ''
              },
              {
                authGroupId: 'auth_group_2',
                permissions: ['cms.sources.update'],
                roleId: ''
              }
            ];
          }
        );

        const authGroupIds = await rbacBll.filterAuthGroupIdsByRights(
          ctx,
          options
        );

        expect(authGroupIds).toEqual(
          expect.arrayContaining(['auth_group_1', 'auth_group_2'])
        );
        expect(
          serviceContext.dal.authGroup.getAuthGroupsContainingMember
        ).toHaveBeenCalled();
      });
    });

    describe('#removeACEsFromResources', () => {
      it('should delete specific ACEs', async () => {
        // restrictContextOrganization
        serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
          ORG_GUID
        );
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        // getOrganization
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: 1000,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        });

        // try
        serviceContext.dal.authAce.deleteACLForResources.mockImplementation(
          (deleteArgs) => {
            expect(deleteArgs.ids).toEqual(['---aceId---']);
            return Promise.resolve([
              {
                objectID: '---aceId---'
              }
            ]);
          }
        );

        let error;

        const args = {
          resourceType: 'TDO',
          ids: ['---aceId---']
        };

        try {
          await rbacBll.removeACEsFromResources(ctx, args);
        } catch (e) {
          error = e;
        }

        expect(error).toBeUndefined();
        expect(
          serviceContext.dal.authAce.getACLForResources
        ).toHaveBeenCalledTimes(1);
        expect(
          serviceContext.dal.authAce.deleteACLForResources
        ).toHaveBeenCalled();
        expect(serviceContext.redisCache.markCacheDirty).not.toHaveBeenCalled();
      });
      it('should delete specific resourceIds', async () => {
        // restrictContextOrganization
        serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
          ORG_GUID
        );
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        // getOrganization
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: 1000,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        });

        // try
        authACEDal.getACLForResources.mockReturnValueOnce({
          records: [
            {
              aceId: '---aceId---'
            }
          ]
        });
        authACEDal.getACLForResources.mockReturnValueOnce({
          records: [
            {
              aceId: '---aceId---'
            }
          ]
        });
        serviceContext.dal.authAce.deleteACLForResources.mockImplementation(
          (deleteArgs) => {
            expect(deleteArgs.ids).toEqual(['---aceId---']);
            return Promise.resolve([
              {
                objectID: '---aceId---'
              }
            ]);
          }
        );

        let error;

        const args = {
          resourceType: 'TDO',
          resourceIds: ['---resourceId---']
        };

        try {
          await rbacBll.removeACEsFromResources(ctx, args);
        } catch (e) {
          error = e;
        }

        expect(error).toBeUndefined();
        expect(authACEDal.getACLForResources).toHaveBeenCalledTimes(2);
        expect(authACEDal.getACLForResources).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            orgId: ORG_ID,
            resourceType: args.resourceType,
            ids: ['---resourceId---'],
            skipCache: true
          })
        );
        expect(authACEDal.getACLForResources).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            orgId: ORG_ID,
            resourceType: args.resourceType,
            ids: ['---aceId---'],
            skipCache: true
          })
        );
        expect(
          serviceContext.dal.authAce.deleteACLForResources
        ).toHaveBeenCalled();
        expect(serviceContext.redisCache.markCacheDirty).not.toHaveBeenCalled();
      });

      it.each([
        ['TDO', 'tdo_id'],
        ['Folder', 'folder_id'],
        ['SDO', 'sdo_id']
      ])(
        'should delete all ACEs for %s resource',
        async (resourceType, resourceId) => {
          // restrictContextOrganization
          serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
            ORG_GUID
          );
          serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
            ORG_ID
          );
          // getOrganization
          serviceContext.dal.organization.getOrganization.mockReturnValue({
            organizationId: 1000,
            kvp: {
              features: {
                enableRBACFeature: 'enabled',
                enableRBACFeatureForSDO: 'enabled'
              }
            }
          });

          // getACLForResources
          serviceContext.dal.authAce.getACLForResources.mockImplementation(
            (args) => {
              expect(args.orgId).toEqual(ORG_ID);
              expect(args.resourceType).toEqual(resourceType);

              return Promise.resolve({
                records: [
                  {
                    aceId: '---aceId---'
                  }
                ]
              });
            }
          );

          // try
          serviceContext.dal.authAce.deleteACLForResources.mockImplementation(
            (deleteArgs) => {
              expect(deleteArgs.ids).toEqual(['---aceId---']);
              return Promise.resolve([
                {
                  objectID: '---aceId---'
                }
              ]);
            }
          );

          mockImplementation_invalidateAnyPermissionSetRelatedCaches(
            serviceContext
          );

          dalFolder.getObjectIdsFromOpaqueIds.mockImplementationOnce(
            (ctx, ids) => {
              return ids.reduce((m, x) => {
                const folderId = `folder_id_for_${x}`;
                m.set(folderId, folderId);
                m.set(x, folderId);

                return m;
              }, new Map());
            }
          );

          let error;

          const args = {
            resourceType: resourceType,
            resourceIds: [resourceId]
          };

          if (resourceType === 'SDO') {
            args.resourceTypeSchemaId = uuid.v4();
          }

          // serviceContext.dal.structuredData.getSchema
          serviceContext.dbConnections['third_party'].read._push(
            [
              {
                id: args.resourceTypeSchemaId,
              }
            ],
            false,
            ['data_registries'] // table name
          );

          try {
            await rbacBll.removeACEsFromResources(ctx, args);
          } catch (e) {
            error = e;
          }

          expect(error).toBeUndefined();
          expect(
            serviceContext.dal.authAce.getACLForResources
          ).toHaveBeenCalledTimes(2);
          expect(
            serviceContext.dal.authAce.deleteACLForResources
          ).toHaveBeenCalled();
          expect_invalidateAnyPermissionSetRelatedCaches(serviceContext, {
            ignoreOrgPermissionMarkDirty: true,
            ignoreACLForResourcesMarkDirty: true,
            resourceIds: ['---aceId---']
          });
          expect(
            serviceContext.redisCache.markCacheDirty
          ).not.toHaveBeenCalled();

          if (resourceType === 'Folder') {
            expect(serviceContext.redisClient._counter()).toEqual(1);
          }
        }
      );
      it.each(['internal token', 'superadmin'])(
        'ownerOrganization - %s',
        async (tokenType) => {
          const ctxByTokenType =
            tokenType === 'internal token' ? internalTokenContext : ctx;

          // restrictContextOrganization
          serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
            ORG_GUID_OF_OWNER_ORG
          );
          serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
            OWNER_ORG_ID
          );

          // getOrganization
          serviceContext.dal.organization.getOrganization.mockReturnValue({
            organizationId: 1000,
            kvp: {
              features: {
                enableRBACFeature: 'enabled'
              }
            }
          });

          // try
          serviceContext.dal.authAce.deleteACLForResources.mockImplementation(
            (deleteArgs) => {
              expect(deleteArgs.ids).toEqual(['---aceId---']);
              return Promise.resolve([
                {
                  objectID: '---aceId---'
                }
              ]);
            }
          );

          let error;

          const args = {
            resourceType: 'TDO',
            ids: ['---aceId---'],
            ownerOrganization: OWNER_ORG_ID
          };

          try {
            await rbacBll.removeACEsFromResources(ctxByTokenType, args);
          } catch (e) {
            error = e;
          }

          expect(error).toBeUndefined();
          expect(
            serviceContext.dal.authAce.getACLForResources
          ).toHaveBeenCalledTimes(1);
          expect(
            serviceContext.dal.authAce.deleteACLForResources
          ).toHaveBeenCalled();
          expect(
            serviceContext.redisCache.markCacheDirty
          ).not.toHaveBeenCalled();
        }
      );
      it('should return error with internalToken', async () => {
        const args = {
          resourceType: 'TDO',
          ids: ['---aceId---']
        };
        const serviceContext_1 = createServiceContext();
        const rbacBll_1 = require('./rbacAuth.bll.js')(serviceContext_1);

        await expect(async () =>
          rbacBll_1.removeACEsFromResources(internalTokenContext, args)
        ).rejects.toThrow(
          'Missing or empty id field. A non-empty value is required.'
        );
      });
      it('should throw an error if resourceTypeSchemaId is missing for SDO type', async () => {
        const args = {
          resourceType: 'SDO',
          ids: ['SDO::sdo_id_1::ag_id::ps_id']
        };

        serviceContext.dal.authPermissionDal.getAuthPermissionSets.mockResolvedValue(
          [
            { id: 'ps_id', permissionMasks: [1] }
          ]
        );

        authACEDal.removeACEsFromResources.mockResolvedValue([]);
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(OWNER_ORG_ID);
        authACEDal.getACLForResources.mockResolvedValue([]);

        try {
          await rbacBll.removeACEsFromResources(ctx, args)
        } catch (error) {
          expect(error.message).toBe('resourceTypeSchemaId is required for the SDO resource type.');
        }
      });

      it.each(['SDO', 'SDOSchema'])(
        'should throw an error if RBAC feature for this resource type is not enabled - %s',
        async (resourceType) => {
          const args = {
            resourceType,
            ids: [`${resourceType}:resource_id::ag_id::ps_id`]
          };

          if (resourceType === 'SDO') {
            args.dataRegistryId = uuid.v4();
          }

          // getOrganization
          serviceContext.dal.organization.getOrganization.mockReturnValue({
            organizationId: 1000,
            kvp: {
              features: {
                enableRBACFeature: 'enabled',
                enableRBACFeatureForSDO: 'disabled'
              }
            }
          });

          serviceContext.dal.authPermissionDal.getAuthPermissionSets.mockResolvedValue(
            [
              { id: 'ps_id', permissionMasks: [1] }
            ]
          );

          authACEDal.removeACEsFromResources.mockResolvedValue([]);
          serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(OWNER_ORG_ID);
          authACEDal.getACLForResources.mockResolvedValue([]);

          try {
            await rbacBll.removeACEsFromResources(ctx, args)
          } catch (error) {
            expect(error.message).toBe(`RBAC is not enabled for resource type: ${resourceType}`);
          }
        }
      );
      it('should emit sdo_acl_changed event when removing ACEs from SDO resources', async () => {
        const resourceTypeSchemaId = uuid.v4();
        const sdoIds = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];
        const args = {
          resourceType: 'SDO',
          resourceTypeSchemaId,
          resourceIds: sdoIds
        };

        serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(ORG_ID);
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: { features: { enableRBACFeature: 'enabled', enableRBACFeatureForSDO: 'enabled' } }
        });
        serviceContext.dbConnections['third_party'].write._push(
          [{ id: resourceTypeSchemaId }],
          false,
          ['data_registries']
        );
        // aceId encodes objectType::objectID::authGroupId::permissionSetId
        // (see authACE.dal.js getAceId) — the revoke audit is derived from it.
        authACEDal.getACLForResources.mockResolvedValue({
          records: [
            {
              aceId:
                'SDO::11111111-1111-1111-1111-111111111111::ag-100::ps-200'
            },
            {
              aceId:
                'SDO::22222222-2222-2222-2222-222222222222::ag-300::ps-400'
            }
          ]
        });
        // The DAL flags each requested ace with `removed` from the DELETE
        // RETURNING set (see authACE.dal.js) and carries the identity fields the
        // audit filter keys on.
        serviceContext.dal.authAce.deleteACLForResources.mockResolvedValue([
          {
            objectID: '11111111-1111-1111-1111-111111111111',
            authGroupId: 'ag-100',
            permissionSetId: 'ps-200',
            removed: true
          },
          {
            objectID: '22222222-2222-2222-2222-222222222222',
            authGroupId: 'ag-300',
            permissionSetId: 'ps-400',
            removed: true
          }
        ]);

        await rbacBll.removeACEsFromResources(ctx, args);
        const messages = serviceContext.messageUtil._messages();
        // 2 sdo_acl_changed + 2 ACERevoke audit events (one per removed ACE)
        expect(serviceContext.messageUtil._counter()).toBe(4);

        expect(messages).toContainEqual(
          expect.objectContaining({
            type: 'structuredData',
            event: 'sdo_acl_changed',
            sdoId: '11111111-1111-1111-1111-111111111111',
            dataRegistryId: resourceTypeSchemaId,
            organizationId: ORG_ID
          })
        );
        expect(messages).toContainEqual(
          expect.objectContaining({
            type: 'structuredData',
            event: 'sdo_acl_changed',
            sdoId: '22222222-2222-2222-2222-222222222222',
            dataRegistryId: resourceTypeSchemaId,
            organizationId: ORG_ID
          })
        );

        // One ACERevoke event per removed ACE, with member/permissionSet/
        // resource parsed out of the aceId and the exact action detail string.
        const revokeEvents = messages.filter((m) => m.event === 'ace_revoke');
        expect(revokeEvents).toHaveLength(2);
        expect(revokeEvents).toContainEqual(
          expect.objectContaining({
            event: 'ace_revoke',
            resourceType: 'SDO',
            resourceId: '11111111-1111-1111-1111-111111111111',
            success: true,
            actionInfo: expect.objectContaining({
              actionDetails:
                'Revoked ps-200 from ag-100 (Group) on SDO 11111111-1111-1111-1111-111111111111'
            })
          })
        );
        expect(revokeEvents).toContainEqual(
          expect.objectContaining({
            event: 'ace_revoke',
            resourceId: '22222222-2222-2222-2222-222222222222',
            actionInfo: expect.objectContaining({
              actionDetails:
                'Revoked ps-400 from ag-300 (Group) on SDO 22222222-2222-2222-2222-222222222222'
            })
          })
        );
      });

      // VE-19359 / PR #4428 (Can Tran): a mixed batch where some requested ACEs
      // don't actually delete (already gone, or protected) must audit only the
      // ACEs the DAL flagged as removed — never a successful revoke that never
      // happened.
      it('audits ACERevoke only for ACEs actually removed in a mixed batch', async () => {
        const resourceTypeSchemaId = uuid.v4();
        const args = {
          resourceType: 'SDO',
          resourceTypeSchemaId,
          resourceIds: [
            '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222'
          ]
        };

        serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
          ORG_GUID
        );
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled',
              enableRBACFeatureForSDO: 'enabled'
            }
          }
        });
        serviceContext.dbConnections['third_party'].write._push(
          [{ id: resourceTypeSchemaId }],
          false,
          ['data_registries']
        );
        authACEDal.getACLForResources.mockResolvedValue({
          records: [
            {
              aceId:
                'SDO::11111111-1111-1111-1111-111111111111::ag-100::ps-200'
            },
            {
              aceId:
                'SDO::22222222-2222-2222-2222-222222222222::ag-300::ps-400'
            }
          ]
        });
        // Only the first ACE actually deletes; the second is a no-op that the DAL
        // flags removed: false (matched no row / protected).
        serviceContext.dal.authAce.deleteACLForResources.mockResolvedValue([
          {
            objectID: '11111111-1111-1111-1111-111111111111',
            authGroupId: 'ag-100',
            permissionSetId: 'ps-200',
            removed: true
          },
          {
            objectID: '22222222-2222-2222-2222-222222222222',
            authGroupId: 'ag-300',
            permissionSetId: 'ps-400',
            removed: false
          }
        ]);
        authGroupDal.getPrivateAuthGroupOwners.mockResolvedValue([]);

        await rbacBll.removeACEsFromResources(ctx, args);

        const revokeEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'ace_revoke');
        // Only the removed ACE is audited; the no-op one produces no event.
        expect(revokeEvents).toHaveLength(1);
        expect(revokeEvents[0]).toEqual(
          expect.objectContaining({
            event: 'ace_revoke',
            resourceId: '11111111-1111-1111-1111-111111111111',
            success: true,
            actionInfo: expect.objectContaining({
              actionDetails:
                'Revoked ps-200 from ag-100 (Group) on SDO 11111111-1111-1111-1111-111111111111'
            })
          })
        );
        expect(
          revokeEvents.some(
            (m) => m.resourceId === '22222222-2222-2222-2222-222222222222'
          )
        ).toBe(false);
      });

      // VE-19359 / PR #4428 (Alex): a user-scoped grant is persisted against the
      // user's private auth group, so ACERevoke records that group by default.
      // Private (User-class) groups are resolved back to the original user so the
      // revoke correlates with its ACEGrant; real group grants stay as groups.
      it('rewrites ACERevoke to the original user for private (User-class) auth groups', async () => {
        const resourceTypeSchemaId = uuid.v4();
        const sdoIds = [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222'
        ];
        const args = {
          resourceType: 'SDO',
          resourceTypeSchemaId,
          resourceIds: sdoIds
        };

        serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(ORG_ID);
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled',
              enableRBACFeatureForSDO: 'enabled'
            }
          }
        });
        serviceContext.dbConnections['third_party'].write._push(
          [{ id: resourceTypeSchemaId }],
          false,
          ['data_registries']
        );
        authACEDal.getACLForResources.mockResolvedValue({
          records: [
            {
              aceId:
                'SDO::11111111-1111-1111-1111-111111111111::ag-100::ps-200'
            },
            {
              aceId:
                'SDO::22222222-2222-2222-2222-222222222222::ag-300::ps-400'
            }
          ]
        });
        serviceContext.dal.authAce.deleteACLForResources.mockResolvedValue([
          {
            objectID: '11111111-1111-1111-1111-111111111111',
            authGroupId: 'ag-100',
            permissionSetId: 'ps-200',
            removed: true
          },
          {
            objectID: '22222222-2222-2222-2222-222222222222',
            authGroupId: 'ag-300',
            permissionSetId: 'ps-400',
            removed: true
          }
        ]);
        // ag-100 is a user's private group → rewrite to user-1 (User); ag-300 is
        // a real group → not returned, so it stays recorded as a group.
        authGroupDal.getPrivateAuthGroupOwners.mockResolvedValueOnce([
          { id: 'ag-100', userId: 'user-1' }
        ]);

        await rbacBll.removeACEsFromResources(ctx, args);

        const revokeEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'ace_revoke');
        expect(revokeEvents).toHaveLength(2);
        expect(revokeEvents).toContainEqual(
          expect.objectContaining({
            event: 'ace_revoke',
            resourceId: '11111111-1111-1111-1111-111111111111',
            member: { memberId: 'user-1', memberType: 'User' },
            actionInfo: expect.objectContaining({
              actionDetails:
                'Revoked ps-200 from user-1 (User) on SDO 11111111-1111-1111-1111-111111111111'
            })
          })
        );
        expect(revokeEvents).toContainEqual(
          expect.objectContaining({
            event: 'ace_revoke',
            resourceId: '22222222-2222-2222-2222-222222222222',
            member: { memberId: 'ag-300', memberType: 'Group' },
            actionInfo: expect.objectContaining({
              actionDetails:
                'Revoked ps-400 from ag-300 (Group) on SDO 22222222-2222-2222-2222-222222222222'
            })
          })
        );
        expect(authGroupDal.getPrivateAuthGroupOwners).toHaveBeenCalledWith(
          expect.arrayContaining(['ag-100', 'ag-300'])
        );
      });

      // Early-failure auditing (VE-19359): failures thrown before the
      // enableRBACFeature block are still audited, mirroring addACEsToResources.
      it('emits an ACERevoke failure when input validation throws before the RBAC-flag block', async () => {
        // SDO revoke with a well-formed ACE id but no schema id throws
        // InvalidInput before the enableRBACFeature block is reached.
        const args = {
          resourceType: 'SDO',
          ids: ['SDO::sdo-1::ag-1::ps-1']
        };

        await expect(
          rbacBll.removeACEsFromResources(ctx, args)
        ).rejects.toThrow(
          'resourceTypeSchemaId is required for the SDO resource type.'
        );

        const revokeEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'ace_revoke');
        expect(revokeEvents).toHaveLength(1);
        expect(revokeEvents[0]).toEqual(
          expect.objectContaining({
            event: 'ace_revoke',
            resourceType: 'SDO',
            resourceId: 'sdo-1',
            success: false,
            actionInfo: expect.objectContaining({
              actionDetails:
                'Failed to revoke ps-1 from ag-1 (Group) on SDO sdo-1'
            })
          })
        );
      });

      it('emits an ACERevoke failure when the resource type is not RBAC-enabled', async () => {
        const args = {
          resourceType: 'SDO',
          dataRegistryId: uuid.v4(),
          ids: ['SDO::sdo-9::ag-9::ps-9']
        };
        // useRBACFeatureForResourceType(SDO) resolves the org feature flags via
        // isEnableFeatureInOrganization -> getOrganization.
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: 1000,
          kvp: {
            features: {
              enableRBACFeature: 'enabled',
              enableRBACFeatureForSDO: 'disabled'
            }
          }
        });
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          OWNER_ORG_ID
        );

        await expect(
          rbacBll.removeACEsFromResources(ctx, args)
        ).rejects.toThrow('RBAC is not enabled for resource type: SDO');

        const revokeEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'ace_revoke');
        expect(revokeEvents).toHaveLength(1);
        expect(revokeEvents[0]).toEqual(
          expect.objectContaining({
            success: false,
            actionInfo: expect.objectContaining({
              actionDetails:
                'Failed to revoke ps-9 from ag-9 (Group) on SDO sdo-9'
            })
          })
        );
      });

      it('skips malformed ACE ids so no broken audit string is emitted', async () => {
        // `ids` is the ID scalar and accepts arbitrary strings; only the
        // well-formed id should yield an audit entry.
        const args = {
          resourceType: 'SDO',
          ids: ['garbage', 'a::b', 'SDO::sdo-1::ag-1::ps-1']
        };

        await expect(
          rbacBll.removeACEsFromResources(ctx, args)
        ).rejects.toThrow(
          'resourceTypeSchemaId is required for the SDO resource type.'
        );

        const revokeEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'ace_revoke');
        expect(revokeEvents).toHaveLength(1);
        expect(revokeEvents[0].actionInfo.actionDetails).toBe(
          'Failed to revoke ps-1 from ag-1 (Group) on SDO sdo-1'
        );
        expect(
          revokeEvents.some((m) =>
            String(m.actionInfo.actionDetails).includes('undefined')
          )
        ).toBe(false);
      });

      it('does not emit ACERevoke for a resourceIds-only early failure', async () => {
        // resourceIds-only callers (internal cascade cleanups) have no ACE ids to
        // parse until they are resolved inside the RBAC-flag block, so a failure
        // before that block cannot be attributed to specific ACEs.
        const args = {
          resourceType: 'SDO',
          resourceIds: ['sdo-1']
        };

        await expect(
          rbacBll.removeACEsFromResources(ctx, args)
        ).rejects.toThrow(
          'resourceTypeSchemaId is required for the SDO resource type.'
        );

        const revokeEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'ace_revoke');
        expect(revokeEvents).toHaveLength(0);
      });

      it('emits an ACERevoke failure when the delete DAL throws', async () => {
        serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
          ORG_GUID
        );
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: 1000,
          kvp: { features: { enableRBACFeature: 'enabled' } }
        });
        const invalidInput = new Error('bad ace');
        invalidInput.name = 'invalid_input';
        serviceContext.dal.authAce.deleteACLForResources.mockRejectedValue(
          invalidInput
        );

        const args = {
          resourceType: 'TDO',
          ids: ['TDO::tdo-1::ag-1::ps-1']
        };

        await expect(
          rbacBll.removeACEsFromResources(ctx, args)
        ).rejects.toThrow('bad ace');

        const revokeEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'ace_revoke');
        expect(revokeEvents).toHaveLength(1);
        expect(revokeEvents[0]).toEqual(
          expect.objectContaining({
            success: false,
            actionInfo: expect.objectContaining({
              actionDetails: 'Failed to revoke ps-1 from ag-1 (Group) on TDO tdo-1'
            })
          })
        );
      });
    });

    describe('#addACEsToResourceFromNestedMutation', () => {
      it('should throw not_implemented error', async () => {
        const args = {};
        const schemaInfo = {};
        await expect(async () =>
          rbacBll.addACEsToResourceFromNestedMutation(ctx, args, schemaInfo)
        ).rejects.toThrow(
          'Only the mutation type supports the nested mutation addACEs().'
        );
      });
      it('should add ACEs from nested mutation - missing ownerOrganization', async () => {
        const args = {
          ids: ['tdo_id'],
          resourceType: 'TDO',
          entries: [
            {
              member: {
                id: 'ag_id',
                memberType: 'Group'
              },
              permissionSetID: 'ps_id'
            }
          ],
          organizationGuid: ORG_GUID
        };
        const schemaInfo = {
          operation: {
            operation: 'mutation'
          }
        };
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );

        // addACEsToResources bll
        authGroupDal.getAuthGroups.mockResolvedValueOnce({
          records: [
            {
              ag_id: 1
            }
          ],
          count: 1
        });
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authPermissionDal.getAuthPermissionSets.mockReturnValue([
          { id: 'ps_id' }
        ]);
        authACEDal.addACEsToResources.mockReturnValue([]);

        await rbacBll.addACEsToResourceFromNestedMutation(
          ctx,
          args,
          schemaInfo
        );
        expect(
          serviceContext.dal.organization.getOrgIdFromAppId
        ).toHaveBeenCalled();
        expect(authACEDal.addACEsToResources).toHaveBeenCalled();
      });
      it('should add ACEs from nested mutation - missing organizationGuid', async () => {
        const args = {
          ids: ['tdo_id'],
          resourceType: 'TDO',
          entries: [
            {
              member: {
                id: 'ag_id',
                memberType: 'Group'
              },
              permissionSetID: 'ps_id'
            }
          ],
          organizationId: ORG_ID
        };
        const schemaInfo = {
          operation: {
            operation: 'mutation'
          }
        };
        applicationDal.getAppIdFromOrgId.mockReturnValueOnce(ORG_GUID);

        // addACEsToResources bll
        authGroupDal.getAuthGroups.mockResolvedValueOnce({
          records: [
            {
              ag_id: 1
            }
          ],
          count: 1
        });
        applicationDal.getAppIdFromOrgId.mockReturnValueOnce(ORG_GUID);
        authPermissionDal.getAuthPermissionSets.mockReturnValue([
          { id: 'ps_id' }
        ]);
        authACEDal.addACEsToResources.mockReturnValue([]);
        // _invalidateAnyPermissionSetRelatedCaches
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );

        await rbacBll.addACEsToResourceFromNestedMutation(
          ctx,
          args,
          schemaInfo
        );
        expect(
          serviceContext.dal.application.getAppIdFromOrgId
        ).toHaveBeenCalled();
        expect(authACEDal.addACEsToResources).toHaveBeenCalled();
      });

      // DefaultACEPolicyUpdate (VE-19359): a nested addACEs on an SDO is the
      // explicit "prescribe the default ACE" action, audited in addition to
      // ACEGrant. Only SDO carries this semantic.
      it('emits DefaultACEPolicyUpdate (alongside ACEGrant) for a nested addACEs on an SDO', async () => {
        const resourceTypeSchemaId = uuid.v4();
        const sdoId = '11111111-1111-1111-1111-111111111111';
        const args = {
          ids: [sdoId],
          resourceType: 'SDO',
          dataRegistryId: resourceTypeSchemaId,
          entries: [
            {
              member: { id: 'ag_id', memberType: 'Group' },
              permissionSetID: 'ps_id'
            }
          ],
          organizationGuid: ORG_GUID
        };
        const schemaInfo = { operation: { operation: 'mutation' } };

        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled',
              enableRBACFeatureForSDO: 'enabled'
            }
          }
        });
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [{ id: 'ag_id', name: 'group-test' }]
        });
        serviceContext.dal.authPermissionDal.getAuthPermissionSets.mockResolvedValue(
          [{ id: 'ps_id', permissionMasks: [1] }]
        );
        // serviceContext.dal.structuredData.getSchema
        serviceContext.dbConnections['third_party'].write._push(
          [{ id: resourceTypeSchemaId }],
          false,
          ['data_registries']
        );
        authACEDal.addACEsToResources.mockResolvedValue([
          `SDO::${sdoId}::ag_id::ps_id`
        ]);

        // The SDO is owned by the caller's org, so its id + name come straight
        // off the auth context (matching guid) — no extra org lookup needed.
        _.set(ctx, '_authInfo.organization', {
          organizationId: ORG_ID,
          organizationGuid: ORG_GUID,
          organizationName: 'Context Org'
        });

        await rbacBll.addACEsToResourceFromNestedMutation(ctx, args, schemaInfo);

        const messages = serviceContext.messageUtil._messages();
        // ACEGrant records the exact ACL change ...
        const grantEvents = messages.filter((m) => m.event === 'ace_grant');
        expect(grantEvents.length).toBeGreaterThanOrEqual(1);
        // ... and DefaultACEPolicyUpdate records the policy change on the SDO,
        // reading the org name + id from the auth context.
        const policyEvents = messages.filter(
          (m) => m.event === 'default_ace_policy_update'
        );
        expect(policyEvents).toHaveLength(1);
        expect(policyEvents[0]).toEqual(
          expect.objectContaining({
            event: 'default_ace_policy_update',
            resourceType: 'SDO',
            resourceId: sdoId,
            success: true,
            actionInfo: expect.objectContaining({
              actionName: 'update',
              actionDetails: `Updated default ACE policy on SDO ${sdoId} for organization Context Org (${ORG_ID})`
            })
          })
        );
      });

      it('emits a failed DefaultACEPolicyUpdate and re-throws when a nested SDO addACEs fails', async () => {
        const resourceTypeSchemaId = uuid.v4();
        const sdoId = '22222222-2222-2222-2222-222222222222';
        const args = {
          ids: [sdoId],
          resourceType: 'SDO',
          dataRegistryId: resourceTypeSchemaId,
          entries: [
            {
              member: { id: 'ag_id', memberType: 'Group' },
              permissionSetID: 'ps_id'
            }
          ],
          organizationGuid: ORG_GUID
        };
        const schemaInfo = { operation: { operation: 'mutation' } };

        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled',
              enableRBACFeatureForSDO: 'enabled'
            }
          }
        });
        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [{ id: 'ag_id', name: 'group-test' }]
        });
        serviceContext.dal.authPermissionDal.getAuthPermissionSets.mockResolvedValue(
          [{ id: 'ps_id', permissionMasks: [1] }]
        );
        serviceContext.dbConnections['third_party'].write._push(
          [{ id: resourceTypeSchemaId }],
          false,
          ['data_registries']
        );
        authACEDal.addACEsToResources.mockRejectedValue(
          new Error('db write failed')
        );

        await expect(async () =>
          rbacBll.addACEsToResourceFromNestedMutation(ctx, args, schemaInfo)
        ).rejects.toThrow();

        const policyEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'default_ace_policy_update');
        expect(policyEvents).toHaveLength(1);
        expect(policyEvents[0]).toEqual(
          expect.objectContaining({
            event: 'default_ace_policy_update',
            resourceType: 'SDO',
            resourceId: sdoId,
            success: false,
            actionInfo: expect.objectContaining({
              actionDetails: expect.stringContaining(
                `Failed to update default ACE policy on SDO ${sdoId}`
              )
            })
          })
        );
      });

      it('does not emit DefaultACEPolicyUpdate for a nested addACEs on a non-SDO resource', async () => {
        const args = {
          ids: ['tdo_id'],
          resourceType: 'TDO',
          entries: [
            {
              member: { id: 'ag_id', memberType: 'Group' },
              permissionSetID: 'ps_id'
            }
          ],
          organizationGuid: ORG_GUID
        };
        const schemaInfo = { operation: { operation: 'mutation' } };

        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        authGroupDal.getAuthGroups.mockResolvedValueOnce({
          records: [{ ag_id: 1 }],
          count: 1
        });
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
        authPermissionDal.getAuthPermissionSets.mockReturnValue([{ id: 'ps_id' }]);
        authACEDal.addACEsToResources.mockReturnValue([]);

        await rbacBll.addACEsToResourceFromNestedMutation(ctx, args, schemaInfo);

        const policyEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'default_ace_policy_update');
        expect(policyEvents).toHaveLength(0);
      });
    });
    describe('#getACLForResources', () => {
      it.each(['internal token', 'superadmin'])(
        'ownerOrganization - %s',
        async (tokenType) => {
          const ctxByTokenType =
            tokenType === 'internal token' ? internalTokenContext : ctx;

          // restrictContextOrganization
          serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
            ORG_GUID_OF_OWNER_ORG
          );
          serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
            OWNER_ORG_ID
          );

          serviceContext.dal.authAce.getACLForResources.mockImplementation(
            (args) => {
              expect(args.orgId).toEqual(OWNER_ORG_ID);
              expect(args.resourceType).toEqual('TDO');

              return Promise.resolve({
                records: [
                  {
                    aceId: '---aceId---'
                  }
                ]
              });
            }
          );

          let error;

          const args = {
            resourceType: 'TDO',
            ids: ['---aceId---'],
            permissions: ['RECORDING_READ', 'AIWARE_TDO_READ'],
            requireAll: false,
            ownerOrganization: OWNER_ORG_ID
          };

          try {
            await rbacBll.getACLForResources(ctxByTokenType, args);
          } catch (e) {
            error = e;
          }

          expect(error).toBeUndefined();
          expect(
            serviceContext.dal.authAce.getACLForResources
          ).toHaveBeenCalledTimes(1);
          expect(
            serviceContext.dal.organization.getOrgIdFromAppId
          ).toHaveBeenCalled();
          expect(applicationDal.getAppIdFromOrgId).toHaveBeenCalled();
        }
      );
      it('should return ACLs - non-superadmin', async () => {
        // restrictContextOrganization
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        // getACLForResources
        serviceContext.dal.authAce.getACLForResources.mockImplementation(
          (args) => {
            expect(args.orgId).toEqual(ORG_ID);
            expect(args.resourceType).toEqual('TDO');

            return Promise.resolve({
              records: [
                {
                  aceId: '---aceId---'
                }
              ]
            });
          }
        );

        let error;

        const args = {
          resourceType: 'TDO',
          ids: ['---aceId---'],
          permissions: ['RECORDING_READ', 'AIWARE_TDO_READ'],
          requireAll: false
        };

        try {
          await rbacBll.getACLForResources(regularUserContext, args);
        } catch (e) {
          error = e;
        }

        expect(error).toBeUndefined();
        expect(
          serviceContext.dal.authAce.getACLForResources
        ).toHaveBeenCalledTimes(1);
        expect(
          serviceContext.dal.organization.getOrgIdFromAppId
        ).toHaveBeenCalled();
        expect(applicationDal.getAppIdFromOrgId).not.toHaveBeenCalled();
      });
      it('should return ACLs - internal token', async () => {
        // getACLForResources
        serviceContext.dal.authAce.getACLForResources.mockImplementation(
          (args) => {
            expect(args.orgId).toBeUndefined();
            expect(args.resourceType).toEqual('TDO');

            return Promise.resolve({
              records: [
                {
                  aceId: '---aceId---'
                }
              ]
            });
          }
        );

        let error;

        const args = {
          resourceType: 'TDO',
          ids: ['---aceId---'],
          permissions: ['RECORDING_READ', 'AIWARE_TDO_READ'],
          requireAll: false
        };

        try {
          await rbacBll.getACLForResources(internalTokenContext, args);
        } catch (e) {
          error = e;
        }

        expect(error).toBeUndefined();
        expect(
          serviceContext.dal.authAce.getACLForResources
        ).toHaveBeenCalledTimes(1);
        expect(
          serviceContext.dal.organization.getOrgIdFromAppId
        ).not.toHaveBeenCalled();
        expect(applicationDal.getAppIdFromOrgId).not.toHaveBeenCalled();
      });
      it('should skip cache for internal token without orgId', async () => {
        serviceContext.dal.authAce.getACLForResources.mockImplementation(
          (args) => {
            expect(args.skipCache).toBe(true);
            expect(args.orgId).toBeUndefined();
            expect(args.resourceType).toEqual('TDO');

            return Promise.resolve({
              records: [
                {
                  aceId: '---aceId---'
                }
              ]
            });
          }
        );

        let error;

        const args = {
          resourceType: 'TDO',
          ids: ['---aceId---'],
          permissions: ['RECORDING_READ', 'AIWARE_TDO_READ'],
          requireAll: false
        };

        try {
          await rbacBll.getACLForResources(internalTokenContext, args);
        } catch (e) {
          error = e;
        }

        expect(error).toBeUndefined();
        expect(
          serviceContext.dal.authAce.getACLForResources
        ).toHaveBeenCalledTimes(1);
        expect(
          serviceContext.dal.authAce.getACLForResources
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            skipCache: true,
            orgId: undefined,
            resourceType: 'TDO'
          })
        );
        expect(
          serviceContext.dal.organization.getOrgIdFromAppId
        ).not.toHaveBeenCalled();
        expect(applicationDal.getAppIdFromOrgId).not.toHaveBeenCalled();
      });
    });
    describe('#addACEsToResources', () => {
      beforeEach(() => {
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: 1000,
          kvp: {
            features: {
              enableRBACFeature: 'enabled',
              enableRBACFeatureForSDO: 'enabled'
            }
          }
        });
      });

      it('should add ACEs to SDO resource type', async () => {
        const resourceTypeSchemaId = uuid.v4();
        const args = {
          resourceType: 'SDO',
          resourceTypeSchemaId,
          ids: ['11111111-1111-1111-1111-111111111111'],
          entries: [
            {
              member: {
                id: 'ag_id',
                memberType: 'Group'
              },
              permissionSetID: 'ps_id'
            }
          ],
          ownerOrganization: OWNER_ORG_ID
        };

        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [{ id: 'ag_id', name: 'group-test' }]
        });

        serviceContext.dal.authPermissionDal.getAuthPermissionSets.mockResolvedValue(
          [
            { id: 'ps_id', permissionMasks: [1] }
          ]
        );

        // serviceContext.dal.structuredData.getSchema
        serviceContext.dbConnections['third_party'].write._push(
          [
            {
              id: resourceTypeSchemaId
            }
          ],
          false,
          ['data_registries'] // table name
        );

        authACEDal.addACEsToResources.mockResolvedValue(['SDO::sdo_id_1::ag_id::ps_id']);

        const aces = await rbacBll.addACEsToResources(ctx, args)
        expect(aces).toEqual(['SDO::sdo_id_1::ag_id::ps_id']);
      });

      it('should fail if addACEsToResources with SDO resource type does not include resourceTypeSchemaId', async () => {
        const args = {
          resourceType: 'SDO',
          ids: ['33333333-3333-3333-3333-333333333333'],
          entries: [
            {
              member: {
                id: 'ag_id',
                memberType: 'Group'
              },
              permissionSetID: 'ps_id'
            }
          ],
          ownerOrganization: OWNER_ORG_ID
        };

        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [{ id: 'ag_id', name: 'group-test' }]
        });

        serviceContext.dal.authPermissionDal.getAuthPermissionSets.mockResolvedValue(
          [
            { id: 'ps_id', permissionMasks: [1] }
          ]
        );

        try {
          await rbacBll.addACEsToResources(ctx, args)
        } catch (error) {
          expect(error.message).toBe('resourceTypeSchemaId is required for the SDO resource type.');
        }
      });

      it('should return restrict error with internalToken, without ownerOrganization', async () => {
        const args = {
          resourceType: 'TDO',
          ids: ['---aceId---'],
          entries: [
            {
              member: {
                id: 'ag_id',
                memberType: 'Group'
              },
              permissionSetID: 'ps_id'
            }
          ]
        };

        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [{ id: 'ag_id', name: 'group-test' }]
        });

        await expect(async () =>
          rbacBll.addACEsToResources(internalTokenContext, args)
        ).rejects.toThrow({
          message: 'Unable to get organizationGuid'
        });
      });

      it.each(['SDO', 'SDOSchema'])(
        'should throw an error when RBAC for this resource type is disabled - %s',
        async (resourceType) => {
          const args = {
            resourceType,
            ids: ['33333333-3333-3333-3333-333333333333'],
            entries: [
              {
                member: {
                  id: 'ag_id',
                  memberType: 'Group'
                },
                permissionSetID: 'ps_id'
              }
            ],
            ownerOrganization: OWNER_ORG_ID
          };

          serviceContext.dal.organization.getOrganization.mockReturnValue({
            organizationId: 1000,
            kvp: {
              features: {
                enableRBACFeature: 'enabled',
                enableRBACFeatureForSDO: 'disabled'
              }
            }
          });

          authGroupDal.getAuthGroups.mockResolvedValue({
            records: [{ id: 'ag_id', name: 'group-test' }]
          });

          serviceContext.dal.authPermissionDal.getAuthPermissionSets.mockResolvedValue(
            [
              { id: 'ps_id', permissionMasks: [1] }
            ]
          );

          try {
            await rbacBll.addACEsToResources(ctx, args)
          } catch (error) {
            expect(error.message).toBe(`RBAC is not enabled for resource type: ${resourceType}`);
          }
        }
      );
      it('should emit sdo_acl_changed event when adding ACEs to SDO resources', async () => {
        const resourceTypeSchemaId = uuid.v4();
        const sdoIds = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];
        const args = {
          resourceType: 'SDO',
          resourceTypeSchemaId,
          ids: sdoIds,
          entries: [
            {
              member: { id: 'ag_id', memberType: 'Group' },
              permissionSetID: 'ps_id'
            }
          ],
          ownerOrganization: OWNER_ORG_ID
        };

        authGroupDal.getAuthGroups.mockResolvedValue({
          records: [{ id: 'ag_id', name: 'group-test' }]
        });
        serviceContext.dal.authPermissionDal.getAuthPermissionSets.mockResolvedValue([
          { id: 'ps_id', permissionMasks: [1] }
        ]);
        serviceContext.dbConnections['third_party'].write._push(
          [{ id: resourceTypeSchemaId }],
          false,
          ['data_registries']
        );
        authACEDal.addACEsToResources.mockResolvedValue(['ace_1']);

        await rbacBll.addACEsToResources(ctx, args);

        const messages = serviceContext.messageUtil._messages();
        // 2 sdo_acl_changed + 2 ACEGrant audit events (one entry x two ids)
        expect(serviceContext.messageUtil._counter()).toBe(4);

        expect(messages).toContainEqual(
          expect.objectContaining({
            type: 'structuredData',
            event: 'sdo_acl_changed',
            sdoId: '11111111-1111-1111-1111-111111111111',
            dataRegistryId: resourceTypeSchemaId
          })
        );
        expect(messages).toContainEqual(
          expect.objectContaining({
            type: 'structuredData',
            event: 'sdo_acl_changed',
            sdoId: '22222222-2222-2222-2222-222222222222',
            dataRegistryId: resourceTypeSchemaId
          })
        );

        // One ACEGrant event per (entry x resource id), recording the caller's
        // original member with the exact contractual action detail string.
        const grantEvents = messages.filter((m) => m.event === 'ace_grant');
        expect(grantEvents).toHaveLength(2);
        expect(grantEvents).toContainEqual(
          expect.objectContaining({
            event: 'ace_grant',
            resourceType: 'SDO',
            resourceId: '11111111-1111-1111-1111-111111111111',
            success: true,
            actionInfo: expect.objectContaining({
              actionDetails:
                'Granted ps_id to ag_id (Group) on SDO 11111111-1111-1111-1111-111111111111'
            })
          })
        );
        expect(grantEvents).toContainEqual(
          expect.objectContaining({
            event: 'ace_grant',
            resourceId: '22222222-2222-2222-2222-222222222222',
            actionInfo: expect.objectContaining({
              actionDetails:
                'Granted ps_id to ag_id (Group) on SDO 22222222-2222-2222-2222-222222222222'
            })
          })
        );
      });
    });
  });

  describe('Has permissions', () => {
    let rbacBll1;
    let context;
    let dalFolder;
    beforeAll(() => {
      dalFolder = {
        getOrCreateOrgRootFolder: jest.fn(),
        getObjectIdsFromOpaqueIds: jest.fn()
      };

      serviceContext.dal.folder = dalFolder;

      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 1000,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      });

      _.set(serviceContext, 'config.featureFlags.enableRBACFeature', true);
      rbacBll1 = require('./rbacAuth.bll.js')(serviceContext);
      context = {
        _authInfo: {
          userId: 'user_id_1',
          organization: {
            organizationId: ORG_ID,
            organizationGuid: ORG_GUID,
            guid: ORG_GUID,
            kvp: {
              features: {
                enableRBACFeature: 'enabled'
              }
            }
          },
          authGroups: ['ag_1', 'ag_2', 'ag_3']
        }
      };
    });

    describe('#populateAuthContext', () => {
      it('should mutate context', async () => {
        let context1 = _.cloneDeep(context);
        _.set(context1, '_authInfo.authGroups', []);
        serviceContext.dal.authGroup.getAuthGroupsContainingMember.mockImplementation(
          (arg1) => {
            expect(arg1).toEqual('user_id_1');

            return Promise.resolve({
              records: [{ id: 'ag_1' }, { id: 'ag_2', authClass: 'User' }]
            });
          }
        );
        const res = await rbacBll1.populateAuthContext(context1);

        expect(res._authInfo.authGroups).toEqual(
          expect.arrayContaining(['ag_1', 'ag_2'])
        );
        expect(res._authInfo.privateAuthGroups).toEqual(
          expect.arrayContaining(['ag_2'])
        );
        expect(
          serviceContext.dal.authGroup.getAuthGroupsContainingMember
        ).toHaveBeenCalled();
      });
    });
    describe('#hasResourceAuthRole', () => {
      it('should throw an error if no roles are matched for at least one resource of a resource type', async () => {
        let err;
        serviceContext.dal.authAce.hasPermissions.mockReturnValue([
          {
            resourceType: 'Folder',
            id: '44444444-4444-4444-4444-444444444444',
            hasPermission: true
          },
          {
            resourceType: 'Folder',
            id: '55555555-5555-5555-5555-555555555555',
            hasPermission: false
          },
          {
            resourceType: 'Folder',
            id: '66666666-6666-6666-6666-666666666666',
            hasPermission: true
          }
        ]);
        const resources = new Map([
          [
            'Folder',
            {
              ids: new Set(['44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666']),
              permissions: ['AIWARE_FOLDER_READ']
            }
          ]
        ]);

        try {
          await rbacBll1.hasResourceAuthRole(context, resources, true);
        } catch (error) {
          err = error;
        }
        expect(err).toBeDefined();
      });
      it('should return auth granted', async () => {
        let err, res;
        serviceContext.dal.authAce.hasPermissions.mockReturnValue([
          {
            resourceType: 'Folder',
            id: '44444444-4444-4444-4444-444444444444',
            hasPermission: true
          },
          {
            resourceType: 'Folder',
            id: '55555555-5555-5555-5555-555555555555',
            hasPermission: true
          },
          {
            resourceType: 'Folder',
            id: '66666666-6666-6666-6666-666666666666',
            hasPermission: true
          }
        ]);
        const resources = new Map([
          [
            'Folder',
            {
              ids: new Set(['44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666']),
              permissions: ['AIWARE_FOLDER_READ']
            }
          ]
        ]);
        dalFolder.getObjectIdsFromOpaqueIds.mockImplementationOnce(
          async (ctx, ids) => {
            return ids.reduce((m, x) => m.set(x, x), new Map());
          }
        );
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        });

        try {
          res = await rbacBll1.hasResourceAuthRole(context, resources, false);
        } catch (error) {
          err = error;
        }
        expect(err).toBeUndefined();
        expect(res.size).toEqual(1);
        expect(res.get('Folder').has('44444444-4444-4444-4444-444444444444')).toEqual(true);
        expect(res.get('Folder').has('55555555-5555-5555-5555-555555555555')).toEqual(true);
        expect(res.get('Folder').has('66666666-6666-6666-6666-666666666666')).toEqual(true);
      });
      it('should return auth granted failed', async () => {
        let err, res;
        serviceContext.dal.authAce.hasPermissions.mockReturnValue([
          {
            resourceType: 'Folder',
            id: '44444444-4444-4444-4444-444444444444',
            hasPermission: true
          },
          {
            resourceType: 'Folder',
            id: '55555555-5555-5555-5555-555555555555',
            hasPermission: false
          },
          {
            resourceType: 'Folder',
            id: '66666666-6666-6666-6666-666666666666',
            hasPermission: true
          }
        ]);
        const resources = new Map([
          [
            'Folder',
            {
              ids: new Set(['44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666']),
              permissions: ['AIWARE_FOLDER_READ']
            }
          ]
        ]);
        dalFolder.getObjectIdsFromOpaqueIds.mockImplementationOnce(
          async (ctx, ids) => {
            return ids.reduce((m, x) => m.set(x, x), new Map());
          }
        );
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        });
        // if one of the resource permissions is false the orgLevel lookup would be executed
        serviceContext.dal.authAce.hasOrgRolePermissions.mockResolvedValue(
          false
        );

        try {
          res = await rbacBll1.hasResourceAuthRole(context, resources, false);
        } catch (error) {
          err = error;
        }
        expect(err).toBeUndefined();
        expect(res.size).toEqual(1);
        expect(res.get('Folder').has('44444444-4444-4444-4444-444444444444')).toEqual(true);
        expect(res.get('Folder').has('55555555-5555-5555-5555-555555555555')).toEqual(false);
        expect(res.get('Folder').has('66666666-6666-6666-6666-666666666666')).toEqual(true);
      });

      it('should return auth granted failed - org override', async () => {
        let err, res;
        serviceContext.dal.authAce.hasPermissions.mockReturnValue([
          {
            resourceType: 'Folder',
            id: '44444444-4444-4444-4444-444444444444',
            hasPermission: true
          },
          {
            resourceType: 'Folder',
            id: '55555555-5555-5555-5555-555555555555',
            hasPermission: false
          },
          {
            resourceType: 'Folder',
            id: '66666666-6666-6666-6666-666666666666',
            hasPermission: true
          }
        ]);
        const resources = new Map([
          [
            'Folder',
            {
              ids: new Set(['44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666']),
              permissions: ['AIWARE_FOLDER_READ']
            }
          ]
        ]);
        dalFolder.getObjectIdsFromOpaqueIds.mockImplementationOnce(
          async (ctx, ids) => {
            return ids.reduce((m, x) => m.set(x, x), new Map());
          }
        );
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        });
        // this is only called via a flag that should be false when called from hasResourceAuthRole
        serviceContext.dal.authAce.hasOrgRolePermissions.mockResolvedValue(
          true
        );

        try {
          res = await rbacBll1.hasResourceAuthRole(context, resources, false);
        } catch (error) {
          err = error;
        }
        expect(err).toBeUndefined();
        expect(res.size).toEqual(1);
        expect(res.get('Folder').has('44444444-4444-4444-4444-444444444444')).toEqual(true);
        expect(res.get('Folder').has('55555555-5555-5555-5555-555555555555')).toEqual(false);
        expect(res.get('Folder').has('66666666-6666-6666-6666-666666666666')).toEqual(true);
      });
    });

    describe('#hasOrganizationAuthRole', () => {
      it('should return true/false with options', async () => {
        serviceContext.dal.authGroup.getAuthGroupsPermissionMaskForOrganization = jest
          .fn()
          .mockImplementation((orgId, authGroupIds) => {
            expect(orgId).toEqual(ORG_ID);
            expect(authGroupIds).toEqual(
              expect.arrayContaining(['ag_1', 'ag_2', 'ag_3'])
            );
            return [0, 8, 4194304];
          });
        const orgRolePermissions = ['RECORDING_READ', 'DISCOVERY_FOLDER_READ'];
        const res = await rbacBll1.hasOrganizationAuthRole(
          context,
          orgRolePermissions
        );

        expect(res).toEqual(true);
      });
    });

    describe('#hasPermissions', () => {
      it('emits ACEQuery only for the caller-facing query, not internal re-checks', async () => {
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: { features: { enableRBACFeature: 'enabled' } }
        });
        serviceContext.dal.authAce.hasPermissions.mockResolvedValue([
          { id: 'object_id_1', resourceType: 'TDO', hasPermission: true },
          { id: 'object_id_2', resourceType: 'TDO', hasPermission: false }
        ]);

        // Internal re-check path (no auditAccessQuery flag) → no ACEQuery events.
        await rbacBll1.hasPermissions(context, {
          ids: ['object_id_1', 'object_id_2'],
          resourceType: 'TDO',
          permissions: ['RECORDING_READ']
        });
        expect(
          serviceContext.messageUtil
            ._messages()
            .filter((m) => m.event === 'ace_query')
        ).toHaveLength(0);

        serviceContext.messageUtil._clearCounter();

        // Caller-facing query path (flag set) → one ACEQuery per resolved id,
        // carrying the access decision.
        await rbacBll1.hasPermissions(
          context,
          {
            ids: ['object_id_1', 'object_id_2'],
            resourceType: 'TDO',
            permissions: ['RECORDING_READ']
          },
          undefined,
          { auditAccessQuery: true }
        );
        const queryEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'ace_query');
        expect(queryEvents).toHaveLength(2);
        expect(queryEvents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              event: 'ace_query',
              resourceId: 'object_id_1',
              resourceType: 'TDO',
              accessGranted: true,
              member: { memberId: 'user_id_1', memberType: 'User' }
            }),
            expect.objectContaining({
              event: 'ace_query',
              resourceId: 'object_id_2',
              resourceType: 'TDO',
              accessGranted: false
            })
          ])
        );
      });

      it('keeps the audit flag out of the DAL args so it cannot pollute the cache key', async () => {
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: { features: { enableRBACFeature: 'enabled' } }
        });
        serviceContext.dal.authAce.hasPermissions.mockResolvedValue([
          { id: 'object_id_1', resourceType: 'TDO', hasPermission: true }
        ]);

        await rbacBll1.hasPermissions(
          context,
          {
            ids: ['object_id_1'],
            resourceType: 'TDO',
            permissions: ['RECORDING_READ']
          },
          undefined,
          { auditAccessQuery: true }
        );

        // The DAL cache key is a whole-args hash (buildFilterOptionKey), so the
        // transient audit flag must never reach it — otherwise the caller-facing
        // query and internal re-checks split into two cache namespaces for the
        // same resource, duplicating entries and forcing an extra DB warm.
        const dalArgs =
          serviceContext.dal.authAce.hasPermissions.mock.calls[0][0];
        expect(dalArgs).not.toHaveProperty('auditAccessQuery');
      });

      it('batches a successful ACEQuery by decision and caps events at ceil(N/size) per group', async () => {
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: { features: { enableRBACFeature: 'enabled' } }
        });
        // 12 granted + 3 denied. Batched at size 10 → 2 granted events (10 + 2)
        // and 1 denied event = 3 total, not 15 individual publishes.
        const granted = Array.from({ length: 12 }, (_v, i) => ({
          id: `granted_${i}`,
          resourceType: 'TDO',
          hasPermission: true
        }));
        const denied = Array.from({ length: 3 }, (_v, i) => ({
          id: `denied_${i}`,
          resourceType: 'TDO',
          hasPermission: false
        }));
        serviceContext.dal.authAce.hasPermissions.mockResolvedValue([
          ...granted,
          ...denied
        ]);

        await rbacBll1.hasPermissions(
          context,
          {
            ids: [...granted, ...denied].map((r) => r.id),
            resourceType: 'TDO',
            permissions: ['RECORDING_READ']
          },
          undefined,
          { auditAccessQuery: true }
        );

        const queryEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'ace_query');
        expect(queryEvents).toHaveLength(3);
        const grantedEvents = queryEvents.filter(
          (m) => m.accessGranted === true
        );
        const deniedEvents = queryEvents.filter(
          (m) => m.accessGranted === false
        );
        expect(grantedEvents).toHaveLength(2);
        expect(deniedEvents).toHaveLength(1);
        // Batched events (>1 resource) carry no single structured resourceId;
        // their ids live in actionDetails. The denied batch lists all three.
        queryEvents.forEach((m) => expect(m.resourceId).toBeNull());
        expect(deniedEvents[0].actionInfo.actionDetails).toBe(
          'Checked permissions for user_id_1 (User) on TDO denied_0, TDO denied_1 and TDO denied_2'
        );
      });

      it('batches failed ACEQuery ids into one event and still throws when the ACE lookup fails', async () => {
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: { features: { enableRBACFeature: 'enabled' } }
        });
        serviceContext.dal.authAce.hasPermissions.mockRejectedValue(
          new Error('ace lookup failed')
        );

        await expect(async () =>
          rbacBll1.hasPermissions(
            context,
            {
              ids: ['object_id_1', 'object_id_2'],
              resourceType: 'TDO',
              permissions: ['RECORDING_READ']
            },
            undefined,
            { auditAccessQuery: true }
          )
        ).rejects.toThrow('Error accessing resource Access Control Entries');

        // Both ids (< batch size) fold into a single failed ACEQuery event that
        // names them in actionDetails, and the error still propagates.
        const queryEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'ace_query');
        expect(queryEvents).toHaveLength(1);
        expect(queryEvents[0].success).toBe(false);
        // A batched event has no single structured resourceId; both ids are
        // still reported in actionDetails.
        expect(queryEvents[0].resourceId).toBeNull();
        expect(queryEvents[0].actionInfo.actionDetails).toBe(
          'Failed to check permissions for user_id_1 (User) on TDO object_id_1 and TDO object_id_2'
        );
      });

      it('splits a large failed ACEQuery into batches of the configured size', async () => {
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: { features: { enableRBACFeature: 'enabled' } }
        });
        serviceContext.dal.authAce.hasPermissions.mockRejectedValue(
          new Error('ace lookup failed')
        );

        const ids = Array.from({ length: 25 }, (_v, i) => `obj_${i}`);
        await expect(async () =>
          rbacBll1.hasPermissions(
            context,
            {
              ids,
              resourceType: 'TDO',
              permissions: ['RECORDING_READ']
            },
            undefined,
            { auditAccessQuery: true }
          )
        ).rejects.toThrow('Error accessing resource Access Control Entries');

        // 25 ids / batch size 10 -> 3 events (10, 10, 5), not 25.
        const queryEvents = serviceContext.messageUtil
          ._messages()
          .filter((m) => m.event === 'ace_query');
        expect(queryEvents).toHaveLength(3);
        queryEvents.forEach((m) => expect(m.success).toBe(false));
      });
      it('restrict ownerOrganization to non superadmin or non internal token', async () => {
        applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID_OF_OWNER_ORG);
        await expect(async () =>
          rbacBll1.hasPermissions(regularUserContext, {
            ids: ['object_id_1', 'object_id_2'],
            resourceType: 'TDO',
            permissions: ['RECORDING_READ'],
            ownerOrganization: OWNER_ORG_ID
          })
        ).rejects.toThrow(
          'Access to field ownerOrganization requires superadmin rights'
        );
      });
      it('should return object ids with true/false value for current user', async () => {
        // restrictContextOrganization
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        // isEnableFeatureInOrganization
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        });
        serviceContext.dal.authAce.hasPermissions.mockImplementation((args) => {
          expect(args.ids.length).toEqual(2);
          expect(args.permissions).toEqual(
            expect.arrayContaining(['RECORDING_READ'])
          );
          expect(args.resourceType).toEqual('TDO');
          expect(args.orgId).toEqual(ORG_ID);
          expect(args.orgGuid).toEqual(ORG_GUID);
          expect(args.authGroups).toEqual(
            expect.arrayContaining(['ag_1', 'ag_2', 'ag_3'])
          );
          return Promise.resolve([
            {
              id: 'object_id_1',
              resourceType: 'TDO',
              permissions: true
            },
            {
              id: 'object_id_2',
              resourceType: 'TDO',
              permissions: false
            }
          ]);
        });
        const res = await rbacBll1.hasPermissions(context, {
          ids: ['object_id_1', 'object_id_2'],
          resourceType: 'TDO',
          permissions: ['RECORDING_READ']
        });

        expect(res).toEqual(
          expect.arrayContaining([
            {
              id: 'object_id_1',
              resourceType: 'TDO',
              permissions: true
            },
            {
              id: 'object_id_2',
              resourceType: 'TDO',
              permissions: false
            }
          ])
        );
      });
      it('should return object ids with true/false value for a user', async () => {
        // restrictContextOrganization
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        // isEnableFeatureInOrganization
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        });
        serviceContext.dal.admin.getOrganizationGuidsForUser.mockImplementation(
          (args) => {
            expect(args.id).toEqual('user_id_2');
            return [ORG_GUID];
          }
        );
        serviceContext.dal.authGroup.getAuthGroupsContainingMember.mockImplementation(
          (userId) => {
            expect(userId).toEqual('user_id_2');
            return Promise.resolve({
              records: [{ id: 'ag_4' }, { id: 'ag_5' }]
            });
          }
        );
        serviceContext.dal.authAce.hasPermissions.mockImplementation((args) => {
          expect(args.authGroups).toEqual(
            expect.arrayContaining(['ag_4', 'ag_5'])
          );
          return [
            {
              id: 'object_id_1',
              resourceType: 'TDO',
              permissions: true
            },
            {
              id: 'object_id_2',
              resourceType: 'TDO',
              permissions: false
            }
          ];
        });
        const res = await rbacBll1.hasPermissions(context, {
          ids: ['object_id_1', 'object_id_2'],
          resourceType: 'TDO',
          permissions: ['RECORDING_READ'],
          userID: 'user_id_2'
        });

        expect(res).toEqual(
          expect.arrayContaining([
            {
              id: 'object_id_1',
              resourceType: 'TDO',
              permissions: true
            },
            {
              id: 'object_id_2',
              resourceType: 'TDO',
              permissions: false
            }
          ])
        );
      });

      it('should throw error when a user input does not belong to the organization', async () => {
        // restrictContextOrganization
        serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        // isEnableFeatureInOrganization
        serviceContext.dal.organization.getOrganization.mockReturnValue({
          organizationId: ORG_ID,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        });
        serviceContext.dal.admin.getOrganizationGuidsForUser.mockImplementation(
          (args) => {
            expect(args.id).toEqual('user_id_2');
            return ['org_guid_2'];
          }
        );

        await expect(async () =>
          rbacBll1.hasPermissions(context, {
            ids: ['object_id_1', 'object_id_2'],
            resourceType: 'TDO',
            permissions: ['RECORDING_READ'],
            userID: 'user_id_2'
          })
        ).rejects.toThrow('The user does not belong to the organization');
      });
      it('should return restrict error with internalToken, without ownerOrganization', async () => {
        await expect(async () =>
          rbacBll1.hasPermissions(internalTokenContext, {
            ids: ['object_id_1', 'object_id_2'],
            resourceType: 'TDO',
            permissions: ['RECORDING_READ'],
            userID: 'user_id_2'
          })
        ).rejects.toThrow('Only resourceType Organization allowed');
      });
    });

    describe('#hasPermissions for non-OLP organization', () => {
      let rbacBllWhenDisabledOLP, serviceCtxDisabledOLP;
      beforeAll(() => {
        serviceCtxDisabledOLP = createServiceContext();
        serviceCtxDisabledOLP.config = _.cloneDeep(serviceContext.config);
        _.set(serviceCtxDisabledOLP, 'config.featureFlags.enableRBACFeature', false);
        serviceCtxDisabledOLP.dal.organization = organizationDal;
        rbacBllWhenDisabledOLP = require('./rbacAuth.bll.js')(serviceCtxDisabledOLP);
      });

      const context = {
        _authInfo: {
          organization: {
            guid: 'mock_guid_1',
            organizationId: ''
          },
          userId: 'mock_user_id_1',
          json: {
            rights: []
          },
          tokenId: 'mock_token_id',
          applicationId: 'application_id'
        }
      };

      const arg = {
        resourceType: '',
        ids: ['4678'],
        permissions: []
      };

      it('validate access to resources when user has permission AIWARE_SUPERADMIN', async () => {
        const context1 = _.cloneDeep(context);
        const arg1 = _.cloneDeep(arg);

        // restrictContextOrganization
        serviceCtxDisabledOLP.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );

        context1._authInfo.json.rights = ['aiware.admin.superadmin'];
        arg1.resourceType = 'Organization';

        const resp = await rbacBllWhenDisabledOLP.hasPermissions(context1, arg1);
        expect(resp[0].resourceType).toEqual(arg1.resourceType);
        expect(resp[0].id).toEqual(arg1.ids[0]);
        expect(resp[0].hasPermission).toEqual(true);
      });

      it('it throws error when resourceType is different to Organization', async () => {
        const arg2 = _.cloneDeep(arg);
        arg2.resourceType = 'TDO';

        // restrictContextOrganization
        serviceCtxDisabledOLP.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        try {
          await rbacBllWhenDisabledOLP.hasPermissions(context, arg2);
        } catch (e) {
          expect(e.message).toEqual('Only resourceType Organization allowed');
          expect(e.data.type).toEqual('AuthPermissionCheck');
          expect(e.data.resourceType).toEqual(arg2.resourceType);
        }
      });

      it('it validate access to resources when user is superadmin', async () => {
        const context3 = _.cloneDeep(context);
        const arg3 = _.cloneDeep(arg);

        context3._authInfo.json.rights = ['superadmin'];
        arg3.resourceType = 'Organization';

        // restrictContextOrganization
        serviceCtxDisabledOLP.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );

        const resp = await rbacBllWhenDisabledOLP.hasPermissions(context3, arg3);
        expect(resp[0].resourceType).toEqual(arg3.resourceType);
        expect(resp[0].id).toEqual(arg3.ids[0]);
        expect(resp[0].hasPermission).toEqual(true);
      });

      it(`it throws error when user doesn't belong to the organization`, async () => {
        const context4 = _.cloneDeep(context);
        const arg4 = _.cloneDeep(arg);

        context4._authInfo.organization.organizationId = 'mock_org_id';
        arg4.resourceType = 'Organization';

        // restrictContextOrganization
        serviceCtxDisabledOLP.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );
        const resp = await rbacBllWhenDisabledOLP.hasPermissions(context4, arg4);
        expect(resp[0].resourceType).toEqual(arg4.resourceType);
        expect(resp[0].id).toEqual(arg4.ids[0]);
        expect(resp[0].hasPermission).toEqual(false);
      });

      it(`it returns successful object when user has the permissions related to input.hasPermission array`, async () => {
        const context5 = _.cloneDeep(context);
        const arg5 = _.cloneDeep(arg);

        context5._authInfo.organization.organizationId = 4678;
        context5._authInfo.json.rights = ['MOCK_PERMISSION'];
        arg5.resourceType = 'Organization';
        arg5.permissions = ['MOCK_PERMISSION'];

        // restrictContextOrganization
        serviceCtxDisabledOLP.dal.organization.getOrgIdFromAppId.mockReturnValue(
          4678
        );

        const resp = await rbacBllWhenDisabledOLP.hasPermissions(context5, arg5);
        expect(resp[0].resourceType).toEqual(arg5.resourceType);
        expect(resp[0].id).toEqual(arg5.ids[0]);
        expect(resp[0].hasPermission).toEqual(true);
      });

      it(`it returns failed object when user has not the permissions related to input.hasPermission array`, async () => {
        const context6 = _.cloneDeep(context);
        const arg6 = _.cloneDeep(arg);

        context6._authInfo.organization.organizationId = 4678;
        context6._authInfo.json.rights = ['MOCK_PERMISSION'];
        arg6.resourceType = 'Organization';
        arg6.permissions = ['INVALID_PERMISSION'];

        // restrictContextOrganization
        serviceCtxDisabledOLP.dal.organization.getOrgIdFromAppId.mockReturnValue(
          ORG_ID
        );

        const resp = await rbacBllWhenDisabledOLP.hasPermissions(context6, arg6);
        expect(resp[0].resourceType).toEqual(arg6.resourceType);
        expect(resp[0].id).toEqual(arg6.ids[0]);
        expect(resp[0].hasPermission).toEqual(false);
      });
    });
  });

  describe('#_validatePermissionRole', () => {
    it('Not passed in', () => {
      const result = rbacBll._validatePermissionRole();
      expect(result).toEqual(false);
    });
    it('Role is null', () => {
      const result = rbacBll._validatePermissionRole(null);
      expect(result).toEqual(false);
    });
    it('Role is not null but it is empty object-1', () => {
      const result = rbacBll._validatePermissionRole({});
      expect(result).toEqual(false);
    });
    it('Role is not null but it has an empty value in the name field', () => {
      const result = rbacBll._validatePermissionRole({ name: '' });
      expect(result).toEqual(false);
    });
    it('Role is not null and ok', () => {
      const result = rbacBll._validatePermissionRole({ name: 'test role' });
      expect(result).toEqual(true);
    });
  });

  describe('Validate access to resources', () => {
    let context;
    beforeAll(() => {
      context = {
        _authInfo: {
          userId: 'user_id_1',
          organization: {
            organizationId: ORG_ID,
            kvp: {
              features: {
                enableRBACFeature: 'enabled'
              }
            }
          },
          authGroups: ['ag_1', 'ag_2', 'ag_3']
        }
      };
    });

    it('allow superadmin', async () => {
      const suContext = {
        _authInfo: {
          permissionMasks: [-2, 268427519, 1073741824, 5189619] // superadmin permissionMarks
        }
      };
      const r = await rbacBll._validateAccessToResourceIds(suContext, 'TDO', [
        'tdo1',
        'tdo2',
        'tdo3'
      ]);
      expect(r.isAdmin).toEqual(true);
      expect(r.userPermissionSets.size).toEqual(0);
    });

    it('allow admin', async () => {
      const suContext = {
        _authInfo: {
          permissionMasks: [16] // admin permissionMarks
        }
      };
      const r = await rbacBll._validateAccessToResourceIds(suContext, 'TDO', [
        'tdo1',
        'tdo2',
        'tdo3'
      ]);
      expect(r.isAdmin).toEqual(true);
      expect(r.userPermissionSets.size).toEqual(0);
    });

    it('allow internal token - ownerOrganization', async () => {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      const ownerOrganization = ORG_GUID;
      const r = await rbacBll._validateAccessToResourceIds(
        context,
        'TDO',
        ['tdo1', 'tdo2', 'tdo3'],
        ownerOrganization
      );
      expect(r.isAdmin).toEqual(false);
      expect(r.userPermissionSets.size).toEqual(0);
    });

    it('allow preAuth ids', async () => {
      const preAuthIds = new Map();
      preAuthIds.set('TDO', { ids: new Set(['tdo1', 'tdo2', 'tdo3']) });
      const ctx = {
        ...context,
        _authGranted: preAuthIds
      };
      const r = await rbacBll._validateAccessToResourceIds(ctx, 'TDO', [
        'tdo1',
        'tdo2',
        'tdo3'
      ]);
      expect(r.isAdmin).toEqual(false);
      expect(r.userPermissionSets.size).toEqual(0);
    });

    it('throw error if not enough resource permissions - not all preAuthIds', async () => {
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            objectID: 'tdo1',
            permissionSetId: 'ps1'
          }
        ]
      });
      const preAuthIds = new Map();
      preAuthIds.set('TDO', { ids: new Set(['tdo1', 'tdo2', 'tdo4']) });
      const ctx = {
        ...context,
        _authGranted: preAuthIds
      };
      _.set(ctx, '_authInfo.organization.guid', 'org-guid');
      await expect(async () =>
        rbacBll._validateAccessToResourceIds(context, 'TDO', [
          'tdo1',
          'tdo2',
          'tdo3'
        ])
      ).rejects.toThrow({
        message: 'Access denied to one or more of the provided ids'
      });
    });

    it('throw error if not enough resource permissions', async () => {
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            objectID: 'tdo1',
            permissionSetId: 'ps1'
          }
        ]
      });
      _.set(context, '_authInfo.organization.guid', 'org-guid');
      await expect(async () =>
        rbacBll._validateAccessToResourceIds(context, 'TDO', [
          'tdo1',
          'tdo2',
          'tdo3'
        ])
      ).rejects.toThrow({
        message: 'Access denied to one or more of the provided ids'
      });
    });

    it('emits AuthorizationDenied for each denied id and still throws', async () => {
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            objectID: 'tdo1',
            permissionSetId: 'ps1'
          }
        ]
      });
      _.set(context, '_authInfo.organization.guid', 'org-guid');

      await expect(async () =>
        rbacBll._validateAccessToResourceIds(context, 'TDO', [
          'tdo1',
          'tdo2',
          'tdo3'
        ])
      ).rejects.toThrow('Access denied to one or more of the provided ids');

      // Only the ids the user could not access are recorded as denied.
      const deniedEvents = serviceContext.messageUtil
        ._messages()
        .filter((m) => m.event === 'authorization_denied');
      expect(deniedEvents.map((m) => m.resourceId).sort()).toEqual([
        'tdo2',
        'tdo3'
      ]);
      deniedEvents.forEach((m) => {
        expect(m).toEqual(
          expect.objectContaining({
            event: 'authorization_denied',
            resourceType: 'TDO',
            success: true,
            reason: 'Access denied to one or more of the provided ids',
            actionInfo: expect.objectContaining({
              actionName: 'read',
              actionDetails: expect.stringContaining('Denied access for')
            })
          })
        );
      });
    });

    it('return permission sets for the requested resources', async () => {
      authACEDal.getACLForResources.mockResolvedValue({
        records: [
          {
            objectID: 'tdo1',
            permissionSetId: 'ps1'
          },
          {
            objectID: 'tdo2',
            permissionSetId: 'ps2'
          },
          {
            objectID: 'tdo3',
            permissionSetId: 'ps3'
          },
          {
            objectID: 'tdo2',
            permissionSetId: 'ps1'
          },
          {
            objectID: 'tdo3',
            permissionSetId: 'ps1'
          },
          {
            objectID: 'tdo3',
            permissionSetId: 'ps2'
          },
          {
            objectID: 'tdo3',
            permissionSetId: 'ps4'
          }
        ]
      });
      serviceContext.dal.authPermissionDal.getAuthPermissionSets.mockResolvedValue(
        [
          { id: 'ps1', permissionMasks: [1] },
          { id: 'ps2', permissionMasks: [2] },
          { id: 'ps3', permissionMasks: [3] },
          { id: 'ps4', permissionMasks: [4] }
        ]
      );
      _.set(context, '_authInfo.organization.guid', 'org-guid');
      const r = await rbacBll._validateAccessToResourceIds(context, 'TDO', [
        'tdo1',
        'tdo2',
        'tdo3'
      ]);
      expect(r.isAdmin).toEqual(false);
      expect(r.userPermissionSets.size).toEqual(3);
      expect(r.userPermissionSets.get('tdo1')).toEqual([
        { id: 'ps1', permissionMasks: [1] }
      ]);
      expect(r.userPermissionSets.get('tdo3')).toEqual(
        expect.arrayContaining([
          { id: 'ps1', permissionMasks: [1] },
          { id: 'ps2', permissionMasks: [2] },
          { id: 'ps3', permissionMasks: [3] },
          { id: 'ps4', permissionMasks: [4] }
        ])
      );
      expect(authACEDal.getACLForResources).toHaveBeenCalledWith({
        authGroups: ['ag_1', 'ag_2', 'ag_3'],
        ids: ['tdo1', 'tdo2', 'tdo3'],
        limit: 9,
        offset: 9,
        orgId: ORG_ID,
        permissions: ['AIWARE_TDO_UPDATE'],
        requireAll: false,
        resourceType: 'TDO',
        skipCache: true
      });
    });
  });

  describe('#emitAuthFailure', () => {
    const context = {
      _authInfo: { userId: 'user_id_1', authGroups: ['ag_1'] }
    };

    it('emits AuthorizationDenied per denied resource id at the directive gate', async () => {
      const resources = new Map([
        ['TDO', { ids: new Set(['tdo1', 'tdo2']) }],
        ['SDO', { ids: new Set(['sdo1']) }]
      ]);

      await rbacBll.emitAuthFailure(
        context,
        resources,
        new Error('No authorization access role found for Query.temporalDataObject')
      );

      const denied = serviceContext.messageUtil
        ._messages()
        .filter((m) => m.event === 'authorization_denied');
      expect(
        denied.map((m) => `${m.resourceType}:${m.resourceId}`).sort()
      ).toEqual(['SDO:sdo1', 'TDO:tdo1', 'TDO:tdo2']);
      denied.forEach((m) => {
        expect(m).toEqual(
          expect.objectContaining({
            event: 'authorization_denied',
            success: true,
            member: expect.objectContaining({
              memberId: 'user_id_1',
              memberType: 'User'
            }),
            reason:
              'No authorization access role found for Query.temporalDataObject',
            actionInfo: expect.objectContaining({
              actionDetails: expect.stringContaining('Denied access for')
            })
          })
        );
      });
    });

    it('records a single denial with a default reason when no resource target is present', async () => {
      await rbacBll.emitAuthFailure(context, new Map());

      const denied = serviceContext.messageUtil
        ._messages()
        .filter((m) => m.event === 'authorization_denied');
      expect(denied).toHaveLength(1);
      expect(denied[0]).toEqual(
        expect.objectContaining({
          resourceType: null,
          resourceId: null,
          reason: 'No authorization access role found'
        })
      );
    });
  });

  describe('_invalidateAnyPermissionSetRelatedCaches', () => {
    let rbacBll1, serviceContext1;
    let ORG_ID = 1;
    beforeAll(() => {
      serviceContext1 = createServiceContext();
      serviceContext1.dal.organization = {
        getOrgIdFromAppId: jest.fn()
      };
      serviceContext1.dal.authAce = {
        markCacheDirtyForGetACLForResources: jest.fn(),
        markCacheDirtyForHasPermissions: jest.fn()
      };
      serviceContext1.redisCache.markCacheDirty = jest.fn();

      rbacBll1 = require('./rbacAuth.bll.js')(serviceContext1);
    });

    beforeEach(() => {
      serviceContext1.redisCache.markCacheDirty.mockClear();
      serviceContext1.dal.organization.getOrgIdFromAppId.mockClear();
      serviceContext1.dal.authAce.markCacheDirtyForGetACLForResources.mockClear();
      serviceContext1.dal.authAce.markCacheDirtyForHasPermissions.mockClear();
    });

    it('should throw error if missing orgId', async () => {
      serviceContext1.dal.organization.getOrgIdFromAppId.mockResolvedValue(
        null
      );
      await expect(async () =>
        rbacBll1._invalidateAnyPermissionSetRelatedCaches({
          organizationGuid: ORG_GUID
        })
      ).rejects.toThrow({
        message: 'orgId is required'
      });
    });
    it('should mark some dirty keys', async () => {
      serviceContext1.dal.organization.getOrgIdFromAppId.mockResolvedValue(
        ORG_ID
      );
      serviceContext1.redisCache.markCacheDirty.mockImplementation((key) => {
        expect(key).toMatch(new RegExp(`organization_permissions:${ORG_ID}`));
        return Promise.resolve();
      });
      await rbacBll1._invalidateAnyPermissionSetRelatedCaches({
        organizationGuid: ORG_GUID
      });
      expect(serviceContext1.redisCache.markCacheDirty).toHaveBeenCalledTimes(
        1
      );
      expect(
        serviceContext1.dal.authAce.markCacheDirtyForGetACLForResources
      ).toHaveBeenCalledWith(ORG_ID, expect.any(Array));
      expect(
        serviceContext1.dal.authAce.markCacheDirtyForHasPermissions
      ).toHaveBeenCalledWith(ORG_ID, expect.any(Array));
    });
    it('should mark some dirty keys with options', async () => {
      const options = {
        organizationId: ORG_ID,
        ignoreOrgPermissionMarkDirty: true
      };
      await rbacBll1._invalidateAnyPermissionSetRelatedCaches(options);
      expect(
        serviceContext1.dal.organization.getOrgIdFromAppId
      ).not.toHaveBeenCalled();
      expect(serviceContext1.redisCache.markCacheDirty).not.toHaveBeenCalled();
      expect(
        serviceContext1.dal.authAce.markCacheDirtyForGetACLForResources
      ).toHaveBeenCalledWith(ORG_ID, expect.any(Array));
      expect(
        serviceContext1.dal.authAce.markCacheDirtyForHasPermissions
      ).toHaveBeenCalledWith(ORG_ID, expect.any(Array));
    });
  });
  describe('_invalidateAnyAuthGroupRelatedCaches', () => {
    let rbacBll1, serviceContext1;
    beforeAll(() => {
      serviceContext1 = createServiceContext();
      serviceContext1.dal.organization = {
        getOrgIdFromAppId: jest.fn()
      };
      serviceContext1.dal.authAce = {
        markCacheDirtyForHasPermissions: jest.fn(),
        markCacheDirtyForGetACLForResources: jest.fn()
      };
      serviceContext1.dal.authGroup = {
        markCacheDirtyForGetAuthGroups: jest.fn()
      };
      serviceContext1.redisCache.markCacheDirty = jest.fn();

      rbacBll1 = require('./rbacAuth.bll.js')(serviceContext1);
    });

    beforeEach(() => {
      serviceContext1.redisCache.markCacheDirty.mockClear();
      serviceContext1.dal.organization.getOrgIdFromAppId.mockClear();
      serviceContext1.dal.authGroup.markCacheDirtyForGetAuthGroups.mockClear();
      serviceContext1.dal.authAce.markCacheDirtyForHasPermissions.mockClear();
      serviceContext1.dal.authAce.markCacheDirtyForGetACLForResources.mockClear();
    });

    it('should throw error if missing organizationGuid', async () => {
      await expect(async () =>
        rbacBll1._invalidateAnyAuthGroupRelatedCaches({
          organizationID: ORG_ID
        })
      ).rejects.toThrow({
        message: 'organizationGuid is required'
      });
      expect(
        serviceContext1.dal.organization.getOrgIdFromAppId
      ).not.toHaveBeenCalled();
    });

    it('should throw error if missing orgId', async () => {
      serviceContext1.dal.organization.getOrgIdFromAppId.mockResolvedValue(
        null
      );
      await expect(async () =>
        rbacBll1._invalidateAnyAuthGroupRelatedCaches({
          organizationGuid: ORG_GUID
        })
      ).rejects.toThrow({
        message: 'orgId is required'
      });
    });
    it('should mark some dirty keys', async () => {
      serviceContext1.dal.organization.getOrgIdFromAppId.mockResolvedValue(
        ORG_ID
      );
      await rbacBll1._invalidateAnyAuthGroupRelatedCaches({
        organizationGuid: ORG_GUID
      });
      expect(
        serviceContext1.dal.authGroup.markCacheDirtyForGetAuthGroups
      ).toHaveBeenCalledWith(ORG_GUID);
      expect(
        serviceContext1.dal.authAce.markCacheDirtyForHasPermissions
      ).toHaveBeenCalledWith(ORG_ID, expect.any(Array));
      expect(
        serviceContext1.dal.authAce.markCacheDirtyForGetACLForResources
      ).toHaveBeenCalledWith(ORG_ID, expect.any(Array));
    });
    it('should mark some dirty keys with options', async () => {
      const options = {
        organizationId: ORG_ID,
        organizationGuid: ORG_GUID,
        ignoreACEHasPermissionMarkDirty: true,
        ignoreACLForResourcesMarkDirty: true,
        members: [
          { id: 'm_1', memberType: 'User' },
          { id: 'm_2', memberType: 'user' },
          { id: 'm_3', memberType: 'Group' }
        ]
      };
      serviceContext1.redisCache.markCacheDirty.mockImplementationOnce(
        (key) => {
          expect(key).toMatch(
            new RegExp(
              `rbacAuthGroupsForMember:${ORG_ID}:${options.members[0].id}`
            )
          );

          return Promise.resolve();
        }
      );
      serviceContext1.redisCache.markCacheDirty.mockImplementationOnce(
        (key) => {
          expect(key).toMatch(
            new RegExp(
              `rbacAuthGroupsForMember:${ORG_ID}:${options.members[1].id}`
            )
          );

          return Promise.resolve();
        }
      );
      await rbacBll1._invalidateAnyAuthGroupRelatedCaches(options);
      expect(
        serviceContext1.dal.organization.getOrgIdFromAppId
      ).not.toHaveBeenCalled();
      expect(
        serviceContext1.dal.authAce.markCacheDirtyForHasPermissions
      ).not.toHaveBeenCalled();
      expect(
        serviceContext1.dal.authAce.markCacheDirtyForGetACLForResources
      ).not.toHaveBeenCalled();
      expect(
        serviceContext1.dal.authGroup.markCacheDirtyForGetAuthGroups
      ).toHaveBeenCalledWith(ORG_GUID);
      expect(serviceContext1.redisCache.markCacheDirty).toHaveBeenCalledTimes(
        2
      );
    });
  });
  describe('_getDefaultAuthGroupForResources', () => {
    it('No data found', () => {
      const {
        defaultAuthGroups,
        permissionEntries
      } = rbacBll._getDefaultAuthGroupForResources();

      expect(defaultAuthGroups).toEqual([]);
      expect(permissionEntries).toEqual([]);
    });

    it('No data found - No groups, has permission sets', () => {
      const authPermissionSets = {
        records: [
          {
            id: 'ps_1',
            name: 'ps_1',
            description: 'desc_1'
          }
        ]
      };
      const {
        defaultAuthGroups,
        permissionEntries
      } = rbacBll._getDefaultAuthGroupForResources([], authPermissionSets);

      expect(defaultAuthGroups).toEqual([]);
      expect(permissionEntries).toEqual([]);
    });

    it('Data found - Has groups, no permission sets', () => {
      const authGroups = {
        records: [
          {
            id: 'g_1',
            name: 'g_1',
            description: 'desc_1'
          }
        ]
      };
      const {
        defaultAuthGroups,
        permissionEntries
      } = rbacBll._getDefaultAuthGroupForResources(authGroups);

      expect(defaultAuthGroups).toEqual(authGroups.records);
      expect(permissionEntries).toEqual([]);
    });

    it('Should get correct default groups for Resources', () => {
      const authGroups = {
        records: [
          {
            id: 'g_1',
            name: 'g_1',
            description: 'desc_1'
          },
          {
            id: 'g_2',
            name: 'g_2',
            description: 'desc_2'
          }
        ]
      };
      const authPermissionSets = {
        records: [
          {
            id: 'ps_1',
            name: 'aiWARE Administrator',
            description: 'desc_1'
          },
          {
            id: 'ps_2',
            name: 'aiWARE Full Access',
            description: 'desc_2'
          },
          {
            id: 'ps_3',
            name: 'aiWARE - Create',
            description: 'desc_3'
          }
        ]
      };

      const {
        defaultAuthGroups,
        permissionEntries
      } = rbacBll._getDefaultAuthGroupForResources(
        authGroups,
        authPermissionSets
      );

      expect(defaultAuthGroups).toEqual(authGroups.records);
      expect(permissionEntries.length).toEqual(2);
      expect(permissionEntries).toEqual([
        {
          member: {
            id: 'g_1',
            memberType: 'group'
          },
          permissionSetID: 'ps_2'
        },
        {
          member: {
            id: 'g_2',
            memberType: 'group'
          },
          permissionSetID: 'ps_2'
        }
      ]);
    });
  });

  describe('checkAndCreateAuthGroupsForAppRoles', () => {
    let org;
    const orgGuid = 'a35e530a-3c6b-43d9-8462-befd9b79281f';
    it('invalidInput - missing context', async () => {
      const result = await rbacBll.checkAndCreateAuthGroupsForAppRoles();
      expect(result.success).toEqual(false);
      expect(result.error).toEqual(`missing context`);
    });
    it('invalidInput - missing organization', async () => {
      const result = await rbacBll.checkAndCreateAuthGroupsForAppRoles(
        serviceContext
      );
      expect(result.success).toEqual(false);
      expect(result.error).toEqual(`missing organization`);
    });
    it('invalidInput - missing orgGuid', async () => {
      const result = await rbacBll.checkAndCreateAuthGroupsForAppRoles(
        serviceContext,
        {}
      );
      expect(result.success).toEqual(false);
      expect(result.error).toEqual(`missing orgGuid`);
    });
    it('no data - no application', async () => {
      org = {
        id: 1234,
        name: 'test org'
      };
      serviceContext.dal.application.getApplications.mockReturnValue({
        records: []
      });
      const result = await rbacBll.checkAndCreateAuthGroupsForAppRoles(
        serviceContext,
        org,
        orgGuid
      );
      expect(result.error).toBeUndefined();
      expect(result.success).toEqual(true);
      expect(result.authGroups.length).toEqual(0);
    });
    it('has special application: does not match', async () => {
      const applicationId = 'appId2';
      org = {
        id: 1234,
        name: 'test org'
      };
      serviceContext.dal.application.getApplications.mockReturnValue({
        records: [
          {
            applicationId: 'appId1',
            applicationName: 'appName1'
          }
        ]
      });
      const result = await rbacBll.checkAndCreateAuthGroupsForAppRoles(
        serviceContext,
        org,
        orgGuid,
        applicationId
      );
      expect(result.error).toBeDefined();
      expect(result.error).toEqual(
        `The organization does not have access to the application id ${applicationId}`
      );
      expect(result.success).toEqual(false);
      expect(result.authGroups.length).toEqual(0);
    });

    it('all authGroups were created for app roles', async () => {
      org = {
        id: 1234,
        name: 'test org'
      };
      serviceContext.dal.application.getApplications.mockReturnValue({
        records: [
          {
            applicationId: 'appId1',
            applicationName: 'appName1'
          }
        ]
      });
      serviceContext.dal.role.getRoles.mockReturnValue({
        records: [
          {
            id: 'role1',
            roleName: 'roleName1'
          },
          {
            id: 'role2',
            roleName: 'roleName2'
          }
        ]
      });

      serviceContext.dal.authGroup.getAuthGroups.mockReturnValue({
        records: [
          {
            id: 'group1',
            name: 'groupName1',
            roleId: 'role1'
          },
          {
            id: 'group2',
            name: 'groupName2',
            roleId: 'role2'
          }
        ]
      });
      const result = await rbacBll.checkAndCreateAuthGroupsForAppRoles(
        serviceContext,
        org,
        orgGuid
      );
      expect(result.error).toBeUndefined();
      expect(result.success).toEqual(true);
      expect(result.authGroups.length).toEqual(0);
    });

    it('has special application: the data match', async () => {
      const applicationId = 'appId2';
      org = {
        id: 1234,
        name: 'test org'
      };
      serviceContext.dal.application.getApplications.mockReturnValue({
        records: [
          {
            applicationId: 'appId1',
            applicationName: 'appName1'
          },
          {
            applicationId: 'appId2',
            applicationName: 'appName2'
          }
        ]
      });
      serviceContext.dal.role.getRoles.mockReturnValue({
        records: [
          {
            id: 'role1',
            roleName: 'roleName1'
          },
          {
            id: 'role2',
            roleName: 'roleName2'
          },
          {
            id: 'role3',
            roleName: 'roleName3'
          }
        ]
      });

      serviceContext.dal.authGroup.getAuthGroups.mockReturnValue({
        records: [
          {
            id: 'group1',
            name: 'groupName1',
            roleId: 'role1'
          },
          {
            id: 'group2',
            name: 'groupName2',
            roleId: 'role2'
          }
        ]
      });

      serviceContext.dal.authGroup.createAuthGroup.mockReturnValue({
        id: 'group3',
        name: 'groupName3',
        roleId: 'role3'
      });
      const result = await rbacBll.checkAndCreateAuthGroupsForAppRoles(
        serviceContext,
        org,
        orgGuid,
        applicationId
      );
      expect(result.error).toBeUndefined();
      expect(result.success).toEqual(true);
      expect(result.authGroups.length).toEqual(1);
      expect(result.authGroups).toEqual([
        {
          id: 'group3',
          name: 'groupName3',
          roleId: 'role3'
        }
      ]);
    });

    it('create a new group - without permisison set - superadmin', async () => {
      org = {
        id: 1234,
        name: 'test org'
      };
      serviceContext.dal.application.getApplications.mockReturnValue({
        records: [
          {
            applicationId: 'appId1',
            applicationName: 'appName1'
          }
        ]
      });
      serviceContext.dal.role.getRoles.mockReturnValue({
        records: [
          {
            id: 'role1',
            roleName: 'roleName1'
          },
          {
            id: 'role2',
            roleName: 'roleName2'
          },
          {
            id: 'role3',
            roleName: 'roleName3'
          }
        ]
      });

      serviceContext.dal.authGroup.getAuthGroups.mockReturnValue({
        records: [
          {
            id: 'group1',
            name: 'groupName1',
            roleId: 'role1'
          },
          {
            id: 'group2',
            name: 'groupName2',
            roleId: 'role2'
          }
        ]
      });

      serviceContext.dal.authGroup.createAuthGroup.mockImplementationOnce(
        (options) => {
          expect(options.orgGuid).toEqual(orgGuid);
          return Promise.resolve({
            id: 'group3',
            name: 'groupName3',
            roleId: 'role3'
          });
        }
      );
      const result = await rbacBll.checkAndCreateAuthGroupsForAppRoles(
        ctx,
        org,
        orgGuid
      );
      expect(result.error).toBeUndefined();
      expect(result.success).toEqual(true);
      expect(result.authGroups.length).toEqual(1);
      expect(result.authGroups).toEqual([
        {
          id: 'group3',
          name: 'groupName3',
          roleId: 'role3'
        }
      ]);
    });

    it('create a new group - with permisison set - superadmin', async () => {
      org = {
        id: '1234',
        organizationId: '1234',
        name: 'test org',
        organizationGuid: orgGuid
      };
      _.set(serviceContext, '_authInfo.organization', org);
      serviceContext.dal.application.getApplications.mockReturnValue({
        records: [
          {
            applicationId: 'appId1',
            applicationName: 'appName1'
          }
        ]
      });
      serviceContext.dal.role.getRoles.mockReturnValue({
        records: [
          {
            id: 'role1',
            roleName: 'roleName1'
          },
          {
            id: 'role2',
            roleName: 'roleName2'
          },
          {
            id: 'role3',
            roleName: 'roleName3',
            permissions: [0, 0, 0, 33554432]
          }
        ]
      });

      serviceContext.dal.authGroup.getAuthGroups.mockReturnValue({
        records: [
          {
            id: 'group1',
            name: 'groupName1',
            roleId: 'role1'
          },
          {
            id: 'group2',
            name: 'groupName2',
            roleId: 'role2'
          }
        ]
      });

      serviceContext.dal.authGroup.createAuthGroup.mockImplementationOnce(
        (options) => {
          expect(options.orgGuid).toEqual(orgGuid);
          return Promise.resolve({
            id: 'group3',
            name: 'groupName3',
            roleId: 'role3'
          });
        }
      );

      serviceContext.dal.authPermissionDal.createAuthPermissionSet.mockImplementationOnce(
        (options) => {
          expect(options.organizationGuid).toEqual(orgGuid);
          return Promise.resolve({
            id: 'permission_set_id_3',
            name: 'permission_set_name_3'
          });
        }
      );
      const result = await rbacBll.checkAndCreateAuthGroupsForAppRoles(
        ctx,
        org,
        orgGuid
      );
      expect(result.error).toBeUndefined();
      expect(result.success).toEqual(true);
      expect(
        serviceContext.dal.authGroup.createAuthGroup
      ).toHaveBeenCalledTimes(1);
      expect(
        serviceContext.dal.authPermissionDal.createAuthPermissionSet
      ).toHaveBeenCalledTimes(1);
      expect(result.authGroups.length).toEqual(1);
      expect(result.authGroups).toEqual([
        {
          id: 'group3',
          name: 'groupName3',
          roleId: 'role3'
        }
      ]);
    });
  });

  describe('_restrictContextOrganization', () => {
    it('should throw error if missing organizationGuid', async () => {
      const regularUserCtx = mockUtil.makeContext({ authRole: 'regularUser' });
      applicationDal.getAppIdFromOrgId.mockReturnValueOnce(null);
      await expect(async () =>
        rbacBll._restrictContextOrganization(regularUserCtx)
      ).rejects.toThrow({
        message: 'Unable to get organizationGuid'
      });
      expect(applicationDal.getAppIdFromOrgId).toHaveBeenCalled();
      expect(
        serviceContext.dal.organization.getOrgIdFromAppId
      ).not.toHaveBeenCalled();
    });
    it('should throw error if missing organizationGuid - internalToken', async () => {
      await expect(async () =>
        rbacBll._restrictContextOrganization(internalTokenContext, {
          allowInternalToken: false
        })
      ).rejects.toThrow({
        message: 'Unable to get organizationGuid'
      });
      expect(applicationDal.getAppIdFromOrgId).not.toHaveBeenCalled();
      expect(
        serviceContext.dal.organization.getOrgIdFromAppId
      ).not.toHaveBeenCalled();
    });

    it('should throw error if a non-superadmin tries to get access to other organizations using the ownerOrganization field', async () => {
      await expect(async () =>
        rbacBll._restrictContextOrganization(regularUserContext, {
          ownerOrganization: ORG_GUID_OF_OWNER_ORG
        })
      ).rejects.toThrow({
        message: 'Access to field ownerOrganization requires superadmin rights'
      });
    });
    it('should return a restriction result for non-superadmin', async () => {
      serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(
        ORG_ID
      );
      let result, err;
      try {
        result = await rbacBll._restrictContextOrganization(regularUserContext);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(result.organizationId).toEqual(ORG_ID);
      expect(result.organizationGuid).toEqual(ORG_GUID);
      expect(
        serviceContext.dal.organization.getOrgIdFromAppId
      ).toHaveBeenCalledWith(ORG_GUID);
    });
    it('should return a restriction result for non-superadmin, without orgGuid', async () => {
      serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
        ORG_GUID
      );
      serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(
        ORG_ID
      );
      let result, err;

      const withoutOrgGuidCtx = mockUtil.makeContext({
        authRole: 'regularUser'
      });
      _.set(withoutOrgGuidCtx, '_authInfo.applicationId', undefined);
      _.set(
        withoutOrgGuidCtx,
        '_authInfo.organization.organizationGuid',
        undefined
      );
      _.set(withoutOrgGuidCtx, '_authInfo.organization.organizationId', ORG_ID);
      try {
        result = await rbacBll._restrictContextOrganization(withoutOrgGuidCtx);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(result.organizationId).toEqual(ORG_ID);
      expect(result.organizationGuid).toEqual(ORG_GUID);
      expect(
        serviceContext.dal.organization.getOrgIdFromAppId
      ).toHaveBeenCalledWith(ORG_GUID);
      expect(
        serviceContext.dal.application.getAppIdFromOrgId
      ).toHaveBeenCalledWith(ORG_ID);
    });
    it('should return a restriction result for internalToken - allowInternal option', async () => {
      let result, err;
      try {
        result = await rbacBll._restrictContextOrganization(
          internalTokenContext,
          {
            allowInternalToken: true
          }
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(result.organizationId).toBeUndefined();
      expect(result.organizationGuid).toBeUndefined();
      expect(
        serviceContext.dal.organization.getOrgIdFromAppId
      ).not.toHaveBeenCalled();
      expect(applicationDal.getAppIdFromOrgId).not.toHaveBeenCalled();
    });
    it.each(['internal token', 'superadmin'])(
      'should return a restriction result for %s - ownerOrganization is UUID',
      async (tokenType) => {
        const isInternalToken = tokenType === 'internal token';
        const ctxByTokenType = isInternalToken ? internalTokenContext : ctx;
        serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(
          OWNER_ORG_ID
        );
        let result, err;
        try {
          result = await rbacBll._restrictContextOrganization(ctxByTokenType, {
            ownerOrganization: ORG_GUID_OF_OWNER_ORG
          });
        } catch (error) {
          err = error;
        }
        expect(err).toBeUndefined();
        expect(result).toBeDefined();
        expect(result.organizationId).toEqual(OWNER_ORG_ID);
        expect(result.organizationGuid).toEqual(ORG_GUID_OF_OWNER_ORG);
        expect(
          serviceContext.dal.organization.getOrgIdFromAppId
        ).toHaveBeenCalledWith(ORG_GUID_OF_OWNER_ORG);
      }
    );
    it.each(['internal token', 'superadmin'])(
      'should return a restriction result for %s - ownerOrganization is number ID',
      async (tokenType) => {
        const isInternalToken = tokenType === 'internal token';
        const ctxByTokenType = isInternalToken ? internalTokenContext : ctx;
        applicationDal.getAppIdFromOrgId.mockResolvedValue(
          ORG_GUID_OF_OWNER_ORG
        );
        serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(
          OWNER_ORG_ID
        );
        let result, err;
        try {
          result = await rbacBll._restrictContextOrganization(ctxByTokenType, {
            ownerOrganization: OWNER_ORG_ID
          });
        } catch (error) {
          err = error;
        }
        expect(err).toBeUndefined();
        expect(result).toBeDefined();
        expect(result.organizationId).toEqual(OWNER_ORG_ID);
        expect(result.organizationGuid).toEqual(ORG_GUID_OF_OWNER_ORG);
        expect(applicationDal.getAppIdFromOrgId).toHaveBeenCalledWith(
          OWNER_ORG_ID
        );
        expect(
          serviceContext.dal.organization.getOrgIdFromAppId
        ).toHaveBeenCalledWith(ORG_GUID_OF_OWNER_ORG);
      }
    );
  });

  describe('#deleteAppRoleAuthObjectsTx', () => {
    it.each([
      {
        roleIds: ['role-id'],
        title: 'missing DB clients'
      },
      {
        roleIds: [],
        title: 'roleIds is required.',
        options: { ssoDbClient: {}, coreDbClient: {} }
      },
      {
        roleIds: ['role-id'],
        options: { ssoDbClient: {}, coreDbClient: {} },
        title: 'organizationId and organizationGuid are required.'
      }
    ])(
      'should throw error if input is invalid: $title',
      async ({ roleIds, options, title }) => {
        await expect(async () =>
          rbacBll.deleteAppRoleAuthObjectsTx(roleIds, options)
        ).rejects.toThrow(title);
      }
    );

    it('should delete objects related to the app role', async () => {
      const ssoDbClient = {
        map: jest.fn(),
        any: jest.fn(),
        none: jest.fn()
      };

      const coreDbClient = {
        none: jest.fn()
      };

      // select appRole auth groups and permission sets
      ssoDbClient.map.mockImplementationOnce((sql, params) => {
        expect(sql).toContain('rbac_auth_group');
        expect(params[0]).toEqual(['role-id']);
        expect(params[1]).toEqual(ORG_GUID);
        return Promise.resolve(['ag_1']);
      });
      ssoDbClient.map.mockImplementationOnce((sql, params) => {
        expect(sql).toContain('rbac_permission_set');
        expect(params[0]).toEqual(['role-id']);
        expect(params[1]).toEqual(ORG_GUID);
        return Promise.resolve(['ps_1']);
      });

      // delete ACEs related appRole auth groups
      ssoDbClient.any.mockImplementationOnce((sql, params) => {
        expect(sql).toContain(
          'DELETE FROM public.rbac_acl WHERE auth_group_id'
        );
        expect(params[0]).toEqual(['ag_1']);
        return Promise.resolve([
          {
            permission_set_id: 'ps_2',
            auth_group_id: 'ag_1',
            object_type: 'recording',
            id_text: 'tdoID'
          }
        ]);
      });
      ssoDbClient.map.mockImplementationOnce((sql, params) => {
        expect(sql).toContain('DELETE FROM public.rbac_auth_group_member');
        expect(sql).toContain('RETURNING member_id AS id');
        expect(params[0]).toEqual(['ag_1']);
        return Promise.resolve([{ id: 'user_1' }]);
      });
      ssoDbClient.none.mockImplementationOnce((sql, params) => {
        expect(sql).toContain(
          'DELETE FROM public.organization_registration_domain_settings'
        );
        expect(params[0]).toEqual(['ag_1']);
        return Promise.resolve();
      });

      // delete ACEs related appRole permission sets
      ssoDbClient.any.mockImplementationOnce((sql, params) => {
        expect(sql).toContain(
          'DELETE FROM public.rbac_acl WHERE permission_set_id'
        );
        expect(params[0]).toEqual(['ps_1']);
        return Promise.resolve([
          {
            permission_set_id: 'ps_1',
            auth_group_id: 'ag_2',
            object_type: 'folder',
            id_text: 'folderId'
          }
        ]);
      });

      // delete appRole AG(s) and PS(s).
      ssoDbClient.none.mockImplementationOnce((sql, params) => {
        expect(sql).toContain('DELETE FROM public.rbac_auth_group');
        expect(params[0]).toEqual(['ag_1']);
        return Promise.resolve();
      });
      ssoDbClient.none.mockImplementationOnce((sql, params) => {
        expect(sql).toContain('DELETE FROM public.rbac_permission_set');
        expect(params[0]).toEqual(['ps_1']);
        return Promise.resolve();
      });

      // mark the dirty cache
      mockImplementation_invalidateAnyPermissionSetRelatedCaches(
        serviceContext,
        { orgId: ORG_ID }
      );
      mockImplementation_invalidateAnyAuthGroupRelatedCaches(
        serviceContext,
        [
          {
            memberType: 'user',
            id: 'user_1'
          }
        ],
        { orgId: ORG_ID }
      );

      await rbacBll.deleteAppRoleAuthObjectsTx(['role-id'], {
        ssoDbClient,
        coreDbClient,
        organizationId: ORG_ID,
        organizationGuid: ORG_GUID
      });

      expect(authACEDal.deleteAclsFromJoinTables).toHaveBeenCalledWith(
        'TDO',
        expect.arrayContaining([
          {
            permission_set_id: 'ps_2',
            auth_group_id: 'ag_1',
            object_type: 'recording',
            id_text: 'tdoID'
          }
        ]),
        coreDbClient
      );

      expect(
        serviceContext.dal.authPermissionDal
          .markCacheDirtyForGetAuthPermissionSets
      ).toHaveBeenCalledWith(ORG_GUID);
      expect_invalidateAnyPermissionSetRelatedCaches(serviceContext, {
        noExpectMarkCacheDirty: true
      });
      expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
        noExpectMarkCacheDirty: true,
        members: [
          {
            memberType: 'user',
            id: 'user_1'
          }
        ]
      });
      expect(serviceContext.redisCache.markCacheDirty).toHaveBeenCalledTimes(2);
    });
  });

  describe('_createDefaultUserAuthGroups', () => {
    const buildUserMember = (id, user = {}) => ({
      id,
      memberType: 'User',
      member: {
        id,
        userId: id,
        jsondata: {
          firstName: 'Test',
          lastName: 'User'
        },
        ...user
      }
    });
    it('should throw error if missing organizationGuid', async () => {
      applicationDal.getAppIdFromOrgId.mockReturnValueOnce(null);
      await expect(async () =>
        rbacBll._createDefaultUserAuthGroups(superAdminContext)
      ).rejects.toThrow({
        message: 'Unable to get organizationGuid'
      });
    });

    it('should throw error if invalid users', async () => {
      applicationDal.getAppIdFromOrgId.mockReturnValueOnce(null);
      await expect(async () =>
        rbacBll._createDefaultUserAuthGroups(superAdminContext, ORG_GUID, {})
      ).rejects.toThrow({
        message: 'users must be an array of users'
      });
    });

    it('should do nothing if users is empty', async () => {
      applicationDal.getAppIdFromOrgId.mockReturnValueOnce(null);
      const privateGroupMap = await rbacBll._createDefaultUserAuthGroups(
        superAdminContext,
        ORG_GUID,
        []
      );
      expect(privateGroupMap.size).toEqual(0);
      expect(authGroupDal.createAuthGroup).not.toHaveBeenCalled();
      expect(authGroupDal.addMembersToAuthGroup).not.toHaveBeenCalled();
    });

    it('should do nothing if all default private AG exist', async () => {
      authGroupDal.getUserPrivateAuthGroup.mockResolvedValueOnce({
        id: 'auth-group-id-1',
        authClass: 'User'
      });
      authGroupDal.getUserPrivateAuthGroup.mockResolvedValueOnce({
        id: 'auth-group-id-2',
        authClass: 'User'
      });
      const mockUserMembers = [
        buildUserMember(USER_ID),
        buildUserMember('use-id-2')
      ];
      await rbacBll._createDefaultUserAuthGroups(
        superAdminContext,
        ORG_GUID,
        mockUserMembers
      );
      expect(authGroupDal.getUserPrivateAuthGroup).toHaveBeenCalledTimes(
        mockUserMembers.length
      );
      expect(authGroupDal.createAuthGroup).not.toHaveBeenCalled();
      expect(authGroupDal.addMembersToAuthGroup).not.toHaveBeenCalled();
      expect(authGroupDal.getAuthGroupsContainingMember).not.toHaveBeenCalled();
    });

    it('should create default private AG and assign user to their groups', async () => {
      authGroupDal.getUserPrivateAuthGroup.mockResolvedValueOnce(null);
      authGroupDal.createAuthGroup.mockResolvedValueOnce({
        id: 'auth-group-id-1',
        authClass: 'User'
      });
      authGroupDal.getUserPrivateAuthGroup.mockResolvedValueOnce({
        id: 'auth-group-id-2',
        authClass: 'User'
      });
      serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(ORG_ID);
      const mockUserMembers = [
        buildUserMember(USER_ID),
        buildUserMember('use-id-2')
      ];
      const privateGroupMap = await rbacBll._createDefaultUserAuthGroups(
        superAdminContext,
        ORG_GUID,
        mockUserMembers
      );
      expect(privateGroupMap.size).toEqual(mockUserMembers.length);
      expect(authGroupDal.createAuthGroup).toHaveBeenCalledTimes(1);
      expect(authGroupDal.addMembersToAuthGroup).toHaveBeenCalledTimes(1);
      expect(authGroupDal.addMembersToAuthGroup).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        [{ id: USER_ID, memberType: 'User' }]
      );
      expect(authGroupDal.getAuthGroupsContainingMember).toHaveBeenCalledWith(
        superAdminContext._authInfo.userId,
        { orgGuid: ORG_GUID }
      );
      expect(serviceContext.messageUtil._counter()).toEqual(3);
      expect_invalidateAnyAuthGroupRelatedCaches(serviceContext, {
        members: [{ id: USER_ID, memberType: 'User' }],
        ignoreACEHasPermissionMarkDirty: true,
        ignoreACLForResourcesMarkDirty: true,
      });
      expect(serviceContext.messageUtil._messages()).toContainEqual(
        expect.objectContaining({
          type: 'session',
          event: 'reload_session_users',
          userIds: [USER_ID],
          organizationGuid: ORG_GUID
        })
      );
      expect(serviceContext.messageUtil._messages()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'auth_group_create',
            type: 'olp',
            serviceName: 'core-graphql-server',
            authGroupId: 'auth-group-id-1',
            isPrivateUserAuthGroup: true,
            success: true,
            user: expect.objectContaining({
              memberId: USER_ID,
              memberType: 'User',
              userId: USER_ID,
              firstName: 'Test',
              lastName: 'User'
            })
          }),
          expect.objectContaining({
            event: 'auth_group_member_add',
            type: 'olp',
            serviceName: 'core-graphql-server',
            authGroupId: 'auth-group-id-1',
            success: true,
            users: [
              expect.objectContaining({
                memberId: USER_ID,
                memberType: 'User',
                userId: USER_ID,
                firstName: 'Test',
                lastName: 'User'
              })
            ]
          }),
          expect.objectContaining({
            type: 'session',
            event: 'reload_session_users',
            userIds: [USER_ID],
            organizationGuid: ORG_GUID
          })
        ])
      );
    });

    it('should emit failure audit when default private AG creation fails', async () => {
      const createError = new Error('forced private auth group create failure');

      authGroupDal.getUserPrivateAuthGroup.mockResolvedValueOnce(null);
      authGroupDal.createAuthGroup.mockRejectedValueOnce(createError);

      const mockUserMembers = [
        buildUserMember(USER_ID)
      ];

      await expect(
        rbacBll._createDefaultUserAuthGroups(
          superAdminContext,
          ORG_GUID,
          mockUserMembers
        )
      ).rejects.toThrow('forced private auth group create failure');

      expect(authGroupDal.getUserPrivateAuthGroup).toHaveBeenCalledWith(
        ORG_GUID,
        USER_ID
      );

      expect(authGroupDal.createAuthGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          name: `Default Private Group for User ${USER_ID}`,
          description: `This group is created as the default group for User: ${USER_ID}`,
          orgGuid: ORG_GUID,
          userId: superAdminContext._authInfo.userId,
          isProtected: true,
          authClass: 'User',
          audit: {
            isPrivateUserAuthGroup: true,
            users: [
              expect.objectContaining({
                memberId: USER_ID,
                memberType: 'user',
                userId: USER_ID,
                firstName: 'Test',
                lastName: 'User'
              })
            ]
          }
        })
      );

      expect(authGroupDal.addMembersToAuthGroup).not.toHaveBeenCalled();
      expect(authGroupDal.markCacheDirtyForGetAuthGroups).not.toHaveBeenCalled();
      expect(serviceContext.redisCache.markCacheDirty).not.toHaveBeenCalled();

      const messages = serviceContext.messageUtil._messages();

      expect(messages).toContainEqual(
        expect.objectContaining({
          event: 'auth_group_create',
          type: 'olp',
          serviceName: 'core-graphql-server',
          isPrivateUserAuthGroup: true,
          success: false,
          user: expect.objectContaining({
            memberId: USER_ID,
            memberType: 'User',
            userId: USER_ID,
            firstName: 'Test',
            lastName: 'User'
          })
        })
      );

      expect(
        messages.find((message) => message.event === 'auth_group_member_add')
      ).toBeUndefined();

      expect(
        messages.find((message) => message.event === 'reload_session_users')
      ).toBeUndefined();
    });
  });

  describe('useRBACFeatureForResourceType', () => {
    let context;
    let rbacBll1, serviceContext1;
    let ORG_ID = 1;
    beforeAll(() => {
      serviceContext1 = createServiceContext();
      serviceContext1.dal.organization = {
        getOrgIdFromAppId: jest.fn(),
        getOrganization: jest.fn()
      };
      serviceContext1.redisCache.markCacheDirty = jest.fn();

      rbacBll1 = require('./rbacAuth.bll.js')(serviceContext1);
    });

    it('should return false when orgObject is missing', async () => {
      const result = await rbacBll1.useRBACFeatureForResourceType(
        context,
        null,
        'SDO'
      );
      expect(result).toBe(false);
      expect(serviceContext.dal.organization.getOrganization).not.toHaveBeenCalled();
    });

    it('should return false when resourceType is missing', async () => {
      const orgObject = {
        organizationId: ORG_ID,
        organizationGuid: ORG_GUID
      };

      const result = await rbacBll1.useRBACFeatureForResourceType(
        context,
        orgObject,
        null
      );
      expect(result).toBe(false);
      expect(serviceContext.dal.organization.getOrganization).not.toHaveBeenCalled();
    });

    it('should return true for non-SDO resource types without checking features', async () => {
      const orgObject = {
        organizationId: ORG_ID,
        organizationGuid: ORG_GUID
      };

      const result = await rbacBll1.useRBACFeatureForResourceType(
        context,
        orgObject,
        'Folder'
      );
      expect(result).toBe(true);
      expect(serviceContext.dal.organization.getOrganization).not.toHaveBeenCalled();
    });

    it.each(['SDO', 'SDOSchema'])('should return true when RBAC for %s is enabled', async (resourceType) => {
      const orgObject = {
        organizationId: ORG_ID,
        organizationGuid: ORG_GUID,
        kvp: {
          features: {
            enableRBACFeature: 'enabled',
            enableRBACFeatureForSDO: 'enabled'
          }
        }
      };

      const result = await rbacBll1.useRBACFeatureForResourceType(
        context,
        orgObject,
        resourceType
      );

      expect(result).toBe(true);
      // orgObject has kvp.features, so no need to call getOrganization
      expect(serviceContext.dal.organization.getOrganization).not.toHaveBeenCalled();
    });

    it.each(['SDO', 'SDOSchema'])('should return true when RBAC for %s is disabled', async (resourceType) => {
      const orgObject = {
        organizationId: ORG_ID,
        organizationGuid: ORG_GUID
      };

      // getOrg
      serviceContext1.dal.organization.getOrganization.mockReturnValue({
        id: ORG_ID,
        organizationGuid: ORG_GUID,
        kvp: {
          features: {
            enableRBACFeature: 'enabled',
            enableRBACFeatureForSDO: 'disabled'
          }
        }
      });

      const result = await rbacBll1.useRBACFeatureForResourceType(
        context,
        orgObject,
        resourceType
      );

      expect(result).toBe(false);
      // Should call getOrganization to fetch kvp.features
      expect(serviceContext1.dal.organization.getOrganization).toHaveBeenCalled();
    });
  });
});
