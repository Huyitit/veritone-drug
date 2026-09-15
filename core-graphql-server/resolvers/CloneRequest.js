module.exports = function createFunction(serviceContext) {
  return {
    sourceOrganization: (obj, args, context) =>
      serviceContext.dal.organization.getOrganization(context, {
        id: obj.sourceApplicationId ?? args.applicationId
      }),
    destinationOrganization: (obj, args, context) =>
      serviceContext.dal.organization.getOrganization(context, { 
        id: obj.destinationApplicationId
      }),
  };
};