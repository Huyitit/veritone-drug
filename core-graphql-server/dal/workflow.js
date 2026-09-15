const _ = require('lodash');
const request = require('request-promise');
const mapper = require('./mapper.js');
const randomstring = require('randomstring');
const moment = require('moment');

module.exports = function createFunction(
  logger,
  config,
  dbConnections,
  serviceContext
) {
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')();
  const dalUtil = require('./util.js')(config, serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);

  const workflowBaseUri = _.get(config, 'services.workflowBaseUri');
  const managementApiUri = _.get(config, 'services.workflowManagementApiUri');

  const NR_MASTER_TOKEN = '97351cfb-8ee7-4b4c-b48f-6dc26c7835a1';
  const FLOW_ROLE_ID = _.get(config, 'workflow.flowRoleId');
  const AUTOMATE_APP_ID = _.get(config, 'workflow.automateAppId');

  async function startWorkflow(ctx, args) {
    const id = args.workflowRuntimeId;
    const orgId = args.orgId;
    const authToken = NR_MASTER_TOKEN; //_.get(ctx, 'requestContext.authToken', '');
    _validateId(id);
    let endpointUri;
    try {
      const orgTokenResp = await _getOrgToken(ctx, orgId);
      let tokenId;
      logger.debug('org tokens', orgTokenResp);
      for (const t of Object.values(orgTokenResp)) {
        const apiToken = _.get(t, 'tokenId');
        const isInternal = _.get(t, 'json.internal', false);
        const isRevoked = _.get(t, 'json.isRevoked', false);
        const rights = _.get(t, 'json.rights', []);
        const isWorkflowToken =
          _.get(t, 'json.tokenType', 'default') === 'workflow';
        if (isInternal && apiToken && isWorkflowToken && !isRevoked) {
          if (rights.indexOf('workflow:create') >= 0) {
            tokenId = apiToken;
            break;
          }
        }
      }
      // upsert workflow token, allows orgs to get new workflow auth rights when restarting
      const createdToken = await serviceContext.dal.admin.createInternalApiToken(
        {
          id: tokenId,
          tokenType: 'workflow',
          organizationId: orgId
        }
      );
      tokenId = createdToken.id;

      let dbWorkflow;
      try {
        dbWorkflow = await getWorkflow(ctx, {
          workflowRuntimeId: id
        });
      } catch (err) {
        // workflow not found
      }

      let workflowAuthToken;
      if (!dbWorkflow || !dbWorkflow.authToken || args.generateAuthToken) {
        // first time creating the workflow or
        // upgrading an old workflow or
        // generate the token if requested
        workflowAuthToken = randomstring.generate({
          length: 40
        });
      } else {
        // otherwise, keep the auth token the same
        workflowAuthToken = dbWorkflow.authToken;
      }

      const apiResponse = await _makeRequest(
        'POST',
        'start',
        authToken,
        {
          API_TOKEN: tokenId,
          ORG_ID: orgId.toString(),
          AUTH_TOKEN: workflowAuthToken
        },
        id
      );

      if (!apiResponse.success) {
        logger.error('node-red start instance failed', apiResponse);
        throw new Error('failed to start workflow');
      }

      endpointUri = _getEndpointUri(apiResponse, id);
      const createdBy = ctx._authInfo.userId || orgId;

      const params = [
        id,
        orgId,
        'node-red',
        endpointUri,
        {},
        tokenId,
        workflowAuthToken,
        createdBy
      ];
      const sql = `INSERT INTO workflow.workflow_runtime
            (workflow_runtime_id,
            organization_id,
            runtime_type,
            host_uri,
            metadata,
            token_id,
            auth_token,
            created_by,
            updated_by,
            created_at,
            updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, clock_timestamp(), clock_timestamp())
        ON CONFLICT ON CONSTRAINT workflow_runtime_id_pk DO UPDATE SET
        (organization_id,
         runtime_type,
         host_uri,
         metadata,
         token_id,
         auth_token,
         updated_by,
         updated_at) = ($2, $3, $4, $5, $6, $7, $8, clock_timestamp()) RETURNING *;`;

      const resp = await serviceContext.dbConnections['core'].write.any(
        sql,
        params
      );

      logger.debug('added workflow to database', resp[0]);
      return {
        success: true,
        uri: endpointUri
      };
    } catch (e) {
      if (e.statusCode === 409) {
        return {
          success: false,
          message: _.get(e, 'message', 'Unknown Error'),
          uri: endpointUri
        };
      }
      return {
        success: false,
        message: _.get(e, 'message', 'Unknown Error')
      };
    }
  }

  async function stopWorkflow(ctx, args) {
    const id = args.workflowRuntimeId;
    const authToken = NR_MASTER_TOKEN; // _.get(ctx, 'requestContext.authToken', '');
    _validateId(id);
    try {
      // Currently we preserve the workflow data between start/stop cycle:
      // mark as inactive - if the same input id is reused the previous workflows will be restored
      const params = [
        id,
        {
          inactive: true
        },
        ctx._authInfo.userId
      ];
      const sql = `UPDATE workflow.workflow_runtime SET
        (metadata,
        updated_by,
        updated_at) = ($2, $3, clock_timestamp()) WHERE workflow_runtime_id=$1 RETURNING host_uri,token_id,organization_id`;

      const res = await serviceContext.dbConnections['core'].write.any(
        sql,
        params
      );

      await _makeRequest('POST', 'stop', authToken, {}, id);

      return {
        success: true,
        uri: _.get(res, '[0].host_uri', `https://${id}-${workflowBaseUri}`)
      };
    } catch (e) {
      return {
        success: false,
        message: _.get(e, 'message', 'Unknown Error')
      };
    }
  }

  async function getWorkflow(ctx, args) {
    const id = args.workflowRuntimeId;
    _validateId(id);
    try {
      const whereAnd = [];
      const values = [];
      if (args.isActive) {
        whereAnd.push(`metadata->>'inactive' IS NULL`);
      }
      if (args.isInactive) {
        whereAnd.push(`metadata->>'inactive' IS NOT NULL`);
      }
      whereAnd.push(`workflow_runtime_id = $${values.push(id)}`);
      const query = `
        SELECT
          host_uri, auth_token, created_at, updated_at
        FROM
          workflow.workflow_runtime
        WHERE
          ${whereAnd.join(' AND ')};`;

      const res = await serviceContext.dbConnections['core'].read.map(
        query,
        values,
        mapper.camelizeRootKeys
      );

      return {
        success: true,
        authToken: res[0].authToken,
        uri: res[0].hostUri,
        createdDateTime: res[0].createdAt,
        modifiedDateTime: res[0].updatedAt
      };
    } catch (e) {
      throw new errors.NotFound({
        message: `workflow ${id} not found`
      });
    }
  }

  // apis used by the node-red storage plugin to save opaque workflow data
  async function setWorkflowRuntimeStorageData(context, args) {
    const input = args.input;
    const createdBy =
      _.get(context, 'requestContext.userInfo.userId') ||
      _.get(context, 'requestContext.tokenInfo.applicationId', 'system');
    await canAccessWorkflowRuntime(context, args);

    if (_.isEmpty(args.workflowRuntimeId)) {
      throw new errors.InvalidInput({
        message: 'workflowRuntimeId cannot be an empty string'
      });
    }
    if (_.isEmpty(input.storageKey)) {
      throw new errors.InvalidInput({
        message: 'dataKey cannot be an empty string'
      });
    }
    const params = [
      args.workflowRuntimeId,
      input.storageKey,
      input.storageData,
      input.storageMetadata,
      createdBy
    ];
    const sql = `INSERT INTO workflow.workflow_runtime_storage
          (workflow_runtime_id,
          storage_key,
          storage_data,
          storage_metadata,
          created_by,
          updated_by,
          created_at,
          updated_at)
      VALUES ($1, $2, $3, $4, $5, $5, clock_timestamp(), clock_timestamp())
      ON CONFLICT ON CONSTRAINT workflow_runtime_storage_pk DO UPDATE SET
			(storage_data,
			storage_metadata,
			updated_by,
			updated_at) = ($3, $4, $5, clock_timestamp()) RETURNING *;`;

    const res = await serviceContext.dbConnections['core'].write.any(
      sql,
      params
    );
    return mapper.camelizeRootKeys(res[0]);
  }

  async function canAccessWorkflowRuntime(context, args) {
    const authInfo = _.get(context, '_authInfo');
    if (resUtil.isSuperAdmin(authInfo)) {
      return;
    }
    try {
      resUtil.checkRights(authInfo, ['workflow.create']);
      return;
    } catch (e) {
      logger.warn('checking rights in workflowRuntime failed', e);
    }
    const { organizationId, workflowRuntimeId } = args;
    const rows = await serviceContext.dbConnections['core'].read.map(
      `SELECT organization_id 
      FROM workflow.workflow_runtime
      WHERE workflow_runtime_id = $1`,
      [workflowRuntimeId],
      mapper.camelizeRootKeys
    );
    if (rows.length < 1) {
      throw new errors.NotFound({
        message: `workflow ${workflowRuntimeId} not found`
      });
    }
    if (rows[0].organizationId != organizationId) {
      throw new errors.NotAllowed({
        message: `access to workflow ${workflowRuntimeId} not allowed`
      });
    }
  }

  async function getWorkflowRuntimeStorageData(context, args) {
    const where = [];
    const values = [];
    await canAccessWorkflowRuntime(context, args);
    mainUtil.addSqlWhere(
      'workflow_runtime_id',
      _.toString(args.workflowRuntimeId),
      where,
      values
    );
    if (args.storageKey) {
      mainUtil.addSqlWhere('storage_key', args.storageKey, where, values);
    } else if (args.storageKeyPrefix) {
      mainUtil.addSqlWhere(
        'storage_key',
        args.storageKeyPrefix + '%',
        where,
        values,
        'LIKE'
      );
    }

    const sql = `
      SELECT
        storage_key,
        storage_data,
        storage_metadata
      FROM
        workflow.workflow_runtime_storage
      WHERE
        ${where.join(' AND ')}
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || 30}
    `;

    const res = await serviceContext.dbConnections['core'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
    return mainUtil.toPage(args, res);
  }

  function _validateId(id) {
    if (_.isEmpty(id) || !id.match(/^[0-9a-z]+$/)) {
      throw new errors.InvalidInput({
        message: 'id format is invalid'
      });
    }
  }

  async function _makeRequest(method, path, auth, envVars, id) {
    const payload = {
      id: id,
      env: envVars
    };
    return request(`https://${managementApiUri}/${path}`, {
      method: method,
      json: payload,
      headers: {
        Authorization: auth,
        'Content-type': 'application/json'
      }
    });
  }

  function _getEndpointUri(apiResponse, id) {
    // Try to get instance Uri from the response
    let instanceSettings;
    try {
      instanceSettings = _.get(
        JSON.parse(apiResponse.message || '{}'),
        'Tasks[0].Overrides.ContainerOverrides[0].Environment',
        []
      );
    } catch (e) {
      logger.debug('workflow api: unknown api response', e);
      instanceSettings = [];
    }
    const hostEntry = _.find(
      instanceSettings,
      (val) => _.isObject(val) && val.Name === 'NODE_INSTANCE_URL'
    );
    if (hostEntry && hostEntry.value) {
      return hostEntry.value;
    }
    // default to the pattern
    return `https://${id}-${workflowBaseUri}`;
  }

  async function _getOrgToken(ctx, orgId) {
    let uri = ctx.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += `organizations/${orgId}/tokens/all`;
    return dalUtil.httpCall(uri, ctx, null, mapper.camelizeRootKeys, 'GET');
  }

  async function _addWorkflowPermissions(ctx, token) {
    _.get(token, 'json.rights', []).push('workflow:create');
    let uri = ctx.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'tokens/' + token.tokenId;
    return dalUtil.httpCall(uri, ctx, token, mapper.camelizeRootKeys, 'PUT');
  }

  async function workflowMetric(ctx, args) {
    const { organizationId } = args;

    if (!organizationId) {
      throw new errors.InvalidInput({
        message: 'missing organization id in request context'
      });
    }
    const sqlSeat = `
	SELECT COUNT(su.user_id) AS count FROM sso_user su
	inner join sso_user__sso_group sg on sg.user_id=su.user_id
	inner join sso_group ssg on ssg.group_id=sg.group_id and ssg.kvp->>'groupType' = 'organization' AND ssg.kvp->>'organizationId' = $1
	inner join sso_user_role sr on sr.user_id=su.user_id and sr.role_id = $2 and sr.application_id=ssg.application_id
	where su.status='active'`;
    const sqlTask = `
      SELECT COUNT(task_id) AS count
      FROM job_new.task 
      WHERE created_date_time >= $2 AND created_date_time <= $3 AND engine_id IN (
        SELECT engine_id FROM job_new.build
        WHERE manifest->>'runtime' = 'nodeRed' AND build_state = 'deployed'
      ) AND job_id IN (
        SELECT job_id FROM job_new.job
        WHERE organization_id = $1 AND created_date_time >= $2 AND created_date_time <= $3
      )
    `;
    const minCtime = moment().startOf('month').unix();
    const maxCtime = moment().endOf('month').unix();
    const [seatRows, taskRows] = await Promise.all([
      dbConnections['sso'].read.query(sqlSeat, [
        `${organizationId}`,
        FLOW_ROLE_ID
      ]),
      dbConnections['core'].read.query(sqlTask, [
        organizationId,
        minCtime,
        maxCtime
      ])
    ]);
    const { count: flowSeatCount } = seatRows[0];
    const { count: flowTaskCount } = taskRows[0];
    return { flowSeatCount, flowTaskCount };
  }

  async function dailyTaskMetrics(ctx, args) {
    const { organizationId } = args;

    if (!organizationId) {
      throw new errors.InvalidInput({
        message: 'missing organization id in request context'
      });
    }
    if (args.applicationId !== AUTOMATE_APP_ID) {
      return { records: [] };
    }
    const getOrgMetricSQL = `SELECT kvp->'automate_consumption' as consumption FROM organization WHERE organization_id = $1`;
    const rows = await dbConnections[
      'media_platform'
    ].read.query(getOrgMetricSQL, [`${organizationId}`]);
    if (rows.length < 1) {
      return null;
    }
    const { consumption } = rows[0];
    const records = (consumption || []).map((r) => {
      const { taskCount, storageBytes, mediaSecs, date } = r;
      return { taskCount, storageBytes, mediaSecs, date };
    });
    return { records };
  }

  return {
    startWorkflow,
    stopWorkflow,
    getWorkflow,
    canAccessWorkflowRuntime,
    setWorkflowRuntimeStorageData,
    getWorkflowRuntimeStorageData,
    workflowMetric,
    dailyTaskMetrics
  };
};
