const moment = require('moment');
const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const mainUtil = require('../util.js')(serviceContext);
  const config = serviceContext.config;
  const errors = require('../error')(config);
  const mapper = require('./mapper.js');
  const util = require('./util.js')(config, serviceContext);

  const selectData = {
    id: null,
    host_app_id: null,
    name: null,
    description: null,
    data: null,
    created_date_time: null,
    modified_date_time: null
  };

  return {
    getCustomDashboard,
    getCustomDashboards,
    createCustomDashboard,
    updateCustomDashboard,
    deleteCustomDashboard
  };

  ///

  async function getCustomDashboard(context, args) {
    mainUtil.checkId(args.id, false, false, true);
    const res = await getCustomDashboards(context, args);

    if (!res.count) {
      throw new errors.NotFound({
        message: 'The requested custom dashboard was not found.',
        data: {
          objectId: args.id,
          objectType: 'CustomDashboard'
        }
      });
    }

    return res.records[0];
  }

  async function getCustomDashboards(context, args) {
    const clientInfo = resUtil.getClientInfo(context);
    const userId = clientInfo.id;
    const where = [];
    const values = [];

    // if request is coming from engine, it must be querying 1 record
    if (clientInfo.type === 'engineJWT') {
      mainUtil.checkId(args.id, false, false, true);
    } else {
      mainUtil.addSqlWhere('user_id', userId, where, values);
    }

    mainUtil.addSqlWhere('id', args.id, where, values);

    if (_.isNil(args.organizationId) || _.isNil(args.applicationId)) {
      throw new errors.NotAllowed({
        message: 'The token must be scoped to an organization.'
      });
    }
    mainUtil.addSqlWhere(
      'owner_organization_id',
      _.toString(args.organizationId),
      where,
      values
    );
    mainUtil.addSqlWhere(
      'owner_application_id',
      _.toString(args.applicationId),
      where,
      values
    );

    if (args.hostAppId) {
      mainUtil.addSqlWhere('host_app_id', args.hostAppId, where, values);
    }

    const sql = `
      SELECT
        id, host_app_id, name, description, data, created_date_time, modified_date_time
      FROM
        custom_dashboard
      WHERE
        ${where.join(' AND ')}
      ORDER BY created_date_time DESC
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || 30}
    `;

    const res = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return mainUtil.toPage(args, res);
  }

  async function createCustomDashboard(context, args) {
    const clientInfo = resUtil.getClientInfo(context);
    const userId = clientInfo.id;
    const input = args.input;

    mainUtil.checkId(input.hostAppId, false, false, true);

    const columnData = {
      user_id: userId,
      owner_organization_id: args.organizationId,
      owner_application_id: args.applicationId,
      host_app_id: input.hostAppId,
      name: util.sanitizeField(input.name),
      description: util.sanitizeField(input.description),
      data: input.data,
      created_by: userId,
      modified_by: userId
    };
    const { sql, values } = mainUtil.makeInsertSql(
      'custom_dashboard',
      columnData,
      selectData
    );

    const res = await serviceContext.dbConnections['media_platform'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return res[0];
  }

  async function updateCustomDashboard(context, args) {
    // validate access - retrieve the custom dashboard
    await getCustomDashboard(context, {
      id: args.input.id,
      organizationId: args.organizationId,
      applicationId: args.applicationId
    });

    const clientInfo = resUtil.getClientInfo(context);
    const userId = clientInfo.id;
    const columnData = _.pick(args.input, [
      'hostAppId',
      'name',
      'description',
      'data'
    ]);

    if (columnData.hostAppId) {
      mainUtil.checkId(columnData.hostAppId, false, false, true);
    }
    if (columnData.name) {
      columnData.name = util.sanitizeField(columnData.name);
    }
    if (columnData.description) {
      columnData.description = util.sanitizeField(columnData.description);
    }

    const { sql, values } = mainUtil.makeUpdateSql(
      'custom_dashboard',
      {
        ...columnData,
        modified_by: userId,
        modified_date_time: moment().toISOString()
      },
      selectData,
      'id = $1',
      1
    );
    values.unshift(args.input.id);

    const res = await serviceContext.dbConnections['media_platform'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return res[0];
  }

  async function deleteCustomDashboard(context, args) {
    mainUtil.checkId(args.id, false, false, true);
    const clientInfo = resUtil.getClientInfo(context);
    const userId = clientInfo.id;
    const query = `
      DELETE FROM
        custom_dashboard
      WHERE
        id = $1 AND user_id = $2
      RETURNING
        id
    `;
    const res = await serviceContext.dbConnections['media_platform'].write.map(
      query,
      [args.id, userId],
      mapper.camelizeRootKeys
    );

    if (!res.length) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'CustomDashboard'
        }
      });
    }

    return {
      id: args.id,
      message: 'Custom dashboard deleted'
    };
  }
};
