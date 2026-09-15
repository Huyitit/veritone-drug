const mapper = require('./mapper.js');
const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const fpl = require('@veritone/functional-permissions-lib');
const validator = require('validator');
const {
  validateOrgRetentionPolicies,
  validateOrgFeaturesCompatibility
} = require('@veritone/core-server-base/shared-input-validators.js');

module.exports = function createFunction(
  logger,
  config,
  dalOrganization,
  serviceContext
) {
  const util = require('./util.js')(config, serviceContext);
  const errors = require('../error')(config);
  const InvalidInput = errors.InvalidInput;
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const mainUtil = require('../util.js')(serviceContext);
  const constants = require('../util/appConstants.js')(serviceContext);
  const redisCache = serviceContext.redisCache;
  const dbConnections = serviceContext.dbConnections;
  const ssoWrite = dbConnections['sso'].write;
  // the following cache key is used in core-eventing olp-organization-topic handler. Changing it requires an update to the handler.
  const DATA_ORGANIZATION = 'DataOrganization';
  const userSettingSelect = `
    us.user_id,
    us.key,
    us.value,
    us.application_id
  `;
  const userSettingReturning = {
    user_id: null,
    key: null,
    value: null,
    application_id: null
  };

  const userCustomProfileReturning = {
    user_id: null,
    organization_guid: null,
    custom_profile: null
  };

  const rbacAuthBll = _.get(
    serviceContext,
    'bll.rbacAuth',
    require('../modules/rbacAuth/bll/rbacAuth.bll')(serviceContext)
  );

  const enableAppEventFeature = _.get(
    serviceContext,
    'config.featureFlags.enableAppEventFeature',
    false
  );

  const enableStrictRoleValidation = _.get(serviceContext, 'config.featureFlags.enableStrictRoleValidation');
  async function updateOrganization(args, context) {
    const input = args.input;
    validateOrgRetentionPolicies(input, errors);
    // before updating the app we need to fetch current app data
    // to fill in any fields that are not being set by the user
    const { id, whitelist, blacklist } = input;
    const org = await serviceContext.dal.organization.getOrganization(
      context,
      {
        id
      },
      true // skip cache
    );
    validateOrgFeaturesCompatibility(org, input.metadata, 'update');
    // flush org-level RBAC and SDO RBAC when disabling the org-level feature
    if (input.metadata?.features?.enableRBACFeature === 'disabled') {
      org.kvp.features.enableRBACFeatureForSDO = 'disabled';
    }
    const applications = await serviceContext.dal.application.getApplications({
      organizationId: id,
      all: true,
      owned: false
    });
    // const [org, applications] = await Promise.all([
    //   serviceContext.dal.organization.getOrganization(context, { id }),
    //   serviceContext.dal.application.getApplications({
    //     organizationId: id,
    //     all: true,
    //     owned: false
    //   })
    // ]);

    let uri = config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'organizations/' + id;

    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    // we'll skip the main to the organization table if no primary
    // organization fields were updated in the input.
    // inputForUpdate will contain only these fields.

    // Check for conductor settings If called internally from webhook then skip superadmin check
    const isOrgAdmin = fpl.util.hasAccessTo(
      fpl.permissions.admin.org.update,
      context._authInfo.permissionMasks
    );

    const inputForUpdate = _.omit(input, [
      'whitelist',
      'blacklist',
      'id',
      'applicationId',
      'applicationIds',
      'organizationId',
      'organizationIds',
      'applicationAccess'
    ]);

    if (
      input.metadata &&
      Object.keys(input.metadata).length === 1 &&
      input.metadata.conductor &&
      isOrgAdmin
    ) {
      // temp patch to get conductor settings to pass if user is org admin
    } else if (input.metadata && !isSuperAdmin) {
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token does not have privileges ' +
          'to set full metadata on an organization.',
        data: {
          type: 'Organization',
          field: 'metadata',
          rights: mainUtil.listRights(context._authInfo)
        }
      });
    }

    // first verify that a user trying to set engine blacklist or whitelist
    // has the necessary permissions. these fields are superadmin-only.
    // we do this check first so that the entire update fails with an error
    // if user is not authorized.
    if (whitelist && !isSuperAdmin) {
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token does not have privileges ' +
          'to set the engine whitelist on an organization.',
        data: {
          type: 'Organization',
          field: 'whitelist',
          rights: mainUtil.listRights(context._authInfo)
        }
      });
    }
    if (blacklist && !isSuperAdmin) {
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token does not have privileges ' +
          'to set the engine blacklist on an organization.',
        data: {
          type: 'Organization',
          field: 'blacklist',
          rights: mainUtil.listRights(context._authInfo)
        }
      });
    }

    let res = org;
    const updateNeeded = !_.isEmpty(inputForUpdate);
    if (updateNeeded) {
      // Need to send pre-existing appId/key so we don't remove any
      const apps = _.map(applications.records, (app) =>
        _.pick(app, ['applicationId', 'applicationKey'])
      );

      // support changing the "indexTDOsByDefault" org default as a discrete input field and other configs via input metadata
      const newKVP = _.merge({}, org.kvp, input.metadata, {
        features: {
          indexing: {
            tdoDefault: input.indexTDOsByDefault
          }
        }
      });

      let payload = {
        organizationName: input.name || org.name,
        seatLimit: input.seatLimit || org.seatLimit,
        status: input.status || org.status,
        businessUnit: input.businessUnit || org.businessUnit,
        kvp: newKVP,
        apps,
        remainingBudget: _.get(input, 'remainingBudget'),
        isLimitEnforced: _.get(input, 'isLimitEnforced'),
        requireOpenId: _.get(input, 'requireOpenId'),
        isHubManaged: _.get(input, 'isHubManaged'),
        dataRetentionPolicies: _.get(input, 'dataRetentionPolicies')
      };

      payload = _.omitBy(payload, _.isNil); // remove null and undefined fields
      const updateRes = await util.httpCall(
        uri,
        context,
        payload,
        mapper.mapOrganization,
        'PUT'
      );
      // response to update does not include a complete object. fill
      // in with the values we just retrieved.
      res = Object.assign(org, input, updateRes);
    }

    // TODO we could do these in a single database operation, but this
    // feature will not be used often so we'll stick with simpler code for now.
    // whitelist updates go in a separate table
    if (whitelist) {
      await dalOrganization.setEngineWhitelist(context, org, whitelist);
    }
    // blacklist updates go in a separate table
    if (blacklist) {
      await dalOrganization.setEngineBlacklist(context, org, blacklist);
    }

    // if Okta configuration is being modified, we use a direct db update
    // since core-admin-server doesn't support the new fields.
    if (input.oktaConfiguration) {
      if (!org.id) org.id = org.organizationId; // the assign above somehow clears id in the unit test code
      await serviceContext.dal.organization.setOrgOktaConfiguration(
        context,
        org,
        input.oktaConfiguration
      );
      res.kvp = org.kvp;
    }

    if (input.loginConfiguration) {
      await serviceContext.dal.organization.setLoginConfiguration(
        context,
        org,
        input.loginConfiguration
      );
    }

    if (!_.isNil(input.remainingBudget) || !_.isNil(input.isLimitEnforced)) {
      if (!isSuperAdmin) {
        throw new errors.NotAllowed({
          message:
            'The authenticated user or token does not have privileges ' +
            'to set remainingBudget or isLimitEnforced on an organization.',
          data: {
            type: 'Organization',
            fields: ['remainingBudget', 'isLimitEnforced'],
            rights: mainUtil.listRights(context._authInfo)
          }
        });
      }

      const updatedLimitBudget = await serviceContext.dal.organization.setOrgRemainingBudget(
        context,
        id,
        input.remainingBudget,
        input.isLimitEnforced
      );

      if (!_.isNil(updatedLimitBudget)) {
        res.remainingBudget = _.get(
          updatedLimitBudget,
          'remainingBudget',
          res.remainingBudget
        );
        res.isLimitEnforced = _.get(
          updatedLimitBudget,
          'isLimitEnforced',
          res.isLimitEnforced
        );
      }
    }

    if (input.applicationAccess && input.applicationAccess.length > 0) {
      if (isOrgAdmin || isSuperAdmin) {
        await serviceContext.bll.application.enableApplicationsForOrganization(
          context,
          id,
          input.applicationAccess
        );
      } else {
        throw new errors.NotAllowed({
          message:
            'The authenticated user or token does not have privileges ' +
            'to modify the accessible applications list.',
          data: {
            type: 'Organization',
            fields: ['applicationAccess'],
            rights: mainUtil.listRights(context._authInfo)
          }
        });
      }
    }
    // update redis cache with the new organization data
    await redisCache.set(DATA_ORGANIZATION, _.toString(res.id), res);
    return res;
  }

  async function createUser(args, context) {
    const input = args.input;
    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'users';

    const kvp = Object.assign(
      {
        firstName: input.firstName,
        lastName: input.lastName
      },
      input.jsondata
    );
    _beforeSaveKVP(kvp, input);
    const payload = {
      email: input.email,
      orgId: input.organizationId,
      password: input.password,
      passwordHash: input.passwordHash,
      roles: input.roleIds || [], // avoid core-admin-server crash if undefined
      userName: input.name,
      sendNewUserEmail: input.sendNewUserEmail,
      acls: input.acls,
      kvp: kvp,
      createdByOrgInvite: input.createdByOrgInvite,
      authGroupIds: input.authGroupIds,
      userId: input.userId
    };

    const newUser = await util.httpCall(
      uri,
      context,
      payload,
      mapper.mapUser,
      'POST'
    );
    if (!newUser.organizationId) newUser.organizationId = input.organizationId;
    return newUser;
  }

  function updateUser(args, context) {
    const input = args.input;
    // before updating the app we need to fetch current app data
    // to fill in any fields that are not being set by the user
    return getUsers({ id: input.id }, context).then(function (data) {
      return doUpdateUser(input, context, data);
    });
  }

  async function addUserToOrganization(args, context, dbClient) {
    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].write;
    const isInternalToken = resUtil.getTokenType(context) === 'internal';
    let userId = args.userId;
    const requestorId = _.get(context, '_authInfo.userId');

    if (userId && !validator.isUUID(userId)) {
      throw new errors.InvalidInput({
        message: `A user ID must be a valid UUID: ${userId}`
      });
    }
    const userName = args.userName;
    if (!userId && !userName) {
      throw new errors.InvalidInput({
        message: 'Either userId or userName must be specified.'
      });
    }

    const organizationGuid = args.organizationGuid;
    if (!organizationGuid || !validator.isUUID(organizationGuid)) {
      throw new errors.InvalidInput({
        message: `organizationGuid must be specified and be a valid UUID: ${organizationGuid}`
      });
    }

    const allowItselfToUpdate = requestorId === userId && args.addByOrgInvite;

    if (!allowItselfToUpdate) {
      const allowed = await allowedToUpdateOrganization(
        context,
        organizationGuid,
        dbClient
      );
      if (!allowed) {
        throw new errors.NotAllowed({
          message: `The authenticated user is now allowed to add user to organization: ${organizationGuid}`
        });
      }
    }

    const roleIds = Array.isArray(args.roleIds) ? args.roleIds : [];
    const priority = args.priority;

    // get Auth Groups for the member using RoleIds.
    let authGroups = [];

    const org = await serviceContext.dal.organization.getOrganization(context, {
      id: organizationGuid
    });

    const useRBACFeature = await mainUtil.isEnableFeatureInOrganization(
      context,
      org,
      null,
      'enableRBACFeature'
    );

    if (useRBACFeature) {
      // Get all authGroups for the user
      authGroups = await getAuthGroupsForUser(
        { organizationGuid, roleIds, organization: org, allowItselfToUpdate },
        context
      );
    }

    if (roleIds.length > 0) {
      const legacyMap = constants.LEGACY_TO_DESKTOP_ROLE_MAP;
      if (legacyMap.size > 0) {
        const blockedIds = roleIds.filter(id => legacyMap.has(id));
        if (blockedIds.length > 0) {
          throw new errors.InvalidInput({
            message: `Cannot assign legacy Admin application roles. Use Desktop application roles instead.`
          });
        }
      }
      if (enableStrictRoleValidation) {
        const invalidRoles = await client.manyOrNone(
          `
          SELECT
              r.role_id,
              r.role_name,
              a.application_name AS app_name
          FROM "role" r
          LEFT JOIN application a
              ON a.application_id = r.application_id
          WHERE r.role_id = ANY($1::uuid[])
            AND r.application_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1
                FROM application__organization ao
                WHERE ao.application_id = r.application_id
                  AND ao.organization_id = (
                      SELECT (sg.kvp->>'organizationId')::int
                      FROM sso_group sg
                      WHERE sg.application_id = $2
                        AND sg.kvp->>'groupType' = 'organization'
                      LIMIT 1
                  )
            )
          `,
          [roleIds, organizationGuid]
        );
        if (invalidRoles.length > 0) {
          const names = invalidRoles.map(r => `${r.app_name} - ${r.role_name}`).join(', ');
          throw new errors.InvalidInput({
            message: `Cannot assign roles for applications that are not enabled in this organization: ${names}`
          });
        }
      }
    }

    return await client
      .tx('addUserToOrganization', async (t) => {
        if (!userId) {
          userId = await t.one(
            `SELECT user_id FROM sso_user WHERE user_name = $1`,
            [userName],
            (row) => row.user_id
          );
          if (!userId) {
            throw new Error(`Invalid user name: ${userName}`);
          }
        }

        let createdBy = requestorId;

        // for internal token
        if (!createdBy && isInternalToken && userId) {
          createdBy = userId;
        }

        const groupId = await t.one(
          `SELECT group_id FROM sso_group WHERE application_id = $1 AND kvp->>'groupType' = 'organization'`,
          [organizationGuid],
          (row) => row.group_id
        );
        if (!groupId) {
          throw new Error(`Invalid organizationGuid: ${organizationGuid}`);
        }
        const queries = [];
        for (let roleId of roleIds) {
          queries.push(
            t.none(
              `INSERT INTO sso_user_role (user_id, role_id, application_id, created_by)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (user_id, role_id, application_id) DO NOTHING`,
              [userId, roleId, organizationGuid, createdBy]
            )
          );
        }

        queries.push(
          priority
            ? t.none(
                `INSERT INTO sso_user__sso_group (user_id, group_id, priority)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, group_id) DO NOTHING`,
                [userId, groupId, priority]
              )
            : t.none(
                `INSERT INTO sso_user__sso_group (user_id, group_id, priority)
                 VALUES ($1, uuid($2), next_priority($3))
                 ON CONFLICT (user_id, group_id) DO NOTHING`,
                [userId, groupId, userId]
              )
        );

        return t.batch(queries);
      })
      .then(async (data) => {
        if (useRBACFeature) {
          // Added user to orgAllAccess default auth group
          // Always add to orgAllAccess
          // Add user to Auth Groups after user added to organization.
          await Promise.all(
            // Add Member to Auth Group
            authGroups.map((authGroup) =>
              rbacAuthBll.authGroupAddMembers(context, {
                ownerOrganization: organizationGuid,
                id: authGroup.id, // auth_group_id
                members: [{ id: userId, memberType: 'user' }],
                allowItselfToUpdate: allowItselfToUpdate
              })
            )
          );
        }

        // add audit log
        return getUser({ id: userId }, context);
      })
      .catch((error) => {
        logger.error(
          `Failed to addUserToOrganization. errorMessage: ${error.message}`,
          error
        );
        throw error;
      });
  }

  // Get all authGroups for the user
  // args = { organizationGuid, roleIds, organization }
  async function getAuthGroupsForUser(args, context) {
    const msgPrefix = 'Failed to get authGroups for the user:';
    if (!args) {
      throw new errors.InvalidInput({
        message: `${msgPrefix} Missing the input`
      });
    }

    const organizationGuid = args.organizationGuid;
    const roleIds = args.roleIds || [];
    const allowItselfToUpdate = args.allowItselfToUpdate;
    let org = args.organization;
    if (!organizationGuid || organizationGuid === '') {
      throw new errors.InvalidInput({
        message: `${msgPrefix} Missing or invalid organizationGuid`
      });
    }

    if (!org) {
      org = await serviceContext.dal.organization.getOrganization(context, {
        id: organizationGuid
      });
    }

    const isAdminUser = _.some(roleIds, (id) =>
      constants.ADMIN_ROLE_SET.has(id)
    );
    // 1. Get default groups
    // Check default organization groups from kvp first
    const defaultAdminGroupName = 'orgAdmin';
    const authGroups = [];
    const defaultAuthGroups = _.get(org, 'kvp.defaultAuthGroups', []);
    if (defaultAuthGroups.length > 0) {
      defaultAuthGroups.forEach((group) => {
        if (
          _.includes(
            group.name,
            constants.DEFAULT_AUTH_GROUP_SUFFIX.ORG_ADMIN
          ) ||
          _.includes(group.name, constants.DEFAULT_AUTH_GROUP_NAME.ORG_ADMIN) ||
          group.defaultGroup === defaultAdminGroupName
        ) {
          if (isAdminUser) {
            authGroups.push(group);
          }
        } else {
          authGroups.push(group);
        }
      });
    }

    // 2. Get all auth group from roleIds
    if (roleIds.length > 0) {
      const authGroupsFromRoles = await rbacAuthBll.getAuthGroups(context, {
        ownerOrganization: organizationGuid,
        appRoleID: roleIds,
        allowItselfToUpdate: allowItselfToUpdate
      });
      authGroups.push(..._.get(authGroupsFromRoles, 'records', []));
    }

    return authGroups;
  }

  async function removeUserFromOrganization(args, context) {
    let userId = args.userId;
    if (userId && !validator.isUUID(userId)) {
      throw new errors.InvalidInput({
        message: `A user ID must be a valid UUID: ${userId}`
      });
    }
    const userName = args.userName;
    if (!userId && !userName) {
      throw new Error('Either userId or userName must be specified.');
    }

    const organizationGuid = args.organizationGuid;
    if (!organizationGuid || !validator.isUUID(organizationGuid)) {
      throw new errors.InvalidInput({
        message: `organizationGuid must be specified and be a valid UUID: ${organizationGuid}`
      });
    }

    if (!allowedToUpdateOrganization(context, organizationGuid)) {
      throw new errors.NotAllowed({
        message: `The authenticated user is now allowed to remove user to organization: ${organizationGuid}`
      });
    }

    return await serviceContext.dbConnections['sso'].write
      .tx('removeUserFromOrganization', async (t) => {
        if (!userId) {
          userId = await t.one(
            `SELECT user_id FROM sso_user WHERE user_name = $1`,
            [userName],
            (row) => row.user_id
          );
          if (!userId) {
            throw new Error(`Invalid user name: ${userName}`);
          }
        }

        let count = await t.one(
          `SELECT count(ug.group_id) FROM sso_user__sso_group ug JOIN sso_group g ON ug.group_id = g.group_id 
            WHERE ug.user_id = $1
            AND g.application_id = $2`,
          [userId, organizationGuid],
          (a) => +a.count
        );
        // user is not in the organization
        if (!count || count === 0) {
          throw new Error(
            `User ${userId} does not belong to organization ${organizationGuid}`
          );
        }
        count = await t.one(
          `SELECT count(ug.group_id) FROM sso_user__sso_group ug JOIN sso_group g ON ug.group_id = g.group_id 
            WHERE ug.user_id = $1
            AND g.application_id != $2`,
          [userId, organizationGuid],
          (a) => +a.count
        );
        // user is not in any other organization
        if (!count || count === 0) {
          throw new Error(
            `User ${userId} can not be removed from the only one organization it belongs to.`
          );
        }

        const queries = [
          t.none(
            'DELETE FROM sso_user__sso_group WHERE user_id = $1 AND group_id = (SELECT group_id FROM sso_group WHERE application_id = $2)',
            [userId, organizationGuid]
          )
        ];

        queries.push(
          t.none(
            'DELETE FROM sso_user_role WHERE user_id = $1 AND application_id = $2',
            [userId, organizationGuid]
          )
        );

        // Delete all records in rbac_auth_group_member
        queries.push(
          t.none(
            `DELETE FROM rbac_auth_group_member WHERE member_id = $1 AND 
          auth_group_id IN (SELECT auth_group_id FROM rbac_auth_group WHERE organization_guid = $2)`,
            [userId, organizationGuid]
          )
        );

        return t.batch(queries);
      })
      .then((data) => {
        // add audit log
        return getUser({ id: userId }, context);
      })
      .catch((error) => {
        logger.error(
          `Failed to removeUserFromOrganization. errorMessage: ${error.message}`,
          error
        );
        throw error;
      });
  }

  async function switchUserToOrganization(args, context) {
    if (!validator.isUUID(args.organizationGuid)) {
      throw new errors.InvalidInput({
        message: `organizationGuid must be specified and be a valid UUID: ${args.organizationGuid}`
      });
    }
    const requestorId = _.get(context, '_authInfo.userId');

    // should get user's email to login because the username and email might not have to match.
    const users = await serviceContext.dal.admin.getUsersByEmail(
      { email: args.userName, userId: requestorId },
      context
    );
    const userName = _.get(_.head(users), 'userName');

    if (_.isNil(userName)) {
      throw new errors.NotFound({
        message: `User ${args.userName} not found`
      });
    }

    const payload = {
      userName,
      token: args.token,
      organizationGuid: args.organizationGuid
    };
    return await switchLogin(context, payload);
  }

  async function allowedToUpdateOrganization(
    context,
    organizationGuid,
    dbClient
  ) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    if (!isSuperAdmin) {
      const userId = _.get(context, '_authInfo.userId');
      const orgGuids = await getOrganizationGuidsForUser(
        { id: userId },
        context,
        dbClient
      );
      if (!orgGuids.includes(organizationGuid)) {
        return false;
      }
    }
    return true;
  }

  async function doUpdateUser(input, context, data) {
    if (!(data.records && data.records.length)) {
      throw new errors.NotFound({
        data: {
          objectId: input.id,
          objectType: 'User'
        }
      });
    }

    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);

    // If the organization is not specified when requester is org-admin,
    // use the organization from org-admin context.
    if (_.isNil(input.organizationId) && !isSuperAdmin && isOrgAdmin) {
      input.organizationId = _.get(
        context._authInfo,
        'organization.organizationId'
      );
    }

    const user = data.records[0];
    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'users/' + input.id;

    const kvp = Object.assign({}, input.jsondata, user.kvp);
    const email = input.email || user.email || user.userName;
    _beforeSaveKVP(kvp, input);

    const payload = {
      kvp,
      email
    };

    if (input.organizationId) {
      payload.organizationGuid = await serviceContext.dal.application.getAppIdFromOrgId(
        input.organizationId
      );
    }

    if (!_.isUndefined(input.acls)) {
      payload.acls = input.acls;
    }
    if (!_.isUndefined(input.roleIds)) {
      payload.roles = input.roleIds;
    }

    if (!_.isEmpty(input.authGroupIds)) {
      payload.authGroupIds = input.authGroupIds;
    }

    return util
      .httpCall(uri, context, payload, mapper.mapUser, 'PUT')
      .then(function (result) {
        // response to update does not include a complete object. fill
        // in with the values we just retrieved.
        Object.keys(user).forEach(function (key, index) {
          if (!result[key]) {
            if (input[key]) {
              result[key] = input[key];
            } else {
              result[key] = user[key];
            }
          }
        });

        // TODO: Retrieve roles only when they are requested in Graphql query/mutation?
        return getRolesForUser(
          { id: input.id, organizationGuid: input.organizationGuid },
          context
        ).then(function (records) {
          result.roles = records
          result.roleIds = records.map(role => role.id);
          return result;
        });
      });
  }

  async function doSqlUpdateUser(options, context) {
    const currentUser = _.get(context, 'requestContext.userInfo');
    const modifiedDateTime = new Date();

    const sql = `UPDATE sso_user
    SET kvp = $1,
      date_modified = $2,
      modified_by = $3
    WHERE user_id = $4`;

    const args = [
      options.user.kvp,
      modifiedDateTime.toUTCString(),
      currentUser.userId,
      options.user.userId
    ];

    await serviceContext.dbConnections['sso'].write.query(sql, args);
    options.user.modifiedDateTime = modifiedDateTime;

    return options.user;
  }

  async function updateUserRoles(args, context) {
    const input = args.input;
    mainUtil.checkId(input.userId, false, true);

    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'users/' + input.userId + '/roles';

    const payload = {
      addRoleIds: input.addRoleIds || [],
      removeRoleIds: input.removeRoleIds || []
    };
    if (input.organizationId) {
      payload.organizationGuid = await serviceContext.dal.application.getAppIdFromOrgId(
        input.organizationId
      );
    }

    const user = await util.httpCall(uri, context, payload, mapper.mapUser, 'PUT');
    const organizationGuid = user.organizationGuid || payload.organizationGuid;
    const roles = await getRolesForUser(
      { id: input.userId, organizationGuid },
      context
    );
    user.roles = roles;
    user.roleIds = roles.map(role => role.id);
    return user;
  }

  function deleteUser(args, context) {
    const id = args.id;
    mainUtil.checkId(id, false, true);
    var uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'users/' + id;

    return util.httpCall(
      uri,
      context,
      {},
      function (data) {
        return { id: id };
      },
      'DELETE'
    );
  }

  function createPasswordUpdateRequest(args, context) {
    const input = args.input;
    var uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'users/' + input.id + '/force-password-reset';

    const payload = {
      skipPasswordResetEmail: input.skipPasswordResetEmail
    };

    return getUsers({ id: input.id }).then(function (data) {
      if (!(data.records && data.records.length)) {
        throw new errors.NotFound({
          data: { objectId: input.id, objectType: 'User' }
        });
      }

      const user = data.records[0];
      return util.httpCall(uri, context, payload, () => user, 'POST');
    });
  }

  async function createPasswordResetRequest(args, context) {
    const input = args.input || {};
    var uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'password/request-reset';

    const payload = {
      skipPasswordResetEmail: _.isNil(input.skipPasswordResetEmail)
        ? false
        : input.skipPasswordResetEmail,
      userName: input.userName
    };

    const hres = await util.httpCall(uri, context, payload, null, 'POST');

    return {
      message:
        'Reset request issued for ' +
        input.userName +
        '. Email will' +
        (input.skipPasswordResetEmail ? ' not ' : ' ') +
        'be sent.'
    };
  }

  async function updateCurrentUser(args, context) {
    const userId = args.userId;
    const input = args.input;
    const mfaInfo = input.mfaInfo;
    const userSetting = input.userSetting;
    let listUser = await getUsers({ id: userId });
    if (!(listUser.records && listUser.records.length)) {
      throw new errors.NotFound({
        data: { objectId: userId, objectType: 'User' }
      });
    }
    const user = listUser.records[0];

    if (mfaInfo) {
      if (!input.passwordToken || input.passwordToken === '') {
        throw new errors.InvalidInput({
          message: 'passwordToken must be provided'
        });
      }

      const mfaResult = await unregisterMfaCurrentUser(args, context);
      //Follow in core-admin-server need to
      //verify MFA with 6 digit token
      //before register new MFA Current user
      //https://github.com/veritone/core-admin-server/blob/develop/bll/user.js#L509
      const payloadResult = await registerMfaCurrentUser(args, context);
    }

    if (userSetting) {
      // Create and update is the same function
      // Because of REST API Create,
      // if User setting aready exists, update instead
      // https://github.com/veritone/core-admin-server/blob/develop/route/current-user.js#L198
      const resSetting = await createUpdateSettingCurrentUser(
        userSetting,
        context
      );
    }

    if (input.firstName || input.lastName || input.imageUrl) {
      _beforeSaveKVP(user.kvp, input);

      return await doSqlUpdateUser({ user }, context);
    }

    return user;
  }

  function unregisterMfaCurrentUser(args, context) {
    const userId = args.userId;
    var uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'current-user/mfa/unregister/ga';

    const payload = {
      passwordToken: args.input.passwordToken
    };

    return util.httpCall(uri, context, payload, mapper.mapUserMfaInfo, 'POST');
  }

  function registerMfaCurrentUser(args, context) {
    const input = args.input;
    const userId = args.userId;
    var uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'current-user/mfa/register';

    const payload = {
      type: 'ga',
      phoneNumber: _.get(input, 'mfaInfo.phoneNumber'),
      passwordToken: input.passwordToken
    };

    return util.httpCall(
      uri,
      context,
      payload,
      mapper.camelizeRootKeys,
      'POST'
    );
  }

  function createUpdateSettingCurrentUser(input, context) {
    var uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'current-user/user-settings';

    const payload = {
      key: input.key,
      value: input.value
    };

    return util.httpCall(
      uri,
      context,
      payload,
      mapper.camelizeRootKeys,
      'POST'
    );
  }

  function switchLogin(context, payload) {
    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'login';

    return util.httpCall(
      uri,
      context,
      payload,
      mapper.camelizeRootKeys,
      'POST'
    );
  }

  function login(context, input) {
    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'login';

    const payload = {
      userName: input.userName,
      password: input.password,
      organizationGuid: input.organizationGuid,
      allowVanityDomain: input.allowVanityDomain
    };

    return util.httpCall(
      uri,
      context,
      payload,
      mapper.camelizeRootKeys,
      'POST'
    );
  }

  async function getPasswordToken(context, input) {
    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'password-token';

    const payload = {
      userName: input.userName,
      password: input.password
    };

    return util
      .httpCall(uri, context, payload, mapper.camelizeRootKeys, 'POST')
      .catch(async function handleErr(err) {
        // core-admin returns a 404, which we map to not_found,
        // on password check failure. we'll add special handling for this
        // case here.
        if (err.name === 'not_found') {
          // as a basic check against brute force attacks
          // we'll add a 1s delay before returning.
          await mainUtil.sleep(1000);
          throw new errors.NotAllowed({
            message:
              'The supplied password could not be validated. Check your ' +
              'current password and try again.'
          });
        } else {
          // for other errors just throw out unmodified.
          throw err;
        }
      });
  }

  function logout(context, token, sessionExpired = false) {
    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'token/' + token + '/logout';
    if (sessionExpired) {
      uri += '?sessionExpired=true';
    }

    return util.httpCall(uri, context, {}, (data) => data, 'GET');
  }

  function validateToken(context, token) {
    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'token/' + token;

    return util.httpCall(uri, context, {}, mapper.camelizeRootKeys, 'GET');
  }

  function refreshToken(context, token) {
    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'token/' + token + '/refresh';
    return util.httpCall(uri, context, {}, mapper.camelizeRootKeys, 'GET');
  }

  function extendToken(context, token) {
    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'token/' + token + '/extend';
    return util.httpCall(uri, context, {}, mapper.camelizeRootKeys, 'GET');
  }

  function getAllOrgTokens(context, organizationId) {
    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'organizations/' + organizationId + '/tokens/all';
    return util.httpCall(uri, context, {}, mapper.mapTokens, 'GET');
  }

  function getMfaInfo(context, userId) {
    return getUserMfaInfo({ id: userId });
  }

  async function changePassword(context, args) {
    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'current-user/change-password';

    // core admin endpoint returns 204 and empty body.
    await util.httpCall(
      uri,
      context,
      {
        oldPassword: args.input.oldPassword,
        newPassword: args.input.newPassword
      },
      null,
      'POST'
    );
    const currentUserId =
      _.get(context, '_authInfo.userId') ||
      _.get(context, '_authInfo.data.userId');
    return getUser({ id: currentUserId }, context);
  }

  async function getUserSettings(context, args) {
    const userId = await _loadCheckAccessUserSetting(context, args);

    return _getUserSettingDb({
      userId,
      keys: args.keys,
      applicationId: args.application
    });
  }

  function generateApiTokenId() {
    const prefix = Math.floor(Math.random() * 10000000).toString(16);
    return prefix + ':' + (uuidv4() + uuidv4()).replace(/-/g, '');
  }

  const defaultOrgTokenRights = [
    'asset:uri',
    'job:create',
    'job:read',
    'job:update',
    'job:delete',
    'task:update',
    'recording:create',
    'recording:read',
    'recording:update',
    'recording:delete',
    'report:create',
    'analytics:usage',
    'ami-node:create'
  ];

  const defaultAiwareOrgTokenRights = defaultOrgTokenRights.concat([
    'cluster:read',
    'node:ping',
    'node:update-bundle',
    'node:next-bundle',
    'node:get-cluster-config',
    'node:update-directory-cache',
    'node:update-directory-patch-cache',
    'external-credential:token'
  ]);

  const defaultWorkflowOrgTokenRights = defaultOrgTokenRights.concat([
    'workflow:create',
    'task:read',
    'task:create',
    'build:create',
    // job {create, read, update, delete} inherited
    'cms.media.create', // folder create
    'cms.media.update', // folder {update, move}
    'cms.media.delete', // folder delete
    'cms.media.read', // folder read
    // tdo {create, read, update, delete} inherited
    // sdos {create} is permissionless, {read, update, delete} based on ownership
    'collections.collections.create',
    'collections.collections.update',
    'collections.collections.delete',
    'collections.collections.read',
    // watchlists {create} is permissionless, {read, update, delete} based on ownership
    'developer.engine.create', // includes application create
    'developer.engine.update',
    'developer.engine.delete', // includes application delete
    'developer.engine.read', // includes engine category read
    'developer.build.create',
    'developer.build.update',
    'developer.build.delete',
    'developer.build.read',
    // libaries {create} is permissionless, {read, update, delete} based on ownership
    // libaries type {create} is permissionless, {read, update, delete} based on ownership
    'discovery:mentions:read', // get mention
    'collections.mentions.update', // mention rating & comment {create, update, delete}
    // mentions {create} is permissionless
    // source {create} is permissionless
    // source {delete} requires source owner
    'cms.sources.read',
    'source:update',
    // scheduled jobs / programs {create} is permissionless, {read, update, delete} based on ownership
    'admin:user:read' // user read
  ]);

  async function createOrganization(context, args) {
    const input = _.get(args, 'input', {});
    const kvp = _.get(input, 'metadata', {});
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    validateOrgRetentionPolicies(input, errors);
    validateOrgFeaturesCompatibility(null, kvp);
    if (
      (_.has(kvp, 'features.engineLimit') || _.has(kvp, 'billing')) &&
      !fpl.util.hasAccessTo(
        fpl.permissions.veritone.financeadmin,
        context._authInfo.permissionMasks
      ) &&
      !fpl.util.hasAccessTo(
        fpl.permissions.veritone.superadmin,
        context._authInfo.permissionMasks
      )
    ) {
      throw new errors.NotAllowed({
        message:
          'Only finance admins and super admins can set billing and engineLimits.'
      });
    }

    // Only superadmin can set these options for org
    if (
      (_.has(input, 'remainingBudget') ||
        _.has(input, 'isLimitEnforced') ||
        _.has(kvp, 'features.enableRBACFeature')) &&
      !isSuperAdmin
    ) {
      throw new errors.NotAllowed({
        message:
          'Only superadmin can set limitRemaining, limitEnforced and olp feature.'
      });
    }

    let uri = config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'organizations';

    const {
      guid,
      name,
      applications,
      status,
      types,
      metadata,
      ...otherFields
    } = input;
    const payload = {
      ...otherFields,
      apps: applications,
      status,
      organizationGuid: guid,
      organizationName: name,
      organizationType: types,
      kvp: metadata || {}
    };

    const res = await util.httpCall(
      uri,
      context,
      payload,
      mapper.mapOrganization,
      'POST'
    );

    if (_.has(input, 'loginConfiguration')) {
      await serviceContext.dal.organization.setLoginConfiguration(
        context,
        res,
        input.loginConfiguration
      );
    }

    const result = await serviceContext.dal.organization.getOrganization(
      context,
      {
        id: res.id
      }
    );
    return result;
  }

  // api token types to token rights
  const tokenTypesToTokenRights = {
    default: defaultOrgTokenRights,
    aiware: defaultAiwareOrgTokenRights,
    workflow: defaultWorkflowOrgTokenRights
  };

  // we could potentially expose this as create api token mutation
  // as needed but we need to enforce some fallbacks if the user
  // is not superadmin
  async function createInternalApiToken(args) {
    if (!args.organizationId) {
      throw new InvalidInput({
        message: 'Missing organization id.'
      });
    }
    let tokenType = args.tokenType || 'default';
    if (args.aiwareEnabled) {
      tokenType = 'aiware';
    }
    if (!args.groupId) {
      args.groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
        args.organizationId
      );
    }
    const cmsAppId = await serviceContext.dal.application.getAppIdFromOrgId(
      args.organizationId
    );
    const tokenDetails = {
      applicationId: cmsAppId,
      isRevoked: false,
      rights: tokenTypesToTokenRights[tokenType],
      tokenId: args.id || generateApiTokenId(),
      internal: true,
      tokenLabel: 'Master token',
      tokenType: tokenType
    };
    const values = [];
    const sql = `INSERT INTO
        sso_token (token_id, application_id, group_id, "json")
      VALUES
        ($${values.push(tokenDetails.tokenId)}, $${values.push(
      tokenDetails.applicationId
    )},
         $${values.push(args.groupId)}, $${values.push(tokenDetails)})
      ON CONFLICT (token_id) DO
      UPDATE
      SET
        application_id = excluded.application_id,
        group_id = excluded.group_id,
        "json" = excluded."json"
      RETURNING token_id, application_id, group_id, "json";`;

    const res = await ssoWrite.map(sql, values, mapper.mapToken);
    return res[0];
  }

  async function createApiToken(args, context) {
    const { name: tokenLabel, rights } = args;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);
    if (!tokenLabel) {
      throw new Error('Input error: name is required');
    }
    try {
      const processedRights = (rights || []).map(
        (right) => util.swapPermissionEnumMap()[right]
      );
      const token = {
        json: {
          isRevoked: false,
          internal: false,
          tokenLabel,
          rights: processedRights
        }
      };
      let uri = config.services.coreAdminUri;
      if (!uri.endsWith('/')) uri += '/';
      const orgId =
        ((context._authInfo || {}).organization || {}).organizationId || '';
      if (orgId) {
        uri += `tokens`;
        const res = await util.httpCall(
          uri,
          context,
          { orgId, token },
          null,
          'POST'
        );
        const mappedRes = util.coreAdminTokensResponseMapper([res], true);
        return mappedRes[0];
      } else {
        throw new Error('Operation failed: no orgId found');
      }
    } catch (err) {
      let newErr;
      if (!isSuperAdmin && !isOrgAdmin) {
        newErr = _.get(err, 'data.serviceMessage');
      }

      return new Error(newErr || err || 'createApiToken failed');
    }
  }

  async function updateApiToken(args, context) {
    const {
      input: { rights, isRevoked },
      hash: tokenHash
    } = args;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);
    try {
      if (isRevoked === false) {
        throw new Error('Input error: a token cannot be unrevoked');
      }
      if (!tokenHash) {
        throw new Error(
          'Input error: token hash is required for update operation'
        );
      }
      const processedRights = (rights || []).map(
        (right) => util.swapPermissionEnumMap()[right]
      );
      const token = {
        tokenHash,
        json: {
          isRevoked,
          rights: processedRights
        }
      };
      let uri = config.services.coreAdminUri;
      if (!uri.endsWith('/')) uri += '/';
      uri += `tokens/${tokenHash}`;
      const res = await util.httpCall(uri, context, token, null, 'PUT');
      if (_.isNil(res)) {
        throw new Error(
          'Failed to update API token: Unable to get the API response'
        );
      }
      // For sure: set tokenHash if the object response does not include the hash
      if (_.isNil(res.tokenHash)) {
        res.tokenHash = tokenHash;
      }
      const mappedRes = util.coreAdminTokensResponseMapper([res], false);
      return mappedRes[0];
    } catch (err) {
      let newErr;
      if (!isSuperAdmin && !isOrgAdmin) {
        newErr = _.get(err, 'data.serviceMessage');
      }

      return new Error(newErr || err || 'apiTokenUpdate failed');
    }
  }

  async function getApiTokens(_args, context) {
    try {
      let uri = config.services.coreAdminUri;
      if (!uri.endsWith('/')) uri += '/';
      const orgId =
        ((context._authInfo || {}).organization || {}).organizationId || '';
      if (orgId) {
        uri += `organizations/${orgId}/tokens/all`;
      }
      const res = await util.httpCall(uri, context, null, null, 'GET');
      const mappedRes = util.coreAdminTokensResponseMapper(res);
      return mappedRes;
    } catch (err) {
      return new Error('apiTokens query failed');
    }
  }

  async function updateUserStatus(args, context) {
    const currentUser = _.get(context, 'requestContext.userInfo');
    const input = args.input;
    await _validateUserWriteAccess(context, input.id);
    await getUsers({ id: input.id }, context);
    const sql = `UPDATE sso_user
    SET status = $1,
      date_modified = $2,
      modified_by = $3
    WHERE user_id = $4
    RETURNING *
    `;
    const values = [
      input.status,
      new Date().toUTCString(),
      currentUser.userId,
      input.id
    ];
    const result = await ssoWrite.query(sql, values);
    return mapper.mapUser(result[0]);
  }

  // TODO: return organization objects?
  async function getOrganizationGuidsForUser(options, context, dbClient) {
    if (!options.id || !validator.isUUID(options.id)) {
      return [];
    }

    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].read;
    const userId = options.id;

    const sql =
      'SELECT application_id FROM sso_group g JOIN sso_user__sso_group ug ON g.group_id = ug.group_id WHERE ug.user_id = $1';
    return await client.map(sql, [userId], (row) => row.application_id);
  }

  function _getRolesForUserQuery(options, context) {
    if (
      options.organizationGuid &&
      !validator.isUUID(options.organizationGuid)
    ) {
      throw new Error('Invalid organization GUID.');
    }
    if (options.applicationId && !validator.isUUID(options.applicationId)) {
      throw new Error('Invalid applicationId.');
    }
    const applicationId = options.applicationId;
    const organizationGuid = options.organizationGuid;

    const sqlParams = [];
    const sqlWhere = [];

    sqlParams.push(options.id);
    sqlWhere.push(`ur.user_id = \$${sqlParams.length}`);

    let defaultOrgJoin;
    if (organizationGuid || applicationId) {
      defaultOrgJoin = '';
      if (organizationGuid) {
        sqlParams.push(organizationGuid);
        // prettier-ignore
        sqlWhere.push(`ur.application_id = \$${sqlParams.length}`);
      }
      if (applicationId) {
        sqlParams.push(applicationId);
        // prettier-ignore
        sqlWhere.push(`r.application_id = \$${sqlParams.length}`);
      }
    } else {
      defaultOrgJoin = `JOIN sso_user__sso_group ug ON ur.user_id = ug.user_id
        JOIN sso_group g ON ug.group_id = g.group_id`;
      sqlParams.push(options.id);
      sqlWhere.push(`ug.priority = min_priority(\$${sqlParams.length})`);
      sqlWhere.push(`ur.application_id = g.application_id`);
    }

    const sql = `SELECT r.role_id, r.role_name, r.role_description,
      a.application_key AS app_name, r.permissions, r.organization_id, r.is_private, r.is_app_event_role, r.application_id
      FROM role r
      JOIN sso_user_role ur ON r.role_id = ur.role_id
      LEFT JOIN application a ON r.application_id = a.application_id
      ${defaultOrgJoin}
			WHERE ${sqlWhere.join(' AND ')}`;

    return { sql, sqlParams };
  }

  async function getRolesForUser(options, context) {
    if (!options.id || !validator.isUUID(options.id)) {
      return [];
    }

    // Get sql query
    const { sql, sqlParams } = _getRolesForUserQuery(options, context);

    const rows = await serviceContext.dbConnections['sso'].read
      .map(sql, sqlParams, row => mapper.mapRole(row))
      .then(function (rows) {
        return rows;
      });

    return util.validateRoles(context, rows);
  }

  async function getRole(id) {
    if (!id || !validator.isUUID(id)) {
      throw new Error('invalid roleId');
    }

    const sqlParams = [];
    const sqlWhere = [];

    sqlParams.push(id);
    sqlWhere.push(`r.role_id = \$${sqlParams.length}`);

    const sql = `SELECT r.role_id, r.role_name, r.role_description,
      a.application_key AS app_name, r.permissions, r.organization_id, r.is_private, r.is_app_event_role
      FROM role r
      LEFT JOIN application a ON r.application_id = a.application_id
			WHERE ${sqlWhere.join(' AND ')} LIMIT 1;`;

    const data = await serviceContext.dbConnections['sso'].read.map(
      sql,
      sqlParams,
      mapper.mapRole
    );

    if (!data || !data.length || data.length == 0) {
      throw new errors.NotFound({
        message: 'Role not found',
        data: {
          objectId: id,
          objectType: 'Role'
        }
      });
    }
    return data[0];
  }

  function getUsersByEmail(options, context) {
    if (!options.email) {
      throw new Error('email parameter is required');
    }
    const sqlWhere = [];
    const sqlParams = [];

    sqlParams.push(_.toLower(options.email));
    sqlWhere.push(
      `(lower(user_name) = $${sqlParams.length} OR lower(email) = $${sqlParams.length})`
    );

    if (options.userId) {
      sqlParams.push(options.userId);
      sqlWhere.push(`user_id = $${sqlParams.length}`);
    }

    let sql = `
      SELECT user_id, user_name, email, status
      FROM sso_user
    `;

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    sql += 'ORDER BY date_created ASC;';

    return serviceContext.dbConnections['sso'].read.map(
      sql,
      sqlParams,
      mapper.camelizeRootKeys
    );
  }

  async function getUserBasicInfo(options, context) {
    if (!options.userId) {
      throw new Error('userId parameter is required');
    }

    const users = await getUsersWithBasicInfo(
      { userIds: [options.userId] },
      context
    );

    if (!(users && users.length)) {
      throw new errors.NotFound({
        data: { objectId: options.id, objectType: 'User' }
      });
    }
    users[0].email = _.get(users[0], 'userName');

    return users[0];
  }

  async function getUsersWithBasicInfo(options, context) {
    if (!options.userIds || !_.isArray(options.userIds)) {
      throw new Error('userIds parameter is invalid');
    }

    const sqlGetUsers = `
      SELECT user_id,
        kvp->>'firstName' AS first_name,
        kvp->>'lastName' AS last_name,
        kvp->>'image' AS image_url,
        user_name,
        email
      FROM sso_user
      WHERE user_id = ANY($1::uuid[])
    `;

    return serviceContext.dbConnections['sso'].read.map(
      sqlGetUsers,
      [options.userIds],
      mapper.mapUser
    );
  }

  function getUser(options, context) {
    if (!options.id) {
      throw new Error('id parameter is required');
    }
    // filter out multi-orgs to the currently logged one
    if (options.organizationIds && options.organizationIds.length > 1) {
      options.organizationIds = [options.organizationId];
    }
    return getUsers(options, context).then(function (users) {
      if (!(users.records && users.records.length)) {
        throw new errors.NotFound({
          data: { objectId: options.id, objectType: 'User' }
        });
      }
      return users.records[0];
    });
  }

  function getUsers(options, context) {
    let sql = `
SELECT
DISTINCT ON (u.user_name)
  u.user_id,
  u.user_name,
  u.kvp,
  u.date_created AS created_date_time,
  u.date_modified AS modified_date_time,
  u.modified_by,
  ug.last_logged_in AS last_login_date_time,
  u.password_reset_token,
  u.password_change_required,
  u.activation_token,
  u.status,
  u.email,
  u."system_user",
  COUNT(*) OVER () AS total,
  u.date_password_last_updated AS password_updated_date_time,
  g.application_id as organization_guid,
  g.kvp->>'organizationId' as organization_id,
  g.kvp->>'organizationName' as organization_name
  FROM sso_user u`;
    let sqlWhere = [];
    let sqlParams = [];

    // for backwards compatibility with a few places in the code that
    // call getUsers() without context param.
    // default to cautious (not superadmin) behavior.
    // TODO clean up those places.
    let isSuperAdmin = false;
    if (context) isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    if (options.id) {
      // if user ID param isn't a UUID, postgres chokes
      // with a weird error. so just return an empty
      // set now, since that is the correct behavior.
      if (!validator.isUUID(options.id)) {
        throw new errors.NotFound({
          message: 'A user ID must be a valid UUID.',
          data: {
            objectId: options.id,
            objectType: 'User'
          }
        });
      }
      sqlParams.push(options.id);
      sqlWhere.push(`u.user_id = \$${sqlParams.length}`);
    }

    if (options.ids) {
      if (
        (_.isString(options.ids) && options.ids.length) ||
        (Array.isArray(options.ids) && options.ids.length)
      ) {
        mainUtil.addSqlWhere('u.user_id', options.ids, sqlWhere, sqlParams);
      }
    }

    if (options.name) {
      //check username, first name, last name
      sqlWhere.push(`(
    u.user_name ILIKE \$${sqlParams.length + 1}
    OR u.kvp->>'firstName' ILIKE \$${sqlParams.length + 2}
    OR u.kvp->>'lastName' ILIKE \$${sqlParams.length + 3}
  )`);

      options.name = `%${mainUtil.sqlEscapeForLIKE(options.name)}%`;
      sqlParams.push(options.name);
      sqlParams.push(options.name);
      sqlParams.push(options.name);
    }

    if (options.status) {
      sqlParams.push(options.status);
      sqlWhere.push(`u.status = \$${sqlParams.length}`);
    }

    if (options.statuses && !_.isEmpty(options.statuses) && !options.status) {
      sqlParams.push(options.statuses);
      sqlWhere.push(`u.status = ANY (\$${sqlParams.length}::user_status[])`);
    }

    //organization join, acl vs group data is inconsistent
    if (
      (_.isString(options.organizationIds) && options.organizationIds.length) ||
      (Array.isArray(options.organizationIds) && options.organizationIds.length)
    ) {
      let trimmedIds;
      if (Array.isArray(options.organizationIds)) {
        trimmedIds = options.organizationIds;
      } else {
        trimmedIds = util.splitTrim(options.organizationIds, ',');
      }

      if (trimmedIds.length) {
        const inClause = [];
        trimmedIds.forEach(function setOrgIdInClause(orgId) {
          //coerce to string
          sqlParams.push(orgId.toString());
          inClause.push(`\$${sqlParams.length}`);
        });

        sql += ` JOIN sso_user__sso_group ug ON u.user_id = ug.user_id
    JOIN sso_group g ON ug.group_id = g.group_id`;
        if (!(options.includeAllOrgUsers && isSuperAdmin)) {
          sqlWhere.push(`g.kvp->>'organizationId' IN (${inClause.join(',')})`);
        }
      }
    } else {
      sql += ` LEFT JOIN sso_user__sso_group ug ON ug.user_id = u.user_id
  LEFT JOIN sso_group g ON g.group_id = ug.group_id
  AND (g.kvp->>'groupType' = 'organization' OR g.group_id IS NULL)`;
    }
    const roleIds = options.roleIds;
    if (Array.isArray(roleIds) && roleIds.length) {
      sqlParams.push(roleIds);
      sql += ` JOIN sso_user_role ur ON ur.user_id = u.user_id `;
      sqlWhere.push(`ur.role_id = ANY(\$${sqlParams.length}::uuid[])`);
    }

    if (options.status) {
      sqlParams.push(options.status);
      sqlWhere.push(`u.status = \$${sqlParams.length}`);
    }

    // if options.ignoreSystemUsers is present - use it; otherwise suppress system users when App Event Feature is disabled
    const ignoreSystemUsers = _.isNil(options.ignoreSystemUsers)
      ? !enableAppEventFeature
      : options.ignoreSystemUsers;
    if (ignoreSystemUsers && !options.id) {
      sqlWhere.push(`
			u."system_user" IS NOT TRUE
			`);
    }

    if (_.get(options, 'dateTimeFilter.length', 0)) {
      mainUtil.addDateTimeFilters('u', options, sqlWhere, 'pg_ts', 1, {
        lastLoginDateTime: 'last_logged_in',
        createdDateTime: 'date_created'
      });
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    // add org/group order so that combined with distinct selects the default organization
    sql += ' ORDER BY u.user_name ASC, ug.priority ASC';
    if (Number.isInteger(options.limit)) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (Number.isInteger(options.offset)) {
      sql += ` OFFSET ${options.offset}`;
    }

    return serviceContext.dbConnections['sso'].read
      .map(sql, sqlParams, function (row) {
        return mapper.mapUser(row);
      })
      .then(function (rows) {
        return {
          records: rows,
          limit: options.limit,
          offset: options.offset,
          count: rows.length
        };
      });
  }

  function getUserMfaInfo(options) {
    const userId = options.id;
    const sql = `
			SELECT
        u.mfa_phone_number as phone_number,
        u.mfa_verified_date as sms_voice_verified_date_time,
        u.mfa_ga_verified_date as ga_verified_date_time,
        u.mfa_default_option as default_option,
        u.mfa_pending_registration as pending_registration
      FROM
				sso_user u
			WHERE
				u.user_id = $1`;

    return serviceContext.dbConnections['sso'].read
      .map(sql, [userId], function (row) {
        return mapper.camelizeRootKeys(row);
      })
      .then(function (rows) {
        return rows[0];
      });
  }

  function getGroups(options) {
    var sql = `SELECT group_id, group_name, application_id, kvp, date_created,
        date_modified, modified_by,
  			permissions
  			FROM sso_group`;
    var sqlWhere = [];
    var sqlParams = [];

    mainUtil.checkId(options.groupId, true, true);
    mainUtil.checkId(options.applicationId, true, true);
    mainUtil.addSqlWhere('group_id', options.groupId, sqlWhere, sqlParams);
    mainUtil.addSqlWhere(
      'application_id',
      options.applicationId,
      sqlWhere,
      sqlParams
    );

    if (options.ids) {
      if (
        (_.isString(options.ids) && options.ids.length) ||
        (Array.isArray(options.ids) && options.ids.length)
      ) {
        mainUtil.addSqlWhere('group_id', options.ids, sqlWhere, sqlParams);
      }
    }

    if (_.isString(options.groupName) && options.groupName.length) {
      sqlParams.push(
        options.groupName.endsWith('%')
          ? options.groupName
          : options.groupName + '%'
      );
      sqlWhere.push('group_name ILIKE $' + sqlParams.length);
    }

    if (_.isString(options.groupType) && options.groupType.length) {
      sqlParams.push(options.groupType);
      sqlWhere.push("kvp->>'groupType' = $" + sqlParams.length);
    }

    if (
      (_.isString(options.organizationIds) && options.organizationIds.length) ||
      (Array.isArray(options.organizationIds) && options.organizationIds.length)
    ) {
      let trimmedIds;
      if (Array.isArray(options.organizationIds)) {
        trimmedIds = options.organizationIds;
      } else {
        trimmedIds = util.splitTrim(options.organizationIds, ',');
      }

      if (trimmedIds.length) {
        const inClause = [];
        trimmedIds.forEach(function setOrgIdInClause(orgId) {
          //coerce to string
          sqlParams.push(orgId.toString());
          inClause.push(`\$${sqlParams.length}`);
        });
        sqlWhere.push(`kvp->>'organizationId' IN (${inClause.join(',')})`);
      }
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    if (Number.isInteger(options.limit)) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (Number.isInteger(options.offset)) {
      sql += ` OFFSET ${options.offset}`;
    }

    return serviceContext.dbConnections['sso'].read
      .map(sql, sqlParams, function (row) {
        return mapper.mapGroup(row);
      })
      .then(function (rows) {
        return {
          records: rows,
          limit: options.limit,
          offset: options.offset,
          count: rows.length
        };
      });
  }

  async function _loadCheckAccessUserSetting(context, input) {
    const { userId: inputUserId, application: applicationId } = input;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const clientInfo = resUtil.getClientInfo(context);

    // Only allow userToken and orgApiToken
    resUtil.requireTokenType(context, ['user', 'apikey']);

    // Not allow to access user setting of other users (in case current is regular user)
    if (
      !isSuperAdmin &&
      clientInfo.type !== 'apikey' &&
      inputUserId &&
      inputUserId != clientInfo.id
    ) {
      throw new errors.NotAllowed({
        message: 'Not allow to access user setting of other users',
        data: { userId: inputUserId }
      });
    }

    // Require userId when using apiOrgToken
    if (clientInfo.type === 'apikey' && !inputUserId) {
      throw new errors.InvalidInput({
        message: 'userId is required when using apiToken',
        data: {
          tokenType: clientInfo.type,
          userId: inputUserId
        }
      });
    }

    // Set user setting for current user if userId is not passed
    const userId = inputUserId || clientInfo.id;

    // Verify user is exists
    await getUser({ id: userId, organizationIds: [clientInfo.org] }, context);
    // Verify that user has access to application
    // When this function is invoked from https://github.com/veritone/aiware-core/blob/844d99951a2de337c823c4fa0453bb49e1bd7e63/services/api/core-graphql-server/resolvers/User.js#L66,
    // application/applicationId is not part of input.
    if (applicationId) {
      await serviceContext.dal.application.getApplication({
        id: applicationId,
        organizationId: clientInfo.org,
        all: true,
        isSuperAdmin
      });
    }

    return userId;
  }

  async function setUserSetting(context, args) {
    const { application: applicationId, key, value, reset } = args.input;

    if (!value) {
      throw new errors.InvalidInput({
        message: 'Value is required when update user setting.',
        data: {
          value,
          reset
        }
      });
    }

    const userId = await _loadCheckAccessUserSetting(context, args.input);
    // Check user setting is exists
    const userSettings = await _getUserSettingDb({
      userId,
      applicationId,
      key
    });
    let userSetting;

    // if exists, update the user setting
    if (userSettings.length) {
      userSetting = await _updateUserSettingDb({
        userId,
        key,
        value,
        applicationId
      });
    } else {
      userSetting = await _insertUserSettingDb({
        userId,
        key,
        value,
        applicationId
      });
    }

    return userSetting;
  }

  function _insertUserSettingDb(options, dbClient) {
    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].write;
    const { userId, key, value, applicationId } = options;
    const columnData = {
      user_id: userId,
      key: key,
      value: value,
      application_id: applicationId
    };
    const { sql, values } = mainUtil.makeInsertSql(
      'public.user_setting',
      columnData,
      userSettingReturning
    );

    return client.one(sql, values, mapper.camelizeRootKeys);
  }

  function addUserCustomProfile(options, dbClient) {
    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].write;
    const { userId, organizationGuid, userDetails } = options;
    const columnData = {
      user_id: userId,
      organization_guid: organizationGuid,
      custom_profile: userDetails
    };
    const { sql, values } = mainUtil.makeInsertSql(
      'public.user_custom_profile',
      columnData,
      userCustomProfileReturning
    );

    return client.one(sql, values, mapper.camelizeRootKeys);
  }

  function _updateUserSettingDb(options, dbClient) {
    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].write;
    const { userId, key, value, applicationId } = options;
    const whereConditions = [];
    const values = [value];

    if (applicationId) {
      values.push(applicationId);
      whereConditions.push(`application_id = \$${values.length}`);
    }

    values.push(userId);
    whereConditions.push(`user_id = \$${values.length}`);
    values.push(key);
    whereConditions.push(`key = \$${values.length}`);

    const sql = `
      UPDATE public.user_setting
      SET value = $1
      WHERE ${whereConditions.join(' AND ')}
      RETURNING user_id,
                key,
                value,
                application_id;
    `;

    return client.one(sql, values, mapper.camelizeRootKeys);
  }

  function _getUserSettingDb(options, dbClient) {
    // Reads default to the read replica. Callers running inside a write transaction must pass the
    // transaction handle instead, or they will not see their own uncommitted rows.
    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].read;
    const whereAnd = [];
    const values = [];

    mainUtil.addSqlWhere('us.user_id', options.userId, whereAnd, values);
    mainUtil.addSqlWhere(
      'us.application_id',
      options.applicationId,
      whereAnd,
      values
    );
    mainUtil.addSqlWhere('us.key', options.key, whereAnd, values);
    mainUtil.addSqlWhere('us.key', options.keys, whereAnd, values);

    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';
    const sql = `
      SELECT
        ${userSettingSelect}
      FROM
        public.user_setting us
      ${whereClause};
    `;
    return client.map(sql, values, mapper.camelizeRootKeys);
  }

  /**
   * Inserts or updates a single user setting, without the access check `setUserSetting` performs.
   *
   * For internal writes against a user the caller already owns — an organization invite's own
   * `user_id`, for example — where there is no requesting principal to authorize against. Callers
   * must not pass a user id derived from untrusted input.
   *
   * Pass `dbClient` to join a caller's transaction. When it is omitted the write pool serves the
   * existence check as well as the write, so the check never reads a lagging replica.
   *
   * @param {Object} options
   * @param {string} options.userId
   * @param {string} options.key
   * @param {string} options.value
   * @param {string} [options.applicationId]
   * @param {Object} [dbClient] - pg-promise transaction or connection; defaults to the sso write pool
   */
  async function upsertUserSetting(options, dbClient) {
    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].write;
    const { userId, key, value, applicationId } = options;

    if (!userId || !key) {
      throw new errors.InvalidInput({
        message: 'userId and key are required when setting a user setting'
      });
    }
    if (!value) {
      throw new errors.InvalidInput({
        message: 'Value is required when update user setting.',
        data: { value }
      });
    }

    const existingSettings = await _getUserSettingDb(
      { userId, applicationId, key },
      client
    );

    if (existingSettings.length) {
      return _updateUserSettingDb({ userId, key, value, applicationId }, client);
    }

    return _insertUserSettingDb({ userId, key, value, applicationId }, client);
  }

  async function removeUserSettings(context, args) {
    const { application: applicationId, key } = args.input;
    const userId = await _loadCheckAccessUserSetting(context, args.input);
    const whereAnd = [];
    const values = [];

    mainUtil.addSqlWhere('user_id', userId, whereAnd, values);
    mainUtil.addSqlWhere('key', key, whereAnd, values);
    mainUtil.addSqlWhere('application_id', applicationId, whereAnd, values);

    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';
    const sql = `
      DELETE FROM	public.user_setting
      ${whereClause}
      RETURNING user_id, "key", application_id, value
    `;
    const res = await serviceContext.dbConnections['sso'].write.oneOrNone(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    if (!res) {
      throw new errors.NotFound({
        message: 'user setting not found!',
        data: { userId, applicationId, key }
      });
    }

    return res;
  }

  function createOpenIdProvider(context, args) {
    const input = args.input;
    let uri = config.services.coreAdminUri;

    if (!uri.endsWith('/')) {
      uri += '/';
    }

    uri += 'openid';

    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    if (!isSuperAdmin && input.isGlobal === true) {
      throw new errors.NotAllowed({
        message: 'Only superadmin can create Global OpenID Provider'
      });
    }

    const payload = _.assign({}, input);
    return util.httpCall(
      uri,
      context,
      payload,
      (res) => {
        return serviceContext.dal.openidConnect.getOpenIdConnect(context, {
          id: res.connectId,
          organizationId: args.organizationId
        });
      },
      'POST'
    );
  }

  async function toggleOpenIdProviderForOrg(context, args) {
    const connectId = _.get(args, 'input.connectId');
    const organizationGuid = _.get(args, 'input.organizationGuid');
    const toggle = _.get(args, 'toggle');
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const requestorOrgGuid = _.get(
      context,
      '_authInfo.organization.organizationGuid',
      _.first(_.get(context, '_authInfo.applications'))
    );
    const isAllowOrgUpdate = fpl.util.hasAccessTo(
      fpl.permissions.admin.org.update,
      context._authInfo.permissionMasks
    );
    let uri = _.get(config, 'services.coreAdminUri');

    if (_.isNil(connectId)) {
      throw new errors.InvalidInput({ message: 'connectId is required.' });
    }

    if (_.isNil(organizationGuid)) {
      throw new errors.InvalidInput({
        message: 'organizationGuid is required.'
      });
    }

    if (_.isNil(toggle)) {
      throw new errors.InternalServerError();
    }

    if (!isAllowOrgUpdate) {
      throw new errors.NotAllowed({
        message: 'User is not allow to update organization'
      });
    }

    if (!isSuperAdmin && requestorOrgGuid !== organizationGuid) {
      throw new errors.NotAllowed({
        message:
          'User is not allow enable/disable OpenId Provider for other organization',
        data: { requestorOrgGuid, organizationGuid }
      });
    }

    if (!uri.endsWith('/')) {
      uri += '/';
    }

    uri +=
      'openid/' +
      connectId +
      '/organization/' +
      organizationGuid +
      '/' +
      toggle;

    const coreAdminRes = await util.httpCall(uri, context, null, null, 'POST');

    return { id: connectId, message: coreAdminRes };
  }

  async function deleteOpenIdProvider(context, args) {
    const connectId = _.get(args, 'id');

    if (_.isNil(connectId)) {
      throw new errors.InvalidInput({ message: 'connectId is required.' });
    }

    // Verify current user has permission with the OpenID Provider
    await serviceContext.dal.openidConnect.getOpenIdConnect(context, {
      id: connectId
    });

    let uri = config.services.coreAdminUri;

    if (!uri.endsWith('/')) {
      uri += '/';
    }

    uri += 'openid/' + connectId + '/delete';

    const coreAdminRes = await util.httpCall(uri, context, null, null, 'POST');

    return { id: connectId, message: coreAdminRes };
  }

  function _beforeSaveKVP(kvp, input) {
    if (input.firstName) kvp.firstName = util.sanitizeField(input.firstName);
    if (input.lastName) kvp.lastName = util.sanitizeField(input.lastName);
    if (input.imageUrl) {
      const imageUrl = util.sanitizeField(input.imageUrl);
      kvp.image = resUtil.isRealSignedUrl(imageUrl)
        ? resUtil.stripSignatureSignedUrl(imageUrl)
        : imageUrl;
    }
    if (input.title) kvp.title = util.sanitizeField(input.title);
    if (input.developerType)
      kvp.developerType = util.sanitizeField(input.developerType);
  }

  async function _validateUserWriteAccess(context, userId) {
    const requesterOrgId = _.get(
      context,
      '_authInfo.organization.organizationId'
    );
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);

    if (!isSuperAdmin && !isOrgAdmin) {
      throw new errors.NotAllowed({
        message: 'Only superadmin or organization admin can update a user.'
      });
    }

    if (isSuperAdmin) {
      return;
    }

    const orgs = await serviceContext.dal.organization.getOrganizationIdAndGuidForUser(
      userId
    );
    const defaultOrg = _.find(orgs, (org) => org.priority === 0);

    if (requesterOrgId !== _.get(defaultOrg, 'id')) {
      throw new errors.NotAllowed({
        message:
          'Organization admin cannot update a user from another organization.'
      });
    }
  }

  return {
    getPasswordToken,
    updateOrganization: updateOrganization,
    createUser: createUser,
    deleteUser: deleteUser,
    updateUser: updateUser,
    updateUserRoles,
    getAuthGroupsForUser,
    addUserToOrganization: addUserToOrganization,
    addUserCustomProfile: addUserCustomProfile,
    removeUserFromOrganization: removeUserFromOrganization,
    switchUserToOrganization: switchUserToOrganization,
    getOrganizationGuidsForUser: getOrganizationGuidsForUser,
    createPasswordUpdateRequest: createPasswordUpdateRequest,
    createPasswordResetRequest,
    changePassword,
    login: login,
    logout: logout,
    validateToken: validateToken,
    refreshToken: refreshToken,
    extendToken: extendToken,
    getAllOrgTokens: getAllOrgTokens,
    getMfaInfo: getMfaInfo,
    getUserSettings,
    updateCurrentUser,
    createOrganization,
    createInternalApiToken,
    updateUserStatus,
    getRolesForUser,
    _getRolesForUserQuery, // export for testing
    getUsersByEmail,
    getUserBasicInfo,
    getUsersWithBasicInfo,
    getUser,
    getUsers,
    getUserMfaInfo,
    getGroups,
    setUserSetting,
    upsertUserSetting,
    removeUserSettings,
    createOpenIdProvider,
    toggleOpenIdProviderForOrg,
    deleteOpenIdProvider,
    allowedToUpdateOrganization,
    // For unit-tests only
    _loadCheckAccessUserSetting,
    _validateUserWriteAccess,
    getRole,
    getApiTokens,
    createApiToken,
    updateApiToken
  };
};
