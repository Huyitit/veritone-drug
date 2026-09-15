const fs = require('fs');
const _lodash = require('lodash');
const moment = require('moment');

module.exports = function createFunction(serviceContext) {
  const dalWorkflow = serviceContext.dal.workflow,
    dalFlow = serviceContext.dal.flow,
    dalFlowRevision = serviceContext.dal.flowRevision,
    dalFlowExecution = serviceContext.dal.flowExecution,
    dalEngine = serviceContext.dal.engine,
    dalFlowTemplate = serviceContext.dal.flowTemplate,
    dalAlwaysUpFlow = serviceContext.dal.alwaysUpFlow;

  return {
    setWorkflowRuntimeStorageData(_, args, context) {
      return dalWorkflow.setWorkflowRuntimeStorageData(context, args);
    },
    startWorkflowRuntime(_, args, context) {
      return serviceContext.dal.workflow.startWorkflow(context, args);
    },
    stopWorkflowRuntime(_, args, context) {
      return serviceContext.dal.workflow.stopWorkflow(context, args);
    },
    createFlowTemplate(_, args, context) {
      return dalFlowTemplate.createFlowTemplate(context, args);
    },
    updateFlowTemplate(_, args, context) {
      return dalFlowTemplate.updateFlowTemplate(context, args);
    },
    deleteFlowTemplate(_, args, context) {
      return dalFlowTemplate.deleteFlowTemplate(context, args);
    },
    createFlowRevision(_, args, context) {
      return dalFlowRevision.createFlowRevision(context, args);
    },
    updateFlowRevision(_, args, context) {
      return dalFlowRevision.updateFlowRevision(context, args);
    },
    createFlowExecution(_, args, context) {
      return dalFlowExecution.createFlowExecution(context, args);
    },
    updateFlowExecution(_, args, context) {
      return dalFlowExecution.updateFlowExecution(context, args);
    },
    updateFlowRevisionHead(_, args, context) {
      return dalFlowRevision.updateFlowRevisionHead(context, args);
    },
    deployFlowRevision(_, args, context) {
      return dalFlowRevision.deployFlowRevision(context, args);
    },
    createFlow(_, args, context) {
      return dalFlow.createFlow(context, args);
    },
    updateFlow: async (_, args, context) => {
      // validate
      await dalFlow.validateWriteAccess(context, _lodash.get(args, 'input.id'));

      return dalEngine.updateEngine(args, context);
    },
    copyFlow: async (_, args, context) => {
      // validate
      await dalFlow.validateReadAccess(
        context,
        _lodash.get(args, 'input.flowId')
      );

      return dalFlow.copyFlow(args, context);
    },
    deleteFlow: async (_, args, context) => {
      // validate
      await dalFlow.validateWriteAccess(
        context,
        _lodash.get(args, 'input.flowId')
      );

      return dalEngine.deleteEngine(args, context);
    },
    pauseFlow: async (_, args, context) => {
      // validate
      await dalFlow.validateWriteAccess(
        context,
        _lodash.get(args, 'input.flowId')
      );

      return dalFlow.pauseFlow(context, args);
    },
    unpauseFlow: async (_, args, context) => {
      // validate
      await dalFlow.validateWriteAccess(
        context,
        _lodash.get(args, 'input.flowId')
      );

      return dalFlow.unpauseFlow(context, args);
    },
    alwaysUpFlowCreate(_, args, context) {
      return dalAlwaysUpFlow.alwaysUpFlowCreate(context, args);
    },
    alwaysUpFlowUpdate(_, args, context) {
      return dalAlwaysUpFlow.alwaysUpFlowUpdate(context, args);
    },
    createNotebook(_, args, context) {
      args.input.isNotebook = true;
      return dalFlow.createFlow(context, args);
    }
  };
};
