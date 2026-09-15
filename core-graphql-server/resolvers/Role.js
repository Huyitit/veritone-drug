module.exports = function createFunction(serviceContext) {
  return {
    permissions(obj, args, context, info) {
      return serviceContext.dal.role.getPermissionsForRole(obj.id, args);
    },
    name(obj) {
      return obj.roleName;
    },
    application(obj, args, context, info) {
      return serviceContext.dal.application.getApplication({
        id: obj.applicationId ?? obj.application_id,
        organizationId: obj.organizationId ?? obj.organization_id,
        includeDeleted: true
      });
    }
  };
};
