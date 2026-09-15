const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();

const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();

const dagTemplateLoader = require('./dagTemplate.js')(serviceContext);

function expectFunction(obj, key) {
  chaiExpect(typeof obj[key]).to.equal('function');
}

describe('dagTemplate.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  describe('#require', function () {
    it('should have correct functions export', function () {
      chaiExpect(typeof dagTemplateLoader).to.equal('object');
      chaiExpect(Object.keys(dagTemplateLoader).length).to.equal(2);
      expectFunction(dagTemplateLoader, 'batchDagTemplatesByJobIds');
      expectFunction(dagTemplateLoader, 'batchDagTemplatesByIds');
    });
  });

  describe('#batchDagTemplatesByJobIds', function () {
    it('should process 210 jobIds in 3 batches', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const jobIds = [];
      const mockDagTemplateIds = [];
      const mockDagTemplates = [];
      const organizationId = 7682;

      // Add 210 jobIds for the test
      for (let i = 0; i < 210; i++) {
        jobIds.push(mockUtil.toTaskId(`jobId${i}`));
      }

      // Mock dagTemplateIds for jobIds
      for (let i = 0; i < 210; i++) {
        mockDagTemplateIds.push({
          jobId: jobIds[i],
          dagTemplateId: mockUtil.toTaskId(`dagTemplateId${i}`)
        });
      }

      // Mock DagTemplates
      for (let i = 0; i < 210; i++) {
        mockDagTemplates.push({
          id: mockUtil.toTaskId(`dagTemplateId${i}`),
          name: `DagTemplate_${i}`
        });
      }

      // Mock the responses for batches (3 batches for 210 jobIds)
      for (let i = 0; i < 3; i++) {
        const startIdx = i * 100;
        const endIdx = startIdx + 100;

        // Mock the dagTemplateIds for this batch (each batch should handle 100 jobIds)
        serviceContext.dbConnections['core'].read._push(
          _.slice(mockDagTemplateIds, startIdx, endIdx),
          false // mock jobDagTemplate records
        );

        // Mock the DagTemplates for this batch
        serviceContext.dbConnections['core'].read._push(
          _.slice(mockDagTemplates, startIdx, endIdx),
          false // mock DagTemplates
        );
      }

      try {
        res = await dagTemplateLoader.batchDagTemplatesByJobIds(
          context,
          jobIds,
          organizationId
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;

      // Check that all 210 jobIds are processed correctly and the response length is 210
      chaiExpect(res.length).to.equal(210);

      // Verify that the jobId -> dagTemplate mapping is correct for the first few items
      chaiExpect(res[0].name).to.equal('DagTemplate_0');
      chaiExpect(res[1].name).to.equal('DagTemplate_1');
      chaiExpect(res[209].name).to.equal('DagTemplate_209');
    });
  });

  describe('#batchDagTemplatesByIds', function () {
    it('should process 210 dagTemplateIds in 3 batches', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const dagTemplateIds = [];
      const mockDagTemplates = [];
      const organizationId = 7682;

      // Add 210 dagTemplateIds for the test
      for (let i = 0; i < 210; i++) {
        dagTemplateIds.push(mockUtil.toTaskId(`dagTemplateId${i}`));
      }

      // Mock DagTemplates
      for (let i = 0; i < 210; i++) {
        mockDagTemplates.push({
          id: mockUtil.toTaskId(`dagTemplateId${i}`),
          name: `DagTemplate_${i}`
        });
      }

      // Mock the responses for batches (3 batches for 210 dagTemplateIds)
      for (let i = 0; i < 3; i++) {
        const startIdx = i * 100;
        const endIdx = startIdx + 100;

        // Mock the DagTemplates for this batch
        serviceContext.dbConnections['core'].read._push(
          _.slice(mockDagTemplates, startIdx, endIdx),
          false // mock DagTemplates
        );
      }

      try {
        res = await dagTemplateLoader.batchDagTemplatesByIds(
          context,
          dagTemplateIds,
          organizationId
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;

      // Check that all 210 dagTemplateIds are processed correctly and the response length is 210
      chaiExpect(res.length).to.equal(210);

      // Verify that the dagTemplateId -> dagTemplate mapping is correct for the first few items
      chaiExpect(res[0].name).to.equal('DagTemplate_0');
      chaiExpect(res[1].name).to.equal('DagTemplate_1');
      chaiExpect(res[209].name).to.equal('DagTemplate_209');
    });
  });
});
