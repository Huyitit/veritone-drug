const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const cache = require('./cache.js')(serviceContext);
  const useJobStatusColumn =
    _.get(serviceContext, 'featureFlags.useJobStatusColumn', false) === true;
  const mainUtil = require('../util.js')(serviceContext);
  const logger = serviceContext.logger;
  function fixDateTime(dateTime) {
    if (!dateTime) return dateTime;

    if (_.isNumber(dateTime)) return dateTime * 1000;

    return dateTime;
  }

  async function getJobStatus(context, obj, args) {
    const params = JSON.parse(JSON.stringify(args));
    params.jobId = obj.id;
    // we need to get all tasks to compute status. this implementation is inefficient
    // since we'll query for tasks twice if both tasks and status fields were requested.
    // however, since resolvers all run asynchronously, it's complicated to go get
    // the tasks once and cache them for use in multiple resolver functions.
    const tasks = cache.get(context, params, 'Tasks', () =>
      serviceContext.dal.task.getTasks(context, params)
    );

    return tasks.then(function gotTasks(tasks) {
      const records = tasks ? tasks.records : [];
      return getJobStatusFromTaskStatuses(records);
    });
  }
  // computes the overall job status from its list of tasks.
  // this copies the logic in core-job-server.
  function getJobStatusFromTaskStatuses(tasks) {
    if (!tasks || !tasks.length) {
      return 'accepted';
    }

    const statuses = {};
    tasks.forEach(function forEachTask(task) {
      if (task.status) {
        if (!statuses[task.status]) statuses[task.status] = 0;
        statuses[task.status] += 1;
      }
    });

    if (statuses['cancelled']) {
      return 'cancelled';
    }

    if (statuses['failed'] || statuses['aborted']) {
      return 'failed';
    }

    if (statuses['pending'] === tasks.length) {
      return 'pending';
    }

    if (
      statuses['running'] ||
      statuses['queued'] ||
      statuses['pending'] ||
      statuses['waiting']
    ) {
      return 'running';
    }

    return 'complete';
  }

  return {
    async tasks(obj, args, context, info) {
      const params = JSON.parse(JSON.stringify(args));
      params.jobId = obj.id;

      return cache.get(context, params, 'Tasks', async () => {
        let res = [];
        const tasks = await context.loaders.tasksByJobIds.loadMany([
          params.jobId
        ]);
        const limit =
          args.limit || _.get(serviceContext, 'config.paging.defaultLimit', 30);
        const offset = args.offset || 0;

        if (tasks && tasks.length) {
          res = _.filter(tasks[0], (task) => {
            let result = true;

            if (args.status) result = task.status == args.status;
            if (args.id) result = task.id == args.id;
            if (args.targetId) result = task.targetId == args.targetId;
            if (args.hasSourceAsset) result = !_.isNil(task.sourceAssetId);

            return result;
          });
        }

        // paging the response by offset/limit
        res = _.take(_.drop(res, offset), limit);

        return mainUtil.toPage(args, res);
      });
    },
    status(obj, args, context, info) {
      return (
        (useJobStatusColumn && obj.status) || getJobStatus(context, obj, args)
      );
    },
    target(obj, args, context, info) {
      return obj.recordingId
        ? cache.get(
            context,
            { id: obj.recordingId },
            'TemporalDataObject',
            () =>
              serviceContext.dal.tdo.getTDO(context, { id: obj.recordingId })
          )
        : null;
    },
    createdDateTime: (obj) => fixDateTime(obj.createdDateTime),
    modifiedDateTime: (obj) => fixDateTime(obj.modifiedDateTime),
    routes: (obj) => _.get(obj, 'jobConfig.routes', []),
    name: (obj) => _.get(obj, 'jobConfig.name', null),
    description: (obj) => _.get(obj, 'jobConfig.description', null),
    audit: async (obj, args, context) => {
      const newArgs = {
        ...args,
        jobId: obj.id
      };
      return await serviceContext.dal.job.getJobAudit(context, newArgs);
    },
    dagTemplate: async (obj, args, context) => {
      const jobId = _.get(obj, 'jobId');
      const dagTemplateId = _.get(obj, 'dagTemplateId');
      const organizationId = _.get(
        context,
        '_authInfo.organization.organizationId'
      );
      try {
        if (dagTemplateId) {
          return await context.loaders.dagTemplatesByIds.load({
            id: dagTemplateId,
            organizationId
          });
        }
        return await context.loaders.dagTemplatesByJobIds.load({
          jobId,
          organizationId
        });
      } catch (error) {
        logger.error(`Failed to get DagTemplate`, error);
        return null;
      }
    },
    createdBy: async (obj, args, context) => {
      const audits = await serviceContext.dal.job.getJobAudit(context, {
        jobId: obj.id,
        action: 'create',
        limit: 1
      });

      return _.get(audits, 'records[0].actor');
    },
    modifiedBy: async (obj, args, context) => {
      const audits = await serviceContext.dal.job.getJobAudit(context, {
        jobId: obj.id,
        action: 'update',
        limit: 1
      });

      return _.get(audits, 'records[0].actor');
    }
  };
};
