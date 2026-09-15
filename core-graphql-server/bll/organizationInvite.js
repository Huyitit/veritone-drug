const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const fpl = require('@veritone/functional-permissions-lib');
const jwt = require('jsonwebtoken');
const {
  JWT_ISSUER_CORE_GRAPHQL_SERVER,
  JWT_AUDIENCE_CORE_ADMIN_SERVER,
  JWT_PURPOSE_SELF_SERVICE_ORG_INVITE_REGISTRATION_REVIEW,
  JWT_PURPOSE_SELF_SERVICE_ORG_INVITE_EMAIL_VERIFICATION
} = require('@veritone/functional-permissions-lib/shared-jwt.js');
const uuid = require('uuid');
const moment = require('moment');
const { events } = require('@veritone/core-messages/generated/pbjs/compiled');

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const enableStrictRoleValidation = _.get(config, 'featureFlags.enableStrictRoleValidation');
  const util = require('../util.js')(serviceContext);
  const errors = require('../error')(config);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const dalUtil = require('../dal/util.js')(config, serviceContext);
  const constants = require('../util/appConstants.js')(serviceContext);
  const messageUtil = serviceContext.messageUtil;
  const {
    eventsMap,
    supportedEvents
  } = require('@veritone/core-server-base/events-map.js');
  const rbacAuthBll = _.get(
    serviceContext,
    'bll.rbacAuth',
    require('../modules/rbacAuth/bll/rbacAuth.bll')(serviceContext)
  );

  function _isAdminForOrganization(context, organizationId) {
    const authInfo = context._authInfo;
    if (!authInfo) return false;
    if (resUtil.isSuperAdmin(authInfo)) return true;
    const requestorOrgId = _.get(authInfo, 'organization.organizationId');
    if (requestorOrgId === undefined || requestorOrgId === null) return false;
    return (
      organizationId.toString() === requestorOrgId.toString() &&
      resUtil.isOrgAdmin(authInfo)
    );
  }

  /**
   * Parses stored userDetails from the database into a normalized object if possible
   * @param {object|unknown} userDetails either a parsed json object or some other unknown value
   * @returns {object|null}
   */
  function _parseStoredInviteUserDetails(userDetails) {
    if (!userDetails) {
      return null;
    }
    if (typeof userDetails === 'object') {
      return userDetails;
    }
    try {
      return JSON.parse(userDetails);
    } catch (parseError) {
      return null;
    }
  }

  /**
   * Self-service consolidated signup stores the invitee-chosen password as bcrypt in `user_details`
   * (`hashedPassword`). When present, {@link _createNewUserOrganizationInvite} (e.g. on invitee
   * `complete`) forwards it to core-admin as `passwordHash` so the account is created with that
   * credential instead of a random password + reset flow. Admin `approve` on self-service invites
   * does not create users or read this path.
   * @param {object} invite - Organization invite row including `userDetails`
   * @returns {string|null} bcrypt hash string, or null if missing / not bcrypt-shaped
   */
  function _getProvisioningPasswordHashFromInvite(invite) {
    const details = _parseStoredInviteUserDetails(invite && invite.userDetails);
    const h = details && details.hashedPassword;
    if (!_.isString(h) || !h) {
      return null;
    }
    if (!/^\$2[aby]\$\d{2}\$/.test(h)) {
      logger.warn(
        'organizationInvite: userDetails.hashedPassword is not bcrypt-shaped; ignoring for provisioning',
        {
          organizationInviteId: _.get(invite, 'organizationInviteId')
        }
      );
      return null;
    }
    return h;
  }

  /**
   * True when the invite row was created as self-service request-to-join (`invite_type` = `self_signup`
   * in DB, GraphQL {@link OrganizationInviteType.selfSignup}).
   */
  function _isSelfSignupInvite(invite) {
    if (!invite) {
      return false;
    }
    const raw =
      invite.inviteType !== undefined && invite.inviteType !== null
        ? invite.inviteType
        : invite.invite_type;
    if (raw === undefined || raw === null || raw === '') {
      return false;
    }
    return _.camelCase(String(raw)) === 'selfSignup';
  }

  /**
   * Request-to-join only: true when this invite row is still pending and matches the same
   * registration configuration id as the incoming mutation (idempotent replay).
   */
  function _requestToJoinIdempotentPendingMatch(invite, input) {
    if (!invite || !['submitted', 'approved'].includes(invite.status)) {
      return false;
    }
    const requestedId = _.get(input, 'userDetails.customRegistrationId');
    if (requestedId == null || requestedId === '') {
      return false;
    }
    const stored = _parseStoredInviteUserDetails(invite.userDetails);
    const storedId = stored && stored.customRegistrationId;
    return storedId != null && String(storedId) === String(requestedId);
  }

  /**
   * Privacy and terms URLs for organization-invite emails (config keys with defaults).
   * Merge keys match new-organization-invitations / _sendEmail and Handlebars templates.
   * @returns {{ url_privacy_policy: string, url_term_service: string }}
   */
  function _getOrganizationInviteLegalUrlMergeKvp() {
    return {
      url_privacy_policy: _.get(
        config,
        'organizationInvite.urlPrivacyPolicy',
        'https://www.veritone.com/privacy'
      ),
      url_term_service: _.get(
        config,
        'organizationInvite.urlTermService',
        'https://www.veritone.com/terms'
      )
    };
  }

  /**
   * Approve/deny deep links for request-to-join admin emails. Base origin is
   * `https://{dnsZoneName}/`
   * Shape: `{base}/ui/auth/signup/review?action=approve|deny&token=...`
   *
   * @param {string} adminActionToken
   * @returns {{ desktopUrlApprove: string, desktopUrlDeny: string }}
   */
  function _buildSelfServiceAdminActionReviewUrls(adminActionToken) {
    const reviewOrigin = `https://${util.getDnsZoneName()}/`;
    const route = _.get(
      config,
      'organizationInvite.selfServiceAdminActionDesktopRoute',
      'ui/auth/signup/review'
    );
    const build = (action) => {
      let url;
      try {
        url = new URL(route, reviewOrigin);
      } catch (err) {
        logger.warn(
          'organizationInvite: invalid selfServiceAdminActionDesktopRoute; using ui/auth/signup/review',
          route,
          err
        );
        url = new URL('ui/auth/signup/review', reviewOrigin);
      }
      url.searchParams.set('action', action);
      url.searchParams.set('token', adminActionToken);
      return url.href;
    };
    return {
      desktopUrlApprove: build('approve'),
      desktopUrlDeny: build('deny')
    };
  }

  /**
   * Deep link for self-service email verification after auto-approved request-to-join.
   * Base: `https://{dnsZoneName}/` + `organizationInvite.selfServiceEmailVerificationDesktopRoute`
   * (default `/ui/auth/signup/verify`), with `token=<jwt>`.
   *
   * @param {string} emailVerificationToken
   * @returns {string}
   */
  function _buildSelfServiceEmailVerificationUrl(emailVerificationToken) {
    const origin = `https://${util.getDnsZoneName()}/`;
    const route = _.get(
      config,
      'organizationInvite.selfServiceEmailVerificationDesktopRoute',
      'ui/auth/signup/verify'
    );
    let url;
    try {
      url = new URL(route, origin);
    } catch (err) {
      logger.warn(
        'organizationInvite: invalid selfServiceEmailVerificationDesktopRoute; using ui/auth/signup/verify',
        route,
        err
      );
      url = new URL('ui/auth/signup/verify', origin);
    }
    url.searchParams.set('token', emailVerificationToken);
    return url.href;
  }

  const createOrganizationInvite = async (context, args) => {
    const organizationInviteId = uuidv4();
    const { input } = args;
    const { organizationId, email, applicationRoles, authGroupIds } = input;
    const authInfo = context._authInfo;
    const isSuperAdmin = authInfo ? resUtil.isSuperAdmin(authInfo) : false;
    const isOrgAdmin = authInfo ? resUtil.isOrgAdmin(authInfo) : false;
    context.isSuperAdmin = isSuperAdmin;
    context.isOrgAdmin = isOrgAdmin;

    const requestorOrgId = _.get(
      authInfo,
      'organization.organizationId'
    );
    const organizationName = _.get(
      authInfo,
      'organization.organizationName'
    );
    const createdBy = _.get(authInfo, 'userId');
    // GraphQL input: invitee self-service situation aka "request to join" (vs admin inviting an email).
    const requestToJoinOrganization = Boolean(input.requestToJoinOrganization);
    // GraphQL input: forces the pending or admin-review path when true.
    const disableAutoApproval = Boolean(input.disableAutoApproval);
    
    const requestorIsAdminOfTargetOrg =
      isOrgAdmin &&
      requestorOrgId != null &&
      organizationId.toString() === requestorOrgId.toString();
    
    // canAutoApproveAsPrivilegedUser is true when:
    // - caller is super admin (resUtil.isSuperAdmin), OR
    // - requestorIsAdminOfTargetOrg is true, which is when:
    //   - caller is an org admin (resUtil.isOrgAdmin), and
    //   - caller has an organization.organizationId on auth, and
    //   - that id matches input organizationId (string comparison).
    const canAutoApproveAsPrivilegedUser = isSuperAdmin || requestorIsAdminOfTargetOrg;

    // Stored on the invite row and used below to pick JWTs (admin review vs user email verification vs
    // password reset) and downstream messaging.
    //
    // needsConfirmation is initially true when:
    // - it's truthy that this we should disableAutoApproval, OR
    // - BOTH
    //   - it's not a requestToJoinOrganization AND
    //   - the caller is not canAutoApproveAsPrivilegedUser (neither super admin nor org admin of the target org).
    //
    // therefor => the invite doesn't needsConfirmation when:
    // - we've set (or not set) disableAutoApproval to falsy, AND
    // - EITHER
    //   - it's truthy that this is a requestToJoinOrganization OR
    //   - it's truthy that the caller is canAutoApproveAsPrivilegedUser

    // So for request-to-join only disableAutoApproval can make needsConfirmation true; caller
    // privilege does not reduce it for that path.
    //
    // Later overwritten to false when validateOrganization returns reactivatedUserId (see that helper).
    let needsConfirmation =
      disableAutoApproval ||
      (!requestToJoinOrganization && !canAutoApproveAsPrivilegedUser);
    input.needsConfirmation = needsConfirmation;

    let orgInvite;
    try {
      // validate email format.
      if (!email || !_validateEmail(email)) {
        logger.error('bll.createOrganizationInvite: Invalid email');
        throw new errors.InvalidInput({
          message: 'bll.createOrganizationInvite: Invalid email',
          data: {
            objectId: email,
            objectType: 'email'
          }
        });
      }

      // validate organization
      const { organizationGuid, reactivatedUserId } = await validateOrganization(
        organizationId,
        email,
        context
      );

      // reactivatedUserId is only set by validateOrganization when: the email maps to a user already
      // in this org, status is deleted|inactive|suspended, and the caller is super admin — user is
      // reactivated to active. Short-circuit: completed invite in one tx, no seat/token/email path.
      if (reactivatedUserId) {
        input.organizationInviteId = organizationInviteId;
        input.userId = reactivatedUserId;
        input.createdBy = createdBy;
        needsConfirmation = false;
        input.needsConfirmation = false;
        const expirationDateDays = _.get(
          config,
          'organizationInvite.expirationDate',
          7 // default 7 days
        );
        input.expirationDate = moment()
          .add(expirationDateDays, 'days')
          .unix();

        const runCreateCompletedInviteTx = async (trans) => {
          return await serviceContext.dal.organizationInvite.createOrganizationInvite(
            context,
            {
              input: {
                ...input,
                needsConfirmation: false,
                inviteType: 'userInvite'
              }
            },
            trans
          );
        };

        orgInvite = await serviceContext.dbConnections['sso'].write.tx(
          'createCompletedOrganizationInviteTx',
          async (trans) => {
            const createdInvite = await runCreateCompletedInviteTx(trans);
            // Update the invite status to completed
            await serviceContext.dal.organizationInvite.updateOrganizationInvite(
              context,
              {
                input: {
                  organizationInviteId: createdInvite.organizationInviteId,
                  action: 'complete',
                  applicationRoles: input.applicationRoles
                }
              },
              trans
            );
            // Re-fetch to get the updated invite
            const invites = await serviceContext.dal.organizationInvite.getOrganizationInvites(
              {},
              { organizationInviteId: createdInvite.organizationInviteId },
              context
            );
            return invites[0] || createdInvite;
          }
        );

        return orgInvite;
      }
      await validateSeatLimit(organizationId, email, context);
      // Non-empty applicationRoles is required here; the database also enforces referential constraints.
      if (!applicationRoles || applicationRoles.length === 0) {
        logger.error('bll.createOrganizationInvite: Invalid applicationRoles');
        throw new errors.InvalidInput({
          message: 'bll.createOrganizationInvite: Invalid applicationRoles',
          data: {
            objectId: applicationRoles,
            objectType: 'applicationRoles'
          }
        });
      }

      // validate applicationRoles input.
      applicationRoles.forEach((appRole) => {
        // validate applicationId
        if (
          !appRole.applicationId ||
          !validator.isUUID(appRole.applicationId)
        ) {
          logger.error('applicationRole.applicationId: Invalid applicationId');
          throw new errors.InvalidInput({
            message: 'applicationRole.applicationId: Invalid applicationId',
            data: {
              objectId: appRole.applicationId,
              objectType: 'applicationId'
            }
          });
        }

        // validate roleId
        if (!appRole.roleId || !validator.isUUID(appRole.roleId)) {
          logger.error('applicationRole.roleId: Invalid roleId');
          throw new errors.InvalidInput({
            message: 'applicationRole.roleId: Invalid roleId',
            data: {
              objectId: appRole.roleId,
              objectType: 'roleId'
            }
          });
        }
      });

      // Verify applications and roles actually exist in the db
      if (enableStrictRoleValidation) {
        await serviceContext.dal.organizationInvite.validateApplicationRolesExist(context, applicationRoles, organizationId);
      }
      // validate authGroupIds if provided
      if (authGroupIds && authGroupIds.length > 0) {
        for (const authGroupId of authGroupIds) {
          if (!authGroupId || !validator.isUUID(authGroupId)) {
            throw new errors.InvalidInput({
              message: 'bll.createOrganizationInvite: Invalid authGroupId',
              data: {
                objectId: authGroupId,
                objectType: 'authGroupId'
              }
            });
          }
        }

        // validate authGroupIds exist in the organization
        const authGroups = await rbacAuthBll.getAuthGroups(
          context,
          {
            ids: authGroupIds,
            ownerOrganization: organizationGuid
          }
        );

        const foundAuthGroupIds = _.get(authGroups, 'records', []).map(
          (g) => g.id
        );
        const invalidAuthGroupIds = authGroupIds.filter(
          (id) => !foundAuthGroupIds.includes(id)
        );

        if (invalidAuthGroupIds.length > 0) {
          throw new errors.InvalidInput({
            message:
              'bll.createOrganizationInvite: One or more authGroupIds do not exist in the organization',
            data: {
              objectId: invalidAuthGroupIds,
              objectType: 'authGroupIds'
            }
          });
        }
      }
      
      // createdBy must come from authenticated context (user id), not from client input alone.
      input.createdBy = createdBy;
      if (!createdBy) {
        logger.error('createOrganizationInvte: missing createdBy info');
        throw new errors.InvalidInput({
          message: 'createOrganizationInvte: missing createdBy info',
          data: {
            objectId: createdBy,
            objectType: 'createdBy'
          }
        });
      }

      const inviteExpirationDays = _.get(
        config,
        'organizationInvite.expirationDate',
        7
      );

      const expirationDateSeconds = moment()
        .add(inviteExpirationDays, 'days')
        .unix();

      const userExistsAndIsAvailable = await _validateUser(email, context, input, isSuperAdmin);

      const passwordResetToken =
        !requestToJoinOrganization && !userExistsAndIsAvailable && !needsConfirmation
          ? _createPasswordResetToken(organizationGuid, organizationId, createdBy, `${inviteExpirationDays}d`)
          : null;

      const preparedInput = {
        ...input,
        createdBy,
        organizationInviteId,
        needsConfirmation,
        expirationDate: expirationDateSeconds,
        passwordResetToken,
        inviteType: requestToJoinOrganization ? 'selfSignup' : 'userInvite'
      };

      const createNotifyOpts = { requestToJoinOrganization };

      const notifyAfterCreate = { skip: false };

      const runCreateInviteTx = async (trans) => {
        try {
          await serviceContext.dal.organizationInvite.cleanExpiredInvites(
            context,
            {
              organizationId,
              email
            },
            trans
          );
        } catch (err) {
          logger.error(
            `createOrganizationInvite: Failed to clean expired invites: orgId: ${organizationId}, email: ${email}`,
            err
          );
        }
        const existingInvites = await serviceContext.dal.organizationInvite.getOrganizationInvites(
          { organizationId },
          { email },
          context,
          {
            orderBy: {
              field: 'expiration_date',
              direction: 'DESC'
            }
          },
          trans
        );

        if (existingInvites.length > 0) {
          const latestInvite = existingInvites[0];

          // Same pending request-to-join + same customRegistrationId: return existing row, no notify.
          if (
            requestToJoinOrganization &&
            _requestToJoinIdempotentPendingMatch(latestInvite, input)
          ) {
            notifyAfterCreate.skip = true;
            return latestInvite;
          }

          // Without super admin or target-org org admin, a prior rejected invite blocks a new one.
          if (!canAutoApproveAsPrivilegedUser && latestInvite.status === 'rejected') {
            throw new errors.NotAllowed({
              message: 'This user\'s invitation was previously rejected by an administrator. Please contact an administrator for assistance.'
            });
          }

          // Soft-delete active invite
          const activeInvite = existingInvites.find((i) =>
            ['submitted', 'approved'].includes(i.status)
          );

          if (activeInvite) {
            const existingInviteId = activeInvite.organizationInviteId;
            let action = 'delete';
            if (activeInvite.status === 'submitted') {
              action = 'reject';
            }

            await serviceContext.dal.organizationInvite.updateOrganizationInvite(
              context,
              {
                input: {
                  organizationInviteId: existingInviteId,
                  action
                }
              },
              trans
            );
          }
        }

        return await serviceContext.dal.organizationInvite.createOrganizationInvite(
          context,
          { input: preparedInput },
          trans
        );
      };

      orgInvite = await serviceContext.dbConnections['sso'].write.tx(
        'createOrganizationInviteTx',
        runCreateInviteTx
      );

      if (!notifyAfterCreate.skip) {
        await _sendNotificationAndEmail(context, orgInvite, createNotifyOpts);
      }

      return orgInvite;
    } catch (err) {
      // emit failed audit log events
      const isAdmin = isSuperAdmin || isOrgAdmin;
      await _emitFailedOrganizationInviteCreate(
        context,
        {
          organizationId,
          organizationName,
          inviteeEmail: email,
          requestEmail: email,
          applicationRoles,
          error: err,
          inviteeUserId: orgInvite ? orgInvite.inviteeUserId : null
        },
        isAdmin
      );

      if (err instanceof errors.ResourceConflict || err instanceof errors.InvalidInput || err instanceof errors.NotFound) {
        throw err;
      }

      throw new errors.InternalServerError(err);
    }
  };

  async function _emitFailedOrganizationInviteCreate(context, input, isAdmin) {
    if (isAdmin) {
      await _emitOrganizationInvitationEvent(context, input);
    } else {
      await _emitOrganizationRequestEvent(context, input);
    }
  }

  /**
   * TODO does this allow an org admin of any org?
   */
  function _validateAccess(action, input, context) {
    // OrgAdmin can Submit/Approve/Reject a request. User can Submit/Accept/Reject a request.
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);
    if (
      (action === 'submit' ||
        action === 'approve' ||
        action === 'reject' ||
        action === 'resend') &&
      !isSuperAdmin &&
      !isOrgAdmin
    ) {
      logger.error('updateOrganizationInvite: action not allowed by Users');
      throw new errors.NotAllowed({
        message:
          'updateOrganizationInvite: Submit, Approve, Reject and Resend only allowed by Admin'
      });
    }

    // REVIEW: @ndthang15 @shuwei-lin
    // The following is likely wrong - the invited user could be superadmin or admin in another org.
    // Since everyone should be able to request and orgInvite and `complete` enforces that the userId
    // in the context and the userId in the invite are the same, the following code is not needed.
    //
    // if (
    //   (action === 'request' || action === 'complete') &&
    //   (isSuperAdmin || isOrgAdmin)
    // ) {
    //   logger.error('updateOrganizationInvite: acction not allowed by Admin');
    //   throw new errors.NotAllowed(
    //     'updateOrganizationInvite: Request and Complete are only allowed by User'
    //   );
    // }

    input.needsConfirmation = !isSuperAdmin && !isOrgAdmin;
  }

  async function _validateUser(email, context, input, isSuperAdmin) {
    const users = await serviceContext.dal.admin.getUsersByEmail(
      { email },
      context
    );

    // Returns true when the email exists and is usable for this mutation: sets input.userId.
    // - If no user: returns false (caller treats as new invitee for token selection).
    // - If user status is deactivated|deleted|inactive|suspended and caller is not super admin: throws.
    if (users.length > 0) {
      const userStatus = _.get(users[0], 'status');
      if (['deactivated', 'deleted', 'inactive', 'suspended'].includes(userStatus) && !isSuperAdmin) {
        throw new errors.InvalidInput({
          message: `The user account this email belongs to is unavailable. Please contact an instance administrator for assistance`
        });
      }
      input.userId = users[0].userId;
      return true;
    }

    return false;
  }

  /**
   * Ensures the organization exists, the caller may update it, and invitee org-membership rules hold.
   *
   * @param {*} organizationId Target organization id (validated by `util.checkId` before use).
   * @param {string} email Invitee email.
   * @param {object} context GraphQL / request context; `context.isSuperAdmin` is required for reactivation.
   * @returns {Promise<{isValid: true, organizationGuid: string, reactivatedUserId?: string}>}
   *   On success, `organizationGuid` is always set. `reactivatedUserId` is present only when a user
   *   exists for `email`, is already in this organization, has status `deleted`, `inactive`, or
   *   `suspended` (not `deactivated`; see `_validateUser`), and the caller is super admin — the user
   *   is updated to `active` before return.
   * @throws {InvalidInput} Invalid or unknown `organizationId`.
   * @throws {NotAllowed} Caller cannot update the organization, or the invitee is already an org
   *   member and the reactivation branch above does not apply.
   */
  async function validateOrganization(organizationId, email, context) {
    util.checkId(organizationId, false, true);

    // get org guid
    const organizationGuid = await serviceContext.dal.application.getAppIdFromOrgId(
      organizationId
    );
    if (!organizationGuid) {
      throw new errors.InvalidInput({
        message: 'Invalid organizationId',
        data: {
          objectType: 'Organization',
          objectId: organizationId
        }
      });
    }

    const orgAccess = await serviceContext.dal.admin.allowedToUpdateOrganization(
      context,
      organizationGuid
    );
    if (!orgAccess) {
      throw new errors.NotAllowed({
        message: 'Access denied',
        data: {
          objectType: 'Organization',
          objectId: organizationId
        }
      });
    }

    const users = await serviceContext.dal.admin.getUsersByEmail(
      { email },
      context
    );
    const userId = _.get(_.head(users), 'userId');
    // non-existing users are not member of an org.
    if (userId) {
      const organizationGuiIds = await serviceContext.dal.admin.getOrganizationGuidsForUser(
        {
          id: userId
        },
        context
      );
      
      if (organizationGuiIds.includes(organizationGuid)) {
        const userStatus = _.get(_.head(users), 'status');
        if (['deleted', 'inactive', 'suspended'].includes(userStatus) && context.isSuperAdmin) {
          // Reactivate the user by updating their status to active
          await serviceContext.dal.admin.updateUserStatus(
            { input: { id: userId, status: 'active' } },
            context
          );
          logger.info(`validateOrganization: Reactivated user ${userId} status from '${userStatus}' to 'active'`);
          return { isValid: true, organizationGuid, reactivatedUserId: userId };
        }

        throw new errors.NotAllowed({
          message: 'This user is already a member of this organization'
        });
      }
    }

    return { isValid: true, organizationGuid };
  }
  async function validateSeatLimit(organizationId, email, context, action = 'invite') {
    let uri = config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    if (organizationId) {
      uri += `organizations/${organizationId}/validate-email-seat`;
    }

    let response;
    try {
      response = await dalUtil.httpCall(uri, context, {
        email
      }, null, 'POST');
    } catch (err) {
      logger.error('Failed to validate organization seats are available with input email from core-admin');
      throw err;
    }

    if (!response || !response.isValid) {
      const messages = {
        approve: 'Organization seat limit exceeded. Cannot approve this invitation.',
        complete: 'Organization seat limit exceeded. Your invitation cannot be completed at this time. Please contact your organization administrator.',
        invite: 'Organization seat limit exceeded. Cannot invite new users.',
        resend: 'Organization seat limit exceeded. Cannot resend this invitation.'
      };
      throw new errors.CapacityExceeded({
        message: messages[action] || messages.invite,
        data: {
          objectType: 'Organization',
          objectId: organizationId,
          limit: response?.seatLimit || null,
        },
      });
    }
  }

  function _validateActionState(action, state) {
    if (_.isNil(action)) {
      // no state transition, just metadata update
      return;
    }
    const stateActions = {
      submitted: new Set(['approve', 'reject', 'delete']),
      approved: new Set(['complete', 'delete', 'resend']),
      expired: new Set(['resend', 'delete']),
      rejected: new Set(['']),
      completed: new Set(['']),
      deleted: new Set([])
    };
    const validActions = stateActions[state];
    if (!validActions) {
      throw new errors.InvalidInput({
        message: 'The organizationInvite status is final',
        data: {
          status: state
        }
      });
    }
    if (!validActions.has(action)) {
      throw new errors.InvalidInput({
        message: 'Incompatible state organizationInvite action',
        data: {
          status: state,
          action: action
        }
      });
    }
  }

  function _validateApplicationRoles(applicationRoles) {
    // check if applicationRoles been passed. Database will enforce the data integrity using constraints.
    if (!applicationRoles || applicationRoles.length === 0) {
      logger.error('bll.updateOrganizationInvite: Invalid applicationRoles');
      throw new errors.InvalidInput({
        message: 'bll.updateOrganizationInvite: Invalid applicationRoles',
        data: {
          objectId: applicationRoles,
          objectType: 'applicationRoles'
        }
      });
    }

    // validate applicationRoles input.
    applicationRoles.forEach((appRole) => {
      // validate applicationId
      if (!appRole.applicationId || !validator.isUUID(appRole.applicationId)) {
        logger.error(
          'updateOrganizationInvite.applicationRole.applicationId: Invalid applicationId'
        );
        throw new errors.InvalidInput({
          message: 'applicationRole.applicationId: Invalid applicationId',
          data: {
            objectId: appRole.applicationId,
            objectType: 'applicationId'
          }
        });
      }

      // validate roleId
      if (!appRole.roleId || !validator.isUUID(appRole.roleId)) {
        logger.error(
          'updateOrganizationInvite.applicationRole.roleId: Invalid roleId'
        );
        throw new errors.InvalidInput({
          message: 'applicationRole.roleId: Invalid roleId',
          data: {
            objectId: appRole.roleId,
            objectType: 'roleId'
          }
        });
      }
    });
  }

  async function _validateAndGetOrgInvite(organizationInviteId, context) {
    // validate organizationGuid
    if (!organizationInviteId || !validator.isUUID(organizationInviteId)) {
      logger.error(
        'bll.updateOrganizationInvite: Invalid organizationInviteId'
      );
      throw new errors.InvalidInput({
        message: 'bll.updateOrganizationInvite: Invalid organizationInviteId',
        data: {
          objectId: organizationInviteId,
          objectType: 'organizationInviteId'
        }
      });
    }
    // get organizationInvitation to validate existence and state
    const orgInvites = await serviceContext.dal.organizationInvite.getOrganizationInvites(
      {},
      { organizationInviteId },
      context
    );
    if (!orgInvites || orgInvites.length !== 1) {
      throw new errors.NotFound({
        message: 'organizationInviteId not found or access denied',
        data: {
          objectId: organizationInviteId,
          objectType: 'organizationInvite'
        }
      });
    }
    return orgInvites[0];
  }

  /**
   * @param {string|number} expiresIn jsonwebtoken `expiresIn` (e.g. "7d", "24h", or seconds as a number)
   */
  const _createPasswordResetToken = (
    organizationGuid,
    organizationId,
    userId,
    expiresIn
  ) => {
    const passwordResetToken = jwt.sign(
      {
        contentOrganizationId: organizationId,
        contentApplicationId: organizationGuid,
        userId: userId,
        scope: [
          {
            actions: ['user:create']
          }
        ]
      },
      _.get(config, 'jwt.secret'),
      {
        jwtid: uuid.v4(),
        expiresIn,
        subject: 'engine-run'
      }
    );
    return passwordResetToken;
  };

  /** Must match the string used when verifying admin approve/deny links tokens. */
  const REGISTRATION_REQUEST_REVIEW_JWT_SCOPE = 'approve-or-deny-registration-request';

  /**
   * Admin approve/deny link. Registered `sub` is `organizationInviteId`; `purpose` and iss/aud are in
   * `@veritone/functional-permissions-lib/shared-jwt.js`.
   *
   * @param {string|number} expiresIn jsonwebtoken `expiresIn` (e.g. "168h", "7d", or seconds as a number)
   */
  const _createAdminActionToken = (organizationInviteId, expiresIn) => {
    return jwt.sign(
      { purpose: JWT_PURPOSE_SELF_SERVICE_ORG_INVITE_REGISTRATION_REVIEW },
      _.get(config, 'jwt.secret'),
      {
        subject: organizationInviteId,
        jwtid: uuid.v4(),
        expiresIn,
        issuer: JWT_ISSUER_CORE_GRAPHQL_SERVER,
        audience: JWT_AUDIENCE_CORE_ADMIN_SERVER
      }
    );
  };

  /**
   * Invitee email-verification link. Registered `sub` is `organizationInviteId`; `purpose` and iss/aud are in
   * `@veritone/functional-permissions-lib/shared-jwt.js`.
   *
   * @param {string|number} expiresIn jsonwebtoken `expiresIn` (e.g. "24h", or seconds as a number)
   */
  const _createEmailVerificationToken = (organizationInviteId, expiresIn) => {
    return jwt.sign(
      { purpose: JWT_PURPOSE_SELF_SERVICE_ORG_INVITE_EMAIL_VERIFICATION },
      _.get(config, 'jwt.secret'),
      {
        subject: organizationInviteId,
        jwtid: uuid.v4(),
        expiresIn,
        issuer: JWT_ISSUER_CORE_GRAPHQL_SERVER,
        audience: JWT_AUDIENCE_CORE_ADMIN_SERVER
      }
    );
  };

  const _getEventDetailsForDelete = (isAdmin, err, organizationName, organizationId, firstName, lastName) => {
    if (isAdmin) {
      const baseMsg = `an organization invitation to ${organizationName} (${organizationId}) from user ${firstName} ${lastName}`;
      return {
        eventName: supportedEvents.OrganizationInvitationRevoke,
        description: err ? `Failed to revoke ${baseMsg}` : `Revoked ${baseMsg}`
      };
    }
    
    const baseMsg = `an invitation to organization ${organizationName} (${organizationId})`;
    return {
      eventName: supportedEvents.OrganizationInvitationRejected,
      description: err ? `Failed to reject ${baseMsg}` : `Rejected ${baseMsg}`
    };
  };

  const _getEventDetailsByAction = (input) => {
    const { action, err, email, organizationName, organizationId, firstName, lastName, isAdmin } = input;
    const actionMap = {
      complete: {
        eventName: supportedEvents.OrganizationInvitationAccepted,
        successMsg: `Accepted an invitation to organization ${organizationName} (${organizationId})`,
        failMsg: `Failed to accept an invitation to organization ${organizationName} (${organizationId})`
      },
      approve: {
        eventName: supportedEvents.OrganizationRequestApproved,
        successMsg: `Accepted an organization request from ${email}`,
        failMsg: `Failed to accept an organization request from ${email}`
      },
      reject: {
        eventName: supportedEvents.OrganizationRequestRejected,
        successMsg: `Rejected an organization request from ${email}`,
        failMsg: `Failed to reject an organization request from ${email}`
      },
      resend: {
        eventName: supportedEvents.OrganizationInvitation,
        successMsg: `Invited ${email} to organization ${organizationName} (${organizationId})`,
        failMsg: `Failed to invite ${email} to organization ${organizationName} (${organizationId})`
      }
    };

    if (action === 'delete') {
      return _getEventDetailsForDelete(isAdmin, err, organizationName, organizationId, firstName, lastName);
    }

    const actionConfig = actionMap[action];
    if (actionConfig) {
      return {
        eventName: actionConfig.eventName,
        description: err ? actionConfig.failMsg : actionConfig.successMsg
      };
    }

    return {
      eventName: supportedEvents.Unknown,
      description: 'Unsupported Event Emitted'
    };
  };

  const _emitFailedOrganizationInviteUpdate = async (context, input, err) => {
    const { action, organizationInviteId, email, userId } = input;
    const { organizationId, organizationName } = _.get(context, '_authInfo.organization');
    
    const event = {
      serviceName: 'core-graphql-server',
      organizationInviteId,
      organizationId,
      organizationName
    };
    
    let firstName = undefined;
    let lastName = undefined;
    try {
      const user = await serviceContext.dal.admin.getUserBasicInfo({ userId: userId }, context);
      firstName = _.get(user, 'firstName');
      lastName = _.get(user, 'lastName');
    } catch (error) {
      logger.warn('Error in _emitFailedOrganizationInviteUpdate.getUserBasicInfo: ', error);
    }

    const isAdmin = resUtil.isSuperAdmin(context._authInfo) || resUtil.isOrgAdmin(context._authInfo);
    const { eventName, description } = _getEventDetailsByAction(
      {
        action,
        err,
        email,
        organizationName,
        organizationId,
        firstName,
        lastName,
        isAdmin,
      }
    );

    event.actionInfo = messageUtil.buildActionInfo(
      userId || email || '',
      err,
      null,
      null,
      description
    );
    await messageUtil.emitPublicEvent(eventName, 'system', context, event);
  };

  const updateOrganizationInvite = async (context, args) => {
    const { input } = args;
    const { organizationInviteId, action } = input;
    const requestorId = _.get(context, '_authInfo.userId');

    try {
      // TODO the _validateAccess only checks that the user is an org admin,
      // not that it's an org admin of the given org
      // is that wrong?
      _validateAccess(action, input, context);

      const orgInvite = await _validateAndGetOrgInvite(
        organizationInviteId,
        context
      );
      let appRolesMutable = true;
      if (
        orgInvite.status !== 'submitted' &&
        orgInvite.status !== 'requested'
      ) {
        // don't overwrite the message if the invitation is already approved/rejected/completed
        input.message = orgInvite.message;
        appRolesMutable = false;
      }
      if (!appRolesMutable || _.isEmpty(input.applicationRoles)) {
        // don't change the app roles if not passed in or the state doesn't allow it.
        // Due to the way the dal is implemented we always need to pass in the current value.
        const currentAppRoles = await serviceContext.dal.organizationInvite.getApplicationAndRoleIds(
          { organizationInviteId },
          context
        );
        input.applicationRoles = currentAppRoles;
      }
      input.email = orgInvite.email || input.email;
      input.userId = orgInvite.userId || input.userId;
      _validateActionState(action, orgInvite.status);
      _validateApplicationRoles(input.applicationRoles);

      // Verify applications and roles actually exist in the db
      if (enableStrictRoleValidation) {
        await serviceContext.dal.organizationInvite.validateApplicationRolesExist(context, input.applicationRoles, orgInvite.organizationId);
      }

      // Approve: self-service (`self_signup`) sends notification email only — no user provisioning
      // or password-reset token here (invitee completes via verification / `complete`). Standard
      // invites get a password-reset token for the welcome flow.
      if (action === 'approve') {

        await validateSeatLimit(orgInvite.organizationId, input.email, context, 'approve');

        if (!_isSelfSignupInvite(orgInvite)) {
          const invitedOrgGuid = await serviceContext.dal.application.getAppIdFromOrgId(
            orgInvite.organizationId
          );
          const passwordResetTokenDays = _.get(
            config,
            'organizationInvite.expirationDate',
            7
          );
          input.passwordResetToken = _createPasswordResetToken(
            invitedOrgGuid,
            orgInvite.organizationId,
            requestorId,
            `${passwordResetTokenDays}d`
          );
        }
      }

      // When resending an invitation, update the expiration date and token
      if (action === 'resend') {
        await validateSeatLimit(orgInvite.organizationId, input.email, context, 'resend');
        const inviteRenewalDays = _.get(
          config,
          'organizationInvite.expirationDate',
          7 // default 7 days
        );
        input.expirationDate = moment()
          .add(inviteRenewalDays, 'days')
          .unix();
        const invitedOrgGuid = await serviceContext.dal.application.getAppIdFromOrgId(
          orgInvite.organizationId
        );
        input.passwordResetToken = _createPasswordResetToken(
          invitedOrgGuid,
          orgInvite.organizationId,
          requestorId,
          `${inviteRenewalDays}d`
        );
      }

      if (
        orgInvite.userId &&
        orgInvite.userId !== requestorId &&
        action === 'complete'
      ) {
        logger.error(
          'updateOrganizationInvite: action not allowed by other user'
        );
        throw new errors.NotAllowed({
          message: 'Complete action is only allowed by Invitee'
        });
      }

      if (action === 'complete' && orgInvite) {
        await validateSeatLimit(orgInvite.organizationId, input.email, context, 'complete');
        // If new user, create, then update userId in organization_invite table.
        if (!orgInvite.userId) {
          const newUser = await _createNewUserOrganizationInvite(
            context,
            orgInvite
          );

          orgInvite.userId = newUser.userId;

          // retroactively update organization_invite with userId
          await serviceContext.dal.organizationInvite.updateOrgInviteWithNewUserId(
            context,
            orgInvite
          );
        }
      }
      const runUpdateInviteTx = async (trans) => {
        const orgInv = await serviceContext.dal.organizationInvite.updateOrganizationInvite(
          context,
          { input },
          trans
        );

        // In case action is "complete", add user to organization
        if (action === 'complete' && orgInv) {
          const orgGuiId = await serviceContext.dal.application.getAppIdFromOrgId(
            orgInv.organizationId,
            trans
          );
          const organizationGuiIds = await serviceContext.dal.admin.getOrganizationGuidsForUser(
            {
              id: orgInv.userId
            },
            context,
            trans
          );

          if (orgInv.userDetails) {
            try {
              await serviceContext.dal.admin.addUserCustomProfile(
                {
                  userId: orgInv.userId,
                  organizationGuid: orgGuiId,
                  userDetails: orgInv.userDetails
                },
                trans
              );
            } catch (e) {
              logger.error('Failed to add user custom profile', e);
            }
            if (orgInv.userDetails.customRegistrationId) {
              try {
                await serviceContext.dal.admin.setUserSetting(
                  {
                    requestContext: {
                      userInfo: {
                        userId: orgInv.userId,
                        organization: {
                          organizationId: orgInv.organizationId
                        }
                      }
                    }
                  },
                  {
                    input: {
                      userId: orgInv.userId,
                      key: 'customRegistrationId',
                      value: orgInv.userDetails.customRegistrationId
                    }
                  }
                );
              } catch (e) {
                logger.error(
                  'Failed to set customRegistrationId to user setting',
                  e
                );
              }
            }

            // Terms-of-Service acceptance, keyed by the id of the accepted document — the form the
            // first-login terms check reads. Deliberately uncaught: it runs inside `trans` and
            // before addUserToOrganization, so a failure rolls back the invite completion rather
            // than leaving a user with no acceptance on record.
            if (orgInv.userDetails.acceptedTermsFileId) {
              await serviceContext.dal.admin.upsertUserSetting(
                {
                  userId: orgInv.userId,
                  key: orgInv.userDetails.acceptedTermsFileId,
                  value: new Date().toUTCString()
                },
                trans
              );
            }
          }
          // check if the user is already added to the organization
          if (!organizationGuiIds.includes(orgGuiId)) {
            const commonArgs = {
              userId: orgInv.userId,
              userName: orgInv.email,
              organizationGuid: orgGuiId
            };
            const newArgs = {
              ...commonArgs,
              roleIds: _.map(input.applicationRoles, 'roleId'),
              addByOrgInvite: true
            };
            await serviceContext.dal.admin.addUserToOrganization(
              newArgs,
              context,
              trans
            );

            const eventArgs = {
              input: {
                payload: {
                  ...commonArgs,
                  eventType: 'org_invite_add_user_to_organization',
                  timestamp: moment().toISOString(),
                  success: true
                }
              },
              organizationId: orgInv.organizationId
            };
            await serviceContext.dal.event.emitAuditEvent(context, eventArgs);
          }
        }

        return orgInv;
      };

      const orgInviteDb = await serviceContext.dbConnections['sso'].write.tx(
        'updateOrganizationInviteBll',
        runUpdateInviteTx
      );

      await _sendNotificationAndEmail(context, orgInviteDb, input);

      return orgInviteDb;
    } catch (err) {
      // emit failed invite update event based on the action
      await _emitFailedOrganizationInviteUpdate(context, input, err);
      if (err.name === 'not_allowed') {
        throw err;
      }
      if (err.name === 'invalid_input') {
        throw err;
      }

      const code = _.get(err.data, 'internalData.code');
      if (code === 0) {
        throw new errors.InternalServerError({
          message: 'No data returned from the query',
          data: {
            organizationInviteId: organizationInviteId
          }
        });
      }
      throw new errors.InternalServerError(err);
    }
  };

  const _createNewUserOrganizationInvite = async (context, orgInvite) => {
    const { email, organizationId, organizationInviteId } = orgInvite;
    const currentAppRoles = await serviceContext.dal.organizationInvite.getApplicationAndRoleIds(
      { organizationInviteId },
      context
    );
    const details = _parseStoredInviteUserDetails(orgInvite.userDetails);
    const provisioningPasswordHash = _getProvisioningPasswordHashFromInvite(orgInvite);
    const newArgs = {
      input: {
        email,
        organizationId,
        name: orgInvite.email,
        createdByOrgInvite: true,
        roleIds: currentAppRoles.map((appRole) => appRole.roleId),
        authGroupIds: Array.isArray(orgInvite.authGroupIds)
          ? orgInvite.authGroupIds
          : [],
        ...(provisioningPasswordHash && { passwordHash: provisioningPasswordHash }),
        ...(details?.firstName && { firstName: details.firstName }),
        ...(details?.lastName && { lastName: details.lastName })
      }
    };

    const newUser = await serviceContext.dal.admin.createUser(newArgs, context);

    if (_.isEmpty(newUser)) {
      throw new errors.ServiceFailure({
        message: 'Create new user for organization invitation fail.'
      });
    }

    return newUser;
  };

  const deleteOrganizationInvite = async (context, args) => {
    /*
      mutation deleteOrgInv {
        deleteOrganizationInvite (organizationInviteId: "") {
          DeletePayload...
        }
      }
      Both user and admin can delete invitation!
      0. New Users
        - New users should not have access to this mutation. They become regular user after first login.
      1. User actions
        - Delete its own invitation only.
      2. Admin actions
        - Delete New User (Before New User first login)
        - Delete Invitations.
    */
    const { organizationInviteId } = args;
    const requestorUserId = _.get(context._authInfo, 'userId');

    // validate organizationId
    const orgInvite = await _validateAndGetOrgInvite(
      organizationInviteId,
      context
    );

    const { userId, organizationId } = orgInvite;

    // delete invitation
    if (
      _isAdminForOrganization(context, organizationId) ||
      requestorUserId === userId
    ) {
      // If status in approved. Send notification to invitation creator when delete own invitation
      if (
        _.get(orgInvite, 'status') === 'approved' &&
        requestorUserId === userId
      ) {
        // send notification to creator
        await _sendNotificationAndEmail(context, orgInvite, {
          action: 'delete'
        });
      }

      return await serviceContext.dal.organizationInvite.deleteOrganizationInvite(
        context,
        orgInvite
      );
    } else {
      throw new errors.AuthorizationError(
        'bll.deleteOrganizationInvite: Not authorized to perform the action.'
      );
    }
  };

  const _emitOrganizationInvitationEvent = async (context, args) => {
    const {
      organizationId,
      organizationName,
      inviteeUserId,
      inviteeEmail,
      organizationInviteId,
      error,
      applicationRoles
    } = args;
    const requestAdmin = _.get(context, '_authInfo');

    if (!error && _.isNil(inviteeUserId) && _.isNil(inviteeEmail)) {
      logger.info('userId empty, do not emit event.');
      return;
    }

    if (
      !error &&
      (_.isNil(organizationId) ||
        _.isNil(organizationName) ||
        _.isNil(inviteeEmail) ||
        _.isNil(organizationInviteId))
    ) {
      throw new errors.InvalidInput({
        message: 'Missing required arguments.',
        data: args
      });
    }

    const event = {
      serviceName: 'core-graphql-server',
      adminUserId: _.get(requestAdmin, 'userId'),
      adminFirstName: _.get(requestAdmin, 'kvp.firstName', ''),
      adminLastName: _.get(requestAdmin, 'kvp.lastName', ''),
      organizationId,
      organizationName,
      inviteeUserId,
      inviteeEmail,
      organizationInviteId,
      applicationRoles,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        inviteeUserId || inviteeEmail || '',
        error,
        null,
        null,
        !error
          ? `Invited ${inviteeEmail} to organization ${organizationName} (${organizationId})`
          : `Failed to invite ${inviteeEmail} to organization ${organizationName} (${organizationId})`
      )
    };
    // emit public event
    event.timestampMs = Date.now().valueOf().toString();
    try {
      await messageUtil.emitPublicEvent(
        supportedEvents.OrganizationInvitation,
        'system',
        context,
        event
      );
    } catch (err) {
      logger.error(
        '[_emitOrganizationInvitationEvent] Error on emitting public event',
        err
      );
      throw err;
    }
  };

  const _emitOrganizationRequestEvent = async (context, args) => {
    const {
      organizationId,
      organizationName,
      requestEmail,
      organizationInviteId,
      error,
      inviteeUserId
    } = args;
    const requestor = _.get(context, '_authInfo');

    if (
      !error &&
      (_.isNil(organizationId) ||
        _.isNil(organizationName) ||
        _.isNil(requestEmail) ||
        _.isNil(organizationInviteId))
    ) {
      throw new errors.InvalidInput({
        message: 'Missing required arguments.',
        data: args
      });
    }

    const event = {
      serviceName: 'core-graphql-server',
      senderUserId: _.get(requestor, 'userId'),
      senderFirstName: _.get(requestor, 'kvp.firstName', ''),
      senderLastName: _.get(requestor, 'kvp.lastName', ''),
      organizationId,
      organizationName,
      requestEmail,
      organizationInviteId,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        inviteeUserId || requestEmail || '',
        error,
        null,
        null,
        !error
          ? `Sent an organization invitation request for ${organizationName} (${organizationId}) to ${requestEmail}`
          : `Failed to send an organization invitation request for ${organizationName} (${organizationId}) to ${requestEmail}`
      )
    };
    // emit public event
    event.timestampMs = Date.now().valueOf().toString();

    try {
      await messageUtil.emitPublicEvent(
        supportedEvents.OrganizationRequest,
        'system',
        context,
        event
      );
    } catch (err) {
      logger.error(
        '[_emitOrganizationRequestEvent] Error on emitting public event',
        err
      );
      throw err;
    }
  };

  const _postOrganizationRequestNotification = async (context, args) => {
    const { requestEmail, organizationInviteId, userIds = [] } = args;

    if (
      _.isNil(requestEmail) ||
      _.isNil(organizationInviteId) ||
      _.isEmpty(userIds)
    ) {
      throw new errors.InvalidInput({
        message: 'Missing required arguments.',
        data: args
      });
    }

    const requestor = _.get(context, '_authInfo');
    const senderFirstName = _.get(requestor, 'kvp.firstName');
    const senderLastName = _.get(requestor, 'kvp.lastName');

    try {
      // TODO: Handle view action for the notification
      const notificationArgs = {
        input: {
          mailboxIds: userIds,
          body: `${senderFirstName}, ${senderLastName} has requested that ${requestEmail} join this organization`,
          contentType: 'text/plain',
          flags: ['unread'],
          applicationId: 'system',
          eventName: 'OrganizationRequest',
          eventType: 'organizationInvite'
        }
      };

      await serviceContext.bll.notification.post(context, notificationArgs);
    } catch (err) {
      logger.error(
        '[_postOrganizationRequestNotification] Error on posting organization request notification',
        err
      );
      throw err;
    }
  };

  const _postOrganizationInvitationNotification = async (context, args) => {
    const {
      organizationId,
      organizationName,
      inviteeUserId,
      inviteeEmail,
      organizationInviteId
    } = args;

    if (_.isNil(inviteeUserId)) {
      logger.info('userId empty, do not send notification.');
      return;
    }

    if (
      _.isNil(organizationId) ||
      _.isNil(organizationName) ||
      _.isNil(inviteeEmail) ||
      _.isNil(organizationInviteId)
    ) {
      throw new errors.InvalidInput({
        message: 'Missing required arguments.',
        data: args
      });
    }
    const requestAdmin = _.get(context, '_authInfo');
    const adminFirstName = _.get(requestAdmin, 'kvp.firstName', '');
    const adminLastName = _.get(requestAdmin, 'kvp.lastName', '');

    try {
      // TODO: Handle accept and reject actions
      const notificationArgs = {
        input: {
          mailboxIds: [inviteeUserId],
          body: `${adminFirstName}, ${adminLastName} has invited you to the ${organizationName}`,
          contentType: 'text/plain',
          flags: ['unread'],
          applicationId: 'system',
          eventName: 'OrganizationInvitation',
          eventType: 'organizationInvite'
        }
      };

      await serviceContext.bll.notification.post(context, notificationArgs);
    } catch (err) {
      logger.error(
        '[_postOrganizationInvitationNotification] Error on posting organization invitation notification',
        err
      );
      throw err;
    }
  };

  /**
   * Self-service request-to-join while the invite is pending org approval (`submitted`).
   * Emails org admins an action link, emails the invitee an under-review template, and emits a
   * public organization-request event.
   *
   * @param {object} context Request / GraphQL context.
   * @param {object} orgInvite Persisted organization invite (camelCase fields).
   * @param {object} organization Organization from DAL (includes `organizationName`).
   * @returns {Promise<void>}
   */
  async function _notifyRequestToJoinSubmittedPendingApproval(
    context,
    orgInvite,
    organization
  ) {
    const users = await serviceContext.dal.user.getOrgAdminUsers(context, {
      organizationId: orgInvite.organizationId
    });
    const adminActionTemplate = _.get(
      config,
      'organizationInvite.selfServiceAdminActionEmailTemplate',
      'self-service-org-invite-admin-action'
    );
    const inviteeUnderReviewTemplate = _.get(
      config,
      'organizationInvite.selfServiceInviteeUnderReviewEmailTemplate',
      'self-service-org-invite-under-review'
    );
    if (users.length > 0) {
      const adminActionTokenHours = _.get(
        config,
        'organizationInvite.adminActionTokenExpirationHours',
        168
      );
      const adminActionToken = _createAdminActionToken(
        orgInvite.organizationInviteId,
        `${adminActionTokenHours}h`
      );
      const { desktopUrlApprove, desktopUrlDeny } = _buildSelfServiceAdminActionReviewUrls(
        adminActionToken
      );
      await Promise.all(
        users.map((adminUser) =>
          serviceContext.dal.notification.sendEmailTemplate(context, {
            templateName: adminActionTemplate,
            toEmailAddress: adminUser.userName,
            mergeKvp: {
              organization_name: organization.organizationName,
              invitee_email: orgInvite.email,
              admin_action_token: adminActionToken,
              desktop_url_approve: desktopUrlApprove,
              desktop_url_deny: desktopUrlDeny,
              ..._getOrganizationInviteLegalUrlMergeKvp()
            },
            mergeLanguage: 'handlebars'
          })
        )
      );
    }
    await serviceContext.dal.notification.sendEmailTemplate(context, {
      templateName: inviteeUnderReviewTemplate,
      toEmailAddress: orgInvite.email,
      mergeKvp: {
        organization_name: organization.organizationName,
        invitee_email: orgInvite.email,
        ..._getOrganizationInviteLegalUrlMergeKvp()
      },
      mergeLanguage: 'handlebars'
    });
    await _emitOrganizationRequestEvent(context, {
      organizationInviteId: orgInvite.organizationInviteId,
      organizationId: orgInvite.organizationId,
      organizationName: organization.organizationName,
      requestEmail: orgInvite.email,
      inviteeUserId: orgInvite.userId
    });
  }

  /**
   * Self-service request-to-join approved (either auto-approved on create, or manually approved
   * by an admin on update): sends the invitee an email-verification link so they can finish
   * onboarding.
   *
   * @param {object} context Request / GraphQL context.
   * @param {object} orgInvite Persisted organization invite.
   * @param {object} organization Organization from DAL.
   * @returns {Promise<void>}
   */
  async function _notifySelfServiceRequestApproved(
    context,
    orgInvite,
    organization
  ) {
    const emailVerificationTemplate = _.get(
      config,
      'organizationInvite.selfServiceEmailVerificationEmailTemplate',
      'self-service-org-invite-email-verification'
    );
    const emailVerificationHours = _.get(
      config,
      'organizationInvite.emailVerificationTokenExpirationHours',
      24
    );
    const emailVerificationToken = _createEmailVerificationToken(
      orgInvite.organizationInviteId,
      `${emailVerificationHours}h`
    );
    const verifyUrl = _buildSelfServiceEmailVerificationUrl(
      emailVerificationToken
    );
    await serviceContext.dal.notification.sendEmailTemplate(context, {
      templateName: emailVerificationTemplate,
      toEmailAddress: orgInvite.email,
      mergeKvp: {
        organization_name: organization.organizationName,
        verify_url: verifyUrl,
        ..._getOrganizationInviteLegalUrlMergeKvp()
      },
      mergeLanguage: 'handlebars'
    });
  }

  /**
   * Admin-created invite that is already approved: in-app notification to the invitee, welcome
   * email with optional password reset, and invitation public event.
   *
   * @param {object} context Request / GraphQL context.
   * @param {object} orgInvite Persisted organization invite (includes `userId` when the invitee account exists).
   * @param {object} organization Organization from DAL.
   * @returns {Promise<void>}
   */
  async function _notifyAdminCreatedApprovedInvite(
    context,
    orgInvite,
    organization
  ) {
    const payloadArgs = {
      organizationInviteId: orgInvite.organizationInviteId,
      organizationId: orgInvite.organizationId,
      organizationName: organization.organizationName,
      inviteeUserId: orgInvite.userId,
      inviteeEmail: orgInvite.email
    };
    await _postOrganizationInvitationNotification(context, payloadArgs);
    const userRes = await serviceContext.dal.admin.getUsersWithBasicInfo(
      { userIds: [orgInvite.userId] },
      context
    );
    const mainEmail = _.get(_.head(userRes), 'email', orgInvite.email);
    await _sendEmail(context, {
      invitee: {
        userId: orgInvite.userId,
        email: mainEmail,
        userName: orgInvite.email,
        organizationId: orgInvite.organizationId
      },
      message: orgInvite.message,
      passwordResetToken: orgInvite.passwordResetToken,
      organizationInviteId: orgInvite.organizationInviteId
    });
    await _emitOrganizationInvitationEvent(context, payloadArgs);
  }

  /**
   * Non-admin submitting a standard invite request (`submitted`): notify org admins, email each
   * admin a request summary, and emit an organization-request event for the invitee email.
   *
   * @param {object} context Request / GraphQL context.
   * @param {object} orgInvite Persisted organization invite.
   * @param {object} organization Organization from DAL.
   * @returns {Promise<void>}
   */
  async function _notifyNonAdminSubmittedInviteRequest(
    context,
    orgInvite,
    organization
  ) {
    const users = await serviceContext.dal.user.getOrgAdminUsers(context, {
      organizationId: orgInvite.organizationId
    });
    const payloadArgs = {
      organizationInviteId: orgInvite.organizationInviteId,
      requestEmail: orgInvite.email
    };
    if (users.length > 0) {
      await _postOrganizationRequestNotification(context, {
        ...payloadArgs,
        userIds: _.map(users, 'userId')
      });
    }
    await Promise.all(
      users.map((user) =>
        _sendEmail(context, {
          isRequestEmail: true,
          adminUser: user,
          invitee: {
            organizationId: orgInvite.organizationId
          }
        })
      )
    );
    await _emitOrganizationRequestEvent(context, {
      ...payloadArgs,
      organizationId: orgInvite.organizationId,
      organizationName: organization.organizationName,
      inviteeUserId: orgInvite.userId
    });
  }

  /**
   * Create-path notifications after `createOrganizationInvite` request-to-join (self-service) vs
   * standard email invite based on `requestToJoinOrganization` value.
   *
   * @param {object} context Request / GraphQL context.
   * @param {object} orgInvite Persisted organization invite.
   * @param {object} organization Organization from DAL.
   * @param {boolean} requestToJoinOrganization Whether this is a self-service join request.
   * @returns {Promise<void>}
   */
  async function _notifyCreateFlowOrganizationInvite(
    context,
    orgInvite,
    organization,
    requestToJoinOrganization
  ) {
    if (requestToJoinOrganization) {
      // self-signup user request to join flow
      if (orgInvite.status === 'submitted') {
        // only submitted, still requires approval
        await _notifyRequestToJoinSubmittedPendingApproval(
          context,
          orgInvite,
          organization
        );
        return;
      }

      // already approved, required no approval/confirmation
      if (orgInvite.status === 'approved') {
        await _notifySelfServiceRequestApproved(
          context,
          orgInvite,
          organization
        );
      }
      return;
    }

    // standard user invite flow

    // already approved, required no approval/confirmation
    if (orgInvite.status === 'approved') {
      await _notifyAdminCreatedApprovedInvite(context, orgInvite, organization);
    }

    // only submitted, still requires approval
    if (orgInvite.status === 'submitted') {
      await _notifyNonAdminSubmittedInviteRequest(
        context,
        orgInvite,
        organization
      );
    }
  }

  /**
   * Invitee accepting (`complete`) or declining (`delete`) an invitation they received.
   * Notifies `orgInvite.createdBy` and emits the matching invitation event.
   *
   * @param {object} context Request / GraphQL context.
   * @param {object} orgInvite Persisted organization invite.
   * @param {object} organization Organization from DAL.
   * @param {string} action Update action; only `complete` and `delete` are handled here (`delete` means invitee declined).
   * @returns {Promise<void>}
   */
  async function _notifyInviteeAcceptedOrRejectedInvitation(
    context,
    orgInvite,
    organization,
    action
  ) {
    if (action !== 'delete' && action !== 'complete') {
      return;
    }
    const user = await serviceContext.dal.admin.getUserBasicInfo(
      { userId: orgInvite.userId },
      context
    );
    const { firstName, lastName, email } = user;
    const userName =
      firstName && lastName ? firstName + ' ' + lastName : email;
    const eventName =
      action === 'delete'
        ? supportedEvents.OrganizationInvitationRejected
        : supportedEvents.OrganizationInvitationAccepted;
    const payloadArgs = {
      mailboxIds: [orgInvite.createdBy],
      body: `${userName} has ${
        action === 'complete' ? 'accepted' : 'rejected'
      } your invitation to join ${organization.organizationName}`,
      eventName
    };
    await _postNotification(context, payloadArgs);
    await _emitInvitationEvent(context, {
      ...payloadArgs,
      organizationInviteId: orgInvite.organizationInviteId,
      organizationId: orgInvite.organizationId,
      organizationName: organization.organizationName,
      inviteeUserId: orgInvite.userId,
      inviteeEmail: orgInvite.email,
      description:
        action === 'delete'
          ? `Rejected an invitation to organization ${organization.organizationName} (${organization.organizationId})`
          : `Accepted an invitation to organization ${organization.organizationName} (${organization.organizationId})`
    });
  }

  /**
   * Admin resend: same welcome email as a new approved invite plus invitation public event.
   *
   * @param {object} context Request / GraphQL context.
   * @param {object} orgInvite Persisted organization invite.
   * @param {object} organization Organization from DAL.
   * @returns {Promise<void>}
   */
  async function _notifyAdminResendInvitation(
    context,
    orgInvite,
    organization
  ) {
    const payloadArgs = {
      organizationInviteId: orgInvite.organizationInviteId,
      organizationId: orgInvite.organizationId,
      organizationName: organization.organizationName,
      inviteeUserId: orgInvite.userId,
      inviteeEmail: orgInvite.email
    };
    const userRes = await serviceContext.dal.admin.getUsersWithBasicInfo(
      { userIds: [orgInvite.userId] },
      context
    );
    const mainEmail = _.get(_.head(userRes), 'email', orgInvite.email);
    await _sendEmail(context, {
      invitee: {
        userId: orgInvite.userId,
        email: mainEmail,
        userName: orgInvite.email,
        organizationId: orgInvite.organizationId
      },
      message: orgInvite.message,
      passwordResetToken: orgInvite.passwordResetToken,
      organizationInviteId: orgInvite.organizationInviteId
    });
    await _emitOrganizationInvitationEvent(context, payloadArgs);
  }

  /**
   * Notification target for flows that should reach whoever created the invite row.
   *
   * @param {object} orgInvite Persisted organization invite.
   * @returns {{ mailboxIds: string[] }}
   */
  function _baseOrganizationRequestCreatorPayload(orgInvite) {
    return { mailboxIds: [orgInvite.createdBy] };
  }

  /**
   * Best-effort load of invitee display name for revoke copy; omits names when lookup fails.
   *
   * @param {object} context Request / GraphQL context.
   * @param {object} orgInvite Persisted organization invite.
   * @returns {Promise<{ firstName?: string, lastName?: string }>}
   */
  async function _tryInviteeNameForRevokeDescription(context, orgInvite) {
    try {
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: orgInvite.userId },
        context
      );
      return {
        firstName: _.get(user, 'firstName'),
        lastName: _.get(user, 'lastName')
      };
    } catch (error) {
      logger.warn('Error in _tryInviteeNameForRevokeDescription.getUserBasicInfo: ', error);
      return { firstName: undefined, lastName: undefined };
    }
  }

  /**
   * Builds notification + event payload when an org admin approves, rejects, or revokes (`delete`)
   * a self-service join request. `approve` also sends the invitee welcome email first.
   *
   * @param {object} context Request / GraphQL context.
   * @param {object} orgInvite Persisted organization invite.
   * @param {object} organization Organization from DAL.
   * @param {string} action `approve`, `reject`, or `delete` (admin revoke - not invitee decline).
   * @param {string} adminFirstName Acting admin first name (from auth KVP).
   * @param {string} adminLastName Acting admin last name (from auth KVP).
   * @returns {Promise<object|null>} Arguments for `_postNotification` and `_emitRequestEvent`, or `null` if `action` is unsupported.
   */
  async function _buildAdminOrganizationRequestPayload(
    context,
    orgInvite,
    organization,
    action,
    adminFirstName,
    adminLastName
  ) {
    const base = _baseOrganizationRequestCreatorPayload(orgInvite);
    if (action === 'approve') {
      if (_isSelfSignupInvite(orgInvite)) {
        await _notifySelfServiceRequestApproved(context, orgInvite, organization);
      } else {
        await _sendEmail(context, {
          invitee: {
            userId: orgInvite.userId,
            email: orgInvite.email,
            userName: orgInvite.email,
            organizationId: orgInvite.organizationId
          },
          message: orgInvite.message,
          passwordResetToken: orgInvite.passwordResetToken,
          organizationInviteId: orgInvite.organizationInviteId
        });
      }
      return {
        ...base,
        body: `${adminFirstName} ${adminLastName} has approved your invitation request for ${orgInvite.email} to join ${organization.organizationName}`,
        eventName: supportedEvents.OrganizationRequestApproved,
        organizationId: orgInvite.organizationId,
        organizationName: organization.organizationName,
        requestUserId: orgInvite.userId,
        requestEmail: orgInvite.email,
        organizationInviteId: orgInvite.organizationInviteId,
        description: `Accepted an organization request from ${orgInvite.email}`
      };
    }
    if (action === 'reject') {
      return {
        ...base,
        body: `${adminFirstName} ${adminLastName} has denied your invitation request for ${orgInvite.email} to join ${organization.organizationName}. If you have further question, please reach out to the organization admin.`,
        eventName: supportedEvents.OrganizationRequestRejected,
        organizationId: orgInvite.organizationId,
        organizationName: organization.organizationName,
        requestUserId: orgInvite.userId,
        requestEmail: orgInvite.email,
        organizationInviteId: orgInvite.organizationInviteId,
        description: `Rejected an organization request from ${orgInvite.email}`
      };
    }
    if (action === 'delete') {
      const { firstName, lastName } = await _tryInviteeNameForRevokeDescription(
        context,
        orgInvite
      );
      return {
        ...base,
        body: `${adminFirstName} ${adminLastName} has denied your invitation request for ${orgInvite.email} to join ${organization.organizationName}. If you have further question, please reach out to the organization admin.`,
        eventName: supportedEvents.OrganizationInvitationRevoke,
        organizationId: orgInvite.organizationId,
        organizationName: organization.organizationName,
        requestUserId: orgInvite.userId,
        requestEmail: orgInvite.email,
        organizationInviteId: orgInvite.organizationInviteId,
        description: `Revoked an organization invitation to ${organization.organizationName} (${organization.organizationId}) from user ${firstName} ${lastName}`
      };
    }
    return null;
  }

  /**
   * Update-flow side effects after an invite mutation: invitee accept/decline, admin resend, and
   * admin decisions on pending requests (separate from invitee `delete`, which is decline).
   *
   * @param {object} context Request / GraphQL context.
   * @param {object} orgInvite Persisted organization invite.
   * @param {object} organization Organization from DAL.
   * @param {boolean} isAdmin Whether the caller is an org admin for `orgInvite.organizationId`.
   * @param {string} [action] Update action from `notifyInput`.
   * @returns {Promise<void>}
   */
  async function _notifyUpdateInviteSideEffects(
    context,
    orgInvite,
    organization,
    isAdmin,
    action
  ) {
    // Invitee accepting or declining an invitation addressed to them (`complete` / `delete`).
    await _notifyInviteeAcceptedOrRejectedInvitation(
      context,
      orgInvite,
      organization,
      action
    );

    if (isAdmin && action === 'resend') {
      await _notifyAdminResendInvitation(context, orgInvite, organization);
    }

    // Admin approve / reject / revoke for a self-service request; `delete` here is admin revoke.
    if (!isAdmin || !['approve', 'reject', 'delete'].includes(action)) {
      return;
    }

    const requestAdmin = _.get(context, '_authInfo');
    const adminFirstName = _.get(requestAdmin, 'kvp.firstName', '');
    const adminLastName = _.get(requestAdmin, 'kvp.lastName', '');
    const requestPayload = await _buildAdminOrganizationRequestPayload(
      context,
      orgInvite,
      organization,
      action,
      adminFirstName,
      adminLastName
    );
    if (!requestPayload) {
      return;
    }
    // In-app notification only when the invite row records a creator (avoids empty mailbox).
    if (orgInvite.createdBy) {
      await _postNotification(context, requestPayload);
    }
    await _emitRequestEvent(context, requestPayload);
  }

  /**
   * Sends emails, in-app notifications, and public events for organization invite create/update.
   * Does not mutate `input`; uses a normalized copy when the caller omits it.
   *
   * @param {object} context Request / GraphQL context.
   * @param {object} orgInvite Persisted organization invite after the mutation.
   * @param {object} [input] Optional notify payload (`action`, tokens, `requestToJoinOrganization`, etc.).
   * @returns {Promise<void>}
   */
  const _sendNotificationAndEmail = async (context, orgInvite, input) => {
    const notifyInput =
      input === undefined || input === null ? {} : input;
    if (_.isEmpty(orgInvite)) {
      throw new errors.InvalidInput({
        message: 'Organization Invite is required',
        data: orgInvite
      });
    }
    const isAdmin = _isAdminForOrganization(context, orgInvite.organizationId);

    const organization = await serviceContext.dal.organization.getOrganization(
      context,
      { id: orgInvite.organizationId },
      false
    );

    // Create path: no `action` value means it is a self-service join or a standard invite.
    if (!_.get(notifyInput, 'action')) {
      await _notifyCreateFlowOrganizationInvite(
        context,
        orgInvite,
        organization,
        Boolean(notifyInput.requestToJoinOrganization)
      );
      return;
    }

    // Update path: `action` selects invitee vs admin flows (including admin revoke as `delete`).
    const action = _.get(notifyInput, 'action');
    await _notifyUpdateInviteSideEffects(
      context,
      orgInvite,
      organization,
      isAdmin,
      action
    );
  };

  const _postNotification = async (context, args) => {
    const { mailboxIds, body, eventName } = args;

    if (_.isNil(mailboxIds) || _.isNil(body) || _.isNil(eventName)) {
      throw new errors.InvalidInput({
        message: '_postNotification: Missing required arguments.',
        data: args
      });
    }

    try {
      const notificationArgs = {
        input: {
          mailboxIds: mailboxIds,
          body: body,
          contentType: 'text/plain',
          flags: ['unread'],
          applicationId: 'system',
          eventName: eventName,
          eventType: 'organizationInvite'
        }
      };

      await serviceContext.bll.notification.post(context, notificationArgs);
    } catch (err) {
      logger.error(
        `[${eventName}] Error on posting organization invitation notification`,
        err
      );
      throw err;
    }
  };

  const _emitInvitationEvent = async (context, args) => {
    const {
      organizationId,
      organizationName,
      inviteeUserId,
      inviteeEmail,
      organizationInviteId,
      eventName,
      error,
      description
    } = args;

    if (
      _.isNil(organizationId) ||
      _.isNil(organizationName) ||
      _.isNil(inviteeUserId) ||
      _.isNil(inviteeEmail) ||
      _.isNil(organizationInviteId)
    ) {
      throw new errors.InvalidInput({
        message: 'Missing required arguments.',
        data: args
      });
    }

    const eventTypeInfo = eventsMap[eventName];
    if (_.isNil(eventTypeInfo)) {
      logger.error(
        `[emit${eventName}Event] eventTypeInfo was not found by event name`
      );
      throw new Error(
        `the eventTypeInfo was not found by event name: ${eventName}`
      );
    }

    // admin info empty, because createBy and approval admin can be different
    const event = {
      serviceName: 'core-graphql-server',
      adminUserId: '',
      adminFirstName: '',
      adminLastName: '',
      organizationId,
      organizationName,
      inviteeUserId,
      inviteeEmail,
      organizationInviteId,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        inviteeUserId || inviteeEmail || '',
        error,
        null,
        null,
        description
      )
    };

    // emit public event
    event.timestampMs = Date.now().valueOf().toString();
    try {
      await messageUtil.emitPublicEvent(eventName, 'system', context, event);
    } catch (err) {
      logger.error(
        `[emit${eventName}Event] Error on emitting public event`,
        err
      );
      throw err;
    }
  };

  const _emitRequestEvent = async (context, args) => {
    const {
      organizationId,
      organizationName,
      requestUserId,
      requestEmail,
      organizationInviteId,
      eventName,
      error,
      description
    } = args;
    const requestor = _.get(context, '_authInfo');

    const eventTypeInfo = eventsMap[eventName];
    if (_.isNil(eventTypeInfo)) {
      logger.error(
        `[emit${eventName}Event] eventTypeInfo was not found by event name`
      );
      throw new Error(
        `the eventTypeInfo was not found by event name: ${eventName}`
      );
    }

    if (
      _.isNil(organizationId) ||
      _.isNil(organizationName) ||
      _.isNil(requestEmail) ||
      _.isNil(organizationInviteId)
    ) {
      throw new errors.InvalidInput({
        message: 'Missing required arguments.',
        data: args
      });
    }

    const event = {
      serviceName: 'core-graphql-server',
      senderUserId: _.get(requestor, 'userId'),
      senderFirstName: _.get(requestor, 'kvp.firstName', ''),
      senderLastName: _.get(requestor, 'kvp.lastName', ''),
      organizationId,
      organizationName,
      requestEmail,
      organizationInviteId,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        requestUserId || requestEmail || '',
        error,
        null,
        null,
        description
      )
    };
    // emit public event
    event.timestampMs = Date.now().valueOf().toString();

    try {
      await messageUtil.emitPublicEvent(eventName, 'system', context, event);
    } catch (err) {
      logger.error(
        `[emit${eventName}Event] Error on emitting public event`,
        err
      );
      throw err;
    }
  };

  const getInvitationLink = async (args) => {
    const {
      applicationId, // default application
      userId,
      isRequestEmail = false, // If true, send an email to get an approval from Admin
      email,
      passwordResetToken,
      organizationInviteId
    } = args;

    // Default link if no defaultApp link.
    let redirectParam;
    const configuredLoginUri = _.get(config, 'pageUris.loginUri', '');
    const legacyLoginRoute = `https://login.${util.getDnsZoneName()}/`;
    const loginRoute = configuredLoginUri.length
      ? `${_.trimEnd(configuredLoginUri, '/')}/`
      : legacyLoginRoute;
    const defaultApplicationId = applicationId;

    if (!_.isEmpty(defaultApplicationId)) {
      const application = await serviceContext.dal.application.getApplication({
        id: defaultApplicationId
      });
      const applicationUrl = _.get(application, 'applicationUrl');

      if (applicationUrl) {
        redirectParam = `${_.trimEnd(
          applicationUrl,
          '/'
        )}/?panel=invite-requests`;
      }
    }

    let btnLink = `${_.trimEnd(loginRoute, '#')}`;
    if (!_.isEmpty(redirectParam)) {
      btnLink = `${btnLink}?redirect=${encodeURIComponent(redirectParam)}`;
    }

    /* There are two cases:
      - Send a request to Admin or send the invitation to existing user:
          + The link point to Login page
      - Send a request to a new email:
          + The link point to reset-password page. Complete the invitation and create a new user
          + https://steel-ventures.atlassian.net/browse/AWT-5666 (UI ticket) Needs to be finished
    */
    if (
      !isRequestEmail &&
      _.isEmpty(userId) &&
      !_.isEmpty(passwordResetToken)
    ) {
      let resetPasswordUrl = _.get(
        config,
        'organizationInvite.linkToOrgInviteResetPassword',
        ''
      );
      if (!resetPasswordUrl.length) {
        const configuredResetPasswordUri = _.get(
          config,
          'pageUris.resetPasswordUri',
          ''
        );
        resetPasswordUrl = configuredResetPasswordUri.length
          ? `${_.trimEnd(configuredResetPasswordUri, '/')}/`
          : `${legacyLoginRoute}reset-password/`;
      }

      btnLink = `${resetPasswordUrl}?resettoken=${encodeURIComponent(
        passwordResetToken
      )}&username=${encodeURIComponent(email)}&redirect=${encodeURIComponent(
        redirectParam
      )}&organizationinviteid=${encodeURIComponent(organizationInviteId)}`;
    }

    return btnLink;
  };

  const _sendEmail = async (context, args) => {
    const {
      adminUser,
      invitee,
      isRequestEmail = false, // If true, send an email to get an approval from Admin
      message,
      passwordResetToken,
      organizationInviteId
    } = args;

    if (!isRequestEmail && _.isNil(invitee)) {
      throw new errors.InvalidInput({
        message: 'Invitee is required.',
        data: {
          objectId: invitee,
          objectType: 'Invitee'
        }
      });
    }

    if (!isRequestEmail && _.isNil(organizationInviteId)) {
      throw new errors.InvalidInput({
        message:
          '[sendOrganizationInvitationEmail] OrganizationInviteId is required.',
        data: args
      });
    }

    if (isRequestEmail && _.isNil(adminUser)) {
      throw new errors.InvalidInput({
        message: 'Admin user is required.',
        data: {
          objectId: adminUser,
          objectType: 'User'
        }
      });
    }

    const organizationId =
      invitee.organizationId ||
      _.get(context._authInfo, 'organization.organizationId');
    const organization = await serviceContext.dal.organization.getOrganization(
      context,
      { id: organizationId },
      false
    );
    const defaultApplicationId = _.get(
      organization,
      'kvp.features.defaultApplication'
    );

    let mergeVar = {};
    let toEmailAddress;
    let emailTemplate;
    const legalUrlMerge = _getOrganizationInviteLegalUrlMergeKvp();
    const requestor = _.get(context, '_authInfo');
    const requestorAvatar = await resUtil.getSignedUrl(
      _.get(requestor, 'kvp.image')
    );
    const requestorShortName = resUtil.getUserShortenName(
      _.get(requestor, 'kvp.firstName', ''),
      _.get(requestor, 'kvp.lastName', '')
    );
    const requestorFullName = dalUtil.getUserFullName(requestor);

    if (isRequestEmail) {
      toEmailAddress = adminUser.userName;
      emailTemplate = _.get(
        config,
        'organizationInvite.orgInviteRequestEmailTemplate',
        'new-organization-invite-requests'
      );
      const urlToLearnMore = _.get(
        config,
        'organizationInvite.urlToLearnMore',
        ''
      );
      const submittedOrgInvites = await serviceContext.dal.organizationInvite.getOrganizationInvites(
        {
          organizationId
        },
        { status: 'submitted' }
      );
      // Get a link to accept/ view the invitation
      const btnLink = await getInvitationLink({
        applicationId: defaultApplicationId,
        isRequestEmail
      });

      mergeVar = {
        url_view_requests: btnLink,
        user_count: submittedOrgInvites.length,
        url_learn_more: urlToLearnMore
      };
    } else {
      toEmailAddress = invitee.email || invitee.userName;
      emailTemplate = _.get(
        config,
        'organizationInvite.orgInviteEmailTemplate',
        'new-organization-invitations'
      );
      const urlToSupport = _.get(
        config,
        'organizationInvite.urlToSupport',
        'support@veritone.com'
      );
      const expirationDate = _.get(
        config,
        'organizationInvite.expirationDate',
        7 // default 7 days
      );

      const orgIcon = await resUtil.getSignedUrl(
        _.get(organization, 'kvp.image')
      );

      // Get a link to accept/ view the invitation
      const btnLink = await getInvitationLink({
        applicationId: defaultApplicationId,
        userId: invitee.userId,
        isRequestEmail,
        email: toEmailAddress,
        passwordResetToken,
        organizationInviteId
      });

      mergeVar = {
        expiration_date: `${expirationDate} days`,
        optional_message: message,
        organization_icon: orgIcon,
        url_to_support: urlToSupport,
        url_acceptable_invitation: btnLink
      };
    }

    return serviceContext.dal.notification.sendEmailTemplate(context, {
      templateName: emailTemplate,
      toEmailAddress: toEmailAddress,
      mergeKvp: {
        ...mergeVar,
        organization_name: organization.organizationName,
        requestor_avatar: requestorAvatar,
        requestor_name: requestorFullName,
        requestor_shortname: requestorShortName,
        ...legalUrlMerge
      },
      mergeLanguage: 'handlebars'
    });
  };

  return {
    createOrganizationInvite,
    updateOrganizationInvite,
    deleteOrganizationInvite,
    getInvitationLink,
    validateOrganization,
    validateSeatLimit,
  };

  function _validateEmail(email) {
    var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  }
};
