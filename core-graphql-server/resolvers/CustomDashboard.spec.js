const chaiExpect = require('chai').expect;
const resolver = require('./CustomDashboard.js')();
describe('CustomDashboard.js', function () {
  describe('#require', function () {
    it('should have correct structure', async function () {
      chaiExpect(typeof resolver.description).to.equal('function');
    });

    it('should resolve description', async function () {
      const obj = {};
      chaiExpect(resolver.description(obj)).to.equal('');
    });
  });
});
