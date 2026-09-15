const mockUtil = require('../../../test/mockUtil.js')();
const createServiceContext = require('../../../test/serviceContext.mock.js');
const _ = require('lodash');
describe('RBAC DAL Authorization Permission Set', () => {
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
    dal = require('./authPermissionSet.dal.js')(serviceContext);
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

  describe('getAuthPermissionSetsDb', () => {
    it('getAuthPermissionSets from Db', async () => {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 'permission_set_id',
            bit_field:
              '0000000000000000000000000000100000000100000000000000000000000000'
          }
        ],
        false,
        [
          'permission_set_id',
          'permission_set_name ~',
          'offset',
          'limit',
          'permission_set_class'
        ]
      );
      const r = await dal.getAuthPermissionSetsDb({
        ids: ['testid1', 'testid2'],
        nameRegex: 'test.*',
        authClass: ['standard', 'application'],
        organizationGuid: ORG_GUID
      });
      expect(r).not.toBeNull();
      expect(r[0].id).toEqual('permission_set_id');
      // returns AIWARE equivalent permission for the legacy JOB_CREATE, but not for RECORDING_DELETE since no AIWARE equivalent exists
      expect(r[0].permissions).toEqual(
        expect.arrayContaining(['AIWARE_JOB_UPDATE', 'RECORDING_DELETE'])
      );
    });
    it('no filters', async () => {
      serviceContext.dbConnections['sso'].read._push([], true, [
        'permission_set_id',
        'offset',
        'limit'
      ]);
      const r = await dal.getAuthPermissionSetsDb({});
      expect(r).not.toBeNull();
      expect(r).toEqual([]);
    });
    it('get by name - invalid regex', async () => {
      expect(async () =>
        dal.getAuthPermissionSetsDb({
          organizationGuid: 'e04ac23f-259b-44b1-8ae0-1ba959113386',
          nameRegex: ')][]:5,test.*'
        })
      ).rejects.toThrow('Invalid regular expression');
    });
    it('invalid organizationGuid', async () => {
      expect(async () =>
        dal.getAuthPermissionSetsDb({
          organizationGuid: 'invalid-organizationGuid'
        })
      ).rejects.toThrow('An organizationGuid must be a valid UUID');
    });
    it('invalid applicationID', async () => {
      expect(async () =>
        dal.getAuthPermissionSetsDb({
          applicationID: 'invalid-applicationID'
        })
      ).rejects.toThrow('An application ID must be a valid UUID');
    });
    it('invalid roleID', async () => {
      expect(async () =>
        dal.getAuthPermissionSetsDb({
          roleID: 'invalid-roleID'
        })
      ).rejects.toThrow('A roleID ID must be a valid UUID');
    });
  });

  describe('getAuthPermissionSets', () => {
    it('should return cached value', async () => {
      const cachedValue = [
        {
          id: 'permission_set_id',
          permissions: ['JOB_UPDATE', 'RECORDING_DELETE']
        }
      ];
      mockImplementationCacheLayer(false, cachedValue);

      const r = await dal.getAuthPermissionSets({
        ids: ['testid1', 'testid2'],
        nameRegex: 'test.*',
        authClass: ['standard', 'application'],
        organizationGuid: ORG_GUID
      });
      expect(r).not.toBeNull();
      expect(r[0].id).toEqual('permission_set_id');
      expect(r[0].permissions).toEqual(
        expect.arrayContaining(['JOB_UPDATE', 'RECORDING_DELETE'])
      );
      expectCacheLayer(false);
      expect(
        serviceContext.dbConnections['sso'].read._resultQueueSize()
      ).toEqual(0);
    });
    it('should return value from Db', async () => {
      mockImplementationCacheLayer(true, null);
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 'permission_set_id',
            bit_field:
              '0000000000000000000000000000100000000100000000000000000000000000'
          }
        ],
        false,
        [
          'permission_set_id',
          'permission_set_name ~',
          'offset',
          'limit',
          'permission_set_class'
        ]
      );
      const r = await dal.getAuthPermissionSets({
        ids: ['testid1', 'testid2'],
        nameRegex: 'test.*',
        authClass: ['standard', 'application'],
        organizationGuid: ORG_GUID
      });
      expect(r).not.toBeNull();
      expect(r[0].id).toEqual('permission_set_id');
      expect(r[0].permissions).toEqual(
        expect.arrayContaining([
          'AIWARE_JOB_UPDATE',
          'CMS_RECORDING_DELETE',
          'RECORDING_DELETE'
        ])
      );
    });
    it('should not return data from cache when skipCache is true', async () => {
      const cachedValue = [
        {
          id: 'cached_permission_set_id',
          permissions: ['CACHED_PERMISSION']
        }
      ];
      mockImplementationCacheLayer(false, cachedValue);

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 'fresh_permission_set_id',
            bit_field:
              '0000000000000000000000000000100000000100000000000000000000000000'
          }
        ],
        false,
        [
          'permission_set_id',
          'permission_set_name ~',
          'offset',
          'limit',
          'permission_set_class'
        ]
      );

      const r = await dal.getAuthPermissionSets({
        ids: ['testid1', 'testid2'],
        nameRegex: 'test.*',
        authClass: ['standard', 'application'],
        organizationGuid: ORG_GUID,
        skipCache: true
      });

      expect(r).not.toBeNull();
      expect(r[0].id).toEqual('fresh_permission_set_id'); // Should get fresh data, not cached
      expect(r[0].permissions).toEqual(
        expect.arrayContaining([
          'AIWARE_JOB_UPDATE',
          'CMS_RECORDING_DELETE',
          'RECORDING_DELETE'
        ])
      );

      expect(serviceContext.redisCache.isCacheDirty).toHaveBeenCalledTimes(1);
      expect(serviceContext.redisCache.get).toHaveBeenCalledTimes(2);
      expect(serviceContext.redisCache.asyncSet).toHaveBeenCalledTimes(2);
    });
  });

  describe('createAuthPermissionSet - Missing org guid', () => {
    it('createAuthPermissionSet', async () => {
      const inputArgs = {
        id: 'permission_set_1',
        name: 'permission_set_name_1',
        description: 'permission_set_description_1',
        permissions: ['RECORDING_READ', 'JOB_CREATE']
      };
      try {
        const r = await dal.createAuthPermissionSet(inputArgs);
      } catch (err) {
        expect(err).not.toBeNull();
        expect(`${err}`).toContain('organizationGuid is invalid');
      }
    });
  });

  describe('createAuthPermissionSet', () => {
    it('createAuthPermissionSet', async () => {
      const inputArgs = {
        id: 'permission_set_1',
        name: 'permission_set_name_1',
        description: 'permission_set_description_1',
        organizationGuid: '817aa606-352e-4609-8f1a-2de09e565f1f',
        permissions: ['RECORDING_READ', 'JOB_CREATE'],
        authClass: 'test_class',
        protected: true
      };
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: 'permission_set_1',
            bit_field:
              '0000000000000000000000000010000000010000000000000000000000000000'
          }
        ],
        true,
        [
          'INSERT',
          'permission_set_1',
          'permission_set_name_1',
          'permission_set_description_1',
          'x0000002010000000',
          'test_class',
          'protected'
        ]
      );
      const r = await dal.createAuthPermissionSet(inputArgs);
      expect(r).not.toBeNull();
      expect(r.id).toEqual('permission_set_1');
      expect(r.permissions).toEqual(
        expect.arrayContaining(['AIWARE_JOB_CREATE', 'CMS_RECORDING_READ'])
      );
    });
  });

  describe('updateAuthPermissionSet', () => {
    it('updateAuthPermissionSet', async () => {
      const inputArgs = {
        id: 'permission_set_1',
        name: 'permission_set_name_1',
        description: 'permission_set_description_1',
        permissions: ['RECORDING_UPDATE', 'NO_ACCESS', 'DEVELOPER_ENGINE_READ'],
        protected: true
      };
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: 'permission_set_1',
            bit_field:
              '00000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000'
          }
        ],
        true,
        [
          'UPDATE',
          'permission_set_1',
          'permission_set_name_1',
          'permission_set_description_1',
          'protected',
          'x00000000080000000000000008000000'
        ]
      );
      const r = await dal.updateAuthPermissionSet(inputArgs);
      expect(r).not.toBeNull();
      expect(r.id).toEqual('permission_set_1');
      expect(r.permissions).toEqual(
        expect.arrayContaining(['RECORDING_UPDATE', 'DEVELOPER_ENGINE_READ'])
      );
    });
    it('updateAuthPermissionSet - handle missing id', async () => {
      const inputArgs = {
        id: 'permission_set_1',
        name: 'permission_set_name_1',
        description: 'permission_set_description_1',
        permissions: ['RECORDING_READ', 'JOB_CREATE']
      };
      serviceContext.dbConnections['sso'].write._push([]);
      expect(async () =>
        dal.updateAuthPermissionSet(inputArgs)
      ).rejects.toThrow('Authorization permission set not found');
    });
  });

  describe('checkPermissions', () => {
    const role = {
      permissionMask: [1006879808, 63118848, 262144]
    };
    it('match single permission', () => {
      expect(dal.checkPermissions(role, ['admin.user.read'])).toEqual(true);
      expect(dal.checkPermissions(role, ['cms.media.delete'])).toEqual(true);
      expect(
        dal.checkPermissions(role, ['collections.collections.create'])
      ).toEqual(true);
      expect(dal.checkPermissions(role, ['cms.sources.read'])).toEqual(true);

      expect(dal.checkPermissions(role, ['admin.user.read'], true)).toEqual(
        true
      );
      expect(dal.checkPermissions(role, ['admin.user.read'], false)).toEqual(
        true
      );
    });

    it('miss single permission', () => {
      expect(dal.checkPermissions(role, ['ADMIN_ORG_READ'])).toEqual(false);
      expect(dal.checkPermissions(role, ['DEVELOPER_ENGINE_CREATE'])).toEqual(
        false
      );
      expect(dal.checkPermissions(role, ['CMS_SOURCES_UPDATE'])).toEqual(false);

      expect(dal.checkPermissions(role, ['ADMIN_ORG_READ'], false)).toEqual(
        false
      );
      expect(dal.checkPermissions(role, ['ADMIN_ORG_READ'], true)).toEqual(
        false
      );
    });

    it('require all', () => {
      expect(
        dal.checkPermissions(
          role,
          ['admin.user.read', 'cms.sources.read'],
          true
        )
      ).toEqual(true);
      expect(
        dal.checkPermissions(
          role,
          ['admin.user.read', 'developer.engine.create'],
          true
        )
      ).toEqual(false);
    });

    it('require any', () => {
      expect(
        dal.checkPermissions(
          role,
          ['admin.user.read', 'cms.sources.read'],
          true
        )
      ).toEqual(true);
      expect(
        dal.checkPermissions(
          role,
          ['admin.user.read', 'developer.engine.create'],
          false
        )
      ).toEqual(true);
      expect(
        dal.checkPermissions(
          role,
          ['admin.user.create', 'developer.engine.create'],
          false
        )
      ).toEqual(false);
    });

    const shortPermRole = {
      permissionMask: [1088] // 6 :  admin.user.read, 10:  admin.group.read
    };
    it('short permission mask tests', () => {
      expect(
        dal.checkPermissions(
          shortPermRole,
          ['admin.user.create', 'cms.sources.read'],
          false
        )
      ).toEqual(false);
      expect(
        dal.checkPermissions(
          shortPermRole,
          ['admin.user.read', 'cms.sources.read'],
          true
        )
      ).toEqual(false);
      expect(
        dal.checkPermissions(
          shortPermRole,
          ['admin.group.read', 'cms.sources.read'],
          false
        )
      ).toEqual(true);
      expect(
        dal.checkPermissions(
          shortPermRole,
          ['cms.sources.read', 'developer.engine.create'],
          false
        )
      ).toEqual(false);
    });
  });

  describe('mark cache dirty', () => {
    let serviceContext1, dal1;
    beforeAll(() => {
      serviceContext1 = createServiceContext();
      dal1 = require('./authPermissionSet.dal.js')(serviceContext1);
    });

    beforeEach(() => {
      serviceContext1._clearAll();
    });
    it('markCacheDirtyForGetAuthPermissionSets', async () => {
      await dal1.markCacheDirtyForGetAuthPermissionSets(ORG_GUID);
      expect(serviceContext1.redisCache.isCacheDirty()).toMatch(
        new RegExp(`permission_set_marked_key:${ORG_GUID}`)
      );
    });
  });
});
