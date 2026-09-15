/*eslint no-undef: "error"*/
/*eslint no-const-assign: "error"*/
const _ = require('lodash');
const mapper = require('./mapper.js');
const fs = require('fs');
const moment = require('moment');
const validator = require('validator');
const veritoneCspGenerator = require('veritone-csp-generator');
const realToV3Query = veritoneCspGenerator.CSPToV3Query;
const { v4: uuidv4 } = require('uuid');
const {
  eventsMap,
  supportedEvents
} = require('@veritone/core-server-base/events-map.js');

if (moment.tz)
  moment.tz.add(require('moment-timezone/data/packed/latest.json'));

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const dbConnections = serviceContext.dbConnections;
  const mainUtil = require('../util.js')(serviceContext);
  const errors = require('../error')(config);
  const dalUtil = require('./util')(config, serviceContext);
  const messageUtil =
    serviceContext.messageUtil || require('../messageUtil.js')(serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const dalFolder =
    serviceContext.dal.folder || require('./dalFolder')(serviceContext);

  const InvalidInput = errors.InvalidInput;
  const NotFound = errors.NotFound;
  const watchlistSelect = `
    tracking_unit_id AS id,
    tracking_unit_name AS name,
    media_source_type_id AS source_type_id,
    media_source_type_ids AS source_type_ids,
    organization_id,
    application_id,
    last_updated_date AS modified_date_time,
    creation_date AS created_date_time,
    tracking_unit_start_date AS start_date_time,
    tracking_unit_stop_date AS stop_date_time,
    target_audience,
    tracking_unit_details AS details,
    track_my_programs AS search_index,
    track_all,
    advertiser_id,
    brand_id,
    tracking_unit_state_lookup_id,
    creative_id,
    enable_expiration_notification,
    tracking_unit_type AS watchlist_type
    `;

  const knownTrackingUnitTypes = {
    discovery: true,
    tracking: true,
    live_prerecorded: true
  };

  const trackingUnitDBChangedKey = 'trackingUnitDBChangeTimestamp';
  const watchlistLastUpdatedTimestampKey = 'watchlistLastUpdatedTimestampKey:';
  const trackingUnitStateLookup = {
    COMPLETE: 1,
    UPDATING: 2,
    DELETED: 3,
    INACTIVE: 4
  };

  function toV3Query(csp) {
    try {
      return realToV3Query(csp);
    } catch (err) {
      logger.error(err);
      throw new InvalidInput({
        message:
          'The provided cognitive search profile contained well-formed JSON ' +
          'but did not represent a valid search profile.',
        data: {
          input: csp,
          inputString: JSON.stringify(csp),
          details: err.message
        }
      });
    }
  }

  async function bulkUpdateWatchlist(context, args) {
    let ids = _.get(args, 'filter.ids');
    if (!_.isArray(ids) || _.isEmpty(ids) || ids.some(isNaN)) {
      throw new InvalidInput({ message: 'Invalid Ids' });
    }
    ids = ids.map(Number);
    const stopDate = _.get(args, 'input.stopDate');
    if (!stopDate) throw new Error('stop date is required');
    dalUtil.verifyRealisticTime(stopDate / 1000, 'stopDate');
    const sql = `
        UPDATE
          tracking_unit
        SET
          tracking_unit_stop_date = $1
        WHERE
          tracking_unit_id = ANY ($2)
        RETURNING
          ${watchlistSelect}
           `;

    const results = await dbConnections['media_platform'].write.query(sql, [
      new Date(stopDate),
      ids
    ]);
    return {
      records: results.map(mapper.mapWatchlist),
      count: results.length,
      limit: 0,
      offset: 0
    };
  }

  function getCSPJson(csp, requireValue) {
    let json;
    if (csp.profile) {
      json = csp.profile;
    } else if (csp.jsonstring) {
      try {
        json = JSON.parse(csp.jsonstring);
      } catch (err) {
        throw new InvalidInput({
          message:
            'The cognitiveSearchProfiles field did not contain valid JSON.',
          data: {
            field: 'jsonstring',
            value: csp.jsonstring,
            details: err.message
          }
        });
      }
    } else if (requireValue) {
      throw new InvalidInput({
        message:
          'Either the jsonstring or profile field must be passed to createCognitiveSearch.cognitiveSearchProfiles.'
      });
    }
    return json;
  }

  async function createCSPs(
    context,
    input,
    watchlistId,
    clearExisting = false,
    dbTrans
  ) {
    if (!dbTrans) {
      dbTrans = dbConnections['media_platform'].write;
    }

    const userId = await resUtil.getUserIdFromAuthContext(context);
    const queries = [];
    const params = [watchlistId];

    if (clearExisting) {
      queries.push(`
DELETE FROM
  cognitive_profile
WHERE
  tracking_unit_id = $1
      `);
    }
    const csps = input.cognitiveSearches || [];
    if (!_.isEmpty(csps)) params.push(userId);

    csps.forEach((csp) => {
      const argIndex = params.length + 1;
      params.push(csp.mentionStatusId);
      let json = getCSPJson(csp, true);
      params.push(json);

      const q = toV3Query(json);
      params.push(q);
      const sql = `
    INSERT INTO
      cognitive_profile
      (tracking_unit_id,
       owner_user_id,
       mention_status_id,
       csp,
       query)
    VALUES ($1, $2, \$${argIndex}, \$${argIndex + 1}, \$${argIndex + 2})
    RETURNING *
      `;
      queries.push(sql);
    });

    if (!queries.length) {
      return [];
    }
    const allSql = queries.join(';\n');

    const res = await dbTrans.multi(allSql, params);
    if (clearExisting) {
      res.shift();
    }
    return [].concat(...res);
  }

  async function populateDetails(obj, dbTrans) {
    if (!dbTrans) {
      dbTrans = dbConnections['media_platform'].write;
    }

    const details = obj.details || {};
    if (obj.marketId) {
      let ids = details.marketIds;
      if (!ids) ids = [];
      if (!ids.includes(obj.marketId)) {
        ids.push(obj.marketId);
      }
      details.marketIds = ids;
    }
    // synthesize target audience if it's set in DB.
    if (obj.targetAudience) {
      details.targetAudience = obj.targetAudience;
    }

    // now get more market IDs from tracking_unit_market
    const sql = `
SELECT
  market_id AS id
FROM
  tracking_unit_market
WHERE
  tracking_unit_id = $1
    `;
    const dbData = await dbTrans.query(sql, [obj.id]);
    const moreIds = dbData.map((row) => row.id);

    if (details.marketIds) {
      // combine results
      details.marketIds = _.uniqBy(
        _.concat(details.marketIds, moreIds),
        (num) => num
      ).map((n) => _.toString(n));
    } else {
      details.marketIds = moreIds.map((n) => _.toString(n));
    }

    // now get program IDs

    details.programIds = await getProgramIds(obj.id);

    return details;
  }

  async function saveProgramIds(context, watchlistId, programIds, dbTrans) {
    if (!dbTrans) {
      dbTrans = dbConnections['media_platform'].write;
    }
    // form a query to delete all old values and insert
    // new ones all at once.
    let sql = `
DELETE FROM
  tracking_unit_program
WHERE
  tracking_unit_id = $1
;
    `;
    // note that media source ID is null in existing db rows.
    const values = [watchlistId];
    programIds.forEach((programId) => {
      values.push(programId);
      sql += `
INSERT INTO
  tracking_unit_program
  (
    program_id,
    tracking_unit_id
  )
  VALUES (\$${values.length}, $1)
;
`;
    });

    return dbTrans.multi(sql, values);
  }

  async function getProgramIds(watchlistId) {
    const sql = `
SELECT
  program_id AS id
FROM
  tracking_unit_program
WHERE
  tracking_unit_id = $1
    `;
    const pdata = await dbConnections['media_platform'].read.map(
      sql,
      [watchlistId],
      (row) => _.toString(row.id)
    );
    return pdata;
  }

  async function saveSourceIds(context, watchlistId, sourceIds, dbTrans) {
    if (!dbTrans) {
      dbTrans = dbConnections['media_platform'].write;
    }
    // form a query to delete all old values and insert
    // new ones all at once.
    let sql = `
  DELETE FROM
    tracking_unit_media_source
  WHERE
    tracking_unit_id = $1
  ;
    `;
    const values = [watchlistId];
    sourceIds.forEach((sourceId) => {
      values.push(sourceId);
      sql += `
  INSERT INTO
  tracking_unit_media_source
  (
    media_source_id,
    tracking_unit_id
  )
  VALUES (\$${values.length}, $1)
  ;
  `;
    });

    return dbTrans.multi(sql, values);
  }

  async function getSourceIds(watchlistId) {
    const sql = `
SELECT
  media_source_id AS id
FROM
  tracking_unit_media_source
WHERE
  tracking_unit_id = $1
    `;
    const pdata = await dbConnections['media_platform'].read.map(
      sql,
      [watchlistId],
      (row) => _.toString(row.id)
    );
    return pdata;
  }

  async function updateCognitiveSearch(context, args) {
    const input = args.input;
    const values = [input.id, input.organizationId];
    const setList = [];
    const cspJson = getCSPJson(input, false);
    if (cspJson) {
      values.push(cspJson);
      setList.push(` csp = \$${values.length}`);
      const q = toV3Query(cspJson);
      values.push(q);
      setList.push(` query = \$${values.length}`);
    }
    if (input.mentionStatusId) {
      values.push(input.mentionStatusId);
      setList.push(` mention_status_id = \$${values.length}`);
    }

    const setClause = setList.join(', ');
    const sql = `
UPDATE cognitive_profile cp
SET
  ${setClause}
FROM tracking_unit tu
WHERE
  cp.cognitive_profile_id = $1 AND
  cp.tracking_unit_id = tu.tracking_unit_id AND
  tu.organization_id = $2
RETURNING
  cp.cognitive_profile_id AS id,
  cp.tracking_unit_id AS watchlist_id,
  cp.csp AS profile,
  cp.mention_status_id,
  cp.owner_user_id,
  cp.query AS query
    `;
    const res = await dbConnections['media_platform'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return res[0];
  }

  function validateIds(ids, field, fieldText) {
    return ids.map((val) => {
      const id = Number.parseInt(val, 10);
      if (!_.isNumber(id) || Number.isNaN(id)) {
        throw new errors.InvalidInput({
          message: `The provided list of ${fieldText} contained an invalid value`,
          data: {
            field: field,
            value: ids
          }
        });
      }
      return id;
    });
  }

  async function mapSourceTypeIds(input) {
    // Do some prevalidating and determine the source and source Type IDS that we will
    // save to the database.  Because stId is required in the DB, we must map
    // sourceId to sourceTypeId
    const res = {
      stId: 5, // required, default to Private Media
      stIds: [5] // field used by mention gen
    };

    if (input.sourceIds && input.sourceIds.length > 0) {
      const sourceIds = validateIds(input.sourceIds, 'sourceIds', 'source IDs');
      const sources = await getSourceInfo(sourceIds);
      if (!sources || sources.length != sourceIds.length) {
        throw new errors.InvalidInput({
          message: 'Invalid source ID',
          data: {
            field: 'sourceIds',
            value: input.sourceIds
          }
        });
      }
      // populate required field with source type of the first source
      const source = sources.find((s) => s.sourceId === sourceIds[0]);
      res.stId = source.sourceTypeId;
      res.stIds = null;

      // now decide if we should include other source type IDs
      if (input.sourceTypeIds) {
        const existingSourceTypes = sources.map((s) => s.sourceTypeId);
        const toAdd = validateIds(
          input.sourceTypeIds,
          'sourceTypeIds',
          'source type IDs'
        ).filter((st) => existingSourceTypes.indexOf(st) < 0);

        if (toAdd.length > 0) {
          res.stId = toAdd[0];
          res.stIds = toAdd;
        }
      }
    } else if (input.sourceTypeIds && input.sourceTypeIds.length > 0) {
      const stIds = validateIds(
        input.sourceTypeIds,
        'sourceTypeIds',
        'source type IDs'
      );

      res.stId = stIds[0];
      res.stIds = stIds;
    }
    return res;
  }

  async function getSourceInfo(sourceIds) {
    const queryPlaceholder = dalUtil.buildQueryPlaceholders(
      1,
      sourceIds.length
    );
    const sql = `
      SELECT
        media_source_id AS source_id,
        media_source_type_id AS source_type_id
      FROM
        media_source
      WHERE
        media_source_id IN (${queryPlaceholder})
    `;
    const res = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      sourceIds,
      mapper.camelizeRootKeys
    );
    return res;
  }

  async function convertSearchIndex(context, input) {
    // check references
    const res = input.searchIndex === 'mine' ? true : false;

    if (!res) {
      // only orgs that have the globalMedia setting enabled should
      // be able to create a watchlist with the global index.
      if (!(await mainUtil.isOrgSettingEnabled(context, 'globalMedia'))) {
        throw new errors.NotAllowed({
          message:
            'The organization is not provisioned to allow global media access.',
          data: {
            organizationId: input.organizationId,
            feature: 'globalMedia'
          }
        });
      }
    }
    return res;
  }

  async function checkWatchlistRange(
    startDateTimeArg,
    stopDateTimeArg,
    context
  ) {
    // we need to check the date formats. if the callers passes values directly
    // in the graphql query, they come across as numbers. if they use variables,
    // they come across as strings.
    const startDateTime = _.isString(startDateTimeArg)
      ? moment(startDateTimeArg).unix() * 1000
      : startDateTimeArg;
    const stopDateTime = _.isString(stopDateTimeArg)
      ? moment(stopDateTimeArg).unix() * 1000
      : stopDateTimeArg;

    // note that these values are millis
    if (stopDateTime < startDateTime) {
      throw new errors.InvalidInput({
        message: 'The supplied startDateTime must be before the stopDateTime.',
        data: {
          startDateTime: formatDate(startDateTime),
          stopDateTime: formatDate(stopDateTime)
        }
      });
    }

    // checks are hidden behind feature flag. if the are disabled, quit now.
    if (!_.get(config, 'featureFlags.enforceWatchlistRangeLimits', false)) {
      return;
    }

    const limits = await mainUtil.getOrgSettingByKey(
      context,
      'features.watchlistLimits',
      {}
    );
    let minimumStartDate = limits.minimumStartDate;

    // apply default max duration of 180 days
    const maximumDurationDays = limits.maximumDurationDays || 180;
    let maximumStartAgeDays = limits.maximumStartAgeDays;
    // if neither start date restriction was specified, apply default of
    // 180 days from current date.
    if (!(maximumStartAgeDays || minimumStartDate)) maximumStartAgeDays = 180;

    const maxDurationMillis = maximumDurationDays * 24 * 60 * 60 * 1000;
    const durationMillis = stopDateTime - startDateTime;
    const durationDays = Math.floor(durationMillis / 1000 / 60 / 60 / 24);

    if (durationDays > maximumDurationDays) {
      throw new errors.InvalidInput({
        message:
          'The watchlist duration exceeds the maximum number of ' +
          maximumDurationDays +
          ' days set for your organization.',
        data: {
          startDateTime: formatDate(startDateTime),
          stopDateTime: formatDate(stopDateTime),
          maximumDurationDays,
          watchlistDurationDays: durationDays
        }
      });
    }

    // if both min start date and max start age days are
    // defined, we take the most recent of the two as the limit.
    // otherwise if only maximumStartAgeDays is defined, compute the
    // earliest start date from there.
    if (maximumStartAgeDays) {
      const minDateComputed =
        Date.now() - maximumStartAgeDays * 24 * 60 * 60 * 1000;
      if (minimumStartDate) {
        const minStartDateMillis = new Date(minimumStartDate).getTime();
        if (minStartDateMillis < minDateComputed) {
          minimumStartDate = minDateComputed;
        }
      } else {
        minimumStartDate = minDateComputed;
      }
    }

    // if a minimum start date is defined by either method,
    // check it here.
    if (minimumStartDate) {
      const minStartDateMillis = new Date(minimumStartDate).getTime();

      if (startDateTime < minStartDateMillis) {
        throw new errors.InvalidInput({
          message:
            'The watchlist start date is earlier than the earliest allowed for your organization.',
          data: {
            startDateTime: formatDate(startDateTime),
            stopDateTime: formatDate(stopDateTime),
            minimumStartDate: formatDate(minimumStartDate),
            maximumDurationDays,
            watchlistDurationDays: durationDays
          }
        });
      }
    }
  }

  function formatDate(num) {
    return moment(num).toISOString();
  }

  async function createWatchlist(args, context) {
    const input = args.input;
    const createdWatchlists = await bulkCreateWatchlists(
      {
        applicationId: args.applicationId,
        organizationId: args.organizationId,
        input: {
          watchlists: [input]
        }
      },
      context
    );

    if (_.isNil(createdWatchlists) || _.isEmpty(createdWatchlists.records)) {
      throw new errors.InternalServerError({
        message: 'Create watchlist failed'
      });
    }

    return _.head(createdWatchlists.records);
  }

  async function bulkCreateWatchlists(args, context) {
    const { input } = args;
    const requestorOrganizationId =
      args.organizationId ||
      _.get(context, '_authInfo.organization.organizationId');
    const requestorApplicationId =
      args.applicationId || _.first(_.get(context, '_authInfo.applications'));

    if (_.isNil(input) || _.isEmpty(input.watchlists)) {
      throw new errors.InvalidInput({
        message: 'Array Watchlist could not be empty.',
        data: {
          watchlists: input.watchlists
        }
      });
    }

    const mapWatchlistById = {};
    const createdWatchlists = [];

    try {
      // Validate start/stop datetime of the watchlists
      for (const watchlist of input.watchlists) {
        const startDateTime = watchlist.startDateTime || moment().valueOf();
        const stopDateTime = watchlist.stopDateTime;

        dalUtil.verifyRealisticTime(startDateTime / 1000, 'startDateTime');
        dalUtil.verifyRealisticTime(stopDateTime / 1000, 'stopDateTime');
        await checkWatchlistRange(startDateTime, stopDateTime, context);

        if (watchlist.parentFolderId) {
          checkId(watchlist.parentFolderId, 'parentFolderId');
          // validates access to the parent folder.
          await serviceContext.dal.folder.getFolder(context, {
            organizationId: requestorOrganizationId,
            id: watchlist.parentFolderId
          });
        }
      }

      await dbConnections['media_platform'].write.tx(
        'createWatchlistInBulk',
        async (trans) => {
          await Promise.all(
            input.watchlists.map(async (watchlist) => {
              const details = watchlist.details || {};
              let programIds;
              let trackAll = false;

              if (details.programIds) {
                programIds = details.programIds;
                // programIds does not save into details,
                // it would be saved into relate table tracking_unit_program
                details.programIds = null;
              } else {
                trackAll = true;
              }

              const newWatchlist = await insertWatchlistDb(
                context,
                {
                  watchlist,
                  details,
                  trackAll,
                  organizationId: requestorOrganizationId,
                  applicationId: requestorApplicationId
                },
                trans
              );
              const csps = await createCSPs(
                context,
                watchlist,
                newWatchlist.id,
                false,
                trans
              );

              if (programIds) {
                await saveProgramIds(
                  context,
                  newWatchlist.id,
                  programIds,
                  trans
                );
              }

              if (watchlist.sourceIds) {
                await saveSourceIds(
                  context,
                  newWatchlist.id,
                  watchlist.sourceIds,
                  trans
                );
              }

              mapWatchlistById[newWatchlist.id] = {
                inputWatchlist: watchlist,
                insertedWatchlist: newWatchlist,
                csps,
                programIds,
                marketIds: details.marketIds
              };
            })
          );
        }
      );

      // Now new to create subscriptions,
      // file the new watchlists in parent folders if specified,
      // and trigger events. And then push to results
      await Promise.all(
        Object.keys(mapWatchlistById).map(async (watchlistId) => {
          const {
            inputWatchlist,
            insertedWatchlist,
            csps,
            programIds,
            marketIds
          } = mapWatchlistById[watchlistId];

          if (
            inputWatchlist.subscriptions &&
            inputWatchlist.subscriptions.length
          ) {
            inputWatchlist.subscriptions.forEach((sub) => {
              sub.targetId = insertedWatchlist.id;
              sub.organizationId = requestorOrganizationId;
            });
            await createSubscriptions(context, inputWatchlist.subscriptions);
          }

          if (inputWatchlist.parentFolderId) {
            await serviceContext.dal.folder.fileObject(
              context,
              requestorOrganizationId,
              inputWatchlist.parentFolderId,
              insertedWatchlist.id,
              serviceContext.dal.folder.TREE_OBJECT_TYPE.WATCHLIST,
              inputWatchlist.orderIndex
            );
          }

          const hasProgramIds = programIds && programIds.length;

          // await added since it's needed to ensure the event emission.
          await emitNewWatchlistEvent(
            context,
            insertedWatchlist,
            Object.assign(
              {
                marketIds: marketIds,
                programIds: programIds,
                sourceIds: inputWatchlist.sourceIds,
                newCsps: csps,
                isRegenerateRequested: true,
                trackAll:
                  (inputWatchlist.searchIndex === 'mine' ? false : true) ||
                  !hasProgramIds
              },
              insertedWatchlist
            ),
            null,
            eventsMap.WatchListCreated
          );
          createdWatchlists.push(insertedWatchlist);
        })
      );

      return mainUtil.toPage(
        { offset: 0, limit: createdWatchlists.length },
        createdWatchlists
      );
    } catch (error) {
      // log for the case where some watchlists were created but not all.
      logger.error("bulkCreateWatchlists error:", error);
      
      await emitNewWatchlistEvent(
        context,
        { errorMessage: error.message },
        null,
        null,
        eventsMap.WatchListCreated,
        error
      );

      // only throw the error if no watchlists were created.
      // If some watchlists were created (via bulkCreateWatchlists),
      // return those and log the error.
      if (_.isEmpty(createdWatchlists)) {
        throw error;
      }

      return mainUtil.toPage(
        { offset: 0, limit: createdWatchlists.length },
        createdWatchlists
      );
    }
  }

  async function insertWatchlistDb(context, options, dbClient) {
    const client = _.isObject(dbClient)
      ? dbClient
      : dbConnections['media_platform'].write;
    const { watchlist, details, trackAll } = options;
    const requestorOrganizationId =
      options.organizationId ||
      _.get(context, '_authInfo.organization.organizationId');
    const requestorApplicationId =
      options.applicationId ||
      _.first(_.get(context, '_authInfo.applications'));
    const trackingUnitType = knownTrackingUnitTypes[watchlist.watchlistType]
      ? watchlist.watchlistType
      : 'tracking';
    // DB will throw if a non-integer source type ID is provided.
    // so we'll pre-validate here.
    const sourceInfo = await mapSourceTypeIds(watchlist);
    const sql = `
      INSERT INTO tracking_unit (
        tracking_unit_name,
        tracking_unit_start_date,
        tracking_unit_stop_date,
        organization_id,
        application_id,
        tracking_unit_type,
        media_source_type_id,
        media_source_type_ids,
        tracking_unit_details,
        target_audience,
        track_all,
        track_my_programs,
        enable_expiration_notification
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING ${watchlistSelect}
    `;
    const sqlArgs = [
      watchlist.name,
      watchlist.startDateTime
        ? new Date(watchlist.startDateTime)
        : new Date(Date.now()),
      new Date(watchlist.stopDateTime),
      requestorOrganizationId,
      requestorApplicationId,
      trackingUnitType,
      sourceInfo.stId,
      sourceInfo.stIds,
      JSON.stringify(details),
      // duplicate targetAudience on the target_audience column
      details.targetAudience ? JSON.stringify(details.targetAudience) : '{}',
      trackAll,
      // searchIndex is an enum but, for now, lives in a boolean column.
      // map values here. true = mine, false = global.
      await convertSearchIndex(context, watchlist),
      watchlist.enableExpirationNotification
    ];
    const dbResults = await client.map(sql, sqlArgs, mapper.mapWatchlist);

    return _.first(dbResults);
  }

  function toString(val) {
    if (_.isNil(val)) return val;
    if (_.isArray(val)) return val.map((id) => _.toString(id));
    return _.toString(val);
  }

  async function emitNewWatchlistEvent(
    context, // 1. ctx
    watchlist, // 2. watchlist
    data, // 3. data
    oldWatchlist, // 4. oldWatchlist
    eventTypeInfo, // 5. eventTypeInfo
    error = null // 6. error
  ) {    
    let describe = ''
    if (eventTypeInfo.action === 'create') {
      describe = !error ? `Created watchlist ${watchlist?.name}` : `Failed to create watchlist ${watchlist?.name}`
    } else if (eventTypeInfo.action === 'update') {
      describe = !error ? `Updated watchlist ${watchlist?.name}` : `Failed to update watchlist ${watchlist?.name}`
    }
    // public event
    try {
      const event = {
        trackingUnitId: toString(watchlist.id),
        organizationId: watchlist.organizationId,
        // actionInfo
        actionInfo: messageUtil.buildActionInfo(
          watchlist.id,
          error,
          eventTypeInfo.action,
          !error ? 'success' : 'failure',
          describe,
        )
      };
      await messageUtil.emitPublicEvent(
        supportedEvents[eventTypeInfo.name],
        'system',
        context,
        event
      );      
    } catch (error) {
      logger.warn(`Failed to emit public watchlist event: ${error.message}`);
    }

    // If watchlist has no valid id, we can only emit the public event above.
    // Skip the internal event emission that requires a real watchlist id.
    if (!watchlist || !watchlist.id) {
      logger.warn('emitNewWatchlistEvent: skipping internal event — watchlist has no id');
      return;
    }

    try {
      data = data || {};
      oldWatchlist = oldWatchlist || {};
      await serviceContext.redisCache.markCacheDirty(trackingUnitDBChangedKey);
      /*
      "trackingUnitId":           params.TrackingUnitId,
      "oldTrackingUnitStartDate": originalTrackingUnit.StartDate,
      "oldTrackingUnitStopDate":  originalTrackingUnit.StopDate,
      "oldProgramIds":            oldProgramIds,
      "newTrackingUnitStartDate": trackingUnit.StartDate,
      "newTrackingUnitStopDate":  trackingUnit.StopDate,
      "newProgramIds":            newProgramIds,
      "marketIds":                marketIds,
      "mediaSourceIds":           mediaSourceIds,
      "trackAll":                 trackingUnit.TrackAll,
      "newMediaSourceTypeIds":    newMediaSourceTypeIds,
      "oldMediaSourceTypeIds":    oldMediaSourceTypeIds,
      "isRegenerateRequested":    isRegenerateRequested,
      "includeGlobal":            includeGlobal,
      "applicationId":            applicationId,
      "acls":                     groupIds,
      "newCognitiveProfiles":     trackingUnit.CognitiveProfiles,
      "oldCognitiveProfiles":     originalTrackingUnit.CognitiveProfiles,
      "newTrackingUnitStateLookupId": trackingUnit.TrackingUnitStateLookupId,
      "oldTrackingUnitStateLookupId": originalTrackingUnit.TrackingUnitStateLookupId,
      "userToken":                trackingUnit.UserToken,*/
      let includeGlobal = true;
      if (
        data.sourceTypeIds &&
        data.sourceTypeIds.length === 1 &&
        data.sourceTypeIds[0] === 5
      ) {
        includeGlobal = false;
      }
      if (watchlist.searchIndex === true || watchlist.searchIndex === 'mine') {
        includeGlobal = false;
      }
      const groups = context._authInfo.groups
        ? context._authInfo.groups.map((group) => group.groupId)
        : [];

      let _oldCsps = null;
      if (oldWatchlist) _oldCsps = data.oldCsps;
      const _newCsps = data.newCsps || (watchlist && watchlist.id ? await getCognitiveSearches(watchlist) : []);

      const newCsps = _newCsps.map((csp) => {
        return {
          cognitiveProfileId: toString(csp.cognitive_profile_id),
          organizationId: toString(watchlist.organizationId),
          query: csp.query.query,
          mentionStatusId: toString(csp.mention_status_id)
        };
      });
      const oldCsps = _oldCsps
        ? _oldCsps.map((csp) => {
            return {
              cognitiveProfileId: toString(csp.cognitive_profile_id),
              organizationId: toString(watchlist.organizationId),
              query: csp.query.query,
              mentionStatusId: toString(
                csp.mention_status_id || csp.mentionStatusId
              )
            };
          })
        : undefined;
      const old = oldWatchlist || {};
      if (!old.details) old.details = {};

      // TODO mention-gen-by-tracking-unit
      // fails if trackAll is false and oldProgramIds is not sent.
      // this means that we can't change a watchlist from
      // trackall = true, programIds = [] to trackall = false, programIds = [n,n,n]
      // because in that case oldProgramIds is empty.
      let trackAll = true;
      if (_.get(data, 'programIds.length')) trackAll = false;
      // the value comes from the database column track_my_programs, where 'true' means searchIndex = 'mine'
      //if (watchlist.searchIndex === 'mine' || watchlist.searchIndex === true)
      //  trackAll = false;

      const lock = await obtainRedLockByWatchlistId(watchlist.id);
      let latestUpdateTimestamp;
      try {
        latestUpdateTimestamp = moment().utc().unix();

        await serviceContext.redisCache.asyncSet(
          watchlistLastUpdatedTimestampKey,
          watchlist.id,
          latestUpdateTimestamp
        );
      } finally {
        lock.unlock().catch(logger.error);
      }

      const userId = await resUtil.getUserIdFromAuthContext(context);
      const payload = {
        type: eventTypeInfo.type,
        event: eventTypeInfo.event,
        userToken: dalUtil.getToken(context, false),
        jwtToken: getWatchlistJWTToken(context, watchlist), // add jwtToken to avoid userToken session expired
        trackingUnitId: toString(watchlist.id),
        newTrackingUnitStopDate: watchlist.stopDateTime,
        newTrackingUnitStartDate: watchlist.startDateTime,
        oldTrackingUnitStopDate: old.stopDateTime || watchlist.stopDateTime,
        oldTrackingUnitStartDate: old.startDateTime || watchlist.startDateTime,
        newTrackingUnitStateLookupId: watchlist.stateLookupId,
        oldTrackingUnitStateLookupId: old.stateLookupId,
        newProgramIds: toString(
          data.programIds || _.get(watchlist, 'details.programIds')
        ),
        oldProgramIds: toString(data.oldProgramIds || data.programIds),
        newMediaSourceTypeIds: toString(watchlist.sourceTypeIds),
        oldMediaSourceTypeIds: toString(old.sourceTypeIds),
        newCognitiveProfiles: newCsps,
        oldCognitiveProfiles: oldCsps,
        newMediaSources: toString(data.sourceIds),
        oldMediaSources: toString(old.sourceIds || data.sourceIds),
        oldTargetAudience: _.get(old, 'details.targetAudience'),
        newTargetAudience: _.get(watchlist, 'details.targetAudience'),
        oldNielsenRadioBookSelection: _.get(
          old,
          'details.nielsenRadioBookSelection'
        ),
        newNielsenRadioBookSelection: _.get(
          watchlist,
          'details.nielsenRadioBookSelection'
        ),
        marketIds: toString(data.marketIds),
        applicationId: toString(watchlist.applicationId),
        isRegenerateRequested: _.isNil(data.isRegenerateRequested)
          ? false
          : data.isRegenerateRequested,
        trackAll: trackAll,
        acls: groups,
        includeGlobal: includeGlobal,
        organizationId: toString(watchlist.organizationId),
        trackingUnitRenamed: old.name !== watchlist.name,
        latestUpdateTimestamp,
        userId,
        newUsingSmallMarket: _.get(data, 'usingSmallMarket', false),
        oldUsingSmallMarket: _.get(old, 'details.usingSmallMarket', false)
      };

      await messageUtil.emitEvent(payload, messageUtil.topics('EVENTS'));
      return payload;
    } catch (err) {
      // message will be replayed ts-messaging automatically
      serviceContext.logger.warn(err);
    }
  }

  async function createDeletedWatchlistEvent(context, watchlist) {
    // context
    await serviceContext.redisCache.markCacheDirty(trackingUnitDBChangedKey);

    try {
      // get payload for the event
      const payload = _getPayloadForDeletedWatchlistEvent(context, watchlist);

      await messageUtil.emitEvent(payload, messageUtil.topics('EVENTS'));
    } catch (err) {
      // message will be replayed ts-messaging automatically
      serviceContext.logger.warn(err);
    }
  }

  function _getPayloadForDeletedWatchlistEvent(context, watchlist) {
    if (!watchlist) {
      throw new InvalidInput({
        message: 'Missing watchlist info.',
        data: {
          field: 'watchlist'
        }
      });
    }

    // context
    const userId =
      _.get(context, 'requestContext.userInfo.userId') ||
      _.get(context, 'requestContext.tokenInfo.userId');
    const requestId = _.get(context, 'requestInfo.requestId');
    const correlationId = _.get(context, 'requestInfo.correlationId');

    return {
      type: 'watchlist',
      event: 'watchlist_deleted',
      trackingUnitId: _.toString(watchlist.id),
      trackingUnitName: _.toString(watchlist.name),
      organizationId: _.toString(watchlist.organizationId),
      applicationId: _.toString(watchlist.applicationId),
      userId,
      requestId,
      correlationId
    };
  }

  async function fileWatchlist(args, context) {
    const input = args.input;
    checkId(input.watchlistId, 'watchlistId');
    // get the watchlist to validate user access
    const watchlist = await getWatchlist(
      {
        id: input.watchlistId,
        organizationId: input.organizationId
      },
      context
    );
    // now file. dalFolder.fileObject will validate folder access.
    const filed = await serviceContext.dal.folder.fileObject(
      context,
      input.organizationId,
      input.folderId,
      input.watchlistId,
      serviceContext.dal.folder.TREE_OBJECT_TYPE.WATCHLIST,
      input.orderIndex
    );
    // return the watchlist
    return watchlist;
  }

  async function unfileWatchlist(args, context) {
    checkId(args.input.watchlistId, 'watchlistId');
    await serviceContext.dal.folder.unfileObject(context, {
      input: {
        objectId: args.input.watchlistId,
        organizationId: args.input.organizationId,
        folderId: args.input.folderId
      }
    });

    return getWatchlist({
      id: args.input.watchlistId,
      organizationId: args.input.organizationId
    });
  }

  async function updateWatchlist(args, context) {
    try {
      const input = args.input;
      checkId(input.id);

      const setClause = [];
      const setArgs = [];
      const whereClause = [];

      // this will fail cleanly if watchlist doesn't exist or is inaccessible
      const oldWl = await getWatchlist(
        {
          id: input.id,
          organizationId: input.organizationId
        },
        context
      );
      const oldWlDetails = await populateDetails(oldWl);

      if (input.startDateTime) {
        dalUtil.verifyRealisticTime(
          input.startDateTime / 1000,
          'startDateTime'
        );
        setArgs.push(new Date(input.startDateTime));
        setClause.push(` tracking_unit_start_date = \$${setArgs.length}`);
      }

      if (input.stopDateTime) {
        dalUtil.verifyRealisticTime(input.stopDateTime / 1000, 'stopDateTime');
        setArgs.push(new Date(input.stopDateTime));
        setClause.push(` tracking_unit_stop_date = \$${setArgs.length}`);
      }

      // verify start/stop date fall within allowed bounds
      if (input.startDateTime || input.stopDateTime) {
        const startDateTime = input.startDateTime || oldWl.startDateTime;
        const stopDateTime = input.stopDateTime || oldWl.stopDateTime;
        // don't re-verify range if user isn't actually changing dates.
        if (
          moment(startDateTime).unix() !== moment(oldWl.startDateTime).unix() ||
          moment(stopDateTime).unix() !== moment(oldWl.stopDateTime).unix()
        ) {
          await checkWatchlistRange(startDateTime, stopDateTime, context);
        }
      }

      if (input.sourceTypeIds) {
        const sourceInfo = await mapSourceTypeIds(input);
        setArgs.push(sourceInfo.stIds);
        setClause.push(` media_source_type_ids = \$${setArgs.length}`);
        setArgs.push(sourceInfo.stId);
        setClause.push(` media_source_type_id = \$${setArgs.length}`);
      }
      if (input.name) {
        setArgs.push(input.name);
        setClause.push(` tracking_unit_name = \$${setArgs.length}`);
      }
      if (input.searchIndex) {
        const val = await convertSearchIndex(context, input);
        setArgs.push(val);
        setClause.push(` track_my_programs = \$${setArgs.length}`);
      }
      if (!_.isNil(input.isDisabled)) {
        const val =
          input.isDisabled === true ? 4 /* INACTIVE */ : 1; /* COMPLETE */
        setArgs.push(val);
        setClause.push(` tracking_unit_state_lookup_id = \$${setArgs.length}`);
      }

      if (!_.isNil(input.enableExpirationNotification)) {
        setArgs.push(input.enableExpirationNotification);
        setClause.push(` enable_expiration_notification = \$${setArgs.length}`);
      }

      let programIds = _.get(
        input,
        'details.programIds',
        oldWlDetails.programIds
      );
      let marketIds;
      // see notes under createWatchlist about this field
      if (input.details) {
        if (input.details.marketIds && input.details.marketIds.length) {
          marketIds = input.details.marketIds;
        }

        // Rewrite old marketIds into details json in case the input.details.marketIds is null/undefined,
        // since marketIds is only written in this field.
        input.details.marketIds = marketIds || oldWlDetails.marketIds;

        // usingSmallMarket will using old data if input.details.usingSmallMarket is null/undefined
        input.details.usingSmallMarket = _.isNil(input.details.usingSmallMarket)
          ? oldWlDetails.usingSmallMarket
          : input.details.usingSmallMarket;

        if (input.details.targetAudience) {
          setArgs.push(JSON.stringify(input.details.targetAudience));
          setClause.push(` target_audience = \$${setArgs.length}::JSONB`);
        }
        if (input.details.programIds) {
          // do not write programIds into details json so that there is only
          // one place for them in db
          input.details.programIds = null;
        }

        const trackAll = programIds.length ? false : true;
        setArgs.push(trackAll);
        setClause.push(` track_all = \$${setArgs.length} `);
        setArgs.push(JSON.stringify(input.details));
        setClause.push(` tracking_unit_details = \$${setArgs.length}::JSONB`);
      }

      setArgs.push(input.id);
      whereClause.push(`tracking_unit_id = \$${setArgs.length}`);

      setArgs.push(input.organizationId);
      whereClause.push(`organization_id = \$${setArgs.length}`);

      const whereClauseStr = whereClause.join(` AND `);
      const setClauseStr = setClause.join(`, `);

      // TODO at some point we can collapse CSP updates into this
      // SQL query so there's just one. we'll still need separate queries
      // for subscriptions (different db) and
      const sql = `
        UPDATE tracking_unit
        SET
          ${setClauseStr}
        WHERE
          ${whereClauseStr}
        RETURNING
          ${watchlistSelect}
      `;
      // populate and save the previous watchlist data
      let oldCsps = null;
      let newCsps = null;
      let watchlist = null;
      await dbConnections['media_platform'].write.tx(
        'updateWatchlist',
        async (trans) => {
          // VTN-36820:
          //trans.query('SELECT pg_advisory_xact_lock(123456);');
          // only send update query if direct watchlist fields were updated
          if (setClause.length) {
            const res = await trans.map(sql, setArgs, mapper.mapWatchlist);
            if (!res.length) {
              throw new errors.NotFound({
                data: {
                  objectId: input.id,
                  objectType: 'Watchlist'
                }
              });
            }
            // reset returned object if we updated it
            watchlist = res[0];
          }

          if (!_.isEmpty(programIds) || !_.isEmpty(oldWlDetails.programIds)) {
            const isEqual = _.isEqual(
              _.sortBy(programIds || []),
              _.sortBy(oldWlDetails.programIds || [])
            );

            if (!isEqual) {
              await saveProgramIds(context, input.id, programIds, trans);
            }
          }

          if (watchlist) {
            watchlist.details = await populateDetails(watchlist);
          }

          if (input.sourceIds || !_.isEmpty(oldWl.sourceIds)) {
            await saveSourceIds(
              context,
              input.id,
              input.sourceIds || [],
              trans
            );
          }

          // move watchlist if necessary
          if (input.parentFolderId) {
            // first find current parent folder
            const folder = await serviceContext.dal.folder.getParentFolder(
              context,
              input.id,
              input.organizationId,
              false,
              'watchlist'
            );
            // if parent folder isn't really changing, don't bother moving watchlist.
            // this avoids an unnecessary heavyweight write query.
            if (
              !folder ||
              (folder.objectId !== input.parentFolderId &&
                folder.treeObjectId !== input.parentFolderId)
            ) {
              const moveArgs = {
                parentFolderId: input.parentFolderId,
                organizationId: input.organizationId
              };

              const moved = await serviceContext.dal.folder.moveWatchlist(
                context,
                moveArgs,
                oldWl
              );
            }
          }

          if (input.cognitiveSearches) {
            oldCsps = await getCognitiveSearches(oldWl);
            newCsps = await createCSPs(context, input, input.id, true, trans);
          }
          // VTN-36820
          // trans.query(
          //   'REFRESH MATERIALIZED VIEW _view_program_to_tracking_unit;'
          // );
        }
      );

      if (input.subscriptions) {
        input.subscriptions.forEach((sub) => (sub.targetId = input.id));
        input.subscriptions.forEach(
          (sub) => (sub.organizationId = input.organizationId)
        );

        const subRes = await createSubscriptions(
          context,
          input.subscriptions,
          true,
          input.id
        );
      }

      if (watchlist) {
        // submit a mention-gen job
        const triggerData = {
          marketIds: marketIds,
          programIds: programIds,
          oldProgramIds: oldWlDetails.programIds,
          sourceIds: input.sourceIds,
          oldCsps: oldCsps,
          newCsps: newCsps,
          isRegenerateRequested: input.regenerateExistingMentions,
          usingSmallMarket: _.get(input, 'details.usingSmallMarket')
        };
        // we need to await here because the function gathers some data from
        // the db before emitting the event.
        const triggerRes = await emitNewWatchlistEvent(
          context,
          watchlist,
          triggerData,
          oldWl,
          eventsMap.WatchListUpdated
        );
      }

      // refresh to make sure all the various fields are current
      const res = await getWatchlist(
        {
          id: input.id,
          organizationId: input.organizationId
        },
        context
      );
      return res;
    } catch (err) {
      _emitPublicEventWatchlistUpdated(context, args, err);
      throw err;
    }
  }

  async function deleteWatchlist(args, context) {
    checkId(args.id);
    const sql = `
    DELETE FROM cognitive_profile cp
      USING tracking_unit tu
    WHERE tu.tracking_unit_id = cp.tracking_unit_id
      AND tu.organization_id = $2
      AND cp.tracking_unit_id = $1
    RETURNING cognitive_profile_id;

    DELETE FROM tracking_unit_program
    WHERE
      tracking_unit_id = $1
    RETURNING program_id AS tracking_unit_program_link_id;

    DELETE FROM tracking_unit_market
    WHERE
      tracking_unit_id = $1;

    DELETE FROM tracking_unit_media_source
    WHERE
      tracking_unit_id = $1
    RETURNING media_source_id AS tracking_unit_media_source_link_id;

    WITH commentids AS (
      DELETE FROM  mention__comment
      WHERE mention_id in
      (
        SELECT mention_id
        FROM mention
        WHERE tracking_unit_id = $1
      )
      RETURNING comment_id
    )
    DELETE FROM comment WHERE comment_id IN (SELECT comment_id FROM commentids)
    RETURNING comment_id;

    WITH ratingids AS (
      DELETE FROM  mention__rating
      WHERE mention_id in
      (
        SELECT mention_id
        FROM mention
        WHERE tracking_unit_id = $1
      )
      RETURNING rating_id
    )
    DELETE FROM rating WHERE rating_id IN (SELECT rating_id FROM ratingids)
    RETURNING rating_id;
    
    --- Delete foreign key constraint "_fk_mention__mention__folder" on table "folder__mention"
    DELETE FROM folder__mention
    WHERE mention_id IN (
        SELECT mention_id FROM mention
        WHERE
        tracking_unit_id = $1);
    
    --- Update the watchlist state to DELETED
    UPDATE 	tracking_unit 
    SET 	  tracking_unit_state_lookup_id = $3
    where 	tracking_unit_id = $1
      and organization_id = $2
    returning tracking_unit_id, tracking_unit_name, application_id;
    `;
    const sqlArgs = [
      args.id,
      args.organizationId,
      trackingUnitStateLookup.DELETED
    ];

    let res;
    try {
      res = await dbConnections['media_platform'].write.query(sql, sqlArgs);
    } catch (err) {
      if (_.get(err, 'message', '').includes('deadlock')) {
        // retry on a deadlock. since sprint-2018.04.30 we sometimes
        // see deadlock errors on this query, possible due to the
        // tracking_unit_program materialized view or some other database
        // change. We can work around with a retry after slight pause.
        logger.warn(
          `Deadlock detected on watchlist delete for ${args.id}. retrying (once).`
        );
        await mainUtil.sleep(2000); // wait 2s
        res = await dbConnections['media_platform'].write.query(sql, sqlArgs);
      } else throw err;
    }

    // call dalFolder.unfileObject function
    try {
      await dalFolder.unfileObject(
        context,
        {
          input: {
            objectId: args.id.toString(),
            organizationId: args.organizationId
          }
        },
        'Watchlist'
      );
    } catch (ex) {
      // unfile object throws if the object is not filed anywhere
      if (ex.name !== 'not_found') {
        logger.error(
          `(unfileObject) failed to infile watchlist ${args.id}. Error: ${ex}`
        );
        throw ex;
      }
    }

    let csps = [];
    let mentionComments = [];
    let mentionRatings = [];
    const deletedWatchlistEventInput = {
      id: args.id,
      name: null,
      applicationId: null,
      organizationId: args.organizationId
    };

    res.forEach((row) => {
      if (row.cognitive_profile_id) csps.push(row.cognitive_profile_id);
      if (row.comment_id) mentionComments.push(row.comment_id);
      if (row.rating_id) mentionRatings.push(row.rating_id);

      if (row.tracking_unit_id) {
        deletedWatchlistEventInput.id = row.tracking_unit_id;
      }
      if (row.tracking_unit_name) {
        deletedWatchlistEventInput.name = row.tracking_unit_name;
      }
      if (row.application_id) {
        deletedWatchlistEventInput.applicationId = row.application_id;
      }
    });
    const subDel = await deleteWatchlistSubscriptions(args, context);

    // emit mentions deleted event
    serviceContext.dal.mention.emitMentionDeletedInBulkEvent(
      null,
      deletedWatchlistEventInput.id
    );

    createDeletedWatchlistEvent(context, deletedWatchlistEventInput);

    return {
      id: args.id,
      message:
        'Watchlist deleted along with ' +
        subDel.length +
        ' subscriptions, ' +
        csps.length +
        ' cognitive search profiles, ' +
        mentionComments.length +
        ' mention comments, and ' +
        mentionRatings.length +
        ' mention ratings.'
    };
  }

  const watchlistOrderMap = {
    createdDateTime: 'creation_date',
    modifiedDateTime: 'last_updated_date',
    stopDateTime: 'tracking_unit_stop_date',
    startDateTime: 'tracking_unit_start_date',
    name: 'tracking_unit_name'
  };

  async function getWatchlists(args, context) {
    try {
      let sql = `
      SELECT
        ${watchlistSelect}
      FROM
        tracking_unit
          `;
      const sqlWhere = [];
      const sqlArgs = [];

      mainUtil.addSqlWhere(
        'organization_id',
        args.organizationId,
        sqlWhere,
        sqlArgs
      );
      mainUtil.addSqlWhere('tracking_unit_id', args.id, sqlWhere, sqlArgs);
      mainUtil.addSqlWhere('tracking_unit_id', args.ids, sqlWhere, sqlArgs);
      mainUtil.addSqlWhere('tracking_unit_type', args.type, sqlWhere, sqlArgs);
      mainUtil.addSqlWhere(
        'tracking_unit_start_date',
        args.minStartDateTime,
        sqlWhere,
        '>'
      );
      mainUtil.addSqlWhere(
        'tracking_unit_start_date',
        args.maxStartDateTime,
        sqlWhere,
        '<'
      );
      mainUtil.addSqlWhere(
        'tracking_unit_stop_date',
        args.minStopDateTime,
        sqlWhere,
        '>'
      );
      mainUtil.addSqlWhere(
        'tracking_unit_stop_date',
        args.maxStopDateTime,
        sqlWhere,
        '<'
      );

      if (args.name) {
        args.names = [args.name];
        args.nameMatch = 'contains';
      }

      if (Array.isArray(args.names)) {
        mainUtil.addTextMatchFilters(
          'tracking_unit_name',
          args.names,
          args.nameMatch,
          sqlWhere,
          sqlArgs
        );
      }

      // depending on the isDisabled filter, we might exclude other state values
      if (args.isDisabled === true) {
        // returne only state = disabled
        sqlWhere.push(`tracking_unit_state_lookup_id = 4`);
      } else if (args.isDisabled === false) {
        // return only state is null and state is not 3, 4 (deleted, disabled)
        sqlWhere.push(
          `(tracking_unit_state_lookup_id IS NULL OR tracking_unit_state_lookup_id NOT IN (3, 4))`
        );
      } else {
        // return any not deleted
        sqlWhere.push(
          `(tracking_unit_state_lookup_id IS NULL OR tracking_unit_state_lookup_id != 3)`
        );
      }

      if (sqlWhere.length) {
        sql += ' WHERE ' + sqlWhere.join(' AND ');
      }

      if (args.orderBy) {
        const orderBy = watchlistOrderMap[args.orderBy] || args.orderBy;
        sqlArgs.push(orderBy);
        sql += ` ORDER BY ${orderBy}`;
        if (args.orderDirection) {
          sql += ` ${args.orderDirection}`;
        }
      }

      if (!args.hasOffset) {
        if (args.offset) {
          sqlArgs.push(args.offset);
          sql += ` OFFSET \$${sqlArgs.length}`;
        }
        if (args.limit) {
          sqlArgs.push(args.limit);
          sql += ` LIMIT \$${sqlArgs.length}`;
        }
      }
      const res = await dbConnections['media_platform'].read.map(
        sql,
        sqlArgs,
        mapper.mapWatchlist
      );
      const result = mainUtil.toPage(args, res);

      // emit event for accessing media
      _emitPublicEventAccessMedia(
        context,
        _.get(result, 'records'),
        'watchlist'
      );

      return result;
    } catch (err) {
      _emitPublicEventAccessMedia(
        context,
        { ...args, status: 'failure' },
        'watchlist',
        err
      );
      throw err;
    }
  }

  async function getWatchlist(args, context) {
    try {
      checkId(args.id);
      const res = await getWatchlists(args, context);
      if (res.count > 0) {
        return res.records[0];
      } else {
        throw new NotFound({
          data: {
            objectId: args.id,
            objectType: 'Watchlist'
          }
        });
      }
    } catch (err) {
      _emitPublicEventAccessMedia(
        context,
        { ...args, status: 'failure' },
        'watchlist',
        err
      );
      throw err;
    }
  }

  async function getMentionStatusOptions(args, context) {
    const sql = `
SELECT
  mention_status_id AS id,
  mention_status_name AS name
FROM
  mention_status
ORDER BY
  mention_status_name
    `;
    return await dbConnections['media_platform'].read.any(sql);
  }

  async function getMentionStatusOption(args) {
    checkId(args.id);
    const sql = `
SELECT
  mention_status_id AS id,
  mention_status_name AS name
FROM
  mention_status
WHERE
  mention_status_id = $1
ORDER BY
  mention_status_name
    `;
    return await dbConnections['media_platform'].read.one(sql, [args.id]);
  }

  function getFrequencyMap() {
    // TODO read this from DB and inject enum dynamically into schema
    return {
      fromKey: {
        immediate: 1,
        daily: 2,
        weekly: 3,
        never: 4
      },
      toKey: {
        1: 'immediate',
        2: 'daily',
        3: 'weekly',
        4: 'never'
      }
    };
  }

  function getObjectTypeMap() {
    return {
      fromKey: {
        mention: 1
      },
      toKey: {
        1: 'mention'
      }
    };
  }

  function getDayOfWeekMap() {
    return {
      fromKey: {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6
      },
      toKey: {
        0: 'Sunday',
        1: 'Monday',
        2: 'Tuesday',
        3: 'Wednesday',
        4: 'Thursday',
        5: 'Friday',
        6: 'Saturday'
      }
    };
  }

  const subscriptionSelect = `
  subscription_id AS id,
  organization_id,
  date_created AS created_date_time,
  date_modified AS modified_date_time,
  object_type_id,
  (subscription_data->'tracking_unit_id') AS target_id,
  scheduled_time,
  scheduled_time_zone,
  scheduled_day,
  subscription_data AS jsondata,
  is_active,
  user_id,
  email_address,
  mobile_number,
  web_hook_url,
  frequency_id
`;

  async function getWatchlistSubscriptions(args, watchlist) {
    if (args.id) checkId(args.id);
    const watchlistClause = watchlist
      ? `(subscription_data->>'tracking_unit_id')::TEXT = $1 AND `
      : '';
    const idClause = args.id ? `subscription_id = $3 AND ` : '';
    const sql = `
SELECT
  ${subscriptionSelect}
FROM
  subscription
WHERE
  ${watchlistClause}
  ${idClause}
  organization_id = $2
ORDER BY date_created
    `;
    const wlId = watchlist ? _.toString(watchlist.id) : null;
    const orgId = watchlist ? watchlist.organizationId : args.organizationId;
    const sqlArgs = [wlId, orgId, args.id];

    return await dbConnections.subscription.read.map(
      sql,
      sqlArgs,
      mapper.mapSubscription
    );
  }

  async function deleteWatchlistSubscriptions(args, context) {
    const sql = `
      DELETE FROM
        subscription
      WHERE
        organization_id = $1 AND
        (subscription_data->>'tracking_unit_id')::TEXT = $2
      RETURNING subscription_id
    `;
    const sqlArgs = [args.organizationId, args.id];
    return await dbConnections.subscription.write.query(sql, sqlArgs);
  }

  async function getSubscription(args) {
    checkId(args.id);
    const res = await getWatchlistSubscriptions(args, null);
    if (!res.length) {
      throw new NotFound({
        data: {
          objectType: 'Subscription',
          objectId: args.id
        }
      });
    }
    return res[0];
  }

  const jwtSchemas = {
    subscription: {
      options: {
        algorithm: 'RS256',
        issuer: 'veritone:discovery',
        subject: 'unsubscribe'
      },
      publicKey: fs.readFileSync('./keys/subscription.key.pub'),
      privateKey: fs.readFileSync('./keys/subscription.key'),
      payload: {
        trackingUnit: 'tracking_unit_id',
        emailAddress: 'email_address'
      }
    },
    watchlist: {
      options: {
        expiresIn: _.get(serviceContext, 'config.jwt.ttl', '7d'),
        jwtid: uuidv4(),
        subject: 'engine-run'
      },
      secret: _.get(serviceContext, 'config.jwt.secret'),
      payload: {}
    }
  };
  const jwtService = require('./jwt.js')(jwtSchemas['subscription']);
  const jwtWatchlist = require('./jwt.js')(jwtSchemas['watchlist']);

  function getUnsubscribeHash(input) {
    const jwtPayload = jwtSchemas['subscription'].payload;
    jwtPayload.tracking_unit_id = input.targetId;
    jwtPayload.email_address = input.contact.emailAddress || null;
    return jwtService.sign(jwtPayload);
  }

  async function createSubscription(context, args) {
    const inputs = [args.input];
    return await createSubscriptions(context, inputs);
  }
  function genUpdateSubscriptionQuery(context, input, userId, index = 0) {
    checkId(input.targetId, 'targetId');

    if (_.isNil(userId)) {
      throw new errors.NotAllowed({
        message: 'user context is required when creating subscription'
      });
    }

    // TODO get email
    // const userData = await serviceContext.dal.shared.getUser({id: userId});
    let userEmail = input.contact.emailAddress; // TODO or...

    const json = {
      tracking_unit_id: input.targetId,
      creator_email: userEmail,
      unsubscribe_hash: getUnsubscribeHash(input)
    };
    // TODO creator email
    const sql = `
    UPDATE
      subscription
    SET
      organization_id = \$${index + 1},
      user_id = \$${index + 2},
      mobile_number = \$${index + 4},
      web_hook_url = \$${index + 5},
      object_type_id = \$${index + 6},
      frequency_id =  \$${index + 7},
      subscription_data =  \$${index + 8},
      scheduled_time = \$${index + 9},
      scheduled_time_zone = \$${index + 10},
      scheduled_day =  \$${index + 11}
    WHERE
    (subscription_data->>'tracking_unit_id')::TEXT = \$${index + 12}
     AND email_address = \$${index + 3}
     RETURNING ${subscriptionSelect}
    `;
    let zone = input.scheduledTimeZone;
    // validate input
    if (zone) {
      zone = mainUtil.getTimeZoneName(zone);
      if (!zone) {
        throw new InvalidInput({
          message:
            'The value provided for scheduledTimeZone was not valid. Make ' +
            'sure that it represents a valid time zone in offset (-0800),' +
            'abbreviated ("PST"), or full ("America/Los_Angeles") format',
          data: {
            field: 'scheduledTimeZone',
            value: input.scheduledTimeZone
          }
        });
      }
    }
    const time = mainUtil.timeOnlyToUTCString(input.scheduledTime);
    const values = [
      input.organizationId,
      userId,
      input.contact.emailAddress,
      input.contact.phoneNumber,
      input.contact.webhookUri,
      getObjectTypeMap().fromKey[input.objectType],
      getFrequencyMap().fromKey[input.frequency],
      json,
      time,
      zone,
      getDayOfWeekMap().fromKey[input.scheduledDay],
      _.toString(input.targetId)
    ];
    return { sql: sql, values: values, index: index + 12 };
  }
  function genCreateSubscriptionQuery(context, input, userId, index = 0) {
    checkId(input.targetId, 'targetId');

    if (_.isNil(userId)) {
      throw new errors.NotAllowed({
        message: 'user context is required when creating subscription'
      });
    }

    // TODO get email
    // const userData = await serviceContext.dal.shared.getUser({id: userId});
    let userEmail = input.contact.emailAddress; // TODO or...

    const json = {
      tracking_unit_id: input.targetId,
      creator_email: userEmail,
      unsubscribe_hash: getUnsubscribeHash(input)
    };

    // TODO creator email
    const sql = `
    INSERT INTO
      subscription (
        organization_id,
        user_id,
        email_address,
        mobile_number,
        web_hook_url,
        object_type_id,
        frequency_id,
        subscription_data,
        scheduled_time,
        scheduled_time_zone,
        scheduled_day
      )
     VALUES (\$${index + 1}, \$${index + 2}, \$${index + 3}, \$${
      index + 4
    }, \$${index + 5}, \$${index + 6}, \$${index + 7}, \$${index + 8}, \$${
      index + 9
    }, \$${index + 10}, \$${index + 11})
     RETURNING ${subscriptionSelect}
    `;
    let zone = input.scheduledTimeZone;

    // validate input
    if (zone) {
      zone = mainUtil.getTimeZoneName(zone);
      if (!zone) {
        throw new InvalidInput({
          message:
            'The value provided for scheduledTimeZone was not valid. Make ' +
            'sure that it represents a valid time zone in offset (-0800),' +
            'abbreviated ("PST"), or full ("America/Los_Angeles") format',
          data: {
            field: 'scheduledTimeZone',
            value: input.scheduledTimeZone
          }
        });
      }
    }
    const time = mainUtil.timeOnlyToUTCString(input.scheduledTime);
    const values = [
      input.organizationId,
      userId,
      input.contact.emailAddress,
      input.contact.phoneNumber,
      input.contact.webhookUri,
      getObjectTypeMap().fromKey[input.objectType],
      getFrequencyMap().fromKey[input.frequency],
      json,
      time,
      zone,
      getDayOfWeekMap().fromKey[input.scheduledDay]
    ];

    return { sql: sql, values: values, index: index + 11 };
  }

  async function createSubscriptions(
    context,
    inputSubs,
    clearExisting = false,
    wlId = null
  ) {
    if (clearExisting && !wlId)
      throw new Error('watchlistId must be supplied if clear existing is set');
    const queryDatas = [];
    let values = [];
    let queries = [];
    if (clearExisting && wlId) {
      //--Retrieve current subscriptions in system
      const sqlGetSubsription = `
      SELECT
        ${subscriptionSelect}
      FROM
        subscription
      WHERE
        (subscription_data->>'tracking_unit_id')::TEXT = $1
          `;
      const sqlArgs = [_.toString(wlId)];

      const existSubscription = await dbConnections.subscription.read.map(
        sqlGetSubsription,
        sqlArgs,
        mapper.mapSubscription
      );

      //--Extract Email Address
      let existEmailList = _.uniq(
        existSubscription.map((sub) => sub.emailAddress)
      );
      let inputEmailList = _.uniq(
        inputSubs.map((sub) => sub.contact.emailAddress)
      );
      let updateEmailList = _.intersection(existEmailList, inputEmailList);

      // Delete Subscription has Emaill address not in input email List
      // Build DELETE QUERY
      values.push(_.toString(wlId));
      queries.push(`
        DELETE FROM
          subscription
        WHERE
          subscription_data->>'tracking_unit_id'::TEXT = \$${values.length}
        AND
          email_address NOT IN ('${inputEmailList.join(`', '`)}')
      `);

      //--Build UPDATE QUERY
      //----Call update based on updateEmailList
      const updateSubs = _.filter(inputSubs, (v) =>
        _.includes(updateEmailList, v.contact.emailAddress)
      );
      const userIdFromContext = await resUtil.getUserIdFromAuthContext(context);
      let index2 = values.length;
      updateSubs.forEach((sub) => {
        const queryData = genUpdateSubscriptionQuery(
          context,
          sub,
          userIdFromContext,
          index2
        );
        index2 = queryData.index;
        queries.push(queryData.sql);
        values = _.concat(values, queryData.values);
      });

      //--Filter Subscription to be Inserted and return inputSubs and continue old logic
      inputSubs = _.filter(
        inputSubs,
        (v) => !_.includes(updateEmailList, v.contact.emailAddress)
      );
    } //Update Condition

    const userId = await resUtil.getUserIdFromAuthContext(context);
    let index = values.length;
    inputSubs.forEach((sub) => {
      const queryData = genCreateSubscriptionQuery(context, sub, userId, index);
      index = queryData.index;
      queries.push(queryData.sql);
      values = _.concat(values, queryData.values);
    });

    const sql = queries.join('\n;\n');
    const res = await dbConnections.subscription.write.map(
      sql,
      values,
      mapper.mapSubscription
    );
    return res[0];
  }

  async function deleteSubscription(context, args) {
    checkId(args.id);
    // TODO validate that user has access to subscription.
    // not strictly necessary at this point since we are authorizing by org.
    const sql = `
      DELETE FROM subscription
      WHERE
        subscription_id = $1 AND
        organization_id = $2
    `;
    const sqlArgs = [args.id, args.organizationId];
    const res = await dbConnections.subscription.write.any(sql, sqlArgs);
    return {
      id: args.id,
      message: 'Subscription deleted'
    };
  }

  async function getCognitiveSearch(args) {
    checkId(args.id);
    const sql = `
SELECT
  cp.cognitive_profile_id AS id,
  cp.owner_user_id,
  cp.mention_status_id,
  cp.tracking_unit_id AS watchlist_id,
  cp.csp AS profile,
  cp.query AS query
FROM
  cognitive_profile cp
LEFT JOIN tracking_unit tu
  ON tu.tracking_unit_id = cp.tracking_unit_id
WHERE tu.organization_id = $2
    AND cp.cognitive_profile_id = $1
    `;
    const sqlArgs = [args.id, args.organizationId];

    const res = await dbConnections['media_platform'].read.map(
      sql,
      sqlArgs,
      (row) => mapper.camelizeRootKeys(row)
    );
    if (!res.length) {
      throw new NotFound({
        data: {
          objectId: args.id,
          objectType: 'CognitiveSearch'
        }
      });
    }
    return res[0];
  }

  async function createCognitiveSearch(context, args) {
    const sql = `
  INSERT INTO cognitive_profile
  (
    tracking_unit_id,
    owner_user_id,
    mention_status_id,
    csp,
    query
  )
  VALUES ($1, $2, $3, $4, $5)
  RETURNING
    tracking_unit_id AS watchlist_id,
    owner_user_id,
    mention_status_id,
    csp AS profile,
    query AS query,
    cognitive_profile_id AS id
    `;
    const input = args.input;
    checkId(input.watchlistId, 'watchlistId');
    checkId(input.mentionStatusId, 'mentionStatusId');
    const userId = await resUtil.getUserIdFromAuthContext(context);
    const cspJson = getCSPJson(input, true);
    const cspQuery = toV3Query(cspJson);
    const sqlArgs = [
      input.watchlistId,
      userId,
      input.mentionStatusId,
      cspJson,
      cspQuery
    ];

    const res = await dbConnections['media_platform'].write.map(
      sql,
      sqlArgs,
      (row) => mapper.camelizeRootKeys(row)
    );

    return res[0];
  }

  async function deleteCognitiveSearch(args) {
    const sql = `
    DELETE FROM cognitive_profile cp
    USING tracking_unit tu
    WHERE tu.tracking_unit_id = cp.tracking_unit_id
        AND tu.organization_id = $2
        AND cp.cognitive_profile_id = $1
    `;
    checkId(args.id);
    const sqlArgs = [args.id, args.organizationId];
    const res = await dbConnections['media_platform'].write.query(sql, sqlArgs);
    return {
      id: args.id,
      message: 'CognitiveSearchProfile deleted'
    };
  }

  async function getCognitiveSearches(watchlist) {
    checkId(_.get(watchlist, 'id'));
    const sql = `
SELECT
  cognitive_profile_id AS id,
  owner_user_id,
  mention_status_id,
  tracking_unit_id AS watchlist_id,
  csp AS profile,
  query AS query
FROM
  cognitive_profile
WHERE
  tracking_unit_id = $1
ORDER BY cognitive_profile_id ASC
    `;
    const args = [watchlist.id];
    const res = await dbConnections['media_platform'].read.map(
      sql,
      args,
      (csp) => mapper.camelizeRootKeys(csp)
    );

    return res;
  }

  function checkId(id, field) {
    if (_.isNumber(id)) return;
    if (!id) {
      throw new InvalidInput({
        message: 'Invalid ID format. An id cannot be null.',
        data: {
          value: id,
          field: field || 'id'
        }
      });
    }
    if (!(validator.isUUID(id) || validator.isInt(id))) {
      throw new InvalidInput({
        message: 'Invalid ID format. An ID must be a UUID or numerical string.',
        data: {
          value: id,
          field: field || 'id'
        }
      });
    }
  }

  async function getSearchQuery(watchlist) {
    const csps = await getCognitiveSearches(watchlist);
    const or = [];
    csps.forEach((csp) => or.push(csp.query));
    return or;
  }

  function getWatchlistJWTToken(context, watchlist) {
    const mentionRights = [
      'mentions.create',
      'mentions.read',
      'mentions.update',
      'mentions.delete',
      'mentions.share',
      'mentions.download'
    ];
    const watchlistRights = [
      'discovery.watchlist.create',
      'discovery.watchlist.read',
      'discovery.watchlist.update',
      'discovery.watchlist.delete',
      'discovery.watchlist.share',
      'discovery.watchlist.download'
    ];
    const jwtPayload = _.get(jwtSchemas, 'watchlist.payload');

    jwtPayload.contentApplicationId = watchlist.applicationId;
    jwtPayload.contentOrganizationId = watchlist.organizationId;
    jwtPayload.organizationId = watchlist.organizationId;
    jwtPayload.scope = [
      {
        actions: mentionRights
      },
      {
        actions: watchlistRights
      }
    ];

    const token = jwtWatchlist.sign(jwtPayload);

    // keep an eye on token size
    if (token.length > 8192) {
      logger.warn(
        'createJwtToken watchlist token size greater than 8k: ' + token.length,
        watchlist
      );
    }

    return token;
  }

  async function obtainRedLockByWatchlistId(watchlistId) {
    const lockTTLMs = _.get(
      config,
      'redLock.updateWatchlist.lockTTLMs',
      300000
    ); // hold the lock in 5 minutes
    const redisKey = watchlistLastUpdatedTimestampKey + watchlistId;
    const lockOptions = {
      retryCount: 30,
      retryDelay: 1000
    };
    const redLock = serviceContext.createRedisLock(lockOptions);
    const lock = await redLock.lock(redisKey + '-lock', lockTTLMs);

    return lock;
  }

  /**
   * emit access_media event
   * @param {*} context the context
   * @param {*} media the data of the media. It can be an item or an array
   * @param {*} mediaType type of the media. The default value is 'watchlist'
   * @param {*} error the error
   * @returns nothing
   */
  function _emitPublicEventAccessMedia(context, media, mediaType, error) {
    messageUtil.emitReadAuditEvent(context, media, mediaType || 'watchlist', error);
  }

  /**
   * emit watchlist_updated event
   * @param {*} context the context
   * @param {*} media the data of the media. It can be an item or an array
   * @param {*} error the error
   * @returns nothing
   */
  function _emitPublicEventWatchlistUpdated(context, media, error) {
    try {
      let mediaArr = media;
      if (!_.isArray(media)) {
        mediaArr = [media];
      }
      for (const _media of mediaArr) {
        // emit event for accessing media
        const idString = (
          _media.id ||
          _media.tracking_unit_id ||
          'n/a'
        ).toString();
        const event = {
          serviceName: 'core-graphql-server',
          resourceType: 'watchlist',
          resourceId: idString,
          resourceName: _media.name,
          // actionInfo
          actionInfo: messageUtil.buildActionInfo(
            idString,
            error,
            'update',
            !error ? 'success' : 'failure',
            !error
              ? `Updated watchlist ${_media.name}` : `Failed to update watchlist ${_media.name}`
          )
        };
        messageUtil.emitPublicEvent(
          supportedEvents.WatchListUpdated,
          'system',
          context,
          event
        );
      }
    } catch (err) {
      logger.error(
        `failed to emit event for ${supportedEvents.AccessMedia}`,
        err
      );
    }
  }

  return {
    getWatchlist,
    getWatchlists,
    createWatchlist,
    updateWatchlist,
    deleteWatchlist,
    bulkUpdateWatchlist,
    getMentionStatusOptions,
    getMentionStatusOption,
    fileWatchlist,
    unfileWatchlist,
    getFrequencyMap,
    getObjectTypeMap,
    getDayOfWeekMap,
    getWatchlistSubscriptions,
    createSubscriptions,
    createSubscription,
    deleteSubscription,
    getSubscription,
    getCognitiveSearches,
    getCognitiveSearch,
    updateCognitiveSearch,
    createCognitiveSearch,
    deleteCognitiveSearch,
    populateDetails,
    toV3Query,
    createCSPs,
    getSearchQuery,
    getSourceIds,
    formatDate,
    checkWatchlistRange,
    mapSourceTypeIds,
    convertSearchIndex,
    obtainRedLockByWatchlistId,
    bulkCreateWatchlists,
    _getPayloadForDeletedWatchlistEvent,

    // exposed for testing
    emitNewWatchlistEvent
  };
};
