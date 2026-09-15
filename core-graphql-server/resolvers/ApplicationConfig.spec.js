const chaiExpect = require('chai').expect;
const serviceContext = require('../test/serviceContext.mock.js')();
let resolvers = require('./ApplicationConfig.js')(serviceContext);

describe('#ApplicationConfig', function () {
  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
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
            email: 'email@test.com',
            imageUrl: 'test.com',
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
      chaiExpect(res.firstName).to.equal('test');
      chaiExpect(res.lastName).to.equal('user');
      chaiExpect(res.name).to.equal('test user');
      chaiExpect(res.imageUrl).to.equal('test.com');
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
            email: 'email@test.com',
            imageUrl: 'test.com',
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
      chaiExpect(res.firstName).to.equal('test');
      chaiExpect(res.lastName).to.equal('user');
      chaiExpect(res.name).to.equal('test user');
      chaiExpect(res.imageUrl).to.equal('test.com');
    });
  });

  describe('#defaultCreatedBy', function () {
    it('should get user', async function () {
      const userId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            user_id: userId,
            user_name: 'test user',
            firstName: 'test',
            lastName: 'user',
            email: 'email@test.com',
            imageUrl: 'test.com',
            kvp: {
              firstName: 'test',
              lastName: 'user'
            }
          }
        ],
        false
      );
      const res = await resolvers.defaultCreatedBy({
        defaultCreatedBy: userId
      });
      chaiExpect(res.id).to.equal(userId);
      chaiExpect(res.firstName).to.equal('test');
      chaiExpect(res.lastName).to.equal('user');
      chaiExpect(res.name).to.equal('test user');
      chaiExpect(res.imageUrl).to.equal('test.com');
    });
  });

  describe('#defaultModifiedBy', function () {
    it('should get user', async function () {
      const userId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            user_id: userId,
            user_name: 'test user',
            firstName: 'test',
            lastName: 'user',
            email: 'email@test.com',
            imageUrl: 'test.com',
            kvp: {
              firstName: 'test',
              lastName: 'user'
            }
          }
        ],
        false
      );
      const res = await resolvers.defaultModifiedBy({
        defaultModifiedBy: userId
      });
      chaiExpect(res.id).to.equal(userId);
      chaiExpect(res.firstName).to.equal('test');
      chaiExpect(res.lastName).to.equal('user');
      chaiExpect(res.name).to.equal('test user');
      chaiExpect(res.imageUrl).to.equal('test.com');
    });
  });
});
