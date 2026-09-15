const _ = require('lodash');
const fpl = require("@veritone/functional-permissions-lib");
const { LEGACY_SA, DESKTOP_SA } = require('@veritone/core-server-base/legacy-role-constants');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../error')(config);
  const mapper = require('./mapper.js');
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const mainUtil = require('../util.js')(serviceContext);
  const constants = require('../util/appConstants.js')(serviceContext);

  /*
   * Look up the user by ID, get org, and determine login method (Veritone
   * interactive or Okta).
   {
     "userId": "...",
     "userName": "example@veritone.com",
     "organizationId": "7682",
     "authenticationType": "okta",
     "oktaConfig": {
       ...
     }
   }
   */
  async function getUserLoginMethod(userLoginId) {
    if (!userLoginId) {
      throw new errors.InvalidInput({
        message: 'userLoginId must be provided and non-empty'
      });
    }
    // first get the user with org ID
    const sql = `
SELECT
  u.user_id,
  u.user_name,
  u.status,
  g.kvp->>'organizationId' as organization_id,
  g.kvp->>'organizationName' as organization_name
FROM
  sso_user u
  LEFT JOIN sso_user__sso_group ug ON ug.user_id = u.user_id
  LEFT JOIN sso_group g ON g.group_id = ug.group_id
  AND (g.kvp->>'groupType' = 'organization' OR g.group_id IS NULL)
WHERE u.user_name = $1 AND u.status != 'deleted'
    `;
    const dbres = await serviceContext.dbConnections['sso'].read.map(
      sql,
      [userLoginId],
      mapper.camelizeRootKeys
    );

    // if the user doesn't exist, throw out not_found.
    // this includes soft-deleted users.
    if (!dbres.length) {
      throw new errors.NotFound({
        message: 'User ' + userLoginId + ' not found',
        data: {
          userLoginId
        }
      });
    }
    // if the user exists but is deactivated, throw out not_allowed
    if (dbres[0].status !== 'active') {
      throw new errors.NotAllowed({
        message: 'The user ' + userLoginId + ' is not active.',
        data: {
          userLoginId
        }
      });
    }

    // get the org ID.
    const orgId = dbres[0].organizationId;

    const res = {
      userId: dbres[0].userId,
      userLoginId,
      organizationId: dbres[0].organizationId,
      organizationName: dbres[0].organizationName
    };
    const oktaConfig = await serviceContext.dal.organization.getOrgOktaConfiguration(
      {},
      {
        id: orgId
      }
    );

    if (oktaConfig.oktaAuthenticationEnabled) {
      res.authenticationType = 'okta';
      res.oktaConfig = oktaConfig;
    } else {
      res.authenticationType = 'login';
    }

    return res;
  }

  async function getACLs(options) {
    const userId = options.id;
    const sql = `
			SELECT
        acl.application_id,
        acl.user_id,
        acl.object_type,
        acl.object_id,
        acl.access
      FROM
				sso_acl acl
			WHERE
				acl.user_id = $1`;

    const acls = await serviceContext.dbConnections['sso'].read.map(
      sql,
      [userId],
      mapper.camelizeRootKeys
    );

    acls.forEach((acl, idx) => {
      if (_.startsWith(acl.objectId, 'organization')) {
        acl.organizationId = _.split(acl.objectId, '/')[1];
      }
    });

    return acls;
  }

  async function getDefaultOrgAdminUser(options, context) {
    if (!context) {
      return null;
    }
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const tokenType = resUtil.getTokenType(context);
    const isInternalToken = tokenType === 'internal';

    let organizationGuid =
      _.get(context, '_authInfo.organization.organizationGuid') ||
      _.get(
        context,
        '_authInfo.groups[0].applicationId',
        _.get(context, '_authInfo.applicationId')
      );

    if ((isSuperAdmin || isInternalToken || _.get(options, 'getAppIdFromOrgId', false)) && _.has(options, 'organizationId')) {
      const organizationId = _.get(options, 'organizationId');

      organizationGuid = await serviceContext.dal.application.getAppIdFromOrgId(
        organizationId
      );
    }

    const users = await getOrgAdminUsers(context, {
      organizationGuid,
      excludeSuperAdmin: _.get(options, 'excludeSuperAdmin', false)
    });
    const sortedUsers = _.sortBy(users, ['dateCreated']);

    return sortedUsers ? _.first(sortedUsers) : null;
  }

  async function setUserStatus(context, options, dbTrans) {
    const { status, userIds } = options;
    const validStatuses = [
      'active',
      'suspended',
      'deleted',
      'deactivated',
      'inactive'
    ];

    if (_.isNil(status) || !validStatuses.includes(status)) {
      throw new errors.InvalidInput({
        message: 'Invalid user status input!'
      });
    }

    if (!dbTrans) {
      dbTrans = serviceContext.dbConnections['sso'].write;
    }

    if (_.isEmpty(userIds)) {
      throw new errors.InvalidInput({ message: 'userIds is required.' });
    }

    for (const id of userIds) {
      mainUtil.checkId(id, false);
    }

    const sql = `
			UPDATE sso_user SET status = $1
			WHERE user_id = ANY($2::uuid[])
			RETURNING user_id, status
		`;

    return dbTrans.map(sql, [status, userIds], mapper.mapUser);
  }

  async function deleteUserOpenIdConnects(userId, connectIds, dbTrans) {
    if (!_.isArray(connectIds) || _.isEmpty(connectIds)) {
      throw new errors.InvalidInput({
        message: 'OpenId Connect ID should be an non-empty array.'
      });
    }

    if (!userId) {
      throw new errors.InvalidInput({
        message: 'userId is required.'
      });
    }

    if (!dbTrans) {
      dbTrans = serviceContext.dbConnections['sso'].write;
    }

    const sql = `
      DELETE FROM public.sso_user__openid_connect
      WHERE user_id = $1
        AND connect_id = ANY($2::uuid[]) 
      RETURNING user_id, connect_id, connect_user_id, connect_type, kvp, date_created;
    `;

    return dbTrans.map(sql, [userId, connectIds], mapper.camelizeRootKeys);
  }

  async function deleteUserSCIMConnectIds(userId, connectIds, dbTrans) {
    if (!_.isArray(connectIds) || _.isEmpty(connectIds)) {
      throw new errors.InvalidInput({
        message: 'OpenId Connect ID should be an non-empty array.'
      });
    }

    if (!userId) {
      throw new errors.InvalidInput({
        message: 'userId is required.'
      });
    }

    if (!dbTrans) {
      dbTrans = serviceContext.dbConnections['sso'].write;
    }

    const sql = `
      DELETE FROM public.sso_user__scim_connect_id 
      WHERE user_id = $1
        AND scim_connect_id = ANY($2::uuid[]) 
      RETURNING row_id, user_id, scim_connect_id;
    `;

    return await dbTrans.map(
      sql,
      [userId, connectIds],
      mapper.camelizeRootKeys
    );
  }

  async function getOrgAdminUsers(context, options) {
    let { organizationId, organizationGuid, excludeSuperAdmin } = options;
    if (_.isNil(organizationId) && _.isNil(organizationGuid)) {
      throw new errors.InvalidInput({
        message: 'organizationId is required.'
      });
    }

    if (_.isNil(organizationGuid)) {
      organizationGuid = await serviceContext.dal.application.getAppIdFromOrgId(
        organizationId
      );
    }

    const sqlParams = [organizationGuid, constants.APPS.ADMIN, constants.ROLES.ADMIN];
    let excludeClause = '';
    if (excludeSuperAdmin) {
      sqlParams.push(LEGACY_SA, DESKTOP_SA);
      excludeClause = `
        AND su.user_id NOT IN (
          SELECT sur2.user_id FROM sso_user_role sur2 WHERE sur2.role_id IN ($4, $5)
        )`;
    }

    const sql = `
      SELECT 	su.user_id,
              su.user_name,
              su.date_created
      FROM 	sso_user su
        INNER JOIN sso_user__sso_group susg on su.user_id = susg.user_id
        INNER JOIN sso_group sg on susg.group_id = sg.group_id
        INNER JOIN sso_user_role sur on sur.user_id = su.user_id AND sur.application_id = sg.application_id
        INNER JOIN role r on r.role_id = sur.role_id
        INNER JOIN application a ON r.application_id = a.application_id
      WHERE su.status = 'active'	
        AND sg.application_id = $1
        AND a.application_key = $2
        AND r.role_id = $3${excludeClause};
    `;
    return await serviceContext.dbConnections['sso'].read.map(
      sql,
      sqlParams,
      mapper.mapUser
    );
  }

  async function getOldestUserForOrg(organizationGuid) {
    if (!organizationGuid) {
      throw new Error('organizationGuid is required.');
    }
    return await _getOldestUser({ organizationGuid, excludeSuperAdmin: true });
  }

  async function getOldestSuperAdmin() {
    const user = await _getOldestUser({ superAdmin: true });
    return !_.isEmpty(user) ? user : { userId: '00000000-0000-0000-0000-000000000000' };
  }

  async function _getOldestUser(options = {}) {
    const sqlWhere = [];
    const sqlParams = [];

    sqlWhere.push(`su.status = $${sqlParams.push('active')}`);
    if (options.organizationGuid) {
      sqlWhere.push(`sg.application_id = $${sqlParams.push(options.organizationGuid)}`);
    }

    let sql = `
        SELECT
            su.user_id,
            su.user_name,
            su.date_created
        FROM sso_user su
          INNER JOIN sso_user__sso_group susg ON su.user_id = susg.user_id
          INNER JOIN sso_group sg ON susg.group_id = sg.group_id
    `;

    if (options.superAdmin) {
      sql += `  INNER JOIN sso_user_role sur ON sur.user_id = su.user_id AND sur.application_id = sg.application_id 
      INNER JOIN role r ON r.role_id = sur.role_id
      `;
      sqlWhere.push(`r.role_id = $${sqlParams.push(constants.ROLES.SUPER_ADMIN)}`);
    }

    if (options.excludeSuperAdmin) {
      sqlWhere.push(`su.user_id NOT IN (
          SELECT sur2.user_id FROM sso_user_role sur2 WHERE sur2.role_id IN ($${sqlParams.push(LEGACY_SA)}, $${sqlParams.push(DESKTOP_SA)})
        )`);
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    sql += `
        ORDER BY su.date_created ASC
        FETCH FIRST 1 ROW ONLY;
    `;

    return await serviceContext.dbConnections['sso'].read
        .map(sql, sqlParams, mapper.camelizeRootKeys)
        .then(function (rows) {
          if (_.isNil(rows) || _.isEmpty(rows)) {
            return null;
          }
          return rows[0];
        });
  }

  return {
    getUserLoginMethod,
    getACLs,
    getDefaultOrgAdminUser,
    setUserStatus,
    deleteUserOpenIdConnects,
    deleteUserSCIMConnectIds,
    getOrgAdminUsers,
    getOldestUserForOrg,
    getOldestSuperAdmin,
  };
};
