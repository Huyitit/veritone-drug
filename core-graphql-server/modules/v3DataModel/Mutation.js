const fs = require('fs'),
  validator = require('validator');

module.exports = function createFunction(serviceContext, config) {
  const errors = require('../../error/index.js')(config);
  const dalCluster = serviceContext.dal.cluster,
    dalClusterNode = serviceContext.dal.clusterNode,
    dalJobPipeline = serviceContext.dal.jobPipeline,
    dalTaskTemplate = serviceContext.dal.taskTemplate,
    dalSource = serviceContext.dal.source,
    dalSourceType = serviceContext.dal.sourceType,
    dalScheduledJob = serviceContext.dal.scheduledJob,
    dalJobTemplate = serviceContext.dal.jobTemplate,
    dalDagTemplate = serviceContext.dal.dagTemplate,
    bllDagTemplate = serviceContext.bll.dagTemplate,
    bllCluster = serviceContext.bll.cluster;

  // VP-2581 — destination create/connect orchestration (Ayrshare adapter + DAL).
  const destinationOAuth = require('./social/bll/destinationOAuth.js')(serviceContext);
  // VP-2581 — distributeAsset orchestration (validate + create the distribute Job).
  const distributeAssetBll = require('./social/bll/distributeAsset.js')(serviceContext);

  return {
    createCluster(_, args, context) {
      return dalCluster.createCluster(context, args);
    },
    updateCluster(_, args, context) {
      return dalCluster.updateCluster(context, args);
    },
    deleteCluster(_, args, context) {
      return dalCluster.deleteCluster(context, args);
    },
    pauseCluster(_, args, context) {
      return dalCluster.pauseCluster(context, args);
    },
    unpauseCluster(_, args, context) {
      return dalCluster.unpauseCluster(context, args);
    },
    createClusterNode(_, args, context) {
      return dalClusterNode.createClusterNode(context, args);
    },
    updateClusterNode(_, args, context) {
      return dalClusterNode.updateClusterNode(context, args);
    },
    deleteClusterNode(_, args, context) {
      return dalClusterNode.deleteClusterNode(context, args);
    },
    launchScheduledJobs(_, args, context) {
      return dalJobPipeline.createAllScheduledJobs(context, args);
    },
    createTaskTemplate(_, args, context) {
      return dalTaskTemplate.createTaskTemplate(context, args);
    },
    updateTaskTemplate(_, args, context) {
      return dalTaskTemplate.updateTaskTemplate(context, args);
    },
    deleteTaskTemplate(_, args, context) {
      return dalTaskTemplate.deleteTaskTemplate(context, args);
    },
    createJobTemplate(_, args, context) {
      return dalJobTemplate.createJobTemplate(context, args);
    },
    updateJobTemplate(_, args, context) {
      return dalJobTemplate.updateJobTemplate(context, args);
    },
    deleteJobTemplate(_, args, context) {
      return dalJobTemplate.deleteJobTemplate(context, args);
    },
    createScheduledJob(_, args, context) {
      return dalScheduledJob.createScheduledJob(context, args);
    },
    cloneScheduledJob(_, args, context) {
      return dalScheduledJob.cloneScheduledJob(context, args);
    },
    revertScheduledJob(_, args, context) {
      return dalScheduledJob.revertScheduledJob(context, args);
    },
    deleteScheduledJob(_, args, context) {
      return dalScheduledJob.deleteScheduledJob(context, args);
    },
    updateScheduledJob(_, args, context) {
      return dalScheduledJob.updateScheduledJob(context, args);
    },
    createScheduledJobContentTemplate(_, args, context) {
      return dalScheduledJob.createScheduledJobContentTemplate(context, args);
    },
    deleteScheduledJobContentTemplate(_, args, context) {
      return dalScheduledJob.deleteScheduledJobContentTemplate(context, args);
    },
    createSource(_, args, context) {
      return dalSource.createSource(context, args);
    },
    updateSource(_, args, context) {
      return dalSource.updateSource(context, args);
    },
    deleteSource(_, args, context) {
      return dalSource.deleteSource(context, args);
    },
    createSourceContentTemplate(_, args, context) {
      return dalSource.createSourceContentTemplate(context, args);
    },
    deleteSourceContentTemplate(_, args, context) {
      return dalSource.deleteSourceContentTemplate(context, args);
    },
    createSourceType(_, args, context) {
      return dalSourceType.createSourceType(context, args);
    },
    updateSourceType(_, args, context) {
      return dalSourceType.updateSourceType(context, args);
    },
    deleteSourceType(_, args, context) {
      return dalSourceType.deleteSourceType(context, args);
    },
    launchJobTemplates(_, args, context) {
      return dalJobPipeline.launchJobTemplates(context, args);
    },
    pauseClusterNode(_, args, context) {
      return dalClusterNode.pauseClusterNode(context, args);
    },
    unpauseClusterNode(_, args, context) {
      return dalClusterNode.unpauseClusterNode(context, args);
    },
    updateClusterState(_, args, context) {
      return dalCluster.updateClusterState(context, args);
    },
    pairClusterNode(_, args, context) {
      return dalClusterNode.pairClusterNode(context, args);
    },
    pingClusterNode(_, args, context) {
      return dalClusterNode.pingClusterNode(context, args);
    },
    unpairClusterNode(_, args, context) {
      return dalClusterNode.unpairClusterNode(context, args);
    },
    createDagTemplate(_, args, context) {
      return bllDagTemplate.createDagTemplate(context, args);
    },
    updateDagTemplate(_, args, context) {
      return bllDagTemplate.updateDagTemplate(context, args);
    },
    deleteDagTemplate(_, args, context) {
      return dalDagTemplate.deleteDagTemplate(context, args);
    },
    addDagTemplateToOrganization(_, args, context) {
      return dalDagTemplate.addDagTemplateToOrganization(context, args);
    },
    removeDagTemplateFromOrganization(_, args, context) {
      return dalDagTemplate.removeDagTemplateFromOrganization(context, args);
    },
    updateOrganizationCluster(_, args, context) {
      return bllCluster.updateOrganizationCluster(context, args);
    },
    // VP-2581 Distribution Center — SDL surface lands in Batch 2 (BE-08); the DAL
    // (BE-10/BE-11) is wired, but these mutations orchestrate the Ayrshare OAuth
    // adapter (BE-12/BE-13) and the distribute Job (BE-17), delivered in Batch 3/4.
    createDestination(_, args, context) {
      return destinationOAuth.createDestination(context, args);
    },
    updateDestination(_, args, context) {
      return destinationOAuth.updateDestination(context, args);
    },
    deleteDestination(_, args, context) {
      return destinationOAuth.deleteDestination(context, args);
    },
    completeDestinationConnection(_, args, context) {
      return destinationOAuth.completeDestinationConnection(context, args);
    },
    refreshDestinationOAuthUrl(_, args, context) {
      return destinationOAuth.refreshDestinationOAuthUrl(context, args);
    },
    distributeAsset(_, args, context) {
      return distributeAssetBll.distributeAsset(context, args);
    }
    //...
  };
};
