const _ = require('lodash');
const mockUtil = require('./mockUtil.js')();

module.exports = function createFunction(serviceContext) {
  const dalJob = require('../dal/job.js')(serviceContext);

  function getPartitionTableName(jobId) {
    // the table name has the schema in the prefix
    const schemaTableName = dalJob.generateJobTablePartition(jobId);
    return schemaTableName.split('.')[1];
  }

  /**
   * Set the cache data for partition tables
   * @param {*} ctx the context that needs to be set to: serviceContext.
   * @param {*} params the params to set to the cache: { cacheType, dbSchema, dbName, partitionTables, tableNamePrefix, jobIds}
   */
  async function setPartitionTablesToCache(ctx, params = {}) {
    const cacheType = params.cacheType || 'partitionTables';
    const dbSchema = params.dbSchema || 'job_new';
    const dbName = params.dbName || 'core';
    const partitionTables = params.partitionTables || [];
    const tableNamePrefix = params.tableNamePrefix || 'job';
    const jobIds = params.jobIds || [mockUtil.toTaskId('jobId')];

    // Get partition tables by job ids
    jobIds.map((o) => {
      partitionTables.push(getPartitionTableName(o));
    });

    const partitionTablesCache = {
      partitionTables: partitionTables
    };

    ctx = ctx || {};
    if (_.isNil(ctx.redisCache)) {
      ctx.redisCache = require('./redisCache.mock.js')(ctx);
    }

    await ctx.redisCache.set(
      cacheType,
      `${dbName}_${dbSchema}_${tableNamePrefix}`,
      partitionTablesCache
    );
  }

  /**
   * Sets mock data to check the table partition in the getJobs function
   * @param {*} ctxOrDB The context or db client
   * @param {*} jobId the job id to get the prefix to build the table partition
   * @param {*} dbName the DB name - The default value is 'core'
   * @param {*} schemaName the DB schema name - The default value is 'job_new'
   */
  function setMockDBToCheckTablePartition(ctxOrDB, jobId, dbName, schemaName) {
    dbName = dbName || 'core';
    schemaName = schemaName || 'job_new';
    const db = _.get(ctxOrDB, `dbConnections.${dbName}.read`);
    // get job -> check partition tables
    const mockData = [
      {
        schemaname: schemaName,
        relname: 'job' // default table
      },
      {
        schemaname: schemaName,
        relname: dalJob.generateJobTablePartition(jobId).split('.')[1] // get table by input
      },
      {
        schemaname: schemaName,
        relname: dalJob
          .generateJobTablePartition(mockUtil.toTaskId(jobId)) // generate the current partition table
          .split('.')[1]
      }
    ];

    // check if there is the context or the DB
    if (_.isNil(db)) {
      ctxOrDB._push(mockData);
    } else {
      ctxOrDB.dbConnections[dbName].read._push(mockData);
    }
  }

  return {
    setPartitionTablesToCache,
    setMockDBToCheckTablePartition
  };
};
