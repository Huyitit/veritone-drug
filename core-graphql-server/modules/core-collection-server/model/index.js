'use strict';

var _ = require('lodash');

module.exports = function configure(config) {
  if (!_.isObject(config)) {
    throw new Error('Missing config object');
  }

  return {
    Mention: require('./mention'),
    Comment: require('./comment'),
    Rating: require('./rating'),
    Collection: require('./collection'),
    CollectionBulkQuery: require('./collection-query/collection-bulk-query.js'),
    EmailOptions: require('./email'),
    Widget: require('./widget'),
    Folder: require('./tree-folder'),
    FolderSummary: require('./folder-summary/folder-summary.js'),
    RootFolder: require('./root-folder/root-folder.js'),
    TreeObjectUpdate: require('./tree-object-update/tree-object-update.js')
  };
};
