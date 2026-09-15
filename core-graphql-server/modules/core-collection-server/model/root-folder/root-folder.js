'use strict';

var _ = require('lodash');
var createModel = require('../util/create-model');
var embeddedModel = require('../util/embedded-model');
var FolderSummary = require('../folder-summary/folder-summary');
var folderSummaryConvert = require('../folder-summary/converter').convert;

var RootFolder = createModel({
  rootFolderId: {
    dbKey: 'root_folder_id',
    type: 'string',
    userEditable: true
  },
  treeObjectId: {
    type: 'string'
  },
  organizationId: {
    dbKey: 'organization_id',
    type: 'number',
    userEditable: true
  },
  folderSummaryObject: embeddedModel({
    model: FolderSummary,
    modelName: 'FolderSummary',
    userEditable: true,
    convert: function convertFolderSummary(value, src, dst) {
      folderSummaryConvert(src, dst);
    }
  }),
  rootFolderTypeId: {
    dbKey: 'root_folder_type_id',
    type: 'number',
    userEditable: true
  },
  // Number fields:
  userId: {
    dbKey: 'user_id',
    type: 'string'
  },
  maxDepth: {
    dbKey: 'max_depth',
    type: 'number'
  },
  hasSubFolder: {
    dbKey: 'has_sub_folder',
    type: 'boolean'
  }
});

module.exports = RootFolder;
