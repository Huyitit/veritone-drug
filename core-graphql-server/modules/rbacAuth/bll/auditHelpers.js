const _ = require('lodash');

module.exports = function createAuditHelpers(serviceContext) {
  const messageUtil = serviceContext.messageUtil;

  const {
    eventsMap,
    supportedEvents,
  } = require('@veritone/core-server-base/events-map.js');

  // AuthGroup audit helpers
  function getAuthGroupId(payload) {
    return _.get(payload, 'id') || _.get(payload, 'authGroupId') || null;
  }

  function getAuditUsers(payload) {
    const users = _.get(payload, 'audit.users');

    if (_.isArray(users)) {
      return users;
    }

    return [];
  }

  function getFirstAuditUser(payload) {
    return _.head(getAuditUsers(payload)) || {};
  }

  function normalizeAuditUser(user = {}) {
    // Canonicalize to Title case (User/Group) so the structured memberType is
    // consistent with the ACE events and the GraphQL member-type enum.
    const memberType = canonicalMemberType(
      _.get(user, 'memberType') || (_.get(user, 'userId') ? 'user' : undefined),
    );

    const memberId =
      _.get(user, 'memberId') || _.get(user, 'id') || _.get(user, 'userId');

    return _.pickBy(
      {
        memberId,
        memberType,

        firstName:
          _.get(user, 'firstName') ||
          _.get(user, 'jsondata.firstName') ||
          _.get(user, 'member.jsondata.firstName'),

        lastName:
          _.get(user, 'lastName') ||
          _.get(user, 'jsondata.lastName') ||
          _.get(user, 'member.jsondata.lastName'),

        userId:
          memberType === 'User'
            ? _.get(user, 'userId') || _.get(user, 'id')
            : undefined,

        connectId: _.get(user, 'scimConnectId') || _.get(user, 'connectId'),
      },
      (value) => !_.isNil(value) && value !== '',
    );
  }

  function getAuditUserDisplayName(user) {
    const normalizedUser = normalizeAuditUser(user);

    const fullName = [normalizedUser.firstName, normalizedUser.lastName]
      .filter(Boolean)
      .join(' ');

    if (fullName) {
      return fullName;
    }

    return (
      normalizedUser.connectId ||
      normalizedUser.userId ||
      normalizedUser.memberId ||
      'unknown user'
    );
  }

  function getAuditUserDisplayNames(payload) {
    const users = getAuditUsers(payload);

    if (!users.length) {
      return 'unknown user';
    }

    return users.map(getAuditUserDisplayName).join(', ');
  }

  function isPrivateUserAuthGroupCreate(payload) {
    return (
      !!_.get(payload, 'audit.isPrivateUserAuthGroup', false) &&
      getAuditUsers(payload).length === 1
    );
  }

  function buildAuthGroupCreateActionDetails(payload, error) {
    const authGroupId = getAuthGroupId(payload);

    if (isPrivateUserAuthGroupCreate(payload)) {
      const displayName = getAuditUserDisplayName(getFirstAuditUser(payload));

      return error
        ? `Failed to automatically create private user AuthGroup for ${displayName}`
        : `Automatically created private user AuthGroup ${authGroupId} for ${displayName}`;
    }

    return error
      ? 'Failed to create AuthGroup'
      : `Created AuthGroup ${authGroupId}`;
  }

  function buildAuthGroupUpdateActionDetails(payload, error) {
    const authGroupId = getAuthGroupId(payload);

    return error
      ? `Failed to update AuthGroup ${authGroupId}`
      : `Updated AuthGroup ${authGroupId}`;
  }

  function buildAuthGroupDeleteActionDetails(payload, error) {
    const authGroupId = getAuthGroupId(payload);

    return error
      ? `Failed to delete AuthGroup ${authGroupId}`
      : `Deleted AuthGroup ${authGroupId}`;
  }

  function buildAuthGroupMemberAddActionDetails(payload, error) {
    const authGroupId = getAuthGroupId(payload);
    const displayNames = getAuditUserDisplayNames(payload);

    return error
      ? `Failed to add to AuthGroup ${authGroupId} the users: ${displayNames}`
      : `Added to AuthGroup ${authGroupId} the users: ${displayNames}`;
  }

  function buildAuthGroupMemberRemoveActionDetails(payload, error) {
    const authGroupId = getAuthGroupId(payload);
    const displayNames = getAuditUserDisplayNames(payload);

    return error
      ? `Failed to remove from AuthGroup ${authGroupId} the users: ${displayNames}`
      : `Removed from AuthGroup ${authGroupId} the users: ${displayNames}`;
  }

  function buildAuthGroupActionDetails(payload, error, action) {
    switch (action) {
      case 'create':
        return buildAuthGroupCreateActionDetails(payload, error);
      case 'update':
        return buildAuthGroupUpdateActionDetails(payload, error);
      case 'delete':
        return buildAuthGroupDeleteActionDetails(payload, error);
      case 'addMember':
        return buildAuthGroupMemberAddActionDetails(payload, error);
      case 'removeMember':
        return buildAuthGroupMemberRemoveActionDetails(payload, error);
      default:
        return '';
    }
  }

  function emitAuthGroupEvent(context, payload = {}, error = null, action) {
    if (_.isNil(payload) || !_.isObject(payload)) {
      serviceContext.logger.error('Invalid AuthGroup audit payload', {
        payload,
      });
      return;
    }

    const map = {
      create: 'AuthGroupCreate',
      update: 'AuthGroupUpdate',
      delete: 'AuthGroupDelete',
      addMember: 'AuthGroupMemberAdd',
      removeMember: 'AuthGroupMemberRemove',
    };

    const ev = map[action];

    if (!ev || !eventsMap[ev] || !supportedEvents[ev]) {
      return;
    }

    const authGroupId = getAuthGroupId(payload);
    const auditUsers = getAuditUsers(payload).map(normalizeAuditUser);
    const auditUser = _.head(auditUsers) || {};
    const isPrivateUserAuthGroup = !!_.get(
      payload,
      'audit.isPrivateUserAuthGroup',
      false,
    );

    const actionDetails = buildAuthGroupActionDetails(payload, error, action);

    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap[ev].event,
      type: eventsMap[ev].type,

      authGroupId,
      isPrivateUserAuthGroup,
      success: !error,

      actionInfo: messageUtil.buildActionInfo(
        authGroupId,
        error,
        action,
        null,
        actionDetails,
        eventsMap[ev].targetType,
      ),
    };

    if (action === 'create') {
      event.user = auditUser;
    }

    if (action === 'addMember' || action === 'removeMember') {
      event.users = auditUsers;
    }

    try {
      const emitResult = messageUtil.emitPublicEvent(
        supportedEvents[ev],
        'system',
        context,
        event,
      );

      if (emitResult && _.isFunction(emitResult.catch)) {
        emitResult.catch((emitErr) => {
          serviceContext.logger.error(
            'Failed to emit AuthGroup audit event',
            emitErr,
          );
        });
      }
    } catch (err) {
      serviceContext.logger.error('Failed to emit AuthGroup audit event', err);
    }
  }

  // Permission Set audit helpers
  function getPermissionSetId(payload) {
    return (
      _.get(payload, 'id') || _.get(payload, 'authPermissionSetId') || null
    );
  }

  function buildPermissionSetCreateActionDetails(payload, error) {
    const permissionSetId = getPermissionSetId(payload);
    return error
      ? `Failed to create AuthPermissionSet`
      : `Created AuthPermissionSet ${permissionSetId}`;
  }

  function buildPermissionSetUpdateActionDetails(payload, error) {
    const permissionSetId = getPermissionSetId(payload);
    return error
      ? `Failed to update AuthPermissionSet ${permissionSetId}`
      : `Updated AuthPermissionSet ${permissionSetId}`;
  }

  function buildPermissionSetDeleteActionDetails(payload, error) {
    const permissionSetId = getPermissionSetId(payload);
    return error
      ? `Failed to delete AuthPermissionSet ${permissionSetId}`
      : `Deleted AuthPermissionSet ${permissionSetId}`;
  }

  function buildPermissionSetActionDetails(payload, error, action) {
    switch (action) {
      case 'create':
        return buildPermissionSetCreateActionDetails(payload, error);
      case 'update':
        return buildPermissionSetUpdateActionDetails(payload, error);
      case 'delete':
        return buildPermissionSetDeleteActionDetails(payload, error);
      default:
        return '';
    }
  }

  function emitAuthPermissionSetEvent(context, payload = {}, error = null, action) {
    if (_.isNil(payload) || !_.isObject(payload)) {
      serviceContext.logger.error('Invalid AuthPermissionSet audit payload', {
        payload,
      });
      return;
    }

    const map = {
      create: 'AuthPermissionSetCreate',
      update: 'AuthPermissionSetUpdate',
      delete: 'AuthPermissionSetDelete',
    };

    const ev = map[action];

    if (!ev || !eventsMap[ev] || !supportedEvents[ev]) {
      return;
    }

    const authPermissionSetId = getPermissionSetId(payload);

    const actionDetails = buildPermissionSetActionDetails(
      payload,
      error,
      action,
    );

    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap[ev].event,
      type: eventsMap[ev].type,

      authPermissionSetId,
      success: !error,

      actionInfo: messageUtil.buildActionInfo(
        authPermissionSetId,
        error,
        action,
        null,
        actionDetails,
        eventsMap[ev].targetType,
      ),
    };

    try {
      const emitResult = messageUtil.emitPublicEvent(
        supportedEvents[ev],
        'system',
        context,
        event,
      );

      if (emitResult && _.isFunction(emitResult.catch)) {
        emitResult.catch((emitErr) => {
          serviceContext.logger.error(
            'Failed to emit AuthPermissionSet audit event',
            emitErr,
          );
        });
      }
    } catch (err) {
      serviceContext.logger.error(
        'Failed to emit AuthPermissionSet audit event',
        err,
      );
    }
  }

  // ACE (object-level permission) audit helpers
  //
  // ACEGrant / ACERevoke record adjustments to a member's object-level
  // permissions. The action detail strings are contractual (audit spec /
  // FedRAMP review) and must match exactly:
  //   Granted <psId> to <memberId> (<memberType>) on <resourceType> <resourceId>
  //   Failed to grant <psId> to <memberId> (<memberType>) on <resourceType> <resourceId>
  //   Revoked <psId> from <memberId> (<memberType>) on <resourceType> <resourceId>
  //   Failed to revoke <psId> from <memberId> (<memberType>) on <resourceType> <resourceId>
  function canonicalMemberType(value) {
    if (!value) {
      return null;
    }
    const lower = _.toLower(value);
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  function normalizeACEPayload(payload = {}) {
    return {
      authPermissionSetId:
        _.get(payload, 'authPermissionSetId') ||
        _.get(payload, 'permissionSetID') ||
        _.get(payload, 'permissionSetId') ||
        null,
      memberId:
        _.get(payload, 'memberId') ||
        _.get(payload, 'member.id') ||
        _.get(payload, 'member.memberId') ||
        null,
      memberType: canonicalMemberType(
        _.get(payload, 'memberType') || _.get(payload, 'member.memberType')
      ),
      resourceType: _.get(payload, 'resourceType') || null,
      resourceId: _.get(payload, 'resourceId') || null,
    };
  }

  function buildACEGrantActionDetails(payload, error) {
    const {
      authPermissionSetId,
      memberId,
      memberType,
      resourceType,
      resourceId,
    } = normalizeACEPayload(payload);

    return error
      ? `Failed to grant ${authPermissionSetId} to ${memberId} (${memberType}) on ${resourceType} ${resourceId}`
      : `Granted ${authPermissionSetId} to ${memberId} (${memberType}) on ${resourceType} ${resourceId}`;
  }

  function buildACERevokeActionDetails(payload, error) {
    const {
      authPermissionSetId,
      memberId,
      memberType,
      resourceType,
      resourceId,
    } = normalizeACEPayload(payload);

    return error
      ? `Failed to revoke ${authPermissionSetId} from ${memberId} (${memberType}) on ${resourceType} ${resourceId}`
      : `Revoked ${authPermissionSetId} from ${memberId} (${memberType}) on ${resourceType} ${resourceId}`;
  }

  function buildACEActionDetails(payload, error, action) {
    switch (action) {
      case 'grant':
        return buildACEGrantActionDetails(payload, error);
      case 'revoke':
        return buildACERevokeActionDetails(payload, error);
      default:
        return '';
    }
  }

  function emitACEEvent(context, payload = {}, error = null, action) {
    if (_.isNil(payload) || !_.isObject(payload)) {
      serviceContext.logger.error('Invalid ACE audit payload', {
        payload,
      });
      return;
    }

    const map = {
      grant: 'ACEGrant',
      revoke: 'ACERevoke',
    };

    const ev = map[action];

    if (!ev || !eventsMap[ev] || !supportedEvents[ev]) {
      return;
    }

    const normalized = normalizeACEPayload(payload);
    const actionDetails = buildACEActionDetails(payload, error, action);

    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap[ev].event,
      type: eventsMap[ev].type,

      authPermissionSetId: normalized.authPermissionSetId,
      member: {
        memberId: normalized.memberId,
        memberType: normalized.memberType,
      },
      resourceId: normalized.resourceId,
      resourceType: normalized.resourceType,
      success: !error,

      actionInfo: messageUtil.buildActionInfo(
        normalized.resourceId,
        error,
        eventsMap[ev].action,
        null,
        actionDetails,
        eventsMap[ev].targetType,
      ),
    };

    try {
      const emitResult = messageUtil.emitPublicEvent(
        supportedEvents[ev],
        'system',
        context,
        event,
      );

      if (emitResult && _.isFunction(emitResult.catch)) {
        emitResult.catch((emitErr) => {
          serviceContext.logger.error(
            `Failed to emit ${ev} audit event`,
            emitErr,
          );
        });
      }
    } catch (err) {
      serviceContext.logger.error(`Failed to emit ${ev} audit event`, err);
    }
  }

  function emitACEGrantEvent(context, payload = {}, error = null) {
    emitACEEvent(context, payload, error, 'grant');
  }

  function emitACERevokeEvent(context, payload = {}, error = null) {
    emitACEEvent(context, payload, error, 'revoke');
  }

  // DefaultACEPolicyUpdate / ACEQuery / AuthorizationDenied
  function _emitOLPEvent(context, evName, error, actionDetails, eventFields) {
    if (!evName || !eventsMap[evName] || !supportedEvents[evName]) {
      return;
    }

    // Event construction (incl. buildActionInfo) is inside the try so this
    // helper never throws — audit emission must not convert a successful
    // operation into a caller-visible failure, nor mask its original error.
    try {
      const event = {
        serviceName: 'core-graphql-server',
        event: eventsMap[evName].event,
        type: eventsMap[evName].type,

        ...eventFields,
        success: !error,

        actionInfo: messageUtil.buildActionInfo(
          eventFields.resourceId,
          error,
          eventsMap[evName].action,
          null,
          actionDetails,
          eventsMap[evName].targetType,
        ),
      };

      const emitResult = messageUtil.emitPublicEvent(
        supportedEvents[evName],
        'system',
        context,
        event,
      );

      if (emitResult && _.isFunction(emitResult.catch)) {
        emitResult.catch((emitErr) => {
          serviceContext.logger.error(
            `Failed to emit ${evName} audit event`,
            emitErr,
          );
        });
      }
    } catch (err) {
      serviceContext.logger.error(`Failed to emit ${evName} audit event`, err);
    }
  }

  function buildDefaultACEPolicyUpdateActionDetails(payload, error) {
    const resourceType = _.get(payload, 'resourceType') || null;
    const resourceId = _.get(payload, 'resourceId') || null;

    // Template: "for organization <name> (<id>)". Both fall back to 'n/a' and
    // the event is NEVER gated on the name — createOrganization permits
    // empty-string names, and a FedRAMP audit record must still fire (and read
    // cleanly) for a nameless or unresolved organization.
    const organizationName = _.get(payload, 'organizationName') || 'n/a';
    const organizationId = _.get(payload, 'organizationId') || 'n/a';

    return error
      ? `Failed to update default ACE policy on ${resourceType} ${resourceId} for organization ${organizationName} (${organizationId})`
      : `Updated default ACE policy on ${resourceType} ${resourceId} for organization ${organizationName} (${organizationId})`;
  }

  function emitDefaultACEPolicyUpdateEvent(context, payload = {}, error = null) {
    if (_.isNil(payload) || !_.isObject(payload)) {
      serviceContext.logger.error('Invalid DefaultACEPolicyUpdate audit payload', {
        payload,
      });
      return;
    }

    const organizationId = _.get(payload, 'organizationId');
    _emitOLPEvent(
      context,
      'DefaultACEPolicyUpdate',
      error,
      buildDefaultACEPolicyUpdateActionDetails(payload, error),
      {
        organizationId: _.isNil(organizationId) ? null : `${organizationId}`,
        organizationGuid: _.get(payload, 'organizationGuid') || null,
        organizationName: _.get(payload, 'organizationName') || null,
        resourceType: _.get(payload, 'resourceType') || null,
        resourceId: _.get(payload, 'resourceId') || null,
      },
    );
  }

  // ACEQuery can carry a batch of resources checked in one hasPermissions call
  // (a caller may pass many ids). Callers pass either the single-resource shape
  // (`resourceType`/`resourceId`) or a `resources: [{resourceType, resourceId}]`
  // list. The list is what lets us fold many checks into one audit event and
  // avoid one NSQ publish per id (hot-topic risk on the public events topic).
  function normalizeQueryResources(payload = {}) {
    const list = _.get(payload, 'resources');
    if (Array.isArray(list) && list.length) {
      return list.map((r) => ({
        resourceType: _.get(r, 'resourceType') || null,
        resourceId: _.get(r, 'resourceId') || null,
      }));
    }
    return [
      {
        resourceType: _.get(payload, 'resourceType') || null,
        resourceId: _.get(payload, 'resourceId') || null,
      },
    ];
  }

  // "TDO a", "TDO a and TDO b", "TDO a, TDO b and TDO c"
  function formatResourceList(resources) {
    const parts = resources.map((r) => `${r.resourceType} ${r.resourceId}`);
    if (parts.length <= 1) {
      return parts[0] || 'null null';
    }
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  }

  function buildACEQueryActionDetails(payload, error) {
    const { memberId, memberType } = normalizeACEPayload(payload);
    const resources = formatResourceList(normalizeQueryResources(payload));

    return error
      ? `Failed to check permissions for ${memberId} (${memberType}) on ${resources}`
      : `Checked permissions for ${memberId} (${memberType}) on ${resources}`;
  }

  function emitACEQueryEvent(context, payload = {}, error = null) {
    if (_.isNil(payload) || !_.isObject(payload)) {
      serviceContext.logger.error('Invalid ACEQuery audit payload', { payload });
      return;
    }

    const { memberId, memberType } = normalizeACEPayload(payload);
    const resources = normalizeQueryResources(payload);
    // The audit envelope's structured resource is single-valued (core.proto
    // ActionInfo.targetId is a scalar string), so a batched check can't carry a
    // per-id structured resource. A single-resource event keeps its id; a batch
    // leaves it null (targetId -> "N/A") and lists every id in actionDetails.
    const single = resources.length === 1 ? resources[0] : null;
    _emitOLPEvent(
      context,
      'ACEQuery',
      error,
      buildACEQueryActionDetails(payload, error),
      {
        member: { memberId, memberType },
        resourceId: single ? single.resourceId : null,
        resourceType: single ? single.resourceType : null,
        accessGranted: !!_.get(payload, 'accessGranted'),
      },
    );
  }

  function buildAuthorizationDeniedActionDetails(payload) {
    const { memberId, memberType } = normalizeACEPayload(payload);
    const resourceType = _.get(payload, 'resourceType') || null;
    const resourceId = _.get(payload, 'resourceId') || null;

    const reason = _.get(payload, 'reason');
    // Org-role-only denials have no object target; omit the ` on <type> <id>`
    // clause rather than rendering `on null null`.
    const target = [resourceType, resourceId].filter(Boolean).join(' ');
    const base = target
      ? `Denied access for ${memberId} (${memberType}) on ${target}`
      : `Denied access for ${memberId} (${memberType})`;
    return reason ? `${base} because ${reason}` : base;
  }

  function emitAuthorizationDeniedEvent(context, payload = {}) {
    if (_.isNil(payload) || !_.isObject(payload)) {
      serviceContext.logger.error('Invalid AuthorizationDenied audit payload', {
        payload,
      });
      return;
    }

    const { memberId, memberType } = normalizeACEPayload(payload);
    _emitOLPEvent(
      context,
      'AuthorizationDenied',
      null,
      buildAuthorizationDeniedActionDetails(payload),
      {
        member: { memberId, memberType },
        resourceId: _.get(payload, 'resourceId') || null,
        resourceType: _.get(payload, 'resourceType') || null,
        reason: _.get(payload, 'reason') || null,
      },
    );
  }

  return {
    emitAuthGroupEvent,
    emitAuthPermissionSetEvent,
    emitACEGrantEvent,
    emitACERevokeEvent,
    emitDefaultACEPolicyUpdateEvent,
    emitACEQueryEvent,
    emitAuthorizationDeniedEvent,

    getAuditUserDisplayName,
    getAuditUserDisplayNames,
    normalizeAuditUser,
    getFirstAuditUser,
    getAuditUsers,
    getAuthGroupId,
    isPrivateUserAuthGroupCreate,
    buildAuthGroupActionDetails,

    getPermissionSetId,
    buildPermissionSetActionDetails,

    normalizeACEPayload,
    buildACEGrantActionDetails,
    buildACERevokeActionDetails,
    buildACEActionDetails,

    buildDefaultACEPolicyUpdateActionDetails,
    buildACEQueryActionDetails,
    buildAuthorizationDeniedActionDetails,
  };
};
