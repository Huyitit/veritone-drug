const _ = require('lodash');
const uuid = require('uuid');
const { v5: uuidv5 } = require('uuid');
const validator = require('validator');
const mapper = require('../../../dal/mapper.js');
const humps = require('humps');
const moment = require('moment');
const handlebars = require('handlebars');
//const HandlebarHelpers = require('helpers-for-handlebars');

// HandlebarHelpers.math({
//   handlebars
// });

const uuidNamespace = '84449a79-5e08-43cc-8c26-c56bf8824e8a';

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const dbConnections = serviceContext.dbConnections;
  const logger = serviceContext.logger;
  const dalJobTemplate = serviceContext.dal.jobTemplate;
  const dalJobPipeline = serviceContext.dal.jobPipeline;
  const dalStructuredData = serviceContext.dal.structuredData;
  const dalSource = serviceContext.dal.source;
  const dalCluster = serviceContext.dal.cluster;
  const messageUtil = serviceContext.messageUtil;
  const dalTaskTemplate = serviceContext.dal.taskTemplate;

  const mainUtil = require('../../../util.js')(serviceContext);
  const resUtil = require('../../../resolvers/util.js')(serviceContext);
  const errors = require('../../../error/index.js')(config);
  const sjDbRead = dbConnections['media_platform'].read;
  const sjDbWrite = dbConnections['media_platform'].write;
  const jobDbRead = dbConnections['core'].read;
  const jobDbWrite = dbConnections['core'].write;
  const dalUtil = require('../../../dal/util.js')(config, serviceContext);

  const defaultOrg = _.get(config, 'db.constants.customerSuccessOrgId', 7682);

  const SOURCE_TYPE = {
    RADIO: 1,
    YOUTUBE: 3,
    PODCAST: 4
  };

  const DEFAULT_PMI_CLUSTER_ID = _.get(
    config,
    'defaultPmiClusterId',
    'pmi-edge-0001'
  );

  // not ideal, but only way to map legacy congitive engines to RT cognitive engines..
  const defaultLegacyToRTEngineMap = {
    'transcribe-speechmatics-container-en-us':
      'c0e55cde-340b-44d7-bb42-2e0d65e98141',
    'imagedetection-facerecognition-kairos':
      'a7eff360-683a-43fd-bf74-6cf51a990cb0',
    'imagedetection-logorecognition-google':
      '361ae32c-4937-4d4c-9865-466fd3424bf9',
    'imagedetection-ocr-google': '38afb67a-045b-43db-96db-9080073695ab',
    defaultValues: true
  };
  const legacyToRTEngineMap = _.get(
    config,
    'legacyEngineToRealTimeEngines',
    defaultLegacyToRTEngineMap
  );
  // end legacy to RT mapping values

  const scheduleSelectFromProgram = `
    ps.program_schedule_id AS id,
    ps.date_start AS start_date_time,
    ps.date_end AS end_date_time,
    ps.program_id AS program_id,
    ps.media_source_id AS source_id,
    ps.schedule_status_id AS status_id,
    ss.schedule_status_name AS status
  `;

  const INGESTION_STATUS = {
    RECORD: 1,
    RECORD_AND_TRANSCRIBE: 2,
    INACTIVE: 3,
    METRICS_ONLY: 4
  };

  let defaultTalentId;

  async function getDefaultTalentId(context) {
    if (!defaultTalentId) {
      const sql = `
SELECT talent_id FROM talent WHERE talent_first_name ILIKE 'Veritone%' ORDER BY talent_id
    `;
      const res = await sjDbRead.query(sql);
      if (res.length) {
        defaultTalentId = res[0].talent_id;
      } else {
        defaultTalentId = _.get(config, 'server.legacyHacks.defaultTalentId');
      }
    }
    // note that this could end up empty if there's no suitable talent ID
    // to be found. this will only happen on non-prod systems where legacy
    // Discovery compatibility is not an issue.
    return defaultTalentId;
  }

  async function getScheduleIdsForWatchlist(context, args, watchlistId) {
    const _args = Object.assign(
      {
        offset: 0,
        limit: 1000
      },
      args
    );
    const res = await getSchedulesForWatchlist(context, _args, watchlistId);

    return res.records.map((schedule) => schedule.id);
  }

  async function getSchedulesForWatchlist(context, args, watchlistId) {
    const sql = `
SELECT
  ${scheduleSelectFromProgram}
FROM
  program_schedule ps
  LEFT JOIN schedule_status ss
  ON ss.schedule_status_id = ps.schedule_status_id
WHERE
  ps.program_id IN (
    SELECT program_id
    FROM tracking_unit_program
    WHERE tracking_unit_id = $1)
OFFSET $2
LIMIT $3
    `;

    const res = await sjDbRead.map(
      sql,
      [watchlistId, args.offset, args.limit],
      mapper.camelizeRootKeys
    );

    return {
      records: res,
      offset: args.offset,
      limit: args.limit,
      count: res.length
    };
  }

  // this array identifies database columns in program that are really
  // specific to a source type and should be exposed only through the
  // details field.
  const scheduleDetailColumns = [
    'hoursPerWeek',
    'averageWeeklyAudience',
    'durationMinutes',
    'dmaMarkets',
    'dmaAffiliates',
    'dmaAqhAudience',
    'dmaAqhCharacteristics',
    'onlineViews',
    'subscribers',
    'videos',
    'isNational',
    'isNationallySyndicated',
    'businessUnit',
    'programKeywords',
    'programLiveImage',
    'programImage',
    'v3Job'
  ];

  async function getScheduledJob(context, args) {
    mainUtil.checkId(args.id, false, true);
    const res = await getScheduledJobs(
      context,
      Object.assign({ includePublic: true }, args)
    );
    if (!res.count) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'ScheduledJob'
        }
      });
    }
    return res.records[0];
  }

  const runModeMapIn = {
    Continuous: 'C',
    Once: '1',
    Recurring: 'R',
    Now: '1' // we save as once and run immediately
  };

  const runModeMapOut = {
    C: 'Continuous',
    1: 'Once',
    R: 'Recurring'
  };

  function mapRunModeIn(runMode) {
    if (!runMode) return runMode;
    return runModeMapIn[runMode];
  }

  function mapRunModeOut(runMode) {
    return runModeMapOut[runMode];
  }

  function mapScheduledJob(row) {
    const res = mapper.camelizeRootKeys(row);
    res.runMode = mapRunModeOut(res.runMode);
    res.id = res.programId || res.id;
    return res;
  }

  const scheduledJobSelectData = {
    program_id: 'id',
    program_name: 'name',
    program_description: 'description',
    organization_id: null,
    is_active: null,
    run_mode: null,
    start_date_time: null,
    stop_date_time: null,
    kvp: 'details',
    details_schema_id: null,
    program_format_id: 'program_format',
    recording_status_id: 'ingestion_status_id',
    task_data: null,
    app_application_id: null
  };

  const engineTypeMap = {
    Ingestion: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
    Cognition: 'fcc22feb-9184-4f53-be5e-7694927864d9',
    Aggregator: 'b055b3ec-38ef-41c3-bf8a-a672e3a72dae'
  };

  async function getScheduledJobs(context, args) {
    const detailColumns = scheduleDetailColumns.map((col) =>
      humps.decamelize(col)
    );
    const groupId = _.get(context, '_authInfo.groups[0].groupId');

    const where = [];
    const values = [];

    const permLevel = args.permission || 'viewer';
    let allowedPerms;
    if (permLevel === 'viewer') {
      allowedPerms = ['viewer', 'editor', 'owner'];
    } else if (permLevel === 'editor') {
      allowedPerms = ['editor', 'owner'];
    } else {
      allowedPerms = ['owner'];
    }
    const includePublic = _.has(args, 'includePublic')
      ? args.includePublic && allowedPerms.includes('viewer')
      : allowedPerms.includes('viewer');

    if (!_.isNil(args.hasJobTemplate)) {
      if (args.hasJobTemplate === true) {
        where.push(`(p.task_data->>'numJobTemplates')::int4 > 0`);
      } else {
        where.push(
          `(p.task_data->>'numJobTemplates')::int4 = 0 OR (p.task_data->>'numJobTemplates') IS NULL`
        );
      }
    }
    if (args.engineType) {
      const typeId = engineTypeMap[args.engineType] || args.engineType;
      if (!typeId) throw new Error('no such type ' + args.engineType); // internal error - db out of sync with schema
      //values.push(typeId);
      // TODO variables didn't work in this query?
      where.push(`p.task_data->'engineTypeIds' @> '"${typeId}"'`);
    }
    if (args.engineId) {
      //values.push(args.engineId);
      where.push(`p.task_data->'engineIds' @> '"${args.engineId}"'`);
    }
    if (args.clusterId) {
      // There are job templates that don't have cluster id so if the cluster
      // we want to filter by is default cluster then check for null
      let clusterSQL = [`p.task_data->'clusterIds' @> '"${args.clusterId}"'`];

      const cluster = await dalCluster.getCluster(context, {
        id: args.clusterId
      });
      if (cluster.default === true)
        clusterSQL.push(`p.task_data -> 'clusterIds' @> 'null'`);

      where.push(`(${clusterSQL.join(' OR ')})`);
    }
    let programCreatedByUser = [];
    if (args.createdBy) {
      mainUtil.checkId(args.createdBy, true, true);
      programCreatedByUser.push(`p.created_by = '${args.createdBy}'`);
    }
    if (
      args.includeOwnedOnly &&
      _.get(context, '_authInfo.userId', null) != null
    ) {
      programCreatedByUser.push(
        `p.created_by = '${_.get(context, '_authInfo.userId')}'`
      );
    }
    if (programCreatedByUser.length > 0) {
      where.push(`(${programCreatedByUser.join(' OR ')})`);
    }
    let scheduledJobIdsWithRunningJobs;
    let scheduledJobIdOp;
    if (_.has(args, 'hasRunningJobs')) {
      // since scheduled jobs and jobs are in separate DBs, we need to
      // first query the jobs table for a list of scheduled job Ids
      // from running jobs. to narrow this query down we limit by
      // time - last 4 hours (max practical job length).
      const minDate = moment().subtract(4, 'hours').toISOString();
      const tres = await serviceContext.dal.job.getJobs(context, {
        applicationId: args.applicationId,
        status: 'running',
        organizationId: args.organizationId,
        hasScheduledJobId: true,
        dateFilter: [
          {
            field: 'createdDateTime',
            fromDateTime: minDate
          }
        ],
        orderBy: [
          {
            field: 'createdDateTime',
            direction: 'desc'
          }
        ],
        limit: 500
      });

      // no job IDs returned, so return out empty set now.
      if (!tres.records.length) {
        return mainUtil.emptyPage(args);
      }

      // now we have a list of IDs that can be plugged into the query for
      // scheduled jobs
      scheduledJobIdsWithRunningJobs = [];
      tres.records.forEach((record) =>
        scheduledJobIdsWithRunningJobs.push(record.scheduledJobId)
      );
      scheduledJobIdOp = args.hasRunningJobs === true ? ' IN ' : ' NOT IN ';
      mainUtil.addSqlWhere(
        'p.program_id',
        scheduledJobIdsWithRunningJobs,
        where,
        values,
        scheduledJobIdOp
      );
    }

    if (_.isArray(args.id)) {
      args.id.forEach((id) => mainUtil.checkId(id, true, true));
    } else {
      mainUtil.checkId(args.id, true, true);
    }

    if (args.organizationId /* && !isCS VTN-10353 - demote CS role */) {
      // Fetch public if specifying a singleId
      const publicClause =
        includePublic && args.id ? ' OR p.is_public = TRUE' : '';
      values.push(args.organizationId);
      where.push(`(p.organization_id = \$${values.length} ${publicClause})`);
      /* const permArg = allowedPerms.map(perm => `'${perm}'`);
      where.push(
        `(p.organization_id = \$${
          values.length
        } OR a.permission IN (${permArg.join(', ')}) ${publicClause})`
      ); */
    }
    mainUtil.addSqlWhere('p.program_id', args.id, where, values);
    mainUtil.addSqlWhere(
      'p.run_mode',
      mapRunModeIn(args.runMode),
      where,
      values
    );
    mainUtil.addSqlWhere('p.is_active', args.isActive, where, values);
    if (args.name) {
      where.push(
        `p.program_name ILIKE '%${mainUtil.sqlEscapeForLIKE(args.name)}%'`
      );
    }
    mainUtil.addSqlWhere(
      'p.primary_media_source_id',
      args.primarySourceId,
      where,
      values
    );
    mainUtil.addSqlWhere(
      'p.media_source_type_id',
      args.primarySourceTypeId,
      where,
      values
    );
    /*
    if (filterByJobTemplateId) {
      if (scheduledIdsWithJobTemplates.length > 0) {
        // TODO handle negative input for hasJobTemplates
        where.push(
          `p.program_id IN (${scheduledIdsWithJobTemplates.join(',')})`
        );
      } else {
        // no matching job template IDs found so bail out now
        return mainUtil.toPage(args, []);
      }
    }
    */
    mainUtil.addDateTimeFilters('p', args, where, 'pg_ts');
    const filterByPartTime = mainUtil.addPartTimeFilters('psd', args, where);

    // if this is a normal org-scoped token, we'll add a clause to the
    // ACL join restricting it to this org's group
    let aclJoin = '';
    /*
    if (groupId) {
      values.push(groupId);
      aclJoin = `AND a.acl = \$${values.length}`;
    }
    */
    const orderMap = {
      id: 'p.program_id',
      startDateTime: 'p.start_date_time',
      stopDateTime: 'p.stop_date_time',
      createdDateTime: 'p.date_created',
      modifiedDateTime: 'p.date_modified',
      runMode: 'p.run_mode',
      isActive: 'p.is_active',
      name: 'p.program_name'
    };
    const orderClause = [];
    // default to modifiedDateTime desc
    const orderBy =
      _.get(args, 'orderBy.length', 0) > 0
        ? args.orderBy
        : [{ field: 'modifiedDateTime', direction: 'desc' }];
    orderBy.forEach((order) => {
      const key = orderMap[order.field] || order.field;
      orderClause.push(`${key} ${order.direction}`);
    });
    const whereClause = where.length ? 'WHERE\n  ' + where.join(' AND ') : '';
    const sql = `
SELECT DISTINCT
  ${detailColumns.join(',\n  ')},
  p.program_id AS id,
  p.program_name AS name,
  p.program_description AS description,
  p.organization_id,
  p.is_active,
  p.run_mode,
  p.start_date_time,
  p.stop_date_time,
  p.details_schema_id,
  pf.program_format_name AS program_format,
  p.date_created AS created_date_time,
  p.date_modified AS modified_date_time,
  p.primary_media_source_id AS primary_source_id,
  p.media_source_type_id AS source_type_id,
  p.is_public,
  p.v3_job,
  p.task_data,
  p.media_source_type_id as primary_source_type_id,
  p.recording_status_id AS ingestion_status_id,
  p.app_application_id,
  rs.recording_status_name AS ingestion_status
FROM
  program p
LEFT JOIN
  program_format pf ON pf.program_format_id = p.program_format_id
LEFT JOIN
  recording_status rs ON rs.recording_status_id = p.recording_status_id
${
  filterByPartTime
    ? `
LEFT JOIN program_schedule ps
  ON ps.program_id = p.program_id
LEFT JOIN program_schedule_day psd
  ON psd.program_schedule_id = ps.program_schedule_id`
    : ''
}
${whereClause}
ORDER BY
  ${orderClause.join(', ')}
OFFSET ${args.offset || 0}
LIMIT ${args.limit || 30}
`;
    const res = await sjDbRead.map(sql, values, mapScheduledJob);

    return mainUtil.toPage(args, res);
  }

  async function getDetails(schedule, context) {
    let kvp = schedule.kvp || schedule.details;
    if (!kvp) {
      const kvpSql = `SELECT kvp FROM program WHERE program_id = $1`;
      const rows = await sjDbRead.map(kvpSql, [schedule.id], (row) => row.kvp);
      kvp = rows.length ? rows[0] : {};
      schedule.kvp = kvp;
    }
    // first pick all special db columns that we map into details
    const res = _.pick(schedule, scheduleDetailColumns);
    scheduleDetailColumns.forEach((column) => {
      if (_.isNil(res[column])) delete res[column];
    });

    // certain columns need special handling
    if (res.programLiveImage)
      res.programLiveImage = await resUtil.getSignedUrl(res.programLiveImage);
    if (res.programImage)
      res.programImage = await resUtil.getSignedUrl(res.programImage);
    if (schedule.programFormat) {
      res.programFormat = schedule.programFormat;
    }

    // now combine with kvp column properties
    return Object.assign(kvp || {}, res);
  }

  async function getScheduleParts(context, args) {
    let scheduledJob = args.scheduledJob;
    if (!scheduledJob || !args.scheduledJob.primarySourceId) {
      scheduledJob = await serviceContext.dal.scheduledJob.getScheduledJob(
        context,
        {
          id: args.id
        }
      );
    }
    // for now, recurring and weekly schedule parts are stored
    // in separate tables so that we can be compatible with the
    // legacy program_schedule table.
    // when we clean up the db, we'll merge into a single table
    // with a unified and more flexible way of expressing
    const where = [];
    const values = [];
    mainUtil.addSqlWhere('ps.program_id', args.id, where, values);
    mainUtil.addSqlWhere('ss.schedule_status_name', args.status, where, values);
    where.push(
      `(ps.media_source_id IS NULL OR ps.media_source_id = -1 OR ps.media_source_id = $${values.push(
        scheduledJob.primarySourceId
      )})`
    );
    const sql = `
    SELECT
      ps.program_schedule_id AS id,
      ps.date_start AS start_date_time,
      ps.date_end AS end_date_time,
      ss.schedule_status_name AS status,
      psd.program_schedule_day_of_week AS scheduled_day,
      psd.start_time AS start_time,
      psd.end_time AS stop_time,
      'Weekly' AS schedule_type
    FROM
      program_schedule ps
      LEFT JOIN schedule_status ss
      ON ss.schedule_status_id = ps.schedule_status_id
      LEFT JOIN program_schedule_day psd
      ON psd.program_schedule_id = ps.program_schedule_id
    WHERE
      ${where.join(' AND ')}
    OFFSET ${args.offset || 0}
    LIMIT ${args.limit || 30}
    `;

    const res = await sjDbRead.map(sql, values, mapSchedulePart);

    const moreSql = `
SELECT
  interval_units AS repeat_interval_unit,
  interval AS repeat_interval,
  'Interval' AS schedule_type,
  duration_seconds,
  time_of_day AS start_time
FROM
  recurring_schedule
WHERE
  scheduled_job_id = $1
    `;
    const moreRes = await sjDbRead.map(moreSql, [args.id], mapSchedulePart);
    const parts = res.concat(moreRes);

    return parts;
  }

  const dayMap = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday'
  };

  const dayMapIn = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
  };

  function mapSchedulePart(part) {
    const res = mapper.camelizeRootKeys(part);
    if (!_.isNil(res.scheduledDay)) {
      res.scheduledDayAsInt = res.scheduledDay;
      res.scheduledDay = dayMap[res.scheduledDay];
    }
    if (_.isNil(res.repeatIntervalUnit) && res.scheduleType === 'Weekly') {
      res.repeatIntervalUnit = unitsInMap.Weeks;
      res.repeatInterval = 1;
    }
    if (!_.isNil(res.repeatIntervalUnit))
      res.repeatIntervalUnit = mapUnitsOut(res.repeatIntervalUnit);

    return res;
  }

  async function findPrimarySourceByJobTemplate(context, jobTemplateIds) {
    const jIdList = [];
    const vars = [];

    jobTemplateIds.forEach((id) => {
      vars.push(id);
      jIdList.push(`\$${vars.length}`);
    });

    const sql = `
SELECT
  t.task_template_id,
  t.task_payload
FROM
  job_new.task_template t
WHERE
  t.job_template_id IN (${jIdList.join(', ')});
    `;
    const dbres = await dbConnections['core'].read.query(sql, vars);
    let res;
    for (let i = 0; i < dbres.length && !res; i++) {
      // take the first payload that has a source ID
      res = _.get(dbres[i], 'task_payload.sourceId');
    }

    return res;
  }

  async function findPrimarySourceByJobPipeline(context, jobPipelineIds) {
    // Job pipelines are deprecated
    return [];
  }

  async function findPrimarySource(context, jobTemplateIds, jobPipelineIds) {
    let result;
    if (_.isArray(jobTemplateIds) && jobTemplateIds.length > 0) {
      result = await findPrimarySourceByJobTemplate(context, jobTemplateIds);
    }
    if (!result && _.isArray(jobPipelineIds) && jobPipelineIds.length > 0) {
      result = await findPrimarySourceByJobPipeline(context, jobPipelineIds);
    }
    return result; // can be empty
  }

  async function getPrimarySourceType(sourceId) {
    // we actually want the media source type category here.
    const sql = `
SELECT
  mt.media_source_type_category AS id
FROM
  media_source_type AS mt
  INNER JOIN media_source ms ON mt.media_source_type_id = ms.media_source_type_id
WHERE
  ms.media_source_id = $1
    `;
    const dbres = await dbConnections['media_platform'].read.map(
      sql,
      [sourceId],
      (row) => row.id
    );
    return dbres.length ? dbres[0] || 5 : 5; // default to 5 - private media
  }

  const programFormatDefaults = {
    1: 3,
    2: 80,
    3: 100,
    4: 113,
    5: 121
  };

  async function getProgramFormatId(details, primarySourceTypeId) {
    let res = programFormatDefaults[primarySourceTypeId] || 121; // default for 5
    if (details.programFormat) {
      // map string to number
      const sql = `
  SELECT
    program_format_id AS id
  FROM
    program_format
  WHERE
    program_format_name ILIKE $1 AND media_source_type_id = $2
      `;
      const dbres = await dbConnections['media_platform'].read.map(
        sql,
        [details.programFormat, primarySourceTypeId],
        (row) => row.id
      );
      if (!dbres.length) {
        throw new errors.NotFound({
          message:
            details.programFormat +
            ' is not a valid program format for ' +
            'source type category ' +
            primarySourceTypeId,
          data: {
            sourceTypeCategory: primarySourceTypeId,
            programFormat: details.programFormat
          }
        });
      }
      res = dbres[0];
    }
    return res;
  }

  async function extractEngineIdsFromJobTemplateIds(context, input) {
    const engineIds = new Set();
    if (!_.isArray(input.jobTemplateIds) || _.isEmpty(input.jobTemplateIds)) {
      return engineIds;
    }

    const taskTemplates = await dalTaskTemplate.getTaskTemplates(context, {
      jobTemplateId: input.jobTemplateIds,
      applicationId: input.applicationId,
      organizationId: input.organizationId
    });
    if (!_.isEmpty(_.get(taskTemplates, 'records'))) {
      for (let i = 0; i < taskTemplates.records.length; i++) {
        const engineId = taskTemplates.records[i].engineId;
        if (engineId) {
          engineIds.add(engineId);
        }
      }
    }
    return Array.from(engineIds);
  }

  async function validateActiveEngines(context, engineIds, organizationId) {
    const engines = await serviceContext.dal.engine.getEngines(context, {
      ids: engineIds,
      organizationId
    });

    // Check engine found with the input
    if (engines.records.length < engineIds.length) {
      const diffIds = _.difference(
        engineIds,
        engines.records.map((o) => o.id)
      );
      throw new errors.NotFound({
        message: 'Some engines were not found',
        data: {
          engineIds: diffIds
        }
      });
    }

    // Check engine status
    const inactiveEngines = _.filter(
      engines.records,
      (engine) => engine.state !== 'active'
    );

    if (inactiveEngines.length) {
      throw new errors.NotAllowed({
        message: 'Some engines are not active',
        data: {
          inactiveEngineIds: inactiveEngines.map((engine) => engine.id)
        }
      });
    }
  }

  async function validateEngineBuilds(context, engineIds) {
    const engineBuilds = await Promise.all(
      engineIds.map((engineId) => {
        return serviceContext.dal.engine.getEngineBuilds(
          {
            engineId: engineId,
            status: ['deployed']
          },
          context
        );
      })
    );
    const deployedBuilds = engineBuilds.filter((engine) => engine.count > 0);
    if (deployedBuilds.length < engineIds.length) {
      throw new errors.NotAllowed({
        message: 'Some engine builds are not deployed.',
        data: {
          nonDeployedEngineIds: engineIds.filter(
            (engineId) =>
              !deployedBuilds.some((build) =>
                _.some(build.records, (record) => record.engineId === engineId)
              )
          )
        }
      });
    }
  }

  /**
   * This checks organization's limitation, budget
   * @param {*} context the current context
   * @param {*} organizationId the organizationId
   */
  async function checkOrganizationLimitAndBudget(context, organizationId) {
    const organization = await serviceContext.dal.organization.getOrganization(
      context,
      {
        id: organizationId
      }
    );

    const isLimitEnforced = _.get(organization, 'isLimitEnforced', false);
    const remainingBudget = _.get(organization, 'remainingBudget', 0);
    if (isLimitEnforced && remainingBudget <= 0) {
      throw new errors.NotAllowed({
        message:
          'The organization has run out of budget. Job cannot be created.',
        data: {
          organizationId,
          remainingBudget
        }
      });
    }
  }

  /**
   * Find and validate engines
   * @param {*} context the context
   * @param {*} input the input from createScheduleJob/ updateScheduleJob
   * @returns This will throw an error if engineIDs do not exist or the engines/ builds are invalid
   */
  async function extractAndValidateEngines(context, input) {
    const { isUpdate, jobTemplateIds } = input || {};
    if (isUpdate === true && _.isEmpty(jobTemplateIds)) {
      return;
    }
    // extract EngineIds
    const engineIds = await extractEngineIdsFromJobTemplateIds(context, {
      jobTemplateIds: input.jobTemplateIds,
      applicationId: input.applicationId,
      organizationId: input.organizationId
    });
    if (engineIds.length === 0) {
      throw new errors.NotAllowed({
        message: 'No engine IDs were found in the provided templates.',
        data: {
          mutation: 'createScheduledJob'
        }
      });
    }

    const { organizationId } = input;
    // Validate active engines
    await validateActiveEngines(context, engineIds, organizationId);
    // Validate engine builds
    await validateEngineBuilds(context, engineIds);
  }

  async function createScheduledJob(context, args) {
    const input = args.input;
    if (!args.input.organizationId) {
      throw new errors.InvalidInput({
        message:
          'An organizationId value was not provided in the input. ' +
          'The value is set automatically for normal authentication tokens. ' +
          'Clients using internal tokens that are not associated with an ' +
          'organization must set the value explicitly to the ID ' +
          'for the organization on whose behalf the template is created.',
        data: {
          mutation: 'createScheduledJob',
          field: 'organizationId'
        }
      });
    }

    // only superadmin can make public
    if (args.input.isPublic === true) {
      if (!resUtil.isSuperAdmin(context._authInfo)) {
        throw new errors.NotAllowed({
          message:
            'Only Veritone administrators can create public scheduled jobs. ' +
            'Set isPublic to false or remove it from the input to continue.',
          data: {
            input: args.input
          }
        });
      }
    }

    // check organization's limitation, budget
    await checkOrganizationLimitAndBudget(context, input.organizationId);

    // validate access to and existence of job templates and pipelines
    if (_.isArray(input.jobTemplateIds) && input.jobTemplateIds.length > 0) {
      const jobTemplates = await dalJobTemplate.getJobTemplates(context, {
        id: input.jobTemplateIds,
        applicationId: input.applicationId,
        organizationId: input.organizationId
      });
      // some job templates were not found
      if (jobTemplates.count < input.jobTemplateIds.length) {
        const noIds = _.difference(
          input.jobTemplateIds,
          jobTemplates.records.map((obj) => obj.id)
        );
        throw new errors.NotFound({
          message: 'Some job templates could not be found',
          data: {
            objectType: 'JobTemplate',
            objectIds: noIds
          }
        });
      }
    }

    // create any job templates defined here
    if (input.jobTemplates) {
      if (!input.jobTemplateIds) input.jobTemplateIds = [];
      for (let i = 0; i < input.jobTemplates.length; i++) {
        const jobTemplateDef = input.jobTemplates[i];
        jobTemplateDef.organizationId = args.input.organizationId;
        jobTemplateDef.applicationId = args.input.applicationId;
        const newJobTemplate = await dalJobTemplate.createJobTemplate(context, {
          input: jobTemplateDef
        });
        input.jobTemplateIds.push(newJobTemplate.id);
      }
    }

    // compile job templates from any dag templates defined here
    if (
      input.dagTemplates &&
      _.isArray(input.dagTemplates.dagTemplateIds) &&
      input.dagTemplates.dagTemplateIds.length > 0
    ) {
      if (!input.jobTemplateIds) input.jobTemplateIds = [];
      const newTemplateIds = await getJobTemplatesFromDagTemplates(
        context,
        args,
        input.dagTemplates.dagTemplateIds,
        input.dagTemplates.params,
        input.dagTemplates.jobConfig
      );
      input.jobTemplateIds = _.concat(input.jobTemplateIds, newTemplateIds);
    }

    // Validate engines
    await extractAndValidateEngines(context, input);

    // validate existence of data ID if exists TODO

    // create scheduled job sql - core_media

    const sqlParts = [];

    // attempt to extract a primary source ID from task payloads.
    // then extract primary source type ID, which is ACTUALLY the
    // source type CATEGORY in the new schema.
    // this maps to a set of allowed program formats.
    const primarySourceId = await findPrimarySource(
      context,
      input.jobTemplateIds,
      input.jobPipelineIds
    );

    // VTN-11632 - validate access to source. do not include public.
    if (primarySourceId) {
      try {
        const theSource = await serviceContext.dal.source.getSource(context, {
          id: primarySourceId,
          organizationId: input.organizationId,
          includePublic: false
        });
      } catch (err) {
        throw new errors.NotFound({
          message:
            'A scheduled job could not be created with the specified source, ' +
            primarySourceId +
            '. Note that a source can only configured on a scheduled job if ' +
            'the source is owned by or shared with your organization. Change the source ID ' +
            'in the job template payload(s) to continue.',
          data: {
            objectId: primarySourceId,
            objectType: 'Source',
            internalData: {
              error: _.toString(err)
            }
          }
        });
      }
    }
    const primarySourceTypeId = primarySourceId
      ? await getPrimarySourceType(primarySourceId)
      : 5;
    const programFormatId = await getProgramFormatId(
      input.details || {},
      primarySourceTypeId
    );
    if (input.details) delete input.details.programFormat;
    // delete any entry from details as it will
    // be stored in the column with special handling.

    const now = moment(Date.now()).toISOString();
    const sjData = {
      program_name: input.name,
      run_mode: mapRunModeIn(input.runMode),
      organization_id: input.organizationId,
      program_description: input.description || input.name,
      is_active: input.isActive,
      stop_date_time: input.stopDateTime
        ? moment(input.stopDateTime).toISOString()
        : null,
      start_date_time: input.startDateTime
        ? moment(input.startDateTime).toISOString()
        : now,
      primary_media_source_id: primarySourceId,
      media_source_type_id: primarySourceTypeId,
      program_format_id: programFormatId,
      details_schema_id: input.detailsSchemaId,
      is_public: input.isPublic,
      kvp: _.omit(input.details, scheduleDetailColumns),

      // default new sjs to 3 (invactive for recording status)
      recording_status_id: input.ingestionStatusId || 3,
      created_by: _.get(context, '_authInfo.userId'),
      app_application_id: _.get(context, 'requestContext.appId')
    };

    const legacyCols = mapper.decamelizeRootKeys(
      _.pick(input.details, scheduleDetailColumns)
    );
    Object.assign(sjData, legacyCols);

    // TODO validate incoming details against schema ID

    // validate schedule parts
    const weekParts = input.weeklyScheduleParts || [];
    function partError(field, data) {
      if (_.isNil(data[field])) {
        throw new errors.InvalidInput({
          message: 'A weekly schedule part must have ' + field + '.',
          data: {
            input: data
          }
        });
      }
    }
    weekParts.forEach((weekPart) => {
      partError('scheduledDay', weekPart);
      partError('startTime', weekPart);
      partError('stopTime', weekPart);
    });

    // first we have to create the scheduled job to get its ID.
    // old db program table model does not support forced IDs since
    // they must be numerical and in sequence.
    let { sql, values } = mainUtil.makeInsertSql(
      'program',
      sjData,
      scheduledJobSelectData
    );
    const res = await sjDbWrite.map(sql, values, mapScheduledJob);
    const scheduledJob = res[0];
    const id = scheduledJob.id;

    // add an owner ACL because legacy program search requires it
    const groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
      input.organizationId
    );
    const ownerSql = `INSERT INTO program__acl (program_id, acl, permission) VALUES ($1, $2, $3)`;
    const aclRes = await sjDbWrite.query(ownerSql, [id, groupId, 'owner']);

    // create schedule parts - core_media
    input.primarySourceId = primarySourceId;
    const r1 = await setScheduleParts(context, id, input);
    if (_.isArray(input.affiliates) && input.affiliates.length > 0) {
      const r2 = await setAffiliates(context, id, {
        mediaSourceId: primarySourceId,
        parts: input.affiliates
      });
    }
    // set primary talent ID so that mp-das legacy query can find it.
    // it doesn't matter WHICH talent ID unless/until we choose to expose
    // the mapping in the API, so we'll pick one that is Veritone-owned.
    // if one couldn't be found, then we just skip; we're on a non-prod
    // system anyway.
    const defaultTalentId = await getDefaultTalentId(context);
    const talentSql = `
INSERT INTO talent_program
  (talent_id, program_id, is_primary)
VALUES
  ($1, $2, $3)
`;
    if (defaultTalentId) {
      await sjDbWrite.query(talentSql, [defaultTalentId, id, true]);
    }

    // create job pipeline and job template links - job_new
    const r2 = await setJobPipelinesAndJobTemplates(
      context,
      id,
      input.jobPipelineIds || [],
      input.jobTemplateIds || []
    );
    // now we need to handle content templates
    if (input.contentTemplates) {
      const sqlParts = [];
      let allValues = [];

      for (let i = 0; i < input.contentTemplates.length; i++) {
        const template = input.contentTemplates[i];
        template.scheduledJobId = id;
        template.organizationId = input.organizationId;
        let temp = await createContentTemplateSql(context, template, allValues);
        sqlParts.push(temp.sql);
        allValues = allValues.concat(temp.values);
      }
      const allSql = sqlParts.join(';\n');
      const ctRes = await sjDbWrite.map(
        allSql,
        allValues,
        mapper.camelizeRootKeys
      );
    }

    if (input.collaborators) {
      await updateCollaborators(scheduledJob, input.collaborators, false);
    }

    // TODO roll back scheduledJob creation if link creation fails

    // if runMode was 'Now' we saved as 'Once' but launch immediately
    if (input.runMode === 'Now') {
      const organizationId = args.organizationId || input.organizationId;
      const applicationId = args.applicationId || input.applicationId;

      const launchArgs = {
        organizationId,
        applicationId,
        input: {
          organizationId,
          applicationId,
          scheduledJobId: scheduledJob.id
        }
      };
      const launch = await dalJobPipeline.createAllScheduledJobs(
        context,
        launchArgs
      );
    }
    const event = {
      organizationId: input.organizationId,
      id: id,
      type: 'program',
      event: 'program_inserted'
    };
    messageUtil.emitEvent(event, 'events');
    // return a fresh fully hydrated copy
    return getScheduledJob(context, { id: scheduledJob.id });
  }

  async function migrateLegacyProgramToScheduledJobParts(context, sj) {
    const scheduleParts = await getScheduleParts(context, {
      id: sj.id
    });

    let weeklyScheduleParts = scheduleParts.filter(
      (item) => item.scheduleType === 'Weekly'
    );
    // const recurringScheduleParts = scheduleParts.filter(
    //   item => item.scheduleType === 'Interval'
    // );
    const sourceId = sj.primarySourceId;

    const weeklyParts = [];
    const recurringParts = [];

    if (sj.primarySourceTypeId === SOURCE_TYPE.PODCAST) {
      // Podcast, predefined to "0 14,9 * * *" (twice a day at 9 AM and 2 PM UTC)
      recurringParts.push({
        repeatInterval: 1,
        repeatIntervalUnit: 'Days',
        startTime: '09:00'
      });
      recurringParts.push({
        repeatInterval: 1,
        repeatIntervalUnit: 'Days',
        startTime: '14:00'
      });
    } else if (sj.primarySourceTypeId === SOURCE_TYPE.YOUTUBE) {
      // YouTube (Channel), predefined to "0 0 * * *" (once a day at midnight UTC)
      recurringParts.push({
        repeatInterval: 1,
        repeatIntervalUnit: 'Days',
        startTime: '00:00'
      });
    } else {
      // For any other legacy schedule parts, we assume it had weekly schedules
      // so we do a conversion based on locale
      for (const part of weeklyScheduleParts) {
        weeklyParts.push(part);
      }
    }
    return {
      weekly: weeklyParts,
      recurring: recurringParts
    };
  }

  async function migrateLegacyV3JobsToTaskTemplates(
    context,
    sj,
    organizationId,
    applicationId
  ) {
    const taskTemplates = [];
    const jobTemplates = [];
    const jobPipelineIds = [];

    if (!sj.primarySourceTypeId) {
      throw new errors.InvalidInput({
        message: 'Clone scheduled job needs to have a primary source type id.',
        data: {
          mutation: 'cloneScheduledJob',
          field: 'primarySourceTypeId'
        }
      });
    }
    // add derived adapter from media source type of program
    const candidateAdapters = await serviceContext.dal.engine.getEngines(
      context,
      {
        engineCategoryId: [
          '4b150c85-82d0-4a18-b7fb-63e4a58dfcce' // pull
        ],
        buildFilters: {
          mediaSourceTypeId: sj.primarySourceTypeId
        }
      }
    );
    if (candidateAdapters.records.length > 0) {
      const ingestionAdapter = candidateAdapters.records[0];
      const ingestionAdapterTaskTemplate = {
        engineId: ingestionAdapter.id,
        payload: {
          sourceId: sj.primarySourceId.toString()
        }
      };
      taskTemplates.push(ingestionAdapterTaskTemplate);
    }

    // if any legacy engines match to real time engines, we use the
    // real time engine instead
    const tasks = sj.v3Job.tasks || [];
    for (const task of tasks) {
      const taskTemplate = {
        engineId: task.engineId || task.taskType,
        payload: task.taskPayload
      };
      const realTimeEngine = legacyToRTEngineMap[taskTemplate.engineId];
      if (realTimeEngine) {
        taskTemplate.engineId = realTimeEngine;
      }
      taskTemplates.push(taskTemplate);
    }

    let pmiCluster;
    if (sj.primarySourceTypeId === SOURCE_TYPE.RADIO) {
      // attempt to find pmi cluster, if not will default to default RT cluster
      const clusters = await serviceContext.dal.cluster.getClusterList(
        context,
        {
          id: DEFAULT_PMI_CLUSTER_ID
        }
      );

      if (clusters.count > 0) {
        pmiCluster = clusters.records[0];
      }
    }

    const jobTemplateDef = {
      jobConfig: {
        maxTDODuration: 15
      },
      clusterId: pmiCluster ? pmiCluster.id : null,
      applicationId: applicationId,
      organizationId: organizationId,
      taskTemplates: taskTemplates
    };
    const newJobTemplate = await dalJobTemplate.createJobTemplate(context, {
      input: jobTemplateDef
    });
    if (newJobTemplate.jobPipelineId) {
      jobPipelineIds.push(newJobTemplate.jobPipelineId);
    } else {
      jobTemplates.push(newJobTemplate);
    }

    const jobTemplateIds = jobTemplates.map((obj) => obj.id);

    return {
      jobTemplateIds,
      jobPipelineIds
    };
  }

  function revertMigratedProgramMetadata(scheduledJob) {
    const details = scheduledJob.details || {};
    scheduleDetailColumns.forEach((column) => {
      details[column] = scheduledJob[column];
    });
    details.programFormat = scheduledJob.programFormat;

    details.v3Job.reverted = true;
    details.v3Job.migrated = false;

    return details;
  }

  function migrateLegacyProgramMetadataToDetails(scheduledJob) {
    // copy over all details
    const details = scheduledJob.details || {};
    scheduleDetailColumns.forEach((column) => {
      details[column] = scheduledJob[column];
    });
    details.programFormat = scheduledJob.programFormat;

    // set migrated on v3 job to use as marker
    // keeping v3 job details for revert if needed
    details.v3Job.migrated = true;
    details.v3Job.migration = {
      legacyIngestionStatusId: scheduledJob.ingestionStatusId
    };

    return details;
  }

  async function cloneScheduledJob(context, args) {
    if (!args.input.organizationId) {
      throw new errors.InvalidInput({
        message:
          'An organizationId value was not provided in the input. ' +
          'The value is set automatically for normal authentication tokens. ' +
          'Clients using internal tokens that are not associated with an ' +
          'organization must set the value explicitly to the ID ' +
          'for the organization on whose behalf the template is created.',
        data: {
          mutation: 'cloneScheduledJob',
          field: 'organizationId'
        }
      });
    }

    const applicationId = await serviceContext.dal.application.getAppIdFromOrgId(
      args.input.organizationId
    );

    const input = args.input;
    const sj = await getScheduledJob(context, {
      id: input.id,
      organizationId: input.organizationId
    });

    const legacyScheduledJob = !_.get(sj, 'v3Job.migrated', false);
    let jobTemplateIds = [];
    let jobPipelineIds = [];
    const affiliates = _.get(
      await getAffiliates(context, {}, sj),
      'records',
      []
    );
    // check if sj is old format, if so upgrade it to the new format
    if (legacyScheduledJob) {
      const results = await migrateLegacyV3JobsToTaskTemplates(
        context,
        sj,
        args.input.organizationId,
        applicationId
      );
      jobTemplateIds = results.jobTemplateIds;
      jobPipelineIds = results.jobPipelineIds;

      await migrateLastProcessedDateToSource(context, sj);
    } else {
      // todo: get and copy job templates for scheduled jobs
      throw new errors.InvalidInput({
        message: 'Clone scheduled job only works on legacy programs currently.',
        data: {
          mutation: 'cloneScheduledJob',
          field: 'id'
        }
      });
    }

    const migratedScheduleParts = await migrateLegacyProgramToScheduledJobParts(
      context,
      sj
    );

    const weeklyScheduleParts = migratedScheduleParts.weekly;
    const recurringScheduleParts = migratedScheduleParts.recurring;

    const details = migrateLegacyProgramMetadataToDetails(sj);
    details.v3Job.cloned = true;

    const createdSj = await createScheduledJob(context, {
      input: {
        applicationId: applicationId,
        organizationId: args.input.organizationId,
        jobTemplateIds: jobTemplateIds,
        jobPipelineIds: jobPipelineIds,
        name: sj.name,
        description: sj.description,
        isPublic: sj.isPublic,
        runMode: 'Recurring', // all legacy programs are recurring
        weeklyScheduleParts: weeklyScheduleParts,
        recurringScheduleParts: recurringScheduleParts,
        details: details,
        affiliates: affiliates,
        ingestionStatusId: 3 // inactive to disable in crontab legacy ingestion
      }
    });
    return createdSj;
  }

  async function revertScheduledJob(context, args) {
    if (!args.input.organizationId) {
      throw new errors.InvalidInput({
        message:
          'An organizationId value was not provided in the input. ' +
          'The value is set automatically for normal authentication tokens. ' +
          'Clients using internal tokens that are not associated with an ' +
          'organization must set the value explicitly to the ID ' +
          'for the organization on whose behalf the template is created.',
        data: {
          mutation: 'revertScheduledJob',
          field: 'organizationId'
        }
      });
    }

    const input = args.input;
    const sj = await getScheduledJob(context, {
      id: input.id,
      organizationId: input.organizationId
    });

    const legacyScheduledJob = !_.get(sj, 'v3Job.migrated', false);
    if (legacyScheduledJob) {
      throw new errors.InvalidInput({
        message: 'This scheduled job is already a legacy schedule job.',
        data: {
          mutation: 'revertScheduledJob',
          field: 'id'
        }
      });
    }

    // arrange fields used to update the scheduled job
    const fields = {
      details: revertMigratedProgramMetadata(sj),

      // legacy programs use runMode Once (though they should be Recurring also..)
      // crontab uses this to filter legacy programs vs. migrated/scheduled jobs
      runMode: 'Once'
    };
    let kvp;
    if (fields.details) kvp = _.omit(fields.details, scheduleDetailColumns);

    // now update the scheduled job itself
    if (Object.keys(fields).length) {
      const columns = {
        // old crontab record doesn't care about is active programs
        // new crontab adapter run only queries for active programs
        is_active: false,
        run_mode: fields.runMode ? mapRunModeIn(fields.runMode) : null,
        v3_job: fields.details.v3Job,
        recording_status_id:
          fields.details.v3Job.migration.legacyIngestionStatusId,
        kvp: kvp
      };

      Object.assign(
        columns,
        mapper.decamelizeRootKeys(_.pick(fields.details, scheduleDetailColumns))
      );
      const { sql, values } = mainUtil.makeUpdateSql(
        'program',
        columns,
        scheduledJobSelectData,
        `program_id = ${sj.id}`,
        0,
        false
      );

      const sres = await sjDbWrite.query(sql, values);
    }

    // re-retrieve a fresh copy to return
    const updatedJob = await getScheduledJob(context, { id: sj.id });

    return updatedJob;
  }

  /**
   * Updates the lastProcessedDateTime property for podcast/youtube sources
   *
   * @param context
   * @param sj
   * @returns {Promise<void>}
   */
  async function migrateLastProcessedDateToSource(context, sj) {
    const sourceTypeId = sj.primarySourceTypeId;
    const sourceId = sj.primarySourceId;

    if ([SOURCE_TYPE.PODCAST, SOURCE_TYPE.YOUTUBE].includes(sourceTypeId)) {
      const source = await dalSource.getSource(context, {
        id: sourceId
      });

      if (_.has(source, 'state.lastProcessedDateTime')) {
        logger.debug(`Source ${sourceId} already has lastProcessedDateTime`);
        return;
      }

      // Scans latest tdo for source in last 30 days
      const tdos = await getAllTDOsForSource(sourceId);
      if (_.isEmpty(tdos)) {
        logger.debug(`Source ${sourceId} has no ingested TDOs`);
      }
      const latestTDO = _.maxBy(tdos, 'json.startDateTime');
      const lastProcessedDateTime = moment
        .unix(latestTDO.json.startDateTime)
        .valueOf();

      const newState = Object.assign({}, source.state, {
        lastProcessedDateTime
      });

      if (SOURCE_TYPE.PODCAST) {
        newState.mediaIds = await computeProcessedMediaHashes(tdos);
      }

      await dalSource.updateSource(context, {
        organizationId: source.organizationId,
        input: {
          id: sourceId,
          organizationId: source.organizationId,
          state: newState
        }
      });
    }
  }

  async function getAllTDOsForSource(sourceId) {
    const limit = 1000;
    const sql = `SELECT json
      FROM recording.recording
      WHERE source_id = $1::TEXT LIMIT $2 OFFSET $3`;
    let offset = 0;

    let results = await jobDbRead.query(sql, [sourceId, limit, offset]);
    let tdos = results;
    while (results.length === limit) {
      offset += limit;
      results = await jobDbRead.query(sql, [sourceId, limit, offset]);
      tdos = tdos.concat(results);
    }
    return tdos;
  }

  // Similar to https://github.com/veritone/podcast-ripper/blob/master/podcast-ripper.go#L362
  async function computeProcessedMediaHashes(tdos) {
    const hashes = new Set();
    tdos.forEach((tdo) => {
      const start = moment.unix(tdo.json.startDateTime).toISOString();
      const durationMins = moment
        .unix(tdo.json.stopDateTime)
        .diff(start, 'minutes');
      hashes.add(uuidv5(`${start}@@${durationMins}`, uuidNamespace));
    });
    return Array.from(hashes);
  }

  async function deleteScheduledJob(context, args) {
    // validate access to scheduled job
    const sj = await getScheduledJob(context, args);

    // delete all schedules
    const sp = await setScheduleParts(context, args.id, {});

    // one query will delete the scheduled job and any content templates
    const sql = `
DELETE FROM scheduled_job_content_template
WHERE scheduled_job_id = $1;

DELETE FROM talent_program
WHERE program_id = $1;

DELETE FROM program__acl
WHERE program_id = $1;

DELETE FROM
  program_schedule_day
WHERE
  program_schedule_id IN
  (
    SELECT
      program_schedule_id
    FROM
      program_schedule
    WHERE
      program_id = $1
   );

DELETE FROM
  program_schedule
WHERE
  program_id = $1;

DELETE FROM program
WHERE
  program_id = $1 AND organization_id = $2
    `;
    const res = await sjDbWrite.query(sql, [args.id, args.organizationId]);
    const event = {
      organizationId: args.organizationId,
      id: args.id,
      type: 'program',
      event: 'program_deleted'
    };
    messageUtil.emitEvent(event, 'events');
    return {
      id: args.id,
      message: 'ScheduledJob deleted'
    };
  }

  // check and return media source type Id, sourceId, program format Id from inputs, scheduled job
  async function getMediaSourceDetails(context, args, scheduledJob) {
    const fnName = '(getMediaSourceDetails)';
    const input = args.input;
    if (!input) {
      throw new errors.InvalidInput(`${fnName} Missing input in the args`);
    }
    if (!scheduledJob) {
      throw new errors.InvalidInput(`${fnName} Missing scheduled job info`);
    }

    // Find and update primaryMediaSourceId if it has changed
    // Default values should be old values for sourceTypeId, sourceId
    let mediaSourceTypeId = scheduledJob.sourceTypeId;
    let primaryMediaSourceId = scheduledJob.primarySourceId;
    let programFormatId = scheduledJob.programFormatId;

    // update template and pipeline IDs if needed
    if (input.jobTemplateIds) {
      const jobTemplateIds =
        input.jobTemplateIds ||
        (await getJobTemplateIdsForScheduledJob(context, {
          id: scheduledJob.id,
          organizationId: scheduledJob.organizationId
        }));

      const jres = await setJobPipelinesAndJobTemplates(
        context,
        scheduledJob.id,
        [],
        jobTemplateIds
      );
      const newPrimarySourceId = await findPrimarySource(
        context,
        jobTemplateIds,
        []
      );
      // if the primary source ID has changed, recompute
      // source type and validate program format
      if (
        newPrimarySourceId &&
        newPrimarySourceId !== scheduledJob.primarySourceId
      ) {
        // first get new source type category.
        const newSourceTypeId = await getPrimarySourceType(newPrimarySourceId);
        primaryMediaSourceId = newPrimarySourceId;

        // if source type category has changed, reset and check program format.
        if (newSourceTypeId !== scheduledJob.sourceTypeId) {
          // update source type and validate program format
          mediaSourceTypeId = newSourceTypeId;
          // validate it and get ID
          // this will throw if it's not valid.
          programFormatId = await getProgramFormatId(
            input.details || {},
            newSourceTypeId
          );
          if (input.details) delete input.details.programFormat;
        }
      }
    }

    return {
      mediaSourceTypeId,
      primaryMediaSourceId,
      programFormatId
    };
  }

  async function updateScheduledJob(context, args) {
    const input = args.input;

    // first validate existence of and access to existing scheduled job
    const sj = await getScheduledJob(context, {
      id: input.id,
      organizationId: input.organizationId,
      applicationId: input.applicationId
    });
    // only superadmin can make public
    if (sj.isPublic !== input.isPublic && input.isPublic === true) {
      if (!resUtil.isSuperAdmin(context._authInfo)) {
        throw new errors.NotAllowed({
          message:
            'Only Veritone administrators can create public scheduled jobs. ' +
            'Set isPublic to false or remove it from the input to continue.',
          data: {
            input: input
          }
        });
      }
    } else {
      input.isPublic = sj.isPublic;
    }

    const migrateIfLegacy = input.migrateIfLegacy;
    const legacyScheduledJob = !_.get(sj, 'v3Job.migrated', false);
    const migrateToNewScheduleJobModel = migrateIfLegacy && legacyScheduledJob;

    if (migrateToNewScheduleJobModel) {
      // migrate over legacy program schedules to new schedule parts
      const migratedScheduleParts = await migrateLegacyProgramToScheduledJobParts(
        context,
        sj
      );

      input.weeklyScheduleParts = migratedScheduleParts.weekly;
      input.recurringScheduleParts = migratedScheduleParts.recurring;
      await migrateLastProcessedDateToSource(context, sj);
    }

    // arrange fields used to update the scheduled job
    const fields = _.pick(input, [
      'name',
      'description',
      'runMode',
      'isActive',
      'isPublic',
      'details',
      'sdoId',
      'startDateTime',
      'stopDateTime',
      'detailsSchemaId',
      'ingestionStatus',
      'ingestionStatusId'
    ]);

    if (migrateToNewScheduleJobModel) {
      const sjApplicationId = await serviceContext.dal.application.getAppIdFromOrgId(
        sj.organizationId
      );
      const results = await migrateLegacyV3JobsToTaskTemplates(
        context,
        sj,
        sj.organizationId,
        sjApplicationId
      );
      input.jobTemplateIds = results.jobTemplateIds;
      input.jobPipelineIds = results.jobPipelineIds;
      fields.details = migrateLegacyProgramMetadataToDetails(sj);
      fields.runMode = 'Recurring';
    }

    // create any job templates defined here
    if (input.jobTemplates) {
      if (!input.jobTemplateIds) input.jobTemplateIds = [];
      for (let i = 0; i < input.jobTemplates.length; i++) {
        const jobTemplateDef = input.jobTemplates[i];
        jobTemplateDef.organizationId = args.input.organizationId;
        jobTemplateDef.applicationId = args.input.applicationId;
        const newJobTemplate = await dalJobTemplate.createJobTemplate(context, {
          input: jobTemplateDef
        });
        input.jobTemplateIds.push(newJobTemplate.id);
      }
    }

    // compile job templates from any dag templates defined here
    if (
      input.dagTemplates &&
      _.isArray(input.dagTemplates.dagTemplateIds) &&
      input.dagTemplates.dagTemplateIds.length > 0
    ) {
      if (!input.jobTemplateIds) input.jobTemplateIds = [];
      const newTemplateIds = await getJobTemplatesFromDagTemplates(
        context,
        args,
        input.dagTemplates.dagTemplateIds,
        input.dagTemplates.params,
        input.dagTemplates.jobConfig
      );
      input.jobTemplateIds = _.concat(input.jobTemplateIds, newTemplateIds);
    }

    // Validate engines
    await extractAndValidateEngines(context, { ...input, isUpdate: true });

    // Find and update primaryMediaSourceId if it has changed
    let {
      mediaSourceTypeId,
      primaryMediaSourceId,
      programFormatId
    } = await getMediaSourceDetails(context, { input }, sj);

    fields.mediaSourceTypeId = mediaSourceTypeId || sj.sourceTypeId;
    fields.primaryMediaSourceId = primaryMediaSourceId || sj.primarySourceId;
    fields.programFormatId = programFormatId || sj.programFormatId;

    // update schedule information if needed
    if (input.weeklyScheduleParts || input.recurringScheduleParts) {
      // we'll need to populate the schedule parts, and only update one or the other
      const sInput = {
        weeklyScheduleParts: input.weeklyScheduleParts,
        recurringScheduleParts: input.recurringScheduleParts,
        oldPrimarySourceId: sj.primarySourceId,
        primarySourceId: fields.primaryMediaSourceId,
        organizationId: sj.organizationId
      };

      const sres = await setScheduleParts(context, sj.id, sInput);
    }

    if (input.affiliates) {
      // update affiliate info if provided (full update)
      const sres = await setAffiliates(context, sj.id, {
        mediaSourceId: fields.primaryMediaSourceId,
        parts: input.affiliates
      });
    }

    if (_.get(input, 'details.programFormat')) {
      // if program format changed, validate against source type
      fields.programFormatId = await getProgramFormatId(
        input.details,
        fields.mediaSourceTypeId
      );
      delete input.details.programFormat;
    }

    // TODO update SDO if needed

    let kvp;
    const nullValueFields = {};
    if (fields.details) kvp = _.omit(fields.details, scheduleDetailColumns);

    // now update the scheduled job itself
    if (Object.keys(fields).length) {
      const columns = {
        program_name: fields.name,
        program_description: fields.description,
        run_mode: fields.runMode ? mapRunModeIn(fields.runMode) : null,
        is_active: fields.isActive,
        start_date_time: fields.startDateTime
          ? moment(fields.startDateTime).toISOString()
          : null,
        is_public: fields.isPublic,
        details_schema_id: fields.detailsSchemaId,
        primary_media_source_id: fields.primaryMediaSourceId,
        media_source_type_id: fields.mediaSourceTypeId,
        program_format_id: fields.programFormatId,
        kvp: kvp
      };
      if (fields.stopDateTime) {
        columns.stop_date_time = moment(fields.stopDateTime).toISOString();
      }
      if (fields.stopDateTime === null) {
        columns.stop_date_time = null;
        nullValueFields.stop_date_time = true;
      }

      if (fields.ingestionStatus && INGESTION_STATUS[fields.ingestionStatus]) {
        columns.recording_status_id = INGESTION_STATUS[fields.ingestionStatus];
      }

      // If both ingestionStatus and ingestionStatusId are set,
      // the higher priority would be ingestionStatusId.
      if (fields.ingestionStatusId) {
        const allowedIngestionIds = _.valuesIn(INGESTION_STATUS);

        if (!allowedIngestionIds.includes(parseInt(fields.ingestionStatusId))) {
          throw new errors.InvalidInput({
            message: 'Invalid ingestionStatusId input.',
            data: {
              objectType: 'ingestionStatusId',
              objectId: fields.ingestionStatusId
            }
          });
        }

        columns.recording_status_id = fields.ingestionStatusId;
      }

      if (migrateToNewScheduleJobModel) {
        columns.v3_job = fields.details.v3Job;

        // set to inactive recording to stop on crontab legacy ingestion
        columns.recording_status_id = INGESTION_STATUS.INACTIVE;
      }

      // TODO validate details against schema
      Object.assign(
        columns,
        mapper.decamelizeRootKeys(_.pick(fields.details, scheduleDetailColumns))
      );
      const { sql, values } = mainUtil.makeUpdateSql(
        'program',
        columns,
        scheduledJobSelectData,
        `program_id = ${sj.id}`,
        0,
        false,
        nullValueFields
      );

      const sres = await sjDbWrite.query(sql, values);
      const event = {
        organizationId: input.organizationId,
        id: sj.id,
        type: 'program',
        event: 'program_updated'
      };
      messageUtil.emitEvent(event, 'events');
    }

    // now we need to handle content templates
    if (input.contentTemplates) {
      // this isn't the optimal method, but for now we are going to just
      // brute-force wipe all existing content templates off the source
      // and re-add. as a future optimization we can check to see if the
      // incoming sdo ids contain any that are already on the source and,
      // if so, don't change them. only add new, remove any that don't
      // exist, and create new for templates where data not sdoId was given.
      const deleteSql = `
  DELETE FROM
  scheduled_job_content_template
  WHERE
  scheduled_job_id = $1`;
      // note that we already authorized access to this source so we can
      // safely delete all templates attached to it without the extra
      // org ID check against source table.
      const sqlParts = [deleteSql];
      let allValues = [_.toString(input.id)];

      for (let i = 0; i < input.contentTemplates.length; i++) {
        const template = input.contentTemplates[i];
        template.scheduledJobId = input.id;
        template.organizationId = input.organizationId;
        let temp = await createContentTemplateSql(context, template, allValues);
        sqlParts.push(temp.sql);
        allValues = allValues.concat(temp.values);
      }
      const allSql = sqlParts.join(';\n');
      const ctRes = await sjDbWrite.map(
        allSql,
        allValues,
        mapper.camelizeRootKeys
      );
    }
    if (input.collaborators) {
      await updateCollaborators(sj, input.collaborators, true);
    }
    // re-retrieve a fresh copy to return
    const updatedJob = await getScheduledJob(context, { id: sj.id });
    if (input.runMode === 'Now') {
      const args = {
        input: {
          scheduledJobId: sj.id
        }
      };
      const launch = await dalJobPipeline.createAllScheduledJobs(context, args);
    }

    return updatedJob;
  }

  async function setAffiliates(context, scheduledJobId, affiliateInput) {
    const parts = [];
    const affiliateParts = affiliateInput.parts || [];
    const values = [scheduledJobId, affiliateInput.mediaSourceId];
    // first we'll clear affiliate schedule and parts
    parts.push(`
DELETE FROM
  program_schedule_day
WHERE
  program_schedule_id IN
  (
    SELECT
      program_schedule_id
    FROM
      program_schedule
    WHERE
      program_id = $1
      AND media_source_id IS NOT NULL
      AND media_source_id != $2
   )
    `);
    parts.push(`
DELETE FROM
  program_schedule
WHERE
  program_id = $1
    AND media_source_id IS NOT NULL
    AND media_source_id != $2
    `);

    const affiliateSourceIdToPartsMap = {};

    affiliateParts.forEach((part) => {
      const affiliateParts = affiliateSourceIdToPartsMap[part.sourceId] || [];

      // only insert when first time seeing source id of an affiliate
      if (affiliateParts.length === 0) {
        parts.push(`
        INSERT INTO program_schedule (
          program_id,
          date_start,
          date_end,
          schedule_status_id,
          media_source_id
        ) VALUES (
          $1,
          \$${values.length + 1},
          \$${values.length + 2},
          1,
          \$${values.length + 3}
        ) RETURNING *
                  `);

        values.push(moment(part.startDateTime).toISOString());
        values.push(moment(part.stopDateTime).toISOString());
        values.push(part.sourceId);
      }

      const stopTime = part.stopTime || part.startTime;
      affiliateParts.push({
        startTime: mainUtil.timeOnlyToUTCString(part.startTime),
        stopTime: mainUtil.timeOnlyToUTCString(stopTime),
        scheduledDay: dayMapIn[part.scheduledDay]
      });
      affiliateSourceIdToPartsMap[part.sourceId] = affiliateParts;
    });

    const sql = parts.join('\n;\n');
    const res1 = await sjDbWrite.query(sql, values);

    // update mapping of affiliate parts to use program schedule id
    if (res1.length) {
      const psdValues = [];
      const psdParts = [];

      res1.forEach((res) => {
        const psId = res.program_schedule_id;
        const psSourceId = res.media_source_id;

        // for each affiliate, we need to make the program_schedule_date rows
        const affiliateParts = affiliateSourceIdToPartsMap[psSourceId] || [];
        affiliateParts.forEach((part) => {
          psdParts.push(`
INSERT INTO program_schedule_day (
  program_schedule_id,
  program_schedule_day_of_week,
  start_time,
  end_time
) VALUES (
  \$${psdValues.length + 1},
  \$${psdValues.length + 2},
  \$${psdValues.length + 3},
  \$${psdValues.length + 4}
) RETURNING *
          `);
          psdValues.push(psId);
          psdValues.push(part.scheduledDay);
          psdValues.push(part.startTime);
          psdValues.push(part.stopTime);
        });
      });

      if (psdParts.length) {
        const res2 = await sjDbWrite.query(psdParts.join('\n;\n'), psdValues);
      }
    }

    return res1;
  }

  async function setScheduleParts(context, scheduledJobId, jobInput) {
    const parts = [];
    const weeklyParts = jobInput.weeklyScheduleParts || [];
    const recurringParts = jobInput.recurringScheduleParts || [];
    const oldPrimarySourceId =
      jobInput.oldPrimarySourceId || jobInput.primarySourceId;
    const values = [
      scheduledJobId,
      jobInput.primarySourceId,
      oldPrimarySourceId
    ];
    // first we'll clear daily schedule parts
    parts.push(`
DELETE FROM
  program_schedule_day
WHERE
  program_schedule_id IN
  (SELECT
    program_schedule_id
  FROM
    program_schedule
  WHERE
    program_id = $1 AND (media_source_id IS NULL OR media_source_id = -1 OR media_source_id = $2 OR media_source_id = $3))
    `);
    // now clear recurring schedule parts
    parts.push(`
DELETE FROM
  recurring_schedule
WHERE
  scheduled_job_id = $1
    `);
    parts.push(`
DELETE FROM
  program_schedule
WHERE
  program_id = $1 AND (media_source_id IS NULL OR media_source_id = -1 OR media_source_id = $2 OR media_source_id = $3)
    `);

    // now we need to add the new schedule parts
    /*
    scheduledDay: DayOfWeek
    startTime: Time
    endTime: Time
    startDateTime: DateTime
    endDateTime: DateTime
   */

    let liveTimezone = 'UTC';
    if (jobInput.primarySourceId) {
      // Need to convert to station local time if offset was passed
      const source = await serviceContext.dal.source.getSource(context, {
        id: jobInput.primarySourceId,
        includePublic: true,
        organizationId: jobInput.organizationId
      });
      liveTimezone = source.liveTimezone;
    }

    recurringParts.forEach((part) => {
      parts.push(`
INSERT INTO recurring_schedule  (
  scheduled_job_id,
  interval_units,
  interval,
  duration_seconds,
  time_of_day
)
VALUES (
  $1,
  \$${values.length + 1},
  \$${values.length + 2},
  \$${values.length + 3},
  \$${values.length + 4}
) RETURNING *
      `);
      if (part.durationSeconds < 0) {
        throw new errors.InvalidInput({
          message: 'Recurring schedule part duration should be positive.',
          data: {
            mutation: 'setScheduleParts',
            field: 'durationSeconds'
          }
        });
      }
      values.push(mapUnitsIn(part.repeatIntervalUnit));
      values.push(part.repeatInterval);
      values.push(part.durationSeconds);
      values.push(
        mainUtil.timeOnlyToString(
          mainUtil.adjustTimeToZone(part.startTime, liveTimezone),
          true
        )
      );
    });

    const weeklySubParts = [];
    weeklyParts.forEach((part) => {
      parts.push(`
INSERT INTO program_schedule (
  program_id,
  date_start,
  date_end,
  schedule_status_id,
  media_source_id
) VALUES (
  $1,
  \$${values.length + 1},
  \$${values.length + 2},
  1,
  \$${values.length + 3}
) RETURNING *
      `);
      values.push(moment(jobInput.startDateTime).toISOString());
      values.push(moment(jobInput.stopDateTime).toISOString());
      values.push(jobInput.primarySourceId || -1);

      // database requires a value for stopTime. if it wasn't provided,
      // we'll set to the start time. this represents a zero-duration
      // (non-live/streaming) ingestion.
      const stopTime = part.stopTime || part.startTime;
      weeklySubParts.push({
        startTime: mainUtil.timeOnlyToString(
          mainUtil.adjustTimeToZone(part.startTime, liveTimezone),
          true
        ),
        stopTime: mainUtil.timeOnlyToString(
          mainUtil.adjustTimeToZone(stopTime, liveTimezone),
          true
        ),
        scheduledDay: dayMapIn[part.scheduledDay]
      });
    });

    const sql = parts.join('\n;\n');
    const res1 = await sjDbWrite.query(sql, values);

    // update program_schedule_id on the scheduled job
    if (res1.length) {
      const psId = res1[0].program_schedule_id;
      const psiSql = `
UPDATE program
SET program_schedule_id = $1
WHERE program_id = $2
    `;
      const psiRes = await sjDbWrite.query(psiSql, [psId, scheduledJobId]);
    }
    // for each weekly part, we need to make the program_schedule_date rows
    const psdValues = [];
    const psdParts = [];
    let psdIndex = 0;
    res1.forEach((row) => {
      if (row.program_schedule_id) {
        psdParts.push(`
INSERT INTO program_schedule_day (
  program_schedule_id,
  program_schedule_day_of_week,
  start_time,
  end_time
) VALUES (
  \$${psdValues.length + 1},
  \$${psdValues.length + 2},
  \$${psdValues.length + 3},
  \$${psdValues.length + 4}
) RETURNING *
       `);
        psdValues.push(row.program_schedule_id);
        psdValues.push(weeklySubParts[psdIndex].scheduledDay);
        psdValues.push(weeklySubParts[psdIndex].startTime);
        psdValues.push(weeklySubParts[psdIndex].stopTime);
        psdIndex++;
      }
    });
    if (psdParts.length) {
      const res2 = await sjDbWrite.query(psdParts.join('\n;\n'), psdValues);
    }

    return res1;
  }

  const unitsInMap = {
    Seconds: 1,
    Minutes: 2,
    Hours: 3,
    Days: 4,
    Weeks: 5,
    Months: 6
  };

  const unitsOutMap = {
    1: 'Seconds',
    2: 'Minutes',
    3: 'Hours',
    4: 'Days',
    5: 'Weeks',
    6: 'Months'
  };

  function mapUnitsIn(unit) {
    const res = unitsInMap[unit];
    if (!res)
      throw new Error(
        'unknown unit ' + unit + ' from ' + JSON.stringify(unitsInMap)
      );
    return res;
  }

  function mapUnitsOut(unit) {
    return unitsOutMap[unit];
  }

  async function setJobPipelinesAndJobTemplates(
    context,
    scheduledJobId,
    jobPipelineIds,
    jobTemplateIds
  ) {
    const parts = [];
    const allValues = [_.toString(scheduledJobId)];
    // first add cleanup query
    parts.push(`
DELETE FROM
  job_new.scheduled_job__job_template
WHERE
  scheduled_job_id = $1
`);
    parts.push(`
DELETE FROM
  job_new.scheduled_job__job_pipeline
WHERE
  scheduled_job_id = $1
    `);

    jobTemplateIds.forEach((jobTemplateId) => {
      allValues.push(jobTemplateId);
      parts.push(`
INSERT INTO
  job_new.scheduled_job__job_template
(
  scheduled_job_id,
  job_template_id
) VALUES (
  $1,
  \$${allValues.length}
) RETURNING
  scheduled_job_id,
  job_template_id
      `);
    });

    jobPipelineIds.forEach((jobPipelineId) => {
      allValues.push(jobPipelineId);
      parts.push(`
INSERT INTO
  job_new.scheduled_job__job_pipeline
(
  scheduled_job_id,
  job_pipeline_id
) VALUES (
  $1,
  \$${allValues.length}
) RETURNING
  scheduled_job_id,
  job_pipeline_id
      `);
    });

    const jobRes = await jobDbWrite.query(parts.join('\n;\n'), allValues);

    // now we need to write JSON to the scheduled jobs table to cache this info.
    let jobTable = 'job_new.job_template';
    let taskTable = 'job_new.task_template';
    const argJobIds = jobTemplateIds.map((id) => `'${id}'`).join(',');
    const argPipelineIds = jobPipelineIds.map((id) => `'${id}'`).join(',');
    const or = [];
    if (jobTemplateIds.length) {
      or.push(`j.template_id IN (${argJobIds})`);
    }
    const taskQuery = `
SELECT
  j.template_id,
  j.cluster_id,
  t.task_template_id,
  e.engine_id,
  e.engine_name,
  c.engine_category_id,
  et.engine_type_name,
  et.engine_type_id
FROM
  ${jobTable} AS j
  INNER JOIN ${taskTable} t ON t.job_template_id = j.template_id
  INNER JOIN job_new.engine AS e ON t.engine_id = e.engine_id
  INNER JOIN job_new.engine_category AS c ON e.engine_category_id = c.engine_category_id
  INNER JOIN job_new.engine_type AS et ON c.engine_type_id = et.engine_type_id
  LEFT JOIN job_new.scheduled_job__job_template jt ON jt.job_template_id = j.template_id
WHERE
  (
  ${or.join(' OR ')}
  )
    `;
    let taskRes = or.length ? await jobDbRead.query(taskQuery) : [];

    // now condense tasks into an aggregated data set
    const agg = {
      engineIds: [],
      engineCategoryIds: [],
      engineTypeIds: [],
      engineTypeNames: [],
      clusterIds: [],
      numTaskTemplates: 0,
      numJobTemplates: 0,
      jobTemplateIds,
      jobPipelineIds
    };
    const jobs = {};
    taskRes.forEach((row) => {
      // increment task count
      agg.numTaskTemplates++;
      // add job to list, which includes task count per job
      if (!jobs[row.template_id]) jobs[row.template_id] = 0;
      jobs[row.template_id]++;

      // add engine ID
      if (!agg.engineIds.includes(row.engine_id))
        agg.engineIds.push(row.engine_id);
      if (!agg.engineCategoryIds.includes(row.engine_category_id))
        agg.engineCategoryIds.push(row.engine_category_id);
      if (!agg.engineTypeIds.includes(row.engine_type_id))
        agg.engineTypeIds.push(row.engine_type_id);
      if (!agg.engineTypeNames.includes(row.engine_type_name))
        agg.engineTypeNames.push(row.engine_type_name);
      if (!agg.clusterIds.includes(row.cluster_id))
        agg.clusterIds.push(row.cluster_id);
    });
    agg.numJobTemplates = Object.keys(jobs).length;
    agg.allJobTemplateIds = Object.keys(jobs);
    const sjUpdateSql = `
UPDATE program
SET task_data = $1::JSONB
WHERE program_id = $2
  `;

    const sjRes = await sjDbWrite.query(sjUpdateSql, [agg, scheduledJobId]);
    return sjRes;
  }

  function getJobTemplateIdsForScheduledJob(context, args) {
    return dalJobTemplate
      .getJobTemplates(context, {
        scheduledJobId: args.id,
        organizationId: args.organizationId,
        limit: 500,
        offset: 0
      })
      .then((res) => res.records.map((item) => item.id));
  }

  const contentTemplateSelectData = {
    scheduled_job_content_template_id: 'id',
    scheduled_job_id: null,
    sdo_id: null,
    data_registry_id: 'schema_id',
    created_date_time: null,
    date_modified: 'modified_date_time'
  };

  async function createScheduledJobContentTemplate(context, args) {
    const input = args.input;
    if (!input.organizationId) input.organizationId = args.organizationId;
    // validate access to scheduled job
    const source = await getScheduledJob(context, {
      id: input.scheduledJobId,
      organizationId: input.organizationId
    });
    const { sql, values } = await createContentTemplateSql(context, input, []);
    const res = await sjDbWrite.map(sql, values, mapper.camelizeRootKeys);

    return res[0];
  }

  async function deleteScheduledJobContentTemplate(context, args) {
    // in this query, we make sure that we only delete a source content
    // template associated with a source that the caller's org owns.
    const sql = `
DELETE FROM
  scheduled_job_content_template sct
WHERE
  sct.scheduled_job_content_template_id = $1
AND sct.scheduled_job_id IN
  (select program_id FROM program WHERE organization_id = $2)
RETURNING scheduled_job_content_template_id AS id, scheduled_job_id;
    `;
    const res = await sjDbWrite.query(sql, [args.id, args.organizationId]);
    if (!res.length) {
      throw new errors.NotFound({
        data: {
          objectType: 'ScheduledJobContentTemplate',
          objectId: args.id
        }
      });
    }
    return {
      id: args.id,
      message:
        'ScheduledJobContentTemplate deleted from scheduled job ' +
        res[0].scheduled_job_id
    };
  }

  async function createContentTemplateSql(context, input, sqlValues) {
    let sdoId = input.sdoId;
    // if data was provided we need to create a new SDO
    if (input.data) {
      if (sdoId) {
        throw new errors.InvalidInput({
          message:
            'Only one of CreateSourceContentTemplate data or sdoId can be provided.'
        });
      }
      const sdo = await dalStructuredData.createStructuredData(
        {
          organizationId: input.organizationId,
          input: {
            data: input.data,
            schemaId: input.schemaId,
            id: uuid.v4(),
            organizationId: input.organizationId,
            synchronous: true
          }
        },
        context
      );
      sdoId = sdo.id;
    } else if (!sdoId) {
      throw new errors.InvalidInput({
        message:
          'One of CreateScheduledJobContentTemplate data or sdoId must be provided.'
      });
    }
    const columnData = {
      scheduled_job_id: input.scheduledJobId,
      data_registry_id: input.schemaId,
      sdo_id: sdoId
    };

    return mainUtil.makeInsertSql(
      'scheduled_job_content_template',
      columnData,
      contentTemplateSelectData,
      sqlValues.length
    );
  }

  async function getScheduledJobContentTemplates(context, args) {
    const sjId = args.id;
    const sql = `
SELECT
  ${mainUtil.makeSelectClause(contentTemplateSelectData)}
FROM
  scheduled_job_content_template
WHERE
  scheduled_job_id = $1
    `;
    // note that this query is only used on a source object, which has
    // already been authorized.
    const res = await sjDbRead.map(sql, [sjId], mapper.camelizeRootKeys);
    return res;
  }

  // gets the current user's permission level for the provided source.
  async function getScheduledJobPermission(context, args, scheduledJob) {
    const currentOrgId = resUtil.getOrgFromAuthContext(context);
    // if user's org owns the source, return owner
    if (_.toString(scheduledJob.organizationId) === _.toString(currentOrgId)) {
      return 'owner';
    }

    //Get permission from DB since permission was not got in getScheduledJobs function
    const sql = `
SELECT a.permission
FROM media_source__acl a
WHERE a.media_source_id = $1 AND a.acl = $2;
    `;
    const res = await sjDbRead.map(
      sql,
      [scheduledJob.primarySourceId, scheduledJob.acl],
      mapper.camelizeRootKeys
    );
    if (res && res.length > 0) {
      scheduledJob.permission = res[0].permission;
    }
    // if there was an acl with permission, just return that
    if (scheduledJob.permission) return scheduledJob.permission;

    // if user is from superadmin, treat as owner
    if (resUtil.isSuperAdmin(context._authInfo)) {
      return 'owner';
    }

    // otherwise it's viewer (someone else's public source)
    return 'viewer';
  }

  async function getAffiliates(context, args, scheduledJob) {
    const values = [];
    let sql = `
SELECT
  p.program_schedule_id AS id,
  p.date_start AS start_date_time,
  p.date_end AS stop_date_time,
  p.media_source_id AS source_id,
  p.program_id AS scheduled_job_id,
  psd.program_schedule_day_of_week AS scheduled_day,
  psd.start_time AS start_time,
  psd.end_time AS stop_time,
  psd.hours_aired,
  pss.schedule_status_name AS status
FROM
  program_schedule AS p
  LEFT OUTER JOIN program_schedule_day AS psd
    ON psd.program_schedule_id = p.program_schedule_id
  LEFT OUTER JOIN schedule_status AS pss
    ON pss.schedule_status_id = p.schedule_status_id
WHERE
  p.program_id = $${values.push(scheduledJob.id)}
AND p.media_source_id IS NOT NULL
AND p.media_source_id != -1
AND p.media_source_id != $${values.push(scheduledJob.primarySourceId)}
ORDER BY id ASC
    `;

    if (!_.isNil(args.offset)) {
      sql += ` OFFSET $${values.push(args.offset)}`;
    }

    if (!_.isNil(args.limit)) {
      sql += ` LIMIT $${values.push(args.limit)}`;
    }

    function map(row) {
      const res = mapper.camelizeRootKeys(row);
      if (!_.isNil(res.scheduledDay)) {
        res.scheduledDayAsInt = res.scheduledDay;
        res.scheduledDay = dayMap[res.scheduledDay];
      }
      return res;
    }
    const res = await sjDbRead.map(sql, values, map);

    return mainUtil.toPage(args, res);
  }

  async function getCollaborators(context, args, scheduledJob) {
    if (!scheduledJob.primarySourceId) {
      const res = [
        {
          organizationId: _.toString(scheduledJob.organizationId),
          permission: 'owner'
        }
      ];
      return mainUtil.toPage(args, res);
    }

    // return collaborators on the source. these are read-only.
    return serviceContext.dal.source.getCollaborators(context, args, {
      id: scheduledJob.primarySourceId
    });
  }

  async function updateCollaborators(
    scheduledJob,
    collaborators,
    clearExisting
  ) {
    if (!(collaborators && collaborators.length)) {
      return [];
    }
    const values = [scheduledJob.id];
    const sqlParts = [];

    // first map all the org IDs in the incoming list to groupId
    for (let i = 0; i < collaborators.length; i++) {
      const collaborator = collaborators[i];
      collaborator.groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
        collaborator.organizationId
      );
      if (!collaborator.groupId) {
        // means the org was not found.
        throw new errors.NotFound({
          message:
            'No organization found for collaborator ' +
            collaborator.organizationId,
          data: {
            objectType: 'Organization',
            objectId: collaborator.groupId
          }
        });
      }
    }

    if (clearExisting) {
      // if necessary, make a SQL statement that clears any existing
      // entries for the org IDs in the update.
      // never clear the owner org's acl.
      const groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
        scheduledJob.organizationId
      );
      const groupIds = collaborators.map(
        (collaborator) => collaborator.groupId
      );
      const aclArgs = [];
      groupIds.forEach((groupId) => {
        values.push(groupId);
        aclArgs.push(`\$${values.length}`);
      });
      values.push(groupId);
      sqlParts.push(`
DELETE FROM program__acl
WHERE program_id = $1
AND acl IN (${aclArgs.join(',')}) AND acl != \$${values.length}`);
    }

    // now we need to add each one
    collaborators.forEach((collaborator) => {
      if (collaborator.permission === 'none') return;
      values.push(collaborator.groupId);
      values.push(collaborator.permission);
      sqlParts.push(`
INSERT INTO program__acl (program_id, acl, permission)
VALUES ($1, \$${values.length - 1}, \$${values.length})
RETURNING *
      `);
    });

    const sql = sqlParts.join('\n;');
    const res = await sjDbWrite.query(sql, values);
    return res;
  }

  async function getScheduleJobForMediaSourceIdAndTime(
    sourceId,
    mediaStartTime
  ) {
    const sql = `SELECT DISTINCT
        p.program_id,
        p.primary_media_source_id,
        p.media_source_type_id,
        p.recording_status_id,
        p.is_active
      FROM
        generate_series(-1, 1) cal
        CROSS JOIN program_schedule ps
      JOIN 
        media_source ms 
      ON
        ms.media_source_id = ps.media_source_id
      JOIN
        program_schedule_day psd
      ON
        psd.program_schedule_id = ps.program_schedule_id
      JOIN
        program p
      ON
          p.program_id = ps.program_id
      AND 
        p.primary_media_source_id = ms.media_source_id
      WHERE
        ms.media_source_id = $1
      AND 
        $2 < (ps.date_end + interval '1 day') AT TIME ZONE ms.live_timezone
      AND 
        $2 >= ps.date_start AT TIME ZONE ms.live_timezone
      AND 
        psd.program_schedule_day_of_week = EXTRACT(DOW FROM CAST(($2 AT TIME ZONE ms.live_timezone + (cal.cal * interval '1 day')) AS DATE))
      AND 
        $2 AT TIME ZONE 'UTC' >=
          CAST(
            concat_ws(
            ' ',
            CAST(
              ($2 AT TIME ZONE ms.live_timezone + (cal.cal * INTERVAL '1 day'))
            AS DATE),
            psd.start_time,ms.live_timezone
          ) AS TIMESTAMP WITH TIME ZONE) AT TIME ZONE 'UTC'
      AND 
      $2 AT TIME ZONE 'UTC' <
          CAST(
            concat_ws(
            ' ',
            CAST(
              ($2 AT TIME ZONE ms.live_timezone + ((cal.cal + CASE WHEN end_time < start_time THEN 1 ELSE 0 END) * INTERVAL '1 day'))
            AS DATE),
            psd.end_time,
            ms.live_timezone
          ) AS TIMESTAMP WITH TIME ZONE) AT TIME ZONE 'UTC'
      AND 
        ms.media_source_type_id IN (1,2)
      UNION
      SELECT
        p.program_id,
        p.primary_media_source_id,
        p.media_source_type_id,
        p.recording_status_id,
        p.is_active
      FROM
        program p
      JOIN
        media_source ms
      ON
        p.primary_media_source_id = ms.media_source_id
      WHERE
        ms.media_source_type_id IN (3,4)
      AND 
        ms.media_source_id = $1;`;

    const values = [sourceId, moment(mediaStartTime).toISOString()];
    const res = await sjDbRead.map(sql, values, mapScheduledJob);

    if (!res || _.isEmpty(res)) {
      return null;
    }

    return _.first(res);
  }

  async function getJobTemplatesFromDagTemplates(
    context,
    args,
    dagTemplateIds,
    params,
    jobConfig
  ) {
    const result = await serviceContext.dal.dagTemplate.getDagTemplates(
      context,
      {
        id: dagTemplateIds
      }
    );
    if (
      !result ||
      !_.isArray(result.records) ||
      result.records.length < dagTemplateIds.length
    ) {
      throw new errors.NotFound({
        message: 'The DAG template was not found',
        data: {
          dagTemplateIds
        }
      });
    }
    const newJobTemplateIds = [];
    const erroredDagTemplates = [];
    // Using map instead of forEach so we can await the promises
    await Promise.allSettled(
      result.records.map(async (dagTemplate) => {
        try {
          if (dagTemplate.dagTemplateLanguage !== 'Handlebars') {
            throw new errors.NotImplemented({
              message: 'This DAG template uses unsupported templating language',
              data: {
                dagTemplateLanguage: dagTemplate.dagTemplateLanguage,
                dagTemplateId: dagTemplate.id
              }
            });
          }
          const compiledTemplate = handlebars.compile(dagTemplate.dag.template);
          const { tasks, ...parsedTemplate } = JSON.parse(
            compiledTemplate(params)
          );
          const jobTemplateInput = {
            taskTemplates: tasks,
            organizationId: args.input.organizationId,
            applicationId: args.input.applicationId,
            jobConfig: jobConfig,
            ...parsedTemplate
          };

          const jobTemplate = await dalJobTemplate.createJobTemplate(context, {
            input: jobTemplateInput
          });
          newJobTemplateIds.push(jobTemplate.id);
        } catch (e) {
          erroredDagTemplates.push({ id: dagTemplate.id, error: e });
        }
      })
    );
    if (erroredDagTemplates.length > 0) {
      // remove orphaned job templates and throw
      await Promise.all(
        newJobTemplateIds.map(async (jobTemplateId) => {
          try {
            await dalJobTemplate.deleteJobTemplate(context, {
              id: jobTemplateId
            });
          } catch (e) {
            /**
             * deleteJobTemplate isn't implemented yet, and throws a
             * errors.NotImplemented when called. Swallowing that error
             * here so that when it does get implemented, we'll still
             * call it. We should probably ignore errors on delete here
             * regardless, as this is a best effort cleanup attempt and
             * any exceptions throws here shouldn't prevent us from
             * cleaning up other orphaned job templates or throwing our
             * own exception
             */
          }
        })
      );
      const data = {
        erroredDagTemplates: erroredDagTemplates.map((erroredTemplate) => ({
          dagTemplateId: erroredTemplate.id,
          wrappedError: erroredTemplate.error.message
        }))
      };
      throw new errors.InvalidInput({
        message: 'Error creating job template from DAG template',
        data
      });
    }
    return newJobTemplateIds;
  }

  return {
    getSchedulesForWatchlist,
    getScheduleIdsForWatchlist,
    getScheduledJobs,
    getScheduledJob,
    getScheduleParts,
    setScheduleParts,
    createScheduledJob,
    cloneScheduledJob,
    deleteScheduledJob,
    getMediaSourceDetails,
    updateScheduledJob,
    getJobTemplateIdsForScheduledJob,
    getDetails,
    createScheduledJobContentTemplate,
    deleteScheduledJobContentTemplate,
    getScheduledJobContentTemplates,
    getScheduledJobPermission,
    getAffiliates,
    getCollaborators,
    setAffiliates,
    revertScheduledJob,
    updateCollaborators,
    setJobPipelinesAndJobTemplates,
    mapUnitsIn,
    migrateLegacyV3JobsToTaskTemplates,
    migrateLastProcessedDateToSource,
    migrateLegacyProgramToScheduledJobParts,
    findPrimarySourceByJobTemplate,
    findPrimarySourceByJobPipeline,
    findPrimarySource,
    getProgramFormatId,
    createContentTemplateSql,
    getAllTDOsForSource,
    mapSchedulePart,
    getScheduleJobForMediaSourceIdAndTime
  };
};
