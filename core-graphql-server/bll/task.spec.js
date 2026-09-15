const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();

let bll, context;

beforeEach(function () {
  context = mockUtil.makeContext();
});

describe('bll Task tests', function () {
  beforeAll(() => {
    bll = require('./task.js')(serviceContext);
  });
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(bll).to.be.a('object');
      chaiExpect(Object.keys(bll).length).to.equal(4);
      chaiExpect(typeof bll.getReplacementEnginesForTasks).to.equal('function');
    });
  });

  describe('#getReplacementEnginesForTasks', function () {
    let context;

    beforeEach(() => {
      context = mockUtil.makeContext();
    });

    it('should replace engineId and payload successfully', async function () {
      let err, res;
      let task = {
        engineId: '459fd20d-9a76-4556-9742-2062b11dda83',
        buildId: 'a3b1bad9-8cbb-4597-a2c9-1724034a9227',
        payload: { foo: 'bar' }
      };
      const organizationId = 7682;

      // serviceContext.bll.engine.getEngineReplacements
      serviceContext.dbConnections['core'].read._push(
        [
          {
            source_engine_id: '459fd20d-9a76-4556-9742-2062b11dda83',
            organization_id: 7682,
            replacement_engine_id: 'f388ab3e-a970-489d-97c0-551bc751dea6',
            payload_func: '$'
          }
        ],
        false
      );

      try {
        res = await bll.getReplacementEnginesForTasks(
          context,
          [task],
          organizationId
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res['459fd20d-9a76-4556-9742-2062b11dda83'].engineId).to.equal(
        'f388ab3e-a970-489d-97c0-551bc751dea6'
      );
      chaiExpect(
        res['459fd20d-9a76-4556-9742-2062b11dda83'].payload.foo
      ).to.equal('bar');
    });
  });

  describe('#populateEngineForTask', function () {
    let context;

    beforeEach(() => {
      context = mockUtil.makeContext;
      serviceContext._clearAll();
      serviceContext.redisCache.markCacheDirty(true);
    });

    it('should throw error - Invalid task with no engine', async function () {
      let err, res;
      let task = {};

      try {
        res = await bll.populateEngineForTask(context, task);
      } catch (error) {
        chaiExpect(error.message).to.equal('Invalid task with no engine');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should populate engine for task', async function () {
      let err, res;
      let task = {
        engineId: '12cee25a-2374-461c-8b88-dfdb8ab77404'
      };

      // serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: '12cee25a-2374-461c-8b88-dfdb8ab77404' }
      ]);

      try {
        res = await bll.populateEngineForTask(context, task);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.engine).to.exist;
      chaiExpect(res.engine.id).to.equal(
        '12cee25a-2374-461c-8b88-dfdb8ab77404'
      );
    });
  });

  describe('#updateOrgBillingForTask', function () {
    let context;

    beforeEach(() => {
      context = mockUtil.makeContext;
      serviceContext._clearAll();
      serviceContext.redisCache.markCacheDirty(true);
    });

    it('should return when org limitEnforced was disabled', async function () {
      let err, res;
      let options = { organizationId: 1234 };

      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 1234, is_limit_enforced: false }
      ]);

      try {
        res = await bll.updateOrgBillingForTask(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.be.undefined;
    });

    it('should update organization remaining and pending limit', async function () {
      let err, res;
      let options = {
        organizationId: 1235,
        taskId: '20125010_qefUACDyPQXURoT',
        task: {
          id: '20125010_qefUACDyPQXURoT',
          engineId: 'transcribe-speechmatics-container-en',
          mediaLengthSec: 901
        }
      };

      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1235,
          is_limit_enforced: true,
          remaining_budget: 10000
        }
      ]);

      // ------ Start function serviceContext.bll.engine.calculateEngineUsageForOrganization
      // ---- Start function serviceContext.bll.task.populateEngineForTask
      // serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'transcribe-speechmatics-container-en',
          alias_id: 'dfeae24c-9f66-46ba-8337-d44669489354',
          price: 300
        }
      ]);
      // ---- End function serviceContext.bll.task.populateEngineForTask
      // ------ End function serviceContext.bll.engine.calculateEngineUsageForOrganization

      // serviceContext.dal.organization.incrementMonthlyProcessing
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 1235,
          monthly_processing_media_hours: 12,
          monthly_processing_hours_total: 3,
          monthly_processing_tasks: 5,
          monthly_processing_bytes: 1024
        }
      ]);
      // set redis pending cache
      serviceContext.redisCache.set('PendingCostForOrganization', 1235, 4000);
      // serviceContext.dal.organization.setOrgRemainingBudget
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 1235, remaining_budget: 9925, is_limit_enforced: true }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 1235, monthly_current_charge: 10 }
      ]);

      try {
        res = await bll.updateOrgBillingForTask(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.totalCost).to.equal(75.0833333333);
      chaiExpect(res.totalMediaDurationSeconds).to.equal(901);
      chaiExpect(res.usageItems.length).to.equal(1);
      serviceContext.redisClient.get(
        'TEST:PendingCostForOrganization1235',
        (err, res) => {
          chaiExpect(res).to.equal(3924.9166666667);
        }
      );
    });

    it('should update organization remaining and pending limit - cpu pricing', async function () {
      let err, res;
      let options = {
        organizationId: 1235,
        taskId: '20125010_qefUACDyPQXURoT',
        task: {
          id: '20125010_qefUACDyPQXURoT',
          engineId: 'transcribe-speechmatics-container-en',
          taskOutput: {
            processedStats: { processedCPUMilliseconds: 105 }
          }
        }
      };

      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1235,
          is_limit_enforced: true,
          remaining_budget: 10000
        }
      ]);

      // ------ Start function serviceContext.bll.engine.calculateEngineUsageForOrganization
      // ---- Start function serviceContext.bll.task.populateEngineForTask
      // serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'transcribe-speechmatics-container-en',
          alias_id: 'dfeae24c-9f66-46ba-8337-d44669489354'
        }
      ]);
      // ---- End function serviceContext.bll.task.populateEngineForTask
      // ------ End function serviceContext.bll.engine.calculateEngineUsageForOrganization

      // serviceContext.dal.organization.incrementMonthlyProcessing
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 1235,
          monthly_processing_media_hours: 12,
          monthly_processing_hours_total: 3,
          monthly_processing_tasks: 5,
          monthly_processing_bytes: 1024
        }
      ]);
      // set redis pending cache
      serviceContext.redisCache.set('PendingCostForOrganization', 1235, 4000);
      // serviceContext.dal.organization.setOrgRemainingBudget
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 1235, remaining_budget: 9925, is_limit_enforced: true }
      ]);
      // serviceContext.dal.organization.setOrgRemainingBudget
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 1235, monthly_current_charge: 10 }
      ]);

      try {
        res = await bll.updateOrgBillingForTask(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.totalCost).to.equal(0.0014583333);
      chaiExpect(res.totalProcessedCPUMilliseconds).to.equal(105);
      chaiExpect(res.usageItems.length).to.equal(1);
      chaiExpect(res.usageItems[0].cost).to.equal(0.0014583333);
      serviceContext.redisClient.get(
        'TEST:PendingCostForOrganization1235',
        (err, res) => {
          chaiExpect(res).to.equal(3999.9985416667);
        }
      );
    });
  });
});
