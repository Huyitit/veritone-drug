module.exports = function createFunction(serviceContext) {
  return {
    organization: (object, args, context) =>
      serviceContext.dal.organization.getOrganization(context, {
        id: object.organizationId
      }),
    owner: (obj, args, context) => {
      if (obj.ownerId) {
        return context.loaders.usersById.load(obj.ownerId);
      }
      return null;
    }
  };
};
