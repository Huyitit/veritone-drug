const chaiExpect = require('chai').expect;
const { v5: uuidv5 } = require('uuid');

const serviceContext = require('../test/serviceContext.mock.js')({ mockMessaging: false });

const uuidNamespace = 'a3adfc18-628e-4c2e-96c6-e3bfc541a913';

beforeEach(() => {
  Object.keys(serviceContext.dbConnections).forEach((key) => {
    const conn = serviceContext.dbConnections[key];
    if (conn.read) conn.read._clearResultQueue();
    if (conn.write) conn.write._clearResultQueue();
  });
});

describe('#csrdsAutomation', function () {
  describe('#createEvents', function () {
    it('should return results array with station metadata for valid playbackstate', function () {
      const adapter = require('./csrdsAutomation')(serviceContext);
      const req = {
        body: {
          playbackstate: {
            currenttime: '06/12/26 10:00:00',
            remaining: '00:01:00',
            play: [{ cutid: 'CUT001', length: '00:30' }]
          }
        }
      };
      const res = adapter.createEvents('registry-1', req);
      chaiExpect(res).to.be.an('array');
      chaiExpect(res).to.have.length(1);
      chaiExpect(res[0].stationCallSign).to.equal('WBNS');
      chaiExpect(res[0].stationBand).to.equal('FM');
      chaiExpect(res[0].id).to.equal(uuidv5('CUT001', uuidNamespace));
      chaiExpect(res[0].cutid).to.equal('CUT001');
      chaiExpect(res[0].startDateTime).to.equal('2026-06-12T10:00:30');
      chaiExpect(res[0].endDateTime).to.equal('2026-06-12T10:01:30');
      chaiExpect(res[0].duration).to.equal(30000);
    });

    it('should compute first-event startDateTime as currenttime offset by remaining minus event length', function () {
      const adapter = require('./csrdsAutomation')(serviceContext);
      // remaining=300s, event.length=90s → diff=210s → startDateTime = currenttime + 210s
      const req = {
        body: {
          playbackstate: {
            currenttime: '06/12/26 12:00:00',
            remaining: '00:05:00',
            play: [{ cutid: 'CUT002', length: '01:30' }]
          }
        }
      };
      const res = adapter.createEvents('registry-1', req);
      chaiExpect(res).to.be.an('array');
      chaiExpect(res).to.have.length(1);
      chaiExpect(res[0].startDateTime).to.equal('2026-06-12T12:03:30');
      chaiExpect(res[0].endDateTime).to.equal('2026-06-12T12:08:30');
    });
  });
});
