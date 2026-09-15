const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const storage = serviceContext.storage,
    logger = serviceContext.logger,
    dalEngine = serviceContext.dal.engine,
    config = serviceContext.config,
    dalSource = serviceContext.dal.source,
    dalScheduledJob = serviceContext.dal.scheduledJob,
    dalCluster = serviceContext.dal.cluster,
    dalClusterNode = serviceContext.dal.clusterNode,
    dalSourceType = serviceContext.dal.sourceType,
    dalJobTemplate = serviceContext.dal.jobTemplate,
    dalTaskTemplate = serviceContext.dal.taskTemplate,
    dalJobPipeline = serviceContext.dal.jobPipeline;

  // VE-25263 — engine-only fetch-from-core of the decrypted Ayrshare Profile-Key (ADR-0001).
  const scopedSecret = require('./social/bll/scopedSecret.js')(serviceContext);

  const QueryMap = {
    scheduledJob(root, args, context) {
      return dalScheduledJob.getScheduledJob(context, args);
    },
    scheduledJobs(root, args, context) {
      return dalScheduledJob.getScheduledJobs(context, args);
    },
    source(root, args, context) {
      return dalSource.getSource(context, args);
    },
    sources(root, args, context) {
      return dalSource.getSources(context, args);
    },
    cluster(root, args, context) {
      return dalCluster.getCluster(context, args);
    },
    clusters(root, args, context) {
      return dalCluster.getClusterList(context, args);
    },
    clusterNode(root, args, context) {
      return dalClusterNode.getClusterNode(context, args);
    },
    clusterNodes(root, args, context) {
      return dalClusterNode.getClusterNodes(context, args);
    },
    sourceType(root, args, context) {
      return dalSourceType.getSourceType(context, args);
    },
    sourceTypes(root, args, context) {
      return dalSourceType.getSourceTypes(context, args);
    },
    jobTemplate(root, args, context) {
      return dalJobTemplate.getJobTemplate(context, args);
    },
    jobTemplates(root, args, context) {
      return dalJobTemplate.getJobTemplates(context, args);
    },
    taskTemplate(root, args, context) {
      return dalTaskTemplate.getTaskTemplate(context, args);
    },
    sourceTypeCategory(root, args, context) {
      return dalSourceType.getSourceTypeCategory(context, args);
    },
    sourceTypeCategories(root, args, context) {
      return dalSourceType.getSourceTypeCategories(context, args);
    },
    clusterTags(root, args, context) {
      return dalCluster.getClusterTags(context, args);
    },
    tasks(root, args, context) {
      return serviceContext.dal.task.getTasks(context, args);
    },
    dagTemplates(root, args, context) {
      return serviceContext.dal.dagTemplate.getDagTemplates(context, args);
    },
    dagTemplate(root, args, context) {
      return serviceContext.bll.dagTemplate.getDagTemplate(context, args);
    },
    // VP-2581 Distribution Center
    destinations(root, args, context) {
      return serviceContext.dal.destination.getDestinations(context, args);
    },
    destination(root, args, context) {
      return serviceContext.dal.destination.getDestination(context, args);
    },
    destinationTypes(root, args, context) {
      return serviceContext.dal.destinationType.getDestinationTypes(
        context,
        args
      );
    },
    destinationType(root, args, context) {
      return serviceContext.dal.destinationType.getDestinationType(
        context,
        args
      );
    },
    // VE-25263 — engine-only: decrypted Profile-Key at distribute pickup (authz enforced in the BLL).
    destinationVendorProfile(root, args, context) {
      return scopedSecret.resolveDestinationVendorProfile(context, args);
    }
  };

  return QueryMap;
};
