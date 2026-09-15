const _ = require('lodash');
const table = 'flow_executions';
const mapper = require('./mapper.js');
const crypto = require('crypto');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

module.exports = function createFunction(serviceContext, dalEngine) {
  const config = serviceContext.config;
  const mainUtil = require('../util.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const core = serviceContext.dbConnections['core'];
  async function getFlowExecutions(context, args) {
    const perm = 'developer.build.read';
    mainUtil.requirePerm(perm, context);
    const organizationId =
      '' + _.get(context, '_authInfo.organization.organizationId');
    const flowExecutionId = args.flowExecutionId || args.id;
    if (flowExecutionId) {
      return await getExecutionDb(args, organizationId, flowExecutionId);
    }

    return await getExecutionsDb(args, organizationId);
  }

  async function getExecutionsDb(args, organizationId) {
    let limit = args.limit ? args.limit : 100;
    let offset = args.offset ? args.offset : 0;
    let clause = ['f.organization_id = $1'];
    let queryArgs = [organizationId, limit, offset];
    let queryMap = {
      flowId: 'f.flow_id'
    };
    for (let index in queryMap) {
      if (args[index]) {
        queryArgs.push(args[index]);
        clause.push(`${queryMap[index]} = $${queryArgs.length}`);
      }
    }
    args.input = args.input || {};

    let sql = `SELECT
      f.flow_execution_id,
      f.flow_execution_status,
      f.flow_execution_result,
      f.flow_execution_log,
      f.flow_execution_id,
      f.flow_id,
      f.organization_id,
      f.flow_execution_input,
      f.created_date_time,
      f.updated_date_time,
      f.user_id,
      f.run_mode
      from job_new.flow_executions f
      WHERE ${clause.join(' AND ')}
      ORDER BY f.created_date_time
      LIMIT $2
      OFFSET $3;`;
    const res = await core.read.query(sql, queryArgs);
    return mainUtil.toPage(args, mapper.mapFlowRevision(res));
  }

  async function getExecutionDb(args, organizationId, executionId) {
    let sql = `SELECT
      f.flow_execution_id,
      f.flow_execution_status,
      f.flow_execution_result,
      f.flow_execution_log,
      f.flow_execution_id,
      f.flow_execution_input,
      f.flow_id,
      f.organization_id,
      f.created_date_time,
      f.updated_date_time,
      f.user_id,
      f.run_mode
      from job_new.flow_executions f
      WHERE f.organization_id = $1 AND f.flow_execution_id = $2;`;
    var queryArgs = [organizationId, executionId];
    const res = await core.read.query(sql, queryArgs);
    return res && res[0] ? mapper.mapFlowRevision(res[0]) : null;
  }

  async function createFlowExecution(context, args) {
    // check for dup before creating
    const perm = 'job.create';
    mainUtil.requirePerm(perm, context);
    const organizationId =
      '' + _.get(context, '_authInfo.organization.organizationId');
    const input = args.input;
    const userId = _.get(context, '_authInfo.userId');

    // add extra column for user id and for user name
    const fields = {
      organization_id: organizationId,
      user_id: userId,
      flow_id: input.flowId,
      flow_execution_id: input.flowExecutionId
        ? input.flowExecutionId
        : uuidv4(),
      flow_execution_status: input.flowExecutionStatus,
      flow_execution_result: input.flowExecutionResult,
      flow_execution_log: input.flowExecutionLog,
      flow_execution_input: input.flowExecutionInput,
      run_mode: input.runMode
    };

    // make and run script for creating flow
    const { sql, values } = mainUtil.makeInsertSql(
      'job_new.flow_executions',
      fields,
      flowExecutionFields
    );

    let executions = await core.write.query(sql, values);

    return mapper.mapFlowRevision(_.get(executions, '0'));
  }

  async function updateFlowExecution(context, args) {
    const perm = 'job.create';
    mainUtil.requirePerm(perm, context);

    const organizationId =
      '' + _.get(context, '_authInfo.organization.organizationId');

    const input = args.input;

    let data = {
      updated_date_time: moment().toISOString()
    };

    if (input.flowExecutionStatus) {
      data.flow_execution_status = input.flowExecutionStatus;
    }
    if (input.flowExecutionResult) {
      data.flow_execution_result = input.flowExecutionResult;
    }
    if (input.flowExecutionLog) {
      data.flow_execution_log = input.flowExecutionLog;
    }
    if (input.flowExecutionInput) {
      data.flow_execution_input = input.flowExecutionInput;
    }

    let fieldValues = [input.flowExecutionId, organizationId];

    let execution = await getExecutionDb(
      args,
      organizationId,
      input.flowExecutionId
    );

    if (!execution) {
      return null;
    }

    var fieldValueOffset = Object.keys(data).length;
    let clause = ` flow_execution_id = $${
      fieldValueOffset + 1
    } AND organization_id = $${fieldValueOffset + 2}`;

    let { sql, values } = mainUtil.makeUpdateSql(
      'job_new.flow_executions',
      data,
      flowExecutionFields,
      clause
    );

    values = values.concat(fieldValues);

    let updatedflowExecution = await core.write.query(sql, values);

    updatedflowExecution = _.get(updatedflowExecution, '0');

    if (updatedflowExecution)
      return mapper.mapFlowRevision(updatedflowExecution);
    else throw new Error('failed to update flow execution');
  }

  const flowExecutionFields = {
    flow_execution_id: 'flow_execution_id',
    flow_execution_result: 'flow_execution_result',
    flow_execution_status: 'flow_execution_status',
    flow_execution_log: 'flow_execution_log',
    flow_id: 'flow_id',
    created_date_time: 'created_date_time',
    updated_date_time: 'updated_date_time',
    organization_id: 'organization_id',
    user_id: 'user_id',
    run_mode: 'run_mode'
  };

  return {
    getFlowExecutions: getFlowExecutions,
    getFlowExecution: getFlowExecutions,
    createFlowExecution: createFlowExecution,
    updateFlowExecution: updateFlowExecution
  };
};
