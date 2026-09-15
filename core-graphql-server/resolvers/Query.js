const buildInfo = require('../buildinfo.js'),
  _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);
  const mainUtil = require('../util.js')(serviceContext);
  const dalAdmin = serviceContext.dal.admin,
    dalAsset = serviceContext.dal.asset,
    dalEngine = serviceContext.dal.engine,
    dalEngineResult = serviceContext.dal.engineResult,
    dalEngineCategory = serviceContext.dal.engineCategory,
    dalLibrary = serviceContext.dal.library,
    dalShare = serviceContext.dal.share,
    dalCollection = serviceContext.dal.collection,
    dalSearch = serviceContext.dal.search,
    dalSavedSearch = serviceContext.dal.savedSearch,
    dalStructuredData = serviceContext.dal.structuredData,
    dalFolder = serviceContext.dal.folder,
    dalMention = serviceContext.dal.mention,
    dalStaticAppConfig = serviceContext.dal.staticAppConfig,
    dalWatchlist = serviceContext.dal.watchlist,
    dalTDO = serviceContext.dal.tdo,
    dalTrigger = serviceContext.dal.trigger,
    dalCreative = serviceContext.dal.creative,
    dalEngineClass = serviceContext.dal.engineClass,
    dalDataset = serviceContext.dal.dataset,
    dalEntityTags = serviceContext.dal.entityTags,
    dalPackages = serviceContext.dal.packages,
    dalApplicationViewers = serviceContext.dal.applicationViewers,
    dalEmailTemplate = serviceContext.dal.emailTemplate,
    dalProcessingDeliverables = serviceContext.dal.processingDeliverables;

  const QueryMap = {
    timeZones(root, args, context) {
      return mainUtil.getAllTimeZones();
    },
    temporalDataObjects(root, args, context) {
      util.checkMaxTDOLimit(context, args);
      return dalTDO.getTDOs(context, args);
    },
    temporalDataObject(root, args, context) {
      return dalTDO.getTDO(context, args);
    },
    cloneRequests(root, args, context) {
      return dalTDO.getCloneRequests(args.id, args.applicationId, args);
    },
    engines(root, args, context) {
      return dalEngine.getEngines(context, args);
    },
    engine(root, args, context) {
      return dalEngine.getEngine(context, args);
    },
    engineBuild(root, args, context) {
      return dalEngine.getBuild(args);
    },
    recentBuilds(root, args, context) {
      return dalEngine.getRecentBuilds(args, context);
    },
    engineOverview(root, args, context) {
      return dalEngine.getEngineOverview(args, context);
    },
    engineResults(root, args, context) {
      return dalEngineResult.getEngineResults(args, context);
    },
    engineCategories(root, args, context) {
      return dalEngineCategory.getEngineCategories(
        context,
        Object.assign({ cognitiveOnly: true }, args)
      );
    },
    engineCategory(root, args, context) {
      return dalEngineCategory.getEngineCategory(context, args);
    },
    engineClasses(root, args, context) {
      return dalEngineClass.getEngineClasses(context, args);
    },
    engineClass(root, args, context) {
      return dalEngineClass.getEngineClass(context, args);
    },
    matchEntityTags(root, args, context) {
      return dalEntityTags.getMatchedEntityTags(args);
    },
    jobs(root, args, context) {
      return serviceContext.dal.job.getJobs(context, args);
    },
    job(root, args, context) {
      return serviceContext.dal.job.getJob(context, args);
    },
    task(obj, args, context, info) {
      return serviceContext.dal.task.getTask(context, args);
    },
    async applications(root, args, context) {
      args.isSuperAdmin = util.isSuperAdmin(context._authInfo);
      const applications = await serviceContext.dal.application.getApplications(
        args,
        context
      );
      // make sure parent operation's args are available for the resolver
      const appsWithQueryArgs = {
        ...applications,
        records: applications.records.map((app) => {
          return {
            ...app,
            __queryArgs: args
          };
        })
      };
      return {
        ...appsWithQueryArgs,
        _queryArgs: args
      };
    },
    async application(root, args, context) {
      const application = await serviceContext.dal.application.getApplication(
        args,
        context
      );
      return {
        ...application,
        __queryArgs: args
      };
    },
    applicationConfig(root, args, context) {
      return serviceContext.dal.application.getApplicationConfig(args, context);
    },
    applicationConfigDefinition(root, args, context) {
      return serviceContext.dal.application.getApplicationConfigDefinition(
        args,
        context
      );
    },
    applicationHeaderbar(_, args, context) {
      return serviceContext.dal.application.getApplicationHeaderbar(
        args,
        context
      );
    },
    organizations(root, args, context) {
      args.isSuperAdmin = util.isSuperAdmin(context._authInfo);
      // map id param to org ID so that auth by orgs works
      args.organizationId = args.id;
      args.organizationIds = args.id ? [args.id] : [];
      const allowedOrgs = util.authorizeOrgIds(context._authInfo, args);
      const isCSAdmin = util.isCSAdmin(context._authInfo);
      const setAllowedOrgs = !isCSAdmin;
      if (Array.isArray(allowedOrgs) && setAllowedOrgs) {
        args.id = allowedOrgs;
      }
      return serviceContext.dal.organization.getOrganizations(context, args);
    },
    organization(root, args, context) {
      args.isSuperAdmin = util.isSuperAdmin(context._authInfo);
      // map id param to org ID so that auth by orgs works
      args.organizationId = args.id;
      const allowedOrgs = util.authorizeOrgIds(context._authInfo, args);
      if (Array.isArray(allowedOrgs) && !_.includes(allowedOrgs, args.id)) {
        throw new errors.NotAllowed({
          message: 'Access to the requested org denied',
          data: {
            organizationId: args.id,
            field: 'id'
          }
        });
      }
      return serviceContext.dal.organization.getOrganization(context, args);
    },
    myOrganizations(root, args, context) {
      const authInfo = context._authInfo;
      args.userId = authInfo.userId
        ? authInfo.userId
        : authInfo.data
        ? authInfo.data.userId
        : null;
      if (!args.userId) {
        throw new errors.NotAllowed({
          message: 'Valid user session is required.'
        });
      }
      return serviceContext.dal.organization.getMyOrganizations(context, args);
    },
    instanceLoginConfigurations(root, args, context) {
      return serviceContext.dal.platform.getInstanceLoginConfigurations(args);
    },
    loginConfiguration(root, args, context) {
      return serviceContext.dal.organization.getLoginConfiguration(args);
    },
    async registrationConfiguration(root, args, context) {
      const res = await serviceContext.dal.organizationRegistration.getRegistrationConfigurations(
        args
      );

      const registrationConfig = _.get(res, 'records[0]');

      const orgAccess = await serviceContext.dal.admin.allowedToUpdateOrganization(
        context,
        registrationConfig.organizationGuid
      );

      if (!orgAccess) {
        throw new errors.NotAllowed({
          message: 'Access denied',
          data: {
            objectType: 'Organization',
            objectId: registrationConfig.organizationGuid
          }
        });
      }

      return registrationConfig;
    },
    async registrationConfigurationInfo(root, args, context) {
      if (!args.id && !args.slug) {
        throw new errors.InvalidInput({
          message: 'Missing required id or slug parameter'
        });
      }

      const res = await serviceContext.dal.organizationRegistration.getRegistrationConfigurations(
        args
      );
      const registrationConfig = _.get(res, 'records[0]');
      if (!registrationConfig) {
        return null;
      }

      // return only the registration configuration info (support snake_case from DAL)
      const organizationGuid =
        registrationConfig.organizationGuid ||
        registrationConfig.organization_guid ||
        null;
      const openRegistrationStatus =
        registrationConfig.openRegistrationStatus ??
        registrationConfig.open_registration_status ??
        null;
      const adminApprovalRequired =
        registrationConfig.adminApprovalRequired ??
        registrationConfig.admin_approval_required ??
        null;
      return {
        id: registrationConfig.id,
        name: registrationConfig.name,
        slug: registrationConfig.slug,
        organizationGuid,
        openRegistrationStatus,
        adminApprovalRequired
      };
    },
    permissions(root, args, context) {
      return serviceContext.dal.role.getPermissions(args);
    },
    entityIdentifierTypes(root, args, context) {
      return dalLibrary.getEntityIdentifierTypes(args);
    },
    entityIdentifierType(root, args, context) {
      return dalLibrary.getEntityIdentifierType(args);
    },
    libraryTypes(root, args, context) {
      return dalLibrary.getLibraryTypes(args);
    },
    libraryType(root, args, context) {
      return dalLibrary.getLibraryType(args);
    },
    libraries(root, args, context, info) {
      return dalLibrary.getLibraries(args);
    },
    library(root, args, context, info) {
      return dalLibrary.getLibrary(args);
    },
    libraryEngineModel(root, args, context, info) {
      return dalLibrary.getLibraryEngineModel(args);
    },
    entity(root, args, context, info) {
      args.orgId = args.organizationId;
      return dalLibrary.getEntity(args);
    },
    entities(root, args, context, info) {
      args.orgId = args.organizationId;
      return dalLibrary.getEntities(args);
    },
    libraryConfiguration(_, args) {
      return dalLibrary.getLibraryConfiguration(args);
    },
    users(root, args, context) {
      return dalAdmin.getUsers(args, context);
    },
    user(root, args, context) {
      return dalAdmin.getUser(args, context);
    },
    me(root, args, context) {
      const authInfo = context._authInfo;
      context.skipCache = true;
      args.id = authInfo.userId
        ? authInfo.userId
        : authInfo.data
        ? authInfo.data.userId
        : null;
      const orgId = authInfo.organization
        ? authInfo.organization.organizationId
        : authInfo.data
        ? authInfo.data.applicationId
        : 'internal';
      const isEngineJwt = mainUtil.hasEngineJwt(context);
      const isApiToken =
        !_.isNil(authInfo.tokenId) ||
        (authInfo.json && !_.isNil(authInfo.json.tokenId));

      if (isApiToken || !args.id) {
        // it's an API key; no user
        let id = isEngineJwt
          ? mainUtil.getEngineJwtId(_.get(context, 'requestContext.authToken'))
          : orgId;
        let name = isEngineJwt
          ? 'Engine token ' + id
          : 'API key for ' +
            (authInfo.organization
              ? authInfo.organization.organizationName
              : 'unknown');
        return {
          id: _.toString(id),
          name: name,
          organizationId: orgId
        };
      } else {
        return dalAdmin.getUser(args, context);
      }
    },
    mediaShare(root, args, context) {
      return dalShare.getMediaShare(context, args);
    },
    tokens(root, args, context) {
      // restricted in schema to user tokens with admin rights
      const organizationId = _.get(
        context,
        'requestContext.userInfo.organization.organizationId'
      );

      return dalAdmin.getAllOrgTokens(context, organizationId);
    },
    groups(root, args, context) {
      return dalAdmin.getGroups(args);
    },
    mention(root, args, context) {
      return dalMention.getMention(context, args);
    },
    mentions(root, args, context) {
      return dalMention.getMentions(context, args);
    },
    sharedMention(root, args, context) {
      return dalShare.getSharedMention(context, args);
    },
    searchMentions(root, args, context) {
      return dalSearch.searchMentions(context, args);
    },
    searchMedia(root, args, context) {
      return dalSearch.searchMedia(context, args);
    },
    rootFolders(root, args, context) {
      return dalFolder.getRootFolders(context, args);
    },
    collections(root, args, context) {
      return dalCollection.getCollections(context, args);
    },
    collection(root, args, context) {
      return dalCollection.getCollection(context, args);
    },
    collectionMention(root, args, context) {
      return dalCollection.getCollectionMention(context, args);
    },
    collectionMentions(root, args, context) {
      return dalCollection.getCollectionMentions(context, args);
    },
    folder(root, args, context) {
      return dalFolder.getFolder(context, args);
    },
    folderOverview(root, args, context) {
      return dalFolder.getFolderOverview(context, args);
    },
    folderSummaryDetails(root, args, context) {
      return dalFolder.getFolderSummaryDetails(context, args);
    },
    sharedFolders(root, args, context) {
      args.authorizedOrganizationIds = _.get(
        context,
        '_authInfo.authorizedOrganizationIds'
      );
      return dalFolder.getSharedFolders(context, args);
    },
    sharedCollection(root, args, context) {
      return dalShare.getSharedCollection(context, args);
    },
    sharedCollectionHistory(root, args, context) {
      return dalShare.getSharedCollectionHistory(context, args);
    },
    asset(root, args, context) {
      return dalAsset.getAsset(context, args);
    },
    assets(root, args, context) {
      return dalAsset.getAssetList(context, args);
    },
    graphqlServiceInfo(root, args, context) {
      return {
        buildInfo: buildInfo.getBuildInfo()
      };
    },
    widget(root, args, context) {
      return dalCollection.getWidget(context, args);
    },
    structuredData(root, args, context) {
      return dalStructuredData.getStructuredDataObject(context, args);
    },
    structuredDataObject(root, args, context) {
      return dalStructuredData.getStructuredDataObject(context, args);
    },
    structuredDataObjects(root, args, context, info) {
      return dalStructuredData.getStructuredDataObjects(context, args, info);
    },
    getSignedWritableUrl(root, args, context) {
      return util.getSignedWritableUrl(serviceContext, context, args);
    },
    getSignedWritableAssetUrl(root, args, context) {
      return util.getSignedWritableAssetUrl(serviceContext, context, args);
    },
    getSignedWritableUrls(root, args, context) {
      return util.getSignedWritableUrls(serviceContext, context, args);
    },
    getUploadStatus(root, args, context) {
      return util.getUploadStatus(serviceContext, context, args);
    },
    myRights(root, args, context) {
      return {
        operations: mainUtil.listRights(context._authInfo),
        resources: mainUtil.listResources(context.requestContext)
      };
    },
    watchlists(root, args, context) {
      return dalWatchlist.getWatchlists(args, context);
    },
    watchlist(root, args, context) {
      return dalWatchlist.getWatchlist(args, context);
    },
    mentionStatusOptions(root, args, context) {
      return dalWatchlist.getMentionStatusOptions(args, context);
    },
    dataRegistries(root, args, context) {
      try {
        return dalStructuredData.getDataRegistries(context, args);
      } catch (err) {
        console.error('Failed to get dataRegistries:', err.message);
        return {
          records: [],
          count: 0,
          offset: args.offset || 0,
          limit: args.limit || 0
        };
      }
    },
    dataRegistry(root, args, context) {
      return dalStructuredData.getDataRegistry(context, args);
    },
    schemas(root, args, context) {
      try {
        // dataRegistryMetadataId maps to dataRegistryId at api level
        args.dataRegistryMetadataId = args.dataRegistryId;
        return dalStructuredData.getSchemas(context, args);
      } catch (err) {
        console.error('Failed to get schemas:', err.message);
        return {
          records: [],
          count: 0,
          offset: args.offset || 0,
          limit: args.limit || 0
        };
      }
    },
    schema(root, args, context) {
      return dalStructuredData.getSchema(context, args);
    },
    schemaProperties(root, args, context) {
      return dalStructuredData.getSchemaProperties(context, args);
    },
    packages(root, args, context) {
      return dalPackages.getPackages(context, args);
    },
    packageGrants(root, args, context) {
      return dalPackages.getPackageGrants(context, args);
    },
    subscription(root, args, context) {
      return dalWatchlist.getSubscription(args);
    },
    cognitiveSearch(root, args, context) {
      return dalWatchlist.getCognitiveSearch(args);
    },
    trigger(root, args, context) {
      return dalTrigger.getTrigger(context, args);
    },
    triggers(root, args, context) {
      return dalTrigger.getTriggers(context, args);
    },
    savedSearches(root, args, context) {
      return dalSavedSearch.getSavedSearch(context, args);
    },
    exportRequests(root, args, context) {
      return serviceContext.dal.exportRequest.getExportRequests(context, args);
    },
    exportRequest(root, args, context) {
      return serviceContext.dal.exportRequest.getExportRequest(context, args);
    },
    auditLog(root, args, context) {
      return serviceContext.dal.auditLog.getAuditLog(context, args);
    },
    instanceAuditLog(root, args, context, info) {
      return serviceContext.dal.instanceAuditLog.getAuditLog(
        context,
        args,
        info
      );
    },
    event(root, args, context) {
      return serviceContext.dal.event.event(context, args);
    },
    events(root, args, context) {
      return serviceContext.dal.event.events(context, args);
    },
    eventActionTemplate(root, args, context) {
      return serviceContext.dal.event.eventActionTemplate(context, args);
    },
    eventActionTemplates(root, args, context) {
      return serviceContext.dal.event.eventActionTemplates(context, args);
    },
    eventCustomRule(root, args, context) {
      return serviceContext.dal.eventCustomRule.eventCustomRule(context, args);
    },
    eventCustomRules(root, args, context) {
      return serviceContext.dal.eventCustomRule.eventCustomRules(context, args);
    },
    eventSubscriptions(root, args, context) {
      return serviceContext.dal.event.eventSubscriptions(context, args);
    },
    eventSubscription(root, args, context) {
      return serviceContext.dal.event.eventSubscription(context, args);
    },
    processTemplates(root, args, context) {
      return serviceContext.dal.processTemplate.getProcessTemplates(
        args,
        context
      );
    },
    processTemplate(root, args, context) {
      return serviceContext.dal.processTemplate.getProcessTemplate(
        args,
        context
      );
    },
    creative(root, args, context) {
      return dalCreative.getCreative(args, context);
    },
    auditEvents(root, args, context) {
      return serviceContext.dal.event.getAuditEvents(context, args);
    },
    customDashboard(root, args, context) {
      return serviceContext.dal.customDashboard.getCustomDashboard(
        context,
        args
      );
    },
    customDashboards(root, args, context) {
      return serviceContext.dal.customDashboard.getCustomDashboards(
        context,
        args
      );
    },
    getUsageByTaskType(root, args, context) {
      return serviceContext.dal.task.getUsageByTaskType(context, args);
    },
    dataset(root, args, context) {
      return dalDataset.getDataset(context, args);
    },
    datasets(root, args, context) {
      return dalDataset.getDatasets(context, args);
    },
    datasetDataQuery(root, args, context) {
      return dalDataset.getDatasetDataQuery(context, args);
    },
    taskReplacementEngines(root, args, context) {
      return serviceContext.bll.engine.getEngineReplacements(context, args);
    },
    notificationMailboxes(root, args, context) {
      return serviceContext.bll.mailbox.getMailboxes(context, args);
    },
    notificationTemplates(root, args, context) {
      return serviceContext.bll.notification.getNotificationTemplates(
        context,
        args
      );
    },
    notificationActions(root, args, context) {
      return serviceContext.bll.notification.getNotificationActions(
        context,
        args
      );
    },
    getUserSettingDefinitions(root, args, context) {
      return serviceContext.dal.application.getApplicationOrganizationSettings(
        context,
        args
      );
    },
    getUserSettings(root, args, context) {
      return serviceContext.dal.admin.getUserSettings(context, args);
    },
    staticAppConfig(root, args, context) {
      return dalStaticAppConfig.getStaticAppConfig(context, args);
    },
    openIdProvider(root, args, context) {
      return serviceContext.dal.openidConnect.getOpenIdConnect(context, args);
    },
    openIdProviders(root, args, context) {
      return serviceContext.dal.openidConnect.getOpenIdConnects(context, args);
    },
    basicUserInfo: async (root, args, context) => {
      return serviceContext.bll.user.getBasicUserInfo(context, args);
    },
    platformInfo: async (root, args, context) => {
      return {}; //implemented in PlatformInfo resolver
    },
    apiTokens: async (_, args, context) => {
      return dalAdmin.getApiTokens(args, context);
    },
    applicationViewers(root, args, context) {
      return dalApplicationViewers.getApplicationViewers(context, args);
    },
    instanceAuditLogConfig(_, args, context, info) {
      return serviceContext.dal.platform.instanceAuditLogConfig(
        context,
        args.input,
        info
      );
    },
    auditLogExportRequest(_, args, context) {
      return serviceContext.dal.platform.getAuditLogExportRequestObjectsForOrg(
        context,
        args,
        true
      );
    },
    auditLogExportRequestForOrg(_, args, context) {
      return serviceContext.dal.platform.getAuditLogExportRequestObjectsForOrg(
        context,
        args
      );
    },

    platformEmailProvider: async (_, args, context) => {
      return serviceContext.bll.platformProvider.getPlatformEmailProvider(
        context,
        args
      );
    },
    emailTemplateGet(root, args, context) {
      return dalEmailTemplate.getEmailTemplate(context, args);
    },
    ingestSlug(root, args, context) {
      return serviceContext.dal.ingestSlug.getIngestSlug(
        args,
        context
      );
    },
    ingestSlugs(root, args, context) {
      return serviceContext.dal.ingestSlug.getIngestSlugs(
        args,
        context
      );
    },
    
    processingProject(root, args, context) {
      return dalProcessingDeliverables.getProject(context, args);
    },

    processingProjects(root, args, context) {
      return dalProcessingDeliverables.getProjects(context, args);
    },

    processingDeliverable(root, args, context) {
      return dalProcessingDeliverables.getDeliverable(context, {
        id: args.id,
        processingProjectId: args.project_id
      });
    },

    processingDeliverables(root, args, context) {
      return dalProcessingDeliverables.getDeliverables(context, {
        processingProjectId: args.projectId,
        ...args
      });
    }
  };

  return QueryMap;
};
