const jwt = require('jsonwebtoken');
const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');

module.exports = function createFunction(serviceContext) {
  const { config } = serviceContext;
  const batchOperations = [
    'job:create',
    'job:read',
    'job:update',
    'job:delete'
  ];
  const { NotAllowed } = require('../../../error')(serviceContext.config);
  const mainUtil = require('../../../util.js')(serviceContext);
  const resUtil = require('../../../resolvers/util.js')(serviceContext);

  function createBatchJwtToken(context, payload) {
    const resources = {
      batchId: payload.batchId
    };

    if (payload.batchProcessId)
      resources.batchProcessId = payload.batchProcessId;

    // it is prepared to take info from uuid token or jwt token
    const userId =
      _.get(context, 'requestContext.userInfo.userId') ||
      _.get(context, 'requestContext.jwtToken.userId');

    const organizationGuid =
      mainUtil.getOrganizationGuid(context) ||
      _.get(context, 'requestContext.jwtToken.organizationGuid');

    if (!userId || !organizationGuid) {
      throw new NotAllowed({
        message:
          'invalid authorization due to missing userId or organizationGuid'
      });
    }

    return jwt.sign(
      {
        contentApplicationId: organizationGuid,
        userId: userId,
        contentOrganizationId: payload.organizationId,
        organizationId: payload.organizationId,
        scope: [
          {
            actions: batchOperations,
            resources: { ...resources }
          }
        ]
      },
      _.get(config, 'jwt.secret'),
      {
        issuer: 'core-graphql-server',
        expiresIn: '1d',
        jwtid: uuidv4(),
        subject: 'engine-run'
      }
    );
  }

  function hasOperationsRightForBatchExecutions(context) {
    const rights = mainUtil.listRights(context._authInfo);
    const mapped = rights.map((r) =>
      // replaceAll in case of `aiware.job.create` or similar
      typeof r === 'string' ? r.replaceAll('.', ':') : r
    );
    const result = _.intersection(batchOperations, mapped);
    const userHasrights = result.length === batchOperations.length;
    return userHasrights
      ? userHasrights
      : resUtil.isSuperAdmin(context._authInfo);
  }

  function isAValidOrganization(context, input) {
    const userOrg =
      mainUtil.getOrganizationId(context) ||
      _.get(context, 'requestContext._authInfo.organization.organizationId');
    return userOrg.toString() === input.organizationId.toString();
  }

  return {
    batchOperations,
    hasOperationsRightForBatchExecutions,
    isAValidOrganization,
    createBatchJwtToken
  };
};
