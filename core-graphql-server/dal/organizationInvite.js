const _ = require('lodash');
const validator = require('validator');
const { v4: uuidv4 } = require('uuid');

module.exports = function createFunction(serviceContext) {
  const mapper = require('./mapper.js');
  const util = require('../util.js')();
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const errors = require('../error')(config);

  const _validateGetOrganizationInvitesInput = (userId, organizationInviteId) => {
    // Check if userId is valid
    if (userId && !validator.isUUID(userId)) {
      logger.error('Invalid userId');
      throw new errors.InvalidInput({
        message: 'Invalid userId',
        data: {
          objectId: userId,
          objectType: 'userId'
        }
      });
    }

    if (organizationInviteId && !validator.isUUID(organizationInviteId)) {
      throw new errors.InvalidInput({
        message: 'organizationInviteId is invalid',
        data: {
          objectType: 'organizationInviteId',
          objectId: organizationInviteId
        }
      });
    }
  };

  const _buildGetOrganizationInvitesWhereClause = (obj, args) => {
    const { organizationInviteId, status, email } = args;
    const { userId, organizationId } = obj;
    let statuses = args.statuses || [];
    let inviteType = args.inviteType || null;
    const now = Math.floor(Date.now() / 1000);
    const whereAnd = [];
    const values = [];

    util.addSqlWhere(_.snakeCase('userId'), userId, whereAnd, values);
    util.addSqlWhere(_.snakeCase('email'), email, whereAnd, values);
    util.addSqlWhere(
      _.snakeCase('organizationInviteId'),
      organizationInviteId,
      whereAnd,
      values
    );
    util.addSqlWhere(
      _.snakeCase('organizationId'),
      organizationId,
      whereAnd,
      values
    );
    if (inviteType) {
      util.addSqlWhere(
        'invite_type',
        _.snakeCase(inviteType),
        whereAnd,
        values
      );
    }

    let whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';

    if (status) {
      statuses.push(status);
    }
    if (statuses.length > 0) {
      values.push(statuses);
      whereClause +=
        (whereClause ? ' AND ' : ' WHERE ') +
        ` CASE WHEN ${now} > expiration_date AND status NOT IN ('deleted', 'completed') then 'expired' ELSE status END = ANY($${values.length}::text[])`;
    }

    if (!whereClause) {
      logger.error(
        `Error: dal.getOrganizationInvtes: Empty where clause.`,
        args
      );
      throw new errors.InvalidInput(
        `Error: dal.getOrganizationInvtes: Empty where clause.`,
        args
      );
    }

    return { whereClause, values };
  };

  const _buildGetOrganizationInvitesOrderBy = (queryOptions) => {
    const orderByAnd = [];
    const orderByMap = {
      email: 'email',
      status: 'status',
      expiration_date: 'expiration_date',
      new_user_flag: 'new_user_flag'
    };

    if (queryOptions && queryOptions.orderBy) {
      const orderBy = queryOptions.orderBy;
      const field = orderByMap[orderBy.field];
      if (field) {
        orderByAnd.push(`${field} ${orderBy.direction || 'ASC'}`);
      }
    }

    if (orderByAnd.length === 0) {
      orderByAnd.push('new_user_flag DESC');
    }
    return `ORDER BY ${orderByAnd.join(', ')}`;
  };

  const getOrganizationInvites = async (obj, args, context, queryOptions, trans) => {
    const { organizationInviteId } = args;
    const { userId } = obj;

    _validateGetOrganizationInvitesInput(userId, organizationInviteId);

    const { whereClause, values } = _buildGetOrganizationInvitesWhereClause(
      obj,
      args
    );

    const orderByClause = _buildGetOrganizationInvitesOrderBy(queryOptions);

    const sql = `
      SELECT
        organization_invite_id,
        organization_id,
        user_id,
        email,
        message,
        status,
        expiration_date,
        user_details,
        invite_type,
        auth_group_ids,
        created_by,
        password_reset_token,        
        CASE WHEN password_reset_token IS NULL THEN 0 ELSE 1 END AS new_user_flag
      FROM
        organization_invite
      ${whereClause}
      ${orderByClause};
    `;

    try {
      return await (trans || serviceContext.dbConnections['sso'].read).map(
        sql,
        values,
        mapper.camelizeRootKeys
      );
    } catch (err) {
      logger.error(err);
      throw errors.InternalServerError('Database Error. ');
    }
  };

  const getApplicationAndRoleIds = async (obj, context) => {
    const { organizationInviteId } = obj;

    // Check if organizationInviteId is valid
    if (organizationInviteId && !validator.isUUID(organizationInviteId)) {
      throw new errors.InvalidInput({
        message: 'Invalid organizationInviteId',
        data: {
          objectId: organizationInviteId,
          objectType: 'organizationInviteId'
        }
      });
    }

    const whereAnd = [];
    const values = [];

    util.addSqlWhere(
      _.snakeCase('organizationInviteId'),
      organizationInviteId,
      whereAnd,
      values
    );

    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';

    if (!whereClause) {
      logger.error(`Error: dal.getApplicationAndRoleIds: Empty where clause.`);
      throw new errors.InvalidInput(
        `Error: dal.getApplicationAndRoleIds: Empty where clause.`
      );
    }

    const sql = `
      SELECT
        organization_invite_id,
        application_id,
        role_id
      FROM
        organization_invite__application_roles
      ${whereClause};
    `;

    return await serviceContext.dbConnections['sso'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  };

  const getOrganizationInviteActionAudit = async (obj, args, context) => {
    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const { organizationInviteId } = obj;
    const { actor, orderBy } = args;

    // Check if organizationInviteId is valid
    if (organizationInviteId && !validator.isUUID(organizationInviteId)) {
      throw new errors.InvalidInput({
        message: 'Invalid organizationInviteId',
        data: {
          objectId: organizationInviteId,
          objectType: 'organizationInviteId'
        }
      });
    }

    const whereAnd = [];
    const values = [];
    const orderClause = [];
    const orderByMap = {
      timestamp: 'timestamp'
    };

    util.addSqlWhere(
      _.snakeCase('organizationInviteId'),
      organizationInviteId,
      whereAnd,
      values
    );

    util.addSqlWhere('actor', actor, whereAnd, values);

    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';

    if (!whereClause) {
      logger.error(
        `Error: dal.getOrganizationInviteActionAudit: Empty where clause.`,
        args
      );
      throw new errors.InvalidInput(
        `Error: dal.getOrganizationInviteActionAudit: Empty where clause.`,
        args
      );
    }

    if (orderBy) {
      const col = orderByMap[orderBy.field];

      if (!col) {
        throw new errors.InternalServerError({
          message:
            'An internal server configuration error in order by processing has occurred.',
          data: {
            internalData: {
              orderByField: orderBy.field,
              knownFields: Object.keys(orderByMap)
            }
          }
        });
      }

      orderClause.push(`${col} ${_.get(orderBy, 'direction', '')}`);
    }

    const sql = `
      SELECT
        organization_invite_id,
        action,
        prior_status,
        actor,
        timestamp,
        kvp
      FROM
        organization_invite__invite_action_audit
      ${whereClause}
      ${orderClause.length ? ` ORDER BY ${orderClause.join(', ')}` : ''}
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || defaultLimit};`;

    return await serviceContext.dbConnections['sso'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  };

  function _mapInviteTypeInputToDb(inviteType) {
    if (inviteType === 'selfSignup' || inviteType === 'self_signup') {
      return 'self_signup';
    } else if (inviteType === 'userInvite' || inviteType === 'user_invite') {
      return 'user_invite';
    }
    return null;
  }

  function _orgInviteQuery(context, args) {
    const { input } = args;
    // Insert into organizationInvite
    const valueOrgInvite = [];
    const now = Math.floor(Date.now() / 1000);
    const inviteTypeDb = _mapInviteTypeInputToDb(
      Boolean(input.inviteType) ? input.inviteType : 'userInvite'
    );

    const sqlOrgInvite = `
      INSERT INTO organization_invite (
        organization_invite_id, 
        organization_id, 
        user_id, 
        email, 
        message, 
        status,
        expiration_date,
        created_by,
        password_reset_token,
        user_details,
        auth_group_ids,
        invite_type
      )
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::public.invite_type
      WHERE NOT EXISTS (
        SELECT 1 FROM organization_invite 
        WHERE organization_id = $2 
          AND email = $4
          AND status IN ('submitted', 'approved') 
          AND expiration_date > ${now}
      )
      RETURNING *;
    `;

    valueOrgInvite.push(
      input.organizationInviteId,
      input.organizationId,
      input.userId,
      input.email,
      input.message,
      input.needsConfirmation ? 'submitted' : 'approved',
      input.expirationDate,
      input.createdBy,
      input.passwordResetToken,
      input.userDetails,
      input.authGroupIds,
      inviteTypeDb
    );

    return { sql: sqlOrgInvite, params: valueOrgInvite };
  }

  const createOrganizationInvite = async (context, args, trans) => {
    const { input } = args;
    let kvp = {};

    const run = async (tx) => {
      // Store data in KVP for audit.
      kvp.organizationInviteId = input.organizationInviteId;
      kvp.organizationId = input.organizationId;
      kvp.email = input.email;

      const requestorInfo = _.pick(context._authInfo, [
        'userId',
        'userName',
        'email',
        'kvp'
      ]);
      kvp.createdBy = {
        ..._.omit(requestorInfo, ['kvp']),
        ..._.pick(requestorInfo.kvp || {}, ['firstName', 'lastName', 'image'])
      };
      // Insert into organizationInvite
      const { sql, params } = _orgInviteQuery(context, args);

      const orgInvite = await tx.oneOrNone(
        sql,
        params,
        mapper.camelizeRootKeys
      );
      if (_.isNil(orgInvite)) {
        throw new errors.ResourceConflict({
          message: `User '${input.email}' has already been invited to join the organization '${input.organizationId}'`,
          data: {
            objectType: 'User',
            objectId: input.userId,
            organizationId: input.organizationId,
            username: input.email
          }
        });
      }
      // Store AppRoles in KVP for audit.
      kvp.applicationRoles = input.applicationRoles;
      // insert into organizationInvite_applicationRoles
      await _createAppRolesForOrgInvite(
        input.organizationInviteId,
        input.applicationRoles,
        tx
      );

      // record creation action.
      // T55: must be awaited (like the other _recordAction call sites in this
      // file) so a failed insert surfaces here and rolls back the tx, instead
      // of becoming a silent unhandled rejection that lets the invite commit
      // without its audit row.
      await _recordAction(
        uuidv4(),
        input.organizationInviteId,
        'submit',
        'submitted', // not allow empty string
        input.createdBy,
        kvp,
        tx
      );

      return orgInvite;
    };

    try {
      if (trans) {
        return await run(trans);
      }

      return await serviceContext.dbConnections['sso'].write.tx(
        'createOrganizationInvite',
        run
      );
    } catch (err) {
      logger.error(
        'dal.createOrganizationInvite: Failed to create organization invite'
      );
      if (err instanceof errors.ResourceConflict) {
        throw err;
      }

      throw new errors.InternalServerError({
        message: `dal.createOrganizationInvite: Failed to create organization invite`
      });
    }
  };

  const updateOrganizationInvite = async (context, args, trans) => {
    const { input } = args;
    const actorUserId = _.get(context._authInfo, 'userId');
    const {
      organizationInviteId,
      message,
      applicationRoles,
      action,
      needsConfirmation,
      passwordResetToken
    } = input;

    let kvp = {};

    const run = async (tx) => {
      // insert into organizationInvite_applicationRoles
      // Only submit action will update AppRoles
      if (action === 'submit' || action === 'request') {
        // Because applicationRoles field is required, and will always replace current value.
        // Remove current AppRoles and Insert new.
        const sqlDeleteAppRoles = `
              DELETE FROM organization_invite__application_roles
              WHERE organization_invite_id = $1;
            `;

        await tx.none(
          sqlDeleteAppRoles,
          [organizationInviteId],
          mapper.camelizeRootKeys
        );

        // record change of application role requests
        kvp.applicationRoles = applicationRoles;

        await _createAppRolesForOrgInvite(
          organizationInviteId,
          applicationRoles,
          tx
        );
      }

      let sqlUpdateInvite;

      let requiredStatus = ['submitted', 'approved'];

      if (action === 'complete') {
        requiredStatus = ['approved'];
      } else if (action === 'resend') {
        requiredStatus = ['approved', 'expired'];
      }

      const sqlArgs = [organizationInviteId, requiredStatus];

      // set update fields
      const setFields = [];
      sqlArgs.push(_getStatusByAction(action, needsConfirmation));
      setFields.push(`status=$${sqlArgs.length}`);
      if (message) {
        sqlArgs.push(message);
        setFields.push(`message=$${sqlArgs.length}`);
      }
      if (passwordResetToken) {
        sqlArgs.push(passwordResetToken);
        setFields.push(`password_reset_token=$${sqlArgs.length}`);
      }

      sqlUpdateInvite = `
          UPDATE organization_invite oi SET
            ${setFields.join(',')} 
          WHERE oi.organization_invite_id = $1
          AND oi.status = ANY($2)
          RETURNING *;
        `;

      const orgInv = await tx.one(
        sqlUpdateInvite,
        sqlArgs,
        mapper.camelizeRootKeys
      );
      // Record action.
      await _recordAction(
        uuidv4(),
        organizationInviteId,
        action,
        _.get(orgInv, 'status', 'invalid'),
        actorUserId,
        kvp,
        tx
      );

      return orgInv;
    };

    try {
      if (trans) {
        return await run(trans);
      }

      return await serviceContext.dbConnections['sso'].write.tx(
        'updateOrganizationInvite',
        run
      );
    } catch (err) {
      logger.error({
        msg: 'dal.updateOrganizationInvite: Query error, no record to update',
        err,
      });
      throw new errors.InternalServerError({
        message:
          'dal.updateOrganizationInvite: Failed to update organization invite'
      });
    }
  };

  const updateOrgInviteWithNewUserId = async (context, args, dbClient) => {
    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].write;
    const { email, userId } = args;

    let kvp = {};
    try {
      return await client.tx('updateOrgInviteWithNewUserId', async (trans) => {
        let sqlUpdateInvite;
        const sqlArgs = [email, userId];

        sqlUpdateInvite = `
          UPDATE organization_invite oi SET
            user_id = $2
          WHERE oi.email = $1
            AND oi.user_id IS NULL
          RETURNING *;
        `;

        const orgInv = await trans.many(
          sqlUpdateInvite,
          sqlArgs,
          mapper.camelizeRootKeys
        );

        return orgInv;
      });
    } catch (err) {
      logger.error(
        'dal.updateOrgInviteWithNewUserId: Query error, no record to update'
      );
      throw new errors.InvalidInput(
        'dal.updateOrgInviteWithNewUserId: Query error, no record to update',
        err
      );
    }
  };

  const deleteOrganizationInvite = async (context, args, dbClient) => {
    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].write;
    const { organizationInviteId, userId, email } = args;
    const actorUserId = _.get(context._authInfo, 'userId');

    // Record info for easier retrieval later
    const kvp = {
      organizationInviteId: organizationInviteId,
      userId: userId,
      email: email
    };
    try {
      return await client.tx('updateOrganizationInvite', async (trans) => {
        // delete invitation
        const sqlDeleteApplicationRoles = `
          DELETE FROM organization_invite__application_roles
          WHERE organization_invite_id = $1;
        `;

        const sqlDeleteInvite = `
          DELETE FROM organization_invite
          WHERE organization_invite_id = $1
          RETURNING *;
        `;

        await trans.none(
          sqlDeleteApplicationRoles,
          [organizationInviteId],
          mapper.camelizeRootKeys
        );

        const orgInv = await trans.one(
          sqlDeleteInvite,
          [organizationInviteId],
          mapper.camelizeRootKeys
        );

        if (orgInv) {
          logger.info({
            message: 'Deleted Organization Invite.',
            payload: orgInv
          });

          // Record action.
          await _recordAction(
            uuidv4(),
            organizationInviteId,
            'delete',
            orgInv.status,
            actorUserId,
            kvp,
            trans
          );

          // Remove SCIM connection of user
          await _removeSCIMConnectionForUser(
            context,
            orgInv.userId,
            orgInv.organizationId,
            trans
          );
        }

        return {
          id: orgInv.organizationInviteId,
          message: 'Invitation deleted'
        };
      });
    } catch (err) {
      logger.error(
        'dal.deleteOrganizationInvite: Query error, no record to delete'
      );
      throw new errors.InvalidInput(
        'dal.deleteOrganizationInvite: Query error, no record to delete',
        err
      );
    }
  };

  const _createAppRolesForOrgInvite = async (
    organizationInviteId,
    applicationRoles,
    dbClient
  ) => {
    if (_.isEmpty(applicationRoles)) {
      return;
    }

    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].write;

    const columnData = applicationRoles.map((appRole) => ({
      id: uuidv4(),
      organization_invite_id: organizationInviteId,
      application_id: appRole.applicationId,
      role_id: appRole.roleId
    }));

    const { sql, values } = util.makeInsertSql(
      'organization_invite__application_roles',
      columnData,
      { id: 'id' }
    );

    await client.map(sql, values, mapper.camelizeRootKeys);
  };

  const _recordAction = async (
    id,
    organizationInviteId,
    action,
    priorStatus,
    actor,
    kvp,
    dbClient
  ) => {
    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].write;
    // insert into organizationInvite_audit
    const valueAudit = [
      id,
      organizationInviteId,
      action,
      priorStatus,
      actor,
      kvp
    ];

    const sqlAudit = `
      INSERT INTO organization_invite__invite_action_audit (
        id,
        organization_invite_id,
        action,
        prior_status,
        actor,
        kvp
      )
      VALUES ($1, $2, $3, $4, $5, $6);
    `;
    await client.map(sqlAudit, valueAudit, mapper.camelizeRootKeys);
  };

  const _removeSCIMConnectionForUser = async (
    context,
    userId,
    organizationId,
    dbTrans
  ) => {
    if (!organizationId || !userId) {
      return;
    }

    // get connect id by owner org id and user id
    const openIdConnects = await serviceContext.dal.openidConnect.getOpenIdConnects(
      context,
      {
        orgId: organizationId
      },
      dbTrans
    );

    // remove scim connections of user
    if (openIdConnects && openIdConnects.count > 0) {
      const arrayConnectIds = _.map(
        openIdConnects.records,
        (openIdConnect) => openIdConnect.id
      );
      await Promise.all([
        serviceContext.dal.user.deleteUserOpenIdConnects(
          userId,
          arrayConnectIds,
          dbTrans
        ),
        serviceContext.dal.user.deleteUserSCIMConnectIds(
          userId,
          arrayConnectIds,
          dbTrans
        )
      ]);
    }
  };

  const _getStatusByAction = (action, needsConfirmation) => {
    // Limitation was set in BLL.organizationInvite
    const statusMap = {
      // only Admin can use 'submit', 'approve', 'reject' actions.
      submit: needsConfirmation ? 'submitted' : 'approved',
      approve: 'approved',
      // Resend should keep the invitation in approved state
      resend: 'approved',
      reject: 'rejected',
      // only users can use 'request' and 'complete' actions
      complete: 'completed',
      request: 'submitted',
      // both allowed
      delete: 'deleted'
    };

    return statusMap[action];
  };

  async function cleanExpiredInvites(context, args, trans) {
    const { organizationId, email } = args;
    if (!organizationId || !email) {
      throw new errors.InvalidInput(
        'organizationId and email are required. Actual input: ',
        args
      );
    }
    const now = Math.floor(Date.now() / 1000);
    const sql = `
        WITH expired_invites AS (
          SELECT organization_invite_id 
          FROM organization_invite 
          WHERE organization_id = $1 
            AND LOWER(email) = LOWER($2)
            AND status <> 'completed'
            AND expiration_date <= $3
        ), delete_ref_1 AS (
          DELETE FROM organization_invite__invite_action_audit
          WHERE organization_invite_id IN (SELECT organization_invite_id FROM expired_invites)
        ), delete_ref_2 AS (
          DELETE FROM organization_invite__application_roles
          WHERE organization_invite_id IN (SELECT organization_invite_id FROM expired_invites)
        )
        DELETE FROM organization_invite 
        WHERE organization_invite_id IN (SELECT organization_invite_id FROM expired_invites);
    `;

    const params = [organizationId, email, now];
    const run = async (tx) => {
      return tx.none(sql, params);
    };
    try {
      if (trans) {
        return await run(trans);
      }
      return await serviceContext.dbConnections['sso'].write.tx(
        'cleanExpiredInvites',
        run
      );
    } catch (err) {
      logger.error({
        msg: 'dal.cleanExpiredInvites: Failed to clean expired invites',
        err,
        input: args
      });
      throw new errors.Internal(
        'dal.cleanExpiredInvites: Failed to clean expired invites',
        err
      );
    }
  }

  const validateApplicationRolesExist = async (
    context,
    applicationRoles,
    organizationId
  ) => {
    if (!applicationRoles || applicationRoles.length === 0) return;

    const applicationIds = _.uniq(_.map(applicationRoles, 'applicationId'));
    const roleIds = _.uniq(_.map(applicationRoles, 'roleId'));

    // Validate applications and organization access
    const appsResult = await serviceContext.dal.application.getApplications(
      {
        ids: applicationIds,
        organizationId: organizationId,
        all: true
      },
      context
    );
    const validAppsMap = _.keyBy(appsResult.records, 'id');

    // Validate roles
    const rolesResult = await serviceContext.dal.role.getRoles(
      context,
      {
        ids: roleIds,
        applicationId: applicationIds
      },
      true
    );
    const validRolesMap = _.keyBy(rolesResult.records, 'id');

    for (const appRole of applicationRoles) {
      const { applicationId, roleId } = appRole;

      if (!validAppsMap[applicationId]) {
        throw new errors.NotFound({
          message:
            'The application was not found. It either does not exist or you or your organization do not have access to it.',
          data: {
            objectType: 'Application',
            objectId: applicationId
          }
        });
      }

      const role = validRolesMap[roleId];
      if (!role) {
        throw new errors.NotFound({
          message:
            'The role was not found. It either does not exist or you or your organization do not have access to it.',
          data: {
            objectType: 'Role',
            objectId: roleId
          }
        });
      }

      if (role.applicationId !== applicationId) {
        throw new errors.NotFound({
          message: 'The role does not belong to the specified application.',
          data: {
            objectType: 'Role',
            objectId: roleId,
            applicationId: applicationId
          }
        });
      }
    }
  };

  return {
    getOrganizationInvites,
    getApplicationAndRoleIds,
    getOrganizationInviteActionAudit,
    _validateGetOrganizationInvitesInput,
    _buildGetOrganizationInvitesWhereClause,
    _buildGetOrganizationInvitesOrderBy,
    createOrganizationInvite,
    _orgInviteQuery, // Export for testing
    updateOrganizationInvite,
    deleteOrganizationInvite,
    updateOrgInviteWithNewUserId,
    cleanExpiredInvites,
    validateApplicationRolesExist
  };
};
