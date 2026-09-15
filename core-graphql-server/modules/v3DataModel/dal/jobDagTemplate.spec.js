const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../../../test/mockUtil.js')();
const serviceContext = require('../test/serviceContext.mock.js')();

let context;
const dal = require('./jobDagTemplate.js')(serviceContext);

beforeEach(function () {
  serviceContext._clearAll();
  context = mockUtil.makeContext();
});

describe('Job DAG Template tests', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(1);
      chaiExpect(typeof dal.getDagTemplateIdsByJobIds).to.equal('function');
    });
  });

  describe('#getDagTemplateIdsByJobIds', function () {
    let args;

    beforeEach(function () {
      args = {
        ids: ['jobId1', 'jobId2'],
        offset: 0,
        limit: 10
      };
    });

    it('should throw error - jobIds is required and must be a non-empty array.', async function () {
      let err, res;
      let args = { ids: [] };
      try {
        res = await dal.getDagTemplateIdsByJobIds(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'jobIds is required and must be a non-empty array'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should get list DagTemplateIds by JobIds', async function () {
      let res, err;
      serviceContext.dbConnections['core'].read._push(
        [
          { job_id: 'jobId1', dag_template_id: 'dagTemplateId1' },
          { job_id: 'jobId1', dag_template_id: 'dagTemplateId2' },
          { job_id: 'jobId2', dag_template_id: 'dagTemplateId3' },
          { job_id: 'jobId2', dag_template_id: 'dagTemplateId4' }
        ],
        false
      );

      try {
        res = await dal.getDagTemplateIdsByJobIds(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.records.length).to.equal(4);
      chaiExpect(res.records[0].jobId).to.equal('jobId1');
      chaiExpect(res.records[0].dagTemplateId).to.equal('dagTemplateId1');
      chaiExpect(res.records[1].jobId).to.equal('jobId1');
      chaiExpect(res.records[1].dagTemplateId).to.equal('dagTemplateId2');
      chaiExpect(res.records[2].jobId).to.equal('jobId2');
      chaiExpect(res.records[2].dagTemplateId).to.equal('dagTemplateId3');
      chaiExpect(res.records[3].jobId).to.equal('jobId2');
      chaiExpect(res.records[3].dagTemplateId).to.equal('dagTemplateId4');
    });

    it('should handle empty result if no matching DagTemplateIds', async function () {
      let res, err;
      serviceContext.dbConnections['core'].read._push([], false);

      try {
        res = await dal.getDagTemplateIdsByJobIds(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.records.length).to.equal(0);
    });
  });
});
