var createModel = require('../util/create-model');
// Model used when verifying POST body request, not used when retruring data to the client
var TreeObjectUpdate = createModel({
  treeObjectId: {
    type: 'uuid',
    required: true
  },
  newParentTreeObjectId: {
    type: 'uuid'
  },
  newOrderIndex: {
    type: 'number'
  },
  prevParentTreeObjectId: {
    type: 'uuid'
  },
  prevOrderIndex: {
    type: 'number'
  },
  parentTreeObjectId: {
    type: 'uuid'
  },
  orderIndex: {
    type: 'number'
  },
  newTreeFolderName: {
    type: 'string'
  }
});
module.exports = TreeObjectUpdate;
