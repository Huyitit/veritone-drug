const _ = require('lodash');
const { parseResolveInfo } = require('graphql-parse-resolve-info');
const dalAuthGroupModule = require('../rbacAuth/dal/authGroup.dal');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../../util.js')(serviceContext);
  const cache = require('../../resolvers/cache.js')(serviceContext);
  const resUtil = require('../../resolvers/util.js')(serviceContext);
  const bllRbac = serviceContext.bll.rbacAuth;
  const dalAuthGroup = serviceContext.dal.authGroup || dalAuthGroupModule(serviceContext);

  return {
    id: (object) => object.aceId,
    permissionSet: async (obj, args, context, resolveInfo) => {
      // if caller is only requesting permissionSetId - skip bll/dal retrieval
      const resolverInfo = parseResolveInfo(resolveInfo);
      const requestedFields = Object.keys(
        resolverInfo.fieldsByTypeName['AuthPermissionSet'] || {}
      );
      if (requestedFields.length === 1 && requestedFields[0] === 'id') {
        return { id: obj.permissionSetId };
      }
      return bllRbac.getAuthPermissionSet(context, {
        id: obj.permissionSetId,
        ownerOrganization: obj.organizationId // for superAdmin/internalToken
      });
    },
    member: async (obj, args, context) => {
      const isInternalToken = resUtil.getTokenType(context) === 'internal';
      const newArgs = { id: obj.authGroupId };
      if (obj.organizationId) {
        // for superAdmin/internalToken
        newArgs.ownerOrganization =
          await serviceContext.dal.application.getAppIdFromOrgId(
            obj.organizationId
          );
      }

      const authGroup = await bllRbac.getAuthGroup(context, newArgs);

      if (authGroup.authClass === 'User' && !isInternalToken) {
        const userDetails = await dalAuthGroup.getAuthGroupMemberIds(
          [authGroup.id],
          {
            memberType: 'User',
          }
        );
        return serviceContext.dal.admin.getUserBasicInfo(
          { userId: userDetails[0] },
          context
        );
      }

      return authGroup;
    },
    createdAt: (obj) => mainUtil.fixDateTime(obj.dateCreated),
    modifiedAt: (obj) => mainUtil.fixDateTime(obj.dateModified),
    createdBy: async (obj, args, context) => {
      return getUser(obj.createdBy, context);
    },
    modifiedBy: async (obj, args, context) => {
      return getUser(obj.modifiedBy, context);
    },
    organization: (obj, args, context) => {
      const id = obj.organizationId;
      return cache.get(context, { id: id }, 'Organization', async () => {
        return await serviceContext.dal.organization.getOrganization(context, {
          id,
        });
      });
    },
    options: (obj) => {
      return (obj.authInherit) ? ['inherit'] : [];
    }
  };

  // TODO: move that to util
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
};
