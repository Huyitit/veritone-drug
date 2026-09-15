const pg = require('pg');
const _ = require('lodash');
const moment = require('moment');
const uuid = require('uuid');
const humps = require('humps');

module.exports = function createFunction(serviceContext) {
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const mainUtil = require('../util.js')(serviceContext);
  const config = serviceContext.config;
  const errors = require('../error')(config);
  const mapper = require('./mapper.js');
  const messageUtil = require('../messageUtil.js')(serviceContext);

  async function updateExportRequest(context, args) {
    // retrieve current request and validate access
    const exportRequest = await getExportRequest(context, {
      id: args.input.id,
      organizationId: args.input.organizationId,
      event: _.get(args, 'input.event', 'exportRequest')
    });

    // currently the only field that can be updated is
    // status. if one was not passed, just return out now.
    if (!args.input.status) return exportRequest;

    // since only status can be updated, we'll keep this
    // query and code simple.
    let optionalArgIndex = 5;
    let urlPart = '';
    if (args.input.assetUri) {
      urlPart = `,
      asset_uri = $${optionalArgIndex++}
`;
    }
    let sqlQueryPart = '';
    if (args.input.sqlQueries) {
      sqlQueryPart = `,
        event_payload = jsonb_set(event_payload, '{sqlQueries}', $${optionalArgIndex++}::JSONB, true)
      `;
    }

    const sql = `
UPDATE
  job_new.export_request
SET
  status = $1,
  modified_date_time = $2 ${urlPart} ${sqlQueryPart}
WHERE
  id = $3 AND organization_id = $4
RETURNING *
    `;
    const vars = [
      args.input.status,
      moment(Date.now()).toISOString(),
      args.input.id,
      _.toString(args.input.organizationId)
    ];
    if (args.input.assetUri) vars.push(args.input.assetUri);
    if (args.input.sqlQueries) vars.push(args.input.sqlQueries);
    const res = await serviceContext.dbConnections['core'].write.map(
      sql,
      vars,
      mapper.camelizeRootKeys
    );
    if (!res.length) {
      // should never happen because we just retrieved the object above.
      throw new errors.NotFound({
        message: 'The requested export request could not be updated.'
      });
    }
    return res[0];
  }

  async function validateTDOData(args) {
    const tdos = _.get(args, 'input.tdoData', []);
    const ids = [];
    for (let i = 0; i < tdos.length; i++) {
      const id = tdos[i].tdoId;
      ids.push(id);
    }
    // TODO continue to validate
  }

  async function validateOuputConfiguration(args) {}

  async function createExportRequest(context, args) {
    const input = args.input;
    _.forEach(input.tdoData, (tdo) => {
      if (!tdo.tdoId && !tdo.mentionId) {
        throw new errors.InvalidInput({
          message: 'must provide a tdoId or mentionId in tdoData object'
        });
      }
      if (input.includeMedia && !tdo.tdoId) {
        throw new errors.InvalidInput({
          message: 'must provide a tdoId if includeMedia is set to true'
        });
      }
    });

    const clientInfo = resUtil.getClientInfo(context);

    // force an id so we can set it on the event and in the db
    const id = uuid.v4();
    // TODO validate tdo and engine category input
    const event = {
      id: uuid.v4(),
      tdoData: input.tdoData,
      outputConfigurations: input.outputConfigurations,
      includeMedia: input.includeMedia,
      includeAllEngineAssets: input.includeAllEngineAssets,
      exportRequestId: id,
      type: 'export',
      event: 'export_request'
    };

    const columnData = {
      organization_id: input.organizationId,
      requestor_id: clientInfo.id,
      status: 'incomplete',
      event_payload: event,
      id: id
    };

    const selectData = {
      id: null,
      organization_id: null,
      status: null,
      requestor_id: null,
      asset_uri: null,
      event_payload: null,
      created_date_time: null,
      modified_date_time: null
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'job_new.export_request',
      columnData,
      selectData
    );

    // write row to database
    const res = await serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    // only write token to event now so that it isn't in db
    event.requestToken =
      context._authInfo.token ||
      context._authInfo.tokenId ||
      context.requestContext.authToken;

    // emit the event
    messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));

    return res[0];
  }

  async function getExportRequest(context, args) {
    // require ID
    mainUtil.checkId(args.id, false, false, true);
    const res = await getExportRequests(context, args);

    if (!res.count) {
      throw new errors.NotFound({
        message: 'The requested export request was not found.',
        data: {
          objectId: args.id,
          objectType: 'ExportRequest'
        }
      });
    }
    return res.records[0];
  }

  async function getExportRequests(context, args) {
    const where = [];
    const values = [];
    const event = _.get(args, 'event', 'exportRequest');

    mainUtil.addSqlWhere(
      'organization_id',
      _.toString(args.organizationId),
      where,
      values
    );
    mainUtil.addSqlWhere('id', args.id, where, values);
    mainUtil.addSqlWhere('requestor_id', args.requestorId, where, values);
    mainUtil.addSqlWhere('status', args.status, where, values);
    mainUtil.addSqlWhere(
      `event_payload ->> 'event'`,
      humps.decamelize(event),
      where,
      values
    );

    const sql = `
SELECT
  *
FROM
  job_new.export_request
WHERE
  ${where.join(' AND ')}
ORDER BY created_date_time DESC  
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

  async function createMentionExportRequest(args, context) {
    const input = args.input;
    const clientInfo = resUtil.getClientInfo(context);

    if (input.userTimeZone) {
      const timeZones = mainUtil.getAllTimeZones();
      const isValidTimeZone = timeZones.some(
        (tz) =>
          tz.name === input.userTimeZone ||
          tz.abbreviations.some((abbr) => abbr.name === input.userTimeZone)
      );
      if (!isValidTimeZone) {
        throw new errors.InvalidInput({
          message:
            'Specify a valid userTimeZone. Query TimeZones for valid values.',
          data: {
            userTimeZone: input.userTimeZone
          }
        });
      }
    }

    const id = uuid.v4();
    const event = {
      id: uuid.v4(),
      organizationId: input.organizationId,
      mentionFilters: input.mentionFilters,
      userTimeZone: input.userTimeZone,
      exportRequestId: id,
      type: 'export',
      event: 'mention_export_request'
    };

    const columnData = {
      organization_id: input.organizationId,
      requestor_id: clientInfo.id,
      status: 'incomplete',
      event_payload: event,
      id: id
    };
    const selectData = {
      id: null,
      organization_id: null,
      status: null,
      requestor_id: null,
      asset_uri: null,
      event_payload: null,
      created_date_time: null,
      modified_date_time: null
    };
    const { sql, values } = mainUtil.makeInsertSql(
      'job_new.export_request',
      columnData,
      selectData
    );
    const res = await serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    event.requestToken = context._authInfo.token || context._authInfo.tokenId;
    messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
    return res[0];
  }

  return {
    getExportRequests,
    getExportRequest,
    createExportRequest,
    updateExportRequest,
    createMentionExportRequest,
    validateTDOData,
    validateOuputConfiguration
  };
};
