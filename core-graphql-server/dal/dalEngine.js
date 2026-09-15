/*eslint no-undef: "error"*/
/*eslint no-const-assign: "error"*/
const { promisify } = require('util');
const _ = require('lodash');
const mapper = require('./mapper.js');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { v5: uuidv5 } = require('uuid');
const validator = require('validator');
const stringify = require('json-stable-stringify');
const url = require('url');
const semver = require('semver');
const {
  eventsMap,
  supportedEvents
} = require('@veritone/core-server-base/events-map');

module.exports = function createFunction(
  storage,
  logger,
  coreDalEngine,
  pg2,
  blls3,
  config,
  dalTDO,
  app,
  serviceContext
) {
  const engineListCache = serviceContext.engineListCache;

  const errors = require('../error')(config);
  const NotFound = errors.NotFound;
  const util = require('./util.js')(config, serviceContext);
  const entityTags = require('./entityTags.js')(serviceContext, errors);
  const _getEngineBuildReport = promisify(blls3.getEngineBuildReport);
  const storageDeleteAsset = promisify(serviceContext.storage.deleteAsset);
  const mainUtil = require('../util.js')(serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const tokenHelper = require('../modules/core-job-server/engine-runtime/token.js')(
    serviceContext
  );
  const dbConnections = serviceContext.dbConnections;
  const messageUtil = serviceContext.messageUtil;
  const dateIdUtil = require('@veritone/core-server-base/date-id.js')();

  const defaultEdgeVersion = 3;
  const maxCharsEngineName = config.maxCharsEngineName || 200;

  const jobTable = 'job_new';
  const engineReturning = {
    engine_id: 'id',
    metadata_version: 'metadata_version',
    engine_category_id: 'category_id',
    engine_name: 'name',
    engine_description: 'description',
    engine_state: 'state',
    engine_currency: 'currency',
    deployment_model: null,
    owner_organization_id: null,
    is_public: null,
    price: null,
    price_dimension: null,
    edge_version: null,
    rating: null,
    website: null,
    logo_path: null,
    icon_path: null,
    '"order"': null,
    dependency: null,
    core_job_data: null,
    fields: null,
    validation: null,
    asset: null,
    creates_recording: null,
    library_required: null,
    jwt_rights: null,
    created_date: null,
    updated_date: null,
    engine_alias_id: 'alias_id',
    engine_alias_name: 'alias_name',
    engine_alias_description: 'alias_description',
    engine_alias_logo_path: 'alias_logo_path',
    use_cases: null,
    industries: null,
    engine_manifest: null,
    single_engine_tdo_job_json: null,
    single_engine_upload_job_json: null,
    cpu_resource_mcpu: null,
    gpu_supported: null,
    gpu_tier: null,
    distribution_type: null,
    input_types: null
  };
  const engineCertificationReturning = {
    email: null,
    media_file_uri: null,
    custom_fields: null,
    is_certified: null,
    build_id_certified: null,
    data_certified: null
  };

  const buildCertificationReturning = {
    build_id: null,
    engine_id: null,
    data_certified: null
  };

  const buildReleaseNotesReturning = {
    build_id: null,
    engine_id: null,
    release_notes: null
  };

  const uuidNamespace = 'b61091ee-1e70-45e1-b2c3-475177e8289d';
  const engineListKey = 'EngineList';
  const engineBuildListKey = 'getEngineBuilds';
  const engineBuildTimestampKey = 'getEngineBuildsTimestamp';
  const engineListTTLInMinutes = _.get(
    config,
    'engineCache.engineListTTLInMinutes',
    5
  ); // 5 min

  let engineListCacheTimestamp;

  const engineOrderByMap = {
    name: 'e.engine_name',
    id: 'e.engine_id',
    state: 'e.engine_state',
    createdDateTime: 'e.created_date',
    modifiedDateTime: 'e.updated_date',
    price: 'e.price',
    rating: 'e.rating',
    type: 'LOWER(et.engine_type_name)',
    runtimeType: 'b.task_runtime',
    category: 'LOWER(ec.engine_category_name)',
    deploymentModel: 'e.deployment_model',
    mode: `e.engine_manifest ->> 'engineMode'`,
    libraryRequired: 'e.library_required'
  };
  const orderDirectionMap = {
    desc: 'DESC',
    asc: 'ASC'
  };

  // base state actions (state: [actions])
  const engineStateActions = {
    base: {
      draft: [],
      pending: [],
      ready: [],
      active: [],
      disabled: [],
      deleted: []
    }
  };
  const buildStateActionsInEngineStates = {
    base: engineStateActions.base
  };
  const buildStateActions = {
    base: {
      fetching: [],
      invalid: [],
      uploaded: [],
      pending: [],
      approved: [],
      disapproved: [],
      deployed: [],
      deployFailed: [],
      paused: [],
      deleted: []
    }
  };
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const aliasedEngineFields = [
    'engineAliasId',
    'engineAliasName',
    'engineAliasDescription',
    'engineAliasLogoPath'
  ];
  const filteredEngineFields = aliasedEngineFields.concat(['coreJobData']);
  const engineReplacementReturining = {
    source_engine_id: null,
    organization_id: null,
    replacement_engine_id: null,
    payload_func: null
  };

  const jwtRightsVersion = 2;

  // engine state actions
  engineStateActions.default = _.mergeWith(
    {
      draft: ['edit', 'delete'],
      pending: ['edit', 'delete'],
      ready: ['edit', 'delete', 'disable'],
      active: ['disable'],
      disabled: ['edit', 'delete', 'enable']
    },
    engineStateActions.base,
    customizer
  );
  engineStateActions.admin = _.mergeWith(
    {
      active: ['edit', 'delete'],
      deleted: ['undelete']
    },
    engineStateActions.default,
    customizer
  );
  // build state actions in engine states
  buildStateActionsInEngineStates.default = _.mergeWith(
    {
      draft: [],
      pending: [
        'invalidate',
        'upload',
        'approve',
        'disapprove',
        'deploy-sb',
        'submit',
        'delete',
        'undelete'
      ], // admin
      ready: [
        'deploy',
        'unpause',
        'invalidate',
        'upload',
        'approve',
        'disapprove',
        'submit',
        'delete',
        'undelete'
      ], // admin
      active: [
        'deploy',
        'pause',
        'unpause',
        'invalidate',
        'upload',
        'approve',
        'disapprove',
        'submit',
        'delete',
        'undelete'
      ], // admin
      disabled: [
        'invalidate',
        'upload',
        'approve',
        'disapprove',
        'submit',
        'delete',
        'undelete'
      ], // admin
      deleted: []
    },
    buildStateActionsInEngineStates.base,
    customizer
  );
  // build state actions
  buildStateActions.default = _.mergeWith(
    {
      fetching: [],
      invalid: ['delete'],
      uploaded: ['deploy-sb', 'delete'],
      available: ['submit', 'delete'],
      pending: ['approve'],
      approved: ['deploy', 'delete', 'disapprove'],
      disapproved: ['delete'],
      deploying: [],
      deployed: ['pause'],
      deployFailed: ['deploy', 'delete'],
      paused: ['unpause', 'delete'],
      deleted: []
    },
    buildStateActions.base,
    customizer
  );
  buildStateActions.admin = _.mergeWith(
    {
      pending: ['approve', 'disapprove', 'delete'],
      disapproved: ['approve'],
      deploying: ['delete'],
      deployed: ['delete'],
      deleted: ['undelete'],
      fetching: ['invalidate']
    },
    buildStateActions.default,
    customizer
  );
  // note: this is based off of base
  buildStateActions.dockerAdmin = _.mergeWith(
    {
      fetching: ['invalidate', 'upload'],
      uploaded: ['invalidate'],
      available: ['invalidate']
    },
    buildStateActions.base,
    customizer
  );

  function customizer(objValue, srcValue) {
    if (_.isArray(objValue)) {
      return objValue.concat(srcValue);
    }
  }

  async function getIdById(context, engineId) {
    if (!engineId) return engineId;
    let res = engineId;
    try {
      const engine = await getEngine(context, { id: engineId }, true);
      res = getId(context, engine);
    } catch (err) {
      // on engine not found, just return incoming id
    }
    return res;
  }

  /**
   * Returns the engine category ID for the given engine ID.
   * @param {Object} context - request context
   * @param {string} engineId - engine ID
   * @returns {Promise<string|null>} engine category ID or null if not found
   */
  async function getEngineCategoryId(context, engineId) {
    if (!engineId) return null;
    try {
      const engine = await getEngine(context, { id: engineId }, true);
      return engine.engineCategoryId ?? engine.categoryId ?? null;
    } catch (err) {
      logger.warn("Error getting engine category id for engine " + engineId + ": " + err);
      return null;
    }
  }

  function getId(context, engine) {
    const internalId = engine.internalId || engine.id;
    return checkOrgShowInternalEngine(context, engine)
      ? internalId
      : engine.aliasId || internalId;
  }

  function getName(context, engine) {
    return checkOrgShowInternalEngine(context, engine)
      ? engine.name
      : engine.aliasName || engine.name;
  }

  function getLogoPath(context, engine) {
    return checkOrgShowInternalEngine(context, engine)
      ? engine.logoPath
      : engine.aliasLogoPath || engine.logoPath;
  }

  function getDescription(context, engine) {
    return checkOrgShowInternalEngine(context, engine)
      ? engine.description
      : engine.aliasDescription || engine.description;
  }

  function checkOrgShowInternalEngine(context, engine) {
    const showInternalEngineFields = _.get(
      context._authInfo,
      'organization.kvp.showInternalEngineFields'
    );
    const apiTokenType = resUtil.getTokenType(context);
    const clientInfo = resUtil.getClientInfo(context);
    // VTN-8917 - if user's org own the engine, we'll show the real values
    const isOwner =
      clientInfo.org &&
      _.toString(engine.ownerOrganizationId) === _.toString(clientInfo.org);
    // if internal fields are enabled on the org, we'll show the real values
    // if requested by an internal token, we'll also show the real value
    const internalEnabled =
      (showInternalEngineFields && showInternalEngineFields === 'enabled') ||
      (apiTokenType && apiTokenType === 'internal');

    return isOwner || internalEnabled;
  }

  async function putToCache(engine, extraId) {
    // add current org to allowed orgs
    const orgIds = _.get(engine, '_allowedOrgs', []);
    engine._allowedOrgs = orgIds;

    if (engine.id)
      await serviceContext.redisCache.set(
        engineListKey,
        engine.id,
        engine,
        null,
        engineListTTLInMinutes
      );
    if (engine.aliasId)
      await serviceContext.redisCache.set(
        engineListKey,
        engine.aliasId,
        engine,
        null,
        engineListTTLInMinutes
      );
    if (extraId && extraId !== engine.id && extraId !== engine.aliasId) {
      await serviceContext.redisCache.set(
        engineListKey,
        extraId,
        engine,
        null,
        engineListTTLInMinutes
      );
    }
  }

  async function getFromCache(engineId) {
    const engine = await serviceContext.redisCache.get(engineListKey, engineId);
    return engine;
  }

  async function deleteCache(engineId) {
    if (!_.isNil(engineId))
      await serviceContext.redisCache.clear(engineListKey, engineId);
  }

  async function getEngine(context, args, allowCached) {
    if (!args.id) {
      throw new Error('args.id is required'); // internal server bug check
    }
    // if the cache is dirty, getEngines will refresh it and cache the latest value
    const isCacheDirty = await serviceContext.redisCache.isCacheDirty(
      engineListKey,
      engineListCacheTimestamp
    );
    let res;
    if (!isCacheDirty) {
      res = await getFromCache(args.id);
    }

    if (res) {
      // allowCached allows caller to bypass authorized. this is used only
      // when access to the engine has already been authorized.
      if (!allowCached) {
        // if args is scoped by org ID and the set of allowed org IDs
        // on the engine does not include the current org ID, clear it
        // to force a fetch by authorized query
        if (
          args.organizationId &&
          !(res._allowedOrgs.includes(args.organizationId) || res.isPublic)
        ) {
          res = null;
        }
      }
    }
    if (!res) {
      // note that this function will authorize by org ID
      const data = await getEngines(context, args);

      if (!(data && data.records && data.records.length)) {
        throw new NotFound({
          data: {
            objectId: args.id || _.first(args.ids),
            objectType: 'Engine'
          }
        });
      }
      res = data.records[0];
      res._allowedOrgs = args.organizationId ? [args.organizationId] : [];
      await putToCache(res, args.id);
    }

    return res;
  }

  async function getEngineBuildReport(engineId, buildId) {
    try {
      return await _getEngineBuildReport(engineId, buildId);
    } catch (err) {
      // note that this is a normal occurence. it just means
      // that no build report has been generated or uploaded to S3.
      logger.warn(
        'error getting report for ' + buildId + ':  ' + JSON.stringify(err)
      );
      return {};
    }
  }

  function toTitleCase(word) {
    let outString = word.toLowerCase().split(' ');
    for (let i = 0; i < outString.length; i++) {
      outString[i] =
        outString[i].charAt(0).toUpperCase() + outString[i].slice(1);
    }
    return outString.join(' ');
  }

  function removePunctuation(word) {
    let outString = word.replace(/[^a-zA-Z0-9- ]/g, '');
    return outString;
  }

  function getDefaultEngineName(
    engineCategory,
    engineMode,
    orgName,
    edgeVersion
  ) {
    orgName = removePunctuation(orgName);
    engineMode = toTitleCase(engineMode);
    engineCategory = toTitleCase(engineCategory);
    edgeVersion = _.isUndefined(edgeVersion) ? defaultEdgeVersion : edgeVersion;
    // prettier-ignore
    return `${engineCategory}-${orgName}-${engineMode ? engineMode + '-' : ''}V${edgeVersion}`;
  }

  async function createEngine(args, context) {
    try {
      const input = args.input;
      const engineCreate = JSON.parse(JSON.stringify(input));

      engineCreate.deploymentModel = mapper.mapDeploymentModelIn(
        engineCreate.deploymentModel
      );

      if (input.distributionType === 'public') {
        engineCreate.isPublic = true;
      }

      if (input.fields) {
        engineCreate.fields = mapper.mapEngineFieldsIn(input.fields);
      }

      if (input.standaloneJobTemplates) {
        _.assign(
          engineCreate,
          ...mapper.mapEngineStandaloneJobTemplateIn(
            input.standaloneJobTemplates
          )
        );
      }

      engineCreate.organizationId = args.organizationId;

      // TODO currently core-job does not accept this input on
      // engine creation. it's commented out of the graphql schema.
      // we'll add later once core-job is enhanced.
      if (input.dependency) {
        engineCreate.dependency = {
          engine: input.dependency.dependencyType,
          assetType: input.dependency.assetType
        };
      }

      if (input.jwtRights) {
        if (input.isPublic) {
          throw new errors.NotAllowed({
            message: 'not allow to create jwtRights for public engines',
            data: {
              objectType: 'Engine isPublic',
              objectData: input.isPublic
            }
          });
        }
        
        const restrictedPermissions = _.get(config, 'rbac.permissions.blacklist', []);
        engineCreate.jwtRights = mapper.mapEngineJwtRights(input.jwtRights, restrictedPermissions);

        const useRBACFeature = await mainUtil.isEnableFeatureInOrganization(
          context,
          undefined,
          args.organizationId,
          'enableRBACFeature'
        );
        if (useRBACFeature) {
          // Stamp the jwtRights version on create only. This provides the ability
          // to make decisions on how to handle legacy and non olp-for-sdo enabled versions.
          engineCreate.jwtRights.version = jwtRightsVersion;
        }
      }

      if (!validator.isUUID(engineCreate.categoryId)) {
        throw new errors.InvalidInput({
          message: 'Invalid engine category id',
          data: {
            objectId: input.categoryId,
            objectType: 'Engine category ID'
          }
        });
      }

      const engineCategory = await serviceContext.dal.engineCategory.getEngineCategory(
        context,
        {
          id: engineCreate.categoryId,
          organizationId: engineCreate.organizationId
        },
        true
      );

      if (_.isNil(engineCategory)) {
        throw new errors.NotFound({
          message: 'CategoryId is invalid or disabled for current organization',
          data: {
            categoryId: engineCreate.categoryId,
            organizationId: engineCreate.organizationId
          }
        });
      }

      let newEngineName = _.get(input, 'name');
      const edgeVersion = input.edgeVersion || defaultEdgeVersion;
      if (!input.name) {
        let orgName;
        if (input.organizationName) {
          orgName = input.organizationName;
        } else {
          const org = await serviceContext.dal.organization.getOrganization(
            context,
            {
              id: input.organizationId
            }
          );
          orgName = org.organizationName;
        }

        const engineCategoryName = engineCategory.name;
        const engineMode = input.manifest.engineMode || '';
        const defaultEngineName = getDefaultEngineName(
          engineCategoryName,
          engineMode,
          orgName,
          edgeVersion
        );
        newEngineName = defaultEngineName;
      } else {
        if (input.name.length > maxCharsEngineName) {
          throw new errors.InvalidInput({
            message:
              'Invalid name provided - name length must be less than ' +
              maxCharsEngineName +
              ' characters.',
            data: {
              newEngineName
            }
          });
        }
      }
      engineCreate.name = newEngineName;
      engineCreate.edgeVersion = edgeVersion;
      engineCreate.coreJobData = engineCategory.dependencies;
      engineCreate.inputTypes = _.get(
        input.manifest,
        'supportedInputTypes',
        null
      );

      const isTranscriptionEngine = engineCategory.name === 'Transcription';
      const isIngestionEngine =
        engineCategory.typeId === '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d';
      if (isIngestionEngine) {
        engineCreate.createsTDO = true;
      }

      const engine = await insertEngine(
        engineCreate,
        isTranscriptionEngine,
        context
      );
      const payload = {
        action: 'create',
        userInfo: context._authInfo,
        engineId: engine.id,
        engineName: engine.name,
        ownerOrganizationId: engine.ownerOrganizationId,
        updatedFields: {
          price: engine.price
        },
        statusCode: 201
      };
      await emitEngineEvent(
        {
          ...context,
          originalUrl: _.get(context, 'requestInfo.httpUrl'),
          organizationId: args.organizationId
        },
        payload,
        eventsMap.EngineCreate
      );
      emitPublicEngineEvent(context, supportedEvents.EngineCreate, payload);
      // invalidate cache to force fetch from the db for next get engine.
      await serviceContext.redisCache.markCacheDirty(engineListKey);

      // if schemas field is in input, synchronize engine__schema table with corresponding rows
      const hasSchemas = 'schemas' in input;
      if (hasSchemas && !_.isEmpty(input.schemas)) {
        const schemaIds = input.schemas.map(s => s.schemaId);
        const result = await serviceContext.dal.structuredData.getSchemas(
          context,
          { ids: schemaIds, _skipAccessCheck: false }
        );
        const foundSchemaIds = result.records.map(s => s.id);
        const missingSchemaIds = _.difference(schemaIds, foundSchemaIds);
        if (!_.isEmpty(missingSchemaIds)) {
          throw new errors.NotFound({
            data: {
              objectIds: missingSchemaIds,
              objectType: 'Schema'
            }
          });
        }
        const updatedSchemas = await updateEngineSchemas(
          engine.id,
          input.schemas
        );
        engine.schemas = updatedSchemas;
      }

      // if entityTags field is in input, synchronize entity_tags table with corresponding rows
      const tagData = {
        entityId: engine.id,
        organizationId: args.organizationId,
        entityType: 'engine',
        entityTags: input.entityTags
      };
      await entityTags.updateEntityTags(tagData, engine, context);

      return engine;
    } catch (err) {
      emitPublicEngineEvent(
        context,
        supportedEvents.EngineCreate,
        { ...args.input },
        err
      );
      throw err;
    }
  }

  const engineJSON = {
    name: '',
    description: '',
    categoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
    deploymentModel: 'NonNetworkIsolated',
    manifest: {
      runtime: 'nodeRed',
      engineMode: 'chunk',
      supportedInputTypes: ['application/json']
    },
    distributionType: ''
  };

  const automateEngineJWTRights = {
    roles: [
      {
        roleName: 'workflow',
        taskRights: [
          'job:create',
          'job:read',
          'job:update',
          'job:delete',
          'recording:create',
          'recording:read',
          'recording:update',
          'recording:delete',
          'mentions:create',
          'mentions:read',
          'mentions:update',
          'mentions:delete',
          'collection:create',
          'collection:read',
          'collection:update',
          'collection:delete',
          'asset:uri',
          'asset:all',
          'task:update',
          'report:create',
          'analytics:usage'
        ],
        assetRights: ['recording:update']
      }
    ]
  };

  async function validateFlowName(context, args, flowName) {
    const getFlowOptions = {
      filter: { exactName: flowName },
      owned: false,
      limit: 1,
      categoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
      organizationId: args.organizationId
    };

    const nameMatchedFlows = await getEngines(context, getFlowOptions);
    if (
      nameMatchedFlows &&
      !_.isEmpty(nameMatchedFlows.records) &&
      nameMatchedFlows.records[0].name.toLowerCase() === flowName.toLowerCase()
    ) {
      throw new errors.InvalidInput({
        message: `Duplicate or Invalid flow name`,
        data: {
          objectId: args.input.name,
          objectType: 'Engine Name'
        }
      });
    }
  }

  async function createAutomateFlow(args, context) {
    const newEngineJSON = engineJSON;

    //this can be added as a graphql paramater in the future
    newEngineJSON.distributionType = 'private';
    const engineMode = newEngineJSON.manifest.engineMode;

    let flows = [];
    let flowPackage = {};
    newEngineJSON.name = args.input.name;

    if (args.input && args.input.templateId) {
      let templateDataResponse;
      let templateData;
      try {
        templateDataResponse = await serviceContext.dal.flowTemplate.getFlowTemplates(
          context,
          {
            id: args.input.templateId
          }
        );
      } catch (flowErr) {
        //This fallback is used if a template is not found using the given ID. It tries to find an engine with the given ID to copy the name.
        //If the get engine call fails the call will fail for invalid templateId
        try {
          templateData = await getEngine(context, {
            id: args.input.templateId
          });
        } catch (engineErr) {
          throw new errors.InvalidInput({
            message: `Invalid template id. Flow template error: '${flowErr.message}' Engine fallback error: '${engineErr.message}'`,
            data: {
              objectId: args.input.templateId,
              objectType: 'Engine ID'
            }
          });
        }
      }
      if (templateDataResponse) {
        templateData = templateDataResponse.records[0];
      }

      const flowJson = _.get(templateData, 'flow');
      if (flowJson) {
        flows = JSON.parse(Buffer.from(flowJson, 'base64').toString());
      }

      const flowPackageTemp = _.get(templateData, 'package');
      if (flowPackageTemp) {
        flowPackage = JSON.parse(
          Buffer.from(flowPackageTemp, 'base64').toString()
        );
      }

      const templateName = _.get(templateData, `title`, newEngineJSON.name);
      if (templateName !== newEngineJSON.name) {
        newEngineJSON.name = `${newEngineJSON.name} - ${templateName}`;
      }
      newEngineJSON.description = _.get(templateData, `subtitle`, '');
    }
    await validateFlowName(context, args, newEngineJSON.name);

    try {
      const org = await serviceContext.dal.organization.getOrganization(
        context,
        {
          id: args.organizationId
        }
      );
      newEngineJSON.organizationName = _.get(
        org,
        'organizationName',
        'Veritone, Inc'
      );
    } catch (e) {
      newEngineJSON.organizationName = 'Veritone, Inc';
    }

    const engine = await createEngine(
      { input: newEngineJSON, organizationId: args.organizationId },
      context
    );
    const engineId = engine.id;

    let version = {
      studio: 'registry.central.aiware.com/node-red-v3:stable',
      runner: 'registry.central.aiware.com/node-red-runner-v3:stable'
    };
    let fetchedNodeRedVersion = await serviceContext.dal.flowRevision.getControllerNodeRedImageVersion(
      serviceContext
    );
    version.studio = _.get(fetchedNodeRedVersion, 'studio', version.studio);
    version.runner = _.get(fetchedNodeRedVersion, 'runner', version.runner);
    let controllerNodeRedImage = version.runner;

    const manifest = { runtime: 'nodeRed', engineId, engineMode };
    const JWTRights = automateEngineJWTRights;
    const dockerImage = controllerNodeRedImage;

    const taskRuntime = {
      edge: {},
      nodeRed: {
        version: version,
        flows,
        package: flowPackage,
        applicationId: args.input ? args.input.linkedApplicationId : null
      }
    };
    const createBuildAndUpdateRightsVariables = {
      engineId,
      manifest,
      taskRuntime,
      dockerImage
    };

    const updatedEngineData = await createEngineBuild(
      {
        input: createBuildAndUpdateRightsVariables,
        organizationId: args.organizationId
      },
      context
    );

    // Moved from createEngineBuild as this also sets the engine state to ready. Which is the required base state of automate.
    // This was how the original create automate flow was implemented in aiware-apps
    await updateEngine(
      {
        input: { jwtRights: JWTRights, id: updatedEngineData.engineId }
      },
      context
    );

    return { engineId: updatedEngineData.engineId, build: updatedEngineData };
  }

  async function getEngineSchemas(engineId) {
    const sql = `
      SELECT
        engine_id,
        schema_id,
        io_type
        from ${jobTable}.engine__schema
      WHERE
        engine_id = $1
    `;

    return await serviceContext.dbConnections['core'].read.map(
      sql,
      [engineId],
      mapper.mapEngineSchemas
    );
  }

  const emitPublicEngineEvent = async (req, eventName, payload, error) => {
    const engineId = _.get(payload, 'engineId') || _.get(payload, 'id');
    const actionMap = {
      EngineCreate: {
        action: 'create',
        description: (error) => !error ? `Created engine ${engineId}` : 'Failed to create new engine'
      },
      EngineUpdate: {
        action: 'update',
        description: (error) => !error ? `Updated engine ${engineId}` : `Failed to update engine ${engineId}`
      },
      EngineDisable: {
        action: 'update',
        description: (error) => !error ? `Disabled engine ${engineId}` : `Failed to disable engine ${engineId}`
      },
      EngineEnable: {
        action: 'update',
        description: (error) => !error ? `Enabled engine ${engineId}` : `Failed to enable engine ${engineId}`
      }
    };
    const event = {
      engineId,
      engineName: _.get(payload, 'engineName'),
      ownerOrganizationId:
        _.get(payload, 'organizationId') ||
        _.get(payload, 'ownerOrganizationId'),
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        engineId,
        error,
        actionMap[eventName]?.action,
        !error ? 'success' : 'failure',
        actionMap[eventName]?.description(error)
      )
    };

    await messageUtil.emitPublicEvent(eventName, 'system', req, event);
  };

  async function emitEngineEvent(req, payload, privateEventTypeInfo) {
    const {
      event: privateEvent,
      name: privateEventName,
      type: privateEventType
    } = privateEventTypeInfo;

    if (_.isNil(privateEvent)) {
      logger.warn(
        `(emitEngineEvent) the provided event in privateEventTypeInfo was null`
      );
      return;
    }

    if (_.isNil(privateEventName)) {
      logger.warn(
        `(emitEngineEvent) the provided name in privateEventTypeInfo was null`
      );
      return;
    }

    if (_.isNil(privateEventType)) {
      logger.warn(
        `(emitEngineEvent) the provided type in privateEventTypeInfo was null`
      );
      return;
    }

    const userInfo = payload.userInfo;
    const tokenInfo = payload.tokenInfo;
    const engineEvent = {
      event: privateEvent,
      type: privateEventType,
      serviceName: 'core-graphql-server',
      requestUrl: req.originalUrl,
      action: payload.action,
      engineId: payload.engineId,
      success: 201,
      updatedFields: payload.updatedFields,
      statusCode: payload.statusCode,
      organizationId: req.organizationId
    };

    if (userInfo) {
      engineEvent.userId = _.get(userInfo, 'userId');
    } else if (tokenInfo) {
      engineEvent.tokenId = _.get(tokenInfo, 'tokenId');
    }
    try {
      await messageUtil.emitEvent(engineEvent, 'events');
    } catch (err) {
      serviceContext.logger.error(err);
    }
  }

  async function insertEngine(engine, isTranscriptionEngine, context) {
    if (!engine.id) {
      engine.id = uuidv4();
    }
    const columnData = {
      engine_id: engine.id,
      metadata_version: engine.metadataVersion,
      engine_category_id: engine.categoryId,
      engine_name: engine.name,
      engine_description: engine.description || '',
      engine_state: engine.state || 'pending',
      engine_currency: engine.currency || 'USD',
      deployment_model: engine.deploymentModel || 0,
      owner_organization_id: engine.organizationId,
      is_public: !!engine.isPublic,
      price: engine.price,
      price_dimension: engine.priceDimension
        ? _.toLower(engine.priceDimension)
        : null,
      edge_version: engine.edgeVersion,
      asset: isTranscriptionEngine ? engine.id : engine.asset,
      dependency: engine.dependency,
      logo_path: engine.logoPath,
      icon_path: engine.iconPath,
      website: engine.website,
      rating: engine.rating,
      core_job_data: engine.coreJobData || {},
      fields: engine.fields ? JSON.stringify(engine.fields) : '[]',
      validation: engine.validation,
      creates_recording: !!engine.createsTDO,
      library_required: !!engine.libraryRequired,
      engine_alias_id: engine.id,
      use_cases: engine.useCases ? JSON.stringify(engine.useCases) : '[]',
      industries: engine.industries ? JSON.stringify(engine.industries) : '[]',
      engine_manifest: engine.manifest || null,
      jwt_rights: engine.jwtRights || null,
      single_engine_tdo_job_json: engine.reprocessJobDAG || null,
      single_engine_upload_job_json: engine.uploadJobDAG || null,
      cpu_resource_mcpu: engine.cpuResourceMcpu || 1024,
      gpu_supported: engine.gpuSupported || 'none',
      gpu_tier: engine.gpuTier || 'none',
      distribution_type: engine.distributionType || 'private',
      input_types: engine.inputTypes || null
    };

    // make and run script for creating engine
    const { sql, values } = mainUtil.makeInsertSql(
      `${jobTable}.engine`,
      columnData,
      engineReturning
    );

    let newEngine = await dbConnections['core'].write.map(
      sql,
      values,
      mapper.mapEngine
    );
    newEngine = _.get(newEngine, '0');

    let testingDetails = { ...engine.testingDetails };
    if (!_.isEmpty(testingDetails)) {
      delete engine.testingDetails;

      const createdBy =
        _.get(context, 'requestContext.userInfo.userId') ||
        _.get(context, 'requestContext.tokenInfo.applicationId', 'system');

      // make and run script for engine certification
      testingDetails = {
        email: testingDetails.email,
        media_file_uri: testingDetails.mediaFileUri
          ? testingDetails.mediaFileUri
          : null,
        custom_fields: testingDetails.customFields
          ? JSON.stringify(testingDetails.customFields)
          : null,
        created_by: createdBy,
        engine_id: newEngine.id,
        is_certified: false,
        build_id_certified: null,
        data_certified: null
      };

      const { sql, values } = mainUtil.makeInsertSql(
        `${jobTable}.engine_certification`,
        testingDetails,
        engineCertificationReturning
      );
      await dbConnections['core'].write.map(
        sql,
        values,
        mapper.mapEngineCertification
      );
    }

    serviceContext.dal.packages.updatePublicEngineList(newEngine, context);

    return { ...newEngine };
  }

  async function _deleteEngineSchemas(engineId) {
    const sql = `
      DELETE
        from ${jobTable}.engine__schema
      WHERE
        engine_id = '${engineId}'
      RETURNING
        engine_id
    `;

    return await serviceContext.dbConnections['core'].write.query(sql);
  }

  async function _updateEngineSchemasDb(engineId, schemas) {
    let valuesSql = [];
    const values = [];
    schemas.forEach((schema, index) => {
      const multiplier = index * 3;
      valuesSql.push(
        `($${multiplier + 1}, $${multiplier + 2}, $${multiplier + 3})`
      );
      values.push(engineId, schema.schemaId, schema.ioType);
    });

    valuesSql = valuesSql.join(',');

    let sql = `
      DELETE
        from ${jobTable}.engine__schema
      WHERE
        engine_id = $1;

      INSERT INTO ${jobTable}.engine__schema (
        engine_id,
        schema_id,
        io_type
      )
      VALUES
          ${valuesSql}
      RETURNING
        engine_id,
        schema_id,
        io_type;

    `;

    const results = await serviceContext.dbConnections['core'].write.query(
      sql,
      values
    );

    return results;
  }

  async function updateEngineSchemas(engineId, schemas) {
    let results;
    try {
      if (_.isEmpty(schemas)) {
        results = await _deleteEngineSchemas(engineId);
      } else {
        results = await _updateEngineSchemasDb(engineId, schemas);
      }

      return results;
    } catch (err) {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError();
    }
  }

  async function updateEngine(args, context) {
    const input = args.input;
    try {
      const engine = await getEngine(context, { id: input.id });
      const depModel = input.deploymentModel
        ? mapper.mapDeploymentModelIn(input.deploymentModel)
        : mapper.mapDeploymentModelIn(engine.deploymentModel);
      let fieldsIn = engine.fields;
      if (input.fields) fieldsIn = mapper.mapEngineFieldsIn(input.fields);
      if (input.categoryId && !validator.isUUID(input.categoryId)) {
        throw new errors.InvalidInput({
          message: 'Invalid engine category id',
          data: {
            objectId: input.categoryId,
            objectType: 'Engine category ID'
          }
        });
      }
      if (input.name && input.name.length > maxCharsEngineName) {
        let newEngineName = input.name;
        throw new errors.InvalidInput({
          message:
            'Invalid name provided - name length must be less than ' +
            maxCharsEngineName +
            ' characters.',
          data: {
            newEngineName
          }
        });
      }
      const edgeVersion =
        input.edgeVersion || engine.edgeVersion || defaultEdgeVersion;
      if (
        input.metadataVersion &&
        engine.metadataVersion >= input.metadataVersion
      ) {
        throw new errors.InvalidInput({
          message:
            'The engine metadata version specified must be greater than ' +
            engine.metadataVersion,
          data: {
            metadataVersion: input.metadataVersion
          }
        });
      }

      const post = {
        metadataVersion: input.metadataVersion,
        engineId: input.id,
        engineName: input.name || engine.name,
        engineCategoryId: input.categoryId || engine.categoryId,
        isPublic:
          _.isUndefined(input.isPublic) || _.isNil(input.isPublic)
            ? engine.isPublic
            : input.isPublic,
        engineDescription: input.description || engine.description || '',
        createsRecording: _.isNil(input.createsTDO) // TODO not in core-job
          ? engine.createsRecording
          : input.createsTDO,
        deploymentModel: depModel,
        logoPath: _.isNil(input.logoPath)
          ? engine.logoPath
          : stripOwnedStorageUrlSignature(input.logoPath),
        iconPath: _.isNil(input.iconPath)
          ? engine.iconPath
          : stripOwnedStorageUrlSignature(input.iconPath),
        price: input.price || engine.price,
        priceDimension: input.priceDimension
          ? _.toLower(input.priceDimension)
          : engine.priceDimension,
        edgeVersion: edgeVersion,
        asset: input.asset || engine.asset,
        displayName: input.displayName || engine.displayName,
        validateUri: input.validateUri || engine.validateUri,
        executeUri: input.executeUri || engine.executeUri,
        website: input.website || engine.website,
        rating: input.rating || engine.rating,
        fields: fieldsIn,
        libraryRequired: _.isNil(input.libraryRequired)
          ? engine.libraryRequired
          : input.libraryRequired,
        ownerOrganizationId: engine.ownerOrganizationId,
        useCases: input.useCases || engine.useCases,
        industries: input.industries || engine.industries,
        engineManifest: input.manifest || engine.engineManifest,
        cpuResourceMcpu: input.cpuResourceMcpu || engine.cpuResourceMcpu,
        gpuSupported: input.gpuSupported || engine.gpuSupported,
        gpuTier: input.gpuTier || engine.gpuTier,
        distributionType: input.distributionType || engine.distributionType
      };

      const updatedBy =
        _.get(context, 'requestContext.userInfo.userId') ||
        _.get(context, 'requestContext.tokenInfo.applicationId', 'system');

      if (input.testingDetails) {
        let testingDetails = await getTestingDetails(context, engine);

        const { sql, values } = _.isUndefined(testingDetails)
          ? mainUtil.makeInsertSql(
              `${jobTable}.engine_certification`,
              {
                engine_id: engine.id,
                email: input.testingDetails.email,
                media_file_uri: input.testingDetails.mediaFileUri
                  ? input.testingDetails.mediaFileUri
                  : null,
                custom_fields: input.testingDetails.customFields
                  ? JSON.stringify(input.testingDetails.customFields)
                  : null,
                updated_by: updatedBy,
                updated_at_utc: moment.utc(),
                is_certified: input.testingDetails.isCertified
                  ? input.testingDetails.isCertified
                  : false,
                build_id_certified: input.testingDetails.buildIdCertified
                  ? input.testingDetails.buildIdCertified
                  : null,
                data_certified: input.testingDetails.dataCertified
                  ? input.testingDetails.dataCertified
                  : null
              },
              engineCertificationReturning
            )
          : mainUtil.makeUpdateSql(
              `${jobTable}.engine_certification`,
              {
                engine_id: engine.id,
                email: input.testingDetails.email
                  ? input.testingDetails.email
                  : testingDetails.email,
                media_file_uri: input.testingDetails.mediaFileUri
                  ? input.testingDetails.mediaFileUri
                  : testingDetails.mediaFileUri,
                custom_fields: input.testingDetails.customFields
                  ? input.testingDetails.customFields
                  : testingDetails.customFields,
                updated_by: updatedBy,
                updated_at_utc: moment.utc(),
                is_certified: _.get(
                  input,
                  'testingDetails.isCertified',
                  testingDetails.isCertified
                ),
                build_id_certified: input.testingDetails.buildIdCertified
                  ? input.testingDetails.buildIdCertified
                  : testingDetails.buildIdCertified,
                data_certified: input.testingDetails.dataCertified
                  ? input.testingDetails.dataCertified
                  : testingDetails.dataCertified
              },
              engineCertificationReturning,
              'engine_id = $1'
            );

        await dbConnections['core'].write.map(
          sql,
          values,
          mapper.mapEngineCertification
        );
      }
      let updatedStandaloneJobTemplates = [];
      if (input.standaloneJobTemplates) {
        // verify permission to update template fields
        loadDeveloper(context);
        const columnData = {};
        for (const t of mapper.mapEngineStandaloneJobTemplateIn(
          input.standaloneJobTemplates
        )) {
          if (t.reprocessJobDAG) {
            columnData.single_engine_tdo_job_json = t.reprocessJobDAG;
          } else if (t.uploadJobDAG) {
            columnData.single_engine_upload_job_json = t.uploadJobDAG;
          }
        }
        if (!_.isEmpty(columnData)) {
          const { sql, values } = mainUtil.makeUpdateSql(
            `${jobTable}.engine`,
            columnData,
            {
              single_engine_tdo_job_json: null,
              single_engine_upload_job_json: null
            },
            `engine_id = '${engine.id}'`
          );
          updatedStandaloneJobTemplates = await dbConnections['core'].write.map(
            sql,
            values,
            mapper.mapEngineStandaloneJobTemplate
          );
        }
      }

      // TODO currently core-job does not accept this input on
      // engine creation. it's commented out of the graphql schema.
      // we'll add later once core-job is enhanced.
      if (input.dependency) {
        post.dependency = {
          engine:
            input.dependency.dependencyType ||
            _.get(engine, 'dependency.engine'),
          assetType:
            input.dependency.assetType || _.get(engine, 'dependency.assetType')
        };
      } else {
        post.dependency = engine.dependency;
      }

      if (input.jwtRights) {
        if (post.isPublic) {
          throw new errors.NotAllowed({
            message: 'not allow to update jwtRights for public engines',
            data: {
              objectType: 'Engine isPublic',
              objectData: post.isPublic
            }
          });
        }

        const restrictedPermissions = _.get(config, 'rbac.permissions.blacklist', []);
        post.jwtRights = mapper.mapEngineJwtRights(input.jwtRights, restrictedPermissions);
      }

      const result = await _updateEngine(args, post, context, false);

      // if iconPath is changed or deleted, delete the old icon file from S3
      if (
        !_.isEmpty(engine.iconPath) &&
        url.parse(result.iconPath || '').pathname !==
          url.parse(engine.iconPath || '').pathname
      ) {
        try {
          await storageDeleteAsset({
            _uri: engine.iconPath
          });
        } catch (err) {
          logger.error(`Error deleting engine icon: ${err}`);
        }
      }

      // if logoPath is changed or deleted, delete the old icon file from S3
      if (
        !_.isEmpty(engine.logoPath) &&
        url.parse(result.logoPath || '').pathname !==
          url.parse(engine.logoPath || '').pathname
      ) {
        try {
          await storageDeleteAsset({
            _uri: engine.logoPath
          });
        } catch (err) {
          logger.error(`Error deleting engine logo: ${err}`);
        }
      }

      // emit event for engine become private or public
      const payload = {
        action: 'update',
        engineId: input.id,
        engineName: engine.name,
        ownerOrganizationId: engine.ownerOrganizationId,
        updatedFields: { isPublic: input.isPublic },
        statusCode: 201,
        userInfo: _.get(context, 'requestContext.userInfo'),
        tokenInfo: _.get(context, 'requestContext.tokenInfo')
      };
      if (!_.isNil(input.isPublic) && input.isPublic !== engine.isPublic) {
        await emitEngineEvent(
          {
            ...context,
            originalUrl: _.get(context, 'requestInfo.httpUrl'),
            organizationId: args.organizationId
          },
          payload,
          eventsMap.EngineIsPublic
        );
      }
      emitPublicEngineEvent(context, supportedEvents.EngineUpdate, payload);

      const useAutomaticPackageCreation = await mainUtil.isOrgSettingEnabled(
        context,
        'automaticPackageCreation'
      );

      if (useAutomaticPackageCreation) {
        await createOrDuplicatePackage(context, engine);
      }

      // if schemas field is in input, synchronize engine__schema table with corresponding rows
      const hasSchemas = 'schemas' in input;
      if (hasSchemas && !_.isEmpty(input.schemas)) {
        const schemaIds = input.schemas.map(s => s.schemaId);
        const result = await serviceContext.dal.structuredData.getSchemas(
          context,
          { ids: schemaIds, _skipAccessCheck: false }
        );
        const foundSchemaIds = result.records.map(s => s.id);
        const missingSchemaIds = _.difference(schemaIds, foundSchemaIds);
        if (!_.isEmpty(missingSchemaIds)) {
          throw new errors.NotFound({
            data: {
              objectIds: missingSchemaIds,
              objectType: 'Schema'
            }
          });
        }
        const updatedSchemas = await updateEngineSchemas(
          input.engineId,
          input.schemas
        );
        result.schemas = updatedSchemas;
      }

      // if entityTags field is in input, synchronize entity_tags table with corresponding rows
      const tagData = {
        entityId: input.engineId,
        organizationId: args.organizationId,
        entityType: 'engine',
        entityTags: input.entityTags
      };
      await entityTags.updateEntityTags(tagData, result, context);

      // reset engine cache by updated engine
      result._allowedOrgs = args.organizationId ? [args.organizationId] : [];
      result.standaloneJobTemplates = updatedStandaloneJobTemplates;
      await putToCache(result);
      // reset engine cache for getting list engines
      await serviceContext.redisCache.markCacheDirty(engineListKey);
      return result;
    } catch (err) {
      emitPublicEngineEvent(context, supportedEvents.EngineUpdate, input, err);
      throw err;
    }
  }

  function stripOwnedStorageUrlSignature(url) {
    // Strip the signature of the storage uri of it matches one of our buckets.
    // A new signed url will be created when requested.
    // If the passed in value is not a string (ex. null) return as-is.
    return _.isString(url) && resUtil.isOurBucket(url)
      ? url.split('?')[0]
      : url;
  }

  async function _updateEngine(args, post, context, emitPublicEvent = true) {
    try {
      const input = args.input;

      if (!input.engineId) {
        args.input.engineId = input.id;
      }

      // verify permission
      loadDeveloper(context);
      let engine = await loadCheckEngine(args, context);
      const isAutomateFlowEngine =
        _.get(post, 'engineManifest.runtime') === 'nodeRed';
      checkEngineStateTransitionAction(
        'edit',
        engine,
        context,
        input,
        isAutomateFlowEngine
      );

      const engineUpdate = new serviceContext.coreJob.jobModel.EngineUpdate(
        post
      );
      const engineId = _.get(args, 'input.id');
      const validationErrs = engineUpdate.validate();

      engineUpdate.engineId = engineId;

      if (validationErrs) {
        throw new errors.InvalidInput({
          message: 'bad request',
          data: { validationErrs }
        });
      }

      if (
        !engineUpdate.engineCategoryId.length ||
        !uuidRegex.test(engineUpdate.engineCategoryId)
      ) {
        throw new errors.InvalidInput({
          message: 'invalid engine category id',
          data: {
            objectType: 'engineCategoryId',
            objectData: engineUpdate.engineCategoryId
          }
        });
      }

      const dbTran = await coreWriteTx();
      try {
        dbTran.begin();
        const getEngineCategoryPromise = promisify(
          serviceContext.coreJob.cjdal.engineCategory.getEngineCategory
        );
        const engineCategory = await getEngineCategoryPromise(
          engineUpdate.engineCategoryId,
          dbTran.client
        );

        engineUpdate.coreJobData =
          engineUpdate.coreJobData || engineCategory.dependencies;

        if (engineCategory.engineCategoryName === 'Transcription') {
          engineUpdate.asset = engineId;
        }

        engineUpdate.inputTypes = _.get(
          engineUpdate,
          'engineManifest.supportedInputTypes'
        );

        const updateEnginePromise = promisify(
          serviceContext.coreJob.cjdal.engine.updateEngine
        );
        await updateEnginePromise(engineUpdate, dbTran.client);
        const autoTransitionEngineStatePromise = promisify(
          serviceContext.coreJob.jobBll.engine.autoTransitionEngineState
        );
        engine = await autoTransitionEngineStatePromise(
          engine,
          dbTran.client,
          false
        );
        await dbTran.commit();
      } catch (err) {
        await dbTran.rollback();
        logger.error(err);
        throw new errors.InternalServerError();
      } finally {
        dbTran.client.done();
      }
      const payload = {
        action: 'update',
        userInfo: context._authInfo,
        engineId: engine.engineId,
        engineName: engine.engineName,
        ownerOrganizationId: engine.ownerOrganizationId,
        updatedFields: engineUpdate,
        statusCode: 201
      };
      await emitEngineEvent(
        {
          ...context,
          originalUrl: _.get(context, 'requestInfo.httpUrl'),
          organizationId: args.organizationId
        },
        payload,
        eventsMap.EngineUpdate
      );

      filterInternalEngineFieldsIfNotAllowed(context, engine);
      emitPublicEvent &&
        emitPublicEngineEvent(
          context,
          supportedEvents.EngineUpdate,
          payload,
          null
        );
      return mapper.mapEngine(engine);
    } catch (err) {
      emitPublicEvent &&
        emitPublicEngineEvent(
          context,
          supportedEvents.EngineUpdate,
          _.get(args, 'input'),
          err
        );
      throw err;
    }
  }

  async function _disableEngine(args, context) {
    const input = args.input;

    if (!input.engineId) {
      args.input.engineId = input.id;
    }
    try {
      // verify permission
      loadDeveloper(context);

      let engine = await loadCheckEngine(args, context);
      checkEngineStateTransitionAction('disable', engine, context);

      const engineId = _.get(args, 'input.id');

      const dbTran = await coreWriteTx();
      try {
        await dbTran.begin();
        const pauseDeployedBuildsForEnginePromise = promisify(
          serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine
        );
        await pauseDeployedBuildsForEnginePromise(engineId, dbTran.client);
        const updateEngineStatePromise = promisify(
          serviceContext.coreJob.cjdal.engine.updateEngineState
        );
        engine = await updateEngineStatePromise(
          engineId,
          'disabled',
          dbTran.client
        );
        await dbTran.commit();
      } catch (err) {
        await dbTran.rollback();
        logger.error(err);
        throw new errors.InternalServerError();
      } finally {
        serviceContext.dal.packages.updatePublicEngineList(engine, context);
        dbTran.client.done();
      }
      const payload = {
        action: 'disable',
        userInfo: context._authInfo,
        engineId: engine.engineId,
        engineName: engine.engineName,
        ownerOrganizationId: engine.ownerOrganizationId,
        statusCode: 200
      };
      await emitEngineEvent(
        {
          ...context,
          originalUrl: _.get(context, 'requestInfo.httpUrl'),
          organizationId: args.organizationId
        },
        payload,
        eventsMap.EngineDisable
      );
      emitPublicEngineEvent(context, supportedEvents.EngineDisable, payload);

      engine = addValidEngineStateActions(context, engine);
      engine = filterInternalEngineFieldsIfNotAllowed(context, engine);

      return mapper.mapEngine(engine);
    } catch (err) {
      emitPublicEngineEvent(context, supportedEvents.EngineDisable, input, err);
      throw err;
    }
  }

  async function _enableEngine(args, context) {
    const input = args.input;

    if (!input.engineId) {
      args.input.engineId = input.id;
    }
    try {
      // verify permission
      loadDeveloper(context);

      let engine = await loadCheckEngine(args, context);

      checkEngineStateTransitionAction('enable', engine, context);

      const autoTransitionEngineStatePromise = promisify(
        serviceContext.coreJob.jobBll.engine.autoTransitionEngineState
      );
      engine = await autoTransitionEngineStatePromise(engine, null, true);
      const payload = {
        action: 'enable',
        userInfo: context._authInfo,
        engineId: engine.engineId,
        engineName: engine.engineName,
        ownerOrganizationId: engine.ownerOrganizationId,
        statusCode: 200
      };
      await emitEngineEvent(
        {
          ...context,
          originalUrl: _.get(context, 'requestInfo.httpUrl'),
          organizationId: args.organizationId
        },
        payload,
        eventsMap.EngineEnable
      );

      engine = addValidEngineStateActions(context, engine);
      engine = filterInternalEngineFieldsIfNotAllowed(context, engine);
      emitPublicEngineEvent(context, supportedEvents.EngineEnable, payload);
      return mapper.mapEngine(engine);
    } catch (err) {
      emitPublicEngineEvent(context, supportedEvents.EngineEnable, input, err);
      throw err;
    }
  }

  async function deleteEngine(args, context) {
    const id = args.id;

    args.input = {
      engineId: id
    };

    const deletedEngine = await _deleteEngine(args, context);

    // delete engine from cache before return data
    await deleteCache(id);

    serviceContext.dal.packages.updatePublicEngineList(deletedEngine, context);
    serviceContext.dal.alwaysUpFlow.alwaysUpFlowDelete(args, context);
    return {
      id: id,
      message: 'engine ' + id + ' deleted'
    };
  }

  async function _deleteEngine(args, context) {
    // verify permission
    loadDeveloper(context);

    let engine = await loadCheckEngine(args, context);

    checkEngineStateTransitionAction('delete', engine, context);

    const engineId = args.id;

    const deleteEnginePromise = promisify(
      serviceContext.coreJob.cjdal.engine.deleteEngine
    );
    return deleteEnginePromise(engineId, null);
  }

  function getBuild(args, context) {
    return getEngineBuilds(args, context).then(function gotBuild(builds) {
      if (builds && builds.records && builds.count) {
        return builds.records[0];
      } else {
        throw new NotFound({
          data: {
            objectId: args.id,
            objectType: 'Build'
          }
        });
      }
    });
  }

  async function getBuilds(args, context) {
    const ids = args.ids || [];
    if (_.isEmpty(ids)) {
      return [];
    }
    const builds = await getEngineBuilds(args, context);
    const records = _.get(builds, 'records', []);
    const foundIds = new Set(records.map((build) => build.id));
    const missingId = ids.find((id) => !foundIds.has(id));
    if (missingId) {
      throw new NotFound({
        data: {
          objectId: missingId,
          objectType: 'Build'
        }
      });
    }
    return records;
  }

  async function updateEngineBuild(args, context) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const input = args.input;
    // extra authorization required here because we can only put
    // one requiredScope tag on the mutation, which is used for
    // multiple actions that require distinct permissions.
    const perm = 'developer.build.' + input.action;
    if (!isSuperAdmin) {
      mainUtil.requirePerm(perm, context);
    }

    // preemptive check
    // dockerImage isn't required in schema because only the upload
    // action requires it.
    if (input.action === 'upload' && !input.dockerImage) {
      throw new errors.InvalidInput({
        message: 'dockerImage is required to upload an engine build',
        data: {
          action: input.action,
          objectId: input.id,
          engineId: input.engineId
        }
      });
    }

    if (!input.buildId) {
      args.input.buildId = input.id;
    }

    // verify permission
    loadDeveloper(context);

    let engine = await loadCheckEngine(args, context);
    let build = await loadCheckBuild(args, context);
    let includeDeleted;

    switch (input.action) {
      case 'deploy':
        checkBuildStateTransitionAction(
          'deploy',
          build,
          engine,
          context,
          eventsMap.EngineBuildDeploy
        );
        await newDeployEngineBuild({...args, ownerOrganizationId: engine.ownerOrganizationId}, context);
        break;
      case 'pause':
        checkBuildStateTransitionAction(
          'pause',
          build,
          engine,
          context,
          eventsMap.EngineBuildPause
        );
        await newPauseEngineBuild(args, context);
        break;
      case 'unpause':
        checkBuildStateTransitionAction(
          'unpause',
          build,
          engine,
          context,
          eventsMap.EngineBuildUnpause
        );
        await newUnpauseEngineBuild(args, context);
        break;
      case 'approve':
        checkBuildStateTransitionAction(
          'approve',
          build,
          engine,
          context,
          eventsMap.EngineBuildApprove
        );
        await newApproveEngineBuild(args, context);
        break;
      case 'disapprove':
        checkBuildStateTransitionAction(
          'disapprove',
          build,
          engine,
          context,
          eventsMap.EngineBuildDisapprove
        );
        await newDisapproveEngineBuild(args, context);
        break;
      case 'invalidate':
        await newInvalidateEngineBuild(args, context);
        break;
      case 'submit':
        checkBuildStateTransitionAction(
          'submit',
          build,
          engine,
          context,
          eventsMap.EngineBuildSubmit
        );
        await newSubmitEngineBuild(args, context);
        break;
      case 'upload':
        await newUploadEngineBuild(args, context);
        break;
      case 'delete':
        checkBuildStateTransitionAction(
          'delete',
          build,
          engine,
          context,
          eventsMap.EngineBuildDelete
        );
        await newDeleteEngineBuild(args, context);
        includeDeleted = true;
        break;
      case 'update':
        await newUpdateEngineBuild(args, context);
        break;
      case 'certification':
        await newUpdateEngineBuildForCertification(args, context);
        break;
      default:
        throw new errors.InvalidInput({
          message: 'invalid build stage action',
          data: {
            objectType: 'action',
            objectData: input.action
          }
        });
    }

    await serviceContext.redisCache.markCacheDirty(engineBuildListKey);

    return getBuild({ id: input.id, includeDeleted }, context);
  }

  async function newDeployEngineBuild(args, context) {
    const engineId = _.get(args, 'input.engineId');
    const buildId = _.get(args, 'input.buildId');
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    const callerDisabledAutoPackageCreation = _.get(
      args,
      'input.disableAutoPackageCreation',
      false
    );

    if (callerDisabledAutoPackageCreation && !isSuperAdmin) {
      throw new errors.NotAllowed({
        message:
          'Only a superadmin token can set the disableAutoPackageCreation flag.'
      });
    }

    const emitEngineBuildDeployAuditLogEvent = (build, err) => {
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
        eventsMap.EngineBuildDeploy,
        context,
        {
          action: 'deploy',
          buildId: build ? build.buildId : buildId,
          engineId: engineId,
          userInfo: context._authInfo,
          statusCode: !err ? 200 : _.get(err, 'statusCode', 500),
          actionDetails: !err
            ? `Deployed build ${build.buildId} for engine ${engineId}`
            : `Failed to deploy engine build ${buildId} for engine ${engineId}`,
        },
        err
      );
    };
    let build;
    try {
      let engine = await loadCheckEngine(args, context);
      await loadCheckBuild(args, context);
      let transitionState = 'deployed';

      // pause the current deployed build for engine,
      // since there is only one deployedBuild for engine,
      // and we will change state of current build to deployed
      const pauseDeployedBuildsForEnginePromise = promisify(
        serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine
      );

      const dbTran = await coreWriteTx();
      try {
        await dbTran.begin();
        // pause the current deployed build for engine
        await pauseDeployedBuildsForEnginePromise(engineId, dbTran.client);

        const updateBuildStatePromise = promisify(
          serviceContext.coreJob.cjdal.build.updateBuildState
        );
        build = await updateBuildStatePromise(
          buildId,
          transitionState,
          dbTran.client
        );

        // We would have to recheck and change engine state by calling function autoTransitionEngineState.
        // Engine state should be changed to "active" instead of "ready" when there is a build had been deployed.
        const autoTransitionEngineStatePromise = promisify(
          serviceContext.coreJob.jobBll.engine.autoTransitionEngineState
        );
        await autoTransitionEngineStatePromise(engine, dbTran.client, false);

        const useAutomaticPackageCreation = await mainUtil.isOrgSettingEnabled(
          context,
          'automaticPackageCreation',
          args.ownerOrganizationId
        );

        if (useAutomaticPackageCreation && !callerDisabledAutoPackageCreation) {
          await createOrDuplicatePackage(context, engine, build.buildId, dbTran.client);
        }

        await dbTran.commit();
      } catch (err) {
        await dbTran.rollback();
        logger.error(err);
        throw err;
      } finally {
        dbTran.client.done();
      }

      // emit engine build deploy
      emitEngineBuildDeployAuditLogEvent(build);

      return build;
    } catch (error) {
      logger.error('Error executing new engine build deploy', error);
      emitEngineBuildDeployAuditLogEvent(null, error);
      throw error;
    }
  }

  /**
   * validates the deployed build in the latest package
   * @param {*} packageId the latest package id
   * @param {*} currentDeployedBuildId the current deployed build id
   * @returns the object { valid: boolean, packageResources: { records: []}}
   */
  async function validateDeployedBuildInLatestPackage(
    context,
    packageId,
    currentDeployedBuildId
  ) {
    const result = {
      valid: false,
      packageResources: null
    };

    result.packageResources = await serviceContext.dal.packages.getPackageResources(
      context,
      {
        packageId,
        resourceType: 'engineBuild'
      }
    );

    // engine builds
    const engineBuilds = _.get(result.packageResources, 'records', []);
    const deployBuildRecord = engineBuilds.find(
      (o) => o.resourceId === currentDeployedBuildId
    );
    // the latest package does not include the deployed build
    if (_.isNil(deployBuildRecord)) {
      return result;
    }

    result.valid = true;
    return result;
  }

  async function createOrDuplicatePackage(context, engine, newDeployedBuildId = null, existingDbClient = null) {
    const {
      engineId,
      name,
      engineName,
      ownerOrganizationId,
      distributionType
    } = engine;
    let currentDeployedBuildId = null;
    const resources = [
      {
        resourceType: 'engine',
        resourceId: engineId,
        action: 'ADD'
      }
    ];

    let packageInput = {
      name: _.isNil(engineName) ? name : engineName,
      organizationId: ownerOrganizationId,
      primaryResourceId: engineId,
      autoGenerated: true,
      status: 'published',
      distributionType
    };
    let isDuplicate = false;

    if (_.isNil(newDeployedBuildId)) {
      // if engine has no deployed build, don't do anything
      const deployedBuild = await getEngineBuilds(
        {
          engineId,
          buildStatus: ['deployed'],
          limit: 1,
          ignoreCache: true
        },
        context
      );

      if (_.isEmpty(deployedBuild.records)) {
        return;
      }

      // make sure the new package includes the deployed build
      currentDeployedBuildId = deployedBuild.records[0].id;
    }

    // Use 'isLatest' flag to get the latest package by engine id
    const getPackagesResult = await serviceContext.dal.packages.getPackages(
      context,
      {
        primaryResourceId: engineId,
        packageFilter: { primaryResourceType: 'engine', isLatest: true }
      },
      true
    );

    let latestPackageWithEngineAsPrimaryResource = _.get(
      getPackagesResult,
      'records[0]',
      null
    );

    // if no package exists and there is a deployed build, create new package
    if (_.isNil(latestPackageWithEngineAsPrimaryResource)) {
      packageInput = {
        ...packageInput,
        name: mainUtil.getFormattedPackageName({
          primaryResourceId: engineId,
          primaryResourceName: _.isNil(name) ? engineName : name
        }),
        version: '1.0'
      };
    } else {
      packageInput = {
        ...packageInput,
        dateTime: Date.now()
      };
      isDuplicate = true;
      let deployedBuildId = newDeployedBuildId;
      let resourcesInLatestPackage = null;

      // package upgrade case: check the current deployed build is in the latest package or not
      if (_.isNil(deployedBuildId)) {
        const validateDeployedBuild = await validateDeployedBuildInLatestPackage(
          context,
          latestPackageWithEngineAsPrimaryResource.id,
          currentDeployedBuildId
        );

        // set the resources to reduce DB calls in sanitizeEngineBuildResources
        resourcesInLatestPackage = validateDeployedBuild.packageResources;
        // the check is invalid, we need to create a new package with the real deployed build
        if (validateDeployedBuild.valid === false) {
          deployedBuildId = currentDeployedBuildId;
        }
      }
      // build package resources to create a new package
      if (!_.isNil(deployedBuildId)) {
        const sanitizedBuildResources = await sanitizeEngineBuildResources(
          context,
          latestPackageWithEngineAsPrimaryResource.id,
          engineId,
          deployedBuildId,
          resourcesInLatestPackage
        );

        resources.push(...sanitizedBuildResources);
      }
    }

    return await serviceContext.dal.packages.packageCreate(
      { ...packageInput, resources },
      context,
      {
        isVersionUpgrade: isDuplicate,
        preprocessResources: !isDuplicate,
        skipPackageAccessValidation: true
      },
      existingDbClient
    );
  }

  async function sanitizeEngineBuildResources(
    context,
    packageId,
    engineId,
    newDeployedBuildId,
    packageResources
  ) {
    const resources = [];

    const getEngineBuildsResult = await getEngineBuilds(
      {
        engineId,
        ignoreCache: true
      },
      context
    );

    if (!_.isEmpty(getEngineBuildsResult.records)) {
      const existingBuildIds = _.map(
        getEngineBuildsResult.records,
        (build) => build.id
      );

      let existingBuildResources = packageResources;
      if (_.isNil(existingBuildResources)) {
        existingBuildResources = await serviceContext.dal.packages.getPackageResources(
          context,
          {
            packageId,
            resourceType: 'engineBuild',
            resourceId: existingBuildIds
          }
        );
      }

      // remove any previous engine builds
      _.forEach(_.get(existingBuildResources, 'records'), (resource) => {
        if (resource.resourceId === newDeployedBuildId) {
          return;
        }
        resources.push({
          resourceId: resource.resourceId,
          resourceType: resource.resourceType,
          action: 'REMOVE'
        });
      });
    }

    // add only the new deployed build id
    if (!_.isNil(newDeployedBuildId)) {
      resources.push({
        resourceId: newDeployedBuildId,
        resourceType: 'engineBuild',
        action: 'ADD'
      });
    }

    return resources;
  }

  async function newPauseEngineBuild(args, context) {
    const buildId = _.get(args, 'input.buildId');
    const engineId = _.get(args, 'input.engineId');
    const emitEngineBuildPauseAuditLogEvent = (err) => {
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
        eventsMap.EngineBuildPause,
        context,
        {
          action: 'pause',
          userInfo: context._authInfo,
          engineId: engineId,
          buildId: buildId,
          statusCode: !err ? 200 : _.get(err, 'statusCode', 500),
          actionDetails: !err
            ? `Paused build ${buildId} for engine ${engineId}`
            : `Failed to pause build ${buildId} for engine ${engineId}`
        },
        err
      );
    };
    try {
      let engine = await loadCheckEngine(args, context);
      let build;
      const dbTran = await coreWriteTx();
      try {
        await dbTran.begin();
        const updateBuildStatePromise = promisify(
          serviceContext.coreJob.cjdal.build.updateBuildState
        );
        build = await updateBuildStatePromise(buildId, 'paused', dbTran.client);
        const autoTransitionEngineStatePromise = promisify(
          serviceContext.coreJob.jobBll.engine.autoTransitionEngineState
        );
        engine = await autoTransitionEngineStatePromise(
          engine,
          dbTran.client,
          false
        );
        await dbTran.commit();
      } catch (err) {
        await dbTran.rollback();
        throw new errors.InternalServerError();
      } finally {
        dbTran.client.done();
      }

      build = populateBuildValidStateActionsIfUserContext(
        build,
        engine,
        context
      );

      emitEngineBuildPauseAuditLogEvent();

      return build;
    } catch (error) {
      logger.error(error);
      emitEngineBuildPauseAuditLogEvent(error);
      throw error;
    }
  }

  async function newUnpauseEngineBuild(args, context) {
    const buildId = _.get(args, 'input.buildId');
    const engineId = _.get(args, 'input.engineId');
    const emitEngineBuildUnpauseAuditLogEvent = (err) => {
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
        eventsMap.EngineBuildUnpause,
        context,
        {
          action: 'unpause',
          userInfo: context._authInfo,
          engineId: engineId,
          buildId: buildId,
          statusCode: !err ? 200 : _.get(err, 'statusCode', 500),
          actionDetails: !err
            ? `Unpaused build ${buildId} for engine ${engineId}`
            : `Failed to unpause build ${buildId} for engine ${engineId}`
        },
        err
      );
    };

    let dbTran;
    try {
      let engine = await loadCheckEngine(args, context);
      dbTran = await coreWriteTx();
      await dbTran.begin();
      const updateBuildStatePromise = promisify(
        serviceContext.coreJob.cjdal.build.updateBuildState
      );
      let build = await updateBuildStatePromise(
        buildId,
        'approved',
        dbTran.client
      );
      const autoTransitionEngineStatePromise = promisify(
        serviceContext.coreJob.jobBll.engine.autoTransitionEngineState
      );
      engine = await autoTransitionEngineStatePromise(
        engine,
        dbTran.client,
        false
      );
      await dbTran.commit();
      build = populateBuildValidStateActionsIfUserContext(
        build,
        engine,
        context
      );
      emitEngineBuildUnpauseAuditLogEvent();
      return build;
    } catch (error) {
      logger.error(error);
      await dbTran.rollback();
      emitEngineBuildUnpauseAuditLogEvent(error);
      throw new errors.InternalServerError();
    } finally {
      dbTran.client.done();
    }
  }

  async function newApproveEngineBuild(args, context) {
    const buildId = _.get(args, 'input.buildId');
    const engineId = _.get(args, 'input.engineId');
    const emitEngineBuildApproveAuditLogEvent = (err) => {
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
        eventsMap.EngineBuildApprove,
        context,
        {
          action: 'approve',
          userInfo: context._authInfo,
          engineId: engineId,
          buildId: buildId,
          statusCode: !err ? 200 : _.get(err, 'statusCode', 500),
          actionDetails: !err
            ? `Approved new build ${buildId} for engine ${engineId}`
            : `Failed to approve new build ${buildId} for engine ${engineId}`
        },
        err
      );
    };
    try {
      let engine = await loadCheckEngine(args, context);
      let build;
      const dbTran = await coreWriteTx();
      try {
        await dbTran.begin();
        const updateBuildStatePromise = promisify(
          serviceContext.coreJob.cjdal.build.updateBuildState
        );
        build = await updateBuildStatePromise(
          buildId,
          'approved',
          dbTran.client
        );
        const autoTransitionEngineStatePromise = promisify(
          serviceContext.coreJob.jobBll.engine.autoTransitionEngineState
        );
        engine = await autoTransitionEngineStatePromise(
          engine,
          dbTran.client,
          false
        );
        // delete engine cache after transit engine state
        await dbTran.commit();
      } catch (err) {
        logger.error(err);
        await dbTran.rollback();
        throw new errors.InternalServerError();
      } finally {
        dbTran.client.done();
      }

      build = populateBuildValidStateActionsIfUserContext(
        build,
        engine,
        context
      );

      emitEngineBuildApproveAuditLogEvent();

      return build;
    } catch (err) {
      emitEngineBuildApproveAuditLogEvent(err);
      throw err;
    }
  }

  async function newDisapproveEngineBuild(args, context) {
    const engineId = _.get(args, 'input.engineId');
    const buildId = _.get(args, 'input.buildId');
    const emitEngineBuildDisapproveAuditLogEvent = (err) => {
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
        eventsMap.EngineBuildDisapprove,
        context,
        {
          action: 'disapprove',
          userInfo: context._authInfo,
          engineId: engineId,
          buildId: buildId,
          statusCode: !err ? 200 : _.get(err, 'statusCode', 500),
          actionDetails: !err
            ? `Disapproved new build ${buildId} for engine ${engineId}`
            : `Failed to disapprove new build ${buildId} for engine ${engineId}`
        },
        err
      );
    };

    try {
      let engine = await loadCheckEngine(args, context);
      let build;
      try {
        const updateBuildStatePromise = promisify(
          serviceContext.coreJob.cjdal.build.updateBuildState
        );
        build = await updateBuildStatePromise(buildId, 'disapproved', null);
      } catch (err) {
        throw new errors.InternalServerError();
      }

      build = populateBuildValidStateActionsIfUserContext(
        build,
        engine,
        context
      );
      emitEngineBuildDisapproveAuditLogEvent();
      return build;
    } catch (error) {
      logger.error(error);
      emitEngineBuildDisapproveAuditLogEvent(error);
      throw error;
    }
  }

  async function newInvalidateEngineBuild(args, context) {
    const input = args.input;
    const buildId = input.id;
    const emitEngineInvalidateAuditLogEvent = (build, err) => {
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
        eventsMap.EngineBuildInvalidate,
        context,
        {
          action: 'invalidate',
          tokenInfo: context._authInfo,
          engineId: _.get(build, 'engineId'),
          buildId: _.get(build, 'buildId'),
          statusCode: !err ? 204 : _.get(err, 'statusCode', 500),
          actionDetails: !err
            ? `Invalidated build ${buildId} for engine ${_.get(build, 'engineId')}`
            : `Failed to invalidate build ${buildId} for engine ${_.get(build, 'engineId')}`
        },
        err
      );
    };
    try {
      const updateBuildStatePromise = promisify(
        serviceContext.coreJob.cjdal.build.updateBuildState
      );
      const build = await updateBuildStatePromise(buildId, 'invalid', null);
      emitEngineInvalidateAuditLogEvent(build);
      return build;
    } catch (err) {
      emitEngineInvalidateAuditLogEvent(null, err);
      throw err;
    }
  }

  async function newSubmitEngineBuild(args, context) {
    const buildId = _.get(args, 'input.buildId');
    const engineId = _.get(args, 'input.engineId');
    const emitEngineBuildSubmitAuditLogEvent = (err) => {
      const eventPayload = {
        action: 'submit',
        userInfo: context._authInfo,
        engineId: engineId,
        buildId: buildId,
        statusCode: !err ? 200 : _.get(err, 'statusCode', 500),
        actionDetails: !err
        ? `Submitted new build ${buildId} for engine ${engineId}`
        : `Failed to submit new build ${buildId} for engine ${engineId}`
      };
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
        eventsMap.EngineBuildSubmit,
        context,
        eventPayload,
        err
      );
    };
    try {
      let engine = await loadCheckEngine(args, context);
      let build;

      try {
        const updateBuildStatePromise = promisify(
          serviceContext.coreJob.cjdal.build.updateBuildState
        );
        build = await updateBuildStatePromise(buildId, 'pending', null);
      } catch (err) {
        logger.error(err);
        throw new errors.InternalServerError();
      }

      build = populateBuildValidStateActionsIfUserContext(
        build,
        engine,
        context
      );

      emitEngineBuildSubmitAuditLogEvent();

      if (config.nodeEnv && _.includes(_.lowerCase(config.nodeEnv), 'prod')) {
        // send email notification
        sendNewPendingEngineBuildEmail(context, context._authInfo, build);
      }

      const res = await getEngine(context, { id: engineId });
      const isPublic =
        res.isPublic === undefined ? args.input.isPublic : res.isPublic;
      const engineApprovalWhiteListed =
        _.get(
          context,
          '_authInfo.organization.kvp.engineApprovalWhiteListed'
        ) === 'enabled';
      if (engineApprovalWhiteListed || !isPublic) {
        await newApproveEngineBuild(args, context);
      }

      return build;
    } catch (err) {
      emitEngineBuildSubmitAuditLogEvent(err);
      throw err;
    }
  }

  async function newUploadEngineBuild(args, context) {
    const buildId = _.get(args, 'input.buildId');
    const engineId = _.get(args, 'input.engineId');
    const emitEngineBuildUploadAuditLogEvent = (buildUpload, err) => {
      const eventPayload = {
        action: 'upload',
        userInfo: context._authInfo,
        engineId: engineId,
        buildId: buildId,
        statusCode: !err ? 200 : _.get(err, 'statusCode', 500),
        dockerImage: _.get(buildUpload, 'dockerImage'),
        actionDetails: !err
          ? `Uploaded new build ${buildId} for engine ${engineId}`
          : `Failed to upload new build ${buildId} for engine ${engineId}`
      };
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
        eventsMap.EngineBuildUpload,
        context,
        eventPayload,
        err
      );
    };
    try {
      const engineBuildDockerImageDomain = _.get(
        app,
        'config.engineBuildDockerImageDomain',
        'registry.central.aiware.com'
      );
      const engine = await loadCheckEngine(args, context);
      let updateBuild = await loadCheckBuild(args, context);
      const buildUpload = new serviceContext.coreJob.jobModel.BuildUpload(
        args.input
      );
      const validationErrs = buildUpload.validate();

      if (validationErrs) {
        throw new errors.InvalidInput({
          message: 'bad request',
          data: validationErrs
        });
      }

      let build;
      const dbTran = await coreWriteTx();
      try {
        await dbTran.begin();
        let buildReport, manifest;
        try {
          const getEngineBuildReportPromise = promisify(
            serviceContext.coreJob.jobBll.s3.getEngineBuildReport
          );
          buildReport = await getEngineBuildReportPromise(engineId, buildId);
          const getEngineBuildManifestPromise = promisify(
            serviceContext.coreJob.jobBll.s3.getEngineBuildManifest
          );
          manifest = await getEngineBuildManifestPromise(engineId, buildId);
        } catch (error) {
          // Don't error if cannot get report or manifest,
          // since builds may not have a manifest.
          const notFoundError = new errors.NotFound({
            message: 'Build report and manifest is not found',
            data: error
          });
          logger.error(
            'Error when getting build report and manifest',
            notFoundError
          );
        }

        // All new capabilities we need to multiply by need to be added here
        let capabilities;
        if (manifest) {
          const languages = _.get(manifest, 'supportedLanguages');

          if (!_.isArray(languages) || _.isEmpty(languages)) {
            capabilities = [];
          } else {
            capabilities = _.map(languages, (language) => {
              return {
                key: 'language',
                value: language
              };
            });
            const addBuildCapabilitiesPromise = promisify(
              serviceContext.coreJob.cjdal.buildCapability.addBuildCapabilities
            );
            await addBuildCapabilitiesPromise(
              buildId,
              capabilities,
              dbTran.client
            );
          }
        }

        updateBuild.dockerImage = buildUpload.dockerImage;

        if (buildReport) {
          updateBuild.vulLowCount = _.get(
            buildReport,
            'vulnerabilityCounts.Low'
          );
          updateBuild.vulMediumCount = _.get(
            buildReport,
            'vulnerabilityCounts.Medium'
          );
          updateBuild.vulHighCount = _.get(
            buildReport,
            'vulnerabilityCounts.High'
          );
          updateBuild.vulCriticalCount = _.get(
            buildReport,
            'vulnerabilityCounts.Critical'
          );
          updateBuild.buildSize = _.get(buildReport, 'inspect.Size');
        }

        // when sandbox deploy is setup, we will set build state to 'uploaded'
        // updateBuild.buildState = 'uploaded';
        updateBuild.buildState = 'available';
        updateBuild.manifest = util.generateBuildManifestFromEngine(
          context,
          manifest,
          engine.engineManifest,
          engineId
        );

        if (buildUpload.dockerImage) {
          if (engine.isPublic) {
            updateBuild.buildState = 'available';
          } else {
            updateBuild.buildState = 'approved';
          }
        }

        const updateEngineBuildPromise = promisify(
          serviceContext.coreJob.cjdal.build.updateEngineBuild
        );
        build = await updateEngineBuildPromise(updateBuild, dbTran.client);

        if (updateBuild.buildState == 'approved') {
          const autoTransitionEngineStatePromise = promisify(
            serviceContext.coreJob.jobBll.engine.autoTransitionEngineState
          );
          await autoTransitionEngineStatePromise(engine, dbTran.client, false);
        }

        await dbTran.commit();
      } catch (err) {
        logger.error(err);
        await dbTran.rollback();
        throw err;
      } finally {
        dbTran.client.done();
      }
      emitEngineBuildUploadAuditLogEvent(buildUpload);
      return build;
    } catch (err) {
      emitEngineBuildUploadAuditLogEvent(null, err);
      throw err;
    }
  }

  async function newUpdateEngineBuild(args, context) {
    const { input } = args;
    let build = {};

    try {
      if (!input.taskRuntime && !input.releaseNotes) {
        const error = {
          message:
            'Must include taskRuntime or releaseNotes when using action type of update',
          taskRuntime: { message: 'should be a JSON' },
          releaseNotes: { message: 'should be a string' }
        };
        throw new errors.InvalidInput({
          message: 'bad request',
          data: error
        });
      }
    } catch (err) {
      // Only to catch input validation error
      emitEngineBuildUpdateAuditLogEvent({ buildId: input.buildId, engineId: input.engineId }, err, context);
      throw err;
    }

    if (input.taskRuntime) {
      const updatedNodeRedBuild = await newUpdateEngineBuildForNodeRed(
        args,
        context
      );
      build = { ...updatedNodeRedBuild };
    }

    if (input.releaseNotes) {
      const updatedReleaseNotesBuild = await newUpdateEngineBuildReleaseNotes(
        args,
        context
      );
      build = { ...build, ...updatedReleaseNotesBuild };
    }

    return build;
  }

  async function newUpdateEngineBuildForNodeRed(args, context) {
    const input = args.input;
    const buildId = input.buildId;
    let build;
    try {
      if (!input.taskRuntime) {
        const error = { taskRuntime: { message: 'should be a JSON' } };
        throw new errors.InvalidInput({
          message: 'bad request',
          data: error
        });
      }

      const taskRuntime = input.taskRuntime;

      const dbTran = await coreWriteTx();
      try {
        await dbTran.begin();
        const updateEngineBuildForNodeRedPromise = promisify(
          serviceContext.coreJob.cjdal.build.updateEngineBuildForNodeRed
        );
        build = await updateEngineBuildForNodeRedPromise(
          buildId,
          taskRuntime,
          dbTran.client
        );
        await dbTran.commit();
      } catch (err) {
        logger.error(err);
        emitEngineBuildUpdateAuditLogEvent(null, err, context);
        await dbTran.rollback();
        throw new errors.InternalServerError();
      } finally {
        dbTran.client.done();
      }
      emitEngineBuildUpdateAuditLogEvent(build, null, context);

      return build;
    } catch (err) {
      emitEngineBuildUpdateAuditLogEvent(null, err, context);
      throw err;
    }
  }

  async function newUpdateEngineBuildForCertification(args, context) {
    const input = args.input;
    const buildId = input.buildId;

    if (!input.dataCertified) {
      const error = { dataCertified: { message: 'should be a JSON' } };
      throw new errors.InvalidInput({
        message: 'bad request',
        data: error
      });
    }

    const dataCertified = input.dataCertified;

    const { sql, values } = mainUtil.makeUpdateSql(
      `${jobTable}.build`,
      {
        data_certified: dataCertified
      },
      buildCertificationReturning,
      `build_id = '${buildId}'`
    );

    const build = await dbConnections['core'].write.map(
      sql,
      values,
      mapper.mapEngineCertification
    );

    return build;
  }

  async function newUpdateEngineBuildReleaseNotes(args, context) {
    const input = args.input;
    const buildId = input.buildId;

    if (!input.releaseNotes) {
      const error = { releaseNotes: { message: 'cannot be empty' } };
      throw new errors.InvalidInput({
        message: 'bad request',
        data: error
      });
    }

    const { sql, values } = mainUtil.makeUpdateSql(
      `${jobTable}.build`,
      {
        release_notes: input.releaseNotes
      },
      buildReleaseNotesReturning,
      `build_id = '${buildId}'`
    );

    const build = await dbConnections['core'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return build;
  }

  async function createEngineBuild(args, context) {
    return newCreateEngineBuild(context, args);
  }

  async function newCreateEngineBuild(context, args) {
    const input = _.get(args, 'input');
    const engineId = _.get(input, 'engineId');
    const emitEngineBuildCreateAuditLogEvent = (build, dockerImage, err) => {
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
        eventsMap.EngineBuildCreate,
        context,
        {
          action: 'create',
          tokenInfo: context._authInfo,
          engineId: _.get(build, 'engineId'),
          buildId: _.get(build, 'buildId'),
          statusCode: !err ? 201 : _.get(err, 'statusCode', 500),
          actionDetails: !err
            ? `Created build ${_.get(build, 'buildId')} for engine ${engineId}`
            : `Failed to create new build for engine ${engineId}`,
        },
        err
      );
      if (dockerImage) {
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
          eventsMap.EngineBuildUpload,
          context,
          _.pickBy(
            {
              action: 'upload',
              userInfo: context._authInfo,
              engineId: engineId,
              buildId: _.get(build, 'buildId'),
              statusCode: !err ? 200 : _.get(err, 'statusCode', 500),
              actionDetails: !err
                ? `Uploaded new build ${_.get(
                    build,
                    'buildId'
                  )} for engine ${engineId}`
                : `Failed to upload new build for engine ${engineId}`,
              dockerImage
            },
            _.identity
          )
        );
      }
    };
    try {
      if (!engineId) {
        throw new errors.InvalidInput({
          message: 'invalid requestedEngineId'
        });
      }

      // Validate engine access
      loadDeveloper(context);
      const engineContext = await loadCheckEngine(args, context);

      // default v2+ engines
      let defaultTaskRuntime = { edge: {} };

      // The task runtime correctly set up for v1 engines
      if (engineContext.edgeVersion && engineContext.edgeVersion == 1) {
        defaultTaskRuntime = {
          iron: {
            cluster: _.get(
              serviceContext,
              'config.manifest.clusterSizesToIds.small'
            ),
            priority: 0
          }
        };
      }

      let buildCreate = new serviceContext.coreJob.jobModel.BuildCreate({
        id: input.id,
        price: engineContext.price,
        deploymentModel: engineContext.deploymentModel,
        validateUri: engineContext.validateUri,
        executeUri: engineContext.executeUri,
        taskRuntime: input.taskRuntime || defaultTaskRuntime,
        dockerImage: input.dockerImage,
        manifest: input.manifest,
        releaseNotes: input.releaseNotes || engineContext.releaseNotes
      });
      const validationErrs = buildCreate.validate();

      if (validationErrs) {
        logger.error(
          'generated an invalid build create model, validationErrs = ',
          validationErrs
        );
        throw new errors.InvalidInput({
          message: 'bad request',
          data: { validationErrs }
        });
      }

      // Check if the build id is valid or not when it is predefined.
      if (buildCreate.id) {
        // Check is there any build exists with this ID.
        const existingBuilds = await getEngineBuilds(
          { id: buildCreate.id },
          context
        );
        if (existingBuilds.count) {
          throw new errors.InvalidInput({
            message: 'Build ID already exists.',
            data: {
              objectType: 'BuildId',
              objectId: buildCreate.id
            }
          });
        }
      }

      buildCreate.engineId = engineId;
      buildCreate = JSON.parse(JSON.stringify(buildCreate));
      buildCreate.manifest = await util.generateBuildManifestFromEngine(
        context,
        buildCreate.manifest,
        engineContext.engineManifest,
        engineId
      );

      // If dockerImage start with 'registry.central.aiware.com/engineId' set the buildState
      // based on engine is public or not.
      // Otherwise set buildState to fetching as default when creating build.
      if (
        buildCreate.dockerImage &&
        buildCreate.dockerImage.startsWith(
          'registry.central.aiware.com/' + engineId
        )
      ) {
        if (engineContext.isPublic) {
          buildCreate.buildState = 'available';
        } else {
          buildCreate.buildState = 'approved';
        }
      }

      let build;
      const dbTran = await coreWriteTx();

      try {
        await dbTran.begin();
        const createEngineBuildPromise = promisify(
          serviceContext.coreJob.cjdal.build.createEngineBuild
        );
        build = await createEngineBuildPromise(buildCreate, dbTran.client);

        // Auto transit engine state rely on builds state "approved"
        if (buildCreate.buildState == 'approved') {
          const autoTransitionEngineStatePromise = promisify(
            serviceContext.coreJob.jobBll.engine.autoTransitionEngineState
          );
          await autoTransitionEngineStatePromise(
            engineContext,
            dbTran.client,
            false
          );
        }

        await dbTran.commit();
      } catch (err) {
        logger.error(err);
        await dbTran.rollback();
        throw err;
      } finally {
        dbTran.client.done();
      }

      if (build) {
        emitEngineBuildCreateAuditLogEvent(build, buildCreate.dockerImage);

        // clear engine build list cache
        await serviceContext.redisCache.markCacheDirty(engineBuildListKey);
      }

      return mapper.mapBuild(build);
    } catch (err) {
      emitEngineBuildCreateAuditLogEvent(null, null, err);
      throw err;
    }
  }

  async function deleteEngineBuild(args, context) {
    const input = args.input;
    if (!input.buildId) args.input.buildId = input.id;

    await newDeleteEngineBuild(args, context);

    // clear engine builds cache
    serviceContext.redisCache.markCacheDirty(engineBuildListKey);
    return {
      id: input.id,
      message: 'Engine build ' + input.id + ' deleted'
    };
  }

  async function newDeleteEngineBuild(args, context) {
    let build = await loadCheckBuild(args, context);
    const engineId = _.get(args, 'input.engineId');
    const buildId = _.get(args, 'input.buildId');
    const emitEngineBuildDeleteAuditLogEvent = (err) => {
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
        eventsMap.EngineBuildDelete,
        context,
        {
          action: 'delete',
          userInfo: context._authInfo,
          engineId: engineId,
          buildId: buildId,
          statusCode: !err ? 204 : _.get(err, 'statusCode', 500),
          actionDetails: !err
            ? `Deleted build ${buildId} for engine ${engineId}`
            : `Failed to delete build ${buildId} for engine ${engineId}`
        },
        err
      );
    };
    try {
      const deleteEngineBuildPromise = promisify(
        serviceContext.coreJob.cjdal.build.deleteEngineBuild
      );
      await deleteEngineBuildPromise(buildId, null);
    } catch (err) {
      logger.error(err);
      emitEngineBuildDeleteAuditLogEvent(err);
      throw new errors.InternalServerError();
    }

    emitEngineBuildDeleteAuditLogEvent();

    return build;
  }

  async function cancelJob(jobId, context) {
    return newCancelJob(jobId, context);
  }

  async function newCancelJob(jobId, context) {
    const tokenInfo = _.get(context, 'requestContext.tokenInfo');
    const userInfo = _.get(context, 'requestContext.userInfo');
    const token = _.get(tokenInfo, 'tokenId') || _.get(userInfo, 'token'); // either api token or user session

    if (!token) {
      throw new errors.AuthenticationError();
    }

    const requestorApplicationId =
      _.get(context, 'requestContext.tokenInfo.applicationId') ||
      _.get(context, 'requestContext.userInfo.groups[0].applicationId');

    try {
      const cancelJobPromise = promisify(
        serviceContext.coreJob.jobBll.job.cancelJob
      );
      const job = await cancelJobPromise(jobId, requestorApplicationId, null);

      await serviceContext.dal.task.emitJobCompletedEvent(
        jobId,
        job.organizationId,
        job.applicationId,
        'cancelled',
        context
      );
    } catch (err) {
      if (err) {
        if (err.statusCode === 403) {
          throw new errors.NotAllowed({
            message: err.message
          });
        } else if (err.statusCode === 404) {
          throw new errors.NotFound({
            message: err.message
          });
        }

        serviceContext.logger.error('newCancelJob error', err);
        throw new errors.InternalServerError();
      }
    }

    return {
      id: jobId,
      message: 'Job cancelled'
    };
  }

  async function retryJob(args, context) {
    const { clusterId } = args;
    const jobId = _.get(args, 'jobId', _.get(args, 'id'));
    const requestorApplicationId =
      _.get(context, 'requestContext.tokenInfo.applicationId') ||
      _.get(context, 'requestContext.userInfo.groups[0].applicationId');
    const getJobWithTasksPromise = promisify(
      serviceContext.coreJob.cjdal.job.getJobWithTasks
    );
    const job = await getJobWithTasksPromise(jobId, null);

    if (!job) {
      throw new errors.NotFound({
        message: 'job not found',
        data: {
          objectType: 'jobId',
          objectData: jobId
        }
      });
    }

    if (
      requestorApplicationId &&
      requestorApplicationId !== job.applicationId
    ) {
      throw new errors.NotFound({
        message: `user/token application id ${requestorApplicationId} does not match job application id ${job.applicationId}`
      });
    }

    if (
      serviceContext.coreJob.jobBll.job.getJobStatusFromTaskStatuses(
        job.tasks
      ) === 'complete'
    ) {
      throw new errors.InvalidInput({
        message: 'Job has completed successfully. Unable to retry.'
      });
    }

    // v3 createJob args
    const routes = _.get(job, 'jobConfig.routes');

    // Ensure organizationId is an integer — the Job model schema normally
    // enforces this, but guard against edge cases where it arrives as a string.
    const organizationId = _.isString(job.organizationId)
      ? _.toInteger(job.organizationId)
      : job.organizationId;

    // Starting from here, use retrieved job to create new job with all Pending status.
    // jobArgs: extracted from retrieved job
    let createJobArgs = {
      input: {
        applicationId: job.applicationId,
        applicationIds: [job.applicationId],
        organizationId,
        organizationIds: [organizationId],
        retries: job.retries ? job.retries + 1 : 1,
        targetId: job.recordingId,
        sourceAssetId: job.sourceAssetId,
        tasks: _.map(job.tasks, (task) => {
          const payload = _.cloneDeep(task.payload);
          if (!_.isNil(organizationId) && payload?.taskPayload) {
            payload.taskPayload.organizationId = organizationId;
          }
          return {
            engineId: task.engineId,
            payload,
            buildId: task.buildId,
            isClone: true
          };
        }),
        routes: routes
      }
    };

    let newJob;
    // create v3 job
    if (Array.isArray(createJobArgs.input.routes)) {
      createJobArgs.clusterId = _.isNull(clusterId) ? job.clusterId : clusterId;
      newJob = await serviceContext.dal.v3Job.createJob(context, createJobArgs);
    } else {
      // create job
      newJob = await serviceContext.dal.job.createJob(context, createJobArgs);
    }
    return serviceContext.dal.job.getJob(context, { id: newJob.id });
  }

  async function updateJobs(args, context) {
    if (
      !args.input.ids ||
      !_.isArray(args.input.ids) ||
      !(args.input.ids.length > 0)
    )
      throw new Error('ids parameter is required');
    if (!args.input.status) throw new Error('status parameter is required');

    const jobStatus = args.input.status;

    // Only allow update job status to "failed" and "aborted" for job v3
    if (jobStatus === 'failed' || jobStatus === 'aborted') {
      const jobs = await serviceContext.dal.job.getJobs(context, {
        id: args.input.ids
      });

      if (jobs.count !== args.input.ids.length) {
        const invalidJobIds = _.difference(
          args.input.ids,
          _.map(jobs.records, (job) => job.id)
        );

        throw new errors.InvalidInput({
          message: 'invalid ids parameter',
          data: {
            objectType: 'invalidJobIds',
            objectData: invalidJobIds
          }
        });
      }

      const clusterIds = _.without(
        _.uniq(_.map(jobs.records, (job) => job.clusterId)),
        undefined,
        null
      );

      if (!clusterIds || _.isEmpty(clusterIds)) {
        throw new errors.NotAllowed({
          message: `disallow update v1/v2 job status to ${jobStatus}`,
          data: {
            objectType: 'status',
            objectData: jobStatus
          }
        });
      }

      const clusters = await serviceContext.dal.cluster.getClusterList(
        context,
        { id: clusterIds }
      );

      // not allow update status to "failed" or "aborted" for job v1/v2
      for (const cluster of clusters.records) {
        if (
          !cluster.edgeVersion ||
          cluster.edgeVersion !== defaultEdgeVersion
        ) {
          throw new errors.NotAllowed({
            message: `disallow update v1/v2 job status to ${jobStatus}`,
            data: {
              objectId: cluster.id,
              objectType: 'status',
              objectData: jobStatus
            }
          });
        }
      }
    }

    return updateJobsDb(args, context);
  }

  async function updateJobsDb(args, context) {
    const sqlTaskWhere = [];
    const sqlJobWhere = [];
    const sqlParams = [];
    const jobIdsParams = [];
    const jobIds = _.get(args, 'input.ids', []);
    let jobTable = 'job_new.job';
    let taskTable = 'job_new.task';

    if (jobIds.length === 1) {
      jobTable = util.generateJobTablePartition(_.first(jobIds));
      taskTable = util.generateTaskTablePartition(_.first(jobIds));
    }

    args.input.ids.forEach((id) => {
      jobIdsParams.push(`$${sqlParams.push(id)}`);
    });

    sqlJobWhere.push(`job_id IN (${jobIdsParams.join(',')})`);

    // calculate partion range across all job ids
    // to determine the earliest and latest epoch to range
    let start, end;
    args.input.ids.forEach((id) => {
      const range = dateIdUtil.getEpochRange(id);
      if (!start || range.start < start) {
        start = range.start;
      }
      if (!end || range.end > end) {
        end = range.end;
      }
    });

    if (start && end) {
      const startParam = sqlParams.push(start);
      const endParam = sqlParams.push(end);
      sqlTaskWhere.push(
        `(created_date_time BETWEEN $${startParam} AND $${endParam})`
      );
      sqlJobWhere.push(
        `(created_date_time BETWEEN $${startParam} AND $${endParam})`
      );
    } else {
      throw new Error('could not find partition range');
    }

    let jobStatus = args.input.status;
    let taskOutput;
    let notificationUrisPosition;
    const statusParam = sqlParams.push(jobStatus);
    const updatedDateTime = sqlParams.push(
      Math.floor(new Date().getTime() / 1000)
    );
    let queuedDateTime;
    let currentStatus = _.get(args, 'input.requiredCurrentStatus');
    const actionParams = {
      status: jobStatus
    };

    if (jobStatus === 'queued') {
      // explicitly allow switching status only from pending to queued
      // to avoid race conditions and wiping out completed tasks statuses
      if (_.isNil(currentStatus)) {
        currentStatus = 'pending';
      }
      queuedDateTime = sqlParams.push(Math.floor(new Date().getTime() / 1000));
    }

    if (jobStatus === 'failed' || jobStatus === 'aborted') {
      // the failureReason and failureMessage are gotten form input to allow specification of failureReason.
      // The failureType is the new field that is alternate field for deprecated field failureReason.
      const failureType = _.get(args, 'input.taskOutput.failureType');
      const failureReason =
        failureType || _.get(args, 'input.taskOutput.failureReason');
      const failureMessage = _.get(args, 'input.taskOutput.failureMessage');
      const setOutput = util.defineTaskOutputFailure(
        failureReason,
        failureMessage
      );
      // null means the caller failed/aborted the job without saying why. Skipping the param omits
      // `task_output`; pushing an empty object would blank the real output of every task in the job.
      if (setOutput) {
        if (setOutput.isUnknownFailureType) {
          // Coercion is forced to keep TaskFailureReason serializable; this log is the only signal
          // of sender enum drift. Reason truncated into meta, never interpolated — it is
          // caller-controlled and a `%j` would consume winston's meta argument.
          serviceContext.logger.warn(
            `(updateJobsDb) unrecognised failureReason on jobs ${jobIds.join(',')}; ` +
              `storing task_validation instead. TaskFailureReason and the sender's ` +
              `failure reason enum have drifted.`,
            { failureReason: _.truncate(failureReason, { length: 200 }) }
          );
        }
        taskOutput = sqlParams.push(setOutput);
      }
    }

    if (args.input.notificationUris) {
      notificationUrisPosition = sqlParams.push(
        _.isEmpty(args.input.notificationUris)
          ? {}
          : args.input.notificationUris
      );
    }

    if (currentStatus) {
      const paramId = sqlParams.push(currentStatus);
      sqlJobWhere.push(`(job_status = $${paramId})`);
      _.set(actionParams, 'priorStatus', currentStatus);
    }

    const sql = `
      WITH updatedJobIds AS (
      UPDATE
        ${jobTable}
      SET
        job_status = $${statusParam},
        modified_date_time = $${updatedDateTime}
        ${
          notificationUrisPosition > 0
            ? `, notification_uris = $${notificationUrisPosition}`
            : ''
        }
      WHERE ${sqlJobWhere.join(' AND ')}
      RETURNING job_id
      )
      UPDATE
        ${taskTable}
      SET
        task_status = $${statusParam},
        modified_date_time = $${updatedDateTime}
        ${queuedDateTime > 0 ? `, queued_date_time = $${queuedDateTime}` : ''}
        ${taskOutput > 0 ? `, task_output = $${taskOutput}` : ''}
        ${
          notificationUrisPosition > 0
            ? `, notification_uris = $${notificationUrisPosition}`
            : ''
        }
      WHERE job_id IN (SELECT job_id FROM updatedJobIds) AND
      ${sqlTaskWhere.join(' AND ')}
      RETURNING *;`;

    const tasks = (
      await serviceContext.dbConnections['core'].write.query(sql, sqlParams)
    ).map(mapper.mapTask);

    // not really job rows
    const jobs = _.uniqBy(tasks, 'jobId');
    // remove id so mapJob will assign id as jobId
    jobs.forEach((job) => {
      job.id = null;
    });

    const mappedJobs = jobs.map(mapper.mapJob);
    const jobOrgMap = new Map();
    const jobErrorMsg = [];
    for (const job of mappedJobs) {
      if (!jobOrgMap.has(job.jobId)) {
        const orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
          job.applicationId
        );
        if (_.isNil(orgId)) {
          jobErrorMsg.push(`[${job.jobId},${job.applicationId}]`);
          continue;
        }

        jobOrgMap.set(job.jobId, orgId);
      }
    }
    // check error jobs
    if (!_.isEmpty(jobErrorMsg)) {
      logger.error(
        `(updateJobsDb) Unable to get organizationId from applicationId: ${jobErrorMsg.join(
          ', '
        )}`
      );
    }

    // Only emit task queued event if update status to queued
    if (jobStatus === 'queued') {
      await Promise.all(
        tasks.map(async (task) =>
          messageUtil.emitTaskQueuedEvent(
            context,
            task.taskId,
            null,
            'edge',
            jobOrgMap.get(task.jobId)
          )
        )
      );
    }

    // Build promise funcs for createJobAudit
    const createJobAuditArr = [];
    for (const [jobId, orgId] of jobOrgMap) {
      createJobAuditArr.push(
        serviceContext.dal.job.createJobAudit(context, jobId, 'update', {
          actionParams,
          organizationId: orgId
        })
      );
    }

    if (!_.isEmpty(createJobAuditArr)) {
      Promise.allSettled(createJobAuditArr).then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') {
            logger.error(`[createJobAudit] error: ${result.reason}`);
          }
        }
      });
    }

    return {
      records: mappedJobs,
      count: mappedJobs.length
    };
  }

  async function getTestingDetails(context, engine) {
    const args = [engine.id];
    const sql = `SELECT email, media_file_uri, custom_fields, is_certified, build_id_certified, data_certified from ${jobTable}.engine_certification where engine_id=$${args.length}`;
    let testingDetails = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.mapEngineCertification
    );
    const result = _.get(testingDetails, '0');

    return result;
  }

  async function getEngines(context, options) {
    if (!options.category) {
      return getEngineList(options, context);
    } else {
      // in this case we need a preliminary search on engine categories
      const data = await serviceContext.dal.engineCategory.getEngineCategories(
        context,
        { name: options.category }
      );
      if (!data.count) {
        return {
          count: 0,
          offset: options.offset,
          limit: options.limit,
          records: []
        };
      }
      const ids = data.records.map(function mapId(item) {
        return item.id;
      });
      options.engineCategoryId = ids;

      // retrieve applications requester's org has access to
      const applications = await serviceContext.dal.application.getApplications(
        {
          owned: false,
          all: true,
          organizationId: options.organizationId
        }
      );

      options.applicationIds = _.map(applications.records, 'id');

      return getEngineList(options, context);
    }
  }

  // This function was moved from dal/db.js
  async function getEngineList(options, context) {
    const key = 'getEngines-' + uuidv5(stringify(options), uuidNamespace);

    const isCacheDirty = await serviceContext.redisCache.isCacheDirty(
      engineListKey,
      engineListCacheTimestamp
    );
    if (isCacheDirty) {
      engineListCache.flushAll();
      engineListCacheTimestamp = Date.now();
    }
    let res = engineListCache.get(key);

    if (!res || options.skipCache) {
      // normalize input ids
      if (options.id || options.ids) {
        const engineIds = options.ids || [];
        if (options.id) engineIds.push(options.id);
        options.id = null;
        options.ids = engineIds;
      }

      // ownership case
      if (options.owned && options.organizationId) {
        res = await getOwnership(
          context,
          options.organizationId,
          options.ids,
          options
        );
      } else {
        // Check engine access via package grant
        // TODO: @cantv6605-seta this doesn't work when no ids are passed in.
        // probably we need to put the grant check in the getEnginesDb function and send it to postgres
        const {
          useEngineGrant,
          resourceIds
        } = await _checkPackageResourceUsage(context, options.ids);
        if (useEngineGrant) {
          if (options.owned === false) {
              const ownedEngineIds = await _getOwnedEngineIds(
                options.organizationId,
                options.ids
              );
              const mergedIds = _.uniq([...resourceIds, ...ownedEngineIds]);
              if (_.isEmpty(mergedIds)) {
                return mainUtil.toPage(options, []);
              }
              options.ids = mergedIds;
          }
        }
        options.useEngineGrant = useEngineGrant;

        res = await getEnginesDb(options, context);
      }
      engineListCache.set(key, res);
      logger.debug(
        'cache MISS on engines for ' +
          options.organizationId +
          ' ' +
          options.offset || 0
      );
    } else {
      logger.debug(
        'cache HIT on engines for ' +
          options.organizationId +
          ' ' +
          options.offset || 0
      );
    }
    return res;
  }

  /**
   * Returns engine IDs owned by the given organization
   * that are not associated with any package.
   * Used as a fallback when package grant logic excludes owned engines.
   */
  async function _getOwnedEngineIds(organizationId, filterIds) {
    if (!organizationId) {
      return [];
    }

    const args = [organizationId];
    let sql = `
      SELECT e.engine_id
      FROM ${jobTable}.engine e
      LEFT JOIN aiware.package__resource pr 
        ON pr.resource_id = e.engine_id 
        AND pr.resource_type = 'engine'::aiware.aiw_package_resource_enum
      WHERE e.owner_organization_id = $1
        AND e.deleted = FALSE
        AND e.engine_state != 'deleted'
        AND pr.resource_id IS NULL
    `;
    if (!_.isEmpty(filterIds)) {
      args.push(filterIds);
      sql += ` AND (e.engine_id = ANY($2::text[]) OR e.engine_alias_id = ANY($2::text[]))`;
    }
    const rows = await serviceContext.dbConnections['core'].read.query(sql, args);
    return rows.map(row => row.engine_id);
  }

  // Get application of the engine with given engine id.
  // If there are mulltipe applications, return the oldest one.
  async function getAppApplication(engineId) {
    const appIdsSql = `
      SELECT application_id FROM ${jobTable}.engine__application WHERE engine_id = $1
    `;

    const appIds = await serviceContext.dbConnections['core'].read.map(
      appIdsSql,
      [engineId],
      (row) => row.application_id
    );

    return serviceContext.dal.application.getOldestApplication(appIds);
  }

  // Get the application from the first engine that has an application
  async function getAppApplicationFromEngines(engines) {
    for (const engine of engines) {
      const application = await getAppApplication(engine.id);
      if (application) return application;
    }

    return null;
  }

  async function _checkPackageResourceUsage(context, _resourceId) {
    const requesterResourceIds = _.isNil(_resourceId)
      ? []
      : _.isArray(_resourceId)
      ? _resourceId
      : [_resourceId];
    const requesterOrg = _.get(context, '_authInfo.organization');
    const requesterOrgId = _.get(requesterOrg, 'organizationId');
    const useEngineGrant = await mainUtil.isEnableFeatureInOrganization(
      context,
      requesterOrg,
      requesterOrgId,
      ['enablePackageGrantLogic', 'useEngineGrant']
    );
    let resourceIds = [];
    if (useEngineGrant) {
      const allowedResources = await serviceContext.dal.packages.getAccessiblePackageResources(
        context,
        {
          organizationId: requesterOrgId,
          resourceTypes: ['engine'],
          resourceIds: requesterResourceIds
        }
      );
      resourceIds = _.map(allowedResources, 'resourceId');
    }

    return { useEngineGrant, resourceIds };
  }

  async function getOwnership(context, organizationId, _engineIds, _options) {
    let options = _options || {};
    options.owned = true;
    options.organizationId = organizationId;

    const { useEngineGrant, resourceIds } = await _checkPackageResourceUsage(
      context,
      _engineIds
    );
    options.useEngineGrant = useEngineGrant;
    options.ownedOnly = true;

    return await getEnginesDb(options, context);
  }

  async function getEnginesDb(initOptions, context) {
    const useEngineGrant = _.get(initOptions, 'useEngineGrant', false);
    let options = mapEngineOptions(initOptions);
    const sqlWhere = [];
    const args = [];
    const { idList } = buildFilterIds(options);
    let sql = '';
    sql += `
        SELECT
            e.engine_id as id,
            e.metadata_version as metadata_version,
            e.engine_alias_id as alias_id,
            e.engine_category_id as category_id,
            e.engine_name as name,
            e.engine_state as state,
            e.engine_description as description,
            e.engine_currency as currency,
            e.deployment_model,
            e.owner_organization_id,
            e.is_public,
            e.price,
            e.price_dimension,
            e.rating,
            e.edge_version,
            e.website,
            e.logo_path,
            e.icon_path,
            e.order,
            e.dependency,
            e.core_job_data,
            e.fields,
            e.validation,
            e.asset,
            e.creates_recording,
            e.library_required,
            e.use_cases,
            e.industries,
            e.engine_manifest,
            e.deleted,
            e.created_date,
            e.updated_date,
            e.engine_alias_name as alias_name,
            e.engine_alias_description as alias_description,
            e.engine_alias_logo_path as alias_logo_path,
            e.jwt_rights,
            e.single_engine_tdo_job_json,
            e.single_engine_upload_job_json,
            e.cpu_resource_mcpu,
            e.gpu_supported,
            e.gpu_tier,
            e.distribution_type,
            e.gpu_required,
            e.gpu_model,
            e.gpu_driver_version,
            e.kernel_version,
            e.input_types`;

    if (options.adminView && !useEngineGrant) {
      // for admins to get all blacklist and whitelist orgs for each engine
      sql += `,
            array_agg(distinct oeb.organization_id) AS blacklist_org_ids,
            array_agg(distinct oe.organization_id) AS whitelist_org_ids`;
    }

    sql += ` FROM ${jobTable}.engine e `;

    // join to include engine certification data
    sql += ` LEFT OUTER JOIN ${jobTable}.engine_certification ecert ON ecert.engine_id = e.engine_id `;

    if (options.adminView && !useEngineGrant) {
      // this join is so admins can see which engines are
      // whitelisted and blacklisted for an org
      sql += `
        LEFT OUTER JOIN
          ${jobTable}.organization__engine oe
          ON oe.engine_id = e.engine_id `;
      if (options.organizationId) {
        sql += ' AND oe.organization_id = $1 ';
      }
      sql += `
        LEFT OUTER JOIN
          ${jobTable}.organization__engine_blacklist oeb
          ON oeb.engine_id = e.engine_id `;
      if (options.organizationId) {
        sql += ' AND oeb.organization_id = $1 ';
      }
    }

    // we want engines associated with a specified application_id
    // this is internal and not exposed in the public API
    if (options.appPackageId) {
      sql += `
        INNER JOIN ${jobTable}.engine__application ea
          ON e.engine_id = ea.engine_id `;

      sqlWhere.push(`ea.application_id = $${args.push(options.appPackageId)}`);
    }

    if (options.organizationId) {
      args.push(options.organizationId);

      // restrict to whitelisted, owned by org, and public engines
      let whereClause = `e.owner_organization_id = $${args.length}`;

      if (!options.ownedOnly) {
        whereClause += ` OR e.engine_id IN (
          SELECT
            engine_id
          FROM
            ${jobTable}.organization__engine
          WHERE
            organization_id = $${args.length}

        )`;
      }

      if (!useEngineGrant) {
        whereClause += ' OR e.is_public = TRUE';
      }

      // here the options.applicationIds means real application not organization ???????
      // include engines in applications that requester's org has access to
      const params = [];
      if (options.applicationIds && options.applicationIds.length) {
        options.applicationIds.forEach((id) => {
          args.push(id);
          params.push(`$${args.length}`);
        });

        whereClause += `
          OR e.engine_id IN (
            SELECT DISTINCT
              engine_id
            FROM
              ${jobTable}.engine__application
            WHERE application_id IN (${params.join(',')})
          )
        `;
      }

      sqlWhere.push(`(${whereClause})`);

      if (!options.adminView && !useEngineGrant) {
        // remove engine category blacklist results
        sqlWhere.push(`
                e.engine_category_id NOT IN(
                    SELECT
                        engine_category_id
                    FROM
                        ${jobTable}.organization__engine_category_blacklist
                    WHERE
                        organization_id = $1
                )`);

        // remove engine blacklist results
        sqlWhere.push(`
                e.engine_id NOT IN(
                    SELECT
                        engine_id
                    FROM
                        ${jobTable}.organization__engine_blacklist
                    WHERE
                        organization_id = $1
                )`);
      }
    }

    if (options.edgeVersion) {
      args.push(options.edgeVersion);
      sqlWhere.push(`e.edge_version = \$${args.length}`);
    }

    // The map of engine filter and the Where condition Statement
    const engineManifestFilterMap = new Map([
      [
        'mode',
        `(e.engine_manifest ->> 'engineMode')::text = ANY($$$ARG_NUM$$::text[])`
      ],
      [
        'supportedInputFormats',
        `translate((e.engine_manifest ->> 'supportedInputTypes'), '[]', '{}')::text[] && $$$ARG_NUM$$`
      ],
      [
        'manifestRuntime',
        `(e.engine_manifest ->> 'runtime')::text = ANY($$$ARG_NUM$$::text[])`
      ]
    ]);

    // Filtering options saved in the engine manifest
    for (let key in options.engineManifestFilters) {
      let value = options.engineManifestFilters[key];

      if (!_.isNil(engineManifestFilterMap.get(key))) {
        if (key === 'mode') {
          value = value.map((element) => element.toLowerCase());
        }

        sqlWhere.push(
          engineManifestFilterMap
            .get(key)
            .replace('$$ARG_NUM$$', args.push(value))
        );
      }
    }
    if (idList.length > 0) {
      args.push(idList);
      sqlWhere.push(
        `(e.engine_id = ANY(\$${args.length}::text[])
          OR e.engine_alias_id = ANY(\$${args.length}::text[]))`
      );
    }
    if (_.isArray(options.engineCategoryId)) {
      const insertItems = [];
      options.engineCategoryId.forEach(function addArg(engineCategoryId) {
        args.push(engineCategoryId);
        insertItems.push(`\$${args.length}`);
      });
      sqlWhere.push(`e.engine_category_id IN (${insertItems.join(',')})`);
    } else if (options.engineCategoryId) {
      args.push(options.engineCategoryId);
      sqlWhere.push(`e.engine_category_id = \$${args.length}`);
    }

    if (_.isArray(options.engineStates)) {
      const insertItems = [];
      options.engineStates.forEach(function addArg(engineState) {
        args.push(engineState);
        insertItems.push(`\$${args.length}`);
      });
      sqlWhere.push(`e.engine_state IN (${insertItems.join(',')})`);
    }
    if (options.owned && options.organizationId) {
      args.push(options.organizationId);
      sqlWhere.push(`e.owner_organization_id = \$${args.length}`);
    }
    if (!options.includeDeleted) {
      sqlWhere.push('e.deleted = FALSE');
    }
    if (_.isBoolean(options.libraryRequired)) {
      args.push(options.libraryRequired);
      sqlWhere.push(`e.library_required = \$${args.length}`);
    }
    if (_.isBoolean(options.createsTDO)) {
      args.push(options.createsTDO);
      sqlWhere.push(`e.creates_recording = \$${args.length}`);
    }
    if (
      _.isEmpty(_.get(options, 'filter.name')) &&
      _.isString(options.name) &&
      options.name.length
    ) {
      // TODO: This field is deprecated so we need to remove this in the future
      mainUtil.makeLikeClause(
        'e.engine_name',
        options.name,
        sqlWhere,
        args,
        _.get(options, 'filter.nameMatch') || 'startsWith',
        false
      );
    }
    if (options.assetTag) {
      args.push(options.assetTag);
      sqlWhere.push('e.asset = $' + args.length);
    }

    const filters = options.engineFilters || options.filter;
    let joinCategory = false;
    let joinType = false;
    let joinEntityTags = false;
    const engineFilterMap = new Map([
      ['category', { fieldName: 'LOWER(ec.engine_category_name)' }],
      ['priceMin', { fieldName: 'e.price', operator: '>=' }],
      ['priceMax', { fieldName: 'e.price', operator: '<=' }],
      ['type', { fieldName: 'ec.engine_type_id::TEXT' }],
      ['deploymentModels', { fieldName: 'e.deployment_model' }],
      ['state', { fieldName: 'e.engine_state' }],
      ['isPublic', { fieldName: 'e.is_public' }],
      ['distributionTypes', { fieldName: 'e.distribution_type' }]
    ]);
    // The fallthrough is allowed if it matches below DB columns and discard if it not.
    const engineColumnFilterAllowed = [
      'e.library_required',
      'e.rating',
      'e.deployment_model',
      'e.distribution_type'
    ];

    if (!_.isEmpty(filters)) {
      const mapEngineType = {
        Ingestion: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
        Cognition: 'fcc22feb-9184-4f53-be5e-7694927864d9',
        Aggregator: 'b055b3ec-38ef-41c3-bf8a-a672e3a72dae'
      };

      for (let key in filters) {
        const objEngineFilterMap = engineFilterMap.get(key);
        const column = `e.${_.snakeCase(key)}`;
        let value = filters[key];
        let isFallthroughAllowed = false;
        let customOperator = _.isNil(objEngineFilterMap)
          ? null
          : _.get(objEngineFilterMap, 'operator', null);
        let matchClause;

        if (
          _.isNil(objEngineFilterMap) &&
          engineColumnFilterAllowed.includes(column)
        ) {
          isFallthroughAllowed = true;
        }

        switch (key) {
          case 'isCertified':
            if (!value) {
              sqlWhere.push(
                `(ecert.is_certified = FALSE OR ecert.is_certified IS NULL)`
              );
            } else {
              sqlWhere.push(`ecert.is_certified = TRUE`);
            }
            break;
          case 'category':
            value = value.map((v) => v.toLowerCase());
            joinCategory = true;
            break;
          case 'type':
            value = (_.isArray(value) ? value : [value]).map(
              (k) => mapEngineType[k]
            );
            joinCategory = true;
            break;
          case 'deploymentModels':
            value = value.map((val) => mapper.mapDeploymentModelIn(val));
            break;
          case 'distributionTypes':
            value = _.isArray(value) ? value : [value];
            break;
          case 'engineTemplateInputTypes':
            args.push(
              _.isArray(value.inputTypes)
                ? value.inputTypes
                : [value.inputTypes]
            );

            matchClause = value.matchAny
              ? `? ANY ($${args.length}::text[])`
              : `@> ANY ((ARRAY [$${args.length}:json])::jsonb[])`;

            sqlWhere.push(
              `( e.single_engine_tdo_job_json->'supportedInputTypes' ${matchClause}
              OR e.single_engine_upload_job_json->'supportedInputTypes' ${matchClause} )`
            );
            break;
          default:
            break;
        }

        // TODO: This field is deprecated so we need to remove this in the future
        if (key === 'exactName' && _.isEmpty(filters.name)) {
          mainUtil.makeLikeClause(
            'e.engine_name',
            value,
            sqlWhere,
            args,
            'exact',
            false
          );
        }

        if (key === 'name' && !_.isEmpty(filters.name)) {
          mainUtil.makeLikeClause(
            'e.engine_name',
            value,
            sqlWhere,
            args,
            filters.nameMatch || 'startsWith',
            false
          );
        }

        if (key === 'entityTags') {
          joinEntityTags = true;

          const entityTagOperation = _.get(filters, 'entityTagOperation', 'OR');
          const whereEntityTags = [];
          _.forEach(value, (entityTag) => {
            const whereKeyAndValue = [];
            const tagKey = _.get(entityTag, 'key');
            const tagValue = _.get(entityTag, 'value');
            if (!_.isEmpty(tagKey)) {
              args.push(tagKey);
              whereKeyAndValue.push('etags.tag_key = $' + args.length);
            }
            if (!_.isEmpty(tagValue)) {
              args.push(tagValue);
              whereKeyAndValue.push('etags.tag_value = $' + args.length);
            }
            whereEntityTags.push('(' + whereKeyAndValue.join(' AND ') + ')');
          });

          sqlWhere.push(
            '(' + whereEntityTags.join(' ' + entityTagOperation + ' ') + ')'
          );
        }

        if (key === 'dateTimeFilter') {
          if (value.length > 0) {
            mainUtil.addDateTimeFilters('e', filters, sqlWhere, null, 1000, {
              modifiedDateTime: 'updated_date'
            });
          }
        } else if (!_.isNil(objEngineFilterMap) || isFallthroughAllowed) {
          mainUtil.addSqlWhere(
            _.isNil(objEngineFilterMap) ? column : objEngineFilterMap.fieldName,
            value,
            sqlWhere,
            args,
            customOperator
          );
        }
      }
    }

    const groupBy = [];

    let orderBy = ' ORDER BY e.created_date DESC ';

    if (options.orderBy) {
      let sqlOrderBy = [];
      for (const value of options.orderBy) {
        const field = engineOrderByMap[value.field] || `e.${value.field}`;
        const dirParam = value.direction || 'asc';
        const direction = orderDirectionMap[dirParam];
        if (field) {
          sqlOrderBy.push(`${field} ${direction}`);
        }

        // Add JOINs for certain fields to sort by
        if (value.field === 'category') {
          joinCategory = true;
        }
        if (value.field === 'type') {
          joinType = true;
        }
      }

      if (sqlOrderBy.length) {
        orderBy = ' ORDER BY ' + sqlOrderBy.join(' , ');
      } else {
        orderBy = ' ORDER BY e.created_date DESC ';
      }
    }

    if (joinCategory || joinType) {
      sql += `
          LEFT OUTER JOIN
             ${jobTable}.engine_category ec ON ec.engine_category_id = e.engine_category_id
             `;
    }

    if (joinType) {
      sql += `
          LEFT OUTER JOIN
             ${jobTable}.engine_type et ON et.engine_type_id = ec.engine_type_id
             `;
    }

    if (joinEntityTags) {
      sql += `
          LEFT OUTER JOIN
             ${jobTable}.entity_tags etags ON etags.entity_id::text = e.engine_id
             `;
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    groupBy.push(`e.engine_id`);
    if (_.find(options.orderBy, (orderBy) => orderBy.field === 'category')) {
      groupBy.push(`ec.engine_category_name`);
    }
    if (_.find(options.orderBy, (orderBy) => orderBy.field === 'type')) {
      groupBy.push(`et.engine_type_name`);
    }
    sql += ` GROUP BY ${groupBy.join(',')} `;
    sql += orderBy;

    if (Number.isInteger(options.limit)) {
      args.push(options.limit);
      sql += ` LIMIT \$${args.length}`;
    }
    if (Number.isInteger(options.offset)) {
      args.push(options.offset);
      sql += ` OFFSET \$${args.length}`;
    }

    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.mapEngine
    );
    return mainUtil.toPage(options, rows);
  }

  function buildFilterIds(options) {
    const idList = options.ids ? [...options.ids] : [];
    if (options.id) {
      idList.push(options.id);
    }
    return { idList };
  }

  function mapEngineOptions(options) {
    let result = JSON.parse(JSON.stringify(options));

    if (result.categoryId) result.engineCategoryId = result.categoryId;
    if (result.state) result.engineStates = result.state;
    if (_.has(options, 'filter.deploymentModel'))
      result.filter.deploymentModel = mapper.mapDeploymentModelIn(
        result.filter.deploymentModel
      );

    let engineFilters = _.pick(result.filter, [
      'name',
      'exactName',
      'nameMatch',
      'state',
      'libraryRequired',
      'rating',
      'deploymentModel',
      'deploymentModels',
      'distributionTypes',
      'priceMin',
      'priceMax',
      'category',
      'type',
      'isCertified',
      'isPublic',
      'dateTimeFilter',
      'entityTagOperation',
      'entityTags',
      'engineTemplateInputTypes'
    ]);
    if (Object.keys(engineFilters).length) result.engineFilters = engineFilters;

    let engineManifestFilters = _.pick(result.filter, [
      'mode',
      'supportedInputFormats',
      'manifestRuntime'
    ]);
    if (Object.keys(engineManifestFilters).length) {
      result.engineManifestFilters = engineManifestFilters;
    }

    return result;
  }

  async function getEngineJWTToken(context, args) {
    const input = args.input;
    const resource = input.resource;
    const task = {
      engineId: input.engineId,
      applicationId: args.applicationId,
      recordingId: resource.tdoId,
      jobId: resource.jobId,
      taskId: resource.taskId,
      schemaId: resource.schemaId
    };
    if (!task.recordingId && !task.jobId && !task.taskId && !task.schemaId) {
      throw new errors.InvalidInput({
        message: 'undefined scope: at least one resource specifier required'
      });
    }
    let tdo;
    let job;
    let taskExists;
    let tokenAppId;
    let tokenSourceId;
    let engine;
    if (input.engineId) {
      engine = await getEngine(context, { id: input.engineId }, true);
    }

    const appIds =
      args.applicationIds || (args.applicationId ? [args.applicationId] : null);
    //verify that has access to resources
    if (resource.tdoId) {
      tdo = await dalTDO.getTDO(context, {
        id: resource.tdoId,
        includePublic: true,
        applicationId: args.applicationId,
        applicationIds: appIds
      });
      tokenAppId = tdo.applicationId;
      tokenSourceId = tdo.sourceId;
    }
    if (resource.jobId) {
      job = await serviceContext.dal.job.getJob(context, {
        id: task.jobId,
        applicationId: args.applicationId,
        applicationIds: appIds
      });
      tokenAppId = job.applicationId; // app ID on job should override TDO
      if (!tokenSourceId && job.recordingId) {
        // if the source ID hasn't already been set by TDO, set it here
        const jobTarget = await dalTDO.getTDO(context, {
          id: job.recordingId,
          includePublic: true,
          applicationId: args.applicationId,
          applicationIds: appIds
        });
        tokenSourceId = jobTarget.sourceId;
      }
    }

    if (tokenSourceId) {
      _.set(task, 'taskPayload.sourceId', tokenSourceId);
    }

    // access to task is validated along with job above,
    // so here we're just validating the existence of the task and
    // its link to the job.
    if (resource.taskId) {
      taskExists = await serviceContext.dal.task.getTask(context, {
        id: resource.taskId
      });
      if (taskExists.jobId !== task.jobId) {
        throw new errors.NotFound({
          data: {
            objectId: task.taskId,
            objectType: 'Task'
          }
        });
      }
      tokenAppId = taskExists.applicationId;
    }
    if (!task.applicationId) task.applicationId = tokenAppId;

    if (resource.schemaId) {
      const schemaExists = await serviceContext.dal.structuredData.getSchema(
        context,
        {
          id: resource.schemaId
        }
      );
      if (schemaExists.id !== task.schemaId) {
        throw new errors.NotFound({
          data: {
            objectId: task.schemaId,
            objectType: 'Schema'
          }
        });
      }
    }

    const orgId =
      args.organizationId ||
      (await serviceContext.dal.organization.getOrgIdFromAppId(tokenAppId));
    _.set(task, 'taskPayload.organizationId', orgId);

    if (resource.userId) {
      // verify access to the user
      const user = await serviceContext.dal.admin.getUser(
        { id: resource.userId, organizationIds: [orgId] },
        context
      );

      task.userId = user.id;
    }

    const result = await doGetEngineJWTToken(context, engine, task);

    return result;
  }

  async function doGetEngineJWTToken(context, engine, task) {
    const token = await tokenHelper.createJwtToken(context, engine, task);
    return mapper.mapEngineJWTToken(task, token);
  }

  function verifyJWT(args) {
    const jwtToken = args.jwtToken;
    try {
      const payload = jwt.verify(jwtToken, app.config.jwt.secret);
      return { payload, jwtToken };
    } catch (err) {
      throw new errors.InvalidInput({
        data: {
          objectId: jwtToken,
          objectType: 'jwtToken'
        }
      });
    }
  }

  async function engineWorkflow(args, context) {
    // before updating the engine we need to fetch current engine data
    // to fill in any fields that are not being set by the user
    const engine = await getEngine(
      context,
      { id: _.get(args, 'input.id') },
      true
    );

    return doEngineWorkflow(args, context, engine);
  }

  async function doEngineWorkflow(args, context, engine) {
    const input = args.input;

    let result;

    if (input.action === 'disable') {
      // extra authorization required here because we can only put
      // one requiredScope tag on the mutation, which is used for
      // multiple actions that require distinct permissions.
      mainUtil.requirePerm('developer.engine.disable', context);
      result = await _disableEngine(args, context);
    } else if (input.action === 'enable') {
      // extra authorization required here because we can only put
      // one requiredScope tag on the mutation, which is used for
      // multiple actions that require distinct permissions.
      mainUtil.requirePerm('developer.engine.enable', context);
      result = await _enableEngine(args, context);
    }

    return mapper.mapEngine(result);
  }

  async function createTaskLog(args, context) {
    const input = args.input;

    if (!input.file) {
      throw new errors.InvalidInput({
        message: 'A .txt file (upload) must be provided to create a task log.',
        data: {
          fieldName: 'file',
          fieldValue: input.file,
          message: `A .txt file (upload) must be provided to create a task log.`
        }
      });
    }

    if (input.file.size === 0) {
      throw new errors.InvalidInput({
        message:
          'The client attempted to upload a zero-byte file to the ' +
          'createAsset mutation. The API does not accept zero-byte files ' +
          'as they most likely indicate an error on the client side and will ' +
          'not generate a usable task log.',
        data: {
          taskId: input.taskId,
          errorCode: 'zero_byte_upload'
        }
      });
    }

    // verify task exists
    await serviceContext.dal.task.getTask(context, { id: input.taskId });

    // example: 2017/07/26/task-someTaskId.log
    const taskKey = `${moment(new Date()).format('YYYY/MM/DD')}/task-${
      input.taskId
    }.log`;

    const taskLogBucket = _.get(serviceContext, 's3Buckets.tasklog.storage');
    const putTaskLog = promisify(taskLogBucket.putObject);

    // upload tasklog file to inspirent s3 bucket
    const uri = await putTaskLog(
      taskKey,
      'text/plain',
      input.file.size,
      input.file.inputStream
    );

    if (!uri) {
      throw new errors.ServiceUnavailable();
    }
    // update task with tasklog
    await serviceContext.dal.task.updateTaskLog({
      taskId: input.taskId,
      taskLog: uri
    });

    return {
      uri
    };
  }

  async function getEngineTaskMetrics(args, context) {
    const { toDateTime, fromDateTime } = args;
    const WEEK_IN_SECONDS = 604800;

    const epochNow = util.dateToEpochSecs(Date.now());
    const epochDateTo = toDateTime
      ? util.dateToEpochSecs(new Date(toDateTime))
      : epochNow;
    const epochDateFrom = fromDateTime
      ? util.dateToEpochSecs(new Date(fromDateTime))
      : epochNow - WEEK_IN_SECONDS;

    if (Math.abs(epochDateTo - epochDateFrom) > WEEK_IN_SECONDS) {
      throw new errors.InvalidInput({
        message: 'max range between from and to date is one week',
        data: {
          validationErrors: [
            {
              fieldName: 'fromDateTime',
              fieldValue: fromDateTime,
              message: 'max range between from and to date is one week'
            },
            {
              fieldName: 'toDateTime',
              fieldValue: toDateTime,
              message: 'max range between from and to date is one week'
            }
          ]
        }
      });
    }

    return getEngineTaskMetricsDb({
      ...args,
      toDateTime: epochDateTo,
      fromDateTime: epochDateFrom
    });
  }

  // Retrieves metrics for tasks related to the engine
  async function getEngineTaskMetricsDb(options) {
    const sqlWhere = [];
    const args = [];

    let sql = `
      SELECT
        SUM(CASE WHEN t.task_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN t.task_status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
        SUM(CASE WHEN t.task_status = 'running' THEN 1 ELSE 0 END) AS running_count,
        SUM(CASE WHEN t.task_status = 'complete' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN t.task_status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
        SUM(CASE WHEN t.task_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count
      FROM job_new.task t`;

    if (options.id) {
      args.push(options.id);
      sqlWhere.push('t.engine_id = $1');
    }

    if (options.applicationId) {
      args.push(options.applicationId);
      sqlWhere.push(`t.application_id = $${args.length}`);
    }
    if (options.toDateTime) {
      args.push(options.toDateTime);
      sqlWhere.push(`t.created_date_time < $${args.length}`);
    }
    if (options.fromDateTime) {
      args.push(options.fromDateTime);
      sqlWhere.push(`t.created_date_time > $${args.length}`);
    }
    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    const metrics = await serviceContext.dbConnections['core'].read.query(
      sql,
      args
    );

    const pendingCount = _.get(metrics, '[0].pending_count', 0);
    const queuedCount = _.get(metrics, '[0].queued_count', 0);
    const runningCount = _.get(metrics, '[0].running_count', 0);
    const completedCount = _.get(metrics, '[0].completed_count', 0);
    const failedCount = _.get(metrics, '[0].failed_count', 0);
    const cancelledCount = _.get(metrics, '[0].cancelled_count', 0);

    return {
      pendingCount: parseInt(pendingCount == null ? 0 : pendingCount),
      queuedCount: parseInt(queuedCount == null ? 0 : queuedCount),
      runningCount: parseInt(runningCount == null ? 0 : runningCount),
      completedCount: parseInt(completedCount == null ? 0 : completedCount),
      failedCount: parseInt(failedCount == null ? 0 : failedCount),
      cancelledCount: parseInt(cancelledCount == null ? 0 : cancelledCount)
    };
  }

  function getEngineBuild(options, context) {
    if (!options.id) throw new Error('id is required');

    return getEngineBuilds(options, context).then(function gotBuild(builds) {
      if (!builds.count) {
        throw new errors.NotFound({
          data: {
            objectId: options.id,
            objectType: 'Build'
          }
        });
      }
      return builds.records[0];
    });
  }

  /**
   * get engine builds by the filter options
   * @param {*} options the options to filter. We can set ignoreCache to 'true' to ignore cache data
   * @param {*} context the current context
   * @returns the engine builds: { records: [], count, offset, limit }
   */
  async function getEngineBuilds(options, context, existingTask) {
    const key = uuidv5(stringify(options), uuidNamespace);
    let engineBuildListTimestamp = await serviceContext.redisCache.get(
      engineBuildTimestampKey,
      key
    );
    const isCacheDirty = await serviceContext.redisCache.isCacheDirty(
      engineBuildListKey,
      engineBuildListTimestamp
    );

    if (isCacheDirty || options.ignoreCache === true) {
      await serviceContext.redisCache.clear(engineBuildListKey, key);
      // clear the engine build list timestamp too
      await serviceContext.redisCache.clear(engineBuildTimestampKey, key);
    }

    let res = await serviceContext.redisCache.get(engineBuildListKey, key);

    if (!res) {
      res = await getEngineBuildsDb(options, context, existingTask);

      if (res) {
        await serviceContext.redisCache.asyncSet(engineBuildListKey, key, res);
        // set the engine build list cache timestamp to check dirty later
        engineBuildListTimestamp = Date.now();
        await serviceContext.redisCache.asyncSet(
          engineBuildTimestampKey,
          key,
          engineBuildListTimestamp
        );
      }

      logger.debug(
        'cache MISS on engine builds for ' +
          options.engineId +
          ' ' +
          options.offset
      );
    } else {
      logger.debug(
        'cache HIT on engine builds for ' +
          options.engineId +
          ' ' +
          options.offset
      );
    }
    return res;
  }

  async function getEngineBuildsDb(options, context, existingTask = null) {
    const dbRead = _.isNil(existingTask)
      ? serviceContext.dbConnections['core'].read.tx
      : existingTask;

    // we now have the old string status filter and the new
    // enum status filter, both of which end up as strings here.
    // so we'll just concatenate and set options.status to the result.
    // when we deprecate the string version and use only enum this
    // can be removed (but that is a breaking change).
    const s1 = options.status || [];
    const s2 = options.buildStatus || [];
    const both = s1.concat(s2);
    const allStatus = _.uniq(both);
    options.status = allStatus.map(mapper.mapBuildStatusToDb);
    // if caller specifically asked for deleted, we'll include it.
    // otherwise automatically filter them out
    let includeDeleted = options.includeDeleted || false;
    if (!includeDeleted) {
      allStatus.forEach((stat) => {
        if (stat === 'deleted') includeDeleted = true;
      });
    }

    const sqlWhere = [];
    const args = [];
    let joinClause = '';
    const orderClause = [];
    const orderByMap = {
      version: 'b.version',
      modifiedDateTime: 'b.updated_date',
      createdDateTime: 'b.created_date'
    };

    const { resourceIds } = await _checkPackageResourceUsage(
      context,
      _.isNil(options.engineId) ? options.engineId : [options.engineId]
    );
    let sqlPackageGrantOR = [];

    if (options.organizationId) {
      args.push(options.organizationId);
      sqlPackageGrantOR.push(`e.owner_organization_id = $${args.length}`);

      // restrict to whitelisted, owned by org, and public engines
      sqlWhere.push(`
        (b.engine_id IN (
          SELECT
            engine_id
          FROM
            ${jobTable}.organization__engine
          WHERE
            organization_id = $${args.length}
        )
        OR e.owner_organization_id = $${args.length}
        OR e.is_public = TRUE)
      `);

      joinClause = `
LEFT OUTER JOIN ${jobTable}.engine AS e ON b.engine_id = e.engine_id
`;
    }

    // restrict to owned by org and package grants
    if (!_.isEmpty(resourceIds) && sqlPackageGrantOR.length > 0) {
      args.push(resourceIds);
      sqlPackageGrantOR.push(`b.engine_id = ANY(\$${args.length}::text[])`);
      sqlWhere.push(`(${sqlPackageGrantOR.join(' OR ')})`);
    }

    if (options.engineId) {
      args.push(options.engineId);
      sqlWhere.push(`b.engine_id = \$${args.length}`);
    }
    if (options.id) {
      args.push(options.id);
      sqlWhere.push(`b.build_id = \$${args.length}`);
    }
    if (_.isArray(options.ids) && !_.isEmpty(options.ids)) {
      args.push(options.ids);
      sqlWhere.push(`b.build_id = ANY(\$${args.length}::text[])`);
    }
    if (!_.isNil(options.status)) {
      const list = _.isArray(options.status)
        ? options.status
        : [options.status];
      let insertItems = [];
      list.forEach(function addArg(status) {
        args.push(status);
        insertItems.push(`\$${args.length}`);
      });
      if (insertItems.length)
        sqlWhere.push(`b.build_state IN (${insertItems.join(',')})`);
    }
    if (!includeDeleted) {
      sqlWhere.push("b.build_state != 'deleted'");
    }
    let sql = `
SELECT
  b.engine_id,
  b.build_id AS id,
  b.price,
  b.docker_image,
  b.version,
  b.build_state AS status,
  b.task_runtime AS runtime,
  b.created_date as created_date_time,
  b.updated_date as modified_date_time,
  b.manifest,
  b.data_certified,
  b.release_notes
FROM
  ${jobTable}.build b ${joinClause}`;
    if (sqlWhere.length) {
      sql += `
WHERE
  ${sqlWhere.join(' AND ')}`;
    }

    if (_.get(options, 'orderBy.length', 0) > 0) {
      options.orderBy.forEach((orderBy) => {
        const col = orderByMap[orderBy.field];

        if (!col) {
          throw new errors.InternalServerError({
            message:
              'An internal server configuration error in engine build order by processing has occurred.',
            data: {
              internalData: {
                orderByField: orderBy.field,
                knownFields: Object.keys(orderByMap)
              }
            }
          });
        }

        orderClause.push(`${col} ${orderBy.direction}`);
      });
    } else {
      orderClause.push('b.version DESC');
    }

    sql += `
ORDER BY ${orderClause.join(', ')} `;

    if (Number.isInteger(options.offset)) {
      sql += `
OFFSET ${options.offset}`;
    }
    if (Number.isInteger(options.limit)) {
      sql += `
LIMIT ${options.limit}`;
    }
    // here we need to map internal engine IDs to external aliases
    let map = function (row) {
      let res = mapper.mapBuild(row);
      if (options.engineAliasId) {
        res.engineId = options.engineAliasId;
      }
      return res;
    };
    const rows = await dbRead('getEngineBuildsDb', async (t) => {
      return await t.map(sql, args, map);
    });
    return mainUtil.toPage(options, rows);
  }

  // Retrieves most recent builds
  async function getRecentBuilds(options, context) {
    // mapping build status to match db format
    options.status = (options.buildStatus || []).map(mapper.mapBuildStatusToDb);

    // if caller specifically asked for deleted, we'll include it.
    // otherwise automatically filter them out
    let includeDeleted = false;
    if (!includeDeleted) {
      options.status.forEach((stat) => {
        if (stat === 'deleted') includeDeleted = true;
      });
    }

    const sqlWhere = [];
    const args = [];
    const orderClause = [];
    const orderByMap = {
      version: 'b.version',
      modifiedDateTime: 'b.updated_date',
      createdDateTime: 'b.created_date'
    };
    let sql = `
        SELECT
        e.engine_id,
        b.build_id AS id,
        b.price,
        b.docker_image,
        b.version,
        b.build_state AS status,
        b.task_runtime AS runtime,
        b.created_date as created_date_time,
        b.updated_date as modified_date_time,
        b.manifest,
        b.data_certified,
        b.release_notes
        FROM
        ${jobTable}.build b INNER JOIN ${jobTable}.engine e ON e.engine_id = b.engine_id
        `;

    // we want engines associated with a specified application_id
    // this is internal and not exposed in the public API
    if (options.appPackageId) {
      sql += `
        INNER JOIN ${jobTable}.engine__application ea
          ON e.engine_id = ea.engine_id `;

      sqlWhere.push(`ea.application_id = $${args.push(options.appPackageId)}`);
    }

    try {
      await _addSqlWhereForEngine(context, options, sqlWhere, args);
    } catch (error) {
      if (error.name === 'not_found') {
        return mainUtil.toPage(options, []);
      }
    }

    if (!_.isNil(options.status)) {
      const list = _.isArray(options.status)
        ? options.status
        : [options.status];
      let insertItems = [];
      list.forEach(function addArg(status) {
        args.push(status);
        insertItems.push(`\$${args.length}`);
      });
      if (insertItems.length)
        sqlWhere.push(`b.build_state IN (${insertItems.join(',')})`);
    }
    if (!includeDeleted) {
      sqlWhere.push("e.engine_state != 'deleted'");
      sqlWhere.push('e.deleted != true');
      sqlWhere.push("b.build_state != 'deleted'");
    }
    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    if (_.get(options, 'orderBy.length', 0) > 0) {
      options.orderBy.forEach((orderBy) => {
        const col = orderByMap[orderBy.field];

        if (!col) {
          throw new errors.InternalServerError({
            message:
              'An internal server configuration error in engine build order by processing has occurred.',
            data: {
              internalData: {
                orderByField: orderBy.field,
                knownFields: Object.keys(orderByMap)
              }
            }
          });
        }

        orderClause.push(`${col} ${orderBy.direction}`);
      });
    } else {
      // by default get recent builds by updated date
      orderClause.push('b.updated_date DESC');
    }

    sql += `
ORDER BY ${orderClause.join(', ')} `;

    if (Number.isInteger(options.offset)) {
      sql += `
OFFSET ${options.offset}`;
    }
    if (Number.isInteger(options.limit)) {
      sql += `
LIMIT ${options.limit}`;
    }
    // here we need to map internal engine IDs to external aliases
    let map = function (row) {
      let res = mapper.mapBuild(row);
      if (options.engineAliasId) {
        res.engineId = options.engineAliasId;
      }
      return res;
    };
    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      map
    );
    return mainUtil.toPage(options, rows);
  }

  // Retrieves engine overview metrics by status
  async function getEngineOverview(options, context) {
    const sqlWhere = [];
    const args = [];
    let sql = `
        SELECT
        COUNT(1) filter (where e.engine_state = 'active') as active,
        COUNT(1) filter (where e.engine_state = 'disabled') as disabled,
        COUNT(1) filter (where e.engine_state = 'pending') as pending,
        COUNT(1) filter (where e.engine_state = 'deleted') as deleted,
        COUNT(1) filter (where e.engine_state = 'draft') as draft,
        COUNT(1) filter (where e.engine_state = 'ready') as ready
        FROM ${jobTable}.engine e `;

    // we want engines associated with a specified application_id
    // this is internal and not exposed in the public API
    if (options.appPackageId) {
      sql += `
        INNER JOIN ${jobTable}.engine__application ea
          ON e.engine_id = ea.engine_id `;

      sqlWhere.push(`ea.application_id = $${args.push(options.appPackageId)}`);
    }

    try {
      await _addSqlWhereForEngine(context, options, sqlWhere, args);
    } catch (error) {
      if (error.name === 'not_found') {
        return {};
      }
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.camelizeRootKeys
    );
    const result = rows[0];
    return result;
  }

  function loadDeveloper(context) {
    mainUtil.requirePerm('developer.access', context);
    loadUserAllStateActions(context);
  }

  /**
   * Loads both engine and build state actions based on a user's permissions.
   */
  function loadUserAllStateActions(context) {
    context._authInfo.isDevAdmin = resUtil.isDevAdmin(context._authInfo);
    context._authInfo.isDockerAdmin = resUtil.isDockerAdmin(context._authInfo);

    loadUserEngineStateActions(context);
    loadUserEngineBuildStateActions(context);
  }

  /**
   * Loads engine state actions based on a user's permissions.
   */
  function loadUserEngineStateActions(context) {
    const isDevAdmin = context._authInfo.isDevAdmin;
    context.buildActionsInEngineStates =
      buildStateActionsInEngineStates.default;
    if (isDevAdmin) {
      context.engineStateActions = engineStateActions.admin;
    } else {
      context.engineStateActions = engineStateActions.default;
    }
  }

  /**
   * Loads build state actions based on a user's permissions.
   */
  function loadUserEngineBuildStateActions(context) {
    const isDevAdmin = context._authInfo.isDevAdmin;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isDockerAdmin = context._authInfo.isDockerAdmin;

    if (isDevAdmin || isSuperAdmin) {
      context.buildStateActions = buildStateActions.admin;
    } else if (isDockerAdmin) {
      context.buildStateActions = buildStateActions.dockerAdmin;
    } else {
      context.buildStateActions = buildStateActions.default;
    }
  }

  async function loadCheckEngine(args, context) {
    const input = args.input;
    const requestorOrgId = args.organizationId;
    const isDevAdmin = resUtil.isDevAdmin(context._authInfo);

    if (!input || !input.engineId) {
      throw new errors.InvalidInput({
        message: 'missing engineId'
      });
    }

    const getEnginePromise = promisify(
      serviceContext.coreJob.cjdal.engine.getEngine
    );
    const engine = await getEnginePromise(input.engineId, null);
    if (!engine) {
      throw new errors.NotFound({
        message: 'engine not found',
        data: {
          objectType: 'engineId',
          objectData: input.engineId
        }
      });
    }

    // Check engine category is valid with org in case using userToken or orgApiToken
    if (requestorOrgId) {
      const engineCategory = await serviceContext.dal.engineCategory.getEngineCategory(
        context,
        {
          id: engine.engineCategoryId,
          organizationId: requestorOrgId
        },
        true
      );

      if (_.isNil(engineCategory)) {
        throw new errors.NotFound({
          message: 'CategoryId is invalid or disabled for current organization',
          data: {
            categoryId: engine.engineCategoryId,
            organizationId: requestorOrgId
          }
        });
      }
    }

    if (engine.deleted) {
      throw new errors.NotFound({
        message: 'engine has been deleted',
        data: {
          objectType: 'engineId',
          objectData: input.engineId
        }
      });
    } else if (isDevAdmin || engine.ownerOrganizationId === requestorOrgId) {
      return engine;
    } else if (!requestorOrgId) {
      // this only happens for internal token w/o org association. eg. vdh-docker token
      return engine;
    }

    throw new errors.NotAllowed({
      message: 'no access to the requested engine',
      data: {
        objectType: 'engineId',
        objectData: input.engineId
      }
    });
  }

  async function loadCheckBuild(args, context) {
    const input = args.input;
    const isDevAdmin = resUtil.isDevAdmin(context._authInfo);

    if (!input || !input.buildId) {
      throw new errors.InvalidInput({
        message: 'missing buildId',
        data: {
          objectType: 'id',
          objectData: input.buildId
        }
      });
    }

    const getEngineBuildPromise = promisify(
      serviceContext.coreJob.cjdal.build.getEngineBuild
    );
    const build = await getEngineBuildPromise(
      input.buildId,
      input.engineId,
      null
    );

    if (!build) {
      throw new errors.NotFound({
        message: 'build not found',
        data: {
          objectType: 'build',
          objectData: input.buildId
        }
      });
    }

    if (!isDevAdmin && build.buildState === 'deleted') {
      throw new errors.NotFound({
        message: 'build has been deleted',
        data: {
          objectType: 'build',
          objectData: input.buildId
        }
      });
    }

    return build;
  }

  /**
   * Checks whether the user can perform the engine build state transition action
   * requires loadEngineBuild middleware to run before to set req.context.build.
   */
  function checkBuildStateTransitionAction(
    buildStateTransitionAction,
    requestedBuild,
    engine,
    context,
    eventInfo
  ) {
    try {
      const buildStateActions = _.get(context, 'buildStateActions');

      if (!_.isString(buildStateTransitionAction)) {
        throw new errors.ServiceFailure({
          message: 'missing buildStateTransitionAction'
        });
      }

      if (!buildStateActions) {
        loadUserEngineBuildStateActions(context);
      }

      if (!requestedBuild) {
        throw new errors.ResourceUnavailable({
          message: 'missing build requested'
        });
      }

      const validBuildStates =
        context.buildStateActions[requestedBuild.buildState] || [];

      if (!validBuildStates.includes(buildStateTransitionAction)) {
        throw new errors.NotAllowed({
          message: 'not a valid build action in current build state',
          data: {
            objectType: 'action',
            objectData: buildStateTransitionAction,
            currentBuildState: requestedBuild.buildState,
            validBuildStates
          }
        });
      }

      if (
        !buildStateActionsInEngineStates.default[engine.engineState].includes(
          buildStateTransitionAction
        )
      ) {
        throw new errors.NotAllowed({
          message: 'not a valid build action in current engine state',
          data: {
            objectType: 'action',
            objectData: buildStateTransitionAction
          }
        });
      }
    } catch (error) {
      logger.error(`Failed to ${buildStateTransitionAction} engineId ${engine.engineId} due to: ${error.message}`);
      const additionalNewWordOrSpacing =
        ['submit', 'approve', 'disapprove'].includes(buildStateTransitionAction)
          ? ' new '
          : ' ';
      const actionDetails = `Failed to ${buildStateTransitionAction}${additionalNewWordOrSpacing}build ${requestedBuild.buildId} for engine ${engine.engineId}`;
      const engineBuildEvent = {
        event: eventInfo.event,
        type: eventInfo.type,
        actionInfo: messageUtil.buildActionInfo(
          engine.engineId,
          error,
          null,
          null,
          actionDetails
        )
      };
      serviceContext.coreJob.eventEmitter.emitEngineBuildPublicEvent(
        context,
        engineBuildEvent
      );
      throw error;
    }
  }

  /**
   * Checks whether the user can perform the engine state transition action
   * requires canAccessAndLoadEngine middleware to run before to set req.context.engine.
   */
  function checkEngineStateTransitionAction(
    engineStateTransitionAction,
    requestedEngine,
    context,
    input,
    isAutomateFlowEngine
  ) {
    if (!_.isString(engineStateTransitionAction)) {
      throw new errors.InternalServerError({
        message: 'missing engineStateTransitionAction'
      });
    }

    const engineStateActions = _.get(context, 'engineStateActions');

    if (!engineStateActions) {
      loadUserEngineStateActions(context);
    }

    if (!requestedEngine) {
      throw new errors.InternalServerError({
        message: 'missing engine requested'
      });
    }

    const validEngineStates =
      context.engineStateActions[requestedEngine.engineState] || [];

    const isDevAdmin = _.get(context, '_authInfo.isDevAdmin');
    if (
      !isDevAdmin &&
      isAutomateFlowEngine &&
      requestedEngine.engineState === 'active'
    ) {
      validEngineStates.push('edit');

      const isValidActiveEngineUpdate = validateActiveEngineUpdate(
        requestedEngine,
        input
      );
      if (!isValidActiveEngineUpdate) {
        throw new errors.NotAllowed({
          message:
            'only the name can be updated on an active automate engine. If you entered a name, make sure the name is different from the current one',
          data: {
            currentEngineState: requestedEngine.engineState,
            transitionActionState: engineStateTransitionAction,
            validTransitionActionStates: validEngineStates,
            updateEngineInput: input
          }
        });
      }
    }

    if (!validEngineStates.includes(engineStateTransitionAction)) {
      throw new errors.NotAllowed({
        message: 'not a valid engine action in current engine state',
        data: {
          currentEngineState: requestedEngine.engineState,
          transitionActionState: engineStateTransitionAction,
          validTransitionActionStates: validEngineStates
        }
      });
    }
  }

  function validateActiveEngineUpdate(engine, updateEngineInput) {
    // fields from updateEngine schema not including engine id
    const updateEngineSchemaFields = [
      'name',
      'description',
      'isPublic',
      'categoryId',
      'deploymentModel',
      'price',
      'priceDimension',
      'edgeVersion',
      'fields',
      'iconPath',
      'logoPath',
      'libraryRequired',
      'useCases',
      'industries',
      'manifest',
      'testingDetails',
      'jwtRights',
      'standaloneJobTemplates'
    ];

    const inputKeys = _.pick(updateEngineInput, updateEngineSchemaFields);
    const inputKeysLength = Object.keys(inputKeys).length;

    // only the engine name should be changed
    if (inputKeysLength > 1 || !updateEngineInput.name) {
      return false;
    }

    if (engine.engineName === updateEngineInput.name) {
      return false;
    }
    return true;
  }

  function addValidEngineStateActions(context, engine) {
    const engineStatesContext = _.get(context, 'context.engineStateActions');
    if (engine && engineStatesContext) {
      engine.validStateActions = engineStatesContext[engine.engineState] || [];
    }
    return engine;
  }

  function shouldFilterInternalFields(context) {
    const userInfo = _.get(context, '_authInfo');
    const requestorApplicationId =
      _.get(context, 'tokenInfo.applicationId') ||
      _.get(context, 'userInfo.groups[0].applicationId');
    const showInternalEngineFields =
      _.get(userInfo, 'organization.kvp.showInternalEngineFields') ===
      'enabled';
    return requestorApplicationId && !showInternalEngineFields;
  }

  function filterInternalEngineFieldsIfNotAllowed(context, engine) {
    if (engine && shouldFilterInternalFields(context)) {
      engine.engineId = engine.engineAliasId || engine.engineId;
      engine.engineName = engine.engineAliasName || engine.engineName;
      engine.engineDescription =
        engine.engineAliasDescription || engine.engineDescription;
      engine.logoPath = engine.engineAliasLogoPath || engine.logoPath;
      engine = _.omit(engine, filteredEngineFields);
    }
    return engine;
  }

  function populateBuildValidStateActionsIfUserContext(build, engine, context) {
    const userInfo = _.get(context, 'userInfo');

    if (userInfo) {
      const engineState = engine.engineState;
      const buildStatesContext = context.buildStateActions;
      const validBuildStatesInEngineState =
        context.buildActionsInEngineStates[engineState];

      build.validStateActions = _.intersection(
        buildStatesContext[build.buildState],
        validBuildStatesInEngineState
      );

      switch (build.buildState) {
        case 'available':
          build.primaryAction = 'submit';
          break;
        case 'approved':
          build.primaryAction = 'deploy';
          break;
        case 'deployed':
          build.primaryAction = 'pause';
          break;
        case 'paused':
          build.primaryAction = 'unpause';
          break;
      }

      if (build.primaryAction) {
        build.secondaryActions = _.difference(build.validStateActions, [
          build.primaryAction
        ]);
      }
    }

    return build;
  }

  function sendNewPendingEngineBuildEmail(context, user, build) {
    const notificationEmail = _.get(
      serviceContext,
      'config.defaultEmailProvider.notificationEmail'
    );

    if (_.isEmpty(notificationEmail) || !user || !build) {
      return;
    }
    serviceContext.dal.notification.sendEmailTemplate(context, {
      templateName: 'new-pending-engine-build',
      toEmailAddress: notificationEmail,
      mergeLanguage: 'handlebars',
      mergeKvp: {
        creator: `${_.get(user, 'kvp.firstName')} ${_.get(
          user,
          'kvp.lastName'
        )}`,
        creator_link: `https://admin.${_.get(
          serviceContext,
          'app.config.dnsZone.external'
        )}/users/${user.userId}/profile`,
        dashboard_uri: `https://developer.${_.get(
          serviceContext,
          'app.config.dnsZone.external'
        )}/engines/${build.engineId}`,
        org_name: _.get(user, 'organization.organizationName'),
        org_link: `https://admin.${_.get(
          serviceContext,
          'app.config.dnsZone.external'
        )}/organizations/${_.get(user, 'organization.organizationId')}`,
        build_id: build.buildId,
        year: new Date().getFullYear()
      }
    });
  }

  function getEngineReplacements(options) {
    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const whereAnd = [];
    const values = [];

    mainUtil.addSqlWhere(
      'ero.source_engine_id',
      options.sourceEngineId,
      whereAnd,
      values
    );
    mainUtil.addSqlWhere(
      'ero.source_engine_id',
      options.sourceEngineIds,
      whereAnd,
      values
    );

    if (options.organizationId) {
      values.push(options.organizationId);
      whereAnd.push(`ero.organization_id in (\$${values.length}, 0)`);
    } else {
      mainUtil.addSqlWhere('ero.organization_id', 0, whereAnd, values);
    }

    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';
    const orderClause = [];

    orderClause.push('ero.organization_id DESC');

    const sql = `
      SELECT 	source_engine_id,
              organization_id,
              replacement_engine_id,
              payload_func
      FROM 	job_new.engine_replacement__organization ero
      ${whereClause}
      ORDER BY
        ${orderClause.join(', ')}
      OFFSET ${options.offset || 0}
      LIMIT ${options.limit || defaultLimit};
    `;

    return serviceContext.dbConnections['core'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  function createEngineReplacement(engineReplacement) {
    if (!engineReplacement) {
      throw new errors.InternalServerError({
        message: 'engineReplacement is required'
      });
    }
    if (!engineReplacement.sourceEngineId) {
      throw new errors.InternalServerError({
        message: 'sourceEngineId is required'
      });
    }
    if (!engineReplacement.replacementEngineId) {
      throw new errors.InternalServerError({
        message: 'replacementEngineId is required'
      });
    }

    const columnData = {
      source_engine_id: engineReplacement.sourceEngineId,
      organization_id: engineReplacement.organizationId,
      replacement_engine_id: engineReplacement.replacementEngineId,
      payload_func: engineReplacement.payloadFunc
    };
    const { sql, values } = mainUtil.makeInsertSql(
      'job_new.engine_replacement__organization',
      columnData,
      engineReplacementReturining
    );

    return serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  async function removeEngineReplacement(engineReplacement) {
    if (!engineReplacement) {
      throw new errors.InternalServerError({
        message: 'engineReplacement is required'
      });
    }
    if (!engineReplacement.sourceEngineId) {
      throw new errors.InternalServerError({
        message: 'sourceEngineId is required'
      });
    }
    if (!engineReplacement.replacementEngineId) {
      throw new errors.InternalServerError({
        message: 'replacementEngineId is required'
      });
    }

    const sql = `
      DELETE FROM	job_new.engine_replacement__organization
      WHERE	source_engine_id = $1
        AND organization_id = $2
        AND replacement_engine_id = $3
      RETURNING	source_engine_id,
                organization_id,
                replacement_engine_id;
    `;
    const values = [
      engineReplacement.sourceEngineId,
      engineReplacement.organizationId,
      engineReplacement.replacementEngineId
    ];

    return serviceContext.dbConnections['core'].write.oneOrNone(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  async function coreWriteTx() {
    const coreWriteConn = await dbConnections['core'].write.connect();
    return {
      client: coreWriteConn,
      begin: () => coreWriteConn.query('BEGIN'),
      commit: () => coreWriteConn.query('COMMIT'),
      rollback: () =>
        coreWriteConn.query('ROLLBACK').catch((err) => {
          logger.error(err);
        })
    };
  }

  async function _addSqlWhereForEngine(
    context,
    options,
    sqlWhere,
    values,
    engineTableAlias = 'e'
  ) {
    const { useEngineGrant, resourceIds } = await _checkPackageResourceUsage(
      context
    );
    let sqlOR = [];
    let sqlPackageGrantOR = [];

    if (useEngineGrant) {
      if (!options.ownedOnly) {
        if (_.isEmpty(resourceIds)) {
          throw new errors.NotFound({
            message: 'Engine access is not granted.'
          });
        }
        values.push(resourceIds);
        sqlPackageGrantOR.push(
          `${engineTableAlias}.engine_id = ANY($${values.length}::text[])`
        );
      }
    }

    if (options.organizationId) {
      // restrict to whitelisted, owned by org, and public engines
      values.push(options.organizationId);
      const ownedSql = `${engineTableAlias}.owner_organization_id = $${values.length}`;
      sqlOR.push(ownedSql);
      sqlPackageGrantOR.push(ownedSql);

      if (!options.ownedOnly) {
        sqlOR.push(`
          ${engineTableAlias}.engine_id IN (
            SELECT
              engine_id
            FROM
              ${jobTable}.organization__engine
            WHERE
              organization_id = $${values.length}
          )
        `);
      }

      if (!useEngineGrant) {
        sqlOR.push(`${engineTableAlias}.is_public = TRUE`);
      }
    }

    // include engines in applications that requester's org has access to
    const params = [];
    if (options.applicationIds && options.applicationIds.length) {
      options.applicationIds.forEach((id) => {
        values.push(id);
        params.push(`$${values.length}`);
      });

      sqlOR.push(`
        ${engineTableAlias}.engine_id IN (
          SELECT DISTINCT
            engine_id
          FROM
            ${jobTable}.engine__application
          WHERE application_id IN (${params.join(',')})
        )
      `);
    }

    // restrict to (owned by org OR whitelisted OR public engines)
    if (sqlOR.length > 0) {
      sqlWhere.push(`(${sqlOR.join(' OR ')})`);
    }

    // AND restrict to (owned by org OR package grants)
    if (!_.isEmpty(resourceIds) && sqlOR.length > 0) {
      sqlWhere.push(`(${sqlPackageGrantOR.join(' OR ')})`);
    }

    if (!options.adminView && !useEngineGrant) {
      values.push(options.organizationId);
      // remove engine category blacklist results
      sqlWhere.push(`
        ${engineTableAlias}.engine_category_id NOT IN(
            SELECT
                engine_category_id
            FROM
                ${jobTable}.organization__engine_category_blacklist
            WHERE
                organization_id = $${values.length}
        )
      `);

      // remove engine blacklist results
      sqlWhere.push(`
        ${engineTableAlias}.engine_id NOT IN(
            SELECT
                engine_id
            FROM
                ${jobTable}.organization__engine_blacklist
            WHERE
                organization_id = $${values.length}
        )
      `);
    }
  }

   const emitEngineBuildUpdateAuditLogEvent = (build, err, context) => {
      const buildId = _.get(build, 'buildId') || _.get(build, 'id');
      serviceContext.coreJob.eventEmitter.emitEngineBuildEvent(
        eventsMap.EngineBuildUpdate,
        context,
        {
          action: 'update',
          userInfo: context._authInfo,
          engineId: _.get(build, 'engineId'),
          buildId,
          statusCode: !err ? 204 : 500,
          actionDetails: !err
            ? `Updated build ${buildId} for engine ${_.get(build, 'engineId')}`
            : `Failed to update build ${buildId} for engine ${_.get(build, 'engineId')}`
        },
        err
      );
    };

  return {
    getEngine: getEngine,
    getEngines: getEngines,
    getEngineBuildReport: getEngineBuildReport,
    getEngineTaskMetrics,
    createEngine: createEngine,
    deleteEngine: deleteEngine,
    updateEngine: updateEngine,
    createEngineBuild: createEngineBuild,
    updateEngineBuild: updateEngineBuild,
    deleteEngineBuild: deleteEngineBuild,
    createAutomateFlow: createAutomateFlow,
    createTaskLog,
    cancelJob: cancelJob,
    retryJob: retryJob,
    updateJobs: updateJobs,
    updateJobsDb: updateJobsDb,
    getBuild: getBuild,
    getBuilds: getBuilds,
    getRecentBuilds,
    getEngineOverview,
    checkOrgShowInternalEngine,
    getId,
    getName,
    getLogoPath,
    getDescription,
    getTestingDetails,
    getIdById,
    getEngineCategoryId,
    getEngineJWTToken,
    verifyJWT,
    engineWorkflow,
    getEngineTaskMetricsDb,
    getEngineBuild,
    getEngineBuilds,
    // unit test only for coreJob migration
    _updateEngine,
    _disableEngine,
    _enableEngine,
    _deleteEngine,
    newCreateEngineBuild,
    newDeleteEngineBuild,
    newDeployEngineBuild,
    newPauseEngineBuild,
    newUnpauseEngineBuild,
    newApproveEngineBuild,
    newDisapproveEngineBuild,
    newInvalidateEngineBuild,
    newSubmitEngineBuild,
    newUploadEngineBuild,
    newUpdateEngineBuildForNodeRed,
    newUpdateEngineBuildForCertification,
    newCancelJob,
    getEngineReplacements,
    createEngineReplacement,
    removeEngineReplacement,
    getAppApplicationFromEngines,
    getEngineSchemas,
    validateFlowName,
    getOwnership,
    sanitizeEngineBuildResources,
    validateDeployedBuildInLatestPackage,
    buildFilterIds,
    _getOwnedEngineIds
  };
};
