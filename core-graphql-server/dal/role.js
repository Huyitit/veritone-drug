const _ = require('lodash');
const mapper = require('./mapper.js');
const uuid = require('uuid');

module.exports = function createFunction(serviceContext) {
  const dalUtil = require('./util')(serviceContext.config, serviceContext);
  const mainUtil = require('../util.js')();
  const errors = require('../error')(serviceContext.config);
  const fpUtil = require('../modules/rbacAuth/dal/functionalPermissionsUtil.dal')(
    serviceContext
  );

  const roleColumns = {
    role_id: 'id',
    role_name: 'name',
    role_description: 'description',
    permissions: null,
    organization_id: null,
    is_private: null,
    is_app_event_role: null,
    application_id: null
  };

  function getPermissionsForRole(roleId, options) {
    // first we need to get the list of permission IDs for the role
    // then we can look up permissions themselves
    let sql = `
          SELECT
             p.permission_id as id,
             p.permission_name as name,
             p.permission_description as description
          FROM
             permission p
             LEFT OUTER JOIN
        `;

    // TODO complete function
    return {
      records: [],
      count: 0,
      offset: options.offset,
      limit: options.limit
    };
  }

  function getPermissions(options) {
    let sql = `SELECT permission_id, permission_name, permission_description,
        COUNT(*) OVER() AS total
  			FROM permission`;
    let sqlWhere = [];
    let sqlParams = [];
    const offset = options.offset || 0;

    if (
      (_.isString(options.name) && options.name.length) ||
      Array.isArray(options.name)
    ) {
      let trimmedPermNames;
      if (Array.isArray(options.name)) {
        trimmedPermNames = options.name;
      } else {
        trimmedPermNames = dalUtil.splitTrim(options.name, ',');
      }

      if (trimmedPermNames.length) {
        let inClause = [];
        trimmedPermNames.forEach(function setPermNameInClause(name) {
          sqlParams.push(name);
          inClause.push(`\$${sqlParams.length}`);
        });

        sqlWhere.push(`permission_name IN (${inClause.join(',')})`);
      }
    }

    if (
      (_.isString(options.id) && options.id.length) ||
      Array.isArray(options.id)
    ) {
      let trimmedPermIds;
      if (Array.isArray(options.id)) {
        trimmedPermIds = options.id;
      } else {
        trimmedPermIds = dalUtil.splitTrim(options.id, ',');
      }

      if (trimmedPermIds.length) {
        let inClause = [];
        trimmedPermIds.forEach(function setPermIdInClause(permId) {
          sqlParams.push(permId);
          inClause.push(`\$${sqlParams.length}`);
        });

        sqlWhere.push(`permission_id IN (${inClause.join(',')})`);
      }
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    sql += ' ORDER BY permission_name';
    if (Number.isInteger(options.limit)) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (Number.isInteger(options.offset)) {
      sql += ` OFFSET ${options.offset}`;
    }

    return serviceContext.dbConnections['sso'].read
      .map(sql, sqlParams, function (row) {
        return mapper.mapPermission(row);
      })
      .then(function (rows) {
        return {
          records: rows,
          count: rows.length,
          offset: options.offset,
          limit: options.limit
        };
      });
  }

  function _getRolesQuery(context, args) {
    const sqlWhere = [];
    const sqlParams = [];
    let sql = `
      SELECT
        r.role_id AS id,
        r.role_name,
        r.role_description,
        a.application_key AS app_name,
        r.permissions,
        r.organization_id,
        r.is_private,
        r.is_app_event_role,
        r.is_default_app_role,
        r.application_id
      FROM role r
      LEFT JOIN application a ON r.application_id = a.application_id
    `;

    mainUtil.addSqlWhere('r.role_name', args.roleName, sqlWhere, sqlParams);
    mainUtil.addSqlWhere('r.role_id', args.id, sqlWhere, sqlParams);
    mainUtil.addSqlWhere('r.role_id', args.ids, sqlWhere, sqlParams);
    mainUtil.addSqlWhere(
      'r.application_id',
      args.applicationId,
      sqlWhere,
      sqlParams
    );

    if (_.isArray(args.organizationIds) && !_.isEmpty(args.organizationIds)) {
      sqlParams.push(args.organizationIds);
      sqlWhere.push(
        `(r.organization_id IS NULL OR r.organization_id = ANY($${sqlParams.length}::int[]))`
      );
    } else {
      // If we filter by role ids/ role.application_id, no need this condition for organization_id
      if (!(args.id || args.ids) && !args.applicationId) {
        sqlWhere.push('r.organization_id IS NULL');
      }
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    sql += ' ORDER BY r.organization_id, a.application_key, role_name';

    return {
      sql,
      sqlParams
    };
  }

  async function getRoles(context, args, skipValidateRole = false) {
    // Get query
    const { sql, sqlParams } = _getRolesQuery(context, args);

    const rows = await serviceContext.dbConnections['sso'].read.map(
      sql,
      sqlParams,
      mapper.mapRole
    );

    const validRows = skipValidateRole
      ? rows
      : dalUtil.validateRoles(context, rows);

    return mainUtil.toPage(args, validRows);
  }

  // this function creates new roles. The param 'role' can be one role or an array
  // the result will be an array
  async function createRoles(context, role, dbClient) {
    if (_.isNil(role)) {
      throw new errors.InvalidInput({
        message: `the param 'role' is required`,
        data: {
          role: role
        }
      });
    }

    let results = [];
    let roles = role;
    if (!_.isArray(role)) {
      roles = [role];
    }

    const _roles = roles.map((r) => {
      // get permission mark
      let permissionMark = [];
      if (_.isArray(r.permissions) && r.permissions.length > 0) {
        permissionMark = fpUtil.getPermissionMaskFromEnums(r.permissions);
      }

      return {
        role_id: r.id || uuid.v4(),
        role_name: r.name,
        role_description: r.description,
        application_id: r.applicationId,
        organization_id: r.organizationId,
        is_private: r.isPrivate,
        is_app_event_role: r.isAppEventRole,
        permissions: permissionMark
      };
    });

    // Get query, args
    const { sql, values } = mainUtil.makeInsertSql(
      'public.role',
      _roles,
      roleColumns
    );
    // Get db client
    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].write;

    try {
      results = await client.map(sql, values, mapper.mapRole);
    } catch (err) {
      throw new errors.ServiceFailure({
        message: 'Failed to create application roles',
        error: err
      });
    }

    return results;
  }

  return {
    getPermissionsForRole,
    getPermissions,
    getRoles,
    _getRolesQuery, // Export for testing
    createRoles
  };
};
