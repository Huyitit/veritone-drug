module.exports = function createFunction(serviceContext) {
  const _ = require('lodash');
  const mainUtil = require('../../../util.js')(serviceContext);
  const mapper = require('../../../dal/mapper.js');
  const errors = require('../../../error')(serviceContext.config);
  const fpUtil = require('./functionalPermissionsUtil.dal')(serviceContext);
  const moment = require('moment');
  const validator = require('validator');
  const redisCache = serviceContext.redisCache;
  const { parsePaginationArgs } = require('../../../util/paginationParser')(
    serviceContext
  );

  const authPermissionSetColumns = {
    permission_set_id: 'id',
    permission_set_name: 'name',
    permission_set_description: 'description',
    permissions: 'bit_field',
    organization_guid: null,
    application_id: null,
    role_id: null,
    date_created: null,
    date_modified: null,
    created_by: null,
    modified_by: null,
    permission_set_class: 'auth_class',
    is_protected: null
  };

  const selectFields = mainUtil.makeSelectClause(authPermissionSetColumns);

  function mapAuthPermissionSet(row) {
    const r = mapper.camelizeRootKeys(row);
    r.permissionMask = fpUtil.binaryStringToPermissionMask(r.bitField);
    const permissionKeys = fpUtil.permissionMaskToKeys(r.permissionMask, true);
    r.permissions = fpUtil.mapPermissionEnumByKeys(permissionKeys);
    r.createdAt = r.dateCreated;
    r.modifiedAt = r.dateModified;
    return r;
  }

  async function getAuthPermissionSetsDb(options) {
    parsePaginationArgs(options);
    const where = [];
    const args = [];

    // Ids
    mainUtil.addSqlWhere('ps.permission_set_id', options.ids, where, args);
    // Name
    if (options.nameRegex) {
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
      where.push(`(permission_set_name ~ $${args.length})`);
    }

    if (options.organizationGuid) {
      if (!validator.isUUID(options.organizationGuid)) {
        throw new errors.InvalidInput({
          message: `An organizationGuid must be a valid UUID: ${options.organizationGuid}`
        });
      }
      args.push(options.organizationGuid);
      where.push(`ps.organization_guid = \$${args.length}`);
    }

    if (!_.isEmpty(options.authClass)) {
      args.push(options.authClass);
      where.push(`ps.permission_set_class = ANY(\$${args.length}::text[])`);
    }

    // Application ID
    if (options.applicationID) {
      if (!validator.isUUID(options.applicationID)) {
        throw new errors.InvalidInput({
          message: `An application ID must be a valid UUID: ${options.applicationID}`
        });
      }

      args.push(options.applicationID);
      where.push(`ps.application_id = \$${args.length}`);
    }

    // Role ID
    if (options.roleID) {
      if (!validator.isUUID(options.roleID)) {
        throw new errors.InvalidInput({
          message: `A roleID ID must be a valid UUID: ${options.roleID}`
        });
      }

      args.push(options.roleID);
      where.push(`ps.role_id = \$${args.length}`);
    }

    // createdDateTime
    if (options.createdDateTime) {
      let toCreatedDateTime = moment(options.createdDateTime);
      let fromCreatedDateTime = moment(toCreatedDateTime.valueOf()).subtract(
        1,
        'day'
      );

      args.push(fromCreatedDateTime);
      args.push(toCreatedDateTime);
      where.push(
        `ps.date_modified BETWEEN \$${args.length - 1} AND \$${args.length}`
      );
    }

    // modifiedDateTime
    if (options.modifiedDateTime) {
      let toModifiedDateTime = moment(options.modifiedDateTime);
      let fromModifiedDateTime = moment(toModifiedDateTime.valueOf()).subtract(
        1,
        'day'
      );

      args.push(fromModifiedDateTime);
      args.push(toModifiedDateTime);
      where.push(
        `ps.date_created BETWEEN \$${args.length - 1} AND \$${args.length}`
      );
    }

    if (!_.isEmpty(options.hasPermissions)) {
      where.push(
        fpUtil.buildPermissionSql(
          'ps.permissions',
          options.hasPermissions,
          true
        )
      );
    }

    if (_.isArray(options.roleIds) && options.roleIds.length > 0) {
      args.push(options.roleIds);
      where.push(`ps.role_id = ANY(\$${args.length}::uuid[])`);
    }

    let whereClause = '';
    if (where.length) {
      whereClause = `WHERE ${where.join(' AND ')}`;
    }
    const sql = `
    SELECT ${selectFields}
    FROM rbac_permission_set ps ${whereClause}
    OFFSET ${options.offset || 0}
    LIMIT ${options.limit || 30};
    `;

    return serviceContext.dbConnections['sso'].read.map(
      sql,
      args,
      mapAuthPermissionSet
    );
  }

  async function createAuthPermissionSet(options) {
    const permissions = fpUtil.permissionMaskToBuffer(
      fpUtil.getPermissionMask(
        fpUtil.mapPermissionKeyByEnums(options.permissions)
      )
    );

    if (!options.organizationGuid) {
      throw new errors.InvalidInput({
        message: 'organizationGuid is invalid',
        data: {
          permission_set_name: options.name,
          organization_guid: options.organizationGuid
        }
      });
    }

    const columnData = {
      permission_set_id: options.id,
      permission_set_name: options.name,
      permission_set_description: options.description,
      permissions: `x${permissions.toString('hex')}`,
      organization_guid: options.organizationGuid,
      application_id: options.applicationID,
      role_id: options.roleID,
      created_by: options.createdBy,
      modified_by: options.createdBy,
      permission_set_class: options.authClass,
      is_protected: _.isBoolean(options.isProtected)
        ? options.isProtected
        : options.protected
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'rbac_permission_set',
      columnData,
      authPermissionSetColumns
    );

    return serviceContext.dbConnections['sso'].write.one(
      sql,
      values,
      mapAuthPermissionSet
    );
  }

  async function updateAuthPermissionSet(options) {
    const columnData = {
      permission_set_name: options.name,
      permission_set_description: options.description,
      is_protected: _.isBoolean(options.isProtected)
        ? options.isProtected
        : options.protected
    };

    if (options.permissions) {
      const permissions = fpUtil.permissionMaskToBuffer(
        fpUtil.getPermissionMask(
          fpUtil.mapPermissionKeyByEnums(options.permissions)
        )
      );
      columnData['permissions'] = `x${permissions.toString('hex')}`;
    }

    const whereClause = `
      permission_set_id = '${options.id}' AND
      is_protected = false
    `;

    const { sql, values } = mainUtil.makeUpdateSql(
      'rbac_permission_set',
      columnData,
      authPermissionSetColumns,
      whereClause
    );

    const res = await serviceContext.dbConnections['sso'].write.map(
      sql,
      values,
      mapAuthPermissionSet
    );

    if (res.length !== 1) {
      throw new errors.NotFound({
        message: 'Authorization permission set not found',
        data: {
          roleId: options.id
        }
      });
    }

    return res[0];
  }

  function checkPermissions(role, permissions, requireAll) {
    if (!Array.isArray(role.permissionMask) || !Array.isArray(permissions)) {
      return false;
    }
    return fpUtil.hasPermissions(role.permissionMask, permissions, requireAll);
  }

  async function deleteAuthPermissionSet(context, options) {
    const values = [];

    const sql = `
      DELETE FROM rbac_permission_set 
      WHERE permission_set_id = $1
        AND NOT EXISTS(SELECT * FROM rbac_acl WHERE permission_set_id = $1)
        AND is_protected = false
      RETURNING permission_set_id, permission_set_name, permission_set_description, organization_guid;
    `;
    values.push(options.permissionSetId);

    const res = await serviceContext.dbConnections['sso'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return { id: _.get(res[0], 'permissionSetId'), message: null };
  }

  // RBAC auth permission sets cache type key - enables:
  // - L1 local cache (configurable via config.localCache.rbacAuthPermissionSets)
  // - L2 Redis cache with dirty marking for cross-service invalidation
  const AUTH_PERMISSION_SET_TYPE_KEY = 'rbacAuthPermissionSets';
  function _buildAuthPermissionSetMarkedKey(orgGuid) {
    return `rbac_auth_permission_set_marked_key:${orgGuid}`;
  }
  async function markCacheDirtyForGetAuthPermissionSets(orgGuid) {
    if (!_.isNil(orgGuid)) {
      const markedKey = _buildAuthPermissionSetMarkedKey(orgGuid);
      await redisCache.markCacheDirty(markedKey);
    }
  }
  async function getAuthPermissionSetsWithCache(options) {
    const markedKey = _buildAuthPermissionSetMarkedKey(
      options.organizationGuid
    );
    const cacheKey = mainUtil.buildFilterOptionKey(options);

    const {
      asyncGetCacheValue,
      asyncRefreshCacheValue
    } = await mainUtil.validateCacheKey(
      markedKey,
      AUTH_PERMISSION_SET_TYPE_KEY,
      cacheKey,
      {
        useL1Cache: true,
        ttlMinL2Override: 120 // 2 hours TTL for L2 cache
      }
    );

    let result = await asyncGetCacheValue();

    if (_.isEmpty(result) || options.skipCache) {
      result = await getAuthPermissionSetsDb(options);
      await asyncRefreshCacheValue(result);
    }

    return result;
  }

  return {
    getAuthPermissionSets: getAuthPermissionSetsWithCache,
    createAuthPermissionSet,
    updateAuthPermissionSet,
    deleteAuthPermissionSet,
    checkPermissions,

    // refresh cache functions
    markCacheDirtyForGetAuthPermissionSets,

    // for unit-tests or who want to ignore the cache layer
    getAuthPermissionSetsDb
  };
};
