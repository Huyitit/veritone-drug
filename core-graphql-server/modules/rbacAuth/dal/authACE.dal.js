const _ = require('lodash');
const pgp = require('pg-promise')({
  capSQL: true
});

// RBAC hasPermissions cache type key - enables:
// - L1 local cache (configurable via config.localCache.rbacAclHasPermissions)  
// - L2 Redis cache with dirty marking for cross-service invalidation
const ACL_HAS_PERMISSION_TYPE_KEY = 'rbacAclHasPermissions';

// RBAC getACLForResources cache type key - enables:
// - L1 local cache (configurable via config.localCache.rbacAclForResources)  
// - L2 Redis cache with dirty marking for cross-service invalidation
const ACL_FOR_RESOURCE_TYPE_KEY = 'rbacAclForResources';

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../../../util.js')(serviceContext);
  const mapper = require('../../../dal/mapper.js');
  const errors = require('../../../error')(serviceContext.config);
  const fpUtil = require('./functionalPermissionsUtil.dal')(serviceContext);
  const redisCache = serviceContext.redisCache;

  const RBAC_ACL_COLUMN_SET = new pgp.helpers.ColumnSet(
    [
      {
        name: 'object_type',
        cast: '::rbac_object_type',
        init(col) {
          return gqlResourceEnumToDbEnum(col.value);
        }
      },
      {
        name: 'auth_group_id',
        cast: '::uuid'
      },
      {
        name: 'permission_set_id',
        cast: '::uuid'
      },
      {
        name: 'id_text',
        cast: '::text'
      },
      {
        name: 'organization_id',
        cast: '::integer'
      },
      {
        name: 'created_by',
        cast: '::uuid'
      },
      {
        name: 'modified_by',
        cast: '::uuid'
      },
      {
        name: 'auth_inherit',
        cast: '::boolean'
      }
    ],
    {
      table: 'rbac_acl'
    }
  );

  const RBAC_ACL_RECORDING_COLUMN_SET = new pgp.helpers.ColumnSet(
    [
      {
        name: 'recording_id',
        cast: '::text',
        prop: 'id_text'
      },
      {
        name: 'auth_group_id',
        cast: '::uuid'
      },
      {
        name: 'permission_set_id',
        cast: '::uuid'
      }
    ],
    {
      table: {
        schema: 'rbac',
        table: 'acl_recording'
      }
    }
  );

  const RBAC_ACL_SDO_COLUMN_SET = new pgp.helpers.ColumnSet(
    [
      {
        name: 'sdo_id',
        cast: '::uuid',
        prop: 'id_text'
      },
      {
        name: 'data_registry_id',
        cast: '::uuid'
      },
      {
        name: 'auth_group_id',
        cast: '::uuid'
      },
      {
        name: 'permission_set_id',
        cast: '::uuid'
      }
    ],
    {
      table: {
        schema: 'public',
        table: 'acl_sdo'
      }
    }
  );
  const RBAC_ACL_SDO_SCHEMA_COLUMN_SET = new pgp.helpers.ColumnSet(
    [
      {
        name: 'data_registry_id',
        cast: '::uuid',
        prop: 'id_text'
      },
      {
        name: 'auth_group_id',
        cast: '::uuid'
      },
      {
        name: 'permission_set_id',
        cast: '::uuid'
      }
    ],
    {
      table: {
        schema: 'public',
        table: 'acl_sdo'
      }
    }
  );

  const RBAC_RBAC_FOLDERS_COLUMN_SET = new pgp.helpers.ColumnSet(
    [
      {
        name: 'folder_id',
        cast: '::uuid',
        prop: 'id_text',
      },
      {
        name: 'organization_id',
        cast: '::integer',
      },
      {
        name: 'auth_group_id',
        cast: '::uuid',
      },
      {
        name: 'permission_set_id',
        cast: '::uuid',
      },
    ],
    {
      table: {
        schema: 'public',
        table: 'rbac_folders',
      },
    }
  );

  async function addACEsToResources(args, dbClients) {
    const data = [];
    const containsInheritFlag = (e) => {
      return args.resourceType === 'Folder'
        && Array.isArray(e.options)
        && e.options.indexOf('inherit') !== -1;
    }

    const acesPerResource = args.entries.map((e) => ({
      permission_set_id: e.permissionSetID,
      auth_group_id: e.member.id,
      auth_inherit: containsInheritFlag(e) ? true : null
    }));

    for (const id of args.ids) {
      for (const ace of acesPerResource) {
        const aceData = _.assign(
          {
            //FIXME: const [objectIdColumn, sqlType] = getACEIdType(options.resourceType);
            id_text: id,
            object_type: args.resourceType,
            organization_id: args.orgId,
            created_by: args.userId,
            modified_by: args.userId
          },
          ace
        );

        // Add data_registry_id for SDO resources
        if (args.resourceType === 'SDO' && args.dataRegistryId) {
          aceData.data_registry_id = args.dataRegistryId;
        }

        data.push(aceData);
      }
    }

    // dbClients format: {dbName: dbClientWrite}
    const dbClient =
      dbClients?.['sso'] || serviceContext.dbConnections['sso'].write;

    if (data.length > 0) {
      try {
        await dbClient.tx('addACEsToResources', async t1 => {
          let insert = pgp.helpers.insert(data, RBAC_ACL_COLUMN_SET);
          insert = insert + ' ON CONFLICT DO NOTHING;';
          await t1.none(insert);

          // Insert into join tables on the target DB (core/third_party/media_platform).
          // If this fails the error propagates, rolling back rbac_acl above.
          await addAclsToJoinTables(args.resourceType, data, dbClients);
        });
      } catch (err) {
        serviceContext.logger.error(err);
        throw err;
      }
    }
    return getACLForResourcesDb(args);
  }

  /**
   * Add ACLs in mirror tables in the same db as the object to
   * facilitate filter joins
   * @param {string} resourceType - The type of resource
   * @param {Array} data - Array of ACL data objects to insert
   * @param {Object} [dbClients] - Optional database clients for specific databases, format: {dbName: dbClientWrite}
   */
  async function addAclsToJoinTables(resourceType, data, dbClients) {
    const joinTables = {
      TDO: {
        db: 'core',
        columnSet: RBAC_ACL_RECORDING_COLUMN_SET
      },
      SDO: {
        db: 'third_party',
        columnSet: RBAC_ACL_SDO_COLUMN_SET
      },
      SDOSchema: {
        db: 'third_party',
        columnSet: RBAC_ACL_SDO_SCHEMA_COLUMN_SET
      },
      Folder: {
        db: 'media_platform',
        columnSet: RBAC_RBAC_FOLDERS_COLUMN_SET,
      },
    };
    const t = joinTables[resourceType];
    let dbClient = t?.db ? serviceContext.dbConnections[t.db].write : null;

    if (!_.isEmpty(dbClients) && t?.db) {
      dbClient = dbClients[t.db];
    }
    if (t && dbClient && Array.isArray(data) && data.length > 0) {
      let insert = pgp.helpers.insert(data, t.columnSet);
      insert = insert + ' ON CONFLICT DO NOTHING;';
      await dbClient.none(insert);
    }
  }

  async function deleteAclsFromJoinTables(resourceType, rows, dbClient) {
    const joinTables = {
      TDO: {
        db: 'core',
        keyFields: ['id_text', 'auth_group_id', 'permission_set_id'],
        dbFields: ['recording_id', 'auth_group_id', 'permission_set_id'],
        tableName: 'rbac.acl_recording'
      },
      SDO: {
        db: 'third_party',
        keyFields: [
          'id_text',
          'auth_group_id',
          'permission_set_id',
          'data_registry_id'
        ],
        dbFields: [
          'sdo_id',
          'auth_group_id',
          'permission_set_id',
          'data_registry_id'
        ],
        tableName: 'public.acl_sdo'
      },
      Folder: {
        db: 'media_platform',
        keyFields: ['id_text', 'auth_group_id', 'permission_set_id'],
        dbFields: ['folder_id', 'auth_group_id', 'permission_set_id'],
        tableName: 'public.rbac_folders',
      },
    };
    const t = joinTables[resourceType];
    if (t) {
      const values = pgp.helpers.values(rows, t.keyFields);
      const dbFieldList = `(${t.dbFields.join(', ')})`;
      const sql = `
        DELETE FROM ${t.tableName} WHERE
          ${dbFieldList} IN (${values});
      `;
      await (dbClient
        ? dbClient.none(sql)
        : serviceContext.dbConnections[t.db].write.none(sql));
    }
  }

  // Get the correct id column and type for a particular resource type
  function getACEIdType(resourceType) {
    const map = {
      TDO: ['id_text', 'text'],
      SDO: ['id_text', 'uuid']
      //   Folder,
      //   Source,
      //   Organization,
      //   Engine,
      //   Library,
      //   Dataset,
      //   Application
    };
    return map[resourceType] || ['id_text', 'text'];
  }

  const ACL_SELECT_FIELDS = [
    'object_type',
    'auth_group_id',
    'permission_set_id',
    'organization_id',
    'protected',
    'date_created',
    'date_modified',
    'created_by',
    'modified_by'
  ];

  async function getACLForResourcesDb(options) {
    const where = [];
    const args = [];

    mainUtil.addSqlWhere('organization_id', options.orgId, where, args);
    const [objectIdColumn, sqlType] = getACEIdType(options.resourceType);
    // should filter by object type before filtering by ids
    args.push(gqlResourceEnumToDbEnum(options.resourceType));
    where.push(`ra.object_type = $${args.length}::rbac_object_type`);

    args.push(options.ids);
    where.push(
      `${objectIdColumn}::${sqlType} = ANY($${args.length}::${sqlType}[])`
    );

    let joinClause = '';
    if (options.permissions && options.permissions.length) {
      const permissionCheck = fpUtil.buildPermissionSql(
        'p.permissions',
        options.permissions,
        options.requireAll
      );
      where.push(`(${permissionCheck})`);
      joinClause =
        'JOIN rbac_permission_set p ON p.permission_set_id = ra.permission_set_id';
    }

    if (Array.isArray(options.authGroups) && !_.isEmpty(options.authGroups)) {
      args.push(options.authGroups);
      where.push(`ra.auth_group_id = ANY($${args.length}::uuid[])`);
    }
    const flagsColumn = options.resourceType === 'Folder' ? ',ra.auth_inherit' : '';

    const sql = /*sql*/ `
    SELECT ${ACL_SELECT_FIELDS.map((f) => `ra.${f}`).join(
      ','
    )}, ${objectIdColumn} ${flagsColumn}
    FROM rbac_acl ra ${joinClause}
    WHERE ${where.join(' AND ')}
    OFFSET ${options.offset || 0}
    LIMIT ${options.limit || 30};
    `;
    const rows = await serviceContext.dbConnections['sso'].read.query(
      sql,
      args
    );
    const results = [];
    for (const r of rows) {
      r.objectID = r[objectIdColumn];
      r.object_type = dbResourceEnumToGqlEnum(r.object_type);
      r.is_protected = r.protected || false;
      const ace = mapper.camelizeRootKeys(r);
      ace.aceId = getAceId(ace);
      results.push(ace);
    }
    return mainUtil.toPage(options, results);
  }

  async function deleteACLForResources(options) {
    const { resourceType, ids } = options;
    const dbResourceType = gqlResourceEnumToDbEnum(resourceType);
    const aces = ids.map(getAceDescriptorFromId);
    if (!aces.length) {
      return aces;
    }
    const perGroupMap = new Map();
    for (const a of aces) {
      a.objectType = gqlResourceEnumToDbEnum(a.objectType);
      if (a.objectType !== dbResourceType) {
        throw new errors.InvalidInput({
          message: 'ACE id does not match specified object type',
          data: {
            id: getAceId(a),
            resourceType
          }
        });
      }
      const key = `${a.authGroupId}::${a.permissionSetId}::${a.objectType}`;
      if (perGroupMap.has(key)) {
        perGroupMap.get(key).push(a);
      } else {
        perGroupMap.set(key, [a]);
      }
    }
    const whereSql = [];
    const whereArgs = [];
    for (const gAces of perGroupMap.values()) {
      whereArgs.push(gqlResourceEnumToDbEnum(gAces[0].objectType));
      whereArgs.push(gAces[0].authGroupId);
      whereArgs.push(gAces[0].permissionSetId);
      const [idField, cast] = getACEIdType(gAces[0].objectType);
      whereArgs.push(gAces.map((a) => a.objectID));
      whereSql.push(`(
        (protected = FALSE) AND
        (object_type = $${whereArgs.length - 3}) AND
        (auth_group_id = $${whereArgs.length - 2}) AND
        (permission_set_id = $${whereArgs.length - 1}) AND
        (${idField}::${cast} = ANY($${whereArgs.length}::${cast}[]))
      )`);
    }
    if (!whereArgs.length || !whereSql.length) {
      serviceContext.logger.error(
        new errors.ResourceUnavailable({
          message: 'Failed to build query for the specified ACEs',
          data: ids
        })
      );
      return [];
    }

    const sql = `
      DELETE FROM rbac_acl
      WHERE ${whereSql.join(' OR ')}
      RETURNING id_text, auth_group_id, permission_set_id;
    `;
    const deleted = await serviceContext.dbConnections['sso'].write.query(
      sql,
      whereArgs
    );

    // If SDO resource type, add data_registry_id to each row
    if (options.dataRegistryId) {
      for (const row of deleted) {
        row.data_registry_id = options.dataRegistryId;
      }
    }
    await deleteAclsFromJoinTables(resourceType, deleted);

    // Flag which requested ACEs were actually removed from the DB,
    // so callers auditing revokes can report only ACEs that
    // were genuinely removed rather than every requested id.
    const removedKeys = new Set(
      deleted.map(
        (r) => `${r.id_text}::${r.auth_group_id}::${r.permission_set_id}`
      )
    );
    for (const a of aces) {
      a.removed = removedKeys.has(
        `${a.objectID}::${a.authGroupId}::${a.permissionSetId}`
      );
    }
    return aces;
  }

  async function hasPermissionsDb(args) {
    const {
      resourceType,
      ids,
      authGroups,
      permissions,
      requireAll,
      orgGuid,
      orgId
    } = args;

    // authGroups uses ANY in the sql so we should explicitly prohibit empty sets
    if (_.isEmpty(authGroups)) {
      return ids.map((id) => ({
        resourceType,
        id,
        hasPermission: false
      }));
    }

    const [objectIdColumn, sqlType] = getACEIdType(resourceType);
    const permissionCheck = fpUtil.buildPermissionSql(
      'p.permissions',
      permissions,
      requireAll
    );
    const sql = `
      SELECT DISTINCT ${objectIdColumn} as id FROM rbac_acl ra
      JOIN rbac_permission_set p ON p.permission_set_id = ra.permission_set_id
      WHERE
        ra.object_type = $1 AND
        ra.${objectIdColumn}::${sqlType} = ANY($2::${sqlType}[]) AND
        ra.auth_group_id = ANY($3::uuid[]) AND
        ra.organization_id = $4 AND
        p.organization_guid = $5 AND
        (${permissionCheck})
    `;
    const rows = await serviceContext.dbConnections['sso'].read.query(sql, [
      gqlResourceEnumToDbEnum(resourceType),
      ids,
      authGroups,
      orgId,
      orgGuid
    ]);
    const granted = new Set(rows.map((r) => r.id));
    return ids.map((id) => ({
      resourceType,
      id,
      hasPermission: granted.has(id)
    }));
  }

  function getAceId(ace) {
    return `${ace.objectType}::${ace.objectID}::${ace.authGroupId}::${ace.permissionSetId}`;
  }

  function getAceDescriptorFromId(id) {
    const [objectType, objectID, authGroupId, permissionSetId] = id.split('::');
    return {
      objectType,
      objectID,
      authGroupId,
      permissionSetId
    };
  }

  function gqlResourceEnumToDbEnum(resourceType) {
    if (resourceType === 'TDO') return 'recording';
    if (resourceType === 'SDO') return 'structured_data';
    if (resourceType === 'SDOSchema') return 'schema';
    return _.toLower(resourceType);
  }

  function dbResourceEnumToGqlEnum(resourceType) {
    if (resourceType === 'recording') return 'TDO';
    if (resourceType === 'structured_data') return 'SDO';
    if (resourceType === 'schema') return 'SDOSchema';
    return _.startCase(_.toLower(resourceType));
  }

  async function getAuthACLByResourceIdsAndPerms(options) {
    const {
      ids,
      permissions,
      requireAll,
      authGroupIds = [],
      orgGuid,
      orgId,
      roleIds,
      resourceType
    } = options;
    const [objectIdColumn, sqlType] = getACEIdType(resourceType);
    const where = [];
    const values = [];

    if (_.isEmpty(ids) || _.isEmpty(permissions)) {
      throw new errors.InvalidInput({
        message: 'ResourceIds and permissions cannot be null or empty'
      });
    }

    mainUtil.addSqlWhere('ra.organization_id', orgId, where, values);
    mainUtil.addSqlWhere('p.organization_guid', orgGuid, where, values);

    // should filter by object type before filtering by ids
    values.push(gqlResourceEnumToDbEnum(resourceType));
    where.push(`ra.object_type = $${values.length}::rbac_object_type`);

    values.push(ids);
    where.push(
      `${objectIdColumn}::${sqlType} = ANY($${values.length}::${sqlType}[])`
    );

    if (!_.isEmpty(authGroupIds)) {
      values.push(authGroupIds);
      where.push(`ra.auth_group_id = ANY($${values.length}::uuid[])`);
    }

    if (!_.isEmpty(roleIds)) {
      values.push(roleIds);
      where.push(`p.role_id = ANY($${values.length}::uuid[])`);
    }

    const permissionCheck = fpUtil.buildPermissionSql(
      'p.permissions',
      permissions,
      requireAll
    );
    where.push(permissionCheck);

    const selectedFields = ACL_SELECT_FIELDS.map((f) => `ra.${f}`).join(',');
    const sql = `SELECT ${selectedFields}, ${objectIdColumn}
    FROM rbac_acl ra JOIN rbac_permission_set p ON p.permission_set_id = ra.permission_set_id
    WHERE ${where.join(' AND ')}
    `;

    const rows = await serviceContext.dbConnections['sso'].read.query(
      sql,
      values
    );
    const results = [];
    for (const r of rows) {
      r.objectID = r[objectIdColumn];
      r.object_type = dbResourceEnumToGqlEnum(r.object_type);
      const ace = mapper.camelizeRootKeys(r);
      ace.aceId = getAceId(ace);
      results.push(ace);
    }

    return results;
  }

  async function hasOrgRolePermissions(options) {
    if (!options.orgId) {
      return false;
    }
    const ids = await hasPermissionsDb({
      resourceType: 'organization',
      ids: [options.orgId.toString()],
      authGroups: options.authGroups,
      permissions: options.permissions,
      requireAll: options.requireAll ?? true,
      orgGuid: options.orgGuid,
      orgId: options.orgId
    });
    return ids.length === 1 && ids[0].hasPermission === true;
  }

  async function inheritResourceACEs(args) {
    if (!args.source || !args.target || !args.userId) {
      throw new errors.InvalidInput({
        message: 'inheritResourceACEs requires source, target and userId'
      });
    }
    if (args.source.id === args.target.id) {
      return;
    }

    const sourceType = gqlResourceEnumToDbEnum(args.source.type);
    const targetType = gqlResourceEnumToDbEnum(args.target.type);
    const [sourceIdColumn, sourceSqlType] = getACEIdType(args.source.type);
    const [targetIdColumn, targetSqlType] = getACEIdType(args.target.type);
    const sqlArgs = [
      targetType,
      args.target.id,
      sourceType,
      args.source.id,
      args.userId
    ];
    let whereConditions = [
      `ra.object_type=$3`,
      `ra.${sourceIdColumn}::${sourceSqlType}=$4::${sourceSqlType}`
    ];
    let joinSql = '';

    if (!_.isEmpty(args.unsupportedAuthClasses)) {
      sqlArgs.push(args.unsupportedAuthClasses);
      joinSql = ` JOIN rbac_auth_group ag ON ra.auth_group_id = ag.auth_group_id`;

      // don't allow ACEs for certain classes of auth groups (ex. user private group) to be inherited
      // unless the ACE has explicit flags to allow it
      whereConditions.push(`(ag.auth_group_class != ALL($${sqlArgs.length}::text[]) OR ra.auth_inherit = TRUE)`);
    }

    // propagate flags if target is folder
    // other objects don't contain other objects so setting that flag is not necessary
    let flags = '';
    let flagsSelect = '';
    if (targetType === 'folder') {
      flags = ',auth_inherit';
      flagsSelect = ',ra.auth_inherit';
    }

    try {
      const sql = /*sql*/ `
        INSERT INTO rbac_acl (object_type,${targetIdColumn},auth_group_id,permission_set_id,organization_id,created_by,modified_by ${flags})
        SELECT $1, $2::${targetSqlType}, ra.auth_group_id, ra.permission_set_id, ra.organization_id, $5, $5 ${flagsSelect} FROM rbac_acl ra ${joinSql}
        WHERE ${whereConditions.join(' AND ')}
        ON CONFLICT DO NOTHING
        RETURNING ${targetIdColumn},${ACL_SELECT_FIELDS.join(',')} ${flags};`;
      const newACEs = await serviceContext.dbConnections['sso'].write.query(
        sql,
        sqlArgs
      );

      if (args.source.type === 'SDOSchema' && args.source.id) {
        // For SDOs, we need to add the data_registry_id to the ACEs
        for (const ace of newACEs) {
          if (ace.object_type === 'structured_data') {
            ace.data_registry_id = args.source.id;
          }
        }
      }

      await addAclsToJoinTables(args.target.type, newACEs);
      return newACEs;
    } catch (err) {
      serviceContext.logger.error(err);
      throw err;
    }
  }

  async function getAuthGroupIdsByPermissionSets(
    permissionSetIds,
    organizationId
  ) {
    const where = [];
    const args = [];

    if (_.isEmpty(permissionSetIds) || _.isNil(organizationId)) {
      throw new errors.InvalidInput({
        message:
          'getAuthGroupIdsByPermissionSets requires permissionSetIds and organizationId.'
      });
    }

    mainUtil.addSqlWhere('ra.organization_id', organizationId, where, args);
    args.push(permissionSetIds);
    where.push(`ra.permission_set_id = ANY($${args.length}::uuid[])`);

    const sql = /*sql*/ `
    SELECT DISTINCT ra.auth_group_id as id
    FROM rbac_acl ra
    WHERE ${where.join(' AND ')};
    `;

    const rows = await serviceContext.dbConnections['sso'].read.query(
      sql,
      args
    );

    return _.map(rows, 'id');
  }

  async function markCacheDirtyForGetACLForResources(orgId, resourceIds = []) {
    if (_.isNil(orgId)) return;

    const promises = [];

    // fall back to org level marking if no resourceIds provided
    if (_.isEmpty(resourceIds)) {
      const orgMarkedKey = _buildACLMarkedKey(orgId);
      promises.push(redisCache.markCacheDirty(orgMarkedKey));
    } else {
      for (const resourceId of resourceIds) {
        const markedKey = _buildACLMarkedKey(orgId, resourceId);
        promises.push(redisCache.markCacheDirty(markedKey));
      }
    }

    await Promise.all(promises);
  }
  async function getACLForResourcesWithCache(options) {
    const cacheKey = mainUtil.buildFilterOptionKey(options);
    const markedKeyForOrgLevel = _buildACLMarkedKey(options.orgId);
    // always include the org level marked key to cover the case where
    // all resources are marked dirty (ie. when deleting an auth group/permission set)
    const markedKeys = [markedKeyForOrgLevel];

    if (!_.isEmpty(options.ids)) {
      for (const resourceId of options.ids) {
        const markedKey = _buildACLMarkedKey(options.orgId, resourceId);
        markedKeys.push(markedKey);
      }
    }

    const {
      asyncGetCacheValue,
      asyncRefreshCacheValue
    } = await mainUtil.validateCacheKey(
      markedKeys,
      ACL_FOR_RESOURCE_TYPE_KEY,
      cacheKey,
      {
        useL1Cache: true,
        ttlMinL2Override: 60 // 1 hour TTL for L2 cache
      }
    );

    let result = await asyncGetCacheValue();

    // Treat empty permissions as potentially stale cache, since most of the
    // resources will have at least one.
    if (_.isEmpty(result) || _.isEmpty(result.records) || options.skipCache) {
      result = await getACLForResourcesDb(options);
      await asyncRefreshCacheValue(result);
    }

    return result;
  }

  async function markCacheDirtyForHasPermissions(orgId, resourceIds = []) {
    if (_.isNil(orgId)) return;

    const promises = [];

    // fall back to org level marking if no resourceIds provided
    if (_.isEmpty(resourceIds)) {
      const orgMarkedKey = _buildACLHasPermissionsMarkedKey(orgId);
      promises.push(redisCache.markCacheDirty(orgMarkedKey));
    } else {
      for (const resourceId of resourceIds) {
        const markedKey = _buildACLHasPermissionsMarkedKey(orgId, resourceId);
        promises.push(redisCache.markCacheDirty(markedKey));
      }
    }

    await Promise.all(promises);
  }
  // Negative RBAC results get a much shorter L2 TTL than granted results. A denial can
  // legitimately be the FIRST read racing a permission grant that hasn't finished
  // propagating (see T28, state/automations/eng/aiware-core-citest-triage/T28.md in
  // vpe-specs); without this split, that one denial is memoized for the full 30-minute
  // positive TTL — silently defeating any caller's retry loop, and (more importantly)
  // denying a now-authorized real user for up to 30 minutes. 5s is well under this
  // cache's known caller retry cadences while still giving real stampede protection
  // against a caller with no chance of ever being granted.
  const NEGATIVE_RESULT_TTL_MIN = 5 / 60; // 5 seconds
  const POSITIVE_RESULT_TTL_MIN = 30; // unchanged

  async function hasPermissionsWithCache(args) {
    const cacheKey = mainUtil.buildFilterOptionKey(args);
    const markedKeyForOrgLevel = _buildACLHasPermissionsMarkedKey(args.orgId);
    // always include the org level marked key to cover the case where
    // all resources are marked dirty (ie. when deleting an auth group/permission set)
    const markedKeys = [markedKeyForOrgLevel];

    if (!_.isEmpty(args.ids)) {
      for (const resourceId of args.ids) {
        const markedKey = _buildACLHasPermissionsMarkedKey(args.orgId, resourceId);
        markedKeys.push(markedKey);
      }
    }

    const {
      asyncGetCacheValue,
      asyncRefreshCacheValue
    } = await mainUtil.validateCacheKey(
      markedKeys,
      ACL_HAS_PERMISSION_TYPE_KEY,
      cacheKey,
      {
        useL1Cache: true,
        ttlMinL2Override: POSITIVE_RESULT_TTL_MIN
      }
    );

    let result = await asyncGetCacheValue();

    if (_.isEmpty(result)) {
      result = await hasPermissionsDb(args);
      const anyDenied = result.some((r) => r.hasPermission === false);
      await asyncRefreshCacheValue(
        result,
        anyDenied ? NEGATIVE_RESULT_TTL_MIN : undefined
      );
    }

    return result;
  }

  return {
    addACEsToResources,
    getACLForResources: getACLForResourcesWithCache,
    deleteACLForResources,
    hasPermissions: hasPermissionsWithCache,
    getAuthACLByResourceIdsAndPerms,
    hasOrgRolePermissions,
    inheritResourceACEs,
    getAuthGroupIdsByPermissionSets,

    deleteAclsFromJoinTables,

    // refresh cache functions
    markCacheDirtyForGetACLForResources,
    markCacheDirtyForHasPermissions,

    // for unit-tests or who want to ignore the cache layer
    getACLForResourcesDb,
    hasPermissionsDb
  };
};

function _buildACLHasPermissionsMarkedKey(orgId, resourceId) {
  const key = `rbac_acl_has_permission_marked_key:${orgId}`;

  if (resourceId) {
    return `${key}:${resourceId}`;
  }

  return key;
}

function _buildACLMarkedKey(orgId, resourceId) {
  const key = `rbac_acl_for_resource_marked_key:${orgId}`;

  if (resourceId) {
    return `${key}:${resourceId}`;
  }

  return key;
}
