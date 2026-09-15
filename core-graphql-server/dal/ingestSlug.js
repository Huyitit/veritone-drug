const _ = require('lodash');
const errors = require('../error')({});
const validator = require('validator');
const { eventsMap, supportedEvents } = require('@veritone/core-server-base/events-map');
const mapper = require('./mapper.js');
const { promisify } = require('util');

module.exports = function createFunction(serviceContext) {

  const MUTATION_BATCH_LIMIT = _.get(serviceContext.config, 'ingestSlug.mutationBatchLimit', 1000);
  const VALIDATION_TTL_MIN = _.get(serviceContext.config, 'ingestSlug.validationTtlMin', 5);
  const redisClient = serviceContext.redisClient;
  const util = require('../util.js')(serviceContext);

  async function getIngestSlug(args, context) {
    const { fileUri } = args;
    const sourceId = _.get(context, '_authInfo.sourceId') ?? args.sourceId;

    if (!fileUri) {
      throw new errors.InvalidInput({ message: 'fileUri is required.' });
    }

    if (!sourceId) {
      throw new errors.InvalidInput({ message: 'sourceId is required.' });
    }

    const slugs = await getIngestSlugs({ filter: { sourceId, fileUriExact: [fileUri] } }, context);
    const slug = _.get(slugs, 'records[0]');

    if (!slug) {
      throw new errors.NotFound({ message: `Ingest slug not found for sourceId: ${sourceId}, fileUri: ${fileUri}` });
    }

    return slug;
  }

  async function getIngestSlugs(args, context) {
    const { filter, offset = 0, limit = 30 } = args;
    const organizationId = _.get(context._authInfo, 'organization.organizationId');

    if (limit <= 0) {
      throw new errors.InvalidInput({ message: 'limit must be a positive integer.' });
    }

    if (organizationId) {
      // It is possible that this is an orgless service
      // token. But, if it is not, validate the organizationId.
      await validateOrganizationId(organizationId);
    }

    const whereConditions = [];
    const values = [];

    // Test for JWT sourceId, and bind to that over any input sourceIds
    const jwtSourceId = _.get(context, '_authInfo.sourceId');
    if (jwtSourceId) {
      values.push(Number(jwtSourceId));
      whereConditions.push(`s.media_source_id = $${values.length}`);
    }

    if (filter) {
      if (!jwtSourceId) {
        if (_.isArray(filter.sourceId)) {
          if (filter.sourceId.length > 0) {
            // Convert all sourceIds to integers for type safety and performance
            const sourceIdsInt = filter.sourceId.map(Number);
            values.push(sourceIdsInt);
            whereConditions.push(`s.media_source_id = ANY($${values.length})`);
          }
        } else if (!_.isNaN(Number(filter.sourceId))) {
          values.push(Number(filter.sourceId));
          whereConditions.push(`s.media_source_id = $${values.length}`);
        }
      }

      if (filter.status && filter.status.length > 0) {
        values.push(filter.status);
        whereConditions.push(`s.status = ANY($${values.length}::recording.ingest_slug_status_enum[])`);
      }

      if (filter.fileUriExact && filter.fileUriExact.length > 0) {
        values.push(filter.fileUriExact);
        whereConditions.push(`s.file_uri = ANY($${values.length})`);
      }

      if (filter.fileUriPrefix && filter.fileUriPrefix.length > 0) {
        const prefixConditions = filter.fileUriPrefix.map(prefix => {
          values.push(`${prefix}%`);
          return `s.file_uri ILIKE $${values.length}`;
        });
        whereConditions.push(`(${prefixConditions.join(' OR ')})`);
      }

      if (filter.bundleKey && filter.bundleKey.length > 0) {
        values.push(filter.bundleKey);
        whereConditions.push(`s.bundle_key = ANY($${values.length})`);
      }

      if (filter.batchFileUri && filter.batchFileUri.length > 0) {
        values.push(filter.batchFileUri);
        whereConditions.push(`s.batch_file_uri = ANY($${values.length})`);
      }

      if (filter.tdoId && filter.tdoId.length > 0) {
        values.push(filter.tdoId);
        whereConditions.push(`r.recording_id = ANY($${values.length})`);
      }

      if (filter.assetId && filter.assetId.length > 0) {
        values.push(filter.assetId);
        whereConditions.push(`r.asset_id = ANY($${values.length})`);
      }

      if (filter.mimeType && filter.mimeType.length > 0) {
        values.push(filter.mimeType);
        whereConditions.push(`s.content_type = ANY($${values.length})`);
      }

      if (filter.updatedFromTime) {
        const operator = filter.updatedFromTimeExclusive ? '>' : '>=';
        values.push(convertTimestamp(filter.updatedFromTime));
        whereConditions.push(`s.updated_at ${operator} $${values.length}`);
      }

      if (filter.updatedToTime) {
        const operator = filter.updatedToTimeExclusive ? '<' : '<=';
        values.push(convertTimestamp(filter.updatedToTime));
        whereConditions.push(`s.updated_at ${operator} $${values.length}`);
      }
    }

    if (organizationId) {
      // When the organization is present, bind the read query to
      // the organizationId.
      values.push(organizationId);
      whereConditions.push(`s.organization_id = $${values.length}`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const hasRecordingFilters = (filter && (filter.tdoId || filter.assetId));
    const joinClause = hasRecordingFilters ? `LEFT JOIN recording.ingest_slug__recording r ON s.media_source_id = r.media_source_id AND s.file_uri = r.file_uri` : '';

    values.push(limit);
    values.push(offset);

    const sql = `
      SELECT
        s.media_source_id AS "sourceId",
        s.file_uri,
        s.organization_id,
        s.content_type AS "mimeType",
        s.file_size_bytes,
        s.file_created_at,
        s.file_accessed_at,
        s.file_modified_at,
        s.status,
        s.status_message,
        s.bundle_key,
        s.batch_file_uri,
        s.application_id,
        s.engine_id,
        s.created_at,
        s.updated_at,
        s.created_by,
        COUNT(*) OVER() AS "totalCount"
      FROM 
        recording.ingest_slug s
      ${joinClause}
      ${whereClause}
      ORDER BY 
        s.created_at ASC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;

    const platformDbReader = serviceContext.dbConnections['core'].read;
    const results = await platformDbReader.map(sql, values, mapper.camelizeRootKeys);

    // Extract count from first result (all rows have the same count value)
    const totalCount = _.get(results, '[0].totalCount', 0);
    const pagedResults = util.toPage(args, results);
    pagedResults.totalCount = totalCount ? parseInt(totalCount, 10) : 0;

    return pagedResults;
  }

  async function createIngestSlugs(args, context) {

    const { input } = args;

    if (!input) {
      throw new errors.InvalidInput({ message: 'input is required to create ingest slugs.' });
    }

    let { engineId, appId } = input;
    const sourceId = _.get(context, '_authInfo.sourceId') ?? input.sourceId;

    const organizationId = _.get(context._authInfo, 'organization.organizationId');
    const createdBy = getCreatedBy(context);

    if (!input.files || input.files.length === 0) {
      throw new errors.InvalidInput({ message: 'At least one file reference must be provided to create ingest slugs.' });
    }

    if (input.files.length > MUTATION_BATCH_LIMIT) {
      throw new errors.InvalidInput({ message: `The limit for creating ingest slugs is ${MUTATION_BATCH_LIMIT} files per request.` });
    }

    await Promise.all([
      validateSourceId(sourceId, organizationId),
      validateEngineId(engineId),
      validateApplicationId(appId)
    ]);

    // Files that have tdoId will be processed separately for 
    // the ingest_slug__recording insert (with transaction).
    const filesWithTDO = [];

    const allCreated = [];
    const allFailed = [];
    const duplicates = [];

    // Validate all tdoId and assetId values before entering the transaction
    for (const file of input.files) {
      try {
        if (!file.tdoId && file.assetId) {
          throw new errors.InvalidInput({ message: 'The assetId was provided without a corresponding tdoId. The tdoId is required when providing an assetId.' });
        }

        if (file.tdoId) {
          await Promise.all([
            validateTDOId(file.tdoId),
            validateAssetId(file.assetId)
          ]);
          // Add to separate list for processing with transaction
          filesWithTDO.push(file);
        }
      } catch (error) {
        const errorMessage = error.message || error.toString() || 'Unknown validation error';
        allFailed.push({
          fileUri: file.fileUri,
          errorMessage: errorMessage,
          errorCode: 'validation_failed'
        });
        serviceContext.logger.warn(`Validation failed for file ${file.fileUri}:`, errorMessage);
      }
    }

    // Filter files to only include those that should be batch processed
    // Exclude files that failed validation or will be processed with TDO transactions
    const failedFileUris = new Set(allFailed.map(f => f.fileUri));
    const tdoFileUris = new Set(filesWithTDO.map(f => f.fileUri));
    const files = input.files.filter(f => !failedFileUris.has(f.fileUri) && !tdoFileUris.has(f.fileUri));

    await createIngestSlugsBatched(
      files,
      allCreated,
      allFailed,
      duplicates,
      sourceId,
      organizationId,
      engineId,
      appId,
      createdBy
    );

    await createIngestSlugsWithTDOs(
      filesWithTDO,
      allCreated,
      allFailed,
      duplicates,
      sourceId,
      organizationId,
      engineId,
      appId,
      createdBy
    );

    // Emit IngestSlugCreated public events for each created slug
    await emitIngestSlugCreatedEvents(allCreated, organizationId, appId, context);

    return {
      sourceId: sourceId,
      created: allCreated,
      failed: allFailed,
      duplicates: duplicates
    };
  }

  // Helper: Build row values for a single file
  function buildIngestSlugRowValues(file, sourceId, organizationId, engineId, appId, createdBy) {
    return [
      sourceId,
      organizationId,
      file.fileUri,
      file.bundleKey,
      file.mimeType,
      file.fileSizeBytes,
      convertTimestamp(file.fileCreatedAt),
      convertTimestamp(file.fileAccessedAt),
      convertTimestamp(file.fileModifiedAt),
      file.batchFileUri,
      _.toLower(file.status) || 'pending',
      file.statusMessage,
      appId,
      engineId,
      createdBy
    ];
  }

  async function emitIngestSlugCreatedEvents(createdSlugs, organizationId, appId, context) {
    const messageUtil = serviceContext.messageUtil;
    if (!messageUtil || !createdSlugs || createdSlugs.length === 0) {
      return;
    }

    await Promise.all(
      createdSlugs.map(created => {
        const event = {
          serviceName: 'core-graphql-server',
          event: eventsMap.IngestSlugCreated.event,
          type: eventsMap.IngestSlugCreated.type,
          organizationId: parseInt(organizationId),
          applicationId: appId || 'system',
          mediaSourceId: parseInt(created.sourceId),
          fileUri: created.fileUri,
          status: created.status,
        };
        // Emit public event for subscriptions
        messageUtil.emitPublicEvent(
          supportedEvents.IngestSlugCreated,
          'system',
          context,
          event
        );
        // Emit to EventsTopic for processing
        return messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
      })
    );
  }

  async function emitIngestSlugUpdatedEvents(updatedSlugs, organizationId, appId, context) {
    const messageUtil = serviceContext.messageUtil;
    if (!messageUtil || !updatedSlugs || updatedSlugs.length === 0) {
      return;
    }

    await Promise.all(
      updatedSlugs.map(updated => {
        const event = {
          serviceName: 'core-graphql-server',
          event: eventsMap.IngestSlugUpdated.event,
          type: eventsMap.IngestSlugUpdated.type,
          organizationId: parseInt(organizationId),
          applicationId: appId || 'system',
          mediaSourceId: parseInt(updated.sourceId),
          fileUri: updated.fileUri,
          status: updated.status,
          previousStatus: updated.previousStatus
        };
        // Emit public event for subscriptions
        messageUtil.emitPublicEvent(
          supportedEvents.IngestSlugUpdated,
          'system',
          context,
          event
        );
        // Emit to EventsTopic for processing
        return messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
      })
    );
  }

  function processIngestSlugResults(results, files, sourceId, organizationId, engineId, appId, allCreated, duplicates, createdBy) {
    const insertedMap = new Map();
    results.forEach(row => {
      insertedMap.set(`${sourceId}:${row.fileUri}`, {
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        status: row.status
      });
    });

    files.forEach(file => {
      const key = `${sourceId}:${file.fileUri}`;
      if (insertedMap.has(key)) {
        const row = insertedMap.get(key);
        allCreated.push({
          sourceId: sourceId,
          applicationId: appId,
          engineId: engineId,
          organizationId: organizationId,
          ...file,
          ...row,
          createdBy: createdBy
        });
      } else {
        duplicates.push({
          sourceId: sourceId,
          fileUri: file.fileUri
        });
      }
    });
  }

  async function createIngestSlugsBatched(
    files,
    allCreated,
    allFailed,
    duplicates,
    sourceId,
    organizationId,
    engineId,
    appId,
    createdBy
  ) {
    const platformDbWriter = serviceContext.dbConnections['core'].write;
    const values = [];
    const params = [];
    let paramIndex = 1;

    files.forEach((file) => {
      const rowValues = buildIngestSlugRowValues(file, sourceId, organizationId, engineId, appId, createdBy);
      values.push(...rowValues);
      const rowParams = [];
      for (let j = 0; j < rowValues.length; j++) {
        rowParams.push(`$${paramIndex++}`);
      }
      params.push(`(${rowParams.join(', ')})`);
    });

    const sql = `
      INSERT INTO recording.ingest_slug (
        media_source_id,
        organization_id,
        file_uri,
        bundle_key,
        content_type,
        file_size_bytes,
        file_created_at,
        file_accessed_at,
        file_modified_at,
        batch_file_uri,
        status,
        status_message,
        application_id,
        engine_id,
        created_by
      ) VALUES ${params.join(', ')}
      ON CONFLICT DO NOTHING
      RETURNING 
        file_uri AS "fileUri",
        status,
        updated_at AS "updatedAt",
        created_at AS "createdAt"
    `;

    try {
      const result = await platformDbWriter.any(sql, values);
      processIngestSlugResults(result, files, sourceId, organizationId, engineId, appId, allCreated, duplicates, createdBy);
    } catch (error) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      files.forEach(file => {
        allFailed.push({
          fileUri: file.fileUri,
          errorMessage: errorMessage,
          errorCode: 'not_created'
        });
      });
      serviceContext.logger.warn('Failed to create ingest slugs in batch:', errorMessage);
    }
  }

  async function createIngestSlugsWithTDOs(
    filesWithTDO,
    allCreated,
    allFailed,
    duplicates,
    sourceId,
    organizationId,
    engineId,
    appId,
    createdBy) {
    const platformDbWriter = serviceContext.dbConnections['core'].write;

    const sql = `
      INSERT INTO recording.ingest_slug (
        media_source_id,
        organization_id,
        file_uri,
        bundle_key,
        content_type,
        file_size_bytes,
        file_created_at,
        file_accessed_at,
        file_modified_at,
        batch_file_uri,
        status,
        status_message,
        application_id,
        engine_id,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (media_source_id, file_uri) DO NOTHING
      RETURNING 
        file_uri,
        status,
        updated_at,
        created_at
    `;

    // Files with TDO will be processed in a transaction 
    // to ensure both ingest_slug and ingest_slug__recording 
    // inserts succeed or fail together.
    for (const file of filesWithTDO) {
      const rowValues = buildIngestSlugRowValues(file, sourceId, organizationId, engineId, appId, createdBy);

      try {
        // Each file gets its own transaction for atomic per-file operations
        await platformDbWriter.tx(`createIngestSlugWithTDO_${file.fileUri}`, async (t) => {
          // Insert into ingest_slug
          const result = await t.map(sql, rowValues, mapper.camelizeRootKeys);

          if (result.length > 0) {
            const row = result[0];
            allCreated.push({
              sourceId: sourceId,
              applicationId: appId,
              engineId: engineId,
              organizationId: organizationId,
              ...file,
              ...row,
              createdBy: createdBy
            });

            // Insert into ingest_slug__recording if tdoId is present
            if (file.tdoId) {
              const recordingValues = [sourceId, file.fileUri, file.tdoId, file.assetId];
              const recordingSql = `
                INSERT INTO recording.ingest_slug__recording (
                  media_source_id,
                  file_uri,
                  recording_id,
                  asset_id
                ) VALUES ($1, $2, $3, $4)
                ON CONFLICT DO NOTHING
              `;
              await t.any(recordingSql, recordingValues);
            }
          } else {
            duplicates.push({
              sourceId: sourceId,
              fileUri: file.fileUri
            });
          }
        });
      } catch (error) {
        const errorMessage = error.message || error.toString() || 'Unknown error';
        allFailed.push({
          fileUri: file.fileUri,
          errorMessage: errorMessage,
          errorCode: 'not_created'
        });
        serviceContext.logger.warn(`Failed to create ingest slug for ${file.fileUri}:`, errorMessage);
      }
    }
  }

  async function updateIngestSlug(args, context) {
    const { fileUri, input } = args;
    const organizationId = _.get(context._authInfo, 'organization.organizationId');
    const sourceId = _.get(context, '_authInfo.sourceId') ?? args.sourceId;

    if (!sourceId) {
      throw new errors.InvalidInput({ message: 'sourceId is required.' });
    }
    if (!input) {
      throw new errors.InvalidInput({ message: 'input is required to update an ingest slug.' });
    }
    if (!fileUri) {
      throw new errors.InvalidInput({ message: 'fileUri is required.' });
    }

    // Only update fields that are explicitly present in input (not undefined or null)
    let updateData = {};
    let filter;
    if ('mimeType' in input && !_.isNil(input.mimeType)) updateData.content_type = input.mimeType;
    if ('fileSizeBytes' in input) updateData.file_size_bytes = input.fileSizeBytes;
    if ('fileCreatedAt' in input) updateData.file_created_at = convertTimestamp(input.fileCreatedAt);
    if ('fileAccessedAt' in input) updateData.file_accessed_at = convertTimestamp(input.fileAccessedAt);
    if ('fileModifiedAt' in input) updateData.file_modified_at = convertTimestamp(input.fileModifiedAt);
    if ('batchFileUri' in input) updateData.batch_file_uri = input.batchFileUri;
    if ('status' in input && !_.isNil(input.status)) updateData.status = _.toLower(input.status);
    if ('statusMessage' in input) updateData.status_message = input.statusMessage;
    if ('bundleKey' in input) updateData.bundle_key = input.bundleKey;
    if ('filter' in input) filter = input.filter;

    const ingestSlugUpdateNeeded = Object.keys(updateData).length > 0;
    // For now, this code will disallow NULLifying tdoId or assetId since that can have unintended consequences on the recording associations.
    const recordingUpdateNeeded = (!_.isNil(input.tdoId)) || (!_.isNil(input.assetId));

    if (!ingestSlugUpdateNeeded && !recordingUpdateNeeded) {
      throw new errors.InvalidInput({ message: 'At least one field must be provided in input to update an ingest slug.' });
    }

    if (recordingUpdateNeeded) {
      await Promise.all([
        validateSourceId(sourceId, organizationId),
        validateTDOId(input.tdoId),
        validateAssetId(input.assetId)
      ]);
    }

    let setClauses = [];
    let values = [sourceId, fileUri, organizationId];

    // Build filter clause for status if provided.
    // Filter may be extened in the future.
    let filterClause = '';
    if (filter && filter.status) {
      const statusFilter = _.toLower(filter.status);
      values.push(statusFilter);
      filterClause = ` AND status = $${values.length}`;
    }

    let ingestSlugUpdateResults;
    const platformDbWriter = serviceContext.dbConnections['core'].write;
    if (ingestSlugUpdateNeeded) {
      Object.entries(updateData).forEach(([key, value]) => {
        values.push(value);
        setClauses.push(`${key} = $${values.length}`);
      });

      // Use CTE to capture old status before update
      const sql = `
        WITH previous_values AS (
          SELECT
            status as previous_status
          FROM 
            recording.ingest_slug
          WHERE 
            media_source_id = $1 AND 
            file_uri = $2 AND 
            organization_id = $3
            ${filterClause}
        )
        UPDATE 
          recording.ingest_slug
        SET
          ${setClauses.join(', ')}
        WHERE 
          media_source_id = $1 AND
          file_uri = $2 AND
          organization_id = $3
          ${filterClause}
        RETURNING
          (SELECT previous_status FROM previous_values) as previous_status
      `;

      try {
        ingestSlugUpdateResults = await platformDbWriter.map(sql, values, mapper.camelizeRootKeys);
      } catch (error) {
        if (error.name === 'resource_conflict') {
          throw new errors.ResourceConflict({ message: `Database conflict while updating the ingest slug: ${error.message}` });
        }
        throw new errors.SqlError({ message: `Database error while updating the ingest slug: ${error.name} - ${error.message}` });
      }
      if (ingestSlugUpdateResults.length === 0) {
        // Some predicate not satisfied, in particular filter may have not been satisfied
        throw new errors.NotFound({ message: `Ingest slug not found for sourceId: ${sourceId}, fileUri: ${fileUri}${filterClause ? ' with the specified status filter' : ''}` });
      }
    }

    // if tdoId or assetId is provided, upsert into ingest_slug__recording table
    if (recordingUpdateNeeded) {
      const insertColumns = ['media_source_id', 'file_uri'];
      const insertValues = [sourceId, fileUri];
      const conflictUpdateClauses = [];

      if (!_.isNil(input.tdoId)) {
        insertColumns.push('recording_id');
        insertValues.push(input.tdoId);
        conflictUpdateClauses.push('recording_id = EXCLUDED.recording_id');
      }

      if (!_.isNil(input.assetId)) {
        insertColumns.push('asset_id');
        insertValues.push(input.assetId);
        conflictUpdateClauses.push('asset_id = EXCLUDED.asset_id');
      }

      const params = insertValues.map((_, i) => `$${i + 1}`);

      const recordingSql = `
        INSERT INTO recording.ingest_slug__recording (
          ${insertColumns.join(', ')}
        ) VALUES (
          ${params.join(', ')}
        )
        ON CONFLICT (media_source_id, file_uri) DO UPDATE SET
          ${conflictUpdateClauses.join(', ')}
      `;

      try {
        await platformDbWriter.any(recordingSql, insertValues);
      } catch (error) {
        if (error.name === 'resource_conflict') {
          throw new errors.ResourceConflict({ message: `Database conflict while updating the ingest slug TDO: ${error.message}` });
        }
        throw new errors.SqlError({ message: `Database error while updating the ingest slug TDO: ${error.name} - ${error.message}` });
      }
    }

    const updatedSlug = await getIngestSlug({ sourceId, fileUri }, context);
    try {
      await emitIngestSlugUpdatedEvents(
        [{
          ...updatedSlug,
          previousStatus: _.get(ingestSlugUpdateResults, '[0].previousStatus')
        }],
        updatedSlug.organizationId,
        updatedSlug.applicationId,
        context
      );
    } catch (err) {
      // Best-effort event emission: log and do not fail the API call on messaging errors
      serviceContext.logger.error(
        'Failed to emit ingest slug updated events for sourceId=%s, fileUri=%s: %s',
        sourceId,
        fileUri,
        err && err.message ? err.message : err
      );
    }
    return updatedSlug;

  }

  async function updateIngestSlugStatus(args, context) {
    const { fileUris, input } = args;
    const organizationId = _.get(context._authInfo, 'organization.organizationId');

    const sourceId = _.get(context, '_authInfo.sourceId') ?? args.sourceId;

    if (!input) {
      throw new errors.InvalidInput({ message: 'input is required to update ingest slug status.' });
    }
    if (!fileUris || fileUris.length === 0) {
      throw new errors.InvalidInput({ message: 'At least one fileUri must be provided to update status.' });
    }
    if (fileUris.length > MUTATION_BATCH_LIMIT) {
      throw new errors.InvalidInput({ message: `The limit for updating the ingest slug status is ${MUTATION_BATCH_LIMIT} files per request.` });
    }
    if (!input.status) {
      throw new errors.InvalidInput({ message: 'status is required in input.' });
    }

    await validateSourceId(sourceId, organizationId);

    let failedRecords = [];
    let filesToUpdate = fileUris;

    // Check for constraint violations only if updating to 'ingesting' status
    const status = _.toLower(input.status);
    if (status === 'ingesting') {
      const violators = await getSlugViolators(sourceId, fileUris, organizationId);
      const violatorUris = violators.map(v => v.fileUri);

      // Add violators to failed records
      violators.forEach(violator => {
        failedRecords.push({
          fileUri: violator.fileUri,
          errorMessage: `Cannot update to ingesting status - another file with bundle_key "${violator.bundleKey}" is already ingesting.`,
          errorCode: 'resource_conflict'
        });
      });

      // Filter out violators from the update list
      filesToUpdate = fileUris.filter(uri => !violatorUris.includes(uri));
    }

    // If all files were filtered out due to violations, return early
    if (filesToUpdate.length === 0) {
      return {
        sourceId: sourceId,
        updated: [],
        failed: failedRecords
      };
    }

    // Build batch update with VALUES clause
    const values = [status, sourceId, organizationId, filesToUpdate];

    let statusMessageSet = '';
    if (input.statusMessage) {
      statusMessageSet = `, status_message = $5`;
      values.push(input.statusMessage);
    }

    const sql = `
      WITH previous_values AS (
        SELECT 
          file_uri,
          status as previous_status
        FROM 
          recording.ingest_slug
        WHERE 
          media_source_id = $2 AND 
          organization_id = $3 AND
          file_uri = ANY($4)
      )
      UPDATE recording.ingest_slug
      SET 
        status = $1
        ${statusMessageSet}
      WHERE 
        media_source_id = $2 AND
        organization_id = $3 AND
        file_uri = ANY($4)
      RETURNING
        media_source_id AS "sourceId",
        file_uri,
        organization_id,
        content_type AS "mimeType",
        file_size_bytes,
        file_created_at,
        file_accessed_at,
        file_modified_at,
        status,
        status_message,
        bundle_key,
        batch_file_uri,
        application_id,
        engine_id,
        created_at,
        updated_at,
        created_by,
        (SELECT previous_status FROM previous_values pv WHERE pv.file_uri = recording.ingest_slug.file_uri) as "previousStatus"
    `;

    let updateResults = [];

    try {
      const platformDbWriter = serviceContext.dbConnections['core'].write;
      updateResults = await platformDbWriter.map(sql, values, mapper.camelizeRootKeys);

      // Determine which fileUris were successfully updated and which failed
      const successfulUris = updateResults.map(r => r.fileUri);
      const failedUris = filesToUpdate.filter(uri => !successfulUris.includes(uri));

      failedUris.forEach(fileUri => {
        failedRecords.push({
          fileUri,
          errorMessage: 'Ingest slug not found. ',
          errorCode: 'not_found'
        });
      });

      if (updateResults.length > 0) {
        // Group results by applicationId so we emit events with the correct application context
        const resultsByApplicationId = _.groupBy(updateResults, 'applicationId');
        await Promise.all(
          Object.values(resultsByApplicationId).map(groupedResults => {
            const applicationId = _.get(groupedResults, '[0].applicationId');
            return emitIngestSlugUpdatedEvents(
              groupedResults,
              organizationId,
              applicationId,
              context
            );
          })
        ).catch(err => {
          serviceContext.logger.error(
            'Failed to emit ingest slug updated (status) events for sourceId=%s: %s',
            sourceId,
            err && err.message ? err.message : err
          );
        });
      }
    } catch (error) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      fileUris.forEach(fileUri => {
        failedRecords.push({
          fileUri,
          errorMessage: errorMessage,
          errorCode: 'not_updated'
        });
      });
    }

    return {
      sourceId: sourceId,
      updated: updateResults,
      failed: failedRecords
    };
  }

  async function deleteIngestSlugsForSource(args, context) {
    const sourceId = _.get(context, '_authInfo.sourceId') ?? args.sourceId;
    const organizationId = _.get(context._authInfo, 'organization.organizationId');
    const messageUtil = serviceContext.messageUtil;

    if (!sourceId) {
      throw new errors.InvalidInput({ message: 'sourceId is required.' });
    }

    await validateSourceId(sourceId, organizationId);

    const event = {
      serviceName: 'core-graphql-server',
      event: 'ingest_slugs_delete_by_source',
      type: 'system',
      sourceId: sourceId,
    };

    messageUtil.emitEvent(event, messageUtil.topics('EVENTS'))
    return {
      message: `Ingest slugs deletion request for sourceId ${sourceId} has been submitted.`,
      submitted: true
    };
  }

  async function deleteIngestSlugs(args, context) {
    const { fileUris } = args;
    const sourceId = _.get(context, '_authInfo.sourceId') ?? args.sourceId;
    const organizationId = _.get(context._authInfo, 'organization.organizationId');
    const platformDbWriter = serviceContext.dbConnections['core'].write;

    if (!sourceId) {
      throw new errors.InvalidInput({ message: 'sourceId is required.' });
    }
    if (!fileUris || fileUris.length === 0) {
      throw new errors.InvalidInput({ message: 'At least one fileUri must be provided to delete ingest slugs.' });
    }

    await validateSourceId(sourceId, organizationId);

    const allDeleted = [];
    const allFailed = [];

    try {
      // Delete specific slugs
      const sql = `
        DELETE FROM 
          recording.ingest_slug
        WHERE 
          media_source_id = $1 AND file_uri = ANY($2) AND organization_id = $3
        RETURNING
          file_uri
      `;
      const values = [sourceId, fileUris, organizationId];
      const result = await platformDbWriter.map(sql, values, mapper.camelizeRootKeys);
      const deleted = result.map(row => { return { sourceId: sourceId, fileUri: row.fileUri }; });
      allDeleted.push(...deleted);
    } catch (error) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      const filesToDelete = fileUris || [];
      const failed = filesToDelete.map(fileUri => ({
        fileUri,
        errorMessage: errorMessage,
        errorCode: 'not_deleted'
      }));
      allFailed.push(...failed);
    }

    return {
      sourceId: sourceId,
      deleted: allDeleted,
      failed: allFailed
    };
  }

  async function validateOrganizationId(organizationId) {
    if (_.isNil(organizationId)) {
      throw new errors.InvalidInput({ message: 'organizationId is required.' });
    }

    let orgId = _.toNumber(organizationId);
    if (isNaN(orgId) || orgId <= 0) {
      throw new errors.InvalidInput({ message: 'The input organizationId is invalid.' });
    }
    const exists = await getExistsInCache(
      'IngestSlug.organizationId',
      String(orgId),
      async () => {
        const sql = 'SELECT organization_id FROM organization WHERE organization_id = $1';
        const mediaDBReader = serviceContext.dbConnections['media_platform'].read;
        const result = await mediaDBReader.oneOrNone(sql, [orgId]);
        return Boolean(result);
      }
    );
    if (!exists) {
      throw new errors.InvalidInput({ message: `The input organizationId '${organizationId}' does not exist.` });
    }
  }

  async function validateSourceId(sourceId, organizationId) {
    if (_.isNil(sourceId)) {
      throw new errors.InvalidInput({ message: 'sourceId is required.' });
    }

    let sid = _.toNumber(sourceId);
    if (isNaN(sid) || sid <= 0) {
      throw new errors.InvalidInput({ message: 'The input sourceId is invalid.' });
    }
    const exists = await getExistsInCache(
      'IngestSlug.sourceId',
      String(sid),
      async () => {
        const sql = `SELECT 
            s.media_source_id 
          FROM 
            media_source s
          INNER JOIN organization o ON s.organization_id = o.organization_id
          WHERE 
            s.media_source_id = $1 AND 
            s.organization_id = $2 AND
            o.status = 'active'`;
        const mediaDBReader = serviceContext.dbConnections['media_platform'].read;
        const result = await mediaDBReader.oneOrNone(sql, [sid, organizationId]);
        return Boolean(result);
      }
    );
    if (!exists) {
      throw new errors.InvalidInput({ message: `The input sourceId '${sourceId}' does not exist or is not in the specified organization.` });
    }
  }

  async function validateEngineId(engineId) {
    // only validate if engineId is provided, otherwise not required
    if (_.isNil(engineId)) {
      return;
    }

    if (_.isEmpty(engineId) || !_.isString(engineId)) {
      throw new errors.InvalidInput({ message: 'The input engineId is invalid.' });
    }

    const exists = await getExistsInCache(
      'IngestSlug.engineId',
      String(engineId),
      async () => {
        const sql = 'SELECT engine_id FROM job_new.engine WHERE engine_id = $1';
        const platformDBReader = serviceContext.dbConnections['core'].read;
        const result = await platformDBReader.oneOrNone(sql, [engineId]);
        return Boolean(result);
      }
    );
    if (!exists) {
      throw new errors.InvalidInput({ message: `The input engineId '${engineId}' does not exist.` });
    }
  }

  async function validateApplicationId(applicationId) {
    // only validate if applicationId is provided, otherwise not required
    if (_.isNil(applicationId)) {
      return;
    }

    if (!validator.isUUID(applicationId)) {
      throw new errors.InvalidInput({ message: 'The input appId must be a valid UUID.' });
    }

    const exists = await getExistsInCache(
      'IngestSlug.applicationId',
      String(applicationId),
      async () => {
        const sql = 'SELECT application_id FROM application WHERE application_id = $1';
        const mediaDBReader = serviceContext.dbConnections['sso'].read;
        const result = await mediaDBReader.oneOrNone(sql, [applicationId]);
        return Boolean(result);
      }
    );
    if (!exists) {
      throw new errors.InvalidInput({ message: `The input appId '${applicationId}' does not exist.` });
    }
  }

  async function validateTDOId(tdoId) {
    // only validate if tdoId is provided, otherwise not required
    if (_.isNil(tdoId)) {
      return;
    }

    if (_.isEmpty(tdoId) || !_.isString(tdoId)) {
      throw new errors.InvalidInput({ message: 'The input tdoId is invalid.' });
    }

    const exists = await getExistsInCache(
      'IngestSlug.tdoId',
      String(tdoId),
      async () => {
        const sql = 'SELECT recording_id FROM recording.recording WHERE recording_id = $1';
        const platformDbReader = serviceContext.dbConnections['core'].read;
        const result = await platformDbReader.oneOrNone(sql, [tdoId]);
        return Boolean(result);
      }
    );
    if (!exists) {
      throw new errors.InvalidInput({ message: `The input tdoId '${tdoId}' does not exist.` });
    }
  }

  async function validateAssetId(assetId) {
    // only validate if assetId is provided, otherwise not required
    if (_.isNil(assetId)) {
      return;
    }

    if (_.isEmpty(assetId) || !_.isString(assetId)) {
      throw new errors.InvalidInput({ message: 'The input assetId is invalid.' });
    }

    const exists = await getExistsInCache(
      'IngestSlug.assetId',
      String(assetId),
      async () => {
        const sql = 'SELECT asset_id FROM recording.recording_asset WHERE asset_id = $1';
        const platformDbReader = serviceContext.dbConnections['core'].read;
        const result = await platformDbReader.oneOrNone(sql, [assetId]);
        return Boolean(result);
      }
    );
    if (!exists) {
      throw new errors.InvalidInput({ message: `The input assetId '${assetId}' does not exist.` });
    }
  }

  function convertTimestamp(ts) {
    if (!ts) return null;
    return new Date(ts).toISOString();
  };

  function getRedisKey(type, key) {
    return `ingestSlug:validation:${type}:${key}`;
  }

  async function getExistsInCache(type, key, getExistsFn, ttlMin = VALIDATION_TTL_MIN) {
    const redisKey = getRedisKey(type, key);

    // Try to get from Redis cache first
    try {
      const cachedValue = await promisify(redisClient.get).bind(redisClient)(redisKey);
      if (!_.isNil(cachedValue)) {
        return cachedValue === 'true';
      }
    } catch (error) {
      serviceContext.logger.warn(`Failed to get from Redis cache for ${type}:${key}`, error);
    }

    // If not in cache, call the function to check
    const exists = await getExistsFn();

    // Store in Redis cache with TTL
    try {
      const ttlSeconds = (ttlMin || VALIDATION_TTL_MIN) * 60;
      await promisify(redisClient.set).bind(redisClient)(
        redisKey,
        String(exists),
        'EX',
        ttlSeconds
      );
    } catch (error) {
      serviceContext.logger.warn(`Failed to set Redis cache for ${type}:${key}`, error);
    }

    return exists === true;
  }

  async function getSource(context, ingestSlug) {
    if (ingestSlug && ingestSlug.sourceId) {
      return serviceContext.dal.source.getSource(context, { id: ingestSlug.sourceId });
    }
    return null;
  }

  async function getTDO(context, ingestSlug) {
    const tdoId = await getTDOId(context, ingestSlug);
    if (tdoId) {
      return serviceContext.dal.tdo.getTDO(context, { id: tdoId });
    }
    return null;
  }

  async function getAsset(context, ingestSlug) {
    const assetId = await getAssetId(context, ingestSlug);
    if (assetId) {
      return serviceContext.dal.asset.getAsset(
        context,
        { id: assetId }
      );
    }
    return null;
  }

  async function getTDOId(context, ingestSlug) {
    if (ingestSlug.sourceId && ingestSlug.fileUri) {
      try {
        const sql = `
          SELECT
            recording_id as "tdoId"
          FROM
            recording.ingest_slug__recording
          WHERE 
            media_source_id = $1 AND file_uri = $2
        `;
        const platformDbReader = serviceContext.dbConnections['core'].read;
        const result = await platformDbReader.oneOrNone(sql, [
          ingestSlug.sourceId,
          ingestSlug.fileUri
        ]);
        return result ? result.tdoId : null;
      } catch (error) {
        throw new errors.SqlError({ message: `Failed to retrieve tdoId for sourceId ${ingestSlug.sourceId} and fileUri ${ingestSlug.fileUri}: ${error.name} - ${error.message}` });
      }
    }
    return null;
  }

  async function getAssetId(context, ingestSlug) {
    if (ingestSlug.sourceId && ingestSlug.fileUri) {
      try {
        const sql = `
          SELECT
            asset_id as "assetId"
          FROM
            recording.ingest_slug__recording
          WHERE 
            media_source_id = $1 AND file_uri = $2
        `;
        const platformDbReader = serviceContext.dbConnections['core'].read;
        const result = await platformDbReader.oneOrNone(sql, [
          ingestSlug.sourceId,
          ingestSlug.fileUri
        ]);
        return result ? result.assetId : null;
      } catch (error) {
        throw new errors.SqlError({ message: `Failed to retrieve assetId for sourceId ${ingestSlug.sourceId} and fileUri ${ingestSlug.fileUri}: ${error.name} - ${error.message}` });
      }
    }
    return null;
  }

  function getCreatedBy(context) {
    const userId = _.get(context, '_authInfo.userId');
    const sourceIdFromJwt = _.get(context, 'requestContext.jwtToken.sourceId');
    const engineIdFromJwt = _.get(context, 'requestContext.jwtToken.engineId');
    const engineIdFromToken = _.get(context, 'requestContext.tokenInfo.engineId');
    const appIdFromJwt = _.get(context, 'requestContext.jwtToken.applicationId');
    const appIdFromToken = _.get(context, 'requestContext.tokenInfo.applicationId');
    const organizationId = _.get(context, 'requestContext.tokenInfo.organizationId');
    
    if (sourceIdFromJwt) {
      return `sourceId:${sourceIdFromJwt}`;
    } else if (engineIdFromJwt) {
      return `engineId:${engineIdFromJwt}`;
    } else if (engineIdFromToken) {
      return `engineId:${engineIdFromToken}`;
    } else if (appIdFromJwt) {
      return `applicationId:${appIdFromJwt}`;
    } else if (appIdFromToken) {
      return `applicationId:${appIdFromToken}`;
    } else if (userId) {
      return `userId:${userId}`;
    } else {
      return `organizationId:${organizationId}`;
    }
  }

  async function getSlugViolators(sourceId, fileUris, organizationId) {
    // Returns slugs that would violate the unique constraint:
    // UNIQUE INDEX uidx_ingest_slug_bundle_ingest ON recording.ingest_slug 
    // (media_source_id, bundle_key) WHERE status = 'ingesting' and bundle_key IS NOT NULL
    //
    // A violation occurs if any of the provided fileUris have the same bundle_key 
    // as an existing 'ingesting' record for the same sourceId

    if (!fileUris || fileUris.length === 0) {
      return [];
    }

    const sql = `
      SELECT 
        file_uri,
        bundle_key,
        status
      FROM 
        recording.ingest_slug
      WHERE 
        media_source_id = $1 AND
        organization_id = $2 AND
        file_uri = ANY($3) AND
        bundle_key IS NOT NULL AND
        EXISTS (
          SELECT 1 
          FROM recording.ingest_slug existing
          WHERE 
            existing.media_source_id = $1 AND
            existing.organization_id = $2 AND
            existing.bundle_key = recording.ingest_slug.bundle_key AND
            existing.status = 'ingesting' AND
            existing.file_uri != recording.ingest_slug.file_uri
        )
    `;

    try {
      const platformDbReader = serviceContext.dbConnections['core'].read;
      const results = await platformDbReader.map(sql, [sourceId, organizationId, fileUris], mapper.camelizeRootKeys);
      return results;
    } catch {
      // Proceed. Let the query that uses these violators to determine how to handle these.
      logger.warn(`Failed to check for slug violators for sourceId ${sourceId}. Proceeding without this check.`);
    }
  }

  return {
    getIngestSlug,
    getIngestSlugs,
    createIngestSlugs,
    updateIngestSlug,
    updateIngestSlugStatus,
    deleteIngestSlugs,
    deleteIngestSlugsForSource,
    getSource,
    getTDO,
    getAsset,
    getTDOId,
    getAssetId,
    getCreatedBy
  };
}