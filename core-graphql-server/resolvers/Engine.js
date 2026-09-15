const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);
  const mainUtil = require('../util.js')();
  const mapper = require('../dal/mapper.js');
  const dalEngine = serviceContext.dal.engine;
  const cache = require('./cache.js')(serviceContext);
  const entityTags = require('../dal/entityTags.js')(serviceContext);

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

  engineStateActions.default = _.mergeWith(
    {
      draft: ['edit', 'delete'],
      pending: ['edit', 'delete'],
      ready: ['edit', 'delete', 'disable'],
      active: ['disable'],
      disabled: ['edit', 'delete', 'enable']
    },
    engineStateActions.base,
    util.mergeConcatCustomizer
  );

  engineStateActions.admin = _.mergeWith(
    {
      active: ['edit', 'delete'],
      deleted: ['undelete']
    },
    engineStateActions.default,
    util.mergeConcatCustomizer
  );

  function hasKeys(obj) {
    if (!obj) return false;
    if (!Object.keys(obj).length) return false;
    return true;
  }

  function getDeployedBuild(context, engine) {
    const params = {
      engineId: engine.internalId || engine.id,
      engineAliasId: engine.aliasId,
      status: ['deployed']
    };
    return cache.get(context, params, 'EngineBuild', () => {
      return serviceContext.dal.engine
        .getEngineBuilds(params, context)
        .then((builds) => {
          const val = builds.count ? builds.records[0] : null;
          engine._deployedBuild = val;
          // mutating engine.engineManifest use_.merge lodash func, its input needs an object data not null
          engine.engineManifest = _.isEmpty(engine.engineManifest)
            ? {}
            : engine.engineManifest;
          _.merge(
            engine.engineManifest,
            val && val.manifest ? val.manifest : {}
          );
          return val;
        });
    });
  }

  async function getDeployedBuildManifestField(
    context,
    engine,
    field,
    altPath = null
  ) {
    await getDeployedBuild(context, engine);
    return getManifestField(engine, field, altPath);
  }

  function getManifestField(obj, field, altPath = null) {
    if (_.isNil(obj)) return null;

    if (!altPath) altPath = '.';
    if (!field) field = '.';
    const paths = [
      `engineManifest.${field}`,
      `engineManifest.${altPath}`,
      `buildManifest.${field}`,
      `buildManifest.${altPath}`,
      `manifest.${field}`,
      `manifest.${altPath}`
    ];

    let res;

    for (let path of paths) {
      res = _.get(obj, path);
      if (res) break;
    }

    return !res || res.length === 0 ? null : res;
  }

  return {
    tasks(obj, args, context, info) {
      // users can see public engines. we should not return
      // tasks for those engines, only engines owned
      // by the user's org. So we need to implement
      // org-based authorization here.
      const params = JSON.parse(JSON.stringify(args));
      util.authorizeOrgIds(context._authInfo, params);
      util.authorizeAppIds(context._authInfo, params);
      params.internalEngineId = obj.internalId;
      params.engineId = obj.id;
      // only query if the user is in an org that owns the engine.
      // org IDs, if passed, should be an array. we'll do a sanity check
      // here just in case.
      if (
        (_.isArray(params.organizationIds) &&
          params.organizationIds.includes(obj.ownerOrganizationId)) ||
        params.organizationId === obj.ownerOrganizationId ||
        mainUtil.isInternalAPIKey(context._authInfo)
      ) {
        return serviceContext.dal.task.getTasks(context, params);
      } else {
        return {
          offset: params.offset,
          limit: params.limit,
          count: 0,
          records: []
        };
      }
    },
    builds(obj, args, context, info) {
      // see tasks field notes re: authorization.
      const params = JSON.parse(JSON.stringify(args));
      util.authorizeOrgIds(context._authInfo, params);
      util.authorizeAppIds(context._authInfo, params);
      params.engineId = obj.internalId || obj.id;
      params.engineAliasId = obj.aliasId;
      const isInternalApiKey = mainUtil.isInternalAPIKey(context._authInfo);
      const isOrgSystemApiKey = mainUtil.isSystemOrgAPIKey(context._authInfo);
      // TODO VTN-6903 - internal API keys should not be filtered by org ID
      if (isInternalApiKey || isOrgSystemApiKey) params.organizationId = null;
      return serviceContext.dal.engine.getEngineBuilds(params, context);
    },
    async inputSchemas(obj, args, context, info) {
      // see tasks field notes re: authorization.
      const params = JSON.parse(JSON.stringify(args));
      util.authorizeOrgIds(context._authInfo, params);
      util.authorizeAppIds(context._authInfo, params);

      const schemas = await serviceContext.dal.engine.getEngineSchemas(obj.id);

      params.ids = [];
      schemas.forEach((schema) => {
        if (!schema) return;
        if (schema.ioType === 'output') return;
        params.ids.push(schema.schemaId);
      });

      return _.isEmpty(params.ids)
        ? []
        : await serviceContext.dal.structuredData.getSchemas(context, params);
    },
    async outputSchemas(obj, args, context, info) {
      // see tasks field notes re: authorization.
      const params = JSON.parse(JSON.stringify(args));
      util.authorizeOrgIds(context._authInfo, params);
      util.authorizeAppIds(context._authInfo, params);

      const schemas = await serviceContext.dal.engine.getEngineSchemas(obj.id);

      params.ids = [];
      schemas.forEach((schema) => {
        if (!schema) return;
        if (schema.ioType === 'input') return;
        params.ids.push(schema.schemaId);
      });

      return _.isEmpty(params.ids)
        ? []
        : await serviceContext.dal.structuredData.getSchemas(context, params);
    },
    taskMetrics(obj, args, context) {
      const _args = {
        id: obj.id,
        applicationId: _.get(
          context,
          'requestContext.userInfo.groups[0].applicationId'
        ),
        ...args
      };
      return dalEngine.getEngineTaskMetrics(_args, context);
    },
    category(obj, args, context, info) {
      const _args = Object.assign(
        {
          id: obj.categoryId || obj.engineCategoryId
        },
        args
      );
      return cache.get(context, _args, 'EngineCategory', () =>
        serviceContext.dal.engineCategory.getEngineCategory(
          context,
          _args,
          true
        )
      );
    },
    createsTDO: (obj) => obj.createsRecording,
    ownerOrganization: (obj, args, context, info) => {
      const _args = { id: obj.ownerOrganizationId };
      return cache.get(context, _args, 'Organization', () =>
        serviceContext.dal.organization.getOrganization(context, _args)
      );
    },
    dependency: (obj) =>
      hasKeys(obj.dependency)
        ? {
            dependencyType: obj.dependency.engine,
            assetType: obj.dependency.assetType
          }
        : null,
    validStateActions: (obj, args, context, info) => {
      if (util.isDevAdmin(context._authInfo)) {
        return engineStateActions.admin[obj.state];
      }
      return engineStateActions.default[obj.state];
    },
    oauth: async (obj, args, context) =>
      getDeployedBuildManifestField(context, obj, 'oauth'),
    isConductor: async (obj, args, context) =>
      getDeployedBuildManifestField(context, obj, 'isConductor'),
    deployedVersion: (obj, args, context) =>
      getDeployedBuild(context, obj).then((build) =>
        build ? build.version : null
      ),
    supportedSourceTypes: async (obj, args, context) =>
      getDeployedBuildManifestField(
        context,
        obj,
        'ingestion.supportedSourceTypes',
        'supportedSourceTypes'
      ),
    outputFormats: async (obj, args, context) =>
      getDeployedBuildManifestField(context, obj, 'outputFormats'),
    hasScanPhase: async (obj, args, context) =>
      getDeployedBuildManifestField(context, obj, 'ingestion.scanner'),
    mode: async (obj, args, context) =>
      getDeployedBuildManifestField(context, obj, 'engineMode').then((val) => {
        if (_.isNil(val)) {
          return null;
        } else if (_.isString(val) && val.length > 0) {
          // treat empty string as undefined
          // capitalize to match graphql enum
          // an unknown value will cause a null and error listing for this
          // field only.
          val = val.charAt(0).toUpperCase() + val.substring(1);
        } else {
          val = null;
        }
        return val;
      }),

    supportedScheduleTypes: async (obj, args, context) => {
      // convert to GraphQL enum keys
      const typeMap = {
        recurring: 'Recurring',
        continuous: 'Continuous',
        immediate: 'Now',
        'on demand': 'OnDemand',
        ondemand: 'OnDemand',
        any: 'Any'
      };

      return getDeployedBuildManifestField(context, obj, 'schedule').then(
        (res) => {
          if (!res) return null; // return null, not undefined, or gql errors out
          // tolerate either string or array in manifest json
          if (res && !_.isArray(res)) res = [res];

          if (res) {
            res = res.map((item) => typeMap[item] || item);
            // convert 'Any' to listing of all
            if (res.includes('Any')) {
              res = res.filter((item) => item !== 'Any');
              res.push(['Recurring', 'Continuous', 'OnDemand', 'Now']);
            }
          }
          return res;
        }
      );
    },
    runtimeType: (obj, args, context) =>
      getDeployedBuild(context, obj).then((build) => {
        if (_.isNil(build)) return null;
        const keys = Object.keys(build.runtime || {});
        // existing task_runtime values (as of may 2018) have a single top-level
        // key such as "iron" or "edge". we have to assume that there is only
        // one key and that it identifies the runtime type.
        return keys.length ? keys[0] : null;
      }),
    id: (obj, args, context) => dalEngine.getId(context, obj),
    name: (obj, args, context) => dalEngine.getName(context, obj),
    displayName: (obj, args, context) => dalEngine.getName(context, obj),
    description: (obj, args, context) => dalEngine.getDescription(context, obj),
    fields: (obj, args, context) => mapper.mapEngineFields(obj.fields, obj.id),
    createdDateTime: (obj) => mainUtil.fixDateTime(obj.createdDateTime),
    modifiedDateTime: (obj) => mainUtil.fixDateTime(obj.modifiedDateTime),
    logoPath: (obj, args, context) => dalEngine.getLogoPath(context, obj),
    signedLogoPath: (obj, args, context) =>
      util.getSignedUrlOrVirtual(dalEngine.getLogoPath(context, obj)),
    signedIconPath: (obj) => util.getSignedUrlOrVirtual(obj.iconPath),
    manifest: (obj) => obj.engineManifest,
    testingDetails: (obj, args, context) =>
      dalEngine.getTestingDetails(context, obj),
    standaloneJobTemplates: (obj, args) =>
      mapper.mapEngineStandaloneJobTemplate(obj, args),
    cpuResourceMcpu: (obj) => obj.cpuResourceMcpu,
    gpuSupported: (obj) => obj.gpuSupported,
    gpuTier: (obj) => obj.gpuTier,
    website: (obj) => obj.website,
    distributionType: (obj) => obj.distributionType,
    async entityTags(obj, args, context) {
      if (_.has(obj, 'entityTags')) {
        return obj.entityTags.map(mapper.mapEntityTags);
      }
      return await entityTags.getEntityTags(
        obj.id,
        'engine',
        context._authInfo.organization.organizationId
      );
    },
    priceDimension: (obj) =>
      obj.priceDimension ? _.toUpper(obj.priceDimension) : null
  };
};
