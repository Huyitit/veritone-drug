const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');

const mockUtil = require('../../../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();
serviceContext.redisCache = {
  isCacheDirty: () => true,
  markCacheDirty: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  asyncSet: jest.fn(),
  clear: jest.fn(),
  incr: jest.fn(),
  incrBy: jest.fn(),
  incrByFloat: jest.fn(),
  decr: jest.fn(),
  multiExec: jest.fn()
};

jest.mock('request-promise');
const mockPartitionTable = require('../../../test/partitionTable.mock.js')(
  serviceContext
);
const dal = require('./jobPipeline.js')(serviceContext);

beforeEach(function () {
  serviceContext._clearAll();
});

describe('#jobPipeline', function () {
  describe('#require', function () {
    it('should load module', function () {
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(6);
      chaiExpect(typeof dal.createAllScheduledJobs).to.equal('function');
      chaiExpect(typeof dal.launchJobTemplates).to.equal('function');
    });
  });
  describe('#getParentJobInfo', function () {
    it('should get parent job info', async function () {
      const context = mockUtil.makeContext();
      const parentJobTemplateId = 12345;
      // get the parent job
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaZ',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          template_id: '19041830_3VCzbfZGaZ'
        }
      ]);
      const res = await dal.getParentJobInfo(context, parentJobTemplateId);

      chaiExpect(res).to.exist;
    });
    it('should throw not found', async function () {
      const context = mockUtil.makeContext();
      const parentJobTemplateId = 12345;
      serviceContext.dbConnections['core'].read._push([]);
      try {
        const res = await dal.getParentJobInfo(context, parentJobTemplateId);
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(err.name).to.equal('not_found');
      }
    });
  });
  describe('#getScheduleParams', function () {
    it('should get schedule params', async function () {
      const context = mockUtil.makeContext();
      const scheduledJob = { id: 1234 };
      // get schedule parts
      // get scheduled job
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      // get from program schedule
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '12345',
          date_start: null,
          date_end: null,
          scheduled_day: null
        }
      ]);
      // get from recurring schedule
      serviceContext.dbConnections['media_platform'].read._push([
        {
          repeat_interval_unit: 1,
          repeat_interval: 1000,
          start_time: '00:00:00',
          stop_time: '23:59:59'
        }
      ]);
      const res = await dal.getScheduleParams(context, scheduledJob);
      chaiExpect(res).to.exist;
    });
    it('should return empty if not exist scheduled job', async function () {
      const context = mockUtil.makeContext();
      const res = await dal.getScheduleParams(context, null);
      chaiExpect(res).to.exist;
      chaiExpect(res).to.empty;
    });
  });
  describe('#getScheduleParamsOnPart', function () {
    it('should return null if invalid schedule type', function () {
      const dateTime = new Date();
      const schedulePart = {};
      const scheduleJob = {};
      const res = dal.getScheduleParamsOnPart(
        dateTime,
        schedulePart,
        scheduleJob,
        false
      );
      chaiExpect(res).to.be.null;
    });
    it('should get schedule params if schedule type is weekly', function () {
      const dateTime = new Date(2019, 6, 22, 9, 1, 0, 0); // monday
      const schedulePart = {
        scheduleType: 'Weekly',
        scheduledDayAsInt: 1,
        startTime: '09:00:00',
        stopTime: '09:02:00'
      };
      const scheduleJob = {};
      const res = dal.getScheduleParamsOnPart(
        dateTime,
        schedulePart,
        scheduleJob,
        false
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.recordStartTime).not.be.null;
      chaiExpect(res.recordEndTime).not.be.null;
      chaiExpect(res.recordStartTime).to.equal(res.RECORD_START_TIME);
      chaiExpect(res.recordEndTime).to.equal(res.RECORD_END_TIME);
    });
    it('should get schedule params if schedule type is Interval', function () {
      const dateTime = new Date(2019, 6, 22, 9, 1, 0, 0); // monday
      const schedulePart = {
        scheduleType: 'Interval',
        repeatInterval: 1,
        repeatIntervalUnit: 'Hours',
        startTime: '09:00:00',
        stopTime: '09:02:00',
        durationSeconds: 120
      };
      const scheduleJob = {
        startDateTime: new Date(2019, 6, 22, 9, 1, 0, 0)
      };
      const res = dal.getScheduleParamsOnPart(
        dateTime,
        schedulePart,
        scheduleJob,
        false
      );
      chaiExpect(res).to.exist;
      chaiExpect(res).to.exist;
      chaiExpect(res.recordStartTime).to.equal(res.RECORD_START_TIME);
      chaiExpect(res.recordEndTime).to.equal(res.RECORD_END_TIME);
    });
  });
  describe('#launchJobTemplates', function () {
    it('should launch 1', async function () {
      serviceContext._clearAll();
      let res;

      // get job templates
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            job_pipeline_id: '29041830_3VCzbfZGaY'
          }
        ],
        false
      );
      // get realtime ingestion tasks
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'e123',
          id: '19041830_3VCzbfZGaW123',
          payload: { foo: 'bar', sourceId: '123' }
        }
      ]);
      // get scheduled job
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          name: 'test scheduled job',
          primarySourceTypeId: 5
        }
      ]);
      // get source type
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'test source',
          is_live: false
        }
      ]);
      // get the task templates
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaW123',
          job_template_id: '19041830_3VCzbfZGaW',
          engine_id: 'e123',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          is_template: true
        }
      ]);
      // get source
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 123,
            name: 'test source',
            is_public: true,
            source_type_id: 5,
            organization_id: 7682
          }
        ],
        false
      );
      // create tdo
      // get org ID from app
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      // get group ID for org
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get source type
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'test source',
          is_live: false
        }
      ]);
      // get source ACLs
      serviceContext.dbConnections['media_platform'].read._push([
        {
          source_id: 123,
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
          permission: 'owner'
        },
        {
          source_id: 123,
          group_id: 'b0359273-ecc6-4934-aa6b-092fbed49956',
          permission: 'viewer'
        }
      ]);
      // get group ID
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get schedule job by id
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 56245,
            name: 'test schedule job',
            is_public: true,
            source_type_id: 5,
            organization_id: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get task
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19083102_cf9nl5DHfy0Rjev',
          engine_id: 'e123',
          job_id: 'job_123'
        }
      ]);
      // get job
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        '19041830_3VCzbfZGaW123'
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'job_123'
        }
      ]);

      // get organization by id
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);

      // create TDO row in media table
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            media_id: 1234,
            created_date_time: moment().valueOf(),
            modified_date_time: moment().valueOf()
          }
        ],
        true
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{ id: 1234 }],
        true
      );
      // create TDO row in recording table
      serviceContext.dbConnections['core'].write._push([{}], true);
      // get fresh TDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '1234',
          application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get source content templates of source
      serviceContext.dbConnections['media_platform'].read._push([]);
      // get source content templates of schedule job
      serviceContext.dbConnections['media_platform'].read._push([]);

      // get fresh TDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '1234',
          application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);

      // mock value for getEngines in createJobImpl function
      serviceContext.dbConnections['core'].read._push([{ id: 'e123' }]);

      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId1', runtime: { iron: '' } }
      ]);

      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956' }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            application_name: 'oldest application'
          }
        ],
        false
      );
      // get org ID for group ID
      serviceContext.dbConnections['sso'].read._push([
        {
          id: 7682
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: { organizationId: 7683 }
        }
      ]);

      //--- createJob ----//
      // getEngine in job model validation
      serviceContext.dbConnections['core'].read._push([
        { id: 'e123', category_id: '2b876ad3-ae45-4302-a588-3b20076537d0' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: 'e123', category_id: '2b876ad3-ae45-4302-a588-3b20076537d0' }
      ]);
      // getEngineCategory in populateTaskWithEngineBuildInfo function
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '2b876ad3-ae45-4302-a588-3b20076537d0',
            engine_ids: ['e123'],
            engine_alias_ids: ['e123']
          }
        ],
        false
      );
      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg
      // createJobDb in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([
        { job_id: '29041830_3VCzbfZGaZ' }
      ]);
      // createTaskDb in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push(
        [{ id: mockUtil.toTaskId('29041830_3VCzbfZGaZ') }],
        false,
        [],
        (sql, params) => {
          chaiExpect(params[8]).to.contain({
            mode: 'offline',
            url: 'url',
            foo: 'foo',
            baz: 'baz'
          });

          return true;
        }
      );
      // updateJobStatus in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit with new status
      serviceContext.dbConnections['core'].write._push([]);
      //--- End createJob ----//

      res = await dal.launchJobTemplates(
        mockUtil.makeContext({ authType: 'api_internal' }),
        {
          input: {
            applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            scheduledJobId: '56245',
            payload: { mode: 'offline', url: 'url', foo: 'foo', baz: 'baz' },
            ids: []
          }
        }
      );

      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(1);
      chaiExpect(res[0].jobId).to.equal('29041830_3VCzbfZGaZ');
    });
    it('should launch without create TDO', async function () {
      serviceContext._clearAll();
      let res;

      // get job templates
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            job_pipeline_id: '29041830_3VCzbfZGaY'
          }
        ],
        false
      );
      // get realtime ingestion tasks
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'e123',
          id: '19041830_3VCzbfZGaW123',
          payload: { foo: 'bar', sourceId: '123' }
        }
      ]);
      // get scheduled job
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      // get the task templates
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaW123',
          job_template_id: '19041830_3VCzbfZGaW',
          engine_id: 'e123',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          is_template: true,
          payload: {
            sourceRequiresScanPipeline: true
          }
        }
      ]);

      // get fresh TDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12345',
          applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);

      // mock value for getEngines in createJobImpl function
      serviceContext.dbConnections['core'].read._push([{ id: 'e123' }]);
      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956' }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            application_name: 'oldest application'
          }
        ],
        false
      );
      // get org ID for group ID
      serviceContext.dbConnections['sso'].read._push([
        {
          id: 7682
        }
      ]);
      serviceContext.dbConnections['core'].read._push([{ id: 'e123' }]);
      serviceContext.dbConnections['core'].read._push([
        { id: 'e123', category_id: '2b876ad3-ae45-4302-a588-3b20076537d0' }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId1', runtime: { iron: '' } }
      ]);

      // EngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '2b876ad3-ae45-4302-a588-3b20076537d0',
            engine_ids: ['e123'],
            engine_alias_ids: ['e123']
          }
        ],
        false
      );

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg
      // get source content templates of source
      serviceContext.dbConnections['media_platform'].read._push([]);
      // get source content templates of schedule job
      serviceContext.dbConnections['media_platform'].read._push([]);

      //--- createJob ----//
      // createJobDb in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([
        { job_id: '29041830_3VCzbfZGaZ' }
      ]);
      // createJobAudit
      serviceContext.dbConnections['core'].write._push([]);
      // createTaskDb in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([
        { id: mockUtil.toTaskId('29041830_3VCzbfZGaZ') }
      ]);
      // updateJobStatus in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit with new status
      serviceContext.dbConnections['core'].write._push([]);
      //--- End createJob ----//

      const context = mockUtil.makeContext({ authType: 'api_internal' });

      _.set(context, '_authInfo.organization.kvp.taskPayloadDefaults', {
        default: 'test'
      });

      res = await dal.launchJobTemplates(context, {
        input: {
          applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
          scheduledJobId: '56245',
          payload: {
            mode: 'scan'
          },
          targetInfo: {
            targetId: '12345'
            // startOffsetMs: 0,
            // stopOffsetMs: 2000
          },
          ids: []
        }
      });

      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(1);
      chaiExpect(res[0].jobId).to.equal('29041830_3VCzbfZGaZ');
    });
    it('should warning if task payload has recordingId', async function () {
      serviceContext._clearAll();
      // get job templates
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            job_pipeline_id: '29041830_3VCzbfZGaY',
            jobConfig: {
              ingestionMode: 2
            }
          }
        ],
        false
      );
      // get realtime ingestion tasks
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'e123',
          id: '19041830_3VCzbfZGaW123',
          payload: { foo: 'bar', sourceId: '123' }
        }
      ]);
      // get scheduled job
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      // get the task templates
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaW123',
          job_template_id: '19041830_3VCzbfZGaW',
          engine_id: 'e123',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          is_template: true
        }
      ]);
      // get source
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 123,
            name: 'test source',
            is_public: true,
            source_type_id: 5,
            organization_id: 7682
          }
        ],
        false
      );
      // create tdo
      // get org ID
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      // get group ID
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get source type
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'test source type',
          is_live: false
        }
      ]);
      // get group ID
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get group ID
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get source ACLs
      serviceContext.dbConnections['media_platform'].read._push([
        {
          source_id: 123,
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
          permission: 'owner'
        },
        {
          source_id: 123,
          group_id: 'b0359273-ecc6-4934-aa6b-092fbed49956',
          permission: 'viewer'
        }
      ]);
      // // get org ID for group ID
      // serviceContext.dbConnections['sso'].read._push([
      //   {
      //     id: 7682
      //   }
      // ]);
      // get scheduled job
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);

      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);

      // get task
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19083102_cf9nl5DHfy0Rjev',
          engine_id: 'e123',
          job_id: 'job_123'
        }
      ]);
      // get job
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        '19083102_cf9nl5DHfy0Rjev'
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'job_123'
        }
      ]);
      // create TDO row in media table
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            media_id: 1234,
            created_date_time: moment().valueOf(),
            modified_date_time: moment().valueOf()
          }
        ],
        true
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{ id: 1234 }],
        true
      );
      // create TDO row in recording table
      serviceContext.dbConnections['core'].write._push([{}], true);
      // get fresh TDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12345',
          application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get source content templates of source
      serviceContext.dbConnections['media_platform'].read._push([]);
      // get source content templates of schedule job
      serviceContext.dbConnections['media_platform'].read._push([]);

      // TDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12345',
          application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        { id: 'e123', category_id: '4eb9a268-57ff-452b-9e9f-990a5d0f4e0e' }
      ]);
      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956' }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            application_name: 'oldest application'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: { organizationId: 7683 }
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: { organizationId: 7683 }
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: 'e123', category_id: '4eb9a268-57ff-452b-9e9f-990a5d0f4e0e' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: 'e123', category_id: '4eb9a268-57ff-452b-9e9f-990a5d0f4e0e' }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId1', runtime: { iron: '' } }
      ]);

      // EngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '2b876ad3-ae45-4302-a588-3b20076537d0',
            engine_ids: ['e123'],
            engine_alias_ids: ['e123']
          }
        ],
        false
      );

      //--- createJob ----//
      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg
      // createJobDb in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([
        { job_id: '29041830_3VCzbfZGaZ' }
      ]);
      // createJobAudit
      serviceContext.dbConnections['core'].write._push([]);
      // createTaskDb in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([
        { id: mockUtil.toTaskId('29041830_3VCzbfZGaZ') }
      ]);
      // updateJobStatus in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit with new status
      serviceContext.dbConnections['core'].write._push([]);
      //--- End createJob ----//

      const res = await dal.launchJobTemplates(
        mockUtil.makeContext({ authType: 'api_internal' }),
        {
          input: {
            applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            scheduledJobId: '56245',
            payload: {
              mode: 'ingest',
              recordingId: 123
            },
            ids: []
          }
        }
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(1);
      chaiExpect(res[0].jobId).to.equal('29041830_3VCzbfZGaZ');
    });
    it('should throw error if ingest mode is incompatible with job config', async function () {
      // get job templates
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            job_pipeline_id: '29041830_3VCzbfZGaY',
            jobConfig: {
              ingestionMode: 2
            }
          }
        ],
        false
      );
      // get realtime ingestion tasks
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'e123',
          id: '19041830_3VCzbfZGaW123',
          payload: { foo: 'bar', sourceId: '123' }
        }
      ]);
      // get scheduled job
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      // get the task templates
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaW123',
          job_template_id: '19041830_3VCzbfZGaW',
          engine_id: 'e123',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          is_template: true
        }
      ]);
      // get source
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 123,
            name: 'test source',
            is_public: true,
            source_type_id: 5,
            organization_id: 7682
          }
        ],
        false
      );
      // create tdo
      // get org ID
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      // get group ID
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get source type
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'test source',
          is_live: false
        }
      ]);
      // get source ACLs
      serviceContext.dbConnections['media_platform'].read._push([
        {
          source_id: 123,
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
          permission: 'owner'
        },
        {
          source_id: 123,
          group_id: 'b0359273-ecc6-4934-aa6b-092fbed49956',
          permission: 'viewer'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: { organizationId: 7683 }
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 123,
            name: 'test source',
            is_public: true,
            source_type_id: 5,
            organization_id: 7682
          }
        ],
        false
      );

      // get org ID for group ID
      serviceContext.dbConnections['sso'].read._push([
        {
          id: 7682
        }
      ]);
      // create TDO row in media table
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            media_id: 1234,
            created_date_time: moment().valueOf(),
            modified_date_time: moment().valueOf()
          }
        ],
        true
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{ id: 1234 }],
        true
      );
      // create TDO row in recording table
      serviceContext.dbConnections['core'].write._push([{}], true);
      // get fresh TDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12345'
        }
      ]);
      // get source content templates of source
      serviceContext.dbConnections['media_platform'].read._push([]);
      // get source content templates of schedule job
      serviceContext.dbConnections['media_platform'].read._push([]);

      // mock out a response from core-job-server
      require('request-promise').mockImplementation((uri) =>
        Promise.resolve({ job_id: '29041830_3VCzbfZGaZ' })
      );
      _.set(serviceContext, 'config.featureFlags.errorOnIngestModeWarn', true);
      try {
        const res = await dal.launchJobTemplates(
          mockUtil.makeContext({ authType: 'api_internal' }),
          {
            input: {
              applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
              scheduledJobId: '56245',
              payload: {
                mode: 'ingest',
                recordingId: 123
              },
              ids: []
            }
          }
        );
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(err.message).to.equal(
          'Ingest mode is incompatible with job config.'
        );
      }
    });
    it('should throw if supply both createTargetInfo and targetInfo in input ', async function () {
      try {
        const res = await dal.launchJobTemplates(
          mockUtil.makeContext({ authType: 'api_internal' }),
          {
            input: {
              createTargetInfo: {},
              targetInfo: {}
            }
          }
        );
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(err.message).to.equal(
          'Supply either createTargetInfo or targetInfo to launchJobTemplates, but not both.'
        );
      }
    });
    it('should use recordStartTime from payload as TDO startDateTime when provided', async function () {
      serviceContext._clearAll();

      const recordStartTime = '2024-06-15T14:30:00.000Z';
      const expectedStartMs = new Date(recordStartTime).getTime();

      const createTDOSpy = jest
        .spyOn(serviceContext.dal.tdo, 'createTDO')
        .mockResolvedValue({ id: 'mock-tdo-id' });
      const createJobSpy = jest
        .spyOn(serviceContext.dal.job, 'createJob')
        .mockResolvedValue({ id: 'mock-job-id', jobId: 'mock-job-id' });

      try {
        // get job templates
        serviceContext.dbConnections['core'].read._push(
          [{ id: 'jt-1', job_pipeline_id: 'jp-1' }],
          false
        );
        // get realtime ingestion tasks (no sourceId to skip source fetch)
        serviceContext.dbConnections['core'].read._push([
          { engine_id: 'e123', id: 'tt-1', payload: {} }
        ]);
        // get scheduled job (no primarySourceTypeId, no runMode)
        serviceContext.dbConnections['media_platform'].read._push([
          { id: 134, name: 'test scheduled job' }
        ]);
        // get task templates
        serviceContext.dbConnections['core'].read._push([
          {
            id: 'tt-1',
            job_template_id: 'jt-1',
            engine_id: 'e123',
            job_pipeline_id: 'jp-1',
            is_template: true
          }
        ]);

        await dal.launchJobTemplates(
          mockUtil.makeContext({ authType: 'api_internal' }),
          {
            input: {
              applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
              scheduledJobId: '134',
              payload: { recordStartTime: recordStartTime },
              ids: []
            }
          }
        );

        chaiExpect(createTDOSpy.mock.calls.length).to.equal(1);
        const tdoInput = createTDOSpy.mock.calls[0][1].input;
        chaiExpect(tdoInput.startDateTime).to.equal(expectedStartMs);
        chaiExpect(tdoInput.stopDateTime).to.equal(expectedStartMs);
      } finally {
        createTDOSpy.mockRestore();
        createJobSpy.mockRestore();
      }
    });
    it('should default TDO startDateTime to Date.now() when recordStartTime is not provided', async function () {
      serviceContext._clearAll();

      const createTDOSpy = jest
        .spyOn(serviceContext.dal.tdo, 'createTDO')
        .mockResolvedValue({ id: 'mock-tdo-id' });
      const createJobSpy = jest
        .spyOn(serviceContext.dal.job, 'createJob')
        .mockResolvedValue({ id: 'mock-job-id', jobId: 'mock-job-id' });

      try {
        // get job templates
        serviceContext.dbConnections['core'].read._push(
          [{ id: 'jt-1', job_pipeline_id: 'jp-1' }],
          false
        );
        // get realtime ingestion tasks
        serviceContext.dbConnections['core'].read._push([
          { engine_id: 'e123', id: 'tt-1', payload: {} }
        ]);
        // get scheduled job
        serviceContext.dbConnections['media_platform'].read._push([
          { id: 134, name: 'test scheduled job' }
        ]);
        // get task templates
        serviceContext.dbConnections['core'].read._push([
          {
            id: 'tt-1',
            job_template_id: 'jt-1',
            engine_id: 'e123',
            job_pipeline_id: 'jp-1',
            is_template: true
          }
        ]);

        const beforeTime = Date.now();
        await dal.launchJobTemplates(
          mockUtil.makeContext({ authType: 'api_internal' }),
          {
            input: {
              applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
              scheduledJobId: '134',
              payload: { mode: 'stream' },
              ids: []
            }
          }
        );
        const afterTime = Date.now();

        chaiExpect(createTDOSpy.mock.calls.length).to.equal(1);
        const tdoInput = createTDOSpy.mock.calls[0][1].input;
        chaiExpect(tdoInput.startDateTime).to.be.at.least(beforeTime);
        chaiExpect(tdoInput.startDateTime).to.be.at.most(afterTime);
        chaiExpect(tdoInput.stopDateTime).to.equal(tdoInput.startDateTime);
      } finally {
        createTDOSpy.mockRestore();
        createJobSpy.mockRestore();
      }
    });
  });
  describe('#createAllScheduledJobs', function () {
    it('should fail if scheduleJobId is null', async function () {
      try {
        const res = await dal.createAllScheduledJobs(mockUtil.makeContext(), {
          input: {
            scheduledJobId: null
          }
        });
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });
    it('should fail if Supply both createTargetInfo and targetInfo', async function () {
      try {
        const res = await dal.createAllScheduledJobs(mockUtil.makeContext(), {
          input: {
            scheduledJobId: 12345,
            createTargetInfo: {},
            targetInfo: {}
          }
        });
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(err.message).to.equal(
          'Supply either createTargetInfo or targetInfo to launchScheduledJobs, but not both.'
        );
      }
    });
    it('should fail if invalid input templateId', async function () {
      // get scheduled job
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'sj123',
          application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
          organization_id: 7682,
          primary_source_id: 134
        }
      ]);
      // get app id from Org Id
      serviceContext.dbConnections['sso'].read._push([
        { application_id: '2ca510a9-c8cc-46d9-abb7-e597e0049059' }
      ]);
      // get job pipe lines
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        '19041830_3VCzbfZGaZ'
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
          job_pipeline_id: '29041830_3VCzbfZGaY'
        }
      ]);

      // get source
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123,
          name: 'test source',
          is_public: true,
          source_type_id: 5,
          organization_id: 7682
        }
      ]);
      // get the parent job
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaZ',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          template_id: null
        }
      ]);
      // get parent info
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaZ',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          template_id: null
        }
      ]);
      try {
        const res = await dal.createAllScheduledJobs(mockUtil.makeContext(), {
          input: {
            applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            payload: {
              sourceId: 's123',
              mode: 'ingest'
            },
            organizationId: 7682,
            parentJobId: '19041830_3VCzbfZGaZ',
            scheduledJobId: '56245',
            targetInfo: {}
          }
        });
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(err.message).to.equal(
          'The specified job ID is not part of a job pipeline and ' +
            'is not a parent job. Only jobs that were launched from a job template ' +
            'that is part of a job pipeline can be passed to this mutation.'
        );
      }
    });
    it('should create all scheduled jobs', async function () {
      //////
      // get scheduled job
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '56245',
          application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
          organization_id: 7682
        }
      ]);

      // get the parent job
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        '19041830_3VCzbfZGaZ'
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaZ',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          template_id: '19041830_3VCzbfZGaZ'
        }
      ]);
      // get parent info
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaZ',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          template_id: '19041830_3VCzbfZGaZ'
        }
      ]);
      // get the job templates
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaW',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          scheduled_job_id: 'sj123'
        },
        {
          id: '19041830_3VCzbfZGaW',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          scheduled_job_id: 'sj123'
        }
      ]);
      // get the task templates
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaW123',
          job_template_id: '19041830_3VCzbfZGaW',
          engine_id: '34f23e1b-0db8-45c4-a9d9-bc9270e491c2',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          is_template: true,
          payload: {
            sourceRequiresScanPipeline: {}
          }
        }
      ]);
      // get realtime ingestion tasks
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: '34f23e1b-0db8-45c4-a9d9-bc9270e491c2',
          id: '19041830_3VCzbfZGaW123',
          payload: {
            foo: 'bar',
            sourceId: '123',
            sourceRequiresScanPipeline: {}
          }
        }
      ]);
      // get scheduled job
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '56245',
          application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
          organization_id: 7682
        }
      ]);
      // get the task templates
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041830_3VCzbfZGaW123',
          job_template_id: '19041830_3VCzbfZGaW',
          engine_id: '34f23e1b-0db8-45c4-a9d9-bc9270e491c2',
          job_pipeline_id: '29041830_3VCzbfZGaY',
          is_template: true
        }
      ]);

      //---- createJob -----//
      // getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '1234567',
          application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);

      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);

      // getEngines in createJobImpl
      serviceContext.dbConnections['core'].read._push([
        {
          id: '34f23e1b-0db8-45c4-a9d9-bc9270e491c2',
          category_id: '2b876ad3-ae45-4302-a588-3b20076537d0'
        }
      ]);
      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956' }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            application_name: 'oldest application'
          }
        ],
        false
      );

      // get org ID
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      // get org ID
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      // engine
      serviceContext.dbConnections['core'].read._push([
        {
          id: '34f23e1b-0db8-45c4-a9d9-bc9270e491c2',
          category_id: '2b876ad3-ae45-4302-a588-3b20076537d0'
        }
      ]);
      // getEngine in job model validation
      serviceContext.dbConnections['core'].read._push([
        {
          id: '34f23e1b-0db8-45c4-a9d9-bc9270e491c2',
          category_id: '2b876ad3-ae45-4302-a588-3b20076537d0'
        }
      ]);
      // _getDeployedBuild in createJobImpl
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: '34f23e1b-0db8-45c4-a9d9-bc9270e491c2',
          id: '172c8489-a6de-478b-ae24-9e4045727bce',
          status: 'deployed'
        }
      ]);
      // EngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '2b876ad3-ae45-4302-a588-3b20076537d0',
            engine_ids: ['e123'],
            engine_alias_ids: ['e123']
          }
        ],
        false
      );

      // createJobDb in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([
        { job_id: '29041830_3VCzbfZGaZ' }
      ]);
      // createTaskDb in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([
        { id: mockUtil.toTaskId('29041830_3VCzbfZGaZ') }
      ]);
      // updateJobStatus in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([]);
      //--- End createJob ----//

      // get group ID
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get group ID
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get source
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123,
          name: 'test source',
          is_public: true,
          source_type_id: 5,
          organization_id: 7682
        }
      ]);
      // get task
      serviceContext.dbConnections['core'].read._push([
        { id: '19072812_U8hkKK9DfrFLql0', job_id: '19041830_3VCzbfZGaZ' }
      ]);
      // get job
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        '19041830_3VCzbfZGaZ'
      );
      serviceContext.dbConnections['core'].read._push([
        { id: '19041830_3VCzbfZGaZ' }
      ]);
      // get source type
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'test source',
          is_live: false
        }
      ]);
      // get org ID for group ID
      serviceContext.dbConnections['sso'].read._push([
        {
          id: 7682
        }
      ]);
      // get source ACLs
      serviceContext.dbConnections['media_platform'].read._push([
        {
          source_id: 123,
          group_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
          permission: 'owner'
        },
        {
          source_id: 123,
          group_id: 'b0359273-ecc6-4934-aa6b-092fbed49956',
          permission: 'viewer'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: { organizationId: 7683 }
        }
      ]);

      // create TDO row in media table
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            media_id: 1234,
            created_date_time: moment().valueOf(),
            modified_date_time: moment().valueOf()
          }
        ],
        true,
        [
          'media_id',
          'owner_application_id',
          'media_source_id',
          'program_id',
          'is_public'
        ],
        (sql, args) => {
          // verify some basic query structure and also that owner app ID and is_public input are correct
          if (args[2] !== 'a0359273-ecc6-4934-aa6b-092fbed49956') return false;
          if (args[7] !== true) return false;
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{}],
        true,
        ['media_metadata'],
        (sql, args) => {
          // verify structure of metadata for public media
          if (_.get(args[1], 'veritonePermissions.isPublic') !== true)
            return false;
          if (
            _.get(args[1], 'veritonePermissions.acls[0].groupId') !==
            'a0359273-ecc6-4934-aa6b-092fbed49956'
          )
            return false;
          if (
            _.get(args[1], 'veritonePermissions.acls[0].permission') !== 'owner'
          )
            return false;
          if (
            _.get(args[1], 'veritonePermissions.acls[1].groupId') !==
            'b0359273-ecc6-4934-aa6b-092fbed49956'
          )
            return false;
          if (
            _.get(args[1], 'veritonePermissions.acls[1].permission') !==
            'viewer'
          )
            return false;
          if (_.get(args[1], 'security.global') !== true) return false;
          if (_.get(args[1], 'mediaSourceId') !== '123') return false;
          if (_.get(args[1], 'veritoneMediaSource.mediaSourceId') !== '123')
            return false;
          if (_.get(args[1], 'veritoneMediaSource.mediaSourceTypeId') !== '5')
            return false;
          return true;
        }
      );

      serviceContext.dbConnections['core'].write._push(
        [{}],
        true,
        [
          'INSERT',
          'recording',
          'recording_metadata',
          'recording_id',
          'content',
          'type',
          'is_public',
          'source_id',
          'created_date_time',
          'modified_date_time',
          'start_date_time',
          'stop_date_time'
        ],
        (sql, args) => {
          // validate a bunch of legacy junk is in the JSON
          let json = args[2];
          if (_.get(json, 'veritonePermissions.isPublic') !== true)
            return false;
          if (
            _.get(json, 'veritonePermissions.acls[0].groupId') !==
            'a0359273-ecc6-4934-aa6b-092fbed49956'
          )
            return false;
          if (_.get(json, 'veritonePermissions.acls[0].permission') !== 'owner')
            return false;
          if (
            _.get(json, 'veritonePermissions.acls[1].groupId') !==
            'b0359273-ecc6-4934-aa6b-092fbed49956'
          )
            return false;
          if (
            _.get(json, 'veritonePermissions.acls[1].permission') !== 'viewer'
          )
            return false;
          if (_.get(json, 'security.global') !== true) return false;
          if (_.get(json, 'mediaSourceId') !== '123') return false;
          if (_.get(json, 'veritoneMediaSource.mediaSourceId') !== '123')
            return false;
          if (_.get(json, 'veritoneMediaSource.mediaSourceTypeId') !== '5')
            return false;
          if (args[0] !== '1234') return false; // recording_id from media_id
          if (args[1] !== 'a0359273-ecc6-4934-aa6b-092fbed49956') return false; // application_id
          if (args[3] !== true) return false; // is_public
          if (args[4] !== '123') return true; // source_id
          if (args[6] !== '7682') return false; // org id

          if (!_.isNumber(args[7])) return false; // create date
          if (!_.isNumber(args[8])) return false; // modify date
          if (!_.isString(args[9])) return false; // start date
          if (!_.isString(args[10])) return false; // stop date

          // now validate all the recording_metadata rows
          if (args[11] !== 'veritone-permissions') return false;
          json = JSON.parse(args[12]);
          if (_.get(json, 'isPublic') !== true) return false;
          if (
            _.get(json, 'acls[0].groupId') !==
            'a0359273-ecc6-4934-aa6b-092fbed49956'
          )
            return false;
          if (_.get(json, 'acls[0].permission') !== 'owner') return false;
          if (
            _.get(json, 'acls[1].groupId') !==
            'b0359273-ecc6-4934-aa6b-092fbed49956'
          )
            return false;
          if (_.get(json, 'acls[1].permission') !== 'viewer') return false;

          if (args[13] !== 'veritone-media-source') return false;
          json = JSON.parse(args[14]);
          if (_.get(json, 'mediaSourceId') !== '123') return false;
          if (_.get(json, 'mediaSourceTypeId') !== '5') return false;

          if (args[15] !== 'source-task-data') return false;
          json = JSON.parse(args[16]);
          if (_.get(json, 'sourceId') !== '123') return false;
          if (_.isNil(json.taskId)) return false;

          return true;
        }
      );
      // get fresh TDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '1234',
          application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get source content templates
      serviceContext.dbConnections['media_platform'].read._push([]);

      const res = await dal.createAllScheduledJobs(
        mockUtil.makeContext({ authType: 'api_internal' }),
        {
          input: {
            applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            payload: {
              sourceId: 's123',
              fileId:
                'podcast://https://dts.podtrac.com/redirect.mp3/traffic.omny.fm/d/clips/b7b0cd27-d348-1fbd-ac3c-b6fa0141bca6/bbf315db-88a4-428f-bde6-b84e1141ccbe/3656290f-6ee1-4586-a0e3-aa2c01111fc0/audio.mp3?utm_source=Podcast&in_playlist=1143fcc8-f66c-1d2a-b67e-a84e4441c10&t=1125091423',
              lastModifiedDate: 1555091384000,
              metadata: {
                filename: 'a_test_podcast_20190412_audio.mp3',
                isPublic: true
              },
              mode: 'ingest'
            },
            parentJobId: '19041830_3VCzbfZGaZ',
            scheduledJobId: '56245',
            targetInfo: { targetId: '1234567' }
          }
        }
      );

      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(1);
      chaiExpect(res[0].id).to.equal('29041830_3VCzbfZGaZ');
    });
    it('should use recordStartTime from payload as TDO startDateTime when creating TDO', async function () {
      serviceContext._clearAll();

      const recordStartTime = '2024-06-15T14:30:00.000Z';
      const expectedStartMs = new Date(recordStartTime).getTime();

      const createTDOSpy = jest
        .spyOn(serviceContext.dal.tdo, 'createTDO')
        .mockResolvedValue({ id: 'mock-tdo-id' });
      const createJobSpy = jest
        .spyOn(serviceContext.dal.job, 'createJob')
        .mockResolvedValue({ id: 'mock-job-id', jobId: 'mock-job-id' });

      try {
        // -- createPipelineJobs --
        // get scheduled job (with organization_id, no primarySourceId)
        serviceContext.dbConnections['media_platform'].read._push([
          { id: '56245', name: 'test scheduled job', organization_id: 7682 }
        ]);
        // getAppIdFromOrgId
        serviceContext.dbConnections['sso'].read._push([
          { application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956' }
        ]);
        // get job templates (no sourceRequiresScanPipeline so createTDO stays true)
        serviceContext.dbConnections['core'].read._push([
          { id: 'jt-1', job_pipeline_id: 'jp-1' }
        ]);
        // get task templates (in createPipelineJobs loop)
        serviceContext.dbConnections['core'].read._push([
          {
            id: 'tt-1',
            job_template_id: 'jt-1',
            engine_id: 'e123',
            job_pipeline_id: 'jp-1',
            is_template: true
          }
        ]);
        // getOrgIdFromAppId (in createPipelineJobs, before TDO creation)
        serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);
        // -- TDO created here (mocked), targetInfo set on input --

        // -- launchNewJobFromTemplate --
        // get realtime ingestion tasks
        serviceContext.dbConnections['core'].read._push([]);
        // get scheduled job (again, in launchNewJobFromTemplate)
        serviceContext.dbConnections['media_platform'].read._push([
          { id: '56245', name: 'test scheduled job' }
        ]);
        // get task templates (in launchNewJobFromTemplate)
        serviceContext.dbConnections['core'].read._push([
          {
            id: 'tt-1',
            job_template_id: 'jt-1',
            engine_id: 'e123',
            job_pipeline_id: 'jp-1',
            is_template: true
          }
        ]);
        // -- job created here (mocked) --

        await dal.createAllScheduledJobs(
          mockUtil.makeContext({ authType: 'api_internal' }),
          {
            input: {
              scheduledJobId: '56245',
              payload: { recordStartTime: recordStartTime }
            }
          }
        );

        chaiExpect(createTDOSpy.mock.calls.length).to.equal(1);
        const tdoInput = createTDOSpy.mock.calls[0][1].input;
        chaiExpect(tdoInput.startDateTime).to.equal(expectedStartMs);
        chaiExpect(tdoInput.stopDateTime).to.equal(expectedStartMs);
      } finally {
        createTDOSpy.mockRestore();
        createJobSpy.mockRestore();
      }
    });
    it('should default TDO startDateTime to Date.now() when recordStartTime is not provided and creating TDO', async function () {
      serviceContext._clearAll();

      const createTDOSpy = jest
        .spyOn(serviceContext.dal.tdo, 'createTDO')
        .mockResolvedValue({ id: 'mock-tdo-id' });
      const createJobSpy = jest
        .spyOn(serviceContext.dal.job, 'createJob')
        .mockResolvedValue({ id: 'mock-job-id', jobId: 'mock-job-id' });

      try {
        // -- createPipelineJobs --
        // get scheduled job
        serviceContext.dbConnections['media_platform'].read._push([
          { id: '56245', name: 'test scheduled job', organization_id: 7682 }
        ]);
        // getAppIdFromOrgId
        serviceContext.dbConnections['sso'].read._push([
          { application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956' }
        ]);
        // get job templates
        serviceContext.dbConnections['core'].read._push([
          { id: 'jt-1', job_pipeline_id: 'jp-1' }
        ]);
        // get task templates (in createPipelineJobs loop)
        serviceContext.dbConnections['core'].read._push([
          {
            id: 'tt-1',
            job_template_id: 'jt-1',
            engine_id: 'e123',
            job_pipeline_id: 'jp-1',
            is_template: true
          }
        ]);
        // getOrgIdFromAppId (in createPipelineJobs, before TDO creation)
        serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);

        // -- launchNewJobFromTemplate --
        serviceContext.dbConnections['core'].read._push([]);
        serviceContext.dbConnections['media_platform'].read._push([
          { id: '56245', name: 'test scheduled job' }
        ]);
        serviceContext.dbConnections['core'].read._push([
          {
            id: 'tt-1',
            job_template_id: 'jt-1',
            engine_id: 'e123',
            job_pipeline_id: 'jp-1',
            is_template: true
          }
        ]);

        const beforeTime = Date.now();
        await dal.createAllScheduledJobs(
          mockUtil.makeContext({ authType: 'api_internal' }),
          {
            input: {
              scheduledJobId: '56245',
              payload: { mode: 'stream' }
            }
          }
        );
        const afterTime = Date.now();

        chaiExpect(createTDOSpy.mock.calls.length).to.equal(1);
        const tdoInput = createTDOSpy.mock.calls[0][1].input;
        chaiExpect(tdoInput.startDateTime).to.be.at.least(beforeTime);
        chaiExpect(tdoInput.startDateTime).to.be.at.most(afterTime);
        chaiExpect(tdoInput.stopDateTime).to.equal(tdoInput.startDateTime);
      } finally {
        createTDOSpy.mockRestore();
        createJobSpy.mockRestore();
      }
    });
  });
});
