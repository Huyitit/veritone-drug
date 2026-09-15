const chaiExpect = require('chai').expect;

const initClusterDal = require('./cluster.js');

function makeDeps(queryImpl) {
  const fromDB = jest.fn((row) => ({ id: row.cluster_id, _model: true }));
  const query = jest.fn(queryImpl || (() => Promise.resolve([])));
  const pools = { core: { query } };
  const model = { Cluster: { fromDB } };
  const dal = initClusterDal({}, model, pools);
  return { dal, query, fromDB, pools };
}

// Wrap the (err, result) callback so tests can await it.
function callbackPromise(invoke) {
  return new Promise((resolve) => invoke((err, res) => resolve({ err, res })));
}

describe('core-job-server/dal/cluster.js', function () {
  describe('module shape', function () {
    it('exposes deleteCluster, pauseCluster, unpauseCluster', function () {
      const { dal } = makeDeps();
      ['deleteCluster', 'pauseCluster', 'unpauseCluster'].forEach((fn) =>
        chaiExpect(typeof dal[fn]).to.equal('function')
      );
    });
  });

  describe('#deleteCluster', function () {
    it('throws "missing callback" when no callback is provided', async function () {
      const { dal } = makeDeps();
      let thrown;
      try {
        await dal.deleteCluster('c1', {}, null);
      } catch (e) {
        thrown = e;
      }
      chaiExpect(thrown).to.exist;
      chaiExpect(thrown.message).to.equal('missing callback');
    });

    it('soft-deletes scoped to cluster_id + deleted_date is null and returns the mapped cluster', async function () {
      const row = { cluster_id: 'c1', organization_id: '7' };
      const { dal, query, fromDB } = makeDeps(() => Promise.resolve([row]));
      const { err, res } = await callbackPromise((cb) =>
        dal.deleteCluster('c1', { query }, cb)
      );
      chaiExpect(err).to.equal(null);
      chaiExpect(fromDB.mock.calls[0][0]).to.deep.equal(row);
      chaiExpect(res).to.deep.equal({ id: 'c1', _model: true });
      const [sql, params] = query.mock.calls[0];
      chaiExpect(sql).to.contain('aiware.cluster');
      chaiExpect(sql).to.contain('deleted_date = $1');
      chaiExpect(sql).to.contain('cluster_id = $2 AND deleted_date is null');
      chaiExpect(params[1]).to.equal('c1');
    });

    it('returns (null, null) when no row matches', async function () {
      const { dal, query } = makeDeps(() => Promise.resolve([]));
      const { err, res } = await callbackPromise((cb) =>
        dal.deleteCluster('c1', { query }, cb)
      );
      chaiExpect(err).to.equal(null);
      chaiExpect(res).to.equal(null);
    });

    it('passes a query error to the callback', async function () {
      const boom = new Error('db down');
      const { dal, query } = makeDeps(() => Promise.reject(boom));
      const { err, res } = await callbackPromise((cb) =>
        dal.deleteCluster('c1', { query }, cb)
      );
      chaiExpect(err).to.equal(boom);
      chaiExpect(res).to.equal(null);
    });

    it('falls back to pools.core when no dbClient is supplied', async function () {
      const { dal, pools } = makeDeps(() => Promise.resolve([]));
      await callbackPromise((cb) => dal.deleteCluster('c1', undefined, cb));
      chaiExpect(pools.core.query.mock.calls.length).to.equal(1);
    });
  });

  describe('#pauseCluster / #unpauseCluster', function () {
    it('pauseCluster sets paused = true', async function () {
      const { dal, query } = makeDeps(() =>
        Promise.resolve([{ cluster_id: 'c1' }])
      );
      await callbackPromise((cb) => dal.pauseCluster('c1', { query }, cb));
      chaiExpect(query.mock.calls[0][0]).to.contain('paused = true');
    });

    it('unpauseCluster sets paused = false', async function () {
      const { dal, query } = makeDeps(() =>
        Promise.resolve([{ cluster_id: 'c1' }])
      );
      await callbackPromise((cb) => dal.unpauseCluster('c1', { query }, cb));
      chaiExpect(query.mock.calls[0][0]).to.contain('paused = false');
    });
  });
});
