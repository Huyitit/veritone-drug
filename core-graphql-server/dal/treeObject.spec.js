const chaiExpect = require('chai').expect;
const _ = require('lodash');
const fs = require('fs');
const moment = require('moment');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const id1 = '162c1638-4dd0-4dbb-88c7-0a1a5052f9de',
  id2 = '262c1638-4dd0-4dbb-88c7-0a1a5052f9de',
  id3 = '362c1638-4dd0-4dbb-88c7-0a1a5052f9de',
  id4 = '462c1638-4dd0-4dbb-88c7-0a1a5052f9de';

function expectFunction(obj, key) {
  chaiExpect(typeof obj[key]).to.equal('function');
}
// for testing VTN-19657
_.set(serviceContext, 'config.server.maxTreeItemOrderIndexUpdates', 10);

let dal;
async function expectThrow(fun, errName = 'invalid_input') {
  try {
    fun();
    expect.fail('no throw ' + errName);
  } catch (err) {
    chaiExpect(err.name).to.equal(errName);
  }
}

describe('treeObject.js', function () {
  beforeEach(() => {
    dal = require('./treeObject.js')(serviceContext);
  });
  describe('#require', function () {
    it('should have correct function exports', function () {
      chaiExpect(typeof dal).to.equal('object');
      chaiExpect(Object.keys(dal).length).to.equal(4);
      expectFunction(dal, 'insertTreeObject');
      expectFunction(dal, 'getTreeObject');
      expectFunction(dal, 'removeTreeObject');
    });
  });
  describe('#insertTreeObject', function () {
    it('should fail on missing treeObjectTypeId', async function () {
      try {
        await dal.insertTreeObject(mockUtil.makeContext(), {
          parentTreeObjectId: id1,
          orderIndex: 0,
          objectId: 'objid'
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });
    it('should fail on bad treeObjectTypeId', async function () {
      try {
        await dal.insertTreeObject(mockUtil.makeContext(), {
          parentTreeObjectId: id1,
          orderIndex: 0,
          objectId: 'objid',
          treeObjectTypeId: -1445
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });
    it('should fail on missing orderIndex', async function () {
      try {
        await dal.insertTreeObject(mockUtil.makeContext(), {
          parentTreeObjectId: 'not_a_uuid',
          objectId: 'objid',
          treeObjectTypeId: 1
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('not_found');
      }
    });
    it('should fail on bad orderIndex', async function () {
      try {
        await dal.insertTreeObject(mockUtil.makeContext(), {
          parentTreeObjectId: 'not_a_uuid',
          orderIndex: 'not a num',
          objectId: 'objid',
          treeObjectTypeId: 1
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('not_found');
      }
    });
    it('should fail on bad parentTreeObjectId', async function () {
      try {
        await dal.insertTreeObject(mockUtil.makeContext(), {
          parentTreeObjectId: 'not_a_uuid',
          orderIndex: 0,
          objectId: 'objid',
          treeObjectTypeId: 1
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('not_found');
      }
    });
    it('should fail on missing parentTreeObjectId', async function () {
      try {
        await dal.insertTreeObject(mockUtil.makeContext(), {
          orderIndex: 0,
          objectId: 'objid',
          treeObjectTypeId: 1
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });

    it('should insert normally', async function () {
      const now = moment().valueOf();
      // update to existing folder hierarchy
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: id2,
          order_index: 0
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: id3,
          order_index: 1
        }
      ]);

      // the new tree object
      serviceContext.dbConnections['media_platform'].write._push([
        {
          object_id: '123',
          tree_object_type_id:
            serviceContext.dal.folder.TREE_OBJECT_TYPE['FOLDER'],
          tree_object_id: id4,
          order_index: 0,
          creation_date: now,
          last_updated_date: now,
          tree_object_status: 1
        }
      ]);
      // the closure object
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          parent_tree_object_id: id1,
          child_tree_object_id: id4,
          depth: 2
        }
      ]);
      const res = await dal.insertTreeObject(mockUtil.makeContext(), {
        parentTreeObjectId: id1,
        orderIndex: 0,
        objectId: '123',
        treeObjectTypeId: serviceContext.dal.folder.TREE_OBJECT_TYPE['FOLDER']
      });
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(0);
    });

    it('should skip order index update on large folder', async function () {
      const now = moment().valueOf();
      // update to existing folder hierarchy
      const currentChildren = [];
      for (let i = 0; i < 11; i++) {
        currentChildren.push({ child_tree_object_id: id1 });
      }
      serviceContext.dbConnections['media_platform'].read._push(
        currentChildren
      );

      // the new tree object
      serviceContext.dbConnections['media_platform'].write._push([
        {
          object_id: '123',
          tree_object_type_id:
            serviceContext.dal.folder.TREE_OBJECT_TYPE['FOLDER'],
          tree_object_id: id4,
          order_index: 0,
          creation_date: now,
          last_updated_date: now,
          tree_object_status: 1
        }
      ]);
      // the closure object
      serviceContext.dbConnections['media_platform'].write._push([
        {
          parent_tree_object_id: id1,
          child_tree_object_id: id4,
          depth: 2
        }
      ]);
      const res = await dal.insertTreeObject(mockUtil.makeContext(), {
        parentTreeObjectId: id1,
        orderIndex: 0,
        objectId: '123',
        treeObjectTypeId: serviceContext.dal.folder.TREE_OBJECT_TYPE['FOLDER']
      });
      // check for warning message
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
    });

    it('should roll back on step 3 error', async function () {
      const now = moment().valueOf();
      // update to existing folder hierarchy
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: id2,
          order_index: 0
        },
        {
          tree_object_id: id3,
          order_index: 1
        }
      ]);
      // the new tree object
      serviceContext.dbConnections['media_platform'].write._push([
        {
          object_id: '123',
          tree_object_type_id:
            serviceContext.dal.folder.TREE_OBJECT_TYPE['FOLDER'],
          tree_object_id: id4,
          order_index: 0,
          creation_date: now,
          last_updated_date: now,
          tree_object_status: 1
        }
      ]);
      // the closure object
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        true,
        [],
        (sql, args) => false
      );
      // rollback SQL
      serviceContext.dbConnections['media_platform'].write._push([], true, [
        'order_index'
      ]);
      const numMessages = serviceContext.messageUtil._counter();
      try {
        await dal.insertTreeObject(mockUtil.makeContext(), {
          parentTreeObjectId: id1,
          orderIndex: 0,
          objectId: '123',
          treeObjectTypeId: serviceContext.dal.folder.TREE_OBJECT_TYPE['FOLDER']
        });
        expect.fail('no throw on fail');
      } catch (err) {
        chaiExpect(err.stack).to.include('check function failed');
      }
      // verify that a warning was NOT emitted -- no error on rollback
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(numMessages);
    });

    it('should roll back on step 3 error if no indexes updated', async function () {
      const now = moment().valueOf();
      // update to existing folder hierarchy
      serviceContext.dbConnections['media_platform'].write._push([]);
      // the new tree object
      serviceContext.dbConnections['media_platform'].write._push([
        {
          object_id: '123',
          tree_object_type_id:
            serviceContext.dal.folder.TREE_OBJECT_TYPE['FOLDER'],
          tree_object_id: id4,
          order_index: 0,
          creation_date: now,
          last_updated_date: now,
          tree_object_status: 1
        }
      ]);
      // the closure object
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        true,
        [],
        (sql, args) => false
      );
      // rollback SQL. should not have the clause that rolls back order index updates
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        true,
        [],
        (sql, args) => !sql.includes('order_index')
      );
      const numMessages = serviceContext.messageUtil._counter();
      try {
        await dal.insertTreeObject(mockUtil.makeContext(), {
          parentTreeObjectId: id1,
          orderIndex: 0,
          objectId: '123',
          treeObjectTypeId: serviceContext.dal.folder.TREE_OBJECT_TYPE['FOLDER']
        });
        expect.fail('no throw on fail');
      } catch (err) {
        chaiExpect(err.stack).to.include('check function failed');
      }
      // verify that a warning was NOT emitted -- no error on rollback
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(numMessages);
    });

    it('should handle rollback error gracefully', async function () {
      const now = moment().valueOf();
      // update to existing folder hierarchy
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: id2,
          order_index: 0
        },
        {
          tree_object_id: id3,
          order_index: 1
        }
      ]);
      // the new tree object
      serviceContext.dbConnections['media_platform'].write._push([
        {
          object_id: '123',
          tree_object_type_id:
            serviceContext.dal.folder.TREE_OBJECT_TYPE['FOLDER'],
          tree_object_id: id4,
          order_index: 0,
          creation_date: now,
          last_updated_date: now,
          tree_object_status: 1
        }
      ]);
      // gets a tree object to update
      serviceContext.dbConnections['media_platform'].read._push([
        { child_tree_object_id: '162c1638-4dd0-4dbb-88c7-0a1a5052f9de' }
      ]);
      // the closure object
      // check function forces an error.
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        true,
        [],
        (sql, args) => false
      );
      // rollback SQL -- force error here too
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        true,
        [],
        (sql, args) => false
      );
      const numMessages = serviceContext.messageUtil._counter();
      try {
        await dal.insertTreeObject(mockUtil.makeContext(), {
          parentTreeObjectId: id1,
          orderIndex: 0,
          objectId: '123',
          treeObjectTypeId: serviceContext.dal.folder.TREE_OBJECT_TYPE['FOLDER']
        });
        expect.fail('no throw on fail');
      } catch (err) {
        chaiExpect(err.stack).to.include('check function failed');
      }
      // verify that a warning was emitted
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(
        numMessages + 1
      );
      chaiExpect(
        serviceContext.messageUtil._messages()[numMessages].event
      ).to.equal('warning');
    });
  });

  describe('#getTreeObject', function () {
    it('should get tree object', async function () {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            parent_tree_object_id: id1,
            child_tree_object_id: id2,
            object_id: '123',
            parent_object_id: '234',
            id: id2
          }
        ],
        true,
        [],
        (sql, vars) => !sql.includes('OR t.tree_object_id')
      );
      const res = await dal.getTreeObject(mockUtil.makeContext(), '123');
      chaiExpect(res).to.exist;
      chaiExpect(res.objectId).to.equal('123');
      chaiExpect(res.parentTreeObjectId).to.equal(id1);
      chaiExpect(res.childTreeObjectId).to.equal(id2);
    });
    it('should get tree object by UUID', async function () {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            parent_tree_object_id: id1,
            child_tree_object_id: id2,
            object_id: '123',
            parent_object_id: '234',
            id: id2
          }
        ],
        true,
        [],
        (sql, vars) => sql.includes('OR t.tree_object_id')
      );
      const res = await dal.getTreeObject(mockUtil.makeContext(), id2);
      chaiExpect(res).to.exist;
      chaiExpect(res.objectId).to.equal('123');
      chaiExpect(res.parentTreeObjectId).to.equal(id1);
      chaiExpect(res.childTreeObjectId).to.equal(id2);
    });

    it('should get null for no tree object', async function () {
      serviceContext.dbConnections['media_platform'].read._push([]);
      const res = await dal.getTreeObject(mockUtil.makeContext(), '123', true);
      chaiExpect(res).to.be.null;
    });
    it('should throw for no tree object', async function () {
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        const res = await dal.getTreeObject(mockUtil.makeContext(), '123');
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_found');
      }
    });
  });
  describe('#removeTreeObject', function () {
    it('should error if tree object not sent', async function () {
      try {
        await dal.removeTreeObject(mockUtil.makeContext());
      } catch (err) {
        chaiExpect(_.toString(err)).to.contain('is required');
      }
    });
    it('should error if tree object.parentFolderId not sent', async function () {
      try {
        await dal.removeTreeObject(mockUtil.makeContext(), {
          treeObjectId: id1,
          orderIndex: 2
        });
      } catch (err) {
        chaiExpect(_.toString(err)).to.contain('are required');
      }
    });
    it('should error if tree object.orderIndex not sent', async function () {
      try {
        await dal.removeTreeObject(mockUtil.makeContext(), {
          treeObjectId: id1,
          parentFolderId: id2
        });
      } catch (err) {
        chaiExpect(_.toString(err)).to.contain('are required');
      }
    });
    it('should remove tree object', async function () {
      // update to other child order indexes
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: id3
        }
      ]);
      // get affected parent tree objects
      serviceContext.dbConnections['media_platform'].write._push([]);
      // update to the tree object to deactivate
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: id2,
          last_updated_date: moment().valueOf()
        }
      ]);
      const res = await dal.removeTreeObject(mockUtil.makeContext(), {
        parentTreeObjectId: id1,
        orderIndex: 1,
        treeObjectId: id2
      });
      chaiExpect(res).to.exist;
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(0);
    });

    it('should skip order index update on removing from large folder', async function () {
      // update to other child order indexes
      const currentChildren = [];
      for (let i = 0; i < 11; i++) {
        currentChildren.push({ child_tree_object_id: id1 });
      }
      serviceContext.dbConnections['media_platform'].read._push(
        currentChildren
      );
      // get affected parent tree objects
      serviceContext.dbConnections['media_platform'].write._push([]);
      // update to the tree object to deactivate
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: id2,
          last_updated_date: moment().valueOf()
        }
      ]);
      const res = await dal.removeTreeObject(mockUtil.makeContext(), {
        parentTreeObjectId: id1,
        orderIndex: 1,
        treeObjectId: id2
      });
      chaiExpect(res).to.exist;
      // check for warning message
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
    });

    it('should roll back error on step 2 with order index updates', async function () {
      // update to other child order indexes
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: id3
        }
      ]);
      // update to the tree object to deactivate. force an error with check function.
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        true,
        [],
        (sql, args) => false
      );
      // rollback query should include order_index update
      serviceContext.dbConnections['media_platform'].write._push([], true, [
        'order_index'
      ]);
      const numMessages = serviceContext.messageUtil._counter();
      try {
        await dal.removeTreeObject(mockUtil.makeContext(), {
          parentTreeObjectId: id1,
          orderIndex: 1,
          treeObjectId: id2
        });
      } catch (err) {
        chaiExpect(err.stack).to.include('check function failed');
      }
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(numMessages);
    });

    it('should handle error on step 2 with no order index updates', async function () {
      // update to other child order indexes
      serviceContext.dbConnections['media_platform'].write._push([]);
      // update to the tree object to deactivate. force an error with check function.
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        true,
        [],
        (sql, args) => false
      );
      // there shouldn't be a rollback query

      const numMessages = serviceContext.messageUtil._counter();
      try {
        await dal.removeTreeObject(mockUtil.makeContext(), {
          parentTreeObjectId: id1,
          orderIndex: 1,
          treeObjectId: id2
        });
      } catch (err) {
        chaiExpect(err.stack).to.include('check function failed');
      }
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(numMessages);
    });

    it('should gracefully handle rollback error', async function () {
      // update to other child order indexes
      serviceContext.dbConnections['media_platform'].read._push([
        { child_tree_object_id: id3 }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: id3
        }
      ]);
      // update to the tree object to deactivate. force an error with check function.
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        true,
        [],
        (sql, args) => false
      );
      // rollback query should error out
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        true,
        [],
        (sql, args) => false
      );
      const numMessages = serviceContext.messageUtil._counter();
      try {
        await dal.removeTreeObject(mockUtil.makeContext(), {
          parentTreeObjectId: id1,
          orderIndex: 1,
          treeObjectId: id2
        });
      } catch (err) {
        chaiExpect(err.stack).to.include('check function failed');
      }
      // verify rollback error warning emitted
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(
        numMessages + 1
      );
      chaiExpect(
        serviceContext.messageUtil._messages()[numMessages].event
      ).to.equal('warning');
    });
  });
});
