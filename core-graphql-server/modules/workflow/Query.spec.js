const chaiExpect = require('chai').expect;
const mockUtil = require('../../test/mockUtil.js')();
// get mock base service context
const serviceContext = require('../../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const query = require('./Query.js')(serviceContext);

let context = mockUtil.makeContext();

describe('Query workflow', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      const keys = Object.keys(query);
      chaiExpect(keys.length).to.equal(13);
    });
  });

  describe('#functions', function () {
    it('should call all resolver functions', async function () {
      const keys = Object.keys(query);
      for (const key of keys) {
        if (typeof query[key] === 'function') {
          try {
            await query[key]({}, { id: '' }, context);
          } catch (err) {
            if (!err.name) throw err;
          }
        }
      }
    });
  });
});
