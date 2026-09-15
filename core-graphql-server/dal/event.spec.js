const _ = require('lodash');
const moment = require('moment');
const uuid = require('uuid');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const coreDbWrite = serviceContext.dbConnections['core'].write;
const coreDbRead = serviceContext.dbConnections['core'].read;

const dal = require('./event.js')(serviceContext);

jest.mock('fs');
const fs = require('fs');
const existsSyncResults = [];
const readFileSyncResults = [];
fs.existsSync.mockImplementation((path) => {
  return existsSyncResults.shift();
});
fs.writeFileSync.mockImplementation((path, options) => {});
fs.readFileSync.mockImplementation((path) => readFileSyncResults.shift());

jest.mock('request-promise');
const httpResponses = [];
require('request-promise').mockImplementation((uri) => {
  const cur = httpResponses.shift();
  if (cur.error) return Promise.reject(cur.error);
  else return Promise.resolve(cur.data);
});

jest.mock('normalize-url');
const normalizeUrl = require('normalize-url');
const normalizeUrlErrors = [];
normalizeUrl.mockImplementation((url) => {
  const curError = normalizeUrlErrors.shift();
  if (curError) throw Error(curError);
  return url;
});

const eventActionTemplateAliases = {
  template_id: 'id',
  template_name: 'name',
  application_id: 'application',
  created_at_utc: 'created_date_time'
};

function mockSubscribeEventsWithOverride(serviceContext, input = {}) {
  const inputDefaults = {
    verifyAppIds: true,
    conditionsCheck: false,
    overrideResponses: {
      verifyAppIds: {},
      checkExistingEventSubscriptions: [],
      verifyEventExists: {},
      insertSubscriptions: {}
    },
    expectSubscriptionOrgId: null
  };
  const {
    verifyAppIds,
    conditionsCheck,
    overrideResponses,
    expectSubscriptionOrgId
  } = _.merge(inputDefaults, input);
  if (verifyAppIds) {
    if (expectSubscriptionOrgId) {
      // _batchVerifyAppOwnership - serviceContext.dal.organization.getBusinessUnit
      serviceContext.dbConnections['media_platform'].read._push([], false);
    }
    serviceContext.dbConnections['sso'].read._push(
      [
        {
          application_id: 'foo',
          ...overrideResponses.verifyAppIds
        }
      ],
      false,
      ...(expectSubscriptionOrgId
        ? [
            [],
            (sql, params) => {
              expect(params[0]).toEqual(expectSubscriptionOrgId);
              return true;
            }
          ]
        : [])
    );
  }

  // validate subscription hash
  serviceContext.dbConnections['core'].read._push(
    [...overrideResponses.checkExistingEventSubscriptions],
    false // parser does not support ANY() syntax
  );
  // validate event name and event type
  serviceContext.dbConnections['core'].read._push(
    [
      {
        event_name: 'name',
        event_type: 'test',
        application_id: 'foo',
        ...overrideResponses.verifyEventExists
      }
    ],
    false
  );
  if (conditionsCheck) {
    serviceContext.dbConnections['core'].write._push(
      [
        {
          subscription_hash: '2ad26adcf4c4a89905168b38301f246d62312ade',
          event_subscription_id: '123',
          ...overrideResponses.insertSubscriptions
        }
      ],
      false,
      [],
      (sql, params) => {
        expect(params[2]).toEqual(-2);
        return true;
      }
    );
  } else {
    serviceContext.dbConnections['core'].write._push(
      [
        {
          subscription_hash: '2ad26adcf4c4a89905168b38301f246d62312ade',
          event_subscription_id: '123',
          ...overrideResponses.insertSubscriptions
        }
      ],
      ...(expectSubscriptionOrgId
        ? [
            true,
            [],
            (sql, params) => {
              expect(params[3]).toEqual(expectSubscriptionOrgId);
              return true;
            }
          ]
        : [])
    );
  }
}

describe('event.js', function () {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.resetModules();
  });

  describe('#require', function () {
    it('should load module', async function () {
      expect(typeof dal).toEqual('object');
      expect(Object.keys(dal).length).toEqual(23);
      expect(typeof dal.createEvent).toEqual('function');
      expect(typeof dal.updateEvent).toEqual('function');
      expect(typeof dal.events).toEqual('function');
      expect(typeof dal.event).toEqual('function');
      expect(typeof dal.createEventActionTemplate).toEqual('function');
      expect(typeof dal.updateEventActionTemplate).toEqual('function');
      expect(typeof dal.eventActionTemplate).toEqual('function');
      expect(typeof dal.eventActionTemplates).toEqual('function');
      expect(typeof dal.subscribeEvent).toEqual('function');
      expect(typeof dal.unsubscribeEvent).toEqual('function');
      expect(typeof dal.emitEvent).toEqual('function');
      expect(typeof dal.emitSystemEvent).toEqual('function');
      expect(typeof dal.emitInternalCacheUpdate).toEqual('function');
      expect(typeof dal.emitAuditEvent).toEqual('function');
      expect(typeof dal.getAuditEvents).toEqual('function');
      expect(typeof dal.markSubscriptionDeletedByJob).toEqual('function');
    });
  });

  describe('#subscribeEvent', function () {
    it('should subscribe, with app and args', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'foo'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([
        {
          event_name: 'name',
          event_type: 'test'
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          event_subscription_id: '123'
        }
      ]);
      const res = await dal.subscribeEvent(mockUtil.makeContext(), {
        input: {
          eventName: 'name',
          eventType: 'test',
          application: 'foo',
          organizationId: '7682',
          delivery: {
            name: 'Email',
            params: {
              address: 'me@veritone.com'
            }
          }
        }
      });
      expect(res).toEqual('123');
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });

    it('should subscribe, with * app and args', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].write._push([
        {
          event_subscription_id: '123'
        }
      ]);
      const res = await dal.subscribeEvent(mockUtil.makeContext(), {
        input: {
          eventName: 'name',
          eventType: 'test',
          application: '*',
          organizationId: '7682',
          delivery: {
            name: 'Email',
            params: {
              address: 'me@veritone.com'
            }
          }
        }
      });
      expect(res).toEqual('123');
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });
    it('should subscribe, with internal app and args', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([
        {
          event_name: 'name',
          event_type: 'test'
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          event_subscription_id: '123'
        }
      ]);
      const res = await dal.subscribeEvent(mockUtil.makeContext(), {
        input: {
          eventName: 'name',
          eventType: 'test',
          application: 'system',
          organizationId: '7682',
          delivery: {
            name: 'Email',
            params: {
              address: 'me@veritone.com'
            }
          }
        }
      });
      expect(res).toEqual('123');
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });
    it('should subscribe, with type only', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([
        { event_name: 'name', event_type: 'test' }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          event_subscription_id: '123'
        }
      ]);
      const res = await dal.subscribeEvent(mockUtil.makeContext(), {
        input: {
          eventType: 'test',
          application: '123',
          organizationId: '7682',
          delivery: {
            name: 'Email',
            params: {
              address: 'me@veritone.com'
            }
          }
        }
      });
      expect(res).toEqual('123');
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });

    it('should subscribe, with type only and existing event', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        { event_subscription_id: '234' }
      ]);
      const res = await dal.subscribeEvent(mockUtil.makeContext(), {
        input: {
          eventType: 'test',
          application: '123',
          organizationId: '7682',
          delivery: {
            name: 'Email',
            params: {
              address: 'me@veritone.com'
            }
          }
        }
      });
      expect(res).toEqual('234');
    });

    it('should subscribe, with webhook delivery data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        { event_subscription_id: '234' }
      ]);
      const res = await dal.subscribeEvent(mockUtil.makeContext(), {
        input: {
          eventType: 'test',
          application: '123',
          organizationId: '7682',
          delivery: {
            name: 'Webhook',
            params: {
              encoding: 'json',
              url: 'http://localhost'
            }
          }
        }
      });
      expect(res).toEqual('234');
    });

    it('should subscribe, with webhook delivery data including headers', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        { event_subscription_id: '234' }
      ]);
      const res = await dal.subscribeEvent(mockUtil.makeContext(), {
        input: {
          eventType: 'test',
          application: '123',
          organizationId: '7682',
          delivery: {
            name: 'Webhook',
            params: {
              encoding: 'json',
              url: 'http://localhost',
              headers:
                '{"Authorization": "Bearer sso-token", "content-type": "application/json"}'
            }
          }
        }
      });
      expect(res).toEqual('234');
    });

    it('should error on bad webhook headers', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      await expect(
        async () =>
          await dal.subscribeEvent(mockUtil.makeContext(), {
            input: {
              eventType: 'test',
              application: '123',
              organizationId: '7682',
              delivery: {
                name: 'Webhook',
                params: {
                  encoding: 'json',
                  url: 'http://localhost',
                  headers:
                    '{"test": "invalid", "Authorization": {"test": "Bearer sso-token"}}'
                }
              }
            }
          })
      ).rejects.toThrow(
        'delivery param is not compatible with the provided target Webhook'
      );
    });

    it('should subscribe, with SMS delivery data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        { event_subscription_id: '234' }
      ]);
      const res = await dal.subscribeEvent(mockUtil.makeContext(), {
        input: {
          eventType: 'test',
          application: '123',
          organizationId: '7682',
          delivery: {
            name: 'SMS',
            params: {
              number: '1-541-754-3010'
            }
          }
        }
      });
      expect(res).toEqual('234');
    });

    it('should error on bad target data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      try {
        const res = await dal.subscribeEvent(mockUtil.makeContext(), {
          input: {
            eventType: 'test',
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'Email',
              params: {
                addres: 'me@veritone.com' // wrong key
              }
            }
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error on bad delivery number SMS data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      try {
        const res = await dal.subscribeEvent(mockUtil.makeContext(), {
          input: {
            eventType: 'test',
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'SMS',
              params: {
                number: 'T12345' // wrong number
              }
            }
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error on bad delivery data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      try {
        const res = await dal.subscribeEvent(mockUtil.makeContext(), {
          input: {
            eventType: 'test',
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'test',
              params: {
                number: 'test'
              }
            }
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error on bad webhook delivery data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      try {
        const res = await dal.subscribeEvent(mockUtil.makeContext(), {
          input: {
            eventType: 'test',
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'Webhook',
              params: {
                number: 'test'
              }
            }
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error on bad webhook url delivery data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        { event_subscription_id: 'bf072ffa-b99f-4c97-a5f7-dc3f9f1462e6' }
      ]);
      normalizeUrlErrors.push('error');
      try {
        const res = await dal.subscribeEvent(mockUtil.makeContext(), {
          input: {
            eventType: 'test',
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'Webhook',
              params: {
                url: 'test'
              }
            }
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error on empty event type', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      try {
        const res = await dal.subscribeEvent(mockUtil.makeContext(), {
          input: {
            eventName: 'name',
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'Webhook',
              params: {
                url: 'test'
              }
            }
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error if event does not exist for current configuration', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([]);
      try {
        const res = await dal.subscribeEvent(mockUtil.makeContext(), {
          input: {
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'SMS',
              params: {
                number: '1-541-754-3010'
              }
            }
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error on bad SMS delivery data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      try {
        const res = await dal.subscribeEvent(mockUtil.makeContext(), {
          input: {
            eventType: 'test',
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'SMS',
              params: {}
            }
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should subscribe, with conditions', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].write._push([
        {
          event_subscription_id: '123'
        }
      ]);
      const res = await dal.subscribeEvent(mockUtil.makeContext(), {
        input: {
          eventName: 'name',
          eventType: 'test',
          application: '*',
          organizationId: '7682',
          conditions: {
            conditions: [{ operator: 'eq', field: 'foo', value: 0 }]
          },
          delivery: {
            name: 'Email',
            params: {
              address: 'me@veritone.com'
            }
          }
        }
      });
      expect(res).toEqual('123');
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });

    it('should throw error if input application is invalid with Application scope', async function () {
      let err;
      try {
        await dal.subscribeEvent(mockUtil.makeContext(), {
          input: {
            eventName: 'name',
            application: '*',
            scope: 'Application',
            delivery: {
              name: 'Webhook',
              params: {
                url: 'test'
              }
            }
          }
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });
    it('should subscribe with Application scope', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'c2bf5d9e-6919-4be3-afdb-f7fcaf439d00' }],
        false
      );
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([
        {
          event_name: 'name',
          event_type: 'test'
        }
      ]);
      serviceContext.dbConnections['core'].write._push(
        [
          {
            event_subscription_id: '123'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[2]).toEqual(-2);
          return true;
        }
      );
      const res = await dal.subscribeEvent(mockUtil.makeContext(), {
        input: {
          eventName: 'name',
          eventType: 'test',
          application: 'c2bf5d9e-6919-4be3-afdb-f7fcaf439d00',
          organizationId: '7682',
          scope: 'Application',
          conditions: {
            conditions: [{ operator: 'eq', field: 'foo', value: 0 }]
          },
          delivery: {
            name: 'Email',
            params: {
              address: 'me@veritone.com'
            }
          }
        }
      });
      expect(res).toEqual('123');
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });
  });

  describe('#batchSubscribeEvent', function () {
    it('should subscribe, with app and args', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          insertSubscriptions: {
            subscription_hash: '04d9e01cad751bf1b6d34e144911c8961a6f0afc'
          }
        }
      });

      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventName: 'name',
            eventType: 'test',
            application: 'foo',
            organizationId: '7682',
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['123']);
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });

    it('should subscribe, with * app and args', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          insertSubscriptions: {
            subscription_hash: 'ea61ef80a7969a547f003f614e491cc0be30e5e2'
          }
        }
      });
      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventName: 'name',
            eventType: 'test',
            application: '*',
            organizationId: '7682',
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['123']);
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });
    it('should subscribe, with internal app and args', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        verifyAppIds: false,
        overrideResponses: {
          verifyEventExists: {
            application_id: 'system'
          },
          insertSubscriptions: {
            subscription_hash: '056df7ef0e587406110394a6da27a341b7fce495'
          }
        }
      });
      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventName: 'name',
            eventType: 'test',
            application: 'system',
            organizationId: '7682',
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['123']);
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });
    it('should subscribe, with type only', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          verifyAppIds: { application_id: '123' },
          verifyEventExists: { application_id: '123' },
          insertSubscriptions: {
            subscription_hash: 'e66ead31ade50d091c90e68e09e0448e98849b5e'
          }
        }
      });

      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventName: 'name',
            eventType: 'test',
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['123']);
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });

    it('should subscribe, with type only and existing event', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          verifyAppIds: { application_id: '123' },
          checkExistingEventSubscriptions: [
            {
              event_subscription_id: '234',
              subscription_hash: 'e66ead31ade50d091c90e68e09e0448e98849b5e'
            }
          ],
          verifyEventExists: { application_id: '123' },
          insertSubscriptions: {
            subscription_hash: 'e66ead31ade50d091c90e68e09e0448e98849b5e'
          }
        }
      });
      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventName: 'name',
            eventType: 'test',
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['234']);
    });

    it('should subscribe, with webhook delivery data', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          verifyAppIds: { application_id: '123' },
          verifyEventExists: { application_id: '123' },
          insertSubscriptions: {
            subscription_hash: '8c7730d2b9180aadb89c3800e953412e108ff1bc'
          }
        }
      });
      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventType: 'test',
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'Webhook',
              params: {
                encoding: 'json',
                url: 'http://localhost'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['123']);
    });

    it('should subscribe, with SMS delivery data', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          verifyAppIds: { application_id: '123' },
          verifyEventExists: { application_id: '123' },
          insertSubscriptions: {
            subscription_hash: '4a405c47e60b3ad44d644db870cf00e65a5ebd89'
          }
        }
      });
      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventName: 'name',
            eventType: 'test',
            application: '123',
            organizationId: '7682',
            delivery: {
              name: 'SMS',
              params: {
                number: '1-541-754-3010'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['123']);
    });

    it('should error on bad target data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      try {
        const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              eventName: 'name',
              eventType: 'test',
              application: '123',
              organizationId: '7682',
              delivery: {
                name: 'Email',
                params: {
                  addres: 'me@veritone.com' // wrong key
                }
              }
            }
          ]
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'delivery param is not compatible with the provided targets Email'
        );
      }
    });

    it('should error on bad delivery number SMS data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      try {
        const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              eventName: 'name',
              eventType: 'test',
              application: '123',
              organizationId: '7682',
              delivery: {
                name: 'SMS',
                params: {
                  number: 'T12345' // wrong number
                }
              }
            }
          ]
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'delivery param is not compatible with the provided targets SMS'
        );
      }
    });

    it('should error on bad delivery data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      try {
        const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              eventName: 'name',
              eventType: 'test',
              application: '123',
              organizationId: '7682',
              delivery: {
                name: 'test',
                params: {
                  number: 'test'
                }
              }
            }
          ]
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'delivery param is not compatible with the provided targets test'
        );
      }
    });

    it('should error on bad webhook delivery data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: 123 }],
        false
      );
      try {
        const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              eventName: 'name',
              eventType: 'test',
              application: '123',
              organizationId: '7682',
              delivery: {
                name: 'Webhook',
                params: {
                  number: 'test'
                }
              }
            }
          ]
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'delivery param is not compatible with the provided targets Webhook'
        );
      }
    });

    it('should error on bad webhook url delivery data', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          verifyAppIds: { application_id: '123' },
          verifyEventExists: { application_id: '123' },
          insertSubscriptions: {
            subscription_hash: '4bb3906fb94d6833b333181882dec7828c6cb805'
          }
        }
      });
      try {
        const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              eventName: 'name',
              eventType: 'test',
              application: '123',
              organizationId: '7682',
              delivery: {
                name: 'Webhook',
                params: {
                  url: ''
                }
              }
            }
          ]
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'delivery param is not compatible with the provided targets Webhook'
        );
      }
    });

    it('should error on empty event type', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      try {
        const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              eventName: 'name',
              application: '123',
              organizationId: '7682',
              delivery: {
                name: 'Webhook',
                params: {
                  url: 'test'
                }
              }
            }
          ]
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error if event does not exist for current configuration', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      serviceContext.dbConnections['core'].read._push([], false);
      serviceContext.dbConnections['core'].read._push([]);
      try {
        const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              application: '123',
              organizationId: '7682',
              delivery: {
                name: 'SMS',
                params: {
                  number: '1-541-754-3010'
                }
              }
            }
          ]
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error on bad SMS delivery data', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: '123' }],
        false
      );
      try {
        const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              eventType: 'test',
              application: '123',
              organizationId: '7682',
              delivery: {
                name: 'SMS',
                params: {}
              }
            }
          ]
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should subscribe, with conditions', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          verifyAppIds: { application_id: '123' },
          verifyEventExists: { application_id: '123' },
          insertSubscriptions: {
            subscription_hash: 'add8d532d816f91c428186510731fecd3a26aa99'
          }
        }
      });

      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventName: 'name',
            eventType: 'test',
            application: '*',
            organizationId: '7682',
            conditions: {
              conditions: [{ operator: 'eq', field: 'foo', value: 0 }]
            },
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['123']);
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });

    it('should throw error if input application is invalid with Application scope', async function () {
      let err;
      try {
        await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              eventName: 'name',
              application: '*',
              scope: 'Application',
              delivery: {
                name: 'Webhook',
                params: {
                  url: 'test'
                }
              }
            }
          ]
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });
    it('should subscribe with Application scope', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        conditionsCheck: true,
        overrideResponses: {
          verifyAppIds: {
            application_id: 'c2bf5d9e-6919-4be3-afdb-f7fcaf439d00'
          },
          verifyEventExists: {
            application_id: 'c2bf5d9e-6919-4be3-afdb-f7fcaf439d00'
          },
          insertSubscriptions: {
            subscription_hash: 'af2f48614450077c31c2c2f3de5b43be1b6f6900'
          }
        }
      });

      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventName: 'name',
            eventType: 'test',
            application: 'c2bf5d9e-6919-4be3-afdb-f7fcaf439d00',
            organizationId: '7682',
            scope: 'Application',
            conditions: {
              conditions: [{ operator: 'eq', field: 'foo', value: 0 }]
            },
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['123']);
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });

    it('should subscribe to multiple events', async () => {
      // Mock the necessary dependencies and setup test data
      const context = mockUtil.makeContext();
      const args = {
        input: [
          {
            eventName: 'event1',
            eventType: 'type1',
            application: 'app1',
            organizationId: 'org1',
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          },
          {
            eventName: 'event2',
            eventType: 'type2',
            application: 'app2',
            organizationId: 'org2',
            delivery: {
              name: 'Webhook',
              params: {
                url: 'http://localhost'
              }
            }
          }
        ]
      };

      // Mock the database queries
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'app1'
          },
          {
            application_id: 'app2'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            event_subscription_id: '123',
            subscription_hash: '5c178accabd7523954d8c3231d3ba37d17519551'
          }
        ],
        false // parser does not support ANY() syntax
      );
      serviceContext.dbConnections['core'].read._push([
        {
          event_name: 'event1',
          event_type: 'type1',
          application_id: 'app1'
        },
        {
          event_name: 'event2',
          event_type: 'type2',
          application_id: 'app2'
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          subscription_hash: '13cb44f1efc63f9ee7b411febef24b3c44f23729',
          event_subscription_id: '456'
        }
      ]);

      // Call the function
      const result = await dal.batchSubscribeEvent(context, args);

      // Assertions
      expect(result).toEqual(['123', '456']);
    });

    it('should subscribe with app, args.organizationId and supplied eventId', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          insertSubscriptions: {
            subscription_hash: 'cd09d4ee831451c3f46e12e87939656189ba9cf2',
            event_subscription_id: '234'
          }
        },
        expectSubscriptionOrgId: 1
      });

      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            id: '234',
            eventName: 'name',
            eventType: 'test',
            application: 'foo',
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          }
        ],
        organizationId: 1
      });
      expect(res).toEqual(['234']);
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });

    it('should subscribe, with app and event subscription that contains an empty conditions object', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          insertSubscriptions: {
            subscription_hash: '6e2e6b4d84ad3c937ca4e41eff8236017516fd44'
          }
        }
      });

      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventName: 'name',
            eventType: 'test',
            application: 'foo',
            organizationId: '7682',
            conditions: {},
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['123']);
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });

    it('should throw error, for event subscription that contains a conditions array instead of an object', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          insertSubscriptions: {
            subscription_hash: '6e2e6b4d84ad3c937ca4e41eff8236017516fd44'
          }
        }
      });

      try {
        const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              eventName: 'name',
              eventType: 'test',
              application: 'foo',
              organizationId: '7682',
              conditions: [],
              delivery: {
                name: 'Email',
                params: {
                  address: 'me@veritone.com'
                }
              }
            }
          ]
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'subscription conditions error: root conditions object cannot be an array'
        );
      }
    });

    it('should throw error, for event subscription that contains an empty sub conditions array for an "and" operator', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          insertSubscriptions: {
            subscription_hash: '2da1a0f5c9b8dbef19fa7d6729e6e90e144b531d'
          }
        }
      });

      try {
        const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              eventName: 'name',
              eventType: 'test',
              application: 'foo',
              organizationId: '7682',
              conditions: { operator: 'and', conditions: [] },
              delivery: {
                name: 'Email',
                params: {
                  address: 'me@veritone.com'
                }
              }
            }
          ]
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'subscription conditions error: "and" operator is missing a sub-conditions array'
        );
      }
    });

    it('should throw error, for event subscription that contains an empty sub conditions array for an "or" operator', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          insertSubscriptions: {
            subscription_hash: '2da1a0f5c9b8dbef19fa7d6729e6e90e144b531d'
          }
        }
      });

      try {
        const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
          input: [
            {
              eventName: 'name',
              eventType: 'test',
              application: 'foo',
              organizationId: '7682',
              conditions: { operator: 'or', conditions: [] },
              delivery: {
                name: 'Email',
                params: {
                  address: 'me@veritone.com'
                }
              }
            }
          ]
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'subscription conditions error: "or" operator is missing a sub-conditions array'
        );
      }
    });

    it('should subscribe, with app and event subscription that contains sub-conditions for the "and" root operator', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          insertSubscriptions: {
            subscription_hash: 'c913ed7ecdb0e434f8fe38b64a5f285781e9c168'
          }
        }
      });

      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventName: 'name',
            eventType: 'test',
            application: 'foo',
            organizationId: '7682',
            conditions: {
              operator: 'and',
              conditions: [
                {
                  operator: 'eq',
                  field: 'foo',
                  value: 0
                },
                {
                  operator: 'gt',
                  field: 'bar',
                  value: 10
                }
              ]
            },
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['123']);
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });

    it('should subscribe, with app and event subscription that contains sub-conditions for the "or" root operator', async function () {
      mockSubscribeEventsWithOverride(serviceContext, {
        overrideResponses: {
          insertSubscriptions: {
            subscription_hash: 'bdd501cc79d3ab0dfb0de428f54f96f890a3997a'
          }
        }
      });

      const res = await dal.batchSubscribeEvent(mockUtil.makeContext(), {
        input: [
          {
            eventName: 'name',
            eventType: 'test',
            application: 'foo',
            organizationId: '7682',
            conditions: {
              operator: 'or',
              conditions: [
                {
                  operator: 'eq',
                  field: 'foo',
                  value: 0
                },
                {
                  operator: 'gt',
                  field: 'bar',
                  value: 10
                }
              ]
            },
            delivery: {
              name: 'Email',
              params: {
                address: 'me@veritone.com'
              }
            }
          }
        ]
      });
      expect(res).toEqual(['123']);
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });
  });

  describe('#emitEvent', function () {
    it('should throw error if no event def found for app', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          eventName: 'event name',
          eventType: 'event type',
          application: { id: 'applicationId' },
          payload: { foo: 'bar' }
        }
      };

      serviceContext.dbConnections['core'].read._push([], false);

      try {
        res = await dal.emitEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should throw error if passing protoFile content not match "message [y]"', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          eventName: 'eventName',
          eventType: 'eventType',
          application: 'applicationId',
          payload: { foo: 'bar' }
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [{ schema_data: 'data', schema_hash: 'hash' }],
        false
      );
      existsSyncResults.push(false);
      existsSyncResults.push(false);
      existsSyncResults.push(true);
      readFileSyncResults.push('message2019/path');

      try {
        res = await dal.emitEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(res).toBeUndefined();
    });

    // VE-24739: CWE-73 path traversal — canonicalization+bounds-check rejects paths escaping definitionPath
    it('should reject path traversal in application that escapes definitionPath (VE-24739)', async function () {
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          eventName: 'eventName',
          eventType: 'eventType',
          application: '../escape',
          payload: `{ "user_name": "abc" }`
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            schema_data: `message LoginSucceeded { string user_name = 10; }`,
            schema_hash:
              '074b02614f0216aa7d487c92f2759c9072a904e3721ab7fdfacba4134557f6ac'
          }
        ],
        false
      );

      fs.existsSync.mockClear();
      await expect(dal.emitEvent(ctx, args)).rejects.toMatchObject({
        message: expect.stringContaining('Invalid')
      });
      // fs.existsSync must never be called for a path outside definitionPath
      const existsSyncPaths = fs.existsSync.mock.calls.map((c) => c[0]);
      existsSyncPaths.forEach((p) => {
        expect(p).not.toMatch(/\.\./);
      });
    });

    // VE-25591: CWE-73 path traversal — symmetric eventType leg of the VE-24739 guard
    it('should reject path traversal in eventType that escapes definitionPath (VE-25591)', async function () {
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          eventName: 'eventName',
          eventType: '../escape',
          application: 'applicationId',
          payload: `{ "user_name": "abc" }`
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            schema_data: `message LoginSucceeded { string user_name = 10; }`,
            schema_hash:
              '074b02614f0216aa7d487c92f2759c9072a904e3721ab7fdfacba4134557f6ac'
          }
        ],
        false
      );

      fs.existsSync.mockClear();
      await expect(dal.emitEvent(ctx, args)).rejects.toMatchObject({
        message: expect.stringContaining('Invalid')
      });
      // fs.existsSync must never be called for a path outside definitionPath
      const existsSyncPaths = fs.existsSync.mock.calls.map((c) => c[0]);
      existsSyncPaths.forEach((p) => {
        expect(p).not.toMatch(/\.\./);
      });
    });

    it('should verify app ownership with application = "*"', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          eventName: 'eventName',
          eventType: 'eventType',
          application: '*',
          payload: `{ "user_name": "abc" }`
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            schema_data: `message LoginSucceeded  {
                string user_name = 10;
            }`,
            schema_hash:
              '074b02614f0216aa7d487c92f2759c9072a904e3721ab7fdfacba4134557f6ac'
          }
        ],
        false
      );
      existsSyncResults.push(false);
      existsSyncResults.push(false);
      existsSyncResults.push(true);
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message LoginSucceeded  {
            string user_name = 10;
        }`);
      // push for protobufjs reading content file
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message LoginSucceeded  {
            string user_name = 10;
        }`);

      try {
        res = await dal.emitEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('12345');
      expect(res.decoder).toEqual('json');
    });

    it('should throw error if unable to find application', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          eventName: 'eventName',
          eventType: 'eventType',
          application: 'application1',
          payload: `{ "user_name": "abc" }`
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            schema_data: `message LoginSucceeded  {
                string user_name = 10;
            }`,
            schema_hash:
              '074b02614f0216aa7d487c92f2759c9072a904e3721ab7fdfacba4134557f6ac'
          }
        ],
        false
      );
      existsSyncResults.push(false);
      existsSyncResults.push(false);
      existsSyncResults.push(true);
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message LoginSucceeded  {
            string user_name = 10;
        }`);
      //Get Application
      serviceContext.dbConnections['sso'].write._push([], false);

      try {
        res = await dal.emitEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should emit event with valid application', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          eventName: 'eventName',
          eventType: 'eventType',
          application: 'application',
          payload: `{ "user_name": "abc" }`
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            schema_data: `message LoginSucceeded  {
                string user_name = 10;
            }`,
            schema_hash:
              '074b02614f0216aa7d487c92f2759c9072a904e3721ab7fdfacba4134557f6ac'
          }
        ],
        false
      );
      existsSyncResults.push(true);
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message LoginSucceeded  {
            string user_name = 10;
        }`);
      //Get Application
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: 'applicationId' }],
        false
      );
      // push for protobufjs reading content file
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message LoginSucceeded  {
            string user_name = 10;
        }`);

      try {
        res = await dal.emitEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('12345');
      expect(res.decoder).toEqual('json');
    });

    it('should emit event and build core with api token', async function () {
      let res, err;
      const ctx = mockUtil.getGraphQLContext(null, 'api_org');
      const args = {
        input: {
          eventName: 'eventName',
          eventType: 'eventType',
          application: 'application',
          payload: `{ "user_name": "abc" }`
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            schema_data: `message LoginSucceeded  {
                string user_name = 10;
            }`,
            schema_hash:
              '074b02614f0216aa7d487c92f2759c9072a904e3721ab7fdfacba4134557f6ac'
          }
        ],
        false
      );
      existsSyncResults.push(false);
      existsSyncResults.push(false);
      existsSyncResults.push(true);
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message LoginSucceeded  {
            string user_name = 10;
        }`);
      //Get Application
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: 'applicationId' }],
        false
      );
      // push for protobufjs reading content file
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message LoginSucceeded  {
            string user_name = 10;
        }`);

      try {
        res = await dal.emitEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.decoder).toEqual('json');
    });

    it('should emit event and build core with invalid context', async function () {
      let res, err;
      const context = { userInfo: {} };
      const args = {
        input: {
          eventName: 'eventName',
          eventType: 'eventType',
          application: 'application',
          payload: `{ "user_name": "abc" }`
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            schema_data: `message LoginSucceeded  {
                string user_name = 10;
            }`,
            schema_hash:
              '074b02614f0216aa7d487c92f2759c9072a904e3721ab7fdfacba4134557f6ac'
          }
        ],
        false
      );
      existsSyncResults.push(false);
      existsSyncResults.push(false);
      existsSyncResults.push(true);
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message LoginSucceeded  {
            string user_name = 10;
        }`);
      //Get Application
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: 'applicationId' }],
        false
      );
      // push for protobufjs reading content file
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message LoginSucceeded  {
            string user_name = 10;
        }`);

      try {
        res = await dal.emitEvent(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.decoder).toEqual('json');
    });

    it('should emit event if payload is invalid json string', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          eventName: 'eventName',
          eventType: 'eventType',
          application: 'application',
          payload: ''
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            schema_data: `message Test1 {
              optional int32 a = 1;
            }`,
            schema_hash:
              '074b02614f0216aa7d487c92f2759c9072a904e3721ab7fdfacba4134557f6ac'
          }
        ],
        false
      );
      existsSyncResults.push(false);
      existsSyncResults.push(false);
      existsSyncResults.push(true);
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message Test1 {
          optional int32 a = 1;
        }`);
      //Get Application
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: 'applicationId' }],
        false
      );
      // push for protobufjs reading content file
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message Test1 {
          optional int32 a = 1;
        }`);

      try {
        res = await dal.emitEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('12345');
      expect(res.decoder).toEqual('protobuf');
    });

    it('should throw error if unable to emit event', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          eventName: 'eventName',
          eventType: 'eventType',
          application: 'application',
          payload: ''
        }
      };
      _.set(serviceContext, 'messagingV2', null);
      const dalNew = require('./event.js')(serviceContext);

      serviceContext.dbConnections['core'].read._push(
        [
          {
            schema_data: `message Test1 {
              optional int32 a = 1;
            }`,
            schema_hash:
              '074b02614f0216aa7d487c92f2759c9072a904e3721ab7fdfacba4134557f6ac'
          }
        ],
        false
      );
      existsSyncResults.push(false);
      existsSyncResults.push(false);
      existsSyncResults.push(true);
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message Test1 {
          optional int32 a = 1;
        }`);
      //Get Application
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: 'applicationId' }],
        false
      );
      // push for protobufjs reading content file
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message Test1 {
          optional int32 a = 1;
        }`);

      try {
        res = await dalNew.emitEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('service_unavailable');
      expect(res).toBeUndefined();
    });

    it('should throw error if invalid payload', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          eventName: 'eventName',
          eventType: 'eventType',
          application: 'application',
          payload: `123`
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            schema_data: `message LoginSucceeded  {
                string user_name = 10;
            }`,
            schema_hash:
              '074b02614f0216aa7d487c92f2759c9072a904e3721ab7fdfacba4134557f6ac'
          }
        ],
        false
      );
      existsSyncResults.push(false);
      existsSyncResults.push(false);
      existsSyncResults.push(true);
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message LoginSucceeded  {
            string user_name = 10;
        }`);
      //Get Application
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: 'applicationId' }],
        false
      );
      // push for protobufjs reading content file
      readFileSyncResults.push(`
        syntax = "proto3";
        package events;
        message LoginSucceeded  {
            string user_name = 10;
        }`);

      try {
        res = await dal.emitEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });
  });

  describe('#createEvent', function () {
    it('should throw error NotAllowed if application is system', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = { input: { application: 'system' } };

      try {
        res = await dal.createEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
      expect(res).toBeUndefined();
    });
    it('should throw error InvalidInput if eventId is invalid', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          id: 'eventId',
          application: '*',
          eventName: 'eventName',
          eventType: 'eventType',
          schemaData: '',
          description: 'description',
          public: true
        },
        organizationId: 7682
      };

      try {
        res = await dal.createEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should create event with empty schemaData', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          application: '*',
          eventName: 'eventName',
          eventType: 'eventType',
          schemaData: '',
          description: 'description',
          public: true
        },
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push([
        {
          event_id: 'eventId',
          created_at_utc: '2019-06-03 10:56:16',
          application_id: '*'
        }
      ]);

      try {
        res = await dal.createEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('eventId');
      expect(res.createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res.application).toEqual('*');
    });

    it('should create event with schemaData', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          application: '*',
          eventName: 'eventName',
          eventType: 'eventType',
          schemaData: `message Custom {
            string payload = 5;
          }`,
          description: 'description',
          public: true
        },
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push([
        {
          event_id: 'eventId',
          created_at_utc: '2019-06-03 10:56:16',
          application_id: '*'
        }
      ]);

      try {
        res = await dal.createEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('eventId');
      expect(res.createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res.application).toEqual('*');
    });

    it('should create event with orgLess token', async function () {
      let res, err;
      const ctx = mockUtil.makeContext({ authType: 'api_internal' });
      const inputEventId = uuid.v4();
      const args = {
        input: {
          id: inputEventId,
          application: '*',
          eventName: 'eventName',
          eventType: 'eventType',
          schemaData: '',
          description: 'description',
          public: true
        },
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push(
        [
          {
            event_id: inputEventId,
            created_at_utc: '2019-06-03 10:56:16',
            application_id: '*'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[0]).toEqual(inputEventId);
          return true;
        }
      );

      try {
        res = await dal.createEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual(inputEventId);
      expect(res.createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res.application).toEqual('*');
    });
  });

  describe('#batchCreateEvent', function () {
    it('should throw error - system is not allowed as application', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: [{ application: 'system' }]
      };

      try {
        res = await dal.batchCreateEvents(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
    });

    it('should throw error - no empty input', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: []
      };

      try {
        res = await dal.batchCreateEvents(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
    });

    it('should throw error - no similar name and type input', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: [
          {
            application: 'x',
            eventName: 'test',
            eventType: '1'
          },
          {
            application: 'x',
            eventName: 'test',
            eventType: '1'
          }
        ]
      };

      try {
        res = await dal.batchCreateEvents(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
    });
    it('should throw error InvalidInput if eventId is invalid', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: [
          {
            id: 'eventId',
            application: '*',
            eventName: 'eventName',
            eventType: 'eventType',
            schemaData: '',
            description: 'description',
            public: true
          }
        ],
        organizationId: 7682
      };

      try {
        res = await dal.batchCreateEvents(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should create event with empty schemaData', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: [
          {
            application: '*',
            eventName: 'eventName',
            eventType: 'eventType',
            schemaData: '',
            description: 'description',
            public: true
          }
        ],
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push([
        {
          event_id: 'eventId',
          created_at_utc: '2019-06-03 10:56:16',
          application_id: '*'
        }
      ]);

      try {
        res = await dal.batchCreateEvents(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res[0].id).toEqual('eventId');
      expect(res[0].createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res[0].application).toEqual('*');
    });

    it('should create event with schemaData', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: [
          {
            application: '*',
            eventName: 'eventName',
            eventType: 'eventType',
            schemaData: `message Custom {
              string payload = 5;
            }`,
            description: 'description',
            public: true
          }
        ],
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push([
        {
          event_id: 'eventId',
          created_at_utc: '2019-06-03 10:56:16',
          application_id: '*'
        }
      ]);

      try {
        res = await dal.batchCreateEvents(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res[0].id).toEqual('eventId');
      expect(res[0].createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res[0].application).toEqual('*');
    });

    it('should create event with orgLess token', async function () {
      let res, err;
      const ctx = mockUtil.makeContext({ authType: 'api_internal' });
      const inputEventId = uuid.v4();
      const args = {
        input: [
          {
            id: inputEventId,
            application: '*',
            eventName: 'eventName',
            eventType: 'eventType',
            schemaData: '',
            description: 'description',
            public: true
          }
        ],
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push(
        [
          {
            event_id: inputEventId,
            created_at_utc: '2019-06-03 10:56:16',
            application_id: '*'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[0]).toEqual(inputEventId);
          return true;
        }
      );

      try {
        res = await dal.batchCreateEvents(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res[0].id).toEqual(inputEventId);
      expect(res[0].createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res[0].application).toEqual('*');
    });
  });

  describe('#updateEvent', function () {
    it('should throw error not_found if event not found', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          id: 'eventId',
          description: 'description'
        },
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.updateEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should update event by id', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: {
          id: 'eventId',
          description: 'description'
        },
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push([
        {
          event_id: 'eventId',
          created_at_utc: '2019-06-03 10:56:16',
          application_id: '*'
        }
      ]);

      try {
        res = await dal.updateEvent(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('eventId');
      expect(res.createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res.application).toEqual('*');
    });
  });

  describe('#batchUpdateEvents', function () {
    it('should throw error not_found if event not found', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: [
          {
            id: 'eventId',
            description: 'description'
          }
        ],
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.batchUpdateEvents(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(res).toEqual([]);
    });

    it('should update event by id', async function () {
      let res, err;
      const ctx = mockUtil.makeContext();
      const args = {
        input: [
          {
            id: 'eventId',
            description: 'description'
          }
        ],
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push([
        {
          event_id: 'eventId',
          created_at_utc: '2019-06-03 10:56:16',
          application_id: '*'
        }
      ]);

      try {
        res = await dal.batchUpdateEvents(ctx, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res[0].id).toEqual('eventId');
      expect(res[0].createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res[0].application).toEqual('*');
    });
  });

  describe('#events', function () {
    it('should get events with application is not "system"', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { application: '*' };

      serviceContext.dbConnections['core'].read._push([
        {
          event_id: 'eventId',
          created_at_utc: '2019-06-03 10:56:16',
          application_id: '*'
        }
      ]);

      try {
        res = await dal.events(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].id).toEqual('eventId');
      expect(res.records[0].createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res.records[0].application).toEqual('*');
    });

    it('should get events with application is "system"', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { application: 'system' };

      serviceContext.dbConnections['core'].read._push([
        {
          event_id: 'eventId',
          created_at_utc: '2019-06-03 10:56:16',
          application_id: '*'
        }
      ]);

      try {
        res = await dal.events(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].id).toEqual('eventId');
      expect(res.records[0].createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res.records[0].application).toEqual('*');
    });

    it('should get events with application is not in ["system", "*"] with superadmin or an orgless token', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { application: 'new-type' };
      // has superadmin role
      context._authInfo.permissionMasks = [-2, 268435455, 1073742335, 8335347];

      serviceContext.dbConnections['core'].read._push([
        {
          event_id: 'eventId',
          created_at_utc: '2019-06-03 10:56:16',
          application_id: 'new-type'
        }
      ]);

      try {
        res = await dal.events(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].id).toEqual('eventId');
      expect(res.records[0].createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res.records[0].application).toEqual('new-type');
    });

    it('should not throw an error when getting events with application is not in ["system", "*"] with none superadmin and not an orgless token', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { application: 'new-type', organizationId: 123 };
      // has none superadmin role
      context._authInfo.permissionMasks = [];

      // get applications
      serviceContext.dal.application.getApplication = jest.fn();
      serviceContext.dal.application.getApplication.mockResolvedValue({
        id: 'app_id',
        app_name: 'app_name'
      });

      serviceContext.dbConnections['core'].read._push([
        {
          event_id: 'eventId',
          created_at_utc: '2019-06-03 10:56:16',
          application_id: 'new-type'
        }
      ]);

      try {
        res = await dal.events(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].id).toEqual('eventId');
      expect(res.records[0].createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res.records[0].application).toEqual('new-type');
    });

    it('should return empty array if no event found for application', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { application: 'system' };

      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.events(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res.records).toEqual([]);
    });
  });

  describe('#event', function () {
    it('should return null if event not found', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { id: 'eventId', organizationId: 7682 };

      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.event(context, args);
      } catch (error) {
        err = error;
      }

      expect(res).toEqual(undefined);
      expect(err).toBeDefined();
      expect(`${err}`).toContain(`The requested object was not found`);
    });

    it('should get event by id', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { id: 'eventId', organizationId: 7682 };

      serviceContext.dbConnections['core'].read._push([
        {
          event_id: 'eventId',
          created_at_utc: '2019-06-03 10:56:16',
          application_id: '*'
        }
      ]);

      try {
        res = await dal.event(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('eventId');
      expect(res.createdDateTime).toEqual('2019-06-03 10:56:16');
      expect(res.application).toEqual('*');
    });
  });

  describe('#unsubscribeEvent', function () {
    it('should throw error if event subcription not found', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { id: 'eventSubcriptionId', organizationId: 7682 };

      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.unsubscribeEvent(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should unsubcribe an event', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { id: 'eventSubcriptionId', organizationId: 7682 };

      serviceContext.dbConnections['core'].write._push([
        { event_subscription_id: 'eventSubcriptionId' }
      ]);

      try {
        res = await dal.unsubscribeEvent(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('eventSubcriptionId');
      expect(res.message).toEqual('Unsubscribed from event');
    });

    it('should batch unsubscribe to multiple events', async function () {
      // Mock the necessary dependencies and setup test data
      const context = mockUtil.makeContext();
      const args = {
        ids: ['eventSubcriptionId1', 'eventSubcriptionId2'],
        organizationId: 7682
      };

      // Mock the database queries
      serviceContext.dbConnections['core'].write._push([
        { event_subscription_id: 'eventSubcriptionId1' },
        { event_subscription_id: 'eventSubcriptionId2' }
      ]);

      // Call the function
      const result = await dal.batchUnsubscribeEvent(context, args);

      // Assertions
      expect(result).toEqual([
        { id: 'eventSubcriptionId1', message: 'Unsubscribed from event' },
        { id: 'eventSubcriptionId2', message: 'Unsubscribed from event' }
      ]);
    });
  });

  describe('#eventSubscription', function () {
    it('should throw error if event subscription not found', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { id: 'eventSubcriptionId', organizationId: 7682 };

      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.eventSubscription(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should return event supscription by id', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { id: 'eventSubcriptionId', organizationId: 7682 };

      serviceContext.dbConnections['core'].read._push([
        {
          event_subscription_id: 'eventSubscriptionId',
          created_at_utc: '2019-06-03 10:56:16'
        }
      ]);

      try {
        res = await dal.eventSubscription(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('eventSubscriptionId');
      expect(res.createdDateTime).toEqual('2019-06-03 10:56:16');
    });
  });

  describe('#eventSubscriptions', function () {
    it('should throw error, if both ids and eventType and eventType were passed in', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        ids: ['eventSubcriptionId'],
        organizationId: 7682,
        eventType: 'type',
        eventName: 'name'
      };

      try {
        res = await dal.eventSubscriptions(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should return event subscriptions, with ids', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        ids: ['eventSubcriptionId'],
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].read._push([
        {
          event_subscription_id: 'eventSubcriptionId',
          created_at_utc: '2019-06-03 10:56:16'
        }
      ]);

      try {
        res = await dal.eventSubscriptions(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].id).toEqual('eventSubcriptionId');
      expect(res.records[0].createdDateTime).toEqual('2019-06-03 10:56:16');
    });

    it('should return event subscriptions, filter by eventType and eventName', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        organizationId: 7682,
        eventType: 'type',
        eventName: 'name'
      };

      serviceContext.dbConnections['core'].read._push([
        {
          event_subscription_id: 'eventSubcriptionId',
          created_at_utc: '2019-06-03 10:56:16'
        }
      ]);

      try {
        res = await dal.eventSubscriptions(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].id).toEqual('eventSubcriptionId');
      expect(res.records[0].createdDateTime).toEqual('2019-06-03 10:56:16');
    });

    it('should return event subscriptions, filter only by org', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].read._push([
        {
          event_subscription_id: 'eventSubcriptionId',
          created_at_utc: '2019-06-03 10:56:16'
        }
      ]);

      try {
        res = await dal.eventSubscriptions(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].id).toEqual('eventSubcriptionId');
      expect(res.records[0].createdDateTime).toEqual('2019-06-03 10:56:16');
    });

    it('should return event subscriptions of an application, filter by appId and Application scope', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        appId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
        scope: 'Application'
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            event_subscription_id: 'eventSubcriptionId',
            created_at_utc: '2019-06-03 10:56:16'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(sql).toMatch(/organization_id\s=/);
          expect(params[0]).toEqual(-2);
          expect(sql).toMatch(/application_id\s=/);
          expect(params[1]).toEqual('8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5');
          expect(sql).toMatch(/scope\s=/);
          expect(params[2]).toEqual('Application');

          return true;
        }
      );

      try {
        res = await dal.eventSubscriptions(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].id).toEqual('eventSubcriptionId');
      expect(res.records[0].createdDateTime).toEqual('2019-06-03 10:56:16');
    });
  });

  describe('#emitSystemEvent', function () {
    it('should emit system event, with payload type is null', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { input: { payload: {}, topic: 'test' } };
      const _emitEvent = jest.fn();
      _.set(serviceContext, 'messageUtil.emitEvent', _emitEvent);
      _emitEvent.mockImplementation((event, topic) => Promise.resolve(event));
      const dalNew = require('./event.js')(serviceContext);

      try {
        res = await dalNew.emitSystemEvent(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.payload.type).toEqual('apiInternal');
      expect(res.topic).toEqual('test');
    });

    it('should throw out on messaging error', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { input: { payload: { type: 'type' }, topic: 'test' } };
      const _emitEvent = jest.fn();
      _.set(serviceContext, 'messageUtil.emitEvent', _emitEvent);
      _emitEvent.mockImplementation((event, topic) =>
        Promise.reject(new Error('whatever'))
      );
      const dalNew = require('./event.js')(serviceContext);
      try {
        await dalNew.emitSystemEvent(context, args);
        throw new Error('no throw');
      } catch (error) {
        expect(_.toString(error)).toContain('whatever');
      }
    });

    it('should not throw out on messaging error if errorOnMessageFailure is false', async function () {
      const context = mockUtil.makeContext();
      const args = { input: { payload: { type: 'type' }, topic: 'test' } };
      const _emitEvent = jest.fn();
      _.set(serviceContext, 'messageUtil.emitEvent', _emitEvent);
      _emitEvent.mockImplementation((event, topic) =>
        Promise.reject(new Error('whatever'))
      );
      _.set(serviceContext, 'config.featureFlags.errorOnMessageFailure', false);
      const dalNew = require('./event.js')(serviceContext);
      const res = await dalNew.emitSystemEvent(context, args);
      expect(res).toBeDefined();
      expect(res.payload.type).toEqual('type');
      expect(res.topic).toEqual('test');
      expect(res.timestamp).toBeDefined();
    });

    it('should emit system event, with input payload type', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { input: { payload: { type: 'type' }, topic: 'test' } };
      const _emitEvent = jest.fn();
      _.set(serviceContext, 'messageUtil.emitEvent', _emitEvent);
      _emitEvent.mockImplementation((event, topic) =>
        Promise.resolve(
          Object.assign(event, { timestamp: '2019-06-03T23:42:46.880Z' })
        )
      );
      const dalNew = require('./event.js')(serviceContext);

      try {
        res = await dalNew.emitSystemEvent(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.payload.type).toEqual('type');
      expect(res.topic).toEqual('test');
      expect(res.timestamp).toEqual('2019-06-03T23:42:46.880Z');
    });

    it('should not override id in payload if it is passed in', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: { payload: { id: 'test-id-xxxx' }, topic: 'test-topic' }
      };
      const _emitEvent = jest.fn();
      _.set(serviceContext, 'messageUtil.emitEvent', _emitEvent);
      _emitEvent.mockImplementation((event, topic) =>
        Promise.resolve(
          Object.assign(event, { timestamp: '2019-06-03T24:42:46.880Z' })
        )
      );
      const dalNew = require('./event.js')(serviceContext);

      try {
        res = await dalNew.emitSystemEvent(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.payload.id).toEqual('test-id-xxxx');
      expect(res.topic).toEqual('test-topic');
      expect(res.timestamp).toEqual('2019-06-03T24:42:46.880Z');
    });

    it('should override id in payload if it is not passed in', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: { payload: {}, topic: 'test-topic' }
      };
      const _emitEvent = jest.fn();
      _.set(serviceContext, 'messageUtil.emitEvent', _emitEvent);
      _emitEvent.mockImplementation((event, topic) =>
        Promise.resolve(
          Object.assign(event, { timestamp: '2019-06-03T24:42:46.880Z' })
        )
      );
      const dalNew = require('./event.js')(serviceContext);

      try {
        res = await dalNew.emitSystemEvent(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.payload.id).toBeDefined();
      expect(res.payload.id).not.toEqual('');
      expect(res.topic).toEqual('test-topic');
      expect(res.timestamp).toEqual('2019-06-03T24:42:46.880Z');
    });
  });

  describe('#emitAuditEvent', function () {
    it('should emit audit event', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: { application: 'applicationId', payload: { foo: 'bar' } },
        organizationId: 7682
      };

      try {
        res = await dal.emitAuditEvent(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.payload.foo).toEqual('bar');
    });
  });

  describe('#getAuditEvents', function () {
    it('should get audit events, with filter is undefined', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        organizationId: 7682,
        application: 'applicationId',
        terms: [{ foo: 'bar' }],
        limit: 30,
        offset: 0,
        orderDirection: 'desc'
      };

      //Mock request promise
      httpResponses.push({
        data: { hits: { hits: [{ _source: 'test' }] } }
      });

      try {
        res = await dal.getAuditEvents(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.offset).toEqual(0);
      expect(res.limit).toEqual(30);
      expect(res.count).toEqual(1);
      expect(res.records[0]).toEqual('test');
    });

    it('should get audit events, with filter is not an array', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        limit: 30,
        offset: 0,
        orderDirection: 'desc',
        query: { bool: { filter: { term: { ['payload.foo']: 'bar' } } } }
      };

      //Mock request promise
      httpResponses.push({
        data: { hits: { hits: [{ _source: 'test' }] } }
      });

      try {
        res = await dal.getAuditEvents(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.offset).toEqual(0);
      expect(res.limit).toEqual(30);
      expect(res.count).toEqual(1);
      expect(res.records[0]).toEqual('test');
    });

    it('should throw error, if request to kibana failed', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        limit: 30,
        offset: 0,
        orderDirection: 'desc',
        query: { bool: { filter: { term: { ['payload.foo']: 'bar' } } } }
      };

      //Mock request promise
      httpResponses.push({ error: { message: 'failed' } });

      try {
        res = await dal.getAuditEvents(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
      expect(res).toBeUndefined();
    });
  });

  describe('#createEventActionTemplate', function () {
    it('should create event action template', async function () {
      const ctx = mockUtil.makeContext();
      const input = {
        name: 't0',
        ownerApplicationId: 'system',
        inputType: 'event',
        inputValidation: { input: 'validation' },
        inputAttributes: { input: 'attributes' },
        actionType: 'webhook',
        actionDestination: 'http://api.example.com',
        actionValidation: { action: 'validation' },
        actionAttributes: { action: 'attributes' }
      };
      const organizationId = 1;
      const expectedArgs = [
        input.name,
        organizationId,
        input.ownerApplicationId,
        input.inputType,
        input.inputValidation,
        input.inputAttributes,
        input.actionType,
        input.actionDestination,
        input.actionValidation,
        input.actionAttributes
      ];
      const result = { foo: 'bar' };
      serviceContext.dbConnections['core'].write._push(
        [result],
        true,
        [],
        (sql, sqlArgs) => {
          // omit uuid template id and create by
          const definedArgs = sqlArgs.slice(1, -1);
          expect(definedArgs).toEqual(expectedArgs);
          return true;
        }
      );

      const res = await dal.createEventActionTemplate(ctx, {
        input,
        organizationId
      });
      expect(res).toEqual(result);
    });
  });

  describe('#updateEventActionTemplate', function () {
    it('should throw error not_found if event action template not found', async function () {
      const ctx = mockUtil.makeContext();
      const args = {
        input: {},
        organizationId: 1
      };
      serviceContext.dbConnections['core'].write._push([]);
      try {
        await dal.updateEventActionTemplate(ctx, args);
        jest.fail();
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toEqual('not_found');
      }
    });

    it('should update event action template by id', async function () {
      const ctx = mockUtil.makeContext();
      const input = {
        name: 't0',
        inputValidation: { input: 'validation' },
        inputAttributes: { input: 'attributes' },
        actionDestination: 'http://api.example.com',
        actionValidation: { action: 'validation' },
        actionAttributes: { action: 'attributes' }
      };
      const organizationId = 1;
      const expectedArgs = [
        input.name,
        input.inputValidation,
        input.inputAttributes,
        input.actionDestination,
        input.actionValidation,
        input.actionAttributes
      ];
      const result = { foo: 'bar' };
      serviceContext.dbConnections['core'].write._push(
        [result],
        true,
        [],
        (sql, sqlArgs) => {
          const definedArgs = sqlArgs.slice(0, -2);
          expect(definedArgs).toEqual(expectedArgs);
          return true;
        }
      );
      const res = await dal.updateEventActionTemplate(ctx, {
        input,
        organizationId
      });
      expect(res).toEqual(result);
    });
  });

  describe('#eventActionTemplates', function () {
    it('should get events with application is "system"', async function () {
      const context = mockUtil.makeContext();
      const args = {
        ownerApplicationId: 'system',
        inputType: 'event',
        actionType: 'webhook',
        organizationId: 1,
        offset: 2,
        limit: 3
      };
      const expectedArgs = [1, 'system', 'event', 'webhook', 2, 3];
      const records = [{}, {}, {}];
      serviceContext.dbConnections['core'].read._push(
        records,
        true,
        [],
        (sql, sqlArgs) => {
          expect(sqlArgs).toEqual(expectedArgs);
          return true;
        }
      );

      const res = await dal.eventActionTemplates(context, args);
      expect(res.count).toEqual(records.length);
      expect(res.limit).toEqual(args.limit);
      expect(res.offset).toEqual(args.offset);
      expect(res.records).toEqual(records);
    });
  });

  describe('#eventActionTemplate', function () {
    it('should throw error not_found if event action template not found', async function () {
      const ctx = mockUtil.makeContext();
      const args = {
        input: {},
        organizationId: 1
      };
      serviceContext.dbConnections['core'].write._push([]);
      try {
        await dal.updateEventActionTemplate(ctx, args);
        jest.fail();
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toEqual('not_found');
      }
    });

    it('should get event action template by id', async function () {
      const context = mockUtil.makeContext();
      const args = {
        id: 2,
        organizationId: 1
      };
      const expectedArgs = [2, 1];
      const record = { foo: 'bar' };
      serviceContext.dbConnections['core'].read._push(
        [record],
        true,
        [],
        (sql, sqlArgs) => {
          expect(sqlArgs).toEqual(expectedArgs);
          return true;
        }
      );
      const res = await dal.eventActionTemplate(context, args);
      expect(res).toEqual(record);
    });
  });
});
