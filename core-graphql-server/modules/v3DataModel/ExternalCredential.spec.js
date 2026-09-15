const chaiExpect = require('chai').expect;

const serviceContext = require('../../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const resolvers = require('./ExternalCredential.js')(
  serviceContext,
  serviceContext.config
);

describe('#ExternalCredential', function () {
  describe('#require', function () {
    it('should load module and return empty resolver map', function () {
      chaiExpect(resolvers).to.be.a('object');
      chaiExpect(Object.keys(resolvers).length).to.equal(0);
    });
  });
});
