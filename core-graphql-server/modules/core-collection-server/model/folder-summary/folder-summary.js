const createModel = require('../util/create-model');
const _ = require('lodash');

//@TODO Validate an array of uuids
function stringToInt(value, src, dst, key) {
  if (_.isString(value)) {
    var parsed = parseInt(value, 10);
    if (!_.isNaN(parsed)) {
      value = parsed;
    }
  }
  dst[key] = !_.isUndefined(value) ? value : null;
}

var FolderSummary = createModel({
  //return
  treeObjectIds: {
    dbKey: 'tree_object_ids',
    type: '*'
  },
  childFolders: {
    dbKey: 'child_folders',
    type: 'number',
    convert: stringToInt
  },
  childNonFolderObjects: {
    dbKey: 'child_none_folder_objects',
    type: 'number',
    convert: stringToInt
  },
  treeObjectId: {
    dbKey: 'tree_object_id',
    type: 'uuid'
  },
  mentionCount: {
    dbKey: 'mention_count',
    type: 'string'
  }
});

module.exports = FolderSummary;
