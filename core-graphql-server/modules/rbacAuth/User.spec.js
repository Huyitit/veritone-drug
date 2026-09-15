const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../../test/mockUtil.js')();
const serviceContext = require('../../test/serviceContext.mock.js')();
let resolvers = require('./User.js')(serviceContext);

describe('#User', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      const query = require('./User.js')(serviceContext);
      chaiExpect(query).to.be.a('object');
      const keys = Object.keys(query);
      chaiExpect(keys.length).to.equal(2);

      keys.forEach((key) => {
        chaiExpect(typeof query[key]).to.equal('function');
      });
    });
  });

  describe('#authGroupIds', function () {
    it('should get authGroupIds', async function () {
      serviceContext.dbConnections['sso'].read._push([
        { id: 'ag_1' },
        { id: 'ag_2' }
      ]);
      const res = await resolvers.authGroupIds({
        id: '00000000-aaaa-0000-0000-000000000000',
        organizationGuid: '00000000-1111-0000-0000-000000000000'
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(2);
    });
    it('should get authGroupIds from context', async function () {
      const userId = '00000000-aaaa-0000-0000-000000000000';
      const context = _.merge({}, mockUtil.makeContext(), {
        _authInfo: {
          userId,
          authGroups: ['ag_1', 'ag_2']
        }
      });

      const res = await resolvers.authGroupIds(
        {
          id: userId,
          organizationGuid: '00000000-1111-0000-0000-000000000000'
        },
        {},
        context
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(2);
    });
  });

  describe('#authGroups', function () {
    const rbacAuthDal = {
      getAuthGroups: jest.fn()
    };
    const organizationDal = {
      getOrganization: jest.fn()
    };
    beforeAll(() => {
      rbacAuthDal.getAuthGroups = jest.fn();
      organizationDal.getOrganization = jest.fn();

      _.set(serviceContext, 'dal.rbacAuth', rbacAuthDal);
      _.set(serviceContext, 'dal.organization', organizationDal);

      resolvers = require('./User.js')(serviceContext);
    });
    beforeEach(() => {
      serviceContext._clearAll();
    });

    it('should get authGroups', async function () {
      rbacAuthDal.getAuthGroups.mockResolvedValue({
        records: [
          {
            id: '-----orgAdminID-----',
            name: 'orgAdmin',
            organizationId: '5d11da00-8eec-46eb-9922-b5cc3a911aa8'
          },
          {
            id: '-----orgAllAccessID-----',
            name: 'orgAllAccess',
            organizationId: '665d2eb5-758e-4db2-a5da-8bf94a517469'
          }
        ]
      });
      organizationDal.getOrganization.mockResolvedValue({
        id: '-----orgID-----',
        name: 'orgName'
      });

      const res = await resolvers.authGroups({
        id: '00000000-aaaa-0000-0000-000000000000',
        organizationGuid: '00000000-1111-0000-0000-000000000000'
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.records.length).to.equal(2);
    });
  });
});
