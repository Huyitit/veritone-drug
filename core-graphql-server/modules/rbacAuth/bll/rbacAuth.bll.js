const uuid = require('uuid');
const _ = require('lodash');
const dalAuthGroupModule = require('../dal/authGroup.dal.js');
const dalAuthPermissionSetModule = require('../dal/authPermissionSet.dal.js');
const dalACEModule = require('../dal/authACE.dal.js');
const validator = require('validator');
const funcPerms = require('@veritone/functional-permissions-lib');
module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../../../util.js')(serviceContext);
  const messageUtil = serviceContext.messageUtil;
  const constants = require('../../../util/appConstants.js')(serviceContext);
  const resUtil = require('../../../resolvers/util.js')(serviceContext);
  const errors = require('../../../error')(serviceContext.config);
  const fpUtil = require('../dal/functionalPermissionsUtil.dal')(
    serviceContext
  );
  const dalUtil = require('../../../dal/util.js')(
    serviceContext.config,
    serviceContext
  );
  const auditHelpers = require('./auditHelpers.js')(serviceContext);
  const {
    emitAuthGroupEvent, emitAuthPermissionSetEvent,
    emitACEGrantEvent, emitACERevokeEvent,
    emitDefaultACEPolicyUpdateEvent, emitACEQueryEvent,
    emitAuthorizationDeniedEvent
  } = auditHelpers;

  const { parsePaginationArgs } = require('../../../util/paginationParser')(
    serviceContext
  );

  const authGroupDal =
    serviceContext.dal.authGroup || dalAuthGroupModule(serviceContext);
  const authPermissionDal =
    serviceContext.dal.authPermissionDal ||
    dalAuthPermissionSetModule(serviceContext);
  const authACEDal = serviceContext.dal.authAce || dalACEModule(serviceContext);
  const dalFolder = serviceContext.dal.folder;
  const redisCache = serviceContext.redisCache;

  const SUPER_ADMIN_ROLE_ID = '3459c3de-493f-443a-8ad0-ddb9f3f6c76d';
  const ORGANIZATION_PERMISSIONS_MASK_KEY = 'rbac_organization_permissions';

  function _buildMarkedKey(prefix, orgId) {
    return `${prefix}:${orgId}`;
  }

  // #region AuthGroup
  async function getAuthGroup(context, args) {
    if (args.id) {
      args.ids = [args.id];
    } else if (!args.groupName || !args.groupName.trim()) {
      throw new errors.NotFound({
        message: "At least one of 'id' or 'groupName' is required",
        data: {
          organizationGuid: context._authInfo.applicationId
        }
      });
    }
    args.limit = 1;

    const groups = await getAuthGroups(context, args);
    const g = _.get(groups, 'records[0]', null);
    if (!g) {
      throw new errors.NotFound({
        message: 'Authorization group not found',
        data: {
          id: args.id,
          organizationGuid: context._authInfo.applicationId
        }
      });
    }
    return g;
  }

  function getOrgGuid(context) {
    return (
      _.get(context, '_authInfo.applicationId') ||
      _.get(context, '_authInfo.organization.guid')
    );
  }

  async function getAuthGroups(context, args) {
    const isInternalToken = resUtil.getTokenType(context) === 'internal';
    const allowItselfToUpdate = args.allowItselfToUpdate;
    if (
      (resUtil.isSuperAdmin(context._authInfo) ||
        isInternalToken ||
        allowItselfToUpdate) &&
      args.ownerOrganization
    ) {
      // a super-admin or an internal token can get authorization groups for an arbitrary org
      // in such case orgGuid can be undefined
      let ownerOrgField = args.ownerOrganization;
      if (
        ownerOrgField &&
        (!_.isString(ownerOrgField) || !validator.isUUID(ownerOrgField))
      ) {
        ownerOrgField = await serviceContext.dal.application.getAppIdFromOrgId(
          ownerOrgField
        );
      }
      args.orgGuid = ownerOrgField;
    } else {
      args.orgGuid = getOrgGuid(context);
      // non-super-admin may get authorization groups only for their org
      if (
        _.isNil(args.orgGuid) ||
        (!_.isNil(args.ownerOrganization) &&
          args.orgGuid !== args.ownerOrganization)
      ) {
        throw new errors.AuthorizationError({
          message:
            'Access to field ownerOrganization requires superadmin rights'
        });
      }
    }
    return authGroupDal.getAuthGroups(args);
  }

  function setOrgGuid(context, opt) {
    if (opt.ownerOrganization) {
      const isInternalToken = resUtil.getTokenType(context) === 'internal';
      // If not superadmin or internal token, restrict access to only groups in the caller's org
      if (!resUtil.isSuperAdmin(context._authInfo) && !isInternalToken) {
        const currentOrgGuid = getOrgGuid(context);
        if (currentOrgGuid !== opt.ownerOrganization) {
          throw new errors.AuthorizationError({
            message:
              'Access to field ownerOrganization requires superadmin rights'
          });
        }
      }
      opt.orgGuid = opt.ownerOrganization;
    } else {
      opt.orgGuid = getOrgGuid(context);
    }
  }

  async function createAuthGroup(context, args) {
    // ownerOrganization field requires superadmin which is enforced by the schema
    const opt = args.input;

    try {
      opt.id = uuid.v4();
      setOrgGuid(context, opt);
      opt.userId = context._authInfo.userId || opt.orgGuid;
      const result = await authGroupDal.createAuthGroup(opt);
      const members = _.get(args, 'input.members', []);

      await _invalidateAnyAuthGroupRelatedCaches({
        members,
        organizationGuid: opt.orgGuid,
        ignoreACEHasPermissionMarkDirty: true,
        ignoreACLForResourcesMarkDirty: true
      });

      reloadSessionAuthGroupsForMembers(result.organizationId, members);

      emitAuthGroupEvent(
        context,
        {
          ...opt,
          ...result,
          id: result.id || opt.id
        },
        null,
        'create'
      );

      if (result.isAddMemberFailed) {
        emitAuthGroupEvent(
          context,
          {
            id: result.id,
            audit: {
              users: _.get(opt, 'audit.users', members)
            }
          },
          new Error(`Cannot add member to not existing auth group`),
          'addMember'
        );
      } else if (_.get(members, 'length', 0)) {
        emitAuthGroupEvent(
          context,
          {
            id: result.id,
            audit: {
              users: _.get(opt, 'audit.users', members)
            }
          },
          null,
          'addMember'
        );
      }

      return result;
    } catch (err) {
      emitAuthGroupEvent(context, opt, err, 'create');
      throw err;
    }
  }

  async function grantDefaultACEsToSchema(context, org) {
    // check if RBAC is enabled for the resource type
    const useRBACFeatureForSDO = await useRBACFeatureForResourceType(
      context,
      org,
      'SDOSchema'
    );

    if (useRBACFeatureForSDO && org?.id) {
      try {
        // Get all accessible schemas
        let offset = 0;
        let schemaIds = [];
        let schemas = [];
        do {
          const result = await serviceContext.dal.structuredData.getSchemas(
            context,
            {
              limit: 100,
              offset,
              accessScope: ['any']
            }
          );
          schemas = _.get(result, 'records', []);
          for (const s of schemas) {
            schemaIds.push(s.id);
          }
          offset += schemas.length;
        } while (offset < 10000 && schemas.length === 100);

        // Add default ACEs to the accessible schemas
        await addDefaultACEsToResources(context, {
          objectIds: schemaIds,
          organizationId: org.id,
          resourceType: 'SDOSchema',
          skipRBACEnabledCheck: true
        });
      } catch (err) {
        serviceContext.logger.error(err);
      }
    }
  }

  // Currently only creating default groups, permission sets and
  // applying aces to organization. As such this should be used only
  // during organization creation. Migrating existing non OLP orgs will be
  // eventually also done here
  async function authEnforcementEnable(context, args) {
    const restrictionResult = await restrictContextOrganization(
      context,
      _.pick(args.input, ['ownerOrganization'])
    );

    const orgGuid = restrictionResult.organizationGuid;
    const orgId = restrictionResult.organizationId;
    const org = await serviceContext.dal.organization.getOrganization(
      context,
      {
        id: orgId,
      },
      true // skip cache
    );

    // Create auth groups
    const {
      defaultAuthGroups,
      existingGroups,
      hasNewGroups,
    } = await _createDefaultAuthGroups(context, org, orgGuid);

    if (defaultAuthGroups.length === 0) {
      await grantDefaultACEsToSchema(context, org);
      await grantDefaultACEsToUserRootFolders(context, org);
      return existingGroups;
    }
    // Create Permission Sets
    const defaultPermissionSets = await _createDefaultPermissionSets(
      context,
      orgId,
      orgGuid
    );

    const groupsMap = new Map(
      defaultAuthGroups.map((g) => [g.defaultGroup || g.name, g])
    );
    const permSetMap = new Map(defaultPermissionSets.map((p) => [p.name, p]));

    const defaultPolicies = _.get(
      context.config,
      'rbac.defaultPolicies.policies',
      []
    );
    const ctx = {
      orgId,
      orgGuid,
    };

    // Group the policies by scope to optimize the insert operations
    const policiesPerScope = new Map();
    for (const policy of defaultPolicies) {
      const g = groupsMap.get(policy.authGroupName);
      const ps = permSetMap.get(policy.permissionSetName);
      if (g && ps) {
        let pps = policiesPerScope.get(policy.scope) || [];
        pps.push({
          group: g,
          permissionSet: ps,
        });
        policiesPerScope.set(policy.scope, pps);
      }
    }

    // Create ACEs according to the config policy
    // Skip adding ACEs if all groups already existed (they already have ACEs)
    const skipAddingACEs = !hasNewGroups;
    try {
      await Promise.all(
        Array.from(policiesPerScope.entries()).map(([scope, aces]) =>
          _applyPermissionPolicy(context, aces, scope, ctx, { skipAddingACEs })
        )
      );

      _.set(
        org,
        'kvp.defaultAuthGroups',
        defaultAuthGroups.concat(existingGroups)
      );
      await serviceContext.dal.organization.updateOrganizationKvp(
        org.id,
        org.kvp,
        context
      );
    } catch (err) {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError({
        message: 'Error creating default auth policies'
      });
    }
    await grantDefaultACEsToSchema(context, org);
    await grantDefaultACEsToUserRootFolders(context, org);
    return defaultAuthGroups;
  }

  async function checkAndCreateAuthGroupsForAppRoles(
    context,
    org,
    orgGuid,
    applicationId
  ) {
    const result = {
      success: true,
      error: undefined,
      authGroups: [],
      permissionSet: [],
      existingGroups: [],
      roleIds: []
    };
    if (!context) {
      result.success = false;
      result.error = `missing context`;
      return result;
    }
    if (!org) {
      result.success = false;
      result.error = `missing organization`;
      return result;
    }
    if (!orgGuid) {
      result.success = false;
      result.error = `missing orgGuid`;
      return result;
    }

    const args = { organizationId: org.id, all: true };
    // Get applications by org_id
    const applications = await serviceContext.dal.application.getApplications(
      args
    );
    let applicationIds = _.map(applications.records, 'applicationId');
    if (applicationIds.length === 0) {
      return result;
    }

    // check for special application
    if (applicationId) {
      const checkAppId = applicationIds.filter((id) => id === applicationId);
      if (checkAppId.length === 0) {
        result.success = false;
        result.error = `The organization does not have access to the application id ${applicationId}`;
        return result;
      }

      // Working only on the special application
      applicationIds = checkAppId;
    }

    // Get roles by application Ids
    const roles = await serviceContext.dal.role.getRoles(context, {
      includeAppInfo: true,
      applicationId: applicationIds
    });
    const roleIds = _.map(roles.records, 'id');
    if (roleIds.length === 0) {
      return result;
    }
    result.roleIds = roleIds;

    // Get authGroups by roleIds
    const authGroupsByRoleIds = await authGroupDal.getAuthGroups({
      orgGuid,
      appRoleID: roleIds,
      skipCache: true // should skip cache for this process
    });

    // Get roles need to be created authGroups
    const rolesToCreateAuthGroup = roles.records.filter((r) => {
      const gr = authGroupsByRoleIds.records.filter((g) => g.roleId === r.id);
      if (gr.length > 0) {
        result.existingGroups.push(...gr);
      }
      return gr.length === 0;
    });

    if (rolesToCreateAuthGroup.length === 0) {
      return result;
    }

    // Create authGroups by roles
    try {
      const authGroups = await _createAuthGroupsForAppRoles(
        context,
        args.organizationId,
        orgGuid,
        rolesToCreateAuthGroup
      );
      result.authGroups = authGroups.authGroups;
      result.permissionSet = authGroups.permissionSet;
    } catch (ex) {
      result.success = false;
      result.error = ex;
    }

    return result;
  }

  async function _createAuthGroupsForAppRoles(
    context,
    organizationId,
    orgGuid,
    roles
  ) {
    const result = {
      authGroups: [],
      permissionSet: []
    };
    if (!orgGuid) {
      throw new Error(`missing orgGuid`);
    }
    if (!_.isArray(roles)) {
      throw new Error(`roles must be an array of roles`);
    }
    const requestorId = _.get(context, '_authInfo.userId');

    for (const role of roles) {
      const groupName = `${role.appName} - ${role.roleName}`;
      const authGroup = {
        id: uuid.v4(),
        name: groupName,
        description: `The authGroup for the app role: ${groupName}`,
        orgGuid: orgGuid,
        userId: requestorId,
        roleID: role.id,
        isProtected: true,
        authClass: 'Application'
      };
      let createdAuthGroup;
      try {
        createdAuthGroup = await authGroupDal.createAuthGroup(authGroup);

        emitAuthGroupEvent(
          context,
          {
            ...authGroup,
            ...createdAuthGroup,
            id: createdAuthGroup.id || authGroup.id
          },
          null,
          'create'
        );

        result.authGroups.push(createdAuthGroup);
      } catch (ex) {
        serviceContext.logger.error(
          `Unable to create authGroup for application role: ${JSON.stringify({
            authGroup,
            error: ex
          })}`
        );

        if (ex.name.includes('resource_conflict')) {
          continue;
        }

        emitAuthGroupEvent(context, authGroup, ex, 'create');

        throw new Error(ex);
      }

      // create permission set
      if (_.isArray(role.permissions) && role.permissions.length > 0) {
        let permissionSet;
        try {
          // permissions
          permissionSet = {
            input: {
              name: groupName,
              description: `Permission set for App role: ${groupName}`,
              organizationGuid: orgGuid,
              organizationID: organizationId, // this is ownerOrganization for createAuthPermissionSet
              roleID: role.id,
              permissions: fpUtil.mapPermissionEnumByKeys(fpUtil.permissionMaskToKeys(role.permissions, true)),
              authClass: 'Application'
            },
            ignoreRestriction: true
          };

          const createdAuthPermissionSet = await createAuthPermissionSet(
            context,
            permissionSet
          );
          result.permissionSet.push(createdAuthPermissionSet);
        } catch (ex) {
          serviceContext.logger.error(
            `Unable to create permission set for application role: ${JSON.stringify(
              {
                permissionSet,
                error: ex
              }
            )}`
          );

          if (ex.name.includes('resource_conflict')) {
            continue;
          }

          throw new Error(ex);
        }
      }
    }

    return result;
  }

  /**
   * Creates or fetches default auth groups for an organization.
   * 
   * This function handles three scenarios:
   * 1. Groups already tracked in org.kvp.defaultAuthGroups - skipped (filtered out)
   * 2. Groups exist in DB but not in org.kvp.defaultAuthGroups - fetched on conflict
   * 3. New groups that don't exist anywhere - created
   * 
   * @param {Object} context - The request context
   * @param {Object} org - The organization object (may contain kvp.defaultAuthGroups)
   * @param {String} orgGuid - The organization GUID
   * @returns {Object} { defaultAuthGroups, existingGroups, hasNewGroups }
   */
  async function _createDefaultAuthGroups(context, org, orgGuid) {
    // Get groups already tracked in org.kvp.defaultAuthGroups
    const existingGroups = _.get(org, 'kvp.defaultAuthGroups', []);
    const existingGroupsMap = new Map(
      existingGroups.map((g) => [g.defaultGroup || g.name, g])
    );

    // Filter out groups that are already in org.kvp
    const defaultPolicyGroups = _.get(
      context.config,
      'rbac.defaultPolicies.authGroups',
      []
    ).filter((g) => !existingGroupsMap.has(g.defaultGroup));

    // Either the default policy groups exist or the default policy is empty
    let defaultAuthGroups = [];
    let hasNewGroups = false;
    if (defaultPolicyGroups.length) {
      for (const g of defaultPolicyGroups) {
        const group = await _createOrGetDefaultAuthGroup(context, org, orgGuid, g);

        if (group._isNew) {
          hasNewGroups = true;
        }

        _.unset(group, '_isNew');
        _.set(group, 'defaultGroup', g.defaultGroup);
        defaultAuthGroups.push(group);
      }
    }
    return {
      defaultAuthGroups,
      existingGroups,
      hasNewGroups
    };
  }

  /**
   * Creates or fetches a single default auth group for an organization.
   * 
   * @param {Object} context - The request context
   * @param {Object} org - The organization object
   * @param {String} orgGuid - The organization GUID
   * @param {Object} groupConfig - The config in rbac config.
   * @returns {Object} { ...groupInfo, isNew }
   */
  async function _createOrGetDefaultAuthGroup(
    context,
    org,
    orgGuid,
    groupConfig
  ) {
    let group;
    const groupName = `${org.name} ${_.isEmpty(groupConfig.suffix) ? groupConfig.name : groupConfig.suffix}`;

    try {
      group = await createAuthGroup(context, {
        input: {
          name: groupName,
          description: groupConfig.description,
          ownerOrganization: orgGuid,
          isProtected: true,
          authClass: 'System'
        }
      });
      group._isNew = true;
    } catch (err) {
      if (err.name === 'resource_conflict') {
        const fetchedGroups = await getAuthGroups(context, {
          groupName: groupName,
          ownerOrganization: orgGuid,
          skipCache: true
        });
        group = _.get(fetchedGroups, 'records[0]');
        group._isNew = false;
        if (!group) {
          serviceContext.logger.error(
            `Failed to fetch existing auth group: ${groupName}`
          );
          throw err;
        }
      } else {
        throw err;
      }
    }

    return group;
  }

  async function _createDefaultUserAuthGroups(context, orgGuid, users) {
    const authGroups = new Map();
    const newAuthGroups = new Map(); // for reloading session auth groups
    const newAuthGroupAuditUsers = new Map(); // for audit logging of new auth groups

    if (!orgGuid) {
      throw new errors.InvalidInput({
        message: 'Unable to get organizationGuid'
      });
    }
    if (!_.isArray(users)) {
      throw new errors.InvalidInput({
        message: 'users must be an array of users'
      });
    }

    const requestorId = _.get(context, '_authInfo.userId');

    for (const user of users) {
      // _createDefaultUserAuthGroups is being used in:
      // addDefaultACEsToResources: for requestor
      // addACEsToResources: for input.members
      const hydratedUser = user.member;
      const userId = hydratedUser.id || user.id;
      const firstName =
        _.get(hydratedUser, 'jsondata.firstName') ||
        _.get(hydratedUser, 'kvp.firstName');
      const lastName =
        _.get(hydratedUser, 'jsondata.lastName') ||
        _.get(hydratedUser, 'kvp.lastName');
      const scimConnectId = hydratedUser.scimConnectId;
      const connectId = hydratedUser.connectId;
      const auditUser = _.pickBy(
        {
          memberId: userId,
          memberType: 'user',
          userId,
          firstName,
          lastName,
          scimConnectId,
          connectId,
        },
        (value) => !_.isNil(value) && value !== '',
      );

      const existingPrivateGroup = await authGroupDal.getUserPrivateAuthGroup(
        orgGuid,
        userId
      );

      if (existingPrivateGroup) {
        // If the user already has a private group, add it to the list
        authGroups.set(userId, existingPrivateGroup.id);
        continue;
      }

      const groupName = `Default Private Group for User ${userId}`;
      const authGroup = {
        id: uuid.v4(), // Generate a new UUID for the group
        name: groupName,
        description: `This group is created as the default group for User: ${userId}`,
        orgGuid: orgGuid,
        userId: requestorId,
        isProtected: true,
        authClass: 'User'
      };
      let createdAuthGroup;
      const auditPayload = {
        ...authGroup,
        audit: {
          isPrivateUserAuthGroup: true,
          users: [auditUser]
        }
      };

      try {
        createdAuthGroup = await authGroupDal.createAuthGroup(auditPayload);

        emitAuthGroupEvent(
          context,
          {
            ...auditPayload,
            ...createdAuthGroup,
            id: createdAuthGroup.id || authGroup.id
          },
          null,
          'create'
        );

        authGroups.set(userId, createdAuthGroup.id);
        newAuthGroups.set(userId, createdAuthGroup.id);
        newAuthGroupAuditUsers.set(userId, auditUser);
      } catch (err) {
        if (err.name.includes('resource_conflict')) {
          continue;
        }

        emitAuthGroupEvent(context, auditPayload, err, 'create');

        serviceContext.logger.error(
          `Unable to create default private authGroup for user: ${JSON.stringify(
            {
              userId,
              error: err
            }
          )}`
        );

        throw err;
      }
    }

    if (newAuthGroups.size > 0) {
      // add user members to their default private groups.
      let shouldPopulateAuthCtx = false;
      const groups = Array.from(newAuthGroups.entries());
      const membersToReload = [];
      await Promise.allSettled(
        groups.map(async ([userId, groupId]) => {
          if (userId === requestorId) {
            shouldPopulateAuthCtx = true;
          }

          const member = { id: userId, memberType: 'User' };
          const auditUser = newAuthGroupAuditUsers.get(userId) || {
            memberId: userId,
            memberType: 'user',
            userId,
          };

          membersToReload.push({ id: userId, memberType: 'User' });

          const auditPayload = {
            id: groupId,
            audit: {
              users: [auditUser]
            }
          };

          try {
            await authGroupDal.addMembersToAuthGroup(groupId, [member]);
            
            emitAuthGroupEvent(context, auditPayload, null, 'addMember');
          } catch (err) {
            emitAuthGroupEvent(context, auditPayload, err, 'addMember');
            throw err;
          }
        })
      );

      if (shouldPopulateAuthCtx) {
        context._authInfo.authGroups = await _getAuthGroupIdsByUserIdWithCache(
          context,
          requestorId,
          {
            orgGuid,
            ignoreCache: true,
            addPrivateGroupsToContext: true
          }
        );
      }

      await _invalidateAnyAuthGroupRelatedCaches({
        members: membersToReload,
        organizationGuid: orgGuid,
        ignoreACEHasPermissionMarkDirty: true,
        ignoreACLForResourcesMarkDirty: true
      });

      reloadSessionAuthGroupsForMembers(orgGuid, membersToReload);
    }

    return authGroups;
  }

  async function _createDefaultPermissionSets(context, orgId, orgGuid) {
    const defaultPolicyPermissionSets = _.get(
      context.config,
      'rbac.defaultPolicies.permissionSets',
      []
    );

    return await Promise.all(
      defaultPolicyPermissionSets.map(async (p) => {
        // Check if permission set already exists first
        const existingPermSets = await getAuthPermissionSets(context, {
          nameRegex: p.name,
          ownerOrganization: orgId,
          authClass: ['System'],
          skipCache: true
        });

        let permissionSet = _.get(existingPermSets, 'records[0]');

        if (!permissionSet) {
          permissionSet = await createAuthPermissionSet(context, {
            input: {
              name: p.name,
              description: p.description,
              organizationGuid: orgGuid,
              organizationID: orgId,
              permissions: p.permissions,
              authClass: 'System',
              isProtected: true
            }
          });
        }

        return permissionSet;
      })
    );
  }

  async function _applyPermissionPolicy(context, aces, scope, policyContext, options = {}) {
    const { skipAddingACEs = false } = options;

    const aceEntries = [];
    for (const a of aces) {
      // build the ace entry
      aceEntries.push({
        member: {
          memberType: 'group',
          id: a.group.id
        },
        permissionSetID: a.permissionSet.id
      });

      // Add the permissionSets in the group details saved in the org kvp.
      if (scope === 'Organization') {
        _.set(a.group, 'permissionSets.organizationRole', a.permissionSet);
      } else if (scope === 'Resource') {
        _.set(a.group, 'permissionSets.resourceRole', a.permissionSet);
      } else if (scope === 'SDO') {
        _.set(a.group, 'permissionSets.sdoRole', a.permissionSet);
      }
    }

    if (!aceEntries.length || skipAddingACEs) {
      // If skipAddingACEs is true, we've already mapped the permission sets to groups
      // but we don't need to create ACEs again (they already exist)
      return;
    }

    if (scope === 'RootFolder') {
      // create ACE for root folder, create root folder if missing
      const organizationId = _.toNumber(policyContext.orgId);
      const rootFolders = await Promise.all([
        dalFolder.getOrCreateOrgRootFolder(context, {
          organizationId,
          rootFolderType: 'cms'
        }),
        dalFolder.getOrCreateOrgRootFolder(context, {
          organizationId,
          rootFolderType: 'resource'
        })
      ]);

      const rootFolderIds = rootFolders.reduce((preVal, rootFolder) => {
        const rootFolderId = _.get(rootFolder, 'id');
        if (rootFolderId) {
          preVal.push(rootFolderId);
        }
        return preVal;
      }, []);

      if (_.isEmpty(rootFolderIds)) {
        return;
      }
      return _addACESToResources(context, {
        resourceType: 'Folder',
        ids: rootFolderIds,
        entries: aceEntries,
        organizationGuid: policyContext.orgGuid,
        ownerOrganization: policyContext.orgId,
        userId: _.get(context._authInfo, 'userId')
      });
    }

    if (scope === 'Organization') {
      return _addACESToResources(context, {
        resourceType: 'Organization',
        ids: [policyContext.orgId],
        entries: aceEntries,
        organizationGuid: policyContext.orgGuid,
        ownerOrganization: policyContext.orgId,
        userId: _.get(context._authInfo, 'userId')
      });
    }

    // scope === 'Resource' is applied at runtime for every new resource
    // this is resolved via the defaultAuthGroup.resourceRole
  }

  async function updateAuthGroup(context, args) {
    const opt = args.input;
    let auditPayload = opt;

    try {
      setOrgGuid(context, opt);
      opt.userId = context._authInfo.userId || opt.orgGuid;
      const authGroup = await authGroupDal.updateAuthGroup(opt);

      auditPayload = {
        ...opt,
        ...authGroup,
        id: authGroup.id || opt.id
      };

      // authGroup.organizationId is actually orgGuid
      const organizationGuid = authGroup.organizationId;
      // Since updateAuthGroup don't toggle to members,
      // so we don't need to refresh the members session cache.
      await _invalidateAnyAuthGroupRelatedCaches({
        organizationGuid,
        ignoreACEHasPermissionMarkDirty: true,
        ignoreACLForResourcesMarkDirty: true
      });

      emitAuthGroupEvent(context, auditPayload, null, 'update');

      return authGroup;
    } catch (err) {
      emitAuthGroupEvent(context, auditPayload, err, 'update');
      throw err;
    }
  }

  async function deleteAuthGroup(context, args) {
    let auditPayload = {
      ...args,
      id: args.id
    }

    try {
      const group = await getAuthGroup(context, args);

      auditPayload = {
        ...auditPayload,
        ...group,
        id: args.id
      };

      if (_.get(group, 'isProtected')) {
        throw new errors.NotAllowed({
          message: 'This auth group is a protected group.'
        });
      }

      const [userIds, authGroupIds] = await Promise.all([
        authGroupDal.getAuthGroupMemberIds([args.id], {
          memberType: 'user'
        }),
        authGroupDal.getAuthGroupMemberIds([args.id], {
          memberType: 'group'
        })
      ]);

      const result = await authGroupDal.deleteAuthGroup(args);

      const memberUsers = _.map(userIds, (userId) => ({
        id: userId,
        memberType: 'user'
      }));

      const memberGroups = _.map(authGroupIds, (authGroupId) => ({
        id: authGroupId,
        memberType: 'group'
      }));

      const allGroupMembers = _.concat(memberUsers, memberGroups);

      await _invalidateAnyAuthGroupRelatedCaches({
        organizationGuid: group.organizationId,
        members: allGroupMembers
      });

      reloadSessionAuthGroupsForMembers(group.organizationId, allGroupMembers);

      emitAuthGroupEvent(context, auditPayload, null, 'delete');

      return result;
    } catch (err) {
        emitAuthGroupEvent(context, auditPayload, err, 'delete');
        throw err;
    }
  }

  async function getGroupsById(context, groupIds, options = {}) {
    if (!groupIds.length) {
      return { records: [] };
    }
    const getGroupArgs = {};
    if (!resUtil.isSuperAdmin(context._authInfo)) {
      // If not superadmin, restrict access to only groups in the caller's org
      getGroupArgs.orgGuid = getOrgGuid(context);
    }
    getGroupArgs.limit = groupIds.length;
    getGroupArgs.ids = groupIds;

    if (!_.isEmpty(options.unsupportedAuthClasses)) {
      getGroupArgs.unsupportedAuthClasses = options.unsupportedAuthClasses;
    }

    const groups = await authGroupDal.getAuthGroups(getGroupArgs);
    if (_.isNil(groups) || groups.count < groupIds.length) {
      throw new errors.NotFound({
        message: 'One or more of the provided memberIds were not found',
        data: {
          missing: _.difference(
            groupIds,
            _.get(groups, 'records', []).map((x) => x.id)
          )
        }
      });
    }
    return groups;
  }

  async function getUsersById(context, userIds) {
    if (!userIds.length) {
      return [];
    }
    const users = await serviceContext.dal.admin.getUsers(
      {
        ids: userIds,
        limit: userIds.length,
        _allUsers: true
      },
      context
    );
    return _.get(users, 'records', []);
  }

  async function getMembers(context, memberIds, allowMissing, options = {}) {
    const memberGroups = new Map();
    const memberUsers = new Map();
    for (const m of memberIds) {
      if (_.isNil(m.modifiedAt)) {
        m.modifiedAt = m.createdAt;
      }
      if (_.toLower(m.memberType) === 'group') {
        memberGroups.set(m.id, m);
      } else {
        memberUsers.set(m.id, m);
      }
    }
    // Validate access to the provided groups
    const userIds = Array.from(memberUsers.keys());
    const users = await getUsersById(context, userIds);
    if (!allowMissing && (_.isNil(users) || users.length < userIds.length)) {
      throw new errors.NotFound({
        message: 'One or more of the provided memberIds were not found',
        data: {
          missing: _.difference(
            userIds,
            users.map((x) => x.id)
          )
        }
      });
    }
    // Validate access to the provided users
    const groups = await getGroupsById(
      context,
      Array.from(memberGroups.keys()),
      {
        unsupportedAuthClasses: options.unsupportedAuthClasses
      }
    );

    const results = [];
    for (const u of users) {
      const r = memberUsers.get(u.id);
      r.member = u;
      results.push(r);
    }
    for (const g of groups.records) {
      const r = memberGroups.get(g.id);
      if (r) {
        r.member = g;
        results.push(r);
      }
    }
    return results;
  }

  async function authGroupAddMembers(context, args) {
    // The User Default Private AG can’t be listed, have members added to it,
    // or be added as a member to other groups.
    args.unsupportedAuthClasses = ['User'];

    let auditPayload = {
      id: args.id,
      audit: {
        users: _.get(args, 'members', [])
      }
    };

    try {
      const group = await getAuthGroup(context, args);
      // call getMembers to verify access and presence of the passed-in ids
      const auditUsers = await getMembers(context, args.members, false, {
        unsupportedAuthClasses: args.unsupportedAuthClasses
      });

      auditPayload = {
        id: group.id,
        audit: {
          users: auditUsers
        }
      };

      await authGroupDal.addMembersToAuthGroup(group.id, args.members);

      await _invalidateAnyAuthGroupRelatedCaches({
        members: args.members,
        organizationGuid: group.organizationId,
        ignoreACLForResourcesMarkDirty: true
      });

      reloadSessionAuthGroupsForMembers(group.organizationId, args.members);

      emitAuthGroupEvent(context, auditPayload, null, 'addMember');

      return getAuthGroup(context, args);
    } catch (err) {
      emitAuthGroupEvent(context, auditPayload, err, 'addMember');
      throw err;
    }
  }

  async function validateRemoveMembers(org, group, memberIds) {
    const defaultAuthAdminGroupName = 'orgAdmin';
    memberIds = memberIds || [];
    if (memberIds.length === 0) {
      return true;
    }

    const defaultGroups = _.get(org, 'kvp.defaultAuthGroups', []);
    if (defaultGroups.length == 0) {
      return true;
    }
    let orgAdmin;
    for (const g of defaultGroups) {
      if (
        g.name === defaultAuthAdminGroupName ||
        g.defaultGroup === defaultAuthAdminGroupName
      ) {
        orgAdmin = g;
        break;
      }
    }
    if (!orgAdmin || orgAdmin.id !== group.id) {
      return true;
    }

    // Get all members in the group with memberType: 'user'
    const dbMemberIds = await authGroupDal.getAuthGroupMemberIds([group.id], {
      memberType: 'user'
    });

    if (dbMemberIds.length === 1) {
      return false;
    }
    if (dbMemberIds.length > memberIds.length) {
      return true;
    }

    return _.intersection(dbMemberIds, memberIds).length !== dbMemberIds.length;
  }

  async function authGroupRemoveMembers(context, args) {
    // the User Default Private AG can’t be listed or removed members from it.
    args.unsupportedAuthClasses = ['User'];

    let auditPayload = {
      id: args.id,
      audit: {
        users: _.map(_.get(args, 'memberIds', []), (id) => ({ userId: id }))
      }
    };

    try {
      const group = await getAuthGroup(context, args);

      // get memberIds before remove members that to reload members sessions with memberType
      const [userIds, authGroupIds] = await Promise.all([
        authGroupDal.getAuthGroupMemberIds([args.id], {
          memberIds: args.memberIds,
          memberType: 'user'
        }),
        authGroupDal.getAuthGroupMemberIds([args.id], {
          memberIds: args.memberIds,
          memberType: 'group'
        })
      ]);

      const orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
        group.organizationId
      );

      const org = await serviceContext.dal.organization.getOrganization(context, {
        id: orgId
      });

      // const validateRemoveMembers
      const isValid = await validateRemoveMembers(org, group, userIds);
      if (!isValid) {
        throw new errors.NotAllowed({
          message:
            'This operation will remove the last member of the Administrators group'
        });
      }

      const memberUsers = _.map(userIds, (userId) => {
        return { id: userId, memberType: 'user' };
      });
      const memberGroups = _.map(authGroupIds, (groupId) => {
        return { id: groupId, memberType: 'group' };
      });
      const removedMembers = _.concat(memberUsers, memberGroups);

      // safe guard: requested IDs were not actually members of this AuthGroup.
      if (_.isEmpty(removedMembers)) {
        return getAuthGroup(context, args);
      }

      const auditMembers = await getMembers(context, removedMembers, false, {
        unsupportedAuthClasses: args.unsupportedAuthClasses
      });

      auditPayload = {
        id: group.id,
        audit: {
          users: auditMembers
        }
      };

      // TODO: validate ids.
      // validateMemberAccess(args.members);
      await authGroupDal.removeMembersFromAuthGroup(group.id, args.memberIds);

      await _invalidateAnyAuthGroupRelatedCaches({
        members: removedMembers,
        organizationGuid: group.organizationId,
        ignoreACLForResourcesMarkDirty: true
      });

      reloadSessionAuthGroupsForMembers(group.organizationId, removedMembers);

      emitAuthGroupEvent(context, auditPayload, null, 'removeMember');

      return getAuthGroup(context, args);
    } catch (err) {
      emitAuthGroupEvent(context, auditPayload, err, 'removeMember');
      throw err;
    }
  }

  function reloadSessionAuthGroupsForMembers(organizationGuid, members) {
    const memberGroups = new Set();
    const memberUsers = new Set();
    for (const m of members) {
      if (_.toLower(m.memberType) === 'group') {
        memberGroups.add(m.id);
      } else {
        memberUsers.add(m.id);
      }
    }

    if (memberUsers.size) {
      emitReloadSessionUsersEvent(organizationGuid, Array.from(memberUsers));
    }

    if (memberGroups.size) {
      emitReloadSessionAuthGroupsEvent(organizationGuid, {
        authGroupIds: Array.from(memberGroups)
      });
    }
  }

  async function getAuthGroupMembers(context, args) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);
    if (!isSuperAdmin && !isOrgAdmin) {
      // Non-admin users can't access the group members.
      // This is done due to User type having unprotected sensitive fields
      return mainUtil.toPage(args, []);
    }
    const memberIds = await authGroupDal.getAuthGroupMembers(
      args.authGroupId,
      args
    );

    const members = await getMembers(context, memberIds, true, {
      unsupportedAuthClasses: ['User'] // The User Default Private AG can’t be listed as member
    });
    return mainUtil.toPage(args, members);
  }

  async function getAuthGroupMembership(context, args) {
    args.orgGuid = getOrgGuid(context);

    // for superAdmin/internalToken
    if (args.ownerOrganization) {
      if (
        typeof args.ownerOrganization === 'string' &&
        validator.isUUID(args.ownerOrganization)
      ) {
        args.orgGuid = args.ownerOrganization;
      } else {
        args.orgGuid = await serviceContext.dal.application.getAppIdFromOrgId(
          args.ownerOrganization
        );
      }
    }
    return authGroupDal.getAuthGroupsContainingMember(args.authGroupId, args);
  }

  async function getAuthGroupResourceRoles(context, args) {
    // TODO: implement
    // Figure out the permissions requirements to call this api
    return [];
  }
  async function getAuthGroupOrganizationRoles(context, args) {
    return [];
  }
  // #endregion

  // #region PermissionSets
  async function getAuthPermissionSet(context, args) {
    if (!args.id || _.isNil(args.id)) {
      throw new errors.InvalidInput({
        message: `Missing Permission Set ID`
      });
    }

    args.ids = [args.id];
    args.limit = 1;
    // does not restrict internalToken (without passing ownerOrganization)
    // same with the existing behavior.
    args.allowInternalToken = true;

    const permissionSets = await getAuthPermissionSets(context, args);
    const result = _.get(permissionSets, 'records[0]');

    if (!result) {
      throw new errors.NotFound({
        message: 'Authorization permission set not found',
        data: {
          id: args.id
        }
      });
    }

    return result;
  }

  async function getAuthPermissionSets(context, args) {
    // throw restriction error with internalToken, without ownerOrganization.
    const restrictionResult = await restrictContextOrganization(context, {
      organizationGuid: args.organizationGuid,
      ownerOrganization: args.ownerOrganization,
      allowInternalToken: _.get(args, 'allowInternalToken', false)
    });
    args.organizationGuid = restrictionResult.organizationGuid;
    return await getAuthPermissionSetsDB(args);
  }

  async function getAuthPermissionSetsDB(args) {
    const permissionSets = await authPermissionDal.getAuthPermissionSets(args);

    return mainUtil.toPage(args, permissionSets);
  }

  async function createAuthPermissionSet(context, args) {
    const { input, ignoreRestriction } = args;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isInternalToken = resUtil.getTokenType(context) === 'internal';
    try {
      // ignore restriction for checkAndCreateAuthGroupsForAppRoles
      // throw restriction error with internalToken, without ownerOrganization.
      if (!ignoreRestriction) {
        const restrictionResult = await restrictContextOrganization(context, {
          ownerOrganization: input.organizationID,
          allowInternalToken: false
        });
        input.organizationGuid = restrictionResult.organizationGuid;
      }

      input.id = uuid.v4();
      input.createdBy = _.get(context._authInfo, 'userId');

      if (_.isEmpty(input.organizationGuid)) {
        throw new errors.InvalidInput({
          message: `Unable to get organizationGuid`
        });
      }

      // for internal token which doesn't have userId in the context
      if ((isSuperAdmin || isInternalToken) && _.isNil(input.createdBy)) {
        input.createdBy = input.organizationGuid;
      }

      const result = await authPermissionDal.createAuthPermissionSet(input);

      // don't await to not affect to API performance
      authPermissionDal.markCacheDirtyForGetAuthPermissionSets(
        result.organizationGuid
      );

      emitAuthPermissionSetEvent(
        context,
        {
          ...input,
          ...result,
          id: result.id || input.id
        },
        null,
        'create'
      );

      return result;
    } catch (err) {
      emitAuthPermissionSetEvent(context, input, err, 'create');

      if (err.name === 'invalid_input') {
        throw err;
      }

      throw new errors.InternalServerError(err);
    }
  }

  async function updateAuthPermissionSet(context, args) {
    const { input, emitAuditEvent = true } = args;

    let auditPayload = input;

    try {
      const permissionSet = await getAuthPermissionSet(context, {
        id: input.id,
        ownerOrganization: input.ownerOrganization
      });

      auditPayload = {
        ...auditPayload,
        ...permissionSet,
        id: input.id
      };

      if (permissionSet.isProtected && input.isProtected !== false) {
        throw new errors.NotAllowed({
          message: 'You cannot update this permission set.',
          data: {
            type: 'AuthPermissionSet',
            permissionSetId: input.id
          }
        });
      }

      const result = await authPermissionDal.updateAuthPermissionSet(input);
      
      auditPayload = {
        ...auditPayload,
        ...result,
        id: result.id || input.id
      };

      await Promise.all([
        // clear cached authPermissionSet
        authPermissionDal.markCacheDirtyForGetAuthPermissionSets(
          permissionSet.organizationGuid
        ),
        _invalidateAnyPermissionSetRelatedCaches({
          organizationGuid: permissionSet.organizationGuid
        }),
        emitReloadSessionAuthGroupsEvent(permissionSet.organizationGuid, {
          permissionSetIds: [permissionSet.id]
        })
      ]);

      if (emitAuditEvent) {
        emitAuthPermissionSetEvent(context, auditPayload, null, 'update');
      }

      return result;
    } catch (err) {
      if (emitAuditEvent) {
        emitAuthPermissionSetEvent(context, auditPayload, err, 'update');
      }

      if (err.name === 'not_allowed') {
        throw err;
      }

      throw new errors.InternalServerError(err);
    }
  }

  async function deleteAuthPermissionSet(context, args) {
    let auditPayload = {
      ...args,
      id: args.id
    };

    try {
      // get the permission set to validate access
      const permissionSet = await getAuthPermissionSet(context, args);

      auditPayload = {
        ...auditPayload,
        ...permissionSet,
        id: args.id
      };

      if (permissionSet.isProtected) {
        throw new errors.NotAllowed({
          message: 'You cannot delete this permission set.',
          data: {
            type: 'AuthPermissionSet',
            permissionSetId: args.id
          }
        });
      }

      // assign an empty permission set to effectively disable a role.
      const options = {
        input: {
          id: args.id,
          permissions: [],
          protected: false // ignore NotAllowed error when soft deleting
        }
      };

      let result;

      try {
        const deletePermissionSet = await authPermissionDal.deleteAuthPermissionSet(
          context,
          { permissionSetId: args.id }
        );

        if (!deletePermissionSet.id) {
          const updatePermissionSet = await updateAuthPermissionSet(
            context,
            { ...options, emitAuditEvent: false },
          );

          result = { id: updatePermissionSet.id };
        } else {
          await Promise.all([
            authPermissionDal.markCacheDirtyForGetAuthPermissionSets(
              permissionSet.organizationGuid
            ),
            _invalidateAnyPermissionSetRelatedCaches({
              organizationGuid: permissionSet.organizationGuid
            }),
            emitReloadSessionAuthGroupsEvent(permissionSet.organizationGuid, {
              permissionSetIds: [permissionSet.id]
            })
          ]);

          result = { id: deletePermissionSet.id };
        }
      } catch (err) {
        throw new errors.InternalServerError(err);
      }

      emitAuthPermissionSetEvent(context, auditPayload, null, 'delete');
      
      return result;
    } catch (err) {
      emitAuthPermissionSetEvent(context, auditPayload, err, 'delete');
      throw err;
    }
  }

  // RBAC organization permissions (orgRoles) cache type key - enables:
  // - L1 local cache (configurable via config.localCache.rbacAuthGroupsForOrgPermissions)  
  // - L2 Redis cache with dirty marking for cross-service invalidation
  const AUTH_GROUPS_ORG_PERMISSIONS_CACHE_KEY = 'rbacAuthGroupsForOrgPermissions';
  function buildKeyForGroupIds(orgId, groupIds) {
    return `${orgId}-${groupIds.sort().join(':')}`;
  }

  function permissionSetHasPermissions(context, role, permissions, requireAll) {
    if (!Array.isArray(role.permissionMask) || !Array.isArray(permissions)) {
      return false;
    }
    return fpUtil.hasPermissions(
      role.permissionMask,
      fpUtil.mapPermissionKeyByEnums(permissions),
      requireAll
    );
  }

  async function checkAuthGroupsForOrganizationPermissions(
    context,
    orgId,
    groupIds,
    permissions,
    options = {}
  ) {
    const { requireAll = true, throwMismatchOrgRole = false } = options;
    if (_.isEmpty(groupIds)) {
      if (throwMismatchOrgRole && !Array.isArray(groupIds)) {
        throw new errors.NotFound({
          message: 'Missing auth groups'
        });
      }
      return false;
    }
    const cacheKey = buildKeyForGroupIds(orgId, groupIds);
    const markedKey = _buildMarkedKey(ORGANIZATION_PERMISSIONS_MASK_KEY, orgId);

    // validate organization permission cache
    const {
      asyncGetCacheValue,
      asyncRefreshCacheValue
    } = await mainUtil.validateCacheKey(
      markedKey,
      AUTH_GROUPS_ORG_PERMISSIONS_CACHE_KEY,
      cacheKey,
      {
        useL1Cache: true,
        ttlMinL2Override: 30 // 30 minutes TTL for L2 cache
      }
    );

    let mask = await asyncGetCacheValue();
    if (_.isNil(mask)) {
      mask = await getMaskForOrgRoleLookup(context, orgId, groupIds);
      await asyncRefreshCacheValue(mask);
    }

    if (_.isNil(mask)) {
      if (throwMismatchOrgRole) {
        throw new errors.NotFound({
          message:
            'Mismatch between app role auth groups and organization object'
        });
      }
      return false;
    }

    return fpUtil.hasPermissions(mask, permissions, requireAll);
  }

  // #endregion

  // #region ACEs
  /**
   * Emit one ACEGrant audit event per (entry x resource id) combination.
   * `entries` are snapshotted before user members are swapped for their private
   * auth groups so the audit reflects the member the caller actually targeted.
   */
  function _emitACEGrantAudit(context, resourceType, resourceIds, entries, error) {
    for (const resourceId of resourceIds || []) {
      for (const entry of entries || []) {
        emitACEGrantEvent(
          context,
          {
            authPermissionSetId: entry.authPermissionSetId,
            memberId: entry.memberId,
            memberType: entry.memberType,
            resourceType,
            resourceId
          },
          error
        );
      }
    }
  }

  /**
   *  Assign a role to an authorization group for a specific resource
   */
  async function addACEsToResources(context, args) {
    // Snapshot the requested grants before any user member is replaced with its
    // private auth group below, so ACEGrant audit records the original member.
    const auditGrantEntries = _.map(_.get(args, 'entries', []), (e) => ({
      authPermissionSetId: _.get(e, 'permissionSetID'),
      memberId: _.get(e, 'member.id'),
      memberType: _.get(e, 'member.memberType')
    }));
    const auditResourceType = args.resourceType;
    const auditResourceIds = _.get(args, 'ids', []) || [];

    try {
      const acl = await _addACEsToResourcesWithValidation(context, args);
      _emitACEGrantAudit(
        context,
        auditResourceType,
        auditResourceIds,
        auditGrantEntries,
        null
      );
      return acl;
    } catch (err) {
      _emitACEGrantAudit(
        context,
        auditResourceType,
        auditResourceIds,
        auditGrantEntries,
        err
      );
      throw err;
    }
  }

  async function _addACEsToResourcesWithValidation(context, args) {
    await populateAuthContext(context);
    const { resourceType, ids } = args;
    const restrictionResult = await restrictContextOrganization(
      context,
      _.pick(args, ['ownerOrganization', 'organizationGuid'])
    );
    const orgGuid = restrictionResult.organizationGuid;

    const useRBACForResourceType = await useRBACFeatureForResourceType(context, restrictionResult, resourceType);
    if (!useRBACForResourceType) {
      throw new errors.NotAllowed({
        message: `RBAC is not enabled for resource type: ${resourceType}`
      });
    }

    // ACL validation
    const members = [];
    const permissionSetsIds = new Set();
    for (const e of args.entries) {
      members.push(e.member);
      permissionSetsIds.add(e.permissionSetID);
    }

    // Validate users and groups
    await getMembers(
      context,
      args.entries.map((m) => m.member)
    );

    // Create default private group for users if not exists
    const userMembers = _.filter(
      members,
      (m) => _.toLower(m.memberType) === 'user'
    );
    if (!_.isEmpty(userMembers)) {
      const privateGroupMap = await _createDefaultUserAuthGroups(
        context,
        orgGuid,
        userMembers
      );

      // replace userMembers with the corresponding User auth groups
      members.forEach((member) => {
        if (
          _.toLower(member.memberType) === 'user' &&
          _.get(member, 'id') &&
          privateGroupMap.has(member.id)
        ) {
          member.id = privateGroupMap.get(member.id);
          member.memberType = 'group';
        }
      });
    }

    // Validate permissionSets
    const permissionSets = await getAuthPermissionSets(context, {
      organizationGuid: orgGuid,
      ownerOrganization: args.ownerOrganization,
      ids: Array.from(permissionSetsIds.keys()),
      limit: permissionSetsIds.size
    });

    if (permissionSets.records.length < permissionSetsIds.size) {
      throw new errors.AuthorizationError({
        message: 'One or more of the permission sets do not exist',
        data: {
          permissionSets: _.difference(
            Array.from(permissionSetsIds.keys()),
            permissionSets.records.map((p) => p.id)
          )
        }
      });
    }

    // Validate existence of the passed in resource ids.
    validateResourceIds(resourceType, ids);

    const { isAdmin, userPermissionSets } = await validateAccessToResourceIds(
      context,
      resourceType,
      ids,
      {
        organizationId: restrictionResult.organizationId,
        organizationGuid: orgGuid
      }
    );
    // userPermissionSets can be empty if all ids are in context._authGranted
    // meaning that the object(s) were just created and therefore the owner has the right to set any permission.
    if (!isAdmin && userPermissionSets && userPermissionSets.size) {
      // admin can assign any permissions for now
      // non-admin users can assign only permissions less or equal to their own
      await validateAllowedPermissionSets(
        _.flattenDepth(Array.from(userPermissionSets.values()), 1),
        permissionSets.records
      );
    }

    args.organizationGuid = orgGuid;
    args.ownerOrganization = restrictionResult.organizationId;
    return _addACESToResources(context, args);
  }

  async function _addACESToResources(context, args, options) {
    const { resourceType, ids, entries } = args;
    const isInternalToken = resUtil.getTokenType(context) === 'internal';
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    args.orgId = _.get(context._authInfo, 'organization.organizationId');
    args.userId = _.get(context._authInfo, 'userId');
    const orgGuid = args.organizationGuid || getOrgGuid(context);

    if (args.resourceType === 'SDO' && _.isNil(args.dataRegistryId)) {
      if (_.isNil(args.resourceTypeSchemaId)) {
        throw new errors.InvalidInput({
          message: 'resourceTypeSchemaId is required for the SDO resource type.'
        });
      } else {
        // dataRegistryId is schema_id
        args.dataRegistryId = args.resourceTypeSchemaId;
      }
    }

    // validate SDO schema existence
    if (args.resourceType === 'SDO' && args.dataRegistryId) {
      await serviceContext.dal.structuredData.getSchema(
        context,
        {
          id: args.dataRegistryId
        }
      );
    }

    // internal token
    if (isInternalToken && _.isNil(args.orgId) && orgGuid) {
      args.orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
        orgGuid
      );
    }

    // For createOrganization, only superAdmin can create organization
    if ((isSuperAdmin || isInternalToken) && args.ownerOrganization) {
      args.orgId = _.toNumber(args.ownerOrganization);
    }

    if (_.isNil(args.userId) && args.orgId) {
      const defaultOrgAdmin = await serviceContext.dal.user.getDefaultOrgAdminUser(
        { organizationId: args.orgId },
        context
      );
      args.userId = _.get(defaultOrgAdmin, 'id');
    }

    let acl;
    try {
      acl = await authACEDal.addACEsToResources(args, options?.dbClients);
      if (args.resourceType === 'TDO') {
        await emitTDOACLChangedEvents(ids);
      }

      if (args.resourceType === 'Folder') {
        await _invalidateAccessibleFolderCaches(context, ids);
      }

      if (args.resourceType === 'SDO' && ids.length > 0 && args.dataRegistryId && args.orgId) {
        await emitSDOACLChangedEvents(ids, args.dataRegistryId, args.orgId);
      }
    } catch (err) {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError({
        message: 'Error creating resource Access Control Entries',
        data: {
          ids,
          resourceType,
          accessControlEntries: entries
        }
      });
    }

    await _invalidateAnyPermissionSetRelatedCaches({
      organizationId: args.orgId,
      organizationGuid: orgGuid,
      ignoreOrgPermissionMarkDirty:
        _.toLower(args.resourceType) !== 'organization',
      resourceIds: ids
    });
    return acl;
  }

  function _getDefaultAuthGroupForResources(authGroups, authPermissionSets) {
    const permissionEntries = [];
    const defaultAuthGroups = [];
    for (const ag of _.get(authGroups, 'records', [])) {
      for (const p of _.get(authPermissionSets, 'records', [])) {
        // Permission set for Resources
        if (p.name === 'aiWARE Full Access') {
          ag.permissionSet = [p];
          permissionEntries.push({
            member: {
              id: ag.id,
              memberType: 'group'
            },
            permissionSetID: p.id
          });

          break;
        }
      }

      defaultAuthGroups.push(ag);
    }

    return {
      defaultAuthGroups,
      permissionEntries
    };
  }

  async function addDefaultACEsToResources(context, args, options) {
    await populateAuthContext(context);
    // incr/set redis cache for org media usage
    const orgId = args.organizationId;
    let org = args.org;

    if (orgId) {
      org =
        org ||
        (await serviceContext.dal.organization.getOrganization(context, {
          id: orgId
        }));
    }

    let useRBACFeature;
    if (args.skipRBACEnabledCheck) {
      useRBACFeature = true;
    } else {
      useRBACFeature = await mainUtil.isEnableFeatureInOrganization(
        context,
        org,
        orgId,
        'enableRBACFeature'
      );
    }

    if (!org || !useRBACFeature) {
      return;
    }

    // early return if RBAC is not enabled for this resource type
    if (!args.skipRBACEnabledCheck) {
      const useRBACForResourceType = await useRBACFeatureForResourceType(context, org, args.resourceType);
      if (!useRBACForResourceType) {
        return;
      }
    }

    // get defaultAuthGroups and defaultPermissionSets in organization setting
    const defaultAuthGroups = _.get(org, 'kvp.defaultAuthGroups', []);
    const permissionEntries = [];
    if (!_.isArray(defaultAuthGroups) || defaultAuthGroups.length == 0) {
      return;
    }

    for (const g of defaultAuthGroups) {
      if (!g) {
        continue;
      }

      // Add resource role permission sets
      const permissionSet = _.get(g, 'permissionSets.resourceRole');
      if (permissionSet) {
        permissionEntries.push({
          member: {
            id: g.id,
            memberType: 'group'
          },
          permissionSetID: permissionSet.id
        });
      }

      // the owner ACE defined as <userId_private_group, resourceId, AiWARE Administrator>.
      if (
        _.includes(g.name, constants.DEFAULT_AUTH_GROUP_SUFFIX.ORG_ADMIN) ||
        _.includes(g.name, constants.DEFAULT_AUTH_GROUP_NAME.ORG_ADMIN) ||
        g.defaultGroup === constants.DEFAULT_AUTH_GROUP_NAME.ORG_ADMIN
      ) {
        const requestorId = args.ownerId || _.get(context, '_authInfo.userId');
        const requestor = _.get(context, '_authInfo');
        const adminPermissionSet = _.get(g, 'permissionSets.organizationRole');
        // Keep the same shape as in addACEsToResources
        const requestorMembers = [
          {
            id: requestorId,
            memberType: 'User',
            member: {
              firstName: _.get(requestor, 'kvp.firstName'),
              lastName: _.get(requestor, 'kvp.lastName'),
              scimConnectId: _.get(requestor, 'scimConnectId')
            }
          },
        ];
        if (requestorId && adminPermissionSet) {
          // create default private group for requestor if not exists
          const privateGroupMap = await _createDefaultUserAuthGroups(
            context,
            org.organizationGuid,
            requestorMembers
          );
          const privateGroupId = privateGroupMap.get(requestorId);
          if (privateGroupId) {
            permissionEntries.push({
              member: {
                id: privateGroupId,
                memberType: 'group'
              },
              permissionSetID: adminPermissionSet.id
            });
          }
        }
      }

      // Add SDORole permission sets
      if (args.resourceType === 'SDOSchema' || args.resourceType === 'SDO') {
        if (args.ignoreDefaultSDORole) {
          continue;
        }
        const sdoSchemaRole = _.get(g, 'permissionSets.sdoRole');
        if (sdoSchemaRole && sdoSchemaRole.name) {
          permissionEntries.push({
            member: {
              id: g.id,
              memberType: 'group'
            },
            permissionSetID: sdoSchemaRole.id
          });
        } else {
          const defaultPolicies = _.get(
            context.config,
            'rbac.defaultPolicies.policies',
            []
          );
          const groupName = g.defaultGroup || g.name;
          const sdoRolePolicyInGroup = defaultPolicies.filter(
            (policy) =>
              policy.scope === 'SDO' && policy.authGroupName === groupName
          );

          if (sdoRolePolicyInGroup.length > 0) {
            for (const policy of sdoRolePolicyInGroup) {
              const permSetName = policy.permissionSetName;
              if (!permSetName) {
                continue;
              }

              const availablePermissionSets = await getAuthPermissionSets(
                context,
                {
                  organizationGuid: org.organizationGuid,
                  nameRegex: permSetName
                }
              );

              const dbPermissionSet = availablePermissionSets.records.find(
                (ps) => ps.name === permSetName
              );

              if (dbPermissionSet) {
                permissionEntries.push({
                  member: {
                    id: g.id,
                    memberType: 'group'
                  },
                  permissionSetID: dbPermissionSet.id
                });

                // Update the group permissionSets in the organization kvp
                g.permissionSets.sdoRole = dbPermissionSet;
                await serviceContext.dal.organization.updateOrganizationKvp(
                  org.id,
                  org.kvp,
                  context
                );
              }
            }
          }
        }
      }
    }

    let newObjectIds = _.get(args, 'objectIds');
    if (!newObjectIds) {
      newObjectIds = [_.get(args, 'objectId')];
    }

    const resourceType = args.resourceType;
    if (!_.isEmpty(permissionEntries)) {
      // don't use addACESToResources since that checks access to the object
      // and since this is the initial provisioning that fails
      await _addACESToResources(
        context,
        {
          organizationGuid: org.organizationGuid,
          ownerOrganization: org.organizationId,
          resourceType: resourceType,
          ids: newObjectIds,
          entries: permissionEntries,
          dataRegistryId: args.dataRegistryId,
        },
        options,
      );
    } else {
      serviceContext.logger.error(
        `create ${resourceType} - Add ACEs: failed to retrieve default group or permission set.`,
        newObjectIds
      );
    }

    // Add the new id to the set of pre-authorized ids
    // This is called during object creation
    // and since the mutation auth directive don't have the id at the time,
    // we need to set it here. Else the object resolver will request a read
    // permission that is not available since the permission inheritance takes place
    // after that
    if (!context._authGranted) {
      context._authGranted = new Map();
    }
    const authIds = context._authGranted.get(resourceType);
    if (authIds && authIds.ids) {
      context._authGranted.set(resourceType, {
        ids: new Set([...authIds.ids, ...newObjectIds])
      });
    } else {
      context._authGranted.set(resourceType, { ids: new Set(newObjectIds) });
    }
  }

  const RESOURCE_TYPE_WRITE_PERMISSIONS = {
    TDO: ['AIWARE_TDO_UPDATE'],
    Folder: ['AIWARE_FOLDER_UPDATE'],
    Organization: ['ADMIN_ORG_UPDATE']
  };

  function getACLWritePermissionForType(resourceType) {
    return RESOURCE_TYPE_WRITE_PERMISSIONS[resourceType] || ['ADMIN_ACCESS'];
  }

  async function addACEsToResourceFromNestedMutation(
    context,
    args,
    schemaInfo
  ) {
    const isMutationType =
      _.toLower(_.get(schemaInfo, 'operation.operation', '')) === 'mutation';

    if (!isMutationType) {
      throw new errors.NotImplemented({
        message:
          'Only the mutation type supports the nested mutation addACEs().'
      });
    }

    if (_.isNil(args.organizationGuid) && args.organizationId) {
      args.organizationGuid = await serviceContext.dal.application.getAppIdFromOrgId(
        args.organizationId
      );
    }

    // addACEsToResources received ownerOrganization instead of organizationGuid for the new restrict function.
    args.ownerOrganization = args.organizationGuid;

    // defaultACEPolicyUpdate is only working for SDO resourceType.
    if (args.resourceType !== 'SDO') {
      return addACEsToResources(context, args);
    }

    let organizationId = args.organizationId;
    let organizationName = null;

    const authOrg = _.get(context, '_authInfo.organization');
    if (
      authOrg &&
      (!args.organizationGuid ||
        authOrg.organizationGuid === args.organizationGuid)
    ) {
      organizationId = organizationId || authOrg.organizationId || null;
      organizationName = authOrg.organizationName || null;
    }

    if (_.isNil(organizationId) && args.organizationGuid) {
      try {
        organizationId = await serviceContext.dal.organization.getOrgIdFromAppId(
          args.organizationGuid
        );
      } catch (orgErr) {
        serviceContext.logger.warn(
          'DefaultACEPolicyUpdate: failed to resolve organizationId from guid',
          orgErr
        );
      }
    }

    if (!organizationName) {
      const orgLookupId = args.organizationGuid || organizationId;
      if (!_.isNil(orgLookupId)) {
        try {
          const org = await serviceContext.dal.organization.getOrganization(
            context,
            { id: orgLookupId }
          );
          organizationName = _.get(org, 'name') || null;
        } catch (orgErr) {
          serviceContext.logger.warn(
            'DefaultACEPolicyUpdate: failed to resolve organization name',
            orgErr
          );
        }
      }
    }

    // Snapshot the target ids before addACEsToResources runs (it remaps members
    // but leaves ids intact) so both success and failure are audited per SDO.
    const policyResourceIds = _.get(args, 'ids', []) || [];
    const emitDefaultACEPolicyAudit = (err) => {
      for (const resourceId of policyResourceIds) {
        emitDefaultACEPolicyUpdateEvent(
          context,
          {
            organizationId,
            organizationGuid: args.organizationGuid,
            organizationName,
            resourceType: 'SDO',
            resourceId
          },
          err
        );
      }
    };

    try {
      const acl = await addACEsToResources(context, args);
      emitDefaultACEPolicyAudit(null);
      return acl;
    } catch (err) {
      emitDefaultACEPolicyAudit(err);
      throw err;
    }
  }

  function filterPreAuthIds(context, resourceType, ids) {
    if (!context._authGranted) {
      return ids;
    }
    const typeCache = context._authGranted.get(resourceType);
    if (!typeCache || !typeCache.ids) {
      return ids;
    }
    const missing = [];
    for (const id of ids) {
      if (!typeCache.ids.has(id)) {
        missing.push(id);
      }
    }
    return missing;
  }

  // Gets the permissions for he user that allows adding acls
  // return { isAdmin: boolean, Map<resourceId,[PermissionSet]>)
  async function validateAccessToResourceIds(
    context,
    resourceType,
    ids,
    options
  ) {
    const missingAuthorizations = filterPreAuthIds(context, resourceType, ids);

    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);
    const isInternalToken = resUtil.getTokenType(context) === 'internal';

    const isAdmin = isOrgAdmin || isSuperAdmin;
    const userPermissionSets = new Map();
    if (isAdmin || isInternalToken || missingAuthorizations.length === 0) {
      return {
        isAdmin,
        userPermissionSets
      };
    }
    const orgId =
      _.get(options, 'organizationId') ||
      _.get(context._authInfo, 'organization.organizationId');
    const pageSize = 3 * ids.length;
    const reqOptions = {
      orgId,
      resourceType,
      ids,
      permissions: getACLWritePermissionForType(resourceType),
      requireAll: false,
      authGroups: _.get(context._authInfo, 'authGroups'),
      offset: 0,
      limit: pageSize,
      skipCache: true
    };
    // Get permission sets for resources.
    let res;
    const permissionSetIds = new Set();
    const permissionSetIdsPerResource = new Map();
    do {
      res = await authACEDal.getACLForResources(reqOptions);
      for (const r of res.records) {
        const permissionsForId =
          permissionSetIdsPerResource.get(r.objectID) || [];
        permissionsForId.push(r.permissionSetId);
        permissionSetIdsPerResource.set(r.objectID, permissionsForId);
        permissionSetIds.add(r.permissionSetId);
      }
      reqOptions.offset += pageSize;
    } while (_.get(res, 'records.length', 0) === pageSize);

    // check if the user has write permissions to all resource ids
    if (permissionSetIdsPerResource.size < ids.length) {
      const deniedMessage = 'Access denied to one or more of the provided ids';
      // Emit one AuthorizationDenied audit event per denied resource id before
      // re-throwing so the original authorization behavior is preserved.
      const deniedIds = _.difference(
        ids,
        Array.from(permissionSetIdsPerResource.keys())
      );
      const requestorId = _.get(context._authInfo, 'userId');
      for (const resourceId of deniedIds) {
        emitAuthorizationDeniedEvent(context, {
          member: { id: requestorId, memberType: 'User' },
          resourceType,
          resourceId,
          reason: deniedMessage
        });
      }

      throw new errors.AuthorizationError({
        message: deniedMessage,
        data: {
          notAuthorized: _.difference(ids, userPermissionSets.keys())
        }
      });
    }

    // retrieve the permission set details:
    const permissionSets = await getAuthPermissionSets(context, {
      organizationGuid:
        _.get(options, 'organizationGuid') || getOrgGuid(context),
      ids: Array.from(permissionSetIds.keys()),
      limit: permissionSetIds.size,
      skipCache: true
    });

    const permissionLookup = new Map();
    for (const p of permissionSets.records) {
      permissionLookup.set(p.id, p);
    }

    for (const [id, val] of permissionSetIdsPerResource) {
      userPermissionSets.set(
        id,
        val.map((x) => permissionLookup.get(x))
      );
    }
    return {
      isAdmin,
      userPermissionSets
    };
  }
  async function validateAllowedPermissionSets(
    grantorPermissions,
    permissions
  ) {
    if (!fpUtil.isPermissionSubset(grantorPermissions, permissions)) {
      throw new errors.AuthorizationError(
        'Attempt at privilege escalation. The requested permissions exceed the current user permissions.'
      );
    }
  }

  async function validateResourceIds(resourceType, resourceIds) {
    // TODO: implement db lookup per type if the id exist.

    // check if guid is passed instead of id
    if (resourceType === 'Organization') {
      for (const id of resourceIds) {
        if (id.length > 10) {
          throw new errors.InvalidInput({
            message: 'Id type mismatch for the requested object type',
            data: {
              id,
              resourceType
            }
          });
        }
      }
    } else if (['Folder', 'SDO', 'SDOSchema'].includes(resourceType)) {
      for (const id of resourceIds) {
        if (!validator.isUUID(id)) {
          throw new errors.InvalidInput({
            message: 'Id type mismatch for the requested object type',
            data: {
              id,
              resourceType
            }
          });
        }
      }
    }
  }

  async function getACLForResources(context, args) {
    parsePaginationArgs(args);
    const { resourceType, ids } = args;
    const restrictionResult = await restrictContextOrganization(
      context,
      _.pick(args, ['ownerOrganization'])
    );
    // ?: Should we check if the resources exist? Is that enforced on the interface level with a scope directive?
    // currently non existing resources will not come back in the list
    args.orgId = restrictionResult.organizationId;

    // for Orgless Token
    args.skipCache =
      resUtil.getTokenType(context) === 'internal' && _.isNil(args.orgId);
    try {
      const res = await authACEDal.getACLForResources(args);
      return res;
    } catch (err) {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError({
        message: 'Error getting resource Access Control List',
        data: {
          ids,
          resourceType
        }
      });
    }
  }
  /**
   * @param  {} context
   * @param  {} args
   *   ids: array of ACE ids
   *   resourceIds: array of resource ids to remove all ACEs from
   */
  // ACE ids encode objectType::objectID::authGroupId::permissionSetId
  // persisted ACEs are always keyed by an auth group, so the revoked member is
  // initially recorded as that group; `_resolveRevokeAuditMembers` later rewrites
  // private user auth groups back to the original user so ACERevoke correlates
  // with ACEGrant. `ids` on the removeACEsFromResource mutation
  // is the ID scalar and accepts arbitrary strings, so only build an ACERevoke audit
  // entry for structurally well-formed ids (exactly four non-empty segments) — a
  // malformed id would otherwise emit a broken "Failed to revoke undefined from
  // undefined ..." message.
  function _buildRevokeAuditEntries(ids, resourceType) {
    const entries = [];
    let skipped = 0;
    for (const aceId of ids || []) {
      const segments = String(aceId).split('::');
      const [objectType, objectID, authGroupId, permissionSetId] = segments;
      const wellFormed =
        segments.length === 4 &&
        !!objectType &&
        !!objectID &&
        !!authGroupId &&
        !!permissionSetId;
      if (!wellFormed) {
        skipped += 1;
        continue;
      }
      entries.push({
        authPermissionSetId: permissionSetId,
        memberId: authGroupId,
        memberType: 'Group',
        resourceType,
        resourceId: objectID
      });
    }
    if (skipped > 0) {
      serviceContext.logger.debug(
        `removeACEsFromResources: skipped ${skipped} malformed ACE id(s) for ACERevoke audit`
      );
    }
    return entries;
  }

  // Resolve private (User-class) groups back
  // to their owning user via one batched lookup so ACERevoke records the original
  // user (matching ACEGrant).
  // a lookup failure leaves entries as the group member and never blocks or masks
  // the revoke itself.
  async function _resolveRevokeAuditMembers(entries) {
    try {
      const groupEntries = (entries || []).filter(
        (e) =>
          _.toLower(_.get(e, 'memberType')) === 'group' && _.get(e, 'memberId')
      );
      if (!groupEntries.length) {
        return;
      }

      const groupIds = _.uniq(groupEntries.map((e) => e.memberId));
      const owners = await authGroupDal.getPrivateAuthGroupOwners(groupIds);
      if (_.isEmpty(owners)) {
        return;
      }

      const userByGroupId = new Map(
        owners
          .filter((o) => _.get(o, 'id') && _.get(o, 'userId'))
          .map((o) => [o.id, o.userId])
      );
      for (const entry of groupEntries) {
        const userId = userByGroupId.get(entry.memberId);
        if (userId) {
          entry.memberId = userId;
          entry.memberType = 'User';
        }
      }
    } catch (err) {
      serviceContext.logger.debug(
        'removeACEsFromResources: could not resolve private-group owners for ACERevoke audit; falling back to group member'
      );
    }
  }

  async function removeACEsFromResources(context, args) {
    // Snapshot ACERevoke audit targets from the user-supplied ACE ids up front so
    // failures thrown before the RBAC-flag block (e.g. missing SDO schema id,
    // resource type not RBAC-enabled) are still audited
    // For resourceIds-only callers (internal cascade cleanups)
    // the affected ACEs aren't known until resolved inside the validation flow,
    // which repopulates auditState.entries.
    const auditState = {
      entries: _buildRevokeAuditEntries(args.ids, args.resourceType)
    };
    try {
      const acl = await _removeACEsFromResourcesWithValidation(
        context,
        args,
        auditState
      );
      await _resolveRevokeAuditMembers(auditState.entries);
      for (const audit of auditState.entries) {
        emitACERevokeEvent(context, audit, null);
      }
      return acl;
    } catch (err) {
      await _resolveRevokeAuditMembers(auditState.entries);
      for (const audit of auditState.entries) {
        emitACERevokeEvent(context, audit, err);
      }
      throw err;
    }
  }

  async function _removeACEsFromResourcesWithValidation(context, args, auditState) {
    if (_.isEmpty(args.ids) && _.isEmpty(args.resourceIds)) {
      throw new errors.InvalidInput({
        message: 'ACE or resource ids required',
        data: {
          args
        }
      });
    }

    if (args.resourceType === 'SDO' && _.isNil(args.dataRegistryId)) {
      if (_.isNil(args.resourceTypeSchemaId)) {
        throw new errors.InvalidInput({
          message: 'resourceTypeSchemaId is required for the SDO resource type.'
        });
      } else {
        args.dataRegistryId = args.resourceTypeSchemaId;
      }
    }

    const restrictionResult = await restrictContextOrganization(
      context,
      _.pick(args, ['ownerOrganization'])
    );
    const useRBACForResourceType = await useRBACFeatureForResourceType(context, restrictionResult, args.resourceType);
    if (!useRBACForResourceType) {
      throw new errors.NotAllowed({
        message: `RBAC is not enabled for resource type: ${args.resourceType}`
      });
    }

    // validate SDO schema existence
    if (args.resourceType === 'SDO' && args.dataRegistryId) {
      await serviceContext.dal.structuredData.getSchema(
        context,
        {
          id: args.dataRegistryId
        }
      );
    }

    args.orgId = restrictionResult.organizationId;
    args.userId = _.get(context._authInfo, 'userId');
    let acl;

    const org = await serviceContext.dal.organization.getOrganization(context, {
      id: args.orgId
    });

    const useRBACFeature = await mainUtil.isEnableFeatureInOrganization(
      context,
      org,
      args.orgId,
      'enableRBACFeature'
    );

    if (useRBACFeature) {
      const deleteArgs = {
        resourceType: args.resourceType,
        ids: args.ids,
        dataRegistryId: args.dataRegistryId
      };

      // if ids are not specified, get all the aces for the passed in resourceIds
      if (_.isEmpty(args.ids)) {
        acl = await authACEDal.getACLForResources({
          orgId: args.orgId,
          resourceType: args.resourceType,
          ids: args.resourceIds,
          skipCache: true
        });
        deleteArgs.ids = acl.records.map((ace) => ace.aceId);
        // resourceIds-only path: the affected ACE ids are only known now, so
        // (re)populate the audit targets from the resolved ids.
        auditState.entries = _buildRevokeAuditEntries(
          deleteArgs.ids,
          args.resourceType
        );
      }

      // ? Do we need to heck if the resources and ACEs exist?
      // Deleting non-existing object can be treated as no-op,
      let deletedIds = [];
      try {
        let deleted = await authACEDal.deleteACLForResources(deleteArgs);
        if (!Array.isArray(deleted)) {
          deleted = [];
        }
        deletedIds = deleted.map((x) => x.objectID);

        // Restrict the ACERevoke audit to ACEs the DAL flagged as actually
        // removed (its DELETE RETURNING set).
        const removed = new Set(
          deleted
            .filter((a) => a.removed)
            .map((a) => `${a.objectID}::${a.authGroupId}::${a.permissionSetId}`)
        );
        auditState.entries = (auditState.entries || []).filter((e) =>
          removed.has(`${e.resourceId}::${e.memberId}::${e.authPermissionSetId}`)
        );

        if (args.resourceType === 'TDO') {
          // emit event so secondary storages can reflect the ACES change
          await emitTDOACLChangedEvents(deletedIds);
        }

        if (args.resourceType === 'Folder') {
          await _invalidateAccessibleFolderCaches(context, deletedIds);
        }

        // Emit OLP update event for SDO resources
        if (args.resourceType === 'SDO' && deletedIds.length > 0 && args.dataRegistryId && args.orgId) {
          await emitSDOACLChangedEvents(deletedIds, args.dataRegistryId, args.orgId);
        }

        // return the list of remaining ACEs on the objects
        acl = await authACEDal.getACLForResources({
          orgId: args.orgId,
          resourceType: args.resourceType,
          ids: deletedIds,
          offset: args.offset || 0,
          limit: args.limit || 30,
          skipCache: true
        });

      } catch (err) {
        serviceContext.logger.error(err);
        if (err.name === 'invalid_input') {
          throw err;
        }
        throw new errors.InternalServerError({
          message: 'Error deleting resource Access Control Entries',
          data: {
            ids: args.ids
          }
        });
      }

      await _invalidateAnyPermissionSetRelatedCaches({
        organizationId: args.orgId,
        ignoreOrgPermissionMarkDirty:
          _.toLower(args.resourceType) !== 'organization',
        resourceIds: deletedIds,
      });
      return acl;
    }
  }

  async function hasPermissions(context, args, checkOrgPermission, options = {}) {
    const { auditAccessQuery = false } = options;
    const restrictionResult = await restrictContextOrganization(
      context,
      _.pick(args, ['ownerOrganization'])
    );
    args.orgGuid = restrictionResult.organizationGuid;
    args.orgId = restrictionResult.organizationId;
    const requestorId = _.get(context._authInfo, 'userId');

    // AIWARE_SUPERADMIN is cross-organization permission and as such it is not a persistent ACE on the org object
    if (
      _validateRightsForUser(context._authInfo, ['AIWARE_ADMIN_SUPERADMIN'])
    ) {
      return [
        {
          resourceType: args.resourceType,
          id: args.ids[0],
          hasPermission: true
        }
      ];
    }

    const isEnableRBACFeature = await mainUtil.isEnableFeatureInOrganization(
      context,
      undefined,
      args.orgId,
      'enableRBACFeature'
    );

    // check if it is a non-OLP organization
    if (!isEnableRBACFeature) {
      if (args.resourceType !== 'Organization') {
        throw new errors.InvalidInput({
          message: 'Only resourceType Organization allowed',
          data: {
            type: 'AuthPermissionCheck',
            resourceType: args.resourceType
          }
        });
      }

      if (resUtil.isSuperAdmin(context._authInfo)) {
        return [
          {
            resourceType: args.resourceType,
            id: args.ids[0],
            hasPermission: true
          }
        ];
      }

      if (args.ids[0] != args.orgId) {
        return [
          {
            resourceType: args.resourceType,
            id: args.ids[0],
            hasPermission: false
          }
        ];
      }
      const tokenType = resUtil.getTokenType({ _authInfo: context._authInfo });

      let hasPermission = false;
      if (['apikey', 'internal'].includes(tokenType)) {
        hasPermission = _validateRightsForUser(
          context._authInfo,
          args.permissions
        );
      } else if (tokenType === 'user') {
        hasPermission = funcPerms.rbacUtil.hasPermissions(
          context._authInfo.permissionMasks,
          args.permissions,
          false
        );
      }
      return [
        {
          resourceType: args.resourceType,
          id: args.ids[0],
          hasPermission
        }
      ];
    }

    // when it is an OLP organization
    args.authGroups = await _getUserOrgAuthGroupIds(
      context,
      args.userID,
      args.orgGuid
    );

    let result;
    try {
      result = await authACEDal.hasPermissions(args);
      if (
        checkOrgPermission &&
        _.find(result, (o) => o.hasPermission === false)
      ) {
        // check permissions on the org object
        const hasOrgRole = await authACEDal.hasOrgRolePermissions(args);
        if (hasOrgRole) {
          for (const r of result) {
            r.hasPermission = true;
          }
        }
      }
    } catch (err) {
      // ACEQuery: record the failed OLP access check before re-throwing.
      if (auditAccessQuery) {
        _emitACEQueryAudit(context, args, null, err);
      }
      throw new errors.InternalServerError({
        message: 'Error accessing resource Access Control Entries',
        data: {
          resourceType: args.resourceType,
          ids: args.ids,
          originalError: err.message
        }
      });
    }

    // ACEQuery: record each OLP access check (configurable, default OFF). Only
    // emitted from the caller-facing hasPermissions query — not internal
    // re-checks (e.g. scope-directive enforcement) — to avoid hot-path fan-out.
    // OLP-enabled orgs only. The superadmin and non-OLP-org
    // early returns above intentionally do NOT emit ACEQuery — cross-org
    // superadmin checks are not persistent ACEs and non-OLP orgs have no ACEs.
    if (auditAccessQuery) {
      _emitACEQueryAudit(context, args, result, null);
    }

    return result;
  }

  // hasPermissions accepts an unbounded `ids: [ID!]!` list, so a single caller
  // could otherwise trigger one ACEQuery publish per id and flood the public
  // events topic. Fold the checks into batches of this size — one audit event
  // per batch — bounding fan-out to ceil(N / size) (x2 on success, since we
  // split granted vs denied so access_granted stays meaningful per event).
  const ACE_QUERY_AUDIT_BATCH_SIZE = 10;

  /**
   * Emit ACEQuery audit events for an OLP access check, batched to cap fan-out.
   * On error every requested id failed identically, so they batch together. On
   * success results are grouped by access decision, then each group is batched.
   */
  function _emitACEQueryAudit(context, args, result, error) {
    // Audit the subject actually access-checked: the optional userID argument
    // when the caller checks another user's access, otherwise the requestor.
    const subjectId =
      _.get(args, 'userID') || _.get(context._authInfo, 'userId');
    const member = { id: subjectId, memberType: 'User' };

    if (error) {
      const resources = (args.ids || []).map((resourceId) => ({
        resourceType: args.resourceType,
        resourceId
      }));
      for (const batch of _.chunk(resources, ACE_QUERY_AUDIT_BATCH_SIZE)) {
        emitACEQueryEvent(context, { member, resources: batch }, error);
      }
      return;
    }

    const byDecision = _.groupBy(result || [], (r) =>
      r.hasPermission ? 'granted' : 'denied'
    );
    for (const [decision, group] of Object.entries(byDecision)) {
      const resources = group.map((r) => ({
        resourceType: r.resourceType || args.resourceType,
        resourceId: r.id
      }));
      for (const batch of _.chunk(resources, ACE_QUERY_AUDIT_BATCH_SIZE)) {
        emitACEQueryEvent(context, {
          member,
          resources: batch,
          accessGranted: decision === 'granted'
        });
      }
    }
  }

  // #endregion

  // #region high-level permission check functions

  // RBAC user auth groups cache type key - enables:
  // - L1 local cache (configurable via config.localCache.rbacAuthGroupsForMember)  
  // - L2 Redis cache with dirty marking for cross-service invalidation
  const AUTH_GROUP_MEMBER_CACHE_KEY = 'rbacAuthGroupsForMember';

  function _buildKeyForMember(orgId, memberId) {
    return `${orgId}:${memberId}`;
  }
  function _buildMarkedKeyForMember(type, orgId, memberId) {
    return `${type}:${orgId}:${memberId}`;
  }
  async function populateAuthContext(context, options = {}) {
    const resolvedGroups = _.get(context, '_authInfo.authGroups', []);
    if (
      !resolvedGroups.length ||
      (_.get(context, 'requestContext.authTokenType') === 'jwt' &&
        !_.get(context, 'requestContext.jwtToken.tokenApplicationId')) // re-fetch groups for non-application jwt tokens
    ) {
      const userId = _.get(context, '_authInfo.userId');

      context._authInfo.authGroups = await _getAuthGroupIdsByUserIdWithCache(
        context,
        userId,
        {
          orgGuid: _.get(options, 'orgGuid'),
          ignoreCache: true,
          addPrivateGroupsToContext: true
        }
      );
    }
    let tokenGroups;
    if (_.get(context, 'requestContext.authTokenType') === 'jwt') {
      tokenGroups = _.get(context, 'requestContext.jwtToken.authGroups');
    }
    if (_.get(context, 'requestContext.authTokenType') === 'apikey') {
      tokenGroups = _.get(context, 'requestContext.authGroups');
    }
    // Check token auth with token creator's auth, in case the user auth is updated, and ensure _authInfo has up to date auths
    if (tokenGroups) {
      _.set(
        context,
        '_authInfo.authGroups',
        _.intersection(tokenGroups, context._authInfo.authGroups)
      );
    }
    return context;
  }

  ///
  /**
   * Filter the ids based on presence of resourceRole for the requested resources
   * @param  {} context
   * @param  {Map<type:string, Object(ids: Set<String>, permissions: String[])>} resources
   * @param  {boolean} isReject
   * @returns {Map<type:string,ids:Set<String>>}: resources having the matching resource role for the auth context
   */
  async function hasResourceAuthRole(context, resources, isReject) {
    const resourceMap = new Map();
    const checkPromises = [];
    for (const [resourceType, resourceReq] of resources) {
      let ids = Array.from(resourceReq.ids);
      // fixup treeObjectIds passed as folderIds
      if (resourceType === 'Folder') {
        const folderIdMap = await dalFolder.getObjectIdsFromOpaqueIds(
          context,
          ids
        );
        ids = ids.map((id) => folderIdMap.get(id) || id);
      }
      checkPromises.push(
        hasPermissions(context, {
          resourceType,
          ids,
          permissions: resourceReq.permissions
          // TODO: requireAll
        }).then((grants) => {
          if (isReject) {
            for (const r of grants) {
              if (r.hasPermission === false) {
                return Promise.reject(r);
              }
            }
          }
          return Promise.resolve(grants);
        })
      );
    }
    const result = await Promise.all(checkPromises);

    result.forEach((authACLs) => {
      authACLs.forEach((item) => {
        if (item.hasPermission) {
          const oldSet = resourceMap.get(item.resourceType);
          if (oldSet) {
            resourceMap.set(item.resourceType, new Set([...oldSet, item.id]));
          } else {
            resourceMap.set(item.resourceType, new Set([item.id]));
          }
        }
      });
    });

    return resourceMap;
  }

  ///
  /**
   * Find matching organization role for any of the auth groups in the authContext
   * @param  {} authContext
   * @param  {String[]} orgRolePermissions
   * @returns {boolean}
   */
  async function hasOrganizationAuthRole(context, orgRolePermissions, options) {
    await populateAuthContext(context);
    const orgId = _.get(context._authInfo, 'organization.organizationId');
    const authGroupIds = _.get(context._authInfo, 'authGroups');

    return await checkAuthGroupsForOrganizationPermissions(
      context,
      orgId,
      authGroupIds,
      orgRolePermissions,
      options
    );

    // const options = {
    //   authGroupIds: _.get(context._authInfo, 'authGroups'),
    //   orgGuid: getOrgGuid(context),
    //   orgId: _.get(context._authInfo, 'organization.organizationId'),
    //   permissions: orgRolePermissions
    //   // TODO: requireAll
    // };

    // return await authACEDal.hasOrgRolePermissions(options);
  }

  async function emitSDOACLChangedEvents(ids, dataRegistryId, organizationId) {
    const events = [];
    for (const id of ids) {
      events.push(
        messageUtil.emitEvent(
          {
            serviceName: 'core-graphql-server',
            event: 'sdo_acl_changed',
            type: 'structuredData',
            sdoId: id,
            dataRegistryId,
            organizationId
          },
          messageUtil.topics('EVENTS')
        )
      );
    }
    return Promise.all(events);
  }

  async function emitTDOACLChangedEvents(ids) {
    const events = [];
    for (const id of ids) {
      events.push(
        messageUtil.emitEvent(
          {
            serviceName: 'core-graphql-server',
            event: 'recording_acl_changed',
            type: 'recording',
            recordingId: id
          },
          messageUtil.topics('EVENTS')
        )
      );
    }
    return Promise.all(events);
  }

  async function emitTDOReIndexEvents(context, orgId, ids) {
    const token =
      _.get(context, 'requestContext.userInfo.data.apiToken') ||
      _.get(context, 'requestContext.userInfo.apiToken') ||
      context.requestContext.authToken;
    const organizationId = orgId ? parseInt(orgId) : null;
    const addToIndex = await serviceContext.dal.organization.getDefaultAddToIndexForOrg(
      context,
      orgId
    );

    const events = [];
    for (const id of ids) {
      events.push(
        messageUtil.emitEvent(
          {
            serviceName: 'core-graphql-server',
            event: 'recording_cognition_completed',
            type: 'recording',
            recordingId: id,
            organizationId,
            payload: {
              recordingId: id,
              token: token,
              organizationId,
              addToIndex
            }
          },
          messageUtil.topics('EVENTS')
        ),
        // emit a delayed remediation event in the case of elasticsearch opportunistic
        // version control discards the changes of the event above due to another indexing event writing docs
        // at the same time.
        messageUtil.emitEvent(
          {
            serviceName: 'core-graphql-server',
            event: 'recording_acl_changed',
            type: 'recording',
            recordingId: id
          },
          messageUtil.topics('EVENTS'),
          1 * 60 * 1000
        )
      );
    }
    return Promise.all(events);
  }

  ///
  /**
   * Find the concrete triples <resourceId, groupId, roleId> from the granted access resources
   * and log that in the audit trail
   * @param  {} authContext
   */
  async function emitAuthSuccessViaResourceRole(authContext, resources) {
    // TODO: implement;
    serviceContext.logger.debug(
      'RBAC: Resource Access Granted',
      authContext,
      resources
    );
  }

  ///
  /**
   * Find the exact tuples <GroupId, OrganizationRole> satisfying the requested orgPermissions
   * and log that in the audit trail
   * @param  {} context
   */
  async function emitAuthSuccessViaOrgRole(context, resources, orgPermissions) {
    const authGroups = _.get(context, '_authInfo.authGroups', []);
    serviceContext.logger.debug(
      'RBAC: Resource Access granted (OrgRole)',
      { authGroups },
      resources,
      orgPermissions
    );
  }

  ///
  /**
   * Write auth failure audit log and record a FedRAMP AuthorizationDenied audit
   * event for each denied resource at the @requireAuthRole directive gate.
   *
   * @param {*} context
   * @param {Map<string,{ids:Set}>} resources map of resourceType -> requested ids
   * @param {Error} [failed] the underlying denial error (used only for the reason
   *   string; NOT passed as the audit error, which is reserved for emit failures)
   *
   * Emission is best-effort: the audit helper is fully guarded and never throws,
   * so an access denial is never masked.
   */
  async function emitAuthFailure(context, resources, failed) {
    const authGroups = _.get(context, '_authInfo.authGroups', []);
    serviceContext.logger.warn(
      'RBAC: Resource Access Denied',
      { authGroups },
      resources
    );

    const member = {
      id: _.get(context, '_authInfo.userId'),
      memberType: 'User'
    };
    const reason =
      _.get(failed, 'message') || 'No authorization access role found';
    const emitDenied = (resourceType, resourceId) =>
      emitAuthorizationDeniedEvent(context, {
        member,
        resourceType: resourceType || null,
        resourceId: resourceId || null,
        reason
      });

    // Unpack the resource map into one event per (resourceType, resourceId).
    // When the denial has no specific resource target (e.g. org-role-only
    // fields), still record a single denial so the caller's rejection is audited.
    if (resources && typeof resources.entries === 'function' && resources.size) {
      for (const [resourceType, value] of resources) {
        const ids = _.get(value, 'ids');
        const idList = ids ? Array.from(ids) : [];
        if (idList.length) {
          for (const resourceId of idList) {
            emitDenied(resourceType, resourceId);
          }
        } else {
          emitDenied(resourceType, null);
        }
      }
    } else {
      emitDenied(null, null);
    }
  }

  async function filterAuthGroupIdsByRights(context, options) {
    let rights = _.get(options, 'rights', []);
    let orgGuid;
    const tokenType = resUtil.getTokenType(context);
    const isInternalToken = tokenType === 'internal';

    if (_.isEmpty(rights)) {
      throw new errors.InvalidInput({
        message: 'Rights cannot be null or empty',
        data: {
          objectType: 'Rights',
          objectId: rights
        }
      });
    }

    if (resUtil.isSuperAdmin(context._authInfo) || isInternalToken) {
      if (_.isNil(options.orgId)) {
        throw new errors.InvalidInput({
          message: 'orgId is required for superadmin.',
          data: {
            userId: options.orgId
          }
        });
      }

      orgGuid = await serviceContext.dal.application.getAppIdFromOrgId(
        options.orgId
      );
    } else {
      orgGuid = getOrgGuid(context);
    }

    // get user's auth groups from redis cache
    const authGroupIds = await _getAuthGroupIdsByUserIdWithCache(
      context,
      options.userId,
      { orgGuid, orgId: options.orgId }
    );

    const formattedRights = rights.reduce((newRights, r) => {
      if (typeof r === 'string') {
        const right = r.replace(/\:/g, '.');

        newRights.add(right);
      }

      return newRights;
    }, new Set());
    const permissionEnums = fpUtil.mapPermissionEnumByKeys(
      Array.from(formattedRights)
    );
    const authACLs = await authACEDal.getAuthACLByResourceIdsAndPerms({
      orgId: options.orgId,
      ids: options.ids,
      resourceType: options.resourceType,
      authGroupIds,
      permissions: permissionEnums
    });

    return _.uniq(_.map(authACLs, 'authGroupId'));
  }

  async function buildAuthFilter(context, options) {
    // Get auth groups that the user is member of
    await populateAuthContext(context);
    const authGroupIds = _.get(context._authInfo, 'authGroups');
    if (!authGroupIds) {
      return;
    }

    // Get permission sets that have options.role permissions
    const permissionSets = await authPermissionDal.getAuthPermissionSets({
      organizationGuid: getOrgGuid(context),
      hasPermissions: options.roles,
      limit: 200
    });
    if (!permissionSets) {
      return;
    }
    const permissionSetIds = _.map(permissionSets, (x) => x.id);

    if (options.resourceType === 'SDO') {
      return (idField, argNum, idParentField) => {
        const joinConditions = [`${idField} = _acl_sdo_.sdo_id`];

        // add an access check through an ACE on the parent
        if (options.parentType === 'SDOSchema') {
          joinConditions.push(`${idParentField} = _acl_sdo_.data_registry_id`);
        }
        const existsCondition = `EXISTS (
          SELECT 1
          FROM public.acl_sdo _acl_sdo_
          WHERE (${joinConditions.join(' OR ')})
            AND _acl_sdo_.auth_group_id = ANY($${argNum}::uuid[])
            AND _acl_sdo_.permission_set_id = ANY($${argNum + 1}::uuid[])
        )`;

        // access object through ACE on itself or its parent
        return {
          join: '',
          where: existsCondition,
          args: [authGroupIds, permissionSetIds],
          metadata: {
            resourceType: options.resourceType
          }
        };
      };
    }

    if (options.resourceType === 'Folder') {
      return (idField, argNum) => {
        const existsCondition = `EXISTS (
          SELECT 1
          FROM public.rbac_folders _rf_
          WHERE ${idField} = _rf_.folder_id
            AND _rf_.auth_group_id = ANY($${argNum}::uuid[])
            AND _rf_.permission_set_id = ANY($${argNum + 1}::uuid[])
        )`;

        return {
          join: '',
          where: existsCondition,
          args: [authGroupIds, permissionSetIds],
          metadata: {
            resourceType: options.resourceType,
          }
        };
      };
    }
    return (idField, argNum) => {
      const existsCondition = `EXISTS (
        SELECT 1
        FROM rbac.acl_recording _acl_r_
        WHERE (${idField})::text = _acl_r_.recording_id
          AND _acl_r_.auth_group_id = ANY($${argNum}::uuid[])
          AND _acl_r_.permission_set_id = ANY($${argNum + 1}::uuid[])
      )`;

      return {
        join: '',
        where: existsCondition,
        args: [authGroupIds, permissionSetIds],
        metadata: {
          resourceType: options.resourceType
        }
      };
    };
  }

  async function inheritResourceACEs(context, options) {
    if (!options.source || !_.isArray(options.targets)) {
      throw new errors.InvalidInput({
        message: 'source and target are required for permission inheritance'
      });
    }
    const orgGuid = getOrgGuid(context);
    const userId = _.get(context._authInfo, 'userId') || orgGuid;
    const targets = [];
    const tdoIds = [];
    const folderIds = [];

    for (const t of options.targets) {
      let ids = t.id;
      if (!_.isNil(ids)) {
        if (!Array.isArray(ids)) {
          ids = [ids];
        }

        if (t.type === 'TDO') {
          tdoIds.push(...ids);
        } else if (t.type === 'Folder') {
          folderIds.push(...ids);
        }
      }
    }
    if (options.source.type === 'Folder') {
      folderIds.push(options.source.id);
    }
    if (folderIds.length > 0) {
      // map passed in ids that are occasionally tree_object_ids to folderIds
      const folderIdMap = await dalFolder.getObjectIdsFromOpaqueIds(
        context,
        folderIds
      );
      if (options.source.type === 'Folder') {
        options.source.id =
          folderIdMap.get(options.source.id) || options.source.id;
      }
      for (const t of options.targets) {
        if (t.type === 'Folder') {
          t.id = folderIdMap.get(t.id) || t.id;
        }
      }
    }

    const targetIds = [];

    for (const t of options.targets) {
      if (t.id) {
        targetIds.push(t.id);
        targets.push(
          authACEDal.inheritResourceACEs({
            source: options.source,
            target: t,
            userId,
            unsupportedAuthClasses: ['User'] // prevent inheriting owner ACEs
          })
        );
      }
    }
    await Promise.all(targets);
    let orgId;
    // Emit events so the elasicsearch index is updated
    if (tdoIds.length) {
      orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
        orgGuid
      );
      // Since this is new tdos there is a index tdo event in flight that is
      // possible to not have the ACLs, because is already processing and called getACEs.
      // Can't emit acl_changed event since that may complete before the tdo index event
      // and be a non-op since that is update to existing docs, that haven't been created yet
      await emitTDOReIndexEvents(context, orgId, tdoIds);
    }

    const folderTargets = options.targets.filter((t) => t.type === 'Folder');
    const targetFolderIds = _.map(folderTargets, 'id');

    if (options.source.type === 'Folder' && targetFolderIds.length > 0) {
      await _invalidateAccessibleFolderCaches(context, targetFolderIds);
    }

    await _invalidateAnyPermissionSetRelatedCaches({
      organizationId: orgId,
      organizationGuid: orgGuid,
      ignoreOrgPermissionMarkDirty:
        _.toLower(options.source.type) !== 'organization',
      resourceIds: targetIds,
    });
  }

  async function _getAuthGroupIdsByUserIdWithCache(context, userId, options) {
    const orgGuid = _.get(options, 'orgGuid') || getOrgGuid(context);
    let orgId =
      _.get(options, 'orgId') ||
      _.get(context, '_authInfo.organization.organizationId');
    const cacheKey = _buildKeyForMember(orgId, userId);
    const markedKey = _buildMarkedKeyForMember(
      AUTH_GROUP_MEMBER_CACHE_KEY,
      orgId,
      userId
    );

    const {
      asyncGetCacheValue,
      asyncRefreshCacheValue
    } = await mainUtil.validateCacheKey(
      markedKey,
      AUTH_GROUP_MEMBER_CACHE_KEY,
      cacheKey,
      {
        useL1Cache: true,
        ttlMinL2Override: 30, // 30 minutes TTL for L2 cache
      }
    );

    let authGroups = await asyncGetCacheValue();
    let authGroupIds = [];
    // performance: in some case, should not fetch data when the cached data is empty
    const ignoreCache =
      _.get(options, 'ignoreCache', false) && _.isEmpty(authGroups);

    if (_.isNil(authGroups) || ignoreCache) {
      const listGroups = await authGroupDal.getAuthGroupsContainingMember(
        userId,
        { orgGuid }
      );
      authGroups = _.get(listGroups, 'records', []);
      await asyncRefreshCacheValue(authGroups);
    }

    if (
      ignoreCache &&
      options.addPrivateGroupsToContext &&
      !_.isEmpty(authGroups)
    ) {
      context._authInfo.privateAuthGroups = [];
      _.forEach(authGroups, (ag) => {
        if (_.toLower(ag.authClass) === 'user') {
          context._authInfo.privateAuthGroups.push(ag.id);
        }
      });
    }

    authGroupIds = _.map(authGroups, 'id');

    return authGroupIds;
  }

  function _validatePermissionRole(role) {
    return !_.isNull(role) && !_.isEmpty(_.get(role, 'name', ''));
  }

  async function emitReloadSessionAuthGroupsEvent(organizationGuid, options) {
    let authGroupIds = options.authGroupIds;

    if (!organizationGuid || !validator.isUUID(organizationGuid)) {
      throw new errors.InvalidInput({
        message: `organizationGuid must be specified and be a valid UUID: ${organizationGuid}`
      });
    }

    if (_.isEmpty(authGroupIds) && !_.isEmpty(options.permissionSetIds)) {
      const organizationId = await serviceContext.dal.organization.getOrgIdFromAppId(
        organizationGuid
      );
      authGroupIds = await authACEDal.getAuthGroupIdsByPermissionSets(
        options.permissionSetIds,
        organizationId
      );
    }

    authGroupIds = _.uniq(authGroupIds);

    if (!_.isEmpty(authGroupIds)) {
      const event = {
        type: 'session',
        event: 'reload_session_auth_groups',
        authGroupIds,
        organizationGuid
      };
      serviceContext.messageUtil.emitEvent(event, 'SessionsTopic');
    }
  }

  function emitReloadSessionUsersEvent(organizationGuid, userIds) {
    if (!organizationGuid || !validator.isUUID(organizationGuid)) {
      throw new errors.InvalidInput({
        message: `organizationGuid must be specified and be a valid UUID: ${organizationGuid}`
      });
    }

    if (!_.isEmpty(userIds)) {
      const event = {
        type: 'session',
        event: 'reload_session_users',
        userIds,
        organizationGuid
      };
      serviceContext.messageUtil.emitEvent(event, 'SessionsTopic');
    }
  }

  // #endregion

  // #region invalidationCache
  async function _invalidateAnyPermissionSetRelatedCaches(options) {
    const {
      organizationId,
      organizationGuid,
      ignoreOrgPermissionMarkDirty,
      resourceIds = []
    } = options;
    let orgId = organizationId;
    if (
      _.isNil(orgId) &&
      !_.isNil(organizationGuid) &&
      validator.isUUID(organizationGuid)
    ) {
      orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
        organizationGuid
      );
    }

    if (_.isNil(orgId)) {
      throw new Error('orgId is required');
    }

    const orgPermissionsMarkedKey = _buildMarkedKey(
      ORGANIZATION_PERMISSIONS_MASK_KEY,
      orgId
    );

    await Promise.all([
      ignoreOrgPermissionMarkDirty
        ? undefined
        : redisCache.markCacheDirty(orgPermissionsMarkedKey),
      authACEDal.markCacheDirtyForGetACLForResources(orgId, resourceIds),
      authACEDal.markCacheDirtyForHasPermissions(orgId, resourceIds)
    ]);
  }

  async function _invalidateAnyAuthGroupRelatedCaches(options) {
    const {
      members,
      organizationId,
      organizationGuid,
      ignoreACEHasPermissionMarkDirty,
      ignoreACLForResourcesMarkDirty,
      resourceIds = []
    } = options;
    let orgId = organizationId;

    if (_.isNil(organizationGuid)) {
      throw new Error('organizationGuid is required');
    }

    if (_.isNil(orgId)) {
      orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
        organizationGuid
      );
    }

    if (_.isNil(orgId)) {
      throw new Error('orgId is required');
    }

    const tasks = [];
    // invalidate cache for getAuthGroups
    tasks.push(() =>
      authGroupDal.markCacheDirtyForGetAuthGroups(organizationGuid)
    );

    if (!ignoreACEHasPermissionMarkDirty) {
      tasks.push(() => authACEDal.markCacheDirtyForHasPermissions(orgId, resourceIds));
    }

    // for delete a group need to clear getACLForResources cache
    if (!ignoreACLForResourcesMarkDirty) {
      tasks.push(() => authACEDal.markCacheDirtyForGetACLForResources(orgId, resourceIds));
    }

    // invalidate cache for user's auth groups
    if (!_.isEmpty(members)) {
      for (const m of members) {
        if (_.toLower(m.memberType) === 'user') {
          const markedKey = _buildMarkedKeyForMember(
            AUTH_GROUP_MEMBER_CACHE_KEY,
            orgId,
            m.id
          );
          tasks.push(() => redisCache.markCacheDirty(markedKey));
        } else {
          // TODO: invalidate auth group member cache
        }
      }
    }

    await Promise.all(tasks.map((job) => job()));
  }

  async function _invalidateAccessibleFolderCaches(context, folderIds) {
    if (_.isEmpty(folderIds)) {
      return [];
    }

    const folderIdMap = await serviceContext.dal.folder.getObjectIdsFromOpaqueIds(
      context,
      folderIds
    );
    // invalidate cache for folderId and treeObjectId
    const idSet = new Set([...folderIdMap.keys(), ...folderIds]);
    const cacheKeys = [...idSet].map(
      (folderId) => `ACCESSIBLE_FOLDER_IN_OLP:${folderId}`
    );

    serviceContext.redisClient.del(...cacheKeys, (err) => {
      if (err) {
        serviceContext.logger.error(
          'error on during invalidate accessible folder caches: ',
          err
        );
      }
    });
  }

  function _validateRightsForUser(authInfo, permissions) {
    const rights = fpUtil.mapPermissionKeyByEnums(permissions) || [];
    return rights.some((right) => mainUtil.hasPerm(right, authInfo));
  }

  /**
   * Throw a restriction error and return the restriction result
   * for context organization and opt.ownerOrganization.
   *
   * @param {*} context
   * @param {*} opt
   * @returns {{ organizationGuid: string, organizationId: number }}
   */
  async function restrictContextOrganization(context, opt = {}) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isInternalToken = resUtil.getTokenType(context) === 'internal';
    const requestorOrgGuid =
      _.get(context, '_authInfo.applicationId') ||
      _.get(context, '_authInfo.organization.organizationGuid');
    const requestorOrganizationId = _.get(
      context._authInfo,
      'organization.organizationId'
    );
    const allowInternalToken = _.get(opt, 'allowInternalToken', true);
    let organizationGuid = requestorOrgGuid || opt.organizationGuid;
    let ownerOrgField = opt.ownerOrganization;

    // convert orgId to orgGuid
    if (
      ownerOrgField &&
      (!_.isString(ownerOrgField) || !validator.isUUID(ownerOrgField))
    ) {
      ownerOrgField = await serviceContext.dal.application.getAppIdFromOrgId(
        ownerOrgField
      );
    }

    // a super-admin or an internal token can use OLP feature on an arbitrary org
    if ((isSuperAdmin || isInternalToken) && ownerOrgField) {
      organizationGuid = ownerOrgField;
    } else if (
      (!organizationGuid || _.isNil(organizationGuid)) &&
      requestorOrganizationId
    ) {
      organizationGuid = await serviceContext.dal.application.getAppIdFromOrgId(
        requestorOrganizationId
      );
    }

    // for the internalToken with allowInternalToken option, only retrieve from context and not throw an error.
    if (isInternalToken && allowInternalToken && !ownerOrgField) {
      return {
        organizationGuid: requestorOrgGuid,
        organizationId: requestorOrganizationId
      };
    }

    if (_.isEmpty(organizationGuid)) {
      throw new errors.InvalidInput({
        message: `Unable to get organizationGuid`
      });
    }

    // throw error if a non-superadmin tries to get access to other organizations using the ownerOrganization field.
    if (ownerOrgField && organizationGuid !== ownerOrgField) {
      throw new errors.AuthorizationError({
        message: 'Access to field ownerOrganization requires superadmin rights'
      });
    }

    const organizationId = await serviceContext.dal.organization.getOrgIdFromAppId(
      organizationGuid
    );

    return { organizationGuid, organizationId: _.toNumber(organizationId) };
  }

  async function getMaskForOrgRoleLookup(context, orgId, groupIds) {
    // 1. get mask from context auth groups
    let mask = await authGroupDal.getAuthGroupsPermissionMaskForOrganization(
      orgId,
      groupIds
    );

    // 2. append super admin mask for super admin
    // since the SuperAdmin app role isn't created automatically when the root org differs from the requester organization.
    if (
      resUtil.isSuperAdmin(context._authInfo) &&
      !dalUtil.isRootOrganization(context)
    ) {
      const rootOrgId = _.get(serviceContext, 'config.flyway.rootOrgId');
      const roleRes = await serviceContext.dal.role.getRoles(
        context,
        {
          id: SUPER_ADMIN_ROLE_ID,
          organizationIds: [rootOrgId]
        },
        true
      );
      const superAdminMask = _.get(roleRes, 'records[0].permissions', []);

      if (!_.isEmpty(superAdminMask)) {
        const superAdminKeys = _.filter(
          fpUtil.permissionMaskToKeys(superAdminMask, true),
          _.isString
        );
        const orgRoleKeys = fpUtil.permissionMaskToKeys(mask, true);
        mask = fpUtil.getPermissionMask(
          _.uniq([...orgRoleKeys, ...superAdminKeys])
        );
      }
    }

    return mask;
  }

  // #endregion

  // #region App roles
  async function deleteAppRoleAuthObjectsTx(roleIds, options = {}) {
    const {
      ssoDbClient,
      coreDbClient,
      organizationId,
      organizationGuid
    } = options;
    if (_.isNil(ssoDbClient) || _.isNil(coreDbClient)) {
      throw new Error('missing DB clients');
    }

    if (_.isEmpty(roleIds)) {
      throw new Error('roleIds is required.');
    }

    if (_.isNil(organizationId) || _.isNil(organizationGuid)) {
      throw new Error('organizationId and organizationGuid are required.');
    }

    // select appRole auth groups and permission sets
    const selectQueries = [
      ssoDbClient.map(
        'SELECT auth_group_id AS id FROM public.rbac_auth_group WHERE role_id = ANY($1::uuid[]) AND organization_guid = $2;',
        [roleIds, organizationGuid],
        (row) => row.id
      ),
      ssoDbClient.map(
        'SELECT permission_set_id AS id FROM public.rbac_permission_set WHERE role_id = ANY($1::uuid[]) AND organization_guid = $2;',
        [roleIds, organizationGuid],
        (row) => row.id
      )
    ];
    const [authGroupIds, permissionSetIds] = await Promise.all(selectQueries);

    const _delACEs = async (columnName, conditionIds) => {
      const groupDeletedACEs = {
        TDO: []
      };
      const deletedACEs = await ssoDbClient.any(
        `
        DELETE FROM public.rbac_acl WHERE ${columnName} = ANY($1::uuid[])
        RETURNING permission_set_id, auth_group_id, object_type, id_text;
        `,
        [conditionIds]
      );

      _.forEach(deletedACEs, (ace) => {
        if (ace.object_type === 'recording') {
          groupDeletedACEs.TDO.push(ace);
        }
      });

      return groupDeletedACEs;
    };

    // 1. delete ACEs related appRole auth groups
    // should not be called parallel to avoid returning duplicated ACEs.
    const deletedRecordingACEs = [];
    const appRolePromises = [];
    let removedMemberIds = [];
    if (!_.isEmpty(authGroupIds)) {
      const [deletedACEs, deletedMemberIds] = await Promise.all([
        _delACEs('auth_group_id', authGroupIds),
        ssoDbClient.map(
          `
          DELETE FROM public.rbac_auth_group_member
          WHERE auth_group_id = ANY($1::uuid[]) AND member_type = 'user'::rbac_member_type
          RETURNING member_id AS id;
          `,
          [authGroupIds],
          (row) => row.id
        ),
        ssoDbClient.none(
          'DELETE FROM public.organization_registration_domain_settings WHERE auth_group_id = ANY($1::uuid[]);',
          [authGroupIds]
        )
      ]);
      appRolePromises.push(
        ssoDbClient.none(
          'DELETE FROM public.rbac_auth_group WHERE auth_group_id = ANY($1::uuid[]);',
          [authGroupIds]
        )
      );
      deletedRecordingACEs.push(...deletedACEs.TDO);
      removedMemberIds = deletedMemberIds;
    }

    // 2. delete ACEs related appRole permission sets
    // should not be called parallel to avoid returning duplicated ACEs.
    if (!_.isEmpty(permissionSetIds)) {
      const deletedACEs = await _delACEs('permission_set_id', permissionSetIds);
      deletedRecordingACEs.push(...deletedACEs.TDO);
      appRolePromises.push(
        ssoDbClient.none(
          'DELETE FROM public.rbac_permission_set WHERE permission_set_id = ANY($1::uuid[]);',
          [permissionSetIds]
        )
      );
    }

    // delete ACEs from join tables
    if (!_.isEmpty(deletedRecordingACEs)) {
      await authACEDal.deleteAclsFromJoinTables(
        'TDO',
        deletedRecordingACEs,
        coreDbClient
      );
    }

    // 3. delete appRole AG(s) and PS(s).
    if (!_.isEmpty(appRolePromises)) {
      await Promise.all(appRolePromises);
    }

    // 4. mark the dirty cache with the same behavior as:
    // deleteAuthPermissionSet, deleteAuthGroup, and removeACEsFromResources.
    const memberUsers = _.map(removedMemberIds, (userId) => {
      return { id: userId, memberType: 'user' };
    });
    await Promise.allSettled([
      authPermissionDal.markCacheDirtyForGetAuthPermissionSets(
        organizationGuid
      ),
      _invalidateAnyPermissionSetRelatedCaches({
        organizationId
      }),
      _invalidateAnyAuthGroupRelatedCaches({
        organizationGuid,
        organizationId,
        members: memberUsers
      })
    ]);

    return {
      removedMemberIds
    };
  }

  // #region New Methods for RBAC Resolvers

  const PERMISSION_GRANT_TYPE_ORDER = {
    Direct: 0,
    GroupMembership: 1,
    OrganizationRole: 2
  };

  const PERMISSIONS_FOR_RESOURCE_TYPE = {
    tdo: [
      'AIWARE_TDO_CREATE',
      'AIWARE_TDO_DELETE',
      'AIWARE_TDO_READ',
      'AIWARE_TDO_SEARCH',
      'AIWARE_TDO_UPDATE'
    ],
    folder: [
      'AIWARE_FOLDER_CREATE',
      'AIWARE_FOLDER_DELETE',
      'AIWARE_FOLDER_READ',
      'AIWARE_FOLDER_FILE',
      'AIWARE_FOLDER_UPDATE'
    ],
    sdo: [
      'AIWARE_SDO_CREATE',
      'AIWARE_SDO_DELETE',
      'AIWARE_SDO_READ',
      'AIWARE_SDO_UPDATE'
    ],
    source: [
      'AIWARE_SOURCES_CREATE',
      'AIWARE_SOURCES_DELETE',
      'AIWARE_SOURCES_READ',
      'AIWARE_SOURCES_UPDATE'
    ],
    organization: [
      'ADMIN_ORG_CREATE',
      'ADMIN_ORG_READ',
      'ADMIN_ORG_UPDATE',
      'ADMIN_ACCESS'
    ],
    engine: [
      'DEVELOPER_ENGINE_CREATE',
      'DEVELOPER_ENGINE_DELETE',
      'DEVELOPER_ENGINE_READ',
      'DEVELOPER_ENGINE_UPDATE',
      'DEVELOPER_ENGINE_ENABLE',
      'DEVELOPER_ENGINE_DISABLE'
    ],
    library: [
      'AIWARE_PACKAGE_CREATE',
      'AIWARE_PACKAGE_READ',
      'AIWARE_PACKAGE_UPDATE',
      'AIWARE_PACKAGE_DELETE'
    ],
    dataset: [
      'AIWARE_SCHEMA_CREATE',
      'AIWARE_SCHEMA_DELETE',
      'AIWARE_SCHEMA_READ',
      'AIWARE_SCHEMA_SEARCH',
      'AIWARE_SCHEMA_UPDATE'
    ],
    application: [
      'DEVELOPER_BUILD_CREATE',
      'DEVELOPER_BUILD_DELETE',
      'DEVELOPER_BUILD_READ',
      'DEVELOPER_BUILD_UPDATE',
      'DEVELOPER_BUILD_APPROVE',
      'DEVELOPER_BUILD_DEPLOY'
    ]
  };

  /**
   * Validates input parameters for resource permissions audit
   * @param {Object} context - GraphQL context
   * @param {Object} args - Input arguments
   * @returns {Promise<Object>} Validated organization info and user ID
   */
  async function _validateResourcePermissionsAuditInput(context, args) {
    const {
      userID,
      ownerOrganization
    } = args;

    if (
      (userID || ownerOrganization) &&
      !resUtil.isSuperAdmin(context._authInfo)
    ) {
      throw new errors.AuthorizationError({
        message:
          'Access to field ownerOrganization and userID require superadmin rights'
      });
    }

    if ((userID && !ownerOrganization) || (!userID && ownerOrganization)) {
      throw new errors.InvalidInput({
        message: 'Both userID and ownerOrganization must be provided'
      });
    }

    const orgInfo = await restrictContextOrganization(
      context,
      _.pick(args, ['ownerOrganization'])
    );

    const isEnableRBACFeature = await mainUtil.isEnableFeatureInOrganization(
      context,
      undefined,
      orgInfo.organizationId,
      'enableRBACFeature'
    );

    if (!isEnableRBACFeature) {
      throw new errors.AuthorizationError({
        message: 'RBAC feature is not enabled for this organization'
      });
    }

    const resolvedUserID = userID || _.get(context, '_authInfo.userId');

    return { orgInfo, resolvedUserID };
  }

  /**
   * Fetches ACL data for both resource and organization
   * @param {Object} orgInfo - Organization information
   * @param {Object} resource - Resource to audit
   * @param {Array} authGroupIds - Auth group IDs for the user
   * @param {Array} permissions - Permissions to check
   * @returns {Promise<Array>} Combined ACL records for the object type and the organization
   */
  async function _fetchResourceAndOrgACLs(orgInfo, resource, authGroupIds, permissions) {
    const [resAcl, resOrg] = await Promise.all([
      authACEDal.getACLForResources({
        orgId: orgInfo.organizationId,
        orgGuid: orgInfo.organizationGuid,
        resourceType: resource.resourceType,
        ids: [resource.resourceId],
        authGroups: authGroupIds,
        permissions,
        requireAll: false,
        offset: 0,
        limit: 100
      }),
      authACEDal.getACLForResources({
        orgId: orgInfo.organizationId,
        orgGuid: orgInfo.organizationGuid,
        resourceType: 'organization',
        ids: [orgInfo.organizationId.toString()],
        authGroups: authGroupIds,
        permissions,
        requireAll: false,
        offset: 0,
        limit: 100
      })
    ]);

    return [
      ..._.get(resAcl, 'records', []),
      ..._.get(resOrg, 'records', [])
    ];
  }

  /**
   * Processes ACEs and builds permission set and auth group maps
   * @param {Array} aclRecords - ACL records to process
   * @returns {Object} Maps for ACEs by permission set and auth groups
   */
  function _processACEsAndBuildMaps(aclRecords) {
    const acesByPermissionSet = new Map();
    const authGroups = new Map();

    for (const item of aclRecords) {
      const aceList = acesByPermissionSet.get(item.permissionSetId) || [];
      aceList.push(item);
      acesByPermissionSet.set(item.permissionSetId, aceList);
      authGroups.set(item.authGroupId, {
        id: item.authGroupId,
        memberType: 'group'
      });
    }

    return { acesByPermissionSet, authGroups };
  }

  /**
   * Inflates auth objects (groups and users) and handles private groups
   * @param {Object} context - GraphQL context
   * @param {Map} authGroups - Auth groups map
   * @param {Map} acesByPermissionSet - ACEs by permission set map
   * @param {Object} orgInfo - Organization information
   * @returns {Promise<Object>} Maps for auth groups, users, and permission sets
   */
  async function _inflateAuthGroupsAndUsers(context, authGroups, acesByPermissionSet, orgInfo) {
    const [memberDetails, authPermissionSets] = await Promise.all([
      getMembers(context, Array.from(authGroups.values()), true, {}),
      authPermissionDal.getAuthPermissionSets({
        ids: Array.from(acesByPermissionSet.keys()),
        organizationGuid: orgInfo.organizationGuid
      })
    ]);

    const userIds = new Map();
    for (const m of memberDetails) {
      if (m.member.authClass === 'User') {

        let userId = m.member.createdBy; // fallback to the group creator
        try {
          const userIds = await authGroupDal.getAuthGroupMemberIds(
            [m.member.id],
            {
              memberType: 'User',
            }
          );
          if (Array.isArray(userIds)) {
            userId = userIds[0];
          }
        } catch (err) {
          serviceContext.logger.warn('Failed to resolve private group user', err);
        }

        userIds.set(userId, {
          id: userId,
          memberType: 'user',
          privateGroupId: m.id
        });
      } else {
        authGroups.set(m.id, m.member);
      }
    }

    const users = new Map();
    if (userIds.size) {
      const userDetails = await getMembers(context, Array.from(userIds.values()), true, {});
      for (const ud of userDetails) {
        const u = userIds.get(ud.id);
        if (u) {
          users.set(u.privateGroupId, ud);
        }
      }
    }

    return { authGroups, users, authPermissionSets };
  }

  /**
   * Builds permission audit details from processed data
   * @param {Object} context - GraphQL context
   * @param {Array} permissions - Permissions to audit
   * @param {Array} authPermissionSets - Permission sets
   * @param {Map} acesByPermissionSet - ACEs by permission set
   * @param {Map} authGroups - Auth groups map
   * @param {Map} users - Users map
   * @param {Object} orgInfo - Organization information
   * @returns {Object} Effective permissions and details
   */
  function _buildPermissionAuditDetails(context, permissions, authPermissionSets, acesByPermissionSet, authGroups, users, orgInfo) {
    const effectivePermissions = [];
    const permissionSetByPermission = new Map();

    for (const permissionSet of authPermissionSets) {
      for (const p of permissions) {
        if (permissionSetHasPermissions(context, permissionSet, [p], true)) {
          const aceList = acesByPermissionSet.get(permissionSet.id) || [];
          if (aceList.length) {
            const grants = aceList.map((ace) => {
              const user = users.get(ace.authGroupId);
              const auditDetail = {
                permissionSet: permissionSet,
              };

              if (ace.objectType.toLowerCase() === 'organization') {
                auditDetail.type = 'OrganizationRole';
                auditDetail.resource = {
                  resourceType: 'Organization',
                  resourceId: orgInfo.organizationId
                };
              }

              if (user) {
                auditDetail.owner = user.member;
                auditDetail.type = auditDetail.type || 'Direct';
              } else {
                const group = authGroups.get(ace.authGroupId);
                auditDetail.owner = group;
                auditDetail.type = auditDetail.type || 'GroupMembership';
              }

              return auditDetail;
            });

            const permissionSetList = permissionSetByPermission.get(p) || [];
            permissionSetList.push(...grants);
            permissionSetByPermission.set(p, permissionSetList);
          }
        }
      }
    }

    const permissionDetails = Array.from(permissionSetByPermission.entries()).map(
      ([permission, permissionSets]) => {
        effectivePermissions.push(permission);
        permissionSets.sort(
          (a, b) =>
            PERMISSION_GRANT_TYPE_ORDER[a.type] -
            PERMISSION_GRANT_TYPE_ORDER[b.type]
        );
        const firstGrant = permissionSets[0];
        return {
          permission,
          reason: `${firstGrant.type} grant of [${_.get(
            firstGrant,
            'permissionSet.name',
            'permissions'
          )}] to [${_.get(firstGrant, 'owner.name', 'owner')}]`,
          grants: permissionSets
        };
      }
    );

    return { effectivePermissions, permissionDetails };
  }

  /**
   * Audit permissions for a specific resource and user combination
   * @param {Object} context - GraphQL context
   * @param {Object} args - Arguments containing resource, permissions, etc.
   * @returns {Promise<Object>} PermissionAudit object
   */
  async function resourcePermissionsAudit(context, args) {
    const { resource, permissions: inputPermissions, includeInherited = true } = args;

    // Validate input and get organization info
    const { orgInfo, resolvedUserID } = await _validateResourcePermissionsAuditInput(context, args);

    // Get user's auth group IDs
    const authGroupIds = await _getUserOrgAuthGroupIds(
      context,
      resolvedUserID,
      orgInfo.organizationGuid
    );

    // this functions above emit the correct errors,
    // therefore left outside the following try - catch block
    try {
      // Set default permissions if not provided
      const permissions = inputPermissions && !_.isEmpty(inputPermissions)
        ? inputPermissions
        : PERMISSIONS_FOR_RESOURCE_TYPE[resource.resourceType.toLowerCase()] || [];

      // Fetch ACL data for resource and organization
      const aclRecords = await _fetchResourceAndOrgACLs(orgInfo, resource, authGroupIds, permissions);

      // no ACEs for the caller
      if (aclRecords.length === 0) {
        return {
          resourceType: resource.resourceType,
          resourceId: resource.resourceId,
          userId: resolvedUserID,
          effectivePermissions: [],
          permissionDetails: []
        };
      }

      // Process ACEs and build initial maps
      const { acesByPermissionSet, authGroups } = _processACEsAndBuildMaps(aclRecords);

      // Inflate auth objects and handle private groups/users
      const { authGroups: inflatedAuthGroups, users, authPermissionSets } =
        await _inflateAuthGroupsAndUsers(context, authGroups, acesByPermissionSet, orgInfo);

      // Build permission audit details
      const { effectivePermissions, permissionDetails } = _buildPermissionAuditDetails(
        context,
        permissions,
        authPermissionSets,
        acesByPermissionSet,
        inflatedAuthGroups,
        users,
        orgInfo
      );

      return {
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        userId: resolvedUserID,
        effectivePermissions,
        permissionDetails
      };
    } catch (err) {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError({
        message: 'Error getting resource Access Control List'
      });
    }
  }

  async function _getUserOrgAuthGroupIds(context, userID, organizationGuid) {
    const requestorId = _.get(context, '_authInfo.userId');
    let authGroups;
    if (!_.isNil(userID) && requestorId !== userID) {
      const organizationGuids = await serviceContext.dal.admin.getOrganizationGuidsForUser(
        {
          id: userID
        },
        context
      );
      if (!organizationGuids.includes(organizationGuid)) {
        throw new errors.NotAllowed({
          message: 'The user does not belong to the organization',
          data: {
            type: 'User',
            userID
          }
        });
      }
      return _getAuthGroupIdsByUserIdWithCache(context, userID, {
        orgGuid: organizationGuid,
        ignoreCache: true
      });
    } else {
      await populateAuthContext(context, { orgGuid: organizationGuid });
      return _.get(context._authInfo, 'authGroups');
    }
  }
  /**
   * Get TDOs referenced by ACEs containing the auth group
   * @param {Object} context - GraphQL context
   * @param {Object} args - Arguments containing authGroupId
   * @returns {Promise<Object>} TDOList object
   */
  async function getAuthGroupReferencedTDOs(context, args) {
    // TODO: Implement logic to get TDOs protected by ACEs containing this group
    const { authGroupId, organizationId } = args;

    // Placeholder implementation - replace with actual logic
    return {
      records: [],
      offset: 0,
      limit: 30,
      count: 0
    };
  }

  /**
   * Get folders referenced by ACEs containing the auth group
   * @param {Object} context - GraphQL context
   * @param {Object} args - Arguments containing authGroupId
   * @returns {Promise<Object>} FolderList object
   */
  async function getAuthGroupReferencedFolders(context, args) {
    // TODO: Implement logic to get folders protected by ACEs containing this group
    const { authGroupId, organizationId } = args;

    // Placeholder implementation - replace with actual logic
    return {
      records: [],
      offset: 0,
      limit: 30,
      count: 0
    };
  }

  /**
   * Get permission sets applied to the auth group
   * @param {Object} context - GraphQL context
   * @param {Object} args - Arguments containing authGroupId
   * @returns {Promise<Array>} Array of AuthPermissionSet objects
   */
  async function getAuthGroupPermissionSets(context, args) {
    // TODO: Implement logic to get permission sets applied to this group
    const { authGroupId, organizationId } = args;

    // Placeholder implementation - replace with actual logic
    return [];
  }

  /**
   * Get count of members in the auth group
   * @param {Object} context - GraphQL context
   * @param {Object} args - Arguments containing authGroupId
   * @returns {Promise<Number>} Member count
   */
  async function getAuthGroupMemberCount(context, args) {
    // TODO: Implement logic to count group members
    const { authGroupId, organizationId } = args;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);

    // TODO: OLP for authObjects
    if (!isSuperAdmin && !isOrgAdmin) {
      // Non-admin users can't access the group members.
      // This is done due to User type having unprotected sensitive fields
      return 0;
    }

    try {
      const result = await authGroupDal.getAuthGroupMemberCount(
        authGroupId,
        args
      );
      return result;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get ACEs that reference this permission set
   * @param {Object} context - GraphQL context
   * @param {Object} args - Arguments containing permissionSetId
   * @returns {Promise<Array>} Array of AuthACE objects
   */
  async function getPermissionSetReferencedACEs(context, args) {
    // TODO: Implement logic to get ACEs that use this permission set
    const { permissionSetId, organizationId } = args;

    // Placeholder implementation - replace with actual logic
    return [];
  }

  // #endregion

  /**
  * Checks if RBAC feature is enabled for the specified resource type
  * 
  * NOTE: This function assumes enableRBACFeature is already enabled at the org level
  * and only checks for additional resource-specific flags.
  * E.g: enableRBACFeatureForSDO: for non-SDO resources, it always returns true.
  * 
  * @param {Object} context - GraphQL context
  * @param {Object} orgObject - May be organization object or { organizationId }
  * @param {string} resourceType - Resource type to check (e.g., 'SDO', 'SDOSchema')
  * @returns {Promise<boolean>} True if feature is enabled, false otherwise
  */
  async function useRBACFeatureForResourceType(context, orgObject, resourceType) {
    if (_.isNil(orgObject) || _.isNil(resourceType)) {
      serviceContext.logger.warn('Invalid parameters for useRBACFeatureForResourceType:', {
        orgObject,
        resourceType
      });
      return false;
    }

    // mapping format: [config-level feature flag, org-level feature flag]
    const featureNameMap = {
      sdo: ['enableRBACFeature', 'enableRBACFeatureForSDO'],
      sdoschema: ['enableRBACFeature', 'enableRBACFeatureForSDO'],
    };

    const normalizedResourceType = resourceType.toLowerCase();
    const requiredFeatures = featureNameMap[normalizedResourceType] || ['enableRBACFeature'];

    // for non-SDO resources, always return true
    if (requiredFeatures.length === 1 && requiredFeatures[0] === 'enableRBACFeature') {
      return true;
    }

    // orgObject may be organization object or just { organizationId }
    const hasKVPFeatureField = _.has(orgObject, 'kvp.features');

    // for SDO resources, check both base RBAC and RBAC for SDO
    return await mainUtil.isEnableFeatureInOrganization(
      context,
      hasKVPFeatureField ? orgObject : undefined, // performance optimization
      orgObject.organizationId,
      requiredFeatures
    );
  }

  async function _processFolderBatch(context, args) {
    const { folders, orgId, batchSize = 10 } = args;

    // a user may have multiple root folders, group folder by user
    const foldersByUser = new Map();
    folders.forEach(folder => {
      const userId = folder.rootFolderUserId;
      if (!foldersByUser.has(userId)) {
        foldersByUser.set(userId, []);
      }
      foldersByUser.get(userId).push(folder.folderId);
    });

    // batch process users
    const userEntries = Array.from(foldersByUser.entries());
    for (let i = 0; i < userEntries.length; i += batchSize) {
      const batch = userEntries.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(([userId, folderIds]) =>
          addDefaultACEsToResources(context, {
            objectIds: folderIds,
            ownerId: userId,
            organizationId: orgId,
            resourceType: 'Folder',
            skipRBACEnabledCheck: true,
          })
        )
      );

      // log failures
      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          const [userId, folderIds] = batch[idx];
          serviceContext.logger.warn(
            `grantDefaultACEsToUserRootFolders: Failed to add ACE for user ${userId} with folders ${folderIds.join(', ')}:`,
            result.reason?.message || result.reason
          );
        }
      });
    }
  }

  async function grantDefaultACEsToUserRootFolders(context, org) {
    if (_.isNil(org?.id)) {
      return;
    }

    try {
      const PAGE_SIZE = 500; // fetch folders in pages

      // 1. process V2 folders with pagination
      // always set offset to 0 since processed folders are removed
      let v2Folders;
      do {
        v2Folders = await serviceContext.dal.folderV2.getUserRootFolders(
          context,
          {
            withoutACE: true,
            organizationId: org.id,
            limit: PAGE_SIZE,
            offset: 0,
            rootFolderType: 'cms',
          }
        );

        if (!_.isEmpty(v2Folders)) {
          await _processFolderBatch(context, {
            folders: v2Folders,
            orgId: org.id,
          });
        }
      } while (v2Folders && v2Folders.length === PAGE_SIZE);

      // 2. process V1 folders with pagination
      let v1Folders;
      do {
        v1Folders = await dalFolder.getUserRootFolders(
          context,
          {
            withoutACE: true,
            organizationId: org.id,
            limit: PAGE_SIZE,
            offset: 0,
            rootFolderType: 'cms',
          }
        );

        if (!_.isEmpty(v1Folders)) {
          await _processFolderBatch(context, {
            folders: v1Folders,
            orgId: org.id,
          });
        }
      } while (v1Folders && v1Folders.length === PAGE_SIZE);

      // 3. mark organization kvp to avoid re-processing in eventing daily job
      _.set(
        org,
        'kvp.features.userRootDefaultAcesPopulated',
        true
      );
      await serviceContext.dal.organization.updateOrganizationKvp(
        org.id,
        org.kvp,
        context
      );
    } catch (err) {
      serviceContext.logger.error(
        'Error adding ACEs to user root folders:',
        err
      );
    }
  }

  return {
    authEnforcementEnable,

    getAuthGroup,
    getAuthGroups,
    createAuthGroup,
    updateAuthGroup,
    deleteAuthGroup,
    authGroupAddMembers,
    authGroupRemoveMembers,
    getAuthGroupMembers,
    getAuthGroupMembership,
    getAuthGroupResourceRoles,
    getAuthGroupOrganizationRoles,
    checkAuthGroupsForOrganizationPermissions,
    getAuthPermissionSet,
    getAuthPermissionSets,
    createAuthPermissionSet,
    updateAuthPermissionSet,
    deleteAuthPermissionSet,
    filterAuthGroupIdsByRights,

    addACEsToResources,
    addDefaultACEsToResources,
    getACLForResources,
    removeACEsFromResources,
    hasPermissions,
    permissionSetHasPermissions,
    addACEsToResourceFromNestedMutation,
    useRBACFeatureForResourceType,

    populateAuthContext,
    hasResourceAuthRole,
    hasOrganizationAuthRole,
    resourcePermissionsAudit,

    emitAuthSuccessViaResourceRole,
    emitAuthSuccessViaOrgRole,
    emitAuthFailure,
    emitReloadSessionAuthGroupsEvent,
    emitReloadSessionUsersEvent,

    buildAuthFilter,
    inheritResourceACEs,
    deleteAppRoleAuthObjectsTx,
    checkAndCreateAuthGroupsForAppRoles,
    getAuthPermissionSetsDB,

    getAuthGroupReferencedTDOs,
    getAuthGroupReferencedFolders,
    getAuthGroupPermissionSets,
    getAuthGroupMemberCount,
    getPermissionSetReferencedACEs,

    _invalidateAnyPermissionSetRelatedCaches,
    _invalidateAnyAuthGroupRelatedCaches,
    _validateAccessToResourceIds: validateAccessToResourceIds,
    _validatePermissionRole,
    _restrictContextOrganization: restrictContextOrganization,

    _createDefaultAuthGroups,
    _createDefaultUserAuthGroups,
    _createDefaultPermissionSets,
    _applyPermissionPolicy,
    _getDefaultAuthGroupForResources,
    _getAuthGroupIdsByUserIdWithCache,
    _grantDefaultACEsToUserRootFolders: grantDefaultACEsToUserRootFolders
  };
};
