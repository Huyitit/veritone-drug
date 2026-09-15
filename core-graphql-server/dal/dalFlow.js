const _ = require('lodash');
const mapper = require('./mapper.js');
const crypto = require('crypto');
const defaultCategory = 'c5458876-43d2-41e8-a340-f734702df04a';
const defaultDeploymentModel = 'NonNetworkIsolated';
const defaultFlowTemplateId = '40b2b9b4-28bf-4e5e-b3e9-3c45dc40bb22';

module.exports = function createFunction(serviceContext, _dalEngine) {
  const dalEngine = _dalEngine || serviceContext.dal.engine;

  const config = serviceContext.config;
  const mainUtil = require('../util.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const core = serviceContext.dbConnections['core'];
  const dalFlowRevision = require('./dalFlowRevision.js')(
    serviceContext,
    dalEngine
  );
  const dalPackage = require('./package.js')(serviceContext, config);

  async function createFlow(context, args) {
    const perm = 'developer.engine.create';
    mainUtil.requirePerm(perm, context);

    // Create Engine
    args.input.name = args.input.name || 'Untitled Flow';
    args.input.description = args.description || '';
    args.input.categoryId = defaultCategory;
    args.input.deploymentModel = defaultDeploymentModel;

    let runtimeType = 'nodeRed';
    if (args.input.isNotebook) runtimeType = 'notebook';
    args.input.manifest = {
      runtime: runtimeType,
      engineMode: 'chunk',
      supportedInputTypes: ['application/json']
    };
    args.input.jwtRights = automateJWTRights;
    args.input.distributionType = 'private';

    let flows = [];
    let flowPackage = {};
    let templateDependencyResources = [];

    const usingDefaultFlowTemplate = !args.input.templateId;
    if (usingDefaultFlowTemplate) {
      args.input.templateId = defaultFlowTemplateId;
    }

    if (args.input.templateId) {
      let templateDataResponse;
      let templateData;
      try {
        templateDataResponse = await serviceContext.dal.flowTemplate.getFlowTemplates(
          context,
          {
            id: args.input.templateId
          }
        );

        // get template dependency resources
        const { records: templatePackages } = await dalPackage.getPackages(
          context,
          {
            primaryResourceId: args.input.templateId,
            packageFilter: { isLatest: true }
          }
        );
        if (templatePackages && templatePackages.length > 0) {
          const templatePackageId = templatePackages[0].packageId;
          const {
            records: templatePackageResources
          } = await dalPackage.getPackageResources(context, {
            packageId: templatePackageId
          });
          if (templatePackageResources && templatePackageResources.length > 0) {
            templateDependencyResources = templatePackageResources.filter(
              (resource) =>
                resource.resourceType !==
                dalPackage.resourceTypeEnum.automateTemplate
            );
          }
        }
      } catch (flowErr) {
        if (!usingDefaultFlowTemplate) {
          //This fallback is used if a template is not found using the given ID. It tries to find an engine with the given ID to copy the name.
          //If the get engine call fails the call will fail for invalid templateId
          try {
            templateData = await dalEngine.getEngine(context, {
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

      const templateName = _.get(templateData, `title`, args.input.name);
      if (!usingDefaultFlowTemplate) {
        if (templateName !== args.input.name) {
          args.input.name = `${args.input.name} - ${templateName}`;
        }
        args.input.description = _.get(templateData, `subtitle`, '');
      }
    }
    await dalEngine.validateFlowName(context, args, args.input.name);

    try {
      const org = await serviceContext.dal.organization.getOrganization(
        context,
        {
          id: args.organizationId
        }
      );
      args.input.organizationName = _.get(
        org,
        'organizationName',
        'Veritone, Inc'
      );
    } catch (e) {
      args.input.organizationName = 'Veritone, Inc';
    }

    let engine = await dalEngine.createEngine(args, context);
    let version = {
      studio: 'registry.central.aiware.com/node-red-v3:stable',
      runner: 'registry.central.aiware.com/node-red-runner-v3:stable'
    };
    if (args.input.isNotebook) {
      version = {
        studio: 'registry.central.aiware.com/automate-notebook:prod',
        runner: 'registry.central.aiware.com/automate-notebook:prod'
      };
      //TODO: need to put this value in to the actual config like the node-red image lookup
    } else {
      const nodeRedRunnerDockerImage = await dalFlowRevision.getControllerNodeRedImageVersion(
        serviceContext,
        args.input.clusterId
      );
      version.studio = _.get(
        nodeRedRunnerDockerImage,
        'studio',
        version.studio
      );
      version.runner = _.get(
        nodeRedRunnerDockerImage,
        'runner',
        version.runner
      );
    }

    // Create Build + revision
    args.input.engineId = engine.id;
    args.input.runtime = args.input.runtime || {
      flows: flows,
      package: flowPackage,
      applicationId: args.input ? args.input.linkedApplicationId : null,
      version: version
    };
    args.input.taskRuntime = args.input.taskRuntime || {
      edge: {},
      nodeRed: args.input.runtime
    };
    args.input.isHead = true;
    let revision = await dalFlowRevision.createFlowRevision(context, args);

    args.input.manifest = engine.engineManifest;
    args.input.dockerImage = version.runner;
    let build = await dalEngine.createEngineBuild(args, context);
    const useAutomaticPackageCreation = await mainUtil.isOrgSettingEnabled(
      context,
      'automaticPackageCreation'
    );

    // create automate flow package
    if (useAutomaticPackageCreation) {
      const inputPackageIds = args.input.packageIds;
      revision.engine_id = revision.engineId;
      revision.flow_revision_id = revision.flowRevisionId;
      await dalFlowRevision.createAutomatePackage(
        context,
        revision,
        engine.name,
        engine.distributionType,
        inputPackageIds,
        templateDependencyResources
      );
    }
    return engine;
  }

  async function copyFlow(args, context) {
    const perm = 'developer.engine.create';
    mainUtil.requirePerm(perm, context);
    if (!args.input.flowRevisionId || args.input.flowRevisionId === 'latest') {
      args.isHead = true;
    } else {
      // use for getFlowRevisions function
      args.id = args.input.flowRevisionId;
    }

    if (args.input.flowRevisionId) {
      // should delete to ensure createFlow function working as well.
      delete args.input.flowRevisionId;
    }

    let revisions = await dalFlowRevision.getFlowRevisions(context, args);
    let revision = _.get(revisions.records, '0');
    if (!revision) {
      return null;
    }

    let engine = await dalEngine.getEngine(context, { id: revision.engineId });
    if (args.input.name) {
      await dalEngine.validateFlowName(context, args, args.input.name);
    } else {
      args.input.name = 'Copy of ' + engine.name;
    }
    args.input.runtime = revision.runtime;
    args.input.description = engine.description;
    let newEngine = createFlow(context, args);
    return newEngine;
  }

  async function setWorkflowAction(action, args, context) {
    args.input.id = args.engineId;
    args.input.action = action;
    await dalEngine.engineWorkflow(args, context);
  }

  async function pauseFlow(context, args) {
    const perm = 'developer.engine.create';
    mainUtil.requirePerm(perm, context);

    const organizationId =
      '' + _.get(context, '_authInfo.organization.organizationId');

    args.engineId = args.input.flowId || args.input.id;

    await setWorkflowAction('disable', args, context);

    args.isDeployed = true;
    let deployed = await dalFlowRevision.getFlowRevisions(context, args);
    let revision = _.get(deployed.records, '0');

    if (!revision) {
      return await dalEngine.getEngine(context, { id: args.engineId });
    }
    //find revison that is deployed
    args.input.engineId = args.engineId;
    args.input.buildId = revision.buildId;
    let build = await dalEngine.newPauseEngineBuild(args, context);

    return await dalEngine.getEngine(context, { id: args.engineId });
  }

  async function unpauseFlow(context, args) {
    const perm = 'developer.engine.create';
    mainUtil.requirePerm(perm, context);

    const organizationId =
      '' + _.get(context, '_authInfo.organization.organizationId');

    args.engineId = args.input.flowId || args.input.id;
    // await setWorkflowAction('ready', args, context);

    args.isDeployed = true;
    let deployed = await dalFlowRevision.getFlowRevisions(context, args);
    let revision = _.get(deployed.records, '0');

    let clause = `owner_organization_id = $2 AND engine_id = $3`;
    let data = {
      engine_state: 'active'
    };

    let { sql } = mainUtil.makeUpdateSql(
      'job_new.engine',
      data,
      { engine_id: 'engineId' },
      clause
    );

    if (!revision || !revision.buildId) {
      await core.write.query(sql, ['active', organizationId, args.engineId]);
      const engine = await dalEngine.getEngine(context, { id: args.engineId });
      // update public engine list
      serviceContext.dal.packages.updatePublicEngineList(engine, context);
      return engine;
    }
    // If we have a revision with a build resubmit and deploy
    args.input.engineId = args.engineId;
    args.input.buildId = revision.buildId;
    await dalEngine.newSubmitEngineBuild(args, context);
    await dalEngine.newDeployEngineBuild(args, context);
    await core.write.query(sql, ['active', organizationId, args.engineId]);
    const engine = await dalEngine.getEngine(context, { id: args.engineId });

    // update public engine list
    serviceContext.dal.packages.updatePublicEngineList(engine, context);

    return engine;
  }

  const automateJWTRights = {
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

  async function _getUseEngineGrantFlag(context) {
    const requesterOrg = _.get(context, '_authInfo.organization');
    const useEngineGrant = await mainUtil.isEnableFeatureInOrganization(
      context,
      requesterOrg,
      _.get(requesterOrg, 'organizationId'),
      ['enablePackageGrantLogic', 'useEngineGrant']
    );
    if (!useEngineGrant) {
      return false;
    }

    return true;
  }

  async function validateReadAccess(context, _flowIds, _useEngineGrant) {
    const flowIds = _.isArray(_flowIds) ? _flowIds : [_flowIds];
    let useEngineGrant = _useEngineGrant || false;
    if (_.isNil(_useEngineGrant)) {
      useEngineGrant = await _getUseEngineGrantFlag(context);
    }
    if (!useEngineGrant) {
      return;
    }

    // validate ownership: check to see if one of flowIds does not belong to the organization
    // Use getAccessiblePackageResources func to check resource ids
    const packageResourceUsage = await serviceContext.dal.packages.getAccessiblePackageResources(
      context,
      {
        organizationId: _.get(context, '_authInfo.organization.organizationId'),
        resourceTypes: ['engine'],
        resourceIds: flowIds
      }
    );

    if (
      _.isEmpty(packageResourceUsage) ||
      packageResourceUsage.length !== flowIds.length
    ) {
      throw new errors.AuthorizationError({
        message: `Flow does not access via accessible package`,
        data: {
          objectId: flowIds,
          objectType: 'Flow ID'
        }
      });
    }

    const invalidFlowIds = flowIds.filter((id) => {
      const flows = packageResourceUsage.filter((o) => o.resourceId === id);
      return flows.length === 0;
    });

    // throw error if one of flowIds does not access via accessible package
    if (invalidFlowIds.length > 0) {
      throw new errors.AuthorizationError({
        message: `Flow does not access via accessible package`,
        data: {
          objectId: invalidFlowIds,
          objectType: 'Flow ID'
        }
      });
    }
  }

  async function validateWriteAccess(context, _flowIds) {
    const flowIds = _.isArray(_flowIds) ? _flowIds : [_flowIds];
    const orgId = _.get(context, '_authInfo.organization.organizationId');
    // Check useEngineGrant flag
    const useEngineGrant = await _getUseEngineGrantFlag(context);
    if (!useEngineGrant) {
      return;
    }

    // validate ownership
    const engines = await dalEngine.getOwnership(context, orgId, flowIds);

    // throw error if one of flowIds does not belong to the organization
    if (engines && engines.count !== flowIds.length) {
      const engineRecords = engines.records || [];
      const invalidFlowIds = flowIds.filter((id) => {
        const flows = engineRecords.filter(
          (o) => o.id === id && o.ownerOrganizationId === orgId
        );
        return flows.length === 0;
      });

      if (invalidFlowIds.length > 0) {
        throw new errors.AuthorizationError({
          message: `Does not have access to do on the flows`,
          data: {
            objectId: invalidFlowIds,
            objectType: 'Flow ID'
          }
        });
      }
    }
  }

  async function getFlows(context, args) {
    const flows = await dalEngine.getEngines(context, args);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const tokenType = resUtil.getTokenType(context);

    if (isSuperAdmin || tokenType === 'internal' || _.isEmpty(flows.records)) {
      return flows;
    }

    // before returning the flows, validate read access for any that are not owned
    // by the calling organization
    const orgId = _.get(context, '_authInfo.organization.organizationId');
    const nonOwnedFlowIds = [];
    _.forEach(flows.records, (flow) => {
      if (flow.ownerOrganizationId !== orgId) {
        nonOwnedFlowIds.push(flow.id);
      }
    });

    if (!_.isEmpty(nonOwnedFlowIds)) {
      await validateReadAccess(context, nonOwnedFlowIds);
    }

    return flows;
  }

  async function getFlow(context, args) {
    const getFlowsResult = await getFlows(context, args);
    return getFlowsResult.records[0];
  }

  return {
    getFlow,
    getFlows,
    pauseFlow: pauseFlow,
    unpauseFlow: unpauseFlow,
    createFlow: createFlow,
    copyFlow: copyFlow,
    validateReadAccess,
    validateWriteAccess
  };
};
