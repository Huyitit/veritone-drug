var createModel = require('../util/create-model');

var Collection = createModel({
  _postgresConfig: {
    schemaName: 'folder',
    tableName: 'folder',
    fields: {
      folder_id: 'folderId'  
    },
    primaryKey: 'folder_id'
  },
  // String fields:
  name: {
    dbKey: 'folder_name',
    type: 'string',
    userEditable: true
  },
  image: {
    dbKey: 'folder_image',
    type: 'string',
    userEditable: true
  },
  ownerUserId: {
    type: 'string'
  },
  // Number fields:
  folderId: {
    type: 'number'
  },
  folderDescription: {
    type: 'string',
    userEditable: true
  },
  folderTypeId: {
    type: 'number'
  },
  organizationId: {
    type: 'number'
  },
  itemCount: {
    type: 'number'
  },
  programCount: {
    type: 'number'
  },
  // Boolean fields:
  orgSharing: {
    type: 'boolean'
  },
  // Date fields:
  dateCreated: {
    type: 'date'
  }
});

module.exports = Collection;
