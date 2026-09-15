const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../test/serviceContext.mock.js')();
let resolvers = require('./UserACL.js')(serviceContext);

describe('#UserACL', function () {
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
});
