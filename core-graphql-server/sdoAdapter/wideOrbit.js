const _ = require('lodash');
const moment = require('moment');
const { v5: uuidv5 } = require('uuid');

module.exports = function createModule(serviceContext) {
  const ctx = serviceContext;
  const { logger } = serviceContext;
  const dbConnections = serviceContext.dbConnections;
  const playoutConfig = _.get(serviceContext, 'config.stationPlayout');
  const advertiserRegistryId = _.get(
    playoutConfig,
    'wideOrbit.advertiserRegistryId'
  );
  const stationRegistryId = _.get(
    playoutConfig,
    'wideOrbit.stationRegistryId',
    '5a2e25cb-9b97-4a57-a5ca-527cff0cbe86'
  );
  const vtnPlayoutRegistryId = _.get(
    playoutConfig,
    'vtnStandard.stationRegistryId',
    '36e89fbb-45dd-4e65-918f-d5723de08cf6'
  );
  const uuidNamespace = 'a3adfc18-628e-4c2e-96c6-e3bfc541a913';
  const dateFormat = 'YYYY-MM-DDTHH:mm:ss';

  // Maintain a cache of organization to stations
  const orgMap = {};

  // Maintain a cache of data registry to schema ids
  const registryMap = {};

  async function createEvents(registryId, req) {
    const body = _.get(req, 'body');
    let { data, errorMessage } = body;
    if (errorMessage) {
      logger.error(`Error received from WideOrbit: ${JSON.stringify(body)}`);
      return [];
    }

    if (_.isNil(data)) {
      throw new Error('Invalid json without data.');
    }

    if (_.isString(data)) {
      try {
        data = JSON.parse(data);
      } catch (err) {
        throw new Error(
          `Invalid json for data: ${data}; error: ${JSON.stringify(err)}`
        );
      }
    }

    if (_.isArray(data)) {
      const results = [];
      for (const d of data) {
        const res = await applyTransformations(
          registryId,
          d,
          req,
          moment().valueOf()
        );
        if (!_.isNil(res)) {
          results.push(res);
        }
      }
      return _.uniqBy(results, 'id');
    } else {
      const event = await applyTransformations(
        registryId,
        data,
        req,
        moment().valueOf()
      );
      return _.isNil(event) ? null : [event];
    }
  }

  async function applyTransformations(registryId, entity, req, defaultBatch) {
    const event = camelizeRootKeys(entity);

    if (registryId === advertiserRegistryId) {
      event.id = _.get(event, 'advertiserId');
      return event;
    }

    const vtnPlayoutSchema = await getLatestPublishedSchema(
      req.context,
      vtnPlayoutRegistryId
    );

    const playout = { event, dataRegistryId: vtnPlayoutSchema.id };
    // batch query string parameter will be generated and sent by WO adapter to help identify logs sent in response to one request.
    playout.batchId = _.get(req, 'query.batch', `${defaultBatch}`);

    const { organizationId } = req.context.tokenInfo.organization;
    let channelInt = _.get(event, 'trafficStationInt');
    if (_.isNil(channelInt)) {
      channelInt = _.get(event, 'channelInt');
    }

    const wideOrbitName = _.get(event, 'channelName');
    const station = await stationDetails(channelInt, req, wideOrbitName);
    if (!station) {
      return null;
    }

    const advertiserId = _.get(event, 'advertiserId');
    const advertiserName = _.get(event, 'advertiserName');
    const advertiser = _.isNil(advertiserName)
      ? await getAdvertiser(event.advertiserId, req)
      : {};
    // This is the logic from the WO adapter.  Making this change here to allow core-eventing to use same data.
    playout.advertiserId = _.get(event, 'materialDescription', advertiserId);
    playout.advertiserName = _.get(
      event,
      'advertiserName',
      _.get(advertiser, 'advertiserName', playout.advertiserId)
    );

    const stationCode = _.get(station, 'stationCallLetters', '');
    const parts = stationCode.split('-');
    if (parts.length === 2) {
      playout.stationCallLetters = parts[0];
      playout.stationBand = parts[1];
    } else {
      playout.stationCallLetters = stationCode;
    }

    let loaded = false;
    if (!orgMap[organizationId]) {
      const rows = await getMediaSources(organizationId);
      orgMap[organizationId] = rows;
      loaded = true;
    }

    let mediaSource = orgMap[organizationId].find(
      (row) => row.stationCode === stationCode
    );

    // Cover case where org-station cache is stale
    if (!mediaSource && !loaded) {
      mediaSource = await getMediaSource(
        organizationId,
        playout.stationCallLetters,
        playout.stationBand
      );
    }

    playout.adId = _.get(event, 'invoiceIsciCode');
    playout.eventId = _.get(event, 'spotId');

    const gr = parseInt(_.get(event, 'rate'));
    playout.grossRate = isNaN(gr) ? 0 : gr;

    playout.status = _.get(event, 'spotStatus');
    playout.type = _.get(event, 'spotType');
    playout.artistName = _.get(event, 'materialTitle');
    playout.market = _.get(event, 'market');
    playout.text = _.get(event, 'orderProductDescription');

    const timezone = _.get(mediaSource, 'liveTimezone', 'America/Los_Angeles');
    const duration = _.get(event, 'spotLength', 0);
    playout.duration = _.isString(duration) ? parseInt(duration, 10) : duration;

    // Start time is ms relative to start of day
    let startTime = _.get(event, 'startTime');
    const airDate = _.get(event, 'intendedAirDate');
    if (airDate && startTime) {
      const st = moment.duration(_.toInteger(startTime), 'ms');
      const sdt = moment(airDate, 'YYYY-MM-DD').add(st).format(dateFormat);
      playout.startDateTime = moment.tz(sdt, timezone).toISOString();

      playout.endDateTime = moment(playout.startDateTime)
        .add(playout.duration, 'ms')
        .toISOString();
    }
    // WO logs do not have well defined unique id combination, so reverting to hashing entire log record.
    playout.id = uuidv5(JSON.stringify(entity), uuidNamespace);
    return playout;
  }

  async function stationDetails(channelInt, req, stationName) {
    if (!channelInt) {
      logger.warn(`Invalid channelInt specified for WideOrbit`);
      return null;
    }
    try {
      const schema = await getLatestPublishedSchema(
        req.context,
        stationRegistryId
      );
      const searchQuery = {
        search: {
          index: ['mine'],
          limit: 50,
          offset: 0,
          query: {
            operator: 'and',
            conditions: [
              {
                operator: 'term',
                field: 'trafficStationInt',
                value: channelInt
              }
            ]
          },
          type: schema.id
        }
      };
      const res = await ctx.dal.search.searchMedia(req.context, searchQuery);
      const data = _.get(res, 'jsondata');
      if (!data) {
        logger.error(
          `Failed retrieving station details for WideOrbit channel: ${channelInt}. ${JSON.stringify(
            res
          )}`
        );
      }

      let results = _.get(data, 'results[0]'); //Use the first entry as the default value

      //Find a better match based on the provided station name if multiple stations share the same WideOrbit ID.
      const resultList = _.get(data, 'results', []);
      if (stationName && resultList.length > 1) {
        let entryIndex;
        for (entryIndex = 0; entryIndex < resultList.length; entryIndex++) {
          const entry = resultList[entryIndex];
          const stationCallLetters = _.get(entry, 'stationCallLetters');
          if (
            stationCallLetters &&
            (stationCallLetters.indexOf(stationName) !== -1 ||
              stationName.indexOf(stationCallLetters) !== -1)
          ) {
            results = { ...entry };
            break;
          }
        }
      }

      if (!results) {
        logger.error(
          `Failed retrieving station details for WideOrbit channel: ${channelInt}. ${JSON.stringify(
            res
          )}`
        );
      }
      return results;
    } catch (e) {
      logger.error(
        `Error retrieving station details for WideOrbit channel: ${channelInt}.`,
        e
      );
    }

    return null;
  }

  async function getAdvertiser(advertiserId, req) {
    try {
      const schema = await getLatestPublishedSchema(
        req.context,
        advertiserRegistryId
      );
      const args = { schemaId: schema.id, filter: { advertiserId }, limit: 1 };
      const result = await ctx.dal.structuredData.getStructuredDataObjects(
        req.context,
        args
      );
      return _.get(result, 'records[0].data');
    } catch (e) {
      logger.error(
        `Error retrieving WideOrbit advertiser details for advertiser ${advertiserId}.`,
        e
      );
    }

    return null;
  }

  async function getLatestPublishedSchema(context, registryId) {
    const cached = registryMap[registryId];
    if (cached) {
      logger.debug(
        `Returning cached schema: ${_.get(
          cached,
          'id'
        )} for registry: ${registryId}`
      );
      return cached;
    }
    const { organizationId } = context.tokenInfo.organization;
    const _args = {
      status: ['published'],
      dataRegistryMetadataId: registryId,
      organizationId: organizationId
    };
    const schemas = await ctx.dal.structuredData.getSchemas(context, _args);
    if (schemas.count === 0) {
      throw new Error({
        message: `Data Registry ${stationRegistryId} has no published schemas`
      });
    }
    const schemaId = _.get(schemas, 'records[0]');
    registryMap[registryId] = schemaId;
    return schemaId;
  }

  async function getMediaSources(organizationId) {
    const sql = `
SELECT
  media_source_id, live_timezone, radio_station_code, station_call_sign, station_band
FROM
  media_source
WHERE
  organization_id = $1
    `;

    const data = [];
    try {
      const rows = await dbConnections['media_platform'].read.query(sql, [
        organizationId
      ]);
      for (const row of rows) {
        const stationCode =
          row.radio_station_code ||
          `${row.station_call_sign}-${row.station_band}`;
        data.push({
          sourceId: row.media_source_id,
          liveTimezone: row.live_timezone,
          callSign: row.station_call_sign,
          band: row.station_band,
          stationCode
        });
      }
    } catch (e) {
      logger.error(
        `Error retrieving media sources for organization: ${organizationId}`,
        e
      );
    }
    return data;
  }

  async function getMediaSource(organizationId, callSign, band) {
    const sql = `
SELECT
  media_source_id, live_timezone, radio_station_code, station_call_sign, station_band
FROM
  media_source
WHERE
  organization_id = $1
AND station_call_sign = $2 
AND station_band = $3
    `;
    const data = {};
    try {
      const rows = await dbConnections['media_platform'].read.query(sql, [
        organizationId,
        callSign,
        band
      ]);
      if (rows && rows.length) {
        data.sourceId = rows[0].media_source_id;
        data.liveTimezone = rows[0].live_timezone;
        data.callSign = rows[0].station_call_sign;
        data.band = rows[0].station_band;
        data.stationCode =
          rows[0].radio_station_code ||
          `${rows[0].station_call_sign}-${rows[0].station_band}`;
        orgMap[organizationId].push(data);
      }
    } catch (e) {
      logger.error(
        `Error retrieving media source for organization: ${organizationId}, callSign: ${callSign}, band: ${band}`,
        e
      );
    }
    return data;
  }

  // mapper.camelize was not working as expected
  function camelizeRootKeys(entity) {
    const result = {};
    Object.entries(entity).forEach(([key, value]) => {
      _.set(result, _.camelCase(key), value);
    });
    return result;
  }

  return {
    createEvents
  };
};
