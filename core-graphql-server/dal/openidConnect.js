const _ = require('lodash');
const moment = require('moment');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const mainUtil = require('../util')();
  const mapper = require('./mapper.js');
  const errors = require('../error')(config);
  const openIdConnectSelect = `
    soc.connect_id as id,
    soc.owner_organization_guid,
    soc.name,
    soc.description,
    soc.website_url,
    soc.login_button_style,
    soc.is_global,
    soc.use_notice,
    soc.date_created,
    soc.date_modified,
    soc.credentials_ciphertext,
    soc.allowed_redirect_targets,
    soc.external_credential_id,
    soc.redirect_base_url
  `;
  const openIdConnectReturning = {
    connect_id: 'id',
    owner_organization_guid: null,
    name: null,
    description: null,
    website_url: null,
    credentials_ciphertext: null,
    login_button_style: null,
    is_global: null,
    use_notice: null,
    date_created: null,
    date_modified: null,
    allowed_redirect_targets: null,
    external_credential_id: null,
    redirect_base_url: null
  };

  async function getOpenIdConnect(context, args) {
    if (_.isNil(args.id)) {
      throw new errors.InvalidInput({ message: 'connectId is required.' });
    }

    const res = await getOpenIdConnects(context, args);

    if (!res.count) {
      throw new errors.NotFound({
        message: 'The OpenId Provider was not found',
        data: {
          objectType: 'OpenId Provider',
          objectId: args.id
        }
      });
    }

    return res.records[0];
  }

  async function getOpenIdConnects(context, args, dbTrans) {
    if (!dbTrans) {
      dbTrans = serviceContext.dbConnections['sso'].read;
    }
    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const whereAnd = [];
    const values = [];
    const requestorOrgId = _.get(
      context,
      '_authInfo.organization.organizationId',
      args.organizationId // The organizationId of userToken/apiToken context
    );

    mainUtil.addSqlWhere('soc.connect_id', args.id, whereAnd, values);
    mainUtil.addSqlWhere('soc.connect_id', args.ids, whereAnd, values);
    mainUtil.addSqlWhere('soc.is_global', args.isGlobal, whereAnd, values);

    let joinClause = '';
    let filterOrgId = isSuperAdmin ? args.orgId : requestorOrgId;
    const checkAdmin = _.get(args, 'checkAdmin', true);

    if (!checkAdmin) {
      filterOrgId = args.orgId;
    }

    if (_.isNil(filterOrgId) && !isSuperAdmin) {
      throw new errors.InternalServerError({
        message: 'Cannot determine organizationId for current user',
        data: {
          objectType: 'organizationId',
          objectId: args.organizationId
        }
      });
    }

    if (filterOrgId) {
      const filterOrgGuid = await serviceContext.dal.application.getAppIdFromOrgId(
        filterOrgId
      );

      if (filterOrgGuid) {
        joinClause =
          'LEFT JOIN sso_openid_connect__organization soco ON soco.connect_id = soc.connect_id AND enabled = true';
        values.push(filterOrgGuid);
        whereAnd.push(
          `(soc.owner_organization_guid = $${values.length} OR soco.organization_guid = $${values.length})`
        );
      }
    }

    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';
    const orderClause = ['soc.date_created DESC'];

    // Offset and limit clause
    values.push(args.offset || 0);
    let limitClause = ` OFFSET $${values.length} `;
    values.push(args.limit || defaultLimit);
    limitClause += ` LIMIT $${values.length} `;

    const sql = `
      SELECT
        ${openIdConnectSelect}
      FROM 	sso_openid_connect soc
        ${joinClause}
      ${whereClause}
      ORDER BY
        ${orderClause.join(', ')}
      ${limitClause};
    `;
    const rows = await serviceContext.dbConnections['sso'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return mainUtil.toPage(args, rows);
  }

  async function updateOpenidConnect(context, args) {
    if (!args.id) {
      throw new errors.InvalidInput({
        message: 'OpenId Connect ID is required.'
      });
    }

    const columnData = {
      name: args.name,
      description: args.description,
      website_url: args.websiteUrl,
      credentials_ciphertext: args.credentialsCiphertext,
      login_button_style: args.loginButtonStyle,
      is_global: args.isGlobal,
      date_modified: moment.utc().toISOString(),
      allowed_redirect_targets: args.allowedRedirectTargets,
      redirect_base_url: args.redirectBaseUrl ? _.trimEnd(args.redirectBaseUrl, '/') : null
    };
    const { sql, values } = mainUtil.makeUpdateSql(
      'public.sso_openid_connect',
      columnData,
      openIdConnectReturning,
      `connect_id = '${args.id}'`
    );

    return serviceContext.dbConnections['sso'].write.oneOrNone(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  async function getSCIMUserList(
    userId,
    organizationGuid,
    connectors,
    limit = 1000,
    offset = 0
  ) {
    if (!organizationGuid) {
      throw new errors.InvalidInput({
        message: 'Organization GUID is required.'
      });
    }

    if (!userId) {
      throw new errors.InvalidInput({
        message: 'User ID is required.'
      });
    }

    limit = _.toNumber(limit) || 1000;
    offset = _.toNumber(offset) || 0;

    const values = [userId, organizationGuid, connectors, limit, offset];
    let sqlConnectorsClause = ''; // Default to no predicate which results in all connectors
    if (_.isArray(connectors) && _.size(connectors) > 0) {
      // A user may be associated with many connectors per org
      sqlConnectorsClause = 'AND c.connect_id = ANY($3::uuid[])';
    }

    // Conform the 'openid_groups' column into an array
    const sqlSCIMGroups = `
      SELECT
        COALESCE(array_agg(scg.group_name), '{}'::text[]) 
      FROM
        sso_scim_user_group scug
      INNER JOIN
        sso_scim_group scg ON scg.group_id = scug.group_id
      INNER JOIN
        sso_user__openid_connect uc ON uc.connect_user_id = scug.connect_user_id
      INNER JOIN
        sso_openid_connect c ON c.connect_id = uc.connect_id
      WHERE
        uc.user_id = suoc.user_id AND
        c.owner_organization_guid = $2
    `;

    let sql = `
			SELECT 	suoc.user_id,
					suoc.connect_id,
					suoc.connect_user_id,
					suoc.connect_type,
					suoc.kvp,
					suoc.date_created,
					suoc.date_modified,
          suoc.openid_roles,
					(${sqlSCIMGroups}) openid_groups
			FROM 	
        sso_user__openid_connect suoc
      INNER JOIN
        sso_openid_connect c ON c.connect_id = suoc.connect_id
      WHERE
        c.owner_organization_guid = $2 AND
        suoc.user_id = $1
        ${sqlConnectorsClause}
      LIMIT $4
      OFFSET $5
		`;

    const rows = await serviceContext.dbConnections['sso'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return mainUtil.toPage({ limit, offset }, rows);
  }

  async function getExternalCredentialForOpenIdConnect(args) {
    const selectQuery = `
    SELECT
      external_credential_id,
      credential_name,
      organization_id,
      created_by,
      service_type,
      credentials_ciphertext,
      encryption_key_id,
      session_expiration,
      created_date,
      updated_date
  FROM 
      public.external_credential
  WHERE 
      external_credential_id = $1 and service_type = $2;
  `;

    let externalRecord;
    try {
      externalRecord = await serviceContext.dbConnections['sso'].read.map(
        selectQuery,
        [args.externalCredentialId, args.serviceType],
        mapper.camelizeRootKeys
      );
    } catch (err) {
      serviceContext.logger.error(err);
      externalRecord = null;
    }

    if (_.isNil(externalRecord) || _.isEmpty(externalRecord)) {
      throw new errors.NotFound({
        message: 'error getting external credential for oidc',
        data: {
          objectType: 'external credential',
          objectId: args.externalCredentialId
        }
      });
    }
    return externalRecord[0];
  }

  return {
    getOpenIdConnect,
    getOpenIdConnects,
    updateOpenidConnect,
    getSCIMUserList,
    getExternalCredentialForOpenIdConnect
  };
};
