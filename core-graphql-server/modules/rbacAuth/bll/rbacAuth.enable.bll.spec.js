const _ = require('lodash');
const error = require('../../../error/index.js')();
const mockUtil = require('../../../test/mockUtil.js')();
const serviceContext = require('../../../test/serviceContext.mock.js')();
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
  asyncClear: jest.fn()
};
_.set(serviceContext, 'config.featureFlags.enableRBACFeature', true);
describe('authEnforcementEnable', () => {
  const ORG_GUID = '38e940c0-bfad-413f-b2f7-2acc6b497732';
  const ORG_ID = 1;
  const authGroupDal = {
    getAuthGroups: jest.fn(),
    createAuthGroup: jest.fn(),
    markCacheDirtyForGetAuthGroups: jest.fn(),
    getAuthGroupsContainingMember: jest.fn(),
    getUserPrivateAuthGroup: jest.fn()
  };
  const authPermissionDal = {
    createAuthPermissionSet: jest.fn(),
    getAuthPermissionSets: jest.fn(),
    markCacheDirtyForGetAuthPermissionSets: jest.fn()
  };

  const adminDal = {
    getUsers: jest.fn(),
    getOrganizationGuidsForUser: jest.fn()
  };

  const dalFolder = {
    getOrCreateOrgRootFolder: jest.fn(),
    getObjectIdsFromOpaqueIds: jest.fn(),
    getUserRootFolders: jest.fn(),
  };

  const dalFolderV2 = {
    getUserRootFolders: jest.fn(),
  };

  const organizationDal = {
    getOrgIdFromAppId: jest.fn(),
    getOrganization: jest.fn(),
    updateOrganizationKvp: jest.fn()
  };

  const authACEDal = {
    hasPermissions: jest.fn(),
    addACEsToResources: jest.fn(),
    addMembersToAuthGroup: jest.fn(),
    getACLForResources: jest.fn(),
    markCacheDirtyForGetACLForResources: jest.fn(),
    markCacheDirtyForHasPermissions: jest.fn()
  };

  const applicationDal = {
    getAppIdFromOrgId: jest.fn()
  };

  const userDal = {
    getDefaultOrgAdminUser: jest.fn()
  };

  const dalSDO = {
    getSchemas: jest.fn()
  };

  serviceContext.dal.authGroup = authGroupDal;
  serviceContext.dal.authPermissionDal = authPermissionDal;
  serviceContext.dal.admin = adminDal;
  serviceContext.dal.authAce = authACEDal;
  serviceContext.dal.folder = dalFolder;
  serviceContext.dal.folderV2 = dalFolderV2;
  serviceContext.dal.organization = organizationDal;
  serviceContext.dal.application = applicationDal;
  serviceContext.dal.user = userDal;
  serviceContext.dal.structuredData = dalSDO;

  let context;
  let internalTokenContext;
  let args = {
    input: {
      ownerOrganization: ORG_GUID,
      enable: true
    }
  };

  const rbacBll = require('./rbacAuth.bll.js')(serviceContext);

  function mockImplementation_invalidateAnyPermissionSetRelatedCaches(
    serviceContxt
  ) {
    serviceContxt.dal.organization.getOrgIdFromAppId.mockResolvedValue(ORG_ID);
    serviceContxt.redisCache.markCacheDirty.mockImplementation((key) => {
      expect(key).toMatch(new RegExp(`organization_permissions:${ORG_ID}`));
      return Promise.resolve();
    });
  }
  beforeEach(() => {
    jest.resetAllMocks();
    context = mockUtil.makeContext();
    _.set(context._authInfo, 'organization.organizationGuid', '---orgGuid---');
    _.set(context._authInfo, 'organization.organizationId', 7682);
    // default permission set configs
    _.set(context, 'config.rbac.defaultPolicies', {
      authGroups: [
        {
          name: 'orgAdmin',
          suffix: 'Administrators',
          defaultGroup: 'orgAdmin'
        },
        { name: 'orgAllAccess', suffix: 'Users', defaultGroup: 'orgAllAccess' }
      ],
      permissionSets: [
        { name: 'ps_admin_org' },
        { name: 'ps_admin_resource' },
        { name: 'ps_orgall_org' },
        { name: 'ps_orgall_resource' }
      ],
      policies: [
        {
          authGroupName: 'orgAdmin',
          permissionSetName: 'ps_admin_org',
          scope: 'Organization'
        },
        {
          authGroupName: 'orgAdmin',
          permissionSetName: 'ps_admin_resource',
          scope: 'Resource'
        },
        {
          authGroupName: 'orgAdmin',
          permissionSetName: 'ps_admin_resource',
          scope: 'RootFolder'
        },
        {
          authGroupName: 'orgAllAccess',
          permissionSetName: 'ps_orgall_org',
          scope: 'Organization'
        },
        {
          authGroupName: 'orgAllAccess',
          permissionSetName: 'ps_orgall_resource',
          scope: 'Resource'
        },
        {
          authGroupName: 'orgAllAccess',
          permissionSetName: 'ps_orgall_resource',
          scope: 'RootFolder'
        }
      ]
    });
    internalTokenContext = mockUtil.makeContext({ authType: 'api_internal' });
    _.set(
      internalTokenContext,
      'config.rbac.defaultPolicies',
      _.get(context, 'config.rbac.defaultPolicies', {})
    );
  });

  describe('_createDefaultAuthGroups', () => {
    const ctx = {
      _authInfo: {
        organization: { organizationGuid: ORG_GUID },
        permissionMasks: [-2, 268435455, 1073742335, 8335347], // superadmin
      },
      config: {
        rbac: {
          defaultPolicies: {
            authGroups: [
              { name: 'orgAdmin', defaultGroup: 'orgAdmin' },
              { name: 'orgAllAccess', defaultGroup: 'orgAllAccess' }
            ]
          }
        }
      }
    };
    it('do nothing if no defaultPolicyGroups', async () => {
      const r = await rbacBll._createDefaultAuthGroups(
        {},
        {
          kvp: {
            defaultAuthGroups: [
              {
                id: '----orgAdmin----',
                name: 'orgAdmin',
                defaultGroup: 'orgAdmin'
              }
            ]
          }
        },
        ORG_GUID
      );
      expect(r.existingGroups).toEqual([
        {
          id: '----orgAdmin----',
          name: 'orgAdmin',
          defaultGroup: 'orgAdmin'
        }
      ]);
      expect(r.defaultAuthGroups).toEqual([]);
      expect(r.hasNewGroups).toEqual(false);
    });
    it('should get groups already tracked in org.kvp.defaultAuthGroups', async () => {
      const r = await rbacBll._createDefaultAuthGroups(
        ctx,
        {
          kvp: {
            defaultAuthGroups: [
              { id: 'auth_group_1', name: 'orgAdmin', defaultGroup: 'orgAdmin' },
              { id: 'auth_group_2', name: 'orgAllAccess', defaultGroup: 'orgAllAccess' }
            ]
          }
        },
        ORG_GUID
      );
      expect(r.existingGroups).toEqual([
        { id: 'auth_group_1', name: 'orgAdmin', defaultGroup: 'orgAdmin' },
        { id: 'auth_group_2', name: 'orgAllAccess', defaultGroup: 'orgAllAccess' }
      ]);
      expect(r.defaultAuthGroups).toEqual([]);
      expect(r.hasNewGroups).toEqual(false);
      expect(authGroupDal.createAuthGroup).not.toHaveBeenCalled();
      expect(authGroupDal.getAuthGroups).not.toHaveBeenCalled();
    });
    it('should create the groups from the default policy', async () => {
      authGroupDal.createAuthGroup.mockImplementation((options) => {
        return { id: 'auth_group_2', name: options.name };
      });
      // _invalidateAnyAuthGroupRelatedCaches
      serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(ORG_ID);
      const r = await rbacBll._createDefaultAuthGroups(
        ctx,
        {
          name: 'org-test',
          kvp: {
            defaultAuthGroups: [
              { id: 'auth_group_1', name: 'orgAdmin', defaultGroup: 'orgAdmin' },
              // missing orgAllAccess
            ]
          }
        },
        ORG_GUID
      );
      expect(r.existingGroups).toEqual([
        { id: 'auth_group_1', name: 'orgAdmin', defaultGroup: 'orgAdmin' }
      ]);
      expect(r.defaultAuthGroups).toEqual([
        {
          id: 'auth_group_2',
          name: 'org-test orgAllAccess',
          defaultGroup: 'orgAllAccess'
        }
      ]);
      expect(r.hasNewGroups).toEqual(true);
      expect(authGroupDal.createAuthGroup).toHaveBeenCalledTimes(1);
      expect(authGroupDal.getAuthGroups).not.toHaveBeenCalled();
    });
    it('should handle auth groups conflicts since org.kvp.defaultAuthGroups is empty', async () => {
      authGroupDal.createAuthGroup.mockImplementation(() =>
        Promise.reject(new error.ResourceConflict('error'))
      );
      authGroupDal.getAuthGroups.mockResolvedValueOnce({
        records: [
          {
            id: 'auth_group_1',
            organizationId: ORG_GUID
          }
        ]
      });
      authGroupDal.getAuthGroups.mockResolvedValueOnce({
        records: [
          {
            id: 'auth_group_2',
            organizationId: ORG_GUID
          }
        ]
      });
      const r = await rbacBll._createDefaultAuthGroups(
        ctx,
        {
          name: 'org-test',
          kvp: {
            defaultAuthGroups: []
          }
        },
        ORG_GUID
      );
      expect(r.existingGroups).toEqual([]);
      expect(r.defaultAuthGroups).toEqual([
        {
          id: 'auth_group_1',
          organizationId: ORG_GUID,
          defaultGroup: 'orgAdmin'
        },
        {
          id: 'auth_group_2',
          organizationId: ORG_GUID,
          defaultGroup: 'orgAllAccess'
        }
      ]);
      expect(r.hasNewGroups).toEqual(false);
      expect(authGroupDal.createAuthGroup).toHaveBeenCalledTimes(2);
      expect(authGroupDal.getAuthGroups).toHaveBeenCalledTimes(2);
    });
  });

  describe('_createDefaultPermissionSets', () => {
    it('create default permissions sets', async () => {
      // restrictContextOrganization
      serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
        ORG_GUID
      );
      serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(ORG_ID);

      // getAuthPermissionSets
      authPermissionDal.getAuthPermissionSets.mockResolvedValue([]);

      authPermissionDal.createAuthPermissionSet.mockImplementation((args) => {
        expect(args.isProtected).toEqual(true);
        return {
          id: args.name,
          name: args.name
        };
      });
      const r = await rbacBll._createDefaultPermissionSets(
        context,
        '_org_id',
        ORG_GUID
      );

      expect(r).toEqual([
        {
          id: 'ps_admin_org',
          name: 'ps_admin_org'
        },
        {
          id: 'ps_admin_resource',
          name: 'ps_admin_resource'
        },
        {
          id: 'ps_orgall_org',
          name: 'ps_orgall_org'
        },
        {
          id: 'ps_orgall_resource',
          name: 'ps_orgall_resource'
        }
      ]);
      expect(authPermissionDal.createAuthPermissionSet).toHaveBeenCalledTimes(
        4
      );
    });
    it('create default permissions sets - internalToken', async () => {
      // restrictContextOrganization
      serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
        ORG_GUID
      );
      serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(ORG_ID);

      // getAuthPermissionSets
      authPermissionDal.getAuthPermissionSets.mockResolvedValue([]);

      authPermissionDal.createAuthPermissionSet.mockImplementation((args) => {
        expect(args.isProtected).toEqual(true);
        return {
          id: args.name,
          name: args.name
        };
      });
      const r = await rbacBll._createDefaultPermissionSets(
        internalTokenContext,
        '_org_id',
        ORG_GUID
      );

      expect(r).toEqual([
        {
          id: 'ps_admin_org',
          name: 'ps_admin_org'
        },
        {
          id: 'ps_admin_resource',
          name: 'ps_admin_resource'
        },
        {
          id: 'ps_orgall_org',
          name: 'ps_orgall_org'
        },
        {
          id: 'ps_orgall_resource',
          name: 'ps_orgall_resource'
        }
      ]);
      expect(authPermissionDal.createAuthPermissionSet).toHaveBeenCalledTimes(
        4
      );
    });
    it('return existing default permissions sets', async () => {
      // restrictContextOrganization
      serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(
        ORG_GUID
      );
      serviceContext.dal.organization.getOrgIdFromAppId.mockReturnValue(ORG_ID);

      // getAuthPermissionSets
      authPermissionDal.getAuthPermissionSets.mockResolvedValue([
        {
          id: 'test',
          name: 'test'
        }
      ]);
      const r = await rbacBll._createDefaultPermissionSets(
        context,
        '_org_id',
        ORG_GUID
      );

      // based on context.permissionSets
      expect(r).toEqual([
        {
          id: 'test',
          name: 'test'
        },
        {
          id: 'test',
          name: 'test'
        },
        {
          id: 'test',
          name: 'test'
        },
        {
          id: 'test',
          name: 'test'
        }
      ]);
      expect(authPermissionDal.getAuthPermissionSets).toHaveBeenCalledTimes(
        4
      );
      expect(authPermissionDal.createAuthPermissionSet).not.toHaveBeenCalled();
    });
  });

  describe('_applyPermissionPolicy', () => {
    it('no policies', async () => {
      await rbacBll._applyPermissionPolicy({}, [], 'Organization', {});
      expect(authACEDal.addACEsToResources).not.toHaveBeenCalled();
    });
    it('resource policies', async () => {
      const g1 = {
        id: 'g1'
      };
      const g2 = {
        id: 'g2'
      };
      const p1 = {
        id: 'p1'
      };
      const p2 = {
        id: 'p2'
      };
      await rbacBll._applyPermissionPolicy(
        {},
        [
          {
            group: g1,
            permissionSet: p1
          },
          {
            group: g2,
            permissionSet: p2
          }
        ],
        'Resource',
        {}
      );
      expect(authACEDal.addACEsToResources).not.toHaveBeenCalled();
      expect(g1).toEqual({
        id: 'g1',
        permissionSets: {
          resourceRole: {
            id: 'p1'
          }
        }
      });
      expect(g2).toEqual({
        id: 'g2',
        permissionSets: {
          resourceRole: {
            id: 'p2'
          }
        }
      });
    });
    it('organization policies', async () => {
      const g1 = {
        id: 'g1'
      };
      const g2 = {
        id: 'g2'
      };
      const p1 = {
        id: 'p1'
      };
      const p2 = {
        id: 'p2'
      };
      mockImplementation_invalidateAnyPermissionSetRelatedCaches(
        serviceContext
      );
      await rbacBll._applyPermissionPolicy(
        {
          _authInfo: { userId: 'user_id' }
        },
        [
          {
            group: g1,
            permissionSet: p1
          },
          {
            group: g2,
            permissionSet: p2
          }
        ],
        'Organization',
        {
          orgId: 'org_id',
          orgGuid: ORG_GUID
        }
      );
      expect(authACEDal.addACEsToResources).toHaveBeenCalledTimes(1);
      expect(authACEDal.addACEsToResources).toHaveBeenCalledWith(
        {
          entries: [
            {
              member: {
                id: 'g1',
                memberType: 'group'
              },
              permissionSetID: 'p1'
            },
            {
              member: {
                id: 'g2',
                memberType: 'group'
              },
              permissionSetID: 'p2'
            }
          ],
          resourceType: 'Organization',
          ids: ['org_id'],
          organizationGuid: ORG_GUID,
          ownerOrganization: 'org_id',
          userId: 'user_id'
        },
        undefined
      );
    });
    it('root folder policies', async () => {
      const g1 = {
        id: 'g1'
      };
      const g2 = {
        id: 'g2'
      };
      const p1 = {
        id: 'p1'
      };
      const p2 = {
        id: 'p2'
      };
      dalFolder.getOrCreateOrgRootFolder.mockReturnValueOnce({
        id: 'cms_r_f_id'
      });
      dalFolder.getOrCreateOrgRootFolder.mockReturnValueOnce({
        id: 'resource_r_f_id'
      });
      mockImplementation_invalidateAnyPermissionSetRelatedCaches(
        serviceContext
      );
      // _invalidateAccessibleFolderCaches
      dalFolder.getObjectIdsFromOpaqueIds.mockImplementationOnce((ctx, ids) => {
        return ids.reduce((m, x) => {
          const folderId = `folder_id_for_${x}`;
          m.set(folderId, folderId);
          m.set(x, folderId);

          return m;
        }, new Map());
      });
      await rbacBll._applyPermissionPolicy(
        {
          _authInfo: { userId: 'user_id' }
        },
        [
          {
            group: g1,
            permissionSet: p1
          },
          {
            group: g2,
            permissionSet: p2
          }
        ],
        'RootFolder',
        {
          orgId: 'org_id',
          orgGuid: ORG_GUID
        }
      );
      expect(authACEDal.addACEsToResources).toHaveBeenCalledTimes(1);
      expect(authACEDal.addACEsToResources).toHaveBeenCalledWith(
        {
          entries: [
            {
              member: {
                id: 'g1',
                memberType: 'group'
              },
              permissionSetID: 'p1'
            },
            {
              member: {
                id: 'g2',
                memberType: 'group'
              },
              permissionSetID: 'p2'
            }
          ],
          resourceType: 'Folder',
          ids: ['cms_r_f_id', 'resource_r_f_id'],
          organizationGuid: ORG_GUID,
          ownerOrganization: 'org_id',
          userId: 'user_id'
        },
        undefined
      );
    });
    it('organization policies - internalToken', async () => {
      const g1 = {
        id: 'g1'
      };
      const g2 = {
        id: 'g2'
      };
      const p1 = {
        id: 'p1'
      };
      const p2 = {
        id: 'p2'
      };
      mockImplementation_invalidateAnyPermissionSetRelatedCaches(
        serviceContext
      );
      userDal.getDefaultOrgAdminUser.mockImplementation((option) => {
        expect(option.organizationId).toEqual(1);

        return Promise.resolve({ id: 'user_id' });
      });
      await rbacBll._applyPermissionPolicy(
        internalTokenContext,
        [
          {
            group: g1,
            permissionSet: p1
          },
          {
            group: g2,
            permissionSet: p2
          }
        ],
        'Organization',
        {
          orgId: 1,
          orgGuid: ORG_GUID
        }
      );
      expect(authACEDal.addACEsToResources).toHaveBeenCalledTimes(1);
      expect(authACEDal.addACEsToResources).toHaveBeenCalledWith(
        {
          entries: [
            {
              member: {
                id: 'g1',
                memberType: 'group'
              },
              permissionSetID: 'p1'
            },
            {
              member: {
                id: 'g2',
                memberType: 'group'
              },
              permissionSetID: 'p2'
            }
          ],
          resourceType: 'Organization',
          ids: [1],
          orgId: 1,
          organizationGuid: ORG_GUID,
          ownerOrganization: 1,
          userId: 'user_id'
        },
        undefined
      );
      expect(userDal.getDefaultOrgAdminUser).toHaveBeenCalled();
    });
  });

  it('return the existing', async () => {
    serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(
      'org_id'
    );

    serviceContext.dal.organization.getOrganization.mockResolvedValue({
      id: 7682,
      name: 'test-org',
      kvp: {
        defaultAuthGroups: [
          {
            id: 'auth_group_2',
            name: 'orgAllAccess',
            defaultGroup: 'orgAllAccess'
          },
          {
            id: 'auth_group_1',
            name: 'orgAdmin',
            defaultGroup: 'orgAdmin'
          }
        ]
      }
    });

    dalFolder.getOrCreateOrgRootFolder.mockReturnValue({
      id: '---folderId---'
    });
    const result = await rbacBll.authEnforcementEnable(context, args);

    expect(result).toEqual(
      expect.arrayContaining([
        {
          id: 'auth_group_1',
          name: 'orgAdmin',
          defaultGroup: 'orgAdmin'
        },
        {
          id: 'auth_group_2',
          name: 'orgAllAccess',
          defaultGroup: 'orgAllAccess'
        }
      ])
    );
    expect(authPermissionDal.createAuthPermissionSet).not.toHaveBeenCalled();
    expect(dalFolder.getOrCreateOrgRootFolder).not.toHaveBeenCalled();
    expect(authACEDal.addACEsToResources).not.toHaveBeenCalled();
  });

  it('return the existing with addDefaultACEsToResources', async () => {
    serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(
      7682
    );

    serviceContext.dal.organization.getOrganization.mockResolvedValue({
      id: 7682,
      name: 'test-org',
      kvp: {
        defaultAuthGroups: [
          {
            id: 'auth_group_2',
            name: 'orgAllAccess',
            defaultGroup: 'orgAllAccess',
            permissionSets: {
              organizationRole: {
                id: 'ps_admin_org',
                name: 'ps_admin_org'
              },
              resourceRole: {
                id: 'ps_admin_resource',
                name: 'ps_admin_resource'
              }
            },
          },
          {
            id: 'auth_group_1',
            name: 'orgAdmin',
            defaultGroup: 'orgAdmin'
          }
        ],
        features: {
          enableRBACFeature: 'enabled',
          enableRBACFeatureForSDO: 'enabled'
        }
      }
    });

    dalSDO.getSchemas.mockResolvedValueOnce({
      records: [
        {
          id: 'sdo_schema_id1'
        },
        {
          id: 'sdo_schema_id2'
        }
      ]
    });
    dalFolderV2.getUserRootFolders.mockResolvedValue([
      { folderId: 'folder-v2-1', rootFolderUserId: 'user-1' },
    ]);
    dalFolder.getUserRootFolders.mockResolvedValue([
      { folderId: 'folder-v1-1', rootFolderUserId: 'user-2' },
    ]);

    dalFolder.getOrCreateOrgRootFolder.mockReturnValue({
      id: '---folderId---'
    });
    const result = await rbacBll.authEnforcementEnable(context, args);

    expect(result).toEqual(
      expect.arrayContaining([
        {
          id: 'auth_group_1',
          name: 'orgAdmin',
          defaultGroup: 'orgAdmin'
        },
        {
          id: 'auth_group_2',
          name: 'orgAllAccess',
          defaultGroup: 'orgAllAccess',
          permissionSets: {
            organizationRole: {
              id: 'ps_admin_org',
              name: 'ps_admin_org'
            },
            resourceRole: {
              id: 'ps_admin_resource',
              name: 'ps_admin_resource'
            }
          },
        }
      ])
    );
    expect(authPermissionDal.createAuthPermissionSet).not.toHaveBeenCalled();
    expect(dalFolder.getOrCreateOrgRootFolder).not.toHaveBeenCalled();
    // 1  : schema SDO with [sdo_schema_id1, sdo_schema_id2]
    // +1 : v2 user root folder
    // +1 : v1 user root folder
    expect(authACEDal.addACEsToResources).toHaveBeenCalledTimes(3);
  });
  it('create authGroups, permissionSets and apply policies', async () => {
    authGroupDal.getAuthGroups.mockResolvedValue({
      records: [
        {
          organizationId: ORG_GUID
        }
      ]
    });
    serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(7682);
    serviceContext.dal.organization.getOrganization.mockResolvedValue({
      id: 7682,
      name: 'test-org',
      organizationGuid: ORG_GUID,
      kvp: {
        features: {
          enableRBACFeature: 'enabled',
          enableRBACFeatureForSDO: 'enabled'
        },
        defaultAuthGroupsExample: [
          {
            id: 'orgAllAccess',
            name: 'orgAllAccess'
          },
          {
            id: 'orgAdmin',
            name: 'orgAdmin'
          }
        ]
      }
    });

    // for orgAdmin group
    authGroupDal.createAuthGroup.mockImplementation((options) => {
      return { id: options.name, name: options.name };
    });
    // _createDefaultPermissionSets
    authPermissionDal.getAuthPermissionSets.mockResolvedValue([]);
    authPermissionDal.createAuthPermissionSet.mockImplementation((args) => {
      return { id: args.name, name: args.name };
    });
    // create root folder ACE
    dalFolder.getOrCreateOrgRootFolder.mockReturnValue({
      id: '---folderId---'
    });
    serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
    authACEDal.addACEsToResources.mockReturnValue({});
    // _invalidateAccessibleFolderCaches
    dalFolder.getObjectIdsFromOpaqueIds.mockImplementationOnce((ctx, ids) => {
      return ids.reduce((m, x) => {
        const folderId = `folder_id_for_${x}`;
        m.set(folderId, folderId);
        m.set(x, folderId);

        return m;
      }, new Map());
    });

    dalSDO.getSchemas.mockResolvedValueOnce({
      records: [
        {
          id: 'sdo_schema_id1'
        },
        {
          id: 'sdo_schema_id2'
        }
      ]
    });
    dalFolderV2.getUserRootFolders.mockResolvedValue([
      { folderId: 'folder-v2-1', rootFolderUserId: 'user-1' },
    ]);
    dalFolder.getUserRootFolders.mockResolvedValue([
      { folderId: 'folder-v1-1', rootFolderUserId: 'user-2' },
    ]);

    authGroupDal.getAuthGroupsContainingMember.mockResolvedValueOnce({
      records: [{ id: 'auth_group_1' }, { id: 'auth_group_2' }]
    });

    authGroupDal.getUserPrivateAuthGroup.mockResolvedValue({
      id: 'existing-private-auth-group-id',
      organizationId: ORG_GUID
    });

    const result = await rbacBll.authEnforcementEnable(context, args);
    expect(result.length).toEqual(2);
    expect(result[0]).toEqual({
      id: 'test-org Administrators',
      name: 'test-org Administrators',
      defaultGroup: 'orgAdmin',
      permissionSets: {
        organizationRole: {
          id: 'ps_admin_org',
          name: 'ps_admin_org'
        },
        resourceRole: {
          id: 'ps_admin_resource',
          name: 'ps_admin_resource'
        }
      }
    });
    expect(result[1]).toEqual({
      id: 'test-org Users',
      name: 'test-org Users',
      defaultGroup: 'orgAllAccess',
      permissionSets: {
        organizationRole: {
          id: 'ps_orgall_org',
          name: 'ps_orgall_org'
        },
        resourceRole: {
          id: 'ps_orgall_resource',
          name: 'ps_orgall_resource'
        }
      }
    });
    expect(authGroupDal.getAuthGroups).not.toHaveBeenCalled();
    expect(authGroupDal.createAuthGroup).toHaveBeenCalledTimes(2);
    expect(organizationDal.getOrgIdFromAppId).toHaveBeenCalled();
    expect(authPermissionDal.createAuthPermissionSet).toHaveBeenCalledTimes(4);
    // cms + resource
    expect(dalFolder.getOrCreateOrgRootFolder).toHaveBeenCalledTimes(2);
    // 2 org root folders
    // +1 : schema SDO with [sdo_schema_id1, sdo_schema_id2]
    // +1 : v2 user root folder
    // +1 : v1 user root folder
    expect(authACEDal.addACEsToResources).toHaveBeenCalledTimes(5);
  });

  it('create authGroups, permissionSets and apply policies - internalToken', async () => {
    authGroupDal.getAuthGroups.mockResolvedValue({
      records: [
        {
          organizationId: ORG_GUID
        }
      ]
    });
    serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(7682);
    serviceContext.dal.organization.getOrganization.mockResolvedValue({
      id: 7682,
      name: 'test-org',
      kvp: {
        features: {
          enableRBACFeature: 'enabled',
          enableRBACFeatureForSDO: 'enabled'
        },
        defaultAuthGroupsExample: [
          {
            id: 'orgAllAccess',
            name: 'orgAllAccess'
          },
          {
            id: 'orgAdmin',
            name: 'orgAdmin'
          }
        ]
      }
    });

    // for orgAdmin group
    authGroupDal.createAuthGroup.mockImplementation((options) => {
      return { id: options.name, name: options.name };
    });
    // _createDefaultPermissionSets
    authPermissionDal.getAuthPermissionSets.mockResolvedValue([]);
    authPermissionDal.createAuthPermissionSet.mockImplementation((args) => {
      return { id: args.name, name: args.name };
    });
    // create root folder ACE
    dalFolder.getOrCreateOrgRootFolder.mockReturnValue({
      id: '---folderId---'
    });
    serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
    authACEDal.addACEsToResources.mockReturnValue({});
    // _invalidateAccessibleFolderCaches
    dalFolder.getObjectIdsFromOpaqueIds.mockImplementationOnce((ctx, ids) => {
      return ids.reduce((m, x) => {
        const folderId = `folder_id_for_${x}`;
        m.set(folderId, folderId);
        m.set(x, folderId);

        return m;
      }, new Map());
    });

    const result = await rbacBll.authEnforcementEnable(
      internalTokenContext,
      args
    );
    expect(result.length).toEqual(2);
    expect(result[0]).toEqual({
      id: 'test-org Administrators',
      name: 'test-org Administrators',
      defaultGroup: 'orgAdmin',
      permissionSets: {
        organizationRole: {
          id: 'ps_admin_org',
          name: 'ps_admin_org'
        },
        resourceRole: {
          id: 'ps_admin_resource',
          name: 'ps_admin_resource'
        }
      }
    });
    expect(result[1]).toEqual({
      id: 'test-org Users',
      name: 'test-org Users',
      defaultGroup: 'orgAllAccess',
      permissionSets: {
        organizationRole: {
          id: 'ps_orgall_org',
          name: 'ps_orgall_org'
        },
        resourceRole: {
          id: 'ps_orgall_resource',
          name: 'ps_orgall_resource'
        }
      }
    });
    expect(authGroupDal.getAuthGroups).not.toHaveBeenCalled();
    expect(authGroupDal.createAuthGroup).toHaveBeenCalledTimes(2);
    expect(organizationDal.getOrgIdFromAppId).toHaveBeenCalled();
    expect(authPermissionDal.createAuthPermissionSet).toHaveBeenCalledTimes(4);
    // cms + resource
    expect(dalFolder.getOrCreateOrgRootFolder).toHaveBeenCalledTimes(2);
    expect(authACEDal.addACEsToResources).toHaveBeenCalledTimes(3);
    expect(dalSDO.getSchemas).toHaveBeenCalled();
  });

  it('create authGroups, permissionSets and apply policies - RBAC for SDO is disabled', async () => {
    authGroupDal.getAuthGroups.mockResolvedValue({
      records: [
        {
          organizationId: ORG_GUID
        }
      ]
    });
    serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(7682);
    serviceContext.dal.organization.getOrganization.mockResolvedValue({
      id: 7682,
      name: 'test-org',
      organizationGuid: ORG_GUID,
      kvp: {
        features: {
          enableRBACFeature: 'enabled',
          enableRBACFeatureForSDO: 'disabled'
        },
        defaultAuthGroupsExample: [
          {
            id: 'orgAllAccess',
            name: 'orgAllAccess'
          },
          {
            id: 'orgAdmin',
            name: 'orgAdmin'
          }
        ]
      }
    });

    // for orgAdmin group
    authGroupDal.createAuthGroup.mockImplementation((options) => {
      return { id: options.name, name: options.name };
    });
    // _createDefaultPermissionSets: getAuthPermissionSets
    authPermissionDal.getAuthPermissionSets.mockResolvedValue([]);
    authPermissionDal.createAuthPermissionSet.mockImplementation((args) => {
      return { id: args.name, name: args.name };
    });
    // create root folder ACE
    dalFolder.getOrCreateOrgRootFolder.mockReturnValue({
      id: '---folderId---'
    });
    serviceContext.dal.application.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
    authACEDal.addACEsToResources.mockReturnValue({});
    // _invalidateAccessibleFolderCaches
    dalFolder.getObjectIdsFromOpaqueIds.mockImplementationOnce((ctx, ids) => {
      return ids.reduce((m, x) => {
        const folderId = `folder_id_for_${x}`;
        m.set(folderId, folderId);
        m.set(x, folderId);

        return m;
      }, new Map());
    });

    authGroupDal.getAuthGroupsContainingMember.mockResolvedValueOnce({
      records: [{ id: 'auth_group_1' }, { id: 'auth_group_2' }]
    });

    authGroupDal.getUserPrivateAuthGroup.mockResolvedValue({
      id: 'existing-private-auth-group-id',
      organizationId: ORG_GUID
    });

    const result = await rbacBll.authEnforcementEnable(context, args);
    expect(result.length).toEqual(2);
    expect(result[0]).toEqual({
      id: 'test-org Administrators',
      name: 'test-org Administrators',
      defaultGroup: 'orgAdmin',
      permissionSets: {
        organizationRole: {
          id: 'ps_admin_org',
          name: 'ps_admin_org'
        },
        resourceRole: {
          id: 'ps_admin_resource',
          name: 'ps_admin_resource'
        }
      }
    });
    expect(result[1]).toEqual({
      id: 'test-org Users',
      name: 'test-org Users',
      defaultGroup: 'orgAllAccess',
      permissionSets: {
        organizationRole: {
          id: 'ps_orgall_org',
          name: 'ps_orgall_org'
        },
        resourceRole: {
          id: 'ps_orgall_resource',
          name: 'ps_orgall_resource'
        }
      }
    });
    expect(authGroupDal.getAuthGroups).not.toHaveBeenCalled();
    expect(authGroupDal.createAuthGroup).toHaveBeenCalledTimes(2);
    expect(organizationDal.getOrgIdFromAppId).toHaveBeenCalled();
    expect(authPermissionDal.createAuthPermissionSet).toHaveBeenCalledTimes(4);
    // cms + resource
    expect(dalFolder.getOrCreateOrgRootFolder).toHaveBeenCalledTimes(2);

    expect(dalSDO.getSchemas).not.toHaveBeenCalled();
    expect(authACEDal.addACEsToResources).toHaveBeenCalledTimes(2);
  });

  describe('_grantDefaultACEsToUserRootFolders', () => {
    let defaultPermissionSets;
    const mockContext = {
      _authInfo: { userId: 'user-123', applicationId: ORG_GUID },
      config: { flyway: { rootOrgId: 1 } }
    };

    beforeEach(() => {
      defaultPermissionSets = [
        {
          id: 'ps-aiware-admin',
          name: 'aiWARE Administrator',
          authClass: 'System'
        },
        {
          id: 'ps-other',
          name: 'Other Permission Set',
          authClass: 'System'
        }
      ];

      organizationDal.getOrgIdFromAppId.mockResolvedValue(ORG_ID);
      applicationDal.getAppIdFromOrgId.mockReturnValue(ORG_GUID);
      adminDal.getUsers.mockResolvedValue({ records: [] });
      authGroupDal.getAuthGroups.mockResolvedValue({ records: [] });
      authPermissionDal.getAuthPermissionSets.mockResolvedValue({
        records: [defaultPermissionSets[0]]
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should do nothing if org param is empty', async () => {
      await rbacBll._grantDefaultACEsToUserRootFolders(mockContext);

      expect(dalFolderV2.getUserRootFolders).not.toHaveBeenCalled();
      expect(dalFolder.getUserRootFolders).not.toHaveBeenCalled();
    });

    it('should process both V1 and V2 folders with pagination', async () => {
      const v2Folders = [
        { folderId: 'folder-v2-1', rootFolderUserId: 'user-1' },
        { folderId: 'folder-v2-2', rootFolderUserId: 'user-2' }
      ];
      const v1Folders = [
        { folderId: 'folder-v1-1', rootFolderUserId: 'user-3' },
        { folderId: 'folder-v1-2', rootFolderUserId: 'user-4' }
      ];

      dalFolderV2.getUserRootFolders
        .mockResolvedValueOnce(v2Folders)
        .mockResolvedValueOnce([]); // second page empty
      dalFolder.getUserRootFolders
        .mockResolvedValueOnce(v1Folders)
        .mockResolvedValueOnce([]); // second page empty
      serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(
        7682
      );
      serviceContext.dal.organization.getOrganization.mockResolvedValue({
        id: 7682,
        name: 'test-org',
        kvp: {
          defaultAuthGroups: [
            {
              id: 'auth_group_2',
              name: 'orgAllAccess',
              defaultGroup: 'orgAllAccess',
              permissionSets: {
                organizationRole: {
                  id: 'ps_admin_org',
                  name: 'ps_admin_org',
                },
                resourceRole: {
                  id: 'ps_admin_resource',
                  name: 'ps_admin_resource',
                }
              },
            },
            {
              id: 'auth_group_1',
              name: 'orgAdmin',
              defaultGroup: 'orgAdmin',
            }
          ],
          features: {
            enableRBACFeature: 'enabled',
          }
        }
      });
      authGroupDal.getUserPrivateAuthGroup.mockResolvedValue({ id: 'existing-group' });
      authACEDal.addACEsToResources.mockResolvedValue({});

      await rbacBll._grantDefaultACEsToUserRootFolders(mockContext, {
        id: ORG_ID,
      });

      expect(dalFolderV2.getUserRootFolders).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          withoutACE: true,
          organizationId: ORG_ID,
          offset: 0,
          rootFolderType: 'cms',
        })
      );
      expect(dalFolder.getUserRootFolders).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          withoutACE: true,
          organizationId: ORG_ID,
          offset: 0,
          rootFolderType: 'cms',
        })
      );
      expect(authACEDal.addACEsToResources).toHaveBeenCalledTimes(v2Folders.length + v1Folders.length);
    });

    it('should handle errors gracefully and continue processing', async () => {
      const folders = [
        { folderId: 'folder-1', rootFolderUserId: 'user-1' },
        { folderId: 'folder-2', rootFolderUserId: 'user-2' },
        { folderId: 'folder-3', rootFolderUserId: 'user-3' },
      ];

      dalFolderV2.getUserRootFolders
        .mockResolvedValueOnce(folders)
        .mockResolvedValueOnce([]);
      dalFolder.getUserRootFolders.mockResolvedValue([]);
      authGroupDal.getUserPrivateAuthGroup.mockResolvedValue({ id: 'existing-group' });
      serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(
        7682
      );
      serviceContext.dal.organization.getOrganization.mockResolvedValue({
        id: 7682,
        name: 'test-org',
        kvp: {
          defaultAuthGroups: [
            {
              id: 'auth_group_2',
              name: 'orgAllAccess',
              defaultGroup: 'orgAllAccess',
              permissionSets: {
                organizationRole: {
                  id: 'ps_admin_org',
                  name: 'ps_admin_org',
                },
                resourceRole: {
                  id: 'ps_admin_resource',
                  name: 'ps_admin_resource',
                }
              },
            },
            {
              id: 'auth_group_1',
              name: 'orgAdmin',
              defaultGroup: 'orgAdmin',
            }
          ],
          features: {
            enableRBACFeature: 'enabled',
          }
        }
      });
      authACEDal.addACEsToResources
        .mockResolvedValueOnce({}) // success
        .mockRejectedValueOnce(new Error('ACE addition failed')) // failure
        .mockResolvedValueOnce({}); // success

      await expect(rbacBll._grantDefaultACEsToUserRootFolders(mockContext, {
        id: ORG_ID
      })).resolves.not.toThrow();

      expect(dalFolderV2.getUserRootFolders).toHaveBeenCalled();
      expect(authACEDal.addACEsToResources).toHaveBeenCalledTimes(3);
    });

    it('should handle complete function failure gracefully', async () => {
      dalFolderV2.getUserRootFolders.mockRejectedValue(
        new Error('Database error')
      );

      // Should not throw even on complete failure
      await expect(
        rbacBll._grantDefaultACEsToUserRootFolders(mockContext, {
          orgId: ORG_ID,
          organizationGuid: ORG_GUID,
          defaultPermissionSets
        })
      ).resolves.not.toThrow();
    });
  });
});
