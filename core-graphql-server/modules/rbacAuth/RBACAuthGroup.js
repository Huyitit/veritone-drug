const _ = require('lodash');
module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../../util.js')(serviceContext);
  const cache = require('../../resolvers/cache.js')(serviceContext);
  const bllRbac = serviceContext.bll.rbacAuth;

  return {
    members: (object, args, context) => {
      const _args = Object.assign({}, args, { authGroupId: object.id });
      return cache.get(context, _args, 'RBACAuthGroups', () =>
        bllRbac.getAuthGroupMembers(context, _args)
      );
    },
    organizationACEs: (object, args, context) => {
      const _args = Object.assign({}, args, {
        authGroupId: object.id,
        orgId: object.organizationId
      });
      return cache.get(context, _args, 'RBACAuthOrgACEs', () =>
        bllRbac.getAuthGroupOrganizationRoles(context, _args)
      );
    },
    referencedACEs: (object, args, context) => {
      const _args = Object.assign({}, args, {
        authGroupId: object.id,
        organizationId: object.organizationId
      });
      return cache.get(context, _args, 'RBACAuthACEs', () =>
        bllRbac.getAuthGroupResourceRoles(context, _args)
      );
    },
    parentGroups: async (object, args, context) => {
      const _args = Object.assign({}, args, {
        authGroupId: object.id,
        ownerOrganization: object.organizationGuid || object.organizationId // for superAdmin/internalToken
      });
      return cache.get(context, _args, 'RBACAuthGroups', () =>
        bllRbac.getAuthGroupMembership(context, _args)
      );
    },
    organization: (obj, args, context) => {
      const id = obj.organizationId;
      return cache.get(context, { id: id }, 'Organization', async () => {
        const orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
          id
        );
        return serviceContext.dal.organization.getOrganization(context, {
          id: orgId
        });
      });
    },
    createdAt: (obj) => mainUtil.fixDateTime(obj.dateCreated),
    modifiedAt: (obj) => mainUtil.fixDateTime(obj.dateModified),
    createdBy: async (obj, args, context) => {
      return getUser(obj.createdBy, context);
    },
    modifiedBy: async (obj, args, context) => {
      return getUser(obj.modifiedBy, context);
    },
    appRole: async (obj, args, context) => {
      if (obj.roleId) {
        const roles = await serviceContext.dal.role.getRoles(context, {
          ids: [obj.roleId]
        });
        return _.get(roles, 'records[0]');
      } else {
        return null;
      }
    },
    name: async (obj, args, context) => {
      const { name } = await getDefaultGroupInfo(context, {
        name: obj.name,
        description: obj.description,
        organizationId: obj.organizationId || obj.organizationGuid
      });
      return name;
    },
    description: async (obj, args, context) => {
      const { description } = await getDefaultGroupInfo(context, {
        name: obj.name,
        description: obj.description,
        organizationId: obj.organizationId || obj.organizationGuid
      });
      return description;
    },
    referencedTDOs: (object, args, context) => {
      const _args = Object.assign({}, args, {
        authGroupId: object.id,
        organizationId: object.organizationId
      });
      return cache.get(context, _args, 'RBACAuthGroupTDOs', () =>
        bllRbac.getAuthGroupReferencedTDOs(context, _args)
      );
    },
    referencedFolders: (object, args, context) => {
      const _args = Object.assign({}, args, {
        authGroupId: object.id,
        organizationId: object.organizationId
      });
      return cache.get(context, _args, 'RBACAuthGroupFolders', () =>
        bllRbac.getAuthGroupReferencedFolders(context, _args)
      );
    },
    memberCount: (object, args, context) => {
      const _args = Object.assign({}, args, {
        authGroupId: object.id,
        organizationId: object.organizationId
      });
      return cache.get(context, _args, 'RBACAuthGroupMemberCount', () =>
        bllRbac.getAuthGroupMemberCount(context, _args)
      );
    },
    permissionSet: (object, args, context) => {
      const _args = Object.assign({}, args, {
        authGroupId: object.id,
        organizationId: object.organizationId
      });
      return cache.get(context, _args, 'RBACAuthGroupPermissionSets', () =>
        bllRbac.getAuthGroupPermissionSets(context, _args)
      );
    }
  };

  async function getUser(userId, context) {
    const users = await serviceContext.dal.admin.getUsers(
      {
        ids: userId,
        limit: 1
      },
      context
    );
    return _.get(users, 'records[0]');
  }

  // Get name, description for the default auth group
  // The values should be in the configs: config.rbac.defaultPolicies.authGroups
  // args = { name, description, organizationId/ organization }
  async function getDefaultGroupInfo(context, args) {
    let { name, description, organizationId } = args;
    let organization = _.get(context, '_authInfo.organization');
    if (!organization && organizationId) {
      organization = await serviceContext.dal.organization.getOrganization(
        context,
        { id: organizationId }
      );
    }
    if (organization) {
      const defaultAuthGroups = _.get(
        serviceContext,
        'config.rbac.defaultPolicies.authGroups',
        []
      );
      const matchingDefaultPolicy = _.find(
        defaultAuthGroups,
        (g) => g.name === name
      );
      if (matchingDefaultPolicy) {
        name = `${organization.organizationName} ${matchingDefaultPolicy.suffix}`;
        description = matchingDefaultPolicy.description || description;
      }
    }
    return {
      name,
      description
    };
  }
};
