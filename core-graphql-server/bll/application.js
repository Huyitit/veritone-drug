const _ = require('lodash');
const fpl = require('@veritone/functional-permissions-lib');
const jwt = require('jsonwebtoken');
const { v1: uuid } = require('uuid');
const validator = require('validator');

module.exports = function createFunction(serviceContext) {
  const { logger, config } = serviceContext;
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')(serviceContext);
  const mapper = require('../dal/mapper.js');
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const dalUtil = require('../dal/util.js')(config, serviceContext);
  const constants = require('../util/appConstants.js')(serviceContext);
  const dbUtil = require('../util/db.js')(serviceContext);
  const createModel = require('@veritone/core-server-base/model/util/create-model');
  const fpUtil = require('../modules/rbacAuth/dal/functionalPermissionsUtil.dal')(
    serviceContext
  );

  const rbacAuthBll = _.get(
    serviceContext,
    'bll.rbacAuth',
    require('../modules/rbacAuth/bll/rbacAuth.bll.js')(serviceContext)
  );

  const appEventUpdateModel = createModel({
    appId: { type: 'string', required: true },
    eventEndpoint: { type: 'string', required: true },
    orgsTotal: { type: 'number', required: true },
    orgsProcessed: { type: 'number', required: false },
    isComplete: { type: 'boolean', required: true },
    isCancelled: { type: 'boolean', required: true }
  });

  // TODO: for now we will be passing the roleIds explicitly.
  // This will be replaced by an app_roleId table in the future
  async function getApplicationRights(context, options) {
    const { roleIds } = options;
    if (!_.isArray(roleIds) || _.isEmpty(roleIds)) {
      throw new errors.InvalidInput({
        message: 'roleIds cannot be null or empty',
        data: {
          objectType: 'RoleIds',
          objectId: roleIds
        }
      });
    }

    const roleRes = await serviceContext.dal.role.getRoles(context, {
      id: roleIds
    });

    if (_.isEmpty(roleRes.records)) {
      throw new errors.InvalidInput({
        message: 'inavlid input roleIds',
        data: {
          objectType: 'roleIds',
          objectId: roleIds
        }
      });
    }

    const arrRightsByRole = roleRes.records.map(
      (role) => fpUtil.permissionMaskToKeys(role.permissions, false) // include both legacy and application permissions
    );
    let applicationRights = [];

    arrRightsByRole.forEach((rights) => {
      applicationRights = _.uniq(applicationRights.concat(rights));
    });

    return _.union(applicationRights);
  }

  async function createApplicationJwtToken(
    context,
    application,
    jwtContext,
    roleIds
  ) {
    if (!_.isArray(roleIds) || _.isEmpty(roleIds)) {
      throw new errors.InvalidInput({
        message: 'roleIds cannot be empty',
        data: {
          objectType: 'RoleIds',
          objectId: roleIds
        }
      });
    }

    if (_.isNil(application)) {
      throw new errors.InvalidInput({
        message: 'invalid application'
      });
    }
    const applicationRights = await getApplicationRights(context, { roleIds });
    const extraPayload = {};
    const useRBACFeature = await mainUtil.isEnableFeatureInOrganization(
      context,
      undefined,
      jwtContext.organizationId,
      'enableRBACFeature'
    );

    if (useRBACFeature) {
      extraPayload.authGroups = await rbacAuthBll.filterAuthGroupIdsByRights(
        context,
        {
          orgId: jwtContext.organizationId,
          userId: jwtContext.userId,
          resourceType: 'Organization',
          ids: [jwtContext.organizationId],
          rights: applicationRights
        }
      );
    }

    const token = jwt.sign(
      {
        ...extraPayload,
        contentApplicationId: jwtContext.orgGuid,
        contentOrganizationId: jwtContext.organizationId,
        tokenApplicationId: application.id,
        userId: jwtContext.userId,
        scope: [
          {
            actions: applicationRights,
            resources: { applicationId: application.id }
          }
        ]
      },
      _.get(config, 'jwt.secret'),
      {
        expiresIn: _.get(config, 'jwt.ttl', '1d'),
        jwtid: uuid(),
        subject: 'engine-run'
      }
    );

    if (token.length > 8192) {
      logger.warn(
        'createJwtToken application token size greater than 8k: ' +
          token.length,
        jwtContext
      );
    }

    return token;
  }

  async function getApplicationJWTToken(context, args) {
    let { input, organizationId: requesterOrgId } = args;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const hasCreateAppJWTRight = mainUtil.hasPerm(
      'admin.create_application_jwt',
      context._authInfo
    );

    if (_.isNil(input.appId)) {
      throw new errors.InvalidInput({
        message: 'applicationId is required',
        data: {
          objectType: 'Application'
        }
      });
    }

    /*
    The algorithm to find the org id to which the token is scoped is as follows:

    If the org id is requested in the input and the requester is a super admin - use the requested org id
    If the org id is requested and the requester org is present and matches - use the requested org id
    If the org id is requested and there is no requester org - use the requested org id
    If the org id is not requested, use the requester org
     */
    let orgIdFromArgs = _.get(input, 'orgId');
    let scopedOrgId;
    if (orgIdFromArgs) {
      orgIdFromArgs = Number(orgIdFromArgs);
      requesterOrgId = Number(requesterOrgId);

      if (
        isSuperAdmin ||
        _.isNil(requesterOrgId) ||
        _.isNaN(requesterOrgId) || // when requesterOrgId is not provided Number(requesterOrgId) will be NaN
        orgIdFromArgs === requesterOrgId
      ) {
        scopedOrgId = orgIdFromArgs;
      }
    } else {
      scopedOrgId = requesterOrgId;
    }

    if (_.isNil(scopedOrgId)) {
      throw new errors.InvalidInput({
        message:
          'orgId was not provided or did not match the requester organization',
        data: {
          objectType: 'OrgId',
          objectId: orgIdFromArgs
        }
      });
    }

    const requesterUserId = _.get(
      context,
      '_authInfo.userId',
      _.get(context, 'userInfo.userId')
    );

    let roleIds = input.roleIds;

    if (
      !isSuperAdmin &&
      !hasCreateAppJWTRight &&
      !(_.isNil(roleIds) || _.isEmpty(roleIds))
    ) {
      throw new errors.InvalidInput({
        message:
          'when not called by a super admin or admin.create_application_jwt, roleIds must be null or empty',
        data: {
          objectType: 'RoleIds',
          objectId: roleIds
        }
      });
    }

    let orgGuid = args.applicationId;
    if (_.isNil(orgGuid)) {
      orgGuid = await serviceContext.dal.application.getAppIdFromOrgId(
        scopedOrgId
      );
    }

    if (_.isNil(roleIds) || _.isEmpty(roleIds)) {
      roleIds = await serviceContext.dal.application
        .getAppOrgEventRole(input.appId, scopedOrgId)
        .then((roles) =>
          roles.map((role) => role.id).filter((id) => !_.isNil(id))
        );
      if (_.isNil(roleIds) || _.isEmpty(roleIds)) {
        throw new errors.NotFound({
          message:
            'roleIds are not provided and cannot be deduced from other inputs',
          data: {
            objectType: 'Application',
            objectId: input.appId
          }
        });
      }
    }

    // verify access to application
    const getApplicationOptions = {
      id: input.appId,
      adminView: true,
      organizationId: scopedOrgId,
      orgId: scopedOrgId,
      isSuperAdmin
    };
    const application = await serviceContext.dal.application.getApplication(
      getApplicationOptions
    );
    const jwtContext = {
      orgGuid,
      tokenApplicationId: application.id,
      organizationId: parseInt(scopedOrgId),
      userId: requesterUserId
    };
    if (_.isNil(jwtContext.userId) || jwtContext.userId === '00000000-0000-0000-0000-000000000000') {
      // get oldest org admin default
      const defaultOrgAdmin = await serviceContext.dal.user.getDefaultOrgAdminUser(
        { organizationId: scopedOrgId },
        context
      );

      if (defaultOrgAdmin) {
        jwtContext.userId = defaultOrgAdmin.id;
      }
    }

    const token = await createApplicationJwtToken(
      context,
      application,
      jwtContext,
      roleIds
    );

    return mapper.mapApplicationJWTToken(application, jwtContext, token);
  }

  async function removeApplicationEventEndpoint(context, args) {
    const applicationId = args.id;
    // Check authorized to edit the application
    await serviceContext.dal.application.allowedToEditApplication(
      context,
      args.id
    );

    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'applications/' + applicationId + '/event-endpoint';

    const result = await dalUtil.httpCall(
      uri,
      context,
      null,
      mapper.mapApplication,
      'DELETE'
    );

    return {
      id: result.id,
      message: `Application event endpoint (application: ${result.id}, eventEndpoint: ${result.eventEndpoint}) and all app-org event handling users have been deleted`
    };
  }

  async function updateApplicationEventEndpoint(context, args) {
    const { id, eventEndpoint } = args.input;

    if (_.isEmpty(id) || _.isEmpty(eventEndpoint)) {
      throw new errors.InvalidInput({
        message: 'applicationId and eventEndpoint are required'
      });
    }

    // Check authorized to edit the application
    await serviceContext.dal.application.allowedToEditApplication(context, id);

    const redisAppEventUpdateRecord = await getRedisAppEventUpdateRecord(id);
    if (
      !_.isNil(redisAppEventUpdateRecord) &&
      !redisAppEventUpdateRecord.isComplete
    ) {
      // check progress
      const WAIT_FOR_PROGRESS_MS = 10000;
      const orgsProcessedOld = await getRedisAppEventUpdateOrgsProcessed(id);
      await mainUtil.sleep(WAIT_FOR_PROGRESS_MS);

      const orgsProcessedNew = await getRedisAppEventUpdateOrgsProcessed(id);
      const redisAppEventUpdateRecordNew = await getRedisAppEventUpdateRecord(
        id
      );
      if (
        !_.isNil(redisAppEventUpdateRecordNew) &&
        !redisAppEventUpdateRecord.isComplete
      ) {
        if (orgsProcessedNew !== orgsProcessedOld) {
          const orgsTotal = redisAppEventUpdateRecordNew.orgsTotal;
          const progress = (orgsProcessedNew / orgsTotal) * 100;
          const errMessage = `Application Event endpoint update is already in progress, ${progress.toFixed(
            1
          )}% complete`;
          throw new errors.ResourceUnavailable({
            message: errMessage,
            data: {
              appId: id,
              eventEndpoint: eventEndpoint,
              orgsProcessed: orgsProcessedNew,
              orgsTotal: orgsTotal,
              progress: progress
            }
          });
        }
        redisAppEventUpdateRecordNew.isCancelled = true;
        await updateRedisAppEventUpdateRecord(id, redisAppEventUpdateRecordNew);
      }
    }

    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'applications/' + id + '/event-endpoint';
    const payload = { eventEndpoint: eventEndpoint };

    let isResolved = false;
    const result = dalUtil
      .httpCall(uri, context, payload, mapper.mapApplication, 'PUT')
      .then((val) => {
        isResolved = true;
        return val;
      })
      .catch((err) => logger.error(err));

    const WAIT_FOR_HTTP_CALL_MS = 30000;
    await mainUtil.sleep(WAIT_FOR_HTTP_CALL_MS);
    if (isResolved) {
      return result;
    }

    {
      const redisAppEventUpdateRecord = await getRedisAppEventUpdateRecord(id);
      if (!_.isNil(redisAppEventUpdateRecord)) {
        const orgsProcessed =
          (await getRedisAppEventUpdateOrgsProcessed(id)) || 0;
        const orgsTotal = redisAppEventUpdateRecord.orgsTotal || 1;
        const progress = (orgsProcessed / orgsTotal) * 100;
        const errMessage = `Application Event endpoint update is now in progress, ${progress.toFixed(
          1
        )}% complete`;
        throw new errors.ResourceUnavailable({
          message: errMessage,
          data: {
            appId: id,
            eventEndpoint: eventEndpoint,
            orgsProcessed: orgsProcessed,
            orgsTotal: orgsTotal,
            progress: progress
          }
        });
      } else {
        const errMessage =
          'Attempted to start Application Event endpoint update, progress unavailable';
        throw new errors.ResourceUnavailable({
          message: errMessage,
          data: {
            appId: id,
            eventEndpoint: eventEndpoint
          }
        });
      }
    }
  }

  async function getRedisAppEventUpdateRecord(appId) {
    const redisAppEventUpdateKey = `appEventUpdateRecord:${appId}`;

    return new Promise((resolve, reject) => {
      serviceContext.redisClient.get(
        redisAppEventUpdateKey,
        (err, jsonRecord) => {
          if (err) {
            logger.error(
              'error retrieving app event endpoint update record from cache',
              redisAppEventUpdateKey,
              err
            );
            return reject(err);
          }
          return resolve(validateRedisAppEventUpdateRecord(jsonRecord));
        }
      );
    });
  }

  async function getRedisAppEventUpdateOrgsProcessed(appId) {
    const redisAppEventUpdateOrgCountKey = `appEventUpdateRecord:orgsProcessed:${appId}`;

    return new Promise((resolve, reject) => {
      serviceContext.redisClient.get(
        redisAppEventUpdateOrgCountKey,
        (err, orgsProcessed) => {
          if (err) {
            logger.error(
              'error retrieving app event endpoint update processed org count from cache',
              redisAppEventUpdateOrgCountKey,
              err
            );
            return reject(err);
          }
          if (_.isNil(orgsProcessed)) {
            return null;
          }
          return resolve(_.toInteger(orgsProcessed));
        }
      );
    });
  }

  function validateRedisAppEventUpdateRecord(jsonRecord) {
    if (_.isNil(jsonRecord) || _.isEmpty(jsonRecord)) {
      return null;
    }
    const record = new appEventUpdateModel(JSON.parse(jsonRecord));
    const validationErrors = record.validate();
    if (validationErrors) {
      throw new errors.InternalServerError({
        message: 'invalid app event update record',
        errors: validationErrors
      });
    }
    return record;
  }

  async function updateRedisAppEventUpdateRecord(appId, record) {
    const redisAppEventUpdateKey = `appEventUpdateRecord:${appId}`;
    const jsonRecord = JSON.stringify(record.toJSON());

    return new Promise((resolve, reject) => {
      serviceContext.redisClient.set(
        redisAppEventUpdateKey,
        jsonRecord,
        'KEEPTTL',
        (err, newRecord) => {
          if (err) {
            logger.error(
              'error updating app event endpoint update record in cache',
              redisAppEventUpdateKey,
              err
            );
            return reject(err);
          }
          if (_.isNil(newRecord)) {
            return null;
          }
          return resolve(JSON.parse(newRecord));
        }
      );
    });
  }

  async function enableApplicationsForOrganization(
    context,
    organizationId,
    applications
  ) {
    if (_.isNil(organizationId)) {
      throw new errors.InvalidInput({
        message: 'organizationId is required'
      });
    }

    if (!Array.isArray(applications)) {
      throw new errors.InvalidInput({
        message: 'applications must be an array'
      });
    }

    const enabledApps = new Set();
    const disabledApps = new Set();
    const orgId = parseInt(organizationId, 10);
    const res = {};

    await serviceContext.dal.organization.allowedToEditOrganization(
      context,
      orgId
    );

    for (const a of applications) {
      if (a.enable) {
        enabledApps.add(a.applicationId);
      } else {
        disabledApps.add(a.applicationId);
      }
    }

    if (enabledApps.size > 0) {
      let uri = context.config.services.coreAdminUri;
      if (!uri.endsWith('/')) uri += '/';
      uri += 'organizations/' + orgId + '/applications';
      let payload = { applicationIds: [...enabledApps] };
      await dalUtil.httpCall(
        uri,
        context,
        payload,
        mapper.camelizeRootKeys,
        'PATCH'
      );
      res.enabledApplications = [...enabledApps];
    }

    if (disabledApps.size > 0) {
      let uri = context.config.services.coreAdminUri;
      if (!uri.endsWith('/')) uri += '/';
      uri += 'organizations/' + orgId + '/applications';
      let payload = { applicationIds: [...disabledApps] };
      await dalUtil.httpCall(
        uri,
        context,
        payload,
        mapper.camelizeRootKeys,
        'DELETE'
      );
      res.disabledApplications = [...disabledApps];
    }

    return res;
  }

  async function getApplicationRolesByAppId(context, appId, options) {
    const { ownedOnly } = options || {};
    if (_.isNil(appId)) {
      throw new errors.InvalidInput({
        message: 'appId is required',
        data: {
          objectType: 'appId',
          objectId: appId
        }
      });
    }
    if (!validator.isUUID(appId)) {
      throw new errors.InvalidInput({
        message: 'appId is invalid',
        data: {
          objectType: 'appId',
          objectId: appId
        }
      });
    }

    let roles = [];
    if (ownedOnly === false) {
      // Get all available roles
      const _roles = await serviceContext.dal.role.getRoles(context, {
        applicationId: appId
      });
      roles = _.get(_roles, 'records', []);
    } else {
      // Only get roles the roles assigned to the caller in the org
      const userId = _.get(context, 'requestContext.userInfo.userId');
      const organizationGuid = mainUtil.getOrganizationGuid(context);

      roles = await serviceContext.dal.admin.getRolesForUser(
        { id: userId, organizationGuid, applicationId: appId },
        context
      );
    }

    return (roles || []).map((r) => {
      const permissionKeys = fpUtil.permissionMaskToKeys(r.permissions, true);
      r.permissions = fpUtil.mapPermissionEnumByKeys(permissionKeys);
      return r;
    });
  }

  async function applicationAddToOrg(args, context) {
    const { orgId, appId, configs } = args;
    if (!orgId) {
      throw new errors.InvalidInput({
        message: 'organization id is required'
      });
    }
    if (!appId) {
      throw new errors.InvalidInput({
        message: 'application id is required'
      });
    }
    if (!configs) {
      throw new errors.InvalidInput({
        message: 'configs field is required'
      });
    }

    // Add application to an organization
    const application = await serviceContext.dal.application.applicationAddToOrg(
      args,
      context
    );

    // Synchronously provision authGroups/permissionSets for RBAC orgs.
    // Removed in commit 225afdb176 with the assumption that core-eventing would handle it
    // asynchronously, but the async NSQ path races the test's assertion window.
    // _createAuthGroupsPermissionSetsAndACEs is idempotent; safe to run alongside eventing.
    await _createAuthGroupsPermissionSetsAndACEs(context, orgId, application);

    return application;
  }

  async function _createAuthGroupsPermissionSetsAndACEs(
    context,
    orgId,
    application
  ) {
    const result = {
      success: false,
      error: undefined
    };
    if (!orgId) {
      result.error = 'missing organization id';
      return result;
    }
    if (!application) {
      result.error = 'missing application info';
      return result;
    }
    // Get org
    const org = await serviceContext.dal.organization.getOrganization(context, {
      id: orgId
    });

    // Create authGroups/ permission sets
    const authGroupResult = await rbacAuthBll.checkAndCreateAuthGroupsForAppRoles(
      context,
      org,
      org.organizationGuid,
      application.id
    );
    if (!authGroupResult || !authGroupResult.success) {
      result.error = authGroupResult.error;
      return result;
    }
    const createdAuthGroup = authGroupResult.authGroups || [];
    const existingGroups = authGroupResult.existingGroups || [];

    // Create ACEs and apply to the resources
    const allAuthGroups = _.concat(createdAuthGroup, existingGroups);
    if (allAuthGroups.length === 0) {
      result.success = true;
      return result;
    }

    if (
      !_.isArray(authGroupResult.roleIds) ||
      authGroupResult.roleIds.length === 0
    ) {
      result.success = true;
      result.error = 'No roles found';
      return result;
    }

    if (
      !authGroupResult.permissionSet ||
      authGroupResult.permissionSet.length === 0
    ) {
      // Get permission sets by auth group names
      const permissionSets = await rbacAuthBll.getAuthPermissionSetsDB({
        organizationGuid: org.organizationGuid,
        roleIds: authGroupResult.roleIds
      });
      if (
        !permissionSets ||
        !_.isArray(permissionSets.records) ||
        permissionSets.records.length === 0
      ) {
        result.success = true;
        result.error = 'No permission sets found';
        return result;
      }

      authGroupResult.permissionSet.push(...permissionSets.records);
    }

    // mapping auth group - permission set
    const authGroupPermissionSets = allAuthGroups.map((g) => {
      const ps = authGroupResult.permissionSet.filter((p) => {
        return p.roleId === g.roleId;
      });
      if (ps.length === 0) {
        return g;
      }
      g.permissionSet = ps[0];

      return g;
    });

    const permissionEntries = [];
    for (const g of authGroupPermissionSets) {
      if (!g) {
        continue;
      }

      const permissionSet = _.get(g, 'permissionSet');
      if (permissionSet) {
        permissionEntries.push({
          member: {
            id: g.id,
            memberType: 'group'
          },
          permissionSetID: g.permissionSet.id
        });
      }
    }

    await rbacAuthBll.addACEsToResources(context, {
      ownerOrganization: org.organizationGuid,
      resourceType: 'organization',
      ids: [orgId],
      entries: permissionEntries
    });
  }

  async function deleteApplicationRoles(context, roleIds, options = {}) {
    const { applicationId, organizationId } = options;
    if (_.isEmpty(roleIds)) {
      throw new errors.InvalidInput({
        message: 'roleIds are required.'
      });
    }

    if (_.isNil(applicationId) || _.isNil(organizationId)) {
      throw new errors.InvalidInput({
        message: 'The applicationId and organizationId options are required.'
      });
    }

    if (!_.get(options, 'skipAppValidation', false)) {
      const application = await serviceContext.dal.application.getApplication({
        id: applicationId,
        adminView: true
      });
      const appStatus = _.get(application, 'status');
      if (appStatus === 'active') {
        throw new errors.NotAllowed({
          message:
            'Deleting application roles of the active application is not allowed.'
        });
      }
    }

    let roleIdsToDelete = roleIds;

    if (!_.get(options, 'skipRoleValidation', false)) {
      const existingRoles = await serviceContext.dal.role.getRoles(context, {
        id: roleIdsToDelete,
        applicationId: options.applicationId,
        organizationIds: [options.organizationId]
      });
      const systemRoleIds = Object.values(constants.ROLES);
      const rolesNotAllowedForDeletion = _.filter(
        existingRoles.records,
        (r) => systemRoleIds.includes(r.id) || r.isDefaultAppRole === true
      );

      if (rolesNotAllowedForDeletion.length > 0) {
        throw new errors.NotAllowed({
          message:
            'The provided roles include some that are not allowed to be deleted.'
        });
      }
      // override by existingRoles since getRoles method has a role filter before returning data.
      roleIdsToDelete = _.map(existingRoles.records, 'id');
    }

    if (!_.isEmpty(roleIdsToDelete)) {
      const organizationGuid = await serviceContext.dal.application.getAppIdFromOrgId(
        organizationId
      );
      const ssoDBTran = await dbUtil.dbWriteTx('sso');
      const coreDBTran = await dbUtil.dbWriteTx('core');
      try {
        await ssoDBTran.begin();
        await coreDBTran.begin();
        // delete related rows to application roles
        const [deletedRBACRes, deletedUserRoles] = await Promise.all([
          rbacAuthBll.deleteAppRoleAuthObjectsTx(roleIdsToDelete, {
            ssoDbClient: ssoDBTran.client,
            coreDbClient: coreDBTran.client,
            organizationId,
            organizationGuid
          }),
          ssoDBTran.client.map(
            'DELETE FROM public.sso_user_role WHERE role_id = ANY($1::uuid[]) RETURNING user_id AS id',
            [roleIdsToDelete],
            (row) => row.id
          ),
          ssoDBTran.client.none(
            'DELETE FROM public.organization_invite__application_roles WHERE role_id = ANY($1::uuid[]);',
            [roleIdsToDelete]
          )
        ]);
        // delete application roles
        await ssoDBTran.client.none(
          'DELETE FROM public.role WHERE role_id = ANY($1::uuid[]);',
          [roleIdsToDelete]
        );

        await coreDBTran.commit();
        await ssoDBTran.commit();

        // reload session users
        const userIds = new Set([
          ...deletedRBACRes.removedMemberIds,
          ...deletedUserRoles
        ]);
        if (userIds.size > 0) {
          rbacAuthBll.emitReloadSessionUsersEvent(organizationGuid, [
            ...userIds
          ]);
        }
      } catch (error) {
        await coreDBTran.rollback();
        await ssoDBTran.rollback();
        logger.error('Failed to delete application roles. error', error);
      } finally {
        ssoDBTran.done();
        coreDBTran.done();
      }
    }
  }

  return {
    getApplicationRights,
    createApplicationJwtToken,
    getApplicationJWTToken,
    removeApplicationEventEndpoint,
    updateApplicationEventEndpoint,
    enableApplicationsForOrganization,
    getApplicationRolesByAppId,
    applicationAddToOrg,
    _createPermissionSetsAndACEs: _createAuthGroupsPermissionSetsAndACEs,
    deleteApplicationRoles
  };
};
