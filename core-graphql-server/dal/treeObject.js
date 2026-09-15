/*eslint no-undef: "error"*/
const { v4: uuidv4 } = require('uuid');
const _ = require('lodash');
const mapper = require('./mapper.js');
const validator = require('validator');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../util.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);
  const TREE_OBJECT_STATUS = {
    ACTIVE: 1,
    INACTIVE: 2
  };

  /**
   *
   * - parentTreeObjectId
   * - orderIndex
   * - objectId
   * - treeObjectTypeId
   */
  async function insertTreeObject(context, treeObject) {
    if (!treeObject)
      throw new errors.InvalidInput({ message: 'treeObject is required' });
    mainUtil.checkId(treeObject.parentTreeObjectId, false, false, true);
    const orderIndex = treeObject.orderIndex || 0;
    if (!_.isNumber(orderIndex))
      throw new errors.InvalidInput({
        message: 'treeObject.orderIndex is required and must be an integer',
        data: {
          input: treeObject
        }
      });
    if (!treeObject.objectId)
      throw new errors.InvalidInput({
        message: 'treeObject.objectId is required'
      });
    if (
      !treeObject.treeObjectTypeId ||
      !_.values(serviceContext.dal.folder.TREE_OBJECT_TYPE).includes(
        treeObject.treeObjectTypeId
      )
    ) {
      throw new errors.InvalidInput({
        message: `treeObject.treeObjectTypeId is required and must be valid (${treeObject.treeObjectTypeId})`
      });
    }

    const db = serviceContext.dbConnections['media_platform'].write;
    const rollbackSql = [];

    // updates order indices on existing objects
    // see note re: VTN-19657 in deleteTreeObject()
    const maxObjectsToUpdate = _.get(
      serviceContext,
      'config.server.maxTreeItemOrderIndexUpdates',
      100
    );
    const sql0 = `
SELECT child_tree_object_id
FROM tree_object_closure closure
WHERE closure.parent_tree_object_id = $1
AND depth = 1
LIMIT ${maxObjectsToUpdate + 1}
    `;
    let trIds = await serviceContext.dbConnections['media_platform'].read.map(
      sql0,
      [treeObject.parentTreeObjectId],
      (row) => row.child_tree_object_id
    );
    const sql1 = `
UPDATE tree_object
SET
  order_index = order_index + 1,
  last_updated_date = now()::timestamp with time zone
WHERE tree_object_id = $1
AND tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
AND order_index >= $2
RETURNING tree_object_id, order_index
    `;
    const res1 = [];

    if (trIds.length > maxObjectsToUpdate) {
      serviceContext.messageUtil.emitEvent({
        type: 'warning',
        message:
          'The parent folder, ' +
          treeObject.parentTreeObjectId +
          ', has too many child objects to update orderIndex.',
        errorName: 'folder_tree_num_children',
        data: {
          parentTreeObjectId: treeObject.parentTreeObjectId,
          maxChildObjectUpdate: maxObjectsToUpdate
        }
      });
      trIds = [];
    }
    for (let i = 0; i < trIds.length; i++) {
      const r = await serviceContext.dbConnections['media_platform'].write.map(
        sql1,
        [trIds[i], orderIndex],
        (row) => `'${row.tree_object_id}'`
      );
      res1.push(r);
    }
    // res stores the [tree_object_id, order_index] updates
    // to roll back we need to subtract 1 from each.

    // for rollback SQL. revert order index changes if there were any
    if (res1.length) {
      rollbackSql.push(`
  UPDATE tree_object
  SET order_index = order_index - 1
  WHERE tree_object_id IN (${res1.join(',')})
      `);
    }

    const newId = uuidv4();
    // inserts the tree object itself
    const args2 = [
      treeObject.objectId,
      treeObject.treeObjectTypeId,
      newId,
      treeObject.orderIndex
    ];
    const sql2 = `
INSERT INTO tree_object (
  object_id,
  tree_object_type_id,
  tree_object_id,
  order_index,
  creation_date,
  last_updated_date,
  tree_object_status
) VALUES (
  $1,
  $2,
  $3,
  $4,
  current_timestamp,
  current_timestamp,
  ${TREE_OBJECT_STATUS['ACTIVE']}
) RETURNING *
    `;
    let res2;
    try {
      res2 = await db.query(sql2, args2);
    } catch (err) {
      await rollback(rollbackSql, err);
      throw err;
    }
    rollbackSql.push(`
DELETE FROM tree_object WHERE tree_object_id = '${newId}'
    `);

    // creates tree object closure by inserting a new
    // row for the new tree object.
    // model requires a row for tree object as its own parent
    // with depth = 0. (uh, why?)
    const args3 = [newId, treeObject.parentTreeObjectId];
    const sql3 = `
INSERT INTO tree_object_closure (
  parent_tree_object_id,
  child_tree_object_id,
  depth
) VALUES (
  ($1),
  ($1),
  0
);
INSERT INTO tree_object_closure (
  parent_tree_object_id,
  child_tree_object_id,
  depth
) 
SELECT parent_tree_object_id, $1, depth + 1
  FROM tree_object_closure
  WHERE child_tree_object_id = $2;
    `;
    let res3;
    try {
      res3 = await db.query(sql3, args3);
    } catch (err) {
      await rollback(rollbackSql, err);
      throw err;
    }
    // rollback would need to delete the objects we just added
    rollbackSql.push(`
DELETE FROM tree_object_closure
WHERE child_tree_object_id = '${newId}';
    `);

    return treeObject;
  }

  async function rollback(sqlParts, err) {
    const sql = sqlParts.join(';\n');
    try {
      await serviceContext.dbConnections['media_platform'].write.query(sql, []);
    } catch (rollbackErr) {
      /* warn only */
      serviceContext.messageUtil.emitEvent({
        event: 'warning',
        message: 'folder CRUD rollback failed',
        data: {
          sql,
          rollbackError: rollbackErr.stack,
          originalError: err.stack
        }
      });
    }
  }

  /**
   * Removes a tree item object by setting it to inactive and
   * updating the order indexes of other children of the parent.
   * @param context the context
   * @param treeObject A tree object, in the format returned by getTreeObject().
   */
  async function removeTreeObject(context, treeObject) {
    if (!treeObject) throw new Error('treeObject is required'); // code bug.
    // caller should have already retrieved the tree object with getTreeObject.
    const parentTreeObjectId = treeObject.parentTreeObjectId;
    const orderIndex = treeObject.orderIndex;
    const treeObjectId = treeObject.treeObjectId;
    if (!(parentTreeObjectId && treeObjectId && _.isNumber(orderIndex))) {
      throw new Error(
        'parentTreeObjectId, treeObjectId, and orderIndex are required:  ' +
          JSON.stringify(treeObject)
      );
    }

    const rollbackSql = [];
    // update the order index of other items in the parent folder

    // VTN-19657
    // normally, adding or removing an object to a given parent folder
    // should update the orderIndex on every sibling object that comes
    // after the modified object.
    // however, on very large folders, this requires updating 1000s of
    // database rows. if done all at once, we risk deadlock if another
    // query attempts to modify the same folder at the same time.
    // if done separately, we have to loop over 1000s of queries, which
    // causes poor performance.
    // from a user perspective, orderIndex is meant to manually control
    // the order in which folder objects appear. It simply does not apply
    // a folder with 100s or 1000s of children.
    // so, if the current folder size exceeds the configured threshold,
    // we skip the orderIndex update.
    const maxObjectsToUpdate = _.get(
      serviceContext,
      'config.server.maxTreeItemOrderIndexUpdates',
      100
    );
    const sql0 = `
SELECT child_tree_object_id
FROM tree_object_closure closure
WHERE closure.parent_tree_object_id = $1
AND depth = 1
LIMIT ${maxObjectsToUpdate + 1}
    `;
    let tIds = await serviceContext.dbConnections['media_platform'].read.map(
      sql0,
      [parentTreeObjectId],
      (row) => row.child_tree_object_id
    );
    if (tIds.length > maxObjectsToUpdate) {
      serviceContext.messageUtil.emitEvent({
        type: 'warning',
        message:
          'The parent folder, ' +
          treeObject.parentTreeObjectId +
          ', has too many child objects to update orderIndex.',
        errorName: 'folder_tree_num_children',
        data: {
          parentTreeObjectId: treeObject.parentTreeObjectId,
          maxChildObjectUpdate: maxObjectsToUpdate
        }
      });
      tIds = [];
    }

    let res1 = [];
    const sql1 = `
UPDATE tree_object
SET
  order_index = order_index - 1,
  last_updated_date = now()::timestamp with time zone
WHERE tree_object_id = $1
AND tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
AND order_index >= $2
RETURNING tree_object_id
    `;
    for (let i = 0; i < tIds.length; i++) {
      const r = await serviceContext.dbConnections['media_platform'].write.map(
        sql1,
        [tIds[i], orderIndex],
        (row) => `'${row.tree_object_id}'`
      );
      res1.push(r);
    }
    if (res1.length) {
      rollbackSql.push(`
UPDATE tree_object SET order_index = order_index + 1 WHERE tree_object_id IN (${res1.join(
        ','
      )})
        `);
    }
    const sql2 = `
UPDATE tree_object
SET
  tree_object_status = ${TREE_OBJECT_STATUS['INACTIVE']},
  last_updated_date = now()::timestamp with time zone
WHERE tree_object_id = $1
RETURNING tree_object_id, last_updated_date
    `;
    let res2;
    try {
      res2 = await serviceContext.dbConnections[
        'media_platform'
      ].write.query(sql2, [treeObjectId]);
    } catch (err) {
      // if any order indexes were updated, roll them back
      if (res1.length) {
        await rollback([rollbackSql], err);
      }
      throw err;
    }
    return res2;
  }

  async function getTreeObject(
    context,
    objectId,
    notFoundOK,
    childType,
    parentObjectId
  ) {
    if (!objectId) throw new Error('objectId is required');
    // we'll allow a caller to provide the tree object ID OR the filed
    // object ID. however, the tree object ID must be a UUID.
    // if we have a string that's not a UUID, it's not a tree object ID
    // and we skip that clause to avoid a postgres type error.
    const tWhere = validator.isUUID(_.toString(objectId))
      ? `(t.object_id = $1 OR t.tree_object_id = $1)`
      : `t.object_id = $1`;
    const sql = `
SELECT
  t.tree_object_id,
  t.tree_object_id AS id,
  t.tree_object_type_id,
  t.object_id,
  t.order_index,
  t.creation_date,
  t.last_updated_date,
  t.tree_object_status,
  t.shared_with,
  c.parent_tree_object_id,
  p.object_id AS parent_object_id
FROM tree_object t
JOIN tree_object_closure c ON (c.child_tree_object_id = t.tree_object_id AND c.depth = 1)
JOIN tree_object p ON (c.parent_tree_object_id = p.tree_object_id)
WHERE ${tWhere} AND t.tree_object_status = $2
    `;
    const treeObjects = await serviceContext.dbConnections[
      'media_platform'
    ].read.map(
      sql,
      [_.toString(objectId), TREE_OBJECT_STATUS.ACTIVE],
      mapper.camelizeRootKeys
    );
    if (!treeObjects.length && !notFoundOK) {
      throw new errors.NotFound({
        message: 'The object was not filed in a folder',
        data: {
          objectId: objectId
        }
      });
    }
    if (!childType) {
      return treeObjects.length ? treeObjects[0] : null;
    }
    const treeObjectReprocess = treeObjects.filter(
      (treeObject) => treeObject.treeObjectTypeId === childType
    );

    if (childType === 'Application' && parentObjectId) {
      return treeObjects.find((obj) => obj.parentObjectId === parentObjectId);
    }

    return treeObjectReprocess.length ? treeObjectReprocess[0] : null;
  }

  async function getTreeObjectIds(objectIds) {
    if (!Array.isArray(objectIds)) {
      objectIds = [objectIds];
    }
    const uuidIds = objectIds.filter((o) => validator.isUUID(_.toString(o)));
    const sqlArgs = [objectIds];
    let sql = `
  SELECT
    t.object_id,
    t.tree_object_id
  FROM tree_object t
  WHERE t.tree_object_status = ${TREE_OBJECT_STATUS.ACTIVE}
  AND t.object_id = ANY($1)
  `;
    if (uuidIds.length) {
      sql += ` OR t.tree_object_id = ANY($2::uuid[]);`;
      sqlArgs.push(uuidIds);
    }

    const inputIds = new Set(objectIds);
    const treeObjects = await serviceContext.dbConnections[
      'media_platform'
    ].read.map(sql, sqlArgs, (row) =>
      _.set(
        {},
        inputIds.has(row.object_id) ? row.object_id : row.tree_object_id,
        row.tree_object_id
      )
    );
    if (treeObjects.length) {
      return _.assign({}, ...treeObjects);
    }
    return {};
  }

  return {
    insertTreeObject,
    getTreeObject,
    removeTreeObject,
    getTreeObjectIds
  };
};
