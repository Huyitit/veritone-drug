/*eslint no-undef: "error"*/
/*eslint no-const-assign: "error"*/
const _ = require('lodash');
const bytes = require('bytes');
const prettyBytes = require('pretty-bytes');

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const dalTDO = serviceContext.dal.tdo;
  const dalAsset = serviceContext.dal.asset;
  const errors = require('../error')(config);
  const mapper = require('./mapper.js');
  const mainUtil = require('../util.js')(serviceContext);
  const resolversUtil = require('../resolvers/util.js')(serviceContext);
  const languageUtil = require('./languageUtil.js')();
  const taskOutputUtil = require('./taskOutputConversionUtil.js')(config);
  const dalUtil = require('./util.js')(config, serviceContext);
  const TRANSCRIPT_ENGINE_CATEGORY_ID = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
  const TRANSLATION_ENGINE_CATEGORY_ID = '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923';
  // GraphQL max Int value
  const MAX_OFFSET_MS = Math.pow(2, 31) - 1;
  // note:  this default should match the limit in resolvers/index.js
  const responseSizeLimit = bytes.parse(
    _.get(config, 'server.responseSizeLimit', '100mb')
  );

  async function getSourceIdForMention(context, mentionId) {
    const sql = `
      SELECT
        media_source_id AS source_id,
        media_id AS tdo_id
      FROM
        mention
      WHERE
        mention_id = $1
    `;
    const res = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      [mentionId],
      mapper.camelizeRootKeys
    );
    return res.length > 0 ? res[0] : {};
  }

  /**
   * Get a list of engines concurrently in batches of 10.
   */
  async function batchGetEngines(context, engineIds, getEngineOptions = {}) {
    const numEngines = engineIds.length;
    const batchSize = 10;
    let numGet = 0;
    let index = 0;
    const res = [];
    do {
      const batch = [];
      for (let i = 0; i < batchSize && index < numEngines; i++) {
        batch[i] = engineIds[index++];
      }
      const batchRes = await getEngineBatch(context, batch, getEngineOptions);
      batchRes.forEach((engine) => res.push(engine));
    } while (index < numEngines);
    return res;
  }

  /**
   * Get a single batch of engines concurrently.
   */
  async function getEngineBatch(context, engineIds, getEngineOptions = {}) {
    const proms = [];
    for (let i = 0; i < engineIds.length; i++) {
      proms.push(
        serviceContext.dal.engine.getEngine(
          context,
          { ...getEngineOptions, id: engineIds[i] },
          true
        )
      );
    }
    const res = await Promise.all(proms);
    return res;
  }

  async function getEngineResults(args, context) {
    validateGetEngineResultsArgs(args);

    // capture current response total size
    let responseSize = context.requestInfo.responseTotalSize || 0;

    let sourceId = args.sourceId;
    const startDateTime = args.startDate;
    const stopDateTime = args.stopDate;

    let {
      engineIds,
      filterAssetsByTask,
      taskIdMap,
      libraryIdMap,
      tdoId
    } = await getEngineIdsForEngineResults(args, context);
    // args is passed into other functions that expect engineIds.
    // in query by jobId case, we'll set that here to the engine Ids
    // we computed from the task list on the job.
    if (!args.engineIds) args.engineIds = engineIds;
    args.engineIds = _.uniq(args.engineIds);

    // get all engines to for mapping to assets processors and output converters
    const engineByEngineId = await getEnginesByEngineId(context, engineIds, {
      includeDeleted: true,
      adminView: true
    });

    let mention;
    if (args.mentionId) {
      mention = await getSourceIdForMention(context, args.mentionId);
      if (!sourceId) sourceId = mention.sourceId;
      else {
        if (_.toString(sourceId) !== _.toString(mention.sourceId)) {
          // TODO we were given a source ID and mention ID that don't
          // match. return empty or throw?
          return mainUtil.emptyPage(args);
        }
      }
    }
    //get Source
    // TODO require start date/time if source only is passed?
    const source = await getSourceWithSourceType(
      context,
      sourceId,
      args.organizationId
    );
    const sourceIsLive = _.get(source, 'sourceType.isLive');

    let startDate,
      stopDate = null;

    if (startDateTime) {
      startDate = new Date(startDateTime);
    }
    if (stopDateTime) {
      stopDate = new Date(stopDateTime);
    }
    // https://steel-ventures.atlassian.net/browse/VTN-10187?filter=-1
    // get TDO
    let shouldStitch = false;
    if (sourceIsLive && sourceId > -1 && startDate && stopDate)
      shouldStitch = true;

    let tdos = await getTDOsForEngineResult(
      args,
      context,
      tdoId,
      sourceId,
      source,
      sourceIsLive,
      shouldStitch,
      mention,
      startDate,
      stopDate
    );

    // VTN-13741
    // sanity check that we are not attempting to stitch many overlapping TDOs.
    // this condition can occur if, for example, someone scripts ingestion of
    // many TDOs from an S3 bucket or file tree using a LIVE source and sets
    // startDateTime to the same value.
    // note that TDOs are sorted by startDateTime, stopDateTime at this point.
    if (shouldStitch && tdos.length) {
      const okTdos = [tdos[0]];
      const warnTdos = [];
      for (let i = 1; i < tdos.length; i++) {
        const prevTdo = tdos[i - 1];
        const tdo = tdos[i];

        // rule:  start time must be AFTER the previous TDO's start time
        if (
          tdo.startDateTime <= prevTdo.startDateTime ||
          // rule:  stop time must be AFTER the previous TDO's stop time
          tdo.stopDateTime <= prevTdo.stopDateTime
        ) {
          warnTdos.push(tdo);
        } else {
          // otherwise add it to our accumulated list
          okTdos.push(tdo);
        }
      }
      if (warnTdos.length) {
        // we'll log a warning only, and continue with the non-overlapping TDOs
        // we encountered.
        serviceContext.messageUtil.emitEvent({
          event: 'warning',
          errorName: 'live_source_tdo_overlap',
          tdoIds: warnTdos.map((tdo) => tdo.id),
          sourceId: sourceId,
          organizationId: args.organizationId,
          startDateTime,
          stopDateTime,
          message:
            'The engineResults query was used to query for TDOs on a ' +
            'live source that has overlapping TDOs. This represents a source ' +
            'misconfiguration or invalid TDO ingestion. TDOs associated with a ' +
            'live source should overlap only by a small buffer.'
        });
      }
      // now swap in our "approved" TDOs
      tdos = okTdos;
    }
    const firstTdo = tdos[0];
    const lastTdo = tdos[tdos.length - 1];

    // normalize passed date range to tdo start/stop, or max
    if (!args.startOffsetMs) {
      args.startOffsetMs = 0;
    }
    if (!args.stopOffsetMs) {
      if (_.isEqual(lastTdo.stopDateTime, firstTdo.startDateTime)) {
        args.stopOffsetMs = MAX_OFFSET_MS;
      } else {
        args.stopOffsetMs = lastTdo.stopDateTime - firstTdo.startDateTime;
      }
    }

    if (startDate) {
      if (startDate < firstTdo.startDateTime) {
        args.startOffsetMs = 0;
      } else {
        args.startOffsetMs = startDate - firstTdo.startDateTime;
      }
    }

    if (stopDate && stopDate < lastTdo.stopDateTime) {
      args.stopOffsetMs = stopDate - lastTdo.startDateTime;
    }

    args.startOffset = {
      tdoId: firstTdo.id,
      offsetMs: args.startOffsetMs
    };
    args.stopOffset = {
      tdoId: lastTdo.id,
      offsetMs: args.stopOffsetMs
    };

    const engineOutputs = await getEngineOutputsForEngineResult(
      args,
      context,
      engineIds,
      engineByEngineId,
      taskIdMap,
      libraryIdMap,
      tdos,
      responseSize,
      filterAssetsByTask
    );
    let results = outputsToEngineResults(
      args.tdoId,
      engineOutputs,
      engineByEngineId,
      args
    );
    results = _.sortBy(results, [
      'engineId',
      'taskId',
      'startOffsetMs',
      'stopOffsetMs'
    ]);

    return {
      sourceId,
      records: results
    };
  }

  function validateGetEngineResultsArgs(args) {
    if (
      args.startOffsetMs < 0 ||
      (args.stopOffsetMs > 0 && args.stopOffsetMs <= args.startOffsetMs)
    ) {
      throw new errors.InvalidInput({
        message: 'Invalid offset',
        data: {
          value: `Start offset ${args.startOffsetMs}. End offset ${args.stopOffsetMs}.`,
          field: 'outputString'
        }
      });
    }

    if (args.startDate && args.stopDate && args.stopDate <= args.startDate) {
      throw new errors.InvalidInput({
        message: 'Invalid date times',
        data: {
          value: `Start date ${args.startDate}. End date ${args.stopDate}.`,
          field: 'outputString'
        }
      });
    }
  }

  async function getEngineIdsForEngineResults(args, context) {
    // feature flag enable converting engine to DAG in DC config
    const enableConvertEnginesToDAG = _.get(
      serviceContext,
      'config.featureFlags.enableConvertEnginesToDAG',
      false
    );
    // feature flag enable engine replacement by organization
    const enableConvertEnginesToDAGByOrg = await mainUtil.isOrgSettingEnabled(
      context,
      'enableConvertEnginesToDAG'
    );
    const taskIdMap = {};
    const libraryIdMap = {};

    // engine IDs will be determined from the input (TDO + engineIds provided)
    // or from the tasks on the job (jobId provided)
    let engineIds = args.engineIds ? _.compact(args.engineIds) : [];
    let engineCategoryIds = args.engineCategoryIds
      ? _.compact(args.engineCategoryIds)
      : [];
    let tdoId = args.tdoId;
    let sourceId = args.sourceId;
    let job, tasks;

    // validate engine IDs
    if (engineIds.length) {
      if (enableConvertEnginesToDAG || enableConvertEnginesToDAGByOrg) {
        const engineReplacements = await serviceContext.bll.engine.getEngineReplacements(
          context,
          { sourceEngineIds: engineIds, organizationId: args.organizationId }
        );

        if (engineReplacements && engineReplacements.count > 0) {
          const records = engineReplacements.records;

          _.forEach(records, (engineReplacement) => {
            engineIds.push(engineReplacement.replacementEngineId);
          });
        }

        args.engineIds = _.uniq(engineIds);
      }

      engineIds = await validateEngineIds(context, engineIds, {
        includeDeleted: true,
        adminView: true
      });
    }

    // determines if assets should be filtered by task ID or not.
    // we filter by task if we are getting results for a specific job.
    // otherwise, we'll filter only by engine ID to avoid filtering
    // out engine results that do not have a task, such as user edited assets.
    let filterAssetsByTask = false;

    if (args.jobId) {
      job = await serviceContext.dal.job.getJob(context, {
        id: args.jobId,
        applicationId: args.applicationId
      });
      if (!tdoId && !sourceId) {
        // if we were not given a TDO ID, set TDO ID to the job target
        tdoId = job.targetId;
      } else if (job.targetId !== tdoId) {
        // just verify that they match. otherwise it's bad input.
        throw new errors.InvalidInput({
          message:
            'Both tdoId and jobId were passed, but the job target ID is ' +
            'a different TDO. Set one or the other to continue, not both.',
          data: {
            tdoId: tdoId,
            jobTargetId: job.targetId
          }
        });
      }
    }

    // get most recent Job by tdoId if no target job, engineIds, engineCategoryIds
    if (tdoId && !(job || args.engineIds || args.engineCategoryIds)) {
      const mostRecentJobs = await serviceContext.dal.job.getJobs(context, {
        offset: 0,
        limit: 1,
        orderBy: [{ field: 'createdDateTime', direction: 'desc' }],
        applicationId: args.applicationId,
        targetId: tdoId
      });

      if (mostRecentJobs.records && mostRecentJobs.records.length) {
        job = mostRecentJobs.records[0];
      }
    }

    // now get the tasks for the target job
    if (job) {
      tasks = await serviceContext.dal.task.getTasks(context, {
        jobId: job.id
      });
      filterAssetsByTask = !_.isEmpty(tasks.records);
    }
    // or get the tasks for the tdoId if no target job
    if (tdoId && !tasks) {
      tasks = await serviceContext.dal.task.getTasks(context, {
        targetId: tdoId,
        applicationId: args.applicationId,
        limit: 150, // TODO: iterate over the complete result set
        engineId: engineIds
      });
    }
    // last, map to engine IDs.
    if (tasks && tasks.records && tasks.records.length) {
      // these are internal non-aliased.
      let tempEngineIds = tasks.records.map((taskData) => taskData.engineId);

      // VTN-23904
      // audience and station playout engines do not have actual task.
      // so if the requested list contains those, we are going to
      // add the to the list from tasks so that they don't get filtered out.
      if (
        args.engineIds &&
        args.engineIds.includes('d7f7e7cd-dca9-49af-90b6-53a3698690f8')
      ) {
        tempEngineIds.push('d7f7e7cd-dca9-49af-90b6-53a3698690f8');
      }
      if (
        args.engineIds &&
        args.engineIds.includes('f36f3a76-16c2-4a78-b291-bfa5da9e9bf0')
      ) {
        tempEngineIds.push('f36f3a76-16c2-4a78-b291-bfa5da9e9bf0');
      }

      engineIds = !_.isEmpty(args.engineIds)
        ? _.intersection(engineIds, tempEngineIds)
        : tempEngineIds;

      tasks.records.forEach((task) => {
        const engId = task.engineId || task.engineAliasId;
        const libraryId = _.get(task, 'payload.libraryId');

        if (_.isArray(taskIdMap[engId]) && libraryId) {
          if (_.indexOf(taskIdMap[engId], task.id) === -1)
            taskIdMap[engId].push(task.id);
        } else {
          taskIdMap[engId] = [task.id];
        }
        // Add libraryId (if exists) to object map according to taskId
        if (libraryId) {
          libraryIdMap[task.id] = libraryId;
        }
      });

      if (engineIds.length === 0) {
        throw new errors.InvalidInput({
          message: 'The engineIds do not exists in Job or TDO provided.',
          data: {
            objectType: 'EngineIds',
            objectId: engineIds
          }
        });
      }
    }

    if (engineIds.length === 0 && engineCategoryIds.length === 0) {
      throw new errors.InvalidInput({
        message:
          'On the engineResults query, the engineIds parameter must be set unless a jobId or engineCategoryIds are provided.',
        data: {}
      });
    }

    // Populate engineIds by adding them from a category
    if (engineCategoryIds.length) {
      const categories = await getEnginesByCategoryId(
        context,
        engineCategoryIds
      );

      // if args.engineIds is empty, populate engineIds only from category
      // Otherwise will add them from category to engineIds
      engineIds = _.uniq(
        engineCategoryIds.reduce(
          (ids, engineCategoryId) => {
            return ids.concat(categories.get(engineCategoryId).engineIds);
          },
          _.isEmpty(args.engineIds) ? [] : engineIds
        )
      );
    }

    return { engineIds, filterAssetsByTask, taskIdMap, libraryIdMap, tdoId };
  }

  async function validateEngineIds(context, engineIds, getEngineOptions = {}) {
    try {
      const lstEngines = await batchGetEngines(
        context,
        engineIds,
        getEngineOptions
      );
      engineIds = _.uniq(
        _.filter(
          _.concat(
            engineIds,
            _.flatten(
              _.map(lstEngines, (engine) => [
                engine.internalId,
                engine.id,
                engine.aliasId
              ])
            )
          )
        )
      );
      return engineIds;
    } catch (err) {
      if (err.name === 'not_found' || err.name === 'invalid_input') {
        throw new errors.NotFound({
          message:
            'At least one of the specified engine IDs is not valid. Supply ' +
            'valid engine IDs to continue.',
          data: {
            engineIds,
            objectType: 'Engine',
            objectId: _.get(err, 'data.objectId'),
            internalData: {
              errorStack: err.stack,
              errorMessage: err.message
            }
          }
        });
      } else throw err;
    }
  }

  async function getTDOsForEngineResult(
    args,
    context,
    tdoId,
    sourceId,
    source,
    sourceIsLive,
    shouldStitch,
    mention,
    startDate,
    stopDate
  ) {
    let tdoIdArg = tdoId;
    // if the source is not live, we need to restrict results to a single TDO
    if (!sourceIsLive && !tdoId) {
      // if a fallback TDO ID was given, use that
      if (args.fallbackTdoId) {
        tdoIdArg = args.fallbackTdoId;
      } else if (mention) {
        // otherwise default to the single TDO on the mention (if there is one)
        tdoIdArg = mention.tdoId;
      } else {
        // VTN-13741 - add throw. without a TDO ID we cannot
        // get TDOs from a non-live source.
        throw new errors.InvalidInput({
          message:
            'When calling the engineResults API with a sourceId filter, ' +
            'you must either use a live source type or pass a TDO ID in the tdoId ' +
            'or fallbackTdoId parameter. The specified source, ' +
            (source ? source.name : '<none>') +
            ', ' +
            'is not live and cannot be used to aggregate engine results across ' +
            'TDOs by timeframe.',
          data: {
            sourceId,
            sourceName: source ? source.name : '<none>',
            sourceTypeId: _.get(source, 'sourceType.id'),
            sourceTypeName: _.get(source, 'sourceType.name')
          }
        });
      }
    }

    const getTdosArgs = {
      id: tdoIdArg,
      // we pass the source ID only if it's live (shouldStitch is true)
      sourceId: shouldStitch === true ? sourceId : undefined,
      // otherwise we get only the TDO referenced in the mention
      mentionId: !tdoIdArg ? args.mentionId : undefined,
      // if we retrieved a source or a mention, bypass other TDO authorization
      bypassAuth: source || mention ? true : false,
      includePublic: shouldStitch,
      applicationIds: args.applicationIds,
      limit: 100,
      organizationId: args.organizationId
    };

    if (args.organizationId) {
      const groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
        args.organizationId
      );
      getTdosArgs.groupId = groupId;
      getTdosArgs.includeByAcl = ['editor', 'viewer'];
    }

    if (shouldStitch && (startDate || stopDate)) {
      getTdosArgs.dateTimeFilter = [];
      if (startDate) {
        getTdosArgs.dateTimeFilter.push({
          fromDateTime: startDate.toISOString(),
          field: 'stopDateTime'
        });
      }
      if (stopDate) {
        getTdosArgs.dateTimeFilter.push({
          toDateTime: stopDate.toISOString(),
          field: 'startDateTime'
        });
      }
    }

    let tdos = await dalTDO.getTDOs(context, getTdosArgs);

    if (!(tdos && tdos.records && tdos.records.length)) {
      throw new errors.NotFound({
        data: {
          objectId: sourceId || tdoId,
          objectType: 'TemporalDataObject'
        }
      });
    }

    return _.sortBy(tdos.records, ['startDateTime', 'stopDateTime']);
  }

  async function getEngineOutputsForEngineResult(
    args,
    context,
    engineIds,
    engineByEngineId,
    taskIdMap,
    libraryIdMap,
    tdos,
    responseSize,
    filterAssetsByTask
  ) {
    // Results collection
    let engineOutputs = [];
    // Process engine outputs. Written in assets with assetType = 'vtn-standard'
    let taskIds = [];
    engineIds.forEach((engineId) => {
      if (taskIdMap[engineId]) {
        taskIds = _.concat(taskIds, taskIdMap[engineId]);
      }
    });

    const engineIdsToProcess = Array.from(engineByEngineId.keys());
    const allEnginesOutputs = await getEngineOutputs(
      context,
      engineIdsToProcess,
      taskIds,
      tdos,
      args.startOffset,
      args.stopOffset,
      args.ignoreUserEdited,
      responseSize,
      filterAssetsByTask
    );

    if (allEnginesOutputs && allEnginesOutputs.length) {
      allEnginesOutputs.forEach((engineOutput) => {
        if (engineOutput) {
          // remove engine that we've got results for from further queries
          removeEngineId(
            engineOutput.sourceEngineId,
            engineIdsToProcess,
            engineByEngineId
          );
          // keep the output
          engineOutputs.push(engineOutput);
        }
      });
    }

    // Process transcript asset and tasks outputs created by old engines
    const allTasksWithOutputs = await getLastCompleteEnginesTasksWithOutputs(
      context,
      tdos,
      engineIdsToProcess
    );

    // Process transcript asset created by old engines
    const transcriptEngineIds = [];
    engineIdsToProcess.forEach((engineId) => {
      const engine = engineByEngineId.get(engineId);
      if (engine && engine.categoryId === TRANSCRIPT_ENGINE_CATEGORY_ID) {
        transcriptEngineIds.push(engineId);
      }
    });
    let transcriptOutputs = [];
    if (transcriptEngineIds && transcriptEngineIds.length) {
      transcriptOutputs = await getOutputsForTtmlAndVlfTranscriptEngine(
        transcriptEngineIds,
        engineByEngineId,
        allTasksWithOutputs,
        tdos,
        args,
        context
      );
    }

    if (transcriptOutputs && transcriptOutputs.length) {
      transcriptOutputs
        .filter((output) => !!output)
        .forEach((transcriptOutput) => {
          // remove engine that we've got results for from further queries
          removeEngineId(
            transcriptOutput.sourceEngineId,
            engineIdsToProcess,
            engineByEngineId
          );
          // keep the output
          engineOutputs.push(transcriptOutput);
        });
    }

    // Process task outputs created by old engines
    let tasksToConvertOutputs = [];
    tasksToConvertOutputs = tasksToConvertOutputs.concat(
      filterTasksWithOffsetOutputSeries(
        allTasksWithOutputs,
        args.startOffset,
        args.stopOffset
      )
    );

    tasksToConvertOutputs = tasksToConvertOutputs.concat(
      filterTasksWithTranslationOutput(allTasksWithOutputs, engineByEngineId)
    );

    tasksToConvertOutputs.forEach((task) => {
      // Filter task outputs that have user edited vtn-standard assets created from them
      const startOffsetMs =
        args.startOffset.tdoId === task.targetId
          ? args.startOffset.offsetMs
          : 0;
      const stopOffsetMs =
        args.stopOffset.tdoId === task.targetId
          ? args.stopOffset.offsetMs
          : MAX_OFFSET_MS;

      const taskOutputConversionResult = taskOutputUtil.convertTaskOutputToStandardOutput(
        task,
        engineByEngineId.get(task.engineId),
        startOffsetMs,
        stopOffsetMs
      );

      if (taskOutputConversionResult) {
        engineOutputs.push(taskOutputConversionResult);
      }
    });

    // Group all outputs by tdoId and engineId and libraryId
    const groupedEnginesOutputs = _.groupBy(engineOutputs, (engineOutput) => {
      return `${engineOutput.tdoId}${engineOutput.sourceEngineId}${
        libraryIdMap[engineOutput.taskId] || ''
      }`;
    });

    // Find the newest output, so we have only in only 1 result per TDO per Engine per Library
    engineOutputs = _.map(groupedEnginesOutputs, (groupedEngineOutputs) => {
      if (groupedEngineOutputs.length < 2) return groupedEngineOutputs[0];

      let newestEngineOutput = {};
      groupedEngineOutputs.forEach((groupedEngineOutput) => {
        const modifiedDateTime = convertToMs(
          groupedEngineOutput.modifiedDateTime
        );
        const currentMaxTime =
          _.get(newestEngineOutput, 'modifiedDateTime') || 0;
        if (modifiedDateTime > currentMaxTime)
          newestEngineOutput = groupedEngineOutput;
      });

      // if all outputs for this Engine/Tdo pair are missing modifiedDateTime then just return the first one
      if (!newestEngineOutput) return groupedEngineOutputs[0];
      return newestEngineOutput;
    });

    await buildEngineOutputObjectUris(engineOutputs, tdos, context);

    unescapeWordSpecialCharacters(engineOutputs);
    return engineOutputs;
  }

  /**
   * Get engines by GUID and internalId.
   * @param engineIds
   * @returns {Promise.<TResult>}
   */
  async function getEnginesByEngineId(
    context,
    engineIds,
    getEnginesOptions = {}
  ) {
    const options = {
      ...getEnginesOptions,
      ...(Array.isArray(engineIds) ? { ids: engineIds } : { id: engineIds })
    };

    const engines = await serviceContext.dal.engine.getEngines(
      context,
      options
    );
    const results = engines.records;
    const engineByEngineId = new Map();

    results
      .filter((result) => !!result)
      .forEach((engine) => {
        engineByEngineId.set(engine.id, engine);
        if (engine.internalId) {
          engineByEngineId.set(engine.internalId, engine);
        }
        if (engine.aliasId) {
          engineByEngineId.set(engine.aliasId, engine);
        }
      });

    return engineByEngineId;
  }

  /**
   * Get engines by GUID and internalId.
   * @param engineCategoryIdsIds
   * @returns {Promise.<TResult>}
   */
  async function getEnginesByCategoryId(context, engineCategoryIds) {
    let getEnginePromises = [];
    engineCategoryIds.forEach((engineCategoryId) => {
      getEnginePromises.push(
        serviceContext.dal.engineCategory.getEngineCategory(context, {
          id: engineCategoryId
        })
      );
    });
    return Promise.all(getEnginePromises).then((results) => {
      const engineByEngineCategoryId = new Map();
      results
        .filter((result) => !!result)
        .forEach((engine) => {
          engineByEngineCategoryId.set(engine.id, engine);
          if (engine.internalId) {
            engineByEngineCategoryId.set(engine.internalId, engine);
          }
        });
      return engineByEngineCategoryId;
    });
  }

  async function getEngineOutput(
    context,
    asset,
    startOffset,
    stopOffset,
    responseSizeInit
  ) {
    let responseSize = responseSizeInit;
    const signedAssetUri = await dalAsset.signAssetUri(asset);
    const jsonString = await resolversUtil.download(signedAssetUri, context);
    let outputJson;
    try {
      outputJson = JSON.parse(jsonString);
    } catch (err) {
      // TODO: propagate error upstack, collect all and return in result alongside the successfully parsed outputJson.
      logger.warn(
        `Unable to parse engine result. signedAssetUri: ${signedAssetUri}`
      );
      return null;
    }

    let startOffsetMs =
      startOffset.tdoId === asset.containerId ? startOffset.offsetMs : 0;
    let stopOffsetMs =
      stopOffset.tdoId === asset.containerId
        ? stopOffset.offsetMs
        : MAX_OFFSET_MS;

    // filter only engine output series within the requested time range
    outputJson = filterEngineOutputSeriesWithinOffset(
      outputJson,
      startOffsetMs,
      stopOffsetMs
    );

    // check response size at this point, since adding engine
    // result assets can cause us to balloon past the
    // max response size and potentially use up all heap
    // without triggering the resolver-level check (which
    // doesn't happen until after this function completes).
    // note that the max size of an individual asset loaded
    // from a URL is enforced in the download() function.
    responseSize += JSON.stringify(outputJson).length;
    if (responseSize >= responseSizeLimit) {
      const msg =
        'Maximum GraphQL response size of ' +
        prettyBytes(responseSizeLimit) +
        ' exceeded. The engine results requested might ' +
        'span too many assets, or individual assets might be ' +
        'large. To continue, reduce the time window or narrow ' +
        'the requested set of engine or engine category IDs.';
      const data = {
        field: 'engineResults',
        maximumResponseSize: prettyBytes(responseSizeLimit),
        currentResponseSize: prettyBytes(responseSize),
        currentResponseSizeBytes: responseSize
      };
      throw new errors.CapacityExceeded({
        message: msg,
        data: data
      });
    }
    if (outputJson.series && outputJson.series.length) {
      // cannot rely that series are sorted - so sort them
      outputJson.series = _.sortBy(outputJson.series, [
        'startTimeMs',
        'stopTimeMs'
      ]);
    }
    outputJson.tdoId = asset.containerId;
    outputJson.userEdited = asset.userEdited;
    outputJson.modifiedDateTime = asset.modifiedDateTime;
    outputJson.sourceEngineId =
      outputJson.sourceEngineId || _.get(asset, 'metadata.sourceEngineId');
    outputJson.assetId = asset.id;
    return outputJson;
  }

  /**
   * Get a list of engine outputs with series that fall withing offset.
   * @param engineId
   * @param startOffsetMs
   * @param stopOffsetMs
   * @returns {Promise.<TResult>}
   */
  async function getEngineOutputs(
    context,
    engineIds,
    taskIds,
    tdos,
    startOffset,
    stopOffset,
    ignoreUserEdited,
    responseSizeInit,
    filterAssetsByTask
  ) {
    const getAssetsArgs = {
      // filter by source engine Id or task Id, but not both
      sourceEngineId: filterAssetsByTask && taskIds.length ? null : engineIds,
      sourceTaskId: !filterAssetsByTask && engineIds.length ? null : taskIds,
      assetType: 'vtn-standard',
      ignoreUserEdited,
      orderBy: 'createdDateTime',
      orderDirection: 'DESC'
    };

    const tdoAssets = await dalTDO.getAssets(context, getAssetsArgs, tdos);
    // VE-26935 - getAssetsArgs carries no limit, so this count is unbounded and
    // each row below turns into a parallel download + JSON.parse. Recorded
    // before the fan-out so it is captured even if one of the downloads throws.
    serviceContext.metrics.observeHistogram(
      'engineResultAssetsPerQuery',
      _.get(tdoAssets, 'records.length', 0)
    );
    const filterEngineAssetsPromises = [];

    if (tdoAssets && tdoAssets.records) {
      tdoAssets.records.forEach((asset) => {
        const filterAssetPromise = getEngineOutput(
          context,
          asset,
          startOffset,
          stopOffset,
          responseSizeInit
        );
        filterEngineAssetsPromises.push(filterAssetPromise);
      });
    }
    const resolvedAssetPromises = await Promise.all(filterEngineAssetsPromises);
    return resolvedAssetPromises.filter((engineOutput) => engineOutput);
  }

  /**
   * Removes passed engine id from the engineIds array
   * @param engineIdToRemove
   * @param engineIdsToProcess
   */
  function removeEngineId(
    engineIdToRemove,
    engineIdsToProcess,
    engineByEngineId
  ) {
    const engine = engineByEngineId.get(engineIdToRemove);

    if (engineIdToRemove === 'manual') {
      return;
    }

    if (!engine) {
      // should not happen
      throw new errors.InternalServerError({
        message:
          'The server encountered an internal error processing results for engine ' +
          engineIdToRemove +
          '. ' +
          engineIdToRemove +
          ' not found in ' +
          Array.from(engineByEngineId.keys()),
        data: {
          engineId: engineIdToRemove,
          enginesFound: Array.from(engineByEngineId.keys())
        }
      });
    }
    const engineId = engine.id;
    const internalEngineId = engine.internalId;
    const engineIdIdx = engineIdsToProcess.indexOf(engineId);
    if (engineIdIdx >= 0) {
      engineIdsToProcess.splice(engineIdIdx, 1);
    }
    const internalEngineIdIdx = engineIdsToProcess.indexOf(internalEngineId);
    if (internalEngineIdIdx >= 0) {
      engineIdsToProcess.splice(internalEngineIdIdx, 1);
    }
  }

  function convertBoundingBox(item) {
    if (!item.boundingBox) return null;
    const box = item.boundingBox;
    return [
      {
        x: _.get(box, 'A.x') || _.get(box, 'left', 0), // top left
        y: _.get(box, 'A.y') || _.get(box, 'top', 0)
      },
      {
        x: _.get(box, 'B.x') || _.get(box, 'left', 0), // bottom left
        y: _.get(box, 'B.y') || _.get(box, 'top', 0) + _.get(box, 'height', 0)
      },
      {
        // top right
        x: _.get(box, 'C.x') || _.get(box, 'left', 0) + _.get(box, 'width', 0),
        y: _.get(box, 'C.y') || _.get(box, 'top', 0)
      },
      {
        // bottom right
        x: _.get(box, 'D.x') || _.get(box, 'left', 0) + _.get(box, 'width', 0),
        y: _.get(box, 'D.y') || _.get(box, 'top', 0) + _.get(box, 'height', 0)
      }
    ];
  }

  /**
   * Build engine output seriesItem object full uris, if relative is present, and sign those if needed.
   * @param engineOutputs
   * @returns {Promise.<void>}
   */
  async function buildEngineOutputObjectUris(engineOutputs, tdos, context) {
    // Regex for 's3.amazonaws.com' 's3-aws-region.amazonaws.com'
    // 'bucket.s3.amazonaws.com' 'bucket.s3-aws-region.amazonaws.com'
    const s3UrlRegex = /s3(.*)\.amazonaws\.com/;
    const mediaStreamerImageRegex = /media-streamer\//;
    // sign uris in serial manner to avoid DDOSing storage
    const uriToSignedUri = new Map();
    const tdoById = tdos.reduce((map, tdo) => {
      map[tdo.id] = tdo;
      return map;
    }, {});
    for (let i = 0; i < engineOutputs.length; i++) {
      const engineOutput = engineOutputs[i];
      if (!engineOutput.series) {
        continue;
      }
      for (let j = 0; j < engineOutput.series.length; j++) {
        const seriesItem = engineOutput.series[j];

        if (!seriesItem.object) {
          const _uri = seriesItem.uri || seriesItem.sourceUri;
          if (_uri) {
            seriesItem.object = {
              uri: _uri,
              sourceUri: _uri,
              boundingPoly: convertBoundingBox(seriesItem)
            };
          } else continue;
        }
        let seriesItemObjectUri =
          seriesItem.object.uri || seriesItem.object.sourceUri;

        // build and override uri with media streamer uri from bounding poly
        if (
          (seriesItem.object.type === 'face' ||
            mediaStreamerImageRegex.test(seriesItemObjectUri) ||
            !seriesItemObjectUri) &&
          Array.isArray(seriesItem.object.boundingPoly) &&
          seriesItem.object.boundingPoly.length > 2 &&
          tdoById[engineOutput.tdoId] &&
          tdoById[engineOutput.tdoId].startDateTime
        ) {
          const boundingPolyParam = seriesItem.object.boundingPoly
            .map(
              (polyItem, polyIndex) =>
                `x[${polyIndex}]=${polyItem.x}&y[${polyIndex}]=${polyItem.y}`
            )
            .join('&');
          const reqParams = [
            `offsetMs=${seriesItem.startTimeMs}`,
            boundingPolyParam
          ].join('&');
          seriesItemObjectUri = `/media-streamer/image/${engineOutput.tdoId}?${reqParams}`;
        }

        if (!seriesItemObjectUri) continue;

        if (!seriesItemObjectUri.startsWith('http')) {
          if (mediaStreamerImageRegex.test(seriesItemObjectUri)) {
            // build full media streamer uri
            const mediaStreamerBaseUriFromConfig = await dalUtil.getMediaStreamerUri(
              context,
              engineOutput.tdoId
            );
            if (!mediaStreamerBaseUriFromConfig) {
              throw new errors.InternalServerError({
                message: 'No media-streamer base uri was configured'
              });
            }
            const streamUriParts = seriesItemObjectUri.split('media-streamer/');
            seriesItemObjectUri = `${mediaStreamerBaseUriFromConfig}${
              streamUriParts[streamUriParts.length - 1]
            }`;
          } else {
            // build full S3 bucket uri
            const s3FaceBucketConfig = _.get(
              serviceContext,
              'config.s3.buckets',
              []
            ).find((bucket) => bucket.key === 'face');

            if (!s3FaceBucketConfig || !s3FaceBucketConfig.name) {
              throw new errors.InternalServerError({
                message: 'No S3 face detection bucket was configured'
              });
            }
            const s3FaceBucket = s3FaceBucketConfig.name;
            const s3Region = s3FaceBucketConfig.region;
            if (!s3Region) {
              throw new errors.InternalServerError({
                message: 'No S3 face detection region was configured'
              });
            }
            if (s3Region === 'us-east-1') {
              seriesItemObjectUri = `https://s3.amazonaws.com/${s3FaceBucket}/${seriesItemObjectUri}`;
            } else {
              seriesItemObjectUri = `https://s3-${s3Region}.amazonaws.com/${s3FaceBucket}/${seriesItemObjectUri}`;
            }
          }
        }
        if (!s3UrlRegex.test(seriesItemObjectUri)) {
          // do not sign any uris except for aws S3
          seriesItem.object.uri = seriesItemObjectUri;
          continue;
        }
        let signedUri = uriToSignedUri.get(seriesItemObjectUri);
        if (!signedUri) {
          const strippedUnsignedUri = removeAwsSignatureParams(
            seriesItemObjectUri
          );
          try {
            signedUri = await resolversUtil.getSignedUrl(
              strippedUnsignedUri,
              'face'
            );
            uriToSignedUri.set(seriesItemObjectUri, signedUri);
          } catch (e) {
            continue;
          }
        }
        seriesItem.object.uri = signedUri;
      }
    }
  }

  /**
   * Remove AWS prefixed params, keep the rest.
   * @param uri
   * @returns {string}
   */
  function removeAwsSignatureParams(uri) {
    const amzParamKeyRegex = /[x..X]-[a..A][m..M][z..Z]/;
    if (!uri || !uri.includes('?') || !amzParamKeyRegex.test(uri)) {
      return uri;
    }
    const nakedUri = uri.split('?')[0];
    const uriParamsStr = uri.split('?')[1];
    const nonAwsSignatureParams = uriParamsStr
      .split('&')
      .filter(
        (uriParam) =>
          uriParam && uriParam.length && !amzParamKeyRegex.test(uriParam)
      );
    if (nonAwsSignatureParams.length) {
      return `${nakedUri}?${nonAwsSignatureParams.join('&')}`;
    }
    return nakedUri;
  }

  /**
   * Converts escaped special characters to unescaped in the seriesItem words items.
   * @param engineOutputs
   */
  function unescapeWordSpecialCharacters(engineOutputs) {
    engineOutputs.forEach((engineOutput) => {
      if (_.get(engineOutput, 'series.length')) {
        engineOutput.series.forEach((seriesItem) => {
          if (_.get(seriesItem, 'words.length')) {
            for (let i = 0; i < seriesItem.words.length; i++) {
              const word = seriesItem.words[i].word;
              if (word) {
                seriesItem.words[i].word = word.replace(/&#39;/g, "'");
              }
            }
          }
        });
      }
    });
  }

  /**
   * Converts engine outputs to engine results
   * @param tdoId
   * @param standardEngineOutputs
   * @param engineByEngineId
   * @param args request arguments to fill response values
   * @returns {Array} of engine results
   */
  function outputsToEngineResults(
    tdoId,
    standardEngineOutputs,
    engineByEngineId,
    args
  ) {
    const engineResults = [];
    standardEngineOutputs.forEach((output) => {
      const engineIdForOutput = output.sourceEngineId;
      if (
        args.engineIds.indexOf(engineIdForOutput) >= 0 ||
        _.get(args, 'engineCategoryIds.length') ||
        engineIdForOutput === 'manual' // handle legacy transcript ttml edit
      ) {
        engineResults.push(
          outputToEngineResult(tdoId, output, engineIdForOutput, args)
        );
        return;
      }
      const internalEngineIdForOutput = _.get(
        engineByEngineId.get(engineIdForOutput),
        'internalId'
      );
      const engineId = _.get(engineByEngineId.get(engineIdForOutput), 'id');
      if (
        !internalEngineIdForOutput ||
        !engineId ||
        internalEngineIdForOutput === engineId
      ) {
        return;
      }
      // engine id from the asset is non-internal but requested by internal
      if (
        engineId === engineIdForOutput &&
        args.engineIds.indexOf(internalEngineIdForOutput) >= 0
      ) {
        engineResults.push(
          outputToEngineResult(tdoId, output, internalEngineIdForOutput, args)
        );
        return;
      }
      // engine id from the asset is internal but requested by non-internal
      if (
        internalEngineIdForOutput === engineIdForOutput &&
        args.engineIds.indexOf(engineId) >= 0
      ) {
        engineResults.push(outputToEngineResult(tdoId, output, engineId, args));
        return;
      }
    });

    cleanupEngineResultsTempData(engineResults);

    return engineResults;
  }

  /**
   * Converts engine output to engine result
   * @param output
   * @param resultEngineId engine Id to use on the result
   * @returns {{}} engine result
   */
  function outputToEngineResult(tdoId, output, resultEngineId, args) {
    const engineResult = {
      tdoId: tdoId,
      engineId: resultEngineId,
      jsondata: output
    };
    if (output.series && output.series.length) {
      engineResult.startOffsetMs = output.series[0].startTimeMs;
      engineResult.stopOffsetMs =
        output.series[output.series.length - 1].stopTimeMs;
    } else {
      engineResult.startOffsetMs = args.startOffsetMs;
      engineResult.stopOffsetMs = args.stopOffsetMs;
    }
    if (_.get(engineResult, 'jsondata.userEdited') !== 'undefined') {
      engineResult.userEdited = _.get(engineResult, 'jsondata.userEdited');
    }
    if (_.get(engineResult, 'jsondata.assetId')) {
      engineResult.assetId = _.get(engineResult, 'jsondata.assetId');
    }
    if (_.get(engineResult, 'jsondata.tdoId')) {
      engineResult.tdoId = _.get(engineResult, 'jsondata.tdoId');
    }
    if (_.get(engineResult, 'jsondata.sourceId')) {
      engineResult.sourceId = _.get(engineResult, 'jsondata.sourceId');
    }
    if (_.get(engineResult, 'jsondata.taskId')) {
      engineResult.taskId = _.get(engineResult, 'jsondata.taskId');
    }
    return engineResult;
  }

  /**
   * Clean up engine result objects for response from data used for processing
   * @param engineResults
   */
  function cleanupEngineResultsTempData(engineResults) {
    engineResults.forEach((engineResult) => {
      delete engineResult.jsondata.userEdited;
      delete engineResult.jsondata.assetId;
      delete engineResult.jsondata.tdoId;
      delete engineResult.jsondata.sourceId;
    });
  }

  /**
   * Lists last 'complete' tasks for tdo and a list of engines
   * @param tdos
   * @param engineIds
   * @returns {Promise.<TResult>}
   */

  async function getLastCompleteEnginesTasksWithOutputs(
    context,
    tdos,
    engineIds
  ) {
    // if tdos or engineIds is empty, query for tasks will be too broad
    if (_.isEmpty(tdos) || _.isEmpty(engineIds)) {
      return [];
    }
    const tdoIds = tdos.map((tdo) => {
      return tdo.id;
    });
    const engineTaskArgs = {
      engineId: engineIds,
      targetId: tdoIds,
      status: 'complete'
    };
    let oldestTdo = tdos.find((tdo) => !!tdo.createdDateTime);
    tdos.forEach((tdo) => {
      if (
        tdo.createdDateTime &&
        oldestTdo &&
        tdo.createdDateTime < oldestTdo.createdDateTime
      ) {
        oldestTdo = tdo;
      }
    });
    if (oldestTdo && oldestTdo.createdDateTime) {
      const createdDateTimeFilterValue = new Date(oldestTdo.createdDateTime);
      createdDateTimeFilterValue.setDate(
        createdDateTimeFilterValue.getDate() - 1
      );
      engineTaskArgs.dateTimeFilter = [
        {
          fromDateTime: createdDateTimeFilterValue,
          field: 'createdDateTime'
        }
      ];
    }

    const results = await serviceContext.dal.task
      .getTasks(context, engineTaskArgs)
      .then((results) => {
        const engineTasksGroupedByTdoId = _.groupBy(
          results.records,
          'targetId'
        );
        const latestEngineTaskPerEngineGroupedByTdo = _.mapValues(
          engineTasksGroupedByTdoId,
          (engineTasksForSingleTdo) => {
            const engineTasksGroupedByEngineId = _.groupBy(
              engineTasksForSingleTdo,
              'engineId'
            );
            return _.flatten(
              _.map(_.values(engineTasksGroupedByEngineId), (result) => {
                const mostRecentTaskWithOutput = getLastTaskWithOutput(result);
                // Some jobs run the multiple tasks against the same engineId for different
                // library ids so we will search for other sibling tasks with the same engineId.
                if (mostRecentTaskWithOutput) {
                  return result.filter((t) => {
                    return t.jobId === mostRecentTaskWithOutput.jobId;
                  });
                }
              })
            );
          }
        );
        const flattenedEngineTasks = _.flatten(
          _.values(latestEngineTaskPerEngineGroupedByTdo)
        );
        return flattenedEngineTasks;
      });
    return results.filter((result) => result && result.id);
  }

  /**
   * Helper function to sort tasks by completion date and filter out ones with output.
   * @param tasks
   * @returns {null}
   */
  function getLastTaskWithOutput(tasks) {
    if (!tasks || !_.isArray(tasks) || !tasks.length) {
      return null;
    }
    const orderedTasksWithOutput = tasks
      .filter((task) => !!task.output)
      .sort((task1, task2) => {
        if (!task1.completedDateTime && !task2.completedDateTime) {
          return 0;
        }
        if (!task1.completedDateTime) {
          return 1;
        }
        if (!task2.completedDateTime) {
          return -1;
        }
        return (
          new Date(task2.completedDateTime).getTime() -
          new Date(task1.completedDateTime).getTime()
        ); // DESC
      });
    if (!orderedTasksWithOutput.length) {
      return null;
    }

    // find task with series if one available, else use most recent completed
    let resultTask = orderedTasksWithOutput.find(
      (task) => !!task.output.series
    );
    // some tasks do not have series, for example translation output
    if (!resultTask) {
      resultTask = orderedTasksWithOutput[0];
    }
    return resultTask;
  }

  /**
   * Retrieves ttml 'transcript' asset for given engine id.
   * @param transcriptEngineIds
   * @param engineByEngineId
   * @param allTasksWithOutputs
   * @param tdos
   * @param args
   * @param context
   * @returns {Promise.<*>}
   */
  async function getOutputsForTtmlAndVlfTranscriptEngine(
    transcriptEngineIds,
    engineByEngineId,
    allTasksWithOutputs,
    tdos,
    args,
    context
  ) {
    const tdoIds = tdos.map((tdo) => {
      return tdo.id;
    });
    const defaultVlfAssetArgs = {
      assetType: 'v-vlf',
      includeHiddenAssets: true,
      containerId: tdoIds,
      limit: 1
    };
    // start with getting asset by engine ids
    const assetsFromTranscriptEngineGuid = getVlfAssetsFromTranscriptEngineId(
      context,
      transcriptEngineIds,
      allTasksWithOutputs,
      defaultVlfAssetArgs
    );

    const assetsFromSource = getVlfAssetsFromSource(
      context,
      tdos,
      transcriptEngineIds,
      engineByEngineId,
      defaultVlfAssetArgs
    );

    const ttmlManualAssetArgs = _.cloneDeep(defaultVlfAssetArgs);
    ttmlManualAssetArgs.assetType = 'transcript';
    const assetsFromManual = getTtmlAssetsFromManual(
      context,
      args.ignoreUserEdited,
      ttmlManualAssetArgs
    );

    return await Promise.all([
      assetsFromTranscriptEngineGuid,
      assetsFromSource,
      assetsFromManual
    ]).then((results) => {
      const assets = combineAssetResults(results);
      if (!assets.count) {
        return null;
      }

      const assetPromises = assets.records.map(async (asset) => {
        let assetSourceEngineId =
          _.get(asset, 'metadata.sourceEngineId') ||
          _.get(asset, 'metadata.engineId');
        if (!assetSourceEngineId && _.get(asset, 'metadata.sourceTaskId')) {
          const sourceTaskId = _.get(asset, 'metadata.sourceTaskId');
          const task = _.find(allTasksWithOutputs, { id: sourceTaskId });
          if (task) assetSourceEngineId = task.engineId;
        }
        const userEditedAsset = _.get(asset, 'metadata.source') === 'manual';
        if (
          !assetSourceEngineId &&
          !userEditedAsset &&
          _.get(asset, 'metadata.source')
        ) {
          const assetSource = _.get(asset, 'metadata.source');
          for (let engine of engineByEngineId.values()) {
            if (_.get(engine, 'asset') === assetSource) {
              assetSourceEngineId = _.get(engine, 'id');
              break;
            } else if (_.get(engine, 'internalId') === assetSource) {
              assetSourceEngineId = _.get(engine, 'id');
              break;
            } else if (_.get(engine, 'id') === assetSource) {
              assetSourceEngineId = _.get(engine, 'id');
              break;
            }
          }
        }
        if (!assetSourceEngineId && userEditedAsset) {
          assetSourceEngineId = 'manual';
        }

        if (!assetSourceEngineId) return Promise.resolve(null);

        // if ran into legacy user edited ttml when none was requested - ignore it
        if (assetSourceEngineId === 'manual' && args.ignoreUserEdited)
          return Promise.resolve(null);

        return await dalAsset
          .signAssetUri(asset)
          .then((signedAssetUri) => {
            const transformFunc =
              asset.type === 'transcript' ? 'Transcript2JSON' : 'JSON';
            return resolversUtil.transformAsset(
              context,
              signedAssetUri,
              transformFunc
            );
          })
          .then((transcriptJsonString) => {
            const startOffsetMs =
              args.startOffset.tdoId === asset.containerId
                ? args.startOffset.offsetMs
                : 0;
            const stopOffsetMs =
              args.stopOffset.tdoId === asset.containerId
                ? args.stopOffset.offsetMs
                : MAX_OFFSET_MS;

            let transcriptSnippets = [];
            if (asset.type === 'transcript') {
              transcriptSnippets = filterTtmlJsonSnippetsWithinOffset(
                JSON.parse(transcriptJsonString),
                startOffsetMs,
                stopOffsetMs
              );
            } else if (asset.type === 'v-vlf') {
              transcriptSnippets = filterVlfSnippetsWithinOffset(
                JSON.parse(transcriptJsonString),
                startOffsetMs,
                stopOffsetMs
              );
            }

            let transcriptSeries = [];
            if (transcriptSnippets.length) {
              const snippetsToSeriesConverter =
                taskOutputUtil.taskOutputSeriesConverterByEngineCategoryId[
                  TRANSCRIPT_ENGINE_CATEGORY_ID
                ];
              transcriptSeries = snippetsToSeriesConverter(
                transcriptSnippets,
                asset.type
              );
            }

            if (transcriptSeries.length) {
              return {
                tdoId: asset.recordingId,
                assetId: asset.id,
                sourceEngineId: assetSourceEngineId,
                userEdited: userEditedAsset,
                modifiedDateTime: asset.modifiedDateTime,
                series: transcriptSeries
              };
            }
            return null;
          });
        /* Sep 18 - do not swallow. allow this to throw out and surface as error.
          .catch(() => {
            // fail silently
            return null;
          })
          */
      });

      return Promise.all(assetPromises);
    });
  }

  function combineAssetResults(results) {
    let assets = {
      records: [],
      count: 0,
      limit: 1,
      offset: 0
    };
    results.forEach((result) => {
      if (!result) return;
      assets.records = assets.records.concat(result.records || []);
      assets.limit = Math.max(assets.limit, result.limit || 0);
    });

    assets.records = _.uniqBy(assets.records, 'id');
    assets.count = assets.records.length;

    return assets;
  }

  async function getVlfAssetsFromTranscriptEngineId(
    context,
    transcriptEngineIds,
    allTasksWithOutputs,
    defaultTtmlAssetArgs
  ) {
    defaultTtmlAssetArgs.limit =
      transcriptEngineIds.length *
      (defaultTtmlAssetArgs.containerId.length || 1);
    return await dalAsset
      .getAssets(
        context,
        Object.assign(
          { sourceEngineId: transcriptEngineIds },
          defaultTtmlAssetArgs
        )
      )
      .then(async (assets) => {
        const transcriptEngineTasks = allTasksWithOutputs.reduce(
          (tasks, task) => {
            if (transcriptEngineIds.indexOf(task.engineId) > -1) {
              tasks.push(task);
            }
            return tasks;
          },
          []
        );

        if (transcriptEngineTasks.length) {
          const sourceTaskIds = transcriptEngineTasks.map(
            (transcriptEngineTask) => {
              return transcriptEngineTask.id;
            }
          );
          const assetsBySourceTaskId = await dalAsset.getAssets(
            context,
            Object.assign({ sourceTaskId: sourceTaskIds }, defaultTtmlAssetArgs)
          );
          return combineAssetResults([assets, assetsBySourceTaskId]);
        }
        return assets;
      });
  }

  async function getVlfAssetsFromSource(
    context,
    tdos,
    transcriptEngineIds,
    engineByEngineId,
    defaultTtmlAssetArgs
  ) {
    // finally try to find asset by engine.source
    const sources = _.uniq(
      transcriptEngineIds.reduce((results, transcriptEngineId) => {
        const asset = _.get(engineByEngineId.get(transcriptEngineId), 'asset');
        if (asset) results.push(asset);
        return results;
      }, [])
    );
    if (sources.length) {
      defaultTtmlAssetArgs.limit = sources.length * (tdos.length || 1);
      return await dalAsset.getAssets(
        context,
        Object.assign({ sourceEngineId: sources }, defaultTtmlAssetArgs),
        tdos
      );
    }
    return null;
  }

  async function getTtmlAssetsFromManual(
    context,
    ignoreUserEdited,
    defaultTtmlAssetArgs
  ) {
    if (ignoreUserEdited) return Promise.resolve();

    // Legacy transcript edits have source = manual. If we have a legacy transcript edit is newer than all
    // other transcript assets and ignoreUserEdits it false then return it else ignore it.
    if (defaultTtmlAssetArgs.containerId.length) {
      defaultTtmlAssetArgs.limit = defaultTtmlAssetArgs.containerId.length;
    }
    return await dalAsset.getAssets(
      context,
      Object.assign({ sourceEngineId: 'manual' }, defaultTtmlAssetArgs)
    );
  }

  /**
   * Retains engine output series that fall withing offset or overlap with offset boundaries.
   * @param outputJson standards engine output with series
   * @param startOffsetMs
   * @param stopOffsetMs
   * @returns {*} standards engine output with truncated series
   */
  function filterEngineOutputSeriesWithinOffset(
    outputJson,
    startOffsetMs,
    stopOffsetMs
  ) {
    if (!outputJson || !outputJson.series || !_.isArray(outputJson.series)) {
      return outputJson;
    }

    outputJson.series = outputJson.series.filter((item) =>
      isWithinOffsetOverlappingBoundary(item, startOffsetMs, stopOffsetMs)
    );
    return outputJson;
  }

  /**
   * Filter tasks that have outputs in which series fall withing the offset or overlap with offset boundaries.
   * Cuts the series that exceed offset boundaries.
   * @param tasks
   * @param startOffsetMs
   * @param stopOffsetMs
   * @returns {Array}
   */
  function filterTasksWithOffsetOutputSeries(tasks, startOffset, stopOffset) {
    const resultTasks = [];
    tasks
      .filter((task) => _.get(task, 'output.series.length', 0) > 0)
      .forEach((task) => {
        const startOffsetMs =
          startOffset.tdoId === task.targetId ? startOffset.offsetMs : 0;
        const stopOffsetMs =
          stopOffset.tdoId === task.targetId
            ? stopOffset.offsetMs
            : MAX_OFFSET_MS;
        const newSeries = task.output.series.filter((item) =>
          isWithinOffsetOverlappingBoundary(item, startOffsetMs, stopOffsetMs)
        );
        if (newSeries.length) {
          task.output.series = newSeries;
          resultTasks.push(task);
        }
      });
    return resultTasks;
  }

  /**
   * Filters transcript TTML snippets that fall withing offset or overlap with offset boundaries
   * @param transcriptJson
   * @param startOffsetMs
   * @param stopOffsetMs
   * @returns {Array}
   */
  function filterTtmlJsonSnippetsWithinOffset(
    transcriptJson,
    startOffsetMs,
    stopOffsetMs
  ) {
    return transcriptJson.filter((snippet) => {
      const item = {
        start: parseInt(Number(snippet.start) * 1000),
        end: parseInt(Number(snippet.end) * 1000)
      };
      return isWithinOffsetOverlappingBoundary(
        item,
        startOffsetMs,
        stopOffsetMs
      );
    });
  }

  /**
   * Filters transcript VLF snippets that fall withing offset or overlap with offset boundaries
   * @param transcriptJson
   * @param startOffsetMs
   * @param stopOffsetMs
   * @returns {Array}
   */
  function filterVlfSnippetsWithinOffset(vlfJson, startOffsetMs, stopOffsetMs) {
    return Object.values(vlfJson).filter((snippet) =>
      isWithinOffsetOverlappingBoundary(snippet, startOffsetMs, stopOffsetMs)
    );
  }

  /**
   * Verifies if item is withing time offset overlapping offset boundaries.
   * @param item {start: {number}, end: {number}} or {startTimeMs: {string}, stopTimeMs: {string}} start and end time in milliseconds
   * @param startOffsetMs
   * @param stopOffsetMs
   * @returns {bool}
   */
  function isWithinOffsetOverlappingBoundary(
    item,
    startOffsetMs,
    stopOffsetMs
  ) {
    const itemStartMs = isNaN(item.start)
      ? Number(item.startTimeMs)
      : item.start;
    const itemStopMs = isNaN(item.end) ? Number(item.stopTimeMs) : item.end;
    return (
      // series item overlaps with offset start
      (itemStartMs <= startOffsetMs && itemStopMs > startOffsetMs) ||
      // series item overlaps with offset stop
      (itemStartMs < stopOffsetMs && itemStopMs >= stopOffsetMs) ||
      // series item is within the offset
      (itemStartMs >= startOffsetMs && itemStopMs <= stopOffsetMs)
    );
  }

  /**
   * Filters tasks that have translation engine output.
   * Assumption is that language keys go into task.payload.target string and taskOutput keys.
   * @param tasks
   * @param engineByEngineId
   * @returns Array{*}
   *
   * Detects
   * 'Pia' engine
   *   taskOutput {
   *     "French": "Dans la dernière semaine",
   *     "German": "In der letzten Woche haben"
   *   }
   *   taskPayload: {target: "French,German"}
   * and
   *   taskOutput {
   *     "Afrikaans": "En ek dink",
   *     "Albanian": "Dhe mendoj se"
   *   }
   *   taskPayload: {target:"Afrikaans:af,Albanian:sq"}
   *
   * 'Ventrical' engine
   *   taskOutput {
   *     "Spanish": "... la fuerza de "
   *   }
   *   taskPayload: {source: "en", target: "es"}
   *
   * 'Jupiter' engine
   *   taskOutput {
   *     "Spanish": "Bien su sierra"
   *   }
   *   taskPayload: {target: "es"}
   *
   * 'task-google-translate' engine
   *   taskOutput {
   *      "Vietnamese": "đó là l"
   *   }
   *   taskPayload {target: ["Vietnamese:vi"]}
   */
  function filterTasksWithTranslationOutput(tasks, engineByEngineId) {
    return tasks.filter((task) => {
      const engine = engineByEngineId.get(task.engineId);
      if (_.get(engine, 'categoryId') !== TRANSLATION_ENGINE_CATEGORY_ID) {
        return false;
      }
      if (
        !task.payload ||
        !task.payload.target ||
        !(
          typeof task.payload.target === 'string' ||
          _.isArray(task.payload.target)
        ) ||
        !task.payload.target.length
      ) {
        return false;
      }
      let targetLanguageIsoCodes = [];
      if (_.isArray(task.payload.target)) {
        targetLanguageIsoCodes = task.payload.target;
      } else if (typeof task.payload.target === 'string') {
        targetLanguageIsoCodes = task.payload.target.split(',');
      }
      targetLanguageIsoCodes = targetLanguageIsoCodes
        .map((targetLanguage) =>
          languageUtil.languageStringToIsoCode(targetLanguage.split(':')[0])
        )
        .filter((item) => !!item);
      for (let languageKey in task.output) {
        if (Object.prototype.hasOwnProperty.call(task.output, languageKey)) {
          const taskOutputLanguageKeyIsoCode = languageUtil.languageStringToIsoCode(
            languageKey
          );
          // if task output key matches one of the requested languages - then this must be a translation task result
          return (
            taskOutputLanguageKeyIsoCode &&
            targetLanguageIsoCodes.indexOf(taskOutputLanguageKeyIsoCode) >= 0
          );
        }
      }
      return false;
    });
  }

  async function getSourceWithSourceType(context, sourceId, orgId) {
    let source;
    if (sourceId) {
      const sourceKey = `${sourceId}_${orgId ? orgId : 'null'}`;
      source = await serviceContext.redisCache.get(
        'dalEngineResult.source',
        sourceKey
      );
      if (!source) {
        source = await serviceContext.dal.source.getSource(context, {
          id: sourceId,
          organizationId: orgId
        });
        if (source && !source.sourceType) {
          source.sourceType = await serviceContext.dal.sourceType.getSourceType(
            context,
            {
              id: source.sourceTypeId,
              organizationId: orgId
            }
          );
        }
        if (source && source.sourceType)
          await serviceContext.redisCache.set(
            'dalEngineResult.source',
            sourceKey,
            source
          );
      }
    }
    return source;
  }

  function convertToMs(time) {
    const inputDate = new Date(time);
    // if the input is invalid return default date
    if (!inputDate.getTime()) return new Date(0).getTime();
    time = inputDate.getTime();

    const yearFromNow = new Date(
      new Date().setFullYear(new Date().getFullYear() + 1)
    );
    const isSeconds = new Date(time * 1000) < yearFromNow;
    return isSeconds ? time * 1000 : time;
  }

  return {
    getEngineResults: getEngineResults,
    //export for unit-test
    getEnginesByEngineId,
    validateEngineIds,
    getEnginesByCategoryId,
    getEngineOutputs,
    convertToMs,
    filterTasksWithTranslationOutput,
    filterTtmlJsonSnippetsWithinOffset,
    filterVlfSnippetsWithinOffset,
    getTtmlAssetsFromManual,
    getVlfAssetsFromSource,
    getVlfAssetsFromTranscriptEngineId,
    getOutputsForTtmlAndVlfTranscriptEngine,
    getLastTaskWithOutput,
    getLastCompleteEnginesTasksWithOutputs,
    outputsToEngineResults,
    outputToEngineResult,
    unescapeWordSpecialCharacters,
    removeAwsSignatureParams,
    buildEngineOutputObjectUris,
    getSourceIdForMention,
    removeEngineId,
    convertBoundingBox
  };
};
