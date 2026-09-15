'use strict';

// VE-24958: coverage for the SubscriptionService resolver factory (notificationPosted subscription).
// graphql-subscriptions' withFilter is mocked so the subscribe/filter functions it wraps are exposed
// directly for assertion; '../error' and '../dal/util' are mocked to keep the test hermetic.
//
// Mutation-checked behaviours:
//   - resolve() extracts payload.notification (not the whole payload)
//   - subscribe guard throws InvalidInput when neither mailbox param is supplied
//   - subscribe subscribes to the NOTIFICATION_POSTED topic via pubsub.asyncIterator
//   - filter matches on notificationMailboxId, on notificationMailboxIds membership, and rejects misses

jest.mock('graphql-subscriptions', () => ({
  // capture the two functions withFilter would compose so we can test them in isolation
  withFilter: (subscribeFn, filterFn) => ({ subscribeFn, filterFn })
}));

jest.mock(
  '../error',
  () => () => ({
    InvalidInput: class InvalidInput extends Error {
      constructor(opts) {
        super(opts && opts.message);
        this.name = 'InvalidInput';
      }
    }
  }),
  { virtual: true }
);

jest.mock(
  '../dal/util',
  () => () => ({
    getDefaultMailboxIdByOrgIdOrUserId: (id) => 'default:' + id
  }),
  { virtual: true }
);

const SubscriptionService = require('./SubscriptionService');

describe('SubscriptionService resolver — notificationPosted', () => {
  let pubsub;
  let service;

  beforeEach(() => {
    pubsub = { asyncIterator: jest.fn(() => 'ASYNC_ITER') };
    service = SubscriptionService({ config: {}, pubsub });
  });

  describe('resolve', () => {
    it('returns the notification off the payload', () => {
      const notification = { id: 'n1' };
      expect(service.notificationPosted.resolve({ notification }, {})).toBe(
        notification
      );
    });

    it('returns undefined when the payload has no notification', () => {
      expect(service.notificationPosted.resolve({}, {})).toBeUndefined();
    });
  });

  describe('subscribe', () => {
    it('throws InvalidInput when neither mailbox param is supplied', () => {
      const { subscribeFn } = service.notificationPosted.subscribe;
      expect(() => subscribeFn(null, {}, null, null)).toThrow(
        /must be defined/
      );
    });

    it('subscribes to the notification_posted topic when a mailbox id is supplied', () => {
      const { subscribeFn } = service.notificationPosted.subscribe;
      const iter = subscribeFn(null, { notificationMailboxId: 'm1' }, null, null);

      expect(pubsub.asyncIterator).toHaveBeenCalledWith('notification_posted');
      expect(iter).toBe('ASYNC_ITER');
    });

    it('subscribes when a mailbox id list is supplied', () => {
      const { subscribeFn } = service.notificationPosted.subscribe;
      subscribeFn(null, { notificationMailboxIds: ['m1', 'm2'] }, null, null);

      expect(pubsub.asyncIterator).toHaveBeenCalledWith('notification_posted');
    });
  });

  describe('filter', () => {
    it('matches when the payload mailbox equals notificationMailboxId', () => {
      const { filterFn } = service.notificationPosted.subscribe;
      expect(
        filterFn({ mailboxId: 'm1' }, { notificationMailboxId: 'm1' })
      ).toBe(true);
    });

    it('matches when the payload mailbox is in notificationMailboxIds', () => {
      const { filterFn } = service.notificationPosted.subscribe;
      expect(
        filterFn({ mailboxId: 'm2' }, { notificationMailboxIds: ['m1', 'm2'] })
      ).toBe(true);
    });

    it('rejects when the payload mailbox matches nothing', () => {
      const { filterFn } = service.notificationPosted.subscribe;
      expect(
        filterFn({ mailboxId: 'other' }, { notificationMailboxId: 'm1' })
      ).toBe(false);
    });
  });
});
