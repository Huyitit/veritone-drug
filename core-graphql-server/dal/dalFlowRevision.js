const _ = require('lodash');
const table = 'flow_revisions';
const mapper = require('./mapper.js');
const crypto = require('crypto');
const dalEngine = require('./dalEngine.js');
const dalStaticAppConfig = require('./dalStaticAppConfig.js');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

/**
 * Node-RED image tags moved from a mutable `:prod` tag to immutable commit-hash tags, so a
 * `runtime.version` persisted in job_new.flow_revisions is now a hard pin to one historical
 * image instead of a pointer that follows the latest build. Flow-revision reads therefore
 * substitute the currently configured images before returning, so Studio reports (and, on save,
 * re-persists) the image it will actually run.
 *
 * @ango2 — Jira: VE-25953 (runtime-side counterpart: VE-25952, `realtime` repo)
 * Design: https://veritone.atlassian.net/wiki/spaces/APT/pages/5222367381
 */

/** How long a successful Edge Controller image lookup is reused. */
const IMAGE_VERSION_CACHE_TTL_MS = 60 * 1000;

/**
 * How long a failed lookup is remembered. Negative caching keeps a down Edge Controller from
 * being re-probed once per flow-revision query.
 */
const IMAGE_VERSION_CACHE_ERROR_TTL_MS = 10 * 1000;

/**
 * Wall-clock budget for the Edge Controller image lookup. This call sits on the flow-revision
 * read path, so it must fail fast rather than inherit the default socket timeout.
 */
const IMAGE_VERSION_LOOKUP_TIMEOUT_MS = 2000;

/**
 * Substrings identifying images that are NOT Node-RED and must never be overwritten with the
 * configured Node-RED tags. Notebook flows store `automate-notebook:*` in both `version.studio`
 * and `version.runner` (see dalFlow.js createFlow, `args.input.isNotebook`); substituting there
 * would rewrite them on read and then persist that rewrite on the next Studio save.
 */
const NON_NODE_RED_IMAGE_MARKERS = ['automate-notebook'];

/** Upper bound on an accepted image reference, to keep a hostile response out of the DB. */
const MAX_IMAGE_REFERENCE_LENGTH = 512;

/** Shape of a docker image reference: `[registry/]repo[:tag]`, no whitespace or control chars. */
const IMAGE_REFERENCE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._\-/]*(:[a-zA-Z0-9._-]+)?$/;

/**
 * Fallbacks used only to derive the ALLOWED repository for validation when config is absent.
 * These mirror the defaults already hardcoded in getControllerNodeRedImageVersion().
 */
const DEFAULT_RUNNER_IMAGE =
  'registry.central.aiware.com/node-red-runner-v3:stable';
const DEFAULT_STUDIO_IMAGE = 'registry.central.aiware.com/node-red-v3:stable';

/**
 * Cached Edge Controller image lookups, keyed by resolved controller URL.
 *
 * Module-scoped on purpose: this module is instantiated more than once per process (dalFlow.js
 * builds its own instance via `require('./dalFlowRevision.js')(serviceContext, dalEngine)`), and
 * the cache must be shared across those instances. Entries are either `{ promise }` while a
 * lookup is in flight (single-flight, so a burst on expiry produces one upstream call) or
 * `{ value, expiresAt }` once resolved, where `value` is null for a cached failure.
 *
 * Cross-replica skew of up to IMAGE_VERSION_CACHE_TTL_MS after an image config change is an
 * accepted trade-off, documented in the design doc's "Cross-replica skew" risk.
 */
const nodeRedImageVersionCache = new Map();

module.exports = function createFunction(serviceContext, dalEngine) {
  const mainUtil = require('../util.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const core = serviceContext.dbConnections['core'];

  async function flowRevisionAccess(context, args) {
    const callingOrg = _.toString(_.get(context, '_authInfo.organization.organizationId'));
    // if caller is attempting to fetch by flowId/engineId, check owning org of flow
    const flowId = args.engineId || args.flowId;
    if (flowId) {
      const flow = await dalEngine.getEngine(context, { id: flowId });
      if (flow) {
        const owningOrg = _.toString(flow.ownerOrganizationId);
        if (owningOrg === callingOrg && (!_.isEmpty(owningOrg) && !_.isEmpty(callingOrg))) {
          // owning org is same as calling org, so caller has access, and we don't need to use engine grants
          args.organizationId = callingOrg;
          return false;
        }
      }
    }

    const useEngineGrantFlag = await _getUseEngineGrantFlag(context);
    const perm = 'job.read';
    mainUtil.requirePerm(perm, context);

    // if we're validating access using engine grants, we don't need to use orgId
    const organizationId = useEngineGrantFlag ? null : callingOrg;
    args.organizationId = organizationId;
    return useEngineGrantFlag;
  }

  /**
  * @description Retrieves a single flow revision by its ID, with optional access validation.
  * @async
  * @param {object} context - The request context.
  * @param {object} args - The query arguments containing the flow revision's ID and organization ID.
  * @param {string} args.id - The unique identifier of the flow revision.
  * @param {string} args.organizationId - The ID of the organization the revision belongs to.
  * @param {boolean } [accessValidated=false] - An optional flag to indicate if access has already been validated. If not provided, access will be validated internally.
  * @returns {Promise<object | null>} - A promise that resolves to the flow revision object or null if not found.
  * @throws {Error} - Throws an error if access validation fails.
  */
  async function getFlowRevision(context, args, accessValidated = false) {
    let useEngineGrantFlag;
    if (!(accessValidated)) {
      useEngineGrantFlag = await flowRevisionAccess(context, args);
    } else {
      useEngineGrantFlag = accessValidated;
    }
    const flowRevision = await getRevisionDb(args, args.organizationId, args.id);
      if (flowRevision) {
        const callingOrg = _.toString(_.get(context, '_authInfo.organization.organizationId'));
        const owningOrg = _.toString(flowRevision.organizationId);
        // before returning, if owning org is different from calling org AND useEngineGrantFlag is true, validate read access to parent flow resource
        if (callingOrg !== owningOrg && useEngineGrantFlag) {
          await serviceContext.dal.flow.validateReadAccess(context, flowRevision.engineId, useEngineGrantFlag);
        }
      }

    // VE-25953: substituted at the read boundary rather than inside getRevisionDb(), which is
    // shared with write paths — see deployFlowRevision(), where the stored hash is carried over
    // alongside the runtime and would stop matching it.
    return await applyCurrentImageVersionsToRecord(flowRevision);
  }

  /**
  * @description Retrieves a list of flow revisions based on the provided arguments. It can fetch a single revision by ID or multiple revisions by parent flow ID.
  * @async
  * @param {object} context - The request context.
  * @param {object} args - The query arguments.
  * @param {string} [args.id] - Optional: The unique identifier of a single flow revision to retrieve.
  * @param {string} [args.engineId] - Optional: The unique identifier of the parent flow to fetch revisions for.
  * @param {string} [args.flowId] - Optional: An alias for engineId.
  * @returns {Promise<object>} - A promise that resolves to a paginated list of flow revision objects.
  * @throws {Error} - Throws an error if access validation fails.
  */
  async function getFlowRevisions(context, args) {
    const useEngineGrantFlag = await flowRevisionAccess(context, args);
    const flowRevisionId = args.id;
    if (flowRevisionId) {
      const flowRevision = await getFlowRevision(context, args, useEngineGrantFlag);
      return mainUtil.toPage(args, mapper.mapFlowRevision([flowRevision]));
    }

    const flowId = args.engineId || args.flowId;
    if (flowId) {
      await serviceContext.dal.flow.validateReadAccess(context, flowId, useEngineGrantFlag);
    }

    return await getRevisionsDb(context, args);
  }

  async function getFlowRevisionsByIds(context, args) {
    const useEngineGrantFlag = await flowRevisionAccess(context, args);
    const flowRevisionIds = args.ids;
    await serviceContext.dal.flow.validateReadAccess(context, flowRevisionIds, useEngineGrantFlag);
    
    const queryArgs = [];
    const idArgs = [];
    for (const id of flowRevisionIds) {
      queryArgs.push(id);
      idArgs.push(`$${queryArgs.length}`);
    }

    let sql = `SELECT
      f.flow_revision_id,
      f.flow_revision_numb,
      f.organization_id,
      f.engine_id,
      f.is_head,
      f.is_deployed,
      f.runtime,
      f.hash,
      f.created_date_time,
      f.updated_date_time,
      f.updated_by,
      f.build_id,
      f.user_id,
      f.description
      from job_new.flow_revisions f
      WHERE f.flow_revision_id IN (${idArgs.join(', ')})`;
    
    if (args.organizationId) {
      queryArgs.push(args.organizationId.toString());
      sql += ` AND f.organization_id = $${queryArgs.length}`;
    }

    const res = await core.read.query(sql, queryArgs);
    if (res && res.length) {
      // VE-25953: one cached lookup covers the whole page.
      const records = await applyCurrentImageVersionsToRecords(
        mapper.mapFlowRevision(res)
      );
      return mainUtil.toPage(args, records);
    }

    return mainUtil.toPage(args, mapper.mapFlowRevision([]));
  }

  async function getRevisionsDb(context, args) {
    let limit = args.limit ? args.limit : 100;
    let offset = args.offset ? args.offset : 0;
    let clause = ['1 = 1'];
    let queryArgs = [];
    let queryMap = {
      isHead: 'f.is_head',
      isDeployed: 'f.is_deployed'
    };

    let flowId;
    for (let index in queryMap) {
      if (args[index]) {
        clause.push(`${queryMap[index]} = ${args[index]}`);
      }
    }

    if (args.organizationId) {
      queryArgs.push(args.organizationId.toString());
      clause.push(`f.organization_id = $${queryArgs.length}`);
    }

    args.input = args.input || {};
    if (
      args.engineId !== undefined ||
      args.flowId !== undefined ||
      args.input.flowId !== undefined
    ) {
      flowId = args.engineId || args.flowId || args.input.flowId;
      queryArgs.push(flowId);
      clause.push(`f.engine_id = $${queryArgs.length}`);
    }
    if (args.buildId !== undefined) {
      queryArgs.push(args.buildId);
      clause.push(`f.build_id = $${queryArgs.length}`);
    }
    if (args.userId !== undefined) {
      queryArgs.push(args.userId);
      clause.push(`f.user_id = $${queryArgs.length}`);
    }
    if (args.hasBuilds !== undefined) {
      if (args.hasBuilds == true) {
        clause.push(`f.build_id IS NOT NULL`);
      } else {
        clause.push(`f.build_id IS NULL`);
      }
    }
    queryArgs.push(limit, offset);

    let sql = `SELECT
      f.flow_revision_id,
      f.flow_revision_numb,
      f.organization_id,
      f.engine_id,
      f.is_head,
      f.is_deployed,
      f.runtime,
      f.hash,
      f.created_date_time,
      f.updated_date_time,
      f.updated_by,
      f.build_id,
      f.user_id,
      f.description
      from job_new.flow_revisions f
      WHERE ${clause.join(' AND ')}
      ORDER BY f.created_date_time
      LIMIT $${queryArgs.length - 1}
      OFFSET $${queryArgs.length};`;

    const res = await core.read.query(sql, queryArgs);
    if (res && res.length) {
      // VE-25953: one cached lookup covers the whole page.
      const records = await applyCurrentImageVersionsToRecords(
        mapper.mapFlowRevision(res)
      );
      return mainUtil.toPage(args, records);
    }

    return mainUtil.toPage(args, mapper.mapFlowRevision([]));
  }

  async function getRevisionDb(args, organizationId, revisionId) {
    var clause = ['f.flow_revision_id = $1'];
    var queryArgs = [revisionId];
    if (organizationId) {
      clause.push(`f.organization_id = $2`);
      queryArgs.push(organizationId.toString());
    }

    let sql = `SELECT
      f.flow_revision_id,
      f.flow_revision_numb,
      f.organization_id,
      f.engine_id,
      f.is_head,
      f.is_deployed,
      f.runtime,
      f.hash,
      f.created_date_time,
      f.updated_date_time,
      f.updated_by,
      f.build_id,
      f.user_id,
      f.description
      from job_new.flow_revisions f
      WHERE ${clause.join(' AND ')};`;

    const res = await core.read.query(sql, queryArgs);
    return res && res[0] ? mapper.mapFlowRevision(res[0]) : null;
  }

  async function getFlowHead(args, organizationId, flowId) {
    let sql = `SELECT
      f.flow_revision_id,
      f.flow_revision_numb,
      f.organization_id,
      f.engine_id,
      f.is_head,
      f.is_deployed,
      f.runtime,
      f.hash,
      f.created_date_time,
      f.updated_date_time,
      f.updated_by,
      f.build_id,
      f.description
      from job_new.flow_revisions f
      WHERE f.organization_id = $1 AND f.engine_id = $2 AND f.is_head = TRUE;`;
    var queryArgs = [organizationId, flowId];
    const res = await core.read.query(sql, queryArgs);
    return res && res[0] ? mapper.mapFlowRevision(res[0]) : null;
  }

  async function validateFlowRevisionRuntime(runtime, clusterId = null) {
    let runtimeObj = runtime;

    if (typeof runtime !== 'object') {
      try {
        runtimeObj = JSON.parse(runtime);
      } catch (error) {
        throw new errors.InvalidInput({
          message: 'Invalid runtime json.',
          data: { runtime: runtime }
        });
      }
    }

    // set default version
    if (
      !runtimeObj.version ||
      !runtimeObj.version.studio ||
      !runtimeObj.version.runner
    ) {
      const defaultVersion = await getControllerNodeRedImageVersion(
        serviceContext,
        clusterId
      );
      runtimeObj.version = defaultVersion;
    }

    const requiredFields = [
      'flows',
      'package',
      'version',
      'version.studio',
      'version.runner'
    ];
    const missingFields = [];
    for (const f of requiredFields) {
      if (!_.get(runtimeObj, f)) {
        missingFields.push(f);
      }
    }
    if (missingFields.length) {
      throw new errors.InvalidInput({
        message: 'Invalid runtimeObject',
        data: { runtime: runtime, required: missingFields }
      });
    }

    return runtimeObj;
  }

  async function createFlowRevision(context, args) {
    // updatedBy: default value is automate app ID
    const updatedByDefault = 'bdf9375e-1092-4233-8197-9ccbc11357c5';
    const perm = 'developer.build.create';
    mainUtil.requirePerm(perm, context);

    const organizationId =
      '' + _.get(context, '_authInfo.organization.organizationId');
    const input = args.input;
    const engineId = input.engineId || input.flowId;
    let validRuntime = input.runtime;
    if (validRuntime) {
      validRuntime = await validateFlowRevisionRuntime(
        validRuntime,
        input.clusterId
      );
    }

    const runtime = JSON.stringify(validRuntime, null, 0);

    const description = input.description;
    let hash = null;
    if (args.hash) {
      hash = args.hash;
    } else {
      let createHash = crypto.createHash('sha256');
      createHash.update(runtime);
      hash = createHash.digest('hex');
    }
    // lookup previous builds with the same hash
    let dup = await checkForDups(context, {
      organizationId,
      hash,
      engineId
    });
    if (dup && !input.forceCreate) {
      return dup;
    }

    const tokenInfo = _.get(context, 'requestContext.tokenInfo');
    const userId = _.get(context, '_authInfo.userId') || tokenInfo.userId;

    // If user info could not be gathered from the token, then assume this
    // is a user-less API token and set to automate app id as default.
    const updatedBy = userId ? userId : updatedByDefault;

    let nextBuildNumb = await extractNextBuildNumb(context, {
      organizationId,
      engineId
    });

    if (input.isHead) {
      await setFieldBoolean(organizationId, engineId, {
        is_head: false
      });
    }
    // add extra column for user id and for user name
    const fields = {
      flow_revision_id: input.flowRevisionId ? input.flowRevisionId : uuidv4(),
      runtime: JSON.parse(runtime),
      hash: hash,
      flow_revision_numb: nextBuildNumb,
      organization_id: organizationId,
      updated_by: updatedBy,
      updated_date_time: new Date(),
      user_id: userId,
      engine_id: engineId,
      description: description,
      is_head: input.isHead ? true : false
    };

    // make and run script for creating flow
    const { sql, values } = mainUtil.makeInsertSql(
      'job_new.flow_revisions',
      fields,
      flowRevisionFields
    );

    let revisions = await core.write.query(sql, values);
    const engineUpdate = {};
    engineUpdate.sql = `
      UPDATE
        job_new.engine
      SET
        updated_date = $3
      WHERE owner_organization_id = $1 AND engine_id = $2;`;
    engineUpdate.values = [
      organizationId,
      engineId,
      Math.floor(Date.now() / 1000)
    ];
    await core.write.none(engineUpdate.sql, engineUpdate.values);
    return mapper.mapFlowRevision(_.get(revisions, '0'));
  }

  async function updateFlowRevision(context, args) {
    const perm = 'developer.build.create';
    mainUtil.requirePerm(perm, context);

    const organizationId =
      '' + _.get(context, '_authInfo.organization.organizationId');

    const input = args.input;
    const engineId = input.engineId || input.flowId;
    const runtime = input.runtime;
    const description = input.description;

    let data = {};

    if (input.description) {
      data.description = input.description;
    }

    if (input.buildId) {
      data.build_id = input.buildId;
    }
    if (runtime) {
      const validRuntime = await validateFlowRevisionRuntime(runtime);
      data.runtime = validRuntime;
    }

    let fieldValues = [
      input.flowRevisionId,
      organizationId,
      input.flowRevisionNumb,
      engineId
    ];

    let revision = await getRevisionDb(
      args,
      organizationId,
      input.flowRevisionId
    );
    if (!revision) {
      return null;
    }

    var fieldValueOffset = Object.keys(data).length;
    let clause = ` flow_revision_id =
      $${fieldValueOffset + 1}`;

    let { sql, values } = mainUtil.makeUpdateSql(
      'job_new.flow_revisions',
      data,
      flowRevisionFields,
      clause
    );

    values = values.concat(fieldValues);

    let updatedFlowRevision = await core.write.query(sql, values);

    updatedFlowRevision = _.get(updatedFlowRevision, '0');

    if (updatedFlowRevision) return mapper.mapFlowRevision(updatedFlowRevision);
    else throw new Error('failed to update flow revision');
  }

  async function updateFlowRevisionHead(context, args) {
    const perm = 'developer.build.create';
    mainUtil.requirePerm(perm, context);

    const organizationId =
      '' + _.get(context, '_authInfo.organization.organizationId');

    const input = args.input;
    const engineId = input.flowId;
    const runtime = input.runtime;
    let validRuntime = runtime;
    if (runtime) {
      validRuntime = await validateFlowRevisionRuntime(runtime);
    }

    let createHash = crypto.createHash('sha256');
    createHash.update(JSON.stringify(validRuntime, null, 0));
    const hash = createHash.digest('hex');

    let head = await getFlowHead(args, organizationId, engineId);
    if (!head) {
      args.input.isHead = true;
      return await createFlowRevision(context, args);
    }
    if (input.preserveHead) {
      args.input.isHead = false;
      args.input.forceCreate = false;
      args.input.runtime = head.runtime;
      await createFlowRevision(context, args);
    }

    let data = {
      runtime: validRuntime,
      hash: hash,
      updated_date_time: moment().toISOString()
    };

    let fieldValues = [head.flowRevisionId];

    var fieldValueOffset = Object.keys(data).length;
    let clause = ` flow_revision_id = $4`;

    let { sql, values } = mainUtil.makeUpdateSql(
      'job_new.flow_revisions',
      data,
      flowRevisionFields,
      clause
    );

    values = values.concat(fieldValues);

    let updatedFlowRevision = await core.write.query(sql, values);

    updatedFlowRevision = _.get(updatedFlowRevision, '0');

    return mapper.mapFlowRevision(updatedFlowRevision);
  }
  async function deployFlowRevision(context, args) {
    const perm = 'developer.build.create';
    mainUtil.requirePerm(perm, context);
    const organizationId =
      '' + _.get(context, '_authInfo.organization.organizationId');
    const input = args.input;
    const flowRevisionId = input.flowRevisionId;
    const engineId = input.engineId || input.flowId;
    let flow = null;
    if (flowRevisionId) {
      flow = await getRevisionDb(args, organizationId, flowRevisionId);
    } else if (engineId) {
      let head = await getFlowHead(args, organizationId, engineId);
      if (!head) {
        return null;
      }
      args.input = args.input || {};
      args.input.runtime = head.runtime;
      args.input.description = head.description;
      args.input.isHead = false;
      args.input.forceCreate = true;
      args.hash = head.hash;
      flow = await createFlowRevision(context, args);
    }
    if (!flow) {
      return flow;
    }
    args.input.engineId = flow.engineId;
    args.input.buildId = flow.buildId;
    // create a new build if one doesnt exist
    if (!flow.buildId) {
      const dockerImage = await getControllerNodeRedImage(serviceContext);
      let buildArgs = {
        input: {
          engineId: flow.engineId,
          taskRuntime: {
            edge: {},
            nodeRed: flow.runtime
          },
          manifest: {
            runtime: 'nodeRed',
            engineMode: 'chunk',
            supportedInputTypes: ['application/json']
          },
          dockerImage: dockerImage
        }
      };
      const newBuild = await dalEngine.createEngineBuild(buildArgs, context);
      args.input.buildId = newBuild.buildId;
    }
    // set all other revisions to deployed false
    await setFieldBoolean(organizationId, flow.engineId, {
      is_deployed: false
    });

    let data = {
      is_deployed: true,
      build_id: args.input.buildId
    };
    let clause = 'flow_revision_id = $3';
    let { sql, values } = mainUtil.makeUpdateSql(
      'job_new.flow_revisions',
      data,
      flowRevisionFields,
      clause
    );

    values.push(flow.flowRevisionId);
    let updatedFlowRevision = await core.write.query(sql, values);
    updatedFlowRevision = _.get(updatedFlowRevision, '0');

    args.input.engineId = updatedFlowRevision.engine_id;
    args.input.buildId = updatedFlowRevision.build_id;
    await dalEngine.newSubmitEngineBuild(args, context);
    await dalEngine.newDeployEngineBuild(args, context);

    const useAutomaticPackageCreation = await mainUtil.isOrgSettingEnabled(
      context,
      'automaticPackageCreation'
    );

    const callerDisabledAutoPackageCreation = _.get(
      args,
      'input.disableAutoPackageCreation',
      false
    );

    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    if (callerDisabledAutoPackageCreation && !isSuperAdmin) {
      throw new errors.NotAllowed({
        message:
          'Only a superadmin token can set the disableAutoPackageCreation flag.'
      });
    }
    if (useAutomaticPackageCreation && !callerDisabledAutoPackageCreation) {
      await createAutomatePackage(context, updatedFlowRevision);
    }

    // Update engine state
    const engineUpdate = {};
    engineUpdate.sql = `
      UPDATE
        job_new.engine
      SET
        updated_date = $3,
        engine_state = $4
      WHERE owner_organization_id = $1 AND engine_id = $2;`;
    engineUpdate.values = [
      organizationId,
      engineId,
      Math.floor(Date.now() / 1000),
      'active'
    ];
    await core.write.none(engineUpdate.sql, engineUpdate.values);
    if (useAutomaticPackageCreation && !callerDisabledAutoPackageCreation) {
      serviceContext.dal.packages.updatePublicEngineList(
        { id: engineId },
        context
      );
    }
    return mapper.mapFlowRevision(updatedFlowRevision);
  }

  async function createAutomatePackage(
    context,
    flowRevision,
    packageName = '',
    distributionType = '',
    packageIds = [],
    resources = []
  ) {
    const automateType = 'automateFlowRevision';
    let packageToUpdate;
    try {
      packageToUpdate = await getLatestAutomatePackageFromEngineId(context, {
        engineId: flowRevision.engine_id
      });
    } catch (err) {
      serviceContext.logger.info(
        'Automate Package Creation: No existing package found. Creating a new one'
      );
    }

    let packageInput = {
      name: packageName,
      primaryResourceId: flowRevision.flow_revision_id,
      resources: [
        {
          resourceType: automateType,
          resourceId: flowRevision.flow_revision_id,
          action: 'ADD'
        }
      ],
      status: 'draft',
      distributionType: distributionType
    };

    if (packageIds && packageIds.length > 0) {
      for (const packageId of packageIds) {
        packageInput.resources.push({
          resourceType: 'package',
          resourceId: packageId,
          action: 'ADD'
        });
      }
    }

    if (resources && resources.length > 0) {
      for (const resource of resources) {
        packageInput.resources.push({
          resourceType: resource.resourceType,
          resourceId: resource.resourceId,
          action: 'ADD'
        });
      }
    }

    // for deploy flow revision
    if (flowRevision.build_id) {
      const EnginePackagesWithBuildId = await serviceContext.dal.packages.getPackages(
        //get new engine package to be linked to new automate package
        context,
        { resourceId: flowRevision.build_id }
      );
      if (_.isEmpty(EnginePackagesWithBuildId.records)) {
        serviceContext.logger.error(
          'Automate Package Creation: Failed to create automate package, engine package with correct build does not exist'
        );
        return;
      }

      //finds correct engine package from packages with buildId
      const correctEnginePackage = EnginePackagesWithBuildId.records.find(
        (possibleEnginePackage) =>
          possibleEnginePackage.primaryResourceId === flowRevision.engine_id
      );

      packageInput.name = correctEnginePackage.packageName;
      packageInput.resources.push({
        resourceType: 'package',
        resourceId: correctEnginePackage.packageId,
        action: 'ADD'
      });
      packageInput.distributionType = correctEnginePackage.distributionType;
    }

    if (_.isEmpty(packageToUpdate)) {
      packageInput = {
        ...packageInput,
        version: '1.0'
      };
      return await serviceContext.dal.packages.packageCreate(
        packageInput,
        context,
        {
          isVersionUpgrade: false,
          preprocessResources: true,
          skipPackageAccessValidation: true
        }
      );
    }

    const oldPackageResources = await serviceContext.dal.packages.getPackageResources(
      context,
      {
        packageId: packageToUpdate.packageId
      }
    );

    let oldEnginePackageResource, oldRevisionResource;
    for (let i = 0; i < oldPackageResources.records.length; i++) {
      let curResource = oldPackageResources.records[i];
      if (curResource.resourceType === 'package') {
        const currResourcePackage = await serviceContext.dal.packages.getPackages(
          context,
          {
            id: curResource.resourceId
          }
        );
        //checks if this package is the engine package
        if (
          !_.isEmpty(currResourcePackage.records) &&
          currResourcePackage.records[0].primaryResourceId ===
            flowRevision.engine_id
        ) {
          oldEnginePackageResource = curResource;
        }
      } else if (curResource.resourceType === 'automate_flow_revision') {
        oldRevisionResource = curResource;
      }
    }

    if (!oldRevisionResource) {
      serviceContext.logger.error(
        'Automate Package: Unable to retrieve resources to remove from package'
      );
      return;
    }

    let removeResources = [];
    if (oldRevisionResource) {
      removeResources.push({
        resourceType: automateType,
        resourceId: oldRevisionResource.resourceId,
        action: 'REMOVE'
      });
    }

    if (oldEnginePackageResource) {
      removeResources.push({
        resourceType: 'package',
        resourceId: oldEnginePackageResource.resourceId,
        action: 'REMOVE'
      });
    }

    packageInput = {
      ...packageInput,
      id: packageToUpdate.packageId,
      resources: [...removeResources, ...packageInput.resources]
    };

    return await serviceContext.dal.packages.packageUpdate(
      packageInput,
      context,
      false
    );
  }

  async function getLatestAutomatePackageFromEngineId(context, args) {
    let sql = `
    SELECT
      p.package_id,
      p.organization_id,
      p.package_name,
      p.package_description,
      p.package_icon,
      p.package_version,
      prim.resource_id as primary_resource_id,
      p.source_package_id,
      p.distribution_type,
      p.source_origin_id,
      p.source_package_id,
      p.aiware_version,
      p.deleted,
      p.date_created,
      p.date_modified,
      p.created_by,
      p.modified_by,
      p.package_created_date,
      p.status,
      p.install_date,
      p.distribution_date,
      p.auto_generated
    FROM
      aiware.package p
    LEFT JOIN aiware.package__primary_resource prim ON prim.package_id = p.package_id
    LEFT JOIN aiware.package__resource pr ON pr.package_id = p.package_id
    LEFT JOIN job_new.flow_revisions fr ON text(fr.flow_revision_id) = prim.resource_id
    WHERE pr.resource_type=$1 AND fr.engine_id = uuid($2) AND p.deleted = false
    ORDER BY p.date_created desc
    LIMIT 1;
  `;

    let sqlArgs = ['automate_flow_revision', args.engineId];
    let res;
    try {
      res = await core.read.one(sql, sqlArgs);
    } catch (err) {
      throw new errors.NotFound({
        message: `Package for automate flow ${args.engineId} does not exist`
      });
    }
    const {
      latestNonDeletedPackage
    } = await serviceContext.dal.packages.getLatestPackageInLineage(
      res.source_origin_id
    );
    return latestNonDeletedPackage;
  }

  async function checkForDups(context, options) {
    let sqlQuery = `SELECT
      f.flow_revision_id,
      f.flow_revision_numb,
      f.organization_id,
      f.engine_id,
      f.is_head,
      f.runtime,
      f.hash,
      f.created_date_time,
      f.updated_date_time,
      f.updated_by,
      f.build_id,
      f.description
      from job_new.flow_revisions f
      WHERE f.organization_id = $1 AND f.engine_id = $2 AND f.hash = $3 AND f.is_head = $4`;
    var queryArgs = [
      options.organizationId,
      options.engineId,
      options.hash,
      false
    ];

    let res = await core.read.query(sqlQuery, queryArgs);

    return res.length ? mapper.mapFlowRevision(_.get(res, '0')) : null;
  }

  async function extractNextBuildNumb(context, options) {
    let sqlQuery = `SELECT
      f.flow_revision_id,
      f.flow_revision_numb,
      f.organization_id,
      f.engine_id,
      f.is_head,
      f.runtime,
      f.hash,
      f.created_date_time,
      f.updated_date_time,
      f.updated_by,
      f.build_id,
      f.description
      from job_new.flow_revisions f
      WHERE f.organization_id = $1 AND f.engine_id = $2
      ORDER BY created_date_time DESC
      LIMIT 1`;
    var queryArgs = [options.organizationId, options.engineId];

    let res = await core.read.query(sqlQuery, queryArgs);

    return res[0] ? res[0].flow_revision_numb + 1 : 1;
  }

  async function setFieldBoolean(organizationId, engineId, field) {
    let clause = `organization_id = $2 AND engine_id = $3`;
    let { sql } = mainUtil.makeUpdateSql(
      'job_new.flow_revisions',
      field,
      { engine_id: 'engineId' },
      clause
    );
    let updateHead = await core.write.query(sql, [
      false,
      organizationId,
      engineId
    ]);
    return updateHead;
  }

  /**
   * Get node-red-runner docker image from edge config.
   *
   * @param {string} automateControllerUrl - Controller base URL.
   * @param {object} [options]
   * @param {number} [options.timeoutMs] - Optional abort deadline. Only the flow-revision READ
   *   path sets this. The write-path caller (getControllerNodeRedImageVersion, reached from
   *   createFlow / validateFlowRevisionRuntime / dalEngine) deliberately passes nothing so its
   *   behaviour is unchanged: a deadline there would abort a slow-but-healthy controller and make
   *   createFlow persist the config-default (mutable) tag into a brand-new flow and its engine
   *   build — reintroducing on the write path the stale-image bug VE-25953 removes on the read
   *   path. Bounding the write-path call is worth doing, but it is a behavioural change that
   *   belongs in its own ticket. Jira: VE-25953
   * @returns {Promise<object>} The parsed image payload, or `{ success: false }` on any failure.
   */
  async function getNodeRedVersionEdgeApi(automateControllerUrl, options = {}) {
    const controller_url = automateControllerUrl.replace('/edge/v1', '');
    const imageUrl = `${controller_url}/edge/v1/flow/engineId/image/`;
    try {
      const fetchOptions = { method: 'GET' };
      if (options.timeoutMs) {
        // Without a signal an unresponsive Edge Controller would hold the caller open for the
        // full socket timeout — unacceptable on the read path.
        fetchOptions.signal = AbortSignal.timeout(options.timeoutMs);
      }
      const res = await fetch(imageUrl, fetchOptions);

      if (!res.ok) {
        throw new Error(`HTTP error! Status: ${res.status}`);
      }

      return await res.json();
    } catch (error) {
      // WARN, not ERROR: every caller degrades to a stored or configured image, so this is an
      // unexpected state the service recovers from rather than one needing operator action.
      serviceContext.logger.warn(
        `Node-RED image lookup failed for ${redactUrl(imageUrl)}: ${_.get(
          error,
          'message',
          String(error)
        )}`
      );
      return {
        success: false
      };
    }
  }

  async function getControllerNodeRedImage(serviceContext) {
    return (await getControllerNodeRedImageVersion(serviceContext)).runner;
  }

  /**
   * Asynchronously retrieves the controller URL based on the given cluster ID or configuration.
   *
   * This function tries to obtain the controller URL by checking several sources in the following order:
   * 1. If a `clusterId` is provided, get the controller URL associated with the cluster.
   * 2. If the environment variable `AIWARE_CONTROLLER_URI` is set, it returns that as the URL.
   * 3. If neither is available, it falls back to a static configuration or default PROD URL.
   *
   * @async
   * @param {Object} staticConfig - The static configuration object.
   * @param {string} [clusterId] - The ID of the cluster to retrieve the controller URL from.
   * @returns {Promise<string>} The controller URL retrieved from the cluster, environment variable, or static configuration.
   */
  async function getControllerNodeRedUrl(staticConfig, clusterId) {
    if (clusterId) {
      const sqlQuery = `
        SELECT controller_url
        FROM aiware.cluster c
        WHERE c.cluster_id = $1
      `;

      try {
        const res = await core.read.one(sqlQuery, [clusterId]);
        const automateControllerUrl = _.get(res, ['controller_url'], null);

        if (automateControllerUrl) {
          return automateControllerUrl;
        }
      } catch (error) {
        serviceContext.logger.error(
          `Failed to retrieve controller URL for cluster ${clusterId}: ${error.message}`
        );
      }
    }

    const envControllerUrl = process.env.AIWARE_CONTROLLER_URI;
    if (envControllerUrl) {
      return envControllerUrl;
    }

    return _.get(
      staticConfig,
      'automateControllerUrl',
      'https://automate-controller-v3f.aws-prod-rt.veritone.com'
    );
  }

  async function getControllerNodeRedImageVersion(
    serviceContext,
    clusterId = null
  ) {
    const config = serviceContext.config;
    const staticConfig = dalStaticAppConfig(
      serviceContext
    ).getStaticAppConfig();

    const automateControllerUrl = await getControllerNodeRedUrl(
      staticConfig,
      clusterId
    );
    const controllerNodeRedImage = _.get(
      config,
      'controllerNodeRedImage',
      'registry.central.aiware.com/node-red-runner-v3:stable'
    );

    const controllerNodeRedImageStudio = _.get(
      config,
      'controllerNodeRedImageStudio',
      'registry.central.aiware.com/node-red-v3:stable'
    );

    const controllerUrl = automateControllerUrl.replace('automate-', '');
    const dataNodeRedVersion = await getNodeRedVersionEdgeApi(controllerUrl);
    let version = {};
    version.runner = _.get(
      dataNodeRedVersion,
      'version.runner',
      controllerNodeRedImage
    );
    version.studio = _.get(
      dataNodeRedVersion,
      'version.studio',
      controllerNodeRedImageStudio
    );
    return version;
  }

  /**
   * Strip any embedded credentials from a URL before it reaches a log line. Controller URLs come
   * from operator-managed config and `aiware.cluster.controller_url`, either of which could carry
   * `https://user:pass@host`. Jira: VE-25953
   *
   * @param {string} url
   * @returns {string} The URL's origin and path, without userinfo.
   */
  function redactUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.username = '';
      parsed.password = '';
      return `${parsed.origin}${parsed.pathname}`;
    } catch (error) {
      return '<unparseable-url>';
    }
  }

  /**
   * @param {string} imageReference - e.g. `registry.central.aiware.com/node-red-v3:abc1234`.
   * @returns {string} The `[registry/]repo` part, without the tag.
   */
  function imageRepository(imageReference) {
    const lastColon = imageReference.lastIndexOf(':');
    const lastSlash = imageReference.lastIndexOf('/');
    // A colon before the last slash is a registry port, not a tag separator.
    return lastColon > lastSlash
      ? imageReference.slice(0, lastColon)
      : imageReference;
  }

  /**
   * The repositories aiware-core will accept from the Edge Controller, derived from local config.
   *
   * This is the trust boundary: the Edge Controller gets to choose the *tag* (the version), not the
   * *identity* of the image. Reads the correctly-nested `automateServices.*` key first, then the
   * legacy top-level key that getControllerNodeRedImageVersion() still uses, then the hardcoded
   * default — so validation cannot false-reject in an environment where only one is populated.
   * Jira: VE-25953
   *
   * @returns {{studio: string, runner: string}} Allowed `[registry/]repo` values.
   */
  function getAllowedImageRepositories() {
    const config = serviceContext.config;
    const runner =
      _.get(config, 'automateServices.controllerNodeRedImage') ||
      _.get(config, 'controllerNodeRedImage') ||
      DEFAULT_RUNNER_IMAGE;
    const studio =
      _.get(config, 'automateServices.controllerNodeRedImageStudio') ||
      _.get(config, 'controllerNodeRedImageStudio') ||
      DEFAULT_STUDIO_IMAGE;
    return {
      runner: imageRepository(runner),
      studio: imageRepository(studio)
    };
  }

  /**
   * Validate one image reference returned by the Edge Controller before it is substituted into a
   * flow revision and — via Studio's save — persisted into job_new.flow_revisions.
   *
   * aiware-core is the system of record for flow_revisions.runtime, so a value from another service
   * does not get written there unchecked. A response that fails validation is treated as "lookup
   * unavailable", which the caller already handles by keeping the stored value. Jira: VE-25953
   *
   * @param {*} candidate - Untrusted value from the Edge Controller response.
   * @param {string} allowedRepository - Expected `[registry/]repo` for this slot.
   * @param {string} slot - 'studio' | 'runner', for logging.
   * @returns {boolean} True when the value is safe to substitute.
   */
  function isValidControllerImage(candidate, allowedRepository, slot) {
    if (!_.isString(candidate) || !candidate.length) {
      serviceContext.logger.error(
        `Edge Controller returned a non-string ${slot} image (${typeof candidate}); keeping stored runtime version`
      );
      return false;
    }
    if (candidate.length > MAX_IMAGE_REFERENCE_LENGTH) {
      serviceContext.logger.error(
        `Edge Controller returned an oversized ${slot} image reference (${candidate.length} chars); keeping stored runtime version`
      );
      return false;
    }
    if (!IMAGE_REFERENCE_PATTERN.test(candidate)) {
      serviceContext.logger.error(
        `Edge Controller returned a malformed ${slot} image reference; keeping stored runtime version`
      );
      return false;
    }
    if (imageRepository(candidate) !== allowedRepository) {
      // Either a misconfigured pg_edge value or config drift between aiware-core and the
      // controller. ERROR because the feature has silently stopped healing until it is resolved.
      serviceContext.logger.error(
        `Edge Controller ${slot} image repository '${imageRepository(
          candidate
        )}' does not match the configured '${allowedRepository}'; keeping stored runtime version`
      );
      return false;
    }
    return true;
  }

  /**
   * Fetch the currently configured Node-RED images from the Edge Controller.
   *
   * Deliberately NOT reused from getControllerNodeRedImageVersion(): that function masks a failed
   * lookup by returning the local config defaults, which is correct when seeding a brand-new flow
   * but wrong here — substituting a default over a stored value would silently rewrite a flow's
   * pinned image on a lookup failure. This returns null instead so callers can keep what is
   * stored. Jira: VE-25953
   *
   * @param {string} controllerUrl - Resolved automate controller URL.
   * @returns {Promise<{studio: string, runner: string} | null>} Validated images, or null when the
   *   Edge Controller did not return a usable, trustworthy version.
   */
  async function fetchCurrentNodeRedImageVersions(controllerUrl) {
    // Same host derivation as getControllerNodeRedImageVersion — the image endpoint lives on the
    // controller host without the `automate-` prefix.
    const edgeUrl = controllerUrl.replace('automate-', '');
    const dataNodeRedVersion = await getNodeRedVersionEdgeApi(edgeUrl, {
      timeoutMs: IMAGE_VERSION_LOOKUP_TIMEOUT_MS
    });

    const allowed = getAllowedImageRepositories();
    const rawStudio = _.get(dataNodeRedVersion, 'version.studio');
    const rawRunner = _.get(dataNodeRedVersion, 'version.runner');

    const studio =
      rawStudio !== undefined &&
      isValidControllerImage(rawStudio, allowed.studio, 'studio')
        ? rawStudio
        : undefined;
    const runner =
      rawRunner !== undefined &&
      isValidControllerImage(rawRunner, allowed.runner, 'runner')
        ? rawRunner
        : undefined;

    if (!studio && !runner) {
      return null;
    }
    return { studio, runner };
  }

  /**
   * TTL-cached, single-flight wrapper around fetchCurrentNodeRedImageVersions().
   *
   * Never throws: the flow-revision read path must not fail because an image lookup failed.
   * Jira: VE-25953
   *
   * @param {string} [clusterId] - Optional cluster whose controller should be used.
   * @returns {Promise<{studio: string, runner: string} | null>} Configured images, or null when
   *   unavailable (caller keeps the stored values).
   */
  async function getCurrentNodeRedImageVersions(clusterId = null) {
    let controllerUrl;
    try {
      const staticConfig = dalStaticAppConfig(
        serviceContext
      ).getStaticAppConfig();
      controllerUrl = await getControllerNodeRedUrl(staticConfig, clusterId);
    } catch (error) {
      serviceContext.logger.warn(
        `Unable to resolve Node-RED controller URL, keeping stored runtime versions: ${error.message}`
      );
      return null;
    }

    const cached = nodeRedImageVersionCache.get(controllerUrl);
    if (cached) {
      if (cached.promise) {
        return cached.promise;
      }
      if (cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }

    const promise = fetchCurrentNodeRedImageVersions(controllerUrl)
      .catch((error) => {
        // fetchCurrentNodeRedImageVersions already logs transport failures; this covers anything
        // unexpected above it so a lookup can never reject into the read path.
        serviceContext.logger.warn(
          `Node-RED image lookup errored for ${redactUrl(
            controllerUrl
          )}, keeping stored runtime versions: ${_.get(
            error,
            'message',
            String(error)
          )}`
        );
        return null;
      })
      .then((value) => {
        nodeRedImageVersionCache.set(controllerUrl, {
          value,
          expiresAt:
            Date.now() +
            (value
              ? IMAGE_VERSION_CACHE_TTL_MS
              : IMAGE_VERSION_CACHE_ERROR_TTL_MS)
        });
        return value;
      });

    nodeRedImageVersionCache.set(controllerUrl, { promise });
    return promise;
  }

  /**
   * @param {string} image - A docker image reference from runtime.version.
   * @returns {boolean} True when the image belongs to a non-Node-RED runtime (e.g. notebooks) and
   *   must be left alone. See NON_NODE_RED_IMAGE_MARKERS.
   */
  function isNonNodeRedImage(image) {
    return (
      _.isString(image) &&
      NON_NODE_RED_IMAGE_MARKERS.some((marker) => image.includes(marker))
    );
  }

  /**
   * Replace the historical Node-RED image tags in a flow revision's runtime with the currently
   * configured ones, so Studio displays — and on save re-persists — the image it will actually
   * run. Jira: VE-25953
   *
   * Returns the input unchanged (never throws, never mutates in place) when there is nothing to
   * heal, when the runtime belongs to a non-Node-RED flow, or when the lookup is unavailable.
   * Callers on write paths depend on the stored object identity, hence the copy-on-change.
   *
   * @param {object} runtime - The flow revision runtime read from job_new.flow_revisions.
   * @param {string} [clusterId] - Optional cluster whose controller should be consulted.
   * @returns {Promise<object>} The runtime, with runtime.version substituted where applicable.
   */
  async function applyCurrentImageVersions(runtime, clusterId = null) {
    if (!_.isObject(runtime)) {
      return runtime;
    }

    const storedStudio = _.get(runtime, 'version.studio');
    const storedRunner = _.get(runtime, 'version.runner');
    if (!storedStudio && !storedRunner) {
      // No stored version to heal; validateFlowRevisionRuntime seeds it on the next write.
      return runtime;
    }

    if (isNonNodeRedImage(storedStudio) || isNonNodeRedImage(storedRunner)) {
      return runtime;
    }

    const current = await getCurrentNodeRedImageVersions(clusterId);
    if (!current) {
      return runtime;
    }

    return {
      ...runtime,
      version: {
        ...runtime.version,
        studio: current.studio || storedStudio,
        runner: current.runner || storedRunner
      }
    };
  }

  /**
   * Apply applyCurrentImageVersions() to a mapped flow revision. Jira: VE-25953
   *
   * @param {object} flowRevision - A mapped flow revision record.
   * @returns {Promise<object>} The record, with its runtime substituted where applicable.
   */
  async function applyCurrentImageVersionsToRecord(flowRevision) {
    if (!_.isObject(flowRevision) || !flowRevision.runtime) {
      return flowRevision;
    }
    const runtime = await applyCurrentImageVersions(flowRevision.runtime);
    if (runtime === flowRevision.runtime) {
      return flowRevision;
    }
    return { ...flowRevision, runtime };
  }

  /**
   * List-path counterpart of applyCurrentImageVersionsToRecord(). The underlying lookup is cached
   * and single-flight, so a page of N records costs at most one Edge Controller call.
   * Jira: VE-25953
   *
   * @param {Array<object>} records - Mapped flow revision records.
   * @returns {Promise<Array<object>>} The records, with runtimes substituted where applicable.
   */
  async function applyCurrentImageVersionsToRecords(records) {
    if (!_.isArray(records) || !records.length) {
      return records;
    }
    return Promise.all(records.map(applyCurrentImageVersionsToRecord));
  }

  async function _getUseEngineGrantFlag(context) {
    const requesterOrg = _.get(context, '_authInfo.organization');
    const useEngineGrant = await mainUtil.isEnableFeatureInOrganization(
      context,
      requesterOrg,
      _.get(requesterOrg, 'organizationId'),
      ['enablePackageGrantLogic', 'useEngineGrant']
    );
    return useEngineGrant;
  }

  const flowRevisionFields = {
    flow_revision_id: 'flow_revision_id',
    flow_revision_numb: 'flow_revision_numb',
    engine_id: 'engine_id',
    hash: 'hash',
    runtime: 'runtime',
    is_head: 'is_head',
    is_deployed: 'is_deployed',
    build_id: 'build_id',
    created_date_time: 'created_date_time',
    updated_date_time: 'updated_date_time',
    description: 'description',
    organization_id: 'organization_id',
    updated_by: 'updated_by',
    user_id: 'user_id'
  };

  return {
    getFlowRevisions,
    getFlowRevision,
    getFlowRevisionsByIds,
    createAutomatePackage: createAutomatePackage,
    createFlowRevision: createFlowRevision,
    updateFlowRevision: updateFlowRevision,
    updateFlowRevisionHead: updateFlowRevisionHead,
    deployFlowRevision: deployFlowRevision,
    getRevisionsDb: getRevisionsDb,
    getRevisionDb: getRevisionDb,
    getControllerNodeRedImage: getControllerNodeRedImage,
    getControllerNodeRedImageVersion: getControllerNodeRedImageVersion,
    getLatestAutomatePackageFromEngineId: getLatestAutomatePackageFromEngineId,
    validateFlowRevisionRuntime: validateFlowRevisionRuntime,
    getControllerNodeRedUrl: getControllerNodeRedUrl,
    applyCurrentImageVersions: applyCurrentImageVersions,
    // Test seam: the image-version cache is module-scoped and shared across DAL instances, so
    // tests must be able to drop it between cases. Jira: VE-25953
    _resetNodeRedImageVersionCache: () => nodeRedImageVersionCache.clear()
  };
};
