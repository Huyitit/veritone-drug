const chaiExpect = require('chai').expect;
const { v5: uuidv5 } = require('uuid');

const serviceContext = require('../test/serviceContext.mock.js')({ mockMessaging: false });

const uuidNamespace = 'a3adfc18-628e-4c2e-96c6-e3bfc541a913';
const PINNED_TIME = new Date('2026-06-12T10:00:00.000Z');

beforeEach(() => {
  jest.setSystemTime(PINNED_TIME);
  Object.keys(serviceContext.dbConnections).forEach((key) => {
    const conn = serviceContext.dbConnections[key];
    if (conn.read) conn.read._clearResultQueue();
    if (conn.write) conn.write._clearResultQueue();
  });
});

describe('#audioVault', function () {
  describe('#createEvents', function () {
    it('should return single-element array for valid pipe-delimited payload', function () {
      const adapter = require('./audioVault')(serviceContext);
      const req = {
        body: {
          data: '400 | 0524|104744|48499-RA-ELGK|ELK GROVE KIA|COM|00:00:59|'
        }
      };
      const res = adapter.createEvents('registry-1', req);
      chaiExpect(res).to.be.an('array');
      chaiExpect(res).to.have.length(1);
      chaiExpect(res[0].eventId).to.equal(' 0524');
      chaiExpect(res[0].cartId).to.equal('104744');
      chaiExpect(res[0].title).to.equal('48499-RA-ELGK');
      chaiExpect(res[0].artist).to.equal('ELK GROVE KIA');
      chaiExpect(res[0].category).to.equal('COM');
      chaiExpect(res[0].length).to.equal('00:00:59');
      chaiExpect(res[0].duration).to.equal(59000);
      chaiExpect(res[0].stationName).to.equal('KHTK-AM');
      chaiExpect(res[0].id).to.be.a('string').and.not.empty;
      chaiExpect(res[0].startDateTime).to.equal('2026-06-12T10:00:00.000Z');
      chaiExpect(res[0].stopDateTime).to.equal('2026-06-12T10:00:59.000Z');
    });

    it('should throw Error when body.data is nil', function () {
      const adapter = require('./audioVault')(serviceContext);
      const req = { body: {} };
      let err;
      try {
        adapter.createEvents('registry-1', req);
      } catch (e) {
        err = e;
      }
      chaiExpect(err).to.be.instanceOf(Error);
      chaiExpect(err.message).to.equal('Invalid content body for Audio Vault');
    });
  });
});
