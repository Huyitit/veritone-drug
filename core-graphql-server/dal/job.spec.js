const _ = require('lodash');
const moment = require('moment');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
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

serviceContext.bll.dagTemplate = {
  getDagTemplate: jest.fn()
};
let dal;
const engineId = '0ac1fb8d-cca1-4e78-b01d-0c26d9d4adbe';
const appId = '21dcf930-b76f-4691-8747-916ed7cd6a5e';

const coreDbRead = serviceContext.dbConnections['core'].read;

function makeContext(options) {
  return mockUtil.makeContext(options);
}

describe('job.js', function () {
  beforeAll(() => {
    dal = require('./job.js')(serviceContext);
  });

  describe('#require', function () {
    it('should load module', async function () {
      const test = dal;
      expect(typeof test).toEqual('object');
      expect(Object.keys(test).length).toEqual(16);
      expect(typeof test.createJob).toEqual('function');
      expect(typeof test.getJob).toEqual('function');
      expect(typeof test._getJobsQuery).toEqual('function');
      expect(typeof test.getJobs).toEqual('function');
      expect(typeof test.newCreateJob).toEqual('function');
      expect(typeof test.checkProcessingLimitsForOrg).toEqual('function');
      expect(typeof test.parseStandbyTasksForTask).toEqual('function');
      expect(typeof test.populateTaskWithEngineBuildInfo).toEqual('function');
      expect(typeof test.createJobDb).toEqual('function');
      expect(typeof test.generateJobTablePartition).toEqual('function');
      expect(typeof test.updateJobStatus).toEqual('function');
      expect(typeof test.getCompletedJobsForRecording).toEqual('function');
      expect(typeof test.generateTaskId).toEqual('function');
      expect(typeof test.createJobAudit).toEqual('function');
      expect(typeof test.getJobAudit).toEqual('function');
    });
  });

  describe('#_getJobsQuery()', function () {
    it('should not include joining condition with dag_template if dagTemplateIds does not exist', async function () {
      const { sql, args } = await dal._getJobsQuery(makeContext(), {
        // engineIds: [
        //   '00000000-0000-0000-0000-000000000001',
        //   '00000000-0000-0000-0000-000000000002'
        // ],
        orderBy: [
          {
            field: 'modifiedDateTime',
            direction: 'asc'
          }
        ],
        offset: 10,
        limit: 100
      });

      expect(args).toBeDefined();
      expect(sql).toBeDefined();
      expect(sql).not.toContain(`t.engine_id IN `);
      expect(sql).not.toContain(`GROUP BY j.job_id`);
      expect(sql).not.toContain(`GROUP BY j.job_id, d.dag_template_id`);
      expect(sql).not.toContain(
        `JOIN job_new.job_dag_template d ON d.job_id = j.job_id`
      );
    });
    it('should include joining condition with dag_template if dagTemplateIds does not exist', async function () {
      const { sql, args } = await dal._getJobsQuery(makeContext(), {
        dagTemplateIds: ['dag_template_test'],
        orderBy: [
          {
            field: 'modifiedDateTime',
            direction: 'asc'
          }
        ],
        offset: 10,
        limit: 100
      });

      expect(args).toBeDefined();
      expect(sql).toBeDefined();
      expect(sql).not.toContain(`t.engine_id IN `);
      expect(sql).not.toContain(`GROUP BY j.job_id, d.dag_template_id`);
      expect(sql).toContain(
        `JOIN job_new.job_dag_template d ON d.job_id = j.job_id`
      );
    });
    it('should include joining condition with dag_template, engine table', async function () {
      coreDbRead._push([
        {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'test engine 1'
        }
      ]);
      coreDbRead._push([
        {
          id: 'engine_2_alias',
          alias_id: '00000000-0000-0000-0000-000000000002',
          name: 'test engine 2'
        }
      ]);
      const { sql, args } = await dal._getJobsQuery(makeContext(), {
        engineIds: [
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002'
        ],
        dagTemplateIds: ['dag_template_test'],
        orderBy: [
          {
            field: 'modifiedDateTime',
            direction: 'asc'
          }
        ],
        offset: 10,
        limit: 100
      });

      expect(args).toBeDefined();
      expect(sql).toBeDefined();
      expect(sql).toContain(`t.engine_id IN `);
      expect(sql).toContain(`GROUP BY j.job_id, d.dag_template_id`);
      expect(sql).toContain(
        `JOIN job_new.job_dag_template d ON d.job_id = j.job_id`
      );
    });
  });

  describe('#getJobs()', function () {
    it('should get jobs', async function () {
      const targetId = '12330001';
      const clusterId = 'rt-deadbeef';
      const jobId = '10001';
      const jobStatus = 'queued';

      coreDbRead._push(
        [
          {
            id: 'j1435'
          },
          {
            id: 'j1234'
          }
        ],
        true,
        [
          `recording_id = '${targetId}'`,
          `cluster_id = '${clusterId}'`,
          `scheduled_job_id in ('${jobId}')`,
          `job_status = '${jobStatus}'`,
          'created_date_time >=',
          'created_date_time <='
        ],
        (sql, args) => {
          // verify that sql params had the correct values
          if (args.length !== 4) return false;
          return true;
        }
      );

      mockGetDagTemplates();
      const res = await dal.getJobs(makeContext(), {
        dateTimeFilter: [
          {
            fromDateTime: '2018-06-11T15:52:39.000Z',
            field: 'createdDateTime'
          },
          {
            toDateTime: '2018-06-19T15:52:39.000Z',
            field: 'createdDateTime'
          }
        ],
        targetId: targetId,
        clusterId: clusterId,
        scheduledJobId: jobId,
        status: jobStatus,
        hasScheduledJobId: true,
        orderBy: [
          {
            field: 'modifiedDateTime',
            direction: 'asc'
          }
        ],
        offset: 10,
        limit: 100
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
    });

    it('get jobs with TDO time filter', async function () {
      const targetId = '12330001';
      const clusterId = 'rt-deadbeef';
      const jobId = '10001';
      const jobStatus = 'queued';

      const tdoCreationTime = '2020-07-21T21:38:57.917Z';
      const oneDayInSec = 24 * 60 * 60;
      const jobCreationFilterTime =
        Math.floor(new Date(tdoCreationTime).getTime() / 1000) - oneDayInSec;

      coreDbRead._push([
        {
          id: targetId,
          application_id: appId,
          is_public: false,
          createdDateTime: tdoCreationTime
        }
      ]);

      coreDbRead._push(
        [
          {
            id: 'j1435'
          },
          {
            id: 'j1234'
          }
        ],
        true,
        [
          `application_id in ('${appId}')`,
          `recording_id = '${targetId}'`,
          `cluster_id = '${clusterId}'`,
          `scheduled_job_id in ('${jobId}')`,
          `job_status = '${jobStatus}'`,
          `created_date_time >= ${jobCreationFilterTime}`
        ],
        (sql, args) => {
          // verify that sql params had the correct values
          if (args.length !== 5) return false;
          return true;
        }
      );

      mockGetDagTemplates();
      const res = await dal.getJobs(makeContext(), {
        dateTimeFilter: [],
        applicationId: appId,
        targetId: targetId,
        clusterId: clusterId,
        scheduledJobId: jobId,
        status: jobStatus,
        hasScheduledJobId: true,
        orderBy: [
          {
            field: 'modifiedDateTime',
            direction: 'asc'
          }
        ],
        offset: 10,
        limit: 100
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
    });

    it('should get jobs by engine ID', async function () {
      coreDbRead._push([
        {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'test engine 1'
        }
      ]);
      coreDbRead._push([
        {
          id: 'engine_2_alias',
          alias_id: '00000000-0000-0000-0000-000000000002',
          name: 'test engine 2'
        }
      ]);
      // main job query
      coreDbRead._push(
        [
          {
            id: 'j1435'
          },
          {
            id: 'j1234'
          }
        ],
        true,
        ['created_date_time >=', 'created_date_time <=', 'engine_id'],
        (sql, args) => {
          // verify that sql params had the correct values
          if (!args.includes('00000000-0000-0000-0000-000000000001'))
            return false;
          if (!args.includes('00000000-0000-0000-0000-000000000002'))
            return false;
          if (!args.includes('engine_2_alias')) return false;
          if (args.length !== 3) return false;
          return true;
        }
      );
      mockGetDagTemplates();
      const res = await dal.getJobs(makeContext(), {
        engineIds: [
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002'
        ],
        dateTimeFilter: [
          {
            fromDateTime: '2018-06-11T15:52:39.000Z',
            field: 'createdDateTime'
          },
          {
            toDateTime: '2018-06-19T15:52:39.000Z',
            field: 'createdDateTime'
          }
        ]
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
    });

    it('should get jobs by engine category ID', async function () {
      // main job query
      coreDbRead._push(
        [
          {
            id: 'j1435'
          },
          {
            id: 'j1234'
          }
        ],
        true,
        ['created_date_time >=', 'created_date_time <=', 'engine_category_id'],
        (sql, args) => {
          // verify that sql params had the correct values
          if (!args.includes('00000000-0000-0000-0000-000000000001'))
            return false;
          if (!args.includes('00000000-0000-0000-0000-000000000002'))
            return false;
          if (args.length !== 2) return false;
          return true;
        }
      );
      mockGetDagTemplates();
      const res = await dal.getJobs(makeContext(), {
        engineCategoryIds: [
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002'
        ],
        dateTimeFilter: [
          {
            fromDateTime: '2018-06-11T15:52:39.000Z',
            field: 'createdDateTime'
          },
          {
            toDateTime: '2018-06-19T15:52:39.000Z',
            field: 'createdDateTime'
          }
        ]
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
    });

    it('should get jobs by engine ID and engine category ID', async function () {
      coreDbRead._push([
        {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'test engine 1'
        }
      ]);
      coreDbRead._push([
        {
          id: 'engine_2_alias',
          alias_id: '00000000-0000-0000-0000-000000000002',
          name: 'test engine 2'
        }
      ]);
      // main job query
      coreDbRead._push(
        [
          {
            id: 'j1435'
          },
          {
            id: 'j1234'
          }
        ],
        true,
        [
          'created_date_time >=',
          'created_date_time <=',
          'engine_id',
          'engine_category_id'
        ],
        (sql, args) => {
          // verify that sql params had the correct values
          if (!args.includes('00000000-0000-0000-0000-000000000001'))
            return false;
          if (!args.includes('00000000-0000-0000-0000-000000000002'))
            return false;
          if (!args.includes('engine_2_alias')) return false;
          if (!args.includes('67cd4dd0-2f75-445d-a6f0-2f297d6cd182'))
            return false;
          if (!args.includes('581dbb32-ea5b-4458-bd15-8094942345e3'))
            return false;
          if (args.length !== 5) return false;
          return true;
        }
      );
      mockGetDagTemplates();
      const res = await dal.getJobs(makeContext(), {
        engineIds: [
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002'
        ],
        engineCategoryIds: [
          '581dbb32-ea5b-4458-bd15-8094942345e3',
          '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
        ],
        dateTimeFilter: [
          {
            fromDateTime: '2018-06-11T15:52:39.000Z',
            field: 'createdDateTime'
          },
          {
            toDateTime: '2018-06-19T15:52:39.000Z',
            field: 'createdDateTime'
          }
        ]
      });
      expect(res).toBeDefined();
    });

    it('should get jobs by tdo ID order with paging, ordering, DateTimeFilter and limit(=1) arguments', async function () {
      // main job query
      coreDbRead._push(
        [
          {
            job_id: 'j1435',
            recording_id: '1670771207',
            job_template_id: 'jt1234',
            job_config: { routes: { foo: 'bar' } },
            job_status: 'completed'
          }
        ],
        true,
        [
          'LIMIT',
          'OFFSET',
          'ORDER BY',
          'created_date_time',
          'modified_date_time',
          '>',
          '<'
        ],
        (sql, args) => {
          // verify that sql params had the correct values
          if (!args.includes('1670771207')) return false;
          return true;
        }
      );
      mockGetDagTemplates();
      const res = await dal.getJobs(makeContext(), {
        targetId: '1670771207',
        offset: 0,
        limit: 1,
        orderBy: [
          { field: 'createdDateTime', direction: 'asc' },
          { field: 'modifiedDateTime', direction: 'desc' },
          { field: 'completedDateTime', direction: 'asc' },
          { field: 'queuedDateTime', direction: 'desc' }
        ],
        dateTimeFilter: [
          {
            fromDateTime: '2018-06-11T15:52:39.000Z',
            field: 'createdDateTime'
          },
          {
            toDateTime: '2018-06-19T15:52:39.000Z',
            field: 'createdDateTime'
          }
        ]
      });

      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records.length).toEqual(1);

      const row1 = _.head(res.records);

      expect(row1.id).toEqual('j1435');
      expect(row1.targetId).toEqual('1670771207');
      expect(row1.templateId).toEqual('jt1234');
      expect(row1.routes.foo).toEqual('bar');
      expect(row1.skipDecider).toEqual(true);
      expect(row1.status).toEqual('completed');
    });

    it('should return empty data if the table is not in the retention window', async function () {
      // dal/util.js --> getPartitionTables
      coreDbRead._push([
        {
          schema: 'job_new',
          relname: 'job_2022_08_33'
        },
        {
          schema: 'job_new',
          relname: 'job_2022_08_34'
        }
      ]);

      const res = await dal.getJobs(makeContext(), {
        targetId: '1670771207',
        id: '21083318_1iBi0TmgUN',
        offset: 0,
        limit: 10,
        orderBy: [{ field: 'createdDateTime', direction: 'asc' }]
      });

      expect(res).toBeDefined();
      expect(res.count).toEqual(0);
      expect(res.records.length).toEqual(0);
    });

    it('should get jobs by tdo ID and job ID order by createdDate - no order needed', async function () {
      // dal/util.js --> getPartitionTables
      coreDbRead._push([
        {
          schema: 'job_new',
          relname: 'job_2021_08_33'
        },
        {
          schema: 'job_new',
          relname: 'job_2021_08_34'
        }
      ]);
      // getTDO
      coreDbRead._push([
        {
          id: '1670771207',
          application_id: appId,
          is_public: false,
          createdDateTime: '2021-08-18T23:53:59.000Z'
        }
      ]);
      // main job query
      coreDbRead._push(
        [
          {
            job_id: 'j1234_0',
            recording_id: '1670771207',
            job_template_id: 'jt4321_0',
            job_config: { routes: { foo: 'bar_0' } },
            job_status: 'pending'
          },
          {
            job_id: 'j1234_1',
            recording_id: '1670771207',
            job_template_id: 'jt4321_1',
            job_config: { routes: { foo: 'bar_1' } },
            job_status: 'pending'
          }
        ],
        true,
        ['LIMIT', 'OFFSET', 'created_date_time', 'modified_date_time'],
        (sql, args) => {
          // verify that sql params had the correct values
          if (!args.includes('1670771207')) return false;
          if (!args.includes('21083318_1iBi0TmgUN')) return false;
          return true;
        }
      );
      mockGetDagTemplates();
      const res = await dal.getJobs(makeContext(), {
        targetId: '1670771207',
        id: '21083318_1iBi0TmgUN',
        offset: 0,
        limit: 10,
        orderBy: [{ field: 'createdDateTime', direction: 'asc' }]
      });

      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
      expect(res.records.length).toEqual(2);

      for (let i = 0; i < res.count; i++) {
        const e = res.records[i];

        expect(e.id).toEqual(`j1234_${i}`);
        expect(e.targetId).toEqual(`1670771207`);
        expect(e.templateId).toEqual(`jt4321_${i}`);
        expect(e.routes.foo).toEqual(`bar_${i}`);
        expect(e.status).toEqual('pending');
      }
    });
    it('should error when database failed', async () => {
      // should error

      coreDbRead._push([
        {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'test engine 1'
        }
      ]);
      coreDbRead._push([
        {
          id: 'engine_2_alias',
          alias_id: '00000000-0000-0000-0000-000000000002',
          name: 'test engine 2'
        }
      ]);
      // main job query
      coreDbRead._push(
        [
          {
            id: 'j1435'
          },
          {
            id: 'j1234'
          }
        ],
        true,
        ['created_date_time >=', 'created_date_time <=', 'engine_id'],
        (sql, args) => {
          // verify that sql params had the correct values
          if (!args.includes('00000000-0000-0000-0000-000000000001'))
            return false;
          if (!args.includes('00000000-0000-0000-0000-000000000002'))
            return false;
          if (!args.includes('engine_2_alias')) return false;
          if (args.length !== 3) return false;
          return true;
        },
        true
      );
      let res, error;
      try {
        res = await dal.getJobs(makeContext(), {
          engineIds: [
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002'
          ],
          dateTimeFilter: [
            {
              fromDateTime: '2018-06-11T15:52:39.000Z',
              field: 'createdDateTime'
            },
            {
              toDateTime: '2018-06-19T15:52:39.000Z',
              field: 'createdDateTime'
            }
          ]
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
    });
    it('should get jobs by dagTemplateIds', async function () {
      const dagTemplateIds = [
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001'
      ];
      // main job query
      coreDbRead._push(
        [
          { id: 'job123', job_config: { dagTemplateId: 'template1' } },
          { id: 'job456', job_config: { dagTemplateId: 'template2' } }
        ],
        false
      );

      mockGetDagTemplates();
      const res = await dal.getJobs(makeContext(), {
        dagTemplateIds
      });

      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
    });

    it('should not throw error about the GROUP BY clause when filtering job by engineIds, engineCategory', async function () {
      coreDbRead._push([
        {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'test engine 1'
        }
      ]);
      coreDbRead._push([
        {
          id: 'engine_2_alias',
          alias_id: '00000000-0000-0000-0000-000000000002',
          name: 'test engine 2'
        }
      ]);
      // main job query
      coreDbRead._push(
        [
          {
            id: 'j1435'
          },
          {
            id: 'j1234'
          }
        ],
        false,
        [
          'created_date_time >=',
          'created_date_time <=',
          'engine_id',
          'GROUP BY j.job_id, d.dag_template_id'
        ],
        (sql, args) => {
          if (!sql.includes('d.dag_template_id')) {
            throw new Error(
              'column "d.dag_template_id" must appear in the GROUP BY clause or be used in an aggregate function'
            );
          }
          return true;
        }
      );
      mockGetDagTemplates();
      let err;
      try {
        const res = await dal.getJobs(makeContext(), {
          engineIds: [
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002'
          ],
          dateTimeFilter: [
            {
              fromDateTime: '2018-06-11T15:52:39.000Z',
              field: 'createdDateTime'
            },
            {
              toDateTime: '2018-06-19T15:52:39.000Z',
              field: 'createdDateTime'
            }
          ],
          dagTemplateIds: ['dag_template_test']
        });
        expect(res).toBeDefined();
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
    });
  });
  describe('#getJob', function () {
    it('should return empty data if the table is not in the retention window', async function () {
      // getJobs --> dal/util.js --> getPartitionTables
      coreDbRead._push([
        {
          schema: 'job_new',
          relname: 'job_2022_08_33'
        },
        {
          schema: 'job_new',
          relname: 'job_2022_08_34'
        }
      ]);

      coreDbRead._push([
        {
          id: '21083318_1iBi0TmgUN'
        }
      ]);
      try {
        const res = await dal.getJob(makeContext(), {
          id: '21083318_1iBi0TmgUN'
        });
        expect(res.id).toEqual('21083318_1iBi0TmgUN');
      } catch (error) {
        expect(error.name).toEqual('not_found');
      }
    });
    it('should get a job', async function () {
      // getJobs --> dal/util.js --> getPartitionTables
      coreDbRead._push([
        {
          schema: 'job_new',
          relname: 'job_2021_08_33'
        },
        {
          schema: 'job_new',
          relname: 'job_2021_08_34'
        }
      ]);

      coreDbRead._push([
        {
          id: '21083318_1iBi0TmgUN'
        }
      ]);

      mockGetDagTemplates();
      const res = await dal.getJob(makeContext(), {
        id: '21083318_1iBi0TmgUN'
      });
      expect(res.id).toEqual('21083318_1iBi0TmgUN');
    });
    it('should throw not found on no job', async function () {
      coreDbRead._push([]);
      try {
        await dal.getJob(makeContext(), { id: '21083318_1iBi0TmgUN' });
        jest.fail('no not_found');
      } catch (error) {
        expect(error.name).toEqual('not_found');
      }
    });
  });
  describe('#createJob - legacy', function () {
    it('should create a job with tdo target not inline', async function () {
      const context = makeContext();
      const input = {
        targetId: '12300001',
        organizationId: 7682,
        applicationId: appId,
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      // mock database result to TDO query
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12300001',
          application_id: appId,
          is_public: false
        }
      ]);
      // mock value for getEngines function
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, runtimeType: 'edge' }
      ]);
      // mock value for get deployed builds in populateTaskWithEngineBuildInfo
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId', runtime: { iron: '' } }
      ]);

      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: appId }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId, application_name: 'oldest application' }],
        false
      );
      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '8ec5dde4-f584-486d-8c83-19709f1091fe' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId', runtime: { iron: '' } }
      ]);
      // serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '8ec5dde4-f584-486d-8c83-19709f1091fe',
            engine_ids: [engineId],
            engine_alias_ids: [engineId]
          }
        ],
        false
      );
      // createJob
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'newJob_123',
          recording_id: '12300001',
          application_id: appId
        }
      ]);
      // createTask
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_123' }]);
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_124' }]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      dal = require('./job.js')(serviceContext);
      const res = await dal.createJob(context, { input });

      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_123');
      expect(res.targetId).toEqual('12300001');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('running');
    });

    it('should create a job with tdo target inline', async function () {
      let res;
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        createdDateTime: moment().toISOString(),
        target: {
          assets: [
            {
              assetType: 'media',
              contentType: 'video/mp4',
              uri: 'http://localhost/movie1'
            }
          ]
        },
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };

      serviceContext.redisCache.markCacheDirty(true);
      // get group ID for app
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: appId
        }
      ]);

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

      // mirrors to media table
      const nowCr = moment().valueOf();
      // createInMediaTable
      serviceContext.dbConnections['media_platform'].write._push([
        {
          media_id: '12300001',
          owner_application_id: appId,
          created_date_time: nowCr,
          modified_date_time: nowCr
        }
      ]);
      // media metadata table
      serviceContext.dbConnections['media_platform'].write._push([
        {
          media_id: '12300001',
          metadata: {}
        }
      ]);
      // createInRecordingTable
      serviceContext.dbConnections['core'].read._push([
        { recording_id: 'recordingId123' }
      ]);
      // creates the TDO
      const now = Date.now();
      serviceContext.dbConnections['core'].write._push(
        [
          {
            recording_id: '12300001',
            application_id: appId,
            start_date_time: now,
            stop_date_time: now,
            created_date_time: now,
            modified_date_time: now
          }
        ],
        true,
        ['recording'],
        (sql, vars) => {
          const nowM1 = moment().subtract(10, 'seconds');
          const nowP1 = moment().add(10, 'seconds');
          // verifies that create and modified date/time set correctly
          if (vars[7] !== vars[8]) {
            throw new Error('$7 != $8 ' + vars[7] + ' / ' + vars[8]);
          }
          if (
            nowP1.isBefore(moment(vars[7])) ||
            nowM1.isAfter(moment(vars[7]))
          ) {
            throw new Error(
              '$7 is not between ' + nowM1 + ' and ' + nowP1 + ' / ' + vars[7]
            );
          }
          if (
            nowP1.isBefore(moment(vars[8])) ||
            nowM1.isAfter(moment(vars[8]))
          ) {
            throw new Error(
              '$8 is not between ' + nowM1 + ' and ' + nowP1 + ' / ' + vars[8]
            );
          }
          // verifies that start and stop date/time set correctly
          if (
            nowP1.isBefore(moment(vars[9])) ||
            nowM1.isAfter(moment(vars[9]))
          ) {
            throw new Error(
              '$9 is not between ' + nowM1 + ' and ' + nowP1 + ' / ' + vars[9]
            );
          }
          if (
            nowP1.isBefore(moment(vars[10])) ||
            nowM1.isAfter(moment(vars[10]))
          ) {
            throw new Error(
              '$10 is not between ' + nowM1 + ' and ' + nowP1 + '/ ' + vars[10]
            );
          }
          if (vars[9] !== vars[10]) {
            throw new Error('$9 != $10 ' + vars[9] + ' / ' + vars[10]);
          }

          return true;
        }
      );
      // refresh the TDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12300001',
          application_id: appId,
          is_public: false,
          start_date_time: now,
          stop_date_time: now,
          created_date_time: now,
          modified_date_time: now
        }
      ]);
      // gets org ID for app ID
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      // --- End function serviceContext.dal.tdo.createTDO

      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '8ec5dde4-f584-486d-8c83-19709f1091fe' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '8ec5dde4-f584-486d-8c83-19709f1091fe' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '8ec5dde4-f584-486d-8c83-19709f1091fe' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '8ec5dde4-f584-486d-8c83-19709f1091fe' }
      ]);
      // select build for engine
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId', runtime: { iron: '' } }
      ]);
      // serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '8ec5dde4-f584-486d-8c83-19709f1091fe',
            engine_ids: [engineId],
            engine_alias_ids: [engineId]
          }
        ],
        false
      );
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId, application_name: 'oldest application' }],
        false
      );
      // createJob
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'newJob_123',
          recording_id: '12300001',
          application_id: appId
        }
      ]);
      // createTask
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_123' }]);
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_124' }]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

      serviceContext.dbConnections['media_platform'].write._push([]);

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

      res = await dal.createJob(context, {
        organizationId: 7682,
        applicationId: appId,
        input
      });

      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_123');
      expect(res.targetId).toEqual('12300001');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('running');
    });

    it('should create a job reprocess with streams', async function () {
      let res;
      const context = makeContext();
      const input = {
        targetId: '12300001',
        organizationId: 7682,
        applicationId: appId,
        isReprocessJob: true,
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      // mock database result to TDO query
      coreDbRead._push([
        {
          id: '12300001_abcd1',
          application_id: appId,
          type: 'media',
          content_type: 'video/mp4',
          uri: 'http://localhost'
        }
      ]);
      // mock database call to get metadata
      coreDbRead._push(
        [
          {
            details: {
              logoUrl: 'http://localhost',
              numSegments: 10
            }
          }
        ],
        false
      );

      // mock tdo sourceData
      coreDbRead._push([
        {
          content: {
            info: 123
          }
        }
      ]);

      // mock get mediaInit asset call to
      coreDbRead._push([
        {
          asset_id: '123',
          content_type: 'application/mp4'
        }
      ]);

      coreDbRead._push([
        {
          id: '12300001_abcd1',
          application_id: appId,
          type: 'media',
          content_type: 'video/mp4',
          uri: 'http://localhost'
        }
      ]);

      // mock value for getEngines function
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, runtimeType: 'edge' }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId', runtime: { iron: '' } }
      ]);
      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: appId }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId, application_name: 'oldest application' }],
        false
      );
      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '8ec5dde4-f584-486d-8c83-19709f1091fe' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId', runtime: { iron: '' } }
      ]);
      // serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '8ec5dde4-f584-486d-8c83-19709f1091fe',
            engine_ids: [engineId],
            engine_alias_ids: [engineId]
          }
        ],
        false
      );
      // createJob
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'newJob_123',
          recording_id: '12300001',
          application_id: appId
        }
      ]);
      // createTask
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_123' }]);
      // updateJobStatus
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'newJob_123',
          recording_id: '12300001',
          application_id: appId
        }
      ]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      res = await dal.createJob(context, { input });

      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_123');
      expect(res.targetId).toEqual('12300001');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('running');
    });

    it('should throw error when create a job without tdo target', async function () {
      let res, err;
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };

      serviceContext.dbConnections['core'].read._push([
        { engine_id: engineId }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId', runtime: { iron: '' } }
      ]);
      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '8ec5dde4-f584-486d-8c83-19709f1091fe' }
      ]);

      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: appId }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId, application_name: 'oldest application' }],
        false
      );

      try {
        res = await dal.createJob(context, { input });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('should create a job with payloadString', async function () {
      let res;
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        targetId: '12300001',
        tasks: [
          {
            engineId,
            payloadString: JSON.stringify({ foo: 1 })
          }
        ]
      };

      // mock database result to TDO query
      coreDbRead._push([
        {
          id: '12300001',
          application_id: appId,
          is_public: false
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { engine_id: engineId }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);

      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: appId }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId, application_name: 'oldest application' }],
        false
      );

      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '2b229a61-d3ac-4356-b57c-977639190395' }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      // serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '8ec5dde4-f584-486d-8c83-19709f1091fe',
            engine_ids: [engineId],
            engine_alias_ids: [engineId]
          }
        ],
        false
      );
      // createJob
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'newJob_12345',
          recording_id: '12300001',
          application_id: appId
        }
      ]);
      // createTask
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_123' }]);
      // updateJob
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      res = await dal.createJob(context, { input });

      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_12345');
      expect(res.targetId).toEqual('12300001');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('running');
    });

    it('should create a job with taskPayloadDefaults from org kvp', async function () {
      let res;
      const context = makeContext();

      _.set(context, '_authInfo.organization.kvp.taskPayloadDefaults', {
        default: 'test'
      });

      const input = {
        organizationId: 7682,
        applicationId: appId,
        targetId: '12300001',
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };

      // mock database result to TDO query
      coreDbRead._push([
        {
          id: '12300001',
          application_id: appId,
          is_public: false
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { engine_id: engineId }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: appId }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId, application_name: 'oldest application' }],
        false
      );
      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '2b229a61-d3ac-4356-b57c-977639190395' }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      // serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '8ec5dde4-f584-486d-8c83-19709f1091fe',
            engine_ids: [engineId],
            engine_alias_ids: [engineId]
          }
        ],
        false
      );
      // createJob
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'newJob_12345',
          recording_id: '12300001',
          application_id: appId
        }
      ]);
      // createTask
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_123' }]);
      // updateJob
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      res = await dal.createJob(context, { input });

      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_12345');
      expect(res.targetId).toEqual('12300001');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('running');
    });

    it('should create a job with multi task payload', async function () {
      const context = makeContext();

      _.set(context, '_authInfo.organization.kvp.taskPayloadDefaults', {
        default: 'test'
      });

      const input = {
        organizationId: 7682,
        applicationId: appId,
        targetId: '12300001',
        tasks: [
          {
            engineId,
            payload: {
              foo: 'test 2'
            }
          }
        ]
      };

      // mock database result to TDO query
      coreDbRead._push([
        {
          id: '12300001',
          application_id: appId,
          is_public: false
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { engine_id: engineId }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: appId }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId, application_name: 'oldest application' }],
        false
      );
      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '2b229a61-d3ac-4356-b57c-977639190395' }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      // serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '8ec5dde4-f584-486d-8c83-19709f1091fe',
            engine_ids: [engineId],
            engine_alias_ids: [engineId]
          }
        ],
        false
      );
      // createJob
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'newJob_12345',
          recording_id: '12300001',
          application_id: appId
        }
      ]);
      // createTask
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_123' }]);
      // updateJob
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      const res = await dal.createJob(context, { input });
      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_12345');
      expect(res.targetId).toEqual('12300001');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('running');
    });

    it('should create a job with token', async function () {
      const context = makeContext({ authType: 'api_internal' });
      const headerAppId = '11111111-2222-4333-8444-555555555555';
      _.set(context, 'requestContext.appId', headerAppId);

      const input = {
        organizationId: 7682,
        applicationId: appId,
        targetId: '12300001',
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      // // mock database result to TDO query
      coreDbRead._push([
        {
          id: '12300001',
          application_id: appId,
          is_public: false
        }
      ]);
      // mock value for getEngines function
      serviceContext.dbConnections['core'].read._push([{ id: engineId }]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);
      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '2b229a61-d3ac-4356-b57c-977639190395' }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      // serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '8ec5dde4-f584-486d-8c83-19709f1091fe',
            engine_ids: [engineId],
            engine_alias_ids: [engineId]
          }
        ],
        false
      );
      // createJob
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'newJob_12345',
          recording_id: '12300001',
          application_id: appId
        }
      ], true, [], (sql, args) => {
        expect(sql.toLowerCase()).toContain('content_application_id');
        expect(args).toContain(headerAppId);
        const jobConfigArg = args.find(
          (arg) => _.isPlainObject(arg) && _.has(arg, 'authData')
        );
        expect(_.get(jobConfigArg, 'authData.contentApplicationId')).toEqual(
          headerAppId
        );
        return true;
      });
      // createTask
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_123' }]);
      // updateJob
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      const res = await dal.createJob(context, { input });
      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_12345');
      expect(res.targetId).toEqual('12300001');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('running');
    });

    it('should infer authData applicationId from engine app when token appId is missing', async function () {
      const context = makeContext({ authType: 'api_internal' });
      _.unset(context, 'requestContext.appId');
      const inferredAppId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      const getAppApplicationFromEnginesSpy = jest
        .spyOn(serviceContext.dal.engine, 'getAppApplicationFromEngines')
        .mockResolvedValue([{ applicationId: inferredAppId }]);

      const input = {
        organizationId: 7682,
        applicationId: appId,
        targetId: '12300001',
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      // mock database result to TDO query
      coreDbRead._push([
        {
          id: '12300001',
          application_id: appId,
          is_public: false
        }
      ]);
      // mock value for getEngines function
      serviceContext.dbConnections['core'].read._push([{ id: engineId }]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);
      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '2b229a61-d3ac-4356-b57c-977639190395' }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      // serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '8ec5dde4-f584-486d-8c83-19709f1091fe',
            engine_ids: [engineId],
            engine_alias_ids: [engineId]
          }
        ],
        false
      );
      // createJob
      serviceContext.dbConnections['core'].write._push(
        [
          {
            job_id: 'newJob_12345',
            recording_id: '12300001',
            application_id: appId
          }
        ],
        true,
        [],
        (sql, args) => {
          expect(sql.toLowerCase()).toContain('content_application_id');
          expect(args).toContain(inferredAppId);
          const jobConfigArg = args.find(
            (arg) => _.isPlainObject(arg) && _.has(arg, 'authData')
          );
          expect(_.get(jobConfigArg, 'authData.applicationId')).toEqual(
            inferredAppId
          );
          expect(_.get(jobConfigArg, 'authData.contentApplicationId')).toEqual(
            inferredAppId
          );
          return true;
        }
      );
      // createTask
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_123' }]);
      // updateJob
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      try {
        const res = await dal.createJob(context, { input });
        expect(res).toBeDefined();
        expect(res.jobId).toEqual('newJob_12345');
        expect(res.targetId).toEqual('12300001');
        expect(res.applicationId).toEqual(appId);
        expect(res.status).toEqual('running');
        expect(getAppApplicationFromEnginesSpy).toHaveBeenCalledTimes(1);
      } finally {
        getAppApplicationFromEnginesSpy.mockRestore();
      }
    });

    it('should create a job with a clusterGroup', async function () {
      let res;
      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          clusterId: 'rt-deadbeef-0000-0001-0001-ba5eba111111',
          tasks: [{ engineId, payload: { foo: 'bar' } }],
          targetId: '12300001'
        }
      };

      // mock database result to TDO query
      coreDbRead._push([
        {
          id: '12300001',
          application_id: appId,
          is_public: false
        }
      ]);
      // get Cluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'rt-deadbeef-0000-0001-0001-ba5eba111111', is_group: true }
      ]);

      // get Sub Clusters
      serviceContext.dbConnections['core'].read._push([
        { id: 'rt-a7e586d5-c672-4ddd-91ef-e3e8712fb3c2', is_group: false },
        { id: 'rt-add9c45e-f53b-41bc-8085-91a2fa100588', is_group: false }
      ]);
      // mock value for getEngines function
      serviceContext.dbConnections['core'].read._push([{ id: engineId }]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: appId }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId, application_name: 'oldest application' }],
        false
      );
      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '2b229a61-d3ac-4356-b57c-977639190395' }
      ]);
      // get Cluster
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'rt-deadbeef-0000-0001-0001-ba5eba111111',
          is_group: false,
          organization_id: 7682
        }
      ]);
      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '2b229a61-d3ac-4356-b57c-977639190395' }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      // serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '8ec5dde4-f584-486d-8c83-19709f1091fe',
            engine_ids: [engineId],
            engine_alias_ids: [engineId]
          }
        ],
        false
      );
      // createJob
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'newJob_12345',
          recording_id: '12300001',
          application_id: appId
        }
      ]);
      // createTask
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_123' }]);
      // updateJob
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      res = await dal.createJob(context, args);

      expect(res).toBeDefined();
    });

    it('should create a job with a cluster', async function () {
      let res;
      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          clusterId: 'rt-deadbeef-0000-0001-0001-ba5eba111111',
          tasks: [{ engineId, payload: { foo: 'bar' } }],
          targetId: '12300001'
        }
      };

      // mock database result to TDO query
      coreDbRead._push([
        {
          id: '12300001',
          application_id: appId,
          is_public: false
        }
      ]);
      // get Cluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'rt-deadbeef-0000-0001-0001-ba5eba111111', is_group: false }
      ]);

      // mock value for getEngines function
      serviceContext.dbConnections['core'].read._push([{ id: engineId }]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: appId }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId, application_name: 'oldest application' }],
        false
      );
      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '2b229a61-d3ac-4356-b57c-977639190395' }
      ]);
      // get Cluster
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'rt-deadbeef-0000-0001-0001-ba5eba111111',
          is_group: false,
          organization_id: 7682
        }
      ]);
      // mock job.validate.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: engineId, category_id: '2b229a61-d3ac-4356-b57c-977639190395' }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'bed6aec4-0acb-429e-9d04-2804137a0b1e' }
      ]);
      // serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '8ec5dde4-f584-486d-8c83-19709f1091fe',
            engine_ids: [engineId],
            engine_alias_ids: [engineId]
          }
        ],
        false
      );
      // createJob
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'newJob_12345',
          recording_id: '12300001',
          application_id: appId
        }
      ]);
      // createTask
      serviceContext.dbConnections['core'].write._push([{ id: 'newTask_123' }]);
      // updateJob
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      res = await dal.createJob(context, args);

      expect(res).toBeDefined();
    });

    it('should throw if TDO not found', async function () {
      const context = makeContext();
      const input = {
        targetId: '12300002',
        organizationId: 7682,
        applicationId: appId,
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      // mock database result to TDO query
      coreDbRead._push([]);
      try {
        // should throw not found on TDO
        const res = await dal.createJob(context, { input });
        jest.fail('no not_found');
      } catch (error) {
        expect(error.name).toEqual('not_found');
      }
    });
    it('should throw if cached TDO not accessible to org by app ID', async function () {
      const context = makeContext({ authType: 'api_internal' });
      const input = {
        applicationId: appId,
        applicationIds: [appId],
        targetId: '12300002',
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };

      // mock database result to TDO query
      coreDbRead._push([
        {
          id: '12300002',
          application_id: '123',
          is_public: false
        }
      ]);

      try {
        const res = await dal.createJob(context, {
          applicationId: appId,
          input
        });
        jest.fail('no not_found');
      } catch (error) {
        expect(error.name).toEqual('not_found');
      }
    });

    it('should throw if cached TDO not accessible to org by org ID', async function () {
      const context = makeContext({ authType: 'api_internal' });

      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: appId
        }
      ]);
      // mock database result to TDO query
      coreDbRead._push([
        {
          id: '12300002',
          application_id: '123',
          is_public: false
        }
      ]);
      const input = {
        organizationId: 7682,
        targetId: '12300002',
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      try {
        await dal.createJob(context, {
          applicationId: appId,
          input
        });
        jest.fail('no not_found');
      } catch (error) {
        expect(error.name).toEqual('not_found');
      }
    });

    it('should throw if no app ID or org ID', async function () {
      const context = makeContext({ authType: 'api_internal' });
      const input = {
        targetId: '12300002',
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      try {
        const res = await dal.createJob(context, { input });
        jest.fail('no invalid_input');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
      }
    });

    it('should throw if missing task', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId
      };
      try {
        const res = await dal.createJob(context, { input });
        jest.fail('no throw error');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
        expect(error.message).toEqual(
          'CreateJob must have at least one task definition.'
        );
      }
    });

    it('should throw if task includes both payloadString and payload', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            },
            payloadString: JSON.stringify({ foo: 'bar' })
          }
        ]
      };
      try {
        const res = await dal.createJob(context, { input });
        jest.fail('no throw error');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
        expect(error.message).toEqual(
          'Only one of taskPayloadString and taskPayload is permitted'
        );
      }
    });

    it('should throw if task missing engineId and taskType', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        tasks: [
          {
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      try {
        const res = await dal.createJob(context, { input });
        jest.fail('no throw error');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
        expect(error.message).toEqual(
          'One of engineId or taskType is required'
        );
      }
    });

    it('should throw if task includes both engineId and taskType', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        tasks: [
          {
            engineId,
            taskType: 'transcript',
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      try {
        const res = await dal.createJob(context, { input });
        jest.fail('no throw error');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
        expect(error.message).toEqual(
          'Only one of engineId and taskType is permitted'
        );
      }
    });

    it('should throw if standby task nested greater than 10 ', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            },
            standbyTask: {
              engineId: 'c0e55cde-340b-44d7-bb42-2e0d65e98141',
              standbyTask: {
                engineId: 'c0e55cde-340b-44d7-bb42-2e0d65e98141',
                standbyTask: {
                  engineId: 'c0e55cde-340b-44d7-bb42-2e0d65e98141',
                  standbyTask: {
                    engineId: 'c0e55cde-340b-44d7-bb42-2e0d65e98141',
                    standbyTask: {
                      engineId: 'c0e55cde-340b-44d7-bb42-2e0d65e98141',
                      standbyTask: {
                        engineId: 'c0e55cde-340b-44d7-bb42-2e0d65e98141',
                        standbyTask: {
                          engineId: 'c0e55cde-340b-44d7-bb42-2e0d65e98141',
                          standbyTask: {
                            engineId: 'c0e55cde-340b-44d7-bb42-2e0d65e98141',
                            standbyTask: {
                              engineId: 'c0e55cde-340b-44d7-bb42-2e0d65e98141',
                              standbyTask: {
                                engineId:
                                  'c0e55cde-340b-44d7-bb42-2e0d65e98141',
                                standbyTask: {
                                  engineId:
                                    'c0e55cde-340b-44d7-bb42-2e0d65e98141',
                                  standbyTask: {
                                    engineId:
                                      'c0e55cde-340b-44d7-bb42-2e0d65e98141'
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      };
      try {
        const res = await dal.createJob(context, { input });
        jest.fail('no throw error');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
        expect(error.message).toEqual(
          'The job could not be created because the standby task ' +
            'nested exceeded the allowed level of 10.'
        );
      }
    });

    it('should throw if cluster is not exists', async function () {
      let res, err;
      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          clusterId: 'rt-deadbeef-0000-0001-0001-ba5eba111111',
          tasks: [{ engineId, payload: { foo: 'bar' } }]
        }
      };

      // get Cluster
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.createJob(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(err.data.objectType).toEqual('Cluster');
      expect(err.data.objectId).toEqual(
        'rt-deadbeef-0000-0001-0001-ba5eba111111'
      );
    });

    it('should throw if Cluster Group did not include any Cluster', async function () {
      let res, err;
      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          clusterId: 'rt-deadbeef-0000-0001-0001-ba5eba111111',
          tasks: [{ engineId, payload: { foo: 'bar' } }]
        }
      };

      // get Cluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'rt-deadbeef-0000-0001-0001-ba5eba111111', is_group: true }
      ]);

      // get Sub Clusters
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.createJob(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(err.data.objectType).toEqual('ClusterGroupId');
      expect(err.data.objectId).toEqual(
        'rt-deadbeef-0000-0001-0001-ba5eba111111'
      );
    });

    it('should throw error if no access to engine', async function () {
      let res, err;
      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          tasks: [{ engineId: 'engineId1' }, { engineId: 'engineId2' }]
        }
      };

      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: appId
        }
      ]);

      serviceContext.dbConnections['core'].read._push([{ id: 'engineId1' }]);

      try {
        res = await dal.createJob(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
      expect(err.data.objectId).toEqual('engineIds');
      expect(err.data.objectData).toEqual('engineId1, engineId2');
    });
  });

  describe('#createJob - new tests', function () {
    let mockIronRequestObj, context;

    beforeEach(() => {
      mockIronRequestObj = {
        applicationId: 'applicationId',
        targetId: '123456',
        tasks: [
          {
            engineId: 'engine-alias-id'
          }
        ]
      };
      context = mockUtil.makeContext();
      _.set(
        context,
        '_authInfo.organization.kvp.features.useNewCreateJob',
        true
      );
      serviceContext.coreJob.eventEmitter.emitJobCreatedEvent.mockReset();
    });

    it('should create iron job with engine alias id', async function () {
      let res, err;
      const args = {
        input: mockIronRequestObj
      };

      serviceContext.redisCache.markCacheDirty(true);
      // get TDO info from targetId
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockIronRequestObj.targetId,
          application_id: mockIronRequestObj.applicationId
        }
      ]);
      // get Engines list
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engine-internal-id',
          alias_id: mockIronRequestObj.tasks[0].engineId,
          owner_organization_id: 7682,
          category_id: 'engine-category-id',
          name: 'engine-name',
          state: 'active',
          description: 'engine-description',
          currency: 'USD'
        }
      ]);
      // get Builds for each Engine
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'engine-internal-id',
          id: 'engine-build-id',
          runtime: {
            iron: { cluster: '598ccf431df14a00095476b7', priority: 0 }
          },
          status: 'deployed'
        }
      ]);

      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: appId }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId, application_name: 'oldest application' }],
        false
      );

      // get Engine for job model validation
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engine-internal-id',
          alias_id: mockIronRequestObj.tasks[0].engineId,
          owner_organization_id: 7682,
          category_id: 'engine-category-id',
          name: 'engine-name',
          state: 'active',
          description: 'engine-description',
          currency: 'USD'
        }
      ]);
      // get Builds again to get the task's build info
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'engine-internal-id',
          id: 'engine-build-id',
          runtime: {
            iron: { cluster: '598ccf431df14a00095476b7', priority: 0 }
          },
          status: 'deployed'
        }
      ]);
      // get Engine Category for Engine
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engine-category-id',
            name: 'engine-category-name',
            description: 'engine-category-description',
            engine_ids: ['engine-internal-id', 'engine-internal-id-1'],
            engine_alias_ids: ['engine-alias-id', 'engine-alias-id-1']
          }
        ],
        false
      );
      // mock data for insert Job query
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'job-id',
          application_id: mockIronRequestObj.applicationId,
          recording_id: mockIronRequestObj.targetId,
          organization_id: 7682
        }
      ]);
      // mock data for insert Tasks query
      serviceContext.dbConnections['core'].write._push([
        {
          id: 'task-id',
          job_id: 'job-id',
          engine_id: mockIronRequestObj.tasks[0].engineId,
          application_id: mockIronRequestObj.applicationId,
          status: 'pending',
          target_id: mockIronRequestObj.targetId
        }
      ]);
      // mock data for Job Status update query
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      try {
        res = await dal.createJob(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('job-id');
      expect(res.applicationId).toEqual(mockIronRequestObj.applicationId);
      expect(res.targetId).toEqual(mockIronRequestObj.targetId);
      expect(res.organizationId).toEqual(7682);
      expect(res.status).toEqual('running');
      expect(res.tasks.length).toEqual(1);
      expect(
        _.omitBy(res.tasks[0], (prop) => {
          return _.isNull(prop) || _.isUndefined(prop);
        })
      ).toEqual({
        id: 'task-id',
        jobId: 'job-id',
        engineId: mockIronRequestObj.tasks[0].engineId, // aliasId
        applicationId: mockIronRequestObj.applicationId,
        status: 'pending',
        targetId: mockIronRequestObj.targetId,
        recordingId: mockIronRequestObj.targetId
      });
      expect(
        serviceContext.coreJob.eventEmitter.emitJobCreatedEvent
      ).toHaveBeenCalled();
    });
  });

  describe('#getJobTDOTargets', function () {
    it('should return empty tdo target, if input jobIds empty', async function () {
      let res, err;
      const jobIds = [];

      try {
        res = await dal.getJobTDOTargets(jobIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(0);
    });

    it('should get job tdo target', async function () {
      let res, err;
      const jobIds = ['jobId1', 'jobId2'];

      serviceContext.dbConnections['core'].read._push([
        { tdo_id: 123456, job_id: 'jobId1' },
        { tdo_id: 123457, job_id: 'jobId2' }
      ]);

      try {
        res = await dal.getJobTDOTargets(jobIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
      expect(res[0]).toEqual(123456);
      expect(res[1]).toEqual(123457);
    });
  });

  describe('#newCreateJob', function () {
    let context = mockUtil.getGraphQLContext('user');
    const mockedEngineLibraryTaskGenerator = jest.fn();
    const mockedValidateTaskId = jest.fn();
    const mockedEngineLibraryModelValidatorGen = jest.fn();
    const mockedMakeInsertSql = jest.fn();
    const mockedDateTimeToISOString = jest.fn();

    beforeEach(() => {
      serviceContext.redisCache.markCacheDirty(true);
      jest.mock('./util');
      jest.mock(
        '../modules/core-job-server/helper/engine-library-model-validator'
      );
      require('./util').mockImplementation(() => {
        return {
          engineLibraryTaskGenerator: mockedEngineLibraryTaskGenerator,
          validateTaskId: mockedValidateTaskId,
          makeInsertSql: mockedMakeInsertSql,
          dateTimeToISOString: mockedDateTimeToISOString
        };
      });
      require('../modules/core-job-server/helper/engine-library-model-validator').mockImplementation(
        (dalLibrary) => {
          return mockedEngineLibraryModelValidatorGen.mockImplementation(
            (task, cb) => {
              return cb();
            }
          );
        }
      );
      _.set(serviceContext, 'coreJob.cjdal', {
        engine: {}
      });
      _.set(serviceContext, 'coreJob.eventEmitter', {
        emitJobCreatedEvent: jest.fn()
      });
      _.set(context, 'tracer', {
        startSpan: function () {
          return {
            setTag: function () {
              return;
            },
            finish: function () {
              return;
            },
            logEvent: function () {
              return;
            }
          };
        }
      });
      dal = require('./job.js')(serviceContext);
    });

    afterAll(() => {
      jest.resetModules();
    });

    it('should throw invalid_input error if jobId is invalid', async function () {
      let res, err;
      const jobBody = {
        tasks: [{ engineId: 'engineId1' }, { engineId: 'engineId2' }],
        recordingToken: 'recordingToken',
        createdDateTime: 'invalidDate',
        jobId: 'invalidJobId'
      };

      serviceContext.dbConnections['core'].read._push([
        { id: 'engineId1' },
        { id: 'engineId2' }
      ]);

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(err.data.objectId).toEqual('jobId');
      expect(err.data.objectData).toEqual('invalidJobId');
    });

    it('should throw error if jobId is invalid and not a date id or uuid v4', async function () {
      let res, err;
      const jobBody = {
        tasks: [{ engineId: 'engineId1' }, { engineId: 'engineId2' }],
        recordingToken: 'recordingToken',
        createdDateTime: moment(
          serviceContext.config.taskTablePartitionActiveDate
        )
          .add(-1, 'day')
          .toISOString(),
        jobId: 'invalidJobId'
      };

      serviceContext.dbConnections['core'].read._push([
        { id: 'engineId1' },
        { id: 'engineId2' }
      ]);

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual(
          'invalid job id - not a date id or uuid v4'
        );
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('should throw error if job is missing applicationId', async function () {
      let res, err;
      const jobBody = {
        tasks: [{ engineId: 'engineId1' }, { engineId: 'engineId2' }],
        recordingToken: 'recordingToken',
        createdDateTime: moment().toISOString()
      };

      serviceContext.dbConnections['core'].read._push([
        { id: 'engineId1' },
        { id: 'engineId2' }
      ]);

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('missing application id');
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('should throw error if application cound not mapped to an org', async function () {
      let res, err;
      const jobBody = {
        tasks: [{ engineId: 'engineId1' }, { engineId: 'engineId2' }],
        recordingToken: 'recordingToken',
        createdDateTime: moment().toISOString(),
        applicationId: 'applicationId'
      };

      // serviceContext.dal.engine.getEngines
      serviceContext.dbConnections['core'].read._push([
        { id: 'engineId1' },
        { id: 'engineId2' }
      ]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([]);

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual(
          'The applicationId, applicationId, could not be mapped to an organization.'
        );
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('should throw error if invalid taskId', async function () {
      let res, err;
      const jobBody = {
        tasks: [{ engineId: 'engineId1' }, { engineId: 'engineId2' }],
        recordingToken: 'recordingToken',
        createdDateTime: moment().toISOString(),
        applicationId: 'applicationId'
      };
      _.set(context, '_authInfo.organization.organizationId', '7682');

      // serviceContext.dal.engine.getEngines
      serviceContext.dbConnections['core'].read._push([
        { id: 'engineId1' },
        { id: 'engineId2' }
      ]);
      // mock engineLibraryTaskGenerator
      mockedEngineLibraryTaskGenerator.mockImplementation(
        (job, organizationId) => {
          job.tasks.forEach((task, index) => {
            task.taskId = `taskId${index + 1}`;
          });
          return Promise.resolve();
        }
      );
      //mock validateTaskId
      mockedValidateTaskId.mockImplementation((taskId) => {
        return false;
      });

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('invalid task ID');
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(err.data.objectType).toEqual('taskId');
      expect(err.data.objectData).toEqual('taskId1');
    });

    it('should throw error if no access to the TDO', async function () {
      let res, err;
      const jobBody = {
        tasks: [{ engineId: 'engineId1' }, { engineId: 'engineId2' }],
        recordingToken: 'recordingToken',
        createdDateTime: moment().toISOString(),
        applicationId: 'applicationId',
        recordingId: '760001116'
      };
      _.set(context, '_authInfo.organization.organizationId', '7682');

      // mock engineLibraryTaskGenerator
      mockedEngineLibraryTaskGenerator.mockImplementation(
        (job, organizationId) => {
          job.tasks.forEach((task, index) => {
            task.taskId = `taskId${index + 1}`;
          });
          return Promise.resolve();
        }
      );
      //mock validateTaskId
      mockedValidateTaskId.mockImplementation((taskId) => {
        return true;
      });
      // mock serviceContext.dal.engine.getEngine (2 times)
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);
      // mock serviceContext.dal.tdo.getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '760001116',
          source_id: 'sourceId',
          json: {},
          is_public: true,
          created_date_time: moment().toISOString(),
          modified_date_time: moment().toISOString(),
          scheduled_job_id: 'scheduleJobId',
          start_date_time: moment().toISOString(),
          stop_date_time: moment().toISOString(),
          application_id: 'applicationId1'
        }
      ]);

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('no access to recording');
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('resource_unavailable');
      expect(err.data.objectType).toEqual('targetId');
      expect(err.data.objectData).toEqual('760001116');
    });

    it('should throw error if no access to cluster', async function () {
      let res, err;
      const jobBody = {
        tasks: [{ engineId: 'engineId1' }, { engineId: 'engineId2' }],
        recordingToken: 'recordingToken',
        createdDateTime: moment().toISOString(),
        applicationId: 'applicationId',
        recordingId: '760001116',
        clusterId: 'clusterId'
      };
      _.set(context, '_authInfo.organization.organizationId', 7682);

      // mock engineLibraryTaskGenerator
      mockedEngineLibraryTaskGenerator.mockImplementation(
        (job, organizationId) => {
          job.tasks.forEach((task, index) => {
            task.taskId = `taskId${index + 1}`;
          });
          return Promise.resolve();
        }
      );
      //mock validateTaskId
      mockedValidateTaskId.mockImplementation((taskId) => {
        return true;
      });
      // mock serviceContext.dal.engine.getEngine (2 times)
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);
      // mock serviceContext.dal.tdo.getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '760001116',
          source_id: 'sourceId',
          json: {},
          is_public: true,
          created_date_time: moment().toISOString(),
          modified_date_time: moment().toISOString(),
          scheduled_job_id: 'scheduleJobId',
          start_date_time: moment().toISOString(),
          stop_date_time: moment().toISOString(),
          application_id: 'applicationId'
        }
      ]);
      // mock getCompletedJobsForRecording
      // serviceContext.dbConnections['core'].read._push([]);
      // mock serviceContext.dal.cluster.getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', organization_id: 1234, is_public: false }
      ]);

      // mock dal.cluster.getCollaboratingOrgIds
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('no access to cluster');
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
      expect(err.data.objectType).toEqual('clusterId');
      expect(err.data.objectData).toEqual('clusterId');
    });

    it('should create job successfully as collaborator', async function () {
      let res, err;
      const jobBody = {
        tasks: [
          { engineId: 'engineId1', testTask: true },
          { engineId: 'engineId2', testTask: true }
        ],
        recordingToken: 'recordingToken',
        createdDateTime: moment().toISOString(),
        applicationId: 'applicationId',
        recordingId: '760001116',
        clusterId: 'clusterId',
        isReprocessJob: false,
        streamUrl: 'download/tdo/',
        sourceAssetId: 'asset-master'
      };
      _.set(context, '_authInfo.organization.organizationId', 7682);

      // mock engineLibraryTaskGenerator
      mockedEngineLibraryTaskGenerator.mockImplementation(
        (job, organizationId) => {
          job.tasks.forEach((task, index) => {
            task.engineId = `engineId${index + 1}`;
          });
          return Promise.resolve();
        }
      );
      //mock validateTaskId
      mockedValidateTaskId.mockImplementation((taskId) => {
        return true;
      });
      // mock serviceContext.dal.engine.getEngine (2 times)
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);
      // mock serviceContext.dal.tdo.getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '760001116',
          source_id: 'sourceId',
          json: {},
          is_public: true,
          created_date_time: moment().toISOString(),
          modified_date_time: moment().toISOString(),
          scheduled_job_id: 'scheduleJobId',
          start_date_time: moment().toISOString(),
          stop_date_time: moment().toISOString(),
          application_id: 'applicationId'
        }
      ]);
      // mock serviceContext.dal.cluster.getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', organization_id: 1234, is_public: false }
      ]);
      // mock dal.cluster.getCollaboratingOrgIds
      serviceContext.dbConnections['core'].read._push([
        { organization_id: 7682 }
      ]);

      // mock serviceContext.dal.engine.getEngine (2 times)
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);

      // mock makeInsertSql
      mockedMakeInsertSql.mockImplementation(() => {
        return { sql: 'SELECT * from job', values: [] };
      });
      // mock createJobDb
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: '19125116_5ALGxRVPO1',
          application_id: 'applicationId',
          recording_id: '760001116',
          cluster_id: 'clusterId',
          organization_id: '7682',
          created_date_time: 1576492949
        }
      ]);
      // mock serviceContext.dal.task.createTasksDb
      serviceContext.dbConnections['core'].write._push([
        {
          id: '19125116_eaytb1lJshbJvgb',
          job_id: '19125116_eaytb1lJsh',
          engine_id: '9e611ad7-2d3b-48f6-a51b-0a1ba40feab4',
          application_id: 'applicationId',
          status: 'pending',
          payload: {
            comment: 'webstream adapter',
            url: 'download/tdo/',
            organizationId: '7682'
          },
          target_id: '760001116',
          is_clone: false,
          task_order: 0
        },
        {
          id: '19125116_eaytb1lJshEMpv4',
          job_id: '19125116_eaytb1lJsh',
          engine_id: 'ea0ada2a-7571-4aa5-9172-b5a7d989b041',
          application_id: 'applicationId',
          status: 'pending',
          payload: {
            comment: 'stream ingestor',
            generateMediaAssets: false,
            extractFramesPerSec: 0.5,
            outputChunkDuration: '5m',
            chunkOverlapDuration: '0s',
            organizationId: '7682'
          },
          target_id: '760001116',
          is_clone: false,
          task_order: 1
        }
      ], true, ['source_asset_id'], (sql, args) => {
        const { TASK_INSERT_COLUMNS } = require('./task.js');
        const width = TASK_INSERT_COLUMNS.length;
        const sourceAssetIds = [args[width - 1], args[width * 2 - 1]];
        return args.length === width * 2 && _.every(sourceAssetIds, (id) => id === 'asset-master');
      });
      // mock updateJobStatus
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.jobId).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.applicationId).toEqual('applicationId');
      expect(res.recordingId).toEqual('760001116');
      expect(res.tasks.length).toEqual(2);
    });

    it('should create job successfully as collaborator and current orgId is string', async function () {
      let res, err;
      const jobBody = {
        tasks: [
          { engineId: 'engineId1', testTask: true },
          { engineId: 'engineId2', testTask: true }
        ],
        recordingToken: 'recordingToken',
        createdDateTime: moment().toISOString(),
        applicationId: 'applicationId',
        recordingId: '760001116',
        clusterId: 'clusterId',
        isReprocessJob: false,
        streamUrl: 'download/tdo/',
        jobConfig: {
          authData: {
              contentApplicationId: 'content-app-id'
          },
        },
      };
      _.set(context, '_authInfo.organization.organizationId', '7682');

      // mock engineLibraryTaskGenerator
      mockedEngineLibraryTaskGenerator.mockImplementation(
        (job, organizationId) => {
          job.tasks.forEach((task, index) => {
            task.engineId = `engineId${index + 1}`;
          });
          return Promise.resolve();
        }
      );
      //mock validateTaskId
      mockedValidateTaskId.mockImplementation((taskId) => {
        return true;
      });
      // mock serviceContext.dal.engine.getEngine (2 times)
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);
      // mock serviceContext.dal.tdo.getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '760001116',
          source_id: 'sourceId',
          json: {},
          is_public: true,
          created_date_time: moment().toISOString(),
          modified_date_time: moment().toISOString(),
          scheduled_job_id: 'scheduleJobId',
          start_date_time: moment().toISOString(),
          stop_date_time: moment().toISOString(),
          application_id: 'applicationId'
        }
      ]);
      // mock serviceContext.dal.cluster.getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', organization_id: 1234, is_public: false }
      ]);
      // mock dal.cluster.getCollaboratingOrgIds
      serviceContext.dbConnections['core'].read._push([
        { organization_id: 7682 }
      ]);

      // mock serviceContext.dal.engine.getEngine (2 times)
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);

      // mock createJobDb
      serviceContext.dbConnections['core'].write._push(
        [
          {
            job_id: '19125116_5ALGxRVPO1',
            application_id: 'applicationId',
            recording_id: '760001116',
            cluster_id: 'clusterId',
            organization_id: '7682',
            created_date_time: 1576492949,
          },
        ],
        false,
        [],
        (sql, args) => {
          expect(sql).toMatch(/INSERT INTO job_new*/);
          const hasContentAppId = _.some(
            args,
            (arg) => arg === 'content-app-id',
          );
          expect(hasContentAppId).toEqual(true);
          return true;
        },
      );
      // mock serviceContext.dal.task.createTasksDb
      serviceContext.dbConnections['core'].write._push([
        {
          id: '19125116_eaytb1lJshbJvgb',
          job_id: '19125116_eaytb1lJsh',
          engine_id: '9e611ad7-2d3b-48f6-a51b-0a1ba40feab4',
          application_id: 'applicationId',
          status: 'pending',
          payload: {
            comment: 'webstream adapter',
            url: 'download/tdo/',
            organizationId: '7682'
          },
          target_id: '760001116',
          is_clone: false,
          task_order: 0
        },
        {
          id: '19125116_eaytb1lJshEMpv4',
          job_id: '19125116_eaytb1lJsh',
          engine_id: 'ea0ada2a-7571-4aa5-9172-b5a7d989b041',
          application_id: 'applicationId',
          status: 'pending',
          payload: {
            comment: 'stream ingestor',
            generateMediaAssets: false,
            extractFramesPerSec: 0.5,
            outputChunkDuration: '5m',
            chunkOverlapDuration: '0s',
            organizationId: '7682'
          },
          target_id: '760001116',
          is_clone: false,
          task_order: 1
        }
      ]);
      // mock updateJobStatus
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

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

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.jobId).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.applicationId).toEqual('applicationId');
      expect(res.recordingId).toEqual('760001116');
      expect(res.tasks.length).toEqual(2);
    });

    it('should throw error if invalid taskId for standbyTask', async function () {
      let res, err;
      const jobBody = {
        tasks: [{ engineId: 'engineId1' }, { engineId: 'engineId2' }],
        recordingToken: 'recordingToken',
        createdDateTime: moment().toISOString(),
        applicationId: 'applicationId',
        recordingId: '760001116',
        clusterId: 'clusterId'
      };
      _.set(context, '_authInfo.organization.organizationId', '7682');

      // serviceContext.dal.engine.getEngines
      serviceContext.dbConnections['core'].read._push([
        { id: 'engineId1' },
        { id: 'engineId2' }
      ]);
      // mock engineLibraryTaskGenerator
      mockedEngineLibraryTaskGenerator.mockImplementation(
        (job, organizationId) => {
          job.tasks.forEach((task, index) => {
            task.engineId = `engineId${index + 1}`;
            task.standby = { taskId: '123' };
          });
          return Promise.resolve();
        }
      );
      //mock validateTaskId
      mockedValidateTaskId.mockImplementation((taskId) => {
        return false;
      });
      // mock serviceContext.dal.engine.getEngine (2 times)
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);
      // mock serviceContext.dal.tdo.getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '760001116',
          source_id: 'sourceId',
          json: {},
          is_public: true,
          created_date_time: moment().toISOString(),
          modified_date_time: moment().toISOString(),
          scheduled_job_id: 'scheduleJobId',
          start_date_time: moment().toISOString(),
          stop_date_time: moment().toISOString(),
          application_id: 'applicationId'
        }
      ]);
      // mock getCompletedJobsForRecording
      serviceContext.dbConnections['core'].read._push([]);
      // mock serviceContext.dal.cluster.getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', organization_id: '7682', is_public: false }
      ]);

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('invalid task id');
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('should throw internal error if create job failed', async function () {
      let res, err;
      const jobBody = {
        tasks: [{ engineId: 'engineId1' }, { engineId: 'engineId2' }],
        recordingToken: 'recordingToken',
        createdDateTime: moment().toISOString(),
        applicationId: 'applicationId',
        recordingId: '760001116',
        clusterId: 'clusterId'
      };
      _.set(context, '_authInfo.organization.organizationId', 7682);

      // mock engineLibraryTaskGenerator
      mockedEngineLibraryTaskGenerator.mockImplementation(
        (job, organizationId) => {
          job.tasks.forEach((task, index) => {
            task.engineId = `engineId${index + 1}`;
            task.standby = { taskId: '123', engineId: `engineId${index + 1}` };
          });
          return Promise.resolve();
        }
      );
      //mock validateTaskId
      mockedValidateTaskId.mockImplementation((taskId) => {
        return true;
      });
      // mock serviceContext.dal.engine.getEngine (2 times)
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);
      // mock serviceContext.dal.tdo.getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '760001116',
          source_id: 'sourceId',
          json: {},
          is_public: true,
          created_date_time: moment().toISOString(),
          modified_date_time: moment().toISOString(),
          scheduled_job_id: 'scheduleJobId',
          start_date_time: moment().toISOString(),
          stop_date_time: moment().toISOString(),
          application_id: 'applicationId'
        }
      ]);
      // mock getCompletedJobsForRecording
      // serviceContext.dbConnections['core'].read._push([]);
      // mock serviceContext.dal.cluster.getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', organization_id: 7682, is_public: false }
      ]);
      // mock dal.cluster.getCollaboratingOrgIds
      serviceContext.dbConnections['core'].read._push([]);
      // mock serviceContext.dal.engine.getEngine (4 times)
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);
      // mock serviceContext.dal.engine.getEngineBuilds (4 times)
      serviceContext.dbConnections['core'].read._push([{ id: 'buildId1' }]);
      serviceContext.dbConnections['core'].read._push([{ id: 'buildId2' }]);
      serviceContext.dbConnections['core'].read._push([{ id: 'buildId1' }]);
      serviceContext.dbConnections['core'].read._push([{ id: 'buildId2' }]);
      // mock serviceContext.dal.engineCategory.getEngineCategory (4 times)
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId1',
            engine_ids: ['engineId1', 'engineId2'],
            engine_alias_ids: ['engineAliasId1', 'engineAliasId2']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId2',
            engine_ids: ['engineId1', 'engineId2'],
            engine_alias_ids: ['engineAliasId1', 'engineAliasId2']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId1',
            engine_ids: ['engineId1', 'engineId2'],
            engine_alias_ids: ['engineAliasId1', 'engineAliasId2']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId2',
            engine_ids: ['engineId1', 'engineId2'],
            engine_alias_ids: ['engineAliasId1', 'engineAliasId2']
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

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(_.includes(error.message, 'Failed to create job:')).toEqual(
          true
        );
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
    });

    it('should read contentApplicationId from authDataLaunch when template already has authData', async function () {
      let res, err;
      const scheduledJobAppId = 'scheduled-job-app-id-123';
      const staleTemplateAppId = 'stale-template-app-id-456';
      const jobBody = {
        tasks: [
          { engineId: 'engineId1', testTask: true },
          { engineId: 'engineId2', testTask: true }
        ],
        recordingToken: 'recordingToken',
        createdDateTime: moment().toISOString(),
        applicationId: 'applicationId',
        recordingId: '760001116',
        clusterId: 'clusterId',
        jobConfig: {
          // template already has authData (stale value)
          authData: { contentApplicationId: staleTemplateAppId },
          // fresh authData goes to authDataLaunch (resolved from scheduledJobAppId)
          authDataLaunch: { contentApplicationId: scheduledJobAppId }
        }
      };
      _.set(context, '_authInfo.organization.organizationId', 7682);

      // mock engineLibraryTaskGenerator
      mockedEngineLibraryTaskGenerator.mockImplementation(
        (job, organizationId) => {
          job.tasks.forEach((task, index) => {
            task.engineId = `engineId${index + 1}`;
          });
          return Promise.resolve();
        }
      );
      //mock validateTaskId
      mockedValidateTaskId.mockImplementation((taskId) => {
        return true;
      });
      // mock serviceContext.dal.engine.getEngine (2 times)
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);
      // mock serviceContext.dal.tdo.getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '760001116',
          source_id: 'sourceId',
          json: {},
          is_public: true,
          created_date_time: moment().toISOString(),
          modified_date_time: moment().toISOString(),
          scheduled_job_id: 'scheduleJobId',
          start_date_time: moment().toISOString(),
          stop_date_time: moment().toISOString(),
          application_id: 'applicationId'
        }
      ]);
      // mock serviceContext.dal.cluster.getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', organization_id: 1234, is_public: false }
      ]);
      // mock dal.cluster.getCollaboratingOrgIds
      serviceContext.dbConnections['core'].read._push([
        { organization_id: 7682 }
      ]);

      // mock serviceContext.dal.engine.getEngine (2 times)
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId1',
          alias_id: 'aliasEngineId1',
          category_id: 'categoryId1'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId2',
          alias_id: 'aliasEngineId2',
          category_id: 'categoryId2'
        }
      ]);

      // mock createJobDb
      serviceContext.dbConnections['core'].write._push(
        [
          {
            job_id: '19125116_5ALGxRVPO1',
            application_id: 'applicationId',
            recording_id: '760001116',
            cluster_id: 'clusterId',
            organization_id: '7682',
            content_application_id: scheduledJobAppId,
            created_date_time: 1576492949,
          },
        ],
        false,
        [],
        (sql, args) => {
          expect(sql).toMatch(/INSERT INTO job_new*/);
          const hasContentAppId = _.some(
            args,
            (arg) => arg === scheduledJobAppId,
          );
          expect(hasContentAppId).toEqual(true);
          return true;
        },
      );
      // mock serviceContext.dal.task.createTasksDb
      serviceContext.dbConnections['core'].write._push([
        {
          id: '19125116_eaytb1lJshbJvgb',
          job_id: '19125116_eaytb1lJsh',
          engine_id: 'engineId1',
          application_id: 'applicationId',
          status: 'pending',
          payload: { organizationId: '7682' },
          target_id: '760001116',
          is_clone: false,
          task_order: 0
        },
        {
          id: '19125116_eaytb1lJshEMpv4',
          job_id: '19125116_eaytb1lJsh',
          engine_id: 'engineId2',
          application_id: 'applicationId',
          status: 'pending',
          payload: { organizationId: '7682' },
          target_id: '760001116',
          is_clone: false,
          task_order: 1
        }
      ]);
      // mock updateJobStatus
      serviceContext.dbConnections['core'].write._push([]);
      // createJobAudit - update action
      serviceContext.dbConnections['core'].write._push([], false);
      // createJobAudit - create action
      serviceContext.dbConnections['core'].write._push([], false);

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
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

      try {
        res = await dal.newCreateJob(context, jobBody);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.contentApplicationId).toEqual(scheduledJobAppId);
    });
  });

  describe('#checkProcessingLimitsForOrg', function () {
    const mockedGetEngineUsageForOrganization = jest.fn();
    beforeEach(() => {
      _.set(
        serviceContext,
        'coreJob.jobBll.task.getEngineUsageForOrganization',
        mockedGetEngineUsageForOrganization
      );
      dal = require('./job.js')(serviceContext);
    });

    it('should allow engine overage', async function () {
      let err;
      const organization = {
        kvp: { features: { allowEngineOverage: true, engineLimit: 1 } }
      };
      const applicationId = 'applicationId';

      try {
        await dal.checkProcessingLimitsForOrg(organization, applicationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });

    it('should throw error if engine processing is paused for org', async function () {
      let err;
      const organization = {
        organizationId: 7682,
        organizationName: 'orgName',
        kvp: {
          features: {
            allowEngineOverage: false,
            engineLimit: 1
          },
          billing: { pausedProcessing: true }
        }
      };
      const applicationId = 'applicationId';

      try {
        await dal.checkProcessingLimitsForOrg(organization, applicationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual(
          `Engine processing is paused for the organization ${organization.organizationId} ` +
            `(${organization.organizationName}) because usage limits have been ` +
            `exceeded. Purchase more capacity or contact Veritone support to continue.`
        );
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('object_limit_exceeded');
    });

    it('should throw error if invalid billing period - billing still not start', async function () {
      let err;
      const organization = {
        organizationId: 7682,
        organizationName: 'orgName',
        kvp: {
          features: {
            allowEngineOverage: false,
            engineLimit: 1
          },
          billing: {
            pausedProcessing: false,
            startDate: moment().add(1, 'day').toISOString()
          }
        }
      };
      const applicationId = 'applicationId';

      try {
        await dal.checkProcessingLimitsForOrg(organization, applicationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('invalid billing period');
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
    });

    it('should throw error if invalid billing period - billing expirated', async function () {
      let err;
      const organization = {
        organizationId: 7682,
        organizationName: 'orgName',
        kvp: {
          features: {
            allowEngineOverage: false,
            engineLimit: 1
          },
          billing: {
            pausedProcessing: false,
            expirationDate: moment().add(-1, 'day').toISOString()
          }
        }
      };
      const applicationId = 'applicationId';

      try {
        await dal.checkProcessingLimitsForOrg(organization, applicationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('invalid billing period');
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
    });

    it('should throw error if engine limit exceeded', async function () {
      let err;
      const organization = {
        organizationId: 7682,
        organizationName: 'orgName',
        kvp: {
          features: {
            allowEngineOverage: false,
            engineLimit: 2
          },
          billing: {
            pausedProcessing: false
          }
        }
      };
      const applicationId = 'applicationId';

      // mock coreJobBll.task.getEngineUsageForOrganization
      mockedGetEngineUsageForOrganization.mockImplementation(
        (applicationId, organization, engine, cb) => {
          return cb(null, { totalCost: 201 });
        }
      );

      try {
        await dal.checkProcessingLimitsForOrg(organization, applicationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('engine limit exceeded');
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('object_limit_exceeded');
    });

    it('should pass the check', async function () {
      let err;
      const organization = {
        organizationId: 7682,
        organizationName: 'orgName',
        kvp: {
          features: {
            allowEngineOverage: false,
            engineLimit: 2
          },
          billing: {
            pausedProcessing: false
          }
        }
      };
      const applicationId = 'applicationId';

      // mock coreJobBll.task.getEngineUsageForOrganization
      mockedGetEngineUsageForOrganization.mockImplementation(
        (applicationId, organization, engine, cb) => {
          return cb(null, { totalCost: 199 });
        }
      );

      try {
        await dal.checkProcessingLimitsForOrg(organization, applicationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
  });

  describe('#parseStandbyTasksForTask', function () {
    it('should parse standby tasks', function () {
      let res, err;
      const task = { jobId: '19125116_eaytb1lJsh', standby: {} };

      try {
        res = dal.parseStandbyTasksForTask(task, 0);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(res.length).toEqual(1);
      expect(res[0].jobId).toEqual('19125116_eaytb1lJsh');
      expect(res[0].taskStatus).toEqual('standby_pending');
    });
  });

  describe('#populateTaskWithEngineBuildInfo', function () {
    it('should return if input the test task', async function () {
      let res, err;
      const task = { engineId: 'engineId', testTask: true };
      const requestorOrganizationId = {};
      const context = mockUtil.getGraphQLContext('user');

      // mock serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([{ id: 'engineId' }]);

      try {
        res = await dal.populateTaskWithEngineBuildInfo(
          task,
          requestorOrganizationId,
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeUndefined();
    });

    it('should throw error if no access to the build', async function () {
      let res, err;
      const task = { engineId: 'engineId', buildId: 'buildId' };
      const requestorOrganizationId = '7682';
      const context = mockUtil.getGraphQLContext('user');

      // mock serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: 'engineId', owner_organization_id: '1234' }
      ]);

      try {
        res = await dal.populateTaskWithEngineBuildInfo(
          task,
          requestorOrganizationId,
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('no access to build');
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
      expect(err.data.objectType).toEqual('buildId');
      expect(err.data.objectData).toEqual('buildId');
    });

    it('should not throw an error when supper admin access to the build', async function () {
      let err;
      const task = { engineId: 'engineId', buildId: 'buildId' };
      const requestorOrganizationId = '7682';
      const context = mockUtil.getGraphQLContext('user');
      _.set(context, '_authInfo.permissionMasks', [
        -2,
        268427519,
        1073741824,
        5189619
      ]);

      // mock serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          owner_organization_id: '1234',
          category_id: 'categoryId'
        }
      ]);
      // mock serviceContext.dal.engine.getEngineBuild
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId', status: 'deployed' }
      ]);
      // mock serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineAliasId']
          }
        ],
        false
      );

      try {
        await dal.populateTaskWithEngineBuildInfo(
          task,
          requestorOrganizationId,
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(task.build).toBeDefined();
      expect(task.category).toBeDefined();
      expect(task.engineCategoryId).toEqual('categoryId');
    });

    it('should populate the task with engine build info', async function () {
      let err;
      const task = { engineId: 'engineId', buildId: 'buildId' };
      const requestorOrganizationId = '7682';
      const context = mockUtil.getGraphQLContext('user');

      // mock serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          owner_organization_id: '7682',
          category_id: 'categoryId'
        }
      ]);
      // mock serviceContext.dal.engine.getEngineBuild
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId', status: 'deployed' }
      ]);
      // mock serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineAliasId']
          }
        ],
        false
      );

      try {
        await dal.populateTaskWithEngineBuildInfo(
          task,
          requestorOrganizationId,
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(task.build).toBeDefined();
      expect(task.category).toBeDefined();
      expect(task.engineCategoryId).toEqual('categoryId');
    });

    it('should throw error if could not find active build for engine', async function () {
      let err;
      const task = { engineId: 'engineId' };
      const requestorOrganizationId = '7682';
      const context = mockUtil.getGraphQLContext('user');

      // mock serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          owner_organization_id: '7682',
          category_id: 'categoryId'
        }
      ]);
      // mock serviceContext.dal.engine.getEngineBuilds
      serviceContext.dbConnections['core'].read._push([]);
      // mock serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineAliasId']
          }
        ],
        false
      );

      try {
        await dal.populateTaskWithEngineBuildInfo(
          task,
          requestorOrganizationId,
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual(
          `could not find active deployed build for engine ${task.engineId}`
        );
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(err.data.objectType).toEqual('engineId');
      expect(err.data.objectData).toEqual(task.engineId);
    });

    it('should populate the task with active engine build info', async function () {
      let err;
      const task = { engineId: 'engineId' };
      const requestorOrganizationId = '7682';
      const context = mockUtil.getGraphQLContext('user');

      // mock serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          owner_organization_id: '7682',
          category_id: 'categoryId'
        }
      ]);
      // mock serviceContext.dal.engine.getEngineBuild
      serviceContext.dbConnections['core'].read._push([{ id: 'buildId' }]);
      // mock serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineAliasId']
          }
        ],
        false
      );

      try {
        await dal.populateTaskWithEngineBuildInfo(
          task,
          requestorOrganizationId,
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(task.build).toBeDefined();
      expect(task.category).toBeDefined();
      expect(task.engineCategoryId).toEqual('categoryId');
    });

    it('should reassign internalId to task when input engineId is aliasId', async function () {
      let err;
      const task = { engineId: 'aliasId' };
      const requestorOrganizationId = '7682';
      const context = mockUtil.getGraphQLContext('user');

      // mock serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          owner_organization_id: '7682',
          category_id: 'categoryId',
          alias_id: 'aliasId'
        }
      ]);
      // mock serviceContext.dal.engine.getEngineBuild
      serviceContext.dbConnections['core'].read._push([{ id: 'buildId' }]);
      // mock serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineAliasId']
          }
        ],
        false
      );

      try {
        await dal.populateTaskWithEngineBuildInfo(
          task,
          requestorOrganizationId,
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(task.engineId).toEqual('engineId');
    });
  });

  describe('#createJobDb', function () {
    it('should create job without transaction', async function () {
      let res, err;
      const job = { jobId: '19125116_eaytb1lJsh' };

      // mock createJobDb
      serviceContext.dbConnections['core'].write._push([
        { job_id: '19125116_eaytb1lJsh' }
      ]);

      try {
        res = await dal.createJobDb(job);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(res.jobId).toEqual('19125116_eaytb1lJsh');
      expect(res.id).toEqual('19125116_eaytb1lJsh');
    });

    it('should create job with a transaction', async function () {
      let res, err;
      const job = { jobId: '19125116_eaytb1lJsh' };

      // mock createJobDb
      serviceContext.dbConnections['core'].write._push([
        { job_id: '19125116_eaytb1lJsh' }
      ]);

      try {
        res = await dal.createJobDb(
          job,
          serviceContext.dbConnections['core'].write
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(res.jobId).toEqual('19125116_eaytb1lJsh');
      expect(res.id).toEqual('19125116_eaytb1lJsh');
    });
  });

  describe('#generateJobTablePartition', function () {
    it('should return the default job table', function () {
      let res, err;
      const jobId = 'jobId';

      try {
        res = dal.generateJobTablePartition(jobId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(res).toEqual('job_new.job');
    });

    it('should return specific job table partition', function () {
      let res, err;
      const jobId = '19125116_eaytb1lJsh';

      try {
        res = dal.generateJobTablePartition(jobId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(res).toEqual('job_new.job_2019_12_51');
    });
  });

  describe('#updateJobStatus', function () {
    it('should update job status without transaction', async function () {
      let res, err;
      const jobId = '19125116_eaytb1lJsh';
      const status = 'pending';

      // mock DB update result
      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.updateJobStatus(jobId, status);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
    });

    it('should update job status with a transaction', async function () {
      let res, err;
      const jobId = '19125116_eaytb1lJsh';
      const status = 'pending';

      // mock DB update result
      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.updateJobStatus(
          jobId,
          status,
          serviceContext.dbConnections['core'].write
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
    });
    it('should update job status and job audit', async function () {
      let res, err;
      const jobId = '19125116_eaytb1lJsh';
      const status = 'pending';

      // mock DB update result
      serviceContext.dbConnections['core'].write._push([]);
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        ['job_audit'],
        (sql, params) => {
          expect(params[2]).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
          return true;
        }
      );

      try {
        res = await dal.updateJobStatus(
          jobId,
          status,
          serviceContext.dbConnections['core'].write,
          mockUtil.makeContext()
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
    });
  });

  describe('#getCompletedJobsForRecording', function () {
    it('should throw error if missing tdoId input', async function () {
      let res, err;

      try {
        res = await dal.getCompletedJobsForRecording();
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('tdoId is required');
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(err.data.objectType).toEqual('tdoId');
      expect(err.data.objectData).toBeUndefined();
    });

    it('should get jobs for recording', async function () {
      let res, err;
      const tdoId = 'tdoId';

      // mock DB query result
      serviceContext.dbConnections['core'].read._push([
        { job_id: 'jobId', recording_id: 'tdoId' }
      ]);

      try {
        res = await dal.getCompletedJobsForRecording(tdoId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(res.count).toEqual(1);
      expect(res.records.length).toEqual(1);
      expect(res.records[0].id).toEqual('jobId');
      expect(res.records[0].targetId).toEqual('tdoId');
    });
  });

  describe('#generateTaskId', function () {
    it('should generate task id', function () {
      let res, err;

      try {
        res = dal.generateTaskId('19125116_eaytb1lJsh');
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(_.includes(res, '19125116_eaytb1lJsh')).toEqual(true);
    });

    it('should generate task id - with invalid dateId for job', function () {
      let res, err;

      try {
        res = dal.generateTaskId('jobId');
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(_.includes(res, 'jobId')).toEqual(true);
    });
  });

  describe('#createJobAudit', function () {
    it('should throw error if job or action is missing', async () => {
      let err;

      try {
        await dal.createJobAudit(mockUtil.makeContext());
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });
    it('should throw error if action is invalid', async () => {
      let err;

      try {
        await dal.createJobAudit(
          mockUtil.makeContext(),
          'jobId',
          'incorrect-action'
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });
    it('should create job audit', async () => {
      let err;
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        ['job_audit'],
        (sql, params) => {
          expect(params[0]).toEqual('19041617_2tLSStmCX9');
          expect(params[1]).toEqual(1);
          expect(params[2]).toEqual('create');
          expect(params[3]).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
          return true;
        }
      );
      try {
        await dal.createJobAudit(
          mockUtil.makeContext(),
          '19041617_2tLSStmCX9',
          'create',
          { organizationId: 1 }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });

    it('should create job audit with some options', async () => {
      let err;
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        ['job_audit'],
        (sql, params) => {
          expect(params[0]).toEqual('19041617_2tLSStmCX9');
          expect(params[1]).toEqual(
            expect.objectContaining({
              status: 'running'
            })
          );
          expect(params[2]).toEqual(1);
          expect(params[3]).toEqual('create');
          expect(params[4]).toEqual('actor-id');
          return true;
        }
      );
      try {
        await dal.createJobAudit(
          mockUtil.makeContext(),
          '19041617_2tLSStmCX9',
          'create',
          {
            actor: 'actor-id',
            actionParams: {
              status: 'running'
            },
            organizationId: 1
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });

    it('should create job audit via internal token', async () => {
      let err;
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        ['job_audit'],
        (sql, params) => {
          expect(params[0]).toEqual('19041617_2tLSStmCX9');
          expect(params[1]).toEqual(1);
          expect(params[2]).toEqual('create');
          expect(params[3]).toEqual('00000000-0000-0000-0000-000000000000');
          return true;
        }
      );
      try {
        await dal.createJobAudit(
          mockUtil.makeContext({ authType: 'api_internal' }),
          '19041617_2tLSStmCX9',
          'create',
          { organizationId: 1 }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
  });

  describe('#getJobAudit()', function () {
    it('should throw error if missing jobId', async () => {
      let res, error;
      try {
        res = await dal.getJobAudit(makeContext(), {});
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.name).toEqual('invalid_input');
    });
    it('should throw error if action is invalid', async () => {
      let res, error;
      try {
        res = await dal.getJobAudit(makeContext(), {
          action: 'incorrect-action'
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.name).toEqual('invalid_input');
    });
    it('should get job audits', async function () {
      const jobId = '19041617_2tLSStmCX9';
      const actor = 'actor-id';
      const action = 'create';

      coreDbRead._push(
        [
          {
            id: 'audit-id'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(sql).toMatch(/job_id\s=/);
          expect(sql).toMatch(/actor\s=/);
          expect(sql).toMatch(/action\s=/);
          expect(params[0]).toEqual('19041617_2tLSStmCX9');
          expect(params[1]).toEqual('actor-id');
          expect(params[2]).toEqual('create');

          return true;
        }
      );

      const res = await dal.getJobAudit(makeContext(), {
        jobId,
        actor,
        action,
        orderBy: {
          field: 'timestamp',
          direction: 'DESC'
        }
      });
      expect(res).toBeDefined();
      expect(res.records.length).toEqual(1);
    });
  });
});
function mockGetDagTemplates() {
  // serviceContext.bll.dagTemplate.getDagTemplate
  serviceContext.bll.dagTemplate.getDagTemplate.mockReturnValueOnce({
    dag: {
      template: {
        id: 'id',
        name: 'name'
      }
    },
    dagTemplateLanguage: 'Handlebars'
  });
}
