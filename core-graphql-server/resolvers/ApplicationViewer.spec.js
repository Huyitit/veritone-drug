const chaiExpect = require('chai').expect;
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../test/serviceContext.mock.js')();
let resolvers = require('./ApplicationViewer.js')(serviceContext);

describe('#Application Viewer', function () {
  describe('#signedIconUrl', function () {
    it('should get signed icon url', async function () {
      const icon = 'https://dev-api.veritone.amazonaws.com/test/123?signed=abc';
      const res = await resolvers.signedIconUrl({
        icon: icon
      });
      chaiExpect(res).to.equal(icon);
    });
  });

  describe('#modifiedBy', function () {
    it('should get user', async function () {
      const userId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            user_id: userId,
            user_name: 'test user',
            firstName: 'test',
            lastName: 'user',
            kvp: {
              firstName: 'test',
              lastName: 'user'
            }
          }
        ],
        false
      );
      const res = await resolvers.modifiedBy({ modifiedBy: userId });
      chaiExpect(res.id).to.equal(userId);
    });
  });

  describe('#createdBy', function () {
    it('should get user', async function () {
      const userId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            user_id: userId,
            user_name: 'test user',
            firstName: 'test',
            lastName: 'user',
            kvp: {
              firstName: 'test',
              lastName: 'user'
            }
          }
        ],
        false
      );
      const res = await resolvers.createdBy({ createdBy: userId });
      chaiExpect(res.id).to.equal(userId);
    });
  });

  describe('#applicationViewerBuilds', function () {
    it('should get application viewer builds', async function () {
      const uuid = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      const uuid2 = '4b1de633-8745-403f-b6ea-5c77cb22a76a';
      serviceContext.dbConnections['core'].write._push(
        [
          {
            viewerBuildId: uuid,
            viewerId: uuid2,
            sourceUrl: 'https://www.fake.com',
            accessUrl: 'https://www.fake.com',
            status: 'deployed',
            version: 1
          }
        ],
        false
      );
      const res = await resolvers.applicationViewerBuilds(
        { viewerIds: [uuid2] },
        {},
        { ...mockUtil.makeContext() }
      );
      chaiExpect(res.records[0].id).to.equal(uuid);
    });
  });
});
