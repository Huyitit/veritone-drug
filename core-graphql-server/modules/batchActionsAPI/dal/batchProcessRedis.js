const _ = require('lodash');
const { promisify } = require('util');

module.exports = function createFunction(serviceContext) {
  const { InternalServerError } = require('../../../error')(
    serviceContext.config
  );
  const redisClient = serviceContext.redisClient;

  // 3 hours. It needs to be bigger than timeout (2 hours, in eventing-service) for a batch process stalled
  const TIME_TO_LIVE_TDO_BATCH_PROCESS = 10800; // seconds
  const TDO_BATCH_PROCESS_PREFIX_REDIS_KEY =
    'core-graphql-server:TDOBatch:batchProcess';

  /**
   * Update the status, concurrency and the jobsRunning fields of a batch process object in redis.
   * Each time an object is updated, its lifetime is updated.
   *
   * @param {Object} context The request context
   * @param {Object} input
   **/
  async function updateBatchProcessObject(context, input) {
    if (!input.status) {
      throw new InternalServerError({
        message: 'status for redis object need to be passed as input param'
      });
    }

    const keyRedis = `${TDO_BATCH_PROCESS_PREFIX_REDIS_KEY}:${input.batchProcessId}`;
    let bpRedisObj;

    const bpFromCache = promisify(redisClient.get).bind(redisClient);
    const bpJsonString = await bpFromCache(keyRedis);
    if (_.isNil(bpJsonString)) {
      bpRedisObj = {
        batchProcessId: input.batchProcessId,
        jobsRunning: 0,
        concurrency: 0
      };
    } else {
      bpRedisObj = JSON.parse(bpJsonString);
    }

    bpRedisObj.status = input.status;
    bpRedisObj.jobsRunning = input.jobsRunning || bpRedisObj.jobsRunning;
    bpRedisObj.concurrency = input.concurrency || bpRedisObj.concurrency;

    redisClient.set(
      keyRedis,
      JSON.stringify(bpRedisObj),
      'EX',
      TIME_TO_LIVE_TDO_BATCH_PROCESS
    );
  }

  async function createBatchProcessObject(context, input) {
    const keyRedis = `${TDO_BATCH_PROCESS_PREFIX_REDIS_KEY}:${input.batchProcessId}`;
    return await redisClient.set(
      keyRedis,
      JSON.stringify({
        batchProcessId: input.batchProcessId,
        status: input.status,
        jobsRunning: input.jobsRunning,
        concurrency: input.concurrency
      }),
      'EX',
      TIME_TO_LIVE_TDO_BATCH_PROCESS
    );
  }

  return {
    updateBatchProcessObject,
    createBatchProcessObject
  };
};
