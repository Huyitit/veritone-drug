const _ = require('lodash');

module.exports = function create(serviceContext) {
  const app = serviceContext.app;
  if (!serviceContext.redisClient) throw new Error('no redis');
  app.redisClient = serviceContext.redisClient;
  app.redisCache = serviceContext.redisCache;
  const config = serviceContext.config;
  const storage = serviceContext.coreStorage;
  const eventEmitter = require('./modules/core-job-server/messaging/event-emitter.js')(
    serviceContext.app,
    serviceContext.messageUtil
  );
  if (!config['veritone-api']) {
    let uri = _.get(config, 'services.core-job-server.uri', '').replace(
      'v1/',
      ''
    );
    config['veritone-api'] = {
      baseUri: uri
    };
  }

  const cjPools = {
    core: serviceContext.dbConnections['core'].write
  };

  const engineModel = require('./modules/core-job-server/model')();

  const cjdal = require('./modules/core-job-server/dal')(
    app,
    engineModel,
    cjPools
  );

  const activeBuildCache = require('./modules/core-job-server/cache/build')(
      app,
      cjdal
    ),
    aiwareRuntime = require('./modules/core-job-server/engine-runtime/aiware.runtime')(
      app,
      require('request')
    ),
    edgeRuntime = require('./modules/core-job-server/engine-runtime/edge.runtime')(
      app
    ),
    engineRuntime = require('./modules/core-job-server/engine-runtime/engine.runtime')(
      app,
      cjdal,
      activeBuildCache,
      aiwareRuntime,
      edgeRuntime
    );
  const jobBll = require('./modules/core-job-server/bll')(
    app,
    cjdal,
    engineModel,
    engineRuntime,
    storage
  );

  return {
    cjdal,
    activeBuildCache,
    aiwareRuntime,
    engineRuntime,
    jobBll,
    jobModel: engineModel,
    eventEmitter
  };
};
