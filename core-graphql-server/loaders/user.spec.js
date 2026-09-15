const chaiExpect = require('chai').expect;

function makeServiceContext(batchLimit) {
  return {
    config: batchLimit
      ? { paging: { defaultBatchTaskLimit: batchLimit } }
      : {},
    dal: {
      admin: {
        getUsersWithBasicInfo: jest.fn()
      }
    }
  };
}

describe('user.js', function () {
  describe('#require', function () {
    it('should export batchUsersByIds function', function () {
      const loader = require('./user.js')(makeServiceContext());
      chaiExpect(typeof loader).to.equal('object');
      chaiExpect(Object.keys(loader).length).to.equal(1);
      chaiExpect(typeof loader.batchUsersByIds).to.equal('function');
    });
  });

  describe('#batchUsersByIds', function () {
    it('should return users in the same order as input keys', async function () {
      let res, err;
      const sc = makeServiceContext();
      const loader = require('./user.js')(sc);
      const keys = ['user-c', 'user-a', 'user-b'];

      sc.dal.admin.getUsersWithBasicInfo.mockResolvedValueOnce([
        { id: 'user-a' },
        { id: 'user-b' },
        { id: 'user-c' }
      ]);

      try {
        res = await loader.batchUsersByIds({}, keys);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(3);
      chaiExpect(res[0].id).to.equal('user-c');
      chaiExpect(res[1].id).to.equal('user-a');
      chaiExpect(res[2].id).to.equal('user-b');
    });

    it('should deduplicate keys before calling getUsersWithBasicInfo', async function () {
      let res, err;
      const sc = makeServiceContext();
      const loader = require('./user.js')(sc);
      const keys = ['user-1', 'user-2', 'user-1'];

      sc.dal.admin.getUsersWithBasicInfo.mockResolvedValueOnce([
        { id: 'user-1' },
        { id: 'user-2' }
      ]);

      try {
        res = await loader.batchUsersByIds({}, keys);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(
        sc.dal.admin.getUsersWithBasicInfo.mock.calls.length
      ).to.equal(1);
      chaiExpect(
        sc.dal.admin.getUsersWithBasicInfo.mock.calls[0][0].userIds.length
      ).to.equal(2);
      chaiExpect(res.length).to.equal(3);
      chaiExpect(res[0].id).to.equal('user-1');
      chaiExpect(res[2].id).to.equal('user-1');
    });

    it('should return undefined for keys not found in response', async function () {
      let res, err;
      const sc = makeServiceContext();
      const loader = require('./user.js')(sc);
      const keys = ['user-found', 'user-missing'];

      sc.dal.admin.getUsersWithBasicInfo.mockResolvedValueOnce([
        { id: 'user-found' }
      ]);

      try {
        res = await loader.batchUsersByIds({}, keys);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res.length).to.equal(2);
      chaiExpect(res[0].id).to.equal('user-found');
      chaiExpect(res[1]).to.be.undefined;
    });

    it('should issue multiple fetches when keys exceed defaultBatchTaskLimit', async function () {
      let res, err;
      const sc = makeServiceContext(2);
      const loader = require('./user.js')(sc);
      const keys = ['user-1', 'user-2', 'user-3'];

      sc.dal.admin.getUsersWithBasicInfo
        .mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }])
        .mockResolvedValueOnce([{ id: 'user-3' }]);

      try {
        res = await loader.batchUsersByIds({}, keys);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(
        sc.dal.admin.getUsersWithBasicInfo.mock.calls.length
      ).to.equal(2);
      chaiExpect(res.length).to.equal(3);
      chaiExpect(res[2].id).to.equal('user-3');
    });
  });
});
