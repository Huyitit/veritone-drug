const serviceContext = require('../../test/serviceContext.mock.js')();
const directive = require('./Length.js')(serviceContext);
const errors = require('../../error/index.js')();
describe('#Length', function () {
  describe('#name', function () {
    it('should return name', function () {
      expect(directive.name).toEqual('length');
      expect(directive.before).toEqual(true);
    });
  });
  describe('#resolver', function () {
    it.each([
      {
        directiveArgs: {},
        fieldArgs: {}
      },
      {
        directiveArgs: { max: 5 },
        fieldArgs: {}
      },
      {
        directiveArgs: { max: 5 },
        fieldArgs: { __directiveArgName: { obj: 'test' } }
      },
      {
        directiveArgs: { max: 5 },
        fieldArgs: { __directiveArgName: 0 }
      },
      {
        directiveArgs: { max: 5 },
        fieldArgs: { __directiveArgName: 'foo' }
      },
      {
        directiveArgs: { max: 5 },
        fieldArgs: { __directiveArgName: 'foo', foo: 'bar' }
      },
      {
        directiveArgs: { max: 5 },
        fieldArgs: { __directiveArgName: 'foo', foo: { obj: 'test' } }
      },
      {
        directiveArgs: { max: 5 },
        fieldArgs: { __directiveArgName: 'foo', foo: [1, 2, 3, 4, 5] }
      }
    ])('directive should not throw', async (args) => {
      expect(() =>
        directive.resolver(args.directiveArgs, args.fieldArgs, {}, {})
      ).not.toThrow();
    });
    it('should throw if the limit is exceeded', function () {
      expect(() =>
        directive.resolver(
          { max: 5 },
          { __directiveArgName: 'foo', foo: [1, 2, 3, 4, 5, 6] },
          {},
          { fieldName: 'fname' }
        )
      ).toThrow(errors.ObjectLimitExceeded);
    });
  });
});
