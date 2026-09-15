const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');

const mockUtil = require('../../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../../test/serviceContext.mock.js')();

let resolvers;

const dir = require('./Deprecated.js')({
  serviceContext,
  appConfig: serviceContext.config,
  config: serviceContext.config
});

const field = {
  type: 'Test',
  name: 'test'
};
const schema = {};

describe('#Deprecated', function () {
  describe('#resolver', function () {
    it('should emit warning if not expired', function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext();
      dir.resolver(
        {
          reason: 'a reason',
          expirationDate: moment().add(1, 'month').toISOString(),
          deprecationDate: moment().subtract(1, 'month').toISOString(),
          alternate: 'api2'
        },
        {},
        context,
        {
          parentType: 'Test',
          fieldName: 'test'
        }
      );

      chaiExpect(_.get(context, 'requestInfo.warnings[0].errorName')).to.equal(
        'api_deprecated_field'
      );
      chaiExpect(_.get(context, 'requestInfo.warnings[0].data.type')).to.equal(
        'Test'
      );
      chaiExpect(_.get(context, 'requestInfo.warnings[0].data.alternate')).to
        .exist;
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryDeprecatedAPIWarning')
      ).to.equal(1);
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryExpiredAPIWarning')
      ).to.equal(0);
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
    });
    it('should warning if deprecated parameter set', function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext();
      dir.resolver(
        {
          reason: 'a reason',
          expirationDate: moment().add(1, 'month').toISOString(),
          deprecationDate: moment().subtract(1, 'month').toISOString(),
          alternate: 'api2'
        },
        {
          organizationId: 7682,
          __directiveArgName: 'organizationId'
        },
        context,
        {
          parentType: 'Test',
          fieldName: 'test'
        }
      );

      chaiExpect(_.get(context, 'requestInfo.warnings[0].errorName')).to.equal(
        'api_deprecated_field'
      );
      chaiExpect(_.get(context, 'requestInfo.warnings[0].data.type')).to.equal(
        'Test'
      );
      chaiExpect(_.get(context, 'requestInfo.warnings[0].data.alternate')).to
        .exist;
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryDeprecatedAPIWarning')
      ).to.equal(1);
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryExpiredAPIWarning')
      ).to.equal(0);
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
    });
    it('should not warn if deprecated parameter was set internally', function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext();
      dir.resolver(
        {
          reason: 'a reason',
          expirationDate: moment().add(1, 'month').toISOString(),
          deprecationDate: moment().subtract(1, 'month').toISOString(),
          alternate: 'api2'
        },
        {
          organizationId: 7682,
          __directiveArgName: 'organizationId',
          __ignoreParamsForValidation: ['organizationId']
        },
        context,
        {
          parentType: 'Test',
          fieldName: 'test'
        }
      );
      chaiExpect(_.get(context, 'requestInfo.warnings')).to.be.undefined;
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryDeprecatedAPIWarning')
      ).to.equal(0);
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryExpiredAPIWarning')
      ).to.equal(0);
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(0);
    });
    it('should not warn if deprecated parameter was not set', function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext();
      dir.resolver(
        {
          reason: 'a reason',
          expirationDate: moment().add(1, 'month').toISOString(),
          deprecationDate: moment().subtract(1, 'month').toISOString(),
          alternate: 'api2'
        },
        {
          nonDeprecatedParameter: true,
          __directiveArgName: 'organizationId'
        },
        context,
        {
          parentType: 'Test',
          fieldName: 'test'
        }
      );

      chaiExpect(_.get(context, 'requestInfo.warnings')).to.be.undefined;
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryDeprecatedAPIWarning')
      ).to.equal(0);
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryExpiredAPIWarning')
      ).to.equal(0);
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(0);
    });

    it('should emit warning if expired but error mode off', function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext();
      _.set(
        serviceContext,
        'appConfig.featureFlags.errorOnExpiredGraphQLField',
        false
      );
      const dir2 = require('./Deprecated.js')({
        serviceContext,
        appConfig: serviceContext.config,
        config: serviceContext.config
      });
      dir2.resolver(
        {
          reason: 'a reason',
          expirationDate: moment().subtract(1, 'month').toISOString(),
          deprecationDate: moment().subtract(3, 'month').toISOString(),
          alternate: 'api2, api3'
        },
        {},
        context,
        {
          parentType: 'Test',
          fieldName: 'test'
        }
      );
      chaiExpect(_.get(context, 'requestInfo.warnings[0].errorName')).to.equal(
        'api_deprecated_field'
      );
      chaiExpect(_.get(context, 'requestInfo.warnings[0].data.type')).to.equal(
        'Test'
      );
      chaiExpect(_.get(context, 'requestInfo.warnings[0].data.alternate')).to
        .exist;
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryDeprecatedAPIWarning')
      ).to.equal(1);
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryExpiredAPIWarning')
      ).to.equal(1);
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
    });
    it('should throw if expired and error mode on', function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext();
      _.set(
        serviceContext,
        'config.featureFlags.errorOnExpiredGraphQLField',
        true
      );
      const dir2 = require('./Deprecated.js')({
        serviceContext,
        appConfig: serviceContext.config,
        config: serviceContext.config
      });
      try {
        dir2.resolver(
          {
            reason: 'a reason',
            expirationDate: moment().subtract(1, 'month').toISOString(),
            deprecationDate: moment().subtract(3, 'month').toISOString(),
            alternate: 'api2, api3'
          },
          {},
          context,
          {
            parentType: 'Test',
            fieldName: 'test'
          }
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(_.get(err, 'data.alternate')).to.exist;
        chaiExpect(_.get(err, 'data.reason')).to.exist;
        chaiExpect(
          serviceContext.metrics.getValue('graphQLQueryDeprecatedAPIWarning')
        ).to.equal(1);
        chaiExpect(
          serviceContext.metrics.getValue('graphQLQueryExpiredAPIWarning')
        ).to.equal(1);
        chaiExpect(serviceContext.messageUtil._counter()).to.equal(0); // logged in error handling code elsewere
      }
    });
  });
  describe('#validator', function () {
    it('should succeed on valid args - just date', function () {
      dir.validator(
        {
          reason: 'a reason',
          expirationDate: '04-30-2019',
          deprecationDate: '01-01-2019',
          alternate: 'another api'
        },
        field,
        schema
      );
    });
    it('should succeed on valid args - timestamp', function () {
      dir.validator(
        {
          reason: 'a reason',
          expirationDate: '2019-04-04T11:37:47.629-07:00',
          deprecationDate: '2019-01-04T11:37:47.629Z',
          alternate: 'another api'
        },
        field,
        schema
      );
    });
    it('should throw on invalid expirationDate', function () {
      try {
        dir.validator(
          {
            reason: 'a reason',
            deprecationDate: '04:30:2019T23:59:00.000Z',
            expirationDate: '01-1.2019T00:00:00.000Z',
            alternate: 'another api'
          },
          field,
          schema
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('is not valid');
      }
    });
    it('should require expirationDate', function () {
      try {
        dir.validator(
          {
            reason: 'a reason',
            deprecationDate: '04:30:2019T23:59:00.000Z',
            alternate: 'another api'
          },
          field,
          schema
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('is required');
      }
    });
    it('should require deprecationDate', function () {
      try {
        dir.validator(
          {
            reason: 'a reason',
            expirationDate: '2019-04-04T11:37:47.629-07:00',
            alternate: 'another api'
          },
          field,
          schema
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('is required');
      }
    });

    it('should require reason', function () {
      try {
        dir.validator(
          {
            expirationDate: '2019-04-04T11:37:47.629-07:00',
            deprecationDate: '2019-01-04T11:37:47.629Z',
            alternate: 'another api'
          },
          field,
          schema
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('is required');
      }
    });

    it('should require reason non-empty', function () {
      try {
        dir.validator(
          {
            reason: '  ',
            expirationDate: '2019-04-04T11:37:47.629-07:00',
            deprecationDate: '2019-01-04T11:37:47.629Z',
            alternate: 'another api'
          },
          field,
          schema
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('is required');
      }
    });

    it('should require alternate', function () {
      try {
        dir.validator(
          {
            expirationDate: '2019-04-04T11:37:47.629-07:00',
            deprecationDate: '2019-01-04T11:37:47.629Z',
            reason: 'a reason'
          },
          field,
          schema
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('is required');
      }
    });

    it('should require alternate non-empty', function () {
      try {
        dir.validator(
          {
            alternate: '  ',
            expirationDate: '2019-04-04T11:37:47.629-07:00',
            deprecationDate: '2019-01-04T11:37:47.629Z',
            reason: 'a reason'
          },
          field,
          schema
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('is required');
      }
    });

    it('should throw on invalid deprecationDate', function () {
      try {
        dir.validator(
          {
            reason: 'a reason',
            expirationDate: '04:30:2019T23:59:00.000Z',
            deprecationDate: '01-1.2019T00:00:00.00',
            alternate: 'another api'
          },
          field,
          schema
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('is not valid');
      }
    });
    it('should throw on deprecationDate in the future', function () {
      try {
        dir.validator(
          {
            reason: 'a reason',
            expirationDate: moment().add(2, 'month').toISOString(),
            deprecationDate: moment().add(1, 'month').toISOString(),
            alternate: 'another api'
          },
          field,
          schema
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('in the future');
      }
    });
    it('should throw on deprecationDate after expirationDate', function () {
      try {
        dir.validator(
          {
            reason: 'a reason',
            expirationDate: moment().subtract(2, 'month').toISOString(),
            deprecationDate: moment().subtract(1, 'month').toISOString(),
            alternate: 'another api'
          },
          field,
          schema
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('is before deprecation date');
      }
    });
  });
});
