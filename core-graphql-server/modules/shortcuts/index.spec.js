const chaiExpect = require('chai').expect;

// This package runs jest with transform:{} (no babel) ⇒ jest.mock is NOT hoisted. Declare the
// mocks, then require the module under test, in source order (same pattern as oktaAuth.spec.js).
const mockGetEngineCategoriesDb = jest.fn();
const mockValidators = {};

jest.mock('veritone-json-schemas', () => ({ VALIDATORS: mockValidators }));
jest.mock('../../dal/engineCategory', () => () => ({
  getEngineCategoriesDb: mockGetEngineCategoriesDb
}));

const httpMock = require('node-mocks-http');
const Shortcuts = require('./index.js');

function makeServiceContext() {
  return { logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } };
}

// The handler only reads req.body and req.param.validationContract.
function makeReq(body, param) {
  return { body: body || {}, param: param || {} };
}

function sentData(res) {
  const d = res._getData();
  return typeof d === 'string' && d.length ? JSON.parse(d) : d;
}

describe('shortcuts/index.js', function () {
  let shortcuts;

  beforeEach(function () {
    mockGetEngineCategoriesDb.mockReset();
    for (const k of Object.keys(mockValidators)) {
      delete mockValidators[k];
    }
    shortcuts = new Shortcuts(makeServiceContext());
  });

  describe('module shape (TODO #1)', function () {
    it('exports the Shortcuts constructor with a bound validateEngineOutput', function () {
      chaiExpect(typeof Shortcuts).to.equal('function');
      chaiExpect(typeof shortcuts.validateEngineOutput).to.equal('function');
    });
  });

  describe('#validateEngineOutput', function () {
    it('400 INVALID_INPUT when no contract is specified and not exactly one is present (TODO #2)', async function () {
      const req = makeReq({ validationContracts: [] });
      const res = httpMock.createResponse();
      await shortcuts.validateEngineOutput(req, res);
      chaiExpect(Number(res._getStatusCode())).to.equal(400);
      const body = sentData(res);
      chaiExpect(body.errors[0].name).to.equal('invalid_input');
      chaiExpect(body.errors[0].message).to.contain(
        'one and only one validationContract'
      );
      // guard short-circuits before any DB lookup
      chaiExpect(mockGetEngineCategoriesDb.mock.calls.length).to.equal(0);
    });

    it('400 NOT_FOUND for an unsupported validationContract (TODO #3)', async function () {
      mockGetEngineCategoriesDb.mockResolvedValue({ count: 1 });
      // no validator registered for this contract ⇒ !validator ⇒ NOT_FOUND
      const req = makeReq({ validationContracts: ['unsupported-contract'] });
      const res = httpMock.createResponse();
      await shortcuts.validateEngineOutput(req, res);
      chaiExpect(Number(res._getStatusCode())).to.equal(400);
      chaiExpect(sentData(res).errors[0].name).to.equal('not_found');
    });

    it('returns { data: results } when the validator passes (TODO #4)', async function () {
      mockGetEngineCategoriesDb.mockResolvedValue({ count: 1 });
      const results = { valid: true, normalized: { ok: true } };
      mockValidators['transcript'] = jest.fn(() => results);
      const req = makeReq({ validationContracts: ['transcript'] });
      const res = httpMock.createResponse();
      await shortcuts.validateEngineOutput(req, res);
      chaiExpect(Number(res._getStatusCode())).to.equal(200);
      chaiExpect(sentData(res).data).to.deep.equal(results);
    });

    it('400 INVALID_INPUT with validationErrors when the validator fails (TODO #5)', async function () {
      mockGetEngineCategoriesDb.mockResolvedValue({ count: 1 });
      const errors = [{ keyword: 'required', message: 'missing field' }];
      mockValidators['transcript'] = jest.fn(() => ({ valid: false, errors }));
      const req = makeReq({ validationContracts: ['transcript'] });
      const res = httpMock.createResponse();
      await shortcuts.validateEngineOutput(req, res);
      chaiExpect(Number(res._getStatusCode())).to.equal(400);
      const body = sentData(res);
      chaiExpect(body.errors[0].name).to.equal('invalid_input');
      chaiExpect(body.errors[0].validationErrors).to.deep.equal(errors);
    });
  });
});
