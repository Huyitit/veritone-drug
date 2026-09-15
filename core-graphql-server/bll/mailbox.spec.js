const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();

let bll;
const context = mockUtil.makeContext();

beforeEach(function () {
  serviceContext._clearAll();
});

describe('bll mailbox tests', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      bll = require('./mailbox.js')(serviceContext);
      expect(typeof bll).toEqual('object');
      expect(Object.keys(bll).length).toEqual(6);
    });
  });

  describe('#getMailboxes', function () {
    it('should get mailboxes by ids', async function () {
      let err, res;
      let options = {
        ids: [
          'b47d9586-ee5b-4587-bf0e-4a85fcf25864',
          '61905fc6-5c9a-40d8-8326-1453a12f7331'
        ]
      };

      // serviceContext.dal.mailbox.getMailboxes
      serviceContext.dbConnections['core'].read._push([
        { id: 'b47d9586-ee5b-4587-bf0e-4a85fcf25864' },
        { id: '61905fc6-5c9a-40d8-8326-1453a12f7331' }
      ]);

      try {
        res = await bll.getMailboxes(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
    });
    it('should get mailboxes by ids via an internal token', async function () {
      let err, res;
      let options = {
        ids: [
          'b47d9586-ee5b-4587-bf0e-4a85fcf25864',
          '61905fc6-5c9a-40d8-8326-1453a12f7331'
        ]
      };

      // serviceContext.dal.mailbox.getMailboxes
      serviceContext.dbConnections['core'].read._push(
        [
          { id: 'b47d9586-ee5b-4587-bf0e-4a85fcf25864' },
          { id: '61905fc6-5c9a-40d8-8326-1453a12f7331' }
        ],
        false,
        [],
        (sql) => {
          expect(sql).not.toMatch(/nm\.organization\_id\s\=/);
          return true;
        }
      );

      try {
        res = await bll.getMailboxes(
          mockUtil.makeContext({ authType: 'api_internal' }),
          options
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
    });
  });

  describe('#notificationMailboxCreate', function () {
    it('should throw error - Must be a userToken', async function () {
      let err, res;
      let options = { input: {} };
      const newContext = _.cloneDeep(context);

      _.set(newContext, 'requestContext.userInfo', null);

      try {
        res = await bll.notificationMailboxCreate(newContext, options);
      } catch (error) {
        expect(error.message).toEqual('Must be a userToken');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
    });

    it('should throw error - Create mailbox unsuccessful', async function () {
      let err, res;
      let options = {
        input: {
          name: 'test name',
          eventFilter: {},
          notificationTemplate: 'template {{jobId}}',
          limit: 300
        }
      };

      // start mocking serviceContext.dal.mailbox.createMailbox
      // -- serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: 'a8da16aa-781b-45cb-b9d4-9ef2aad3a038' }
      ]);
      serviceContext.dbConnections['core'].write._push([]);
      // end mocking serviceContext.dal.mailbox.createMailbox

      try {
        res = await bll.notificationMailboxCreate(context, options);
      } catch (error) {
        expect(error.message).toEqual('Create mailbox unsuccessful');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('service_failure');
    });

    it('should throw error - Must specify eventType if eventName is used', async function () {
      let err, res;
      let options = {
        input: {
          name: 'test name',
          eventFilter: { eventNames: ['JobCreated'] },
          notificationTemplate: 'template {{jobId}}',
          limit: 300
        }
      };

      // start mocking serviceContext.dal.mailbox.createMailbox
      // -- serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: 'a8da16aa-781b-45cb-b9d4-9ef2aad3a038' }
      ]);
      serviceContext.dbConnections['core'].write._push([
        { id: '24b5e732-3c43-4599-a1bb-4ddf0e3f583d' }
      ]);
      // end mocking serviceContext.dal.mailbox.createMailbox

      try {
        res = await bll.notificationMailboxCreate(context, options);
      } catch (error) {
        expect(error.message).toEqual(
          'Must specify eventType if eventName is used'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('should create mailbox successfully', async function () {
      let err, res;
      let options = {
        input: {
          name: 'test name',
          eventFilter: {
            eventNames: ['JobCreated'],
            eventType: 'job',
            applicationId: 'system',
            delivery: { deliveryType: 'NotificationMailbox' }
          },
          notificationTemplate: 'template {{jobId}}',
          limit: 300
        }
      };

      // start mocking serviceContext.dal.mailbox.createMailbox
      // -- serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: 'a8da16aa-781b-45cb-b9d4-9ef2aad3a038' }
      ]);
      serviceContext.dbConnections['core'].write._push([
        { id: '24b5e732-3c43-4599-a1bb-4ddf0e3f583d' }
      ]);
      // end mocking serviceContext.dal.mailbox.createMailbox
      // start mocking serviceContext.dal.event.subscribeEvent
      serviceContext.dbConnections['core'].read._push([
        { event_subscription_id: 'bf072ffa-b99f-4c97-a5f7-dc3f9f1462e6' }
      ]);
      // end mocking serviceContext.dal.event.subscribeEvent
      // start mocking serviceContext.dal.mailbox.updateMailbox
      serviceContext.dbConnections['core'].write._push([]);
      // end mocking serviceContext.dal.mailbox.updateMailbox

      try {
        res = await bll.notificationMailboxCreate(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('24b5e732-3c43-4599-a1bb-4ddf0e3f583d');
    });

    it('should create platform version mailbox successfully via internal token', async function () {
      let err, res;
      const newContext = mockUtil.makeContext({ authType: 'api_internal' });
      let options = {
        input: {
          userId: 'user_id',
          orgId: 'org_id',
          name: 'test name',
          eventFilter: {
            eventNames: ['NewVersionAvailable'],
            eventType: 'platformEvent',
            applicationId: '*',
            delivery: { deliveryType: 'NotificationMailbox' }
          },
          notificationTemplate: 'template {{jobId}}',
          limit: 300
        }
      };

      // start mocking serviceContext.dal.mailbox.createMailbox
      // -- serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: 'a8da16aa-781b-45cb-b9d4-9ef2aad3a038' }
      ]);
      serviceContext.dbConnections['core'].write._push(
        [{ id: '24b5e732-3c43-4599-a1bb-4ddf0e3f583d' }],
        false,
        [],
        (sql, params) => {
          expect(params[2]).toEqual('user_id');
          expect(params[3]).toEqual('org_id');
          return true;
        }
      );
      // end mocking serviceContext.dal.mailbox.createMailbox
      // start mocking serviceContext.dal.event.subscribeEvent
      serviceContext.dbConnections['core'].write._push([]);
      serviceContext.dbConnections['core'].read._push(
        [{ event_subscription_id: 'bf072ffa-b99f-4c97-a5f7-dc3f9f1462e6' }],
        false,
        [],
        (sql, params) => {
          expect(params[2]).toEqual(-1);
          return true;
        }
      );
      // end mocking serviceContext.dal.event.subscribeEvent
      // start mocking serviceContext.dal.mailbox.updateMailbox
      serviceContext.dbConnections['core'].write._push([]);
      // end mocking serviceContext.dal.mailbox.updateMailbox

      try {
        res = await bll.notificationMailboxCreate(newContext, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('24b5e732-3c43-4599-a1bb-4ddf0e3f583d');
    });
  });

  describe('#notificationMailboxPauseUnpause', function () {
    it('should throw error - The mailbox id is required.', async function () {
      let err, res;
      let options = {
        isPause: true
      };

      try {
        res = await bll.notificationMailboxPauseUnpause(context, options);
      } catch (error) {
        expect(error.message).toEqual('The mailbox id is required.');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });

    it('should pause notification mailbox', async function () {
      let err, res;
      let options = {
        id: '24b5e732-3c43-4599-a1bb-4ddf0e3f583d',
        isPause: true
      };

      serviceContext.dbConnections['core'].write._push([
        { id: '24b5e732-3c43-4599-a1bb-4ddf0e3f583d', is_paused: true }
      ]);

      try {
        res = await bll.notificationMailboxPauseUnpause(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('24b5e732-3c43-4599-a1bb-4ddf0e3f583d');
      expect(res.isPaused).toEqual(true);
    });
  });
});
