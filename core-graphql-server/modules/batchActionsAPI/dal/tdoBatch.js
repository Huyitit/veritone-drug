const mapper = require('../../../dal/mapper');
const { v4: uuidv4 } = require('uuid');
const _ = require('lodash');
const humps = require('humps');
const pgp = require('pg-promise')();

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const mainUtil = require('../../../util.js')(config, serviceContext);
  const { InvalidInput } = require('../../../error')(serviceContext.config);

  // status for a batch
  const batchStatus = {
    creating: 'creating',
    created: 'created',
    failed: 'failed'
  };

  // status for a batch process
  const batchProcessStatus = {
    creating: 'creating',
    pending: 'pending',
    running: 'running',
    canceling: 'canceling',
    canceled: 'canceled',
    completed: 'completed',
    failed: 'failed'
  };

  let batchProcessTable = {
    batch_process_id: null,
    batch_id: null,
    status: null,
    process_definition: null,
    concurrency: null,
    completed_count: null,
    pending_count: null,
    running_count: null,
    failed_count: null,
    total_count: null,
    organization_id: null,
    date_created: null,
    date_modified: null,
    created_by: null,
    modified_by: null
  };

  let batchTable = {
    batch_id: null,
    batch_name: null,
    batch_selector: null,
    status: null,
    organization_id: null,
    created_by: null,
    modified_by: null,
    created_date: null,
    modified_date: null
  };

  let batchProcessItemTable = {
    batch_process_id: null,
    item_id: null,
    action_id: null,
    status: null
  };

  let batchItemTable = {
    batch_id: null,
    item_id: null
  };

  /**
   * insert a record as a reference of a tdo set
   *
   * @param {Object} context The request context
   * @param {Object} input
   **/
  async function insertBatch(context, input) {
    let columnData = {
      batch_id: uuidv4(),
      batch_name: input.name,
      batch_selector: input.batchSelector,
      status: input.status,
      organization_id: input.orgId
    };

    if (input.createdBy) {
      columnData.created_by = input.createdBy;
    }

    let { sql, values } = mainUtil.makeInsertSql(
      'job_new.batch',
      columnData,
      batchTable
    );

    return await serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.mapBatch
    );
  }

  /**
   * insert a record as a reference of a batch process.
   *
   * @param {Object} context The request context
   * @param {Object} input
   **/
  async function insertBatchProcess(context, input) {
    let columnData = {
      batch_process_id: uuidv4(),
      batch_id: input.batchId,
      status: input.status,
      process_definition: input.processDefinition,
      organization_id: input.orgId,
      concurrency: input.concurrency
    };

    if (input.pendingCount) {
      columnData.pending_count = input.pendingCount;
    }

    if (input.totalCount) {
      columnData.total_count = input.totalCount;
    }

    if (input.createdBy) {
      columnData.created_by = input.createdBy;
    }

    const { sql, values } = mainUtil.makeInsertSql(
      'job_new.batch_process',
      columnData,
      batchProcessTable
    );

    return await serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.mapBatchProcess
    );
  }

  /**
   * Get existing batch record by id and organizationId
   *
   * @param {Object} context The request context
   * @param {Object} input
   **/
  async function getBatch(context, input) {
    let where = [];
    let values = [];

    if (!input.id) {
      throw new InvalidInput({
        message: 'id is a mandatory input argument'
      });
    }

    if (input.organizationId) {
      mainUtil.addSqlWhere(
        'b.organization_id',
        input.organizationId,
        where,
        values
      );
    }

    mainUtil.addSqlWhere('b.batch_id', input.id, where, values);

    const selectClause = mainUtil.makeSelectClause(batchTable, 'b');
    const sql = `
      SELECT 
        ${selectClause}
      FROM job_new.batch b
      WHERE ${where.join(' AND ')}
    `;

    return await serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.mapBatch
    );
  }

  /**
   * Get one or more existing batch processes by id, ids, batchId or status
   *
   * @param {Object} context The request context
   * @param {Object} input
   **/
  async function getBatchProcesses(context, input) {
    let where = [];
    let values = [];

    const batchProcessId = input.id || input.ids || input.batchProcessId;
    if (batchProcessId) {
      mainUtil.addSqlWhere(
        'bp.batch_process_id',
        batchProcessId,
        where,
        values
      );
    }

    if (input.organizationId) {
      mainUtil.addSqlWhere(
        'bp.organization_id',
        input.organizationId,
        where,
        values
      );
    }

    if (_.get(input, 'status.length', 0) > 0) {
      mainUtil.addSqlWhere('bp.status', input.status, where, values);
    }

    if (input.batchId) {
      mainUtil.addSqlWhere('bp.batch_id', input.batchId, where, values);
    }

    mainUtil.addDateTimeFilters('bp', input, where, 'pg_ts', 1000);

    const selectClause = mainUtil.makeSelectClause(batchProcessTable, 'bp');

    let query = `
      SELECT
        ${selectClause}
      FROM
        job_new.batch_process bp
      WHERE
        ${where.join(' AND ')}
      `;

    if (_.get(input, 'orderBy.length', 0) > 0) {
      const orderParts = [];
      input.orderBy.forEach((field) => {
        const key = 'bp.' + humps.decamelize(field.field);
        orderParts.push(key + ' ' + field.direction);
      });
      query += `
       ORDER BY ${orderParts.join(', ')}`;
    }

    if (input.limit) {
      query += `
       LIMIT ${input.limit}`;
    }

    if (input.offset) {
      query += `
       OFFSET ${input.offset}`;
    }

    return await serviceContext.dbConnections['core'].write.map(
      query,
      values,
      mapper.mapBatchProcess
    );
  }

  /**
   * get an item that is member of a batch process.
   * items are saved in batch_process_item table.
   * The member status is going to depend on the job execution.
   *
   * @param {Object} context The request context
   * @param {Object} input
   **/
  async function getBatchProcessItem(context, input) {
    let values = [];
    let where = [];

    if (input.organizationId) {
      mainUtil.addSqlWhere(
        'bp.organization_id',
        input.organizationId,
        where,
        values
      );
    }

    if (input.batchProcessId) {
      mainUtil.addSqlWhere(
        'bpi.batch_process_id',
        input.batchProcessId,
        where,
        values
      );
    }

    if (input.tdoId) {
      mainUtil.addSqlWhere('bpi.item_id', input.tdoId, where, values);
    }

    if (input.actionId) {
      mainUtil.addSqlWhere('bpi.action_id', input.actionId, where, values);
    }

    if (input.status) {
      input.status = input.status === 'complete' ? 'completed' : input.status;
      mainUtil.addSqlWhere('bpi.status', input.status, where, values);
    }

    const selectClause = mainUtil.makeSelectClause(
      batchProcessItemTable,
      'bpi'
    );

    let sql = `
      SELECT 
        ${selectClause}
      FROM job_new.batch_process_item bpi 
      JOIN job_new.batch_process bp
        ON bp.batch_process_id = bpi.batch_process_id
      WHERE ${where.join(' AND ')}
    `;

    if (_.get(input, 'orderBy.length', 0) > 0) {
      const orderParts = [];
      input.orderBy.forEach((field) => {
        const key = 'bpi.' + humps.decamelize(field.field);
        orderParts.push(key + ' ' + field.direction);
      });
      sql += `
       ORDER BY ${orderParts.join(', ')}`;
    }

    if (input.limit) {
      sql += `
       LIMIT ${input.limit}`;
    }

    if (input.offset) {
      sql += `
       OFFSET ${input.offset}`;
    }

    return await serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.mapBatchProcessItem
    );
  }

  /**
   * insert new members of a batch.
   * members of a new batch are inserted in a massive way in table.
   *
   * @param {Object} context The request context
   * @param {Object} args
   **/
  async function insertBatchItem(context, args) {
    const items = args.tdoIds.map((tdo) => {
      return {
        batch_id: args.batchId,
        item_id: tdo
      };
    });
    const cs = new pgp.helpers.ColumnSet(['batch_id', 'item_id'], {
      table: {
        table: 'batch_item',
        schema: 'job_new'
      }
    });
    const sql = pgp.helpers.insert(items, cs);
    return await serviceContext.dbConnections['core'].write.map(sql);
  }

  /**
   * update a batch process record with a desired status.
   *
   * @param {Object} context The request context
   * @param {Object} input
   **/
  async function updateBatchProcess(context, input) {
    if (!input.batchProcessId) {
      throw new InvalidInput({
        message: `batchProcessId is a mandatory condition value`
      });
    }

    if (!input.organizationId) {
      throw new InvalidInput({
        message: 'organizationId is a mandatory condition value'
      });
    }

    if (!input.status) {
      throw new InvalidInput({
        message: `status is a mandatory input value`
      });
    }

    let columnData = {
      status: input.status
    };

    let conditionals = {};
    if (input.status === batchProcessStatus.pending) {
      columnData.running_count = 0;
      columnData.completed_count = 0;
      columnData.failed_count = 0;
      columnData.pending_count = '';

      conditionals = {
        pending_count: {
          transform: (columnName, columnValue) => {
            return `${columnName} = bp.total_count`;
          }
        }
      };
    }

    if (input.concurrency) {
      columnData.concurrency = input.concurrency;
    }

    if (input.processDefinition) {
      columnData.process_definition = input.processDefinition;
    }

    if (input.modifiedBy) {
      columnData.modified_by = input.modifiedBy;
    }

    const where = `bp.batch_process_id = '${input.batchProcessId}' AND bp.organization_id = '${input.organizationId}'`;
    const { sql, values } = mainUtil.makeUpdateSql(
      `job_new.batch_process AS bp`,
      columnData,
      batchProcessTable,
      where,
      0,
      false,
      {},
      {},
      conditionals
    );

    return await serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.mapBatchProcess
    );
  }

  /**
   * get a list of members for a batch
   *
   * @param {Object} context The request context
   * @param {Object} input
   **/
  async function getBatchItems(context, input) {
    if (!input.batchId || !input.organizationId) {
      throw new InvalidInput({
        message: `batchId and organizationId are mandatory input values`
      });
    }
    let values = [];
    let where = [];

    mainUtil.addSqlWhere('bi.batch_id', input.batchId, where, values);
    mainUtil.addSqlWhere(
      'b.organization_id',
      input.organizationId,
      where,
      values
    );

    const selectClause = mainUtil.makeSelectClause(batchItemTable, 'bi');
    let sql = `
      SELECT 
        ${selectClause}
      FROM job_new.batch_item bi
      JOIN job_new.batch b 
        ON b.batch_id = bi.batch_id
      WHERE ${where.join(' AND ')}
    `;

    if (input.limit) {
      sql += `
       LIMIT ${input.limit}`;
    }

    if (input.offset) {
      sql += `
       OFFSET ${input.offset}`;
    }

    return await serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.mapBatchItem
    );
  }

  async function countBatchItems(ctx, input) {
    const where = [];
    const values = [];

    if (!input.batchId) {
      throw new Error('batchId is a mandatory input argument');
    }

    values.push(input.batchId);
    where.push(`bi.batch_id = $${values.length}`);

    const sql = `
      SELECT COUNT(*) AS total
      FROM job_new.batch_item bi
      WHERE ${where.join(' AND ')}
    `;
    return await serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.mapCountBatchItem
    );
  }

  return {
    insertBatch,
    insertBatchProcess,
    getBatch,
    getBatchProcesses,
    getBatchProcessItem,
    insertBatchItem,
    updateBatchProcess,
    getBatchItems,
    countBatchItems,
    batchStatus,
    batchProcessStatus
  };
};
