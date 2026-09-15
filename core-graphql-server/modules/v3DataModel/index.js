/**
 * Contains the extended v3 data model including schedules, job pipelines, etc.
 */

const fs = require('fs');
const _ = require('lodash');

module.exports = function createModule(serviceContext) {
  const storage = serviceContext.storage,
    logger = serviceContext.logger,
    pg = serviceContext.pg,
    blls3 = serviceContext.blls3,
    dalCore = serviceContext.dalCore,
    config = serviceContext.config,
    app = serviceContext.app,
    librariesService = serviceContext.librariesService,
    dbConnections = serviceContext.dbConnections,
    dalStructuredData = serviceContext.dal.structuredData;
  // note that serviceContext.coreJobDal contains the root-level
  // core-job-server DAL layer, which can be provided to our own
  // DAL modules as needed.

  serviceContext.dal.sourceType = require('./dal/sourceType.js')(
    serviceContext
  );

  serviceContext.dal.source = require('./dal/source.js')(serviceContext);

  serviceContext.dal.cluster = require('./dal/cluster')(serviceContext);
  serviceContext.dal.clusterNode = require('./dal/clusterNode')(
    serviceContext,
    logger,
    config,
    dbConnections,
    serviceContext.coreJob.cjdal
  );

  serviceContext.dal.taskTemplate = require('./dal/taskTemplate')(
    serviceContext
  );

  serviceContext.dal.jobTemplate = require('./dal/jobTemplate.js')(
    serviceContext
  );

  serviceContext.dal.jobPipeline = require('./dal/jobPipeline.js')(
    serviceContext
  );

  serviceContext.dal.scheduledJob = require('./dal/scheduledJob.js')(
    serviceContext
  );

  // VP-2581 Distribution Center
  serviceContext.dal.destinationType = require('./social/dal/destinationType.js')(
    serviceContext
  );
  serviceContext.dal.destination = require('./social/dal/destination.js')(
    serviceContext
  );
  // VE-26450: declared per-platform media constraints, read at distributeAsset for pre-flight validation.
  serviceContext.dal.destinationMediaConstraint = require('./social/dal/destinationMediaConstraint.js')(
    serviceContext
  );
  // Ayrshare OAuth/profile adapter (BE-12/13) + registry; consumed by destinationOAuth.js (BE-14/15).
  serviceContext.vendor = serviceContext.vendor || {};
  serviceContext.vendor.publishProfile = require('./social/vendor/publishVendorProfile.js')(
    serviceContext
  );

  serviceContext.dal.dagTemplate = require('./dal/dagTemplate.js')(
    serviceContext
  );

  serviceContext.dal.jobDagTemplate = require('./dal/jobDagTemplate.js')(
    serviceContext
  );

  const typeDefs = [
    fs.readFileSync('./modules/v3DataModel/v3DataModel.graphql', 'utf8')
  ];

  const resolvers = {
    Query: require('./Query.js')(serviceContext, config),
    Mutation: require('./Mutation.js')(serviceContext, config),
    ScheduledJob: require('./ScheduledJob.js')(serviceContext, config),
    ProgramAffiliate: require('./ProgramAffiliate.js')(serviceContext, config),

    ScheduledJobContentTemplate: require('./ScheduledJobContentTemplate.js')(
      serviceContext,
      config
    ),
    EngineConfiguration: require('./EngineConfiguration.js')(
      serviceContext,
      config
    ),
    JobTemplate: require('./JobTemplate.js')(serviceContext, config),
    TaskTemplate: require('./TaskTemplate.js')(serviceContext, config),
    ExecutionLocation: require('./ExecutionLocation.js')(
      serviceContext,
      config
    ),
    Cluster: require('./Cluster.js')(serviceContext, config),
    ClusterNode: require('./ClusterNode.js')(serviceContext, config),
    ExternalCredential: require('./ExternalCredential.js')(
      serviceContext,
      config
    ),
    Job: require('./Job.js')(serviceContext, config),
    Source: require('./Source.js')(serviceContext, config),
    SourceContentTemplate: require('./SourceContentTemplate.js')(
      serviceContext,
      config
    ),
    TDOSourceData: require('./TDOSourceData.js')(serviceContext, config),
    SourceCollaborator: require('./SourceCollaborator.js')(serviceContext),
    ClusterCollaborator: require('./ClusterCollaborator.js')(serviceContext),
    ScheduledJobCollaborator: require('./ScheduledJobCollaborator.js')(
      serviceContext
    ),
    SourceType: require('./SourceType.js')(serviceContext, config),
    Watchlist: require('./Watchlist.js')(serviceContext, config),
    DestinationType: require('./social/DestinationType.js')(serviceContext, config),
    Destination: require('./social/Destination.js')(serviceContext, config),
    // VE-26450: enforcedConstraints is derived from the row, not stored.
    MediaConstraint: require('./social/MediaConstraint.js')(serviceContext, config)
  };

  return {
    resolvers,
    typeDefs
  };
};
