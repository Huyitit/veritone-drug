const _ = require('lodash');

const USER_DETAILS_OMIT_KEYS = ['hashedPassword'];

/**
 * Returns a copy of invite userDetails safe for GraphQL clients, without the hashed password.
 * Does not mutate the source object.
 */
function sanitizeInviteUserDetailsForApi(userDetails) {
  if (userDetails === null || userDetails === undefined) {
    return userDetails;
  }

  let parsed;
  if (typeof userDetails === 'object' && !Array.isArray(userDetails)) {
    parsed = userDetails;
  } else if (typeof userDetails === 'string') {
    try {
      parsed = JSON.parse(userDetails);
    } catch (_e) {
      return userDetails;
    }
  } else {
    return userDetails;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return userDetails;
  }

  return _.omit(parsed, USER_DETAILS_OMIT_KEYS);
}

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const dalOrganizationInvite = serviceContext.dal.organizationInvite;
  const resUtil = require('../resolvers/util.js')(serviceContext);

  return {
    id: async (root, args, context, info) => {
      return root.organizationInviteId;
    },
    organization: async (root, args, context, info) => {
      const organization = await serviceContext.dal.organization.getOrganization(
        context,
        {
          id: root.organizationId
        }
      );
      organization.guid = await serviceContext.dal.application.getAppIdFromOrgId(
        root.organizationId
      );
      return organization;
    },
    applicationRoles: async (root, args, context, info) => {
      // retrieve app and role ids for the organization invite
      const appIdsAndRoleIds = await dalOrganizationInvite.getApplicationAndRoleIds(
        root,
        context
      );

      // grab role ids and app ids from the above array
      const roleIds = appIdsAndRoleIds.map((appRole) => appRole.roleId);
      const appIds = appIdsAndRoleIds.map((appRole) => appRole.applicationId);

      // retrieve roles for the roleIds
      const roles = await serviceContext.dal.role.getRoles(context, {
        ids: roleIds
      });

      // retrieve applications for the appIds
      const applications = await serviceContext.dal.application.getApplications(
        {
          ids: appIds
        }
      );

      // combine the roles and applications into an array of objects per invite
      return appIdsAndRoleIds
        .map((appRole) => {
          const application = applications.records.find(
            (app) => app.applicationId === appRole.applicationId
          );
          const role = roles.records.find((role) => role.id === appRole.roleId);
          if (role) {
            role.name = _.get(role, 'roleName');
          } else {
            logger.error(
              `(applicationRoles) Role ID = '${appRole.roleId}' was not found`
            );
          }
          return { application, role };
        })
        .filter((appRole) => appRole.application && appRole.role);
    },
    audit: (root, args, context, info) => {
      return dalOrganizationInvite.getOrganizationInviteActionAudit(
        root,
        args,
        context
      );
    },
    status: (root, args, context, info) => {
      const { status, expirationDate } = root;
      const isExpired = Date.now() > expirationDate * 1000;

      if (isExpired && (status === 'submitted' || status === 'approved')) {
        return 'expired';
      }
      return root.status;
    },
    expirationDate: (root, args, context, info) => {
      // convert second to ms
      return root.expirationDate * 1000;
    },
    invitee: async (root, args, context, info) => {
      // new users doesn't have userId. Return email from invitation table only.
      if (!root.userId) {
        const orgInv = await dalOrganizationInvite.getOrganizationInvites(
          root,
          { organizationInviteId: root.organizationInviteId },
          context
        );
        return orgInv.length > 0 ? { email: orgInv[0].email } : null;
      }
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: root.userId },
        context
      );
      // Get userId using email.
      const email = _.get(user, 'email');
      const imageUrl = _.get(user, 'imageUrl');
      return {
        email: email,
        name: user.firstName + ' ' + user.lastName, // What information to capture?
        imageUrl: imageUrl
      };
    },
    inviteType: (root, args, context, info) => {
      return _.camelCase(root.inviteType);
    },
    userDetails: (root) => {
      return sanitizeInviteUserDetailsForApi(root.userDetails);
    },
    createdBy: async (root, args, context, info) => {
      const audits = await dalOrganizationInvite.getOrganizationInviteActionAudit(
        root,
        {
          actor: root.createdBy,
          orderBy: {
            field: 'timestamp'
          },
          limit: 1
        },
        context
      );

      if (_.isEmpty(audits)) {
        return {};
      }

      const firstAudit = _.first(audits);
      const createdBy = _.get(firstAudit, 'kvp.createdBy', {});
      const id = _.get(createdBy, 'userId');
      const name = _.get(createdBy, 'userName');
      const email = _.get(createdBy, 'email');
      const firstName = _.get(createdBy, 'firstName');
      const lastName = _.get(createdBy, 'lastName');
      const imageUrl = _.get(createdBy, 'image');

      return {
        id: id,
        name: name,
        firstName: firstName,
        lastName: lastName,
        email: email,
        imageUrl: imageUrl
      };
    },
    passwordResetToken: (root, args, context, info) => {
      // Only super admins can access password reset token.
      if (resUtil.isSuperAdmin(context._authInfo)) {
        return root.passwordResetToken;
      }
      return null;
    },
    invitationLink: async (root, args, context, info) => {
      // Only super admins or organization admins of the invite's organization can access the link
      const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
      const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);
      if (!isSuperAdmin && !isOrgAdmin) {
        return null;
      }

      const organization = await serviceContext.dal.organization.getOrganization(
        context,
        { id: root.organizationId },
        false
      );
      const defaultApplicationId = _.get(
        organization,
        'kvp.features.defaultApplication'
      );

      try {
        const link = await serviceContext.bll.organizationInvite.getInvitationLink(
          {
            applicationId: defaultApplicationId,
            userId: root.userId,
            email: root.email,
            passwordResetToken: root.passwordResetToken,
            organizationInviteId: root.organizationInviteId,
            isRequestEmail: false
          }
        );
        return link;
      } catch (err) {
        logger.error('Failed to generate invitation link', err);
        return null;
      }
    }
  };
};
