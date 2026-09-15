const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const defaultBatchTaskLimit = _.get(
    serviceContext,
    'config.paging.defaultBatchTaskLimit',
    1000
  );

  async function batchTasksByJobIds(context, keys) {
    let res = [];
    let offset = 0;
    let sortedJobIdArray = _.sortBy(keys);

    while (sortedJobIdArray.length > 0) {
      const tasks = await serviceContext.dal.task.getTasks(context, {
        jobId: sortedJobIdArray,
        offset,
        limit: defaultBatchTaskLimit,
        orderBy: [{ field: 'jobId', direction: 'asc' }]
      });

      if (tasks && _.isArray(tasks.records) && tasks.count) {
        // concat the task results
        Array.prototype.push.apply(res, tasks.records);

        let jobIdsGotSorted = _.uniq(
          _.map(tasks.records, (task) => task.jobId)
        );

        // remove the last seen jobId in jobIdsGotSorted,
        // since the last seen jobId might has more tasks in the next loop.
        jobIdsGotSorted.pop();

        // if the first and last task have the same jobId
        // keep the jobId in sortedJobIdArray to loop more times
        // since the jobId might have more than 1000 tasks.
        if (_.isEmpty(jobIdsGotSorted)) {
          offset += tasks.count;
          continue;
        }

        // remove the jobId from sortedJobIdArray which got tasks
        offset = 0;
        _.remove(sortedJobIdArray, (jobId) =>
          _.includes(jobIdsGotSorted, jobId)
        );
      } else {
        // there is no task results so clear the sortedJobIdArray
        sortedJobIdArray = [];
      }
    }

    // remove the duplicate tasks loop the getTasks by sortedJobIdArray
    res = _.uniqBy(res, (task) => {
      return task.id;
    });

    return _.map(keys, (key) => _.filter(res, (task) => task.jobId == key));
  }

  return {
    batchTasksByJobIds
  };
};
