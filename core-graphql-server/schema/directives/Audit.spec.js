const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const fs = require('fs');
const mockUtil = require('../../test/mockUtil.js')();
const serviceContext = require('../../test/serviceContext.mock.js')();

const dir = require('./Audit.js')(serviceContext);

describe('#Audit', function () {
  describe('#name', function () {
    it('should return name', function () {
      chaiExpect(dir.name).to.equal('audit');
      chaiExpect(dir.before).to.equal(true);
    });
  });
  describe('#resolver', function () {
    it('should run resolver', function () {
      const fieldArgs = {};
      dir.resolver({ objectType: 'Test', action: 'Create' }, fieldArgs, {}, {});
      chaiExpect(fieldArgs._audit_objectType).to.equal('Test');
      chaiExpect(fieldArgs._audit_action).to.equal('Create');
    });
    it('should run with no args', function () {
      const fieldArgs = {};
      dir.resolver({}, fieldArgs, {}, {});
      chaiExpect(fieldArgs._audit_objectType).to.be.undefined;
      chaiExpect(fieldArgs._audit_action).to.be.undefined;
    });
  });
  describe('#validator', function () {
    it('should run validator', function () {
      dir.validator(
        {
          action: 'Create'
        },
        {
          name: 'field',
          type: 'type'
        }
      );
    });
  });
});
