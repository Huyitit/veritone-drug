'use strict';

const _ = require('lodash'),
  async = require('async');

module.exports = function init(app, dal, model, engineRuntime) {
  return {
    getJobStatusFromTaskStatuses,
    cancelJob
  };

  function getJobStatusFromTaskStatuses(tasks) {
    if (!tasks || !tasks.length) {
      return 'accepted';
    }

    const standbyTaskMap = _.keyBy(
      _.filter(tasks, 'standbyForTaskId'),
      'standbyForTaskId'
    );
    const statuses = {};

    tasks.forEach(function forEachTask(task) {
      if (task.taskStatus) {
        statuses[task.taskStatus] = true;
      }
    });

    if (statuses['cancelled']) {
      return 'cancelled';
    }

    if (statuses['aborted']) {
      return 'failed';
    }

    let taskStatusCounts = {};
    for (let i = 0; i < tasks.length; i++) {
      let task = tasks[i];
      if (task.taskStatus === 'failed') {
        let standbyTask = standbyTaskMap[task.taskId];
        if (!standbyTask) {
          return 'failed';
        }
      }
      taskStatusCounts[task.taskStatus] =
        (taskStatusCounts[task.taskStatus] || 0) + 1;
    }

    if (taskStatusCounts['pending'] === tasks.length) {
      return 'pending';
    }

    if (
      statuses['pending'] ||
      statuses['queued'] ||
      statuses['running'] ||
      statuses['waiting'] ||
      statuses['paused'] ||
      statuses['resuming']
    ) {
      return 'running';
    }

    return 'complete';
  }

  function cancelJob(jobId, applicationId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    async.auto(
      {
        getJob: function getJob(next) {
          dal.job.getJobWithTasks(
            jobId,
            dbClient,
            function getJobWithTasksCallback(err, job) {
              if (err) {
                next(err);
                return;
              }
              if (!job) {
                next({ statusCode: 404 });
                return;
              }
              if (applicationId && applicationId !== job.applicationId) {
                next({ statusCode: 403, message: 'no access to job' });
                return;
              }
              // get tasks not in ['pending', 'queued']
              const tasks = _.get(job, 'tasks');
              const filteredList = _.filter(
                tasks,
                (task) =>
                  task.taskStatus !== 'pending' && task.taskStatus !== 'queued'
              );
              // Only allow to update jobs with jobStatus in ['pending', 'queued', 'running']
              // and all tasks are pending or queued, which is filterList is empty
              if (
                ['pending', 'queued', 'running'].includes(
                  _.get(job, 'jobStatus')
                ) &&
                _.isEmpty(filteredList)
              ) {
                next(null, job);
                return;
              }
              next({
                statusCode: 403,
                message: 'current job state does not allow cancel'
              });
            }
          );
        },
        queueCancelTasks: [
          'getJob',
          function cancelTasks(results, next) {
            const job = results.getJob;
            const tasks = job.tasks || [];
            const concurrencyLimit = 4;
            async.eachLimit(
              tasks,
              concurrencyLimit,
              function forEachTask(task, eachCallback) {
                if (
                  task.taskStatus === 'failed' ||
                  task.taskStatus === 'complete'
                ) {
                  eachCallback();
                } else {
                  engineRuntime.cancelTask(task, eachCallback);
                }
              },
              next
            );
          }
        ],
        updateTasks: [
          'queueCancelTasks',
          function updateTasks(results, next) {
            const job = results.getJob;
            const tasks = job.tasks || [];
            const concurrencyLimit = 4;
            async.eachLimit(
              tasks,
              concurrencyLimit,
              function forEachTask(task, eachCallback) {
                if (
                  task.taskStatus === 'failed' ||
                  task.taskStatus === 'complete'
                ) {
                  eachCallback();
                } else {
                  dal.task.cancelTask(task.taskId, dbClient, eachCallback);
                }
              },
              next
            );
          }
        ],
        updateJobStatusToCancelled: [
          'updateTasks',
          function updateJobStatusToCancelled(results, next) {
            dal.job.getJobWithTasks(jobId, dbClient, (err, job) => {
              if (err) {
                next(err, null);
                return;
              }
              const newStatus = getJobStatusFromTaskStatuses(job.tasks);
              dal.job.updateJobStatusWithCb(jobId, newStatus, dbClient, next);
            });
          }
        ]
      },
      function finalCallback(err, results) {
        if (err) {
          app.logger.error(err);
          callback(err);
          return;
        }
        app.logger.debug('cancelled job tasks for', jobId);
        callback(null, results.getJob);
      }
    );
  }
};
