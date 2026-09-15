const _ = require('lodash'),
  async = require('async-p'),
  mapper = require('../dal/mapper'),
  moment = require('moment'),
  spookyHash = require('../util/spookyHash'),
  pgp = require('pg-promise')({ capSQL: true }); // capitalize all generated SQL

const { Context } = require('@veritone/ts-messaging-lib/lib');
const { Messager } = require('@veritone/ts-messaging-lib/lib/nsq');
const { events } = require('@veritone/core-messages/generated/pbjs/compiled');
const { promisify } = require('util');

const MENTION_MEDIA_SOURCE_TYPE = {
  Radio: 1,
  Tv: 2,
  Youtube: 3,
  Private: 5
};

const MENTION_UPDATE_TYPE = {
  Inserted: 1,
  Updated: 2,
  Deleted: 3
};

const MENTION_STATE_LOOKUP = {
  Complete: 1,
  Updating: 2,
  PendingDelete: 3,
  Modified: 4
};

const MENTION_DEFAULT_STATUS_ID = 1;
const TV_AUDIENCE_SCHEMA_ID = '85db55b9-33e0-46ca-b7b0-39a6feeff5ec';
const LOCAL_TV_AUDIENCE_SCHEMA_ID = 'a86e58a1-0c0d-4057-9f2f-244e4fc0eb2a';
const RADIO_AUDIENCE_SCHEMA_ID = '0d0bc61f-5793-4d80-a980-9b041cabf661';
const MentionStatePendingDelete = 3;

const TRANSCRIPT_ENGINE_CATEGORY = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
const CORRELATION_ENGINE_CATEGORY = 'a70df3f6-84a7-4570-b8f4-daa122127e37';
const LOGO_RECOGNITION_ENGINE_CATEGORY = '5a511c83-2cbd-4f2d-927e-cd03803a8a9c';

const watchlistLastUpdatedTimestampKey = 'watchlistLastUpdatedTimestampKey:';

module.exports = function createFunction(serviceContext) {
  const {
    logger,
    config,
    dbConnections,
    redisClient,
    messagingV2: messaging
  } = serviceContext;
  const errors = require('../error')(config);
  const resolversUtil = require('../resolvers/util.js')(serviceContext);
  const { getEngineResults } = require('./dalEngineResult')(serviceContext);
  const {
    getSchemaRowFromCache,
    getDataRegistry
  } = require('./structureddata')(serviceContext);

  const mainUtil = require('../util.js')();
  const lruCacheMaxAgeInMs = config.lruCacheMaxAgeInMs || 600000; // default: 10 minutes
  const lruCacheMaxItems = config.lruCacheMaxItems || 100;
  const LRU = require('lru-cache');
  const lruCache = new LRU({
    max: lruCacheMaxItems,
    ttl: lruCacheMaxAgeInMs
  });
  const CACHE_PREFIX = 'dalMention';
  const dbMediaPlatformWrite = dbConnections['media_platform'].write;
  const util = require('./util')(config, serviceContext);

  async function getDbMediaSourceAndType(mediaId) {
    const cacheKey = `${CACHE_PREFIX}_getDbMediaSourceAndType_${mediaId}`;
    const cachedMediaSource = lruCache.get(cacheKey);

    if (cachedMediaSource) {
      logger.debug('Get getDbMediaSourceAndType from key: ', cacheKey);
      logger.debug('Get getDbMediaSourceAndType value: ', cachedMediaSource);
      return cachedMediaSource;
    } else {
      const sql =
        _.get(
          serviceContext,
          'config.featureFlags.getTDOMetadataFromMediaPlatform',
          false
        ) === true
          ? `
      SELECT
        media_source.media_source_id,
        media_source.live_timezone,
        media_source_type_id,
        media_metadata.metadata
      FROM
        media
      JOIN
        media_source
      ON
        media_source.media_source_id=media.media_source_id
      LEFT JOIN
        media_metadata
      ON
        media_metadata.media_id=media.media_id
      WHERE
        media.media_id=$1`
          : `
      SELECT
        media_source.media_source_id,
        media_source.live_timezone,
        media_source_type_id
      FROM
        media
      JOIN
        media_source
      ON
        media_source.media_source_id=media.media_source_id
      WHERE
        media.media_id=$1`;

      const mediaSourceAndType = await dbConnections[
        'media_platform'
      ].read.query(sql, [mediaId]);

      if (!mediaSourceAndType || mediaSourceAndType.length !== 1) {
        throw new errors.NotFound({
          message: `Missing media source association for mediaId: ${mediaId}`
        });
      }

      const res = mapper.camelizeRootKeys(mediaSourceAndType[0]);
      lruCache.set(cacheKey, res);

      return res;
    }
  }

  async function getAudienceDataYoutube(mention) {
    if (mention == null) {
      throw new errors.InvalidInput({
        message: 'Missing mention to retrieve audience data'
      });
    }

    if (mention.mentionDate == null) {
      throw new errors.InvalidInput({
        message: 'Missing mentionDate to retrieve audience data'
      });
    }

    if (mention.mediaId == null) {
      throw new errors.InvalidInput({
        message: 'Missing mediaId to retrieve audience data'
      });
    }

    const cacheKey = `${CACHE_PREFIX}_getAudienceDataYoutube_${
      mention.mediaId
    }_${mention.mentionDate.toISOString()}`;
    const cachedDbAudiences = lruCache.get(cacheKey);

    if (cachedDbAudiences) {
      logger.debug('Get getAudienceDataYoutube from key: ', cacheKey);
      return cachedDbAudiences;
    }

    const sql = `
    SELECT
			view_count
		FROM
			audience
		WHERE
			media_id = $1
		AND
			$2 >= effective_start_date AND $2 < effective_end_date`;

    const dbAudiences = await dbConnections['media_platform'].read.query(sql, [
      mention.mediaId,
      mention.mentionDate
    ]);

    if (dbAudiences.length === 0) {
      return null;
    }

    if (dbAudiences.length > 1) {
      throw new Error(
        `Multiple YouTube audience records returned for media ${mention.mediaId}`
      );
    }

    lruCache.set(cacheKey, dbAudiences[0]);

    return mapper.camelizeRootKeys(dbAudiences[0]);
  }

  async function getSDOAudienceData(context, mention) {
    if (mention == null) {
      throw new errors.InvalidInput({
        message: 'Missing mention to retrieve TV audience data'
      });
    }

    if (mention.mediaId == null) {
      throw new errors.InvalidInput({
        message: 'Missing mediaId to retrieve TV audience data'
      });
    }

    const cacheKey = `${CACHE_PREFIX}_getAudienceDataTV_${mention.mediaId}_${TV_AUDIENCE_SCHEMA_ID}_${LOCAL_TV_AUDIENCE_SCHEMA_ID}`;
    let resAudienceData = lruCache.get(cacheKey);

    if (resAudienceData) {
      logger.debug('Got getAudienceData from key: ', cacheKey);
      return resAudienceData;
    }

    const sdoData = await getSDOData(context, mention.mediaId);
    if (!sdoData) {
      return null;
    }
    const { schemaId, audienceData } = sdoData;
    if (!schemaId || _.isEmpty(audienceData)) {
      return null;
    }

    const demo = _.get(audienceData, '[0].demographics');
    if (_.isEmpty(demo)) {
      return null;
    }

    resAudienceData = {
      audienceAqh: _.get(demo, 'total'),
      audienceCharacteristics: getAudienceCharacteristics(demo),
      schemaId,
      markets: _.get(audienceData, '[0].markets', []).length,
      affiliates: _.get(audienceData, '[0].affiliates', []).length,
      sdos: audienceData
    };
    lruCache.set(cacheKey, resAudienceData);

    return resAudienceData;
  }

  const demoMap = {
    1: ['male.age12_17'],
    254: ['male.age18_20', 'male.age18_24'],
    255: ['male.age21_24'],
    3: ['male.age25_34'],
    4: ['male.age35_44', 'male.age35_49'],
    5: ['male.age45_49'],
    6: ['male.age50_54', 'male.age45_54'],
    82: ['male.age55_64'],
    7: ['male.age65'],

    8: ['female.age12_17'],
    267: ['female.age18_20', 'female.age18_24'],
    268: ['female.age21_24'],
    10: ['female.age25_34'],
    11: ['female.age35_44', 'female.age35_49'],
    12: ['female.age45_49'],
    13: ['female.age50_54', 'female.age45_54'],
    14: ['female.age55_64'],
    15: ['female.age65']
  };

  function getAudienceCharacteristics(demo) {
    const ac = [];
    for (const k of Object.keys(demoMap)) {
      const path = demoMap[k].find(
        (prop) => !_.isNil(_.get(demo, prop)) && _.get(demo, prop) !== 0
      );
      ac.push(`${k} => ${_.get(demo, path, 0)}`);
    }
    return ac.join(', ');
  }

  function calculateMentionEndDate(mention) {
    let minStart = Number.MAX_VALUE;
    let maxEnd = -1;

    if (mention.snippets && mention.snippets.length) {
      _.forEach(mention.snippets, (snippet) => {
        if (snippet.startTime) {
          if (snippet.startTime < minStart) {
            minStart = snippet.startTime;
          }
        }

        if (snippet.endTime) {
          if (snippet.endTime > maxEnd) {
            maxEnd = snippet.endTime;
          }
        }
      });
    }

    function checkSeriesResult(value) {
      if (value) {
        let seriesArray = Array.isArray(value)
          ? value
          : Array.isArray(value.series)
          ? value.series
          : [];
        _.forEach(seriesArray, (entry) => {
          const start = entry.start / 1000;
          const end = entry.end / 1000;
          if (start < minStart) minStart = start;
          if (end > maxEnd) maxEnd = end;
        });
      }
    }

    if (_.isObject(mention.cognitiveEngineResults)) {
      _.forOwn(mention.cognitiveEngineResults, checkSeriesResult);
      if (_.isObject(mention.cognitiveEngineResults.structuredData)) {
        _.forOwn(
          mention.cognitiveEngineResults.structuredData,
          checkSeriesResult
        );
      }
    }

    // if the results contains no timing info, or that data is invalid,
    // default to a minute duration.
    if (maxEnd - minStart <= 0 || maxEnd - minStart > 3600) {
      minStart = 0;
      maxEnd = 60;
    }

    return moment
      .utc(mention.mentionDate)
      .add(maxEnd - minStart, 's')
      .toDate();
  }

  function mapTranscriptEngineResultsToSnippets(series) {
    // turns a transcript engine result into a snippet
    if (!series || !Array.isArray(series)) {
      return [];
    }
    return series.map((slice) => {
      if (slice.startTimeMs && slice.stopTimeMs && slice.words) {
        return {
          startTime: slice.startTimeMs / 1000,
          endTime: slice.stopTimeMs / 1000,
          text: slice.words.map((word) => word.word).join(' ')
        };
      }
    });
  }

  // helper function to generate arguments for getEngineResults
  function generateGetEngineResultArguments({
    engineCategoryId,
    sourceId,
    mentionStartDateTime,
    mentionEndDateTime,
    args
  }) {
    return {
      sourceId: sourceId,
      startDate: mentionStartDateTime,
      stopDate: mentionEndDateTime,
      engineCategoryIds: [engineCategoryId],
      ignoreUserEdited: true,
      organizationIds: args.organizationIds,
      organizationId: args.organizationId,
      applicationId: args.applicationId,
      applicationIds: args.applicationIds
    };
  }

  async function mapStructuredDataCorrelationResultsForMention(
    context,
    results
  ) {
    const promises = results.records.map(async (record) => {
      let correlation = record.jsondata;
      let schemaId = correlation.metadata.schemaIds[0];
      if (!(schemaId && schemaId.length)) {
        // avoid unhandled internal_error. some data seems to
        // include null or empty schema ID.
        throw new errors.InvalidInput({
          message: 'Empty schemaId value in correlation metadata',
          data: {
            metadata: correlation.metadata
          }
        });
      }
      let type = await getSchemaRowFromCache(schemaId);
      let dataregistry = await getDataRegistry(context, {
        id: type.dataRegistryMetadataId
      });

      return {
        [`${type.storageName}`]: {
          source: schemaId,
          schemaId: schemaId,
          schemaName: dataregistry.name,
          series: correlation.series[0].structuredData[schemaId]
        }
      };
    });

    return await Promise.all(promises);
  }

  async function mapLogoRecognitionResultsForMention(context, results) {
    // to do, fill this in
  }

  /**
   * Normalizes the snippets and cognitiveEngineResults inputs, which can take
   * either string or JSON, so that the JSON keys are alway set and used in
   * code that executes later.
   * Also validates that string values contain valid JSON.
   */
  function normalizeStringInputs(input) {
    // if a string was supplied for snippets, parse now
    if (input.snippetsString) {
      try {
        // set the object value on the snippets parameter for later use
        input.snippets = JSON.parse(input.snippetsString);
      } catch (err) {
        throw new errors.InvalidInput({
          message:
            'The string supplied in the CreateMention.snippetsString parameter must contain valid JSON.',
          data: {
            snippetsString: input.snippetsString.slice(200),
            error: _.toString(err)
          }
        });
      }
    }
    // if a string was supplied for cognitive engine results, parse now
    if (input.cognitiveEngineResultsString) {
      try {
        // set the object value on the snippets parameter for later use
        input.cognitiveEngineResults = JSON.parse(
          input.cognitiveEngineResultsString
        );
      } catch (err) {
        throw new errors.InvalidInput({
          message:
            'The string supplied in the CreateMention.snippetsString parameter must contain valid JSON.',
          data: {
            cognitiveEngineResultsString: input.cognitiveEngineResultsString.slice(
              200
            ),
            error: _.toString(err)
          }
        });
      }
    }
  }

  async function createMention(context, args) {
    const { input, organizationId } = args;
    const {
      mentionDateTime,
      mentionEndDateTime,
      mediaId,
      watchlistUpdatingTimestamp,
      watchlistId
    } = input;

    normalizeStringInputs(input);

    // no snippets or cognitive engine results, get snippets from transcript and results from cognitive engine results for supported engine categories
    const customLengthMention =
      !input.snippets && !input.cognitiveEngineResults;

    if (customLengthMention) {
      const mediaSource = await getDbMediaSourceAndType(mediaId);

      input.hitStartDateTime = mentionDateTime;
      input.hitEndDateTime = mentionEndDateTime;
      const getTranscriptForMention = generateGetEngineResultArguments({
        sourceId: mediaSource.mediaSourceId,
        mentionStartDateTime: mentionDateTime,
        mentionEndDateTime: mentionEndDateTime,
        engineCategoryId: TRANSCRIPT_ENGINE_CATEGORY,
        args
      });

      const transcript = await getEngineResults(
        getTranscriptForMention,
        context
      );

      input.snippets = mapTranscriptEngineResultsToSnippets(
        _.get(transcript.records[0], 'jsondata.series')
      );

      const engineCategoriesToFetch = [
        CORRELATION_ENGINE_CATEGORY,
        LOGO_RECOGNITION_ENGINE_CATEGORY
      ];
      const COGNITIVE_ENGINE_MAPPERS = {
        [CORRELATION_ENGINE_CATEGORY]: mapStructuredDataCorrelationResultsForMention,
        [LOGO_RECOGNITION_ENGINE_CATEGORY]: mapLogoRecognitionResultsForMention
      };

      const COGNITIVE_ENGINE_CATEGORY_MENTION_KEYS = {
        [CORRELATION_ENGINE_CATEGORY]: 'structuredData',
        [LOGO_RECOGNITION_ENGINE_CATEGORY]: 'logo'
      };

      input.cognitiveEngineResults = {};

      await Promise.all(
        engineCategoriesToFetch.map(async (engineCategoryId) => {
          const getEngineResultsForCategory = generateGetEngineResultArguments({
            sourceId: mediaSource.mediaSourceId,
            mentionStartDateTime: mentionDateTime,
            mentionEndDateTime: mentionEndDateTime,
            engineCategoryId: engineCategoryId,
            args
          });

          const engineResultsForCategory = await getEngineResults(
            getEngineResultsForCategory,
            context
          );

          const engineCategoryMapper =
            COGNITIVE_ENGINE_MAPPERS[engineCategoryId];
          if (
            engineCategoryMapper &&
            typeof engineCategoryMapper === 'function'
          ) {
            const cognitiveEngineResultsForCategory = await engineCategoryMapper(
              context,
              engineResultsForCategory
            );

            if (engineCategoryId === CORRELATION_ENGINE_CATEGORY) {
              cognitiveEngineResultsForCategory.forEach((sdoAsset) => {
                if (!_.isEmpty(sdoAsset)) {
                  const type = Object.keys(sdoAsset)[0];
                  _.set(
                    input.cognitiveEngineResults,
                    ['structuredData', type],
                    sdoAsset[type]
                  );
                }
              });
            } else {
              // to do, fill this in _.set(inut.cognitiveEngineResult, cognitiveEngineResultsForCategory);
            }
          }
        })
      );

      if (_.isEmpty(input.cognitiveEngineResults)) {
        input.cognitiveEngineResults = undefined;
      }
    }

    const mention = await addDetailMention(
      context,
      input,
      organizationId,
      customLengthMention,
      false
    );
    let newMention = {};

    if (mention.mentionId != null) {
      // note that updateMentionDb returns an array
      const dbRes = await updateMentionDb(mention);
      // possibly a race condition -- a duplicate mention was detected,
      // but none were updated in the db.
      if (!dbRes.length) {
        throw new errors.ResourceConflict({
          message:
            'A duplicate mention was detected, but could not be updated. ' +
            'The mention may have been previously deleted in a race condition. Try ' +
            'again to continue.',
          data: {
            objectId: mention.mentionId,
            objectType: 'Mention'
          }
        });
      }
      newMention = dbRes[0];
    } else {
      if (watchlistUpdatingTimestamp && watchlistId) {
        const lock = await serviceContext.dal.watchlist.obtainRedLockByWatchlistId(
          watchlistId
        );

        try {
          const latestUpdateWatchlistTimestamp = await serviceContext.redisCache.get(
            watchlistLastUpdatedTimestampKey,
            watchlistId
          );

          if (watchlistUpdatingTimestamp == latestUpdateWatchlistTimestamp) {
            newMention = await insertMention(mention);
          } else {
            throw new errors.ResourceUnavailable({
              message: `Watchlist ${watchlistId} is obsolate`,
              data: { watchlistId }
            });
          }
        } finally {
          lock.unlock().catch(logger.error);
        }
      } else {
        newMention = await insertMention(mention);
      }
    }

    return mapper.mapCreateMention(newMention);
  }

  async function updateMention(context, args) {
    const { input } = args;

    const mention = Object.assign(
      {},
      {
        mentionId: input.id,
        privateNote: input.privateNote,
        publicNote: input.publicNote,
        complianceStatusId: input.complianceStatusId,
        spotTypeId: input.spotTypeId,
        mentionStatusId: input.statusId,
        adCreative: input.adCreative,
        userSnippets: JSON.stringify(input.userSnippets)
      }
    );

    const updatedMentions = await updateMentionDb(mention);
    return _.get(updatedMentions, '0');
  }

  async function updateMentions(context, args) {
    const { input } = args;

    // validating here instead of schema just in case we add more properties in future
    if (!input.statusId) {
      throw new errors.InvalidInput({
        message: 'Missing statusId to bulk update mentions',
        data: { statusId: input.statusId }
      });
    }

    return await updateMentionDb({
      mentionIds: input.ids,
      mentionStatusId: input.statusId
    });
  }

  async function getSDOData(context, tdoId) {
    const sql = `
    SELECT uri, metadata->'details'->'schemaIds' ->> 0 as "schemaId"
		FROM ${util.generateRecordingAssetPartition(tdoId)}
		WHERE
			recording_id = $1 AND recording_id::bigint = $1
		AND type = 'vtn-standard'
		AND metadata->'details'->'schemaIds' ?| ARRAY[$2 , $3, $4]
		ORDER BY created_date_time desc
		LIMIT 1`;

    const dbAudience = await dbConnections['core'].read.query(sql, [
      tdoId,
      TV_AUDIENCE_SCHEMA_ID,
      LOCAL_TV_AUDIENCE_SCHEMA_ID,
      RADIO_AUDIENCE_SCHEMA_ID
    ]);

    if (dbAudience.length === 0) {
      return null;
    }

    const uri = _.get(dbAudience, '[0].uri');
    const schemaId = _.get(dbAudience, '[0].schemaId');
    if (!uri) {
      throw new Error(`Failed to find audience data for tdo: ${tdoId}`);
    }

    const signedUri = await resolversUtil.getSignedUrl(uri);
    let tvAudienceAsset = await resolversUtil.download(signedUri, context);
    if (tvAudienceAsset != null) {
      try {
        tvAudienceAsset = JSON.parse(tvAudienceAsset);
      } catch (err) {
        logger.error(
          `Failed to fetch tv audience asset from ${signedUri}`,
          err
        );
        return null;
      }
    }
    let audienceData = _.get(
      tvAudienceAsset,
      `series[0].structuredData.${schemaId}`
    );
    return {
      schemaId,
      audienceData
    };
  }

  async function insertMention(mention) {
    const sql = `
          INSERT INTO mention (
            mention_status_id,
            compliance_status_id,
            spot_type_id,
            mention_snippets,
            user_snippets,
            mention_hit_count,
            mention_date,
            organization_id,
            advertiser_id,
            brand_id,
            campaign_id,
            tracking_unit_id,
            program_id,
            buy_id,
            offer_id,
            media_id,
            rating,
            private_note,
            public_note,
            dma_markets,
            dma_affiliates,
            dma_aqh_audience,
            dma_aqh_characteristics,
            online_views,
            media_source_id,
            media_source_type_id,
            mention_state_lookup_id,
            mention_hash,
            query_term,
            is_match,
            metadata,
            fingerprint,
            ad_creative,
            mention_end_date,
            cognitive_engine_results,
            hit_start_date,
            hit_end_date,
            updated_at
          )
          VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36::timestamp,$37::timestamp,$38::timestamp)
          RETURNING *;
        `;
    const newMention = await dbConnections['media_platform'].write.query(sql, [
      mention.mentionStatusId,
      mention.complianceStatusId,
      mention.spotTypeId,
      mention.snippetsString,
      mention.userSnippetsString,
      mention.mentionHitCount,
      mention.mentionDate.toISOString(),
      mention.organizationId,
      mention.advertiserId,
      mention.brandId,
      mention.campaignId,
      mention.watchlistId,
      mention.programId,
      mention.buyId,
      mention.offerId,
      mention.mediaId,
      mention.rating,
      mention.privateNote,
      mention.publicNote,
      mention.dmaMarkets,
      mention.dmaAffiliates,
      mention.dmaAqhAudience,
      mention.dmaAqhCharacteristics,
      mention.onlineViews,
      mention.mediaSourceId,
      mention.mediaSourceTypeId,
      mention.mentionStateLookupId,
      mention.hash,
      mention.queryTerm,
      mention.isMatch,
      mention.metadata,
      mention.fingerprint,
      mention.adCreative,
      mention.mentionEndDate.toISOString(),
      mention.cognitiveEngineResultsString || mention.cognitiveEngineResults,
      mention.hitStartTime
        ? moment.utc(mention.hitStartTime).toISOString()
        : null,
      mention.hitEndTime ? moment.utc(mention.hitEndTime).toISOString() : null,
      moment.utc().toISOString()
    ]);

    if (newMention[0]) {
      _emitMentionModifiedEvent(
        messaging,
        newMention[0].mention_id,
        newMention[0].mention_date,
        MENTION_UPDATE_TYPE.Inserted
      );
    }
    return newMention[0];
  }

  async function insertMentionsInBulk(listMentions) {
    const values = [];

    listMentions.forEach(function (mention) {
      values.push({
        mention_id: mention.mentionId,
        mention_status_id: mention.mentionStatusId,
        compliance_status_id: mention.complianceStatusId,
        spot_type_id: mention.spotTypeId,
        mention_snippets: JSON.stringify(mention.snippets),
        user_snippets: mention.userSnippets,
        mention_hit_count: mention.mentionHitCount,
        mention_date: mention.mentionDate.toISOString(),
        organization_id: mention.organizationId,
        advertiser_id: mention.advertiserId,
        brand_id: mention.brandId,
        campaign_id: mention.campaignId,
        tracking_unit_id: mention.watchlistId,
        program_id: mention.programId,
        buy_id: mention.buyId,
        offer_id: mention.offerId,
        media_id: mention.mediaId,
        rating: mention.rating,
        private_note: mention.privateNote,
        public_note: mention.publicNote,
        dma_markets: mention.dmaMarkets,
        dma_affiliates: mention.dmaAffiliates,
        dma_aqh_audience: mention.dmaAqhAudience,
        dma_aqh_characteristics: mention.dmaAqhCharacteristics,
        online_views: mention.onlineViews,
        media_source_id: mention.mediaSourceId,
        media_source_type_id: mention.mediaSourceTypeId,
        mention_state_lookup_id: mention.mentionStateLookupId,
        mention_hash: mention.hash,
        query_term: mention.queryTerm,
        is_match: mention.isMatch,
        metadata: mention.metadata,
        fingerprint: mention.fingerprint,
        ad_creative: mention.adCreative,
        mention_end_date: mention.mentionEndDate.toISOString(),
        cognitive_engine_results: mention.cognitiveEngineResults,
        hit_start_date: mention.hitStartTime.toISOString(),
        hit_end_date: mention.hitEndTime.toISOString(),
        updated_at: moment.utc().toISOString()
      });
    });

    const cs = new pgp.helpers.ColumnSet(
      [
        'mention_status_id',
        'compliance_status_id',
        'spot_type_id',
        'mention_snippets',
        'user_snippets',
        'mention_hit_count',
        'mention_date',
        'organization_id',
        'advertiser_id',
        'brand_id',
        'campaign_id',
        'tracking_unit_id',
        'program_id',
        'buy_id',
        'offer_id',
        'media_id',
        'rating',
        'private_note',
        'public_note',
        'dma_markets',
        'dma_affiliates',
        'dma_aqh_audience',
        'dma_aqh_characteristics',
        'online_views',
        'media_source_id',
        'media_source_type_id',
        'mention_state_lookup_id',
        'mention_hash',
        'query_term',
        'is_match',
        'metadata',
        'fingerprint',
        'ad_creative',
        'mention_end_date',
        'cognitive_engine_results',
        'hit_start_date',
        'hit_end_date',
        'updated_at',
        {
          name: 'mention_id',
          init: (col) =>
            col.exists && col.value
              ? col.value
              : {
                  // Fix the Custom Type Formatting changes
                  // from pg-promise v6.5.0: https://github.com/vitaly-t/pg-promise/releases/tag/v.6.5.0
                  rawType: true,
                  toPostgres: () => {
                    return pgp.as.format('DEFAULT');
                  }
                }
        }
      ],
      { table: 'mention' }
    );
    let query = pgp.helpers.insert(values, cs);
    let update = _.filter(
      cs.columns.map((x) => {
        const col = pgp.as.name(x.name);
        return x.name === 'mention_id' ? null : col + ' = excluded.' + col;
      })
    ).join();
    query = `
      ${query}
      ON CONFLICT ON CONSTRAINT mention_pkey DO UPDATE SET
      ${update}
      RETURNING
      mention_id AS id,
      mention_status_id AS status_id,
      compliance_status_id,
      spot_type_id,
      mention_snippets,
      user_snippets,
      rating,
      private_note,
      public_note,
      organization_id,
      advertiser_id,
      brand_id,
      program_id AS schedule_id,
      campaign_id,
      tracking_unit_id AS watchlist_id,
      ad_creative,
      media_id,
      media_source_id AS source_id,
      media_source_type_id AS source_type_id,
      mention_date,
      cognitive_engine_results,
      is_match,
      mention_hash AS hash,
      fingerprint,
      hit_start_date,
      hit_end_date,
      mention_end_date;`;

    const newMentions = await dbConnections['media_platform'].write.query(
      query
    );

    const watchlistMentionCount = new Map();
    for (const mention of newMentions) {
      _emitMentionModifiedEvent(
        messaging,
        mention.id,
        mention.mention_date,
        MENTION_UPDATE_TYPE.Inserted
      );
      if (mention.watchlist_id) {
        let currentCount = watchlistMentionCount.get(mention.watchlist_id);
        if (!currentCount) {
          currentCount = 0;
        }
        watchlistMentionCount.set(mention.watchlist_id, ++currentCount);
      }
    }
    updateMentionQuotas(watchlistMentionCount);

    return newMentions;
  }

  async function getWatchlistLimit(watchilstId) {
    const sql = `
    SELECT
      COALESCE((o.kvp->'features'->'watchlistLimits'->>'maximumMentionCount')::INTEGER, 10000) AS limit
    FROM
      tracking_unit t
    INNER JOIN organization o ON
      o.organization_id = t.organization_id
    WHERE
      tracking_unit_id = $1
    LIMIT 1;`;

    const limitResult = await dbConnections['media_platform'].read.query(sql, [
      watchilstId
    ]);
    return _.get(limitResult, 'rows[0].limit', 10000);
  }

  const redisPClient = {
    exists: promisify((key, callback) => {
      redisClient.exists(key, callback);
    }),
    decrby: promisify((key, count, callback) => {
      redisClient.decrby(key, count, callback);
    }),
    setex: promisify((key, ttl, value, callback) => {
      redisClient.setex(key, ttl, value, callback);
    })
  };

  const watchlistLimitTTL = 86400; // 24hr

  async function updateMentionQuotas(watchlistMentionCount) {
    await async.eachLimit(
      Array.from(watchlistMentionCount),
      async ([watchlistId, count]) => {
        const redisKey = 'watchlist-mention-quota:' + watchlistId;
        try {
          let exists = await redisPClient.exists(redisKey);
          if (exists) {
            const ret = await redisPClient.decrby(redisKey, count);
            return ret;
          } else {
            let limit = await getWatchlistLimit(watchlistId);
            const ret = await redisPClient.setex(
              redisKey,
              watchlistLimitTTL,
              limit - count
            );
            return ret;
          }
        } catch (err) {
          // make sure that any error thrown by the update is caught and handled here.
          // we'll just log a warning for now since failure to update a quota in redis
          // just means that the org might get a few free mentions.
          serviceContext.logger.warn(
            'updateMentionQuotas error on ' + watchlistId + ':  ' + err
          );
        }
      },
      10
    );
  }

  async function updateMentionDb(mention) {
    if (!mention.mentionId && _.isEmpty(mention.mentionIds))
      throw new Error('mentionId parameter is required');

    const mentionIds = mention.mentionIds || [mention.mentionId];
    const columns = Object.assign(
      {},
      mapper.decamelizeRootKeys(
        _.omit(mention, [
          'watchlistId',
          'scheduleId',
          'sourceId',
          'sourceTypeId',
          'hash',
          'hitStartTime',
          'hitEndTime',
          'mentionDate',
          'mentionEndDate',
          'mentionId',
          'mentionIds',
          'hashString',
          'snippetsString',
          'snippets' // column is called mention_snippets
        ])
      ),
      {
        tracking_unit_id: mention.watchlistId,
        program_id: mention.scheduleId,
        media_source_id: mention.sourceId,
        media_source_type_id: mention.sourceTypeId,
        mention_hash: mention.hash || mention.hashString,
        hit_start_date: _.isInteger(mention.hitStartTime)
          ? moment.utc(mention.hitStartTime).toISOString()
          : null,
        hit_end_date: _.isInteger(mention.hitEndTime)
          ? moment.utc(mention.hitEndTime).toISOString()
          : null,
        mention_date: mention.mentionDate
          ? mention.mentionDate.toISOString()
          : null,
        mention_end_date: mention.mentionEndDate
          ? mention.mentionEndDate.toISOString()
          : null,
        mention_snippets: _.isObject(mention.snippets)
          ? JSON.stringify(mention.snippets)
          : mention.snippets
      }
    );

    if (!_.has(mention, 'updated_at')) {
      columns.updated_at = moment.utc().toISOString();
    }
    if (!_.has(mention, 'mention_state_lookup_id')) {
      columns.mention_state_lookup_id = MENTION_STATE_LOOKUP.Modified;
    }
    const { sql, values } = mainUtil.makeUpdateSql(
      'mention',
      columns,
      {
        '*': null
      },
      `mention_id = ANY($1::bigint[])`,
      1, // value index to start with. pass default (1)
      false, // no null values
      {}, // no null values
      { mention_snippets: '::JSON' } // make sure the snippets value is cast properly.
      // pg gets confused on JSON array without cast.
    );
    values.unshift(mentionIds);
    const updatedMentions = await dbMediaPlatformWrite.map(
      sql,
      values,
      mapper.mapCreateMention
    );
    for (const updatedMention of updatedMentions) {
      _emitMentionModifiedEvent(
        messaging,
        updatedMention.mentionId,
        updatedMention.mentionDate,
        MENTION_UPDATE_TYPE.Updated
      );
    }

    return updatedMentions;
  }

  async function getTrackingUnit(trackingUnitId) {
    if (trackingUnitId) {
      const cacheKey = `${CACHE_PREFIX}_getTrackingUnit_${trackingUnitId}`;
      let resTrackingUnit = lruCache.get(cacheKey);

      if (resTrackingUnit) {
        logger.debug('Get getTrackingUnit from key: ', cacheKey);
        return resTrackingUnit;
      }

      const sql = `
        SELECT
          tu.tracking_unit_id,
          tu.tracking_unit_name,
          tu.organization_id,
          tu.advertiser_id,
          tu.brand_id,
          tu.campaign_id,
          tu.tracking_unit_type
        FROM
          tracking_unit tu
        WHERE
          tracking_unit_id = $1
      `;

      const trackingUnit = await dbConnections['media_platform'].read.query(
        sql,
        [trackingUnitId]
      );

      if (trackingUnit && trackingUnit.length > 0) {
        resTrackingUnit = mapper.camelizeRootKeys(trackingUnit[0]);
        lruCache.set(cacheKey, resTrackingUnit);
      }

      return resTrackingUnit;
    }
    return null;
  }

  async function getMention(context, args) {
    const data = await getMentions(context, args);
    if (!data.count) {
      throw new errors.NotFound({
        message: 'Mention not found',
        data: {
          objectId: args.id,
          objectType: 'Mention'
        }
      });
    }
    return data.records[0];
  }

  async function getMentions(context, args) {
    const where = [];
    const values = [];
    mainUtil.addSqlWhere(
      'm.mention_id',
      args.id || args.mentionId,
      where,
      values
    );
    mainUtil.addSqlWhere('m.mention_id', args.ids, where, values);
    mainUtil.addSqlWhere(
      'm.organization_id',
      args.organizationIds || args.organizationId,
      where,
      values
    );
    mainUtil.addSqlWhere('m.media_id', args.tdoId, where, values);
    mainUtil.addSqlWhere('m.tracking_unit_id', args.watchlistId, where, values);
    mainUtil.addSqlWhere('m.media_source_id', args.sourceId, where, values);
    mainUtil.addSqlWhere('m.mention_status_id', args.statusId, where, values);
    mainUtil.addSqlWhere(
      'm.media_source_type_id',
      args.sourceTypeId,
      where,
      values
    );

    const orderClause = [];
    const orderByMap = {
      id: 'mention_id',
      mentionDate: 'mention_date',
      endDateTime: 'mention_end_date',
      hitStartDateTime: 'hit_start_date_time',
      hitEndDateTime: 'hit_end_date_time'
    };
    if (_.get(args, 'orderBy.length', 0) > 0) {
      args.orderBy.forEach((orderBy) => {
        const col = orderByMap[orderBy.field];
        if (!col)
          throw new errors.InternalServerError({
            message:
              'An internal server configuration error in mention order by processing has occurred.',
            data: {
              internalData: {
                orderByField: orderBy.field,
                knownFields: Object.keys(orderByMap)
              }
            }
          });
        orderClause.push(`${col} ${orderBy.direction}`);
      });
    } else {
      orderClause.push('mention_date desc');
    }
    // if the user does not filter by source, tdo, watchlist or ID,
    // apply a default date/time filter of now - 7 days.
    if (
      !(
        _.get(args, 'dateTimeFilter.length', 0) > 0 ||
        args.sourceId ||
        args.tdoId ||
        args.watchlistId ||
        args.id ||
        args.mentionId ||
        args.ids ||
        args.folderId
      )
    ) {
      const toDateTime = moment().utc();
      const fromDateTime = moment().utc().subtract(7, 'days');
      args.dateTimeFilter = [
        {
          field: 'mentionDate',
          fromDateTime
        },
        {
          field: 'mentionDate',
          toDateTime
        }
      ];
    }
    mainUtil.addDateTimeFilters('m', args, where, 'pg_ts', 1, orderByMap);
    let sql = `
      SELECT
        m.mention_id AS id,
        m.mention_status_id AS status_id,
        m.compliance_status_id,
        m.spot_type_id,
        COALESCE(m.mention_snippets, '[]') mention_snippets,
        m.user_snippets,
        m.rating,
        m.private_note,
        m.public_note,
        m.organization_id,
        m.advertiser_id,
        m.brand_id,
        m.program_id AS schedule_id,
        m.campaign_id,
        m.tracking_unit_id AS watchlist_id,
        m.ad_creative,
        m.media_id,
        m.media_source_id AS source_id,
        m.media_source_type_id AS source_type_id,
        m.mention_date AT TIME ZONE 'UTC' AS mention_date,
        m.cognitive_engine_results,
        m.is_match,
        m.mention_hash AS hash,
        m.fingerprint,
        m.hit_start_date AT TIME ZONE 'UTC' AS hit_start_date_time,
        m.hit_end_date AT TIME ZONE 'UTC' AS hit_end_date_time,
        m.mention_end_date AT TIME ZONE 'UTC' AS end_date_time,
        m.metadata,
        m.dma_aqh_audience AS audience,
        m.mention_hit_count,
        m.created_at as created_date_time,
        m.updated_at as modified_date_time
      FROM
        mention m
      `;
    if (args.folderId) {
      mainUtil.addSqlWhere('fm.folder_id', args.folderId, where, values);
      sql += `\nINNER JOIN folder__mention fm ON fm.mention_id = m.mention_id\n`;
    }
    sql += `WHERE
        ${where.join(' AND \n')}
      ORDER BY
        ${orderClause.join(', ')}
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || 30}
      `;
    const map = mapper.camelizeRootKeys;
    const mentions = await dbConnections['media_platform'].read.map(
      sql,
      values,
      map
    );
    return mainUtil.toPage(args, mentions);
  }

  function _emitMentionModifiedEvent(
    messaging,
    mentionId,
    mentionDate,
    mentionModifiedType
  ) {
    const eventPayload = new events.MentionModifiedData({
      mentionDate: new Date(mentionDate).toUTCString(),
      mentionId: _.isNumber(mentionId) ? mentionId : parseInt(mentionId, 10),
      transactionTimestamp: new Date().toUTCString()
    });

    let event;
    switch (mentionModifiedType) {
      case MENTION_UPDATE_TYPE.Deleted:
        event = new events.MentionUpdated({
          event: 'mention_deleted'
        });
        break;
      case MENTION_UPDATE_TYPE.Inserted:
        event = new events.MentionInserted({
          event: 'mention_inserted'
        });
        break;
      default:
        event = new events.MentionUpdated({
          event: 'mention_updated'
        });
        break;
    }
    event.type = 'mention';
    event.payload = eventPayload;
    return messaging.produce(
      Context,
      new Messager(JSON.stringify(event), 'events')
    );
  }

  async function createMentions(context, args) {
    const { input, organizationId } = args;
    const listMentions = [];

    if (!input || !input.mentions) {
      throw new errors.InvalidInput({
        message: 'array BulkCreateMentionList cannot be null'
      });
    }

    await asyncForEach(input.mentions, async function (inputMention) {
      try {
        normalizeStringInputs(inputMention);

        const mention = await addDetailMention(
          context,
          inputMention,
          organizationId
        );
        if (mention) {
          listMentions.push(mention);
        }
      } catch (err) {
        logger.error(err);
        return;
      }
    });

    // Split between -
    // 1. Upserts for new and/or mentions marked "pending delete"
    // 2. Modified mentions that may need to be updated to DB and/or synced to Elastic
    const mentionsToUpsert = [];
    const modifiedMentions = [];
    listMentions.forEach((mention) => {
      if (mention.isExistingAndModified) {
        modifiedMentions.push(mention);
      } else {
        mentionsToUpsert.push(mention);
      }
    });

    let listNewMentions = [];
    if (mentionsToUpsert.length) {
      // assume all mentions in list would have the same watchlistId and watchlistUpdatingTimestamp
      // So we get the watchlistId and watchlistUpdatingTimestamp from the first mention in list
      const firstMention = _.first(mentionsToUpsert);
      const { watchlistId, watchlistUpdatingTimestamp } = firstMention;

      if (watchlistUpdatingTimestamp && watchlistId) {
        const lock = await serviceContext.dal.watchlist.obtainRedLockByWatchlistId(
          watchlistId
        );

        try {
          const latestUpdateWatchlistTimestamp = await serviceContext.redisCache.get(
            watchlistLastUpdatedTimestampKey,
            watchlistId
          );

          if (watchlistUpdatingTimestamp == latestUpdateWatchlistTimestamp) {
            listNewMentions = await insertMentionsInBulk(mentionsToUpsert);
          } else {
            throw new errors.ResourceUnavailable({
              message: `Watchlist ${watchlistId} is obsolate`,
              data: { watchlistId }
            });
          }
        } finally {
          lock.unlock().catch(logger.error);
        }
      } else {
        listNewMentions = await insertMentionsInBulk(mentionsToUpsert);
      }
    }

    const flags = _.get(input, 'flags', []);
    if (flags.includes('shouldUpdateAudienceDataForExistingMentions')) {
      const updatedMentions = await updateModifiedMentionsAudienceData(
        modifiedMentions
      );
      listNewMentions = listNewMentions.concat(updatedMentions);
    }
    if (flags.includes('shouldSyncExistingMentions')) {
      for (const mention of modifiedMentions) {
        _emitMentionModifiedEvent(
          messaging,
          mention.mentionId,
          mention.mentionDate,
          MENTION_UPDATE_TYPE.Updated
        );
      }
    }

    listNewMentions = mainUtil.toPage(
      args,
      mapper.mapCreateMentionInBulk(listNewMentions)
    );

    return listNewMentions;
  }

  async function getSpotTypeIdByName(spotTypeName) {
    const cacheKey = `${CACHE_PREFIX}_getSpotTypeIdByName_${spotTypeName}`;
    const resSpotTypeId = lruCache.get(cacheKey);

    if (resSpotTypeId) {
      logger.debug('Get getSpotTypeIdByName from key: ', cacheKey);
      return resSpotTypeId;
    }

    const sql = `
    SELECT spot_type_id
    FROM spot_type
    WHERE spot_type_name = $1`;

    const spotType = await dbConnections['media_platform'].read.query(sql, [
      spotTypeName
    ]);

    if (!spotType || !spotType.rows.length) {
      return null;
    }

    lruCache.set(cacheKey, spotType.rows[0].spot_type_id);

    return spotType.rows[0].spot_type_id;
  }

  async function getExistsMention(mention, context) {
    const mentionApertureWindowOrgSetting = mainUtil.getOrgSettingByKey(
      context,
      'features.mentionApertureWindow',
      120
    );
    //Ignore check exists mention with mention_state_look_up = 3 (Pending_delete)

    const hitStartTime = mention.hitStartTime || mention.mentionDate;
    const hitEndTime = mention.hitEndTime || mention.mentionEndDate;

    const sql = `
      SELECT
        mention_id,
        mention_state_lookup_id
      FROM
        mention
      WHERE
        tracking_unit_id = $1
        AND media_source_id = $4
        AND media_source_type_id <> $2
        AND($5 < mention_end_date AND $6 > mention_date)
        AND(
            ($7 < mention_end_date AND $8 > mention_date)
          OR
            ($9 <= hit_end_date AND $10 >= hit_start_date)
        )
      UNION SELECT
        mention_id,
        mention_state_lookup_id
      FROM
        mention
      WHERE
        tracking_unit_id = $1
        AND media_id = $3
        AND media_source_type_id = $2
        AND($5 < mention_end_date AND $6 > mention_date)
        AND(
            ($7 < mention_end_date AND $8 > mention_date)
          OR
            ($9 <= hit_end_date AND $10 >= hit_start_date)
        )
      LIMIT 1
    `;

    const existingMentions = await dbConnections[
      'media_platform'
    ].read.query(sql, [
      mention.watchlistId,
      MENTION_MEDIA_SOURCE_TYPE.Private,
      mention.mediaId,
      mention.mediaSourceId,
      moment
        .utc(mention.mentionDate)
        .subtract(mentionApertureWindowOrgSetting, 'seconds')
        .toISOString(),
      moment
        .utc(mention.mentionEndDate)
        .add(mentionApertureWindowOrgSetting, 'seconds')
        .toISOString(),
      mention.mentionDate.toISOString(),
      mention.mentionEndDate.toISOString(),
      moment.utc(hitStartTime).toISOString(),
      moment.utc(hitEndTime).toISOString()
    ]);

    if (!existingMentions || !existingMentions.length) {
      return null;
    }

    return existingMentions[0];
  }

  async function addDetailMention(
    context,
    input,
    organizationId,
    allowDuplicates,
    tagModifiedMention = true
  ) {
    let mediaSource;
    let tdoMetadata;
    if (
      _.get(
        serviceContext,
        'config.featureFlags.getTDOMetadataFromMediaPlatform',
        false
      ) === true
    ) {
      mediaSource = await getDbMediaSourceAndType(input.mediaId);
      tdoMetadata = _.get(mediaSource, 'metadata', {});
    } else {
      [mediaSource, tdoMetadata] = await Promise.all([
        getDbMediaSourceAndType(input.mediaId),
        serviceContext.dal.tdo.getTDODetails(input.mediaId)
      ]);
    }

    const mention = Object.assign(
      {
        mentionStateLookupId: allowDuplicates
          ? MENTION_STATE_LOOKUP.Modified
          : MENTION_STATE_LOOKUP.Complete,
        isMatch: true,
        mentionStatusId: input.mentionStatusId || MENTION_DEFAULT_STATUS_ID,
        organizationId: organizationId,
        mentionDate: moment.utc(input.mentionDateTime).toDate(),
        mentionEndDate: moment.utc(input.mentionEndDateTime).toDate(),
        hitStartTime: moment.utc(input.hitStartDateTime).toDate(),
        hitEndTime: moment.utc(input.hitEndDateTime).toDate(),
        snippets: input.snippets,
        snippetsString: JSON.stringify(input.snippets),
        cognitiveEngineResults: input.cognitiveEngineResults,
        metadata: input.metadata || {}
      },
      _.pick(input, [
        'mediaId',
        'programId',
        'complianceStatusId',
        'spotTypeId',
        'privateNote',
        'publicNote',
        'adCreative',
        'snippets',
        'cognitiveEngineResults',
        'mentionHitCount',
        'watchlistUpdatingTimestamp'
      ]),
      _.pick(mediaSource, ['mediaSourceId', 'mediaSourceTypeId'])
    );

    Object.assign(mention.metadata, tdoMetadata);

    if (!mention.cognitiveEngineResults && !mention.snippets) {
      throw new errors.InvalidInput({
        message: 'cognitiveEngineResults and snippets cannot be null'
      });
    }

    if (mediaSource.mediaSourceTypeId) {
      const audienceInput = input.audience;
      switch (mediaSource.mediaSourceTypeId) {
        case MENTION_MEDIA_SOURCE_TYPE.Youtube: {
          if (!_.isNil(audienceInput)) {
            mention.onlineViews = audienceInput.audienceTotal || 0;
            mention.shouldUpdateAudienceData = true;
            break;
          }
          const dbYoutubeAudience = await getAudienceDataYoutube(mention);
          if (dbYoutubeAudience) {
            mention.onlineViews = dbYoutubeAudience.viewCount;
          }
          break;
        }
        case MENTION_MEDIA_SOURCE_TYPE.Radio: {
          if (!_.isNil(audienceInput)) {
            const {
              sourceCount = 0,
              marketCount = 0,
              audienceTotal = 0,
              audienceDemographics = {},
              metadata = {}
            } = audienceInput;
            mention.dmaAffiliates = sourceCount;
            mention.dmaMarkets = marketCount;
            mention.dmaAqhAudience = audienceTotal;
            mention.dmaAqhCharacteristics = getAudienceCharacteristics(
              audienceDemographics
            );
            mention.metadata = {
              ...mention.metadata,
              ...metadata
            };
            mention.shouldUpdateAudienceData = true;
            break;
          }

          let dbAudience = await getSDOAudienceData(context, mention);

          if (dbAudience) {
            const sdos = _.get(dbAudience, 'sdos', []);
            const sdo = sdos.length > 0 ? sdos[0] : {};
            mention.dmaAffiliates = dbAudience.affiliates;
            mention.dmaMarkets = dbAudience.markets;
            mention.dmaAqhAudience = dbAudience.audienceAqh;
            mention.dmaAqhCharacteristics = dbAudience.audienceCharacteristics;
            mention.metadata.audienceProvider = _.get(
              sdo,
              'dataSource.name',
              'Nielsen'
            );
            mention.metadata.audienceProviderBooks = _.get(
              sdo,
              'audienceProviderBooks'
            );
          }

          break;
        }
        case MENTION_MEDIA_SOURCE_TYPE.Tv: {
          if (!_.isNil(audienceInput)) {
            const {
              audienceTotal = 0,
              audienceDemographics = {},
              metadata = {}
            } = audienceInput;
            mention.dmaAqhAudience = audienceTotal;
            mention.dmaAqhCharacteristics = getAudienceCharacteristics(
              audienceDemographics
            );
            mention.metadata = {
              ...mention.metadata,
              ...metadata
            };
            mention.shouldUpdateAudienceData = true;
            break;
          }
          const dbTVAudience = await getSDOAudienceData(context, mention);

          if (dbTVAudience) {
            mention.dmaAqhAudience = dbTVAudience.audienceAqh;
            mention.dmaAqhCharacteristics =
              dbTVAudience.audienceCharacteristics;
            mention.metadata.structuredData = {
              [dbTVAudience.schemaId]: dbTVAudience.sdos
            };
          }

          break;
        }
      }
    }

    if (input.watchlistId && input.watchlistId > 0) {
      const trackingUnit = await getTrackingUnit(input.watchlistId);
      if (!trackingUnit) {
        throw new errors.NotFound({
          data: { objectId: input.watchlistId, objectType: 'watchlistId' }
        });
      }

      mention.organizationId = trackingUnit.organizationId;
      mention.advertiserId = trackingUnit.advertiserId;
      mention.brandId = trackingUnit.brandId;
      mention.campaignId = trackingUnit.campaignId;
      mention.watchlistId = trackingUnit.trackingUnitId;
      mention.metadata.watchlistType = _.get(
        trackingUnit,
        'trackingUnitType',
        'tracking'
      );
    } else {
      mention.queryTerm = input.queryTerm;
    }

    if (!mention.mentionEndDateTime) {
      mention.mentionEndDate = calculateMentionEndDate(mention);
    }
    const spotTypeName = _.isString(mention, 'adCreative.spotType');
    if (!mention.spotTypeId && !_.isEmpty(spotTypeName)) {
      mention.spotTypeId = await getSpotTypeIdByName(spotTypeName);
    }

    if (mention.watchlistId != null && mention.watchlistId > 0) {
      let hashString = '';
      if (input.snippetsString) {
        hashString += mention.snippetsString;
      }
      if (input.cognitiveEngineResultsString) {
        hashString += mention.cognitiveEngineResultsString;
      }
      mention.hashString = hashString;
      mention.hash = spookyHash
        .hash32(Buffer.from(hashString))
        .readUIntBE(0, 4);

      const existingMention = await getExistsMention(mention, context);
      if (existingMention != null && !allowDuplicates) {
        // Tag mentions that are "modified" so that we can update them later if we need to
        if (
          tagModifiedMention &&
          existingMention.mention_state_lookup_id ===
            MENTION_STATE_LOOKUP.Modified
        ) {
          mention.isExistingAndModified = true;
        } else if (
          MentionStatePendingDelete !== existingMention.mention_state_lookup_id
        ) {
          throw new errors.ResourceConflict({
            message: 'Duplicate mention found: ' + existingMention.mention_id
          });
        }

        mention.mentionId = existingMention.mention_id;
      }
    }

    return mention;
  }

  async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

  async function getMentionRating(context, args) {
    const where = [];
    const values = [];
    mainUtil.addSqlWhere(
      'mr.mention_id',
      args.mentionId || args.id,
      where,
      values
    );
    mainUtil.addSqlWhere('r.user_id', args.userId, where, values);
    const sql = `
      SELECT 	mr.rating_id,
          mr.mention_id,
          r.user_id,
          r.rating_value,
          r.date_created,
          r.date_modified
      FROM 	mention__rating mr
        INNER JOIN rating r on r.rating_id = mr.rating_id
      WHERE ${where.join(' AND \n')};
    `;
    const mentionRatings = await dbConnections['media_platform'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
    return mainUtil.toPage(args, mentionRatings);
  }

  async function getMentionComment(context, args) {
    const where = [];
    const values = [];
    mainUtil.addSqlWhere(
      'mc.mention_id',
      args.mentionId || args.id,
      where,
      values
    );
    const sql = `
      SELECT 	mc.comment_id,
          mc.mention_id,
          c.user_id,
          c.comment_text,
          c.date_created,
          c.date_modified
      FROM 	mention__comment mc
        INNER JOIN comment c on c.comment_id = mc.comment_id
      WHERE ${where.join(' AND \n')};
    `;
    const mentionComments = await dbConnections['media_platform'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
    return mainUtil.toPage(args, mentionComments);
  }

  const campaignColumns = {
    campaign_id: 'id',
    campaign_name: 'name',
    campaign_start_date: 'start_date',
    campaign_stop_date: 'stop_date',
    campaign_budget: 'budget',
    campaign_demographics: 'demographics',
    organization_id: 'organization_id',
    advertiser_id: 'advertiser_id',
    brand_id: 'brand_id'
  };

  async function getCampaign(args) {
    if (!args.id) {
      throw new errors.InvalidInput({
        message: 'Invalid campaignId',
        data: {
          objectId: args.id,
          objectType: 'Campaign'
        }
      });
    }
    const sql = `SELECT ${mainUtil.makeSelectClause(campaignColumns)}
    FROM campaign
    WHERE campaign_id = $1`;
    const campaign = await dbConnections['media_platform'].read.map(
      sql,
      [args.id],
      mapper.camelizeRootKeys
    );
    return _.get(campaign, '0');
  }

  function emitMentionDeletedInBulkEvent(mentions, watchlistId) {
    const event = {
      event: 'mentions_deleted',
      type: 'mention'
    };

    if (!_.isEmpty(mentions)) {
      event.mentions = mentions.map(
        (mention) =>
          new events.MentionModifiedData({
            mentionId: _.isNumber(mention.mentionId)
              ? mention.mentionId
              : parseInt(mention.mentionId),
            organizationId: _.isNumber(mention.organizationId)
              ? mention.organizationId
              : parseInt(mention.organizationId),
            mentionDate: mention.mentionDate,
            transactionTimestamp: new Date().toUTCString()
          })
      );
    } else if (watchlistId) {
      event.watchlistId = watchlistId;
    }

    serviceContext.messageUtil.emitEvent(
      event,
      serviceContext.messageUtil.topics('EVENTS')
    );
  }

  /**
   * Update "modified" mentions with audience data.
   */
  async function updateModifiedMentionsAudienceData(mentions = []) {
    if (_.isEmpty(mentions)) {
      return [];
    }

    const mentionsToUpdate = mentions.filter(
      (mention) =>
        Boolean(mention.shouldUpdateAudienceData) &&
        Boolean(mention.mentionId) &&
        Boolean(mention.watchlistId)
    );

    let updatedMentions = [];
    if (mentionsToUpdate.length) {
      let updateParameters = '';
      let values = [];
      let argIndex = 1;

      mentionsToUpdate.forEach((mention, idx) => {
        const {
          mentionId,
          dmaAffiliates,
          dmaMarkets,
          dmaAqhAudience,
          dmaAqhCharacteristics,
          metadata,
          onlineViews,
          watchlistId
        } = mention;
        const updateValues = [
          {
            cast: 'bigint',
            value: mentionId
          },
          {
            value: dmaAffiliates
          },
          {
            value: dmaMarkets
          },
          {
            value: dmaAqhAudience
          },
          {
            cast: 'hstore',
            value: dmaAqhCharacteristics
          },
          {
            cast: 'json',
            value: JSON.stringify(metadata)
          },
          {
            value: onlineViews
          }
        ];
        const parameters = updateValues.map((col) => {
          const arg = `$${argIndex}`;
          const cast = col.cast ? `::${col.cast}` : '';
          argIndex++;

          return arg + cast;
        });
        updateParameters += `(${parameters.join(', ')})`;
        updateParameters += `${idx === mentionsToUpdate.length - 1 ? '' : ','}`;
        values = [...values, ...updateValues.map((col) => col.value)];
      });

      const sql = `
        UPDATE mention as m
        SET 
          dma_affiliates = temp.dma_affiliates,
          dma_markets = temp.dma_markets,
          dma_aqh_audience = temp.dma_aqh_audience,
          dma_aqh_characteristics = temp.dma_aqh_characteristics,
          metadata = temp.metadata,
          online_views = temp.online_views
        FROM (values
          ${updateParameters}
        ) as temp (
          mention_id,
          dma_affiliates,
          dma_markets,
          dma_aqh_audience,
          dma_aqh_characteristics,
          metadata,
          online_views
        )
        WHERE m.mention_id = temp.mention_id
        RETURNING m.*;
      `;

      try {
        updatedMentions = await dbConnections['media_platform'].write.query(
          sql,
          values
        );
      } catch (err) {
        logger.error(
          `Failed to update modified mentions with audience data`,
          err
        );
        throw err;
      }
    }
    return updatedMentions;
  }

  return {
    getMention,
    getMentions,
    createMention,
    createMentions,
    getMentionRating,
    getMentionComment,
    updateMention,
    updateMentions,
    getCampaign,
    emitMentionDeletedInBulkEvent,

    // unit test only
    _mapStructuredDataCorrelationResultsForMention: mapStructuredDataCorrelationResultsForMention,
    getDbMediaSourceAndType,
    getAudienceDataYoutube,
    getSDOAudienceData,
    mapTranscriptEngineResultsToSnippets,
    generateGetEngineResultArguments,
    normalizeStringInputs,
    getTrackingUnit,
    getSpotTypeIdByName,
    getExistsMention,
    addDetailMention,
    updateModifiedMentionsAudienceData
  };
};
