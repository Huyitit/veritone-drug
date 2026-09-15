'use strict';

const chaiExpect = require('chai').expect;
const createPg = require('./old');

function makePg(schemaName) {
  const query = jest.fn(() => Promise.resolve({ rows: [] }));
  const pools = { core: { query } };
  return { pg: createPg(pools, schemaName || 'aiware'), query };
}

describe('core-job-server/dal/old.js', function () {
  describe('#getSchemaName', function () {
    it('returns the schema name passed at construction', function () {
      const { pg } = makePg('my_schema');
      chaiExpect(pg.getSchemaName()).to.equal('my_schema');
    });
  });

  describe('#camelizeRootKeys', function () {
    it('converts snake_case root keys to camelCase', function () {
      const { pg } = makePg();
      const result = pg.camelizeRootKeys({ foo_bar: 1, baz_qux: 'v' });
      chaiExpect(result).to.deep.equal({ fooBar: 1, bazQux: 'v' });
    });

    it('throws "Missing input!" on non-object input', function () {
      const { pg } = makePg();
      chaiExpect(() => pg.camelizeRootKeys('not-an-object')).to.throw('Missing input!');
    });
  });

  describe('#decamelizeRootKeys', function () {
    it('converts camelCase root keys to snake_case', function () {
      const { pg } = makePg();
      const result = pg.decamelizeRootKeys({ fooBar: 1, bazQux: 'v' });
      chaiExpect(result).to.deep.equal({ foo_bar: 1, baz_qux: 'v' });
    });

    it('throws "Missing input!" on non-object input', function () {
      const { pg } = makePg();
      chaiExpect(() => pg.decamelizeRootKeys(42)).to.throw('Missing input!');
    });
  });

  describe('#execute', function () {
    it('calls pools.core.query and passes result to callback on success', async function () {
      const dbResult = { rows: [{ id: 1 }] };
      const query = jest.fn(() => Promise.resolve(dbResult));
      const pg = createPg({ core: { query } }, 'test');

      let cbResult;
      await pg.execute('SELECT 1', [], (err, res) => {
        cbResult = { err, res };
      });

      chaiExpect(cbResult.err).to.equal(null);
      chaiExpect(cbResult.res).to.equal(dbResult);
      chaiExpect(query.mock.calls[0]).to.deep.equal(['SELECT 1', []]);
    });

    it('passes query error to callback on failure', async function () {
      const boom = new Error('db failure');
      const query = jest.fn(() => Promise.reject(boom));
      const pg = createPg({ core: { query } }, 'test');

      let cbResult;
      await pg.execute('SELECT 1', [], (err, res) => {
        cbResult = { err, res };
      });

      chaiExpect(cbResult.err).to.equal(boom);
      chaiExpect(cbResult.res).to.equal(null);
    });

    it('treats callback-as-second-arg as params-omitted form', async function () {
      const dbResult = { rows: [] };
      const query = jest.fn(() => Promise.resolve(dbResult));
      const pg = createPg({ core: { query } }, 'test');

      let cbResult;
      await pg.execute('SELECT 1', (err, res) => {
        cbResult = { err, res };
      });

      chaiExpect(cbResult.err).to.equal(null);
      chaiExpect(query.mock.calls[0]).to.deep.equal(['SELECT 1', undefined]);
    });
  });

  describe('#executeRead / #executeWrite', function () {
    it('executeRead delegates to execute', async function () {
      const dbResult = { rows: [] };
      const query = jest.fn(() => Promise.resolve(dbResult));
      const pg = createPg({ core: { query } }, 'test');

      let cbResult;
      await pg.executeRead('SELECT 1', [], (err, res) => {
        cbResult = { err, res };
      });

      chaiExpect(cbResult.err).to.equal(null);
      chaiExpect(cbResult.res).to.equal(dbResult);
    });

    it('executeWrite delegates to execute', async function () {
      const dbResult = { rows: [] };
      const query = jest.fn(() => Promise.resolve(dbResult));
      const pg = createPg({ core: { query } }, 'test');

      let cbResult;
      await pg.executeWrite('INSERT INTO t', [], (err, res) => {
        cbResult = { err, res };
      });

      chaiExpect(cbResult.err).to.equal(null);
      chaiExpect(cbResult.res).to.equal(dbResult);
    });
  });
});
