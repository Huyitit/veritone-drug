// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')();

describe('#coreJob.js', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      let coreJob = require('./coreJob.js')(serviceContext);
      expect(Object.keys(coreJob).length).toEqual(7);
    });
  });
});
