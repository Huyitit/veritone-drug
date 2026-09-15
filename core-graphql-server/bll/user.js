const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const resUtil = require('../resolvers/util.js')(serviceContext);

  async function getBasicUserInfo(context, args) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const tokenType = _.get(context, 'requestContext.authTokenType');

    if (tokenType === 'jwt') {
      args.organizationId = _.get(
        context,
        'requestContext.jwtToken.contentOrganizationId'
      );
    } else {
      args.organizationId =
        _.get(context, 'requestContext.userInfo.organization.organizationId') ||
        _.get(context, 'requestContext.tokenInfo.organization.organizationId');
    }

    args.organizationIds = [args.organizationId];

    // only superadmin can get basic userinfo of other organizations
    if (isSuperAdmin) {
      args.includeAllOrgUsers = true;
    }

    return serviceContext.dal.admin.getUser(args, context);
  }

  return {
    getBasicUserInfo
  };
};
