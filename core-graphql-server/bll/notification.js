const moment = require('moment');
const _ = require('lodash');
const uuid = require('uuid');

module.exports = function createFunction(serviceContext) {
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const topic = {
    NOTIFICATION_POSTED_TOPIC: 'notification_posted'
  };
  const errors = require('../error')(serviceContext.config);
  const dalUtil = require('../dal/util')(serviceContext.config, serviceContext);
  const mainUtil = require('../util.js')(serviceContext);

  async function post(context, args) {
    // get mailboxes
    const {
      mailboxIds,
      body,
      contentType,
      flags,
      title,
      application,
      eventName,
      eventType,
      ephemeral
    } = args.input;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const clientInfo = resUtil.getClientInfo(context);

    if (_.isEmpty(mailboxIds)) {
      throw new errors.InvalidInput({
        message: 'mailboxIds cannot be empty.',
        data: { mailboxIds }
      });
    }

    // filter paused and full mailboxes
    const validMailboxes = [];
    const failedMailboxes = [];
    const limitedMailboxes = [];
    // filter userIds and toOrganizationIds in array of mailboxIds
    const toOrganizationIds = _.filter(mailboxIds, (id) => !isNaN(id));
    const uniqueMailboxIds = _.filter(_.uniq(mailboxIds), (id) => isNaN(id));
    let userIds = [];

    // Change to check the uniqueMailboxIds and move uniqueMailbox out the if block
    // to avoid the case mailboxIds = [7682,..] and uniqueMailboxIds will be
    // empty after filter the number out.
    if (!_.isEmpty(uniqueMailboxIds)) {
      const mailboxesRes = await serviceContext.dal.mailbox.getMailboxes(
        context,
        {
          ids: uniqueMailboxIds,
          limit: uniqueMailboxIds.length
        }
      );
      const mailboxResIds = _.map(mailboxesRes.records, (m) => m.id);

      for (const m of mailboxesRes.records) {
        if (m.isPaused) {
          failedMailboxes.push({
            mailboxId: m.id,
            reason: 'mailbox paused'
          });
          continue;
        }

        const mailboxLimitCount = _.get(m, 'limitCount', 0);
        const mailboxTotalCount = await serviceContext.dal.notification.getNotificationCount(
          context,
          {
            mailboxLimit: mailboxLimitCount,
            mailboxIds: [m.id]
          }
        );

        if (mailboxTotalCount >= mailboxLimitCount) {
          limitedMailboxes.push(
            _.assign(m, {
              reason:
                'Mailbox limit reached. Sending nonpersistent notification.',
              count: mailboxTotalCount,
              limit: mailboxLimitCount
            })
          );
          continue;
        }
        validMailboxes.push(m);
      }

      userIds = _.differenceWith(uniqueMailboxIds, mailboxResIds, _.isEqual);
    }

    // Check the invalid userId if post notification to userIds
    if (!_.isEmpty(userIds)) {
      const uniqueUserIds = _.uniq(userIds);
      // Just need to check the users is existing in aiWare
      // Allow user to push notification to users in other orgs
      const userRes = await serviceContext.dal.admin.getUsersWithBasicInfo(
        { userIds: uniqueUserIds },
        context
      );

      _.forEach(userRes, (user) => {
        validMailboxes.push({
          id: dalUtil.getDefaultMailboxIdByOrgIdOrUserId(user.userId)
        });
      });
    }

    // Check the invalid organizationIds if post notification to organizationIds
    if (!_.isEmpty(toOrganizationIds)) {
      const uniqueOrgIds = _.uniq(toOrganizationIds);

      if (!isSuperAdmin && clientInfo.type !== 'internal') {
        const invalidOrgIds = _.filter(
          uniqueOrgIds,
          (orgId) => orgId != args.organizationId
        );

        if (invalidOrgIds.length) {
          throw new errors.InvalidInput({
            message:
              'Only superadmin or internal token can post notification to other orgs',
            data: { invalidOrgIds }
          });
        }
      }

      const orgRes = await serviceContext.dal.organization.getOrganizations(
        context,
        { id: uniqueOrgIds }
      );

      _.forEach(orgRes.records, (org) => {
        validMailboxes.push({
          id: dalUtil.getDefaultMailboxIdByOrgIdOrUserId(org.id)
        });
      });
    }

    if (validMailboxes.length === 0 && limitedMailboxes.length === 0) {
      throw new errors.InvalidInput({
        message: 'Failed to publish to any of the input mailboxes',
        data: { failedMailboxes, userIds, orgIds: toOrganizationIds }
      });
    }

    let notification = {
      title,
      body,
      contentType,
      flags,
      mailboxIds: validMailboxes.map((x) => x.id),
      applicationId: application,
      eventName,
      eventType
    };

    if (ephemeral === true || _.isEmpty(validMailboxes)) {
      // Skip persistence if notification is ephemeral or pushing notification to limited mailboxes
      notification.id = uuid.v4();
      notification.createdDateTime = moment.utc().toISOString();
      notification.updatedDateTime = notification.createdDateTime;
    } else {
      notification = await serviceContext.dal.notification.createNotification(
        context,
        notification
      );
    }

    if (validMailboxes.length) {
      await Promise.all(
        validMailboxes.map(async (mailbox) => {
          await serviceContext.pubsub.publish(topic.NOTIFICATION_POSTED_TOPIC, {
            mailboxId: mailbox.id,
            notification
          });
        })
      );

      // Update mailbox metrics
      await serviceContext.dal.mailbox.increaseMailboxCount(
        context,
        _.map(validMailboxes, (mailbox) => mailbox.id),
        _.includes(flags, 'unread'),
        ephemeral
      );
    }

    if (limitedMailboxes.length) {
      // Publish non-persistence notifications for limitedMailboxes
      for (const mailbox of limitedMailboxes) {
        serviceContext.pubsub.publish(topic.NOTIFICATION_POSTED_TOPIC, {
          mailboxId: mailbox.id,
          notification
        });
      }
      notification.limitedMailboxes = limitedMailboxes;
    }

    if (failedMailboxes) {
      notification.failedMailboxes = failedMailboxes;
    }
    return notification;
  }

  async function addTemplate(context, args) {
    const {
      eventName,
      eventType,
      title,
      body,
      application,
      mailboxId
    } = args.input;
    let ownerApplicationId = args.applicationId;
    let ownerOrganizationId = args.organizationId;

    if (_.isNil(ownerApplicationId) && application) {
      ownerApplicationId = application;
    }

    if (_.isNil(ownerOrganizationId) && ownerApplicationId) {
      ownerOrganizationId = await serviceContext.dal.organization.getOrgIdFromAppId(
        ownerApplicationId
      );
    }

    // Validate the params
    if (_.isNil(ownerApplicationId)) {
      serviceContext.logger.error(
        'Internal tokens must define the application since it did not have owner application or organization',
        ownerOrganizationId,
        ownerApplicationId,
        application
      );
      throw new errors.InvalidInput({
        message:
          'Internal tokens must define the application since it did not have owner application or organization',
        data: {
          application
        }
      });
    }

    if (
      _.isNil(eventName) ||
      _.isNil(eventType) ||
      _.isNil(title) ||
      _.isNil(body)
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
    // Check the eventName and eventType have been define in system
    await serviceContext.dal.event._getDefinition(
      eventName,
      eventType,
      application || ownerApplicationId
    );

    let notificationTemplate;
    try {
      notificationTemplate = await serviceContext.dal.notification.createNotificationTemplate(
        context,
        {
          eventName,
          eventType,
          title,
          body,
          ownerOrganizationId,
          ownerApplicationId,
          application,
          mailboxId
        }
      );
    } catch (error) {
      serviceContext.logger.error(
        'Error when creating notification template',
        error
      );
      throw error;
    }

    return notificationTemplate;
  }

  async function getNotificationTemplates(context, args) {
    const requestorOrgId = args.organizationId;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const tokenType = resUtil.getTokenType(context);

    // Only super-admin or internal token can get templates of other organizations
    if (!isSuperAdmin && tokenType !== 'internal') {
      args.ownerOrganizationId = requestorOrgId;
    }

    const res = await serviceContext.dal.notification.getNotificationTemplates(
      context,
      args
    );

    return res;
  }

  async function addAction(context, args) {
    const { application } = args.input;
    let ownerApplicationId = args.applicationId;
    let ownerOrganizationId = args.organizationId;

    if (_.isNil(ownerApplicationId) && !_.isNil(application)) {
      ownerApplicationId = application;
    }

    const {
      eventName,
      eventType,
      actionName,
      icon,
      urlTemplate,
      mailboxId
    } = args.input;

    if (_.isNil(ownerOrganizationId) && !_.isNil(ownerApplicationId)) {
      ownerOrganizationId = await serviceContext.dal.organization.getOrgIdFromAppId(
        ownerApplicationId
      );
    }

    if (_.isNil(ownerApplicationId)) {
      throw new errors.InvalidInput({
        message:
          'Internal tokens must define the application since it did not have owner application or organization',
        data: {
          application
        }
      });
    }

    if (_.isNil(eventName) || _.isNil(eventType) || _.isNil(urlTemplate)) {
      throw new errors.InvalidInput({
        message: 'Require fields must be define',
        data: {
          eventName,
          eventType,
          urlTemplate
        }
      });
    }
    // Check the eventName and eventType have been define in system
    await serviceContext.dal.event._getDefinition(
      eventName,
      eventType,
      application || ownerApplicationId
    );

    let notificationAction;
    try {
      notificationAction = await serviceContext.dal.notification.createNotificationAction(
        context,
        {
          eventName,
          eventType,
          actionName,
          icon,
          urlTemplate,
          ownerOrganizationId,
          ownerApplicationId,
          application,
          mailboxId
        }
      );
    } catch (error) {
      serviceContext.logger.error(
        'Error when creating notification template',
        error
      );
      throw error;
    }

    return notificationAction;
  }

  async function getNotificationActions(context, args) {
    const requestorOrgId = args.organizationId;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const tokenType = resUtil.getTokenType(context);

    // Only super-admin or internal token can get notification actions of other organizations
    if (!isSuperAdmin && tokenType !== 'internal') {
      args.ownerOrganizationId = requestorOrgId;
    }

    const res = await serviceContext.dal.notification.getNotificationActions(
      context,
      args
    );

    return res;
  }

  async function setNotificationFlags(context, args) {
    const { notificationId, setFlags, unsetFlags } = args.input;

    if (
      _.isNil(notificationId) ||
      (_.isEmpty(setFlags) && _.isEmpty(unsetFlags))
    ) {
      throw new errors.InvalidInput({
        message: 'Required fields must be defined',
        data: { notificationId, setFlags, unsetFlags }
      });
    }

    const notification = await serviceContext.dal.notification.setNotificationFlags(
      context,
      args
    );

    return notification;
  }

  async function updateMailboxMetrics(context, mailboxIds) {
    const defaultMailboxLimitCount = _.get(
      serviceContext,
      'config.mailbox.defaultMailboxLimitCount',
      5000
    );

    if (!mailboxIds || _.isEmpty(mailboxIds)) {
      throw new errors.InvalidInput({ message: 'mailboxIds is required' });
    }

    const notifications = await serviceContext.dal.notification.queryNotifications(
      context,
      { mailboxIds },
      0,
      defaultMailboxLimitCount
    );

    if (_.isEmpty(notifications)) {
      serviceContext.logger.warn(
        'There are no notifications for mailboxIds:',
        mailboxIds
      );
      return;
    }

    await Promise.all(
      mailboxIds.map(async (mailboxId) => {
        const mailboxNotifications = _.filter(notifications, (notification) => {
          return _.includes(notification.mailboxIds, mailboxId);
        });
        const mailboxUnreadNotification = _.filter(
          mailboxNotifications,
          (item) => _.includes(item.flags, 'unread')
        );
        const updatePayload = {
          id: mailboxId,
          totalCount: mailboxNotifications.length,
          unreadCount: mailboxUnreadNotification.length
        };

        await serviceContext.dal.mailbox.updateMailbox(context, updatePayload);
      })
    );
  }

  async function setAllNotificationFlags(
    context,
    mailboxIds,
    setFlags,
    unsetFlags
  ) {
    if (!mailboxIds || _.isEmpty(mailboxIds)) {
      throw new errors.InvalidInput({ message: 'mailboxIds is required' });
    }

    const execErrors = await serviceContext.dal.notification.setNotificationFlagsInBulk(
      context,
      { mailboxIds, setFlags, unsetFlags }
    );

    if (execErrors) {
      throw new errors.InternalServerError({
        message: 'Mark all notifications flags failed',
        data: {
          execErrors
        }
      });
    }

    return serviceContext.bll.mailbox.getMailboxes(context, {
      ids: mailboxIds
    });
  }

  async function getNotificationsByUserOrOrgId(context, args, id) {
    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const params = JSON.parse(JSON.stringify(args));

    params.mailboxIds = [dalUtil.getDefaultMailboxIdByOrgIdOrUserId(id)];

    const res = await serviceContext.dal.notification.queryNotifications(
      context,
      params,
      _.get(args, 'offset', 0),
      _.get(args, 'limit', defaultLimit)
    );

    return mainUtil.toPage(args, res);
  }

  return {
    post,
    addTemplate,
    getNotificationTemplates,
    addAction,
    getNotificationActions,
    setNotificationFlags,
    setAllNotificationFlags,
    getNotificationsByUserOrOrgId,
    // for unit-tests only
    updateMailboxMetrics
  };
};
