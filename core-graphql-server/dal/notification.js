const _ = require('lodash');
const moment = require('moment');
const { Context } = require('@veritone/ts-messaging-lib/lib');
const { Messager } = require('@veritone/ts-messaging-lib/lib/nsq');
const { events } = require('@veritone/core-messages/generated/pbjs/compiled');
const uuid = require('uuid');

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const messaging = serviceContext.messagingV2;
  const errors = require('../error')(config);
  const mapper = require('./mapper.js');
  const uuid = require('uuid');
  const mainUtil = require('../util')();
  const indexFormat = _.get(
    config,
    'notification.storage.indexPattern',
    '[notification]-YYYY.MM' // escape the word with "a" character, since moment will understand it as "am" or "AM" format
  );
  const indexAlias = _.get(
    config,
    'notification.storage.indexAlias',
    'notification-*'
  );
  const esClient = require('./../util/elastic.js')(serviceContext).client;
  const notificationTemplateReturning = {
    template_id: 'id',
    event_name: null,
    event_type: null,
    title: null,
    body: null,
    owner_organization_id: null,
    owner_application_id: null,
    application_id: null,
    mailbox_id: null,
    date_created: 'created_date_time',
    date_modified: 'updated_date_time'
  };
  const notificationTemplateSelect = `
    nt.template_id as id,
    nt.event_name,
    nt.event_type,
    nt.title,
    nt.body,
    nt.owner_organization_id,
    nt.owner_application_id,
    nt.application_id,
    nt.mailbox_id,
    nt.date_created as created_date_time,
    nt.date_modified as updated_date_time
  `;
  const notificationActionReturning = {
    action_id: 'id',
    event_name: null,
    event_type: null,
    action_name: null,
    icon: null,
    url_template: null,
    owner_organization_id: null,
    owner_application_id: null,
    application_id: null,
    mailbox_id: null,
    date_created: 'created_date_time',
    date_modified: 'updated_date_time'
  };
  const notificationActionSelect = `
    na.action_id as id,
    na.event_name,
    na.event_type,
    na.action_name,
    na.icon,
    na.url_template,
    na.owner_organization_id,
    na.owner_application_id,
    na.application_id,
    na.mailbox_id,
    na.date_created as created_date_time,
    na.date_modified as updated_date_time
  `;

  /**
   * create an event that will send out a basic email notification
   *
   * @param {*} ctx
   * @param {*} args
   * @returns
   */
  async function sendEmail(ctx, args) {
    if (
      _.isEmpty(args.input.to) ||
      _.isEmpty(args.input.subject) ||
      _.isEmpty(args.input.message)
    ) {
      throw new errors.InvalidInput({
        message: 'all input parameters cannot not be empty string'
      });
    }

    const defaultEmailFrom = _.get(config, 'defaultEmailProvider.emailFrom');

    // AWT-3136: mitigate email spoofing by hard-coding the from field.
    args.input.from = defaultEmailFrom;
    // TODO: currently this will work only on commercial deployments
    if (_.isEmpty(args.input.replyTo)) {
      args.input.from = _.get(
        config,
        'defaultEmailProvider.emailFromNoReply',
        defaultEmailFrom
      );
    } else {
      // restrict replyTo to email from the root domain.
      const domain = defaultEmailFrom.split('@')[1];
      if (!args.input.replyTo.endsWith(domain)) {
        throw new errors.InvalidInput({
          message: `replyTo should have ${domain} domain`
        });
      }
    }

    try {
      const email = new events.BasicEmail();
      email.fromAddress = args.input.from;
      email.toAddress = args.input.to;
      email.subject = args.input.subject;
      email.body = args.input.message;
      // regular text is also HTML text so just pass that in.
      // If malformed, email should display regular text.
      email.bodyHtml = args.input.message;
      email.replyTo = args.input.replyTo;

      if (args.input.cc) {
        email.ccAddress = args.input.cc;
      }
      if (args.input.bcc) {
        email.bccAddress = args.input.bcc;
      }

      // AWT-3136: set the fromName to the organizaion calling sendMail
      // for traceability since all emails are coming from support@veritone.com
      const organizationName =
        _.get(ctx, 'requestContext.userInfo.organization.organizationName') ||
        _.get(ctx, 'requestContext.tokenInfo.organization.organizationName');
      if (organizationName) {
        email.fromName = `Veritone - ${organizationName}`;
      }

      // legacy eventing way
      const emailJSON = email.toJSON();
      emailJSON.event = 'basic_email';
      emailJSON.type = 'notification';
      emailJSON.correlationId = _.get(
        ctx,
        'requestInfo.correlationId',
        uuid.v4()
      );

      const emailPayload = JSON.stringify(emailJSON);
      await messaging.produce(Context, new Messager(emailPayload, 'SendEmail'));
    } catch (e) {
      logger.error('unable to send email', e);
      return false;
    }
    return true;
  }

  /**
   * create an event that will send out an email with template
   *
   * @param {*} ctx
   * @param {*} args
   * @returns
   */
  async function sendEmailTemplate(ctx, args) {
    const { templateName, toEmailAddress, mergeKvp, mergeLanguage } = args;
    const defaultEmailFrom = _.get(config, 'defaultEmailProvider.emailFrom');
    let replyTo = args.replyTo;

    if (
      _.isEmpty(templateName) ||
      _.isEmpty(toEmailAddress) ||
      _.isEmpty(mergeKvp)
    ) {
      throw new errors.InvalidInput({
        message:
          'templateName, toEmailAddress, mergeKvp cannot not be empty string'
      });
    }

    if (_.isEmpty(replyTo)) {
      replyTo = _.get(
        config,
        'defaultEmailProvider.emailFromNoReply',
        defaultEmailFrom
      );
    } else {
      const domain = defaultEmailFrom.split('@')[1];
      if (!replyTo.endsWith(domain)) {
        throw new errors.InvalidInput({
          message: `replyTo should have ${domain} domain`
        });
      }
    }

    try {
      const event = {
        event: 'send_email',
        type: 'SendEmail',
        emailAddress: toEmailAddress,
        emailTemplate: templateName,
        mergeKvp,
        correlationId: _.get(ctx, 'requestInfo.correlationId', uuid.v4())
      };
      if (mergeLanguage) {
        event.merge_language = mergeLanguage;
      }
      const messagePayload = JSON.stringify(event);
      logger.info('Publishing event...' + messagePayload);
      await messaging.produce(Context, new Messager(messagePayload, 'events'));
    } catch (e) {
      logger.error('unable to send email with template', e);
      return false;
    }
    return true;
  }

  async function createNotification(ctx, notificationPayload) {
    const timestamp = moment.utc();
    notificationPayload.createdDateTime = moment.utc().toISOString();
    notificationPayload.updatedDateTime = notificationPayload.createdDateTime;
    // remove null/undefined values from flags
    // They might come from some invalid notifications (e.g..heartbeats,..)
    notificationPayload.flags = _.without(
      notificationPayload.flags,
      null,
      undefined
    );
    const esResult = await esClient.index({
      index: timestamp.format(indexFormat),
      body: _.merge({}, notificationPayload, {
        createdDateTime: timestamp.toISOString(),
        updatedDateTime: timestamp.toISOString()
      })
    });
    const res = _.merge(
      {},
      notificationPayload,
      _.pick(esResult.body, ['_id']),
      {
        createdDateTime: timestamp,
        updatedDateTime: timestamp
      }
    );

    return mapper.mapNotification(res);
  }

  async function queryNotifications(ctx, queryParams, offset, limit) {
    const filters = [];

    if (queryParams.notificationId) {
      filters.push({ terms: { _id: [queryParams.notificationId] } });
    }

    // In any if the mailboxes
    if (
      Array.isArray(queryParams.mailboxIds) &&
      queryParams.mailboxIds.length
    ) {
      filters.push({
        terms: {
          mailboxIds: queryParams.mailboxIds
        }
      });
    }

    if (Array.isArray(queryParams.flags) && queryParams.flags.length) {
      // Any of the flags
      if (queryParams.flagsMode === 'OR') {
        filters.push({
          terms: {
            flags: queryParams.flags
          }
        });
      } else {
        // All of the flags
        for (const f of queryParams.flags) {
          filters.push({
            term: {
              flags: f
            }
          });
        }
      }
    }

    if (
      Array.isArray(queryParams.dateTimeFilter) &&
      queryParams.dateTimeFilter.length
    ) {
      for (const df of queryParams.dateTimeFilter) {
        if (df.fromDateTime || df.toDateTime) {
          // TODO: when implement update notification/action change the following
          // for now for any other time field use updatedDateTime
          const field =
            df.field === 'createdDateTime' ? df.field : 'updatedDateTime';
          const rangeFilter = {
            range: {}
          };
          rangeFilter.range[field] = {};
          if (df.fromDateTime) {
            rangeFilter.range[field].gte = moment(
              df.fromDateTime
            ).toISOString();
          }
          if (df.toDateTime) {
            rangeFilter.range[field].lt = moment(df.toDateTime).toISOString();
          }
          filters.push(rangeFilter);
        }
      }
    }
    if (!filters.length) {
      // TODO: return error?
      return [];
    }

    let sort = [{ updatedDateTime: { order: 'desc' } }];
    if (queryParams.orderBy) {
      const field =
        queryParams.orderBy === 'createdDateTime'
          ? queryParams.orderBy
          : 'updatedDateTime';
      const order = queryParams.orderDirection || 'desc';
      sort = [_.set({}, field, { order })];
    }

    const body = {
      query: {
        bool: {
          must: filters
        }
      },
      sort
    };
    const results = await esClient.search({
      index: indexAlias,
      body,
      from: offset,
      size: limit
    });

    return _.get(results.body, 'hits.hits', []).map((h) =>
      mapper.mapNotification(_.merge({}, h._source, { id: h._id }))
    );
  }

  async function createNotificationTemplate(ctx, template) {
    const {
      eventName,
      eventType,
      title,
      body,
      ownerOrganizationId,
      ownerApplicationId,
      application,
      mailboxId
    } = template;

    if (
      _.isNil(eventName) ||
      _.isNil(eventType) ||
      _.isNil(title) ||
      _.isNil(body) ||
      _.isNil(ownerApplicationId) ||
      _.isNil(ownerOrganizationId)
    ) {
      throw new errors.InvalidInput({
        message: 'Require fields must be define',
        data: {
          eventName,
          eventType,
          title,
          body
        }
      });
    }

    const columnData = {
      event_name: eventName,
      event_type: eventType,
      title,
      body,
      owner_organization_id: ownerOrganizationId,
      owner_application_id: ownerApplicationId,
      application_id: application,
      mailbox_id: mailboxId
    };
    const { sql, values } = mainUtil.makeInsertSql(
      'event_trigger.notification_templates',
      columnData,
      notificationTemplateReturning
    );

    return serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  async function getNotificationTemplates(ctx, args) {
    const {
      ids,
      eventName,
      eventType,
      application,
      mailboxId,
      offset,
      limit,
      ownerOrganizationId
    } = args;
    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const whereAnd = [];
    const values = [];

    mainUtil.addSqlWhere('nt.template_id', ids, whereAnd, values);
    mainUtil.addSqlWhere(
      'nt.owner_organization_id',
      ownerOrganizationId,
      whereAnd,
      values
    );
    mainUtil.addSqlWhere('nt.event_name', eventName, whereAnd, values);
    mainUtil.addSqlWhere('nt.event_type', eventType, whereAnd, values);
    mainUtil.addSqlWhere('nt.application_id', application, whereAnd, values);
    mainUtil.addSqlWhere('nt.mailbox_id', mailboxId, whereAnd, values);

    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';
    const orderClause = ['nt.date_created DESC'];
    const sql = `
      SELECT
        ${notificationTemplateSelect}
      FROM
        event_trigger.notification_templates nt
      ${whereClause}
      ORDER BY
        ${orderClause.join(', ')}
      OFFSET ${offset || 0}
      LIMIT ${limit || defaultLimit};
    `;
    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return mainUtil.toPage(args, rows);
  }

  async function deleteNotificationTemplate(ctx, args) {
    const sql = `
      DELETE FROM	event_trigger.notification_templates
      WHERE	template_id = $1
      RETURNING	template_id as id;
    `;

    return deleteNotificationActionOrTemplate({
      id: args.id,
      notificationObjName: 'Notification Template',
      sql
    });
  }

  async function createNotificationAction(ctx, notificationAction) {
    const {
      eventName,
      eventType,
      actionName,
      icon,
      urlTemplate,
      ownerOrganizationId,
      ownerApplicationId,
      application,
      mailboxId
    } = notificationAction;

    if (
      _.isNil(eventName) ||
      _.isNil(eventType) ||
      _.isNil(urlTemplate) ||
      _.isNil(ownerApplicationId) ||
      _.isNil(ownerOrganizationId)
    ) {
      throw new errors.InvalidInput({
        message: 'Require fields must be define',
        data: {
          eventName,
          eventType,
          urlTemplate
        }
      });
    }

    const columnData = {
      event_name: eventName,
      event_type: eventType,
      action_name: actionName,
      icon: icon,
      url_template: urlTemplate,
      owner_organization_id: ownerOrganizationId,
      owner_application_id: ownerApplicationId,
      application_id: application,
      mailbox_id: mailboxId
    };
    const { sql, values } = mainUtil.makeInsertSql(
      'event_trigger.notification_actions',
      columnData,
      notificationActionReturning
    );

    return serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  async function getNotificationActions(ctx, args) {
    const whereAnd = [];
    const values = [];
    const {
      ids,
      eventName,
      eventType,
      application,
      mailboxId,
      offset,
      limit,
      ownerOrganizationId
    } = args;

    mainUtil.addSqlWhere('na.action_id', ids, whereAnd, values);
    mainUtil.addSqlWhere('na.event_name', eventName, whereAnd, values);
    mainUtil.addSqlWhere('na.event_type', eventType, whereAnd, values);
    mainUtil.addSqlWhere('na.application_id', application, whereAnd, values);
    mainUtil.addSqlWhere('na.mailbox_id', mailboxId, whereAnd, values);
    mainUtil.addSqlWhere(
      'na.owner_organization_id',
      ownerOrganizationId,
      whereAnd,
      values
    );

    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';
    const orderClause = ['na.date_created DESC'];
    const sql = `
      SELECT
        ${notificationActionSelect}
      FROM
        event_trigger.notification_actions na
      ${whereClause}
      ORDER BY
        ${orderClause.join(', ')}
      OFFSET ${offset || 0}
      LIMIT ${limit || defaultLimit};
    `;
    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return mainUtil.toPage(args, rows);
  }

  async function deleteNotificationAction(ctx, args) {
    const sql = `
      DELETE FROM	event_trigger.notification_actions
      WHERE	action_id = $1
      RETURNING	action_id as id;
    `;

    return deleteNotificationActionOrTemplate({
      id: args.id,
      notificationObjName: 'Notification Action',
      sql
    });
  }

  async function deleteNotificationActionOrTemplate(args) {
    const { id, notificationObjName, sql } = args;

    if (_.isNil(id)) {
      throw new errors.InvalidInput({
        message: `${notificationObjName} id is required.`
      });
    }

    const values = [id];
    const res = await serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    if (!res) {
      throw new errors.NotFound({
        message: `${notificationObjName} does not exists`,
        data: {
          id
        }
      });
    }

    return {
      id: res.id,
      message: `${notificationObjName} has been removed`
    };
  }

  async function setNotificationFlags(ctx, args) {
    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const { notificationId, setFlags = [], unsetFlags = [] } = args.input;
    const oldNotifications = await queryNotifications(
      ctx,
      { notificationId },
      0,
      defaultLimit
    );

    if (_.isNil(oldNotifications) || _.isEmpty(oldNotifications)) {
      throw new errors.InvalidInput({
        message: 'Notification does not exists',
        data: { notificationId }
      });
    }

    const notification = _.first(oldNotifications);
    const timestamp = moment(notification.createdDateTime);
    const notificationFlags = _.remove(
      _.uniq(_.concat(notification.flags, setFlags)),
      (n) => !unsetFlags.includes(n)
    );
    const notificationPayload = {
      updatedDateTime: moment.utc().toISOString(),
      flags: notificationFlags
    };

    const esResult = await esClient.update({
      index: timestamp.format(indexFormat),
      id: notificationId,
      body: {
        doc: notificationPayload
      }
    });
    const res = _.merge(
      {},
      notification,
      _.pick(esResult.body, ['_id']),
      notificationPayload
    );

    return mapper.mapNotification(res);
  }

  async function setNotificationFlagsInBulk(ctx, args) {
    const defaultMailboxLimitCount = _.get(
      serviceContext,
      'config.mailbox.defaultMailboxLimitCount',
      5000
    );
    const { mailboxIds, setFlags = [], unsetFlags = [] } = args;

    if (_.isEmpty(mailboxIds)) {
      throw new errors.InvalidInput({
        message: 'mailboxIds is required',
        data: { mailboxIds }
      });
    }

    if (_.isEmpty(setFlags) && _.isEmpty(unsetFlags)) {
      throw new errors.InvalidInput({
        message: 'setFlags or unsetFlags is required',
        data: { setFlags, unsetFlags }
      });
    }

    const notifications = await queryNotifications(
      ctx,
      { mailboxIds },
      0,
      defaultMailboxLimitCount
    );

    // Stop process when there is no notifications of mailboxes
    // to avoid the error from elastic:
    // {"type":"parse_exception","reason":"request body is required"}
    if (_.isNil(notifications) || _.isEmpty(notifications)) {
      return;
    }

    const body = [];

    _.forEach(notifications, (item) => {
      const timestamp = moment(item.createdDateTime);
      // action description
      body.push({
        update: {
          _index: timestamp.format(indexFormat),
          _id: item.id
        }
      });
      // the document to update
      body.push({
        doc: {
          flags: _.remove(
            _.uniq(_.concat(item.flags, setFlags)),
            (n) => !unsetFlags.includes(n) && !_.isNil(n)
          ),
          updatedDateTime: moment.utc().toISOString()
        }
      });
    });

    const esResult = await esClient.bulk({
      refresh: true,
      body
    });

    return _.get(esResult, 'body.errors');
  }

  async function getNotificationCount(ctx, args) {
    const { mailboxIds, flags, mailboxLimit } = args;
    const defaultMailboxLimitCount = _.get(
      serviceContext,
      'config.mailbox.defaultMailboxLimitCount',
      5000
    );
    const params = {
      mailboxIds,
      flags
    };
    const res = await serviceContext.dal.notification.queryNotifications(
      ctx,
      params,
      0,
      mailboxLimit || defaultMailboxLimitCount
    );

    return res.length || 0;
  }

  return {
    sendEmail,
    createNotification,
    queryNotifications,
    createNotificationTemplate,
    getNotificationTemplates,
    deleteNotificationTemplate,
    createNotificationAction,
    getNotificationActions,
    deleteNotificationAction,
    setNotificationFlags,
    setNotificationFlagsInBulk,
    getNotificationCount,
    sendEmailTemplate
  };
};
