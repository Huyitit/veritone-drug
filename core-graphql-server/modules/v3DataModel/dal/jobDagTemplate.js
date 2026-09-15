const _ = require('lodash');
const mapper = require('../../../dal/mapper.js');

module.exports = function createFunction(serviceContext) {
  const util = require('../../../util.js')();
  const config = serviceContext.config;
  const errors = require('../../../error')(serviceContext.config);
  async function getDagTemplateIdsByJobIds(context, args) {
    if (!Array.isArray(args.ids) || args.ids.length === 0) {
      throw new errors.InvalidInput({
        message: 'jobIds is required and must be a non-empty array'
      });
    }
    const defaultLimit = _.get(config, 'paging.defaultLimit', 30);
    const sql = `
        SELECT DISTINCT
            job_id,
            dag_template_id
        FROM job_new.job_dag_template
        WHERE job_id = ANY($1::text[])
        OFFSET ${args.offset || 0}
        LIMIT ${args.limit || defaultLimit}
  `;
    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      [args.ids],
      mapper.camelizeRootKeys
    );

    return util.toPage(args, rows);
  }

  return {
    getDagTemplateIdsByJobIds
  };
};
