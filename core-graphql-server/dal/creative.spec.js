const chaiExpect = require('chai').expect;
const _ = require('lodash');
const fs = require('fs');
const httpMock = require('node-mocks-http');
const moment = require('moment');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.V3_DATA_MODEL);
const dal = require('./creative.js')(serviceContext);
let context;

describe('creative tests', () => {
  beforeEach(() => {
    context = mockUtil.makeContext();
  });

  describe('#getCreative', () => {
    let args;

    beforeEach(() => {
      args = {
        id: 'creativeId'
      };
    });

    it('should throw - Invalid creativeId', async () => {
      let res, err;
      args.id = null;

      try {
        res = await dal.getCreative(args, context);
      } catch (error) {
        chaiExpect(error.message).to.equal('Invalid creativeId');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should throw not found', async () => {
      let res, err;

      serviceContext.dbConnections['media_platform'].read._push([], false);
      try {
        res = await dal.getCreative(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('not_found');
    });

    it('should return creative', async () => {
      let res, err;

      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: args.id }],
        false
      );
      try {
        res = await dal.getCreative(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(args.id);
    });
  });

  describe('#createCreative', () => {
    let args, organizationId;

    beforeEach(() => {
      args = { input: { name: 'creativeName' } };
      organizationId = 7682;
    });

    it('should create creative', async () => {
      let res, err;

      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'creativeId', name: 'creativeName' }
      ]);

      try {
        res = await dal.createCreative(args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.name).to.equal('creativeName');
    });
  });

  describe('#updateCreative', () => {
    let args;

    beforeEach(() => {
      args = { input: { id: 'creativeId', name: 'creativeName' } };
    });

    it('should update creative by id', async () => {
      let res, err;

      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'creativeId', name: 'creativeName' }
      ]);

      try {
        res = await dal.updateCreative(args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.name).to.equal('creativeName');
    });
  });

  describe('#deleteCreative', () => {
    let args, organizationId;

    beforeEach(() => {
      args = { id: 'creativeId' };
      organizationId = 7682;
    });

    it('should throw invalid input', async () => {
      let res, err;
      args.id = null;

      try {
        res = await dal.deleteCreative(args);
      } catch (error) {
        chaiExpect(error.message).to.equal('Creative ID is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should delete creative', async () => {
      let res, err;

      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'creativeId' }
      ]);

      try {
        res = await dal.deleteCreative(args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('creativeId');
    });
  });
});
