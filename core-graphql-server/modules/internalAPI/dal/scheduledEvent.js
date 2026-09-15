const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const cronParser = require('cron-parser');
const moment = require('moment');
const { camelizeRootKeys } = require('../../../dal/mapper.js');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const { NotFound, InvalidInput } = require('../../../error')(config);
  const mainUtil = require('../../../util.js')();
  const dbRead = _.get(serviceContext, 'dbConnections.core.read');
  const dbWrite = _.get(serviceContext, 'dbConnections.core.write');

  const tableName = 'event_trigger.event_schedule';

  const columns = {
    event_schedule_id: 'id',
    event_name: 'name',
    event_type: 'type',
    organization_id: null,
    application_id: null,
    schedule: null,
    payload: null,
    created_at_utc: 'created_date_time',
    updated_at_utc: 'modified_date_time',
    created_by: null,
    updated_by: null
  };

  async function getScheduledEvents(context, args) {
    const conditions = [];
    const values = [];

    mainUtil.addSqlWhere('event_schedule_id', args.id, conditions, values);
    mainUtil.addSqlWhere('event_schedule_id', args.ids, conditions, values);
    mainUtil.addSqlWhere('event_name', args.name, conditions, values);
    mainUtil.addSqlWhere('event_type', args.type, conditions, values);

    const sql = `
    SELECT ${mainUtil.makeSelectClause(columns)}
    FROM ${tableName} 
    ${!_.isEmpty(conditions) ? `WHERE ${conditions.join(' AND ')}` : ''}
    LIMIT $${values.push(args.limit || 30)}
    OFFSET $${values.push(args.offset || 0)}`;

    const results = await dbRead.map(sql, values, camelizeRootKeys);
    return mainUtil.toPage(args, results);
  }

  async function getScheduledEvent(context, args) {
    const scheduledEvents = await getScheduledEvents(context, args);
    if (scheduledEvents.count === 0) {
      throw new NotFound({
        data: {
          objectId: args.id,
          objectType: 'ScheduledEvent'
        }
      });
    }
    return scheduledEvents.records[0];
  }

  async function createScheduledEvent(context, args) {
    const { input } = args;

    validatePayload(input.payload);
    const schedule = normalizeSchedule(input.schedule);

    const columnData = {
      event_schedule_id: uuidv4(),
      event_name: input.name,
      event_type: input.type,
      organization_id: input.organizationId,
      application_id: input.applicationId,
      payload: input.payload,
      schedule,
      created_by: _.get(context, 'requestContext.userInfo.userId'),
      updated_by: _.get(context, 'requestContext.userInfo.userId')
    };

    const { sql, values } = mainUtil.makeInsertSql(
      tableName,
      columnData,
      columns
    );

    const res = await dbWrite.map(sql, values, camelizeRootKeys);
    return res[0];
  }

  async function updateScheduledEvent(context, args) {
    const { input } = args;
    await getScheduledEvent(context, { id: input.id });

    validatePayload(input.payload);
    input.schedule = normalizeSchedule(input.schedule);

    const columnData = {
      event_name: input.name,
      event_type: input.type,
      organization_id: input.organizationId,
      application_id: input.applicationId,
      payload: input.payload,
      schedule: input.schedule,
      updated_by: _.get(context, 'requestContext.userInfo.userId')
    };

    const whereClause = `event_schedule_id = $1`;
    const values = [input.id];
    const { sql, values: columnValues } = mainUtil.makeUpdateSql(
      tableName,
      columnData,
      columns,
      whereClause,
      values.length
    );
    values.push(...columnValues);

    const res = await dbWrite.map(sql, values, camelizeRootKeys);
    return res[0];
  }

  async function deleteScheduledEvent(context, args) {
    const scheduledEvent = await getScheduledEvent(context, args);
    const sql = `DELETE FROM ${tableName} where event_schedule_id = $1`;
    await dbWrite.query(sql, [args.id]);
    return scheduledEvent;
  }

  function normalizeSchedule(schedule) {
    if (!schedule) return schedule;

    try {
      cronParser.parseExpression(schedule);
      return schedule;
    } catch (err) {
      const asDate = moment(mainUtil.fixDateTime(schedule));
      if (asDate.isValid()) {
        return asDate.toISOString();
      }
      throw new InvalidInput({
        message: `Error parsing schedule as cron or date: ${err}`,
        data: { schedule }
      });
    }
  }

  function validatePayload(payload) {
    if (_.isEmpty(payload)) return payload;

    // for now only allow json until we can validate protobuf
    try {
      JSON.parse(payload);
    } catch (err) {
      throw new InvalidInput({
        message: `Error parsing payload: ${err}`,
        data: { payload }
      });
    }
  }

  return {
    getScheduledEvents,
    getScheduledEvent,
    createScheduledEvent,
    updateScheduledEvent,
    deleteScheduledEvent
  };
};
