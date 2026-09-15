/**
 * Contains our core schema.
 */

const fs = require('fs');

module.exports = function createModule(serviceContext) {
  const storage = serviceContext.storage,
    logger = serviceContext.logger,
    pg = serviceContext.pg,
    blls3 = serviceContext.blls3,
    config = serviceContext.config,
    app = serviceContext.app,
    librariesService = serviceContext.librariesService,
    dbConnections = serviceContext.dbConnections,
    messaging = serviceContext.app.messaging;

  serviceContext.localCache = require('../../localCache.js')(serviceContext);
  serviceContext.dal = {};

  const dalAsset = (serviceContext.dal.asset = require('../../dal/asset.js')(
    serviceContext
  ));

  const dalStructuredData = require('../../dal/structureddata.js')(
    serviceContext
  );

  const dalTDO = (serviceContext.dal.tdo = require('../../dal/tdo.js')(
    serviceContext
  ));

  const dalEngine = require('../../dal/dalEngine.js')(
    storage,
    logger,
    null,
    pg,
    blls3,
    config,
    dalTDO,
    app,
    serviceContext
  );

  const dalEngineCategory = require('../../dal/engineCategory.js')(
    serviceContext
  );

  const dalEngineResult = require('../../dal/dalEngineResult.js')(
    serviceContext
  );

  const dalFlowTemplate = require('../../dal/dalFlowTemplate.js')(
    serviceContext,
    dalEngine
  );

  const dalFlow = require('../../dal/dalFlow.js')(serviceContext, dalEngine);

  const dalFlowRevision = require('../../dal/dalFlowRevision.js')(
    serviceContext,
    dalEngine
  );

  const dalFlowExecution = require('../../dal/dalFlowExecution.js')(
    serviceContext,
    dalEngine
  );

  const dalSavedSearch = require('../../dal/savedSearch.js')(serviceContext);

  const dalSearch = require('../../dal/dalSearch.js')(serviceContext);

  const dalOrganization = require('../../dal/organization.js')(serviceContext);

  const dalAdmin = require('../../dal/dalAdmin.js')(
    logger,
    config,
    dalOrganization,
    serviceContext
  );

  const dalLibrary = require('../../dal/library.js')(serviceContext);

  const dalFolder = require('../../dal/dalFolder.js')(serviceContext);
  const dalFolderV2 = require('../../dal/dalFolderV2.js')(serviceContext);

  const dalPlatform = require('../../dal/dalPlatform.js')(serviceContext);

  const dalMention = require('../../dal/mention.js')(serviceContext);

  const dalCollection = require('../../dal/dalCollection.js')(
    serviceContext,
    dalMention
  );

  const dalShare = require('../../dal/share.js')(serviceContext);

  const dalWatchlist = require('../../dal/watchlist.js')(serviceContext);

  const dalTrigger = require('../../dal/trigger.js')(
    logger,
    config,
    dbConnections,
    messaging,
    serviceContext
  );

  const dalNotification = require('../../dal/notification.js')(serviceContext);

  const dalEvent = require('../../dal/event.js')(serviceContext);

  const dalEventCustomRule = require('../../dal/eventCustomRule.js')(
    serviceContext,
    dalEvent
  );

  const dalExportRequest = require('../../dal/exportRequest.js')(
    serviceContext
  );

  const dalAuditLog = require('../../dal/auditLog.js')(serviceContext);
  const dalInstanceAuditLog = require('../../dal/instanceAuditLog.js')(
    serviceContext
  );

  const dalTask = require('../../dal/task.js')(serviceContext);

  const dalJob = require('../../dal/job.js')(serviceContext);
  const dalV3Job = require('../../dal/dalV3Job.js')(serviceContext);

  const dalWorkflow = require('../../dal/workflow.js')(
    logger,
    config,
    dbConnections,
    serviceContext
  );

  const dalCreative = require('../../dal/creative.js')(serviceContext);

  const dalApplication = require('../../dal/dalApplication.js')(
    logger,
    config,
    serviceContext
  );
  const dalEngineClass = require('../../dal/engineClass.js')(serviceContext);
  const dalEntityTags = require('../../dal/entityTags.js')(serviceContext);
  const dalPackages = require('../../dal/package.js')(serviceContext, config);
  const dalApplicationViewers = require('../../dal/applicationViewer.js')(
    serviceContext,
    config
  );
  const dalRole = require('../../dal/role.js')(serviceContext);
  const dalProcessTemplate = require('../../dal/processTemplate.js')(
    serviceContext
  );
  const dalStorage = require('../../dal/storage.js')(serviceContext);

  const dalCustomDashboard = require('../../dal/customDashboard.js')(
    serviceContext
  );

  const dalDataset = require('../../dal/dataset.js')(serviceContext);
  const dalMailbox = require('../../dal/mailbox.js')(serviceContext);

  const dalStaticAppConfig = require('../../dal/dalStaticAppConfig.js')(
    serviceContext
  );
  const dalOpenIdConnect = require('../../dal/openidConnect.js')(
    serviceContext
  );
  const dalOrganizationInvite = require('../../dal/organizationInvite.js')(
    serviceContext
  );
  const dalAlwaysUpFlow = require('../../dal/dalAlwaysUpFlow.js')(
    serviceContext
  );

  const dalOrganizationRegistration = require('../../dal/dalOrganizationRegistration.js')(
    serviceContext
  );

  const dalExternalCredential = require('../../dal/externalCredential')(
    serviceContext
  );

  const dalEmailTemplate = require('../../dal/emailTemplate.js')(
    serviceContext
  );

  const dalIngestSlug = require('../../dal/ingestSlug.js')(serviceContext);
  
  const dalProcessingDeliverables = require('../../dal/processingDeliverables.js')(
    serviceContext,
    config
  );

  // add our own DAL modules
  serviceContext.dal = Object.assign(serviceContext.dal, {
    application: dalApplication,
    engine: dalEngine,
    engineCategory: dalEngineCategory,
    engineResult: dalEngineResult,
    flowTemplate: dalFlowTemplate,
    flow: dalFlow,
    flowRevision: dalFlowRevision,
    flowExecution: dalFlowExecution,
    library: dalLibrary,
    structuredData: dalStructuredData,
    admin: dalAdmin,
    collection: dalCollection,
    search: dalSearch,
    savedSearch: dalSavedSearch,
    asset: dalAsset,
    tdo: dalTDO,
    libraryService: librariesService,
    folder: dalFolder,
    folderV2: dalFolderV2,
    mention: dalMention,
    share: dalShare,
    watchlist: dalWatchlist,
    organization: dalOrganization,
    trigger: dalTrigger,
    notification: dalNotification,
    exportRequest: dalExportRequest,
    auditLog: dalAuditLog,
    instanceAuditLog: dalInstanceAuditLog,
    event: dalEvent,
    eventCustomRule: dalEventCustomRule,
    workflow: dalWorkflow,
    task: dalTask,
    job: dalJob,
    creative: dalCreative,
    engineClass: dalEngineClass,
    entityTags: dalEntityTags,
    packages: dalPackages,
    applicationViewers: dalApplicationViewers,
    dalStorage: dalStorage,
    user: require('../../dal/user.js')(serviceContext),
    treeObject: require('../../dal/treeObject.js')(serviceContext),
    role: dalRole,
    processTemplate: dalProcessTemplate,
    v3Job: dalV3Job,
    customDashboard: dalCustomDashboard,
    dataset: dalDataset,
    mailbox: dalMailbox,
    staticAppConfig: dalStaticAppConfig,
    openidConnect: dalOpenIdConnect,
    organizationInvite: dalOrganizationInvite,
    organizationRegistration: dalOrganizationRegistration,
    platform: dalPlatform,
    alwaysUpFlow: dalAlwaysUpFlow,
    externalCredential: dalExternalCredential,
    emailTemplate: dalEmailTemplate,
    ingestSlug: dalIngestSlug,
    processingDeliverables: dalProcessingDeliverables
  });

  const bllAsset = require('../../bll/asset.js')(serviceContext);
  const bllDagTemplate = require('../../bll/dagTemplate.js')(serviceContext);
  const bllEngine = require('../../bll/engine.js')(serviceContext);
  const bllJob = require('../../bll/job.js')(serviceContext);
  const bllTask = require('../../bll/task.js')(serviceContext);
  const bllCluster = require('../../bll/cluster.js')(serviceContext);
  const bllMailbox = require('../../bll/mailbox.js')(serviceContext);
  const bllNotification = require('../../bll/notification.js')(serviceContext);
  const bllApplication = require('../../bll/application.js')(serviceContext);
  const bllOpenId = require('../../bll/openidConnect.js')(serviceContext);
  const bllOrganizationInvite = require('../../bll/organizationInvite.js')(
    serviceContext
  );
  const bllUser = require('../../bll/user.js')(serviceContext);
  const bllOrganizationRegistration = require('../../bll/organizationRegistration.js')(
    serviceContext
  );
  const bllPlatformProvider = require('../../bll/emailProvider.js')(
    serviceContext
  );
  // TODO for now jobBll will be empty.
  serviceContext.bll = {
    asset: bllAsset,
    coreJob: serviceContext.jobBll,
    dagTemplate: bllDagTemplate,
    engine: bllEngine,
    job: bllJob,
    task: bllTask,
    cluster: bllCluster,
    mailbox: bllMailbox,
    notification: bllNotification,
    application: bllApplication,
    openId: bllOpenId,
    organizationInvite: bllOrganizationInvite,
    organizationRegistration: bllOrganizationRegistration,
    user: bllUser,
    platformProvider: bllPlatformProvider
  };

  serviceContext.loaders = {
    task: require('../../loaders/task.js')(serviceContext),
    user: require('../../loaders/user.js')(serviceContext),
    dagTemplate: require('../../loaders/dagTemplate.js')(serviceContext),
    mediaConstraint: require('../../loaders/mediaConstraint.js')(serviceContext)
  };

  const typeDefs = [fs.readFileSync('./schema/schema.graphql', 'utf8')];

  const resolvers = {
    Query: require('../../resolvers/Query.js')(serviceContext),

    Mutation: require('../../resolvers/Mutation.js')(serviceContext),

    SubscriptionService: require('../../resolvers/SubscriptionService.js')(
      serviceContext
    ),

    CloneRequest: require('../../resolvers/CloneRequest.js')(serviceContext),
    
    CloneData: require('../../resolvers/CloneData.js')(serviceContext),

    Application: require('../../resolvers/Application.js')(serviceContext),

    ApplicationConfig: require('../../resolvers/ApplicationConfig.js')(
      serviceContext
    ),

    ApplicationConfigDefinition: require('../../resolvers/ApplicationConfigDefinition.js')(
      serviceContext
    ),

    ApplicationComponent: require('../../resolvers/ApplicationComponent.js')(
      serviceContext
    ),

    Asset: require('../../resolvers/Asset.js')(serviceContext),

    AssetSourceData: require('../../resolvers/AssetSourceData.js')(
      serviceContext
    ),

    TDOSourceData: require('../../resolvers/TDOSourceData.js')(serviceContext),

    TemporalDataObject: require('../../resolvers/TemporalDataObject.js')(
      serviceContext
    ),

    Engine: require('../../resolvers/Engine.js')(serviceContext),

    Package: require('../../resolvers/Package.js')(serviceContext),

    ApplicationViewer: require('../../resolvers/ApplicationViewer.js')(
      serviceContext
    ),

    PackageResource: require('../../resolvers/PackageResource.js')(
      serviceContext
    ),

    PackageGrant: require('../../resolvers/PackageGrant.js')(serviceContext),

    PlatformInfo: require('../../resolvers/PlatformInfo.js')(serviceContext),

    EngineResult: require('../../resolvers/EngineResult.js')(serviceContext),

    Build: require('../../resolvers/Build.js')(serviceContext),

    Job: require('../../resolvers/Job.js')(serviceContext),

    LibraryType: require('../../resolvers/LibraryType.js')(serviceContext),

    Organization: require('../../resolvers/Organization.js')(serviceContext),

    Collection: require('../../resolvers/Collection.js')(serviceContext),

    CollectionMention: require('../../resolvers/CollectionMention.js')(
      serviceContext
    ),

    SharedCollection: require('../../resolvers/SharedCollection.js')(
      serviceContext
    ),

    Share: require('../../resolvers/Share.js')(serviceContext),

    Widget: require('../../resolvers/Widget.js')(serviceContext),

    Folder: require('../../resolvers/Folder.js')(serviceContext),

    FolderSummaryDetail: require('../../resolvers/FolderSummaryDetail.js')(
      serviceContext
    ),

    Role: require('../../resolvers/Role.js')(serviceContext),

    Library: require('../../resolvers/Library.js')(serviceContext),

    LibrarySummary: require('../../resolvers/LibrarySummary.js')(
      serviceContext
    ),

    MentionComment: require('../../resolvers/MentionComment.js')(
      serviceContext
    ),

    MentionRating: require('../../resolvers/MentionRating.js')(serviceContext),

    LoginInfo: require('../../resolvers/LoginInfo.js')(serviceContext),

    LibraryEngineModel: require('../../resolvers/LibraryEngineModel.js')(
      serviceContext
    ),

    Entity: require('../../resolvers/Entity.js')(serviceContext),

    EntityIdentifier: require('../../resolvers/EntityIdentifier.js')(
      serviceContext
    ),

    StructuredData: require('../../resolvers/StructuredData.js')(
      serviceContext
    ),

    Schema: require('../../resolvers/Schema.js')(serviceContext),

    SchemaProperty: require('../../resolvers/SchemaProperty.js')(
      serviceContext
    ),

    DataRegistry: require('../../resolvers/DataRegistry.js')(serviceContext),

    Task: require('../../resolvers/Task.js')(serviceContext),

    TaskLog: require('../../resolvers/TaskLog.js')(serviceContext),

    User: require('../../resolvers/User.js')(serviceContext),

    UserACL: require('../../resolvers/UserACL.js')(serviceContext),

    EngineCategory: require('../../resolvers/EngineCategory.js')(
      serviceContext
    ),

    EngineDependency: require('../../resolvers/EngineDependency.js')(
      serviceContext
    ),

    SharedMention: require('../../resolvers/SharedMention.js')(serviceContext),

    Mention: require('../../resolvers/Mention.js')(serviceContext),

    Watchlist: require('../../resolvers/Watchlist.js')(serviceContext),

    CognitiveSearchProfile: require('../../resolvers/CognitiveSearchProfile.js')(
      serviceContext
    ),

    CognitiveSearch: require('../../resolvers/CognitiveSearch.js')(
      serviceContext
    ),

    Subscription: require('../../resolvers/Subscription.js')(serviceContext),

    Trigger: require('../../resolvers/Trigger.js')(serviceContext),

    EntityIdentifierType: require('../../resolvers/EntityIdentifierType.js')(
      serviceContext
    ),

    SavedSearch: require('../../resolvers/SavedSearch.js')(serviceContext),

    FolderContentTemplate: require('../../resolvers/FolderContentTemplate.js')(
      serviceContext
    ),

    ExportRequest: require('../../resolvers/ExportRequest.js')(serviceContext),

    GraphQLServiceInfo: require('../../resolvers/GraphQLServiceInfo.js')(
      serviceContext
    ),

    EngineOverview: require('../../resolvers/EngineOverview.js')(
      serviceContext
    ),

    AuditEvent: require('../../resolvers/AuditEvent.js')(serviceContext),

    Metadata: {
      __resolveType(obj, context, info) {
        return obj.__typename;
      }
    },

    CustomDashboard: require('../../resolvers/CustomDashboard.js')(
      serviceContext
    ),

    NotificationMailbox: require('../../resolvers/NotificationMailbox.js')(
      serviceContext
    ),

    AssetScrollList: require('../../resolvers/AssetScrollList.js')(
      serviceContext
    ),

    OpenIdProvider: require('../../resolvers/OpenIdProvider.js')(
      serviceContext
    ),

    OrganizationInvite: require('../../resolvers/OrganizationInvite.js')(
      serviceContext
    ),

    OrganizationInfo: require('../../resolvers/OrganizationInfo.js')(
      serviceContext
    ),

    RegistrationConfiguration: require('../../resolvers/RegistrationConfiguration.js')(
      serviceContext
    ),

    RegistrationConfigurationInfo: require('../../resolvers/RegistrationConfigurationInfo.js')(
      serviceContext
    ),

    BasicUserInfo: require('../../resolvers/BasicUserInfo.js')(serviceContext),

    IngestSlug: require('../../resolvers/IngestSlug.js')(serviceContext),
    
    ProcessingProject: require('../../resolvers/ProcessingProject.js')(
      serviceContext
    ),

    ProcessingDeliverable: require('../../resolvers/ProcessingDeliverables.js')(
      serviceContext
    )
  };

  return {
    resolvers,
    typeDefs
  };
};
