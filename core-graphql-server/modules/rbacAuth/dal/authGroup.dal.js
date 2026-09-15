const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../../../util.js')(serviceContext);
  const mapper = require('../../../dal/mapper.js');
  const errors = require('../../../error')(serviceContext.config);
  const { parsePaginationArgs } = require('../../../util/paginationParser')(
    serviceContext
  );
  const fpUtil = require('./functionalPermissionsUtil.dal')(serviceContext);
  const { RESOURCE_TYPE_DB_MAP } = require('./resourceTypes.js')();
  const redisCache = serviceContext.redisCache;
  const localCache = serviceContext.localCache;

  const PRIVATE_AUTH_GROUP_OWNER_TYPE_KEY = 'rbacPrivateAuthGroupOwners';
  const PRIVATE_AUTH_GROUP_OWNER_L2_TTL_MIN = 720; // 12h
  const PRIVATE_AUTH_GROUP_OWNER_NOT_PRIVATE = '__NOT_PRIVATE__';

  function mapAuthGroup(row) {
    return mapper.camelizeRootKeys(row);
  }

  const AUTHGROUP_SELECT_FIELDS = [
    'auth_group_id AS id',
    'auth_group_name AS name',
    'auth_group_description AS description',
    'organization_guid AS organization_id',
    'source',
    'role_id',
    'is_protected',
    'auth_group_class as auth_class',
    'date_created',
    'date_modified',
    'created_by',
    'modified_by'
  ];

  const enumSourceValues = {
    API: 'API',
    Integration: 'Integration',
    AppRole: 'App Role'
  };

  async function getUserPrivateAuthGroup(orgGuid, userId) {
    if (!orgGuid || !userId) {
      throw new errors.InvalidInput({
        message:
          'User ID and Organization GUID are required to get private auth group'
      });
    }

    const sql = /*sql*/ `
      SELECT ${AUTHGROUP_SELECT_FIELDS.map((x) => 'ag.' + x).join(',\n')}
      FROM rbac_auth_group ag
      JOIN rbac_auth_group_member agm ON ag.auth_group_id = agm.auth_group_id
      WHERE ag.organization_guid = $1
      AND ag.auth_group_class = 'User'
      AND agm.member_id = $2
      AND agm.member_type = 'user'
    `;

    const result = await serviceContext.dbConnections['sso'].read.map(
      sql,
      [orgGuid, userId],
      mapAuthGroup
    );

    return _.first(result);
  }

  // Raw lookup: of the given ids, return the private (User-class) ones and their owning
  // user. Throws on DB error so the cache-aware wrapper can avoid caching false negatives.
  async function _resolvePrivateAuthGroupOwners(authGroupIds) {
    const where = [];
    const args = [];
    mainUtil.addSqlWhere('ag.auth_group_id', authGroupIds, where, args);

    const sql = /*sql*/ `
      SELECT ag.auth_group_id AS id, agm.member_id AS user_id
      FROM rbac_auth_group ag
      JOIN rbac_auth_group_member agm ON ag.auth_group_id = agm.auth_group_id
      WHERE ${where.join(' AND ')}
      AND ag.auth_group_class = 'User'
      AND agm.member_type = 'user';
    `;

    return serviceContext.dbConnections['sso'].read.map(
      sql,
      args,
      mapper.camelizeRootKeys
    );
  }

  async function getPrivateAuthGroupOwners(authGroupIds) {
    if (_.isEmpty(authGroupIds)) {
      return [];
    }
    const ids = _.uniq(authGroupIds);

    // Cache unavailable (e.g. tests) -> preserve the original never-throw contract.
    if (!redisCache || !localCache) {
      try {
        return await _resolvePrivateAuthGroupOwners(ids);
      } catch (error) {
        return [];
      }
    }

    const owners = []; // [{ id, userId }] positives to return
    const l1Misses = [];

    // L1: in-process, no network.
    for (const id of ids) {
      const cached = localCache.get(PRIVATE_AUTH_GROUP_OWNER_TYPE_KEY, id);
      if (_.isNil(cached)) {
        l1Misses.push(id);
      } else if (cached !== PRIVATE_AUTH_GROUP_OWNER_NOT_PRIVATE) {
        owners.push({ id, userId: cached });
      }
    }

    // L2: one GET per L1-miss, in parallel; warm L1 on hit.
    const l2Misses = [];
    await Promise.all(
      l1Misses.map(async (id) => {
        const cached = await redisCache.get(
          PRIVATE_AUTH_GROUP_OWNER_TYPE_KEY,
          id
        );
        if (_.isNil(cached)) {
          l2Misses.push(id);
          return;
        }
        localCache.set(PRIVATE_AUTH_GROUP_OWNER_TYPE_KEY, id, cached);
        if (cached !== PRIVATE_AUTH_GROUP_OWNER_NOT_PRIVATE) {
          owners.push({ id, userId: cached });
        }
      })
    );

    // DB: single query for whatever neither layer knew; write back positives + negatives.
    if (l2Misses.length) {
      let rows;
      try {
        rows = await _resolvePrivateAuthGroupOwners(l2Misses);
      } catch (error) {
        // Never cache on failure — a transient error must not poison the cache with false
        // negatives for the L2 TTL. Return cached positives only; the ACERevoke fallback
        // keeps unresolved entries as the group member.
        serviceContext.logger.debug(
          'getPrivateAuthGroupOwners: DB lookup failed; returning cached positives, no cache write'
        );
        return owners;
      }

      const userByGroupId = new Map(rows.map((r) => [r.id, r.userId]));
      await Promise.all(
        l2Misses.map(async (id) => {
          const userId = userByGroupId.get(id);
          const value = userId || PRIVATE_AUTH_GROUP_OWNER_NOT_PRIVATE;
          localCache.set(PRIVATE_AUTH_GROUP_OWNER_TYPE_KEY, id, value);
          await redisCache.asyncSet(
            PRIVATE_AUTH_GROUP_OWNER_TYPE_KEY,
            id,
            value,
            null,
            PRIVATE_AUTH_GROUP_OWNER_L2_TTL_MIN
          );
          if (userId) {
            owners.push({ id, userId });
          }
        })
      );
    }

    return owners;
  }

  async function getAuthGroupsDb(options) {
    parsePaginationArgs(options);
    let where = [];
    const args = [];
    if (options.ids) {
      // If ids are passed in, User groups can be from a different org, since their ids equal
      // the userId, therefore there is only 1 default group per user across all orgs
      mainUtil.addSqlWhere('ag.auth_group_id', options.ids, where, args);

      // superadmin don't set orgGuid
      if (!_.isNil(options.orgGuid)) {
        args.push(options.orgGuid);
        where.push(
          `(ag.organization_guid = \$${args.length} OR ag.auth_group_class = 'User')`
        );
      }
    } else {
      mainUtil.addSqlWhere(
        'ag.organization_guid',
        options.orgGuid,
        where,
        args
      );
    }
    // search by exact match of a group name
    if (options.groupName) {
      mainUtil.addSqlWhere(
        'auth_group_name',
        options.groupName.trim(),
        where,
        args
      );
    } else if (options.nameRegex) {
      // Validate name regex
      try {
        new RegExp(options.nameRegex);
      } catch (err) {
        throw new errors.InvalidInput({
          message: `Invalid regular expression`,
          data: {
            value: options.nameRegex,
            errMessage: err.message
          }
        });
      }
      args.push(options.nameRegex);
      where.push(`(auth_group_name ~ $${args.length})`);
    }

    if (options.source) {
      if (enumSourceValues[options.source]) {
        mainUtil.addSqlWhere(
          'source',
          enumSourceValues[options.source],
          where,
          args
        );
      }
    }

    mainUtil.addSqlWhere('role_id', options.appRoleID, where, args);

    if (!_.isEmpty(options.authClass)) {
      args.push(options.authClass);
      where.push(`auth_group_class = ANY(\$${args.length}::text[])`);
    }

    if (!_.isEmpty(options.unsupportedAuthClasses)) {
      args.push(options.unsupportedAuthClasses);
      where.push(`auth_group_class != ALL(\$${args.length}::text[])`);
    }

    if (!_.isEmpty(options.createdDateTime)) {
      _.set(options.createdDateTime, 'field', 'date_created');
      mainUtil.addDateTimeFilters(
        'ag',
        options.createdDateTime,
        where,
        'pg_ts'
      );
    }
    if (!_.isEmpty(options.modifiedDateTime)) {
      _.set(options.createdDateTime, 'field', 'date_modified');
      mainUtil.addDateTimeFilters(
        'ag',
        options.modifiedDateTime,
        where,
        'pg_ts'
      );
    }

    let joinSQL = ``;
    if (options.member) {
      joinSQL = /*sql*/ `
        JOIN rbac_auth_group_member agm ON ag.auth_group_id = agm.auth_group_id`;
      mainUtil.addSqlWhere('agm.member_id', options.member.id, where, args);
      if (options.member.memberType) {
        mainUtil.addSqlWhere(
          'member_type',
          _.toLower(options.member.memberType),
          where,
          args
        );
      }
    }
    const limit = options.limit || 30;
    const offset = options.offset || 0;
    const sql = /*sql*/ `
    WITH ag AS (SELECT ${AUTHGROUP_SELECT_FIELDS.map((x) => 'ag.' + x).join(
      ',\n'
    )}   
    FROM rbac_auth_group ag ${joinSQL}
    WHERE ${where.join(
      ' AND '
    )} OFFSET ${offset} LIMIT ${limit}), cnt AS (SELECT auth_group_id as auth_group_id, count(1) as count
      FROM public.rbac_auth_group_member
      WHERE auth_group_id IN (SELECT auth_group_id FROM ag)
      GROUP BY auth_group_id
    )
    SELECT ag.*, COALESCE(cnt.count, 0) member_count FROM ag
    LEFT JOIN cnt ON cnt.auth_group_id = ag.id;`;

    const rows = await serviceContext.dbConnections['sso'].read.map(
      sql,
      args,
      mapAuthGroup
    );
    return mainUtil.toPage(options, rows);
  }

  async function createAuthGroup(options) {
    /** We can feature flag this, and enforce this on the db level with UNIQUE constraint */
    const readSql = `
    SELECT auth_group_id
    FROM rbac_auth_group
    WHERE auth_group_name = $1
    AND organization_guid = $2
    `;
    const existingGroup = await serviceContext.dbConnections['sso'].read.map(
      readSql,
      [options.name, options.orgGuid],
      mapAuthGroup
    );
    if (existingGroup.length) {
      throw new errors.ResourceConflict({
        data: {
          groupName: options.name,
          organizationGuid: options.orgGuid
        }
      });
    }

    // for creating appRole auth group
    if (!_.isNil(options.roleID) && _.isNil(options.source)) {
      options.source = enumSourceValues.AppRole;
    } else if (_.isNil(options.source)) {
      // default the source value
      options.source = enumSourceValues.API;
    }
    if (_.isNil(options.source)) {
      options.source = enumSourceValues.Integration;
    }

    options.isProtected = _.isBoolean(options.isProtected)
      ? options.isProtected
      : options.isSystem;

    const sql = /*sql*/ `
    INSERT INTO rbac_auth_group
    (auth_group_id, auth_group_name, auth_group_description, organization_guid, created_by, modified_by, is_protected, auth_group_class, source, role_id)
    VALUES($1, $2, $3, $4, $5, $5, $6, $7, $8, $9) 
    RETURNING ${AUTHGROUP_SELECT_FIELDS.join(',')};`;
    const res = await serviceContext.dbConnections['sso'].write.map(
      sql,
      [
        options.id,
        options.name,
        options.description,
        options.orgGuid,
        options.userId,
        !!options.isProtected,
        options.authClass,
        options.source,
        options.roleID
      ],
      mapAuthGroup
    );
    const { id } = res[0] || {};
    let isAddMemberFailed;
    if (id && options.members && options.members.length) {
      try {
        await addMembersToAuthGroup(id, options.members);
      } catch (e) {
        isAddMemberFailed = true;
        await deleteAuthGroup({ id });
      }
    }
    const membersHashmap = {};
    const dedupedMembers = [];
    (options.members || []).forEach((member) => {
      if (!membersHashmap[member.id]) {
        membersHashmap[member.id] = 1;
        dedupedMembers.push(member);
      }
    });
    const memberCount = dedupedMembers.length;
    return { ...res[0], memberCount, isAddMemberFailed };
  }

  async function updateAuthGroup(options) {
    const { name, description, userId, id, orgGuid, authClass } = options;
    if (!name && !description) {
      throw new errors.InvalidInput({
        message: 'Either name or description, or both should be provided'
      });
    }
    const args = [];
    let argNumber = 1;
    let set = [];
    let where = [];
    const appendSql = (clause, statement, arg) => {
      clause.push(`${statement} = $${argNumber}`);
      args.push(arg);
      argNumber++;
    };
    if (name) {
      appendSql(set, 'auth_group_name', name);
    }
    if (description) {
      appendSql(set, 'auth_group_description', description);
    }
    if (authClass) {
      appendSql(set, 'auth_group_class', authClass);
    }
    appendSql(set, 'modified_by', userId);
    appendSql(where, 'auth_group_id', id);
    appendSql(where, 'organization_guid', orgGuid);
    appendSql(where, 'is_protected', false);

    if (!_.isEmpty(options.unsupportedAuthClasses)) {
      args.push(options.unsupportedAuthClasses);
      where.push(`auth_group_class != ALL(\$${args.length}::text[])`);
    }

    const sql = /*sql*/ `
   	UPDATE rbac_auth_group SET 
  	${set.join(', ')}
  	WHERE ${where.join(' AND ')}
	  RETURNING ${AUTHGROUP_SELECT_FIELDS.join(',')};`;

    const res = await serviceContext.dbConnections['sso'].write.map(
      sql,
      args,
      mapAuthGroup
    );
    if (res.length !== 1) {
      throw new errors.NotFound({
        message: 'Authorization group not found',
        data: {
          groupId: options.id,
          organizationGuid: options.orgGuid
        }
      });
    }

    return res[0];
  }

  async function ssoWriteTx(openTx) {
    const ssoDbConn = openTx
      ? openTx.client
      : await serviceContext.dbConnections['sso'].write.connect();
    const noop = () => { };
    return {
      client: ssoDbConn,
      begin: openTx ? noop : () => ssoDbConn.query('BEGIN'),
      commit: openTx ? noop : () => ssoDbConn.query('COMMIT'),
      rollback: openTx ? noop : () => ssoDbConn.query('ROLLBACK'),
      done: openTx ? noop : () => ssoDbConn.done()
    };
  }

  async function deleteAuthGroup(options) {
    // TODO: DISCUSS: should we do soft-deletes?
    const dbTran = await ssoWriteTx();
    try {
      await dbTran.begin();
      await dbTran.client.query(
        `DELETE FROM rbac_auth_group_member WHERE auth_group_id = $1`,
        [options.id]
      );
      // TODO: add all other resource types
      await dbTran.client.query(
        `DELETE FROM rbac_acl WHERE auth_group_id = $1`,
        [options.id]
      );
      await dbTran.client.query(
        'DELETE FROM rbac_auth_group WHERE auth_group_id = $1',
        [options.id]
      );
      await dbTran.commit();
    } catch (err) {
      serviceContext.logger.error(err);
      await dbTran.rollback();
      throw err;
    } finally {
      dbTran.done();
    }
    return { id: options.id };
  }

  async function addMembersToAuthGroup(groupId, members) {
    if (!members.length) {
      return;
    }

    const args = [groupId];
    const values = [];
    for (const m of members) {
      args.push(m.id);
      values.push(`($1,$${args.length},'${_.toLower(m.memberType)}')`);
    }
    const sql = /*sql*/ `INSERT INTO rbac_auth_group_member (auth_group_id, member_id, member_type) VALUES
    ${values.join(',')} ON CONFLICT DO NOTHING;`;
    await serviceContext.dbConnections['sso'].write.none(sql, args);
  }

  async function removeMembersFromAuthGroup(groupId, memberIds) {
    await serviceContext.dbConnections['sso'].write.none(
      `DELETE 
        FROM rbac_auth_group_member 
       WHERE 
        auth_group_id=$1::uuid AND member_id=ANY($2::uuid[]);`,
      [groupId, memberIds]
    );
  }

  async function getAuthGroupMembers(groupId, options) {
    const where = [];
    const args = [];

    mainUtil.addSqlWhere('agm.auth_group_id', groupId, where, args);
    if (options.memberType) {
      mainUtil.addSqlWhere(
        'member_type',
        _.toLower(options.memberType),
        where,
        args
      );
    }
    if (options.ids && options.ids.length) {
      args.push(options.ids);
      where.push(`member_id=ANY($${args.length}::uuid[])`);
      options.limit = options.ids.length;
    }

    const sql = /*sql*/ `
    SELECT 
      member_id as id,
      member_type,
      date_created as created_at,
      date_modified as modified_at
    FROM rbac_auth_group_member agm
    WHERE ${where.join(' AND ')}
    OFFSET ${options.offset || 0}
    LIMIT ${options.limit || 30};
    `;

    const rows = await serviceContext.dbConnections['sso'].read.map(
      sql,
      args,
      mapper.camelizeRootKeys
    );
    return rows;
  }

  async function getAuthGroupMemberCount(groupId, options) {
    if (!groupId) {
      throw new errors.InvalidInput({
        message: `memberCount: group id is required`,
      });
    }
    if (!options) {
      options = {};
    }

    const where = [];
    const args = [];

    mainUtil.addSqlWhere('agm.auth_group_id', groupId, where, args);
    if (options.memberType) {
      mainUtil.addSqlWhere(
        'member_type',
        _.toLower(options.memberType),
        where,
        args
      );
    }
    if (options.ids && options.ids.length) {
      args.push(options.ids);
      where.push(`member_id=ANY($${args.length}::uuid[])`);
      options.limit = options.ids.length;
    }

    const sql = /*sql*/ `
    SELECT count(1)
    FROM rbac_auth_group_member agm
    WHERE ${where.join(' AND ')}
    `;

    const result =  await serviceContext.dbConnections['sso'].read.query(
      sql,
      args
    );
    return parseInt(_.get(result, '[0].count', 0));
  }

  async function getAuthGroupsContainingMember(memberId, options) {
    // FIXME: cast guids in sql
    if (!memberId) {
      return [];
    }
    const where = [];
    const args = [];

    mainUtil.addSqlWhere('ag.organization_guid', options.orgGuid, where, args);
    mainUtil.addSqlWhere('m.member_id', memberId, where, args);

    const sql = /*sql*/ `
		SELECT ${AUTHGROUP_SELECT_FIELDS.map((x) => 'ag.' + x).join(',')}
		FROM rbac_auth_group ag
		JOIN rbac_auth_group_member m ON m.auth_group_id = ag.auth_group_id
    WHERE ${where.join(' AND ')};
    `;
    const rows = await serviceContext.dbConnections['sso'].read.map(
      sql,
      args,
      mapAuthGroup
    );
    return mainUtil.toPage(options, rows);
  }

  const varBitSize = fpUtil.getHighestPermissionBit() + 1;
  async function getAuthGroupsPermissionMaskForOrganization(orgId, groupIds) {
    if (!orgId || !Array.isArray(groupIds)) {
      return null;
    }

    const sql = /*sql*/ `
    SELECT bit_or(rp.permissions::bit(${varBitSize})) AS mask FROM rbac_permission_set rp
    JOIN rbac_acl ra ON rp.permission_set_id = ra.permission_set_id
    WHERE ra.organization_id = $1 AND ra.auth_group_id = ANY($2::uuid[]) 
    AND ra.object_type = 'organization'::rbac_object_type AND ra.id_text = $1::text;`;

    const res = await serviceContext.dbConnections['sso'].read.one(sql, [
      orgId,
      groupIds
    ]);
    if (_.isNil(res.mask) || !res.mask.length) {
      return [];
    }
    return fpUtil.binaryStringToPermissionMask(res.mask);
  }

  async function isResourceExist(resourceType, resourceId) {
    if (!(resourceType in RESOURCE_TYPE_DB_MAP)) {
      throw new errors.InvalidInput({
        message: `Invalid resource type`,
        data: {
          value: resourceType
        }
      });
    }

    const db_conn = RESOURCE_TYPE_DB_MAP[resourceType].conn;
    const idField = RESOURCE_TYPE_DB_MAP[resourceType].idField;
    const db_table = RESOURCE_TYPE_DB_MAP[resourceType].table;

    const sql = /*sql*/ `
    SELECT ${idField} FROM ${db_table}
    WHERE ${idField} = $1`;

    const sqlArgs = [resourceId];

    try {
      await serviceContext.dbConnections[db_conn].read.one(sql, sqlArgs);
    } catch (err) {
      if (err.data.internalData.code === 0 /* queryResultErrorCode.noData */) {
        return false;
      }
      throw err;
    }
    return true;
  }

  async function authResourceRoleAssign(args, dbTx) {
    // input validation is the responsibility of the caller
    // while auth_group and role are foreign keys,
    // resource may live in a different DB and might not be automatically validated

    const groupId = args.input.groupId;
    const resourceId = args.input.resourceId;
    const resourceType = args.input.resourceType;
    const roleId = args.input.roleId;

    const sqlTable =
      RESOURCE_TYPE_DB_MAP[resourceType].auth_group_role_resource_join_table;
    const resourceField = RESOURCE_TYPE_DB_MAP[resourceType].resourceField;

    const sql = `INSERT INTO ${sqlTable}
        (auth_group_id, role_id, ${resourceField})
      VALUES
        ($1, $2, $3)
      ON CONFLICT DO NOTHING`;
    const sqlArgs = [groupId, roleId, resourceId];

    const dbTran = await ssoWriteTx(dbTx);
    try {
      await dbTran.begin();
      await dbTran.client.query(sql, sqlArgs);
      await dbTran.commit();
    } catch (err) {
      serviceContext.logger.error(err);
      await dbTran.rollback();
      throw err;
    } finally {
      dbTran.done();
    }
  }

  async function getAuthGroupMemberIds(authGroupIds, options) {
    const where = [];
    const args = [];

    mainUtil.addSqlWhere('agm.member_id', options.memberIds, where, args);
    mainUtil.addSqlWhere('agm.auth_group_id', authGroupIds, where, args);
    mainUtil.addSqlWhere(
      'member_type',
      _.toLower(options.memberType),
      where,
      args
    );

    const sql = `
      SELECT DISTINCT agm.member_id as id
      FROM rbac_auth_group_member agm
      WHERE ${where.join(' AND ')};
    `;

    try {
      const rows = await serviceContext.dbConnections['sso'].read.map(
        sql,
        args,
        mapper.camelizeRootKeys
      );

      return _.map(rows, 'id');
    } catch (error) {
      return [];
    }
  }

  // RBAC auth groups cache type key - enables:
  // - L1 local cache (configurable via config.localCache.rbacAuthGroups)  
  // - L2 Redis cache with dirty marking for cross-service invalidation
  const AUTH_GROUP_TYPE_KEY = 'rbacAuthGroups';
  function _buildAuthGroupMarkedKey(orgGuid) {
    return `rbac_auth_group_marked_key:${orgGuid}`;
  }
  async function markCacheDirtyForGetAuthGroups(orgGuid) {
    if (!_.isNil(orgGuid)) {
      const markedKey = _buildAuthGroupMarkedKey(orgGuid);
      await redisCache.markCacheDirty(markedKey);
    }
  }
  async function getAuthGroupsWithCache(options) {
    const markedKey = _buildAuthGroupMarkedKey(options.orgGuid);
    const cacheKey = mainUtil.buildFilterOptionKey(options);

    const {
      asyncGetCacheValue,
      asyncRefreshCacheValue
    } = await mainUtil.validateCacheKey(
      markedKey,
      AUTH_GROUP_TYPE_KEY,
      cacheKey,
      {
        useL1Cache: true,
        ttlMinL2Override: 60 // 1 hour TTL for L2 cache
      }
    );

    let result = await asyncGetCacheValue();

    if (_.isEmpty(result) || options.skipCache) {
      result = await getAuthGroupsDb(options);
      await asyncRefreshCacheValue(result);
    }

    return result;
  }

  return {
    getAuthGroups: getAuthGroupsWithCache,
    createAuthGroup,
    updateAuthGroup,
    deleteAuthGroup,
    addMembersToAuthGroup,
    removeMembersFromAuthGroup,
    getAuthGroupMembers,
    getAuthGroupMemberCount,
    getAuthGroupsContainingMember,
    getAuthGroupsPermissionMaskForOrganization,
    isResourceExist,
    authResourceRoleAssign,
    getAuthGroupMemberIds,
    getUserPrivateAuthGroup,
    getPrivateAuthGroupOwners,

    // refresh cache functions
    markCacheDirtyForGetAuthGroups,

    // for unit-tests or who want to ignore the cache layer
    getAuthGroupsDb
  };
};
