'use strict';

module.exports = function init() {
  const task = require('./_task')();
  const nodeMetrics = require('./node-metrics')();
  const jobBundleResultsModel = require('./job-bundle-results')();
  const jobBundleSelectDetail = require('./job-bundle-select-detail')();
  const jobBundleScheduleDefinition = require('./job-bundle-schedule-definition')();

  return {
    Cluster: require('./cluster')(),
    Node: require('./node')(nodeMetrics),
    NodeCreate: require('./node-create')(nodeMetrics),
    AmiNodeCreate: require('./ami-node-create')(nodeMetrics),
    NodeUpdate: require('./node-update')(nodeMetrics),
    NodePair: require('./node-pair')(),
    NodeMetrics: nodeMetrics,
    JobBundle: require('./job-bundle')(
      jobBundleSelectDetail,
      jobBundleScheduleDefinition
    ),
    JobBundleCreate: require('./job-bundle-create')(
      jobBundleScheduleDefinition
    ),
    JobBundleResults: jobBundleResultsModel,
    JobBundleStatus: require('./job-bundle-status')(),
    Engine: require('./engine')(),
    EngineCategory: require('./engine-category')(),
    EngineUpdate: require('./engine-update')(),
    EngineCreate: require('./engine-create')(),
    Build: require('./build')(),
    BuildCreate: require('./build-create')(),
    BuildUpload: require('./build-upload')(),
    TaskUpdate: require('./task-update')(),
    Job: require('./_job')(task), // change to 'job.js' once old 'Job.js' gets removed/renamed
    Task: task, // change to 'task.js' once old 'Task.js' gets removed/renamed
    Recording: require('./recording')(),
    Asset: require('./asset')()
  };
};
