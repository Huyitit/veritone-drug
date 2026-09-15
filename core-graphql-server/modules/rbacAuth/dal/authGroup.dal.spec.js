const mockUtil = require('../../../test/mockUtil.js')();
const createServiceContext = require('../../../test/serviceContext.mock.js');
const _ = require('lodash');
describe('RBAC DAL Authorization Group', () => {
  let dal;
  let serviceContext;
  const ORG_GUID = 'f4a061c4-68db-489c-be56-702bbe9c9aaf';
  beforeAll(() => {
    serviceContext = createServiceContext();
    serviceContext.redisCache = {
      get: jest.fn(),
      isCacheDirty: jest.fn(),
      clear: jest.fn(),
      asyncSet: jest.fn(),
      asyncClear: jest.fn()
    };
    dal = require('./authGroup.dal.js')(serviceContext);
  });
  beforeEach(() => {
    serviceContext._clearAll();
    serviceContext.redisCache.get.mockClear();
    serviceContext.redisCache.isCacheDirty.mockClear();
    serviceContext.redisCache.asyncClear.mockClear();
    serviceContext.redisCache.asyncSet.mockClear();
  });

  function mockImplementationCacheLayer(isCacheDirty, cachedValue) {
    serviceContext.redisCache.get.mockResolvedValueOnce('timestamp_value');
    serviceContext.redisCache.isCacheDirty.mockReturnValueOnce(isCacheDirty);
    serviceContext.redisCache.get.mockResolvedValueOnce(cachedValue);
  }

  function expectCacheLayer(isCacheDirty) {
    expect(serviceContext.redisCache.isCacheDirty).toHaveBeenCalledTimes(1);
    expect(serviceContext.redisCache.asyncClear).toHaveBeenCalledTimes(
      isCacheDirty ? 2 : 0
    );
    expect(serviceContext.redisCache.get).toHaveBeenCalledTimes(2);
    expect(serviceContext.redisCache.asyncSet).toHaveBeenCalledTimes(
      isCacheDirty ? 2 : 0
    );
  }

  describe('getAuthGroupsDb', () => {
    it('getAuthGroups from Db', async () => {
      serviceContext.dbConnections['sso'].read._push(
        [{ id: 1 }, { id: 2 }],
        false,
        [
          'organization_guid',
          'auth_group_id',
          `OR ag.auth_group_class = \'user\')`
        ]
      );
      const g = await dal.getAuthGroupsDb({
        orgGuid: ORG_GUID,
        ids: ['g1', 'g2', 'g3'],
        authClass: ['standard', 'application'],
        offset: 3,
        limit: 5
      });
      expect(g).not.toBeNull();
      expect(g.count).toEqual(2);
      expect(g.offset).toEqual(3);
      expect(g.limit).toEqual(5);
      expect(g.records[1].id).toEqual(2);
    });

    it('getAuthGroupsDb by name', async () => {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 1
          }
        ],
        false, // the sql test parser doesn't support `~` operator
        ['auth_group_name ~ $2']
      );
      const g = await dal.getAuthGroupsDb({
        orgGuid: 'org_guid',
        nameRegex: 'test.*'
      });
      expect(g).not.toBeNull();
      expect(g.count).toEqual(1);
      expect(g.records[0].id).toEqual(1);
    });

    it('getAuthGroupsDb by name - invalid regex', async () => {
      expect(async () =>
        dal.getAuthGroupsDb({
          orgGuid: 'org_guid',
          nameRegex: ')][]:5,test.*'
        })
      ).rejects.toThrow('Invalid regular expression');
    });
  });

  describe('getAuthGroups', () => {
    it('should return cached value', async () => {
      const cachedValue = {
        offset: 3,
        limit: 5,
        records: [{ id: 1 }, { id: 2 }],
        count: 2
      };
      mockImplementationCacheLayer(false, cachedValue);

      const g = await dal.getAuthGroups({
        orgGuid: ORG_GUID,
        ids: ['g1', 'g2', 'g3'],
        offset: 3,
        limit: 5
      });
      expect(g).not.toBeNull();
      expect(g.count).toEqual(2);
      expect(g.offset).toEqual(3);
      expect(g.limit).toEqual(5);
      expect(g.records[1].id).toEqual(2);
      expectCacheLayer(false);
      expect(
        serviceContext.dbConnections['sso'].read._resultQueueSize()
      ).toEqual(0);
    });
    it('should return value from Db', async () => {
      mockImplementationCacheLayer(true, null);
      serviceContext.dbConnections['sso'].read._push(
        [{ id: 1 }, { id: 2 }],
        false,
        ['organization_guid', 'auth_group_id']
      );
      const g = await dal.getAuthGroups({
        orgGuid: ORG_GUID,
        ids: ['g1', 'g2', 'g3'],
        offset: 3,
        limit: 5
      });
      expect(g).not.toBeNull();
      expect(g.count).toEqual(2);
      expect(g.offset).toEqual(3);
      expect(g.limit).toEqual(5);
      expect(g.records[1].id).toEqual(2);
      expectCacheLayer(true);
    });
  });

  describe('updateAuthGroup', () => {
    it('updateAuthGroup', async () => {
      const inputArgs = {
        orgGuid: 'org_guid',
        id: 'g1',
        name: 'g1name',
        description: 'g1description',
        userId: '123'
      };
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: 'g1'
          }
        ],
        true,
        [],
        (sql, args) => {
          for (const v of _.values(inputArgs)) {
            if (args.indexOf(v) < 0) {
              return false;
            }
          }
          return true;
        }
      );
      const g = await dal.updateAuthGroup(inputArgs);
      expect(g).not.toBeNull();
      expect(g.id).toEqual('g1');
    });
    it('updateAuthGroup - handle missing id', async () => {
      const inputArgs = {
        orgGuid: 'org_guid',
        id: 'g1',
        name: 'g1name',
        description: 'g1description',
        userId: '123'
      };
      serviceContext.dbConnections['sso'].write._push([]);
      expect(async () => dal.updateAuthGroup(inputArgs)).rejects.toThrow(
        'Authorization group not found'
      );
    });
    it('updateAuthGroup - handle unsupportedAuthClasses', async () => {
      const inputArgs = {
        orgGuid: 'org_guid',
        id: 'g1',
        name: 'g1name',
        description: 'g1description',
        userId: '123',
        unsupportedAuthClasses: ['User']
      };
      serviceContext.dbConnections['sso'].write._push(
        [],
        false,
        [],
        (sql, params) => {
          expect(sql).toMatch(/auth_group_class != ALL\(/);
          expect(params[6]).toEqual(['User']);
          return true;
        }
      );
      expect(async () => dal.updateAuthGroup(inputArgs)).rejects.toThrow(
        'Authorization group not found'
      );
    });
  });

  describe('deleteAuthGroup', () => {
    it('deleteAuthGroup', async () => {
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['sso'].write._push([], true, [
        'rbac_auth_group_member'
      ]);
      serviceContext.dbConnections['sso'].write._push([], true, ['rbac_acl']);
      serviceContext.dbConnections['sso'].write._push([], true, [
        'rbac_auth_group'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      const g = await dal.deleteAuthGroup({ id: 'group_x' });
      expect(g).not.toBeNull();
      expect(g).toEqual({ id: 'group_x' });
    });
  });
  describe('getUserPrivateAuthGroup', () => {
    it('should return undefined when no private group found', async () => {
      const orgGuid = 'test-org-guid';
      const userId = 'test-user-id';

      serviceContext.dbConnections['sso'].read._push(
        [], // Empty result
        true,
        ['SELECT', 'rbac_auth_group', 'rbac_auth_group_member']
      );

      const result = await dal.getUserPrivateAuthGroup(orgGuid, userId);

      expect(result).toBeUndefined();
    });

    it('should throw InvalidInput error when both parameters are missing', async () => {
      await expect(dal.getUserPrivateAuthGroup(null, null)).rejects.toThrow(
        'User ID and Organization GUID are required to get private auth group'
      );
    });

    it('should return first result when multiple groups found', async () => {
      const orgGuid = 'test-org-guid';
      const userId = 'test-user-id';
      const firstGroup = {
        id: 'first-group-id',
        name: 'First Private Group',
        authClass: 'User'
      };
      const secondGroup = {
        id: 'second-group-id',
        name: 'Second Private Group',
        authClass: 'User'
      };

      serviceContext.dbConnections['sso'].read._push(
        [firstGroup, secondGroup], // Multiple results
        true,
        ['SELECT', 'rbac_auth_group', 'rbac_auth_group_member']
      );

      const result = await dal.getUserPrivateAuthGroup(orgGuid, userId);

      expect(result).toEqual(firstGroup);
    });
  });

  describe('getPrivateAuthGroupOwners', () => {
    beforeEach(() => {
      // These tests drive the read-through cache directly, so start each with a clean
      // redis mock — a leaked mockResolvedValueOnce from another suite must not bleed in.
      serviceContext.redisCache.get.mockReset();
      serviceContext.redisCache.asyncSet.mockReset();
    });

    it('returns empty array without querying when no ids are given', async () => {
      expect(await dal.getPrivateAuthGroupOwners([])).toEqual([]);
      expect(
        serviceContext.dbConnections['sso'].read._resultQueueSize()
      ).toBe(0);
    });

    it('resolves private (User-class) auth groups to their owning user', async () => {
      serviceContext.dbConnections['sso'].read._push(
        [
          { id: 'pg-1', user_id: 'user-1' },
          { id: 'pg-2', user_id: 'user-2' }
        ],
        false,
        [
          'rbac_auth_group',
          'rbac_auth_group_member',
          "ag.auth_group_class = 'User'",
          "agm.member_type = 'user'"
        ]
      );

      const result = await dal.getPrivateAuthGroupOwners([
        'pg-1',
        'pg-2',
        'standard-group-3'
      ]);

      expect(result).toEqual([
        { id: 'pg-1', userId: 'user-1' },
        { id: 'pg-2', userId: 'user-2' }
      ]);
    });

    it('caches positives and negatives, serving a repeat call without a DB query', async () => {
      serviceContext.dbConnections['sso'].read._push(
        [{ id: 'pg-1', user_id: 'user-1' }],
        false,
        ["ag.auth_group_class = 'User'"]
      );

      const first = await dal.getPrivateAuthGroupOwners(['pg-1', 'org-2']);
      expect(first).toEqual([{ id: 'pg-1', userId: 'user-1' }]);

      // private hit cached as the userId; the non-private id cached as the sentinel
      expect(serviceContext.redisCache.asyncSet).toHaveBeenCalledWith(
        'rbacPrivateAuthGroupOwners',
        'pg-1',
        'user-1',
        null,
        720
      );
      expect(serviceContext.redisCache.asyncSet).toHaveBeenCalledWith(
        'rbacPrivateAuthGroupOwners',
        'org-2',
        '__NOT_PRIVATE__',
        null,
        720
      );

      // Poison row that MUST NOT be consumed — the repeat is served from L1.
      serviceContext.dbConnections['sso'].read._push(
        [{ id: 'pg-1', user_id: 'leaked-from-db' }],
        false,
        []
      );
      const second = await dal.getPrivateAuthGroupOwners(['pg-1', 'org-2']);
      expect(second).toEqual([{ id: 'pg-1', userId: 'user-1' }]);
      expect(
        serviceContext.dbConnections['sso'].read._resultQueueSize()
      ).toBe(1);
    });

    it('serves an all-non-private batch from the negative cache on repeat', async () => {
      serviceContext.dbConnections['sso'].read._push([], false, []);

      expect(await dal.getPrivateAuthGroupOwners(['org-1', 'org-2'])).toEqual(
        []
      );

      // poison row that must not be consumed on the cached repeat
      serviceContext.dbConnections['sso'].read._push(
        [{ id: 'org-1', user_id: 'leaked' }],
        false,
        []
      );
      expect(await dal.getPrivateAuthGroupOwners(['org-1', 'org-2'])).toEqual(
        []
      );
      expect(
        serviceContext.dbConnections['sso'].read._resultQueueSize()
      ).toBe(1);
    });

    it('resolves from the L2 cache without querying the DB', async () => {
      serviceContext.redisCache.get.mockImplementation(async (type, id) => {
        if (id === 'pg-1') return 'user-1';
        if (id === 'org-2') return '__NOT_PRIVATE__';
        return undefined;
      });
      // poison row that must not be consumed
      serviceContext.dbConnections['sso'].read._push(
        [{ id: 'pg-1', user_id: 'leaked' }],
        false,
        []
      );

      const result = await dal.getPrivateAuthGroupOwners(['pg-1', 'org-2']);
      expect(result).toEqual([{ id: 'pg-1', userId: 'user-1' }]);
      expect(
        serviceContext.dbConnections['sso'].read._resultQueueSize()
      ).toBe(1);
      expect(serviceContext.redisCache.asyncSet).not.toHaveBeenCalled();
    });

    it('returns empty array on query failure without poisoning the cache', async () => {
      serviceContext.dbConnections['sso'].read._push([], false, [], null, true);

      await expect(
        dal.getPrivateAuthGroupOwners(['pg-1'])
      ).resolves.toEqual([]);
      expect(serviceContext.redisCache.asyncSet).not.toHaveBeenCalled();
    });

    // VE-26433: the cache-unavailable bypass branch (`if (!redisCache || !localCache)`)
    // is only reachable from a serviceContext built WITHOUT those two fields — every test
    // above uses the outer beforeAll's fully-cached serviceContext. redisCache/localCache
    // are captured as closure consts when the DAL factory runs, so a separate factory
    // instance is required to exercise this branch.
    describe('when redisCache/localCache are unavailable on serviceContext', () => {
      let noCacheServiceContext;
      let noCacheDal;

      beforeEach(() => {
        noCacheServiceContext = createServiceContext();
        noCacheServiceContext.redisCache = undefined;
        noCacheServiceContext.localCache = undefined;
        noCacheDal = require('./authGroup.dal.js')(noCacheServiceContext);
      });

      it('bypasses the L1/L2 cache tiers and resolves directly from the DB', async () => {
        noCacheServiceContext.dbConnections['sso'].read._push(
          [{ id: 'pg-1', user_id: 'user-1' }],
          false,
          ["ag.auth_group_class = 'User'"]
        );

        const result = await noCacheDal.getPrivateAuthGroupOwners(['pg-1']);

        expect(result).toEqual([{ id: 'pg-1', userId: 'user-1' }]);
      });

      it('swallows a DB error and returns [] instead of throwing (never-throw contract)', async () => {
        noCacheServiceContext.dbConnections['sso'].read._push(
          [],
          false,
          [],
          null,
          true
        );

        await expect(
          noCacheDal.getPrivateAuthGroupOwners(['pg-1'])
        ).resolves.toEqual([]);
      });
    });
  });

  describe('members crud', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });
    it('addMembersToAuthGroup', async () => {
      const members = [];
      for (let i = 0; i < 100; i++) {
        members.push({ id: i, memberType: i % 2 ? 'Group' : 'User' });
      }
      serviceContext.dbConnections['sso'].write._push(
        [],
        true,
        ['INSERT'],
        (sql, args) => {
          if (!args[0] === 'group_x') {
            return false;
          }
          for (let i = 1; i < args.length; i++) {
            if (args[i] !== members[i - 1].id) {
              return false;
            }
          }
          return true;
        }
      );
      await dal.addMembersToAuthGroup('group_x', members);
    });
    it('removeMembersFromAuthGroup', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [],
        true,
        ['DELETE'],
        (sql, args) => {
          if (!args[0] === 'group_x') {
            return false;
          }
          return true;
        }
      );
      await dal.removeMembersFromAuthGroup('group_x', [1, 2, 3, 4]);
    });

    it('getAuthGroupMembers', async () => {
      serviceContext.dbConnections['sso'].write._push([{ id: 1 }], false, [
        'rbac_auth_group_member',
        'member_type',
        'member_id',
        'limit',
        'offset'
      ]);
      const g = await dal.getAuthGroupMembers('group_x', {
        memberType: 'Group',
        ids: [1]
      });
      expect(g[0].id).toEqual(1);
    });

    it('getAuthGroupsContainingMember', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [{ id: 1 }],
        true,
        [
          'rbac_auth_group',
          'rbac_auth_group_member',
          'organization_guid',
          'member_id'
        ],
        (sql, args) => {
          if (args[0] !== 123) {
            return false;
          }
          if (args[1] !== 'group_x') {
            return false;
          }
          return true;
        }
      );
      const g = await dal.getAuthGroupsContainingMember('group_x', {
        orgGuid: 123
      });
      expect(g.records[0].id).toEqual(1);
    });
  });

  xdescribe('check organization permissions', () => {
    it('getAuthGroupsPermissionMaskForOrganization', async () => {
      serviceContext.dbConnections['sso'].read._push(
        [{ mask: '0000000100010110000' }],
        false,
        ['bit_or', 'permissions', 'organization_id', 'auth_group_id']
      );
      const g = await dal.getAuthGroupsPermissionMaskForOrganization(
        'org_guid',
        ['g1', 'g2', 'g3']
      );
      expect(g).toEqual([2224]);
    });
  });

  describe('isResourceExist', () => {
    const tdoResourceType = 'TDO';
    const folderResourceType = 'Folder';
    const invalidResourceType = 'Foo';
    const resourceId = '201134';

    it('TDO resource exists', async () => {
      serviceContext.dbConnections['core'].read._push(['foo']);
      expect(await dal.isResourceExist(tdoResourceType, resourceId)).toEqual(
        true
      );
    });
    it('Folder resource exists', async () => {
      serviceContext.dbConnections['media_platform'].read._push(['foo']);
      expect(await dal.isResourceExist(folderResourceType, resourceId)).toEqual(
        true
      );
    });
    it('Invalid resource type', async () => {
      await dal
        .isResourceExist(invalidResourceType, resourceId)
        .catch((err) => err.message === 'Invalid resource type');
    });
    it('Resource does not exist', async () => {
      const err = new Error();
      err.data = {
        internalData: {
          code: 0
        }
      };
      serviceContext.dbConnections['core'].read._push(err);
      expect(await dal.isResourceExist(tdoResourceType, resourceId)).toEqual(
        false
      );
    });
  });

  describe('authResourceRoleAssign', () => {
    const GROUP_ID = '78795ffd-6c21-4455-8bce-bedb15f820b2';
    const TDO_ID = '2040000002';
    const FOLDER_ID = '5a17135c-3330-4269-a6a5-37b01f455d46';
    const ROLE_ID = '5a650228-050b-4d7e-a581-64f83827a063';

    it('success', async () => {
      const args = {
        input: {
          groupId: GROUP_ID,
          resourceType: 'Folder',
          resourceId: FOLDER_ID,
          roleId: ROLE_ID
        }
      };
      const dbTx = {
        client: {
          query: jest.fn(),
          done: jest.fn()
        }
      };
      const sql = `INSERT INTO public.rbac_folder_role
        (auth_group_id, role_id, folder_id)
      VALUES
        ($1, $2, $3)
      ON CONFLICT DO NOTHING`;

      const sqlArgs = [GROUP_ID, ROLE_ID, FOLDER_ID];
      await dal.authResourceRoleAssign(args, dbTx);
      expect(dbTx.client.query).toHaveBeenCalledWith(sql, sqlArgs);
      expect(dbTx.client.done).not.toHaveBeenCalled();
    });
    it('error', async () => {
      const args = {
        input: {
          groupId: GROUP_ID,
          resourceType: 'Folder',
          resourceId: FOLDER_ID,
          roleId: ROLE_ID
        }
      };
      serviceContext.dbConnections['core'].write._push(new Error('Boom!'));
      await dal
        .authResourceRoleAssign(args)
        .catch((err) => err.message === 'Boom!');
    });
  });
  describe('getAuthGroupMemberIds', () => {
    it('success', async () => {
      const authGroupIds = ['ag_1', 'ag_2'];
      const opts = {
        memberType: 'User'
      };
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 'm_1'
          },
          {
            id: 'm_2'
          }
        ],
        true,
        ['DISTINCT', 'member_id', 'user']
      );
      const res = await dal.getAuthGroupMemberIds(authGroupIds, opts);
      expect(res).toEqual(expect.arrayContaining(['m_1', 'm_2']));
    });
    it('error', async () => {
      const authGroupIds = ['ag_1', 'ag_2'];
      const opts = {
        memberType: 'User'
      };

      serviceContext.dbConnections['sso'].read._push(new Error('error'));
      const res = await dal.getAuthGroupMemberIds(authGroupIds, opts);

      expect(res.length).toEqual(0);
    });
  });

   describe('getAuthGroupMemberCount', () => {
    it('success', async () => {
      const authGroupId = 'ag_1';
      const opts = {
        memberType: 'User'
      };
      serviceContext.dbConnections['sso'].read._push(
        [
          { count: 10 }
        ],
        true,
        ['count']
      );
      const res = await dal.getAuthGroupMemberCount(authGroupId, opts);
      expect(res).toEqual(10);
    });
    it('error', async () => {
      serviceContext.dbConnections['sso'].read._push([]);
      const res = await dal.getAuthGroupMemberCount('ag1');
      expect(res).toEqual(0);
    });
    it('error', async () => {
      expect(async () => dal.getAuthGroupMemberCount()).rejects.toThrow();
    });
  });

  describe('mark cache dirty', () => {
    let serviceContext1, dal1;
    beforeAll(() => {
      serviceContext1 = createServiceContext();
      dal1 = require('./authGroup.dal.js')(serviceContext1);
    });

    beforeEach(() => {
      serviceContext1._clearAll();
    });
    it('markCacheDirtyForGetAuthGroups', async () => {
      await dal1.markCacheDirtyForGetAuthGroups(ORG_GUID);
      expect(serviceContext1.redisCache.isCacheDirty()).toMatch(
        new RegExp(`group_marked_key:${ORG_GUID}`)
      );
    });
  });
});

describe('createAuthGroup', () => {
  let dal;
  let serviceContext;
  beforeAll(() => {
    serviceContext = createServiceContext({
      throwOnNoResultInQueue: false
    });
    dal = require('./authGroup.dal.js')(serviceContext);
  });
  beforeEach(() => {
    serviceContext._clearAll();
  });
  it('createAuthGroup throws error when the same group name is used within an org', async () => {
    const inputArgs = {
      orgGuid: 'org_guid',
      id: 'g1',
      name: 'g1name',
      description: 'g1description',
      userId: '123'
    };
    serviceContext.dbConnections['sso'].write._push(
      [
        {
          name: 'g1name'
        }
      ],
      true,
      [],
      (sql, args) => {
        if (_.intersection(_.values(inputArgs), args).length !== args.length) {
          return false;
        }
        return true;
      }
    );
    await dal
      .createAuthGroup(inputArgs)
      .catch(
        (err) =>
          err.message ===
          'The requested mutation could not be executed because of a conflict with an existing resource, such as duplicate name or ID.'
      );
  });
  it('createAuthGroup succeeds', async () => {
    const inputArgs = {
      orgGuid: 'org_guid',
      id: 'g2',
      name: 'g2name',
      description: 'g2description',
      userId: '123',
      authClass: 'test_class'
    };
    let err;
    await dal.createAuthGroup(inputArgs).catch((e) => (err = e));
    expect(err).not.toBe('undefined');
  });
  it('createAuthGroup deletes created group and marks add-member failure when adding members fails', async () => {
  const inputArgs = {
    orgGuid: 'org_guid',
    id: 'g3',
    name: 'g3name',
    description: 'g3description',
    userId: '123',
    authClass: 'test_class',
    members: [
      {
        id: 'user_1',
        memberType: 'User'
      }
    ]
  };

  const addMembersError = new Error('failed to add members');

  // Existing group lookup: no duplicate.
  serviceContext.dbConnections['sso'].read._push([], true, [
    'SELECT',
    'rbac_auth_group'
  ]);

  // Insert auth group succeeds.
  serviceContext.dbConnections['sso'].write._push(
    [{ id: 'g3' }],
    true,
    ['INSERT INTO rbac_auth_group']
  );

  // addMembersToAuthGroup fails.
  serviceContext.dbConnections['sso'].write._push(addMembersError);

  // deleteAuthGroup cleanup transaction.
  serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);

  serviceContext.dbConnections['sso'].write._push(
    [],
    true,
    ['DELETE FROM rbac_auth_group_member'],
    (sql, args) => {
      expect(args).toEqual(['g3']);
      return true;
    }
  );

  serviceContext.dbConnections['sso'].write._push(
    [],
    true,
    ['DELETE FROM rbac_acl'],
    (sql, args) => {
      expect(args).toEqual(['g3']);
      return true;
    }
  );

  serviceContext.dbConnections['sso'].write._push(
    [],
    true,
    ['DELETE FROM rbac_auth_group'],
    (sql, args) => {
      expect(args).toEqual(['g3']);
      return true;
    }
  );

  serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);

  const result = await dal.createAuthGroup(inputArgs);

  expect(result).toEqual({
    id: 'g3',
    memberCount: 1,
    isAddMemberFailed: true
  });
});
});
