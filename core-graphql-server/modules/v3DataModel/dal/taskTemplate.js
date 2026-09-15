const _ = require('lodash');
const mapper = require('../../../dal/mapper.js');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const logger = serviceContext.logger;
  const dbConnections = serviceContext.dbConnections;
  const util = require('../../../util.js')(serviceContext);
  const errors = require('../../../error')(config);

  const dbRead = dbConnections['core'].read;
  const dbWrite = dbConnections['core'].write;
  const dateIdUtil = require('@veritone/core-server-base/date-id.js')();

  async function getTaskTemplate(context, args) {
    util.checkDateId(args.id, false);
    const res = await getTaskTemplates(context, args);

    if (!res.count) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'TaskTemplate'
        }
      });
    }
    return res.records[0];
  }

  async function getTaskTemplates(context, args) {
    const values = [];
    const whereConditions = [];
    let taskTable = 'job_new.task_template';

    util.addSqlWhere('t.task_template_id', args.id, whereConditions, values);

    util.addSqlWhere(
      't.application_id',
      args.applicationId,
      whereConditions,
      values
    );
    util.addSqlWhere(
      't.job_template_id',
      args.jobTemplateId,
      whereConditions,
      values
    );
    util.addSqlWhere('t.engine_id', args.engineId, whereConditions, values);
    let joinClause = '';
    if (args.engineType) {
      joinClause = `
        LEFT OUTER JOIN job_new.engine e ON t.engine_id = e.engine_id
        LEFT OUTER JOIN job_new.engine_category ec ON e.engine_category_id = ec.engine_category_id
        LEFT OUTER JOIN job_new.engine_type et ON ec.engine_type_id = et.engine_type_id
      `;
      util.addSqlWhere(
        'et.engine_type_name',
        args.engineType,
        whereConditions,
        values
      );
    }
    const whereClause = whereConditions.join(' AND ');
    const sql = `
SELECT
  t.task_template_id AS id,
  t.job_template_id AS job_template_id,
  t.application_id,
  t.created_date_time,
  t.modified_date_time,
  t.task_payload AS payload,
  t.engine_id,
  t.notification_uris
FROM
  ${taskTable} t
  ${joinClause}
WHERE
  ${whereClause}
OFFSET ${args.offset || 0}
LIMIT ${args.limit || 30}
    `;
    const rows = await dbRead.map(sql, values, mapper.mapTask);
    return util.toPage(args, rows);
  }

  async function createTaskTemplate(context, args) {
    const { sql, values } = createTaskTemplateSql(context, args, 0);
    const res = await dbWrite.map(sql, values, mapper.mapTask);
    return res[0];
  }

  const taskSelectData = {
    task_template_id: 'id',
    engine_id: null,
    task_payload: 'payload',
    created_date_time: null,
    modified_date_time: null,
    application_id: null,
    job_template_id: 'job_template_id',
    notification_uris: null
  };

  function createTaskTemplateSql(context, args, valIndex = 0) {
    const input = args.input;
    const columnData = {};
    let payload = input.payload;
    if (input.payload && input.payloadString) {
      throw new errors.InvalidInput({
        message:
          'Supply either the payload or payloadString parameters, but not both.'
      });
    }
    if (!input.jobTemplateId) {
      throw new errors.InvalidInput({
        message: 'Task template requires job template id.'
      });
    }
    if (!payload && input.payloadString) {
      try {
        payload = JSON.parse(input.payloadString);
      } catch (err) {
        throw new errors.InvalidInput({
          message:
            'The payloadString parameter did not contain valid JSON.' +
            ' Supply properly formatted and escaped JSON in this string value.',
          data: {
            argument: 'payloadString',
            value: input.payloadString
          }
        });
      }
    }

    util.checkForForbiddenContent('job.task.payload', payload);

    const taskId = input.id || dateIdUtil.generateTaskId(input.jobTemplateId);

    columnData.task_payload = payload;
    columnData.task_template_id = taskId;
    columnData.job_template_id = input.jobTemplateId;
    columnData.application_id = input.applicationId;
    columnData.engine_id = input.engineId;
    columnData.created_date_time = input.createdDateTime;
    columnData.notification_uris = _.isEmpty(input.notificationUris)
      ? {}
      : input.notificationUris;

    let taskTable = 'job_new.task_template';

    const { sql, values } = util.makeInsertSql(
      taskTable,
      columnData,
      taskSelectData,
      valIndex
    );

    return { sql, values };
  }

  async function updateTaskTemplate(context, args) {
    const input = args.input;
    util.checkDateId(input.id, false);

    // first verify that the task template exists and is accessible
    const _oldTemplate = getTaskTemplate(context, {
      id: input.id,
      applicationId: input.applicationId
    });
    let payload = input.payload;
    if (input.payload && input.payloadString) {
      throw new errors.InvalidInput({
        message:
          'Supply either the payload or payloadString parameters, but not both.'
      });
    }
    if (!payload && input.payloadString) {
      try {
        payload = JSON.parse(input.payloadString);
      } catch (err) {
        throw new errors.InvalidInput({
          message:
            'The payloadString parameter did not contain valid JSON.' +
            ' Supply properly formatted and escaped JSON in this string value.',
          data: {
            argument: 'payloadString',
            value: input.payloadString
          }
        });
      }
    }

    util.checkForForbiddenContent('job.task.payload', payload);

    const columnData = {
      task_payload: payload,
      notification_uris: _.isEmpty(input.notificationUris)
        ? {}
        : input.notificationUris
    };

    const where = 'task_template_id = $1';

    let taskTable = 'job_new.task_template';

    let { sql, values } = util.makeUpdateSql(
      taskTable,
      columnData,
      taskSelectData,
      where,
      1
    );
    values.unshift(args.input.id);
    const _res = await dbWrite.map(sql, values, mapper.mapTask);

    return getTaskTemplate(context, {
      id: input.id,
      applicationId: input.applicationId
    });
  }

  // TODO: why is this disabled?
  async function deleteTaskTemplate(context, args) {
    throw new errors.NotImplemented({
      message:
        'The deleteTaskTemplate mutation is not available on this server. '
    });
    /*
    util.checkDateId(args.id, false);
    const sql = `
DELETE FROM job_new.task
WHERE
  task_id = $1 AND
  is_template = true AND
  application_id = $2
RETURNING task_id
;
    `;
    const res = await dbWrite.query(sql, [args.id, args.applicationId]);
    if (!res.length) {
      throw new errors.NotFound({
        data: {
          objectId: id,
          objectType: 'TaskTemplate'
        }
      });
    }
    return {
      id: args.id,
      message: 'TaskTemplate deleted'
    };*/
  }

  return {
    getTaskTemplate,
    getTaskTemplates,
    createTaskTemplate,
    createTaskTemplateSql,
    deleteTaskTemplate,
    updateTaskTemplate
  };
};
