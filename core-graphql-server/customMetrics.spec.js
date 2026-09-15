// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')();

describe('#customMetrics.js', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      let customMetrics = require('./customMetrics.js')(serviceContext);
      expect(Object.keys(customMetrics).length).toEqual(1);
    });
  });
});
