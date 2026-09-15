import _ from 'lodash';
import { createClient, type Client as GraphqlWsClient } from 'graphql-ws';
// @ts-ignore
import NodeWebSocket from 'ws';

import { helpers } from '../../src/helpers';
import { safe } from '../../src/helpers/commonHelper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  NotificationDeliveryType,
  NotificationDateTimeField,
  OrderDirection,
  NotificationFlag
} from '../../src/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

const citestGlobals = globalThis as unknown as { citestMarker?: string };
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';
const testName = `${citestMarker}-notification_mailbox_${Date.now()}`;

describe('citest_email: notification mailbox tests', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;
  let wsClient: GraphqlWsClient;
  let mailboxId: string;
  let notificationId: string;
  let notificationId1: string;
  let userId: string;
  let orgId: string;

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;

    const wsUri = gqlClient.url.replace('http', 'ws');
    const webSocketImpl =
      typeof WebSocket !== 'undefined' ? WebSocket : (NodeWebSocket as any);
    wsClient = createClient({
      url: wsUri,
      webSocketImpl,
      lazy: true, // only connect when there is a subscription
      retryAttempts: 0,
      on: {
        error: (error) => console.error(error)
      }
    });
  }, 30000);

  afterAll(async () => {
    await safe('close subscription client', async () => wsClient.dispose());
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  it('get current user and current organization', async () => {
    // `me`'s generated selection includes `id`/`organization.id`, which is
    // all this test needs - use the SDK.
    const result = await gqlClient.sdk.me();

    const me = result?.data?.me;
    expect(me).toBeDefined();
    expect(me?.id).toBeDefined();
    expect(me?.organization).toBeDefined();
    expect(me?.organization?.id).toBeDefined();

    userId = me!.id;
    orgId = me!.organization!.id;
  });

  it('create a test mailbox', async () => {
    const result = await gqlClient.sdk.notificationMailboxCreate({
      input: {
        name: testName,
        eventFilter: {
          eventNames: ['JobCompleted'],
          eventType: 'job',
          applicationId: 'system',
          delivery: {
            deliveryType: NotificationDeliveryType.NotificationMailbox
          },
          conditions: {
            conditions: [
              {
                field: 'userId',
                value: 'userId',
                operator: 'eq'
              }
            ]
          }
        },
        notificationTemplate: 'Test completed',
        limit: 100,
        details: { test: 'foo' }
      }
    });
    const notificationMailboxData = _.get(
      result,
      'data.notificationMailboxCreate'
    );
    expect(notificationMailboxData).toBeDefined();
    expect(notificationMailboxData?.name).toEqual(testName);
    expect(notificationMailboxData?.id).toBeDefined();
    expect(notificationMailboxData?.eventFilter).toBeDefined();
    expect(notificationMailboxData?.eventFilter?.eventNames?.[0]).toEqual(
      'JobCompleted'
    );
    expect(notificationMailboxData?.eventFilter?.eventType).toEqual('job');
    expect(notificationMailboxData?.eventFilter?.applicationId).toEqual(
      'system'
    );
    expect(notificationMailboxData?.details).toBeDefined();
    expect(notificationMailboxData?.details.test).toEqual('foo');
    mailboxId = notificationMailboxData?.id!;
  });

  it('create gql subscription', async () => {
    wsClient.subscribe(
      {
        query: `
        subscription onNotification {
          notificationPosted(notificationMailboxId: "${mailboxId}") {
            id
            body
            title
            createdDateTime
          }
        }
      `
      },
      {
        next: ({ data }) => {
          if (data) {
            expect((data as any).id).toBeDefined();
          }
        },
        error: (error) => console.error(error),
        complete: () => {}
      }
    );
  });

  it('get mailboxes of current user', async () => {
    const result = await gqlClient.sdk.notificationMailboxes();
    expect(result.data.notificationMailboxes).toBeDefined();
    expect(result.data.notificationMailboxes!.length > 0).toEqual(true);

    const newMailBox = result.data.notificationMailboxes!.find(
      (mailBox: any) => mailBox.name === testName
    );
    expect(newMailBox).toBeDefined();
    expect(newMailBox!.name).toEqual(testName);
  });

  it('should post notification to user and org', async () => {
    const result = await gqlClient.sdk.notificationPost({
      input: {
        mailboxIds: [userId, orgId],
        body: 'Test body',
        contentType: 'text/plain',
        flags: [NotificationFlag.Unread, NotificationFlag.Unseen],
        title: `${citestMarker} test title`,
        eventName: 'testEventName',
        eventType: 'testEventType'
      }
    });

    const notiData = _.get(result, 'data.notificationPost');
    expect(notiData).toBeDefined();
    expect(notiData?.id).toBeDefined();
    expect(notiData?.title).toEqual(citestMarker + ' test title');
    expect(notiData?.body).toEqual('Test body');
    expect(notiData?.contentType).toEqual('text/plain');
    expect(_.includes(notiData?.flags as string[], 'unread')).toEqual(true);
    expect(_.includes(notiData?.flags as string[], 'unseen')).toEqual(true);
    expect(notiData?.applicationId).toEqual('system');
    expect(notiData?.eventName).toEqual('testEventName');
    expect(notiData?.eventType).toEqual('testEventType');

    notificationId = notiData?.id!;
  });

  it('should post notification to mailbox - with flags is null', async () => {
    const result = await gqlClient.sdk.notificationPost({
      input: {
        mailboxIds: [mailboxId],
        body: 'Test body',
        contentType: 'text/plain',
        title: `${citestMarker} test title`
      }
    });

    const notiData = _.get(result, 'data.notificationPost');
    expect(notiData).toBeDefined();
    expect(notiData?.id).toBeDefined();
    expect(notiData?.flags).toBeDefined();
    expect(notiData?.flags!.length).toEqual(0);

    notificationId1 = notiData?.id!;
  });

  it('should get mailbox by specific array of ids', async () => {
    // elasticsearch takes time to write the notification
    await helpers.sleep(1000);
    const result = await gqlClient.sdk.notificationMailboxes({
      ids: [mailboxId]
    });
    expect(result.data.notificationMailboxes).toBeDefined();
    expect(result.data.notificationMailboxes!.length).toEqual(1);
    expect(result.data.notificationMailboxes![0].id).toEqual(mailboxId);
    expect(
      result.data.notificationMailboxes![0].eventFilter!.eventNames!.length
    ).toEqual(1);
    expect(
      result.data.notificationMailboxes![0].eventFilter!.eventType
    ).toEqual('job');
    expect(result.data.notificationMailboxes![0].details.test).toEqual('foo');
    expect(result.data.notificationMailboxes![0].paused).toEqual(false);
    expect(result.data.notificationMailboxes![0].limit).toEqual(100);

    if (result.data.notificationMailboxes![0].notifications!.count! > 0) {
      const notifications = _.get(
        result,
        'data.notificationMailboxes[0].notifications.records',
        []
      );

      for (const notification of notifications) {
        expect(notification).toBeDefined();
        if (notification.id === notificationId) {
          expect(notification).toBeDefined();
          expect(notification.id).toEqual(notificationId);
          expect(notification.title).toEqual('test title');
          expect(notification.body).toEqual('Test body');
          expect(notification.contentType).toEqual('text/plain');
          expect(_.includes(notification.flags as string[], 'unread')).toEqual(
            true
          );
          expect(_.includes(notification.flags as string[], 'unseen')).toEqual(
            true
          );
          expect(notification.applicationId).toEqual('system');
          expect(notification.eventName).toEqual('testEventName');
          expect(notification.eventType).toEqual('testEventType');
          // Only check the unseenCount when we can get notifications of mailbox from elastic.
          // Since sometimes the tests are too faster than the ES data latency
          expect(result.data.notificationMailboxes![0].totalCount).toEqual(1);
          expect(result.data.notificationMailboxes![0].unreadCount).toEqual(1);
          expect(result.data.notificationMailboxes![0].unseenCount).toEqual(1);
        }
      }
    }
  });

  it('should mark all notifications as read for mailboxes', async () => {
    // elasticsearch takes time to update the notification flags
    await helpers.sleep(500);
    const result = await gqlClient.sdk.markAllNotificationsRead({
      mailboxIds: [mailboxId]
    });

    expect(result.data.markAllNotificationsRead).toBeDefined();
    expect(result.data.markAllNotificationsRead![0]!.id).toEqual(mailboxId);

    if (result.data.markAllNotificationsRead![0]!.notifications!.count! > 0) {
      expect(result.data.markAllNotificationsRead![0]!.unreadCount).toEqual(0);
    }
  });

  it('should mark all notifications as seen for mailboxes', async () => {
    // elasticsearch takes time to update the notification flags
    await helpers.sleep(500);
    const result = await gqlClient.sdk.markAllNotificationsSeen({
      mailboxIds: [mailboxId]
    });

    expect(result.data.markAllNotificationsSeen).toBeDefined();
    expect(result.data.markAllNotificationsSeen!.length).toEqual(1);
    expect(result.data.markAllNotificationsSeen![0]!.id).toEqual(mailboxId);

    if (result.data.markAllNotificationsSeen![0]!.notifications!.count! > 0) {
      expect(result.data.markAllNotificationsSeen![0]!.unseenCount).toEqual(0);
    }
  });

  it('should get notifications by mailbox id - check notifications with flags null', async () => {
    // elasticsearch takes time to write the notification
    await helpers.sleep(1000);
    const result = await gqlClient.sdk.notificationMailboxes({
      ids: [mailboxId]
    });
    expect(result.data.notificationMailboxes).toBeDefined();
    expect(result.data.notificationMailboxes!.length).toEqual(1);
    expect(result.data.notificationMailboxes![0].id).toEqual(mailboxId);
    expect(result.data.notificationMailboxes![0].unreadCount).toEqual(0);
    expect(result.data.notificationMailboxes![0].unseenCount).toEqual(0);

    if (result.data.notificationMailboxes![0].notifications!.count! > 0) {
      const notifications = _.get(
        result,
        'data.notificationMailboxes[0].notifications.records',
        []
      );

      for (const notification of notifications) {
        expect(notification).toBeDefined();
        if (notification.id === notificationId1) {
          expect(notification?.flags?.length).toEqual(2);
          expect(_.includes(notification.flags as string[], 'read')).toEqual(
            true
          );
          expect(_.includes(notification.flags as string[], 'seen')).toEqual(
            true
          );
        }
      }
    }
  });

  it('should get notification from user and org', async () => {
    const result = await gqlClient.sdk.me({
      notificationsOrderBy: NotificationDateTimeField.CreatedDateTime,
      notificationsOrderDirection: OrderDirection.Desc,
      notificationsFlags: [NotificationFlag.Unread],
      notificationsLimit: 1
    });

    expect(result.data.me).toBeDefined();
    expect(result.data.me!.notifications).toBeDefined();

    if (result.data.me!.notifications!.count! > 0) {
      expect(result.data.me!.notifications!.count).toEqual(1);
      expect(result.data.me!.organization).toBeDefined();
      expect(result.data.me!.organization!.notifications).toBeDefined();
      expect(result.data.me!.organization!.notifications!.count).toEqual(1);
    }
  });

  it('should pause the test mailbox', async () => {
    const result = await gqlClient.sdk.notificationMailboxPause({
      id: mailboxId
    });

    const mailBox = _.get(result, 'data.notificationMailboxPause');
    expect(mailBox).toBeDefined();
    expect(mailBox?.id).toEqual(mailboxId);
    expect(mailBox?.paused).toEqual(true);
  });

  it('post to paused mailbox', async () => {
    await expect(
      gqlClient.sdk.notificationPost({
        input: {
          mailboxIds: [mailboxId],
          body: 'Test body',
          contentType: 'text/plain',
          flags: [NotificationFlag.Unread],
          title: `${citestMarker} test title`
        }
      })
    ).rejects.toThrow('invalid_input');

    // shouldn't have added the latest message
    const result = await gqlClient.sdk.notificationMailboxes({
      ids: [mailboxId]
    });
    const mailBoxes = _.get(result, 'data.notificationMailboxes');
    expect(mailBoxes?.length).toEqual(1);
    expect(result.data.notificationMailboxes![0].totalCount).toEqual(1);
    expect(result.data.notificationMailboxes![0].notifications!.count).toEqual(
      1
    );
  });

  it('should delete the test mailbox', async () => {
    const result = await gqlClient.sdk.notificationMailboxDelete({
      id: mailboxId
    });
    expect(result.data.notificationMailboxDelete).toBeDefined();
    expect(result.data.notificationMailboxDelete.id).toEqual(mailboxId);
  });

  it('get the deleted test mailbox should empty', async () => {
    const result = await gqlClient.sdk.notificationMailboxes({
      ids: [mailboxId]
    });
    const mailBoxes = _.get(result, 'data.notificationMailboxes');
    expect(mailBoxes?.length).toEqual(0);
  });
});
