const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.V3_DATA_MODEL);
const dal = require('./mailbox.js')(serviceContext);

let ctxSuperAdmin, ctxRegularUser, ctxApiToken, ctxInternalToken;

beforeEach(function () {
  ctxSuperAdmin = mockUtil.makeContext();
  ctxRegularUser = _.cloneDeep(mockUtil.makeContext({ authType: 'user' }));
  ctxApiToken = mockUtil.makeContext({ authType: 'api_org' });
  ctxInternalToken = mockUtil.makeContext({ authType: 'api_internal' });
  ctxRegularUser._authInfo.permissionMasks = null;
});

describe('dal mailbox tests', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(5);
    });
  });

  describe('#getMailboxes', function () {
    it('should get mailboxes - by regular userToken', async function () {
      let err, res;
      let args = {
        ids: [
          '94caec4d-5abf-47fe-bddb-738e72d8f305',
          '84aef53f-76ca-4675-bcf0-badc3b67dd75'
        ]
      };

      serviceContext.dbConnections['core'].read._push(
        [
          { id: '94caec4d-5abf-47fe-bddb-738e72d8f305' },
          { id: '84aef53f-76ca-4675-bcf0-badc3b67dd75' }
        ],
        true,
        ['nm.mailbox_id IN', 'nm.user_id =', 'nm.organization_id ='],
        (sql, vars) => {
          if (vars.length != 4) throw new Error('wrong number of vars');
          if (vars[0] !== '94caec4d-5abf-47fe-bddb-738e72d8f305')
            throw new Error(
              '$1 should be "94caec4d-5abf-47fe-bddb-738e72d8f305"'
            );
          if (vars[1] !== '84aef53f-76ca-4675-bcf0-badc3b67dd75')
            throw new Error(
              '$2 should be "84aef53f-76ca-4675-bcf0-badc3b67dd75"'
            );
          if (!_.isString(vars[2])) throw new Error('$3 should be string');
          if (!_.isNumber(vars[3])) throw new Error('$4 should be number');
          return true;
        }
      );

      try {
        res = await dal.getMailboxes(ctxRegularUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].id).to.equal(
        '94caec4d-5abf-47fe-bddb-738e72d8f305'
      );
      chaiExpect(res.records[1].id).to.equal(
        '84aef53f-76ca-4675-bcf0-badc3b67dd75'
      );
    });

    it('should get mailboxes - by apiToken', async function () {
      let err, res;
      let args = {
        ids: [
          '94caec4d-5abf-47fe-bddb-738e72d8f305',
          '84aef53f-76ca-4675-bcf0-badc3b67dd75'
        ]
      };

      serviceContext.dbConnections['core'].read._push(
        [
          { id: '94caec4d-5abf-47fe-bddb-738e72d8f305' },
          { id: '84aef53f-76ca-4675-bcf0-badc3b67dd75' }
        ],
        true,
        ['nm.mailbox_id IN', 'nm.organization_id ='],
        (sql, vars) => {
          if (vars.length != 3) throw new Error('wrong number of vars');
          if (vars[0] !== '94caec4d-5abf-47fe-bddb-738e72d8f305')
            throw new Error(
              '$1 should be "94caec4d-5abf-47fe-bddb-738e72d8f305"'
            );
          if (vars[1] !== '84aef53f-76ca-4675-bcf0-badc3b67dd75')
            throw new Error(
              '$2 should be "84aef53f-76ca-4675-bcf0-badc3b67dd75"'
            );
          if (!_.isNumber(vars[2])) throw new Error('$3 should be number');
          return true;
        }
      );

      try {
        res = await dal.getMailboxes(ctxApiToken, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].id).to.equal(
        '94caec4d-5abf-47fe-bddb-738e72d8f305'
      );
      chaiExpect(res.records[1].id).to.equal(
        '84aef53f-76ca-4675-bcf0-badc3b67dd75'
      );
    });

    it('should get mailboxes - by superAdmin', async function () {
      let err, res;
      let args = {
        ids: [
          '94caec4d-5abf-47fe-bddb-738e72d8f305',
          '84aef53f-76ca-4675-bcf0-badc3b67dd75'
        ]
      };

      serviceContext.dbConnections['core'].read._push(
        [
          { id: '94caec4d-5abf-47fe-bddb-738e72d8f305' },
          { id: '84aef53f-76ca-4675-bcf0-badc3b67dd75' }
        ],
        true,
        ['nm.mailbox_id IN'],
        (sql, vars) => {
          if (vars.length != 2) throw new Error('wrong number of vars');
          if (vars[0] !== '94caec4d-5abf-47fe-bddb-738e72d8f305')
            throw new Error(
              '$1 should be "94caec4d-5abf-47fe-bddb-738e72d8f305"'
            );
          if (vars[1] !== '84aef53f-76ca-4675-bcf0-badc3b67dd75')
            throw new Error(
              '$2 should be "84aef53f-76ca-4675-bcf0-badc3b67dd75"'
            );
          return true;
        }
      );

      try {
        res = await dal.getMailboxes(ctxSuperAdmin, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].id).to.equal(
        '94caec4d-5abf-47fe-bddb-738e72d8f305'
      );
      chaiExpect(res.records[1].id).to.equal(
        '84aef53f-76ca-4675-bcf0-badc3b67dd75'
      );
    });
  });

  describe('#createMailbox', function () {
    it('should throw error - OrganizationId is requried.', async function () {
      let err, res;
      let mailbox = {
        applicationId: '0b554302-6509-4600-897c-38135ca76490'
      };

      try {
        res = await dal.createMailbox(ctxInternalToken, mailbox);
      } catch (error) {
        chaiExpect(error.message).to.equal('OrganizationId is requried.');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should create mailbox successfully', async function () {
      let err, res;
      let mailbox = { organizationId: 1112 };

      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: 'ebab65d1-04de-43a9-bbb1-a37315ee7ea8' }
      ]);
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: 'a14c4ab7-bbe0-4048-9bad-7ceca596dc7b',
            organization_id: 1112,
            application_id: 'ebab65d1-04de-43a9-bbb1-a37315ee7ea8',
            limit_count: 500
          }
        ],
        false,
        [
          'event_trigger.notification_mailbox',
          'mailbox_id',
          'organization_id',
          'application_id',
          'limit_count'
        ],
        (sql, vars) => {
          if (vars.length != 4) throw new Error('wrong number of vars');
          if (!_.isString(vars[0])) throw new Error('$1 should be string');
          if (vars[1] != 1112) throw new Error('$2 should be 1112');
          if (vars[2] != 'ebab65d1-04de-43a9-bbb1-a37315ee7ea8')
            throw new Error(
              '$2 should be "ebab65d1-04de-43a9-bbb1-a37315ee7ea8"'
            );
          if (vars[3] != 500) throw new Error('$3 should be 500');
          return true;
        }
      );

      try {
        res = await dal.createMailbox(ctxSuperAdmin, mailbox);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.organizationId).to.equal(1112);
      chaiExpect(res.applicationId).to.equal(
        'ebab65d1-04de-43a9-bbb1-a37315ee7ea8'
      );
      chaiExpect(res.limitCount).to.equal(500);
    });
  });

  describe('#updateMailbox', function () {
    it('should throw error - Mailbox id is required.', async function () {
      let err, res;
      let args = {};

      try {
        res = await dal.updateMailbox(ctxSuperAdmin, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('Mailbox id is required.');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should update mailbox success', async function () {
      let err, res;
      let args = { id: '88f82f21-2c09-48c5-8593-770bd5c69029' };

      serviceContext.dbConnections['core'].write._push(
        [{ id: '88f82f21-2c09-48c5-8593-770bd5c69029' }],
        true,
        ['mailbox_id =', 'date_modified ='],
        (sql, vars) => {
          if (vars.length != 1) throw new Error('wrong number of vars');
          if (!_.isString(vars[0])) throw new Error('$1 should be string');
          return true;
        }
      );

      try {
        res = await dal.updateMailbox(ctxSuperAdmin, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('88f82f21-2c09-48c5-8593-770bd5c69029');
    });
  });

  describe('#deleteMailbox', function () {
    it('should throw error - Mailbox is required.', async function () {
      let err, res;

      try {
        res = await dal.deleteMailbox();
      } catch (error) {
        chaiExpect(error.message).to.equal('Mailbox is required.');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should throw error - Mailbox id is required.', async function () {
      let err, res;
      let mailbox = {};

      try {
        res = await dal.deleteMailbox(mailbox);
      } catch (error) {
        chaiExpect(error.message).to.equal('Mailbox id is required.');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should throw error - UserId is required.', async function () {
      let err, res;
      let mailbox = { id: '579eb032-5b81-4f45-89d5-b9d4c91d8f94' };

      try {
        res = await dal.deleteMailbox(mailbox);
      } catch (error) {
        chaiExpect(error.message).to.equal('UserId is required.');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should delete mailbox success', async function () {
      let err, res;
      let mailbox = {
        id: '579eb032-5b81-4f45-89d5-b9d4c91d8f94',
        userId: '07d8d86e-39b4-4ad8-b8f7-3e8f7c748622'
      };

      serviceContext.dbConnections['core'].write._push([
        { id: '579eb032-5b81-4f45-89d5-b9d4c91d8f94' }
      ]);

      try {
        res = await dal.deleteMailbox(mailbox);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('579eb032-5b81-4f45-89d5-b9d4c91d8f94');
    });
  });
});
