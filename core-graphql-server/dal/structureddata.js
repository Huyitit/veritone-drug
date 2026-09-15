/*eslint no-undef: "error"*/
/*eslint no-const-assign: "error"*/
const mapper = require('./mapper.js');
const _ = require('lodash');
const randomstring = require('randomstring');
const Validator = require('../modules/structureddata/model/validator.js');
const isUUID = require('validator').isUUID;
const MessageProducer = require('../modules/structureddata/model/message-producer.js');
const diffTool = require('./jsonSchema.util.js');
const uuid = require('uuid');
const moment = require('moment');
const jwt = require('jsonwebtoken');

module.exports = function createFunction(serviceContext) {
  const dbRead = serviceContext.dbConnections['third_party'].read;
  const dbWrite = serviceContext.dbConnections['third_party'].write;
  const { config, logger, redisCache } = serviceContext;
  const validator = new Validator(serviceContext);
  const messageProducer = new MessageProducer(serviceContext);

  const errors = require('../error')(config);
  const mainUtil = require('../util.js')(serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const util = require('./util.js')(config, serviceContext);
  const messageUtil = serviceContext.messageUtil;
  const {
    eventsMap,
    supportedEvents
  } = require('@veritone/core-server-base/events-map.js');

  const schemaStateTransitions = {
    draft: ['published', 'deleted'],
    published: ['inactive', 'deleted'],
    inactive: ['published', 'deleted'],
    deleted: []
  };

  const schemaNextActions = {
    draft: ['view', 'edit', 'publish', 'delete'],
    published: ['view', 'edit', 'deactivate', 'delete'],
    inactive: ['view', 'publish', 'delete'],
    deleted: []
  };

  const DATA_REGISTRY = {
    tableName: 'data_registry_metadata',
    columns: {
      id: 'id',
      name: 'name',
      description: 'description',
      source: 'source',
      org_id: '"organizationId"',
      created_by: '"createdBy"',
      modified_by: '"modifiedBy"',
      created_at: '"createdDateTime"',
      updated_at: '"modifiedDateTime"',
      is_system: '"isSystem"',
      is_public: '"isPublic"'
    }
  };

  const SCHEMA = {
    tableName: 'data_registries',
    columns: {
      id: 'id',
      schema: 'schema',
      org_id: '"organizationId"',
      created_by: '"createdBy"',
      modified_by: '"modifiedBy"',
      '"createdAt"': '"createdDateTime"',
      '"updatedAt"': '"modifiedDateTime"',
      data_registry_metadata_id: '"dataRegistryMetadataId"',
      major_version: '"majorVersion"',
      minor_version: '"minorVersion"',
      status: 'status',
      storage_name: '"storageName"',
      encrypted_properties: '"encryptedProperties"',
      query_excluded_properties: '"queryExcludedProperties"'
    }
  };

  const SDO = {
    columns: {
      id: 'id',
      data_registry_id: '"dataRegistryId"',
      data: 'data',
      created_by: '"createdBy"',
      modified_by: '"modifiedBy"',
      organization_id: '"organizationId"',
      application_id: '"applicationId"',
      '"createdAt"': '"createdDateTime"',
      '"updatedAt"': '"modifiedDateTime"'
    }
  };

  const SCHEMA_PROPERTIES = {
    tableName: 'data_registry_property',
    columns: {
      data_registry_metadata_id: '"dataRegistryId"',
      major_version: '"majorVersion"',
      storage_name: '"storageName"',
      path: 'path',
      type: 'type',
      title: 'title'
    }
  };
  const REDIS_TYPES = {
    SCHEMA: 'Schema',
    DATA_REGISTRY_FOR_SCHEMA_ID: 'DataRegistryForSchemaId',
    DATA_REGISTRY: 'DataRegistry',
    DATA_REGISTRY_WITH_SCHEMAS: 'DataRegistryWithSchemas',
    DATA_REGISTRY_PUBLISHED_SCHEMA_ID: 'DataRegistryPublishedSchemaId'
  };

  const Op = new Set(['eq', 'in', 'neq']);

  const rbacAuthBll = _.get(
    serviceContext,
    'bll.rbacAuth',
    require('../modules/rbacAuth/bll/rbacAuth.bll.js')(serviceContext)
  );
  async function getSchemaRowFromCache(schemaId) {
    if (!schemaId) {
      throw new Error('schemaId is not defined');
    }
    let schema = await redisCache.get(REDIS_TYPES.SCHEMA, schemaId);

    //Get from DB and cache it
    if (!schema) {
      const query = `SELECT ${mainUtil.makeSelectClause(SCHEMA.columns)}
           FROM ${SCHEMA.tableName}
           WHERE id = $1 AND "deletedAt" IS NULL`;

      schema = await one(dbRead, query, [schemaId], schemaId, 'Schema');
      if (_.isNil(schema)) {
        return null;
      }
      await redisCache.set(REDIS_TYPES.SCHEMA, schemaId, schema);
    }
    return schema;
  }

  const _getUserIdFromContext = (context) =>
    _.get(context, 'requestContext.userInfo.userId');

  const _getAuditUserFromContext = (context) => {
    const userId = _getUserIdFromContext(context);

    if (userId) {
      return userId;
    }

    return _.get(context, 'requestContext.tokenInfo.userId');
  };

  function checkId(arg, optional = true) {
    mainUtil.checkId(arg, optional);
  }

  async function getSchema(context, args) {
    checkId(args.id, false);

    const schemas = await getSchemas(context, args);

    if (schemas.count === 0) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'Schema'
        }
      });
    }

    return schemas.records[0];
  }

  async function emitDataRegistryEvent(
    context,
    payload = {},
    error = null,
    action
  ) {
    if (_.isNil(payload)) {
      throw new Error('the payload is required');
    }

    if (!_.isObject(payload)) {
      throw new Error('the payload should be an object');
    }

    const map = {
      create: 'StructuredDataRegistryCreate',
      update: 'StructuredDataRegistryUpdate'
    };
    let id = _.get(payload, 'id', null);
    const actionNameMap = {
      create: `${error ? 'Failed to create new' : 'Created'} data registry${id ? ` ${id}` : ''}`,
      update: `${error ? 'Failed to update' : 'Updated'} data registry ${id ? id : 'undefined'}`
    };
    const ev = map[action];
    if (ev && eventsMap[ev] && supportedEvents[ev]) {
      const event = {
        serviceName: 'core-graphql-server',
        event: eventsMap[ev].event,
        type: eventsMap[ev].type,
        dataRegistryId: _.get(payload, 'id', null),
        schemaId: _.get(payload, 'schemaId', null),
        organizationId: _.get(payload, 'organizationId', null),
        data: _.get(payload, 'data', payload),
        // actionInfo
        actionInfo: messageUtil.buildActionInfo(
          _.get(payload, 'id', null),
          error,
          action,
          null,
          actionNameMap[action]
        )
      };
      messageUtil.emitPublicEvent(
        supportedEvents[ev],
        'system',
        context,
        event
      );
    }
  }

  async function emitStructuredDataEvent(
    context,
    payload,
    error = null,
    action
  ) {
    if (_.isNil(payload)) {
      throw new Error('the payload is required');
    }

    if (!_.isObject(payload)) {
      throw new Error('the payload should be an object');
    }

    const map = {
      create: 'StructuredDataCreate',
      update: 'StructuredDataUpdate',
      delete: 'StructuredDataDelete'
    };
    const ev = map[action];
    if (ev && eventsMap[ev] && supportedEvents[ev]) {
      const actionDetails = {
        create: {
          success: `Created SDO ${payload.id} using schema ${payload.schemaId}`,
          failure: `Failed to create new SDO using schema ${payload.schemaId}`
        },
        update: {
          success: `Updated SDO ${payload.id} using schema ${payload.schemaId}`,
          failure: `Failed to update SDO ${payload.id} using schema ${payload.schemaId}`
        },
        delete: {
          success: `Deleted SDO ${payload.id} using schema ${payload.schemaId}`,
          failure: `Failed to delete SDO ${payload.id} using schema ${payload.schemaId}`
        }
      };

      const event = {
        serviceName: 'core-graphql-server',
        event: eventsMap[ev].event,
        type: eventsMap[ev].type,
        id: payload.id,
        schemaId: payload.schemaId,
        organizationId: payload.organizationId,
        data: _.get(payload, 'entity', payload),
        createdDateTime: payload.createdDateTime,
        modifiedDateTime: payload.modifiedDateTime,
        // actionInfo
        actionInfo: messageUtil.buildActionInfo(
          payload.id,
          error,
          action,
          !error ? 'success' : 'failure',
          !error ? actionDetails[action].success : actionDetails[action].failure
        )
      };
      messageUtil.emitPublicEvent(
        supportedEvents[ev],
        'system',
        context,
        event
      );

      // emit a private event for indexing
      if (_.isNil(error)) {
        messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
      }
    }
  }

  /**
   * Validates schema and checks system data registry access
   * @param {*} entity
   * @param {*} context
   * @param {*} args
   * @returns {Promise<object>} schemaRow
   */
  async function _validateSchemaAndAccess(entity, context, args) {
    const schemaRow = await getSchemaRowFromCache(entity.dataRegistryId);
    if (!schemaRow) {
      throw new errors.NotFound({
        message: 'Schema not found',
        data: {
          objectId: entity.dataRegistryId,
          objectType: 'Schema'
        }
      });
    }
    if (schemaRow.status !== 'published') {
      throw new errors.InvalidInput({
        message: 'The schema is not in a published state',
        data: {
          objectId: entity.dataRegistryId,
          objectType: 'Schema'
        }
      });
    }

    // Only allow internal tokens to insert sdos for system data registries
    const dataRegistry = await getDataRegistryForSchema(entity.schemaId);
    if (
      dataRegistry.isSystem &&
      !(
        mainUtil.isInternalAPIKey(context._authInfo) ||
        resUtil.isSuperAdmin(context._authInfo)
      )
    ) {
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token is not authorized to create ' +
          'structured data objects for internal schemas',
        data: {
          objectType: 'Schema',
          objectId: args.schemaId
        }
      });
    }

    return schemaRow;
  }

  /**
   * Checks if the SDO exists in the specified table.
   * Handles the following cases:
   * - For update operation with non-existing SDO: throws NotFound error
   * - For update operation with existing SDO: returns isNew = false
   * - For create operation with existing SDO: returns isNew = false and adds a deprecated warning
   * - For create operation without id: returns isNew = true
   * - For create operation with non-existing SDO: returns isNew = true
   *
   * @param {*} context
   * @param {*} entity
   * @param {*} tableName
   * @param {*} options
   * @returns {boolean} returns boolean value or throws error
   */
  async function _checkSDOExists(context, entity, tableName, options = {}) {
    checkId(entity.id, false);
    const existsQuery = `SELECT id FROM ${tableName} WHERE id = $1`;
    const existingSDO = await dbRead.query(existsQuery, [entity.id]);
    const isNew = _.isEmpty(existingSDO);

    if (isNew && options.action === 'update') {
      throw new errors.NotFound({
        message: 'Structured data object not found',
        data: {
          objectId: entity.id,
          objectType: 'StructuredData'
        }
      });
    } else if (!isNew && options.action === 'create') {
      if (!context.requestInfo.warnings) {
        context.requestInfo.warnings = [];
      }
      context.requestInfo.warnings.push({
        event: 'warning',
        errorName: 'api_deprecated_field',
        message:
          'Using createStructuredData for updates is deprecated. ' +
          'The API(s) updateStructuredData should be used instead.',
        data: {
          type: 'Mutation',
          field: 'createStructuredData',
          reason: 'Using createStructuredData for updates is deprecated',
          alternate: 'updateStructuredData'
        }
      });
    }

    return isNew;
  }

  async function createStructuredData(args, context) {
    let entity = args.input;
    // Initialize action based on shouldCheckExist flag
    // Will be updated later based on isNew if operation reaches that point
    let action = args.shouldCheckExist ? 'update' : 'create';

    try {
      // Block internal tokens
      const isOrglessToken =
        mainUtil.isInternalAPIKey(context._authInfo) &&
        !args.organizationId;
      if (isOrglessToken) {
        throw new errors.NotAllowed({
          message:
            'Creating a structured data object requires an organization context. ' +
            'Internal tokens without an organization cannot be used for SDO creation.',
          data: { objectType: 'StructuredDataObject' }
        });
      }
      entity.organizationId = args.organizationId;
      if (args.shouldCheckExist) {
        // always require id for updateStructuredData calls
        checkId(entity.id, false);
      } else if (entity.id && entity.id.length) {
        checkId(entity.id);
      }

      mapGraphQlToDataModel(entity, context);
      checkId(entity.schemaId, false);
      checkId(entity.dataRegistryId, false);

      const schemaRow = await _validateSchemaAndAccess(entity, context, args);
      entity.data = validator.coerceDataBySchema(entity.data, schemaRow.schema);
      await validator.validateAsync(schemaRow.schema, entity.data);
      const tableName = await getTableNameBySchemaId(entity.dataRegistryId);

      // create/update operation with id provided should check if SDO exists
      let isNew = false;
      if (entity.id) {
        isNew = await _checkSDOExists(context, entity, tableName, {
          action: args.shouldCheckExist ? 'update' : 'create'
        });
      } else {
        isNew = true;
        entity.id = uuid.v4();
      }

      // based on isNew value, set action for event emission
      action = isNew ? 'create' : 'update';

      // if schema specifies properties that should be encrypted, encrypt them before saving
      if (
        !_.isNil(schemaRow.encryptedProperties) &&
        schemaRow.encryptedProperties.length > 0
      ) {
        encryptEntityProperties(entity, schemaRow.encryptedProperties);
      }

      const values = [
        entity.id,
        entity.dataRegistryId,
        entity.data,
        entity.createdBy,
        entity.modifiedBy,
        entity.organizationId,
        entity.applicationId
      ];

      // Cannot do returning clause because of trigger on insert
      const sql = `INSERT INTO ${tableName}
                      (id, data_registry_id, data, created_by, modified_by, organization_id, application_id, "createdAt", "updatedAt")
                  SELECT $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
                  WHERE NOT EXISTS (SELECT id FROM ${tableName} WHERE id = $1);

                  UPDATE ${tableName} SET data_registry_id = $2, data = $3, modified_by = $5, organization_id = $6, application_id = $7, "updatedAt" = NOW()
                  WHERE id = $1
                  RETURNING ${mainUtil.makeSelectClause(SDO.columns)};`;

      const result = await dbWrite.query(sql, values);
      if (_.isEmpty(result)) {
        throw new errors.InternalServerError({
          message: `Failed to ${action} SDO`,
          data: {
            objectType: 'Schema',
            objectId: args.schemaId
          }
        });
      }

      // increment counter after successful creation or updating of SDO
      await serviceContext.metrics.incrementCounter(
        isNew ? 'graphqlCreatedSDO' : 'graphqlUpdatedSDO'
      );

      // only add default ACEs for new SDOs
      if (isNew) {
        const rbacArgs = {
          objectId: entity.id,
          organizationId: args.organizationId,
          resourceType: 'SDO',
          dataRegistryId: args.input.dataRegistryId,
          ignoreDefaultSDORole: args.ignoreDefaultSDORole
        };

        await rbacAuthBll.addDefaultACEsToResources(context, rbacArgs);
      }

      //Row updated
      entity = mapper.camelizeRootKeys(result[0]);
      entity.schemaId = entity.dataRegistryId;
      emitStructuredDataEvent(context, entity, null, action);
      return entity;
    } catch (err) {
      emitStructuredDataEvent(context, entity, err, action);
      throw err;
    }
  }

  async function createStructuredDatasets(args, context) {
    let entity = args.input;
    const now = moment.utc();
    const emitCreateStructuredDataAuditEvent = (result, error) => {
      if (_.isArray(result) && result.length > 0) {
        //Row updated
        entity = mapper.camelizeRootKeys(result[0]);
      } else {
        entity.createdDateTime = entity.modifiedDateTime = now;
      }
      // actionInfo
      entity.actionInfo = messageUtil.buildActionInfo(
        entity.schemaId,
        error,
        'create',
        !error ? 'success' : 'failure',
        !error
          ? `Created SDO ${entity.id} using schema ${entity.schemaId}`
          : `Failed to create new SDO using schema ${entity.schemaId}`
      );

      messageProducer.publishEvent(
        context,
        eventsMap.StructuredDataCreate,
        entity
      );
    };
    try {
      entity.organizationId = args.organizationId;
      mapGraphQlToDatasetModel(entity, context);
      checkId(entity.schemaId, false);
      checkId(entity.dataRegistryId, false);

      const schemaRow = await getSchemaRowFromCache(entity.dataRegistryId);
      if (!schemaRow) {
        throw new errors.NotFound({
          message: 'Schema not found',
          data: {
            objectId: entity.dataRegistryId,
            objectType: 'Schema'
          }
        });
      }
      if (schemaRow.status !== 'published') {
        throw new errors.InvalidInput({
          message: 'The schema is not in a published state',
          data: {
            objectId: entity.dataRegistryId,
            objectType: 'Schema'
          }
        });
      }

      // Only allow internal tokens to insert sdos for system data registries
      // const dataRegistry = await getDataRegistryForSchema(entity.schemaId);
      // if (
      //   dataRegistry.isSystem &&
      //   !(
      //     mainUtil.isInternalAPIKey(context._authInfo) ||
      //     resUtil.isSuperAdmin(context._authInfo)
      //   )
      // ) {
      //   throw new errors.NotAllowed({
      //     message:
      //       'The authenticated user or token is not authorized to create ' +
      //       'structured data objects for internal schemas',
      //     data: {
      //       objectType: 'Schema',
      //       objectId: args.schemaId
      //     }
      //   });
      // }
      const values = [];
      const datasetMap = new Map();

      // validate each dataset
      if (_.isEmpty(entity.dataset)) {
        throw new errors.InvalidInput({
          message: 'At least one dataset must be provided',
          data: {
            objectType: 'StructuredData',
            objectId: entity.schemaId
          }
        });
      }

      for (const dataset of entity.dataset) {
        await validator.validateAsync(schemaRow.schema, dataset.data);
        const value = [
          dataset.id ? dataset.id : uuid.v4(),
          entity.dataRegistryId, // this is same as schemaID . from mapGraphQlToDatasetModel
          dataset.data,
          entity.createdBy,
          entity.modifiedBy,
          entity.organizationId,
          entity.applicationId,
          entity.datasetId,
          now,
          now
        ];
        // for audit logging
        datasetMap.set(value[0], {
          ...entity,
          id: value[0],
          schemaId: entity.dataRegistryId,
          createdDateTime: now,
          modifiedDateTime: now
        });
        values.push(value);
      }
      const flattenArrayValues = flatten(values);
      const expandArray = expand(
        values.length,
        flattenArrayValues.length / values.length
      );

      const tableName = await getTableNameBySchemaId(entity.dataRegistryId);
      // Cannot do returning clause because of trigger on insert
      let sql = `INSERT INTO ${tableName}
      (id, data_registry_id, data, created_by, modified_by, organization_id, application_id, dataset_id, "createdAt", "updatedAt")
      VALUES ${expandArray} ON CONFLICT (id ) DO NOTHING;`;

      // needs to audit log on each dataset
      Promise.all(
        [...datasetMap.values()].map((sdo) =>
          emitCreateStructuredDataAuditEvent([sdo], null)
        )
      );

      return entity;
    } catch (err) {
      emitCreateStructuredDataAuditEvent(entity, err);
      throw err;
    }
  }

  async function updateStructuredData(args, context) {
    args.shouldCheckExist = true;
    return await createStructuredData(args, context);
  }

  function expand(rowCount, columnCount, startAt = 1) {
    let index = startAt;
    return Array(rowCount)
      .fill(0)
      .map(
        (v) =>
          `(${Array(columnCount)
            .fill(0)
            .map((v) => `$${index++}`)
            .join(', ')})`
      )
      .join(', ');
  }

  function flatten(arr) {
    const newArr = [];
    arr.forEach((v) => v.forEach((p) => newArr.push(p)));
    return newArr;
  }

  function mapGraphQlToDataModel(entity, context) {
    entity.data = mapJSONOrStringField('data', 'dataString', entity, true);
    entity.dataRegistryId = entity.schemaId;
    entity.modifiedBy = _getAuditUserFromContext(context);
    if (!entity.createdBy) {
      entity.createdBy = _getAuditUserFromContext(context);
    }
    if (!entity.applicationId) {
      entity.applicationId = _.get(
        context,
        'requestContext.tokenInfo.applicationId'
      );
    }
  }

  function mapGraphQlToDatasetModel(entity, context) {
    entity.dataRegistryId = entity.schemaId;
    entity.modifiedBy = context.requestContext.authToken;
    if (!entity.createdBy) {
      entity.createdBy = context.requestContext.authToken;
    }
    if (!entity.applicationId) {
      entity.applicationId = _.get(
        context,
        'requestContext.tokenInfo.applicationId'
      );
    }
  }
  function mapJSONOrStringField(
    jsonFieldName,
    stringFieldName,
    data,
    oneRequired = false
  ) {
    if (data[jsonFieldName] && data[stringFieldName]) {
      throw new errors.InvalidInput({
        message:
          'only one of ' +
          jsonFieldName +
          ' and ' +
          stringFieldName +
          ' can be provided'
      });
    }
    if (oneRequired && !data[jsonFieldName] && !data[stringFieldName]) {
      throw new errors.InvalidInput({
        message:
          'one of ' +
          jsonFieldName +
          ' and ' +
          stringFieldName +
          ' must be provided'
      });
    }
    return (
      data[jsonFieldName] ||
      (data[stringFieldName] ? JSON.parse(data[stringFieldName]) : null)
    );
  }

  async function getStructuredDataObject(context, args) {
    const result = await getStructuredDataObjects(context, args);
    if (result.count === 0) {
      throw new errors.NotFound({
        data: { objectId: args.id, objectName: 'StructuredData' }
      });
    }
    return _.get(result, 'records[0]');
  }

  async function getDataRegistryForSchema(schemaId) {
    let dataRegistry = await redisCache.get(
      REDIS_TYPES.DATA_REGISTRY_FOR_SCHEMA_ID,
      schemaId
    );
    if (!dataRegistry) {
      const sql = `SELECT ${mainUtil.makeSelectClause(
        DATA_REGISTRY.columns
      )} FROM ${DATA_REGISTRY.tableName}
      WHERE id in (
        SELECT data_registry_metadata_id FROM ${SCHEMA.tableName} WHERE id = $1
      )`;
      const rows = await dbRead.query(sql, [schemaId]);
      dataRegistry = _.get(rows, '0');
      if (dataRegistry) {
        await redisCache.set(
          REDIS_TYPES.DATA_REGISTRY_FOR_SCHEMA_ID,
          schemaId,
          dataRegistry
        );
      }
    }
    return dataRegistry;
  }

  function assembleSdoDataFilter(dataFilter, wheres, values) {
    if (!_.isNil(dataFilter)) {
      if (_.isObject(dataFilter)) {
        const filters = mapSDOQueryOperators(dataFilter, 'data');
        const { where, values: vals } = generateWhereClause(filters);
        wheres.push(where);
        values.push(...vals);
      } else {
        throw new errors.InvalidInput({
          message: 'Invalid data filter provided'
        });
      }
    }
  }

  function assembleSdoDateTimeFilter(dateTimeFilter, info, wheres, values) {
    if (_.isNil(dateTimeFilter)) {
      return;
    }
    if (_.isEmpty(dateTimeFilter)) {
      throw new errors.InvalidInput({
        message: 'DateTime filter cannot be empty'
      });
    }
    const mappedField = mapDateFilterField(dateTimeFilter.field);
    // check if the dateTimeFilter field is a valid field
    if (!mappedField) {
      throw new errors.InvalidInput({
        message: 'Invalid dateTime filter provided'
      });
    }
    const fromDateTime = _.get(dateTimeFilter, 'fromDateTime');
    const toDateTime = _.get(dateTimeFilter, 'toDateTime');
    if (!fromDateTime && !toDateTime) {
      throw new errors.InvalidInput({
        message: 'At least one date must be provided'
      });
    }
    // if from date is after to date, throw an error
    if (
      fromDateTime &&
      toDateTime &&
      moment(fromDateTime).isAfter(toDateTime)
    ) {
      throw new errors.InvalidInput({
        message: 'From date cannot be after to date'
      });
    }

    if (fromDateTime) {
      wheres.push(
        `"${mappedField}" >= $${values.push(
          moment(fromDateTime).toISOString()
        )}`
      );
    }
    if (toDateTime) {
      wheres.push(
        `"${mappedField}" <= $${values.push(moment(toDateTime).toISOString())}`
      );
    }
  }
  function mapDateFilterField(field) {
    const dateFieldMapping = {
      modifiedAt: 'updatedAt',
      updatedAt: 'updatedAt',
      createdAt: 'createdAt'
    };
    return dateFieldMapping[field];
  }

  async function getStructuredDataObjects(context, args, info) {
    checkId(args.schemaId, false);

    const schemaRow = await getSchemaRowFromCache(args.schemaId);
    if (!schemaRow) {
      throw new errors.NotFound({
        message: 'Schema not found',
        data: {
          objectId: args.schemaId,
          objectType: 'Schema'
        }
      });
    }
    const ingestedTable = schemaRow.storageName;
    if (!ingestedTable) {
      // sometimes someone queries for SDOs on a schema that has been deleted or
      // has never been published. storageName in this case is null.
      // we need to error out here to avoid a SQL error later.
      throw new errors.NotFound({
        message:
          'Structured data object for the requested schema ID, ' +
          args.schemaId +
          ', cannot be loaded. The schema may have been deleted.',
        data: {
          objectType: 'Schema',
          objectId: args.schemaId
        }
      });
    }
    const dataRegistry = await getDataRegistryForSchema(args.schemaId);

    const values = [];
    const wheres = [];

    // OLP filtering
    let olpJoin = '';
    args.rbacAuthFilter = context._rbacAuthFilter;
    if (!args.bypassAuth && _.isFunction(args.rbacAuthFilter)) {
      const sqlFilter = args.rbacAuthFilter(
        'sdo.id',
        values.length + 1,
        'sdo.data_registry_id'
      );

      if (_.get(sqlFilter, 'metadata.resourceType') === 'SDO') {
        values.push(...sqlFilter.args);
        wheres.push(sqlFilter.where);
        olpJoin = sqlFilter.join;
      }
    }

    let sql = `SELECT ${mainUtil.makeSelectClause(
      SDO.columns,
      'sdo'
    )} FROM ${ingestedTable} sdo ${olpJoin}`;

    if (args.id) {
      checkId(args.id);
      wheres.push(`id = $${values.push(args.id)}`);
      args.limit = 1;
    } else if (!_.isEmpty(args.ids)) {
      _.forEach(args.ids, checkId);
      wheres.push(`id = ANY($${values.push(args.ids)}::uuid[])`);
      args.limit = args.ids.length;
    } else {
      // validate filters:
      // 1. data filter
      const data = _.get(args, 'filter', null);
      assembleSdoDataFilter(data, wheres, values);
      // 2. date/time fitler
      const dateTimeFilter = _.get(args, 'dateTimeFilter', null);
      dateTimeFilter &&
        assembleSdoDateTimeFilter(dateTimeFilter, info, wheres, values);
    }
    if (args.owned === true || dataRegistry.isSystem !== true) {
      mainUtil.addSqlWhere(
        'organization_id',
        args.organizationId,
        wheres,
        values
      );
    }

    const orderClause = [];
    const orderByMap = {
      createdDateTime: '"createdAt"',
      modifiedDateTime: '"updatedAt"'
    };
    if (_.get(args, 'orderBy.length', 0) > 0) {
      args.orderBy.forEach((orderBy) => {
        const col = orderByMap[orderBy.field];
        if (!col)
          throw new errors.InternalServerError({
            message:
              'An internal server configuration error in sdo order by processing has occurred.',
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
      orderClause.push('"createdAt" desc');
    }

    if (wheres.length > 0) {
      sql += ` WHERE ${wheres.join(' AND ')} `;
    }
    sql += ` ORDER BY ${orderClause.join(', ')} `;
    sql += ` LIMIT ${args.limit || 30} OFFSET ${args.offset || 0}`;

    let rows = await dbRead.query(sql, values);

    rows.forEach((row) => {
      row.data = _.omit(row.data, schemaRow.queryExcludedProperties);
    });

    return {
      ...mainUtil.toPage(args, rows),
      owned: !!args.owned,
      orderBy: args.orderBy
    };
  }

  /**
   * Recursively generate key to operator mappings
   * @param obj
   */
  const mapSDOQueryOperators = (obj, rootKey) => {
    //
    let result = {};
    Object.entries(obj).forEach(([key, val]) => {
      // Check if sequelize operator or append data so you can only query on data
      const newKey = `${rootKey}->${key}`;
      if (Op.has(key)) {
        result[rootKey] = {
          operator: key,
          value: val
        };
      } else if (_.isObject(val)) {
        result = Object.assign(result, mapSDOQueryOperators(val, newKey));
      } else {
        result[newKey] = {
          operator: !_.isObject(val) ? 'eq' : key,
          value: val
        };
      }
    });
    return result;
  };

  const generateWhereClause = (filters) => {
    const clauses = [];
    let values = [];

    Object.entries(filters).forEach(([field, options]) => {
      const path = field.split('->');
      let key = 'data';
      for (let i = 0; i < path.length; i++) {
        if (i !== 0) {
          key += `$${values.push(path[i])}`;
        }
        if (i < path.length - 2) {
          key += '->';
        } else if (i === path.length - 2) {
          key += '->>';
        }
      }
      switch (options.operator) {
        case 'eq':
          clauses.push(`${key} = $${values.push(options.value)}`);
          break;
        case 'in':
          clauses.push(
            `${key} = ANY($${values.push(options.value.map(_.toString))})`
          );
          break;
        case 'neq':
          clauses.push(`${key} <> $${values.push(options.value)}`);
          break;
        default:
          throw new errors.NotImplemented({
            message: 'Structured data filters operations not implemented',
            data: {
              operation: options.operator
            }
          });
      }
    });

    return {
      where: clauses.join(' AND '),
      values
    };
  };

  async function createSchemaMetadata(context, args) {
    try {
      const { input } = args;
      if (input.id) {
        checkId(input.id);
      } else {
        input.id = uuid.v4();
      }

      const columnData = _.pick(input, Object.keys(DATA_REGISTRY.columns));
      columnData.org_id = args.organizationId;
      columnData.created_by = _getUserIdFromContext(context);
      columnData.modified_by = columnData.created_by;
      columnData.created_at = moment.utc();
      columnData.updated_at = columnData.created_at;
      columnData.is_system = input.isSystem;
      columnData.is_public = input.isPublic;
      const { sql, values } = mainUtil.makeInsertSql(
        DATA_REGISTRY.tableName,
        columnData,
        DATA_REGISTRY.columns
      );
      const dr = await one(dbWrite, sql, values, 'DataRegistry', input.id);
      emitDataRegistryEvent(context, args.input, null, 'create');
      return dr;
    } catch (err) {
      const auditLogPayload =
        err.name === 'invalid_input' ||
        (err.name === 'not_found' && _.includes(err.message, 'Invalid ID'))
          ? _.omit(args.input, 'id')
          : args.input;
      emitDataRegistryEvent(context, auditLogPayload, err, 'create');
      throw err;
    }
  }

  async function updateSchemaMetadata(context, args) {
    try {
      const { input } = args;
      checkId(input.id, false);

      const whereClause = `org_id = $1 and id = $2`;
      const columnData = _.pick(input, ['name', 'description', 'source']);
      columnData.modified_by = _getUserIdFromContext(context);
      columnData.updated_at = moment.utc();

      const { sql, values } = mainUtil.makeUpdateSql(
        DATA_REGISTRY.tableName,
        columnData,
        DATA_REGISTRY.columns,
        whereClause,
        2
      );
      values.unshift(args.organizationId, input.id);
      const result = await one(dbWrite, sql, values, 'Schema', input.id);
      if (_.isNil(result)) {
        throw new errors.NotFound({
          data: { objectId: input.id, objectName: 'DataRegistry' }
        });
      }
      emitDataRegistryEvent(context, result, null, 'update');
      return result;
    } catch (err) {
      const auditLogPayload =
        err.name === 'invalid_input' ||
        (err.name === 'not_found' && _.includes(err.message, 'Invalid ID'))
          ? _.omit(args.input, 'id')
          : args.input;
      emitDataRegistryEvent(context, auditLogPayload, err, 'update');
      throw err;
    }
  }

  // For mapping graphql field to column name
  const metaDataMapping = {
    createdDateTime: 'created_at',
    modifiedDateTime: 'updated_at'
  };

  const ownershipType = { mine: 'mine', others: 'others', all: 'all' };

  async function getDataRegistries(context, args) {
    let ownership = args.filterByOwnership ?? ownershipType.all;
    let selectDistinct = false;
    const sqlWhere = [];

    const params = [];

    let query = `FROM ${DATA_REGISTRY.tableName} drm`;

    sqlWhere.push('drm."deleted_at" IS NULL');
    const validatedInputIds = util.validateAndMergeInputIds(args);
    if (args.appPackageId) {
      checkId(args.appPackageId);
      query += ` INNER JOIN data_registry__application dra
        ON drm.id = dra.data_registry_id`;

      sqlWhere.push(`dra.application_id = $${params.push(args.appPackageId)}`);
    }

    // name match clause needs to be inserted into both the top-level
    // query and sub-query below or we get extra matches on public registries
    let nameClause = '';
    if (args.name) {
      const argName = mainUtil.sqlEscapeForLIKE(args.name);
      if (args.nameMatch === 'exact') {
        nameClause = `drm.name = '${argName}'`;
      } else if (args.nameMatch === 'startsWith') {
        nameClause = `drm.name ILIKE '${argName}%'`;
      } else if (args.nameMatch === 'endsWith') {
        nameClause = `drm.name ILIKE '%${argName}'`;
      } else if (args.nameMatch === 'contains') {
        nameClause = `drm.name ILIKE '%${argName}%'`;
      } else {
        // means code bug due to mismatch between schema and code here.
        throw new Error('unknown string compare type ' + args.nameMatch);
      }
    }

    const useEngineGrantFlagEnabled = await _getUseEngineGrantFlag(context);
    const isInternalAPIKey = mainUtil.isInternalAPIKey(context._authInfo);

    if (
      useEngineGrantFlagEnabled &&
      !args._skipAccessCheck &&
      !isInternalAPIKey
    ) {
      const inputIdList = [...validatedInputIds];
      // Access is granted if the caller owns the data_registry, or it is public
      const orgId =
        args.organizationId || resUtil.getOrgFromAuthContext(context);
      const orgIdIdx = params.push(orgId);

      let allowedSchemaIds = [];

      if (
        ownership === ownershipType.others ||
        ownership === ownershipType.all
      ) {
        const allowedResources =
          await serviceContext.dal.packages.getAccessiblePackageResourcesByType(
            context,
            ['schema'],
            args.organizationId
          );
        allowedSchemaIds = allowedResources.schema.filter((id) => isUUID(id));
        selectDistinct = true;

        query += ` LEFT JOIN data_registries dr
        ON dr.data_registry_metadata_id = drm.id`;

        const inputIdListIdx = params.push(inputIdList);
        const allowedSchemaIdsIdx = params.push(allowedSchemaIds);
        if (ownership === ownershipType.others) {
          sqlWhere.push(
            `(
              drm.org_id <> $${orgIdIdx}
              AND (
                (drm.id = ANY($${inputIdListIdx}::uuid[]) AND drm.is_public = true)
                OR dr.id = ANY($${allowedSchemaIdsIdx}::uuid[])
              )
            )`
          );
        } else {
          sqlWhere.push(
            `(
              drm.org_id = $${orgIdIdx}
              OR drm.is_public = true
              OR dr.id = ANY($${allowedSchemaIdsIdx}::uuid[])
            )`
          );
        }
      } else if (ownership === ownershipType.mine) {
        sqlWhere.push(`(drm.org_id = $${orgIdIdx})`);
      }
    } else {
      // filtering public schemas by ownership
      const orgFilterOperator = ownership === ownershipType.others ? '<>' : '=';

      if (args.organizationId) {
        let criteria = `drm.org_id ${orgFilterOperator} $${params.push(
          args.organizationId
        )}`;
        if (ownership !== ownershipType.mine) {
          const publicSchemaPredicate =
            ownership === ownershipType.others ? 'AND' : 'OR';
          const dmNameClause = nameClause.replace(/'drm.'/g, 'dr.');
          const GET_PUBLIC_SCHEMA = `
            ${publicSchemaPredicate} EXISTS (
            SELECT dr.data_registry_metadata_id
            FROM data_registries dr
            WHERE dr."deletedAt" IS NULL
            AND dr.data_registry_metadata_id = drm.id
            ${nameClause.length ? 'AND ' + dmNameClause : ''}
            AND dr."status" = 'published')
          `;
          criteria += GET_PUBLIC_SCHEMA;
        }
        sqlWhere.push(`(${criteria})`);
      }
    }

    // ids filter
    if (validatedInputIds.length > 0) {
      const idArgs = [];
      validatedInputIds.forEach((id) => {
        params.push(id);
        idArgs.push(`\$${params.length}`);
      });
      const idStr = idArgs.join(',') || null;
      sqlWhere.push(`drm.id IN (${idStr})`);
    }

    if (nameClause) {
      sqlWhere.push(nameClause);
    }

    const selectClause = mainUtil.makeSelectClause(
      DATA_REGISTRY.columns,
      'drm'
    );

    if (selectDistinct) {
      query = `
        WITH uniq_drm as (
          SELECT distinct on (drm.id)
          ${selectClause}
          ${query}
          ${sqlWhere.length ? ` WHERE ${sqlWhere.join(' AND ')}` : ''}
        )
        SELECT *
        FROM uniq_drm
      `;
    } else {
      query = `SELECT ${selectClause} ${query}`;
      if (sqlWhere.length) {
        query += ' WHERE ' + sqlWhere.join(' AND ');
      }
    }

    if (metaDataMapping[args.orderBy] || args.orderBy) {
      const orderBy = metaDataMapping[args.orderBy] || args.orderBy;
      if (!(orderBy in DATA_REGISTRY.columns)) {
        throw new Error('unknown orderBy ' + orderBy);
      }
      query += ` ORDER BY ${DATA_REGISTRY.columns[orderBy]} ${args.orderDirection || 'asc'}`;
    }

    if (_.isNumber(args.limit) && args.limit > 0) {
      query += ` LIMIT $${params.push(args.limit)}`;
    }

    if (_.isNumber(args.offset)) {
      query += ` OFFSET $${params.push(args.offset)}`;
    }

    const drms = await dbRead.map(query, params, mapper.camelizeRootKeys);

    return mainUtil.toPage(args, drms);
  }

  async function getDataRegistry(context, args) {
    if (args.id) {
      checkId(args.id, false);
    }
    args.limit = 1;
    const dataRegistries = await getDataRegistries(context, args);
    if (dataRegistries.count === 0) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectName: 'DataRegistry'
        }
      });
    }

    return dataRegistries.records[0];
  }

  async function getDataRegistryFromCache(context, dataRegistryId) {
    let dataRegistry = await redisCache.get(
      REDIS_TYPES.DATA_REGISTRY,
      dataRegistryId
    );

    if (_.isNil(dataRegistry)) {
      dataRegistry = await serviceContext.dal.structuredData.getDataRegistry(
        context,
        { id: dataRegistryId }
      );
      await redisCache.set(
        REDIS_TYPES.DATA_REGISTRY,
        dataRegistry.id,
        dataRegistry
      );
    }

    return dataRegistry;
  }

  async function getDataRegistryWithSchemasFromCache(context, dataRegistryId) {
    let dataRegistryWithSchemas = await redisCache.get(
      REDIS_TYPES.DATA_REGISTRY_WITH_SCHEMAS,
      dataRegistryId
    );

    if (_.isNil(dataRegistryWithSchemas)) {
      const dataRegistry =
        await serviceContext.dal.structuredData.getDataRegistryFromCache(
          context,
          dataRegistryId
        );

      const getSchemasResult =
        await serviceContext.dal.structuredData.getSchemas(context, {
          dataRegistryMetadataId: dataRegistryId,
          limit: 1000,
          _skipAccessCheck: true
        });

      const schemas = _.orderBy(
        getSchemasResult.records,
        ['majorVersion', 'minorVersion'],
        ['desc', 'desc']
      );

      dataRegistryWithSchemas = {
        ...dataRegistry,
        schemas
      };

      await redisCache.set(
        REDIS_TYPES.DATA_REGISTRY_WITH_SCHEMAS,
        dataRegistry.id,
        dataRegistryWithSchemas
      );
    }

    return dataRegistryWithSchemas;
  }

  async function getSchemas(context, args) {
    const where = [];
    const values = [];
    const order = [];
    const accessScope = _.get(args, 'accessScope', ['any']);
    const hasAnyScope = _.includes(accessScope, 'any');

    const validatedInputIds = util.validateAndMergeInputIds(args);

    const useEngineGrantFlagEnabled = await _getUseEngineGrantFlag(context);
    const authInfo =
      context._authInfo || context.userInfo || context.tokenInfo || {};
    const isInternalAPIKey = mainUtil.isInternalAPIKey(authInfo);

    if (
      useEngineGrantFlagEnabled &&
      !args._skipAccessCheck &&
      !isInternalAPIKey
    ) {
      const allowedResources =
        await serviceContext.dal.packages.getAccessiblePackageResourcesByType(
          context,
          ['schema'],
          args.organizationId
        );
      const orgId =
        args.organizationId || resUtil.getOrgFromAuthContext(context);
      let schemaIds = allowedResources.schema.filter((id) => isUUID(id));
      if (!_.isEmpty(validatedInputIds)) {
        schemaIds = _.intersection(schemaIds, validatedInputIds);
        let ownerShipWhere = [];
        // the id should be either in the request ^ granted ids set
        if (!_.isEmpty(schemaIds)) {
          values.push(schemaIds);
          ownerShipWhere.push(`id = ANY($${values.length}::uuid[])`);
        }

        // or be in the request set and belong to a public registry
        values.push(validatedInputIds);
        values.push(orgId);
        ownerShipWhere.push(`(
          id = ANY($${values.length - 1}::uuid[]) AND
          (org_id = $${values.length} OR
          data_registry_metadata_id IN (SELECT id from data_registry_metadata WHERE is_public = true AND deleted_at IS NULL))
        )`);
        where.push(`(${ownerShipWhere.join(' OR ')})`);

        // skip any other access scopes, if we filter by Any scope
        if (!hasAnyScope) {
          _addSqlWhereForSchemas(
            {
              accessScope,
              orgId: args.organizationId,
              schemaIds
            },
            where,
            values
          );
        }

        args.limit = _.uniq(_.concat(schemaIds, validatedInputIds)).length;
      } else {
        // Access is granted if the caller owns the schema or the schema is
        // in the allowed resources
        _addSqlWhereForSchemas(
          {
            accessScope,
            orgId,
            schemaIds,
            dataRegistryMetadataId: args.dataRegistryMetadataId
          },
          where,
          values
        );
      }
    } else {
      // legacy - all schemas are public or access already verified and indicated via _skipAccessCheck
      if (args.organizationId && hasAnyScope) {
        where.push(
          `(org_id = $${values.push(
            args.organizationId
          )} OR status = 'published')`
        );
      }
      if (!_.isEmpty(validatedInputIds)) {
        where.push(`id = ANY($${values.push(validatedInputIds)}::uuid[])`);
        args.limit = validatedInputIds.length;
      } else if (args.dataRegistryMetadataId) {
        checkId(args.dataRegistryMetadataId);
        where.push(
          `data_registry_metadata_id = $${values.push(
            args.dataRegistryMetadataId
          )}`
        );
      }

      // skip any other access scopes, if we filter by Any scope
      if (!hasAnyScope) {
        // Does not support filtering by granted scope and returns an empty array
        // when the useEngineGrant flag is turned off or the access check is skipped.
        if (_.includes(accessScope, 'granted')) {
          return mainUtil.toPage(args, []);
        }

        _addSqlWhereForSchemas(
          {
            accessScope,
            orgId: args.organizationId
          },
          where,
          values
        );
      }
    }

    // exclude deleted schemas
    where.push('"deletedAt" is null');

    // field filters
    if (!_.isEmpty(args.status)) {
      where.push(
        `status = ANY($${values.push(
          args.status
        )}::enum_data_registries_status[])`
      );
    }

    if (_.isNumber(args.majorVersion)) {
      where.push(`major_version = $${values.push(args.majorVersion)}`);
    }
    if (_.isNumber(args.minorVersion)) {
      where.push(`minor_version = $${values.push(args.minorVersion)}`);
    }

    if (args.name) {
      const argName = mainUtil.sqlEscapeForLIKE(args.name);
      let nameClause;
      if (args.nameMatch === 'exact') {
        nameClause = ` name = '${argName}'`;
      } else if (args.nameMatch === 'startsWith') {
        nameClause = ` name ILIKE '${argName}%'`;
      } else if (args.nameMatch === 'endsWith') {
        nameClause = ` name ILIKE '%${argName}'`;
      } else if (args.nameMatch === 'contains') {
        nameClause = ` name ILIKE '%${argName}%'`;
      } else {
        // means code bug due to mismatch between schema and code here.
        throw new Error('unknown string compare type ' + args.nameMatch);
      }
      where.push(`data_registry_metadata_id IN (
        SELECT id from data_registry_metadata WHERE ${nameClause}
      )`);
    }

    const orderByColumnMap = {
      majorVersion: 'major_version',
      minorVersion: 'minor_version',
      status: 'status',
      createdDateTime: '"createdAt"',
      modifiedDateTime: '"modifiedAt"'
    };

    if (_.isArray(args.orderBy)) {
      _.forEach(args.orderBy, (orderField) => {
        order.push(
          `${orderByColumnMap[orderField.field]} ${orderField.direction}`
        );
      });
    } else {
      order.push(`"createdAt" desc`);
    }

    const sql = `SELECT ${mainUtil.makeSelectClause(SCHEMA.columns)}
     FROM ${SCHEMA.tableName}
      WHERE ${where.join(' AND ')}
      ${_.isEmpty(order) ? '' : `ORDER BY ${order.join(', ')}`}
      LIMIT ${args.limit || 30} OFFSET ${args.offset || 0}
    `;
    const records = await dbRead.query(sql, values);
    return mainUtil.toPage(args, records);
  }

  /**
   * This function creates a schema with given schema fields. It won't
   * create/update the schema if there is already one with the same ID
   * or major version.
   *
   * Use `createSchema` mutation only if cloning an identical schema
   *
   * The right way of creating a new schema in a data registry is using
   * `upsertSchemaDraft` mutation as explained in this doc:
   * https://steel-ventures.atlassian.net/wiki/spaces/SE/pages/2429288982/Structured+Data+Objects+SDOs
   *
   */
  async function createSchema(context, args) {
    const { input } = args;
    const currentUser = _getUserIdFromContext(context);
    const schemaDefinition = input.definition;

    checkId(input.id);
    checkId(input.dataRegistryId);

    if (!mainUtil.isJSON(schemaDefinition)) {
      throw new errors.InvalidInput({
        message: `Schema has to be a JSON object`
      });
    }

    // structured data mutations were never secured with functional
    // permissions. since we can't do that now without breaking clients,
    // we'll require schema:update explicitly here to prevent arbitrary
    // internal tokens from updataing schemas.
    // prior to VTN-14474, internal tokens could not proceed past this
    // point.
    if (!args.organizationId) {
      mainUtil.requirePerms(
        ['schema:update', 'aiware.schema.update'],
        context,
        false
      );
    }

    // check data registry
    const dataRegistry = await getDataRegistry(context, {
      id: input.dataRegistryId,
      organizationId: args.organizationId,
      filterByOwnership: ownershipType.mine
    });

    if (
      !dataRegistry ||
      (args.organizationId &&
        dataRegistry.organizationId !== args.organizationId)
    ) {
      throw new errors.NotFound({
        data: {
          objectId: input.dataRegistryId,
          objectName: 'DataRegistry'
        }
      });
    }

    // validate schema status according to transition states
    const errorDetail = { objectId: input.id, objectName: 'Schema' };
    const noTransitionAvail = !schemaStateTransitions[input.status].length;
    if (noTransitionAvail) {
      throw new errors.InvalidInput({
        data: errorDetail,
        message: `schema with status "${input.status}" cannot be created as it has no transition available`
      });
    }

    const columnData = {
      id: input.id,
      org_id: args.organizationId,
      data_registry_metadata_id: input.dataRegistryId,
      major_version: input.majorVersion,
      minor_version: input.minorVersion,
      status: input.status
    };

    // stringify schema definition
    try {
      columnData.schema = JSON.stringify(schemaDefinition);
    } catch (err) {
      throw new errors.InternalServerError({
        message: 'cannot stringify schema definition',
        data: {
          originalError: err.message,
          errorId: errors.newErrorId() // for debugging purposes
        }
      });
    }

    const txResult = await dbWrite.tx('createSchema', async (tx) => {
      // Lock the data registry to serialize schema version creation
      await _lockDataRegistrySchemaVersioning(tx, input.dataRegistryId);

      // Check for duplicates AFTER acquiring lock
      const existingById = await _findExistingSchemaById(tx, input.id);
      if (existingById) {
        throw new errors.ResourceConflict({
          data: errorDetail,
          message: 'duplicate schema ID'
        });
      }

      const existingByVersion = await _findExistingSchemaByVersion(
        tx,
        input.dataRegistryId,
        input.majorVersion,
        input.minorVersion
      );
      if (existingByVersion) {
        throw new errors.ResourceConflict({
          data: errorDetail,
          message: `a schema with version ${input.majorVersion}.${input.minorVersion} already exists`
        });
      }

      // if we are creating a schema in published state, we need to emit schema publish
      // event as well as creating a storage table
      if (input.status === 'published') {
        const createdSchema = await handleSchemaCreationWithPublishedStatus(
          tx,
          input,
          dataRegistry,
          columnData,
          currentUser,
          context
        );
        return { schema: createdSchema, isPublished: true };
      }

      // all other statuses
      const result = await createNewSchema(columnData, currentUser, tx);
      return { schema: result, isPublished: false };
    });

    // Post-transaction operations: RBAC, events, cache
    const orgId = args.organizationId || _.get(args, 'input.organizationId');
    const rbacArgs = {
      objectId: txResult.schema.id,
      organizationId: orgId,
      resourceType: 'SDOSchema'
    };

    await rbacAuthBll.addDefaultACEsToResources(context, rbacArgs);

    // Emit events and update properties for published schemas
    if (txResult.isPublished) {
      emitSchemaEvent(
        context,
        eventsMap.StructuredDataRegistryCreate,
        txResult.schema,
        dataRegistry,
        false
      );
      emitPublishSchemaEvent(context, txResult.schema, dataRegistry);
      try {
        await updateSchemaProperties(txResult.schema);
      } catch (err) {
        logger.error(
          `Failed to update schema properties for schema ${txResult.schema.id}, ` +
          `but schema was published successfully`,
          err
        );
      }
    }

    // clear cache
    _clearCache(null, input.dataRegistryId);

    return txResult.schema;
  }

  async function handleSchemaCreationWithPublishedStatus(
    connection,
    input,
    dataReg,
    columnData,
    user,
    context
  ) {
    const fnName = 'handleSchemaCreationWithPublishedStatus';
    const { id, definition: schemaDefinition } = input;
    // 1. validate schema
    if (!mainUtil.isJSON(schemaDefinition)) {
      throw new errors.InvalidInput({
        message: `Schema has to be a JSON object`
      });
    }
    if (!schemaDefinition.properties) {
      throw new errors.InvalidInput({
        message: `You have to define at least one field in the schema`
      });
    }

    // 2. create or inherit storage for published schema
    // For minor versions, inherit storageName from the latest published/inactive
    // schema of the same major version.
    let storageName;
    const isMinorVersion = input.minorVersion > 0;
    if (isMinorVersion) {
      storageName = await _getInheritedStorageName(context, {
        organizationId: input.organizationId,
        dataRegistryMetadataId: input.dataRegistryId,
        majorVersion: input.majorVersion
      });
    }
    // If no storageName inherited (new major version or first schema), create new storage
    if (!storageName) {
      storageName = assemblePrettyName(input, dataReg);
      await createTable(storageName);
      logger.debug(
        `${fnName}, Created SDO table ${storageName} for schema: ${id}`
      );
    }
    columnData.storage_name = storageName;

    // 3. create schema within transaction
    const createdSchema = await createNewSchema(columnData, user, connection);
    return createdSchema;
  }

  async function createNewSchema(cols, user, connection = dbWrite) {
    try {
      return await insertNewSchema(cols, user, connection);
    } catch (err) {
      logger.error(`Failed to create a new schema. ID: ${cols.id}`, err);
      throw err;
    }
  }

  function insertNewSchema(entity, currentUser, connection = dbWrite) {
    const now = moment.utc();
    checkId(entity.id);
    checkId(entity.data_registry_metadata_id);

    if (!entity.status) {
      throw new errors.InvalidInput({
        objectId: entity.id,
        objectName: 'Schema',
        data: `request missing "status" field`
      });
    }

    entity.created_by = currentUser;
    entity.modified_by = currentUser;
    entity['"createdAt"'] = now;
    entity['"updatedAt"'] = now;

    const { sql, values } = mainUtil.makeInsertSql(
      SCHEMA.tableName,
      entity,
      SCHEMA.columns
    );

    return one(connection, sql, values, 'Schema', entity.id);
  }

  /**
   * This function handles the creation and updating of schemas for a registry. We do not allow users to update an
   * available/paused schema so we automatically create a new draft. If a draft already exists then we update the
   * existing draft. If no schemas exist for a registry then we create draft 1.0.
   *
   * @param context
   * @param args
   * @returns {Promise<*>}
   */
  async function upsertSchemaDraft(context, args) {
    const { input } = args;
    checkId(input.dataRegistryId);

    // structured data mutations were never secured with functional
    // permissions. since we can't do that now without breaking clients,
    // we'll require schema:update explicitly here to prevent arbitrary
    // internal tokens from updataing schemas.
    // prior to VTN-14474, internal tokens could not proceed past this
    // point.
    if (!args.organizationId) {
      mainUtil.requirePerms(
        ['schema:update', 'aiware.schema.update'],
        context,
        false
      );
    }

    const dataRegistry = await getDataRegistry(context, {
      id: input.dataRegistryId,
      organizationId: args.organizationId,
      filterByOwnership: ownershipType.mine
    });

    if (
      !dataRegistry ||
      (args.organizationId &&
        dataRegistry.organizationId !== args.organizationId)
    ) {
      throw new errors.NotFound({
        data: {
          objectId: input.dataRegistryId,
          objectName: 'DataRegistry'
        }
      });
    }

    const schema = JSON.stringify(input.schema);
    const currentUser = _getUserIdFromContext(context);

    const additionalFields = {};
    if (!_.isUndefined(input.encryptedProperties)) {
      additionalFields.encrypted_properties = input.encryptedProperties;
    }
    if (!_.isUndefined(input.queryExcludedProperties)) {
      additionalFields.query_excluded_properties =
        input.queryExcludedProperties;
    }

    const txResult = await dbWrite.tx('upsertSchemaDraft', async (tx) => {
      await _lockDataRegistrySchemaVersioning(tx, input.dataRegistryId);

      const latestForMajor = await _getLatestSchemaByMajor(
        tx,
        input.dataRegistryId,
        input.majorVersion
      );

      if (latestForMajor) {
        if (latestForMajor.status === 'draft') {
          const updated = await updateDBSchemaDefinition(
            latestForMajor.id,
            schema,
            currentUser,
            additionalFields,
            tx
          );
          return { schema: updated, createdNewDraft: false };
        }

        const entity = {
          org_id: args.organizationId,
          data_registry_metadata_id: input.dataRegistryId,
          major_version: latestForMajor.majorVersion,
          minor_version: latestForMajor.minorVersion + 1,
          storage_name: latestForMajor.storageName,
          schema,
          ...additionalFields
        };
        const draftResult = await _createOrReuseDraft(
          tx,
          entity,
          currentUser,
          additionalFields
        );
        return {
          schema: draftResult.schema,
          createdNewDraft: draftResult.createdNewDraft
        };
      }

      const latestOverall = await _getLatestSchemaAnyMajor(
        tx,
        input.dataRegistryId
      );
      if (latestOverall) {
        if (latestOverall.status === 'draft') {
          const updated = await updateDBSchemaDefinition(
            latestOverall.id,
            schema,
            currentUser,
            additionalFields,
            tx
          );
          return { schema: updated, createdNewDraft: false };
        }

        const entity = {
          org_id: args.organizationId,
          data_registry_metadata_id: input.dataRegistryId,
          major_version: latestOverall.majorVersion,
          minor_version: latestOverall.minorVersion + 1,
          storage_name: latestOverall.storageName,
          schema,
          ...additionalFields
        };
        const draftResult = await _createOrReuseDraft(
          tx,
          entity,
          currentUser,
          additionalFields
        );
        return {
          schema: draftResult.schema,
          createdNewDraft: draftResult.createdNewDraft
        };
      }

      const firstDraftEntity = {
        org_id: args.organizationId,
        data_registry_metadata_id: input.dataRegistryId,
        major_version: 1,
        minor_version: 0,
        schema,
        ...additionalFields
      };

      const firstDraftResult = await _createOrReuseDraft(
        tx,
        firstDraftEntity,
        currentUser,
        additionalFields
      );

      return {
        schema: firstDraftResult.schema,
        createdNewDraft: firstDraftResult.createdNewDraft
      };
    });

    if (txResult.createdNewDraft) {
      const rbacArgs = {
        objectId: txResult.schema.id,
        organizationId: args.organizationId,
        resourceType: 'SDOSchema'
      };
      await rbacAuthBll.addDefaultACEsToResources(context, rbacArgs);
    }

    _clearCache(null, input.dataRegistryId);
    return txResult.schema;
  }

  async function _lockDataRegistrySchemaVersioning(connection, dataRegistryId) {
    const sql = `
      SELECT id
      FROM ${DATA_REGISTRY.tableName}
      WHERE id = $1 AND deleted_at IS NULL
      FOR UPDATE
    `;
    const rows = await connection.query(sql, [dataRegistryId]);
    if (_.isEmpty(rows)) {
      throw new errors.NotFound({
        data: {
          objectId: dataRegistryId,
          objectName: 'DataRegistry'
        }
      });
    }
  }

  async function _getLatestSchemaByMajor(
    connection,
    dataRegistryId,
    majorVersion
  ) {
    const sql = `
      SELECT ${mainUtil.makeSelectClause(SCHEMA.columns)}
      FROM ${SCHEMA.tableName}
      WHERE data_registry_metadata_id = $1
        AND major_version = $2
        AND "deletedAt" IS NULL
      ORDER BY minor_version DESC, "createdAt" DESC
      LIMIT 1
    `;
    const rows = await connection.query(sql, [dataRegistryId, majorVersion]);
    return _.isEmpty(rows) ? null : rows[0];
  }

  async function _getLatestSchemaAnyMajor(connection, dataRegistryId) {
    const sql = `
      SELECT ${mainUtil.makeSelectClause(SCHEMA.columns)}
      FROM ${SCHEMA.tableName}
      WHERE data_registry_metadata_id = $1
        AND "deletedAt" IS NULL
      ORDER BY major_version DESC, minor_version DESC, "createdAt" DESC
      LIMIT 1
    `;
    const rows = await connection.query(sql, [dataRegistryId]);
    return _.isEmpty(rows) ? null : rows[0];
  }

  async function _findExistingSchemaByVersion(
    connection,
    dataRegistryId,
    majorVersion,
    minorVersion
  ) {
    const sql = `
      SELECT ${mainUtil.makeSelectClause(SCHEMA.columns)}
      FROM ${SCHEMA.tableName}
      WHERE data_registry_metadata_id = $1
        AND major_version = $2
        AND minor_version = $3
        AND "deletedAt" IS NULL
      ORDER BY
        CASE WHEN status = 'draft' THEN 0 ELSE 1 END,
        "createdAt" DESC
      LIMIT 1
    `;
    const rows = await connection.query(sql, [
      dataRegistryId,
      majorVersion,
      minorVersion
    ]);
    return _.isEmpty(rows) ? null : rows[0];
  }

  async function _findExistingSchemaById(connection, schemaId) {
    const sql = `
      SELECT ${mainUtil.makeSelectClause(SCHEMA.columns)}
      FROM ${SCHEMA.tableName}
      WHERE id = $1
        AND "deletedAt" IS NULL
      LIMIT 1
    `;
    const rows = await connection.query(sql, [schemaId]);
    return _.isEmpty(rows) ? null : rows[0];
  }

  async function _createOrReuseDraft(
    connection,
    entity,
    currentUser,
    additionalFields
  ) {
    const existing = await _findExistingSchemaByVersion(
      connection,
      entity.data_registry_metadata_id,
      entity.major_version,
      entity.minor_version
    );

    if (existing) {
      if (existing.status === 'draft') {
        const updated = await updateDBSchemaDefinition(
          existing.id,
          entity.schema,
          currentUser,
          additionalFields,
          connection
        );
        return { schema: updated, createdNewDraft: false };
      }

      logger.warn(
        `upsertSchemaDraft reuse existing non-draft schema version ${existing.majorVersion}.${existing.minorVersion} for dataRegistry ${existing.dataRegistryMetadataId}`
      );
      return { schema: existing, createdNewDraft: false };
    }

    const created = await createNewDraft(entity, currentUser, connection);
    return { schema: created, createdNewDraft: true };
  }

  function createNewDraft(entity, currentUser, connection = dbWrite) {
    const now = moment.utc();

    entity.id = uuid.v4();
    entity.created_by = currentUser;
    entity.modified_by = currentUser;
    entity['"createdAt"'] = now;
    entity['"updatedAt"'] = now;
    entity.status = 'draft';

    const { sql, values } = mainUtil.makeInsertSql(
      SCHEMA.tableName,
      entity,
      SCHEMA.columns
    );
    return one(connection, sql, values, 'Schema', entity.id);
  }

  function updateDBSchemaDefinition(
    id,
    schema,
    currentUser,
    additionalFields,
    connection = dbWrite
  ) {
    const whereClause = `id = $1`;
    const columnData = {
      schema,
      modified_by: currentUser,
      ...additionalFields
    };
    return updateDBSchema(columnData, whereClause, [id], connection);
  }

  function updateDBSchema(
    columnData,
    whereClause,
    whereValues = [],
    connection = dbWrite
  ) {
    const { sql, values } = mainUtil.makeUpdateSql(
      SCHEMA.tableName,
      columnData,
      SCHEMA.columns,
      whereClause,
      whereValues.length
    );
    return one(connection, sql, whereValues.concat(values), '?', 'Schema');
  }

  function assemblePrettyName(schema, metaData) {
    const shortId = randomstring.generate({
      charset: 'alphanumeric',
      length: 10,
      readable: true,
      capitalization: 'lowercase'
    });
    const safeName = metaData.name
      .replace(/([^a-z0-9]+)/gi, '_')
      .substring(0, 10);

    const prettyName = _.snakeCase(
      `sdo_${safeName}_${schema.majorVersion}_${shortId}`
    );
    return prettyName;
  }

  async function getTableNameBySchemaId(schemaId) {
    const schema = await getSchemaRowFromCache(schemaId);
    if (!schema) {
      throw new errors.NotFound({
        message: 'Schema not found',
        data: {
          objectId: schemaId,
          objectType: 'Schema'
        }
      });
    }
    return schema.storageName;
  }

  async function createTable(storageName) {
    const createTable = `CREATE TABLE ${storageName}(
	id uuid NOT NULL
		CONSTRAINT ${storageName}_pkey
			PRIMARY KEY,
	data_registry_id uuid NOT NULL
		CONSTRAINT ${storageName}_data_registry_id_fkey
			REFERENCES ${SCHEMA.tableName}
				ON UPDATE CASCADE,
	data jsonb,
	created_by varchar(3000),
	modified_by varchar(3000),
	organization_id integer DEFAULT 7682 NOT NULL,
  application_id uuid,
  dataset_id uuid,
	"createdAt" timestamp WITH TIME ZONE NOT NULL,
	"updatedAt" timestamp WITH TIME ZONE NOT NULL
);

CREATE INDEX ${storageName}_data_registry_id
	on ${storageName} (data_registry_id)
;

CREATE INDEX  ${storageName}_organization_id
	on ${storageName} (organization_id)
;

CREATE INDEX  ${storageName}_created_at
	on ${storageName} ("createdAt" desc)
;

CREATE TRIGGER ${storageName}_trigger
BEFORE INSERT ON ${storageName}
FOR EACH ROW EXECUTE PROCEDURE public.sdo_partition_function();`;
    return await dbWrite.query(createTable);
  }

  /**
   * emit event for structured registry data
   * @param {*} context the current context
   * @param {*} eventTypeInfo the event type info (events-map)
   * @param {*} schema the schema
   * @param {*} emitPrivateEvent emit the private event or not
   * @param {*} emitPublicEvent emit the public event or not
   * @param {*} metaData the metaData
   * @param {*} error the error triggered if exists
   */
  function emitSchemaEvent(
    context,
    eventTypeInfo,
    schema,
    metaData,
    emitPrivateEvent = true,
    emitPublicEvent = true,
    error = null
  ) {
    const actionEventMap = {
      [eventsMap.StructuredDataRegistryCreate.name]: 'create',
      [eventsMap.StructuredDataRegistryUpdate.name]: 'update',
      [eventsMap.StructuredDataRegistryDelete.name]: 'delete'
    };
    let event = _.cloneDeep(schema);
    event.dataRegistryId = event.id;
    event.metaData = metaData;
    const eName = actionEventMap[eventTypeInfo.name];
    // actionInfo
    event.actionInfo = messageUtil.buildActionInfo(
      event.dataRegistryId,
      error,
      actionEventMap[eventTypeInfo.name],
      !error ? 'success' : 'failure',
      !error
        ? `${eName.charAt(0).toUpperCase() + eName.slice(1)}d data registry ${schema.id}`
        : `Failed to ${eName} data registry ${schema.id ? schema.id : 'undefined'}`
    );
    messageProducer.publishEvent(
      context,
      eventTypeInfo,
      event,
      emitPrivateEvent,
      emitPublicEvent
    );
  }

  /**
   * emit a private event when structured registry data is published for indexing
   * @param {*} context the current context
   * @param {*} schema the schema
   * @param {*} metaData the metaData
   */
  function emitPublishSchemaEvent(context, schema, metaData) {
    // the current logic is using `StructuredDataRegistryCreate` event
    // to create index or update index mapping in core-eventing
    const eventTypeInfo = eventsMap.StructuredDataRegistryCreate;
    return emitSchemaEvent(
      context,
      eventTypeInfo,
      schema,
      metaData,
      true, // emit a private event only
      false
    );
  }

  async function checkCompatibility(context, schema) {
    //find previous version of the schema
    const publishedSchemas = await getSchemas(context, {
      dataRegistryMetadataId: schema.dataRegistryMetadataId,
      majorVersion: schema.majorVersion,
      status: ['published'],
      limit: 1,
      _skipAccessCheck: true
    });
    //check if old & new versions are compatible
    if (publishedSchemas.count > 0) {
      diffTool.validateSchemaCompatibility(
        publishedSchemas.records[0].schema,
        schema.schema
      );
    }
  }

  /**
   * Used to publish, pause, and delete schemas
   *
   * @param context
   * @param args
   * @returns {Promise<*>}
   */
  async function updateSchemaState(context, args) {
    const { input } = args;
    let inputValidationError, schema, originalStatus, columnData;
    try {
      checkId(input.id);

      schema = await getSchema(context, {
        organizationId: args.organizationId,
        id: input.id
      });

      const authInfo =
        context._authInfo || context.userInfo || context.tokenInfo || {};
      const isInternalAPIKey = mainUtil.isInternalAPIKey(authInfo);
      const isSuperAdmin = resUtil.isSuperAdmin(authInfo);

      if (
        !isInternalAPIKey &&
        !isSuperAdmin &&
        schema.organizationId !== args.organizationId
      ) {
        throw new errors.NotAllowed({
          message:
            'The authenticated user or token does not have privileges ' +
            'to update the state of a schema that belongs to another organization.'
        });
      }

      if (!schemaStateTransitions[schema.status].includes(input.status)) {
        throw new errors.InvalidInput({
          message: `Invalid status transition from ${schema.status} to ${input.status} for schema: ${schema.id}`
        });
      }

      originalStatus = schema.status;
      columnData = { status: input.status };
    } catch (err) {
      inputValidationError = err;
    }

    if (input.status === 'published') {
      let dataRegistry;
      // update old available to inactive and set current schema to active
      try {
        // throw inside try to catch and emit respective SDO event
        if (inputValidationError) throw inputValidationError;

        dataRegistry = await getDataRegistry(context, {
          id: schema.dataRegistryMetadataId,
          organizationId: args.organizationId,
          filterByOwnership: ownershipType.mine
        });

        if (!(schema.schema instanceof Object)) {
          throw new errors.InvalidInput({
            message: `Schema has to be a JSON object`
          });
        }
        if (!schema.schema.properties) {
          throw new errors.InvalidInput({
            message: `You have to define at least one field in the schema`
          });
        }

        if (originalStatus === 'draft') {
          if (!input.breakingChanges) {
            await checkCompatibility(context, schema);
          }

          let { storageName } = schema;
          let shouldCreateNewStorageName = false;

          const isMajorVersion = schema.minorVersion === 0;
          const inheritedStorageName = await _getInheritedStorageName(context, {
            organizationId: args.organizationId,
            dataRegistryMetadataId: schema.dataRegistryMetadataId,
            majorVersion: schema.majorVersion
          });
          const isFirstOfMajorVersion = inheritedStorageName === null;

          if (input.breakingChanges) {
            storageName = null;
            shouldCreateNewStorageName = true;

            if (!(schema.majorVersion === 1 && schema.minorVersion === 0)) {
              const maxSchemaArg = {
                organizationId: args.organizationId,
                dataRegistryMetadataId: schema.dataRegistryMetadataId,
                orderBy: [
                  {
                    field: 'majorVersion',
                    direction: 'desc'
                  }
                ],
                limit: 1,
                _skipAccessCheck: true
              };

              const maxVersion = await getSchemas(context, maxSchemaArg);
              if (maxVersion.count === 0) {
                throw new errors.ServiceFailure({
                  message: 'Failed to get newest majorVersion schema'
                });
              }

              columnData.major_version = maxVersion.records[0].majorVersion + 1;
              columnData.minor_version = 0;
            }
          } else if (isMajorVersion || isFirstOfMajorVersion) {
            // Major version (x.0) OR first schema of a major version (e.g., v2.2 with no v2.0/v2.1)
            // automatically gets new storage even without breakingChanges flag.
            // Reset storageName to null regardless of current value to force new storage creation.
            // Note: In typical flows, drafts do not have a storageName, but this reset ensures
            // correct behavior even if storageName is already present (e.g., edge cases or migrations).
            storageName = null;
            shouldCreateNewStorageName = true;
          }

          // Inherit storageName from latest schema of the same major version
          if (
            !storageName &&
            !shouldCreateNewStorageName &&
            inheritedStorageName
          ) {
            storageName = inheritedStorageName;
            columnData.storage_name = storageName;
          }
          if (!storageName) {
            storageName = assemblePrettyName(schema, dataRegistry);
            await createTable(storageName);
            logger.debug(
              `Created SDO table ${storageName} for schema: ${schema.id}`
            );
            columnData.storage_name = storageName;
          }
        }

        // update the current schema
        _clearCache(schema.id, schema.dataRegistryMetadataId);
        const updatedSchema = await updateDBSchema(columnData, `id = $1`, [
          schema.id
        ]);
        // clear cache
        _clearCache(schema.id, schema.dataRegistryMetadataId);

        // deactivate other schemas by the major version
        await _deactivateSchemas(context, updatedSchema);

        emitSchemaEvent(
          context,
          eventsMap.StructuredDataRegistryUpdate,
          updatedSchema,
          dataRegistry
        );

        // emit a private event for the published schema for indexing
        emitPublishSchemaEvent(context, updatedSchema, dataRegistry);

        await updateSchemaProperties(updatedSchema);
        return updatedSchema;
      } catch (err) {
        const auditLogPayload =
          err.name === 'invalid_input' ||
          (err.name === 'not_found' && _.includes(err.message, 'Invalid ID'))
            ? _.omit(input, 'id')
            : input;
        emitSchemaEvent(
          context,
          eventsMap.StructuredDataRegistryUpdate,
          auditLogPayload,
          dataRegistry,
          false,
          true,
          err
        );
        logger.error(`Failed to publish schema: ${input.id}`, err);
        // if an exception was thrown during input validation - rethrow
        if (inputValidationError) {
          throw inputValidationError;
        }
        // or throw a default error
        throw new errors.ServiceFailure({
          message: 'Failed to promote schema to available'
        });
      } // Delete schema
    } else if (input.status === 'deleted') {
      const now = moment.utc();
      try {
        // throw inside try to catch, emit respective SDO event and rethrow
        if (inputValidationError) throw inputValidationError;
        // Delete the current schema, if this was the last schema in the registry then delete the registry
        columnData['"deletedAt"'] = now;

        _clearCache(schema.id, schema.dataRegistryMetadataId);
        const deletedSchema = await updateDBSchema(columnData, `id = $1`, [
          schema.id
        ]);
        const remainingSchemas = await getSchemas(context, {
          dataRegistryMetadataId: deletedSchema.dataRegistryMetadataId,
          limit: 1
        });
        if (remainingSchemas.count === 0) {
          let { sql, values } = mainUtil.makeUpdateSql(
            DATA_REGISTRY.tableName,
            { deleted_at: now, modified_by: _getUserIdFromContext(context) },
            DATA_REGISTRY.columns,
            'id = $1',
            1
          );
          values.unshift(deletedSchema.dataRegistryMetadataId);
          sql += ` DELETE FROM ${SCHEMA_PROPERTIES.tableName}
          WHERE data_registry_metadata_id = $1`;

          await dbWrite.query(sql, values);
          logger.debug(
            `Deleted data registry id ${deletedSchema.dataRegistryMetadataId}`
          );
        }
        // clear cache
        _clearCache(schema.id, schema.dataRegistryMetadataId);

        // emit public event: deleted
        emitSchemaEvent(
          context,
          eventsMap.StructuredDataRegistryDelete,
          deletedSchema,
          null
        );

        return deletedSchema;
      } catch (err) {
        logger.error(`Failed to delete schema id: ${input.id}`, err);
        const auditLogPayload =
          err.name === 'invalid_input' ||
          (err.name === 'not_found' && _.includes(err.message, 'Invalid ID'))
            ? _.omit(input, 'id')
            : input;
        // emit public event: deleted
        emitSchemaEvent(
          context,
          eventsMap.StructuredDataRegistryDelete,
          auditLogPayload,
          null,
          true,
          true,
          err
        );
        // if an exception was thrown during input validation - rethrow
        if (inputValidationError) {
          throw inputValidationError;
        }
        // or throw a default error
        throw new errors.ServiceFailure({
          message: 'Failed to delete schema'
        });
      }
    } else {
      // if we are just deactivating a schema
      _clearCache(schema.id, schema.dataRegistryMetadataId);
      const updatedSchema = await updateDBSchema(columnData, `id = $1`, [
        schema.id
      ]);
      // clear cache
      _clearCache(schema.id, schema.dataRegistryMetadataId);

      return updatedSchema;
    }
  }

  /**
   * update schema state to inactive by the major version
   * @param {*} context the context
   * @param {*} schema the latest published schema
   */
  async function _deactivateSchemas(context, schema) {
    // get the schemas that need to be updated
    const getSql = `SELECT ${mainUtil.makeSelectClause(SCHEMA.columns)}
      FROM ${SCHEMA.tableName}
      WHERE org_id = $1 AND data_registry_metadata_id = $2 AND major_version = $3 AND id <> $4 AND status = 'published'
    `;
    const whereValues = [
      schema.organizationId,
      schema.dataRegistryMetadataId,
      schema.majorVersion,
      schema.id
    ];
    const schemaRows = await dbRead.query(getSql, whereValues);
    if (!_.isArray(schemaRows) || _.isEmpty(schemaRows)) {
      return;
    }
    // clear cache
    _clearCache(
      schemaRows.map((o) => o.id),
      schema.dataRegistryMetadataId
    );

    // update other schemas by the major version
    const { sql, values } = mainUtil.makeUpdateSql(
      SCHEMA.tableName,
      { status: 'inactive' },
      SCHEMA.columns,
      `org_id = $1 AND data_registry_metadata_id = $2 AND major_version = $3 AND id <> $4 AND status = 'published'`,
      4
    );
    const updatedRows = await dbWrite.query(sql, whereValues.concat(values));
    logger.debug(`Deactivated ${updatedRows.length} schema(s)`);

    // clear cache
    _clearCache(
      updatedRows.map((o) => o.id),
      schema.dataRegistryMetadataId
    );
  }

  async function getSchemaProperties(context, args) {
    const values = [];
    const where = [];
    if (args.search) {
      const searchTerm = `%${mainUtil.sqlEscapeForLIKE(args.search)}%`;
      const valIndex = values.push(searchTerm);
      where.push(`(path ILIKE $${valIndex} OR title ILIKE $${valIndex})`);
    }

    if (!_.isEmpty(args.dataRegistryVersion)) {
      const drFilters = [];
      args.dataRegistryVersion.forEach(({ id, majorVersion }) => {
        drFilters.push(
          `(data_registry_metadata_id = $${values.push(id)}
            AND major_version = $${values.push(majorVersion)})`
        );
      });
      where.push(drFilters.join(' OR '));
    }

    if (args.schemaId) {
      where.push(``);
    }

    // Order by needs to be performance tested
    const sql = `SELECT ${mainUtil.makeSelectClause(SCHEMA_PROPERTIES.columns)}
                   FROM ${SCHEMA_PROPERTIES.tableName}
                   ${_.isEmpty(where) ? '' : `WHERE ${where.join(' AND ')}`}
                   ORDER BY path asc
                   LIMIT ${args.limit || 30}  OFFSET ${args.offset || 0}`;
    const rows = await dbRead.query(sql, values);
    return mainUtil.toPage(args, rows);
  }

  async function updateSchemaProperties(schema) {
    const properties = extractProperties(schema.schema);
    const values = [
      schema.dataRegistryMetadataId,
      schema.majorVersion,
      schema.storageName
    ];
    const valuesClauses = [];

    Object.entries(properties).forEach(([key, val]) => {
      valuesClauses.push(
        `($1, $2, $3, $${values.push(key)}, $${values.push(
          val.type
        )}, $${values.push(val.title)})`
      );
    });

    const sql = `
    DELETE FROM ${SCHEMA_PROPERTIES.tableName}
     WHERE data_registry_metadata_id = $1 AND major_version = $2;
    INSERT INTO ${SCHEMA_PROPERTIES.tableName}
      (${Object.keys(SCHEMA_PROPERTIES.columns).join(', ')})
      VALUES ${valuesClauses.join(',')};`;

    return await dbWrite.query(sql, values);
  }

  // This only supports simple schemas for now and does not handle $ref
  function extractProperties(object, path, properties = {}) {
    if (_.isEmpty(object.properties)) {
      return properties;
    }

    Object.entries(object.properties).forEach(([key, val]) => {
      const newPath = path ? `${path}.${key}` : key;
      if (val.type === 'object') {
        Object.assign(properties, extractProperties(val, newPath));
      } else if (
        val.type === 'array' &&
        _.get(val, 'items.type') === 'object'
      ) {
        properties[newPath] = {
          type: val.type,
          title: val.title
        };
        Object.assign(properties, extractProperties(val.items, newPath));
      } else {
        properties[newPath] = {
          type:
            val.type === 'array'
              ? _.get(val, 'items.type', val.type)
              : val.type,
          title: val.title
        };
      }
    });

    return properties;
  }

  async function deleteStructuredData(args, context) {
    try {
      const { input } = args;
      // Validate inputs...
      [
        ['id', isUUID],
        ['schemaId', isUUID],
        ['organizationId', (orgId) => {
          const orgIdNumber = _.toNumber(orgId);
          if (_.isNaN(orgIdNumber)) {
            return false;
          }
          return _.isNumber(orgIdNumber);
        }]
      ].forEach(function ([field, isFn]) {
        if (!isFn(input[field])) {
          throw new errors.InvalidInput({
            message: `The provided value, ${input[field]}, is not valid.`,
            data: {
              field: field,
              type: 'StructuredDataObject',
              value: input[field]
            }
          });
        }
      });
      const { schemaId, id, organizationId } = input;

      const tableName = await getTableNameBySchemaId(schemaId);

      const resp = await dbRead.query(
        `SELECT  ${mainUtil.makeSelectClause(
          SDO.columns
        )}  FROM ${tableName} WHERE id = $1;`,
        [id]
      );
      // Default an object for the SDO
      let entity = {
        id: id,
        organizationId: organizationId,
        dataRegistryId: schemaId,
        data: { id: id }
      };

      // Error check.
      if (resp.length !== 0) {
        let found = false;
        for (const row of resp) {
          const item = mapper.camelizeRootKeys(row);
          if (item && _.toNumber(item.organizationId) === _.toNumber(organizationId)) {
            found = true;
            break;
          }
        }

        // This user does not have access to this SDO ID
        if (!found) {
          throw new errors.NotFound({
            message: 'This user does not have access to this SDO ID.',
            data: {
              field: id,
              type: 'StructuredDataObject',
              value: id
            }
          });
        }

        // delete SDO...
        await dbWrite.any(
          `DELETE FROM ${tableName} WHERE id = $1 AND organization_id = $2;`,
          [id, organizationId]
        );

        // map entity model
        entity = mapper.camelizeRootKeys(resp[0]);

        // remove ACEs from deleted resource
        const rbacArgs = {
          resourceType: 'SDO',
          resourceIds: [id],
          dataRegistryId: schemaId,
          organizationId: organizationId
        };

        try {
          await rbacAuthBll.removeACEsFromResources(context, rbacArgs);
        } catch (err) {
          logger.error('failed to delete ACEs:' + err);
        }
      }
      emitStructuredDataEvent(
        context,
        { id, schemaId, organizationId, entity },
        null,
        'delete'
      );
      return { id };
    } catch (err) {
      const { schemaId, id, organizationId } = _.get(args, 'input', {});
      emitStructuredDataEvent(
        context,
        {
          id: id,
          schemaId: schemaId,
          organizationId: organizationId
        },
        err,
        'delete'
      );
      throw err;
    }
  }

  async function one(connection, sql, values, id, type) {
    const res = await connection.query(sql, values);
    if (res.length < 1) {
      throw new errors.NotFound({
        message: type + ' ' + id + ' was not found.',
        data: {
          objectId: id,
          objectType: type
        }
      });
    }
    return res[0];
  }

  async function getDataRegistryToken(context, args = {}) {
    const { organizationId, dataRegistryMetadataId, applicationId } = args;

    if (_.isNil(organizationId) || _.isNil(dataRegistryMetadataId)) {
      throw new errors.InvalidInput({
        message: `Missing required fields orgId: ${organizationId}, dataRegistryId: ${dataRegistryMetadataId}`
      });
    }

    return jwt.sign(
      { organizationId, dataRegistryMetadataId, applicationId },
      serviceContext.config.jwt.secret,
      {
        expiresIn: _.get(config, 'jwt.sdoTokenTtlSec', 3600),
        jwtid: uuid.v4(),
        subject: 'structuredData'
      }
    );
  }

  async function _getUseEngineGrantFlag(context) {
    const requesterOrg = _.get(context, '_authInfo.organization');
    const useEngineGrant = await mainUtil.isEnableFeatureInOrganization(
      context,
      requesterOrg,
      _.get(requesterOrg, 'organizationId'),
      ['enablePackageGrantLogic', 'useEngineGrant'],
      true
    );
    return !!useEngineGrant;
  }

  /**
   * Get the storageName from the latest published/inactive schema of the same major version.
   * Used to inherit storageName when publishing a new minor version.
   *
   * @param {*} context the context
   * @param {Object} options - { organizationId, dataRegistryMetadataId, majorVersion }
   * @returns {Promise<string|null>} the storageName or null if not found
   */
  async function _getInheritedStorageName(context, options) {
    const { organizationId, dataRegistryMetadataId, majorVersion } = options;
    const existingSchemas = await getSchemas(context, {
      organizationId,
      dataRegistryMetadataId,
      majorVersion,
      status: ['published', 'inactive'],
      orderBy: [{ field: 'minorVersion', direction: 'desc' }],
      limit: 1,
      _skipAccessCheck: true
    });
    return existingSchemas.records?.[0]?.storageName || null;
  }

  function _addSqlWhereForSchemas(options, sqlWhere, sqlValues) {
    const { orgId, schemaIds, dataRegistryMetadataId } = options || {};
    let accessScope = _.get(options, 'accessScope', []);
    const hasAnyScope = _.includes(accessScope, 'any');
    let sqlOR = [];

    const conditionMapping = {
      granted: () => {
        const conditions = [];
        if (Array.isArray(schemaIds)) {
          conditions.push(`id = ANY($${sqlValues.push(schemaIds)}::uuid[])`);
        }
        return conditions;
      },
      owned: () => (orgId ? [`org_id = $${sqlValues.push(orgId)}`] : []),
      public: () => [
        'data_registry_metadata_id IN (SELECT id from data_registry_metadata WHERE is_public = true AND deleted_at IS NULL)'
      ]
    };

    if (hasAnyScope) {
      // when the useEngineGrant flag is turned on, return all all accessible schemas
      // if we filter by Any scope.
      accessScope = _.keys(conditionMapping);
    }

    for (const scope of accessScope) {
      const key = _.lowerCase(scope);
      if (_.isFunction(conditionMapping[key])) {
        const conditions = conditionMapping[key]();
        sqlOR.push(...conditions);
      }
    }

    const sqlAND = [];
    if (!_.isNil(dataRegistryMetadataId)) {
      sqlAND.push(
        `data_registry_metadata_id = $${sqlValues.push(dataRegistryMetadataId)}`
      );
    }
    if (sqlOR.length) {
      sqlAND.push(`(${sqlOR.join(' OR ')})`);
    }
    if (sqlAND.length) {
      sqlWhere.push(`${sqlAND.join(' AND ')}`);
    }
  }

  function encryptEntityProperties(entity, encryptedProperties) {
    encryptedProperties.forEach((prop) => {
      const propValue = _.get(entity.data, prop);
      if (propValue) {
        _.set(entity.data, prop, mainUtil.encryptText(propValue));
      }
    });
  }

  /**
   * Clear cache data by schemaId, registryId
   * @param {*} schemaId the schemaId
   * @param {*} registryId the registryId
   */
  function _clearCache(schemaId, registryId) {
    // schema data
    if (!_.isNil(schemaId)) {
      const schemaIds = _.isArray(schemaId) ? schemaId : [schemaId];
      schemaIds.forEach((sId) => {
        redisCache.clear(REDIS_TYPES.SCHEMA, sId);
      });
    }
    // registry data
    if (!_.isNil(registryId)) {
      redisCache.clear(REDIS_TYPES.DATA_REGISTRY, registryId);
      redisCache.clear(REDIS_TYPES.DATA_REGISTRY_WITH_SCHEMAS, registryId);
      redisCache.clear(
        REDIS_TYPES.DATA_REGISTRY_PUBLISHED_SCHEMA_ID,
        registryId
      );
    }
  }

  return {
    getSchema,
    getSchemas,
    createStructuredData,
    createStructuredDatasets,
    updateStructuredData,
    getStructuredDataObject,
    getStructuredDataObjects,
    deleteStructuredData,
    createSchemaMetadata,
    getDataRegistry,
    updateSchemaMetadata,
    getDataRegistries,
    createSchema,
    upsertSchemaDraft,
    updateSchemaState,
    schemaNextActions,
    getSchemaProperties,
    getDataRegistryToken,
    getSchemaRowFromCache,
    getDataRegistryFromCache,
    getDataRegistryWithSchemasFromCache,
    checkCompatibility,
    emitDataRegistryEvent,
    emitStructuredDataEvent,
    mapDateFilterField
  };
};
