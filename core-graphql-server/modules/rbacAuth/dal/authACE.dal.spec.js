const mockUtil = require('../../../test/mockUtil.js')();
const createServiceContext = require('../../../test/serviceContext.mock.js');
const _ = require('lodash');
describe('RBAC ACE dal', () => {
  let dal;
  let serviceContext;
  const ORG_ID = 'org_id';
  beforeAll(() => {
    serviceContext = createServiceContext();
    serviceContext.redisCache = {
      get: jest.fn(),
      isCacheDirty: jest.fn(),
      clear: jest.fn(),
      asyncSet: jest.fn(),
      asyncClear: jest.fn()
    };
    dal = require('./authACE.dal.js')(serviceContext);
  });

  beforeEach(() => {
    serviceContext._clearAll();
    serviceContext.redisCache.get.mockClear();
    serviceContext.redisCache.isCacheDirty.mockClear();
    serviceContext.redisCache.asyncClear.mockClear();
    serviceContext.redisCache.asyncSet.mockClear();
  });

  function addACEDbResults() {
    serviceContext.dbConnections['sso'].read._push(
      [
        {
          id_text: 't1'
        },
        {
          object_type: 'recording',
          id_text: 't1',
          auth_group_id: 'ag1',
          permission_set_id: 'ps1',
          is_protected: false
        }
      ],
      false,
      ['organization_id', 'id_text']
    );
  }

  function mockImplementationCacheLayer(isCacheDirty, cachedValue) {
    serviceContext.redisCache.get.mockResolvedValueOnce('timestamp_value');
    serviceContext.redisCache.isCacheDirty.mockReturnValueOnce(isCacheDirty);
    serviceContext.redisCache.get.mockResolvedValueOnce(cachedValue);
  }

  function expectCacheLayer(isCacheDirty, resourceCount = 1) {
    const expectedCalls = resourceCount;

    expect(serviceContext.redisCache.isCacheDirty).toHaveBeenCalledTimes(expectedCalls);
    expect(serviceContext.redisCache.asyncClear).toHaveBeenCalledTimes(
      isCacheDirty ? 2 : 0
    );
    expect(serviceContext.redisCache.get).toHaveBeenCalledTimes(2);
    expect(serviceContext.redisCache.asyncSet).toHaveBeenCalledTimes(
      isCacheDirty ? 2 : 0
    );
  }

  function testACEReturn(acl) {
    expect(acl).not.toBeNull();
    expect(acl.count).toEqual(2);
    expect(acl.offset).toEqual(3);
    expect(acl.limit).toEqual(5);
    expect(acl.records[1]).toEqual({
      aceId: 'TDO::t1::ag1::ps1',
      authGroupId: 'ag1',
      idText: 't1',
      isProtected: false,
      objectID: 't1',
      objectType: 'TDO',
      permissionSetId: 'ps1'
    });
  }

  describe('getACLForResourcesDb', () => {
    it('getACLForResources from Db', async () => {
      addACEDbResults();
      const acl = await dal.getACLForResourcesDb({
        orgId: 'org_id',
        resourceType: 'TDO',
        ids: ['t1', 't2', 't3'],
        offset: 3,
        limit: 5
      });
      testACEReturn(acl);
    });
  });

  describe('getACLForResources', () => {
    it('should return cached value', async () => {
      const cachedValue = {
        offset: 3,
        limit: 5,
        records: [
          {
            idText: 't1'
          },
          {
            aceId: 'TDO::t1::ag1::ps1',
            authGroupId: 'ag1',
            idText: 't1',
            isProtected: false,
            objectID: 't1',
            objectType: 'TDO',
            permissionSetId: 'ps1'
          }
        ],
        count: 2
      };
      mockImplementationCacheLayer(false, cachedValue);

      const acl = await dal.getACLForResources({
        orgId: 'org_id',
        resourceType: 'TDO',
        ids: ['t1', 't2', 't3'],
        offset: 3,
        limit: 5
      });
      testACEReturn(acl);
      expectCacheLayer(false, 4); // 3 resource keys + 1 for org key
      expect(
        serviceContext.dbConnections['sso'].read._resultQueueSize()
      ).toEqual(0);
    });
    it('should return value from Db', async () => {
      mockImplementationCacheLayer(true, null);
      addACEDbResults();
      const acl = await dal.getACLForResources({
        orgId: 'org_id',
        resourceType: 'TDO',
        ids: ['t1', 't2', 't3'],
        offset: 3,
        limit: 5
      });
      testACEReturn(acl);
      expectCacheLayer(true, 4); // 3 resource keys + 1 for org key
    });
    it('should not return data from cache when skipCache is true', async () => {
      const cachedValue = {
        offset: 3,
        limit: 5,
        records: [
          {
            idText: 't1'
          },
          {
            aceId: 'TDO::t1::ag1::ps1',
            authGroupId: 'ag1',
            idText: 't1',
            isProtected: false,
            objectID: 't1',
            objectType: 'TDO',
            permissionSetId: 'ps1'
          }
        ],
        count: 2
      };
      mockImplementationCacheLayer(false, cachedValue);
      addACEDbResults();

      const acl = await dal.getACLForResources({
        orgId: 'org_id',
        resourceType: 'TDO',
        ids: ['t1', 't2', 't3'],
        offset: 3,
        limit: 5,
        skipCache: true
      });
      testACEReturn(acl);
      expect(
        serviceContext.dbConnections['sso'].read._resultQueueSize()
      ).toEqual(0);
    });
  });

  describe('addACEsToResources', () => {
    it('addACEsToResources', async () => {
      const inputArgs = {
        orgId: 'org_id',
        resourceType: 'TDO',
        ids: ['t1', 't2', 't3'],
        offset: 3,
        limit: 5,
        entries: [
          {
            member: { id: 'g1', memberType: 'Group' },
            permissionSetID: 'ps1'
          },
          {
            member: { id: 'g1', memberType: 'Group' },
            permissionSetID: 'ps2'
          },
          {
            member: { id: 'g2', memberType: 'Group' },
            permissionSetID: 'ps3'
          }
        ]
      };
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: 'g1'
          }
        ],
        true,
        ['id_text', 'ps1', 'ps2', 'ps3', 'g1', 'g2', 'recording']
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: 'g1'
          }
        ],
        true,
        ['recording_id', 'ps1', 'ps2', 'ps3', 'g1', 'g2']
      );
      addACEDbResults();
      const acl = await dal.addACEsToResources(inputArgs);
      testACEReturn(acl);
    });
    it('addACEsToResources for SDOSchema', async () => {
      const inputArgs = {
        orgId: 'org_id',
        resourceType: 'SDOSchema',
        ids: ['schema1', 'schema2'],
        offset: 0,
        limit: 10,
        entries: [
          {
            member: { id: 'g1', memberType: 'Group' },
            permissionSetID: 'ps1'
          },
          {
            member: { id: 'g2', memberType: 'Group' },
            permissionSetID: 'ps2'
          }
        ]
      };

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: 'g1'
          }
        ],
        true,
        ['id_text', 'ps1', 'ps2', 'g1', 'g2', 'schema', 'object_type']
      );

      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            id: 'g1'
          }
        ],
        true,
        ['data_registry_id', 'ps1', 'ps2', 'g1', 'g2', 'schema1', 'schema2']
      );

      addACEDbResults();

      const acl = await dal.addACEsToResources(inputArgs);

      expect(acl).not.toBeNull();
      expect(acl.records).toBeDefined();
    });
    it('addACEsToResources empty entries array', async () => {
      const inputArgs = {
        orgId: 'org_id',
        resourceType: 'TDO',
        ids: ['t1', 't2', 't3'],
        offset: 3,
        limit: 5,
        entries: []
      };
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'g1'
        }
      ]);
      addACEDbResults();
      const acl = await dal.addACEsToResources(inputArgs);
      testACEReturn(acl);
    });
    it('addACEsToResources for SDOSchema with empty entries array', async () => {
      const inputArgs = {
        orgId: 'org_id',
        resourceType: 'SDOSchema',
        ids: ['schema1', 'schema2'],
        offset: 0,
        limit: 10,
        entries: []
      };

      addACEDbResults();

      const acl = await dal.addACEsToResources(inputArgs);

      expect(acl).not.toBeNull();
      expect(acl.records).toBeDefined();
    });

    it('addACEsToResources for folder with inherit flag', async () => {
      const inputArgs = {
        orgId: 'org_id',
        resourceType: 'Folder',
        ids: ['f1'],
        offset: 3,
        limit: 5,
        entries: [
          {
            member: { id: 'u1', memberType: 'User' },
            permissionSetID: 'ps1',
            options: ['inherit']
          }
        ]
      };
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: 'g1'
          }
        ],
        true,
        ['id_text', 'ps1', 'u1', 'folder', 'auth_inherit', 'true::boolean']
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 'g1'
          }
        ],
        true,
        ['folder_id', 'organization_id', 'ps1', 'u1']
      );
      addACEDbResults();
      const acl = await dal.addACEsToResources(inputArgs);
      testACEReturn(acl);
    });

    it('addACEsToResources for folder without inherit flag', async () => {
      const inputArgs = {
        orgId: 'org_id',
        resourceType: 'Folder',
        ids: ['f1'],
        offset: 3,
        limit: 5,
        entries: [
          {
            member: { id: 'u1', memberType: 'User' },
            permissionSetID: 'ps1',
            options: []
          }
        ]
      };
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: 'g1'
          }
        ],
        true,
        ['id_text', 'ps1', 'u1', 'folder', 'auth_inherit', 'null::boolean)']
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 'g1'
          }
        ],
        true,
        ['folder_id', 'organization_id', 'ps1', 'u1']
      );
      addACEDbResults();
      const acl = await dal.addACEsToResources(inputArgs);
      testACEReturn(acl);
    });

    it('addACEsToResources for folder with flag mix', async () => {
      const inputArgs = {
        orgId: 'org_id',
        resourceType: 'Folder',
        ids: ['f1', 'f2', 'f3'],
        offset: 3,
        limit: 5,
        entries: [
          {
            member: { id: 'g1', memberType: 'Group' },
            permissionSetID: 'ps1'
          },
          {
            member: { id: 'g2', memberType: 'Group' },
            permissionSetID: 'ps2'
          },
          {
            member: { id: 'u1', memberType: 'User' },
            permissionSetID: 'ps3',
            options: ['inherit']
          }
        ]
      };
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: 'g1'
          }
        ],
        true,
        ['id_text', 'ps1', 'ps2', 'ps3', 'g1', 'g2', 'folder']
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 'g1'
          }
        ],
        true,
        ['folder_id', 'organization_id', 'ps1', 'ps2', 'ps3', 'g1', 'g2', 'u1', 'f1', 'f2', 'f3']
      );
      addACEDbResults();
      const acl = await dal.addACEsToResources(inputArgs);
      testACEReturn(acl);
    });

    it('addACEsToResources should throw error if join table insert fails', async () => {
      const inputArgs = {
        orgId: 'org_id',
        resourceType: 'TDO',
        ids: ['t1'],
        entries: [
          {
            member: { id: 'g1', memberType: 'Group' },
            permissionSetID: 'ps1'
          }
        ]
      };

      serviceContext.dbConnections['sso'].write._push([{ id: 'g1' }]);
      
      serviceContext.dbConnections['core'].write._push(new Error('Database join error'));

      await expect(dal.addACEsToResources(inputArgs)).rejects.toThrow('Database join error');
    });

    it('addACEsToResources for SDO should use third_party db connection', async () => {
      const inputArgs = {
        orgId: 'org_id',
        resourceType: 'SDO',
        ids: ['sdo1'],
        dataRegistryId: 'dr1',
        entries: [{ member: { id: 'g1' }, permissionSetID: 'ps1' }]
      };

      serviceContext.dbConnections['sso'].write._push([{ id: 'g1' }]);
      
      serviceContext.dbConnections['third_party'].write._push([{ id: 'sdo1' }], true, ['sdo_id', 'g1']);

      addACEDbResults();
      const acl = await dal.addACEsToResources(inputArgs);
      expect(acl).toBeDefined();
      
      expect(serviceContext.dbConnections['third_party'].write._resultQueueSize()).toBe(0);
    });
  });

  describe('deleteACLForResources', () => {
    it('deleteACLForResources', async () => {
      const inputArgs = {
        resourceType: 'TDO',
        ids: ['TDO::t1::g1::ps1', 'TDO::t2::g1::ps1', 'TDO::t3::g2::ps3'],
        offset: 3,
        limit: 5
      };
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id_text: 't1',
            auth_group_id: 'g1',
            permission_set_id: 'ps1'
          },
          {
            id_text: 't2',
            auth_group_id: 'g1',
            permission_set_id: 'ps1'
          },
          {
            id_text: 't3',
            auth_group_id: 'g2',
            permission_set_id: 'ps3'
          }
        ],
        true,
        [
          'DELETE',
          'id_text',
          'ps1',
          'ps3',
          'g1',
          'g2',
          'recording',
          'protected'
        ]
      );

      serviceContext.dbConnections['core'].write._push([], true, [
        'DELETE',
        `'t1','g1','ps1'`,
        `'t2','g1','ps1'`,
        `'t3','g2','ps3'`
      ]);
      addACEDbResults();
      const acl = await dal.deleteACLForResources(inputArgs);
      expect(acl).toEqual([
        {
          objectID: 't1',
          authGroupId: 'g1',
          permissionSetId: 'ps1',
          objectType: 'recording',
          removed: true
        },
        {
          objectID: 't2',
          authGroupId: 'g1',
          permissionSetId: 'ps1',
          objectType: 'recording',
          removed: true
        },
        {
          objectID: 't3',
          authGroupId: 'g2',
          permissionSetId: 'ps3',
          objectType: 'recording',
          removed: true
        }
      ]);
    });

    it('flags only the ACEs actually removed from the DB (mixed batch)', async () => {
      const inputArgs = {
        resourceType: 'TDO',
        ids: ['TDO::t1::g1::ps1', 'TDO::t2::g1::ps1', 'TDO::t3::g2::ps3']
      };
      // DELETE RETURNING omits t2 — it matched no row (already gone, or a
      // protected row excluded by the `protected = FALSE` guard).
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id_text: 't1',
            auth_group_id: 'g1',
            permission_set_id: 'ps1'
          },
          {
            id_text: 't3',
            auth_group_id: 'g2',
            permission_set_id: 'ps3'
          }
        ],
        true,
        [
          'DELETE',
          'id_text',
          'ps1',
          'ps3',
          'g1',
          'g2',
          'recording',
          'protected'
        ]
      );

      serviceContext.dbConnections['core'].write._push([], true, [
        'DELETE',
        `'t1','g1','ps1'`,
        `'t3','g2','ps3'`
      ]);

      const acl = await dal.deleteACLForResources(inputArgs);
      expect(acl).toEqual([
        {
          objectID: 't1',
          authGroupId: 'g1',
          permissionSetId: 'ps1',
          objectType: 'recording',
          removed: true
        },
        {
          objectID: 't2',
          authGroupId: 'g1',
          permissionSetId: 'ps1',
          objectType: 'recording',
          removed: false
        },
        {
          objectID: 't3',
          authGroupId: 'g2',
          permissionSetId: 'ps3',
          objectType: 'recording',
          removed: true
        }
      ]);
    });
  });

  describe('getAuthACLByResourceIdsAndPerms', () => {
    it('should return invalid input error', async () => {
      const inputArgs = {
        ids: ['t1', 't2', 't3'],
        permissions: [],
        orgId: 'org_id',
        authGroupIds: ['ag1', 'ag2']
      };
      await expect(() =>
        dal.getAuthACLByResourceIdsAndPerms(inputArgs)
      ).rejects.toThrow('ResourceIds and permissions cannot be null or empty');
    });
    it('getAuthACLByResourceIdsAndPerms', async () => {
      const inputArgs = {
        ids: ['t1', 't2', 't3'],
        permissions: ['per.1', 'per.2'],
        orgId: 'org_id',
        authGroupIds: ['ag1', 'ag2']
      };
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id_text: 't1'
          },
          {
            object_type: 'recording',
            id_text: 't1',
            auth_group_id: 'ag1',
            permission_set_id: 'ps1',
            protected: false
          }
        ],
        false,
        [
          'ra.organization_id',
          'id_text',
          'p.permission_set_id = ra.permission_set_id'
        ]
      );

      const acl = await dal.getAuthACLByResourceIdsAndPerms(inputArgs);
      expect(acl[1]).toEqual({
        aceId: 'TDO::t1::ag1::ps1',
        authGroupId: 'ag1',
        idText: 't1',
        objectID: 't1',
        objectType: 'TDO',
        permissionSetId: 'ps1',
        protected: false
      });
    });
  });

  describe('inheritResourceACEs', () => {
    it('inheritResourceACEs - folder from folder', async () => {
      const inputArgs = {
        userId: '_test_user_',
        source: {
          type: 'Folder',
          id: '_folder_1'
        },
        target: {
          type: 'Folder',
          id: '_folder_2'
        }
      };
      const ace1 = {
        id_text: '_folder_2',
        permission_set_id: 'ps1',
        auth_group_id: 'ag1',
        organization_id: 1
      };
      serviceContext.dbConnections['sso'].write._push([ace1], true, [
        'folder',
        '_folder_1',
        '_folder_2',
        '_test_user_',
        'INSERT INTO'
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], true, [
        'folder_id',
        'organization_id',
        'auth_group_id',
        'permission_set_id'
      ]);
      const r = await dal.inheritResourceACEs(inputArgs);
      expect(r).toEqual([ace1]);
    });

    it('inheritResourceACEs - tdo from folder', async () => {
      const inputArgs = {
        userId: '_test_user_',
        source: {
          type: 'Folder',
          id: '_folder_1'
        },
        target: {
          type: 'TDO',
          id: '_tdo_1'
        }
      };
      const ace1 = {
        id_text: '_tdo_1',
        permission_set_id: 'ps1',
        auth_group_id: 'ag1'
      };
      serviceContext.dbConnections['sso'].write._push([ace1], true, [
        'folder',
        'recording',
        '_folder_1',
        '_tdo_1',
        '_test_user_',
        'INSERT INTO'
      ]);
      serviceContext.dbConnections['core'].write._push([], true, [
        'recording_id',
        '_tdo_1',
        'ps1',
        'ag1'
      ]);
      await dal.inheritResourceACEs(inputArgs);
    });

    it('inheritResourceACEs - unsupportedAuthClasses option', async () => {
      const inputArgs = {
        unsupportedAuthClasses: ['User'],
        userId: '_test_user_',
        source: {
          type: 'Folder',
          id: '_folder_1'
        },
        target: {
          type: 'TDO',
          id: '_tdo_1'
        }
      };
      const ace1 = {
        id_text: '_tdo_1',
        permission_set_id: 'ps1',
        auth_group_id: 'ag1'
      };
      serviceContext.dbConnections['sso'].write._push([ace1], true, [
        'folder',
        'recording',
        '_folder_1',
        '_tdo_1',
        '_test_user_',
        'INSERT INTO',
        'JOIN',
        'auth_group_class',
        'auth_inherit = TRUE'
      ]);
      serviceContext.dbConnections['core'].write._push([], true, [
        'recording_id',
        '_tdo_1',
        'ps1',
        'ag1'
      ]);
      await dal.inheritResourceACEs(inputArgs);
    });

  });

  describe('getAuthGroupIdsByPermissionSets', () => {
    it('getAuthGroupIdsByPermissionSets', async () => {
      const permissionSets = ['ps_1', 'ps_2'];
      const orgId = 1;

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 'au_1'
          },
          {
            id: 'au_2'
          }
        ],
        false,
        ['DISTINCT', 'auth_group_id', 'organization_id', 'permission_set_id']
      );

      const authGroupIds = await dal.getAuthGroupIdsByPermissionSets(
        permissionSets,
        orgId
      );

      expect(authGroupIds).toEqual(expect.arrayContaining(['au_1', 'au_2']));
    });
  });

  describe('mark cache dirty', () => {
    let serviceContext1, dal1;
    beforeAll(() => {
      serviceContext1 = createServiceContext();
      dal1 = require('./authACE.dal.js')(serviceContext1);
    });

    beforeEach(() => {
      serviceContext1._clearAll();
    });
    it('markCacheDirtyForGetACLForResources', async () => {
      await dal1.markCacheDirtyForGetACLForResources(ORG_ID);
      expect(serviceContext1.redisCache.isCacheDirty()).toMatch(
        new RegExp(`acl_for_resource_marked_key:${ORG_ID}`)
      );
    });
    it('markCacheDirtyForHasPermissions', async () => {
      await dal1.markCacheDirtyForHasPermissions(ORG_ID);
      expect(serviceContext1.redisCache.isCacheDirty()).toMatch(
        new RegExp(`acl_has_permission_marked_key:${ORG_ID}`)
      );
    });
  });

  describe('hasPermissions', () => {
    it('hasPermissionsDb', async () => {
      serviceContext.dbConnections['sso'].read._push([{ id: 't1' }], false, [
        'DISTINCT',
        'ra.object_type',
        'ra.auth_group_id',
        'p.permissions'
      ]);
      const result = await dal.hasPermissionsDb({
        resourceType: 'TDO',
        ids: ['t1', 't2'],
        permissions: ['RECORDING_READ'],
        authGroups: ['ag1']
      });

      expect(result).toEqual([
        {
          resourceType: 'TDO',
          id: 't1',
          hasPermission: true
        },
        {
          resourceType: 'TDO',
          id: 't2',
          hasPermission: false
        }
      ]);
    });
    it('should return cached value', async () => {
      const cachedValue = [
        {
          resourceType: 'TDO',
          id: 't1',
          hasPermission: true
        },
        {
          resourceType: 'TDO',
          id: 't2',
          hasPermission: false
        }
      ];
      mockImplementationCacheLayer(false, cachedValue);

      const result = await dal.hasPermissions({
        resourceType: 'TDO',
        ids: ['t1', 't2'],
        permissions: ['RECORDING_READ']
      });
      expect(result).toEqual([
        {
          resourceType: 'TDO',
          id: 't1',
          hasPermission: true
        },
        {
          resourceType: 'TDO',
          id: 't2',
          hasPermission: false
        }
      ]);
      expectCacheLayer(false, 3); // 2 resource keys + 1 for org key
      expect(
        serviceContext.dbConnections['sso'].read._resultQueueSize()
      ).toEqual(0);
    });
    it('should return value from Db', async () => {
      mockImplementationCacheLayer(true, null);
      serviceContext.dbConnections['sso'].read._push([{ id: 't1' }], false, [
        'DISTINCT',
        'ra.object_type',
        'ra.auth_group_id',
        'p.permissions'
      ]);
      const result = await dal.hasPermissions({
        resourceType: 'TDO',
        ids: ['t1', 't2'],
        permissions: ['RECORDING_READ'],
        authGroups: ['ag1']
      });
      expect(result).toEqual([
        {
          resourceType: 'TDO',
          id: 't1',
          hasPermission: true
        },
        {
          resourceType: 'TDO',
          id: 't2',
          hasPermission: false
        }
      ]);
      expectCacheLayer(true, 3); // 2 resource keys + 1 for org key
    });
    it('should cache denied results with a short TTL (T28 negative-cache fix)', async () => {
      mockImplementationCacheLayer(true, null);
      // Only t1 comes back from the DB, so t2 is denied (hasPermissionsDb marks any id
      // not returned by the query as hasPermission: false) — this batch contains a denial.
      serviceContext.dbConnections['sso'].read._push([{ id: 't1' }], false, [
        'DISTINCT',
        'ra.object_type',
        'ra.auth_group_id',
        'p.permissions'
      ]);
      const result = await dal.hasPermissions({
        resourceType: 'TDO',
        ids: ['t1', 't2'],
        permissions: ['RECORDING_READ'],
        authGroups: ['ag1']
      });
      expect(result).toEqual([
        {
          resourceType: 'TDO',
          id: 't1',
          hasPermission: true
        },
        {
          resourceType: 'TDO',
          id: 't2',
          hasPermission: false
        }
      ]);

      // The RBAC-result cache write (type === 'rbacAclHasPermissions') must use the short
      // negative TTL (5s == 5/60 min), not the 30-minute positive TTL, because the batch
      // contains a denial.
      const rbacResultCalls =
        serviceContext.redisCache.asyncSet.mock.calls.filter(
          (call) => call[0] === 'rbacAclHasPermissions'
        );
      expect(rbacResultCalls.length).toBeGreaterThan(0);
      for (const call of rbacResultCalls) {
        expect(call[4]).toEqual(5 / 60);
      }

      // Its paired timestamp key must share the same short TTL, otherwise it could
      // outlive the value it's supposed to be tracking (see T28).
      const timestampCalls = serviceContext.redisCache.asyncSet.mock.calls.filter(
        (call) => call[0] === 'timestamp'
      );
      expect(timestampCalls.length).toBeGreaterThan(0);
      for (const call of timestampCalls) {
        expect(call[4]).toEqual(5 / 60);
      }
    });
    it('should cache fully-granted results with the unchanged long (30min) TTL', async () => {
      mockImplementationCacheLayer(true, null);
      // Both t1 and t2 come back from the DB, so every result is granted.
      serviceContext.dbConnections['sso'].read._push(
        [{ id: 't1' }, { id: 't2' }],
        false,
        ['DISTINCT', 'ra.object_type', 'ra.auth_group_id', 'p.permissions']
      );
      const result = await dal.hasPermissions({
        resourceType: 'TDO',
        ids: ['t1', 't2'],
        permissions: ['RECORDING_READ'],
        authGroups: ['ag1']
      });
      expect(result).toEqual([
        {
          resourceType: 'TDO',
          id: 't1',
          hasPermission: true
        },
        {
          resourceType: 'TDO',
          id: 't2',
          hasPermission: true
        }
      ]);

      // No denial in this batch, so the cache write falls back to the closure's original
      // POSITIVE_RESULT_TTL_MIN (30) — identical to pre-fix behavior.
      const rbacResultCalls =
        serviceContext.redisCache.asyncSet.mock.calls.filter(
          (call) => call[0] === 'rbacAclHasPermissions'
        );
      expect(rbacResultCalls.length).toBeGreaterThan(0);
      for (const call of rbacResultCalls) {
        expect(call[4]).toEqual(30);
      }
    });
    it('hasPermissionsDb for SDO', async () => {
      serviceContext.dbConnections['sso'].read._push([{ id: 's1' }], false, [
        'DISTINCT',
        'ra.object_type',
        'ra.auth_group_id',
        'p.permissions'
      ]);
      const result = await dal.hasPermissionsDb({
        resourceType: 'SDO',
        ids: ['s1', 's2'],
        permissions: ['RECORDING_READ'],
        authGroups: ['ag1']
      });

      expect(result).toEqual([
        {
          resourceType: 'SDO',
          id: 's1',
          hasPermission: true
        },
        {
          resourceType: 'SDO',
          id: 's2',
          hasPermission: false
        }
      ]);
    });
    it('should return cached value for SDO', async () => {
      const cachedValue = [
        {
          resourceType: 'SDO',
          id: 's1',
          hasPermission: true
        },
        {
          resourceType: 'SDO',
          id: 's2',
          hasPermission: false
        }
      ];
      mockImplementationCacheLayer(false, cachedValue);

      const result = await dal.hasPermissions({
        resourceType: 'SDO',
        ids: ['s1', 's2'],
        permissions: ['RECORDING_READ']
      });

      expect(result).toEqual(cachedValue);
      expectCacheLayer(false, 3); // 2 resource keys + 1 for org key
      expect(
        serviceContext.dbConnections['sso'].read._resultQueueSize()
      ).toEqual(0);
    });
    it('should return value from Db for SDO', async () => {
      mockImplementationCacheLayer(true, null);
      serviceContext.dbConnections['sso'].read._push([{ id: 's1' }], false, [
        'DISTINCT',
        'ra.object_type',
        'ra.auth_group_id',
        'p.permissions'
      ]);
      const result = await dal.hasPermissions({
        resourceType: 'SDO',
        ids: ['s1', 's2'],
        permissions: ['RECORDING_READ'],
        authGroups: ['ag1']
      });

      expect(result).toEqual([
        {
          resourceType: 'SDO',
          id: 's1',
          hasPermission: true
        },
        {
          resourceType: 'SDO',
          id: 's2',
          hasPermission: false
        }
      ]);
      expectCacheLayer(true, 3); // 2 resource keys + 1 for org key
    });
  });
});
