const _ = require('lodash');
const mapper = require('../../../dal/mapper.js');
const moment = require('moment');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const logger = serviceContext.logger;
  const util = require('../../../util.js')();
  const errors = require('../../../error')(config);
  const dbConnections = serviceContext.dbConnections;
  const dbRead = dbConnections['core'].read;
  const dbWrite = dbConnections['core'].write;

  const dalTaskTemplate = serviceContext.dal.taskTemplate;
  const dateIdUtil = require('@veritone/core-server-base/date-id.js')();
  const dalPartitionGenerator = _.get(
    serviceContext,
    'app.dalPartitionGenerator'
  );

  const typeMap = {
    Ingestion: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
    Cognition: 'fcc22feb-9184-4f53-be5e-7694927864d9',
    Aggregator: 'b055b3ec-38ef-41c3-bf8a-a672e3a72dae'
  };

  async function getJobTemplate(context, args) {
    util.checkDateId(args.id, false, true);

    const res = await getJobTemplates(context, args);

    if (!res.count) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'JobTemplate'
        }
      });
    }
    return res.records[0];
  }

  async function getJobTemplates(context, args) {
    const values = [];
    const whereConditions = [];
    let jobTemplateTable = 'job_new.job_template';

    util.addSqlWhere(
      'jt.application_id',
      args.applicationId,
      whereConditions,
      values
    );

    whereConditions.push('jt.deleted_date_time IS NULL');

    let scheduledJobClause = '';
    if (args.scheduledJobId && !args.jobPipelineId) {
      scheduledJobClause = `
LEFT JOIN job_new.scheduled_job__job_template sj
ON sj.job_template_id = jt.template_id `;
      util.addSqlWhere(
        'sj.scheduled_job_id',
        _.toString(args.scheduledJobId),
        whereConditions,
        values
      );
    }

    let taskJoinClause = '';
    if (args.engineId) {
      taskJoinClause =
        '\nINNER JOIN job_new.task t on jt.template_id = t.job_id';
      values.push(args.engineId);
      whereConditions.push(`t.engine_id = \$${values.length}`);
    }

    let engineTypeClause = '';
    if (args.engineType) {
      const arr = (_.isArray(args.engineType)
        ? args.engineType
        : [args.engineType]
      ).map((k) => typeMap[k]);

      if (!taskJoinClause.length) {
        taskJoinClause =
          '\nINNER JOIN job_new.task_template t on jt.template_id = t.job_template_id';
      }

      engineTypeClause = `
INNER JOIN
   job_new.engine e ON e.engine_id = t.engine_id
INNER JOIN
   job_new.engine_category ec ON ec.engine_category_id = e.engine_category_id `;
      util.addSqlWhere(
        'ec.engine_type_id :: TEXT',
        arr,
        whereConditions,
        values
      );
    }

    util.addSqlWhere('jt.template_id', args.id, whereConditions, values);

    if (args.allForScheduledJobId) {
      // get all job pipelines for the scheduled job
      // this parameter is used only internally, by ScheduledJob.allJobTemplates
      // resolver. we know that the set of template and job pipeline IDs will
      // be small. so here we make two small, fast queries to get the lists of
      // IDs to insert into the final query, instead of a big join.
      const vars = [_.toString(args.allForScheduledJobId)];
      const q2 = `
SELECT
  job_template_id AS id
FROM
  job_new.scheduled_job__job_template
WHERE
  scheduled_job_id = $1;
      `;
      const templateIdsForScheduledJob = await dbRead.map(
        q2,
        vars,
        (row) => `'${row.id}'`
      );
      const allOr = [];
      if (templateIdsForScheduledJob.length) {
        whereConditions.push(
          `jt.template_id IN (${templateIdsForScheduledJob.join(', ')})`
        );
      } else {
        // bail out now - there are no matches
        return util.toPage(args, []);
      }
    }

    const whereClause = whereConditions.join(' AND ');

    const sql = `
SELECT
  jt.template_id AS id,
  jt.application_id,
  jt.created_date_time,
  jt.modified_date_time,
  jt.deleted_date_time,
  jt.cluster_id,
  jt.client_application_id,
  jt.correlation_id,
  jt.job_config,
  jt.notification_uris
FROM
  ${jobTemplateTable} jt ${scheduledJobClause} ${taskJoinClause} ${engineTypeClause}
WHERE
  ${whereClause}
OFFSET ${args.offset || 0}
LIMIT ${args.limit || 30}
    `;

    const rows = await dbRead.map(sql, values, mapper.mapJob);
    return util.toPage(args, rows);
  }

  const jobTemplateSelect = {
    template_id: 'id',
    application_id: null,
    created_date_time: null,
    modified_date_time: null,
    deleted_date_time: null,
    cluster_id: null,
    correlation_id: null,
    job_config: null,
    notification_uris: null
  };

  async function updateJobTemplate(context, args) {
    util.checkDateId(args.input.id, false);

    const columnData = {
      job_config: args.input.jobConfig,
      notification_uris: _.isEmpty(args.input.notificationUris)
        ? {}
        : args.input.notificationUris
    };

    const whereAnd = [];
    const sqlParams = [];

    whereAnd.push(`template_id = $${sqlParams.push(args.input.id)}`);

    let { sql, values } = util.makeUpdateSql(
      'job_new.job_template',
      columnData,
      jobTemplateSelect,
      whereAnd.join(' AND '),
      sqlParams.length
    );

    const res = await dbWrite.map(sql, sqlParams.concat(values), mapper.mapJob);
    return res[0];
  }

  function validateJobRoutes(job) {
    job.routes.forEach((route) => {
      let parentReferenceIdFound = false;
      let childReferenceIdFound = false;

      job.taskTemplates.forEach((task) => {
        if (task.ioFolders) {
          task.ioFolders.forEach((ioFolder) => {
            if (
              !route.parentIoFolderReferenceId || // handling the case, when parentIoFolderReferenceId is empty
              ioFolder.referenceId === route.parentIoFolderReferenceId
            ) {
              parentReferenceIdFound = true;
            }

            if (
              !route.childIoFolderReferenceId || // handling the case, when childIoFolderReferenceId is empty
              ioFolder.referenceId === route.childIoFolderReferenceId
            ) {
              childReferenceIdFound = true;
            }
          });
        }
      });

      if (!parentReferenceIdFound) {
        throw new errors.InvalidInput({
          message: `ioFolder ${route.parentIoFolderReferenceId} was not found in the tasks definition`,
          data: {
            objectType: 'ioFolder',
            objectId: route.parentIoFolderReferenceId
          }
        });
      }

      if (!childReferenceIdFound) {
        throw new errors.InvalidInput({
          message: `ioFolder ${route.childIoFolderReferenceId} was not found in the tasks definition`,
          data: {
            objectType: 'ioFolder',
            objectId: route.childIoFolderReferenceId
          }
        });
      }
    });
    job.jobConfig.routes = job.routes;
  }

  async function createJobTemplate(context, args) {
    if (!args.input.applicationId) {
      throw new errors.InvalidInput({
        message:
          'An applicationId value was not provided in the input. ' +
          'The value is set automatically for normal authentication tokens. ' +
          'Clients using internal tokens that are not associated with an ' +
          'organization must set the value explicitly to the application ID ' +
          'for the organization on whose behalf the template is created.',
        data: {
          mutation: 'createJobTemplate',
          field: 'applicationId'
        }
      });
    }

    // Validate has access to cluster, we check when creating jobs too
    if (args.input.clusterId) {
      const _clusters = await serviceContext.dal.cluster.getCluster(context, {
        id: args.input.clusterId,
        organizationId: args.input.organizationId
      });
    }

    let job = args.input;
    if (!job.jobConfig) {
      job.jobConfig = {};
    }
    job.jobConfig.authData = util.getAuthDataForJob(context);

    // validating routes and adding them to the jobConfig
    if (job.routes) {
      validateJobRoutes(job);
    }

    const { sql, values } = createJobTemplateSql(context, args, 0);
    let res;
    try {
      res = await dbWrite.map(sql, values, mapper.mapJob);
    } catch (error) {
      logger.error('Error when creating job template', error);
      throw new errors.InternalServerError({
        message: 'Failed to create job template: ' + (error.message || error)
      });
    }
    return res[0];
  }

  function createJobTemplateSql(context, args, valIndex = 0) {
    context.jobSyncMoment = context.jobSyncMoment || moment.utc();
    const newJobTemplateId =
      args.input.id || dateIdUtil.generateJobId(context.jobSyncMoment.unix());
    const taskTemplates = args.input.taskTemplates || [];

    const columnData = {
      template_id: newJobTemplateId,
      application_id: args.input.applicationId,
      job_config: args.input.jobConfig,
      created_date_time: context.jobSyncMoment.unix(),
      cluster_id: args.input.clusterId,
      notification_uris: _.isEmpty(args.input.notificationUris)
        ? {}
        : args.input.notificationUris
    };

    let { sql, values } = util.makeInsertSql(
      'job_new.job_template',
      columnData,
      jobTemplateSelect,
      valIndex
    );

    let valueIndex = values.length;
    taskTemplates.forEach((taskTemplate) => {
      if (!taskTemplate.id) {
        taskTemplate.id = dateIdUtil.generateTaskId(newJobTemplateId);
      }
      taskTemplate.applicationId = args.input.applicationId;
      taskTemplate.jobTemplateId = newJobTemplateId;
      taskTemplate.createdDateTime = context.jobSyncMoment.unix();

      if (taskTemplate.executionPreferences) {
        _.set(
          taskTemplate,
          'payload.executionPreferences',
          taskTemplate.executionPreferences
        );
      }
      if (taskTemplate.ioFolders) {
        _.set(taskTemplate, 'payload.ioFolders', taskTemplate.ioFolders);
      }

      const sub = dalTaskTemplate.createTaskTemplateSql(
        context,
        { input: taskTemplate },
        valueIndex
      );
      valueIndex += sub.values.length;
      values = values.concat(sub.values);
      sql += sub.sql;
    });
    return { sql, values };
  }

  // TODO: why is this disabled?
  async function deleteJobTemplate(context, args) {
    throw new errors.NotImplemented({
      message:
        'The deleteJobTemplate mutation is not available on this server. '
    });
    /*
    const id = args.id;
    util.checkDateId(id, true);


    const old = getJobTemplate({
      id: args.id,
      applicationId: args.applicationId
    });
    const sql = `
DELETE FROM
  job_new.task
WHERE
  job_id = $1
RETURNING task_id;

DELETE FROM job_new.job
WHERE
  job_id = $1 AND
RETURNING
  job_id
;
    `;
    const values = [args.id, args.applicationId];
    const res = await dbWrite.query(sql, values);

    if (!res.length) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'JobTemplate'
        }
      });
    }
    return {
      id: args.id,
      message: 'JobTemplate deleted'
    };*/
  }

  function validateJobAndTaskTablePartition(dateMoment) {
    dateMoment = dateMoment || moment.utc();
    const startDate = moment.utc(dateMoment).startOf('isoWeek');
    const endDate = moment.utc(dateMoment).endOf('isoWeek');

    return Promise.all([
      dalPartitionGenerator.createJobPartitions(startDate, endDate),
      dalPartitionGenerator.createTaskPartitions(startDate, endDate)
    ]);
  }

  return {
    getJobTemplate,
    getJobTemplates,
    createJobTemplate,
    createJobTemplateSql,
    updateJobTemplate,
    deleteJobTemplate,
    validateJobAndTaskTablePartition
  };
};
