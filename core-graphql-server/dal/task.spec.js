const _ = require('lodash');
const moment = require('moment');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
let dal;
let context;
const coreDbWrite = serviceContext.dbConnections['core'].write;
const coreDbRead = serviceContext.dbConnections['core'].read;
const mockPartitionTable = require('../test/partitionTable.mock.js')(
  serviceContext
);

describe('task.js', function () {
  beforeAll(() => {
    dal = require('./task.js')(serviceContext);
  });

  beforeEach(() => {
    context = mockUtil.makeContext();
    _.set(
      context,
      '_authInfo.organization.kvp.features.useNewUpdateTask',
      true
    );
  });

  describe('#require', function () {
    it('should load module', async function () {
      const test = dal;
      expect(typeof test).toEqual('object');
      expect(Object.keys(test).length).toEqual(16);
      expect(typeof test.getTask).toEqual('function');
      expect(typeof test.getTasks).toEqual('function');
      expect(typeof test.updateTask).toEqual('function');
      expect(typeof test.addTasksToJobs).toEqual('function');
      expect(typeof test.isClientTimestampStale).toEqual('function');
      expect(typeof test.getStandbyTask).toEqual('function');
      expect(typeof test.appendWarningToTask).toEqual('function');
      expect(typeof test.updateAssetSizeOnTaskComplete).toEqual('function');
    });
  });

  // The Task resolvers gate the failure fields on `status`, which writes only carry because of
  // this backfill. Losing it fails silently — a failed task reporting no reason — so pin it.
  describe('mapTask status backfill', function () {
    const mapper = require('./mapper.js');

    it('derives status from a write RETURNING task_status', function () {
      const res = mapper.mapTask({
        task_id: mockUtil.toTaskId('job123_123'),
        task_status: 'failed',
        task_output: { failureReason: 'url_not_found' }
      });
      expect(res.status).toEqual('failed');
    });

    it('leaves an explicit status alone', function () {
      const res = mapper.mapTask({
        task_id: mockUtil.toTaskId('job123_123'),
        status: 'aborted',
        task_status: 'failed'
      });
      expect(res.status).toEqual('aborted');
    });
  });

  describe('#getTask', function () {
    it('should not_found on empty task ID', async function () {
      try {
        await dal.getTask(context, { id: '' });
        throw new Error('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });

    it('should error on no task ID', async function () {
      try {
        await dal.getTask(context, {});
        throw new Error('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
  });

  describe('#getTasks', function () {
    it('should get tasks by cluster ID with default date/time filter', async function () {
      coreDbRead._push(
        [
          {
            id: mockUtil.toTaskId('t123'),
            engine_id: 'e123'
          }
        ],
        true,
        [
          '>',
          'created_date_time',
          '<',
          'BETWEEN',
          'cluster_id',
          'job_id',
          'JOIN'
        ]
      );
      const res = await dal.getTasks(context, {
        clusterId: 'clusterOne'
      });
    });
    it('should get tasks by cluster ID with explicit date/time filter', async function () {
      coreDbRead._push(
        [
          {
            id: mockUtil.toTaskId('t123'),
            engine_id: 'e123'
          }
        ],
        true,
        [
          '>',
          'created_date_time >',
          'modified_date_time',
          '<',
          'BETWEEN',
          'cluster_id',
          'job_id',
          'JOIN'
        ]
      );

      const res = await dal.getTasks(context, {
        clusterId: 'clusterOne',
        dateTimeFilter: [
          {
            field: 'modifiedDateTime',
            fromDateTime: moment().subtract(7, 'days').toISOString()
          },
          {
            field: 'modifiedDateTime',
            toDateTime: moment().toISOString()
          }
        ]
      });
    });
    it('should get tasks by tdo ID order with paging, ordering, DateTimeFilter arguments ', async function () {
      // get tdo by args input targetId
      coreDbRead._push([
        {
          id: '123'
        }
      ]);
      // get tasks by tdo
      coreDbRead._push(
        [
          {
            id: mockUtil.toTaskId('t123'),
            target_id: '123'
          },
          {
            id: mockUtil.toTaskId('t123'),
            target_id: '123'
          }
        ],
        true,
        [
          'LIMIT',
          'OFFSET',
          'ORDER BY',
          'created_date_time',
          'modified_date_time',
          'completed_date_time',
          'queued_date_time',
          '>',
          '<',
          'BETWEEN'
        ]
      );
      const res = await dal.getTasks(context, {
        targetId: '123',
        offset: 0,
        limit: 10,
        orderBy: [
          { field: 'createdDateTime', direction: 'asc' },
          { field: 'modifiedDateTime', direction: 'desc' },
          { field: 'completedDateTime', direction: 'asc' },
          { field: 'queuedDateTime', direction: 'desc' }
        ],
        dateTimeFilter: [
          {
            field: 'modifiedDateTime',
            fromDateTime: moment().subtract(7, 'days').toISOString()
          },
          {
            field: 'modifiedDateTime',
            toDateTime: moment().toISOString()
          }
        ]
      });
    });
  });

  describe('#updateTask', function () {
    it('should error out if status not failed but user sent failureMessage', async function () {
      try {
        await dal.updateTask(context, {
          input: {
            id: mockUtil.toTaskId('job123_123'),
            status: 'complete',
            failureMessage: 'hi I failed'
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should error out if status not failed but user sent failureReason', async function () {
      try {
        await dal.updateTask(context, {
          input: {
            id: mockUtil.toTaskId('job123_123'),
            status: 'complete',
            failureReason: 'url_not_found'
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should append a warning to a task', async function () {
      coreDbRead._push([{ id: mockUtil.toTaskId('t123') }]);
      const id = await dal.appendWarningToTask(context, {
        input: {
          taskId: mockUtil.toTaskId('t123'),
          reason: 'hello',
          message: 'world',
          referenceId: 'ref_1010'
        }
      });
      expect(mockUtil.fromTaskId(id)).toEqual('t123');
    });

    it('should update task with failed and status message', async function () {
      const lDal = require('./task.js')(serviceContext);
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123_123'),
          status: 'running',
          job_id: mockUtil.toTaskId('job123')
        }
      ]);
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'job123'
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123')
        }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 7682
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123_123'),
          status: 'running',
          job_id: mockUtil.toTaskId('job123')
        },
        {
          id: mockUtil.toTaskId('job123_124'),
          status: 'queued',
          job_id: mockUtil.toTaskId('job123')
        }
      ]);
      // updateTaskAtomicallyByStatus
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: mockUtil.toTaskId('job123'),
          task_id: mockUtil.toTaskId('job123_123'),
          task_status: 'failed',
          task_output: {
            failureReason: 'url_not_found',
            failureMessage: 'url http://localhost:3000/whatever was not found'
          },
          modified_date_time: 1625801398,
          completed_date_time: 1625801398
        }
      ]);
      serviceContext.dbConnections['core'].write._push([{}]);
      const res = await lDal.updateTask(context, {
        input: {
          status: 'failed',
          id: mockUtil.toTaskId('job123_123'),
          failureReason: 'url_not_found',
          failureMessage: 'url http://localhost:3000/whatever was not found'
        }
      });
      expect(serviceContext.messageUtil._counter()).toEqual(2);
    });
    it('should update task with aborted and status message', async function () {
      const lDal = require('./task.js')(serviceContext);
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123_123'),
          status: 'running',
          job_id: mockUtil.toTaskId('job123')
        }
      ]);
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'job123'
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123')
        }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 7682
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123_123'),
          status: 'running',
          job_id: mockUtil.toTaskId('job123')
        },
        {
          id: mockUtil.toTaskId('job123_124'),
          status: 'queued',
          job_id: mockUtil.toTaskId('job123')
        }
      ]);
      // updateTaskAtomicallyByStatus
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: mockUtil.toTaskId('job123'),
          task_id: mockUtil.toTaskId('job123_123'),
          task_status: 'aborted',
          task_output: {
            failureReason: 'url_not_found',
            failureMessage: 'url http://localhost:3000/whatever was not found'
          },
          modified_date_time: 1625801398,
          completed_date_time: 1625801398
        }
      ]);
      serviceContext.dbConnections['core'].write._push([{}]);
      const res = await lDal.updateTask(context, {
        input: {
          status: 'aborted',
          id: mockUtil.toTaskId('job123_123'),
          failureReason: 'url_not_found',
          failureMessage: 'url http://localhost:3000/whatever was not found'
        }
      });
      expect(serviceContext.messageUtil._counter()).toEqual(2);
    });

    // Edge sends no reason for a cascade abort; Core used to stamp task_validation on those.
    describe('when no failure info is supplied', function () {
      function pushUpdateMocks() {
        serviceContext.dbConnections['core'].read._push([
          {
            id: mockUtil.toTaskId('job123_123'),
            status: 'running',
            job_id: mockUtil.toTaskId('job123')
          }
        ]);
        mockPartitionTable.setMockDBToCheckTablePartition(
          serviceContext,
          'job123'
        );
        serviceContext.dbConnections['core'].read._push([
          {
            id: mockUtil.toTaskId('job123')
          }
        ]);
        serviceContext.dbConnections['sso'].read._push([{ id: 7682 }], false);
        serviceContext.dbConnections['core'].read._push([
          {
            id: mockUtil.toTaskId('job123_123'),
            status: 'running',
            job_id: mockUtil.toTaskId('job123')
          }
        ]);
        serviceContext.dbConnections['core'].write._push([
          {
            job_id: mockUtil.toTaskId('job123'),
            task_id: mockUtil.toTaskId('job123_123'),
            task_status: 'aborted',
            modified_date_time: 1625801398,
            completed_date_time: 1625801398
          }
        ]);
        serviceContext.dbConnections['core'].write._push([{}]);
      }

      it.each(['aborted', 'failed'])(
        'writes no failure fields for a %s task',
        async function (status) {
          const lDal = require('./task.js')(serviceContext);
          pushUpdateMocks();
          const args = {
            input: { status, id: mockUtil.toTaskId('job123_123') }
          };

          await lDal.updateTask(context, args);

          expect(args.input.output).toBeUndefined();
        }
      );

      // A Go sender marshals an absent field as "", which TaskFailureReason cannot serialize —
      // persisting it would break every later read of the task.
      it('drops empty failure placeholders instead of persisting them', async function () {
        const lDal = require('./task.js')(serviceContext);
        pushUpdateMocks();
        const args = {
          input: {
            status: 'aborted',
            id: mockUtil.toTaskId('job123_123'),
            output: { failureReason: '', failureMessage: '' }
          }
        };

        await lDal.updateTask(context, args);

        expect(args.input.output).toBeUndefined();
      });

      it('drops empty failure placeholders but keeps real output alongside them', async function () {
        const lDal = require('./task.js')(serviceContext);
        pushUpdateMocks();
        const args = {
          input: {
            status: 'aborted',
            id: mockUtil.toTaskId('job123_123'),
            output: { failureReason: '', hostId: 'ip-10-22-136-143' }
          }
        };

        await lDal.updateTask(context, args);

        expect(args.input.output).toEqual({ hostId: 'ip-10-22-136-143' });
      });

      it('treats edge\'s "none" sentinel as no failure', async function () {
        const lDal = require('./task.js')(serviceContext);
        pushUpdateMocks();
        const args = {
          input: {
            status: 'aborted',
            id: mockUtil.toTaskId('job123_123'),
            failureReason: 'none'
          }
        };

        await lDal.updateTask(context, args);

        expect(args.input.output).toBeUndefined();
      });

      it('preserves real engine output on a failed task', async function () {
        const lDal = require('./task.js')(serviceContext);
        pushUpdateMocks();
        const args = {
          input: {
            status: 'failed',
            id: mockUtil.toTaskId('job123_123'),
            output: { url: 'https://example.com/media.mp4', read: 8552684 }
          }
        };

        await lDal.updateTask(context, args);

        expect(args.input.output).toEqual({
          url: 'https://example.com/media.mp4',
          read: 8552684
        });
      });

      it('still stores a failureReason sent alongside an aborted status', async function () {
        const lDal = require('./task.js')(serviceContext);
        pushUpdateMocks();
        const args = {
          input: {
            status: 'aborted',
            id: mockUtil.toTaskId('job123_123'),
            failureReason: 'other',
            failureMessage: 'edge failureReason=none: parent-task-failed'
          }
        };

        await lDal.updateTask(context, args);

        expect(args.input.output).toEqual({
          failureReason: 'other',
          failureMessage: 'edge failureReason=none: parent-task-failed',
          isUnknownFailureType: false
        });
      });
    });

    // These assert the emitted SQL rather than the mutated input because the SQL is the fix: the
    // strip rides inside the guarded UPDATE, so it neither reads-then-writes the column nor
    // applies when the transition is rejected.
    describe('when a task leaves a failure state', function () {
      // Spelled out literally so a change to the key list has to be made deliberately in both
      // places.
      const STRIP_SQL =
        "task_output = task_output - 'failureReason' - 'failureMessage' - 'isUnknownFailureType'";

      // Mirrors pushUpdateMocks above, but the stored task is `failed` — the state a requeue moves
      // out of.
      function pushFailedTaskMocks() {
        const failedRow = {
          id: mockUtil.toTaskId('job123_123'),
          status: 'failed',
          job_id: mockUtil.toTaskId('job123')
        };
        serviceContext.dbConnections['core'].read._push([failedRow]);
        mockPartitionTable.setMockDBToCheckTablePartition(
          serviceContext,
          'job123'
        );
        serviceContext.dbConnections['core'].read._push([
          { id: mockUtil.toTaskId('job123') }
        ]);
        serviceContext.dbConnections['sso'].read._push([{ id: 7682 }], false);
        serviceContext.dbConnections['core'].read._push([failedRow]);
        serviceContext.dbConnections['core'].write._push([
          {
            job_id: mockUtil.toTaskId('job123'),
            task_id: mockUtil.toTaskId('job123_123'),
            task_status: 'running',
            modified_date_time: 1625801398
          }
        ]);
        serviceContext.dbConnections['core'].write._push([{}]);
      }

      // spyOn calls through, so the mock still serves its queued rows. `one` is the status-change
      // path, `map` the plain-update one.
      function watchWrites() {
        const write = serviceContext.dbConnections['core'].write;
        const spies = [
          jest.spyOn(write, 'one'),
          jest.spyOn(write, 'map')
        ];
        return {
          statements: () =>
            spies.flatMap((spy) => spy.mock.calls.map((call) => call[0])),
          values: () =>
            spies.flatMap((spy) => spy.mock.calls.map((call) => call[1])),
          restore: () => spies.forEach((spy) => spy.mockRestore())
        };
      }

      it('strips the failure keys in the same statement as the status change', async function () {
        const lDal = require('./task.js')(serviceContext);
        pushFailedTaskMocks();
        const watch = watchWrites();

        try {
          await lDal.updateTask(context, {
            input: { status: 'running', id: mockUtil.toTaskId('job123_123') }
          });

          const stripping = watch
            .statements()
            .filter((sql) => sql.includes(STRIP_SQL));
          expect(stripping).toHaveLength(1);
          // The guard is what makes the strip safe: the strip rides along on the status change, so
          // a transition the WHERE rejects leaves the stored reason intact.
          expect(stripping[0]).toContain('task_status IN (');
        } finally {
          watch.restore();
        }
      });

      // Targeted key removal, so the rest of task_output survives without the module reading it.
      it('never sends task_output as a bound parameter when stripping', async function () {
        const lDal = require('./task.js')(serviceContext);
        pushFailedTaskMocks();
        const watch = watchWrites();

        try {
          await lDal.updateTask(context, {
            input: { status: 'queued', id: mockUtil.toTaskId('job123_123') }
          });

          expect(
            watch.statements().some((sql) => sql.includes(STRIP_SQL))
          ).toBe(true);
          // A read-modify-write would show up here as a task_output object in the bound args.
          expect(watch.statements().join('\n')).not.toContain('task_output = $');
        } finally {
          watch.restore();
        }
      });

      it('does not strip when the caller supplies its own output', async function () {
        const lDal = require('./task.js')(serviceContext);
        pushFailedTaskMocks();
        const watch = watchWrites();

        try {
          await lDal.updateTask(context, {
            input: {
              status: 'running',
              id: mockUtil.toTaskId('job123_123'),
              output: { hostId: 'ip-10-22-136-143' }
            }
          });

          // a supplied output already dropped the stale keys; emitting both is a self-assignment
          expect(watch.statements().join('\n')).not.toContain(STRIP_SQL);
          expect(watch.values().flat()).toContainEqual({
            hostId: 'ip-10-22-136-143'
          });
        } finally {
          watch.restore();
        }
      });

      // No status is not a transition: the task is still failed, so its failure fields are live.
      it('does not strip on a plain update that carries no status', async function () {
        const lDal = require('./task.js')(serviceContext);
        pushFailedTaskMocks();
        const watch = watchWrites();

        try {
          await lDal.updateTask(context, {
            input: {
              id: mockUtil.toTaskId('job123_123'),
              executionLocationData: { some: 'data' }
            }
          });

          expect(watch.statements().join('\n')).not.toContain(STRIP_SQL);
        } finally {
          watch.restore();
        }
      });

      // The strip must not cost a write when the update is short-circuited before one happens.
      it('still short-circuits on a stale client timestamp', async function () {
        const lDal = require('./task.js')(serviceContext);
        serviceContext.dbConnections['core'].read._push([
          {
            id: mockUtil.toTaskId('job123_123'),
            status: 'failed',
            job_id: mockUtil.toTaskId('job123'),
            modified_date_time: moment('2026-08-13T00:00:00Z').unix()
          }
        ]);
        const watch = watchWrites();

        try {
          const res = await lDal.updateTask(context, {
            input: {
              status: 'running',
              id: mockUtil.toTaskId('job123_123'),
              clientTimestamp: '2026-08-12T00:00:00Z'
            }
          });

          expect(res.status).toEqual('failed');
          expect(watch.statements()).toHaveLength(0);
        } finally {
          watch.restore();
        }
      });
    });

    // Coercion to task_validation is forced by enum serialization, but must not be silent, or
    // sender enum drift stays invisible.
    describe('when the sender reports a reason outside the enum', function () {
      it('logs a warning naming the offending value and the task', async function () {
        const lDal = require('./task.js')(serviceContext);
        const warn = jest.spyOn(serviceContext.logger, 'warn');
        serviceContext.dbConnections['core'].read._push([
          {
            id: mockUtil.toTaskId('job123_123'),
            status: 'running',
            job_id: mockUtil.toTaskId('job123')
          }
        ]);
        mockPartitionTable.setMockDBToCheckTablePartition(
          serviceContext,
          'job123'
        );
        serviceContext.dbConnections['core'].read._push([
          { id: mockUtil.toTaskId('job123') }
        ]);
        serviceContext.dbConnections['sso'].read._push([{ id: 7682 }], false);
        serviceContext.dbConnections['core'].read._push([
          {
            id: mockUtil.toTaskId('job123_123'),
            status: 'running',
            job_id: mockUtil.toTaskId('job123')
          }
        ]);
        serviceContext.dbConnections['core'].write._push([
          {
            job_id: mockUtil.toTaskId('job123'),
            task_id: mockUtil.toTaskId('job123_123'),
            task_status: 'failed',
            modified_date_time: 1625801398
          }
        ]);
        serviceContext.dbConnections['core'].write._push([{}]);
        const args = {
          input: {
            status: 'failed',
            id: mockUtil.toTaskId('job123_123'),
            failureReason: 'engine_exploded'
          }
        };

        try {
          await lDal.updateTask(context, args);

          const drift = warn.mock.calls.find((call) =>
            call[0].includes('unrecognised failureReason')
          );
          expect(drift).toBeDefined();
          expect(drift[0]).toContain(mockUtil.toTaskId('job123_123'));
          // The reported value rides in the meta object, never the format string — it is
          // caller-controlled, so a `%j` in it would eat winston's own meta argument.
          expect(drift[0]).not.toContain('engine_exploded');
          expect(drift[1]).toEqual({ failureReason: 'engine_exploded' });
          // still coerced, so the stored value stays enum-serializable
          expect(args.input.output).toEqual({
            failureReason: 'task_validation',
            failureMessage: `The failureReason doesn't match with any of taskFailureEnum values.`,
            isUnknownFailureType: true
          });
        } finally {
          warn.mockRestore();
        }
      });
    });

    it('should generate one recording event when completed with TDO', async function () {
      let recordingEvents = 0;
      _.set(serviceContext, 'messageUtil.emitEvent', (event) => {
        if (event.type === 'recording') {
          recordingEvents++;
        }
      });
      _.set(serviceContext, 'messageUtil.emitPublicEvent', (event) => {
        if (event.type === 'recording') {
          recordingEvents++;
        }
      });
      const lDal = require('./task.js')(serviceContext);
      // Add a task in job_new.task table
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123_123'),
          status: 'running',
          recordingId: 'recording123',
          job_id: mockUtil.toTaskId('job123')
        }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 7682
          }
        ],
        false
      );
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'job123'
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123_123'),
          status: 'running',
          recordingId: 'recording123',
          job_id: mockUtil.toTaskId('job123')
        }
      ]);
      // updateTaskAtomicallyByStatus
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: '21072707_job123',
          task_id: mockUtil.toTaskId('job123_123'),
          task_status: 'complete',
          engine_id: '777268aa-1c86-4a7d-b967-9dc515aa15fb',
          recording_id: 'recording123',
          media_length_secs: 1000,
          modified_date_time: 1625798751,
          completed_date_time: 1625798751
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          id: mockUtil.toTaskId('job123_123'),
          job_id: '21072707_job123',
          status: 'complete'
        }
      ]);

      //---- Start function serviceContext.bll.job.updateOrgBillingForTask
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([{}]);
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
      // populateEngineForTask -> get engine
      serviceContext.dbConnections['core'].read._push([
        { id: '777268aa-1c86-4a7d-b967-9dc515aa15fb' }
      ]);
      // updateOrgBillingMetrics
      serviceContext.dbConnections['media_platform'].read._push([{ id: 7682 }]);
      // incrementMonthlyCharge
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 7682, monthly_current_charge: 10 }
      ]);
      // setOrgRemainingBudget
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 7682, remaining_budget: 100, is_limit_enforced: true }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      await lDal.updateTask(context, {
        input: {
          id: mockUtil.toTaskId('job123_123'),
          status: 'complete'
        },
        organizationId: 7682
      });

      expect(recordingEvents).toEqual(1);
    });
    it('should not generate recording event when completed without TDO', async function () {
      let recordingEvents = 0;
      _.set(serviceContext, 'messageUtil.emitEvent', (event) => {
        if (event.type === 'recording') {
          recordingEvents++;
        }
      });
      _.set(serviceContext, 'messageUtil.emitPublicEvent', (event) => {
        if (event.type === 'recording') {
          recordingEvents++;
        }
      });
      const lDal = require('./task.js')(serviceContext);
      // Add a task in job_new.task table
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123_123'),
          status: 'running',
          job_id: mockUtil.toTaskId('job123')
        }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 7682
          }
        ],
        false
      );
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'job123'
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123_123'),
          status: 'running',
          job_id: mockUtil.toTaskId('job123')
        }
      ]);
      // updateTaskAtomicallyByStatus
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: mockUtil.toTaskId('job123'),
          task_id: mockUtil.toTaskId('job123_123'),
          task_status: 'complete',
          engine_id: '777268aa-1c86-4a7d-b967-9dc515aa15fb',
          media_length_secs: 1000,
          modified_date_time: 1625798751,
          completed_date_time: 1625798751
        }
      ]);
      serviceContext.dbConnections['core'].write._push([{}]);

      await lDal.updateTask(context, {
        input: {
          id: mockUtil.toTaskId('job123_123'),
          status: 'complete'
        }
      });
      expect(recordingEvents).toEqual(0);
    });
    it('should not generate recording event when aborted', async function () {
      let recordingEvents = 0;
      _.set(serviceContext, 'messageUtil.emitEvent', (event) => {
        if (event.type === 'recording') {
          recordingEvents++;
        }
      });
      _.set(serviceContext, 'messageUtil.emitPublicEvent', (event) => {
        if (event.type === 'recording') {
          recordingEvents++;
        }
      });
      const lDal = require('./task.js')(serviceContext);
      // Add a task in job_new.task table
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123_123'),
          status: 'running',
          job_id: mockUtil.toTaskId('job123')
        }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 7682
          }
        ],
        false
      );
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'job123'
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('job123_123'),
          status: 'running',
          job_id: mockUtil.toTaskId('job123')
        }
      ]);
      // updateTaskAtomicallyByStatus
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: mockUtil.toTaskId('job123'),
          task_id: mockUtil.toTaskId('job123_123'),
          task_status: 'aborted',
          engine_id: '777268aa-1c86-4a7d-b967-9dc515aa15fb',
          modified_date_time: 1625798751,
          completed_date_time: 1625798751
        }
      ]);
      serviceContext.dbConnections['core'].write._push([{}]);

      await lDal.updateTask(context, {
        input: {
          id: mockUtil.toTaskId('job123_123'),
          status: 'aborted'
        }
      });
      expect(recordingEvents).toEqual(0);
    });
  });

  describe('#updateTaskLog', function () {
    it('should update task log, by taskId', async function () {
      let res, err;
      const options = {
        taskId: mockUtil.toTaskId('taskId'),
        taskLog: 'taskLog'
      };

      serviceContext.dbConnections['core'].write._push([
        { task_id: mockUtil.toTaskId('taskId'), task_log: 'taskLog' }
      ]);

      try {
        res = await dal.updateTaskLog(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(mockUtil.fromTaskId(res.task_id)).toEqual('taskId');
      expect(res.task_log).toEqual('taskLog');
    });
  });

  describe('#getOrgAndAppByTask', function () {
    it('should get org and app by taskId', async function () {
      let res, err;
      const taskId = mockUtil.toTaskId('taskId');

      serviceContext.dbConnections['core'].read._push([
        { application_id: 'applicationId' }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);

      try {
        res = await dal.getOrgAndAppByTask(taskId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res.applicationId).toEqual('applicationId');
      expect(res.organizationId).toEqual('7682');
    });

    it('should get org and app by taskId, from cache', async function () {
      let res, err, resFromCache;
      const taskId = mockUtil.toTaskId('taskId');

      serviceContext.dbConnections['core'].read._push([
        { application_id: 'applicationId' }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);

      try {
        res = await dal.getOrgAndAppByTask(taskId);
        resFromCache = await dal.getOrgAndAppByTask(taskId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res.applicationId).toEqual('applicationId');
      expect(res.organizationId).toEqual('7682');
      expect(resFromCache.applicationId).toEqual('applicationId');
      expect(resFromCache.organizationId).toEqual('7682');
    });

    it('should get bogus ids, if taskId not found', async function () {
      let res, err;
      const taskId = 'taskId1';

      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.getOrgAndAppByTask(taskId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined;
      expect(res.applicationId).toEqual('00000000-0000-0000-0000-000000000000');
      expect(res.organizationId).toEqual('000');
    });
  });

  describe('#createTasksDb', function () {
    it('should throw error with empty tasks', async function () {
      let res, err;
      const tasks = [];

      try {
        res = await dal.createTasksDb(tasks);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('tasks cannot be empty or null');
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('should throw error if invalid task id', async function () {
      let res, err;
      const tasks = [{ taskId: 'taskId' }];

      try {
        res = await dal.createTasksDb(
          tasks,
          serviceContext.dbConnections['core'].write
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('invalid task ID ' + tasks[0].taskId);
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('should create task successfully', async function () {
      let res, err;
      const tasks = [{ taskId: '19125116_eaytb1lJshbJvgb' }];

      // mock insert task DB
      serviceContext.dbConnections['core'].write._push([
        { id: '19125116_eaytb1lJshbJvgb' }
      ]);

      try {
        res = await dal.createTasksDb(
          tasks,
          serviceContext.dbConnections['core'].write
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(res[0].id).toEqual('19125116_eaytb1lJshbJvgb');
    });

    it('emits one value per column per task and carries source_asset_id (null when unset)', async function () {
      const { TASK_INSERT_COLUMNS } = require('./task.js');
      const tasks = [
        { taskId: '19125116_eaytb1lJshbJvgb', sourceAssetId: 'asset-master' },
        { taskId: '19125116_eaytb1lJshEMpv4' }
      ];
      const columnList = `(${TASK_INSERT_COLUMNS.map(([column]) => column).join(', ')})`;
      let seen;
      serviceContext.dbConnections['core'].write._push(
        [{ id: tasks[0].taskId }, { id: tasks[1].taskId }],
        true,
        ['source_asset_id'],
        (sql, args) => {
          seen = { sql, args };
          return true;
        }
      );

      const res = await dal.createTasksDb(
        tasks,
        serviceContext.dbConnections['core'].write
      );

      expect(res).toHaveLength(2);
      expect(TASK_INSERT_COLUMNS).toHaveLength(18);
      expect(TASK_INSERT_COLUMNS[TASK_INSERT_COLUMNS.length - 1][0]).toEqual('source_asset_id');
      expect(seen.sql).toContain(columnList);
      expect(seen.args).toHaveLength(TASK_INSERT_COLUMNS.length * tasks.length);
      // per-row placeholders are contiguous and numbered from 1
      expect(seen.sql).toContain('($1,$2,');
      expect(seen.sql).toContain(`($${TASK_INSERT_COLUMNS.length + 1},`);
      expect(seen.args[TASK_INSERT_COLUMNS.length - 1]).toEqual('asset-master');
      expect(seen.args[TASK_INSERT_COLUMNS.length * 2 - 1]).toBeNull();
    });
  });

  describe('#updateTestTasks', function () {
    it('should throw error when tasks input is not an array', async function () {
      let res, err;
      const tasks = {};

      try {
        res = await dal.updateTestTasks(tasks);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toEqual('missing array of tasks');
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('should update task successfully', async function () {
      let err;
      const tasks = [{ taskId: '19125116_eaytb1lJshbJvgb' }];

      // mock result SQL
      serviceContext.dbConnections['core'].write._push([]);

      try {
        await dal.updateTestTasks(
          tasks,
          serviceContext.dbConnections['core'].write
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
  });

  describe('#getUsageByTaskType', function () {
    it('should get usage by task type successfully', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {};

      serviceContext.coreJob.jobBll.task.getEngineUsageForOrganization = jest
        .fn()
        .mockImplementationOnce(
          (applicationId, organization, dbClient, callback) =>
            callback(null, {})
        );

      try {
        res = await dal.getUsageByTaskType(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });
  });

  describe('#handleTaskStatusUpdate', function () {
    it('should handle task status update', async function () {
      let res, err;
      const sContext = require('../test/serviceContext.mock.js')();
      const context = mockUtil.makeContext();
      const input = {
        id: '20124903_k3vLSHqfdt2Sxl2',
        status: 'complete',
        taskOutput: {
          processedStats: { processedMediaSeconds: 500 }
        },
        organizationIds: [7682],
        organizationId: 7682,
        applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
        applicationIds: ['ed075985-bc94-406b-8639-44d1da42c3fb'],
        output: {
          processedStats: { processedMediaSeconds: 500 }
        },
        skipDecider: true
      };
      const task = {
        id: '20124903_k3vLSHqfdt2Sxl2',
        taskId: '20124903_k3vLSHqfdt2Sxl2',
        jobId: '20124903_k3vLSHqfdt',
        engineId: 'transcribe-speechmatics-container-en',
        applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
        status: 'running',
        payload: {
          keywords: 'keywords',
          organizationId: 7682
        },
        runtimePayload: {
          jobId: '20124903_k3vLSHqfdt',
          token: 'token',
          taskId: '20124903_k3vLSHqfdt2Sxl2',
          keywords: 'keywords',
          recordingId: '1300003141',
          taskPayload: {
            keywords: 'keywords',
            organizationId: 7682
          },
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          organizationId: 7682,
          veritoneApiBaseUrl: 'https://api.aws-dev.veritone.com'
        },
        output: {},
        targetId: '1300003141',
        order: 0,
        isClone: false,
        createdDateTime: 1606991808,
        queuedDateTime: 1607065037,
        startedDateTime: 1607065085,
        modifiedDateTime: 1607065085,
        completedDateTime: 1606991825,
        testTask: false,
        buildId: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224',
        notificationUris: [],
        taskPayload: {
          keywords: 'keywords',
          organizationId: 7682
        },
        taskOutput: { recordingId: '1300003141' },
        recordingId: '1300003141'
      };

      // mock serviceContext.dal.job.getJob - line 476
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        sContext,
        '20124903_k3vLSHqfdt'
      );
      sContext.dbConnections['core'].read._push([
        {
          id: '20124903_k3vLSHqfdt',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          recording_id: '1300003141',
          created_date_time: 1606991808,
          modified_date_time: 1606991817,
          retries: 0,
          status: 'running',
          job_config: {
            authData: {
              debug: {
                userName: 'test@veritone.com',
                tokenType: 'token',
                organizationName: 'Veritone, Inc.'
              },
              userId: '2cae4249-b5e4-4ae3-9ea7-470226a025af',
              applicationId: '',
              organizationId: 7682
            },
            isReprocessJob: false
          },
          notification_uris: []
        }
      ]);
      // updateTaskAtomicallyByStatus
      sContext.dbConnections['core'].write._push([
        {
          jobId: '20124903_k3vLSHqfdt',
          taskId: '20124903_k3vLSHqfdt2Sxl2',
          engineId: 'transcribe-speechmatics-container-en',
          buildId: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224',
          createdDateTime: 1606991808,
          queuedDateTime: 1607065037,
          modifiedDateTime: 1607065186,
          completedDateTime: 1607065186,
          startedDateTime: 1607065085,
          taskStatus: 'complete',
          taskPayload: {
            keywords: 'keywords',
            organizationId: 7682
          },
          taskOutput: { processedStats: { processedMediaSeconds: 500 } },
          taskOrder: 0,
          isClone: false,
          recordingId: '1300003141',
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          runtimePayload: {
            jobId: '20124903_k3vLSHqfdt',
            token: 'token',
            taskId: '20124903_k3vLSHqfdt2Sxl2',
            keywords: 'keywords',
            recordingId: '1300003141',
            taskPayload: {
              keywords: 'keywords',
              organizationId: 7682
            },
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            organizationId: 7682,
            veritoneApiBaseUrl: 'https://api.aws-dev.veritone.com'
          },
          notificationUris: [],
          taskType: 'transcribe-speechmatics-container-en'
        }
      ]);
      // mock getTasks
      sContext.dbConnections['core'].read._push([
        {
          id: '20124903_k3vLSHqfdt2Sxl2',
          job_id: '20124903_k3vLSHqfdt',
          engine_id: 'transcribe-speechmatics-container-en',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          status: 'complete',
          output: {},
          target_id: '1300003141',
          order: 0,
          is_clone: false,
          build_id: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224'
        }
      ]);
      // mock serviceContext.dal.organization.getOrgIdFromAppId
      sContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // mock getTaskMediaFields -> serviceContext.dal.tdo.getTDO
      sContext.dbConnections['core'].read._push([
        {
          id: '1300003141',
          status: 'recorded',
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          startDateTime: '2019-12-12T00:05:14.000Z',
          stopDateTime: '2019-12-12T00:05:14.000Z',
          jsondata: {
            status: 'recorded',
            addToIndex: true,
            mediaAsset: { assetId: '1300003141_Nvao0nYHlM' },
            recordingId: '1300003141',
            stopDateTime: 1576110014,
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            startDateTime: 1576109114,
            createdDateTime: 1606986467,
            modifiedDateTime: 1606986475,
            veritonePermissions: { acls: [], isPublic: false }
          },
          isPublic: false
        }
      ]);
      // mock getTaskMediaFields -> serviceContext.dal.tdo.getTDODetails
      sContext.dbConnections['core'].read._push([{ details: {} }]);
      // mock getTaskMediaFields -> serviceContext.dal.asset.getAssets
      sContext.dbConnections['core'].read._push([
        {
          id: '1300003141_Nvao0nYHlM',
          asset_id: '1300003141_Nvao0nYHlM',
          uri:
            'https://s3.amazonaws.com/bb-mcma.us-east-1.prod.upload/bbae8368-7fd2-4666-b6ba-2f5fb8fa4dda.mp4',
          content_type: 'video/mp4',
          type: 'media',
          metadata: {
            size: 2247483647 // int8
          },
          container_id: '1300003141',
          recording_id: '1300003141'
        }
      ]);
      // mock doJobAndTaskUpdates
      sContext.dbConnections['core'].write._push(
        [],
        false,
        [],
        (sql, params) => {
          expect(sql).not.toMatch(/media_storage_bytes\s=/);
          expect(sql).toMatch(/media_storage_bytes_new\s=/);
          expect(params[1]).toEqual(2247483647); // media_storage_bytes_new
          return true;
        }
      );

      const dalTask = require('./task.js')(sContext);
      try {
        res = await dalTask.handleTaskStatusUpdate(context, input, task);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.mediaLengthSec).toEqual(500);
      expect(res.mediaStorageBytes).toEqual(2247483647);
    });
    it('should handle task status update from a pending state to running', async function () {
      let res, err;
      const sContext = require('../test/serviceContext.mock.js')();
      const context = mockUtil.makeContext();
      const input = {
        id: '20124903_k3vLSHqfdt2Sxl2',
        status: 'running',
        taskOutput: {
          processedStats: { processedMediaSeconds: 500 }
        },
        organizationIds: [7682],
        organizationId: 7682,
        applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
        applicationIds: ['ed075985-bc94-406b-8639-44d1da42c3fb'],
        output: {
          processedStats: { processedMediaSeconds: 500 }
        },
        skipDecider: true
      };
      const task = {
        id: '20124903_k3vLSHqfdt2Sxl2',
        taskId: '20124903_k3vLSHqfdt2Sxl2',
        jobId: '20124903_k3vLSHqfdt',
        engineId: 'transcribe-speechmatics-container-en',
        applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
        status: 'queued',
        payload: {
          keywords: 'keywords',
          organizationId: 7682
        },
        runtimePayload: {
          jobId: '20124903_k3vLSHqfdt',
          token: 'token',
          taskId: '20124903_k3vLSHqfdt2Sxl2',
          keywords: 'keywords',
          recordingId: '1300003141',
          taskPayload: {
            keywords: 'keywords',
            organizationId: 7682
          },
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          organizationId: 7682,
          veritoneApiBaseUrl: 'https://api.aws-dev.veritone.com'
        },
        output: {},
        targetId: '1300003141',
        order: 0,
        isClone: false,
        createdDateTime: 1606991808,
        queuedDateTime: 1607065037,
        modifiedDateTime: 1607065085,
        completedDateTime: 1606991825,
        testTask: false,
        buildId: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224',
        notificationUris: [],
        taskPayload: {
          keywords: 'keywords',
          organizationId: 7682
        },
        taskOutput: { recordingId: '1300003141' },
        recordingId: '1300003141'
      };

      // mock serviceContext.dal.job.getJob - line 476
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        sContext,
        '20124903_k3vLSHqfdt'
      );
      sContext.dbConnections['core'].read._push([
        {
          id: '20124903_k3vLSHqfdt',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          recording_id: '1300003141',
          created_date_time: 1606991808,
          modified_date_time: 1606991817,
          retries: 0,
          status: 'queued',
          job_config: {
            authData: {
              debug: {
                userName: 'test@veritone.com',
                tokenType: 'token',
                organizationName: 'Veritone, Inc.'
              },
              userId: '2cae4249-b5e4-4ae3-9ea7-470226a025af',
              applicationId: '',
              organizationId: 7682
            },
            isReprocessJob: false
          },
          notification_uris: []
        }
      ]);
      // updateTaskAtomicallyByStatus
      sContext.dbConnections['core'].write._push(
        [
          {
            jobId: '20124903_k3vLSHqfdt',
            taskId: '20124903_k3vLSHqfdt2Sxl2',
            engineId: 'transcribe-speechmatics-container-en',
            buildId: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224',
            createdDateTime: 1606991808,
            queuedDateTime: 1607065037,
            modifiedDateTime: 1607065186,
            completedDateTime: 1607065186,
            startedDateTime: 1607065085,
            taskStatus: 'running',
            taskPayload: {
              keywords: 'keywords',
              organizationId: 7682
            },
            taskOutput: { processedStats: { processedMediaSeconds: 500 } },
            taskOrder: 0,
            isClone: false,
            recordingId: '1300003141',
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            runtimePayload: {
              jobId: '20124903_k3vLSHqfdt',
              token: 'token',
              taskId: '20124903_k3vLSHqfdt2Sxl2',
              keywords: 'keywords',
              recordingId: '1300003141',
              taskPayload: {
                keywords: 'keywords',
                organizationId: 7682
              },
              applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
              organizationId: 7682,
              veritoneApiBaseUrl: 'https://api.aws-dev.veritone.com'
            },
            notificationUris: [],
            taskType: 'transcribe-speechmatics-container-en'
          }
        ],
        false,
        [],
        (sql) => {
          expect(sql).toMatch(/started_date_time\s=.*/g);
          return true;
        }
      );
      // mock getTasks
      sContext.dbConnections['core'].read._push([
        {
          id: '20124903_k3vLSHqfdt2Sxl2',
          job_id: '20124903_k3vLSHqfdt',
          engine_id: 'transcribe-speechmatics-container-en',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          status: 'complete',
          output: {},
          target_id: '1300003141',
          order: 0,
          is_clone: false,
          build_id: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224'
        }
      ]);
      // mock serviceContext.dal.organization.getOrgIdFromAppId
      sContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // mock getTaskMediaFields -> serviceContext.dal.tdo.getTDO
      sContext.dbConnections['core'].read._push([
        {
          id: '1300003141',
          status: 'recorded',
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          startDateTime: '2019-12-12T00:05:14.000Z',
          stopDateTime: '2019-12-12T00:05:14.000Z',
          jsondata: {
            status: 'recorded',
            addToIndex: true,
            mediaAsset: { assetId: '1300003141_Nvao0nYHlM' },
            recordingId: '1300003141',
            stopDateTime: 1576110014,
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            startDateTime: 1576109114,
            createdDateTime: 1606986467,
            modifiedDateTime: 1606986475,
            veritonePermissions: { acls: [], isPublic: false }
          },
          isPublic: false
        }
      ]);
      // mock getTaskMediaFields -> serviceContext.dal.tdo.getTDODetails
      sContext.dbConnections['core'].read._push([{ details: {} }]);
      // mock getTaskMediaFields -> serviceContext.dal.asset.getAssets
      sContext.dbConnections['core'].read._push([
        {
          id: '1300003141_Nvao0nYHlM',
          asset_id: '1300003141_Nvao0nYHlM',
          uri:
            'https://s3.amazonaws.com/bb-mcma.us-east-1.prod.upload/bbae8368-7fd2-4666-b6ba-2f5fb8fa4dda.mp4',
          content_type: 'video/mp4',
          type: 'media',
          metadata: {},
          container_id: '1300003141',
          recording_id: '1300003141'
        }
      ]);
      // mock doJobAndTaskUpdates
      sContext.dbConnections['core'].write._push([]);

      const dalTask = require('./task.js')(sContext);
      try {
        res = await dalTask.handleTaskStatusUpdate(context, input, task);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });
    it('should handle task status update from a pending state to complete', async function () {
      let res, err;
      const sContext = require('../test/serviceContext.mock.js')();
      const context = mockUtil.makeContext();
      const input = {
        id: '20124903_k3vLSHqfdt2Sxl2',
        status: 'complete',
        taskOutput: {
          processedStats: { processedMediaSeconds: 500 }
        },
        organizationIds: [7682],
        organizationId: 7682,
        applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
        applicationIds: ['ed075985-bc94-406b-8639-44d1da42c3fb'],
        output: {
          processedStats: { processedMediaSeconds: 500 }
        },
        skipDecider: true
      };
      const task = {
        id: '20124903_k3vLSHqfdt2Sxl2',
        taskId: '20124903_k3vLSHqfdt2Sxl2',
        jobId: '20124903_k3vLSHqfdt',
        engineId: 'transcribe-speechmatics-container-en',
        applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
        status: 'queued',
        payload: {
          keywords: 'keywords',
          organizationId: 7682
        },
        runtimePayload: {
          jobId: '20124903_k3vLSHqfdt',
          token: 'token',
          taskId: '20124903_k3vLSHqfdt2Sxl2',
          keywords: 'keywords',
          recordingId: '1300003141',
          taskPayload: {
            keywords: 'keywords',
            organizationId: 7682
          },
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          organizationId: 7682,
          veritoneApiBaseUrl: 'https://api.aws-dev.veritone.com'
        },
        output: {},
        targetId: '1300003141',
        order: 0,
        isClone: false,
        createdDateTime: 1606991808,
        queuedDateTime: 1607065037,
        modifiedDateTime: 1607065085,
        completedDateTime: 1606991825,
        testTask: false,
        buildId: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224',
        notificationUris: [],
        taskPayload: {
          keywords: 'keywords',
          organizationId: 7682
        },
        taskOutput: { recordingId: '1300003141' },
        recordingId: '1300003141'
      };

      // mock serviceContext.dal.job.getJob - line 476
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        sContext,
        '20124903_k3vLSHqfdt'
      );
      sContext.dbConnections['core'].read._push([
        {
          id: '20124903_k3vLSHqfdt',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          recording_id: '1300003141',
          created_date_time: 1606991808,
          modified_date_time: 1606991817,
          retries: 0,
          status: 'pending',
          job_config: {
            authData: {
              debug: {
                userName: 'test@veritone.com',
                tokenType: 'token',
                organizationName: 'Veritone, Inc.'
              },
              userId: '2cae4249-b5e4-4ae3-9ea7-470226a025af',
              applicationId: '',
              organizationId: 7682
            },
            isReprocessJob: false
          },
          notification_uris: []
        }
      ]);
      // updateTaskAtomicallyByStatus
      sContext.dbConnections['core'].write._push(
        [
          {
            jobId: '20124903_k3vLSHqfdt',
            taskId: '20124903_k3vLSHqfdt2Sxl2',
            engineId: 'transcribe-speechmatics-container-en',
            buildId: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224',
            createdDateTime: 1606991808,
            queuedDateTime: 1607065037,
            modifiedDateTime: 1607065186,
            completedDateTime: 1607065186,
            startedDateTime: 1607065085,
            taskStatus: 'complete',
            taskPayload: {
              keywords: 'keywords',
              organizationId: 7682
            },
            taskOutput: { processedStats: { processedMediaSeconds: 500 } },
            taskOrder: 0,
            isClone: false,
            recordingId: '1300003141',
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            runtimePayload: {
              jobId: '20124903_k3vLSHqfdt',
              token: 'token',
              taskId: '20124903_k3vLSHqfdt2Sxl2',
              keywords: 'keywords',
              recordingId: '1300003141',
              taskPayload: {
                keywords: 'keywords',
                organizationId: 7682
              },
              applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
              organizationId: 7682,
              veritoneApiBaseUrl: 'https://api.aws-dev.veritone.com'
            },
            notificationUris: [],
            taskType: 'transcribe-speechmatics-container-en'
          }
        ],
        false,
        [],
        (sql) => {
          expect(sql).toMatch(/started_date_time\s=.*/g);
          return true;
        }
      );
      // mock getTasks
      sContext.dbConnections['core'].read._push([
        {
          id: '20124903_k3vLSHqfdt2Sxl2',
          job_id: '20124903_k3vLSHqfdt',
          engine_id: 'transcribe-speechmatics-container-en',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          status: 'complete',
          output: {},
          target_id: '1300003141',
          order: 0,
          is_clone: false,
          build_id: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224'
        }
      ]);
      // mock serviceContext.dal.organization.getOrgIdFromAppId
      sContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // mock getTaskMediaFields -> serviceContext.dal.tdo.getTDO
      sContext.dbConnections['core'].read._push([
        {
          id: '1300003141',
          status: 'recorded',
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          startDateTime: '2019-12-12T00:05:14.000Z',
          stopDateTime: '2019-12-12T00:05:14.000Z',
          jsondata: {
            status: 'recorded',
            addToIndex: true,
            mediaAsset: { assetId: '1300003141_Nvao0nYHlM' },
            recordingId: '1300003141',
            stopDateTime: 1576110014,
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            startDateTime: 1576109114,
            createdDateTime: 1606986467,
            modifiedDateTime: 1606986475,
            veritonePermissions: { acls: [], isPublic: false }
          },
          isPublic: false
        }
      ]);
      // mock getTaskMediaFields -> serviceContext.dal.tdo.getTDODetails
      sContext.dbConnections['core'].read._push([{ details: {} }]);
      // mock getTaskMediaFields -> serviceContext.dal.asset.getAssets
      sContext.dbConnections['core'].read._push([
        {
          id: '1300003141_Nvao0nYHlM',
          asset_id: '1300003141_Nvao0nYHlM',
          uri:
            'https://s3.amazonaws.com/bb-mcma.us-east-1.prod.upload/bbae8368-7fd2-4666-b6ba-2f5fb8fa4dda.mp4',
          content_type: 'video/mp4',
          type: 'media',
          metadata: {},
          container_id: '1300003141',
          recording_id: '1300003141'
        }
      ]);
      // mock doJobAndTaskUpdates
      sContext.dbConnections['core'].write._push([]);

      const dalTask = require('./task.js')(sContext);
      try {
        res = await dalTask.handleTaskStatusUpdate(context, input, task);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });
    it('should handle task status update from a aborted state to failed', async function () {
      let res, err;
      const sContext = require('../test/serviceContext.mock.js')();
      const context = mockUtil.makeContext();
      const input = {
        id: '20124903_k3vLSHqfdt2Sxl2',
        status: 'failed',
        task_output: {
          failureReason: 'url_not_found',
          failureMessage: 'url http://localhost:3000/whatever was not found'
        },
        organizationIds: [7682],
        organizationId: 7682,
        applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
        applicationIds: ['ed075985-bc94-406b-8639-44d1da42c3fb'],
        output: {
          processedStats: { processedMediaSeconds: 500 }
        },
        skipDecider: true
      };
      const task = {
        id: '20124903_k3vLSHqfdt2Sxl2',
        taskId: '20124903_k3vLSHqfdt2Sxl2',
        jobId: '20124903_k3vLSHqfdt',
        engineId: 'transcribe-speechmatics-container-en',
        applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
        status: 'aborted',
        payload: {
          keywords: 'keywords',
          organizationId: 7682
        },
        runtimePayload: {
          jobId: '20124903_k3vLSHqfdt',
          token: 'token',
          taskId: '20124903_k3vLSHqfdt2Sxl2',
          keywords: 'keywords',
          recordingId: '1300003141',
          taskPayload: {
            keywords: 'keywords',
            organizationId: 7682
          },
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          organizationId: 7682,
          veritoneApiBaseUrl: 'https://api.aws-dev.veritone.com'
        },
        output: {},
        targetId: '1300003141',
        order: 0,
        isClone: false,
        createdDateTime: 1606991808,
        queuedDateTime: 1607065037,
        modifiedDateTime: 1607065085,
        completedDateTime: 1606991825,
        testTask: false,
        buildId: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224',
        notificationUris: [],
        taskPayload: {
          keywords: 'keywords',
          organizationId: 7682
        },
        taskOutput: { recordingId: '1300003141' },
        recordingId: '1300003141'
      };

      // mock serviceContext.dal.job.getJob - line 476
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        sContext,
        '20124903_k3vLSHqfdt'
      );
      sContext.dbConnections['core'].read._push([
        {
          id: '20124903_k3vLSHqfdt',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          recording_id: '1300003141',
          created_date_time: 1606991808,
          modified_date_time: 1606991817,
          retries: 0,
          status: 'aborted',
          job_config: {
            authData: {
              debug: {
                userName: 'test@veritone.com',
                tokenType: 'token',
                organizationName: 'Veritone, Inc.'
              },
              userId: '2cae4249-b5e4-4ae3-9ea7-470226a025af',
              applicationId: '',
              organizationId: 7682
            },
            isReprocessJob: false
          },
          notification_uris: []
        }
      ]);
      // updateTaskAtomicallyByStatus
      sContext.dbConnections['core'].write._push(
        [
          {
            jobId: '20124903_k3vLSHqfdt',
            taskId: '20124903_k3vLSHqfdt2Sxl2',
            engineId: 'transcribe-speechmatics-container-en',
            buildId: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224',
            createdDateTime: 1606991808,
            queuedDateTime: 1607065037,
            modifiedDateTime: 1607065186,
            completedDateTime: 1607065186,
            startedDateTime: 1607065085,
            taskStatus: 'failed',
            taskPayload: {
              keywords: 'keywords',
              organizationId: 7682
            },
            taskOutput: { processedStats: { processedMediaSeconds: 500 } },
            taskOrder: 0,
            isClone: false,
            recordingId: '1300003141',
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            runtimePayload: {
              jobId: '20124903_k3vLSHqfdt',
              token: 'token',
              taskId: '20124903_k3vLSHqfdt2Sxl2',
              keywords: 'keywords',
              recordingId: '1300003141',
              taskPayload: {
                keywords: 'keywords',
                organizationId: 7682
              },
              applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
              organizationId: 7682,
              veritoneApiBaseUrl: 'https://api.aws-dev.veritone.com'
            },
            notificationUris: [],
            taskType: 'transcribe-speechmatics-container-en'
          }
        ],
        false,
        [],
        (sql) => {
          expect(sql).toContain(
            `task_status = $11,modified_date_time = $12,task_output = $13`
          );
          expect(sql).toContain(`task_status IN ($2,$3,$4,$5,$6,$7,$8,$9,$10)`);
          return true;
        }
      );
      // mock getTasks
      sContext.dbConnections['core'].read._push([
        {
          id: '20124903_k3vLSHqfdt2Sxl2',
          job_id: '20124903_k3vLSHqfdt',
          engine_id: 'transcribe-speechmatics-container-en',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          status: 'failed',
          output: {},
          target_id: '1300003141',
          order: 0,
          is_clone: false,
          build_id: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224'
        }
      ]);
      // mock serviceContext.dal.organization.getOrgIdFromAppId
      sContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // mock getTaskMediaFields -> serviceContext.dal.tdo.getTDO
      sContext.dbConnections['core'].read._push([
        {
          id: '1300003141',
          status: 'recorded',
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          startDateTime: '2019-12-12T00:05:14.000Z',
          stopDateTime: '2019-12-12T00:05:14.000Z',
          jsondata: {
            status: 'recorded',
            addToIndex: true,
            mediaAsset: { assetId: '1300003141_Nvao0nYHlM' },
            recordingId: '1300003141',
            stopDateTime: 1576110014,
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            startDateTime: 1576109114,
            createdDateTime: 1606986467,
            modifiedDateTime: 1606986475,
            veritonePermissions: { acls: [], isPublic: false }
          },
          isPublic: false
        }
      ]);
      // mock getTaskMediaFields -> serviceContext.dal.tdo.getTDODetails
      sContext.dbConnections['core'].read._push([{ details: {} }]);
      // mock getTaskMediaFields -> serviceContext.dal.asset.getAssets
      sContext.dbConnections['core'].read._push([
        {
          id: '1300003141_Nvao0nYHlM',
          asset_id: '1300003141_Nvao0nYHlM',
          uri:
            'https://s3.amazonaws.com/bb-mcma.us-east-1.prod.upload/bbae8368-7fd2-4666-b6ba-2f5fb8fa4dda.mp4',
          content_type: 'video/mp4',
          type: 'media',
          metadata: {},
          container_id: '1300003141',
          recording_id: '1300003141'
        }
      ]);
      // mock doJobAndTaskUpdates
      sContext.dbConnections['core'].write._push([]);

      const dalTask = require('./task.js')(sContext);
      try {
        res = await dalTask.handleTaskStatusUpdate(context, input, task);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });
    it('should handle task status update from a pending state to running', async function () {
      let res, err;
      const sContext = require('../test/serviceContext.mock.js')();
      const context = mockUtil.makeContext();
      const input = {
        id: '20124903_k3vLSHqfdt2Sxl2',
        status: 'running',
        task_output: {
          failureReason: 'url_not_found',
          failureMessage: 'url http://localhost:3000/whatever was not found'
        },
        organizationIds: [7682],
        organizationId: 7682,
        applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
        applicationIds: ['ed075985-bc94-406b-8639-44d1da42c3fb'],
        output: {
          processedStats: { processedMediaSeconds: 500 }
        },
        skipDecider: true
      };
      const task = {
        id: '20124903_k3vLSHqfdt2Sxl2',
        taskId: '20124903_k3vLSHqfdt2Sxl2',
        jobId: '20124903_k3vLSHqfdt',
        engineId: 'transcribe-speechmatics-container-en',
        applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
        status: 'pending',
        payload: {
          keywords: 'keywords',
          organizationId: 7682
        },
        runtimePayload: {
          jobId: '20124903_k3vLSHqfdt',
          token: 'token',
          taskId: '20124903_k3vLSHqfdt2Sxl2',
          keywords: 'keywords',
          recordingId: '1300003141',
          taskPayload: {
            keywords: 'keywords',
            organizationId: 7682
          },
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          organizationId: 7682,
          veritoneApiBaseUrl: 'https://api.aws-dev.veritone.com'
        },
        output: {},
        targetId: '1300003141',
        order: 0,
        isClone: false,
        createdDateTime: 1606991808,
        queuedDateTime: 1607065037,
        modifiedDateTime: 1607065085,
        completedDateTime: 1606991825,
        testTask: false,
        buildId: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224',
        notificationUris: [],
        taskPayload: {
          keywords: 'keywords',
          organizationId: 7682
        },
        taskOutput: { recordingId: '1300003141' },
        recordingId: '1300003141'
      };

      // mock serviceContext.dal.job.getJob - line 476
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        sContext,
        '20124903_k3vLSHqfdt'
      );
      sContext.dbConnections['core'].read._push([
        {
          id: '20124903_k3vLSHqfdt',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          recording_id: '1300003141',
          created_date_time: 1606991808,
          modified_date_time: 1606991817,
          retries: 0,
          status: 'pending',
          job_config: {
            authData: {
              debug: {
                userName: 'test@veritone.com',
                tokenType: 'token',
                organizationName: 'Veritone, Inc.'
              },
              userId: '2cae4249-b5e4-4ae3-9ea7-470226a025af',
              applicationId: '',
              organizationId: 7682
            },
            isReprocessJob: false
          },
          notification_uris: []
        }
      ]);
      // updateTaskAtomicallyByStatus
      sContext.dbConnections['core'].write._push(
        [
          {
            jobId: '20124903_k3vLSHqfdt',
            taskId: '20124903_k3vLSHqfdt2Sxl2',
            engineId: 'transcribe-speechmatics-container-en',
            buildId: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224',
            createdDateTime: 1606991808,
            queuedDateTime: 1607065037,
            modifiedDateTime: 1607065186,
            completedDateTime: 1607065186,
            startedDateTime: 1607065085,
            taskStatus: 'failed',
            taskPayload: {
              keywords: 'keywords',
              organizationId: 7682
            },
            taskOutput: { processedStats: { processedMediaSeconds: 500 } },
            taskOrder: 0,
            isClone: false,
            recordingId: '1300003141',
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            runtimePayload: {
              jobId: '20124903_k3vLSHqfdt',
              token: 'token',
              taskId: '20124903_k3vLSHqfdt2Sxl2',
              keywords: 'keywords',
              recordingId: '1300003141',
              taskPayload: {
                keywords: 'keywords',
                organizationId: 7682
              },
              applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
              organizationId: 7682,
              veritoneApiBaseUrl: 'https://api.aws-dev.veritone.com'
            },
            notificationUris: [],
            taskType: 'transcribe-speechmatics-container-en'
          }
        ],
        false,
        [],
        (sql) => {
          expect(sql).toContain(
            `task_status = $9,modified_date_time = $10,task_output = $11,started_date_time = $12`
          );
          expect(sql).toContain(`task_status IN ($2,$3,$4,$5,$6,$7,$8)`);
          return true;
        }
      );
      // mock getTasks
      sContext.dbConnections['core'].read._push([
        {
          id: '20124903_k3vLSHqfdt2Sxl2',
          job_id: '20124903_k3vLSHqfdt',
          engine_id: 'transcribe-speechmatics-container-en',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          status: 'pending',
          output: {},
          target_id: '1300003141',
          order: 0,
          is_clone: false,
          build_id: 'e9f38bf7-dd5e-4543-aec7-5e30e0f93224'
        }
      ]);
      // mock serviceContext.dal.organization.getOrgIdFromAppId
      sContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // mock getTaskMediaFields -> serviceContext.dal.tdo.getTDO
      sContext.dbConnections['core'].read._push([
        {
          id: '1300003141',
          status: 'recorded',
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          startDateTime: '2019-12-12T00:05:14.000Z',
          stopDateTime: '2019-12-12T00:05:14.000Z',
          jsondata: {
            status: 'recorded',
            addToIndex: true,
            mediaAsset: { assetId: '1300003141_Nvao0nYHlM' },
            recordingId: '1300003141',
            stopDateTime: 1576110014,
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            startDateTime: 1576109114,
            createdDateTime: 1606986467,
            modifiedDateTime: 1606986475,
            veritonePermissions: { acls: [], isPublic: false }
          },
          isPublic: false
        }
      ]);
      // mock getTaskMediaFields -> serviceContext.dal.tdo.getTDODetails
      sContext.dbConnections['core'].read._push([{ details: {} }]);
      // mock getTaskMediaFields -> serviceContext.dal.asset.getAssets
      sContext.dbConnections['core'].read._push([
        {
          id: '1300003141_Nvao0nYHlM',
          asset_id: '1300003141_Nvao0nYHlM',
          uri:
            'https://s3.amazonaws.com/bb-mcma.us-east-1.prod.upload/bbae8368-7fd2-4666-b6ba-2f5fb8fa4dda.mp4',
          content_type: 'video/mp4',
          type: 'media',
          metadata: {},
          container_id: '1300003141',
          recording_id: '1300003141'
        }
      ]);
      // mock doJobAndTaskUpdates
      sContext.dbConnections['core'].write._push([]);

      const dalTask = require('./task.js')(sContext);
      try {
        res = await dalTask.handleTaskStatusUpdate(context, input, task);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });
  });

  describe('updateTaskAtomicallyByStatus', () => {
    let taskId, acceptableStatuses, updateTask;
    const sContext = require('../test/serviceContext.mock.js')();
    beforeEach(() => {
      taskId = mockUtil.toTaskId('jobId');
      acceptableStatuses = ['pending'];
      updateTask = { taskStatus: 'running' };
    });

    it('should throw an error for missing taskId', async () => {
      let res, err;
      taskId = null;

      try {
        res = await dal.updateTaskAtomicallyByStatus(
          taskId,
          acceptableStatuses,
          updateTask,
          sContext
        );
      } catch (error) {
        expect(error.message).toEqual('Missing taskId!');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });

    it('should throw an error for missing acceptableStatuses', async () => {
      let res, err;

      try {
        res = await dal.updateTaskAtomicallyByStatus(taskId);
      } catch (error) {
        expect(error.message).toEqual('Missing acceptableStatuses!');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });

    it('should throw an error for missing updateTask', async () => {
      let res, err;

      try {
        res = await dal.updateTaskAtomicallyByStatus(
          taskId,
          acceptableStatuses
        );
      } catch (error) {
        expect(error.message).toEqual('Missing updateTask!');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });

    it('should throw an error for trying to update with an empty updateTask', async () => {
      let res, err;
      updateTask = {};

      try {
        res = await dal.updateTaskAtomicallyByStatus(
          taskId,
          acceptableStatuses,
          updateTask,
          sContext
        );
      } catch (error) {
        expect(error.message).toEqual('updateTask is empty!');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });

    it('should call pg and return an error', async () => {
      let res, err;

      try {
        res = await dal.updateTaskAtomicallyByStatus(
          taskId,
          acceptableStatuses,
          updateTask,
          sContext
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });

    it('should call pg, successfully update and return the updated object', async () => {
      let res, err;

      serviceContext.dbConnections['core'].write._push([
        {
          job_id: mockUtil.toTaskId('job1'),
          task_id: mockUtil.toTaskId('job1_task1'),
          engine_id: '2bedc01c-ef8f-4db8-b0ae-feb8c8584cbb'
        }
      ]);

      try {
        res = await dal.updateTaskAtomicallyByStatus(
          taskId,
          acceptableStatuses,
          updateTask,
          sContext
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(res.jobId).toEqual(mockUtil.toTaskId('job1'));
      expect(res.taskId).toEqual(mockUtil.toTaskId('job1_task1'));
      expect(res.taskType).toEqual('2bedc01c-ef8f-4db8-b0ae-feb8c8584cbb');
      expect(res.engineId).toEqual('2bedc01c-ef8f-4db8-b0ae-feb8c8584cbb');
    });

    it('ERROR: Not return the error: No data returned from the query.', async () => {
      let res, err;

      serviceContext.dbConnections['core'].write._push([], false, [], () => {
        throw 'Syntax error blabla';
      });

      try {
        res = await dal.updateTaskAtomicallyByStatus(
          taskId,
          acceptableStatuses,
          updateTask,
          sContext
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : error;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
      expect(err).toEqual('Syntax error blabla');
    });

    it('ERROR: return the error: No data returned from the query. => Task not found', async () => {
      let res, err;

      serviceContext.dbConnections['core'].write._push([], false, [], () => {
        throw {
          data: {
            internalData: {
              message: 'No data returned from the query.'
            }
          }
        };
      });

      // Task not found
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.updateTaskAtomicallyByStatus(
          taskId,
          acceptableStatuses,
          updateTask,
          sContext
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : error;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
      expect(JSON.stringify(err)).toMatch('No data returned from the query.');
    });

    it('ERROR: return the error: No data returned from the query. => Task status is updated before, ignore error', async () => {
      let res, err;

      const _updateTask = { taskStatus: 'cancelled' };

      serviceContext.dbConnections['core'].write._push([], false, [], () => {
        throw {
          data: {
            internalData: {
              message: 'No data returned from the query.'
            }
          }
        };
      });

      // Task not found
      serviceContext.dbConnections['core'].read._push([
        {
          taskId: 'taskId',
          jobId: 'jobId',
          taskStatus: _updateTask.taskStatus
        }
      ]);

      try {
        res = await dal.updateTaskAtomicallyByStatus(
          taskId,
          acceptableStatuses,
          _updateTask,
          sContext
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : error;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
    });

    it('ERROR: return the error: No data returned from the query. => Task status is invalid', async () => {
      let res, err;

      const _updateTask = { taskStatus: 'pending' };
      const _acceptableStatuses = ['failed', 'complete'];

      serviceContext.dbConnections['core'].write._push([], false, [], () => {
        throw {
          data: {
            internalData: {
              message: 'No data returned from the query.'
            }
          }
        };
      });

      // get Task
      serviceContext.dbConnections['core'].read._push([
        {
          taskId: 'taskId',
          jobId: 'jobId',
          taskStatus: 'running'
        }
      ]);

      try {
        res = await dal.updateTaskAtomicallyByStatus(
          taskId,
          _acceptableStatuses,
          _updateTask,
          sContext
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
      expect(err.message).toMatch('Cannot change the task');
      expect(err.message).toMatch('running to pending');
    });
  });

  describe('#updateAssetSizeOnTaskComplete', function () {
    it('updateAssetSizeOnTaskComplete should return empty list', async () => {
      const mockTask = {};
      const res = await dal.updateAssetSizeOnTaskComplete(context, mockTask);
      expect(res.length).toEqual(0);
    });

    it('updateAssetSizeOnTaskComplete should return non-empty list', async () => {
      const mockAsset = { id: 'asset123' };
      jest
        .spyOn(serviceContext.dal.asset, 'getAssets')
        .mockImplementation(async (ctx, assetDesc) => {
          expect(
            ['media', 'media-mdp', 'mpeg-dash-manifest'].includes(
              assetDesc.assetType
            )
          ).toBeTruthy();
          if (assetDesc.assetType === 'media-mdp') {
            return { records: [mockAsset] };
          }
          return { records: [] };
        });
      serviceContext.dal.asset.updateAssetSize = jest
        .fn()
        .mockImplementation(() => {
          return Promise.resolve(mockAsset);
        });

      const _storedBytes = 566;
      const mockTdoDetails = { uploadedBytes: _storedBytes };
      jest
        .spyOn(serviceContext.dal.tdo, 'getTDODetails')
        .mockImplementation(() => {
          return mockTdoDetails;
        });
      jest
        .spyOn(serviceContext.dal.tdo, 'syncMediaMdpAsset')
        .mockImplementation(() => {
          return {};
        });

      const _processedBytes = 239;
      const _recordingId = 'recording123';
      const mockTask = {
        engineId: '352556c7-de07-4d55-b33f-74b1cf237f25',
        recordingId: _recordingId,
        id: mockUtil.toTaskId('job123_123'),
        taskOutput: {
          processedStats: {
            processedBytes: _processedBytes
          }
        }
      };
      const res = await dal.updateAssetSizeOnTaskComplete(
        serviceContext,
        mockTask
      );
      expect(serviceContext.dal.asset.getAssets).toHaveBeenCalledTimes(3);
      expect(serviceContext.dal.asset.updateAssetSize).toHaveBeenCalledWith(
        mockAsset.id,
        _processedBytes
      );
      expect(serviceContext.dal.tdo.getTDODetails).toHaveBeenCalledWith(
        _recordingId
      );
      expect(serviceContext.dal.tdo.syncMediaMdpAsset).toHaveBeenCalledTimes(1);
      expect(res.length).toEqual(1);
      expect(res[0].assetSize).toEqual(_processedBytes);
      expect(res[0].storedSize).toEqual(_storedBytes);
    });

    it('updateAssetSizeOnTaskComplete should emit audit event on failure', async () => {
      jest
        .spyOn(serviceContext.dal.tdo, 'getTDODetails')
        .mockImplementationOnce(() => {
          throw new Error('Error');
        });

      const _processedBytes = 239;
      const _recordingId = 'recording123';
      const mockTask = {
        engineId: '352556c7-de07-4d55-b33f-74b1cf237f25',
        recordingId: _recordingId,
        id: mockUtil.toTaskId('job123_123'),
        taskOutput: {
          processedStats: {
            processedBytes: _processedBytes
          }
        }
      };
      await dal
        .updateAssetSizeOnTaskComplete(serviceContext, mockTask)
        .catch(() => {
          expect(serviceContext.messageUtil._messages()[0].actionInfo).toEqual(
            expect.objectContaining({
              actionName: 'update',
              actionResult: 'failure'
            })
          );
        });
    });
  });
});
