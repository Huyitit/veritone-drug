// required for mocking appollo-server-express
try {
  const httpMock = require('node-mocks-http');
} catch (err) {
  console.error(err);
}
const serviceContext = require('../test/serviceContext.mock.js')();
const mod = require('./index.js')(serviceContext);
describe('#schema/index.js', function () {
  describe('#public', function () {
    it('should load public schema', function () {
      try {
        const schema = mod.createSchema('public');
        expect(schema).toBeDefined();
      } catch (err) {
        throw err;
      }
    });
  });
  describe('#internal', function () {
    it('should load internal schema', function () {
      try {
        const schema = mod.createSchema('internal');
        expect(schema).toBeDefined();
      } catch (err) {
        throw err;
      }
    });
  });
});
