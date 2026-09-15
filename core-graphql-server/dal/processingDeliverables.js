const {
  eventsMap,
  supportedEvents
} = require('@veritone/core-server-base/events-map');
const _ = require('lodash');
const mapper = require('./mapper.js');
const { v4: uuidv4 } = require('uuid');

module.exports = function createFunction(serviceContext, _config) {
  const mainUtil = require('../util.js')(serviceContext);
  const dalUtil = require('./util.js')(_config, serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const errors = require('../error')(_config);
  const dbRead = serviceContext.dbConnections['core'].read;
  const dbWrite = serviceContext.dbConnections['core'].write;

  const processingDeliverablesReturning = {
    processing_deliverable_id: null,
    processing_project_id: null,
    recording_id: null,
    asset_type: null,
    engine_id: null,
    schema_id: null,
    engine_category_id: null,
    status: null,
    status_message: null
  };

  function _getOrganizationId(context) {
    const organizationId = resUtil.getOrgFromAuthContext(context);
    if (!organizationId) {
      throw new errors.InvalidInput({
        message: 'Missing organization id',
        data: {
          objectType: 'Organization'
        }
      });
    }
    return organizationId;
  }

  async function getProject(context, options) {
    if (!options.id) {
      throw new errors.InvalidInput({
        message: 'id is required',
        data: {
          objectType: 'ProcessingProject'
        }
      });
    }

    const organizationId = _getOrganizationId(context);
    const { sql, args } = _getProjectsQuery(organizationId, {
      ...options,
      filter: {
        ids: [options.id]
      },
      limit: 1
    });

    const rows = await dbRead.map(sql, args, mapper.mapProcessingProject);

    if (!rows || rows.length === 0) {
      throw new errors.NotFound({
        message: `Processing project not found`,
        data: {
          objectId: options.id,
          objectType: 'ProcessingProject'
        }
      });
    }

    return rows[0];
  }

  async function getProjects(context, options) {
    const organizationId = _getOrganizationId(context);
    const { sql, args } = _getProjectsQuery(organizationId, options);
    const rows = await dbRead.map(sql, args, mapper.mapProcessingProject);

    return mainUtil.toPage(options, rows);
  }

  function _getProjectsQuery(organizationId, options) {
    const args = [];
    const where = [];
    const filter = options.filter ?? {};

    // Always filter by organization_id
    args.push(organizationId);
    where.push(`pp.organization_id = $${args.length}`);

    // Filter by IDs
    if (filter.ids && Array.isArray(filter.ids) && filter.ids.length > 0) {
      args.push(filter.ids);
      where.push(`pp.processing_project_id = ANY($${args.length}::uuid[])`);
    }

    // Filter by application ID
    if (filter.applicationId) {
      args.push(filter.applicationId);
      where.push(`pp.application_id = $${args.length}`);
    }

    // Filter by name
    if (filter.name) {
      const nameMatch = filter.nameMatch ?? 'exact';
      mainUtil.makeLikeClause(
        'pp.name',
        filter.name,
        where,
        args,
        nameMatch,
        false
      );
    }

    // Pagination validation
    const { limit, offset } = dalUtil.validatePagination(options);
    const { pagingSql } = dalUtil.mapPaginationSql(limit, offset, args);

    let sql = `
            SELECT 
                pp.processing_project_id,
                pp.organization_id,
                pp.application_id,
                pp.name,
                pp.created_at,
                pp.updated_at
            FROM recording.processing_project pp
            WHERE ${where.join(' AND ')}
            ORDER BY pp.name ASC
            ${pagingSql}
        `;

    return { sql, args };
  }

  async function getDeliverable(context, options) {
    if (!options.id) {
      throw new errors.InvalidInput({
        message: 'id is required',
        data: {
          objectType: 'ProcessingDeliverable'
        }
      });
    }

    if (!options.processingProjectId) {
      throw new errors.InvalidInput({
        message: 'processingProjectId is required',
        data: {
          objectType: 'ProcessingDeliverable'
        }
      });
    }

    const organizationId = _getOrganizationId(context);
    const { sql, args } = _getDeliverablesQuery(organizationId, {
      ...options,
      filter: {
        ids: [options.id]
      },
      limit: 1
    });

    const rows = await dbRead.map(sql, args, mapper.mapProcessingDeliverable);

    if (!rows || rows.length === 0) {
      throw new errors.NotFound({
        message: `Processing deliverable not found`,
        data: {
          objectId: options.id,
          objectType: 'ProcessingDeliverable'
        }
      });
    }

    return rows[0];
  }

  async function getDeliverables(context, options) {
    const organizationId = _getOrganizationId(context);
    const { sql, args } = _getDeliverablesQuery(organizationId, options);
    const rows = await dbRead.map(sql, args, mapper.mapProcessingDeliverable);
    return mainUtil.toPage(options, rows);
  }

  function _getDeliverablesQuery(organizationId, options) {
    const args = [];
    const where = [];
    const filter = options.filter ?? {};

    if (!options.processingProjectId) {
      throw new errors.InvalidInput({
        message: 'processingProjectId is required',
        data: {
          objectType: 'ProcessingDeliverable'
        }
      });
    }

    args.push(options.processingProjectId);
    where.push(`pt.processing_project_id = $${args.length}`);

    // Filter by IDs
    if (filter.ids && Array.isArray(filter.ids) && filter.ids.length > 0) {
      args.push(filter.ids);
      where.push(`pt.processing_deliverable_id = ANY($${args.length}::uuid[])`);
    }

    // Filter by TDO IDs
    if (
      filter.tdoIds &&
      Array.isArray(filter.tdoIds) &&
      filter.tdoIds.length > 0
    ) {
      args.push(filter.tdoIds);
      where.push(`pt.recording_id = ANY($${args.length}::bigint[])`);
    }

    // Filter by status
    if (filter.status) {
      args.push(filter.status);
      where.push(`pt.status = $${args.length}`);
    }

    // Pagination validation
    const { limit, offset } = dalUtil.validatePagination(options);
    const { pagingSql } = dalUtil.mapPaginationSql(limit, offset, args);

    let sql = `
            SELECT 
                pt.processing_deliverable_id,
                pt.processing_project_id,
                pt.recording_id,
                pt.asset_type,
                pt.engine_id,
                pt.schema_id,
                pt.engine_category_id,
                pt.status,
                pt.status_message,
                pt.created_at,
                pt.updated_at
            FROM recording.processing_deliverable__tdo pt
            WHERE ${where.join(' AND ')}
            ORDER BY pt.created_at DESC
            ${pagingSql}
        `;

    return { sql, args };
  }

  async function getProjectSummary(context, processingProjectId) {
    const { sql, args } = _getProjectSummaryQuery(processingProjectId);
    const rows = await dbRead.map(
      sql,
      args,
      mapper.mapProcessingProjectSummary
    );

    if (!rows || rows.length === 0) {
      return {
        total: 0,
        totalIncomplete: 0,
        totalComplete: 0,
        totalCanceled: 0
      };
    }

    return rows[0];
  }

  function _getProjectSummaryQuery(processingProjectId) {
    const args = [processingProjectId];

    let sql = `
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'incomplete') AS total_incomplete,
        COUNT(*) FILTER (WHERE status = 'complete') AS total_complete,
        COUNT(*) FILTER (WHERE status = 'canceled') AS total_canceled
      FROM recording.processing_deliverable__tdo
      WHERE processing_project_id = $1;
    `;

    return { sql, args };
  }

  async function createProject(context, args) {
    const organizationId = _getOrganizationId(context);
    const userId = _.get(context, '_authInfo.userId');
    const input = args.input;

    if (!input?.name?.trim()) {
      throw new errors.InvalidInput({
        message: 'Name is required',
        data: {
          objectType: 'ProcessingProject'
        }
      });
    }

    const projectId = uuidv4();
    const columnData = {
      processing_project_id: projectId,
      organization_id: organizationId,
      name: input.name.trim(),
      application_id: input.applicationId,
      created_by: userId,
      updated_by: userId
    };
    const returning = {
      processing_project_id: null,
      organization_id: null,
      application_id: null,
      name: null,
      created_at: null,
      updated_at: null
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'recording.processing_project',
      columnData,
      returning
    );

    try {
      const rows = await dbWrite.map(sql, values, mapper.mapProcessingProject);
      return rows[0];
    } catch (err) {
      // Check for unique constraint violation
      if (err.code === '23505' || err.message.includes('unique')) {
        throw new errors.InvalidInput({
          message: `A processing project with name "${input.name}" already exists for this organization`,
          data: {
            objectType: 'ProcessingProject',
            field: 'name'
          }
        });
      }
      throw err;
    }
  }

  async function deleteProject(context, args) {
    const organizationId = _getOrganizationId(context);

    // First verify the project exists and belongs to the organization
    const project = await getProject(context, { id: args.id });
    if (!project) {
      throw new errors.NotFound({
        message: `Processing project not found`,
        data: {
          objectId: args.id,
          objectType: 'ProcessingProject'
        }
      });
    }

    // Check deliverable count before deletion
    const countSql = `
      SELECT COUNT(*) as deliverable_count
      FROM recording.processing_deliverable__tdo
      WHERE processing_project_id = $1
    `;
    const countResult = await dbRead.map(countSql, [args.id], (row) =>
      Number.parseInt(row.deliverable_count, 10)
    );

    const deliverableCount = countResult[0] ?? 0;
    if (deliverableCount > 1000) {
      throw new errors.InvalidInput({
        message: `Cannot delete processing project: it contains ${deliverableCount} deliverables. Please remove deliverables first (maximum 1000 allowed for deletion).`,
        data: {
          objectId: args.id,
          objectType: 'ProcessingProject',
          deliverableCount: deliverableCount
        }
      });
    }

    const sql = `
      DELETE FROM recording.processing_project
      WHERE processing_project_id = $1
        AND organization_id = $2
      RETURNING processing_project_id
    `;

    const result = await dbWrite.map(
      sql,
      [args.id, organizationId],
      (row) => row
    );

    if (!result || result.length === 0) {
      throw new errors.NotFound({
        message: `Processing project not found`,
        data: {
          objectId: args.id,
          objectType: 'ProcessingProject'
        }
      });
    }

    return {
      id: args.id,
      message: `Processing project ${args.id} deleted.`
    };
  }

  function _requireDeliverableInput(input) {
    if (!input.projectId) {
      throw new errors.InvalidInput({
        message: 'projectId is required',
        data: {
          objectType: 'ProcessingDeliverable'
        }
      });
    }

    if (!input.tdoId) {
      throw new errors.InvalidInput({
        message: 'tdoId is required',
        data: {
          objectType: 'ProcessingDeliverable'
        }
      });
    }

    if (!input.requirements || !Array.isArray(input.requirements)) {
      throw new errors.InvalidInput({
        message: 'requirements array is required',
        data: {
          objectType: 'ProcessingDeliverable'
        }
      });
    }
  }

  async function _assertProjectExists(context, projectId) {
    const project = await getProject(context, { id: projectId });
    if (!project) {
      throw new errors.NotFound({
        message: 'Processing project not found',
        data: {
          objectId: projectId,
          objectType: 'ProcessingProject'
        }
      });
    }
  }

  async function _assertTdoExists(context, tdoId) {
    try {
      await serviceContext.dal.tdo.getTDO(context, { id: tdoId });
    } catch (err) {
      if (err.name === 'not_found') {
        throw new errors.NotFound({
          message: 'Temporal data object not found',
          data: {
            objectId: tdoId,
            objectType: 'TemporalDataObject'
          }
        });
      }
      throw err;
    }
  }

  function _extractRequirements(requirements) {
    let assetType = null;
    let engineId = null;
    let schemaId = null;
    let engineCategoryId = null;

    for (const req of requirements) {
      switch (req.deliverableType) {
        case 'AssetType':
          assetType = req.value;
          break;
        case 'Engine':
          engineId = req.value;
          break;
        case 'Schema':
          schemaId = req.value;
          break;
        case 'EngineCategory':
          engineCategoryId = req.value;
          break;
        default:
          // Should never reach this because GQL schema validates the deliverableType
          throw new errors.InvalidInput({
            message: `Unknown deliverable type: ${req.deliverableType}`,
            data: {
              objectType: 'ProcessingDeliverable',
              field: 'deliverableType',
              value: req.deliverableType
            }
          });
      }
    }

    return {
      assetType,
      engineId,
      schemaId,
      engineCategoryId
    };
  }

  async function _assertEngineExists(context, organizationId, engineId) {
    if (!engineId) {
      return;
    }

    try {
      await serviceContext.dal.engine.getEngine(context, {
        id: engineId,
        organizationId
      });
    } catch (err) {
      if (err.name === 'not_found') {
        throw new errors.NotFound({
          message: 'Engine not found',
          data: {
            objectId: engineId,
            objectType: 'Engine'
          }
        });
      }
      throw err;
    }
  }

  async function _assertSchemaExists(context, organizationId, schemaId) {
    if (!schemaId) {
      return;
    }

    try {
      await serviceContext.dal.structuredData.getSchema(context, {
        id: schemaId,
        organizationId
      });
    } catch (err) {
      if (err.name === 'not_found') {
        throw new errors.NotFound({
          message: 'Schema not found',
          data: {
            objectId: schemaId,
            objectType: 'Schema'
          }
        });
      }
      throw err;
    }
  }

  async function _assertEngineCategoryExists(
    context,
    organizationId,
    engineCategoryId
  ) {
    if (!engineCategoryId) {
      return;
    }

    try {
      await serviceContext.dal.engineCategory.getEngineCategory(context, {
        id: engineCategoryId,
        organizationId
      });
    } catch (err) {
      if (err.name === 'not_found') {
        throw new errors.NotFound({
          message: 'Engine category not found',
          data: {
            objectId: engineCategoryId,
            objectType: 'EngineCategory'
          }
        });
      }
      throw err;
    }
  }

  async function _insertDeliverable({
    projectId,
    tdoId,
    assetType,
    engineId,
    schemaId,
    engineCategoryId
  }) {
    const deliverableId = uuidv4();
    const columnData = {
      processing_deliverable_id: deliverableId,
      processing_project_id: projectId,
      recording_id: tdoId,
      asset_type: assetType,
      engine_id: engineId,
      schema_id: schemaId,
      engine_category_id: engineCategoryId
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'recording.processing_deliverable__tdo',
      columnData,
      processingDeliverablesReturning
    );

    const rows = await dbWrite.map(
      sql,
      values,
      mapper.mapProcessingDeliverable
    );
    return rows[0];
  }

  async function createDeliverable(context, args) {
    const organizationId = _getOrganizationId(context);
    const input = args.input;

    _requireDeliverableInput(input);
    await _assertProjectExists(context, input.projectId);
    await _assertTdoExists(context, input.tdoId);

    const {
      assetType,
      engineId,
      schemaId,
      engineCategoryId
    } = _extractRequirements(input.requirements);

    await _assertEngineExists(context, organizationId, engineId);
    await _assertSchemaExists(context, organizationId, schemaId);
    await _assertEngineCategoryExists(
      context,
      organizationId,
      engineCategoryId
    );

    return _insertDeliverable({
      projectId: input.projectId,
      tdoId: input.tdoId,
      assetType,
      engineId,
      schemaId,
      engineCategoryId
    });
  }

  async function cancelDeliverable(context, args) {
    if (!args.id) {
      throw new errors.InvalidInput({
        message: 'id is required',
        data: {
          objectType: 'ProcessingDeliverable'
        }
      });
    }

    if (!args.projectId) {
      throw new errors.InvalidInput({
        message: 'projectId is required',
        data: {
          objectType: 'ProcessingDeliverable'
        }
      });
    }

    // First verify the deliverable exists by querying it with both id and projectId
    // (required for partitioned table)
    const verifySql = `
      SELECT 
        processing_deliverable_id,
        processing_project_id,
        recording_id,
        status
      FROM recording.processing_deliverable__tdo
      WHERE processing_deliverable_id = $1
        AND processing_project_id = $2
    `;
    const verifyArgs = [args.id, args.projectId];

    const row = (
      await dbRead.map(verifySql, verifyArgs, mapper.mapProcessingDeliverable)
    )?.[0];

    if (!row) {
      throw new errors.NotFound({
        message: 'Processing deliverable not found',
        data: {
          objectId: args.id,
          objectType: 'ProcessingDeliverable'
        }
      });
    }

    if (row.status !== 'incomplete') {
      throw new errors.InvalidInput({
        message: `Cancel processing deliverable is available for incomplete only. Current status: ${row.status}`,
        data: {
          objectId: args.id,
          objectType: 'ProcessingDeliverable',
          status: row.status
        }
      });
    }

    // Update status to canceled
    const columnData = {
      status: 'canceled'
    };
    if (args.message !== undefined && args.message !== null) {
      columnData.status_message = args.message;
    }

    const { sql, values } = mainUtil.makeUpdateSql(
      'recording.processing_deliverable__tdo',
      columnData,
      processingDeliverablesReturning,
      'processing_deliverable_id = $1 AND processing_project_id = $2',
      2
    );
    values.unshift(args.id, args.projectId);

    const rows = await dbWrite.map(
      sql,
      values,
      mapper.mapProcessingDeliverable
    );

    if (!rows || rows.length === 0) {
      throw new errors.NotFound({
        message: 'Processing deliverable not found',
        data: {
          objectId: args.id,
          objectType: 'ProcessingDeliverable'
        }
      });
    }

    const updatedDeliverable = rows[0];
    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap.ProcessingDeliverableUpdated.event,
      type: eventsMap.ProcessingDeliverableUpdated.type,
      recordingId: updatedDeliverable.recording_id,
      projectId: updatedDeliverable.processing_project_id,
      deliverableId: updatedDeliverable.processing_deliverable_id,
      status: updatedDeliverable.status
    };

    try {
      await serviceContext.messageUtil.emitPublicEvent(
        supportedEvents.ProcessingDeliverableUpdated,
        'system',
        context,
        event
      );
    } catch (err) {
      serviceContext.logger.error(
        'Failed to emit ProcessingDeliverableUpdated event',
        err
      );
    }

    return updatedDeliverable;
  }

  return {
    getProject,
    getProjects,
    getDeliverable,
    getDeliverables,
    getProjectSummary,
    createProject,
    deleteProject,
    createDeliverable,
    cancelDeliverable
  };
};
