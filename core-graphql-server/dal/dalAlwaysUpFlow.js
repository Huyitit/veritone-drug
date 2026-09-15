const _ = require('lodash');
const table = 'flow_executions';
const mapper = require('./mapper.js');
const crypto = require('crypto');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const cronParser = require('cron-parser');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../util.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);
  const core = serviceContext.dbConnections['core'];
  const resUtil = require('../resolvers/util.js')(serviceContext);

  async function alwaysUpFlows(context, args) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    if (args.getAll && !isSuperAdmin) {
      throw new errors.NotAllowed({
        message: `Not enough permission`,
        data: {
          field: 'getAll'
        }
      });
    }
    return await getAlwaysUpFlows(args, args.organizationId);
  }

  async function alwaysUpFlow(context, args) {
    const engineId = args.engineId;
    const alwaysUpFlowId = args.alwaysUpFlowId;

    return await getAlwaysUpFlow(
      args.organizationId,
      engineId,
      alwaysUpFlowId,
      false
    );
  }

  function mapAlwaysUpFlow(rows) {
    var res = [];

    if (!Array.isArray(rows)) {
      // rows.schedulePart = mapSchedule(rows.schedule);
      return mapper.camelizeRootKeys(rows);
    }
    rows.forEach(function (row) {
      // row.schedulePart = mapSchedule(row.schedule);
      res.push(mapper.camelizeRootKeys(row));
    });

    return res;
  }

  const isCronValid = (freq, fieldName) => {
    const freqArr = freq.split(' ');
    if (freqArr.length != 5) {
      return false;
    }

    //Checks minute then hour field in chron format to ensure all comma seperated values contain a dash indicating a range. example: 5-6 or 5-6,8-10
    if (fieldName === 'schedule') {
      if (freqArr[0] !== '*') {
        freqArr[0].split(',').forEach((item) => {
          if (!item.includes('-')) {
            throw new errors.InvalidInput({
              message: `The input is invalid: Minutes value ${fieldName} is invalid. Must be a range or a list of ranges: 5-6 or 5-6,7-8`,
              data: {
                field: fieldName
              }
            });
          }
        });
      }

      if (freqArr[1] !== '*') {
        freqArr[1].split(',').forEach((item) => {
          if (!item.includes('-')) {
            throw new errors.InvalidInput({
              message: `The input is invalid: Hours value ${fieldName} is invalid. Must be a range or a list of ranges: 0-10 or 0-10,45-55`,
              data: {
                field: fieldName
              }
            });
          }
        });
      }
    }

    if (fieldName === 'updateSchedule') {
      if (freqArr[0] === '*' || isNaN(freqArr[0])) {
        throw new errors.InvalidInput({
          message: `The input is invalid: Minute value of updateSchedule ${fieldName} not provided. Must give an minute so the flow will restart accurately`,
          data: {
            field: fieldName
          }
        });
      }

      if (freqArr[1] === '*' || isNaN(freqArr[1])) {
        throw new errors.InvalidInput({
          message: `The input is invalid: Hours value of updateSchedule ${fieldName} not provided. Must give an hour so the flow will restart at least once every 24 hours`,
          data: {
            field: fieldName
          }
        });
      }

      if (freqArr[2] !== '*' || freqArr[3] !== '*' || freqArr[4] !== '*') {
        throw new errors.InvalidInput({
          message: `The input is invalid: The only accepted input format is 'int int * * *' ex: '0 4 * * *'(midnight eastern, 4am UTC)`,
          data: {
            field: fieldName
          }
        });
      }
    }

    //This regex includes check for seconds which do not use so appended to string just for check
    try {
      cronParser.parseExpression(freq);
    } catch (e) {
      return false;
    }
    return true;
  };

  const getSchedule = (input, fieldName) => {
    if (!fieldName) {
      fieldName = 'schedule';
    }

    if (input[fieldName]) {
      if (!isCronValid(input[fieldName], fieldName)) {
        throw new errors.InvalidInput({
          message:
            'The input is invalid ' + `${input[fieldName]} value is invalid`,
          data: {
            field: fieldName
          }
        });
      }

      return input[fieldName];
    }

    if (fieldName == 'updateSchedule') {
      //defaults to restarting at midnight Eastern time
      return '0 4 * * *';
    }
    return '* * * * *';
  };

  async function alwaysUpFlowCreate(context, args) {
    const input = args.input;

    const org = await serviceContext.dal.organization.getOrganization(
      context,
      { id: input.organizationId },
      null
    );
    const orgGUID = org.organizationGuid;
    //check to make sure engine hasn't been deleted
    try {
      const engine = await serviceContext.dal.engine.getEngine(context, {
        id: input.engineId
      });
    } catch (e) {
      throw new errors.ResourceUnavailable({
        message: 'The input is invalid the engine does not exist.',
        data: {
          field: 'engineId'
        }
      });
    }

    // check for dup before creating
    const aFlow = await getAlwaysUpFlow(input.organizationId, input.engineId);
    if (aFlow && aFlow.status !== 'deleted') {
      throw new errors.InvalidInput({
        message:
          'The input is invalid ' +
          `the always up flow record for this flow already exists.`,
        data: {
          field: 'schedulePart'
        }
      });
    }

    const userName = _.get(context, '_authInfo.userName');

    const schedule = getSchedule(input);
    const updateSchedule = getSchedule(input, 'updateSchedule');

    if (
      schedule == '* * * * *' &&
      (updateSchedule == '' || updateSchedule == '* * * * *')
    ) {
      throw new errors.InvalidInput({
        message:
          'The input is invalid ' +
          `the always up flow forever requires an updateSchedule value.`,
        data: {
          field: 'updateSchedule'
        }
      });
    }

    // add extra column for user id and for user name
    const fields = {
      always_up_flow_id: input.alwaysUpFlowId ? input.alwaysUpFlowId : uuidv4(),
      organization_id: input.organizationId,
      organization_guid: orgGUID,
      engine_id: input.engineId,
      build_id: input.buildId,
      schedule: schedule,
      update_schedule: updateSchedule,
      status: input.status ? input.status : 'active',
      restart: input.restart,
      date_modified: moment.utc(),
      date_created: moment.utc(),
      created_by: userName,
      modified_by: userName
    };

    // make and run script for creating flow
    const { sql, values } = mainUtil.makeInsertSql(
      'job_new.always_up_flow',
      fields,
      alwaysUpFlowFields
    );

    let executions = await core.write.query(sql, values);

    return mapAlwaysUpFlow(_.get(executions, '0'));
  }

  async function alwaysUpFlowUpdate(context, args) {
    const input = args.input;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    //check to make sure engine hasn't been deleted. Propogation has been added so this should never be the case. getEngine call authorizes by org so superadmin should skip
    if (!isSuperAdmin) {
      try {
        const engine = await serviceContext.dal.engine.getEngine(context, {
          id: input.engineId
        });
      } catch (e) {
        throw new errors.ResourceUnavailable({
          message: 'The input is invalid the engine does not exist.',
          data: {
            field: 'engineId'
          }
        });
      }
    }

    let getAll = isSuperAdmin;

    //Check for existence before updating
    const aFlow = await getAlwaysUpFlow(
      input.organizationId,
      input.engineId,
      '',
      getAll
    );
    if (!aFlow || aFlow.status === 'deleted') {
      throw new errors.InvalidInput({
        message:
          'The input is invalid ' +
          `the always up flow record for this flow does not exist or is deleted.`,
        data: {
          field: 'schedulePart'
        }
      });
    }

    let orgID = aFlow.organizationId;

    if (!isSuperAdmin) {
      const orgID = input.organizationId
        ? input.organizationId
        : aFlow.organizationId;
    }
    const org = await serviceContext.dal.organization.getOrganization(
      context,
      { id: orgID },
      null
    );
    const orgGUID = org.organizationGuid;

    const userName = _.get(context, '_authInfo.userName');

    let schedule = aFlow.schedule;
    if (input.schedule || input.schedulePart) {
      schedule = getSchedule(input);
    }

    let updateSchedule = aFlow.updateSchedule;
    if (input.updateSchedule || input.updateSchedulePart) {
      updateSchedule = getSchedule(input, 'updateSchedule');
    }

    if (
      schedule == '* * * * *' &&
      (updateSchedule == '' || updateSchedule == '* * * * *')
    ) {
      throw new errors.InvalidInput({
        message:
          'The input is invalid ' +
          `the always up flow forever require updateSchedule value.`,
        data: {
          field: 'updateSchedule'
        }
      });
    }

    // add extra column for user id and for user name
    const fields = {
      always_up_flow_id: aFlow.alwaysUpFlowId,
      organization_id: orgID,
      organization_guid: orgGUID,
      engine_id: input.engineId ? input.engineId : aFlow.engineId,
      build_id: input.buildId ? input.buildId : aFlow.buildId,
      schedule: schedule,
      update_schedule: updateSchedule,
      status: input.status ? input.status : aFlow.status,
      restart: 'restart' in input ? input.restart : aFlow.restart,
      date_modified: moment.utc(),
      modified_by: userName
    };

    // make and run script for creating flow
    const { sql, values } = mainUtil.makeUpdateSql(
      'job_new.always_up_flow',
      fields,
      alwaysUpFlowFields,
      `always_up_flow_id = '${aFlow.alwaysUpFlowId}'`
    );

    let executions = await core.write.query(sql, values);

    return mapAlwaysUpFlow(_.get(executions, '0'));
  }

  async function getAlwaysUpFlow(
    organizationId,
    engineId,
    alwaysUpFlowId = '',
    getAll = false
  ) {
    const res = await getAlwaysUpFlows(
      { engineId, alwaysUpFlowId, getAll },
      organizationId
    );

    if (res && res.records && res.records.length > 1) {
      for (const row of res.records) {
        if (row.status === 'inactive' || row.status === 'active') {
          return mapAlwaysUpFlow(row);
        }
      }
    }

    return res && res.records && res.records[0]
      ? mapAlwaysUpFlow(res.records[0])
      : null;
  }

  async function getAlwaysUpFlows(args, organizationId) {
    const limit = args.limit ? args.limit : 30;
    const offset = args.offset ? args.offset : 0;
    const status = args.status ? args.status : '';
    const engineId = args.engineId ? args.engineId : '';
    const alwaysUpFlowId = args.alwaysUpFlowId ? args.alwaysUpFlowId : '';
    let whereClause = '';
    let queryArgs = [];

    if (!args.getAll) {
      queryArgs = [organizationId];
      whereClause = 'auf.organization_id = $1';
    }

    if (status !== '') {
      if (queryArgs.length > 0) {
        whereClause += ` AND `;
      }
      queryArgs.push(status);
      whereClause += ` auf.status = $${queryArgs.length} `;
    }

    if (engineId !== '') {
      if (queryArgs.length > 0) {
        whereClause += ` AND `;
      }
      queryArgs.push(engineId);
      whereClause += ` auf.engine_id = $${queryArgs.length} `;
    }

    if (alwaysUpFlowId !== '') {
      if (queryArgs.length > 0) {
        whereClause += ` AND `;
      }
      queryArgs.push(alwaysUpFlowId);
      whereClause += ` auf.always_up_flow_id = $${queryArgs.length} `;
    }

    const sql = `SELECT
        auf.always_up_flow_id,
        auf.organization_id,
        auf.organization_guid,
        auf.engine_id,
        auf.build_id,
        auf.schedule,
        auf.update_schedule,
        auf.status,
        auf.restart,
        auf.date_modified,
        auf.date_created,
        auf.created_by,
        auf.modified_by
        from job_new.always_up_flow auf
        ${queryArgs.length > 0 ? `WHERE ${whereClause}` : ''}
        ORDER BY auf.date_created
        LIMIT ${limit} OFFSET ${offset};`;

    const res = await core.read.query(sql, queryArgs);
    return mainUtil.toPage(args, mapAlwaysUpFlow(res));
  }

  async function alwaysUpFlowDelete(args, context) {
    const engineId = args.id;
    if (!engineId) {
      return null;
    }
    const alwaysUpFlowId = args.alwaysUpFlowId;
    const userName = _.get(context, '_authInfo.userName');

    const alwaysUpFlow = await getAlwaysUpFlow(
      args.organizationId,
      engineId,
      alwaysUpFlowId,
      false
    );

    if (alwaysUpFlow == null) {
      return null;
    }
    const fields = {
      engine_id: engineId,
      status: 'deleted',
      date_modified: moment.utc(),
      modified_by: userName
    };
    const { sql, values } = mainUtil.makeUpdateSql(
      'job_new.always_up_flow',
      fields,
      alwaysUpFlowFields,
      `engine_id = '${engineId}'`
    );
    let executions = await core.write.query(sql, values);
    return mapAlwaysUpFlow(_.get(executions, '0'));
  }

  const alwaysUpFlowFields = {
    always_up_flow_id: 'always_up_flow_id',
    organization_id: 'organization_id',
    organization_guid: 'organization_guid',
    engine_id: 'engine_id',
    build_id: 'build_id',
    schedule: 'schedule',
    update_schedule: 'update_schedule',
    status: 'status',
    restart: 'restart',
    date_modified: 'date_modified',
    date_created: 'date_created',
    created_by: 'created_by',
    modified_by: 'modified_by'
  };

  return {
    alwaysUpFlows: alwaysUpFlows,
    alwaysUpFlow: alwaysUpFlow,
    alwaysUpFlowCreate: alwaysUpFlowCreate,
    alwaysUpFlowUpdate: alwaysUpFlowUpdate,
    alwaysUpFlowDelete: alwaysUpFlowDelete
  };
};
