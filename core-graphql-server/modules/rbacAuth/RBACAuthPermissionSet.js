module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../../util.js')(serviceContext);
  const cache = require('../../resolvers/cache.js')(serviceContext);
  const bllRbac = serviceContext.bll.rbacAuth;

  return {
    hasPermissions: (object, args, context) => {
      return bllRbac.permissionSetHasPermissions(
        context,
        object,
        args.permissions,
        args.requireAll
      );
    },
    createdAt: (obj) => mainUtil.fixDateTime(obj.dateCreated),
    modifiedAt: (obj) => mainUtil.fixDateTime(obj.dateModified),
    createdBy: (obj) =>
      obj.createdBy
        ? serviceContext.dal.admin
            .getUsers({ id: obj.createdBy })
            .then((result) => result.records[0])
        : null,
    modifiedBy: (obj) =>
      obj.modifiedBy
        ? serviceContext.dal.admin
            .getUsers({ id: obj.modifiedBy })
            .then((result) => result.records[0])
        : null,
    application: (obj) =>
      obj.applicationId
        ? serviceContext.dal.application.getApplication({
            id: obj.applicationId
          })
        : null,
    applicationRole: (obj) =>
      obj.roleId ? serviceContext.dal.admin.getRole(obj.roleId) : null,
    permissions: (obj) => (obj.permissions ? obj.permissions : []),
    organization: (obj, args, context) => {
      const id = obj.organizationGuid;
      return cache.get(context, { id: id }, 'Organization', async () => {
        const orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
          id
        );
        return serviceContext.dal.organization.getOrganization(context, {
          id: orgId
        });
      });
    },
    referencedACEs: (object, args, context) => {
      const _args = Object.assign({}, args, {
        permissionSetId: object.id,
        organizationId: object.organizationGuid
      });
      return cache.get(context, _args, 'RBACPermissionSetACEs', () =>
        bllRbac.getPermissionSetReferencedACEs(context, _args)
      );
    }
  };
};
