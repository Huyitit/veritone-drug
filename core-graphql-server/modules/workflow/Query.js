const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalFlowTemplate = serviceContext.dal.flowTemplate,
    dalFlowRevision = serviceContext.dal.flowRevision,
    dalFlow = serviceContext.dal.flow,
    dalFlowExecution = serviceContext.dal.flowExecution,
    dalWorkflow = serviceContext.dal.workflow,
    dalAlwaysUpFlow = serviceContext.dal.alwaysUpFlow;

  return {
    flowTemplates(root, args, context) {
      return dalFlowTemplate.getFlowTemplates(context, args);
    },
    flowRevisions(root, args, context) {
      return dalFlowRevision.getFlowRevisions(context, args);
    },
    flowRevision(root, args, context) {
      return dalFlowRevision.getFlowRevision(context, args);
    },
    automatePackage(root, args, context) {
      return dalFlowRevision.getLatestAutomatePackageFromEngineId(
        context,
        args
      );
    },
    flows: async (root, args, context) => {
      return dalFlow.getFlows(context, args);
    },
    flow: async (root, args, context) => {
      return dalFlow.getFlow(context, args);
    },
    flowExecutions(root, args, context) {
      return dalFlowExecution.getFlowExecutions(context, args);
    },
    flowExecution(root, args, context) {
      return dalFlowExecution.getFlowExecution(context, args);
    },
    workflowMetric(root, args, context) {
      return dalWorkflow.workflowMetric(context, args);
    },
    workflowRuntime(root, args, context) {
      args.isActive = true;
      return dalWorkflow.getWorkflow(context, args);
    },
    workflowRuntimeStorageData(root, args, context) {
      return dalWorkflow.getWorkflowRuntimeStorageData(context, args);
    },
    alwaysUpFlows(root, args, context) {
      return dalAlwaysUpFlow.alwaysUpFlows(context, args);
    },
    alwaysUpFlow(root, args, context) {
      return dalAlwaysUpFlow.alwaysUpFlow(context, args);
    }
  };
};
