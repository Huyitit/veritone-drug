const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const mockUtil = require('../../../test/mockUtil.js')();
const serviceContext = require('../../../test/serviceContext.mock.js')();

let dal;

const coreDbWrite = serviceContext.dbConnections['core'].write;
const coreDbRead = serviceContext.dbConnections['core'].read;

function makeContext(options) {
  return mockUtil.makeContext(options);
}

function expectFunction(obj, key) {
  chaiExpect(typeof obj[key]).to.equal('function');
}

describe('scheduledEvent.js', function () {
  beforeAll(() => {
    serviceContext._clearAll();
    dal = require('./scheduledEvent.js')(serviceContext);
  });

  beforeEach(() => {
    coreDbRead._clearResultQueue();
    coreDbWrite._clearResultQueue();
  });

  describe('#require', function () {
    it('should load module', async function () {
      chaiExpect(typeof dal).to.equal('object');
      chaiExpect(Object.keys(dal).length).to.equal(5);

      expectFunction(dal, 'createScheduledEvent');
      expectFunction(dal, 'getScheduledEvent');
      expectFunction(dal, 'getScheduledEvents');
      expectFunction(dal, 'updateScheduledEvent');
      expectFunction(dal, 'deleteScheduledEvent');
    });
  });

  describe('#getScheduledEvent()', function () {
    const id = '00000000-0000-0000-0000-000000000001';
    it('should not find any events', async function () {
      coreDbRead._push([]);

      const res = await dal.getScheduledEvents(makeContext(), { id });

      chaiExpect(res.count).to.equal(0);
    });

    it('should get scheduledEvents with 1 event', async function () {
      coreDbRead._push([
        {
          id,
          name: 'test engine 1',
          schedule: '1 2 3 4 5 6'
        }
      ]);

      const res = await dal.getScheduledEvents(makeContext(), { id: id });
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records[0].id).to.equal(id);
      chaiExpect(res.records[0].name).to.equal('test engine 1');
    });
  });

  describe('#createScheduledEvent()', function () {
    const id = '00000000-0000-0000-0000-000000000001';
    it('should create a scheduled event', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          id,
          name: 'event_name',
          type: 'event_type',
          payload: '{"json": "payload"}',
          schedule: '1 2 3 4 5 6'
        }
      ]);

      const res = await dal.createScheduledEvent(makeContext(), {
        input: {
          name: 'event_name',
          type: 'event_type',
          payload: '{"json": "payload"}',
          schedule: '1 2 3 4 5 6'
        }
      });

      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(id);
      chaiExpect(res.name).to.equal('event_name');
      chaiExpect(res.type).to.equal('event_type');
      chaiExpect(res.payload).to.equal('{"json": "payload"}');
      chaiExpect(res.schedule).to.equal('1 2 3 4 5 6');
    });
  });

  describe('#updateScheduledEvent()', function () {
    const id = '00000000-0000-0000-0000-000000000001';
    it('should create a scheduled event', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id,
          name: 'updated_event_name',
          schedule: '1 2 3 4 5 6'
        }
      ]);

      const res = await dal.updateScheduledEvent(makeContext(), {
        input: {
          id: id,
          name: 'updated_event_name'
        }
      });

      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(id);
      chaiExpect(res.name).to.equal('updated_event_name');
      chaiExpect(res.schedule).to.equal('1 2 3 4 5 6');
    });
  });

  describe('#updateScheduledEvent()', function () {
    const id = '00000000-0000-0000-0000-000000000001';
    it('should create a scheduled event', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id,
          name: 'updated_event_name',
          schedule: '1 2 3 4 5 6'
        }
      ]);

      const res = await dal.updateScheduledEvent(makeContext(), {
        input: {
          id: id,
          name: 'updated_event_name'
        }
      });

      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(id);
      chaiExpect(res.name).to.equal('updated_event_name');
      chaiExpect(res.schedule).to.equal('1 2 3 4 5 6');
    });
  });

  describe('#createScheduledEvent() payload validation (VE-27611 row 14)', function () {
    it('should allow an empty payload through without throwing InvalidInput', async function () {
      coreDbWrite._push([
        {
          id: '3f03e804-cab6-413f-805c-ec36b6e33f5b',
          name: 'event_name',
          type: 'event_type',
          payload: null,
          schedule: '1 2 3 4 5 6'
        }
      ]);

      const res = await dal.createScheduledEvent(makeContext(), {
        input: {
          name: 'event_name',
          type: 'event_type',
          payload: null,
          schedule: '1 2 3 4 5 6'
        }
      });

      chaiExpect(res).to.exist;
      chaiExpect(res.payload).to.equal(null);
    });

    it('should throw InvalidInput when payload is not valid JSON', async function () {
      let err;
      let res;
      try {
        res = await dal.createScheduledEvent(makeContext(), {
          input: {
            name: 'event_name',
            type: 'event_type',
            payload: '{not valid json',
            schedule: '1 2 3 4 5 6'
          }
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });
  });

  describe('#createScheduledEvent() normalizeSchedule cron/date-fallback/throw branches (VE-27378 row 13)', function () {
    it('should fall back to parsing the schedule as a date when it is not a valid cron expression', async function () {
      const isoDate = '2027-01-01T00:00:00.000Z';
      let capturedValues;
      coreDbWrite._push(
        [
          {
            id: '00000000-0000-0000-0000-000000000099',
            name: 'event_name',
            type: 'event_type',
            payload: '{"json":"payload"}',
            schedule: isoDate
          }
        ],
        false,
        [],
        (sql, values) => {
          capturedValues = values;
          return true;
        }
      );

      const res = await dal.createScheduledEvent(makeContext(), {
        input: {
          name: 'event_name',
          type: 'event_type',
          payload: '{"json":"payload"}',
          schedule: isoDate
        }
      });

      chaiExpect(res).to.exist;
      // normalizeSchedule's date fallback re-serializes through
      // moment(...).toISOString(); for an already-ISO input this round-trips
      // to the identical string.
      chaiExpect(capturedValues).to.include(isoDate);
    });

    it('should throw InvalidInput when the schedule is neither a valid cron expression nor a parseable date', async function () {
      let err;
      let res;
      try {
        res = await dal.createScheduledEvent(makeContext(), {
          input: {
            name: 'event_name',
            type: 'event_type',
            payload: '{"json":"payload"}',
            schedule: 'not-a-valid-schedule-at-all'
          }
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });
  });

  describe('#getScheduledEvent() not-found propagation (VE-27611 row 15)', function () {
    it('should throw NotFound when no scheduled event matches the id', async function () {
      coreDbRead._push([]);

      let err;
      let res;
      try {
        res = await dal.getScheduledEvent(makeContext(), {
          id: 'e4d8c9f0-1111-2222-3333-444455556666'
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
    });

    it('should propagate NotFound from deleteScheduledEvent when the id does not exist', async function () {
      coreDbRead._push([]);

      let err;
      let res;
      try {
        res = await dal.deleteScheduledEvent(makeContext(), {
          id: 'e4d8c9f0-1111-2222-3333-444455556666'
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
    });
  });

  describe('#deleteScheduledEvent()', function () {
    const id = '00000000-0000-0000-0000-000000000001';
    it('should create a scheduled event', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id
        }
      ]);

      const res = await dal.deleteScheduledEvent(makeContext(), {
        id: id
      });

      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(id);
    });
  });
});
