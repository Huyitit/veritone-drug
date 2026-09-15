const _ = require('lodash');
const httpMock = require('node-mocks-http');
const mockUtil = require('../../../test/mockUtil.js')();
const jobDbResults = require('../../../test/jobTemplateRows.json');
// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();

const sjDbRead = serviceContext.dbConnections['media_platform'].read;
const sjDbWrite = serviceContext.dbConnections['media_platform'].write;
const jobDbRead = serviceContext.dbConnections['core'].read;
const jobDbWrite = serviceContext.dbConnections['core'].write;
const ssoDbRead = serviceContext.dbConnections['sso'].read;
const ssoDbWrite = serviceContext.dbConnections['sso'].write;
_.set(serviceContext.config, 'legacyEngineToRealTimeEngines', {
  engineId: 'engineId'
});
serviceContext.dal.structuredData = {
  createStructuredData: (args, context) => Promise.resolve({ id: '1234sdo' })
};

const dal = require('./scheduledJob')(serviceContext);

beforeEach(() => {
  serviceContext._clearAll();
});

function expectFunction(object, key) {
  expect(typeof object[key]).toEqual('function');
}

describe('#scheduledJobs', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      expect(dal).toBeInstanceOf(Object);
      expect(Object.keys(dal).length).toEqual(35);
      expectFunction(dal, 'getSchedulesForWatchlist');
      expectFunction(dal, 'getScheduleIdsForWatchlist');
      expectFunction(dal, 'getScheduledJobs');
      expectFunction(dal, 'getScheduledJob');
      expectFunction(dal, 'getScheduleParts');
      expectFunction(dal, 'setScheduleParts');
      expectFunction(dal, 'createScheduledJob');
      expectFunction(dal, 'cloneScheduledJob');
      expectFunction(dal, 'getMediaSourceDetails');
      expectFunction(dal, 'updateScheduledJob');
      expectFunction(dal, 'deleteScheduledJob');
      expectFunction(dal, 'getJobTemplateIdsForScheduledJob');
      expectFunction(dal, 'getDetails');
      expectFunction(dal, 'createScheduledJobContentTemplate');
      expectFunction(dal, 'deleteScheduledJobContentTemplate');
      expectFunction(dal, 'getScheduledJobContentTemplates');
      expectFunction(dal, 'getScheduledJobPermission');
      expectFunction(dal, 'getAffiliates');
      expectFunction(dal, 'getCollaborators');
      expectFunction(dal, 'setAffiliates');
      expectFunction(dal, 'revertScheduledJob');
      expectFunction(dal, 'updateCollaborators');
      expectFunction(dal, 'setJobPipelinesAndJobTemplates');
      expectFunction(dal, 'mapUnitsIn');
      expectFunction(dal, 'migrateLegacyV3JobsToTaskTemplates');
      expectFunction(dal, 'migrateLastProcessedDateToSource');
      expectFunction(dal, 'migrateLegacyProgramToScheduledJobParts');
      expectFunction(dal, 'findPrimarySource');
      expectFunction(dal, 'findPrimarySourceByJobTemplate');
      expectFunction(dal, 'findPrimarySourceByJobPipeline');
      expectFunction(dal, 'getProgramFormatId');
      expectFunction(dal, 'createContentTemplateSql');
      expectFunction(dal, 'getAllTDOsForSource');
      expectFunction(dal, 'mapSchedulePart');
    });
  });

  describe('#getSchedulesForWatchlist', function () {
    it('should get schedules for watchlist', async function () {
      const context = mockUtil.makeContext();
      sjDbRead._push([
        {
          program_id: '12345',
          date_start: null,
          date_end: null,
          schedule_status_id: 1,
          media_source_id: '123'
        },
        {
          program_id: '12345',
          date_start: null,
          date_end: null,
          schedule_status_id: 1,
          media_source_id: '123'
        }
      ]);
      const res = await dal.getSchedulesForWatchlist(
        context,
        {
          offset: 1,
          limit: 10
        },
        'watchlistId'
      );
      expect(res).toExist;
    });
  });
  describe('#getScheduleIdsForWatchlist', function () {
    it('should get schedules ids for watchlist', async function () {
      const context = mockUtil.makeContext();
      sjDbRead._push([
        {
          program_id: '12345',
          date_start: null,
          date_end: null,
          schedule_status_id: 1,
          media_source_id: '123'
        },
        {
          program_id: '12345',
          date_start: null,
          date_end: null,
          schedule_status_id: 1,
          media_source_id: '123'
        }
      ]);
      const res = await dal.getScheduleIdsForWatchlist(
        context,
        {
          offset: 1,
          limit: 10
        },
        'watchlistId'
      );
      expect(res).toExist;
    });
  });
  describe('#getScheduledJobs', function () {
    it('should get for internal token', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      await testGetScheduledJobs(context);
    });
    it('should get for org API token', async function () {
      const context = mockUtil.makeContext({ authType: 'api_org' });
      await testGetScheduledJobs(context, { organizationId: 7682 });
    });
    it('should get for user', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      await testGetScheduledJobs(context, { organizationId: 7682 });
    });
    it('should return empty if no running jobs', async function () {
      const context = mockUtil.getGraphQLContext(null, 'user');
      serviceContext.dbConnections['core'].read._push([]);
      const res = await testGetScheduledJobs(context, {
        organizationId: 7682,
        hasRunningJobs: true
      });
      expect(res.count).toEqual(0);
    });
  });
  describe('#getScheduledJob', function () {
    it('should get scheduled job', async function () {
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.getScheduledJob(context, {
        id: '1ace46d4-9e27-4fea-9623-75231ff21195'
      });
      expect(res).toExist;
    });

    it('should throw not found', async function () {
      sjDbRead._push([]);
      const context = mockUtil.makeContext();
      try {
        const res = await dal.getScheduledJob(context, {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195'
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
  });
  describe('#getScheduleParts', function () {
    it('should get scheduled job', async function () {
      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      // get from program schedule
      sjDbRead._push([
        {
          id: '12345',
          date_start: null,
          date_end: null,
          scheduled_day: null
        }
      ]);
      // get from recurring schedule
      sjDbRead._push([
        {
          repeat_interval_unit: 1,
          repeat_interval: 1000
        }
      ]);

      const context = mockUtil.makeContext();
      const res = await dal.getScheduleParts(context, {
        id: '1ace46d4-9e27-4fea-9623-75231ff21195'
      });
      expect(res).toExist;
    });
  });
  describe('#setScheduleParts', function () {
    it('should get scheduled job', async function () {
      // get source to convert to station local time
      sjDbRead._push([
        {
          id: 134
        }
      ]);
      // delete and insert into program schedule
      sjDbWrite._push([
        {
          program_id: 134,
          program_schedule_id: 123,
          date_start: new Date(),
          date_end: new Date()
        }
      ]);
      // update  program schedule
      sjDbWrite._push([
        {
          program_id: 134,
          program_schedule_id: 123,
          date_start: new Date(),
          date_end: new Date()
        }
      ]);
      // insert into program_schedule_day
      sjDbWrite._push([
        {
          program_schedule_id: 134,
          start_time: new Date(),
          VALUES: new Date()
        }
      ]);

      const context = mockUtil.makeContext();
      const res = await dal.setScheduleParts(
        context,
        '1ace46d4-9e27-4fea-9623-75231ff21195',
        {
          primarySourceId: 134,
          organizationId: 7682,
          weeklyScheduleParts: [
            {
              stopTime: new Date(),
              scheduledDay: 'Monday'
            }
          ],
          recurringScheduleParts: [
            {
              repeatIntervalUnit: 'Minutes',
              repeatInterval: 10,
              durationSeconds: 1000,
              startTime: new Date(),
              scheduledDay: 'Sunday'
            }
          ]
        }
      );
      expect(res).toExist;
    });
    it('should fail if invalid input', async function () {
      // get source to convert to station local time
      sjDbRead._push([
        {
          id: 134
        }
      ]);
      // delete and insert into program schedule
      sjDbWrite._push([
        {
          program_id: 134,
          program_schedule_id: 123,
          date_start: new Date(),
          date_end: new Date()
        }
      ]);
      // update  program schedule
      sjDbWrite._push([
        {
          program_id: 134,
          program_schedule_id: 123,
          date_start: new Date(),
          date_end: new Date()
        }
      ]);
      // insert into program_schedule_day
      sjDbWrite._push([
        {
          program_schedule_id: 134,
          start_time: new Date(),
          VALUES: new Date()
        }
      ]);

      const context = mockUtil.makeContext();
      try {
        const res = await dal.setScheduleParts(
          context,
          '1ace46d4-9e27-4fea-9623-75231ff21195',
          {
            primarySourceId: 134,
            organizationId: 7682,
            weeklyScheduleParts: [
              {
                stopTime: new Date(),
                scheduledDay: 'Monday'
              }
            ],
            recurringScheduleParts: [
              {
                repeatIntervalUnit: 'Minutes',
                repeatInterval: 10,
                durationSeconds: -1,
                startTime: new Date(),
                scheduledDay: 'Sunday'
              }
            ]
          }
        );
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'Recurring schedule part duration should be positive.'
        );
      }
    });
  });
  describe('#createScheduledJob', function () {
    it('should create a scheduled job', async function () {
      const context = mockUtil.makeContext();
      // getOrganization
      sjDbRead._push([{ exists: true }]);
      sjDbWrite._push([
        {
          organization_id: 7682,
          isLimitEnforced: false,
          remainingBudget: 1000
        }
      ]);
      mockCreateScheduledJob();
      const res = await dal.createScheduledJob(context, {
        organizationId: 7682,
        input: {
          applicationId: 'applicationId',
          organizationId: 7682,
          isPublic: false,
          jobTemplateIds: ['jobt123', 'jobt234'],
          details: {
            foo: 'bar'
          },
          weeklyScheduleParts: [
            {
              scheduledDay: 'Monday',
              startTime: '01:00',
              stopTime: '02:00'
            },
            {
              scheduledDay: 'Friday',
              startTime: '14:00',
              stopTime: '16:00'
            }
          ],
          contentTemplates: [
            {
              data: {
                foo: 'bar'
              },
              schemaId: '81ca224a-ae73-4f8d-9d5a-feea644d4956'
            }
          ],
          collaborators: [
            {
              organizationId: 7683,
              permission: 'editor'
            },
            {
              organizationId: '7681',
              permission: 'viewer'
            }
          ],
          jobTemplates: [
            {
              skipDecider: true,
              clusterId: 'clusterId',
              jobConfig: {
                createTDOInput: {
                  details: {
                    tags: ['foo', 'bar']
                  }
                }
              },
              taskTemplates: [
                {
                  engineId: 'engine1',
                  payload: {
                    foo: 'bar',
                    sourceId: 'sourceId'
                  }
                }
              ]
            }
          ],
          runMode: 'Now'
        }
      });
    });
    it('should fail if no org ID', async function () {
      const context = mockUtil.makeContext();
      try {
        await dal.createScheduledJob(context, {
          input: {}
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should fail to create public if not superadmin', async function () {
      const context = mockUtil.makeContext();
      // clear auth info
      context._authInfo = null;
      try {
        await dal.createScheduledJob(context, {
          organizationId: 7682,
          input: {
            organizationId: 7682,
            isPublic: true
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
      }
    });
    it('should fail if job template not found', async function () {
      const context = mockUtil.makeContext();
      try {
        // getOrganization
        sjDbRead._push([{ exists: true }]);
        sjDbWrite._push([
          {
            organization_id: 7682,
            isLimitEnforced: false,
            remainingBudget: 1000
          }
        ]);
        jobDbRead._push([]);
        await dal.createScheduledJob(context, {
          organizationId: 7682,
          input: {
            organizationId: 7682,
            jobTemplateIds: ['jobt123', 'jobt234']
          }
        });

        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
        expect(err.message).toEqual('Some job templates could not be found');
      }
    });

    it('should fail if dag template is missing', async function () {
      const context = mockUtil.makeContext();
      try {
        // getOrganization
        sjDbRead._push([{ exists: true }]);
        sjDbWrite._push([
          {
            organization_id: 7682,
            isLimitEnforced: false,
            remainingBudget: 1000
          }
        ]);
        jobDbRead._push([]);
        await dal.createScheduledJob(context, {
          organizationId: 7682,
          input: {
            organizationId: 7682,
            dagTemplates: {
              dagTemplateIds: ['dagt123'],
              params: {
                foo: 'bar'
              },
              jobConfig: {
                foo: 'bar'
              }
            }
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
    it('should fail if dag template is wrong format', async function () {
      const context = mockUtil.makeContext();
      try {
        // getOrganization
        sjDbRead._push([{ exists: true }]);
        sjDbWrite._push([
          {
            organization_id: 7682,
            isLimitEnforced: false,
            remainingBudget: 1000
          }
        ]);
        jobDbRead._push([
          { id: 'testId', dag_language: 'not_handlebars', dag: 'test' }
        ]);
        await dal.createScheduledJob(context, {
          organizationId: 7682,
          input: {
            organizationId: 7682,
            dagTemplates: {
              dagTemplateIds: ['dagt123'],
              params: {
                foo: 'bar'
              },
              jobConfig: {
                foo: 'bar'
              }
            }
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.data.erroredDagTemplates[0].dagTemplateId).toEqual('testId');
        expect(err.data.erroredDagTemplates[0].wrappedError).toEqual(
          'This DAG template uses unsupported templating language'
        );
      }
    });
    it('should fail if dag template is invalid', async function () {
      const context = mockUtil.makeContext();
      try {
        // getOrganization
        sjDbRead._push([{ exists: true }]);
        sjDbWrite._push([
          {
            organization_id: 7682,
            isLimitEnforced: false,
            remainingBudget: 1000
          }
        ]);
        jobDbRead._push([
          { dagTemplateLanguage: 'Handlebars', dag: 'not_valid_handlebars' }
        ]);
        await dal.createScheduledJob(context, {
          organizationId: 7682,
          input: {
            organizationId: 7682,
            dagTemplates: {
              dagTemplateIds: ['dagt123'],
              params: {
                foo: 'bar'
              },
              jobConfig: {
                foo: 'bar'
              }
            }
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should create a job template from a valid dag template', async function () {
      const createJobTemplateSpy = jest.spyOn(
        serviceContext.dal.jobTemplate,
        'createJobTemplate'
      );
      const context = mockUtil.makeContext();
      // getOrganization
      sjDbRead._push([{ exists: true }]);
      sjDbWrite._push([
        {
          organization_id: 7682,
          isLimitEnforced: false,
          remainingBudget: 1000
        }
      ]);
      // Read dag template
      jobDbRead._push([
        {
          dagTemplateLanguage: 'Handlebars',
          dag: {
            template:
              '{"clusterId":"{{{clusterId}}}","routes":[],"tasks":[{"taskName":"dagTemplateTaskTest"}]}'
          }
        }
      ]);

      // fetch cluster info
      jobDbRead._push(
        [
          {
            id: 'test-cluster-id',
            organization_id: '7682',
            name: 'test cluster'
          }
        ],
        true,
        ['is_public']
      );

      // Write job template
      jobDbWrite._push([{ id: 'jobTemplate123' }]);

      // get task template
      jobDbRead._push([
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

      // get Engine
      serviceContext.dbConnections['core'].read._push([
        {
          id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
          state: 'active'
        }
      ]);
      // get Build
      serviceContext.dbConnections['core'].write._push([
        { id: '0d745844-55f5-47e1-8c40-afdc02c502e7', status: 'deployed' }
      ]);

      // read task template
      jobDbRead._push([{ id: 'task123' }]);

      // program write
      sjDbWrite._push([{ id: '370178bf-e203-4ca1-b4e5-bdee43450d5c' }]);

      // group read
      ssoDbRead._push([{ group_id: 'group123' }]);

      // program acl write
      sjDbWrite._push([{}]);

      // schedule write
      sjDbWrite._push([{ program_id: 'program123' }]);

      //schedule id write
      sjDbWrite._push([{}]);

      // talent read
      sjDbRead._push([{ talent_id: 'talent123' }], false);

      // talent write
      sjDbWrite._push([{}]);

      // scheduled job write
      jobDbWrite._push([
        { schedule_job_id: 'scheduleJob123', jobTemplateId: 'jobTemplate123' }
      ]);

      // job templates read
      jobDbRead._push([{ template_id: 'jobTemplate123' }]);

      // update program write
      sjDbWrite._push([{}]);

      // read back program
      sjDbRead._push([{}]);
      await dal.createScheduledJob(context, {
        organizationId: 7682,
        input: {
          organizationId: 7682,
          applicationId: 'app123',
          isPublic: false,
          dagTemplates: {
            dagTemplateIds: ['dagt123'],
            params: {
              foo: 'bar',
              clusterId: 'test-cluster-id'
            },
            jobConfig: {
              foo: 'bar'
            }
          }
        }
      });
      expect(createJobTemplateSpy).toHaveBeenCalled();
      const createJobTemplateInput =
        createJobTemplateSpy.mock.calls[0][1].input;
      expect(createJobTemplateInput.taskTemplates[0]).toHaveProperty(
        'taskName',
        'dagTemplateTaskTest'
      );
      expect(createJobTemplateInput.clusterId).toBe('test-cluster-id');
      createJobTemplateSpy.mockRestore();
    });

    it('should fail if no engine IDs are found in templates', async function () {
      const context = mockUtil.makeContext();
      try {
        // getOrganization
        sjDbRead._push([{ exists: true }]);
        sjDbWrite._push([
          {
            organization_id: 7682,
            isLimitEnforced: false,
            remainingBudget: 1000
          }
        ]);
        // job templates with valid engine IDs
        jobDbRead._push([
          {
            id: 'jobTemplate123',
            taskTemplates: [
              { engineId: '0d745844-55f5-47e1-8c40-afdc02c502e7' }
            ]
          }
        ]);
        // get task template
        jobDbRead._push([]);

        await dal.createScheduledJob(context, {
          organizationId: 7682,
          input: {
            organizationId: 7682,
            jobTemplateIds: ['jobTemplate123']
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toEqual(
          'No engine IDs were found in the provided templates.'
        );
      }
    });

    it('should fail if engine is disabled', async function () {
      const context = mockUtil.makeContext();
      try {
        // getOrganization
        sjDbRead._push([{ exists: true }]);
        sjDbWrite._push([
          {
            organization_id: 7682,
            isLimitEnforced: false,
            remainingBudget: 1000
          }
        ]);
        // job templates with valid engine IDs
        jobDbRead._push([
          {
            id: 'jobTemplate123',
            taskTemplates: [
              { engineId: '0d745844-55f5-47e1-8c40-afdc02c502e7' }
            ]
          }
        ]);
        // get task template
        jobDbRead._push([
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
        // getEngine
        jobDbRead._push([
          {
            id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
            state: 'disabled'
          }
        ]);
        await dal.createScheduledJob(context, {
          organizationId: 7682,
          input: {
            organizationId: 7682,
            jobTemplateIds: ['jobTemplate123']
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toContain('Some engines are not active');
      }
    });

    it('should fail if engine is not deployed', async function () {
      const context = mockUtil.makeContext();
      try {
        // getOrganization
        sjDbRead._push([{ exists: true }]);
        sjDbWrite._push([
          {
            organization_id: 7682,
            isLimitEnforced: false,
            remainingBudget: 1000
          }
        ]);
        // job templates with valid engine IDs
        jobDbRead._push([
          {
            id: 'jobTemplate123',
            taskTemplates: [
              { engineId: '0d745844-55f5-47e1-8c40-afdc02c502e7' }
            ]
          }
        ]);
        // get task template
        jobDbRead._push([
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
        // getEngine
        jobDbRead._push([
          {
            id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
            state: 'active'
          }
        ]);
        // getBuild
        jobDbWrite._push([]);
        await dal.createScheduledJob(context, {
          organizationId: 7682,
          input: {
            organizationId: 7682,
            jobTemplateIds: ['jobTemplate123']
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toContain('Some engine builds are not deployed.');
      }
    });

    it('should fail when isLimitEnforced is true and remainingBudget is 0', async function () {
      const context = mockUtil.makeContext();
      try {
        // getOrganization
        sjDbRead._push([{ exists: true }]);
        sjDbWrite._push([
          {
            organization_id: 7682,
            isLimitEnforced: true,
            remainingBudget: 0
          }
        ]);
        await dal.createScheduledJob(context, {
          organizationId: 7682,
          input: {
            organizationId: 7682,
            jobTemplateIds: ['jobTemplate123']
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toContain(
          'The organization has run out of budget. Job cannot be created.'
        );
      }
    });

    it('should create job when isLimitEnforced is false and remainingBudget is 0', async function () {
      const context = mockUtil.makeContext();
      // getOrganization
      sjDbRead._push([{ exists: true }]);
      sjDbWrite._push([
        {
          organization_id: 7682,
          isLimitEnforced: false,
          remainingBudget: 0
        }
      ]);
      mockCreateScheduledJob();
      const res = await dal.createScheduledJob(context, {
        organizationId: 7682,
        input: {
          applicationId: 'applicationId',
          organizationId: 7682,
          isPublic: false,
          jobTemplateIds: ['jobt123', 'jobt234'],
          details: {
            foo: 'bar'
          },
          weeklyScheduleParts: [
            {
              scheduledDay: 'Monday',
              startTime: '01:00',
              stopTime: '02:00'
            },
            {
              scheduledDay: 'Friday',
              startTime: '14:00',
              stopTime: '16:00'
            }
          ],
          contentTemplates: [
            {
              data: {
                foo: 'bar'
              },
              schemaId: '81ca224a-ae73-4f8d-9d5a-feea644d4956'
            }
          ],
          collaborators: [
            {
              organizationId: 7683,
              permission: 'editor'
            },
            {
              organizationId: '7681',
              permission: 'viewer'
            }
          ],
          jobTemplates: [
            {
              skipDecider: true,
              clusterId: 'clusterId',
              jobConfig: {
                createTDOInput: {
                  details: {
                    tags: ['foo', 'bar']
                  }
                }
              },
              taskTemplates: [
                {
                  engineId: 'engine1',
                  payload: {
                    foo: 'bar',
                    sourceId: 'sourceId'
                  }
                }
              ]
            }
          ],
          runMode: 'Now'
        }
      });
    });
  });
  describe('#cloneScheduledJob', function () {
    xit('should return clone scheduled job', async function () {
      const context = mockUtil.makeContext();

      const _getAppIdFromOrgId = jest.fn();
      _getAppIdFromOrgId.mockImplementation((organizationId) =>
        Promise.resolve('123')
      );
      _.set(serviceContext, 'db.getAppIdFromOrgId', _getAppIdFromOrgId);
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: 'c8d1200b-cea8-4e20-896f-c259eb841060' }
      ]);
      sjDbRead._push([]);
      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);

      // get getAffiliates
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job',
          primarySourceTypeId: 1
        }
      ]);

      mockMigrateLegacyV3JobsToTaskTemplates();
      mockMigrateLegacyProgramToScheduledJobParts();
      mockCreateScheduledJobForClone();

      const res = await dal.cloneScheduledJob(context, {
        input: {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682
        }
      });
      expect(res).toExist;
    });
    it('should fail if scheduledJob is public not allow', async function () {
      const context = mockUtil.makeContext();
      try {
        const res = await dal.cloneScheduledJob(context, {
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'An organizationId value was not provided in the input. ' +
            'The value is set automatically for normal authentication tokens. ' +
            'Clients using internal tokens that are not associated with an ' +
            'organization must set the value explicitly to the ID ' +
            'for the organization on whose behalf the template is created.'
        );
      }
    });
    it('should fail if v3Job ismigrated', async function () {
      const context = mockUtil.makeContext();

      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: 'c8d1200b-cea8-4e20-896f-c259eb841060' }
      ]);
      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: [],
            migrated: true
          }
        }
      ]);

      // get getAffiliates
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job',
          primarySourceTypeId: 1
        }
      ]);

      try {
        const res = await dal.cloneScheduledJob(context, {
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'Clone scheduled job only works on legacy programs currently.'
        );
      }
    });
  });
  describe('#updateScheduledJob', function () {
    it('should return update scheduled job', async function () {
      const context = mockUtil.makeContext();

      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);

      // get scheduled part
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      sjDbRead._push([
        {
          id: '12345',
          date_start: null,
          date_end: null,
          scheduled_day: null
        }
      ]);
      sjDbRead._push([
        {
          repeat_interval_unit: 1,
          repeat_interval: 1000
        }
      ]);

      // update the scheduled job itself
      sjDbWrite._push([
        {
          program_name: 'program_name',
          program_description: 'program_description'
        }
      ]);
      // get scheduled job updated
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);
      const res = await dal.updateScheduledJob(context, {
        input: {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682
        }
      });
      expect(res).toExist;
    });
    it('should return update scheduled job - affiliates', async function () {
      const context = mockUtil.makeContext();

      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);

      // get scheduled part
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      sjDbRead._push([
        {
          id: '12345',
          date_start: null,
          date_end: null,
          scheduled_day: null
        }
      ]);
      sjDbRead._push([
        {
          repeat_interval_unit: 1,
          repeat_interval: 1000
        }
      ]);

      // setAffiliates
      sjDbWrite._push([
        {
          id: 134,
          source_id: 134,
          scheduled_job_id: 134,
          scheduled_day: new Date(),
          media_source_id: 123,
          program_schedule_id: 123
        }
      ]);
      sjDbWrite._push([
        {
          id: 134,
          source_id: 134,
          scheduled_job_id: 134,
          scheduled_day: new Date(),
          media_source_id: 123,
          program_schedule_id: 123
        }
      ]);

      // update the scheduled job itself
      sjDbWrite._push([
        {
          program_name: 'program_name',
          program_description: 'program_description'
        }
      ]);
      // get scheduled job updated
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);
      const res = await dal.updateScheduledJob(context, {
        input: {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682,
          affiliates: [{}]
        }
      });
      expect(res).toExist;
    });

    it('should return update scheduled job - runMode now', async function () {
      const context = mockUtil.makeContext();

      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          organizationId: 7682,
          sourceTypeId: 1,
          v3Job: {
            tasks: []
          }
        }
      ]);
      // fetch cluster info
      jobDbRead._push(
        [
          {
            id: 'test-cluster-id',
            organization_id: '7682',
            name: 'test cluster'
          }
        ],
        true,
        ['is_public']
      );
      // Write job template
      jobDbWrite._push([{ id: 'jobTemplate123' }]);
      // get task template
      jobDbRead._push([
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
      // getEngine
      jobDbRead._push([
        {
          id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
          state: 'active'
        }
      ]);
      // getBuild
      jobDbWrite._push([
        { id: '0d745844-55f5-47e1-8c40-afdc02c502e7', status: 'deployed' }
      ]);
      // get scheduled part
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      sjDbRead._push([
        {
          id: '12345',
          date_start: null,
          date_end: null,
          scheduled_day: null
        }
      ]);
      sjDbRead._push([
        {
          repeat_interval_unit: 1,
          repeat_interval: 1000
        }
      ]);

      //migrateToNewScheduleJobModel
      mockMigrateLegacyProgramToScheduledJobParts();
      // mockMigrateLastProcessedDateToSource();

      // getAppIdFromOrgId
      const _getAppIdFromOrgId = jest.fn();
      _getAppIdFromOrgId.mockImplementation((organizationId) =>
        Promise.resolve('123')
      );
      _.set(serviceContext, 'db.getAppIdFromOrgId', _getAppIdFromOrgId);

      //migrateLegacyV3JobsToTaskTemplates
      mockMigrateLegacyV3JobsToTaskTemplates();

      // setJobPipelinesAndJobTemplates
      // delete then insert scheduled_job__job_template
      jobDbWrite._push([
        { scheduled_job_id: 123, job_pipeline_id: 123 },
        { scheduled_job_id: 123, job_pipeline_id: 321 }
      ]);
      jobDbRead._push([{ job_id: 123, cluster_id: 123 }]);
      sjDbWrite._push([{ job_id: 123, cluster_id: 123 }]);

      // findPrimarySource
      jobDbRead._push([{ task_id: 123, task_payload: { sourceId: 1 } }], false);

      // getProgramFormatId
      // sjDbRead._push([{ id: 1 }], false);
      // sjDbRead._push([{ id: 1 }], false);

      // update the scheduled job itself
      sjDbWrite._push([
        {
          program_name: 'program_name',
          program_description: 'program_description'
        }
      ]);
      sjDbWrite._push([{}]);
      sjDbWrite._push([
        {
          program_id: 134,
          acl: null,
          permission: 'owner'
        }
      ]);
      sjDbWrite._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      sjDbWrite._push([
        {
          id: 'sjt123',
          scheduled_job_id: '12345',
          sdo_id: '123sdo',
          schema_id: 'sc123'
        }
      ]);

      // updateCollaborators
      ssoDbRead._push([
        {
          group_id: 134
        },
        {
          group_id: 123
        }
      ]);
      ssoDbRead._push([
        {
          group_id: 134
        },
        {
          group_id: 123
        }
      ]);
      sjDbWrite._push([
        {
          program_id: 134,
          acl: null,
          permission: 'owner'
        }
      ]);

      // get scheduled job updated
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          organizationId: 7682,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          organizationId: 7682,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);

      //run mode 'Now' createAllScheduledJobs
      let _createAllScheduledJobs = jest.fn();
      _.set(
        serviceContext,
        'dal.jobPipeline.createAllScheduledJobs',
        _createAllScheduledJobs
      );
      _createAllScheduledJobs.mockImplementation(() => Promise.resolve({}));

      const res = await dal.updateScheduledJob(context, {
        input: {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          scheduledJobId: 1,
          organizationId: 7682,
          runMode: 'Now',
          migrateIfLegacy: true,
          // details: {
          //   programFormat: '%format%'
          // },
          collaborators: [
            {
              organizationId: 7682,
              permission: 'owner',
              groupId: 134
            }
          ],
          contentTemplates: [
            {
              data: {
                foo: 'bar'
              },
              schemaId: '81ca224a-ae73-4f8d-9d5a-feea644d4956'
            }
          ]
        }
      });
      expect(res).toExist;
    });
    it('should return update scheduled job - jobTemplates', async function () {
      const context = mockUtil.makeContext();

      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);

      // get task template
      jobDbRead._push([
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
      // getEngine
      jobDbRead._push([
        {
          id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
          state: 'active'
        }
      ]);
      // getBuild
      jobDbWrite._push([
        { id: '0d745844-55f5-47e1-8c40-afdc02c502e7', status: 'deployed' }
      ]);

      // get scheduled part
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      sjDbRead._push([
        {
          id: '12345',
          date_start: null,
          date_end: null,
          scheduled_day: null
        }
      ]);
      sjDbRead._push([
        {
          repeat_interval_unit: 1,
          repeat_interval: 1000
        }
      ]);

      // mock dal.jobTemplate createJobTemplate
      let _createJobTemplate = jest.fn();
      _.set(
        serviceContext,
        'dal.jobTemplate.createJobTemplate',
        _createJobTemplate
      );
      _createJobTemplate.mockImplementation(() =>
        Promise.resolve({
          id: 'aacc9b87-4e1b-4266-b37d-36a3de296f10',
          name: 'Awesome Engines',
          engineIds: [
            'aacc9b87-4e1b-4266-b37d-36a3de296f10',
            'daff9b87-4e1b-4266-b37d-36a3de296f20'
          ],
          engineAliasIds: [
            'aacc9b87-4e1b-4266-b37d-36a3de296f10',
            'daff9b87-4e1b-4266-b37d-36a3de296f20'
          ]
        })
      );
      // setJobPipelinesAndJobTemplates
      // delete then insert scheduled_job__job_template
      jobDbWrite._push([
        { scheduled_job_id: 123, job_pipeline_id: 123 },
        { scheduled_job_id: 123, job_pipeline_id: 321 }
      ]);
      jobDbRead._push([{ job_id: 123, cluster_id: 123 }]);
      jobDbRead._push([{ job_id: 123, cluster_id: 123 }]);
      sjDbWrite._push([{ job_id: 123, cluster_id: 123 }]);

      // findPrimarySource
      jobDbRead._push([{ task_id: 123, task_payload: { sourceId: 1 } }], false);

      //getPrimarySourceType
      sjDbRead._push([{ id: 2 }]);

      //getProgramFormatId
      sjDbRead._push([{ id: 1 }], false);
      // update the scheduled job itself
      sjDbWrite._push([
        {
          program_name: 'program_name',
          program_description: 'program_description'
        }
      ]);
      // get scheduled job updated
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);
      const res = await dal.updateScheduledJob(context, {
        input: {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682,
          jobTemplates: [{}]
        }
      });
      expect(res).toExist;
    });

    it('should return update scheduled job - DAG Templates', async function () {
      const context = mockUtil.makeContext();

      // Read dag template
      jobDbRead._push([
        {
          dagTemplateLanguage: 'Handlebars',
          dag: { template: '{"routes":[],"tasks":[]}' }
        }
      ]);

      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);

      // get task template
      jobDbRead._push([
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
      // getEngine
      jobDbRead._push([
        {
          id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
          state: 'active'
        }
      ]);
      // getBuild
      jobDbWrite._push([
        { id: '0d745844-55f5-47e1-8c40-afdc02c502e7', status: 'deployed' }
      ]);

      // get scheduled part
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      sjDbRead._push([
        {
          id: '12345',
          date_start: null,
          date_end: null,
          scheduled_day: null
        }
      ]);
      sjDbRead._push([
        {
          repeat_interval_unit: 1,
          repeat_interval: 1000
        }
      ]);

      // mock dal.jobTemplate createJobTemplate
      let _createJobTemplate = jest.fn();
      _.set(
        serviceContext,
        'dal.jobTemplate.createJobTemplate',
        _createJobTemplate
      );
      _createJobTemplate.mockImplementation(() =>
        Promise.resolve({
          id: 'aacc9b87-4e1b-4266-b37d-36a3de296f10',
          name: 'Awesome Engines',
          engineIds: [
            'aacc9b87-4e1b-4266-b37d-36a3de296f10',
            'daff9b87-4e1b-4266-b37d-36a3de296f20'
          ],
          engineAliasIds: [
            'aacc9b87-4e1b-4266-b37d-36a3de296f10',
            'daff9b87-4e1b-4266-b37d-36a3de296f20'
          ]
        })
      );
      // setJobPipelinesAndJobTemplates
      // delete then insert scheduled_job__job_template
      jobDbWrite._push([
        { scheduled_job_id: 123, job_pipeline_id: 123 },
        { scheduled_job_id: 123, job_pipeline_id: 321 }
      ]);
      jobDbRead._push([{ job_id: 123, cluster_id: 123 }]);
      jobDbRead._push([{ job_id: 123, cluster_id: 123 }]);
      sjDbWrite._push([{ job_id: 123, cluster_id: 123 }]);

      // findPrimarySource
      jobDbRead._push([{ task_id: 123, task_payload: { sourceId: 1 } }], false);

      //getPrimarySourceType
      sjDbRead._push([{ id: 2 }]);

      //getProgramFormatId
      sjDbRead._push([{ id: 1 }], false);
      // update the scheduled job itself
      sjDbWrite._push([
        {
          program_name: 'program_name',
          program_description: 'program_description'
        }
      ]);
      // get scheduled job updated
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);
      const res = await dal.updateScheduledJob(context, {
        input: {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682,
          dagTemplates: {
            dagTemplateIds: ['dagTemplate123'],
            params: {
              SOURCE_ID: 'source123'
            },
            jobConfig: {}
          }
        }
      });
      expect(res).toExist;
    });

    it('should fail if scheduledJob is public not allow', async function () {
      const context = mockUtil.makeContext();
      context._authInfo = {
        userInfo: {}
      };
      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          organizationId: 7682,
          primarySourceId: 123,
          isPublic: false,
          v3Job: {
            tasks: []
          }
        }
      ]);

      try {
        const res = await dal.updateScheduledJob(context, {
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682,
            isPublic: true
          }
        });
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toEqual(
          'Only Veritone administrators can create public scheduled jobs. ' +
            'Set isPublic to false or remove it from the input to continue.'
        );
      }
    });

    it('should return update scheduled job - update ingestionStatus', async function () {
      const context = mockUtil.makeContext();

      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);

      // get scheduled part
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      sjDbRead._push([
        {
          id: '12345',
          date_start: null,
          date_end: null,
          scheduled_day: null
        }
      ]);
      sjDbRead._push([
        {
          repeat_interval_unit: 1,
          repeat_interval: 1000
        }
      ]);

      // update the scheduled job itself
      sjDbWrite._push(
        [
          {
            program_name: 'program_name',
            program_description: 'program_description'
          }
        ],
        true,
        ['recording_status_id = $']
      );
      // get scheduled job updated
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);
      const res = await dal.updateScheduledJob(context, {
        input: {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682,
          ingestionStatus: 'RECORD_AND_TRANSCRIBE'
        }
      });
      expect(res).toExist;
    });

    it('should throw error if update invalid ingestionStatusId', async function () {
      const context = mockUtil.makeContext();

      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);

      // get scheduled part
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      sjDbRead._push([
        {
          id: '12345',
          date_start: null,
          date_end: null,
          scheduled_day: null
        }
      ]);
      sjDbRead._push([
        {
          repeat_interval_unit: 1,
          repeat_interval: 1000
        }
      ]);

      // update the scheduled job itself
      sjDbWrite._push([
        {
          program_name: 'program_name',
          program_description: 'program_description'
        }
      ]);
      // get scheduled job updated
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);
      let res, err;
      try {
        res = await dal.updateScheduledJob(context, {
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682,
            ingestionStatusId: 10
          }
        });
      } catch (error) {
        expect(error.message).toEqual('Invalid ingestionStatusId input.');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toExist;
      expect(err.name).toEqual('invalid_input');
    });

    it('should return update scheduled job - update ingestionStatusId', async function () {
      const context = mockUtil.makeContext();

      // get scheduled job
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);

      // get scheduled part
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      sjDbRead._push([
        {
          id: '12345',
          date_start: null,
          date_end: null,
          scheduled_day: null
        }
      ]);
      sjDbRead._push([
        {
          repeat_interval_unit: 1,
          repeat_interval: 1000
        }
      ]);

      // update the scheduled job itself
      sjDbWrite._push(
        [
          {
            program_name: 'program_name',
            program_description: 'program_description'
          }
        ],
        true,
        ['recording_status_id = $']
      );
      // get scheduled job updated
      sjDbRead._push([
        {
          id: 134,
          scheduled_job_id: 1,
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }
      ]);
      const res = await dal.updateScheduledJob(context, {
        input: {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682,
          ingestionStatusId: 3
        }
      });
      expect(res).toExist;
    });

    it('should fail if no engine IDs are found in templates', async function () {
      const context = mockUtil.makeContext();
      try {
        // get scheduled job
        sjDbRead._push([
          {
            id: 134,
            scheduled_job_id: 1,
            primarySourceTypeId: 1,
            primarySourceId: 123,
            v3Job: {
              tasks: []
            }
          }
        ]);

        // job templates with valid engine IDs
        jobDbRead._push([
          {
            id: 'jobTemplate123',
            taskTemplates: [
              { engineId: '0d745844-55f5-47e1-8c40-afdc02c502e7' }
            ]
          }
        ]);
        // get task template
        jobDbRead._push([]);

        await dal.updateScheduledJob(context, {
          organizationId: 7682,
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682,
            jobTemplateIds: ['jobTemplate123']
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toEqual(
          'No engine IDs were found in the provided templates.'
        );
      }
    });

    it('should fail if engine is disabled', async function () {
      const context = mockUtil.makeContext();
      try {
        // get scheduled job
        sjDbRead._push([
          {
            id: 134,
            scheduled_job_id: 1,
            primarySourceTypeId: 1,
            primarySourceId: 123,
            v3Job: {
              tasks: []
            }
          }
        ]);
        // get task template
        jobDbRead._push([
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
        // getEngine
        jobDbRead._push([
          {
            id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
            state: 'disabled'
          }
        ]);
        await dal.updateScheduledJob(context, {
          organizationId: 7682,
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682,
            jobTemplateIds: ['jobTemplate123']
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toContain('Some engines are not active');
      }
    });

    it('should fail if engine is not deployed', async function () {
      const context = mockUtil.makeContext();
      try {
        // get scheduled job
        sjDbRead._push([
          {
            id: 134,
            scheduled_job_id: 1,
            primarySourceTypeId: 1,
            primarySourceId: 123,
            v3Job: {
              tasks: []
            }
          }
        ]);
        // get task template
        jobDbRead._push([
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
        // getEngine
        jobDbRead._push([
          {
            id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
            state: 'active'
          }
        ]);
        // getBuild
        jobDbWrite._push([]);
        await dal.updateScheduledJob(context, {
          organizationId: 7682,
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682,
            jobTemplateIds: ['jobTemplate123']
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toContain('Some engine builds are not deployed.');
      }
    });
  });

  describe('#getMediaSourceDetails', function () {
    it('Media source has not changed', async function () {
      const context = mockUtil.makeContext();

      // get scheduled job
      const sj = {
        id: 134,
        scheduled_job_id: 1,
        programFormatId: 1,
        primarySourceTypeId: 2,
        primarySourceId: 123,
        v3Job: {
          tasks: []
        }
      };

      // // setJobPipelinesAndJobTemplates
      // sjDbRead._push([]);

      // // findPrimarySourceByJobTemplate
      // jobDbRead._push([]);

      const args = {
        input: {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682
        }
      };

      let {
        mediaSourceTypeId,
        primaryMediaSourceId,
        programFormatId
      } = await dal.getMediaSourceDetails(context, args, sj);

      expect(mediaSourceTypeId).toEqual(sj.mediaSourceTypeId);
      expect(primaryMediaSourceId).toEqual(sj.primarySourceId);
      expect(programFormatId).toEqual(sj.programFormatId);
    });

    it('Media source has changed', async function () {
      const context = mockUtil.makeContext();

      // get scheduled job
      const sj = {
        id: 134,
        scheduled_job_id: 1,
        programFormatId: 1,
        primarySourceTypeId: 2,
        primarySourceId: 123,
        v3Job: {
          tasks: []
        }
      };

      // setJobPipelinesAndJobTemplates
      jobDbWrite._push([]);
      jobDbRead._push([]);
      sjDbWrite._push([]);

      // findPrimarySourceByJobTemplate
      jobDbRead._push([
        {
          engineId: '74dfd76b-472a-48f0-8395-c7e01dd7f255',
          task_payload: {
            mode: 'ingest',
            sourceId: 4
          },
          ioFolders: [
            {
              referenceId: 'TVR_OUTPUT',
              mode: 'stream',
              type: 'output'
            }
          ]
        }
      ]);

      // getPrimarySourceType
      sjDbRead._push([5]);

      const args = {
        input: {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682,
          jobTemplateIds: ['test-job-template-xxx'],
          details: null // no need call DB to get program ID
        }
      };

      let {
        mediaSourceTypeId,
        primaryMediaSourceId,
        programFormatId
      } = await dal.getMediaSourceDetails(context, args, sj);

      expect(mediaSourceTypeId).not.toEqual(sj.mediaSourceTypeId);
      expect(primaryMediaSourceId).not.toEqual(sj.primarySourceId);
      expect(programFormatId).not.toEqual(sj.programFormatId);

      expect(primaryMediaSourceId).toEqual(4);
      expect(mediaSourceTypeId).toEqual(5);
      expect(programFormatId).toEqual(121); // from array programFormatDefaults
    });
  });

  describe('#deleteScheduledJob', function () {
    it('should return result', async function () {
      // get scheduled job
      sjDbRead._push([
        {
          scheduled_job_id: 'test scheduled job id'
        }
      ]);
      //setScheduleParts
      // get source to convert to station local time
      sjDbRead._push([
        {
          id: 134
        }
      ]);
      // delete and insert into program schedule
      sjDbWrite._push([
        {
          program_id: 134,
          program_schedule_id: 123,
          date_start: new Date(),
          date_end: new Date()
        }
      ]);
      // update  program schedule
      sjDbWrite._push([
        {
          program_id: 134,
          program_schedule_id: 123,
          date_start: new Date(),
          date_end: new Date()
        }
      ]);
      // insert into program_schedule_day
      sjDbWrite._push([
        {
          program_schedule_id: 134,
          start_time: new Date(),
          VALUES: new Date()
        }
      ]);

      // delete all schedules job
      sjDbWrite._push([{}]);
      const context = mockUtil.makeContext();
      const res = await dal.deleteScheduledJob(context, {
        id: '1ace46d4-9e27-4fea-9623-75231ff21195'
      });
      expect(res).toExist;
      expect(res.message).toEqual('ScheduledJob deleted');
    });
  });
  describe('#getJobTemplateIdsForScheduledJob', function () {
    it('should get job template ids for scheduled job', async function () {
      // push fake job templates by scheduledJobId
      const jobDbRows = jobDbResults.manyRows;
      jobDbRead._push([{ id: jobDbRows[0].id }]);
      jobDbRead._push(jobDbRows);
      const context = mockUtil.makeContext();
      const res = await dal.getJobTemplateIdsForScheduledJob(context, {
        id: '18125119_m1dODVWA5A',
        organizationId: 7682
      });
      expect(res).toExist;
    });
  });
  describe('#getDetails', function () {
    it('should get job template ids for scheduled job', async function () {
      // push fake job templates by scheduledJobId
      sjDbRead._push([
        {
          kvp: 1
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.getDetails(
        {
          kvp: 1,
          hoursPerWeek: 1,
          averageWeeklyAudience: 1,
          durationMinutes: 1
        },
        context
      );
      expect(res).toExist;
    });
  });
  describe('#createScheduledJobContentTemplate', function () {
    it('should create scheduled job content template', async function () {
      // get schedule job
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      // create scheduled job content template
      sjDbWrite._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.createScheduledJobContentTemplate(context, {
        organizationId: 7682,
        input: {
          scheduledJobId: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682,
          sdoId: 1
        }
      });
      expect(res).toExist;
    });
    it('should fail when input contain data and sdoId', async function () {
      // get schedule job
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      const context = mockUtil.makeContext();
      try {
        const res = await dal.createScheduledJobContentTemplate(context, {
          organizationId: 7682,
          input: {
            scheduledJobId: '1ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682,
            data: {},
            sdoId: 1
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'Only one of CreateSourceContentTemplate data or sdoId can be provided.'
        );
      }
    });
    it('should fail when input not contain data and sdoId', async function () {
      // get schedule job
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      const context = mockUtil.makeContext();
      try {
        const res = await dal.createScheduledJobContentTemplate(context, {
          organizationId: 7682,
          input: {
            scheduledJobId: '1ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'One of CreateScheduledJobContentTemplate data or sdoId must be provided.'
        );
      }
    });
    //TODO: miss case dalStructuredData.createStructuredData
  });
  describe('#deleteScheduledJobContentTemplate', function () {
    it('should delete scheduled job content template', async function () {
      // delete scheduled job content template
      sjDbWrite._push([
        {
          scheduled_job_id: 'test scheduled job id'
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.deleteScheduledJobContentTemplate(context, {
        organizationId: 7682,
        id: '1ace46d4-9e27-4fea-9623-75231ff21195'
      });
      expect(res).toExist;
    });
    it('should fail if empty response', async function () {
      // delete scheduled job content template
      sjDbWrite._push([]);
      const context = mockUtil.makeContext();
      try {
        const res = await dal.deleteScheduledJobContentTemplate(context, {
          organizationId: 7682,
          id: '1ace46d4-9e27-4fea-9623-75231ff21195'
        });
        expect(res).toExist;
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
  });
  describe('#getScheduledJobContentTemplates', function () {
    it('should get scheduled job content templates', async function () {
      sjDbRead._push([
        {
          scheduled_job_id: 'test scheduled job id'
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.getScheduledJobContentTemplates(context, {
        organizationId: 7682,
        id: '1ace46d4-9e27-4fea-9623-75231ff21195'
      });
      expect(res).toExist;
    });
  });
  describe('#getScheduledJobPermission', function () {
    it('should get owner', async function () {
      const context = mockUtil.makeContext({ authRole: 'regularUser' });
      const res = await dal.getScheduledJobPermission(context, null, {
        organizationId: 7682,
        id: '1ace46d4-9e27-4fea-9623-75231ff21195'
      });
      expect(res).toExist;
      expect(res).toEqual('owner');
    });
    it('should get permission', async function () {
      sjDbRead._push([
        {
          permission: 'test'
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.getScheduledJobPermission(context, null, {
        organizationId: 1234
      });
      expect(res).toExist;
      expect(res).toEqual('test');
    });
    it('should get owner with super admin permission', async function () {
      sjDbRead._push([]);
      const context = mockUtil.makeContext();
      const res = await dal.getScheduledJobPermission(context, null, {
        organizationId: 1234
      });
      expect(res).toExist;
      expect(res).toEqual('owner');
    });
    it('should get default viewer', async function () {
      sjDbRead._push([]);
      const context = mockUtil.makeContext({ authRole: 'regularUser' });
      const res = await dal.getScheduledJobPermission(context, null, {
        organizationId: 1234
      });
      expect(res).toExist;
      expect(res).toEqual('viewer');
    });
  });

  describe('#getAffiliates', function () {
    it('should get affiliates', async function () {
      sjDbRead._push([
        {
          id: 134,
          source_id: 134,
          scheduled_job_id: 134,
          scheduled_day: new Date()
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.getAffiliates(
        context,
        { offset: 1, limit: 10 },
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          primarySourceId: '1ace46d4-9e27-4fea-9623-75231ff21195'
        }
      );
      expect(res).toExist;
    });
  });
  describe('#setAffiliates', function () {
    it('should set affiliates', async function () {
      // insert program_schedule
      sjDbWrite._push([
        {
          id: 134,
          source_id: 134,
          scheduled_job_id: 134,
          scheduled_day: new Date(),
          media_source_id: 123,
          program_schedule_id: 123
        }
      ]);
      // insert program_schedule_day
      sjDbWrite._push([
        {
          id: 134,
          source_id: 134,
          scheduled_job_id: 134,
          scheduled_day: new Date(),
          media_source_id: 123,
          program_schedule_id: 123
        }
      ]);

      const context = mockUtil.makeContext();
      const res = await dal.setAffiliates(context, 134, {
        mediaSourceId: '1ace46d4-9e27-4fea-9623-75231ff21195',
        parts: [
          {
            startTime: new Date(),
            sourceId: 123,
            scheduledDay: 'Monday',
            startDateTime: new Date(),
            stopDateTime: new Date()
          }
        ]
      });
      expect(res).toExist;
    });
  });
  describe('#getCollaborators', function () {
    it('should get collaborators without primarySourceId', async function () {
      const context = mockUtil.makeContext();
      const res = await dal.getCollaborators(
        context,
        { offset: 1, limit: 10 },
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682
        }
      );
      expect(res).toExist;
    });
    it('should get collaborators with primarySourceId', async function () {
      sjDbRead._push([]);

      // get group ID
      ssoDbRead._push(
        [
          {
            group_id: '31ca224a-ae73-4f8d-9d5a-feea644d4956'
          }
        ],
        false
      );

      const res = await dal.getCollaborators(
        serviceContext,
        { offset: 1, limit: 10 },
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682,
          primarySourceId: 134
        }
      );
      expect(res).toExist;
    });
  });
  describe('#revertScheduledJob', function () {
    it('should get revert scheduled job', async function () {
      // get schedule job
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job',
          v3Job: {
            migrated: true,
            migration: {
              legacyIngestionStatusId: '1ace46d4-9e27-4fea-9623-75231ff21195'
            }
          }
        }
      ]);
      // now update the scheduled job itself
      sjDbWrite._push([
        {
          id: 134,
          name: 'test scheduled job',
          v3Job: {
            migrated: true
          }
        }
      ]);
      // re-retrieve a fresh copy to return
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job',
          v3Job: {
            reverted: true,
            migrated: false
          }
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.revertScheduledJob(context, {
        input: {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682
        }
      });
      expect(res).toExist;
    });
    it('should fail if missing input organizationId', async function () {
      const context = mockUtil.makeContext();
      try {
        const res = await dal.revertScheduledJob(context, {
          input: { id: '1ace46d4-9e27-4fea-9623-75231ff21195' }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should fail if scheduled job is already a legacy schedule job.', async function () {
      // get schedule job
      sjDbRead._push([
        {
          id: 134,
          name: 'test scheduled job'
        }
      ]);
      const context = mockUtil.makeContext();
      try {
        const res = await dal.revertScheduledJob(context, {
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'This scheduled job is already a legacy schedule job.'
        );
      }
    });
  });
  describe('#updateCollaborators', function () {
    it('should get update collaborators without clearExisting', async function () {
      // get dal organization get group id for org id
      ssoDbRead._push([
        {
          group_id: 134
        },
        {
          group_id: 123
        }
      ]);
      // delete and reinsert program__acl
      sjDbWrite._push([
        {
          program_id: 134,
          acl: null,
          permission: 'owner'
        }
      ]);
      const res = await dal.updateCollaborators(
        {
          id: 134,
          name: 'test scheduled job'
        },
        [
          {
            organizationId: 7682,
            permission: 'owner',
            groupId: 134
          }
        ],
        false
      );
      expect(res).toExist;
    });
    it('should get update collaborators if clearExisting', async function () {
      // get dal organization get group id for org id
      ssoDbRead._push([
        {
          group_id: 134
        },
        {
          group_id: 123
        }
      ]);
      ssoDbRead._push([
        {
          group_id: 134
        },
        {
          group_id: 123
        }
      ]);
      // delete and reinsert program__acl
      sjDbWrite._push([
        {
          program_id: 134,
          acl: null,
          permission: 'owner'
        }
      ]);
      const res = await dal.updateCollaborators(
        {
          id: 134,
          name: 'test scheduled job'
        },
        [
          {
            organizationId: 7682,
            permission: 'owner',
            groupId: 134
          }
        ],
        true
      );
      expect(res).toExist;
    });
    it('should return empty', async function () {
      const res = await dal.updateCollaborators(
        {
          id: 134,
          name: 'test scheduled job'
        },
        [],
        true
      );
      expect(res.length).toEqual(0);
    });
    it('should return empty', async function () {
      const res = await dal.updateCollaborators(
        {
          id: 134,
          name: 'test scheduled job'
        },
        null,
        false
      );
      expect(res.length).toEqual(0);
    });
    it('should fail if not found group id', async function () {
      // get dal organization get group id for org id
      ssoDbRead._push(
        [
          {
            group_id: null
          }
        ],
        false
      );

      // set organizationId = 123 to clear cache at dal.organization.groupToOrgCache
      try {
        const res = await dal.updateCollaborators(
          {
            id: 134,
            name: 'test scheduled job'
          },
          [
            {
              organizationId: 123,
              permission: 'owner',
              groupId: null
            }
          ],
          false
        );
        expect.fail('no throw');
      } catch (err) {
        expect(err.message).toContain('wrong group id result');
      }
    });
  });
  describe('#setJobPipelinesAndJobTemplates', function () {
    it('should set job pipelines and job templates', async function () {
      const context = mockUtil.makeContext();
      // delete then insert scheduled_job__job_template
      jobDbWrite._push([
        { scheduled_job_id: 123, job_pipeline_id: 123 },
        { scheduled_job_id: 123, job_pipeline_id: 321 }
      ]);

      // get task info
      jobDbRead._push([{ job_id: 123, cluster_id: 123 }]);

      sjDbWrite._push([{ job_id: 123, cluster_id: 123 }]);

      const res = await dal.setJobPipelinesAndJobTemplates(
        context,
        123, //scheduledJobId
        [123, 321], //jobPipelineIds
        [123, 321] //jobTemplateIds
      );
      expect(res).toExist;
    });
  });
  describe('#mapUnitsIn', function () {
    it('should return 1 if input is Seconds', function () {
      const res = dal.mapUnitsIn('Seconds');
      expect(res).toExist;
      expect(res).toEqual(1);
    });
    it('should fail if unknow unit', function () {
      try {
        const res = dal.mapUnitsIn('unknow');
        expect.fail('no throw');
      } catch (err) {
        expect(err).toExist;
        expect(err.message).toEqual(
          `unknown unit unknow from {"Seconds":1,"Minutes":2,"Hours":3,"Days":4,"Weeks":5,"Months":6}`
        );
      }
    });
  });
  describe('#migrateLegacyV3JobsToTaskTemplates', function () {
    it('should return task job templates', async function () {
      const context = mockUtil.makeContext();
      mockMigrateLegacyV3JobsToTaskTemplates();
      const res = await dal.migrateLegacyV3JobsToTaskTemplates(
        context,
        {
          id: 134,
          name: 'test scheduled job',
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }, //scheduledJob
        7682, //organizationId
        123 //applicationId
      );
      expect(res).toExist;
    });
    it('should return task job pipeline', async function () {
      const context = mockUtil.makeContext();
      // getEngines
      let _getEngines = jest.fn();
      _.set(serviceContext, 'dal.engine.getEngines', _getEngines);
      _getEngines.mockImplementation(() =>
        Promise.resolve({
          records: [
            {
              id: 'b3fa5950-c3b4-47eb-9808-10ed295d2696'
            }
          ],
          count: 1
        })
      );

      // mock dal.jobTemplate createJobTemplate
      let _createJobTemplate = jest.fn();
      _.set(
        serviceContext,
        'dal.jobTemplate.createJobTemplate',
        _createJobTemplate
      );
      _createJobTemplate.mockImplementation(() =>
        Promise.resolve({
          id: 'aacc9b87-4e1b-4266-b37d-36a3de296f10',
          name: 'Awesome Engines',
          jobPipelineId: 'aacc9b87-4e1b-4266-b37d-36a3de296f10',
          engineIds: [
            'aacc9b87-4e1b-4266-b37d-36a3de296f10',
            'daff9b87-4e1b-4266-b37d-36a3de296f20'
          ],
          engineAliasIds: [
            'aacc9b87-4e1b-4266-b37d-36a3de296f10',
            'daff9b87-4e1b-4266-b37d-36a3de296f20'
          ]
        })
      );
      // serviceContext.dal.cluster.getClusterList(context, args)
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          organization_id: 7682,
          name: 'Awesome Cluster',
          is_public: true
        }
      ]);

      const res = await dal.migrateLegacyV3JobsToTaskTemplates(
        context,
        {
          id: 134,
          name: 'test scheduled job',
          primarySourceTypeId: 1,
          primarySourceId: 123,
          v3Job: {
            tasks: [
              {
                engineId: 'engineId',
                payload: {}
              }
            ]
          }
        }, //scheduledJob
        7682, //organizationId
        123 //applicationId
      );
      expect(res).toExist;
    });
    it('should fail if invalid input', async function () {
      const context = mockUtil.makeContext();
      try {
        const res = await dal.migrateLegacyV3JobsToTaskTemplates(
          context,
          {
            id: 134,
            name: 'test scheduled job',
            primarySourceId: 123,
            v3Job: {
              tasks: [{ engineId: '123', taskPayload: {} }]
            }
          }, //scheduledJob
          7682, //organizationId
          123 //applicationId
        );
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'Clone scheduled job needs to have a primary source type id.'
        );
      }
    });
  });
  describe('#migrateLastProcessedDateToSource', function () {
    it('should update source if source type is podcast', async function () {
      const context = mockUtil.makeContext();
      mockMigrateLastProcessedDateToSource();
      let err;
      try {
        await dal.migrateLastProcessedDateToSource(
          context,
          {
            id: 134,
            name: 'test scheduled job',
            primarySourceTypeId: 4,
            primarySourceId: 123,
            v3Job: {
              tasks: []
            }
          }, //scheduledJob
          7682, //organizationId
          123 //applicationId
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined;
    });
    it('should update source if source type is youtube', async function () {
      const context = mockUtil.makeContext();
      mockMigrateLastProcessedDateToSource();
      let err;
      try {
        await dal.migrateLastProcessedDateToSource(
          context,
          {
            id: 134,
            name: 'test scheduled job',
            primarySourceTypeId: 3,
            primarySourceId: 123,
            v3Job: {
              tasks: []
            }
          }, //scheduledJob
          7682, //organizationId
          123 //applicationId
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined;
    });
    it('should return if source already has lastProcessedDateTime', async function () {
      const context = mockUtil.makeContext();
      //dalSource get source
      sjDbRead._push([
        {
          id: 134,
          organizationId: 7682,
          state: {
            lastProcessedDateTime: new Date()
          }
        }
      ]);
      let err;
      try {
        await dal.migrateLastProcessedDateToSource(
          context,
          {
            id: 134,
            name: 'test scheduled job',
            primarySourceTypeId: 4,
            primarySourceId: 123,
            v3Job: {
              tasks: []
            }
          }, //scheduledJob
          7682, //organizationId
          123 //applicationId
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined;
    });
    it('should fail if source has no ingested TDOs', async function () {
      const context = mockUtil.makeContext();
      //dalSource get source
      sjDbRead._push([
        {
          id: 134,
          organizationId: 7682
        }
      ]);
      // get all TDOS for source
      jobDbRead._push([]);
      try {
        await dal.migrateLastProcessedDateToSource(
          context,
          {
            id: 134,
            name: 'test scheduled job',
            primarySourceTypeId: 4,
            primarySourceId: 123,
            v3Job: {
              tasks: []
            }
          }, //scheduledJob
          7682, //organizationId
          123 //applicationId
        );
        expect.fail('no throw');
      } catch (err) {
        expect(err).toExist;
      }
    });
  });
  describe('#migrateLegacyProgramToScheduledJobParts', function () {
    it('should return result type is podcast', async function () {
      const context = mockUtil.makeContext();
      mockMigrateLegacyProgramToScheduledJobParts();
      const res = await dal.migrateLegacyProgramToScheduledJobParts(
        context,
        {
          id: 134,
          name: 'test scheduled job',
          primarySourceTypeId: 4,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }, //scheduledJob
        7682, //organizationId
        123 //applicationId
      );
      expect(res).toExist;
    });
    it('should return result if source type is youtube', async function () {
      const context = mockUtil.makeContext();
      mockMigrateLegacyProgramToScheduledJobParts();
      const res = await dal.migrateLegacyProgramToScheduledJobParts(
        context,
        {
          id: 134,
          name: 'test scheduled job',
          primarySourceTypeId: 3,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }, //scheduledJob
        7682, //organizationId
        123 //applicationId
      );
      expect(res).toExist;
    });
    it('should return result if source type is radio', async function () {
      const context = mockUtil.makeContext();
      mockMigrateLegacyProgramToScheduledJobParts();
      const res = await dal.migrateLegacyProgramToScheduledJobParts(
        context,
        {
          id: 134,
          name: 'test scheduled job',
          primarySourceTypeId: 4,
          primarySourceId: 123,
          v3Job: {
            tasks: []
          }
        }, //scheduledJob
        7682, //organizationId
        123 //applicationId
      );
      expect(res).toExist;
    });
  });
  describe('#findPrimarySourceByJobTemplate', function () {
    it('should return result', async function () {
      const context = mockUtil.makeContext();
      jobDbRead._push([{ task_id: 123, task_payload: { sourceId: 1 } }]);
      const res = await dal.findPrimarySourceByJobTemplate(context, [
        'b3fa5950-c3b4-47eb-9808-10ed295d2696'
      ]);

      expect(res).toExist;
    });
  });
  describe('#findPrimarySourceByJobPipeline', function () {
    it('should return result', async function () {
      const context = mockUtil.makeContext();
      jobDbRead._push([{ task_id: 123, task_payload: { sourceId: 1 } }]);
      const res = await dal.findPrimarySourceByJobPipeline(context, [
        'b3fa5950-c3b4-47eb-9808-10ed295d2696'
      ]);

      expect(res).toExist;
    });
  });
  describe('#findPrimarySource', function () {
    it('should return findPrimarySourceByJobPipeline', async function () {
      const context = mockUtil.makeContext();
      jobDbRead._push([{ task_id: 123, task_payload: { sourceId: 1 } }]);
      const res = await dal.findPrimarySource(
        context,
        ['b3fa5950-c3b4-47eb-9808-10ed295d2696'],
        []
      );

      expect(res).toExist;
    });
    it('should return findPrimarySourceByJobPipeline', async function () {
      const context = mockUtil.makeContext();
      jobDbRead._push([{ task_id: 123, task_payload: { sourceId: 1 } }]);
      const res = await dal.findPrimarySource(
        context,
        [],
        ['b3fa5950-c3b4-47eb-9808-10ed295d2696']
      );

      expect(res).toExist;
    });
  });
  describe('#getProgramFormatId', function () {
    it('should return result', async function () {
      sjDbRead._push([{ id: 1 }], false);
      const res = await dal.getProgramFormatId({ programFormat: '1' }, 1);
      expect(res).toExist;
    });
    it('should fail if empty result', async function () {
      sjDbRead._push([], false);
      try {
        const res = await dal.getProgramFormatId({ programFormat: '1' }, 1);
        expect.fail('no throw');
      } catch (err) {
        expect(err.message).toEqual(
          '1 is not a valid program format for source type category 1'
        );
      }
    });
  });
  describe('#createContentTemplateSql', function () {
    it('should return result', async function () {
      const context = mockUtil.makeContext();
      const res = await dal.createContentTemplateSql(
        context,
        { sdoId: '1' },
        []
      );
      expect(res).toExist;
    });
    it('should fail if input includes both data sdoId ', async function () {
      try {
        const context = mockUtil.makeContext();
        const res = await dal.createContentTemplateSql(
          context,
          {
            sdoId: '1',
            data: {}
          },
          []
        );
        expect.fail('no throw');
      } catch (err) {
        expect(err.message).toEqual(
          'Only one of CreateSourceContentTemplate data or sdoId can be provided.'
        );
      }
    });
    it('should fail if input not includes both data sdoId ', async function () {
      try {
        const context = mockUtil.makeContext();
        const res = await dal.createContentTemplateSql(context, {}, []);
        expect.fail('no throw');
      } catch (err) {
        expect(err.message).toEqual(
          'One of CreateScheduledJobContentTemplate data or sdoId must be provided.'
        );
      }
    });
  });
  describe('#getAllTDOsForSource', function () {
    it('should return all tdos', async function () {
      var allTdos = [];
      for (let i = 0; i < 1000; i++) {
        allTdos.push({ id: i });
      }
      jobDbRead._push(allTdos);
      jobDbRead._push([{ id: 1001 }]);
      const res = await dal.getAllTDOsForSource('sourceId');
      expect(res).toExist;
      expect(res.length).toEqual(1001);
    });
  });
  describe('#mapSchedulePart', function () {
    it('should return map schedule part', function () {
      const res = dal.mapSchedulePart({
        scheduledDay: 'Monday',
        scheduleType: 'Weekly'
      });
      expect(res).toExist;
      expect(res.scheduleType).toEqual('Weekly');
      expect(res.scheduledDayAsInt).toEqual('Monday');
      expect(res.repeatIntervalUnit).toEqual('Weeks');
      expect(res.repeatInterval).toEqual(1);
    });
    it('should return map schedule part', function () {
      const res = dal.mapSchedulePart({
        scheduledDay: 'Monday',
        scheduleType: 'Weekly',
        repeatIntervalUnit: '1'
      });
      expect(res.scheduleType).toEqual('Weekly');
      expect(res.repeatIntervalUnit).toEqual('Seconds');
    });
  });
});

async function testGetScheduledJobs(context, args) {
  serviceContext.dbConnections['media_platform'].read._push([
    {
      id: 134,
      name: 'test scheduled job'
    }
  ]);
  const res = await dal.getScheduledJobs(context, args || {});
  expect(res).toExist;
  return res;
}

function mockCreateScheduledJobForClone() {
  // get job templates
  jobDbRead._push([
    {
      id: 'jobt123'
    },
    {
      id: 'jobt234'
    }
  ]);
  // get primary source from tasks
  jobDbRead._push([
    {
      task_id: 'jobt123_1',
      task_payload: {
        sourceId: '123'
      }
    },
    {
      task_id: 'jobt234_1'
    },
    {
      task_id: 'jobt234_2',
      task_payload: {
        sourceId: '2345'
      }
    }
  ]);
  // get group ID
  ssoDbRead._push(
    [
      {
        group_id: '31ca224a-ae73-4f8d-9d5a-feea644d4956'
      }
    ],
    false
  );
  // get the source
  sjDbRead._push([
    {
      id: '123',
      source_type_id: '1',
      name: 'test source'
    }
  ]);
  // get source type category
  sjDbRead._push([
    {
      id: '1'
    }
  ]);
  // insert to program table
  sjDbWrite._push([
    {
      id: '12345',
      name: 'test scheduled job',
      description: 'test scheduled job',
      is_active: true,
      run_mode: 1,
      details: {
        foo: 'bar'
      },
      details_schema_id: null,
      program_format: 1,
      ingestion_status_id: 1
    }
  ]);
  // insert to program__acl
  sjDbWrite._push([]);
  // get the source again
  sjDbRead._push([
    {
      id: '123',
      source_type_id: '1',
      name: 'test source',
      permission: 'owner'
    }
  ]);
  // insert to program_schedule
  sjDbWrite._push([
    {
      program_id: '12345',
      date_start: null,
      date_end: null,
      schedule_status_id: 1,
      media_source_id: '123'
    },
    {
      program_id: '12345',
      date_start: null,
      date_end: null,
      schedule_status_id: 1,
      media_source_id: '123'
    }
  ]);
  // update program table with program schedule ID
  sjDbWrite._push([]);

  // set affiliates
  sjDbWrite._push([
    {
      id: 134,
      source_id: 134,
      scheduled_job_id: 134,
      scheduled_day: new Date(),
      media_source_id: 123,
      program_schedule_id: 123
    }
  ]);

  // get talent ID
  sjDbRead._push(
    [
      {
        talent_id: 45
      }
    ],
    false
  );
  // insert to talent_program
  sjDbWrite._push([]);
  // insert to scheduled_job__job_template
  jobDbWrite._push([
    {
      scheduled_job_id: '12345',
      job_template_id: 'jobt123'
    },
    {
      scheduled_job_id: '12345',
      job_template_id: 'jobt234'
    }
  ]);
  // get engine info for task_data cache
  jobDbRead._push([
    {
      job_id: 'jobt123',
      task_id: 'jobt123_1',
      engine_id: 'engine1',
      engine_name: 'engine 1',
      engine_category_id: 'enginecat1',
      engine_type_name: 'Ingestion',
      engine_type_id: 1
    },
    {
      job_id: 'jobt234',
      task_id: 'jobt234_1',
      engine_id: 'engine2',
      engine_name: 'engine 2',
      engine_category_id: 'enginecat2',
      engine_type_name: 'Cognitive',
      engine_type_id: 2
    },
    {
      job_id: 'jobt234',
      task_id: 'jobt234_2',
      engine_id: 'engine3',
      engine_name: 'engine 3',
      engine_category_id: 'enginecat3',
      engine_type_name: 'Cognitive',
      engine_type_id: '2'
    }
  ]);
  // update task_data cache colummn
  sjDbRead._push([]);
  // associate content template
  sjDbWrite._push([
    {
      id: 'sjt123',
      scheduled_job_id: '12345',
      sdo_id: '123sdo',
      schema_id: 'sc123'
    }
  ]);
  // get group ID for collaborator
  ssoDbRead._push(
    [
      {
        group_id: '41ca224a-ae73-4f8d-9d5a-feea644d4956'
      }
    ],
    false
  );
  // get group ID for collaborator
  ssoDbRead._push(
    [
      {
        group_id: '51ca224a-ae73-4f8d-9d5a-feea644d4956'
      }
    ],
    false
  );
  // insert to program__acl
  sjDbWrite._push([
    {
      acl: '41ca224a-ae73-4f8d-9d5a-feea644d4956',
      permission: 'editor',
      program_id: 12345
    },
    {
      program_id: '12345',
      permission: 'viewer',
      acl: '51ca224a-ae73-4f8d-9d5a-feea644d4956'
    }
  ]);
  // refresh scheduled job
  sjDbRead._push([
    {
      id: '12345',
      name: 'new scheduled job',
      organization_id: 7682
    }
  ]);
}
function mockCreateScheduledJob() {
  // get job templates
  jobDbRead._push([
    {
      id: 'jobt123'
    },
    {
      id: 'jobt234'
    }
  ]);

  // fetch cluster info
  jobDbRead._push(
    [
      {
        id: 'test-cluster-id',
        organization_id: '7682',
        name: 'test cluster'
      }
    ],
    true,
    ['is_public']
  );

  // Write job template
  jobDbWrite._push([{ id: 'jobTemplate123' }]);

  // get task template
  jobDbRead._push([
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

  // getEngine
  jobDbRead._push([
    {
      id: '0d745844-55f5-47e1-8c40-afdc02c502e7',
      state: 'active'
    }
  ]);
  // getBuild
  jobDbWrite._push([
    { id: '0d745844-55f5-47e1-8c40-afdc02c502e7', status: 'deployed' }
  ]);

  // get primary source from tasks
  jobDbRead._push([
    {
      task_id: 'jobt123_1',
      task_payload: {
        sourceId: '123'
      }
    },
    {
      task_id: 'jobt234_1'
    },
    {
      task_id: 'jobt234_2',
      task_payload: {
        sourceId: '2345'
      }
    }
  ]);

  // get group ID
  ssoDbRead._push(
    [
      {
        group_id: '31ca224a-ae73-4f8d-9d5a-feea644d4956'
      }
    ],
    false
  );
  // get the source
  sjDbRead._push([
    {
      id: '123',
      source_type_id: '1',
      name: 'test source'
    }
  ]);
  // get source type category
  sjDbRead._push([
    {
      id: '1'
    }
  ]);
  // insert to program table
  sjDbWrite._push([
    {
      id: '12345',
      name: 'test scheduled job',
      description: 'test scheduled job',
      is_active: true,
      run_mode: 1,
      details: {
        foo: 'bar'
      },
      details_schema_id: null,
      program_format: 1,
      ingestion_status_id: 1
    }
  ]);
  // insert to program__acl
  sjDbWrite._push([]);
  // get the source again
  sjDbRead._push([
    {
      id: '123',
      source_type_id: '1',
      name: 'test source',
      permission: 'owner'
    }
  ]);
  // insert to program_schedule
  sjDbWrite._push([
    {
      program_id: '12345',
      date_start: null,
      date_end: null,
      schedule_status_id: 1,
      media_source_id: '123'
    },
    {
      program_id: '12345',
      date_start: null,
      date_end: null,
      schedule_status_id: 1,
      media_source_id: '123'
    }
  ]);
  // update program table with program schedule ID
  sjDbWrite._push([]);
  // get talent ID
  sjDbRead._push(
    [
      {
        talent_id: 45
      }
    ],
    false
  );
  // insert to talent_program
  sjDbWrite._push([]);
  // insert to scheduled_job__job_template
  jobDbWrite._push([
    {
      scheduled_job_id: '12345',
      job_template_id: 'jobt123'
    },
    {
      scheduled_job_id: '12345',
      job_template_id: 'jobt234'
    }
  ]);
  // get engine info for task_data cache
  jobDbRead._push([
    {
      job_id: 'jobt123',
      task_id: 'jobt123_1',
      engine_id: 'engine1',
      engine_name: 'engine 1',
      engine_category_id: 'enginecat1',
      engine_type_name: 'Ingestion',
      engine_type_id: 1
    },
    {
      job_id: 'jobt234',
      task_id: 'jobt234_1',
      engine_id: 'engine2',
      engine_name: 'engine 2',
      engine_category_id: 'enginecat2',
      engine_type_name: 'Cognitive',
      engine_type_id: 2
    },
    {
      job_id: 'jobt234',
      task_id: 'jobt234_2',
      engine_id: 'engine3',
      engine_name: 'engine 3',
      engine_category_id: 'enginecat3',
      engine_type_name: 'Cognitive',
      engine_type_id: '2'
    }
  ]);
  // update task_data cache colummn
  sjDbRead._push([]);
  // associate content template
  sjDbWrite._push([
    {
      id: 'sjt123',
      scheduled_job_id: '12345',
      sdo_id: '123sdo',
      schema_id: 'sc123'
    }
  ]);
  // get group ID for collaborator
  ssoDbRead._push(
    [
      {
        group_id: '41ca224a-ae73-4f8d-9d5a-feea644d4956'
      }
    ],
    false
  );
  // get group ID for collaborator
  ssoDbRead._push(
    [
      {
        group_id: '51ca224a-ae73-4f8d-9d5a-feea644d4956'
      }
    ],
    false
  );
  // insert to program__acl
  sjDbWrite._push([
    {
      acl: '41ca224a-ae73-4f8d-9d5a-feea644d4956',
      permission: 'editor',
      program_id: 12345
    },
    {
      program_id: '12345',
      permission: 'viewer',
      acl: '51ca224a-ae73-4f8d-9d5a-feea644d4956'
    }
  ]);
  //run mode 'Now' createAllScheduledJobs
  let _createAllScheduledJobs = jest.fn();
  _.set(
    serviceContext,
    'dal.jobPipeline.createAllScheduledJobs',
    _createAllScheduledJobs
  );
  _createAllScheduledJobs.mockImplementation(() => Promise.resolve({}));
  // refresh scheduled job
  sjDbRead._push([
    {
      id: '12345',
      name: 'new scheduled job',
      organization_id: 7682
    }
  ]);
}

function mockMigrateLegacyV3JobsToTaskTemplates() {
  // getEngines
  jobDbRead._push([
    {
      id: '0d745844-55f5-47e1-8c40-afdc02c502e7'
    }
  ]);
  // mock dal.jobTemplate createJobTemplate
  let _createJobTemplate = jest.fn();
  _.set(
    serviceContext,
    'dal.jobTemplate.createJobTemplate',
    _createJobTemplate
  );
  _createJobTemplate.mockImplementation(() =>
    Promise.resolve({
      id: 'aacc9b87-4e1b-4266-b37d-36a3de296f10',
      name: 'Awesome Engines',
      engineIds: [
        'aacc9b87-4e1b-4266-b37d-36a3de296f10',
        'daff9b87-4e1b-4266-b37d-36a3de296f20'
      ],
      engineAliasIds: [
        'aacc9b87-4e1b-4266-b37d-36a3de296f10',
        'daff9b87-4e1b-4266-b37d-36a3de296f20'
      ]
    })
  );

  // serviceContext.dal.cluster.getClusterList(context, args)
  serviceContext.dbConnections['core'].read._push([
    {
      id: '123',
      organization_id: 7682,
      name: 'Awesome Cluster',
      is_public: true
    }
  ]);
}
function mockMigrateLastProcessedDateToSource() {
  //dalSource get source
  sjDbRead._push([
    {
      id: 134,
      organizationId: 7682
    }
  ]);
  // get all TDOS for source
  jobDbRead._push([
    {
      json: { startDateTime: new Date() }
    }
  ]);

  // dalSource update source
  sjDbWrite._push([
    {
      id: 134,
      name: 'test'
    }
  ]);
  sjDbWrite._push([
    {
      id: 134,
      name: 'test'
    }
  ]);
  sjDbRead._push([
    {
      id: 134,
      name: 'test'
    }
  ]);
  sjDbRead._push([
    {
      id: 134,
      name: 'test'
    }
  ]);
  sjDbWrite._push([
    {
      id: 134,
      name: 'test'
    }
  ]);
  sjDbWrite._push([
    {
      id: 134,
      collabrator: 'test'
    }
  ]);
  sjDbWrite._push([
    {
      id: 134,
      collabrator: 'test'
    }
  ]);
}
function mockMigrateLegacyProgramToScheduledJobParts() {
  // get scheduled job
  sjDbRead._push([
    {
      id: 134,
      name: 'test scheduled job'
    }
  ]);
  // get from program schedule
  sjDbRead._push([
    {
      id: '12345',
      date_start: null,
      date_end: null,
      scheduled_day: null
    }
  ]);
  // get from recurring schedule
  sjDbRead._push([
    {
      repeat_interval_unit: 1,
      repeat_interval: 1000
    }
  ]);
}
