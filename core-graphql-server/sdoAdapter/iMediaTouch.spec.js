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

describe('#iMediaTouch', function () {
  describe('#createEvents', function () {
    it('should return results array with camelized keys, parsed timestamps, and stationId dash for valid playlist entry', function () {
      const adapter = require('./iMediaTouch')(serviceContext);
      const req = {
        body: {
          playlist: {
            entry: [
              {
                $: {
                  id: 'CLIP001',
                  start_time: 'Fri Jun 12 10:00:00 2026',
                  duration: '30000',
                  station_id: 'WBNS_FM'
                }
              }
            ]
          }
        }
      };
      const res = adapter.createEvents('registry-1', req);
      chaiExpect(res).to.be.an('array');
      chaiExpect(res).to.have.length(1);
      // camelizeRootKeys converted start_time → startTime and station_id → stationId
      chaiExpect(res[0].startTime).to.equal('Fri Jun 12 10:00:00 2026');
      chaiExpect(res[0].startDateTime).to.equal('2026-06-12T10:00:00');
      chaiExpect(res[0].endDateTime).to.equal('2026-06-12T10:00:30');
      chaiExpect(res[0].duration).to.equal(30000);
      // underscore in stationId value replaced with dash
      chaiExpect(res[0].stationId).to.equal('WBNS-FM');
      chaiExpect(res[0].id).to.equal(uuidv5('CLIP001', uuidNamespace));
    });
  });
});
