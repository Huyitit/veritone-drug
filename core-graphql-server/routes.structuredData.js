const _ = require('lodash');

module.exports = function setUpRoutes(serviceContext) {
  const { app, config, logger, dal, redisCache } = serviceContext;
  const { InvalidInput } = require('./error')(config);

  const structuredDataDal = dal.structuredData;

  const apiPath = _.get(config, 'sdApiPath', '/structured-data');
  app.use(apiPath, [
    preAuthParseQueryJwt,
    app.middleware.authenticationOption('required'),
    app.middleware.loadAuthDataByToken,
    postAuthRequestContext
  ]);

  const adapterMapping = {};
  const wideOrbit = require('./sdoAdapter/wideOrbit');
  const csrdsAutomation = require('./sdoAdapter/csrdsAutomation');
  const iMediaTouch = require('./sdoAdapter/iMediaTouch');
  const audioVault = require('./sdoAdapter/audioVault');

  const playoutConfig = _.get(serviceContext, 'config.stationPlayout', {});
  const woPlayoutRegistry = _.get(playoutConfig, 'wideOrbit.playoutRegistryId');
  const woAdvertiserRegistry = _.get(
    playoutConfig,
    'wideOrbit.advertiserRegistryId'
  );
  const csrdsRegistry = _.get(
    playoutConfig,
    'csrdsAutomation.playoutRegistryId'
  );
  const iMediaTouchRegistry = _.get(
    playoutConfig,
    'iMediaTouchAutomation.playoutRegistryId'
  );
  const audioVaultRegistry = _.get(
    playoutConfig,
    'audioVault.playoutRegistryId'
  );
  const CACHE_DATA_REGISTRY_PUBLISHED_SCHEMA_ID =
    'DataRegistryPublishedSchemaId';

  if (woPlayoutRegistry)
    adapterMapping[woPlayoutRegistry] = wideOrbit(serviceContext);
  if (woAdvertiserRegistry)
    adapterMapping[woAdvertiserRegistry] = wideOrbit(serviceContext);
  if (csrdsRegistry)
    adapterMapping[csrdsRegistry] = csrdsAutomation(serviceContext);
  if (iMediaTouchRegistry)
    adapterMapping[iMediaTouchRegistry] = iMediaTouch(serviceContext);
  if (audioVaultRegistry)
    adapterMapping[audioVaultRegistry] = audioVault(serviceContext);

  app.post(apiPath, async (req, res) => {
    const dataRegistryMetadataId =
      req.context.tokenInfo.json.dataRegistryMetadataId;
    if (!dataRegistryMetadataId) {
      const tokenPrefix = req.context.authToken.substring(0, 10);
      logger.warn(`Invalid token used to create sdos: ${tokenPrefix}`);
      return res.status(403).json({
        message: 'Token is not authorized to create structured data objects'
      });
    }

    if (_.isNil(req.context.requestInfo)) req.context.requestInfo = {};
    req.context.requestInfo.correlationId =
      req.headers['veritone-correlation-id'];
    req.context.requestInfo.requestId = req.headers['veritone-request-id'];

    const sdoAdapter = adapterMapping[dataRegistryMetadataId];
    const sdos = [];
    if (sdoAdapter) {
      try {
        if (req.body && req.body.data && _.isString(req.body.data)) {
          // strip unescaped control characters (https://www.json.org/json-en.html)
          req.body.data = req.body.data.replace(/[\x00-\x1F]/g, ''); //eslint-disable-line no-control-regex
        }
        const events = await sdoAdapter.createEvents(
          dataRegistryMetadataId,
          req
        );

        if (!_.isEmpty(events)) {
          sdos.push(...events);
        }
      } catch (err) {
        logger.error(
          `Failed to create events for ${JSON.stringify(req.body)}`,
          err
        );
        return res
          .status(400)
          .json({ message: 'Error parsing request to structured data object' });
      }
    } else {
      // Generic case, used for debugging
      if (_.isArray(req.body)) sdos.push(...req.body);
      else if (_.isString(req.body)) {
        try {
          const body = JSON.parse(req.body);
          sdos.push(body);
        } catch (e) {
          logger.warn(`Failed to parse body to sdo`, e);
          sdos.push({ dataString: req.body });
        }
      } else {
        sdos.push({ data: req.body });
      }
    }

    if (_.isEmpty(sdos)) {
      logger.warn(`Received no sdos ${JSON.stringify(req.body)}`);
      // Don't want to throw error for cases where they send errors as part of
      // request which we just log and discard
      return res.send(204);
    }

    try {
      const schema = await getLatestPublishedSchema(req.context);
      const createSDOs = _.map(sdos, async (data) => {
        // Allow SDO adapters to store in VTN standard playout schema
        const sid = _.get(data, 'dataRegistryId');
        const schemaId = _.isNil(sid) ? schema.id : sid;
        const args = {
          organizationId: req.context.tokenInfo.organization.organizationId,
          input: {
            schemaId: schemaId,
            id: data.id,
            data
          }
        };
        try {
          return await structuredDataDal.createStructuredData(
            args,
            req.context
          );
        } catch (e) {
          if (_.get(e, 'data')) {
            logger.error(JSON.stringify(e.data));
          }
          logger.error(
            `Error saving WideOrbit SDO\n${JSON.stringify(args)}\n${e}`
          );
          // Returning error causes Wide Orbit to abort sending data.
          // The WO adapter also aborts when WO service returns error leading to stuck pipeline.
          return data;
        }
      });

      const results = await Promise.all(createSDOs);

      res.status(200).json(results);
    } catch (e) {
      logger.error(e);
      res.status(400).json({
        message: _.get(e, 'message', e)
      });
    }
  });

  /**
   * Middleware to parse a JWT from a request and spoof it onto the
   * headers.authorization property as if properly sent as a Bearer token.
   */
  function preAuthParseQueryJwt(req, res, next) {
    if (!req.headers.authorization) {
      let token = _.get(req, 'body.token');
      if (!token) {
        token = _.get(req, 'query.token', 'invalid-sdo-token');
      }
      // required by core-server-base/middlewareAuth.js::detectJwt
      // let invalid tokens through so downstream middleware will throw error
      req.headers.authorization = `Bearer ${token}`;
    }
    next();
  }

  /**
   * Middleware to set requestContext on request.context required downstream.
   */
  async function postAuthRequestContext(req, res, next) {
    const organizationId = req.context.tokenInfo.organization.organizationId;
    const applicationId = await serviceContext.dal.application.getAppIdFromOrgId(
      organizationId
    );
    // required by dal/db.js::mapGraphQLToDataModel
    _.set(req, 'context.requestContext', {
      authToken: req.context.authToken,
      tokenInfo: {
        applicationId: applicationId,
        organizationId: organizationId
      }
    });
    next();
  }

  async function getLatestPublishedSchema(context) {
    const { dataRegistryMetadataId } = context.tokenInfo.json;
    const cached = await redisCache.get(
      CACHE_DATA_REGISTRY_PUBLISHED_SCHEMA_ID,
      dataRegistryMetadataId
    );
    if (cached) {
      return cached;
    }
    const { organizationId } = context.tokenInfo.organization;
    const _args = {
      status: ['published'],
      dataRegistryMetadataId: dataRegistryMetadataId,
      organizationId: organizationId
    };
    const schemas = await structuredDataDal.getSchemas(context, _args);
    if (schemas.count === 0) {
      throw new InvalidInput({
        message: `Data Registry ${dataRegistryMetadataId} has no published schemas`
      });
    }
    const schema = _.get(schemas, 'records[0]');
    await redisCache.set(
      CACHE_DATA_REGISTRY_PUBLISHED_SCHEMA_ID,
      dataRegistryMetadataId,
      schema
    );
    return schema;
  }
};
