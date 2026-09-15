const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const _ = require('lodash');

const { SubscriptionClient } = require('graphql-subscriptions-client');

const config = helpers.config;

const citestMarker = global.citestMarker || 'citest-should-delete';
const testName = citestMarker + '-notification_mailbox_' + Date.now();
let mailboxId, notificationId, userId, orgId, notificationId1;

describe('notification mailbox tests', () => {
  jest.setTimeout(30000);
  let gqlClient;
  let subscriptionClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    // setup subscription client
    const wsUri = gqlClient.getUrl().replace('http', 'ws');
    global.WebSocket = require('ws');
    subscriptionClient = new SubscriptionClient(wsUri, {
      reconnect: false,
      lazy: true, // only connect when there is a query
      connectionCallback: (error) => {
        error && console.error(error);
      }
    });
  });

  afterAll(() => {
    subscriptionClient.close();
  });

  it('get current user and current organization', async () => {
    const query = `query {
      me {
        id
        organization {
          id
        }
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.me).toBeDefined();
    expect(result.me.id).toBeDefined();
    expect(result.me.organization).toBeDefined();
    expect(result.me.organization.id).toBeDefined();

    userId = result.me.id;
    orgId = result.me.organization.id;
  });

  it('create a test mailbox', async () => {
    const query = `mutation {
      notificationMailboxCreate(input: {
        name: "${testName}"
        eventFilter: {
          eventNames: ["JobCompleted"],
          eventType: "job"
          applicationId: "system",
          delivery: {
            deliveryType: NotificationMailbox
          }
          conditions: {
            conditions: [
              {
                field: "userId",
                value: "userId",
                operator: "eq"
              }
            ]
          }
        }
        notificationTemplate: "Test completed"
        limit: 100
        details: { test: "foo" }
      }) {
        id
        name
        paused
        lastReceiptDateTime
        latestUpdateDate
        totalCount
        unreadCount
        eventFilter {
          eventNames
          eventType
          applicationId
        }
        details
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.notificationMailboxCreate).toBeDefined();
    expect(result.notificationMailboxCreate.name).toEqual(testName);
    expect(result.notificationMailboxCreate.id).toBeDefined();
    expect(result.notificationMailboxCreate.eventFilter).toBeDefined();
    expect(result.notificationMailboxCreate.eventFilter.eventNames[0]).toEqual(
      'JobCompleted'
    );
    expect(result.notificationMailboxCreate.eventFilter.eventType).toEqual(
      'job'
    );
    expect(result.notificationMailboxCreate.eventFilter.applicationId).toEqual(
      'system'
    );
    expect(result.notificationMailboxCreate.details).toBeDefined();
    expect(result.notificationMailboxCreate.details.test).toEqual('foo');
    mailboxId = result.notificationMailboxCreate.id;
  });

  it('create gql subscription', async () => {
    subscriptionClient
      .request({
        query: `
        subscription onNotification {
          notificationPosted(${mailboxId}) {
            id
            body
            title
            createdDateTime
          }
        }
      `
      })
      .subscribe({
        next({ data }) {
          if (data) {
            expect(data.id).toBeDefined();
          }
        }
      });
  });

  it('get mailboxes of current user', async () => {
    const query = `query {
      notificationMailboxes {
        id
        name
        paused
        lastReceiptDateTime
        latestUpdateDate
        totalCount
        unreadCount
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.notificationMailboxes).toBeDefined();
    expect(result.notificationMailboxes.length > 0).toEqual(true);

    const newMailBox = result.notificationMailboxes.find(
      (mailBox) => mailBox.name === testName
    );
    expect(newMailBox).toBeDefined();
    expect(newMailBox.name).toEqual(testName);
  });

  it('should post notification to user and org', async () => {
    const query = `mutation {
      notificationPost(input: {
        mailboxIds: ["${userId}", ${orgId}]
        body: "Test body"
        contentType: "text/plain"
        flags: [unread, unseen]
        title: "${citestMarker} test title"
        eventName: "testEventName"
        eventType: "testEventType"
      }) {
        id
        title
        body
        contentType
        flags
        applicationId
        eventName
        eventType
      }
    }`;

    const result = await gqlClient.query(query);

    expect(result.notificationPost).toBeDefined();
    expect(result.notificationPost.id).toBeDefined();
    expect(result.notificationPost.title).toEqual(citestMarker + ' test title');
    expect(result.notificationPost.body).toEqual('Test body');
    expect(result.notificationPost.contentType).toEqual('text/plain');
    expect(_.includes(result.notificationPost.flags, 'unread')).toEqual(true);
    expect(_.includes(result.notificationPost.flags, 'unseen')).toEqual(true);
    expect(result.notificationPost.applicationId).toEqual('system');
    expect(result.notificationPost.eventName).toEqual('testEventName');
    expect(result.notificationPost.eventType).toEqual('testEventType');

    notificationId = result.notificationPost.id;
  });

  it('should post notification to mailbox - with flags is null', async () => {
    const query = `mutation {
      notificationPost(input: {
        mailboxIds: ["${mailboxId}"]
        body: "Test body"
        contentType: "text/plain"
        title: "${citestMarker} test title"
      }) {
        id
        flags
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.notificationPost).toBeDefined();
    expect(result.notificationPost.id).toBeDefined();
    expect(result.notificationPost.flags).toBeDefined();
    expect(result.notificationPost.flags.length).toEqual(0);

    notificationId1 = result.notificationPost.id;
  });

  it('should get mailbox by specific array of ids', async () => {
    // elasticsearch takes time to write the notification
    await helpers.sleep(1000);
    const query = `query {
      notificationMailboxes(ids: ["${mailboxId}"]) {
        id
        name
        notifications {
          count
          records {
            id
            title
            body
            contentType
            flags
            createdDateTime
            updatedDateTime
            applicationId
            eventName
            eventType
          }
        }
        eventFilter {
          eventNames
          eventType
          applicationId
          conditions
        }
        notificationTemplate
        details
        paused
        lastReceiptDateTime
        latestUpdateDate
        totalCount
        unreadCount
        limit
        unseenCount
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.notificationMailboxes).toBeDefined();
    expect(result.notificationMailboxes.length).toEqual(1);
    expect(result.notificationMailboxes[0].id).toEqual(mailboxId);
    // elasticsearch takes time to write the event
    //expect(result.notificationMailboxes[0].notifications.count).toEqual(1);
    expect(
      result.notificationMailboxes[0].eventFilter.eventNames.length
    ).toEqual(1);
    expect(result.notificationMailboxes[0].eventFilter.eventType).toEqual(
      'job'
    );
    expect(result.notificationMailboxes[0].details.test).toEqual('foo');
    expect(result.notificationMailboxes[0].paused).toEqual(false);
    expect(result.notificationMailboxes[0].limit).toEqual(100);

    if (result.notificationMailboxes[0].notifications.count > 0) {
      const notifications = _.get(
        result,
        'notificationMailboxes[0].notifications.records'
      );

      for (const notification of notifications) {
        expect(notification).toBeDefined();
        if (notification.id === notificationId) {
          expect(notification).toBeDefined();
          expect(notification.id).toEqual(notificationId);
          expect(notification.title).toEqual('test title');
          expect(notification.body).toEqual('Test body');
          expect(notification.contentType).toEqual('text/plain');
          expect(_.includes(notification.flags, 'unread')).toEqual(true);
          expect(_.includes(notification.flags, 'unseen')).toEqual(true);
          expect(notification.applicationId).toEqual('system');
          expect(notification.eventName).toEqual('testEventName');
          expect(notification.eventType).toEqual('testEventType');
          // Only check the unseenCount when we can get notifications of mailbox from elastic.
          // Since sometimes the tests are too faster than the ES data latency
          expect(result.notificationMailboxes[0].totalCount).toEqual(1);
          expect(result.notificationMailboxes[0].unreadCount).toEqual(1);
          expect(result.notificationMailboxes[0].unseenCount).toEqual(1);
        }
      }
    }
  });

  it('should mark all notifications as read for mailboxes', async () => {
    // elasticsearch takes time to update the notification flags
    await helpers.sleep(500);
    const query = `mutation {
      markAllNotificationsRead(mailboxIds: ["${mailboxId}"]) {
        id
        unreadCount
        notifications {
          count
        }
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.markAllNotificationsRead).toBeDefined();
    expect(result.markAllNotificationsRead[0].id).toEqual(mailboxId);

    if (result.markAllNotificationsRead[0].notifications.count > 0) {
      expect(result.markAllNotificationsRead[0].unreadCount).toEqual(0);
    }
  });

  it('should mark all notifications as seen for mailboxes', async () => {
    // elasticsearch takes time to update the notification flags
    await helpers.sleep(500);
    const query = `mutation {
      markAllNotificationsSeen(mailboxIds: ["${mailboxId}"]) {
        id
        unseenCount
        notifications {
          count
        }
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.markAllNotificationsSeen).toBeDefined();
    expect(result.markAllNotificationsSeen.length).toEqual(1);
    expect(result.markAllNotificationsSeen[0].id).toEqual(mailboxId);

    if (result.markAllNotificationsSeen[0].notifications.count > 0) {
      expect(result.markAllNotificationsSeen[0].unseenCount).toEqual(0);
    }
  });

  it('should get notifications by mailbox id - check notifications with flags null', async () => {
    // elasticsearch takes time to write the notification
    await helpers.sleep(1000);
    const query = `query {
      notificationMailboxes(ids: ["${mailboxId}"]) {
        id
        notifications {
          count
          records {
            id
            flags
          }
        }
        unreadCount
        unseenCount
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.notificationMailboxes).toBeDefined();
    expect(result.notificationMailboxes.length).toEqual(1);
    expect(result.notificationMailboxes[0].id).toEqual(mailboxId);
    expect(result.notificationMailboxes[0].unreadCount).toEqual(0);
    expect(result.notificationMailboxes[0].unseenCount).toEqual(0);

    if (result.notificationMailboxes[0].notifications.count > 0) {
      const notifications = _.get(
        result,
        'notificationMailboxes[0].notifications.records'
      );

      for (const notification of notifications) {
        expect(notification).toBeDefined();
        if (notification.id === notificationId1) {
          expect(notification.flags.length).toEqual(2);
          expect(_.includes(notification.flags, 'read')).toEqual(true);
          expect(_.includes(notification.flags, 'seen')).toEqual(true);
        }
      }
    }
  });

  it('should get notification from user and org', async () => {
    const query = `query oktaOrg {
      me {
        id
        notifications(orderBy: createdDateTime, orderDirection: desc, flags: [unread], limit: 1) {
          count
        }
        organization {
          id
          notifications(orderBy: createdDateTime, orderDirection: desc, flags: [unread], limit: 1) {
            count
          }
        }
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.me).toBeDefined();
    expect(result.me.notifications).toBeDefined();

    if (result.me.notifications.count > 0) {
      expect(result.me.notifications.count).toEqual(1);
      expect(result.me.organization).toBeDefined();
      expect(result.me.organization.notifications).toBeDefined();
      expect(result.me.organization.notifications.count).toEqual(1);
    }
  });

  it('should pause the test mailbox', async () => {
    const query = `mutation {
      notificationMailboxPause(id: "${mailboxId}") {
        id
        paused
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.notificationMailboxPause).toBeDefined();
    expect(result.notificationMailboxPause.id).toEqual(mailboxId);
    expect(result.notificationMailboxPause.paused).toEqual(true);
  });

  it('post to paused mailbox', async () => {
    let query = `mutation {
      notificationPost(input: {
        mailboxIds: ["${mailboxId}"]
        body: "Test body"
        contentType: "text/plain"
        flags: [unread]
        title: "${citestMarker} test title"
      }) {
        id
        title
        body
        contentType
        applicationId
        flags
      }
    }`;

    await expect(gqlClient.query(query)).rejects.toThrow('invalid_input');

    query = `query {
      notificationMailboxes(ids: ["${mailboxId}"]) {
        notifications {
          count
        }
        totalCount
      }
    }`;

    // shouldn't have added the latest message
    const result = await gqlClient.query(query);
    const mailBoxes = _.get(result, 'notificationMailboxes');
    expect(mailBoxes.length).toEqual(1);
    expect(result.notificationMailboxes[0].totalCount).toEqual(1);
    expect(result.notificationMailboxes[0].notifications.count).toEqual(1);
  });

  it('should delete the test mailbox', async () => {
    const query = `mutation {
      notificationMailboxDelete(id: "${mailboxId}") {
        id
        message
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.notificationMailboxDelete).toBeDefined();
    expect(result.notificationMailboxDelete.id).toEqual(mailboxId);
  });

  it('get the deleted test mailbox should empty', async () => {
    const query = `query {
      notificationMailboxes(ids: ["${mailboxId}"]) {
        notifications {
          count
        }
        totalCount
      }
    }`;

    const result = await gqlClient.query(query);
    const mailBoxes = _.get(result, 'notificationMailboxes');
    expect(mailBoxes.length).toEqual(0);
  });
});
