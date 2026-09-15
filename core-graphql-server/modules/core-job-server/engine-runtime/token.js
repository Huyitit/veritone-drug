const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const _ = require('lodash');

module.exports = function tokenHelpers(serviceContext) {
  const app = serviceContext.app;
  const mainUtil = require('../../../util.js')(serviceContext);
  const rbacAuthBll = _.get(
    serviceContext,
    'bll.rbacAuth',
    require('../../rbacAuth/bll/rbacAuth.bll.js')(serviceContext)
  );

  async function createJwtToken(context, engine, task, orgId) {
    let engineRoles = _.get(engine, 'jwtRights.roles', []);

    // add default rights - should potentially
    // be also an engine role such as engine_default
    let assetRights = [
      'asset:uri',
      'asset:all',
      'recording:read',
      'recording:update'
    ];
    let taskRights = ['task:update'];

    const sourceId = _.get(task, 'taskPayload.sourceId');
    const organizationId = _.get(task, 'taskPayload.organizationId', orgId);

    const authData = context._authInfo || context.userInfo || context.tokenInfo;
    let authContextUserId = _.get(authData, 'userId') ||
        _.get(authData, 'user.userId', _.get(authData, 'user.id'));
    let userId = _.get(task, 'userId', authContextUserId);

    if (_.isNil(userId)) {
      // if sourceId exists, then assign the source owner as the userId
      if (!_.isNil(sourceId)) {
        try {
          const source = await serviceContext.dal.source.getSource(
              context,
              {
                id: sourceId,
                organizationId
              }
          );
          const ownedBy = _.get(source, 'ownedBy', null);
          const createdBy = _.get(source, 'createdBy', null);
          userId = ownedBy ? ownedBy : createdBy;
        } catch (err) {
          userId = null;
        }
      }
    }

    if (_.isNil(userId)) {
      // if userId is still empty, get oldest org admin default
      const defaultOrgAdmin = await serviceContext.dal.user.getDefaultOrgAdminUser(
          { organizationId },
          context
      );

      if (defaultOrgAdmin) {
        userId = defaultOrgAdmin.id;
      }
    }

    // make sure userId is set in task for mapper
    _.set(task, 'userId', userId);

    engineRoles.forEach(function addRoleRights(role) {
      assetRights = assetRights.concat(_.get(role, 'assetRights', []));
      taskRights = taskRights.concat(_.get(role, 'taskRights', []));
    });

    if (engine && engine.createsRecording) {
      assetRights.push('recording:create');
    }

    // Security Fix: Filter out restricted permissions
    const blacklist = _.get(
      serviceContext,
      'config.rbac.permissions.blacklist'
    );
    if (!Array.isArray(blacklist) || _.isEmpty(blacklist)) {
      throw new Error(
        'RBAC permissions blacklist is not configured; refusing to create JWT token without restricted permissions.'
      );
    }
    assetRights = mainUtil.filterRestrictedPermissions(assetRights, blacklist);
    taskRights = mainUtil.filterRestrictedPermissions(taskRights, blacklist);

    // remove duplicates
    assetRights = _.uniq(assetRights);
    taskRights = _.uniq(taskRights);
    const recordingIds = task.recordingId ? [task.recordingId.toString()] : [];
    const jobIds = task.jobId ? [task.jobId] : [];
    const taskIds = task.taskId ? [task.taskId] : [];
    const sourceIds = sourceId ? [sourceId] : [];
    const schemaIds = task.schemaId ? [task.schemaId] : [];

    const extraPayload = {};
    const useRBACFeature = await mainUtil.isEnableFeatureInOrganization(
      context,
      undefined,
      organizationId,
      'enableRBACFeature'
    );

    if (useRBACFeature) {
      const idsForOrgResourceType = [
        ...jobIds,
        ...taskIds,
        ...sourceIds,
        ...schemaIds
      ];

      const [
        authACLsForRecording,
        authACLsForOrgResourceType
      ] = await Promise.all([
        recordingIds.length > 0
          ? rbacAuthBll.filterAuthGroupIdsByRights(context, {
              orgId: organizationId,
              userId: userId,
              resourceType: 'recording',
              ids: recordingIds,
              rights: assetRights
            })
          : Promise.resolve([]),
        idsForOrgResourceType.length > 0
          ? rbacAuthBll.filterAuthGroupIdsByRights(context, {
              orgId: organizationId,
              userId: userId,
              resourceType: 'organization',
              ids: idsForOrgResourceType,
              rights: taskRights
            })
          : Promise.resolve([])
      ]);

      extraPayload.authGroups = _.uniq([
        ...authACLsForRecording,
        ...authACLsForOrgResourceType
      ]);

      // If legacy rights (< 2.0), then add the new olp-for-sdo necessary rights (if not exist)
      const jwtRightsVersion = _.get(engine, 'jwtRights.version', 1);
      if (jwtRightsVersion < 2.0) {
        if (!_.includes(assetRights, 'aiware.sdo.create')) {
          assetRights.push('aiware.sdo.create');
        }
        if (!_.includes(assetRights, 'aiware.sdo.read')) {
          assetRights.push('aiware.sdo.read');
        }
      }
    }

    const token = jwt.sign(
      {
        ...extraPayload,
        contentApplicationId: task.applicationId,
        contentOrganizationId: organizationId,
        engineId: engine ? engine.engineId : null,
        userId: userId,
        scope: [
          {
            actions: assetRights,
            resources: {
              recordingIds
            }
          },
          {
            actions: taskRights,
            resources: {
              jobIds,
              taskIds,
              sourceIds,
              schemaIds
            }
          }
        ]
      },
      app.config.jwt.secret,
      {
        expiresIn: app.config.jwt.ttl || '7d',
        jwtid: uuidv4(),
        subject: 'engine-run'
      }
    );

    // keep an eye on token size
    if (token.length > 8192) {
      app.logger.warn(
        'createJwtToken engine-run token size greater than 8k: ' + token.length,
        task
      );
    }

    return token;
  }

  return {
    createJwtToken
  };
};
