const _ = require('lodash');
const mapper = require('./mapper.js');
const rp = require('request-promise');
const moment = require('moment');

module.exports = function createFunction(
  serviceContext // contains all DAL modules
) {
  const errors = require('../error')(serviceContext.config);
  const mainUtil = require('../util.js')(serviceContext);

  async function getAuditLog(context, args) {
    const where = [];
    const values = [];

    let toDateTime = args.toDateTime ? moment(args.toDateTime) : moment();
    let fromDateTime = args.fromDateTime
      ? moment(args.fromDateTime)
      : moment(toDateTime.valueOf()).subtract(1, 'week');

    if (toDateTime.isBefore(fromDateTime)) {
      throw new errors.InvalidInput({
        message: 'toDateTime cannot be before fromDateTime.',
        data: {
          toDateTime,
          fromDateTime
        }
      });
    }

    const diff = toDateTime.diff(fromDateTime, 'days');

    if (
      diff >
      _.get(serviceContext.config, 'auditLog.maximumTimeWindowLengthDays', 30)
    ) {
      throw new errors.InvalidInput({
        message: 'Audit log time window must be less than one month.',
        data: {
          toDateTime,
          fromDateTime,
          differenceInDays: diff
        }
      });
    }
    mainUtil.addSqlWhere(
      'created_date',
      toDateTime.toISOString(),
      where,
      values,
      '<='
    );
    mainUtil.addSqlWhere(
      'created_date',
      fromDateTime.toISOString(),
      where,
      values,
      '>='
    );
    mainUtil.addSqlWhere('event_type', args.eventType, where, values);
    mainUtil.addSqlWhere('object_type', args.objectType, where, values);
    mainUtil.addSqlWhere('object_id', args.objectId, where, values);
    mainUtil.addSqlWhere('ip_address', args.clientIpAddress, where, values);
    mainUtil.addSqlWhere('user_agent', args.clientUserAgent, where, values);
    mainUtil.addSqlWhere('user_name', args.userName, where, values);
    mainUtil.addSqlWhere('organization_id', args.organizationId, where, values);
    mainUtil.addSqlWhere('success', args.success, where, values);
    mainUtil.addSqlWhere('event_id', args.id, where, values);

    const fieldMap = {
      createdDateTime: 'created_date',
      clientIpAddress: 'ip_address',
      clientUserAgent: 'user_agent',
      id: 'event_id'
    };

    const orderBy =
      _.get(args, 'orderBy.length', 0) > 0
        ? args.orderBy
        : [{ field: 'createdDateTime', direction: 'desc' }];
    const orderClause = [];
    orderBy.forEach((orderBit) => {
      const key = fieldMap[orderBit.field] || orderBit.field;
      orderClause.push(`${key} ${orderBit.direction}`);
    });
    const sql = `
SELECT
  event_id as id,
  event_type,
  object_id,
  object_type,
  user_name,
  organization_id,
  success,
  description,
  created_date AS created_date_time,
  ip_address AS client_ip_address,
  user_agent AS client_user_agent
FROM
  audit.audit_log
WHERE
  ${where.join(' AND ')}
ORDER BY
  ${orderClause.join(', ')}
OFFSET ${args.offset || 0}
LIMIT ${args.limit || 30}
    `;
    const res = await serviceContext.dbConnections['media_platform'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return {
      records: res,
      count: res.length,
      offset: args.offset,
      limit: args.limit,
      toDateTime,
      fromDateTime
    };
  }

  return {
    getAuditLog
  };
};
