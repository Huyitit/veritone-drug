const chaiExpect = require('chai').expect;
const _ = require('lodash');

describe('containerInfo.js', function () {
  describe('#require', function () {
    it('should load', function () {
      const ci = require('./containerInfo.js')('./test/containerInfo.json');
      const info = ci.getInfo();
      chaiExpect(info.clusterName).to.equal('default');
      chaiExpect(info.containerInstanceARN).to.exist;
      chaiExpect(info.containerId).to.exist;
      chaiExpect(info.taskARN).to.exist;
      chaiExpect(info.containerImageId).to.exist;
    });
    it('should handle error', function () {
      const ci = require('./containerInfo.js')('./no_such_file123.json');
      chaiExpect(ci.getInfo()).to.deep.equal({});
    });
  });
});
