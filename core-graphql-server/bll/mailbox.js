const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const errors = require('../error')(serviceContext.config);
  const resUtil = require('../resolvers/util.js')(serviceContext);

  async function getMailboxes(context, options) {
    const currentUser = _.get(context, 'requestContext.userInfo');
    const requestorOrgId = _.get(
      context,
      '_authInfo.organization.organizationId'
    );
    const ids = _.get(options, 'ids');
    const isInternalToken = resUtil.getTokenType(context) === 'internal';

    // allow retrieving mailboxes from any organization via an internal token.
    const args = {
      ids,
      userId:
        !_.isNil(currentUser) && !isInternalToken
          ? currentUser.id || currentUser.userId
          : null,
      organizationId:
        !_.isNil(requestorOrgId) && !isInternalToken ? requestorOrgId : null
    };
    if (_.get(options, 'name')) {
      args.name = options.name;
    }
    const mailboxes = await serviceContext.dal.mailbox.getMailboxes(
      context,
      args
    );

    return mailboxes.records;
  }

  async function notificationMailboxCreate(context, options) {
    const input = options.input;
    const currentUser = _.get(context, 'requestContext.userInfo');
    const requesterOrgId = _.get(
      context,
      '_authInfo.organization.organizationId'
    );

    if (_.isNil(currentUser) && _.isNil(input.userId)) {
      throw new errors.NotAllowed({
        message: 'Must be a userToken'
      });
    }

    const mailbox = {
      name: input.name,
      userId: currentUser ? currentUser.userId || currentUser.id : input.userId,
      conditions: input.eventFilter,
      notificationTemplate: input.notificationTemplate,
      limit: input.limit,
      metadata: input.details,
      organizationId: requesterOrgId || input.orgId // case internal/orgless token
    };

    const createdMailbox = await serviceContext.dal.mailbox.createMailbox(
      context,
      mailbox
    );

    if (!createdMailbox) {
      throw new errors.ServiceFailure({
        message: 'Create mailbox unsuccessful'
      });
    }

    // Add the subscription
    const eventFilter = _.get(input, 'eventFilter', {});
    const subscriptionArgs = _.assign({}, eventFilter, {
      mailboxId: createdMailbox.id
    });
    await addSubscriptionForMailbox(context, subscriptionArgs);

    return createdMailbox;
  }

  function notificationMailboxPauseUnpause(context, options) {
    const { id, isPaused } = options;

    if (_.isNil(id)) {
      throw new errors.InvalidInput({ message: 'The mailbox id is required.' });
    }

    return serviceContext.dal.mailbox.updateMailbox(context, {
      id,
      isPaused
    });
  }

  async function notificationMailboxDelete(context, options) {
    const id = options.id;
    const currentUser = _.get(context, 'requestContext.userInfo');

    if (_.isNil(currentUser)) {
      throw new errors.NotAllowed({
        message: 'Must be a userToken'
      });
    }

    if (_.isNil(id)) {
      throw new errors.InvalidInput({ message: 'The mailbox id is required.' });
    }

    const res = await serviceContext.dal.mailbox.deleteMailbox({
      id,
      userId: currentUser.userId || currentUser.id
    });

    if (!res) {
      throw new errors.NotFound({
        message: 'The mailboxId does not exists for current user.',
        data: {
          mailboxId: id,
          userId: currentUser.userId || currentUser.id
        }
      });
    }

    // Unsubscibe the subscriptions
    const subscriptionIds = _.get(res, 'conditions.subscriptionIds', []);
    const organizationId = res.organizationId || options.organizationId;

    if (!_.isEmpty(subscriptionIds)) {
      const unsubcribePromise = [];

      _.forEach(subscriptionIds, (id) => {
        unsubcribePromise.push(
          serviceContext.dal.event.unsubscribeEvent(context, {
            id,
            organizationId
          })
        );
      });

      if (!_.isEmpty(unsubcribePromise)) {
        await Promise.all(unsubcribePromise);
      }
    }

    return {
      id: res.id,
      message: 'Notification mailbox has been removed'
    };
  }

  async function addSubscriptionForMailbox(context, options) {
    const {
      eventNames,
      eventType,
      applicationId,
      delivery,
      conditions,
      mailboxId,
      organizationId
    } = options;
    const subscribeEventPromise = [];
    const requestorOrgId =
      organizationId || _.get(context, '_authInfo.organization.organizationId');

    if (!_.isEmpty(eventNames)) {
      if (_.isEmpty(eventType)) {
        throw new errors.InvalidInput({
          message: 'Must specify eventType if eventName is used'
        });
      }

      if (_.isNil(mailboxId)) {
        throw new errors.InvalidInput({
          message: 'mailboxId is required'
        });
      }

      _.forEach(eventNames, (name) => {
        subscribeEventPromise.push(
          serviceContext.dal.event.subscribeEvent(context, {
            input: {
              eventName: name,
              eventType: eventType,
              application: applicationId,
              organizationId: requestorOrgId,
              delivery: {
                name: _.get(delivery, 'deliveryType', 'NotificationMailbox'),
                params: { mailboxId }
              },
              conditions
            },
            // When subscription's org is -1, the mailbox will subscribe events
            // which do not need to filter by org.
            // Since Platform events is not depended on any org.
            organizationId: eventType === 'platformEvent' ? -1 : requestorOrgId
          })
        );
      });
    }

    if (!_.isEmpty(subscribeEventPromise)) {
      const createdSubscriptionIds = await Promise.all(subscribeEventPromise);

      if (!_.isEmpty(createdSubscriptionIds)) {
        await serviceContext.dal.mailbox.updateMailbox(context, {
          id: mailboxId,
          conditions: {
            eventNames,
            eventType,
            applicationId,
            delivery,
            conditions,
            subscriptionIds: createdSubscriptionIds
          }
        });
      }
    }
  }

  async function createMailboxIfNotExists(context, options, internalOperation) {
    let mailbox;
    const data = await serviceContext.dal.mailbox.getMailboxes(
      context,
      options
    );
    if (_.get(data, 'records.length', 0) === 0) {
      mailbox = await serviceContext.dal.mailbox.createMailbox(
        context,
        options,
        internalOperation
      );
    } else {
      mailbox = _.get(data, 'records[0]');
    }
    return mailbox;
  }

  return {
    getMailboxes,
    notificationMailboxCreate,
    notificationMailboxPauseUnpause,
    notificationMailboxDelete,
    addSubscriptionForMailbox,
    createMailboxIfNotExists
  };
};
