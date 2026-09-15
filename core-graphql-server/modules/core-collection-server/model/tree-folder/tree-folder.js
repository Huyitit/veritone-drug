var createModel = require('../util/create-model');
const _ = require('lodash');

var TreeFolder = createModel({
  // _postgresConfig: {
  // 	schemaName: 'folder',
  // 	tableName: 'folder',
  // 	fields: {
  // 		folder_id: 'folderId' // eslint-disable-line camelcase
  // 	},
  // 	primaryKey: 'folder_id'
  // },
  // String fields:
  treeFolderName: {
    dbKey: 'tree_folder_name',
    type: 'string',
    userEditable: true,
    required: true
  },
  treeFolderDescription: {
    dbKey: 'tree_folder_description',
    type: 'string',
    userEditable: true
  },
  treeFolderId: {
    dbKey: 'tree_folder_id',
    type: 'uuid'
  },
  userId: {
    dbKey: 'user_id',
    type: 'string'
  },
  parentTreeObjectId: {
    type: 'uuid',
    required: true
  },
  // Number fields:
  orderIndex: {
    dbKey: 'orderIndex',
    type: 'number'
  },
  organizationId: {
    dbKey: 'organization_id',
    type: 'string'
  },
  maxDepth: {
    dbKey: 'max_depth',
    type: 'number'
  },
  hasSubFolder: {
    dbKey: 'has_sub_folder',
    type: 'boolean'
  },
  treeObjectTypeId: {
    dbKey: 'tree_object_type_id',
    type: 'number'
  },
  treeObjectId: {
    dbKey: 'tree_object_id',
    type: 'uuid'
  }
  // Array fields:
  // children: {
  // 	type: 'array'
  // }
});
function convertBoolean(value, src, dst, dstField) {
  if (!_.isUndefined(value)) {
    value = parseInt(value);
    if (value >= 1) {
      value = true;
    } else {
      value = false;
    }
    dst[dstField] = value;
  }
}
module.exports = TreeFolder;
