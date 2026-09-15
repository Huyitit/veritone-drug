'use strict';

// Mock sub-DAL modules before requiring index.js.
// transform:{} means jest.mock is not auto-hoisted — these must appear before require().
jest.mock('./cluster', () => () => ({ _module: 'cluster' }));
jest.mock('./node', () => () => ({ _module: 'node' }));
jest.mock('./engine', () => () => ({ _module: 'engine' }));
jest.mock('./engine-category', () => () => ({ _module: 'engineCategory' }));
jest.mock('./build', () => () => ({ _module: 'build' }));
jest.mock('./task', () => () => ({ _module: 'task' }));
jest.mock('./job', () => () => ({ _module: 'job' }));
jest.mock('./build-capability', () => () => ({ _module: 'buildCapability' }));

const chaiExpect = require('chai').expect;
const initDal = require('./index');

const APP = {};
const MODEL = {};
const POOLS = {};

describe('core-job-server/dal/index.js', function () {
  describe('init guards', function () {
    it('throws "missing app object" when app is not an object', function () {
      chaiExpect(() => initDal(null, MODEL, POOLS)).to.throw('missing app object');
    });

    it('throws "missing model" when model is not an object', function () {
      chaiExpect(() => initDal(APP, null, POOLS)).to.throw('missing model');
    });

    it('throws "missing pools object" when pools is not an object', function () {
      chaiExpect(() => initDal(APP, MODEL, null)).to.throw('missing pools object');
    });
  });

  describe('dal shape', function () {
    it('returns an object with all expected sub-DAL keys', function () {
      const dal = initDal(APP, MODEL, POOLS);
      const expected = [
        'cluster',
        'node',
        'engine',
        'engineCategory',
        'build',
        'task',
        'job',
        'buildCapability',
      ];
      expected.forEach((key) => {
        chaiExpect(dal, `key "${key}" missing from dal`).to.have.property(key);
      });
    });
  });
});
