const _ = require('lodash');
const mapper = require('./mapper.js');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')();
  const returningProcessTemplate = {
    process_template_id: null,
    organization_id: null,
    process_template_name: null,
    task_list: null
  };

  async function getProcessTemplate(options, context) {
    const data = await getProcessTemplates(options, context);
    if (!data.count) {
      throw new errors.NotFound({
        message: 'Process template not found',
        data: {
          objectId: options.id,
          objectType: 'ProcessTemplate'
        }
      });
    }
    return data.records[0];
  }

  async function getProcessTemplates(options, context) {
    const orgId = options.organizationId;
    const sqlWhere = [];
    const args = [];
    const defaultLimit = _.get(config, 'paging.defaultLimit', 30);

    mainUtil.addSqlWhere('pt.organization_id', orgId, sqlWhere, args);
    mainUtil.addSqlWhere('pt.process_template_id', options.id, sqlWhere, args);

    const sql = `
      SELECT 	pt.process_template_id,
              pt.organization_id,
              pt.process_template_name,
              pt.task_list
      FROM 	process_template pt
      WHERE
        ${sqlWhere.join(' AND ')}
      OFFSET ${options.offset || 0}
      LIMIT ${options.limit || defaultLimit}
    `;

    const res = await serviceContext.dbConnections['cms'].read.map(
      sql,
      args,
      mapper.mapProcessTemplate
    );
    return mainUtil.toPage(options, res);
  }

  async function createProcessTemplate(args, context) {
    const input = args.input;
    const orgId = args.organizationId;
    const columnData = {
      organization_id: orgId,
      process_template_name: input.name,
      task_list: input.taskList
    };
    const { sql, values } = mainUtil.makeInsertSql(
      'process_template',
      columnData,
      returningProcessTemplate
    );
    const newProcessTemplate = await serviceContext.dbConnections[
      'cms'
    ].write.query(sql, values);

    return mapper.mapProcessTemplate(newProcessTemplate[0]);
  }

  async function updateProcessTemplate(args) {
    const input = args.input;
    const columnData = {
      task_list: input.taskList
    };
    const { sql, values } = mainUtil.makeUpdateSql(
      'process_template',
      columnData,
      returningProcessTemplate,
      `process_template_id = ${input.id}`
    );
    const updatedProcessTemplate = await serviceContext.dbConnections[
      'cms'
    ].write.query(sql, values);

    return mapper.mapProcessTemplate(updatedProcessTemplate[0]);
  }

  async function deleteProcessTemplate(options, context) {
    if (!options.id) {
      throw new errors.InvalidInput({
        message: 'Process Template ID is required'
      });
    }

    const orgId = options.organizationId;
    const sql = `
      DELETE FROM
        process_template
      WHERE process_template_id = $1
        AND organization_id = $2
      RETURNING
        process_template_id
    `;

    const args = [options.id, orgId];

    const deletedProcessTemplate = await serviceContext.dbConnections[
      'cms'
    ].write.query(sql, args);

    return mapper.mapProcessTemplate(deletedProcessTemplate[0]);
  }

  return {
    getProcessTemplates,
    createProcessTemplate,
    updateProcessTemplate,
    getProcessTemplate,
    deleteProcessTemplate
  };
};
