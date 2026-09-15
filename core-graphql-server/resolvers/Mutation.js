const fs = require('fs');
const _lodash = require('lodash');
const moment = require('moment');
const {
  validateCreateJobInput
} = require('@veritone/core-server-base/shared-input-validators.js');

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger,
    config = serviceContext.config,
    dalEngine = serviceContext.dal.engine,
    dalLibrary = serviceContext.dal.library,
    dalCollection = serviceContext.dal.collection,
    dalSavedSearch = serviceContext.dal.savedSearch,
    dalTDO = serviceContext.dal.tdo,
    dalAsset = serviceContext.dal.asset,
    dalAdmin = serviceContext.dal.admin,
    dalStructuredData = serviceContext.dal.structuredData,
    dalFolder = serviceContext.dal.folder,
    dalFolderV2 = serviceContext.dal.folderV2,
    dalMention = serviceContext.dal.mention,
    dalShare = serviceContext.dal.share,
    dalWatchlist = serviceContext.dal.watchlist,
    dalOrganization = serviceContext.dal.organization,
    dalTrigger = serviceContext.dal.trigger,
    dalNotification = serviceContext.dal.notification,
    dalCreative = serviceContext.dal.creative,
    dalApplication = serviceContext.dal.application,
    dalDataset = serviceContext.dal.dataset,
    dalPackage = serviceContext.dal.packages,
    dalPlatform = serviceContext.dal.platform,
    bllApplication = serviceContext.bll.application,
    dalApplicationViewer = serviceContext.dal.applicationViewers,
    dalEmailTemplate = serviceContext.dal.emailTemplate,
    dalProcessingDeliverables = serviceContext.dal.processingDeliverables,
    dalSource = serviceContext.dal.source;

  const util = require('./util.js')(serviceContext);
  const validator = require('../validator/')(serviceContext);
  const errors = require('../error')(config);
  const enableAppEventFeature = _lodash.get(
    serviceContext,
    'config.featureFlags.enableAppEventFeature',
    false
  );

  const emitAuditEventNoThrow = async (context, args) => {
    try {
      await serviceContext.dal.event.emitAuditEvent(context, args);
    } catch (err) {
      logger.error('Error when emitting audit event.', err);
    }
  };

  const mutationMap = {
    createTDO(_, args, context) {
      return dalTDO.createTDO(context, args);
    },
    createTDOWithAsset(_, args, context) {
      const input = args.input;
      //now we can create the asset
      let file = context.file;
      if (file) {
        input.file = {
          fileName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          encoding: file.encoding,
          inputStream: fs.createReadStream(file.path)
        };
      }
      return dalTDO.createTDOWithAsset(context, args);
    },
    updateTDO(_, args, context) {
      return dalTDO.updateTDO(context, args);
    },
    deleteTDO(_, args, context) {
      return dalTDO.deleteTDO(context, args);
    },
    cleanupTDO(_, args, context) {
      return dalTDO.cleanupTDO(context, args);
    },
    addMediaSegment(_, args, context) {
      return dalTDO.addMediaSegment(context, args);
    },
    addMediaSegments(_, args, context) {
      return dalTDO.addMediaSegmentsBulk(context, args);
    },
    createAsset(_, args, context) {
      // input needs to be a multipart form post with
      // 'query' and 'file' params
      // get the request, which has the files
      const input = args.input;
      //now we can create the asset
      let file = context.file;
      if (file) {
        input.file = {
          fileName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          encoding: file.encoding,
          inputStream: fs.createReadStream(file.path)
        };
      }
      return dalAsset.createAsset(args, context);
    },

    createTaskLog(_, args, context) {
      // input needs to be a multipart form post with
      // 'query' and 'file' params
      // get the request, which has the files
      const input = args.input;
      //now we can create the asset
      let file = context.file;
      if (file) {
        input.file = {
          fileName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          encoding: file.encoding,
          inputStream: fs.createReadStream(file.path)
        };
      }
      return dalEngine.createTaskLog(args, context);
    },

    updateAsset(_, args, context) {
      return dalAsset.updateAsset(context, args);
    },

    deleteAsset(_, args, context) {
      return dalAsset.deleteAsset(context, args);
    },

    validateEngineOutput(root, args, context) {
      return validator.validateEngineOutput(args.input);
    },

    createEngine(_, args, context) {
      return dalEngine.createEngine(args, context);
    },

    createAutomateFlow(_, args, context) {
      return dalEngine.createAutomateFlow(args, context);
    },

    updateEngine(_, args, context) {
      return dalEngine.updateEngine(args, context);
    },

    deleteEngine(_, args, context) {
      return dalEngine.deleteEngine(args, context);
    },

    createEngineBuild(_, args, context) {
      return dalEngine.createEngineBuild(args, context);
    },

    deleteEngineBuild(_, args, context) {
      return dalEngine.deleteEngineBuild(args, context);
    },

    updateEngineBuild(_, args, context) {
      return dalEngine.updateEngineBuild(args, context);
    },

    requestClone(_, args, context) {
      return dalTDO.requestClone(context, args).then((result) => result.clone);
    },

    refreshClone(_, args, context) {
      return dalTDO.refreshClone(context, args);
    },

    cloneRequestCancel(_, args, context) {
      return dalTDO.cancelClone(context, args);
    },

    updateTask(_, args, context) {
      return serviceContext.dal.task.updateTask(context, args);
    },
    appendWarningToTask(_, args, context) {
      return serviceContext.dal.task.appendWarningToTask(context, args);
    },
    addTasksToJobs(_, args, context) {
      return serviceContext.dal.task.addTasksToJobs(context, args);
    },

    async createJob(_, args, context) {
      let { input: job } = args;
      const organizationId = job.organizationId || args.organizationId;

      validateCreateJobInput(job, errors.InvalidInput);

      // preProcessJob
      // Ingore preprocess job if create job by dagTemplate
      if (!job.dagTemplateId) {
        job = await serviceContext.bll.job.preprocessJob(context, {
          job,
          organizationId
        });
      }

      if (job.routes || job.dagTemplateId) {
        // we are getting a v3 job
        args.input = job;
        return serviceContext.dal.v3Job.createJob(context, args);
      }
      return serviceContext.dal.job.createJob(context, args);
    },

    cancelJob(_, args, context) {
      return dalEngine.cancelJob(args.id, context);
    },
    retryJob(_, args, context) {
      return dalEngine.retryJob(args, context);
    },

    launchSingleEngineJob(_, args, context) {
      return serviceContext.dal.v3Job.launchSingleEngineJob(args, context);
    },
    launchDAGTemplate(_, args, context) {
      return serviceContext.dal.v3Job.launchDAGTemplate(context, args);
    },

    updateJobs(_, args, context) {
      return dalEngine.updateJobs(args, context);
    },
    createApplication(_, args, context) {
      return dalApplication.createApplication(args, context);
    },
    deleteApplication(_, args, context) {
      return dalApplication.deleteApplication(args, context);
    },
    updateApplication(_, args, context) {
      return dalApplication.updateApplication(args, context);
    },
    applicationConfigSet(_, args, context) {
      return dalApplication.applicationConfigSet(args, context);
    },
    applicationConfigDefinitionCreate(_, args, context) {
      return dalApplication.applicationConfigDefinitionTx(args, context, false);
    },
    applicationConfigDefinitionUpdate(_, args, context) {
      return dalApplication.applicationConfigDefinitionTx(args, context, true);
    },
    applicationConfigDefinitionDelete(_, args, context) {
      return dalApplication.applicationConfigDelete(
        args,
        'app_config_definition',
        context
      );
    },
    applicationConfigDelete(_, args, context) {
      return dalApplication.applicationConfigDelete(
        args,
        'app_config',
        context
      );
    },
    applicationAddToOrg(_, args, context) {
      return bllApplication.applicationAddToOrg(args, context);
    },
    applicationRemoveFromOrg(_, args, context) {
      return dalApplication.applicationRemoveFromOrg(args, context);
    },
    updateApplicationComponent(_, args, context) {
      return dalApplication.updateApplicationComponent(args, context);
    },
    createApplicationHeaderbar(_, args, context) {
      return dalApplication.createApplicationHeaderbar(args, context);
    },
    updateApplicationHeaderbar(_, args, context) {
      return dalApplication.updateApplicationHeaderbar(args, context);
    },
    updateApplicationBillingPlanId(_, args, context) {
      return dalApplication.updateApplicationBillingPlanId(args, context);
    },
    updateApplicationBillingDirty(_, args, context) {
      return dalApplication.updateApplicationBillingDirty(args, context);
    },
    createContextMenuExtension(_, args, context) {
      return dalApplication.createContextMenuExtension(args, context);
    },
    updateContextMenuExtension(_, args, context) {
      return dalApplication.updateContextMenuExtension(args, context);
    },
    deleteContextMenuExtension(_, args, context) {
      return dalApplication.deleteContextMenuExtension(args, context);
    },
    bulkDeleteContextMenuExtensions(_, args, context) {
      return dalApplication.bulkDeleteContextMenuExtensions(args, context);
    },

    fileApplication(_, args, context) {
      return dalApplication.fileApplication(args, context);
    },
    unfileApplication(_, args, context) {
      return dalApplication.unfileApplication(args, context);
    },

    createEntityIdentifierType(_, args, context) {
      return dalLibrary.createEntityIdentifierType(args);
    },
    createLibraryType(_, args, context) {
      return dalLibrary.createLibraryType(args);
    },
    createLibrary(_, args, context) {
      return dalLibrary.createLibrary(args);
    },
    deleteLibrary(_, args, context) {
      return dalLibrary.deleteLibrary(args);
    },
    updateLibrary(_, args, context) {
      return dalLibrary.updateLibrary(args);
    },
    publishLibrary(_, args, context) {
      return dalLibrary.publishLibrary(args, context);
    },
    createEntity(_, args, context) {
      return dalLibrary.createEntity(args);
    },
    updateEntity(_, args, context) {
      return dalLibrary.updateEntity(args);
    },
    deleteEntity(_, args, context) {
      return dalLibrary.deleteEntity(args);
    },
    createEntityIdentifier(_, args, context) {
      const input = args.input;
      let file = context.file;

      if (file) {
        input.file = {
          fileName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          encoding: file.encoding,
          inputStream: fs.createReadStream(file.path)
        };
      }

      return dalLibrary.createEntityIdentifier(args);
    },
    updateEntityIdentifier(_, args, context) {
      return dalLibrary.updateEntityIdentifier(args);
    },
    deleteEntityIdentifier(_, args, context) {
      return dalLibrary.deleteEntityIdentifier(args);
    },
    createLibraryEngineModel(_, args, context) {
      return dalLibrary.createLibraryEngineModel(context, args);
    },
    updateLibraryEngineModel(_, args, context) {
      const file = context.file;
      const input = args.input;
      if (file) {
        input.file = {
          fileName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          encoding: file.encoding,
          inputStream: fs.createReadStream(file.path)
        };
      }
      return dalLibrary.updateLibraryEngineModel(context, args);
    },
    deleteLibraryEngineModel(_, args, context) {
      return dalLibrary.deleteLibraryEngineModel(args);
    },
    createLibraryCollaborator(_, args, context) {
      return dalLibrary.createLibraryCollaborator(context, args);
    },
    updateLibraryCollaborator(_, args, context) {
      return dalLibrary.updateLibraryCollaborator(context, args);
    },
    deleteLibraryCollaborator(_, args, context) {
      return dalLibrary.deleteLibraryCollaborator(args);
    },
    addLibraryDataset(_, args) {
      return dalLibrary.addDataset(args);
    },
    deleteLibraryDataset(_, args) {
      return dalLibrary.deleteDataset(args);
    },
    createLibraryConfiguration(_, args) {
      return dalLibrary.createDatasetConfiguration(args);
    },
    updateLibraryConfiguration(_, args) {
      return dalLibrary.updateDatasetConfiguration(args);
    },
    deleteLibraryConfiguration(_, args) {
      return dalLibrary.deleteLibraryConfiguration(args);
    },
    engineWorkflow(_, args, context) {
      return dalEngine.engineWorkflow(args, context);
    },
    applicationWorkflow(_, args, context) {
      return dalApplication.applicationWorkflow(args, context);
    },
    createWidget(_, args, context) {
      return dalCollection.createWidget(args, context);
    },
    updateWidget(_, args, context) {
      return dalCollection.updateWidget(args, context);
    },
    updateOrganization(_, args, context) {
      return dalAdmin.updateOrganization(args, context);
    },
    updateOrganizationBilling(_, args, context) {
      return dalOrganization.updateOrganizationBilling(args, context);
    },

    createUser(_, args, context) {
      return dalAdmin.createUser(args, context);
    },

    updateUser(_, args, context) {
      if (_lodash.get(args, 'input.organizationId') === '-1') {
        args.input = _lodash.omit(args.input, 'organizationId');
      }
      return dalAdmin.updateUser(args, context);
    },

    updateUserRoles(_, args, context) {
      if (_lodash.get(args, 'input.organizationId') === '-1') {
        args.input = _lodash.omit(args.input, 'organizationId');
      }
      return dalAdmin.updateUserRoles(args, context);
    },

    async addUserToOrganization(_, args, context) {
      const auditPayLoad = {
        eventType: 'auth_add_user_to_organization',
        userId: args.userId,
        userName: args.userName,
        organizationGuid: args.organizationGuid,
        timestamp: moment().toISOString()
      };

      let result;
      try {
        // for addAdminToOrganization step when creating organization via user token or org token
        // we should require authInfo instead of userToken
        util.requireAuthInfo(context);
        result = await dalAdmin.addUserToOrganization(args, context);
        auditPayLoad.success = true;
        emitAuditEventNoThrow(context, {
          input: { payload: auditPayLoad }
        });
        return result;
      } catch (err) {
        auditPayLoad.success = false;
        auditPayLoad.error = { message: err.message };
        emitAuditEventNoThrow(context, {
          input: { auditPayLoad }
        });
        throw err;
      }
    },

    async removeUserFromOrganization(_, args, context) {
      let result;
      const auditPayLoad = {
        eventType: 'auth_remove_user_from_organization',
        userId: args.userId,
        userName: args.userName,
        organizationGuid: args.organizationGuid,
        timestamp: moment().toISOString()
      };
      try {
        util.requireUserToken(context);
        result = await dalAdmin.removeUserFromOrganization(args, context);
        auditPayLoad.success = true;
        emitAuditEventNoThrow(context, {
          input: { payload: auditPayLoad }
        });
        return result;
      } catch (err) {
        auditPayLoad.success = false;
        auditPayLoad.error = { message: err.message };
        emitAuditEventNoThrow(context, {
          input: { payload: auditPayLoad }
        });
        throw err;
      }
    },

    async switchUserToOrganization(_, args, context) {
      const auditPayLoad = {
        eventType: 'auth_switch_user_to_organization',
        userName: args.userName,
        token: args.token,
        organizationGuid: args.organizationGuid,
        timestamp: moment().toISOString()
      };

      let result;
      try {
        // only allow userToken and apiToken
        util.requireTokenType(context, ['user', 'apikey']);
        result = await dalAdmin.switchUserToOrganization(args, context);
        auditPayLoad.success = true;
        emitAuditEventNoThrow(context, {
          input: { payload: auditPayLoad }
        });
        util.setCookie(result, context);
        return result;
      } catch (err) {
        auditPayLoad.success = false;
        auditPayLoad.error = { message: err.message };
        emitAuditEventNoThrow(context, {
          input: { auditPayLoad }
        });
        throw err;
      }
    },

    createPasswordUpdateRequest(_, args, context) {
      util.requireUserToken(context);
      return dalAdmin.createPasswordUpdateRequest(args, context);
    },

    createPasswordResetRequest(_, args, context) {
      return dalAdmin.createPasswordResetRequest(args, context);
    },

    updateCurrentUser(_, args, context) {
      util.requireUserToken(context);
      args.userId = util.getClientInfo(context).id;
      return dalAdmin.updateCurrentUser(args, context);
    },

    changePassword(_, args, context) {
      return dalAdmin.changePassword(context, args);
    },

    async userLogin(_, { input }, context) {
      const result = await dalAdmin.login(context, input);
      util.setCookie(
        result,
        context,
        _lodash.pick(input, ['allowVanityDomain'])
      );
      return result;
    },

    async userLogout(_, { token, sessionExpired }, context) {
      util.requireUserToken(context);
      await dalAdmin.logout(context, token, sessionExpired);
      return true;
    },

    refreshToken(_, { token }, context) {
      util.requireUserToken(context);
      return dalAdmin.refreshToken(context, token);
    },

    extendToken(_, { token }, context) {
      util.requireUserToken(context);
      return dalAdmin.extendToken(context, token);
    },

    validateToken(_, { token }, context) {
      return dalAdmin.validateToken(context, token);
    },

    getCurrentUserPasswordToken(_, args, context) {
      args.input.userName = util.getClientInfo(context).userName;
      return dalAdmin.getPasswordToken(context, args.input).then((result) => {
        return {
          passwordToken: result.token
        };
      });
    },

    deleteUser(_, args, context) {
      return dalAdmin.deleteUser(args, context);
    },

    createDataRegistry(_, args, context) {
      return dalStructuredData.createSchemaMetadata(context, args);
    },
    updateDataRegistry(_, args, context) {
      return dalStructuredData.updateSchemaMetadata(context, args);
    },
    createSchema(_, args, context) {
      return dalStructuredData.createSchema(context, args);
    },
    upsertSchemaDraft(_, args, context) {
      return dalStructuredData.upsertSchemaDraft(context, args);
    },
    updateSchemaState(_, args, context) {
      return dalStructuredData.updateSchemaState(context, args);
    },

    createStructuredData(_, args, context, _info) {
      // Check if addACEs is requested in the selection set
      const selections = _lodash.get(
        _info,
        'operation.selectionSet.selections[0].selectionSet.selections',
        []
      );
      const addACEsField = _lodash.find(
        selections,
        (selection) =>
          selection.kind === 'Field' &&
          _lodash.get(selection, 'name.value', '') === 'addACEs'
      );

      const enhancedArgs = {
        ...args,
        ignoreDefaultSDORole: !!addACEsField
      };
      return dalStructuredData.createStructuredData(enhancedArgs, context);
    },

    updateStructuredData(_, args, context) {
      return dalStructuredData.updateStructuredData(args, context);
    },

    deleteStructuredData(_, args, context) {
      return dalStructuredData.deleteStructuredData(args, context);
    },

    createCollection(_, args, context) {
      return dalCollection.createCollection(context, args);
    },

    updateCollection(_, args, context) {
      return dalCollection.updateCollection(context, args);
    },

    deleteCollection(_, args, context) {
      return dalCollection.deleteCollection(context, args);
    },

    shareCollection(_, args, context) {
      return dalShare.shareCollection(context, args);
    },

    updateSharedCollectionMentions(_, args, context) {
      return dalShare.updateSharedCollectionMentions(context, args);
    },

    updateSharedCollectionHistory(_, args, context) {
      return dalShare.updateSharedCollectionHistory(context, args);
    },

    shareMentionFromCollection(_, args, context) {
      if (args.input) args.input.app = 'collection-app';
      return dalShare.shareMention(context, args);
    },

    shareMention(_, args, context) {
      return dalShare.shareMention(context, args);
    },

    shareMentionInBulk(_, args, context) {
      return dalShare.shareMentionInBulk(context, args);
    },

    createMentionComment(_, args, context) {
      return dalCollection.createMentionComment(context, args);
    },

    updateMentionComment(_, args, context) {
      util.requireUserToken(context);
      return dalCollection.updateMentionComment(context, args);
    },

    deleteMentionComment(_, args, context) {
      util.requireUserToken(context);
      return dalCollection.deleteMentionComment(context, args);
    },

    createMentionRating(_, args, context) {
      util.requireUserToken(context);
      return dalCollection.createMentionRating(context, args);
    },

    updateMentionRating(_, args, context) {
      util.requireUserToken(context);
      return dalCollection.updateMentionRating(context, args);
    },

    deleteMentionRating(_, args, context) {
      util.requireUserToken(context);
      return dalCollection.deleteMentionRating(context, args);
    },

    addPlatformVersion(_, args, context) {
      return dalPlatform.addPlatformVersion(context, args);
    },
    setCurrentPlatformVersion(_, args, context) {
      return dalPlatform.setCurrentPlatformVersion(context, args);
    },
    setPlatformProperties(_, args, context) {
      return dalPlatform.setPlatformProperties(context, args);
    },

    createFolder(_, args, context) {
      return dalFolder.createFolder(context, args);
    },
    updateFolder(_, args, context) {
      return dalFolder.updateFolder(context, args);
    },
    deleteFolder(_, args, context) {
      return dalFolder.deleteFolder(context, args);
    },
    moveFolder(_, args, context) {
      return dalFolder.moveFolder(context, args);
    },
    moveFolders(_, args, context) {
      return dalFolderV2.moveFolders(context, args);
    },
    createCollectionMention(_, args, context) {
      return dalCollection.createCollectionMention(context, args);
    },
    updateCollectionMention(_, args, context) {
      return dalCollection.updateCollectionMention(context, args);
    },
    createCollectionMentions(_, args, context) {
      return dalCollection.createCollectionMentions(context, args);
    },
    deleteCollectionMention(_, args, context) {
      return dalCollection.deleteCollectionMention(context, args);
    },
    createMention(_, args, context) {
      return dalMention.createMention(context, args);
    },
    updateMention(_, args, context) {
      return dalMention.updateMention(context, args);
    },
    updateMentions(_, args, context) {
      return dalMention.updateMentions(context, args);
    },
    createRootFolders(_, args, context) {
      return dalFolder.getOrCreateRootFolders(context, args);
    },
    bulkUpdateWatchlist(_, args, context) {
      return dalWatchlist.bulkUpdateWatchlist(context, args);
    },
    fileTemporalDataObject(_, args, context) {
      return dalFolder.fileTDO(context, args);
    },
    unfileTemporalDataObject(_, args, context) {
      return dalFolder.unfileTDO(context, args);
    },
    moveTemporalDataObject(_, args, context) {
      return dalFolder.moveTDO(context, args);
    },
    uploadEngineResult(_, args, context) {
      // input needs to be a multipart form post with
      // 'query' and 'file' params
      // get the request, which has the files
      const input = args.input;
      //now we can create the asset
      let file = context.file;
      if (file) {
        input.file = {
          fileName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          encoding: file.encoding,
          inputStream: fs.createReadStream(file.path)
        };
      }
      return dalAsset.uploadEngineResult(context, args);
    },
    createWatchlist(_, args, context) {
      return dalWatchlist.createWatchlist(args, context);
    },
    bulkCreateWatchlist(_, args, context) {
      return dalWatchlist.bulkCreateWatchlists(args, context);
    },
    deleteWatchlist(_, args, context) {
      return dalWatchlist.deleteWatchlist(args, context);
    },
    updateWatchlist(_, args, context) {
      return dalWatchlist.updateWatchlist(args, context);
    },
    fileWatchlist(_, args, context) {
      return dalWatchlist.fileWatchlist(args, context);
    },
    unfileWatchlist(_, args, context) {
      return dalWatchlist.unfileWatchlist(args, context);
    },
    shareFolder(_, args, context) {
      return dalFolder.shareFolder(context, args);
    },
    createSubscription(_, args, context) {
      return dalWatchlist.createSubscription(context, args);
    },
    deleteSubscription(_, args, context) {
      return dalWatchlist.deleteSubscription(context, args);
    },
    createCognitiveSearch(_, args, context) {
      return dalWatchlist.createCognitiveSearch(context, args);
    },
    updateCognitiveSearch(_, args, context) {
      return dalWatchlist.updateCognitiveSearch(context, args);
    },
    deleteCognitiveSearch(_, args, context) {
      return dalWatchlist.deleteCognitiveSearch(args);
    },
    addToEngineBlacklist(_, args, context) {
      return dalOrganization.addToEngineBlacklist(context, args);
    },
    addToEngineWhitelist(_, args, context) {
      return dalOrganization.addToEngineWhitelist(context, args);
    },
    deleteFromEngineBlacklist(_, args, context) {
      return dalOrganization.deleteFromEngineBlacklist(context, args);
    },
    deleteFromEngineWhitelist(_, args, context) {
      return dalOrganization.deleteFromEngineWhitelist(context, args);
    },
    createTriggers(_, args, context) {
      return dalTrigger.createTriggers(context, args);
    },
    deleteTrigger(_, args, context) {
      return dalTrigger.deleteTrigger(context, args);
    },
    getEngineJWT(_, args, context) {
      return dalEngine.getEngineJWTToken(context, args);
    },
    createSavedSearch(_, args, context) {
      return dalSavedSearch.createSavedSearch(args, context);
    },
    deleteSavedSearch(_, args, context) {
      return dalSavedSearch.deleteSavedSearch(args, context);
    },
    replaceSavedSearch(_, args, context) {
      return dalSavedSearch.replaceSavedSearch(args, context);
    },
    sendEmail(_, args, context) {
      return dalNotification.sendEmail(context, args);
    },
    verifyJWT(root, args, context) {
      return dalEngine.verifyJWT(args);
    },
    createFolderContentTempate(_, args, context) {
      return dalFolder.createFolderContentTemplate(context, args);
    },
    updateFolderContentTempate(_, args, context) {
      return dalFolder.updateFolderContentTemplate(context, args);
    },
    deleteFolderContentTempate(_, args, context) {
      return dalFolder.deleteFolderContentTemplate(context, args);
    },
    createFolderContentTemplate(_, args, context) {
      return dalFolder.createFolderContentTemplate(context, args);
    },
    updateFolderContentTemplate(_, args, context) {
      return dalFolder.updateFolderContentTemplate(context, args);
    },
    deleteFolderContentTemplate(_, args, context) {
      return dalFolder.deleteFolderContentTemplate(context, args);
    },
    createExportRequest(_, args, context) {
      return serviceContext.dal.exportRequest.createExportRequest(
        context,
        args
      );
    },
    updateExportRequest(_, args, context) {
      return serviceContext.dal.exportRequest.updateExportRequest(
        context,
        args
      );
    },
    createMentions(_, args, context) {
      return dalMention.createMentions(context, args);
    },
    createEvent(_, args, context) {
      return serviceContext.dal.event.createEvent(context, args);
    },
    updateEvent(_, args, context) {
      return serviceContext.dal.event.updateEvent(context, args);
    },
    subscribeEvent(_, args, context) {
      return serviceContext.dal.event.subscribeEvent(context, args);
    },
    unsubscribeEvent(_, args, context) {
      return serviceContext.dal.event.unsubscribeEvent(context, args);
    },
    emitEvent(_, args, context) {
      return serviceContext.dal.event.emitEvent(context, args);
    },
    createEventActionTemplate(_, args, context) {
      return serviceContext.dal.event.createEventActionTemplate(context, args);
    },
    updateEventActionTemplate(_, args, context) {
      return serviceContext.dal.event.updateEventActionTemplate(context, args);
    },
    createEventCustomRule(_, args, context) {
      return serviceContext.dal.eventCustomRule.createEventCustomRule(
        context,
        args
      );
    },
    updateEventCustomRule(_, args, context) {
      return serviceContext.dal.eventCustomRule.updateEventCustomRule(
        context,
        args
      );
    },
    deleteEventCustomRule(_, args, context) {
      return serviceContext.dal.eventCustomRule.deleteEventCustomRule(
        context,
        args
      );
    },
    createOrganization(_, args, context) {
      return dalAdmin.createOrganization(context, args);
    },
    createProcessTemplate(_, args, context) {
      return serviceContext.dal.processTemplate.createProcessTemplate(
        args,
        context
      );
    },
    updateProcessTemplate(_, args) {
      return serviceContext.dal.processTemplate.updateProcessTemplate(args);
    },
    createMediaShare(_, args, context) {
      return dalShare.createMediaShare(context, args);
    },
    createMentionExportRequest(_, args, context) {
      return serviceContext.dal.exportRequest.createMentionExportRequest(
        args,
        context
      );
    },
    updateMentionExportRequest(_, args, context) {
      args.input.event = 'mentionExportRequest';
      return serviceContext.dal.exportRequest.updateExportRequest(
        context,
        args
      );
    },
    deleteProcessTemplate(_, args, context) {
      return serviceContext.dal.processTemplate.deleteProcessTemplate(
        args,
        context
      );
    },
    createCreative(_, args) {
      return dalCreative.createCreative(args);
    },
    updateCreative(_, args) {
      return dalCreative.updateCreative(args);
    },
    deleteCreative(_, args) {
      return dalCreative.deleteCreative(args);
    },
    emitSystemEvent(_, args, context) {
      return serviceContext.dal.event.emitSystemEvent(context, args);
    },
    setOrganizationIntegrationConfig(_, args, context) {
      return serviceContext.dal.organization.setOrganizationIntegrationConfig(
        context,
        args
      );
    },
    deleteOrganizationIntegrationConfig(_, args, context) {
      return serviceContext.dal.organization.deleteOrganizationIntegrationConfig(
        context,
        args
      );
    },
    createInstanceLoginConfiguration(_, args, context) {
      return serviceContext.dal.platform.createInstanceLoginConfiguration(
        context,
        args.input
      );
    },
    updateInstanceLoginConfiguration(_, args, context) {
      return serviceContext.dal.platform.updateInstanceLoginConfiguration(
        context,
        args.input,
        args.querySlug
      );
    },
    deleteLoginConfiguration(_, args, context) {
      const { organizationId: orgId } = args;
      const organizationId = _lodash.isString(orgId)
        ? orgId
        : _lodash.toString(orgId);
      return serviceContext.dal.organization.deleteLoginConfiguration(context, {
        ...args,
        organizationId
      });
    },
    deleteInstanceLoginConfiguration(_, args, context) {
      return serviceContext.dal.platform.deleteInstanceLoginConfiguration(
        context,
        args
      );
    },
    createRegistrationConfiguration(_, args, context) {
      return serviceContext.bll.organizationRegistration.createRegistrationConfiguration(
        context,
        args
      );
    },
    updateRegistrationConfiguration(_, args, context) {
      return serviceContext.bll.organizationRegistration.updateRegistrationConfiguration(
        context,
        args
      );
    },
    deleteRegistrationConfiguration(_, args, context) {
      return serviceContext.bll.organizationRegistration.deleteRegistrationConfiguration(
        context,
        args
      );
    },
    updateUserStatus(_, args, context) {
      return dalAdmin.updateUserStatus(args, context);
    },
    emitAuditEvent(_, args, context) {
      return serviceContext.dal.event.emitAuditEvent(context, args);
    },
    createCustomDashboard(_, args, context) {
      return serviceContext.dal.customDashboard.createCustomDashboard(
        context,
        args
      );
    },
    updateCustomDashboard(_, args, context) {
      return serviceContext.dal.customDashboard.updateCustomDashboard(
        context,
        args
      );
    },
    deleteCustomDashboard(_, args, context) {
      return serviceContext.dal.customDashboard.deleteCustomDashboard(
        context,
        args
      );
    },
    createDataset(_, args, context) {
      return dalDataset.createDataset(context, args);
    },
    updateDataset(_, args, context) {
      return dalDataset.updateDataset(context, args);
    },
    deleteDataset(_, args, context) {
      return dalDataset.deleteDataset(context, args);
    },
    datasetDataOperation(_, args, context) {
      return dalDataset.datasetOperation(context, args);
    },
    createDatasetSchema(_, args, context) {
      return dalDataset.createDatasetSchema(context, args);
    },
    addTaskReplacementEngine(_, args, context) {
      return serviceContext.bll.engine.replaceEngine(context, args);
    },
    removeTaskReplacementEngine(_, args, context) {
      return serviceContext.bll.engine.removeReplacementEngineId(context, args);
    },
    notificationMailboxCreate(_, args, context) {
      return serviceContext.bll.mailbox.notificationMailboxCreate(
        context,
        args
      );
    },
    notificationMailboxPause(_, args, context) {
      return serviceContext.bll.mailbox.notificationMailboxPauseUnpause(
        context,
        _lodash.assign({}, args, { isPaused: true })
      );
    },
    notificationMailboxDelete(_, args, context) {
      return serviceContext.bll.mailbox.notificationMailboxDelete(
        context,
        args
      );
    },
    notificationPost(_, args, context) {
      return serviceContext.bll.notification.post(context, args);
    },
    addNotificationTemplate(_, args, context) {
      return serviceContext.bll.notification.addTemplate(context, args);
    },
    removeNotificationTemplate(_, args, context) {
      return serviceContext.dal.notification.deleteNotificationTemplate(
        context,
        args
      );
    },
    addNotificationAction(_, args, context) {
      return serviceContext.bll.notification.addAction(context, args);
    },
    removeNotificationAction(_, args, context) {
      return serviceContext.dal.notification.deleteNotificationAction(
        context,
        args
      );
    },
    setNotificationFlag(_, args, context) {
      return serviceContext.bll.notification.setNotificationFlags(
        context,
        args
      );
    },
    notificationMailboxUnpause(_, args, context) {
      return serviceContext.bll.mailbox.notificationMailboxPauseUnpause(
        context,
        _lodash.assign({}, args, { isPaused: false })
      );
    },
    markAllNotificationsRead(_, args, context) {
      return serviceContext.bll.notification.setAllNotificationFlags(
        context,
        args.mailboxIds,
        ['read'],
        ['unread']
      );
    },
    markAllNotificationsSeen(_, args, context) {
      return serviceContext.bll.notification.setAllNotificationFlags(
        context,
        args.mailboxIds,
        ['seen'],
        ['unseen']
      );
    },
    createUserSettingDefinition(_, args, context) {
      return serviceContext.dal.application.createApplicationOrganizationSetting(
        context,
        args
      );
    },
    deleteUserSettingDefinition(_, args, context) {
      return serviceContext.dal.application.deleteApplicationOrganizationSetting(
        context,
        args
      );
    },
    updateUserSetting(_, args, context) {
      const reset = _lodash.get(args, 'input.reset', false);
      if (reset) {
        return serviceContext.dal.admin.removeUserSettings(context, args);
      } else {
        return serviceContext.dal.admin.setUserSetting(context, args);
      }
    },
    createOpenIdProvider(_, args, context) {
      return dalAdmin.createOpenIdProvider(context, args);
    },
    updateOpenIdProvider(_, args, context) {
      return serviceContext.bll.openId.updateOpenidConnect(context, args);
    },
    enableOpenIdProviderForOrg(_, args, context) {
      return dalAdmin.toggleOpenIdProviderForOrg(
        context,
        _lodash.assign(args, { toggle: 'enable' })
      );
    },
    disableOpenIdProviderForOrg(_, args, context) {
      return dalAdmin.toggleOpenIdProviderForOrg(
        context,
        _lodash.assign(args, { toggle: 'disable' })
      );
    },
    deleteOpenIdProvider(_, args, context) {
      return dalAdmin.deleteOpenIdProvider(context, args);
    },
    getApplicationJWT(_, args, context) {
      return serviceContext.bll.application.getApplicationJWTToken(
        context,
        args
      );
    },
    removeApplicationEventEndpoint(_, args, context) {
      if (!enableAppEventFeature) {
        throw new errors.NotImplemented({
          message:
            'The requested mutation is not available on this server. ' +
            'The cause is a feature flag has been disabled or this feature is not ready for this environment.'
        });
      }

      return serviceContext.bll.application.removeApplicationEventEndpoint(
        context,
        args
      );
    },
    updateApplicationEventEndpoint(_, args, context) {
      if (!enableAppEventFeature) {
        throw new errors.NotImplemented({
          message:
            'The requested mutation is not available on this server. ' +
            'The cause is a feature flag has been disabled or this feature is not ready for this environment.'
        });
      }

      return serviceContext.bll.application.updateApplicationEventEndpoint(
        context,
        args
      );
    },
    createOrganizationInvite(_, args, context) {
      return serviceContext.bll.organizationInvite.createOrganizationInvite(
        context,
        args
      );
    },
    updateOrganizationInvite(_, args, context) {
      return serviceContext.bll.organizationInvite.updateOrganizationInvite(
        context,
        args
      );
    },
    setUserDefaultOrganization(_, args, context) {
      return serviceContext.dal.organization.setUserDefaultOrganization(
        context,
        args
      );
    },
    deleteOrganizationInvite(_, args, context) {
      return serviceContext.bll.organizationInvite.deleteOrganizationInvite(
        context,
        args
      );
    },
    packageCreate(_, args, context) {
      const { input } = args;
      return dalPackage.packageCreate(input, context);
    },
    packageUpdate(_, args, context) {
      const { input } = args;
      return dalPackage.packageUpdate(input, context);
    },
    packageDelete(_, args, context) {
      return dalPackage.packageDelete(args, context);
    },
    async packageUpdateResources(_, args, context) {
      const { input } = args;

      return dalPackage.packageUpdate(input, context, true);
    },
    packageUpdateGrants(_, args, context) {
      const { input } = args;
      return dalPackage.packageUpdateGrants(input, context);
    },
    apiTokenCreate(_, args, context) {
      return dalAdmin.createApiToken(args, context);
    },
    apiTokenUpdate(_, args, context) {
      return dalAdmin.updateApiToken(args, context);
    },
    updateInstanceAuditLogConfig(_, args, context, info) {
      return serviceContext.dal.platform.updateInstanceAuditLogConfig(
        context,
        args.input,
        info
      );
    },
    createApplicationViewer(_, args, context) {
      return dalApplicationViewer.createApplicationViewer(args, context);
    },
    createApplicationViewerBuild(_, args, context) {
      return dalApplicationViewer.createApplicationViewerBuild(args, context);
    },
    updateApplicationViewer(_, args, context) {
      return dalApplicationViewer.updateApplicationViewer(args, context);
    },
    deleteApplicationViewer(_, args, context) {
      return dalApplicationViewer.deleteApplicationViewer(args, context);
    },
    deleteApplicationViewerBuild(_, args, context) {
      return dalApplicationViewer.deleteApplicationViewerBuild(args, context);
    },
    createAuditLogExportRequest(_, args, context) {
      return serviceContext.dal.platform.createAuditLogExportRequest(
        context,
        args.filters
      );
    },
    cancelAuditLogExportRequest(_, args, context) {
      return serviceContext.dal.platform.cancelAuditLogExportRequest(
        context,
        args
      );
    },
    initiateMultipartUpload(_, args, context) {
      return serviceContext.dal.dalStorage.initiateMultipartUpload(args.input);
    },
    completeMultipartUpload(_, args, context) {
      return serviceContext.dal.dalStorage.completeMultipartUpload(args.input);
    },
    cancelMultipartUpload(_, args, context) {
      return serviceContext.dal.dalStorage.cancelMultipartUpload(args.input);
    },
    addPlatformEmailProvider(_, args, context) {
      return serviceContext.bll.platformProvider.addPlatformEmailProvider(
        context,
        args.input
      );
    },
    emailTemplateCreate(_, args, context) {
      const { input } = args;
      return dalEmailTemplate.emailTemplateCreate(input, context);
    },
    emailTemplateUpdate(_, args, context) {
      const { input } = args;
      return dalEmailTemplate.emailTemplateUpdate(input, context);
    },
    emailTemplateDelete(_, args, context) {
      return dalEmailTemplate.emailTemplateDelete(args, context);
    },
    ingestSlugsCreate(_, args, context) {
      return serviceContext.dal.ingestSlug.createIngestSlugs(
        args,
        context
      );
    },
    ingestSlugUpdate(_, args, context) {
      return serviceContext.dal.ingestSlug.updateIngestSlug(
        args,
        context
      );
    },
    ingestSlugUpdateStatus(_, args, context) {
      return serviceContext.dal.ingestSlug.updateIngestSlugStatus(
        args,
        context
      );
    },
    ingestSlugsDelete(_, args, context) {
      return serviceContext.dal.ingestSlug.deleteIngestSlugs(
        args,
        context
      );
    },
    ingestSlugsDeleteForSource(_, args, context) {
      return serviceContext.dal.ingestSlug.deleteIngestSlugsForSource(
        args,
        context
      );
    },
    processingProjectCreate(_, args, context) {
      return dalProcessingDeliverables.createProject(context, args);
    },
    processingProjectDelete(_, args, context) {
      return dalProcessingDeliverables.deleteProject(context, args);
    },
    processingDeliverableCreate(_, args, context) {
      return dalProcessingDeliverables.createDeliverable(context, args);
    },
    processingDeliverableCancel(_, args, context) {
      return dalProcessingDeliverables.cancelDeliverable(context, args);
    },
    getSourceJWT(_, args, context) {
      return dalSource.getSourceJWT(context, args);
    },
  };

  return mutationMap;
};
