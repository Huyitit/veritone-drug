const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const dal = require('./notification.js')(serviceContext);

describe('notification', () => {
  describe('#require', function () {
    it('should load module', async function () {
      chaiExpect(typeof dal).to.equal('object');
      chaiExpect(Object.keys(dal).length).to.equal(13);
    });
  });

  describe('#createNotificationTemplate', function () {
    it('should throw error - Require fields must be define', async function () {
      let res, err;
      const template = {};

      try {
        res = await dal.createNotificationTemplate(
          mockUtil.makeContext(),
          template
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Require fields must be define');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should create notification template', async function () {
      let res, err;
      const template = {
        eventName: 'name',
        eventType: 'type',
        title: 'title',
        body: 'body',
        ownerApplicationId: 'f06a8187-8923-479a-97bd-1eef13beb91c',
        ownerOrganizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push([
        { id: '2f406917-584f-4d5b-b45c-9aadf84bb09a' }
      ]);

      try {
        res = await dal.createNotificationTemplate(
          mockUtil.makeContext(),
          template
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('2f406917-584f-4d5b-b45c-9aadf84bb09a');
    });
  });

  describe('#getNotificationTemplates', function () {
    it('should get notification template', async function () {
      let res, err;
      const args = {};

      serviceContext.dbConnections['core'].read._push([
        { id: 'a81be488-5bf4-4747-bb65-af4f6ae0ab40' }
      ]);

      try {
        res = await dal.getNotificationTemplates(mockUtil.makeContext(), args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.records[0].id).to.equal(
        'a81be488-5bf4-4747-bb65-af4f6ae0ab40'
      );
    });
  });

  describe('#deleteNotificationTemplate', function () {
    it('should throw error - Notification Template id is required.', async function () {
      let res, err;
      const args = {};

      try {
        res = await dal.deleteNotificationTemplate(
          mockUtil.makeContext(),
          args
        );
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Notification Template id is required.'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should throw error - Notification Template does not exists', async function () {
      let res, err;
      const args = { id: '2e55e73f-60df-4b51-98e7-b384d8be75fa' };

      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.deleteNotificationTemplate(
          mockUtil.makeContext(),
          args
        );
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Notification Template does not exists'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('not_found');
    });

    it('should delete notification template successfully', async function () {
      let res, err;
      const args = { id: '1e28dd7a-ba5b-4ee2-b5cc-ec9caca0eb1b' };

      serviceContext.dbConnections['core'].write._push([
        { id: '1e28dd7a-ba5b-4ee2-b5cc-ec9caca0eb1b' }
      ]);

      try {
        res = await dal.deleteNotificationTemplate(
          mockUtil.makeContext(),
          args
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('1e28dd7a-ba5b-4ee2-b5cc-ec9caca0eb1b');
    });
  });

  describe('#createNotificationAction', function () {
    it('should throw error - Require fields must be define', async function () {
      let res, err;
      const template = {};

      try {
        res = await dal.createNotificationAction(
          mockUtil.makeContext(),
          template
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Require fields must be define');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should create notification action', async function () {
      let res, err;
      const notificationAction = {
        eventName: 'name',
        eventType: 'type',
        actionName: 'actionName',
        urlTemplate: 'urlTemplate',
        ownerApplicationId: 'f06a8187-8923-479a-97bd-1eef13beb91c',
        ownerOrganizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push([
        { id: '2f406917-584f-4d5b-b45c-9aadf84bb09a' }
      ]);

      try {
        res = await dal.createNotificationAction(
          mockUtil.makeContext(),
          notificationAction
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('2f406917-584f-4d5b-b45c-9aadf84bb09a');
    });
  });

  describe('#getNotificationActions', function () {
    it('should get notification action', async function () {
      let res, err;
      const args = {};

      serviceContext.dbConnections['core'].read._push([
        { id: 'a81be488-5bf4-4747-bb65-af4f6ae0ab40' }
      ]);

      try {
        res = await dal.getNotificationActions(mockUtil.makeContext(), args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.records[0].id).to.equal(
        'a81be488-5bf4-4747-bb65-af4f6ae0ab40'
      );
    });
  });

  describe('#deleteNotificationAction', function () {
    it('should throw error - Notification Action id is required.', async function () {
      let res, err;
      const args = {};

      try {
        res = await dal.deleteNotificationAction(mockUtil.makeContext(), args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Notification Action id is required.'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });
  });

  describe('#setNotificationFlags', function () {
    it('should throw error - Notification does not exists', async function () {
      let res, err;
      const args = { input: {} };

      dal.queryNotifications = jest
        .fn()
        .mockImplementation((ctx, queryParams, offset, limit) => {
          return Promise.resolve(null);
        });

      try {
        res = await dal.setNotificationFlags(mockUtil.makeContext(), args);
      } catch (error) {
        chaiExpect(error.message).to.equal('Notification does not exists');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });
  });

  describe('#sendEmail', function () {
    beforeAll(() => {
      _.set(
        serviceContext,
        'config.defaultEmailProvider.emailFrom',
        'test@veritone.com'
      );
    });
    it('should send basic_email message', async function () {
      const {
        events
      } = require('@veritone/core-messages/generated/pbjs/compiled');
      events.BasicEmail.mockImplementation(() => {
        return {
          toJSON: function () {
            return JSON.stringify(_.omit(this, ['toJSON']));
          }
        };
      });
      const { Messager } = require('@veritone/ts-messaging-lib/lib/nsq');
      Messager.mockImplementation((x, y) => {
        return {
          message: function () {
            return x;
          }
        };
      });
      const result = await dal.sendEmail(mockUtil.makeContext, {
        input: {
          from: 'from@veritone.com',
          to: 'to@veritone.com',
          subject: 'email_subject',
          message: 'email_body'
        }
      });
      chaiExpect(result).to.equal(true);
      const message = serviceContext.messagingV2._get();
      chaiExpect(message.message().replace(/\\/g, '')).to.equal(
        '"' +
          JSON.stringify({
            fromAddress: 'test@veritone.com',
            toAddress: 'to@veritone.com',
            subject: 'email_subject',
            body: 'email_body',
            bodyHtml: 'email_body'
          }) +
          '"'
      );
    });
  });
});
