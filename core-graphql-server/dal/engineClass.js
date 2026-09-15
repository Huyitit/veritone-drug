module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')(serviceContext);
  const mapper = require('./mapper.js');
  const jobTable = 'job_new';

  async function getEngineClass(context, options, ignoreNotFound) {
    if (!options.id) {
      throw new Error('id param is required'); // server bug
    }
    const classes = await getEngineClasses(context, options);

    if (!classes.count) {
      if (!ignoreNotFound) {
        throw new errors.NotFound({
          data: {
            objectId: options.id,
            objectType: 'EngineClass'
          }
        });
      } else {
        return null; // yuck
      }
    }
    return classes.records[0];
  }

  async function getEngineClasses(context, options) {
    if (!options) options = {};

    const { id, name } = options;

    let sql = `
			SELECT
				ecls.engine_class_id AS id,
        ecls.engine_class_name AS name,
        ecls.engine_class_description AS description,
        ecls.icon_class
			FROM
        ${jobTable}.engine_class ecls
      `;

    const where = [];
    const args = [];

    if (id) {
      args.push(id);
      where.push(`ecls.engine_class_id = $${args.length}`);
    }
    if (name) {
      args.push('%' + mainUtil.sqlEscapeForLIKE(name) + '%');
      where.push(`ecls.engine_class_name ILIKE $${args.length}`);
    }

    if (where.length) {
      sql += '\nWHERE ' + where.join(' AND ') + '\n';
    }

    sql += ' ORDER BY ecls.engine_class_name ';

    if (Number.isInteger(options.limit)) {
      sql += ` LIMIT ${options.limit || 30}`;
    }
    if (Number.isInteger(options.offset)) {
      sql += ` OFFSET ${options.offset || 0} `;
    }

    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.camelizeRootKeys
    );
    return mainUtil.toPage(options, rows);
  }

  return {
    getEngineClass,
    getEngineClasses
  };
};
