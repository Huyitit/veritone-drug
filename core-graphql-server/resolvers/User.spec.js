const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../test/serviceContext.mock.js')();
let resolvers = require('./User.js')(serviceContext);

describe('#User', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(resolvers).to.be.a('object');
      const keys = Object.keys(resolvers);
      chaiExpect(keys.length).to.equal(17);

      keys.forEach((key) => {
        chaiExpect(typeof resolvers[key]).to.equal('function');
      });
    });
  });
  describe('#organization', function () {
    it('should get organization', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'test'
        }
      ]);
      const res = await resolvers.organization(
        { organizationId: '7682' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(7682);
    });
  });

  describe('#organizationGuids', function () {
    it('should get organizationGuids', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: '00000000-1111-0000-0000-000000000000'
        }
      ]);
      const res = await resolvers.organizationGuids(
        { id: '00000000-aaaa-0000-0000-000000000000' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res[0]).to.equal('00000000-1111-0000-0000-000000000000');
    });
  });
});
