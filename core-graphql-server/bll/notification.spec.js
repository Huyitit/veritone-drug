const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const { v5: uuidv5 } = require('uuid');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();
const uuidNamespace = 'b61091ee-1e70-45e1-b2c3-475177e8289d';

let bll, context;

beforeEach(function () {
  context = mockUtil.makeContext();
  serviceContext._clearAll();
});

describe('bll notification tests', function () {
  beforeAll(function () {
    serviceContext.dal.notification = {
      createNotification: jest.fn().mockResolvedValue({}),
      createNotificationTemplate: jest.fn(),
      queryNotifications: jest.fn(),
      setNotificationFlags: jest.fn(),
      setNotificationFlagsInBulk: jest.fn(),
      getNotificationCount: jest.fn()
    };
  });
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      bll = require('./notification.js')(serviceContext);
      chaiExpect(bll).to.be.a('object');
      chaiExpect(Object.keys(bll).length).to.equal(9);
      chaiExpect(typeof bll.post).to.equal('function');
    });
  });

  describe('#post', function () {
    it('should throw error - mailboxIds cannot be empty.', async function () {
      let err, res;
      let args = { input: {} };

      try {
        res = await bll.post(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('mailboxIds cannot be empty.');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should push non-persistence notification - Mailbox limit exceeded', async function () {
      let err, res;
      let args = {
        input: {
          mailboxIds: [
            '8019eaae-04f0-4c33-965b-81b1eaedd611',
            'e5e936d1-1e98-4fce-bd63-a23b6cbdffc0'
          ]
        }
      };

      // serviceContext.dal.mailbox.getMailboxes
      serviceContext.dbConnections['core'].read._push([
        {
          id: '8019eaae-04f0-4c33-965b-81b1eaedd611',
          is_paused: false,
          total_count: 10,
          unread_count: 1,
          limit_count: 10
        },
        {
          id: 'e5e936d1-1e98-4fce-bd63-a23b6cbdffc0',
          is_paused: false,
          total_count: 10,
          unread_count: 2,
          limit_count: 10
        }
      ]);
      serviceContext.dal.notification.getNotificationCount.mockImplementation(
        (ctx, args) => Promise.resolve(10)
      );

      try {
        res = await bll.post(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.limitedMailboxes.length).to.equal(2);
      chaiExpect(res.limitedMailboxes[0].id).to.exist;
      chaiExpect(res.limitedMailboxes[0].reason).to.equal(
        'Mailbox limit reached. Sending nonpersistent notification.'
      );
    });

    it('should push ephemeral notification - to mailboxIds', async function () {
      let err, res;
      let args = {
        input: {
          mailboxIds: [
            '62cd7d22-d0df-4491-8b16-aba81b10dd99',
            '233f3c1f-ca5d-43c6-ad93-e85aca1304b4'
          ],
          ephemeral: true
        }
      };

      // serviceContext.dal.mailbox.getMailboxes
      serviceContext.dbConnections['core'].read._push([
        {
          id: '62cd7d22-d0df-4491-8b16-aba81b10dd99',
          is_paused: false,
          total_count: 10,
          unread_count: 1,
          limit_count: 100
        },
        {
          id: '233f3c1f-ca5d-43c6-ad93-e85aca1304b4',
          is_paused: false,
          total_count: 10,
          unread_count: 2,
          limit_count: 100
        }
      ]);
      serviceContext.dal.notification.getNotificationCount.mockImplementation(
        (ctx, args) => Promise.resolve(10)
      );
      // Update mailboxes metrics
      serviceContext.dbConnections['core'].write._push([
        {
          id: '62cd7d22-d0df-4491-8b16-aba81b10dd99',
          total_count: 10,
          unread_count: 1,
          latest_receipt_date: moment.utc().toISOString()
        },
        {
          id: '233f3c1f-ca5d-43c6-ad93-e85aca1304b4',
          total_count: 10,
          unread_count: 2,
          latest_receipt_date: moment.utc().toISOString()
        }
      ]);

      try {
        res = await bll.post(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.mailboxIds.length).to.equal(2);
    });

    it('should post notification successfully - with failedMailbox', async function () {
      let err, res;
      let args = {
        input: {
          mailboxIds: [
            '8019eaae-04f0-4c33-965b-81b1eaedd611',
            'e5e936d1-1e98-4fce-bd63-a23b6cbdffc0'
          ]
        }
      };

      // serviceContext.dal.mailbox.getMailboxes
      serviceContext.dbConnections['core'].read._push([
        {
          id: '8019eaae-04f0-4c33-965b-81b1eaedd611',
          is_paused: false,
          total_count: 10,
          unread_count: 1,
          limit_count: 11
        },
        {
          id: 'e5e936d1-1e98-4fce-bd63-a23b6cbdffc0',
          is_paused: true,
          total_count: 5,
          unread_count: 2,
          limit_count: 10
        }
      ]);
      // serviceContext.dal.mailbox.updateMailbox
      serviceContext.dbConnections['core'].write._push([
        {
          id: '8019eaae-04f0-4c33-965b-81b1eaedd611',
          is_paused: false,
          total_count: 11,
          unread_count: 1,
          limit_count: 11
        }
      ]);
      serviceContext.dal.notification.createNotification.mockResolvedValue({
        id: 'S8tq8ncBK_bIGsZmBREE',
        createdDateTime: moment('2020-01-02'),
        updatedDateTime: moment('2020-01-02')
      });
      try {
        res = await bll.post(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.createdDateTime).to.exist;
      chaiExpect(res.updatedDateTime).to.exist;
      chaiExpect(res.failedMailboxes).to.exist;
    });

    it('should post notification successfully - to mailboxIds', async function () {
      let err, res;
      let args = {
        input: {
          mailboxIds: [
            '8019eaae-04f0-4c33-965b-81b1eaedd611',
            'e5e936d1-1e98-4fce-bd63-a23b6cbdffc0'
          ]
        }
      };

      // serviceContext.dal.mailbox.getMailboxes
      serviceContext.dbConnections['core'].read._push([
        {
          id: '8019eaae-04f0-4c33-965b-81b1eaedd611',
          is_paused: false,
          total_count: 10,
          unread_count: 1,
          limit_count: 11
        },
        {
          id: 'e5e936d1-1e98-4fce-bd63-a23b6cbdffc0',
          is_paused: false,
          total_count: 5,
          unread_count: 2,
          limit_count: 10
        }
      ]);
      // serviceContext.dal.mailbox.updateMailbox
      serviceContext.dbConnections['core'].write._push([
        {
          id: '8019eaae-04f0-4c33-965b-81b1eaedd611',
          is_paused: false,
          total_count: 11,
          unread_count: 1,
          limit_count: 11
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          id: 'e5e936d1-1e98-4fce-bd63-a23b6cbdffc0',
          is_paused: false,
          total_count: 6,
          unread_count: 2,
          limit_count: 10
        }
      ]);
      serviceContext.dal.notification.createNotification.mockResolvedValue({
        id: '5lNe8ncB8MChPFpO3dZ8'
      });
      try {
        res = await bll.post(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.exist;
      chaiExpect(err).to.be.undefined;
    });

    it('should post notification successfully - to userIds', async function () {
      let err, res;
      let args = {
        input: {
          mailboxIds: [
            '8019eaae-04f0-4c33-965b-81b1eaedd611',
            'e5e936d1-1e98-4fce-bd63-a23b6cbdffc0'
          ]
        }
      };

      // serviceContext.dal.mailbox.getMailboxes
      serviceContext.dbConnections['core'].read._push([]);
      // serviceContext.dal.admin.getUsers
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '8019eaae-04f0-4c33-965b-81b1eaedd611',
            kvp: { firstName: 'test', lastName: 'user 1', status: 'active' }
          },
          {
            user_id: 'e5e936d1-1e98-4fce-bd63-a23b6cbdffc0',
            kvp: { firstName: 'test', lastName: 'user 2', status: 'deleted' }
          }
        ],
        false
      );
      // serviceContext.dal.notification.createNotification
      serviceContext.dal.notification.createNotification.mockResolvedValue({
        id: 'dZ2vtHcBD4JMegv-bIo8',
        createdDateTime: moment('2020-01-01'),
        updatedDateTime: moment('2020-01-01')
      });
      // serviceContext.dal.mailbox.updateMailbox (twice)
      serviceContext.dbConnections['core'].write._push([]);
      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await bll.post(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('dZ2vtHcBD4JMegv-bIo8');
      chaiExpect(res.createdDateTime).to.exist;
      chaiExpect(res.updatedDateTime).to.exist;
    });

    it('should throw error - Only superadmin or internal token can post notification to other orgs', async function () {
      let err, res;
      let args = {
        input: {
          mailboxIds: ['7682', 1234]
        },
        organizationId: 7682
      };
      const ctxNonSuperAdmin = mockUtil.makeContext({ authType: 'api_org' });

      // serviceContext.dal.mailbox.getMailboxes
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await bll.post(ctxNonSuperAdmin, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Only superadmin or internal token can post notification to other orgs'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should post notification successfully - to orgIds', async function () {
      let err, res;
      let args = {
        input: {
          mailboxIds: ['7682', 1234]
        },
        organizationId: 7682
      };

      // serviceContext.dal.mailbox.getMailboxes
      serviceContext.dbConnections['core'].read._push([]);
      // serviceContext.dal.organization.getOrganizations
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 },
        { organization_id: 1234 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 },
        { organization_id: 1234 }
      ]);
      // serviceContext.dal.notification.createNotification
      serviceContext.dal.notification.createNotification.mockResolvedValue({
        id: 'dZ2vtHcBD4JMegv-bIo8',
        createdDateTime: moment('2020-01-06'),
        updatedDateTime: moment('2020-01-06')
      });
      // serviceContext.dal.mailbox.updateMailbox (twice)
      serviceContext.dbConnections['core'].write._push([]);
      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await bll.post(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('dZ2vtHcBD4JMegv-bIo8');
      chaiExpect(res.createdDateTime).to.exist;
      chaiExpect(res.updatedDateTime).to.exist;
    });
  });

  describe('#addTemplate', function () {
    it('should throw error - Internal tokens must define the application since it did not have owner application or organization', async function () {
      let err, res;
      let args = {
        input: {}
      };

      try {
        res = await bll.addTemplate(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Internal tokens must define the application since it did not have owner application or organization'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should throw error - Require fields must be define', async function () {
      let err, res;
      let args = {
        input: { application: '63ae3fcb-442e-4c74-98b4-62463a23fc4b' }
      };

      // serviceContext.dal.organization.getOrgIdFromAppId.mockResolvedValue(7682);
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      try {
        res = await bll.addTemplate(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        chaiExpect(error.message).to.equal('Require fields must be define');
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should add template successfully', async function () {
      let args = {
        input: {
          application: '63ae3fcb-442e-4c74-98b4-62463a23fc4b',
          eventName: 'eventName',
          eventType: 'eventType',
          title: 'title',
          body: 'body'
        },
        organizationId: 7682
      };
      let err, res;

      serviceContext.dbConnections['core'].read._push(
        [{ schema_data: '', schema_hash: '' }],
        false
      );
      serviceContext.dal.notification.createNotificationTemplate.mockResolvedValue(
        { id: 'templateId' }
      );

      try {
        res = await bll.addTemplate(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('Require fields must be define');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.exist;
      chaiExpect(err).to.be.undefined;
      chaiExpect(res.id).to.equal('templateId');
    });
  });

  describe('#getNotificationsByUserOrOrgId', function () {
    it('should get Notifications by user or orgId', async function () {
      let err, res;
      let args = {};
      const id = 7682;

      // serviceContext.dal.notification.queryNotifications
      serviceContext.dal.notification.queryNotifications.mockImplementation(
        (ctx, params, offest, limit) => {
          chaiExpect(params.mailboxIds[0]).to.equal(
            uuidv5(id.toString(), uuidNamespace)
          );
          chaiExpect(offest).to.equal(0);
          chaiExpect(limit).to.equal(30);

          return Promise.resolve([{ id: 'dZ2vtHcBD4JMegv-bIo8' }]);
        }
      );

      try {
        res = await bll.getNotificationsByUserOrOrgId(context, args, id);
      } catch (error) {
        chaiExpect(error.message).to.equal('Require fields must be define');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.exist;
      chaiExpect(err).to.be.undefined;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records[0].id).to.equal('dZ2vtHcBD4JMegv-bIo8');
    });
  });

  describe('#setNotificationFlags', function () {
    it('should throw error - Required fields must be defined', async function () {
      let err, res;
      let args = { input: {} };

      try {
        res = await bll.setNotificationFlags(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('Required fields must be defined');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should set notification flags success', async function () {
      let err, res;
      let args = {
        input: {
          notificationId: 'dZ2vtHcBD4JMegv-bIo8',
          setFlags: ['read'],
          unsetFlags: ['unread']
        }
      };

      // serviceContext.dal.notification.setNotificationFlags
      serviceContext.dal.notification.setNotificationFlags.mockImplementation(
        (ctx, options) => {
          chaiExpect(options.input.notificationId).to.equal(
            'dZ2vtHcBD4JMegv-bIo8'
          );
          chaiExpect(options.input.setFlags[0]).to.equal('read');
          chaiExpect(options.input.unsetFlags[0]).to.equal('unread');

          return Promise.resolve({
            id: 'dZ2vtHcBD4JMegv-bIo8',
            flags: ['read', 'unseen'],
            mailboxIds: [
              '0406a5a4-6852-440e-be9e-5316bf08e360',
              'df59f7d6-8e07-4094-ad35-42d45a022cb7'
            ]
          });
        }
      );
      // serviceContext.dal.notification.queryNotifications
      serviceContext.dal.notification.queryNotifications.mockImplementation(
        (ctx, options, offset, limit) => {
          chaiExpect(options.mailboxIds.length).to.equal(2);
          chaiExpect(offset).to.equal(0);
          chaiExpect(limit).to.equal(5000);

          return Promise.resolve([]);
        }
      );

      try {
        res = await bll.setNotificationFlags(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('dZ2vtHcBD4JMegv-bIo8');
      chaiExpect(res.flags[0]).to.equal('read');
      chaiExpect(res.flags[1]).to.equal('unseen');
      chaiExpect(res.mailboxIds.length).to.equal(2);
    });
  });

  describe('#updateMailboxMetrics', function () {
    it('should throw error - mailboxIds is required', async function () {
      let err, res;
      let mailboxIds = [];

      try {
        res = await bll.updateMailboxMetrics(context, mailboxIds);
      } catch (error) {
        chaiExpect(error.message).to.equal('mailboxIds is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should return if no notification match', async function () {
      let err, res;
      let mailboxIds = [
        'bcb8eabd-06d0-4010-bf2f-ae1508ef368d',
        'bdf9a326-fc0e-48e6-83f1-14c793072286'
      ];

      // serviceContext.dal.notification.queryNotifications
      serviceContext.dal.notification.queryNotifications.mockImplementation(
        (ctx, options, offset, limit) => {
          chaiExpect(options.mailboxIds.length).to.equal(2);
          chaiExpect(offset).to.equal(0);
          chaiExpect(limit).to.equal(5000);

          return Promise.resolve([]);
        }
      );

      try {
        res = await bll.updateMailboxMetrics(context, mailboxIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.undefined;
    });

    it('should update mailbox metrics success', async function () {
      let err, res;
      let mailboxIds = [
        'bcb8eabd-06d0-4010-bf2f-ae1508ef368d',
        'bdf9a326-fc0e-48e6-83f1-14c793072286'
      ];

      // serviceContext.dal.notification.queryNotifications
      serviceContext.dal.notification.queryNotifications.mockImplementation(
        (ctx, options, offset, limit) => {
          chaiExpect(options.mailboxIds.length).to.equal(2);
          chaiExpect(offset).to.equal(0);
          chaiExpect(limit).to.equal(5000);

          return Promise.resolve([
            {
              id: 'bI4q8XcBysw-Dm_djseh',
              mailboxIds: ['bcb8eabd-06d0-4010-bf2f-ae1508ef368d'],
              flags: ['unread']
            },
            {
              id: 'Qt0q8XcBCjZoimwk-o3Z',
              mailboxIds: ['bdf9a326-fc0e-48e6-83f1-14c793072286'],
              flags: ['unseen']
            }
          ]);
        }
      );
      // serviceContext.dal.mailbox.updateMailbox (twice)
      serviceContext.dbConnections['core'].write._push([]);
      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await bll.updateMailboxMetrics(context, mailboxIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.undefined;
    });
  });

  describe('#setAllNotificationFlags', function () {
    it('should throw error - mailboxIds is required', async function () {
      let err, res;
      let mailboxIds = [];
      let setFlags;
      let unsetFlags;

      try {
        res = await bll.setAllNotificationFlags(
          context,
          mailboxIds,
          setFlags,
          unsetFlags
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('mailboxIds is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should throw error - Mark all notifications flags failed', async function () {
      let err, res;
      let mailboxIds = [
        'd5ff4cb3-c1f5-41ee-a667-e4cbce4488ec',
        '1a9ff057-53b1-4398-80eb-e070b8c7ef41'
      ];
      let setFlags = ['seen'];
      let unsetFlags = ['unseen'];

      // serviceContext.dal.notification.setNotificationFlagsInBulk
      serviceContext.dal.notification.setNotificationFlagsInBulk.mockImplementation(
        (ctx, options) => {
          chaiExpect(options.mailboxIds.length).to.equal(2);
          chaiExpect(options.setFlags[0]).to.equal('seen');
          chaiExpect(options.unsetFlags[0]).to.equal('unseen');

          return Promise.resolve('error');
        }
      );

      try {
        res = await bll.setAllNotificationFlags(
          context,
          mailboxIds,
          setFlags,
          unsetFlags
        );
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Mark all notifications flags failed'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('internal_error');
      chaiExpect(res).to.be.undefined;
    });

    it('should set all notification in bulk success', async function () {
      let err, res;
      let mailboxIds = [
        '1a787975-4a3f-4ea7-8a20-a1f8c128e1a1',
        '65c1de1e-917b-48aa-abb8-c023b57c3db5'
      ];
      let setFlags = ['read'];
      let unsetFlags = ['unread'];

      // serviceContext.dal.notification.setNotificationFlagsInBulk
      serviceContext.dal.notification.setNotificationFlagsInBulk.mockImplementation(
        (ctx, options) => {
          chaiExpect(options.mailboxIds.length).to.equal(2);
          chaiExpect(options.setFlags[0]).to.equal('read');
          chaiExpect(options.unsetFlags[0]).to.equal('unread');

          return Promise.resolve();
        }
      );
      // serviceContext.dal.notification.queryNotifications
      serviceContext.dal.notification.queryNotifications.mockImplementation(
        (ctx, options, offset, limit) => {
          chaiExpect(options.mailboxIds.length).to.equal(2);

          return Promise.resolve([]);
        }
      );
      // serviceContext.bll.mailbox.getMailboxes
      serviceContext.dbConnections['core'].read._push([
        { id: '1a787975-4a3f-4ea7-8a20-a1f8c128e1a1' },
        { id: '65c1de1e-917b-48aa-abb8-c023b57c3db5' }
      ]);

      try {
        res = await bll.setAllNotificationFlags(
          context,
          mailboxIds,
          setFlags,
          unsetFlags
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(2);
    });
  });
});
