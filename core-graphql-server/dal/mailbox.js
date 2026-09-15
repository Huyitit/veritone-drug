const _ = require('lodash');
const uuid = require('uuid');
const moment = require('moment');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../util')();
  const mapper = require('./mapper.js');
  const errors = require('../error')(serviceContext.config);
  const mailboxSelect = `
    nm.mailbox_id as id,
    nm.mailbox_name as name,
    nm.user_id,
    nm.organization_id,
    nm.application_id,
    nm.conditions,
    nm.notification_template,
    nm.limit_count,
    nm.is_paused,
    nm.latest_receipt_date,
    nm.date_created,
    nm.date_modified,
    nm.metadata
  `;
  const mailboxReturning = {
    mailbox_id: 'id',
    mailbox_name: 'name',
    user_id: null,
    organization_id: null,
    application_id: null,
    conditions: null,
    notification_template: null,
    limit_count: null,
    is_paused: null,
    latest_receipt_date: null,
    date_created: null,
    date_modified: null,
    metadata: null
  };
  const resUtil = require('../resolvers/util.js')(serviceContext);

  async function getMailboxes(context, args) {
    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const clientInfo = resUtil.getClientInfo(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isInternalToken = clientInfo.type === 'internal';
    const whereAnd = [];
    const values = [];

    if (!isSuperAdmin && !isInternalToken) {
      // regular user token
      if (clientInfo.type === 'user') {
        args.userId = clientInfo.id;
        args.organizationId = clientInfo.org;
      }
      // regular api token type
      if (clientInfo.type === 'apikey') {
        args.organizationId = clientInfo.org;
      }
    }

    mainUtil.addSqlWhere('nm.mailbox_id', args.id, whereAnd, values);
    if (_.isArray(args.ids) && !_.isEmpty(args.ids))
      mainUtil.addSqlWhere('nm.mailbox_id', args.ids, whereAnd, values);
    mainUtil.addSqlWhere('nm.user_id', args.userId, whereAnd, values);
    mainUtil.addSqlWhere(
      'nm.organization_id',
      args.organizationId,
      whereAnd,
      values
    );
    mainUtil.addSqlWhere(
      'nm.application_id',
      args.applicationId,
      whereAnd,
      values
    );
    if (args.name) {
      mainUtil.addSqlWhere('nm.mailbox_name', args.name, whereAnd, values);
    }

    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';
    const orderClause = ['nm.date_created DESC'];

    const sql = `
      SELECT
        ${mailboxSelect}
      FROM
      event_trigger.notification_mailbox nm
      ${whereClause}
      ORDER BY
        ${orderClause.join(', ')}
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || defaultLimit};
    `;
    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return mainUtil.toPage(args, rows);
  }

  async function createMailbox(context, mailbox, internalOperation = false) {
    const reservedMailboxNames = Object.values(
      _.get(serviceContext, 'config.mailbox.reservedNames', {})
    );
    // prevent users from creating mailboxes with reserved names
    if (
      mailbox.name &&
      !internalOperation &&
      reservedMailboxNames.includes(mailbox.name)
    ) {
      throw new errors.InvalidInput({
        message: `Mailbox name ${mailbox.name} is reserved.`
      });
    }
    const requestorOrgId = _.get(
      context,
      '_authInfo.organization.organizationId'
    );
    const organizationId = mailbox.organizationId || requestorOrgId;
    let applicationId = mailbox.applicationId;
    const defaultMailboxLimitCount = _.get(
      serviceContext,
      'config.mailbox.defaultMailboxLimitCount',
      500
    );

    if (_.isNil(organizationId)) {
      throw new errors.InvalidInput({ message: 'OrganizationId is requried.' });
    }

    if (_.isNil(applicationId) && !_.isNil(organizationId)) {
      applicationId = await serviceContext.dal.application.getAppIdFromOrgId(
        organizationId
      );
    }

    const columnData = {
      mailbox_id: mailbox.id || uuid.v4(),
      mailbox_name: mailbox.name,
      user_id: mailbox.userId,
      organization_id: organizationId,
      application_id: applicationId,
      conditions: mailbox.conditions,
      notification_template: mailbox.notificationTemplate,
      limit_count: _.get(mailbox, 'limit', defaultMailboxLimitCount),
      is_paused: mailbox.isPaused,
      metadata: mailbox.metadata
    };
    const { sql, values } = mainUtil.makeInsertSql(
      'event_trigger.notification_mailbox',
      columnData,
      mailboxReturning
    );

    const res = await serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return res;
  }

  function updateMailbox(context, args) {
    if (!args.id) {
      throw new errors.InvalidInput({ message: 'Mailbox id is required.' });
    }

    const columnData = {
      mailbox_name: args.name,
      conditions: args.conditions,
      notification_template: args.notificationTemplate,
      limit_count: args.limit,
      is_paused: args.isPaused,
      total_count: args.totalCount,
      unread_count: args.unreadCount,
      latest_receipt_date: args.latestReceiptDate,
      date_modified: moment.utc().toISOString()
    };
    const { sql, values } = mainUtil.makeUpdateSql(
      'event_trigger.notification_mailbox',
      columnData,
      mailboxReturning,
      `mailbox_id = '${args.id}'`
    );

    return serviceContext.dbConnections['core'].write.oneOrNone(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  async function deleteMailbox(mailbox) {
    if (_.isNil(mailbox)) {
      throw new errors.InvalidInput({ message: 'Mailbox is required.' });
    }

    if (_.isNil(mailbox.id)) {
      throw new errors.InvalidInput({ message: 'Mailbox id is required.' });
    }

    if (_.isNil(mailbox.userId)) {
      throw new errors.InvalidInput({ message: 'UserId is required.' });
    }

    const sql = `
      DELETE FROM	event_trigger.notification_mailbox
      WHERE	mailbox_id = $1
        AND user_id = $2
      RETURNING	mailbox_id as id, user_id, conditions, organization_id;
    `;
    const values = [mailbox.id, mailbox.userId];

    return serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  function increaseMailboxCount(context, mailboxIds, isUnread, isEphemeral) {
    if (
      _.isNil(mailboxIds) ||
      !_.isArray(mailboxIds) ||
      _.isEmpty(mailboxIds)
    ) {
      throw new errors.InvalidInput({ message: 'Invalid input mailboxes' });
    }
    let increaseUnread =
      isUnread === true && isEphemeral !== true
        ? 'unread_count = unread_count + 1,'
        : '';
    let increaseTotal =
      isEphemeral !== true ? 'total_count = total_count + 1,' : '';

    const sql = `
      UPDATE 	event_trigger.notification_mailbox 
      SET 	${increaseTotal}
            ${increaseUnread}
            latest_receipt_date = (CURRENT_TIMESTAMP at time zone 'UTC')
      WHERE mailbox_id = ANY($1::uuid[])
      RETURNING mailbox_id as id,
                total_count, 
                unread_count,
                latest_receipt_date;
    `;
    const values = [mailboxIds];

    return serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  return {
    getMailboxes,
    createMailbox,
    updateMailbox,
    deleteMailbox,
    increaseMailboxCount
  };
};
