const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const fs = require('fs');
const mockUtil = require('../../test/mockUtil.js')();
const serviceContext = require('../../test/serviceContext.mock.js')();

const dir = require('./Auth.js')(serviceContext);

const fieldArgs = {};

const fieldInfo = {
  fieldName: 'test',
  parentType: 'Test'
};

const schema = {
  getTypeMap: () => {
    return {
      Test: {
        getFields: () => ({
          test: {
            args: [
              {
                name: 'id'
              }
            ]
          },
          test2: {
            args: [
              {
                name: 'notId'
              }
            ]
          }
        })
      }
    };
  }
};
describe('#Auth', function () {
  describe('#name', function () {
    it('should return name', function () {
      chaiExpect(dir.name).to.equal('auth');
      chaiExpect(dir.before).to.equal(true);
    });
  });
  describe('#resolver', function () {
    it('should throw with no auth', async function () {
      serviceContext._clearAll();
      const context = {
        requestContext: {}
      };
      try {
        await dir.resolver({}, {}, context, {});
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('authentication_error');
      }
    });

    it('should accept internal API key', async function () {
      serviceContext._clearAll();
      // user, api_org, engineJWT
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      await dir.resolver(
        { allowOrgless: true, objectAuthIdParam: 'id' },
        { id: 1 },
        context,
        fieldInfo
      );
      chaiExpect(context.organizationId).to.be.undefined;
    });

    it('should reject internal API key with orgless off', async function () {
      serviceContext._clearAll();
      // user, api_org, engineJWT
      try {
        await dir.resolver(
          { allowOrgless: false, objectAuthIdParam: 'id' },
          { id: 1 },
          mockUtil.makeContext({ authType: 'api_internal' }),
          fieldInfo
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_allowed');
      }
    });

    it('should accept user token', async function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext({ authType: 'user' });
      const args = { id: 1 };
      await dir.resolver({}, args, context, fieldInfo);
      chaiExpect(args.organizationId).to.exist;
      chaiExpect(args.organizationIds).to.exist;
      chaiExpect(args.organizationIds.length > 0).to.be.true;
      // verify that the directive resolver marked that these
      // parameters were set internally and should not be recognized
      // by other parameter-bound directive resolvers.
      chaiExpect(args.__ignoreParamsForValidation).to.deep.equal([
        'organizationId',
        'applicationId'
      ]);
    });

    it('should accept org token', async function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext({ authType: 'api_org' });
      const args = { id: 1 };
      await dir.resolver({}, args, context, fieldInfo);
      chaiExpect(args.organizationId).to.exist;
      chaiExpect(args.organizationIds).to.exist;
      chaiExpect(args.organizationIds.length > 0).to.be.true;
      chaiExpect(args.applicationId).to.exist;
      chaiExpect(args.applicationIds).to.exist;
      chaiExpect(args.applicationIds.length > 0).to.be.true;
    });

    it('should reject engine JWT call with orgless off', async function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext({ authType: 'engineJWT' });
      try {
        await dir.resolver({}, {}, context, {
          parentType: 'Test',
          fieldName: 'test2'
        });
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_allowed');
        chaiExpect(_.toString(err)).to.include(
          'are not associated with an org'
        );
        chaiExpect(_.get(err, 'data.errorTypeCode')).to.equal(1003);
      }
    });

    it('should error on engine JWT call with no configured object ID param', async function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext({ authType: 'engineJWT' });
      try {
        await dir.resolver({ allowOrgless: true }, {}, context, {
          parentType: 'Test',
          fieldName: 'test2'
        });
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_allowed');
        chaiExpect(_.get(err, 'data.errorTypeCode')).to.equal(1006);
      }
    });

    it('should error on engine JWT call with no provided object ID param', async function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext({ authType: 'engineJWT' });
      try {
        await dir.resolver({ allowOrgless: true }, { notId: 2 }, context, {
          parentType: 'Test',
          fieldName: 'test'
        });
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_allowed');
        chaiExpect(_.get(err, 'data.errorTypeCode')).to.equal(1006);
      }
    });

    it('should error on engine JWT call with wrong object ID param', async function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext({ authType: 'engineJWT' });
      // first the auth code will get the TDO associated with the target job
      serviceContext.dbConnections['core'].read._push([
        {
          tdo_id: '123',
          job_id: 'job-123'
        }
      ]);
      // now get the source task data off the requested TDO (a different TDO!)
      serviceContext.dbConnections['core'].read._push([
        {
          taskId: 'job-234-1',
          jobId: 'job-234'
        }
      ]);
      try {
        await dir.resolver(
          {
            allowOrgless: true,
            objectAuthType: 'TemporalDataObject',
            objectAuthIdParam: 'id'
          },
          { id: '234' },
          context,
          { parentType: 'Test', fieldName: 'test' }
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_allowed');
        chaiExpect(_.get(err, 'data.errorTypeCode')).to.equal(1002);
      }
    });

    it('should allow on engine JWT call with TDO linked by source data', async function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext({ authType: 'engineJWT' });
      // first the auth code will get the TDO associated with the target job

      serviceContext.dbConnections['core'].read._push([
        {
          job_id: mockUtil.toTaskId('job-123'),
          tdo_id: '234'
        }
      ]);

      // now get the source task data off the requested TDO (a different TDO!)
      serviceContext.dbConnections['core'].read._push([
        {
          content: {
            taskId: mockUtil.toTaskId('task-job-123'),
            jobId: mockUtil.toTaskId('job-123')
          }
        }
      ]);

      // map app ID to org ID
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 7682
          }
        ],
        false
      );

      // this call should pass because the job ID is referenced in the TDO's source data
      await dir.resolver(
        {
          allowOrgless: true,
          objectAuthType: 'TemporalDataObject',
          objectAuthIdParam: 'id'
        },
        { id: '234' },
        context,
        { parentType: 'Test', fieldName: 'test' }
      );
    });

    it('should allow on engine JWT call with TDO in JWT', async function () {
      serviceContext._clearAll();
      const context = mockUtil.makeContext({ authType: 'engineJWT' });
      // map app ID to org ID
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 7682
          }
        ],
        false
      );

      // this call should pass because the job ID is referenced in the TDO's source data
      await dir.resolver(
        {
          allowOrgless: true,
          objectAuthType: 'TemporalDataObject',
          objectAuthIdParam: 'id'
        },
        { id: '123' },
        context,
        { parentType: 'Test', fieldName: 'test' }
      );
    });
  });

  describe('#validator', function () {
    it('should accept valid config', function () {
      dir.validator({}, {}, {});
    });
    it('should accept valid object auth config', function () {
      dir.validator(
        {
          allowOrgless: true,
          objectAuthIdParam: 'input.id',
          objectAuthType: 'Test'
        },
        { name: 'input', args: [] },
        schema
      );
    });
    it('should accept valid object auth config and deduce type', function () {
      dir.validator(
        {
          allowOrgless: true,
          objectAuthIdParam: 'id'
        },
        { name: 'input', args: [] },
        schema
      );
    });
    it('should fail on invalid objectAuthIdParam', function () {
      try {
        dir.validator(
          { objectAuthIdParam: 'a.b.id' },
          { name: 'input', args: [] },
          schema
        );
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('nested object');
      }
    });
    it('should fail on invalid combination', function () {
      try {
        dir.validator(
          {
            objectAuthIdParam: 'a.b.id',
            objectAuthType: 'Test',
            skipObjectAuthorization: true
          },
          { name: 'input', args: [] },
          schema
        );
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('skip object-level');
      }
    });
  });
});
