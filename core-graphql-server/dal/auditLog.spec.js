const chaiExpect = require('chai').expect;
const _ = require('lodash');
const fs = require('fs');
const httpMock = require('node-mocks-http');
const moment = require('moment');

const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

const dal = require('./auditLog.js')(serviceContext);

describe('dalEngineResult.js', function () {
  describe('#getAuditLog', function () {
    it('should get audit log - default time filter', async function () {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'event123',
            event_type: 'Create',
            object_id: '123',
            object_type: 'TemporalDataObject',
            user_name: 'user@veritone.com',
            organization_id: 7682,
            success: true,
            description: 'Test create object',
            created_date: moment().valueOf(),
            ip_address: '127.0.0.1',
            user_agent: 'python3/test'
          }
        ],
        true,
        ['created_date', 'created_date_time', 'client_ip_address'],
        (sql, args) => {
          // first arg (created_date <= $1) should be now
          if (moment().isBefore(moment(args[0]))) return false;
          if (moment(args[0]).isBefore(moment().subtract(2, 'days')))
            return false;
          // second args (created_date >= $2) should be now - 1 week
          if (moment(args[1]).isBefore(moment().subtract(11, 'days')))
            return false;
          if (moment().subtract(3, 'days').isBefore(moment(args[1])))
            return false;
          // validate other args
          if (args[3] !== 'TemporalDataObject') return false;
          if (args[4] !== true) return false;
          return true;
        }
      );
      const res = await dal.getAuditLog(mockUtil.makeContext(), {
        eventType: 'Create',
        objectType: 'TemporalDataObject',
        success: true
      });
      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(1);
    });

    it('should get audit log - provided time filter', async function () {
      const now = moment();
      const to = now.subtract(1, 'weeks');
      const from = now.subtract(2, 'weeks');
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'event123',
            event_type: 'Create',
            object_id: '123',
            object_type: 'TemporalDataObject',
            user_name: 'user@veritone.com',
            organization_id: 7682,
            success: true,
            description: 'Test create object',
            created_date: from.valueOf(),
            ip_address: '127.0.0.1',
            user_agent: 'python3/test'
          }
        ],
        true,
        ['created_date', 'created_date_time', 'client_ip_address'],
        (sql, args) => {
          // first arg (created_date <= $1) should be to
          if (args[0] !== to.toISOString()) return false;
          // first arg (created_date >= $1) should be from
          if (args[1] !== from.toISOString()) return false;
          // validate other args
          if (args[3] !== 'TemporalDataObject') return false;
          if (args[4] !== true) return false;
          return true;
        }
      );

      const res = await dal.getAuditLog(mockUtil.makeContext(), {
        eventType: 'Create',
        objectType: 'TemporalDataObject',
        success: true,
        toDateTime: to.valueOf(),
        fromDateTime: from.valueOf(),
        orderBy: [
          {
            field: 'clientIpAddress',
            direction: 'asc'
          },
          {
            field: 'id',
            direction: 'desc'
          }
        ]
      });
      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(1);
    });
  });
});
