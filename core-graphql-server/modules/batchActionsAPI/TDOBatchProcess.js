module.exports = function createFunction(serviceContext) {
  const tdoBatch = serviceContext.bll.tdoBatch;
  return {
    TDOBatch(root, args, context) {
      args.id = root.batchId;
      return tdoBatch.getTdoBatch(context, args);
    },
    actions(root, args, context) {
      return tdoBatch.GetActionsForABatchProcess(context, root, args);
    }
  };
};
