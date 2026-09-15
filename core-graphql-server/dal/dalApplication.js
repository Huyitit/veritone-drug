const mapper = require('./mapper.js');
const _ = require('lodash');
const { promisify } = require('util');
const pgp = require('pg-promise')({ promiseLib: Promise });
const uuid = require('uuid');
const uid = require('uid-safe');
const LRU = require('lru-cache');
const url = require('url');
const validator = require('validator');
const event = require('./event.js');
const { supportedEvents } = require('@veritone/core-server-base/events-map');

module.exports = function createFunction(logger, config, serviceContext) {
  const util = require('./util.js')(config, serviceContext);
  const errors = require('../error')(config);
  const entityTags = require('./entityTags.js')(serviceContext, errors);
  const storageDeleteAsset = promisify(serviceContext.storage.deleteAsset);
  const { NotFound, InvalidInput, NotAllowed } = errors;
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const mainUtil = require('../util.js')(serviceContext);
  const constants = require('../util/appConstants.js')(serviceContext);
  const dalEvents = require('./event.js')(serviceContext);
  const fpUtil = require('../modules/rbacAuth/dal/functionalPermissionsUtil.dal')(
    serviceContext
  );
  const lruCacheMaxAgeInMs = config.lruCacheMaxAgeInMs || 600000; // default: 10 minutes
  const lruCacheMaxItems = config.lruCacheMaxItems || 500;
  const appIdToOrgIdCache = new LRU({
    max: lruCacheMaxItems,
    ttl: lruCacheMaxAgeInMs
  });
  const messageUtil = serviceContext.messageUtil;
  const returningApplication = `
    metadata_version, application_id, application_name, application_key, application_status,
    application_description, application_icon_url, application_icon_svg, application_check_permissions,
    owner_organization_id, application_url, oauth2_redirect_urls, oauth2_client_secret, permissions_required,
    deployment_model, created_date, updated_date, event_endpoint, public, headerbar_enabled`;
  const jobTable = 'job_new';
  const applicationOrganizationSettingReturning = {
    application_id: null,
    organization_guid: null,
    key: null,
    type: null,
    description: null,
    value: null
  };
  const applicationOrganizationSettingSelect = `
    aos.application_id,
    aos.organization_guid,
    aos.key,
    aos.type,
    aos.description,
    aos.value
  `;
  const applicationOrganizationSelect = `
    ao.application_id,
    ao.organization_id,
    ao.application_state,
    ao.event_handler_user_id,
    su.status as user_status
  `;
  const returningAppHeaderbar = {
    headerbar_name: null,
    background_color: null,
    help_enabled: null,
    notification_enabled: null,
    logo_src: null,
    date_created: null,
    date_modified: null,
    created_by: null,
    modified_by: null
  };

  const returningAppDetails = {
    application_id: null,
    type: null,
    content: null
  };

  const applicationOrderByMap = {
    name: 'application_name',
    status: 'application_status',
    url: 'application_url',
    createdDateTime: 'created_date',
    modifiedDateTime: 'updated_date'
  };

  const orderDirectionMap = {
    desc: 'DESC',
    asc: 'ASC'
  };

  const configLevelEnum = {
    user: 'user',
    organization: 'organization',
    instance: 'instance'
  };

  const configTypeEnum = {
    Boolean: 'Boolean',
    Date: 'Date',
    Float: 'Float',
    Integer: 'Integer',
    JSON: 'JSON'
  };

  const accessScopeEnum = {
    public: 'public',
    owned: 'owned',
    granted: 'granted',
    any: 'any'
  };

  const ACTION_DETAILS = {
    ApplicationCreate: {
      success: (data) => `Created application ${data.name}`,
      failure: (data, error) =>
        `Failed to create application for reason: ${error?.message}`
    },
    ApplicationUpdate: {
      success: (data) => `Updated application ${data.name}`,
      failure: (data, error) =>
        `Failed to update application ${data.id} for reason: ${error?.message}`
    },
    ApplicationDelete: {
      success: (data) => `Deleted application ${data.id}`,
      failure: (data, error) =>
        `Failed to delete application ${data.id} for reason: ${error?.message}`
    }
  };

  function sanitizeApplicationUrl(url) {
    if (!url) return url;
    let lcURL = url.toLowerCase();
    const validUrlFormat = /^(?:https:\/\/)?(?:[-\w]*(?:\*(?=\.))?(?:\.[-\w]{1,63}).+)$/;
    const localhost = /(localhost)/;
    if (!validUrlFormat.test(lcURL) || localhost.test(lcURL)) {
      throw new errors.InvalidInput({
        message:
          'Application URL is not valid: http porotocol, localhost and * are not permitted'
      });
    }
    return lcURL;
  }

  async function createApplication(args, context) {
    try {
      const apiRoot = _.get(context, 'config.apiRoot');
      const nodeEnv = _.get(context, 'config.nodeEnv');
      const lowerEnvs = ['dev', 'stage'];
      let isLowerEnv = false;
      if (apiRoot) {
        isLowerEnv = _.intersection(apiRoot.split('.'), lowerEnvs).length > 0;
      } else if (nodeEnv) {
        isLowerEnv = nodeEnv != 'prod';
      }
      const input = {
        ...args.input,
        contextMenuExtensions: mapper.mapContextMenuExtensionsIn(
          args.input.contextMenuExtensions,
          InvalidInput
        )
      };
      if (input.metadataVersion === 0) {
        throw new errors.InvalidInput({
          message: 'metadataVersion 0 is not a valid value'
        });
      }

      const headerbar = _.get(input, 'headerbar', []);
      const details = _.get(input, 'details', {});
      const events = _.get(input, 'events', []);
      const eventSubscriptions = _.get(input, 'eventSubscriptions', []);

      const applicationConfigDefinition = _.get(
        input,
        'applicationConfigDefinition',
        []
      );

      const enableAppEventFeature = _.get(
        serviceContext,
        'config.featureFlags.enableAppEventFeature',
        false
      );

      // id is an optional field. If provided, check it's a UUID
      if (input.id) {
        try {
          mainUtil.checkId(input.id, true, false, true);
        } catch (e) {
          throw new errors.InvalidInput({
            message: e.message,
            data: { id: input.id }
          });
        }
      }

      let isPublic = false;
      if (_.isBoolean(input.isPublic)) {
        if (!allowedToSetPublic(context)) {
          throw new errors.NotAllowed({
            message:
              'The authenticated user or token does not have privileges ' +
              'to update this application.'
          });
        }

        isPublic = input.isPublic;
      }

      const oauth2RedirectUrls = _.isNil(input.oauth2RedirectUrls)
        ? null
        : _.isArray(input.oauth2RedirectUrls)
        ? input.oauth2RedirectUrls.join(',')
        : input.oauth2RedirectUrls;
      /* this is to prevent bottlenecking apps that run locally
      for testing/debugging purposes in lower environments */
      const applicationUrl = isLowerEnv
        ? input.url
        : sanitizeApplicationUrl(input.url);

      const application = {
        applicationId: input.id || null,
        applicationName: input.name,
        applicationKey: _.snakeCase(input.name),
        applicationDescription: input.description,
        applicationIconUrl: resUtil.stripOwnedStorageUrlSignature(
          input.iconUrl
        ),
        applicationIconSvg: resUtil.stripOwnedStorageUrlSignature(
          input.iconSvg
        ),
        ownerOrganizationId: input.organizationId,
        applicationUrl: applicationUrl || '',
        public: isPublic,
        oauth2RedirectUrls: oauth2RedirectUrls,
        permissionsRequired: input.permissionsRequired,
        applicationCheckPermissions: !!input.checkPermissions,
        deploymentModel: mapper.mapDeploymentModelIn(input.deploymentModel),
        entityTags: input.entityTags || null,
        headerbarEnabled: _.isNil(input.headerbarEnabled)
          ? true
          : input.headerbarEnabled,
        status: input.status,
        metadataVersion: input.metadataVersion || 1,
        packageDistributionType: input.packageDistributionType,
        applicationRoles: input.applicationRoles
      };

      if (enableAppEventFeature) {
        application.eventEndpoint = input.eventEndpoint;
      }

      const hasConflict = await checkApplicationNameOrKeyConflict({
        id: input.id,
        name: input.name,
        key: input.key
      });

      if (hasConflict) {
        throw new InvalidInput({
          message:
            'The request input did not pass validation checks. See the data section for detail on validation errors.',
          data: {
            validationErrors: [
              {
                fieldName: 'key',
                fieldValue: input.key,
                message: 'An application with this key already exists'
              },
              {
                fieldName: 'name',
                fieldValue: input.name,
                message: 'An application with this name already exists'
              }
            ]
          }
        });
      }

      // check permissions in application roles
      if (!_.isNil(application.applicationRoles)) {
        const validateAppRolePerms = _validateApplicationRolePermissions(
          application.applicationRoles
        );
        if (validateAppRolePerms && !_.isNil(validateAppRolePerms.error)) {
          logger.warn(
            `Application role's permissions are invalid: ${validateAppRolePerms.error}`
          );
          throw validateAppRolePerms.error;
        }
      }

      const createAppResults = await createApplicationDb(
        application,
        input.contextMenuExtensions,
        headerbar,
        details,
        events,
        eventSubscriptions,
        context,
        _.get(input, 'disableAutoPackageCreation', false)
      );
      if (_.isNil(createAppResults.applicationId)) {
        return createAppResults;
      }
      if (!_.isEmpty(applicationConfigDefinition)) {
        _.forEach(applicationConfigDefinition, (config) => {
          config.appId = createAppResults.applicationId;
          config.orgId = createAppResults.organizationId;
        });
        const res = await applicationConfigDefinitionTx(
          { input: applicationConfigDefinition },
          context,
          false
        );
        createAppResults.applicationConfigDefinition = res;
      }

      // emit event
      _emitPublicEvent(
        context,
        supportedEvents.ApplicationCreate,
        createAppResults
      );

      return createAppResults;
    } catch (err) {
      _emitPublicEvent(
        context,
        supportedEvents.ApplicationCreate,
        {
          status: 'failure'
        },
        err
      );
      throw err;
    }
  }

  async function createApplicationDetails(options, context, db) {
    const { input, appId } = options;
    const attributes = Object.keys(input);
    const dbConn = db || serviceContext.dbConnections['sso'].write;

    const columnData = [];
    attributes.forEach((item) => {
      if (item.indexOf('useCases') >= 0) {
        columnData.push({
          application_id: appId,
          type: item,
          content: {
            format: 'markdown',
            data: input[item]
          }
        });
      } else {
        const type =
          typeof input[item] === 'object' ? 'json' : typeof input[item];
        columnData.push({
          application_id: appId,
          type: item,
          content: {
            format: type,
            data: input[item]
          }
        });
      }
    });

    const { sql, values } = mainUtil.makeInsertSql(
      'public.application_metadata',
      columnData,
      returningAppDetails
    );

    try {
      const result = await dbConn.map(
        sql,
        values,
        mapper.mapApplicationDetails
      );
      return result;
    } catch (err) {
      throw new errors.InternalServerError(err);
    }
  }
  // This validates permission enums
  // when creating application roles via createApplication mutation.
  // The result will have the format: { success: boolean, error: Error }
  function _validateApplicationRolePermissions(appRole) {
    const result = {
      success: false,
      error: null
    };

    const defaultBlacklistPerms = [
      'ADMIN_CREATE_APPLICATION_JWT',
      'AIWARE_ADMIN_CREATE_APPLICATION_JWT',
      'ADMIN_ORG_CREATE',
      'ADMIN_ORG_UPDATE',
      'ADMIN_ROLES_CREATE',
      'ADMIN_ROLES_DELETE',
      'ADMIN_ROLES_UPDATE',
      'CMS_CUSTOMERSERVICE',
      'SUPERADMIN',
      'VERITONE_FINANCEADMIN',
      'VERITONE_SUPERADMIN',
      'AIWARE_ADMIN_INSTANCE_ADMIN',
    ];

    const blacklistPerms =
      _.get(config, 'rbac.permissions.blacklist') || defaultBlacklistPerms;
    const whitelistPerms = _.get(config, 'rbac.permissions.whitelist');
    // In some envs the configurations are not set
    // So the whitelist is undefined or empty, that means we no need to check the app role in white list
    const shouldCheckWhitelist =
      _.isArray(whitelistPerms) && !_.isEmpty(whitelistPerms) ? true : false;

    let appRoles = [];
    let invalidRoles = [];
    if (_.isNil(appRole)) {
      result.error = new InvalidInput({
        message: 'the application role is required to validate'
      });
      return result;
    }

    if (_.isArray(appRole)) {
      appRoles.push(...appRole);
    } else {
      appRoles = [appRole];
    }

    appRoles.forEach((ar) => {
      const invalidPermissions = [];
      if (_.isArray(ar.permissions) && ar.permissions.length > 0) {
        ar.permissions.forEach((p) => {
          const per = p.toUpperCase();
          if (
            blacklistPerms.includes(per) ||
            (shouldCheckWhitelist && !whitelistPerms.includes(per))
          ) {
            invalidPermissions.push(p);
          }
        });

        if (invalidPermissions.length > 0) {
          invalidRoles.push({
            id: ar.id,
            name: ar.name,
            invalidPermissions: invalidPermissions
          });
        }
      }
    });

    if (invalidRoles.length > 0) {
      result.error = new NotAllowed({
        message:
          'the application roles are invalid. Some permissions are not allowed',
        data: {
          applicationRoles: invalidRoles,
          roles: {
            whitelist: whitelistPerms,
            blacklist: blacklistPerms
          }
        }
      });
      return result;
    }

    result.success = true;
    return result;
  }

  async function updateApplication(args, context) {
    let app;
    try {
      const input = {
        ...args.input,
        contextMenuExtensions: mapper.mapContextMenuExtensionsIn(
          args.input.contextMenuExtensions,
          InvalidInput
        )
      };

      if (input.metadataVersion === 0) {
        throw new errors.InvalidInput({
          message: 'metadataVersion 0 is not a valid value'
        });
      }
      // Check authorized to edit the application
      app = await allowedToEditApplication(context, input.id, input.isPublic);
      if (
        input.metadataVersion &&
        app.metadataVersion >= input.metadataVersion
      ) {
        const msg =
          'The app metadata version specified must be greater than ' +
          app.metadataVersion;
        throw new errors.InvalidInput({
          message: msg,
          data: {
            validationErrors: [
              {
                fieldName: 'metadataVersion',
                fieldValue: input.metadataVersion,
                message: msg
              }
            ]
          }
        });
      }
      // Check to see if another application already has this key or name.
      const hasConflict = await checkApplicationNameOrKeyConflict({
        id: input.id,
        name: input.name,
        key: input.key
      });

      if (hasConflict) {
        throw new InvalidInput({
          message: `The request input did not pass validation checks. See the data section for detail on validation errors.`,
          data: {
            validationErrors: [
              {
                fieldName: 'key',
                fieldValue: input.key,
                message: 'An application with this key already exists'
              },
              {
                fieldName: 'name',
                fieldValue: input.name,
                message: 'An application with this name already exists'
              }
            ]
          }
        });
      }

      // Check if they can edit the application with the statuses associated with
      // the application
      if (
        resUtil.checkIfApplicationFieldsWillUpdate(input, app) &&
        !resUtil.canEditApplicationFromStatus(
          app.applicationStatus,
          context._authInfo
        )
      ) {
        throw new errors.NotAllowed({
          message:
            'The authenticated user or token does not have privileges ' +
            'to update this application with this status.'
        });
      }

      // Passed all checks, can update
      const result = await doUpdateApplication(input, context, app, args);
      // emit event
      _emitPublicEvent(context, supportedEvents.ApplicationUpdate, result);

      return result;
    } catch (err) {
      if (!app) {
        app = {};
      }
      _emitPublicEvent(
        context,
        supportedEvents.ApplicationUpdate,
        {
          ...app,
          status: 'failure',
          id: args.input?.id,
        },
        err
      );
      throw err;
    }
  }

  async function doUpdateApplication(input, context, app, args) {
    var checkPerm = input.checkPermissions;
    if (!_.isBoolean(checkPerm)) {
      checkPerm = app.checkPerm;
    }
    var depModel = input.deploymentModel;
    if (!_.isString(depModel)) {
      depModel = app.deploymentModel;
    }
    var depModelInt = mapper.mapDeploymentModelIn(depModel);
    var oauthUrls = _.isNil(input.oauth2RedirectUrls)
      ? app.oauth2RedirectUrls
      : input.oauth2RedirectUrls;
    const urlStr = _.isArray(oauthUrls) ? oauthUrls.join(',') : oauthUrls;
    const enableAppEventFeature = _.get(
      serviceContext,
      'config.featureFlags.enableAppEventFeature',
      false
    );
    var isPublic = input.isPublic;
    if (!_.isBoolean(isPublic)) {
      isPublic = app.public;
    }

    var application = {
      applicationId: app.id,
      applicationName: input.name || app.name,
      applicationStatus: app.status,
      applicationKey: app.applicationKey, // does not change
      applicationDescription:
        input.description === undefined ? app.description : input.description,
      applicationIconUrl: _.isNil(input.iconUrl)
        ? app.iconUrl || ''
        : resUtil.stripOwnedStorageUrlSignature(input.iconUrl),
      applicationIconSvg: _.isNil(input.iconSvg)
        ? app.iconSvg || ''
        : resUtil.stripOwnedStorageUrlSignature(input.iconSvg),
      applicationUrl: _.isNil(input.url) ? app.url || '' : input.url,
      oauth2RedirectUrls: urlStr,
      permissionsRequired: input.permissionsRequired || app.permissionsRequired,
      applicationCheckPermissions: !!checkPerm,
      deploymentModel: depModelInt,
      public: isPublic,
      headerbarEnabled: _.isNil(input.headerbarEnabled)
        ? app.headerbarEnabled
        : input.headerbarEnabled,
      metadataVersion: input.metadataVersion || app.metadataVersion + 1
    };

    if (enableAppEventFeature) {
      application.eventEndpoint = _.get(
        input,
        'eventEndpoint',
        app.eventEndpoint
      );
    }

    let uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'applications/' + app.id;

    if (!_.isNil(input.applicationRoles)) {
      const validateAppRolePerms = _validateApplicationRolePermissions(
        input.applicationRoles
      );
      if (validateAppRolePerms && !_.isNil(validateAppRolePerms.error)) {
        logger.warn(
          `Application role's permissions are invalid: ${validateAppRolePerms.error}`
        );
        throw validateAppRolePerms.error;
      }
    }

    const updatedApplication = await util.httpCall(
      uri,
      context,
      application,
      mapper.mapApplication,
      'PUT'
    );

    // if icon is changed or deleted, delete the old icon file from S3
    if (
      !_.isEmpty(app.iconUrl) &&
      url.parse(updatedApplication.iconUrl).pathname !==
        url.parse(app.iconUrl).pathname
    ) {
      try {
        await storageDeleteAsset({
          _uri: app.iconUrl
        });
      } catch (err) {
        logger.error(`error deleting app icon: ${err}`);
      }
    }

    const contextMenuExtensions = input.contextMenuExtensions;

    if (!_.isEmpty(contextMenuExtensions)) {
      const query = generateContextMenuUpsertQuery(
        updatedApplication.applicationId,
        contextMenuExtensions
      );

      await serviceContext.dbConnections['sso'].write.none(query);
    }

    const applicationConfigDefinition = _.get(
      input,
      'applicationConfigDefinition',
      []
    );

    if (!_.isEmpty(applicationConfigDefinition)) {
      _.forEach(applicationConfigDefinition, (config) => {
        config.filter = {
          appId: updatedApplication.applicationId,
          orgId: updatedApplication.organizationId,
          configKey: config.configKey
        };
      });
      await applicationConfigDefinitionTx(
        { input: applicationConfigDefinition },
        context,
        true
      );
    }

    const events = _.get(input, 'events', []);
    let eventsResults = [];
    if (!_.isEmpty(events)) {
      const [updatedEvents, newEvents] = _.partition(events, (event) =>
        _.has(event, 'id')
      );
      if (!_.isEmpty(newEvents)) {
        const newEventsResults = await serviceContext.dal.event.batchCreateEvents(
          context,
          {
            organizationId: app.organizationId,
            input: _.map(newEvents, (event) => ({
              ...event,
              application: updatedApplication.applicationId
            }))
          }
        );
        eventsResults = _.concat(eventsResults, newEventsResults);
      }

      if (!_.isEmpty(updatedEvents)) {
        const updatedEventsResults = await serviceContext.dal.event.batchUpdateEvents(
          context,
          {
            organizationId: app.organizationId,
            input: _.map(updatedEvents, (event) =>
              _.omit(event, [
                'eventName',
                'eventType',
                'public',
                'schemaData',
                'application'
              ])
            )
          }
        );
        eventsResults = _.concat(eventsResults, updatedEventsResults);
      }
    }
    // if entityTags field is in input, synchronize entity_tags table with corresponding rows
    const tagData = {
      entityId: application.applicationId,
      organizationId: app.organizationId,
      entityType: 'app',
      entityTags: input.entityTags
    };
    await entityTags.updateEntityTags(tagData, updatedApplication, context);

    const useAutomaticPackageCreation = await mainUtil.isOrgSettingEnabled(
      context,
      'automaticPackageCreation'
    );

    if (useAutomaticPackageCreation) {
      await generatePackage(
        {
          ...updatedApplication,
          packageDistributionType: input.packageDistributionType
        },
        context,
        true
      );
    }
    const eventSubscriptions = _.get(input, 'eventSubscriptions', []);
    if (!_.isEmpty(eventSubscriptions)) {
      if (!_.isEmpty(events) && !eventsResults) {
        throw new errors.NotAllowed({
          message:
            'Failed to update events, cannot proceed with subscribing to events.'
        });
      }

      const subscribeEvents = [];
      const unsubscribeEvents = [];
      eventSubscriptions.forEach((item) => {
        if (item.action && item.action.toUpperCase() === 'UNSUBSCRIBE') {
          unsubscribeEvents.push(item.id);
        } else {
          subscribeEvents.push({
            ...item,
            application: application.applicationId
          });
        }
      });
      const subscribeEventResult = await serviceContext.dal.event.batchSubscribeEvent(
        context,
        {
          input: subscribeEvents,
          organizationId: app.organizationId
        }
      );
      await serviceContext.dal.event.batchUnsubscribeEvent(context, {
        ids: unsubscribeEvents,
        organizationId: app.organizationId
      });
    }
    if (!_.isNil(input.headerbar)) {
      await updateApplicationHeaderbar(
        {
          appId: application.applicationId,
          orgId: app.organizationId,
          input: input.headerbar
        },
        context
      );
    }

    if (!_.isNil(input.details)) {
      await updateApplicationDetails(
        {
          appId: application.applicationId,
          input: input.details
        },
        context
      );
    }

    if (_.isArray(input.applicationRoles)) {
      await updateApplicationRoles(
        {
          appStatus: application.applicationStatus,
          appId: application.applicationId,
          orgId: app.organizationId,
          roles: input.applicationRoles
        },
        context
      );
    }

    return { ...updatedApplication, contextMenuExtensions };
  }

  function applicationWorkflow(args, context) {
    const input = args.input;
    // before updating the app we need to fetch current app data
    // to fill in any fields that are not being set by the user
    var params = { id: input.id, adminView: true };
    if (input.action === 'undelete') params.status = 'deleted';
    return getApplications(params).then(function (data) {
      return doApplicationWorkflow(input, context, data);
    });
  }

  function doApplicationWorkflow(input, context, data) {
    if (!(data.records && data.records.length)) {
      throw new NotFound({
        data: {
          objectId: input.id,
          objectType: 'Application'
        }
      });
    }
    var app = data.records[0];
    var uri = context.config.services.coreAdminUri;
    if (!uri.endsWith('/')) uri += '/';
    uri += 'applications/' + input.id + '/' + input.action;

    var checkPerm = input.checkPermissions;
    if (typeof checkPerm !== 'boolean') {
      checkPerm = app.checkPerm;
    }
    var depModel = input.deploymentModel;
    if (typeof depModel !== 'string') {
      depModel = app.deploymentModel;
    }
    var depModelInt = mapper.mapDeploymentModelIn(depModel);
    var oauthUrls = input.oauth2RedirectUrls || app.oauth2RedirectUrls;
    var urlStr = oauthUrls ? oauthUrls.join(',') : null;
    var payload = {};

    return util
      .httpCall(uri, context, payload, mapper.mapApplication, 'POST')
      .then(async function (result) {
        // if deploying application, update the latest package in the lineage to published as well
        const packagesResult = await serviceContext.dal.packages.getPackages(
          context,
          {
            primaryResourceId: input.id
          },
          true
        );

        const currentAppsPackage = _.get(packagesResult, 'records[0]');

        // If the package was not created, simply bypass it and continue updating the application state.
        if (!_.isNil(currentAppsPackage)) {
          const {
            latestNonDeletedPackage
          } = await serviceContext.dal.packages.getLatestPackageInLineage(
            currentAppsPackage.sourceOriginId
          );

          const appToPackageStatusMap = {
            draft: 'draft',
            pending: 'draft',
            rejected: 'draft',
            approved: 'draft',
            active: 'published',
            disabled: 'deactivated',
            deleted: 'deactivated'
          };

          const packageInput = {
            packageId: latestNonDeletedPackage.packageId,
            status: appToPackageStatusMap[result.status],
            currentPackageName: latestNonDeletedPackage.name, // for audit logging purpose
          };

          if (app.distributionType !== 'private') {
            packageInput.distributionDate = new Date();
          }
          await serviceContext.dal.packages.packageUpdateWithoutIncrement(
            packageInput,
            context
          );
        }

        // response to update does not include a complete object. fill
        // in with the values we just retrieved.
        Object.keys(app).forEach(function (key, index) {
          if (!result[key]) {
            if (input[key]) {
              result[key] = input[key];
            } else {
              result[key] = app[key];
            }
          }
        });
        return result;
      });
  }

  async function deleteApplication(args, context) {
    let result;
    try {
      const id = args.id;
      var uri = context.config.services.coreAdminUri;
      if (!uri.endsWith('/')) uri += '/';
      uri += 'applications/' + id;

      result = await util.httpCall(
        uri,
        context,
        {},
        function () {
          return { id: id };
        },
        'DELETE'
      );

      // emit event
      _emitPublicEvent(context, supportedEvents.ApplicationDelete, result);

      return result;
    } catch (err) {
      _emitPublicEvent(
        context,
        supportedEvents.ApplicationDelete,
        {
          id: args.id,
          status: 'failure'
        },
        err
      );
      return result;
    }
  }

  async function updateApplicationComponent(args, context) {
    const { input } = args;

    const application = await getApplications({
      id: input.id,
      adminView: true
    });

    // 404 - Not found
    if (_.isEmpty(application.records)) {
      throw new NotFound({
        data: {
          objectId: input.id,
          objectType: 'Application'
        }
      });
    }

    const app = application.records[0];
    const requestor = resUtil.getClientInfo(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgMember = requestor.org === app.organizationId;
    const { hasAccess: hasPackageAccess } = await validatePackageAppAccess(
      context,
      [input.id],
      true
    );

    // Not authorized to edit this application
    if (!isSuperAdmin && !isOrgMember && !hasPackageAccess) {
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token does not have privileges ' +
          'to update this application.'
      });
    }

    try {
      if (input.type === 'dataRegistries') {
        input.componentIds.forEach(
          _.partial(mainUtil.checkId, _, null, false, true)
        );
      }
    } catch (error) {
      throw new InvalidInput({
        message: error.message,
        data: {
          validationErrors: [
            {
              fieldName: `componentIds`,
              fieldValue: _.get(error, 'data.objectId')
            }
          ]
        }
      });
    }

    const componentToUpdate = _.omit(input, 'id');

    return updateApplicationComponentDb(input.id, componentToUpdate);
  }

  async function updateApplicationBillingPlanId(args, context) {
    const applicationId = args.applicationId;
    const organizationId = args.organizationId;
    const billingPlanId = args.billingPlanId;

    const sql = `UPDATE application__organization
SET billing_plan_id = $1, billing_dirty = true
WHERE application_id = $2 AND organization_id = $3
RETURNING application_id, organization_id, billing_plan_id, billing_dirty`;
    return await serviceContext.dbConnections['sso'].write
      .one(sql, [billingPlanId, applicationId, parseInt(organizationId)])
      .then((data) => {
        return {
          applicationId: data.application_id,
          organizationId: data.organization_id,
          billingPlanId: data.billing_plan_id,
          billingDirty: data.billing_dirty
        };
      })
      .catch((err) => {
        logger.error(err);
        throw err;
      });
  }

  async function updateApplicationBillingDirty(args, context) {
    const applicationId = args.applicationId;
    const organizationId = args.organizationId;
    const billingDirty = args.billingDirty;

    const sql = `UPDATE application__organization
SET billing_dirty = $1
WHERE application_id = $2 AND organization_id = $3
RETURNING application_id, organization_id, billing_dirty`;
    return serviceContext.dbConnections['sso'].write
      .one(sql, [billingDirty, applicationId, organizationId])
      .then((data) => {
        return {
          applicationId: data.application_id,
          organizationId: data.organization_id,
          billingDirty: data.billing_dirty
        };
      })
      .catch((err) => {
        logger.error(err);
        throw err;
      });
  }

  async function getContextMenuExtensions(options) {
    let sql = `SELECT
        cme.application_context_menu_id,
        cme.application_id,
        cme.type,
        cme.label,
        cme.url
    FROM application_context_menu cme`;

    const sqlParams = [];
    const sqlWhere = [];

    if (options.id) {
      sqlParams.push(options.id);
      sqlWhere.push(`cme.application_context_menu_id = \$${sqlParams.length}`);
    }
    if (options.applicationId) {
      sqlParams.push(options.applicationId);
      sqlWhere.push(`cme.application_id = \$${sqlParams.length}`);
    }
    if (options.organizationId) {
      sql +=
        ' INNER JOIN application a ON cme.application_id = a.application_id';
      sqlParams.push(options.organizationId);
      sqlWhere.push(`a.owner_organization_id = \$${sqlParams.length}`);
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ') + ';';
    }

    return serviceContext.dbConnections['sso'].read
      .map(sql, sqlParams, mapper.mapContextMenuExtension)
      .then(function (rows) {
        return rows;
      });
  }

  async function createContextMenuExtension(args, context) {
    const { id } = args.input;
    // verify application is owned by requester's org
    const application = await getApplications({
      id,
      adminView: true
    });

    // 404 - Not found
    if (_.isEmpty(application.records)) {
      throw new NotFound({
        data: {
          objectId: id,
          objectType: 'Application'
        }
      });
    }

    const app = application.records[0];
    const requestor = resUtil.getClientInfo(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgMember = requestor.org === app.organizationId;
    const { hasAccess: hasPackageAccess } = await validatePackageAppAccess(
      context,
      [id],
      true
    );

    // Not authorized to edit this application
    if (!isSuperAdmin && !isOrgMember && !hasPackageAccess) {
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token does not have privileges ' +
          'to create this resource.'
      });
    }

    const contextMenuExtension = _.pick(args.input, ['label', 'url', 'type']);

    // this field was not marked required in the schema,
    // but the database insert fails if it is not set.
    if (!contextMenuExtension.url) {
      throw new errors.InvalidInput({
        message:
          'Context menu extension url is required on createContextMenuExtension'
      });
    }

    return createContextMenuExtensionDb(id, [contextMenuExtension]);
  }

  async function updateContextMenuExtension(args, context) {
    const { id } = args.input;
    const requestor = resUtil.getClientInfo(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const options = { id };

    if (!isSuperAdmin) {
      options.organizationId = requestor.org;
    }

    // verify context menu extension is owned by requester's org
    const contextMenuExtension = await getContextMenuExtension(options);

    // 404 - Not found
    if (_.isEmpty(contextMenuExtension)) {
      throw new NotFound({
        data: {
          objectId: id,
          objectType: 'ContextMenuExtension'
        }
      });
    }

    return updateContextMenuExtensionDb(id, args.input);
  }

  async function deleteContextMenuExtension(args, context) {
    const { input } = args;

    if (_.isNil(input.id)) {
      throw new Error('id is required');
    }

    const requestor = resUtil.getClientInfo(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const options = { id: input.id };

    if (!isSuperAdmin) {
      options.organizationId = requestor.org;
    }

    // verify context menu extension is owned by requester's org
    const contextMenuExtension = await getContextMenuExtension(options);

    // 404 - Not found
    if (_.isEmpty(contextMenuExtension)) {
      throw new NotFound({
        data: {
          objectId: options.id,
          objectType: 'ContextMenuExtension'
        }
      });
    }

    return deleteContextMenuExtensionDb(input);
  }

  async function bulkDeleteContextMenuExtensions(args) {
    const data = await bulkDeleteContextMenuExtensionsDb(args);

    const mentions = data.filter((item) => item.type === 'mention');
    const tdos = data.filter((item) => item.type === 'tdo');
    const watchlists = data.filter((item) => item.type === 'watchlist');
    const collections = data.filter((item) => item.type === 'collection');

    return {
      mentions,
      tdos,
      watchlists,
      collections
    };
  }

  async function fileApplication(args, context) {
    const input = args.input;
    mainUtil.checkId(input.appId, 'appId');

    // see application exists
    const application = await getApplication(
      {
        id: input.appId
      },
      context
    );

    // file application. dalFolder.fileObject will validate folder access.
    const filed = await serviceContext.dal.folder.fileObject(
      context,
      input.organizationId,
      input.folderId,
      input.appId,
      serviceContext.dal.folder.TREE_OBJECT_TYPE.APPLICATION,
      input.orderIndex,
      true
    );
    // return the application
    return application;
  }

  async function unfileApplication(args, context) {
    const input = args.input;
    mainUtil.checkId(input.appId, 'appId');

    // see application exists
    const application = await getApplication(
      {
        id: args.input.appId
      },
      context
    );

    // unfile application from folder
    await serviceContext.dal.folder.unfileApplication(context, {
      input: {
        appId: input.appId,
        organizationId: input.organizationId,
        folderId: input.folderId
      }
    });

    return application;
  }

  function getAppIdFromOrgId(organizationId, dbClient) {
    const client = _.isObject(dbClient)
      ? dbClient
      : serviceContext.dbConnections['sso'].read;
    let appId = appIdToOrgIdCache.get(organizationId);
    if (appId) {
      return appId;
    }
    let sql = `
      SELECT
        application_id
      FROM sso_group
      WHERE kvp->>'organizationId' = $1::text`;
    if (!organizationId) {
      throw Error('organizationId parameter is required'); // server bug
    }
    const sqlargs = [_.toString(organizationId)];
    return client.any(sql, sqlargs).then(function (data) {
      if (!(data && data.length)) {
        throw new errors.NotFound({
          data: { objectId: organizationId, objectType: 'Organization' }
        });
      }
      const cmsApplicationId = data[0].application_id;
      appIdToOrgIdCache.set(organizationId, cmsApplicationId);
      appIdToOrgIdCache.set(cmsApplicationId, organizationId);
      return cmsApplicationId;
    });
  }

  function getApplication(options, context, existingTask = null) {
    return getApplications(options, context, existingTask).then((data) => {
      if (!data.count) {
        throw new errors.NotFound({
          data: {
            objectId: options.id,
            objectType: 'Application'
          }
        });
      }
      return data.records[0];
    });
  }

  async function readAppConfigDb(sql, args, sqlWhere, limit, offset) {
    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    if (Number.isInteger(limit)) {
      sql += ` LIMIT ${limit}`;
    }
    if (Number.isInteger(offset)) {
      sql += ` OFFSET ${offset}`;
    }

    return serviceContext.dbConnections['sso'].read
      .map(sql, args, mapper.mapApplicationConfig)
      .then((rows) => mainUtil.toPage({ offset, limit }, rows));
  }

  async function getOrganizationGuid(context, _inputOrgId) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const ownerOrgId = resUtil.getOrgFromAuthContext(context);
    let inputOrgId = _inputOrgId;
    if (inputOrgId && _.isString(inputOrgId)) {
      inputOrgId = parseInt(inputOrgId);
    }

    if (inputOrgId && inputOrgId !== ownerOrgId && !isSuperAdmin) {
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token does not have privileges ' +
          'to perform actions on the Application by Organization ID.'
      });
    }

    const orgId = inputOrgId || ownerOrgId;

    const {
      organizationGuid
    } = await serviceContext.dal.organization.getOrganization(context, {
      id: orgId
    });

    if (_.isNull(organizationGuid)) {
      throw new errors.NotFound({
        message: 'Organization GUID could not be found.',
        data: { orgId }
      });
    }

    return organizationGuid;
  }

  async function getApplicationConfig(options, context) {
    const sqlWhere = [];
    const args = [];

    const organizationGuid = await getOrganizationGuid(context, options.orgId);

    let defaultTableSelect = '';
    let joinClause = '';

    if (options.includeDefaults || !_.isNil(options.userId)) {
      defaultTableSelect = `
        acd.is_required,
        acd.is_secured,
        acd.config_level,
        acd.config_type,
        acd.config_description,
        acd.default_value,
        acd.default_value_json,
        acd.date_created AS default_created_at,
        acd.date_modified AS default_modified_at,
        acd.created_by AS default_created_by,
        acd.modified_by AS default_modified_by,
        acd.package_id,
      `;

      joinClause = `LEFT JOIN public.app_config_definition acd ON ac.application_id = acd.application_id AND ac.config_key = acd.config_key`;
    }

    let sql = `
      SELECT
        ${defaultTableSelect}
        ac.application_id,
        ac.config_key,
        ac.organization_guid,
        ac.user_id,
        ac.config_value,
        ac.config_json,
        ac.date_created,
        ac.date_modified,
        ac.created_by,
        ac.modified_by
      FROM public.app_config ac
      ${joinClause}
    `;

    args.push(options.appId);
    sqlWhere.push('ac.application_id = $' + args.length);

    args.push(organizationGuid);
    sqlWhere.push('ac.organization_guid = $' + args.length);

    if (options.userId) {
      // set configLevel to retrieve correct config definitions
      options.configLevel = 'user';
      args.push(options.userId);
      sqlWhere.push(
        `(ac.user_id = $${args.length} AND acd.config_level = 'user')`
      );
    }

    if (options.configKeyRegexp) {
      args.push(options.configKeyRegexp);
      sqlWhere.push('ac.config_key ~ $' + args.length);
    }

    const appConfigs = await readAppConfigDb(
      sql,
      args,
      sqlWhere,
      options.limit,
      options.offset
    );
    const callerOrgId = !options.orgId
      ? resUtil.getOrgFromAuthContext(context)
      : options.orgId;
    const filteredAppConfigs = await filterConfigByGrantPackage(
      appConfigs.records,
      callerOrgId
    );

    const applicationConfigDefinition = await getApplicationConfigDefinition(
      options,
      context
    );

    const mergedConfigurations = mergeConfigurations(
      filteredAppConfigs,
      applicationConfigDefinition.records
    );
    return mainUtil.toPage(
      { offset: options.offset, limit: options.limit },
      mergedConfigurations
    );
  }

  async function getApplicationDetails(options, context) {
    const sqlWhere = [];
    const sqlParams = [];
    let sql = `
      SELECT
        application_id, type, content
      FROM public.application_metadata
    `;

    mainUtil.addSqlWhere('application_id', options.appId, sqlWhere, sqlParams);
    sql += ' WHERE ' + sqlWhere.join(' AND ');
    const data = await serviceContext.dbConnections['sso'].read.map(
      sql,
      sqlParams,
      mapper.mapApplicationDetails
    );
    const details = data.reduce((a, i) => ({ ...a, ...i }), {});
    return details;
  }

  async function getApplicationConfigDefinition(options, context) {
    const sqlWhere = [];
    const args = [];

    let sql = `
      SELECT
        application_id,
        organization_guid,
        config_key,
        config_type,
        config_level,
        is_required,
        is_secured,
        config_description,
        default_value,
        default_value_json,
        date_created,
        date_modified,
        created_by,
        modified_by,
        package_id
      FROM public.app_config_definition
    `;

    // extracting information from the id
    mapper.mapApplicationConfigFromId(options);

    args.push(options.appId);
    sqlWhere.push('application_id = $' + args.length);

    if (options.configLevel) {
      args.push(options.configLevel);
      sqlWhere.push('config_level = $' + args.length);
    }

    if (options.configKey) {
      args.push(options.configKey);
      sqlWhere.push('config_key = $' + args.length);
    } else if (options.configKeyRegexp) {
      args.push(options.configKeyRegexp);
      sqlWhere.push('config_key ~ $' + args.length);
    }

    if (options.configKeys) {
      args.push(options.configKeys);
      sqlWhere.push(`config_key = ANY($` + args.length + `)`);
    }

    if (options.packageId) {
      args.push(options.packageId);
      sqlWhere.push('package_id = $' + args.length);
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    sql += `
      ORDER BY
      CASE
          WHEN config_level = '${configLevelEnum.user}' THEN 1
          WHEN config_level = '${configLevelEnum.organization}' THEN 2
          ELSE 3
      END
    `;

    if (Number.isInteger(options.limit)) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (Number.isInteger(options.offset)) {
      sql += ` OFFSET ${options.offset}`;
    }

    const appConfigDefinitions = await serviceContext.dbConnections[
      'sso'
    ].read.map(sql, args, mapper.mapApplicationConfig);

    const callerOrgId = resUtil.getOrgFromAuthContext(context);
    let filteredConfigs = [];
    if (appConfigDefinitions.length > 0) {
      filteredConfigs.push(
        ...(await filterConfigByGrantPackage(appConfigDefinitions, callerOrgId))
      );

      // checking if after filterConfigByGrantPackage there are fewer configs that required. In that case
      // it goes to get the rest of configs missing with limit and offset attributes updated
      const missingConfigs = options.limit - filteredConfigs.length;
      if (missingConfigs > 0) {
        const copiedObject = _.cloneDeep(options);
        copiedObject.limit = missingConfigs;
        copiedObject.offset = appConfigDefinitions.length + options.offset;
        filteredConfigs.push(
          ...(await getApplicationConfigDefinition(copiedObject, context))
            .records
        );
      }
    }

    return mainUtil.toPage(
      { offset: options.offset, limit: options.limit },
      filteredConfigs
    );
  }

  /**
   * This checks the user permission before setting or deleting application configs
   * - Only Superadmins have access to the configs that are under the instance level.
   * - Only Superadmins/ OrgAdmins have access to the configs that are under the organization level.
   * @param {*} context the current context
   * @param {*} input the input for the check: { appId, orgId/organizationGuid, configs }
   */
  async function _checkPermissionOnAppConfigSetOrDelete(context, input) {
    if (_.isNil(context)) {
      throw new errors.InvalidInput({
        message: 'The context is required'
      });
    }
    if (_.isNil(input)) {
      throw new errors.InvalidInput({
        message: 'The input is required'
      });
    }
    const { appId, orgId, configs } = input;
    let organizationGuid = input.organizationGuid || input.orgGuid;
    const requiredOrgId = _.isNil(organizationGuid);
    if (
      _.isNil(appId) ||
      (_.isNil(orgId) && requiredOrgId) ||
      !_.isArray(configs) ||
      _.isEmpty(configs)
    ) {
      throw new errors.InvalidInput({
        message: 'The appId or the orgId or the configs is invalid'
      });
    }
    if (requiredOrgId) {
      organizationGuid = await getOrganizationGuid(context, orgId);
    }
    const inputConfigs = await _formatInputAppConfig(context, appId, configs);
    const hasConfigOrgLevel = inputConfigs.find(
      (item) => item.isConfigOrgLevel
    );
    const hasConfigInstanceLevel = inputConfigs.find(
      (item) => item.isConfigInstanceLevel
    );

    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);
    if (!isSuperAdmin) {
      if (hasConfigInstanceLevel) {
        throw new errors.NotAllowed({
          message:
            'Only superadmins can edit/delete application settings at the instance config level.',
          data: {
            organizationGuid
          }
        });
      }
      if (hasConfigOrgLevel && !isOrgAdmin) {
        throw new errors.NotAllowed({
          message:
            'Only superadmins/orgAdmins can edit/delete application settings at the organization config level.',
          data: {
            organizationGuid
          }
        });
      }
    }
  }

  async function applicationConfigSet(args, context) {
    const { input } = args;
    const { appId, configs } = input;
    const userId =
      _.get(context, 'requestContext.userInfo.userId') ||
      _.get(context, 'requestContext.tokenInfo.applicationId', 'system');

    const organizationGuid = await getOrganizationGuid(context, input.orgId);

    // Validate user permission base on config level
    await _checkPermissionOnAppConfigSetOrDelete(context, {
      ...input,
      organizationGuid
    });

    await allowedToSetApplicationConfig(
      context,
      appId,
      organizationGuid,
      input.orgId
    );

    const rows = await setApplicationConfigsTx(
      appId,
      organizationGuid,
      userId,
      configs,
      context,
      {
        ignoreFormatConfig: true
      }
    );

    return mainUtil.toPage({ offset: 0, limit: _.size(rows) }, rows);
  }

  async function allowedToSetApplicationConfig(
    context,
    applicationId,
    organizationGuid,
    _orgId
  ) {
    const orgId =
      _orgId ||
      _.get(context, '_authInfo.organization.organizationId') ||
      _.get(context, 'organizationId');
    // Check access to application
    const apps = await getApplications(
      {
        organizationId: orgId,
        ids: [applicationId],
        accessScope: [accessScopeEnum.any],
        excludeViewOnly: true
      },
      context
    );

    const allowedIds = _.get(apps, 'records', []).map((o) => o.id);
    if (_.isEmpty(allowedIds) || !allowedIds.includes(applicationId)) {
      throw new errors.NotAllowed({
        message: `The application was not found or you don't have access to set application config`,
        data: {
          applicationId,
          organizationGuid
        }
      });
    }

    return true;
  }

  async function applicationConfigSetDb(
    applicationId,
    organizationGuid,
    config,
    userId,
    context
  ) {
    const sqlSet = [];
    const sqlValues = [];
    const columns = [];
    const args = [];
    const isConfigOrgLevel = _.get(config, 'isConfigOrgLevel', false);

    if (!config.configValue && !config.configJSON) {
      throw new errors.InvalidInput({
        message: 'Missing a config value to update',
        data: {
          config: config,
          objectType: 'ApplicationConfigValueInput'
        }
      });
    }

    const tx = context.tx;

    if (!_.isObject(tx)) {
      throw new Error('missing transaction in context');
    }

    if (config.configValue !== undefined) {
      columns.push('config_value');
      args.push(config.configValue);
      sqlValues.push('$' + args.length);
      sqlSet.push('config_value = $' + args.length);
    }

    if (config.configJSON !== undefined) {
      columns.push('config_json');
      args.push(config.configJSON ?? {});
      sqlValues.push('$' + args.length);
      sqlSet.push('config_json = $' + args.length);
    }

    // set user_id to organizationGuid if a config is at organization level
    args.push(isConfigOrgLevel ? organizationGuid : userId);
    columns.push('user_id');
    sqlValues.push('$' + args.length);

    args.push(userId);
    columns.push('created_by');
    sqlValues.push('$' + args.length);

    columns.push('modified_by');
    sqlValues.push('$' + args.length);
    sqlSet.push('modified_by = $' + args.length);

    columns.push('organization_guid');
    args.push(organizationGuid);
    sqlValues.push('$' + args.length);

    columns.push('application_id');
    args.push(applicationId);
    sqlValues.push('$' + args.length);

    columns.push('config_key');
    args.push(config.configKey);
    sqlValues.push('$' + args.length);

    const sql = /*sql*/ `
      INSERT INTO public.app_config (${columns.join(', ')})
      VALUES (${sqlValues.join(', ')})
      ON CONFLICT ON CONSTRAINT pk_app_config
      DO UPDATE SET ${sqlSet.join(', ')} RETURNING *;`;

    return appConfigOperation(tx, sql, args);
  }

  async function _validateInputAppConfigDefinitions(
    context,
    input,
    isUpdate = false
  ) {
    if (_.isNil(context)) {
      throw new errors.InvalidInput({
        message: 'The context is required'
      });
    }

    if (!_.isArray(input) || _.isEmpty(input)) {
      throw new errors.InvalidInput({
        message: 'The input must be an array and cannot be empty'
      });
    }

    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);

    for (const config of input) {
      const configType = isUpdate
        ? _.get(config, 'update.configType')
        : _.get(config, 'configType');

      const defaultValue = isUpdate
        ? _.get(config, 'update.defaultValue')
        : _.get(config, 'defaultValue');

      if (
        !_.isNil(defaultValue) &&
        !validateAppConfigDefaultValue(configType, defaultValue)
      ) {
        throw new errors.InvalidInput({
          message: `defaultValue is not a type of ${
            configType === 'Date' ? configType + ' YYYY-MM-DD' : configType
          }`
        });
      }

      let appId, filterConfigKey;
      if (isUpdate) {
        appId = _.get(config, 'filter.appId');
        if (_.isNil(appId)) {
          throw new errors.InvalidInput({
            message: 'The filter appId is required for update'
          });
        }
        filterConfigKey = _.get(config, 'filter.configKey');
        if (_.isNil(filterConfigKey)) {
          throw new errors.InvalidInput({
            message: 'The filter configKey is required for update'
          });
        }
      }

      let inputConfigLevel = isUpdate
        ? _.get(config, 'update.configLevel')
        : _.get(config, 'configLevel');

      if (!isUpdate && _.isNil(inputConfigLevel)) {
        throw new errors.InvalidInput({
          message:
            'configLevel is required for new application configuration definitions.'
        });
      }

      if (!isSuperAdmin) {
        let existingConfigLevel;
        if (isUpdate) {
          const getAppConfigDefResults = await getApplicationConfigDefinition(
            { appId, configKey: filterConfigKey },
            context
          );
          const appConfigDef = _.get(getAppConfigDefResults, 'records[0]');
          if (_.isNil(appConfigDef)) {
            throw new errors.NotFound({
              message: 'Application configuration definition not found',
              data: { appId, configKey: filterConfigKey }
            });
          }
          existingConfigLevel = _.lowerCase(_.get(appConfigDef, 'configLevel'));
        }
        if (
          _.lowerCase(inputConfigLevel) === configLevelEnum.instance ||
          existingConfigLevel === configLevelEnum.instance
        ) {
          throw new errors.NotAllowed({
            message:
              'Only superadmins can create or update application configuration definitions at the instance config level.'
          });
        }
        if (
          (_.lowerCase(inputConfigLevel) === configLevelEnum.organization ||
            existingConfigLevel === configLevelEnum.organization) &&
          !isOrgAdmin
        ) {
          throw new errors.NotAllowed({
            message:
              'Only superadmins/orgAdmins can create or update application configuration definitions at the organization config level.'
          });
        }
      }
    }
  }

  async function applicationConfigDefinitionTx(
    options,
    context,
    isUpdate = false
  ) {
    const userId =
      _.get(context, 'requestContext.userInfo.userId') ||
      _.get(context, 'requestContext.tokenInfo.applicationId', 'system');

    await _validateInputAppConfigDefinitions(context, options.input, isUpdate);

    const tx = await serviceContext.dbConnections['sso'].write.connect();
    const rows = [];

    try {
      await tx.query('BEGIN');
      context.tx = tx;
      for (const input of options.input) {
        const result = isUpdate
          ? await applicationConfigDefinitionUpdateDb(
              input.filter,
              input.update,
              userId,
              context
            )
          : await applicationConfigDefinitionCreateDb(input, userId, context);

        if (!_.isEmpty(result.error)) {
          tx.query('ROLLBACK');
          logger.error(result.error);
          if (
            result.error.message &&
            result.error.message.includes(
              'duplicate key value violates unique constraint'
            )
          ) {
            return new errors.ResourceConflict({
              message:
                'The object could not be created because a duplicate already exists for the given config key.',
              data: { configKey: _.get(input, 'configKey') }
            });
          }
          throw result.error;
        }
        if (result.row) {
          rows.push(result.row);
        }
      }
      if (_.size(rows) > 0) {
        await tx.query('COMMIT');
      } else {
        await tx.query('ROLLBACK');
      }
      return mainUtil.toPage({ offset: 0, limit: _.size(rows) }, rows);
    } catch (error) {
      await tx.query('ROLLBACK');
      logger.error(error);
      throw error;
    } finally {
      tx.done();
    }
  }

  async function applicationConfigDefinitionCreateDb(input, userId, context) {
    const columns = [];
    const sqlValues = [];
    const args = [];

    const tx = context.tx;

    if (!_.isObject(tx)) {
      throw new Error('missing transaction in context');
    }

    const organizationGuid = await getOrganizationGuid(context, input.orgId);

    columns.push('application_id');
    args.push(input.appId);
    sqlValues.push('$' + args.length);

    columns.push('organization_guid');
    args.push(organizationGuid);
    sqlValues.push('$' + args.length);

    columns.push('config_key');
    args.push(input.configKey);
    sqlValues.push('$' + args.length);

    if (input.configType) {
      columns.push('config_type');
      args.push(_.toLower(input.configType));
      sqlValues.push('$' + args.length);
    }

    if (input.packageId) {
      columns.push('package_id');
      args.push(_.toLower(input.packageId));
      sqlValues.push('$' + args.length);
    }

    if (input.configLevel) {
      columns.push('config_level');
      args.push(_.toLower(input.configLevel));
      sqlValues.push('$' + args.length);
    }

    if (input.required) {
      columns.push('is_required');
      args.push(input.required);
      sqlValues.push('$' + args.length);
    }

    if (input.secured) {
      columns.push('is_secured');
      args.push(input.secured);
      sqlValues.push('$' + args.length);
    }

    columns.push('created_by');
    args.push(userId);
    sqlValues.push('$' + args.length);

    columns.push('modified_by');
    sqlValues.push('$' + args.length);

    if (input.description) {
      columns.push('config_description');
      args.push(input.description);
      sqlValues.push('$' + args.length);
    }

    if (input.defaultValue) {
      columns.push('default_value');
      args.push(input.defaultValue);
      sqlValues.push('$' + args.length);
    }

    if (input.defaultValueJSON) {
      columns.push('default_value_json');
      args.push(input.defaultValueJSON);
      sqlValues.push('$' + args.length);
    }

    let sql =
      `
          INSERT INTO public.app_config_definition (` +
      columns.join(', ') +
      `)
      VALUES (` +
      sqlValues.join(', ') +
      `)
      RETURNING *
    `;

    return await appConfigOperation(tx, sql, args);
  }

  async function applicationConfigDefinitionUpdateDb(
    filter,
    update,
    userId,
    context
  ) {
    const args = [];
    const sqlSet = [];
    const sqlWhere = [];

    const tx = context.tx;

    if (!_.isObject(tx)) {
      throw new Error('missing transaction in context');
    }

    const filterOrganizationGuid = await getOrganizationGuid(
      context,
      filter.orgId
    );

    if (update.orgId) {
      const updateOrganizationGuid = await getOrganizationGuid(
        context,
        update.orgId
      );

      args.push(updateOrganizationGuid);
      sqlSet.push('organization_guid = $' + args.length);
    }

    if (update.configKey) {
      args.push(update.configKey);
      sqlSet.push('config_key = $' + args.length);
    }

    if (update.packageId) {
      args.push(update.packageId);
      sqlSet.push('package_id = $' + args.length);
    }

    if (update.configType) {
      args.push(_.toLower(update.configType));
      sqlSet.push('config_type = $' + args.length);
    }

    if (update.configLevel) {
      args.push(_.toLower(update.configLevel));
      sqlSet.push('config_level = $' + args.length);
    }

    if (update.required) {
      args.push(update.required);
      sqlSet.push('is_required = $' + args.length);
    }

    if (update.secured) {
      args.push(update.secured);
      sqlSet.push('is_secured = $' + args.length);
    }

    if (update.description) {
      args.push(update.description);
      sqlSet.push('config_description = $' + args.length);
    }

    if (update.defaultValue) {
      args.push(update.defaultValue);
      sqlSet.push('default_value = $' + args.length);
    }

    if (update.defaultValueJSON) {
      args.push(update.defaultValueJSON);
      sqlSet.push('default_value_json = $' + args.length);
    }

    args.push(userId);
    sqlSet.push('modified_by = $' + args.length);

    args.push(filter.appId);
    sqlWhere.push('application_id = $' + args.length);

    args.push(filter.configKey);
    sqlWhere.push('config_key = $' + args.length);

    args.push(filterOrganizationGuid);
    sqlWhere.push('organization_guid = $' + args.length);

    let sql = 'UPDATE public.app_config_definition SET ' + sqlSet.join(', ');

    sql += ' WHERE ' + sqlWhere.join(' AND ');

    sql += ' RETURNING *';

    return await appConfigOperation(tx, sql, args);
  }

  async function appConfigOperation(tx, sql, args) {
    return await tx
      .one(sql, args, mapper.mapApplicationConfig)
      .then(
        (row) => {
          if (!_.isObject(row)) {
            throw new Error('configs were not updated');
          }

          return { error: null, row };
        },
        (error) => {
          return { error: _.get(error, 'data.internalData'), row: null };
        }
      )
      .catch((error) => {
        return { error, row: null };
      });
  }

  async function applicationConfigDelete(options, tableName, context) {
    const { input } = options;
    const { configKey } = input;
    const configs = [];
    if (!_.isNil(configKey)) {
      configs.push({ configKey });
    }

    const organizationGuid = await getOrganizationGuid(context, input.orgId);
    // Validate user permission base on config level
    await _checkPermissionOnAppConfigSetOrDelete(context, {
      ...input,
      configs,
      organizationGuid
    });

    const args = [];
    const sqlWhere = [];

    args.push(input.appId);
    sqlWhere.push('application_id = $' + args.length);

    args.push(organizationGuid);
    sqlWhere.push('organization_guid = $' + args.length);

    args.push(input.configKey);
    sqlWhere.push('config_key = $' + args.length);

    let sql = `
      DELETE FROM public.${tableName}
        WHERE ${sqlWhere.join(' AND ')}
        RETURNING *
    `;

    try {
      return serviceContext.dbConnections['sso'].write
        .map(sql, args, mapper.mapApplicationConfig)
        .then(
          (rows) => {
            if (_.size(rows) > 0) {
              return {
                success: true
              };
            } else {
              return {
                success: false
              };
            }
          },
          (error) => {
            return {
              success: false,
              msg: _.get(error, 'data.internalData.message'),
              code: _.get(error, 'data.internalData.code')
            };
          }
        );
    } catch (error) {
      return {
        success: false,
        code: error.code,
        msg: error.message
      };
    }
  }

  async function applicationAddToOrg(args, context) {
    const { appId, orgId, configs } = args;

    const organizationGuid = await getOrganizationGuid(context, orgId);

    await allowedToUpdateApplicationSetting(context, appId, organizationGuid);

    const userId =
      _.get(context, 'requestContext.userInfo.userId') ||
      _.get(context, 'requestContext.tokenInfo.applicationId', 'system');

    await serviceContext.coreAdmin.addApplicationsForOrganization(
      args,
      context
    );

    await setApplicationConfigsTx(
      appId,
      organizationGuid,
      userId,
      configs,
      context
    );

    return getApplication({ id: appId });
  }

  async function setApplicationConfigsTx(
    appId,
    organizationGuid,
    userId,
    configs,
    context,
    options
  ) {
    const tx = await serviceContext.dbConnections['sso'].write.connect();
    const rows = [];
    const ignoreFormatConfig = _.get(options, 'ignoreFormatConfig', false);

    try {
      const inputConfigs = ignoreFormatConfig
        ? configs
        : await _formatInputAppConfig(context, appId, configs);

      if (!_.isEmpty(configs)) {
        await tx.query('BEGIN');
        context.tx = tx;
        for (const config of inputConfigs) {
          const result = await applicationConfigSetDb(
            appId,
            organizationGuid,
            config,
            userId,
            context
          );
          if (!_.isEmpty(result.error)) {
            tx.query('ROLLBACK');
            logger.error(result.error);
            throw result.error;
          }
          if (result.row) {
            rows.push(result.row);
          }
        }
        if (_.size(rows) > 0) {
          await tx.query('COMMIT');
          return rows;
        } else {
          await tx.query('ROLLBACK');
        }
      }
    } catch (error) {
      logger.error(error);
      await tx.query('ROLLBACK');
      throw error;
    } finally {
      tx.done();
    }
  }

  async function applicationRemoveFromOrg(args, context) {
    const { appId, orgId } = args;

    const organizationGuid = await getOrganizationGuid(context, orgId);

    await allowedToUpdateApplicationSetting(context, appId, organizationGuid);

    const clearConfigs = _.get(args, 'clearConfigs', false);
    const userId = _.get(args, 'userId', null);

    const tx = await serviceContext.dbConnections['sso'].write.connect();

    try {
      await serviceContext.coreAdmin.removeApplicationsForOrganization(
        [appId],
        orgId || args.organizationId,
        context
      );

      const { records } = await getApplicationConfig(
        {
          appId,
          orgId,
          includeDefaults: false
        },
        context
      );

      if (_.size(records) > 0 && clearConfigs) {
        await tx.query('BEGIN');
        context.tx = tx;
        const configKeys = _.map(records, (record) =>
          _.get(record, 'configKey')
        );

        for (const configKey of configKeys) {
          const result = await applicationConfigDelete(
            { input: { appId, orgId, configKey, userId } },
            context
          );
          if (!result.success) {
            tx.query('ROLLBACK');
            return result;
          }
        }

        tx.query('COMMIT');
        return {
          success: true
        };
      } else {
        return {
          success: true
        };
      }
    } catch (error) {
      tx.query('ROLLBACK');
      return {
        success: false,
        code: error.code,
        msg: error.message
      };
    } finally {
      tx.done();
    }
  }

  function validateAccessScope(accessScopesInput) {
    const allAccessScope = [
      accessScopeEnum.public,
      accessScopeEnum.owned,
      accessScopeEnum.granted,
      accessScopeEnum.any
    ];
    let accessScope = [
      accessScopeEnum.public,
      accessScopeEnum.owned,
      accessScopeEnum.granted
    ];

    if (!_.isNil(accessScopesInput)) {
      accessScope = _.isArray(accessScopesInput)
        ? accessScopesInput
        : [accessScopesInput];
    }

    // if (!_.isArray(_accessScope)) {
    //   throw new errors.InvalidInput({
    //     message: 'accessScope must be an array.',
    //     data: {
    //       field: `accessScope`,
    //       value: _accessScope
    //     }
    //   });
    // }
    if (!_.isEmpty(accessScope)) {
      const invalidAccessScope = [];
      accessScope.forEach((o) => {
        if (!allAccessScope.includes(o)) {
          invalidAccessScope.push(o);
        }
      });
      if (!_.isEmpty(invalidAccessScope)) {
        throw new errors.InvalidInput({
          message: 'accessScope has invalid values.',
          data: {
            field: `accessScope`,
            value: accessScope,
            invalidValue: invalidAccessScope
          }
        });
      }
    }

    // If accessScope includes any scope, return all accessible schemas and disregard any other entries in that input.
    if (accessScope.includes(accessScopeEnum.any)) {
      accessScope = [
        accessScopeEnum.public,
        accessScopeEnum.owned,
        accessScopeEnum.granted
      ];
    }

    return {
      hasPublic: accessScope.includes(accessScopeEnum.public),
      hasOwned: accessScope.includes(accessScopeEnum.owned),
      hasGranted: accessScope.includes(accessScopeEnum.granted)
    };
  }

  /**
  Get applications by some filter options
  TODO: the owned flag will be deplicated in the future

  options = {
      ...
      accessScope
    }
    If accessScope = null, return all accessible applications.
    If accessScope includes any scope, return all accessible applications and disregard any other entries in that input.
  */
  async function getApplications(options, context, existingTask = null) {
    const { sql, sqlParams } = await getApplicationsQuery(options, context);

    const dbRead = _.isNil(existingTask)
      ? serviceContext.dbConnections['sso'].read.tx
      : existingTask;

    return await dbRead('getApplications', async (t) => {
      return t
        .map(sql, sqlParams, mapper.mapApplication)
        .then((rows) => mainUtil.toPage(options, rows));
    }).catch((err) => {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError(err);
    });
  }

  /**
    Building { sql, sqlParams } for SQL execution to get applications
    TODO: the owned flag will be deplicated in the future

    options = {
      ...
      accessScope
    }
    If accessScope = null, return all accessible applications.
    If accessScope includes any scope, return all accessible applications and disregard any other entries in that input.
  */
  async function getApplicationsQuery(options, context) {
    options = options || {};
    options.applicationIds = options.ids || [];
    options.applicationStatus = options.status;
    options.applicationPublic = options.isPublic;
    if (!_.isNil(options.id)) {
      options.applicationIds.push(options.id);
    }

    let accessScope = {
      hasGranted: false,
      hasPublic: false,
      hasOwned: false
    };

    // 1. handle owned flag. It will be deplicated in the future
    if (_.isBoolean(options.owned)) {
      accessScope.hasOwned = options.owned;
      if (accessScope.hasOwned === false) {
        accessScope.hasPublic = true;
        accessScope.hasGranted = true;
      }
    } else {
      // 2. check access scope
      accessScope = validateAccessScope(_.get(options, 'accessScope'));
    }

    // handle `all` flag
    if (options.all === true) {
      accessScope.hasGranted = true;
      accessScope.hasPublic = true;
      accessScope.hasOwned = true;
    }

    if (options.owned === true && options.orgId) {
      throw new Error('owned can not be true when orgId is also specified.');
    }

    const sqlORStatements = [];
    const sqlWhere = [];
    const sqlParams = [];
    const isSuperAdmin =
      options.isSuperAdmin ?? resUtil.isSuperAdmin(context?._authInfo);

    if (!isSuperAdmin && !options.adminView) {
      if (accessScope.hasGranted && !options.ignoreValidatePackageAppAccess) {
        // Allow grantType=VIEW to show, only when excludeViewOnly explicitly false
        // checkPackageOnly=true to avoid circular calls
        const checkPackageOnly = true;
        const {
          hasAccess: hasPackageAccess,
          allowedIds: allowedIds
        } = await validatePackageAppAccess(
          context,
          [],
          checkPackageOnly,
          options.excludeViewOnly
        );
        if (!_.isEmpty(allowedIds)) {
          sqlParams.push(allowedIds);
          sqlORStatements.push(
            `a.application_id = ANY($${sqlParams.length}::uuid[])`
          );
        }
      }
    }

    let queryOrganizationId = options.organizationId;
    if (options.orgId && options.isSuperAdmin) {
      queryOrganizationId = options.orgId;
    }

    const queryOwned = _.isUndefined(options.owned) || options.owned !== false;
    let billingFields = '';
    if (!queryOwned && queryOrganizationId && options.isSuperAdmin) {
      billingFields = `
          ao.billing_plan_id,
          ao.billing_dirty,
          ao.organization_id,
        `;
    }

    let distinctOn = '';
    if (options.orderBy) {
      distinctOn =
        'a.' + applicationOrderByMap[`${options.orderBy[0].field}`] + ',';
    }

    let sql = `SELECT
              DISTINCT ON (${distinctOn} a.application_id)
              a.application_id,
              a.application_name,
              a.application_key,
              a.application_status,
              a.application_description,
              a.application_icon_url,
              a.application_icon_svg,
              a.application_url,
              a.application_check_permissions,
              a.owner_organization_id,
              a.deployment_model,
              a.created_date,
              a.updated_date,
              a.oauth2_redirect_urls,
              a.oauth2_client_secret,
              a.public,
              a.headerbar_enabled,
                a.metadata_version,
              a.event_endpoint, ${billingFields}
              COUNT(*) OVER () AS total
          FROM
              application a`;

    if (queryOrganizationId) {
      // Public applications
      if (accessScope.hasPublic) {
        sqlORStatements.push(`a.public = true`);
      }

      sqlParams.push(queryOrganizationId);
      // Owned applications
      if (accessScope.hasOwned) {
        sqlORStatements.push(`a.owner_organization_id = \$${sqlParams.length}`);
      } else {
        sqlWhere.push(`a.owner_organization_id <> \$${sqlParams.length}`);
      }

      // In case get granted resource in application__organization
      if (
        accessScope.hasGranted ||
        (!accessScope.hasOwned && !_.isEmpty(options.applicationIds))
      ) {
        sql +=
          ' LEFT JOIN application__organization ao ON ao.application_id = a.application_id ';
        // const sqlORStatements = [];
        sqlORStatements.push(`(ao.organization_id = $${sqlParams.length} AND ao.application_state = 'active')`);

        // BusinessUnit
        const bu = await serviceContext.dal.organization.getBusinessUnit(
          queryOrganizationId
        );
        if (!_.isNil(bu)) {
          sqlORStatements.push(`(ao.business_unit = '${bu}' AND ao.application_state = 'active')`);
        }
      }
    }
    // OR conditions
    if (!_.isEmpty(sqlORStatements)) {
      const orConditions = `(${sqlORStatements.join(' OR ')})`;
      sqlWhere.push(orConditions);
    }

    if (
      _.isArray(options.applicationIds) &&
      !_.isEmpty(options.applicationIds)
    ) {
      sqlParams.push(options.applicationIds);
      sqlWhere.push(`a.application_id = ANY($${sqlParams.length}::uuid[])`);
    }

    // the following filters out deleted apps but allows the client
    // to retrieve them with a specific status value
    if (options.status) {
      sqlParams.push(options.status);
      sqlWhere.push(`a.application_status = \$${sqlParams.length}`);
    }
    // flag not exposed through graphql, used for internal functions that need to see deleted apps
    else if (!options.includeDeleted) {
      if (
        (!options.isSuperAdmin && !queryOwned && !options.adminView) ||
        _.get(options, 'filter.applicationUrl') // override status filter if searching by appURL
      ) {
        sqlWhere.push(`a.application_status = 'active'`);
      } else {
        sqlWhere.push(`a.application_status != 'deleted'`);
      }
    }

    if (
      !_.isNil(options.applicationPublic) &&
      _.isBoolean(options.applicationPublic)
    ) {
      sqlParams.push(options.applicationPublic);
      sqlWhere.push(`a.public = \$${sqlParams.length}`);
    }

    await generateAppFilterSql(options, sqlParams, sqlWhere);

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }
    let orderBy = ' ORDER BY a.application_id, a.application_name ';
    if (options.orderBy) {
      let sqlOrderBy = [];
      for (const value of options.orderBy) {
        const field = applicationOrderByMap[value.field];
        const dirParam = value.direction || 'asc';
        const direction = orderDirectionMap[dirParam];
        if (field) {
          sqlOrderBy.push(`${field} ${direction}`);
        }
      }
      if (sqlOrderBy.length) {
        orderBy = ' ORDER BY ' + sqlOrderBy.join(' , ');
      } else {
        orderBy = ' ORDER BY a.created_date DESC ';
      }
    }
    sql += orderBy;
    if (Number.isInteger(options.limit) && !options.all) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (Number.isInteger(options.offset)) {
      sql += ` OFFSET ${options.offset}`;
    }

    return {
      sql,
      sqlParams
    };
  }

  async function generateAppFilterSql(options, args, sqlWhere) {
    const filter = _.get(options, 'filter');
    const organizationId = _.get(options, 'organizationId');
    const appFilterMap = new Map([
      ['name', { fieldName: 'a.application_name', operator: 'ILIKE' }],
      ['nameMatch'],
      ['status', { fieldName: 'a.application_status' }],
      ['isPublic', { fieldName: 'a.public' }],
      ['entityTags'],
      ['dateTimeFilter'],
      ['urlRegex']
    ]);

    if (
      !_.isNil(filter) &&
      !_.isNil(filter.urlRegex) &&
      !_.isNil(filter.status)
    ) {
      filter.status = 'active';
    }

    for (let key in filter) {
      if (!appFilterMap.has(key)) {
        throw new Error(`Invalid filter key: ${key}`);
      }

      const filterObj = appFilterMap.get(key);
      let value = filter[key];

      if (key === 'entityTags') {
        const tagKeys = _.map(filter.entityTags, 'key');
        if (!_.isEmpty(tagKeys)) {
          const appsWithEntityTags = await entityTags.getEntityIdsByTagKeys(
            _.map(filter.entityTags, 'key'),
            organizationId,
            'app'
          );

          mainUtil.addSqlWhere(
            'a.application_id',
            appsWithEntityTags,
            sqlWhere,
            args,
            'IN'
          );
        }
      } else if (key === 'dateTimeFilter') {
        mainUtil.addDateTimeFilters('a', filter, sqlWhere, null, 1000, {
          modifiedDateTime: 'updated_date',
          createdDateTime: 'created_date'
        });
      } else if (key === 'name') {
        mainUtil.makeLikeClause(
          'a.application_name',
          value,
          sqlWhere,
          args,
          filter.nameMatch || 'startsWith',
          false
        );
      } else if (key === 'urlRegex') {
        try {
          new RegExp(value);
        } catch (err) {
          throw new errors.InvalidInput({
            message: `Invalid regular expression`,
            data: {
              value,
              errMessage: err.message
            }
          });
        }
        args.push(value);
        sqlWhere.push(`a.application_url ~ $${args.length}`);
      } else {
        if (!_.isNil(filterObj)) {
          if (filterObj.operator === 'ILIKE') {
            value = `%${mainUtil.sqlEscapeForLIKE(value)}%`;
          }

          mainUtil.addSqlWhere(
            filterObj.fieldName,
            value,
            sqlWhere,
            args,
            _.get(filterObj, 'operator', null)
          );
        }
      }
    }
  }

  async function getOldestApplication(applicationIds) {
    if (_.isNil(applicationIds) || _.isEmpty(applicationIds)) return null;

    const sql = `SELECT
      application_id,
      application_name
    FROM
      application
    WHERE
      application_status NOT IN ('deleted', 'disabled')
      AND application_id = ANY ($1::uuid[])
    ORDER BY created_date
    LIMIT 1
    `;
    return serviceContext.dbConnections['sso'].read.map(
      sql,
      [applicationIds],
      mapper.mapApplication
    );
  }

  function getContextMenuExtension(options) {
    return getContextMenuExtensions(options).then((rows) => {
      return rows[0];
    });
  }

  async function createContextMenuExtensionDb(
    applicationId,
    contextMenuExtensions
  ) {
    let sql = generateContextMenuUpsertQuery(
      applicationId,
      contextMenuExtensions
    );

    sql += ` RETURNING *`;

    return serviceContext.dbConnections['sso'].write
      .map(sql, [], mapper.mapContextMenuExtension)
      .then(function (rows) {
        return rows[0];
      });
  }

  function generateContextMenuUpsertQuery(
    applicationId,
    contextMenuExtensions
  ) {
    const cs = new pgp.helpers.ColumnSet(
      ['application_context_menu_id', 'application_id', 'label', 'url', 'type'],
      { table: 'application_context_menu' }
    );

    const values = contextMenuExtensions.map((input) => {
      return {
        application_context_menu_id: input.id || uuid.v4(),
        application_id: applicationId,
        label: input.label,
        url: input.url,
        type: input.type
      };
    });

    const query =
      pgp.helpers.insert(values, cs) +
      ' ON CONFLICT (application_context_menu_id) DO UPDATE SET ' +
      cs.columns
        .map((x) => {
          const col = pgp.as.name(x.name);
          return col + ' = excluded.' + col;
        })
        .join();

    return query;
  }

  function generateAppHeaderbarUpsertQuery(columnData) {
    const columns = [
      'application_id',
      'organization_guid',
      'headerbar_id',
      'headerbar_name',
      'background_color',
      'help_enabled',
      'notification_enabled',
      'logo_src',
      'created_by',
      'modified_by'
    ];
    const cs = new pgp.helpers.ColumnSet(columns, { table: 'app_headerbar' });

    const values = columnData;

    let query =
      pgp.helpers.insert(values, cs) +
      ' ON CONFLICT (application_id, organization_guid) DO UPDATE SET ' +
      cs.columns
        .map((x) => {
          const col = pgp.as.name(x.name);
          if (col === 'headerbar_id') {
            return;
          }
          return col + ' = excluded.' + col;
        })
        .join();

    query += ` RETURNING ${columns.join(',')}`;
    return query;
  }

  function generateNodeRedPaletteUpsertQuery(
    applicationId,
    createdBy,
    nodeModules
  ) {
    const cs = new pgp.helpers.ColumnSet(
      [
        'module_id',
        'module_repo',
        'is_private_repo',
        'is_private_registry',
        'module_name',
        'module_version',
        'scope',
        'access_token',
        'registry_url',
        'ssh_url',
        'created_by',
        'modified_by',
        'application_id',
        'status'
      ],
      {
        table: {
          table: 'node_red_palette',
          schema: 'aiware'
        }
      }
    );

    const values = nodeModules.map((nodeModule) => {
      return {
        module_id: nodeModule.moduleId || uuid.v4(),
        module_repo: nodeModule.moduleRepo,
        is_private_repo: nodeModule.isPrivateRepo,
        is_private_registry: nodeModule.isPrivateRegistry,
        module_name: nodeModule.moduleName,
        module_version: nodeModule.moduleVersion,
        scope: nodeModule.scope,
        access_token: nodeModule.accessToken,
        registry_url: nodeModule.registryUrl,
        ssh_url: nodeModule.sshUrl,
        created_by: createdBy,
        modified_by: createdBy,
        application_id: applicationId,
        status: nodeModule.status || 'active'
      };
    });

    const query =
      pgp.helpers.insert(values, cs) +
      ' ON CONFLICT (module_id) DO UPDATE SET ' +
      cs.columns
        .map((x) => {
          const col = pgp.as.name(x.name);
          return col + ' = excluded.' + col;
        })
        .join() +
      ' RETURNING module_id, status';

    return query;
  }

  async function updateContextMenuExtensionDb(id, options) {
    if (_.isNil(id)) {
      throw new Error('id parameter is required');
    }
    if (!options.label || !options.url) {
      throw new errors.InvalidInput({
        message: 'Missing required fields label or url',
        data: {
          objectId: id,
          objectType: 'ContextMenuExtension'
        }
      });
    }

    const sql = `
    UPDATE application_context_menu
    SET label = $1, url = $2
    WHERE application_context_menu_id = $3
    RETURNING *`;

    const params = [options.label, options.url, id];

    return serviceContext.dbConnections['sso'].write
      .map(sql, params, mapper.mapContextMenuExtension)
      .then(function (rows) {
        return rows[0];
      });
  }

  async function deleteContextMenuExtensionDb(input) {
    const params = [input.id, input.organizationId];
    const sql = `
      DELETE
      FROM
        application_context_menu
      WHERE
        application_context_menu_id = $1
      AND
        application_id IN (
          SELECT application_id
          FROM application
          WHERE owner_organization_id = $${params.length}
        )
      RETURNING
        application_context_menu_id, application_id, type, label, url`;

    return serviceContext.dbConnections['sso'].write
      .map(sql, params, mapper.mapContextMenuExtension)
      .then(function (rows) {
        return rows[0];
      });
  }

  async function bulkDeleteContextMenuExtensionsDb(options) {
    const sqlArgs = [];
    const idList = [];

    if (_.isEmpty(options.input.ids)) {
      return [];
    }

    options.input.ids.forEach(function addArg(id) {
      sqlArgs.push(id);
      idList.push(`\$${sqlArgs.length}`);
    });

    sqlArgs.push(options.input.organizationId);

    const sql = `
        DELETE
        FROM
          application_context_menu
        WHERE
          application_context_menu_id IN (${idList.join(',')})
        AND
          application_id IN (
            SELECT application_id
            FROM application
            WHERE owner_organization_id = $${sqlArgs.length}
          )
        RETURNING
          application_context_menu_id, application_id, type, label, url`;

    return serviceContext.dbConnections['sso'].write
      .map(sql, sqlArgs, mapper.mapContextMenuExtension)
      .then(function (rows) {
        return rows;
      });
  }

  async function generatePackage(
    application,
    context,
    isUpgrade = false,
    existingTask = null
  ) {
    const appToPackageStatusMap = {
      draft: 'draft',
      pending: 'draft',
      rejected: 'draft',
      approved: 'draft',
      active: 'published',
      disabled: 'deactivated',
      deleted: 'deactivated'
    };
    const appStatus = appToPackageStatusMap[application.applicationStatus];

    await serviceContext.dal.packages.packageCreate(
      {
        // name and version will be used if this is either not an upgrade or a package doesn't already exist
        name: mainUtil.getFormattedPackageName({
          primaryResourceId: application.applicationId,
          primaryResourceName: application.applicationName
        }),
        version: '1.0',
        organizationId: application.ownerOrganizationId,
        primaryResourceId: application.applicationId,
        resources: [
          {
            resourceType: 'application',
            resourceId: application.applicationId,
            action: 'ADD'
          }
        ],
        autoGenerated: true,
        status: isUpgrade ? appStatus : 'draft',
        dateTime: isUpgrade ? application.modifiedDateTime : null,
        distributionType: application.packageDistributionType
      },
      context,
      {
        isVersionUpgrade: isUpgrade,
        preprocessResources: appStatus === 'draft',
        skipPackageAccessValidation: true,
        primaryResourceType: 'application'
      },
      existingTask
    );
  }

  async function getNodeRedPalettesByApplication(
    applicationId,
    includeDeleted = false
  ) {
    let sql = `
      SELECT * FROM aiware.node_red_palette WHERE application_id = $1
    `;

    if (!includeDeleted) {
      sql += ` AND status = 'active'`;
    }

    const args = [applicationId];

    return serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.camelizeRootKeys
    );
  }

  async function getNodeRedPalettesByModuleIds(
    moduleIds,
    includeDeleted = false
  ) {
    const args = [];
    const idArgs = [];
    for (const id of moduleIds) {
      args.push(id);
      idArgs.push(`$${args.length}`);
    }
    let sql = `
      SELECT * FROM aiware.node_red_palette WHERE module_id IN (${idArgs.join(',') || null})
    `;

    if (!includeDeleted) {
      sql += ` AND status = 'active'`;
    }

    return serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.camelizeRootKeys
    );
  }

  async function bulkUpsertNodeRedPaletteDb(
    nodeModules,
    applicationId,
    context
  ) {
    const createdBy =
      _.get(context, 'requestContext.userInfo.userId') ||
      _.get(context, 'requestContext.tokenInfo.applicationId', 'system');

    const query = generateNodeRedPaletteUpsertQuery(
      applicationId,
      createdBy,
      nodeModules
    );

    return await serviceContext.dbConnections['core'].write.map(
      query,
      [],
      mapper.camelizeRootKeys
    );
  }

  async function createApplicationDb(
    application,
    contextMenuExtensions,
    headerbar,
    details,
    events,
    eventSubscriptions,
    context,
    disableAutoPackageCreation = false
  ) {
    const sql = `INSERT INTO application
        (application_id, application_name, application_key,
        application_description, application_icon_url, application_icon_svg, application_check_permissions,
        owner_organization_id, application_url, oauth2_redirect_urls, oauth2_client_secret, permissions_required,
        event_endpoint, public, headerbar_enabled, application_status, metadata_version)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING
        ${returningApplication}`;

    const args = [
      application.applicationId || uuid.v4(),
      application.applicationName,
      application.applicationKey,
      application.applicationDescription || '',
      application.applicationIconUrl || '',
      application.applicationIconSvg,
      application.applicationCheckPermissions,
      application.ownerOrganizationId,
      application.applicationUrl || '',
      application.oauth2RedirectUrls,
      // below we will generate a client secret
      uid.sync(40),
      application.permissionsRequired,
      application.eventEndpoint,
      application.public,
      application.headerbarEnabled,
      application.status || 'draft',
      application.metadataVersion || 1
    ];

    const ssoDbConn = serviceContext.dbConnections['sso'].write.tx;

    return ssoDbConn('createApplication', async (t) => {
      const createdApplication = await t.map(sql, args, mapper.mapApplication);
      const createdApp = createdApplication[0];

      if (!_.isEmpty(contextMenuExtensions)) {
        const query = generateContextMenuUpsertQuery(
          createdApp.applicationId,
          contextMenuExtensions
        );

        await t.none(query);
      }

      const useAutomaticPackageCreation = await mainUtil.isOrgSettingEnabled(
        context,
        'automaticPackageCreation'
      );

      const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
      if (disableAutoPackageCreation && !isSuperAdmin) {
        throw new errors.NotAllowed({
          message:
            'Only a superadmin token can set the disableAutoPackageCreation flag.'
        });
      }
      if (useAutomaticPackageCreation && !disableAutoPackageCreation) {
        await generatePackage(
          {
            ...createdApp,
            packageDistributionType: application.packageDistributionType
          },
          context,
          false,
          t.task
        );
      }

      // if entityTags field is in input, synchronize entity_tags table with corresponding rows
      const tagData = {
        entityId: createdApp.id,
        organizationId: application.ownerOrganizationId,
        entityType: 'app',
        entityTags: application.entityTags
      };

      await entityTags.updateEntityTags(tagData, createdApp, context);

      // create application roles
      let createdAppRoles = [];
      if (
        _.isArray(application.applicationRoles) &&
        application.applicationRoles.length > 0
      ) {
        const appRoles = application.applicationRoles.map((r) => {
          r.applicationId = createdApp.id;
          r.applicationKey = createdApp.key;
          r.organizationId = createdApp.organizationId;
          return r;
        });

        createdAppRoles = await serviceContext.dal.role.createRoles(
          context,
          appRoles,
          t
        );
      }

      if (!_.isEmpty(headerbar)) {
        await createApplicationHeaderbar(
          {
            appId: createdApp.id,
            orgId: createdApp.organizationId,
            input: headerbar
          },
          context,
          t
        );
      }

      if (!_.isEmpty(details)) {
        await createApplicationDetails(
          {
            appId: createdApp.id,
            orgId: createdApp.organizationId,
            input: details
          },
          context,
          t
        );
      }

      let eventsResult;
      if (!_.isEmpty(events)) {
        const newEvents = events.map((event) => ({
          ...event,
          application: createdApp.applicationId
        }));
        eventsResult = await serviceContext.dal.event.batchCreateEvents(
          context,
          {
            input: newEvents,
            organizationId: createdApp.organizationId
          }
        );
      }

      if (!_.isEmpty(eventSubscriptions)) {
        const newSubscribeEvent = eventSubscriptions.map((item) => {
          return {
            ...item,
            application: createdApp.applicationId
          };
        });

        if (!_.isEmpty(events) && !eventsResult) {
          throw new errors.NotAllowed({
            message:
              'Failed to create events, cannot proceed with subscribing to events.'
          });
        }

        await serviceContext.dal.event.batchSubscribeEvent(context, {
          input: newSubscribeEvent,
          organizationId: createdApp.organizationId
        });
      }

      return {
        ...createdApp,
        contextMenuExtensions,
        applicationRoles: createdAppRoles
      };
    });
  }

  async function bulkUpdateApplicationComponentDb(
    applicationId,
    componentUpdatePayloads
  ) {
    const txCore = await serviceContext.dbConnections['core'].write.connect();
    const txThirdParty = serviceContext.dbConnections[
      'third_party'
    ].write.connect();

    try {
      await txCore.query('BEGIN');
      await txThirdParty.query('BEGIN');

      for (const payload of componentUpdatePayloads) {
        await updateApplicationComponentDb(
          applicationId,
          payload,
          txCore,
          txThirdParty
        );
      }

      await txCore.query('COMMIT');
      await txThirdParty.query('COMMIT');
    } catch (error) {
      await txCore.query('ROLLBACK');
      await txThirdParty.query('ROLLBACK');
      logger.error(error);
      throw error;
    } finally {
      txCore.done();
      txThirdParty.done();
    }
  }

  async function updateApplicationComponentDb(
    applicationId,
    componentUpdatePayload,
    txCore = serviceContext.dbConnections['core'].write,
    txThirdParty = serviceContext.dbConnections['third_party'].write
  ) {
    const { action, type } = componentUpdatePayload;
    let sql;

    switch (action) {
      case 'add':
        sql = generateAddAppComponentQuery(
          applicationId,
          componentUpdatePayload
        );
        break;
      case 'remove':
        sql = generateRemoveAppComponentQuery(
          applicationId,
          componentUpdatePayload
        );
        break;
      default:
        throw new errors.InvalidInput({
          message: 'Missing valid action for component update',
          data: {
            applicationId: applicationId,
            ...componentUpdatePayload
          }
        });
    }

    const componentDb = {
      engines: txCore,
      dataRegistries: txThirdParty
    }[type];

    await componentDb.query(sql);

    return {
      id: applicationId
    };
  }

  function generateAddAppComponentQuery(applicationId, componentUpdatePayload) {
    const { type, componentIds } = componentUpdatePayload;

    const appComponent = {
      engines: {
        table: { table: 'engine__application', schema: jobTable },
        columns: ['application_id', 'engine_id'],
        values: function getComponentValues(engineIds) {
          return engineIds.map((engineId) => ({
            engine_id: engineId,
            application_id: applicationId
          }));
        },
        conflictColumns: ['application_id', 'engine_id']
      },
      dataRegistries: {
        table: 'data_registry__application',
        columns: ['application_id', 'data_registry_id'],
        values: function getComponentValues(dataRegistryIds) {
          return dataRegistryIds.map((dataRegistryId) => ({
            data_registry_id: dataRegistryId,
            application_id: applicationId
          }));
        },
        conflictColumns: ['application_id', 'data_registry_id']
      }
    }[type];

    if (!appComponent) {
      throw new errors.InvalidInput({
        message: 'Update Failed: Unknown application component',
        data: {
          id: applicationId,
          componentType: type
        }
      });
    }

    const cs = new pgp.helpers.ColumnSet(appComponent.columns, {
      table: appComponent.table
    });

    let query = pgp.helpers.insert(appComponent.values(componentIds), cs);

    if (appComponent.conflictColumns) {
      query += ` ON CONFLICT (${appComponent.conflictColumns.join(
        ','
      )}) DO NOTHING;`;
    }
    return query;
  }

  function generateRemoveAppComponentQuery(
    applicationId,
    componentUpdatePayload
  ) {
    const { type, componentIds } = componentUpdatePayload;

    const appComponent = {
      engines: {
        table: `${jobTable}.engine__application`,
        column: 'engine_id'
      },
      dataRegistries: {
        table: 'data_registry__application',
        column: 'data_registry_id'
      },
      contextMenuExtensions: {
        table: 'application_context_menu',
        column: 'application_context_menu_id'
      }
    }[type];

    if (!appComponent) {
      throw new errors.InvalidInput({
        message: 'Update Failed: Unknown application component',
        data: {
          id: applicationId,
          componentType: type
        }
      });
    }

    const params = [];
    const idArgs = [];

    params.push(applicationId);
    componentIds.forEach((id) => {
      params.push(id);
      idArgs.push(`$${params.length}`);
    });

    const idStr = idArgs.join(',') || null;
    const query = `
      DELETE FROM ${appComponent.table}
      WHERE application_id = $1
      AND ${appComponent.column} IN (${idStr});
    `;

    return new pgp.ParameterizedQuery({ text: query, values: params });
  }

  function checkApplicationNameOrKeyConflict({ id, name, key }) {
    const args = [key, name];
    let sql = `
      SELECT
        a.application_id
      FROM
        application a
      WHERE
        (a.application_key = $1 OR a.application_name = $2)`;

    if (id) {
      sql += ` AND a.application_id != $3`;
      args.push(id);
    }

    return serviceContext.dbConnections['sso'].read
      .query(sql, args)
      .then(function (rows) {
        return rows[0];
      });
  }

  async function createApplicationOrganizationSetting(context, args) {
    const {
      application,
      key,
      type,
      description,
      defaultValue,
      organizationGuid
    } = args;

    // validate the params
    if (!key || !type || !defaultValue) {
      throw new errors.InvalidInput({
        message:
          'The request input did not pass validation checks. See the data section for detail on validation errors.',
        data: {
          validationErrors: [
            {
              fieldName: 'key',
              fieldValue: key,
              message: 'Key setting is required.'
            },
            {
              fieldName: 'type',
              fieldValue: type,
              message: 'Value type of setting is required.'
            },
            {
              fieldName: 'defaultValue',
              fieldValue: defaultValue,
              message: 'Default value of application setting is required.'
            }
          ]
        }
      });
    }

    await allowedToUpdateApplicationSetting(
      context,
      application,
      organizationGuid
    );

    const requestorOrgGuid = args.applicationId;
    const columnData = {
      application_id: application,
      organization_guid: organizationGuid || requestorOrgGuid,
      key,
      type,
      description,
      value: defaultValue
    };
    const { sql, values } = mainUtil.makeInsertSql(
      'public.application__organization_setting',
      columnData,
      applicationOrganizationSettingReturning
    );

    return serviceContext.dbConnections['sso'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  async function deleteApplicationOrganizationSetting(context, args) {
    const { application, key, organizationGuid } = args;

    if (!application || !key) {
      throw new errors.InvalidInput({
        message: 'application and key are required.',
        data: {
          application,
          key,
          organizationGuid
        }
      });
    }

    await allowedToUpdateApplicationSetting(
      context,
      application,
      organizationGuid
    );

    const requestorOrgGuid = args.applicationId;
    const sql = `DELETE FROM	public.application__organization_setting
      WHERE 	application_id = $1
        AND organization_guid = $2
        AND "key" = $3
      RETURNING 	application_id,
            organization_guid,
            "key",
            "type",
            description,
            value;`;
    const res = await serviceContext.dbConnections['sso'].write.one(
      sql,
      [application, organizationGuid || requestorOrgGuid, key],
      mapper.camelizeRootKeys
    );

    if (!res) {
      throw new errors.NotFound({
        message: 'Application setting not found!',
        data: { application, organizationGuid, key }
      });
    }

    return {
      id: application,
      message: `Application setting (application: ${res.applicationId}, organizationGuid: ${res.organizationGuid}, key: ${res.key}) has been deleted`
    };
  }

  async function getApplicationOrganizationSettings(context, args) {
    const { application, key, organizationGuid } = args;

    if (!application) {
      throw new errors.InvalidInput({
        message: 'application is required!',
        data: { application }
      });
    }

    const clientInfo = resUtil.getClientInfo(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isAllowTokenType = ['user', 'internal', 'apikey'].includes(
      clientInfo.type
    );
    const whereAnd = [];
    const values = [];
    let inputOrgGuid;

    if (!isAllowTokenType) {
      throw new errors.NotAllowed({
        message: 'Api do not allow current token type!',
        data: { tokenType: clientInfo.type }
      });
    }

    if (clientInfo.type === 'internal') {
      if (!organizationGuid) {
        throw new errors.InvalidInput({
          message: 'organizationGuid is required for internal token',
          data: {
            tokenType: clientInfo.type,
            organizationGuid
          }
        });
      }

      inputOrgGuid = organizationGuid;
    } else {
      if (isSuperAdmin) {
        inputOrgGuid = organizationGuid;
      } else {
        inputOrgGuid = await serviceContext.dal.application.getAppIdFromOrgId(
          clientInfo.org
        );

        // Check access to application in case regular user
        await getApplication({
          id: application,
          owned: true,
          organizationId: clientInfo.org
        });
      }
    }

    mainUtil.addSqlWhere('aos.application_id', application, whereAnd, values);
    mainUtil.addSqlWhere('aos.key', key, whereAnd, values);
    mainUtil.addSqlWhere(
      'aos.organization_guid',
      inputOrgGuid,
      whereAnd,
      values
    );

    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';
    const orderClause = ['aos.organization_guid ASC', 'aos.key ASC'];
    const sql = `
      SELECT
        ${applicationOrganizationSettingSelect}
      FROM public.application__organization_setting aos
      ${whereClause}
      ORDER BY
        ${orderClause.join(', ')};
    `;

    return serviceContext.dbConnections['sso'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  function allowedToSetPublic(context) {
    return (
      mainUtil.requirePerm('developer.build.approve', context) ||
      util.isSuperAdmin(context._authInfo)
    );
  }

  async function allowedToEditApplication(context, applicationId, isPublic) {
    const application = await getApplications({
      id: applicationId,
      adminView: true
    });

    // 404 - Not found
    if (_.isEmpty(application.records)) {
      throw new NotFound({
        data: {
          objectId: applicationId,
          objectType: 'Application'
        }
      });
    }

    const app = application.records[0];
    const requestor = resUtil.getClientInfo(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgMember = requestor.org === app.organizationId;
    const setPublic = _.isBoolean(isPublic);
    const isServiceToken =
      _.get(context, 'requestContext.authTokenType') === 'apikey';
    const { hasAccess: hasPackageAccess } = await validatePackageAppAccess(
      context,
      [applicationId],
      true
    );

    if (
      isSuperAdmin ||
      (isOrgMember && !setPublic) ||
      (setPublic && allowedToSetPublic(context)) ||
      isServiceToken ||
      (hasPackageAccess && !setPublic)
    ) {
      return app;
    }
    throw new errors.NotAllowed({
      message:
        'The authenticated user or token does not have privileges ' +
        'to update this application.'
    });
  }

  async function allowedToUpdateApplicationSetting(
    context,
    applicationId,
    organizationGuid
  ) {
    const tokenType = resUtil.getTokenType(context);
    const isInternalToken = tokenType === 'internal';
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    if (isInternalToken) {
      if (!organizationGuid) {
        throw new errors.InvalidInput({
          message: 'requestorOrgGuid is required when using orgless token',
          data: {
            organizationGuid
          }
        });
      }
    } else {
      // Checking authorized to edit the application
      await allowedToEditApplication(context, applicationId);
    }
    const callerOrgGuid = _.get(
      context,
      '_authInfo.organization.organizationGuid'
    );
    if (isSuperAdmin) {
      return;
    }
    if (organizationGuid !== callerOrgGuid) {
      throw new errors.NotAllowed({
        message: 'Only superadmin can edit application setting for other orgs',
        data: {
          callerOrgGuid
        }
      });
    }
  }

  async function getAppOrgEventRole(appId, orgId) {
    if (_.isNil(appId)) {
      throw new errors.InvalidInput({
        message: 'appId is required when getting the role for App Events',
        data: {
          appId
        }
      });
    }
    if (_.isNil(orgId)) {
      throw new errors.InvalidInput({
        message: 'orgId is required when getting the role for App Events',
        data: {
          orgId
        }
      });
    }
    const sqlParams = [];
    sqlParams.push(appId);
    sqlParams.push(orgId);

    const sql = `SELECT srole.role_id           AS role_id,
                        srole.role_name         AS role_name,
                        srole.role_description  AS role_description,
						srole.permissions       AS permissions
				 FROM public.application__organization app_org
						  INNER JOIN public.sso_user su on su.user_id = app_org.event_handler_user_id
						  INNER JOIN public.application app on app.application_id = app_org.application_id
              INNER JOIN sso_group sg on sg.kvp ->> 'groupType' = 'organization' AND sg.kvp ->> 'organizationId' = cast(app_org.organization_id as text)
						  INNER JOIN public.sso_user_role userrole on userrole.user_id = su.user_id AND userrole.application_id = sg.application_id
						  INNER JOIN public.role srole on srole.role_id = userrole.role_id
				 WHERE app_org.application_id = $1
				   AND app_org.organization_id = $2
				   AND app_org.event_handler_user_id IS NOT NULL
				   AND su."system_user" = TRUE
				   AND su.status = 'active'
				   AND app.application_status = 'active'
				   AND app.event_endpoint IS NOT NULL
                   AND srole.is_app_event_role = TRUE`;

    return serviceContext.dbConnections['sso'].read.map(
      sql,
      sqlParams,
      mapper.mapRole
    );
  }

  async function getApplicationsForSystemUser(userId, dbTrans) {
    if (!dbTrans) {
      dbTrans = serviceContext.dbConnections['sso'].read;
    }
    mainUtil.checkId(userId, false, false, true);
    const sqlParams = [userId];
    const sql = `
      SELECT ao.application_id,
            a.application_name,
            a.application_key
      FROM 	public.application__organization ao
        INNER JOIN public.application a ON a.application_id = ao.application_id
      WHERE 	ao.event_handler_user_id = $1
        AND ao.application_state = 'active'
        AND a.application_status = 'active'
        AND a.event_endpoint IS NOT NULL;
    `;

    return dbTrans.map(sql, sqlParams, mapper.camelizeRootKeys);
  }

  async function getApplicationHeaderbar(options, context) {
    const sqlWhere = [];
    const args = [];

    const organizationGuid = await getOrganizationGuid(context, options.orgId);

    let sql = `
      SELECT
        headerbar_id,
        application_id,
        organization_guid,
        headerbar_name,
        background_color,
        help_enabled,
        notification_enabled,
        logo_src,
        date_created,
        date_modified,
        created_by,
        modified_by
      FROM public.app_headerbar
    `;

    args.push(options.appId);
    sqlWhere.push('application_id = $' + args.length);

    args.push(organizationGuid);
    sqlWhere.push('organization_guid = $' + args.length);

    sql += ' WHERE ' + sqlWhere.join(' AND ');

    try {
      const res = await serviceContext.dbConnections['sso'].read.map(
        sql,
        args,
        mapper.mapApplicationHeaderbar
      );
      return _.isEmpty(res) ? null : res[0];
    } catch (err) {
      throw new errors.InternalServerError(err);
    }
  }

  async function createApplicationHeaderbar(options, context, db) {
    const { input } = options;
    const config = _.get(input, 'config', {});

    const dbConn = db || serviceContext.dbConnections['sso'].write;

    const userId =
      _.get(context, 'requestContext.userInfo.userId') ||
      _.get(context, 'requestContext.tokenInfo.applicationId');

    const organizationGuid = await getOrganizationGuid(context, options.orgId);
    const headerbarId = uuid.v4();

    const columnData = {
      headerbar_id: headerbarId,
      application_id: options.appId,
      organization_guid: organizationGuid,
      headerbar_name: input.name,
      background_color: config.backgroundColor,
      help_enabled: config.help,
      notification_enabled: config.notification,
      logo_src: config.logoSrc,
      created_by: userId,
      modified_by: userId
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'public.app_headerbar',
      columnData,
      returningAppHeaderbar
    );

    try {
      return await dbConn.one(sql, values, mapper.mapApplicationHeaderbar);
    } catch (err) {
      throw new errors.InternalServerError(err);
    }
  }

  async function updateApplicationHeaderbar(options, context) {
    const { input } = options;
    const config = _.get(input, 'config', {});

    const userId =
      _.get(context, 'requestContext.userInfo.userId') ||
      _.get(context, 'requestContext.tokenInfo.applicationId');

    const organizationGuid = await getOrganizationGuid(context, options.orgId);

    const columnData = {
      application_id: options.appId,
      headerbar_id: uuid.v4(),
      organization_guid: organizationGuid,
      headerbar_name: input.name,
      background_color: config.backgroundColor,
      help_enabled: config.help,
      notification_enabled: config.notification,
      logo_src: config.logoSrc,
      created_by: userId,
      modified_by: userId
    };
    const query = generateAppHeaderbarUpsertQuery(columnData);
    try {
      const res = await serviceContext.dbConnections['sso'].write.one(
        query,
        [],
        mapper.mapApplicationHeaderbar
      );
      return res;
    } catch (err) {
      throw new errors.InternalServerError(err);
    }
  }

  async function updateApplicationDetails(options, context) {
    const { input, appId } = options;
    const args = [];
    const sqlValues = [];
    const attributes = Object.keys(input);

    let sql = `
      DELETE FROM public.application_metadata
      WHERE application_id = $1;
      INSERT INTO public.application_metadata
      (application_id, type, content)
      VALUES `;

    attributes.forEach((item) => {
      sqlValues.push(
        `($${args.length + 1}, $${args.length + 2}, $${args.length + 3})`
      );
      if (item.indexOf('useCases') >= 0) {
        args.push(appId, item, {
          format: 'markdown',
          data: input[item]
        });
      } else {
        const type =
          typeof input[item] === 'object' ? 'json' : typeof input[item];
        args.push(appId, item, {
          format: type,
          data: input[item]
        });
      }
    });

    sql += ` ${sqlValues.join(', ')}
          ON CONFLICT (application_id, type)
          DO UPDATE SET content = EXCLUDED.content
          RETURNING *`;
    try {
      const result = await serviceContext.dbConnections['sso'].write.map(
        sql,
        args,
        mapper.mapApplicationDetails
      );
      return result;
    } catch (err) {
      throw new errors.InternalServerError(err);
    }
  }
  // filter grants at packages tied to a appConfigDefinition
  async function filterConfigByGrantPackage(configs, orgId) {
    let configFiltered = [];
    for (config of configs) {
      if (config.packageId) {
        try {
          const isValid = await serviceContext.dal.packages.checkPackageAccess(
            config.packageId,
            orgId
          );
          isValid ? configFiltered.push(config) : null;
        } catch (error) {
          logger.error(error);
        }
      } else {
        configFiltered.push(config);
      }
    }
    return configFiltered;
  }

  function mergeConfigurations(appConfigs, appConfigDefinitions) {
    // check if exists config for an applicationId and configKey into appConfigs. if not then add it from appConfigDefinitions
    appConfigDefinitions.forEach((config) => {
      const key = `${config.applicationId}:${config.configKey}`;
      const exists = appConfigs.some(
        (appConfig) =>
          `${appConfig.applicationId}:${appConfig.configKey}` === key
      );
      if (!exists) {
        appConfigs.push(config);
      }
    });

    return appConfigs;
  }

  async function checkPackageAccess(context, options) {
    const orgId = _.get(options, 'orgId');
    const appIds = _.get(options, 'appIds', []);
    const excludeViewOnly = _.get(options, 'excludeViewOnly');
    // get appIds granted by packages
    // if appIds = [], then all available appIds from packages will be returned
    const allowedResources = await serviceContext.dal.packages.getAccessiblePackageResources(
      context,
      {
        organizationId: orgId,
        resourceTypes: ['application'],
        resourceIds: appIds,
        excludeViewOnly
      }
    );
    const resourceIds = _.map(allowedResources, 'resourceId');
    const hasPackageAccess = appIds.every((id) => resourceIds.includes(id));
    return {
      resourceIds: resourceIds,
      hasPackageAccess: hasPackageAccess
    };
  }

  async function validatePackageAppAccess(
    context,
    appIdsInput,
    checkPackageOnly = false,
    excludeViewOnly = true
  ) {
    const orgId =
      _.get(context, '_authInfo.organization.organizationId') ||
      _.get(context, 'organizationId');
    const useAppGrant = await mainUtil.isEnableFeatureInOrganization(
      context,
      null,
      orgId,
      ['enablePackageGrantLogic', 'useAppGrant']
    );
    let checker = (allowedIds, ids) =>
      ids.every((id) => allowedIds.includes(id));
    const allowedIds = [];
    let hasAccess = false;
    const appIds = appIdsInput || [];
    let hasPackageAccess = false;
    if (useAppGrant) {
      const packageAccessResult = await checkPackageAccess(context, {
        orgId: orgId,
        appIds: appIds,
        excludeViewOnly: excludeViewOnly
      });
      hasPackageAccess = packageAccessResult.hasPackageAccess;
      allowedIds.push(...packageAccessResult.resourceIds);
    }

    if (!checkPackageOnly) {
      const applications = await getApplications({
        organizationId: orgId,
        // all: true,
        // owned: false,
        accessScope: [accessScopeEnum.any],
        ignoreValidatePackageAppAccess: true
      });
      const allApps = _.map(applications.records, (app) => app.applicationId);
      allowedIds.push(...allApps);
    }
    hasAccess = checker(allowedIds, appIds) || hasPackageAccess;
    // Throw if not allowed to access application
    // if (!hasAccess) {
    //   throw new errors.NotAllowed({
    //     message: 'No access to given application(s).'
    //   });
    // }
    return {
      hasAccess: hasAccess,
      allowedIds: allowedIds.filter((id) => validator.isUUID(id))
    };
  }

  const validateRoles = (roles) => {
    if (!Array.isArray(roles)) {
      throw new errors.InvalidInput({
        message: 'roles must be an array.'
      });
    }

    for (const role of roles) {
      if (!role.id) {
        if (
          !role.name ||
          !role.description ||
          !Array.isArray(role.permissions) ||
          role.permissions.length === 0 ||
          role.isPrivate === undefined ||
          role.isAppEventRole === undefined
        ) {
          throw new errors.InvalidInput({
            message:
              'roles without an ID must have non-empty name, description, isPrivate, isAppEventRole fields, and a non-empty permissions array.'
          });
        }
      }
    }
  };

  const updateRolesData = (inputRoles, currentRoles) => {
    //  Normalize data
    const normalizedInputRoles = _.map(inputRoles, (role) => ({
      ...role,
      roleName: role.name,
      roleDescription: role.description
    }));

    //  Check if currentRoles are empty
    if (_.isEmpty(currentRoles)) {
      return normalizedInputRoles;
    }

    //  Compare and update fields
    const updatedRoles = _.map(currentRoles, (currentRole) => {
      const matchedRole = _.find(normalizedInputRoles, ['id', currentRole.id]);

      if (matchedRole) {
        return {
          ...currentRole,
          roleName: matchedRole.roleName || currentRole.roleName,
          roleDescription:
            matchedRole.roleDescription || currentRole.roleDescription,
          permissions: matchedRole.permissions || currentRole.permissions,
          isPrivate:
            matchedRole.isPrivate !== undefined
              ? matchedRole.isPrivate
              : currentRole.isPrivate,
          isAppEventRole:
            matchedRole.isAppEventRole !== undefined
              ? matchedRole.isAppEventRole
              : currentRole.isAppEventRole
        };
      }

      return currentRole;
    });

    // Append roles from inputRoles which don't have the 'id' property at all
    const rolesWithoutID = _.filter(
      normalizedInputRoles,
      (inputRole) => !_.has(inputRole, 'id')
    );

    // Return the combined updated roles and new roles
    return [...updatedRoles, ...rolesWithoutID];
  };

  function generateApplicationRolesUpsertQuery(appId, orgId, roles) {
    const columns = [
      'role_id',
      'role_name',
      'role_description',
      'permissions',
      'organization_id',
      'application_id',
      'is_private',
      'is_app_event_role'
    ];
    const cs = new pgp.helpers.ColumnSet(columns, { table: 'role' });

    const values = roles.map((r) => {
      let permissionMark = [];
      if (Array.isArray(r.permissions) && r.permissions.length > 0) {
        permissionMark =
          typeof r.permissions[0] === 'string'
            ? fpUtil.getPermissionMaskFromEnums(r.permissions)
            : r.permissions;
      }

      return {
        role_id: r.id || uuid.v4(),
        role_name: r.roleName,
        role_description: r.roleDescription,
        permissions: permissionMark,
        organization_id: orgId,
        application_id: appId,
        is_private: r.isPrivate,
        is_app_event_role: r.isAppEventRole
      };
    });

    let query =
      pgp.helpers.insert(values, cs) +
      ' ON CONFLICT (role_id) DO UPDATE SET ' +
      cs.columns
        .map((x) => {
          const col = pgp.as.name(x.name);
          return col + ' = excluded.' + col;
        })
        .join() +
      ' RETURNING *';

    return query;
  }

  async function updateApplicationRoles(options, context) {
    const { appId, orgId, roles, appStatus } = options;
    validateRoles(roles);
    let result = [];
    let roleIdsToDelete = [];
    let rolesToUpdate = [];

    try {
      const autoDeleteWhenRoleMissing =
        !_.isNil(appStatus) && appStatus !== 'active';
      const roleIds = roles
        .filter((role) => !_.isNil(role.id))
        .map((role) => role.id);

      // does nothing when the applicationRoles input is empty and app is active.
      if (!autoDeleteWhenRoleMissing && _.isEmpty(roleIds)) {
        return result;
      }

      // need to fetch all roles if automatic deletion of missing roles is allowed.
      const currentRolesRes = await serviceContext.dal.role.getRoles(context, {
        id: autoDeleteWhenRoleMissing ? undefined : roleIds,
        applicationId: appId,
        organizationIds: [orgId]
      });
      const currentRoles = _.get(currentRolesRes, 'records', []);

      if (autoDeleteWhenRoleMissing && !_.isEmpty(currentRoles)) {
        const systemRoleIds = Object.values(constants.ROLES);
        if (_.isEmpty(roleIds)) {
          // delete all roles if the input is empty, except for system roles and the is_default_app_role.
          for (const r of currentRoles) {
            if (!systemRoleIds.includes(r.id) && r.isDefaultAppRole !== true) {
              roleIdsToDelete.push(r.id);
            }
          }
        } else {
          // delete missing roles, except for system roles and is_default_app_role.
          for (const r of currentRoles) {
            if (
              !systemRoleIds.includes(r.id) &&
              r.isDefaultAppRole !== true &&
              !roleIds.includes(r.id)
            ) {
              roleIdsToDelete.push(r.id);
            } else if (roleIds.includes(r.id)) {
              // only updates roles included in the input.
              rolesToUpdate.push(r);
            }
          }
        }
      }

      // only updates roles in the input and inserts ones without an ID field.
      const updatedRolesData = updateRolesData(
        roles,
        autoDeleteWhenRoleMissing ? rolesToUpdate : currentRoles
      );

      if (!_.isEmpty(updatedRolesData)) {
        let sql = generateApplicationRolesUpsertQuery(
          appId,
          orgId,
          updatedRolesData
        );

        result = await serviceContext.dbConnections['sso'].write.map(
          sql,
          [],
          mapper.mapRole
        );
      }

      if (roleIdsToDelete.length > 0) {
        await serviceContext.bll.application.deleteApplicationRoles(
          context,
          roleIdsToDelete,
          {
            applicationId: appId,
            organizationId: orgId,
            skipRoleValidation: true,
            skipAppValidation: true
          }
        );
      }
      return result;
    } catch (err) {
      logger.error('Failed to updateApplicationRoles: ', err);
      throw new errors.InternalServerError(err);
    }
  }

  function validateAppConfigDefaultValue(configType, defaultValue) {
    switch (configType) {
      case configTypeEnum.Boolean:
        return validator.isBoolean(defaultValue);
      case configTypeEnum.Integer:
        return validator.isInt(defaultValue);
      case configTypeEnum.Float:
        return validator.isFloat(defaultValue);
      case configTypeEnum.Date:
        return validator.isDate(defaultValue);
      case configTypeEnum.JSON:
        return validator.isJSON(defaultValue);
      default:
        return true;
    }
  }

  async function _formatInputAppConfig(context, appId, configs) {
    const inputConfigMap = new Map(
      configs.map((item) => [item.configKey, item])
    );
    const configResult = await getApplicationConfigDefinition(
      {
        appId,
        configKeys: [...inputConfigMap.keys()]
      },
      context
    );
    const appConfigs = _.get(configResult, 'records', []);

    for (const appConfig of appConfigs) {
      const inputConfig = inputConfigMap.get(appConfig.configKey);

      // if an input config is config org level, add isConfigOrgLevel flag to it.
      if (inputConfig) {
        inputConfig.isConfigOrgLevel =
          _.lowerCase(appConfig.configLevel) === configLevelEnum.organization;
        inputConfig.isConfigInstanceLevel =
          _.lowerCase(appConfig.configLevel) === configLevelEnum.instance;
      }
    }

    return [...inputConfigMap.values()];
  }

  async function _emitPublicEvent(context, eventName, data, error) {
    const actionMap = {
      [supportedEvents.ApplicationCreate]: 'create',
      [supportedEvents.ApplicationUpdate]: 'update',
      [supportedEvents.ApplicationDelete]: 'delete'
    };
    data = data || {};
    const status = !error ? 'success' : 'failure';
    // emit event
    const event = {
      applicationId: data.id || data.applicationId,
      applicationName: data.name || data.applicationName,
      applicationStatus: data.applicationStatus,
      organizationId: data.organizationId || data.owner_organization_id,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        data.id || data.applicationId,
        error,
        actionMap[eventName],
        status,
        getActionDetail(eventName, status, data, error)
      )
    };
    try {
      await messageUtil.emitPublicEvent(eventName, 'system', context, event);
    } catch (ex) {
      logger.error(`failed to publish event: ${eventName}`, ex);
    }
  }

  function getActionDetail(eventName, status, data, error) {
    const details = ACTION_DETAILS[eventName];
    if (!details) return null;
    const message = details[status];
    return message(data, error);
  }

  return {
    createApplicationDetails,
    updateApplicationDetails,
    getApplicationDetails,
    createApplication,
    _validateApplicationRolePermissions,
    deleteApplication,
    updateApplication,
    _checkPermissionOnAppConfigSetOrDelete,
    applicationConfigSet,
    applicationConfigDelete,
    _validateInputAppConfigDefinitions,
    applicationConfigDefinitionTx,
    applicationAddToOrg,
    applicationRemoveFromOrg,
    applicationWorkflow,
    getContextMenuExtensions,
    bulkDeleteContextMenuExtensions,
    fileApplication,
    unfileApplication,
    updateApplicationComponent,
    updateApplicationBillingPlanId,
    updateApplicationBillingDirty,
    createContextMenuExtension,
    updateContextMenuExtension,
    deleteContextMenuExtension,
    getAppIdFromOrgId,
    getApplication,
    getApplications,
    getApplicationsQuery,
    getApplicationConfig,
    getApplicationConfigDefinition,
    getAppOrgEventRole,
    getContextMenuExtension,
    createApplicationOrganizationSetting,
    deleteApplicationOrganizationSetting,
    getApplicationOrganizationSettings,
    getOldestApplication,
    allowedToEditApplication,
    getApplicationsForSystemUser,
    getApplicationHeaderbar,
    createApplicationHeaderbar,
    updateApplicationHeaderbar,
    updateApplicationRoles,
    validatePackageAppAccess,
    // for unit-test only
    checkApplicationNameOrKeyConflict,
    generateAppHeaderbarUpsertQuery,
    // Node Red Palettes
    getNodeRedPalettesByApplication,
    getNodeRedPalettesByModuleIds,
    allowedToSetApplicationConfig,
    getOrganizationGuid
  };
};
