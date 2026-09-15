const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext('default', {
  enableTransactionQuery: true
});
const coreDbWrite = serviceContext.dbConnections['core'].write;
const coreDbRead = serviceContext.dbConnections['core'].read;

const dalEvent = require('./event.js')(serviceContext);
const dal = require('./eventCustomRule.js')(serviceContext, dalEvent);

describe('eventCustomRule.js', function () {
  describe('#require', function () {
    it('should load module', async function () {
      chaiExpect(typeof dal).to.equal('object');
    });
  });

  describe('#createEventCustomRule', function () {
    it('should create event custom rule', async function () {
      const ctx = mockUtil.makeContext();
      dalEvent.subscribeEvent = () => '123';
      const input = {
        status: 'active',
        name: 'r0',
        params: { foo: 'bar' },
        eventType: 'asset',
        eventName: 'AssetUploaded',
        description: 'd0',
        actions: [
          {
            delivery: {
              name: 'Webhook',
              params: {
                url: 'https://veritone.com'
              }
            },
            application: 'system',
            subscription: '123'
          }
        ]
      };
      const organizationId = 1;
      const expectedArgs = [
        input.status,
        input.name,
        input.description,
        input.params,
        organizationId,
        input.eventType,
        input.eventName,
        JSON.stringify(input.actions)
      ];
      const result = { foo: 'bar' };
      serviceContext.dbConnections['core'].write._push([], false);
      serviceContext.dbConnections['core'].write._push(
        [result],
        true,
        [],
        (sql, sqlArgs) => {
          // omit uuid rule id and create by
          const definedArgs = sqlArgs.slice(1, -1);
          chaiExpect(definedArgs).to.deep.equal(expectedArgs);
          return true;
        }
      );
      serviceContext.dbConnections['core'].write._push([], false);

      const res = await dal.createEventCustomRule(ctx, {
        input,
        organizationId
      });
      chaiExpect(res).to.deep.equal(result);
    });
  });

  describe('#updateEventCustomRule', function () {
    it('should throw error not_found if event custom rule not found', async function () {
      const ctx = mockUtil.makeContext();
      const args = {
        input: {},
        organizationId: 1
      };
      serviceContext.dbConnections['core'].write._push([]);
      try {
        await dal.updateEventCustomRule(ctx, args);
        expect.fail();
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(err.name).to.equal('not_found');
      }
    });

    it('should update event custom rule by id', async function () {
      const ctx = mockUtil.makeContext();
      const input = {
        id: 'id',
        status: 'inactive',
        name: 't0',
        description: 'd0',
        actions: { a: 1 }
      };
      const organizationId = 1;
      const expectedArgs = [
        input.id,
        organizationId,
        input.status,
        input.name,
        input.description,
        JSON.stringify(input.actions)
      ];
      const result = { foo: 'bar' };
      serviceContext.dbConnections['core'].read._push([{}], false);
      serviceContext.dbConnections['core'].write._push([], false);
      serviceContext.dbConnections['core'].write._push(
        [result],
        true,
        [],
        (sql, sqlArgs) => {
          const definedArgs = sqlArgs.slice(0, -2);
          chaiExpect(definedArgs).to.deep.equal(expectedArgs);
          return true;
        }
      );
      serviceContext.dbConnections['core'].write._push([], false);
      const res = await dal.updateEventCustomRule(ctx, {
        input,
        organizationId
      });
      chaiExpect(res).to.deep.equal(result);
    });
  });

  describe('#deleteEventCustomRule', function () {
    it('should throw error not_found if event custom rule not found', async function () {
      const ctx = mockUtil.makeContext();
      const args = {
        id: 'id',
        organizationId: 1
      };
      serviceContext.dbConnections['core'].write._push([]);
      try {
        await dal.deleteEventCustomRule(ctx, args);
        expect.fail();
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(err.name).to.equal('not_found');
      }
    });

    it('should delete event custom rule by id', async function () {
      const ctx = mockUtil.makeContext();
      const args = {
        id: 'id',
        organizationId: 1
      };
      const expectedArgs = [args.id, args.organizationId];
      const result = { id: 'id', message: 'Deleted event custom rule' };
      // BEGIN
      serviceContext.dbConnections['core'].read._push([{}], false);
      serviceContext.dbConnections['core'].write._push([], false);
      serviceContext.dbConnections['core'].write._push(
        [result],
        true,
        [],
        (sql, sqlArgs) => {
          chaiExpect(sqlArgs).to.deep.equal(expectedArgs);
          return true;
        }
      );
      // COMMIT
      serviceContext.dbConnections['core'].write._push([], false);
      const res = await dal.deleteEventCustomRule(ctx, args);
      chaiExpect(res).to.deep.equal(result);
    });
  });

  describe('#eventCustomRules', function () {
    it('should get custom rules', async function () {
      const context = mockUtil.makeContext();
      const args = {
        organizationId: 1,
        offset: 2,
        limit: 3
      };
      const expectedArgs = [1, 2, 3];
      const records = [{}, {}, {}];
      serviceContext.dbConnections['core'].read._push(
        records,
        true,
        [],
        (sql, sqlArgs) => {
          chaiExpect(sqlArgs).to.deep.equal(expectedArgs);
          return true;
        }
      );

      const res = await dal.eventCustomRules(context, args);
      chaiExpect(res.count).to.equal(records.length);
      chaiExpect(res.limit).to.equal(args.limit);
      chaiExpect(res.offset).to.equal(args.offset);
      chaiExpect(res.records).to.deep.equal(records);
    });
  });

  describe('#eventCustomRule', function () {
    it('should get event custom rule by id', async function () {
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
          chaiExpect(sqlArgs).to.deep.equal(expectedArgs);
          return true;
        }
      );
      const res = await dal.eventCustomRule(context, args);
      chaiExpect(res).to.deep.equal(record);
    });
  });
});
