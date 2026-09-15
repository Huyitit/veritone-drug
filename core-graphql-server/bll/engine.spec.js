const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();

let dal, context;

beforeEach(function () {
  context = mockUtil.makeContext();
});

describe('bll Engine tests', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      dal = require('./engine.js')(serviceContext);
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(4);
      chaiExpect(typeof dal.getEngineReplacements).to.equal('function');
      chaiExpect(typeof dal.replaceEngine).to.equal('function');
      chaiExpect(typeof dal.removeReplacementEngineId).to.equal('function');
    });
  });

  describe('#getEngineReplacements', function () {
    it('should throw not_allow error when filter by organizationId', async function () {
      let res, err;
      const args = {
        organizationId: 12345
      };
      _.set(context, '_authInfo.permissionMasks', null);

      try {
        res = await dal.getEngineReplacements(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Only Super Admin can get Engine Replacement by organizationId'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_allowed');
      chaiExpect(res).to.undefined;
      chaiExpect(serviceContext.redisClient._counter()).to.equal(0);
    });

    it('should get engine replacement successfully', async function () {
      let res, err;
      const args = {
        organizationId: 7682,
        engineId: '5dee4db9-bd02-4c77-8b09-9e442b6c9f56'
      };

      // serviceContext.dal.engine.getEngineReplacements
      serviceContext.dbConnections['core'].read._push([
        {
          source_engine_id: '5dee4db9-bd02-4c77-8b09-9e442b6c9f56',
          organization_id: 7682,
          replacement_engine_id: '711f2490-70a2-4ae5-8732-e7bd4b29c19f',
          payload_func: '$'
        }
      ]);

      try {
        res = await dal.getEngineReplacements(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records.length).to.equal(1);
      chaiExpect(res.offset).to.equal(0);
      chaiExpect(res.limit).to.equal(30);
      // get 2 times and set 2 times
      chaiExpect(serviceContext.redisClient._counter()).to.equal(4);
    });

    it('should get engine replacement successfully - make cache dirty', async function () {
      let res, err;
      const args = {
        organizationId: 7682,
        engineId: '5dee4db9-bd02-4c77-8b09-9e442b6c9f56'
      };

      serviceContext._clearAll();
      await serviceContext.redisCache.markCacheDirty(true);
      // serviceContext.dal.engine.getEngineReplacements
      serviceContext.dbConnections['core'].read._push([
        {
          source_engine_id: '5dee4db9-bd02-4c77-8b09-9e442b6c9f56',
          organization_id: 7682,
          replacement_engine_id: '711f2490-70a2-4ae5-8732-e7bd4b29c19f',
          payload_func: '$'
        }
      ]);

      try {
        res = await dal.getEngineReplacements(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records.length).to.equal(1);
      chaiExpect(res.offset).to.equal(0);
      chaiExpect(res.limit).to.equal(30);
      // get 2 times, clear 2 times and set 2 times
      chaiExpect(serviceContext.redisClient._counter()).to.equal(6);
    });

    it('should get engine replacement successfully - get from cache', async function () {
      let res, err;
      const args = {
        organizationId: 7682,
        engineId: '5dee4db9-bd02-4c77-8b09-9e442b6c9f56'
      };

      await serviceContext.redisCache.markCacheDirty(false);

      try {
        res = await dal.getEngineReplacements(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records.length).to.equal(1);
      chaiExpect(res.offset).to.equal(0);
      chaiExpect(res.limit).to.equal(30);
      // add 2 times to get from cache
      chaiExpect(serviceContext.redisClient._counter()).to.equal(8);
    });
  });

  describe('#replaceEngine', function () {
    it('should throw error not allow replace engine for another org', async function () {
      let res, err;
      const args = {
        organizationId: 12345
      };
      _.set(context, '_authInfo.permissionMasks', null);

      try {
        res = await dal.replaceEngine(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Only superadmin can replace an engine of other organizations'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_allowed');
      chaiExpect(res).to.undefined;
    });

    it('should replace engine', async function () {
      let res, err;
      const args = {
        organizationId: 7682,
        input: {
          organizationId: 7682,
          sourceEngineId: '0d745844-55f5-47e1-8c40-afdc02c502e7',
          replacementEngineId: '36c8fd6e-6cb4-455a-b69b-bd6581b81b97'
        }
      };

      serviceContext._clearAll();
      // validateEngineReplacement -> serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      // validateEngineReplacement -> serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
          owner_organization_id: 7682
        }
      ]);
      // validateEngineReplacement -> serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: '36c8fd6e-6cb4-455a-b69b-bd6581b81b97',
          owner_organization_id: 7682
        }
      ]);
      // serviceContext.dal.engine.createEngineReplacement
      serviceContext.dbConnections['core'].write._push([
        {
          source_engine_id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
          organization_id: 7682,
          replacement_engine_id: '36c8fd6e-6cb4-455a-b69b-bd6581b81b97'
        }
      ]);

      try {
        res = await dal.replaceEngine(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.sourceEngineId).to.equal(
        '0d745844-55f5-47e1-8c40-afdc02c502e7'
      );
      chaiExpect(res.replacementEngineId).to.equal(
        '36c8fd6e-6cb4-455a-b69b-bd6581b81b97'
      );
      chaiExpect(res.organizationId).to.equal(7682);
    });
  });

  describe('#removeReplacementEngineId', function () {
    it('should remove engine replacement success', async function () {
      let res, err;
      const args = {
        organizationId: 7682,
        input: {
          organizationId: 7682,
          sourceEngineId: '0d745844-55f5-47e1-8c40-afdc02c502e7',
          replacementEngineId: '36c8fd6e-6cb4-455a-b69b-bd6581b81b97'
        }
      };

      serviceContext._clearAll();
      // validateEngineReplacement -> serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      // validateEngineReplacement -> serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
          owner_organization_id: 7682
        }
      ]);
      // validateEngineReplacement -> serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: '36c8fd6e-6cb4-455a-b69b-bd6581b81b97',
          owner_organization_id: 7682
        }
      ]);
      // serviceContext.dal.engine.removeEngineReplacement
      serviceContext.dbConnections['core'].write._push([
        {
          source_engine_id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
          organization_id: 7682,
          replacement_engine_id: '36c8fd6e-6cb4-455a-b69b-bd6581b81b97'
        }
      ]);

      try {
        res = await dal.removeReplacementEngineId(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('0d745844-55f5-47e1-8c40-afdc02c502e7');
      chaiExpect(res.message).to.equal('Engine replacement has been removed');
    });
  });

  describe('#calculateEngineUsageForOrganization', function () {
    beforeEach(() => {
      serviceContext._clearAll();
      serviceContext.redisCache.markCacheDirty(true);
    });

    it('should throw error - Organization is required when calculating the engine usage', async function () {
      const options = {};
      const res = await dal.calculateEngineUsageForOrganization(
        context,
        options
      );
      chaiExpect(res).to.be.null;
    });

    it('should return null if org is disabled the limit enforced', async function () {
      let res, err;
      const options = {
        organizationId: 1234,
        organization: { id: 1234, organizationId: 1234, isLimitEnforced: false }
      };

      try {
        res = await dal.calculateEngineUsageForOrganization(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.null;
      chaiExpect(err).to.be.undefined;
    });

    it('should return null if no task or job were passed in', async function () {
      let res, err;
      const options = {
        organizationId: 1234,
        organization: { id: 1234, organizationId: 1234, isLimitEnforced: true }
      };

      try {
        res = await dal.calculateEngineUsageForOrganization(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.null;
    });

    it('should calculate task usage with no engine price and no media duration', async function () {
      let res, err;
      const options = {
        organizationId: 1234,
        organization: { id: 1234, organizationId: 1234, isLimitEnforced: true },
        taskId: '20125010_qefUACDyPQXURoT'
      };

      // serviceContext.dal.task.getTask
      serviceContext.dbConnections['core'].read._push([
        {
          id: '20125010_qefUACDyPQXURoT',
          engine_id: '79a3556e-f8b9-4d88-a1bf-4ca3a7d301bf'
        }
      ]);

      // ------ Start function serviceContext.bll.task.populateEngineForTask
      // serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: '79a3556e-f8b9-4d88-a1bf-4ca3a7d301bf',
          alias_id: '79a3556e-f8b9-4d88-a1bf-4ca3a7d301bf-alias'
        }
      ]);

      try {
        res = await dal.calculateEngineUsageForOrganization(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.totalCost).to.equal(50);
      chaiExpect(res.totalProcessedCPUMilliseconds).to.equal(0);
      chaiExpect(res.usageItems.length).to.equal(1);
    });

    it('should throw error - Job did not include any tasks inside', async function () {
      let res, err;
      const options = {
        organizationId: 1234,
        organization: { id: 1234, organizationId: 1234, isLimitEnforced: true },
        jobId: '20125010_qefUACDyPQ'
      };

      // serviceContext.dal.task.getTasks
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.calculateEngineUsageForOrganization(context, options);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Job did not include any tasks inside'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should calculate job usage with multiple tasks', async function () {
      let res, err;
      const options = {
        organizationId: 1234,
        organization: { id: 1234, organizationId: 1234, isLimitEnforced: true },
        jobId: '20125010_qefUACDyPQ'
      };

      // serviceContext.dal.task.getTasks
      serviceContext.dbConnections['core'].read._push([
        {
          id: '20125010_qefUACDyPQXURoT',
          engine_id: '79a3556e-f8b9-4d88-a1bf-4ca3a7d301bf',
          media_length_sec: 657
        },
        {
          id: '20125010_qefUACDyPQXURuF',
          engine_id: '2fa200aa-e547-4f13-ac91-b9af2837a2ef',
          media_length_sec: 970
        }
      ]);

      // ------ Start function serviceContext.bll.task.populateEngineForTask
      // serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: '79a3556e-f8b9-4d88-a1bf-4ca3a7d301bf',
          alias_id: '79a3556e-f8b9-4d88-a1bf-4ca3a7d301bf-alias',
          price: 300
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '2fa200aa-e547-4f13-ac91-b9af2837a2ef',
          alias_id: '2fa200aa-e547-4f13-ac91-b9af2837a2ef-alias',
          price: 200
        }
      ]);

      try {
        res = await dal.calculateEngineUsageForOrganization(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.totalCost).to.equal(108.6388888889);
      chaiExpect(res.totalMediaDurationSeconds).to.equal(1627);
      chaiExpect(res.usageItems.length).to.equal(2);
    });
  });
});
